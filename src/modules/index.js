// The five tools of the unified script.
//
// Every tool runs its standalone script as an adopted engine (see
// tools/Unified-Adopt*.mjs) behind the new screens. Message Assistant and
// Listing Analyzer keep their own panel for the detailed work.

import { createSaleManagerModule } from './sale-manager.js';
import { createAdsKeywordManagerModule } from './ads-keyword-manager.js';
import { createKeywordMarketAnalyzerModule } from './keyword-market-analyzer.js';
import { createMessageAssistantModule } from './message-assistant.js';
import { createListingAnalyzerModule } from './listing-analyzer.js';

// Credentials inside Message Assistant's stored objects; the same paths the transfer strips
// (shared/migration/handoff.js, kept equal by a test). They live under eat:secret:.
export const MESSAGE_ASSISTANT_SECRETS = Object.freeze({ 'mema:settings': ['deeplApiKey', 'messageCenterAgentToken'], 'mema:providers': ['*.apiKey'] });

export const TOOLS = Object.freeze([
  createSaleManagerModule(),
  createMessageAssistantModule({ secrets: MESSAGE_ASSISTANT_SECRETS }),
  createAdsKeywordManagerModule(),
  createListingAnalyzerModule(),
  createKeywordMarketAnalyzerModule(),
]);
