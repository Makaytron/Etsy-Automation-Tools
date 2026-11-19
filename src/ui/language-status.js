// The language pack line under a language choice: "downloading…", or the
// failure with Try again and Report a problem. Nothing while the language is
// bundled or its pack is ready.
//
// Design sources: template.primitive.button, the alert style of the settings page.

import { h } from './dom.js';

export const SUPPORT_URL = 'https://github.com/Makaytron/Etsy-Automation-Tools/issues';

export function languageStatus(doc, text) {
  const { t } = text;
  const state = text.pack();
  if (state.status === 'loading') return h(doc, 'p', { class: 'field-hint', role: 'status', 'data-role': 'lang-status', 'data-state': 'loading', text: t('lang.loading') });
  if (state.status !== 'error') return null;
  return h(doc, 'div', { class: 'stack', 'data-role': 'lang-status', 'data-state': 'error' },
    h(doc, 'p', { class: 'alert-warn', role: 'alert', text: t('lang.failed') }),
    h(doc, 'div', { class: 'row-actions' },
      h(doc, 'button', { class: 'btn btn-outline btn-sm', type: 'button', 'data-action': 'lang-retry', onclick: () => { void text.retryPack(); }, text: t('lang.retry') }),
      h(doc, 'a', { class: 'btn btn-ghost btn-sm', href: SUPPORT_URL, target: '_blank', rel: 'noopener noreferrer', text: t('ws.report') })));
}
