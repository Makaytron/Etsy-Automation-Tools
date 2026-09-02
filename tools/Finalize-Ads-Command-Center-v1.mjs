import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

const ROOT = resolve(import.meta.dirname, '..');
const VERSION = '1.0.5';

const FILES = Object.freeze({
  rootReadme: resolve(ROOT, 'README.md'),
  rootReadmeTr: resolve(ROOT, 'README.tr.md'),
  readme: resolve(ROOT, 'scripts/etsy-ads-keyword-manager/README.md'),
  readmeEn: resolve(ROOT, 'scripts/etsy-ads-keyword-manager/README.en.md'),
  changelog: resolve(ROOT, 'scripts/etsy-ads-keyword-manager/CHANGELOG.md'),
  migration: resolve(ROOT, 'docs/design/MIGRATION-PLAN.md'),
  contract: resolve(ROOT, 'docs/design/contracts/ads-keyword-manager.md'),
  behaviorTest: resolve(ROOT, 'tools/Test-Ads-Keyword-Manager.mjs'),
});

function replaceExactlyOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Expected exactly one ${label} anchor, found ${count}.`);
  return source.replace(before, after);
}

function insertBeforeOnce(source, anchor, addition, marker, label) {
  if (source.includes(marker)) return source;
  const count = source.split(anchor).length - 1;
  if (count !== 1) throw new Error(`Expected exactly one ${label} anchor, found ${count}.`);
  return source.replace(anchor, `${addition}\n\n${anchor}`);
}

function appendOnce(source, addition, marker) {
  if (source.includes(marker)) return source;
  return `${source.trimEnd()}\n\n${addition.trim()}\n`;
}

const TURKISH_LAYOUT = `## Komut merkezi düzeni

Panel, uzun Türkçe eylemleri kesmeyen responsive bir komut merkezi olarak düzenlenmiştir. Mevcut sayfa işlemleri, bütün sayfalarda çalışan onaylı toplu işlem ve kelime listesi bakımı birbirinden ayrı kartlarda gösterilir. Kritik tüm-sayfalar eylemi kendi uyarı sınırında tutulur; dar ekranlarda kontroller tek sütuna iner. Bu görünüm değişikliği Etsy selectorlarını, kullanıcı onaylarını, doğrulamayı, pagination sırasını veya işlem mantığını değiştirmez.`;

const ENGLISH_LAYOUT = `## Command-center layout

The panel is presented as a responsive command center so long actions remain readable. Current-page operations, the confirmed all-pages batch action, and keyword-list maintenance are separated into distinct cards. The critical all-pages action remains inside its own warning boundary, while controls collapse to one column on narrow screens. Etsy selectors, user confirmations, verification, pagination order, and business behavior are unchanged.`;

const CHANGELOG_ENTRY = `## [1.0.5] - 2026-09-02

### Changed

- Ads paneli, \`Tamplate-Back-White-01\`, uygulanmış ShadcnStore dashboard ve kayıtlı \`Application Interface 2\` / \`Data Table 2\` kaynakları kullanılarak gerçek production DOM üzerinde responsive bir komut merkezine dönüştürüldü.
- Mevcut sayfa, bütün sayfalar ve kelime listesi işlemleri ayrı komut kartlarına ayrıldı; uzun Türkçe eylem adları kesilmeden gösteriliyor ve kritik tüm-sayfalar işlemi belirgin uyarı sınırında kalıyor.
- Kelime listesi editörü 960 px responsive iki sütunlu çalışma alanına geçirildi; dar ekranlarda tek sütuna düşüyor.

### Safety

- \`close-page\`, \`open-page\`, \`close-all\`, \`edit\` ve \`update\` eylem hookları; Etsy selectorları, storage anahtarları, açık onaylar, pagination, doğrulama, retry ve fail-closed davranışları korunmuştur.
- Toast sistemi bu sürümde değiştirilmedi; mevcut geçici bildirim davranışı ayrı Toast-01 migration kapsamına bırakıldı.

### Validation

- Production userscriptten oluşturulan sentetik panel ve editör fixtureları, davranış testleri, source-lock kontrolleri, MKUI drift/coexistence denetimleri ve tam dağıtım kapısı çalıştırıldı.`;

const CONTRACT_ENTRY = `## Command Center v1 source map

- Surface: Ads Keyword Manager main panel and responsive keyword-rule editor
- Template source ids: \`template.shell.base-layout\`, \`template.shell.site-header\`, \`template.theme.tokens\`, \`template.primitive.card\`, \`template.primitive.button\`, \`template.primitive.input\`, \`template.primitive.table\`
- Exact template locators: \`Makaytron/Tamplate-Back-White-01@main:vite-version/src/components/layouts/base-layout.tsx\`, \`Makaytron/Tamplate-Back-White-01@main:vite-version/src/components/site-header.tsx\`, \`Makaytron/Tamplate-Back-White-01@main:vite-version/src/index.css\`, \`Makaytron/Tamplate-Back-White-01@main:vite-version/src/components/ui/card.tsx\`, \`Makaytron/Tamplate-Back-White-01@main:vite-version/src/components/ui/button.tsx\`, \`Makaytron/Tamplate-Back-White-01@main:vite-version/src/components/ui/input.tsx\`, \`Makaytron/Tamplate-Back-White-01@main:vite-version/src/components/ui/table.tsx\`
- Applied composition: \`shadcn.dashboard.applied\` — the sidebar/header/content hierarchy is translated into the standalone Compact shell without importing unrelated dashboard features
- Block sources: \`shadcn.blocks.application-interface\` — **Application Interface 2**; \`shadcn.blocks.datatable\` — **Data Table 2**
- Toast source: N/A — this presentation pass does not add or modify transient feedback; the existing toast behavior remains untouched
- Makaytron adaptation: 464 px responsive command surface, sticky header, two-by-two metric grid, three-tier action hierarchy, readable Turkish labels, isolated all-pages warning region, 960 px two-column rule editor, mobile single-column layout, and reduced-motion fallback
- Preserved behavior: all existing ids and data hooks, Etsy selectors, storage keys, confirmation boundaries, pagination, request sequencing, verification, retry, and fail-closed behavior
- Evidence: \`docs/design/previews/ads-keyword-manager-command-center-v1.html\`, \`docs/design/previews/ads-keyword-manager-command-center-v1.audit.json\`, \`assets/screenshots/ads-keywords-panel-ready.png\`, \`assets/screenshots/ads-keywords-rule-editor.png\`, focused behavior/presentation tests, MKUI drift checks, and cross-script coexistence audit`;

export async function finalizeAdsCommandCenter() {
  const entries = await Promise.all(
    Object.entries(FILES).map(async ([key, path]) => [key, path, await readFile(path, 'utf8')]),
  );
  const byKey = Object.fromEntries(entries.map(([key, path, source]) => [key, { path, source }]));

  byKey.rootReadme.source = replaceExactlyOnce(
    byKey.rootReadme.source,
    '| [Makaytron Etsy Ads Keyword Manager](./scripts/etsy-ads-keyword-manager/README.en.md) | 1.0.4 |',
    `| [Makaytron Etsy Ads Keyword Manager](./scripts/etsy-ads-keyword-manager/README.en.md) | ${VERSION} |`,
    'English root README version',
  );
  byKey.rootReadmeTr.source = replaceExactlyOnce(
    byKey.rootReadmeTr.source,
    '| [Makaytron Etsy Ads Keyword Manager](./scripts/etsy-ads-keyword-manager/README.md) | 1.0.4 |',
    `| [Makaytron Etsy Ads Keyword Manager](./scripts/etsy-ads-keyword-manager/README.md) | ${VERSION} |`,
    'Turkish root README version',
  );

  byKey.readme.source = replaceExactlyOnce(
    byKey.readme.source,
    '**Sürüm:** 1.0.4',
    `**Sürüm:** ${VERSION}`,
    'Turkish README version',
  );
  byKey.readme.source = replaceExactlyOnce(
    byKey.readme.source,
    'Paneldeki `v1.0.4` rozeti',
    `Paneldeki \`v${VERSION}\` rozeti`,
    'Turkish version badge',
  );
  byKey.readme.source = insertBeforeOnce(
    byKey.readme.source,
    '## Filtre seçenekleri',
    TURKISH_LAYOUT,
    '## Komut merkezi düzeni',
    'Turkish layout section',
  );

  byKey.readmeEn.source = replaceExactlyOnce(
    byKey.readmeEn.source,
    'Version: `1.0.4`',
    `Version: \`${VERSION}\``,
    'English README version',
  );
  byKey.readmeEn.source = replaceExactlyOnce(
    byKey.readmeEn.source,
    'Click the `v1.0.4` badge',
    `Click the \`v${VERSION}\` badge`,
    'English version badge',
  );
  byKey.readmeEn.source = insertBeforeOnce(
    byKey.readmeEn.source,
    '## Matching choices',
    ENGLISH_LAYOUT,
    '## Command-center layout',
    'English layout section',
  );

  byKey.changelog.source = insertBeforeOnce(
    byKey.changelog.source,
    '## [1.0.4]',
    CHANGELOG_ENTRY,
    '## [1.0.5]',
    'changelog release heading',
  );
  byKey.migration.source = replaceExactlyOnce(
    byKey.migration.source,
    'Pilot wired into Ads Keyword Manager (`1.0.4`, MKUI source `1.0.0`)',
    `Pilot wired into Ads Keyword Manager (\`${VERSION}\`, MKUI source \`1.0.0\`)`,
    'migration plan version',
  );
  byKey.contract.source = appendOnce(
    byKey.contract.source,
    CONTRACT_ENTRY,
    '## Command Center v1 source map',
  );
  byKey.behaviorTest.source = appendOnce(
    byKey.behaviorTest.source,
    `/* Ads Command Center v1 presentation contract. */\nawait import('./Test-Ads-Command-Center-v1.mjs');`,
    'Ads Command Center v1 presentation contract.',
  );

  await Promise.all(Object.values(byKey).map(({ path, source }) => writeFile(path, source, 'utf8')));
  return Object.values(byKey).map(({ path }) => path);
}

async function main() {
  const write = process.argv.includes('--write');
  if (!write) {
    throw new Error('Finalize-Ads-Command-Center-v1.mjs is write-only; pass --write.');
  }
  const paths = await finalizeAdsCommandCenter();
  process.stdout.write(`Finalized ${paths.length} Ads command-center documentation/test files.\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
