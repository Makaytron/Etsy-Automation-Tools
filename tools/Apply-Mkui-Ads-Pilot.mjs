import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const target = path.join(repoRoot, 'scripts/etsy-ads-keyword-manager/Makaytron-Etsy-Ads-Keyword-Manager.user.js');
const source = fs.readFileSync(target, 'utf8');
const write = process.argv.includes('--write');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from);
  assert(first >= 0, `Missing MKUI pilot anchor: ${label}`);
  assert(text.indexOf(from, first + from.length) < 0, `Ambiguous MKUI pilot anchor: ${label}`);
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

const requiredHooks = [
  'data-panel-state',
  'data-panel-status-title',
  'data-panel-status-text',
  'data-collapse',
  'data-expand',
  'data-language-toggle',
  'data-script-update-check',
  'data-script-update-banner',
  'data-script-update-message',
  'data-script-update-install',
  'data-action="close-page"',
  'data-action="open-page"',
  'data-action="close-all"',
  'data-action="edit"',
  'data-action="update"',
];

const protectedMetadataPrefixes = ['// @match', '// @grant', '// @connect', '// @updateURL', '// @downloadURL'];
const metadataSnapshot = (text) => text
  .split(/\r?\n/)
  .filter((line) => protectedMetadataPrefixes.some((prefix) => line.startsWith(prefix)))
  .join('\n');

for (const hook of requiredHooks) assert(count(source, hook) > 0, `Missing behavior hook: ${hook}`);
const metadataBefore = metadataSnapshot(source);

const alreadyApplied = source.includes('// @version      1.0.4')
  && source.includes("const APP_VERSION = '1.0.4';")
  && source.includes("const MKUI_VERSION = '1.0.0';")
  && source.includes('--maw-radius-lg:14px')
  && source.includes('border-radius:var(--maw-radius-lg)');

let output = source;

if (!alreadyApplied) {
  const styleStart = source.indexOf('    addStyle(`');
  const styleEndMarker = '\n    `);\n\n    const ICON_PATHS';
  const styleEnd = source.indexOf(styleEndMarker, styleStart);
  assert(styleStart >= 0 && styleEnd > styleStart, 'Unable to isolate Ads UI style block.');

  let head = source.slice(0, styleStart);
  let styles = source.slice(styleStart, styleEnd);
  const tail = source.slice(styleEnd);

  head = replaceOnce(head, '// @version      1.0.3', '// @version      1.0.4', 'userscript version');
  head = replaceOnce(head, "    const APP_VERSION = '1.0.3';", "    const APP_VERSION = '1.0.4';\n    const MKUI_VERSION = '1.0.0';", 'runtime version marker');

  styles = replaceOnce(
    styles,
    '--maw-muted:#f7f7f7;--maw-muted-2:#f2f2f2;--maw-muted-fg:#737373;--maw-border:#e7e7e7;--maw-input:#dedede;--maw-primary:#1f1f1f;--maw-primary-fg:#fafafa;--maw-danger:#b91c1c;--maw-danger-soft:#fff1f1;--maw-warning:#8a5a00;--maw-warning-soft:#fff8ed;--maw-success:#276749;--maw-success-soft:#eef8f1;',
    '--maw-muted:#f2f2f2;--maw-muted-2:#eeeeee;--maw-muted-fg:#595959;--maw-border:#dedede;--maw-input:#cfcfcf;--maw-primary:#1f1f1f;--maw-primary-fg:#fafafa;--maw-danger:#b42318;--maw-danger-soft:#fff1f0;--maw-warning:#8a5a00;--maw-warning-soft:#fff9df;--maw-success:#1f7a4d;--maw-success-soft:#edf8f1;--maw-radius-sm:7px;--maw-radius-md:10px;--maw-radius-lg:14px;--maw-radius-pill:999px;--maw-focus:0 0 0 3px rgba(23,23,23,.14);',
    'canonical MKUI tokens',
  );

  styles = replaceOnce(styles, 'border-radius:11px;background:var(--maw-card);box-shadow:0 1px 3px rgba(15,23,42,.08),0 12px 30px rgba(15,23,42,.08)', 'border-radius:var(--maw-radius-lg);background:var(--maw-card);box-shadow:0 1px 3px rgba(0,0,0,.08),0 18px 44px rgba(0,0,0,.14)', 'panel surface');
  styles = replaceOnce(styles, '.maw-head{padding:13px 14px;', '.maw-head{padding:14px 16px;', 'panel header spacing');
  styles = replaceOnce(styles, '.maw-title{margin:0;font-size:13.5px;font-weight:700;', '.maw-title{margin:0;font-size:14px;font-weight:760;', 'panel title typography');
  styles = replaceOnce(styles, '.maw-version,#${PANEL_ROOT_ID} .maw-pill{height:20px;padding:0 7px;', '.maw-version,#${PANEL_ROOT_ID} .maw-pill{height:22px;padding:0 8px;', 'version/pill size');
  styles = replaceOnce(styles, 'border-radius:999px;background:var(--maw-muted);color:#525252;font-size:10.5px;font-weight:650;', 'border-radius:var(--maw-radius-pill);background:var(--maw-muted);color:#404040;font-size:10.5px;font-weight:700;', 'version/pill styling');
  styles = replaceOnce(styles, 'button,.maw-modal button{min-height:36px;padding:0 12px;display:inline-flex;align-items:center;justify-content:center;gap:6px;border-radius:6px;', 'button,.maw-modal button{min-height:38px;padding:0 12px;display:inline-flex;align-items:center;justify-content:center;gap:7px;border-radius:var(--maw-radius-sm);', 'button primitive');
  styles = replaceOnce(styles, 'button:focus-visible,.maw-modal button:focus-visible,.maw-modal textarea:focus-visible{outline:2px solid #525252;outline-offset:2px}', 'button:focus-visible,.maw-modal button:focus-visible,.maw-modal textarea:focus-visible{outline:0;box-shadow:var(--maw-focus)}', 'focus ring');
  styles = replaceOnce(styles, '.maw-icon-btn,.maw-modal .maw-icon-btn{width:30px;min-width:30px;height:30px;min-height:30px;padding:0;border:1px solid var(--maw-border,#e7e7e7);background:#fff;color:#737373}', '.maw-icon-btn,.maw-modal .maw-icon-btn{width:32px;min-width:32px;height:32px;min-height:32px;padding:0;border:1px solid var(--maw-border,#dedede);border-radius:var(--maw-radius-sm);background:#fff;color:var(--maw-muted-fg)}', 'icon button primitive');
  styles = replaceOnce(styles, '.maw-body{min-height:0;padding:14px;', '.maw-body{min-height:0;padding:16px;', 'body spacing');
  styles = replaceOnce(styles, '.maw-status-card{margin-bottom:12px;padding:10px 11px;display:flex;align-items:flex-start;gap:9px;border:1px solid var(--maw-border);border-radius:8px;background:var(--maw-muted)}', '.maw-status-card{margin-bottom:12px;padding:12px;display:flex;align-items:flex-start;gap:10px;border:1px solid var(--maw-border);border-radius:var(--maw-radius-md);background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.025)}', 'status card');
  styles = replaceOnce(styles, '.maw-status-icon{width:25px;height:25px;display:grid;place-items:center;flex:0 0 auto;border:1px solid var(--maw-border);border-radius:7px;background:#fff;color:#525252}', '.maw-status-icon{width:28px;height:28px;display:grid;place-items:center;flex:0 0 auto;border:1px solid var(--maw-border);border-radius:var(--maw-radius-sm);background:var(--maw-muted);color:#404040}', 'status icon');
  styles = replaceOnce(styles, '.maw-chip{min-width:0;padding:9px 10px;border:1px solid var(--maw-border);border-radius:8px;background:#fff}', '.maw-chip{min-width:0;padding:10px 11px;border:1px solid var(--maw-border);border-radius:var(--maw-radius-md);background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.02)}', 'stat card primitive');
  styles = replaceOnce(styles, '.maw-collapsed-tab{width:62px;height:52px;min-height:52px;padding:0;border:1px solid #d7d7d7;border-right:0;border-radius:10px 0 0 10px;background:#fff;color:#171717;box-shadow:0 10px 26px rgba(0,0,0,.17)}', '.maw-collapsed-tab{width:62px;height:52px;min-height:52px;padding:0;border:1px solid var(--maw-border);border-right:0;border-radius:14px 0 0 14px;background:#fff;color:#171717;box-shadow:0 12px 30px rgba(0,0,0,.14)}', 'collapsed launcher');
  styles = replaceOnce(styles, '.maw-toast{opacity:0;transform:translateY(8px);padding:11px 13px;border:1px solid rgba(255,255,255,.13);border-radius:8px;background:#262626;', '.maw-toast{opacity:0;transform:translateY(8px);padding:11px 13px;border:1px solid rgba(255,255,255,.13);border-radius:var(--maw-radius-md);background:#262626;', 'toast radius');
  styles = replaceOnce(styles, '.maw-toast.is-visible{opacity:1;transform:translateY(0)}.maw-toast.success{background:#276749}.maw-toast.warning{background:#8a5a00}.maw-toast.error{background:#b91c1c}', '.maw-toast.is-visible{opacity:1;transform:translateY(0)}.maw-toast.success{background:#1f7a4d}.maw-toast.warning{background:#8a5a00}.maw-toast.error{background:#b42318}', 'toast semantics');
  styles = replaceOnce(styles, '.maw-modal{--maw-border:#e7e7e7;--maw-muted:#f7f7f7;--maw-input:#dedede;--maw-primary:#1f1f1f;', '.maw-modal{--maw-border:#dedede;--maw-muted:#f2f2f2;--maw-input:#cfcfcf;--maw-primary:#1f1f1f;--maw-radius-sm:7px;--maw-radius-md:10px;--maw-radius-lg:14px;--maw-focus:0 0 0 3px rgba(23,23,23,.14);', 'modal tokens');
  styles = replaceOnce(styles, 'border-radius:12px;background:#fff;box-shadow:0 25px 50px -12px rgba(0,0,0,.26)', 'border-radius:var(--maw-radius-lg);background:#fff;box-shadow:0 25px 50px -12px rgba(0,0,0,.26)', 'modal surface');
  styles = replaceOnce(styles, '.maw-modal-title{margin:0;font-size:15px;font-weight:700;', '.maw-modal-title{margin:0;font-size:15px;font-weight:760;', 'modal title typography');
  styles = replaceOnce(styles, '.maw-modal-subtitle{margin-top:3px;color:#737373;', '.maw-modal-subtitle{margin-top:3px;color:#595959;', 'modal muted text');

  output = head + styles + tail;
}

for (const hook of requiredHooks) {
  assert(count(output, hook) === count(source, hook), `Behavior hook count changed: ${hook}`);
}
assert(metadataSnapshot(output) === metadataBefore, 'Protected userscript metadata changed.');
assert(output.includes("const MKUI_VERSION = '1.0.0';"), 'MKUI version marker missing.');
assert(output.includes('--maw-radius-lg:14px'), 'MKUI token mapping missing.');
assert(output.includes('// @version      1.0.4'), 'Pilot version bump missing.');

if (write && output !== source) {
  fs.writeFileSync(target, output, 'utf8');
  console.log('MKUI Ads pilot applied and invariants preserved.');
} else if (alreadyApplied) {
  console.log('MKUI Ads pilot already applied; invariants verified.');
} else {
  console.log('MKUI Ads pilot dry-run passed; no files changed.');
}
