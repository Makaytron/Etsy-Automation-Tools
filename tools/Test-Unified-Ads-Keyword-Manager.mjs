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
  assert.match(adopted, /closePage: \(\) => runToggleRows\(false\), openPage: \(\) => runToggleRows\(true\), closeAllPages: requestDisableAllPages,/);
  assert.match(adopted, /updateList: ensureWord, restoreBackup: restoreWordlistBackup, editRules: openWordlistEditor,/);
  assert.match(adopted, /snapshot: __eatSnapshot, rules: __eatRules, syncLanguage: __eatSyncLanguage,/);
  // The screens hear about counts, status and busy changes.
  assert.equal(adopted.split('__env.onChange?.();').length - 1, 5); // three engine hooks, plus the single-row switch and the word list save
  assert.match(adopted, /__eatStats = \{ \.\.\.values \};\n {8}__env\.onChange\?\.\(\);/);
  // The language sync never runs during a job.
  assert.match(adopted, /if \(activeOperation \|\| wordlistUpdateRunning \|\| languageChangePromise\) return null;/);
});
