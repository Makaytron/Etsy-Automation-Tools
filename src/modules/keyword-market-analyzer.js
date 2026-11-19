// Keyword & Market Analyzer inside the unified script.
//
// The engine is the standalone Keyword & Market Analyzer itself, adopted at
// build time (tools/Unified-Adopt-Keyword-Market-Analyzer.mjs), so its page
// reading, scoring and research protocol are unchanged. It still adds its
// small metric badges next to the keywords in Etsy's table. The new screens
// (keyword-market-analyzer-ui.js) read its snapshot and call its own actions;
// its old panel stays hidden.
//
// The engine starts after a short grace period, not at all while the
// standalone script runs on this page, and steps aside if that one appears.

import { createScopedGm } from '../core/scoped-gm.js';
import { renderKwDrawer, renderKwPage } from './keyword-market-analyzer-ui.js';

export const KW_TOOL_ID = 'keyword-market-analyzer';
export const STANDALONE_ROOT_ID = 'makaytron-etsy-keyword-market-analyzer';
export const ENGINE_ROOT_ID = 'eat-kw-market-analyzer';
const STANDALONE_GRACE_MS = 1500;

const engineLanguage = (language) => (String(language ?? '').toLowerCase().startsWith('tr') ? 'tr' : 'en');

export function createKeywordMarketAnalyzerModule() {
  const state = { engine: null, starting: null, standalone: false, observer: null, ctx: null, last: '', data: null, loading: null, reload: false };

  const standalonePresent = (doc) => Boolean(doc.getElementById(STANDALONE_ROOT_ID));
  const emit = (status) => state.ctx?.events?.emit('tool:status', { tool: KW_TOOL_ID, state: status });

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

  /** Saved research and the research queue live in storage; read them again after each change. */
  function loadData() {
    if (!state.engine) return null;
    if (state.loading) { state.reload = true; return state.loading; }
    state.loading = state.engine.data()
      .then((data) => { state.data = data; })
      .catch((error) => console.error('[Etsy Automation Tools] Keyword & Market Analyzer', error))
      .finally(() => {
        state.loading = null;
        if (state.reload) { state.reload = false; void loadData(); }
        changed();
      });
    return state.loading;
  }

  function changed() {
    if (!state.engine) return;
    const text = JSON.stringify([state.engine.snapshot(), state.data]);
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
      gm: ctx.scope.GM, namespace: KW_TOOL_ID, doc,
      info: { name: 'Etsy Automation Tools · Keyword & Market Analyzer', version: ctx.engines.keywordMarketAnalyzerVersion },
      resources: { makaytronLogo: ctx.assets?.logo ?? '' },
    });
    // The new screens replace the engine's own panel; its keyword badges on Etsy's table stay.
    gm.addStyle(`#${ENGINE_ROOT_ID}{display:none!important}`);
    // The engine's texts follow the unified interface language (its settings hold only the language).
    const language = ctx.settings?.get?.().language;
    if (language) await gm.setValue('ekma:v1:settings', { language: engineLanguage(language) });
    state.engine = await ctx.engines.createKeywordMarketAnalyzer({
      GM: gm,
      xmlHttpRequest: (details) => ctx.scope.GM.xmlHttpRequest(details),
      isAllowed: () => !state.standalone && ctx.isToolEnabled(KW_TOOL_ID),
      onChange: () => ctx.scope.setTimeout(() => { changed(); void loadData(); }, 0),
    });
    emit('running');
    void loadData();
    await state.engine.start();
  }

  function actionsFor(ui) {
    const engine = state.engine;
    const run = (fn) => Promise.resolve().then(fn).catch((error) => console.error('[Etsy Automation Tools] Keyword & Market Analyzer', error)).finally(() => loadData());
    return {
      search: (keyword) => run(() => engine.search(keyword)),
      capture: () => run(() => engine.capture()),
      exportJson: () => run(() => engine.exportJson()),
      importRequest: (text) => run(() => engine.importRequest(text)),
      copyResult: () => run(() => engine.copyResult()),
      downloadResult: () => run(() => engine.downloadResult()),
      cancel: () => run(() => engine.cancel()),
      clearData: () => run(() => engine.clearData()),
      openDetails: () => ui.openWorkspace?.(`tool:${KW_TOOL_ID}`),
    };
  }

  function view(ui) {
    if (state.standalone || !state.engine) return null;
    void state.engine.syncLanguage?.(engineLanguage(ui.language));
    return state.engine.snapshot();
  }

  return {
    id: KW_TOOL_ID,
    name: 'Keyword & Market Analyzer',
    legacyScriptId: KW_TOOL_ID,
    storageNamespace: KW_TOOL_ID,
    migrated: true,
    status: () => (state.standalone ? 'standalone' : state.engine ? 'running' : 'starting'),
    renderDrawer(ui) {
      const snap = view(ui);
      return snap ? renderKwDrawer(ui.doc, { snap, data: state.data, language: ui.language, actions: actionsFor(ui) }) : null;
    },
    renderPage(ui) {
      const snap = view(ui);
      return snap ? renderKwPage(ui.doc, { snap, data: state.data, language: ui.language, actions: actionsFor(ui), tab: ui.tab, onTab: ui.onTab }) : null;
    },
    async mount(ctx) {
      state.ctx = ctx;
      if (!state.starting && ctx.scope?.GM && ctx.engines?.createKeywordMarketAnalyzer) {
        state.starting = start(ctx).catch((error) => {
          state.starting = null;
          console.error('[Etsy Automation Tools] Keyword & Market Analyzer', error);
          ctx.events?.emit('error', { code: 'module_mount' });
        });
      }
    },
    async unmount() {
      // The engine's own route gate suspends it off its page or when the tool is turned off.
    },
  };
}
