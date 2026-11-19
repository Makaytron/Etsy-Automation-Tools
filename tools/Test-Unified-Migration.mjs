// Tests for the one-time transfer from the standalone scripts
// (shared/migration/handoff.js + src/core/migration.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

import { createMemoryStore } from '../src/core/gm.js';
import { createStorage } from '../src/core/storage.js';
import { runLegacyMigration, importLegacyBundle, legacyStorageKey, migratedTools } from '../src/core/migration.js';

const source = fs.readFileSync(new URL('../shared/migration/handoff.js', import.meta.url), 'utf8');
const H = (() => {
  const context = vm.createContext({ crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob, setTimeout, CustomEvent, JSON, Date, Object, Array, Uint8Array, String, Promise, Error, Set });
  vm.runInContext(`${source}\nthis.H = { MIGRATION_SPECS, migrationIsTransferableKey, migrationStripSecrets, createMigrationRequester, createMigrationResponder, createDomMigrationTransport };`, context);
  return context.H;
})();
const rules = { specs: H.MIGRATION_SPECS, isTransferable: H.migrationIsTransferableKey, strip: H.migrationStripSecrets };

/** In-memory bus that also records everything for eavesdropping checks. */
function bus() {
  const subscribers = new Set();
  const transcript = [];
  return {
    transcript,
    transport: {
      send(message) { const text = JSON.stringify(message); transcript.push(text); for (const fn of [...subscribers]) queueMicrotask(() => fn(JSON.parse(text))); },
      subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    },
  };
}

const legacyStore = (values) => ({ get: async (k) => values[k], keys: async () => Object.keys(values) });

// Fake credentials, built at run time so they never sit in the source as key-like literals.
const fakeSecret = (name) => ['FAKE', name, 'SECRET', 'value'].join('-');

const LEGACY = {
  'sale-manager': {
    'eda-batch-config-v4': { discount: 25, discountName: 'WINTER' },
    'eda-batch-report-history-v4': [{ series: 'Ağustos', created: 5 }],
    'eda-batch-job-v4': { running: false }, 'eda-batch-lease-v4': 'lease', 'eda-batch-mutex-v4': 'm', 'eda-batch-update-state-v1': {},
  },
  'ads-keyword-manager': { adWordlist: 'bts\narmy gift', adWordlistLanguage: 'tr', adKeywordManagerScriptUpdateState: {} },
  'keyword-market-analyzer': { 'ekma:v1:settings': { maxSeeds: 1 }, 'ekma:v1:research-cache': { shirt: [1, 2] }, 'ekma:v1:processor-lease': 'x' },
  'listing-analyzer': {
    'meli:v1:settings': { language: 'tr', minVisitsToImprove: 20 },
    'meli:v1:listing:123456789': { title: 'Öğretmen isim tişörtü' },
    'meli:v1:listing:987654321': { title: 'Aile gezisi tişörtü' },
    'meli:v1:lease': 'l', 'meli:v1:update-check': {}, 'meli:v1:collection-navigation-handoff': {},
  },
  'message-assistant': {
    'mema:settings': { language: 'tr', deeplApiKey: fakeSecret('deepl'), messageCenterAgentToken: fakeSecret('agent'), aiProvider: 'anthropic' },
    'mema:providers': { anthropic: { apiKey: fakeSecret('anthropic'), model: 'claude' }, openai: { apiKey: fakeSecret('openai'), model: 'gpt' } },
    'mema:templates': [{ id: 't1', text: 'Merhaba!' }],
    'mema:native-send-attempts:v1': [{ id: 'pending' }], 'mema:update': {},
  },
};

function responders(transport, { busy = [], armed = Object.keys(LEGACY) } = {}) {
  const done = [];
  const statuses = [];
  const list = Object.entries(LEGACY).map(([tool, values]) => {
    const r = H.createMigrationResponder({
      tool, appVersion: '1.0.0', store: legacyStore(values), transport, cryptoApi: globalThis.crypto,
      isBusy: () => busy.includes(tool), onDone: (rec) => done.push(rec.tool), onStatus: (s) => statuses.push({ tool, ...s }),
    });
    if (armed.includes(tool)) r.arm(5000);
    return r;
  });
  return { done, statuses, list };
}

test('all five tools transfer their data; secrets and private state stay behind', async () => {
  const { transport, transcript } = bus();
  const side = responders(transport);
  const storage = createStorage(createMemoryStore());
  const requester = H.createMigrationRequester({ transport, cryptoApi: globalThis.crypto });
  const summary = await runLegacyMigration({ requester, storage, rules, tools: Object.keys(LEGACY), timeoutMs: 200 });
  await new Promise((r) => setTimeout(r, 50));

  assert.deepEqual(summary.map((s) => `${s.tool}:${s.state}`).sort(), Object.keys(LEGACY).map((t) => `${t}:imported`).sort());
  assert.deepEqual(side.done.sort(), Object.keys(LEGACY).sort(), 'every standalone script got a matching acknowledgement');

  const get = (tool, key) => storage.namespace(tool).get(legacyStorageKey(key), undefined);
  assert.deepEqual(await get('sale-manager', 'eda-batch-config-v4'), { discount: 25, discountName: 'WINTER' });
  assert.equal(await get('sale-manager', 'eda-batch-lease-v4'), undefined);
  assert.equal(await get('sale-manager', 'eda-batch-job-v4'), undefined);
  assert.equal(await get('ads-keyword-manager', 'adWordlist'), 'bts\narmy gift');
  assert.deepEqual(await get('listing-analyzer', 'meli:v1:listing:123456789'), { title: 'Öğretmen isim tişörtü' });
  assert.equal(await get('listing-analyzer', 'meli:v1:lease'), undefined);
  assert.equal(await get('message-assistant', 'mema:native-send-attempts:v1'), undefined);

  const settings = await get('message-assistant', 'mema:settings');
  assert.equal(settings.deeplApiKey, '');
  assert.equal(settings.messageCenterAgentToken, '');
  assert.equal(settings.aiProvider, 'anthropic');
  const providers = await get('message-assistant', 'mema:providers');
  assert.equal(providers.anthropic.apiKey, '');
  assert.equal(providers.anthropic.model, 'claude');

  // Nothing secret anywhere in the new storage or on the wire.
  const everything = JSON.stringify(await storage.exportBackup({ appVersion: 'x' })) + transcript.join('\n');
  for (const s of ['SECRET', 'FAKE-', 'Öğretmen', 'WINTER', 'army gift']) {
    const onWire = transcript.join('\n').includes(s);
    assert.equal(onWire, false, `"${s}" must not appear in plain text on the shared channel`);
  }
  assert.ok(!everything.includes('SECRET'));

  // Both sides derive the same check code.
  for (const s of summary) {
    const offered = side.statuses.find((x) => x.tool === s.tool && x.state === 'offered');
    assert.match(s.sas, /^\d{4}$/);
    assert.equal(offered.sas, s.sas);
  }
  assert.deepEqual((await migratedTools(storage, Object.keys(LEGACY))).sort(), Object.keys(LEGACY).sort());
});

test('nothing is offered unless the user armed the standalone script', async () => {
  const { transport } = bus();
  responders(transport, { armed: ['ads-keyword-manager'] });
  const storage = createStorage(createMemoryStore());
  const requester = H.createMigrationRequester({ transport, cryptoApi: globalThis.crypto });
  const summary = await runLegacyMigration({ requester, storage, rules, tools: Object.keys(LEGACY), timeoutMs: 150 });
  assert.deepEqual(summary.map((s) => s.tool), ['ads-keyword-manager']);
});

test('a running job blocks the transfer of that tool', async () => {
  const { transport } = bus();
  responders(transport, { busy: ['sale-manager'], armed: ['sale-manager'] });
  const storage = createStorage(createMemoryStore());
  const requester = H.createMigrationRequester({ transport, cryptoApi: globalThis.crypto });
  const summary = await runLegacyMigration({ requester, storage, rules, tools: ['sale-manager'], timeoutMs: 150 });
  assert.deepEqual(summary, [{ tool: 'sale-manager', state: 'busy' }]);
  assert.deepEqual(await migratedTools(storage, ['sale-manager']), []);
});

test('tampered data is rejected and nothing is stored', async () => {
  const { transport } = bus();
  const tampering = {
    send: transport.send,
    subscribe: (fn) => transport.subscribe((m) => {
      if (m.type === 'offer') { const bytes = atob(m.ciphertext).split(''); bytes[5] = String.fromCharCode(bytes[5].charCodeAt(0) ^ 1); m.ciphertext = btoa(bytes.join('')); }
      fn(m);
    }),
  };
  const side = responders(transport, { armed: ['ads-keyword-manager'] });
  const storage = createStorage(createMemoryStore());
  const requester = H.createMigrationRequester({ transport: tampering, cryptoApi: globalThis.crypto });
  const summary = await runLegacyMigration({ requester, storage, rules, tools: ['ads-keyword-manager'], timeoutMs: 150 });
  assert.deepEqual(summary, [{ tool: 'ads-keyword-manager', state: 'error' }]);
  assert.deepEqual(await migratedTools(storage, ['ads-keyword-manager']), []);
  assert.deepEqual(side.done, []);
});

test('a second transfer does not overwrite the first', async () => {
  const storage = createStorage(createMemoryStore());
  const entry = (adWordlist) => ({ tool: 'ads-keyword-manager', digest: 'd', bundle: { tool: 'ads-keyword-manager', appVersion: '1.0.5', values: { adWordlist } } });
  assert.equal((await importLegacyBundle({ storage, rules, entry: entry('first') })).state, 'imported');
  assert.equal((await importLegacyBundle({ storage, rules, entry: entry('second') })).state, 'already');
  assert.equal(await storage.namespace('ads-keyword-manager').get('legacy.adWordlist'), 'first');
});

test('the receiver ignores keys outside the transfer list and strips secrets again', async () => {
  const storage = createStorage(createMemoryStore());
  const outcome = await importLegacyBundle({
    storage, rules,
    entry: { tool: 'message-assistant', bundle: { tool: 'message-assistant', values: {
      'mema:native-send-attempts:v1': [1], 'eat:secret:x': 'k', 'mema:providers': { openai: { apiKey: fakeSecret('leaked'), model: 'm' } },
    } } },
  });
  assert.deepEqual(outcome.stored, ['mema:providers']);
  assert.deepEqual(outcome.skipped.sort(), ['eat:secret:x', 'mema:native-send-attempts:v1']);
  assert.equal((await storage.namespace('message-assistant').get('legacy.mema.providers')).openai.apiKey, '');
  assert.equal((await importLegacyBundle({ storage, rules, entry: { tool: 'unknown', bundle: { tool: 'unknown', values: {} } } })).state, 'rejected');
});

test('transfer lists match the keys the standalone scripts really use', () => {
  const registry = JSON.parse(fs.readFileSync(new URL('../config/production-packages.json', import.meta.url), 'utf8'));
  for (const pkg of registry) {
    const script = fs.readFileSync(new URL(`../${pkg.scriptPath}`, import.meta.url), 'utf8');
    const spec = H.MIGRATION_SPECS[pkg.id];
    assert.ok(spec, pkg.id);
    const prefix = script.match(/(?:storagePrefix|prefix):\s*'([a-z]+(?::v1)?)'/)?.[1];
    for (const key of [...spec.keys, ...spec.prefixes]) {
      if (script.includes(`'${key}'`)) continue; // literal key
      assert.ok(prefix && key.startsWith(`${prefix}:`), `${pkg.id}: ${key} is not used by the script`);
      const suffix = key.slice(prefix.length).replace(/:$/, ':');
      assert.ok(script.includes(`}${suffix}`), `${pkg.id}: ${key} is not used by the script`);
    }
  }
});

test('DOM transport carries only JSON strings and drops foreign events', async () => {
  const doc = new EventTarget();
  const t = H.createDomMigrationTransport(doc);
  const got = [];
  const off = t.subscribe((m) => got.push(m.type));
  t.send({ protocol: 'eat-migration', v: 1, type: 'request', session: 'abcdefghijklmnop' });
  doc.dispatchEvent(new CustomEvent('makaytron:eat-migration', { detail: { protocol: 'eat-migration' } }));
  doc.dispatchEvent(new CustomEvent('makaytron:eat-migration', { detail: '{"protocol":"other"}' }));
  off();
  t.send({ protocol: 'eat-migration', v: 1, type: 'request', session: 'abcdefghijklmnop' });
  assert.deepEqual(got, ['request']);
});
