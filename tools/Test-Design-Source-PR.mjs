import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isUiRelevantPath,
  uiRelevantFiles,
  validateDesignSourceBody,
} from './Validate-Design-Source-PR.mjs';

const VALID_BODY = `
## Design-source compliance / Tasarım kaynağı uyumu

- UI changed / UI değişti: Yes
- Approved source IDs / Onaylı kaynak kimlikleri: template.shell.base-layout, template.primitive.card, shadcn.dashboard.applied, shadcn.blocks.application-interface, toast.container, toast.item, toast.styles
- Exact registered repository paths / Kayıtlı kesin repo yolları: Makaytron/Tamplate-Back-White-01@main:vite-version/src/components/layouts/base-layout.tsx; Makaytron/Tamplate-Back-White-01@main:vite-version/src/components/ui/card.tsx; Makaytron/Toast-01@main:src/components/ToastContainer.tsx; Makaytron/Toast-01@main:src/components/Toast.tsx; Makaytron/Toast-01@main:src/style.css
- Applied dashboard region / Uygulanan dashboard bölgesi: https://shadcnstore.com/templates/dashboard/shadcn-dashboard-landing-template/dashboard — sidebar, header and content-shell composition
- ShadcnStore block URL, family, visible name and number / ShadcnStore blok URL'si, ailesi, görünen adı ve numarası: https://shadcnstore.com/blocks/application/apps — Application Interface Sections — App Dashboard 1
- Toast-01 source IDs and exact paths, or \`N/A\` with explanation / Toast-01 kaynak kimlikleri ve kesin yolları veya açıklamalı \`N/A\`: Toast-01 mapping: src/components/ToastContainer.tsx; src/components/Toast.tsx; src/style.css — stacked success/error lifecycle and dismiss control
- Makaytron adaptation summary / Makaytron uyarlama özeti: The approved shell, card and notification anatomy were adapted to the existing Etsy data and confirmation workflow.
- Behavior-preservation summary / Davranış koruma özeti: Existing data hooks, selectors, storage keys, confirmation gates and event listeners remain unchanged.

- [x] Every source id above exists in [\`DESIGN-SOURCE-REGISTRY.json\`](../docs/design/DESIGN-SOURCE-REGISTRY.json), and every exact path/URL matches its registry entry.
- [x] I used [Tamplate-Back-White-01](https://github.com/Makaytron/Tamplate-Back-White-01) as the primary application template.
- [x] I used the [applied dashboard](https://shadcnstore.com/templates/dashboard/shadcn-dashboard-landing-template/dashboard) for page composition and selected a named, numbered [ShadcnStore block](https://shadcnstore.com/blocks) for the component anatomy.
- [x] Every new or modified toast/snackbar/notification follows [Toast-01](https://github.com/Makaytron/Toast-01), or this is \`N/A\` with a concrete explanation.
- [x] I did not invent an unapproved card, menu, sidebar, modal, table, filter, empty state, toolbar, loader, alert or toast.
- [x] Existing behavior hooks and safety contracts remain intact.
`;

function withoutToast(body = VALID_BODY) {
  return body
    .replace(', toast.container, toast.item, toast.styles', '')
    .replace('; Makaytron/Toast-01@main:src/components/ToastContainer.tsx; Makaytron/Toast-01@main:src/components/Toast.tsx; Makaytron/Toast-01@main:src/style.css', '')
    .replace(
      'Toast-01 mapping: src/components/ToastContainer.tsx; src/components/Toast.tsx; src/style.css — stacked success/error lifecycle and dismiss control',
      'N/A — this view contains no transient feedback, toast, snackbar or notification state',
    );
}

test('UI relevance includes production userscripts and executable MKUI sources', () => {
  assert.equal(isUiRelevantPath('scripts/etsy-message-assistant/example.user.js'), true);
  assert.equal(isUiRelevantPath('shared/mkui/primitives.css'), true);
  assert.equal(isUiRelevantPath('shared/mkui/constants.js'), true);
  assert.equal(isUiRelevantPath('shared/mkui/bundle-manifest.json'), true);
  assert.equal(isUiRelevantPath('shared/mkui/README.md'), false);
  assert.equal(isUiRelevantPath('tools/Apply-Mkui-Message-Pilot.mjs'), true);
  assert.equal(isUiRelevantPath('README.md'), false);
  assert.deepEqual(
    uiRelevantFiles([
      'README.md',
      'shared/mkui/README.md',
      'scripts/etsy-message-assistant/example.user.js',
      'shared/mkui/tokens.css',
    ]),
    [
      'scripts/etsy-message-assistant/example.user.js',
      'shared/mkui/tokens.css',
    ],
  );
});

test('documentation-only pull requests skip the design-source body gate', () => {
  const result = validateDesignSourceBody('', [
    'README.md',
    'shared/mkui/README.md',
    'docs/design/DESIGN-SOURCE-LOCK.md',
    'docs/design/DESIGN-SOURCE-REGISTRY.json',
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
});

test('complete registered source mapping passes for UI changes', () => {
  const result = validateDesignSourceBody(
    VALID_BODY,
    ['scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js'],
  );
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.skipped, false);
  assert.deepEqual(result.sourceIds, [
    'template.shell.base-layout',
    'template.primitive.card',
    'shadcn.dashboard.applied',
    'shadcn.blocks.application-interface',
    'toast.container',
    'toast.item',
    'toast.styles',
  ]);
});

test('unknown source ids and mismatched exact paths fail closed', () => {
  const invalid = VALID_BODY
    .replace(
      'template.primitive.card',
      'template.primitive.invented-panel',
    )
    .replace(
      'Makaytron/Tamplate-Back-White-01@main:vite-version/src/components/layouts/base-layout.tsx',
      'Makaytron/Tamplate-Back-White-01@main:vite-version/src/components/layouts/guessed-layout.tsx',
    );
  const result = validateDesignSourceBody(invalid, ['shared/mkui/primitives.css']);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /Unknown or unregistered design source id/);
  assert.match(result.errors.join('\n'), /Exact registered repository locator is missing/);
});

test('bare repo names and generic Shadcn catalog references are rejected', () => {
  const invalid = VALID_BODY
    .replace(
      'template.shell.base-layout, template.primitive.card, shadcn.dashboard.applied, shadcn.blocks.application-interface, toast.container, toast.item, toast.styles',
      'template.shell.base-layout',
    )
    .replace(
      'https://shadcnstore.com/templates/dashboard/shadcn-dashboard-landing-template/dashboard — sidebar, header and content-shell composition',
      'dashboard-like layout',
    )
    .replace(
      'https://shadcnstore.com/blocks/application/apps — Application Interface Sections — App Dashboard 1',
      'https://shadcnstore.com/blocks — dashboard block',
    );
  const result = validateDesignSourceBody(invalid, ['shared/mkui/shells.css']);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /shadcn\.dashboard\.applied/);
  assert.match(result.errors.join('\n'), /shadcn\.blocks/);
  assert.match(result.errors.join('\n'), /visible block variant and number/);
});

test('blank placeholders, weak summaries and unchecked confirmations fail closed', () => {
  const invalid = VALID_BODY
    .replace('UI changed / UI değişti: Yes', 'UI changed / UI değişti: Yes / No')
    .replace(
      'template.shell.base-layout, template.primitive.card, shadcn.dashboard.applied, shadcn.blocks.application-interface, toast.container, toast.item, toast.styles',
      '-',
    )
    .replace(
      'The approved shell, card and notification anatomy were adapted to the existing Etsy data and confirmation workflow.',
      'short',
    )
    .replace(
      'Existing data hooks, selectors, storage keys, confirmation gates and event listeners remain unchanged.',
      'short',
    )
    .replace('- [x] I did not invent', '- [ ] I did not invent');
  const result = validateDesignSourceBody(invalid, ['shared/mkui/primitives.css']);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 8, result.errors.join('\n'));
});

test('N/A is accepted for toast only with a concrete explanation and no toast ids', () => {
  const result = validateDesignSourceBody(withoutToast(), ['shared/mkui/shells.css']);
  assert.equal(result.ok, true, result.errors.join('\n'));
});

test('toast N/A cannot be used while citing Toast-01 source ids', () => {
  const invalid = VALID_BODY.replace(
    'Toast-01 mapping: src/components/ToastContainer.tsx; src/components/Toast.tsx; src/style.css — stacked success/error lifecycle and dismiss control',
    'N/A — this view contains no transient feedback, toast, snackbar or notification state',
  );
  const result = validateDesignSourceBody(invalid, ['shared/mkui/shells.css']);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /Do not cite toast\.\* ids/);
});

test('a toast mapping requires the minimum container, item and styles sources', () => {
  const invalid = VALID_BODY
    .replace(', toast.item, toast.styles', '')
    .replace('; Makaytron/Toast-01@main:src/components/Toast.tsx; Makaytron/Toast-01@main:src/style.css', '')
    .replace('; src/components/Toast.tsx; src/style.css', '');
  const result = validateDesignSourceBody(invalid, ['shared/mkui/primitives.css']);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /toast\.item/);
  assert.match(result.errors.join('\n'), /toast\.styles/);
});
