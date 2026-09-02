import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

const ROOT = resolve(import.meta.dirname, '..');
export const SCRIPT_PATH = resolve(
  ROOT,
  'scripts/etsy-ads-keyword-manager/Makaytron-Etsy-Ads-Keyword-Manager.user.js',
);
export const MARKER = '/* MKUI Ads Command Center v1 — registered-source adaptation. */';
export const SOURCE_VERSION = '1.0.4';
export const TARGET_VERSION = '1.0.5';

const TR_ANCHOR = "            updateWordlist: 'Listeyi güncelle',\n            checkScriptUpdate: 'Sürümü denetle',";
const TR_INSERT = "            updateWordlist: 'Listeyi güncelle',\n            commandCurrentPageTitle: 'Bu sayfa',\n            commandCurrentPageDescription: 'Yalnızca şu anda açık olan sayfadaki eşleşmeleri yönetir.',\n            commandAllPagesTitle: 'Tüm sayfalar',\n            commandAllPagesDescription: 'Eşleşen anahtar kelimeleri sayfalar arasında kontrollü olarak kapatır.',\n            commandWordlistTitle: 'Kelime listesi',\n            commandWordlistDescription: 'Filtreleri düzenleyin veya güvenli varsayılan listeyi yeniden alın.',\n            editRuleList: 'Listeyi düzenle',\n            refreshDefaultList: 'Varsayılanı güncelle',\n            checkScriptUpdate: 'Sürümü denetle',";
const EN_ANCHOR = "            updateWordlist: 'Update list',\n            checkScriptUpdate: 'Check version',";
const EN_INSERT = "            updateWordlist: 'Update list',\n            commandCurrentPageTitle: 'This page',\n            commandCurrentPageDescription: 'Manage matches only on the page that is currently open.',\n            commandAllPagesTitle: 'All pages',\n            commandAllPagesDescription: 'Disable matching keywords across pages in a controlled sequence.',\n            commandWordlistTitle: 'Keyword list',\n            commandWordlistDescription: 'Edit filters or retrieve the safe default list again.',\n            editRuleList: 'Edit list',\n            refreshDefaultList: 'Update defaults',\n            checkScriptUpdate: 'Check version',";
const LANGUAGE_ANCHOR = "        setText('[data-action-label=\"close-page\"]', t('closeCurrentPage'));\n        setText('[data-action-label=\"open-page\"]', t('openCurrentPage'));\n        setText('[data-action-label=\"close-all\"]', t('closeAllPages'));\n        setText('[data-action-label=\"edit\"]', t('editWordlist'));\n        setText('[data-action-label=\"update\"]', t('updateWordlist'));\n        setText('[data-current-page-label]', t('currentPage'));\n        setText('[data-all-pages-label]', t('allPages'));\n        setText('[data-safe-mode]', t('safeMatchMode'));";
const LANGUAGE_INSERT = "        setText('[data-command-title=\"current-page\"]', t('commandCurrentPageTitle'));\n        setText('[data-command-description=\"current-page\"]', t('commandCurrentPageDescription'));\n        setText('[data-command-title=\"all-pages\"]', t('commandAllPagesTitle'));\n        setText('[data-command-description=\"all-pages\"]', t('commandAllPagesDescription'));\n        setText('[data-command-title=\"wordlist\"]', t('commandWordlistTitle'));\n        setText('[data-command-description=\"wordlist\"]', t('commandWordlistDescription'));\n        setText('[data-action-label=\"close-page\"]', t('closeCurrentPage'));\n        setText('[data-action-label=\"open-page\"]', t('openCurrentPage'));\n        setText('[data-action-label=\"close-all\"]', t('closeAllPages'));\n        setText('[data-action-label=\"edit\"]', t('editRuleList'));\n        setText('[data-action-label=\"update\"]', t('refreshDefaultList'));\n        setText('[data-current-page-label]', t('currentPage'));\n        setText('[data-all-pages-label]', t('allPages'));\n        setText('[data-safe-mode]', t('safeMatchMode'));";
const MARKUP_ANCHOR = "                    <div class=\"maw-actions\">\n                        <button type=\"button\" class=\"maw-primary\" data-action=\"close-page\" data-busy-action>${uiIcon('power')}<span data-action-label=\"close-page\">${t('closeCurrentPage')}</span></button>\n                        <button type=\"button\" class=\"maw-secondary\" data-action=\"open-page\" data-busy-action>${uiIcon('check')}<span data-action-label=\"open-page\">${t('openCurrentPage')}</span></button>\n                        <button type=\"button\" class=\"maw-warning maw-wide\" data-action=\"close-all\" data-busy-action>${uiIcon('layers')}<span data-action-label=\"close-all\">${t('closeAllPages')}</span></button>\n                        <button type=\"button\" class=\"maw-secondary\" data-action=\"edit\" data-busy-action>${uiIcon('edit')}<span data-action-label=\"edit\">${t('editWordlist')}</span></button>\n                        <button type=\"button\" class=\"maw-secondary\" data-action=\"update\" data-busy-action>${uiIcon('refresh')}<span data-action-label=\"update\">${t('updateWordlist')}</span></button>\n                    </div>\n                    <div class=\"maw-help\"><span class=\"maw-key\">Ctrl Space</span> <span data-current-page-label>${t('currentPage')}</span> · <span class=\"maw-key\">Ctrl Alt K</span> <span data-all-pages-label>${t('allPages')}</span></div>";
const MARKUP_INSERT = "                    <div class=\"maw-command-stack\">\n                        <section class=\"maw-command-card\" data-command-scope=\"current-page\">\n                            <div class=\"maw-command-head\">\n                                <div class=\"maw-command-icon\">${uiIcon('power')}</div>\n                                <div class=\"maw-command-copy\"><div class=\"maw-command-title\" data-command-title=\"current-page\">${t('commandCurrentPageTitle')}</div><div class=\"maw-command-description\" data-command-description=\"current-page\">${t('commandCurrentPageDescription')}</div></div>\n                                <kbd class=\"maw-command-key\">Ctrl Space</kbd><span data-current-page-label hidden>${t('currentPage')}</span>\n                            </div>\n                            <div class=\"maw-command-actions\">\n                                <button type=\"button\" class=\"maw-primary\" data-action=\"close-page\" data-busy-action>${uiIcon('power')}<span data-action-label=\"close-page\">${t('closeCurrentPage')}</span></button>\n                                <button type=\"button\" class=\"maw-secondary\" data-action=\"open-page\" data-busy-action>${uiIcon('check')}<span data-action-label=\"open-page\">${t('openCurrentPage')}</span></button>\n                            </div>\n                        </section>\n                        <section class=\"maw-command-card\" data-command-scope=\"all-pages\" data-tone=\"warning\">\n                            <div class=\"maw-command-head\">\n                                <div class=\"maw-command-icon\">${uiIcon('layers')}</div>\n                                <div class=\"maw-command-copy\"><div class=\"maw-command-title\" data-command-title=\"all-pages\">${t('commandAllPagesTitle')}</div><div class=\"maw-command-description\" data-command-description=\"all-pages\">${t('commandAllPagesDescription')}</div></div>\n                                <kbd class=\"maw-command-key\">Ctrl Alt K</kbd><span data-all-pages-label hidden>${t('allPages')}</span>\n                            </div>\n                            <div class=\"maw-command-actions maw-command-actions-single\">\n                                <button type=\"button\" class=\"maw-warning\" data-action=\"close-all\" data-busy-action>${uiIcon('layers')}<span data-action-label=\"close-all\">${t('closeAllPages')}</span></button>\n                            </div>\n                        </section>\n                        <section class=\"maw-command-card maw-command-card-no-key\" data-command-scope=\"wordlist\">\n                            <div class=\"maw-command-head\">\n                                <div class=\"maw-command-icon\">${uiIcon('edit')}</div>\n                                <div class=\"maw-command-copy\"><div class=\"maw-command-title\" data-command-title=\"wordlist\">${t('commandWordlistTitle')}</div><div class=\"maw-command-description\" data-command-description=\"wordlist\">${t('commandWordlistDescription')}</div></div>\n                            </div>\n                            <div class=\"maw-command-actions\">\n                                <button type=\"button\" class=\"maw-secondary\" data-action=\"edit\" data-busy-action>${uiIcon('edit')}<span data-action-label=\"edit\">${t('editRuleList')}</span></button>\n                                <button type=\"button\" class=\"maw-secondary\" data-action=\"update\" data-busy-action>${uiIcon('refresh')}<span data-action-label=\"update\">${t('refreshDefaultList')}</span></button>\n                            </div>\n                        </section>\n                    </div>";
const COMMAND_CENTER_CSS = "\n\n        /* MKUI Ads Command Center v1 — registered-source adaptation. */\n        /*\n         * Registered design sources:\n         * - template.shell.base-layout\n         * - template.shell.site-header\n         * - template.theme.tokens\n         * - template.primitive.card\n         * - template.primitive.button\n         * - template.primitive.input\n         * - template.primitive.table\n         * - shadcn.dashboard.applied\n         * - shadcn.blocks.application-interface — Application Interface 2\n         * - shadcn.blocks.datatable — Data Table 2\n         * Toast mapping: N/A — this pass does not add or change transient feedback.\n         */\n        #${PANEL_ROOT_ID}{right:16px;top:80px;width:min(464px,calc(100vw - 24px));max-width:calc(100vw - 24px)}\n        #${PANEL_ROOT_ID} .maw-card{max-height:calc(100dvh - 96px);border-radius:16px;background:#f7f7f7;box-shadow:0 1px 2px rgba(0,0,0,.04),0 18px 48px rgba(0,0,0,.16)}\n        #${PANEL_ROOT_ID} .maw-head{min-height:76px;padding:12px 14px;position:sticky;top:0;z-index:5;background:rgba(255,255,255,.96);backdrop-filter:blur(14px)}\n        #${PANEL_ROOT_ID} .maw-logo-shell{width:38px;height:38px}\n        #${PANEL_ROOT_ID} .maw-logo{width:38px}\n        #${PANEL_ROOT_ID} .maw-title{font-size:14px;line-height:1.2}\n        #${PANEL_ROOT_ID} .maw-sub{max-width:205px;margin-top:2px;font-size:11px}\n        #${PANEL_ROOT_ID} .maw-head-tools{gap:8px}\n        #${PANEL_ROOT_ID} .maw-head-meta{gap:4px}\n        #${PANEL_ROOT_ID} .maw-version,#${PANEL_ROOT_ID} .maw-pill{height:21px;padding:0 8px;font-size:10px}\n        #${PANEL_ROOT_ID} .maw-body{padding:14px;background:#f7f7f7}\n        #${PANEL_ROOT_ID} .maw-status-card{margin-bottom:10px;padding:11px 12px;border-radius:12px}\n        #${PANEL_ROOT_ID} .maw-status-icon{width:30px;height:30px;border-radius:8px}\n        #${PANEL_ROOT_ID} .maw-status-title{font-size:12.5px}\n        #${PANEL_ROOT_ID} .maw-status-text{font-size:11.5px}\n        #${PANEL_ROOT_ID} .maw-grid{margin-bottom:10px;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}\n        #${PANEL_ROOT_ID} .maw-chip{min-height:66px;padding:10px 11px;border-radius:11px}\n        #${PANEL_ROOT_ID} .maw-label{font-size:9.5px}\n        #${PANEL_ROOT_ID} .maw-value{font-size:15px}\n        #${PANEL_ROOT_ID} .maw-command-stack{display:grid;gap:9px}\n        #${PANEL_ROOT_ID} .maw-command-card{padding:10px;border:1px solid var(--maw-border);border-radius:12px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.025)}\n        #${PANEL_ROOT_ID} .maw-command-card[data-tone='warning']{border-color:#eed69a;background:#fffaf0}\n        #${PANEL_ROOT_ID} .maw-command-head{display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:start;gap:9px}\n        #${PANEL_ROOT_ID} .maw-command-card-no-key .maw-command-head{grid-template-columns:30px minmax(0,1fr)}\n        #${PANEL_ROOT_ID} .maw-command-icon{width:30px;height:30px;display:grid;place-items:center;border:1px solid var(--maw-border);border-radius:8px;background:var(--maw-muted);color:#262626}\n        #${PANEL_ROOT_ID} .maw-command-card[data-tone='warning'] .maw-command-icon{border-color:#eed69a;background:#fff4cf;color:#8a5a00}\n        #${PANEL_ROOT_ID} .maw-command-copy{min-width:0;padding-top:1px}\n        #${PANEL_ROOT_ID} .maw-command-title{color:#262626;font-size:12.5px;font-weight:750;line-height:1.25}\n        #${PANEL_ROOT_ID} .maw-command-description{margin-top:2px;color:#737373;font-size:10.8px;line-height:1.35}\n        #${PANEL_ROOT_ID} .maw-command-key{align-self:center;padding:4px 7px;border:1px solid #d7d7d7;border-bottom-width:2px;border-radius:6px;background:#fff;color:#525252;font:650 10px/1.1 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}\n        #${PANEL_ROOT_ID} .maw-command-actions{margin-top:9px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}\n        #${PANEL_ROOT_ID} .maw-command-actions-single{grid-template-columns:1fr}\n        #${PANEL_ROOT_ID} .maw-command-actions>button{width:100%;min-width:0;min-height:39px;height:auto;padding:8px 10px;line-height:1.25;white-space:normal}\n        #${PANEL_ROOT_ID} .maw-command-actions>button>span{min-width:0;overflow-wrap:anywhere}\n        #${PANEL_ROOT_ID} .maw-warning{background:#fff;color:#8a5a00}\n        #${PANEL_ROOT_ID} .maw-command-card[data-tone='warning'] .maw-warning{border-color:#e5bd58;background:#fffdf8}\n        #${PANEL_ROOT_ID} .maw-footer{margin-top:11px;padding-top:10px}\n        #${PANEL_ROOT_ID} button:hover:not(:disabled){transform:translateY(-1px)}\n        #${PANEL_ROOT_ID} button{transition:background-color .14s ease,border-color .14s ease,color .14s ease,box-shadow .14s ease,transform .14s ease}\n\n        .maw-modal{width:min(960px,calc(100vw - 40px));max-height:calc(100dvh - 48px);border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.28)}\n        .maw-modal-head{min-height:64px;padding:12px 16px}\n        .maw-modal-body{display:grid;grid-template-columns:minmax(300px,356px) minmax(0,1fr);align-items:start;gap:12px;padding:16px}\n        .maw-modal-note{grid-column:1/-1;margin-bottom:0;border-radius:9px}\n        .maw-rule-form-card,.maw-rule-list-card{min-width:0;border-radius:10px}\n        .maw-rule-list-card{margin-top:0}\n        .maw-form-grid{grid-template-columns:1fr;gap:10px}\n        .maw-rule-submit{width:100%}\n        .maw-rule-form-meta{align-items:flex-start;flex-wrap:wrap}\n        .maw-cancel-edit{margin-left:auto}\n        .maw-rule-list{max-height:min(430px,calc(100dvh - 292px))}\n        .maw-modal-footer{min-height:64px;padding:12px 16px}\n\n        @media(max-width:860px){\n            #${PANEL_ROOT_ID}{top:auto;right:12px;bottom:12px;left:12px;width:auto;max-width:none}\n            #${PANEL_ROOT_ID}.is-collapsed{top:auto;right:0;bottom:88px;left:auto;width:62px}\n            #${PANEL_ROOT_ID} .maw-card{max-height:calc(100dvh - 24px)}\n            .maw-modal-backdrop{padding:10px}\n            .maw-modal{width:100%;max-height:calc(100dvh - 20px)}\n            .maw-modal-body{grid-template-columns:1fr;padding:12px}\n            .maw-modal-note{grid-column:auto}\n            .maw-rule-list-card{margin-top:0}\n            .maw-rule-list{max-height:40vh}\n        }\n        @media(max-width:440px){\n            #${PANEL_ROOT_ID} .maw-head{padding:10px 11px}\n            #${PANEL_ROOT_ID} .maw-logo-shell,#${PANEL_ROOT_ID} .maw-logo{width:34px}\n            #${PANEL_ROOT_ID} .maw-sub{max-width:145px}\n            #${PANEL_ROOT_ID} .maw-body{padding:10px}\n            #${PANEL_ROOT_ID} .maw-command-head{grid-template-columns:28px minmax(0,1fr)}\n            #${PANEL_ROOT_ID} .maw-command-key{grid-column:2;justify-self:start;margin-top:2px}\n            #${PANEL_ROOT_ID} .maw-command-actions{grid-template-columns:1fr}\n            #${PANEL_ROOT_ID} .maw-footer{align-items:flex-start}\n            #${PANEL_ROOT_ID} .maw-footer-tools{flex-wrap:wrap}\n            .maw-modal-footer{flex-wrap:wrap}\n            .maw-modal-status{width:100%;margin:0 0 4px}\n            .maw-modal-footer>button{flex:1}\n        }\n        @media(prefers-reduced-motion:reduce){\n            #${PANEL_ROOT_ID},#${PANEL_ROOT_ID} *,.maw-modal,.maw-modal *{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}\n            #${PANEL_ROOT_ID} button:hover:not(:disabled){transform:none}\n        }\n";

const PROTECTED_METADATA_KEYS = Object.freeze([
  'name', 'name:tr', 'name:en', 'namespace', 'author', 'license', 'homepageURL',
  'supportURL', 'updateURL', 'downloadURL', 'match', 'grant', 'connect', 'noframes',
  'run-at',
]);

function metadataBlock(source) {
  return source.match(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==/m)?.[0] || '';
}

function metadataValues(source, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...metadataBlock(source).matchAll(new RegExp(`^\\/\\/ @${escaped}(?:\\s+(.+))?$`, 'gm'))]
    .map(match => (match[1] || '').trim());
}

function protectedMetadataSnapshot(source) {
  return Object.fromEntries(PROTECTED_METADATA_KEYS.map(key => [key, metadataValues(source, key)]));
}

function dataHookSignature(source) {
  return [...new Set(
    [...source.matchAll(/\bdata-([a-z0-9_-]+)(?:\s*=|\s|>)/gi)].map(match => match[1]),
  )].sort();
}

function exactReplace(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Expected exactly one ${label} anchor, found ${count}.`);
  return source.replace(before, after);
}

function findTemplateLiteralEnd(source, start) {
  let escaped = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '`') return index;
  }
  throw new Error('Unable to locate the closing backtick for the primary MKUI style layer.');
}

function insertPresentationLayer(source) {
  const themeMarker = '// ─── Makaytron UI theme';
  const themeIndex = source.indexOf(themeMarker);
  if (themeIndex < 0) throw new Error('Primary MKUI theme section is missing.');
  const callIndex = source.indexOf('addStyle(`', themeIndex);
  if (callIndex < 0) throw new Error('Primary addStyle template is missing.');
  if (source.indexOf('addStyle(`', callIndex + 1) >= 0) {
    throw new Error('Expected one primary addStyle template in the Ads userscript.');
  }
  const openingBacktick = callIndex + 'addStyle('.length;
  const closingBacktick = findTemplateLiteralEnd(source, openingBacktick);
  return `${source.slice(0, closingBacktick)}${COMMAND_CENTER_CSS}${source.slice(closingBacktick)}`;
}

function assertMigration(before, after) {
  if (JSON.stringify(protectedMetadataSnapshot(before)) !== JSON.stringify(protectedMetadataSnapshot(after))) {
    throw new Error('Protected userscript metadata changed during the presentation migration.');
  }
  const beforeHooks = dataHookSignature(before);
  const afterHooks = new Set(dataHookSignature(after));
  const removedHooks = beforeHooks.filter(hook => !afterHooks.has(hook));
  if (removedHooks.length) throw new Error(`Behavioral data hooks were removed: ${removedHooks.join(', ')}`);
  if ((after.match(new RegExp(MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length !== 1) {
    throw new Error('Command-center marker must appear exactly once in production output.');
  }
  if (!after.includes(`// @version      ${TARGET_VERSION}`)) throw new Error('Metadata version was not finalized.');
  if (!after.includes(`const APP_VERSION = '${TARGET_VERSION}';`)) throw new Error('APP_VERSION was not finalized.');
  for (const action of ['close-page', 'open-page', 'close-all', 'edit', 'update']) {
    if (!after.includes(`data-action="${action}"`)) throw new Error(`Protected action hook is missing: ${action}`);
  }
  if (after.includes(':has(')) throw new Error('The production presentation layer must not rely on :has().');
}

export function applyAdsCommandCenter(source) {
  if (source.includes(MARKER)) {
    assertMigration(source, source);
    return source;
  }
  let output = source;
  output = exactReplace(output, `// @version      ${SOURCE_VERSION}`, `// @version      ${TARGET_VERSION}`, 'metadata version');
  output = exactReplace(output, `const APP_VERSION = '${SOURCE_VERSION}';`, `const APP_VERSION = '${TARGET_VERSION}';`, 'APP_VERSION');
  output = exactReplace(output, TR_ANCHOR, TR_INSERT, 'Turkish command copy');
  output = exactReplace(output, EN_ANCHOR, EN_INSERT, 'English command copy');
  output = exactReplace(output, LANGUAGE_ANCHOR, LANGUAGE_INSERT, 'panel language bridge');
  output = exactReplace(output, MARKUP_ANCHOR, MARKUP_INSERT, 'production command markup');
  output = insertPresentationLayer(output);
  assertMigration(source, output);
  return output;
}

async function main() {
  const write = process.argv.includes('--write');
  const source = await readFile(SCRIPT_PATH, 'utf8');
  const output = applyAdsCommandCenter(source);
  if (output === source) {
    process.stdout.write('Ads command center is already applied.\n');
    return;
  }
  if (!write) {
    process.stdout.write('Ads command center update is required. Run with --write.\n');
    process.exitCode = 2;
    return;
  }
  await writeFile(SCRIPT_PATH, output, 'utf8');
  process.stdout.write('Ads command center production migration applied.\n');
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
