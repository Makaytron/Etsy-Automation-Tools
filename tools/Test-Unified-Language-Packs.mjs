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
test('after an update, a kept pack is used at once and replaced by the current one in the background', async () => {
  // A pack kept from 2.1.0 had no notes for 2.1.1-2.1.3, so those showed in English in a Turkish interface.
  const cache = createStorage(createMemoryStore()).namespace('core');
  const old = { ...pack('tr'), strings: Object.fromEntries(Object.entries(pack('tr').strings).filter(([key]) => !key.startsWith('rn.21'))) };
  await cache.set('pack.tr', old);
  await cache.set('packFor.tr', '2.1.0');
  const gm = fakeGm((d) => d.onload({ status: 200, responseText: JSON.stringify(pack('tr')) }));
  const changes = [];
  const packs = createLanguagePacks({ gm, cache, appVersion: META.version, onChange: (l, s) => changes.push(`${l}:${s.status}`) });
  assert.deepEqual(await packs.ensure('tr'), { status: 'ready' }, 'the kept pack is ready without waiting');
  assert.equal(await packs.settled('tr'), true);
  assert.deepEqual(gm.requests, [`${PACK_BASE_URL}tr.json`]);
  assert.equal(typeof packStrings('tr')['rn.212.fixes'], 'string', 'the new notes arrive');
  assert.equal(await cache.get('packFor.tr'), META.version);
  assert.ok(changes.includes('tr:ready'), 'the interface re-renders with the current pack');

  // The next page of the same version asks for nothing.
  const offline = fakeGm(() => assert.fail('no request expected'));
  const again = createLanguagePacks({ gm: offline, cache, appVersion: META.version });
  await again.ensure('tr');
  assert.equal(await again.settled('tr'), false);
  assert.deepEqual(offline.requests, []);
});

test('a failed refresh keeps the pack the user already has', async () => {
  const cache = createStorage(createMemoryStore()).namespace('core');
  await cache.set('pack.es', pack('es'));
  const gm = fakeGm((d) => d.onerror(new Error('offline')));
  const packs = createLanguagePacks({ gm, cache, appVersion: META.version });
  assert.deepEqual(await packs.ensure('es'), { status: 'ready' });
  assert.equal(await packs.settled('es'), false);
  assert.equal(typeof packStrings('es')['lang.retry'], 'string', 'still in Spanish');
  assert.equal((await cache.get('pack.es')).language, 'es');
});

test('a pack without this release\'s notes is not taken as current, so it is fetched again', async () => {
  // raw.githubusercontent can serve a pack from before the release for a few minutes after the script
  // updates; recorded as current, it would keep the new notes in English until the next version.
  const { releaseKeys } = await import('../src/core/language-packs.js');
  const keys = releaseKeys(META.version);
  assert.ok(keys.length > 0, 'the current version has release notes');
  const staleOf = (code) => ({ ...pack(code), strings: Object.fromEntries(Object.entries(pack(code).strings).filter(([key]) => !keys.includes(key))) });

  // Downloaded stale: used, but not recorded as current.
  const cache = createStorage(createMemoryStore()).namespace('core');
  const first = createLanguagePacks({ gm: fakeGm((d) => d.onload({ status: 200, responseText: JSON.stringify(staleOf('fi')) })), cache, appVersion: META.version });
  assert.deepEqual(await first.ensure('fi'), { status: 'ready' });
  assert.notEqual(await cache.get('packFor.fi'), META.version, 'not recorded as current');

  // Next page (packs load once per page, so a fresh language stands in for it): the stale pack kept by
  // the first page is shown at once and the current one replaces it.
  const cacheNext = createStorage(createMemoryStore()).namespace('core');
  await cacheNext.set('pack.sv', staleOf('sv'));
  await cacheNext.set('packFor.sv', await cache.get('packFor.fi'));
  const gm = fakeGm((d) => d.onload({ status: 200, responseText: JSON.stringify(pack('sv')) }));
  const second = createLanguagePacks({ gm, cache: cacheNext, appVersion: META.version });
  await second.ensure('sv');
  assert.equal(await second.settled('sv'), true);
  assert.deepEqual(gm.requests, [`${PACK_BASE_URL}sv.json`]);
  for (const key of keys) assert.equal(typeof packStrings('sv')[key], 'string', key);
  assert.equal(await cacheNext.get('packFor.sv'), META.version);

  // A pack already recorded as current for this version but missing the notes is fetched again too.
  const cache2 = createStorage(createMemoryStore()).namespace('core');
  await cache2.set('pack.lt', staleOf('lt'));
  await cache2.set('packFor.lt', META.version);
  const gm2 = fakeGm((d) => d.onload({ status: 200, responseText: JSON.stringify(pack('lt')) }));
  const third = createLanguagePacks({ gm: gm2, cache: cache2, appVersion: META.version });
  await third.ensure('lt');
  assert.equal(await third.settled('lt'), true);
  assert.deepEqual(gm2.requests, [`${PACK_BASE_URL}lt.json`]);
});

test('a release date is the same calendar day in every time zone', async () => {
  // '2026-11-27' parses as UTC midnight; shown in the browser's zone it was 26 Nov west of Greenwich.
  const { formatDate } = await import('../src/ui/format.js');
  const whatsNew = fs.readFileSync(new URL('../src/ui/whats-new.js', import.meta.url), 'utf8');
  const settingsPage = fs.readFileSync(new URL('../src/ui/settings-page.js', import.meta.url), 'utf8');
  assert.ok(whatsNew.includes("formatDate(Date.parse(notes.date), { ...s.format, timezone: 'UTC' }"));
  assert.ok(settingsPage.includes("formatDate(Date.parse(n.date), { ...s.format, timezone: 'UTC' }"));
  for (const date of ['yyyy-mm-dd', 'auto']) assert.match(formatDate(Date.parse('2026-11-27'), { date, timezone: 'UTC' }, 'en'), /27/, date);
});
