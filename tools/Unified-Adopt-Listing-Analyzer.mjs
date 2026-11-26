// Adopts the standalone Listing Analyzer as an engine inside the unified script.
// See tools/Unified-Adopt.mjs for the shared rules.
//
// The research channel to Keyword & Market Analyzer keeps its name, so the
// two still find each other. Everything else the page shares (panel host,
// tab-presence channel, storage locks, the per-tab id and the collection
// handoff in sessionStorage) gets an `eat-la` name, so a standalone copy in
// the same tab or another one never mixes with it. Test hooks a page could
// set are off.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adoptStandalone, GM_PROLOGUE } from './Unified-Adopt.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LA_SOURCE = path.join(repoRoot, 'scripts', 'etsy-listing-analyzer', 'Makaytron-Etsy-Listing-Analyzer.user.js');

const OPEN = "(function () {\n    'use strict';\n";
// The standalone script starts itself; the unified host starts the engine instead.
const CLOSE = "    if (window.__MAKAYTRON_LISTING_SKIP_INIT__ !== true) {\n        void RouteLifecycle.start({ enter: init, leave: suspendListingRoute }).catch((error) => {\n            console.error(`[${APP.name}]`, error);\n            if (state.panel) UI.setStatus('formNotReady', 'error');\n        });\n    }\n})();\n";

export const LA_EDITS = Object.freeze([
  // Page-level names shared with a standalone copy.
  ["            state.host.id = 'makaytron-etsy-listing-analyzer';", "            state.host.id = 'eat-listing-analyzer';", 1, 'panel host id'],
  ['`${APP.storagePrefix}:tab-presence`', "'eat-la:tab-presence'", 1, 'tab-presence channel'],
  ['`${APP.storagePrefix}:tab-id`', "'eat-la:tab-id'", 2, 'per-tab id in sessionStorage'],
  ["    const COLLECTION_HANDOFF_KEY = 'meli:v1:collection-navigation-handoff';", "    const COLLECTION_HANDOFF_KEY = 'eat-la:collection-navigation-handoff';", 1, 'collection handoff in sessionStorage'],
  ["        return navigator.locks.request(name, { mode: 'exclusive' }, callback);", "        return navigator.locks.request(`eat-la:${name}`, { mode: 'exclusive' }, callback);", 1, 'storage lock names'],
  // Runs only while the unified script allows it (tool enabled, no standalone copy on the page).
  ['const RouteLifecycle = createRouteLifecycle(path => RUNTIME_ROUTE_PATTERN.test(path));',
    'const RouteLifecycle = createRouteLifecycle(path => RUNTIME_ROUTE_PATTERN.test(path) && __env.isAllowed());', 1, 'route gate'],
  // Updates come with the unified script: with no install source the engine treats itself as externally managed.
  ["        if (!candidates.length) return 'github';", "        if (!candidates.length) return 'external';", 1, 'no standalone update check'],
  // Test hooks a page could set stay with the standalone script.
  ['window.__MAKAYTRON_LISTING_TEST__ === true', 'false', 9, 'test timing and surface off'],
  ["typeof window.__MAKAYTRON_LISTING_NAVIGATE__ === 'function'", 'false', 1, 'test navigation off'],
  ["typeof window.__MAKAYTRON_LISTING_PAGE_NAVIGATE__ === 'function'", 'false', 1, 'test page navigation off'],
  // The unified edge button replaces the floating launcher; the panel itself stays for detailed work.
  ['<style>${STYLES}</style><button class="meli-launcher"', '<style>${STYLES}.meli-launcher{display:none!important}</style><button class="meli-launcher"', 1, 'launcher hidden'],
  // The panel opens from the unified screens, never by itself on page load (not saved, so the user's choice in the panel still counts while it is open).
  ["            state.launcher.addEventListener('click', () => { void this.setCollapsed(false); });\n",
    "            state.launcher.addEventListener('click', () => { void this.setCollapsed(false); });\n            state.settings.collapsed = true;\n", 1, 'panel starts hidden'],
  // The unified screens follow the engine: status line, every panel render and showing or hiding the panel.
  ["            element.querySelector('span').textContent = t(state.status.key, state.status.params);\n",
    "            element.querySelector('span').textContent = t(state.status.key, state.status.params);\n            __env.onChange?.();\n", 1, 'status hook'],
  ["            const views = new Set(['overview', 'analysis', 'ai', 'queue', 'settings']);\n",
    "            const views = new Set(['overview', 'analysis', 'ai', 'queue', 'settings']);\n            __env.onChange?.();\n", 1, 'render hook'],
  ['            if (!state.panel || !state.launcher) return;\n', '            if (!state.panel || !state.launcher) return;\n            __env.onChange?.();\n', 1, 'visibility hook'],
  // The standalone package's usage metrics stay with the standalone package.
  ['    function telemetrySuppressed() {\n', '    function telemetrySuppressed() {\n        return true;\n', 1, 'no telemetry from the unified engine'],
]);

// What the unified screens may read and do: a read-only summary, opening the
// engine's own panel at a view, and its own scan, collection and export actions.
const EPILOGUE = `
    function __eatStart() {
        return RouteLifecycle.start({ enter: init, leave: suspendListingRoute });
    }
    function __eatSnapshot() {
        const counts = UI.summary();
        const job = state.collection;
        return {
            route: routeKind(), language: state.settings.language, open: !state.settings.collapsed,
            status: { tone: String(state.status.tone || 'ready'), text: t(state.status.key, state.status.params) },
            listings: state.records.length, pageListings: state.pageListings.length, fresh: analysisCollectionIsFresh(),
            healthy: counts.healthy, needsReview: counts.needsReview, experiments: counts.experiments, deactivateReview: counts.deactivateReview,
            collection: job ? { status: String(job.status || 'idle'), pages: Collection.pageCount(), total: Number(job.totalPages) || 0, found: job.uniqueIds?.length || 0 } : null,
            collecting: state.collection?.status === 'running' && Boolean(state.collectionLoop && state.collectionLeaseToken),
            queue: Array.isArray(state.queue?.items) ? state.queue.items.length : 0,
            // Change markers for the unified screens (not shown).
            marks: [state.selectedIds.size, state.queue?.cursor ?? -1, state.queue?.status || '', Queue.activeItem()?.status || '', state.settings.minVisitsToImprove, state.settings.minVisitsToProtect, state.settings.minRenewalsToReview, state.settings.declinePercent].join('|'),
        };
    }
    async function __eatOpen(view) {
        if (!state.panel || !RouteLifecycle.allowed()) return false;
        await UI.setCollapsed(false);
        if (view === 'analysis') await UI.openAnalysis();
        else if (view === 'ai') UI.openAi();
        else if (view === 'settings') UI.openSettings();
        else { state.activeView = view === 'queue' ? 'queue' : 'overview'; UI.render(true); }
        return true;
    }
    function __eatSyncLanguage(next) {
        if (!['tr', 'en'].includes(next) || next === state.settings.language || state.collectionLoop || !state.panel) return null;
        return UI.toggleLanguage();
    }
    // The unified Overview, Listings, AI, Queue and Thresholds screens. view() is a
    // read-only copy of the analysed records; every action runs the engine's own
    // function, so its fences (fresh collection, lease, current proposal, the
    // user's own publish and deactivate clicks on Etsy) still decide.
    const __eatThresholdFields = ['minVisitsToImprove', 'minVisitsToProtect', 'minRenewalsToReview', 'declinePercent'];
    const __eatLaNotify = () => { if (__env.onChange) __env.onChange(); };
    function __eatLaView() {
        const fresh = analysisCollectionIsFresh();
        const scope = fresh ? collectedAnalysisRecords() : state.records;
        const pageIds = new Set(state.pageListings.map((listing) => String(listing.listingId)));
        let lastAt = '';
        const records = scope.map((record) => {
            const latest = record.history?.at(-1) || {};
            if (String(latest.at || '') > lastAt) lastAt = String(latest.at || '');
            const a = record.analysis || record.health?.result || {};
            let reason = '';
            try { reason = analysisReason(record); } catch { reason = ''; }
            return {
                id: String(record.listingId), title: String(record.meta?.title || record.listingId), sku: String(record.meta?.sku || ''),
                state: String(record.meta?.statusLabel || ''), imageUrl: String(record.meta?.imageUrl || ''), editUrl: String(record.meta?.editUrl || ''),
                score: Number.isFinite(a.score) ? a.score : null, code: String(a.code || ''), lifecycle: String(a.lifecycle || ''),
                lifecycleLabel: a.lifecycle ? lifecycleLabel(a.lifecycle) : '', assessment: a.code ? assessmentLabel(a) : '', reason,
                confidence: String(a.confidenceBand || ''), nextReviewAt: String(a.nextReviewAt || ''),
                visits: latest.visits ?? null, favorites: latest.favorites ?? null, sales: latest.sales ?? null, revenue: latest.revenue ?? null,
                currency: normalizeSpace(latest.currency) || '$', renewals: latest.renewals ?? null, stock: latest.stock ?? null,
                visitsDelta: a.deltas?.visits ?? null, proposal: Boolean(record.proposal), onPage: pageIds.has(String(record.listingId)),
                selected: state.selectedIds.has(record.listingId),
            };
        });
        // Queue items keep only the id and title; the photo comes from the saved listing record.
        function __eatLaRecordImage(listingId) {
            const id = String(listingId);
            const match = (list) => (Array.isArray(list) ? list : []).find((r) => String(r?.listingId) === id);
            let record = match(state.records);
            if (!record) { try { record = match(collectedAnalysisRecords()); } catch { record = null; } }
            return record?.meta?.imageUrl || '';
        }
        const queue = state.queue && Array.isArray(state.queue.items) ? {
            status: String(state.queue.status || ''), cursor: Number(state.queue.cursor) || 0, recovery: Boolean(Queue.recoveryState()),
            items: state.queue.items.map((item) => ({ id: String(item.listingId), title: String(item.title || item.listingId), imageUrl: String(__eatLaRecordImage(item.listingId)), status: String(item.status || ''), action: String(item.proposal?.action || '') })),
            active: Queue.activeItem() ? String(Queue.activeItem().listingId) : '',
        } : null;
        return {
            route: routeKind(), fresh, records, queue, lastAt, counts: UI.summary(),
            editingId: routeKind() === 'editor' ? String(currentListingId() || '') : '',
            thresholds: Object.fromEntries(__eatThresholdFields.map((key) => [key, state.settings[key]])),
            limits: Object.fromEntries(__eatThresholdFields.map((key) => [key, { min: HEALTH_THRESHOLD_CONTRACTS[key].min, max: HEALTH_THRESHOLD_CONTRACTS[key].max }])),
            status: { tone: String(state.status.tone || 'ready'), text: t(state.status.key, state.status.params) },
        };
    }
    async function __eatLaRun(fn) {
        try { return (await fn()) !== false; }
        catch (error) { console.error('[Listing Analyzer]', error); return false; }
        finally { __eatLaNotify(); }
    }
    const __eatLa = {
        view: __eatLaView,
        select(ids, on) {
            for (const id of Array.isArray(ids) ? ids : [ids]) { if (on) state.selectedIds.add(String(id)); else state.selectedIds.delete(String(id)); }
            pruneSelectionToCollection();
            __eatLaNotify();
        },
        clearSelection() { state.selectedIds.clear(); __eatLaNotify(); },
        buildQueue: () => __eatLaRun(() => buildQueueFromSelection()),
        research: () => __eatLaRun(() => startMarketplaceResearchSelection()),
        goCurrent: () => __eatLaRun(() => Queue.navigate()),
        apply: () => __eatLaRun(() => applyCurrentProposal()),
        publish: () => __eatLaRun(() => publishCurrentProposal()),
        verifyPublish: () => __eatLaRun(() => verifyCurrentPublish()),
        deactivate: () => __eatLaRun(() => openCurrentDeactivate()),
        verifyDeactivate: () => __eatLaRun(() => verifyCurrentDeactivate()),
        skip: () => __eatLaRun(() => skipCurrentItem()),
        stop: () => __eatLaRun(() => stopCurrentQueue('user')),
        recover: () => __eatLaRun(() => recoverCurrentItem()),
        copyAiRequest: () => __eatLaRun(() => copyAiRequest()),
        copyAiTemplate: () => __eatLaRun(() => copyText(aiProposalTemplate())),
        async importAi(text) {
            const out = { text: '', ok: true };
            const feedback = { style: { set color(value) { out.ok = !/danger|red|#b|err/i.test(String(value)); } }, set textContent(value) { out.text = String(value); }, setAttribute() {}, dataset: {} };
            await __eatLaRun(() => importAiResponse(String(text || ''), feedback));
            return out;
        },
        async saveThresholds(values) {
            const next = Object.fromEntries(__eatThresholdFields.map((key) => [key, Number(values?.[key])]));
            const check = validateThresholdSettings(next);
            if (!check.valid) return check;
            const saved = await persistThresholdSettings(next);
            if (saved) await refreshRecords().catch(() => {});
            __eatLaNotify();
            return { valid: saved, reason: saved ? '' : 'storage', field: '' };
        },
        async openRecord(id, kind = 'history') {
            const record = state.records.find((item) => String(item.listingId) === String(id));
            if (!record || !state.panel || !RouteLifecycle.allowed()) return false;
            await UI.setCollapsed(false);
            if (kind === 'proposal') UI.openProposal(record); else UI.openHistory(record);
            return true;
        },
    };
    return {
        start: __eatStart, suspend: suspendListingRoute, version: APP_VERSION,
        snapshot: __eatSnapshot, openPanel: __eatOpen, syncLanguage: __eatSyncLanguage, la: __eatLa,
        scanPage: () => scanCurrentPage(), toggleCollection: () => Collection.toggle(), exportData: () => exportBackup(),
    };`;

export function adoptListingAnalyzer(source = fs.readFileSync(LA_SOURCE, 'utf8')) {
  return adoptStandalone({
    name: 'Listing Analyzer', label: 'LISTING ANALYZER', source, open: OPEN, close: CLOSE, edits: LA_EDITS,
    factory: 'createAdoptedListingAnalyzer', prologue: GM_PROLOGUE, epilogue: EPILOGUE, versionConst: 'ADOPTED_LISTING_ANALYZER_VERSION',
  });
}
