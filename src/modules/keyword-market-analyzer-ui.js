// Keyword & Market Analyzer screens, as the design canvas draws them: the
// drawer section on Marketplace Insights (KW-Insights), the research page —
// saved research on the left, the chosen one on the right (KW-Research,
// KW-Analyzing) — and the first-use page (KW-Empty).
//
// The screens read the engine snapshot and its stored research, and call the
// engine's own actions (search, save this analysis, JSON export, research
// import, copy/download the result for Listing Analyzer, cancel, clear local
// data), so the standalone script's checks still decide what happens.
// Columns show only what the engine reads from Etsy: searches, results,
// the 7-day trend and the Makaytron opportunity score.
//
// Design sources: template.primitive.card, .table, .badge, .button, .input,
// .progress; shadcn.blocks.kpi-widgets for the drawer tiles;
// shadcn.blocks.datatable for the research tables.

import { h, icon } from '../ui/dom.js';
import { ICONS } from '../ui/icons.js';
import { pageHead, alertBox, openDialog } from '../ui/controls.js';
import { interpolate } from '../core/i18n.js';
import { packText } from '../core/language-packs.js';

export const KW_STRINGS = Object.freeze({
  en: Object.freeze({
    title: 'Research', description: 'Keyword research you saved on Marketplace Insights. Results go to Listing Analyzer with their evidence.',
    ready: 'Ready', analysed: 'Analysis ready', researching: 'Listing Analyzer is waiting',
    exportJson: 'Download as JSON', newSearch: 'New research on Insights', keyword: 'Keyword', search: 'Search', searchSaved: 'Search the keywords',
    colMain: 'Main keyword', colTerms: 'Terms', colDate: 'Date', colTerm: 'Term', colSearches: 'Searches', colResults: 'Results', colTrend: '7-day trend', colOpportunity: 'Opportunity',
    savedFoot: '{count} research · kept in this browser', clear: 'Clear local data',
    detailMeta: '{when} · Marketplace Insights · {rows} rows read', thisPage: 'This page · not saved yet',
    request: 'Request:', requestText: 'Listing Analyzer asked for new tag candidates for {seeds} keywords · {done} done.',
    copyResult: 'Copy the result', downloadResult: 'Download the result', cancel: 'Cancel the research', send: 'Send to Listing Analyzer',
    detailFoot: 'Listing Analyzer derives its suggestion from this evidence.',
    noSelection: 'Choose research on the left.', noTrend: '—', high: 'High', medium: 'Medium', low: 'Low',
    drawerRequest: 'Request from Listing Analyzer:', drawerRequestText: 'tag research for {seeds} keywords.',
    tileRows: 'Rows', tileAnnotated: 'Scored', tileSaved: 'Saved', saveThis: 'Analyse and save this page', sendResult: 'Send the result to Listing Analyzer',
    savedCount: '{count} saved research', openWorkspace: 'Open the workspace', noResult: 'No Marketplace Insights result on this page yet. Search for a keyword.',
    details: 'Open details', save: 'Analyse and save this page',
    emptyTitle: 'No research yet', emptyText: 'Search a keyword on Marketplace Insights; the terms Etsy shows are scored and saved here. Listing Analyzer can then ask for evidence for its tags.',
    emptyStart: 'Open Marketplace Insights', importRequest: 'Import a research request',
    how1: 'Search on Insights', how1Text: 'Etsy shows searches and results for each term.', how2: 'Save the page', how2Text: 'Each term gets an opportunity score.', how3: 'Use it in Listing Analyzer', how3Text: 'Tag suggestions come with this evidence.',
    importTitle: 'Import a research request', importText: 'Choose the JSON file Listing Analyzer exported.', importFile: 'Research request file (JSON)', importButton: 'Import',
  }),
});

// Bundled English; other languages read the downloaded pack ("kw." keys).
function texts(language) {
  const lang = KW_STRINGS[language] ? language : 'en';
  return (key, vars) => interpolate(KW_STRINGS[language]?.[key] ?? packText(language, `kw.${key}`) ?? KW_STRINGS[lang][key] ?? KW_STRINGS.en[key] ?? key, vars);
}

const num = (language, value) => (Number.isFinite(value) ? new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(value) : '—');
const trend = (language, value) => (Number.isFinite(value) ? `${value > 0 ? '+' : ''}${new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(value)}%` : '—');
const shortDate = (language, value) => {
  if (!value) return '—';
  const d = new Date(value);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(0, 'day');
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }).format(d);
};

function stateOf(snap, data) {
  if (data?.active) return ['researching', 'dark'];
  if (snap.capture) return ['analysed', 'ok'];
  return ['ready', ''];
}

function opportunityCell(doc, o) {
  return h(doc, 'span', { class: 'row', style: 'justify-content: flex-end; gap: 10px;' },
    h(doc, 'span', { class: 'spend-bar' }, h(doc, 'span', { style: `width: ${Math.max(0, Math.min(100, o?.score ?? 0))}%;` })),
    h(doc, 'span', { class: 'num b', style: 'min-width: 24px; text-align: right;', text: o ? String(o.score) : '—' }));
}

/** Drawer section for Marketplace Insights (KW-Insights). */
export function renderKwDrawer(doc, { snap, data, language, actions }) {
  const ts = texts(language);
  const [state, tone] = stateOf(snap, data);
  const capture = snap.capture;
  const rows = capture ? 1 + (capture.related?.length ?? 0) : 0;
  return h(doc, 'div', { class: 'col', style: 'gap: 12px;', 'data-role': 'kw-drawer' },
    h(doc, 'div', { class: 'row' }, icon(doc, ICONS['keyword-market-analyzer']), h(doc, 'span', { class: 'h3 grow', id: 'eat-current', text: 'Keyword & Market Analyzer' }), h(doc, 'span', { class: tone ? `badge ${tone}` : 'badge', 'data-kw-state': state, text: ts(state) })),
    data?.active ? h(doc, 'div', { class: 'al info' }, icon(doc, ICONS['listing-analyzer']), h(doc, 'span', {}, h(doc, 'b', { text: ts('drawerRequest') }), ' ', ts('drawerRequestText', { seeds: data.active.seeds }))) : null,
    capture
      ? h(doc, 'div', { class: 'g3', style: 'gap: 8px;' },
        h(doc, 'div', { class: 'tile', style: 'padding: 10px 12px;', 'data-kw-tile': 'rows' }, h(doc, 'span', { class: 'ov', text: ts('tileRows') }), h(doc, 'span', { class: 'b', style: 'font-size: 15px;', text: String(rows) })),
        h(doc, 'div', { class: 'tile', style: 'padding: 10px 12px;' }, h(doc, 'span', { class: 'ov', text: ts('tileAnnotated') }), h(doc, 'span', { class: 'b', style: 'font-size: 15px;', text: String(rows) })),
        h(doc, 'div', { class: 'tile', style: 'padding: 10px 12px;', 'data-kw-tile': 'saved' }, h(doc, 'span', { class: 'ov', text: ts('tileSaved') }), h(doc, 'span', { class: 'b', style: 'font-size: 15px;', text: String(data?.captures?.length ?? 0) })))
      : h(doc, 'span', { class: 'xs mute2', 'data-role': 'kw-summary', text: ts('noResult') }),
    h(doc, 'span', { class: 'xxs mute', role: 'status', 'aria-live': 'polite', 'data-role': 'kw-status', text: snap.status }),
    h(doc, 'button', { class: 'btn btn-p', type: 'button', 'data-kw': 'save', disabled: !capture, onclick: () => actions.capture(), text: ts('saveThis') }),
    data?.hasResult ? h(doc, 'button', { class: 'btn btn-o', type: 'button', 'data-kw': 'copy-result', onclick: () => actions.copyResult(), text: ts('sendResult') }) : null,
    h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', 'data-kw': 'details', onclick: () => actions.openDetails(), text: ts('details') }));
}

/** Research page (KW-Research / KW-Analyzing / KW-Empty). */
export function renderKwPage(doc, { snap, data, language, actions, container, research = true }) {
  const ts = texts(language);
  const saved = (data?.captures ?? []).slice().sort((a, b) => String(b.capturedAt ?? '').localeCompare(String(a.capturedAt ?? '')));
  const view = actions.viewState?.() ?? { query: '', selected: null };
  const items = [
    // The page being read is listed unsaved until a saved copy of the same search (same keyword and numbers) exists.
    ...(snap.capture && !saved.some((c) => c.main?.keyword === snap.capture.main?.keyword && c.main?.searches30d === snap.capture.main?.searches30d && c.main?.searchResults === snap.capture.main?.searchResults) ? [{ ...snap.capture, live: true }] : []),
    ...saved,
  ];
  const keyOf = (c) => `${c.main?.keyword ?? ''}|${c.capturedAt ?? ''}`;

  const head = pageHead(doc, {
    overline: 'Keyword & Market Analyzer', title: ts('title'), description: ts('description'),
    actions: [
      // Importing a Listing Analyzer research request stays possible once research is saved.
      items.length && research ? h(doc, 'button', { class: 'btn btn-g', type: 'button', 'data-kw': 'import', onclick: (e) => importDialog(e.currentTarget) }, icon(doc, ICONS.upload, 16), ts('importRequest')) : null,
      h(doc, 'button', { class: 'btn btn-o', type: 'button', 'data-kw': 'export', disabled: !saved.length, onclick: () => actions.exportJson() }, icon(doc, ICONS.download, 16), ts('exportJson')),
      h(doc, 'form', { class: 'row', 'data-role': 'kw-search', onsubmit: (e) => { e.preventDefault(); actions.search(e.currentTarget.elements.keyword.value); } },
        h(doc, 'input', { class: 'input', id: 'eat-kw-keyword', name: 'keyword', type: 'search', 'aria-label': ts('keyword'), maxlength: 80, autocomplete: 'off', placeholder: ts('keyword'), value: snap.keyword ?? '', style: 'width: 200px;' }),
        h(doc, 'button', { class: 'btn btn-p', type: 'submit', text: ts('newSearch') })),
    ],
  });

  if (!items.length) {
    return [head, h(doc, 'section', { class: 'card empty', 'aria-labelledby': 'eat-kw-empty' },
      h(doc, 'div', { class: 'ei' }, icon(doc, ICONS['keyword-market-analyzer'], 24)),
      h(doc, 'h2', { class: 'et', id: 'eat-kw-empty', text: ts('emptyTitle') }),
      h(doc, 'p', { class: 'ed', text: ts('emptyText') }),
      h(doc, 'div', { class: 'ea' },
        h(doc, 'a', { class: 'btn btn-p', href: '/your/shops/me/marketplace-insights', text: ts('emptyStart') }),
        research ? h(doc, 'button', { class: 'btn btn-o', type: 'button', onclick: (e) => importDialog(e.currentTarget), text: ts('importRequest') }) : null),
      h(doc, 'div', { class: 'steps' }, [1, 2, 3].map((n) => h(doc, 'div', {},
        h(doc, 'span', { class: 'n', text: String(n) }),
        h(doc, 'span', {}, h(doc, 'span', { class: 'st', text: ts(`how${n}`) }), h(doc, 'span', { class: 'sd', text: ts(`how${n}Text`) }))))))];
  }

  const q = view.query.trim().toLocaleLowerCase();
  const shown = items.filter((c) => !q || [c.main, ...(c.related ?? [])].some((k) => k?.keyword?.toLocaleLowerCase().includes(q)));
  const current = items.find((c) => keyOf(c) === view.selected) ?? items[0];

  const list = h(doc, 'section', { class: 'card', style: 'width: 460px; flex: none; align-self: flex-start;' },
    h(doc, 'div', { class: 'card-h' }, h(doc, 'div', { class: 'search grow' }, icon(doc, ICONS.search), h(doc, 'input', { class: 'input', type: 'search', name: 'kw-filter', value: view.query, placeholder: ts('searchSaved'), 'aria-label': ts('searchSaved'), oninput: (e) => actions.setViewState?.({ query: e.target.value }) }))),
    h(doc, 'table', { class: 'tbl', 'data-role': 'kw-saved' },
      h(doc, 'thead', {}, h(doc, 'tr', {}, h(doc, 'th', { text: ts('colMain') }), h(doc, 'th', { class: 'r', text: ts('colTerms') }), h(doc, 'th', { class: 'r', text: ts('colDate') }))),
      h(doc, 'tbody', {}, shown.map((c) => {
        const on = keyOf(c) === keyOf(current);
        return h(doc, 'tr', { class: on ? 'sel' : null, style: on ? 'background: var(--soft2);' : null },
          h(doc, 'td', { class: 'b' }, h(doc, 'button', { class: 'row-link', type: 'button', 'aria-pressed': String(on), onclick: () => actions.setViewState?.({ selected: keyOf(c) }), text: c.main?.keyword ?? '—' }), c.live ? h(doc, 'div', { class: 'xs mute', text: ts('thisPage') }) : null),
          h(doc, 'td', { class: 'r num', text: String(1 + (c.related?.length ?? 0)) }),
          h(doc, 'td', { class: 'r mute num', text: shortDate(language, c.capturedAt) }));
      }))),
    h(doc, 'div', { class: 'card-f' },
      h(doc, 'span', { class: 'xs mute grow', text: ts('savedFoot', { count: saved.length }) }),
      h(doc, 'button', { class: 'btn btn-g btn-sm err-text', type: 'button', 'data-kw': 'clear', disabled: !saved.length, onclick: () => actions.clearData(), text: ts('clear') })));

  const terms = current ? [current.main, ...(current.related ?? [])].filter(Boolean) : [];
  const detail = h(doc, 'section', { class: 'card grow', style: 'align-self: flex-start;' },
    current
      ? [
        h(doc, 'div', { class: 'card-h' },
          h(doc, 'div', { class: 'col grow', style: 'gap: 2px;' }, h(doc, 'h2', { class: 'h2', text: current.main?.keyword ?? '' }), h(doc, 'span', { class: 'xs mute', text: ts('detailMeta', { when: current.capturedAt ? new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(current.capturedAt)) : '—', rows: terms.length }) })),
          data?.active ? h(doc, 'span', { class: 'badge dark', text: ts('researching') }) : null),
        data?.active ? h(doc, 'div', { class: 'card-b', style: 'padding-bottom: 0;' }, h(doc, 'div', { class: 'banner' }, icon(doc, ICONS['listing-analyzer']), h(doc, 'span', { class: 'grow' }, h(doc, 'span', { class: 't', text: ts('request') }), ' ', ts('requestText', { seeds: data.active.seeds, done: data.active.done })), h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', 'data-kw': 'cancel', onclick: () => actions.cancel(), text: ts('cancel') }))) : null,
        h(doc, 'table', { class: 'tbl', 'data-role': 'kw-related', style: data?.active ? 'margin-top: 16px; border-top: 1px solid var(--line);' : null },
          h(doc, 'thead', {}, h(doc, 'tr', {}, h(doc, 'th', { text: ts('colTerm') }), h(doc, 'th', { class: 'r', text: ts('colSearches') }), h(doc, 'th', { class: 'r', text: ts('colResults') }), h(doc, 'th', { class: 'r', text: ts('colTrend') }), h(doc, 'th', { class: 'r', text: ts('colOpportunity') }))),
          h(doc, 'tbody', {}, terms.map((k) => h(doc, 'tr', {},
            h(doc, 'td', { class: 'b', text: k.keyword }),
            h(doc, 'td', { class: 'r num', text: num(language, k.searches30d) }),
            h(doc, 'td', { class: 'r num', text: num(language, k.searchResults) }),
            h(doc, 'td', { class: 'r num mute2', text: trend(language, k.trend7dPercent) }),
            h(doc, 'td', { class: 'r' }, opportunityCell(doc, k.opportunity)))))),
        h(doc, 'div', { class: 'card-f' },
          h(doc, 'span', { class: 'xs mute grow', role: 'status', 'data-role': 'kw-status', text: snap.status || ts('detailFoot') }),
          current.live ? h(doc, 'button', { class: 'btn btn-o btn-sm', type: 'button', 'data-kw': 'save', onclick: () => actions.capture(), text: ts('save') }) : null,
          data?.hasResult ? h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', onclick: () => actions.downloadResult(), text: ts('downloadResult') }) : null,
          data?.hasResult ? h(doc, 'button', { class: 'btn btn-p btn-sm', type: 'button', 'data-kw': 'copy-result', onclick: () => actions.copyResult(), text: ts('send') }) : null),
      ]
      : h(doc, 'div', { class: 'card-b xs mute', text: ts('noSelection') }));

  function importDialog(trigger) {
    const file = h(doc, 'input', { class: 'input', type: 'file', id: 'eat-kw-import', accept: 'application/json,.json', style: 'padding-top: 6px;' });
    openDialog(doc, container, {
      title: ts('importTitle'), description: ts('importText'), returnFocus: trigger, closeLabel: ts('cancel'),
      body: h(doc, 'label', { class: 'field', for: 'eat-kw-import' }, h(doc, 'span', { class: 'label', text: ts('importFile') }), file),
      footer: (close) => [h(doc, 'button', { class: 'btn btn-g', type: 'button', onclick: close, text: ts('cancel') }),
        h(doc, 'button', { class: 'btn btn-p', type: 'button', onclick: async () => { const f = file.files?.[0]; if (!f) return; await actions.importRequest(await f.text()); close(); }, text: ts('importButton') })],
    });
  }

  return [
    head,
    data?.active && !current ? alertBox(doc, { tone: 'info', title: ts('request'), text: ts('requestText', { seeds: data.active.seeds, done: data.active.done }) }) : null,
    h(doc, 'div', { class: 'cols' }, list, detail),
  ];
}
