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
]);

const EPILOGUE = `
    function __eatStart() {
        const begin = () => RouteLifecycle.start({ enter: startInitialization, leave: suspendAdsRoute, change: startInitialization });
        if (document.readyState === 'complete') return begin();
        window.addEventListener('load', () => { void begin(); }, { once: true });
        return undefined;
    }
    return { start: __eatStart, suspend: suspendAdsRoute, version: APP_VERSION };`;

export function adoptAdsKeywordManager(source = fs.readFileSync(ADS_SOURCE, 'utf8')) {
  return adoptStandalone({
    name: 'Ads Keyword Manager', label: 'ADS KEYWORD MANAGER', source, open: OPEN, close: CLOSE, edits: ADS_EDITS,
    factory: 'createAdoptedAdsKeywordManager', prologue: GM_PROLOGUE, epilogue: EPILOGUE, versionConst: 'ADOPTED_ADS_KEYWORD_MANAGER_VERSION',
  });
}
