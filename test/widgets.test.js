// -----------------------------------------------------------------------------
// The `blocky` dashboard widget: content within the core budget (checked with
// the SDK's validator), every server or one, the buttons and their actions.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { TRIGGERS, WIDGET_KEY } from '../src/hub.js';
import { ACTIONS } from '../src/widgets.js';
import {
  FakeBlocky,
  URL_1,
  URL_2,
  createClock,
  createWorld,
  deviceId,
  warmUp,
} from './helpers/world.js';

const TWO_SERVERS = {
  server_1_url: URL_1,
  server_1_name: 'Primary',
  server_2_url: URL_2,
  server_2_name: 'Secondary',
  language: 'en',
};

const lastDisable = (server) =>
  server.requests.filter((r) => r.path === '/api/blocking/disable').at(-1)?.query;

async function world(t, { config, servers, warm = true } = {}) {
  const clock = createClock();
  const result = await createWorld({
    clock,
    config,
    servers: servers?.(clock) ?? { [URL_1]: new FakeBlocky({ now: clock.now }) },
  });
  t.after(() => result.app.stop());
  if (warm) {
    await warmUp(result);
  }
  return result;
}

async function content(w, settings = {}, language = 'en') {
  const ack = await w.fake.widgetGet(WIDGET_KEY, { settings, language });
  assert.equal(ack.success, true, ack.error);
  const { content: tree } = ack.data;
  assert.deepEqual(validateWidgetContent(tree), [], 'within the core vocabulary and budget');
  return tree;
}

const ofType = (tree, type) => tree.components.filter((component) => component.type === type);

test('one server: figures, state, four buttons, within the budget', async (t) => {
  const w = await world(t);
  const tree = await content(w);
  assert.ok(tree.components.length <= 8);
  assert.deepEqual(
    ofType(tree, 'value').map(({ label, value, unit }) => [label, value, unit]),
    [
      ['Queries 1 h', 120, undefined],
      ['Blocked 1 h', 30, undefined],
      ['Share blocked', 25, '%'],
    ],
  );
  const [status] = ofType(tree, 'status');
  assert.deepEqual(
    status.items.map(({ label, value }) => [label, value]),
    [
      ['Blocky', 'Blocking'],
      ['Cache hit rate', '44 %'],
      ['Blocked domains', 4],
    ],
  );
  const buttons = ofType(tree, 'button');
  assert.deepEqual(
    buttons.map((button) => [button.label, button.action.key, button.icon]),
    [
      ['Pause 5 min', ACTIONS.PAUSE_SHORT, 'pause'],
      ['Pause 30 min', ACTIONS.PAUSE_LONG, 'pause'],
      ['Pause…', ACTIONS.PAUSE_CUSTOM, 'clock'],
      ['Resume', ACTIONS.RESUME, 'check-circle'],
    ],
  );
  assert.equal(new Set(buttons.map((button) => button.action.key)).size, 4, 'unique keys');
  assert.ok(
    buttons.every((button) => button.style !== 'primary'),
    'primary is invisible in dark',
  );
  assert.equal(tree.ttl_seconds, 60);
});

test('a pause shows its countdown, refreshes sooner, and Resume loses its check mark', async (t) => {
  const w = await world(t, {
    servers: (clock) => {
      const server = new FakeBlocky({ now: clock.now });
      server.disable(5);
      return { [URL_1]: server };
    },
  });
  const tree = await content(w, {}, 'fr');
  assert.equal(ofType(tree, 'status')[0].items[0].value, 'En pause · 4 min');
  assert.equal(ofType(tree, 'button').at(-1).icon, 'play');
  assert.equal(tree.ttl_seconds, 30);
});

test('two servers: summed figures, one row each, the groups of a partial pause', async (t) => {
  const w = await world(t, {
    config: TWO_SERVERS,
    servers: (clock) => ({
      [URL_1]: new FakeBlocky({ now: clock.now }),
      [URL_2]: new FakeBlocky({ now: clock.now }),
    }),
  });
  const second = w.network.servers.get(URL_2);
  second.traffic({ queries: 80, blocked: 20, hits: 0, misses: 10 });
  second.groups.ads = 1000;
  second.disable(0, ['ads']);
  await w.hub.pollAll();
  const tree = await content(w, {}, 'de');
  assert.deepEqual(
    ofType(tree, 'value').map((tile) => tile.value),
    [320, 80, 25],
  );
  assert.deepEqual(
    ofType(tree, 'status')[0].items.map(({ label, value }) => [label, value]),
    [
      ['Primary', 'Blockiert'],
      ['Secondary', 'Deaktiviert'],
      ['Pausierte Gruppen · Secondary', 'ads'],
      ['Cache-Trefferquote', '42 %'],
      ['Blockierte Domains', 1001],
    ],
  );

  // Restricted to one server in the widget settings.
  const one = await content(w, { device: deviceId(w.gladys, 1) });
  assert.deepEqual(
    ofType(one, 'value').map((tile) => tile.value),
    [120, 30, 25],
  );
  // The whole blocking off: no groups row.
  second.disable(0);
  await w.hub.pollAll();
  const all = await content(w, { device: deviceId(w.gladys, 2) });
  assert.ok(!ofType(all, 'status')[0].items.some((item) => item.icon === 'pause'));
});

test('no statistics yet, or none at all: a text says why', async (t) => {
  const w = await world(t, { warm: false });
  assert.match(ofType(await content(w), 'text')[0].text, /Statistics in a minute/);
  const off = await world(t, {
    warm: false,
    servers: (clock) => ({ [URL_1]: new FakeBlocky({ now: clock.now, metrics: false }) }),
  });
  const tree = await content(off, {}, 'fr');
  assert.match(ofType(tree, 'text')[0].text, /activez prometheus/);
  assert.equal(ofType(tree, 'button').length, 4);
});

test('an unreachable server is shown, and nothing answers at all', async (t) => {
  const w = await world(t);
  w.network.servers.get(URL_1).online = false;
  await w.hub.pollAll();
  const tree = await content(w);
  assert.deepEqual(ofType(tree, 'value'), []);
  assert.match(ofType(tree, 'text')[0].text, /No Blocky server answers/);
  assert.deepEqual(ofType(tree, 'status')[0].items, [
    { label: 'Blocky', icon: 'alert-triangle', value: 'Unreachable', color: 'danger' },
  ]);
});

test('no server configured, or a server no longer configured', async (t) => {
  const empty = await world(t, { config: {} });
  assert.match(ofType(await content(empty), 'text')[0].text, /Enter the address/);
  const w = await world(t);
  const tree = await content(w, { device: deviceId(w.gladys, 3) }, 'es');
  assert.match(ofType(tree, 'text')[0].text, /ya no está en la configuración/);
});

test('the buttons pause and resume every server', async (t) => {
  const w = await world(t, {
    config: TWO_SERVERS,
    servers: (clock) => ({
      [URL_1]: new FakeBlocky({ now: clock.now }),
      [URL_2]: new FakeBlocky({ now: clock.now }),
    }),
  });
  const servers = [...w.network.servers.values()];
  let ack = await w.fake.widgetAction(
    WIDGET_KEY,
    ACTIONS.PAUSE_SHORT,
    { minutes: 5 },
    { settings: {} },
  );
  assert.equal(ack.data.message.en, 'Blocking paused for 5 min on 2 server(s).');
  assert.ok(servers.every((server) => lastDisable(server).duration === '5m'));

  ack = await w.fake.widgetAction(
    WIDGET_KEY,
    ACTIONS.PAUSE_LONG,
    { minutes: 30 },
    { settings: {} },
  );
  assert.equal(ack.success, true);
  assert.ok(servers.every((server) => lastDisable(server).duration === '30m'));

  ack = await w.fake.widgetAction(WIDGET_KEY, ACTIONS.RESUME, {}, { settings: {} });
  assert.equal(ack.data.message.fr, 'Blocage réactivé sur 2 serveur(s).');
  assert.ok(servers.every((server) => server.disabledGroups === null));
  assert.equal(w.fake.sceneEvents.filter((event) => event.key === TRIGGERS.RESUMED).length, 2);
});

test('the Pause… form: the typed duration, or a request to update Gladys', async (t) => {
  const w = await world(t);
  const server = w.network.servers.get(URL_1);
  let ack = await w.fake.widgetAction(
    WIDGET_KEY,
    ACTIONS.PAUSE_CUSTOM,
    {},
    { settings: { device: deviceId(w.gladys) }, values: { minutes: 90 } },
  );
  assert.equal(ack.success, true);
  assert.equal(lastDisable(server).duration, '90m');

  // Gladys 5.1 relays the tap without the form.
  ack = await w.fake.widgetAction(WIDGET_KEY, ACTIONS.PAUSE_CUSTOM, {}, { settings: {} });
  assert.equal(ack.success, false);
  assert.match(ack.error, /Update Gladys to 5\.2\.0/);

  ack = await w.fake.widgetAction(WIDGET_KEY, 'reboot', {}, { settings: {} });
  assert.equal(ack.success, false);
});

test('the form field is valid for the core (number, integer bounds, default inside)', async (t) => {
  const w = await world(t);
  const tree = await content(w);
  const [field] = ofType(tree, 'button').find((b) => b.action.key === ACTIONS.PAUSE_CUSTOM).action
    .fields;
  assert.equal(field.type, 'number');
  assert.ok(Number.isInteger(field.min) && Number.isInteger(field.max));
  assert.ok(field.default >= field.min && field.default <= field.max);
  assert.deepEqual(Object.keys(field.label).sort(), ['de', 'en', 'es', 'fr']);
});
