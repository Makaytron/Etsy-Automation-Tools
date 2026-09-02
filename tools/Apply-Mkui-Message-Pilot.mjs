import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
const paths = {
  script: path.join(repoRoot, 'scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js'),
  readmeTr: path.join(repoRoot, 'scripts/etsy-message-assistant/README.md'),
  readmeEn: path.join(repoRoot, 'scripts/etsy-message-assistant/README.en.md'),
  changelog: path.join(repoRoot, 'scripts/etsy-message-assistant/CHANGELOG.md'),
  rootEn: path.join(repoRoot, 'README.md'),
  rootTr: path.join(repoRoot, 'README.tr.md'),
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function read(file) { return fs.readFileSync(file, 'utf8'); }
function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from);
  assert(first >= 0, `Missing MKUI Message anchor: ${label}`);
  assert(text.indexOf(from, first + from.length) < 0, `Ambiguous MKUI Message anchor: ${label}`);
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
  const prefixes = ['// @match', '// @grant', '// @connect', '// @updateURL', '// @downloadURL', '// @namespace', '// @resource'];
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

const MKUI_CSS_SOURCE = `:host{--ma-primary:#1f1f1f;--ma-primary-strong:#0f0f0f;--ma-primary-soft:#f2f2f2;--ma-accent:#525252;--ma-accent-soft:#f5f5f5;--ma-ink:#171717;--ma-muted:#595959;--ma-line:#dedede;--ma-bg:#f7f7f7;--ma-surface:#fff;--ma-success:#1f7a4d;--ma-success-soft:#edf8f1;--ma-warning:#8a5a00;--ma-warning-soft:#fff9df;--ma-danger:#b42318;--ma-danger-soft:#fff1f0;--ma-info:#525252;--ma-info-soft:#f2f2f2;--ma-pink:#525252;--ma-pink-soft:#f2f2f2;--ma-shadow:0 1px 3px rgba(0,0,0,.08),0 18px 44px rgba(0,0,0,.14);--ma-shadow-soft:0 8px 24px rgba(0,0,0,.08);--ma-r1:7px;--ma-r2:10px;--ma-r3:14px;--ma-mkui-focus:0 0 0 3px rgba(23,23,23,.14)}.ma-app{top:12px;right:12px;bottom:12px;width:min(680px,calc(100vw - 24px));border-color:var(--ma-line);border-radius:var(--ma-r3);background:var(--ma-surface);box-shadow:var(--ma-shadow)}.ma-app--wide{width:min(1200px,calc(100vw - 24px));grid-template-columns:184px minmax(0,1fr)}.ma-app--fullscreen{inset:8px;border-radius:var(--ma-r3)}.ma-header{height:60px;padding:0 16px;border-bottom-color:var(--ma-line);background:#fff;backdrop-filter:none}.ma-brand__mark{width:44px;height:30px;border:1px solid var(--ma-line);border-radius:var(--ma-r1);background:#fff}.ma-brand__title{font-size:14px;font-weight:760;letter-spacing:-.01em}.ma-brand__version{color:var(--ma-muted);font-size:11px}.ma-nav{padding:10px 7px;border-right-color:var(--ma-line);background:#fafafa}.ma-nav__group{gap:5px}.ma-nav__group--utility{margin-top:12px;padding-top:12px;border-top-color:var(--ma-line)}.ma-nav__eyebrow{padding:0 10px 5px;color:var(--ma-muted);font-size:10px}.ma-nav__item{min-height:40px;padding:0 10px;border:1px solid transparent;border-radius:var(--ma-r1);color:var(--ma-muted)}.ma-nav__item:hover{border-color:var(--ma-line);background:#fff;color:var(--ma-ink)}.ma-nav__item.is-active{border-color:var(--ma-line);color:var(--ma-ink);background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.04)}.ma-main{background:var(--ma-bg)}.ma-view{padding:16px}.ma-page-head{margin-bottom:16px;align-items:flex-start}.ma-page-head h2{font-size:20px;letter-spacing:-.02em}.ma-page-head p{max-width:680px;color:var(--ma-muted)}.ma-card,.ma-table-wrap,.ma-message-contact{border-color:var(--ma-line);box-shadow:0 1px 2px rgba(0,0,0,.025)}.ma-card{border-radius:var(--ma-r3)}.ma-btn{min-height:38px;border-radius:var(--ma-r1);box-shadow:none}.ma-btn:hover{transform:none}.ma-btn--primary{border-color:var(--ma-primary);background:var(--ma-primary);box-shadow:none}.ma-btn--primary:hover{transform:none;border-color:var(--ma-primary-strong);background:var(--ma-primary-strong);box-shadow:none}.ma-btn--small{min-height:32px}.ma-input,.ma-select,.ma-textarea{border-color:#cfcfcf;border-radius:var(--ma-r1)}.ma-input:focus,.ma-select:focus,.ma-textarea:focus{border-color:#525252;box-shadow:var(--ma-mkui-focus)}.ma-pill{padding:4px 8px}.ma-icon-btn:focus-visible,.ma-panel-close:focus-visible,.ma-version-chip:focus-visible,.ma-btn:focus-visible,.ma-nav__item:focus-visible,.ma-tone:focus-visible,.ma-review-card:focus-visible,.ma-check:focus-visible,.ma-select:focus-visible{outline:0;box-shadow:var(--ma-mkui-focus)}.ma-automation-hero{margin-bottom:16px;padding:18px;border:1px solid var(--ma-line);border-radius:var(--ma-r3);color:var(--ma-ink);background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.025)}.ma-automation-hero::after{display:none}.ma-automation-hero__eyebrow{color:var(--ma-muted)}.ma-automation-dot{background:#595959;box-shadow:0 0 0 4px rgba(89,89,89,.10)}.ma-automation-dot.is-running{background:var(--ma-success);box-shadow:0 0 0 4px rgba(31,122,77,.12)}.ma-automation-hero h3{font-size:22px}.ma-automation-hero p{color:var(--ma-muted)}.ma-automation-hero__metrics{margin:16px 0}.ma-automation-metric{padding:10px 12px;border:1px solid var(--ma-line);border-radius:var(--ma-r2);background:var(--ma-bg);backdrop-filter:none}.ma-automation-metric span{color:var(--ma-muted)}.ma-progress{height:7px;background:#e4e4e4}.ma-progress__bar{background:var(--ma-primary)}.ma-automation-hero .ma-btn{border-color:var(--ma-input);color:var(--ma-ink);background:#fff;box-shadow:none}.ma-automation-hero .ma-btn:hover{border-color:#bdbdbd;background:var(--ma-muted)}.ma-automation-hero .ma-btn--primary{border-color:var(--ma-primary);color:#fff;background:var(--ma-primary);box-shadow:none}.ma-automation-hero .ma-btn--primary:hover{background:var(--ma-primary-strong)}.ma-automation-options{border-top-color:var(--ma-line)}.ma-automation-options>summary,.ma-automation-options label{color:var(--ma-muted)}.ma-automation-options .ma-message-box{border-color:var(--ma-line);color:var(--ma-ink);background:var(--ma-bg)}.ma-order-card{padding:14px;border-color:var(--ma-line);border-radius:var(--ma-r3);box-shadow:0 1px 2px rgba(0,0,0,.035)}.ma-order-card:hover{transform:none;border-color:#bdbdbd;box-shadow:0 6px 16px rgba(0,0,0,.06)}.ma-order-card.is-selected{border-color:var(--ma-primary);box-shadow:0 0 0 2px rgba(23,23,23,.06)}.ma-order-card__image{border-radius:var(--ma-r2);background:#eeeeee}.ma-order-card__product{color:#404040}.ma-order-card__body{border-top-color:#ededed}.ma-empty-inline{border-color:#cfcfcf;border-radius:var(--ma-r3);color:var(--ma-muted);background:#fff}.ma-table th{background:#fafafa}.ma-version-chip{border-radius:var(--ma-radius-pill,999px)}@container (max-width:720px){.ma-view{padding:14px}.ma-automation-hero{padding:16px}}@media (max-width:560px){.ma-app{inset:6px;width:auto;border-radius:var(--ma-r3)}.ma-header{height:60px}.ma-view{padding:12px}}`;

const original = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, read(file)]));
const alreadyApplied = original.script.includes('// @version      1.2.9')
  && original.script.includes("const APP_VERSION = '1.2.9';")
  && original.script.includes("const MKUI_VERSION = '1.0.0';")
  && original.script.includes('const MKUI_CSS = `:host{--ma-primary:#1f1f1f;');

let output = { ...original };

if (!alreadyApplied) {
  const metadataBefore = metadataSnapshot(original.script);
  const dataBefore = dataSignature(original.script);
  const closedShadowBefore = count(original.script, "attachShadow({ mode: 'closed' })");
  const openShadowBefore = count(original.script, "attachShadow({ mode: 'open' })");
  const appIdBefore = count(original.script, "id: 'makaytron-etsy-message-assistant'");

  const premiumStart = original.script.indexOf('    const PREMIUM_CSS = `');
  const globalStart = original.script.indexOf('    const GLOBAL_CSS = `', premiumStart);
  const htmlStart = original.script.indexOf('    const html = ', globalStart);
  assert(premiumStart >= 0 && globalStart > premiumStart && htmlStart > globalStart, 'Unable to snapshot Message Assistant style layers.');
  const premiumSnapshot = original.script.slice(premiumStart, globalStart);
  const globalSnapshot = original.script.slice(globalStart, htmlStart);

  output.script = replaceOnce(output.script, '// @version      1.2.8', '// @version      1.2.9', 'userscript version');
  output.script = replaceOnce(output.script, "    const APP_VERSION = '1.2.8';", "    const APP_VERSION = '1.2.9';\n    const MKUI_VERSION = '1.0.0';", 'runtime version marker');

  const globalAnchor = '\n\n    const GLOBAL_CSS = `';
  const mkuiInsertion = `\n\n    const MKUI_CSS = \`${MKUI_CSS_SOURCE}\`;\n\n    const GLOBAL_CSS = \``;
  output.script = replaceOnce(output.script, globalAnchor, mkuiInsertion, 'MKUI override layer insertion');
  output.script = replaceOnce(
    output.script,
    '<style>${CSS}${LAUNCHER_CSS}${UX_CSS}${PREMIUM_CSS}</style>${ICON_SPRITE}',
    '<style>${CSS}${LAUNCHER_CSS}${UX_CSS}${PREMIUM_CSS}${MKUI_CSS}</style>${ICON_SPRITE}',
    'shadow style composition',
  );

  assert(metadataSnapshot(output.script) === metadataBefore, 'Protected userscript metadata changed.');
  assert(dataSignature(output.script) === dataBefore, 'data-* hook signature changed.');
  assert(count(output.script, "attachShadow({ mode: 'closed' })") === closedShadowBefore && closedShadowBefore === 1, 'Closed Shadow DOM contract changed.');
  assert(count(output.script, "attachShadow({ mode: 'open' })") === openShadowBefore && openShadowBefore === 0, 'Unexpected open Shadow DOM introduced.');
  assert(count(output.script, "id: 'makaytron-etsy-message-assistant'") === appIdBefore, 'Message Assistant app id signature changed.');
  assert(output.script.includes(premiumSnapshot), 'Existing PREMIUM_CSS layer was modified during UI-only migration.');
  assert(output.script.includes(globalSnapshot), 'Existing GLOBAL_CSS Etsy integration layer was modified during UI-only migration.');

  output.readmeTr = replaceOnce(output.readmeTr, '**Sürüm:** 1.2.8', '**Sürüm:** 1.2.9', 'Turkish package README version');
  output.readmeEn = replaceOnce(output.readmeEn, 'Version: `1.2.8`', 'Version: `1.2.9`', 'English package README version');
  output.rootEn = replaceOnce(output.rootEn, '| [Makaytron Etsy Message Assistant](./scripts/etsy-message-assistant/README.en.md) | 1.2.8 |', '| [Makaytron Etsy Message Assistant](./scripts/etsy-message-assistant/README.en.md) | 1.2.9 |', 'English root version row');
  output.rootTr = replaceOnce(output.rootTr, '| [Makaytron Etsy Message Assistant](./scripts/etsy-message-assistant/README.md) | 1.2.8 |', '| [Makaytron Etsy Message Assistant](./scripts/etsy-message-assistant/README.md) | 1.2.9 |', 'Turkish root version row');

  const changelogAnchor = '## [Unreleased]\n\n';
  const changelogEntry = `## [Unreleased]\n\n## [1.2.9] - 2026-09-02\n\n### Changed\n\n- \`Tamplate-Back-White-01\` referans alınarak MKUI v1 Workspace görünüm katmanı eklendi; lacivert/altın premium yüzeyler ortak nötr Makaytron tokenlarına, 60/184 px navigation ritmine, ortak radius/focus sistemine ve siyah-beyaz primary aksiyon diline uyarlandı.\n- Otopilot hero, metrik kartları, progress, sipariş kartları, form kontrolleri ve aktif navigation görsel olarak ortak MKUI ailesine getirildi. Mevcut \`CSS\`, \`LAUNCHER_CSS\`, \`UX_CSS\`, \`PREMIUM_CSS\` ve Etsy'ye enjekte edilen \`GLOBAL_CSS\` katmanları değiştirilmeden korunup yalnız en sona presentation override eklendi.\n\n### Validation\n\n- Closed Shadow DOM, uygulama kimliği, tüm \`data-*\` davranış hook'ları, userscript izin/update metadata'sı ve global Etsy integration CSS'i invariant olarak kilitlendi. 259 davranış testi, gerçek Chrome fixture'ı, privacy guard ve tam distribution gate migration sonrasında çalıştırılır.\n\n`;
  output.changelog = replaceOnce(output.changelog, changelogAnchor, changelogEntry, 'changelog Unreleased anchor');
}

assert(output.script.includes('// @version      1.2.9'), 'Target Message Assistant userscript version missing.');
assert(output.script.includes("const APP_VERSION = '1.2.9';"), 'Target Message Assistant APP_VERSION missing.');
assert(output.script.includes("const MKUI_VERSION = '1.0.0';"), 'MKUI version marker missing.');
assert(output.script.includes('const MKUI_CSS = `:host{--ma-primary:#1f1f1f;'), 'MKUI Workspace override missing.');
assert(output.script.includes('${PREMIUM_CSS}${MKUI_CSS}</style>${ICON_SPRITE}'), 'MKUI CSS is not the final shadow presentation layer.');

if (write) {
  let changed = 0;
  for (const [key, file] of Object.entries(paths)) {
    if (output[key] === original[key]) continue;
    fs.writeFileSync(file, output[key], 'utf8');
    changed += 1;
  }
  console.log(changed ? `MKUI Message pilot applied to ${changed} files.` : 'MKUI Message pilot already applied; invariants verified.');
} else {
  console.log(alreadyApplied ? 'MKUI Message pilot already applied; invariants verified.' : 'MKUI Message pilot dry-run passed; no files changed.');
}
