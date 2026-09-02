import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  DESIGN_SOURCE_REGISTRY,
  DESIGN_SOURCE_REGISTRY_PATH,
  DESIGN_SOURCES_BY_ID,
  exactSourceLocator,
  extractRegisteredSourceIds,
  sourceById,
  sourceIdsByCategory,
  validateDesignSourceRegistry,
} from './Design-Source-Registry.mjs';

const ROOT = resolve(import.meta.dirname, '..');

async function text(path) {
  return readFile(resolve(ROOT, path), 'utf8');
}

test('the committed registry is valid, normative and machine-readable', async () => {
  const raw = await readFile(DESIGN_SOURCE_REGISTRY_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  assert.deepEqual(validateDesignSourceRegistry(parsed), []);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.status, 'normative');
  assert.equal(parsed.rules.uiChangesRequireRegisteredSourceIds, true);
  assert.equal(parsed.rules.unregisteredSourcesAllowed, false);
  assert.equal(parsed.rules.remoteRuntimeDependenciesAllowed, false);
});

test('source ids are unique and grouped by the four approved source categories', () => {
  const ids = DESIGN_SOURCE_REGISTRY.sources.map(source => source.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(sourceIdsByCategory('template').length >= 15);
  assert.ok(sourceIdsByCategory('toast').length >= 5);
  assert.ok(sourceIdsByCategory('shadcn-dashboard').includes('shadcn.dashboard.applied'));
  assert.ok(sourceIdsByCategory('shadcn-block').length >= 7);
});

test('required template source ids point to exact verified Tamplate-Back-White-01 files', () => {
  const expected = new Map([
    ['template.shell.base-layout', {
      path: 'vite-version/src/components/layouts/base-layout.tsx',
      sha: '4d42209f3cc720e070528393deb378d807650112',
    }],
    ['template.shell.app-sidebar', {
      path: 'vite-version/src/components/app-sidebar.tsx',
      sha: 'edd83d66cbc946d6b03aef93a6bb663898175ac5',
    }],
    ['template.shell.site-header', {
      path: 'vite-version/src/components/site-header.tsx',
      sha: '07788d552c9fe00cedbeed7512a72848e9603b08',
    }],
    ['template.navigation.nav-main', {
      path: 'vite-version/src/components/nav-main.tsx',
      sha: 'bed279801a59589dea86ae692e85947d730b211f',
    }],
    ['template.theme.tokens', {
      path: 'vite-version/src/index.css',
      sha: '077449b894ddf11ba6fbdd916ffe59a07fa06dfc',
    }],
    ['template.primitive.sidebar', {
      path: 'vite-version/src/components/ui/sidebar.tsx',
      sha: '1711a758efcb44613349ab0902433330a6da57d4',
    }],
    ['template.primitive.button', {
      path: 'vite-version/src/components/ui/button.tsx',
      sha: 'a2df8dce675fed0712d021fa45245289ecd26c88',
    }],
    ['template.primitive.card', {
      path: 'vite-version/src/components/ui/card.tsx',
      sha: 'd05bbc6c74cd8dbc699562cef917bb4267865aed',
    }],
    ['template.primitive.dialog', {
      path: 'vite-version/src/components/ui/dialog.tsx',
      sha: 'd9ccec91d22fab844bd04340c2b07e8677955350',
    }],
    ['template.primitive.table', {
      path: 'vite-version/src/components/ui/table.tsx',
      sha: '51b74dd52570a0268d78870be270dd460cef41db',
    }],
  ]);
  for (const [id, expectedSource] of expected) {
    const source = sourceById(id);
    assert.ok(source, `Missing ${id}`);
    assert.equal(source.repository, 'Makaytron/Tamplate-Back-White-01');
    assert.equal(source.path, expectedSource.path);
    assert.equal(source.verifiedBlobSha, expectedSource.sha);
    assert.equal(
      exactSourceLocator(source),
      `Makaytron/Tamplate-Back-White-01@main:${expectedSource.path}`,
    );
  }
});

test('Toast-01 owns the complete verified transient-feedback source map', () => {
  const required = new Map([
    ['toast.container', {
      path: 'src/components/ToastContainer.tsx',
      sha: 'b4984357cca0ab6d8acc1d76da98964f60ac519a',
    }],
    ['toast.item', {
      path: 'src/components/Toast.tsx',
      sha: 'b2c5b812bcba719f424c1f4deed44e1d0f750c41',
    }],
    ['toast.progress', {
      path: 'src/components/ProgressBar.tsx',
      sha: 'ccca0c5f4872dfb4c5c4316427a5a6cb0a05fa46',
    }],
    ['toast.close-button', {
      path: 'src/components/CloseButton.tsx',
      sha: 'e8c8c8feeb311d639048b111175a7bac881b4c07',
    }],
    ['toast.transitions', {
      path: 'src/components/Transitions.tsx',
      sha: 'b241308728bd49974a0ab1288ef5e65ee9471ccc',
    }],
    ['toast.styles', {
      path: 'src/style.css',
      sha: '62e47cc4de7d33fbc2f70aff1c3f8156135d65c0',
    }],
  ]);
  for (const [id, expectedSource] of required) {
    const source = DESIGN_SOURCES_BY_ID.get(id);
    assert.ok(source, `Missing ${id}`);
    assert.equal(source.repository, 'Makaytron/Toast-01');
    assert.equal(source.path, expectedSource.path);
    assert.equal(source.verifiedBlobSha, expectedSource.sha);
  }
});

test('approved ShadcnStore entries are exact dashboard or block-family URLs', () => {
  const dashboard = sourceById('shadcn.dashboard.applied');
  assert.equal(
    dashboard.url,
    'https://shadcnstore.com/templates/dashboard/shadcn-dashboard-landing-template/dashboard',
  );
  for (const id of sourceIdsByCategory('shadcn-block')) {
    const source = sourceById(id);
    assert.match(source.url, /^https:\/\/shadcnstore\.com\/blocks\//);
    assert.ok(source.family.length >= 4);
    assert.equal(source.requiresVariantNameAndNumber, true);
  }
});

test('source-id extraction accepts registered ids without treating prose as ids', () => {
  const ids = extractRegisteredSourceIds(
    '`template.shell.base-layout`, shadcn.dashboard.applied; ' +
    'shadcn.blocks.datatable and toast.container',
  );
  assert.deepEqual(ids, [
    'template.shell.base-layout',
    'shadcn.dashboard.applied',
    'shadcn.blocks.datatable',
    'toast.container',
  ]);
});

test('public, contributor and normative documentation all name the registry', async () => {
  const files = [
    'README.md',
    'README.tr.md',
    '.github/CONTRIBUTING.md',
    '.github/PULL_REQUEST_TEMPLATE.md',
    'docs/design/DESIGN-SOURCE-LOCK.md',
    'docs/design/MKUI-DESIGN-CONTRACT-v1.md',
    'docs/design/SHADCNSTORE-REFERENCE-CATALOG.md',
    'shared/mkui/README.md',
  ];
  for (const path of files) {
    assert.match(await text(path), /DESIGN-SOURCE-REGISTRY\.json/, path);
  }
});

test('normative documentation forbids unknown source ids and invented anatomy', async () => {
  const policy = await text('docs/design/DESIGN-SOURCE-LOCK.md');
  const mkui = await text('shared/mkui/README.md');
  assert.match(policy, /unregistered source id/i);
  assert.match(policy, /source-id/i);
  assert.match(policy, /Do not design a new visible component from scratch/i);
  assert.match(mkui, /Unknown ids, approximate names and bare “inspired by” references are rejected by CI/);
});
