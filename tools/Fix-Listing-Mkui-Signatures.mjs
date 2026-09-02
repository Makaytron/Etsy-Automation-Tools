import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'tools/Audit-Listing-Analyzer.mjs',
  'tools/Apply-Mkui-Listing-Pilot.mjs',
  'tools/Test-Mkui-Listing-Analyzer.mjs',
];
const from = '/\\bmeli-[a-z0-9-]+\\b/gi';
const to = '/(?<![-\\w])meli-[a-z0-9-]+\\b/gi';

for (const relativePath of files) {
  const file = path.join(repoRoot, relativePath);
  const original = fs.readFileSync(file, 'utf8');
  const occurrences = original.split(from).length - 1;
  if (occurrences !== 1) throw new Error(`Expected one legacy meli signature regex in ${relativePath}, found ${occurrences}`);
  fs.writeFileSync(file, original.replace(from, to), 'utf8');
  console.log(`Updated ${relativePath}`);
}
