import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
const paths = {
  script: path.join(repoRoot, 'scripts/etsy-keyword-market-analyzer/Makaytron-Etsy-Keyword-Market-Analyzer.user.js'),
  readmeTr: path.join(repoRoot, 'scripts/etsy-keyword-market-analyzer/README.md'),
  readmeEn: path.join(repoRoot, 'scripts/etsy-keyword-market-analyzer/README.en.md'),
  changelog: path.join(repoRoot, 'scripts/etsy-keyword-market-analyzer/CHANGELOG.md'),
  rootEn: path.join(repoRoot, 'README.md'),
  rootTr: path.join(repoRoot, 'README.tr.md'),
  checklistTr: path.join(repoRoot, 'docs/keyword-market-analyzer-dry-run-checklist.md'),
  checklistEn: path.join(repoRoot, 'docs/keyword-market-analyzer-dry-run-checklist.en.md'),
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(file) { return fs.readFileSync(file, 'utf8'); }
function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from);
  assert(first >= 0, `Missing MKUI Keyword anchor: ${label}`);
  assert(text.indexOf(from, first + from.length) < 0, `Ambiguous MKUI Keyword anchor: ${label}`);
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
function dataSignature(text) {
  const counts = new Map();
  for (const match of text.matchAll(/data-[a-z0-9-]+/gi)) {
    const key = match[0].toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return JSON.stringify([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}
function metadataSnapshot(text) {
  const prefixes = ['// @match', '// @grant', '// @connect', '// @updateURL', '// @downloadURL', '// @namespace'];
  return text.split(/\r?\n/).filter((line) => prefixes.some((prefix) => line.startsWith(prefix))).join('\n');
}

const original = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, read(file)]));
const alreadyApplied = original.script.includes('// @version      1.0.4')
  && original.script.includes("const APP_VERSION = '1.0.4';")
  && original.script.includes("const MKUI_VERSION = '1.0.0';")
  && original.script.includes('--ekma-radius-lg:14px');

let output = { ...original };

if (!alreadyApplied) {
  const metadataBefore = metadataSnapshot(original.script);
  const dataBefore = dataSignature(original.script);
  const shadowOpenCount = count(original.script, "attachShadow({ mode: 'open' })");
  const hostIdCount = count(original.script, 'makaytron-etsy-keyword-market-analyzer');

  output.script = replaceOnce(output.script, '// @version      1.0.3', '// @version      1.0.4', 'userscript version');
  output.script = replaceOnce(output.script, "    const APP_VERSION = '1.0.3';", "    const APP_VERSION = '1.0.4';\n    const MKUI_VERSION = '1.0.0';", 'runtime version marker');

  output.script = replaceOnce(
    output.script,
    ':host{all:initial;--ekma-bg:#fff;--ekma-fg:#171717;--ekma-muted:#f5f5f5;--ekma-muted-fg:#595959;--ekma-border:#dedede;--ekma-input:#cfcfcf;--ekma-primary:#1f1f1f;--ekma-primary-fg:#fafafa;--ekma-danger:#b42318;--ekma-danger-soft:#fff1f0;--ekma-shadow:0 1px 3px rgba(0,0,0,.08),0 18px 44px rgba(0,0,0,.14);',
    ':host{all:initial;--ekma-bg:#fff;--ekma-fg:#171717;--ekma-muted:#f2f2f2;--ekma-muted-fg:#595959;--ekma-border:#dedede;--ekma-input:#cfcfcf;--ekma-primary:#1f1f1f;--ekma-primary-fg:#fafafa;--ekma-danger:#b42318;--ekma-danger-soft:#fff1f0;--ekma-success:#1f7a4d;--ekma-success-soft:#edf8f1;--ekma-warning:#8a5a00;--ekma-warning-soft:#fff9df;--ekma-radius-sm:7px;--ekma-radius-md:10px;--ekma-radius-lg:14px;--ekma-radius-pill:999px;--ekma-focus:0 0 0 3px rgba(23,23,23,.14);--ekma-shadow:0 1px 3px rgba(0,0,0,.08),0 18px 44px rgba(0,0,0,.14);',
    'canonical MKUI token mapping',
  );
  output.script = replaceOnce(output.script, 'border:1px solid #d7d7d7;border-right:0;border-radius:10px 0 0 10px;background:#fff;color:#171717;box-shadow:0 10px 26px rgba(0,0,0,.17);', 'border:1px solid var(--ekma-border);border-right:0;border-radius:14px 0 0 14px;background:#fff;color:#171717;box-shadow:0 12px 30px rgba(0,0,0,.14);', 'launcher surface');
  output.script = replaceOnce(output.script, '.launcher:hover{background:#f7f7f7}.launcher:focus-visible{outline:2px solid #171717;outline-offset:3px}', '.launcher:hover{background:var(--ekma-muted)}.launcher:focus-visible{outline:0;box-shadow:var(--ekma-focus)}', 'launcher focus');
  output.script = replaceOnce(output.script, 'border:1px solid var(--ekma-border);border-radius:12px;background:var(--ekma-bg);', 'border:1px solid var(--ekma-border);border-radius:var(--ekma-radius-lg);background:var(--ekma-bg);', 'compact panel radius');
  output.script = replaceOnce(output.script, 'font-size:14px;font-weight:730;', 'font-size:14px;font-weight:760;', 'identity title weight');
  output.script = replaceOnce(output.script, '.version{display:inline-flex;height:20px;margin-top:5px;padding:0 7px;align-items:center;border:1px solid var(--ekma-border);border-radius:999px;background:var(--ekma-muted);color:#525252;font-size:9.5px;font-weight:700}', '.version{display:inline-flex;height:22px;margin-top:5px;padding:0 8px;align-items:center;border:1px solid var(--ekma-border);border-radius:var(--ekma-radius-pill);background:var(--ekma-muted);color:#404040;font-size:10px;font-weight:700}', 'version pill');
  output.script = replaceOnce(output.script, 'border-radius:7px;background:#fff;color:#525252;cursor:pointer;', 'border-radius:var(--ekma-radius-sm);background:#fff;color:#525252;cursor:pointer;', 'header controls radius');
  output.script = replaceOnce(output.script, '.lang:focus-visible,.close:focus-visible{outline:2px solid #525252;outline-offset:2px}', '.lang:focus-visible,.close:focus-visible{outline:0;box-shadow:var(--ekma-focus)}', 'header controls focus');
  output.script = replaceOnce(output.script, 'border:1px solid var(--ekma-input);border-radius:7px;outline:none;background:#fff;', 'border:1px solid var(--ekma-input);border-radius:var(--ekma-radius-sm);outline:none;background:#fff;', 'field primitive');
  output.script = replaceOnce(output.script, '.field input:focus,.field textarea:focus{border-color:#525252;box-shadow:0 0 0 3px rgba(23,23,23,.09)}', '.field input:focus,.field textarea:focus{border-color:#525252;box-shadow:var(--ekma-focus)}', 'field focus');
  output.script = replaceOnce(output.script, '.actions button,.updates button{min-height:36px;padding:0 11px;border:1px solid var(--ekma-input);border-radius:7px;', '.actions button,.updates button{min-height:38px;padding:0 11px;border:1px solid var(--ekma-input);border-radius:var(--ekma-radius-sm);', 'button primitive');
  output.script = replaceOnce(output.script, '.actions button:focus-visible,.updates button:focus-visible{outline:2px solid #525252;outline-offset:2px}', '.actions button:focus-visible,.updates button:focus-visible{outline:0;box-shadow:var(--ekma-focus)}', 'button focus');
  output.script = replaceOnce(output.script, '.status,.update-banner{margin-top:11px;padding:10px 11px;border:1px solid var(--ekma-border);border-radius:8px;background:#fafafa;', '.status,.update-banner{margin-top:11px;padding:11px 12px;border:1px solid var(--ekma-border);border-radius:var(--ekma-radius-md);background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.025);', 'status surface');
  output.script = replaceOnce(output.script, '.updates button{min-height:32px;padding:0 9px;font-size:10.5px}', '.updates button{min-height:32px;padding:0 9px;font-size:10.5px}', 'small update button invariant');

  output.script = replaceOnce(output.script, 'border:1px solid #d8d8d8;border-radius:7px;background:#fafafa;', 'border:1px solid #dedede;border-radius:10px;background:#fff;', 'inline result surface');
  output.script = replaceOnce(output.script, 'border:1px solid #cfcfcf;border-radius:5px;background:#fff;', 'border:1px solid #cfcfcf;border-radius:7px;background:#f2f2f2;', 'inline brand surface');
  output.script = replaceOnce(output.script, '.ekma-inline__metric b{color:#737373;', '.ekma-inline__metric b{color:#595959;', 'inline metric label');

  assert(metadataSnapshot(output.script) === metadataBefore, 'Protected userscript metadata changed.');
  assert(dataSignature(output.script) === dataBefore, 'data-* hook signature changed.');
  assert(count(output.script, "attachShadow({ mode: 'open' })") === shadowOpenCount && shadowOpenCount === 1, 'Open Shadow DOM contract changed.');
  assert(count(output.script, 'makaytron-etsy-keyword-market-analyzer') === hostIdCount, 'Host id signature changed.');

  output.readmeTr = replaceOnce(output.readmeTr, '**Sürüm:** 1.0.3', '**Sürüm:** 1.0.4', 'Turkish package README version');
  output.readmeEn = replaceOnce(output.readmeEn, '**Version:** 1.0.3', '**Version:** 1.0.4', 'English package README version');
  output.rootEn = replaceOnce(output.rootEn, '| [Makaytron Etsy Keyword & Market Analyzer](./scripts/etsy-keyword-market-analyzer/README.en.md) | 1.0.3 |', '| [Makaytron Etsy Keyword & Market Analyzer](./scripts/etsy-keyword-market-analyzer/README.en.md) | 1.0.4 |', 'English root version row');
  output.rootTr = replaceOnce(output.rootTr, '| [Makaytron Etsy Keyword & Market Analyzer](./scripts/etsy-keyword-market-analyzer/README.md) | 1.0.3 |', '| [Makaytron Etsy Keyword & Market Analyzer](./scripts/etsy-keyword-market-analyzer/README.md) | 1.0.4 |', 'Turkish root version row');
  output.checklistTr = replaceOnce(output.checklistTr, 'sürümü `1.0.3`', 'sürümü `1.0.4`', 'Turkish dry-run version');
  output.checklistTr = replaceOnce(output.checklistTr, '`v1.0.3`', '`v1.0.4`', 'Turkish dry-run visible version');
  output.checklistEn = replaceOnce(output.checklistEn, 'version is `1.0.3`', 'version is `1.0.4`', 'English dry-run version');
  output.checklistEn = replaceOnce(output.checklistEn, '`v1.0.3`', '`v1.0.4`', 'English dry-run visible version');

  const changelogAnchor = '# Changelog\n\nAll notable changes to Makaytron Etsy Keyword & Market Analyzer are documented here.\n\n';
  const changelogEntry = `${changelogAnchor}## [1.0.4] - 2026-09-02\n\n### Changed\n\n- Applied the first MKUI v1 Compact Shell presentation mapping from \`Tamplate-Back-White-01\`: canonical neutral tokens, radii, focus rings, launcher/panel surfaces, controls, buttons, status surfaces, and narrowly scoped inline result styling.\n- Preserved the existing 440 px compact information architecture, open Shadow DOM, Etsy-inline result structure, and every existing \`data-*\` behavior hook.\n\n### Validation\n\n- Added a dedicated Keyword & Market Analyzer regression test and retained updater, privacy, and distribution gates; the migration does not change Marketplace Insights parsing, research envelopes, storage, telemetry, navigation, or update permissions.\n\n`;
  output.changelog = replaceOnce(output.changelog, changelogAnchor, changelogEntry, 'changelog header');
}

assert(output.script.includes('// @version      1.0.4'), 'Target userscript version missing.');
assert(output.script.includes("const APP_VERSION = '1.0.4';"), 'Target APP_VERSION missing.');
assert(output.script.includes("const MKUI_VERSION = '1.0.0';"), 'MKUI marker missing.');
assert(output.script.includes('--ekma-radius-lg:14px'), 'MKUI token mapping missing.');
assert(output.script.includes("attachShadow({ mode: 'open' })"), 'Open Shadow DOM contract missing.');
assert(output.script.includes('.ekma-inline{'), 'Inline integration surface missing.');

if (write) {
  let changed = 0;
  for (const [key, file] of Object.entries(paths)) {
    if (output[key] === original[key]) continue;
    fs.writeFileSync(file, output[key], 'utf8');
    changed += 1;
  }
  console.log(changed ? `MKUI Keyword pilot applied to ${changed} files.` : 'MKUI Keyword pilot already applied; invariants verified.');
} else {
  console.log(alreadyApplied ? 'MKUI Keyword pilot already applied; invariants verified.' : 'MKUI Keyword pilot dry-run passed; no files changed.');
}
