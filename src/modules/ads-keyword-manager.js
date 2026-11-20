// Ads Keyword Manager inside the unified script.
//
// The engine is the standalone Ads Keyword Manager itself, adopted at build
// time (tools/Unified-Adopt-Ads-Keyword-Manager.mjs), so its matching rules
// and safety checks are unchanged. The new screens (ads-keyword-manager-ui.js)
// read its snapshot and call its own actions; its old panel stays hidden. Its
// notices (toasts), confirmations and rule editor still show, because they
// carry the engine's safety messages.
//
// Two engines must never change keywords on the same page: the engine starts
// after a short grace period, not at all while the standalone script runs
// here, and steps aside if that one appears later.

import { createScopedGm } from '../core/scoped-gm.js';
import { renderAdsDrawer, renderAdsPage } from './ads-keyword-manager-ui.js';

export const ADS_TOOL_ID = 'ads-keyword-manager';
export const STANDALONE_ROOT_ID = 'makaytron-ad-wordlist';
export const ENGINE_ROOT_ID = 'eat-ads-wordlist';
const STANDALONE_GRACE_MS = 1500;

/** The engine speaks Turkish or English; anything else gets English notices. */
const engineLanguage = (language) => (String(language ?? '').toLowerCase().startsWith('tr') ? 'tr' : 'en');

export function createAdsKeywordManagerModule() {
  const state = { engine: null, starting: null, standalone: false, observer: null, ctx: null, last: '', rules: null, rulesLoading: null, lastIdle: true, matches: null, matchesLoading: null, lastState: '', wordlist: { query: '', editing: -1 } };

  const standalonePresent = (doc) => Boolean(doc.getElementById(STANDALONE_ROOT_ID));
  const emit = (status) => state.ctx?.events?.emit('tool:status', { tool: ADS_TOOL_ID, state: status });

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

  function loadRules() {
    if (!state.engine || state.rulesLoading) return state.rulesLoading;
    state.rulesLoading = state.engine.rules()
      .then((rules) => { state.rules = rules; })
      .catch((error) => console.error('[Etsy Automation Tools] Ads Keyword Manager', error))
      .finally(() => { state.rulesLoading = null; onEngineChange(); });
    return state.rulesLoading;
  }

  /** The word list may have changed after an update, a restore or the editor: read it again once things are idle. */
  function refreshRulesWhenIdle(snap) {
    if (snap.busy || snap.editorOpen) { state.lastIdle = false; return; }
    if (!state.lastIdle && !state.rulesLoading) { state.lastIdle = true; void loadRules(); }
  }

  /** The matching rows of this page (Ads-Overview table); read again whenever the page or the list changes. */
  function loadMatches() {
    if (!state.engine?.matches || state.matchesLoading) return state.matchesLoading;
    state.matchesLoading = state.engine.matches()
      .then((matches) => { state.matches = matches; })
      .catch(() => {})
      .finally(() => { state.matchesLoading = null; const text = JSON.stringify([state.engine.snapshot(), state.rules, state.matches]); if (text !== state.last) { state.last = text; emit('running'); } });
    return state.matchesLoading;
  }

  function onEngineChange() {
    if (!state.engine) return;
    const snap = state.engine.snapshot();
    refreshRulesWhenIdle(snap);
    announce(snap);
    const text = JSON.stringify([snap, state.rules, state.matches]);
    if (text === state.last) return;
    state.last = text;
    if (!snap.busy) void loadMatches();
    emit('running');
  }

  // "Scan finished" after an all-pages run ends.
  function announce(snap) {
    const was = state.lastState;
    state.lastState = snap.status.state;
    if (was === 'running' && snap.status.state === 'success') {
      void state.ctx?.notify?.({ event: 'scanDone', tool: ADS_TOOL_ID, title: snap.status.title, detail: snap.status.message, page: `tool:${ADS_TOOL_ID}` });
    }
  }

  async function start(ctx) {
    const doc = ctx.scope.document;
    // Give a standalone copy, which loads at the same time, the chance to show itself first.
    await new Promise((resolve) => ctx.scope.setTimeout(resolve, STANDALONE_GRACE_MS));
    watchForStandalone(doc);
    if (standalonePresent(doc)) {
      state.standalone = true;
      emit('standalone');
      return;
    }
    const gm = createScopedGm({
      gm: ctx.scope.GM, namespace: ADS_TOOL_ID, doc,
      info: { name: 'Etsy Automation Tools · Ads Keyword Manager', version: ctx.engines.adsKeywordManagerVersion },
      resources: { makaytronLogo: ctx.assets?.logo ?? '' },
    });
    // The new screens replace the engine's own panel.
    gm.addStyle(`#${ENGINE_ROOT_ID}{display:none!important}`);
    // The engine's notices follow the unified interface language.
    const language = ctx.settings?.get?.().language;
    if (language) await gm.setValue('adWordlistLanguage', engineLanguage(language));
    state.engine = await ctx.engines.createAdsKeywordManager({
      GM: gm,
      xmlHttpRequest: (details) => ctx.scope.GM.xmlHttpRequest(details),
      isAllowed: () => !state.standalone && ctx.isToolEnabled(ADS_TOOL_ID),
      onChange: () => ctx.scope.setTimeout(onEngineChange, 0),
    });
    emit('running');
    void loadRules();
    await state.engine.start();
  }

  function actionsFor(ui) {
    const engine = state.engine;
    const run = (fn) => Promise.resolve().then(fn).catch((error) => console.error('[Etsy Automation Tools] Ads Keyword Manager', error));
    return {
      closePage: () => run(() => engine.closePage()),
      openPage: () => run(() => engine.openPage()),
      closeAllPages: () => run(() => engine.closeAllPages()),
      updateList: () => run(() => engine.updateList()),
      restoreBackup: () => run(() => engine.restoreBackup()),
      // The rule editor is the engine's own dialog on the page, so the unified screens step out of its way.
      editRules: () => { ui.hide?.(); return run(() => engine.editRules()); },
      openDetails: () => ui.openWorkspace?.(`tool:${ADS_TOOL_ID}`),
      toggleOne: (keyword, on) => run(async () => { await engine.toggleOne?.(keyword, on); await loadMatches(); }),
      refreshMatches: () => loadMatches(),
      say: (message) => ui.say?.(message),
      wordlistState: () => state.wordlist,
      setWordlistState: (patch) => { state.wordlist = { ...state.wordlist, ...patch }; ui.onTab?.('wordlist'); },
      saveRules: async (list) => { const result = await engine.saveRules?.(list); await loadRules(); await loadMatches(); return result ?? { ok: false }; },
    };
  }

  function view(ui) {
    if (state.standalone || !state.engine) return null;
    void state.engine.syncLanguage?.(engineLanguage(ui.language));
    const snap = state.engine.snapshot();
    refreshRulesWhenIdle(snap);
    return snap;
  }

  return {
    id: ADS_TOOL_ID,
    name: 'Ads Keyword Manager',
    legacyScriptId: ADS_TOOL_ID,
    storageNamespace: ADS_TOOL_ID,
    migrated: true,
    status: () => (state.standalone ? 'standalone' : state.engine ? 'running' : 'starting'),
    /** Shortcuts "Turn off the matches on this page" and "Scan every page" (Settings › Shortcuts). */
    shortcut(action) {
      if (state.standalone || !state.engine) return false;
      if (action === 'adsClosePage') { void Promise.resolve(state.engine.closePage()).catch(() => {}); return true; }
      if (action === 'adsScanAll') { void Promise.resolve(state.engine.closeAllPages()).catch(() => {}); return true; }
      return false;
    },
    /** Drawer section; null keeps the generic status text. */
    renderDrawer(ui) {
      const snap = view(ui);
      return snap ? renderAdsDrawer(ui.doc, { snap, language: ui.language, actions: actionsFor(ui) }) : null;
    },
    /** Workspace page; null keeps the generic tool page. */
    renderPage(ui) {
      const snap = view(ui);
      if (snap && !state.matches) void loadMatches();
      return snap ? renderAdsPage(ui.doc, { snap, rules: state.rules, matches: state.matches, language: ui.language, actions: actionsFor(ui), tab: ui.tab, onTab: ui.onTab, shortcuts: state.ctx?.settings?.get().shortcuts }) : null;
    },
    async mount(ctx) {
      state.ctx = ctx;
      // The engine follows Etsy navigation itself; it is created once per page load.
      if (!state.starting && ctx.scope?.GM && ctx.engines?.createAdsKeywordManager) {
        state.starting = start(ctx).catch((error) => {
          state.starting = null;
          console.error('[Etsy Automation Tools] Ads Keyword Manager', error);
          ctx.events?.emit('error', { code: 'module_mount' });
        });
      }
    },
    async unmount() {
      // The engine's own route gate suspends it off its page or when the tool is turned off.
    },
  };
}
