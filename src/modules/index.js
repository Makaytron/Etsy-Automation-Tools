// The five tools of the unified script.
//
// Phase 1 only declares each tool: identity, the standalone script it
// replaces, and its storage namespace. `mount`/`unmount` are placeholders
// until each tool's code moves here in phase 5 (order: Sale -> Ads -> KW ->
// Messages -> Listing). The standalone scripts stay the production code until
// then.

function placeholder(id, name, legacyScriptId) {
  return Object.freeze({
    id,
    name,
    legacyScriptId,
    storageNamespace: id,
    migrated: false,
    async mount(ctx) { ctx.events?.emit('tool:placeholder', { tool: id }); },
    async unmount() {},
  });
}

export const TOOLS = Object.freeze([
  placeholder('sale-manager', 'Sale Manager', 'sale-manager'),
  placeholder('message-assistant', 'Message Assistant', 'message-assistant'),
  placeholder('ads-keyword-manager', 'Ads Keyword Manager', 'ads-keyword-manager'),
  placeholder('listing-analyzer', 'Listing Analyzer', 'listing-analyzer'),
  placeholder('keyword-market-analyzer', 'Keyword & Market Analyzer', 'keyword-market-analyzer'),
]);
