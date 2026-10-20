import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, hostOf, normalizeConfig, parseServerUrl } from '../src/config.js';

test('server addresses: bare host, URL copied from the browser, port, HTTPS', () => {
  // A bare host gets the port of the web console.
  assert.equal(parseServerUrl('192.0.2.10'), 'http://192.0.2.10:4000');
  assert.equal(parseServerUrl('dns.home:8080'), 'http://dns.home:8080');
  assert.equal(parseServerUrl('[2001:db8::1]'), 'http://[2001:db8::1]:4000');
  // A URL keeps its own port: a reverse proxy on 80 or 443.
  assert.equal(parseServerUrl(' http://192.0.2.10:4000/index.html '), 'http://192.0.2.10:4000');
  assert.equal(parseServerUrl('https://dns.example.net/'), 'https://dns.example.net');
  assert.equal(parseServerUrl('HTTPS://198.51.100.20:53443'), 'https://198.51.100.20:53443');
  assert.equal(parseServerUrl('http://192.0.2.10'), 'http://192.0.2.10');
  assert.equal(hostOf('https://dns.home:53443'), 'dns.home:53443');
});

test('unusable addresses are refused', () => {
  for (const raw of ['', '   ', 'ftp://192.0.2.10', 'http://', 'http://user:pass@192.0.2.10', 42]) {
    assert.equal(parseServerUrl(raw), null, String(raw));
  }
});

test('defaults: no server, 30 seconds, a 5-minute pause, French', () => {
  assert.deepEqual(normalizeConfig(), {
    servers: [],
    invalidSlots: [],
    allowSelfSigned: false,
    pollIntervalMs: 30_000,
    switchOffMinutes: 5,
    language: 'fr',
  });
  assert.deepEqual(normalizeConfig(DEFAULT_CONFIG), normalizeConfig());
  assert.deepEqual(normalizeConfig(null), normalizeConfig());
});

test('servers by slot, with name, invalid slots reported', () => {
  const config = normalizeConfig({
    server_1_url: '192.0.2.10',
    server_1_name: '  Living room  ',
    server_2_url: 'not a url at all',
    server_3_url: 'https://198.51.100.20',
    allow_self_signed: true,
    poll_interval: '300',
    switch_off_minutes: '30',
    language: 'de',
  });
  assert.deepEqual(config.servers, [
    { slot: 1, url: 'http://192.0.2.10:4000', name: 'Living room' },
    { slot: 3, url: 'https://198.51.100.20', name: null },
  ]);
  assert.deepEqual(config.invalidSlots, [2]);
  assert.equal(config.allowSelfSigned, true);
  assert.equal(config.pollIntervalMs, 300_000);
  assert.equal(config.switchOffMinutes, 30);
  assert.equal(config.language, 'de');
});

test('values outside the lists fall back to the defaults', () => {
  const config = normalizeConfig({ poll_interval: '15', switch_off_minutes: 12, language: 'it' });
  assert.equal(config.pollIntervalMs, 30_000);
  assert.equal(config.switchOffMinutes, 5);
  assert.equal(config.language, 'fr');
  assert.equal(normalizeConfig({ poll_interval: 60 }).pollIntervalMs, 60_000);
});
