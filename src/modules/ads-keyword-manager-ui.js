// Ads Keyword Manager screens: drawer section and workspace page (overview, word list).
//
// The screens read the engine snapshot and call the engine's own actions
// (close or open the matching keywords, close them on every page, update or
// restore the word list, open its rule editor), so the standalone script's
// checks still decide what happens on Etsy: one job at a time, nothing while
// the editor is open, and a confirmation before every list change or
// all-pages run.
//
// Design sources: template.primitive.card, template.primitive.table, template.primitive.badge,
// template.primitive.button, template.primitive.tabs;
// shadcn.blocks.kpi-widgets (https://shadcnstore.com/blocks/application/widgets) for the four page tiles;
// shadcn.blocks.datatable (https://shadcnstore.com/blocks/application/datatables) for the rule table.

import { h } from '../ui/dom.js';
import { card, segmented } from '../ui/controls.js';
import { interpolate } from '../core/i18n.js';

export const ADS_STRINGS = Object.freeze({
  en: Object.freeze({
    title: 'Keyword cleanup', description: 'Finds the ad keywords that match your word list on Etsy Ads and turns them off or on.',
    overview: 'Overview', wordlist: 'Word list',
    ready: 'Ready', running: 'Running', success: 'Done', warning: 'Warning', error: 'Error',
    pageSummary: '{rows} keywords on this page · {matches} match your list',
    closePage: 'Turn off matches here', openPage: 'Turn on matches here', closeAll: 'Turn off on every page…',
    details: 'Open details', busy: 'A job is running. Wait until it ends.',
    tilePage: 'Page', tileRows: 'Keywords on this page', tileMatches: 'Match your list', tileHigh: 'High click ratio',
    tileHighHint: 'Over 25 clicks per order', tileMatchesHint: 'Marked in the Etsy table',
    allPagesNote: 'Turning off on every page goes through the pages one by one and asks you first.',
    rulesTitle: '{count} rules', rulesNote: 'A keyword matches when it contains a rule, equals an exact rule, or fits a pattern rule.',
    edit: 'Edit rules', update: 'Get the Makaytron list…', restore: 'Go back to the previous list…',
    noBackup: 'No previous list yet. Updating the list keeps the current one as a backup.',
    colRule: 'Rule', colType: 'Match', contains: 'Contains', exact: 'Exact', regex: 'Pattern',
    loading: 'Reading the word list…',
  }),
  tr: Object.freeze({
    title: 'Anahtar kelime temizliği', description: 'Etsy Ads’te kelime listenizle eşleşen reklam kelimelerini bulur, kapatır veya açar.',
    overview: 'Genel bakış', wordlist: 'Kelime listesi',
    ready: 'Hazır', running: 'Çalışıyor', success: 'Tamamlandı', warning: 'Uyarı', error: 'Hata',
    pageSummary: 'Bu sayfada {rows} kelime · {matches} tanesi listenizle eşleşiyor',
    closePage: 'Buradaki eşleşenleri kapat', openPage: 'Buradaki eşleşenleri aç', closeAll: 'Tüm sayfalarda kapat…',
    details: 'Ayrıntıları aç', busy: 'Bir işlem sürüyor. Bitmesini bekleyin.',
    tilePage: 'Sayfa', tileRows: 'Bu sayfadaki kelimeler', tileMatches: 'Listenizle eşleşen', tileHigh: 'Yüksek tıklama oranı',
    tileHighHint: 'Sipariş başına 25’ten fazla tıklama', tileMatchesHint: 'Etsy tablosunda işaretlenir',
    allPagesNote: 'Tüm sayfalarda kapatma sayfaları tek tek dolaşır ve önce sizden onay ister.',
    rulesTitle: '{count} kural', rulesNote: 'Bir kelime, kuralı içeriyorsa, tam kurala eşitse veya desen kuralına uyuyorsa eşleşir.',
    edit: 'Kuralları düzenle', update: 'Makaytron listesini al…', restore: 'Önceki listeye dön…',
    noBackup: 'Henüz önceki liste yok. Listeyi güncellediğinizde mevcut liste yedek olarak saklanır.',
    colRule: 'Kural', colType: 'Eşleşme', contains: 'İçerir', exact: 'Tam', regex: 'Desen',
    loading: 'Kelime listesi okunuyor…',
  }),
});

function texts(language) {
  const lang = ADS_STRINGS[language] ? language : 'en';
  return (key, vars) => interpolate(ADS_STRINGS[lang][key] ?? ADS_STRINGS.en[key] ?? key, vars);
}

const STATE_BADGE = { ready: '', running: 'badge-dark', success: 'badge-ok', warning: 'badge-warn', error: 'badge-err' };

function stateBadge(doc, ts, state) {
  const key = STATE_BADGE[state] !== undefined ? state : 'ready';
  return h(doc, 'span', { class: `badge ${STATE_BADGE[key]}`.trim(), 'data-ads-state': key, text: ts(key) });
}

function pageButtons(doc, ts, snap, actions, { compact } = {}) {
  const size = compact ? ' btn-sm' : '';
  const blocked = snap.busy || snap.editorOpen;
  const buttons = [
    h(doc, 'button', { class: `btn btn-default${size}`, type: 'button', 'data-ads': 'close-page', disabled: blocked || !snap.stats.matches, onclick: () => actions.closePage(), text: ts('closePage') }),
  ];
  if (!compact) {
    buttons.push(
      h(doc, 'button', { class: 'btn btn-outline', type: 'button', 'data-ads': 'open-page', disabled: blocked || !snap.stats.matches, onclick: () => actions.openPage(), text: ts('openPage') }),
      h(doc, 'button', { class: 'btn btn-outline', type: 'button', 'data-ads': 'close-all', disabled: blocked, onclick: () => actions.closeAllPages(), text: ts('closeAll') }));
  }
  return buttons;
}

/** Drawer section for the Etsy Ads page. */
export function renderAdsDrawer(doc, { snap, language, actions }) {
  const ts = texts(language);
  return h(doc, 'div', { class: 'ads-drawer', 'data-role': 'ads-drawer' },
    h(doc, 'div', { class: 'current' }, h(doc, 'span', { class: 'grow', text: 'Ads Keyword Manager' }), stateBadge(doc, ts, snap.status.state)),
    h(doc, 'div', { class: 'stack' },
      h(doc, 'p', { class: 'muted', 'data-role': 'ads-summary', text: ts('pageSummary', { rows: snap.stats.rows, matches: snap.stats.matches }) }),
      h(doc, 'p', { class: 'muted', role: 'status', 'aria-live': 'polite', 'data-role': 'ads-status', text: snap.status.message })),
    h(doc, 'div', { class: 'row-actions' },
      ...pageButtons(doc, ts, snap, actions, { compact: true }),
      h(doc, 'button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-ads': 'details', onclick: () => actions.openDetails(), text: ts('details') })));
}

/** Workspace page with Overview and Word list. */
export function renderAdsPage(doc, { snap, rules, language, actions, tab = 'overview', onTab }) {
  const ts = texts(language);
  const blocked = snap.busy || snap.editorOpen;

  const tile = (label, value, hint, attrs = {}) => h(doc, 'div', { class: 'tile', ...attrs },
    h(doc, 'span', { class: 'overline', text: label }), h(doc, 'span', { class: 'tile-value', text: value }), hint ? h(doc, 'span', { class: 'field-hint', text: hint }) : null);

  const statusTone = { warning: 'alert-warn', error: 'alert-warn' }[snap.status.state];
  const overview = () => h(doc, 'div', { class: 'stack-lg' },
    h(doc, 'div', { class: 'tiles' },
      tile(ts('tilePage'), snap.stats.page),
      tile(ts('tileRows'), String(snap.stats.rows), null, { 'data-ads-tile': 'rows' }),
      tile(ts('tileMatches'), String(snap.stats.matches), ts('tileMatchesHint'), { 'data-ads-tile': 'matches' }),
      tile(ts('tileHigh'), String(snap.stats.high), ts('tileHighHint'))),
    h(doc, 'p', { class: statusTone ?? 'muted', role: 'status', 'aria-live': 'polite', 'data-role': 'ads-status', 'data-ads-state': snap.status.state }, h(doc, 'b', { text: `${snap.status.title}: ` }), snap.status.message),
    h(doc, 'div', { class: 'row-actions' }, ...pageButtons(doc, ts, snap, actions)),
    h(doc, 'p', { class: 'field-hint', text: snap.busy ? ts('busy') : ts('allPagesNote') }));

  const wordlist = () => {
    if (!rules) return h(doc, 'p', { class: 'field-hint', role: 'status', text: ts('loading') });
    return h(doc, 'div', { class: 'stack-lg' },
      h(doc, 'div', { class: 'row-actions' },
        h(doc, 'button', { class: 'btn btn-default', type: 'button', 'data-ads': 'edit', disabled: snap.busy, onclick: () => actions.editRules(), text: ts('edit') }),
        h(doc, 'button', { class: 'btn btn-outline', type: 'button', 'data-ads': 'update', disabled: blocked, onclick: () => actions.updateList(), text: ts('update') }),
        h(doc, 'button', { class: 'btn btn-ghost', type: 'button', 'data-ads': 'restore', disabled: blocked || !rules.hasBackup, onclick: () => actions.restoreBackup(), text: ts('restore') })),
      rules.hasBackup ? null : h(doc, 'p', { class: 'field-hint', 'data-role': 'ads-no-backup', text: ts('noBackup') }),
      card(doc, { id: 'eat-ads-rules', title: ts('rulesTitle', { count: rules.rules.length }), description: ts('rulesNote') },
        h(doc, 'div', { class: 'table-wrap table-scroll' }, h(doc, 'table', { class: 'table', 'data-role': 'ads-rules' },
          h(doc, 'thead', {}, h(doc, 'tr', {}, ['#', ts('colRule'), ts('colType')].map((c) => h(doc, 'th', { text: c })))),
          h(doc, 'tbody', {}, rules.rules.map((rule, i) => h(doc, 'tr', {},
            h(doc, 'td', { class: 'muted', text: String(i + 1) }),
            h(doc, 'td', {}, h(doc, 'span', { class: 'mono-code', text: rule.value })),
            h(doc, 'td', {}, h(doc, 'span', { class: rule.type === 'contains' ? 'badge' : 'badge badge-dark', text: ts(rule.type) })))))))));
  };

  const pages = { overview, wordlist };
  return h(doc, 'div', { style: 'display:contents' },
    h(doc, 'div', { class: 'page-head' },
      h(doc, 'span', { class: 'overline', text: 'Ads Keyword Manager' }),
      h(doc, 'h1', { class: 'page-title', text: ts('title') }),
      h(doc, 'p', { class: 'page-description', text: ts('description') })),
    segmented(doc, {
      labelledBy: 'eat-ads-tabs', name: 'ads-tab', value: tab,
      options: [{ value: 'overview', label: ts('overview') }, { value: 'wordlist', label: ts('wordlist') }],
      onChange: (next) => onTab(next),
    }),
    (pages[tab] ?? overview)());
}
