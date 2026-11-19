// Adopts the standalone Sale Manager as an engine inside the unified script.
//
// The standalone userscript stays the single source of its automation code,
// with all of its tests. At build time its body becomes a factory function;
// a small, fixed list of edits isolates it from a standalone copy running on
// the same page and from features that belong to the standalone package.
// Every edit must match exactly the expected number of times, so a change in
// the standalone script fails the build instead of producing a wrong engine.

import fs from 'node:fs';
import { stripStandaloneOnly } from './Unified-Adopt.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SALE_MANAGER_SOURCE = path.join(repoRoot, 'scripts', 'etsy-sale-campaign-batch-runner', 'Etsy-Sale-Campaign-Batch-Runner.user.js');

const OPEN = "(async function () {\n    'use strict';\n";
const CLOSE = '    await initialize();\n})();';

// [from, to, expected count, reason]
export const SALE_MANAGER_EDITS = Object.freeze([
  // Page-level names shared by every script on the Etsy tab: keep them apart from a standalone copy.
  ["'eda-batch-root'", "'eat-sale-batch-root'", 1, 'panel element id'],
  ["'eda-batch-toast-root'", "'eat-sale-batch-toast-root'", 1, 'toast element id'],
  ["'eda-sale-batch-state-v4'", "'eat-sale-batch-state-v4'", 1, 'Web Locks name for job state'],
  ["'eda-sale-batch-v4'", "'eat-sale-batch-v4'", 1, 'BroadcastChannel name'],
  ["'eda-batch-tab-id-v4'", "'eat-sale-batch-tab-id-v4'", 1, 'sessionStorage tab id'],
  ["'eda-batch-lease-handoff-v4'", "'eat-sale-batch-lease-handoff-v4'", 1, 'sessionStorage lease handoff'],
  ["'eda-sale-campaign-panel-collapsed-v1'", "'eat-sale-campaign-panel-collapsed-v1'", 1, 'sessionStorage panel state'],
  // Runs only while the unified script allows it (tool enabled, no standalone copy on the page).
  ['const RouteLifecycle = createRouteLifecycle(path => RUNTIME_ROUTE_PATTERN.test(path));',
    'const RouteLifecycle = createRouteLifecycle(path => RUNTIME_ROUTE_PATTERN.test(path) && __env.isAllowed());', 1, 'route gate'],
  // The standalone package's usage metrics stay with the standalone package.
  ['    function telemetrySuppressed() {\n', '    function telemetrySuppressed() {\n        return true;\n', 1, 'no telemetry from the unified engine'],
  // The unified screens redraw when the engine redraws its own panel.
  ['    function renderPanel() {\n', '    function renderPanel() {\n        __env.onChange?.();\n', 1, 'state change hook'],
]);

// Read and command surface for the unified screens. It only reads state and calls the
// engine's own actions, so every safety rule of the standalone Sale Manager still applies.
const ENGINE_API = `
    function __eatSnapshot() {
        const source = job?.active ? job : config;
        const plans = [];
        let cursor = source?.batchStartDate;
        for (let i = 0; i < 400 && cursor && !batchCompleteAt(source, cursor); i += 1) {
            const plan = buildPlan(cursor, source);
            if (!plan) break;
            plans.push({ saleName: plan.saleName, startDate: plan.startDateIso, endDate: plan.endDateIso, discount: plan.discount });
            cursor = nextScheduleDate(source, cursor);
        }
        return clone({ version: VERSION, config, job, lastReport, plans, leaseOwned, routeActive });
    }
    return {
        initialize,
        suspend: suspendSaleRoute,
        version: VERSION,
        snapshot: __eatSnapshot,
        start: () => startBatch(),
        retry: () => retryCurrent(),
        skip: () => skipCurrent(),
        stop: () => stopBatch(),
        updateConfig: async (patch) => { config = normalizeConfig({ ...config, ...patch }); await saveConfig(); },
        downloadCsv: () => downloadCsv(lastReport),
        downloadExcel: () => downloadExcel(lastReport),
        openCreateSale: () => go(CREATE_SALE_URL),
    };`;

/** Returns the source of `async function createAdoptedSaleManager(__env)`. */
export function adoptSaleManager(source = fs.readFileSync(SALE_MANAGER_SOURCE, 'utf8')) {
  let text = source.replace(/\r\n/g, '\n');
  const start = text.indexOf(OPEN);
  const end = text.lastIndexOf(CLOSE);
  if (start < 0 || end < 0 || end < start) throw new Error('Sale Manager adoption: entry or exit marker not found.');
  let body = stripStandaloneOnly(text.slice(start + OPEN.length, end), 'Sale Manager');
  for (const [from, to, expected, reason] of SALE_MANAGER_EDITS) {
    const count = body.split(from).length - 1;
    if (count !== expected) throw new Error(`Sale Manager adoption: "${reason}" matched ${count} times, expected ${expected}.`);
    body = body.split(from).join(to);
  }
  const version = source.match(/^\/\/ @version\s+(\d+\.\d+\.\d+)/m)?.[1];
  if (!version) throw new Error('Sale Manager adoption: @version not found.');
  return [
    `// BEGIN ADOPTED SALE MANAGER ${version} (scripts/etsy-sale-campaign-batch-runner, transformed by tools/Unified-Adopt-Sale-Manager.mjs)`,
    'async function createAdoptedSaleManager(__env) {',
    "    'use strict';",
    '    // The engine talks to a storage and menu shim instead of the userscript manager directly.',
    '    const GM = __env.GM;',
    '    const GM_getValue = undefined, GM_setValue = undefined, GM_deleteValue = undefined, GM_addValueChangeListener = undefined;',
    '    const GM_registerMenuCommand = undefined, GM_xmlhttpRequest = undefined, GM_info = undefined;',
    body.trimEnd(),
    ENGINE_API,
    '}',
    `const ADOPTED_SALE_MANAGER_VERSION = '${version}';`,
    '// END ADOPTED SALE MANAGER',
  ].join('\n');
}
