// Listing Analyzer screens: drawer section and workspace page.
//
// Listing Analyzer's own panel holds its detailed work (analysis table and
// filters, history charts, AI exchange, the user-approved edit queue,
// settings). These screens summarise its state and start its own actions
// (scan this page, collect all pages, export); everything else opens its
// panel at the right view, where its checks apply.
//
// Design sources: template.primitive.card, template.primitive.table, template.primitive.badge,
// template.primitive.button, template.primitive.progress; shadcn.blocks.kpi-widgets
// (https://shadcnstore.com/blocks/application/widgets) for the four summary tiles;
// shadcn.blocks.datatable (https://shadcnstore.com/blocks/application/datatables) for the view list.

import { h } from '../ui/dom.js';
import { card } from '../ui/controls.js';
import { interpolate } from '../core/i18n.js';
import { packText } from '../core/language-packs.js';

export const LA_STRINGS = Object.freeze({
  en: Object.freeze({
    title: 'Listing performance', description: 'Tracks your listings over time, compares them with their history and prepares changes you approve one by one.',
    ready: 'Ready', collecting: 'Scanning', review: '{n} to review', stopped: 'Stopped',
    stored: '{listings} listings saved · {page} on this page', editorLine: 'The improvement queue works in this listing editor.',
    progress: 'Page {pages} of {total} · {found} listings found', notFresh: 'Scan all pages for an up-to-date analysis.',
    scanAll: 'Scan all pages', stop: 'Stop the scan', resume: 'Continue the scan', scanPage: 'Scan this page',
    openAnalysis: 'Open the analysis', openQueue: 'Open the queue', details: 'Open details', exportData: 'Download a backup',
    tileListings: 'Saved listings', tileHealthy: 'Healthy', tileReview: 'Needs review', tileExperiments: 'Running experiments',
    reviewHint: 'Improve, declining or deactivate review', deactivate: '{n} to consider deactivating',
    views: 'Panel views', viewsNote: 'Detailed work opens in the Listing Analyzer panel on this page.',
    colView: 'View', colWhat: 'What it does', open: 'Open',
    vOverview: 'Overview', dOverview: 'Status, counts and the scan.',
    vAnalysis: 'Analysis', dAnalysis: 'Every listing with its trend, filters and history.',
    vAi: 'AI exchange', dAi: 'Send listings to your AI and bring back proposals.',
    vQueue: 'Queue', dQueue: 'Approved changes applied in the editor one by one.',
    vSettings: 'Settings', dSettings: 'Thresholds, language and data.',
    queueCount: '{n} in the queue',
  }),
  tr: Object.freeze({
    title: 'Listing performansı', description: 'Listinglerinizi zaman içinde izler, geçmişiyle karşılaştırır ve tek tek onayladığınız değişiklikleri hazırlar.',
    ready: 'Hazır', collecting: 'Taranıyor', review: '{n} inceleme', stopped: 'Durdu',
    stored: '{listings} listing kayıtlı · bu sayfada {page}', editorLine: 'İyileştirme kuyruğu bu listing düzenleyicisinde çalışır.',
    progress: 'Sayfa {pages} / {total} · {found} listing bulundu', notFresh: 'Güncel analiz için tüm sayfaları tarayın.',
    scanAll: 'Tüm sayfaları tara', stop: 'Taramayı durdur', resume: 'Taramaya devam et', scanPage: 'Bu sayfayı tara',
    openAnalysis: 'Analizi aç', openQueue: 'Kuyruğu aç', details: 'Ayrıntıları aç', exportData: 'Yedek indir',
    tileListings: 'Kayıtlı listing', tileHealthy: 'Sağlıklı', tileReview: 'İnceleme gerekiyor', tileExperiments: 'Süren deneme',
    reviewHint: 'İyileştir, düşüşte veya kapatmayı değerlendir', deactivate: '{n} listing kapatılmayı değerlendirmeli',
    views: 'Panel görünümleri', viewsNote: 'Ayrıntılı çalışma bu sayfadaki Listing Analyzer panelinde açılır.',
    colView: 'Görünüm', colWhat: 'Ne yapar', open: 'Aç',
    vOverview: 'Genel bakış', dOverview: 'Durum, sayılar ve tarama.',
    vAnalysis: 'Analiz', dAnalysis: 'Her listing, eğilimi, filtreleri ve geçmişiyle.',
    vAi: 'AI alışverişi', dAi: 'Listingleri AI’nıza gönderin, önerileri geri alın.',
    vQueue: 'Kuyruk', dQueue: 'Onaylanan değişiklikler düzenleyicide tek tek uygulanır.',
    vSettings: 'Ayarlar', dSettings: 'Eşikler, dil ve veriler.',
    queueCount: 'Kuyrukta {n}',
  }),
});

// Bundled English and Turkish; other languages read the downloaded pack ("la." keys).
function texts(language) {
  const lang = LA_STRINGS[language] ? language : 'en';
  return (key, vars) => interpolate(LA_STRINGS[language]?.[key] ?? packText(language, `la.${key}`) ?? LA_STRINGS[lang][key] ?? LA_STRINGS.en[key] ?? key, vars);
}

const VIEWS = [['overview', 'vOverview', 'dOverview'], ['analysis', 'vAnalysis', 'dAnalysis'], ['ai', 'vAi', 'dAi'], ['queue', 'vQueue', 'dQueue'], ['settings', 'vSettings', 'dSettings']];
const num = (language, value) => new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(value);

function badge(doc, ts, snap) {
  if (snap.collecting) return h(doc, 'span', { class: 'badge badge-dark', 'data-la-state': 'collecting', text: ts('collecting') });
  if (['error', 'blocked'].includes(snap.status.tone)) return h(doc, 'span', { class: 'badge badge-warn', 'data-la-state': 'stopped', text: ts('stopped') });
  if (snap.fresh && snap.needsReview) return h(doc, 'span', { class: 'badge badge-warn', 'data-la-state': 'review', text: ts('review', { n: snap.needsReview }) });
  return h(doc, 'span', { class: 'badge', 'data-la-state': 'ready', text: ts('ready') });
}

function collectionLabel(snap) {
  if (snap.collecting) return 'stop';
  return ['running', 'paused'].includes(snap.collection?.status) ? 'resume' : 'scanAll';
}

function progressBar(doc, ts, c) {
  const total = Math.max(1, c.total);
  return h(doc, 'div', { class: 'stack' },
    h(doc, 'p', { class: 'muted', 'data-role': 'la-progress', text: ts('progress', { pages: c.pages, total: c.total || '—', found: c.found }) }),
    h(doc, 'div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(Math.min(c.pages, total)), 'aria-label': ts('collecting') },
      h(doc, 'div', { class: 'progress-indicator', style: `width:${Math.min(100, (c.pages / total) * 100)}%` })));
}

/** Drawer section on the Listings page and in the listing editor. */
export function renderLaDrawer(doc, { snap, language, actions }) {
  const ts = texts(language);
  const listings = snap.route === 'listings';
  return h(doc, 'div', { class: 'ads-drawer', 'data-role': 'la-drawer' },
    h(doc, 'div', { class: 'current' }, h(doc, 'span', { class: 'grow', text: 'Listing Analyzer' }), badge(doc, ts, snap)),
    h(doc, 'div', { class: 'stack' },
      h(doc, 'p', { class: 'muted', 'data-role': 'la-summary', text: listings ? ts('stored', { listings: num(language, snap.listings), page: num(language, snap.pageListings) }) : ts('editorLine') }),
      listings && snap.collection && snap.collection.status !== 'completed' ? progressBar(doc, ts, snap.collection) : null,
      h(doc, 'p', { class: 'muted', role: 'status', 'aria-live': 'polite', 'data-role': 'la-status', text: snap.status.text })),
    h(doc, 'div', { class: 'row-actions' },
      listings ? h(doc, 'button', { class: 'btn btn-default btn-sm', type: 'button', 'data-la': 'collection', onclick: () => actions.toggleCollection(), text: ts(collectionLabel(snap)) }) : null,
      h(doc, 'button', { class: `btn ${listings ? 'btn-outline' : 'btn-default'} btn-sm`, type: 'button', 'data-la': 'open-panel', onclick: () => actions.openPanel(listings ? 'analysis' : 'queue'), text: ts(listings ? 'openAnalysis' : 'openQueue') }),
      h(doc, 'button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-la': 'details', onclick: () => actions.openDetails(), text: ts('details') })));
}

/** Workspace page: summary tiles, scan controls and the panel views. */
export function renderLaPage(doc, { snap, language, actions }) {
  const ts = texts(language);
  const listings = snap.route === 'listings';
  const tile = (label, value, hint, attrs = {}) => h(doc, 'div', { class: 'tile', ...attrs },
    h(doc, 'span', { class: 'overline', text: label }), h(doc, 'span', { class: 'tile-value', text: value }), hint ? h(doc, 'span', { class: 'field-hint', text: hint }) : null);
  return h(doc, 'div', { style: 'display:contents' },
    h(doc, 'div', { class: 'page-head' },
      h(doc, 'span', { class: 'overline', text: 'Listing Analyzer' }),
      h(doc, 'h1', { class: 'page-title', text: ts('title') }),
      h(doc, 'p', { class: 'page-description', text: ts('description') })),
    h(doc, 'div', { class: 'stack-lg' },
      h(doc, 'div', { class: 'tiles' },
        tile(ts('tileListings'), num(language, snap.listings), snap.queue ? ts('queueCount', { n: snap.queue }) : null, { 'data-la-tile': 'listings' }),
        tile(ts('tileHealthy'), snap.fresh ? num(language, snap.healthy) : '—'),
        tile(ts('tileReview'), snap.fresh ? num(language, snap.needsReview) : '—', ts('reviewHint'), { 'data-la-tile': 'review' }),
        tile(ts('tileExperiments'), snap.fresh ? num(language, snap.experiments) : '—')),
      snap.fresh ? null : h(doc, 'p', { class: 'alert-warn', 'data-role': 'la-not-fresh', text: ts('notFresh') }),
      snap.fresh && snap.deactivateReview ? h(doc, 'p', { class: 'alert-warn', text: ts('deactivate', { n: snap.deactivateReview }) }) : null,
      listings && snap.collection && snap.collection.status !== 'completed' ? progressBar(doc, ts, snap.collection) : null,
      h(doc, 'p', { class: 'muted', role: 'status', 'aria-live': 'polite', 'data-role': 'la-status', text: snap.status.text }),
      listings ? h(doc, 'div', { class: 'row-actions' },
        h(doc, 'button', { class: 'btn btn-default', type: 'button', 'data-la': 'collection', onclick: () => actions.toggleCollection(), text: ts(collectionLabel(snap)) }),
        h(doc, 'button', { class: 'btn btn-outline', type: 'button', 'data-la': 'scan-page', disabled: snap.collecting, onclick: () => actions.scanPage(), text: ts('scanPage') }),
        h(doc, 'button', { class: 'btn btn-ghost', type: 'button', 'data-la': 'export', onclick: () => actions.exportData(), text: ts('exportData') })) : null,
      card(doc, { id: 'eat-la-views', title: ts('views'), description: ts('viewsNote') },
        h(doc, 'div', { class: 'table-wrap' }, h(doc, 'table', { class: 'table', 'data-role': 'la-views' },
          h(doc, 'thead', {}, h(doc, 'tr', {}, [ts('colView'), ts('colWhat'), ''].map((c) => h(doc, 'th', { text: c })))),
          h(doc, 'tbody', {}, VIEWS.map(([id, name, what]) => h(doc, 'tr', { 'data-view': id },
            h(doc, 'td', { text: ts(name) }),
            h(doc, 'td', { class: 'muted', text: ts(what) }),
            h(doc, 'td', {}, h(doc, 'button', { class: 'btn btn-outline btn-sm', type: 'button', 'data-la-open': id, onclick: () => actions.openPanel(id), text: ts('open') }))))))))));
}
