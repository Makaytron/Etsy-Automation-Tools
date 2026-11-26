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

test('a queue that was not built counts as not done, so the screen stays where the reason is shown', () => {
  // The engine returns nothing either way; the unified screen used to switch to an empty queue tab with no reason.
  assert.match(adopted, /buildQueue: \(\) => __eatLaRun\(async \(\) => \{\n {12}const before = state\.queue\?\.id \|\| '';\n {12}await buildQueueFromSelection\(\);\n {12}return Boolean\(state\.queue\?\.id\) && state\.queue\.id !== before && \['ready', 'running'\]\.includes\(String\(state\.queue\.status \|\| ''\)\);/);
});

async function renderQueuePage(queueStatus, tab = 'queue') {
  const { renderLaPage } = await import('../src/modules/listing-analyzer-ui.js');
  const { createFakeDocument } = await import('./Unified-Fake-Dom.mjs');
  const doc = createFakeDocument();
  const view = {
    route: 'listings', fresh: true,
    records: [{ id: '111', title: 'Fixture listing', sku: '', state: 'Active', imageUrl: '', editUrl: '', score: 40, code: 'IMPROVE', assessment: 'Improve', reason: '', selected: true, plan: 'saved' }], lastAt: '', counts: {}, thresholds: {},
    queue: { status: queueStatus, cursor: 0, recovery: false, active: '111', items: [{ id: '111', title: 'Fixture listing', imageUrl: '', status: 'pending', action: 'UPDATE' }] },
  };
  const snap = { collecting: false, collection: null, status: { tone: 'blocked', text: 'Engine status line' } };
  const actions = new Proxy({}, { get: () => () => {} });
  return renderLaPage(doc, { snap, view, language: 'en', actions, tab, onTab: () => {}, local: {} });
}

test('a stopped queue is shown as stopped, with nothing left to open or stop', async () => {
  const live = await renderQueuePage('ready');
  assert.equal(live.find((n) => n.getAttribute('data-la') === 'stop-queue').length, 1, 'a live queue can be stopped');
  assert.equal(live.find((n) => n.getAttribute('data-la') === 'go-current').length, 1);

  const stopped = await renderQueuePage('stopped');
  assert.equal(stopped.find((n) => n.getAttribute('data-la') === 'stop-queue').length, 0, 'no stop button');
  assert.equal(stopped.find((n) => n.getAttribute('data-la') === 'open-next').length, 0, 'no open-next button');
  assert.equal(stopped.find((n) => n.getAttribute('data-la') === 'go-current').length, 0, 'no row action');
  const row = stopped.find((n) => n.getAttribute('data-queue-item') === '111')[0];
  assert.match(row.textContent, /Stopped/);
  assert.doesNotMatch(row.textContent, /In the queue|Waiting/);
  assert.equal(stopped.find((n) => n.getAttribute('data-la') === 'stop-queue').length + (await renderQueuePage('completed')).find((n) => n.getAttribute('data-la') === 'stop-queue').length, 0);
});

test('the queue, listings and AI tabs show the engine status line', async () => {
  // On the AI tab, "Copy request" gave no visible reply although the engine had copied the request.
  for (const tab of ['queue', 'listings', 'ai']) {
    const page = await renderQueuePage('stopped', tab);
    const status = page.find((n) => n.getAttribute('data-role') === 'la-status');
    assert.equal(status.length, 1, tab);
    assert.equal(status[0].textContent, 'Engine status line');
  }
});

test('a running scan names the page being read, not the pages already read', async () => {
  // With 15 of 16 pages read the screen said "Reading page 15 of 16" while Etsy showed page 16.
  const { readingPage } = await import('../src/modules/listing-analyzer-ui.js');
  assert.equal(readingPage({ status: 'running', pages: 15, total: 16 }), 16);
  assert.equal(readingPage({ status: 'running', pages: 0, total: 16 }), 1);
  assert.equal(readingPage({ status: 'running', pages: 16, total: 16 }), 16, 'never past the last page');
  assert.equal(readingPage({ status: 'paused', pages: 4, total: 16 }), 4, 'a paused scan reads nothing');
});
