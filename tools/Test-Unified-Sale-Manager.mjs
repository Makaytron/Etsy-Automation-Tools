// Tests for adopting the standalone Sale Manager as an engine in the unified script.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { adoptSaleManager, SALE_MANAGER_EDITS, SALE_MANAGER_SOURCE } from './Unified-Adopt-Sale-Manager.mjs';
import { createScopedGm } from '../src/core/scoped-gm.js';

const source = fs.readFileSync(SALE_MANAGER_SOURCE, 'utf8');
const adopted = adoptSaleManager(source);

test('every edit applies exactly as expected and the engine keeps its version', () => {
  const version = source.match(/^\/\/ @version\s+(\S+)/m)[1];
  assert.match(adopted, new RegExp(`const ADOPTED_SALE_MANAGER_VERSION = '${version.replace(/\./g, '\\.')}';`));
  for (const [from, to] of SALE_MANAGER_EDITS) {
    assert.ok(adopted.includes(to), to);
    if (!to.includes(from)) assert.ok(!adopted.includes(from), `${from} is gone`);
  }
  assert.match(adopted, /^async function createAdoptedSaleManager\(__env\) \{/m);
  assert.match(adopted, /snapshot: __eatSnapshot,/);
  assert.match(adopted, /function renderPanel\(\) \{\n {8}__env\.onChange\?\.\(\);/);
  assert.doesNotMatch(adopted, /\n {4}await initialize\(\);\n\}\)\(\);/, 'the standalone self-start is removed');
});

test('page-level names cannot collide with a standalone copy on the same tab', () => {
  for (const name of ["'eda-batch-root'", "'eda-batch-toast-root'", "'eda-sale-batch-state-v4'", "'eda-sale-batch-v4'", "'eda-batch-tab-id-v4'", "'eda-batch-lease-handoff-v4'"]) {
    assert.ok(!adopted.includes(name), name);
  }
  // Storage keys stay as they are: the shim maps them into the unified namespace.
  assert.ok(adopted.includes("'eda-batch-config-v4'"));
});

test('the engine cannot reach the userscript manager directly and sends no usage metrics', () => {
  assert.match(adopted, /const GM = __env\.GM;/);
  assert.match(adopted, /const GM_getValue = undefined/);
  assert.match(adopted, /function telemetrySuppressed\(\) \{\n {8}return true;/);
  assert.match(adopted, /RUNTIME_ROUTE_PATTERN\.test\(path\) && __env\.isAllowed\(\)/);
});

test('adoption fails loudly when the standalone script changes shape', () => {
  assert.throws(() => adoptSaleManager(source.replace("'eda-batch-root'", "'eda-batch-panel'")), /panel element id/);
  assert.throws(() => adoptSaleManager(source.replace('    await initialize();\n})();', '    initialize();\n})();')), /marker/);
  assert.throws(() => adoptSaleManager(source.replace('function telemetrySuppressed() {', 'function telemetrySuppressedNow() {')), /telemetry/);
});

test('scoped GM stores engine keys under the transfer location and hides update URLs', async () => {
  const values = new Map();
  const listeners = [];
  const gm = {
    getValue: async (k, d) => (values.has(k) ? values.get(k) : d),
    setValue: async (k, v) => { values.set(k, v); },
    deleteValue: async (k) => { values.delete(k); },
    listValues: async () => [...values.keys()],
    addValueChangeListener: (k, cb) => { listeners.push([k, cb]); return listeners.length; },
    info: { scriptHandler: 'Tampermonkey' },
  };
  const appended = [];
  const doc = { createElement: () => ({}), head: { append: (el) => appended.push(el) } };
  const shim = createScopedGm({ gm, namespace: 'sale-manager', doc, resources: { makaytronLogo: 'data:logo' } });
  await shim.setValue('eda-batch-config-v4', { discount: 25 });
  assert.deepEqual([...values.keys()], ['eat:v1:sale-manager:legacy.eda-batch-config-v4']);
  assert.deepEqual(await shim.getValue('eda-batch-config-v4'), { discount: 25 });
  values.set('eat:v1:ads-keyword-manager:legacy.adWordlist', 'x');
  assert.deepEqual(await shim.listValues(), ['eda-batch-config-v4'], 'only its own keys');
  const seen = [];
  shim.addValueChangeListener('eda-batch-job-v4', (...args) => seen.push(args));
  assert.equal(listeners[0][0], 'eat:v1:sale-manager:legacy.eda-batch-job-v4');
  listeners[0][1]('eat:v1:sale-manager:legacy.eda-batch-job-v4', 1, 2, true);
  assert.deepEqual(seen, [['eda-batch-job-v4', 1, 2, true]], 'the engine sees its own key name');
  assert.equal(shim.info.script.updateURL, '');
  assert.equal(shim.info.script.downloadURL, '');
  assert.equal(shim.registerMenuCommand('x', () => {}), null);
  assert.equal(await shim.getResourceURL('makaytronLogo'), 'data:logo');
  shim.addStyle('.x{}');
  assert.equal(appended[0].textContent, '.x{}');
});

test('the adopted engine reads the promotion list from the all-time JSON endpoint', () => {
  assert.ok(adopted.includes('/api/v3/ajax/bespoke/shop/${encodeURIComponent(shopId)}/sales-coupons/combined'));
  assert.match(adopted, /const PROMOTION_API_RANGE = 'all-time';/);
  assert.match(adopted, /const VERIFICATION_URL = PROMOTIONS_URL;/);
  assert.doesNotMatch(adopted, /DETAILS_STATS_URL/, 'the retired Details & Stats page is no longer a data source');
});

test('the plan list starts at the first day that is not in the past', () => {
  // Without this the screens listed days that had already passed as planned campaigns.
  assert.ok(adopted.includes('let cursor = job?.active ? source?.batchStartDate : firstPlannableDate(source);'));
});

test('only the unified shortcuts run: the engine does not install its own Alt+Shift keys', () => {
  assert.match(adopted, /if \(false\) document\.addEventListener\('keydown', event => \{\n {12}if \(!isSupportedRoute\(\) \|\| !event\.altKey \|\| !event\.shiftKey\) return;/);
});
