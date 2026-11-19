// Runs the built unified userscript in real Chrome on fake Etsy pages and
// exercises the edge button and drawer: open/close, Escape, dragging to other
// edges, the dark theme, and staying away from shopping pages.
//
//   node --test tools/Test-Unified-Shell-Browser.mjs
//   EAT_SCREENSHOTS=<dir> node --test tools/Test-Unified-Shell-Browser.mjs   (also writes screenshots)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildUnified } from './Build-Unified-Userscript.mjs';

const userscript = await buildUnified();

function chromeCandidates() {
  return [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean);
}

async function findChrome() {
  for (const candidate of chromeCandidates()) {
    try { await access(candidate); return candidate; } catch { /* next */ }
  }
  throw new Error('Google Chrome was not found. Set CHROME_PATH to run the unified shell browser test.');
}

const safe = (value) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

// In-page stand-in for the userscript manager, plus a hook that keeps the closed shadow root reachable for the test.
function pageHtml({ settings, scenario }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Etsy fixture</title>
<style>body{margin:0;font:16px Georgia,serif;background:#f5f5f5} button.probe{font:13px Georgia,serif}</style></head>
<body><header style="height:56px;background:#fff;border-bottom:1px solid #ddd"></header>
<main style="padding:28px 32px"><h1>Etsy fixture</h1><button class="probe" type="button">Etsy button</button></main>
<script>
(() => {
  const values = new Map();
  ${settings ? `values.set('eat:v1:core:settings', ${safe(settings)});` : ''}
  values.set('eat:v1:sale-manager:legacy.eda-batch-config-v4', { discount: 25 });
  values.set('eat:secret:openai', 'fixture-placeholder');
  window.__values = values;
  window.GM = {
    getValue: async (k, d) => (values.has(k) ? structuredClone(values.get(k)) : d),
    setValue: async (k, v) => { values.set(k, structuredClone(v)); },
    deleteValue: async (k) => { values.delete(k); },
    listValues: async () => [...values.keys()],
  };
  const attach = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) { const root = attach.call(this, init); window.__shadow = root; return root; };
})();
</script>
<script>${userscript.replace(/<\/script/gi, '<\\/script')}</script>
<script>
(async () => {
  const report = (data) => document.documentElement.setAttribute('data-eat-result', encodeURIComponent(JSON.stringify(data)));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    await wait(300);
    const result = await (${scenario})({ wait });
    report({ ok: true, ...result });
  } catch (error) {
    report({ ok: false, error: String(error && error.stack || error) });
  }
})();
</script></body></html>`;
}

// Scenario helpers run inside the page.
const HELPERS = `
  const S = () => window.__shadow;
  const tab = () => S().querySelector('.tab');
  const sheet = () => S().querySelector('.sheet');
  const rect = (el) => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width) }; };
  const pointer = (type, x, y) => tab().dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, pointerType: 'mouse' }));
  const center = () => { const r = tab().getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const click = async () => { const [x, y] = center(); pointer('pointerdown', x, y); pointer('pointerup', x, y); await wait(400); };
  const drag = async (x, y) => { const [x0, y0] = center(); pointer('pointerdown', x0, y0); pointer('pointermove', x0 + 10, y0 + 10); pointer('pointermove', x, y); await wait(50);
    const during = { zoneOn: S().querySelector('.zone[data-on]')?.dataset.edge ?? null, chip: S().querySelector('.chip')?.textContent ?? '' };
    pointer('pointerup', x, y); await wait(400); return during; };
  const saved = () => window.__values.get('eat:v1:core:settings')?.drawer ?? null;
`;

const scenarios = {
  sellerPage: `async ({ wait }) => {${HELPERS}
    const out = {};
    out.hostCount = document.querySelectorAll('#makaytron-eat-root').length;
    out.documentStyles = document.querySelectorAll('style').length;
    out.probeFont = getComputedStyle(document.querySelector('button.probe')).fontFamily;
    out.tabStart = rect(tab());
    out.innerWidth = innerWidth; out.innerHeight = innerHeight;
    out.closedLabel = tab().getAttribute('aria-label');
    await click();
    out.openHidden = sheet().hidden; out.openSide = sheet().dataset.side; out.openWidth = rect(sheet()).width; out.openRight = rect(sheet()).right;
    out.expanded = tab().getAttribute('aria-expanded');
    out.tabWhenOpen = rect(tab());
    out.current = S().querySelector('.current')?.textContent ?? null;
    out.otherTools = [...S().querySelectorAll('.tool-name')].map((n) => n.textContent);
    out.focusOnClose = S().activeElement?.getAttribute('aria-label') ?? null;
    S().activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    await wait(50);
    out.afterEscapeHidden = sheet().hidden;
    out.dragLeft = await drag(20, 300);
    out.savedLeft = saved(); out.tabLeft = rect(tab());
    await click();
    out.leftSide = sheet().dataset.side; out.leftSheet = rect(sheet()); out.tabLeftOpen = rect(tab());
    await click();
    out.dragTop = await drag(700, 8);
    out.savedTop = saved(); out.tabTop = rect(tab());
    await click();
    out.topSide = sheet().dataset.side; out.topTabOpen = rect(tab());
    out.theme = S().querySelector('.mkui-root').dataset.theme;
    out.dir = S().querySelector('.mkui-root').getAttribute('dir');
    return out;
  }`,
  workspace: `async ({ wait }) => {${HELPERS}
    const out = {};
    const q = (sel) => S().querySelector(sel);
    const press = async (sel) => { q(sel).click(); await wait(120); };
    await click();
    await press('[data-action="open-workspace"]');
    out.wsVisible = Boolean(q('#eat-workspace')); out.tabHidden = tab().hidden; out.sheetHidden = sheet().hidden;
    out.wsModal = q('#eat-workspace').getAttribute('aria-modal');
    out.firstPage = q('[aria-current="page"]')?.dataset.page; out.firstTitle = q('.page-title')?.textContent;
    out.focusStart = S().activeElement?.dataset.page ?? null;
    await press('[data-page="settings"]');
    out.settingsTitle = q('.page-title')?.textContent;
    await press('[data-name="theme"][data-value="dark"]');
    out.themeAfter = q('.mkui-root').dataset.theme; out.savedTheme = window.__values.get('eat:v1:core:settings').theme;
    out.focusAfterTheme = S().activeElement?.dataset.value ?? null;
    q('[data-name="theme"][data-value="dark"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true }));
    await wait(120);
    out.themeByKey = window.__values.get('eat:v1:core:settings').theme;
    await press('[data-name="edge"][data-value="left"]');
    out.savedEdge = window.__values.get('eat:v1:core:settings').drawer.edge;
    await press('[data-name="settings-tab"][data-value="tools"]');
    const ads = q('input[name="tool-ads-keyword-manager"]'); ads.click(); await wait(120);
    out.savedAds = window.__values.get('eat:v1:core:settings').tools['ads-keyword-manager'];
    out.menuAfterOff = [...S().querySelectorAll('.ws-menu-button')].map((b) => b.dataset.page).filter(Boolean);
    await press('[data-name="settings-tab"][data-value="privacy"]');
    await press('[data-action="delete-data"]');
    out.dialog = Boolean(q('[role="alertdialog"]')); out.confirmDisabledAtStart = q('[data-action="confirm-delete"]').disabled;
    const input = q('#eat-confirm'); input.value = 'sil'; input.dispatchEvent(new Event('input', { bubbles: true })); await wait(20);
    out.confirmEnabledAfterTyping = !q('[data-action="confirm-delete"]').disabled;
    await press('[data-action="confirm-delete"]'); await wait(200);
    out.keysAfterDelete = [...window.__values.keys()].sort();
    out.notice = q('.notice')?.textContent ?? null;
    q('#eat-workspace').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    await wait(120);
    out.wsAfterEscape = Boolean(q('#eat-workspace')); out.tabBack = !tab().hidden; out.drawerBack = !sheet().hidden;
    return out;
  }`,
  openSettings: `async ({ wait }) => {${HELPERS}
    await click(); S().querySelector('[data-action="open-workspace"]').click(); await wait(120);
    S().querySelector('[data-page="settings"]').click(); await wait(120);
    return { ok: true };
  }`,
  shoppingPage: `async () => ({ hostCount: document.querySelectorAll('#makaytron-eat-root').length, booted: window.__etsyAutomationToolsBooted === true })`,
  darkOpen: `async ({ wait }) => {${HELPERS}
    return { theme: S().querySelector('.mkui-root').dataset.theme, hidden: sheet().hidden, bg: getComputedStyle(sheet()).backgroundColor, noTool: S().querySelector('.empty strong')?.textContent ?? null };
  }`,
};

const PAGES = {
  '/your/shops/me/sales-discounts': { settings: { language: 'tr', theme: 'light' }, scenario: scenarios.sellerPage },
  '/c/jewelry': { settings: { language: 'tr' }, scenario: scenarios.shoppingPage },
  '/your/shops/me/stats': { settings: { language: 'tr', theme: 'dark', drawer: { openOnLoad: true } }, scenario: scenarios.darkOpen },
  '/your/shops/me/tools/listings': { settings: { language: 'tr', theme: 'light' }, scenario: scenarios.workspace },
  // Screenshot-only pages.
  '/your/account': { settings: { language: 'tr', theme: 'light' }, scenario: scenarios.openSettings },
  '/your/purchases': { settings: { language: 'tr', theme: 'dark' }, scenario: scenarios.openSettings },
  '/messages': { settings: { language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: scenarios.shoppingPage },
  '/your/orders/sold': { settings: { language: 'tr', theme: 'light' }, scenario: scenarios.shoppingPage },
};

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const page = PAGES[new URL(req.url, 'http://x').pathname];
      if (!page) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(pageHtml(page));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function runChrome(chrome, url, extra = []) {
  return new Promise(async (resolve, reject) => {
    const profile = await mkdtemp(path.join(os.tmpdir(), 'eat-shell-'));
    const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`,
      // Reduced motion turns off the slide animation, so measurements do not depend on timing.
      '--window-size=1440,900', '--hide-scrollbars', '--force-prefers-reduced-motion', '--virtual-time-budget=6000', ...extra, url], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c) => { stdout += c; }); child.stderr.on('data', (c) => { stderr += c; });
    child.once('error', reject);
    child.once('exit', async (code) => {
      await rm(profile, { recursive: true, force: true }).catch(() => {});
      if (code === 0) resolve(stdout); else reject(new Error(`Chrome exited with ${code}\n${stderr}`));
    });
  });
}

async function visit(chrome, base, pathname) {
  const dom = await runChrome(chrome, `${base}${pathname}`, ['--dump-dom']);
  const encoded = dom.match(/data-eat-result="([^"]+)"/)?.[1];
  assert.ok(encoded, `No result from ${pathname}. DOM tail:\n${dom.slice(-1200)}`);
  const result = JSON.parse(decodeURIComponent(encoded.replaceAll('&amp;', '&')));
  assert.equal(result.ok, true, result.error);
  return result;
}

const chrome = await findChrome();
const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

test('seller page: edge button, drawer, Escape and dragging to other edges', async () => {
  const r = await visit(chrome, base, '/your/shops/me/sales-discounts');
  assert.equal(r.hostCount, 1);
  assert.equal(r.documentStyles, 1, 'no styles added to the Etsy document');
  assert.match(r.probeFont, /Georgia/, 'Etsy controls keep their own font');
  assert.equal(r.tabStart.right, r.innerWidth, 'starts on the right edge');
  assert.equal(r.closedLabel, 'Makaytron çekmecesini aç');

  assert.equal(r.openHidden, false);
  assert.equal(r.openSide, 'right');
  assert.equal(r.openWidth, 384);
  assert.equal(r.openRight, r.innerWidth);
  assert.equal(r.expanded, 'true');
  assert.equal(r.tabWhenOpen.right, r.innerWidth - 384, 'button rides on the drawer edge');
  assert.equal(r.current, 'Sale Manager');
  assert.ok(!r.otherTools.includes('Sale Manager') && r.otherTools.length === 4, r.otherTools.join(','));
  assert.equal(r.focusOnClose, 'Makaytron çekmecesini kapat', 'focus moves into the drawer');
  assert.equal(r.afterEscapeHidden, true, 'Escape closes the drawer');

  assert.equal(r.dragLeft.zoneOn, 'left');
  assert.match(r.dragLeft.chip, /sol kenar · Çekmece soldan açılır/);
  assert.equal(r.savedLeft.edge, 'left');
  assert.equal(r.tabLeft.left, 0);
  assert.equal(r.leftSide, 'left');
  assert.equal(r.leftSheet.left, 0);
  assert.equal(r.tabLeftOpen.left, 384);

  assert.equal(r.dragTop.zoneOn, 'top');
  assert.match(r.dragTop.chip, /üst kenar · Çekmece soldan açılır/);
  assert.equal(r.savedTop.edge, 'top');
  assert.equal(r.tabTop.top, 0);
  assert.equal(r.topSide, 'left', 'top edge opens from the left');
  assert.equal(r.topTabOpen.top, 0, 'top button stays in place');
  assert.equal(r.theme, 'light');
  assert.equal(r.dir, 'ltr');
});

test('shopping pages get no button or drawer', async () => {
  const r = await visit(chrome, base, '/c/jewelry');
  assert.equal(r.booted, true);
  assert.equal(r.hostCount, 0);
});

test('dark theme and open-on-load on a seller page without a tool', async () => {
  const r = await visit(chrome, base, '/your/shops/me/stats');
  assert.equal(r.theme, 'dark');
  assert.equal(r.hidden, false);
  assert.equal(r.bg, 'rgb(23, 23, 23)');
  assert.equal(r.noTool, 'Bu sayfada çalışan bir araç yok');
});

test('workspace: navigation, settings, deleting local data, Escape back to the drawer', async () => {
  const r = await visit(chrome, base, '/your/shops/me/tools/listings');
  assert.equal(r.wsVisible, true);
  assert.equal(r.tabHidden, true);
  assert.equal(r.sheetHidden, true);
  assert.equal(r.wsModal, 'true');
  assert.equal(r.firstPage, 'tool:listing-analyzer', 'opens on the tool of this page');
  assert.equal(r.firstTitle, 'Listing Analyzer');
  assert.equal(r.focusStart, 'tool:listing-analyzer');
  assert.equal(r.settingsTitle, 'Ayarlar');
  assert.equal(r.themeAfter, 'dark');
  assert.equal(r.savedTheme, 'dark');
  assert.equal(r.focusAfterTheme, 'dark', 'focus survives the re-render');
  assert.equal(r.themeByKey, 'system', 'arrow keys move the choice');
  assert.equal(r.savedEdge, 'left');
  assert.equal(r.savedAds, false);
  assert.ok(!r.menuAfterOff.includes('tool:ads-keyword-manager'), r.menuAfterOff.join(','));
  assert.equal(r.dialog, true);
  assert.equal(r.confirmDisabledAtStart, true);
  assert.equal(r.confirmEnabledAfterTyping, true, 'typing "sil" matches SİL in Turkish');
  assert.ok(!r.keysAfterDelete.includes('eat:v1:sale-manager:legacy.eda-batch-config-v4'), 'tool data deleted');
  assert.ok(r.keysAfterDelete.includes('eat:secret:openai'), 'API keys stay unless ticked');
  assert.ok(r.notice && r.notice.length > 0, 'deletion is confirmed on the page');
  assert.equal(r.wsAfterEscape, false);
  assert.equal(r.tabBack, true);
  assert.equal(r.drawerBack, true, 'Escape returns to the drawer');
});

test('optional screenshots for visual review', { skip: !process.env.EAT_SCREENSHOTS }, async () => {
  for (const [name, pathname] of [['shell-light-open', '/messages'], ['shell-dark-open', '/your/shops/me/stats'], ['shell-closed', '/your/orders/sold'], ['ws-settings-light', '/your/account'], ['ws-settings-dark', '/your/purchases']]) {
    await runChrome(chrome, `${base}${pathname}`, [`--screenshot=${path.join(process.env.EAT_SCREENSHOTS, `${name}.png`)}`]);
  }
});
