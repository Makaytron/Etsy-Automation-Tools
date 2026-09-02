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

test('required template source ids point to exact Tamplate-Back-White-01 paths', () => {
  const expected = new Map([
    ['template.shell.base-layout', 'vite-version/src/components/layouts/base-layout.tsx'],
    ['template.shell.app-sidebar', 'vite-version/src/components/app-sidebar.tsx'],
    ['template.shell.site-header', 'vite-version/src/components/site-header.tsx'],
    ['template.navigation.nav-main', 'vite-version/src/components/nav-main.tsx'],
    ['template.theme.tokens', 'vite-version/src/index.css'],
    ['template.primitive.sidebar', 'vite-version/src/components/ui/sidebar.tsx'],
    ['template.primitive.button', 'vite-version/src/components/ui/button.tsx'],
    ['template.primitive.card', 'vite-version/src/components/ui/card.tsx'],
    ['template.primitive.dialog', 'vite-version/src/components/ui/dialog.tsx'],
    ['template.primitive.table', 'vite-version/src/components/ui/table.tsx'],
  ]);
  for (const [id, path] of expected) {
    const source = sourceById(id);
    assert.ok(source, `Missing ${id}`);
    assert.equal(source.repository, 'Makaytron/Tamplate-Back-White-01');
    assert.equal(source.path, path);
    assert.match(source.verifiedBlobSha, /^[0-9a-f]{40}$/);
    assert.equal(
      exactSourceLocator(source),
      `Makaytron/Tamplate-Back-White-01@main:${path}`,
    );
  }
});

test('Toast-01 owns the complete transient-feedback source map', () => {
  const required = new Map([
    ['toast.container', 'src/components/ToastContainer.tsx'],
    ['toast.item', 'src/components/Toast.tsx'],
    ['toast.progress', 'src/components/ProgressBar.tsx'],
    ['toast.close-button', 'src/components/CloseButton.tsx'],
    ['toast.transitions', 'src/components/Transitions.tsx'],
    ['toast.styles', 'src/style.css'],
  ]);
  for (const [id, path] of required) {
    const source = DESIGN_SOURCES_BY_ID.get(id);
    assert.ok(source, `Missing ${id}`);
    assert.equal(source.repository, 'Makaytron/Toast-01');
    assert.equal(source.path, path);
    assert.match(source.verifiedBlobSha, /^[0-9a-f]{40}$/);
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

test('normative documentation names the registry and forbids unregistered source ids', async () => {
  const policy = await text('docs/design/DESIGN-SOURCE-LOCK.md');
  const mkui = await text('shared/mkui/README.md');
  assert.match(policy, /DESIGN-SOURCE-REGISTRY\.json/);
  assert.match(policy, /unregistered source id/i);
  assert.match(policy, /source-id/i);
  assert.match(mkui, /DESIGN-SOURCE-REGISTRY\.json/);
});
