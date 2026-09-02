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
- Shell/template source and exact path / Shell-template kaynağı ve kesin yolu: Makaytron/Tamplate-Back-White-01 — vite-version/src/components/layouts/base-layout.tsx
- ShadcnStore block URL, family, name and number / ShadcnStore blok URL'si, ailesi, adı ve numarası: https://shadcnstore.com/blocks — Application Shell Sections — Application Shell 2
- Toast-01 mapping, or \`N/A\` when no transient feedback exists / Toast-01 eşlemesi veya geçici bildirim yoksa \`N/A\`: Makaytron/Toast-01 stacked success/error lifecycle and dismiss control
- Makaytron adaptation summary / Makaytron uyarlama özeti: The approved shell was adapted to the existing Etsy data and confirmation workflow.

- [x] I used [Tamplate-Back-White-01](https://github.com/Makaytron/Tamplate-Back-White-01) as the primary application template.
- [x] I selected component anatomy from the [applied dashboard](https://shadcnstore.com/templates/dashboard/shadcn-dashboard-landing-template/dashboard) or a named [ShadcnStore block](https://shadcnstore.com/blocks).
- [x] Every new or modified toast/snackbar/notification follows [Toast-01](https://github.com/Makaytron/Toast-01), or this is \`N/A\`.
- [x] I did not invent an unapproved card, menu, sidebar, modal, table, filter, empty state, toolbar, loader, alert or toast.
- [x] Existing behavior hooks and safety contracts remain intact.
`;

test('UI relevance includes production userscripts and MKUI sources', () => {
  assert.equal(isUiRelevantPath('scripts/etsy-message-assistant/example.user.js'), true);
  assert.equal(isUiRelevantPath('shared/mkui/primitives.css'), true);
  assert.equal(isUiRelevantPath('tools/Apply-Mkui-Message-Pilot.mjs'), true);
  assert.equal(isUiRelevantPath('README.md'), false);
  assert.deepEqual(
    uiRelevantFiles([
      'README.md',
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
  const result = validateDesignSourceBody('', ['README.md', 'PRIVACY.md']);
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
});

test('complete source mapping passes for UI changes', () => {
  const result = validateDesignSourceBody(
    VALID_BODY,
    ['scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js'],
  );
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.skipped, false);
});

test('blank placeholders and unchecked confirmations fail closed', () => {
  const invalid = VALID_BODY
    .replace('UI changed / UI değişti: Yes', 'UI changed / UI değişti: Yes / No')
    .replace(
      'Makaytron/Tamplate-Back-White-01 — vite-version/src/components/layouts/base-layout.tsx',
      '-',
    )
    .replace(
      'https://shadcnstore.com/blocks — Application Shell Sections — Application Shell 2',
      'TBD',
    )
    .replace(
      'Makaytron/Toast-01 stacked success/error lifecycle and dismiss control',
      'N/A',
    )
    .replace(
      'The approved shell was adapted to the existing Etsy data and confirmation workflow.',
      'short',
    )
    .replace('- [x] I did not invent', '- [ ] I did not invent');
  const result = validateDesignSourceBody(
    invalid,
    ['shared/mkui/primitives.css'],
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 5, result.errors.join('\n'));
});

test('N/A is accepted for toast only with a concrete explanation', () => {
  const body = VALID_BODY.replace(
    'Makaytron/Toast-01 stacked success/error lifecycle and dismiss control',
    'N/A — this view contains no transient feedback or notification state',
  );
  const result = validateDesignSourceBody(body, ['shared/mkui/shells.css']);
  assert.equal(result.ok, true, result.errors.join('\n'));
});
