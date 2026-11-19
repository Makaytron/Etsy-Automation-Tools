// The problem report dialog ("Sorun bildir").
//
// The user picks what went wrong and may add a note. The dialog shows every
// field that will be sent (version, browser, OS, interface language, browser
// locale and country, the page template, the error code) before Send. Shop
// names, customer data, page addresses with ids and API keys never enter it
// (core/diagnostics.js).
//
// Design sources: template.primitive.dialog, template.primitive.select,
// template.primitive.input, template.primitive.table, template.primitive.button.
// The registry has no textarea, so the note is a one-line input.

import { h } from './dom.js';
import { openDialog, select } from './controls.js';
import { buildReport, PROBLEM_CATEGORIES } from '../core/diagnostics.js';
import { sendReport, fallbackIssueUrl } from '../core/feedback.js';

const PREVIEW_FIELDS = ['category', 'errorCode', 'appVersion', 'browser', 'os', 'uiLanguage', 'browserLocale', 'region', 'routeTemplate', 'note'];

/**
 * @param {object} o
 * @param {Document} o.doc
 * @param {Element} o.container
 * @param {object} o.text      the shell translator
 * @param {object} o.scope     window
 * @param {string} o.appVersion
 * @param {string} [o.category]
 * @param {string} [o.errorCode]
 * @param {Element} [o.returnFocus]
 */
export function openFeedback({ doc, container, text, scope, appVersion, category = 'other', errorCode = null, returnFocus = null }) {
  const { t } = text;
  const draft = { category: PROBLEM_CATEGORIES.includes(category) ? category : 'other', note: '', state: 'editing' };
  const env = () => ({
    userAgent: scope.navigator?.userAgent ?? '',
    locale: scope.navigator?.language ?? '',
    pathname: scope.location?.pathname ?? '/',
    uiLanguage: text.language(),
  });
  const report = () => buildReport({ appVersion, category: draft.category, errorCode, note: draft.note }, env());

  const previewBody = h(doc, 'tbody', {});
  const status = h(doc, 'p', { class: 'field-hint', role: 'status', 'aria-live': 'polite', 'data-role': 'fb-status' });
  const after = h(doc, 'div', { class: 'row-actions', 'data-role': 'fb-after' });

  function renderPreview() {
    const r = report();
    previewBody.replaceChildren(...PREVIEW_FIELDS.map((field) => {
      const value = field === 'browser' ? [r.browser, r.browserMajor].filter((v) => v != null).join(' ') : r[field];
      const shown = field === 'category' ? t(`fb.cat.${r.category}`) : (value === null || value === '' || value === undefined ? '—' : String(value));
      return h(doc, 'tr', { 'data-field': field }, h(doc, 'th', { text: t(`fb.f.${field}`) }), h(doc, 'td', { text: shown }));
    }));
  }

  const body = h(doc, 'div', { class: 'stack' },
    h(doc, 'div', { class: 'field-col' },
      h(doc, 'span', { class: 'label', id: 'eat-fb-category', text: t('fb.category') }),
      select(doc, {
        labelledBy: 'eat-fb-category', name: 'fb-category', value: draft.category,
        options: PROBLEM_CATEGORIES.map((c) => ({ value: c, label: t(`fb.cat.${c}`) })),
        onChange: (value) => { draft.category = value; renderPreview(); },
      })),
    h(doc, 'div', { class: 'field-col' },
      h(doc, 'label', { class: 'label', for: 'eat-fb-note', text: t('fb.note') }),
      h(doc, 'input', { class: 'input', id: 'eat-fb-note', name: 'fb-note', type: 'text', maxlength: 1000, autocomplete: 'off', placeholder: t('fb.notePlaceholder'),
        oninput: (e) => { draft.note = e.currentTarget.value; renderPreview(); } }),
      h(doc, 'span', { class: 'field-hint', text: t('fb.noteHint') })),
    h(doc, 'div', { class: 'stack' },
      h(doc, 'span', { class: 'label', text: t('fb.preview') }),
      h(doc, 'div', { class: 'table-wrap' }, h(doc, 'table', { class: 'table', 'data-role': 'fb-preview' }, previewBody)),
      h(doc, 'span', { class: 'field-hint', text: t('fb.previewHint') })),
    status, after);
  renderPreview();

  const dialog = openDialog(doc, container, {
    title: t('fb.title'), description: t('fb.text'), body, closeLabel: t('fb.cancel'), returnFocus,
    footer: (close) => {
      const send = h(doc, 'button', { class: 'btn btn-default', type: 'button', 'data-action': 'fb-send', text: t('fb.send'), onclick: async () => {
        if (draft.state === 'sending') return;
        draft.state = 'sending';
        send.disabled = true;
        status.textContent = t('fb.sending');
        const r = report();
        const ok = await sendReport(scope.GM, r);
        draft.state = ok ? 'sent' : 'failed';
        if (ok) {
          status.textContent = t('fb.sent');
          send.hidden = true;
          return;
        }
        status.textContent = t('fb.failed');
        send.disabled = false;
        after.replaceChildren(h(doc, 'a', { class: 'btn btn-outline btn-sm', href: fallbackIssueUrl(r), target: '_blank', rel: 'noopener noreferrer', 'data-action': 'fb-github', text: t('fb.github') }));
      } });
      return [h(doc, 'button', { class: 'btn btn-outline', type: 'button', onclick: close, text: t('fb.cancel') }), send];
    },
  });
  return dialog;
}
