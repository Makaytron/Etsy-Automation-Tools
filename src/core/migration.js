// Receiving side of the one-time transfer from the standalone scripts.
//
// The handoff protocol itself lives in shared/migration/handoff.js (inlined
// by the build and, later, into the standalone scripts). This module stores
// what arrives. Values are kept as they were saved by the standalone script,
// under `legacy.<key>` in the tool's own namespace; each tool converts them to
// its new format when its code moves into the unified script. A transfer is
// recorded once per tool and never overwritten, so repeating it is harmless.

const LEGACY_KEY_LIMIT = 80;

/** Storage key for a standalone-script key, or null when it cannot be stored. */
export function legacyStorageKey(legacyKey) {
  const key = `legacy.${String(legacyKey).replace(/:/g, '.')}`;
  return /^[A-Za-z0-9._-]+$/.test(key) && key.length <= LEGACY_KEY_LIMIT ? key : null;
}

/**
 * Stores one received bundle.
 * `rules` = { specs, isTransferable(spec, key), strip(spec, key, value) },
 * supplied from shared/migration/handoff.js.
 */
export async function importLegacyBundle({ storage, rules, entry, now = () => new Date() }) {
  const bundle = entry?.bundle;
  const spec = rules.specs[entry?.tool];
  if (!spec || !bundle || bundle.tool !== entry.tool || !bundle.values || typeof bundle.values !== 'object') {
    return { tool: entry?.tool ?? null, state: 'rejected' };
  }
  const core = storage.namespace('core');
  const recordKey = `migration.${entry.tool}`;
  if (await core.get(recordKey, null)) return { tool: entry.tool, state: 'already' };

  const target = storage.namespace(entry.tool);
  const stored = [];
  const skipped = [];
  for (const [key, value] of Object.entries(bundle.values)) {
    const storageKey = legacyStorageKey(key);
    if (!storageKey || !rules.isTransferable(spec, key)) { skipped.push(key); continue; }
    await target.set(storageKey, rules.strip(spec, key, value)); // secrets removed again on this side
    stored.push(key);
  }
  await core.set(recordKey, {
    tool: entry.tool,
    fromVersion: typeof bundle.appVersion === 'string' ? bundle.appVersion.slice(0, 20) : null,
    exportedAt: typeof bundle.exportedAt === 'string' ? bundle.exportedAt.slice(0, 40) : null,
    importedAt: now().toISOString(),
    keys: stored.length,
    digest: entry.digest ?? null,
  });
  return { tool: entry.tool, state: 'imported', stored, skipped };
}

/**
 * Asks every armed standalone script on this tab for its data, stores what
 * arrives, and acknowledges each stored bundle. Returns one line per tool for
 * the UI, including the check code (sas) the standalone script also shows.
 */
export async function runLegacyMigration({ requester, storage, rules, tools, timeoutMs, now }) {
  const { results, ack } = await requester.request({ tools, timeoutMs });
  const summary = [];
  for (const entry of results) {
    if (entry.state !== 'received') { summary.push({ tool: entry.tool, state: entry.state }); continue; }
    const outcome = await importLegacyBundle({ storage, rules, entry, now });
    if (outcome.state === 'imported' || outcome.state === 'already') ack(entry.tool);
    summary.push({ tool: entry.tool, state: outcome.state, sas: entry.sas, stored: outcome.stored?.length ?? 0, skipped: outcome.skipped?.length ?? 0 });
  }
  return summary;
}

/** Tools whose transfer has been recorded. */
export async function migratedTools(storage, toolIds) {
  const core = storage.namespace('core');
  const done = [];
  for (const id of toolIds) if (await core.get(`migration.${id}`, null)) done.push(id);
  return done;
}
