// Runs the built unified userscript in real Chrome on fake Etsy pages and
// exercises the edge button and drawer: open/close, Escape, dragging to other
// edges, the dark theme, and staying away from shopping pages.
//
//   node --test tools/Test-Unified-Shell-Browser.mjs
//   EAT_SCREENSHOTS=<dir> node --test tools/Test-Unified-Shell-Browser.mjs   (also writes screenshots)
//   EAT_DEBUG_DIR=<dir> node --test tools/Test-Unified-Shell-Browser.mjs     (also writes each page's console log)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import { buildUnified } from './Build-Unified-Userscript.mjs';

const userscript = await buildUnified();
const handoffSource = await readFile(new URL('../shared/migration/handoff.js', import.meta.url), 'utf8');

// A stand-in for an armed standalone script on the same tab: the real sending side of the handoff.
const STANDALONE_ADS = `<script>
(() => {
${handoffSource}
  const values = { adWordlist: 'bts\\narmy gift', adWordlistLanguage: 'tr', adKeywordManagerScriptUpdateState: { x: 1 } };
  const responder = createMigrationResponder({
    tool: 'ads-keyword-manager', appVersion: '1.0.5', cryptoApi: crypto,
    store: { get: async (k) => values[k], keys: async () => Object.keys(values) },
    transport: createDomMigrationTransport(document),
    onStatus: (s) => { if (s.sas) window.__standaloneSas = s.sas; if (s.state === 'done') window.__standaloneDone = true; },
  });
  responder.arm(60000);
})();
</script>`;

// The real standalone Ads Keyword Manager with its own userscript storage, next to the unified script.
const REAL_STANDALONE_ADS = `<script>
(() => {
  const values = new Map(Object.entries({ adWordlist: 'bts\\nkpop poster', adWordlistLanguage: 'en' }));
  window.__standaloneValues = values;
  window.__standaloneGM = {
    info: { script: { name: 'Makaytron Etsy Ads Keyword Manager', version: 'fixture' }, scriptHandler: 'fixture' },
    getValue: async (k, d) => (values.has(k) ? structuredClone(values.get(k)) : d),
    setValue: async (k, v) => { values.set(k, structuredClone(v)); },
    deleteValue: async (k) => { values.delete(k); },
    listValues: async () => [...values.keys()],
    addValueChangeListener: () => 1,
    registerMenuCommand: () => 1,
    xmlHttpRequest: (d) => setTimeout(() => d.onerror?.(new Error('blocked in fixture')), 0),
  };
})();
</script>
<script>(function (GM) {
${fs.readFileSync(new URL('../scripts/etsy-ads-keyword-manager/Makaytron-Etsy-Ads-Keyword-Manager.user.js', import.meta.url), 'utf8').replace(/<\/script/gi, '<\\/script')}
})(window.__standaloneGM);</script>`;

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
// Turkish comes as a pack; most pages start as if it had been downloaded on an earlier visit.
const PACK_TR = JSON.parse(fs.readFileSync(new URL('../languages/tr.json', import.meta.url), 'utf8'));

// Pages start as if this version had already been seen, so the "What's new" dialog stays out of the way unless a page asks for it.
const APP_VERSION = /version:\s*'([^']+)'/.exec(fs.readFileSync(new URL('../src/meta.js', import.meta.url), 'utf8'))[1];

function pageHtml({ settings, scenario, extra = '', preload = {}, packs = {}, trCached = true, seen = APP_VERSION }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Etsy fixture</title>
<style>body{margin:0;font:16px Georgia,serif;background:#f5f5f5} button.probe{font:13px Georgia,serif}</style></head>
<body><header style="height:56px;background:#fff;border-bottom:1px solid #ddd"></header>
<main style="padding:28px 32px"><h1>Etsy fixture</h1><button class="probe" type="button">Etsy button</button></main>
<script>
(() => {
  const values = new Map();
  ${settings ? `values.set('eat:v1:core:settings', ${safe(settings)});` : ''}
  ${seen ? `values.set('eat:v1:core:seenVersion', ${safe(seen)});` : ''}
  values.set('eat:v1:sale-manager:legacy.eda-batch-config-v4', { discount: 25 });
  values.set('eat:secret:openai', 'fixture-placeholder');
  ${trCached ? `values.set('eat:v1:core:pack.tr', ${safe(PACK_TR)});` : ''}
  for (const [k, v] of Object.entries(${safe(preload)})) values.set(k, v);
  window.__values = values;
  window.__packs = ${safe(packs)};
  window.__reads = [];
  window.__network = 0;
  const realFetch = window.fetch;
  window.fetch = (...args) => { window.__network += 1; return realFetch(...args); };
  window.GM = {
    info: { script: { name: 'fixture' }, scriptHandler: 'fixture' },
    addValueChangeListener: () => 1,
    removeValueChangeListener: () => {},
    xmlHttpRequest: (details) => {
      window.__network += 1;
      (window.__requests = window.__requests || []).push(details.url);
      // The Ads engine downloads its default word list; answer it like GitHub would.
      if (details.url.includes('keyword-rules.txt')) setTimeout(() => details.onload?.({ status: 200, responseText: ['bts', 'army gift', ''].join(String.fromCharCode(10)) }), 0);
      // Language packs come from the repository; a page lists the ones it can serve.
      else if (details.url.includes('/languages/') && window.__packs[details.url.split('/').pop().replace('.json', '')]) setTimeout(() => details.onload?.({ status: 200, responseText: JSON.stringify(window.__packs[details.url.split('/').pop().replace('.json', '')]) }), 0);
      else setTimeout(() => details.onerror?.(new Error('blocked in fixture')), 0);
    },
    getValue: async (k, d) => { window.__reads.push(k); return values.has(k) ? structuredClone(values.get(k)) : d; },
    setValue: async (k, v) => { values.set(k, structuredClone(v)); },
    deleteValue: async (k) => { values.delete(k); },
    listValues: async () => [...values.keys()],
  };
  const attach = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) { const root = attach.call(this, init); if (this.id === 'makaytron-eat-root') window.__shadow = root; if (this.id === 'eat-message-assistant') window.__maShadow = root; return root; };
})();
</script>
${extra}
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
  const tab = () => S().querySelector('.etab:not(.ghost)');
  const sheet = () => S().querySelector('.dock');
  const rect = (el) => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width) }; };
  const pointer = (type, x, y) => tab().dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, pointerType: 'mouse' }));
  const center = () => { const r = tab().getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const click = async () => { const [x, y] = center(); pointer('pointerdown', x, y); pointer('pointerup', x, y); await wait(400); };
  const drag = async (x, y) => { const [x0, y0] = center(); pointer('pointerdown', x0, y0); pointer('pointermove', x0 + 10, y0 + 10); pointer('pointermove', x, y); await wait(50);
    const during = { zoneOn: S().querySelector('.zone[data-on]')?.dataset.edge ?? null, chip: S().querySelector('.drop-chip')?.textContent ?? '' };
    pointer('pointerup', x, y); await wait(400); return during; };
  const saved = () => window.__values.get('eat:v1:core:settings')?.drawer ?? null;
`;

// A small Etsy Ads keyword table: four keywords, three of them match the word list, one has a high click ratio.
const ADS_TABLE = `<section id="listing-detail-targeted-keywords-accordion"><table><thead><tr><th>Keyword</th><th>Clicks</th><th>Orders</th></tr></thead><tbody>
${[['bts sticker', 4, 1], ['army gift', 30, 0], ['kpop poster', 2, 1], ['wedding card', 3, 1]].map(([w, c, o]) => `<tr class="wt-table__row"><th class="wt-table__row__cell"><p>${w}</p></th><td><span>${c}</span></td><td><span>${o}</span></td></tr>`).join('')}
</tbody></table><nav><button aria-current="true">1</button></nav></section>`;
// Etsy now loads that section collapsed: its rows exist only after the toggle opens it.
const ADS_TABLE_COLLAPSED = `<button type="button" id="kw-toggle" aria-controls="listing-detail-targeted-keywords-accordion" aria-expanded="false">Targeted keywords (4)</button>
<script>document.getElementById('kw-toggle').addEventListener('click', function () { this.setAttribute('aria-expanded', 'true'); this.insertAdjacentHTML('afterend', ${JSON.stringify(ADS_TABLE)}); }, { once: true });</script>`;
const ADS_RULES = ['bts', '=army gift', '/^kpop/'].join(String.fromCharCode(10));

// A small Marketplace Insights result for "bts sticker" with two similar search terms.
const KW_RESULT = `<div role="main"><section>
<div><span>Your search</span><h2>bts sticker</h2></div>
<div><span>Searches</span><span class="wt-text-title-larger">12,400</span></div>
<div><span>Search results</span><span class="wt-text-title-larger">3,210</span></div>
<table><thead><tr><th>Similar search terms</th><th>Searches</th><th>Search results</th></tr></thead><tbody>
<tr><td>bts gift</td><td>8,100</td><td>1,200</td></tr><tr><td>kpop sticker</td><td>950</td><td>40,000</td></tr>
</tbody></table></section></div>`;
const KW_SAVED_KEY = 'eat:v1:keyword-market-analyzer:legacy.ekma.v1.captures';
const KW_WAIT = `const until = async (c, l = 200000) => { for (let i = 0; i < l && !c(); i += 1) await new Promise((r) => setTimeout(r, 0)); }; await wait(2000); await until(() => window.__shadow.querySelector('[data-kw-state="analysed"]'));`;

const PACK_DE = JSON.parse(fs.readFileSync(new URL('../languages/de.json', import.meta.url), 'utf8'));
const PACK_HE = JSON.parse(fs.readFileSync(new URL('../languages/he.json', import.meta.url), 'utf8'));

const scenarios = {
  sellerPage: `async ({ wait }) => {${HELPERS}
    const out = {};
    out.hostCount = document.querySelectorAll('#makaytron-eat-root').length;
    out.documentStyles = [...document.querySelectorAll('style')].filter((s) => s.id !== 'makaytron-eat-root-fonts').length;
    const fontStyle = document.getElementById('makaytron-eat-root-fonts');
    out.fontStyleOnlyFaces = fontStyle ? fontStyle.textContent.split('}').filter((part) => part.trim()).every((part) => part.trim().startsWith('@font-face')) : null;
    out.probeFont = getComputedStyle(document.querySelector('button.probe')).fontFamily;
    out.tabStart = rect(tab());
    out.innerWidth = innerWidth; out.innerHeight = innerHeight;
    out.closedLabel = tab().getAttribute('aria-label');
    await click();
    out.openHidden = sheet().hidden; out.openSide = sheet().dataset.side; out.openWidth = rect(sheet()).width; out.openRight = rect(sheet()).right;
    out.expanded = tab().getAttribute('aria-expanded');
    out.tabWhenOpen = rect(tab());
    out.current = S().querySelector('#eat-current')?.textContent ?? null;
    out.otherTools = [...S().querySelectorAll('[data-role="tool-name"]')].map((n) => n.textContent);
    out.focusOnClose = S().activeElement?.getAttribute('aria-label') ?? null;
    S().activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    await wait(50);
    out.afterEscapeHidden = sheet().hidden;
    const logo = tab().querySelector('img');
    out.logo = logo ? { draggable: logo.draggable, pointer: getComputedStyle(logo).pointerEvents } : null;
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
    const press = async (sel) => { const el = q(sel); if (!el) throw new Error('missing ' + sel); el.click(); await wait(120); };
    await click();
    await press('[data-action="open-workspace"]');
    out.wsVisible = Boolean(q('#eat-workspace')); out.tabHidden = tab().hidden; out.sheetHidden = sheet().hidden;
    out.wsModal = q('#eat-workspace').getAttribute('aria-modal');
    out.firstPage = q('[aria-current="page"]')?.dataset.page; out.firstTitle = q('.ph .h1')?.textContent;
    out.focusStart = S().activeElement?.dataset.page ?? null;
    await press('[data-page="settings"]');
    out.settingsTitle = q('.ph .h1')?.textContent;
    await press('[data-name="theme"][data-value="dark"]');
    out.themeAfter = q('.mkui-root').dataset.theme; out.savedTheme = window.__values.get('eat:v1:core:settings').theme;
    out.focusAfterTheme = S().activeElement?.dataset.value ?? null;
    q('[data-name="theme"][data-value="dark"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true }));
    await wait(120);
    out.themeByKey = window.__values.get('eat:v1:core:settings').theme;
    await press('[data-name="edge"][data-value="left"]');
    out.savedEdge = window.__values.get('eat:v1:core:settings').drawer.edge;
    await press('[data-name="settings-tab"][data-value="tools"]');
    const ads = q('button[data-name="tool-ads-keyword-manager"]'); ads.click(); await wait(120);
    out.savedAds = window.__values.get('eat:v1:core:settings').tools['ads-keyword-manager'];
    out.menuAfterOff = [...S().querySelectorAll('.nv')].map((b) => b.dataset.page).filter(Boolean);
    await press('[data-name="settings-tab"][data-value="privacy"]');
    out.migDoneBeforeDelete = Boolean(q('[data-role="mig-done"]'));
    await press('[data-action="delete-data"]');
    out.dialog = Boolean(q('[role="alertdialog"]')); out.confirmDisabledAtStart = q('[data-action="confirm-delete"]').disabled;
    const input = q('#eat-confirm'); input.value = 'sil'; input.dispatchEvent(new Event('input', { bubbles: true })); await wait(20);
    out.confirmEnabledAfterTyping = !q('[data-action="confirm-delete"]').disabled;
    await press('[data-action="confirm-delete"]'); await wait(200);
    out.keysAfterDelete = [...window.__values.keys()].sort();
    out.migDoneAfterDelete = Boolean(q('[data-role="mig-done"]'));
    out.notice = q('[data-role="settings-message"]')?.textContent ?? null;
    q('#eat-workspace').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    await wait(120);
    out.wsAfterEscape = Boolean(q('#eat-workspace')); out.tabBack = !tab().hidden; out.drawerBack = !sheet().hidden;
    return out;
  }`,
  onboarding: `async ({ wait }) => {${HELPERS}
    const q = (sel) => S().querySelector(sel);
    const out = { title1: q('#eat-ob-title')?.textContent, modal: q('.ob-panel')?.getAttribute('aria-modal'), focus: S().activeElement?.getAttribute('name') };
    q('input[name="ob-language"][value="tr"]').click(); await wait(150);
    out.title1Tr = q('#eat-ob-title')?.textContent;
    out.progress1 = q('[role="progressbar"]')?.getAttribute('aria-valuenow');
    q('[data-action="ob-continue"]').click(); await wait(150);
    out.title2 = q('#eat-ob-title')?.textContent;
    out.progress2 = q('[role="progressbar"]')?.getAttribute('aria-valuenow');
    q('input[name="ob-tool-message-assistant"]').click(); await wait(50);
    q('[data-action="ob-finish"]').click(); await wait(200);
    const stored = window.__values.get('eat:v1:core:settings');
    out.saved = { onboarded: stored.onboarded, language: stored.language, ma: stored.tools['message-assistant'], sale: stored.tools['sale-manager'] };
    out.dialogGone = !q('.ob-panel');
    out.tabFocused = S().activeElement === tab();
    return out;
  }`,
  migration: `async ({ wait }) => {${HELPERS}
    const q = (sel) => S().querySelector(sel);
    await click(); q('[data-action="open-workspace"]').click(); await wait(120);
    q('[data-page="settings"]').click(); await wait(120);
    q('[data-name="settings-tab"][data-value="privacy"]').click(); await wait(120);
    q('[data-action="start-migration"]').click(); await wait(100);
    const runningLabel = q('[data-action="start-migration"]').textContent;
    await wait(5000);
    const row = q('tr[data-tool="ads-keyword-manager"]');
    return {
      runningLabel,
      rows: [...S().querySelectorAll('tbody tr')].map((r) => r.dataset.tool),
      result: row?.querySelector('.badge')?.textContent ?? null,
      sas: row?.querySelector('[data-sas]')?.dataset.sas ?? null,
      standaloneSas: window.__standaloneSas ?? null,
      standaloneDone: window.__standaloneDone === true,
      stored: window.__values.get('eat:v1:ads-keyword-manager:legacy.adWordlist') ?? null,
      storedUpdateState: window.__values.has('eat:v1:ads-keyword-manager:legacy.adKeywordManagerScriptUpdateState'),
      record: Boolean(window.__values.get('eat:v1:core:migration.ads-keyword-manager')),
      doneLine: q('[data-role="mig-done"]')?.textContent ?? null,
    };
  }`,
  openSettings: `async ({ wait }) => {${HELPERS}
    await click(); S().querySelector('[data-action="open-workspace"]').click(); await wait(120);
    S().querySelector('[data-page="settings"]').click(); await wait(120);
    return { ok: true };
  }`,
  saleEngine: `async ({ wait }) => {${HELPERS}
    // Virtual time races ahead of real browser work such as Web Locks; poll with zero-delay timers so that work can land.
    const until = async (cond, limit = 200000) => { for (let i = 0; i < limit && !cond(); i += 1) await new Promise((r) => setTimeout(r, 0)); };
    await wait(2000);
    await until(() => S().querySelector('[data-role="sale-drawer"]') || document.getElementById('eda-batch-root') && S().querySelector('[data-role="tool-status"]')?.textContent.includes('Ayrı'));
    await wait(300);
    const keys = [...window.__values.keys()];
    return {
      unifiedPanel: Boolean(document.getElementById('eat-sale-batch-root')),
      standalonePanel: Boolean(document.getElementById('eda-batch-root')),
      readMigratedConfig: window.__reads.includes('eat:v1:sale-manager:legacy.eda-batch-config-v4'),
      foreignKeys: keys.filter((k) => !k.startsWith('eat:')),
      saleKeys: keys.filter((k) => k.startsWith('eat:v1:sale-manager:')).length,
      network: window.__network,
      status: S().querySelector('[data-role="tool-status"]')?.textContent ?? null,
      saleDrawer: Boolean(S().querySelector('[data-role="sale-drawer"]')),
    };
  }`,
  saleScreens: `async ({ wait }) => {${HELPERS}
    const until = async (cond, limit = 200000) => { for (let i = 0; i < limit && !cond(); i += 1) await new Promise((r) => setTimeout(r, 0)); };
    const q = (sel) => S().querySelector(sel);
    await wait(2000);
    await until(() => q('[data-role="sale-drawer"]'));
    const out = {};
    const engineRoot = document.getElementById('eat-sale-batch-root');
    out.enginePanelHidden = engineRoot ? getComputedStyle(engineRoot).display === 'none' : null;
    out.drawerText = q('[data-role="sale-drawer"]')?.textContent ?? null;
    // A report left open from an earlier series would hold the engine back, hidden behind the new screens.
    document.body.insertAdjacentHTML('beforeend', '<div class="eda-report-backdrop" id="left-report"></div>');
    q('[data-sale="start"]').click(); await wait(100);
    out.confirmTitle = q('.modal-title')?.textContent ?? null;
    out.confirmCodes = [...S().querySelectorAll('.modal td .mono')].map((n) => n.textContent);
    q('[data-sale="confirm-start"]').click();
    await until(() => document.getElementById('eat-sale-batch-toast-root')?.textContent);
    out.engineToast = document.getElementById('eat-sale-batch-toast-root')?.textContent ?? null;
    out.leftReportClosed = !document.getElementById('left-report');
    out.jobAfterStart = window.__values.get('eat:v1:sale-manager:legacy.eda-batch-job-v4') ?? null;
    q('[data-sale="details"]').click(); await wait(150);
    out.pageTitle = q('.ph .h1')?.textContent ?? null;
    out.planRows = S().querySelectorAll('[data-role="sale-plan"] tbody tr').length;
    q('[data-name="sale-tab"][data-value="settings"]').click(); await wait(100);
    const form = q('[data-role="sale-settings"]');
    form.elements.discount.value = '30'; form.elements.discountName.value = 'SPRING';
    form.requestSubmit(); await until(() => window.__values.get('eat:v1:sale-manager:legacy.eda-batch-config-v4')?.discount === 30); await wait(150);
    const cfg = window.__values.get('eat:v1:sale-manager:legacy.eda-batch-config-v4');
    out.savedConfig = { discount: cfg.discount, discountName: cfg.discountName };
    out.notice = q('[data-role="sale-message"]')?.textContent ?? null;
    q('[data-name="sale-tab"][data-value="overview"]').click(); await wait(100);
    out.firstCode = q('[data-role="sale-plan"] tbody tr')?.dataset.code ?? null;
    q('[data-name="sale-tab"][data-value="report"]').click(); await wait(100);
    out.noReport = Boolean(q('[data-role="sale-no-report"]'));
    return out;
  }`,
  adsEngine: `async ({ wait }) => {${HELPERS}
    const until = async (cond, limit = 200000) => { for (let i = 0; i < limit && !cond(); i += 1) await new Promise((r) => setTimeout(r, 0)); };
    await wait(2000);
    await until(() => document.getElementById('eat-ads-wordlist') || (document.getElementById('makaytron-ad-wordlist') && S().querySelector('[data-role="tool-status"]')?.textContent.includes('Ayrı')));
    await wait(300);
    const keys = [...window.__values.keys()];
    return {
      unifiedPanel: Boolean(document.getElementById('eat-ads-wordlist')),
      standalonePanel: Boolean(document.getElementById('makaytron-ad-wordlist')),
      foreignKeys: keys.filter((k) => !k.startsWith('eat:')),
      adsReads: window.__reads.filter((k) => k.startsWith('eat:v1:ads-keyword-manager:legacy.')).length,
      foreignReads: window.__reads.filter((k) => !k.startsWith('eat:')),
      requests: window.__requests || [],
      adsDrawer: Boolean(S().querySelector('[data-role="ads-drawer"]')),
      status: S().querySelector('[data-role="tool-status"]')?.textContent ?? null,
    };
  }`,
  adsScreens: `async ({ wait }) => {${HELPERS}
    const until = async (cond, limit = 200000) => { for (let i = 0; i < limit && !cond(); i += 1) await new Promise((r) => setTimeout(r, 0)); };
    const q = (sel) => S().querySelector(sel);
    await wait(2000);
    await until(() => q('[data-role="ads-drawer"]') && q('[data-ads-state]')?.dataset.adsState === 'warning');
    const out = {};
    const engineRoot = document.getElementById('eat-ads-wordlist');
    out.enginePanelHidden = engineRoot ? getComputedStyle(engineRoot).display === 'none' : null;
    out.summary = q('[data-role="ads-summary"]')?.textContent ?? null;
    out.status = q('[data-role="ads-status"]')?.textContent ?? null;
    out.closeEnabled = q('[data-ads="close-page"]')?.disabled === false;
    q('[data-ads="details"]').click(); await wait(150);
    out.pageTitle = q('.ph .h1')?.textContent ?? null;
    out.tiles = { rows: q('[data-ads-tile="rows"] .v')?.textContent, matches: q('[data-ads-tile="matches"] .v')?.textContent };
    q('[data-name="ads-tab"][data-value="wordlist"]').click(); await wait(100);
    await until(() => q('[data-role="ads-rules"]'));
    out.rules = [...S().querySelectorAll('[data-role="ads-rules"] tbody tr')].map((tr) => [tr.children[0].textContent, tr.children[1].textContent]);
    out.restoreDisabled = q('[data-ads="restore"]')?.disabled === true;
    out.noBackup = Boolean(q('[data-ads="restore"]')?.title);
    q('[data-ads="edit"]').click();
    await until(() => document.getElementById('eat-ads-wordlist-editor'));
    out.editorOpen = Boolean(document.getElementById('eat-ads-wordlist-editor'));
    out.workspaceClosed = !q('.workspace') || q('.workspace').hidden || getComputedStyle(q('.workspace')).display === 'none';
    out.foreignKeys = [...window.__values.keys()].filter((k) => !k.startsWith('eat:'));
    out.requests = window.__requests || [];
    return out;
  }`,
  kwScreens: `async ({ wait }) => {${HELPERS}
    const until = async (cond, limit = 200000) => { for (let i = 0; i < limit && !cond(); i += 1) await new Promise((r) => setTimeout(r, 0)); };
    const q = (sel) => S().querySelector(sel);
    await wait(2000);
    await until(() => q('[data-kw-state="analysed"]'));
    const out = {};
    const engineRoot = document.getElementById('eat-kw-market-analyzer');
    out.enginePanelHidden = engineRoot ? getComputedStyle(engineRoot).display === 'none' : null;
    out.drawerTiles = { rows: q('[data-kw-tile="rows"] .b')?.textContent, saved: q('[data-kw-tile="saved"] .b')?.textContent };
    out.inlineBadges = document.querySelectorAll('[data-ekma-inline]').length;
    q('[data-kw="save"]').click();
    await until(() => (window.__values.get('${KW_SAVED_KEY}') || []).length === 1);
    await until(() => q('[data-role="kw-status"]')?.textContent.includes('kaydedildi'));
    out.savedStatus = q('[data-role="kw-status"]')?.textContent ?? null;
    q('[data-kw="details"]').click(); await wait(150);
    out.pageTitle = q('.ph .h1')?.textContent ?? null;
    out.related = [...S().querySelectorAll('[data-role="kw-related"] tbody tr')].map((tr) => tr.children[0].textContent);
    out.relatedSearches = [...S().querySelectorAll('[data-role="kw-related"] tbody tr')].map((tr) => tr.children[1].textContent);
    out.saved = [...S().querySelectorAll('[data-role="kw-saved"] tbody tr')].map((tr) => tr.children[0].textContent);
    out.noResearch = !q('[data-role="kw-related"]')?.closest('section')?.querySelector('.banner');
    out.copyDisabled = !q('[data-kw="copy-result"]') || q('[data-kw="copy-result"]').disabled === true;
    out.foreignKeys = [...window.__values.keys()].filter((k) => !k.startsWith('eat:'));
    out.foreignReads = window.__reads.filter((k) => !k.startsWith('eat:'));
    out.requests = window.__requests || [];
    return out;
  }`,
  kwStandalone: `async ({ wait }) => {${HELPERS}
    await wait(2600);
    return {
      unifiedPanel: Boolean(document.getElementById('eat-kw-market-analyzer')),
      requests: window.__requests || [],
      status: S().querySelector('[data-role="tool-status"]')?.textContent ?? null,
    };
  }`,
  maEngine: `async ({ wait }) => {${HELPERS}
    const until = async (cond, limit = 200000) => { for (let i = 0; i < limit && !cond(); i += 1) await new Promise((r) => setTimeout(r, 0)); };
    await wait(2000);
    await until(() => document.getElementById('eat-message-assistant') || (document.getElementById('makaytron-etsy-message-assistant') && S().querySelector('[data-role="tool-status"]')?.textContent.includes('Ayrı')));
    await wait(500);
    const keys = [...window.__values.keys()];
    return {
      unifiedHost: Boolean(document.getElementById('eat-message-assistant')),
      foreignKeys: keys.filter((k) => !k.startsWith('eat:')),
      maKeys: keys.filter((k) => k.startsWith('eat:v1:message-assistant:')).length,
      foreignReads: window.__reads.filter((k) => !k.startsWith('eat:')),
      requests: window.__requests || [],
      network: window.__network,
      status: S().querySelector('[data-role="tool-status"]')?.textContent ?? null,
      maDrawer: Boolean(S().querySelector('[data-role="ma-drawer"]')),
    };
  }`,
  maScreens: `async ({ wait }) => {${HELPERS}
    const until = async (cond, limit = 200000) => { for (let i = 0; i < limit && !cond(); i += 1) await new Promise((r) => setTimeout(r, 0)); };
    const q = (sel) => S().querySelector(sel);
    await wait(2000);
    await until(() => q('[data-role="ma-drawer"]') && window.__maShadow?.querySelector('.ma-app'));
    const out = {};
    const M = window.__maShadow;
    out.launcherHidden = getComputedStyle(M.querySelector('.ma-launcher')).display === 'none';
    out.state = q('[data-ma-state]')?.dataset.maState ?? null;
    out.context = Boolean(q('[data-role="ma-context"]')?.textContent);
    q('[data-ma="details"]').click(); await wait(150);
    out.tab = q('[data-role="ma-page"]')?.dataset.maTab ?? null;
    out.empty = Boolean(q('[data-role="ma-empty"]'));
    q('[data-name="ma-tab"][data-value="templates"]').click();
    await until(() => q('[data-role="ma-template-editor"]'));
    out.templates = S().querySelectorAll('[data-role="ma-templates"] [data-template]').length;
    out.preview = q('[data-role="ma-preview"]')?.textContent ?? '';
    q('[data-name="ma-tab"][data-value="automation"]').click();
    await until(() => q('[data-role="ma-autopilot"]'));
    out.autopilot = Boolean(q('[data-role="ma-autopilot"]')) && Boolean(q('[data-role="ma-rules"]')) && Boolean(q('[data-role="ma-reviews"]'));
    q('[data-ma="open-automation"]').click();
    await until(() => !M.querySelector('.ma-app').classList.contains('ma-hidden'));
    out.panelOpen = !M.querySelector('.ma-app').classList.contains('ma-hidden');
    out.panelSection = M.querySelector('[data-page].is-active')?.dataset.page ?? null;
    out.workspaceClosed = !q('.win') || getComputedStyle(q('.win')).display === 'none';
    out.requests = window.__requests || [];
    return out;
  }`,
  laEngine: `async ({ wait }) => {${HELPERS}
    const until = async (cond, limit = 200000) => { for (let i = 0; i < limit && !cond(); i += 1) await new Promise((r) => setTimeout(r, 0)); };
    await wait(2000);
    await until(() => document.getElementById('eat-listing-analyzer') || (document.getElementById('makaytron-etsy-listing-analyzer') && S().querySelector('[data-role="tool-status"]')?.textContent.includes('Ayrı')));
    await wait(500);
    const keys = [...window.__values.keys()];
    let session = [];
    try { session = Object.keys(sessionStorage); } catch { session = ['unreadable']; }
    return {
      unifiedHost: Boolean(document.getElementById('eat-listing-analyzer')),
      foreignKeys: keys.filter((k) => !k.startsWith('eat:')),
      foreignReads: window.__reads.filter((k) => !k.startsWith('eat:')),
      foreignSession: session.filter((k) => !k.startsWith('eat-')),
      requests: window.__requests || [],
      status: S().querySelector('[data-role="tool-status"]')?.textContent ?? null,
      laDrawer: Boolean(S().querySelector('[data-role="la-drawer"]')),
    };
  }`,
  laScreens: `async ({ wait }) => {${HELPERS}
    const until = async (cond, limit = 200000) => { for (let i = 0; i < limit && !cond(); i += 1) await new Promise((r) => setTimeout(r, 0)); };
    const q = (sel) => S().querySelector(sel);
    await wait(2000);
    await until(() => q('[data-role="la-drawer"]') && document.getElementById('eat-listing-analyzer')?.shadowRoot?.querySelector('.meli-panel'));
    const L = document.getElementById('eat-listing-analyzer').shadowRoot;
    const out = {};
    out.launcherHidden = getComputedStyle(L.querySelector('.meli-launcher')).display === 'none';
    out.state = q('[data-la-state]')?.dataset.laState ?? null;
    out.summary = q('[data-role="la-summary"]')?.textContent ?? null;
    out.collectionButton = q('[data-la="collection"]')?.textContent ?? null;
    q('[data-la="details"]').click(); await wait(150);
    out.tab = q('[data-role="la-page"]')?.dataset.laTab ?? null;
    out.empty = Boolean(q('[data-role="la-empty"]'));
    q('[data-name="la-tab"][data-value="thresholds"]').click();
    await until(() => q('[data-role="la-thresholds"]'));
    out.thresholds = S().querySelectorAll('[data-threshold]').length;
    q('[data-name="la-tab"][data-value="queue"]').click();
    await until(() => q('[data-role="la-queue"]'));
    out.queue = Boolean(q('[data-role="la-queue"]'));
    q('[data-name="la-tab"][data-value="ai"]').click();
    await until(() => q('[data-role="la-ai"]'));
    out.aiCopyDisabled = q('[data-la="copy-request"]').disabled;
    out.requests = window.__requests || [];
    return out;
  }`,
  packReady: `async ({ wait }) => {${HELPERS}
    const until = async (cond, limit = 200000) => { for (let i = 0; i < limit && !cond(); i += 1) await new Promise((r) => setTimeout(r, 0)); };
    await until(() => S().querySelector('.dock')?.textContent.includes('Auf dieser Seite läuft kein Werkzeug'));
    return {
      lang: S().querySelector('.mkui-root')?.getAttribute('lang') ?? null,
      drawerText: S().querySelector('.dock')?.textContent ?? '',
      stored: Boolean(window.__values.get('eat:v1:core:pack.de')),
      requests: window.__requests || [],
    };
  }`,
  packRtl: `async ({ wait }) => {${HELPERS}
    const until = async (cond, limit = 200000) => { for (let i = 0; i < limit && !cond(); i += 1) await new Promise((r) => setTimeout(r, 0)); };
    await until(() => S().querySelector('.dock')?.textContent.includes('אין כלי שפועל בדף הזה'));
    return {
      lang: S().querySelector('.mkui-root')?.getAttribute('lang') ?? null,
      dir: S().querySelector('[dir]')?.getAttribute('dir') ?? null,
      drawerText: S().querySelector('.dock')?.textContent ?? '',
    };
  }`,
  packFailed: `async ({ wait }) => {${HELPERS}
    const until = async (cond, limit = 200000) => { for (let i = 0; i < limit && !cond(); i += 1) await new Promise((r) => setTimeout(r, 0)); };
    await until(() => S().querySelector('[data-role="lang-status"][data-state="error"]'));
    const status = S().querySelector('[data-role="lang-status"]');
    const out = { title: S().querySelector('#eat-ob-title')?.textContent ?? null, failed: status?.textContent ?? null, problem: S().querySelector('[data-action="ob-report"]')?.textContent ?? null, requests: (window.__requests || []).length, continueDisabled: S().querySelector('[data-action="ob-continue"]')?.disabled === true };
    S().querySelector('[data-action="ob-report"]').click(); await wait(80);
    out.reportCategory = S().querySelector('input[name="fb-category"]:checked')?.value ?? null;
    out.reportCode = S().querySelector('[data-role="fb-preview"] [data-field="error"] .mono')?.textContent ?? null;
    S().querySelectorAll('.overlay')[S().querySelectorAll('.overlay').length - 1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(50);
    S().querySelector('[data-action="lang-retry"]').click();
    await until(() => (window.__requests || []).length > out.requests);
    out.retried = (window.__requests || []).length > out.requests;
    return out;
  }`,
  realTransfer: `async ({ wait }) => {${HELPERS}
    const until = async (cond, limit = 200000) => { for (let i = 0; i < limit && !cond(); i += 1) await new Promise((r) => setTimeout(r, 0)); };
    const q = (sel) => S().querySelector(sel);
    const NOTICE = 'makaytron-eat-migration-notice-ads-keyword-manager';
    await wait(1000);
    await until(() => document.getElementById(NOTICE));
    const notice = () => document.getElementById(NOTICE);
    const out = { noticeText: notice()?.textContent ?? null };
    [...notice().querySelectorAll('button')].find((b) => b.textContent === 'Transfer').click();
    await until(() => notice().textContent.includes('Ready to transfer'));
    out.armed = notice().textContent.includes('Ready to transfer');
    await click(); q('[data-action="open-workspace"]').click(); await wait(120);
    q('[data-page="settings"]').click(); await wait(120);
    q('[data-name="settings-tab"][data-value="privacy"]').click(); await wait(120);
    q('[data-action="start-migration"]').click();
    await until(() => q('tr[data-tool="ads-keyword-manager"] [data-sas]') && notice().textContent.includes('Transferred'));
    const row = q('tr[data-tool="ads-keyword-manager"]');
    out.result = row?.querySelector('.badge')?.textContent ?? null;
    out.sas = row?.querySelector('[data-sas]')?.dataset.sas ?? null;
    out.done = notice().textContent;
    out.stored = window.__values.get('eat:v1:ads-keyword-manager:legacy.adWordlist') ?? null;
    out.doneRecord = window.__standaloneValues.get('eat-migration-done') ?? null;
    out.standaloneKept = window.__standaloneValues.get('adWordlist') ?? null;
    return out;
  }`,
  feedback: `async ({ wait }) => {${HELPERS}
    const until = async (cond, limit = 200000) => { for (let i = 0; i < limit && !cond(); i += 1) await new Promise((r) => setTimeout(r, 0)); };
    const q = (sel) => S().querySelector(sel);
    await click(); q('[data-action="open-workspace"]').click(); await wait(120);
    q('[data-action="report-problem"]').click(); await wait(100);
    const out = { title: q('.modal-title')?.textContent ?? null };
    const note = q('#eat-fb-note');
    note.value = 'Shop https://www.etsy.com/shop/MyShop 1234567890 mail me@example.com'; note.dispatchEvent(new Event('input', { bubbles: true }));
    out.preview = Object.fromEntries([...S().querySelectorAll('[data-role="fb-preview"] [data-field]')].map((row) => [row.dataset.field, row.querySelector('.mono')?.textContent ?? '']));
    out.github = q('[data-action="fb-github"]')?.getAttribute('href') ?? '';
    out.target = q('[data-action="fb-github"]')?.getAttribute('target') ?? null;
    const body = new URL(out.github).searchParams.get('body') ?? '';
    out.payload = JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1));
    out.requests = window.__requests || [];
    return out;
  }`,
  shoppingPage: `async () => ({ hostCount: document.querySelectorAll('#makaytron-eat-root').length, booted: window.__etsyAutomationToolsBooted === true })`,
  darkOpen: `async ({ wait }) => {${HELPERS}
    return { theme: S().querySelector('.mkui-root').dataset.theme, hidden: sheet().hidden, bg: getComputedStyle(sheet()).backgroundColor, noTool: S().querySelector('[data-role="no-tool"]')?.textContent ?? null };
  }`,
};

// An open Etsy conversation, reduced to what the Message Assistant engine reads.
const MA_CONVERSATION = '<div id="dg-tabs-preact__tab-1--default_wt_tab_panel" role="tabpanel" data-conversation-id="1234567890"><div class="wt-grid"><div class="wt-rounded wt-text-body-01 wt-display-inline-block wt-break-word" data-message-direction="incoming">Hi! I just placed my order. Could the name be changed from Emma to Olivia?</div></div><textarea class="new-message-textarea-min-height" placeholder="Reply"></textarea></div>';
// Etsy's Messages list with its "Drafted for you › Delivery issues" folder link next to a real conversation.
const MA_LIST = '<nav aria-label="Folders"><ul><li><a href="https://www.etsy.com/messages/proactive_drafts">Delivery issues<span>0</span></a></li></ul></nav><ul aria-label="Conversations"><li><a href="https://www.etsy.com/messages/1234567890" aria-label="Conversation with Buyer Fixture">Buyer Fixture</a><p>Okay thank you!</p></li></ul>';
const ADS_MANY_RULES = [ADS_RULES, ...Array.from({ length: 300 }, (_, i) => 'fixture-rule-' + i)].join(String.fromCharCode(10));
const PAGES = {
  '/your/shops/me/sales-discounts': { settings: { onboarded: true, language: 'tr', theme: 'light' }, scenario: scenarios.sellerPage },
  '/c/jewelry': { settings: { onboarded: true, language: 'tr' }, scenario: scenarios.shoppingPage },
  '/your/shops/me/stats': { settings: { onboarded: true, language: 'tr', theme: 'dark', drawer: { openOnLoad: true } }, scenario: scenarios.darkOpen },
  '/your/shops/me/tools/listings': { settings: { onboarded: true, language: 'tr', theme: 'light' }, scenario: scenarios.workspace, preload: { 'eat:v1:core:migration.sale-manager': { tool: 'sale-manager', at: '2026-11-19T00:00:00.000Z', keys: 1 } } },
  '/your/shops/me/orders': { settings: null, scenario: scenarios.onboarding },
  '/your/shops/me/advertising': { settings: { onboarded: true, language: 'tr', theme: 'light' }, scenario: scenarios.migration, extra: STANDALONE_ADS },
  '/your/shops/me/sales-discounts/engine': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: scenarios.saleEngine, preload: { 'eat:v1:sale-manager:legacy.eda-batch-config-v4': { discount: 33, discountName: 'WINTER' } } },
  '/your/shops/me/sales-discounts/standalone': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: scenarios.saleEngine, extra: '<div id="eda-batch-root">standalone Sale Manager</div>' },
  '/your/shops/me/sales-discounts/ui': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: scenarios.saleScreens, preload: { 'eat:v1:sale-manager:legacy.eda-batch-config-v4': { discount: 25, discountName: 'WINTER', batchStartDate: '2026-12-07', batchEndDate: '2026-12-11', saleDurationDays: 1 } } },
  '/your/shops/me/sales-discounts/drawer-shot': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: `async ({ wait }) => { const until = async (c, l = 200000) => { for (let i = 0; i < l && !c(); i += 1) await new Promise((r) => setTimeout(r, 0)); }; await wait(2000); await until(() => window.__shadow.querySelector('[data-role="sale-drawer"]')); return { ok: true }; }`, preload: { 'eat:v1:sale-manager:legacy.eda-batch-config-v4': { discount: 25, discountName: 'WINTER', batchStartDate: '2026-12-07', batchEndDate: '2026-12-11', saleDurationDays: 1 } } },
  '/your/shops/me/sales-discounts/ui-shot': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: `async ({ wait }) => { const until = async (c, l = 200000) => { for (let i = 0; i < l && !c(); i += 1) await new Promise((r) => setTimeout(r, 0)); }; await wait(2000); await until(() => window.__shadow.querySelector('[data-role="sale-drawer"]')); window.__shadow.querySelector('[data-sale="details"]').click(); await wait(200); return { ok: true }; }`, preload: { 'eat:v1:sale-manager:legacy.eda-batch-config-v4': { discount: 25, discountName: 'WINTER', batchStartDate: '2026-12-07', batchEndDate: '2026-12-11', saleDurationDays: 1 } } },
  '/your/shops/me/advertising/listings/123': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: scenarios.adsEngine },
  '/your/shops/me/advertising/listings/456': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: scenarios.adsEngine, extra: '<div id="makaytron-ad-wordlist">standalone Ads Keyword Manager</div>' },
  '/your/shops/me/advertising/listings/ui': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: scenarios.adsScreens, extra: ADS_TABLE, preload: { 'eat:v1:ads-keyword-manager:legacy.adWordlist': ADS_RULES } },
  '/your/shops/me/advertising/listings/collapsed': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: `async ({ wait }) => { const until = async (c, l = 200000) => { for (let i = 0; i < l && !c(); i += 1) await new Promise((r) => setTimeout(r, 0)); }; await wait(2000); await until(() => window.__shadow.querySelector('[data-ads-state="warning"], [data-ads-state="error"]')); return { state: window.__shadow.querySelector('[data-ads-state]')?.dataset.adsState, expanded: document.getElementById('kw-toggle').getAttribute('aria-expanded') }; }`, extra: ADS_TABLE_COLLAPSED, preload: { 'eat:v1:ads-keyword-manager:legacy.adWordlist': ADS_RULES } },
  '/your/shops/me/advertising/listings/drawer-shot': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: `async ({ wait }) => { const until = async (c, l = 200000) => { for (let i = 0; i < l && !c(); i += 1) await new Promise((r) => setTimeout(r, 0)); }; await wait(2000); await until(() => window.__shadow.querySelector('[data-ads-state="warning"]')); return { ok: true }; }`, extra: ADS_TABLE, preload: { 'eat:v1:ads-keyword-manager:legacy.adWordlist': ADS_RULES } },
  '/your/shops/me/advertising/listings/page-shot': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: `async ({ wait }) => { const until = async (c, l = 200000) => { for (let i = 0; i < l && !c(); i += 1) await new Promise((r) => setTimeout(r, 0)); }; await wait(2000); await until(() => window.__shadow.querySelector('[data-ads-state="warning"]')); window.__shadow.querySelector('[data-ads="details"]').click(); await wait(200); return { ok: true }; }`, extra: ADS_TABLE, preload: { 'eat:v1:ads-keyword-manager:legacy.adWordlist': ADS_RULES } },
  '/your/shops/me/advertising/listings/rules-many': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: `async ({ wait }) => { const until = async (c, l = 200000) => { for (let i = 0; i < l && !c(); i += 1) await new Promise((r) => setTimeout(r, 0)); }; const S = () => window.__shadow; await wait(2000); await until(() => S().querySelector('[data-ads-state="warning"]')); S().querySelector('[data-ads="details"]').click(); await wait(200); S().querySelector('[data-name="ads-tab"][data-value="wordlist"]').click(); await until(() => S().querySelector('[data-role="ads-rules"]')); await wait(100); const add = S().querySelector('[data-ads="add-rule"]'); const card = add?.closest('section'); return { rules: S().querySelectorAll('[data-role="ads-rules"] tbody tr').length, addCard: card ? Math.round(card.getBoundingClientRect().height) : null, addButton: add ? Math.round(add.getBoundingClientRect().height) : null }; }`, extra: ADS_TABLE, preload: { 'eat:v1:ads-keyword-manager:legacy.adWordlist': ADS_MANY_RULES } },
  '/your/shops/me/advertising/listings/rules-shot': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: `async ({ wait }) => { const until = async (c, l = 200000) => { for (let i = 0; i < l && !c(); i += 1) await new Promise((r) => setTimeout(r, 0)); }; await wait(2000); await until(() => window.__shadow.querySelector('[data-ads-state="warning"]')); window.__shadow.querySelector('[data-ads="details"]').click(); await wait(200); window.__shadow.querySelector('[data-name="ads-tab"][data-value="wordlist"]').click(); await until(() => window.__shadow.querySelector('[data-role="ads-rules"]')); return { ok: true }; }`, extra: ADS_TABLE, preload: { 'eat:v1:ads-keyword-manager:legacy.adWordlist': ADS_RULES } },
  '/your/shops/me/marketplace-insights/search?query=bts%20sticker': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: scenarios.kwScreens, extra: KW_RESULT },
  '/your/shops/me/marketplace-insights/search?query=bts%20sticker&standalone=1': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: scenarios.kwStandalone, extra: KW_RESULT + '<div id="makaytron-etsy-keyword-market-analyzer">standalone Keyword & Market Analyzer</div>' },
  '/your/shops/me/marketplace-insights/search?query=bts%20sticker&shot=drawer': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: `async ({ wait }) => { ${KW_WAIT} return { ok: true }; }`, extra: KW_RESULT },
  '/your/shops/me/marketplace-insights/search?query=bts%20sticker&shot=page': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: `async ({ wait }) => { ${KW_WAIT} window.__shadow.querySelector('[data-kw="details"]').click(); await wait(200); return { ok: true }; }`, extra: KW_RESULT },
  '/your/shops/me/marketplace-insights/search?query=bts%20sticker&shot=saved': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: `async ({ wait }) => { ${KW_WAIT} window.__shadow.querySelector('[data-kw="save"]').click(); await until(() => (window.__values.get('${KW_SAVED_KEY}') || []).length); window.__shadow.querySelector('[data-kw="details"]').click(); await wait(200); window.__shadow.querySelector('[data-name="kw-tab"][data-value="saved"]').click(); await until(() => window.__shadow.querySelector('[data-role="kw-saved"]')); return { ok: true }; }`, extra: KW_RESULT },
  '/messages/eat-engine': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: scenarios.maEngine },
  '/messages/eat-screens': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: scenarios.maScreens },
  '/messages/all': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: `async ({ wait }) => { const until = async (c, l = 200000) => { for (let i = 0; i < l && !c(); i += 1) await new Promise((r) => setTimeout(r, 0)); }; await wait(2000); await until(() => window.__shadow.querySelector('[data-role="ma-drawer"]')); window.__shadow.querySelector('[data-ma="details"]').click(); await wait(300); const rows = [...window.__shadow.querySelectorAll('[data-role="ma-list"] a.cv')]; return { names: rows.map((a) => a.querySelector('.sm')?.textContent ?? ''), ids: rows.map((a) => a.dataset.conversation) }; }`, extra: MA_LIST },
  '/messages/1234567890': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: `async ({ wait }) => { const until = async (c, l = 200000) => { for (let i = 0; i < l && !c(); i += 1) await new Promise((r) => setTimeout(r, 0)); }; await wait(2000); await until(() => window.__shadow.querySelector('[data-role="ma-drawer"]')); return { ok: true }; }`, extra: MA_CONVERSATION },
  '/messages/1234567890?shot=page': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: `async ({ wait }) => { const until = async (c, l = 200000) => { for (let i = 0; i < l && !c(); i += 1) await new Promise((r) => setTimeout(r, 0)); }; await wait(2000); await until(() => window.__shadow.querySelector('[data-role="ma-drawer"]')); window.__shadow.querySelector('[data-ma="details"]').click(); await wait(200); return { ok: true }; }`, extra: MA_CONVERSATION },
  '/messages/eat-shot-templates': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: `async ({ wait }) => { const until = async (c, l = 200000) => { for (let i = 0; i < l && !c(); i += 1) await new Promise((r) => setTimeout(r, 0)); }; await wait(2000); await until(() => window.__shadow.querySelector('[data-role="ma-drawer"]')); window.__shadow.querySelector('[data-ma="details"]').click(); await wait(200); window.__shadow.querySelector('[data-name="ma-tab"][data-value="templates"]').click(); await wait(200); return { ok: true }; }` },
  '/messages/eat-shot-automation': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: `async ({ wait }) => { const until = async (c, l = 200000) => { for (let i = 0; i < l && !c(); i += 1) await new Promise((r) => setTimeout(r, 0)); }; await wait(2000); await until(() => window.__shadow.querySelector('[data-role="ma-drawer"]')); window.__shadow.querySelector('[data-ma="details"]').click(); await wait(200); window.__shadow.querySelector('[data-name="ma-tab"][data-value="automation"]').click(); await wait(200); return { ok: true }; }` },
  '/messages/eat-shot-inbox': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: `async ({ wait }) => { const until = async (c, l = 200000) => { for (let i = 0; i < l && !c(); i += 1) await new Promise((r) => setTimeout(r, 0)); }; await wait(2000); await until(() => window.__shadow.querySelector('[data-role="ma-drawer"]')); window.__shadow.querySelector('[data-ma="details"]').click(); await wait(200); return { ok: true }; }` },
  '/messages/eat-standalone': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: scenarios.maEngine, extra: '<div id="makaytron-etsy-message-assistant">standalone Message Assistant</div>' },
  '/your/shops/me/tools/listings?eat=engine': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: scenarios.laEngine },
  '/your/shops/me/tools/listings?eat=screens': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: scenarios.laScreens },
  '/your/shops/me/tools/listings?eat=standalone': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: scenarios.laEngine, extra: '<div id="makaytron-etsy-listing-analyzer">standalone Listing Analyzer</div>' },
  '/your/shops/me/stats/pack-de': { settings: { onboarded: true, language: 'de', theme: 'light', drawer: { openOnLoad: true } }, scenario: scenarios.packReady, packs: { de: PACK_DE } },
  '/your/shops/me/stats/pack-he': { settings: { onboarded: true, language: 'he', theme: 'light', drawer: { openOnLoad: true } }, scenario: scenarios.packRtl, packs: { he: PACK_HE } },
  '/your/shops/me/stats/pack-fr': { settings: { onboarded: false, language: 'fr', theme: 'light' }, scenario: scenarios.packFailed },
  '/your/shops/me/advertising/listings/transfer': { settings: { onboarded: true, language: 'tr', theme: 'light' }, scenario: scenarios.realTransfer, extra: REAL_STANDALONE_ADS },
  '/your/shops/me/stats/whats-new': { settings: { onboarded: true, language: 'tr', theme: 'light' }, seen: '2.0.0', scenario: `async ({ wait }) => { const until = async (c, l = 200000) => { for (let i = 0; i < l && !c(); i += 1) await new Promise((r) => setTimeout(r, 0)); }; await wait(500); await until(() => window.__shadow.querySelector('[data-role="whats-new"]')); const S = window.__shadow; const out = { title: S.querySelector('.modal-title')?.textContent ?? null, items: S.querySelectorAll('[data-role="whats-new"] .li').length, seen: window.__values.get('eat:v1:core:seenVersion') }; S.querySelector('[data-action="wn-ok"]').click(); await wait(50); out.closed = !S.querySelector('[data-role="whats-new"]'); return out; }` },
  '/your/shops/me/stats/whats-new-shot': { settings: { onboarded: true, language: 'tr', theme: 'light' }, seen: '2.0.0', scenario: `async ({ wait }) => { await wait(1200); return { ok: true }; }` },
  '/your/shops/me/stats/first-visit': { settings: { onboarded: true, language: 'tr', theme: 'light' }, seen: APP_VERSION, scenario: `async ({ wait }) => { await wait(800); return { shown: Boolean(window.__shadow.querySelector('[data-role="whats-new"]')) }; }` },
  '/your/shops/me/stats/feedback': { settings: { onboarded: true, language: 'tr', theme: 'light' }, scenario: scenarios.feedback },
  // Screenshot-only pages.
  '/your/shops/me/stats/feedback-shot': { settings: { onboarded: true, language: 'tr', theme: 'light' }, scenario: `async ({ wait }) => { ${HELPERS} await click(); S().querySelector('[data-action="open-workspace"]').click(); await wait(120); S().querySelector('[data-action="report-problem"]').click(); await wait(150); return { ok: true }; }` },
  '/your/shops/me/advertising/listings/notice-shot': { settings: { onboarded: true, language: 'tr', theme: 'light' }, scenario: `async ({ wait }) => { await wait(1500); return { ok: true }; }`, extra: REAL_STANDALONE_ADS },
  '/your/shops/me/onboarding-shot': { settings: null, scenario: `async () => ({ ok: true })` },
  '/your/shops/me/migration-shot': { settings: { onboarded: true, language: 'tr', theme: 'light' }, scenario: scenarios.migration, extra: STANDALONE_ADS },
  '/your/account': { settings: { onboarded: true, language: 'tr', theme: 'light' }, scenario: scenarios.openSettings },
  '/your/purchases': { settings: { onboarded: true, language: 'tr', theme: 'dark' }, scenario: scenarios.openSettings },
  '/messages': { settings: { onboarded: true, language: 'tr', theme: 'light', drawer: { openOnLoad: true } }, scenario: scenarios.shoppingPage },
  '/your/orders/sold': { settings: { onboarded: true, language: 'tr', theme: 'light' }, scenario: scenarios.shoppingPage },
};

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      const page = PAGES[url.pathname + url.search] ?? PAGES[url.pathname];
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
      '--window-size=1440,900', '--hide-scrollbars', '--force-prefers-reduced-motion', '--lang=en-US', ...(process.env.EAT_DEBUG_DIR ? ['--enable-logging=stderr', '--v=0'] : []), '--virtual-time-budget=20000', ...extra, url], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c) => { stdout += c; }); child.stderr.on('data', (c) => { stderr += c; });
    child.once('error', reject);
    child.once('exit', async (code) => {
      await rm(profile, { recursive: true, force: true }).catch(() => {});
      if (process.env.EAT_DEBUG_DIR) {
        const name = url.replace(/[^a-z0-9]+/gi, '_').slice(-60);
        fs.writeFileSync(path.join(process.env.EAT_DEBUG_DIR, `${name}.log`), stderr.split(/\r?\n/).filter((l) => l.includes('CONSOLE')).join('\n'));
      }
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
  if (process.env.EAT_DUMP) console.log(`RESULT ${pathname} ${JSON.stringify(result)}`);
  return result;
}

const chrome = await findChrome();
const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

test('seller page: edge button, drawer, Escape and dragging to other edges', async () => {
  const r = await visit(chrome, base, '/your/shops/me/sales-discounts');
  assert.equal(r.hostCount, 1);
  assert.equal(r.documentStyles, 1, 'no styles added to the Etsy document but the fonts');
  assert.equal(r.fontStyleOnlyFaces, true, 'the one document style only registers the embedded fonts (@font-face does not work inside a shadow root)');
  assert.match(r.probeFont, /Georgia/, 'Etsy controls keep their own font');
  assert.equal(r.tabStart.right, r.innerWidth, 'starts on the right edge');
  assert.equal(r.closedLabel, 'Makaytron çekmecesini aç');

  assert.equal(r.openHidden, false);
  assert.equal(r.openSide, 'right');
  assert.equal(r.openWidth, 400);
  assert.equal(r.openRight, r.innerWidth);
  assert.equal(r.expanded, 'true');
  assert.equal(r.tabWhenOpen.right, r.innerWidth - 400, 'button rides on the drawer edge');
  assert.equal(r.current, 'Sale Manager');
  assert.ok(!r.otherTools.includes('Sale Manager') && r.otherTools.length === 4, r.otherTools.join(','));
  assert.equal(r.focusOnClose, 'Makaytron çekmecesini kapat', 'focus moves into the drawer');
  assert.equal(r.afterEscapeHidden, true, 'Escape closes the drawer');

  assert.deepEqual(r.logo, { draggable: false, pointer: 'none' }, 'grabbing the logo drags the button, not the image');
  assert.equal(r.dragLeft.zoneOn, 'left');
  assert.match(r.dragLeft.chip, /sol kenar\s*Çekmece soldan açılır/);
  assert.equal(r.savedLeft.edge, 'left');
  assert.equal(r.tabLeft.left, 0);
  assert.equal(r.leftSide, 'left');
  assert.equal(r.leftSheet.left, 0);
  assert.equal(r.tabLeftOpen.left, 400);

  assert.equal(r.dragTop.zoneOn, 'top');
  assert.match(r.dragTop.chip, /üst kenar\s*Çekmece soldan açılır/);
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
  assert.equal(r.bg, 'rgb(26, 26, 26)', 'the design canvas dark drawer (#1a1a1a)');
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
  assert.equal(r.migDoneBeforeDelete, true, 'the transfer card listed the earlier transfer');
  assert.equal(r.migDoneAfterDelete, false, 'and drops it as soon as the data is deleted');
  assert.equal(r.wsAfterEscape, false);
  assert.equal(r.tabBack, true);
  assert.equal(r.drawerBack, true, 'Escape returns to the drawer');
});

test('Sale Manager engine runs inside the unified script, isolated from a standalone copy', async () => {
  const r = await visit(chrome, base, '/your/shops/me/sales-discounts/engine');
  assert.equal(r.unifiedPanel, true, 'the adopted engine shows its panel under its own id');
  assert.equal(r.standalonePanel, false);
  assert.equal(r.readMigratedConfig, true, 'it reads the data the transfer stored');
  assert.deepEqual(r.foreignKeys, [], 'every value lives under eat:');
  assert.ok(r.saleKeys >= 1);
  assert.equal(r.network, 0, 'no update check or telemetry request');
  assert.equal(r.saleDrawer, true, 'the drawer shows the Sale Manager series card');
});

test('Sale Manager steps aside when the standalone script runs on the same page', async () => {
  const r = await visit(chrome, base, '/your/shops/me/sales-discounts/standalone');
  assert.equal(r.unifiedPanel, false, 'the unified engine never starts');
  assert.equal(r.standalonePanel, true);
  assert.equal(r.network, 0);
  assert.match(r.status, /Ayrı Sale Manager scripti de bu sayfada çalışıyor/);
});

test('Sale Manager screens drive the engine without bypassing its safety checks', async () => {
  const r = await visit(chrome, base, '/your/shops/me/sales-discounts/ui');
  assert.equal(r.enginePanelHidden, true, 'the old panel is replaced by the new screens');
  assert.match(r.drawerText, /5 kampanya/);
  assert.equal(r.confirmTitle, 'Seri başlatılsın mı?');
  assert.deepEqual(r.confirmCodes, ['261207WINTER25', '261208WINTER25', '261209WINTER25', '261210WINTER25', '261211WINTER25']);
  assert.match(r.engineToast, /mağaza kimliği okunamadı/, 'the engine refuses to start without a verified shop');
  assert.equal(r.jobAfterStart, null, 'no job was created');
  assert.equal(r.leftReportClosed, true, 'a leftover engine report is closed before the series starts');
  assert.equal(r.pageTitle, 'Kampanya serisi');
  assert.equal(r.planRows, 5);
  assert.deepEqual(r.savedConfig, { discount: 30, discountName: 'SPRING' });
  assert.equal(r.notice, 'Ayarlar kaydedildi.');
  assert.equal(r.firstCode, '261207SPRING30');
  assert.equal(r.noReport, true);
});

test('Ads Keyword Manager engine runs inside the unified script, isolated from a standalone copy', async () => {
  const r = await visit(chrome, base, '/your/shops/me/advertising/listings/123');
  assert.equal(r.unifiedPanel, true, 'the adopted engine shows its panel under its own id');
  assert.equal(r.standalonePanel, false);
  assert.deepEqual(r.foreignKeys, [], 'every value lives under eat:');
  assert.ok(r.adsReads > 0, 'the engine reads its own namespace');
  assert.deepEqual(r.foreignReads, [], 'and nothing outside eat:');
  assert.ok(r.requests.every((url) => url.includes('/scripts/etsy-ads-keyword-manager/keyword-rules.txt')), `only the word list is requested: ${r.requests.join(', ')}`);
  assert.equal(r.adsDrawer, true, 'the drawer shows the new Ads screen');
});

test('Ads Keyword Manager screens show the engine counts and open its own rule editor', async () => {
  const r = await visit(chrome, base, '/your/shops/me/advertising/listings/ui');
  assert.equal(r.enginePanelHidden, true, 'the old panel is replaced by the new screens');
  assert.equal(r.summary, 'Bu sayfada 4 kelime · 3 tanesi listenizle eşleşiyor');
  assert.match(r.status, /4 satır/, 'the engine status follows the Turkish interface');
  assert.equal(r.closeEnabled, true);
  assert.equal(r.pageTitle, 'Reklam anahtar kelimeleri');
  assert.deepEqual(r.tiles, { rows: '4', matches: '3' });
  assert.deepEqual(r.rules, [['bts', 'İçerir'], ['army gift', 'Tam'], ['^kpop', 'Desen']]);
  assert.equal(r.restoreDisabled, true, 'no previous list to go back to');
  assert.equal(r.noBackup, true);
  assert.equal(r.editorOpen, true, 'the engine opens its own rule editor');
  assert.equal(r.workspaceClosed, true, 'the workspace steps out of the way of the editor');
  assert.deepEqual(r.foreignKeys, []);
  assert.deepEqual(r.requests, [], 'a stored word list needs no download');
});

test('Ads Keyword Manager opens the collapsed targeted-keywords section and reads its rows', async () => {
  const r = await visit(chrome, base, '/your/shops/me/advertising/listings/collapsed');
  assert.equal(r.expanded, 'true', 'the engine opened the section');
  assert.equal(r.state, 'warning', 'three of the four rows match the word list');
});

test('Ads Keyword Manager steps aside when the standalone script runs on the same page', async () => {
  const r = await visit(chrome, base, '/your/shops/me/advertising/listings/456');
  assert.equal(r.unifiedPanel, false);
  assert.equal(r.standalonePanel, true);
  assert.deepEqual(r.requests, []);
  assert.match(r.status, /Ayrı Ads Keyword Manager scripti de bu sayfada çalışıyor/);
});

test('Keyword & Market Analyzer screens read the Insights page and save research under eat:', async () => {
  const r = await visit(chrome, base, '/your/shops/me/marketplace-insights/search?query=bts%20sticker');
  assert.equal(r.enginePanelHidden, true, 'the old panel is replaced by the new screens');
  assert.deepEqual(r.drawerTiles, { rows: '3', saved: '0' }, 'the drawer counts the rows read from the page');
  assert.ok(r.inlineBadges > 0, 'the engine still marks the keywords on the Etsy page');
  assert.match(r.savedStatus, /Analiz kaydedildi/);
  assert.equal(r.pageTitle, 'Araştırmalar');
  assert.deepEqual(r.related, ['bts sticker', 'bts gift', 'kpop sticker'], 'the main keyword and its similar terms');
  assert.deepEqual(r.relatedSearches.slice(0, 2), ['12.400', '8.100']);
  assert.deepEqual(r.saved, ['bts sticker']);
  assert.equal(r.noResearch, true);
  assert.equal(r.copyDisabled, true);
  assert.deepEqual(r.foreignKeys, []);
  assert.deepEqual(r.foreignReads, []);
  assert.deepEqual(r.requests, [], 'no update check or other request');
});

test('Keyword & Market Analyzer steps aside when the standalone script runs on the same page', async () => {
  const r = await visit(chrome, base, '/your/shops/me/marketplace-insights/search?query=bts%20sticker&standalone=1');
  assert.equal(r.unifiedPanel, false);
  assert.deepEqual(r.requests, []);
  assert.match(r.status, /Ayrı Keyword & Market Analyzer scripti de bu sayfada çalışıyor/);
});

test('Message Assistant engine runs inside the unified script, isolated from a standalone copy', async () => {
  const r = await visit(chrome, base, '/messages/eat-engine');
  assert.equal(r.unifiedHost, true, 'the adopted engine shows its panel under its own id');
  assert.deepEqual(r.foreignKeys, [], 'every value lives under eat:');
  assert.ok(r.maKeys > 0, 'the engine writes its own namespace');
  assert.deepEqual(r.foreignReads, [], 'and reads nothing outside eat:');
  assert.deepEqual(r.requests, [], 'no update check, translation or AI request without the user');
  assert.equal(r.maDrawer, true, 'the drawer shows the new Message Assistant screen');
});

test('Message Assistant lists conversations only, never Etsy folders such as Delivery issues', async () => {
  const r = await visit(chrome, base, '/messages/all');
  assert.deepEqual(r.names, ['Buyer Fixture']);
  assert.deepEqual(r.ids, ['1234567890']);
});

test('Ads word list keeps the add form visible however long the list is', async () => {
  const r = await visit(chrome, base, '/your/shops/me/advertising/listings/rules-many');
  assert.ok(r.rules > 300, 'the long list is shown');
  assert.ok(r.addCard > 80, `the add card keeps its height (got ${r.addCard}px)`);
  assert.ok(r.addButton > 20, 'and its button is clickable');
});

test('Message Assistant screens show the engine data and open its panel at a section', async () => {
  const r = await visit(chrome, base, '/messages/eat-screens');
  assert.equal(r.launcherHidden, true, 'the edge button replaces the floating launcher');
  assert.equal(r.state, 'no-key');
  assert.equal(r.context, true, 'without an open conversation the drawer says what to do');
  assert.equal(r.tab, 'inbox');
  assert.equal(r.empty, true, 'no conversation read yet: the first-use page');
  assert.ok(r.templates >= 3, 'the engine templates are listed');
  assert.ok(r.preview.length > 0, 'the Turkish preview needs no translation');
  assert.equal(r.autopilot, true);
  assert.equal(r.panelOpen, true, 'the engine panel opens');
  assert.equal(r.panelSection, 'orders');
  assert.equal(r.workspaceClosed, true);
  assert.deepEqual(r.requests, []);
});

test('Message Assistant steps aside when the standalone script runs on the same page', async () => {
  const r = await visit(chrome, base, '/messages/eat-standalone');
  assert.equal(r.unifiedHost, false);
  assert.deepEqual(r.requests, []);
  assert.match(r.status, /Ayrı Message Assistant scripti de bu sayfada çalışıyor/);
});

test('Listing Analyzer engine runs inside the unified script, isolated from a standalone copy', async () => {
  const r = await visit(chrome, base, '/your/shops/me/tools/listings?eat=engine');
  assert.equal(r.unifiedHost, true, 'the adopted engine shows its panel under its own id');
  assert.deepEqual(r.foreignKeys, [], 'every value lives under eat:');
  assert.deepEqual(r.foreignReads, [], 'and nothing outside eat: is read');
  assert.deepEqual(r.foreignSession, [], 'its per-tab state uses eat- names');
  assert.deepEqual(r.requests, [], 'no update check or other request');
  assert.equal(r.laDrawer, true, 'the drawer shows the new Listing Analyzer screen');
});

test('Listing Analyzer screens show the engine data on every tab', async () => {
  const r = await visit(chrome, base, '/your/shops/me/tools/listings?eat=screens');
  assert.equal(r.launcherHidden, true, 'the edge button replaces the floating launcher');
  assert.ok(['ready', 'stopped'].includes(r.state), r.state);
  assert.equal(r.summary, '0 listing kayıtlı · bu sayfada 0');
  assert.equal(r.collectionButton, 'Tüm sayfaları tara');
  assert.equal(r.tab, 'overview');
  assert.equal(r.empty, true, 'nothing read yet: the first-use page');
  assert.equal(r.thresholds, 4, 'the four engine thresholds');
  assert.equal(r.queue, true);
  assert.equal(r.aiCopyDisabled, true, 'no AI request without a selection');
  assert.deepEqual(r.requests, []);
});

test('Listing Analyzer steps aside when the standalone script runs on the same page', async () => {
  const r = await visit(chrome, base, '/your/shops/me/tools/listings?eat=standalone');
  assert.equal(r.unifiedHost, false);
  assert.deepEqual(r.requests, []);
  assert.match(r.status, /Ayrı Listing Analyzer scripti de bu sayfada çalışıyor/);
});

test('a language pack downloads once and the interface switches to it', async () => {
  const r = await visit(chrome, base, '/your/shops/me/stats/pack-de');
  assert.equal(r.lang, 'de');
  assert.match(r.drawerText, /Auf dieser Seite läuft kein Werkzeug/);
  assert.equal(r.stored, true, 'the pack is kept for the next page');
  assert.deepEqual(r.requests, ['https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/languages/de.json']);
});

test('a right-to-left pack turns the interface around', async () => {
  const r = await visit(chrome, base, '/your/shops/me/stats/pack-he');
  assert.equal(r.lang, 'he');
  assert.equal(r.dir, 'rtl');
  assert.match(r.drawerText, /אין כלי שפועל בדף הזה/);
});

test('a failed language pack keeps English, says so in the chosen language and can be retried', async () => {
  const r = await visit(chrome, base, '/your/shops/me/stats/pack-fr');
  assert.equal(r.title, 'Choisissez votre langue', 'the first screen is bundled in every language');
  assert.match(r.failed, /Le pack de langue n’a pas pu être téléchargé/);
  assert.match(r.failed, /Réessayer/);
  assert.match(r.problem, /Signal/, 'the report link is in the chosen language too');
  assert.equal(r.retried, true);
  assert.equal(r.continueDisabled, true, 'the setup waits for the chosen language');
  assert.equal(r.reportCategory, 'language-pack');
  assert.match(r.reportCode, /^i18n_pack_download/);
});

test('the real standalone script hands its data over from its notice, with the same check code on both sides', async () => {
  const r = await visit(chrome, base, '/your/shops/me/advertising/listings/transfer');
  assert.match(r.noticeText, /We are moving to Etsy Automation Tools/);
  assert.equal(r.armed, true);
  assert.equal(r.result, 'Aktarıldı');
  assert.match(r.done, new RegExp(`Check code: ${r.sas}`), 'the notice showed the same check code before it finished');
  assert.equal(r.stored, 'bts\nkpop poster');
  assert.equal(r.doneRecord.tool, 'ads-keyword-manager');
  assert.equal(r.standaloneKept, 'bts\nkpop poster', 'the standalone script keeps its own data');
});

test("the What's new dialog shows once after an update, in the interface language", async () => {
  const r = await visit(chrome, base, '/your/shops/me/stats/whats-new');
  // The dialog shows the notes of the version being built, so this test follows src/meta.js and src/core/release-notes.js.
  const { RELEASE_NOTES } = await import('../src/core/release-notes.js');
  const notes = RELEASE_NOTES.find((n) => n.version === APP_VERSION);
  assert.ok(notes, `src/core/release-notes.js has notes for ${APP_VERSION}`);
  assert.equal(r.title, `Yenilikler · ${APP_VERSION}`);
  assert.equal(r.items, notes.items.length);
  assert.equal(r.seen, APP_VERSION, 'the version is recorded, so it does not open again');
  assert.equal(r.closed, true);
  const again = await visit(chrome, base, '/your/shops/me/stats/first-visit');
  assert.equal(again.shown, false, 'nothing to show for a version already seen');
});

test('a problem report shows everything, never shop data, and opens a prefilled GitHub issue without sending anything', async () => {
  const r = await visit(chrome, base, '/your/shops/me/stats/feedback');
  assert.equal(r.title, 'Sorun bildir');
  assert.deepEqual(Object.keys(r.preview), ['version', 'system', 'locale', 'page', 'error'], 'every group of facts is shown before sending');
  assert.match(r.preview.locale, /en-US/);
  assert.match(r.preview.locale, /US/);
  assert.equal(r.payload.note, 'Shop [link] [number] mail [email]', 'links, numbers and e-mail addresses are masked');
  assert.match(r.github, /^https:\/\/github\.com\/Makaytron\/Etsy-Automation-Tools\/issues\/new\?/);
  assert.equal(r.target, '_blank');
  assert.deepEqual(r.requests, [], 'the script itself sends nothing');
  assert.deepEqual(Object.keys(r.payload).sort(), ['appVersion', 'browser', 'browserLocale', 'browserMajor', 'category', 'errorAt', 'errorCode', 'format', 'formatVersion', 'handler', 'note', 'os', 'region', 'routeId', 'routeTemplate', 'tool', 'uiLanguage', 'utcOffset']);
  assert.doesNotMatch(JSON.stringify(r.payload), /MyShop|1234567890|example\.com/);
});

test('first run: setup opens in the browser language, switches to Turkish, saves tools', async () => {
  const r = await visit(chrome, base, '/your/shops/me/orders');
  assert.equal(r.title1, 'Choose your language', 'Chrome runs with --lang=en-US, so the setup opens in English');
  assert.equal(r.modal, 'true');
  assert.equal(r.focus, 'ob-search', 'focus starts in the language search');
  assert.equal(r.title1Tr, 'Dilinizi seçin');
  assert.equal(r.progress1, '1');
  assert.equal(r.title2, 'Hoş geldiniz');
  assert.equal(r.progress2, '2');
  assert.deepEqual(r.saved, { onboarded: true, language: 'tr', ma: false, sale: true });
  assert.equal(r.dialogGone, true);
  assert.equal(r.tabFocused, true);
});

test('transfer screen pulls data from an armed standalone script on the same tab', async () => {
  const r = await visit(chrome, base, '/your/shops/me/advertising');
  assert.equal(r.runningLabel, 'Ayrı scriptlerin yanıtı bekleniyor…');
  assert.deepEqual(r.rows, ['ads-keyword-manager']);
  assert.equal(r.result, 'Aktarıldı');
  assert.match(r.sas, /^\d{4}$/);
  assert.equal(r.sas, r.standaloneSas, 'both sides show the same check code');
  assert.equal(r.standaloneDone, true, 'the standalone script got the acknowledgement');
  assert.equal(r.stored, 'bts\narmy gift');
  assert.equal(r.storedUpdateState, false, 'update state stays behind');
  assert.equal(r.record, true);
  assert.match(r.doneLine, /Ads Keyword Manager/);
});

test('optional screenshots for visual review', { skip: !process.env.EAT_SCREENSHOTS }, async () => {
  for (const [name, pathname, width] of [['feedback', '/your/shops/me/stats/feedback-shot'], ['legacy-notice', '/your/shops/me/advertising/listings/notice-shot'], ['pack-de', '/your/shops/me/stats/pack-de'], ['pack-he-rtl', '/your/shops/me/stats/pack-he'], ['pack-fr-failed', '/your/shops/me/stats/pack-fr'], ['la-drawer', '/your/shops/me/tools/listings?eat=engine'], ['ma-drawer', '/messages/eat-engine'], ['ma-conv-drawer', '/messages/1234567890'], ['ma-conv-page', '/messages/1234567890?shot=page'], ['ma-inbox-empty', '/messages/eat-shot-inbox'], ['ma-templates', '/messages/eat-shot-templates'], ['ma-automation', '/messages/eat-shot-automation'], ['kw-drawer', '/your/shops/me/marketplace-insights/search?query=bts%20sticker&shot=drawer'], ['kw-page', '/your/shops/me/marketplace-insights/search?query=bts%20sticker&shot=page'], ['kw-saved', '/your/shops/me/marketplace-insights/search?query=bts%20sticker&shot=saved'], ['ads-drawer', '/your/shops/me/advertising/listings/drawer-shot'], ['ads-page', '/your/shops/me/advertising/listings/page-shot'], ['ads-rules', '/your/shops/me/advertising/listings/rules-shot'], ['sale-drawer', '/your/shops/me/sales-discounts/drawer-shot'], ['sale-page', '/your/shops/me/sales-discounts/ui-shot'], ['sale-engine', '/your/shops/me/sales-discounts/engine'], ['onboarding', '/your/shops/me/onboarding-shot'], ['migration', '/your/shops/me/migration-shot'],['shell-light-open', '/messages'], ['shell-dark-open', '/your/shops/me/stats'], ['shell-closed', '/your/orders/sold'], ['ws-settings-light', '/your/account'], ['ws-settings-dark', '/your/purchases'], ['whats-new', '/your/shops/me/stats/whats-new-shot'], ['ws-narrow', '/your/account', 1000], ['ws-narrow-rtl', '/your/shops/me/stats/pack-he', 1000]]) {
    // A third value is a narrower window width (the design's narrow-window layout).
    await runChrome(chrome, `${base}${pathname}`, [`--screenshot=${path.join(process.env.EAT_SCREENSHOTS, `${name}.png`)}`, ...(width ? [`--window-size=${width},800`] : [])]);
  }
});
