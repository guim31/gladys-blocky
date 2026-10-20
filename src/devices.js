// -----------------------------------------------------------------------------
// One Gladys device per Blocky server.
//
// Identity: the configuration slot (1 to 3), not the address: switching a
// slot from an IP to a host name, or from HTTP to HTTPS, keeps the device and
// its history. Blocky exposes no instance id to use instead.
//
// Features (category/type couples of the core table, see
// test/gladys-rules.test.js):
//   - blocking: switch/binary, writable — 1 blocking on, 0 off (a pause of
//     the configured length, or until turned back on). A pause of some
//     groups only also reads 0: Blocky itself reports the blocking as off;
//   - queries and blocked queries of the last hour, share blocked, cache hit
//     rate: counter-sensor/integer (shares rounded: Gladys has no decimal
//     percentage sensor);
//   - blocked domains (entries of the deny lists): counter-sensor/integer;
//   - version: text/text.
// Every feature but the switch comes from the Prometheus endpoint of Blocky:
// without it (prometheus.enable false), the device has the switch only, and
// gains the others once it is turned on ("Update" in the Discovery tab).
//
// The server being reachable is the device transport (local / unreachable),
// with its own scene triggers, not a feature.
//
// The devices are published with should_poll: false: the integration reads
// the servers on its own timer (src/hub.js), at the interval chosen in the
// configuration.
// (Adapted from guim31/gladys-technitium.)
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { SLOTS, hostOf } from './config.js';

export const DEVICE_TYPE = 'blocky';
export const URL_PARAM = 'BLOCKY_URL';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  BLOCKING: 'blocking',
  QUERIES_HOUR: 'queries_last_hour',
  BLOCKED_HOUR: 'blocked_last_hour',
  BLOCKED_PERCENT_HOUR: 'blocked_percent_last_hour',
  CACHE_HIT_RATE: 'cache_hit_rate',
  BLOCKED_DOMAINS: 'blocked_domains',
  VERSION: 'version',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.BLOCKING]: 'Blocking',
    [FEATURE_KEYS.QUERIES_HOUR]: 'DNS queries (last hour)',
    [FEATURE_KEYS.BLOCKED_HOUR]: 'Blocked queries (last hour)',
    [FEATURE_KEYS.BLOCKED_PERCENT_HOUR]: 'Share blocked (last hour)',
    [FEATURE_KEYS.CACHE_HIT_RATE]: 'Cache hit rate (last hour)',
    [FEATURE_KEYS.BLOCKED_DOMAINS]: 'Blocked domains',
    [FEATURE_KEYS.VERSION]: 'Version',
  },
  fr: {
    [FEATURE_KEYS.BLOCKING]: 'Blocage',
    [FEATURE_KEYS.QUERIES_HOUR]: 'Requêtes DNS (dernière heure)',
    [FEATURE_KEYS.BLOCKED_HOUR]: 'Requêtes bloquées (dernière heure)',
    [FEATURE_KEYS.BLOCKED_PERCENT_HOUR]: 'Part bloquée (dernière heure)',
    [FEATURE_KEYS.CACHE_HIT_RATE]: 'Taux de cache (dernière heure)',
    [FEATURE_KEYS.BLOCKED_DOMAINS]: 'Domaines bloqués',
    [FEATURE_KEYS.VERSION]: 'Version',
  },
  de: {
    [FEATURE_KEYS.BLOCKING]: 'Blockierung',
    [FEATURE_KEYS.QUERIES_HOUR]: 'DNS-Anfragen (letzte Stunde)',
    [FEATURE_KEYS.BLOCKED_HOUR]: 'Blockierte Anfragen (letzte Stunde)',
    [FEATURE_KEYS.BLOCKED_PERCENT_HOUR]: 'Anteil blockiert (letzte Stunde)',
    [FEATURE_KEYS.CACHE_HIT_RATE]: 'Cache-Trefferquote (letzte Stunde)',
    [FEATURE_KEYS.BLOCKED_DOMAINS]: 'Blockierte Domains',
    [FEATURE_KEYS.VERSION]: 'Version',
  },
  es: {
    [FEATURE_KEYS.BLOCKING]: 'Bloqueo',
    [FEATURE_KEYS.QUERIES_HOUR]: 'Consultas DNS (última hora)',
    [FEATURE_KEYS.BLOCKED_HOUR]: 'Consultas bloqueadas (última hora)',
    [FEATURE_KEYS.BLOCKED_PERCENT_HOUR]: 'Proporción bloqueada (última hora)',
    [FEATURE_KEYS.CACHE_HIT_RATE]: 'Tasa de caché (última hora)',
    [FEATURE_KEYS.BLOCKED_DOMAINS]: 'Dominios bloqueados',
    [FEATURE_KEYS.VERSION]: 'Versión',
  },
};

// Display bounds (the core never applies them on write).
const COUNTER_MAX = 1_000_000_000;

const counter = (key, value, extra = {}) => ({
  key,
  definition: {
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    min: 0,
    max: COUNTER_MAX,
    ...extra,
  },
  value,
  // From the Prometheus endpoint: absent without it.
  when: (snapshot) => Boolean(snapshot.metrics),
});

const rounded = (value) => (typeof value === 'number' ? Math.round(value) : null);

// Order = display order in Gladys.
const FEATURES = [
  {
    key: FEATURE_KEYS.BLOCKING,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.SWITCH,
      type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
      read_only: false,
      has_feedback: true,
      keep_history: true,
      min: 0,
      max: 1,
    },
    value: (snapshot) =>
      snapshot.blocking === 'enabled' ? 1 : snapshot.blocking === 'disabled' ? 0 : null,
  },
  counter(FEATURE_KEYS.QUERIES_HOUR, (snapshot) => snapshot.hour?.queries ?? null),
  counter(FEATURE_KEYS.BLOCKED_HOUR, (snapshot) => snapshot.hour?.blocked ?? null),
  counter(FEATURE_KEYS.BLOCKED_PERCENT_HOUR, (snapshot) => rounded(snapshot.hour?.percentBlocked), {
    unit: DEVICE_FEATURE_UNITS.PERCENT,
    max: 100,
  }),
  counter(FEATURE_KEYS.CACHE_HIT_RATE, (snapshot) => rounded(snapshot.hour?.cacheHitRate), {
    unit: DEVICE_FEATURE_UNITS.PERCENT,
    max: 100,
  }),
  counter(FEATURE_KEYS.BLOCKED_DOMAINS, (snapshot) => snapshot.metrics?.denylistEntries ?? null),
  {
    key: FEATURE_KEYS.VERSION,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.TEXT,
      type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
      read_only: true,
      has_feedback: false,
      keep_history: false,
      // NOT NULL in the core, even for a text.
      min: 0,
      max: 0,
    },
    value: (snapshot) => snapshot.metrics?.version ?? null,
    when: (snapshot) => Boolean(snapshot.metrics),
  },
];

/** External ids of a server's device and features. */
export const deviceIds = (gladys, slot) => gladys.externalIds(DEVICE_TYPE, String(slot));

/** The slot of a device external id, null when it is not one of ours. */
export function slotOf(gladys, externalId) {
  for (const slot of SLOTS) {
    if (deviceIds(gladys, slot).device === externalId) {
      return slot;
    }
  }
  return null;
}

/** The name shown for a server: the one typed in the configuration, else its address. */
export const serverName = (server) => server.name ?? `Blocky ${hostOf(server.url)}`;

const present = (feature, snapshot) => !feature.when || feature.when(snapshot ?? {});

/**
 * The discovery payload of a server.
 * @param {object} gladys SDK client
 * @param {{ slot: number, url: string, name: string|null }} server
 * @param {string} language feature names language
 * @param {object} [snapshot] the last reading (decides the statistics features)
 */
export function buildDevice(gladys, server, language = 'en', snapshot = {}) {
  const ids = deviceIds(gladys, server.slot);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: serverName(server),
    external_id: ids.device,
    should_poll: false,
    params: [{ name: URL_PARAM, value: server.url }],
    features: FEATURES.filter((feature) => present(feature, snapshot)).map(
      ({ key, definition }) => ({
        ...definition,
        name: names[key],
        external_id: ids.feature(key),
      }),
    ),
  };
}

/**
 * The value of every feature for a server snapshot (null: nothing to publish).
 * @returns {Array<{ key: string, externalId: string, value: number|string|null }>}
 */
export function featureValues(gladys, slot, snapshot) {
  const ids = deviceIds(gladys, slot);
  return FEATURES.map((feature) => ({
    key: feature.key,
    externalId: ids.feature(feature.key),
    value: present(feature, snapshot) ? feature.value(snapshot) : null,
  }));
}
