// -----------------------------------------------------------------------------
// Reading the answers of a real Blocky v0.35.0 (test/fixtures/blocky/real/,
// client address anonymized), and the window of the last hour.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HourWindow, parseMetrics, parsePrometheus, parseStatus } from '../src/blocky/model.js';
import { fixture } from './helpers/fakeBlocky.js';

const NOW = Date.UTC(2026, 9, 20, 18, 0, 0);
const json = (name) => JSON.parse(fixture(`real/${name}.json`));

test('blocking status: on, paused for a time, some groups, off until enabled', () => {
  assert.deepEqual(parseStatus(json('status-enabled'), NOW), {
    blocking: 'enabled',
    pauseEndsAt: null,
    disabledGroups: [],
  });
  assert.deepEqual(parseStatus(json('status-paused'), NOW), {
    blocking: 'disabled',
    pauseEndsAt: NOW + 599_000,
    disabledGroups: ['ads', 'default', 'kids'],
  });
  assert.deepEqual(parseStatus(json('status-paused-group'), NOW), {
    blocking: 'disabled',
    pauseEndsAt: NOW + 299_000,
    disabledGroups: ['ads'],
  });
  assert.deepEqual(parseStatus(json('status-disabled'), NOW), {
    blocking: 'disabled',
    pauseEndsAt: null,
    disabledGroups: ['ads', 'default', 'kids'],
  });
  assert.equal(parseStatus({}, NOW).blocking, 'unknown');
  assert.equal(parseStatus(null, NOW).blocking, 'unknown');
});

test('the Prometheus page of a real Blocky', () => {
  assert.deepEqual(parseMetrics(fixture('real/metrics.txt')), {
    version: '0.35.0',
    queries: 26,
    blocked: 13,
    cacheHits: 2,
    cacheMisses: 4,
    cacheEntries: 4,
    denylistEntries: 4,
    groups: ['ads', 'kids'],
  });
});

test('the Prometheus text format: labels with escapes, comments, odd lines', () => {
  const samples = parsePrometheus(
    [
      '# HELP x y',
      'a_total{reason="say \\"hi\\"",b="c,d"} 3',
      'b 1.792522014e+09',
      'c{} NaN',
      'not a sample',
      '',
      'd 4 1700000000000',
    ].join('\n'),
  );
  assert.deepEqual(samples, [
    { name: 'a_total', labels: { reason: 'say "hi"', b: 'c,d' }, value: 3 },
    { name: 'b', labels: {}, value: 1.792522014e9 },
    { name: 'd', labels: {}, value: 4 },
  ]);
});

test('older metric names are read too; a page that is not Blocky is not', () => {
  const old = parseMetrics(
    [
      'blocky_query_total{client="x",type="A"} 10',
      'blocky_cache_hit_count 3',
      'blocky_cache_miss_count 1',
      'blocky_blacklist_cache{group="ads"} 7',
    ].join('\n'),
  );
  assert.equal(old.cacheHits, 3);
  assert.equal(old.cacheMisses, 1);
  assert.equal(old.denylistEntries, 7);
  assert.equal(old.version, null);
  assert.equal(parseMetrics('node_cpu_seconds_total 1\n'), null);
  // Prometheus on, nothing asked yet: no query counter at all.
  assert.equal(parseMetrics('blocky_blocking_enabled 1\n').queries, 0);
});

test('the window: two readings, then an hour that slides; a restart starts over', () => {
  const window = new HourWindow();
  const at = (minutes) => NOW + minutes * 60_000;
  const reading = (queries, blocked, cacheHits = 0, cacheMisses = 0) => ({
    queries,
    blocked,
    cacheHits,
    cacheMisses,
  });
  assert.equal(window.add(at(0), reading(100, 10)), null);
  assert.equal(window.add(at(0.1), reading(101, 10)), null, 'too close together');
  assert.deepEqual(window.add(at(1), reading(200, 30, 6, 2)), {
    minutes: 1,
    queries: 100,
    blocked: 20,
    percentBlocked: 20,
    cacheHitRate: 75,
  });
  for (let minute = 2; minute <= 90; minute += 1) {
    window.add(at(minute), reading(200 + minute * 10, 30 + minute));
  }
  const figures = window.figures();
  assert.equal(figures.minutes, 60);
  assert.equal(figures.queries, 600);
  assert.equal(figures.blocked, 60);
  assert.equal(figures.cacheHitRate, null, 'no cache lookup in the hour');

  assert.equal(window.add(at(91), reading(5, 1)), null, 'Blocky restarted');
  assert.equal(window.add(at(92), reading(15, 2)).queries, 10);
});
