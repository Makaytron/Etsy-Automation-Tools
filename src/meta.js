// Userscript metadata for the unified script.
//
// The build renders this into the `==UserScript==` header of the single built
// file. It is a new installed identity: the five standalone scripts keep their
// own @name/@namespace and stay installable until their retirement window
// ends. @name follows the repository's "Makaytron Etsy …" listing names; the
// interface itself says "Etsy Automation Tools". The production build
// (`--production`) adds @updateURL/@downloadURL for `scriptPath`, which is
// registered in config/production-packages.json (distributed from GitHub only).

export const META = Object.freeze({
  name: 'Makaytron Etsy Automation Tools',
  namespace: 'https://makaytron.com/etsy-automation-tools',
  version: '2.1.3',
  description: 'Sale Manager, Message Assistant, Ads Keyword Manager, Listing Analyzer and Keyword & Market Analyzer for Etsy sellers, in one drawer.',
  author: 'Makaytron',
  // Same canonical package page the standalone scripts use (tools/Test-Distribution.ps1).
  homepage: 'https://github.com/Makaytron/Etsy-Automation-Tools/tree/main/scripts/etsy-automation-tools',
  supportURL: 'https://github.com/Makaytron/Etsy-Automation-Tools/issues',
  icon: 'https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/assets/makaytron-logo.png',
  license: 'MIT',
  // Canonical file on main; the production build points both update URLs at its raw copy.
  scriptPath: 'scripts/etsy-automation-tools/Makaytron-Etsy-Automation-Tools.user.js',
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
  // Makaytron Pro suggestions only. No usage metrics: the adopted engines' telemetry is switched off at build time.
  antifeature: Object.freeze(['ads']),
});
