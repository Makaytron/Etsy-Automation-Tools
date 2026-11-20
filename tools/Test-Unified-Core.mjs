import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { ROUTES, matchRoute, describePath } from '../src/core/routes.js';
import { createMemoryStore } from '../src/core/gm.js';
import { createStorage, KEY_PREFIX, SECRET_PREFIX } from '../src/core/storage.js';
import { normalizeSettings, createSettings, DEFAULT_SETTINGS } from '../src/core/settings.js';
import { drawerSide, tabRect, snapToEdge, drawerWidth } from '../src/core/drawer-geometry.js';
import { detectLanguage, textDirection, createI18n, validatePack, interpolate } from '../src/core/i18n.js';
import { buildReport, scrubNote, browserInfo } from '../src/core/diagnostics.js';
import { createHost } from '../src/core/host.js';
import { createNotices } from '../src/core/notices.js';
import { createWaitingNotices } from '../src/core/waiting-notices.js';
import { actionForEvent } from '../src/core/shortcuts.js';
import { TOOLS } from '../src/modules/index.js';

// ── Routes ──────────────────────────────────────────────────────────────

test('routes match the standalone scripts exactly', () => {
  const registry = JSON.parse(fs.readFileSync(new URL('../config/production-packages.json', import.meta.url), 'utf8')).filter((pkg) => pkg.kind === 'standalone');
  for (const pkg of registry) {
    const source = fs.readFileSync(new URL(`../${pkg.scriptPath}`, import.meta.url), 'utf8');
    const legacy = source.match(/const RUNTIME_ROUTE_PATTERN = (\/.*\/);/)[1];
    const own = ROUTES.filter((r) => r.module === pkg.id).map((r) => r.pattern.source);
    assert.ok(own.length > 0, `${pkg.id} has routes`);
    // Every unified pattern must be a branch of the legacy predicate: probe both with sample paths.
    const legacyRe = new RegExp(legacy.slice(1, -1));
    for (const path of SAMPLE_PATHS) {
      const unified = matchRoute(path)?.module === pkg.id;
      assert.equal(unified, legacyRe.test(path), `${pkg.id} disagrees on ${path}`);
    }
  }
});

const SAMPLE_PATHS = [
  '/your/shops/me/sales-discounts', '/your/shops/me/sales-discounts/create', '/your/shops/other/sales-discounts',
  '/your/shops/me/advertising/listings/123', '/your/shops/me/advertising/listings', '/your/shops/me/advertising/listings/9/x',
  '/your/shops/me/marketplace-insights', '/your/shops/me/marketplace-insights/search', '/your/shops/me/marketplace-insights/other',
  '/your/shops/me/tools/listings', '/your/shops/me/tools/listings/', '/your/shops/me/tools/listings/draft',
  '/your/shops/me/listing-editor/edit/123456', '/your/shops/me/listing-editor/edit/abc',
  '/messages', '/messages/123', '/conversations/9', '/messagesx', '/your/orders/sold', '/your/orders/sold/new',
  '/your/shops/me/dashboard', '/your/shops/MyShop/dashboard/stats', '/', '/listing/1/x', '/c/jewelry',
];

test('route descriptions never contain the shop name', () => {
  const d = describePath('/your/shops/SecretShopName/tools/listings');
  assert.equal(d.routeId, 'listing-analyzer.listings');
  assert.ok(!JSON.stringify(d).includes('SecretShopName'));
  assert.deepEqual(describePath('/c/jewelry'), { routeId: 'unsupported', template: null });
});

// ── Storage ─────────────────────────────────────────────────────────────

test('storage namespaces are isolated and secrets stay out of backups', async () => {
  const store = createMemoryStore();
  const storage = createStorage(store);
  const sale = storage.namespace('sale-manager');
  const ads = storage.namespace('ads-keyword-manager');
  await sale.set('series', { count: 5 });
  await ads.set('series', { count: 1 });
  await storage.secrets.set('anthropic', 'sk-ant-should-never-leave');
  assert.deepEqual(await sale.get('series'), { count: 5 });
  assert.deepEqual(await ads.get('series'), { count: 1 });
  assert.deepEqual(await sale.keys(), ['series']);

  const backup = await storage.exportBackup({ appVersion: '2.0.0', now: new Date('2026-11-19T00:00:00Z') });
  assert.ok(!JSON.stringify(backup).includes('sk-ant'));
  assert.deepEqual(Object.keys(backup.data).sort(), ['ads-keyword-manager:series', 'sale-manager:series']);

  const restored = createMemoryStore();
  assert.equal(await createStorage(restored).importBackup(backup), 2);
  assert.deepEqual(await restored.get(`${KEY_PREFIX}sale-manager:series`), { count: 5 });
  assert.equal(await restored.get(`${SECRET_PREFIX}anthropic`, null), null);
});

test('storage rejects bad names and foreign backups', async () => {
  const storage = createStorage(createMemoryStore());
  assert.throws(() => storage.namespace('Sale Manager'));
  await assert.rejects(storage.namespace('core').set('../x', 1));
  await assert.rejects(storage.importBackup({ format: 'other', data: {} }));
  await assert.rejects(storage.importBackup({ format: 'etsy-automation-tools-backup', formatVersion: 1, data: { 'BAD NS:key': 1 } }));
});

test('clear keeps secrets unless asked and can target namespaces', async () => {
  const store = createMemoryStore();
  const storage = createStorage(store);
  await storage.namespace('sale-manager').set('a', 1);
  await storage.namespace('core').set('settings', {});
  await storage.secrets.set('openai', 'k');
  assert.equal(await storage.clear({ namespaces: ['sale-manager'] }), 1);
  assert.equal(await storage.clear(), 1);
  assert.deepEqual(await storage.secrets.ids(), ['openai']);
  assert.equal(await storage.clear({ includeSecrets: true }), 1);
  assert.deepEqual(await store.keys(), []);
});

// ── Settings ────────────────────────────────────────────────────────────

test('settings normalize untrusted input', () => {
  assert.deepEqual(normalizeSettings(null), JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
  const s = normalizeSettings({ theme: 'neon', language: 'tr', drawer: { edge: 'top', offset: 7, openOnLoad: 'yes' }, tools: { 'sale-manager': false, evil: true } });
  assert.equal(s.theme, 'system');
  assert.equal(s.language, 'tr');
  assert.deepEqual(s.drawer, { edge: 'top', offset: 1, openOnLoad: false, keepOpenWhileRunning: true });
  assert.equal(s.tools['sale-manager'], false);
  assert.ok(!('evil' in s.tools));
  assert.equal(normalizeSettings({ language: '<script>' }).language, null);
});

test('settings update merges nested values and notifies', async () => {
  const settings = createSettings(createStorage(createMemoryStore()).namespace('core'));
  await settings.load();
  let seen = null;
  settings.subscribe((s) => { seen = s; });
  const next = await settings.update({ drawer: { edge: 'left' } });
  assert.equal(next.drawer.edge, 'left');
  assert.equal(next.drawer.offset, 0.5);
  assert.equal(seen.drawer.edge, 'left');
});

// ── Drawer geometry ─────────────────────────────────────────────────────

test('drawer opens from the button side, from the left for top and bottom', () => {
  assert.equal(drawerSide('right'), 'right');
  assert.equal(drawerSide('left'), 'left');
  assert.equal(drawerSide('top'), 'left');
  assert.equal(drawerSide('bottom'), 'left');
  assert.equal(drawerWidth(1024), 360);
  assert.equal(drawerWidth(1440), 400);
});

test('edge button stays inside the viewport and snaps to the nearest edge', () => {
  const vp = { width: 1440, height: 900 };
  const r = tabRect('right', 1, vp);
  assert.ok(r.x + r.width <= vp.width && r.y + r.height <= vp.height);
  assert.deepEqual(tabRect('top', 0, vp).y, 0);
  assert.equal(snapToEdge({ x: 20, y: 300 }, vp).edge, 'left');
  assert.equal(snapToEdge({ x: 700, y: 890 }, vp).edge, 'bottom');
  assert.equal(snapToEdge({ x: 700, y: 890 }, vp).side, 'left');
  const back = snapToEdge({ x: 1430, y: tabRect('right', 0.25, vp).y + 32 }, vp);
  assert.equal(back.edge, 'right');
  assert.ok(Math.abs(back.offset - 0.25) < 0.01);
});

// ── i18n ────────────────────────────────────────────────────────────────

test('language detection prefers exact, then base, then regional', () => {
  const supported = ['en', 'tr', 'de', 'pt-BR', 'ar'];
  assert.equal(detectLanguage(['tr-TR', 'en'], supported), 'tr');
  assert.equal(detectLanguage(['pt-PT'], supported), 'pt-BR');
  assert.equal(detectLanguage(['ja-JP'], supported), 'en');
  assert.equal(textDirection('ar'), 'rtl');
  assert.equal(textDirection('tr'), 'ltr');
  assert.equal(interpolate('{n} of {m} {x}', { n: 2, m: 5 }), '2 of 5 {x}');
});

test('language packs are validated, cached, and failures keep the old language', async () => {
  const pack = { format: 'etsy-automation-tools-language-pack', language: 'tr', minAppVersion: '2.0.0', strings: { hello: 'Merhaba {name}' } };
  const cache = createStorage(createMemoryStore()).namespace('i18n');
  let downloads = 0;
  const i18n = createI18n({
    source: { hello: 'Hello {name}', bye: 'Bye' },
    bundled: { tr: { pick: 'Dilinizi seçin' } },
    appVersion: '2.0.0',
    cache,
    fetchPack: async (lang) => { downloads += 1; if (lang === 'de') throw new Error('offline'); return pack; },
  });
  assert.equal(i18n.t('hello', { name: 'Ada' }), 'Hello Ada');
  assert.equal((await i18n.use('tr')).fromCache, false);
  assert.equal(i18n.t('hello', { name: 'Ada' }), 'Merhaba Ada');
  assert.equal(i18n.t('bye'), 'Bye'); // missing key falls back to source
  assert.equal(i18n.t('pick'), 'Dilinizi seçin');
  assert.equal((await i18n.use('tr')).fromCache, true);
  assert.equal(downloads, 1);
  await assert.rejects(i18n.use('de'), { code: 'i18n_pack_download' });
  assert.equal(i18n.language, 'tr');
  assert.throws(() => validatePack({ ...pack, strings: { a: '<script>x</script>' } }, { language: 'tr', appVersion: '2.0.0' }), { code: 'i18n_pack_markup' });
  assert.throws(() => validatePack(pack, { language: 'tr', appVersion: '1.9.9' }), { code: 'i18n_pack_version' });
});

// ── Diagnostics ─────────────────────────────────────────────────────────

test('problem reports carry only allowlisted, redacted fields', () => {
  const report = buildReport(
    { appVersion: '2.0.0', category: 'language-pack', errorCode: 'i18n_pack_download', note: 'Shop MyShop, key sk-ant-abcdefghijkl, mail a@b.co, see https://etsy.com/x order 123456789' },
    { userAgent: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36', locale: 'tr-TR', pathname: '/your/shops/MyShop/tools/listings', uiLanguage: 'tr' },
  );
  assert.deepEqual(Object.keys(report).sort(), ['appVersion', 'browser', 'browserLocale', 'browserMajor', 'category', 'errorAt', 'errorCode', 'format', 'formatVersion', 'handler', 'note', 'os', 'region', 'routeId', 'routeTemplate', 'tool', 'uiLanguage', 'utcOffset']);
  assert.equal(report.browser, 'Chrome');
  assert.equal(report.os, 'Windows');
  assert.equal(report.region, 'TR');
  assert.equal(report.routeTemplate, '/your/shops/:shop/tools/listings');
  const text = JSON.stringify(report);
  for (const secret of ['sk-ant', 'a@b.co', 'https://etsy.com/x', '123456789']) assert.ok(!text.includes(secret), secret);
  assert.equal(buildReport({ appVersion: '2', category: 'x', errorCode: 'made_up' }, { pathname: '/' }).errorCode, null);
  assert.equal(buildReport({ appVersion: '2', category: 'other', note: 'hi', includeNote: false }, { pathname: '/' }).note, '');
  assert.equal(scrubNote('a'.repeat(5000)).length <= 1000, true);
  assert.equal(browserInfo('Mozilla/5.0 Edg/130.0 Chrome/130').browser, 'Edge');
});

// ── Host ────────────────────────────────────────────────────────────────

function fakeLifecycle() {
  let handlers = null; let generation = 0;
  const factory = (allowed) => ({
    allowed,
    capture: () => ({ generation }),
    current: (token) => token.generation === generation,
    start(h) { handlers = h; },
    dispose() { handlers = null; },
  });
  return { factory, navigate: async (kind) => { generation += 1; await handlers?.[kind]?.(); } };
}

test('host mounts one tool per page and switches cleanly', async () => {
  const log = [];
  const contexts = [];
  const modules = ['sale-manager', 'listing-analyzer'].map((id) => ({
    id, name: id,
    mount: (ctx) => { contexts.push(ctx); log.push(`mount ${id} ${ctx.route.id}`); },
    unmount: () => { log.push(`unmount ${id}`); },
    routeChange: (ctx) => { log.push(`change ${id} ${ctx.route.id}`); },
  }));
  const location = { pathname: '/your/shops/me/sales-discounts' };
  const lc = fakeLifecycle();
  const host = createHost({ modules, createRouteLifecycle: lc.factory, location, services: {} });
  host.start();
  await lc.navigate('enter');
  location.pathname = '/your/shops/me/tools/listings';
  await lc.navigate('change');
  const listingCtx = contexts.at(-1);
  assert.equal(listingCtx.isCurrent(), true);
  location.pathname = '/your/shops/me/listing-editor/edit/42';
  await lc.navigate('change');
  assert.equal(listingCtx.isCurrent(), false, 'work started on the listings page is stale in the editor');
  assert.equal(contexts[0].isCurrent(), false, 'sale manager context is stale after switching tools');
  await lc.navigate('leave');
  assert.deepEqual(log, [
    'mount sale-manager sale-manager.campaigns',
    'unmount sale-manager',
    'mount listing-analyzer listing-analyzer.listings',
    'change listing-analyzer listing-analyzer.editor',
    'unmount listing-analyzer',
  ]);
  assert.equal(host.activeTool, null);
});

test('host skips disabled tools and survives a failing mount', async () => {
  const errors = [];
  const modules = [{ id: 'sale-manager', name: 's', mount: () => { throw new Error('boom'); } }];
  const lc = fakeLifecycle();
  const host = createHost({ modules, createRouteLifecycle: lc.factory, location: { pathname: '/your/shops/me/sales-discounts' }, services: {}, onError: (code) => errors.push(code) });
  host.start();
  await lc.navigate('enter');
  assert.deepEqual(errors, ['module_mount']);
  assert.equal(host.activeTool, null);

  const off = createHost({ modules, createRouteLifecycle: fakeLifecycle().factory, location: { pathname: '/your/shops/me/sales-discounts' }, services: {}, isEnabled: () => false });
  await off.reconcile();
  assert.equal(off.activeTool, null);
});

test('every routed tool is declared once', () => {
  const ids = TOOLS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const route of ROUTES) assert.ok(ids.includes(route.module), route.id);
});

test('notices from two Etsy tabs sharing one store are merged, not overwritten', async () => {
  const core = createStorage(createMemoryStore()).namespace('core');
  const settings = { get: () => ({ notify: { events: {}, quiet: { on: false }, sound: false } }) };
  let clock = 1_800_000_000_000;
  const now = () => (clock += 1000);
  const saleTab = createNotices({ store: core, settings, scope: {}, now });
  const adsTab = createNotices({ store: core, settings, scope: {}, now });
  await saleTab.load();
  await adsTab.load();
  await saleTab.add({ event: 'seriesStopped', tool: 'sale-manager', title: 'Series stopped' });
  await adsTab.add({ event: 'scanDone', tool: 'ads-keyword-manager', title: 'Scan finished' });
  const both = createNotices({ store: core, settings, scope: {}, now });
  await both.load();
  assert.deepEqual(both.list().map((n) => n.title), ['Scan finished', 'Series stopped'], 'the second tab keeps the first tab\'s notice');
  await saleTab.markAllRead();
  await adsTab.add({ event: 'scanDone', title: 'Another scan' });
  await both.load();
  assert.deepEqual(both.list().map((n) => [n.title, n.read]), [['Another scan', false], ['Scan finished', true], ['Series stopped', true]], 'read state from one tab survives a later add in another');
});
test('a step that starts waiting is announced once; what already waited at load is not', () => {
  const sent = [];
  const notify = (n) => sent.push(n);
  const w = createWaitingNotices({ event: 'queueWaiting', tool: 'listing-analyzer', page: 'tool:listing-analyzer' });
  w.update([{ key: 'a:applying', detail: 'Old' }], { notify, language: 'en' });
  assert.equal(sent.length, 0, 'the baseline at page load');
  w.update([{ key: 'a:applying', detail: 'Old' }, { key: 'b:applying', detail: 'Mug' }], { notify, language: 'en' });
  w.update([{ key: 'b:applying', detail: 'Mug' }], { notify, language: 'en' });
  assert.deepEqual(sent.map((n) => [n.event, n.detail, n.needsAction, n.title]), [['queueWaiting', 'Mug', true, 'The edit queue waits for you']]);
});
test('a shortcut does not fire while typing in a field inside the closed shadow root', () => {
  const shortcuts = { on: true, keys: { adsClosePage: 'Ctrl+Space' } };
  const host = { tagName: 'DIV' };
  const event = { key: ' ', code: 'Space', ctrlKey: true, composedPath: () => [host], target: host };
  assert.equal(actionForEvent(event, shortcuts), 'adsClosePage', 'on the page itself it fires');
  assert.equal(actionForEvent(event, shortcuts, { focused: { tagName: 'INPUT' } }), null, 'not while a workspace field has focus');
});