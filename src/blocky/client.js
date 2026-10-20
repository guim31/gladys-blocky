// -----------------------------------------------------------------------------
// Blocky REST API client (docs: https://0xerr0r.github.io/blocky/latest/,
// checked on a real Blocky v0.35.0, Docker image spx01/blocky).
//
// The API has no authentication: it listens on the HTTP port of Blocky
// (`ports.http`, often 4000), next to the Prometheus `/metrics` endpoint when
// `prometheus.enable` is true. Answers checked on the real server:
//   - GET /api/blocking/status → {"enabled":true} or
//     {"autoEnableInSec":299,"disabledGroups":["ads"],"enabled":false};
//   - GET /api/blocking/enable, GET /api/blocking/disable?duration=5m&groups=a,b
//     → 200 without body; POST is refused (405). A new disable replaces the
//     previous one (groups and timer); no duration (or 0) is "until enabled";
//   - an unknown group → 400 text/plain "group 'x' is unknown";
//   - POST /api/lists/refresh, POST /api/cache/flush → 200 without body;
//   - an unknown path → 404 text/plain (also /metrics when Prometheus is off).
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address or port, firewall
  TLS: 'tls', // the certificate does not verify (self-signed without the option)
  NOT_BLOCKY: 'not_blocky', // something answers, not the Blocky API
  REDIRECT: 'redirect', // the address redirects (usually HTTP to HTTPS)
  AUTH: 'auth', // a reverse proxy in front asks for credentials
  UNKNOWN_GROUP: 'unknown_group', // a pause names a group Blocky does not know
  HTTP: 'http', // any other error
});

export class BlockyError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs
   * @param {object} [extra] { status, group }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'BlockyError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

function networkError(err) {
  if (TLS_CODES.has(err.code)) {
    return new BlockyError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
  }
  return new BlockyError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
}

/** A redirect target fit for the logs: no user, password or query string. */
export function safeLocation(location) {
  if (typeof location !== 'string' || location === '') {
    return '?';
  }
  try {
    const url = new URL(location, 'http://relative.invalid');
    return url.host === 'relative.invalid' ? url.pathname : `${url.origin}${url.pathname}`;
  } catch {
    return '?';
  }
}

// Server messages are logged: keep them short and on one line.
const shortMessage = (text) =>
  typeof text === 'string' && text.trim()
    ? text.replace(/\s+/g, ' ').trim().slice(0, 160)
    : 'no message';

/** Blocky reads a pause length as a Go duration: whole minutes here. */
export const goDuration = (minutes) => `${minutes}m`;

export class BlockyClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, `http(s)://host[:port]`
   * @param {boolean} [options.insecure] accept a self-signed certificate
   * @param {typeof httpRequest} [options.request] test seam
   * @param {number} [options.timeoutMs]
   */
  constructor({ url, insecure = false, request = httpRequest, timeoutMs = 10_000 }) {
    this.url = url;
    this.insecure = insecure;
    this.request = request;
    this.timeoutMs = timeoutMs;
  }

  /**
   * One call. Resolves with the response of a 2xx answer.
   * @param {string} path e.g. `/api/blocking/status`
   * @param {object} [options] { method, query, accept }
   */
  async call(
    path,
    { method = 'GET', query = {}, accept = 'application/json', timeoutMs = this.timeoutMs } = {},
  ) {
    const search = new URLSearchParams(
      Object.entries(query).map(([key, value]) => [key, String(value)]),
    ).toString();
    let response;
    try {
      response = await this.request(`${this.url}${path}${search ? `?${search}` : ''}`, {
        method,
        headers: { accept },
        insecure: this.insecure,
        timeoutMs,
      });
    } catch (err) {
      throw networkError(err);
    }
    const { status } = response;
    if (status >= 200 && status < 300) {
      return response;
    }
    if (status >= 300 && status < 400) {
      throw new BlockyError(
        ERROR_KINDS.REDIRECT,
        `Redirected to ${safeLocation(response.headers?.location)}`,
        { status },
      );
    }
    if (status === 401 || status === 403) {
      throw new BlockyError(ERROR_KINDS.AUTH, `${path} answered HTTP ${status}`, { status });
    }
    if (status === 404) {
      throw new BlockyError(ERROR_KINDS.NOT_BLOCKY, `${path} not found (HTTP 404)`, { status });
    }
    // A 5xx is a reverse proxy whose Blocky is down (502, 503, 504): silence.
    if (status >= 500) {
      throw new BlockyError(ERROR_KINDS.UNREACHABLE, `${path} answered HTTP ${status}`, {
        status,
      });
    }
    const message = shortMessage(response.body);
    const unknownGroup = /^group '(.*)' is unknown$/.exec(message);
    if (status === 400 && unknownGroup) {
      throw new BlockyError(ERROR_KINDS.UNKNOWN_GROUP, `Unknown group ${unknownGroup[1]}`, {
        status,
        group: unknownGroup[1],
      });
    }
    throw new BlockyError(ERROR_KINDS.HTTP, `${path} answered HTTP ${status}: ${message}`, {
      status,
    });
  }

  /** GET /api/blocking/status → the parsed JSON object. */
  async getStatus() {
    const response = await this.call('/api/blocking/status');
    let data;
    try {
      data = JSON.parse(response.body);
    } catch {
      data = undefined;
    }
    if (!data || typeof data !== 'object' || typeof data.enabled !== 'boolean') {
      // A web server answering 200 on every path (a SPA, a captive portal).
      throw new BlockyError(
        ERROR_KINDS.NOT_BLOCKY,
        '/api/blocking/status did not answer the Blocky JSON',
        { status: response.status },
      );
    }
    return data;
  }

  /**
   * GET /metrics → the Prometheus text, null when Prometheus is off (404).
   * Blocky sends nothing else at this path.
   */
  async getMetrics() {
    try {
      const response = await this.call('/metrics', { accept: 'text/plain' });
      return response.body;
    } catch (err) {
      if (err.kind === ERROR_KINDS.NOT_BLOCKY) {
        return null;
      }
      throw err;
    }
  }

  /** Blocking on (also ends a pause). */
  async enable() {
    await this.call('/api/blocking/enable');
  }

  /**
   * Blocking off: for `minutes` (0: until enabled), on the given groups
   * (empty: all of them).
   * @param {number} minutes
   * @param {string[]} [groups]
   */
  async disable(minutes, groups = []) {
    const query = {};
    if (minutes > 0) {
      query.duration = goDuration(minutes);
    }
    if (groups.length) {
      query.groups = groups.join(',');
    }
    await this.call('/api/blocking/disable', { query });
  }

  /**
   * Downloads the allow and deny lists again. Blocky answers once they are
   * loaded: big lists take a while (the scene action allows 120 s).
   */
  async refreshLists() {
    await this.call('/api/lists/refresh', { method: 'POST', timeoutMs: 110_000 });
  }

  /** Empties the DNS cache. */
  async flushCache() {
    await this.call('/api/cache/flush', { method: 'POST' });
  }
}
