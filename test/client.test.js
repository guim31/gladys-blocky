// -----------------------------------------------------------------------------
// The Blocky client against the answers of a real Blocky v0.35.0: paths,
// methods, the pause query, and every kind of error.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BlockyClient, ERROR_KINDS, goDuration, safeLocation } from '../src/blocky/client.js';
import { FakeBlocky, fixture } from './helpers/fakeBlocky.js';

const URL = 'http://192.0.2.10:4000';

function client(server, options = {}) {
  return new BlockyClient({ url: URL, request: (url, o) => server.handle(url, o), ...options });
}

/** A request seam answering one canned response. */
const answering = (response) => async () => response;

test('status, metrics, pause, resume, refresh, flush: paths and methods', async () => {
  const server = new FakeBlocky();
  const blocky = client(server);
  assert.deepEqual(await blocky.getStatus(), { enabled: true });
  assert.match(await blocky.getMetrics(), /^# HELP blocky_blocking_enabled/);
  await blocky.disable(5, ['ads', 'kids']);
  await blocky.disable(0);
  await blocky.enable();
  await blocky.refreshLists();
  await blocky.flushCache();
  assert.deepEqual(
    server.requests.map((r) => [r.method, r.path, r.query]),
    [
      ['GET', '/api/blocking/status', {}],
      ['GET', '/metrics', {}],
      ['GET', '/api/blocking/disable', { duration: '5m', groups: 'ads,kids' }],
      ['GET', '/api/blocking/disable', {}],
      ['GET', '/api/blocking/enable', {}],
      ['POST', '/api/lists/refresh', {}],
      ['POST', '/api/cache/flush', {}],
    ],
  );
  assert.equal(goDuration(90), '90m');
});

test('Prometheus off: no metrics, no error', async () => {
  assert.equal(await client(new FakeBlocky({ metrics: false })).getMetrics(), null);
});

test('an unknown group is refused by Blocky with its name', async () => {
  const blocky = new BlockyClient({
    url: URL,
    request: answering({
      status: 400,
      headers: {},
      body: fixture('real/disable-unknown-group.txt'),
    }),
  });
  await assert.rejects(blocky.disable(5, ['nope']), {
    kind: ERROR_KINDS.UNKNOWN_GROUP,
    group: 'nope',
  });
});

test('every failure has a kind', async () => {
  const cases = [
    [{ status: 404, headers: {}, body: '404 page not found\n' }, ERROR_KINDS.NOT_BLOCKY],
    [{ status: 200, headers: {}, body: '<html>router</html>' }, ERROR_KINDS.NOT_BLOCKY],
    [{ status: 200, headers: {}, body: '{"enabled":"yes"}' }, ERROR_KINDS.NOT_BLOCKY],
    [{ status: 401, headers: {}, body: '' }, ERROR_KINDS.AUTH],
    [{ status: 502, headers: {}, body: 'Bad gateway' }, ERROR_KINDS.UNREACHABLE],
    [{ status: 405, headers: {}, body: '' }, ERROR_KINDS.HTTP],
    [
      { status: 301, headers: { location: 'https://user:pw@dns.example/x?y=1' }, body: '' },
      ERROR_KINDS.REDIRECT,
    ],
  ];
  for (const [response, kind] of cases) {
    const blocky = new BlockyClient({ url: URL, request: answering(response) });
    await assert.rejects(blocky.getStatus(), { kind }, `HTTP ${response.status}`);
  }
  const redirect = new BlockyClient({ url: URL, request: answering(cases.at(-1)[0]) });
  await assert.rejects(redirect.getStatus(), (err) => !err.message.includes('pw'));
  assert.equal(safeLocation('/login?next=1'), '/login');
  assert.equal(safeLocation(undefined), '?');

  for (const [code, kind] of [
    ['ECONNREFUSED', ERROR_KINDS.UNREACHABLE],
    ['ETIMEDOUT', ERROR_KINDS.UNREACHABLE],
    ['DEPTH_ZERO_SELF_SIGNED_CERT', ERROR_KINDS.TLS],
  ]) {
    const blocky = new BlockyClient({
      url: URL,
      request: async () => {
        const error = new Error(code);
        error.code = code;
        throw error;
      },
    });
    await assert.rejects(blocky.getStatus(), { kind }, code);
  }
  // A metrics failure other than a 404 is an error, not "Prometheus off".
  const proxy = new BlockyClient({ url: URL, request: answering({ status: 503, body: '' }) });
  await assert.rejects(proxy.getMetrics(), { kind: ERROR_KINDS.UNREACHABLE });
});

test('the self-signed option reaches the request', async () => {
  const server = new FakeBlocky();
  await client(server, { insecure: true }).getStatus();
  assert.equal(server.requests[0].insecure, true);
});
