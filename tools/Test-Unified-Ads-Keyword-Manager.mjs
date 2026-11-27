// Tests for adopting the standalone Ads Keyword Manager as an engine in the unified script.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { adoptAdsKeywordManager, ADS_EDITS, ADS_SOURCE } from './Unified-Adopt-Ads-Keyword-Manager.mjs';

const source = fs.readFileSync(ADS_SOURCE, 'utf8');
const adopted = adoptAdsKeywordManager(source);

test('every edit applies and the engine keeps its version', () => {
  const version = source.match(/^\/\/ @version\s+(\S+)/m)[1];
  assert.ok(adopted.includes(`const ADOPTED_ADS_KEYWORD_MANAGER_VERSION = '${version}';`));
  for (const [from, to] of ADS_EDITS) {
    assert.ok(adopted.includes(to), to);
    if (!to.includes(from)) assert.ok(!adopted.includes(from), `${from} is gone`);
  }
  assert.match(adopted, /^async function createAdoptedAdsKeywordManager\(__env\) \{/m);
  assert.match(adopted, /start: __eatStart, suspend: suspendAdsRoute, version: APP_VERSION,/);
  assert.doesNotMatch(adopted, /\n\}\)\(\);\n?$/, 'the standalone self-start is removed');
});

test('the engine reaches the userscript manager only through the unified shims', () => {
  assert.match(adopted, /const GM = __env\.GM;/);
  assert.match(adopted, /const GM_xmlhttpRequest = __env\.xmlHttpRequest;/);
  assert.match(adopted, /const GM_info = undefined, GM_addElement = undefined;/, 'no script info, so its own update check reports an unknown source');
  assert.match(adopted, /const GM_registerMenuCommand = \(\) => null/);
  assert.match(adopted, /function telemetrySuppressed\(\) \{\n {8}return true;/);
  assert.match(adopted, /RUNTIME_ROUTE_PATTERN\.test\(path\) && __env\.isAllowed\(\)/);
  for (const id of ["'makaytron-ad-wordlist'", "'makaytron-ad-wordlist-toasts'", "'makaytron-ad-wordlist-editor'"]) assert.ok(!adopted.includes(id), id);
});

test('adoption fails loudly when the standalone script changes shape', () => {
  assert.throws(() => adoptAdsKeywordManager(source.replace("'makaytron-ad-wordlist-editor'", "'makaytron-ad-editor'")), /editor element id/);
  assert.throws(() => adoptAdsKeywordManager(source.replace("window.addEventListener('load', () => { void RouteLifecycle.start(", "window.addEventListener('DOMContentLoaded', () => { void RouteLifecycle.start(")), /closing block/);
  assert.throws(() => adoptAdsKeywordManager(source.replace("(function () {\n    'use strict';\n", "(() => {\n    'use strict';\n")), /entry marker/);
});

test('the unified screens get a read-only snapshot and the engine actions', () => {
  // Commands are the engine's own functions, so its busy, editor and confirmation checks stay in force.
  assert.match(adopted, /closePage: \(\) => runToggleRows\(false\), openPage: \(\) => runToggleRows\(true\), closeAllPages: \(ask\) => __eatConfirmedToggle\(ask, true\), closePageConfirmed: \(ask\) => __eatConfirmedToggle\(ask, false\),/);
  assert.match(adopted, /updateList: ensureWord, restoreBackup: restoreWordlistBackup, editRules: openWordlistEditor,/);
  assert.match(adopted, /snapshot: __eatSnapshot, rules: __eatRules, syncLanguage: __eatSyncLanguage,/);
  // The screens hear about counts, status and busy changes.
  assert.equal(adopted.split('__env.onChange?.();').length - 1, 5); // three engine hooks, plus the single-row switch and the word list save
  assert.match(adopted, /__eatStats = \{ \.\.\.values \};\n {8}__env\.onChange\?\.\(\);/);
  // The language sync never runs during a job.
  assert.match(adopted, /if \(activeOperation \|\| wordlistUpdateRunning \|\| languageChangePromise\) return null;/);
});

test('turning keywords off from every page or a shortcut asks in the unified dialog, not window.confirm', () => {
  const bridge = adopted.slice(adopted.indexOf('async function __eatConfirmedToggle'));
  const body = bridge.slice(0, bridge.indexOf('\n    }\n') + 6);
  assert.doesNotMatch(body, /window\.confirm/);
  // The engine's gates run before the question and again after it; only an explicit true goes on.
  assert.match(body, /const before = __eatToggleGate\(\);[\s\S]*\(await ask\(\)\) !== true\) return null;\s*if \(__eatToggleGate\(\)\) return null;\s*return runToggleRows\(false, allPages\);/);
  assert.match(adopted, /function __eatToggleGate\(\) \{\s*if \(!RouteLifecycle\.allowed\(\)\) return 'blocked';\s*if \(activeOperation \|\| wordlistUpdateRunning\)[\s\S]*?EDITOR_MODAL_ID/);
});

test('the turn-off dialog answers yes only from its confirm button', async () => {
  const { confirmAdsDisable } = await import('../src/modules/ads-keyword-manager-ui.js');
  const { createFakeDocument } = await import('./Unified-Fake-Dom.mjs');
  const open = (scope) => {
    const doc = createFakeDocument();
    const container = doc.createElement('div');
    const answers = [];
    confirmAdsDisable(doc, container, { scope, matches: 5, language: 'en', onAnswer: (v) => answers.push(v) });
    const overlay = container.children[0];
    const by = (attr, value) => overlay.find((n) => n.getAttribute(attr) === value)[0];
    return { container, overlay, answers, by };
  };

  const yes = open('all');
  assert.match(yes.overlay.textContent, /Turn off the matches on every page\?/);
  assert.match(yes.overlay.textContent, /5 match on this page/);
  yes.by('data-ads', 'confirm-disable').click();
  assert.deepEqual(yes.answers, [true], 'one answer, yes');
  assert.equal(yes.container.children.length, 0, 'the dialog is closed');

  const cancel = open('page');
  assert.match(cancel.overlay.textContent, /Turn off the matches on this page\?/);
  assert.match(cancel.overlay.textContent, /Turn off the 5 matches on this page/);
  cancel.by('data-ads', 'confirm-cancel').click();
  assert.deepEqual(cancel.answers, [false]);

  const x = open('all');
  x.by('data-action', 'dialog-close').click();
  assert.deepEqual(x.answers, [false], 'the X answers no');

  const esc = open('all');
  for (const fn of esc.overlay.listeners.get('keydown')) fn({ key: 'Escape', stopPropagation() {} });
  assert.deepEqual(esc.answers, [false], 'Escape answers no');
});

test('the shell hands its UI to tool shortcuts so a tool can ask before acting', () => {
  const shell = fs.readFileSync(new URL('../src/ui/shell.js', import.meta.url), 'utf8');
  assert.match(shell, /shortcut\?\.\(action, toolUi\(\)\) === true/);
  const module = fs.readFileSync(new URL('../src/modules/ads-keyword-manager.js', import.meta.url), 'utf8');
  assert.match(module, /action === 'adsClosePage'\) \{ void Promise\.resolve\(state\.engine\.closePageConfirmed\(askFor\(ui, 'page'\)\)\)/);
  assert.match(module, /action === 'adsScanAll'\) \{ void Promise\.resolve\(state\.engine\.closeAllPages\(askFor\(ui, 'all'\)\)\)/);
});

test('only the unified shortcuts run: the engine does not install its own Ctrl+Alt+K and Ctrl+Space', () => {
  assert.match(adopted, /if \(false\) document\.addEventListener\('keydown', \(e\) => \{\n {8}if \(!RouteLifecycle\.allowed\(\) \|\| e\.repeat/);
  assert.equal(adopted.split("document.addEventListener('keydown'").length - 1, 2, 'the rule editor keeps its own keys; the shortcut listener is the disabled one');
});
