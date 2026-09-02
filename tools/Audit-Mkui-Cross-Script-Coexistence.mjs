import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT_PATH = resolve(ROOT, 'docs/design/previews/mkui-cross-script-coexistence-audit.json');
const WRITE = process.argv.includes('--write');

const DEFINITIONS = [
  {
    id: 'ads-keyword-manager',
    label: 'Ads Keyword Manager',
    path: 'scripts/etsy-ads-keyword-manager/Makaytron-Etsy-Ads-Keyword-Manager.user.js',
    prefixes: ['maw-'],
    expectedShadowModes: [],
  },
  {
    id: 'keyword-market-analyzer',
    label: 'Keyword & Market Analyzer',
    path: 'scripts/etsy-keyword-market-analyzer/Makaytron-Etsy-Keyword-Market-Analyzer.user.js',
    prefixes: ['ekma-', 'ekma-inline'],
    expectedShadowModes: ['open'],
  },
  {
    id: 'sale-manager',
    label: 'Sale Manager',
    path: 'scripts/etsy-sale-campaign-batch-runner/Etsy-Sale-Campaign-Batch-Runner.user.js',
    prefixes: ['eda-'],
    expectedShadowModes: [],
  },
  {
    id: 'message-assistant',
    label: 'Message Assistant',
    path: 'scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js',
    prefixes: ['mema-', 'mkui-'],
    expectedShadowModes: ['closed'],
  },
  {
    id: 'listing-analyzer',
    label: 'Listing Analyzer',
    path: 'scripts/etsy-listing-analyzer/Makaytron-Etsy-Listing-Analyzer.user.js',
    prefixes: ['meli-'],
    expectedShadowModes: ['open'],
  },
];

const CANONICAL_ROUTES = [
  { owner: 'ads-keyword-manager', url: 'https://www.etsy.com/your/shops/me/advertising/listings/1234567890' },
  { owner: 'keyword-market-analyzer', url: 'https://www.etsy.com/your/shops/example-shop/marketplace-insights?ref=dashboard' },
  { owner: 'sale-manager', url: 'https://www.etsy.com/your/shops/me/sales-discounts?ref=seller-platform' },
  { owner: 'sale-manager', url: 'https://etsy.com/your/shops/me/sales-discounts' },
  { owner: 'message-assistant', url: 'https://www.etsy.com/messages' },
  { owner: 'message-assistant', url: 'https://www.etsy.com/messages/123456789' },
  { owner: 'message-assistant', url: 'https://www.etsy.com/conversations/123456789' },
  { owner: 'message-assistant', url: 'https://www.etsy.com/your/orders/sold?ref=seller-platform' },
  { owner: 'message-assistant', url: 'https://www.etsy.com/your/shops/example-shop/dashboard' },
  { owner: 'listing-analyzer', url: 'https://www.etsy.com/your/shops/example-shop/tools/listings?ref=seller-platform' },
  { owner: 'listing-analyzer', url: 'https://www.etsy.com/your/shops/example-shop/listing-editor/edit/1234567890' },
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function unique(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

function matches(text, regex, group = 0) {
  const values = [];
  for (const match of text.matchAll(regex)) values.push(match[group]);
  return values;
}

function lineAt(text, index) {
  return text.slice(0, Math.max(0, index)).split('\n').length;
}

function compact(value, max = 700) {
  const normalized = value
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}…`;
}

function snippets(text, label, regex, radius = 360, limit = 18) {
  const result = [];
  for (const match of text.matchAll(regex)) {
    const index = match.index ?? 0;
    result.push({
      label,
      line: lineAt(text, index),
      match: compact(match[0], 180),
      context: compact(text.slice(Math.max(0, index - radius), Math.min(text.length, index + match[0].length + radius))),
    });
    if (result.length >= limit) break;
  }
  return result;
}

function metadataBlock(source) {
  return source.match(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==/m)?.[0] || '';
}

function metadataValues(metadata, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return matches(metadata, new RegExp(`^\\/\\/ @${escaped}\\s+(.+)$`, 'gm'), 1).map((value) => value.trim());
}

function wildcardToRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function candidateUrls(pattern) {
  const replacements = ['', 'me', 'shop123', 'dashboard', 'tools/listings', 'listing-editor/edit/123', 'x/y'];
  return unique(replacements.map((value) => pattern.replace(/\*/g, value)));
}

function patternsOverlap(left, right) {
  const leftRegex = wildcardToRegex(left);
  const rightRegex = wildcardToRegex(right);
  const candidates = [...candidateUrls(left), ...candidateUrls(right)];
  return candidates.some((candidate) => leftRegex.test(candidate) && rightRegex.test(candidate));
}

function extractDomIds(source) {
  return unique([
    ...matches(source, /\bid\s*=\s*["']([A-Za-z][\w:.-]{2,})["']/g, 1),
    ...matches(source, /\.id\s*=\s*["']([A-Za-z][\w:.-]{2,})["']/g, 1),
    ...matches(source, /getElementById\s*\(\s*["']([A-Za-z][\w:.-]{2,})["']/g, 1),
    ...matches(source, /querySelector(?:All)?\s*\(\s*["']#([A-Za-z][\w:.-]{2,})["']/g, 1),
  ]).filter((value) => !value.includes('${'));
}

function extractWindowGlobals(source) {
  return unique([
    ...matches(source, /\bwindow\.([A-Za-z_$][\w$]*)\s*=(?!=)/g, 1),
    ...matches(source, /\bwindow\[['"]([^'"]+)['"]\]\s*=(?!=)/g, 1),
    ...matches(source, /\bglobalThis\.([A-Za-z_$][\w$]*)\s*=(?!=)/g, 1),
  ]);
}

function extractCustomEvents(source) {
  return unique([
    ...matches(source, /new\s+CustomEvent\s*\(\s*["']([^'"]+)["']/g, 1),
    ...matches(source, /dispatchEvent\s*\(\s*new\s+Event\s*\(\s*["']([^'"]+)["']/g, 1),
  ]);
}

function extractStorageLiterals(source) {
  return unique([
    ...matches(source, /(?:GM\.(?:getValue|setValue|deleteValue)|GM_(?:getValue|setValue|deleteValue)|localStorage\.(?:getItem|setItem|removeItem)|sessionStorage\.(?:getItem|setItem|removeItem))\s*\(\s*["']([^'"]+)["']/g, 1),
    ...matches(source, /(?:STORAGE|CACHE|STATE|QUEUE|SETTINGS|CONFIG|HISTORY|REQUEST|RESULT|TELEMETRY)[A-Z0-9_]*\s*=\s*["']([^'"]+)["']/g, 1),
  ]).filter((value) => value.length >= 4);
}

function extractClassTokens(source, prefixes) {
  const all = unique(matches(source, /(?<![-\w])[a-z][a-z0-9]*-[a-z0-9][a-z0-9_-]*/gi));
  return all.filter((token) => prefixes.some((prefix) => token.startsWith(prefix)));
}

function extractZIndexes(source) {
  return unique(matches(source, /z-index\s*:\s*(-?\d{1,10})/gi, 1).map(Number)).sort((a, b) => a - b);
}

function extractKeyboardLiterals(source) {
  return unique([
    ...matches(source, /(?:event|e|keyboardEvent)\.(?:code|key)\s*===?\s*["']([^'"]+)["']/gi, 1),
    ...matches(source, /["']([^'"]+)["']\s*===?\s*(?:event|e|keyboardEvent)\.(?:code|key)/gi, 1),
    ...matches(source, /\.key\.toLowerCase\(\)\s*===?\s*["']([^'"]+)["']/gi, 1),
  ]);
}

function globalStyleSignals(source) {
  return {
    gmAddStyle: (source.match(/\bGM(?:_addStyle|\.addStyle)\s*\(/g) || []).length,
    documentHeadStyle: (source.match(/document\.(?:head|documentElement)\.append(?:Child)?\s*\([^)]*style/gi) || []).length,
    styleElementCreates: (source.match(/createElement\s*\(\s*["']style["']\s*\)/gi) || []).length,
  };
}

function analyze(definition, source) {
  const metadata = metadataBlock(source);
  const shadowModes = matches(source, /attachShadow\s*\(\s*\{\s*mode\s*:\s*["']([^'"]+)["']/g, 1);
  const classTokens = extractClassTokens(source, definition.prefixes);
  const domIds = extractDomIds(source);
  const windowGlobals = extractWindowGlobals(source);
  const customEvents = extractCustomEvents(source);
  const storageLiterals = extractStorageLiterals(source);
  const telemetryScriptId = source.match(/TELEMETRY_SCRIPT_ID\s*=\s*["']([^'"]+)["']/)?.[1] || null;
  const mkuiVersion = source.match(/(?:const|let|var)\s+MKUI_VERSION\s*=\s*["']([^'"]+)["']/)?.[1] || null;

  return {
    id: definition.id,
    label: definition.label,
    path: definition.path,
    bytes: Buffer.byteLength(source),
    lines: source.split('\n').length,
    sha256: sha256(source),
    version: metadataValues(metadata, 'version')[0] || null,
    mkuiVersion,
    matches: metadataValues(metadata, 'match'),
    runAt: metadataValues(metadata, 'run-at')[0] || null,
    grants: metadataValues(metadata, 'grant'),
    prefixes: definition.prefixes,
    shadowModes,
    expectedShadowModes: definition.expectedShadowModes,
    domIds,
    classTokenCount: classTokens.length,
    classTokenSample: classTokens.slice(0, 80),
    windowGlobals,
    customEvents,
    telemetryScriptId,
    storageLiterals,
    zIndexes: extractZIndexes(source),
    keyboardLiterals: extractKeyboardLiterals(source),
    globalStyleSignals: globalStyleSignals(source),
    fixedSurfaceSnippets: snippets(source, 'fixed-surface', /[^{}]{0,180}\{[^{}]*position\s*:\s*fixed[^{}]*\}/gi, 180, 24),
    launcherSnippets: snippets(source, 'launcher', /[^\n]{0,220}(?:launcher|floating|fab|open-panel|toggle-panel|panel-toggle)[^\n]{0,260}/gi, 180, 24),
    modalToastSnippets: snippets(source, 'modal-toast', /[^\n]{0,220}(?:modal|toast|overlay|backdrop)[^\n]{0,280}/gi, 190, 30),
    keyboardSnippets: snippets(source, 'keyboard', /[^\n]{0,260}(?:keydown|keyup|event\.code|event\.key|\.key\.toLowerCase)[^\n]{0,320}/gi, 220, 36),
    scrollLockSnippets: snippets(source, 'scroll-lock', /[^\n]{0,260}(?:(?:body|documentElement)\.style\.overflow|overflow\s*=\s*["']hidden|scroll-lock|scrollLock|lock-scroll)[^\n]{0,320}/gi, 220, 30),
    routeLifecycleSnippets: snippets(source, 'route-lifecycle', /[^\n]{0,260}(?:pushState|replaceState|popstate|location\.pathname|location\.href|MutationObserver)[^\n]{0,320}/gi, 220, 32),
    globalStyleSnippets: snippets(source, 'global-style', /[^\n]{0,260}(?:GM(?:_addStyle|\.addStyle)|createElement\s*\(\s*["']style|document\.(?:head|documentElement)\.append)[^\n]{0,320}/gi, 220, 28),
  };
}

function collisions(items, field) {
  const owners = new Map();
  for (const item of items) {
    for (const value of item[field] || []) {
      if (!owners.has(value)) owners.set(value, []);
      owners.get(value).push(item.id);
    }
  }
  return [...owners.entries()]
    .filter(([, scripts]) => new Set(scripts).size > 1)
    .map(([value, scripts]) => ({ value, scripts: unique(scripts) }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

const sources = await Promise.all(DEFINITIONS.map(async (definition) => ({
  definition,
  source: await readFile(resolve(ROOT, definition.path), 'utf8'),
})));
const scripts = sources.map(({ definition, source }) => analyze(definition, source));

const routeGlobOverlap = [];
for (let left = 0; left < scripts.length; left += 1) {
  for (let right = left + 1; right < scripts.length; right += 1) {
    const overlaps = [];
    for (const leftPattern of scripts[left].matches) {
      for (const rightPattern of scripts[right].matches) {
        if (patternsOverlap(leftPattern, rightPattern)) overlaps.push({ leftPattern, rightPattern });
      }
    }
    routeGlobOverlap.push({ left: scripts[left].id, right: scripts[right].id, overlaps });
  }
}

const routeOwnership = CANONICAL_ROUTES.map((fixture) => ({
  ...fixture,
  matchedScripts: scripts
    .filter((script) => script.matches.some((pattern) => wildcardToRegex(pattern).test(fixture.url)))
    .map((script) => script.id),
}));

const telemetryCollisions = collisions(scripts.map((script) => ({ id: script.id, values: script.telemetryScriptId ? [script.telemetryScriptId] : [] })), 'values');
const domIdCollisions = collisions(scripts, 'domIds');
const windowGlobalCollisions = collisions(scripts, 'windowGlobals');
const customEventCollisions = collisions(scripts, 'customEvents');
const storageLiteralCollisions = collisions(scripts, 'storageLiterals');

const assertions = {
  scriptCount: scripts.length === 5,
  allMkuiVersionsAre100: scripts.every((script) => script.mkuiVersion === '1.0.0'),
  telemetryIdsPresentAndUnique: scripts.every((script) => script.telemetryScriptId) && telemetryCollisions.length === 0,
  expectedShadowModesMatch: scripts.every((script) => JSON.stringify(script.shadowModes) === JSON.stringify(script.expectedShadowModes)),
  canonicalRoutesHaveSingleOwner: routeOwnership.every((fixture) => fixture.matchedScripts.length === 1 && fixture.matchedScripts[0] === fixture.owner),
  noWindowGlobalCollisions: windowGlobalCollisions.length === 0,
};

const failed = Object.entries(assertions).filter(([, passed]) => !passed).map(([name]) => name);

const audit = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  scripts,
  matrices: {
    routeGlobOverlap,
    routeOwnership,
    domIdCollisions,
    windowGlobalCollisions,
    customEventCollisions,
    storageLiteralCollisions,
    telemetryCollisions,
  },
  assertions,
};

const json = `${JSON.stringify(audit, null, 2)}\n`;
if (WRITE) {
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, json, 'utf8');
  console.log(`Wrote ${OUTPUT_PATH}`);
} else {
  process.stdout.write(json);
}

if (failed.length) throw new Error(`Cross-script source audit failed: ${failed.join(', ')}`);
