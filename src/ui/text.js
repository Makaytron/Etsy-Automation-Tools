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
    return chosen && LANGS.includes(chosen) ? chosen : detectLanguage(scope.navigator?.languages ?? [], LANGS, 'en');
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
