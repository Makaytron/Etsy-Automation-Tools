import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
const paths = {
  script: path.join(repoRoot, 'scripts/etsy-sale-campaign-batch-runner/Etsy-Sale-Campaign-Batch-Runner.user.js'),
  readmeTr: path.join(repoRoot, 'scripts/etsy-sale-campaign-batch-runner/README.md'),
  readmeEn: path.join(repoRoot, 'scripts/etsy-sale-campaign-batch-runner/README.en.md'),
  changelog: path.join(repoRoot, 'scripts/etsy-sale-campaign-batch-runner/CHANGELOG.md'),
  rootEn: path.join(repoRoot, 'README.md'),
  rootTr: path.join(repoRoot, 'README.tr.md'),
  test: path.join(repoRoot, 'tools/Test-Sale-Manager.mjs'),
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function read(file) { return fs.readFileSync(file, 'utf8'); }
function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from);
  assert(first >= 0, `Missing MKUI Sale anchor: ${label}`);
  assert(text.indexOf(from, first + from.length) < 0, `Ambiguous MKUI Sale anchor: ${label}`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}
function replaceAllExact(text, from, to, expectedCount, label) {
  const count = text.split(from).length - 1;
  assert(count === expectedCount, `Unexpected count for ${label}: expected ${expectedCount}, found ${count}`);
  return text.split(from).join(to);
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

const original = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, read(file)]));
const alreadyApplied = original.script.includes('// @version      1.0.13')
  && original.script.includes("const VERSION = '1.0.13';")
  && original.script.includes("const MKUI_VERSION = '1.0.0';")
  && original.script.includes('--eda-radius-lg:14px');

let output = { ...original };

if (!alreadyApplied) {
  const metadataBefore = metadataSnapshot(original.script);
  const dataBefore = dataSignature(original.script);
  const rootIdUses = count(original.script, 'ROOT_ID');
  const collapsedIdUses = count(original.script, 'eda-expand-panel');
  const attachShadowCount = count(original.script, 'attachShadow(');

  output.script = replaceOnce(output.script, '// @version      1.0.12', '// @version      1.0.13', 'userscript version');
  output.script = replaceOnce(output.script, "    const VERSION = '1.0.12';", "    const VERSION = '1.0.13';\n    const MKUI_VERSION = '1.0.0';", 'runtime version marker');

  output.script = replaceOnce(
    output.script,
    '--eda-bg:#fff;--eda-fg:#171717;--eda-card:#fff;--eda-muted:#f7f7f7;--eda-muted-2:#f2f2f2;\n            --eda-muted-fg:#737373;--eda-border:#e7e7e7;--eda-input:#dedede;--eda-primary:#1f1f1f;\n            --eda-primary-fg:#fafafa;--eda-danger:#b91c1c;--eda-warning:#9a6700;--eda-success:#276749;',
    '--eda-bg:#fff;--eda-fg:#171717;--eda-card:#fff;--eda-muted:#f2f2f2;--eda-muted-2:#eeeeee;\n            --eda-muted-fg:#595959;--eda-border:#dedede;--eda-input:#cfcfcf;--eda-primary:#1f1f1f;\n            --eda-primary-fg:#fafafa;--eda-danger:#b42318;--eda-danger-soft:#fff1f0;--eda-warning:#8a5a00;--eda-warning-soft:#fff9df;--eda-success:#1f7a4d;--eda-success-soft:#edf8f1;\n            --eda-radius-sm:7px;--eda-radius-md:10px;--eda-radius-lg:14px;--eda-radius-pill:999px;--eda-focus:0 0 0 3px rgba(23,23,23,.14);',
    'canonical MKUI token mapping',
  );
  output.script = replaceOnce(output.script, 'border-radius:11px;box-shadow:0 1px 3px rgba(15,23,42,.08),0 12px 30px rgba(15,23,42,.08)', 'border-radius:var(--eda-radius-lg);box-shadow:0 1px 3px rgba(0,0,0,.08),0 18px 44px rgba(0,0,0,.14)', 'panel surface');
  output.script = replaceOnce(output.script, '#${ROOT_ID}.eda-collapsed{right:0;top:148px;width:44px}', '#${ROOT_ID}.eda-collapsed{right:0;top:148px;width:62px}', 'collapsed launcher width');
  output.script = replaceOnce(output.script, '#${ROOT_ID}.eda-collapsed .eda-collapsed-tab{width:44px;height:58px;min-height:58px;padding:0;border:1px solid #2b2b2b;border-right:0;border-radius:9px 0 0 9px;background:#1f1f1f;color:#fff;box-shadow:0 8px 22px rgba(0,0,0,.18)}', '#${ROOT_ID}.eda-collapsed .eda-collapsed-tab{width:62px;height:52px;min-height:52px;padding:0;border:1px solid var(--eda-border);border-right:0;border-radius:14px 0 0 14px;background:#fff;color:#171717;box-shadow:0 12px 30px rgba(0,0,0,.14)}', 'collapsed launcher surface');
  output.script = replaceOnce(output.script, '#${ROOT_ID}.eda-collapsed .eda-collapsed-tab:hover{background:#303030}', '#${ROOT_ID}.eda-collapsed .eda-collapsed-tab:hover{background:var(--eda-muted)}', 'collapsed launcher hover');
  output.script = replaceOnce(output.script, '#${ROOT_ID} .eda-head{padding:13px 14px;', '#${ROOT_ID} .eda-head{padding:14px 16px;', 'header spacing');
  output.script = replaceOnce(output.script, '#${ROOT_ID} .eda-title{margin:0;font-size:13.5px;font-weight:700;', '#${ROOT_ID} .eda-title{margin:0;font-size:14px;font-weight:760;', 'title typography');
  output.script = replaceOnce(output.script, '#${ROOT_ID} .eda-collapse-head{width:30px;min-width:30px;height:30px;min-height:30px;padding:0;border:1px solid var(--eda-border);border-radius:7px;background:#fff;color:#737373}', '#${ROOT_ID} .eda-collapse-head{width:32px;min-width:32px;height:32px;min-height:32px;padding:0;border:1px solid var(--eda-border);border-radius:var(--eda-radius-sm);background:#fff;color:var(--eda-muted-fg)}', 'header icon control');
  output.script = replaceOnce(output.script, '#${ROOT_ID} .eda-version{display:inline-flex;align-items:center;height:20px;padding:0 7px;border:1px solid var(--eda-border);border-radius:999px;background:var(--eda-muted);font-size:10.5px;font-weight:650;color:#525252}', '#${ROOT_ID} .eda-version{display:inline-flex;align-items:center;height:22px;padding:0 8px;border:1px solid var(--eda-border);border-radius:var(--eda-radius-pill);background:var(--eda-muted);font-size:10.5px;font-weight:700;color:#404040}', 'version pill');
  output.script = replaceOnce(output.script, '#${ROOT_ID} .eda-pill{display:inline-flex;align-items:center;gap:5px;height:20px;border-radius:999px;border:1px solid var(--eda-border);padding:0 7px;font-size:10.5px;font-weight:650;white-space:nowrap;background:#fff;color:#525252}', '#${ROOT_ID} .eda-pill{display:inline-flex;align-items:center;gap:5px;height:22px;border-radius:var(--eda-radius-pill);border:1px solid var(--eda-border);padding:0 8px;font-size:10.5px;font-weight:700;white-space:nowrap;background:#fff;color:#404040}', 'status pill');
  output.script = replaceOnce(output.script, '#${ROOT_ID} .eda-body{padding:14px}', '#${ROOT_ID} .eda-body{padding:16px}', 'body spacing');
  output.script = replaceOnce(output.script, '#${ROOT_ID} .eda-status-card{display:flex;align-items:flex-start;gap:9px;margin-bottom:12px;padding:10px 11px;border:1px solid var(--eda-border);border-radius:8px;background:var(--eda-muted)}', '#${ROOT_ID} .eda-status-card{display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;padding:12px;border:1px solid var(--eda-border);border-radius:var(--eda-radius-md);background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.025)}', 'status surface');
  output.script = replaceOnce(output.script, '#${ROOT_ID} .eda-status-icon{display:flex;align-items:center;justify-content:center;flex:0 0 auto;width:25px;height:25px;border-radius:7px;background:#fff;border:1px solid var(--eda-border);color:#525252}', '#${ROOT_ID} .eda-status-icon{display:flex;align-items:center;justify-content:center;flex:0 0 auto;width:28px;height:28px;border-radius:var(--eda-radius-sm);background:var(--eda-muted);border:1px solid var(--eda-border);color:#404040}', 'status icon');
  output.script = replaceOnce(output.script, '#${ROOT_ID} .eda-chip{border:1px solid var(--eda-border);background:#fff;border-radius:8px;padding:9px 10px;min-width:0;', '#${ROOT_ID} .eda-chip{border:1px solid var(--eda-border);background:#fff;border-radius:var(--eda-radius-md);padding:10px 11px;min-width:0;', 'stat card');
  output.script = replaceOnce(output.script, '#${ROOT_ID} button,.eda-modal button,.eda-report button,.eda-button-link{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;border-radius:6px;padding:0 12px;', '#${ROOT_ID} button,.eda-modal button,.eda-report button,.eda-button-link{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:38px;border-radius:var(--eda-radius-sm,7px);padding:0 12px;', 'button primitive');
  output.script = replaceOnce(output.script, '#${ROOT_ID} button:focus-visible,.eda-modal button:focus-visible,.eda-report button:focus-visible,.eda-button-link:focus-visible{outline:2px solid #525252;outline-offset:2px}', '#${ROOT_ID} button:focus-visible,.eda-modal button:focus-visible,.eda-report button:focus-visible,.eda-button-link:focus-visible{outline:0;box-shadow:var(--eda-focus,0 0 0 3px rgba(23,23,23,.14))}', 'focus ring');
  output.script = replaceOnce(output.script, '.eda-secondary{background:#fff;border:1px solid var(--eda-input,#dedede);color:var(--eda-fg,#171717);', '.eda-secondary{background:#fff;border:1px solid var(--eda-input,#cfcfcf);color:var(--eda-fg,#171717);', 'secondary button border');
  output.script = replaceOnce(output.script, '.eda-ghost{background:transparent;border:1px solid transparent;color:var(--eda-muted-fg,#737373)}', '.eda-ghost{background:transparent;border:1px solid transparent;color:var(--eda-muted-fg,#595959)}', 'ghost button token');
  output.script = replaceOnce(output.script, '.eda-success{background:#fff;border:1px solid #c9dfd1;color:#276749}', '.eda-success{background:var(--eda-success-soft,#edf8f1);border:1px solid #a9d8be;color:var(--eda-success,#1f7a4d)}', 'success button');
  output.script = replaceOnce(output.script, '.eda-warning{background:#fff;border:1px solid #eed69a;color:#8a5a00}', '.eda-warning{background:var(--eda-warning-soft,#fff9df);border:1px solid #e5c56b;color:var(--eda-warning,#8a5a00)}', 'warning button');
  output.script = replaceOnce(output.script, '.eda-danger{background:#fff;border:1px solid #efcaca;color:#a61b1b}', '.eda-danger{background:var(--eda-danger-soft,#fff1f0);border:1px solid #efb4ae;color:var(--eda-danger,#b42318)}', 'danger button');
  output.script = replaceOnce(output.script, '.eda-toast{opacity:0;transform:translateY(8px);transition:opacity .2s ease,transform .2s ease;border-radius:8px;', '.eda-toast{opacity:0;transform:translateY(8px);transition:opacity .2s ease,transform .2s ease;border-radius:10px;', 'toast radius');
  output.script = replaceOnce(output.script, '.eda-toast.show{opacity:1;transform:translateY(0)}.eda-toast.info{background:#262626}.eda-toast.success{background:#276749}.eda-toast.warning{background:#8a5a00}.eda-toast.error{background:#b91c1c}', '.eda-toast.show{opacity:1;transform:translateY(0)}.eda-toast.info{background:#262626}.eda-toast.success{background:#1f7a4d}.eda-toast.warning{background:#8a5a00}.eda-toast.error{background:#b42318}', 'toast semantics');
  output.script = replaceOnce(output.script, '.eda-modal,.eda-report{--eda-border:#e7e7e7;--eda-muted:#f7f7f7;--eda-input:#dedede;--eda-fg:#171717;--eda-muted-fg:#737373;--eda-primary:#1f1f1f;--eda-primary-fg:#fafafa;', '.eda-modal,.eda-report{--eda-border:#dedede;--eda-muted:#f2f2f2;--eda-input:#cfcfcf;--eda-fg:#171717;--eda-muted-fg:#595959;--eda-primary:#1f1f1f;--eda-primary-fg:#fafafa;--eda-success:#1f7a4d;--eda-success-soft:#edf8f1;--eda-warning:#8a5a00;--eda-warning-soft:#fff9df;--eda-danger:#b42318;--eda-danger-soft:#fff1f0;--eda-radius-sm:7px;--eda-radius-md:10px;--eda-radius-lg:14px;--eda-focus:0 0 0 3px rgba(23,23,23,.14);', 'modal token mapping');
  output.script = replaceOnce(output.script, 'overflow:hidden;border-radius:12px;background:#fff;box-shadow:0 25px 50px -12px rgba(0,0,0,.26)', 'overflow:hidden;border-radius:var(--eda-radius-lg);background:#fff;box-shadow:0 25px 50px -12px rgba(0,0,0,.26)', 'modal surface');
  output.script = replaceOnce(output.script, '.eda-modal-title,.eda-report-title{margin:0;font-size:15px;font-weight:700;', '.eda-modal-title,.eda-report-title{margin:0;font-size:15px;font-weight:760;', 'modal title');
  output.script = replaceOnce(output.script, '.eda-icon-button{width:34px;min-width:34px;height:34px;min-height:34px;padding:0!important;border:1px solid transparent!important;border-radius:7px!important;', '.eda-icon-button{width:34px;min-width:34px;height:34px;min-height:34px;padding:0!important;border:1px solid transparent!important;border-radius:var(--eda-radius-sm)!important;', 'modal icon control');
  output.script = replaceOnce(output.script, '.eda-field input,.eda-field select{width:100%;height:38px;border:1px solid var(--eda-input);border-radius:6px;', '.eda-field input,.eda-field select{width:100%;height:40px;border:1px solid var(--eda-input);border-radius:var(--eda-radius-sm);', 'field primitive');
  output.script = replaceOnce(output.script, '.eda-field input:focus,.eda-field select:focus{outline:none;border-color:#737373;box-shadow:0 0 0 2px rgba(23,23,23,.08)}', '.eda-field input:focus,.eda-field select:focus{outline:none;border-color:#525252;box-shadow:var(--eda-focus)}', 'field focus');
  output.script = replaceOnce(output.script, '.eda-note{border-radius:8px;background:#f7f7f7;border:1px solid #e7e7e7;', '.eda-note{border-radius:var(--eda-radius-md);background:#f7f7f7;border:1px solid var(--eda-border);', 'note surface');

  assert(metadataSnapshot(output.script) === metadataBefore, 'Protected userscript metadata changed.');
  assert(dataSignature(output.script) === dataBefore, 'data-* hook signature changed.');
  assert(count(output.script, 'ROOT_ID') === rootIdUses, 'ROOT_ID usage changed.');
  assert(count(output.script, 'eda-expand-panel') === collapsedIdUses, 'Collapsed-panel id usage changed.');
  assert(count(output.script, 'attachShadow(') === attachShadowCount && attachShadowCount === 0, 'Sale Manager isolation model changed.');

  output.readmeTr = replaceOnce(output.readmeTr, '**Sürüm:** 1.0.12', '**Sürüm:** 1.0.13', 'Turkish package README version');
  output.readmeEn = replaceOnce(output.readmeEn, 'Version: `1.0.12`', 'Version: `1.0.13`', 'English package README version');
  output.rootEn = replaceOnce(output.rootEn, '| [Makaytron Etsy Sale Manager](./scripts/etsy-sale-campaign-batch-runner/README.en.md) | 1.0.12 |', '| [Makaytron Etsy Sale Manager](./scripts/etsy-sale-campaign-batch-runner/README.en.md) | 1.0.13 |', 'English root version row');
  output.rootTr = replaceOnce(output.rootTr, '| [Makaytron Etsy Sale Manager](./scripts/etsy-sale-campaign-batch-runner/README.md) | 1.0.12 |', '| [Makaytron Etsy Sale Manager](./scripts/etsy-sale-campaign-batch-runner/README.md) | 1.0.13 |', 'Turkish root version row');

  const changelogAnchor = '# Changelog\n\nAll notable changes to this project are documented in this file.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),\nand this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\n\n';
  const changelogEntry = `${changelogAnchor}## [1.0.13] - 2026-09-02\n\n### Changed\n\n- Applied the MKUI v1 Compact Shell presentation mapping from \`Tamplate-Back-White-01\`: canonical neutral tokens, radius/focus system, header/status/stat surfaces, launcher, buttons, toasts, modals, and form controls.\n- Kept the existing non-Shadow-DOM mount model, Etsy write-flow markup, selectors, event topology, busy/disabled semantics, telemetry, storage, verification, batching, and fail-closed logic unchanged.\n\n### Validation\n\n- Re-ran the dedicated Sale Manager regression suite, updater checks, privacy guard, and complete distribution gate after the presentation-only migration.\n\n`;
  output.changelog = replaceOnce(output.changelog, changelogAnchor, changelogEntry, 'changelog header');

  output.test = replaceAllExact(output.test, "assert.equal(migrated.version, '1.0.12');", "assert.equal(migrated.version, '1.0.13');", 3, 'current-version migration assertions');
  output.test = replaceOnce(output.test, "test('v1.0.8 active verification queue survives the v1.0.12 patch migration'", "test('v1.0.8 active verification queue survives the v1.0.13 UI-only patch migration'", 'v1.0.8 migration test title');
  output.test = replaceOnce(output.test, "test('an active v1.0.11 transient-loading step survives the v1.0.12 patch migration'", "test('an active v1.0.11 transient-loading step survives the v1.0.13 UI-only patch migration'", 'v1.0.11 migration test title');
}

assert(output.script.includes('// @version      1.0.13'), 'Target Sale Manager userscript version missing.');
assert(output.script.includes("const VERSION = '1.0.13';"), 'Target Sale Manager runtime version missing.');
assert(output.script.includes("const MKUI_VERSION = '1.0.0';"), 'MKUI version marker missing.');
assert(output.script.includes('--eda-radius-lg:14px'), 'MKUI Sale token mapping missing.');
assert(output.script.includes('button[aria-busy=\\"true\\"]'), 'Busy-state contract missing.');

if (write) {
  let changed = 0;
  for (const [key, file] of Object.entries(paths)) {
    if (output[key] === original[key]) continue;
    fs.writeFileSync(file, output[key], 'utf8');
    changed += 1;
  }
  console.log(changed ? `MKUI Sale pilot applied to ${changed} files.` : 'MKUI Sale pilot already applied; invariants verified.');
} else {
  console.log(alreadyApplied ? 'MKUI Sale pilot already applied; invariants verified.' : 'MKUI Sale pilot dry-run passed; no files changed.');
}
