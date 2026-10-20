// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, the sentence
// of the "Read the statistics" scene action, scene action errors. Four
// languages, the four of the Gladys interface; German says "du", Spanish
// "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './blocky/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noServer: {
    en: 'Enter the address of your Blocky server in the configuration.',
    fr: "Saisissez l'adresse de votre serveur Blocky dans la configuration.",
    de: 'Gib die Adresse deines Blocky-Servers in der Konfiguration ein.',
    es: 'Introduzca la dirección de su servidor Blocky en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. 192.168.1.2 or http://192.168.1.2:4000',
    fr: 'Adresse incomprise, ex. 192.168.1.2 ou http://192.168.1.2:4000',
    de: 'Adresse nicht verstanden, z. B. 192.168.1.2 oder http://192.168.1.2:4000',
    es: 'Dirección no válida, p. ej. 192.168.1.2 o http://192.168.1.2:4000',
  },
};

// One short explanation per error kind (src/blocky/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'does not answer',
    fr: 'ne répond pas',
    de: 'antwortet nicht',
    es: 'no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: tick "Accept self-signed certificates"',
    fr: 'certificat refusé : cochez « Accepter les certificats auto-signés »',
    de: 'Zertifikat abgelehnt: Aktiviere „Selbstsignierte Zertifikate akzeptieren“',
    es: 'certificado rechazado: marque «Aceptar certificados autofirmados»',
  },
  [ERROR_KINDS.NOT_BLOCKY]: {
    en: 'no Blocky API at this address (HTTP port, 4000?)',
    fr: "pas d'API Blocky à cette adresse (port HTTP, 4000 ?)",
    de: 'keine Blocky-API unter dieser Adresse (HTTP-Port, 4000?)',
    es: 'no hay API de Blocky en esta dirección (¿puerto HTTP, 4000?)',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'a password protects this address: give Gladys a direct access',
    fr: 'un mot de passe protège cette adresse : donnez à Gladys un accès direct',
    de: 'ein Passwort schützt diese Adresse: Gib Gladys einen direkten Zugang',
    es: 'una contraseña protege esta dirección: dé a Gladys un acceso directo',
  },
  [ERROR_KINDS.UNKNOWN_GROUP]: {
    en: 'unknown group: {group}',
    fr: 'groupe inconnu : {group}',
    de: 'unbekannte Gruppe: {group}',
    es: 'grupo desconocido: {group}',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The "Test the connection" report, one line per server.
export const REPORT_TEXT = {
  en: {
    ok: 'OK',
    on: 'blocking on',
    off: 'blocking off',
    paused: (minutes) => `paused, ${minutes} min left`,
    groups: (groups) => `groups ${groups}`,
    metrics: 'statistics on',
    noMetrics: 'no statistics (Prometheus off in Blocky)',
  },
  fr: {
    ok: 'OK',
    on: 'blocage actif',
    off: 'blocage désactivé',
    paused: (minutes) => `en pause, encore ${minutes} min`,
    groups: (groups) => `groupes ${groups}`,
    metrics: 'statistiques actives',
    noMetrics: 'pas de statistiques (Prometheus désactivé dans Blocky)',
  },
  de: {
    ok: 'OK',
    on: 'Blockierung aktiv',
    off: 'Blockierung aus',
    paused: (minutes) => `pausiert, noch ${minutes} min`,
    groups: (groups) => `Gruppen ${groups}`,
    metrics: 'Statistiken aktiv',
    noMetrics: 'keine Statistiken (Prometheus in Blocky aus)',
  },
  es: {
    ok: 'OK',
    on: 'bloqueo activo',
    off: 'bloqueo desactivado',
    paused: (minutes) => `en pausa, quedan ${minutes} min`,
    groups: (groups) => `grupos ${groups}`,
    metrics: 'estadísticas activas',
    noMetrics: 'sin estadísticas (Prometheus desactivado en Blocky)',
  },
};

const number = (value, locale) => new Intl.NumberFormat(locale).format(value);

// The sentence of the "Read the statistics" scene action (a message, a TTS).
// `minutes` is under 60 for a while after the integration or Blocky starts.
export const STATS_TEXT = {
  en: {
    sentence: ({ queries, blocked, percent, minutes }) =>
      `${minutes >= 60 ? 'In the last hour' : `In the last ${minutes} minutes`}, ${number(queries, 'en')} DNS queries, ${number(blocked, 'en')} blocked (${number(percent, 'en')} %).`,
  },
  fr: {
    sentence: ({ queries, blocked, percent, minutes }) =>
      `${minutes >= 60 ? 'Sur la dernière heure' : `Sur les ${minutes} dernières minutes`}, ${number(queries, 'fr')} requêtes DNS, dont ${number(blocked, 'fr')} bloquées (${number(percent, 'fr')} %).`,
  },
  de: {
    sentence: ({ queries, blocked, percent, minutes }) =>
      `${minutes >= 60 ? 'In der letzten Stunde' : `In den letzten ${minutes} Minuten`} ${number(queries, 'de')} DNS-Anfragen, davon ${number(blocked, 'de')} blockiert (${number(percent, 'de')} %).`,
  },
  es: {
    sentence: ({ queries, blocked, percent, minutes }) =>
      `${minutes >= 60 ? 'En la última hora' : `En los últimos ${minutes} minutos`}, ${number(queries, 'es')} consultas DNS, de ellas ${number(blocked, 'es')} bloqueadas (${number(percent, 'es')} %).`,
  },
};

// Errors of the scene actions and widget buttons (shown in Gladys).
export const ACTION_TEXT = {
  noServer: {
    en: 'No Blocky server is configured.',
    fr: "Aucun serveur Blocky n'est configuré.",
    de: 'Kein Blocky-Server ist konfiguriert.',
    es: 'No hay ningún servidor Blocky configurado.',
  },
  unknownServer: {
    en: 'This Blocky server is no longer in the configuration.',
    fr: "Ce serveur Blocky n'est plus dans la configuration.",
    de: 'Dieser Blocky-Server ist nicht mehr in der Konfiguration.',
    es: 'Este servidor Blocky ya no está en la configuración.',
  },
  failed: {
    en: 'No Blocky server accepted the command.',
    fr: "Aucun serveur Blocky n'a accepté la commande.",
    de: 'Kein Blocky-Server hat den Befehl angenommen.',
    es: 'Ningún servidor Blocky ha aceptado la orden.',
  },
  noMetrics: {
    en: 'No statistics: turn on prometheus in the Blocky configuration.',
    fr: 'Pas de statistiques : activez prometheus dans la configuration de Blocky.',
    de: 'Keine Statistiken: Aktiviere prometheus in der Blocky-Konfiguration.',
    es: 'Sin estadísticas: active prometheus en la configuración de Blocky.',
  },
  tooSoon: {
    en: 'Statistics not ready yet: try again in a minute.',
    fr: 'Statistiques pas encore prêtes : réessayez dans une minute.',
    de: 'Statistiken noch nicht bereit: Versuche es in einer Minute erneut.',
    es: 'Estadísticas aún no disponibles: inténtelo de nuevo en un minuto.',
  },
};

export const LANGUAGE_FALLBACK = 'en';

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** The explanation of an error (`{ kind, group }`) in a language. */
export const errorText = (error, language) =>
  pick(ERROR_TEXT[error.kind] ?? ERROR_TEXT[ERROR_KINDS.HTTP], language).replace(
    '{group}',
    error.group ?? '?',
  );
