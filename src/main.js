// Entry point of the unified userscript.
//
// The build wraps everything in one closure, inlines the shared SPA lifecycle
// (which declares `createRouteLifecycle`), and calls `boot` once. Nothing is
// exposed to the Etsy page.

import { META } from './meta.js';
import { createGmStore, createMemoryStore } from './core/gm.js';
import { createStorage } from './core/storage.js';
import { createSettings } from './core/settings.js';
import { createEvents } from './core/events.js';
import { createHost } from './core/host.js';
import { TOOLS } from './modules/index.js';
import { runLegacyMigration, migratedTools } from './core/migration.js';

const LOG_PREFIX = '[Etsy Automation Tools]';

export async function boot({ scope, createRouteLifecycle, handoff }) {
  if (scope.top !== scope.self) return null; // never run inside Etsy iframes
  if (scope.__etsyAutomationToolsBooted) return null; // one instance per document
  scope.__etsyAutomationToolsBooted = true;

  const gmStore = createGmStore(scope);
  const store = gmStore ?? createMemoryStore();
  const storage = createStorage(store);
  const settings = createSettings(storage.namespace('core'));
  await settings.load();
  const events = createEvents((error) => console.error(LOG_PREFIX, error));
  const onError = (code, error) => {
    console.error(LOG_PREFIX, code, error);
    events.emit('error', { code });
  };

  // Transfer from the standalone scripts; the UI (phase 4) calls migration.run().
  const toolIds = TOOLS.map((t) => t.id);
  const rules = { specs: handoff.MIGRATION_SPECS, isTransferable: handoff.migrationIsTransferableKey, strip: handoff.migrationStripSecrets };
  const migration = {
    run: ({ timeoutMs } = {}) => runLegacyMigration({
      requester: handoff.createMigrationRequester({ transport: handoff.createDomMigrationTransport(scope.document), cryptoApi: scope.crypto }),
      storage, rules, tools: toolIds, timeoutMs,
    }),
    done: () => migratedTools(storage, toolIds),
  };

  const host = createHost({
    modules: TOOLS,
    createRouteLifecycle,
    location: scope.location,
    services: { storage, settings, events, migration, appVersion: META.version, persistent: Boolean(gmStore) },
    isEnabled: (id) => settings.get().tools[id] !== false,
    onError,
  });
  await host.start();
  return { host, storage, settings, events };
}
