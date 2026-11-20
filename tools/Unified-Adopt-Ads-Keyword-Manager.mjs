// Adopts the standalone Ads Keyword Manager as an engine inside the unified script.
// See tools/Unified-Adopt.mjs for the shared rules.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adoptStandalone, GM_PROLOGUE } from './Unified-Adopt.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ADS_SOURCE = path.join(repoRoot, 'scripts', 'etsy-ads-keyword-manager', 'Makaytron-Etsy-Ads-Keyword-Manager.user.js');

const OPEN = "(function () {\n    'use strict';\n";
// The standalone script starts itself after the page load; the unified host starts the engine instead.
const CLOSE = "    if (document.readyState === 'complete') {\n        void RouteLifecycle.start({ enter: startInitialization, leave: suspendAdsRoute, change: startInitialization });\n    } else {\n        window.addEventListener('load', () => { void RouteLifecycle.start({ enter: startInitialization, leave: suspendAdsRoute, change: startInitialization }); }, { once: true });\n    }\n\n})();\n";

export const ADS_EDITS = Object.freeze([
  // Element ids shared with a standalone copy on the same page.
  ["'makaytron-ad-wordlist'", "'eat-ads-wordlist'", 1, 'panel element id'],
  ["'makaytron-ad-wordlist-toasts'", "'eat-ads-wordlist-toasts'", 1, 'toast element id'],
  ["'makaytron-ad-wordlist-editor'", "'eat-ads-wordlist-editor'", 1, 'editor element id'],
  // Runs only while the unified script allows it (tool enabled, no standalone copy on the page).
  ['const RouteLifecycle = createRouteLifecycle(path => RUNTIME_ROUTE_PATTERN.test(path));',
    'const RouteLifecycle = createRouteLifecycle(path => RUNTIME_ROUTE_PATTERN.test(path) && __env.isAllowed());', 1, 'route gate'],
  // The standalone package's usage metrics stay with the standalone package.
  ['    function telemetrySuppressed() {\n', '    function telemetrySuppressed() {\n        return true;\n', 1, 'no telemetry from the unified engine'],
  // The unified screens follow the engine: page counts, status line and busy state.
  ["        const matchEl = panelEl.querySelector('[data-stat=\"matches\"]');\n",
    "        __eatStats = { ...values };\n        __env.onChange?.();\n        const matchEl = panelEl.querySelector('[data-stat=\"matches\"]');\n", 1, 'page counts hook'],
  ['            pillEl.textContent = label;\n        }\n',
    '            pillEl.textContent = label;\n        }\n        __env.onChange?.();\n', 1, 'status hook'],
  ['            button.disabled = Boolean(busy);\n        });\n',
    '            button.disabled = Boolean(busy);\n        });\n        __env.onChange?.();\n', 1, 'busy hook'],
]);

// What the unified screens may read and do. Every command is the engine's own
// action with its own checks (busy, editor open, confirmation, route gate).
const ENGINE_API = `
    var __eatStats = { page: '—', rows: '0', matches: '0', high: '0' };
    function __eatSnapshot() {
        const labelKeys = { ready: 'ready', running: 'running', success: 'completed', warning: 'warning', error: 'error' };
        const model = panelStatusModel;
        const message = model.literal ? String(model.messageKey || t('ready')) : t(model.messageKey || 'ready', model.params);
        return {
            language: currentLanguage,
            busy: Boolean(activeOperation || wordlistUpdateRunning),
            editorOpen: Boolean(document.getElementById(EDITOR_MODAL_ID)),
            status: { state: model.state, title: model.titleKey ? t(model.titleKey, model.params) : t(labelKeys[model.state] || 'ready'), message },
            stats: { page: String(__eatStats.page), rows: Number(__eatStats.rows) || 0, matches: Number(__eatStats.matches) || 0, high: Number(__eatStats.high) || 0 },
        };
    }
    async function __eatRules() {
        const stored = await getRulesValue('adWordlist', DEFAULT_WORDLIST);
        const raw = typeof stored === 'string' && stored.trim() ? stored : DEFAULT_WORDLIST;
        const backup = await getRulesValue(WORDLIST_BACKUP_KEY, '');
        return {
            rules: parseWordlist(raw).map((rule, index) => decodeEditorRule(rule, index + 1)).filter((rule) => rule.value).map(({ type, value }) => ({ type, value })),
            hasBackup: typeof backup === 'string' && Boolean(backup.trim()),
        };
    }
    // Rows of this page that match the word list, for the workspace table (design canvas: Ads-Overview).
    function __eatCellText(row, names) {
        const table = row.closest('table');
        if (!table) return '';
        const wanted = names.map(normalizeText);
        const semantic = Array.from(row.querySelectorAll(':scope > td')).find((cell) => wanted.includes(normalizeText(cell.querySelector(':scope > .wt-table--responsive__title')?.textContent)));
        const index = Array.from(table.querySelectorAll('thead th')).findIndex((header) => wanted.includes(normalizeText(header.textContent)));
        const cell = semantic || (index >= 0 ? row.children[index] : null);
        return cell ? String(getReadableCellText(cell) ?? '').trim().slice(0, 24) : '';
    }
    async function __eatMatches() {
        if (!RouteLifecycle.allowed()) return null;
        try {
            const wordlist = await loadWordlist();
            const rows = [];
            let unmatched = 0;
            for (const row of getAllRows()) {
                const keyword = getRowWord(row);
                if (!keyword) continue;
                const rule = wordlist.find((word) => wordMatchesRow(word, keyword));
                if (!rule) { unmatched += 1; continue; }
                const decoded = decodeEditorRule(rule, 0);
                const box = row.querySelector('input[type=checkbox]');
                rows.push({
                    keyword, rule: decoded.value, type: decoded.type,
                    clicks: getMetricValue(row, ['Clicks', 'Click', 'Tıklamalar', 'Tıklama']),
                    orders: getMetricValue(row, ['Orders', 'Order', 'Siparişler', 'Sipariş']),
                    spend: __eatCellText(row, ['Spend', 'Ad spend', 'Harcama', 'Reklam harcaması']),
                    enabled: Boolean(box?.checked), switchable: Boolean(box && !box.disabled), high: isHighClickRatioRow(row),
                });
            }
            return { rows, unmatched };
        } catch {
            return null;
        }
    }
    // One row on or off, as if the user pressed its Etsy switch; the same steady-state check as a page run.
    function __eatToggleOne(keyword, targetState) {
        if (!RouteLifecycle.allowed() || activeOperation || wordlistUpdateRunning || document.getElementById(EDITOR_MODAL_ID)) return Promise.resolve(false);
        const route = RouteLifecycle.capture();
        activeOperation = (async () => {
            const row = (await getFilteredRows()).find((candidate) => getRowWord(candidate) === keyword);
            const box = row?.querySelector('input[type=checkbox]');
            if (!box || box.disabled) return false;
            if (box.checked === targetState) return true;
            const changed = await waitForStableCheckboxState(box, targetState, () => { assertAdsRoute(route); box.click(); });
            await decorateRows();
            if (changed) notify('success', t('keywordChanged', { keyword, state: t(targetState ? 'enabled' : 'disabled') }));
            return changed;
        })().catch(() => false).finally(() => { activeOperation = null; __env.onChange?.(); });
        return activeOperation;
    }
    // Saves a whole rule list from the workspace's word list page, by the editor's own rules.
    async function __eatSaveRules(list) {
        if (!RouteLifecycle.allowed() || activeOperation || wordlistUpdateRunning || document.getElementById(EDITOR_MODAL_ID)) return { ok: false, reason: 'busy' };
        const value = (Array.isArray(list) ? list : []).map((rule) => encodeEditorRule({ type: rule?.type === 'exact' ? 'exact' : rule?.type === 'regex' ? 'regex' : 'contains', value: String(rule?.value ?? ''), edited: true })).filter(Boolean).join('\\n');
        if (!value) return { ok: false, reason: 'empty' };
        if (new TextEncoder().encode(value).length > MAX_WORDLIST_BYTES) return { ok: false, reason: 'too_large' };
        await setRulesValue('adWordlist', value);
        try {
            const filteredRows = await decorateRows();
            const params = { rules: quantity(value.split('\\n').length, 'rule'), matches: quantity(filteredRows.length, 'match') };
            notify('success', t('rulesSaved', params));
            setPanelStatus('rulesSavedStatus', 'success', '', params);
        } catch { /* the list is saved; the page marks catch up on the next read */ }
        __env.onChange?.();
        return { ok: true };
    }
    function __eatSyncLanguage(language) {
        if (!['tr', 'en'].includes(language) || language === currentLanguage) return null;
        if (activeOperation || wordlistUpdateRunning || languageChangePromise) return null;
        return switchLanguage();
    }`;

const EPILOGUE = `
    function __eatStart() {
        const begin = () => RouteLifecycle.start({ enter: startInitialization, leave: suspendAdsRoute, change: startInitialization });
        if (document.readyState === 'complete') return begin();
        window.addEventListener('load', () => { void begin(); }, { once: true });
        return undefined;
    }
    return {
        start: __eatStart, suspend: suspendAdsRoute, version: APP_VERSION,
        snapshot: __eatSnapshot, rules: __eatRules, syncLanguage: __eatSyncLanguage, matches: __eatMatches, toggleOne: __eatToggleOne, saveRules: __eatSaveRules,
        closePage: () => runToggleRows(false), openPage: () => runToggleRows(true), closeAllPages: requestDisableAllPages,
        updateList: ensureWord, restoreBackup: restoreWordlistBackup, editRules: openWordlistEditor,
    };`;

export function adoptAdsKeywordManager(source = fs.readFileSync(ADS_SOURCE, 'utf8')) {
  return adoptStandalone({
    name: 'Ads Keyword Manager', label: 'ADS KEYWORD MANAGER', source, open: OPEN, close: CLOSE, edits: ADS_EDITS,
    factory: 'createAdoptedAdsKeywordManager', prologue: GM_PROLOGUE, epilogue: ENGINE_API + EPILOGUE, versionConst: 'ADOPTED_ADS_KEYWORD_MANAGER_VERSION',
  });
}
