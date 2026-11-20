// The problem report dialog ("Sorun bildir"), as the design canvas artboard
// Feedback draws it: what happened (six choices), which tool, an optional
// note, and the technical facts — each of which the user can switch off —
// shown before anything leaves the browser. "Send report" opens a prefilled,
// public GitHub issue; the script itself sends nothing. Shop names, customer
// data, page addresses with ids and API keys never enter it (core/diagnostics.js).
//
// Design sources: template.primitive.dialog, template.primitive.select,
// template.primitive.input, template.primitive.checkbox, template.primitive.button.

import { h, icon } from './dom.js';
import { ICONS } from './icons.js';
import { openDialog } from './controls.js';
import { buildReport, DIALOG_CATEGORIES, PROBLEM_CATEGORIES, REPORT_GROUPS } from '../core/diagnostics.js';
import { issueUrl } from '../core/feedback.js';
import { newReportId } from '../core/reports.js';
import { TOOL_IDS } from '../core/settings.js';

/**
 * @param {object} o
 * @param {Document} o.doc
 * @param {Element} o.container
 * @param {object} o.text      the shell translator
 * @param {object} o.scope     window
 * @param {string} o.appVersion
 * @param {object} [o.host]    to preselect the tool of this page
 * @param {object} [o.reports] keeps the report id for Settings › Help
 * @param {string} [o.category]
 * @param {string} [o.errorCode]
 * @param {string} [o.tool]
 * @param {Element} [o.returnFocus]
 */
export function openFeedback({ doc, container, text, scope, appVersion, host = null, reports = null, category = 'interrupted', errorCode = null, errorAt = null, tool = null, returnFocus = null }) {
  const { t } = text;
  const initial = { 'etsy-page-changed': 'interrupted', 'ai-or-translation': 'wrong-result', other: 'interrupted' }[category] ?? category;
  const draft = {
    category: DIALOG_CATEGORIES.includes(initial) ? initial : 'interrupted',
    tool: TOOL_IDS.includes(tool) ? tool : TOOL_IDS.includes(host?.activeTool) ? host.activeTool : '',
    note: '',
    omit: new Set(errorCode ? [] : ['error']),
  };
  const id = newReportId();
  const minutes = -new Date().getTimezoneOffset();
  const env = () => ({
    userAgent: scope.navigator?.userAgent ?? '',
    locale: scope.navigator?.language ?? '',
    pathname: scope.location?.pathname ?? '/',
    uiLanguage: text.language(),
    utcOffsetMinutes: minutes,
    handler: scope.GM?.info?.scriptHandler && scope.GM?.info?.version ? `${scope.GM.info.scriptHandler} ${scope.GM.info.version}` : null,
  });
  const report = () => buildReport({ appVersion, category: PROBLEM_CATEGORIES.includes(draft.category) ? draft.category : 'other', tool: draft.tool || null, errorCode, errorAt, note: draft.note, omit: [...draft.omit] }, env());

  // Technical facts, one row per group (Feedback: "Raporla gönderilecek teknik bilgiler").
  const facts = h(doc, 'div', { class: 'list', 'data-role': 'fb-preview' });
  function renderFacts() {
    const all = buildReport({ appVersion, category: draft.category, tool: draft.tool || null, errorCode, errorAt, note: '' }, env());
    const value = {
      version: [all.appVersion && `v${all.appVersion}`, all.handler].filter(Boolean).join(' · '),
      system: [all.browser && [all.browser, all.browserMajor].filter((v) => v != null).join(' '), all.os].filter(Boolean).join(' · '),
      locale: [all.browserLocale ?? all.uiLanguage, all.region, all.utcOffset].filter(Boolean).join(' · '),
      page: all.routeTemplate ? `etsy.com${all.routeTemplate}` : '—',
      error: errorCode ? [all.errorCode, all.errorAt].filter(Boolean).join(' · ') : t('fb.noError'),
    };
    facts.replaceChildren(...REPORT_GROUPS.map((group) => h(doc, 'label', { class: 'li fb-fact', 'data-field': group },
      h(doc, 'input', { type: 'checkbox', class: 'chk', name: `fb-${group}`, checked: !draft.omit.has(group), disabled: group === 'error' && !errorCode, onchange: (e) => { if (e.target.checked) draft.omit.delete(group); else draft.omit.add(group); sync(); } }),
      h(doc, 'span', { class: 'xs mute2 fb-fact-k', text: t(`fb.g.${group}`) }),
      h(doc, 'span', { class: 'xs mono grow trunc', text: value[group] || '—' }))));
  }

  let github = null;
  function sync() {
    github?.setAttribute('href', issueUrl(report(), id));
  }

  const options = h(doc, 'div', { class: 'g3', style: 'gap: 6px;' });
  function renderOptions() {
    options.replaceChildren(...DIALOG_CATEGORIES.map((c) => h(doc, 'label', { class: draft.category === c ? 'fb-opt on' : 'fb-opt' },
      h(doc, 'input', { type: 'radio', name: 'fb-category', value: c, checked: draft.category === c, onchange: () => { draft.category = c; renderOptions(); sync(); } }),
      t(`fb.cat.${c}`))));
  }
  renderOptions();

  const body = h(doc, 'div', { class: 'col', style: 'gap: 12px;' },
    h(doc, 'div', { class: 'field', role: 'radiogroup', 'aria-labelledby': 'eat-fb-category' }, h(doc, 'span', { class: 'label', id: 'eat-fb-category', text: t('fb.category') }), options),
    h(doc, 'label', { class: 'field', for: 'eat-fb-tool' },
      h(doc, 'span', { class: 'label', text: t('fb.tool') }),
      h(doc, 'select', { class: 'input', id: 'eat-fb-tool', name: 'fb-tool', onchange: (e) => { draft.tool = e.target.value; renderFacts(); sync(); } },
        h(doc, 'option', { value: '', text: t('fb.toolNone'), selected: !draft.tool }),
        TOOL_IDS.map((id2) => h(doc, 'option', { value: id2, selected: draft.tool === id2, text: t(`tool.${id2}`) })))),
    h(doc, 'label', { class: 'field', for: 'eat-fb-note' },
      h(doc, 'span', { class: 'label' }, t('fb.note'), h(doc, 'span', { class: 'mute', style: 'font-weight: 400;', text: ` · ${t('fb.optional')}` })),
      h(doc, 'textarea', { class: 'input', id: 'eat-fb-note', name: 'fb-note', rows: 2, maxlength: 1000, placeholder: t('fb.notePlaceholder'), oninput: (e) => { draft.note = e.currentTarget.value; sync(); } })),
    h(doc, 'span', { class: 'hint', style: 'margin-top: -6px;', text: t('fb.noteHint') }),
    h(doc, 'div', { class: 'fb-box' },
      h(doc, 'div', { class: 'row fb-box-h' }, h(doc, 'span', { class: 'h3 grow', text: t('fb.preview') }), h(doc, 'span', { class: 'xs mute', text: t('fb.previewOff') })),
      facts,
      h(doc, 'div', { class: 'row xs mute2 fb-box-f' }, icon(doc, ICONS.shield, 14), t('fb.never'))),
    h(doc, 'span', { class: 'hint', text: t('fb.githubHint') }));
  renderFacts();

  const dialog = openDialog(doc, container, {
    title: t('fb.title'), description: t('fb.text'), body, closeLabel: t('fb.cancel'), returnFocus, width: 640,
    footer: (close) => {
      github = h(doc, 'a', {
        class: 'btn btn-p', href: issueUrl(report(), id), target: '_blank', rel: 'noopener noreferrer', 'data-action': 'fb-github', text: t('fb.github'),
        onclick: () => { void reports?.record({ id, category: draft.category }); scope.setTimeout?.(close, 0); },
      });
      return [h(doc, 'span', { class: 'xs mute grow fb-foot', text: t('fb.seeFirst') }), h(doc, 'button', { class: 'btn btn-g', type: 'button', onclick: close, text: t('fb.cancel') }), github];
    },
  });
  // The dialog's footer has its own text on the left instead of a spacer.
  dialog.dialog.querySelector('.modal-f > .grow:first-child')?.remove();
  return dialog;
}
