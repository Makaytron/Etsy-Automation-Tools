import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import {
  DESIGN_SOURCES_BY_ID,
  exactSourceLocator,
  extractRegisteredSourceIds,
  sourceById,
} from './Design-Source-Registry.mjs';

export const UI_FILE_PATTERNS = Object.freeze([
  /^scripts\/.*\.user\.js$/,
  /^shared\/mkui\/.*\.(?:css|js|json)$/i,
  /^tools\/(?:Apply|Finalize)-Mkui-.*\.mjs$/i,
  /^tools\/Generate-Mkui-.*-Preview\.mjs$/i,
  /^docs\/design\/previews\/.*\.html$/i,
]);

const REQUIRED_CHECKBOXES = Object.freeze([
  'Every source id above exists in [`DESIGN-SOURCE-REGISTRY.json`]',
  'I used [Tamplate-Back-White-01]',
  'I used the [applied dashboard]',
  'Every new or modified toast/snackbar/notification follows [Toast-01]',
  'I did not invent an unapproved card, menu, sidebar, modal, table, filter, empty state, toolbar, loader, alert or toast',
  'Existing behavior hooks and safety contracts remain intact',
]);

const REQUIRED_TOAST_IDS = Object.freeze([
  'toast.container',
  'toast.item',
  'toast.styles',
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
  return !value || /^(?:yes\s*\/\s*no|evet\s*\/\s*hayır|tbd|todo|fill|none|-)$/i.test(value);
}

function checked(body, text) {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^- \\[x\\] ${escaped}`, 'mi').test(body);
}

function containsCaseInsensitive(haystack, needle) {
  return normalize(haystack).toLowerCase().includes(normalize(needle).toLowerCase());
}

function categoryIds(ids, category) {
  return ids.filter(id => sourceById(id)?.category === category);
}

function exactLocators(ids) {
  return ids
    .map(id => sourceById(id))
    .filter(Boolean)
    .map(exactSourceLocator);
}

function hasNamedNumberedVariant(value) {
  const text = normalize(value);
  if (!text) return false;
  return /\b(?:application\s+shell|application\s+interface|app\s+dashboard|data(?:\s+grid|table)|datatable|kpi(?:\s+card)?|dashboard\s+widget|chart|filter(?:\s+bar|\s+sidebar)?|order(?:\s+history|\s+management\s+table)?|listing(?:\s+card)?|block|section|layout|card|table|widget)\s*#?\s*\d+\b/i.test(text);
}

function isExplainedNoToast(value) {
  const text = normalize(value);
  return /^n\/a\b/i.test(text) && text.replace(/^n\/a\b\s*[—–:-]?\s*/i, '').length >= 12;
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
    return {
      ok: true,
      skipped: true,
      relevantFiles: [],
      sourceIds: [],
      errors: [],
    };
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

  const sourceIdField = field(
    normalizedBody,
    'Approved source IDs / Onaylı kaynak kimlikleri',
  );
  const sourceIds = extractRegisteredSourceIds(sourceIdField);
  if (placeholder(sourceIdField) || sourceIds.length === 0) {
    errors.push('List the approved source ids from docs/design/DESIGN-SOURCE-REGISTRY.json.');
  }

  const unknownTokens = normalize(sourceIdField)
    .split(/[\s,;]+/)
    .map(token => token.replace(/^[`'"([{]+|[`'"\])}.:]+$/g, ''))
    .filter(token => /^(?:template|toast|shadcn)\./.test(token))
    .filter(token => !DESIGN_SOURCES_BY_ID.has(token));
  for (const id of [...new Set(unknownTokens)]) {
    errors.push(`Unknown or unregistered design source id: ${id}.`);
  }

  const templateIds = categoryIds(sourceIds, 'template');
  const dashboardIds = categoryIds(sourceIds, 'shadcn-dashboard');
  const blockIds = categoryIds(sourceIds, 'shadcn-block');
  const toastIds = categoryIds(sourceIds, 'toast');

  if (templateIds.length === 0) {
    errors.push('Every UI change must cite at least one registered template.* source id.');
  }
  if (!dashboardIds.includes('shadcn.dashboard.applied')) {
    errors.push('Every UI change must cite shadcn.dashboard.applied for page composition.');
  }
  if (blockIds.length === 0) {
    errors.push('Every UI change must cite at least one exact shadcn.blocks.* source id.');
  }

  const exactPaths = field(
    normalizedBody,
    'Exact registered repository paths / Kayıtlı kesin repo yolları',
  );
  if (placeholder(exactPaths)) {
    errors.push('Provide the exact registered repository locators used by this UI change.');
  }
  for (const locator of exactLocators([...templateIds, ...toastIds])) {
    if (!containsCaseInsensitive(exactPaths, locator)) {
      errors.push(`Exact registered repository locator is missing: ${locator}.`);
    }
  }

  const dashboardRegion = field(
    normalizedBody,
    'Applied dashboard region / Uygulanan dashboard bölgesi',
  );
  const dashboardSource = sourceById('shadcn.dashboard.applied');
  if (
    placeholder(dashboardRegion) ||
    dashboardRegion.length < 20 ||
    !containsCaseInsensitive(dashboardRegion, dashboardSource?.url || '')
  ) {
    errors.push(
      'Record the exact applied-dashboard URL and the concrete region/composition used.',
    );
  }

  const blockSource = field(
    normalizedBody,
    'ShadcnStore block URL, family, visible name and number / ShadcnStore blok URL',
  );
  if (placeholder(blockSource)) {
    errors.push('Provide the exact ShadcnStore block URL, family, visible name and number.');
  }
  for (const id of blockIds) {
    const source = sourceById(id);
    if (!containsCaseInsensitive(blockSource, source.url)) {
      errors.push(`${id} requires its exact registered URL in the block mapping.`);
    }
    if (!containsCaseInsensitive(blockSource, source.family)) {
      errors.push(`${id} requires the registered family name: ${source.family}.`);
    }
  }
  if (!hasNamedNumberedVariant(blockSource)) {
    errors.push(
      'The ShadcnStore mapping must name the visible block variant and number, for example “Application Shell 2”.',
    );
  }

  const toastSource = field(
    normalizedBody,
    'Toast-01 source IDs and exact paths, or `N/A` with explanation / Toast-01 kaynak kimlikleri ve kesin yolları veya açıklamalı `N/A`',
  );
  const noToast = isExplainedNoToast(toastSource);
  if (placeholder(toastSource)) {
    errors.push('Describe the Toast-01 mapping or write N/A with a concrete no-toast explanation.');
  } else if (noToast) {
    if (toastIds.length > 0) {
      errors.push('Do not cite toast.* ids while declaring the change N/A for transient feedback.');
    }
  } else {
    for (const id of REQUIRED_TOAST_IDS) {
      if (!toastIds.includes(id)) {
        errors.push(`Toast changes must cite the required source id: ${id}.`);
      }
    }
    for (const id of toastIds) {
      const source = sourceById(id);
      if (!containsCaseInsensitive(toastSource, source.path)) {
        errors.push(`${id} requires its exact Toast-01 path in the toast mapping.`);
      }
    }
  }

  const adaptation = field(
    normalizedBody,
    'Makaytron adaptation summary / Makaytron uyarlama özeti',
  );
  if (placeholder(adaptation) || adaptation.length < 20) {
    errors.push('Provide a meaningful Makaytron adaptation summary of at least 20 characters.');
  }

  const preservation = field(
    normalizedBody,
    'Behavior-preservation summary / Davranış koruma özeti',
  );
  if (placeholder(preservation) || preservation.length < 20) {
    errors.push('Provide a meaningful behavior-preservation summary of at least 20 characters.');
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
    sourceIds,
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
    return {
      ok: true,
      skipped: true,
      relevantFiles: [],
      sourceIds: [],
      errors: [],
    };
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
  process.stdout.write(
    `UI-relevant files:\n${result.relevantFiles.map(path => `- ${path}`).join('\n')}\n`,
  );
  process.stdout.write(
    `Registered sources:\n${result.sourceIds.map(id => `- ${id}`).join('\n')}\n`,
  );
  if (!result.ok) {
    throw new Error(`Design-source PR validation failed:\n- ${result.errors.join('\n- ')}`);
  }
  process.stdout.write('Registered design-source mapping is complete.\n');
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
