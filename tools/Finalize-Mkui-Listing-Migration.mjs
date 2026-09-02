import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
const paths = {
  scriptReadmeTr: path.join(repoRoot, 'scripts/etsy-listing-analyzer/README.md'),
  scriptReadmeEn: path.join(repoRoot, 'scripts/etsy-listing-analyzer/README.en.md'),
  changelog: path.join(repoRoot, 'scripts/etsy-listing-analyzer/CHANGELOG.md'),
  rootReadmeEn: path.join(repoRoot, 'README.md'),
  rootReadmeTr: path.join(repoRoot, 'README.tr.md'),
  migrationPlan: path.join(repoRoot, 'docs/design/MIGRATION-PLAN.md'),
  designContract: path.join(repoRoot, 'docs/design/MKUI-DESIGN-CONTRACT-v1.md'),
  scriptContract: path.join(repoRoot, 'docs/design/contracts/listing-analyzer.md'),
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from);
  assert(first >= 0, `Missing Listing Analyzer finalization anchor: ${label}`);
  assert(text.indexOf(from, first + from.length) < 0, `Ambiguous Listing Analyzer finalization anchor: ${label}`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

function update(relativeName, transform) {
  const file = paths[relativeName];
  const original = fs.readFileSync(file, 'utf8');
  const output = transform(original);
  if (write && output !== original) fs.writeFileSync(file, output, 'utf8');
  return { file, original, output };
}

const results = [];

results.push(update('scriptReadmeTr', (original) => {
  if (original.includes('**Sürüm:** 1.2.3') && original.includes('**MKUI v1 Dashboard Shell:**')) return original;
  let output = replaceOnce(original, '**Sürüm:** 1.2.2', '**Sürüm:** 1.2.3', 'Turkish script README version');
  output = replaceOnce(
    output,
    'Etsy Shop Manager listing kartlarındaki görünür performans verilerini ayrı bir API anahtarı veya OAuth bağlantısı istemeden okuyan; Health Engine ile yerel geçmişi değerlendiren ve listing bazında kullanıcı onaylı iyileştirme kuyruğu hazırlayan Tampermonkey userscriptidir.',
    'Etsy Shop Manager listing kartlarındaki görünür performans verilerini ayrı bir API anahtarı veya OAuth bağlantısı istemeden okuyan; Health Engine ile yerel geçmişi değerlendiren ve listing bazında kullanıcı onaylı iyileştirme kuyruğu hazırlayan Tampermonkey userscriptidir.\n\n> **MKUI v1 Dashboard Shell:** `1.2.3`, mevcut bilgi mimarisini ve güvenlik durum makinelerini değiştirmeden kanonik MKUI `1.0.0` token, kart, form, durum, modal ve odak yüzeylerini kullanır.',
    'Turkish MKUI summary',
  );
  output = replaceOnce(
    output,
    'Aşağıdaki her görsel yalnız userscript öğesinden alınmıştır. Etsy sayfası, yerine konmuş başka bir site veya tarayıcı arka planı içermez.\n',
    'Aşağıdaki her görsel yalnız userscript öğesinden alınmıştır. Etsy sayfası, yerine konmuş başka bir site veya tarayıcı arka planı içermez.\n\n| MKUI dashboard önizlemesi |\n|---|\n| ![Sentetik Listing Analyzer MKUI dashboard önizlemesi](../../assets/screenshots/listing-analyzer-mkui-dashboard-v1.2.3.png) |\n\n> Production `1.2.3` CSS katmanından ağ erişimi kapalı sentetik fixture ile üretilmiştir. Gerçek mağaza, listing veya Etsy hesabı verisi içermez.\n',
    'Turkish MKUI gallery',
  );
  return output;
}));

results.push(update('scriptReadmeEn', (original) => {
  if (original.includes('Version: `1.2.3`') && original.includes('**MKUI v1 Dashboard Shell:**')) return original;
  let output = replaceOnce(original, 'Version: `1.2.2`', 'Version: `1.2.3`', 'English script README version');
  output = replaceOnce(
    output,
    'A Tampermonkey userscript that reads visible performance data from Etsy Shop Manager listing cards without asking for a separate API key or OAuth connection, evaluates local history with Health Engine, and prepares listing-level, user-approved improvement queues.',
    'A Tampermonkey userscript that reads visible performance data from Etsy Shop Manager listing cards without asking for a separate API key or OAuth connection, evaluates local history with Health Engine, and prepares listing-level, user-approved improvement queues.\n\n> **MKUI v1 Dashboard Shell:** `1.2.3` maps the existing information architecture and safety state machines onto canonical MKUI `1.0.0` tokens, cards, forms, statuses, modals, and focus surfaces without rewriting behavior.',
    'English MKUI summary',
  );
  output = replaceOnce(
    output,
    'Every image below is an element-level capture of the userscript itself. No Etsy page, substitute website, or browser background is included.\n',
    'Every image below is an element-level capture of the userscript itself. No Etsy page, substitute website, or browser background is included.\n\n| MKUI dashboard preview |\n|---|\n| ![Synthetic Listing Analyzer MKUI dashboard preview](../../assets/screenshots/listing-analyzer-mkui-dashboard-v1.2.3.png) |\n\n> Generated from the production `1.2.3` CSS layer in a network-isolated synthetic fixture. It contains no real shop, listing, or Etsy account data.\n',
    'English MKUI gallery',
  );
  return output;
}));

results.push(update('changelog', (original) => {
  if (original.includes('## 1.2.3 - 2026-09-02')) return original;
  const entry = `# Changelog\n\n## 1.2.3 - 2026-09-02\n\n- Migrated the existing Listing Analyzer dashboard presentation to MKUI v1 while preserving the open Shadow DOM, every recorded \`data-*\` hook and \`meli-*\` class signature, navigation/filter/selection state, keyboard shortcuts, storage and telemetry contracts, and the complete publish/deactivate verification state machines.\n- Mapped the dashboard shell, cards, forms, buttons, pills, semantic statuses, modal surfaces, radii, shadows, and focus rings to the canonical MKUI \`1.0.0\` token contract without changing Etsy selectors or listing workflows.\n- Added a fail-closed source audit, guarded exact-anchor transformer, permanent MKUI invariant suite, network-isolated production-CSS preview, and dedicated Listing Analyzer CI. The full pre-existing regression suite, privacy guard, distribution gate, syntax checks, and patch-hygiene checks remain mandatory.\n\n`;
  return replaceOnce(original, '# Changelog\n\n', entry, 'Listing Analyzer changelog header');
}));

results.push(update('rootReadmeEn', (original) => {
  if (original.includes('etsy-listing-analyzer/README.en.md) | 1.2.3') && original.includes('listing-analyzer-mkui-dashboard-v1.2.3.png')) return original;
  let output = replaceOnce(
    original,
    '| [Makaytron Etsy Listing Analyzer](./scripts/etsy-listing-analyzer/README.en.md) | 1.2.2 |',
    '| [Makaytron Etsy Listing Analyzer](./scripts/etsy-listing-analyzer/README.en.md) | 1.2.3 |',
    'English root version table',
  );
  output = replaceOnce(output, 'Listing Analyzer `v1.2.2` has no AI network integration', 'Listing Analyzer `v1.2.3` has no AI network integration', 'English safe-use version');
  output = replaceOnce(
    output,
    '### Makaytron Etsy Listing Analyzer\n\n',
    '### Makaytron Etsy Listing Analyzer\n\n| MKUI dashboard preview |\n|---|\n| ![Makaytron Etsy Listing Analyzer MKUI dashboard preview](./assets/screenshots/listing-analyzer-mkui-dashboard-v1.2.3.png) |\n\n> Generated from the production `1.2.3` CSS layer in a network-isolated synthetic fixture. It contains no real shop, listing, or Etsy account data.\n\n',
    'English root MKUI gallery',
  );
  return output;
}));

results.push(update('rootReadmeTr', (original) => {
  if (original.includes('etsy-listing-analyzer/README.md) | 1.2.3') && original.includes('listing-analyzer-mkui-dashboard-v1.2.3.png')) return original;
  let output = replaceOnce(
    original,
    '| [Makaytron Etsy Listing Analyzer](./scripts/etsy-listing-analyzer/README.md) | 1.2.2 |',
    '| [Makaytron Etsy Listing Analyzer](./scripts/etsy-listing-analyzer/README.md) | 1.2.3 |',
    'Turkish root version table',
  );
  output = replaceOnce(output, 'Listing Analyzer `v1.2.2` AI ağına bağlanmaz', 'Listing Analyzer `v1.2.3` AI ağına bağlanmaz', 'Turkish safe-use version');
  output = replaceOnce(
    output,
    '### Makaytron Etsy Listing Analyzer\n\n',
    '### Makaytron Etsy Listing Analyzer\n\n| MKUI dashboard önizlemesi |\n|---|\n| ![Makaytron Etsy Listing Analyzer MKUI dashboard önizlemesi](./assets/screenshots/listing-analyzer-mkui-dashboard-v1.2.3.png) |\n\n> Production `1.2.3` CSS katmanından ağ erişimi kapalı sentetik fixture ile üretilmiştir. Gerçek mağaza, listing veya Etsy hesabı verisi içermez.\n\n',
    'Turkish root MKUI gallery',
  );
  return output;
}));

results.push(update('migrationPlan', (original) => {
  if (original.includes('[x] Listing Analyzer MKUI migration (`1.2.3`, MKUI `1.0.0`)')) return original;
  let output = replaceOnce(
    original,
    '- [ ] Listing Analyzer MKUI migration — ACTIVE\n- [ ] Cross-script integration QA',
    '- [x] Listing Analyzer MKUI migration (`1.2.3`, MKUI `1.0.0`)\n- [ ] Cross-script integration QA — ACTIVE',
    'migration checklist',
  );
  output = replaceOnce(output, '## Phase 7 — Listing Analyzer — ACTIVE', '## Phase 7 — Listing Analyzer — COMPLETE', 'phase 7 status');
  output = replaceOnce(
    output,
    'Migrate last, but use it as the reference for dashboard shell geometry. Preserve navigation state, filter drawer, listing selection, queue/AI/settings views, keyboard shortcuts and publish/deactivate verification.',
    'Migrated as the production reference for dashboard shell geometry. The guarded transform preserves navigation state, filter drawer, listing selection, queue/AI/settings views, keyboard shortcuts, open Shadow DOM, every recorded hook/class signature, and publish/deactivate verification. The full Listing Analyzer behavior suite, MKUI invariants, synthetic production-CSS preview, privacy and distribution gates pass before publication.',
    'phase 7 completion summary',
  );
  output = replaceOnce(output, '## Phase 8 — Cross-script QA', '## Phase 8 — Cross-script QA — ACTIVE', 'phase 8 status');
  return output;
}));

results.push(update('designContract', (original) => {
  if (original.includes('All five production userscripts are migrated to MKUI v1')) return original;
  return replaceOnce(
    original,
    'Current adoption: Ads Keyword Manager, Keyword & Market Analyzer, Sale Manager and Message Assistant are migrated to MKUI v1. Listing Analyzer remains last.',
    'Current adoption: All five production userscripts are migrated to MKUI v1. Listing Analyzer `1.2.3` is the canonical Dashboard Shell implementation; cross-script coexistence QA and canonical bundle/hash drift enforcement are the active follow-up gates.',
    'MKUI adoption status',
  );
}));

results.push(update('scriptContract', (original) => {
  if (original.includes('Version: `1.2.3`') && original.includes('Migration status: `MKUI v1 complete`')) return original;
  let output = replaceOnce(
    original,
    'Baseline version: **1.2.2**\nSource:',
    'Baseline version: **1.2.2**\nVersion: `1.2.3`\nMigration status: `MKUI v1 complete`\nMKUI source: `1.0.0`\nSource:',
    'Listing Analyzer contract version',
  );
  output = replaceOnce(
    output,
    'Listing Analyzer is the closest existing userscript translation of the `Tamplate-Back-White-01` dashboard model. Its shell informs MKUI Dashboard Shell even though its production migration happens last.',
    'Listing Analyzer `1.2.3` is the canonical production translation of the `Tamplate-Back-White-01` dashboard model. Its collapsed/expanded navigation, header, workspace, modal, toast, token and primitive mapping define MKUI Dashboard Shell while the original behavioral routing and safety state machines remain intact.',
    'Listing Analyzer dashboard status',
  );
  return output;
}));

for (const { output } of results) {
  assert(!output.includes('Listing Analyzer `v1.2.2`'), 'A root Listing Analyzer v1.2.2 reference remains');
}

if (write) {
  const changed = results.filter(({ original, output }) => original !== output).length;
  console.log(`Finalized Listing Analyzer MKUI migration documentation in ${changed} file(s).`);
} else {
  console.log('Listing Analyzer MKUI finalization dry-run passed; no files written.');
}
