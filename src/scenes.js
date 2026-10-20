// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// The blocking switch is already a Gladys scene action ("control a device"),
// but it cannot say for how long, for which groups, nor reach every server at
// once. These can: pause one server or all of them for a number of minutes
// (0: until resumed), for some Blocky groups or all of them, resume, refresh
// the lists, flush the DNS cache, and read the statistics into a sentence a
// following action can send or speak. Gladys applies the field defaults to
// scene actions.
// (Adapted from guim31/gladys-technitium.)
// -----------------------------------------------------------------------------

import { DEFAULT_PAUSE_MINUTES, parseGroups, parseMinutes } from './hub.js';

export const SCENE_ACTIONS = {
  async pause_blocking(hub, { fields = {} }) {
    const minutes = parseMinutes(fields.minutes, DEFAULT_PAUSE_MINUTES);
    const groups = parseGroups(fields.groups);
    const servers = await hub.pause(fields.device || null, minutes, groups);
    return { servers, minutes };
  },

  async resume_blocking(hub, { fields = {} }) {
    const servers = await hub.resume(fields.device || null);
    return { servers };
  },

  async refresh_lists(hub, { fields = {} }) {
    const servers = await hub.refreshLists(fields.device || null);
    return { servers };
  },

  async flush_cache(hub, { fields = {} }) {
    const servers = await hub.flushCache(fields.device || null);
    return { servers };
  },

  async read_statistics(hub, { fields = {} }) {
    return hub.statistics(fields.device || null);
  },
};
