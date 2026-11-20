// Listing Analyzer screens, as the design canvas draws them: the drawer
// section and the workspace page with Overview (LA-Overview, and LA-Scan while
// all pages are being read), Listings (LA-Listings), AI suggestions (LA-AI),
// Queue (LA-Queue), Thresholds (LA-Thresholds) and the first-use page (LA-Empty).
//
// The screens read the engine's analysed records and call its own functions:
// the scan, selection, the edit queue (apply in the form, publish and
// deactivate stay the user's clicks on Etsy, then verify), the AI request and
// answer, and the thresholds. A listing's history and edit plan open in the
// engine's own panel (LA-Detail, LA-Plan, LA-ApplyEditor).
//
// Design sources: template.primitive.card, .table, .badge, .button, .tabs,
// .input, .progress; shadcn.blocks.kpi-widgets for the tiles and
// shadcn.blocks.datatable for the listing and queue tables.

import { h, icon } from '../ui/dom.js';
import { ICONS } from '../ui/icons.js';
import { pageHead, pageTabs, alertBox, banner } from '../ui/controls.js';
import { interpolate } from '../core/i18n.js';
import { packText } from '../core/language-packs.js';

export const LA_STRINGS = Object.freeze({
  en: Object.freeze({
    tabs: 'Listing Analyzer pages', overview: 'Overview', listings: 'Listings', ai: 'AI suggestions', queue: 'Queue', thresholds: 'Thresholds',
    overviewText: 'Collects every listing, checks the metrics and shows what to look at first.',
    listingsText: 'The state and suggestion of every listing, from checked data. The selection only decides what the AI suggestion and the queue cover.',
    aiText: 'Get new title, tag and description suggestions for the listings you select.',
    queueText: 'Applies the saved suggestions listing by listing. Before anything is published on Etsy, you are asked on each one.',
    thresholdsText: 'Set the values at which the suggestions start, for your shop.',
    scanningTitle: 'Collecting data', scanningText: 'Etsy’s Listings pages are opened one after another. The analysis is prepared when it ends.',
    ready: 'Ready', collecting: 'Scanning', review: '{n} to review', stopped: 'Stopped',
    fresh: 'Data ready · last read {when}', stale: 'Scan every page for an up-to-date analysis.',
    scanPage: 'Scan this page', scanAll: 'Scan every page', stop: 'Stop the scan', resume: 'Continue the scan', exportData: 'Download a backup',
    onListings: 'The scan runs on Etsy’s Listings page.', openListings: 'Open Listings',
    tileListings: 'Listings', tileListingsHint: '{page} on this page', tileHealthy: 'Keep / watch', tileHealthyHint: 'Going well',
    tileReview: 'To review', tileReviewHint: 'Traffic without sales, weak tags', tileDeactivate: 'Consider deactivating', tileDeactivateHint: 'No traffic for a long time',
    tileExperiments: 'Running experiment', tileExperimentsHint: 'Waiting for the result', tileQueue: 'In the queue', tileQueueHint: 'Waiting for your approval',
    health: 'Health distribution', healthCount: '{n} listings', bandHealthy: 'Healthy · 70+', bandWatch: 'To watch · 50–69', bandWeak: 'Weak · 30–49', bandCritical: 'Critical · below 30',
    editThresholds: 'Edit the thresholds →', priority: 'Listings to look at first', seeAll: 'See all →', details: 'Details', plan: 'Plan',
    noPriority: 'No listing needs a review now.', visitsSales: '{visits} visits · {sales} sales',
    pageOf: 'Reading page {pages} of {total}', foundLine: '{found} listings collected', readPages: 'Pages read', collected: 'Listings collected', keepOpen: 'Keep the Etsy tab open.', keepOpenText: 'The pages are turned for you. You can keep working in another tab.',
    emptyTitle: 'No listing read yet', emptyText: 'Open Listings on Etsy and scan every page. Each listing gets a health score, a suggestion and a place in the edit queue.',
    step1: 'Open Listings', step1Text: 'Your shop’s listings page on Etsy.', step2: 'Scan every page', step2Text: 'Visits, favourites and sales are read.', step3: 'Look at the suggestions', step3Text: 'Nothing changes on Etsy without you.',
    search: 'Search title, SKU or suggestion', allStates: 'Every suggestion · {n}', selectedCount: '{n} selected', shown: '{shown} / {total} shown',
    colListing: 'Listing', colHealth: 'Health', colVisits: 'Visits', colFav: 'Favourites', colSales: 'Sales', colRevenue: 'Revenue', colStock: 'Stock', colSuggestion: 'Suggestion', colPlan: 'Plan',
    planSaved: 'Saved', planNone: 'None', prev: 'Previous', next: 'Next', selectAll: 'Select the shown listings', selectRow: 'Select {title}',
    barSelected: '{n} listings selected', barHint: 'Only listings with a saved, current plan enter the queue.', getAi: 'Get AI suggestions', buildQueue: 'Build the review queue',
    noFresh: 'The listings are shown after a full scan.',
    aiSelected: '{n} listings selected', aiNone: 'Select listings on the Listings page first.',
    aiStep1: 'Copy the request', aiStep1Text: 'The selected listings and their data are copied as text for your AI tool.', copyRequest: 'Copy the request', copyTemplate: 'Copy the answer format',
    aiStep2: 'Ask your AI tool', aiStep2Text: 'Paste it into ChatGPT, Claude or the tool you use, and ask for the answer in the same format.',
    aiStep3: 'Paste the answer', aiStep3Text: 'The answer is checked: unknown listings, changed data and over-long fields are refused.', answer: 'AI answer', importAnswer: 'Check and save the suggestions',
    aiPrivacy: 'Nothing is sent from here: you copy the text yourself and choose where to paste it.',
    qInQueue: 'In the queue', qWaiting: 'Waiting for your approval', qVerified: 'Verified on Etsy', qFailed: 'Could not be verified', qFailedHint: 'Not retried automatically',
    colChange: 'Change', colStatus: 'Status', colAction: 'Action', update: 'Title, tags or description', deactivateReview: 'Deactivation review',
    sPending: 'Queued', sApplying: 'Applied in the form · waiting for publish', sSubmitted: 'Being verified', sVerified: 'Verified on Etsy', sDeactivated: 'Deactivated · verified', sSkipped: 'Skipped', sFailed: 'Could not be verified', sAwaitDeactivate: 'Waiting for your deactivation',
    openNext: 'Open the next listing', stopQueue: 'Stop the queue', openListing: 'Open the listing', apply: 'Apply in the form', publishCheck: 'Publish on Etsy', skip: 'Skip', openDeactivate: 'Open deactivation', verifyDeactivate: 'I deactivated it, check', recover: 'Try again',
    noQueue: 'No queue yet. Select listings with a saved plan on the Listings page and build the queue.',
    queueNote: 'Etsy Automation Tools writes the change into the listing\'s edit form. Publishing asks you first, then the result is checked in the list.',
    recovery: 'An earlier step needs checking before the queue goes on.',
    bandsTitle: 'Suggestion rules', improve: 'Traffic without sales', improveText: 'Listings with at least this many visits and no sales are suggested for improvement.', minVisits: 'Visits, at least',
    protect: 'Protect what works', protectText: 'Listings with this many visits that sell are kept as they are.', renewals: 'Deactivation review', renewalsText: 'Listings renewed this many times without a sale are suggested for review.', minRenewals: 'Renewals, at least',
    decline: 'Falling traffic', declineText: 'A fall of this much in visits counts as declining.', percent: 'Fall, %',
    range: 'Between {min} and {max}.', relation: 'The protect value must be higher than the improve value.', storage: 'The thresholds could not be saved.', savedOk: 'The thresholds are saved and the analysis is updated.',
    impact: 'Current counts', impactNote: 'From {n} saved listings.', reset: 'Back to the defaults', cancel: 'Cancel', save: 'Save the thresholds',
    stored: '{listings} listings saved · {page} on this page', editorLine: 'The edit queue works in this listing editor.', openDetails: 'Open details', openPanel: 'Open the panel',
  }),
});

// Bundled English; other languages read the downloaded pack ("la." keys).
function texts(language) {
  const lang = LA_STRINGS[language] ? language : 'en';
  return (key, vars) => interpolate(LA_STRINGS[language]?.[key] ?? packText(language, `la.${key}`) ?? LA_STRINGS[lang][key] ?? LA_STRINGS.en[key] ?? key, vars);
}

const DEFAULTS = { minVisitsToImprove: 20, minVisitsToProtect: 60, minRenewalsToReview: 2, declinePercent: 35 };
const CODE_TONE = { improve: 'warn', declining: 'warn', deactivateReview: 'err', growing: 'ok', protected: 'out', monitor: '', waiting: '' };
const QUEUE_STATUS = {
  pending: ['sPending', ''], applying: ['sApplying', 'dark'], 'awaiting-user-review': ['sApplying', 'dark'],
  submitted: ['sSubmitted', 'warn'], 'submitted-unverified': ['sSubmitted', 'warn'], 'deactivation-submitted': ['sSubmitted', 'warn'], 'deactivation-submitted-unverified': ['sSubmitted', 'warn'],
  verified: ['sVerified', 'ok'], 'verified-deactivated': ['sDeactivated', 'ok'], skipped: ['sSkipped', 'out'], failed: ['sFailed', 'err'], 'awaiting-user-deactivation': ['sAwaitDeactivate', 'dark'],
};
const PAGE_SIZE = 10;

const num = (language, value) => (value == null || !Number.isFinite(Number(value)) ? '—' : new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(Number(value)));
function money(language, value, currency) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const code = /^[A-Z]{3}$/.test(currency) ? currency : null;
  try { return code ? new Intl.NumberFormat(language, { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(value) : `${currency}${num(language, value)}`; } catch { return `${currency}${num(language, value)}`; }
}
function when(language, iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(t);
}
const band = (score) => (score == null ? null : score >= 70 ? 'healthy' : score >= 50 ? 'watch' : score >= 30 ? 'weak' : 'critical');

function stateBadge(doc, ts, snap) {
  if (snap.collecting) return h(doc, 'span', { class: 'badge dark', 'data-la-state': 'collecting', text: ts('collecting') });
  if (['error', 'blocked'].includes(snap.status.tone)) return h(doc, 'span', { class: 'badge warn', 'data-la-state': 'stopped', text: ts('stopped') });
  if (snap.fresh && snap.needsReview) return h(doc, 'span', { class: 'badge warn', 'data-la-state': 'review', text: ts('review', { n: snap.needsReview }) });
  return h(doc, 'span', { class: 'badge', 'data-la-state': 'ready', text: ts('ready') });
}

const collectionLabel = (snap) => (snap.collecting ? 'stop' : ['running', 'paused'].includes(snap.collection?.status) ? 'resume' : 'scanAll');

function healthCell(doc, score) {
  if (score == null) return h(doc, 'span', { class: 'mute', text: '—' });
  const color = score < 30 ? '#dc2626' : '#1f1f1f';
  return h(doc, 'span', { class: 'hb' }, h(doc, 'i', {}, h(doc, 'b', { style: `width: ${Math.max(4, Math.min(100, score))}%; background: ${color};` })),
    h(doc, 'span', { class: 'num b', style: score < 30 ? 'color: #b91c1c;' : null, text: String(Math.round(score)) }));
}

function suggestionBadge(doc, record) {
  if (!record.assessment) return h(doc, 'span', { class: 'mute', text: '—' });
  const tone = CODE_TONE[record.code] ?? '';
  return h(doc, 'span', { class: tone ? `badge ${tone}` : 'badge', title: record.reason || null, text: record.assessment });
}

/** Drawer section on the Listings page and in the listing editor. */
export function renderLaDrawer(doc, { snap, language, actions }) {
  const ts = texts(language);
  const onListings = snap.route === 'listings';
  const c = snap.collection;
  return h(doc, 'div', { class: 'col', style: 'gap: 12px;', 'data-role': 'la-drawer' },
    h(doc, 'div', { class: 'row' }, icon(doc, ICONS['listing-analyzer']), h(doc, 'span', { class: 'h3 grow', id: 'eat-current', text: 'Listing Analyzer' }), stateBadge(doc, ts, snap)),
    h(doc, 'span', { class: 'xs mute2', 'data-role': 'la-summary', text: onListings ? ts('stored', { listings: num(language, snap.listings), page: num(language, snap.pageListings) }) : ts('editorLine') }),
    onListings && c && c.status !== 'completed' && c.total ? h(doc, 'div', { class: 'col', style: 'gap: 6px;' },
      h(doc, 'span', { class: 'xs mute2', 'data-role': 'la-progress', text: `${ts('pageOf', { pages: c.pages, total: c.total })} · ${ts('foundLine', { found: c.found })}` }),
      h(doc, 'div', { class: 'prog', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(c.total), 'aria-valuenow': String(c.pages) }, h(doc, 'i', { style: `width: ${Math.min(100, (c.pages / Math.max(1, c.total)) * 100)}%;` }))) : null,
    h(doc, 'span', { class: 'xxs mute', role: 'status', 'aria-live': 'polite', 'data-role': 'la-status', text: snap.status.text }),
    h(doc, 'div', { class: 'row' },
      h(doc, 'button', { class: 'btn btn-o btn-sm grow', type: 'button', 'data-la': 'details', onclick: () => actions.openDetails(), text: ts('openDetails') }),
      onListings
        ? h(doc, 'button', { class: 'btn btn-p btn-sm grow', type: 'button', 'data-la': 'collection', onclick: () => actions.toggleCollection(), text: ts(collectionLabel(snap)) })
        : h(doc, 'button', { class: 'btn btn-p btn-sm grow', type: 'button', 'data-la': 'open-panel', onclick: () => actions.openPanel('queue'), text: ts('openPanel') })));
}

/** Workspace page with Overview, Listings, AI suggestions, Queue and Thresholds. */
export function renderLaPage(doc, { snap, view, language, actions, tab = 'overview', onTab, local }) {
  const ts = texts(language);
  const current = ['overview', 'listings', 'ai', 'queue', 'thresholds'].includes(tab) ? tab : 'overview';
  const onListings = view.route === 'listings';
  const records = view.records;
  const selected = records.filter((r) => r.selected);
  const queueItems = view.queue?.items ?? [];
  const openQueue = queueItems.filter((i) => !['verified', 'verified-deactivated', 'skipped'].includes(i.status)).length;
  const tabs = pageTabs(doc, {
    label: ts('tabs'), name: 'la-tab', value: current, onChange: onTab,
    options: [{ value: 'overview', label: ts('overview') }, { value: 'listings', label: ts('listings') }, { value: 'ai', label: ts('ai') }, { value: 'queue', label: ts('queue'), count: openQueue }, { value: 'thresholds', label: ts('thresholds') }],
  });
  const scanButtons = () => onListings
    ? [h(doc, 'button', { class: 'btn btn-o', type: 'button', 'data-la': 'scan-page', disabled: snap.collecting, onclick: () => actions.scanPage(), text: ts('scanPage') }),
      h(doc, 'button', { class: snap.collecting ? 'btn btn-o' : 'btn btn-p', type: 'button', 'data-la': 'collection', onclick: () => actions.toggleCollection() }, icon(doc, snap.collecting ? ICONS.pause : ICONS.refresh, 16), ts(collectionLabel(snap)))]
    : [h(doc, 'a', { class: 'btn btn-o', href: 'https://www.etsy.com/your/shops/me/tools/listings', 'data-la': 'open-listings', text: ts('openListings') })];

  const tile = (label, value, hint, attrs = {}) => h(doc, 'div', { class: 'tile', ...attrs },
    h(doc, 'span', { class: 'ov', text: label }), h(doc, 'span', { class: 'v', text: value }), hint ? h(doc, 'span', { class: 'xs mute', text: hint }) : null);

  const empty = () => h(doc, 'section', { class: 'card', style: 'flex: 1 1 auto; display: flex;', 'data-role': 'la-empty' },
    h(doc, 'div', { class: 'empty' },
      h(doc, 'span', { class: 'ei' }, icon(doc, ICONS['listing-analyzer'], 24)),
      h(doc, 'p', { class: 'et', text: ts('emptyTitle') }), h(doc, 'p', { class: 'ed', text: ts('emptyText') }),
      h(doc, 'div', { class: 'ea' }, ...scanButtons()),
      h(doc, 'div', { class: 'steps' }, [['step1', 'step1Text'], ['step2', 'step2Text'], ['step3', 'step3Text']].map(([title, text], i) => h(doc, 'div', {},
        h(doc, 'span', { class: 'n', text: String(i + 1) }), h(doc, 'span', {}, h(doc, 'span', { class: 'st', text: ts(title) }), h(doc, 'span', { class: 'sd', text: ts(text) })))))));

  // ---- Overview ---------------------------------------------------------
  const scanning = () => {
    const c = snap.collection;
    const total = Math.max(1, c.total || 1);
    const pct = Math.min(100, Math.round((c.pages / total) * 100));
    return [h(doc, 'div', { style: 'display: flex; gap: 16px; align-items: flex-start;', 'data-role': 'la-scan' },
      h(doc, 'section', { class: 'card grow' },
        h(doc, 'div', { class: 'card-b col', style: 'gap: 16px; padding: 22px 24px;' },
          h(doc, 'div', { class: 'row', style: 'gap: 14px;' },
            h(doc, 'span', { class: 'well' }, h(doc, 'span', { class: 'spin', style: 'width: 16px; height: 16px;' })),
            h(doc, 'span', { class: 'col grow', style: 'gap: 2px;' }, h(doc, 'span', { class: 'h2', text: ts('pageOf', { pages: c.pages, total: c.total || '—' }) }), h(doc, 'span', { class: 'xs mute', text: ts('foundLine', { found: c.found }) })),
            h(doc, 'span', { class: 'num', style: 'font-size: 28px; font-weight: 700;', text: new Intl.NumberFormat(language, { style: 'percent' }).format(pct / 100) })),
          h(doc, 'div', { class: 'prog', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, h(doc, 'i', { style: `width: ${pct}%;` })),
          h(doc, 'div', { class: 'g2' }, tile(ts('readPages'), `${c.pages} / ${c.total || '—'}`), tile(ts('collected'), num(language, c.found)))),
        h(doc, 'div', { class: 'card-f' }, h(doc, 'span', { class: 'xs mute', role: 'status', 'aria-live': 'polite', 'data-role': 'la-status', text: snap.status.text }))),
      h(doc, 'aside', { style: 'width: 340px; flex: none;' }, banner(doc, { iconPaths: ICONS.info, title: ts('keepOpen'), text: ts('keepOpenText') })))];
  };

  const overview = () => {
    if (snap.collecting && snap.collection) return scanning();
    if (!records.length) return [empty()];
    const bands = { healthy: 0, watch: 0, weak: 0, critical: 0 };
    for (const r of records) { const b = band(r.score); if (b) bands[b] += 1; }
    const scored = Math.max(1, Object.values(bands).reduce((a, b) => a + b, 0));
    const priority = records.filter((r) => ['improve', 'declining', 'deactivateReview'].includes(r.code)).sort((a, b) => (a.score ?? 101) - (b.score ?? 101)).slice(0, 5);
    const healthRow = (key, count, color) => h(doc, 'div', { class: 'col', style: 'gap: 6px; padding: 10px 16px;' },
      h(doc, 'div', { class: 'row' }, h(doc, 'span', { class: 'sm grow', text: ts(key) }), h(doc, 'span', { class: 'num b', text: String(count) })),
      h(doc, 'span', { class: 'bar' }, h(doc, 'i', { style: `width: ${Math.round((count / scored) * 100)}%; background: ${color};` })));
    return [
      view.fresh ? null : alertBox(doc, { tone: 'warn', text: ts('stale') }),
      h(doc, 'div', { class: 'g6', style: 'display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px;' },
        tile(ts('tileListings'), num(language, records.length), ts('tileListingsHint', { page: num(language, snap.pageListings) }), { 'data-la-tile': 'listings' }),
        tile(ts('tileHealthy'), view.fresh ? num(language, view.counts.healthy) : '—', ts('tileHealthyHint')),
        tile(ts('tileReview'), view.fresh ? num(language, view.counts.needsReview) : '—', ts('tileReviewHint'), { 'data-la-tile': 'review' }),
        tile(ts('tileDeactivate'), view.fresh ? num(language, view.counts.deactivateReview) : '—', ts('tileDeactivateHint')),
        tile(ts('tileExperiments'), view.fresh ? num(language, view.counts.experiments) : '—', ts('tileExperimentsHint')),
        tile(ts('tileQueue'), num(language, openQueue), ts('tileQueueHint'))),
      h(doc, 'div', { style: 'display: flex; gap: 16px; align-items: flex-start;' },
        h(doc, 'section', { class: 'card grow', 'data-role': 'la-priority' },
          h(doc, 'div', { class: 'card-h' }, h(doc, 'h2', { class: 'h2 grow', text: ts('priority') }),
            h(doc, 'button', { class: 'xs b ob-link', type: 'button', onclick: () => onTab('listings'), text: ts('seeAll') })),
          priority.length
            ? h(doc, 'table', { class: 'tbl tbl-tight' }, h(doc, 'tbody', {}, priority.map((r) => h(doc, 'tr', { 'data-listing': r.id },
              h(doc, 'td', {}, h(doc, 'div', { class: 'row', style: 'gap: 12px;' }, h(doc, 'span', { class: 'thumb', style: 'width: 32px; height: 32px;' }),
                h(doc, 'span', { class: 'sm b trunc', style: 'max-width: 320px;', text: r.title }), r.sku ? h(doc, 'span', { class: 'xs mute', text: `· ${r.sku}` }) : null)),
              h(doc, 'td', { class: 'xs mute r', text: ts('visitsSales', { visits: num(language, r.visits), sales: num(language, r.sales) }) }),
              h(doc, 'td', { class: 'r' }, healthCell(doc, r.score)),
              h(doc, 'td', {}, suggestionBadge(doc, r)),
              h(doc, 'td', { class: 'r' }, h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', 'data-la-detail': r.id, onclick: () => actions.openRecord(r.id, 'history'), text: ts('details') }))))))
            : h(doc, 'div', { class: 'card-b xs mute', text: ts('noPriority') })),
        h(doc, 'aside', { class: 'card', style: 'width: 340px; flex: none;', 'data-role': 'la-health' },
          h(doc, 'div', { class: 'card-h' }, h(doc, 'h2', { class: 'h2 grow', text: ts('health') }), h(doc, 'span', { class: 'xs mute', text: ts('healthCount', { n: records.length }) })),
          healthRow('bandHealthy', bands.healthy, '#1f1f1f'), healthRow('bandWatch', bands.watch, '#737373'), healthRow('bandWeak', bands.weak, '#a3a3a3'), healthRow('bandCritical', bands.critical, '#dc2626'),
          h(doc, 'div', { class: 'card-f' }, h(doc, 'button', { class: 'xs b ob-link', type: 'button', onclick: () => onTab('thresholds'), text: ts('editThresholds') })))),
      h(doc, 'span', { class: 'xs mute', role: 'status', 'aria-live': 'polite', 'data-role': 'la-status', text: snap.status.text }),
    ];
  };

  // ---- Listings ---------------------------------------------------------
  const listingsTab = () => {
    if (!records.length) return [empty()];
    const query = String(local.query ?? '').trim().toLocaleLowerCase(language);
    const codes = [...new Set(records.map((r) => r.code).filter(Boolean))];
    const filtered = records
      .filter((r) => (!local.code || r.code === local.code) && (!query || `${r.title} ${r.sku} ${r.assessment}`.toLocaleLowerCase(language).includes(query)))
      .sort((a, b) => (a.score ?? 101) - (b.score ?? 101));
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const page = Math.min(local.page ?? 0, pages - 1);
    const shown = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
    const allOn = shown.length > 0 && shown.every((r) => r.selected);
    const box = (checked, label, onChange) => h(doc, 'input', { type: 'checkbox', checked, 'aria-label': label, style: 'width: 16px; height: 16px; accent-color: #1f1f1f;', onchange: (e) => onChange(e.target.checked) });
    return [
      h(doc, 'div', { class: 'row', style: 'gap: 8px;' },
        h(doc, 'div', { class: 'search', style: 'width: 300px;' }, icon(doc, ICONS.search),
          h(doc, 'input', { class: 'input', type: 'search', placeholder: ts('search'), 'aria-label': ts('search'), name: 'la-search', value: local.query ?? '', 'data-la': 'search', oninput: (e) => actions.setLocal({ query: e.target.value, page: 0 }) })),
        h(doc, 'select', { class: 'input', style: 'width: 220px;', 'aria-label': ts('colSuggestion'), 'data-la': 'filter', onchange: (e) => actions.setLocal({ code: e.target.value, page: 0 }) },
          h(doc, 'option', { value: '', selected: !local.code, text: ts('allStates', { n: records.length }) }),
          codes.map((code) => { const r = records.find((x) => x.code === code); return h(doc, 'option', { value: code, selected: local.code === code, text: `${r.assessment} · ${records.filter((x) => x.code === code).length}` }); })),
        h(doc, 'span', { class: 'grow' }),
        h(doc, 'span', { class: 'xs mute2' }, h(doc, 'b', { text: ts('shown', { shown: filtered.length, total: records.length }) }), ` · ${ts('selectedCount', { n: selected.length })}`)),
      h(doc, 'section', { class: 'card', 'data-role': 'la-listings' },
        h(doc, 'table', { class: 'tbl lt' },
          h(doc, 'thead', {}, h(doc, 'tr', {},
            h(doc, 'th', { style: 'width: 36px;' }, box(allOn, ts('selectAll'), (on) => actions.select(shown.map((r) => r.id), on))),
            h(doc, 'th', { text: ts('colListing') }), h(doc, 'th', { text: `${ts('colHealth')} ↑` }),
            ...['colVisits', 'colFav', 'colSales', 'colRevenue', 'colStock'].map((k) => h(doc, 'th', { class: 'r', text: ts(k) })),
            h(doc, 'th', { text: ts('colSuggestion') }), h(doc, 'th', { text: ts('colPlan') }), h(doc, 'th', { class: 'r' }))),
          h(doc, 'tbody', {}, shown.map((r) => h(doc, 'tr', { class: r.selected ? 'sel' : null, 'data-listing': r.id },
            h(doc, 'td', {}, box(r.selected, ts('selectRow', { title: r.title }), (on) => actions.select([r.id], on))),
            h(doc, 'td', {}, h(doc, 'div', { class: 'row', style: 'gap: 10px;' }, h(doc, 'span', { class: 'thumb', style: 'width: 32px; height: 32px;' }),
              h(doc, 'span', { class: 'col', style: 'min-width: 0;' }, h(doc, 'span', { class: 'b trunc', style: 'max-width: 240px;', text: r.title }), h(doc, 'span', { class: 'sub', text: [r.sku, r.state].filter(Boolean).join(' · ') })))),
            h(doc, 'td', {}, healthCell(doc, r.score)),
            h(doc, 'td', { class: 'r num' }, num(language, r.visits), r.visitsDelta ? h(doc, 'span', { class: 'sub', text: `${r.visitsDelta > 0 ? '+' : ''}${num(language, r.visitsDelta)}` }) : null),
            h(doc, 'td', { class: 'r num', text: num(language, r.favorites) }),
            h(doc, 'td', { class: 'r num', text: num(language, r.sales) }),
            h(doc, 'td', { class: 'r num', text: money(language, r.revenue, r.currency) }),
            h(doc, 'td', { class: 'r num', text: num(language, r.stock) }),
            h(doc, 'td', {}, suggestionBadge(doc, r)),
            h(doc, 'td', {}, r.proposal ? h(doc, 'span', { class: 'badge ok', text: ts('planSaved') }) : h(doc, 'span', { class: 'xs mute', text: ts('planNone') })),
            h(doc, 'td', { class: 'r' },
              h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', 'data-la-plan': r.id, onclick: () => actions.openRecord(r.id, 'proposal'), text: ts('plan') }),
              h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', 'data-la-detail': r.id, onclick: () => actions.openRecord(r.id, 'history'), text: ts('details') })))))),
        h(doc, 'div', { class: 'card-f' },
          h(doc, 'span', { class: 'xs mute grow', text: view.fresh ? ts('shown', { shown: shown.length, total: filtered.length }) : ts('noFresh') }),
          h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', disabled: page === 0, onclick: () => actions.setLocal({ page: page - 1 }), text: ts('prev') }),
          h(doc, 'span', { class: 'sm num', text: `${page + 1} / ${pages}` }),
          h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', disabled: page >= pages - 1, onclick: () => actions.setLocal({ page: page + 1 }), text: ts('next') }))),
      selected.length ? h(doc, 'div', { class: 'savebar', 'data-role': 'la-bulk' },
        h(doc, 'span', { class: 'col grow', style: 'gap: 2px;' }, h(doc, 'span', { class: 'sm b', text: ts('barSelected', { n: selected.length }) }), h(doc, 'span', { class: 'xs mute', text: ts('barHint') })),
        h(doc, 'button', { class: 'btn btn-o', type: 'button', 'data-la': 'to-ai', onclick: () => onTab('ai'), text: ts('getAi') }),
        h(doc, 'button', { class: 'btn btn-p', type: 'button', 'data-la': 'build-queue', disabled: !view.fresh, onclick: async () => { if (await actions.buildQueue()) onTab('queue'); }, text: ts('buildQueue') })) : null,
    ];
  };

  // ---- AI suggestions ---------------------------------------------------
  const aiTab = () => {
    const stepRow = (n, title, text, ...controls) => h(doc, 'div', { class: 'col', style: 'padding: 14px 16px; gap: 6px;' },
      h(doc, 'div', { class: 'row' }, h(doc, 'span', { class: 'stp', text: String(n) }), h(doc, 'span', { class: 'h3 grow', text: ts(title) }), ...controls),
      h(doc, 'p', { class: 'xs mute', style: 'padding-left: 30px;', text: ts(text) }));
    const answer = h(doc, 'textarea', { class: 'input mono', rows: '8', id: 'eat-la-ai-answer', 'data-la': 'ai-answer', placeholder: '{"schema":"makaytron-listing-ai-proposals/v1","requestId":"…","proposals":[…]}', oninput: (e) => { local.aiText = e.target.value; } }, local.aiText ?? '');
    return [
      selected.length ? null : alertBox(doc, { tone: 'info', text: ts('aiNone') }),
      h(doc, 'section', { class: 'card', style: 'max-width: 860px;', 'data-role': 'la-ai' },
        h(doc, 'div', { class: 'list' },
          stepRow(1, 'aiStep1', 'aiStep1Text',
            h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', 'data-la': 'copy-template', onclick: () => actions.copyAiTemplate(), text: ts('copyTemplate') }),
            h(doc, 'button', { class: 'btn btn-p btn-sm', type: 'button', 'data-la': 'copy-request', disabled: !selected.length, onclick: () => actions.copyAiRequest() }, icon(doc, ICONS.copy, 14), ts('copyRequest'))),
          stepRow(2, 'aiStep2', 'aiStep2Text'),
          h(doc, 'div', { class: 'col', style: 'padding: 14px 16px; gap: 8px;' },
            h(doc, 'div', { class: 'row' }, h(doc, 'span', { class: 'stp', text: '3' }), h(doc, 'span', { class: 'h3 grow', text: ts('aiStep3') })),
            h(doc, 'p', { class: 'xs mute', style: 'padding-left: 30px;', text: ts('aiStep3Text') }),
            h(doc, 'label', { class: 'field', for: 'eat-la-ai-answer', style: 'padding-left: 30px;' }, h(doc, 'span', { class: 'label', text: ts('answer') }), answer),
            local.aiResult ? h(doc, 'div', { style: 'padding-left: 30px;' }, alertBox(doc, { tone: local.aiResult.ok ? 'info' : 'err', text: local.aiResult.text })) : null,
            h(doc, 'div', { class: 'row', style: 'justify-content: flex-end;' },
              h(doc, 'button', { class: 'btn btn-p btn-sm', type: 'button', 'data-la': 'import-ai', onclick: async () => { const result = await actions.importAi(answer.value); actions.setLocal({ aiText: answer.value, aiResult: result }); }, text: ts('importAnswer') })))),
        h(doc, 'div', { class: 'card-f' }, icon(doc, ICONS.shield, 14), h(doc, 'span', { class: 'xs mute', text: ts('aiPrivacy') }))),
    ];
  };

  // ---- Queue ------------------------------------------------------------
  const queueTab = () => {
    const q = view.queue;
    const waiting = queueItems.filter((i) => ['applying', 'awaiting-user-review', 'awaiting-user-deactivation'].includes(i.status)).length;
    const verified = queueItems.filter((i) => ['verified', 'verified-deactivated'].includes(i.status)).length;
    const failed = queueItems.filter((i) => i.status === 'failed').length;
    const editingActive = q && view.editingId && view.editingId === q.active;
    const rowAction = (item) => {
      if (item.id !== q?.active) return null;
      if (!editingActive) return h(doc, 'button', { class: 'btn btn-o btn-sm', type: 'button', 'data-la': 'go-current', onclick: () => actions.goCurrent(), text: ts('openListing') });
      if (item.action === 'DEACTIVATE_REVIEW') {
        return ['awaiting-user-deactivation', 'deactivation-submitted', 'deactivation-submitted-unverified'].includes(item.status)
          ? h(doc, 'button', { class: 'btn btn-p btn-sm', type: 'button', 'data-la': 'verify-deactivate', onclick: () => actions.verifyDeactivate(), text: ts('verifyDeactivate') })
          : [h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', 'data-la': 'skip', onclick: () => actions.skip(), text: ts('skip') }),
            h(doc, 'button', { class: 'btn btn-p btn-sm', type: 'button', 'data-la': 'deactivate', onclick: () => actions.deactivate(), text: ts('openDeactivate') })];
      }
      if (['submitted', 'submitted-unverified'].includes(item.status)) return h(doc, 'button', { class: 'btn btn-p btn-sm', type: 'button', 'data-la': 'verify-publish', onclick: () => actions.verifyPublish(), text: ts('publishCheck') });
      return [h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', 'data-la': 'skip', onclick: () => actions.skip(), text: ts('skip') }),
        ['applying', 'awaiting-user-review'].includes(item.status)
          ? h(doc, 'button', { class: 'btn btn-p btn-sm', type: 'button', 'data-la': 'verify-publish', onclick: () => actions.publish(), text: ts('publishCheck') })
          : h(doc, 'button', { class: 'btn btn-p btn-sm', type: 'button', 'data-la': 'apply', onclick: () => actions.apply(), text: ts('apply') })];
    };
    return [
      h(doc, 'div', { class: 'g4' },
        tile(ts('qInQueue'), num(language, openQueue)), tile(ts('qWaiting'), num(language, waiting)), tile(ts('qVerified'), num(language, verified)),
        h(doc, 'div', { class: 'tile' }, h(doc, 'span', { class: 'ov', text: ts('qFailed') }), h(doc, 'span', { class: 'v', style: failed ? 'color: #b91c1c;' : null, text: num(language, failed) }), h(doc, 'span', { class: 'xs mute', text: ts('qFailedHint') }))),
      q?.recovery ? h(doc, 'div', { class: 'row' }, alertBox(doc, { tone: 'warn', text: ts('recovery') }), h(doc, 'button', { class: 'btn btn-o btn-sm', type: 'button', 'data-la': 'recover', onclick: () => actions.recover(), text: ts('recover') })) : null,
      h(doc, 'section', { class: 'card', 'data-role': 'la-queue' },
        queueItems.length
          ? h(doc, 'table', { class: 'tbl' },
            h(doc, 'thead', {}, h(doc, 'tr', {}, [ts('colListing'), ts('colChange'), ts('colStatus'), ts('colAction')].map((label, i) => h(doc, 'th', { class: i === 3 ? 'r' : null, text: label })))),
            h(doc, 'tbody', {}, queueItems.map((item) => {
              const [label, tone] = QUEUE_STATUS[item.status] ?? QUEUE_STATUS.pending;
              return h(doc, 'tr', { 'data-queue-item': item.id },
                h(doc, 'td', {}, h(doc, 'div', { class: 'row', style: 'gap: 10px;' }, h(doc, 'span', { class: 'thumb', style: 'width: 36px; height: 36px;' }),
                  h(doc, 'span', { class: 'col' }, h(doc, 'span', { class: 'b', text: item.title }), h(doc, 'span', { class: 'xs mute', text: item.id })))),
                h(doc, 'td', {}, h(doc, 'span', { class: 'badge out', text: ts(item.action === 'DEACTIVATE_REVIEW' ? 'deactivateReview' : 'update') })),
                h(doc, 'td', {}, h(doc, 'span', { class: tone ? `badge ${tone}` : 'badge' }, tone ? null : h(doc, 'span', { class: 'dot soft' }), ts(label))),
                h(doc, 'td', { class: 'r' }, h(doc, 'span', { class: 'row', style: 'justify-content: flex-end; gap: 6px;' }, rowAction(item))));
            })))
          : h(doc, 'div', { class: 'card-b xs mute', text: ts('noQueue') })),
      banner(doc, { iconPaths: ICONS.info, text: ts('queueNote') }),
    ];
  };

  // ---- Thresholds -------------------------------------------------------
  const thresholdsTab = () => {
    const values = { ...view.thresholds, ...(local.thresholds ?? {}) };
    const field = (key, label) => {
      const limit = view.limits[key];
      return h(doc, 'label', { class: 'field', style: 'width: 160px;' }, h(doc, 'span', { class: 'label', text: ts(label) }),
        h(doc, 'input', { class: 'input num', type: 'number', inputmode: 'numeric', min: String(limit.min), max: String(limit.max), step: '1', value: String(values[key]), 'data-threshold': key,
          'aria-invalid': local.thresholdError?.field === key ? 'true' : null,
          oninput: (e) => { local.thresholds = { ...(local.thresholds ?? {}), [key]: Number(e.target.value) }; } }));
    };
    const rule = (title, text, ...fields) => h(doc, 'div', { class: 'li', style: 'align-items: flex-end; gap: 16px;' },
      h(doc, 'div', { class: 'col grow', style: 'gap: 2px;' }, h(doc, 'span', { class: 'sm b', text: ts(title) }), h(doc, 'span', { class: 'xs mute', text: ts(text) })), ...fields);
    const err = local.thresholdError;
    const errText = err ? (err.reason === 'range' ? ts('range', { min: err.min, max: err.max }) : err.reason === 'relationship' ? ts('relation') : ts('storage')) : '';
    const impactRow = (label, value) => h(doc, 'div', { class: 'li' }, h(doc, 'span', { class: 'sm grow', text: ts(label) }), h(doc, 'span', { class: 'num b', text: view.fresh ? num(language, value) : '—' }));
    return [
      err ? alertBox(doc, { tone: 'err', text: errText }) : local.thresholdSaved ? alertBox(doc, { tone: 'info', text: ts('savedOk') }) : null,
      h(doc, 'div', { style: 'display: flex; gap: 16px; align-items: flex-start;', 'data-role': 'la-thresholds' },
        h(doc, 'section', { class: 'card grow' },
          h(doc, 'div', { class: 'card-h' }, h(doc, 'h2', { class: 'h2', text: ts('bandsTitle') })),
          h(doc, 'div', { class: 'list' },
            rule('improve', 'improveText', field('minVisitsToImprove', 'minVisits')),
            rule('protect', 'protectText', field('minVisitsToProtect', 'minVisits')),
            rule('renewals', 'renewalsText', field('minRenewalsToReview', 'minRenewals')),
            rule('decline', 'declineText', field('declinePercent', 'percent')))),
        h(doc, 'aside', { class: 'card', style: 'width: 340px; flex: none;' },
          h(doc, 'div', { class: 'card-h' }, h(doc, 'h2', { class: 'h2', text: ts('impact') })),
          h(doc, 'div', { class: 'list' }, impactRow('tileHealthy', view.counts.healthy), impactRow('tileReview', view.counts.needsReview), impactRow('tileDeactivate', view.counts.deactivateReview), impactRow('tileExperiments', view.counts.experiments)),
          h(doc, 'div', { class: 'card-f' }, h(doc, 'span', { class: 'xs mute', text: ts('impactNote', { n: records.length }) })))),
      h(doc, 'div', { class: 'savebar' },
        h(doc, 'button', { class: 'btn btn-g', type: 'button', 'data-la': 'thresholds-reset', onclick: () => actions.setLocal({ thresholds: { ...DEFAULTS }, thresholdError: null, thresholdSaved: false }), text: ts('reset') }),
        h(doc, 'span', { class: 'grow' }),
        h(doc, 'button', { class: 'btn btn-g', type: 'button', onclick: () => actions.setLocal({ thresholds: null, thresholdError: null, thresholdSaved: false }), text: ts('cancel') }),
        h(doc, 'button', { class: 'btn btn-p', type: 'button', 'data-la': 'thresholds-save', disabled: snap.collecting,
          onclick: async () => { const result = await actions.saveThresholds({ ...view.thresholds, ...(local.thresholds ?? {}) }); actions.setLocal(result.valid ? { thresholds: null, thresholdError: null, thresholdSaved: true } : { thresholdError: result, thresholdSaved: false }); }, text: ts('save') })),
    ];
  };

  const scanningNow = current === 'overview' && snap.collecting && snap.collection;
  const heads = {
    overview: scanningNow
      ? pageHead(doc, { overline: 'LISTING ANALYZER', title: ts('scanningTitle'), description: ts('scanningText'), actions: [h(doc, 'button', { class: 'btn btn-o', type: 'button', 'data-la': 'collection', onclick: () => actions.toggleCollection() }, icon(doc, ICONS.pause, 16), ts('stop'))] })
      : pageHead(doc, { overline: 'LISTING ANALYZER', title: ts('overview'), description: ts('overviewText'), actions: [
        records.length ? h(doc, 'span', { class: view.fresh ? 'badge ok' : 'badge warn', 'data-la-fresh': String(view.fresh), text: view.fresh ? ts('fresh', { when: when(language, view.lastAt) }) : ts('stale') }) : null, ...scanButtons()] }),
    listings: pageHead(doc, { overline: 'LISTING ANALYZER', title: ts('listings'), description: ts('listingsText'), actions: [h(doc, 'button', { class: 'btn btn-o', type: 'button', 'data-la': 'export', onclick: () => actions.exportData() }, icon(doc, ICONS.download, 16), ts('exportData'))] }),
    ai: pageHead(doc, { overline: 'LISTING ANALYZER', title: ts('ai'), description: ts('aiText'), actions: [h(doc, 'span', { class: 'badge out', text: ts('aiSelected', { n: selected.length }) })] }),
    queue: pageHead(doc, { overline: 'LISTING ANALYZER', title: ts('queue'), description: ts('queueText'), actions: view.queue && openQueue ? [
      h(doc, 'button', { class: 'btn btn-g', type: 'button', 'data-la': 'stop-queue', onclick: () => actions.stop(), text: ts('stopQueue') }),
      h(doc, 'button', { class: 'btn btn-p', type: 'button', 'data-la': 'open-next', onclick: () => actions.goCurrent() }, ts('openNext'), icon(doc, ICONS.arrowRight, 16))] : [] }),
    thresholds: pageHead(doc, { overline: 'LISTING ANALYZER', title: ts('thresholds'), description: ts('thresholdsText') }),
  };
  const body = { overview, listings: listingsTab, ai: aiTab, queue: queueTab, thresholds: thresholdsTab }[current]();
  return h(doc, 'div', { style: 'display: contents;', 'data-role': 'la-page', 'data-la-tab': current }, heads[current], tabs, ...body);
}
