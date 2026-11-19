// The five tools of the unified script.
//
// A tool is either moved in (`migrated: true`) or still a placeholder that
// points to its standalone script. Order of moving in (phase 5):
// Sale -> Ads -> KW -> Messages -> Listing. Placeholder tools keep running in
// their standalone scripts until then.

import { createSaleManagerModule } from './sale-manager.js';

function placeholder(id, name, legacyScriptId) {
  return Object.freeze({
    id,
    name,
    legacyScriptId,
    storageNamespace: id,
    migrated: false,
    status: () => 'not-migrated',
    async mount(ctx) { ctx.events?.emit('tool:placeholder', { tool: id }); },
    async unmount() {},
  });
}

export const TOOLS = Object.freeze([
  createSaleManagerModule(),
  placeholder('message-assistant', 'Message Assistant', 'message-assistant'),
  placeholder('ads-keyword-manager', 'Ads Keyword Manager', 'ads-keyword-manager'),
  placeholder('listing-analyzer', 'Listing Analyzer', 'listing-analyzer'),
  placeholder('keyword-market-analyzer', 'Keyword & Market Analyzer', 'keyword-market-analyzer'),
]);
