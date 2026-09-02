import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(repoRoot, 'scripts/etsy-listing-analyzer/Makaytron-Etsy-Listing-Analyzer.user.js');
const auditPath = path.join(repoRoot, 'docs/design/previews/listing-analyzer-source-audit.json');
const source = fs.readFileSync(scriptPath, 'utf8');
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function metadataBlock(value) {
  return value.match(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==/m)?.[0] || '';
}

function protectedMetadata(value) {
  return metadataBlock(value)
    .split(/\r?\n/)
    .filter((line) => line.startsWith('// @') && !line.startsWith('// @version'))
    .join('\n');
}

function countedSignature(value, regex, normalize = (item) => item) {
  const counts = new Map();
  for (const match of value.matchAll(regex)) {
    const key = normalize(match[0]);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const rows = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  return sha256(JSON.stringify(rows));
}

function countMatches(value, regex) {
  return (value.match(regex) || []).length;
}

test('Listing Analyzer carries the reviewed MKUI production version', () => {
  assert.match(source, /^\/\/ @version\s+1\.2\.3$/m);
  assert.match(source, /const APP_VERSION = '1\.2\.3';/);
  assert.match(source, /const MKUI_VERSION = '1\.0\.0';/);
  assert.doesNotMatch(source, /^\/\/ @version\s+1\.2\.2$/m);
});

test('Listing Analyzer preserves its isolated UI architecture', () => {
  assert.equal(countMatches(source, /const STYLES = `/g), 1, 'STYLES layer must remain singular');
  assert.equal(countMatches(source, /attachShadow\s*\(\s*\{\s*mode\s*:\s*['"]open['"]\s*\}\s*\)/g), 1, 'open Shadow DOM mount must remain singular');
  assert.equal(countMatches(source, /attachShadow\s*\(\s*\{\s*mode\s*:\s*['"]closed['"]/g), 0, 'closed Shadow DOM must not be introduced');
  assert.match(source, /makaytron-etsy-listing-analyzer/);
  assert.match(source, /:host\{all:initial;/);
  assert.match(source, /window\.__MELI_TEST__ = Object\.freeze\(\{/);
});

test('Listing Analyzer protected metadata and behavioral hook signatures match the baseline audit', () => {
  assert.equal(sha256(protectedMetadata(source)), audit.source.protectedMetadataSha256);
  assert.equal(
    countedSignature(source, /\bdata-[a-z0-9-]+\b/gi, (value) => value.toLowerCase()),
    audit.source.dataAttributeSignatureSha256,
  );
  assert.equal(
    countedSignature(source, /\bmeli-[a-z0-9-]+\b/gi, (value) => value.toLowerCase()),
    audit.source.meliClassSignatureSha256,
  );
});

test('Listing Analyzer maps the canonical MKUI token and primitive contract', () => {
  for (const marker of [
    '--meli-bg:#f7f7f7',
    '--meli-surface:#fff',
    '--meli-fg:#171717',
    '--meli-muted:#f2f2f2',
    '--meli-muted-fg:#595959',
    '--meli-border:#dedede',
    '--meli-input:#cfcfcf',
    '--meli-primary:#1f1f1f',
    '--meli-primary-strong:#0f0f0f',
    '--meli-success:#1f7a4d',
    '--meli-success-soft:#edf8f1',
    '--meli-warning:#8a5a00',
    '--meli-warning-soft:#fff9df',
    '--meli-danger:#b42318',
    '--meli-danger-soft:#fff1f0',
    '--meli-radius-sm:7px',
    '--meli-radius-md:10px',
    '--meli-radius-lg:14px',
    '--meli-radius-xl:18px',
    '--meli-radius-pill:999px',
    '--meli-shadow-card:0 1px 2px rgba(0,0,0,.04)',
    '--meli-shadow-modal:0 25px 50px -12px rgba(0,0,0,.26)',
    '--meli-focus:0 0 0 3px rgba(23,23,23,.14)',
  ]) assert.ok(source.includes(marker), `Missing canonical MKUI marker: ${marker}`);

  assert.match(source, /\/\* MKUI v1 canonical Dashboard Shell compatibility layer\. \*\//);
  assert.match(source, /\.meli-panel\{[^}]*grid-template-columns:60px minmax\(0,1fr\)[^}]*border-radius:var\(--meli-radius-lg\)[^}]*background:var\(--meli-surface\)/s);
  assert.match(source, /\.meli-panel\.is-wide\{[^}]*grid-template-columns:184px minmax\(0,1fr\)/s);
  assert.match(source, /\.meli-card\{[^}]*border-radius:var\(--meli-radius-md\)[^}]*box-shadow:var\(--meli-shadow-card\)/s);
  assert.match(source, /\.meli-btn\{[^}]*border-radius:var\(--meli-radius-sm\)[^}]*background:var\(--meli-surface\)/s);
  assert.match(source, /\.meli-input,\.meli-select,\.meli-textarea\{[^}]*border:1px solid var\(--meli-input\)[^}]*border-radius:var\(--meli-radius-sm\)/s);
  assert.match(source, /\.meli-modal\{[^}]*border-radius:var\(--meli-radius-lg\)[^}]*box-shadow:var\(--meli-shadow-modal\)/s);
  assert.match(source, /\.meli-listing-card\{[^}]*border-radius:var\(--meli-radius-lg\)[^}]*background:var\(--meli-surface\)/s);
});

test('Listing Analyzer keeps semantic status and accessible focus states', () => {
  assert.match(source, /\.meli-status\[data-tone="ready"\] \.meli-status-mark\{[^}]*var\(--meli-success-soft\)[^}]*var\(--meli-success\)/s);
  assert.match(source, /\.meli-status\[data-tone="scanning"\] \.meli-status-mark\{[^}]*var\(--meli-warning-soft\)[^}]*var\(--meli-warning\)/s);
  assert.match(source, /\.meli-status\[data-tone="blocked"\] \.meli-status-mark,\.meli-status\[data-tone="error"\] \.meli-status-mark\{[^}]*var\(--meli-danger-soft\)[^}]*var\(--meli-danger\)/s);
  assert.match(source, /\.meli-btn:focus-visible,[^{]+\{outline:0;box-shadow:var\(--meli-focus\)\}/s);
  assert.match(source, /@media\(prefers-reduced-motion:reduce\)/);
});

test('Listing Analyzer navigation, filtering, queue, publish and deactivate hooks remain wired', () => {
  for (const view of ['overview', 'analysis', 'ai', 'queue', 'settings']) {
    assert.ok(source.includes(`['${view}'`) || source.includes(`"${view}"`), `Missing view contract: ${view}`);
  }
  for (const action of ['scan', 'scan-all', 'apply', 'publish', 'verify-publish', 'deactivate', 'verify-deactivate', 'skip', 'stop', 'export']) {
    assert.ok(source.includes(`data-action=\\"${action}\\"`) || source.includes(`data-action="${action}"`), `Missing action hook: ${action}`);
  }
  assert.match(source, /querySelectorAll\('\[data-view\]'\)/);
  assert.match(source, /button\.dataset\.view/);
  assert.match(source, /event\.code === 'KeyL'/);
  assert.match(source, /event\.code === 'KeyA'/);
  assert.match(source, /openCurrentDeactivate/);
  assert.match(source, /verifyCurrentDeactivate/);
  assert.match(source, /publishCurrentProposal/);
  assert.match(source, /verifyCurrentPublish/);
});

test('Listing Analyzer documentation and migration status are synchronized', () => {
  const readmeTr = read('scripts/etsy-listing-analyzer/README.md');
  const readmeEn = read('scripts/etsy-listing-analyzer/README.en.md');
  const rootEn = read('README.md');
  const rootTr = read('README.tr.md');
  const changelog = read('scripts/etsy-listing-analyzer/CHANGELOG.md');
  const plan = read('docs/design/MIGRATION-PLAN.md');
  const designContract = read('docs/design/MKUI-DESIGN-CONTRACT-v1.md');
  const scriptContract = read('docs/design/contracts/listing-analyzer.md');

  assert.match(readmeTr, /\*\*Sürüm:\*\* 1\.2\.3/);
  assert.match(readmeEn, /Version: `1\.2\.3`/);
  assert.match(readmeTr, /MKUI v1/);
  assert.match(readmeEn, /MKUI v1/);
  assert.match(rootEn, /etsy-listing-analyzer\/README\.en\.md\) \| 1\.2\.3 \|/);
  assert.match(rootTr, /etsy-listing-analyzer\/README\.md\) \| 1\.2\.3 \|/);
  assert.match(rootEn, /Listing Analyzer `v1\.2\.3`/);
  assert.match(rootTr, /Listing Analyzer `v1\.2\.3`/);
  assert.match(changelog, /## 1\.2\.3 - 2026-09-02/);
  assert.match(plan, /\[x\] Listing Analyzer MKUI migration \(`1\.2\.3`, MKUI `1\.0\.0`\)/);
  assert.match(plan, /\[ \] Cross-script integration QA — ACTIVE/);
  assert.match(designContract, /All five production userscripts are migrated to MKUI v1/);
  assert.match(scriptContract, /Version: `1\.2\.3`/);
  assert.match(scriptContract, /Migration status: `MKUI v1 complete`/);
});
