import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import {
  MKUI_CANONICAL_ROUTE_FIXTURES,
  MKUI_EXPECTED_VERSION,
  MKUI_INTENTIONAL_SHARED_STORAGE_PROTOCOLS,
  MKUI_MAX_Z_INDEX,
  MKUI_PRODUCTION_SCRIPTS,
  MKUI_ROOT,
  MKUI_STANDARD_DOM_EVENTS,
} from './Mkui-Production-Registry.mjs';

export const OUTPUT_PATH = resolve(
  MKUI_ROOT,
  'docs/design/previews/mkui-cross-script-coexistence-audit.json',
);

const STANDARD_EVENTS = new Set(MKUI_STANDARD_DOM_EVENTS);
const SHARED_STORAGE_PROTOCOLS = new Set(MKUI_INTENTIONAL_SHARED_STORAGE_PROTOCOLS);
const STRING_CONSTANT_PATTERN = /\b(?:const|let|var)\s+([A-Z][A-Z0-9_]*)\s*=\s*(['"])(.*?)\2\s*;/gs;
const SIMPLE_TEMPLATE_CONSTANT_PATTERN = /\b(?:const|let|var)\s+([A-Z][A-Z0-9_]*)\s*=\s*`([^`]*)`\s*;/gs;
const ROOT_ID_NAME_PATTERN = /(?:^|_)(?:ROOT|HOST|PANEL|TOAST|MODAL|OVERLAY|BACKDROP)(?:_|$)|(?:^|_)ID$/;
const STORAGE_NAME_PATTERN = /(?:STORAGE|CACHE|STATE|QUEUE|SETTINGS|CONFIG|HISTORY|REQUEST|RESULT|PREFERENCE|TELEMETRY)/;
const URL_OR_HEADER_PATTERN = /^(?:https?:\/\/|x-[a-z0-9-]+$)/i;
const OWNER_MARKER_PATTERN = /^__installation_?id$/i;
const SAFE_GLOBAL_SELECTOR_PREFIXES = Object.freeze([
  '#${',
  '[data-mema-',
  '[data-ekma-',
  '[data-meli-',
  '[data-maw-',
  '[data-eda-',
  '[data-makaytron-',
]);
const GENERIC_GLOBAL_SELECTORS = new Set([
  '*', ':root', 'html', 'body', 'button', 'input', 'textarea', 'select',
  'a', 'form', 'section', 'main', 'aside', 'header', 'footer', 'nav',
]);

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function unique(values) {
  return [...new Set(values)].sort((left, right) =>
    String(left).localeCompare(String(right), undefined, { numeric: true }));
}

export function collectMatches(text, regex, group = 0) {
  const values = [];
  for (const match of text.matchAll(regex)) values.push(match[group]);
  return values;
}

export function lineAt(text, index) {
  return text.slice(0, Math.max(0, index)).split('\n').length;
}

export function compact(value, max = 560) {
  const normalized = String(value)
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}…`;
}

export function metadataBlock(source) {
  return source.match(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==/m)?.[0] || '';
}

export function metadataValues(metadata, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return collectMatches(
    metadata,
    new RegExp(`^\\/\\/ @${escaped}\\s+(.+)$`, 'gm'),
    1,
  ).map(value => value.trim());
}

export function matchPatternToRegex(pattern) {
  const escaped = String(pattern)
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

export function urlMatchesPattern(url, pattern) {
  return matchPatternToRegex(pattern).test(url);
}

export function assignedStringConstants(source) {
  const constants = new Map();
  for (const match of source.matchAll(STRING_CONSTANT_PATTERN)) {
    constants.set(match[1], match[3]);
  }
  for (const match of source.matchAll(SIMPLE_TEMPLATE_CONSTANT_PATTERN)) {
    if (!match[2].includes('${')) constants.set(match[1], match[2]);
  }
  return constants;
}

function substituteSimpleConstants(value, constants) {
  return String(value).replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (whole, name) =>
    constants.has(name) ? constants.get(name) : whole);
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

export function extractGlobalCssBodies(source) {
  const constants = assignedStringConstants(source);
  const results = [];
  const seen = new Set();

  const addResult = (label, template, kind) => {
    if (!template || !template.body.trim()) return;
    const key = `${template.start}:${template.end}:${label}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({
      label,
      kind,
      line: lineAt(source, template.start),
      css: substituteSimpleConstants(template.body, constants),
    });
  };

  const directCallPattern = /\b(?:addStyle|GM_addStyle|GM\.addStyle)\s*\(\s*`/g;
  for (const match of source.matchAll(directCallPattern)) {
    addResult(
      'direct-style-call',
      readTemplateLiteral(source, match.index + match[0].lastIndexOf('`')),
      'global',
    );
  }

  const assignmentPatterns = [
    {
      regex: /\b(?:const|let|var)\s+GLOBAL_CSS\s*=\s*`/g,
      label: 'GLOBAL_CSS',
      kind: 'global',
    },
    {
      regex: /\.textContent\s*=\s*`/g,
      label: 'style.textContent',
      kind: 'global',
    },
    {
      regex: /\.innerHTML\s*=\s*`/g,
      label: 'innerHTML',
      kind: 'unknown',
    },
  ];

  for (const definition of assignmentPatterns) {
    for (const match of source.matchAll(definition.regex)) {
      const template = readTemplateLiteral(source, match.index + match[0].lastIndexOf('`'));
      if (!template) continue;
      if (definition.label === 'innerHTML') {
        const styleMatches = [...template.body.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
        for (const styleMatch of styleMatches) {
          results.push({
            label: 'innerHTML<style>',
            kind: 'shadow-or-local',
            line: lineAt(source, template.start + (styleMatch.index || 0)),
            css: substituteSimpleConstants(styleMatch[1], constants),
          });
        }
        continue;
      }
      addResult(definition.label, template, definition.kind);
    }
  }

  return results;
}

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

export function extractCssSelectors(css) {
  const clean = stripCssComments(css);
  const selectors = [];
  const pattern = /([^{}]+)\{/g;
  for (const match of clean.matchAll(pattern)) {
    const candidate = match[1].trim();
    if (!candidate) continue;
    if (candidate.startsWith('@')) continue;
    if (/^(?:from|to|\d+(?:\.\d+)?%)$/i.test(candidate)) continue;
    const tail = candidate.includes(';')
      ? candidate.slice(candidate.lastIndexOf(';') + 1).trim()
      : candidate;
    if (!tail) continue;
    for (const fragment of tail.split(',')) {
      const selector = fragment.trim();
      if (selector) selectors.push(selector);
    }
  }
  return unique(selectors);
}

function selectorHasExpectedPrefix(selector, prefixes) {
  if (SAFE_GLOBAL_SELECTOR_PREFIXES.some(prefix => selector.startsWith(prefix))) return true;
  if (selector.startsWith(':host')) return true;
  if (selector.includes('#${')) return true;
  return prefixes.some(prefix =>
    selector.includes(`.${prefix}`) ||
    selector.includes(`[class^="${prefix}`) ||
    selector.includes(`[class*=" ${prefix}`));
}

function selectorStartsGeneric(selector) {
  const normalized = selector
    .replace(/::?[a-z-]+(?:\([^)]*\))?/gi, '')
    .replace(/\[[^\]]+\]/g, '')
    .trim();
  const first = normalized.split(/\s|>|\+|~/)[0] || '';
  return GENERIC_GLOBAL_SELECTORS.has(first.toLowerCase());
}

export function auditGlobalCssIsolation(cssBodies, prefixes) {
  const unsafe = [];
  const bodySummaries = [];

  for (const body of cssBodies) {
    const selectors = extractCssSelectors(body.css);
    const globalCandidate = body.kind === 'global';
    const bodyUnsafe = [];
    if (globalCandidate) {
      for (const selector of selectors) {
        const safe = selectorHasExpectedPrefix(selector, prefixes);
        if (!safe && selectorStartsGeneric(selector)) {
          bodyUnsafe.push(selector);
          unsafe.push({
            label: body.label,
            line: body.line,
            selector,
          });
        }
      }
    }
    bodySummaries.push({
      label: body.label,
      kind: body.kind,
      line: body.line,
      bytes: Buffer.byteLength(body.css),
      selectorCount: selectors.length,
      unsafeSelectors: unique(bodyUnsafe),
    });
  }

  return {
    bodies: bodySummaries,
    unsafeSelectors: unsafe,
  };
}

export function extractDomIds(source) {
  const constants = assignedStringConstants(source);
  const ids = [
    ...collectMatches(source, /\bid\s*=\s*["']([A-Za-z][\w:.-]{2,})["']/g, 1),
    ...collectMatches(source, /\.id\s*=\s*["']([A-Za-z][\w:.-]{2,})["']/g, 1),
    ...collectMatches(source, /getElementById\s*\(\s*["']([A-Za-z][\w:.-]{2,})["']/g, 1),
    ...collectMatches(source, /querySelector(?:All)?\s*\(\s*["']#([A-Za-z][\w:.-]{2,})["']/g, 1),
  ];
  for (const [name, value] of constants) {
    if (!ROOT_ID_NAME_PATTERN.test(name)) continue;
    if (/^[A-Za-z][\w:.-]{2,}$/.test(value)) ids.push(value);
  }
  return unique(ids.filter(value => !value.includes('${')));
}

export function extractWindowGlobals(source) {
  return unique([
    ...collectMatches(source, /\bwindow\.([A-Za-z_$][\w$]*)\s*=(?!=)/g, 1),
    ...collectMatches(source, /\bwindow\[['"]([^'"]+)['"]\]\s*=(?!=)/g, 1),
    ...collectMatches(source, /\bglobalThis\.([A-Za-z_$][\w$]*)\s*=(?!=)/g, 1),
  ]);
}

export function extractCustomEvents(source) {
  const all = unique([
    ...collectMatches(source, /new\s+CustomEvent\s*\(\s*["']([^'"]+)["']/g, 1),
    ...collectMatches(source, /dispatchEvent\s*\(\s*new\s+Event\s*\(\s*["']([^'"]+)["']/g, 1),
  ]);
  return {
    all,
    namespaced: all.filter(name => !STANDARD_EVENTS.has(name)),
    standard: all.filter(name => STANDARD_EVENTS.has(name)),
  };
}

export function extractStorageKeys(source) {
  const constants = assignedStringConstants(source);
  const values = [
    ...collectMatches(
      source,
      /(?:GM\.(?:getValue|setValue|deleteValue)|GM_(?:getValue|setValue|deleteValue)|localStorage\.(?:getItem|setItem|removeItem)|sessionStorage\.(?:getItem|setItem|removeItem))\s*\(\s*["']([^'"]+)["']/g,
      1,
    ),
  ];

  for (const [name, value] of constants) {
    if (!STORAGE_NAME_PATTERN.test(name)) continue;
    values.push(value);
  }

  return unique(values.filter(value =>
    value.length >= 4 &&
    !URL_OR_HEADER_PATTERN.test(value) &&
    !OWNER_MARKER_PATTERN.test(value)));
}

export function extractClassTokens(source, prefixes) {
  const tokens = unique(
    collectMatches(source, /(?<![-\w])[a-z][a-z0-9]*-[a-z0-9][a-z0-9_-]*/gi),
  );
  return tokens.filter(token => prefixes.some(prefix => token.startsWith(prefix)));
}

export function extractZIndexes(source) {
  return unique(
    collectMatches(source, /z-index\s*:\s*(-?\d{1,10})/gi, 1).map(Number),
  ).sort((left, right) => left - right);
}

function cssValue(body, property) {
  const match = body.match(new RegExp(`${property}\\s*:\\s*([^;}{]+)`, 'i'));
  return match?.[1]?.trim() || null;
}

export function extractFixedSurfaces(cssBodies) {
  const surfaces = [];
  for (const cssBody of cssBodies) {
    const clean = stripCssComments(cssBody.css);
    for (const match of clean.matchAll(/([^{}]+)\{([^{}]*\bposition\s*:\s*fixed\b[^{}]*)\}/gi)) {
      const selector = compact(match[1].includes(';')
        ? match[1].slice(match[1].lastIndexOf(';') + 1)
        : match[1], 180);
      const declarations = match[2];
      surfaces.push({
        source: cssBody.label,
        line: cssBody.line + lineAt(clean, match.index || 0) - 1,
        selector,
        top: cssValue(declarations, 'top'),
        right: cssValue(declarations, 'right'),
        bottom: cssValue(declarations, 'bottom'),
        left: cssValue(declarations, 'left'),
        width: cssValue(declarations, 'width'),
        height: cssValue(declarations, 'height'),
        zIndex: Number.parseInt(cssValue(declarations, 'z-index') || '', 10) || null,
      });
    }
  }
  return surfaces;
}

export function extractGlobalShortcuts(source) {
  const shortcuts = [];
  const listenerPattern = /\b(document|window|globalThis)\.addEventListener\s*\(\s*["']keydown["']\s*,/g;
  for (const match of source.matchAll(listenerPattern)) {
    const start = match.index || 0;
    const snippet = source.slice(start, Math.min(source.length, start + 1800));
    const keys = unique([
      ...collectMatches(snippet, /(?:event|e|keyboardEvent)\.(?:code|key)\s*===?\s*["']([^'"]+)["']/gi, 1),
      ...collectMatches(snippet, /["']([^'"]+)["']\s*===?\s*(?:event|e|keyboardEvent)\.(?:code|key)/gi, 1),
      ...collectMatches(snippet, /\.key\.toLowerCase\(\)\s*===?\s*["']([^'"]+)["']/gi, 1),
    ]);
    if (!keys.length) continue;
    const modifiers = unique([
      /\b(?:event|e|keyboardEvent)\.ctrlKey\b/i.test(snippet) ? 'Ctrl' : '',
      /\b(?:event|e|keyboardEvent)\.metaKey\b/i.test(snippet) ? 'Meta' : '',
      /\b(?:event|e|keyboardEvent)\.altKey\b/i.test(snippet) ? 'Alt' : '',
      /\b(?:event|e|keyboardEvent)\.shiftKey\b/i.test(snippet) ? 'Shift' : '',
    ].filter(Boolean));
    for (const key of keys) {
      shortcuts.push({
        target: match[1],
        line: lineAt(source, start),
        key,
        modifiers,
        signature: [...modifiers, key].join('+'),
      });
    }
  }
  return shortcuts;
}

export function extractScrollLockWrites(source) {
  const writes = [];
  const patterns = [
    /(?:document\.)?(body|documentElement)\.style\.(overflow|position)\s*=\s*([^;\n]+)/g,
    /(?:document\.)?(body|documentElement)\.style\.setProperty\s*\(\s*["'](overflow|position)["']\s*,\s*([^)\n]+)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const value = compact(match[3], 120);
      writes.push({
        target: match[1],
        property: match[2],
        value,
        line: lineAt(source, match.index || 0),
        lock: /["']hidden["']|["']fixed["']/i.test(value),
        restore: /["']{2}|["']auto["']|previous|original|restore/i.test(value),
      });
    }
  }
  return writes;
}

export function collisionMatrix(items, field) {
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
    .sort((left, right) => left.value.localeCompare(right.value));
}

export function fixedSurfaceAnchor(surface) {
  const x = surface.left ? `L:${surface.left}` : surface.right ? `R:${surface.right}` : 'X:auto';
  const y = surface.top ? `T:${surface.top}` : surface.bottom ? `B:${surface.bottom}` : 'Y:auto';
  return `${x}|${y}|W:${surface.width || 'auto'}|H:${surface.height || 'auto'}`;
}

function routeOwnership(scripts) {
  return MKUI_CANONICAL_ROUTE_FIXTURES.map(fixture => ({
    ...fixture,
    matchedScripts: scripts
      .filter(script => script.matches.some(pattern => urlMatchesPattern(fixture.url, pattern)))
      .map(script => script.id),
  }));
}

function coexistingScriptPairs(routeFixtures) {
  const pairs = new Map();
  for (const fixture of routeFixtures) {
    for (let left = 0; left < fixture.matchedScripts.length; left += 1) {
      for (let right = left + 1; right < fixture.matchedScripts.length; right += 1) {
        const pair = unique([fixture.matchedScripts[left], fixture.matchedScripts[right]]);
        const key = pair.join('|');
        if (!pairs.has(key)) pairs.set(key, { scripts: pair, urls: [] });
        pairs.get(key).urls.push(fixture.url);
      }
    }
  }
  return [...pairs.values()].map(pair => ({ ...pair, urls: unique(pair.urls) }));
}

function pairCanCoexist(leftId, rightId, coexistencePairs) {
  return coexistencePairs.some(pair =>
    pair.scripts.includes(leftId) && pair.scripts.includes(rightId));
}

function surfaceCollisions(scripts, coexistencePairs) {
  const collisions = [];
  for (let left = 0; left < scripts.length; left += 1) {
    for (let right = left + 1; right < scripts.length; right += 1) {
      const leftScript = scripts[left];
      const rightScript = scripts[right];
      if (!pairCanCoexist(leftScript.id, rightScript.id, coexistencePairs)) continue;
      const rightAnchors = new Map(
        rightScript.fixedSurfaces.map(surface => [fixedSurfaceAnchor(surface), surface]),
      );
      for (const surface of leftScript.fixedSurfaces) {
        const anchor = fixedSurfaceAnchor(surface);
        if (!rightAnchors.has(anchor)) continue;
        collisions.push({
          scripts: [leftScript.id, rightScript.id],
          anchor,
          left: surface,
          right: rightAnchors.get(anchor),
        });
      }
    }
  }
  return collisions;
}

function shortcutCollisions(scripts, coexistencePairs) {
  const collisions = [];
  for (let left = 0; left < scripts.length; left += 1) {
    for (let right = left + 1; right < scripts.length; right += 1) {
      const leftScript = scripts[left];
      const rightScript = scripts[right];
      if (!pairCanCoexist(leftScript.id, rightScript.id, coexistencePairs)) continue;
      const rightBySignature = new Map(
        rightScript.globalShortcuts.map(shortcut => [shortcut.signature, shortcut]),
      );
      for (const shortcut of leftScript.globalShortcuts) {
        if (!rightBySignature.has(shortcut.signature)) continue;
        collisions.push({
          scripts: [leftScript.id, rightScript.id],
          signature: shortcut.signature,
          left: shortcut,
          right: rightBySignature.get(shortcut.signature),
        });
      }
    }
  }
  return collisions;
}

function unexpectedSharedStorage(collisions) {
  return collisions.filter(collision => !SHARED_STORAGE_PROTOCOLS.has(collision.value));
}

function namespacedEventCollisions(scripts) {
  return collisionMatrix(
    scripts.map(script => ({ id: script.id, names: script.customEvents.namespaced })),
    'names',
  );
}

function cssPrefixCollisions(scripts) {
  return collisionMatrix(
    scripts.map(script => ({ id: script.id, prefixes: script.cssPrefixes })),
    'prefixes',
  );
}

function scrollLockBalance(script) {
  const locks = script.scrollLockWrites.filter(write => write.lock);
  const restores = script.scrollLockWrites.filter(write => write.restore);
  return {
    locks: locks.length,
    restores: restores.length,
    balanced: locks.length === 0 || restores.length >= locks.length,
  };
}

async function analyzeScript(definition, source) {
  const metadata = metadataBlock(source);
  const customEvents = extractCustomEvents(source);
  const cssBodies = extractGlobalCssBodies(source);
  const cssIsolation = auditGlobalCssIsolation(cssBodies, definition.cssPrefixes);
  const constants = assignedStringConstants(source);
  const telemetryScriptId = constants.get('TELEMETRY_SCRIPT_ID') || null;
  const mkuiVersion = constants.get('MKUI_VERSION') || null;
  const mkuiBundleHash = constants.get('MKUI_BUNDLE_HASH') || null;
  const classTokens = extractClassTokens(source, definition.cssPrefixes);
  const scrollLockWrites = extractScrollLockWrites(source);

  return {
    id: definition.id,
    label: definition.label,
    path: definition.path,
    bytes: Buffer.byteLength(source),
    lines: source.split('\n').length,
    sha256: sha256(source),
    version: metadataValues(metadata, 'version')[0] || null,
    mkuiVersion,
    mkuiBundleHash,
    matches: metadataValues(metadata, 'match'),
    runAt: metadataValues(metadata, 'run-at')[0] || null,
    grants: metadataValues(metadata, 'grant'),
    cssPrefixes: definition.cssPrefixes,
    shadowModes: collectMatches(
      source,
      /attachShadow\s*\(\s*\{\s*mode\s*:\s*["']([^'"]+)["']/g,
      1,
    ),
    expectedShadowModes: definition.expectedShadowModes,
    domIds: extractDomIds(source),
    classTokenCount: classTokens.length,
    classTokenSample: classTokens.slice(0, 100),
    windowGlobals: extractWindowGlobals(source),
    customEvents,
    telemetryScriptId,
    storageKeys: extractStorageKeys(source),
    zIndexes: extractZIndexes(source),
    fixedSurfaces: extractFixedSurfaces(cssBodies),
    globalShortcuts: extractGlobalShortcuts(source),
    scrollLockWrites,
    scrollLockBalance: scrollLockBalance({ scrollLockWrites }),
    cssIsolation,
  };
}

export async function buildCrossScriptAudit(options = {}) {
  const root = options.root ? resolve(options.root) : MKUI_ROOT;
  const sourceOverrides = options.sourceOverrides || new Map();
  const scripts = [];

  for (const definition of MKUI_PRODUCTION_SCRIPTS) {
    const source = sourceOverrides.has(definition.id)
      ? sourceOverrides.get(definition.id)
      : await readFile(resolve(root, definition.path), 'utf8');
    scripts.push(await analyzeScript(definition, source));
  }

  const routes = routeOwnership(scripts);
  const coexistencePairs = coexistingScriptPairs(routes);
  const domIdCollisions = collisionMatrix(scripts, 'domIds');
  const windowGlobalCollisions = collisionMatrix(scripts, 'windowGlobals');
  const storageKeyCollisions = collisionMatrix(scripts, 'storageKeys');
  const unexpectedStorageCollisions = unexpectedSharedStorage(storageKeyCollisions);
  const eventCollisions = namespacedEventCollisions(scripts);
  const prefixCollisions = cssPrefixCollisions(scripts);
  const telemetryCollisions = collisionMatrix(
    scripts.map(script => ({
      id: script.id,
      telemetry: script.telemetryScriptId ? [script.telemetryScriptId] : [],
    })),
    'telemetry',
  );
  const fixedCollisions = surfaceCollisions(scripts, coexistencePairs);
  const keyCollisions = shortcutCollisions(scripts, coexistencePairs);
  const unsafeGlobalCssSelectors = scripts.flatMap(script =>
    script.cssIsolation.unsafeSelectors.map(finding => ({
      script: script.id,
      ...finding,
    })));
  const unbalancedScrollLocks = scripts
    .filter(script => !script.scrollLockBalance.balanced)
    .map(script => ({
      script: script.id,
      ...script.scrollLockBalance,
      writes: script.scrollLockWrites,
    }));

  const assertions = {
    scriptCountIsFive: scripts.length === 5,
    allMkuiVersionsMatch: scripts.every(script => script.mkuiVersion === MKUI_EXPECTED_VERSION),
    telemetryIdsPresentAndExpected: scripts.every(script =>
      script.telemetryScriptId ===
      MKUI_PRODUCTION_SCRIPTS.find(item => item.id === script.id)?.expectedTelemetryId),
    telemetryIdsUnique: telemetryCollisions.length === 0,
    expectedShadowModesMatch: scripts.every(script =>
      JSON.stringify(script.shadowModes) === JSON.stringify(script.expectedShadowModes)),
    canonicalRoutesHaveSingleOwner: routes.every(route =>
      route.matchedScripts.length === 1 && route.matchedScripts[0] === route.owner),
    domIdsAreUnique: domIdCollisions.length === 0,
    windowGlobalsAreUnique: windowGlobalCollisions.length === 0,
    namespacedCustomEventsAreUnique: eventCollisions.length === 0,
    cssPrefixesAreUnique: prefixCollisions.length === 0,
    storageKeysOnlyShareIntentionalProtocols: unexpectedStorageCollisions.length === 0,
    globalCssHasNoGenericLeakage: unsafeGlobalCssSelectors.length === 0,
    zIndexesStayWithinBrowserLimit: scripts.every(script =>
      script.zIndexes.every(value => Number.isInteger(value) && value >= 0 && value <= MKUI_MAX_Z_INDEX)),
    coexistingFixedSurfacesDoNotShareAnchors: fixedCollisions.length === 0,
    coexistingScriptsDoNotShareGlobalShortcuts: keyCollisions.length === 0,
    scrollLocksAreBalanced: unbalancedScrollLocks.length === 0,
  };

  const failedAssertions = Object.entries(assertions)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  const sourceDigest = sha256(
    scripts.map(script => `${script.path}\0${script.sha256}`).join('\n'),
  );

  return {
    schemaVersion: 2,
    generatedBy: 'tools/Audit-Mkui-Cross-Script-Coexistence.mjs',
    sourceDigest: `sha256:${sourceDigest}`,
    status: failedAssertions.length ? 'fail' : 'pass',
    summary: {
      scriptCount: scripts.length,
      routeFixtureCount: routes.length,
      coexistencePairCount: coexistencePairs.length,
      fixedSurfaceCount: scripts.reduce((total, script) => total + script.fixedSurfaces.length, 0),
      globalShortcutCount: scripts.reduce((total, script) => total + script.globalShortcuts.length, 0),
      globalCssBodyCount: scripts.reduce((total, script) => total + script.cssIsolation.bodies.length, 0),
      failedAssertions,
    },
    assertions,
    scripts,
    matrices: {
      routeOwnership: routes,
      coexistencePairs,
      domIdCollisions,
      windowGlobalCollisions,
      namespacedCustomEventCollisions: eventCollisions,
      cssPrefixCollisions: prefixCollisions,
      storageKeyCollisions,
      unexpectedStorageCollisions,
      telemetryCollisions,
      fixedSurfaceCollisions: fixedCollisions,
      globalShortcutCollisions: keyCollisions,
      unsafeGlobalCssSelectors,
      unbalancedScrollLocks,
    },
  };
}

export function serializeAudit(audit) {
  return `${JSON.stringify(audit, null, 2)}\n`;
}

export async function writeAudit(audit, outputPath = OUTPUT_PATH) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serializeAudit(audit), 'utf8');
}

export async function checkCommittedAudit(audit, outputPath = OUTPUT_PATH) {
  const expected = serializeAudit(audit);
  let actual = '';
  try {
    actual = await readFile(outputPath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (actual !== expected) {
    throw new Error(
      'Committed cross-script audit is stale. Regenerate with: ' +
      'node tools/Audit-Mkui-Cross-Script-Coexistence.mjs --write',
    );
  }
}

async function main() {
  const write = process.argv.includes('--write');
  const check = process.argv.includes('--check');
  const audit = await buildCrossScriptAudit();

  if (write) await writeAudit(audit);
  if (check) await checkCommittedAudit(audit);
  if (!write && !check) process.stdout.write(serializeAudit(audit));

  if (audit.status !== 'pass') {
    throw new Error(
      `Cross-script coexistence audit failed: ${audit.summary.failedAssertions.join(', ')}`,
    );
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
