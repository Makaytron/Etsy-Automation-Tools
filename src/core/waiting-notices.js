// "Waiting for you" notices (Settings › Notifications: autopilot waiting,
// edit queue waiting). A tool reports which of its items wait for the user;
// each item that starts waiting after the page loaded is announced once.
// Whatever already waited when the page loaded is the baseline, so reloading
// a page does not announce the same step again.

import { packText } from './language-packs.js';
import { WORKSPACE_STRINGS } from '../ui/strings-workspace.js';

/** Notice title in the interface language (pack text, English fallback). */
export function noticeTitle(language, key) {
  return packText(language, key) ?? WORKSPACE_STRINGS.en[key] ?? key;
}

/**
 * @param {object} o
 * @param {string} o.event  notice event id (autopilotWaiting, queueWaiting)
 * @param {string} o.tool   tool id
 * @param {string} o.page   workspace page the notice opens
 */
export function createWaitingNotices({ event, tool, page }) {
  let seen = null;
  return {
    /** `waiting`: [{ key, detail }] — the steps that wait for the user right now. */
    update(waiting, { notify, language }) {
      const keys = new Set(waiting.map((w) => w.key));
      if (seen === null) { seen = keys; return; }
      for (const w of waiting) {
        if (seen.has(w.key) || !notify) continue;
        void notify({ event, tool, title: noticeTitle(language, `nt.ev.${event}`), detail: w.detail, needsAction: true, page });
      }
      seen = keys;
    },
  };
}
