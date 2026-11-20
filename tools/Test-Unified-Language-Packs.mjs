// Tests for the downloadable language packs (languages/*.json, src/core/language-packs.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { checkAll, catalog } from './Unified-Language-Catalog.mjs';
import { createLanguagePacks, packStrings, PACK_LANGUAGES, PACK_BASE_URL } from '../src/core/language-packs.js';
import { createMemoryStore } from '../src/core/gm.js';
import { createStorage } from '../src/core/storage.js';
import { PICKER_STRINGS } from '../src/ui/strings-picker.js';
import { UI_LANGUAGES } from '../src/ui/strings-workspace.js';
import { META } from '../src/meta.js';

const pack = (code) => JSON.parse(fs.readFileSync(new URL(`../languages/${code}.json`, import.meta.url), 'utf8'));

function fakeGm(responder) {
  const requests = [];
  return {
    requests,
    xmlHttpRequest(details) {
      requests.push(details.url);
      setTimeout(() => responder(details), 0);
    },
  };
}

test('every pack matches the English catalog (keys, placeholders, plain text, version)', async () => {
  assert.deepEqual(await checkAll(), []);
});

test('the language list is English and every pack, with picker strings for each pack', async () => {
  assert.deepEqual(UI_LANGUAGES.map((l) => l.code).sort(), ['en', ...PACK_LANGUAGES].sort());
  const source = await catalog('en');
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const code of PACK_LANGUAGES) {
    const picker = PICKER_STRINGS[code];
    assert.ok(picker, code);
    for (const key of Object.keys(PICKER_STRINGS.de)) {
      assert.equal(typeof picker[key], 'string', `${code} ${key}`);
      assert.equal(placeholders(picker[key]), placeholders(source[key]), `${code} ${key}`);
      // The first screen and the pack say the same thing.
      assert.equal(picker[key], pack(code).strings[key], `${code} ${key} differs from its pack`);
    }
  }
});

test('a pack is downloaded once, validated and kept in storage', async () => {
  const storage = createStorage(createMemoryStore());
  const cache = storage.namespace('core');
  const gm = fakeGm((d) => d.onload({ status: 200, responseText: JSON.stringify(pack('de')) }));
  const changes = [];
  const packs = createLanguagePacks({ gm, cache, appVersion: META.version, onChange: (l, s) => changes.push(`${l}:${s.status}`) });
  assert.deepEqual(await packs.ensure('de'), { status: 'ready' });
  assert.deepEqual(gm.requests, [`${PACK_BASE_URL}de.json`]);
  assert.equal(packStrings('de')['drawer.otherTools'], 'Weitere Werkzeuge');
  assert.deepEqual(changes, ['de:loading', 'de:ready']);
  assert.equal((await cache.get('pack.de')).language, 'de');
  // Bundled languages never download anything.
  assert.deepEqual(await packs.ensure('en'), { status: 'bundled' });
  assert.equal(gm.requests.length, 1);

  // A new page reads the stored pack without a request.
  const offline = fakeGm(() => assert.fail('no request expected'));
  const again = createLanguagePacks({ gm: offline, cache, appVersion: META.version });
  assert.deepEqual(await again.ensure('de'), { status: 'ready' });
  assert.deepEqual(offline.requests, []);
});

test('a failed or unsafe download leaves English and can be retried', async () => {
  const cache = createStorage(createMemoryStore()).namespace('core');
  let mode = 'fail';
  const unsafe = { ...pack('fr'), strings: { ...pack('fr').strings, 'ws.report': '<script>alert(1)</script>' } };
  const gm = fakeGm((d) => {
    if (mode === 'fail') d.onerror(new Error('offline'));
    else if (mode === 'unsafe') d.onload({ status: 200, responseText: JSON.stringify(unsafe) });
    else d.onload({ status: 200, responseText: JSON.stringify(pack('fr')) });
  });
  const packs = createLanguagePacks({ gm, cache, appVersion: META.version });
  assert.equal((await packs.ensure('fr')).status, 'error');
  assert.equal(packStrings('fr'), null);
  // An error is not retried on every render, only when asked.
  await packs.ensure('fr');
  assert.equal(gm.requests.length, 1);
  mode = 'unsafe';
  assert.deepEqual(await packs.retry('fr'), { status: 'error', code: 'i18n_pack_markup' });
  assert.equal(packStrings('fr'), null);
  assert.equal(await cache.get('pack.fr', null), null, 'an unsafe pack is never stored');
  mode = 'ok';
  assert.deepEqual(await packs.retry('fr'), { status: 'ready' });
  assert.equal(packStrings('fr')['lang.retry'], 'Réessayer');
});

test('a pack for another language or an older app is rejected', async () => {
  const cache = createStorage(createMemoryStore()).namespace('core');
  const wrong = fakeGm((d) => d.onload({ status: 200, responseText: JSON.stringify(pack('it')) }));
  assert.deepEqual(await createLanguagePacks({ gm: wrong, cache, appVersion: META.version }).ensure('nl'), { status: 'error', code: 'i18n_pack_language' });
  const newer = fakeGm((d) => d.onload({ status: 200, responseText: JSON.stringify({ ...pack('pl'), minAppVersion: '99.0.0' }) }));
  assert.deepEqual(await createLanguagePacks({ gm: newer, cache, appVersion: META.version }).ensure('pl'), { status: 'error', code: 'i18n_pack_version' });
});

test('browser language tags find the right pack', async () => {
  const { normalizeTags } = await import('../src/ui/text.js');
  const { detectLanguage } = await import('../src/core/i18n.js');
  const codes = UI_LANGUAGES.map((l) => l.code);
  const pick = (tags) => detectLanguage(normalizeTags(tags), codes, 'en');
  assert.equal(pick(['zh-HK']), 'zh-TW');
  assert.equal(pick(['zh-Hant-TW']), 'zh-TW');
  assert.equal(pick(['zh']), 'zh-CN');
  assert.equal(pick(['zh-SG']), 'zh-CN');
  assert.equal(pick(['de-AT']), 'de');
  assert.equal(pick(['pt-BR']), 'pt');
  assert.equal(pick(['xx-YY']), 'en', 'an unknown language falls back to English');
  for (const code of PACK_LANGUAGES) assert.equal(pick([code]), code, code);
});

test('a pack cached from an older catalog is downloaded again', async () => {
  const cache = createStorage(createMemoryStore()).namespace('core');
  const current = pack('nl');
  const old = structuredClone(current);
  for (const key of Object.keys(old.strings)) if (key.startsWith('ma.') || key.startsWith('la.') || key.startsWith('set.tab.')) delete old.strings[key];
  await cache.set('pack.nl', old);
  const gm = fakeGm((d) => d.onload({ status: 200, responseText: JSON.stringify(current) }));
  const packs = createLanguagePacks({ gm, cache, appVersion: META.version });
  assert.deepEqual(await packs.ensure('nl'), { status: 'ready' });
  assert.deepEqual(gm.requests, [`${PACK_BASE_URL}nl.json`], 'the stale cached pack is replaced by a download');
  assert.equal(typeof (await cache.get('pack.nl')).strings['ma.inbox'], 'string');
});