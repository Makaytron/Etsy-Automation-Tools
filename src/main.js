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
import { isSellerPath } from './core/routes.js';
import { createShell } from './ui/shell.js';
import { createNotices } from './core/notices.js';
import { createUpdates } from './core/updates.js';
import { createReports } from './core/reports.js';

const LOG_PREFIX = '[Etsy Automation Tools]';
const PATH_POLL_MS = 1000;

export async function boot({ scope, createRouteLifecycle, handoff, assets = {}, engines = {} }) {
  if (scope.top !== scope.self) return null; // never run inside Etsy iframes
  if (scope.__etsyAutomationToolsBooted) return null; // one instance per document
  scope.__etsyAutomationToolsBooted = true;

  const gmStore = createGmStore(scope);
  const store = gmStore ?? createMemoryStore();
  const storage = createStorage(store);
  const settings = createSettings(storage.namespace('core'));
  await settings.load();
  const events = createEvents((error) => console.error(LOG_PREFIX, error));
  // Notification centre, version check and the list of sent reports (Settings › Notifications, Updates, Help).
  const core = storage.namespace('core');
  const notices = createNotices({ store: core, settings, scope });
  const updates = createUpdates({ gm: scope.GM, store: core, appVersion: META.version, settings });
  const reports = createReports({ gm: scope.GM, store: core });
  await Promise.all([notices.load(), updates.load(), reports.load()]).catch(() => {});
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

  // The edge button and drawer appear on seller pages only.
  let shell = null;
  const syncShell = () => {
    if (!shell || !scope.document) return;
    if (isSellerPath(scope.location.pathname)) { shell.mount(); shell.refresh(); } else shell.unmount();
  };

  const host = createHost({
    modules: TOOLS,
    createRouteLifecycle,
    location: scope.location,
    services: {
      storage, settings, events, migration, scope, assets, engines, notices,
      notify: (item) => notices.add(item),
      appVersion: META.version, persistent: Boolean(gmStore),
      isToolEnabled: (id) => settings.get().tools[id] !== false,
    },
    isEnabled: (id) => settings.get().tools[id] !== false,
    onError,
    onChange: syncShell,
  });
  shell = createShell({ scope, settings, host, storage, appVersion: META.version, migration, assets, notices, updates, reports });
  // A new version found by a check is announced once.
  updates.subscribe((state) => {
    if (updates.available() && state.latest && !notices.list().some((n) => n.event === 'newVersion' && n.detail.includes(state.latest))) {
      void notices.add({ event: 'newVersion', title: shell.t?.('nt.newVersion', { version: state.latest }) ?? `Etsy Automation Tools ${state.latest}`, detail: state.latest, page: 'settings:updates' });
    }
  });
  notices.subscribe(() => shell.refresh());
  events.on('tool:status', () => shell.refresh());
  await host.start();
  syncShell();
  // Tool routes are followed by the lifecycle; this catches moves between other Etsy pages.
  let lastPath = scope.location.pathname;
  scope.setInterval?.(() => {
    if (scope.location.pathname !== lastPath) { lastPath = scope.location.pathname; syncShell(); }
  }, PATH_POLL_MS);
  return { host, storage, settings, events, shell, notices, updates, reports };
}
