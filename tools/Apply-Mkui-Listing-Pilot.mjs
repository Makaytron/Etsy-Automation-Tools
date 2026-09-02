import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
const scriptPath = path.join(repoRoot, 'scripts/etsy-listing-analyzer/Makaytron-Etsy-Listing-Analyzer.user.js');
const auditPath = path.join(repoRoot, 'docs/design/previews/listing-analyzer-source-audit.json');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function count(text, needle) {
  let total = 0;
  let at = 0;
  while ((at = text.indexOf(needle, at)) >= 0) {
    total += 1;
    at += needle.length;
  }
  return total;
}

function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from);
  assert(first >= 0, `Missing Listing Analyzer MKUI anchor: ${label}`);
  assert(text.indexOf(from, first + from.length) < 0, `Ambiguous Listing Analyzer MKUI anchor: ${label}`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

function metadataBlock(source) {
  return source.match(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==/m)?.[0] || '';
}

function protectedMetadata(source) {
  return metadataBlock(source)
    .split(/\r?\n/)
    .filter((line) => line.startsWith('// @') && !line.startsWith('// @version'))
    .join('\n');
}

function countedSignature(text, regex, normalize = (value) => value) {
  const counts = new Map();
  for (const match of text.matchAll(regex)) {
    const key = normalize(match[0]);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const rows = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  return sha256(JSON.stringify(rows));
}

function dataSignature(source) {
  return countedSignature(source, /\bdata-[a-z0-9-]+\b/gi, (value) => value.toLowerCase());
}

function meliClassSignature(source) {
  return countedSignature(source, /\bmeli-[a-z0-9-]+\b/gi, (value) => value.toLowerCase());
}

const original = read(scriptPath);
const audit = JSON.parse(read(auditPath));
const alreadyApplied = original.includes('// @version      1.2.3')
  && original.includes("const APP_VERSION = '1.2.3';")
  && original.includes("const MKUI_VERSION = '1.0.0';")
  && original.includes('/* MKUI v1 canonical Dashboard Shell compatibility layer. */')
  && original.includes('--meli-radius-xl:18px')
  && original.includes('--meli-shadow-modal:0 25px 50px -12px rgba(0,0,0,.26)');

let output = original;

if (!alreadyApplied) {
  assert(audit?.source?.sha256, 'Listing Analyzer baseline audit is missing a source hash');
  assert(audit?.source?.dataAttributeSignatureSha256, 'Listing Analyzer baseline audit is missing a data hook signature');
  assert(audit?.source?.meliClassSignatureSha256, 'Listing Analyzer baseline audit is missing a class signature');
  assert(sha256(original) === audit.source.sha256, 'Listing Analyzer source drifted after the recorded baseline audit');
  assert(original.includes('// @version      1.2.2'), 'Unexpected Listing Analyzer userscript baseline version');
  assert(original.includes("const APP_VERSION = '1.2.2';"), 'Unexpected Listing Analyzer runtime baseline version');
  assert(count(original, 'const STYLES = `') === 1, 'Expected exactly one Listing Analyzer STYLES layer');
  assert((original.match(/attachShadow\s*\(\s*\{\s*mode\s*:\s*['"]open['"]\s*\}\s*\)/g) || []).length === 1, 'Expected exactly one open Shadow DOM mount');
  assert(!/attachShadow\s*\(\s*\{\s*mode\s*:\s*['"]closed['"]/.test(original), 'Listing Analyzer unexpectedly contains a closed Shadow DOM mount');

  output = replaceOnce(output, '// @version      1.2.2', '// @version      1.2.3', 'userscript version');
  output = replaceOnce(
    output,
    "    const APP_VERSION = '1.2.2';",
    "    const APP_VERSION = '1.2.3';\n    const MKUI_VERSION = '1.0.0';",
    'runtime version marker',
  );

  output = replaceOnce(
    output,
    `:host{all:initial;--meli-bg:#fff;--meli-fg:#171717;--meli-muted:#f7f7f7;--meli-muted-2:#f2f2f2;--meli-muted-fg:#737373;--meli-border:#e7e7e7;--meli-input:#dedede;--meli-primary:#1f1f1f;--meli-primary-fg:#fafafa;--meli-danger:#b91c1c;--meli-danger-soft:#fff1f1;--meli-warning:#8a5a00;--meli-warning-soft:#fff8ed;--meli-success:#276749;--success:var(--meli-success);--meli-success-soft:#eef8f1;--meli-shadow:0 1px 3px rgba(15,23,42,.08),0 18px 44px rgba(15,23,42,.13);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--meli-fg);font-variant-numeric:tabular-nums}`,
    `:host{all:initial;--meli-bg:#f7f7f7;--meli-surface:#fff;--meli-fg:#171717;--meli-muted:#f2f2f2;--meli-muted-2:#ededed;--meli-muted-fg:#595959;--meli-border:#dedede;--meli-input:#cfcfcf;--meli-primary:#1f1f1f;--meli-primary-strong:#0f0f0f;--meli-primary-fg:#fafafa;--meli-danger:#b42318;--meli-danger-soft:#fff1f0;--meli-warning:#8a5a00;--meli-warning-soft:#fff9df;--meli-success:#1f7a4d;--success:var(--meli-success);--meli-success-soft:#edf8f1;--meli-radius-sm:7px;--meli-radius-md:10px;--meli-radius-lg:14px;--meli-radius-xl:18px;--meli-radius-pill:999px;--meli-shadow-card:0 1px 2px rgba(0,0,0,.04);--meli-shadow:0 1px 3px rgba(0,0,0,.08),0 18px 44px rgba(0,0,0,.14);--meli-shadow-modal:0 25px 50px -12px rgba(0,0,0,.26);--meli-focus:0 0 0 3px rgba(23,23,23,.14);font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--meli-fg);font-variant-numeric:tabular-nums}`,
    'canonical MKUI semantic tokens',
  );

  output = replaceOnce(
    output,
    '/* Premium monochrome surfaces and a legible numeric scale. */',
    '/* MKUI v1 canonical Dashboard Shell compatibility layer. */',
    'dashboard compatibility marker',
  );
  output = replaceOnce(
    output,
    ':host{--meli-muted:#f5f5f5;--meli-muted-2:#eeeeee;--meli-muted-fg:#595959;--meli-border:#dedede;--meli-input:#cfcfcf;--meli-warning-soft:#fff;--meli-success-soft:#fff;--meli-danger-soft:#fff;--meli-shadow:0 1px 3px rgba(0,0,0,.08),0 18px 44px rgba(0,0,0,.14)}',
    ':host{--meli-bg:#f7f7f7;--meli-surface:#fff;--meli-muted:#f2f2f2;--meli-muted-2:#ededed;--meli-muted-fg:#595959;--meli-border:#dedede;--meli-input:#cfcfcf;--meli-warning-soft:#fff9df;--meli-success-soft:#edf8f1;--meli-danger-soft:#fff1f0;--meli-shadow-card:0 1px 2px rgba(0,0,0,.04);--meli-shadow:0 1px 3px rgba(0,0,0,.08),0 18px 44px rgba(0,0,0,.14);--meli-shadow-modal:0 25px 50px -12px rgba(0,0,0,.26);--meli-focus:0 0 0 3px rgba(23,23,23,.14)}',
    'dashboard compatibility tokens',
  );

  const replacements = [
    [
      '.meli-panel{position:fixed;z-index:2147483645;top:12px;right:12px;bottom:12px;width:min(620px,calc(100vw - 24px));display:grid;grid-template-columns:60px minmax(0,1fr);grid-template-rows:60px minmax(0,1fr);overflow:hidden;border:1px solid var(--meli-border);border-radius:12px;background:var(--meli-bg);box-shadow:var(--meli-shadow);',
      '.meli-panel{position:fixed;z-index:2147483645;top:12px;right:12px;bottom:12px;width:min(620px,calc(100vw - 24px));display:grid;grid-template-columns:60px minmax(0,1fr);grid-template-rows:60px minmax(0,1fr);overflow:hidden;border:1px solid var(--meli-border);border-radius:var(--meli-radius-lg);background:var(--meli-surface);box-shadow:var(--meli-shadow);',
      'dashboard shell',
    ],
    ['.meli-logo-link{border-radius:7px;text-decoration:none}', '.meli-logo-link{border-radius:var(--meli-radius-sm);text-decoration:none}', 'brand link radius'],
    ['.meli-logo-link:focus-visible{outline:2px solid #171717;outline-offset:3px}', '.meli-logo-link:focus-visible{outline:0;box-shadow:var(--meli-focus)}', 'brand focus ring'],
    ['border-radius:999px;background:var(--meli-muted);color:#525252;font-size:10px;font-weight:700}.meli-head-actions', 'border-radius:var(--meli-radius-pill);background:var(--meli-muted);color:#525252;font-size:10px;font-weight:700}.meli-head-actions', 'version pill'],
    ['border-radius:7px;background:#fff;color:#525252;cursor:pointer;display:inline-flex', 'border-radius:var(--meli-radius-sm);background:var(--meli-surface);color:#525252;cursor:pointer;display:inline-flex', 'header controls'],
    ['border:1px solid transparent;border-radius:7px;background:transparent;color:#737373;', 'border:1px solid transparent;border-radius:var(--meli-radius-sm);background:transparent;color:#737373;', 'navigation item'],
    ['.meli-main{grid-column:2;grid-row:2;min-width:0;overflow:auto;overscroll-behavior:contain;padding:18px;background:var(--meli-muted)}', '.meli-main{grid-column:2;grid-row:2;min-width:0;overflow:auto;overscroll-behavior:contain;padding:18px;background:var(--meli-bg)}', 'dashboard content surface'],
    ['.meli-main{background:#f5f5f5}', '.meli-main{background:var(--meli-bg)}', 'compatibility content surface'],
    ['.meli-card{overflow:hidden;border:1px solid var(--meli-border);border-radius:9px;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.04)}', '.meli-card{overflow:hidden;border:1px solid var(--meli-border);border-radius:var(--meli-radius-md);background:var(--meli-surface);box-shadow:var(--meli-shadow-card)}', 'card primitive'],
    ['.meli-status{margin-bottom:12px;padding:11px 12px;display:flex;align-items:flex-start;gap:10px;border:1px solid var(--meli-border);border-radius:9px;background:#fff}', '.meli-status{margin-bottom:12px;padding:11px 12px;display:flex;align-items:flex-start;gap:10px;border:1px solid var(--meli-border);border-radius:var(--meli-radius-md);background:var(--meli-surface)}', 'status primitive'],
    ['.meli-stat{min-width:0;padding:11px;border:1px solid var(--meli-border);border-radius:8px;background:#fff}', '.meli-stat{min-width:0;padding:11px;border:1px solid var(--meli-border);border-radius:var(--meli-radius-md);background:var(--meli-surface)}', 'stat card'],
    ['.meli-btn{min-height:36px;padding:0 12px;display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--meli-input);border-radius:7px;background:#fff;color:#171717;box-shadow:0 1px 2px rgba(0,0,0,.04);', '.meli-btn{min-height:36px;padding:0 12px;display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--meli-input);border-radius:var(--meli-radius-sm);background:var(--meli-surface);color:#171717;box-shadow:var(--meli-shadow-card);', 'button primitive'],
    ['.meli-btn.primary:hover{background:#303030}', '.meli-btn.primary:hover{background:var(--meli-primary-strong)}', 'primary button hover'],
    ['.meli-btn:focus-visible,.meli-icon:focus-visible,.meli-lang:focus-visible,.meli-nav-btn:focus-visible,.meli-input:focus-visible,.meli-select:focus-visible,.meli-textarea:focus-visible{outline:2px solid #525252;outline-offset:2px}', '.meli-btn:focus-visible,.meli-icon:focus-visible,.meli-lang:focus-visible,.meli-nav-btn:focus-visible,.meli-input:focus-visible,.meli-select:focus-visible,.meli-textarea:focus-visible{outline:0;box-shadow:var(--meli-focus)}', 'focus-visible primitive'],
    ['.meli-queue{overflow:hidden;border:1px solid var(--meli-border);border-radius:8px;background:#fff}', '.meli-queue{overflow:hidden;border:1px solid var(--meli-border);border-radius:var(--meli-radius-md);background:var(--meli-surface)}', 'queue card'],
    ['.meli-note{margin:12px 0 0;padding:10px 11px;border:1px solid #eed69a;border-radius:8px;background:var(--meli-warning-soft);', '.meli-note{margin:12px 0 0;padding:10px 11px;border:1px solid #e5c56b;border-radius:var(--meli-radius-md);background:var(--meli-warning-soft);', 'warning alert'],
    ['.meli-input,.meli-select,.meli-textarea{width:100%;border:1px solid #d9d9d9;border-radius:7px;outline:none;background:#fff;', '.meli-input,.meli-select,.meli-textarea{width:100%;border:1px solid var(--meli-input);border-radius:var(--meli-radius-sm);outline:0;background:var(--meli-surface);', 'form controls'],
    ['.meli-input:focus,.meli-select:focus,.meli-textarea:focus{border-color:#525252;box-shadow:0 0 0 3px rgba(23,23,23,.09)}', '.meli-input:focus,.meli-select:focus,.meli-textarea:focus{border-color:#525252;box-shadow:var(--meli-focus)}', 'form focus ring'],
    ['.meli-analysis-card,.meli-form-card{overflow:hidden;border:1px solid #d9d9d9;border-radius:9px;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.04)}', '.meli-analysis-card,.meli-form-card{overflow:hidden;border:1px solid var(--meli-border);border-radius:var(--meli-radius-md);background:var(--meli-surface);box-shadow:var(--meli-shadow-card)}', 'analysis and form cards'],
    ['border-radius:999px;background:#f7f7f7;color:#525252;font-size:10px;font-weight:750;', 'border-radius:var(--meli-radius-pill);background:var(--meli-surface);color:#525252;font-size:10px;font-weight:750;', 'pill primitive'],
    ['border:1px solid #e1e1e1;border-radius:6px;background:#fff;color:#404040;', 'border:1px solid var(--meli-border);border-radius:var(--meli-radius-sm);background:var(--meli-surface);color:#404040;', 'small button primitive'],
    ['.meli-field[data-edit-field]{padding:10px;border:1px solid var(--meli-border);border-radius:8px;background:#fafafa;', '.meli-field[data-edit-field]{padding:10px;border:1px solid var(--meli-border);border-radius:var(--meli-radius-md);background:var(--meli-bg);', 'editable field card'],
    ['.meli-history-item{border:1px solid var(--meli-border);border-radius:8px;padding:10px;background:#fff}', '.meli-history-item{border:1px solid var(--meli-border);border-radius:var(--meli-radius-md);padding:10px;background:var(--meli-surface)}', 'history card'],
    ['.meli-setting{padding:11px;border:1px solid var(--meli-border);border-radius:8px;background:#fff}', '.meli-setting{padding:11px;border:1px solid var(--meli-border);border-radius:var(--meli-radius-md);background:var(--meli-surface)}', 'settings card'],
    ['.meli-health-trigger:focus-visible{outline:2px solid #525252;outline-offset:2px}', '.meli-health-trigger:focus-visible{outline:0;box-shadow:var(--meli-focus)}', 'health focus ring'],
    ['.meli-analysis-card{display:flex;min-height:0;flex-direction:column;border-radius:14px;background:#f4f4f3;box-shadow:0 14px 34px rgba(15,23,42,.07)}', '.meli-analysis-card{display:flex;min-height:0;flex-direction:column;border-radius:var(--meli-radius-lg);background:var(--meli-muted);box-shadow:var(--meli-shadow-card)}', 'analysis workspace card'],
    ['.meli-listing-card{min-width:0;overflow:hidden;border:1px solid #dfdfdc;border-radius:14px;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.035);', '.meli-listing-card{min-width:0;overflow:hidden;border:1px solid var(--meli-border);border-radius:var(--meli-radius-lg);background:var(--meli-surface);box-shadow:var(--meli-shadow-card);', 'listing card'],
    ['.meli-modal{width:min(820px,calc(100vw - 32px));max-height:88vh;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--meli-border);border-radius:12px;background:#fff;box-shadow:0 25px 50px -12px rgba(0,0,0,.26)}', '.meli-modal{width:min(820px,calc(100vw - 32px));max-height:88vh;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--meli-border);border-radius:var(--meli-radius-lg);background:var(--meli-surface);box-shadow:var(--meli-shadow-modal)}', 'modal shell'],
    ['.meli-note{border-color:#cfcfcf;background:#fff;color:#404040}', '.meli-note{border-color:#e5c56b;background:var(--meli-warning-soft);color:#704900}', 'semantic warning compatibility'],
    ['.meli-status[data-tone="ready"] .meli-status-mark,.meli-status[data-tone="scanning"] .meli-status-mark,.meli-status[data-tone="blocked"] .meli-status-mark,.meli-status[data-tone="error"] .meli-status-mark{border-color:#bdbdbd;background:#fff;color:#303030}', '.meli-status[data-tone="ready"] .meli-status-mark{border-color:#a9d8be;background:var(--meli-success-soft);color:var(--meli-success)}.meli-status[data-tone="scanning"] .meli-status-mark{border-color:#e5c56b;background:var(--meli-warning-soft);color:var(--meli-warning)}.meli-status[data-tone="blocked"] .meli-status-mark,.meli-status[data-tone="error"] .meli-status-mark{border-color:#efb4ae;background:var(--meli-danger-soft);color:var(--meli-danger)}', 'semantic status compatibility'],
    ['.meli-health-cap{border:1px solid #bdbdbd;background:#fff;color:#303030}', '.meli-health-cap{border:1px solid #e5c56b;background:var(--meli-warning-soft);color:var(--meli-warning)}', 'health warning surface'],
    ['.meli-safeguards li[data-passed="true"]{color:#303030}', '.meli-safeguards li[data-passed="true"]{color:var(--meli-success)}', 'safeguard success state'],
    ['.meli-analysis-card{background:#f2f2f2;box-shadow:0 14px 34px rgba(0,0,0,.08)}', '.meli-analysis-card{background:var(--meli-muted);box-shadow:var(--meli-shadow-card)}', 'analysis compatibility surface'],
    ['.meli-listing-card{border-color:#d9d9d9;box-shadow:0 1px 2px rgba(0,0,0,.04)}', '.meli-listing-card{border-color:var(--meli-border);box-shadow:var(--meli-shadow-card)}', 'listing compatibility surface'],
    ['border:1px solid #cfcfcf;border-radius:8px;background:#fff;color:#303030;font:720 12px/1', 'border:1px solid var(--meli-input);border-radius:var(--meli-radius-sm);background:var(--meli-surface);color:#303030;font:720 12px/1', 'filter button'],
    ['border:1px solid #d8d8d8;border-radius:10px;background:#f5f5f5;overflow-y:auto', 'border:1px solid var(--meli-border);border-radius:var(--meli-radius-md);background:var(--meli-muted);overflow-y:auto', 'filter drawer'],
    ['border:1px solid #d6d6d6;border-radius:14px;background:#fff;text-align:center;box-shadow:0 14px 34px rgba(0,0,0,.06)', 'border:1px solid var(--meli-border);border-radius:var(--meli-radius-lg);background:var(--meli-surface);text-align:center;box-shadow:var(--meli-shadow-card)', 'analysis gate'],
    ['border:1px solid #d6d6d6;border-radius:18px;background:#f1f1f1;color:#303030', 'border:1px solid var(--meli-border);border-radius:var(--meli-radius-xl);background:var(--meli-muted);color:#303030', 'analysis gate icon'],
    ['border:1px solid #a3a3a3;border-radius:10px;background:#fff', 'border:1px solid #a3a3a3;border-radius:var(--meli-radius-md);background:var(--meli-surface)', 'update and storage banners'],
    ['border:1px solid #d0d0d0;border-radius:999px;background:#fff;color:#303030;font:700 10.5px/1', 'border:1px solid var(--meli-border);border-radius:var(--meli-radius-pill);background:var(--meli-surface);color:#303030;font:700 10.5px/1', 'preset pill'],
  ];

  for (const [from, to, label] of replacements) output = replaceOnce(output, from, to, label);
}

const finalProtectedMetadata = protectedMetadata(output);
assert(sha256(finalProtectedMetadata) === audit.source.protectedMetadataSha256, 'Protected Listing Analyzer userscript metadata changed');
assert(dataSignature(output) === audit.source.dataAttributeSignatureSha256, 'Listing Analyzer data-* behavioral hook signature changed');
assert(meliClassSignature(output) === audit.source.meliClassSignatureSha256, 'Listing Analyzer meli-* class signature changed');
assert((output.match(/attachShadow\s*\(\s*\{\s*mode\s*:\s*['"]open['"]\s*\}\s*\)/g) || []).length === 1, 'Open Shadow DOM contract changed');
assert(!/attachShadow\s*\(\s*\{\s*mode\s*:\s*['"]closed['"]/.test(output), 'Closed Shadow DOM was introduced');
assert(count(output, 'const STYLES = `') === 1, 'Listing Analyzer STYLES layer count changed');
assert(output.includes(':host{all:initial;--meli-bg:#f7f7f7;--meli-surface:#fff;'), 'Canonical MKUI root mapping is missing');
assert(output.includes("const MKUI_VERSION = '1.0.0';"), 'MKUI version marker is missing');
assert(output.includes('data-view="${view}"') || output.includes('data-view="${state.activeView}"') || output.includes('data-view="settings"'), 'data-view routing disappeared');
assert(output.includes('data-action="publish"') && output.includes('data-action="verify-publish"'), 'Publish action hooks disappeared');
assert(output.includes('data-action="deactivate"') && output.includes('data-action="verify-deactivate"'), 'Deactivation action hooks disappeared');
assert(output.includes('window.__MELI_TEST__ = Object.freeze({'), 'Listing Analyzer test API disappeared');

if (write && output !== original) {
  fs.writeFileSync(scriptPath, output, 'utf8');
  console.log('Applied guarded MKUI v1 Listing Analyzer presentation transform.');
} else if (alreadyApplied) {
  console.log('Listing Analyzer MKUI v1 transform already applied and verified.');
} else {
  console.log('Listing Analyzer MKUI v1 dry-run passed; no files written.');
}
