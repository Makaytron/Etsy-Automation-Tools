import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifySignedReleaseTag } from './Release-Tag-Verification.mjs';
import { validateSuiteReleaseNote } from './Suite-Release-Note-Contract.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function fail(message) {
  throw new Error(message);
}

function git(args) {
  const result = spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    fail(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.trim();
}

const versionPath = path.join(repoRoot, 'VERSION');
if (!fs.existsSync(versionPath)) fail('VERSION is missing.');
const version = fs.readFileSync(versionPath, 'utf8').trim();
if (!semverPattern.test(version)) fail(`VERSION must be strict SemVer, got ${version || 'empty'}.`);

const releaseNotes = path.join(repoRoot, 'docs', 'releases', `v${version}.md`);
if (!fs.existsSync(releaseNotes)) fail(`Suite release notes are missing: docs/releases/v${version}.md`);

const refType = process.env.GITHUB_REF_TYPE || '';
const refName = process.env.GITHUB_REF_NAME || '';
if (refType !== 'tag') {
  console.log(`PASS suite release contract: non-tag run; current suite version ${version}.`);
  process.exit(0);
}

const expectedTag = `v${version}`;
if (refName !== expectedTag) {
  fail(`Suite release tag must be ${expectedTag}, got ${refName || 'missing'}.`);
}

const headCommit = git(['rev-parse', 'HEAD']);
await verifySignedReleaseTag({ repoRoot, tagName: refName, headCommit });

const registryPath = path.join(repoRoot, 'config', 'production-packages.json');
if (!fs.existsSync(registryPath) || !fs.statSync(registryPath).isFile()) {
  fail('Production package registry is missing.');
}
let registry;
try {
  registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
} catch (error) {
  fail(`Production package registry is invalid JSON: ${error.message}`);
}
if (!Array.isArray(registry) || registry.length !== 5) {
  fail(`Suite release requires exactly five registered production packages; found ${Array.isArray(registry) ? registry.length : 'invalid registry'}.`);
}

const packageContracts = registry.map((entry) => {
  if (!entry || typeof entry !== 'object' || typeof entry.scriptPath !== 'string' || typeof entry.publicName !== 'string') {
    fail('Production package registry contains an invalid suite entry.');
  }
  const scriptPath = path.join(repoRoot, ...entry.scriptPath.split('/'));
  if (!fs.existsSync(scriptPath) || !fs.statSync(scriptPath).isFile()) {
    fail(`Registered suite userscript is missing: ${entry.scriptPath}`);
  }
  const source = fs.readFileSync(scriptPath, 'utf8');
  const versions = [...source.matchAll(/^\/\/\s+@version\s+(.+?)\s*$/gm)].map((match) => match[1]);
  if (versions.length !== 1 || !semverPattern.test(versions[0])) {
    fail(`${entry.packageSlug}: expected exactly one strict SemVer @version.`);
  }
  const names = [...source.matchAll(/^\/\/\s+@name\s+(.+?)\s*$/gm)].map((match) => match[1]);
  if (names.length !== 1 || names[0] !== entry.publicName) {
    fail(`${entry.packageSlug}: @name does not match the production registry.`);
  }
  return {
    publicName: entry.publicName,
    version: versions[0],
    scriptName: path.basename(entry.scriptPath),
  };
});

const releaseNoteSource = fs.readFileSync(releaseNotes, 'utf8');
validateSuiteReleaseNote({ source: releaseNoteSource, version, packages: packageContracts });

console.log(`PASS signed suite tag contract: ${refName} -> ${headCommit}; release note matches ${packageContracts.length} packages.`);
