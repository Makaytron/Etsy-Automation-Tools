// Downloaded language packs.
//
// Only English, the source text, is bundled in full, so something always
// reads if a download fails. Every other language comes as a pack
// (languages/<code>.json in the repository): downloaded once when the user
// picks one, validated (format, language, version, plain text only), kept
// in storage, and used from then on without a request. While a pack is
// missing or fails, the interface stays in English and offers a retry.

import { validatePack } from './i18n.js';

export const PACK_LANGUAGES = Object.freeze(['ar', 'bg', 'bn', 'ca', 'cs', 'da', 'de', 'el', 'es', 'et', 'fa', 'fi', 'fil', 'fr', 'he', 'hi', 'hr', 'hu', 'id', 'it', 'ja', 'ko', 'lt', 'lv', 'ms', 'nb', 'nl', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sr', 'sv', 'th', 'tr', 'uk', 'ur', 'vi', 'zh-CN', 'zh-TW']);
export const PACK_MIN_APP_VERSION = '2.0.0';
export const PACK_BASE_URL = 'https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/languages/';
const MAX_PACK_BYTES = 256 * 1024;

// A kept pack remembers the app version it was downloaded for (`packFor.<code>`). After an update it is
// still used straight away, and the current pack is fetched once in the background: new strings, such as
// the notes of each release, would otherwise stay in English until the pack happened to be replaced.

// Strings of the packs loaded in this page, shared by the shell and the tool screens.
const loaded = new Map();

/** The loaded strings for a language, or null. */
export function packStrings(language) {
  return loaded.get(language) ?? null;
}

/** Looks a key up in the loaded pack of `language`. */
export function packText(language, key) {
  return loaded.get(language)?.[key];
}

function download(gm, url, onProgress = null) {
  return new Promise((resolve, reject) => {
    if (typeof gm?.xmlHttpRequest !== 'function') { reject(new Error('no request API')); return; }
    gm.xmlHttpRequest({
      method: 'GET', url, timeout: 15000, anonymous: true, headers: { Accept: 'application/json' },
      onload: (response) => {
        const text = String(response?.responseText ?? '');
        if (response?.status !== 200) reject(new Error(`HTTP ${response?.status}`));
        else if (text.length > MAX_PACK_BYTES) reject(new Error('too large'));
        else { try { resolve(JSON.parse(text)); } catch (error) { reject(error); } }
      },
      onprogress: (event) => { if (onProgress && Number.isFinite(event?.loaded)) onProgress(event.loaded, Number.isFinite(event.total) && event.total > 0 ? event.total : null); },
      onerror: () => reject(new Error('network')),
      ontimeout: () => reject(new Error('timeout')),
    });
  });
}

/**
 * @param {object} o
 * @param {object} o.gm          the userscript manager's GM (for xmlHttpRequest)
 * @param {object} o.cache       storage namespace that keeps packs (`pack.<code>`)
 * @param {string} o.appVersion
 * @param {Function} [o.onChange] called whenever a pack's state changes
 */
/** Keys that only packs of the current catalog carry; a cached pack without them is refreshed. */
export const PACK_CURRENT_KEYS = Object.freeze(['ma.inbox', 'la.overview', 'set.tab.ai']);

export function createLanguagePacks({ gm, cache, appVersion, onChange = () => {} }) {
  const states = new Map(); // code -> { status: 'loading' | 'ready' | 'error', code? }
  const pending = new Map();
  const refreshing = new Map();

  const set = (language, state) => { states.set(language, state); onChange(language, state); };

  async function fetchAndKeep(language, onProgress = null) {
    const pack = await download(gm, `${PACK_BASE_URL}${language}.json`, onProgress);
    const strings = validatePack(pack, { language, appVersion });
    await cache?.set(`pack.${language}`, pack).catch(() => {});
    await cache?.set(`packFor.${language}`, appVersion).catch(() => {});
    return strings;
  }

  /** Replaces a pack kept from an earlier version; on any failure the kept one stays in use. */
  function refresh(language) {
    if (refreshing.has(language)) return refreshing.get(language);
    const job = fetchAndKeep(language)
      .then((strings) => { loaded.set(language, strings); onChange(language, { status: 'ready' }); return true; })
      .catch(() => false)
      .finally(() => refreshing.delete(language));
    refreshing.set(language, job);
    return job;
  }

  async function load(language) {
    const cached = await cache?.get(`pack.${language}`, null).catch(() => null);
    if (cached) {
      try {
        // A pack kept from an older catalog lacks the newer screens' keys: download the current one instead.
        loaded.set(language, validatePack(cached, { language, appVersion, requiredKeys: PACK_CURRENT_KEYS }));
        const keptFor = await cache?.get(`packFor.${language}`, null).catch(() => null);
        if (keptFor !== appVersion) void refresh(language);
        return;
      } catch { /* an old or damaged pack: download it again */ }
    }
    loaded.set(language, await fetchAndKeep(language, (loadedBytes, total) => set(language, { status: 'loading', loaded: loadedBytes, total })));
  }

  /** Makes sure the pack of `language` is loaded; resolves to its state. */
  function ensure(language) {
    if (!PACK_LANGUAGES.includes(language)) return Promise.resolve({ status: 'bundled' });
    if (loaded.has(language)) return Promise.resolve({ status: 'ready' });
    if (pending.has(language)) return pending.get(language);
    if (states.get(language)?.status === 'error') return Promise.resolve(states.get(language));
    // The job is registered before anyone hears about it, so a re-render that asks again joins it.
    const job = Promise.resolve()
      .then(() => load(language))
      .then(() => { pending.delete(language); set(language, { status: 'ready' }); return states.get(language); })
      .catch((error) => { pending.delete(language); set(language, { status: 'error', code: error?.code ?? 'i18n_pack_download' }); return states.get(language); });
    pending.set(language, job);
    set(language, { status: 'loading' });
    return job;
  }

  /** Tries a failed download again. */
  function retry(language) {
    if (states.get(language)?.status === 'error') states.delete(language);
    return ensure(language);
  }

  function state(language) {
    if (!PACK_LANGUAGES.includes(language)) return { status: 'bundled' };
    if (loaded.has(language)) return { status: 'ready' };
    return states.get(language) ?? { status: 'idle' };
  }

  /** Resolves when a background refresh of `language` has finished (for tests and the settings page). */
  function settled(language) {
    return refreshing.get(language) ?? Promise.resolve(false);
  }

  /** Size of a loaded pack in bytes (UTF-8 of its JSON), or 0. */

  function size(language) {
    const pack = loaded.get(language);
    return pack ? new TextEncoder().encode(JSON.stringify(pack)).length : 0;
  }

  return { ensure, retry, state, size, settled };
}
