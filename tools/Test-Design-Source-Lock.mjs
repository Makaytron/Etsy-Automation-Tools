import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve(import.meta.dirname, '..');

const SOURCES = Object.freeze({
  template: 'https://github.com/Makaytron/Tamplate-Back-White-01',
  toast: 'https://github.com/Makaytron/Toast-01',
  blocks: 'https://shadcnstore.com/blocks',
  dashboard: 'https://shadcnstore.com/templates/dashboard/shadcn-dashboard-landing-template/dashboard',
});

const PUBLIC_AND_NORMATIVE_FILES = Object.freeze([
  'README.md',
  'README.tr.md',
  '.github/CONTRIBUTING.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  'docs/design/DESIGN-SOURCE-LOCK.md',
  'docs/design/MKUI-STRICT-DESIGN-SOURCE-RULES.md',
  'docs/design/MKUI-DESIGN-CONTRACT-v1.md',
  'docs/design/SHADCNSTORE-REFERENCE-CATALOG.md',
]);

async function text(path) {
  return readFile(resolve(ROOT, path), 'utf8');
}

test('all mandatory design sources are recorded in public and normative documentation', async () => {
  for (const path of PUBLIC_AND_NORMATIVE_FILES) {
    const content = await text(path);
    for (const [name, url] of Object.entries(SOURCES)) {
      assert.ok(content.includes(url), `${path} is missing mandatory ${name} source: ${url}`);
    }
  }
});

test('the normative policy forbids invented anatomy and requires registered traceability', async () => {
  const policy = await text('docs/design/DESIGN-SOURCE-LOCK.md');
  assert.match(policy, /Do not design a new visible component from scratch/i);
  assert.match(policy, /registered `source-id`/i);
  assert.match(policy, /exact source path or URL, block family and block name\/number/i);
  assert.match(policy, /When no approved source fits, stop implementation/i);
  assert.match(policy, /There are no implicit exceptions/i);
  assert.match(policy, /unregistered source id/i);
  assert.match(policy, /All toast, snackbar and transient-notification work must be based on `Toast-01`/i);
});

test('the strict review rules defer to the complete policy and registry', async () => {
  const strict = await text('docs/design/MKUI-STRICT-DESIGN-SOURCE-RULES.md');
  assert.match(strict, /DESIGN-SOURCE-LOCK\.md/);
  assert.match(strict, /DESIGN-SOURCE-REGISTRY\.json/);
  assert.match(strict, /machine-readable allowlist/i);
  assert.match(strict, /at least one registered `template\.\*` id/i);
  assert.match(strict, /cite `shadcn\.dashboard\.applied`/i);
  assert.match(strict, /cite at least one exact registered `shadcn\.blocks\.\*` family id/i);
  assert.match(strict, /toast\.container/);
  assert.match(strict, /Unknown ids, mismatched paths, generic ShadcnStore references/i);
});

test('the pull request template makes registered source mapping reviewable', async () => {
  const template = await text('.github/PULL_REQUEST_TEMPLATE.md');
  assert.match(template, /## Design-source compliance \/ Tasarım kaynağı uyumu/);
  assert.match(template, /Approved source IDs \/ Onaylı kaynak kimlikleri/);
  assert.match(template, /Exact registered repository paths \/ Kayıtlı kesin repo yolları/);
  assert.match(template, /Applied dashboard region \/ Uygulanan dashboard bölgesi/);
  assert.match(template, /ShadcnStore block URL, family, visible name and number/);
  assert.match(template, /Toast-01 source IDs and exact paths/);
  assert.match(template, /Every source id above exists in \[`DESIGN-SOURCE-REGISTRY\.json`\]/);
  assert.match(template, /I did not invent an unapproved card, menu, sidebar, modal, table, filter, empty state, toolbar, loader, alert or toast/);
});

test('MKUI rules make Toast-01 mandatory without adding a userscript runtime dependency', async () => {
  const contract = await text('docs/design/MKUI-DESIGN-CONTRACT-v1.md');
  const mkuiReadme = await text('shared/mkui/README.md');
  const policy = await text('docs/design/DESIGN-SOURCE-LOCK.md');
  assert.match(contract, /Toast-01.*mandatory toast\/snackbar\/transient-notification source/is);
  assert.match(policy, /Userscripts must not add React or Tailwind as runtime dependencies merely to use `Toast-01`/i);
  assert.match(mkuiReadme, /Production userscripts remain framework-free, locally bundled and Etsy-safe at runtime/);
});

test('the registry is linked from the normative policy and MKUI documentation', async () => {
  const policy = await text('docs/design/DESIGN-SOURCE-LOCK.md');
  const strict = await text('docs/design/MKUI-STRICT-DESIGN-SOURCE-RULES.md');
  const mkuiReadme = await text('shared/mkui/README.md');
  assert.match(policy, /DESIGN-SOURCE-REGISTRY\.json/);
  assert.match(strict, /DESIGN-SOURCE-REGISTRY\.json/);
  assert.match(mkuiReadme, /DESIGN-SOURCE-REGISTRY\.json/);
  await readFile(resolve(ROOT, 'docs/design/DESIGN-SOURCE-REGISTRY.json'), 'utf8');
  await readFile(resolve(ROOT, 'tools/Design-Source-Registry.mjs'), 'utf8');
  await readFile(resolve(ROOT, 'tools/Test-Design-Source-Registry.mjs'), 'utf8');
});

test('English and Turkish READMEs expose the source lock before screenshot galleries', async () => {
  const english = await text('README.md');
  const turkish = await text('README.tr.md');
  assert.ok(english.indexOf('## Mandatory design sources') < english.indexOf('## Synthetic panel galleries'));
  assert.ok(turkish.indexOf('## Zorunlu tasarım kaynakları') < turkish.indexOf('## Sentetik panel galerileri'));
  assert.match(english, /DESIGN-SOURCE-REGISTRY\.json/);
  assert.match(turkish, /DESIGN-SOURCE-REGISTRY\.json/);
});

test('the guarded patcher remains idempotent after the source lock is applied', async () => {
  const patcher = await text('tools/Apply-Design-Source-Lock.mjs');
  assert.match(patcher, /if \(text\.includes\(marker\)\) return text;/);
  assert.match(patcher, /expected one anchor/);
  assert.match(patcher, /Design source lock is already applied/);
});
