// Adopts the standalone Message Assistant as an engine inside the unified script.
// See tools/Unified-Adopt.mjs for the shared rules.
//
// The standalone script reaches storage through `globalThis.GM`, which would
// bypass the unified GM shim and write raw keys into the unified script's
// storage. Those calls are pointed at the shim. The Etsy send lock keeps its
// name on purpose: a standalone copy in another tab and this engine never
// send on Etsy at the same time. Locks that guard the script's own storage
// (campaign status, history, settings) get `eat-ma` names, because the two
// copies keep separate storage.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adoptStandalone, GM_PROLOGUE } from './Unified-Adopt.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MA_SOURCE = path.join(repoRoot, 'scripts', 'etsy-message-assistant', 'Makaytron-Etsy-Message-Assistant.user.js');

const OPEN = "(async () => {\n    'use strict';\n";
// The standalone script starts itself; the unified host starts the engine instead.
const CLOSE = '    await App.init();\n})();\n';

export const MA_EDITS = Object.freeze([
  // Storage, menus, resources and styles go through the unified shim, never the manager's global GM.
  ['globalThis.GM?.', 'GM?.', 10, 'global GM access'],
  ['globalThis.GM_info', 'GM_info', 1, 'global script info'],
  // Page-level names shared with a standalone copy.
  ['            this.host.id = APP.id;\n', "            this.host.id = 'eat-message-assistant';\n", 1, 'panel host id'],
  ['    const CAMPAIGN_COORDINATION_LOCK = `${APP.prefix}:campaign-status-coordination:v1`;',
    "    const CAMPAIGN_COORDINATION_LOCK = 'eat-ma:campaign-status-coordination:v1';", 1, 'campaign lock'],
  ['    const HISTORY_COORDINATION_LOCK = `${APP.prefix}:history-coordination:v1`;',
    "    const HISTORY_COORDINATION_LOCK = 'eat-ma:history-coordination:v1';", 1, 'history lock'],
  ['    const CONFIG_COORDINATION_LOCK = `${APP.prefix}:config-coordination:v1`;',
    "    const CONFIG_COORDINATION_LOCK = 'eat-ma:config-coordination:v1';", 1, 'settings lock'],
  // Runs only while the unified script allows it (tool enabled, no standalone copy on the page).
  ['const RouteLifecycle = createRouteLifecycle(path => RUNTIME_ROUTE_PATTERN.test(path));',
    'const RouteLifecycle = createRouteLifecycle(path => RUNTIME_ROUTE_PATTERN.test(path) && __env.isAllowed());', 1, 'route gate'],
  // Updates come with the unified script: the engine never fetches the standalone package to compare versions.
  ['        usesGitHubUpdateChannel() {\n', '        usesGitHubUpdateChannel() {\n            return false;\n', 1, 'no standalone update check'],
  // The unified edge button replaces the floating launcher; the panel itself stays for detailed work.
  ['<style>${CSS}${LAUNCHER_CSS}${UX_CSS}${PREMIUM_CSS}</style>', '<style>${CSS}${LAUNCHER_CSS}${UX_CSS}${PREMIUM_CSS}.ma-launcher{display:none!important}</style>', 1, 'launcher hidden'],
  // The unified screens follow the engine: every panel render, busy state and closing.
  ['            if (!this.app || !this.view) return;\n', '            if (!this.app || !this.view) return;\n            __env.onChange?.();\n', 1, 'render hook'],
  ["            this.app?.setAttribute?.('aria-busy', String(Boolean(value)));\n", "            this.app?.setAttribute?.('aria-busy', String(Boolean(value)));\n            __env.onChange?.();\n", 1, 'busy hook'],
  ['            launcher.focus({ preventScroll: true });\n', '            launcher.focus({ preventScroll: true });\n            __env.onChange?.();\n', 1, 'close hook'],
  // The standalone package's usage metrics stay with the standalone package.
  ['    function telemetrySuppressed() {\n', '    function telemetrySuppressed() {\n        return true;\n', 1, 'no telemetry from the unified engine'],
]);

// What the unified screens may read and do: a read-only summary, opening the
// engine's own panel at a section, and its own translate and reply actions.
const SECTIONS = "['messages', 'orders', 'reviews', 'templates', 'history', 'settings']";
const EPILOGUE = `
    function __eatSnapshot() {
        const provider = AI.provider();
        const profile = Store.providers?.[Store.settings.aiProvider] || {};
        const page = Router.page();
        return {
            open: Boolean(UI.state?.open), section: String(UI.state?.page || ''), page, busy: Boolean(UI.state?.busy),
            ai: { name: provider.name, model: String(profile.model || ''), hasKey: Boolean(String(profile.apiKey || '').trim()) },
            translator: String(Store.settings.translator || ''), previewLanguage: String(Store.settings.previewLanguage || ''),
            templates: TemplateEngine.active().length, history: Array.isArray(Store.history) ? Store.history.length : 0,
            campaign: Store.campaign?.status === 'active',
            canCompose: page === 'messages' && Boolean(MessageAdapter.getTextarea()),
        };
    }
    function __eatOpen(section) {
        if (!UI.app || !RouteLifecycle.allowed()) return false;
        UI.open(${SECTIONS}.includes(section) ? section : UI.state.page);
        return true;
    }
    async function __eatCompose(kind) {
        if (!__eatOpen('messages') || UI.state.busy) return false;
        if (kind === 'translate') await UI.translateLast();
        else await UI.generateReply();
        return true;
    }
    return {
        start: () => App.init(), version: APP_VERSION,
        snapshot: __eatSnapshot, openPanel: __eatOpen,
        translateLast: () => __eatCompose('translate'), generateReply: () => __eatCompose('reply'),
    };`;

export function adoptMessageAssistant(source = fs.readFileSync(MA_SOURCE, 'utf8')) {
  return adoptStandalone({
    name: 'Message Assistant', label: 'MESSAGE ASSISTANT', source, open: OPEN, close: CLOSE, edits: MA_EDITS,
    factory: 'createAdoptedMessageAssistant', prologue: GM_PROLOGUE, epilogue: EPILOGUE, versionConst: 'ADOPTED_MESSAGE_ASSISTANT_VERSION',
  });
}
