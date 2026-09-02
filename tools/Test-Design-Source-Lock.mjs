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

const FILES = Object.freeze([
  'README.md',
  'README.tr.md',
  '.github/CONTRIBUTING.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  'docs/design/DESIGN-SOURCE-LOCK.md',
  'docs/design/MKUI-DESIGN-CONTRACT-v1.md',
  'docs/design/SHADCNSTORE-REFERENCE-CATALOG.md',
  'shared/mkui/README.md',
]);

async function text(path) {
  return readFile(resolve(ROOT, path), 'utf8');
}

test('all mandatory design sources are recorded in the public and normative documentation', async () => {
  for (const path of FILES.slice(0, 7)) {
    const content = await text(path);
    for (const [name, url] of Object.entries(SOURCES)) {
      assert.ok(content.includes(url), `${path} is missing mandatory ${name} source: ${url}`);
    }
  }
});

test('the normative policy forbids invented component anatomy and requires source traceability', async () => {
  const policy = await text('docs/design/DESIGN-SOURCE-LOCK.md');
  assert.match(policy, /Do not design a new visible component from scratch/i);
  assert.match(policy, /exact source path, page URL, block family and block name\/number/i);
  assert.match(policy, /When no approved source fits, stop implementation/i);
  assert.match(policy, /There are no implicit exceptions/i);
  assert.match(policy, /All toast, snackbar and transient-notification work must be based on `Toast-01`/i);
});

test('the pull request template makes design-source mapping reviewable', async () => {
  const template = await text('.github/PULL_REQUEST_TEMPLATE.md');
  assert.match(template, /## Design-source compliance \/ Tasarım kaynağı uyumu/);
  assert.match(template, /Shell\/template source and exact path/);
  assert.match(template, /ShadcnStore block URL, family, name and number/);
  assert.match(template, /Toast-01 mapping/);
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

test('English and Turkish READMEs expose the source lock before the screenshot galleries', async () => {
  const english = await text('README.md');
  const turkish = await text('README.tr.md');
  assert.ok(english.indexOf('## Mandatory design sources') < english.indexOf('## Synthetic panel galleries'));
  assert.ok(turkish.indexOf('## Zorunlu tasarım kaynakları') < turkish.indexOf('## Sentetik panel galerileri'));
});

test('the guarded patcher is idempotent after the source lock is applied', async () => {
  const patcher = await text('tools/Apply-Design-Source-Lock.mjs');
  assert.match(patcher, /if \(text\.includes\(marker\)\) return text;/);
  assert.match(patcher, /expected one anchor/);
  assert.match(patcher, /Design source lock is already applied/);
});
