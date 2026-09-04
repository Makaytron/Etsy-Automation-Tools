import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifySignedReleaseTag } from './Release-Tag-Verification.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function fail(message) {
  throw new Error(message);
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return '';
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) fail(`${name} requires a value.`);
  return value;
}

function git(args) {
  const result = spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    fail(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.trim();
}

const packageSlug = argValue('--package-slug');
if (!packageSlug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(packageSlug)) {
  fail(`Invalid --package-slug: ${packageSlug || 'missing'}`);
}

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
if (!Array.isArray(registry)) fail('Production package registry must be a JSON array.');

const matches = registry.filter((entry) => entry?.packageSlug === packageSlug);
if (matches.length !== 1) {
  fail(`Unknown or non-unique standalone production package: ${packageSlug}`);
}
const packageEntry = matches[0];
const registeredPath = packageEntry.scriptPath;
if (typeof registeredPath !== 'string' || !registeredPath.endsWith('.user.js')) {
  fail(`${packageSlug}: registry scriptPath is invalid.`);
}
const scriptPath = path.join(repoRoot, ...registeredPath.split('/'));
if (!fs.existsSync(scriptPath) || !fs.statSync(scriptPath).isFile()) {
  fail(`${packageSlug}: registered userscript is missing: ${registeredPath}`);
}

const source = fs.readFileSync(scriptPath, 'utf8');
const names = [...source.matchAll(/^\/\/\s+@name\s+(.+?)\s*$/gm)].map((match) => match[1]);
if (names.length !== 1 || names[0] !== packageEntry.publicName) {
  fail(`${packageSlug}: @name does not match the canonical production registry.`);
}
const versions = [...source.matchAll(/^\/\/\s+@version\s+(.+?)\s*$/gm)].map((match) => match[1]);
if (versions.length !== 1 || !semverPattern.test(versions[0])) {
  fail(`${packageSlug}: expected exactly one strict SemVer @version.`);
}
const scriptVersion = versions[0];

const refType = process.env.GITHUB_REF_TYPE || '';
const refName = process.env.GITHUB_REF_NAME || '';
if (refType !== 'tag') {
  console.log(`PASS ${packageSlug}: registered non-tag run; current version ${scriptVersion}.`);
  process.exit(0);
}

const expectedTag = `${packageSlug}-v${scriptVersion}`;
if (refName !== expectedTag) {
  fail(`${packageSlug}: release tag must be ${expectedTag}, got ${refName || 'missing'}.`);
}

const headCommit = git(['rev-parse', 'HEAD']);
await verifySignedReleaseTag({ repoRoot, tagName: refName, headCommit });

console.log(`PASS signed standalone tag contract: ${refName} -> ${headCommit}.`);
