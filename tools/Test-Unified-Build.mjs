// Tests for the unified userscript build (tools/Build-Unified-Userscript.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

import { buildUnified, assertSupportedSyntax, sha256 } from './Build-Unified-Userscript.mjs';

const built = await buildUnified();

test('build is deterministic and uses LF line endings', async () => {
  assert.equal(sha256(await buildUnified()), sha256(built));
  assert.ok(!built.includes('\r'));
});

test('header is a development header with the new identity', () => {
  const header = built.slice(0, built.indexOf('// ==/UserScript==') + 18);
  const one = (key) => header.match(new RegExp(`^// @${key}\\s+(.+)$`, 'm'))?.[1];
  assert.equal(one('name'), 'Makaytron Etsy Automation Tools');
  assert.equal(one('namespace'), 'https://makaytron.com/etsy-automation-tools');
  assert.match(one('version'), /^\d+\.\d+\.\d+$/);
  assert.equal(one('license'), 'MIT');
  assert.match(header, /^\/\/ @noframes$/m);
  assert.match(header, /^\/\/ @antifeature\s+ads$/m);
  assert.doesNotMatch(header, /@updateURL|@downloadURL/, 'not a production package yet');
  assert.doesNotMatch(header, /@connect\s+\*$/m, 'no wildcard connect');
  // The standalone identities must not be reused.
  assert.doesNotMatch(header, /@namespace\s+https:\/\/github\.com\/Makaytron\/EtsyScript/);
});

test('shared lifecycle, migration handoff and the adopted Sale Manager are inlined', () => {
  const count = (marker) => built.split(marker).length - 1;
  for (const marker of ['BEGIN MIGRATION HANDOFF', 'END MIGRATION HANDOFF', 'BEGIN ADOPTED SALE MANAGER', 'END ADOPTED SALE MANAGER',
    'BEGIN ADOPTED ADS KEYWORD MANAGER', 'END ADOPTED ADS KEYWORD MANAGER']) {
    assert.equal(count(marker), 1, marker);
  }
  // One copy for the unified host and one inside each adopted engine (Sale Manager, Ads Keyword Manager).
  assert.equal(count('BEGIN SPA LIFECYCLE'), 6);
  assert.equal(count('END SPA LIFECYCLE'), 6);
});

test('output contains no remote code execution', () => {
  const body = built.slice(built.indexOf('// ==/UserScript=='));
  assert.doesNotMatch(body, /\beval\s*\(|\bnew\s+Function\s*\(|\bimport\s*\(/);
  assert.doesNotMatch(body, /^\s*(import|export)\s/m, 'all module syntax is bundled away');
});

test('bundler refuses syntax it cannot bundle', () => {
  for (const bad of ['export default 1;', 'export { a };', "import x from './x.js';", 'const m = await import("./x.js");', 'eval("1")']) {
    assert.throws(() => assertSupportedSyntax(bad, 'sample'), /unsupported syntax/, bad);
  }
  assert.doesNotThrow(() => assertSupportedSyntax("import { a } from './a.js';\nexport function b() {}", 'sample'));
});

// A seller page without a tool: the boot path is checked here, the Sale Manager engine in real Chrome.
function sandbox({ pathname = '/your/shops/me/stats', framed = false } = {}) {
  const values = new Map();
  const errors = [];
  const window = {
    addEventListener() {}, removeEventListener() {},
    setInterval: () => 1, clearInterval() {},
  };
  window.top = framed ? {} : window;
  window.self = window;
  const context = {
    window,
    location: { pathname, href: `https://www.etsy.com${pathname}` },
    console: { error: (...a) => errors.push(a.map(String).join(' ')), log() {}, warn() {} },
    GM: {
      getValue: async (k, d) => (values.has(k) ? values.get(k) : d),
      setValue: async (k, v) => { values.set(k, v); },
      deleteValue: async (k) => { values.delete(k); },
      listValues: async () => [...values.keys()],
    },
    structuredClone, Promise, Object, Array, Map, Set, Math, Number, String, JSON, RegExp, Error, TypeError, Symbol,
  };
  window.location = context.location;
  window.GM = context.GM;
  return { context: vm.createContext(context), window, values, errors };
}

const settle = () => new Promise((r) => setTimeout(r, 20));

test('built script boots once on a supported page without errors or page globals', async () => {
  const s = sandbox();
  const before = new Set(Object.keys(s.window));
  vm.runInContext(built, s.context);
  await settle();
  assert.deepEqual(s.errors, []);
  assert.equal(s.window.__etsyAutomationToolsBooted, true);
  const added = Object.keys(s.window).filter((k) => !before.has(k));
  assert.deepEqual(added, ['__etsyAutomationToolsBooted']);
  vm.runInContext(built, s.context); // a second copy must not start again
  await settle();
  assert.deepEqual(s.errors, []);
});

test('built script stays idle inside iframes', async () => {
  const s = sandbox({ framed: true });
  vm.runInContext(built, s.context);
  await settle();
  assert.equal(s.window.__etsyAutomationToolsBooted, undefined);
  assert.deepEqual(s.errors, []);
});

test('the production build carries the canonical update URLs and a synchronized runtime version', async () => {
  const { buildUnified, RAW_MAIN } = await import('./Build-Unified-Userscript.mjs');
  const { META } = await import('../src/meta.js');
  const production = await buildUnified({ production: true });
  const header = production.slice(0, production.indexOf('// ==/UserScript==') + 18);
  const all = (key) => [...header.matchAll(new RegExp(`^// @${key}\\s+(.+)$`, 'gm'))].map((m) => m[1]);
  const url = `${RAW_MAIN}${META.scriptPath}`;
  assert.deepEqual(all('updateURL'), [url]);
  assert.deepEqual(all('downloadURL'), [url]);
  assert.deepEqual(all('name'), ['Makaytron Etsy Automation Tools']);
  assert.match(all('version')[0], /^\d+\.\d+\.\d+$/);
  assert.ok(production.includes(`const APP_VERSION = '${all('version')[0]}';`));
  assert.match(META.scriptPath, /^scripts\/etsy-automation-tools\/[^/]+\.user\.js$/);
  // The standalone scripts' notice links to the same file.
  const notice = fs.readFileSync(new URL('../shared/migration/notice.js', import.meta.url), 'utf8');
  assert.ok(notice.includes(`const EAT_INSTALL_URL = '${url}';`));
  // Development and production builds differ only in the header lines and the banner.
  const development = await buildUnified();
  const strip = (text) => text.split('\n').filter((l) => !/^\/\/ @(updateURL|downloadURL)\b/.test(l) && !/^\/\/ (Etsy Automation Tools\. Generated|Development build)/.test(l)).join('\n');
  assert.equal(strip(production), strip(development));
});

test('interface styles avoid rem units, which follow the Etsy page root font size inside shadow DOM', async () => {
  // Etsy sets <html> to about 10.7px, so 32rem became ~341px and the dialogs and sidebar were squeezed.
  for (const file of ['../src/ui/styles.js', '../src/ui/styles-workspace.js']) {
    const css = fs.readFileSync(new URL(file, import.meta.url), 'utf8').split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(css, /\d(?:\.\d+)?rem\b/, `${file} uses rem`);
  }
});
