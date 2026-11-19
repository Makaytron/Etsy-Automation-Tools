// Keyword & Market Analyzer screens: drawer section and workspace page
// (this page, saved research, Listing Analyzer research).
//
// The screens read the engine snapshot and call the engine's own actions
// (search, save this analysis, JSON export, research import, copy/download
// the result, cancel, clear local data), so the standalone script's checks
// still decide what happens. Status texts are the engine's own.
//
// Design sources: template.primitive.card, template.primitive.table, template.primitive.badge,
// template.primitive.button, template.primitive.input (text and file), template.primitive.tabs,
// template.primitive.progress; shadcn.blocks.kpi-widgets (https://shadcnstore.com/blocks/application/widgets)
// for the four keyword tiles; shadcn.blocks.datatable (https://shadcnstore.com/blocks/application/datatables)
// for the related-terms and saved-research tables. The registry has no textarea, so a research
// request is read from a JSON file.

import { h } from '../ui/dom.js';
import { card, segmented } from '../ui/controls.js';
import { interpolate } from '../core/i18n.js';
import { packText } from '../core/language-packs.js';

export const KW_STRINGS = Object.freeze({
  en: Object.freeze({
    title: 'Keyword research', description: 'Reads Etsy Marketplace Insights on this page, scores each keyword and keeps your research.',
    page: 'This page', saved: 'Saved', research: 'Listing Analyzer',
    ready: 'Ready', analysed: 'Analysis ready', researching: 'Research running',
    noResult: 'No Marketplace Insights result on this page yet. Search for a keyword.',
    line: '“{keyword}” · {searches} searches · {results} results · opportunity {score}',
    save: 'Save this analysis', details: 'Open details',
    keyword: 'Keyword', search: 'Search Etsy Insights',
    tileSearches: 'Monthly searches', tileResults: 'Search results', tileTrend: '7-day trend', tileOpportunity: 'Opportunity',
    opportunityHint: 'Makaytron score from demand and competition', noTrend: '—',
    related: 'Similar search terms', colKeyword: 'Keyword', colSearches: 'Searches', colResults: 'Results', colOpportunity: 'Opportunity', colDate: 'Date',
    high: 'High', medium: 'Medium', low: 'Low',
    savedTitle: '{count} saved analyses', savedNone: 'Nothing saved yet. Saved analyses stay on this computer.',
    exportJson: 'Download JSON', clear: 'Clear local data…',
    researchTitle: 'Research for Listing Analyzer',
    researchNote: 'Listing Analyzer sends its keywords here when both run in this browser. Without it, choose a research request file it exported.',
    active: 'Running: {done} of {seeds} keywords', activeStatus: 'Request {id}', none: 'No research running.',
    cancel: 'Cancel the research', importFile: 'Research request file (JSON)', copyResult: 'Copy the result', downloadResult: 'Download the result',
  }),
  tr: Object.freeze({
    title: 'Anahtar kelime araştırması', description: 'Bu sayfadaki Etsy Marketplace Insights verisini okur, her kelimeye puan verir ve araştırmanızı saklar.',
    page: 'Bu sayfa', saved: 'Kaydedilenler', research: 'Listing Analyzer',
    ready: 'Hazır', analysed: 'Analiz hazır', researching: 'Araştırma sürüyor',
    noResult: 'Bu sayfada henüz Marketplace Insights sonucu yok. Bir anahtar kelime arayın.',
    line: '“{keyword}” · {searches} arama · {results} sonuç · fırsat {score}',
    save: 'Bu analizi kaydet', details: 'Ayrıntıları aç',
    keyword: 'Anahtar kelime', search: 'Etsy Insights’ta ara',
    tileSearches: 'Aylık arama', tileResults: 'Arama sonucu', tileTrend: '7 günlük eğilim', tileOpportunity: 'Fırsat',
    opportunityHint: 'Talep ve rekabetten Makaytron puanı', noTrend: '—',
    related: 'Benzer arama terimleri', colKeyword: 'Kelime', colSearches: 'Arama', colResults: 'Sonuç', colOpportunity: 'Fırsat', colDate: 'Tarih',
    high: 'Yüksek', medium: 'Orta', low: 'Düşük',
    savedTitle: '{count} kayıtlı analiz', savedNone: 'Henüz kayıt yok. Kaydedilen analizler bu bilgisayarda kalır.',
    exportJson: 'JSON indir', clear: 'Yerel verileri temizle…',
    researchTitle: 'Listing Analyzer için araştırma',
    researchNote: 'İkisi bu tarayıcıda çalışırken Listing Analyzer kelimelerini buraya gönderir. Çalışmıyorsa onun dışa aktardığı araştırma talebi dosyasını seçin.',
    active: 'Sürüyor: {done} / {seeds} kelime', activeStatus: 'Talep {id}', none: 'Süren araştırma yok.',
    cancel: 'Araştırmayı iptal et', importFile: 'Araştırma talebi dosyası (JSON)', copyResult: 'Sonucu kopyala', downloadResult: 'Sonucu indir',
  }),
});

// Bundled English and Turkish; other languages read the downloaded pack ("kw." keys).
function texts(language) {
  const lang = KW_STRINGS[language] ? language : 'en';
  return (key, vars) => interpolate(KW_STRINGS[language]?.[key] ?? packText(language, `kw.${key}`) ?? KW_STRINGS[lang][key] ?? KW_STRINGS.en[key] ?? key, vars);
}

const TONE = { high: 'badge-ok', medium: 'badge-warn', low: 'badge-err' };
const num = (language, value) => (Number.isFinite(value) ? new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(value) : '—');
const opportunityBadge = (doc, ts, o) => h(doc, 'span', { class: `badge ${TONE[o?.label] ?? ''}`.trim(), text: o ? `${o.score} · ${ts(o.label)}` : '—' });

function stateOf(snap, data) {
  if (data?.active) return ['researching', 'badge-dark'];
  if (snap.capture) return ['analysed', 'badge-ok'];
  return ['ready', ''];
}

/** Drawer section for Marketplace Insights. */
export function renderKwDrawer(doc, { snap, data, language, actions }) {
  const ts = texts(language);
  const [state, tone] = stateOf(snap, data);
  const main = snap.capture?.main;
  return h(doc, 'div', { class: 'ads-drawer', 'data-role': 'kw-drawer' },
    h(doc, 'div', { class: 'current' }, h(doc, 'span', { class: 'grow', text: 'Keyword & Market Analyzer' }),
      h(doc, 'span', { class: `badge ${tone}`.trim(), 'data-kw-state': state, text: ts(state) })),
    h(doc, 'div', { class: 'stack' },
      h(doc, 'p', { class: 'muted', 'data-role': 'kw-summary', text: main
        ? ts('line', { keyword: main.keyword, searches: num(language, main.searches30d), results: num(language, main.searchResults), score: main.opportunity.score })
        : ts('noResult') }),
      data?.active ? h(doc, 'p', { class: 'muted', text: ts('active', { done: data.active.done, seeds: data.active.seeds }) }) : null,
      h(doc, 'p', { class: 'muted', role: 'status', 'aria-live': 'polite', 'data-role': 'kw-status', text: snap.status })),
    h(doc, 'div', { class: 'row-actions' },
      h(doc, 'button', { class: 'btn btn-default btn-sm', type: 'button', 'data-kw': 'save', disabled: !main, onclick: () => actions.capture(), text: ts('save') }),
      h(doc, 'button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-kw': 'details', onclick: () => actions.openDetails(), text: ts('details') })));
}

/** Workspace page. */
export function renderKwPage(doc, { snap, data, language, actions, tab, onTab }) {
  const ts = texts(language);
  const main = snap.capture?.main;

  const tile = (label, value, hint, extra = null, attrs = {}) => h(doc, 'div', { class: 'tile', ...attrs },
    h(doc, 'span', { class: 'overline', text: label }), h(doc, 'span', { class: 'tile-value', text: value }), extra, hint ? h(doc, 'span', { class: 'field-hint', text: hint }) : null);

  const keywordTable = (rows, role, withDate = false) => h(doc, 'div', { class: 'table-wrap table-scroll' }, h(doc, 'table', { class: 'table', 'data-role': role },
    h(doc, 'thead', {}, h(doc, 'tr', {}, [ts('colKeyword'), ts('colSearches'), ts('colResults'), ts('colOpportunity'), ...(withDate ? [ts('colDate')] : [])].map((c) => h(doc, 'th', { text: c })))),
    h(doc, 'tbody', {}, rows.map(({ k, date }) => h(doc, 'tr', {},
      h(doc, 'td', { text: k.keyword }),
      h(doc, 'td', { text: num(language, k.searches30d) }),
      h(doc, 'td', { text: num(language, k.searchResults) }),
      h(doc, 'td', {}, opportunityBadge(doc, ts, k.opportunity)),
      withDate ? h(doc, 'td', { class: 'muted', text: date ? new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }).format(new Date(date)) : '—' }) : null)))));

  const pageTab = () => h(doc, 'div', { class: 'stack-lg' },
    h(doc, 'form', { class: 'row-actions', 'data-role': 'kw-search', onsubmit: (e) => { e.preventDefault(); actions.search(e.currentTarget.elements.keyword.value); } },
      h(doc, 'input', { class: 'input', id: 'eat-kw-keyword', name: 'keyword', type: 'search', 'aria-label': ts('keyword'), maxlength: 80, autocomplete: 'off', placeholder: ts('keyword'), value: snap.keyword ?? '', style: 'max-width:320px' }),
      h(doc, 'button', { class: 'btn btn-outline', type: 'submit', text: ts('search') })),
    main
      ? h(doc, 'div', { class: 'stack-lg' },
        h(doc, 'div', { class: 'tiles' },
          tile(ts('tileSearches'), num(language, main.searches30d), null, null, { 'data-kw-tile': 'searches' }),
          tile(ts('tileResults'), num(language, main.searchResults), null, null, { 'data-kw-tile': 'results' }),
          tile(ts('tileTrend'), Number.isFinite(main.trend7dPercent) ? `${main.trend7dPercent > 0 ? '+' : ''}${main.trend7dPercent}%` : ts('noTrend')),
          tile(ts('tileOpportunity'), `${main.opportunity.score}/100`, ts('opportunityHint'), opportunityBadge(doc, ts, main.opportunity), { 'data-kw-tile': 'opportunity' })),
        h(doc, 'div', { class: 'row-actions' },
          h(doc, 'button', { class: 'btn btn-default', type: 'button', 'data-kw': 'save', onclick: () => actions.capture(), text: ts('save') })),
        snap.capture.related.length
          ? card(doc, { id: 'eat-kw-related', title: ts('related') }, keywordTable(snap.capture.related.map((k) => ({ k })), 'kw-related'))
          : null)
      : h(doc, 'p', { class: 'field-hint', 'data-role': 'kw-no-result', text: ts('noResult') }));

  const savedTab = () => {
    const captures = data?.captures ?? [];
    return h(doc, 'div', { class: 'stack-lg' },
      h(doc, 'div', { class: 'row-actions' },
        h(doc, 'button', { class: 'btn btn-outline', type: 'button', 'data-kw': 'export', disabled: !captures.length, onclick: () => actions.exportJson(), text: ts('exportJson') }),
        h(doc, 'button', { class: 'btn btn-ghost', type: 'button', 'data-kw': 'clear', onclick: () => actions.clearData(), text: ts('clear') })),
      captures.length
        ? card(doc, { id: 'eat-kw-saved', title: ts('savedTitle', { count: captures.length }) },
          keywordTable([...captures].reverse().map((c) => ({ k: c.main, date: c.capturedAt })), 'kw-saved', true))
        : h(doc, 'p', { class: 'field-hint', 'data-role': 'kw-saved-none', text: ts('savedNone') }));
  };

  const researchTab = () => {
    const active = data?.active;
    return h(doc, 'div', { class: 'stack-lg' },
      card(doc, { id: 'eat-kw-research', title: ts('researchTitle'), description: ts('researchNote') },
        active
          ? h(doc, 'div', { class: 'stack', 'data-role': 'kw-active' },
            h(doc, 'div', { class: 'row-between muted' }, h(doc, 'span', { text: ts('active', { done: active.done, seeds: active.seeds }) }), h(doc, 'span', { class: 'mono-code', text: ts('activeStatus', { id: String(active.requestId).slice(0, 12) }) })),
            h(doc, 'div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(active.seeds), 'aria-valuenow': String(active.done), 'aria-label': ts('researching') },
              h(doc, 'div', { class: 'progress-indicator', style: `width:${active.seeds ? (active.done / active.seeds) * 100 : 0}%` })),
            h(doc, 'div', {}, h(doc, 'button', { class: 'btn btn-outline btn-sm', type: 'button', 'data-kw': 'cancel', onclick: () => actions.cancel(), text: ts('cancel') })))
          : h(doc, 'p', { class: 'field-hint', 'data-role': 'kw-none', text: ts('none') }),
        h(doc, 'div', { class: 'field-col' },
          h(doc, 'label', { class: 'label', for: 'eat-kw-request', text: ts('importFile') }),
          h(doc, 'input', { class: 'input', id: 'eat-kw-request', type: 'file', accept: 'application/json,.json', 'data-kw': 'import', onchange: async (e) => {
            const file = e.currentTarget.files?.[0];
            if (file) await actions.importRequest(await file.text());
          } })),
        h(doc, 'div', { class: 'row-actions' },
          h(doc, 'button', { class: 'btn btn-outline btn-sm', type: 'button', 'data-kw': 'copy-result', disabled: !data?.hasResult, onclick: () => actions.copyResult(), text: ts('copyResult') }),
          h(doc, 'button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-kw': 'download-result', disabled: !data?.hasResult, onclick: () => actions.downloadResult(), text: ts('downloadResult') }))));
  };

  const pages = { page: pageTab, saved: savedTab, research: researchTab };
  const current = pages[tab] ? tab : 'page';
  return h(doc, 'div', { style: 'display:contents' },
    h(doc, 'div', { class: 'page-head' },
      h(doc, 'span', { class: 'overline', text: 'Keyword & Market Analyzer' }),
      h(doc, 'h1', { class: 'page-title', text: ts('title') }),
      h(doc, 'p', { class: 'page-description', text: ts('description') })),
    segmented(doc, {
      labelledBy: 'eat-kw-tabs', name: 'kw-tab', value: current,
      options: [{ value: 'page', label: ts('page') }, { value: 'saved', label: ts('saved') }, { value: 'research', label: ts('research') }],
      onChange: (next) => onTab(next),
    }),
    pages[current](),
    h(doc, 'p', { class: 'notice', role: 'status', 'aria-live': 'polite', 'data-role': 'kw-status', text: snap.status }));
}
