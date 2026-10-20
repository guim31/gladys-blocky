// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `blocky`.
//
// The use case: "the bank website does not load" → pause the ad blocking for
// five minutes from the wall tablet. So the widget shows the state of the
// blocking and the figures of the last hour, and offers direct buttons: Pause
// 5 min, Pause 30 min, Pause… (a duration typed in a form) and Resume.
//
// Every server by default (pausing one server of two changes nothing: the
// clients ask the other one), or the one chosen in the widget settings.
//
// Budget (8 components, 2 texts at most): three tiles (queries, blocked,
// share blocked over the last hour), one status list (blocking per server,
// groups paused, cache hit rate, blocked domains) and four buttons. The
// figures are sent as values, not bound to device features, so the widget
// works before the devices are added to Gladys and sums several servers.
//
// The "Pause…" form (widget action fields, GladysAssistant/Gladys#3168)
// needs Gladys 5.2.0: an older Gladys sends the tap without the duration,
// answered by a message asking to update Gladys.
// (Adapted from guim31/gladys-technitium.)
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { serverName } from './devices.js';
import { DEFAULT_PAUSE_MINUTES, MAX_PAUSE_MINUTES, WIDGET_KEY, parseMinutes } from './hub.js';
import { ERROR_KINDS } from './blocky/client.js';
import { pick } from './texts.js';

// Action keys of the buttons: permanent once published (unique, the core
// drops a button whose key is taken).
export const ACTIONS = Object.freeze({
  PAUSE_SHORT: 'pause_5',
  PAUSE_LONG: 'pause_30',
  PAUSE_CUSTOM: 'pause_custom',
  RESUME: 'resume',
});
export const SHORT_PAUSE_MINUTES = 5;
export const LONG_PAUSE_MINUTES = 30;
export const CUSTOM_PAUSE_DEFAULT_MINUTES = 60;

const ACTIVE_ICON = 'check-circle';

export const TEXT = {
  pick: {
    en: 'Enter the address of your Blocky server in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre serveur Blocky dans la configuration de l'intégration.",
    de: 'Gib die Adresse deines Blocky-Servers in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su servidor Blocky en la configuración de la integración.',
  },
  unknown: {
    en: 'This server is no longer in the configuration: choose another one in the widget settings.',
    fr: "Ce serveur n'est plus dans la configuration : choisissez-en un autre dans les réglages du widget.",
    de: 'Dieser Server ist nicht mehr in der Konfiguration: Wähle einen anderen in den Widget-Einstellungen.',
    es: 'Este servidor ya no está en la configuración: elija otro en la configuración del widget.',
  },
  noAnswer: {
    en: 'No Blocky server answers: see the Configuration screen of the integration.',
    fr: "Aucun serveur Blocky ne répond : voir l'écran Configuration de l'intégration.",
    de: 'Kein Blocky-Server antwortet: Sieh dir die Konfiguration der Integration an.',
    es: 'Ningún servidor Blocky responde: consulte la pantalla de configuración de la integración.',
  },
  noMetrics: {
    en: 'For the statistics, turn on prometheus in the Blocky configuration.',
    fr: 'Pour les statistiques, activez prometheus dans la configuration de Blocky.',
    de: 'Für die Statistiken aktiviere prometheus in der Blocky-Konfiguration.',
    es: 'Para las estadísticas, active prometheus en la configuración de Blocky.',
  },
  tooSoon: {
    en: 'Statistics after the next reading…',
    fr: 'Statistiques après la prochaine lecture…',
    de: 'Statistiken nach der nächsten Abfrage…',
    es: 'Estadísticas tras la próxima lectura…',
  },
  updateGladys: {
    en: 'Update Gladys to 5.2.0 or later to choose the duration of a pause.',
    fr: 'Mettez Gladys à jour (5.2.0 ou plus) pour choisir la durée de la pause.',
    de: 'Aktualisiere Gladys auf 5.2.0 oder neuer, um die Dauer der Pause zu wählen.',
    es: 'Actualice Gladys a la versión 5.2.0 o posterior para elegir la duración de la pausa.',
  },
  queries: { en: 'Queries 1 h', fr: 'Requêtes 1 h', de: 'Anfragen 1 h', es: 'Consultas 1 h' },
  blocked: { en: 'Blocked 1 h', fr: 'Bloquées 1 h', de: 'Blockiert 1 h', es: 'Bloqueadas 1 h' },
  share: { en: 'Share blocked', fr: 'Part bloquée', de: 'Anteil blockiert', es: 'Proporción' },
  cache: {
    en: 'Cache hit rate',
    fr: 'Taux de cache',
    de: 'Cache-Trefferquote',
    es: 'Tasa de caché',
  },
  groups: {
    en: 'Groups paused',
    fr: 'Groupes en pause',
    de: 'Pausierte Gruppen',
    es: 'Grupos en pausa',
  },
  domains: {
    en: 'Blocked domains',
    fr: 'Domaines bloqués',
    de: 'Blockierte Domains',
    es: 'Dominios bloqueados',
  },
  enabled: { en: 'Blocking', fr: 'Blocage actif', de: 'Blockiert', es: 'Bloqueo activo' },
  disabled: { en: 'Disabled', fr: 'Désactivé', de: 'Deaktiviert', es: 'Desactivado' },
  paused: { en: 'Paused', fr: 'En pause', de: 'Pausiert', es: 'En pausa' },
  unreachable: {
    en: 'Unreachable',
    fr: 'Injoignable',
    de: 'Nicht erreichbar',
    es: 'Inaccesible',
  },
  error: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
  waiting: { en: 'Waiting…', fr: 'En attente…', de: 'Warte…', es: 'Esperando…' },
  pauseShort: { en: 'Pause 5 min', fr: 'Pause 5 min', de: 'Pause 5 min', es: 'Pausa 5 min' },
  pauseLong: { en: 'Pause 30 min', fr: 'Pause 30 min', de: 'Pause 30 min', es: 'Pausa 30 min' },
  pauseCustom: { en: 'Pause…', fr: 'Pause…', de: 'Pause…', es: 'Pausa…' },
  resume: { en: 'Resume', fr: 'Réactiver', de: 'Fortsetzen', es: 'Reactivar' },
  minutes: {
    en: 'Duration (minutes)',
    fr: 'Durée (minutes)',
    de: 'Dauer (Minuten)',
    es: 'Duración (minutos)',
  },
};

// Toasts after a tap (≤ 200 characters).
export const DONE_TEXT = {
  en: {
    paused: (minutes, count) => `Blocking paused for ${minutes} min on ${count} server(s).`,
    resumed: (count) => `Blocking resumed on ${count} server(s).`,
  },
  fr: {
    paused: (minutes, count) => `Blocage en pause pour ${minutes} min sur ${count} serveur(s).`,
    resumed: (count) => `Blocage réactivé sur ${count} serveur(s).`,
  },
  de: {
    paused: (minutes, count) => `Blockierung für ${minutes} min auf ${count} Server(n) pausiert.`,
    resumed: (count) => `Blockierung auf ${count} Server(n) fortgesetzt.`,
  },
  es: {
    paused: (minutes, count) => `Bloqueo en pausa durante ${minutes} min en ${count} servidor(es).`,
    resumed: (count) => `Bloqueo reactivado en ${count} servidor(es).`,
  },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

/** The status row of one server: its blocking state. */
function serverRow(hub, record, language) {
  const label = fit(serverName(record.server), 40);
  if (record.error) {
    const unreachable = record.error.kind === ERROR_KINDS.UNREACHABLE;
    return {
      label,
      icon: 'alert-triangle',
      value: t(unreachable ? TEXT.unreachable : TEXT.error, language),
      color: WIDGET_COLORS.DANGER,
    };
  }
  const { blocking } = record.snapshot;
  if (blocking === 'enabled') {
    return {
      label,
      icon: 'shield',
      value: t(TEXT.enabled, language),
      color: WIDGET_COLORS.SUCCESS,
    };
  }
  if (blocking === 'disabled') {
    return {
      label,
      icon: 'shield-off',
      value: hub.pauseMinutesLeft(record)
        ? `${t(TEXT.paused, language)} · ${hub.pauseMinutesLeft(record)} min`
        : t(TEXT.disabled, language),
      color: WIDGET_COLORS.WARNING,
    };
  }
  return { label, icon: 'clock', value: t(TEXT.waiting, language), color: WIDGET_COLORS.NEUTRAL };
}

/** Sum of the servers that answered; the shares are recomputed from the sums. */
export function totals(records) {
  const answering = records.filter((record) => !record.error && record.snapshot.hour);
  if (answering.length === 0) {
    return null;
  }
  const sum = (key) =>
    answering.reduce((total, record) => total + (record.snapshot.hour[key] ?? 0), 0);
  const queries = sum('queries');
  const blocked = sum('blocked');
  const rates = answering
    .map((record) => record.snapshot.hour.cacheHitRate)
    .filter((value) => typeof value === 'number');
  return {
    queries,
    blocked,
    percentBlocked: queries > 0 ? (100 * blocked) / queries : 0,
    // Each server has its own cache: the average of the rates.
    cacheHitRate: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null,
    // The servers of a pair usually share their lists: the largest, not the sum.
    blockedDomains: answering.some((r) => typeof r.snapshot.metrics?.denylistEntries === 'number')
      ? Math.max(...answering.map((r) => r.snapshot.metrics?.denylistEntries ?? 0))
      : null,
  };
}

/**
 * The groups of a pause that does not cover every group (Blocky lists them
 * all, plus its "default", when the whole blocking is off); null otherwise.
 */
export function partialGroups(record) {
  const { blocking, disabledGroups, metrics } = record.snapshot;
  if (blocking !== 'disabled' || !disabledGroups?.length || !metrics?.groups?.length) {
    return null;
  }
  return metrics.groups.some((group) => !disabledGroups.includes(group)) ? disabledGroups : null;
}

export function buttons(records, language) {
  const allEnabled = records.length > 0 && records.every((r) => r.snapshot.blocking === 'enabled');
  return [
    {
      type: 'button',
      label: t(TEXT.pauseShort, language),
      icon: 'pause',
      style: 'secondary',
      action: { key: ACTIONS.PAUSE_SHORT, params: { minutes: SHORT_PAUSE_MINUTES } },
    },
    {
      type: 'button',
      label: t(TEXT.pauseLong, language),
      icon: 'pause',
      style: 'secondary',
      action: { key: ACTIONS.PAUSE_LONG, params: { minutes: LONG_PAUSE_MINUTES } },
    },
    {
      type: 'button',
      label: t(TEXT.pauseCustom, language),
      icon: 'clock',
      style: 'secondary',
      action: {
        key: ACTIONS.PAUSE_CUSTOM,
        fields: [
          {
            key: 'minutes',
            type: 'number',
            required: true,
            min: 1,
            max: MAX_PAUSE_MINUTES,
            default: CUSTOM_PAUSE_DEFAULT_MINUTES,
            label: TEXT.minutes,
          },
        ],
      },
    },
    {
      type: 'button',
      label: t(TEXT.resume, language),
      // Blocking on everywhere: the check mark says so (never the style:
      // `primary` is invisible in dark mode).
      icon: allEnabled ? ACTIVE_ICON : 'play',
      style: 'secondary',
      action: { key: ACTIONS.RESUME },
    },
  ];
}

async function get(hub, { settings, language = 'en' }) {
  if (hub.records.size === 0) {
    return message(TEXT.pick, language);
  }
  const records = hub.view(settings?.device);
  if (records.length === 0) {
    return message(TEXT.unknown, language);
  }
  const sums = totals(records);
  const paused = records.some((record) => record.snapshot.blocking === 'disabled');
  const components = [];
  if (sums) {
    components.push(
      { type: 'value', value: sums.queries, label: t(TEXT.queries, language), icon: 'activity' },
      {
        type: 'value',
        value: sums.blocked,
        label: t(TEXT.blocked, language),
        icon: 'slash',
        color: WIDGET_COLORS.PRIMARY,
      },
      {
        type: 'value',
        value: Math.round(sums.percentBlocked * 10) / 10,
        unit: '%',
        label: t(TEXT.share, language),
        icon: 'pie-chart',
      },
    );
  } else {
    const reachable = records.filter((record) => !record.error);
    const text =
      reachable.length === 0
        ? TEXT.noAnswer
        : reachable.some((record) => record.snapshot.metrics)
          ? TEXT.tooSoon
          : TEXT.noMetrics;
    components.push({ type: 'text', variant: 'body', text: t(text, language) });
  }

  const items = records.slice(0, 3).map((record) => serverRow(hub, record, language));
  for (const record of records) {
    const groups = partialGroups(record);
    if (groups) {
      const label =
        records.length > 1
          ? `${t(TEXT.groups, language)} · ${serverName(record.server)}`
          : t(TEXT.groups, language);
      items.push({
        label: fit(label, 40),
        icon: 'pause',
        value: fit(groups.join(', '), 40),
        color: WIDGET_COLORS.WARNING,
      });
    }
  }
  if (sums) {
    const neutral = (text, icon, value) => ({
      label: t(text, language),
      icon,
      value,
      color: WIDGET_COLORS.NEUTRAL,
    });
    if (sums.cacheHitRate !== null) {
      items.push(neutral(TEXT.cache, 'zap', `${Math.round(sums.cacheHitRate)} %`));
    }
    if (sums.blockedDomains !== null) {
      items.push(neutral(TEXT.domains, 'list', sums.blockedDomains));
    }
  }
  components.push({ type: 'status', items: items.slice(0, 10) });
  components.push(...buttons(records, language));
  // A pause counts down: refresh sooner.
  return { ttl_seconds: paused ? 30 : 60, components };
}

async function action(hub, { actionKey, params = {}, settings, values }) {
  const device = settings?.device || null;
  const language = hub.config?.language ?? 'en';
  const done = (render) =>
    Object.fromEntries(Object.entries(DONE_TEXT).map(([lang, text]) => [lang, render(text)]));

  if (actionKey === ACTIONS.RESUME) {
    const count = await hub.resume(device);
    return { message: done((text) => text.resumed(count)) };
  }
  let minutes;
  if (actionKey === ACTIONS.PAUSE_SHORT || actionKey === ACTIONS.PAUSE_LONG) {
    minutes = parseMinutes(params.minutes, DEFAULT_PAUSE_MINUTES);
  } else if (actionKey === ACTIONS.PAUSE_CUSTOM) {
    if (!values || values.minutes === undefined || values.minutes === null) {
      // A Gladys older than 5.2.0 relays the tap without the form.
      throw new Error(t(TEXT.updateGladys, language));
    }
    minutes = Math.max(1, parseMinutes(values.minutes, CUSTOM_PAUSE_DEFAULT_MINUTES));
  } else {
    throw new Error(`Unknown action ${actionKey}`);
  }
  const count = await hub.pause(device, minutes);
  return { message: done((text) => text.paused(minutes, count)) };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
