#!/usr/bin/env node
// Builds the unified Etsy Automation Tools userscript from src/ into one file.
//
//   node tools/Build-Unified-Userscript.mjs            writes dist/etsy-automation-tools.user.js
//   node tools/Build-Unified-Userscript.mjs --check    builds twice in memory, fails unless byte-identical
//
// The bundler is deliberately small and dependency-free. It accepts only the
// module syntax used in src/: named relative imports and `export` on
// function/const/let/class declarations. Anything else fails the build
// instead of being bundled incorrectly. The output is deterministic: no
// timestamps, stable module order, LF line endings.
//
// This is a development build. The unified script is not a production
// package yet, so the header carries no @updateURL/@downloadURL; those are
// added when it is registered in config/production-packages.json.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adoptSaleManager } from './Unified-Adopt-Sale-Manager.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(repoRoot, 'src');
const ENTRY = path.join(SRC, 'main.js');
const LIFECYCLE = path.join(repoRoot, 'shared', 'lifecycle', 'spa-lifecycle.js');
const HANDOFF = path.join(repoRoot, 'shared', 'migration', 'handoff.js');
const MKUI_TOKENS = path.join(repoRoot, 'shared', 'mkui', 'tokens.css');
const LOGO = path.join(repoRoot, 'assets', 'makaytron-logo.png');
const HANDOFF_EXPORTS = ['MIGRATION_SPECS', 'migrationIsTransferableKey', 'migrationStripSecrets', 'createMigrationRequester', 'createDomMigrationTransport'];
export const OUTPUT = path.join(repoRoot, 'dist', 'etsy-automation-tools.user.js');

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*'([^']+)';[ \t]*$/gm;
const EXPORT_DECL_RE = /^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;
const FORBIDDEN = [
  [/^\s*export\s+default\b/m, 'export default'],
  [/^\s*export\s*\{/m, 'export { ... }'],
  [/^\s*export\s*\*/m, 'export *'],
  [/^\s*import\s+[A-Za-z_$*]/m, 'default or namespace import'],
  [/\bimport\s*\(/, 'dynamic import()'],
  [/\brequire\s*\(/, 'require()'],
  [/\beval\s*\(/, 'eval()'],
  [/\bnew\s+Function\s*\(/, 'new Function()'],
];

const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const rel = (file) => path.relative(repoRoot, file).split(path.sep).join('/');
const moduleVar = (file) => `__eat_${path.relative(SRC, file).replace(/\.js$/, '').replace(/[^A-Za-z0-9]/g, '_')}`;

/** Throws when a source file uses syntax the bundler does not handle. */
export function assertSupportedSyntax(source, label) {
  for (const [pattern, name] of FORBIDDEN) {
    if (pattern.test(source)) throw new Error(`${label}: unsupported syntax for the unified build: ${name}`);
  }
}

function parseModule(file) {
  const source = read(file);
  assertSupportedSyntax(source, rel(file));
  const imports = [];
  for (const m of source.matchAll(IMPORT_RE)) {
    const spec = m[2];
    if (!spec.startsWith('./') && !spec.startsWith('../')) throw new Error(`${rel(file)}: only relative imports are bundled: ${spec}`);
    const target = path.resolve(path.dirname(file), spec);
    if (!target.startsWith(SRC + path.sep)) throw new Error(`${rel(file)}: import leaves src/: ${spec}`);
    if (!fs.existsSync(target)) throw new Error(`${rel(file)}: missing import ${spec}`);
    const names = m[1].split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
      const [name, alias] = s.split(/\s+as\s+/);
      return alias ? `${name}: ${alias}` : name;
    });
    imports.push({ statement: m[0], target, names });
  }
  const exports = [...source.matchAll(EXPORT_DECL_RE)].map((m) => m[1]);
  return { file, source, imports, exports };
}

/** Collects modules reachable from the entry in dependency order (dependencies first). */
function collect(entry) {
  const ordered = [];
  const state = new Map();
  const visit = (file, trail) => {
    if (state.get(file) === 'done') return;
    if (state.get(file) === 'visiting') throw new Error(`Import cycle: ${[...trail, file].map(rel).join(' -> ')}`);
    state.set(file, 'visiting');
    const mod = parseModule(file);
    for (const dep of [...mod.imports].sort((a, b) => a.target.localeCompare(b.target))) visit(dep.target, [...trail, file]);
    state.set(file, 'done');
    ordered.push(mod);
  };
  visit(entry, []);
  return ordered;
}

function transform(mod, available) {
  let body = mod.source;
  for (const imp of mod.imports) {
    const exported = available.get(imp.target);
    for (const n of imp.names) {
      const name = n.split(':')[0].trim();
      if (!exported.includes(name)) throw new Error(`${rel(mod.file)}: ${rel(imp.target)} does not export ${name}`);
    }
    body = body.replace(imp.statement, `const { ${imp.names.join(', ')} } = ${moduleVar(imp.target)};`);
  }
  body = body.replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)/gm, '');
  const indented = body.trimEnd().split('\n').map((line) => (line ? `    ${line}` : line)).join('\n');
  return `  // ── ${rel(mod.file)} ──\n  const ${moduleVar(mod.file)} = (() => {\n${indented}\n    return Object.freeze({ ${mod.exports.join(', ')} });\n  })();\n`;
}

async function loadMeta() {
  const { META } = await import(`${pathToFileURL(path.join(SRC, 'meta.js')).href}?build`);
  return META;
}

export function renderHeader(meta) {
  const lines = [
    ['name', meta.name], ['namespace', meta.namespace], ['version', meta.version], ['description', meta.description],
    ['author', meta.author], ['homepageURL', meta.homepage], ['supportURL', meta.supportURL], ['icon', meta.icon], ['license', meta.license],
    ...meta.match.map((m) => ['match', m]),
    ['noframes', ''],
    ...meta.grant.map((g) => ['grant', g]),
    ...meta.connect.map((c) => ['connect', c]),
    ...meta.antifeature.map((a) => ['antifeature', a]),
    ['run-at', meta.runAt],
  ];
  const width = Math.max(...lines.map(([k]) => k.length)) + 2;
  const body = lines.map(([k, v]) => `// @${k.padEnd(width - 1)}${v}`.trimEnd()).join('\n');
  return `// ==UserScript==\n${body}\n// ==/UserScript==\n`;
}

/** Returns the complete userscript text. */
export async function buildUnified() {
  const meta = await loadMeta();
  const modules = collect(ENTRY);
  const available = new Map(modules.map((m) => [m.file, m.exports]));
  const inline = (file) => {
    const text = read(file);
    assertSupportedSyntax(text, rel(file));
    return text.trimEnd().split('\n').map((l) => (l ? `  ${l.replace(/^ {4}/, '')}` : l)).join('\n');
  };
  const lifecycle = inline(LIFECYCLE);
  const handoff = inline(HANDOFF);
  const saleManagerSource = adoptSaleManager();
  assertSupportedSyntax(saleManagerSource, 'adopted Sale Manager');
  const saleManager = saleManagerSource.split('\n').map((l) => (l ? `  ${l.replace(/^ {4}/, '')}` : l)).join('\n');
  // Assets are embedded so no Etsy page load makes a request for them.
  const assets = {
    logo: `data:image/png;base64,${fs.readFileSync(LOGO).toString('base64')}`,
    mkuiTokens: read(MKUI_TOKENS).trim(),
  };
  const assetsLine = `  const __eat_assets = Object.freeze(${JSON.stringify(assets)});`;
  const parts = [
    renderHeader(meta),
    '',
    '// Development build of Etsy Automation Tools. Generated by tools/Build-Unified-Userscript.mjs from src/; do not edit.',
    '(() => {',
    "  'use strict';",
    '',
    lifecycle,
    '',
    handoff,
    '',
    assetsLine,
    '',
    saleManager,
    '',
    ...modules.map((m) => transform(m, available)),
    `  ${moduleVar(ENTRY)}.boot({ scope: window, createRouteLifecycle, handoff: { ${HANDOFF_EXPORTS.join(', ')} }, assets: __eat_assets, engines: { createSaleManager: createAdoptedSaleManager, saleManagerVersion: ADOPTED_SALE_MANAGER_VERSION } }).catch((error) => console.error('[Etsy Automation Tools] boot', error));`,
    '})();',
    '',
  ];
  return parts.join('\n');
}

export const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

async function main() {
  const args = new Set(process.argv.slice(2));
  const first = await buildUnified();
  if (args.has('--check')) {
    const second = await buildUnified();
    if (first !== second) { console.error('FAIL unified build is not deterministic.'); process.exit(1); }
    console.log(`PASS unified build: deterministic, ${first.length} bytes, sha256 ${sha256(first)}.`);
    return;
  }
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, first, 'utf8');
  console.log(`Wrote ${rel(OUTPUT)} (${first.length} bytes, sha256 ${sha256(first)}).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`FAIL ${error.message}`); process.exit(1); });
}
