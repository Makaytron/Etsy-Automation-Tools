// One translator for the drawer, the workspace and the setup.
//
// Only English, the source text, is bundled in full. Every other language
// reads its downloaded pack (core/language-packs.js); until the pack is there,
// the first-screen strings come from strings-picker.js (bundled for every
// language) and everything else falls back to English.

import { UI_STRINGS } from './strings.js';
import { WORKSPACE_STRINGS, UI_LANGUAGES } from './strings-workspace.js';
import { PICKER_STRINGS } from './strings-picker.js';
import { detectLanguage, interpolate, textDirection } from '../core/i18n.js';
import { packText } from '../core/language-packs.js';

const LANGS = UI_LANGUAGES.map((l) => l.code);

// Browser tags that name a language we offer under another code.
const ALIASES = Object.freeze({ no: 'nb', nn: 'nb', tl: 'fil', iw: 'he', in: 'id' });
const TRADITIONAL_CHINESE = /^zh-(?:TW|HK|MO|Hant)/i;

/** Maps browser language tags onto the codes of our packs before matching. */
export function normalizeTags(tags) {
  return (Array.isArray(tags) ? tags : [tags]).filter((tag) => typeof tag === 'string').map((tag) => {
    if (TRADITIONAL_CHINESE.test(tag)) return 'zh-TW';
    if (/^zh(?:-|$)/i.test(tag)) return 'zh-CN';
    const base = tag.split('-')[0].toLowerCase();
    return ALIASES[base] ?? tag;
  });
}

/**
 * @param {object} o
 * @param {object} o.settings
 * @param {object} o.scope
 * @param {object} [o.packs] core/language-packs.js instance; without it only bundled text is used
 */
export function createText({ settings, scope, packs = null }) {
  const listeners = new Set();
  const language = () => {
    const chosen = settings.get().language;
    return chosen && LANGS.includes(chosen) ? chosen : detectLanguage(normalizeTags(scope.navigator?.languages ?? []), LANGS, 'en');
  };
  const t = (key, vars) => {
    const lang = language();
    const text = UI_STRINGS[lang]?.[key] ?? WORKSPACE_STRINGS[lang]?.[key] ?? packText(lang, key) ?? PICKER_STRINGS[lang]?.[key]
      ?? UI_STRINGS.en[key] ?? WORKSPACE_STRINGS.en[key] ?? key;
    return interpolate(text, vars);
  };
  /** State of the current language's pack: bundled, idle, loading, ready or error. */
  const pack = () => (packs ? packs.state(language()) : { status: 'bundled' });
  /** Starts the download of the current language's pack if it is needed. */
  const ensurePack = () => (packs ? packs.ensure(language()) : Promise.resolve(pack()));
  const retryPack = () => (packs ? packs.retry(language()) : Promise.resolve(pack()));
  const onPackChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  const packChanged = () => { for (const fn of [...listeners]) fn(); };
  return { t, language, direction: () => textDirection(language()), pack, ensurePack, retryPack, onPackChange, packChanged };
}
