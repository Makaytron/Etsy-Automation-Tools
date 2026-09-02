import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

export const UI_FILE_PATTERNS = Object.freeze([
  /^scripts\/.*\.user\.js$/,
  /^shared\/mkui\/.*\.(?:css|js|json)$/i,
  /^tools\/(?:Apply|Finalize)-Mkui-.*\.mjs$/i,
  /^tools\/Generate-Mkui-.*-Preview\.mjs$/i,
  /^docs\/design\/previews\/.*\.html$/i,
]);

const REQUIRED_CHECKBOXES = Object.freeze([
  'I used [Tamplate-Back-White-01]',
  'I selected component anatomy from the [applied dashboard]',
  'Every new or modified toast/snackbar/notification follows [Toast-01]',
  'I did not invent an unapproved card, menu, sidebar, modal, table, filter, empty state, toolbar, loader, alert or toast',
  'Existing behavior hooks and safety contracts remain intact',
]);

function normalize(value) {
  return String(value || '').replace(/\r/g, '').trim();
}

function field(body, englishLabel) {
  const escaped = englishLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = body.match(new RegExp(`^- ${escaped}[^:]*:\\s*(.+)$`, 'mi'));
  return normalize(match?.[1]);
}

function placeholder(value) {
  return !value || /^(?:yes\s*\/\s*no|evet\s*\/\s*hayır|tbd|todo|fill|-)$/i.test(value);
}

function checked(body, text) {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^- \\[x\\] ${escaped}`, 'mi').test(body);
}

export function isUiRelevantPath(path) {
  return UI_FILE_PATTERNS.some(pattern => pattern.test(path));
}

export function uiRelevantFiles(paths) {
  return paths.filter(isUiRelevantPath);
}

export function validateDesignSourceBody(body, changedFiles) {
  const relevant = uiRelevantFiles(changedFiles);
  if (!relevant.length) {
    return { ok: true, skipped: true, relevantFiles: [], errors: [] };
  }

  const normalizedBody = normalize(body);
  const errors = [];
  if (!normalizedBody.includes('## Design-source compliance / Tasarım kaynağı uyumu')) {
    errors.push('The Design-source compliance section is missing.');
  }

  const uiChanged = field(normalizedBody, 'UI changed / UI değişti');
  if (!/^(?:yes|evet)$/i.test(uiChanged)) {
    errors.push('Set “UI changed / UI değişti” to Yes or Evet.');
  }

  const shellSource = field(
    normalizedBody,
    'Shell/template source and exact path / Shell-template kaynağı ve kesin yolu',
  );
  if (placeholder(shellSource) || /^(?:n\/a|yok)$/i.test(shellSource)) {
    errors.push('Provide the exact Tamplate-Back-White-01 path or applied-dashboard region.');
  }
  if (shellSource && !/(?:Tamplate-Back-White-01|shadcnstore\.com\/templates\/dashboard)/i.test(shellSource)) {
    errors.push('The shell source must identify Tamplate-Back-White-01 or the approved applied dashboard.');
  }

  const blockSource = field(
    normalizedBody,
    'ShadcnStore block URL, family, name and number / ShadcnStore blok URL',
  );
  if (placeholder(blockSource) || !/shadcnstore\.com\/blocks/i.test(blockSource)) {
    errors.push('Provide an exact ShadcnStore blocks URL plus the block family and block name/number.');
  }

  const toastSource = field(
    normalizedBody,
    'Toast-01 mapping, or `N/A` when no transient feedback exists / Toast-01 eşlemesi veya geçici bildirim yoksa `N/A`',
  );
  if (placeholder(toastSource)) {
    errors.push('Describe the Toast-01 mapping or write N/A with a concrete no-toast explanation.');
  } else if (!/Toast-01/i.test(toastSource)) {
    const noToastExplanation = /^n\/a\b.{8,}$/i.test(toastSource);
    if (!noToastExplanation) {
      errors.push('Toast mapping must identify Toast-01 or use N/A with an explanation.');
    }
  }

  const adaptation = field(
    normalizedBody,
    'Makaytron adaptation summary / Makaytron uyarlama özeti',
  );
  if (placeholder(adaptation) || adaptation.length < 20) {
    errors.push('Provide a meaningful Makaytron adaptation summary of at least 20 characters.');
  }

  for (const checkbox of REQUIRED_CHECKBOXES) {
    if (!checked(normalizedBody, checkbox)) {
      errors.push(`Check the required design-source confirmation: ${checkbox}`);
    }
  }

  return {
    ok: errors.length === 0,
    skipped: false,
    relevantFiles: relevant,
    errors,
  };
}

function changedFiles(baseSha, headSha) {
  const output = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMR', baseSha, headSha],
    { encoding: 'utf8' },
  );
  return output
    .split(/\r?\n/)
    .map(value => value.trim())
    .filter(Boolean);
}

export async function validatePullRequestEvent(event, options = {}) {
  if (!event?.pull_request) {
    return { ok: true, skipped: true, relevantFiles: [], errors: [] };
  }
  const baseSha = event.pull_request.base?.sha;
  const headSha = event.pull_request.head?.sha;
  if (!baseSha || !headSha) {
    throw new Error('Pull-request event is missing base/head SHAs.');
  }
  const files = options.changedFiles || changedFiles(baseSha, headSha);
  return validateDesignSourceBody(event.pull_request.body || '', files);
}

async function main() {
  if (process.env.GITHUB_EVENT_NAME !== 'pull_request') {
    process.stdout.write('Design-source PR validation skipped outside pull_request events.\n');
    return;
  }
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error('GITHUB_EVENT_PATH is missing.');
  const event = JSON.parse(await readFile(resolve(eventPath), 'utf8'));
  const result = await validatePullRequestEvent(event);
  if (result.skipped) {
    process.stdout.write('No UI-relevant files changed; design-source PR mapping is not required.\n');
    return;
  }
  process.stdout.write(`UI-relevant files:\n${result.relevantFiles.map(path => `- ${path}`).join('\n')}\n`);
  if (!result.ok) {
    throw new Error(`Design-source PR validation failed:\n- ${result.errors.join('\n- ')}`);
  }
  process.stdout.write('Design-source PR mapping is complete.\n');
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
