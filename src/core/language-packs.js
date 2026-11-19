// Downloaded language packs.
//
// Only English, the source text, is bundled in full, so something always
// reads if a download fails. Every other language comes as a pack
// (languages/<code>.json in the repository): downloaded once when the user
// picks one, validated (format, language, version, plain text only), kept
// in storage, and used from then on without a request. While a pack is
// missing or fails, the interface stays in English and offers a retry.

import { validatePack } from './i18n.js';

export const PACK_LANGUAGES = Object.freeze(['ar', 'de', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'nl', 'pl', 'pt', 'ru', 'tr', 'uk', 'vi', 'zh-CN', 'zh-TW']);
export const PACK_MIN_APP_VERSION = '2.0.0';
export const PACK_BASE_URL = 'https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/languages/';
const MAX_PACK_BYTES = 256 * 1024;

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

function download(gm, url) {
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
export function createLanguagePacks({ gm, cache, appVersion, onChange = () => {} }) {
  const states = new Map(); // code -> { status: 'loading' | 'ready' | 'error', code? }
  const pending = new Map();

  const set = (language, state) => { states.set(language, state); onChange(language, state); };

  async function load(language) {
    const cached = await cache?.get(`pack.${language}`, null).catch(() => null);
    if (cached) {
      try {
        loaded.set(language, validatePack(cached, { language, appVersion }));
        return;
      } catch { /* an old or damaged pack: download it again */ }
    }
    const pack = await download(gm, `${PACK_BASE_URL}${language}.json`);
    loaded.set(language, validatePack(pack, { language, appVersion }));
    await cache?.set(`pack.${language}`, pack).catch(() => {});
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

  return { ensure, retry, state };
}
