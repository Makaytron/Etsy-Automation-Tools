// The five tools of the unified script.
//
// A tool is either moved in (`migrated: true`) or still a placeholder that
// points to its standalone script. Order of moving in (phase 5):
// Sale -> Ads -> KW -> Messages -> Listing. Placeholder tools keep running in
// their standalone scripts until then.

import { createSaleManagerModule } from './sale-manager.js';
import { createAdsKeywordManagerModule } from './ads-keyword-manager.js';
import { createKeywordMarketAnalyzerModule } from './keyword-market-analyzer.js';
import { createAdoptedToolModule } from './adopted-tool.js';

// Credentials inside Message Assistant's stored objects; the same paths the transfer strips
// (shared/migration/handoff.js, kept equal by a test). They live under eat:secret:.
export const MESSAGE_ASSISTANT_SECRETS = Object.freeze({ 'mema:settings': ['deeplApiKey', 'messageCenterAgentToken'], 'mema:providers': ['*.apiKey'] });

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
  createAdoptedToolModule({
    id: 'message-assistant', name: 'Message Assistant', standaloneRootId: 'makaytron-etsy-message-assistant',
    factoryKey: 'createMessageAssistant', versionKey: 'messageAssistantVersion', secrets: MESSAGE_ASSISTANT_SECRETS,
  }),
  createAdsKeywordManagerModule(),
  placeholder('listing-analyzer', 'Listing Analyzer', 'listing-analyzer'),
  createKeywordMarketAnalyzerModule(),
]);
