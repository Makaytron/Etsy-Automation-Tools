import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolsRoot = path.join(repoRoot, 'tools');
const scriptPath = path.join(repoRoot, 'scripts/etsy-listing-analyzer/Makaytron-Etsy-Listing-Analyzer.user.js');
const generatorPath = path.join(toolsRoot, 'Generate-Mkui-Listing-Analyzer-Preview.mjs');
const tempPath = path.join(toolsRoot, '.Generate-Mkui-Listing-Analyzer-Preview.current.mjs');

function fail(message) {
  throw new Error(message);
}

const scriptSource = fs.readFileSync(scriptPath, 'utf8');
const currentVersion = scriptSource.match(/^\/\/ @version\s+(\d+\.\d+\.\d+)\s*$/m)?.[1] ?? '';
const runtimeVersion = scriptSource.match(/^\s*const APP_VERSION\s*=\s*['"](\d+\.\d+\.\d+)['"]\s*;\s*$/m)?.[1] ?? '';
if (!currentVersion || currentVersion !== runtimeVersion) {
  fail(`Listing Analyzer metadata/runtime version mismatch: ${currentVersion || 'missing'} / ${runtimeVersion || 'missing'}`);
}

const originalGenerator = fs.readFileSync(generatorPath, 'utf8');
const templateVersion = originalGenerator.match(/Preview generation requires Listing Analyzer (\d+\.\d+\.\d+)/)?.[1] ?? '';
if (!templateVersion) {
  fail('Listing Analyzer preview template version marker was not found.');
}

const targetPath = currentVersion === templateVersion ? generatorPath : tempPath;
try {
  if (targetPath === tempPath) {
    const transformed = originalGenerator.split(templateVersion).join(currentVersion);
    if (transformed === originalGenerator) fail('Listing Analyzer preview template was not transformed.');
    fs.writeFileSync(tempPath, transformed, 'utf8');
  }

  const result = spawnSync(process.execPath, [targetPath, ...process.argv.slice(2)], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (targetPath === tempPath) {
    try { fs.unlinkSync(tempPath); } catch {}
  }
}
