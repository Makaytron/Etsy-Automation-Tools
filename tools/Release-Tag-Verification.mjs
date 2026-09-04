import { spawnSync } from 'node:child_process';

function fail(message) {
  throw new Error(message);
}

function git(repoRoot, args) {
  const result = spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    fail(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.trim();
}

async function fetchGitHubJson(url, token = '', fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') fail('Global fetch is unavailable for GitHub tag verification.');
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const headers = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Makaytron-Etsy-Automation-Tools-release-verifier',
        'X-GitHub-Api-Version': '2022-11-28',
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetchImpl(url, { headers });
      if (response.ok) return await response.json();
      lastError = new Error(`GitHub API ${response.status} ${response.statusText}: ${url}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
  throw lastError || new Error(`GitHub API request failed: ${url}`);
}

export function assertGitHubReleaseVerification({ tagName, headCommit, refPayload, tagPayload, commitPayload }) {
  if (refPayload?.object?.type !== 'tag') {
    fail(`${tagName}: GitHub ref must point to an annotated tag object.`);
  }
  if (tagPayload?.tag !== tagName) {
    fail(`${tagName}: GitHub annotated tag name mismatch.`);
  }
  if (tagPayload?.verification?.verified !== true) {
    fail(`${tagName}: GitHub tag signature is not verified.`);
  }
  if (tagPayload?.object?.type !== 'commit') {
    fail(`${tagName}: GitHub annotated tag must point to a commit.`);
  }
  if (tagPayload.object.sha !== headCommit) {
    fail(`${tagName}: GitHub tag target ${tagPayload.object.sha || 'missing'} does not match checked-out HEAD ${headCommit}.`);
  }
  if (commitPayload?.sha !== headCommit) {
    fail(`${tagName}: GitHub release commit payload does not match checked-out HEAD ${headCommit}.`);
  }
  if (commitPayload?.commit?.verification?.verified !== true) {
    fail(`${tagName}: GitHub release commit signature is not verified.`);
  }
}

export async function verifySignedReleaseTag({ repoRoot, tagName, headCommit, repository = process.env.GITHUB_REPOSITORY || '', token = process.env.GITHUB_TOKEN || '', fetchImpl = globalThis.fetch }) {
  const localRef = `refs/tags/${tagName}`;
  const localType = git(repoRoot, ['cat-file', '-t', localRef]);
  if (localType !== 'tag') fail(`${tagName}: release tag must be annotated; found ${localType}.`);

  const localTarget = git(repoRoot, ['rev-list', '-n', '1', localRef]);
  if (localTarget !== headCommit) {
    fail(`${tagName}: local tag target ${localTarget} does not match checked-out HEAD ${headCommit}.`);
  }

  if (repository) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
      fail(`Invalid GITHUB_REPOSITORY: ${repository}`);
    }
    const apiBase = `https://api.github.com/repos/${repository}`;
    const refPayload = await fetchGitHubJson(`${apiBase}/git/ref/tags/${encodeURIComponent(tagName)}`, token, fetchImpl);
    if (refPayload?.object?.type !== 'tag' || !refPayload?.object?.sha) {
      fail(`${tagName}: GitHub ref is missing its annotated tag object.`);
    }
    const tagPayload = await fetchGitHubJson(`${apiBase}/git/tags/${refPayload.object.sha}`, token, fetchImpl);
    const commitPayload = await fetchGitHubJson(`${apiBase}/commits/${headCommit}`, token, fetchImpl);
    assertGitHubReleaseVerification({ tagName, headCommit, refPayload, tagPayload, commitPayload });
    return;
  }

  const tagVerification = spawnSync('git', ['-C', repoRoot, 'verify-tag', '--raw', tagName], { encoding: 'utf8' });
  if (tagVerification.status !== 0) {
    fail(`${tagName}: local tag signature verification failed: ${(tagVerification.stderr || tagVerification.stdout).trim()}`);
  }
  const commitVerification = spawnSync('git', ['-C', repoRoot, 'verify-commit', '--raw', headCommit], { encoding: 'utf8' });
  if (commitVerification.status !== 0) {
    fail(`${tagName}: local release commit signature verification failed: ${(commitVerification.stderr || commitVerification.stdout).trim()}`);
  }
}
