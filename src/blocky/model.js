// -----------------------------------------------------------------------------
// Reading the Blocky answers into the plain values the integration uses.
// Pure functions (and one small window of samples), tested against answers of
// a real Blocky v0.35.0 (test/fixtures/blocky/real/).
// -----------------------------------------------------------------------------

/**
 * GET /api/blocking/status → `{ blocking, pauseEndsAt, disabledGroups }`.
 * `blocking` is 'enabled' or 'disabled' (also when only some groups are
 * paused: Blocky then answers `enabled: false` with those groups);
 * `pauseEndsAt` the instant (ms) a timed pause ends, null for "until enabled".
 * @param {object} data
 * @param {number} now
 */
export function parseStatus(data, now) {
  if (typeof data?.enabled !== 'boolean') {
    return { blocking: 'unknown', pauseEndsAt: null, disabledGroups: [] };
  }
  if (data.enabled) {
    return { blocking: 'enabled', pauseEndsAt: null, disabledGroups: [] };
  }
  const seconds = Number(data.autoEnableInSec);
  return {
    blocking: 'disabled',
    pauseEndsAt: Number.isFinite(seconds) && seconds > 0 ? now + seconds * 1000 : null,
    disabledGroups: Array.isArray(data.disabledGroups)
      ? data.disabledGroups.filter((group) => typeof group === 'string' && group)
      : [],
  };
}

const unescape = (value) => value.replace(/\\(["\\n])/g, (_, char) => (char === 'n' ? '\n' : char));

/**
 * Parse the Prometheus text format into `[{ name, labels, value }]`.
 * Comments, blank lines and malformed lines are skipped.
 * @param {string} text
 */
export function parsePrometheus(text) {
  const samples = [];
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const match = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{(.*)\})?\s+(\S+)/.exec(line);
    if (!match) {
      continue;
    }
    const value = Number(match[4]);
    if (Number.isNaN(value)) {
      continue;
    }
    const labels = {};
    for (const label of (match[3] ?? '').matchAll(
      /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g,
    )) {
      labels[label[1]] = unescape(label[2]);
    }
    samples.push({ name: match[1], labels, value });
  }
  return samples;
}

/**
 * The Blocky figures of a `/metrics` page. Counters are since Blocky started.
 * Older names (before the v0.24 renames) are read as a fallback.
 * @param {string} text
 */
export function parseMetrics(text) {
  const samples = parsePrometheus(text);
  const of = (...names) => samples.filter((sample) => names.includes(sample.name));
  const sum = (...names) => {
    const list = of(...names).filter((sample) => Number.isFinite(sample.value));
    return list.length ? list.reduce((total, sample) => total + sample.value, 0) : null;
  };
  const queries = sum('blocky_query_total');
  if (queries === null && !of('blocky_build_info', 'blocky_blocking_enabled').length) {
    return null; // a Prometheus page, but not Blocky's
  }
  const blockedSamples = of('blocky_response_total').filter(
    (sample) => sample.labels.response_type === 'BLOCKED',
  );
  const denylist = of(
    'blocky_denylist_cache_entries',
    'blocky_denylist_cache',
    'blocky_blacklist_cache',
  );
  const version = of('blocky_build_info')[0]?.labels.version ?? '';
  return {
    version: version.replace(/^v(?=\d)/, '') || null,
    queries: queries ?? 0,
    blocked: blockedSamples.reduce((total, sample) => total + sample.value, 0),
    cacheHits: sum('blocky_cache_hits_total', 'blocky_cache_hit_count'),
    cacheMisses: sum('blocky_cache_misses_total', 'blocky_cache_miss_count'),
    cacheEntries: sum('blocky_cache_entries', 'blocky_cache_entry_count'),
    denylistEntries: denylist.length
      ? denylist.reduce((total, sample) => total + sample.value, 0)
      : null,
    groups: [...new Set(denylist.map((sample) => sample.labels.group).filter(Boolean))].sort(),
  };
}

export const WINDOW_MS = 60 * 60_000;
const MIN_SPAN_MS = 10_000;

const COUNTERS = ['queries', 'blocked', 'cacheHits', 'cacheMisses'];

/**
 * The last hour of a server, from the counters Blocky keeps since it started:
 * the difference between the newest reading and the one an hour before.
 * Just after the integration (or Blocky) starts, the window is shorter:
 * `minutes` says how long it covers. A counter going down means Blocky
 * restarted: the window starts again.
 */
export class HourWindow {
  constructor(windowMs = WINDOW_MS) {
    this.windowMs = windowMs;
    this.samples = [];
  }

  /**
   * Add a reading; returns the figures of the window, null until two readings.
   * @param {number} at
   * @param {ReturnType<typeof parseMetrics>} metrics
   */
  add(at, metrics) {
    const sample = { at, ...Object.fromEntries(COUNTERS.map((key) => [key, metrics[key] ?? 0])) };
    const last = this.samples.at(-1);
    if (last && COUNTERS.some((key) => sample[key] < last[key])) {
      this.samples = [];
    }
    this.samples.push(sample);
    // Keep the newest reading that is at least an hour old as the base.
    while (this.samples.length > 2 && this.samples[1].at <= at - this.windowMs) {
      this.samples.shift();
    }
    return this.figures();
  }

  figures() {
    const base = this.samples[0];
    const newest = this.samples.at(-1);
    // Two readings close together (a scene action right after the timer)
    // would make a window of nothing.
    if (this.samples.length < 2 || newest.at - base.at < MIN_SPAN_MS) {
      return null;
    }
    const delta = (key) => Math.max(0, Math.round(newest[key] - base[key]));
    const queries = delta('queries');
    const blocked = Math.min(queries, delta('blocked'));
    const hits = delta('cacheHits');
    const lookups = hits + delta('cacheMisses');
    return {
      minutes: Math.min(60, Math.max(1, Math.round((newest.at - base.at) / 60_000))),
      queries,
      blocked,
      percentBlocked: queries > 0 ? (100 * blocked) / queries : 0,
      // Only the queries sent upstream go through the cache (not the blocked
      // or custom DNS ones): no lookup in the hour, no rate.
      cacheHitRate: lookups > 0 ? (100 * hits) / lookups : null,
    };
  }

  reset() {
    this.samples = [];
  }
}
