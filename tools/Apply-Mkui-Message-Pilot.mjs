import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
const scriptPath = path.join(repoRoot, 'scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function read(file) { return fs.readFileSync(file, 'utf8'); }
function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from);
  assert(first >= 0, `Missing MKUI Message Assistant anchor: ${label}`);
  assert(text.indexOf(from, first + from.length) < 0, `Ambiguous MKUI Message Assistant anchor: ${label}`);
  return text.slice(0, first) + to + text.slice(first + from.length);
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
function metadataSnapshot(text) {
  const prefixes = ['// @match', '// @grant', '// @connect', '// @updateURL', '// @downloadURL', '// @resource', '// @namespace'];
  return text.split(/\r?\n/).filter((line) => prefixes.some((prefix) => line.startsWith(prefix))).join('\n');
}
function dataSignature(text) {
  const counts = new Map();
  for (const match of text.matchAll(/data-[a-z0-9-]+/gi)) {
    const key = match[0].toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return JSON.stringify([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

const original = read(scriptPath);
const alreadyApplied = original.includes('// @version      1.2.9')
  && original.includes("const APP_VERSION = '1.2.9';")
  && original.includes("const MKUI_VERSION = '1.0.0';")
  && original.includes('--ma-accent:#525252');

let output = original;

if (!alreadyApplied) {
  const metadataBefore = metadataSnapshot(original);
  const dataBefore = dataSignature(original);
  const attachShadowBefore = count(original, 'attachShadow(');
  const closedShadowBefore = count(original, "attachShadow({ mode: 'closed' })");
  const globalCssBefore = count(original, 'const GLOBAL_CSS = `');
  const premiumCssBefore = count(original, 'const PREMIUM_CSS = `');

  assert(original.includes('// @version      1.2.8'), 'Unexpected Message Assistant baseline userscript version');
  assert(original.includes("const APP_VERSION = '1.2.8';"), 'Unexpected Message Assistant baseline runtime version');
  assert(closedShadowBefore === 1, `Expected exactly one closed Shadow DOM mount, found ${closedShadowBefore}`);
  assert(globalCssBefore === 1, `Expected one GLOBAL_CSS layer, found ${globalCssBefore}`);
  assert(premiumCssBefore === 1, `Expected one PREMIUM_CSS layer, found ${premiumCssBefore}`);

  output = replaceOnce(output, '// @version      1.2.8', '// @version      1.2.9', 'userscript version');
  output = replaceOnce(
    output,
    "    const APP_VERSION = '1.2.8';",
    "    const APP_VERSION = '1.2.9';\n    const MKUI_VERSION = '1.0.0';",
    'runtime version marker',
  );

  output = replaceOnce(
    output,
    ':host{--ma-primary:#17213a;--ma-primary-strong:#0d1528;--ma-primary-soft:#edf1f8;--ma-accent:#b58a4a;--ma-accent-soft:#fbf5e9;--ma-ink:#172033;--ma-muted:#606a7b;--ma-line:#e1e6ef;--ma-bg:#f3f5f9;--ma-surface:#fff;--ma-success:#0f6b44;--ma-success-soft:#e7f6ef;--ma-warning:#8a490e;--ma-warning-soft:#fff4df;--ma-danger:#a4313b;--ma-danger-soft:#fff0f1;--ma-info:#47556d;--ma-info-soft:#eef2f7;--ma-shadow:0 30px 90px rgba(12,22,43,.22);--ma-shadow-soft:0 12px 32px rgba(18,31,54,.09);--ma-r1:9px;--ma-r2:13px;--ma-r3:19px}',
    ':host{--ma-primary:#1f1f1f;--ma-primary-strong:#0f0f0f;--ma-primary-soft:#f2f2f2;--ma-accent:#525252;--ma-accent-soft:#f5f5f5;--ma-ink:#171717;--ma-muted:#595959;--ma-line:#dedede;--ma-bg:#f5f5f5;--ma-surface:#fff;--ma-success:#1f7a4d;--ma-success-soft:#edf8f1;--ma-warning:#8a5a00;--ma-warning-soft:#fff9df;--ma-danger:#b42318;--ma-danger-soft:#fff1f0;--ma-info:#404040;--ma-info-soft:#f2f2f2;--ma-shadow:0 1px 3px rgba(0,0,0,.08),0 18px 44px rgba(0,0,0,.14);--ma-shadow-soft:0 8px 24px rgba(0,0,0,.10);--ma-r1:7px;--ma-r2:10px;--ma-r3:14px}',
    'canonical MKUI token mapping',
  );
  output = replaceOnce(
    output,
    '.ma-app{width:min(680px,calc(100vw - 28px));top:14px;right:14px;bottom:14px;border-color:rgba(201,210,225,.9);border-radius:22px;box-shadow:var(--ma-shadow);background:var(--ma-bg)}',
    '.ma-app{width:min(680px,calc(100vw - 28px));top:14px;right:14px;bottom:14px;border-color:var(--ma-line);border-radius:var(--ma-r3);box-shadow:var(--ma-shadow);background:var(--ma-bg)}',
    'workspace shell surface',
  );
  output = replaceOnce(
    output,
    '.ma-app--wide{width:min(1220px,calc(100vw - 28px));grid-template-columns:210px minmax(0,1fr)}',
    '.ma-app--wide{width:min(1220px,calc(100vw - 28px));grid-template-columns:184px minmax(0,1fr)}',
    'workspace sidebar geometry',
  );
  output = replaceOnce(
    output,
    '.ma-header{height:68px;padding:0 18px;border-bottom-color:rgba(221,227,237,.9);background:rgba(255,255,255,.94);backdrop-filter:blur(18px)}',
    '.ma-header{height:60px;padding:0 16px;border-bottom-color:var(--ma-line);background:#fff;backdrop-filter:none}',
    'workspace header',
  );
  output = replaceOnce(
    output,
    '.ma-brand__mark{width:48px;height:32px;border:1px solid var(--ma-line);border-radius:10px;background:#fff}',
    '.ma-brand__mark{width:48px;height:32px;border:1px solid var(--ma-line);border-radius:var(--ma-r1);background:#fff}',
    'brand mark',
  );
  output = replaceOnce(
    output,
    '.ma-nav{padding:14px 10px;border-right-color:var(--ma-line);background:#f8f9fc}',
    '.ma-nav{padding:12px 8px;border-right-color:var(--ma-line);background:#fafafa}',
    'workspace navigation',
  );
  output = replaceOnce(
    output,
    '.ma-nav__item{min-height:44px;padding:0 11px;border:1px solid transparent;border-radius:12px;color:#536075}',
    '.ma-nav__item{min-height:42px;padding:0 10px;border:1px solid transparent;border-radius:var(--ma-r1);color:var(--ma-muted)}',
    'navigation item',
  );
  output = replaceOnce(
    output,
    '.ma-nav__item:hover{border-color:#e2e7f0;background:#fff;color:var(--ma-ink)}',
    '.ma-nav__item:hover{border-color:var(--ma-line);background:#fff;color:var(--ma-ink)}',
    'navigation hover',
  );
  output = replaceOnce(
    output,
    '.ma-nav__item.is-active{border-color:#17213a;color:#fff;background:linear-gradient(145deg,#1d2946,#111a30);box-shadow:0 8px 20px rgba(23,33,58,.2)}',
    '.ma-nav__item.is-active{border-color:var(--ma-line);color:var(--ma-ink);background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.04);font-weight:750}',
    'navigation active state',
  );
  output = replaceOnce(
    output,
    '.ma-main{background:radial-gradient(circle at 90% 0,rgba(181,138,74,.08),transparent 28%),var(--ma-bg)}',
    '.ma-main{background:var(--ma-bg)}',
    'workspace background',
  );
  output = replaceOnce(
    output,
    '.ma-card{border-radius:17px}',
    '.ma-card{border-radius:var(--ma-r2)}',
    'card radius',
  );
  output = replaceOnce(
    output,
    '.ma-btn{min-height:42px;border-radius:11px}',
    '.ma-btn{min-height:40px;border-radius:var(--ma-r1)}',
    'button primitive',
  );
  output = replaceOnce(
    output,
    '.ma-btn--primary{border-color:var(--ma-primary);background:linear-gradient(145deg,#233152,#131d34);box-shadow:0 8px 18px rgba(23,33,58,.17)}',
    '.ma-btn--primary{border-color:var(--ma-primary);background:var(--ma-primary);box-shadow:none}',
    'primary button',
  );
  output = replaceOnce(
    output,
    '.ma-btn--primary:hover{transform:translateY(-1px);box-shadow:0 11px 24px rgba(23,33,58,.22)}',
    '.ma-btn--primary:hover{transform:none;box-shadow:none}',
    'primary button hover',
  );
  output = replaceOnce(
    output,
    '.ma-input,.ma-select,.ma-textarea{border-color:#d8deea;border-radius:11px}',
    '.ma-input,.ma-select,.ma-textarea{border-color:var(--ma-line);border-radius:var(--ma-r1)}',
    'form controls',
  );
  output = replaceOnce(
    output,
    '.ma-input:focus,.ma-select:focus,.ma-textarea:focus{border-color:#66738b;box-shadow:0 0 0 3px rgba(59,76,109,.13)}',
    '.ma-input:focus,.ma-select:focus,.ma-textarea:focus{border-color:#525252;box-shadow:0 0 0 3px rgba(23,23,23,.12)}',
    'form focus ring',
  );
  output = replaceOnce(
    output,
    '.ma-icon-btn:focus-visible,.ma-panel-close:focus-visible,.ma-version-chip:focus-visible,.ma-btn:focus-visible,.ma-nav__item:focus-visible,.ma-tone:focus-visible,.ma-review-card:focus-visible,.ma-check:focus-visible,.ma-select:focus-visible{outline:3px solid rgba(53,79,124,.28);outline-offset:2px}',
    '.ma-icon-btn:focus-visible,.ma-panel-close:focus-visible,.ma-version-chip:focus-visible,.ma-btn:focus-visible,.ma-nav__item:focus-visible,.ma-tone:focus-visible,.ma-review-card:focus-visible,.ma-check:focus-visible,.ma-select:focus-visible{outline:3px solid rgba(23,23,23,.18);outline-offset:2px}',
    'focus visibility',
  );

  const metadataAfter = metadataSnapshot(output);
  const dataAfter = dataSignature(output);
  const attachShadowAfter = count(output, 'attachShadow(');
  const closedShadowAfter = count(output, "attachShadow({ mode: 'closed' })");
  const globalCssAfter = count(output, 'const GLOBAL_CSS = `');

  assert(metadataAfter === metadataBefore, 'Protected userscript metadata changed during Message Assistant MKUI transform');
  assert(dataAfter === dataBefore, 'data-* behavioral hook signature changed during Message Assistant MKUI transform');
  assert(attachShadowAfter === attachShadowBefore, 'Shadow DOM mount count changed during Message Assistant MKUI transform');
  assert(closedShadowAfter === closedShadowBefore, 'Closed Shadow DOM contract changed during Message Assistant MKUI transform');
  assert(globalCssAfter === globalCssBefore, 'Global Etsy integration CSS layer count changed during Message Assistant MKUI transform');
  assert(output.includes('const PREMIUM_CSS = `'), 'PREMIUM_CSS layer was removed');
  assert(output.includes('const GLOBAL_CSS = `'), 'GLOBAL_CSS layer was removed');
  assert(output.includes("const MKUI_VERSION = '1.0.0';"), 'MKUI version marker missing after transform');
}

if (write && output !== original) {
  fs.writeFileSync(scriptPath, output, 'utf8');
  console.log('Applied guarded MKUI v1 Message Assistant presentation transform.');
} else if (alreadyApplied) {
  console.log('Message Assistant MKUI v1 transform already applied.');
} else {
  console.log('Message Assistant MKUI v1 dry-run passed; no files written.');
}
