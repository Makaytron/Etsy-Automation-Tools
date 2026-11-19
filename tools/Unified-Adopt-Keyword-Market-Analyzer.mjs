// Adopts the standalone Keyword & Market Analyzer as an engine inside the unified script.
// See tools/Unified-Adopt.mjs for the shared rules.
//
// The research channel to Listing Analyzer keeps its name, so a standalone
// Listing Analyzer (and later the unified one) still reaches this engine.
// Everything else the page shares (panel host, tab-presence channel, lease
// lock) gets an `eat-kw` name, so a standalone copy in another tab never
// mixes with it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adoptStandalone, GM_PROLOGUE } from './Unified-Adopt.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const KW_SOURCE = path.join(repoRoot, 'scripts', 'etsy-keyword-market-analyzer', 'Makaytron-Etsy-Keyword-Market-Analyzer.user.js');

const OPEN = "(function () {\n    'use strict';\n";
// The standalone script starts itself; the unified host starts the engine instead.
const CLOSE = "    } else {\n        void RouteLifecycle.start({ enter: boot, leave: suspendKeywordRoute, change: () => { if (!Runtime.navigationPending) void processQueue(); } });\n    }\n})();\n";

export const KW_EDITS = Object.freeze([
  // Page-level names shared with a standalone copy.
  ["'makaytron-etsy-keyword-market-analyzer'", "'eat-kw-market-analyzer'", 2, 'panel host id'],
  ['`${APP.storagePrefix}:tab-presence`', "'eat-kw:tab-presence'", 1, 'tab-presence channel'],
  ['`${APP.storagePrefix}:processor-lease-mutation`', "'eat-kw:processor-lease-mutation'", 1, 'lease lock name'],
  // Runs only while the unified script allows it (tool enabled, no standalone copy on the page).
  ['const RouteLifecycle = createRouteLifecycle(path => RUNTIME_ROUTE_PATTERN.test(path));',
    'const RouteLifecycle = createRouteLifecycle(path => RUNTIME_ROUTE_PATTERN.test(path) && __env.isAllowed());', 1, 'route gate'],
  // The standalone package's usage metrics stay with the standalone package.
  ['    function telemetrySuppressed() {\n', '    function telemetrySuppressed() {\n        return true;\n', 1, 'no telemetry from the unified engine'],
  // Test hooks a page could set stay with the standalone script.
  ['    if (window.__EKMA_SKIP_INIT__) {', '    if (false) {', 1, 'test surface off'],
  ["typeof window.__EKMA_TEST_NAVIGATE__ === 'function'", 'false', 1, 'test navigation off'],
  // The unified screens follow the engine: status line, saved count, page analysis, research queue.
  ['            if (Runtime.ui) Runtime.ui.status.textContent = message;\n',
    '            if (Runtime.ui) Runtime.ui.status.textContent = message;\n            __eatStatus = String(message ?? \'\');\n            __env.onChange?.();\n', 1, 'status hook'],
  ['            Runtime.ui.count.textContent = `${t(\'saved\')}: ${captures.length}`;\n',
    '            Runtime.ui.count.textContent = `${t(\'saved\')}: ${captures.length}`;\n            __env.onChange?.();\n', 1, 'saved count hook'],
  ['        ensureInlineStyles();\n', '        ensureInlineStyles();\n        __env.onChange?.();\n', 1, 'page analysis hook'],
  ['        async saveQueue(queue) {\n', '        async saveQueue(queue) {\n            Promise.resolve().then(() => __env.onChange?.());\n', 1, 'research queue hook'],
]);

// What the unified screens may read and do. Every command is the engine's
// own function with its own checks; the status texts are the engine's own.
const ENGINE_API = `
    }
    var __eatStatus = null;
    function __eatSnapshot() {
        let capture = null;
        try { const raw = captureCurrentPage(); capture = raw ? publicCapture(raw) : null; } catch { capture = null; }
        return { language, keyword: queryKeyword(), status: __eatStatus ?? t('ready'), capture };
    }
    async function __eatData() {
        const captures = (await Store.captures()).map((entry) => entry.capture).filter(isPlainObject);
        const queue = await Store.queue();
        const item = queue.find((entry) => ['queued', 'running', 'awaiting-receipt'].includes(entry.status)) || null;
        const results = await Store.resultEnvelopes();
        return {
            captures,
            active: item ? { requestId: item.requestId, status: item.status, seeds: item.payload?.seedKeywords?.length || 0, done: Array.isArray(item.seedResults) ? item.seedResults.length : 0 } : null,
            hasResult: results.length > 0,
        };
    }
    function __eatSearch(keyword) {
        const value = normalizeText(keyword);
        if (!value) { UI.status(t('invalidKeyword')); return false; }
        navigateTo(marketplaceUrl(value));
        return true;
    }
    async function __eatImport(text) {
        try {
            const outcome = await importResearchEnvelopeText(text);
            UI.status(tf(outcome.delegated ? 'importDelegated' : 'importAccepted', { requestId: outcome.requestId }));
            return true;
        } catch (error) {
            UI.status(tf('importRejected', { message: String(error?.message || 'INVALID_ENVELOPE').slice(0, 120) }));
            return false;
        } finally { await UI.refreshCount(); }
    }
    async function __eatCopyResult() {
        const outcome = await copyResearchResultEnvelope();
        UI.status(!outcome.ok ? t('resultMissing') : t(outcome.fallback ? 'clipboardError' : 'resultCopied'));
    }
    async function __eatDownloadResult() {
        UI.status(await downloadResearchResultEnvelope() ? t('resultDownloaded') : t('resultMissing'));
    }
    async function __eatCancel() {
        UI.status(await cancelActiveResearch() ? t('queueCancelled') : t('queueEmpty'));
        await UI.refreshCount();
    }
    async function __eatClear() {
        UI.status(await clearLocalData() ? t('clearDataDone') : t('clearDataError'));
        await UI.refreshCount();
    }
    function __eatSyncLanguage(next) {
        if (!['tr', 'en'].includes(next) || next === language || Runtime.processing || !Runtime.ui) return null;
        return UI.setLanguage(next).then(() => UI.toggle(false));
    }`;

const EPILOGUE = `
    function __eatStart() {
        return RouteLifecycle.start({ enter: boot, leave: suspendKeywordRoute, change: () => { if (!Runtime.navigationPending) void processQueue(); } });
    }
    return {
        start: __eatStart, suspend: suspendKeywordRoute, version: APP_VERSION,
        snapshot: __eatSnapshot, data: __eatData, syncLanguage: __eatSyncLanguage,
        search: __eatSearch, capture: () => UI.captureAndSave(), exportJson: () => UI.export(),
        importRequest: __eatImport, copyResult: __eatCopyResult, downloadResult: __eatDownloadResult,
        cancel: __eatCancel, clearData: __eatClear,
    };`;

export function adoptKeywordMarketAnalyzer(source = fs.readFileSync(KW_SOURCE, 'utf8')) {
  return adoptStandalone({
    name: 'Keyword & Market Analyzer', label: 'KEYWORD MARKET ANALYZER', source, open: OPEN, close: CLOSE, edits: KW_EDITS,
    factory: 'createAdoptedKeywordMarketAnalyzer', prologue: GM_PROLOGUE, epilogue: ENGINE_API + EPILOGUE, versionConst: 'ADOPTED_KEYWORD_MARKET_ANALYZER_VERSION',
  });
}
