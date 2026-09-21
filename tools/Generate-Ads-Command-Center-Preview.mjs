import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import {
  MARKER,
  SCRIPT_PATH,
  TARGET_VERSION,
} from './Apply-Ads-Command-Center-v1.mjs';

const ROOT = resolve(import.meta.dirname, '..');
export const PREVIEW_PATH = resolve(
  ROOT,
  'docs/design/previews/ads-keyword-manager-command-center-v1.html',
);
export const AUDIT_PATH = resolve(
  ROOT,
  'docs/design/previews/ads-keyword-manager-command-center-v1.audit.json',
);

const SOURCE_IDS = Object.freeze([
  'template.shell.base-layout',
  'template.shell.site-header',
  'template.theme.tokens',
  'template.primitive.card',
  'template.primitive.button',
  'template.primitive.input',
  'template.primitive.table',
  'shadcn.dashboard.applied',
  'shadcn.blocks.application-interface',
  'shadcn.blocks.datatable',
]);

const MATCHING_KEYWORDS = Object.freeze([
  'svg teacher bundle',
  'png school mascot',
  'digital class shirt',
  'editable template tee',
  'instant download',
  'mockup bundle',
  'retro svg design',
  'digital png file',
  'teacher template',
]);
const OTHER_KEYWORDS = Object.freeze(
  Array.from({ length: 33 }, (_, index) =>
    `synthetic keyword ${String(index + 1).padStart(2, '0')}`),
);
const KEYWORDS = Object.freeze([...MATCHING_KEYWORDS, ...OTHER_KEYWORDS]);
const SYNTHETIC_WORDLIST = [
  'svg',
  'png',
  'digital',
  'template',
  '=instant download',
  '/mockup|bundle/',
].join('\n');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function safeScriptString(value) {
  return JSON.stringify(String(value))
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function syntheticRow(keyword, index) {
  const clicks = index === 0 ? 52 : index === 1 ? 30 : index === 2 ? 80 : 3 + (index % 12);
  const orders = index === 0 ? 1 : index === 1 ? 0 : index === 2 ? 2 : Math.max(1, Math.floor(clicks / 10));
  return `<tr class="wt-table__row">
    <th class="wt-table__row__cell" scope="row"><p>${keyword}</p></th>
    <td><span class="wt-table--responsive__title">Clicks</span><p>${clicks}</p></td>
    <td><span class="wt-table--responsive__title">Orders</span><p>${orders}</p></td>
    <td><label><input type="checkbox" ${index % 3 ? 'checked' : ''}><span>Enabled</span></label></td>
  </tr>`;
}

function previewDocument(source) {
  const now = Date.now();
  const canonicalSource =
    'https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/' +
    'scripts/etsy-ads-keyword-manager/Makaytron-Etsy-Ads-Keyword-Manager.user.js';

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Makaytron Etsy Ads Keyword Manager — production command center</title>
<style>
  html,body{margin:0;min-height:100%;background:#ededed;color:#171717;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  body{overflow:hidden}
  .fixture-watermark{position:fixed;left:18px;bottom:13px;color:#707070;font:750 9px/1.2 ui-sans-serif,system-ui;letter-spacing:.08em;text-transform:uppercase;z-index:2}
  #listing-detail-targeted-keywords-accordion{position:absolute;left:-12000px;top:0;width:1100px;background:#fff}
  #makaytron-ad-wordlist{top:24px!important;right:12px!important}
</style>
<script>
(() => {
  const store = new Map([
    ['adWordlist', ${JSON.stringify(SYNTHETIC_WORDLIST)}],
    ['adWordlistLanguage', 'tr'],
    ['adWordlistPanelCollapsed', false],
    ['adKeywordManagerScriptUpdateState', { lastCheckedAt: ${now}, lastStatus: 'current', latestVersion: '${TARGET_VERSION}' }],
    ['makaytron-telemetry:etsy-ads-keyword-manager:v1:enabled', false],
    ['makaytron-telemetry:etsy-ads-keyword-manager:v1:enable-pending', false]
  ]);
  let menuId = 0;
  globalThis.GM = {
    getValue: async (key, fallback) => store.has(key) ? store.get(key) : fallback,
    setValue: async (key, value) => { store.set(key, value); },
    deleteValue: async key => { store.delete(key); },
    addValueChangeListener: () => 1,
    registerMenuCommand: () => ++menuId
  };
  globalThis.GM_info = { script: {
    version: '${TARGET_VERSION}',
    downloadURL: '${canonicalSource}',
    updateURL: '${canonicalSource}'
  }};
  globalThis.GM_registerMenuCommand = () => ++menuId;
  globalThis.GM_unregisterMenuCommand = () => {};
  globalThis.GM_addElement = (tag, attributes = {}) => {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (key === 'textContent') element.textContent = value;
      else element.setAttribute(key, String(value));
    }
    (document.head || document.documentElement).appendChild(element);
    return element;
  };
  globalThis.GM_xmlhttpRequest = options => {
    setTimeout(() => options.onload?.({
      status: 200,
      responseText: '// ==UserScript==\\n// @version ${TARGET_VERSION}\\n// ==/UserScript=='
    }), 0);
    return { abort() {} };
  };
  globalThis.GM_getValue = (key, fallback) => store.has(key) ? store.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => store.set(key, value);
  globalThis.GM_deleteValue = key => store.delete(key);
  window.confirm = () => false;
  window.open = () => null;

  const view = new URL(location.href).searchParams.get('view') || 'panel';
  const settle = () => {
    const panel = document.getElementById('makaytron-ad-wordlist');
    if (!panel) return false;
    const state = panel.querySelector('[data-panel-state]')?.dataset.state;
    if (!['ready', 'warning', 'success'].includes(state)) return false;
    document.getElementById('makaytron-ad-wordlist-toasts')?.remove();
    if (view === 'modal' && !document.getElementById('makaytron-ad-wordlist-editor')) {
      panel.querySelector('[data-action="edit"]')?.click();
      return false;
    }
    if (view === 'modal' && !document.getElementById('makaytron-ad-wordlist-editor')) return false;
    document.documentElement.setAttribute('data-fixture-ready', view);
    return true;
  };
  const readyTimer = setInterval(() => {
    if (settle()) clearInterval(readyTimer);
  }, 40);
  setTimeout(settle, 0);
})();
</script>
</head>
<body>
  <div class="fixture-watermark">Ağ erişimi kapalı · tamamen sentetik önizleme</div>
  <section id="listing-detail-targeted-keywords-accordion">
    <table>
      <thead><tr><th>Keyword</th><th>Clicks</th><th>Orders</th><th>Status</th></tr></thead>
      <tbody>${KEYWORDS.map(syntheticRow).join('\n')}</tbody>
    </table>
    <nav aria-label="Pagination">
      <button type="button">1 / 7</button>
      <button type="button" aria-current="true">2 / 7</button>
      <button type="button">3 / 7</button>
    </nav>
  </section>
  <script>
    (0, eval)(${safeScriptString(source)});
  </script>
</body>
</html>`;
}

export async function generateAdsCommandCenterPreview() {
  const source = await readFile(SCRIPT_PATH, 'utf8');
  if (!source.includes(MARKER)) {
    throw new Error('Ads command-center marker is missing from the production userscript.');
  }
  if (!source.includes(`// @version      ${TARGET_VERSION}`)) {
    throw new Error(`Production Ads userscript is not version ${TARGET_VERSION}.`);
  }
  const html = previewDocument(source);
  const audit = {
    schemaVersion: 2,
    generatedAt: '2026-09-02',
    generatedBy: 'tools/Generate-Ads-Command-Center-Preview.mjs',
    dataClassification: 'fully_synthetic',
    networkDependency: false,
    liveEtsyWrite: false,
    productionDomUsed: true,
    sourceIds: SOURCE_IDS,
    blockVariants: [
      'Application Interface 2',
      'Data Table 2',
    ],
    toastMapping: 'N/A — this redesign does not add or modify transient feedback.',
    expectedPanelStats: {
      page: '2 / 7',
      rows: 42,
      matches: 9,
      highRatio: 3,
    },
    views: {
      panel: '?view=panel',
      modal: '?view=modal',
    },
    productionSourceSha256: sha256(source),
    previewSha256: sha256(html),
  };
  await mkdir(dirname(PREVIEW_PATH), { recursive: true });
  await writeFile(PREVIEW_PATH, html, 'utf8');
  await writeFile(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  return { previewPath: PREVIEW_PATH, auditPath: AUDIT_PATH, audit };
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) {
  generateAdsCommandCenterPreview()
    .then(result => {
      process.stdout.write(`${result.previewPath}\n${result.auditPath}\n`);
    })
    .catch(error => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}
