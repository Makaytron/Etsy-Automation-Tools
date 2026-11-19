// Tests for adopting the standalone Keyword & Market Analyzer as an engine in the unified script.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { adoptKeywordMarketAnalyzer, KW_EDITS, KW_SOURCE } from './Unified-Adopt-Keyword-Market-Analyzer.mjs';

const source = fs.readFileSync(KW_SOURCE, 'utf8');
const adopted = adoptKeywordMarketAnalyzer(source);

test('every edit applies and the engine keeps its version', () => {
  const version = source.match(/^\/\/ @version\s+(\S+)/m)[1];
  assert.ok(adopted.includes(`const ADOPTED_KEYWORD_MARKET_ANALYZER_VERSION = '${version}';`));
  for (const [from, to] of KW_EDITS) {
    assert.ok(adopted.includes(to), to);
    if (!to.includes(from)) assert.ok(!adopted.includes(from), `${from} is gone`);
  }
  assert.match(adopted, /^async function createAdoptedKeywordMarketAnalyzer\(__env\) \{/m);
  assert.match(adopted, /start: __eatStart, suspend: suspendKeywordRoute, version: APP_VERSION,/);
  assert.doesNotMatch(adopted, /\n\}\)\(\);\n?$/, 'the standalone self-start is removed');
});

test('the engine reaches the userscript manager only through the unified shims', () => {
  assert.match(adopted, /const GM = __env\.GM;/);
  assert.match(adopted, /const GM_info = undefined, GM_addElement = undefined;/);
  assert.match(adopted, /function telemetrySuppressed\(\) \{\n {8}return true;/);
  assert.match(adopted, /RUNTIME_ROUTE_PATTERN\.test\(path\) && __env\.isAllowed\(\)/);
  assert.ok(!adopted.includes("'makaytron-etsy-keyword-market-analyzer'"), 'own panel host id');
  assert.ok(!adopted.includes('window.__EKMA_SKIP_INIT__'), 'a page cannot switch on the test surface');
  assert.ok(!adopted.includes("typeof window.__EKMA_TEST_NAVIGATE__ === 'function'"), 'a page cannot take over navigation');
});

test('the research channel to Listing Analyzer keeps its name; page-level locks do not', () => {
  assert.match(adopted, /const CHANNEL_NAME = 'makaytron:etsy-keyword-market-analyzer:v1';/);
  assert.match(adopted, /new BroadcastChannel\('eat-kw:tab-presence'\)/);
  assert.match(adopted, /navigator\.locks\.request\('eat-kw:processor-lease-mutation'/);
});

test('the unified screens get a snapshot, storage data and the engine actions', () => {
  assert.match(adopted, /snapshot: __eatSnapshot, data: __eatData, syncLanguage: __eatSyncLanguage,/);
  assert.match(adopted, /search: __eatSearch, capture: \(\) => UI\.captureAndSave\(\), exportJson: \(\) => UI\.export\(\),/);
  assert.match(adopted, /cancel: __eatCancel, clearData: __eatClear,/);
  assert.equal(adopted.split('__env.onChange?.()').length - 1, 4);
  // The language switch never runs during a research job.
  assert.match(adopted, /next === language \|\| Runtime\.processing \|\| !Runtime\.ui\) return null;/);
});

test('adoption fails loudly when the standalone script changes shape', () => {
  assert.throws(() => adoptKeywordMarketAnalyzer(source.replace('`${APP.storagePrefix}:tab-presence`', '`${APP.storagePrefix}:presence`')), /tab-presence channel/);
  assert.throws(() => adoptKeywordMarketAnalyzer(source.replace('    } else {\n        void RouteLifecycle.start({ enter: boot', '    } else {\n        RouteLifecycle.start({ enter: boot')), /closing block/);
});
