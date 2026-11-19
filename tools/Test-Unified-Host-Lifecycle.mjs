// Runs the host against the real shared SPA lifecycle (shared/lifecycle/spa-lifecycle.js),
// the same source the build inlines into the userscript.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

import { createHost } from '../src/core/host.js';

function loadLifecycle() {
  const source = fs.readFileSync(new URL('../shared/lifecycle/spa-lifecycle.js', import.meta.url), 'utf8');
  const listeners = new Map();
  const timers = new Set();
  const location = { pathname: '/', href: 'https://www.etsy.com/' };
  const window = {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
    setInterval: (fn) => { timers.add(fn); return fn; },
    clearInterval: (fn) => timers.delete(fn),
  };
  const context = vm.createContext({ window, location, console, Promise });
  vm.runInContext(`${source}\nthis.createRouteLifecycle = createRouteLifecycle;`, context);
  const go = async (pathname) => {
    location.pathname = pathname;
    location.href = `https://www.etsy.com${pathname}`;
    await listeners.get('urlchange')?.();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { createRouteLifecycle: context.createRouteLifecycle, location, go };
}

test('host follows real SPA navigation across tools', async () => {
  const { createRouteLifecycle, location, go } = loadLifecycle();
  const log = [];
  const modules = ['sale-manager', 'message-assistant', 'listing-analyzer'].map((id) => ({
    id, name: id,
    mount: (ctx) => { log.push(`+${id}:${ctx.route.id}`); },
    unmount: () => { log.push(`-${id}`); },
    routeChange: (ctx) => { log.push(`~${id}:${ctx.route.id}`); },
  }));
  const host = createHost({ modules, createRouteLifecycle, location, services: {} });
  await host.start(); // starts on an unsupported page
  assert.equal(host.activeTool, null);
  await go('/your/shops/me/sales-discounts');
  await go('/messages/1');
  await go('/messages/2');
  await go('/c/home-and-living'); // leaves all tools
  await go('/your/shops/me/tools/listings');
  await host.stop();
  assert.deepEqual(log, [
    '+sale-manager:sale-manager.campaigns',
    '-sale-manager',
    '+message-assistant:message-assistant.conversations',
    '~message-assistant:message-assistant.conversations',
    '-message-assistant',
    '+listing-analyzer:listing-analyzer.listings',
    '-listing-analyzer',
  ]);
});
