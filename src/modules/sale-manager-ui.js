// Sale Manager screens: drawer status, workspace page (overview, settings, report) and the start confirmation.
//
// The screens only read the engine snapshot and call the engine's own actions
// (start, retry, skip, stop, updateConfig, downloads), so every rule of the
// standalone Sale Manager still decides what happens on Etsy.
//
// Design sources: template.primitive.card, template.primitive.table, template.primitive.badge,
// template.primitive.progress, template.primitive.button, template.primitive.input,
// template.primitive.checkbox, template.primitive.tabs, template.primitive.dialog;
// shadcn.blocks.kpi-widgets (https://shadcnstore.com/blocks/application/widgets) for the four summary tiles;
// shadcn.blocks.datatable (https://shadcnstore.com/blocks/application/datatables) for the campaign and report tables.

import { h } from '../ui/dom.js';
import { card, checkbox, segmented, openDialog } from '../ui/controls.js';
import { interpolate } from '../core/i18n.js';
import { packText } from '../core/language-packs.js';

export const SALE_STRINGS = Object.freeze({
  en: Object.freeze({
    running: 'Running', paused: 'Paused', ready: 'Ready', completed: 'Completed',
    campaignOf: 'Campaign {n} of {total}', series: '{count} campaigns · {start} – {end} · {discount}% off',
    start: 'Start the series…', stop: 'Stop the series', retry: 'Continue', skip: 'Skip this day', details: 'Open details',
    settings: 'Settings', overview: 'Overview', report: 'Report',
    title: 'Campaign series', description: 'Creates campaigns one after another on Sales & Discounts and checks each one in the Etsy list.',
    tileRange: 'Start range', tileDiscount: 'Discount', tileCount: 'Campaigns', tileProgress: 'Progress',
    perCampaign: 'Each campaign {days} day(s)', everywhere: 'Valid: Everywhere', verified: '{n} verified',
    planned: 'Planned campaigns', colCode: 'Code', colDates: 'Dates', colStatus: 'Status', colCheck: 'Check',
    stPlanned: 'Planned', stDone: 'Created', stError: 'Error', stStopped: 'Stopped', stCurrent: 'In progress',
    checked: 'Verified', notChecked: '—',
    pausedWhy: 'The series stopped for safety: {reason}',
    confirmTitle: '{count} campaigns will be created one after another',
    confirmText: '{discount}% off · Everywhere',
    confirmNote1: 'Each campaign is checked in the Etsy list after it is created.',
    confirmNote2: 'At a step that cannot be verified the series stops and asks you.',
    confirmNote3: 'Keep this tab open until the series ends.',
    confirmStart: 'Start {count} campaigns', cancel: 'Cancel',
    fStart: 'First start date', fEnd: 'Last start date', fDuration: 'Days per campaign', fDiscount: 'Discount (%)',
    fPrefix: 'Code text', fPrefixHint: 'Letters and digits, up to 12. The code is date + text + discount, for example 261207WINTER25.',
    fRegion: 'Valid in', fResume: 'Continue where it left off after a reload', fResumeHint: 'Only after you confirm on the page.',
    save: 'Save settings', saved: 'Settings saved.', lockedWhileRunning: 'Settings are locked while a series runs.',
    preview: 'Codes', noReport: 'No report yet. A report appears after the first series.',
    csv: 'Download CSV', excel: 'Download Excel', openEtsy: 'Open Sales & Discounts',
    phase: 'Step: {phase}',
  }),
});

// Bundled English; other languages read the downloaded pack ("sale." keys).
function texts(language) {
  const lang = SALE_STRINGS[language] ? language : 'en';
  return (key, vars) => interpolate(SALE_STRINGS[language]?.[key] ?? packText(language, `sale.${key}`) ?? SALE_STRINGS[lang][key] ?? SALE_STRINGS.en[key] ?? key, vars);
}

const fmtDay = (iso, language) => {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y) return '—';
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d));
};

/** Status of one planned campaign, from the engine's results. */
function rowStatus(plan, job) {
  const row = (job?.results ?? []).find((r) => r.saleName === plan.saleName || r.startDate === plan.startDate);
  if (row?.status === 'SUCCESS') return { key: 'stDone', tone: 'badge-ok', verified: Boolean(row.verified) };
  if (row?.status === 'ERROR') return { key: 'stError', tone: 'badge-err', verified: false };
  if (row?.status === 'STOPPED') return { key: 'stStopped', tone: 'badge-warn', verified: false };
  if (job?.active && job.currentDate === plan.startDate) return { key: 'stCurrent', tone: '', verified: false };
  return { key: 'stPlanned', tone: '', verified: false };
}

function summary(snap) {
  const done = (snap.job?.results ?? []).filter((r) => r.status === 'SUCCESS').length;
  const total = snap.plans.length;
  const index = Math.max(0, snap.plans.findIndex((p) => p.startDate === snap.job?.currentDate));
  return { done, total, index };
}

function progress(doc, value, total, label) {
  return h(doc, 'div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(value), 'aria-label': label },
    h(doc, 'div', { class: 'progress-indicator', style: `width:${total ? (value / total) * 100 : 0}%` }));
}

function actionButtons(doc, ts, snap, actions, { compact } = {}) {
  const job = snap.job;
  const size = compact ? ' btn-sm' : '';
  if (job?.active && job.paused) {
    return [
      h(doc, 'button', { class: `btn btn-default${size}`, type: 'button', 'data-sale': 'retry', onclick: () => actions.retry(), text: ts('retry') }),
      h(doc, 'button', { class: `btn btn-outline${size}`, type: 'button', 'data-sale': 'skip', onclick: () => actions.skip(), text: ts('skip') }),
      h(doc, 'button', { class: `btn btn-ghost${size}`, type: 'button', 'data-sale': 'stop', onclick: () => actions.stop(), text: ts('stop') }),
    ];
  }
  if (job?.active) {
    return [h(doc, 'button', { class: `btn btn-outline${size}`, type: 'button', 'data-sale': 'stop', onclick: () => actions.stop(), text: ts('stop') })];
  }
  return [h(doc, 'button', { class: `btn btn-default${size}`, type: 'button', 'data-sale': 'start', disabled: !snap.plans.length, onclick: (e) => actions.confirmStart(e.currentTarget), text: ts('start') })];
}

/** Drawer section for the Sales & Discounts page. */
export function renderSaleDrawer(doc, { snap, language, actions }) {
  const ts = texts(language);
  const { done, total, index } = summary(snap);
  const job = snap.job;
  const badge = job?.active
    ? (job.paused ? h(doc, 'span', { class: 'badge badge-warn', text: ts('paused') }) : h(doc, 'span', { class: 'badge badge-dark', text: ts('running') }))
    : h(doc, 'span', { class: 'badge', text: ts('ready') });
  const current = job?.active ? snap.plans[index] : null;
  return h(doc, 'div', { class: 'sale-drawer', 'data-role': 'sale-drawer' },
    h(doc, 'div', { class: 'current' }, h(doc, 'span', { class: 'grow', text: 'Sale Manager' }), badge),
    job?.active
      ? h(doc, 'div', { class: 'stack' },
        h(doc, 'div', { class: 'row-between muted' },
          h(doc, 'span', {}, `${ts('campaignOf', { n: index + 1, total })}: `, h(doc, 'b', { class: 'mono-code', text: current?.saleName ?? '—' })),
          h(doc, 'span', { text: `${done} / ${total}` })),
        progress(doc, done, total, ts('tileProgress')),
        job.paused && job.errorReason ? h(doc, 'p', { class: 'muted', role: 'status', text: ts('pausedWhy', { reason: job.errorReason }) }) : null)
      : h(doc, 'p', { class: 'muted', text: total ? ts('series', { count: total, start: fmtDay(snap.plans[0].startDate, language), end: fmtDay(snap.plans[total - 1].startDate, language), discount: snap.config.discount }) : '—' }),
    h(doc, 'div', { class: 'row-actions' },
      ...actionButtons(doc, ts, snap, actions, { compact: true }),
      h(doc, 'button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-sale': 'details', onclick: () => actions.openPage(), text: ts('details') })));
}

/** Start confirmation (template.primitive.dialog). */
export function confirmSaleStart(doc, container, { snap, language, onStart, returnFocus }) {
  const ts = texts(language);
  const count = snap.plans.length;
  const rows = snap.plans.map((p) => h(doc, 'tr', {},
    h(doc, 'td', {}, h(doc, 'span', { class: 'mono-code', text: p.saleName })),
    h(doc, 'td', { text: `${fmtDay(p.startDate, language)} → ${fmtDay(p.endDate, language)}` })));
  const body = h(doc, 'div', { class: 'stack' },
    h(doc, 'div', { class: 'table-wrap table-scroll' }, h(doc, 'table', { class: 'table' },
      h(doc, 'thead', {}, h(doc, 'tr', {}, h(doc, 'th', { text: ts('colCode') }), h(doc, 'th', { text: ts('colDates') }))),
      h(doc, 'tbody', {}, rows))),
    h(doc, 'ul', { class: 'steps-list' }, h(doc, 'li', { text: ts('confirmNote1') }), h(doc, 'li', { text: ts('confirmNote2') }), h(doc, 'li', { text: ts('confirmNote3') })));
  return openDialog(doc, container, {
    title: ts('confirmTitle', { count }), description: ts('confirmText', { discount: snap.config.discount }), body, closeLabel: ts('cancel'), returnFocus,
    footer: (close) => [
      h(doc, 'button', { class: 'btn btn-outline', type: 'button', onclick: close, text: ts('cancel') }),
      h(doc, 'button', { class: 'btn btn-default', type: 'button', 'data-sale': 'confirm-start', onclick: () => { close(); onStart(); }, text: ts('confirmStart', { count }) }),
    ],
  });
}

/** Workspace page with Overview, Settings and Report. */
export function renderSalePage(doc, { snap, language, actions, tab = 'overview', onTab, message = '' }) {
  const ts = texts(language);
  const { done, total } = summary(snap);
  const job = snap.job;
  const running = Boolean(job?.active);

  const tile = (label, value, hint, extra = null) => h(doc, 'div', { class: 'tile' },
    h(doc, 'span', { class: 'overline', text: label }), h(doc, 'span', { class: 'tile-value', text: value }), extra, hint ? h(doc, 'span', { class: 'field-hint', text: hint }) : null);

  const overview = () => h(doc, 'div', { class: 'stack-lg' },
    h(doc, 'div', { class: 'tiles' },
      tile(ts('tileRange'), total ? `${fmtDay(snap.plans[0].startDate, language)} – ${fmtDay(snap.plans[total - 1].startDate, language)}` : '—', ts('perCampaign', { days: snap.config.saleDurationDays })),
      tile(ts('tileDiscount'), language === 'tr' ? `%${snap.config.discount}` : `${snap.config.discount}%`, ts('everywhere')),
      tile(ts('tileCount'), String(total), snap.config.discountName ? snap.plans[0]?.saleName : null),
      tile(ts('tileProgress'), `${done} / ${total}`, ts('verified', { n: (job?.results ?? []).filter((r) => r.verified).length }), progress(doc, done, total, ts('tileProgress')))),
    running && job.paused && job.errorReason ? h(doc, 'p', { class: 'alert-warn', role: 'status', text: ts('pausedWhy', { reason: job.errorReason }) }) : null,
    h(doc, 'div', { class: 'row-actions' }, ...actionButtons(doc, ts, snap, actions), h(doc, 'button', { class: 'btn btn-ghost', type: 'button', onclick: () => actions.openEtsy(), text: ts('openEtsy') })),
    card(doc, { id: 'eat-sale-plan', title: ts('planned') },
      h(doc, 'div', { class: 'table-wrap' }, h(doc, 'table', { class: 'table', 'data-role': 'sale-plan' },
        h(doc, 'thead', {}, h(doc, 'tr', {}, ['#', ts('colCode'), ts('colDates'), ts('colStatus'), ts('colCheck')].map((c) => h(doc, 'th', { text: c })))),
        h(doc, 'tbody', {}, snap.plans.map((p, i) => {
          const st = rowStatus(p, job);
          return h(doc, 'tr', { 'data-code': p.saleName },
            h(doc, 'td', { class: 'muted', text: String(i + 1) }),
            h(doc, 'td', {}, h(doc, 'span', { class: 'mono-code', text: p.saleName })),
            h(doc, 'td', { text: `${fmtDay(p.startDate, language)} → ${fmtDay(p.endDate, language)}` }),
            h(doc, 'td', {}, h(doc, 'span', { class: `badge ${st.tone}`, text: ts(st.key) })),
            h(doc, 'td', { class: 'muted', text: st.verified ? ts('checked') : ts('notChecked') }));
        }))))));

  const settingsForm = () => {
    const c = snap.config;
    const input = (name, type, value, attrs = {}) => h(doc, 'input', { class: 'input', id: `eat-sale-${name}`, name, type, value: String(value ?? ''), disabled: running, ...attrs });
    const fieldRow = (name, label, control, hint) => h(doc, 'div', { class: 'field-col' },
      h(doc, 'label', { class: 'label', for: `eat-sale-${name}`, text: label }), control, hint ? h(doc, 'span', { class: 'field-hint', text: hint }) : null);
    const resume = checkbox(doc, { name: 'autoResumeOnLoad', label: ts('fResume'), hint: ts('fResumeHint'), checked: c.autoResumeOnLoad, onChange: () => {} });
    if (running) resume.querySelector('input').disabled = true;
    const form = h(doc, 'form', { class: 'stack-lg', 'data-role': 'sale-settings', onsubmit: async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      await actions.updateConfig({
        batchStartDate: f.elements.batchStartDate.value,
        batchEndDate: f.elements.batchEndDate.value,
        saleDurationDays: Number(f.elements.saleDurationDays.value),
        discount: Number(f.elements.discount.value),
        discountName: f.elements.discountName.value,
        autoResumeOnLoad: f.elements.autoResumeOnLoad.checked,
      });
      actions.say(ts('saved'));
    } },
    h(doc, 'div', { class: 'cards' },
      card(doc, { id: 'eat-sale-dates', title: ts('tileRange') },
        fieldRow('batchStartDate', ts('fStart'), input('batchStartDate', 'date', c.batchStartDate)),
        fieldRow('batchEndDate', ts('fEnd'), input('batchEndDate', 'date', c.batchEndDate)),
        fieldRow('saleDurationDays', ts('fDuration'), input('saleDurationDays', 'number', c.saleDurationDays, { min: 1, max: 30 }))),
      card(doc, { id: 'eat-sale-code', title: ts('tileDiscount') },
        fieldRow('discount', ts('fDiscount'), input('discount', 'number', c.discount, { min: 1, max: 90 })),
        fieldRow('discountName', ts('fPrefix'), input('discountName', 'text', c.discountName, { maxlength: 12, pattern: '[A-Za-z0-9]*', autocomplete: 'off', spellcheck: 'false' }), ts('fPrefixHint')),
        fieldRow('region', ts('fRegion'), h(doc, 'input', { class: 'input', id: 'eat-sale-region', value: 'Everywhere', readonly: true })),
        resume)),
    running ? h(doc, 'p', { class: 'field-hint', role: 'status', text: ts('lockedWhileRunning') }) : null,
    h(doc, 'div', {}, h(doc, 'button', { class: 'btn btn-default', type: 'submit', disabled: running, 'data-sale': 'save', text: ts('save') })));
    return form;
  };

  const report = () => {
    const rows = snap.lastReport?.results ?? [];
    if (!rows.length) return h(doc, 'p', { class: 'field-hint', 'data-role': 'sale-no-report', text: ts('noReport') });
    const tone = { SUCCESS: ['stDone', 'badge-ok'], ERROR: ['stError', 'badge-err'], STOPPED: ['stStopped', 'badge-warn'] };
    return h(doc, 'div', { class: 'stack-lg' },
      h(doc, 'div', { class: 'row-actions' },
        h(doc, 'button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => actions.downloadCsv(), text: ts('csv') }),
        h(doc, 'button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => actions.downloadExcel(), text: ts('excel') })),
      h(doc, 'div', { class: 'table-wrap' }, h(doc, 'table', { class: 'table', 'data-role': 'sale-report' },
        h(doc, 'thead', {}, h(doc, 'tr', {}, [ts('colStatus'), ts('colCode'), ts('colDates'), ts('colCheck')].map((c) => h(doc, 'th', { text: c })))),
        h(doc, 'tbody', {}, rows.map((r) => {
          const [key, cls] = tone[r.status] ?? ['stPlanned', ''];
          return h(doc, 'tr', {},
            h(doc, 'td', {}, h(doc, 'span', { class: `badge ${cls}`, text: ts(key) })),
            h(doc, 'td', {}, h(doc, 'span', { class: 'mono-code', text: r.saleName ?? '' })),
            h(doc, 'td', { text: `${fmtDay(r.startDate, language)} → ${fmtDay(r.endDate, language)}` }),
            h(doc, 'td', { class: 'muted', text: r.verified ? ts('checked') : ts('notChecked') }));
        })))));
  };

  const pages = { overview, settings: settingsForm, report };
  return h(doc, 'div', { style: 'display:contents' },
    h(doc, 'div', { class: 'page-head' },
      h(doc, 'span', { class: 'overline', text: 'Sale Manager' }),
      h(doc, 'h1', { class: 'page-title', text: ts('title') }),
      h(doc, 'p', { class: 'page-description', text: ts('description') })),
    segmented(doc, {
      labelledBy: 'eat-sale-tabs', name: 'sale-tab', value: tab,
      options: [{ value: 'overview', label: ts('overview') }, { value: 'settings', label: ts('settings') }, { value: 'report', label: ts('report') }],
      onChange: (next) => onTab(next),
    }),
    (pages[tab] ?? overview)(),
    h(doc, 'p', { class: 'notice', role: 'status', 'aria-live': 'polite', text: message }));
}
