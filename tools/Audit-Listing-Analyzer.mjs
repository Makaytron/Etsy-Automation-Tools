import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE_PATH = resolve(ROOT, 'scripts/etsy-listing-analyzer/Makaytron-Etsy-Listing-Analyzer.user.js');
const TEST_PATH = resolve(ROOT, 'tools/Test-Listing-Analyzer.mjs');
const OUTPUT_PATH = resolve(ROOT, 'docs/design/previews/listing-analyzer-source-audit.json');
const WRITE = process.argv.includes('--write');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function lineNumberAt(text, index) {
  return text.slice(0, Math.max(0, index)).split('\n').length;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function countedSignature(text, regex, normalize = (value) => value) {
  const counts = new Map();
  for (const match of text.matchAll(regex)) {
    const key = normalize(match[0]);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const rows = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  return {
    counts: Object.fromEntries(rows),
    sha256: sha256(JSON.stringify(rows)),
  };
}

function extractMatches(text, regex, group = 0) {
  const values = [];
  for (const match of text.matchAll(regex)) values.push(match[group]);
  return values;
}

function extractAttributeValues(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escaped}\\s*=\\s*["']([^"']+)["']`, 'g');
  return uniqueSorted(extractMatches(text, regex, 1));
}

function protectedMetadata(metadata) {
  return metadata
    .split(/\r?\n/)
    .filter((line) => line.startsWith('// @') && !line.startsWith('// @version'))
    .join('\n');
}

function compact(value, max = 900) {
  const normalized = value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}…`;
}

function snippetsFor(text, label, regex, radius = 420, limit = 12) {
  const items = [];
  for (const match of text.matchAll(regex)) {
    const index = match.index ?? 0;
    items.push({
      label,
      line: lineNumberAt(text, index),
      match: match[0],
      context: compact(text.slice(Math.max(0, index - radius), Math.min(text.length, index + match[0].length + radius))),
    });
    if (items.length >= limit) break;
  }
  return items;
}

function extractTemplateBlocks(text) {
  const blocks = [];
  const regex = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*`([\s\S]*?)`\s*;/g;
  for (const match of text.matchAll(regex)) {
    const body = match[2];
    const cssSignal = /:host\b|\.meli-[\w-]+|--(?:background|foreground|primary|border|radius)\b|@media\b/.test(body);
    const htmlSignal = /data-(?:view|action)=|class=["'][^"']*meli-/.test(body);
    if (!cssSignal && !htmlSignal) continue;
    const start = match.index ?? 0;
    const selectors = uniqueSorted(extractMatches(body, /(?:^|\n)\s*([^@\n][^{\n]{0,160})\s*\{/gm, 1)
      .map((value) => value.trim())
      .filter((value) => value && !value.includes('${')))
      .slice(0, 120);
    blocks.push({
      name: match[1],
      kind: cssSignal ? 'css-or-mixed' : 'html',
      startLine: lineNumberAt(text, start),
      endLine: lineNumberAt(text, start + match[0].length),
      characters: body.length,
      containsHostReset: /:host\s*\{[^}]*all\s*:\s*initial/s.test(body),
      containsMeliClasses: /\.meli-[\w-]+/.test(body),
      containsDataView: /data-view=/.test(body),
      containsDataAction: /data-action=/.test(body),
      selectors,
      beginning: compact(body.slice(0, 1400), 1400),
      ending: compact(body.slice(-1400), 1400),
    });
  }
  return blocks;
}

function metadataBlock(source) {
  const match = source.match(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==/m);
  return match ? match[0] : '';
}

function namedFunctions(text) {
  return uniqueSorted([
    ...extractMatches(text, /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g, 1),
    ...extractMatches(text, /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g, 1),
  ]);
}

function testNames(text) {
  return uniqueSorted([
    ...extractMatches(text, /\btest\s*\(\s*['"`]([^'"`]+)['"`]/g, 1),
    ...extractMatches(text, /\bit\s*\(\s*['"`]([^'"`]+)['"`]/g, 1),
  ]);
}

const source = await readFile(SOURCE_PATH, 'utf8');
const tests = await readFile(TEST_PATH, 'utf8');
const metadata = metadataBlock(source);
const protectedMetadataText = protectedMetadata(metadata);
const templateBlocks = extractTemplateBlocks(source);
const dataAttributeSignature = countedSignature(source, /\bdata-[a-z0-9-]+\b/gi, (value) => value.toLowerCase());
const meliClassSignature = countedSignature(source, /\bmeli-[a-z0-9-]+\b/gi, (value) => value.toLowerCase());

const audit = {
  generatedAt: new Date().toISOString(),
  source: {
    path: 'scripts/etsy-listing-analyzer/Makaytron-Etsy-Listing-Analyzer.user.js',
    bytes: Buffer.byteLength(source),
    characters: source.length,
    lines: source.split('\n').length,
    sha256: sha256(source),
    metadata,
    protectedMetadata: protectedMetadataText,
    protectedMetadataSha256: sha256(protectedMetadataText),
    version: metadata.match(/^\/\/ @version\s+(.+)$/m)?.[1]?.trim() ?? null,
    appVersion: source.match(/\bconst\s+APP_VERSION\s*=\s*['"]([^'"]+)['"]/i)?.[1] ?? null,
    mkuiVersion: source.match(/\bconst\s+MKUI_VERSION\s*=\s*['"]([^'"]+)['"]/i)?.[1] ?? null,
    shadowModes: uniqueSorted(extractMatches(source, /attachShadow\s*\(\s*\{\s*mode\s*:\s*['"]([^'"]+)['"]/g, 1)),
    hostIds: uniqueSorted(extractMatches(source, /(?:id\s*=\s*['"]|getElementById\s*\(\s*['"])(makaytron-[^'"]+)/g, 1)),
    meliClasses: Object.keys(meliClassSignature.counts),
    meliClassCounts: meliClassSignature.counts,
    meliClassSignatureSha256: meliClassSignature.sha256,
    dataAttributes: Object.keys(dataAttributeSignature.counts),
    dataAttributeCounts: dataAttributeSignature.counts,
    dataAttributeSignatureSha256: dataAttributeSignature.sha256,
    dataViews: extractAttributeValues(source, 'data-view'),
    dataActions: extractAttributeValues(source, 'data-action'),
    ariaLabels: extractAttributeValues(source, 'aria-label'),
    cssCustomProperties: uniqueSorted(extractMatches(source, /--[a-z0-9-]+\s*:/gi).map((value) => value.slice(0, -1))),
    namedFunctions: namedFunctions(source),
    templateBlocks,
    structuralSnippets: [
      ...snippetsFor(source, 'attachShadow', /attachShadow\s*\([^)]*\)/g),
      ...snippetsFor(source, 'shadow-root-innerHTML', /(?:shadowRoot|shadow|root)\.innerHTML\s*=/g),
      ...snippetsFor(source, 'style-textContent', /(?:style|styleEl|styleElement)\.textContent\s*=/g),
      ...snippetsFor(source, 'create-style', /createElement\s*\(\s*['"]style['"]\s*\)/g),
      ...snippetsFor(source, 'host-reset', /:host\s*\{[^}]{0,500}all\s*:\s*initial[^}]*\}/gs),
      ...snippetsFor(source, 'data-view-routing', /dataset\.view|data-view/g),
      ...snippetsFor(source, 'data-action-routing', /dataset\.action|data-action/g),
    ],
  },
  tests: {
    path: 'tools/Test-Listing-Analyzer.mjs',
    bytes: Buffer.byteLength(tests),
    lines: tests.split('\n').length,
    sha256: sha256(tests),
    testNames: testNames(tests),
    protectedStringLiterals: uniqueSorted(extractMatches(tests, /['"`](data-[a-z0-9-]+|meli-[a-z0-9-]+|makaytron-[a-z0-9-]+)['"`]/gi, 1)),
    structuralSnippets: [
      ...snippetsFor(tests, 'metadata-invariant', /@(?:match|grant|connect|updateURL|downloadURL|version)/g, 240, 20),
      ...snippetsFor(tests, 'shadow-invariant', /attachShadow|shadowRoot|Shadow DOM/gi, 300, 20),
      ...snippetsFor(tests, 'routing-invariant', /data-(?:view|action)|dataset\.(?:view|action)/g, 260, 30),
      ...snippetsFor(tests, 'publish-deactivate', /publish|deactivate/gi, 220, 30),
    ],
  },
  assertions: {
    metadataFound: Boolean(metadata),
    baselineVersionIs122: metadata.includes('// @version      1.2.2') && /const\s+APP_VERSION\s*=\s*['"]1\.2\.2['"]/.test(source),
    openShadowDomFound: /attachShadow\s*\(\s*\{\s*mode\s*:\s*['"]open['"]/.test(source),
    hostResetFound: /:host\s*\{[^}]*all\s*:\s*initial/s.test(source),
    meliPrefixFound: /\bmeli-[a-z0-9-]+\b/i.test(source),
    dataViewFound: /data-view=/.test(source),
    dataActionFound: /data-action=/.test(source),
    cssOrMixedTemplateCount: templateBlocks.filter((block) => block.kind === 'css-or-mixed').length,
  },
};

const failed = Object.entries(audit.assertions)
  .filter(([, value]) => value === false || value === 0)
  .map(([key]) => key);
if (failed.length) throw new Error(`Listing Analyzer source audit failed: ${failed.join(', ')}`);

const json = `${JSON.stringify(audit, null, 2)}\n`;
if (WRITE) {
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, json, 'utf8');
  console.log(`Wrote ${OUTPUT_PATH}`);
} else {
  process.stdout.write(json);
}
