import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policyFiles = ['PRIVACY.md', 'PRIVACY.en.md', 'SECURITY.md', 'SECURITY.en.md'];
const productNames = [
  'Etsy Sale Manager',
  'Message Assistant',
  'Ads Keyword Manager',
  'Listing Analyzer',
  'Keyword & Market Analyzer',
];
const semver = '(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)';
const errors = [];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const contents = new Map();
for (const relativePath of policyFiles) {
  const fullPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    errors.push(`${relativePath}: active policy file is missing.`);
    continue;
  }

  const source = fs.readFileSync(fullPath, 'utf8');
  contents.set(relativePath, source);

  for (const productName of productNames) {
    const pattern = new RegExp(`${escapeRegExp(productName)}\\s+\\`v${semver}\\``, 'g');
    const matches = [...source.matchAll(pattern)];
    for (const match of matches) {
      const line = source.slice(0, match.index).split(/\r?\n/).length;
      errors.push(`${relativePath}:${line}: active policy claims must be version-agnostic; move historical version claims to release/advisory records (${match[0]}).`);
    }
  }
}

const privacyTr = contents.get('PRIVACY.md') || '';
const privacyEn = contents.get('PRIVACY.en.md') || '';
const trDates = [...privacyTr.matchAll(/^Son güncelleme:\s*(\d{4}-\d{2}-\d{2})\s*$/gm)].map((match) => match[1]);
const enDates = [...privacyEn.matchAll(/^Last updated:\s*(\d{4}-\d{2}-\d{2})\s*$/gm)].map((match) => match[1]);

if (trDates.length !== 1) {
  errors.push(`PRIVACY.md: expected exactly one Son güncelleme date, found ${trDates.length}.`);
}
if (enDates.length !== 1) {
  errors.push(`PRIVACY.en.md: expected exactly one Last updated date, found ${enDates.length}.`);
}
if (trDates.length === 1 && enDates.length === 1 && trDates[0] !== enDates[0]) {
  errors.push(`Privacy policy dates differ: PRIVACY.md=${trDates[0]}, PRIVACY.en.md=${enDates[0]}.`);
}

if (errors.length > 0) {
  throw new Error(`Active policy consistency failed:\n- ${errors.join('\n- ')}`);
}

console.log(`PASS active policy consistency: ${policyFiles.length} policy file(s), privacy date ${trDates[0]}.`);
