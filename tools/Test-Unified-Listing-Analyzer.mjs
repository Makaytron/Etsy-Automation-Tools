// Tests for adopting the standalone Listing Analyzer as an engine in the unified script.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { adoptListingAnalyzer, LA_EDITS, LA_SOURCE } from './Unified-Adopt-Listing-Analyzer.mjs';

const source = fs.readFileSync(LA_SOURCE, 'utf8');
const adopted = adoptListingAnalyzer(source);

test('every edit applies and the engine keeps its version', () => {
  const version = source.match(/^\/\/ @version\s+(\S+)/m)[1];
  assert.ok(adopted.includes(`const ADOPTED_LISTING_ANALYZER_VERSION = '${version}';`));
  for (const [from, to] of LA_EDITS) {
    assert.ok(adopted.includes(to), to);
    if (!to.includes(from)) assert.ok(!adopted.includes(from), `${from} is gone`);
  }
  assert.match(adopted, /^async function createAdoptedListingAnalyzer\(__env\) \{/m);
  assert.match(adopted, /return \{ start: __eatStart, suspend: suspendListingRoute, version: APP_VERSION \};/);
  assert.doesNotMatch(adopted, /__MAKAYTRON_LISTING_SKIP_INIT__/, 'the standalone self-start is removed');
});

test('the engine reaches the userscript manager only through the unified shims', () => {
  assert.match(adopted, /const GM = __env\.GM;/);
  assert.match(adopted, /const GM_info = undefined, GM_addElement = undefined;/);
  assert.match(adopted, /function telemetrySuppressed\(\) \{\n {8}return true;/);
  assert.match(adopted, /RUNTIME_ROUTE_PATTERN\.test\(path\) && __env\.isAllowed\(\)/);
  assert.match(adopted, /if \(!candidates\.length\) return 'external';/, 'no standalone update check');
  assert.doesNotMatch(adopted, /window\.__MAKAYTRON_LISTING_TEST__ === true/, 'a page cannot switch on test timing');
  assert.doesNotMatch(adopted, /typeof window\.__MAKAYTRON_LISTING_(?:PAGE_)?NAVIGATE__ === 'function'/, 'a page cannot take over navigation');
});

test('the research channel keeps its name; page-level state does not', () => {
  assert.match(adopted, /const RESEARCH_CHANNEL_NAME = 'makaytron:etsy-keyword-market-analyzer:v1';/);
  assert.match(adopted, /new BroadcastChannel\('eat-la:tab-presence'\)/);
  assert.match(adopted, /navigator\.locks\.request\(`eat-la:\$\{name\}`/);
  assert.match(adopted, /const COLLECTION_HANDOFF_KEY = 'eat-la:collection-navigation-handoff';/);
  assert.equal(adopted.split("'eat-la:tab-id'").length - 1, 2);
});

test('adoption fails loudly when the standalone script changes shape', () => {
  assert.throws(() => adoptListingAnalyzer(source.replace("    const COLLECTION_HANDOFF_KEY = 'meli:v1:collection-navigation-handoff';", "    const COLLECTION_HANDOFF_KEY = 'meli:v2:handoff';")), /collection handoff/);
  assert.throws(() => adoptListingAnalyzer(source.replace('    if (window.__MAKAYTRON_LISTING_SKIP_INIT__ !== true) {\n        void RouteLifecycle', '    if (window.__MAKAYTRON_LISTING_SKIP_INIT__ !== true) {\n        RouteLifecycle')), /closing block/);
});
