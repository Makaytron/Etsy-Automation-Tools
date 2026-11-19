// Host: decides which tool runs on the current Etsy page.
//
// One SPA route lifecycle (shared/lifecycle/spa-lifecycle.js, inlined by the
// build) watches every supported path. When the route changes the host
// unmounts the previous tool before mounting the next one, so two tools never
// own the page at the same time. Each mount receives a route token; a tool
// must check `ctx.isCurrent()` before acting after an await, which makes
// stale work from a previous page harmless.

import { matchRoute, isSupportedPath } from './routes.js';

/**
 * @typedef {object} ToolModule
 * @property {string} id
 * @property {string} name
 * @property {(ctx: object) => (void|Promise<void>)} mount
 * @property {(ctx: object) => (void|Promise<void>)} [unmount]
 * @property {(ctx: object) => (void|Promise<void>)} [routeChange] same tool, new URL
 */

export function createHost({ modules, createRouteLifecycle, location, services, isEnabled = () => true, onError }) {
  const byId = new Map(modules.map((m) => [m.id, m]));
  if (byId.size !== modules.length) throw new Error('Duplicate tool id');
  const report = onError ?? ((code, error) => console.error('[Etsy Automation Tools]', code, error));

  const lifecycle = createRouteLifecycle(isSupportedPath);
  let active = null; // { module, route, ctx }

  function contextFor(module, route) {
    const token = lifecycle.capture();
    const ctx = { ...services, tool: module.id, route, isCurrent: () => lifecycle.current(token) && active?.ctx === ctx };
    return ctx;
  }

  async function stopActive() {
    if (!active) return;
    const { module, ctx } = active;
    active = null;
    try { await module.unmount?.(ctx); } catch (error) { report('module_unmount', error); }
  }

  async function reconcile() {
    const route = matchRoute(location.pathname);
    const module = route ? byId.get(route.module) : null;
    const wanted = module && isEnabled(module.id) ? module : null;
    if (active && active.module === wanted) {
      // Same tool, new URL: a fresh context makes work tied to the old URL stale.
      const ctx = contextFor(wanted, route);
      active.route = route;
      active.ctx = ctx;
      try { await wanted.routeChange?.(ctx); } catch (error) { report('module_mount', error); }
      return;
    }
    await stopActive();
    if (!wanted) return;
    const ctx = contextFor(wanted, route);
    active = { module: wanted, route, ctx };
    try { await wanted.mount(ctx); } catch (error) { report('module_mount', error); if (active?.ctx === ctx) active = null; }
  }

  return {
    start() {
      return lifecycle.start({ enter: reconcile, change: reconcile, leave: stopActive });
    },
    async stop() { await stopActive(); lifecycle.dispose(); },
    reconcile,
    get activeTool() { return active?.module.id ?? null; },
    get activeRoute() { return active?.route.id ?? null; },
  };
}
