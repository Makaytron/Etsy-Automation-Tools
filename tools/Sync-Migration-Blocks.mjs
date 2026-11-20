// Keeps the migration blocks of every registered standalone script equal to
// shared/migration/handoff.js and shared/migration/notice.js.
//
// Both blocks sit right after the shared SPA lifecycle block. Each script
// starts the notice itself between "BEGIN EAT MIGRATION START" and "END EAT
// MIGRATION START", because what counts as "a job is running" differs per
// script. The unified script removes all three regions when it adopts a
// standalone engine (tools/Unified-Adopt.mjs).
//
//   node tools/Sync-Migration-Blocks.mjs           fails on drift
//   node tools/Sync-Migration-Blocks.mjs --write   inserts or updates the blocks

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MIGRATION_BLOCKS = Object.freeze([
  { file: 'shared/migration/handoff.js', start: '    // BEGIN MIGRATION HANDOFF', end: '    // END MIGRATION HANDOFF' },
  { file: 'shared/migration/notice.js', start: '    // BEGIN MIGRATION NOTICE', end: '    // END MIGRATION NOTICE' },
]);
export const START_MARKERS = Object.freeze({ start: '    // BEGIN EAT MIGRATION START', end: '    // END EAT MIGRATION START' });
const LIFECYCLE_END = '    // END SPA LIFECYCLE';
/** The standalone scripts that hand their data over (the ids of shared/migration/handoff.js). */
export const LEGACY_IDS = Object.freeze(['ads-keyword-manager', 'keyword-market-analyzer', 'listing-analyzer', 'message-assistant', 'sale-manager']);

const count = (text, needle) => text.split(needle).length - 1;

/** Returns the source with both blocks synchronized. Throws on ambiguous markers. */
export async function synchronize(source, id) {
  let text = source;
  let anchor = LIFECYCLE_END;
  for (const block of MIGRATION_BLOCKS) {
    const body = (await readFile(path.join(root, block.file), 'utf8')).trimEnd();
    const starts = count(text, block.start);
    const ends = count(text, block.end);
    if (starts !== ends || starts > 1) throw new Error(`Ambiguous migration markers in ${id}: ${block.file}`);
    if (starts === 1) {
      const from = text.indexOf(block.start);
      const to = text.indexOf(block.end) + block.end.length;
      text = text.slice(0, from) + body + text.slice(to);
    } else {
      if (count(text, anchor) !== 1) throw new Error(`Cannot place ${block.file} in ${id}`);
      const at = text.indexOf(anchor) + anchor.length;
      text = `${text.slice(0, at)}\n\n${body}${text.slice(at)}`;
    }
    anchor = block.end;
  }
  if (count(text, START_MARKERS.start) !== 1 || count(text, START_MARKERS.end) !== 1) throw new Error(`${id} must start the migration notice exactly once`);
  return text;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Only the standalone scripts send; the unified script itself receives.
  const products = JSON.parse(await readFile(path.join(root, 'config/production-packages.json'), 'utf8')).filter((product) => product.kind === 'standalone');
  for (const product of products) {
    if (!LEGACY_IDS.includes(product.id)) continue; // the unified script itself receives, it does not send
    const file = path.join(root, product.scriptPath);
    const source = await readFile(file, 'utf8');
    const next = await synchronize(source, product.id);
    if (next === source) continue;
    if (!process.argv.includes('--write')) throw new Error(`Migration block drift in ${product.id}; run node tools/Sync-Migration-Blocks.mjs --write`);
    await writeFile(file, next, 'utf8');
  }
  console.log('PASS migration blocks: all standalone scripts synchronized.');
}
