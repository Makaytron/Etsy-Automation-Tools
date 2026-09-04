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

const packageDir = path.join(repoRoot, 'scripts', packageSlug);
if (!fs.existsSync(packageDir) || !fs.statSync(packageDir).isDirectory()) {
  fail(`Unknown standalone package: ${packageSlug}`);
}

const userscripts = fs.readdirSync(packageDir).filter((name) => name.endsWith('.user.js'));
if (userscripts.length !== 1) {
  fail(`${packageSlug}: expected exactly one .user.js file, found ${userscripts.length}.`);
}

const scriptPath = path.join(packageDir, userscripts[0]);
const source = fs.readFileSync(scriptPath, 'utf8');
const versions = [...source.matchAll(/^\/\/\s+@version\s+(.+?)\s*$/gm)].map((match) => match[1]);
if (versions.length !== 1 || !semverPattern.test(versions[0])) {
  fail(`${packageSlug}: expected exactly one strict SemVer @version.`);
}
const scriptVersion = versions[0];

const refType = process.env.GITHUB_REF_TYPE || '';
const refName = process.env.GITHUB_REF_NAME || '';
if (refType !== 'tag') {
  console.log(`PASS ${packageSlug}: non-tag run; current version ${scriptVersion}.`);
  process.exit(0);
}

const expectedTag = `${packageSlug}-v${scriptVersion}`;
if (refName !== expectedTag) {
  fail(`${packageSlug}: release tag must be ${expectedTag}, got ${refName || 'missing'}.`);
}

const headCommit = git(['rev-parse', 'HEAD']);
await verifySignedReleaseTag({ repoRoot, tagName: refName, headCommit });

console.log(`PASS signed standalone tag contract: ${refName} -> ${headCommit}.`);
