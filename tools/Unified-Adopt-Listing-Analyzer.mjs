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
  // The standalone package's usage metrics stay with the standalone package.
  ['    function telemetrySuppressed() {\n', '    function telemetrySuppressed() {\n        return true;\n', 1, 'no telemetry from the unified engine'],
]);

const EPILOGUE = `
    function __eatStart() {
        return RouteLifecycle.start({ enter: init, leave: suspendListingRoute });
    }
    return { start: __eatStart, suspend: suspendListingRoute, version: APP_VERSION };`;

export function adoptListingAnalyzer(source = fs.readFileSync(LA_SOURCE, 'utf8')) {
  return adoptStandalone({
    name: 'Listing Analyzer', label: 'LISTING ANALYZER', source, open: OPEN, close: CLOSE, edits: LA_EDITS,
    factory: 'createAdoptedListingAnalyzer', prologue: GM_PROLOGUE, epilogue: EPILOGUE, versionConst: 'ADOPTED_LISTING_ANALYZER_VERSION',
  });
}
