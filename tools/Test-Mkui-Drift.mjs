import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  extractPresentationFingerprint,
  patchBundleHash,
  validateException,
  verifyManifest,
  checkManifest,
} from './Build-Mkui-Bundle-Manifest.mjs';
import {
  MKUI_PRODUCTION_SCRIPTS,
  MKUI_ROOT,
} from './Mkui-Production-Registry.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;

test('bundle marker insertion is exact and idempotent', () => {
  const source = `
(function(){
    const MKUI_VERSION = '1.0.0';
})();
`;
  const patched = patchBundleHash(source, HASH_A);
  assert.match(patched, new RegExp(`MKUI_BUNDLE_HASH = '${HASH_A}'`));
  assert.equal(patchBundleHash(patched, HASH_A), patched);
  assert.equal(
    patchBundleHash(patched, HASH_B).includes(`MKUI_BUNDLE_HASH = '${HASH_B}'`),
    true,
  );
});

test('bundle marker insertion fails closed on missing or ambiguous MKUI_VERSION', () => {
  assert.throws(
    () => patchBundleHash('const APP_VERSION = 1;', HASH_A),
    /exactly one MKUI_VERSION/,
  );
  assert.throws(
    () => patchBundleHash(
      `const MKUI_VERSION = '1.0.0';\nconst MKUI_VERSION = '1.0.0';`,
      HASH_A,
    ),
    /exactly one MKUI_VERSION/,
  );
});

test('presentation fingerprint ignores only the generated bundle marker', () => {
  const definition = MKUI_PRODUCTION_SCRIPTS[0];
  const base = `
    const MKUI_VERSION = '1.0.0';
    const PANEL_CSS = \`.maw-panel{position:fixed}\`;
    root.innerHTML = '<button class="maw-button">Open</button>';
  `;
  const first = extractPresentationFingerprint(base, definition);
  const withMarker = extractPresentationFingerprint(
    `${base}\nconst MKUI_BUNDLE_HASH = '${HASH_A}';`,
    definition,
  );
  assert.equal(first.hash, withMarker.hash);

  const changed = extractPresentationFingerprint(
    base.replace('position:fixed', 'position:absolute'),
    definition,
  );
  assert.notEqual(first.hash, changed.hash);
});

test('valid temporary exceptions require a reason and an unexpired date', () => {
  const valid = {
    scriptId: 'ads-keyword-manager',
    expectedPresentationHash: HASH_A,
    actualPresentationHash: HASH_B,
    reason: 'Temporary staged rollout for the shared launcher geometry.',
    expires: '2099-12-31',
  };
  assert.equal(validateException(valid, new Date('2026-09-02T00:00:00Z')), true);
  assert.equal(
    validateException({ ...valid, reason: 'short' }, new Date('2026-09-02T00:00:00Z')),
    false,
  );
  assert.equal(
    validateException({ ...valid, expires: '2026-01-01' }, new Date('2026-09-02T00:00:00Z')),
    false,
  );
});

function manifestFixture(presentationHash = HASH_A) {
  return {
    schemaVersion: 1,
    generatedBy: 'tools/Build-Mkui-Bundle-Manifest.mjs',
    mkuiVersion: '1.0.0',
    canonicalBundle: {
      files: ['shared/mkui/constants.js'],
      hash: HASH_C,
      bytes: 10,
      lines: 1,
    },
    scripts: MKUI_PRODUCTION_SCRIPTS.map(definition => ({
      id: definition.id,
      path: definition.path,
      scriptVersion: '1.0.0',
      mkuiVersion: '1.0.0',
      bundleHash: HASH_C,
      presentationHash,
      presentationBytes: 100,
      presentationFragmentCount: 2,
      presentationMarkerLineCount: 3,
    })),
    exceptions: [],
  };
}

test('presentation drift fails without an explicit exception', () => {
  const committed = manifestFixture(HASH_A);
  const current = manifestFixture(HASH_A);
  current.scripts[0].presentationHash = HASH_B;
  const result = verifyManifest(committed, current, {
    today: new Date('2026-09-02T00:00:00Z'),
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /presentation drifted/);
});

test('matching unexpired exception permits one exact drift transition', () => {
  const committed = manifestFixture(HASH_A);
  const current = manifestFixture(HASH_A);
  current.scripts[0].presentationHash = HASH_B;
  committed.exceptions.push({
    scriptId: current.scripts[0].id,
    expectedPresentationHash: HASH_A,
    actualPresentationHash: HASH_B,
    reason: 'Temporary staged rollout for a reviewed MKUI presentation change.',
    expires: '2099-12-31',
  });
  const result = verifyManifest(committed, current, {
    today: new Date('2026-09-02T00:00:00Z'),
  });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
});

test('canonical bundle drift cannot be bypassed by a presentation exception', () => {
  const committed = manifestFixture(HASH_A);
  const current = manifestFixture(HASH_A);
  current.canonicalBundle.hash = HASH_B;
  for (const script of current.scripts) script.bundleHash = HASH_B;
  const result = verifyManifest(committed, current, {
    today: new Date('2026-09-02T00:00:00Z'),
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /canonical MKUI bundle changed/);
});

test('live production manifest and script markers are current', async t => {
  try {
    await access(resolve(MKUI_ROOT, 'shared/mkui/bundle-manifest.json'));
    await Promise.all(MKUI_PRODUCTION_SCRIPTS.map(definition =>
      access(resolve(MKUI_ROOT, definition.path))));
  } catch {
    t.skip('Generated production manifest is not present in this isolated unit-test checkout.');
    return;
  }
  await checkManifest();
});
