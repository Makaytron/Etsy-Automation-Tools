// Ads Keyword Manager screens, as the design canvas draws them: the drawer
// section (Ads-OnEtsy), the workspace page — Overview (Ads-Overview) and
// Word list (Ads-Rules, with the rule editing of Ads-RuleEdit inline) — and
// the first-use page (Ads-Empty).
//
// The screens read the engine snapshot and its list of matching rows, and call
// the engine's own actions (turn matches off or on, one row or the page, every
// page, save the word list, update or restore it), so the standalone script's
// checks still decide what happens on Etsy: one job at a time, nothing while
// its editor is open, and a confirmation before every all-pages run.
//
// Design sources: template.primitive.card, .table, .badge, .button, .tabs,
// .input, .select; shadcn.blocks.kpi-widgets for the page tiles;
// shadcn.blocks.datatable for the match and rule tables.

import { h, icon } from '../ui/dom.js';
import { ICONS } from '../ui/icons.js';
import { pageHead, pageTabs, toggle, alertBox } from '../ui/controls.js';
import { interpolate } from '../core/i18n.js';
import { packText } from '../core/language-packs.js';

export const ADS_STRINGS = Object.freeze({
  en: Object.freeze({
    title: 'Ad keywords', description: 'Finds the Etsy Ads keywords that fit your word list and turns them off on this page or on every page.',
    overview: 'Overview', wordlist: 'Word list', tabs: 'Ads Keyword Manager pages',
    ready: 'Ready', running: 'Running', success: 'Done', warning: 'Warning', error: 'Error',
    pageSummary: '{rows} keywords on this page · {matches} match your list',
    closePage: 'Turn off matches here', closePageN: 'Turn off the {n} matches on this page', openPage: 'Turn on matches here', closeAll: 'Scan every page',
    editList: 'Edit the word list', details: 'Open details', busy: 'A job is running. Wait until it ends.',
    tilePage: 'Page', tileRows: 'On this page', tileRowsHint: 'keywords', tileMatches: 'Matching', tileMatchesHint: 'by {n} rules', tileHigh: 'High spend ratio', tileHighHint: 'Spend without orders',
    matchesTitle: 'Matches on this page', colKeyword: 'Keyword', colRule: 'Matching rule', colClicks: 'Clicks', colSpend: 'Spend', colOrders: 'Orders', colOn: 'On',
    highBadge: 'High ratio', unmatched: '{n} keywords match no rule and stay as they are.', shortcut: 'Shortcut', noMatches: 'No keyword on this page matches your list.', reading: 'Reading the keywords…',
    allTitle: 'Every page', allText: 'The ad’s pages are scanned one after another and the matches are turned off. Before it starts, it shows how many keywords will be turned off and asks you.',
    lastTitle: 'Last action', reopen: 'Turn the matches back on here',
    rowOff: 'Turn off {keyword}', rowOn: 'Turn on {keyword}',
    addTitle: 'Add a new word', addWord: 'Word or phrase', addWordPlaceholder: 'For example t-shirt or comfort colors', addHow: 'Which keywords should turn off?',
    howContains: 'Every keyword that contains it (recommended)', howExact: 'Only exactly the same', howRegex: 'A pattern',
    addButton: 'Add to the list', addHint: 'Example: with "bts", keywords such as "bts shirt" and "cute bts gift" are found.',
    rulesTitle: 'Added words', rulesMeta: '{count} rules · {matches} matches on this page', search: 'Search the rules',
    colWord: 'Word', colWhich: 'Which keywords', colHere: 'On this page', colActions: 'Actions',
    contains: 'Contains', exact: 'Exact', regex: 'Pattern', editRule: 'Edit the rule {rule}', deleteRule: 'Delete the rule {rule}', saveRule: 'Save', cancel: 'Cancel',
    update: 'Get the Makaytron list…', restore: 'Go back to the previous list…', fullEditor: 'Open the full editor',
    noBackup: 'No previous list yet. Updating the list keeps the current one as a backup.',
    saved: 'The word list is saved.', saveBusy: 'A job is running; the list was not saved.', saveEmpty: 'The list needs at least one rule.', saveLarge: 'The list is too large.',
    emptyTitle: 'Your word list is empty', emptyText: 'Add the words whose ad keywords should not run. On Etsy Ads, the keywords that contain them are found and turned off when you say so.',
    emptyStart: 'Add the first word', emptyMakaytron: 'Get the Makaytron list',
    how1: 'Add words', how1Text: 'Words or phrases you do not want ads for.', how2: 'Open an ad', how2Text: 'On Etsy Ads, the matching keywords are marked.', how3: 'Turn them off', how3Text: 'On this page or on every page, after you confirm.',
    loading: 'Reading the word list…',
  }),
});

// Bundled English; other languages read the downloaded pack ("ads." keys).
function texts(language) {
  const lang = ADS_STRINGS[language] ? language : 'en';
  return (key, vars) => interpolate(ADS_STRINGS[language]?.[key] ?? packText(language, `ads.${key}`) ?? ADS_STRINGS[lang][key] ?? ADS_STRINGS.en[key] ?? key, vars);
}

const STATE_BADGE = { ready: '', running: 'dark', success: 'ok', warning: 'warn', error: 'err' };

function stateBadge(doc, ts, state) {
  const key = STATE_BADGE[state] !== undefined ? state : 'ready';
  return h(doc, 'span', { class: `badge ${STATE_BADGE[key]}`.trim(), 'data-ads-state': key, text: ts(key) });
}

function kbd(doc, binding) {
  return h(doc, 'span', { class: 'row', style: 'gap: 4px; display: inline-flex;' }, String(binding ?? '').split('+').map((k) => h(doc, 'span', { class: 'kbd', text: k })));
}

/** Drawer section for the Etsy Ads page (Ads-OnEtsy). */
export function renderAdsDrawer(doc, { snap, language, actions }) {
  const ts = texts(language);
  const blocked = snap.busy || snap.editorOpen;
  return h(doc, 'div', { class: 'col', style: 'gap: 12px;', 'data-role': 'ads-drawer' },
    h(doc, 'div', { class: 'row' }, icon(doc, ICONS['ads-keyword-manager']), h(doc, 'span', { class: 'h3 grow', id: 'eat-current', text: 'Ads Keyword Manager' }), stateBadge(doc, ts, snap.status.state)),
    h(doc, 'div', { class: 'col', style: 'gap: 4px;' },
      h(doc, 'span', { class: 'xs mute2', 'data-role': 'ads-summary', text: ts('pageSummary', { rows: snap.stats.rows, matches: snap.stats.matches }) }),
      h(doc, 'span', { class: 'xxs mute', role: 'status', 'aria-live': 'polite', 'data-role': 'ads-status', text: snap.status.message })),
    snap.status.state === 'error' ? alertBox(doc, { tone: 'err', title: snap.status.title, text: snap.status.message }) : null,
    h(doc, 'div', { class: 'row' },
      h(doc, 'button', { class: 'btn btn-o btn-sm grow', type: 'button', 'data-ads': 'details', onclick: () => actions.openDetails(), text: ts('details') }),
      h(doc, 'button', { class: 'btn btn-p btn-sm grow', type: 'button', 'data-ads': 'close-page', disabled: blocked || !snap.stats.matches, onclick: () => actions.closePage() }, icon(doc, ICONS.power ?? ICONS.close, 14), ts('closePage'))));
}

/** Workspace page with Overview and Word list. */
export function renderAdsPage(doc, { snap, rules, matches, language, actions, tab = 'overview', onTab, shortcuts = null }) {
  const ts = texts(language);
  const blocked = snap.busy || snap.editorOpen;
  const keys = shortcuts?.keys ?? {};
  const ruleCount = rules?.rules?.length ?? 0;

  const overview = () => {
    if (rules && !ruleCount) return [empty()];
    const rows = matches?.rows ?? [];
    const spendMax = Math.max(1, ...rows.map((r) => parseFloat(String(r.spend).replace(/[^0-9.,]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')) || 0));
    const spendOf = (r) => parseFloat(String(r.spend).replace(/[^0-9.,]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')) || 0;
    return [
      h(doc, 'div', { class: 'g4' },
        h(doc, 'div', { class: 'tile' }, h(doc, 'span', { class: 'ov', text: ts('tilePage') }), h(doc, 'span', { class: 'v', text: snap.stats.page })),
        h(doc, 'div', { class: 'tile', 'data-ads-tile': 'rows' }, h(doc, 'span', { class: 'ov', text: ts('tileRows') }), h(doc, 'span', { class: 'v', text: String(snap.stats.rows) }), h(doc, 'span', { class: 'xs mute', text: ts('tileRowsHint') })),
        h(doc, 'div', { class: 'tile', 'data-ads-tile': 'matches' }, h(doc, 'span', { class: 'ov', text: ts('tileMatches') }), h(doc, 'span', { class: 'v', text: String(snap.stats.matches) }), h(doc, 'span', { class: 'xs mute', text: ts('tileMatchesHint', { n: ruleCount }) })),
        h(doc, 'div', { class: 'tile' }, h(doc, 'span', { class: 'ov', text: ts('tileHigh') }), h(doc, 'span', { class: 'v', text: String(snap.stats.high) }), h(doc, 'span', { class: 'xs mute', text: ts('tileHighHint') }))),
      snap.status.state === 'warning' || snap.status.state === 'error'
        ? alertBox(doc, { tone: snap.status.state === 'error' ? 'err' : 'warn', title: snap.status.title, text: snap.status.message })
        : null,
      h(doc, 'div', { class: 'cols' },
        h(doc, 'section', { class: 'card grow', style: 'align-self: flex-start;' },
          h(doc, 'div', { class: 'card-h' }, h(doc, 'h2', { class: 'h2 grow', text: ts('matchesTitle') }), h(doc, 'span', { class: 'xs mute', role: 'status', 'data-role': 'ads-status', 'data-ads-state': snap.status.state, text: snap.status.message })),
          matches
            ? rows.length
              ? h(doc, 'table', { class: 'tbl', 'data-role': 'ads-matches' },
                h(doc, 'thead', {}, h(doc, 'tr', {}, h(doc, 'th', { text: ts('colKeyword') }), h(doc, 'th', { text: ts('colRule') }), h(doc, 'th', { class: 'r', text: ts('colClicks') }), h(doc, 'th', { class: 'r', text: ts('colSpend') }), h(doc, 'th', { class: 'r', text: ts('colOrders') }), h(doc, 'th', { class: 'r', text: ts('colOn') }))),
                h(doc, 'tbody', {}, rows.map((r) => h(doc, 'tr', { 'data-keyword': r.keyword },
                  h(doc, 'td', { class: 'b' }, r.keyword, r.high ? h(doc, 'span', { class: 'badge warn', style: 'margin-inline-start: 8px;', text: ts('highBadge') }) : null),
                  h(doc, 'td', {}, h(doc, 'span', { class: r.type === 'contains' ? 'badge' : 'badge out', text: ts(r.type) }), ' ', h(doc, 'span', { class: 'mono xs', text: r.rule })),
                  h(doc, 'td', { class: 'r num', text: String(r.clicks) }),
                  h(doc, 'td', { class: 'r' }, h(doc, 'span', { class: 'row', style: 'justify-content: flex-end; gap: 8px;' },
                    h(doc, 'span', { class: 'spend-bar' }, h(doc, 'span', { style: `width: ${Math.round((spendOf(r) / spendMax) * 100)}%;${r.high ? ' background: #dc2626;' : ''}` })),
                    h(doc, 'span', { class: 'num', style: 'min-width: 48px; text-align: right;', text: r.spend || '—' }))),
                  h(doc, 'td', { class: 'r num', text: String(r.orders) }),
                  h(doc, 'td', { class: 'r' }, toggle(doc, { name: `ads-row-${r.keyword}`, checked: r.enabled, disabled: blocked || !r.switchable, label: ts(r.enabled ? 'rowOff' : 'rowOn', { keyword: r.keyword }), onChange: (on) => actions.toggleOne(r.keyword, on) }))))))
              : h(doc, 'div', { class: 'card-b xs mute', text: ts('noMatches') })
            : h(doc, 'div', { class: 'card-b row xs mute' }, h(doc, 'span', { class: 'spin', style: 'width: 12px; height: 12px;' }), ts('reading')),
          h(doc, 'div', { class: 'card-f' },
            h(doc, 'span', { class: 'xs mute grow', text: matches ? ts('unmatched', { n: matches.unmatched }) : '' }),
            keys.adsClosePage ? [h(doc, 'span', { class: 'xs mute', text: ts('shortcut') }), kbd(doc, keys.adsClosePage)] : null)),
        h(doc, 'aside', { class: 'col', style: 'width: 340px; flex: none; gap: 16px;' },
          h(doc, 'section', { class: 'card' },
            h(doc, 'div', { class: 'card-h' }, h(doc, 'h2', { class: 'h2', text: ts('allTitle') })),
            h(doc, 'div', { class: 'card-b col', style: 'gap: 12px;' },
              h(doc, 'p', { class: 'sm mute2', text: ts('allText') }),
              h(doc, 'button', { class: 'btn btn-o', type: 'button', style: 'width: 100%;', 'data-ads': 'close-all', disabled: blocked, onclick: () => actions.closeAllPages(), text: ts('closeAll') }),
              keys.adsScanAll ? h(doc, 'span', { class: 'xs mute row', style: 'gap: 6px;' }, ts('shortcut'), kbd(doc, keys.adsScanAll)) : null)),
          snap.status.state === 'success'
            ? h(doc, 'section', { class: 'card' },
              h(doc, 'div', { class: 'card-h' }, h(doc, 'h2', { class: 'h2 grow', text: ts('lastTitle') })),
              h(doc, 'div', { class: 'card-b col', style: 'gap: 10px;' },
                h(doc, 'span', { class: 'sm', text: snap.status.message }),
                h(doc, 'button', { class: 'btn btn-o btn-sm', type: 'button', style: 'align-self: flex-start;', 'data-ads': 'open-page', disabled: blocked, onclick: () => actions.openPage(), text: ts('reopen') })))
            : null)),
    ];
  };

  const empty = () => h(doc, 'section', { class: 'card empty', 'aria-labelledby': 'eat-ads-empty' },
    h(doc, 'div', { class: 'ei' }, icon(doc, ICONS['ads-keyword-manager'], 24)),
    h(doc, 'h2', { class: 'et', id: 'eat-ads-empty', text: ts('emptyTitle') }),
    h(doc, 'p', { class: 'ed', text: ts('emptyText') }),
    h(doc, 'div', { class: 'ea' },
      h(doc, 'button', { class: 'btn btn-p', type: 'button', onclick: () => onTab('wordlist'), text: ts('emptyStart') }),
      h(doc, 'button', { class: 'btn btn-o', type: 'button', 'data-ads': 'update', disabled: blocked, onclick: () => actions.updateList(), text: ts('emptyMakaytron') })),
    h(doc, 'div', { class: 'steps', 'aria-label': ts('how1') }, [1, 2, 3].map((n) => h(doc, 'div', {},
      h(doc, 'span', { class: 'n', text: String(n) }),
      h(doc, 'span', {}, h(doc, 'span', { class: 'st', text: ts(`how${n}`) }), h(doc, 'span', { class: 'sd', text: ts(`how${n}Text`) }))))));

  const wordlist = () => {
    if (!rules) return [h(doc, 'p', { class: 'xs mute row', role: 'status' }, h(doc, 'span', { class: 'spin', style: 'width: 12px; height: 12px;' }), ts('loading'))];
    const list = rules.rules.map((r) => ({ ...r }));
    const state = actions.wordlistState?.() ?? { query: '', editing: -1 };
    const hereCount = (rule) => (matches?.rows ?? []).filter((m) => m.rule === rule.value && m.type === rule.type).length;
    const save = async (next) => {
      const result = await actions.saveRules(next);
      actions.say?.(result.ok ? ts('saved') : ts({ busy: 'saveBusy', empty: 'saveEmpty', too_large: 'saveLarge' }[result.reason] ?? 'saveBusy'));
    };
    const word = h(doc, 'input', { class: 'input', type: 'text', id: 'eat-ads-word', name: 'ads-word', placeholder: ts('addWordPlaceholder'), autocomplete: 'off', spellcheck: 'false' });
    const how = h(doc, 'select', { class: 'input', id: 'eat-ads-how', name: 'ads-how' },
      h(doc, 'option', { value: 'contains', text: ts('howContains') }), h(doc, 'option', { value: 'exact', text: ts('howExact') }), h(doc, 'option', { value: 'regex', text: ts('howRegex') }));
    const add = () => { const value = word.value.trim(); if (!value) { word.focus(); return; } void save([...list, { type: how.value, value }]); };
    word.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    const q = state.query.trim().toLocaleLowerCase();
    const shown = list.map((r, i) => ({ ...r, i })).filter((r) => !q || r.value.toLocaleLowerCase().includes(q));
    return [
      h(doc, 'section', { class: 'card' },
        h(doc, 'div', { class: 'card-h' }, h(doc, 'h2', { class: 'h2', text: ts('addTitle') })),
        h(doc, 'div', { class: 'card-b col', style: 'gap: 10px;' },
          h(doc, 'div', { class: 'row', style: 'gap: 12px; align-items: flex-end;' },
            h(doc, 'label', { class: 'field grow', for: 'eat-ads-word' }, h(doc, 'span', { class: 'label', text: ts('addWord') }), word),
            h(doc, 'label', { class: 'field', for: 'eat-ads-how', style: 'width: 300px;' }, h(doc, 'span', { class: 'label', text: ts('addHow') }), how),
            h(doc, 'button', { class: 'btn btn-p', type: 'button', 'data-ads': 'add-rule', disabled: blocked, onclick: add }, icon(doc, ICONS.plus, 16), ts('addButton'))),
          h(doc, 'span', { class: 'hint', text: ts('addHint') }))),
      h(doc, 'section', { class: 'card' },
        h(doc, 'div', { class: 'card-h' },
          h(doc, 'div', { class: 'col grow', style: 'gap: 2px;' }, h(doc, 'h2', { class: 'h2', text: ts('rulesTitle') }), h(doc, 'span', { class: 'xs mute', text: ts('rulesMeta', { count: list.length, matches: snap.stats.matches }) })),
          h(doc, 'div', { class: 'search', style: 'width: 260px;' }, icon(doc, ICONS.search), h(doc, 'input', { class: 'input', type: 'search', name: 'ads-search', value: state.query, placeholder: ts('search'), 'aria-label': ts('search'), oninput: (e) => actions.setWordlistState?.({ query: e.target.value }) }))),
        h(doc, 'table', { class: 'tbl', 'data-role': 'ads-rules' },
          h(doc, 'thead', {}, h(doc, 'tr', {}, h(doc, 'th', { text: ts('colWord') }), h(doc, 'th', { text: ts('colWhich') }), h(doc, 'th', { class: 'r', text: ts('colHere') }), h(doc, 'th', { class: 'r' }, h(doc, 'span', { class: 'sr-only', text: ts('colActions') })))),
          h(doc, 'tbody', {}, shown.map((r) => {
            if (state.editing === r.i) {
              const value = h(doc, 'input', { class: 'input mono', name: 'ads-edit-value', value: r.value, 'aria-label': ts('addWord') });
              const type = h(doc, 'select', { class: 'input', name: 'ads-edit-type', 'aria-label': ts('addHow') }, ['contains', 'exact', 'regex'].map((v) => h(doc, 'option', { value: v, selected: v === r.type, text: ts(v) })));
              return h(doc, 'tr', { 'data-rule': r.i },
                h(doc, 'td', {}, value), h(doc, 'td', {}, type), h(doc, 'td', { class: 'r num', text: String(hereCount(r)) }),
                h(doc, 'td', { class: 'r', style: 'width: 180px;' },
                  h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', onclick: () => actions.setWordlistState?.({ editing: -1 }), text: ts('cancel') }),
                  h(doc, 'button', { class: 'btn btn-p btn-sm', type: 'button', onclick: () => { const next = list.slice(); next[r.i] = { type: type.value, value: value.value.trim() }; actions.setWordlistState?.({ editing: -1 }); void save(next.filter((x) => x.value)); }, text: ts('saveRule') })));
            }
            return h(doc, 'tr', { 'data-rule': r.i },
              h(doc, 'td', {}, h(doc, 'span', { class: 'mono b', text: r.value })),
              h(doc, 'td', {}, h(doc, 'span', { class: r.type === 'contains' ? 'badge' : 'badge out', text: ts(r.type) })),
              h(doc, 'td', { class: 'r num', text: String(hereCount(r)) }),
              h(doc, 'td', { class: 'r', style: 'width: 100px;' },
                h(doc, 'button', { class: 'ib', type: 'button', disabled: blocked, 'aria-label': ts('editRule', { rule: r.value }), onclick: () => actions.setWordlistState?.({ editing: r.i }) }, icon(doc, ICONS.edit)),
                h(doc, 'button', { class: 'ib', type: 'button', disabled: blocked || list.length < 2, 'aria-label': ts('deleteRule', { rule: r.value }), onclick: () => void save(list.filter((_, j) => j !== r.i)) }, icon(doc, ICONS.trash))));
          }))),
        h(doc, 'div', { class: 'card-f' },
          h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', 'data-ads': 'edit', disabled: snap.busy, onclick: () => actions.editRules(), text: ts('fullEditor') }),
          h(doc, 'span', { class: 'grow' }),
          h(doc, 'button', { class: 'btn btn-o btn-sm', type: 'button', 'data-ads': 'update', disabled: blocked, onclick: () => actions.updateList(), text: ts('update') }),
          h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', 'data-ads': 'restore', disabled: blocked || !rules.hasBackup, title: rules.hasBackup ? null : ts('noBackup'), onclick: () => actions.restoreBackup(), text: ts('restore') }))),
    ];
  };

  const headActions = tab === 'overview' && ruleCount
    ? [h(doc, 'button', { class: 'btn btn-o', type: 'button', onclick: () => onTab('wordlist') }, icon(doc, ICONS.edit, 16), ts('editList')),
      h(doc, 'button', { class: 'btn btn-p', type: 'button', 'data-ads': 'close-page', disabled: blocked || !snap.stats.matches, onclick: () => actions.closePage() }, icon(doc, ICONS.power ?? ICONS.close, 16), ts('closePageN', { n: snap.stats.matches }))]
    : [];
  return [
    pageHead(doc, { overline: 'Ads Keyword Manager', title: ts('title'), description: ts('description'), actions: headActions }),
    pageTabs(doc, { label: ts('tabs'), name: 'ads-tab', value: tab, options: [{ value: 'overview', label: ts('overview') }, { value: 'wordlist', label: ts('wordlist'), count: 0 }], onChange: (next) => onTab(next) }),
    ...({ overview, wordlist }[tab] ?? overview)(),
    snap.busy ? h(doc, 'p', { class: 'xs mute2', role: 'status', text: ts('busy') }) : null,
  ];
}
