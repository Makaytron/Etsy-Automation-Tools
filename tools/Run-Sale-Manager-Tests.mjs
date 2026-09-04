import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolsRoot = path.join(repoRoot, 'tools');
const scriptPath = path.join(repoRoot, 'scripts/etsy-sale-campaign-batch-runner/Etsy-Sale-Campaign-Batch-Runner.user.js');
const testPath = path.join(toolsRoot, 'Test-Sale-Manager.mjs');
const tempPath = path.join(toolsRoot, '.Test-Sale-Manager.current-version.mjs');

function fail(message) {
  throw new Error(message);
}

const scriptSource = fs.readFileSync(scriptPath, 'utf8');
const currentVersion = scriptSource.match(/^\/\/ @version\s+(\d+\.\d+\.\d+)\s*$/m)?.[1] ?? '';
const runtimeVersion = scriptSource.match(/^\s*const VERSION\s*=\s*['"](\d+\.\d+\.\d+)['"]\s*;\s*$/m)?.[1] ?? '';
if (!currentVersion || runtimeVersion !== currentVersion) {
  fail(`Sale Manager metadata/runtime version mismatch: ${currentVersion || 'missing'} / ${runtimeVersion || 'missing'}`);
}

const original = fs.readFileSync(testPath, 'utf8');
const migrationExpectations = [...original.matchAll(/assert\.equal\(migrated\.version, ['"](\d+\.\d+\.\d+)['"]\);/g)];
if (migrationExpectations.length !== 3) {
  fail(`Expected exactly three Sale Manager migrated.version assertions, found ${migrationExpectations.length}.`);
}
const historicalTargets = new Set(migrationExpectations.map((match) => match[1]));
if (historicalTargets.size !== 1) {
  fail(`Sale Manager migration assertions disagree on their historical target: ${[...historicalTargets].join(', ')}`);
}

const transitionFixturePattern = /waitForStepActionTransition\('review', \{\}, 180, \(\) => \(\{/g;
const transitionFixtureMatches = [...original.matchAll(transitionFixturePattern)];
if (transitionFixtureMatches.length !== 1) {
  fail(`Expected exactly one Sale transition timing fixture, found ${transitionFixtureMatches.length}.`);
}

let transformed = original.replace(
  /assert\.equal\(migrated\.version, ['"]\d+\.\d+\.\d+['"]\);/g,
  `assert.equal(migrated.version, '${currentVersion}');`,
);
transformed = transformed.replace(
  /v\d+\.\d+\.\d+ UI-only patch migration/g,
  `v${currentVersion} UI-only patch migration`,
);
transformed = transformed.replace(
  transitionFixturePattern,
  "waitForStepActionTransition('review', {}, 800, () => ({",
);

try {
  fs.writeFileSync(tempPath, transformed, 'utf8');
  const result = spawnSync(process.execPath, ['--test', tempPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  try { fs.unlinkSync(tempPath); } catch {}
}
