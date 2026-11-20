// Message Assistant inside the unified script.
//
// The engine is the standalone Message Assistant itself, adopted at build
// time (tools/Unified-Adopt-Message-Assistant.mjs). Its panel stays for the
// detailed work; the unified edge button replaces its floating launcher, and
// the new screens (message-assistant-ui.js) summarise its state and open its
// panel at the right section. Its API keys and token are kept under
// eat:secret: by the GM shim (core/scoped-gm.js).
//
// The engine starts after a short grace period, not at all while the
// standalone script runs on this page, and steps aside if that one appears.

import { createScopedGm } from '../core/scoped-gm.js';
import { renderMaDrawer, renderMaPage } from './message-assistant-ui.js';

export const MA_TOOL_ID = 'message-assistant';
export const STANDALONE_ROOT_ID = 'makaytron-etsy-message-assistant';
const STANDALONE_GRACE_MS = 1500;

export function createMessageAssistantModule({ secrets }) {
  const state = { engine: null, starting: null, standalone: false, observer: null, ctx: null, last: '' };

  const standalonePresent = (doc) => Boolean(doc.getElementById(STANDALONE_ROOT_ID));
  const emit = (status) => state.ctx?.events?.emit('tool:status', { tool: MA_TOOL_ID, state: status });

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
      gm: ctx.scope.GM, namespace: MA_TOOL_ID, doc,
      info: { name: 'Etsy Automation Tools · Message Assistant', version: ctx.engines.messageAssistantVersion },
      resources: { makaytronLogo: ctx.assets?.logo ?? '' },
      secrets,
    });
    state.engine = await ctx.engines.createMessageAssistant({
      GM: gm,
      xmlHttpRequest: (details) => ctx.scope.GM.xmlHttpRequest(details),
      isAllowed: () => !state.standalone && ctx.isToolEnabled(MA_TOOL_ID),
      onChange: () => ctx.scope.setTimeout(changed, 0),
    });
    emit('running');
    await state.engine.start();
    // "AI and translation services" in the setup and in Settings decides the engine's automatic translation preview.
    const applyAutoPreview = () => state.engine?.ai?.setAutoPreview?.(ctx.settings.get().ai.autoTranslate).catch(() => {});
    await applyAutoPreview();
    ctx.settings.subscribe?.(() => { void applyAutoPreview(); });
    changed();
  }

  function actionsFor(ui) {
    const engine = state.engine;
    const run = (fn) => Promise.resolve().then(fn).catch((error) => console.error('[Etsy Automation Tools] Message Assistant', error));
    // The engine's panel opens on the page, so the drawer and workspace step out of its way.
    const inPanel = (fn) => { ui.hide?.(); return run(fn); };
    return {
      openPanel: (section) => inPanel(() => engine.openPanel(section)),
      translateLast: () => inPanel(() => engine.translateLast()),
      generateReply: () => inPanel(() => engine.generateReply()),
      openDetails: () => ui.openWorkspace?.(`tool:${MA_TOOL_ID}`),
    };
  }

  const view = () => (state.standalone || !state.engine ? null : state.engine.snapshot());

  return {
    id: MA_TOOL_ID,
    name: 'Message Assistant',
    legacyScriptId: MA_TOOL_ID,
    storageNamespace: MA_TOOL_ID,
    migrated: true,
    status: () => (state.standalone ? 'standalone' : state.engine ? 'running' : 'starting'),
    /** Provider management for Settings › AI providers, while the engine runs on this page. */
    aiProviders: () => (state.standalone ? null : state.engine?.ai ?? null),
    renderDrawer(ui) {
      const snap = view();
      return snap ? renderMaDrawer(ui.doc, { snap, language: ui.language, actions: actionsFor(ui) }) : null;
    },
    renderPage(ui) {
      const snap = view();
      return snap ? renderMaPage(ui.doc, { snap, language: ui.language, actions: actionsFor(ui) }) : null;
    },
    async mount(ctx) {
      state.ctx = ctx;
      if (!state.starting && ctx.scope?.GM && ctx.engines?.createMessageAssistant) {
        state.starting = start(ctx).catch((error) => {
          state.starting = null;
          console.error('[Etsy Automation Tools] Message Assistant', error);
          ctx.events?.emit('error', { code: 'module_mount' });
        });
      }
    },
    async unmount() {
      // The engine's own route gate suspends it off its pages or when the tool is turned off.
    },
  };
}
