// Sale Manager inside the unified script.
//
// The automation engine is the standalone Sale Manager itself, adopted at
// build time (tools/Unified-Adopt-Sale-Manager.mjs) so its tested behaviour
// is unchanged: every campaign is verified in the Etsy list, an unverifiable
// step stops the series, and a reload resumes only with the user's consent.
// The new screens (sale-manager-ui.js) read the engine's snapshot and call its
// own actions; the engine's old panel stays hidden. Its short notices (toasts)
// still show, because they carry the engine's safety messages.
//
// Two engines must never create campaigns on the same page. If the
// standalone Sale Manager is also installed and running here, the unified
// engine does not start, and it steps aside if the standalone one appears.

import { createScopedGm } from '../core/scoped-gm.js';
import { renderSaleDrawer, renderSalePage, confirmSaleStart } from './sale-manager-ui.js';

export const STANDALONE_ROOT_ID = 'eda-batch-root';
export const ENGINE_ROOT_ID = 'eat-sale-batch-root';
const STANDALONE_GRACE_MS = 1500;

export function createSaleManagerModule() {
  const state = { engine: null, starting: null, standalone: false, observer: null, ctx: null, lastSnapshot: '' };

  const standalonePresent = (doc) => Boolean(doc.getElementById(STANDALONE_ROOT_ID));

  function watchForStandalone(doc, ctx) {
    if (state.observer || typeof MutationObserver !== 'function') return;
    state.observer = new MutationObserver(() => {
      if (!state.standalone && standalonePresent(doc)) {
        state.standalone = true; // the engine's route gate now closes and its own lifecycle suspends it
        ctx.events?.emit('tool:status', { tool: 'sale-manager', state: 'standalone' });
      }
    });
    state.observer.observe(doc.documentElement, { childList: true, subtree: true });
  }

  function onEngineChange() {
    const ctx = state.ctx;
    if (!state.engine || !ctx) return;
    // Redraw only when what the screens show has changed.
    const text = JSON.stringify(state.engine.snapshot());
    if (text === state.lastSnapshot) return;
    state.lastSnapshot = text;
    ctx.events?.emit('tool:status', { tool: 'sale-manager', state: 'running' });
  }

  async function start(ctx) {
    const doc = ctx.scope.document;
    // Give a standalone copy, which loads at the same time, the chance to show itself first.
    await new Promise((resolve) => ctx.scope.setTimeout(resolve, STANDALONE_GRACE_MS));
    if (standalonePresent(doc)) {
      state.standalone = true;
      ctx.events?.emit('tool:status', { tool: 'sale-manager', state: 'standalone' });
      watchForStandalone(doc, ctx);
      return;
    }
    watchForStandalone(doc, ctx);
    const gm = createScopedGm({
      gm: ctx.scope.GM, namespace: 'sale-manager', doc,
      info: { name: 'Etsy Automation Tools · Sale Manager', version: ctx.engines.saleManagerVersion },
      resources: { makaytronLogo: ctx.assets?.logo ?? '' },
    });
    // The new screens replace the engine's own panel.
    gm.addStyle(`#${ENGINE_ROOT_ID}{display:none!important}`);
    state.engine = await ctx.engines.createSaleManager({
      GM: gm,
      isAllowed: () => !state.standalone && ctx.isToolEnabled('sale-manager'),
      onChange: () => ctx.scope.setTimeout(onEngineChange, 0),
    });
    await state.engine.initialize();
    onEngineChange();
  }

  function actionsFor(ui) {
    const engine = state.engine;
    const run = (fn) => Promise.resolve().then(fn).catch((error) => console.error('[Etsy Automation Tools] Sale Manager', error));
    return {
      retry: () => run(() => engine.retry()),
      skip: () => run(() => engine.skip()),
      stop: () => run(() => engine.stop()),
      updateConfig: (patch) => run(() => engine.updateConfig(patch)),
      downloadCsv: () => run(() => engine.downloadCsv()),
      downloadExcel: () => run(() => engine.downloadExcel()),
      openEtsy: () => run(() => engine.openCreateSale()),
      openPage: () => ui.openWorkspace?.('tool:sale-manager'),
      say: (message) => ui.say?.(message),
      confirmStart: (trigger) => confirmSaleStart(ui.doc, ui.container, {
        snap: engine.snapshot(), language: ui.language, returnFocus: trigger, onStart: () => run(() => engine.start()),
      }),
    };
  }

  return {
    id: 'sale-manager',
    name: 'Sale Manager',
    legacyScriptId: 'sale-manager',
    storageNamespace: 'sale-manager',
    migrated: true,
    status: () => (state.standalone ? 'standalone' : state.engine ? 'running' : 'starting'),
    /** Drawer section; null keeps the generic status text. */
    renderDrawer(ui) {
      if (state.standalone || !state.engine) return null;
      return renderSaleDrawer(ui.doc, { snap: state.engine.snapshot(), language: ui.language, actions: actionsFor(ui) });
    },
    /** Workspace page; null keeps the generic tool page. */
    renderPage(ui) {
      if (state.standalone || !state.engine) return null;
      return renderSalePage(ui.doc, { snap: state.engine.snapshot(), language: ui.language, actions: actionsFor(ui), tab: ui.tab, onTab: ui.onTab, message: ui.message });
    },
    async mount(ctx) {
      state.ctx = ctx;
      // The engine follows Etsy navigation itself; it is created once per page load.
      // Starting does not block the host: the drawer appears right away.
      if (!state.starting && ctx.scope?.GM && ctx.engines?.createSaleManager) {
        state.starting = start(ctx).catch((error) => {
          state.starting = null;
          console.error('[Etsy Automation Tools] Sale Manager', error);
          ctx.events?.emit('error', { code: 'module_mount' });
        });
      }
    },
    async unmount() {
      // Nothing to do: the engine's own route gate suspends it off its page or when the tool is turned off.
    },
  };
}
