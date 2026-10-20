// -----------------------------------------------------------------------------
// The hub, end to end: the SDK's fake Gladys on one side, in-memory Blocky
// servers on the other, a manual clock. Devices, states, transitions and
// their scene events, commands, reconfiguration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORIGINS, TRIGGERS, WIDGET_KEY, parseGroups, parseMinutes } from '../src/hub.js';
import {
  FakeBlocky,
  URL_1,
  URL_2,
  createAll,
  createClock,
  createWorld,
  deviceId,
  featureId,
  warmUp,
} from './helpers/world.js';

const TWO_SERVERS = {
  server_1_url: URL_1,
  server_1_name: 'Primary',
  server_2_url: URL_2,
  server_2_name: 'Secondary',
  language: 'en',
};

async function world(t, options = {}) {
  const clock = options.clock ?? createClock();
  const servers = options.servers ?? { [URL_1]: new FakeBlocky({ now: clock.now }) };
  const result = await createWorld({ ...options, clock, servers });
  t.after(() => result.app.stop());
  return { ...result, server: servers[URL_1], servers };
}

const events = (w, key) => w.fake.sceneEvents.filter((event) => event.key === key);
const blockingOf = (device) => device.features.find((f) => f.external_id.endsWith(':blocking'));
const state = (w, key, slot = 1) => w.fake.lastState(featureId(w.gladys, key, slot));

test('one device per configured server, with its states, status and transport', async (t) => {
  const w = await world(t);
  const [device] = w.fake.discoveredDevices;
  assert.equal(device.name, 'Blocky');
  assert.equal(device.external_id, deviceId(w.gladys));
  assert.equal(device.should_poll, false);
  assert.equal(device.poll_frequency, undefined);
  assert.deepEqual(device.params, [{ name: 'BLOCKY_URL', value: URL_1 }]);
  assert.equal(device.features.length, 7);
  assert.equal(state(w, 'blocking'), 1);
  assert.equal(state(w, 'blocked_domains'), 4);
  assert.equal(state(w, 'version'), '0.35.0');
  // One reading: no hour yet.
  assert.equal(state(w, 'queries_last_hour'), undefined);

  await warmUp(w);
  assert.equal(state(w, 'queries_last_hour'), 120);
  assert.equal(state(w, 'blocked_last_hour'), 30);
  assert.equal(state(w, 'blocked_percent_last_hour'), 25);
  assert.equal(state(w, 'cache_hit_rate'), 44);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  assert.deepEqual(w.fake.transports, [
    { device_external_id: deviceId(w.gladys), transport: 'local' },
  ]);
});

test('the hour slides: the counters of an hour ago are the base', async (t) => {
  const w = await world(t);
  for (let minute = 1; minute <= 90; minute += 1) {
    w.clock.advance(60_000);
    w.server.traffic({ queries: 10, blocked: minute <= 30 ? 5 : 1, hits: 1, misses: 1 });
    await w.hub.pollAll();
  }
  assert.equal(state(w, 'queries_last_hour'), 600);
  assert.equal(state(w, 'blocked_last_hour'), 60);
  assert.equal(state(w, 'blocked_percent_last_hour'), 10);
  assert.equal(w.hub.records.get(1).snapshot.hour.minutes, 60);
  assert.ok(w.hub.records.get(1).window.samples.length <= 62, 'old readings are dropped');
});

test('Blocky restarted: its counters start again, no negative figures', async (t) => {
  const w = await world(t);
  await warmUp(w);
  w.server.restart();
  w.clock.advance(60_000);
  await w.hub.pollAll();
  assert.equal(state(w, 'queries_last_hour'), 120, 'kept until a new hour can be computed');
  w.clock.advance(60_000);
  w.server.traffic({ queries: 7, blocked: 1 });
  await w.hub.pollAll();
  assert.equal(state(w, 'queries_last_hour'), 7);
});

test('after an outage, the last hour starts again instead of spanning it', async (t) => {
  const w = await world(t);
  await warmUp(w);
  w.server.online = false;
  await w.hub.pollAll();
  w.clock.advance(3 * 60 * 60_000);
  w.server.traffic({ queries: 5000 });
  w.server.online = true;
  await w.hub.pollAll();
  assert.equal(w.hub.records.get(1).snapshot.hour, null, 'one reading since the outage');
  w.clock.advance(60_000);
  w.server.traffic({ queries: 12 });
  await w.hub.pollAll();
  assert.equal(state(w, 'queries_last_hour'), 12);
});

test('the last second of a pause, reported without time left, still ends as a pause', async (t) => {
  const w = await world(t);
  w.server.disable(1);
  await w.hub.pollAll();
  w.clock.advance(59_500);
  await w.hub.pollAll();
  assert.ok(w.hub.records.get(1).snapshot.pauseEndsAt, 'the end is kept');
  w.clock.advance(1_000);
  await w.hub.pollAll();
  assert.equal(events(w, TRIGGERS.RESUMED).at(-1).data.origin, ORIGINS.TIMER);
});

test('the length of an outage survives another error in the middle', async (t) => {
  const w = await world(t);
  w.server.online = false;
  await w.hub.pollAll();
  w.clock.advance(15_000);
  await w.hub.pollAll();
  w.clock.advance(5 * 60_000);
  w.server.online = true;
  w.server.kind = 'other';
  await w.hub.pollAll();
  w.server.kind = 'blocky';
  w.server.online = false;
  w.clock.advance(60_000);
  await w.hub.pollAll();
  w.server.online = true;
  await w.hub.pollAll();
  assert.equal(events(w, TRIGGERS.RECOVERED).at(-1).data.down_minutes, 6);
});

test('a server without name is named after its address', async (t) => {
  const w = await world(t, { config: { server_1_url: '192.0.2.10' } });
  assert.equal(w.fake.discoveredDevices[0].name, 'Blocky 192.0.2.10:4000');
});

test('without Prometheus: the switch only, and the statistics once it is on', async (t) => {
  const clock = createClock();
  const server = new FakeBlocky({ now: clock.now, metrics: false });
  const w = await world(t, { clock, servers: { [URL_1]: server } });
  assert.deepEqual(
    w.fake.discoveredDevices[0].features.map((f) => f.external_id),
    [featureId(w.gladys, 'blocking')],
  );
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  const ack = await w.fake.sceneAction('read_statistics', {});
  assert.equal(ack.error, 'No statistics: turn on prometheus in the Blocky configuration.');

  server.metrics = true;
  await w.hub.pollAll();
  assert.equal(w.fake.discoveredDevices[0].features.length, 7, 'published again');
  const tooSoon = await w.fake.sceneAction('read_statistics', {});
  assert.equal(tooSoon.error, 'Statistics not ready yet: try again after the next reading.');
});

test('a passing metrics error keeps the features and the last figures', async (t) => {
  const w = await world(t);
  await warmUp(w);
  const published = w.fake.discoveredDevices;
  const original = w.server.handle.bind(w.server);
  w.server.handle = (url, options) =>
    url.endsWith('/metrics') ? { status: 502, headers: {}, body: '' } : original(url, options);
  await w.hub.pollAll();
  assert.equal(w.fake.discoveredDevices, published, 'not published again');
  assert.equal(state(w, 'queries_last_hour'), 120);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('only the changes are published, everything again when a device is added', async (t) => {
  const w = await world(t);
  await warmUp(w);
  const before = w.fake.states.length;
  w.clock.advance(30_000);
  await w.hub.pollAll();
  assert.equal(w.fake.states.length, before, 'nothing changed, nothing sent');

  w.server.traffic({ queries: 10 });
  w.clock.advance(30_000);
  await w.hub.pollAll();
  assert.deepEqual(
    w.fake.states.slice(before).map((s) => s.device_feature_external_id),
    [featureId(w.gladys, 'queries_last_hour'), featureId(w.gladys, 'blocked_percent_last_hour')],
  );

  const sent = w.fake.states.length;
  const refreshes = w.fake.widgetRefreshes.length;
  await createAll(w);
  assert.equal(w.fake.states.length - sent, 7, 'every feature again');
  assert.equal(w.fake.widgetRefreshes.length, refreshes + 1);
  assert.equal(w.fake.widgetRefreshes.at(-1), WIDGET_KEY);
});

test('an unchanged value is published again after the heartbeat', async (t) => {
  const w = await world(t, { timings: { heartbeatMs: 1000 } });
  const before = w.fake.states.length;
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await w.hub.pollAll();
  assert.equal(w.fake.states.length - before, 3, 'blocking, blocked domains, version');
});

test('the switch pauses the blocking for the configured time and resumes it', async (t) => {
  const w = await world(t, { config: { server_1_url: URL_1, switch_off_minutes: '15' } });
  await createAll(w);
  const [device] = w.fake.devices;
  const feature = blockingOf(device);

  assert.equal((await w.fake.setValue(device, feature, 0)).success, true);
  const disable = w.server.requests.find((r) => r.path === '/api/blocking/disable');
  assert.deepEqual(disable.query, { duration: '15m' });
  assert.equal(disable.method, 'GET');
  assert.equal(w.fake.lastState(feature.external_id), 0);
  assert.deepEqual(events(w, TRIGGERS.PAUSED).at(-1).data, {
    device: device.external_id,
    server: 'Blocky 192.0.2.10:4000',
    origin: ORIGINS.GLADYS,
    duration_minutes: 15,
    groups: 'ads, default, kids',
  });
  assert.equal(w.hub.pauseMinutesLeft(w.hub.records.get(1)), 15);

  assert.equal((await w.fake.setValue(device, feature, 1)).success, true);
  assert.equal(w.server.requests.at(-1).path, '/api/blocking/enable');
  assert.equal(w.server.pauseEnd, null, 'the pause is cancelled');
  assert.equal(w.fake.lastState(feature.external_id), 1);
  assert.equal(events(w, TRIGGERS.RESUMED).at(-1).data.origin, ORIGINS.GLADYS);

  // A read-only feature cannot be controlled.
  const counter = device.features.find((f) => f.external_id.endsWith(':blocked_domains'));
  assert.equal((await w.fake.setValue(device, counter, 1)).success, false);
});

test('turned off until turned back on: no duration, which ends a running pause', async (t) => {
  const w = await world(t, { config: { server_1_url: URL_1, switch_off_minutes: '0' } });
  await createAll(w);
  w.server.disable(30);
  await w.hub.pollAll();
  const [device] = w.fake.devices;
  await w.fake.setValue(device, blockingOf(device), 0);
  const disable = w.server.requests.filter((r) => r.path === '/api/blocking/disable').at(-1);
  assert.deepEqual(disable.query, {});
  assert.equal(w.server.pauseEnd, null, 'Blocky replaces the pause');
  assert.equal(events(w, TRIGGERS.PAUSED).length, 1, 'already off: no second event');
  assert.equal(w.hub.pauseMinutesLeft(w.hub.records.get(1)), null);
});

test('a pause made outside Gladys is seen, and its automatic end', async (t) => {
  const w = await world(t);
  w.clock.advance(60_000);
  w.server.disable(5, ['ads']);
  await w.hub.pollAll();
  assert.deepEqual(events(w, TRIGGERS.PAUSED).at(-1).data, {
    device: deviceId(w.gladys),
    server: 'Blocky',
    origin: ORIGINS.BLOCKY,
    duration_minutes: 5,
    groups: 'ads',
  });
  assert.equal(state(w, 'blocking'), 0);

  w.clock.advance(301_000);
  await w.hub.pollAll();
  assert.deepEqual(events(w, TRIGGERS.RESUMED).at(-1).data, {
    device: deviceId(w.gladys),
    server: 'Blocky',
    origin: ORIGINS.TIMER,
    paused_minutes: 5,
  });
  assert.equal(state(w, 'blocking'), 1);
});

test('blocking turned back on outside Gladys before the end of the pause', async (t) => {
  const w = await world(t);
  w.server.disable(30);
  await w.hub.pollAll();
  w.clock.advance(120_000);
  w.server.enable();
  await w.hub.pollAll();
  assert.deepEqual(
    events(w, TRIGGERS.RESUMED).map((event) => [event.data.origin, event.data.paused_minutes]),
    [[ORIGINS.BLOCKY, 2]],
  );
});

test('a server already off at start fires nothing', async (t) => {
  const clock = createClock();
  const server = new FakeBlocky({ now: clock.now });
  server.disable();
  const w = await world(t, { clock, servers: { [URL_1]: server } });
  assert.deepEqual(w.fake.sceneEvents, []);
  assert.equal(state(w, 'blocking'), 0);
  // Turned on later: off for an unknown time.
  server.enable();
  await w.hub.pollAll();
  assert.equal(events(w, TRIGGERS.RESUMED)[0].data.paused_minutes, 0);
});

test('a server that stops answering: down after two reads, once, then back', async (t) => {
  const w = await world(t);
  w.server.online = false;
  await w.hub.pollAll();
  assert.deepEqual(events(w, TRIGGERS.UNREACHABLE), [], 'one failure is a blip');
  assert.equal(w.fake.transports.at(-1).transport, 'unreachable');
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.fr, /^Blocky : ne répond pas$/);

  w.clock.advance(15_000);
  await w.hub.pollAll();
  w.clock.advance(60_000);
  await w.hub.pollAll();
  assert.deepEqual(
    events(w, TRIGGERS.UNREACHABLE).map((event) => event.data),
    [{ device: deviceId(w.gladys), server: 'Blocky', error: 'does not answer' }],
  );

  w.server.online = true;
  await w.hub.pollAll();
  assert.deepEqual(
    events(w, TRIGGERS.RECOVERED).map((event) => event.data),
    [{ device: deviceId(w.gladys), server: 'Blocky', down_minutes: 1 }],
  );
  assert.equal(w.fake.transports.at(-1).transport, 'local');
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('something else at the address is reported, not counted as an outage', async (t) => {
  const clock = createClock();
  const server = new FakeBlocky({ now: clock.now, kind: 'other' });
  const w = await world(t, {
    clock,
    servers: { [URL_1]: server },
    config: { server_1_url: URL_1, language: 'de' },
  });
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.deepEqual(w.fake.sceneEvents, []);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.equal(
    w.fake.connectionStatus.message.en,
    'Blocky 192.0.2.10:4000: no Blocky API at this address (HTTP port, 4000?)',
  );
  assert.equal(
    w.fake.connectionStatus.message.de,
    'Blocky 192.0.2.10:4000: keine Blocky-API unter dieser Adresse (HTTP-Port, 4000?)',
  );
  // No state is invented for an unread server.
  assert.equal(state(w, 'blocking'), undefined);
});

test('scene actions pause and resume every server, or one, for some groups', async (t) => {
  const clock = createClock();
  const servers = {
    [URL_1]: new FakeBlocky({ now: clock.now }),
    [URL_2]: new FakeBlocky({ now: clock.now }),
  };
  const w = await world(t, { clock, servers, config: TWO_SERVERS });
  const lastDisable = (server) =>
    server.requests.filter((r) => r.path === '/api/blocking/disable').at(-1).query;

  let ack = await w.fake.sceneAction('pause_blocking', { minutes: 10 });
  assert.deepEqual(ack.data.outputs, { servers: 2, minutes: 10 });
  for (const server of Object.values(servers)) {
    assert.deepEqual(lastDisable(server), { duration: '10m' });
  }
  assert.deepEqual(
    events(w, TRIGGERS.PAUSED).map((event) => event.data.server),
    ['Primary', 'Secondary'],
  );

  ack = await w.fake.sceneAction('resume_blocking', { device: deviceId(w.gladys, 2) });
  assert.deepEqual(ack.data.outputs, { servers: 1 });
  assert.equal(servers[URL_2].disabledGroups, null);
  assert.notEqual(servers[URL_1].disabledGroups, null);

  // Defaults applied by Gladys, or a variable typed as text; groups typed by hand.
  ack = await w.fake.sceneAction('pause_blocking', {
    device: deviceId(w.gladys, 2),
    minutes: '2,5',
    groups: ' ads , kids,ads ',
  });
  assert.deepEqual(ack.data.outputs, { servers: 1, minutes: 3 });
  assert.deepEqual(lastDisable(servers[URL_2]), { duration: '3m', groups: 'ads,kids' });
  assert.equal(events(w, TRIGGERS.PAUSED).at(-1).data.groups, 'ads, kids');
  ack = await w.fake.sceneAction('pause_blocking', { minutes: 0, groups: '' });
  assert.deepEqual(ack.data.outputs, { servers: 2, minutes: 0 });
  assert.deepEqual(lastDisable(servers[URL_1]), {});

  // An unknown group: refused by Blocky, said as such, the server still fine.
  ack = await w.fake.sceneAction('pause_blocking', { groups: 'adz' });
  assert.equal(ack.success, false);
  assert.equal(ack.error, 'Primary: unknown group: adz');
  assert.deepEqual(w.fake.connectionStatus, { connected: true });

  // One server down: the other one is paused, the action succeeds.
  servers[URL_2].online = false;
  ack = await w.fake.sceneAction('pause_blocking', {});
  assert.deepEqual(ack.data.outputs, { servers: 1, minutes: 5 });

  // All down: the action fails with a reason.
  servers[URL_1].online = false;
  ack = await w.fake.sceneAction('resume_blocking', {});
  assert.equal(ack.success, false);
  assert.equal(ack.error, 'No Blocky server accepted the command.');
  ack = await w.fake.sceneAction('resume_blocking', { device: deviceId(w.gladys, 1) });
  assert.equal(ack.error, 'Primary: does not answer');

  // A device no longer configured.
  ack = await w.fake.sceneAction('resume_blocking', { device: deviceId(w.gladys, 3) });
  assert.equal(ack.error, 'This Blocky server is no longer in the configuration.');
});

test('scene actions refresh the lists, flush the cache and read the statistics', async (t) => {
  const clock = createClock();
  const servers = {
    [URL_1]: new FakeBlocky({ now: clock.now }),
    [URL_2]: new FakeBlocky({ now: clock.now }),
  };
  const w = await world(t, { clock, servers, config: { ...TWO_SERVERS, language: 'fr' } });

  servers[URL_1].groups.ads = 1500;
  let ack = await w.fake.sceneAction('refresh_lists', {});
  assert.deepEqual(ack.data.outputs, { servers: 2 });
  assert.equal(servers[URL_1].refreshes, 1);
  assert.equal(servers[URL_1].requests.find((r) => r.path === '/api/lists/refresh').method, 'POST');
  assert.equal(state(w, 'blocked_domains'), 1501, 'read again after the refresh');

  ack = await w.fake.sceneAction('flush_cache', { device: deviceId(w.gladys, 2) });
  assert.deepEqual(ack.data.outputs, { servers: 1 });
  assert.equal(servers[URL_1].flushes, 0);
  assert.equal(servers[URL_2].flushes, 1);

  w.clock.advance(20 * 60_000);
  servers[URL_1].traffic({ queries: 900, blocked: 45 });
  servers[URL_2].traffic({ queries: 100, blocked: 5 });
  ack = await w.fake.sceneAction('read_statistics', {});
  assert.deepEqual(ack.data.outputs, {
    sentence: 'Sur les 20 dernières minutes, 1\u202f000 requêtes DNS, dont 50 bloquées (5 %).',
    queries_last_hour: 1000,
    blocked_last_hour: 50,
    blocked_percent: 5,
    blocking_enabled: true,
  });
  w.clock.advance(60 * 60_000);
  servers[URL_1].traffic({ queries: 30, blocked: 1 });
  ack = await w.fake.sceneAction('read_statistics', { device: deviceId(w.gladys, 1) });
  assert.equal(ack.data.outputs.queries_last_hour, 30);
  assert.equal(ack.data.outputs.blocked_percent, 3.3);
  assert.match(ack.data.outputs.sentence, /^Sur la dernière heure, 30 requêtes DNS/);

  servers[URL_1].online = false;
  servers[URL_2].online = false;
  ack = await w.fake.sceneAction('read_statistics', {});
  assert.equal(ack.success, false);
  assert.equal(ack.error, "Aucun serveur Blocky n'a accepté la commande.");
});

test('the scene action errors follow the configured language', async (t) => {
  const w = await world(t, { config: { language: 'fr' } });
  const ack = await w.fake.sceneAction('pause_blocking', {});
  assert.equal(ack.error, "Aucun serveur Blocky n'est configuré.");
  assert.deepEqual(w.fake.discoveredDevices, []);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.fr, /Saisissez l'adresse/);
});

test('reconfiguring keeps an unchanged server and drops the removed ones', async (t) => {
  const clock = createClock();
  const servers = {
    [URL_1]: new FakeBlocky({ now: clock.now }),
    [URL_2]: new FakeBlocky({ now: clock.now }),
  };
  const w = await world(t, { clock, servers, config: TWO_SERVERS });
  const record = w.hub.records.get(1);
  await w.fake.configUpdated({ ...TWO_SERVERS, server_1_name: 'Main', server_2_url: '' });
  assert.equal(w.hub.records.get(1), record, 'renamed: same record');
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => device.name),
    ['Main'],
  );
  // The certificate option changed: a new client.
  await w.fake.configUpdated({ ...TWO_SERVERS, allow_self_signed: true, server_2_url: '' });
  assert.notEqual(w.hub.records.get(1), record);
  assert.equal(servers[URL_1].requests.at(-1).insecure, true);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('the features follow the configured language', async (t) => {
  const w = await world(t, { config: { server_1_url: URL_1, language: 'es' } });
  const names = w.fake.discoveredDevices[0].features.map((feature) => feature.name);
  assert.equal(names[0], 'Bloqueo');
  assert.equal(names[1], 'Consultas DNS (última hora)');
});

test('a reconnection to Gladys sends everything again', async (t) => {
  const w = await world(t);
  const sent = w.fake.states.length;
  await w.gladys.disconnect();
  await w.gladys.connect();
  assert.equal(w.fake.states.length - sent, 3);
  assert.equal(w.fake.connectionStatuses.length, 2);
});

test('Gladys polling a device reads that server', async (t) => {
  const w = await world(t);
  w.server.groups.kids = 50;
  const ack = await w.fake.poll(w.fake.discoveredDevices[0]);
  assert.equal(ack.success, true);
  assert.equal(state(w, 'blocked_domains'), 53);
});

test('"Test the connection" reports each server in every language', async (t) => {
  const clock = createClock();
  const servers = {
    [URL_1]: new FakeBlocky({ now: clock.now }),
    [URL_2]: new FakeBlocky({ now: clock.now, kind: 'other' }),
    'http://dns.home:4000': new FakeBlocky({ now: clock.now, metrics: false }),
  };
  const w = await world(t, {
    clock,
    servers,
    config: { ...TWO_SERVERS, server_3_url: 'dns.home' },
  });
  servers[URL_1].disable(4, ['ads']);
  let ack = await w.fake.action('test_connection', {});
  assert.equal(
    ack.data.message.en,
    'Primary: OK, v0.35.0, paused, 4 min left, groups ads, statistics on\n' +
      'Secondary: no Blocky API at this address (HTTP port, 4000?)\n' +
      'Blocky dns.home:4000: OK, blocking on, no statistics (Prometheus off in Blocky)',
  );
  assert.match(ack.data.message.fr, /^Primary : OK, v0\.35\.0, en pause, encore 4 min/);

  await w.fake.configUpdated({ server_1_url: URL_1, server_2_url: 'http://' });
  ack = await w.fake.action('test_connection', {});
  assert.match(ack.data.message.en, /\nAddress not understood, e\.g\. 192\.168\.1\.2/);
});

test('pause durations and groups typed in a scene', () => {
  assert.equal(parseMinutes(10), 10);
  assert.equal(parseMinutes('15'), 15);
  assert.equal(parseMinutes(' 2,5 '), 3);
  assert.equal(parseMinutes(0), 0);
  assert.equal(parseMinutes(99999), 1440);
  assert.equal(parseMinutes(-1), 5);
  // A positive duration never becomes "until resumed".
  assert.equal(parseMinutes(0.4), 1);
  assert.equal(parseMinutes('0,3'), 1);
  assert.equal(parseMinutes('soon'), 5);
  assert.equal(parseMinutes(undefined), 5);
  assert.equal(parseMinutes(null, 30), 30);

  assert.deepEqual(parseGroups('ads'), ['ads']);
  assert.deepEqual(parseGroups(' ads, kids ;ads  games '), ['ads', 'kids', 'games']);
  assert.deepEqual(parseGroups(''), []);
  assert.deepEqual(parseGroups(undefined), []);
  assert.deepEqual(parseGroups(42), []);
});

test('a server removed while it is being read publishes nothing', async (t) => {
  const w = await world(t);
  const sent = w.fake.states.length;
  w.server.groups.ads = 9000;
  const reading = w.hub.pollAll();
  await w.fake.configUpdated({ server_1_url: '' });
  await reading;
  assert.equal(w.fake.states.length, sent);
});

test('a read started before a command does not undo it', async (t) => {
  const w = await world(t);
  await createAll(w);
  const original = w.server.handle.bind(w.server);
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  // The status of this read says "enabled", but its metrics are slow.
  w.server.handle = (url, options) =>
    url.endsWith('/metrics') ? held.then(() => original(url, options)) : original(url, options);
  const reading = w.hub.pollAll();
  await new Promise((resolve) => setImmediate(resolve));
  w.server.handle = original;
  await w.fake.sceneAction('pause_blocking', { minutes: 5 });
  release();
  await reading;
  assert.equal(state(w, 'blocking'), 0);
  assert.deepEqual(events(w, TRIGGERS.RESUMED), []);
  assert.equal(events(w, TRIGGERS.PAUSED).length, 1);
});
