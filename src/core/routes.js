// Route table for the unified Etsy Automation Tools script.
//
// Each pattern is copied from the RUNTIME_ROUTE_PATTERN of the standalone
// production script it replaces, so the unified script activates on exactly
// the same Etsy pages. `template` is a redacted, shop-name-free form of the
// path that is safe to show in diagnostics.

export const ROUTES = Object.freeze([
  Object.freeze({
    id: 'sale-manager.campaigns',
    module: 'sale-manager',
    pattern: /^\/your\/shops\/me\/sales-discounts(?:\/|$)/,
    template: '/your/shops/me/sales-discounts',
  }),
  Object.freeze({
    id: 'ads-keyword-manager.listing-ads',
    module: 'ads-keyword-manager',
    pattern: /^\/your\/shops\/[^/]+\/advertising\/listings\/[^/]+(?:\/|$)/,
    template: '/your/shops/:shop/advertising/listings/:campaign',
  }),
  Object.freeze({
    id: 'keyword-market-analyzer.insights',
    module: 'keyword-market-analyzer',
    pattern: /^\/your\/shops\/[^/]+\/marketplace-insights(?:\/search)?\/?$/,
    template: '/your/shops/:shop/marketplace-insights',
  }),
  Object.freeze({
    id: 'listing-analyzer.listings',
    module: 'listing-analyzer',
    pattern: /^\/your\/shops\/[^/]+\/tools\/listings\/?$/,
    template: '/your/shops/:shop/tools/listings',
  }),
  Object.freeze({
    id: 'listing-analyzer.editor',
    module: 'listing-analyzer',
    pattern: /^\/your\/shops\/[^/]+\/listing-editor\/edit\/\d+\/?$/,
    template: '/your/shops/:shop/listing-editor/edit/:listing',
  }),
  Object.freeze({
    id: 'message-assistant.conversations',
    module: 'message-assistant',
    pattern: /^\/(?:messages|conversations)(?:\/|$)/,
    template: '/messages',
  }),
  Object.freeze({
    id: 'message-assistant.orders',
    module: 'message-assistant',
    pattern: /^\/your\/orders\/sold(?:\/|$)/,
    template: '/your/orders/sold',
  }),
  Object.freeze({
    id: 'message-assistant.dashboard',
    module: 'message-assistant',
    pattern: /^\/your\/shops\/[^/]+\/dashboard(?:\/|$)/,
    template: '/your/shops/:shop/dashboard',
  }),
]);

/** Returns the route for an Etsy pathname, or null when no tool runs there. */
export function matchRoute(pathname) {
  if (typeof pathname !== 'string') return null;
  return ROUTES.find((route) => route.pattern.test(pathname)) ?? null;
}

/** True when any tool of the unified script handles this pathname. */
export function isSupportedPath(pathname) {
  return matchRoute(pathname) !== null;
}

/** Shop-name-free description of the current page for diagnostics. */
export function describePath(pathname) {
  const route = matchRoute(pathname);
  return route ? { routeId: route.id, template: route.template } : { routeId: 'unsupported', template: null };
}
