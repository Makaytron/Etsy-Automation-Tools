// A tool whose engine is an adopted standalone script (see tools/Unified-Adopt.mjs).
//
// Same guarantees as Sale Manager: the engine starts once per page after a
// short grace period, never while the standalone script runs on the same page,
// steps aside if that one appears later, stops when the tool is turned off, and
// keeps its data under its own namespace through the GM shim. Until the tool's
// new screens arrive, the engine shows its own panel. Not used by a tool right
// now; Listing Analyzer starts from it.

import { createScopedGm } from '../core/scoped-gm.js';

const STANDALONE_GRACE_MS = 1500;

/**
 * @param {object} o
 * @param {string} o.id               tool id (also its storage namespace)
 * @param {string} o.name
 * @param {string} o.standaloneRootId element id the standalone script adds to the page
 * @param {string} o.factoryKey       key of the engine factory in ctx.engines
 * @param {string} o.versionKey       key of the engine version in ctx.engines
 * @param {string} o.startMethod      engine method that starts it ('start' or 'initialize')
 * @param {object} [o.secrets]       credential paths per legacy key; kept under eat:secret: (see core/scoped-gm.js)
 */
export function createAdoptedToolModule({ id, name, standaloneRootId, factoryKey, versionKey, startMethod = 'start', secrets = {} }) {
  const state = { engine: null, starting: null, standalone: false, observer: null };
  const standalonePresent = (doc) => Boolean(doc.getElementById(standaloneRootId));

  function watch(doc, ctx) {
    if (state.observer || typeof MutationObserver !== 'function') return;
    state.observer = new MutationObserver(() => {
      if (!state.standalone && standalonePresent(doc)) {
        state.standalone = true; // the engine's route gate closes and its own lifecycle suspends it
        ctx.events?.emit('tool:status', { tool: id, state: 'standalone' });
      }
    });
    state.observer.observe(doc.documentElement, { childList: true, subtree: true });
  }

  async function start(ctx) {
    const scope = ctx.scope;
    const doc = scope.document;
    await new Promise((resolve) => scope.setTimeout(resolve, STANDALONE_GRACE_MS));
    watch(doc, ctx);
    if (standalonePresent(doc)) {
      state.standalone = true;
      ctx.events?.emit('tool:status', { tool: id, state: 'standalone' });
      return;
    }
    const gm = createScopedGm({
      gm: scope.GM, namespace: id, doc,
      info: { name: `Etsy Automation Tools · ${name}`, version: ctx.engines[versionKey] },
      resources: { makaytronLogo: ctx.assets?.logo ?? '' },
      secrets,
    });
    state.engine = await ctx.engines[factoryKey]({
      GM: gm,
      xmlHttpRequest: (details) => scope.GM.xmlHttpRequest(details),
      isAllowed: () => !state.standalone && ctx.isToolEnabled(id),
      onChange: () => ctx.events?.emit('tool:status', { tool: id, state: 'running' }),
    });
    // The engine is running from here on, even while it waits for Etsy's page to finish loading.
    ctx.events?.emit('tool:status', { tool: id, state: 'running' });
    await state.engine[startMethod]();
  }

  return {
    id,
    name,
    legacyScriptId: id,
    storageNamespace: id,
    migrated: true,
    status: () => (state.standalone ? 'standalone' : state.engine ? 'running' : 'starting'),
    async mount(ctx) {
      if (!state.starting && ctx.scope?.GM && ctx.engines?.[factoryKey]) {
        state.starting = start(ctx).catch((error) => {
          state.starting = null;
          console.error(`[Etsy Automation Tools] ${name}`, error);
          ctx.events?.emit('error', { code: 'module_mount' });
        });
      }
    },
    async unmount() {
      // The engine's own route gate suspends it off its page or when the tool is turned off.
    },
  };
}
