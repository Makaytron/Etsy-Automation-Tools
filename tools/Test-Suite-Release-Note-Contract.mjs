import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSuiteReleaseNote } from './Suite-Release-Note-Contract.mjs';

const packages = [
  { publicName: 'Makaytron Etsy Sale Manager', version: '1.0.13', scriptName: 'Etsy-Sale-Campaign-Batch-Runner.user.js' },
  { publicName: 'Makaytron Etsy Message Assistant', version: '1.2.9', scriptName: 'Makaytron-Etsy-Message-Assistant.user.js' },
  { publicName: 'Makaytron Etsy Ads Keyword Manager', version: '1.0.4', scriptName: 'Makaytron-Etsy-Ads-Keyword-Manager.user.js' },
  { publicName: 'Makaytron Etsy Listing Analyzer', version: '1.2.3', scriptName: 'Makaytron-Etsy-Listing-Analyzer.user.js' },
  { publicName: 'Makaytron Etsy Keyword & Market Analyzer', version: '1.0.4', scriptName: 'Makaytron-Etsy-Keyword-Market-Analyzer.user.js' },
];

function note(overrides = {}) {
  const packageRows = overrides.packageRows ?? packages.map((entry) => `- ${entry.publicName}: \`${entry.version}\``).join('\n');
  const scriptRows = overrides.scriptRows ?? packages.map((entry) => `- \`${entry.scriptName}\``).join('\n');
  const tagReference = overrides.tagReference ?? 'The suite ZIP contains the complete reviewed repository snapshot at the signed `v1.2.0` tag.';
  return `# Etsy Automation Tools bundle v1.2.0\n\n## Package versions\n\n${packageRows}\n\n## Installable scripts\n\n${scriptRows}\n\n${tagReference}\n`;
}

test('suite release note accepts exact package versions and installable assets', () => {
  const result = validateSuiteReleaseNote({ source: note(), version: '1.2.0', packages });
  assert.deepEqual(result, { packageCount: 5, scriptCount: 5 });
});

test('suite release note rejects a stale package version', () => {
  const rows = packages.map((entry) => `- ${entry.publicName}: \`${entry.publicName.includes('Listing') ? '1.2.2' : entry.version}\``).join('\n');
  assert.throws(() => validateSuiteReleaseNote({ source: note({ packageRows: rows }), version: '1.2.0', packages }), /Listing Analyzer release-note version 1\.2\.2/);
});

test('suite release note rejects a missing installable script', () => {
  const rows = packages.slice(0, 4).map((entry) => `- \`${entry.scriptName}\``).join('\n');
  assert.throws(() => validateSuiteReleaseNote({ source: note({ scriptRows: rows }), version: '1.2.0', packages }), /exactly 5 rows/);
});

test('suite release note rejects an unexpected installable script', () => {
  const rows = [...packages.slice(0, 4).map((entry) => entry.scriptName), 'Wrong.user.js'].map((name) => `- \`${name}\``).join('\n');
  assert.throws(() => validateSuiteReleaseNote({ source: note({ scriptRows: rows }), version: '1.2.0', packages }), /do not match the production registry/);
});

test('suite release note rejects a duplicate package row', () => {
  const rows = [
    `- ${packages[0].publicName}: \`${packages[0].version}\``,
    `- ${packages[0].publicName}: \`${packages[0].version}\``,
    ...packages.slice(2).map((entry) => `- ${entry.publicName}: \`${entry.version}\``),
  ].join('\n');
  assert.throws(() => validateSuiteReleaseNote({ source: note({ packageRows: rows }), version: '1.2.0', packages }), /Duplicate package-version row/);
});

test('suite release note rejects a wrong signed tag reference', () => {
  assert.throws(() => validateSuiteReleaseNote({ source: note({ tagReference: 'Snapshot at the signed `v1.1.0` tag.' }), version: '1.2.0', packages }), /signed `v1\.2\.0` tag/);
});
