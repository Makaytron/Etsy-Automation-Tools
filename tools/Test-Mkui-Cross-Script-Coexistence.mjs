import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  auditGlobalCssIsolation,
  buildCrossScriptAudit,
  checkCommittedAudit,
  extractGlobalCssBodies,
  extractWindowGlobals,
  matchPatternToRegex,
  urlMatchesPattern,
} from './Audit-Mkui-Cross-Script-Coexistence.mjs';
import {
  MKUI_PRODUCTION_SCRIPTS,
  MKUI_ROOT,
} from './Mkui-Production-Registry.mjs';

function metadata(matches, version = '1.0.0') {
  return [
    '// ==UserScript==',
    '// @name Synthetic MKUI fixture',
    `// @version ${version}`,
    ...matches.map(pattern => `// @match ${pattern}`),
    '// @run-at document-idle',
    '// ==/UserScript==',
  ].join('\n');
}

function syntheticSource(definition, options = {}) {
  const shadow = definition.expectedShadowModes
    .map(mode => `document.createElement('div').attachShadow({ mode: '${mode}' });`)
    .join('\n');
  const rootId = `makaytron-${definition.id}-root`;
  const prefix = definition.cssPrefixes[0];
  const css = options.unsafeCss || `.${prefix}root{position:fixed;right:12px;top:72px;z-index:2147483000}`;
  const cssDeclaration = definition.id === 'message-assistant'
    ? `const GLOBAL_CSS = \`${css}\`;`
    : `addStyle(\`${css}\`);`;
  const windowGlobal = options.windowGlobal || `__${definition.id.replaceAll('-', '_').toUpperCase()}__`;
  const storageKey = options.storageKey || `makaytron:${definition.id}:state`;
  const eventName = options.eventName || `makaytron:${definition.id}:ready`;
  const matches = {
    'ads-keyword-manager': ['https://www.etsy.com/your/shops/me/advertising/listings/*'],
    'keyword-market-analyzer': ['https://www.etsy.com/your/shops/*/marketplace-insights*'],
    'sale-manager': [
      'https://www.etsy.com/your/shops/me/sales-discounts*',
      'https://etsy.com/your/shops/me/sales-discounts*',
    ],
    'message-assistant': [
      'https://www.etsy.com/messages*',
      'https://www.etsy.com/messages/*',
      'https://www.etsy.com/conversations*',
      'https://www.etsy.com/conversations/*',
      'https://www.etsy.com/your/orders/sold*',
      'https://www.etsy.com/your/shops/*/dashboard*',
    ],
    'listing-analyzer': [
      'https://www.etsy.com/your/shops/*/tools/listings*',
      'https://www.etsy.com/your/shops/*/listing-editor/edit/*',
    ],
  }[definition.id];

  return `${metadata(matches)}
(function(){
  const MKUI_VERSION = '1.0.0';
  const TELEMETRY_SCRIPT_ID = '${definition.expectedTelemetryId}';
  const ROOT_ID = '${rootId}';
  const STATE_KEY = '${storageKey}';
  ${cssDeclaration}
  ${shadow}
  window.${windowGlobal} = Object.freeze({});
  document.dispatchEvent(new CustomEvent('${eventName}'));
  GM.getValue(STATE_KEY);
  document.getElementById(ROOT_ID);
})();`;
}

function syntheticOverrides(modifier = () => {}) {
  const overrides = new Map();
  for (const definition of MKUI_PRODUCTION_SCRIPTS) {
    const options = {};
    modifier(definition, options);
    overrides.set(definition.id, syntheticSource(definition, options));
  }
  return overrides;
}

test('userscript match patterns preserve literal URL structure and wildcard tails', () => {
  const regex = matchPatternToRegex('https://www.etsy.com/your/shops/*/dashboard*');
  assert.equal(regex.test('https://www.etsy.com/your/shops/example/dashboard'), true);
  assert.equal(regex.test('https://www.etsy.com/your/shops/example/dashboard?ref=nav'), true);
  assert.equal(regex.test('https://www.etsy.com/your/shops/example/tools/listings'), false);
  assert.equal(
    urlMatchesPattern(
      'https://etsy.com/your/shops/me/sales-discounts',
      'https://etsy.com/your/shops/me/sales-discounts*',
    ),
    true,
  );
});

test('window-global extraction ignores equality checks and records assignments', () => {
  const source = `
    if (globalThis.doNotTrack === '1') return;
    window.__ONE__ = true;
    window['__TWO__'] = {};
    globalThis.__THREE__ = Object.freeze({});
  `;
  assert.deepEqual(
    extractWindowGlobals(source),
    ['__ONE__', '__THREE__', '__TWO__'],
  );
});

test('global CSS isolation permits namespaced selectors and rejects host-page resets', () => {
  const safe = auditGlobalCssIsolation([
    { label: 'safe', kind: 'global', line: 1, css: '.maw-root button{font:inherit}.maw-toast{position:fixed}' },
  ], ['maw-']);
  assert.equal(safe.unsafeSelectors.length, 0);

  const unsafe = auditGlobalCssIsolation([
    { label: 'unsafe', kind: 'global', line: 1, css: 'button,input{font:inherit}body{overflow:hidden}' },
  ], ['maw-']);
  assert.deepEqual(
    unsafe.unsafeSelectors.map(finding => finding.selector),
    ['body', 'button', 'input'],
  );
});

test('global CSS body extraction resolves simple ID constants', () => {
  const source = `
    const ROOT_ID = 'makaytron-test-root';
    addStyle(\`#\${ROOT_ID}{position:fixed;right:0;top:0}.maw-card{display:block}\`);
  `;
  const bodies = extractGlobalCssBodies(source);
  assert.equal(bodies.length, 1);
  assert.match(bodies[0].css, /#makaytron-test-root/);
});

test('synthetic five-script repository passes every coexistence assertion', async () => {
  const audit = await buildCrossScriptAudit({
    root: MKUI_ROOT,
    sourceOverrides: syntheticOverrides(),
  });
  assert.equal(audit.status, 'pass');
  assert.deepEqual(audit.summary.failedAssertions, []);
  assert.equal(audit.summary.scriptCount, 5);
  assert.equal(audit.assertions.canonicalRoutesHaveSingleOwner, true);
  assert.equal(audit.assertions.globalCssHasNoGenericLeakage, true);
});

test('unexpected shared storage keys fail closed', async () => {
  const audit = await buildCrossScriptAudit({
    root: MKUI_ROOT,
    sourceOverrides: syntheticOverrides((definition, options) => {
      if (['ads-keyword-manager', 'sale-manager'].includes(definition.id)) {
        options.storageKey = 'makaytron:unexpected-shared-state';
      }
    }),
  });
  assert.equal(audit.status, 'fail');
  assert.equal(audit.assertions.storageKeysOnlyShareIntentionalProtocols, false);
  assert.deepEqual(
    audit.matrices.unexpectedStorageCollisions,
    [{
      value: 'makaytron:unexpected-shared-state',
      scripts: ['ads-keyword-manager', 'sale-manager'],
    }],
  );
});

test('generic host-page CSS leakage fails closed', async () => {
  const audit = await buildCrossScriptAudit({
    root: MKUI_ROOT,
    sourceOverrides: syntheticOverrides((definition, options) => {
      if (definition.id === 'sale-manager') options.unsafeCss = 'body{overflow:hidden}';
    }),
  });
  assert.equal(audit.status, 'fail');
  assert.equal(audit.assertions.globalCssHasNoGenericLeakage, false);
  assert.equal(audit.matrices.unsafeGlobalCssSelectors[0].script, 'sale-manager');
});

test('live production sources pass and the committed audit is current', async t => {
  try {
    await Promise.all(MKUI_PRODUCTION_SCRIPTS.map(definition =>
      access(resolve(MKUI_ROOT, definition.path))));
  } catch {
    t.skip('Production userscripts are not present in this isolated unit-test checkout.');
    return;
  }

  const audit = await buildCrossScriptAudit();
  assert.equal(
    audit.status,
    'pass',
    `Failed assertions: ${audit.summary.failedAssertions.join(', ')}`,
  );
  await checkCommittedAudit(audit);
});
