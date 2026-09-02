import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  MARKER,
  SCRIPT_PATH,
  TARGET_VERSION,
  applyAdsCommandCenter,
} from './Apply-Ads-Command-Center-v1.mjs';
import {
  AUDIT_PATH,
  PREVIEW_PATH,
} from './Generate-Ads-Command-Center-Preview.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function metadataValues(source, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...source.matchAll(new RegExp(`^\\/\\/ @${escaped}\\s+(.+)$`, 'gm'))]
    .map(match => match[1].trim());
}

test('production Ads script contains one source-registered command center layer', async () => {
  const source = await readFile(SCRIPT_PATH, 'utf8');
  assert.equal(source.split(MARKER).length - 1, 1);
  assert.equal(metadataValues(source, 'version')[0], TARGET_VERSION);
  assert.match(source, new RegExp(`const APP_VERSION = '${TARGET_VERSION}'`));
  assert.match(source, /template\.shell\.base-layout/);
  assert.match(source, /template\.shell\.site-header/);
  assert.match(source, /template\.primitive\.card/);
  assert.match(source, /template\.primitive\.button/);
  assert.match(source, /template\.primitive\.input/);
  assert.match(source, /template\.primitive\.table/);
  assert.match(source, /shadcn\.dashboard\.applied/);
  assert.match(source, /shadcn\.blocks\.application-interface — Application Interface 2/);
  assert.match(source, /shadcn\.blocks\.datatable — Data Table 2/);
  assert.match(source, /Toast mapping: N\/A/);
});

test('command hierarchy is built on the real production action hooks', async () => {
  const source = await readFile(SCRIPT_PATH, 'utf8');
  assert.match(source, /class="maw-command-stack"/);
  assert.match(source, /data-command-scope="current-page"/);
  assert.match(source, /data-command-scope="all-pages" data-tone="warning"/);
  assert.match(source, /data-command-scope="wordlist"/);
  for (const action of ['close-page', 'open-page', 'close-all', 'edit', 'update']) {
    assert.equal(
      [...source.matchAll(new RegExp(`<button[^>]+data-action=\"${action}\"`, 'g'))].length,
      1,
      `${action} must remain a single production action button`,
    );
  }
  assert.match(source, /data-current-page-label hidden/);
  assert.match(source, /data-all-pages-label hidden/);
});

test('responsive panel and two-column rule editor use scoped production selectors', async () => {
  const source = await readFile(SCRIPT_PATH, 'utf8');
  assert.match(source, /#\$\{PANEL_ROOT_ID\}\{right:16px;top:80px;width:min\(464px,calc\(100vw - 24px\)\)/);
  assert.match(source, /\.maw-command-actions\{margin-top:9px;display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(source, /\.maw-modal\{width:min\(960px,calc\(100vw - 40px\)\)/);
  assert.match(source, /\.maw-modal-body\{display:grid;grid-template-columns:minmax\(300px,356px\) minmax\(0,1fr\)/);
  assert.match(source, /@media\(max-width:860px\)/);
  assert.match(source, /@media\(max-width:440px\)/);
  assert.match(source, /@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(source, /:has\(/);
});

test('presentation transform is idempotent after publication', async () => {
  const source = await readFile(SCRIPT_PATH, 'utf8');
  assert.equal(applyAdsCommandCenter(source), source);
});

test('production-generated preview is self-contained, synthetic and source-bound', async () => {
  const [source, preview, auditText] = await Promise.all([
    readFile(SCRIPT_PATH, 'utf8'),
    readFile(PREVIEW_PATH, 'utf8'),
    readFile(AUDIT_PATH, 'utf8'),
  ]);
  const audit = JSON.parse(auditText);
  assert.equal(audit.schemaVersion, 2);
  assert.equal(audit.dataClassification, 'fully_synthetic');
  assert.equal(audit.networkDependency, false);
  assert.equal(audit.liveEtsyWrite, false);
  assert.equal(audit.productionDomUsed, true);
  assert.equal(audit.productionSourceSha256, sha256(source));
  assert.equal(audit.previewSha256, sha256(preview));
  assert.deepEqual(audit.expectedPanelStats, {
    page: '2 / 7',
    rows: 42,
    matches: 9,
    highRatio: 3,
  });
  assert.match(preview, /\(0, eval\)\(/);
  assert.match(preview, /data-fixture-ready/);
  assert.match(preview, /Ağ erişimi kapalı · tamamen sentetik önizleme/);
  assert.match(preview, /data-action=\\?"edit\\?"/);
  assert.doesNotMatch(preview, /class="maw-panel"/);
});
