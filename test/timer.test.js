// -----------------------------------------------------------------------------
// The reading timer of the container. Gladys 5.2.0 never polls a device
// published with should_poll: false (and never polls the devices created
// without should_poll, GladysAssistant/Gladys#3198): the servers must be read
// by the hub's own timer, with no onPoll at all.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FakeBlocky,
  URL_1,
  createAll,
  createClock,
  createWorld,
  featureId,
} from './helpers/world.js';

/** Let the timer callback and the fake network settle. */
const settle = async () => {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

test('the internal timer reads the servers without any onPoll from Gladys', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clock = createClock();
  const server = new FakeBlocky({ now: clock.now });
  const w = await createWorld({
    clock,
    servers: { [URL_1]: server },
    config: { server_1_url: URL_1, poll_interval: 60 },
    timers: true,
  });
  t.after(() => w.app.stop());
  const polled = t.mock.method(w.hub, 'pollDevice');
  await createAll(w);

  const device = w.fake.discoveredDevices[0];
  assert.equal(device.should_poll, false, 'Gladys is not asked to poll');
  const reads = () => server.requests.filter((r) => r.path === '/api/blocking/status').length;
  const before = reads();

  for (const queries of [80, 100, 120]) {
    server.traffic({ queries });
    clock.advance(60_000);
    t.mock.timers.tick(60_000);
    await settle();
    assert.equal(w.fake.lastState(featureId(w.gladys, 'queries_last_hour')) > 0, true);
  }
  assert.equal(w.fake.lastState(featureId(w.gladys, 'queries_last_hour')), 300);
  assert.equal(reads() - before, 3, 'one reading per interval');
  assert.equal(polled.mock.callCount(), 0, 'no onPoll involved');
});

test('the timer stops with the integration', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clock = createClock();
  const server = new FakeBlocky({ now: clock.now });
  const w = await createWorld({
    clock,
    servers: { [URL_1]: server },
    config: { server_1_url: URL_1, poll_interval: 60 },
    timers: true,
  });
  await w.app.stop();
  const before = server.requests.length;
  t.mock.timers.tick(10 * 60_000);
  await settle();
  assert.equal(server.requests.length, before);
});
