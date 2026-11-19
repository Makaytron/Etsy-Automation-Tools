// Shared steps for adopting a standalone userscript as an engine of the unified script.
//
// The standalone body between `open` and `close` becomes `async function <factory>(__env)`.
// Each edit must match exactly the expected number of times; the closing
// block must be exactly what the adoption expects. Any drift in the
// standalone script fails the build instead of producing a wrong engine.

/**
 * @param {object} o
 * @param {string} o.name          readable tool name for error messages
 * @param {string} o.label         label for the BEGIN/END markers
 * @param {string} o.source        standalone userscript text
 * @param {string} o.open          text right before the body
 * @param {string} o.close         exact text after the body (removed)
 * @param {Array}  o.edits         [from, to, expectedCount, reason]
 * @param {string} o.factory       factory function name
 * @param {string[]} o.prologue    lines placed before the body
 * @param {string} o.epilogue      text placed after the body (must return the engine API)
 * @param {string} o.versionConst  name of the exported version constant
 */
export function adoptStandalone({ name, label, source, open, close, edits, factory, prologue, epilogue, versionConst }) {
  const text = source.replace(/\r\n/g, '\n');
  const start = text.indexOf(open);
  if (start < 0 || text.split(open).length !== 2) throw new Error(`${name} adoption: entry marker not found exactly once.`);
  if (!text.endsWith(close)) throw new Error(`${name} adoption: the closing block changed.`);
  let body = text.slice(start + open.length, text.length - close.length);
  body = stripStandaloneOnly(body, name);
  for (const [from, to, expected, reason] of edits) {
    const count = body.split(from).length - 1;
    if (count !== expected) throw new Error(`${name} adoption: "${reason}" matched ${count} times, expected ${expected}.`);
    body = body.split(from).join(to);
  }
  const version = text.match(/^\/\/ @version\s+(\d+\.\d+\.\d+)/m)?.[1];
  if (!version) throw new Error(`${name} adoption: @version not found.`);
  return [
    `// BEGIN ADOPTED ${label} ${version}`,
    `async function ${factory}(__env) {`,
    "    'use strict';",
    ...prologue,
    body.trimEnd(),
    epilogue,
    '}',
    `const ${versionConst} = '${version}';`,
    `// END ADOPTED ${label}`,
  ].join('\n');
}

/** Regions every standalone script carries for its users and the unified engine leaves out (see tools/Sync-Migration-Blocks.mjs). */
export const STANDALONE_ONLY_REGIONS = Object.freeze([
  ['    // BEGIN MIGRATION HANDOFF', '    // END MIGRATION HANDOFF'],
  ['    // BEGIN MIGRATION NOTICE', '    // END MIGRATION NOTICE'],
  ['    // BEGIN EAT MIGRATION START', '    // END EAT MIGRATION START'],
]);

/**
 * Removes the standalone-only regions from an engine body. The standalone
 * scripts' migration notice and sending side belong to the standalone
 * scripts only: the unified script is the receiver.
 */
export function stripStandaloneOnly(body, name) {
  let text = body;
  for (const [from, to] of STANDALONE_ONLY_REGIONS) {
    const starts = text.split(from).length - 1;
    const ends = text.split(to).length - 1;
    if (starts !== 1 || ends !== 1) throw new Error(`${name} adoption: standalone-only region "${from.trim()}" found ${starts} times, expected 1.`);
    const a = text.indexOf(from);
    const b = text.indexOf(to) + to.length;
    text = text.slice(0, a) + text.slice(b).replace(/^\n+/, '');
  }
  return text;
}

/** Prologue shared by adopted engines: they reach the userscript manager only through __env. */
export const GM_PROLOGUE = Object.freeze([
  '    // The engine talks to a storage, network and menu shim instead of the userscript manager directly.',
  '    const GM = __env.GM;',
  '    const GM_getValue = undefined, GM_setValue = undefined, GM_deleteValue = undefined, GM_addValueChangeListener = undefined;',
  '    const GM_info = undefined, GM_addElement = undefined;',
  '    const GM_registerMenuCommand = () => null, GM_unregisterMenuCommand = () => {};',
  '    const GM_xmlhttpRequest = __env.xmlHttpRequest;',
]);
