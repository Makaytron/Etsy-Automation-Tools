import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(
    repoRoot,
    'scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js',
);

async function loadAssistant() {
    const storage = new Map();
    const noop = () => {};
    const documentListeners = new Map();
    const lockTails = new Map();
    const document = {
        readyState: 'loading',
        documentElement: { appendChild: noop },
        body: { appendChild: noop },
        head: { appendChild: noop },
        createElement: () => ({
            append: noop,
            appendChild: noop,
            addEventListener: noop,
            setAttribute: noop,
            classList: { add: noop, remove: noop, toggle: noop },
        }),
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener(type, listener) {
            const listeners = documentListeners.get(type) || [];
            listeners.push(listener);
            documentListeners.set(type, listeners);
        },
    };
    const GM = {
        info: { script: {} },
        getValue: async (key, fallback) => storage.has(key) ? storage.get(key) : JSON.parse(JSON.stringify(fallback)),
        setValue: async (key, value) => { storage.set(key, JSON.parse(JSON.stringify(value))); },
        deleteValue: async (key) => storage.delete(key),
        addValueChangeListener: noop,
        registerMenuCommand: noop,
        getResourceURL: async () => '',
        openInTab: noop,
    };
    class FakeElement {}
    const sandbox = {
        console,
        URL,
        Date,
        Math,
        JSON,
        Promise,
        Map,
        Set,
        WeakMap,
        WeakSet,
        RegExp,
        Error,
        TypeError,
        TextEncoder,
        TextDecoder,
        Uint8Array,
        ArrayBuffer,
        Blob,
        location: {
            pathname: '/your/orders/sold/completed',
            search: '',
            href: 'https://www.etsy.com/your/orders/sold/completed',
            hostname: 'www.etsy.com',
            origin: 'https://www.etsy.com',
        },
        navigator: {
            locks: {
                request: async (name, _options, operation) => {
                    const previous = lockTails.get(name) || Promise.resolve();
                    let release = null;
                    const turn = new Promise(resolve => { release = resolve; });
                    const tail = previous.catch(() => {}).then(() => turn);
                    lockTails.set(name, tail);
                    await previous.catch(() => {});
                    try {
                        return await operation();
                    } finally {
                        release();
                        if (lockTails.get(name) === tail) lockTails.delete(name);
                    }
                },
            },
        },
        document,
        Element: FakeElement,
        HTMLElement: FakeElement,
        HTMLInputElement: FakeElement,
        HTMLTextAreaElement: FakeElement,
        HTMLSelectElement: FakeElement,
        InputEvent: class {},
        Event: class {},
        MutationObserver: class { observe() {} disconnect() {} },
        GM,
        GM_info: GM.info,
        GM_addValueChangeListener: noop,
        confirm: () => true,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        requestAnimationFrame: (callback) => setTimeout(callback, 0),
        cancelAnimationFrame: clearTimeout,
        getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
        history: { pushState: noop, replaceState: noop },
        CSS: { escape: String },
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    const source = fs.readFileSync(scriptPath, 'utf8');
    const bootstrap = '    await App.init();';
    assert.equal(source.split(bootstrap).length, 2, 'Userscript bootstrap marker must be unique.');
    const instrumented = source.replace(bootstrap, `
    globalThis.__MEMA_TEST__ = Object.freeze({
        APP,
        KEYS,
        DEFAULT_SETTINGS: clone(DEFAULT_SETTINGS),
        DEFAULT_TEMPLATES: clone(DEFAULT_TEMPLATES),
        Store,
        TemplateEngine,
        ConfigManager,
        Campaign,
        Outreach,
        Verification,
        MessageAdapter,
        Router,
        UI,
        mergeDefaultTemplates,
        campaignInstructionForTemplate,
        campaignAutoSendAllowed,
        normalizeStatusState,
        reconcileLegacyReviewOutreach,
        templateFingerprint,
        hashText,
    });`);
    const context = vm.createContext(sandbox);
    await vm.runInContext(instrumented, context, { filename: scriptPath });
    assert.ok(sandbox.__MEMA_TEST__, 'Message Assistant test API was not exposed.');
    return { api: sandbox.__MEMA_TEST__, storage, sandbox, documentListeners };
}

const copy = (value) => JSON.parse(JSON.stringify(value));

async function waitUntil(predicate, message, attempts = 200) {
    for (let index = 0; index < attempts; index += 1) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    assert.fail(message);
}

function makeNativeSendButton(onClick = () => {}, captureClick = () => {}) {
    const listeners = new Set();
    let clickCount = 0;
    return {
        disabled: false,
        textContent: 'Send',
        offsetParent: {},
        get clickCount() { return clickCount; },
        getAttribute(name) {
            if (name === 'aria-label') return 'Send';
            if (name === 'aria-disabled') return this.disabled ? 'true' : 'false';
            return '';
        },
        addEventListener(type, listener) {
            if (type === 'click') listeners.add(listener);
        },
        removeEventListener(type, listener) {
            if (type === 'click') listeners.delete(listener);
        },
        click() {
            const event = {
                target: this,
                defaultPrevented: false,
                immediatePropagationStopped: false,
                preventDefault() { this.defaultPrevented = true; },
                stopImmediatePropagation() { this.immediatePropagationStopped = true; },
            };
            captureClick(event);
            if (event.defaultPrevented || event.immediatePropagationStopped) return;
            clickCount += 1;
            for (const listener of [...listeners]) listener(event);
            onClick();
        },
    };
}

function installGuidedFixture(environment, { twoItems = false } = {}) {
    const { api, storage, sandbox } = environment;
    sandbox.location.pathname = '/messages/order-1';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/order-1';
    const template = api.TemplateEngine.get('tpl-review-request');
    const templateHash = api.templateFingerprint(template);
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const first = {
        id: 'item-1', campaignId: 'campaign-1', orderId: 'order-1', customerName: 'Ashley',
        itemTitle: 'Custom Team Shirt', messageUrl: sandbox.location.href, status: 'inserted',
        purpose: 'review_request', templateId: template.id, templateHash, method: 'template',
    };
    const items = [first];
    if (twoItems) items.push({
        id: 'item-2', campaignId: 'campaign-1', orderId: 'order-2', customerName: 'Morgan',
        itemTitle: 'Second Shirt', messageUrl: 'https://www.etsy.com/messages/order-2', status: 'pending',
        purpose: 'review_request', templateId: template.id, templateHash, method: 'template',
    });
    const campaign = {
        id: 'campaign-1', status: 'active', revision: 1, currentIndex: 0,
        purpose: 'review_request', templateId: template.id, templateHash, items,
    };
    const statuses = api.normalizeStatusState({
        revision: 1,
        orders: {
            'order-1': {
                status: 'inserted', campaignId: campaign.id, campaignItemId: first.id,
                purpose: first.purpose, templateId: first.templateId, templateHash,
                messageHash: api.hashText('Prepared review request'),
            },
        },
        outreach: {
            'order-1': {
                review_request: {
                    decision: 'eligible', reason: 'review_missing_confirmed', source: 'manual',
                    decidedAt: new Date().toISOString(), evidenceExpiresAt: expires, workflow: 'prepared',
                    campaignId: campaign.id, campaignItemId: first.id, templateId: first.templateId,
                    templateHash, messageHash: api.hashText('Prepared review request'),
                },
            },
            ...(twoItems ? {
                'order-2': {
                    review_request: {
                        decision: 'eligible', reason: 'review_missing_confirmed', source: 'manual',
                        decidedAt: new Date().toISOString(), evidenceExpiresAt: expires, workflow: 'queued',
                        campaignId: campaign.id, campaignItemId: 'item-2', templateId: template.id, templateHash,
                    },
                },
            } : {}),
        },
    });
    storage.set(api.KEYS.campaign, copy(campaign));
    storage.set(api.KEYS.statuses, copy(statuses));
    api.Store.commitCoordinatedState(campaign, statuses, { invalidate: false, refresh: false });
    return { campaign, statuses, first, templateHash };
}

function installPendingResolutionFixture(environment) {
    const { api, storage, sandbox } = environment;
    sandbox.location.pathname = '/messages/order-1';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/order-1';
    const template = api.TemplateEngine.get('tpl-review-request');
    const templateHash = api.templateFingerprint(template);
    const attemptToken = 'attempt-1';
    const previousOrderStatus = {
        status: 'inserted', campaignId: 'campaign-1', campaignItemId: 'item-1',
        purpose: 'review_request', templateId: template.id, templateHash,
        messageHash: api.hashText('Edited final text'), updatedAt: '2026-08-10T10:00:00.000Z',
    };
    const previousOutreach = api.normalizeStatusState({
        outreach: {
            'order-1': {
                review_request: {
                    decision: 'eligible', reason: 'review_missing_confirmed', source: 'manual',
                    decidedAt: '2026-08-10T09:00:00.000Z', evidenceExpiresAt: '2099-01-01T00:00:00.000Z',
                    workflow: 'prepared', campaignId: 'campaign-1', campaignItemId: 'item-1',
                    templateId: template.id, templateHash, messageHash: api.hashText('Edited final text'),
                    preparedAt: '2026-08-10T10:00:00.000Z', previousOrderStatus: null,
                },
            },
        },
    }).outreach['order-1'].review_request;
    const campaign = {
        id: 'campaign-1', status: 'active', revision: 2, currentIndex: 0,
        items: [
            {
                id: 'item-1', campaignId: 'campaign-1', orderId: 'order-1', status: 'sent_pending_verification',
                purpose: 'review_request', templateId: template.id, templateHash, method: 'template',
                messageUrl: sandbox.location.href, sendAttemptToken: attemptToken,
                sendAttemptedAt: '2026-08-10T10:01:00.000Z', sendAttemptPreviousStatus: 'inserted',
                reservation: { ownerId: 'tab-1', token: attemptToken, expiresAt: '2099-01-01T00:00:00.000Z' },
            },
            {
                id: 'item-2', campaignId: 'campaign-1', orderId: 'order-2', status: 'pending',
                purpose: 'review_request', templateId: template.id, templateHash, method: 'template',
                messageUrl: 'https://www.etsy.com/messages/order-2',
            },
        ],
    };
    const statuses = api.normalizeStatusState({
        revision: 2,
        orders: {
            'order-1': {
                ...previousOrderStatus,
                status: 'sent_pending_verification', sendAttemptToken: attemptToken,
                sendAttemptedAt: '2026-08-10T10:01:00.000Z',
                previousOrderStatus, previousOutreach,
            },
        },
        outreach: {
            'order-1': {
                review_request: {
                    ...previousOutreach,
                    workflow: 'sent_pending_verification', sendAttemptToken: attemptToken,
                    sendAttemptedAt: '2026-08-10T10:01:00.000Z',
                },
            },
        },
    });
    storage.set(api.KEYS.campaign, copy(campaign));
    storage.set(api.KEYS.statuses, copy(statuses));
    api.Store.commitCoordinatedState(campaign, statuses, { invalidate: false, refresh: false });
    return { campaign, statuses, previousOrderStatus, previousOutreach, attemptToken };
}

test('review request preset is safe, pressure-free, and the delivered-order default', async () => {
    const { api } = await loadAssistant();
    const template = api.DEFAULT_TEMPLATES.find((item) => item.id === 'tpl-review-request');
    assert.ok(template, 'Review request template is missing.');
    assert.equal(template.purpose, 'review_request');
    assert.equal(template.language, 'en');
    assert.equal(api.DEFAULT_SETTINGS.defaultDeliveredTemplateId, template.id);
    assert.match(template.text, /honest Etsy review/i);
    assert.match(template.text, /owner of a new small business/i);
    assert.match(template.text, /absolutely no pressure/i);
    assert.doesNotMatch(template.text, /5\s*stars?|positive review|discount|coupon|gift|refund/i);
    assert.doesNotMatch(template.text, /\b(?:Merhaba|dürüst|işletme|yorum|zorunluluk)\b/i);
});

test('schema migration adds the new preset once and preserves existing template edits', async () => {
    const { api, storage } = await loadAssistant();
    const legacyTemplates = [
        {
            id: 'tpl-delivered',
            name: 'Benim teslimat metnim',
            category: 'Özel',
            tone: 'short',
            language: 'tr',
            shortcut: '/benim',
            text: 'Bu metni koru.',
            archived: true,
        },
        {
            id: 'tpl-custom',
            name: 'Özel şablon',
            category: 'Özel',
            tone: 'friendly',
            language: 'tr',
            shortcut: '/ozel',
            text: 'Özel içerik',
            archived: false,
        },
    ];
    api.Store.templates = JSON.parse(JSON.stringify(legacyTemplates));
    api.Store.configMeta = { schemaVersion: 2, updatedAt: '2026-08-04T00:00:00.000Z' };

    await api.Store.migrate();
    await api.Store.migrate();

    const migrated = api.Store.templates;
    assert.equal(migrated.filter((item) => item.id === 'tpl-review-request').length, 1);
    assert.deepEqual(
        JSON.parse(JSON.stringify(migrated.find((item) => item.id === 'tpl-delivered'))),
        legacyTemplates[0],
    );
    assert.deepEqual(
        JSON.parse(JSON.stringify(migrated.find((item) => item.id === 'tpl-custom'))),
        legacyTemplates[1],
    );
    assert.equal(api.Store.configMeta.schemaVersion, 5);
    assert.equal(storage.get(api.KEYS.templates).filter((item) => item.id === 'tpl-review-request').length, 1);
});

test('importing a schema-2 config cannot remove newly required presets', async () => {
    const { api, storage } = await loadAssistant();
    await api.ConfigManager.importText(JSON.stringify({
        app: api.APP.id,
        schemaVersion: 2,
        settings: {},
        providers: {},
        templates: [{ id: 'tpl-custom', name: 'Tek özel şablon', text: 'Korunacak' }],
    }));

    assert.equal(api.Store.templates.filter((item) => item.id === 'tpl-review-request').length, 1);
    assert.equal(storage.get(api.KEYS.templates).filter((item) => item.id === 'tpl-review-request').length, 1);
    assert.equal(api.Store.templates.find((item) => item.id === 'tpl-custom').text, 'Korunacak');
});

test('schema-3 Turkish review preset is corrected to English without losing user state', async () => {
    const { api } = await loadAssistant();
    const legacyText = 'Merhaba {{firstName}}! 🌿\n\n{{itemTitle}} siparişinizin size güvenle ulaştığını ve keyifle kullandığınızı umuyorum. Yeni ve küçük bir işletme olarak, vaktiniz olduğunda deneyiminizi anlatan dürüst bir Etsy yorumu paylaşmanız benim için çok değerli. Geri bildiriminiz mağazamın gelişmesine ve diğer müşterilerin daha güvenle karar vermesine yardımcı olur; elbette hiçbir zorunluluk yok.\n\nÜrünle ilgili herhangi bir sorun veya sorunuz varsa buradan bana yazabilirsiniz; memnuniyetle yardımcı olurum.\n\n{{signature}}';
    api.Store.templates = [{
        id: 'tpl-review-request',
        name: 'Yorum rica — küçük işletme',
        category: 'Benim kategorim',
        purpose: 'review_request',
        tone: 'short',
        language: 'tr',
        shortcut: '/benim-review',
        text: legacyText,
        archived: true,
    }];
    api.Store.configMeta = { schemaVersion: 3, updatedAt: '2026-08-10T00:00:00.000Z' };

    await api.Store.migrate();

    const migrated = api.Store.templates.find((item) => item.id === 'tpl-review-request');
    assert.equal(migrated.language, 'en');
    assert.match(migrated.text, /honest Etsy review/i);
    assert.equal(migrated.name, 'Yorum rica — küçük işletme (EN)');
    assert.equal(migrated.category, 'Benim kategorim');
    assert.equal(migrated.tone, 'short');
    assert.equal(migrated.shortcut, '/benim-review');
    assert.equal(migrated.archived, true);
    assert.equal(api.Store.configMeta.schemaVersion, 5);
});

test('review request rendering resolves order variables without changing the stored preset', async () => {
    const { api } = await loadAssistant();
    api.Store.settings.shopName = 'Makaytron Studio';
    api.Store.settings.signature = 'Best, Sophia';
    const template = api.Store.templates.find((item) => item.id === 'tpl-review-request');
    const original = template.text;
    const rendered = api.TemplateEngine.render(template, {
        customerName: 'Ashley Morgan',
        itemTitle: 'Custom Team Shirt',
        orderId: '123456789',
    });

    assert.match(rendered, /Hi Ashley!/);
    assert.match(rendered, /Custom Team Shirt/);
    assert.match(rendered, /Best, Sophia/);
    assert.doesNotMatch(rendered, /{{\s*\w+\s*}}/);
    assert.equal(template.text, original);
});

test('delivered-order screen selects the review request and displays the persistent eligibility controls', async () => {
    const { api } = await loadAssistant();
    api.UI.state.ordersTemplateInitialized = false;
    api.UI.refreshOrders();

    assert.equal(api.UI.state.selectedTemplateId, 'tpl-review-request');
    const markup = api.UI.renderOrders();
    assert.match(markup, /Yorum rica — küçük işletme/);
    assert.match(markup, /Önce her siparişin yorum durumunu işaretleyin/);
    assert.match(markup, /Yorum Kontrolü/);
    assert.match(markup, /data-action="orders-select-all">Onaylıları Seç/);
    assert.match(markup, /“Yorum yok” onayı 2 saat geçerlidir/);

    api.Store.templates.find((item) => item.id === 'tpl-review-request').archived = true;
    api.UI.refreshOrders();
    assert.equal(api.UI.state.selectedTemplateId, 'tpl-delivered');
});

test('template changes rerender safely and cannot carry bulk recipients into review outreach', async () => {
    const { api } = await loadAssistant();
    const target = {
        dataset: { bind: 'selectedTemplateId' },
        value: 'tpl-review-request',
        name: '',
        hasAttribute: () => false,
    };
    api.UI.state.selectedTemplateId = 'tpl-delivered';
    api.UI.state.selectedOrders = new Set(['order-1', 'order-2']);

    api.UI.onInput({ target });
    assert.equal(api.UI.state.selectedTemplateId, 'tpl-delivered', 'input must not mutate a template select before change handling');
    await api.UI.onChange({ target });

    assert.equal(api.UI.state.selectedTemplateId, 'tpl-review-request');
    assert.equal(api.UI.state.selectedOrders.size, 0);
    assert.equal(api.UI.state.composeMethod, 'template');
});

test('review campaigns reject unknown recipients before any campaign write', async () => {
    const { api } = await loadAssistant();
    api.UI.state.selectedTemplateId = 'tpl-review-request';
    api.UI.state.orders = [{ orderId: 'order-1', messageUrl: 'https://www.etsy.com/messages/order-1' }];
    api.UI.state.selectedOrders = new Set(['order-1']);

    await assert.rejects(
        api.UI.createCampaign(),
        /en az bir teslim edilmiş sipariş seçin/i,
    );
    await assert.rejects(
        api.Campaign.create([], 'missing-template', 'template'),
        /Aktif bir teslimat mesajı şablonu seçin/,
    );
});

test('AI campaign instruction allows only an honest request for the dedicated preset', async () => {
    const { api } = await loadAssistant();
    const reviewTemplate = api.DEFAULT_TEMPLATES.find((item) => item.id === 'tpl-review-request');
    const deliveryTemplate = api.DEFAULT_TEMPLATES.find((item) => item.id === 'tpl-delivered');
    const reviewInstruction = api.campaignInstructionForTemplate(reviewTemplate);
    const deliveryInstruction = api.campaignInstructionForTemplate(deliveryTemplate);

    assert.match(reviewInstruction, /dürüst/i);
    assert.match(reviewInstruction, /belirli bir puan|olumlu yorum/i);
    assert.match(reviewInstruction, /teşvik/i);
    assert.match(deliveryInstruction, /Yorum isteme/i);
    assert.notEqual(reviewInstruction, deliveryInstruction);
    assert.equal(api.DEFAULT_SETTINGS.autoSendCampaign, false);
    assert.equal(api.campaignAutoSendAllowed({ purpose: 'review_request' }, { autoSendCampaign: true }), false);
    assert.equal(api.campaignAutoSendAllowed({ purpose: 'delivery_followup' }, { autoSendCampaign: true }), true);
});

test('status schema migration preserves operational state and fails closed on malformed outreach', async () => {
    const { api } = await loadAssistant();
    const normalized = api.normalizeStatusState({
        revision: 7,
        orders: { 'order-1': { status: 'inserted' } },
        reviews: { 'review-1': { status: 'sent' } },
        conversations: { 'conversation-1': { status: 'draft' } },
        outreach: {
            'order-1': {
                review_request: { decision: 'corrupt', workflow: 'corrupt', messageHash: 'abc' },
            },
        },
    });

    assert.equal(normalized.schemaVersion, 2);
    assert.equal(normalized.revision, 7);
    assert.equal(normalized.orders['order-1'].status, 'inserted');
    assert.equal(normalized.reviews['review-1'].status, 'sent');
    assert.equal(normalized.conversations['conversation-1'].status, 'draft');
    assert.equal(normalized.outreach['order-1'].review_request.decision, 'unknown');
    assert.equal(normalized.outreach['order-1'].review_request.workflow, 'ambiguous');
});

test('manual review decision is persistent, expires safely, and purpose dedupe is independent', async () => {
    const { api } = await loadAssistant();

    await api.Outreach.setManualDecision('order-1', 'eligible');
    const eligible = api.Outreach.record('order-1');
    assert.equal(eligible.decision, 'eligible');
    assert.equal(eligible.reason, 'review_missing_confirmed');
    assert.equal(api.Outreach.eligibilityIsFresh(eligible), true);
    assert.equal(api.Campaign.orderCanEnterCampaign('order-1', api.Store.statuses, 'review_request'), true);

    await api.Store.setOutreach('order-1', 'review_request', { workflow: 'sent', sentAt: new Date().toISOString() });
    assert.equal(api.Campaign.orderCanEnterCampaign('order-1', api.Store.statuses, 'review_request'), false);
    assert.equal(api.Campaign.orderCanEnterCampaign('order-1', api.Store.statuses, 'delivery_followup'), true);

    await api.Store.setOutreach('order-2', 'review_request', {
        decision: 'eligible',
        reason: 'review_missing_confirmed',
        evidenceExpiresAt: '2020-01-01T00:00:00.000Z',
        workflow: 'none',
    });
    assert.equal(api.Outreach.decisionUiValue(api.Outreach.record('order-2')), 'expired');
    assert.equal(api.Campaign.orderCanEnterCampaign('order-2', api.Store.statuses, 'review_request'), false);
});

test('review campaign freezes purpose and template hash and queues the outreach exactly once', async () => {
    const { api } = await loadAssistant();
    await api.Outreach.setManualDecision('order-1', 'eligible');
    const template = api.TemplateEngine.get('tpl-review-request');
    const expectedHash = api.templateFingerprint(template);
    const campaign = await api.Campaign.create([{
        orderId: 'order-1',
        customerName: 'Ashley Morgan',
        itemTitle: 'Custom Team Shirt',
        messageUrl: 'https://www.etsy.com/messages/order-1',
    }], template.id, 'template');

    assert.equal(campaign.purpose, 'review_request');
    assert.equal(campaign.templateHash, expectedHash);
    assert.equal(campaign.items[0].purpose, 'review_request');
    assert.equal(campaign.items[0].templateHash, expectedHash);
    const ledger = api.Outreach.record('order-1');
    assert.equal(ledger.workflow, 'queued');
    assert.equal(ledger.campaignId, campaign.id);
    assert.equal(ledger.campaignItemId, campaign.items[0].id);
    assert.equal(api.Campaign.orderCanEnterCampaign('order-1', api.Store.statuses, 'review_request'), false);

    template.purpose = 'delivery_followup';
    assert.equal(campaign.items[0].purpose, 'review_request', 'campaign snapshot must not follow later template edits');
});

test('campaign creation binds all order and review records in one status write and fails without a partial queue', async () => {
    const successEnvironment = await loadAssistant();
    const successApi = successEnvironment.api;
    await successApi.Outreach.setManualDecision('order-1', 'eligible');
    await successApi.Outreach.setManualDecision('order-2', 'eligible');
    const beforeRevision = successApi.Store.statuses.revision;
    const template = successApi.TemplateEngine.get('tpl-review-request');
    const orders = [
        { orderId: 'order-1', customerName: 'Ashley', itemTitle: 'First Shirt', messageUrl: 'https://www.etsy.com/messages/order-1' },
        { orderId: 'order-2', customerName: 'Morgan', itemTitle: 'Second Shirt', messageUrl: 'https://www.etsy.com/messages/order-2' },
    ];
    const campaign = await successApi.Campaign.create(orders, template.id, 'template');
    assert.equal(successApi.Store.statuses.revision, beforeRevision + 1);
    for (const item of campaign.items) {
        assert.equal(successApi.Store.statuses.orders[item.orderId].status, 'draft');
        assert.equal(successApi.Store.statuses.orders[item.orderId].campaignItemId, item.id);
        assert.equal(successApi.Outreach.record(item.orderId).workflow, 'queued');
    }

    const failureEnvironment = await loadAssistant();
    const { api, sandbox, storage } = failureEnvironment;
    await api.Outreach.setManualDecision('order-1', 'eligible');
    await api.Outreach.setManualDecision('order-2', 'eligible');
    const statusesBefore = copy(api.Store.statuses);
    const originalSetValue = sandbox.GM.setValue;
    let rejectedStatusWrite = false;
    sandbox.GM.setValue = async (key, value) => {
        if (key === api.KEYS.statuses && !rejectedStatusWrite) {
            rejectedStatusWrite = true;
            throw new Error('injected atomic status write failure');
        }
        return originalSetValue(key, value);
    };
    await assert.rejects(
        api.Campaign.create(orders, api.TemplateEngine.get('tpl-review-request').id, 'template'),
        /injected atomic status write failure/,
    );
    assert.deepEqual(copy(storage.get(api.KEYS.statuses)), statusesBefore);
    assert.equal(storage.get(api.KEYS.campaign).status, 'cancelled');
});

test('review decision control selects an eligible recipient and renders its durable state', async () => {
    const { api } = await loadAssistant();
    api.UI.state.selectedTemplateId = 'tpl-review-request';
    api.UI.state.orders = [{
        orderId: 'order-1', customerName: 'Ashley', itemTitle: 'Shirt', price: '$20',
        messageUrl: 'https://www.etsy.com/messages/order-1', delivered: true, status: { status: 'none' },
    }];
    api.UI.state.selectedOrders = new Set();
    await api.UI.onChange({ target: { dataset: { reviewDecision: 'order-1' }, value: 'eligible' } });

    assert.equal(api.UI.state.selectedOrders.has('order-1'), true);
    const markup = api.UI.renderOrders();
    assert.match(markup, /data-review-decision="order-1"/);
    assert.match(markup, /value="eligible" selected/);
    assert.match(markup, /data-order-select="order-1" checked/);
});

test('message campaign bar exposes the enabled user-triggered send-and-next action only for a ready draft', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/order-1';
    sandbox.location.href = 'https://www.etsy.com/messages/order-1';
    api.Store.campaign = {
        id: 'campaign-1', status: 'active', revision: 1, currentIndex: 0,
        items: [{
            id: 'item-1', campaignId: 'campaign-1', orderId: 'order-1', customerName: 'Ashley',
            messageUrl: sandbox.location.href, status: 'inserted', purpose: 'review_request',
            templateId: 'tpl-review-request', templateHash: 'hash', method: 'template',
        }],
    };
    api.Store.statuses.orders['order-1'] = { status: 'inserted', campaignId: 'campaign-1', campaignItemId: 'item-1' };
    api.Store.statuses.outreach['order-1'] = {
        review_request: {
            decision: 'eligible', reason: 'review_missing_confirmed', source: 'manual',
            evidenceExpiresAt: new Date(Date.now() + 60_000).toISOString(), workflow: 'prepared',
            campaignId: 'campaign-1', campaignItemId: 'item-1', templateHash: 'hash',
        },
    };
    api.UI.state.context = { customerName: 'Ashley', orderId: 'order-1', lastCustomerMessage: '' };
    const originalTextarea = api.MessageAdapter.getTextarea;
    const originalSendButton = api.MessageAdapter.getSendButton;
    api.MessageAdapter.getTextarea = () => ({ value: 'Prepared review request', offsetParent: {} });
    api.MessageAdapter.getSendButton = () => ({ disabled: false });
    try {
        const markup = api.UI.renderMessages();
        assert.match(markup, /data-action="campaign-send-next"/);
        assert.match(markup, /Gönder ve Sonrakine Geç/);
        assert.doesNotMatch(markup, /data-action="campaign-send-next" disabled/);
    } finally {
        api.MessageAdapter.getTextarea = originalTextarea;
        api.MessageAdapter.getSendButton = originalSendButton;
    }
});

test('guided send is single-flight and reuses the verified campaign dispatch path', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/order-1';
    sandbox.location.href = 'https://www.etsy.com/messages/order-1';
    const originalTextarea = api.MessageAdapter.getTextarea;
    const originalSendButton = api.MessageAdapter.getSendButton;
    const originalContext = api.MessageAdapter.context;
    const originalCountOutgoing = api.MessageAdapter.countOutgoing;
    const originalClaim = api.Campaign.claimInsertedCurrentForUser;
    const originalDispatch = api.Campaign.autoSendIfCurrent;
    const originalVerify = api.Verification.onSendClick;
    let dispatches = 0;
    let verifications = 0;
    api.MessageAdapter.getTextarea = () => ({ value: 'Edited final text', offsetParent: {} });
    api.MessageAdapter.getSendButton = () => ({ disabled: false });
    api.MessageAdapter.context = () => ({ conversationId: 'order-1' });
    api.MessageAdapter.countOutgoing = () => 0;
    api.Campaign.claimInsertedCurrentForUser = async () => ({
        campaign: { id: 'campaign-1', revision: 2 },
        reservation: { token: 'reservation-1' },
        messageHash: api.hashText('Edited final text'),
        item: {
            id: 'item-1', orderId: 'order-1', customerName: 'Ashley', method: 'template',
            messageUrl: sandbox.location.href,
            purpose: 'review_request', templateId: 'tpl-review-request', templateHash: 'template-hash',
        },
        route: {
            conversationId: 'order-1',
            conversationIdentity: 'order-1',
            routeFingerprint: '/messages/order-1|messages|order-1',
        },
    });
    api.Campaign.autoSendIfCurrent = async () => {
        dispatches += 1;
        return true;
    };
    api.Verification.onSendClick = async () => {
        verifications += 1;
        await new Promise(resolve => setTimeout(resolve, 20));
        return true;
    };
    try {
        const first = api.Campaign.sendCurrentByUser();
        const second = api.Campaign.sendCurrentByUser();
        assert.deepEqual(await Promise.all([first, second]), [true, true]);
        assert.equal(dispatches, 1);
        assert.equal(verifications, 1);
        assert.equal(api.Verification.pending.text, 'Edited final text');
        assert.equal(api.Verification.pending.advanceAfterVerified, true);
    } finally {
        api.Verification.activePromise = null;
        api.Verification.pending = null;
        api.MessageAdapter.getTextarea = originalTextarea;
        api.MessageAdapter.getSendButton = originalSendButton;
        api.MessageAdapter.context = originalContext;
        api.MessageAdapter.countOutgoing = originalCountOutgoing;
        api.Campaign.claimInsertedCurrentForUser = originalClaim;
        api.Campaign.autoSendIfCurrent = originalDispatch;
        api.Verification.onSendClick = originalVerify;
    }
});

test('verified send advances to the fresh next item, while stale state never navigates', async () => {
    const { api, storage, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/order-1';
    sandbox.location.href = 'https://www.etsy.com/messages/order-1';
    api.Store.settings.autoAdvanceCampaign = false;
    const campaign = {
        id: 'campaign-1', status: 'active', revision: 3, currentIndex: 1,
        items: [
            { id: 'item-1', status: 'sent', messageUrl: 'https://www.etsy.com/messages/order-1' },
            { id: 'item-2', status: 'pending', messageUrl: 'https://www.etsy.com/messages/order-2' },
        ],
    };
    storage.set(api.KEYS.campaign, JSON.parse(JSON.stringify(campaign)));
    storage.set(api.KEYS.statuses, api.normalizeStatusState({}));

    assert.equal(await api.Campaign.advanceAfterVerified({
        campaignId: 'campaign-1', campaignItemId: 'item-1', advanceAfterVerified: true,
    }), true);
    assert.equal(sandbox.location.href, 'https://www.etsy.com/messages/order-2');

    sandbox.location.href = 'https://www.etsy.com/messages/order-1';
    assert.equal(await api.Campaign.advanceAfterVerified({
        campaignId: 'campaign-1', campaignItemId: 'item-2', advanceAfterVerified: true,
    }), false);
    assert.equal(sandbox.location.href, 'https://www.etsy.com/messages/order-1');
});

test('legacy sent orders are backfilled without allowing a duplicate review request', async () => {
    const { api, storage } = await loadAssistant();
    const legacyStatuses = api.normalizeStatusState({
        revision: 4,
        orders: {
            'order-1': { status: 'sent', messageHash: 'review-hash', sentAt: '2026-08-09T10:00:00.000Z' },
        },
    });
    const legacyCampaign = {
        id: 'legacy-campaign', status: 'completed', revision: 3, currentIndex: 0,
        completedAt: '2026-08-09T10:00:00.000Z',
        items: [{
            id: 'legacy-item', orderId: 'order-1', status: 'sent', templateId: 'tpl-review-request',
            messageHash: 'review-hash', sentAt: '2026-08-09T10:00:00.000Z',
        }],
    };
    const backfilled = api.reconcileLegacyReviewOutreach(legacyStatuses, legacyCampaign, []);
    assert.equal(backfilled.outreach['order-1'].review_request.workflow, 'sent');
    assert.equal(backfilled.outreach['order-1'].review_request.campaignItemId, 'legacy-item');
    assert.equal(api.Campaign.orderCanEnterCampaign('order-1', backfilled, 'review_request'), false);
    assert.deepEqual(
        copy(api.reconcileLegacyReviewOutreach(backfilled, legacyCampaign, [])),
        copy(backfilled),
        'legacy reconciliation must be idempotent',
    );

    const nonReviewCampaign = {
        id: 'delivery-campaign', status: 'completed', revision: 2, currentIndex: 0,
        completedAt: '2026-08-09T09:00:00.000Z',
        items: [{
            id: 'delivery-item', campaignId: 'delivery-campaign', orderId: 'order-3', status: 'sent',
            purpose: 'delivery_followup', templateId: 'tpl-delivered', messageHash: 'delivery-hash',
            sentAt: '2026-08-09T09:00:00.000Z',
        }],
    };
    const mismatchedNonReview = api.reconcileLegacyReviewOutreach(api.normalizeStatusState({
        orders: {
            'order-3': {
                status: 'sent', campaignId: 'different-campaign', campaignItemId: 'different-item',
                messageHash: 'later-unknown-message',
            },
        },
    }), nonReviewCampaign, []);
    assert.equal(mismatchedNonReview.outreach['order-3'].review_request.workflow, 'ambiguous');
    const exactNonReview = api.reconcileLegacyReviewOutreach(api.normalizeStatusState({
        orders: {
            'order-3': {
                status: 'sent', campaignId: 'delivery-campaign', campaignItemId: 'delivery-item',
                messageHash: 'delivery-hash',
            },
        },
    }), nonReviewCampaign, []);
    assert.equal(exactNonReview.outreach['order-3'].review_request.workflow, 'none');
    assert.equal(exactNonReview.outreach['order-3'].review_request.reason, 'legacy_non_review_evidence');

    const emptyExisting = api.reconcileLegacyReviewOutreach(api.normalizeStatusState({
        orders: { 'order-4': { status: 'sent', messageHash: 'unknown-message' } },
        outreach: { 'order-4': { review_request: {} } },
    }), null, []);
    assert.equal(emptyExisting.outreach['order-4'].review_request.workflow, 'ambiguous');
    assert.equal(emptyExisting.outreach['order-4'].review_request.reason, 'legacy_sent_unknown_purpose');

    const explicitReviewWins = api.reconcileLegacyReviewOutreach(api.normalizeStatusState({
        orders: {
            'order-3': {
                status: 'sent', purpose: 'review_request', campaignId: 'delivery-campaign',
                campaignItemId: 'delivery-item', messageHash: 'delivery-hash',
            },
        },
    }), nonReviewCampaign, []);
    assert.equal(explicitReviewWins.outreach['order-3'].review_request.workflow, 'sent');

    const unknownPurpose = api.reconcileLegacyReviewOutreach(api.normalizeStatusState({
        orders: { 'order-5': { status: 'sent', purpose: 'delivery_followupp', messageHash: 'typo-purpose' } },
    }), null, []);
    assert.equal(unknownPurpose.outreach['order-5'].review_request.workflow, 'ambiguous');

    for (const reason of ['review_exists', 'deferred', 'blocked']) {
        const protectedDecision = api.reconcileLegacyReviewOutreach(api.normalizeStatusState({
            orders: { 'order-safe': { status: 'sent', messageHash: 'unknown-purpose' } },
            outreach: {
                'order-safe': {
                    review_request: { decision: 'ineligible', reason, source: 'manual', workflow: 'none' },
                },
            },
        }), null, []);
        const protectedRecord = protectedDecision.outreach['order-safe'].review_request;
        assert.equal(protectedRecord.decision, 'ineligible');
        assert.equal(protectedRecord.reason, reason);
        assert.equal(protectedRecord.workflow, 'ambiguous');
        assert.equal(protectedRecord.legacyPurposeAmbiguous, true);
        assert.equal(api.Outreach.decisionUiValue(protectedRecord), reason);
    }

    const blockedLegacy = api.reconcileLegacyReviewOutreach(api.normalizeStatusState({
        orders: { 'order-safe': { status: 'sent', messageHash: 'unknown-purpose' } },
        outreach: {
            'order-safe': {
                review_request: { decision: 'ineligible', reason: 'blocked', source: 'manual', workflow: 'none' },
            },
        },
    }), null, []);
    storage.set(api.KEYS.statuses, copy(blockedLegacy));
    api.Store.statuses = copy(blockedLegacy);
    await assert.rejects(api.Outreach.setManualDecision('order-safe', 'legacy_non_review'), /başka bir sekmede değişti/);
    assert.equal(api.Campaign.orderCanEnterCampaign('order-safe', api.Store.statuses, 'review_request'), false);
    await api.Outreach.setManualDecision('order-safe', 'unknown');
    assert.equal(api.Outreach.decisionUiValue(api.Outreach.record('order-safe')), 'legacy_unknown');
    await api.Outreach.setManualDecision('order-safe', 'legacy_non_review');
    assert.equal(api.Campaign.orderCanEnterCampaign('order-safe', api.Store.statuses, 'review_request'), true);

    const unknown = api.reconcileLegacyReviewOutreach(api.normalizeStatusState({
        orders: { 'order-2': { status: 'sent', messageHash: 'unknown-purpose' } },
    }), null, []);
    assert.equal(unknown.outreach['order-2'].review_request.workflow, 'ambiguous');
    assert.equal(unknown.outreach['order-2'].review_request.reason, 'legacy_sent_unknown_purpose');
    storage.set(api.KEYS.statuses, copy(unknown));
    api.Store.statuses = copy(unknown);
    await assert.rejects(api.Outreach.setManualDecision('order-2', 'eligible'), /Önceki gönderimin yorum talebi olmadığını/);
    await api.Outreach.setManualDecision('order-2', 'legacy_non_review');
    assert.equal(api.Campaign.orderCanEnterCampaign('order-2', api.Store.statuses, 'review_request'), true);
});

test('startup reconciliation atomically completes a verified campaign-first partial write', async () => {
    const { api, storage } = await loadAssistant();
    const campaign = {
        id: 'campaign-1', status: 'completed', revision: 4, currentIndex: 0,
        completedAt: '2026-08-10T11:00:00.000Z',
        items: [{
            id: 'item-1', campaignId: 'campaign-1', orderId: 'order-1', status: 'sent',
            purpose: 'review_request', templateId: 'tpl-review-request', templateHash: 'template-hash',
            messageHash: 'edited-hash', sentAt: '2026-08-10T11:00:00.000Z',
            sendResolutionOutcome: 'verified', sendAttemptToken: 'attempt-1',
        }],
    };
    const statuses = api.normalizeStatusState({
        revision: 8,
        orders: {
            'order-1': {
                status: 'sent_pending_verification', campaignId: 'campaign-1', campaignItemId: 'item-1',
                purpose: 'review_request', templateId: 'tpl-review-request', templateHash: 'template-hash',
                messageHash: 'edited-hash', sendAttemptToken: 'attempt-1',
                previousOrderStatus: { status: 'inserted' },
            },
        },
        outreach: {
            'order-1': {
                review_request: {
                    decision: 'eligible', reason: 'review_missing_confirmed', workflow: 'sent_pending_verification',
                    campaignId: 'campaign-1', campaignItemId: 'item-1', templateId: 'tpl-review-request',
                    templateHash: 'template-hash', messageHash: 'edited-hash', sendAttemptToken: 'attempt-1',
                },
            },
        },
    });
    storage.set(api.KEYS.campaign, copy(campaign));
    storage.set(api.KEYS.statuses, copy(statuses));
    api.Store.campaign = copy(campaign);
    api.Store.statuses = copy(statuses);

    assert.equal(await api.Store.migrateOperationalState(), true);
    assert.equal(api.Store.statuses.orders['order-1'].status, 'sent');
    assert.equal(api.Store.statuses.orders['order-1'].sendAttemptToken, '');
    assert.equal(api.Store.statuses.outreach['order-1'].review_request.workflow, 'sent');
    assert.equal(api.Store.statuses.outreach['order-1'].review_request.sendAttemptToken, '');
    const revision = api.Store.statuses.revision;
    assert.equal(await api.Store.migrateOperationalState(), false);
    assert.equal(api.Store.statuses.revision, revision);
});

test('guided send clicks Etsy Send once and persists the user-edited text hash', async () => {
    const environment = await loadAssistant();
    const { api } = environment;
    installGuidedFixture(environment);
    let outgoing = false;
    const button = makeNativeSendButton(() => { outgoing = true; });
    const textarea = { value: 'Edited final text', offsetParent: {} };
    const originals = {
        getTextarea: api.MessageAdapter.getTextarea,
        getSendButton: api.MessageAdapter.getSendButton,
        context: api.MessageAdapter.context,
        countOutgoing: api.MessageAdapter.countOutgoing,
        toast: api.UI.toast,
        refreshCurrent: api.UI.refreshCurrent,
    };
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.getSendButton = () => button;
    api.MessageAdapter.context = () => ({ conversationId: 'order-1', customerName: 'Ashley', orderId: 'order-1' });
    api.MessageAdapter.countOutgoing = () => outgoing ? 1 : 0;
    api.UI.toast = () => {};
    api.UI.refreshCurrent = async () => {};
    try {
        const first = api.Campaign.sendCurrentByUser();
        const second = api.Campaign.sendCurrentByUser();
        assert.deepEqual(await Promise.all([first, second]), [true, true]);
        assert.equal(button.clickCount, 1);
        const expectedHash = api.hashText('Edited final text');
        assert.equal(api.Store.campaign.status, 'completed');
        assert.equal(api.Store.campaign.items[0].status, 'sent');
        assert.equal(api.Store.campaign.items[0].messageHash, expectedHash);
        assert.equal(api.Store.statuses.orders['order-1'].status, 'sent');
        assert.equal(api.Store.statuses.orders['order-1'].messageHash, expectedHash);
        assert.equal(api.Store.statuses.outreach['order-1'].review_request.workflow, 'sent');
        assert.equal(api.Store.statuses.outreach['order-1'].review_request.messageHash, expectedHash);
    } finally {
        Object.assign(api.MessageAdapter, {
            getTextarea: originals.getTextarea,
            getSendButton: originals.getSendButton,
            context: originals.context,
            countOutgoing: originals.countOutgoing,
        });
        api.UI.toast = originals.toast;
        api.UI.refreshCurrent = originals.refreshCurrent;
    }
});

test('route drift, an empty composer, and a disabled Send never dispatch', async () => {
    const routeEnvironment = await loadAssistant();
    const { api, sandbox, storage } = routeEnvironment;
    const routeFixture = installGuidedFixture(routeEnvironment);
    const routeButton = makeNativeSendButton();
    api.MessageAdapter.getTextarea = () => ({ value: 'Edited final text', offsetParent: {} });
    api.MessageAdapter.getSendButton = () => routeButton;
    api.MessageAdapter.context = () => ({ conversationId: 'order-1' });
    api.MessageAdapter.countOutgoing = () => 0;
    const originalClaim = api.Campaign.claimInsertedCurrentForUser;
    api.Campaign.claimInsertedCurrentForUser = async function (text) {
        const claim = await originalClaim.call(this, text);
        sandbox.location.pathname = '/messages/order-2';
        sandbox.location.href = 'https://www.etsy.com/messages/order-2';
        return claim;
    };
    await assert.rejects(api.Campaign.sendCurrentByUser(), /Konuşma veya hazırlanan metin değişti/);
    assert.equal(routeButton.clickCount, 0);
    assert.equal(api.Store.campaign.items[0].status, 'inserted');
    assert.deepEqual(copy(api.Store.campaign.items[0]), copy(routeFixture.first));
    assert.equal(api.Store.campaign.items[0].reservation, undefined);
    assert.equal(storage.get(api.KEYS.campaign).items[0].reservation, undefined);
    assert.equal(api.Store.statuses.orders['order-1'].status, 'inserted');
    assert.equal(api.Store.statuses.outreach['order-1'].review_request.workflow, 'prepared');

    const emptyEnvironment = await loadAssistant();
    installGuidedFixture(emptyEnvironment);
    const emptyButton = makeNativeSendButton();
    emptyEnvironment.api.MessageAdapter.getTextarea = () => ({ value: '   ', offsetParent: {} });
    emptyEnvironment.api.MessageAdapter.getSendButton = () => emptyButton;
    await assert.rejects(emptyEnvironment.api.Campaign.sendCurrentByUser(), /gönderilecek metin bulunamadı/i);
    assert.equal(emptyButton.clickCount, 0);

    const disabledEnvironment = await loadAssistant();
    installGuidedFixture(disabledEnvironment);
    const disabledButton = makeNativeSendButton();
    disabledButton.disabled = true;
    disabledEnvironment.api.MessageAdapter.getTextarea = () => ({ value: 'Edited final text', offsetParent: {} });
    disabledEnvironment.api.MessageAdapter.getSendButton = () => null;
    await assert.rejects(disabledEnvironment.api.Campaign.sendCurrentByUser(), /Etkin Etsy Gönder düğmesi bulunamadı/);
    assert.equal(disabledButton.clickCount, 0);
});

test('failed outgoing verification remains pending and never moves to the next buyer', async () => {
    const environment = await loadAssistant();
    const { api, sandbox } = environment;
    installGuidedFixture(environment, { twoItems: true });
    const originalHref = sandbox.location.href;
    const button = makeNativeSendButton();
    const originals = {
        getTextarea: api.MessageAdapter.getTextarea,
        getSendButton: api.MessageAdapter.getSendButton,
        context: api.MessageAdapter.context,
        countOutgoing: api.MessageAdapter.countOutgoing,
        waitForOutgoing: api.MessageAdapter.waitForOutgoing,
        toast: api.UI.toast,
        refreshCurrent: api.UI.refreshCurrent,
    };
    api.MessageAdapter.getTextarea = () => ({ value: 'Edited final text', offsetParent: {} });
    api.MessageAdapter.getSendButton = () => button;
    api.MessageAdapter.context = () => ({ conversationId: 'order-1', customerName: 'Ashley', orderId: 'order-1' });
    api.MessageAdapter.countOutgoing = () => 0;
    api.MessageAdapter.waitForOutgoing = async () => false;
    api.UI.toast = () => {};
    api.UI.refreshCurrent = async () => {};
    try {
        assert.equal(await api.Campaign.sendCurrentByUser(), false);
        assert.equal(button.clickCount, 1);
        assert.equal(sandbox.location.href, originalHref);
        assert.equal(api.Store.campaign.currentIndex, 0);
        assert.equal(api.Store.campaign.items[0].status, 'sent_pending_verification');
        assert.equal(api.Store.campaign.items[1].status, 'pending');
        assert.equal(api.Store.statuses.orders['order-1'].status, 'sent_pending_verification');
        assert.equal(api.Store.statuses.outreach['order-1'].review_request.workflow, 'sent_pending_verification');
    } finally {
        Object.assign(api.MessageAdapter, {
            getTextarea: originals.getTextarea,
            getSendButton: originals.getSendButton,
            context: originals.context,
            countOutgoing: originals.countOutgoing,
            waitForOutgoing: originals.waitForOutgoing,
        });
        api.UI.toast = originals.toast;
        api.UI.refreshCurrent = originals.refreshCurrent;
    }
});

test('manual sent and not-sent reconciliation update campaign, order, and outreach consistently', async () => {
    const sentEnvironment = await loadAssistant();
    installPendingResolutionFixture(sentEnvironment);
    assert.equal(await sentEnvironment.api.Campaign.resolvePendingSend('order-1', 'sent'), 'sent');
    assert.equal(sentEnvironment.api.Store.campaign.items[0].status, 'sent');
    assert.equal(sentEnvironment.api.Store.campaign.currentIndex, 1);
    assert.equal(sentEnvironment.api.Store.statuses.orders['order-1'].status, 'sent');
    assert.equal(sentEnvironment.api.Store.statuses.orders['order-1'].manuallyConfirmed, true);
    assert.equal(sentEnvironment.api.Store.statuses.outreach['order-1'].review_request.workflow, 'sent');

    const notSentEnvironment = await loadAssistant();
    const fixture = installPendingResolutionFixture(notSentEnvironment);
    assert.equal(await notSentEnvironment.api.Campaign.resolvePendingSend('order-1', 'not_sent'), 'not_sent');
    assert.equal(notSentEnvironment.api.Store.campaign.items[0].status, 'inserted');
    assert.equal(notSentEnvironment.api.Store.campaign.currentIndex, 0);
    assert.deepEqual(copy(notSentEnvironment.api.Store.statuses.orders['order-1']), copy(fixture.previousOrderStatus));
    assert.deepEqual(
        copy(notSentEnvironment.api.Store.statuses.outreach['order-1'].review_request),
        copy(fixture.previousOutreach),
    );
});

test('cancel and skip restore the exact prior non-review order status', async () => {
    async function prepare(environment) {
        const { api } = environment;
        const generic = {
            status: 'sent', purpose: 'delivery_followup', templateId: 'tpl-delivered',
            messageHash: 'generic-message-hash', sentAt: '2026-08-09T08:00:00.000Z',
        };
        await api.Store.setStatus('orders', 'order-1', generic);
        await api.Outreach.setManualDecision('order-1', 'eligible');
        const original = copy(api.Store.statuses.orders['order-1']);
        api.UI.state.selectedTemplateId = 'tpl-review-request';
        api.UI.state.composeMethod = 'template';
        api.UI.state.orders = [{
            orderId: 'order-1', customerName: 'Ashley', itemTitle: 'Shirt', delivered: true,
            messageUrl: 'https://www.etsy.com/messages/order-1',
        }];
        api.UI.state.selectedOrders = new Set(['order-1']);
        api.UI.setBusy = () => {};
        api.UI.toast = () => {};
        api.UI.refreshCurrent = async () => {};
        await api.UI.createCampaign();
        return original;
    }

    const cancelEnvironment = await loadAssistant();
    const cancelOriginal = await prepare(cancelEnvironment);
    await cancelEnvironment.api.Campaign.cancel();
    assert.deepEqual(copy(cancelEnvironment.api.Store.statuses.orders['order-1']), cancelOriginal);
    const cancelledOutreach = cancelEnvironment.api.Store.statuses.outreach['order-1'].review_request;
    assert.equal(cancelledOutreach.decision, 'eligible');
    assert.equal(cancelledOutreach.workflow, 'none');

    const skipEnvironment = await loadAssistant();
    const skipOriginal = await prepare(skipEnvironment);
    await skipEnvironment.api.Campaign.skipCurrent();
    assert.deepEqual(copy(skipEnvironment.api.Store.statuses.orders['order-1']), skipOriginal);
    const skippedOutreach = skipEnvironment.api.Store.statuses.outreach['order-1'].review_request;
    assert.equal(skippedOutreach.decision, 'ineligible');
    assert.equal(skippedOutreach.reason, 'deferred');
    assert.equal(skippedOutreach.workflow, 'none');
});

test('a native Etsy Send click during guided preparation is suppressed before the one guided dispatch', async () => {
    const environment = await loadAssistant();
    const { api, documentListeners } = environment;
    installGuidedFixture(environment);
    let outgoing = false;
    let captureHandler = null;
    let nativePrevented = false;
    let nativeStopped = false;
    const button = makeNativeSendButton(
        () => { outgoing = true; },
        (event) => {
            captureHandler?.(event);
            nativePrevented ||= event.defaultPrevented;
            nativeStopped ||= event.immediatePropagationStopped;
        },
    );
    api.MessageAdapter.getTextarea = () => ({ value: 'Edited final text', offsetParent: {} });
    api.MessageAdapter.getSendButton = () => button;
    api.MessageAdapter.context = () => ({ conversationId: 'order-1', customerName: 'Ashley', orderId: 'order-1' });
    api.MessageAdapter.countOutgoing = () => outgoing ? 1 : 0;
    api.MessageAdapter.isSendButton = target => target === button;
    api.UI.toast = () => {};
    api.UI.refreshCurrent = async () => {};
    api.UI.shadow = { addEventListener() {} };
    api.UI.bind();
    captureHandler = documentListeners.get('click')?.at(-1);
    assert.equal(typeof captureHandler, 'function');

    const originalClaim = api.Campaign.claimInsertedCurrentForUser;
    api.Campaign.claimInsertedCurrentForUser = async function (text) {
        const claim = await originalClaim.call(this, text);
        button.click();
        return claim;
    };

    assert.equal(await api.Campaign.sendCurrentByUser(), true);
    assert.equal(nativePrevented, true);
    assert.equal(nativeStopped, true);
    assert.equal(button.clickCount, 1);
    assert.equal(api.Store.statuses.orders['order-1'].status, 'sent');
});

test('guided send keeps the native-click lock until its own queued verification finishes', async () => {
    const environment = await loadAssistant();
    const { api, documentListeners } = environment;
    installGuidedFixture(environment);
    let captureHandler = null;
    const button = makeNativeSendButton(() => {}, event => captureHandler?.(event));
    const textarea = { value: 'Edited final text', offsetParent: {} };
    let resolveOld = null;
    let resolveGuided = null;
    let oldStarted = false;
    let guidedStarted = false;
    const oldGate = new Promise(resolve => { resolveOld = resolve; });
    const guidedGate = new Promise(resolve => { resolveGuided = resolve; });
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.getSendButton = () => button;
    api.MessageAdapter.context = () => ({ conversationId: 'order-1', customerName: 'Ashley', orderId: 'order-1' });
    api.MessageAdapter.countOutgoing = () => 0;
    api.MessageAdapter.waitForOutgoing = async text => {
        if (text === 'Older independent message') {
            oldStarted = true;
            return oldGate;
        }
        guidedStarted = true;
        return guidedGate;
    };
    api.MessageAdapter.isSendButton = target => target === button;
    api.UI.toast = () => {};
    api.UI.refreshCurrent = async () => {};
    api.UI.shadow = { addEventListener() {} };
    api.UI.bind();
    captureHandler = documentListeners.get('click')?.at(-1);

    api.Verification.prepare('Older independent message', {
        conversationId: 'order-1',
        routeFingerprint: api.Router.routeFingerprint(),
        orderId: 'older-order',
        method: 'manual',
    });
    const olderVerification = api.Verification.onSendClick();
    await waitUntil(() => oldStarted, 'older verification did not start');

    let guidedSettled = false;
    const guidedSend = api.Campaign.sendCurrentByUser().finally(() => { guidedSettled = true; });
    await waitUntil(() => button.clickCount === 1, 'guided native dispatch did not start');
    assert.equal(api.Campaign.manualDispatchActive, true);

    resolveOld(true);
    await waitUntil(() => guidedStarted, 'guided verification did not start after the older verification');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(await olderVerification, true);
    assert.equal(guidedSettled, false);
    assert.equal(api.Campaign.manualDispatchActive, true);

    button.click();
    assert.equal(button.clickCount, 1, 'a second native click must remain suppressed during guided verification');
    resolveGuided(true);
    assert.equal(await guidedSend, true);
    assert.equal(api.Campaign.manualDispatchActive, false);
    assert.equal(api.Store.statuses.orders['order-1'].status, 'sent');
});

test('not-sent recovery can resume after its first status restore is interrupted', async () => {
    const environment = await loadAssistant();
    const { api } = environment;
    const fixture = installPendingResolutionFixture(environment);
    const originalRestore = api.Store.restoreSendAttemptPairLocked;
    let restoreCalls = 0;
    api.Store.restoreSendAttemptPairLocked = async function (...args) {
        restoreCalls += 1;
        if (restoreCalls === 1) throw new Error('injected status restore interruption');
        return originalRestore.apply(this, args);
    };

    await assert.rejects(
        api.Campaign.resolvePendingSend('order-1', 'not_sent'),
        /injected status restore interruption/,
    );
    assert.equal(api.Store.campaign.items[0].status, 'inserted');
    assert.equal(api.Store.campaign.items[0].sendResolutionOutcome, 'not_sent');
    assert.equal(api.Store.campaign.items[0].sendResolutionToken, fixture.attemptToken);
    assert.equal(api.Store.statuses.orders['order-1'].status, 'sent_pending_verification');

    assert.equal(await api.Campaign.resolvePendingSend('order-1', 'not_sent'), 'not_sent');
    assert.deepEqual(copy(api.Store.statuses.orders['order-1']), copy(fixture.previousOrderStatus));
    assert.deepEqual(
        copy(api.Store.statuses.outreach['order-1'].review_request),
        copy(fixture.previousOutreach),
    );
});

test('a draft resolved as not sent can be dispatched and verified on a fresh attempt', async () => {
    const environment = await loadAssistant();
    const { api } = environment;
    installPendingResolutionFixture(environment);
    assert.equal(await api.Campaign.resolvePendingSend('order-1', 'not_sent'), 'not_sent');
    assert.equal(api.Store.campaign.items[0].sendResolutionOutcome, 'not_sent');

    let outgoing = false;
    const button = makeNativeSendButton(() => { outgoing = true; });
    api.MessageAdapter.getTextarea = () => ({ value: 'Edited final text', offsetParent: {} });
    api.MessageAdapter.getSendButton = () => button;
    api.MessageAdapter.context = () => ({ conversationId: 'order-1', customerName: 'Ashley', orderId: 'order-1' });
    api.MessageAdapter.countOutgoing = () => outgoing ? 1 : 0;
    api.UI.toast = () => {};
    api.UI.refreshCurrent = async () => {};

    assert.equal(await api.Campaign.sendCurrentByUser(), true);
    assert.equal(button.clickCount, 1);
    assert.equal(api.Store.campaign.items[0].status, 'sent');
    assert.equal(api.Store.campaign.items[0].sendResolutionOutcome, 'verified');
    assert.equal(api.Store.statuses.orders['order-1'].status, 'sent');
    assert.equal(api.Store.statuses.outreach['order-1'].review_request.workflow, 'sent');
});

test('a stale legacy override cannot downgrade a terminal review outreach record', async () => {
    const { api, storage } = await loadAssistant();
    const ambiguous = api.reconcileLegacyReviewOutreach(api.normalizeStatusState({
        revision: 1,
        orders: { 'order-1': { status: 'sent', messageHash: 'legacy-message' } },
    }), null, []);
    storage.set(api.KEYS.statuses, copy(ambiguous));
    api.Store.statuses = copy(ambiguous);

    const terminal = copy(ambiguous);
    terminal.revision += 1;
    terminal.outreach['order-1'].review_request.workflow = 'sent';
    terminal.outreach['order-1'].review_request.reason = '';
    terminal.outreach['order-1'].review_request.sentAt = '2026-08-10T12:00:00.000Z';
    storage.set(api.KEYS.statuses, copy(terminal));

    await assert.rejects(
        api.Outreach.setManualDecision('order-1', 'legacy_non_review'),
        /başka bir sekmede değişti/,
    );
    assert.equal(storage.get(api.KEYS.statuses).outreach['order-1'].review_request.workflow, 'sent');
});

test('not-sent resolution cannot downgrade an outreach record already finalized as sent', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    installPendingResolutionFixture(environment);
    const terminalStatuses = copy(api.Store.statuses);
    terminalStatuses.revision += 1;
    terminalStatuses.outreach['order-1'].review_request.workflow = 'sent';
    terminalStatuses.outreach['order-1'].review_request.sendAttemptToken = '';
    terminalStatuses.outreach['order-1'].review_request.sentAt = '2026-08-10T12:00:00.000Z';
    storage.set(api.KEYS.statuses, copy(terminalStatuses));
    api.Store.statuses = copy(terminalStatuses);
    const campaignBefore = copy(api.Store.campaign);

    await assert.rejects(
        api.Campaign.resolvePendingSend('order-1', 'not_sent'),
        /terminal durum korunarak geri alma durduruldu/,
    );
    assert.deepEqual(copy(api.Store.campaign), campaignBefore);
    assert.equal(api.Store.statuses.orders['order-1'].status, 'sent_pending_verification');
    assert.equal(api.Store.statuses.outreach['order-1'].review_request.workflow, 'sent');
});

test('not-sent recovery preserves a newer manual review decision made while verification was pending', async () => {
    const environment = await loadAssistant();
    const { api } = environment;
    installPendingResolutionFixture(environment);
    await api.Outreach.setManualDecision('order-1', 'review_exists');
    const pendingDecision = api.Store.statuses.outreach['order-1'].review_request;
    assert.equal(pendingDecision.workflow, 'sent_pending_verification');
    assert.equal(pendingDecision.decision, 'ineligible');
    assert.equal(pendingDecision.reason, 'review_exists');

    assert.equal(await api.Campaign.resolvePendingSend('order-1', 'not_sent'), 'not_sent');
    const restored = api.Store.statuses.outreach['order-1'].review_request;
    assert.equal(restored.workflow, 'prepared');
    assert.equal(restored.decision, 'ineligible');
    assert.equal(restored.reason, 'review_exists');
    assert.equal(api.Campaign.orderCanEnterCampaign('order-1', api.Store.statuses, 'review_request'), false);
});

test('releasing an early guided claim preserves a newer review decision from another tab', async () => {
    const environment = await loadAssistant();
    const { api } = environment;
    const fixture = installGuidedFixture(environment);
    const claim = await api.Campaign.claimInsertedCurrentForUser('Edited final text');
    assert.ok(claim?.reservation?.token);

    await api.Outreach.setManualDecision('order-1', 'review_exists');
    assert.equal(await api.Campaign.releaseInsertedClaim(claim), true);
    const outreach = api.Store.statuses.outreach['order-1'].review_request;
    assert.equal(outreach.decision, 'ineligible');
    assert.equal(outreach.reason, 'review_exists');
    assert.deepEqual(copy(api.Store.campaign.items[0]), copy(fixture.first));
});
