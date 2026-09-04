import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptsRoot = path.join(repoRoot, 'scripts');
const rawPrefix = 'https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/';
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function fail(message) {
  throw new Error(message);
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && entry.name.endsWith('.user.js') ? [full] : [];
  });
}

function metadataBlock(source, relativePath) {
  const matches = source.match(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==/gm) ?? [];
  if (matches.length !== 1) {
    fail(`${relativePath}: expected exactly one userscript metadata block, found ${matches.length}.`);
  }
  return matches[0];
}

function metadataValues(metadata, key) {
  const pattern = new RegExp(`^//\\s+@${key}\\s+(.+?)\\s*$`, 'gm');
  return [...metadata.matchAll(pattern)].map((match) => match[1]);
}

function exactlyOne(values, label, relativePath) {
  if (values.length !== 1) {
    fail(`${relativePath}: expected exactly one ${label}, found ${values.length}.`);
  }
  return values[0];
}

function parseUserscript(source, relativePath, { requireRuntimeVersion = true } = {}) {
  const metadata = metadataBlock(source, relativePath);
  const version = exactlyOne(metadataValues(metadata, 'version'), '@version', relativePath);
  if (!semverPattern.test(version)) {
    fail(`${relativePath}: @version must be strict x.y.z SemVer, got ${version}.`);
  }

  const updateURL = exactlyOne(metadataValues(metadata, 'updateURL'), '@updateURL', relativePath);
  const downloadURL = exactlyOne(metadataValues(metadata, 'downloadURL'), '@downloadURL', relativePath);
  const canonicalURL = `${rawPrefix}${relativePath.replaceAll(path.sep, '/')}`;

  if (updateURL !== canonicalURL) {
    fail(`${relativePath}: @updateURL must be ${canonicalURL}.`);
  }
  if (downloadURL !== canonicalURL) {
    fail(`${relativePath}: @downloadURL must be ${canonicalURL}.`);
  }

  if (requireRuntimeVersion) {
    const appVersionPattern = /^\s*const\s+APP_VERSION\s*=\s*['"]([^'"]+)['"]\s*;\s*$/gm;
    const genericVersionPattern = /^\s*const\s+VERSION\s*=\s*['"]([^'"]+)['"]\s*;\s*$/gm;
    const appVersions = [...source.matchAll(appVersionPattern)].map((match) => match[1]);
    const genericVersions = [...source.matchAll(genericVersionPattern)].map((match) => match[1]);
    const runtimeVersions = appVersions.length ? appVersions : genericVersions;

    if (!runtimeVersions.includes(version)) {
      fail(`${relativePath}: runtime APP_VERSION/VERSION must contain metadata version ${version}.`);
    }
  }

  return { version, canonicalURL };
}

function compareVersions(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function git(args, { allowFailure = false } = {}) {
  const result = spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' });
  if (!allowFailure && result.status !== 0) {
    fail(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result;
}

function baseArgument() {
  const index = process.argv.indexOf('--base');
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    fail('--base requires a git ref or commit SHA.');
  }
  return value;
}

function validateChangedVersions(base) {
  if (!base || /^0+$/.test(base)) return [];

  const exists = git(['cat-file', '-e', `${base}^{commit}`], { allowFailure: true });
  if (exists.status !== 0) {
    fail(`Base commit is not available locally: ${base}`);
  }

  const changed = git(['diff', '--name-only', '--diff-filter=ACMRT', base, 'HEAD', '--', 'scripts']).stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter((value) => value.endsWith('.user.js'));

  for (const relativePath of changed) {
    const currentPath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(currentPath)) continue;

    const current = parseUserscript(fs.readFileSync(currentPath, 'utf8'), relativePath);
    const previousResult = git(['show', `${base}:${relativePath}`], { allowFailure: true });
    if (previousResult.status !== 0) continue;

    const previous = parseUserscript(previousResult.stdout, relativePath, { requireRuntimeVersion: false });
    if (compareVersions(current.version, previous.version) <= 0) {
      fail(`${relativePath}: userscript content changed but @version did not increase (${previous.version} -> ${current.version}).`);
    }
  }

  return changed;
}

assert.ok(fs.existsSync(scriptsRoot), `Missing scripts directory: ${scriptsRoot}`);
const userscripts = walk(scriptsRoot).sort();
assert.ok(userscripts.length > 0, 'No .user.js files found under scripts/.');

for (const file of userscripts) {
  const relativePath = path.relative(repoRoot, file).replaceAll(path.sep, '/');
  parseUserscript(fs.readFileSync(file, 'utf8'), relativePath);
}

const changed = validateChangedVersions(baseArgument());
console.log(
  `PASS userscript auto-update contract: ${userscripts.length} script(s) validated${
    changed.length ? `, ${changed.length} changed script(s) version-bumped` : ''
  }.`,
);
