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
  assert.match(adopted, /start: __eatStart, suspend: suspendListingRoute, version: APP_VERSION,/);
  assert.match(adopted, /snapshot: __eatSnapshot, openPanel: __eatOpen, syncLanguage: __eatSyncLanguage,/);
  assert.match(adopted, /scanPage: \(\) => scanCurrentPage\(\), toggleCollection: \(\) => Collection\.toggle\(\), exportData: \(\) => exportBackup\(\),/);
  assert.equal(adopted.split('__env.onChange?.();').length - 1, 3, 'status, render and visibility hooks');
  assert.ok(adopted.includes('.meli-launcher{display:none!important}'), 'the edge button replaces the floating launcher');
  // The language switch never runs during a collection.
  assert.match(adopted, /next === state\.settings\.language \|\| state\.collectionLoop \|\| !state\.panel\) return null;/);
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

test('listing rows show the listing photo when Etsy gave one, and only from Etsy image hosts', async () => {
  const { listingThumb } = await import('../src/modules/listing-analyzer-ui.js');
  const { createFakeDocument } = await import('./Unified-Fake-Dom.mjs');
  const doc = createFakeDocument();
  const withPhoto = listingThumb(doc, { imageUrl: 'https://i.etsystatic.com/12345/r/il/abc/1/il_340x270.1.jpg' }, 32);
  const img = withPhoto.find((n) => n.tagName === 'IMG');
  assert.equal(img.length, 1);
  assert.equal(img[0].getAttribute('src'), 'https://i.etsystatic.com/12345/r/il/abc/1/il_340x270.1.jpg');
  assert.equal(img[0].getAttribute('alt'), '');
  assert.equal(img[0].getAttribute('loading'), 'lazy');
  assert.equal(listingThumb(doc, { imageUrl: '' }, 32).find((n) => n.tagName === 'IMG').length, 0, 'no photo: the placeholder stays');
  assert.equal(listingThumb(doc, { imageUrl: 'https://tracker.example/pixel.gif' }, 32).find((n) => n.tagName === 'IMG').length, 0, 'other hosts are never loaded');
  assert.equal(listingThumb(doc, { imageUrl: 'javascript:alert(1)' }, 32).find((n) => n.tagName === 'IMG').length, 0);
});

test('queue items carry the listing photo from the saved record', () => {
  // The queue table draws listingThumb(item); without imageUrl every queue row had an empty box.
  const queueLine = adopted.split('\n').find((line) => line.includes('items: state.queue.items.map('));
  assert.ok(queueLine, 'the queue mapping exists');
  assert.match(queueLine, /imageUrl: String\(__eatLaRecordImage\(item\.listingId\)\)/);
  assert.match(adopted, /function __eatLaRecordImage\(listingId\) \{/);
});
