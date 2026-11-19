// The five tools of the unified script.
//
// Every tool runs its standalone script as an adopted engine (see
// tools/Unified-Adopt*.mjs). Sale Manager, Ads Keyword Manager, Keyword &
// Market Analyzer and Message Assistant have the new screens; Listing
// Analyzer shows its own panel until its screens arrive.

import { createSaleManagerModule } from './sale-manager.js';
import { createAdsKeywordManagerModule } from './ads-keyword-manager.js';
import { createKeywordMarketAnalyzerModule } from './keyword-market-analyzer.js';
import { createMessageAssistantModule } from './message-assistant.js';
import { createAdoptedToolModule } from './adopted-tool.js';

// Credentials inside Message Assistant's stored objects; the same paths the transfer strips
// (shared/migration/handoff.js, kept equal by a test). They live under eat:secret:.
export const MESSAGE_ASSISTANT_SECRETS = Object.freeze({ 'mema:settings': ['deeplApiKey', 'messageCenterAgentToken'], 'mema:providers': ['*.apiKey'] });

export const TOOLS = Object.freeze([
  createSaleManagerModule(),
  createMessageAssistantModule({ secrets: MESSAGE_ASSISTANT_SECRETS }),
  createAdsKeywordManagerModule(),
  createAdoptedToolModule({
    id: 'listing-analyzer', name: 'Listing Analyzer', standaloneRootId: 'makaytron-etsy-listing-analyzer',
    factoryKey: 'createListingAnalyzer', versionKey: 'listingAnalyzerVersion',
  }),
  createKeywordMarketAnalyzerModule(),
]);
