import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

const ROOT = resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');
const SECTIONS_PATH = resolve(ROOT, 'tools/fixtures/design-source-lock-sections.md');

const FILES = Object.freeze({
  readmeEn: 'README.md',
  readmeTr: 'README.tr.md',
  contributing: '.github/CONTRIBUTING.md',
  pullRequestTemplate: '.github/PULL_REQUEST_TEMPLATE.md',
  contract: 'docs/design/MKUI-DESIGN-CONTRACT-v1.md',
  catalog: 'docs/design/SHADCNSTORE-REFERENCE-CATALOG.md',
  mkuiReadme: 'shared/mkui/README.md',
  migrationPlan: 'docs/design/MIGRATION-PLAN.md',
});

const REQUIRED_URLS = Object.freeze([
  'https://github.com/Makaytron/Tamplate-Back-White-01',
  'https://github.com/Makaytron/Toast-01',
  'https://shadcnstore.com/blocks',
  'https://shadcnstore.com/templates/dashboard/shadcn-dashboard-landing-template/dashboard',
]);

function count(text, needle) {
  return text.split(needle).length - 1;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function section(source, name) {
  const escaped = escapeRegExp(name);
  const pattern = new RegExp(
    `<!-- DESIGN-SOURCE-LOCK:${escaped} -->\\n([\\s\\S]*?)\\n<!-- \/DESIGN-SOURCE-LOCK:${escaped} -->`,
  );
  const matches = [...source.matchAll(new RegExp(pattern.source, 'g'))];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one design-source section ${name}; found ${matches.length}.`);
  }
  return matches[0][1].trim();
}

function insertBefore(text, anchor, marker, content, path) {
  if (text.includes(marker)) return text;
  const occurrences = count(text, anchor);
  if (occurrences !== 1) {
    throw new Error(`${path}: expected one anchor ${JSON.stringify(anchor)}, found ${occurrences}.`);
  }
  return text.replace(anchor, `${content}\n\n${anchor}`);
}

function insertAfter(text, anchor, marker, content, path) {
  if (text.includes(marker)) return text;
  const occurrences = count(text, anchor);
  if (occurrences !== 1) {
    throw new Error(`${path}: expected one anchor ${JSON.stringify(anchor)}, found ${occurrences}.`);
  }
  return text.replace(anchor, `${anchor}\n\n${content}`);
}

function replaceRange(text, start, end, replacement, path) {
  const startCount = count(text, start);
  const endCount = count(text, end);
  if (startCount !== 1 || endCount !== 1) {
    throw new Error(
      `${path}: expected unique range anchors; start=${startCount}, end=${endCount}.`,
    );
  }
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  if (endIndex < 0) throw new Error(`${path}: end anchor precedes or misses start anchor.`);
  return `${text.slice(0, startIndex)}${replacement}\n\n${text.slice(endIndex)}`;
}

async function load(path) {
  return readFile(resolve(ROOT, path), 'utf8');
}

async function main() {
  const sectionSource = await readFile(SECTIONS_PATH, 'utf8');
  const sections = Object.freeze({
    readmeEn: section(sectionSource, 'README_EN'),
    readmeTr: section(sectionSource, 'README_TR'),
    contributingEn: section(sectionSource, 'CONTRIBUTING_EN'),
    contributingTr: section(sectionSource, 'CONTRIBUTING_TR'),
    pullRequest: section(sectionSource, 'PR'),
    contractVisual: section(sectionSource, 'CONTRACT_VISUAL'),
    catalogApproved: section(sectionSource, 'CATALOG_APPROVED'),
    catalogAdaptation: section(sectionSource, 'CATALOG_ADAPTATION'),
    mkuiReadme: section(sectionSource, 'MKUI_README'),
  });

  const originals = new Map();
  for (const path of Object.values(FILES)) originals.set(path, await load(path));
  const next = new Map(originals);

  next.set(FILES.readmeEn, insertBefore(
    next.get(FILES.readmeEn),
    '## Synthetic panel galleries',
    '## Mandatory design sources',
    sections.readmeEn,
    FILES.readmeEn,
  ));

  next.set(FILES.readmeTr, insertBefore(
    next.get(FILES.readmeTr),
    '## Sentetik panel galerileri',
    '## Zorunlu tasarım kaynakları',
    sections.readmeTr,
    FILES.readmeTr,
  ));

  next.set(FILES.contributing, insertAfter(
    next.get(FILES.contributing),
    '### Prepare a change',
    '#### Mandatory design-source lock',
    sections.contributingEn,
    FILES.contributing,
  ));
  next.set(FILES.contributing, insertAfter(
    next.get(FILES.contributing),
    '### Değişikliği hazırlayın',
    '#### Zorunlu tasarım kaynağı kilidi',
    sections.contributingTr,
    FILES.contributing,
  ));

  next.set(FILES.pullRequestTemplate, insertBefore(
    next.get(FILES.pullRequestTemplate),
    '## Safety and privacy / Güvenlik ve gizlilik',
    '## Design-source compliance / Tasarım kaynağı uyumu',
    sections.pullRequest,
    FILES.pullRequestTemplate,
  ));

  next.set(FILES.contract, replaceRange(
    next.get(FILES.contract),
    '## Visual authority and references',
    '## Goal',
    sections.contractVisual,
    FILES.contract,
  ));

  next.set(FILES.catalog, replaceRange(
    next.get(FILES.catalog),
    '## Approved sources',
    '## Approved block families',
    sections.catalogApproved,
    FILES.catalog,
  ));
  next.set(FILES.catalog, replaceRange(
    next.get(FILES.catalog),
    '## Adaptation rules',
    '## Script mapping',
    sections.catalogAdaptation,
    FILES.catalog,
  ));

  next.set(FILES.mkuiReadme, insertBefore(
    next.get(FILES.mkuiReadme),
    '## Canonical source',
    '## Mandatory design-source lock',
    sections.mkuiReadme,
    FILES.mkuiReadme,
  ));

  const migrationLine = 'Reference system: `Makaytron/Tamplate-Back-White-01`, the applied ShadcnStore dashboard, and the approved block catalog in `SHADCNSTORE-REFERENCE-CATALOG.md`.';
  const migrationReplacement = 'Reference system: the mandatory source lock in `DESIGN-SOURCE-LOCK.md`, `Makaytron/Tamplate-Back-White-01`, `Makaytron/Toast-01`, the applied ShadcnStore dashboard, and the approved block catalog in `SHADCNSTORE-REFERENCE-CATALOG.md`.';
  if (!next.get(FILES.migrationPlan).includes('the mandatory source lock in `DESIGN-SOURCE-LOCK.md`')) {
    const occurrences = count(next.get(FILES.migrationPlan), migrationLine);
    if (occurrences !== 1) {
      throw new Error(`${FILES.migrationPlan}: migration reference anchor count=${occurrences}.`);
    }
    next.set(
      FILES.migrationPlan,
      next.get(FILES.migrationPlan).replace(migrationLine, migrationReplacement),
    );
  }

  const fullyLockedFiles = [
    FILES.readmeEn,
    FILES.readmeTr,
    FILES.contributing,
    FILES.pullRequestTemplate,
    FILES.contract,
    FILES.catalog,
  ];
  for (const path of fullyLockedFiles) {
    const content = next.get(path);
    for (const url of REQUIRED_URLS) {
      if (!content.includes(url)) {
        throw new Error(`${path}: required design source missing: ${url}`);
      }
    }
  }

  const changed = [...next].filter(([path, content]) => content !== originals.get(path));
  if (!WRITE) {
    process.stdout.write(
      changed.length
        ? `Design source lock would update:\n${changed.map(([path]) => `- ${path}`).join('\n')}\n`
        : 'Design source lock is already applied.\n',
    );
    return;
  }

  for (const [path, content] of changed) {
    await writeFile(resolve(ROOT, path), content, 'utf8');
    process.stdout.write(`Updated ${path}\n`);
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
