import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
const files = {
  script: 'scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js',
  readmeTr: 'scripts/etsy-message-assistant/README.md',
  readmeEn: 'scripts/etsy-message-assistant/README.en.md',
  changelog: 'scripts/etsy-message-assistant/CHANGELOG.md',
  rootEn: 'README.md',
  rootTr: 'README.tr.md',
  contract: 'docs/design/contracts/message-assistant.md',
  designContract: 'docs/design/MKUI-DESIGN-CONTRACT-v1.md',
  migrationPlan: 'docs/design/MIGRATION-PLAN.md',
};

function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from);
  assert.ok(first >= 0, `Missing Message Assistant finalization anchor: ${label}`);
  assert.equal(text.indexOf(from, first + from.length), -1, `Ambiguous Message Assistant finalization anchor: ${label}`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

const original = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, relative]) => [key, await readFile(path.join(repoRoot, relative), 'utf8')])));
assert.ok(original.script.includes('// @version      1.2.9'), 'Message Assistant userscript is not version 1.2.9');
assert.ok(original.script.includes("const APP_VERSION = '1.2.9';"), 'Message Assistant runtime version is not 1.2.9');
assert.ok(original.script.includes("const MKUI_VERSION = '1.0.0';"), 'Message Assistant MKUI marker is missing');

const alreadyApplied = original.readmeEn.includes('Version: `1.2.9`')
  && original.readmeTr.includes('**Sürüm:** 1.2.9')
  && original.changelog.includes('## [1.2.9] - 2026-09-02')
  && original.rootEn.includes('Message Assistant](./scripts/etsy-message-assistant/README.en.md) | 1.2.9')
  && original.rootTr.includes('Message Assistant](./scripts/etsy-message-assistant/README.md) | 1.2.9')
  && original.contract.includes('Baseline version: **1.2.9**')
  && original.migrationPlan.includes('[x] Message Assistant MKUI migration (`1.2.9`, MKUI `1.0.0`)');

let output = { ...original };

if (!alreadyApplied) {
  output.readmeEn = replaceOnce(output.readmeEn, 'Version: `1.2.8`', 'Version: `1.2.9`', 'English README version');
  output.readmeEn = replaceOnce(
    output.readmeEn,
    'The script is standalone and does not require another Etsy Automation Tools package.\n',
    'The script is standalone and does not require another Etsy Automation Tools package.\n\nVersion 1.2.9 adopts the MKUI 1.0.0 Workspace Shell: the white/neutral application frame, 60 px header, 184 px expanded navigation, cards, controls and focus states now follow the approved Tamplate-Back-White-01 and ShadcnStore dashboard references without changing message, provider, Otopilot, storage or verification behavior.\n',
    'English README MKUI note',
  );

  output.readmeTr = replaceOnce(output.readmeTr, '**Sürüm:** 1.2.8', '**Sürüm:** 1.2.9', 'Turkish README version');
  output.readmeTr = replaceOnce(
    output.readmeTr,
    'Script standalone çalışır; diğer Etsy Automation Tools paketlerinin kurulması gerekmez.\n',
    'Script standalone çalışır; diğer Etsy Automation Tools paketlerinin kurulması gerekmez.\n\n1.2.9 sürümü MKUI 1.0.0 Workspace Shell tasarımına geçer: beyaz/nötr uygulama kabuğu, 60 px başlık, 184 px geniş menü, kartlar, kontroller ve odak durumları Tamplate-Back-White-01 ile onaylı ShadcnStore dashboard referanslarına uyarlanmıştır. Mesaj, sağlayıcı, Otopilot, depolama ve doğrulama davranışları değiştirilmemiştir.\n',
    'Turkish README MKUI note',
  );

  output.changelog = replaceOnce(
    output.changelog,
    '## [Unreleased]\n\n',
    `## [Unreleased]\n\n## [1.2.9] - 2026-09-02\n\n### Changed\n\n- Message Assistant, MKUI 1.0.0 Workspace Shell görünümüne geçirildi. Beyaz/nötr panel, 60 px başlık, 184 px geniş navigation, sade aktif menü, standardize kart/form/buton yüzeyleri ve görünür odak halkaları Tamplate-Back-White-01 ile onaylı ShadcnStore dashboard/application block referanslarına uyarlandı.\n- Değişiklik yalnız presentation katmanındadır; mevcut closed Shadow DOM, tüm data hook'ları, global mema-* Etsy yüzeyleri, mesaj/composer/gönderim doğrulaması, sağlayıcılar, Otopilot, storage ve telemetry sözleşmeleri korunmuştur.\n- Tamamen sentetik fixture'dan, doğrudan production 1.2.9 CSS katmanlarıyla yeniden üretilebilen MKUI workspace preview eklendi.\n\n### Tests\n\n- Exact-anchor transformer metadata, data-* imzası, closed Shadow DOM sayısı ve GLOBAL_CSS katmanında drift olursa fail-closed durur.\n- MKUI invariant testi, mevcut Message Assistant behavior suite'i, izole Chrome fixture'ı, privacy guard ve tam distribution gate birlikte çalıştırılır.\n\n`,
    'changelog release section',
  );

  output.rootEn = replaceOnce(
    output.rootEn,
    '| [Makaytron Etsy Message Assistant](./scripts/etsy-message-assistant/README.en.md) | 1.2.8 |',
    '| [Makaytron Etsy Message Assistant](./scripts/etsy-message-assistant/README.en.md) | 1.2.9 |',
    'root English version row',
  );
  output.rootEn = replaceOnce(
    output.rootEn,
    '> **Privacy:** Message Assistant screenshots are not kept in the public repository. To prevent real account, shop, customer, or order data from entering visual assets, only screenshots regenerated from fully synthetic fixtures may be added.\n',
    '| MKUI workspace preview |\n|---|\n| ![Makaytron Etsy Message Assistant MKUI workspace preview](./assets/screenshots/message-assistant-mkui-workspace-v1.2.9.png) |\n\n> Generated from the production `1.2.9` CSS layers in a network-isolated synthetic fixture. It contains no real account, shop, customer or order data.\n',
    'root English preview section',
  );

  output.rootTr = replaceOnce(
    output.rootTr,
    '| [Makaytron Etsy Message Assistant](./scripts/etsy-message-assistant/README.md) | 1.2.8 |',
    '| [Makaytron Etsy Message Assistant](./scripts/etsy-message-assistant/README.md) | 1.2.9 |',
    'root Turkish version row',
  );
  output.rootTr = replaceOnce(
    output.rootTr,
    "> **Gizlilik:** Message Assistant ekran görüntüleri public repoda tutulmaz. Gerçek hesap, mağaza, müşteri veya sipariş verisinin görsel varlıklara karışmasını önlemek için yalnız tamamen sentetik fixture'lardan yeniden üretilecek görseller kabul edilir.\n",
    '| MKUI çalışma alanı önizlemesi |\n|---|\n| ![Makaytron Etsy Message Assistant MKUI çalışma alanı önizlemesi](./assets/screenshots/message-assistant-mkui-workspace-v1.2.9.png) |\n\n> Production `1.2.9` CSS katmanlarından, ağ erişimi kapalı tamamen sentetik fixture ile üretilmiştir. Gerçek hesap, mağaza, müşteri veya sipariş verisi içermez.\n',
    'root Turkish preview section',
  );

  output.contract = replaceOnce(output.contract, 'Baseline version: **1.2.8**', 'Baseline version: **1.2.9**', 'Message contract version');
  output.contract = replaceOnce(output.contract, '## Migration target\n\nAdopt Workspace Shell semantics while preserving wide/fullscreen behavior, data-action routing and all global Etsy integration surfaces.\n', '## Migration result\n\nMKUI 1.0.0 Workspace Shell mapping is complete in version 1.2.9. Wide/fullscreen behavior, data-action routing and all global Etsy integration surfaces remain protected.\n', 'Message contract result');

  output.designContract = replaceOnce(
    output.designContract,
    'Current adoption: Ads Keyword Manager, Keyword & Market Analyzer and Sale Manager are migrated to MKUI v1. Message Assistant is active; Listing Analyzer remains last.',
    'Current adoption: Ads Keyword Manager, Keyword & Market Analyzer, Sale Manager and Message Assistant are migrated to MKUI v1. Listing Analyzer remains last.',
    'MKUI adoption summary',
  );

  output.migrationPlan = replaceOnce(
    output.migrationPlan,
    'Reference design: `Makaytron/Tamplate-Back-White-01`.',
    'Reference system: `Makaytron/Tamplate-Back-White-01`, the applied ShadcnStore dashboard, and the approved block catalog in `SHADCNSTORE-REFERENCE-CATALOG.md`.',
    'migration reference sources',
  );
  output.migrationPlan = replaceOnce(output.migrationPlan, '- [ ] Message Assistant MKUI migration — ACTIVE', '- [x] Message Assistant MKUI migration (`1.2.9`, MKUI `1.0.0`)', 'migration status');
  output.migrationPlan = replaceOnce(output.migrationPlan, '- [ ] Listing Analyzer MKUI migration', '- [ ] Listing Analyzer MKUI migration — ACTIVE', 'next migration status');
  output.migrationPlan = replaceOnce(output.migrationPlan, '## Phase 6 — Message Assistant — ACTIVE', '## Phase 6 — Message Assistant — COMPLETE', 'phase title');
  output.migrationPlan = replaceOnce(output.migrationPlan, 'Active gate:\n', 'Completed gate:\n', 'phase gate label');
  output.migrationPlan = replaceOnce(output.migrationPlan, '## Phase 7 — Listing Analyzer\n', '## Phase 7 — Listing Analyzer — ACTIVE\n', 'listing phase title');
}

for (const [key, relative] of Object.entries(files)) {
  if (key === 'script' || output[key] === original[key]) continue;
  if (write) await writeFile(path.join(repoRoot, relative), output[key], 'utf8');
}

if (write && !alreadyApplied) process.stdout.write('Finalized Message Assistant 1.2.9 documentation and MKUI migration state.\n');
else if (alreadyApplied) process.stdout.write('Message Assistant 1.2.9 migration documentation is already finalized.\n');
else process.stdout.write('Message Assistant migration finalization dry-run passed; no files written.\n');
