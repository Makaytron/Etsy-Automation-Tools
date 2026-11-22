// Tests for adopting the standalone Message Assistant as an engine in the unified script,
// and for keeping its credentials out of the tool's namespace.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

import { adoptMessageAssistant, MA_EDITS, MA_SOURCE } from './Unified-Adopt-Message-Assistant.mjs';
import { createScopedGm, splitSecrets, mergeSecrets } from '../src/core/scoped-gm.js';
import { createMemoryStore } from '../src/core/gm.js';
import { createStorage } from '../src/core/storage.js';
import { MESSAGE_ASSISTANT_SECRETS } from '../src/modules/index.js';

const source = fs.readFileSync(MA_SOURCE, 'utf8');
const adopted = adoptMessageAssistant(source);

const handoff = (() => {
  const context = vm.createContext({});
  vm.runInContext(`${fs.readFileSync(new URL('../shared/migration/handoff.js', import.meta.url), 'utf8')}\nthis.H = { MIGRATION_SPECS };`, context);
  return context.H;
})();

// A memory store with the GM interface the shim expects.
function fakeGm() {
  const store = createMemoryStore();
  return { store, gm: { getValue: store.get, setValue: store.set, deleteValue: store.delete, listValues: store.keys } };
}
// Built at run time so no credential-shaped literal sits in the repository.
const fakeSecret = (label) => ['test', label, 'x'.repeat(8)].join('-');

test('every edit applies and the engine keeps its version', () => {
  const version = source.match(/^\/\/ @version\s+(\S+)/m)[1];
  assert.ok(adopted.includes(`const ADOPTED_MESSAGE_ASSISTANT_VERSION = '${version}';`));
  for (const [from, to] of MA_EDITS) {
    assert.ok(adopted.includes(to), to);
    if (!to.includes(from)) assert.ok(!adopted.includes(from), `${from} is gone`);
  }
  assert.match(adopted, /^async function createAdoptedMessageAssistant\(__env\) \{/m);
  assert.match(adopted, /start: \(\) => App\.init\(\), version: APP_VERSION,/);
  assert.match(adopted, /snapshot: __eatSnapshot, openPanel: __eatOpen,/);
  assert.equal(adopted.split('__env.onChange?.();').length - 1, 3, 'render, busy and close hooks');
  assert.ok(adopted.includes('.ma-launcher{display:none!important}'), 'the edge button replaces the floating launcher');
  assert.doesNotMatch(adopted, /\n {4}await App\.init\(\);\n\}\)\(\);/, 'the standalone self-start is removed');
});

test('the engine never reaches the manager\'s global GM', () => {
  assert.doesNotMatch(adopted, /globalThis\.GM\b/);
  assert.doesNotMatch(adopted, /globalThis\.GM_info/);
  assert.match(adopted, /const GM = __env\.GM;/);
  assert.match(adopted, /function telemetrySuppressed\(\) \{\n {8}return true;/);
  assert.match(adopted, /RUNTIME_ROUTE_PATTERN\.test\(path\) && __env\.isAllowed\(\)/);
});

test('the Etsy send lock is shared with a standalone copy; storage locks are not', () => {
  assert.match(adopted, /const ETSY_SEND_COORDINATION_LOCK = `\$\{APP\.prefix\}:etsy-send-coordination:v1`;/);
  assert.match(adopted, /const CAMPAIGN_COORDINATION_LOCK = 'eat-ma:campaign-status-coordination:v1';/);
  assert.match(adopted, /const HISTORY_COORDINATION_LOCK = 'eat-ma:history-coordination:v1';/);
  assert.match(adopted, /const CONFIG_COORDINATION_LOCK = 'eat-ma:config-coordination:v1';/);
});

test('the credential paths are the ones the transfer strips', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(MESSAGE_ASSISTANT_SECRETS)), JSON.parse(JSON.stringify(handoff.MIGRATION_SPECS['message-assistant'].secrets)));
});

test('split and merge give back the same object', () => {
  const paths = MESSAGE_ASSISTANT_SECRETS['mema:providers'];
  const value = { openai: { apiKey: fakeSecret('a'), model: 'm1' }, gemini: { apiKey: '', model: 'm2' } };
  const [rest, found] = splitSecrets(paths, value);
  assert.deepEqual(rest, { openai: { apiKey: '', model: 'm1' }, gemini: { apiKey: '', model: 'm2' } });
  assert.deepEqual(found, { openai: { apiKey: value.openai.apiKey } });
  assert.deepEqual(mergeSecrets(paths, rest, found), value);
  assert.deepEqual(splitSecrets(paths, { gemini: { apiKey: '' } }), [{ gemini: { apiKey: '' } }, null]);
});

test('credentials written by the engine live under eat:secret: and stay out of backups', async () => {
  const { store, gm } = fakeGm();
  const scoped = createScopedGm({ gm, namespace: 'message-assistant', doc: null, secrets: MESSAGE_ASSISTANT_SECRETS });
  const settings = { language: 'tr', deeplApiKey: fakeSecret('d'), messageCenterAgentToken: fakeSecret('t'), tone: 'warm' };
  const providers = { openai: { apiKey: fakeSecret('o'), model: 'x' } };
  await scoped.setValue('mema:settings', settings);
  await scoped.setValue('mema:providers', providers);
  await scoped.setValue('mema:templates', [{ id: 'a' }]);

  const raw = store.snapshot();
  assert.deepEqual(raw['eat:v1:message-assistant:legacy.mema.settings'], { ...settings, deeplApiKey: '', messageCenterAgentToken: '' });
  assert.deepEqual(raw['eat:v1:message-assistant:legacy.mema.providers'], { openai: { apiKey: '', model: 'x' } });
  assert.deepEqual(raw['eat:secret:message-assistant.legacy.mema.settings'], { deeplApiKey: settings.deeplApiKey, messageCenterAgentToken: settings.messageCenterAgentToken });
  assert.ok(!JSON.stringify(Object.entries(raw).filter(([k]) => !k.startsWith('eat:secret:'))).includes('test-'), 'no credential outside eat:secret:');

  assert.deepEqual(await scoped.getValue('mema:settings', null), settings, 'the engine reads what it wrote');
  assert.deepEqual(await scoped.getValue('mema:providers', null), providers);

  const backup = JSON.stringify(await createStorage(store).exportBackup());
  assert.ok(!backup.includes('test-'), 'the backup has no credential');

  // Clearing the key in the engine removes the stored credential too.
  await scoped.setValue('mema:providers', { openai: { apiKey: '', model: 'x' } });
  assert.equal(store.snapshot()['eat:secret:message-assistant.legacy.mema.providers'], undefined);
  await scoped.deleteValue('mema:settings');
  assert.equal(store.snapshot()['eat:secret:message-assistant.legacy.mema.settings'], undefined);
});

test('adoption fails loudly when the standalone script changes shape', () => {
  assert.throws(() => adoptMessageAssistant(source.replace('globalThis.GM?.addStyle', 'globalThis.GM.addStyle')), /global GM access/);
  assert.throws(() => adoptMessageAssistant(source.replace('    await App.init();\n})();\n', '    void App.init();\n})();\n')), /closing block/);
});

test('the drawer shows the translation of the open conversation once it is there', async () => {
  const { renderMaDrawer } = await import('../src/modules/message-assistant-ui.js');
  const { createFakeDocument, root } = await import('./Unified-Fake-Dom.mjs');
  const doc = createFakeDocument();
  const actions = new Proxy({ languages: () => ['en', 'tr'] }, { get: (t, k) => t[k] ?? (() => {}) });
  const view = {
    previewLanguage: 'tr', templates: [], ai: { hasKey: false },
    conversation: { id: '1', name: 'Fixture Buyer', orderId: '', language: 'en', replyLanguage: 'en', last: 'Okay thank you!', translation: 'Tamam, teşekkür ederim!' },
  };
  const box = root(doc, renderMaDrawer(doc, { snap: { busy: false }, view, language: 'tr', actions }));
  const shown = box.find((n) => n.getAttribute('data-role') === 'ma-translation');
  assert.equal(shown.length, 1, 'the translation is visible in the drawer, not only in the workspace');
  assert.match(shown[0].textContent, /Tamam, teşekkür ederim!/);
});
