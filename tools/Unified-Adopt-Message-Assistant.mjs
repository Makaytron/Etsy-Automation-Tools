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
  // The unified "AI and translation services" choice decides the automatic translation preview before the first route is handled,
  // so a disabled preference never lets an opened conversation reach the translator (it is also saved after start).
  ['            await Store.load();\n            await Campaign.recoverDurableSendPartials()', "            await Store.load();\n            if (typeof __env.autoPreview === 'function') Store.settings = { ...Store.settings, autoTurkishPreview: Boolean(__env.autoPreview()) };\n            await Campaign.recoverDurableSendPartials()", 1, 'unified translation preference before the first route'],
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
            // Change markers for the unified screens (not shown): a new draft, translation, error, list or campaign step re-renders them.
            marks: [String(UI.state.reply || '').length, String(UI.state.translation?.text || '').length, String(UI.state.context?.conversationId || ''),
                __eatLastError?.at || 0, Store.campaign?.revision ?? -1, Store.campaign?.runState || '', (UI.state.reviews || []).length,
                UI.state.reviewAnalysis ? 1 : 0, Store.templates.length, UI.state.messageListTranslations?.size || 0].join('|'),
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
    // AI providers for the workspace's Settings › AI providers tab. Keys never leave
    // the engine: the list reports only whether one is saved.
    const __eatAi = {
        list() {
            const ai = Object.entries(AI_PROVIDERS).map(([id, p]) => ({
                id, name: p.name, kind: 'text', apiKeyUrl: p.apiKeyUrl, models: AI.models(id),
                model: String(Store.providers?.[id]?.model || ''), hasKey: Boolean(String(Store.providers?.[id]?.apiKey || '').trim()),
            }));
            const deepl = { id: 'deepl', name: 'DeepL', kind: 'translate', apiKeyUrl: 'https://www.deepl.com/your-account/keys', models: [], model: '', hasKey: Boolean(String(Store.settings.deeplApiKey || '').trim()) };
            const google = { id: 'google', name: 'Google Translate', kind: 'translate', apiKeyUrl: '', models: [], model: '', hasKey: true, keyless: true };
            return [deepl, google, ...ai];
        },
        active() { return { provider: String(Store.settings.aiProvider || ''), translator: String(Store.settings.translator || '') }; },
        async save(id, { apiKey, model } = {}) {
            if (id === 'deepl') {
                const next = { ...Store.settings, deeplApiKey: apiKey === undefined ? Store.settings.deeplApiKey : String(apiKey).trim() };
                await MessageCenterAgent.withSafeConfigurationChange(next, () => Store.saveConfigBundle({ settings: next }));
                return true;
            }
            if (!AI_PROVIDERS[id]) return false;
            const providers = clone(Store.providers);
            const current = providers[id] || {};
            providers[id] = { ...current, apiKey: apiKey === undefined ? current.apiKey : String(apiKey).trim(), model: model ? String(model) : current.model };
            await Store.saveConfigBundle({ providers });
            return true;
        },
        remove(id) { return __eatAi.save(id, { apiKey: '' }); },
        /** Automatic translation preview: sends opened conversations to the translator without a click. */
        autoPreview() { return Boolean(Store.settings.autoTurkishPreview); },
        async setAutoPreview(on) {
            if (Boolean(Store.settings.autoTurkishPreview) === Boolean(on)) return true;
            const next = { ...Store.settings, autoTurkishPreview: Boolean(on) };
            await MessageCenterAgent.withSafeConfigurationChange(next, () => Store.saveConfigBundle({ settings: next }));
            return true;
        },
        async use({ provider, translator } = {}) {
            const next = { ...Store.settings };
            if (provider && AI_PROVIDERS[provider]) next.aiProvider = provider;
            if (translator === 'deepl' || translator === 'google') next.translator = translator;
            await MessageCenterAgent.withSafeConfigurationChange(next, () => Store.saveConfigBundle({ settings: next }));
            return true;
        },
    };
    // The unified Conversations, Quick replies and Autopilot screens. view() is a
    // read-only copy; every action runs the engine's own method, so its checks
    // (current conversation, unsent text in Etsy's box, campaign revision) apply,
    // and nothing here presses Etsy's Send.
    let __eatLastError = null;
    {
        const reportUiError = UI.reportUiError.bind(UI);
        UI.reportUiError = (error, action) => {
            const guidance = sendErrorGuidance(error);
            __eatLastError = { action: String(action || ''), code: String(guidance.code || ''), message: String(guidance.message || ''), at: Date.now() };
            return reportUiError(error, action);
        };
    }
    const __eatVars = ['firstName', 'fullName', 'shopName', 'orderNumber', 'itemTitle', 'trackingNumber', 'signature'];
    function __eatTemplateCheck(text) {
        const used = [...new Set([...String(text || '').matchAll(/{{\\s*([\\w]+)\\s*}}/g)].map((match) => match[1]))];
        return { variables: used, unknown: used.filter((name) => !__eatVars.includes(name)) };
    }
    function __eatView() {
        const page = Router.page();
        const listPage = page === 'messages' && Router.isMessageListPage();
        const target = Store.settings.previewLanguage || 'tr';
        const list = listPage ? UI.messageListItems().map((item) => {
            const translated = UI.messageListTranslationFor(item, target);
            return {
                id: item.conversationId, url: item.conversationUrl, name: item.buyerName, preview: item.preview,
                translated: String((typeof translated === 'string' ? translated : translated?.text) || ''),
                unread: item.unread, time: item.timestamp,
            };
        }) : [];
        const context = page === 'messages' && !listPage ? (UI.state.context || MessageAdapter.context()) : null;
        const conversation = context?.conversationId ? {
            id: context.conversationId, name: String(context.customerName || ''), orderId: String(context.orderId || ''), itemTitle: String(context.itemTitle || ''),
            messages: (context.messages || []).slice(-6).map((message) => ({ role: message.role, text: String(message.text || '') })),
            last: String(context.lastCustomerMessage || ''),
            translation: String(UI.state.translation?.text || ''), language: String(UI.state.translation?.detectedLanguage || ''),
            reply: String(UI.state.reply || ''), replyTr: String(UI.state.replyTr || ''), replyLanguage: String(UI.state.targetLanguage || ''),
            replyCurrent: Boolean(UI.state.reply && UI.replyIsCurrent(UI.state.replyBinding)), replyMethod: String(UI.state.replyMethod || ''),
            risk: String(UI.state.analysis?.risk || ''), canInsert: Boolean(MessageAdapter.getTextarea()),
        } : null;
        const campaign = Store.campaign ? {
            id: String(Store.campaign.id || ''), revision: Store.campaign.revision, status: String(Store.campaign.status || ''),
            runMode: Store.campaign.runMode, runState: Store.campaign.runState, active: Campaign.isNonterminal(Store.campaign),
            items: (Store.campaign.items || []).map((item) => ({
                id: String(item.id || ''), orderId: String(item.orderId || ''), name: String(item.customerName || ''), itemTitle: String(item.itemTitle || ''),
                templateId: String(item.templateId || ''), status: String(item.status || ''), url: String(item.messageUrl || ''),
            })),
        } : null;
        const selectedReview = UI.state.selectedReviewId;
        return {
            page, listPage, list, conversation, campaign, previewLanguage: target,
            busy: Boolean(UI.state.busy), error: __eatLastError,
            ai: __eatSnapshot().ai, translator: String(Store.settings.translator || ''),
            autoAdvance: Boolean(Store.settings.autoAdvanceCampaign), autoSend: Boolean(Store.settings.autoSendCampaign),
            templates: Store.templates.map((template) => ({
                id: template.id, name: String(template.name || ''), category: String(template.category || ''), language: String(template.language || 'tr'),
                text: String(template.text || ''), archived: Boolean(template.archived), ...__eatTemplateCheck(template.text),
            })),
            reviews: (UI.state.reviews || []).map((review) => ({
                id: review.id, name: String(review.customerName || ''), itemTitle: String(review.itemTitle || ''), rating: review.rating ?? null, text: String(review.text || ''),
                status: String(review.status?.status || ''),
                reply: review.id === selectedReview && UI.reviewAnalysisIsCurrent(review) ? String(UI.state.reviewAnalysis?.public_reply || '') : '',
                risk: review.id === selectedReview ? String(UI.state.reviewAnalysis?.risk_level || '') : '',
            })),
        };
    }
    const __eatChanged = () => { if (__env.onChange) __env.onChange(); };
    async function __eatRun(action, fn) {
        __eatLastError = null;
        try { return (await fn()) !== false; }
        catch (error) { UI.reportUiError(error, action); return false; }
        finally { UI.setBusy(false); UI.render(); __eatChanged(); }
    }
    const __eatMessages = {
        view: __eatView,
        variables: () => __eatVars.slice(),
        languages: () => Object.entries(GOOGLE_TRANSLATION_LANGUAGE_NAMES).map(([code, name]) => ({ code, name })),
        clearError() { __eatLastError = null; __eatChanged(); },
        translate: () => __eatRun('translate-last', () => UI.translateLast()),
        draft: () => __eatRun('generate-reply', () => UI.generateReply({ method: 'ai', replyMode: 'auto' })),
        regenerate: () => __eatRun('regenerate-reply', () => UI.regenerateReply()),
        useTemplate(id) {
            if (!TemplateEngine.get(id)) return Promise.resolve(false);
            UI.state.selectedTemplateId = id;
            return __eatRun('template-reply', () => UI.generateReply({ method: 'template', replyMode: 'template' }));
        },
        setReplyLanguage(code) {
            const next = String(code || '').trim().toLowerCase();
            if (!GOOGLE_TRANSLATION_LANGUAGE_NAMES[next] && !GOOGLE_TRANSLATION_LANGUAGE_NAMES[next.split('-')[0]]) return Promise.resolve(false);
            UI.state.targetLanguage = next;
            return UI.state.reply ? __eatRun('regenerate-reply', () => UI.regenerateReply()) : Promise.resolve(true);
        },
        editReply(text) { if (UI.state.reply != null) UI.state.reply = String(text ?? ''); },
        insert: () => __eatRun('insert-reply', () => UI.insertReply()),
        copy: () => __eatRun('copy', () => UI.copySource('reply')),
        translateList: () => __eatRun('message-list-translate', () => UI.translateMessageListPreviews({ auto: false })),
        openConversation(url) {
            const canonical = MessageCenterAgent.canonicalConversationUrl(String(url || ''));
            if (!canonical) return false;
            location.assign(canonical);
            return true;
        },
        async previewTemplate(text, language) {
            const context = UI.state.context?.conversationId ? UI.state.context : { customerName: 'Ashley', customerFirstName: 'Ashley', orderId: '1234567890', itemTitle: 'Personalized Birth Flower Name Sign' };
            const rendered = TemplateEngine.render({ text }, context);
            const target = Translator.normalizedTarget(language || 'tr');
            return target === 'tr' ? rendered : (await Translator.translate(rendered, target)).text;
        },
        saveTemplate(input = {}) {
            return __eatRun('template-save', async () => {
                const text = String(input.text || '');
                if (!text.trim()) throw new Error('Şablon metni boş bırakılamaz.');
                const next = Store.templates.map(clone);
                const index = next.findIndex((item) => item.id === input.id);
                const base = index === -1 ? { id: uid('tpl'), tone: 'friendly', language: 'tr', shortcut: '', archived: false, createdAt: nowIso() } : next[index];
                const template = { ...base, name: normalize(input.name) || 'Adsız Şablon', category: normalize(input.category) || 'Genel', text, updatedAt: nowIso() };
                if (index === -1) next.unshift(template); else next[index] = template;
                await Store.saveTemplates(next);
                UI.toast('Şablon kaydedildi.', 'success');
                return true;
            });
        },
        archiveTemplate(id, archived = true) {
            return __eatRun('template-archive', async () => {
                const next = Store.templates.map(clone);
                const target = next.find((item) => item.id === id);
                if (!target) throw new Error('Şablon bulunamadı.');
                target.archived = Boolean(archived);
                target.updatedAt = nowIso();
                await Store.saveTemplates(next);
                return true;
            });
        },
        campaignPause() {
            const campaign = Store.campaign;
            return __eatRun('campaign-pause', () => Campaign.pauseAutopilot({ expectedCampaignId: campaign?.id || '', expectedRevision: campaign?.revision }));
        },
        campaignResume() {
            const campaign = Store.campaign;
            return __eatRun('campaign-start', () => Campaign.startAutopilot({ expectedCampaignId: campaign?.id || '', expectedRevision: campaign?.revision }));
        },
        setAutoAdvance(on) {
            return __eatRun('settings-save', async () => {
                const next = { ...Store.settings, autoAdvanceCampaign: Boolean(on) };
                await MessageCenterAgent.withSafeConfigurationChange(next, () => Store.saveConfigBundle({ settings: next }));
                return true;
            });
        },
        refreshReviews: () => __eatRun('reviews-scan', () => { UI.refreshReviews(); return true; }),
        reviewDraft(id) {
            return __eatRun('review-analyze', () => { UI.selectReview(id); return UI.analyzeReview(); });
        },
        reviewCopy(id) {
            return __eatRun('copy', () => {
                if (UI.state.selectedReviewId !== id) throw new Error('Önce bu yorum için taslak hazırlayın.');
                return UI.copySource('review-public');
            });
        },
    };
    return {
        start: () => App.init(), version: APP_VERSION,
        snapshot: __eatSnapshot, openPanel: __eatOpen, ai: __eatAi, messages: __eatMessages,
        translateLast: () => __eatCompose('translate'), generateReply: () => __eatCompose('reply'),
    };`;

export function adoptMessageAssistant(source = fs.readFileSync(MA_SOURCE, 'utf8')) {
  return adoptStandalone({
    name: 'Message Assistant', label: 'MESSAGE ASSISTANT', source, open: OPEN, close: CLOSE, edits: MA_EDITS,
    factory: 'createAdoptedMessageAssistant', prologue: GM_PROLOGUE, epilogue: EPILOGUE, versionConst: 'ADOPTED_MESSAGE_ASSISTANT_VERSION',
  });
}
