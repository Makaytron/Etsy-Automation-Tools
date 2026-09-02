import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import {
  MKUI_EXPECTED_VERSION,
  MKUI_PRODUCTION_SCRIPTS,
  MKUI_ROOT,
} from './Mkui-Production-Registry.mjs';

export const MANIFEST_PATH = resolve(MKUI_ROOT, 'shared/mkui/bundle-manifest.json');
export const CANONICAL_BUNDLE_FILES = Object.freeze([
  'shared/mkui/constants.js',
  'shared/mkui/tokens.css',
  'shared/mkui/primitives.css',
  'shared/mkui/shells.css',
]);

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const BUNDLE_CONSTANT_PATTERN =
  /\bconst\s+MKUI_BUNDLE_HASH\s*=\s*['"]sha256:[0-9a-f]{64}['"]\s*;/;
const VERSION_CONSTANT_PATTERN =
  /\bconst\s+MKUI_VERSION\s*=\s*(['"])([^'"]+)\1\s*;/;
const METADATA_VERSION_PATTERN = /^\/\/ @version\s+(.+)$/m;
const CSS_ASSIGNMENT_PATTERN =
  /\b(?:const|let|var)\s+([A-Z][A-Z0-9_]*CSS[A-Z0-9_]*)\s*=\s*`/g;

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizeText(value) {
  return String(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n+$/g, '\n');
}

function readTemplateLiteral(source, startIndex) {
  if (source[startIndex] !== '`') return null;
  let escaped = false;
  for (let index = startIndex + 1; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '`') {
      return {
        start: startIndex,
        end: index + 1,
        body: source.slice(startIndex + 1, index),
      };
    }
  }
  return null;
}

function compactFragment(value) {
  return normalizeText(value)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function presentationLineMatches(line, prefixes) {
  if (line.includes('MKUI_BUNDLE_HASH')) return false;
  if (line.includes('MKUI_VERSION')) return true;
  if (line.includes('<style') || line.includes('</style>')) return true;
  if (line.includes('class=') || line.includes('className') || line.includes('.classList')) {
    return prefixes.some(prefix => line.includes(prefix));
  }
  return prefixes.some(prefix =>
    line.includes(`.${prefix}`) ||
    line.includes(`--${prefix}`) ||
    line.includes(`[data-${prefix}`));
}

export function extractPresentationFingerprint(source, definition) {
  const fragments = [];
  const consumedRanges = [];

  for (const match of source.matchAll(CSS_ASSIGNMENT_PATTERN)) {
    const start = match.index + match[0].lastIndexOf('`');
    const template = readTemplateLiteral(source, start);
    if (!template) continue;
    consumedRanges.push([template.start, template.end]);
    fragments.push(`CSS:${match[1]}\n${compactFragment(template.body)}`);
  }

  for (const match of source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const index = match.index || 0;
    if (consumedRanges.some(([start, end]) => index >= start && index < end)) continue;
    fragments.push(`STYLE:${compactFragment(match[1])}`);
  }

  const markerLines = source
    .split('\n')
    .filter(line => presentationLineMatches(line, definition.cssPrefixes))
    .map(line => compactFragment(line))
    .filter(Boolean);
  fragments.push(`MARKERS\n${markerLines.join('\n')}`);

  const normalized = fragments.join('\n\n---\n\n');
  return {
    hash: `sha256:${sha256(normalized)}`,
    bytes: Buffer.byteLength(normalized),
    fragmentCount: fragments.length,
    markerLineCount: markerLines.length,
  };
}

export async function canonicalBundle(root = MKUI_ROOT) {
  const entries = [];
  for (const path of CANONICAL_BUNDLE_FILES) {
    const content = normalizeText(await readFile(resolve(root, path), 'utf8'));
    entries.push({ path, content });
  }
  const payload = entries
    .map(entry => `--- ${entry.path} ---\n${entry.content}`)
    .join('\n');
  return {
    files: entries.map(entry => entry.path),
    hash: `sha256:${sha256(payload)}`,
    bytes: Buffer.byteLength(payload),
    lines: payload.split('\n').length,
  };
}

export function patchBundleHash(source, bundleHash) {
  if (!HASH_PATTERN.test(bundleHash)) {
    throw new Error(`Invalid MKUI bundle hash: ${bundleHash}`);
  }

  const replacement = `const MKUI_BUNDLE_HASH = '${bundleHash}';`;
  if (BUNDLE_CONSTANT_PATTERN.test(source)) {
    return source.replace(BUNDLE_CONSTANT_PATTERN, replacement);
  }

  const matches = [...source.matchAll(new RegExp(VERSION_CONSTANT_PATTERN.source, 'g'))];
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one MKUI_VERSION constant before inserting MKUI_BUNDLE_HASH; found ${matches.length}.`,
    );
  }
  const match = matches[0];
  const insertionPoint = (match.index || 0) + match[0].length;
  return `${source.slice(0, insertionPoint)}\n    ${replacement}${source.slice(insertionPoint)}`;
}

function metadataVersion(source) {
  return source.match(METADATA_VERSION_PATTERN)?.[1]?.trim() || null;
}

function mkuiVersion(source) {
  return source.match(VERSION_CONSTANT_PATTERN)?.[2] || null;
}

function bundleConstant(source) {
  return source.match(
    /\bconst\s+MKUI_BUNDLE_HASH\s*=\s*['"](sha256:[0-9a-f]{64})['"]\s*;/,
  )?.[1] || null;
}

function normalizeManifest(manifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    generatedBy: manifest.generatedBy,
    mkuiVersion: manifest.mkuiVersion,
    canonicalBundle: manifest.canonicalBundle,
    scripts: manifest.scripts,
    exceptions: Array.isArray(manifest.exceptions) ? manifest.exceptions : [],
  };
}

export async function buildManifest(options = {}) {
  const root = options.root ? resolve(options.root) : MKUI_ROOT;
  const apply = options.apply === true;
  const bundle = await canonicalBundle(root);
  const scripts = [];

  for (const definition of MKUI_PRODUCTION_SCRIPTS) {
    const path = resolve(root, definition.path);
    const original = await readFile(path, 'utf8');
    const source = apply ? patchBundleHash(original, bundle.hash) : original;
    if (apply && source !== original) await writeFile(path, source, 'utf8');

    const presentation = extractPresentationFingerprint(source, definition);
    scripts.push({
      id: definition.id,
      path: definition.path,
      scriptVersion: metadataVersion(source),
      mkuiVersion: mkuiVersion(source),
      bundleHash: bundleConstant(source),
      presentationHash: presentation.hash,
      presentationBytes: presentation.bytes,
      presentationFragmentCount: presentation.fragmentCount,
      presentationMarkerLineCount: presentation.markerLineCount,
    });
  }

  let existingExceptions = [];
  try {
    const existing = JSON.parse(await readFile(
      options.manifestPath ? resolve(options.manifestPath) : MANIFEST_PATH,
      'utf8',
    ));
    if (Array.isArray(existing.exceptions)) existingExceptions = existing.exceptions;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  return normalizeManifest({
    schemaVersion: 1,
    generatedBy: 'tools/Build-Mkui-Bundle-Manifest.mjs',
    mkuiVersion: MKUI_EXPECTED_VERSION,
    canonicalBundle: bundle,
    scripts,
    exceptions: existingExceptions,
  });
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(normalizeManifest(manifest), null, 2)}\n`;
}

export function validateException(exception, today = new Date()) {
  if (!exception || typeof exception !== 'object') return false;
  if (!MKUI_PRODUCTION_SCRIPTS.some(script => script.id === exception.scriptId)) return false;
  if (!HASH_PATTERN.test(exception.expectedPresentationHash || '')) return false;
  if (!HASH_PATTERN.test(exception.actualPresentationHash || '')) return false;
  if (exception.expectedPresentationHash === exception.actualPresentationHash) return false;
  if (typeof exception.reason !== 'string' || exception.reason.trim().length < 12) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exception.expires || '')) return false;
  const expiry = new Date(`${exception.expires}T23:59:59.999Z`);
  return Number.isFinite(expiry.getTime()) && expiry >= today;
}

function activeException(manifest, scriptId, expectedHash, actualHash, today = new Date()) {
  return (manifest.exceptions || []).find(exception =>
    validateException(exception, today) &&
    exception.scriptId === scriptId &&
    exception.expectedPresentationHash === expectedHash &&
    exception.actualPresentationHash === actualHash);
}

function duplicateValues(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort((left, right) => String(left).localeCompare(String(right)));
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function verifyManifest(committed, current, options = {}) {
  const errors = [];
  const warnings = [];
  const today = options.today || new Date();

  if (committed.schemaVersion !== 1) errors.push('manifest schemaVersion must be 1');
  if (committed.generatedBy !== 'tools/Build-Mkui-Bundle-Manifest.mjs') {
    errors.push('manifest generatedBy marker is invalid');
  }
  if (committed.mkuiVersion !== MKUI_EXPECTED_VERSION) {
    errors.push(`manifest MKUI version must be ${MKUI_EXPECTED_VERSION}`);
  }
  if (committed.canonicalBundle?.hash !== current.canonicalBundle.hash) {
    errors.push(
      `canonical MKUI bundle changed: ${committed.canonicalBundle?.hash || 'missing'} -> ` +
      `${current.canonicalBundle.hash}`,
    );
  }
  if (!equalJson(committed.canonicalBundle?.files, current.canonicalBundle.files)) {
    errors.push('canonical MKUI bundle file order changed');
  }
  if (committed.canonicalBundle?.bytes !== current.canonicalBundle.bytes) {
    errors.push('canonical MKUI bundle byte count is stale');
  }
  if (committed.canonicalBundle?.lines !== current.canonicalBundle.lines) {
    errors.push('canonical MKUI bundle line count is stale');
  }

  const committedRows = Array.isArray(committed.scripts) ? committed.scripts : [];
  const currentRows = Array.isArray(current.scripts) ? current.scripts : [];
  const committedIds = committedRows.map(script => script?.id);
  const currentIds = currentRows.map(script => script.id);
  const duplicateIds = duplicateValues(committedIds);
  if (duplicateIds.length) {
    errors.push(`manifest has duplicate script ids: ${duplicateIds.join(', ')}`);
  }
  if (committedRows.length !== currentRows.length) {
    errors.push(
      `manifest script count is ${committedRows.length}; expected ${currentRows.length}`,
    );
  }
  const unknownIds = committedIds.filter(id => !currentIds.includes(id));
  if (unknownIds.length) {
    errors.push(`manifest has unknown script ids: ${[...new Set(unknownIds)].join(', ')}`);
  }

  const committedScripts = new Map(committedRows.map(script => [script.id, script]));
  for (const script of currentRows) {
    const expected = committedScripts.get(script.id);
    if (!expected) {
      errors.push(`manifest entry is missing for ${script.id}`);
      continue;
    }
    if (script.mkuiVersion !== MKUI_EXPECTED_VERSION) {
      errors.push(`${script.id} MKUI_VERSION is ${script.mkuiVersion || 'missing'}`);
    }
    if (script.bundleHash !== current.canonicalBundle.hash) {
      errors.push(
        `${script.id} MKUI_BUNDLE_HASH is ${script.bundleHash || 'missing'}; ` +
        `expected ${current.canonicalBundle.hash}`,
      );
    }
    if (expected.path !== script.path) errors.push(`${script.id} path changed`);
    if (expected.scriptVersion !== script.scriptVersion) {
      errors.push(
        `${script.id} userscript version drifted: ${expected.scriptVersion || 'missing'} -> ` +
        `${script.scriptVersion || 'missing'}`,
      );
    }
    if (expected.mkuiVersion !== script.mkuiVersion) {
      errors.push(
        `${script.id} recorded MKUI version is stale: ${expected.mkuiVersion || 'missing'} -> ` +
        `${script.mkuiVersion || 'missing'}`,
      );
    }
    if (expected.bundleHash !== script.bundleHash) {
      errors.push(
        `${script.id} recorded bundle marker is stale: ${expected.bundleHash || 'missing'} -> ` +
        `${script.bundleHash || 'missing'}`,
      );
    }

    if (expected.presentationHash !== script.presentationHash) {
      const exception = activeException(
        committed,
        script.id,
        expected.presentationHash,
        script.presentationHash,
        today,
      );
      if (exception) {
        warnings.push(
          `${script.id} presentation drift is temporarily excepted until ${exception.expires}: ` +
          exception.reason.trim(),
        );
      } else {
        errors.push(
          `${script.id} presentation drifted: ${expected.presentationHash} -> ` +
          `${script.presentationHash}`,
        );
      }
    } else {
      for (const field of [
        'presentationBytes',
        'presentationFragmentCount',
        'presentationMarkerLineCount',
      ]) {
        if (expected[field] !== script[field]) {
          errors.push(`${script.id} ${field} evidence is stale`);
        }
      }
    }
  }

  const exceptionKeys = [];
  for (const exception of committed.exceptions || []) {
    if (!validateException(exception, today)) {
      errors.push(`invalid or expired drift exception for ${exception?.scriptId || 'unknown script'}`);
      continue;
    }
    const expected = committedScripts.get(exception.scriptId);
    const actual = currentRows.find(script => script.id === exception.scriptId);
    const active = expected && actual &&
      expected.presentationHash === exception.expectedPresentationHash &&
      actual.presentationHash === exception.actualPresentationHash &&
      expected.presentationHash !== actual.presentationHash;
    if (!active) {
      errors.push(`unused or mismatched drift exception for ${exception.scriptId}`);
    }
    exceptionKeys.push([
      exception.scriptId,
      exception.expectedPresentationHash,
      exception.actualPresentationHash,
    ].join('|'));
  }
  const duplicateExceptions = duplicateValues(exceptionKeys);
  if (duplicateExceptions.length) errors.push('manifest has duplicate drift exceptions');

  return { ok: errors.length === 0, errors, warnings };
}

export async function readManifest(path = MANIFEST_PATH) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function writeManifest(manifest, path = MANIFEST_PATH) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serializeManifest(manifest), 'utf8');
}

export async function checkManifest(options = {}) {
  const manifestPath = options.manifestPath ? resolve(options.manifestPath) : MANIFEST_PATH;
  const committed = await readManifest(manifestPath);
  const current = await buildManifest({
    root: options.root,
    manifestPath,
    apply: false,
  });
  const verification = verifyManifest(committed, current, options);
  if (!verification.ok) {
    throw new Error(
      `MKUI drift check failed:\n- ${verification.errors.join('\n- ')}`,
    );
  }
  for (const warning of verification.warnings) console.warn(`MKUI drift exception: ${warning}`);
  return verification;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const write = process.argv.includes('--write');
  const check = process.argv.includes('--check');

  if (apply && !write) {
    throw new Error('--apply must be paired with --write so script markers and manifest stay atomic.');
  }

  if (write) {
    const manifest = await buildManifest({ apply });
    await writeManifest(manifest);
    process.stdout.write(
      `Wrote ${MANIFEST_PATH}\nCanonical bundle: ${manifest.canonicalBundle.hash}\n`,
    );
  }

  if (check) await checkManifest();
  if (!write && !check) {
    process.stdout.write(serializeManifest(await buildManifest({ apply: false })));
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}