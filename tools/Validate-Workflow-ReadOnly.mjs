import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowDir = path.join(repoRoot, '.github', 'workflows');

function fail(message) {
  throw new Error(message);
}

if (!fs.existsSync(workflowDir) || !fs.statSync(workflowDir).isDirectory()) {
  fail('GitHub Actions workflow directory is missing.');
}

const files = fs.readdirSync(workflowDir)
  .filter((name) => /\.ya?ml$/i.test(name))
  .sort();

if (files.length === 0) {
  fail('No GitHub Actions workflows found.');
}

const errors = [];

for (const name of files) {
  const fullPath = path.join(workflowDir, name);
  const source = fs.readFileSync(fullPath, 'utf8');
  const lines = source.replace(/\r\n?/g, '\n').split('\n');

  const permissionsIndex = lines.findIndex((line) => /^permissions:\s*(?:#.*)?$/.test(line));
  if (permissionsIndex < 0) {
    errors.push(`${name}: missing top-level permissions block.`);
  } else {
    const block = [];
    for (let index = permissionsIndex + 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (/^[^\s#]/.test(line) && line.trim()) break;
      block.push(line);
    }

    if (!block.some((line) => /^\s+contents:\s*read\s*(?:#.*)?$/.test(line))) {
      errors.push(`${name}: top-level permissions must include contents: read.`);
    }

    for (const line of block) {
      if (/^\s+[A-Za-z0-9_-]+:\s*write\s*(?:#.*)?$/.test(line)) {
        errors.push(`${name}: write permission is forbidden: ${line.trim()}`);
      }
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*uses:\s*['"]?([^'"\s#]+)['"]?\s*(?:#.*)?$/);
    if (!match) continue;

    const actionRef = match[1];
    if (!actionRef.startsWith('./') && !actionRef.startsWith('docker://') && !/@[0-9a-f]{40}$/i.test(actionRef)) {
      errors.push(`${name}:${index + 1}: action must be pinned to a full 40-character commit SHA: ${actionRef}`);
    }

    if (/^actions\/checkout@/i.test(actionRef)) {
      let stepEnd = lines.length;
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        if (/^\s*-\s+(?:name|uses):/.test(lines[cursor])) {
          stepEnd = cursor;
          break;
        }
      }
      const step = lines.slice(index, stepEnd).join('\n');
      if (!/^\s+persist-credentials:\s*false\s*(?:#.*)?$/m.test(step)) {
        errors.push(`${name}:${index + 1}: actions/checkout must set persist-credentials: false.`);
      }
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const forbidden = [
      [/\bgit\s+push\b/i, 'git push'],
      [/\bgit\s+commit\b/i, 'git commit'],
      [/\bgit\s+tag\s+(?:-[asm](?:\s|$)|--annotate\b|--sign\b|--message\b)/i, 'git tag creation'],
      [/\bgit\s+(?:checkout\s+-b|switch\s+-c)\b/i, 'branch creation'],
      [/\bgh\s+release\s+(?:create|edit|delete|upload)\b/i, 'gh release mutation'],
      [/\bgh\s+pr\s+create\b/i, 'gh pr create'],
    ];

    for (const [pattern, label] of forbidden) {
      if (pattern.test(trimmed)) {
        errors.push(`${name}:${index + 1}: repository mutation command forbidden (${label}).`);
      }
    }
  }
}

if (errors.length > 0) {
  fail(`Workflow read-only contract failed:\n- ${errors.join('\n- ')}`);
}

console.log(`PASS workflow read-only contract: ${files.length} workflow(s).`);
