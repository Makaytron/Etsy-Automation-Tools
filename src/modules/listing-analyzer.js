// Listing Analyzer inside the unified script.
//
// The engine is the standalone Listing Analyzer itself, adopted at build
// time (tools/Unified-Adopt-Listing-Analyzer.mjs). Its panel stays for the
// detailed work; the unified edge button replaces its floating launcher, and
// the new screens (listing-analyzer-ui.js) summarise its state, start its
// scan and open its panel at the right view.
//
// The engine starts after a short grace period, not at all while the
// standalone script runs on this page, and steps aside if that one appears.

import { createScopedGm } from '../core/scoped-gm.js';
import { renderLaDrawer, renderLaPage } from './listing-analyzer-ui.js';

export const LA_TOOL_ID = 'listing-analyzer';
export const STANDALONE_ROOT_ID = 'makaytron-etsy-listing-analyzer';
const STANDALONE_GRACE_MS = 1500;

const engineLanguage = (language) => (String(language ?? '').toLowerCase().startsWith('tr') ? 'tr' : 'en');

export function createListingAnalyzerModule() {
  const state = { engine: null, starting: null, standalone: false, observer: null, ctx: null, last: '', local: {} };

  const standalonePresent = (doc) => Boolean(doc.getElementById(STANDALONE_ROOT_ID));
  const emit = (status) => state.ctx?.events?.emit('tool:status', { tool: LA_TOOL_ID, state: status });

  function watchForStandalone(doc) {
    if (state.observer || typeof MutationObserver !== 'function') return;
    state.observer = new MutationObserver(() => {
      if (!state.standalone && standalonePresent(doc)) {
        state.standalone = true; // the engine's route gate closes and its own lifecycle suspends it
        emit('standalone');
      }
    });
    state.observer.observe(doc.documentElement, { childList: true, subtree: true });
  }

  function changed() {
    if (!state.engine) return;
    const text = JSON.stringify(state.engine.snapshot());
    if (text === state.last) return;
    state.last = text;
    emit('running');
  }

  async function start(ctx) {
    const doc = ctx.scope.document;
    await new Promise((resolve) => ctx.scope.setTimeout(resolve, STANDALONE_GRACE_MS));
    watchForStandalone(doc);
    if (standalonePresent(doc)) {
      state.standalone = true;
      emit('standalone');
      return;
    }
    const gm = createScopedGm({
      gm: ctx.scope.GM, namespace: LA_TOOL_ID, doc,
      info: { name: 'Etsy Automation Tools · Listing Analyzer', version: ctx.engines.listingAnalyzerVersion },
      resources: { makaytronLogo: ctx.assets?.logo ?? '' },
    });
    state.engine = await ctx.engines.createListingAnalyzer({
      GM: gm,
      xmlHttpRequest: (details) => ctx.scope.GM.xmlHttpRequest(details),
      isAllowed: () => !state.standalone && ctx.isToolEnabled(LA_TOOL_ID),
      onChange: () => ctx.scope.setTimeout(changed, 0),
    });
    emit('running');
    await state.engine.start();
    changed();
  }

  function actionsFor(ui) {
    const engine = state.engine;
    const la = engine.la;
    const run = (fn) => Promise.resolve().then(fn).catch((error) => { console.error('[Etsy Automation Tools] Listing Analyzer', error); return false; });
    // The engine's panel opens on the page, so the drawer and workspace step out of its way.
    const inPanel = (fn) => { ui.hide?.(); return run(fn); };
    return {
      openPanel: (view) => inPanel(() => engine.openPanel(view)),
      openRecord: (id, kind) => inPanel(() => la.openRecord(id, kind)),
      toggleCollection: () => run(() => engine.toggleCollection()),
      scanPage: () => run(() => engine.scanPage()),
      exportData: () => run(() => engine.exportData()),
      openDetails: () => ui.openWorkspace?.(`tool:${LA_TOOL_ID}`),
      select: (ids, on) => la.select(ids, on),
      buildQueue: () => run(() => la.buildQueue()),
      goCurrent: () => run(() => la.goCurrent()),
      apply: () => run(() => la.apply()),
      publish: () => run(() => la.publish()),
      verifyPublish: () => run(() => la.verifyPublish()),
      deactivate: () => run(() => la.deactivate()),
      verifyDeactivate: () => run(() => la.verifyDeactivate()),
      skip: () => run(() => la.skip()),
      stop: () => run(() => la.stop()),
      recover: () => run(() => la.recover()),
      copyAiRequest: () => run(() => la.copyAiRequest()),
      copyAiTemplate: () => run(() => la.copyAiTemplate()),
      importAi: (text) => run(() => la.importAi(text)).then((r) => r || { ok: false, text: '' }),
      saveThresholds: (values) => run(() => la.saveThresholds(values)).then((r) => r || { valid: false, reason: 'storage' }),
      setLocal: (patch) => { Object.assign(state.local, patch); if (ui.onTab) ui.onTab(ui.tab); else emit('running'); },
    };
  }
  function view(ui) {
    if (state.standalone || !state.engine) return null;
    const snap = state.engine.snapshot();
    if (!snap.collecting) void state.engine.syncLanguage?.(engineLanguage(ui.language));
    return snap;
  }

  return {
    id: LA_TOOL_ID,
    name: 'Listing Analyzer',
    legacyScriptId: LA_TOOL_ID,
    storageNamespace: LA_TOOL_ID,
    migrated: true,
    status: () => (state.standalone ? 'standalone' : state.engine ? 'running' : 'starting'),
    /** Shortcut "Scan every listing page" (Settings › Shortcuts): starts or continues the scan on the Listings page. */
    shortcut(action) {
      if (action !== 'laScanAll' || state.standalone || !state.engine) return false;
      const snap = state.engine.snapshot();
      if (snap.route !== 'listings' || snap.collecting) return false;
      void Promise.resolve(state.engine.toggleCollection()).catch(() => {});
      return true;
    },
    renderDrawer(ui) {
      const snap = view(ui);
      return snap ? renderLaDrawer(ui.doc, { snap, language: ui.language, actions: actionsFor(ui) }) : null;
    },
    renderPage(ui) {
      const snap = view(ui);
      return snap && state.engine.la ? renderLaPage(ui.doc, { snap, view: state.engine.la.view(), language: ui.language, actions: actionsFor(ui), tab: ui.tab, onTab: ui.onTab, local: state.local }) : null;
    },
    async mount(ctx) {
      state.ctx = ctx;
      if (!state.starting && ctx.scope?.GM && ctx.engines?.createListingAnalyzer) {
        state.starting = start(ctx).catch((error) => {
          state.starting = null;
          console.error('[Etsy Automation Tools] Listing Analyzer', error);
          ctx.events?.emit('error', { code: 'module_mount' });
        });
      }
    },
    async unmount() {
      // The engine's own route gate suspends it off its pages or when the tool is turned off.
    },
  };
}
