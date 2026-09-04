import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertGitHubReleaseVerification } from './Release-Tag-Verification.mjs';
import './Test-Suite-Release-Note-Contract.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fixture(overrides = {}) {
  const headCommit = 'a'.repeat(40);
  return {
    tagName: 'example-v1.2.3',
    headCommit,
    refPayload: { object: { type: 'tag', sha: 'b'.repeat(40) } },
    tagPayload: {
      tag: 'example-v1.2.3',
      verification: { verified: true },
      object: { type: 'commit', sha: headCommit },
    },
    commitPayload: {
      sha: headCommit,
      commit: { verification: { verified: true } },
    },
    ...overrides,
  };
}

test('GitHub release verification accepts a signed annotated tag and signed matching commit', () => {
  assert.doesNotThrow(() => assertGitHubReleaseVerification(fixture()));
});

test('GitHub release verification rejects a lightweight tag ref', () => {
  const data = fixture();
  data.refPayload.object.type = 'commit';
  assert.throws(() => assertGitHubReleaseVerification(data), /annotated tag object/);
});

test('GitHub release verification rejects an unverified tag signature', () => {
  const data = fixture();
  data.tagPayload.verification.verified = false;
  assert.throws(() => assertGitHubReleaseVerification(data), /tag signature is not verified/);
});

test('GitHub release verification rejects a different tag name', () => {
  const data = fixture();
  data.tagPayload.tag = 'wrong-v1.2.3';
  assert.throws(() => assertGitHubReleaseVerification(data), /tag name mismatch/);
});

test('GitHub release verification rejects a tag target different from the tested HEAD', () => {
  const data = fixture();
  data.tagPayload.object.sha = 'c'.repeat(40);
  assert.throws(() => assertGitHubReleaseVerification(data), /does not match checked-out HEAD/);
});

test('GitHub release verification rejects an unverified release commit signature', () => {
  const data = fixture();
  data.commitPayload.commit.verification.verified = false;
  assert.throws(() => assertGitHubReleaseVerification(data), /commit signature is not verified/);
});

test('standalone validator succeeds in non-tag mode for a production package', () => {
  const result = spawnSync(process.execPath, ['tools/Validate-Standalone-Tag.mjs', '--package-slug', 'etsy-ads-keyword-manager'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'test' },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS etsy-ads-keyword-manager: non-tag run/);
});

test('standalone validator rejects an unknown package', () => {
  const result = spawnSync(process.execPath, ['tools/Validate-Standalone-Tag.mjs', '--package-slug', 'not-a-production-package'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'test' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Unknown standalone package/);
});

test('suite validator succeeds in non-tag mode with the current suite contract', () => {
  const result = spawnSync(process.execPath, ['tools/Validate-Suite-Tag.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'test' },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS suite release contract: non-tag run/);
});
