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

console.log(`PASS signed suite tag contract: ${refName} -> ${headCommit}.`);
