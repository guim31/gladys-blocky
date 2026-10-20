// -----------------------------------------------------------------------------
// In-memory Blocky servers behind the `request` seam of the client
// (src/blocky/http.js). Answers follow the ones of a real Blocky v0.35.0
// (test/fixtures/blocky/real/): the blocking status with its timed pause and
// groups, a new pause replacing the previous one, an unknown group refused
// with a 400, the methods each path accepts, the Prometheus page (or a 404
// when Prometheus is off), a server that does not answer.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const fixture = (name) =>
  readFileSync(new URL(`../fixtures/blocky/${name}`, import.meta.url), 'utf8');

const empty = (status = 200) => ({ status, headers: {}, body: '' });
const text = (status, body) => ({ status, headers: { 'content-type': 'text/plain' }, body });

// Groups of the denylists (config.yml), as in the real test configuration.
export const GROUPS = { ads: 3, kids: 1 };

export class FakeBlocky {
  /**
   * @param {object} [options]
   * @param {boolean} [options.metrics] Prometheus endpoint on
   * @param {object} [options.growth] counters added at each /metrics read
   * @param {'blocky'|'other'} [options.kind]
   * @param {() => number} [options.now] clock for the pause
   */
  constructor({ metrics = true, growth = null, kind = 'blocky', now = () => Date.now() } = {}) {
    this.metrics = metrics;
    this.growth = growth;
    this.kind = kind;
    this.now = now;
    this.online = true;
    this.version = 'v0.35.0';
    this.groups = { ...GROUPS };
    this.counters = { queries: 26, blocked: 13, hits: 2, misses: 4 };
    this.disabledGroups = null; // null: blocking on
    this.pauseEnd = null; // blocking comes back at this instant
    this.refreshes = 0;
    this.flushes = 0;
    this.requests = [];
  }

  /** Queries answered by the server (some blocked, some from the cache). */
  traffic({ queries = 0, blocked = 0, hits = 0, misses = 0 } = {}) {
    this.counters.queries += queries;
    this.counters.blocked += blocked;
    this.counters.hits += hits;
    this.counters.misses += misses;
  }

  /** Blocky restarted: its counters start again from 0. */
  restart() {
    this.counters = { queries: 0, blocked: 0, hits: 0, misses: 0 };
  }

  /** Blocking changed from elsewhere (the blocky CLI, another tool). */
  disable(minutes = 0, groups = []) {
    // Without groups, Blocky lists every group, plus "default".
    this.disabledGroups = groups.length ? groups : [...Object.keys(this.groups), 'default'].sort();
    this.pauseEnd = minutes > 0 ? this.now() + minutes * 60_000 : null;
  }

  enable() {
    this.disabledGroups = null;
    this.pauseEnd = null;
  }

  status() {
    if (this.pauseEnd !== null && this.now() >= this.pauseEnd) {
      this.enable();
    }
    if (this.disabledGroups === null) {
      return { enabled: true };
    }
    const status = { disabledGroups: this.disabledGroups, enabled: false };
    if (this.pauseEnd !== null) {
      status.autoEnableInSec = Math.floor((this.pauseEnd - this.now()) / 1000);
    }
    return status;
  }

  metricsPage() {
    if (this.growth) {
      this.traffic(this.growth);
    }
    const { queries, blocked, hits, misses } = this.counters;
    const lines = [
      '# HELP blocky_blocking_enabled Blocking status',
      '# TYPE blocky_blocking_enabled gauge',
      `blocky_blocking_enabled ${this.disabledGroups === null ? 1 : 0}`,
      `blocky_build_info{build_time="20260905-163623",version="${this.version}"} 1`,
      'blocky_cache_entries 4',
      `blocky_cache_hits_total ${hits}`,
      `blocky_cache_misses_total ${misses}`,
      ...Object.entries(this.groups).map(
        ([group, size]) => `blocky_denylist_cache_entries{group="${group}"} ${size}`,
      ),
      `blocky_query_total{client="192.0.2.50",type="A"} ${queries - 3}`,
      'blocky_query_total{client="192.0.2.50",type="AAAA"} 3',
      `blocky_response_total{reason="BLOCKED (ads)",response_code="NOERROR",response_type="BLOCKED"} ${blocked}`,
      `blocky_response_total{reason="RESOLVED (tcp+udp:9.9.9.9)",response_code="NOERROR",response_type="RESOLVED"} ${queries - blocked}`,
    ];
    return `${lines.join('\n')}\n`;
  }

  /** The `request` function given to the client. */
  handle(url, { method = 'GET', insecure } = {}) {
    const { pathname, searchParams } = new URL(url);
    this.requests.push({
      method,
      path: pathname,
      query: Object.fromEntries(searchParams),
      insecure,
    });
    if (!this.online) {
      const error = new Error('connect ECONNREFUSED');
      error.code = 'ECONNREFUSED';
      throw error;
    }
    if (this.kind === 'other') {
      return text(404, '404 page not found\n');
    }
    const only = (allowed, answer) =>
      method === allowed ? answer() : { status: 405, headers: { allow: allowed }, body: '' };
    switch (pathname) {
      case '/api/blocking/status':
        return only('GET', () => ({
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(this.status()),
        }));
      case '/api/blocking/enable':
        return only('GET', () => {
          this.enable();
          return empty();
        });
      case '/api/blocking/disable':
        return only('GET', () => {
          const groups = (searchParams.get('groups') ?? '').split(',').filter(Boolean);
          const unknown = groups.find((group) => !(group in this.groups));
          if (unknown !== undefined) {
            return text(400, `group '${unknown}' is unknown`);
          }
          const duration = searchParams.get('duration') ?? '';
          const match = /^(\d+)m$/.exec(duration);
          if (duration && !match) {
            return text(400, `time: invalid duration "${duration}"`);
          }
          this.disable(match ? Number(match[1]) : 0, groups);
          return empty();
        });
      case '/api/lists/refresh':
        return only('POST', () => {
          this.refreshes += 1;
          return empty();
        });
      case '/api/cache/flush':
        return only('POST', () => {
          this.flushes += 1;
          return empty();
        });
      case '/metrics':
        if (!this.metrics) {
          return text(404, '404 page not found\n');
        }
        return { status: 200, headers: { 'content-type': 'text/plain' }, body: this.metricsPage() };
      default:
        return text(404, '404 page not found\n');
    }
  }
}

/**
 * A network of fake servers, by base URL: the `request` seam of the hub.
 * An address without a server does not answer.
 */
export function createNetwork(servers = {}) {
  const byOrigin = new Map(Object.entries(servers));
  return {
    servers: byOrigin,
    async request(url, options) {
      const server = byOrigin.get(new URL(url).origin);
      if (!server) {
        const error = new Error('connect EHOSTUNREACH');
        error.code = 'EHOSTUNREACH';
        throw error;
      }
      return server.handle(url, options);
    },
  };
}
