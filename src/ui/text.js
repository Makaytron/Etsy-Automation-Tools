// One translator for the drawer and the workspace.

import { UI_STRINGS } from './strings.js';
import { WORKSPACE_STRINGS } from './strings-workspace.js';
import { detectLanguage, interpolate, textDirection } from '../core/i18n.js';

const LANGS = Object.keys(UI_STRINGS);

export function createText({ settings, scope }) {
  const language = () => {
    const chosen = settings.get().language;
    return chosen && LANGS.includes(chosen) ? chosen : detectLanguage(scope.navigator?.languages ?? [], LANGS, 'en');
  };
  const t = (key, vars) => {
    const lang = language();
    const text = UI_STRINGS[lang]?.[key] ?? WORKSPACE_STRINGS[lang]?.[key] ?? UI_STRINGS.en[key] ?? WORKSPACE_STRINGS.en[key] ?? key;
    return interpolate(text, vars);
  };
  return { t, language, direction: () => textDirection(language()) };
}
