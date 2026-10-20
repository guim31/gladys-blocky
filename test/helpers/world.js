// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, fake Blocky servers on a fake
// network and a manual clock, with the integration wired
// on top through registerHandlers. No timer runs unless `timers: true` (with
// node:test mock timers): the tests read the servers with `world.hub.pollAll()`.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { FakeBlocky, createNetwork } from './fakeBlocky.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const URL_1 = 'http://192.0.2.10:4000';
export const URL_2 = 'https://198.51.100.20';

/** A manual clock, shared by the hub and the fake servers. */
export function createClock(start = Date.UTC(2026, 9, 12, 10, 0, 0)) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {Record<string, FakeBlocky>} [options.servers] by base URL
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {boolean} [options.connect]
 */
export async function createWorld({
  clock = createClock(),
  servers,
  config = {
    server_1_url: URL_1,
    server_1_name: 'Blocky',
    language: 'en',
  },
  devices = [],
  connect = true,
  timings = {},
  timers = false,
} = {}) {
  const network = createNetwork(servers ?? { [URL_1]: new FakeBlocky({ now: clock.now }) });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    request: network.request,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, network, app, hub: app.hub, clock };
}

/** External id of the device of a configuration slot. */
export const deviceId = (gladys, slot = 1) => gladys.externalIds('blocky', String(slot)).device;
export const featureId = (gladys, key, slot = 1) =>
  gladys.externalIds('blocky', String(slot)).feature(key);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

/** Read every server twice, a minute apart: the statistics need two readings. */
export async function warmUp(world, traffic = { queries: 120, blocked: 30, hits: 40, misses: 50 }) {
  world.clock.advance(60_000);
  for (const server of world.network.servers.values()) {
    server.traffic(traffic);
  }
  await world.hub.pollAll();
}

export { FakeBlocky };
