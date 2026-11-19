// Language detection and language packs.
//
// Only the language-picker strings are bundled for every language, so the
// first screen opens in the browser's language. Every other string lives in a
// per-language pack that is downloaded once after the user chooses, cached in
// storage, and validated before use. A failed download keeps the previous
// language and reports an error code; it never leaves the UI without text.

export const SOURCE_LANGUAGE = 'en';
const PACK_FORMAT = 'etsy-automation-tools-language-pack';

/**
 * Picks the supported language closest to the browser preferences.
 * Exact tags win, then the base language ("pt-BR" -> "pt").
 */
export function detectLanguage(preferred, supported, fallback = SOURCE_LANGUAGE) {
  const list = Array.isArray(preferred) ? preferred : [preferred];
  const set = new Set(supported);
  for (const tag of list) {
    if (typeof tag !== 'string') continue;
    if (set.has(tag)) return tag;
    const base = tag.split('-')[0].toLowerCase();
    if (set.has(base)) return base;
    const regional = supported.find((s) => s.split('-')[0] === base);
    if (regional) return regional;
  }
  return set.has(fallback) ? fallback : supported[0];
}

/** Text direction for a language tag. */
export function textDirection(language) {
  return /^(ar|fa|he|ur|ps|sd|ug|yi|dv|ckb)(-|$)/.test(language ?? '') ? 'rtl' : 'ltr';
}

/** Replaces {name} placeholders. Unknown placeholders stay visible. */
export function interpolate(text, vars = {}) {
  return text.replace(/\{(\w+)\}/g, (match, name) => (Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match));
}

/** Validates a downloaded pack. Returns its strings or throws with a code. */
export function validatePack(pack, { language, appVersion, requiredKeys = [] }) {
  const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
  if (!pack || pack.format !== PACK_FORMAT) fail('i18n_pack_format');
  if (pack.language !== language) fail('i18n_pack_language');
  if (typeof pack.minAppVersion === 'string' && compareVersions(appVersion, pack.minAppVersion) < 0) fail('i18n_pack_version');
  const strings = pack.strings;
  if (!strings || typeof strings !== 'object') fail('i18n_pack_strings');
  for (const [key, value] of Object.entries(strings)) {
    if (typeof value !== 'string' || value.length > 2000) fail('i18n_pack_value');
    if (/<\s*\/?\s*(script|iframe|object|embed|style)\b/i.test(value)) fail('i18n_pack_markup');
    void key;
  }
  for (const key of requiredKeys) if (typeof strings[key] !== 'string') fail('i18n_pack_missing');
  return strings;
}

export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

/**
 * Creates the translator.
 * - `bundled`: { [language]: { [key]: text } } for the picker strings.
 * - `source`: complete source-language strings (always available).
 * - `fetchPack(language)`: resolves to a pack object; injected so the
 *   network layer (GM.xmlHttpRequest to the repository) stays outside core.
 * - `cache`: a storage namespace used to keep downloaded packs.
 */
export function createI18n({ bundled = {}, source = {}, fetchPack, cache, appVersion, requiredKeys = [] }) {
  let language = SOURCE_LANGUAGE;
  let strings = source;

  function t(key, vars) {
    const text = strings[key] ?? bundled[language]?.[key] ?? source[key] ?? bundled[SOURCE_LANGUAGE]?.[key] ?? key;
    return interpolate(text, vars);
  }

  async function use(next, { onProgress } = {}) {
    if (next === SOURCE_LANGUAGE) {
      language = next; strings = source;
      return { language, direction: textDirection(language), fromCache: true };
    }
    const cached = await cache?.get(`pack.${next}`, null);
    if (cached) {
      try {
        strings = validatePack(cached, { language: next, appVersion, requiredKeys });
        language = next;
        return { language, direction: textDirection(language), fromCache: true };
      } catch { /* stale or damaged cache: download again */ }
    }
    if (typeof fetchPack !== 'function') { const e = new Error('i18n_pack_unavailable'); e.code = 'i18n_pack_unavailable'; throw e; }
    let pack;
    try {
      pack = await fetchPack(next, onProgress);
    } catch (cause) {
      const error = new Error('i18n_pack_download'); error.code = 'i18n_pack_download'; error.cause = cause; throw error;
    }
    const validated = validatePack(pack, { language: next, appVersion, requiredKeys });
    await cache?.set(`pack.${next}`, pack);
    strings = validated;
    language = next;
    return { language, direction: textDirection(language), fromCache: false };
  }

  return { t, use, get language() { return language; }, get direction() { return textDirection(language); } };
}
