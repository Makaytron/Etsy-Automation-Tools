// Tests for the unified userscript build (tools/Build-Unified-Userscript.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import { buildUnified, assertSupportedSyntax, sha256 } from './Build-Unified-Userscript.mjs';

const built = await buildUnified();

test('build is deterministic and uses LF line endings', async () => {
  assert.equal(sha256(await buildUnified()), sha256(built));
  assert.ok(!built.includes('\r'));
});

test('header is a development header with the new identity', () => {
  const header = built.slice(0, built.indexOf('// ==/UserScript==') + 18);
  const one = (key) => header.match(new RegExp(`^// @${key}\\s+(.+)$`, 'm'))?.[1];
  assert.equal(one('name'), 'Etsy Automation Tools');
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
  for (const marker of ['BEGIN MIGRATION HANDOFF', 'END MIGRATION HANDOFF', 'BEGIN ADOPTED SALE MANAGER', 'END ADOPTED SALE MANAGER']) {
    assert.equal(count(marker), 1, marker);
  }
  // One copy for the unified host, one inside the adopted Sale Manager engine.
  assert.equal(count('BEGIN SPA LIFECYCLE'), 2);
  assert.equal(count('END SPA LIFECYCLE'), 2);
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
