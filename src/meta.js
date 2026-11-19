// Userscript metadata for the unified script.
//
// Phase 2 renders this into the `==UserScript==` header of the single built
// file. It is a new installed identity: the five standalone scripts keep their
// own @name/@namespace and stay installable until their retirement window
// ends. The unified script is not registered in config/production-packages.json
// yet; that registration is a deliberate distribution-schema change (see
// AGENTS.md) made only when it is ready to ship.

export const META = Object.freeze({
  name: 'Etsy Automation Tools',
  namespace: 'https://makaytron.com/etsy-automation-tools',
  version: '2.0.0',
  description: 'Sale Manager, Message Assistant, Ads Keyword Manager, Listing Analyzer and Keyword & Market Analyzer for Etsy sellers, in one drawer.',
  author: 'Makaytron',
  homepage: 'https://makaytron.com',
  license: 'See LICENSE',
  // Union of the standalone scripts' @match lines. Each tool still runs only
  // on its own pages through src/core/routes.js.
  match: Object.freeze(['https://www.etsy.com/*', 'https://etsy.com/*']),
  runAt: 'document-idle',
  grant: Object.freeze([
    'GM.getValue', 'GM.setValue', 'GM.deleteValue', 'GM.listValues', 'GM.addValueChangeListener',
    'GM.xmlHttpRequest', 'GM.openInTab', 'GM.registerMenuCommand', 'GM.info', 'window.onurlchange',
  ]),
  // Union of the standalone scripts' @connect lines, minus the wildcard used
  // by Message Assistant for custom AI endpoints; whether to keep that
  // wildcard is decided when Message Assistant moves in (phase 5).
  connect: Object.freeze([
    'raw.githubusercontent.com', 'api.github.com', 'sjwibgcflufmzaorlwqe.supabase.co',
    'api-free.deepl.com', 'api.deepl.com', 'translate.googleapis.com',
    'api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com', 'api.deepseek.com', 'openrouter.ai',
  ]),
  antifeature: Object.freeze(['tracking', 'ads']),
});
