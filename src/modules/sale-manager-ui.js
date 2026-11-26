// Sale Manager screens, as the design canvas draws them: the drawer section
// (Main, Drawer-Error), the workspace page — Overview (Sale-Idle,
// Sale-Overview, Sale-Error), Settings (Sale-Settings), Report (Sale-Report),
// the first-use page (Sale-Empty) — and the start confirmation
// (Sale-StartConfirm).
//
// The screens only read the engine snapshot and call the engine's own actions
// (start, retry, skip, stop, updateConfig, downloads), so every rule of the
// standalone Sale Manager still decides what happens on Etsy.
//
// Design sources: template.primitive.card, .table, .badge, .progress, .button,
// .input, .tabs, .dialog; shadcn.blocks.kpi-widgets for the summary tiles;
// shadcn.blocks.datatable for the campaign and report tables.

import { h, icon } from '../ui/dom.js';
import { ICONS } from '../ui/icons.js';
import { pageHead, pageTabs, banner, alertBox, toggle, openDialog } from '../ui/controls.js';
import { interpolate } from '../core/i18n.js';
import { packText } from '../core/language-packs.js';

export const SALE_STRINGS = Object.freeze({
  en: Object.freeze({
    running: 'Running', paused: 'Paused', stopped: 'Stopped', ready: 'Ready', completed: 'Completed',
    campaignOf: 'Campaign {n}', series: '{count} campaigns · {start} – {end} · {discount}% off',
    start: 'Start the series', stop: 'End the series', pause: 'Pause the series', retry: 'Continue', skip: 'Skip this day', details: 'Open details',
    settings: 'Settings', overview: 'Overview', report: 'Report', openReport: 'Open the report', tabs: 'Sale Manager pages',
    title: 'Campaign series', description: 'Creates campaigns one after another on Sales & Discounts and checks each one in the Etsy list.',
    settingsTitle: 'Campaign settings', settingsText: 'Choose the series dates and the discount.',
    reportTitle: 'Series report', reportText: 'What each campaign of the last series ended with.',
    tileShop: 'Shop', tileRange: 'Start range', tileDiscount: 'Discount', tileProgress: 'Progress', notStarted: 'Not started yet',
    perCampaign: 'Each campaign {days} day(s)', everywhere: 'Valid: Everywhere',
    planned: 'Planned campaigns', count: '{count} campaigns', colCode: 'Code', colDates: 'Date', colStatus: 'Status', colCheck: 'Check', colNote: 'Note', colTime: 'Time',
    stPlanned: 'Planned', stQueued: 'Queued', stDone: 'Created', stError: 'Not verified', stStopped: 'Stopped', stCurrent: 'Creating…',
    checked: 'Certain', waiting: 'Waiting', failed: 'Not possible', notChecked: '—',
    runningBanner: 'The series is running. Campaign {n} is being created.', runningText: 'Do not close this tab. If the page reloads, the series continues where it left off once you confirm.',
    tabOwner: 'Tab owner: this tab',
    readyBanner: 'The series is ready.', readyText: '{count} campaigns planned. Check the dates and codes before starting; this tab must stay open until the series ends.',
    stoppedBanner: 'The series stopped. Campaign {n} could not be verified in the Etsy list.', stoppedText: 'The campaign may have been created. Search the Sales & Discounts list for {code}; if it is there, continue, if not, end the series.',
    stepTitle: 'Current step', step1: 'The campaign form opened', step2: 'Code and discount entered', step3: 'Dates being chosen', step4: 'Save and verify in the list',
    safety: 'If a result cannot be verified for certain, the series stops and asks you. No step is repeated on its own.',
    lastSeries: 'Last series', noLastSeries: 'No series has run yet.',
    emptyTitle: 'You have no campaign series yet', emptyText: 'A series creates several campaigns one after another on Sales & Discounts and verifies each in the Etsy list. You can set up your first series in a few minutes.',
    emptyStart: 'Set up the first series', openEtsy: 'Open Sales & Discounts', howItWorks: 'How it works',
    how1: 'Choose dates and discount', how1Text: 'First day, number of campaigns and the discount.',
    how2: 'Check the codes', how2Text: 'Each campaign gets its own code from the date and your text.',
    how3: 'Start and follow', how3Text: 'Campaigns are created one by one and verified in the list.',
    confirmTitle: 'Start the series?', confirmText: '{count} campaigns will be created one after another on Sales & Discounts.',
    confirmDiscount: '{discount}% off · Everywhere', confirmNote1: 'Each campaign is checked in the Etsy list after it is created.',
    confirmNote2: 'At a step that cannot be verified the series stops and asks you.', confirmNote3: 'Keep this tab open until the series ends.',
    confirmStart: 'Start {count} campaigns', cancel: 'Cancel',
    datesTitle: 'Date and discount', fStart: 'First start date', fEnd: 'Last start date', fDuration: 'Campaign length', days: 'days', fDiscount: 'Discount percentage', fRegion: 'Valid in', fResult: 'Result',
    resultText: '{count} campaigns · one after another, not overlapping',
    codeTitle: 'Campaign code', codeText: 'The code is the start date, your text and the discount.', fPrefix: 'Code text', fPrefixHint: 'Letters and digits only, up to 12.',
    codeResult: 'Code that will be created', codeLength: '{n} / 20 characters · valid', codeTooLong: '{n} / 20 characters · too long', codeRule: 'Etsy codes use letters and digits only.',
    previewTitle: 'Preview', previewFoot: 'All {discount}% · Everywhere · codes differ from each other',
    howTitle: 'How it runs', fResume: 'Continue after a reload', fResumeHint: 'You are asked first.', verifyEach: 'Verify after each campaign', verifyEachHint: 'Cannot be turned off.', alwaysOn: 'Always on',
    unsaved: 'Unsaved changes', save: 'Save only', saveStart: 'Save and start the series', saved: 'Settings saved.', lockedWhileRunning: 'Settings are locked while a series runs.',
    filterAll: 'All · {n}', filterDone: 'Created · {n}', filterError: 'Error · {n}', filterStopped: 'Stopped · {n}', filter: 'Filter by status', seriesPick: 'Series',
    repPlanned: 'Planned', repDone: 'Created', repDoneHint: 'All verified for certain', repError: 'Error', repErrorHint: 'The series stopped safely', repStopped: 'Stopped', repStoppedHint: 'At your request',
    noReport: 'No report yet. A report appears after the first series.', csv: 'Download CSV', excel: 'Download Excel',
    phase: 'Step: {phase}', launcher: 'Series {done} / {total} running.',
  }),
});

// Bundled English; other languages read the downloaded pack ("sale." keys).
function texts(language) {
  const lang = SALE_STRINGS[language] ? language : 'en';
  return (key, vars) => interpolate(SALE_STRINGS[language]?.[key] ?? packText(language, `sale.${key}`) ?? SALE_STRINGS[lang][key] ?? SALE_STRINGS.en[key] ?? key, vars);
}

const day = (iso) => { const [y, m, d] = String(iso || '').split('-').map(Number); return y ? new Date(y, m - 1, d) : null; };
const fmtDay = (iso, language) => { const d = day(iso); return d ? new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }).format(d) : '—'; };
function fmtRange(a, b, language) {
  const da = day(a); const db = day(b);
  if (!da || !db) return '—';
  try { return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', year: 'numeric' }).formatRange(da, db); } catch { return `${fmtDay(a, language)} – ${fmtDay(b, language)}`; }
}
const pct = (n, language) => (language === 'tr' ? `%${n}` : `${n}%`);

/** Status of one planned campaign, from the engine's results. */
function rowStatus(plan, job) {
  const row = (job?.results ?? []).find((r) => r.saleName === plan.saleName || r.startDate === plan.startDate);
  if (row?.status === 'SUCCESS') return { key: 'stDone', tone: 'ok', check: row.verified ? 'checked' : 'waiting' };
  if (row?.status === 'ERROR') return { key: 'stError', tone: 'err', check: 'failed', error: true };
  if (row?.status === 'STOPPED') return { key: 'stStopped', tone: 'warn', check: 'notChecked' };
  if (job?.active && job.currentDate === plan.startDate) return job.paused ? { key: 'stError', tone: 'err', check: 'failed', error: true } : { key: 'stCurrent', tone: 'dark', check: 'waiting', current: true };
  return { key: job?.active ? 'stQueued' : 'stPlanned', tone: '', check: 'notChecked', dot: true };
}

export function summary(snap) {
  const done = (snap.job?.results ?? []).filter((r) => r.status === 'SUCCESS').length;
  const total = snap.plans.length;
  const index = Math.max(0, snap.plans.findIndex((p) => p.startDate === snap.job?.currentDate));
  return { done, total, index };
}

/** 0-based index of the current step of a campaign, from the engine's phase. */
function stepIndex(phase) {
  if (['verify_created', 'await_result', 'confirm_sale'].includes(phase)) return 3;
  if (phase === 'select_listings') return 2;
  if (phase === 'fill_form') return 1;
  return 0;
}

function prog(doc, value, total, label, style = '') {
  return h(doc, 'div', { class: 'prog', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(value), 'aria-label': label, style },
    h(doc, 'i', { style: `width: ${total ? Math.round((value / total) * 100) : 0}%;` }));
}

function badge(doc, ts, st) {
  return h(doc, 'span', { class: st.tone ? `badge ${st.tone}` : 'badge' }, st.dot ? h(doc, 'span', { class: 'dot soft' }) : null, ts(st.key));
}

/** Drawer section for the Sales & Discounts page (Main, Drawer-Error). */
export function renderSaleDrawer(doc, { snap, language, actions }) {
  const ts = texts(language);
  const { done, total, index } = summary(snap);
  const job = snap.job;
  const stopped = Boolean(job?.active && job.paused);
  const current = job?.active ? snap.plans[index] : null;
  const state = job?.active ? (stopped ? h(doc, 'span', { class: 'badge err', text: ts('stopped') }) : h(doc, 'span', { class: 'badge dark', text: ts('running') })) : h(doc, 'span', { class: 'badge', text: ts('ready') });
  return h(doc, 'div', { class: 'col', style: 'gap: 12px;', 'data-role': 'sale-drawer' },
    h(doc, 'div', { class: 'row' }, icon(doc, ICONS['sale-manager']), h(doc, 'span', { class: 'h3 grow', id: 'eat-current', text: 'Sale Manager' }), state),
    stopped && job.errorReason ? alertBox(doc, { tone: 'err', title: ts('stoppedBanner', { n: index + 1 }), text: job.errorReason }) : null,
    job?.active
      ? h(doc, 'div', { class: 'col', style: 'gap: 6px;' },
        h(doc, 'div', { class: 'row xs mute2' },
          h(doc, 'span', { class: 'grow' }, `${ts('campaignOf', { n: index + 1 })}: `, h(doc, 'span', { class: 'mono b', style: 'color: var(--fg);', text: current?.saleName ?? '—' })),
          h(doc, 'span', { class: 'num', text: `${done} / ${total}` })),
        prog(doc, done, total, ts('tileProgress')),
        !stopped ? h(doc, 'span', { class: 'xxs mute', text: ts(`step${stepIndex(job.phase) + 1}`) }) : null)
      : h(doc, 'span', { class: 'xs mute2', text: total ? ts('series', { count: total, start: fmtDay(snap.plans[0].startDate, language), end: fmtDay(snap.plans[total - 1].startDate, language), discount: snap.config.discount }) : '—' }),
    h(doc, 'div', { class: 'row' },
      stopped
        ? [h(doc, 'button', { class: 'btn btn-o btn-sm grow', type: 'button', 'data-sale': 'retry', onclick: () => actions.retry() }, icon(doc, ICONS.refresh, 14), ts('retry')),
          h(doc, 'button', { class: 'btn btn-p btn-sm grow', type: 'button', 'data-sale': 'report-problem', onclick: (e) => actions.report?.({ category: 'interrupted', tool: 'sale-manager', returnFocus: e.currentTarget }), text: actions.reportLabel ?? 'Report a problem' })]
        : job?.active
          ? [h(doc, 'button', { class: 'btn btn-o btn-sm grow', type: 'button', 'data-sale': 'stop', onclick: () => actions.stop() }, icon(doc, ICONS.power ?? ICONS.close, 14), ts('stop')),
            h(doc, 'button', { class: 'btn btn-p btn-sm grow', type: 'button', 'data-sale': 'details', onclick: () => actions.openPage(), text: ts('details') })]
          : [h(doc, 'button', { class: 'btn btn-o btn-sm grow', type: 'button', 'data-sale': 'details', onclick: () => actions.openPage(), text: ts('details') }),
            h(doc, 'button', { class: 'btn btn-p btn-sm grow', type: 'button', 'data-sale': 'start', disabled: !snap.plans.length, onclick: (e) => actions.confirmStart(e.currentTarget), text: ts('start') })]));
}

/** Start confirmation (Sale-StartConfirm). */
export function confirmSaleStart(doc, container, { snap, language, onStart, returnFocus }) {
  const ts = texts(language);
  const count = snap.plans.length;
  const body = h(doc, 'div', { class: 'col', style: 'gap: 12px;' },
    h(doc, 'div', { class: 'row sm' }, h(doc, 'span', { class: 'badge out', text: ts('confirmDiscount', { discount: snap.config.discount }) }), h(doc, 'span', { class: 'xs mute', text: fmtRange(snap.plans[0]?.startDate, snap.plans[count - 1]?.startDate, language) })),
    h(doc, 'div', { class: 'card', style: 'max-height: 240px; overflow-y: auto; box-shadow: none;' }, h(doc, 'table', { class: 'tbl' },
      h(doc, 'thead', {}, h(doc, 'tr', {}, h(doc, 'th', { text: ts('colCode') }), h(doc, 'th', { text: ts('colDates') }))),
      h(doc, 'tbody', {}, snap.plans.map((p) => h(doc, 'tr', {}, h(doc, 'td', {}, h(doc, 'span', { class: 'mono b', text: p.saleName })), h(doc, 'td', { class: 'num', text: `${fmtDay(p.startDate, language)} → ${fmtDay(p.endDate, language)}` })))))),
    h(doc, 'ul', { class: 'sm mute2 notes' }, h(doc, 'li', { text: ts('confirmNote1') }), h(doc, 'li', { text: ts('confirmNote2') }), h(doc, 'li', { text: ts('confirmNote3') })));
  return openDialog(doc, container, {
    title: ts('confirmTitle'), description: ts('confirmText', { count }), body, closeLabel: ts('cancel'), returnFocus, width: 520, iconWell: ICONS.play,
    footer: (close) => [
      h(doc, 'button', { class: 'btn btn-g', type: 'button', onclick: close, text: ts('cancel') }),
      h(doc, 'button', { class: 'btn btn-p', type: 'button', 'data-sale': 'confirm-start', onclick: () => { close(); onStart(); } }, icon(doc, ICONS.play, 14), ts('confirmStart', { count })),
    ],
  });
}

/** Workspace page with Overview, Settings and Report. */
export function renderSalePage(doc, { snap, language, actions, tab = 'overview', onTab, message = '' }) {
  const ts = texts(language);
  const { done, total, index } = summary(snap);
  const job = snap.job;
  const running = Boolean(job?.active);
  const stopped = running && job.paused;
  const reportRows = snap.lastReport?.results ?? [];

  // ── Overview (Sale-Idle / Sale-Overview / Sale-Error) and first use (Sale-Empty) ──
  const tiles = () => h(doc, 'div', { class: 'g4' },
    h(doc, 'div', { class: 'tile' }, h(doc, 'span', { class: 'ov', text: ts('tileShop') }), h(doc, 'span', { class: 'v trunc', style: 'font-size: 18px;', text: job?.shop?.shopName || snap.lastReport?.results?.[0]?.shopName || '—' }), h(doc, 'span', { class: 'xs mute', text: job?.shop?.shopId ? `#${job.shop.shopId}` : 'Etsy' })),
    h(doc, 'div', { class: 'tile' }, h(doc, 'span', { class: 'ov', text: ts('tileRange') }), h(doc, 'span', { class: 'v', style: 'font-size: 18px;', text: total ? fmtRange(snap.plans[0].startDate, snap.plans[total - 1].startDate, language) : '—' }), h(doc, 'span', { class: 'xs mute', text: ts('perCampaign', { days: snap.config.saleDurationDays }) })),
    h(doc, 'div', { class: 'tile' }, h(doc, 'span', { class: 'ov', text: ts('tileDiscount') }), h(doc, 'span', { class: 'v', style: 'font-size: 18px;', text: pct(snap.config.discount, language) }), h(doc, 'span', { class: 'xs mute', text: ts('everywhere') })),
    h(doc, 'div', { class: 'tile' }, h(doc, 'span', { class: 'ov', text: ts('tileProgress') }), h(doc, 'span', { class: 'v', text: `${done} / ${total}` }), running ? prog(doc, done, total, ts('tileProgress'), 'margin-top: 4px;') : h(doc, 'span', { class: 'xs mute', text: ts('notStarted') })));

  const plan = () => h(doc, 'section', { class: 'card grow', style: 'align-self: flex-start;' },
    h(doc, 'div', { class: 'card-h' }, h(doc, 'h2', { class: 'h2 grow', text: ts('planned') }), h(doc, 'span', { class: 'xs mute', text: ts('count', { count: total }) })),
    h(doc, 'table', { class: 'tbl', 'data-role': 'sale-plan' },
      h(doc, 'thead', {}, h(doc, 'tr', {}, ['#', ts('colCode'), ts('colDates'), ts('colStatus'), ts('colCheck')].map((c) => h(doc, 'th', { text: c })))),
      h(doc, 'tbody', {}, snap.plans.map((p, i) => {
        const st = rowStatus(p, job);
        return h(doc, 'tr', { 'data-code': p.saleName, class: st.error ? 'row-err' : null, style: !st.error && st.current ? 'background: var(--soft2);' : null },
          h(doc, 'td', { class: 'mute num', text: String(i + 1) }),
          h(doc, 'td', {}, h(doc, 'span', { class: 'mono b', text: p.saleName })),
          h(doc, 'td', { class: 'num', text: `${fmtDay(p.startDate, language)} → ${fmtDay(p.endDate, language)}` }),
          h(doc, 'td', {}, badge(doc, ts, st)),
          h(doc, 'td', { class: st.check === 'checked' ? 'mute2' : st.check === 'failed' ? '' : 'mute', text: ts(st.check) }));
      }))));

  const steps = () => {
    const current = stepIndex(job?.phase);
    return h(doc, 'section', { class: 'card' },
      h(doc, 'div', { class: 'card-h' }, h(doc, 'h2', { class: 'h2 grow', text: ts('stepTitle') }), h(doc, 'span', { class: 'xs mute num', text: `${current + 1} / 4` })),
      h(doc, 'ol', { class: 'sale-steps' }, [1, 2, 3, 4].map((n) => {
        const i = n - 1;
        const state = i < current ? 'done' : i === current ? 'now' : 'next';
        return h(doc, 'li', { class: `row sm${state === 'now' ? ' b' : state === 'next' ? ' mute' : ''}` },
          h(doc, 'span', { class: `well step-${state}` }, state === 'done' ? icon(doc, ICONS.check, 14) : null), ts(`step${n}`));
      })));
  };

  const lastSeries = () => {
    const by = (s) => reportRows.filter((r) => r.status === s).length;
    return h(doc, 'section', { class: 'card' },
      h(doc, 'div', { class: 'card-h' }, h(doc, 'h2', { class: 'h2 grow', text: ts('lastSeries') }), reportRows[0]?.createdAt ? h(doc, 'span', { class: 'xs mute', text: new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(new Date(reportRows[0].createdAt)) }) : null),
      reportRows.length
        ? h(doc, 'div', { class: 'list' },
          h(doc, 'div', { class: 'li sm' }, h(doc, 'span', { class: 'grow', text: ts('stDone') }), h(doc, 'span', { class: 'num b', text: String(by('SUCCESS')) })),
          h(doc, 'div', { class: 'li sm' }, h(doc, 'span', { class: 'grow', text: ts('stError') }), h(doc, 'span', { class: 'num b', style: by('ERROR') ? 'color: #b91c1c;' : null, text: String(by('ERROR')) })),
          h(doc, 'div', { class: 'li sm' }, h(doc, 'span', { class: 'grow', text: ts('stStopped') }), h(doc, 'span', { class: 'num b', text: String(by('STOPPED')) })))
        : h(doc, 'div', { class: 'card-b xs mute', text: ts('noLastSeries') }));
  };

  const empty = () => h(doc, 'section', { class: 'card empty', 'aria-labelledby': 'eat-sale-empty' },
    h(doc, 'div', { class: 'ei' }, icon(doc, ICONS['sale-manager'], 24)),
    h(doc, 'h2', { class: 'et', id: 'eat-sale-empty', text: ts('emptyTitle') }),
    h(doc, 'p', { class: 'ed', text: ts('emptyText') }),
    h(doc, 'div', { class: 'ea' },
      h(doc, 'button', { class: 'btn btn-p', type: 'button', onclick: () => onTab('settings'), text: ts('emptyStart') }),
      h(doc, 'button', { class: 'btn btn-o', type: 'button', onclick: () => actions.openEtsy(), text: ts('openEtsy') })),
    h(doc, 'div', { class: 'steps', 'aria-label': ts('howItWorks') }, [1, 2, 3].map((n) => h(doc, 'div', {},
      h(doc, 'span', { class: 'n', text: String(n) }),
      h(doc, 'span', {}, h(doc, 'span', { class: 'st', text: ts(`how${n}`) }), h(doc, 'span', { class: 'sd', text: ts(`how${n}Text`) }))))));

  const overview = () => {
    if (!running && !total && !reportRows.length) return [empty()];
    const current = snap.plans[index];
    return [
      stopped
        ? banner(doc, { tone: 'err', iconPaths: ICONS.error, title: ts('stoppedBanner', { n: index + 1 }), text: job.errorReason || ts('stoppedText', { code: current?.saleName ?? '' }) })
        : running
          ? banner(doc, { iconPaths: ICONS.clock, title: ts('runningBanner', { n: index + 1 }), text: ts('runningText'), after: snap.leaseOwned ? h(doc, 'span', { class: 'badge out', text: ts('tabOwner') }) : null })
          : banner(doc, { iconPaths: ICONS.info, title: ts('readyBanner'), text: ts('readyText', { count: total }) }),
      tiles(),
      h(doc, 'div', { class: 'cols' },
        plan(),
        h(doc, 'aside', { class: 'col', style: 'width: 340px; flex: none; gap: 16px;' },
          running ? steps() : lastSeries(),
          h(doc, 'div', { class: 'banner' }, icon(doc, ICONS.shield), h(doc, 'span', { text: ts('safety') })))),
    ];
  };

  // ── Settings (Sale-Settings) ──
  const settingsForm = () => {
    const c = snap.config;
    const draft = { ...c };
    // Etsy cannot start a sale in the past, so the date fields start at today.
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    // A start date saved earlier that is now past shows the day the plan really starts from.
    const startValue = !running && String(c.batchStartDate) < todayIso ? (snap.plans[0]?.startDate ?? todayIso) : c.batchStartDate;
    const input = (name, type, value, attrs = {}) => h(doc, 'input', { class: 'input', id: `eat-sale-${name}`, name, type, value: String(value ?? ''), disabled: running, oninput: () => mark(), ...attrs });
    const fld = (name, label, control) => h(doc, 'div', { class: 'field' }, h(doc, 'label', { class: 'label', for: `eat-sale-${name}`, text: label }), control);
    const codeOut = h(doc, 'span', { class: 'mono b', style: 'font-size: 20px; line-height: 26px; letter-spacing: .02em;' });
    const codeState = h(doc, 'span', { class: 'badge ok' });
    const unsaved = h(doc, 'span', { class: 'xs mute grow' });
    const resumeSwitch = toggle(doc, { name: 'autoResumeOnLoad', checked: c.autoResumeOnLoad, labelledBy: 'eat-sale-resume', disabled: running, onChange: (on) => { draft.autoResumeOnLoad = on; mark(); } });
    const form = h(doc, 'form', { class: 'sale-form', 'data-role': 'sale-settings', onsubmit: (e) => { e.preventDefault(); void save(false); } });
    function values() {
      const f = form.elements;
      return {
        batchStartDate: f.batchStartDate.value, batchEndDate: f.batchEndDate.value,
        saleDurationDays: Number(f.saleDurationDays.value), discount: Number(f.discount.value),
        discountName: f.discountName.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12), autoResumeOnLoad: draft.autoResumeOnLoad,
      };
    }
    function mark() {
      const v = values();
      const first = snap.plans[0]?.saleName?.slice(0, 6) ?? String(v.batchStartDate).replace(/-/g, '').slice(2);
      const code = `${first}${v.discountName}${v.discount}`;
      codeOut.textContent = code;
      codeState.className = code.length > 20 ? 'badge warn' : 'badge ok';
      codeState.textContent = ts(code.length > 20 ? 'codeTooLong' : 'codeLength', { n: code.length });
      const changed = Object.keys(v).some((k) => String(v[k]) !== String(c[k]));
      unsaved.textContent = changed ? ts('unsaved') : '';
    }
    async function save(andStart) {
      await actions.updateConfig(values());
      actions.say(ts('saved'));
      if (andStart) actions.confirmStart(null);
    }
    form.append(
      h(doc, 'div', { class: 'cols' },
        h(doc, 'div', { class: 'col grow', style: 'gap: 16px;' },
          h(doc, 'section', { class: 'card' },
            h(doc, 'div', { class: 'card-h' }, h(doc, 'h2', { class: 'h2', text: ts('datesTitle') })),
            h(doc, 'div', { class: 'card-b g3', style: 'gap: 12px;' },
              fld('batchStartDate', ts('fStart'), input('batchStartDate', 'date', startValue, { min: todayIso })),
              fld('batchEndDate', ts('fEnd'), input('batchEndDate', 'date', c.batchEndDate, { min: todayIso })),
              fld('saleDurationDays', ts('fDuration'), h(doc, 'span', { class: 'row' }, input('saleDurationDays', 'number', c.saleDurationDays, { min: 1, max: 30, style: 'width: 80px;' }), h(doc, 'span', { class: 'sm mute2', text: ts('days') }))),
              fld('discount', ts('fDiscount'), h(doc, 'span', { class: 'row' }, h(doc, 'span', { class: 'sm mute2', text: '%' }), input('discount', 'number', c.discount, { min: 1, max: 90, style: 'width: 80px;' }))),
              fld('region', ts('fRegion'), h(doc, 'select', { class: 'input', id: 'eat-sale-region', disabled: true }, h(doc, 'option', { text: 'Everywhere' }))),
              h(doc, 'div', { class: 'field' }, h(doc, 'span', { class: 'label', text: ts('fResult') }), h(doc, 'span', { class: 'sm mute2', style: 'line-height: 36px;', text: ts('resultText', { count: total }) })))),
          h(doc, 'section', { class: 'card' },
            h(doc, 'div', { class: 'card-h' }, h(doc, 'div', { class: 'col grow', style: 'gap: 2px;' }, h(doc, 'h2', { class: 'h2', text: ts('codeTitle') }), h(doc, 'span', { class: 'xs mute', text: ts('codeText') }))),
            h(doc, 'div', { class: 'card-b col', style: 'gap: 12px;' },
              h(doc, 'div', { class: 'field' }, h(doc, 'label', { class: 'label', for: 'eat-sale-discountName', text: ts('fPrefix') }), input('discountName', 'text', c.discountName, { maxlength: 12, pattern: '[A-Za-z0-9]*', autocomplete: 'off', spellcheck: 'false', class: 'input mono', style: 'max-width: 240px;' }), h(doc, 'span', { class: 'hint', text: ts('fPrefixHint') })),
              h(doc, 'div', { class: 'code-out' },
                h(doc, 'div', { class: 'row' }, h(doc, 'span', { class: 'ov grow', text: ts('codeResult') }), codeState),
                h(doc, 'div', { class: 'row' }, codeOut, h(doc, 'span', { class: 'grow' }), h(doc, 'span', { class: 'xs mute', text: ts('codeRule') })))))),
        h(doc, 'aside', { class: 'col', style: 'width: 340px; flex: none; gap: 16px;' },
          h(doc, 'section', { class: 'card' },
            h(doc, 'div', { class: 'card-h' }, h(doc, 'h2', { class: 'h2 grow', text: ts('previewTitle') }), h(doc, 'span', { class: 'xs mute', text: ts('count', { count: total }) })),
            h(doc, 'div', { class: 'list' }, snap.plans.slice(0, 8).map((p) => h(doc, 'div', { class: 'li', style: 'padding: 10px 16px;' }, h(doc, 'span', { class: 'mono b grow', text: p.saleName }), h(doc, 'span', { class: 'xs mute num', text: `${fmtDay(p.startDate, language)} → ${fmtDay(p.endDate, language)}` })))),
            h(doc, 'div', { class: 'card-f xs mute', text: ts('previewFoot', { discount: c.discount }) })),
          h(doc, 'section', { class: 'card' },
            h(doc, 'div', { class: 'card-h' }, h(doc, 'h2', { class: 'h2', text: ts('howTitle') })),
            h(doc, 'div', { class: 'list' },
              h(doc, 'div', { class: 'li' }, h(doc, 'span', { class: 'col grow', style: 'gap: 1px;' }, h(doc, 'span', { class: 'sm b', id: 'eat-sale-resume', text: ts('fResume') }), h(doc, 'span', { class: 'xs mute', text: ts('fResumeHint') })), resumeSwitch),
              h(doc, 'div', { class: 'li' }, h(doc, 'span', { class: 'col grow', style: 'gap: 1px;' }, h(doc, 'span', { class: 'sm b', text: ts('verifyEach') }), h(doc, 'span', { class: 'xs mute', text: ts('verifyEachHint') })), h(doc, 'span', { class: 'badge out', text: ts('alwaysOn') })))))),
      h(doc, 'div', { class: 'savebar' },
        running ? h(doc, 'span', { class: 'xs mute grow', role: 'status', text: ts('lockedWhileRunning') }) : unsaved,
        h(doc, 'button', { class: 'btn btn-g', type: 'button', disabled: running, onclick: () => onTab('settings'), text: ts('cancel') }),
        h(doc, 'button', { class: 'btn btn-o', type: 'submit', disabled: running, 'data-sale': 'save', text: ts('save') }),
        h(doc, 'button', { class: 'btn btn-p', type: 'button', disabled: running, 'data-sale': 'save-start', onclick: () => save(true) }, icon(doc, ICONS.play, 16), ts('saveStart'))));
    mark();
    return [form];
  };

  // ── Report (Sale-Report) ──
  const report = () => {
    if (!reportRows.length) return [h(doc, 'section', { class: 'card empty', 'data-role': 'sale-no-report' }, h(doc, 'div', { class: 'ei' }, icon(doc, ICONS.file, 24)), h(doc, 'p', { class: 'ed', text: ts('noReport') }))];
    const filter = actions.reportFilter?.() ?? 'all';
    const counts = { all: reportRows.length, SUCCESS: 0, ERROR: 0, STOPPED: 0 };
    for (const r of reportRows) counts[r.status] = (counts[r.status] ?? 0) + 1;
    const tone = { SUCCESS: ['stDone', 'ok'], ERROR: ['stError', 'err'], STOPPED: ['stStopped', 'warn'] };
    const shown = filter === 'all' ? reportRows : reportRows.filter((r) => r.status === filter);
    const when = reportRows[0]?.createdAt ? new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(reportRows[0].createdAt)) : '';
    return [
      h(doc, 'div', { class: 'row', style: 'gap: 12px;' },
        h(doc, 'label', { class: 'field', style: 'width: 280px;' }, h(doc, 'span', { class: 'label', text: ts('seriesPick') }), h(doc, 'select', { class: 'input' }, h(doc, 'option', { text: [when, reportRows[0]?.shopName].filter(Boolean).join(' · ') || '—' }))),
        h(doc, 'span', { class: 'grow' }),
        h(doc, 'div', { class: 'seg', role: 'group', 'aria-label': ts('filter'), style: 'align-self: flex-end;' },
          [['all', 'filterAll', counts.all], ['SUCCESS', 'filterDone', counts.SUCCESS], ['ERROR', 'filterError', counts.ERROR], ['STOPPED', 'filterStopped', counts.STOPPED]].map(([v, k, n]) => h(doc, 'button', { type: 'button', class: filter === v ? 'on' : null, 'aria-pressed': String(filter === v), onclick: () => actions.setReportFilter?.(v), text: ts(k, { n }) })))),
      h(doc, 'div', { class: 'g4' },
        h(doc, 'div', { class: 'tile' }, h(doc, 'span', { class: 'ov', text: ts('repPlanned') }), h(doc, 'span', { class: 'v', text: String(counts.all) })),
        h(doc, 'div', { class: 'tile' }, h(doc, 'span', { class: 'ov', text: ts('repDone') }), h(doc, 'span', { class: 'v', text: String(counts.SUCCESS) }), h(doc, 'span', { class: 'xs mute', text: ts('repDoneHint') })),
        h(doc, 'div', { class: 'tile' }, h(doc, 'span', { class: 'ov', text: ts('repError') }), h(doc, 'span', { class: 'v', style: counts.ERROR ? 'color: #b91c1c;' : null, text: String(counts.ERROR) }), h(doc, 'span', { class: 'xs mute', text: ts('repErrorHint') })),
        h(doc, 'div', { class: 'tile' }, h(doc, 'span', { class: 'ov', text: ts('repStopped') }), h(doc, 'span', { class: 'v', text: String(counts.STOPPED) }), h(doc, 'span', { class: 'xs mute', text: ts('repStoppedHint') }))),
      h(doc, 'section', { class: 'card' },
        h(doc, 'table', { class: 'tbl', 'data-role': 'sale-report' },
          h(doc, 'thead', {}, h(doc, 'tr', {}, [ts('colStatus'), ts('colCode'), ts('colDates'), ts('colCheck'), ts('colNote')].map((c) => h(doc, 'th', { text: c })), h(doc, 'th', { class: 'r', text: ts('colTime') }))),
          h(doc, 'tbody', {}, shown.map((r) => {
            const [key, cls] = tone[r.status] ?? ['stPlanned', ''];
            return h(doc, 'tr', {},
              h(doc, 'td', {}, h(doc, 'span', { class: `badge ${cls}`, text: ts(key) })),
              h(doc, 'td', {}, h(doc, 'span', { class: 'mono b', text: r.saleName ?? '' }), h(doc, 'div', { class: 'xs mute', text: pct(r.discount ?? snap.config.discount, language) })),
              h(doc, 'td', { class: 'num', text: `${fmtDay(r.startDate, language)} → ${fmtDay(r.endDate, language)}` }),
              h(doc, 'td', { text: r.verified ? ts('checked') : r.status === 'ERROR' ? ts('failed') : ts('notChecked') }),
              h(doc, 'td', { class: 'mute2', text: r.message ?? '' }),
              h(doc, 'td', { class: 'r mute num', text: r.createdAt ? new Intl.DateTimeFormat(language, { timeStyle: 'short' }).format(new Date(r.createdAt)) : '' }));
          }))),
        h(doc, 'div', { class: 'card-f' }, h(doc, 'span', { class: 'grow' }),
          h(doc, 'button', { class: 'btn btn-o btn-sm', type: 'button', onclick: () => actions.downloadCsv() }, icon(doc, ICONS.download, 14), ts('csv')),
          h(doc, 'button', { class: 'btn btn-o btn-sm', type: 'button', onclick: () => actions.downloadExcel() }, icon(doc, ICONS.download, 14), ts('excel')))),
    ];
  };

  const heads = {
    overview: [ts('title'), ts('description')],
    settings: [ts('settingsTitle'), ts('settingsText')],
    report: [ts('reportTitle'), ts('reportText')],
  };
  const [title, description] = heads[tab] ?? heads.overview;
  const headActions = tab !== 'overview' ? [] : stopped
    ? [h(doc, 'button', { class: 'btn btn-o', type: 'button', 'data-sale': 'skip', onclick: () => actions.skip(), text: ts('skip') }),
      h(doc, 'button', { class: 'btn btn-o', type: 'button', 'data-sale': 'stop', onclick: () => actions.stop(), text: ts('stop') }),
      h(doc, 'button', { class: 'btn btn-p', type: 'button', 'data-sale': 'retry', onclick: () => actions.retry() }, icon(doc, ICONS.refresh, 16), ts('retry'))]
    : running
      ? [h(doc, 'button', { class: 'btn btn-o', type: 'button', onclick: () => onTab('report') }, icon(doc, ICONS.file, 16), ts('openReport')),
        h(doc, 'button', { class: 'btn btn-p', type: 'button', 'data-sale': 'stop', onclick: () => actions.stop() }, icon(doc, ICONS.power ?? ICONS.close, 16), ts('stop'))]
      : total
        ? [h(doc, 'button', { class: 'btn btn-o', type: 'button', onclick: () => onTab('settings'), text: ts('settings') }),
          h(doc, 'button', { class: 'btn btn-p', type: 'button', 'data-sale': 'start', onclick: (e) => actions.confirmStart(e.currentTarget) }, icon(doc, ICONS.play, 16), ts('start'))]
        : [];
  return [
    pageHead(doc, { overline: 'Sale Manager', title, description, actions: headActions }),
    pageTabs(doc, { label: ts('tabs'), name: 'sale-tab', value: tab, options: [{ value: 'overview', label: ts('overview') }, { value: 'settings', label: ts('settings') }, { value: 'report', label: ts('report') }], onChange: (next) => onTab(next) }),
    ...({ overview, settings: settingsForm, report }[tab] ?? overview)(),
    message ? h(doc, 'p', { class: 'xs mute2', role: 'status', 'aria-live': 'polite', 'data-role': 'sale-message', text: message }) : null,
  ];
}
