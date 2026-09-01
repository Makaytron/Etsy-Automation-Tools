import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
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

async function loadAssistant(options = {}) {
    const storage = options.storage || new Map();
    const noop = () => {};
    const documentListeners = new Map();
    const lockTails = options.lockTails || new Map();
    const valueListeners = options.valueListeners || new Map();
    const environmentId = Symbol('message-assistant-test-environment');
    const cloneStored = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    const notifyValueListeners = (key, oldValue, newValue) => {
        for (const listener of valueListeners.get(key) || []) {
            listener.handler(key, cloneStored(oldValue), cloneStored(newValue), listener.environmentId !== environmentId);
        }
    };
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
        getValue: async (key, fallback) => cloneStored(storage.has(key) ? storage.get(key) : fallback),
        setValue: async (key, value) => {
            const oldValue = cloneStored(storage.get(key));
            const nextValue = cloneStored(value);
            storage.set(key, nextValue);
            notifyValueListeners(key, oldValue, nextValue);
        },
        deleteValue: async (key) => {
            const oldValue = cloneStored(storage.get(key));
            const deleted = storage.delete(key);
            if (deleted) notifyValueListeners(key, oldValue, undefined);
            return deleted;
        },
        addValueChangeListener(key, handler) {
            const listeners = valueListeners.get(key) || [];
            const listener = { environmentId, handler };
            listeners.push(listener);
            valueListeners.set(key, listeners);
            return listener;
        },
        registerMenuCommand: noop,
        getResourceURL: async () => '',
        openInTab: noop,
    };
    class FakeElement {}
    const sandbox = {
        console,
        URL,
        URLSearchParams,
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
        crypto: webcrypto,
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
                request: async (name, lockOptions, operation) => {
                    options.requestedLocks?.push(name);
                    if (lockOptions?.ifAvailable && lockTails.has(name)) return operation(null);
                    const previous = lockTails.get(name) || Promise.resolve();
                    let release = null;
                    const turn = new Promise(resolve => { release = resolve; });
                    const tail = previous.catch(() => {}).then(() => turn);
                    lockTails.set(name, tail);
                    await previous.catch(() => {});
                    try {
                        return await operation({ name, mode: lockOptions?.mode || 'exclusive' });
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
        GM_addValueChangeListener: (key, handler) => GM.addValueChangeListener(key, handler),
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
        History,
        TemplateEngine,
        ConfigManager,
        Campaign,
        Outreach,
        Verification,
        MessageAdapter,
        ConversationTranslations,
        ComposerQuickActions,
        OrdersAdapter,
        MessageCenterAgent,
        ReviewsAdapter,
        GMX,
        Translator,
        Heuristics,
        Prompt,
        AI,
        Router,
        Updates,
        UI,
        App,
        mergeDefaultTemplates,
        campaignInstructionForTemplate,
        campaignAutoSendAllowed,
        sendErrorGuidance,
        normalizeStatusState,
        reconcileLegacyReviewOutreach,
        templateFingerprint,
        hashText,
        sha256Text,
        canonicalMessageLayout,
        formatGeneratedMessage,
        downloadText,
    });`);
    const context = vm.createContext(sandbox);
    await vm.runInContext(instrumented, context, { filename: scriptPath });
    assert.ok(sandbox.__MEMA_TEST__, 'Message Assistant test API was not exposed.');
    return { api: sandbox.__MEMA_TEST__, storage, sandbox, documentListeners };
}

const copy = (value) => JSON.parse(JSON.stringify(value));

const readUserscriptSource = () => fs.readFileSync(scriptPath, 'utf8');

function readTemplateConstant(name) {
    const source = readUserscriptSource();
    const prefix = `const ${name} = \``;
    const start = source.indexOf(prefix);
    assert.notEqual(start, -1, `${name} must exist in the userscript source.`);
    const valueStart = start + prefix.length;
    const end = source.indexOf('`;', valueStart);
    assert.notEqual(end, -1, `${name} must be a template-literal constant.`);
    return source.slice(valueStart, end);
}

test('message context reads only the active composer panel and fails closed when the composer is ambiguous', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/active-conversation';
    sandbox.location.href = 'https://www.etsy.com/messages/active-conversation';

    const buyerHeader = {
        textContent: 'Active Buyer',
        closest: () => ({ querySelector: selector => selector === 'img' ? { src: 'https://img.example/active.jpg' } : null }),
    };
    const customerBubble = {
        id: 'active-customer-message',
        innerText: 'Active customer message',
        textContent: 'Active customer message',
        className: 'message-bubble',
        closest: () => ({ className: 'wt-grid' }),
    };
    const sellerBubble = {
        id: 'active-seller-message',
        innerText: 'Active seller reply',
        textContent: 'Active seller reply',
        className: 'message-bubble surface-informational-subtle',
        closest: () => ({ className: 'wt-grid justify-content-flex-end' }),
    };
    const sidebarBubble = {
        id: 'sidebar-message',
        innerText: 'Wrong sidebar preview',
        textContent: 'Wrong sidebar preview',
        className: 'message-bubble',
        closest: () => ({ className: 'wt-grid' }),
    };
    const orderLink = { href: 'https://www.etsy.com/your/orders/sold?order_id=22222222' };
    const listingLink = {
        textContent: 'Active Item Title',
        getAttribute: name => name === 'title' ? 'Active Item Title' : '',
        querySelector: () => null,
    };
    const activePanel = {
        parentElement: null,
        contains: element => element === activeTextarea || [customerBubble, sellerBubble].includes(element),
        querySelector(selector) {
            if (selector === 'h3.buyer-name a' || selector === 'h3.buyer-name') return buyerHeader;
            if (selector === 'a[href*="order_id="]') return orderLink;
            return null;
        },
        querySelectorAll(selector) {
            if (selector === api.MessageAdapter.bubbleSelector) return [customerBubble, sellerBubble];
            if (selector.includes('textarea')) return [activeTextarea];
            if (selector === 'a[href*="/listing/"], a[href*="/transaction/"]') return [listingLink];
            return [];
        },
    };
    const activeTextarea = {
        offsetParent: {},
        parentElement: activePanel,
        closest: selector => selector.includes('[role="tabpanel"]') ? broadMessagesRoot : null,
    };
    const broadMessagesRoot = {
        parentElement: null,
        contains: () => true,
        querySelector(selector) {
            if (selector.includes('buyer-name')) return {
                textContent: 'Wrong Sidebar Buyer',
                closest: () => ({ querySelector: () => ({ src: 'https://img.example/wrong-sidebar.jpg' }) }),
            };
            if (selector.includes('order_id=')) return { href: 'https://www.etsy.com/?order_id=99999999' };
            return null;
        },
        querySelectorAll(selector) {
            if (selector === api.MessageAdapter.bubbleSelector) return [sidebarBubble, customerBubble, sellerBubble];
            if (selector.includes('textarea')) return [activeTextarea];
            if (selector.includes('/messages/') || selector.includes('/conversations/')) {
                return [{ href: 'https://www.etsy.com/messages/sidebar-conversation' }];
            }
            return [];
        },
    };
    activePanel.parentElement = broadMessagesRoot;

    sandbox.document.querySelectorAll = (selector) => {
        if (selector === api.MessageAdapter.bubbleSelector) return [sidebarBubble, customerBubble, sellerBubble];
        if (selector.includes('textarea')) return [activeTextarea];
        if (selector.includes('/listing/') || selector.includes('/transaction/')) return [{
            textContent: 'Wrong sidebar item', getAttribute: () => 'Wrong sidebar item', querySelector: () => null,
        }];
        return [];
    };
    sandbox.document.querySelector = (selector) => {
        if (selector.includes('buyer-name') || selector.includes('scrolling-message-list')) return {
            textContent: 'Wrong Sidebar Buyer',
            closest: () => ({ querySelector: () => ({ src: 'https://img.example/wrong-sidebar.jpg' }) }),
        };
        if (selector.includes('order_id=')) return { href: 'https://www.etsy.com/?order_id=99999999' };
        return null;
    };
    sandbox.document.body.innerText = 'Wrong sidebar order #99999999';

    const context = api.MessageAdapter.context();
    assert.equal(context.customerName, 'Active Buyer');
    assert.equal(context.customerAvatar, 'https://img.example/active.jpg');
    assert.equal(context.orderId, '22222222');
    assert.equal(context.itemTitle, 'Active Item Title');
    assert.deepEqual(copy(context.messages.map(message => message.text)), ['Active customer message', 'Active seller reply']);
    assert.equal(context.lastCustomerMessage, 'Active customer message');

    const secondTextarea = { offsetParent: {}, parentElement: activePanel, closest: activeTextarea.closest };
    sandbox.document.querySelectorAll = selector => selector.includes('textarea')
        ? [activeTextarea, secondTextarea]
        : [sidebarBubble];
    const ambiguous = api.MessageAdapter.context();
    assert.equal(api.MessageAdapter.getTextarea(), null);
    assert.equal(ambiguous.conversationId, '');
    assert.equal(ambiguous.customerName, '');
    assert.equal(ambiguous.customerAvatar, '');
    assert.equal(ambiguous.orderId, '');
    assert.equal(ambiguous.itemTitle, '');
    assert.deepEqual(copy(ambiguous.messages), []);
    assert.equal(ambiguous.lastCustomerMessage, '');
});

test('a stale composer whose declared thread differs from the route is blocked for every send path', async () => {
    const environment = await loadAssistant();
    const { api, sandbox, documentListeners } = environment;
    sandbox.location.pathname = '/messages/conversation-a';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/conversation-a';
    let captureHandler = null;
    const button = makeNativeSendButton(() => {}, event => captureHandler?.(event));
    const panel = {
        parentElement: sandbox.document.body,
        hasAttribute: name => name === 'data-conversation-id',
        getAttribute: name => name === 'data-conversation-id' ? 'conversation-b' : null,
        querySelector: () => null,
        querySelectorAll(selector) {
            if (selector.includes('textarea')) return [textarea];
            if (selector === 'button') return [button];
            return [];
        },
    };
    const textarea = Object.assign(new sandbox.HTMLTextAreaElement(), {
        value: 'Text in the stale conversation B composer',
        offsetParent: {},
        parentElement: panel,
        getClientRects: () => [{}],
        closest(selector) {
            if (selector === api.MessageAdapter.conversationScopeSelector) return panel;
            return null;
        },
    });
    button.closest = selector => {
        if (selector === 'button') return button;
        if (selector === api.MessageAdapter.conversationScopeSelector) return panel;
        return null;
    };
    sandbox.document.querySelectorAll = selector => selector.includes('textarea') ? [textarea] : [];

    assert.deepEqual(copy(api.MessageAdapter.composerRouteBinding(textarea)), {
        declared: true,
        valid: true,
        identity: 'conversation-b',
    });
    assert.equal(api.MessageAdapter.getConversationScope(textarea), null);
    assert.equal(api.MessageAdapter.getTextarea(), null);
    assert.equal(api.MessageAdapter.getSendButton(), null);
    assert.equal(api.MessageAdapter.context().conversationId, '');

    api.UI.toast = () => {};
    api.UI.shadow = { addEventListener() {} };
    api.UI.bind();
    captureHandler = documentListeners.get('click')?.at(-1);
    button.click();
    assert.equal(button.clickCount, 0, 'an explicitly labelled native Send in a stale thread must be prevented');
    const externalForm = { querySelectorAll: () => [] };
    const externalSend = makeNativeSendButton(() => {}, event => captureHandler?.(event));
    externalSend.closest = selector => selector === 'button' ? externalSend : (selector === 'form' ? externalForm : null);
    externalSend.click();
    assert.equal(externalSend.clickCount, 1, 'an unrelated Send control outside every composer scope must remain untouched');

    const agent = configureMessageCenter(environment);
    const job = messageCenterJob({ id: 'job-stale-dom-thread' });
    let contextReads = 0;
    let insertCalls = 0;
    const results = [];
    agent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job };
        if (requestPath.includes('/result')) results.push(copy(body));
        return {};
    };
    api.MessageAdapter.waitForContext = async () => {
        contextReads += 1;
        return api.MessageAdapter.context();
    };
    api.MessageAdapter.insert = () => { insertCalls += 1; };
    assert.equal(await agent.processNextJob(), false);
    assert.equal(contextReads, 1);
    assert.equal(insertCalls, 0);
    assert.equal(button.clickCount, 0);
    assert.equal(results.some(result => result.status === 'sent'), false);

    installGuidedFixture(environment);
    assert.equal(api.MessageAdapter.getTextarea(), null);
    await assert.rejects(api.Campaign.sendCurrentByUser(), /gönderilecek metin bulunamadı/i);
    assert.equal(insertCalls, 0);
    assert.equal(button.clickCount, 0);
});

test('a compose panel recipient placeholder remains bound to its exact compose route', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/new';
    sandbox.location.search = '?with_id=123&referring_id=987&referring_type=receipt';
    sandbox.location.href = `https://www.etsy.com/messages/new${sandbox.location.search}`;
    let panelReceiptId = '987';
    const panel = {
        parentElement: sandbox.document.body,
        hasAttribute: name => name === 'data-conversation-id',
        getAttribute: name => name === 'data-conversation-id' ? 'compose-123' : null,
        querySelectorAll(selector) {
            if (selector.includes('textarea')) return [textarea];
            if (selector === 'a[href*="order_id="]') {
                return [{ href: `https://www.etsy.com/your/orders/sold?order_id=${panelReceiptId}` }];
            }
            return [];
        },
    };
    const textarea = Object.assign(new sandbox.HTMLTextAreaElement(), {
        value: 'Compose draft',
        offsetParent: {},
        parentElement: panel,
        getClientRects: () => [{}],
        closest: selector => selector === api.MessageAdapter.conversationScopeSelector ? panel : null,
    });
    sandbox.document.querySelectorAll = selector => selector.includes('textarea') ? [textarea] : [];

    assert.equal(api.Router.conversationIdentity(), 'compose:123:receipt:987');
    assert.deepEqual(copy(api.MessageAdapter.composerRouteBinding(textarea)), {
        declared: true,
        valid: true,
        identity: 'compose:123:receipt:987',
    });
    assert.equal(api.MessageAdapter.getTextarea(), textarea);
    panelReceiptId = '';
    sandbox.document.body.querySelectorAll = selector => selector === 'a[href*="order_id="]'
        ? [{ href: 'https://www.etsy.com/your/orders/sold?order_id=555' }]
        : [];
    assert.equal(api.MessageAdapter.getTextarea(), textarea, 'an unrelated body/sidebar receipt must not bind the local composer');
    panelReceiptId = '988';
    assert.equal(api.MessageAdapter.getTextarea(), null, 'the same recipient cannot bind a composer from another receipt');
});

test('live message and review bindings distinguish emoji-only content changes', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/emoji-thread';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/emoji-thread';
    const routeFingerprint = api.Router.routeFingerprint();
    const first = {
        conversationId: 'emoji-thread', routeFingerprint,
        lastCustomerMessage: 'Order 😀',
    };
    const changed = { ...first, lastCustomerMessage: 'Order 😁' };

    assert.equal(api.UI.messageContextChanged(changed, first), true);
    const work = api.UI.beginMessageWork(first);
    api.MessageAdapter.context = () => changed;
    assert.equal(api.UI.messageWorkIsCurrent(work), false);

    api.MessageAdapter.getMessages = () => [{ text: first.lastCustomerMessage }];
    api.MessageAdapter.getTextarea = () => null;
    const firstFingerprint = api.Router.fingerprint();
    api.MessageAdapter.getMessages = () => [{ text: changed.lastCustomerMessage }];
    assert.notEqual(api.Router.fingerprint(), firstFingerprint);

    const reviewWork = api.UI.beginReviewWork({ id: 'review-emoji', text: 'Great 😀' });
    api.UI.state.selectedReviewId = 'review-emoji';
    api.UI.state.reviews = [{ id: 'review-emoji', text: 'Great 😁' }];
    assert.equal(api.UI.reviewWorkIsCurrent(reviewWork), false);

    const publicReview = { id: 'public-emoji', text: 'Public review 😀', customerName: 'Emoji' };
    api.UI.state.selectedReviewId = publicReview.id;
    api.UI.state.reviews = [publicReview];
    const publicBinding = api.UI.beginReviewWork(publicReview);
    api.UI.state.reviewAnalysisBinding = publicBinding;
    api.UI.state.reviewAnalysis = { public_reply: 'Public reply 😀' };
    const originals = {
        insertPublic: api.ReviewsAdapter.insertPublic,
        setBusy: api.UI.setBusy,
        setStatus: api.Store.setStatus,
    };
    let statusWrites = 0;
    api.UI.setBusy = () => {};
    api.Store.setStatus = async () => { statusWrites += 1; };
    api.ReviewsAdapter.insertPublic = async (_review, _text, { isCurrent }) => {
        api.UI.state.reviewAnalysis.public_reply = 'Public reply 😁';
        assert.equal(isCurrent(), false);
    };
    try {
        await assert.rejects(api.UI.insertReviewPublic(), /Yorum|sayfa|değişti/i);
        assert.equal(statusWrites, 0);
    } finally {
        api.ReviewsAdapter.insertPublic = originals.insertPublic;
        api.UI.setBusy = originals.setBusy;
        api.Store.setStatus = originals.setStatus;
    }
});

test('message composer resolution rejects a unique unrelated textarea outside an active conversation', async () => {
    const { api, sandbox } = await loadAssistant();
    const unrelatedTextarea = Object.assign(new sandbox.HTMLTextAreaElement(), {
        offsetParent: {},
        value: 'Keep this text',
        dispatchEvent() {},
        focus() {},
        closest: () => null,
        parentElement: null,
    });
    sandbox.document.querySelectorAll = selector => selector.includes('textarea') ? [unrelatedTextarea] : [];

    sandbox.location.pathname = '/your/orders/sold/completed';
    sandbox.location.href = 'https://www.etsy.com/your/orders/sold/completed';
    assert.equal(api.MessageAdapter.getTextarea(), null);
    assert.throws(() => api.MessageAdapter.insert('Must not be inserted'), /cevap alanı bulunamadı/i);
    await assert.rejects(api.MessageAdapter.insertWhenReady('Must not be inserted', 0), /cevap alanı bulunamadı/i);
    assert.equal(unrelatedTextarea.value, 'Keep this text');

    sandbox.location.pathname = '/messages';
    sandbox.location.href = 'https://www.etsy.com/messages';
    assert.equal(api.MessageAdapter.getTextarea(), null);
    assert.equal(unrelatedTextarea.value, 'Keep this text');
});

test('hidden or duplicate Etsy Send controls fail closed instead of choosing a button', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/send-safety';
    sandbox.location.href = 'https://www.etsy.com/messages/send-safety';
    const makeButton = (visible = true) => ({
        disabled: false,
        textContent: 'Send',
        getAttribute: () => '',
        getClientRects: () => visible ? [{}] : [],
    });
    let buttons = [makeButton(false)];
    const textarea = Object.assign(new sandbox.HTMLTextAreaElement(), {
        closest: () => scope,
        parentElement: null,
        getClientRects: () => [{}],
    });
    const scope = {
        querySelectorAll(selector) {
            if (selector === 'button') return buttons;
            if (selector.includes('textarea')) return [textarea];
            return [];
        },
    };
    sandbox.document.querySelectorAll = selector => selector.includes('textarea') ? [textarea] : [];

    assert.equal(api.MessageAdapter.getSendButton(), null, 'a hidden Send control must not be actionable');
    buttons = [makeButton(true), makeButton(true)];
    assert.equal(api.MessageAdapter.getSendButton(), null, 'ambiguous Send controls must not be actionable');
});

test('semantic conversation panels resolve a Turkish Send control outside the composer form', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/semantic-send';
    sandbox.location.href = 'https://www.etsy.com/messages/semantic-send';

    const sendButton = {
        disabled: false,
        hidden: false,
        textContent: 'Mesaj gönder',
        type: 'button',
        form: null,
        getAttribute(name) {
            if (name === 'aria-label') return 'Mesaj gönder';
            if (name === 'type') return 'button';
            return '';
        },
        getClientRects: () => [{}],
        closest: () => null,
    };
    const form = {
        parentElement: null,
        querySelectorAll(selector) {
            if (selector.includes('textarea')) return [textarea];
            return [];
        },
    };
    const panel = {
        parentElement: null,
        querySelectorAll(selector) {
            if (selector.includes('textarea')) return [textarea];
            if (selector === 'button') return [sendButton];
            return [];
        },
    };
    form.parentElement = panel;
    const textarea = Object.assign(new sandbox.HTMLTextAreaElement(), {
        offsetParent: {},
        parentElement: form,
        getClientRects: () => [{}],
        closest(selector) {
            if (selector === 'form') return form;
            if (selector === api.MessageAdapter.conversationScopeSelector) return panel;
            return null;
        },
    });
    sandbox.document.querySelectorAll = selector => selector.includes('textarea') ? [textarea] : [];

    assert.equal(api.MessageAdapter.getTextarea(), textarea);
    assert.equal(api.MessageAdapter.getSendButton(), sendButton);
});

test('send control resolution rejects unrelated submit and Send-to-folder actions', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/send-label-safety';
    sandbox.location.href = 'https://www.etsy.com/messages/send-label-safety';
    const makeButton = (label, type = 'button') => ({
        disabled: false,
        hidden: false,
        textContent: label,
        type,
        form: null,
        getAttribute(name) {
            if (name === 'type') return type;
            if (name === 'aria-label') return label;
            return '';
        },
        getClientRects: () => [{}],
        closest: () => null,
    });
    const sendButton = makeButton('Mesaj gönder');
    const previewSubmit = makeButton('Preview', 'submit');
    const spamButton = makeButton('Send to spam');
    let buttons = [sendButton, previewSubmit];
    const panel = {
        parentElement: null,
        querySelectorAll(selector) {
            if (selector.includes('textarea')) return [textarea];
            if (selector === 'button') return buttons;
            return [];
        },
    };
    const form = {
        parentElement: panel,
        querySelectorAll(selector) {
            if (selector.includes('textarea')) return [textarea];
            if (selector === 'button') return buttons.filter(button => button === previewSubmit);
            return [];
        },
    };
    previewSubmit.form = form;
    const textarea = Object.assign(new sandbox.HTMLTextAreaElement(), {
        offsetParent: {},
        parentElement: form,
        getClientRects: () => [{}],
        closest(selector) {
            if (selector === 'form') return form;
            if (selector === api.MessageAdapter.conversationScopeSelector) return panel;
            return null;
        },
    });
    sandbox.document.querySelectorAll = selector => selector.includes('textarea') ? [textarea] : [];

    assert.equal(api.MessageAdapter.getSendButton(), sendButton, 'an unrelated submit must not compete with the labelled Send button');
    buttons = [previewSubmit];
    assert.equal(api.MessageAdapter.getSendButton(), null, 'an untrusted submit label must not be clicked');
    buttons = [spamButton];
    assert.equal(api.MessageAdapter.getSendButton(), null, 'Send to spam must not be treated as message dispatch');
});

test('semantic outgoing direction is recognized without legacy Etsy alignment classes', async () => {
    const { api } = await loadAssistant();
    const row = { className: '', parentElement: null };
    const bubble = {
        id: 'semantic-outgoing',
        innerText: 'Fixture sent message',
        textContent: 'Fixture sent message',
        className: 'message-bubble',
        parentElement: row,
        getAttribute: name => name === 'data-message-direction' ? 'outgoing' : '',
        closest(selector) {
            if (selector === '.wt-grid') return row;
            if (selector.includes('[data-message-direction]')) return bubble;
            return null;
        },
    };
    const scope = {
        querySelectorAll: selector => selector === api.MessageAdapter.bubbleSelector ? [bubble] : [],
    };

    assert.deepEqual(copy(api.MessageAdapter.getMessages(scope)), [{
        id: 'semantic-outgoing', role: 'seller', text: 'Fixture sent message',
    }]);
});

test('explicit incoming semantics override legacy outgoing presentation classes', async () => {
    const { api } = await loadAssistant();
    const row = { className: 'wt-grid justify-content-flex-end', parentElement: null };
    const bubble = {
        id: 'semantic-incoming',
        innerText: 'Buyer message',
        textContent: 'Buyer message',
        className: 'surface-informational-subtle',
        parentElement: row,
        getAttribute: name => name === 'data-message-direction' ? 'incoming' : '',
        closest(selector) {
            if (selector === '.wt-grid') return row;
            if (selector.includes('[data-message-direction]')) return bubble;
            return null;
        },
    };
    const scope = {
        querySelectorAll: selector => selector === api.MessageAdapter.bubbleSelector ? [bubble] : [],
    };

    assert.deepEqual(copy(api.MessageAdapter.getMessages(scope)), [{
        id: 'semantic-incoming', role: 'customer', text: 'Buyer message',
    }]);
});

test('new-message Etsy URLs bind identity to recipient and receipt instead of the literal new path', async () => {
    const { api } = await loadAssistant();
    const first = 'https://www.etsy.com/messages/new?with_id=111&recipient_id=111&referring_id=10000001&referring_type=receipt';
    const second = 'https://www.etsy.com/conversations/new?with_id=222&recipient_id=222&referring_id=10000002&referring_type=receipt';
    const rootQuery = 'https://www.etsy.com/messages?with_id=333&recipient_id=333';
    const recipientOnly = 'https://www.etsy.com/messages/new?recipient_id=444&referring_id=10000004&referring_type=receipt';

    assert.equal(api.Router.conversationIdentity(first), 'compose:111:receipt:10000001');
    assert.equal(api.Router.conversationIdentity(second), 'compose:222:receipt:10000002');
    assert.notEqual(api.Router.conversationIdentity(first), api.Router.conversationIdentity(second));
    assert.equal(api.Router.conversationIdentity(rootQuery), 'compose:333');
    assert.equal(api.Router.conversationIdentity(recipientOnly), 'compose:444:receipt:10000004');
    assert.equal(api.Router.canonicalConversationUrl(first, { orderId: '10000001' }), first);
    assert.equal(api.Router.canonicalConversationUrl(first, { orderId: '10000009' }), '');
    assert.equal(api.Router.canonicalConversationUrl(rootQuery, { orderId: '10000003' }), '', 'order-bound compose URLs require their receipt');
    assert.equal(api.Router.canonicalConversationUrl(recipientOnly, { orderId: '10000004' }), recipientOnly);
    const collision = `https://www.etsy.com/messages/${encodeURIComponent(api.Router.conversationIdentity(first))}`;
    assert.equal(api.Router.conversationIdentity(collision), '', 'thread IDs cannot collide with the compose identity namespace');
    assert.equal(api.Router.canonicalConversationUrl(collision), '');

    for (const unsafe of [
        'https://www.etsy.com/messages/new',
        'https://www.etsy.com/conversations/new?with_id=111&recipient_id=222',
        'https://www.etsy.com/messages/new?with_id=111&with_id=222',
        'https://www.etsy.com/messages/new?recipient_id=111&recipient_id=222',
        'https://www.etsy.com/messages/new?with_id=new-buyer',
        'https://www.etsy.com/messages/new?with_id=111&referring_id=10000001',
        'https://www.etsy.com/messages/new?with_id=111&referring_id=10000001&referring_type=shop',
        'https://www.etsy.com/messages/new?with_id=111&conversation_id=thread-1',
        'https://evil.example/messages/new?with_id=111',
    ]) {
        assert.equal(api.Router.conversationIdentity(unsafe), '', unsafe);
        assert.equal(api.Router.canonicalConversationUrl(unsafe), '', unsafe);
    }
});

test('completed-order compose URLs are receipt-bound message routes without weakening existing threads', async () => {
    const { api, sandbox } = await loadAssistant();
    const orderId = '9876543210';
    const orderComposeUrl = `https://www.etsy.com/your/orders/sold/completed?ref=seller-platform-mcnav&expand_convo=true&order_id=${orderId}`;
    const identity = `compose:order:receipt:${orderId}`;

    assert.deepEqual(copy(api.Router.orderComposeTargetFromUrl(orderComposeUrl)), {
        kind: 'order-compose',
        id: identity,
        identity,
        orderId,
        recipientId: '',
        referringId: orderId,
        referringType: 'receipt',
    });
    assert.equal(api.Router.conversationIdentity(orderComposeUrl), identity);
    assert.equal(api.Router.isComposeTarget(orderComposeUrl), true);
    assert.equal(api.Router.canonicalConversationUrl(orderComposeUrl, { orderId }), orderComposeUrl);
    assert.equal(api.Router.canonicalConversationUrl(orderComposeUrl, { orderId: '9876543211' }), '');

    sandbox.location.pathname = '/your/orders/sold/completed';
    sandbox.location.search = `?ref=seller-platform-mcnav&expand_convo=true&order_id=${orderId}`;
    sandbox.location.href = orderComposeUrl;
    assert.equal(api.Router.page(), 'messages');
    assert.equal(api.Router.conversationId(), identity);
    assert.equal(api.Router.isCompletedOrdersPage(), false);

    const existingThread = 'https://www.etsy.com/messages/existing-thread?ref=orders';
    assert.equal(api.Router.conversationIdentity(existingThread), 'existing-thread');
    assert.equal(api.Router.canonicalConversationUrl(existingThread), existingThread);

    for (const unsafe of [
        `https://www.etsy.com/your/orders/sold/completed?expand_convo=false&order_id=${orderId}`,
        `https://www.etsy.com/your/orders/sold/completed?expand_convo=true&expand_convo=true&order_id=${orderId}`,
        'https://www.etsy.com/your/orders/sold/completed?expand_convo=true',
        'https://www.etsy.com/your/orders/sold/completed?expand_convo=true&order_id=not-an-order',
        `https://www.etsy.com/your/orders/sold/completed?expand_convo=true&order_id=${orderId}&order_id=${orderId}`,
        `https://evil.example/your/orders/sold/completed?expand_convo=true&order_id=${orderId}`,
    ]) {
        assert.equal(api.Router.conversationIdentity(unsafe), '', unsafe);
        assert.equal(api.Router.canonicalConversationUrl(unsafe, { orderId }), '', unsafe);
    }
});

test('only Etsy\'s exact same-order purchases prefill may be replaced in order compose', async () => {
    const { api, sandbox } = await loadAssistant();
    const orderId = '9876543210';
    const orderComposeUrl = `https://www.etsy.com/your/orders/sold/completed?ref=seller-platform-mcnav&expand_convo=true&order_id=${orderId}`;
    const identity = `compose:order:receipt:${orderId}`;
    const item = {
        orderId,
        customerName: 'Fixture Buyer',
        messageUrl: orderComposeUrl,
    };
    sandbox.location.pathname = '/your/orders/sold/completed';
    sandbox.location.search = `?ref=seller-platform-mcnav&expand_convo=true&order_id=${orderId}`;
    sandbox.location.href = orderComposeUrl;

    const expectedPrefill = `https://www.etsy.com/your/purchases/${orderId}`;
    assert.equal(api.MessageAdapter.etsyPurchasePrefillOrderId(expectedPrefill), orderId);
    assert.equal(api.MessageAdapter.isExpectedOrderComposePrefill(expectedPrefill, {
        orderId,
        conversationUrl: orderComposeUrl,
        conversationIdentity: identity,
    }), true);
    assert.equal(api.Campaign.composerCanAcceptDraft({ value: expectedPrefill }, item, identity), true);
    assert.equal(api.Campaign.composerCanAcceptDraft({ value: '' }, item, identity), true);

    for (const occupied of [
        `https://www.etsy.com/your/purchases/${Number(orderId) + 1}`,
        `${expectedPrefill}?ref=manual`,
        `${expectedPrefill}/`,
        ` ${expectedPrefill}`,
        `${expectedPrefill}\n`,
        '   ',
        `Please review ${expectedPrefill}`,
        'My real unsent Etsy draft',
    ]) {
        assert.equal(api.MessageAdapter.isExpectedOrderComposePrefill(occupied, {
            orderId,
            conversationUrl: orderComposeUrl,
            conversationIdentity: identity,
        }), false, occupied);
        assert.equal(api.Campaign.composerCanAcceptDraft({ value: occupied }, item, identity), false, occupied);
    }
    assert.equal(api.MessageAdapter.isExpectedOrderComposePrefill(expectedPrefill, {
        orderId,
        conversationUrl: orderComposeUrl,
        conversationIdentity: `compose:order:receipt:${Number(orderId) + 1}`,
    }), false, 'a stale route identity cannot authorize prefill replacement');
});

test('order compose accepts its informational Message history link but still rejects unrelated conversations', async () => {
    const { api, sandbox } = await loadAssistant();
    const orderId = '9876543210';
    const orderComposeUrl = `https://www.etsy.com/your/orders/sold/completed?ref=seller-platform-mcnav&expand_convo=true&order_id=${orderId}`;
    const orderHistoryLink = {
        href: 'https://www.etsy.com/conversations/with/fixturebuyer?ref=order_details',
    };
    const unrelatedConversationLink = {
        href: 'https://www.etsy.com/messages/unrelated-thread?ref=orders',
    };
    const scopeWith = links => ({ querySelectorAll: () => links });

    sandbox.location.pathname = '/your/orders/sold/completed';
    sandbox.location.search = `?ref=seller-platform-mcnav&expand_convo=true&order_id=${orderId}`;
    sandbox.location.href = orderComposeUrl;

    assert.equal(api.MessageAdapter.isOrderComposeMessageHistoryLink(orderHistoryLink), true);
    assert.equal(api.MessageAdapter.scopeHasOtherConversation(scopeWith([orderHistoryLink])), false);
    assert.equal(api.MessageAdapter.scopeHasOtherConversation(scopeWith([
        orderHistoryLink,
        unrelatedConversationLink,
    ])), true, 'an actual unrelated conversation remains fail-closed');
    assert.equal(api.MessageAdapter.scopeHasOtherConversation(scopeWith([
        orderHistoryLink,
        { ...orderHistoryLink },
    ])), true, 'multiple informational conversation links remain ambiguous');

    for (const unsafe of [
        'https://user@www.etsy.com/conversations/with/fixturebuyer?ref=order_details',
        'https://www.etsy.com/conversations/with/fixturebuyer?ref=order_details&extra=1',
        'https://www.etsy.com/conversations/with/fixturebuyer?ref=order_details#fragment',
        'https://www.etsy.com/conversations/with/all?ref=order_details',
    ]) {
        assert.equal(api.MessageAdapter.isOrderComposeMessageHistoryLink({ href: unsafe }), false, unsafe);
    }

    sandbox.location.pathname = '/messages/active-thread';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/active-thread';
    assert.equal(api.MessageAdapter.isOrderComposeMessageHistoryLink(orderHistoryLink), false);
    assert.equal(api.MessageAdapter.scopeHasOtherConversation(scopeWith([orderHistoryLink])), true,
        'the exemption is limited to receipt-bound order compose routes');
});

test('order compose post-send evidence accepts only one exact numeric Etsy conversation permalink', async () => {
    const { api, sandbox } = await loadAssistant();
    const orderId = '9876543210';
    const orderComposeUrl = `https://www.etsy.com/your/orders/sold/completed?ref=seller-platform-mcnav&expand_convo=true&order_id=${orderId}`;
    const orderHistoryLink = {
        href: 'https://www.etsy.com/conversations/with/fixturebuyer?ref=order_details',
    };
    const createdThreadLink = {
        href: 'https://www.etsy.com/conversations/1712385939',
    };
    const scopeWith = links => ({ querySelectorAll: () => links });

    sandbox.location.pathname = '/your/orders/sold/completed';
    sandbox.location.search = `?ref=seller-platform-mcnav&expand_convo=true&order_id=${orderId}`;
    sandbox.location.href = orderComposeUrl;

    assert.equal(api.MessageAdapter.isOrderComposePostSendPermalink(createdThreadLink), true);
    assert.equal(
        api.MessageAdapter.orderComposePostSendThreadIdentity(scopeWith([orderHistoryLink, createdThreadLink])),
        '1712385939',
    );
    assert.equal(api.MessageAdapter.scopeHasOtherConversation(scopeWith([orderHistoryLink, createdThreadLink])), true,
        'post-send evidence must not reopen the generic composer scope');

    for (const links of [
        [createdThreadLink],
        [orderHistoryLink, { href: 'https://www.etsy.com/messages/1712385939' }],
        [orderHistoryLink, createdThreadLink, { ...createdThreadLink }],
        [orderHistoryLink, createdThreadLink, { href: 'https://www.etsy.com/messages/unrelated-thread' }],
        [orderHistoryLink, { ...orderHistoryLink }, createdThreadLink],
    ]) {
        assert.equal(api.MessageAdapter.orderComposePostSendThreadIdentity(scopeWith(links)), '',
            'only the exact two-link Etsy order-drawer shape is accepted');
    }

    for (const unsafe of [
        'https://user@www.etsy.com/conversations/1712385939',
        'https://www.etsy.com/conversations/1712385939?ref=orders',
        'https://www.etsy.com/conversations/1712385939#message',
        'https://www.etsy.com/conversations/0',
        'https://www.etsy.com/conversations/thread-1712385939',
        `https://www.etsy.com/conversations/${'1'.repeat(33)}`,
    ]) {
        assert.equal(api.MessageAdapter.isOrderComposePostSendPermalink({ href: unsafe }), false, unsafe);
    }
});

test('post-send order drawer verification uses only its captured fail-closed scope', async () => {
    const { api, sandbox } = await loadAssistant();
    const orderId = '9876543210';
    const orderComposeUrl = `https://www.etsy.com/your/orders/sold/completed?ref=seller-platform-mcnav&expand_convo=true&order_id=${orderId}`;
    sandbox.location.pathname = '/your/orders/sold/completed';
    sandbox.location.search = `?ref=seller-platform-mcnav&expand_convo=true&order_id=${orderId}`;
    sandbox.location.href = orderComposeUrl;

    const composer = {};
    const links = [
        { href: 'https://www.etsy.com/conversations/with/fixturebuyer?ref=order_details' },
        { href: 'https://www.etsy.com/conversations/1712385939' },
    ];
    const capturedScope = {
        isConnected: true,
        contains: candidate => candidate === composer,
        querySelectorAll: () => links,
    };
    const identity = api.Router.conversationIdentity();
    const pending = {
        text: 'Exact sent fixture text',
        baselineMatches: 0,
        sourceWasCompose: true,
        sourceComposer: composer,
        sourceConversationScope: capturedScope,
        sendCapturedAt: new Date().toISOString(),
        orderId,
        conversationId: identity,
        conversationIdentity: identity,
        routeFingerprint: api.Router.routeFingerprint(),
        verificationToken: 4242,
    };
    const originalCountOutgoing = api.MessageAdapter.countOutgoing;
    try {
        api.MessageAdapter.countOutgoing = (_text, scope) => scope === capturedScope ? 1 : 0;
        assert.equal(api.Verification.capturedOrderComposePostSendScope(pending), capturedScope);
        assert.equal(await api.Verification.waitForPendingOutgoing(pending, 50), true);

        assert.equal(api.Verification.capturedOrderComposePostSendScope({ ...pending, sendCapturedAt: '' }), null);
        assert.equal(api.Verification.capturedOrderComposePostSendScope({ ...pending, orderId: '9876543211' }), null);
        assert.equal(api.Verification.capturedOrderComposePostSendScope({ ...pending, conversationId: '1712385939' }), null);
        assert.equal(api.Verification.capturedOrderComposePostSendScope({ ...pending, conversationIdentity: '1712385939' }), null);
        assert.equal(api.Verification.capturedOrderComposePostSendScope({ ...pending, routeFingerprint: 'stale-route' }), null);
        assert.equal(api.Verification.capturedOrderComposePostSendScope({
            ...pending,
            sourceConversationScope: { ...capturedScope, isConnected: false },
        }), null);
        assert.equal(api.Verification.capturedOrderComposePostSendScope({
            ...pending,
            sourceConversationScope: { ...capturedScope, contains: () => false },
        }), null);
        assert.equal(api.Verification.capturedOrderComposePostSendScope({
            ...pending,
            sourceConversationScope: { ...capturedScope, querySelectorAll: () => [links[0], links[1], { ...links[1] }] },
        }), null);
        api.Verification.invalidatedTokens.add(pending.verificationToken);
        assert.equal(api.Verification.capturedOrderComposePostSendScope(pending), null);
        api.Verification.invalidatedTokens.delete(pending.verificationToken);

        api.MessageAdapter.countOutgoing = () => 0;
        assert.equal(await api.Verification.waitForPendingOutgoing(pending, 1), false,
            'the exact post-send links are not sufficient without a new matching outgoing delta');
    } finally {
        api.MessageAdapter.countOutgoing = originalCountOutgoing;
    }
});

test('post-send compose-to-thread verification stays bound to the same order and customer only', async () => {
    const { api, sandbox } = await loadAssistant();
    const composeUrl = 'https://www.etsy.com/messages/new?with_id=111&recipient_id=111&referring_id=10000001&referring_type=receipt';
    sandbox.location.pathname = '/messages/new';
    sandbox.location.search = '?with_id=111&recipient_id=111&referring_id=10000001&referring_type=receipt';
    sandbox.location.href = composeUrl;
    const sourceComposer = {};
    const newComposer = {};
    const pending = {
        conversationId: api.Router.conversationId(),
        routeFingerprint: api.Router.routeFingerprint(),
        sourceWasCompose: true,
        sourceComposer,
        sendCapturedAt: new Date().toISOString(),
        orderId: '10000001',
        customerName: 'Fixture Buyer',
    };

    sandbox.location.pathname = '/messages/created-thread';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/created-thread';
    const originals = {
        context: api.MessageAdapter.context,
        getTextarea: api.MessageAdapter.getTextarea,
    };
    try {
        api.MessageAdapter.getTextarea = () => null;
        assert.equal(api.Verification.composeTransitionState(pending), 'hydrating');
        assert.equal(api.Verification.verificationMayContinue(pending), true, 'a route-before-DOM transition gets a short hydration grace period');
        assert.equal(api.Verification.contextIsCurrent(pending), false, 'hydrating alone is never sufficient to finalize a send');

        api.MessageAdapter.getTextarea = () => sourceComposer;
        assert.equal(api.Verification.composeTransitionState(pending), 'hydrating', 'the stale compose control cannot bind the new route');

        api.MessageAdapter.getTextarea = () => newComposer;
        api.MessageAdapter.context = () => ({
            conversationId: 'created-thread', orderId: '', customerName: '',
        });
        assert.equal(api.Verification.composeTransitionState(pending), 'hydrating', 'a new composer can appear before its order and buyer context');

        api.MessageAdapter.context = () => ({
            conversationId: 'created-thread', orderId: '10000001', customerName: 'Fixture Buyer',
        });
        assert.equal(api.Verification.contextIsCurrent(pending), true);
        assert.equal(api.Verification.conversationIdForRecord(pending), 'created-thread');

        api.MessageAdapter.context = () => ({
            conversationId: 'created-thread', orderId: '10000002', customerName: 'Fixture Buyer',
        });
        assert.equal(api.Verification.contextIsCurrent(pending), false, 'a different receipt must invalidate the transition');
        api.MessageAdapter.context = () => ({
            conversationId: 'created-thread', orderId: '10000001', customerName: 'Different Buyer',
        });
        assert.equal(api.Verification.contextIsCurrent(pending), false, 'a different buyer must invalidate the transition');
        assert.equal(api.Verification.contextIsCurrent({ ...pending, transitionBoundIdentity: '', sendCapturedAt: '' }), false, 'navigation before Send must not rebind');
        assert.equal(api.Verification.composeTransitionState({
            ...pending,
            transitionBoundIdentity: '',
            sendCapturedAt: new Date(Date.now() - api.Verification.composeHydrationGraceMs - 1000).toISOString(),
        }), 'invalid', 'an old send capture cannot rebind to a later conversation');
    } finally {
        api.MessageAdapter.context = originals.context;
        api.MessageAdapter.getTextarea = originals.getTextarea;
    }
});

test('compose transition baselines hydrated history before accepting a new matching outgoing bubble', async () => {
    const { api, sandbox } = await loadAssistant();
    const composeUrl = 'https://www.etsy.com/messages/new?with_id=111&recipient_id=111&referring_id=10000001&referring_type=receipt';
    sandbox.location.pathname = '/messages/new';
    sandbox.location.search = '?with_id=111&recipient_id=111&referring_id=10000001&referring_type=receipt';
    sandbox.location.href = composeUrl;
    const routeFingerprint = api.Router.routeFingerprint();
    const sourceComposer = {};
    sandbox.location.pathname = '/messages/created-thread';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/created-thread';

    const originals = {
        context: api.MessageAdapter.context,
        getTextarea: api.MessageAdapter.getTextarea,
        countOutgoing: api.MessageAdapter.countOutgoing,
        observationMs: api.Verification.transitionObservationMs,
    };
    api.MessageAdapter.getTextarea = () => ({});
    api.MessageAdapter.context = () => ({
        conversationId: 'created-thread', orderId: '10000001', customerName: 'Fixture Buyer',
    });
    api.Verification.transitionObservationMs = 0;
    const makePending = token => ({
        text: 'Repeated template text',
        baselineMatches: 0,
        conversationId: 'compose:111:receipt:10000001',
        routeFingerprint,
        sourceWasCompose: true,
        sourceComposer,
        sendCapturedAt: new Date().toISOString(),
        orderId: '10000001',
        customerName: 'Fixture Buyer',
        verificationToken: token,
    });
    try {
        api.MessageAdapter.countOutgoing = () => 1;
        const oldHistoryOnly = makePending(7001);
        assert.equal(await api.Verification.waitForPendingOutgoing(oldHistoryOnly, 1000), false);
        assert.equal(oldHistoryOnly.transitionBaselineMatches, 1, 'the first hydrated thread snapshot is a baseline, not proof of this send');

        let reads = 0;
        api.MessageAdapter.countOutgoing = () => (++reads === 1 ? 1 : 2);
        const newBubbleAfterHydration = makePending(7002);
        assert.equal(await api.Verification.waitForPendingOutgoing(newBubbleAfterHydration, 1000), true);
        assert.equal(newBubbleAfterHydration.transitionBaselineMatches, 1);
    } finally {
        api.MessageAdapter.context = originals.context;
        api.MessageAdapter.getTextarea = originals.getTextarea;
        api.MessageAdapter.countOutgoing = originals.countOutgoing;
        api.Verification.transitionObservationMs = originals.observationMs;
    }
});

test('compose transition accepts an outgoing delta in a safely reused original composer scope', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/new';
    sandbox.location.search = '?with_id=111&recipient_id=111&referring_id=10000001&referring_type=receipt';
    sandbox.location.href = `https://www.etsy.com/messages/new${sandbox.location.search}`;
    const routeFingerprint = api.Router.routeFingerprint();
    const sourceComposer = { value: '' };
    const sourceScope = {};
    const pending = {
        text: 'Fresh outgoing text',
        baselineMatches: 0,
        conversationId: api.Router.conversationId(),
        routeFingerprint,
        sourceWasCompose: true,
        sourceComposer,
        sourceConversationScope: sourceScope,
        sendCapturedAt: new Date().toISOString(),
        orderId: '10000001',
        customerName: 'Fixture Buyer',
        verificationToken: 7003,
    };
    sandbox.location.pathname = '/messages/created-thread';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/created-thread';
    const originals = {
        context: api.MessageAdapter.context,
        getTextarea: api.MessageAdapter.getTextarea,
        getConversationScope: api.MessageAdapter.getConversationScope,
        countOutgoing: api.MessageAdapter.countOutgoing,
    };
    try {
        api.MessageAdapter.getTextarea = () => sourceComposer;
        api.MessageAdapter.getConversationScope = () => sourceScope;
        api.MessageAdapter.context = () => ({
            conversationId: 'created-thread', orderId: '10000001', customerName: 'Fixture Buyer',
        });
        api.MessageAdapter.countOutgoing = (_text, scope) => scope === sourceScope ? 1 : 0;

        assert.equal(api.Verification.composeTransitionState(pending), 'bound');
        assert.equal(pending.transitionUsesSourceEvidence, true);
        assert.equal(await api.Verification.waitForPendingOutgoing(pending, 1000), true);
    } finally {
        api.MessageAdapter.context = originals.context;
        api.MessageAdapter.getTextarea = originals.getTextarea;
        api.MessageAdapter.getConversationScope = originals.getConversationScope;
        api.MessageAdapter.countOutgoing = originals.countOutgoing;
    }
});

test('campaign resume never reads or writes the composer for a different new-message recipient', async () => {
    const { api, sandbox } = await loadAssistant();
    const first = 'https://www.etsy.com/messages/new?with_id=111&recipient_id=111&referring_id=10000001&referring_type=receipt';
    const second = 'https://www.etsy.com/messages/new?with_id=222&recipient_id=222&referring_id=10000002&referring_type=receipt';
    sandbox.location.pathname = '/messages/new';
    sandbox.location.search = '?with_id=222&recipient_id=222&referring_id=10000002&referring_type=receipt';
    sandbox.location.href = second;
    const originals = {
        current: api.Campaign.current,
        getTextarea: api.MessageAdapter.getTextarea,
        claimCurrent: api.Campaign.claimCurrent,
    };
    let composerReads = 0;
    let claims = 0;
    api.Campaign.current = () => ({ id: 'item-a', orderId: '10000001', messageUrl: first, status: 'pending' });
    api.MessageAdapter.getTextarea = () => { composerReads += 1; return null; };
    api.Campaign.claimCurrent = async () => { claims += 1; return null; };
    try {
        assert.equal(await api.Campaign.resumeClaimed(), false);
        assert.equal(composerReads, 0);
        assert.equal(claims, 0);
    } finally {
        api.Campaign.current = originals.current;
        api.MessageAdapter.getTextarea = originals.getTextarea;
        api.Campaign.claimCurrent = originals.claimCurrent;
    }
});

test('message folders are not conversations and missing trusted composers render no production actions', async () => {
    const { api, sandbox } = await loadAssistant();
    const productionActions = /data-action="(?:ai-polish-reply|ai-auto-reply|free-translate-reply|regenerate-reply|insert-reply|campaign-send-next)"/;

    for (const folder of ['all', 'inbox', 'unread', 'spam']) {
        sandbox.location.pathname = `/messages/${folder}`;
        sandbox.location.href = `https://www.etsy.com/messages/${folder}`;
        api.UI.state.context = null;

        assert.equal(api.Router.page(), 'messages');
        assert.equal(api.Router.conversationId(), '', `${folder} must remain a message-list folder`);
        const markup = api.UI.renderMessages();
        if (folder === 'all') assert.match(markup, /Etsy konuşmaları|Konuşma bulunamadı/i);
        else assert.match(markup, /Bir konuşma açın/);
        assert.doesNotMatch(markup, productionActions);
        assert.doesNotMatch(markup, /data-bind="draftTr"|data-message-template-select/);
    }

    sandbox.location.pathname = '/messages/looks-like-a-conversation';
    sandbox.location.href = 'https://www.etsy.com/messages/looks-like-a-conversation';
    api.UI.state.context = null;
    assert.equal(api.Router.conversationId(), 'looks-like-a-conversation');
    assert.equal(api.MessageAdapter.context().conversationId, '', 'a URL segment alone must not establish a trusted conversation');
    const untrustedMarkup = api.UI.renderMessages();
    assert.match(untrustedMarkup, /Bir konuşma açın/);
    assert.doesNotMatch(untrustedMarkup, productionActions);
});

test('message-list scanner reads safe Etsy DOM rows without mutating the source DOM', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/all';
    sandbox.location.href = 'https://www.etsy.com/messages/all';

    const nameNode = { textContent: 'Ashley' };
    const previewNode = { textContent: 'Could you make this in blue?' };
    const unreadNode = { textContent: '' };
    const timeNode = { getAttribute: name => name === 'datetime' ? '2026-08-27T12:00:00.000Z' : '' };
    const scope = {
        className: 'conversation-row unread',
        innerText: 'Select this conversation with Ashley from 1 hour ago\nread message\nAshley\nCould you make this in blue?\nUnread',
        textContent: 'Select this conversation with Ashley from 1 hour ago read message Ashley Could you make this in blue? Unread',
        querySelectorAll(selector) {
            return selector.includes('h1,h2,h3,h4,strong') ? [nameNode] : [];
        },
        querySelector(selector) {
            if (selector.includes('aria-label*="unread"')) return unreadNode;
            if (selector === 'time[datetime]') return timeNode;
            return null;
        },
    };
    const safeAnchor = {
        href: 'https://www.etsy.com/messages/thread-1?ref=inbox#row',
        className: '',
        textContent: 'Ashley',
        innerText: 'read message\nAshley\nCould you make this in blue?\n1 hour ago',
        querySelectorAll: selector => selector.includes('h1,h2,h3,h4') ? [nameNode, previewNode] : [],
        closest: () => scope,
        getAttribute: () => '',
    };
    const externalAnchor = { ...safeAnchor, href: 'https://evil.example/messages/thread-2' };
    const reservedAnchor = { ...safeAnchor, href: 'https://www.etsy.com/messages/all' };
    const cssHiddenAnchor = {
        ...safeAnchor,
        href: 'https://www.etsy.com/messages/hidden-css',
        getClientRects: () => [],
    };
    const ariaHiddenParentAnchor = {
        ...safeAnchor,
        href: 'https://www.etsy.com/messages/hidden-parent',
        parentElement: { parentElement: null, getAttribute: name => name === 'aria-hidden' ? 'true' : '' },
    };
    const computedHiddenParent = { parentElement: null, getAttribute: () => '' };
    const computedHiddenAnchor = {
        ...safeAnchor,
        href: 'https://www.etsy.com/messages/hidden-computed',
        parentElement: computedHiddenParent,
    };
    sandbox.getComputedStyle = element => ({
        display: 'block',
        visibility: element === computedHiddenParent ? 'hidden' : 'visible',
    });
    sandbox.document.querySelectorAll = selector => selector.includes('a[href*="/messages/"]')
        ? [safeAnchor, externalAnchor, reservedAnchor, cssHiddenAnchor, ariaHiddenParentAnchor, computedHiddenAnchor]
        : [];

    const before = { innerText: scope.innerText, textContent: scope.textContent };
    const items = api.MessageCenterAgent.scanConversationList();
    assert.equal(items.length, 1);
    assert.equal(items[0].conversationId, 'thread-1');
    assert.equal(items[0].buyerName, 'Ashley');
    assert.equal(items[0].preview, 'Could you make this in blue?');
    assert.equal(items[0].unread, true);
    assert.equal(items[0].conversationUrl, 'https://www.etsy.com/messages/thread-1?ref=inbox');
    assert.deepEqual({ innerText: scope.innerText, textContent: scope.textContent }, before);
});

test('message-list row scoping ignores a compose CTA beside the real thread link', async () => {
    const { api } = await loadAssistant();
    const thread = { href: 'https://www.etsy.com/messages/thread-1' };
    const compose = {
        href: 'https://www.etsy.com/messages/new?with_id=111&recipient_id=111&referring_id=10000001&referring_type=receipt',
    };
    let links = [thread, compose];
    const row = { querySelectorAll: () => links };
    const anchor = { closest: () => row, parentElement: row };

    assert.equal(api.MessageCenterAgent.conversationScope(anchor), row);
    links = [...links, { href: 'https://www.etsy.com/messages/thread-2' }];
    assert.equal(api.MessageCenterAgent.conversationScope(anchor), null, 'two real thread identities remain ambiguous');
});

test('message-list scanner accepts Etsy query-form conversation links', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/all';
    sandbox.location.href = 'https://www.etsy.com/messages/all';
    const scope = {
        innerText: 'Query buyer\nCan you help with this order?',
        textContent: 'Query buyer Can you help with this order?',
        querySelectorAll: () => [],
        querySelector: () => null,
    };
    const anchor = {
        href: 'https://www.etsy.com/messages?conversation_id=query-thread&ref=inbox',
        innerText: 'Query buyer\nCan you help with this order?',
        textContent: 'Query buyer',
        getAttribute: () => '',
        querySelectorAll: () => [],
        closest: () => scope,
    };
    sandbox.document.querySelectorAll = selector => selector.includes('/messages?') ? [anchor] : [];

    const items = api.MessageCenterAgent.scanConversationList();
    assert.equal(items.length, 1);
    assert.equal(items[0].conversationId, 'query-thread');
    assert.equal(items[0].conversationUrl, 'https://www.etsy.com/messages?conversation_id=query-thread&ref=inbox');
});

test('message-list fallback ignores absolute Etsy dates instead of using them as previews', async () => {
    const { api } = await loadAssistant();
    const buyerName = 'Date-safe buyer';
    const message = 'Could you make the lettering darker?';
    const scope = {
        innerText: `Select this conversation with ${buyerName} from Aug 19, 2026\n${buyerName}\nA Very Long Product Heading That Is Not The Message\n${message}\nAug 19, 2026`,
        querySelectorAll: () => [],
    };
    const anchor = {
        innerText: `${buyerName}\nA Very Long Product Heading That Is Not The Message\n${message}\nAug 19, 2026`,
        getAttribute: () => '',
    };

    assert.equal(api.MessageCenterAgent.buyerNameFromScope(scope, anchor), buyerName);
    assert.equal(api.MessageCenterAgent.previewFromScope(scope, buyerName, anchor), message);
});

test('message-list fallback rejects Turkish relative timestamps and a generic strong product title', async () => {
    const { api } = await loadAssistant();
    const buyerName = 'Ece';
    const productTitle = 'Premium Kişiye Özel Ahşap Duvar Dekoru';
    const message = 'Ürünün tonu biraz daha koyu olabilir mi?';
    const scope = {
        innerText: `${buyerName}\n${productTitle}\n2 saat önce\n5 dk önce\n${message}`,
        querySelectorAll(selector) {
            return selector.includes('strong') ? [{ textContent: productTitle }] : [];
        },
    };
    const anchor = {
        innerText: `${buyerName}\n${productTitle}\n2 saat önce\n5 dk önce\n${message}`,
        getAttribute: () => '',
    };

    assert.equal(api.MessageCenterAgent.buyerNameFromScope(scope, anchor), buyerName);
    assert.equal(api.MessageCenterAgent.previewFromScope(scope, buyerName, anchor), message);
    const timestampsOnly = { innerText: `${buyerName}\n2 saat önce\n5 dk önce`, getAttribute: () => '', querySelectorAll: () => [] };
    assert.equal(api.MessageCenterAgent.previewFromScope(timestampsOnly, buyerName, timestampsOnly), '');
    const shortProduct = { innerText: 'Samantha\nArt\nCan you help?', querySelectorAll: () => [] };
    assert.equal(api.MessageCenterAgent.buyerNameFromScope(shortProduct, { getAttribute: () => '' }), 'Samantha');
    const multiPartName = { innerText: 'María del Carmen\nArt\nCan you help?', querySelectorAll: () => [] };
    assert.equal(api.MessageCenterAgent.buyerNameFromScope(multiPartName, { getAttribute: () => '' }), 'María del Carmen');
});

test('heuristics do not treat English "a ton" as a color but retain Turkish tone detection', async () => {
    const { api } = await loadAssistant();
    assert.notEqual(api.Heuristics.analyze('This would save me a ton of extra time.').intent, 'color_change');
    assert.equal(api.Heuristics.analyze('Ürünün renk tonu biraz daha koyu olabilir mi?').intent, 'color_change');
    assert.equal(api.Heuristics.analyze('Ürünün tonu biraz daha koyu olabilir mi?').intent, 'color_change');
    assert.equal(api.Heuristics.analyze('Tonları biraz daha koyu yapabilir misiniz?').intent, 'color_change');
    assert.equal(api.Heuristics.analyze('Şu ton olur mu?').intent, 'color_change');
    for (const nonColorText of ['Washington', 'stony texture', 'large tonnage']) {
        assert.notEqual(api.Heuristics.analyze(nonColorText).intent, 'color_change');
    }
});

test('orders reject external conversation links while recognizing Turkish delivered status', async () => {
    const { api } = await loadAssistant();
    const orderLink = {
        href: 'https://www.etsy.com/your/orders/sold/completed?order_id=12345678',
        parentElement: { textContent: '$24.00' },
    };
    const externalMessageLink = { href: 'https://evil.example/messages/stolen-thread' };
    let conversationSelectorRead = false;
    const row = {
        textContent: 'Teslim edildi',
        querySelectorAll(selector) {
            if (selector.includes('order_id=')) return [orderLink];
            if (selector.includes('/messages') || selector.includes('/conversations')) {
                conversationSelectorRead = true;
                return [externalMessageLink];
            }
            if (selector === 'h2, .wt-text-title-small') return [{ textContent: 'Teslim edildi' }];
            return [];
        },
        querySelector(selector) {
            if (selector.includes('btn-link.strong.fs-mask')) return { textContent: 'Turkish Buyer' };
            return null;
        },
    };
    const order = api.OrdersAdapter.fromRow(row, 0);
    assert.equal(order.orderId, '12345678');
    assert.equal(order.delivered, true);
    assert.equal(order.messageUrl, '');
    assert.equal(conversationSelectorRead, true, 'the row conversation-link selector must be exercised');
});

test('delivered orders accept a receipt-bound compose URL exposed by Etsy custom link controls', async () => {
    const { api } = await loadAssistant();
    const orderLink = {
        href: 'https://www.etsy.com/your/orders/sold/completed?order_id=12345678',
        parentElement: { textContent: '$24.00' },
    };
    const composeUrl = 'https://www.etsy.com/messages/new?with_id=87654321&recipient_id=87654321&referring_id=12345678&referring_type=receipt';
    const customMessageLink = {
        getAttribute: name => name === 'href' ? composeUrl : '',
    };
    const row = {
        textContent: 'Teslim edildi',
        querySelectorAll(selector) {
            if (selector.includes('order_id=')) return [orderLink];
            if (selector.includes('/messages') || selector.includes('/conversations')) return [customMessageLink];
            if (selector === 'h2, .wt-text-title-small') return [{ textContent: 'Teslim edildi' }];
            return [];
        },
        querySelector(selector) {
            if (selector.includes('btn-link.strong.fs-mask')) return { textContent: 'Compose Buyer' };
            return null;
        },
    };

    const order = api.OrdersAdapter.fromRow(row, 0);
    assert.equal(order.messageUrl, composeUrl);
    assert.equal(api.Router.conversationIdentity(order.messageUrl), 'compose:87654321:receipt:12345678');
});

test('href-less native Message controls synthesize the exact receipt surface and never fall back to recipient history', async () => {
    const { api } = await loadAssistant();
    const orderId = '9876543210';
    const orderLink = {
        href: `https://www.etsy.com/your/orders/sold/completed?order_id=${orderId}`,
        parentElement: { textContent: '$24.00' },
    };
    const recipientHistory = {
        href: 'https://www.etsy.com/conversations/with/fixturebuyer?ref=order_details',
    };
    const orderComposeUrl = `https://www.etsy.com/your/orders/sold/completed?ref=seller-platform-mcnav&expand_convo=true&order_id=${orderId}`;
    const nativeMessageControl = {
        getAttribute: () => '',
        querySelector: selector => selector === 'clg-icon[name="message" i]' ? {} : null,
    };
    const existingThreadUrl = 'https://www.etsy.com/messages/existing-thread?ref=orders';
    const existingThread = { href: existingThreadUrl };
    const makeRow = ({ includeNativeControl, includeExistingThread }) => ({
        textContent: `Delivered Order #${orderId}`,
        querySelectorAll(selector) {
            if (selector === 'a[href*="order_id="]') return [orderLink];
            if (selector === 'clg-icon-button') return includeNativeControl ? [nativeMessageControl] : [];
            if (selector.includes('expand_convo=true')) return includeNativeControl ? [nativeMessageControl] : [];
            if (selector.includes('/messages')) {
                return includeExistingThread ? [recipientHistory, existingThread] : [recipientHistory];
            }
            if (selector === 'h2, .wt-text-title-small') return [{ textContent: 'Delivered' }];
            return [];
        },
        querySelector(selector) {
            if (selector.includes('btn-link.strong.fs-mask')) return { textContent: 'Native Compose Buyer' };
            return null;
        },
    });

    const newConversationOrder = api.OrdersAdapter.fromRow(makeRow({
        includeNativeControl: true,
        includeExistingThread: true,
    }), 0);
    assert.equal(newConversationOrder.orderId, orderId);
    assert.equal(newConversationOrder.messageUrl, orderComposeUrl);
    assert.equal(api.Router.conversationIdentity(newConversationOrder.messageUrl), `compose:order:receipt:${orderId}`);

    const existingConversationOrder = api.OrdersAdapter.fromRow(makeRow({
        includeNativeControl: false,
        includeExistingThread: true,
    }), 0);
    assert.equal(existingConversationOrder.messageUrl, existingThreadUrl,
        'a working existing thread remains supported when Etsy exposes no native order drawer control');

    const historyOnlyOrder = api.OrdersAdapter.fromRow(makeRow({
        includeNativeControl: false,
        includeExistingThread: false,
    }), 0);
    assert.equal(historyOnlyOrder.messageUrl, '', 'recipient history without a receipt-bound composer fails closed');
});

test('campaign creation retains only canonical Etsy conversation URLs', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.href = 'https://www.etsy.com/your/orders/sold/completed';
    const campaign = await api.Campaign.create([
        { orderId: 'safe-order', customerName: 'Safe', itemTitle: 'Safe item', messageUrl: 'https://www.etsy.com/messages/safe-thread' },
        { orderId: 'external-order', customerName: 'External', itemTitle: 'Unsafe item', messageUrl: 'https://evil.example/messages/external-thread' },
    ], 'tpl-delivered', 'template');
    assert.equal(campaign.items.length, 1);
    assert.equal(campaign.items[0].orderId, 'safe-order');
    assert.equal(campaign.items[0].messageUrl, 'https://www.etsy.com/messages/safe-thread');
    assert.equal(sandbox.location.href, 'https://www.etsy.com/your/orders/sold/completed');
});

test('known FNV collisions remain separate in translator cache and list batch deduplication', async () => {
    const { api, sandbox } = await loadAssistant();
    const first = '00009pf8';
    const second = '0000arj6';
    assert.equal(api.hashText(first), api.hashText(second), 'the fixture must retain the known FNV collision');
    assert.notEqual(api.Translator.cacheKey(first, 'tr'), api.Translator.cacheKey(second, 'tr'));

    const calls = [];
    api.Translator.cache.clear();
    api.Translator.google = async text => {
        calls.push(text);
        return { text: `TR:${text}`, detectedLanguage: 'en', provider: 'google' };
    };
    assert.equal((await api.Translator.translate(first, 'tr', { logHistory: false })).text, `TR:${first}`);
    assert.equal((await api.Translator.translate(second, 'tr', { logHistory: false })).text, `TR:${second}`);
    assert.deepEqual(calls, [first, second]);

    sandbox.location.pathname = '/messages/all';
    sandbox.location.href = 'https://www.etsy.com/messages/all';
    api.Translator.cache.clear();
    calls.length = 0;
    api.MessageCenterAgent.scanConversationList = () => [first, second].map((preview, index) => ({
        conversationId: `collision-${index}`,
        conversationUrl: `https://www.etsy.com/messages/collision-${index}`,
        buyerName: `Collision ${index}`,
        preview,
        unread: false,
    }));
    await api.UI.translateMessageListPreviews();
    assert.deepEqual(calls.sort(), [first, second].sort());
});

test('Norwegian Bokmål detection is normalized to the Google no target', async () => {
    const { api } = await loadAssistant();
    assert.equal(api.Translator.normalizedTarget('NB'), 'no');
    assert.equal(api.Translator.googleTargetCode('nb'), 'no');
});

test('message list renders safe local conversations with language controls and no production or network action', async () => {
    const { api, sandbox } = await loadAssistant();
    const productionActions = /data-action="(?:ai-polish-reply|ai-auto-reply|free-translate-reply|regenerate-reply|insert-reply|campaign-send-next)"/;
    let agentRequests = 0;
    let translationRequests = 0;
    api.MessageCenterAgent.request = async () => { agentRequests += 1; throw new Error('must not request'); };
    api.Translator.translate = async () => { translationRequests += 1; throw new Error('must not translate during render'); };
    api.MessageCenterAgent.scanConversationList = () => [
        {
            conversationId: 'thread-1',
            conversationUrl: 'https://www.etsy.com/messages/thread-1',
            buyerName: 'Ashley <img data-name-injection>',
            preview: 'Could you make this in blue? <script data-preview-injection>',
            unread: true,
        },
        {
            conversationId: 'thread-2',
            conversationUrl: 'https://www.etsy.com/conversations/with/thread-2',
            buyerName: 'Morgan', preview: 'Thank you!', unread: false,
        },
        {
            conversationId: 'external',
            conversationUrl: 'https://evil.example/messages/external',
            buyerName: 'Unsafe', preview: 'Must be filtered', unread: true,
        },
        {
            conversationId: 'all',
            conversationUrl: 'https://www.etsy.com/messages/all',
            buyerName: 'Reserved', preview: 'Must be filtered', unread: false,
        },
    ];

    for (const path of ['/messages', '/messages/all']) {
        sandbox.location.pathname = path;
        sandbox.location.href = `https://www.etsy.com${path}`;
        api.UI.state.context = null;
        const markup = api.UI.renderMessages();
        assert.match(markup, /Etsy konuşmaları/i);
        assert.match(markup, /Ashley &lt;img data-name-injection&gt;/);
        assert.match(markup, /Could you make this in blue\? &lt;script data-preview-injection&gt;/);
        assert.match(markup, /Morgan/);
        assert.match(markup, /Okunmadı/);
        assert.match(markup, /data-message-open-url="https:\/\/www\.etsy\.com\/messages\/thread-1"/);
        assert.match(markup, /data-message-list-language/);
        assert.match(markup, /Görüntüleme dili/);
        assert.match(markup, /data-action="message-list-translate"/);
        assert.doesNotMatch(markup, /evil\.example|Must be filtered|<img data-name-injection|<script data-preview-injection/);
        assert.doesNotMatch(markup, productionActions);
        assert.doesNotMatch(markup, /data-bind="draftTr"|data-message-template-select/);
    }
    assert.equal(agentRequests, 0);
    assert.equal(translationRequests, 0);
});

test('message-list language controls and rows are width-bounded inside the assistant panel', async () => {
    const source = readUserscriptSource();
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/all';
    sandbox.location.href = 'https://www.etsy.com/messages/all';
    api.MessageCenterAgent.scanConversationList = () => [{
        conversationId: 'thread-width',
        conversationUrl: 'https://www.etsy.com/messages/thread-width',
        buyerName: 'Width check',
        preview: 'A preview that must remain inside the panel',
        unread: false,
    }];

    const markup = api.UI.renderMessages();
    assert.match(markup, /class="ma-stack ma-message-list-shell"/);
    assert.match(markup, /class="ma-card ma-message-list-controls"/);
    assert.match(markup, /class="ma-list-item ma-message-list__item"/);
    assert.match(source, /\.ma-message-list-controls \.ma-select\{min-width:0;max-width:100%\}/);
    assert.match(source, /\.ma-message-list-shell>\.ma-list[^{}]*\{min-width:0;max-width:100%\}/);
    assert.match(source, /\.ma-message-list-shell[^{}]*\{grid-template-columns:minmax\(0,1fr\)\}/);
    assert.match(source, /\.ma-message-list__item \.ma-disclosure__body\{min-width:0;overflow-wrap:anywhere\}/);
});

test('delivered-order layout uses responsive premium cards inside the narrow assistant panel', async () => {
    const source = readUserscriptSource();
    const { api } = await loadAssistant();
    api.UI.state.ordersTemplateInitialized = false;
    api.UI.refreshOrders();

    const markup = api.UI.renderOrders();
    assert.match(markup, /class="ma-automation-hero"/);
    assert.match(markup, /class="ma-order-toolbar"/);
    assert.match(markup, /class="ma-empty-inline"|class="ma-order-grid"/);
    assert.match(source, /\.ma-main\{container-type:inline-size\}/);
    assert.match(source, /\.ma-order-grid\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(350px,1fr\)\)/);
    assert.match(source, /@container \(max-width:720px\)\{\.ma-view\{padding:16px\}\.ma-order-grid\{grid-template-columns:1fr\}/);
});

test('message-list open action validates a canonical Etsy conversation URL before navigation', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/all';
    sandbox.location.href = 'https://www.etsy.com/messages/all';
    const click = value => api.UI.onClick({
        target: { closest: () => ({ dataset: { messageOpenUrl: value } }) },
    });

    await click('https://www.etsy.com/messages/thread-1?ref=inbox#unsafe-fragment');
    assert.equal(sandbox.location.href, 'https://www.etsy.com/messages/thread-1?ref=inbox');

    assert.equal(
        api.MessageCenterAgent.canonicalConversationUrl('https://www.etsy.com/messages/thread-1?conversation_id=thread-1&ref=inbox'),
        'https://www.etsy.com/messages/thread-1?conversation_id=thread-1&ref=inbox',
    );
    assert.equal(
        api.MessageCenterAgent.canonicalConversationUrl('https://www.etsy.com/messages?conversation_id=thread-1'),
        'https://www.etsy.com/messages?conversation_id=thread-1',
    );

    sandbox.location.href = 'https://www.etsy.com/messages/all';
    for (const unsafeUrl of [
        'https://evil.example/messages/thread-2',
        'https://www.etsy.com/messages/all',
        'https://www.etsy.com/messages/all?conversation_id=thread-2',
        'https://www.etsy.com/messages/thread-1?conversation_id=thread-2',
        'https://www.etsy.com/messages/thread-1?conversation_id=',
        'https://www.etsy.com/messages/thread-1?conversation_id=%2F',
        'https://www.etsy.com/messages?conversation_id=thread-1&conversation_id=thread-2',
        'https://www.etsy.com/conversations/all?conversation_id=thread-2',
        'https://www.etsy.com/conversations/with?conversation_id=thread-2',
        'https://www.etsy.com/conversations/with/thread-1?conversation_id=thread-2',
        'https://www.etsy.com/messages/thread%2F2',
        'https://www.etsy.com/messages/%2561ll',
        'https://www.etsy.com/messages/%25252Fthread-2',
        'https://www.etsy.com/messages/%252561ll',
    ]) {
        await assert.rejects(click(unsafeUrl), /güvenli|Etsy konuşma/i);
        assert.equal(sandbox.location.href, 'https://www.etsy.com/messages/all');
    }
});

test('Message Center conversation matching rejects path/query identity conflicts', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/alice';
    sandbox.location.search = '?conversation_id=bob';
    sandbox.location.href = 'https://www.etsy.com/messages/alice?conversation_id=bob';

    assert.equal(api.Router.conversationId(), '');
    assert.equal(api.MessageCenterAgent.canonicalConversationUrl(sandbox.location.href), '');
    assert.equal(api.MessageCenterAgent.jobConversationMatches({
        conversationUrl: 'https://www.etsy.com/messages/alice?conversation_id=bob',
    }), false);

    sandbox.location.search = '?conversation_id=alice';
    sandbox.location.href = 'https://www.etsy.com/messages/alice?conversation_id=alice';
    assert.equal(api.Router.conversationId(), 'alice');
    assert.equal(api.MessageCenterAgent.jobConversationMatches({
        conversationId: 'alice',
        conversationUrl: 'https://www.etsy.com/messages/alice',
    }), true);
    assert.equal(api.MessageCenterAgent.jobConversationMatches({
        conversationUrl: 'https://www.etsy.com/messages/alice',
    }), false, 'remote jobs must declare the same canonical conversation identity');

    const composeUrl = 'https://www.etsy.com/messages/new?with_id=111&recipient_id=111&referring_id=10000001&referring_type=receipt';
    assert.equal(api.MessageCenterAgent.canonicalConversationUrl(composeUrl), '', 'remote Message Center jobs cannot target a compose route');
    sandbox.location.pathname = '/messages/new';
    sandbox.location.search = '?with_id=111&recipient_id=111&referring_id=10000001&referring_type=receipt';
    sandbox.location.href = composeUrl;
    assert.equal(api.MessageCenterAgent.jobConversationMatches({ conversationUrl: composeUrl }), false);
});

test('message-list translations are cache-first, explicit, preserve originals, and report provider failures honestly', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/all';
    sandbox.location.href = 'https://www.etsy.com/messages/all';
    api.UI.state.context = null;
    api.MessageCenterAgent.scanConversationList = () => [
        {
            conversationId: 'thread-1', conversationUrl: 'https://www.etsy.com/messages/thread-1',
            buyerName: 'Ashley', preview: 'Can you make this in blue?', unread: true,
        },
        {
            conversationId: 'thread-2', conversationUrl: 'https://www.etsy.com/messages/thread-2',
            buyerName: 'Morgan', preview: 'Will this arrive Friday?', unread: false,
        },
    ];
    api.Store.settings.previewLanguage = 'tr';
    let requests = 0;
    api.Translator.cached = text => text.startsWith('Can you')
        ? { text: 'Bunu mavi yapabilir misiniz?', detectedLanguage: 'en', provider: 'google' }
        : null;
    api.Translator.translate = async text => {
        requests += 1;
        if (text.startsWith('Will this')) throw new Error('injected provider outage');
        return { text: 'Beklenmeyen', detectedLanguage: 'en', provider: 'google' };
    };

    const cachedMarkup = api.UI.renderMessages();
    assert.match(cachedMarkup, /Bunu mavi yapabilir misiniz\?/);
    assert.match(cachedMarkup, /Can you make this in blue\?/);
    assert.match(cachedMarkup, /Google/);
    assert.equal(requests, 0, 'render must never initiate translation network work');

    api.UI.toast = () => {};
    await api.UI.translateMessageListPreviews();
    assert.equal(requests, 1, 'only the uncached preview should reach the provider');
    const failedMarkup = api.UI.renderMessages();
    assert.match(failedMarkup, /1 önizleme çevrilemedi|çeviri.*başarısız/i);
    assert.match(failedMarkup, /Will this arrive Friday\?/);
    assert.match(failedMarkup, /orijinal/i);
});

test('message-list language selector persists a broad supported target and triggers explicit retranslation', async () => {
    const { api, sandbox, storage } = await loadAssistant();
    sandbox.location.pathname = '/messages/all';
    sandbox.location.href = 'https://www.etsy.com/messages/all';
    api.UI.state.context = null;
    api.MessageCenterAgent.scanConversationList = () => [];
    const markup = api.UI.renderMessages();
    const selector = markup.match(/<select[^>]*data-message-list-language[^>]*>([\s\S]*?)<\/select>/)?.[1] || '';
    assert.equal((selector.match(/<option /g) || []).length, 249, 'every current GTX target should be selectable');
    for (const code of ['aa', 'bci', 'fa-af', 'hi', 'iu-latn', 'ndc-zw', 'sat-latn', 'sw', 'vi', 'zh-tw', 'zap', 'zu']) {
        assert.match(selector, new RegExp(`value="${code}"`), `${code} should be selectable`);
    }
    for (const compatibilityAlias of ['fil', 'fr-fr', 'he', 'jv', 'pt-br', 'zh']) {
        assert.doesNotMatch(selector, new RegExp(`value="${compatibilityAlias}"`), `${compatibilityAlias} should not duplicate its canonical target`);
    }
    assert.equal(api.Translator.normalizedTarget('zh'), 'zh-cn');
    assert.equal(api.Translator.normalizedTarget('HE'), 'iw');
    assert.equal(api.Translator.googleTargetCode('fa-af'), 'fa-AF');
    assert.equal(api.Translator.googleTargetCode('mni-mtei'), 'mni-Mtei');
    assert.equal(api.Translator.googleTargetCode('ndc-zw'), 'ndc-ZW');
    assert.equal(api.Translator.googleTargetCode('zh'), 'zh-CN');

    let translations = 0;
    api.UI.translateMessageListPreviews = async () => { translations += 1; return true; };
    const savedShowRiskTags = api.Store.settings.showRiskTags;
    api.UI.state.settingsDraft = { ...api.Store.settings, shopName: 'Unsaved quick-selector draft', showRiskTags: !savedShowRiskTags };
    api.UI.state.settingsDirty = true;
    await api.UI.onChange({ target: { dataset: { messageListLanguage: '' }, value: 'hi' } });
    assert.equal(api.Store.settings.previewLanguage, 'hi');
    assert.equal(storage.get(api.KEYS.settings).previewLanguage, 'hi');
    assert.equal(api.Store.settings.showRiskTags, savedShowRiskTags, 'quick selector must not commit unrelated draft fields');
    assert.equal(api.UI.state.settingsDraft.previewLanguage, 'hi', 'the open settings draft must follow the persisted quick choice');
    assert.equal(api.UI.state.settingsDraft.shopName, 'Unsaved quick-selector draft');
    assert.equal(api.UI.state.settingsDraft.showRiskTags, !savedShowRiskTags);
    assert.equal(api.UI.state.settingsDirty, true);
    assert.equal(translations, 1);

    const snapshot = api.ConfigManager.snapshot();
    snapshot.settings.previewLanguage = 'zu';
    await api.ConfigManager.importText(JSON.stringify(snapshot));
    assert.equal(api.Store.settings.previewLanguage, 'zu');
    const beforeInvalid = copy(api.Store.settings);
    snapshot.settings.previewLanguage = 'not-a-supported-language';
    await assert.rejects(api.ConfigManager.importText(JSON.stringify(snapshot)), /config/i);
    assert.deepEqual(copy(api.Store.settings), beforeInvalid);

    const legacyAliasSnapshot = api.ConfigManager.snapshot();
    legacyAliasSnapshot.schemaVersion = 6;
    legacyAliasSnapshot.settings.previewLanguage = 'zh';
    await api.ConfigManager.importText(JSON.stringify(legacyAliasSnapshot));
    assert.equal(api.Store.settings.previewLanguage, 'zh');
    const aliasMarkup = api.UI.renderMessages();
    assert.match(aliasMarkup, /<option value="zh-cn" selected>/, 'a legacy alias should select its canonical target');
});

test('DeepL target capability fails clearly or uses the configured Google fallback', async () => {
    const { api } = await loadAssistant();
    api.Store.settings.translator = 'deepl';
    api.Store.settings.deeplApiKey = 'test-key';
    api.Store.settings.freeFallback = false;
    api.Translator.cache.clear();
    await assert.rejects(
        api.Translator.translate('Unique source without fallback', 'zu'),
        /DeepL.*Zulu|DeepL.*desteklemiyor/i,
    );

    let googleCalls = 0;
    api.Store.settings.freeFallback = true;
    api.Translator.google = async (_text, target) => {
        googleCalls += 1;
        assert.equal(target, 'zu');
        return { text: 'Google fallback result', detectedLanguage: 'en', provider: 'google' };
    };
    const result = await api.Translator.translate('Unique source with fallback', 'zu');
    assert.equal(result.provider, 'google');
    assert.equal(googleCalls, 1);
});

test('message-list retries a transient Google fallback when preferred DeepL is available again', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/all';
    sandbox.location.href = 'https://www.etsy.com/messages/all';
    api.Store.settings.translator = 'deepl';
    api.Store.settings.deeplApiKey = 'test-key';
    api.Store.settings.freeFallback = true;
    api.Store.settings.previewLanguage = 'tr';
    api.Translator.cache.clear();
    const item = {
        conversationId: 'retry-deepl', conversationUrl: 'https://www.etsy.com/messages/retry-deepl',
        buyerName: 'Retry', preview: 'Please translate this once', unread: false,
    };
    api.MessageCenterAgent.scanConversationList = () => [item];
    let deepLCalls = 0;
    let googleCalls = 0;
    api.Translator.deepl = async () => {
        deepLCalls += 1;
        if (deepLCalls === 1) throw new Error('injected transient DeepL outage');
        return { text: 'DeepL sonucu', detectedLanguage: 'en', provider: 'deepl' };
    };
    api.Translator.google = async () => {
        googleCalls += 1;
        return { text: 'Geçici Google sonucu', detectedLanguage: 'en', provider: 'google' };
    };

    assert.equal(await api.UI.translateMessageListPreviews(), true);
    assert.equal(api.UI.messageListTranslationFor(item, 'tr').provider, 'google');
    assert.equal(await api.UI.translateMessageListPreviews(), true);
    assert.equal(deepLCalls, 2, 'a manual retry must try the preferred provider again');
    assert.equal(googleCalls, 1);
    assert.equal(api.UI.messageListTranslationFor(item, 'tr').provider, 'deepl');
});

test('message-list invalidates local English output when US-English preference changes', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/all';
    sandbox.location.href = 'https://www.etsy.com/messages/all';
    api.Store.settings.translator = 'deepl';
    api.Store.settings.deeplApiKey = 'test-key';
    api.Store.settings.freeFallback = false;
    api.Store.settings.previewLanguage = 'en';
    api.Store.settings.preferUsEnglish = false;
    const item = {
        conversationId: 'english-locale', conversationUrl: 'https://www.etsy.com/messages/english-locale',
        buyerName: 'English', preview: 'Translate to preferred English', unread: false,
    };
    api.MessageCenterAgent.scanConversationList = () => [item];
    const targets = [];
    api.Translator.cached = () => null;
    api.Translator.translate = async (_text, target) => {
        const effective = api.Translator.effectiveTarget(target);
        targets.push(effective);
        return { text: effective, detectedLanguage: 'tr', provider: 'deepl' };
    };

    const gbKey = api.UI.messageListTranslationKey(item, 'en');
    assert.equal(await api.UI.translateMessageListPreviews(), true);
    api.Store.settings.preferUsEnglish = true;
    const usKey = api.UI.messageListTranslationKey(item, 'en');
    assert.notEqual(usKey, gbKey);
    assert.equal(await api.UI.translateMessageListPreviews(), true);
    assert.deepEqual(targets, ['en-gb', 'en-us']);
    assert.equal(api.UI.messageListTranslationFor(item, 'en').text, 'en-us');
});

test('message-list discards an in-flight result after provider policy changes', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/all';
    sandbox.location.href = 'https://www.etsy.com/messages/all';
    api.Store.settings.translator = 'google';
    api.Store.settings.previewLanguage = 'tr';
    const item = {
        conversationId: 'policy-race', conversationUrl: 'https://www.etsy.com/messages/policy-race',
        buyerName: 'Policy', preview: 'Deferred provider result', unread: false,
    };
    api.MessageCenterAgent.scanConversationList = () => [item];
    api.Translator.cached = () => null;
    let release;
    api.Translator.translate = () => new Promise(resolve => { release = resolve; });

    const oldPolicyKey = api.UI.messageListTranslationKey(item, 'tr');
    const run = api.UI.translateMessageListPreviews();
    await new Promise(resolve => setImmediate(resolve));
    api.Store.settings.translator = 'deepl';
    api.Store.settings.deeplApiKey = 'new-policy-key';
    const newPolicyKey = api.UI.messageListTranslationKey(item, 'tr');
    assert.notEqual(newPolicyKey, oldPolicyKey);
    release({ text: 'Old Google result', detectedLanguage: 'en', provider: 'google' });

    assert.equal(await run, false);
    assert.equal(api.UI.state.messageListTranslations.has(newPolicyKey), false);
    assert.equal(api.UI.state.messageListTranslations.has(oldPolicyKey), false);
});

test('unsupported DeepL list target is blocked once without preview attempts or history noise', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/all';
    sandbox.location.href = 'https://www.etsy.com/messages/all';
    api.Store.settings.translator = 'deepl';
    api.Store.settings.deeplApiKey = 'test-key';
    api.Store.settings.freeFallback = false;
    api.MessageCenterAgent.scanConversationList = () => Array.from({ length: 4 }, (_, index) => ({
        conversationId: `unsupported-${index}`,
        conversationUrl: `https://www.etsy.com/messages/unsupported-${index}`,
        buyerName: `Buyer ${index}`,
        preview: `Preview ${index}`,
        unread: false,
    }));
    let attempts = 0;
    api.Translator.translate = async () => { attempts += 1; throw new Error('must not run'); };

    await api.UI.onChange({ target: { dataset: { messageListLanguage: '' }, value: 'zu' } });
    assert.equal(api.Store.settings.previewLanguage, 'zu');
    assert.equal(attempts, 0);
    assert.equal(api.UI.state.messageListTranslationStatus.phase, 'blocked');
    assert.equal(api.Store.history.filter(item => item.type === 'translated').length, 0);
    assert.match(api.UI.renderMessages(), /DeepL.*Zulu.*desteklemiyor/i);
});

test('message-list automatic preview translation is default-on, optional, capped, and bounded', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/all';
    sandbox.location.href = 'https://www.etsy.com/messages/all';
    api.MessageCenterAgent.scanConversationList = () => Array.from({ length: 80 }, (_, index) => ({
        conversationId: `thread-${index}`,
        conversationUrl: `https://www.etsy.com/messages/thread-${index}`,
        buyerName: `Buyer ${index}`,
        preview: `Visible preview ${index}`,
        unread: false,
    }));
    api.Store.settings.autoTurkishPreview = true;
    api.Store.settings.previewLanguage = 'tr';
    api.Translator.cached = () => null;
    let calls = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    api.Translator.translate = async text => {
        calls += 1;
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise(resolve => setImmediate(resolve));
        inFlight -= 1;
        return { text: `TR ${text}`, detectedLanguage: 'en', provider: 'google' };
    };

    await api.UI.refreshMessages();
    assert.equal(calls, 50, 'only the capped visible list may be sent to the translator');
    assert.ok(maxInFlight <= 3, `translation concurrency must be bounded, saw ${maxInFlight}`);
    assert.equal(api.UI.state.messageListTranslationStatus.phase, 'success');
    assert.equal(api.UI.state.messageListTranslationStatus.total, 50);
    await waitUntil(
        () => api.Store.history.filter(item => item.type === 'translated').length === 1,
        'the non-blocking list history write did not settle',
    );
    const batchHistory = api.Store.history.filter(item => item.type === 'translated');
    assert.equal(batchHistory.length, 1, 'one list batch must create one history row, not one row per preview');
    assert.equal(batchHistory[0].detail.previews, 50);
    assert.equal(batchHistory[0].detail.requests, 50);

    calls = 0;
    api.Store.settings.autoTurkishPreview = false;
    api.MessageCenterAgent.scanConversationList = () => [{
        conversationId: 'manual-only', conversationUrl: 'https://www.etsy.com/messages/manual-only',
        buyerName: 'Manual', preview: 'Must remain local', unread: false,
    }];
    await api.UI.refreshMessages();
    assert.equal(calls, 0, 'automatic translation must stay off when the preference is disabled');
    assert.equal(api.UI.state.messageListTranslationStatus.phase, 'idle');
    assert.equal(api.Store.history.filter(item => item.type === 'translated').length, 1);
});

test('message-list translation deduplicates identical previews within one batch', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/all';
    sandbox.location.href = 'https://www.etsy.com/messages/all';
    api.Store.settings.previewLanguage = 'tr';
    api.Translator.cached = () => null;
    api.UI.toast = () => {};
    api.MessageCenterAgent.scanConversationList = () => [
        ...Array.from({ length: 3 }, (_, index) => ({
            conversationId: `duplicate-${index}`,
            conversationUrl: `https://www.etsy.com/messages/duplicate-${index}`,
            buyerName: `Duplicate ${index}`,
            preview: 'The same visible preview',
            unread: false,
        })),
        {
            conversationId: 'unique', conversationUrl: 'https://www.etsy.com/messages/unique',
            buyerName: 'Unique', preview: 'A unique visible preview', unread: false,
        },
    ];
    const calls = [];
    api.Translator.translate = async (text, target, options) => {
        calls.push({ text, target, options: { ...options } });
        return { text: `TR ${text}`, detectedLanguage: 'en', provider: 'google' };
    };

    assert.equal(await api.UI.translateMessageListPreviews(), true);
    assert.equal(calls.length, 2, 'identical previews should share one provider request');
    assert.ok(calls.every(call => call.options.logHistory === false));
    assert.equal(api.UI.state.messageListTranslationStatus.completed, 4);
    assert.equal(api.UI.state.messageListTranslations.size, 4);
    await waitUntil(
        () => api.Store.history.filter(item => item.type === 'translated').length === 1,
        'the deduplicated list history write did not settle',
    );
    const history = api.Store.history.filter(item => item.type === 'translated');
    assert.equal(history.length, 1);
    assert.equal(history[0].detail.previews, 4);
    assert.equal(history[0].detail.requests, 2);
});

test('message-list keeps distinct astral Unicode previews in cache, dedup, and DOM fingerprints', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/all';
    sandbox.location.href = 'https://www.etsy.com/messages/all';
    api.Store.settings.previewLanguage = 'tr';
    api.Translator.cache.clear();
    const previews = ['Order 😀', 'Order 😁'];
    let activePreviews = previews;
    api.MessageCenterAgent.scanConversationList = () => activePreviews.map((preview, index) => ({
        conversationId: `emoji-${index}`,
        conversationUrl: `https://www.etsy.com/messages/emoji-${index}`,
        buyerName: `Emoji ${index}`,
        preview,
        unread: false,
    }));
    const calls = [];
    api.Translator.translate = async text => {
        calls.push(text);
        return { text: `TR ${text}`, detectedLanguage: 'en', provider: 'google' };
    };

    assert.notEqual(api.Translator.cacheKey(previews[0], 'tr'), api.Translator.cacheKey(previews[1], 'tr'));
    assert.equal(await api.UI.translateMessageListPreviews(), true);
    assert.deepEqual(calls.sort(), [...previews].sort());
    assert.equal(api.UI.state.messageListTranslations.size, 2);

    activePreviews = [previews[0]];
    const firstFingerprint = api.Router.fingerprint();
    activePreviews = [previews[1]];
    assert.notEqual(api.Router.fingerprint(), firstFingerprint);
});

test('a partially successful message-list batch is recorded as partial and failed', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/all';
    sandbox.location.href = 'https://www.etsy.com/messages/all';
    api.Store.settings.previewLanguage = 'tr';
    api.Translator.cached = () => null;
    api.UI.toast = () => {};
    api.MessageCenterAgent.scanConversationList = () => [
        {
            conversationId: 'success', conversationUrl: 'https://www.etsy.com/messages/success',
            buyerName: 'Success', preview: 'Successful preview', unread: false,
        },
        {
            conversationId: 'failure', conversationUrl: 'https://www.etsy.com/messages/failure',
            buyerName: 'Failure', preview: 'Failing preview', unread: false,
        },
    ];
    api.Translator.translate = async (text) => {
        if (text.startsWith('Failing')) throw new Error('injected mixed-batch outage');
        return { text: 'Başarılı çeviri', detectedLanguage: 'en', provider: 'google' };
    };

    assert.equal(await api.UI.translateMessageListPreviews(), false);
    await waitUntil(
        () => api.Store.history.filter(item => item.type === 'translated').length === 1,
        'the partial list history write did not settle',
    );
    const history = api.Store.history.filter(item => item.type === 'translated');
    assert.equal(history.length, 1);
    assert.equal(history[0].status, 'partial');
    assert.equal(history[0].detail.previews, 1);
    assert.equal(history[0].detail.failed, 1);
    assert.equal(api.History.stats().failed, 1);
});

test('never-resolving history logging cannot block message-list translation results', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/all';
    sandbox.location.href = 'https://www.etsy.com/messages/all';
    api.Store.settings.previewLanguage = 'tr';
    api.Translator.cached = () => null;
    api.MessageCenterAgent.scanConversationList = () => [{
        conversationId: 'history-stall-list',
        conversationUrl: 'https://www.etsy.com/messages/history-stall-list',
        buyerName: 'Buyer',
        preview: 'Translate this preview',
        unread: false,
    }];
    api.Translator.translate = async text => ({ text: `TR ${text}`, detectedLanguage: 'en', provider: 'google' });
    const originalTryLog = api.History.tryLog;
    api.History.tryLog = () => new Promise(() => {});
    try {
        const outcome = await Promise.race([
            api.UI.translateMessageListPreviews(),
            new Promise(resolve => setTimeout(() => resolve('timed-out'), 100)),
        ]);
        assert.equal(outcome, true);
        assert.equal(api.UI.state.messageListTranslationStatus.phase, 'success');
        assert.equal(api.UI.state.messageListTranslations.size, 1);
    } finally {
        api.History.tryLog = originalTryLog;
    }
});

test('message-list translation discards results after language or route changes', async () => {
    const { api, sandbox } = await loadAssistant();
    const item = {
        conversationId: 'thread-stale', conversationUrl: 'https://www.etsy.com/messages/thread-stale',
        buyerName: 'Buyer', preview: 'Deferred preview', unread: false,
    };
    sandbox.location.pathname = '/messages/all';
    sandbox.location.href = 'https://www.etsy.com/messages/all';
    api.Store.settings.previewLanguage = 'tr';
    api.MessageCenterAgent.scanConversationList = () => [item];
    api.Translator.cached = () => null;
    let release;
    api.Translator.translate = () => new Promise(resolve => { release = resolve; });

    const languageRun = api.UI.translateMessageListPreviews();
    api.Store.settings.previewLanguage = 'de';
    api.UI.invalidateMessageListWork({ resetStatus: true });
    release({ text: 'Eski sonuç', detectedLanguage: 'en', provider: 'google' });
    assert.equal(await languageRun, false);
    assert.equal(api.UI.state.messageListTranslations.size, 0);
    assert.equal(api.UI.state.messageListTranslationStatus.phase, 'idle');

    api.Store.settings.previewLanguage = 'tr';
    let releaseRoute;
    api.Translator.translate = () => new Promise(resolve => { releaseRoute = resolve; });
    const routeRun = api.UI.translateMessageListPreviews();
    sandbox.location.pathname = '/messages/inbox';
    sandbox.location.href = 'https://www.etsy.com/messages/inbox';
    api.UI.invalidateMessageListWork({ resetStatus: true });
    releaseRoute({ text: 'Eski rota sonucu', detectedLanguage: 'en', provider: 'google' });
    assert.equal(await routeRun, false);
    assert.equal(api.UI.state.messageListTranslations.size, 0);
});

test('message-list stale work releases only its own busy state', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/all';
    sandbox.location.href = 'https://www.etsy.com/messages/all';
    api.Store.settings.previewLanguage = 'tr';
    api.MessageCenterAgent.scanConversationList = () => [{
        conversationId: 'busy-thread', conversationUrl: 'https://www.etsy.com/messages/busy-thread',
        buyerName: 'Buyer', preview: 'Busy preview', unread: false,
    }];
    api.Translator.cached = () => null;
    let release;
    api.Translator.translate = () => new Promise(resolve => { release = resolve; });
    api.UI.app = {
        classList: { toggle() {} },
        setAttribute() {},
    };

    const run = api.UI.translateMessageListPreviews();
    assert.equal(api.UI.state.busy, true);
    assert.ok(api.UI.messageListBusyGeneration > 0);
    api.UI.invalidateMessageListWork({ resetStatus: true });
    assert.equal(api.UI.state.busy, false, 'route/language invalidation must immediately release the owned busy state');
    assert.equal(api.UI.messageListBusyGeneration, 0);
    release({ text: 'Late result', detectedLanguage: 'en', provider: 'google' });
    assert.equal(await run, false);
    assert.equal(api.UI.state.busy, false);
});

test('an old list-translate click cannot clear a newer automatic batch busy state', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/all';
    sandbox.location.href = 'https://www.etsy.com/messages/all';
    api.Store.settings.previewLanguage = 'tr';
    api.MessageCenterAgent.scanConversationList = () => [{
        conversationId: 'busy-owner', conversationUrl: 'https://www.etsy.com/messages/busy-owner',
        buyerName: 'Buyer', preview: 'Busy ownership preview', unread: false,
    }];
    api.Translator.cached = () => null;
    const releases = [];
    api.Translator.translate = () => new Promise(resolve => { releases.push(resolve); });
    api.UI.app = {
        classList: { toggle() {} },
        setAttribute() {},
    };
    const event = {
        target: { closest: () => ({ dataset: { action: 'message-list-translate' } }) },
    };

    const clickRun = api.UI.onClick(event);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(releases.length, 1);
    api.UI.invalidateMessageListWork({ resetStatus: true });
    const automaticRun = api.UI.translateMessageListPreviews({ auto: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(releases.length, 2);
    const newerBusyGeneration = api.UI.messageListBusyGeneration;
    assert.ok(newerBusyGeneration > 0);
    assert.equal(api.UI.state.busy, true);

    releases[0]({ text: 'Old result', detectedLanguage: 'en', provider: 'google' });
    await clickRun;
    assert.equal(api.UI.messageListBusyGeneration, newerBusyGeneration);
    assert.equal(api.UI.state.busy, true, 'the stale click finally must not release the newer batch');

    releases[1]({ text: 'New result', detectedLanguage: 'en', provider: 'google' });
    assert.equal(await automaticRun, true);
    assert.equal(api.UI.messageListBusyGeneration, 0);
    assert.equal(api.UI.state.busy, false);
});

test('message context reads an order only from the unique companion buyer-info scope', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/active-conversation';
    sandbox.location.href = 'https://www.etsy.com/messages/active-conversation';

    const orderLink = { href: 'https://www.etsy.com/your/orders/sold?order_id=22222222' };
    const otherOrderLink = { href: 'https://www.etsy.com/your/orders/sold?order_id=99999999' };
    const buyerInfo = {
        querySelector(selector) {
            return selector.includes('order_id=') ? orderLink : null;
        },
        querySelectorAll(selector) {
            if (selector === 'a[href*="order_id="]') return [orderLink];
            return [];
        },
    };
    const unrelatedBuyerInfo = {
        querySelector(selector) {
            return selector.includes('order_id=') ? otherOrderLink : null;
        },
        querySelectorAll(selector) {
            if (selector === 'a[href*="order_id="]') return [otherOrderLink];
            return [];
        },
    };
    let companionScopes = [buyerInfo];
    const conversationRoot = {
        querySelectorAll(selector) {
            return selector === api.MessageAdapter.orderDetailsSelector ? companionScopes : [];
        },
    };
    const textarea = {
        closest(selector) {
            return selector === '.conversations-subapp' ? conversationRoot : null;
        },
    };
    const customerBubble = {
        id: 'active-customer-message',
        innerText: 'Where is my order?',
        textContent: 'Where is my order?',
        className: 'message-bubble',
        closest: () => ({ className: 'wt-grid' }),
    };
    const buyerHeader = {
        textContent: 'Active Buyer',
        closest: () => ({ querySelector: () => null }),
    };
    const conversationScope = {
        querySelector(selector) {
            if (selector === 'h3.buyer-name a' || selector === 'h3.buyer-name') return buyerHeader;
            return null;
        },
        querySelectorAll(selector) {
            if (selector === api.MessageAdapter.bubbleSelector) return [customerBubble];
            return [];
        },
    };
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.getConversationScope = () => conversationScope;

    const context = api.MessageAdapter.context();
    assert.equal(context.conversationId, 'active-conversation');
    assert.equal(context.customerName, 'Active Buyer');
    assert.equal(context.orderId, '22222222');
    assert.equal(context.lastCustomerMessage, 'Where is my order?');

    companionScopes = [buyerInfo, unrelatedBuyerInfo];
    assert.equal(
        api.MessageAdapter.context().orderId,
        '',
        'multiple companion order scopes must fail closed instead of choosing a buyer order',
    );
});

test('review scanning includes cards whose buyer updated a review', async () => {
    const { api, sandbox } = await loadAssistant();
    const updatedCard = {
        textContent: 'Ashley updated a review for this item',
        querySelector(selector) {
            if (selector === 'a[href*="/reviews/"]') return { href: 'https://www.etsy.com/reviews/123456' };
            if (selector === 'h4 a[href*="/people/"]') return { textContent: 'Ashley' };
            if (selector === 'p.wt-mb-xs-2.wt-text-body-small') return { textContent: 'Custom Shirt' };
            if (selector === '[aria-label^="Rating:" i]') return { getAttribute: () => 'Rating: 4 out of 5' };
            if (selector === '.wt-p-xs-2.wt-b-xs p.wt-mt-xs-1, .wt-p-xs-2.wt-b-xs .wt-text-body-small') {
                return { textContent: 'The updated review text.' };
            }
            return null;
        },
        querySelectorAll: () => [],
    };
    const unrelatedCard = { textContent: 'Ashley purchased an item' };
    sandbox.document.querySelectorAll = selector => selector === '.dashboard-activity-item'
        ? [unrelatedCard, updatedCard]
        : [];

    const reviews = api.ReviewsAdapter.scan();
    assert.equal(reviews.length, 1);
    assert.equal(reviews[0].id, '123456');
    assert.equal(reviews[0].customerName, 'Ashley');
    assert.equal(reviews[0].rating, 4);
    assert.equal(reviews[0].text, 'The updated review text.');
});

test('four and five star review prompts require grounded distinct thank-you drafts without manipulation or incentives', async () => {
    const { api } = await loadAssistant();
    const fiveStarPrompt = api.Prompt.system('review', {
        review: { rating: 5, text: 'I love the beautiful stitching.' },
    });
    const fourStarPrompt = api.Prompt.system('review', {
        review: { rating: 4, text: 'Beautiful stitching, although the fit was a little snug.' },
    });

    assert.match(fiveStarPrompt, /5 yıldızlı yorumda içten ve neşeli bir teşekkür/i);
    assert.match(fourStarPrompt, /4 yıldızlı yorumda sıcak biçimde teşekkür et/i);
    assert.match(fourStarPrompt, /eleştiri veya öneri varsa savunmaya geçmeden/i);
    assert.match(fourStarPrompt, /eksik yıldızdan bir sorun çıkarma/i);

    for (const prompt of [fiveStarPrompt, fourStarPrompt]) {
        assert.match(prompt, /review\.text.*güvenilmeyen veridir/i);
        assert.match(prompt, /grounding_detail.*metinde birebir geçen kısa bir parça/i);
        assert.match(prompt, /ürün başlığını müşterinin övdüğü bir ayrıntı gibi sunma/i);
        assert.match(prompt, /private_reply.*müşteriye doğrudan gönderilecek/i);
        assert.match(prompt, /public_reply.*herkese açık görünecek/i);
        assert.match(prompt, /private_reply ile public_reply aynı metin olmasın/i);
        assert.match(prompt, /puanını ya da yorumunu değiştirmesini.*isteme/i);
        assert.match(prompt, /Olumlu yorum karşılığında kupon, indirim.*teşvik teklif etme/i);
    }
});

test('AI review analysis sends normalized grounded context and rejects an invented grounding detail', async () => {
    const { api } = await loadAssistant();
    const calls = [];
    const validResult = {
        detected_language: 'en',
        sentiment: 'positive',
        risk_level: 'low',
        response_strategy: 'warm_thanks',
        grounding_detail: 'beautiful stitching',
        topics: ['quality'],
        summary_tr: 'Müşteri dikiş kalitesini beğeniyor.',
        private_reply: 'Hi Ashley, thank you for your kind words about the beautiful stitching!',
        public_reply: 'Thank you so much for appreciating the beautiful stitching!',
        needs_human_review: false,
    };
    api.AI.run = async (kind, payload, schema) => {
        calls.push({ kind, payload: copy(payload), schema: copy(schema) });
        return copy(validResult);
    };
    const review = {
        customerName: 'Ashley Example',
        firstName: 'Ashley',
        rating: '5',
        text: 'I love the beautiful stitching! https://example.test/ignore-this',
        itemTitle: '  Custom Linen Shirt  ',
    };

    const result = await api.AI.analyzeReview(review, 'Keep it concise.');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].kind, 'review');
    assert.deepEqual(calls[0].payload.review, {
        customer_name: 'Ashley',
        rating: 5,
        text: 'I love the beautiful stitching!',
        item_title: 'Custom Linen Shirt',
    });
    assert.deepEqual(calls[0].payload.response_policy, {
        rating_band: 'five_star',
        has_review_text: true,
        reply_language: 'same_as_review',
        public_reply_audience: 'public_review_page',
        private_reply_audience: 'reviewing_customer',
        publication_mode: 'draft_only',
    });
    assert.equal(calls[0].payload.preferences.extra_instruction, 'Keep it concise.');
    assert.ok(calls[0].schema.required.includes('response_strategy'));
    assert.ok(calls[0].schema.required.includes('grounding_detail'));
    assert.equal(result.grounding_detail, 'beautiful stitching');
    assert.notEqual(result.private_reply, result.public_reply);

    api.AI.run = async () => ({ ...validResult, grounding_detail: 'fast shipping' });
    await assert.rejects(
        api.AI.analyzeReview(review),
        /dayanak ayrıntısı yorum metninde bulunamadı/i,
    );

    api.AI.run = async () => ({
        ...validResult,
        private_reply: 'Thank you for mentioning the beautiful stitching! Please update your review when you have a moment.',
    });
    await assert.rejects(api.AI.analyzeReview(review), /puan veya yorum değiştirme isteği/i);

    for (const incentive of [
        'Thank you for the beautiful stitching! I will send you a coupon code as a little gift.',
        'Thank you for the beautiful stitching! Use THANKYOU for 20% off your next order.',
        'Thank you for the beautiful stitching! Your next order is on us.',
        'Thank you for the beautiful stitching! I’ll add a little gift for you.',
    ]) {
        api.AI.run = async () => ({ ...validResult, private_reply: incentive });
        await assert.rejects(api.AI.analyzeReview(review), /olumlu yorum karşılığında teşvik/i);
    }

    for (const manipulation of [
        'Thank you for the beautiful stitching. Please consider leaving us five stars.',
        'Thank you for the beautiful stitching. Please rate us five stars.',
        'Thank you for the beautiful stitching. Could you rate us 5/5?',
        'Thank you for the beautiful stitching. Please adjust your star rating.',
        'Thank you for the beautiful stitching. Kindly turn those four stars into five.',
        'Thank you for the beautiful stitching. Please update\nyour review.',
        'Thank you for the beautiful stitching. Would you consider updating your feedback?',
        'Thank you for the beautiful stitching. We hope this deserves a perfect score.',
        'Thank you for the beautiful stitching. Please leave another lovely review.',
        'Thank you for the beautiful stitching. Would you give us a 5-star rating?',
        'Thank you for the beautiful stitching. We’d love a five-star review.',
        'Beautiful stitching made our day. A five-star rating would help us.',
        'Thank you for the beautiful stitching. We hope you can reconsider your rating.',
        'Beautiful stitching yorumunuz için teşekkürler. Bize 5 yıldız verir misiniz?',
        'Beautiful stitching yorumunuz için teşekkürler. Bizi beş yıldızla değerlendirin.',
        "Beautiful stitching yorumunuz için teşekkürler. Puanınızı 5'e çıkarır mısınız?",
        'Beautiful stitching yorumunuz için teşekkürler. Geri bildiriminizi günceller misiniz?',
        'Beautiful stitching yorumunuz için teşekkürler. Eksik yıldızı tamamlarsanız çok sevinirim.',
    ]) {
        api.AI.run = async () => ({ ...validResult, private_reply: manipulation });
        await assert.rejects(api.AI.analyzeReview(review), /puan veya yorum değiştirme isteği/i);
    }

    api.AI.run = async () => ({
        ...validResult,
        private_reply: 'Thank you for noticing the beautiful stitching and for leaving us five stars.',
    });
    const benignRatingThanks = await api.AI.analyzeReview(review);
    assert.match(benignRatingThanks.private_reply, /leaving us five stars/i);

    api.AI.run = async () => ({
        ...validResult,
        private_reply: 'Thank you for noticing the beautiful stitching. Please know how much your five-star review means to us.',
    });
    const benignRatingMeaning = await api.AI.analyzeReview(review);
    assert.match(benignRatingMeaning.private_reply, /means to us/i);

    api.AI.run = async () => ({
        ...validResult,
        private_reply: 'Thank you for the beautiful stitching and for your updated review.',
    });
    const benignUpdatedReview = await api.AI.analyzeReview(review);
    assert.match(benignUpdatedReview.private_reply, /updated review/i);

    api.AI.run = async () => ({
        ...validResult,
        public_reply: 'Thank you so much for your thoughtful review!',
    });
    await assert.rejects(api.AI.analyzeReview(review), /dayanak ayrıntısı public cevapta kullanılmadı/i);

    api.AI.run = async () => ({
        ...validResult,
        private_reply: 'Hi Ashley, thank you for the wonderfully fast shipping!',
        public_reply: 'Thank you so much for praising the fast shipping!',
    });
    await assert.rejects(api.AI.analyzeReview(review), /dayanak ayrıntısı (?:özel|public) cevapta kullanılmadı|yorumda bulunmayan/i);

    api.AI.run = async () => ({
        ...validResult,
        grounding_detail: "I'm thrilled with the color",
        private_reply: 'Hi Ashley, we are thrilled that you loved the color!',
        public_reply: 'Thank you so much for your kind words about the color!',
    });
    const apostropheNormalized = await api.AI.analyzeReview({
        ...review,
        text: 'I’m thrilled with the color!',
    });
    assert.equal(apostropheNormalized.grounding_detail, "I'm thrilled with the color");

    api.AI.run = async () => ({
        ...validResult,
        grounding_detail: 'soft fit',
        private_reply: 'Thank you; we are delighted that you enjoyed the softness!',
        public_reply: 'We are so glad it fits beautifully. Thank you for your review!',
    });
    const morphologyGrounded = await api.AI.analyzeReview({
        ...review,
        text: 'The soft fit is lovely.',
    });
    assert.match(morphologyGrounded.private_reply, /softness/i);
    assert.match(morphologyGrounded.public_reply, /fits/i);

    api.AI.run = async () => ({
        ...validResult,
        grounding_detail: 'material',
        private_reply: 'Thank you for the thoughtful maternity feedback!',
        public_reply: 'We truly appreciate your maternity comment. Thank you!',
    });
    await assert.rejects(
        api.AI.analyzeReview({ ...review, text: 'The material is lovely.' }),
        /dayanak ayrıntısı özel cevapta kullanılmadı/i,
    );

    for (const unrelatedWord of ['materially', 'fitness']) {
        const detailWord = unrelatedWord === 'fitness' ? 'fit' : 'material';
        api.AI.run = async () => ({
            ...validResult,
            grounding_detail: detailWord,
            private_reply: `Thank you for the ${unrelatedWord} focused note!`,
            public_reply: `We appreciate your ${unrelatedWord} comment. Thank you!`,
        });
        await assert.rejects(
            api.AI.analyzeReview({ ...review, text: `The ${detailWord} is lovely.` }),
            /dayanak ayrıntısı özel cevapta kullanılmadı/i,
        );
    }

    for (const [sourceWord, replyWord] of [
        ['delivery', 'delivered'],
        ['arrival', 'arrived'],
        ['comfort', 'comfortable'],
        ['smell', 'scent'],
        ['packaged', 'packaging'],
    ]) {
        api.AI.run = async () => ({
            ...validResult,
            grounding_detail: sourceWord,
            private_reply: `Thank you; we are delighted it was ${replyWord} just as hoped!`,
            public_reply: `We are so glad it felt ${replyWord}. Thank you!`,
        });
        const derivative = await api.AI.analyzeReview({ ...review, text: `The ${sourceWord} was wonderful.` });
        assert.match(derivative.private_reply, new RegExp(replyWord, 'i'));
    }

    api.AI.run = async () => ({
        ...validResult,
        grounding_detail: 'got here quickly',
        private_reply: 'Thank you; we are glad the delivery was quick!',
        public_reply: 'We are happy the delivery was quick. Thank you!',
    });
    const naturalDeliveryParaphrase = await api.AI.analyzeReview({ ...review, text: 'It got here quickly.' });
    assert.match(naturalDeliveryParaphrase.public_reply, /delivery was quick/i);

    api.AI.run = async () => ({
        ...validResult,
        grounding_detail: 'smells amazing',
        private_reply: 'Thank you! We are delighted that you loved the scent.',
        public_reply: 'We are so glad you loved the scent. Thank you!',
    });
    const naturalScentParaphrase = await api.AI.analyzeReview({ ...review, text: 'It smells amazing.' });
    assert.match(naturalScentParaphrase.public_reply, /loved the scent/i);

    api.AI.run = async () => ({
        ...validResult,
        grounding_detail: 'stitching',
        private_reply: 'Thank you! We are delighted you loved the stitching.',
        public_reply: 'We are so glad the stitching made you happy. Thank you!',
    });
    await assert.rejects(
        api.AI.analyzeReview({ ...review, text: 'The stitching is beautiful, but it arrived broken.' }),
        /riskli yorum ayrıntısı dayanakta ele alınmadı/i,
    );

    api.AI.run = async () => ({
        ...validResult,
        grounding_detail: 'arrived broken',
        private_reply: 'We are delighted that it arrived broken. Thank you!',
        public_reply: 'So happy it was broken when it arrived. Thank you for the review!',
    });
    await assert.rejects(
        api.AI.analyzeReview({ ...review, text: 'The stitching is beautiful, but it arrived broken.' }),
        /riskli yorum için özel cevapta empatik kabul eksik/i,
    );

    api.AI.run = async () => ({
        ...validResult,
        grounding_detail: 'arrived broken',
        private_reply: 'We are delighted it arrived broken; thank you for sharing this with us.',
        public_reply: 'We are happy it was broken. Thank you for bringing this to our attention.',
    });
    await assert.rejects(
        api.AI.analyzeReview({ ...review, text: 'The stitching is beautiful, but it arrived broken.' }),
        /uygunsuz neşeli ton/i,
    );
});

test('a five-star review with broken-item language escalates risk instead of forcing a cheerful response', async () => {
    const { api } = await loadAssistant();
    api.AI.run = async () => ({
        detected_language: 'en',
        sentiment: 'positive',
        risk_level: 'low',
        response_strategy: 'warm_thanks',
        grounding_detail: 'arrived broken',
        topics: ['quality'],
        summary_tr: 'Müşteri ürünün kırık geldiğini bildiriyor.',
        private_reply: 'I am sorry the item arrived broken. Thank you for letting us know.',
        public_reply: 'Thank you for letting us know, and we are sorry it arrived broken.',
        needs_human_review: false,
    });

    const result = await api.AI.analyzeReview({
        customerName: 'Morgan',
        rating: 5,
        text: 'The item arrived broken and it was terrible. I need a refund.',
        itemTitle: 'Ceramic Mug',
    });

    assert.equal(result.sentiment, 'negative');
    assert.equal(result.risk_level, 'high');
    assert.equal(result.response_strategy, 'service_recovery');
    assert.equal(result.needs_human_review, true);

    api.AI.run = async () => ({
        detected_language: 'en',
        sentiment: 'positive',
        risk_level: 'low',
        response_strategy: 'balanced_thanks',
        grounding_detail: 'stitching',
        topics: ['kalite'],
        summary_tr: 'Müşteri dikişleri beğeniyor.',
        private_reply: 'Thank you for your kind words about the stitching!',
        public_reply: 'We are so glad you loved the stitching. Thank you!',
        needs_human_review: false,
    });
    const notBad = await api.AI.analyzeReview({
        customerName: 'Taylor',
        rating: 4,
        text: 'Not bad at all — I love the stitching.',
        itemTitle: 'Linen Shirt',
    });
    assert.equal(notBad.sentiment, 'positive');
    assert.equal(notBad.risk_level, 'low');
    assert.equal(notBad.response_strategy, 'balanced_thanks');
    assert.equal(notBad.needs_human_review, false);

    api.AI.run = async () => ({
        detected_language: 'en',
        sentiment: 'positive',
        risk_level: 'low',
        response_strategy: 'warm_thanks',
        grounding_detail: 'color is lovely',
        topics: ['renk'],
        summary_tr: 'Müşteri ürünün sağlam ve renginin güzel olduğunu söylüyor.',
        private_reply: 'Thank you! We are delighted that you found the color lovely.',
        public_reply: 'We are so glad you found the color lovely. Thank you for sharing!',
        needs_human_review: false,
    });
    const negatedIssues = await api.AI.analyzeReview({
        customerName: 'Jordan',
        rating: 5,
        text: 'It was not damaged at all, I never needed a refund, and the color is lovely.',
        itemTitle: 'Wall Art',
    });
    assert.equal(negatedIssues.sentiment, 'positive');
    assert.equal(negatedIssues.risk_level, 'low');
    assert.equal(negatedIssues.response_strategy, 'warm_thanks');
    assert.equal(negatedIssues.needs_human_review, false);

    api.AI.run = async () => ({
        detected_language: 'en',
        sentiment: 'positive',
        risk_level: 'low',
        response_strategy: 'warm_thanks',
        grounding_detail: 'return to buy another one',
        topics: ['yeniden alışveriş'],
        summary_tr: 'Müşteri yeniden alışveriş yapmak istiyor.',
        private_reply: 'Thank you! We are delighted that you plan to return to buy another one.',
        public_reply: 'We would love to welcome you back when you return to buy another one. Thank you!',
        needs_human_review: false,
    });
    const repeatCustomer = await api.AI.analyzeReview({
        customerName: 'Casey',
        rating: 5,
        text: 'I will definitely return to buy another one.',
        itemTitle: 'Art Print',
    });
    assert.equal(repeatCustomer.risk_level, 'low');
    assert.equal(repeatCustomer.response_strategy, 'warm_thanks');
    assert.equal(repeatCustomer.needs_human_review, false);

    for (const returnText of [
        'I need to return to order the right size.',
        'I would like to return for another size.',
    ]) {
        api.AI.run = async () => ({
            detected_language: 'en',
            sentiment: 'negative',
            risk_level: 'high',
            response_strategy: 'service_recovery',
            grounding_detail: returnText.slice(2, -1),
            topics: ['iade'],
            summary_tr: 'Müşteri ürünü iade etmek istiyor.',
            private_reply: 'We are sorry this did not work out and understand that you need to return it.',
            public_reply: 'We are sorry it was not the right fit and understand the return concern.',
            needs_human_review: true,
        });
        const actualReturn = await api.AI.analyzeReview({
            customerName: 'Jamie', rating: 5, text: returnText, itemTitle: 'Sweater',
        });
        assert.equal(actualReturn.risk_level, 'high');
        assert.equal(actualReturn.response_strategy, 'service_recovery');
        assert.equal(actualReturn.needs_human_review, true);
    }

    for (const benignRefundText of [
        "I don't think I will need a refund; the color is lovely.",
        'Refund? No, I love it. The color is lovely.',
        'Lately I have loved it; the color is lovely.',
    ]) {
        api.AI.run = async () => ({
            detected_language: 'en',
            sentiment: 'positive',
            risk_level: 'low',
            response_strategy: 'warm_thanks',
            grounding_detail: 'color is lovely',
            topics: ['renk'],
            summary_tr: 'Müşteri rengi beğeniyor.',
            private_reply: 'Thank you! We are delighted that the color is lovely.',
            public_reply: 'We are so glad you found the color lovely. Thank you!',
            needs_human_review: false,
        });
        const benignRefund = await api.AI.analyzeReview({
            customerName: 'Quinn', rating: 5, text: benignRefundText, itemTitle: 'Scarf',
        });
        assert.equal(benignRefund.risk_level, 'low');
        assert.equal(benignRefund.needs_human_review, false);
    }

    api.AI.run = async () => ({
        detected_language: 'en',
        sentiment: 'positive',
        risk_level: 'low',
        response_strategy: 'warm_thanks',
        grounding_detail: 'arrived perfectly',
        topics: ['teslimat'],
        summary_tr: 'Müşteri ürünün sorunsuz ulaştığını söylüyor.',
        private_reply: 'Thank you! We are so glad everything arrived perfectly.',
        public_reply: 'We are delighted it arrived perfectly. Thank you for sharing!',
        needs_human_review: false,
    });
    const nothingBroken = await api.AI.analyzeReview({
        customerName: 'Riley',
        rating: 5,
        text: 'Nothing was broken; it arrived perfectly.',
        itemTitle: 'Glass Ornament',
    });
    assert.equal(nothingBroken.risk_level, 'low');
    assert.equal(nothingBroken.needs_human_review, false);

    api.AI.run = async () => ({
        detected_language: 'en',
        sentiment: 'positive',
        risk_level: 'low',
        response_strategy: 'warm_thanks',
        grounding_detail: 'color is lovely',
        topics: ['renk'],
        summary_tr: 'Müşteri yanlış alarmdan sonra rengi beğendiğini söylüyor.',
        private_reply: 'Thank you! We are happy that you found the color lovely.',
        public_reply: 'We are so glad the color is lovely. Thank you for sharing!',
        needs_human_review: false,
    });
    const correctedBrokenStatement = await api.AI.analyzeReview({
        customerName: 'Avery',
        rating: 5,
        text: "I thought it was broken, but it wasn't; the color is lovely.",
        itemTitle: 'Wooden Box',
    });
    assert.equal(correctedBrokenStatement.risk_level, 'low');
    assert.equal(correctedBrokenStatement.needs_human_review, false);

    for (const [reviewText, groundingDetail, issueWord] of [
        ['The candle caused a fire and burned my hand.', 'caused a fire', 'fire'],
        ['This gave my baby a rash.', 'gave my baby a rash', 'rash'],
        ['The seller threatened me.', 'seller threatened me', 'threatened'],
        ['The item appears counterfeit.', 'appears counterfeit', 'counterfeit'],
    ]) {
        api.AI.run = async () => ({
            detected_language: 'en',
            sentiment: 'negative',
            risk_level: 'low',
            response_strategy: 'warm_thanks',
            grounding_detail: groundingDetail,
            topics: ['risk'],
            summary_tr: 'Müşteri ciddi ve insan incelemesi gerektiren bir sorun bildiriyor.',
            private_reply: `We are very sorry about the ${issueWord} concern and appreciate you telling us.`,
            public_reply: `We are sorry about the ${issueWord} concern. Thank you for bringing it to our attention.`,
            needs_human_review: false,
        });
        const seriousRisk = await api.AI.analyzeReview({
            customerName: 'Parker', rating: 5, text: reviewText, itemTitle: 'Handmade Item',
        });
        assert.equal(seriousRisk.risk_level, 'high');
        assert.equal(seriousRisk.response_strategy, 'service_recovery');
        assert.equal(seriousRisk.needs_human_review, true);
    }

    api.AI.run = async () => ({
        detected_language: 'en',
        sentiment: 'positive',
        risk_level: 'low',
        response_strategy: 'balanced_thanks',
        grounding_detail: 'delivery was late',
        topics: ['teslimat'],
        summary_tr: 'Müşteri teslimatın geciktiğini ancak dikişi beğendiğini söylüyor.',
        private_reply: 'We are sorry the delivery was late, and we appreciate your patience.',
        public_reply: 'We are sorry the delivery was late. Thank you for your patience.',
        needs_human_review: false,
    });
    const delayedFourStar = await api.AI.analyzeReview({
        customerName: 'Drew', rating: 4,
        text: 'The stitching is beautiful, though the delivery was late.', itemTitle: 'Linen Top',
    });
    assert.equal(delayedFourStar.risk_level, 'medium');
    assert.equal(delayedFourStar.response_strategy, 'service_recovery');
    assert.equal(delayedFourStar.needs_human_review, true);
});

test('review scanning parses Turkish "5 üzerinden 4" labels and retains a textless five-star review', async () => {
    const { api, sandbox } = await loadAssistant();
    const makeCard = ({ id, eventText, customerName, itemTitle, ratingLabel, text }) => {
        const reviewLink = { href: `https://www.etsy.com/reviews/${id}` };
        const customer = { textContent: customerName };
        const item = { textContent: itemTitle };
        const rating = {
            textContent: '',
            getAttribute(name) { return name === 'aria-label' ? ratingLabel : null; },
        };
        const reviewText = text ? { textContent: text } : null;
        return {
            textContent: eventText,
            querySelector(selector) {
                if (selector === 'a[href*="/reviews/"]') return reviewLink;
                if (selector === 'h4 a[href*="/people/"]' || selector === 'h4 a') return customer;
                if (selector === 'p.wt-mb-xs-2.wt-text-body-small') return item;
                if (selector === '[aria-label^="Rating:" i]') return /^Rating:/i.test(ratingLabel) ? rating : null;
                if (selector === '[aria-label*=" out of 5" i]') return / out of 5/i.test(ratingLabel) ? rating : null;
                if (selector === '[aria-label*=" üzerinden " i]') return / üzerinden /i.test(ratingLabel) ? rating : null;
                if (selector === '[aria-label*="yıldız" i]') return /yıldız/i.test(ratingLabel) ? rating : null;
                if (selector === '[data-rating]') return null;
                if (selector === '.wt-p-xs-2.wt-b-xs p.wt-mt-xs-1, .wt-p-xs-2.wt-b-xs .wt-text-body-small') return reviewText;
                if (selector === '[data-review-text], blockquote') return reviewText;
                if (selector === 'img') return null;
                return null;
            },
            querySelectorAll(selector) {
                if (selector === '[aria-label], [data-rating]') return [rating];
                return [];
            },
        };
    };
    const cards = [
        makeCard({
            id: '400001',
            eventText: 'Ayşe yorumunu bıraktı',
            customerName: 'Ayşe',
            itemTitle: 'Keten Gömlek',
            ratingLabel: '5 üzerinden 4',
            text: 'Dikişleri çok güzel.',
        }),
        makeCard({
            id: '500001',
            eventText: 'Morgan left a review',
            customerName: 'Morgan',
            itemTitle: 'Ceramic Mug',
            ratingLabel: 'Rating: 5 out of 5',
            text: '',
        }),
        makeCard({
            id: '400002',
            eventText: 'Robin left a review',
            customerName: 'Robin',
            itemTitle: 'Wooden Tray',
            ratingLabel: '4 out of 5',
            text: '',
        }),
        makeCard({
            id: 'counter-only',
            eventText: 'Alex left a review',
            customerName: 'Alex',
            itemTitle: 'Photo Frame',
            ratingLabel: '2',
            text: '',
        }),
    ];
    sandbox.document.querySelectorAll = selector => selector === '.dashboard-activity-item' ? cards : [];

    assert.equal(api.ReviewsAdapter.ratingFromText('5 üzerinden 4'), 4);
    const reviews = api.ReviewsAdapter.scan();
    assert.equal(reviews.length, 3);
    assert.equal(reviews[0].rating, 4);
    assert.equal(reviews[0].text, 'Dikişleri çok güzel.');
    assert.equal(reviews[1].rating, 5);
    assert.equal(reviews[1].text, '');
    assert.equal(reviews[2].rating, 4);
    assert.equal(reviews[2].text, '');
    assert.equal(api.ReviewsAdapter.ratingFromCard(cards[3]), null, 'an unrelated bare ARIA counter must not become a review rating');
});

test('changing only a review rating invalidates its old work binding and analysis', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/your/shops/me/dashboard/activity';
    sandbox.location.href = 'https://www.etsy.com/your/shops/me/dashboard/activity';
    const original = {
        id: 'review-rating-change',
        customerName: 'Ashley',
        itemTitle: 'Custom Shirt',
        rating: 5,
        text: 'Beautiful stitching.',
    };
    api.UI.state.reviews = [original];
    api.UI.state.selectedReviewId = original.id;
    const binding = api.UI.beginReviewWork(original);
    api.UI.state.reviewAnalysisBinding = binding;
    api.UI.state.reviewAnalysis = {
        summary_tr: 'Old five-star analysis',
        private_reply: 'Old private five-star reply',
        public_reply: 'Old public five-star reply',
    };
    assert.equal(api.UI.reviewAnalysisIsCurrent(original), true);

    const changed = { ...original, rating: 4 };
    api.UI.state.reviews = [changed];
    assert.equal(api.UI.reviewWorkIsCurrent(binding), false);
    assert.equal(api.UI.reviewAnalysisIsCurrent(changed), false);
    await assert.rejects(api.UI.copySource('review-private'), /Yorum veya puan değişti|Eski cevap kopyalanmadı/i);

    api.UI.state.reviews = [original];
    api.ReviewsAdapter.scan = () => [changed];
    api.UI.refreshReviews();
    assert.equal(api.UI.state.selectedReviewId, original.id);
    assert.equal(api.UI.state.reviews[0].rating, 4);
    assert.equal(api.UI.state.reviewAnalysis, null);
    assert.equal(api.UI.state.reviewAnalysisBinding, null);
});

test('public review insertion re-reads the live card and rejects a rating change before opening Etsy reply UI', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/your/shops/me/dashboard/activity';
    sandbox.location.href = 'https://www.etsy.com/your/shops/me/dashboard/activity';
    let ratingLabel = 'Rating: 5 out of 5';
    let clickCount = 0;
    const ratingNode = {
        textContent: '',
        getAttribute(name) { return name === 'aria-label' ? ratingLabel : null; },
    };
    const publicButton = {
        textContent: 'Public response',
        getAttribute: () => '',
        click() { clickCount += 1; },
    };
    const card = {
        isConnected: true,
        textContent: 'Ashley left a review',
        contains: () => false,
        querySelector(selector) {
            if (selector === 'a[href*="/reviews/"]') return { href: 'https://www.etsy.com/reviews/987654' };
            if (selector === 'h4 a[href*="/people/"]' || selector === 'h4 a') return { textContent: 'Ashley' };
            if (selector === 'p.wt-mb-xs-2.wt-text-body-small') return { textContent: 'Custom Shirt' };
            if (selector === '[aria-label^="Rating:" i]' || selector === '[aria-label*="star" i]') return ratingNode;
            if (selector === '.wt-p-xs-2.wt-b-xs p.wt-mt-xs-1, .wt-p-xs-2.wt-b-xs .wt-text-body-small') return { textContent: 'Beautiful stitching.' };
            if (selector === 'img' || selector === '[data-rating]') return null;
            return null;
        },
        querySelectorAll(selector) {
            if (selector === '[aria-label], [data-rating]') return [ratingNode];
            if (selector === 'button') return [publicButton];
            if (selector === 'textarea') return [];
            return [];
        },
    };
    const review = api.ReviewsAdapter.fromCard(card, 0);
    api.UI.state.reviews = [review];
    api.UI.state.selectedReviewId = review.id;
    api.UI.state.reviewAnalysisBinding = api.UI.beginReviewWork(review);
    api.UI.state.reviewAnalysis = { public_reply: 'Thank you for the beautiful stitching!' };

    ratingLabel = 'Rating: 4 out of 5';
    await assert.rejects(api.UI.insertReviewPublic(), /Yorum veya sayfa değişti|güncel yorum/i);
    assert.equal(clickCount, 0);
});

test('positive review UI uses thank-you labels for both four-star text and textless five-star feedback', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/your/shops/me/dashboard/activity';
    sandbox.location.href = 'https://www.etsy.com/your/shops/me/dashboard/activity';

    for (const review of [
        {
            id: 'review-positive-four', customerName: 'Ashley', itemTitle: 'Custom Shirt',
            rating: 4, text: 'Beautiful stitching.', publicButton: {},
        },
        {
            id: 'review-positive-five', customerName: 'Morgan', itemTitle: 'Ceramic Mug',
            rating: 5, text: '', publicButton: null,
        },
    ]) {
        api.UI.state.reviews = [review];
        api.UI.state.selectedReviewId = review.id;
        api.UI.state.reviewAnalysis = null;
        api.UI.state.reviewAnalysisBinding = null;
        const markup = api.UI.renderReviews();
        assert.match(markup, /AI ile Sevimli Teşekkür Hazırla/);
        assert.match(markup, /Müşteriye Gönderilecek Teşekkür Mesajı/);
        assert.match(markup, /data-copy-source="review-private"[^>]*>.*Mesajı Kopyala/s);
        assert.match(markup, /AI, yorumu ve yıldız puanını birlikte değerlendirir/);
    }

    const textless = api.UI.state.reviews[0];
    assert.equal(textless.rating, 5);
    const textlessMarkup = api.UI.renderReviews();
    assert.match(textlessMarkup, /Yalnızca yıldız puanı bırakıldı\./);
    assert.match(textlessMarkup, /Teşekkür/);
    assert.match(textlessMarkup, /data-action="review-translate" disabled/);
    assert.match(textlessMarkup, /public cevap alanı güvenle doğrulanamadı/);

    const riskyHighRating = {
        id: 'review-risky-five', customerName: 'Riley', itemTitle: 'Ceramic Mug',
        rating: 5, text: 'It arrived broken and I need a refund.', publicButton: {},
    };
    api.UI.state.reviews = [riskyHighRating];
    api.UI.state.selectedReviewId = riskyHighRating.id;
    const riskyMarkup = api.UI.renderReviews();
    assert.doesNotMatch(riskyMarkup, /Sevimli Teşekkür/);
    assert.match(riskyMarkup, /AI Analiz ve Çözüm Taslağı Hazırla/);
    assert.match(riskyMarkup, /Müşteriye Gönderilecek Çözüm Mesajı/);
});

test('busy state exposes status and aria-busy while leaving the header close control interactive', async () => {
    const { api } = await loadAssistant();
    const classes = new Set();
    const attributes = new Map();
    api.UI.app = {
        classList: {
            toggle(name, enabled) {
                if (enabled) classes.add(name);
                else classes.delete(name);
            },
        },
        setAttribute(name, value) { attributes.set(name, value); },
    };

    api.UI.setBusy(true);
    assert.equal(api.UI.state.busy, true);
    assert.equal(classes.has('ma-busy'), true);
    assert.equal(attributes.get('aria-busy'), 'true');

    const source = readUserscriptSource();
    const busyCss = readTemplateConstant('UX_CSS');
    assert.match(source, /class="ma-busy-status" role="status" aria-live="polite">İşlem sürüyor…/);
    assert.match(source, /data-action="close-app"/);
    assert.match(busyCss, /\.ma-busy\{pointer-events:auto;opacity:1\}/);
    assert.match(busyCss, /\.ma-busy \.ma-nav,\.ma-busy \.ma-view\{pointer-events:none\}/);
    assert.match(busyCss, /\.ma-busy \.ma-busy-status\{display:flex\}/);
    assert.doesNotMatch(busyCss, /\.ma-busy \.ma-header[^}]*pointer-events:none/);

    api.UI.setBusy(false);
    assert.equal(api.UI.state.busy, false);
    assert.equal(classes.has('ma-busy'), false);
    assert.equal(attributes.get('aria-busy'), 'false');
});

test('closed launcher keeps its compact 120 by 36 desktop footprint', () => {
    const launcherCss = readTemplateConstant('LAUNCHER_CSS');
    const desktopRule = launcherCss.match(/^\.ma-launcher\{([^}]*)\}/)?.[1] || '';
    assert.match(desktopRule, /(?:^|;)width:120px(?:;|$)/);
    assert.match(desktopRule, /(?:^|;)height:36px(?:;|$)/);
    assert.doesNotMatch(desktopRule, /width:176px|height:44px/);
});

test('pending-verification order badges use a localized warning label and style', async () => {
    const { api } = await loadAssistant();
    const badge = { dataset: {}, textContent: '' };
    const row = { querySelector: selector => selector === '.mema-order-badge' ? badge : null };

    api.OrdersAdapter.decorate([{
        row,
        status: { status: 'sent_pending_verification' },
    }]);

    assert.equal(badge.textContent, 'Gönderim doğrulanıyor');
    assert.equal(badge.dataset.status, 'sent_pending_verification');
    const css = readTemplateConstant('GLOBAL_CSS');
    assert.match(css, /\.mema-order-badge\[data-status="sent_pending_verification"\]\{[^}]+\}/);
});

test('history rows expose keyboard semantics and activate with Enter or Space', async () => {
    const { api } = await loadAssistant();
    api.Store.history = [{
        id: 'evt-history-1',
        createdAt: '2026-08-27T12:00:00.000Z',
        type: 'reply_generated',
        source: 'messages',
        status: 'completed',
        method: 'manual',
        customer: 'Ashley',
        title: 'Cevap taslağı hazırlandı',
        detail: {},
    }];

    const markup = api.UI.renderHistory();
    assert.match(markup, /data-history-id="evt-history-1" tabindex="0" role="button"/);
    assert.match(markup, /aria-label="Ashley: Cevap taslağı hazırlandı"/);

    const handlers = new Map();
    api.UI.shadow = {
        addEventListener(type, handler) { handlers.set(type, handler); },
    };
    api.UI.bind();
    let clickCount = 0;
    let preventCount = 0;
    const row = {
        dataset: { historyId: 'evt-history-1' },
        click() { clickCount += 1; },
    };
    const target = { closest: () => row };
    for (const key of ['Enter', ' ']) {
        handlers.get('keydown')({
            key,
            target,
            preventDefault() { preventCount += 1; },
        });
    }
    assert.equal(clickCount, 2);
    assert.equal(preventCount, 2);
});

test('public review reply writes only to the newly opened selected-review surface', async () => {
    const { api, sandbox } = await loadAssistant();
    const makeTextarea = () => Object.assign(new sandbox.HTMLTextAreaElement(), {
        offsetParent: {},
        value: '',
        dispatchEvent() {},
        focus() { this.focused = true; },
    });
    const existingTextarea = makeTextarea();
    const unrelatedNewTextarea = makeTextarea();
    const targetTextarea = makeTextarea();
    let textareas = [existingTextarea];
    let dialogs = [];
    const dialog = {
        offsetParent: {},
        contains: element => element === targetTextarea,
        querySelectorAll: selector => selector === 'textarea' ? [targetTextarea] : [],
    };
    targetTextarea.closest = selector => selector.includes('[role="dialog"]') ? dialog : null;
    unrelatedNewTextarea.closest = () => null;
    existingTextarea.closest = () => null;
    const card = {
        contains: () => false,
        querySelectorAll: selector => selector === 'textarea' ? [] : [],
    };
    const publicButton = {
        getAttribute: () => '',
        click() {
            textareas = [existingTextarea, unrelatedNewTextarea, targetTextarea];
            dialogs = [dialog];
        },
    };
    sandbox.document.querySelectorAll = selector => {
        if (selector === 'textarea') return textareas;
        if (selector.includes('[role="dialog"]')) return dialogs;
        return [];
    };
    sandbox.document.getElementById = () => null;

    assert.equal(await api.ReviewsAdapter.insertPublic({ card, publicButton }, 'Safe public reply'), true);
    assert.equal(targetTextarea.value, 'Safe public reply');
    assert.equal(targetTextarea.focused, true);
    assert.equal(existingTextarea.value, '');
    assert.equal(unrelatedNewTextarea.value, '');
});

test('public review reply fails closed when the selected-review surface exposes multiple textareas', async () => {
    const { api, sandbox } = await loadAssistant();
    const makeTextarea = () => Object.assign(new sandbox.HTMLTextAreaElement(), {
        offsetParent: {}, value: '', dispatchEvent() {}, focus() {},
    });
    const first = makeTextarea();
    const second = makeTextarea();
    const dialog = {
        offsetParent: {},
        contains: element => element === first || element === second,
        querySelectorAll: selector => selector === 'textarea' ? [first, second] : [],
    };
    first.closest = second.closest = selector => selector.includes('[role="dialog"]') ? dialog : null;
    let opened = false;
    sandbox.document.querySelectorAll = selector => {
        if (selector === 'textarea') return opened ? [first, second] : [];
        if (selector.includes('[role="dialog"]')) return opened ? [dialog] : [];
        return [];
    };
    sandbox.document.getElementById = () => null;
    const review = {
        card: { contains: () => false, querySelectorAll: () => [] },
        publicButton: { getAttribute: () => '', click: () => { opened = true; } },
    };

    await assert.rejects(api.ReviewsAdapter.insertPublic(review, 'Must not be inserted'), /belirsiz|birden fazla|güvenli/i);
    assert.equal(first.value, '');
    assert.equal(second.value, '');
});

test('public review reply preserves a different occupied Etsy draft', async () => {
    const { api, sandbox } = await loadAssistant();
    const target = Object.assign(new sandbox.HTMLTextAreaElement(), {
        offsetParent: {},
        value: 'My unsent manual public-response draft',
        dispatchEvent() {},
        focus() {},
    });
    const dialog = {
        offsetParent: {},
        contains: element => element === target,
        querySelectorAll: selector => selector === 'textarea' ? [target] : [],
    };
    target.closest = selector => selector.includes('[role="dialog"]') ? dialog : null;
    let opened = false;
    sandbox.document.querySelectorAll = selector => {
        if (selector === 'textarea') return opened ? [target] : [];
        if (selector.includes('[role="dialog"]')) return opened ? [dialog] : [];
        return [];
    };
    sandbox.document.getElementById = () => null;
    const review = {
        card: { contains: () => false, querySelectorAll: () => [], isConnected: true },
        publicButton: { getAttribute: () => '', click: () => { opened = true; } },
    };

    await assert.rejects(
        api.ReviewsAdapter.insertPublic(review, 'Generated public response'),
        /farklı.*taslak|mevcut metni korumak|üzerine yazılmadı/i,
    );
    assert.equal(target.value, 'My unsent manual public-response draft');
});

test('public review insertion revalidates its review binding before DOM and persistence side effects', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/your/shops/me/dashboard/activity';
    sandbox.location.href = 'https://www.etsy.com/your/shops/me/dashboard/activity';
    const target = Object.assign(new sandbox.HTMLTextAreaElement(), {
        offsetParent: {}, value: '', dispatchEvent() {}, focus() {},
    });
    const dialog = {
        offsetParent: {},
        contains: element => element === target,
        querySelectorAll: selector => selector === 'textarea' ? [target] : [],
    };
    target.closest = selector => selector.includes('[role="dialog"]') ? dialog : null;
    let opened = false;
    sandbox.document.querySelectorAll = selector => {
        if (selector === 'textarea') return opened ? [target] : [];
        if (selector.includes('[role="dialog"]')) return opened ? [dialog] : [];
        return [];
    };
    sandbox.document.getElementById = () => null;
    const review = {
        id: 'review-a', text: 'Original review', customerName: 'Ashley',
        card: { contains: () => false, querySelectorAll: () => [], isConnected: true },
        publicButton: {
            getAttribute: () => '',
            click() {
                opened = true;
                sandbox.location.pathname = '/your/shops/me/dashboard/activity/other';
                sandbox.location.href = 'https://www.etsy.com/your/shops/me/dashboard/activity/other';
            },
        },
    };
    api.UI.state.reviews = [review];
    api.UI.state.selectedReviewId = review.id;
    const binding = api.UI.beginReviewWork(review);
    api.UI.state.reviewAnalysis = { public_reply: 'Generated public response' };
    api.UI.state.reviewAnalysisBinding = binding;

    const originals = {
        setBusy: api.UI.setBusy,
        setStatus: api.Store.setStatus,
        addHistory: api.Store.addHistory,
    };
    const calls = { setStatus: 0, addHistory: 0 };
    api.UI.setBusy = () => {};
    api.Store.setStatus = async () => { calls.setStatus += 1; };
    api.Store.addHistory = async () => { calls.addHistory += 1; };
    try {
        await assert.rejects(api.UI.insertReviewPublic(), /Yorum|sayfa|değişti/i);
        assert.equal(target.value, '');
        assert.deepEqual(calls, { setStatus: 0, addHistory: 0 });
    } finally {
        api.UI.setBusy = originals.setBusy;
        api.Store.setStatus = originals.setStatus;
        api.Store.addHistory = originals.addHistory;
    }
});

test('history writes from concurrent tabs merge and idempotent events remain unique', async () => {
    const shared = {
        storage: new Map(),
        lockTails: new Map(),
        valueListeners: new Map(),
        requestedLocks: [],
    };
    const [firstTab, secondTab] = await Promise.all([
        loadAssistant(shared),
        loadAssistant(shared),
    ]);
    await Promise.all([
        firstTab.api.Store.ensureCoordinationListeners(),
        secondTab.api.Store.ensureCoordinationListeners(),
    ]);

    await Promise.all([
        firstTab.api.Store.addHistory({ type: 'first_tab_event' }),
        secondTab.api.Store.addHistory({ type: 'second_tab_event' }),
    ]);

    const historyKey = firstTab.api.KEYS.history;
    assert.deepEqual(
        new Set(shared.storage.get(historyKey).map(item => item.type)),
        new Set(['first_tab_event', 'second_tab_event']),
    );
    assert.equal(firstTab.api.Store.history.length, 2);
    assert.equal(secondTab.api.Store.history.length, 2);

    const [firstResult, secondResult] = await Promise.all([
        firstTab.api.Store.addHistoryOnce({ type: 'once_event' }, 'shared-once-key'),
        secondTab.api.Store.addHistoryOnce({ type: 'once_event' }, 'shared-once-key'),
    ]);

    const finalHistory = shared.storage.get(historyKey);
    assert.equal(finalHistory.filter(item => item.idempotencyKey === 'shared-once-key').length, 1);
    assert.equal(firstResult.id, secondResult.id);
    assert.equal(firstTab.api.Store.history.length, 3);
    assert.equal(secondTab.api.Store.history.length, 3);
    assert.ok(shared.requestedLocks.includes('mema:history-coordination:v1'));
    assert.equal(shared.requestedLocks.includes('mema:campaign-status-coordination:v1'), false);
});

test('history keeps its same-tab write chain fallback when Web Locks are unavailable', async () => {
    const { api, sandbox, storage } = await loadAssistant();
    delete sandbox.navigator.locks;

    await Promise.all([
        api.Store.addHistory({ type: 'fallback_first' }),
        api.Store.addHistory({ type: 'fallback_second' }),
    ]);

    assert.deepEqual(
        new Set(storage.get(api.KEYS.history).map(item => item.type)),
        new Set(['fallback_first', 'fallback_second']),
    );
});

test('history pruning reads the fresh shared value and preserves a remote tab event', async () => {
    const shared = {
        storage: new Map(),
        lockTails: new Map(),
        valueListeners: new Map(),
        requestedLocks: [],
    };
    const [staleTab, remoteTab] = await Promise.all([
        loadAssistant(shared),
        loadAssistant(shared),
    ]);
    const historyKey = staleTab.api.KEYS.history;
    const expired = { id: 'expired-event', type: 'expired', createdAt: '2020-01-01T00:00:00.000Z' };
    shared.storage.set(historyKey, copy([expired]));
    staleTab.api.Store.history = copy([expired]);
    remoteTab.api.Store.history = copy([expired]);

    await remoteTab.api.Store.addHistory({ type: 'fresh_remote_event' });
    shared.requestedLocks.length = 0;
    await staleTab.api.Store.pruneHistory();

    const finalHistory = shared.storage.get(historyKey);
    assert.deepEqual(finalHistory.map(item => item.type), ['fresh_remote_event']);
    assert.deepEqual(copy(staleTab.api.Store.history), copy(finalHistory));
    assert.deepEqual(shared.requestedLocks, ['mema:history-coordination:v1']);
});

test('history clear is ordered between queued writes and uses the history coordinator', async () => {
    const requestedLocks = [];
    const { api, storage } = await loadAssistant({ requestedLocks });

    const beforeClear = api.Store.addHistory({ type: 'before_clear' });
    const clear = api.Store.clearHistory();
    const afterClear = api.Store.addHistory({ type: 'after_clear' });
    await Promise.all([beforeClear, clear, afterClear]);

    assert.deepEqual(storage.get(api.KEYS.history).map(item => item.type), ['after_clear']);
    assert.deepEqual(copy(api.Store.history), copy(storage.get(api.KEYS.history)));
    assert.deepEqual(requestedLocks, [
        'mema:history-coordination:v1',
        'mema:history-coordination:v1',
        'mema:history-coordination:v1',
    ]);
});

test('assistant stays closed by default until the user explicitly opens it', async () => {
    const { api, storage } = await loadAssistant();
    const openedPages = [];

    assert.equal(api.DEFAULT_SETTINGS.openOnMessagePage, false);
    api.Store.settings = { ...api.DEFAULT_SETTINGS, openOnMessagePage: true };
    api.Store.configMeta = { schemaVersion: 5, updatedAt: '2026-08-26T00:00:00.000Z' };
    storage.set(api.KEYS.settings, copy(api.Store.settings));
    storage.set(api.KEYS.configMeta, copy(api.Store.configMeta));
    await api.Store.migrate();
    assert.equal(api.Store.settings.openOnMessagePage, false);
    assert.equal(storage.get(api.KEYS.settings).openOnMessagePage, false);

    api.Store.load = async () => {
        api.Store.onboarding = { completed: false, completedAt: '', githubStepSeen: false };
    };
    api.Store.ensureCoordinationListeners = async () => {};
    api.Router.start = () => {};
    api.App.onRoute = async () => {};
    api.Updates.check = async () => api.Store.update;
    api.UI.mount = () => {};
    api.UI.open = (page) => {
        openedPages.push(page);
        api.UI.state.open = true;
    };
    api.UI.state.open = false;

    await api.App.init();

    assert.equal(api.UI.state.open, false);
    assert.deepEqual(openedPages, []);
});

test('canonical GitHub installs keep the in-panel update channel enabled', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.GM.info.script.downloadURL = '';
    sandbox.GM.info.script.updateURL = '';
    assert.equal(api.Updates.usesGitHubUpdateChannel(), true);
    assert.match(readUserscriptSource(), /const CENTRAL_MESSAGE_CENTER_BUILD = false;/);
});

test('SPA auto-open waits for a verified conversation and preserves utility drafts', async () => {
    const { api, sandbox } = await loadAssistant();
    const openedPages = [];
    let verifiedConversation = false;
    sandbox.location.pathname = '/messages/spa-conversation';
    sandbox.location.href = 'https://www.etsy.com/messages/spa-conversation';
    api.Store.settings = { ...api.DEFAULT_SETTINGS, openOnMessagePage: true };
    api.MessageAdapter.context = () => ({
        conversationId: verifiedConversation ? api.Router.conversationId() : '',
    });
    api.Campaign.resume = async () => false;
    api.UI.open = (page) => {
        openedPages.push(page);
        api.UI.state.open = true;
        api.UI.state.page = page;
    };
    api.UI.state.open = false;
    api.UI.state.page = 'unknown';
    api.App.routeFingerprint = '';

    await api.App.onRoute();
    assert.deepEqual(openedPages, [], 'route detection alone must not open without a verified composer scope');

    verifiedConversation = true;
    await api.App.onRoute();
    assert.deepEqual(openedPages, ['messages'], 'a later DOM hydration pass must open the verified conversation');

    const draft = { id: 'tpl-draft', name: 'Unsaved draft', text: 'Keep this draft' };
    api.UI.state.open = false;
    api.UI.state.page = 'templates';
    api.UI.state.templateDraft = draft;
    api.UI.state.templateDirty = true;
    openedPages.length = 0;
    await api.App.onRoute();
    assert.deepEqual(openedPages, ['templates']);
    assert.equal(api.UI.state.templateDraft, draft);
    assert.equal(api.UI.state.templateDirty, true);

    api.UI.state.open = false;
    api.UI.state.page = 'messages';
    openedPages.length = 0;
    sandbox.location.pathname = '/messages/inbox';
    sandbox.location.href = 'https://www.etsy.com/messages/inbox';
    api.MessageAdapter.context = () => ({ conversationId: 'not-a-real-open-conversation' });
    api.App.routeFingerprint = '';
    await api.App.onRoute();
    assert.deepEqual(openedPages, [], 'message list routes must remain fail-closed');

    sandbox.location.pathname = '/messages/disabled-conversation';
    sandbox.location.href = 'https://www.etsy.com/messages/disabled-conversation';
    api.MessageAdapter.context = () => ({ conversationId: api.Router.conversationId() });
    api.Store.settings.openOnMessagePage = false;
    api.App.routeFingerprint = '';
    await api.App.onRoute();
    assert.deepEqual(openedPages, [], 'the explicit setting must remain authoritative');
});

test('settings edits remain drafts until Save and provider tests do not silently persist them', async () => {
    const { api, storage } = await loadAssistant();
    const dirty = { hidden: true };
    api.UI.shadow = {
        querySelector: selector => selector === '[data-settings-dirty]' ? dirty : null,
        querySelectorAll: () => [],
    };
    api.UI.ensureSettingsDraft({ reset: true });

    api.UI.onInput({ target: {
        dataset: { settingsField: 'autoSendCampaign' },
        type: 'checkbox',
        checked: true,
    } });
    api.UI.onInput({ target: {
        dataset: { providerField: 'apiKey' },
        type: 'password',
        value: 'draft-provider-key',
    } });

    assert.equal(api.Store.settings.autoSendCampaign, false);
    assert.equal(api.Store.providers.openai.apiKey, '');
    assert.equal(api.UI.state.settingsDraft.autoSendCampaign, true);
    assert.equal(api.UI.state.providersDraft.openai.apiKey, 'draft-provider-key');
    assert.equal(api.UI.state.settingsDirty, true);
    assert.equal(dirty.hidden, false);

    api.UI.toast = () => {};
    await api.UI.saveSettings();
    assert.equal(api.Store.settings.autoSendCampaign, true);
    assert.equal(api.Store.providers.openai.apiKey, 'draft-provider-key');
    assert.equal(storage.get(api.KEYS.settings).autoSendCampaign, true);
    assert.equal(storage.get(api.KEYS.providers).openai.apiKey, 'draft-provider-key');
    assert.equal(api.UI.state.settingsDirty, false);
});

test('failed settings persistence never publishes an uncommitted runtime value', async () => {
    const { api, storage } = await loadAssistant();
    const beforeRuntime = copy(api.Store.settings);
    storage.set(api.KEYS.settings, copy(beforeRuntime));
    const beforeStored = copy(storage.get(api.KEYS.settings));
    const originalSet = api.GMX.set;
    api.GMX.set = async (key, value) => {
        if (key === api.KEYS.settings) throw new Error('injected settings write failure');
        return originalSet(key, value);
    };
    try {
        await assert.rejects(
            api.Store.saveSettings({ ...beforeRuntime, shopName: 'Must not become runtime state' }),
            /injected settings write failure/,
        );
    } finally {
        api.GMX.set = originalSet;
    }
    assert.deepEqual(copy(api.Store.settings), beforeRuntime);
    assert.deepEqual(storage.get(api.KEYS.settings), beforeStored);
});

test('configuration bundle rolls back prior writes when a later provider write fails', async () => {
    const { api, storage } = await loadAssistant();
    const beforeSettings = copy(api.Store.settings);
    const beforeProviders = copy(api.Store.providers);
    storage.set(api.KEYS.settings, copy(beforeSettings));
    storage.set(api.KEYS.providers, copy(beforeProviders));
    const originalSet = api.GMX.set;
    api.GMX.set = async (key, value) => {
        if (key === api.KEYS.providers) throw new Error('injected provider write failure');
        return originalSet(key, value);
    };
    try {
        await assert.rejects(api.Store.saveConfigBundle({
            settings: { ...beforeSettings, shopName: 'Partial import must roll back' },
            providers: { ...beforeProviders, openai: { ...beforeProviders.openai, apiKey: 'new-key' } },
        }), /injected provider write failure/);
    } finally {
        api.GMX.set = originalSet;
    }
    assert.deepEqual(copy(api.Store.settings), beforeSettings);
    assert.deepEqual(copy(api.Store.providers), beforeProviders);
    assert.deepEqual(storage.get(api.KEYS.settings), beforeSettings);
    assert.deepEqual(storage.get(api.KEYS.providers), beforeProviders);
});

test('a failed config bundle cannot roll back a later successful bundle', async () => {
    const requestedLocks = [];
    const { api, storage } = await loadAssistant({ requestedLocks });
    const beforeSettings = copy(api.Store.settings);
    const beforeProviders = copy(api.Store.providers);
    storage.set(api.KEYS.settings, copy(beforeSettings));
    storage.set(api.KEYS.providers, copy(beforeProviders));
    storage.set(api.KEYS.configMeta, copy(api.Store.configMeta));
    let releaseFirstProvider;
    let firstProviderReached = false;
    const firstProviderGate = new Promise(resolve => { releaseFirstProvider = resolve; });
    const originalSet = api.GMX.set;
    api.GMX.set = async (key, value) => {
        if (key === api.KEYS.providers && value?.openai?.apiKey === 'first-failing-key') {
            firstProviderReached = true;
            await firstProviderGate;
            throw new Error('injected first bundle provider failure');
        }
        return originalSet(key, value);
    };
    const firstSettings = { ...beforeSettings, shopName: 'First bundle must fail' };
    const firstProviders = { ...beforeProviders, openai: { ...beforeProviders.openai, apiKey: 'first-failing-key' } };
    const secondSettings = { ...beforeSettings, shopName: 'Second bundle survives' };
    const secondProviders = { ...beforeProviders, openai: { ...beforeProviders.openai, apiKey: 'second-success-key' } };
    try {
        const first = api.Store.saveConfigBundle({ settings: firstSettings, providers: firstProviders });
        await waitUntil(() => firstProviderReached, 'first bundle did not reach its provider write');
        const second = api.Store.saveConfigBundle({ settings: secondSettings, providers: secondProviders });
        // Without a configuration coordinator, the second writer completes here and the
        // first writer's rollback clobbers its settings. A coordinator queues it instead.
        await new Promise(resolve => setImmediate(resolve));
        releaseFirstProvider();
        await assert.rejects(first, /injected first bundle provider failure/);
        await second;
    } finally {
        api.GMX.set = originalSet;
    }
    assert.equal(api.Store.settings.shopName, 'Second bundle survives');
    assert.equal(api.Store.providers.openai.apiKey, 'second-success-key');
    assert.equal(storage.get(api.KEYS.settings).shopName, 'Second bundle survives');
    assert.equal(storage.get(api.KEYS.providers).openai.apiKey, 'second-success-key');
    assert.ok(requestedLocks.some(name => /config/i.test(name)), 'config bundle writes must use a shared configuration coordinator');
});

test('settings markup neither exposes stored secrets nor allows a provider model to inject HTML', async () => {
    const { api } = await loadAssistant();
    const providerSecret = 'provider-secret-marker';
    const agentSecret = 'agent-secret-marker';
    const deeplSecret = 'deepl-secret-marker';
    const maliciousModel = 'model"><img src=x data-settings-xss>';
    api.Store.providers = {
        ...api.Store.providers,
        openai: { ...api.Store.providers.openai, apiKey: providerSecret, model: maliciousModel },
    };
    api.Store.settings = {
        ...api.Store.settings,
        aiProvider: 'openai',
        messageCenterAgentToken: agentSecret,
        deeplApiKey: deeplSecret,
    };
    api.UI.ensureSettingsDraft({ reset: true });
    const markup = api.UI.renderSettings();

    for (const secret of [providerSecret, agentSecret, deeplSecret]) assert.doesNotMatch(markup, new RegExp(secret));
    assert.doesNotMatch(markup, /<img src=x data-settings-xss>/);
    assert.match(markup, /model&quot;&gt;&lt;img src=x data-settings-xss&gt;/);
    assert.match(markup, /data-settings-field="messageCenterAgentToken"[^>]*data-secret-preserve="true"/);
    assert.match(markup, /data-settings-field="deeplApiKey"[^>]*data-secret-preserve="true"/);
    assert.match(markup, /data-action="provider-key-clear"/);
    assert.match(markup, /data-action="agent-token-clear"/);
    assert.match(markup, /data-action="deepl-key-clear"/);
});

test('blank secret settings fields preserve the stored draft values when read back', async () => {
    const { api } = await loadAssistant();
    api.UI.ensureSettingsDraft({ reset: true });
    api.UI.state.settingsDraft.messageCenterAgentToken = 'stored-agent-token';
    api.UI.state.settingsDraft.deeplApiKey = 'stored-deepl-key';
    api.UI.shadow = {
        querySelector: () => null,
        querySelectorAll: () => [
            { dataset: { settingsField: 'messageCenterAgentToken', secretPreserve: 'true' }, type: 'password', value: '' },
            { dataset: { settingsField: 'deeplApiKey', secretPreserve: 'true' }, type: 'password', value: '' },
            { dataset: { settingsField: 'shopName' }, type: 'text', value: 'Updated public shop' },
        ],
    };
    const values = api.UI.readSettingsForm();
    assert.equal(values.messageCenterAgentToken, 'stored-agent-token');
    assert.equal(values.deeplApiKey, 'stored-deepl-key');
    assert.equal(values.shopName, 'Updated public shop');
});

test('normal settings save preserves hidden secrets and explicit clear actions persist their removal', async () => {
    const { api, storage } = await loadAssistant();
    api.Store.settings = {
        ...api.Store.settings,
        messageCenterAgentToken: 'stored-agent-token',
        deeplApiKey: 'stored-deepl-key',
    };
    api.Store.providers = {
        ...api.Store.providers,
        openai: { ...api.Store.providers.openai, apiKey: 'stored-provider-key' },
    };
    api.UI.ensureSettingsDraft({ reset: true });
    api.UI.shadow = {
        querySelector: () => null,
        querySelectorAll: () => [
            { dataset: { settingsField: 'messageCenterAgentToken', secretPreserve: 'true' }, type: 'password', value: '' },
            { dataset: { settingsField: 'deeplApiKey', secretPreserve: 'true' }, type: 'password', value: '' },
        ],
    };
    api.UI.toast = () => {};

    await api.UI.saveSettings({ notify: false });
    assert.equal(api.Store.settings.messageCenterAgentToken, 'stored-agent-token');
    assert.equal(api.Store.settings.deeplApiKey, 'stored-deepl-key');
    assert.equal(api.Store.providers.openai.apiKey, 'stored-provider-key');

    const clickAction = action => api.UI.onClick({
        target: { closest: () => ({ dataset: { action } }) },
    });
    await clickAction('provider-key-clear');
    await clickAction('agent-token-clear');
    await clickAction('deepl-key-clear');
    assert.equal(api.Store.providers.openai.apiKey, 'stored-provider-key', 'clear must remain a draft before Save');
    assert.equal(api.Store.settings.messageCenterAgentToken, 'stored-agent-token');
    assert.equal(api.Store.settings.deeplApiKey, 'stored-deepl-key');

    await api.UI.saveSettings({ notify: false });
    assert.equal(api.Store.providers.openai.apiKey, '');
    assert.equal(api.Store.settings.messageCenterAgentToken, '');
    assert.equal(api.Store.settings.deeplApiKey, '');
    assert.equal(storage.get(api.KEYS.providers).openai.apiKey, '');
    assert.equal(storage.get(api.KEYS.settings).messageCenterAgentToken, '');
    assert.equal(storage.get(api.KEYS.settings).deeplApiKey, '');
});

test('settings save preserves edits made while its asynchronous persistence is in flight', async () => {
    const { api } = await loadAssistant();
    api.UI.shadow = { querySelector: () => null, querySelectorAll: () => [] };
    api.UI.ensureSettingsDraft({ reset: true });
    api.UI.state.settingsDraft.shopName = 'Saved first value';
    api.UI.state.settingsDirty = true;
    let releaseSave;
    let enteredSave = false;
    let persistedSnapshot = null;
    const gate = new Promise(resolve => { releaseSave = resolve; });
    const originals = {
        saveConfigBundle: api.Store.saveConfigBundle,
        pruneHistory: api.Store.pruneHistory,
        reconfigure: api.MessageCenterAgent.reconfigure,
        toast: api.UI.toast,
    };
    api.Store.saveConfigBundle = async ({ settings, providers }) => {
        enteredSave = true;
        await gate;
        persistedSnapshot = { settings: copy(settings), providers: copy(providers) };
        api.Store.settings = copy(settings);
        api.Store.providers = copy(providers);
    };
    api.Store.pruneHistory = async () => {};
    api.MessageCenterAgent.reconfigure = async () => true;
    api.UI.toast = () => {};
    try {
        const saving = api.UI.saveSettings();
        await waitUntil(() => enteredSave, 'settings persistence did not start');
        api.UI.onInput({ target: { dataset: { settingsField: 'shopName' }, type: 'text', value: 'Edited during save' } });
        releaseSave();
        await saving;
    } finally {
        api.Store.saveConfigBundle = originals.saveConfigBundle;
        api.Store.pruneHistory = originals.pruneHistory;
        api.MessageCenterAgent.reconfigure = originals.reconfigure;
        api.UI.toast = originals.toast;
    }
    assert.equal(persistedSnapshot.settings.shopName, 'Saved first value');
    assert.equal(api.Store.settings.shopName, 'Saved first value');
    assert.deepEqual(api.Store.providers, persistedSnapshot.providers);
    assert.equal(api.UI.state.settingsDraft.shopName, 'Edited during save');
    assert.equal(api.UI.state.settingsDirty, true);
});

test('archiving a template leaves runtime state unchanged if storage rejects the write', async () => {
    const { api } = await loadAssistant();
    const template = api.Store.templates.find(item => !item.archived);
    assert.ok(template, 'fixture needs an active template');
    const beforeTemplates = copy(api.Store.templates);
    api.UI.state.templateEditId = template.id;
    api.UI.state.templateDirty = false;
    const originalSaveTemplates = api.Store.saveTemplates;
    api.Store.saveTemplates = async () => { throw new Error('injected template write failure'); };
    try {
        await assert.rejects(api.UI.archiveTemplate(), /injected template write failure/);
    } finally {
        api.Store.saveTemplates = originalSaveTemplates;
    }
    assert.deepEqual(copy(api.Store.templates), beforeTemplates);
});

test('settings switches expose accessible names and descriptions', async () => {
    const { api } = await loadAssistant();
    const markup = api.UI.renderSettings();
    const switches = [...markup.matchAll(/<input type="checkbox"[^>]*data-settings-field="([^"]+)"[^>]*>/g)];
    assert.ok(switches.length >= 8, 'expected the settings screen to render its switches');
    for (const match of switches) {
        const [tag, key] = match;
        const id = `mema-setting-${key}`;
        assert.match(tag, new RegExp(`aria-labelledby="${id}-label"`), `${key} needs an accessible name`);
        assert.match(tag, new RegExp(`aria-describedby="${id}-description"`), `${key} needs a description`);
        assert.match(markup, new RegExp(`id="${id}-label"`));
        assert.match(markup, new RegExp(`id="${id}-description"`));
    }
});

test('config export uses the visible settings draft without saving it as runtime state', async () => {
    const { api } = await loadAssistant();
    api.UI.shadow = {
        querySelector: () => null,
        querySelectorAll: () => [],
    };
    api.UI.ensureSettingsDraft({ reset: true });
    api.UI.state.settingsDraft.shopName = 'Unsaved draft shop';
    api.UI.state.providersDraft.openai.apiKey = 'unsaved-draft-key';
    api.UI.state.settingsDirty = true;
    let downloaded = null;
    api.ConfigManager.download = (includeSecrets, overrides) => {
        downloaded = { includeSecrets, overrides: copy(overrides) };
    };
    api.UI.toast = () => {};

    await api.UI.exportConfig();

    assert.equal(api.Store.settings.shopName, '');
    assert.equal(api.Store.providers.openai.apiKey, '');
    assert.equal(downloaded.includeSecrets, false);
    assert.equal(downloaded.overrides.settings.shopName, 'Unsaved draft shop');
    assert.equal(downloaded.overrides.providers.openai.apiKey, 'unsaved-draft-key');
});

test('AI rejects a provider result that does not satisfy its declared JSON schema', async () => {
    const { api } = await loadAssistant();
    const schema = {
        type: 'object',
        additionalProperties: false,
        required: ['ok', 'message'],
        properties: { ok: { type: 'boolean' }, message: { type: 'string' } },
    };
    const active = {
        id: 'openai',
        provider: api.AI.provider('openai'),
        profile: { apiKey: 'test-key', model: 'test-model' },
    };
    const originalOpenai = api.AI.openai;
    api.AI.openai = async () => ({ ok: 'true', message: 'wrong type', unexpected: true });
    try {
        await assert.rejects(api.AI.run('test', {}, schema, active), /şema|schema|beklenen|required/i);
    } finally {
        api.AI.openai = originalOpenai;
    }
});

test('secret-free config export rejects credentials embedded in an unsaved Message Center URL', async () => {
    const { api } = await loadAssistant();
    api.UI.shadow = {
        querySelector: () => null,
        querySelectorAll: () => [],
    };
    api.UI.ensureSettingsDraft({ reset: true });
    api.UI.state.settingsDraft.messageCenterUrl = 'https://backup-user:backup-pass@messages.example.test';
    api.UI.state.settingsDraft.configIncludeSecrets = false;

    assert.throws(
        () => api.ConfigManager.snapshot(false, {
            settings: api.UI.state.settingsDraft,
            providers: api.UI.state.providersDraft,
        }),
        /messageCenterUrl|config/i,
    );
    await assert.rejects(api.UI.exportConfig(), /messageCenterUrl|config/i);
});

test('settings reset is a non-persistent draft and preserves DeepL and agent secrets', async () => {
    const { api } = await loadAssistant();
    api.Store.settings = {
        ...api.DEFAULT_SETTINGS,
        shopName: 'Persisted shop',
        defaultTone: 'formal',
        deeplApiKey: 'deepl-secret',
        messageCenterAgentToken: 'agent-secret',
    };
    api.UI.shadow = { querySelector: () => null, querySelectorAll: () => [] };
    api.UI.toast = () => {};
    api.UI.ensureSettingsDraft({ reset: true });

    await api.UI.resetSettings();

    assert.equal(api.Store.settings.shopName, 'Persisted shop');
    assert.equal(api.Store.settings.defaultTone, 'formal');
    assert.equal(api.UI.state.settingsDraft.shopName, api.DEFAULT_SETTINGS.shopName);
    assert.equal(api.UI.state.settingsDraft.defaultTone, api.DEFAULT_SETTINGS.defaultTone);
    assert.equal(api.UI.state.settingsDraft.deeplApiKey, 'deepl-secret');
    assert.equal(api.UI.state.settingsDraft.messageCenterAgentToken, 'agent-secret');
    assert.equal(api.UI.state.settingsDirty, true);
});

test('config import always clears the busy state and refreshes runtime drafts', async () => {
    const { api } = await loadAssistant();
    const classes = new Set();
    const attributes = new Map();
    api.UI.app = {
        classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } },
        setAttribute(name, value) { attributes.set(name, value); },
    };
    api.UI.view = null;
    api.UI.toast = () => {};
    api.UI.state.settingsDraft = { stale: true };
    api.UI.state.providersDraft = { stale: true };
    const payload = api.ConfigManager.snapshot(false);
    payload.settings.defaultTone = 'formal';

    await api.UI.importConfigFile({ text: async () => JSON.stringify(payload) });

    assert.equal(api.UI.state.busy, false);
    assert.equal(classes.has('ma-busy'), false);
    assert.equal(attributes.get('aria-busy'), 'false');
    assert.equal(api.UI.state.tone, 'formal');
    assert.equal(api.UI.state.settingsDraft.defaultTone, 'formal');
    assert.equal(api.UI.state.settingsDirty, false);
});

test('config import preserves a dirty template draft unless template replacement is confirmed', async () => {
    const { api, sandbox } = await loadAssistant();
    api.UI.app = {
        classList: { toggle() {} },
        setAttribute() {},
    };
    api.UI.view = null;
    api.UI.render = () => {};
    api.UI.toast = () => {};
    const draft = { id: 'tpl-order-thanks', name: 'Unsaved name', text: 'Unsaved template text' };
    api.UI.state.templateDraft = draft;
    api.UI.state.templateDirty = true;
    let confirmations = 0;
    sandbox.confirm = () => { confirmations += 1; return false; };

    const settingsOnly = {
        app: api.APP.id,
        schemaVersion: api.APP.configSchema,
        settings: { shopName: 'Imported without templates' },
        providers: {},
        templates: [],
    };
    assert.equal(await api.UI.importConfigFile({ text: async () => JSON.stringify(settingsOnly) }), true);
    assert.equal(confirmations, 0);
    assert.equal(api.Store.settings.shopName, 'Imported without templates');
    assert.equal(api.UI.state.templateDraft, draft);
    assert.equal(api.UI.state.templateDirty, true);

    const templatesBeforeDeclinedImport = copy(api.Store.templates);
    const replacement = {
        ...settingsOnly,
        settings: { shopName: 'Declined replacement must not import' },
        templates: [{ id: 'tpl-imported', name: 'Imported', text: 'Imported text' }],
    };
    assert.equal(await api.UI.importConfigFile({ text: async () => JSON.stringify(replacement) }), false);
    assert.equal(confirmations, 1);
    assert.equal(api.Store.settings.shopName, 'Imported without templates');
    assert.deepEqual(copy(api.Store.templates), templatesBeforeDeclinedImport);
    assert.equal(api.UI.state.templateDraft, draft);
    assert.equal(api.UI.state.templateDirty, true);

    sandbox.confirm = () => { confirmations += 1; return true; };
    assert.equal(await api.UI.importConfigFile({ text: async () => JSON.stringify(replacement) }), true);
    assert.equal(confirmations, 2);
    assert.equal(api.Store.settings.shopName, 'Declined replacement must not import');
    assert.equal(api.Store.templates.some(template => template.id === 'tpl-imported'), true);
    assert.equal(api.UI.state.templateDraft, null);
    assert.equal(api.UI.state.templateDirty, false);
});

test('SPA route changes preserve utility tabs but update contextual tabs', async () => {
    const { api, sandbox } = await loadAssistant();
    api.UI.state.open = false;
    api.UI.state.page = 'templates';
    api.App.routeFingerprint = 'previous';
    sandbox.location.pathname = '/messages/all';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/all';
    api.UI.state.messageListTranslationStatus = { phase: 'loading' };
    const listGeneration = api.UI.messageListWorkGeneration;

    await api.App.onRoute();
    assert.equal(api.UI.state.page, 'templates');
    assert.ok(api.UI.messageListWorkGeneration > listGeneration);
    assert.equal(api.UI.state.messageListTranslationStatus.phase, 'idle');

    api.UI.state.page = 'messages';
    sandbox.location.pathname = '/your/orders/sold/completed';
    sandbox.location.href = 'https://www.etsy.com/your/orders/sold/completed';
    await api.App.onRoute();
    assert.equal(api.UI.state.page, 'orders');
});

test('review refresh replaces stale selection and rejects late work from the old review', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/your/shops/me/dashboard/activity';
    sandbox.location.href = 'https://www.etsy.com/your/shops/me/dashboard/activity';
    const first = { id: 'review-a', text: 'First review' };
    const second = { id: 'review-b', text: 'Second review' };
    api.UI.state.reviews = [first];
    api.UI.state.selectedReviewId = first.id;
    const oldWork = api.UI.beginReviewWork(first);
    api.UI.state.reviewAnalysis = { summary_tr: 'Old result' };
    api.UI.state.reviewAnalysisBinding = oldWork;
    api.ReviewsAdapter.scan = () => [second];

    api.UI.refreshReviews();

    assert.equal(api.UI.state.selectedReviewId, second.id);
    assert.equal(api.UI.state.reviewAnalysis, null);
    assert.equal(api.UI.state.reviewAnalysisBinding, null);
    assert.equal(api.UI.reviewWorkIsCurrent(oldWork), false);
});

test('translator preserves formatting and separates cache entries by exact text and preferred provider', async () => {
    const environment = await loadAssistant();
    const requests = [];
    const formattedText = '\n  First paragraph.\n\n    Second paragraph stays indented.  \n';
    const trimmedText = 'First paragraph.\n\n    Second paragraph stays indented.';
    const singleLineText = 'First paragraph. Second paragraph stays indented.';

    environment.api.GMX.request = async (request) => {
        requests.push(request);
        if (request.url.includes('deepl.com')) {
            return {
                status: 200,
                responseText: JSON.stringify({ translations: [{ text: 'DeepL çevirisi', detected_source_language: 'EN' }] }),
            };
        }
        return {
            status: 200,
            responseText: JSON.stringify([[['Çeviri', trimmedText]], null, 'en']),
        };
    };
    environment.api.Store.settings = {
        ...environment.api.Store.settings,
        translator: 'google',
        deeplApiKey: 'test-key',
        freeFallback: false,
    };

    await environment.api.Translator.translate(formattedText, 'tr');
    await environment.api.Translator.translate(singleLineText, 'tr');
    await environment.api.Translator.translate(formattedText, 'tr');
    await environment.api.Translator.translate(formattedText, 'tr', { provider: 'deepl' });
    environment.api.Store.settings.preferUsEnglish = true;
    await environment.api.Translator.translate('English locale probe', 'en', { provider: 'deepl' });
    environment.api.Store.settings.preferUsEnglish = false;
    await environment.api.Translator.translate('English locale probe', 'en', { provider: 'deepl' });

    const googleRequests = requests.filter(request => request.url.includes('translate.googleapis.com'));
    const deepLRequests = requests.filter(request => request.url.includes('deepl.com'));
    assert.equal(googleRequests.length, 2, 'paragraph formatting must be part of the translation cache identity');
    assert.equal(deepLRequests.length, 3, 'provider and effective English variant must be part of the cache identity');
    assert.equal(new URL(googleRequests[0].url).searchParams.get('q'), trimmedText);
    assert.equal(new URL(googleRequests[1].url).searchParams.get('q'), singleLineText);
    assert.equal(new URLSearchParams(deepLRequests[0].data).get('text'), trimmedText);
    assert.deepEqual(
        deepLRequests.slice(1).map(request => new URLSearchParams(request.data).get('target_lang')),
        ['EN-US', 'EN-GB'],
    );
});

test('translator fallback cache follows policy and credential profile without exposing secrets', async () => {
    const { api } = await loadAssistant();
    const requests = [];
    api.Store.settings = {
        ...api.Store.settings,
        translator: 'deepl',
        deeplApiKey: 'deepl-bad-secret',
        deeplPro: false,
        freeFallback: true,
    };
    api.GMX.request = async (request) => {
        requests.push(request);
        if (request.url.includes('translate.googleapis.com')) {
            return {
                status: 200,
                responseText: JSON.stringify([[['Google fallback', 'Policy probe']], null, 'en']),
            };
        }
        const key = new URLSearchParams(request.data).get('auth_key');
        if (key === 'deepl-bad-secret') {
            return { status: 403, responseText: JSON.stringify({ message: 'Invalid key' }) };
        }
        return {
            status: 200,
            responseText: JSON.stringify({
                translations: [{
                    text: request.url.includes('api-free.deepl.com') ? 'DeepL fixed' : 'DeepL Pro fixed',
                    detected_source_language: 'EN',
                }],
            }),
        };
    };

    const fallback = await api.Translator.translate('Policy probe', 'tr');
    assert.equal(fallback.provider, 'google');
    assert.equal(requests.filter(request => request.url.includes('api-free.deepl.com')).length, 1);
    assert.equal(requests.filter(request => request.url.includes('translate.googleapis.com')).length, 1);

    api.Store.settings.freeFallback = false;
    await assert.rejects(api.Translator.translate('Policy probe', 'tr'), /Invalid key|DeepL/i);
    assert.equal(requests.filter(request => request.url.includes('api-free.deepl.com')).length, 2);
    assert.equal(requests.filter(request => request.url.includes('translate.googleapis.com')).length, 1);

    api.Store.settings.freeFallback = true;
    api.Store.settings.deeplApiKey = 'deepl-good-secret';
    const fixed = await api.Translator.translate('Policy probe', 'tr');
    assert.equal(fixed.provider, 'deepl');
    assert.equal(fixed.text, 'DeepL fixed');
    assert.equal(requests.filter(request => request.url.includes('api-free.deepl.com')).length, 3);

    api.Store.settings.deeplPro = true;
    const fixedPro = await api.Translator.translate('Policy probe', 'tr');
    assert.equal(fixedPro.text, 'DeepL Pro fixed');
    assert.equal(requests.filter(request => request.url.includes('api.deepl.com')).length, 1);

    const cacheIdentity = [...api.Translator.cache.keys()].join('\n');
    assert.equal(cacheIdentity.includes('deepl-bad-secret'), false);
    assert.equal(cacheIdentity.includes('deepl-good-secret'), false);
});

test('translator retries DeepL after a transient Google fallback instead of caching the fallback', async () => {
    const { api } = await loadAssistant();
    api.Store.settings = {
        ...api.Store.settings,
        translator: 'deepl',
        deeplApiKey: 'stable-key',
        deeplPro: false,
        freeFallback: true,
    };
    let deepLCalls = 0;
    let googleCalls = 0;
    api.GMX.request = async (request) => {
        if (request.url.includes('deepl.com')) {
            deepLCalls += 1;
            if (deepLCalls === 1) return { status: 503, responseText: '{}' };
            return {
                status: 200,
                responseText: JSON.stringify({
                    translations: [{ text: 'DeepL recovered', detected_source_language: 'EN' }],
                }),
            };
        }
        googleCalls += 1;
        return {
            status: 200,
            responseText: JSON.stringify([[['Google fallback', 'Transient probe']], null, 'en']),
        };
    };

    const fallback = await api.Translator.translate('Transient probe', 'tr');
    const recovered = await api.Translator.translate('Transient probe', 'tr');

    assert.equal(fallback.provider, 'google');
    assert.equal(recovered.provider, 'deepl');
    assert.equal(recovered.text, 'DeepL recovered');
    assert.equal(deepLCalls, 2);
    assert.equal(googleCalls, 1);
});

test('message adapter and UI translation paths preserve trimmed multiline customer text', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/multiline-conversation';
    sandbox.location.href = 'https://www.etsy.com/messages/multiline-conversation';
    const expected = 'First paragraph.\n\n    Second paragraph with  two spaces.';
    const row = { className: 'wt-grid' };
    const bubble = {
        id: 'multiline-message',
        innerText: '\n  Message: First paragraph.\n\n    Second paragraph with  two spaces.  \n',
        textContent: '',
        className: 'message-bubble',
        parentElement: null,
        closest: selector => selector === '.wt-grid' ? row : null,
    };
    const scope = {
        innerText: '',
        textContent: '',
        querySelector: () => null,
        querySelectorAll: selector => selector === api.MessageAdapter.bubbleSelector ? [bubble] : [],
    };
    api.MessageAdapter.getConversationScope = () => scope;

    const context = api.MessageAdapter.context();
    assert.equal(context.lastCustomerMessage, expected);
    assert.equal(context.messages[0].text, expected);

    const translatedTexts = [];
    api.Translator.translate = async (text) => {
        translatedTexts.push(text);
        return { text: 'Çeviri', detectedLanguage: 'en', provider: 'google' };
    };
    api.UI.setBusy = () => {};
    api.UI.toast = () => {};
    api.Store.settings.autoTurkishPreview = true;
    api.Store.settings.replyInCustomerLanguage = true;
    api.UI.state.context = null;

    await api.UI.refreshMessages();
    await api.UI.translateLast();

    assert.deepEqual(copy(translatedTexts), [expected, expected]);
});

test('AI reply layout uses real paragraph breaks and preserves existing multiline structure', async () => {
    const { api } = await loadAssistant();
    const prompt = api.Prompt.system('reply', { preferences: { target_language: 'en' } });

    assert.match(prompt, /tek satır.*yazma/i);
    assert.match(prompt, /gerçek \\n\\n satır sonları/i);
    assert.match(api.Prompt.replySchema().properties.reply.description, /satır sonları/i);
    assert.equal(
        api.formatGeneratedMessage('Hi Ashley, Thank you for your message. I can help with that.'),
        'Hi Ashley,\n\nThank you for your message.\n\nI can help with that.',
    );
    assert.equal(
        api.formatGeneratedMessage('Hi Ashley,\\n\\nThank you for your message.\r\n\r\nBest,\r\nMakaytron'),
        'Hi Ashley,\n\nThank you for your message.\n\nBest,\nMakaytron',
    );
    assert.equal(
        api.formatGeneratedMessage('Please keep C:\\new and print("\\n") exactly as written.'),
        'Please keep C:\\new and print("\\n") exactly as written.',
        'a lone literal backslash-n in user content must not be rewritten',
    );
});

test('normal message output exposes one verified customer-send action and dispatches it once', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/customer-send';
    sandbox.location.href = 'https://www.etsy.com/messages/customer-send';
    const context = {
        conversationId: api.Router.conversationId(),
        routeFingerprint: api.Router.routeFingerprint(),
        customerName: 'Ashley',
        customerAvatar: '',
        orderId: '',
        itemTitle: '',
        lastCustomerMessage: 'Could you help me?',
        messages: [{ id: 'incoming', role: 'customer', text: 'Could you help me?' }],
    };
    const textarea = { value: 'Hi Ashley,\n\nOf course I can help.' };
    const button = {};
    const binding = {
        conversationId: context.conversationId,
        routeFingerprint: context.routeFingerprint,
        messageHash: 'current',
    };
    api.MessageAdapter.context = () => context;
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.getSendButton = () => button;
    api.Campaign.current = () => null;
    api.Campaign.unresolvedSendItem = () => null;
    api.UI.toast = () => {};
    api.UI.replyIsCurrent = candidate => candidate === binding;
    api.UI.state.context = context;
    api.UI.state.reply = textarea.value;
    api.UI.state.replyBinding = binding;
    api.UI.state.analysis = api.Heuristics.analyze(context.lastCustomerMessage);

    const markup = api.UI.renderMessages();
    assert.match(markup, /data-action="send-reply"[^>]*data-real-send-action="1"/);
    assert.match(markup, />Müşteriye Gönder<\/button>/);
    assert.doesNotMatch(markup, /data-action="insert-reply"/);
    assert.equal((markup.match(/data-real-send-action="1"/g) || []).length, 1);

    let insertCalls = 0;
    let dispatchCalls = 0;
    let releaseDispatch;
    const dispatchGate = new Promise(resolve => { releaseDispatch = resolve; });
    api.UI.insertReply = async ({ notify, prepareVerification, persistInserted, logInsertion }) => {
        insertCalls += 1;
        assert.equal(notify, false);
        assert.equal(prepareVerification, false);
        assert.equal(persistInserted, false);
        assert.equal(logInsertion, false);
        return { textarea };
    };
    api.MessageAdapter.waitForSendButton = async () => button;
    const guard = { token: 'customer-send-guard' };
    api.Verification.beginNativeDispatchGuard = () => guard;
    api.Verification.dispatchNativeSend = async (actualButton, actualGuard, options) => {
        dispatchCalls += 1;
        assert.equal(actualButton, null);
        assert.equal(actualGuard, null);
        assert.equal(options.expectedConversationIdentity, api.Router.conversationIdentity());
        assert.equal(options.prepareMeta.conversationId, context.conversationId);
        assert.match(options.prepareMeta.verificationId, /^reply-send-/);
        const prepared = await options.prepareDispatch();
        assert.equal(prepared.button, button);
        assert.equal(prepared.guard, guard);
        assert.equal(prepared.verifyCaptured, false);
        await dispatchGate;
        return true;
    };
    let releases = 0;
    api.Verification.releaseNativeDispatchGuard = actualGuard => {
        if (!actualGuard) return;
        assert.equal(actualGuard, guard);
        releases += 1;
    };

    const first = api.UI.sendReplyToCustomer();
    const second = api.UI.sendReplyToCustomer();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(insertCalls, 1);
    assert.equal(dispatchCalls, 1);
    releaseDispatch();
    assert.equal(await first, true);
    assert.equal(await second, true);
    assert.equal(releases, 1);
    assert.equal(api.UI.state.replyBinding, null, 'a verified reply is consumed and cannot be dispatched again');
    await assert.rejects(api.UI.sendReplyToCustomer(), /güncel konuşmayla eşleşmiyor/i);
    assert.equal(dispatchCalls, 1, 'a sequential click after verified send must not dispatch again');
});

test('shared message actions keep panel labels and dispatcher behavior in one registry', async () => {
    const { api } = await loadAssistant();
    const expectedDefinitions = [
        ['ai-polish-reply', 'AI ile Düzenle', 'edit', false],
        ['free-translate-reply', 'Sadece Çevir', 'globe', false],
        ['ai-auto-reply', 'AI Cevap Önersin', 'star', false],
        ['regenerate-reply', 'Tekrar Hazırla', 'refresh', false],
        ['send-reply', 'Müşteriye Gönder', 'send', true],
    ];

    for (const [action, label, icon, realSend] of expectedDefinitions) {
        const definition = api.UI.messageActionDefinition(action);
        assert.ok(definition, `${action} must be registered`);
        assert.equal(definition.label, label);
        assert.equal(definition.icon, icon);
        assert.equal(Boolean(definition.realSend), realSend);
        const markup = api.UI.renderMessageActionButton(action, {
            className: 'shared-action',
            disabled: action === 'regenerate-reply',
            attributes: 'aria-label="shared message action"',
        });
        assert.match(markup, new RegExp(`data-action="${action}"`));
        assert.match(markup, new RegExp(label));
        assert.match(markup, /class="shared-action"/);
        assert.match(markup, /aria-label="shared message action"/);
        assert.equal(markup.includes('data-real-send-action="1"'), realSend);
        assert.equal(markup.includes(' disabled'), action === 'regenerate-reply');
    }
    assert.equal(api.UI.messageActionDefinition('not-an-action'), null);
    assert.equal(api.UI.renderMessageActionButton('not-an-action'), '');

    const generated = [];
    const events = [];
    const snapshot = { textarea: {}, text: 'Composer draft', conversationIdentity: 'conversation-1' };
    api.UI.generateReply = async options => {
        generated.push(copy(options));
        return true;
    };
    api.UI.regenerateReply = async () => {
        events.push('regenerate');
        return true;
    };
    api.UI.adoptComposerReply = actualSnapshot => {
        assert.equal(actualSnapshot, snapshot);
        events.push('adopt');
        return {};
    };
    api.UI.replaceComposerWithCurrentReply = actualSnapshot => {
        assert.equal(actualSnapshot, snapshot);
        events.push('replace');
        return true;
    };
    api.UI.setBusy = value => events.push(`busy:${value}`);
    api.UI.sendReplyToCustomer = async () => {
        events.push('send');
        return true;
    };

    assert.equal(await api.UI.runMessageAction('ai-polish-reply', {
        draftText: 'Polish this draft',
        insertIntoComposer: true,
        composerSnapshot: snapshot,
    }), true);
    assert.equal(api.UI.state.draftTr, 'Polish this draft');
    assert.equal(await api.UI.runMessageAction('ai-auto-reply'), true);
    assert.equal(await api.UI.runMessageAction('free-translate-reply', { draftText: 'Bunu çevir' }), true);
    assert.equal(await api.UI.runMessageAction('regenerate-reply'), true);
    assert.equal(await api.UI.runMessageAction('send-reply', {
        adoptComposerText: true,
        composerSnapshot: snapshot,
    }), true);

    assert.deepEqual(generated, [
        { method: 'ai', replyMode: 'polish' },
        { method: 'ai', replyMode: 'auto' },
        { method: 'free', replyMode: 'free' },
    ]);
    assert.deepEqual(events, ['replace', 'regenerate', 'adopt', 'busy:true', 'send']);
    await assert.rejects(api.UI.runMessageAction('not-an-action'), /Bilinmeyen mesaj işlemi/i);
});

test('composer snapshots protect generated replacement and native draft adoption from stale Etsy state', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/composer-snapshot';
    sandbox.location.href = 'https://www.etsy.com/messages/composer-snapshot';
    const textarea = { value: 'Original composer text', isConnected: true };
    const snapshot = {
        textarea,
        text: textarea.value,
        conversationIdentity: api.Router.conversationIdentity(),
    };
    api.MessageAdapter.getTextarea = () => textarea;

    assert.equal(api.UI.composerSnapshotIsCurrent(snapshot), true);
    textarea.value = 'Buyer edited this while AI was running';
    assert.equal(api.UI.composerSnapshotIsCurrent(snapshot), false);
    textarea.value = snapshot.text;

    const replyBinding = { token: 'reply-binding' };
    let inserted = null;
    let toastCalls = 0;
    api.UI.state.reply = 'Generated customer reply';
    api.UI.state.replyBinding = replyBinding;
    api.UI.replyIsCurrent = binding => binding === replyBinding;
    api.MessageAdapter.insert = (text, target) => { inserted = { text, target }; };
    api.UI.toast = () => { toastCalls += 1; };
    assert.equal(api.UI.replaceComposerWithCurrentReply(snapshot), true);
    assert.deepEqual(inserted, { text: 'Generated customer reply', target: textarea });
    assert.equal(toastCalls, 1);

    textarea.value = 'A newer unsaved draft';
    assert.throws(
        () => api.UI.replaceComposerWithCurrentReply(snapshot),
        /mevcut metin korunarak üzerine yazılmadı/i,
    );

    const adoptedText = 'Send this exact Etsy composer draft';
    textarea.value = adoptedText;
    const adoptionSnapshot = { ...snapshot, text: adoptedText };
    const context = {
        conversationId: api.Router.conversationId(),
        routeFingerprint: api.Router.routeFingerprint(),
        customerName: 'Ashley',
        lastCustomerMessage: 'Can you help?',
        messages: [{ id: 'incoming', role: 'customer', text: 'Can you help?' }],
    };
    const adoptedBinding = { token: 'adopted-binding' };
    let adoptedContext = null;
    api.UI.state.reply = '';
    api.UI.state.replyBinding = null;
    api.MessageAdapter.context = () => context;
    api.UI.beginMessageWork = actualContext => {
        assert.equal(actualContext, context);
        return adoptedBinding;
    };
    api.UI.adoptMessageContext = actualContext => { adoptedContext = actualContext; };
    assert.deepEqual(copy(api.UI.adoptComposerReply(adoptionSnapshot)), adoptedBinding);
    assert.equal(adoptedContext, context);
    assert.equal(api.UI.state.reply, adoptedText);
    assert.deepEqual(copy(api.UI.state.replyBinding), adoptedBinding);
    assert.equal(api.UI.state.replyTr, '', 'a native composer draft must not be mislabeled as a translated reply');
    assert.equal(api.UI.state.replyMethod, 'native');

    sandbox.location.pathname = '/messages/different-conversation';
    sandbox.location.href = 'https://www.etsy.com/messages/different-conversation';
    assert.throws(
        () => api.UI.adoptComposerReply(adoptionSnapshot),
        /Mesaj gönderilmedi/i,
    );
});

test('composer quick actions revalidate live drafts, remount after external removal, and stay idempotent across routes', async () => {
    const { api, sandbox } = await loadAssistant();
    const setRoute = id => {
        sandbox.location.pathname = id ? `/messages/${id}` : '/messages';
        sandbox.location.href = `https://www.etsy.com${sandbox.location.pathname}`;
        sandbox.location.search = '';
    };
    const connectTree = (node, connected) => {
        node.isConnected = connected;
        for (const child of node.children || []) connectTree(child, connected);
    };
    const makeElement = (tagName = 'div') => {
        const attributes = new Map();
        const listeners = new Map();
        const node = {
            nodeType: 1,
            tagName: String(tagName).toUpperCase(),
            className: '',
            textContent: '',
            value: '',
            disabled: false,
            children: [],
            parentNode: null,
            parentElement: null,
            isConnected: false,
            appendChild(child) {
                return this.insertBefore(child, null);
            },
            append(...children) {
                for (const child of children) this.appendChild(child);
            },
            insertBefore(child, before) {
                child.remove?.();
                const index = before ? this.children.indexOf(before) : -1;
                if (index >= 0) this.children.splice(index, 0, child);
                else this.children.push(child);
                child.parentNode = this;
                child.parentElement = this;
                connectTree(child, this.isConnected);
                return child;
            },
            removeChild(child) {
                const index = this.children.indexOf(child);
                if (index < 0) return child;
                this.children.splice(index, 1);
                child.parentNode = null;
                child.parentElement = null;
                connectTree(child, false);
                return child;
            },
            remove() {
                this.parentNode?.removeChild?.(this);
            },
            setAttribute(name, value) {
                attributes.set(name, String(value));
            },
            getAttribute(name) {
                return attributes.has(name) ? attributes.get(name) : null;
            },
            hasAttribute(name) {
                return attributes.has(name);
            },
            matches(selector) {
                const attribute = /^\[([^\]]+)\]$/.exec(selector)?.[1];
                if (attribute) return this.hasAttribute(attribute);
                return selector.toUpperCase() === this.tagName;
            },
            closest(selector) {
                for (let current = this; current; current = current.parentElement) {
                    if (current.matches?.(selector)) return current;
                }
                return null;
            },
            contains(candidate) {
                if (candidate === this) return true;
                return this.children.some(child => child.contains?.(candidate));
            },
            querySelectorAll(selector) {
                const matches = [];
                const visit = current => {
                    for (const child of current.children || []) {
                        if (child.matches?.(selector)) matches.push(child);
                        visit(child);
                    }
                };
                visit(this);
                return matches;
            },
            addEventListener(type, listener) {
                const handlers = listeners.get(type) || [];
                handlers.push(listener);
                listeners.set(type, handlers);
            },
            removeEventListener(type, listener) {
                listeners.set(type, (listeners.get(type) || []).filter(handler => handler !== listener));
            },
        };
        Object.defineProperty(node, 'nextSibling', {
            get() {
                if (!this.parentNode) return null;
                const index = this.parentNode.children.indexOf(this);
                return this.parentNode.children[index + 1] || null;
            },
        });
        return node;
    };

    const host = makeElement('section');
    connectTree(host, true);
    const form = makeElement('form');
    const textarea = makeElement('textarea');
    host.appendChild(form);
    form.appendChild(textarea);
    sandbox.document.createElement = tagName => makeElement(tagName);
    let observerCallback = null;
    let observerDisconnected = false;
    sandbox.MutationObserver = class {
        constructor(callback) { observerCallback = callback; }
        observe() {}
        disconnect() { observerDisconnected = true; }
    };
    let activeTextarea = textarea;
    api.MessageAdapter.getTextarea = () => activeTextarea;
    api.Campaign.current = () => null;
    api.UI.state.busy = false;
    setRoute('quick-actions-one');

    assert.equal(api.ComposerQuickActions.start(), true);
    assert.equal(typeof observerCallback, 'function');
    const firstRoot = api.ComposerQuickActions.root;
    assert.ok(firstRoot);
    assert.equal(host.querySelectorAll('[data-mema-composer-actions]').length, 1);
    const firstButtons = firstRoot.querySelectorAll('[data-mema-message-action]');
    assert.deepEqual(
        firstButtons.map(button => button.textContent),
        ['ai-auto-reply', 'ai-polish-reply', 'free-translate-reply', 'send-reply']
            .map(action => api.UI.messageActionDefinition(action).label),
    );
    assert.equal(firstButtons.find(button => button.getAttribute('data-mema-message-action') === 'send-reply').getAttribute('data-real-send-action'), '1');
    assert.equal(firstButtons.find(button => button.getAttribute('data-mema-message-action') === 'ai-auto-reply').disabled, false);
    assert.ok(firstButtons.filter(button => button.getAttribute('data-mema-message-action') !== 'ai-auto-reply').every(button => button.disabled));

    assert.equal(api.ComposerQuickActions.sync(), true);
    assert.equal(api.ComposerQuickActions.root, firstRoot, 'syncing the same composer must not duplicate the toolbar');
    assert.equal(host.querySelectorAll('[data-mema-composer-actions]').length, 1);

    const autoButton = firstButtons.find(button => button.getAttribute('data-mema-message-action') === 'ai-auto-reply');
    let unsafeAutoDispatches = 0;
    api.UI.runMessageAction = async () => {
        unsafeAutoDispatches += 1;
        return true;
    };
    textarea.value = 'Programmatically restored Etsy draft';
    api.ComposerQuickActions.handleClick({
        target: autoButton,
        preventDefault: () => assert.fail('a newly ineligible action must not consume the click'),
        stopPropagation: () => {},
    });
    const unsafeOperation = api.ComposerQuickActions.actionPromise;
    if (unsafeOperation) await unsafeOperation;
    assert.equal(unsafeAutoDispatches, 0, 'click handling must re-read a draft restored without an input event');
    assert.equal(autoButton.disabled, true);
    assert.equal(textarea.value, 'Programmatically restored Etsy draft', 'the restored draft must never be overwritten');

    textarea.value = 'Draft from the Etsy composer';
    assert.equal(api.ComposerQuickActions.syncState(), true);
    assert.equal(autoButton.disabled, true);
    assert.ok(firstButtons.filter(button => button.getAttribute('data-mema-message-action') !== 'ai-auto-reply').every(button => !button.disabled));

    let dispatched = null;
    api.UI.runMessageAction = async (action, options) => {
        dispatched = { action, options };
        return true;
    };
    api.UI.reportUiError = error => assert.fail(error);
    api.UI.setBusy = value => { api.UI.state.busy = value; };
    api.UI.state.open = false;
    const polishButton = firstButtons.find(button => button.getAttribute('data-mema-message-action') === 'ai-polish-reply');
    let prevented = 0;
    api.ComposerQuickActions.handleClick({
        target: polishButton,
        preventDefault: () => { prevented += 1; },
        stopPropagation: () => {},
    });
    const operation = api.ComposerQuickActions.actionPromise;
    assert.ok(operation);
    await operation;
    assert.equal(prevented, 1);
    assert.equal(dispatched.action, 'ai-polish-reply');
    assert.equal(dispatched.options.surface, 'composer');
    assert.equal(dispatched.options.draftText, textarea.value);
    assert.equal(dispatched.options.insertIntoComposer, true);
    assert.equal(dispatched.options.adoptComposerText, false);
    assert.equal(dispatched.options.composerSnapshot.textarea, textarea);
    assert.equal(dispatched.options.composerSnapshot.text, textarea.value);
    assert.equal(dispatched.options.composerSnapshot.conversationIdentity, api.Router.conversationIdentity());

    setRoute('quick-actions-two');
    assert.equal(api.ComposerQuickActions.sync(), true);
    assert.notEqual(api.ComposerQuickActions.root, firstRoot, 'a new conversation identity must replace the stale toolbar');
    assert.equal(firstRoot.isConnected, false);
    assert.equal(host.querySelectorAll('[data-mema-composer-actions]').length, 1);

    const externallyRemovedRoot = api.ComposerQuickActions.root;
    externallyRemovedRoot.remove();
    assert.equal(externallyRemovedRoot.isConnected, false);
    assert.equal(host.querySelectorAll('[data-mema-composer-actions]').length, 0);
    observerCallback([{ addedNodes: [], removedNodes: [externallyRemovedRoot] }]);
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.notEqual(api.ComposerQuickActions.root, externallyRemovedRoot, 'an externally removed toolbar must be remounted');
    assert.equal(api.ComposerQuickActions.root.isConnected, true);
    assert.equal(host.querySelectorAll('[data-mema-composer-actions]').length, 1);

    setRoute('');
    assert.equal(api.ComposerQuickActions.sync(), false);
    assert.equal(api.ComposerQuickActions.root, null);
    assert.equal(host.querySelectorAll('[data-mema-composer-actions]').length, 0, 'message-list routes must not expose composer actions');

    setRoute('quick-actions-three');
    activeTextarea = null;
    assert.equal(api.ComposerQuickActions.sync(), false);
    assert.equal(host.querySelectorAll('[data-mema-composer-actions]').length, 0, 'missing trusted composers must fail closed');
    api.ComposerQuickActions.stop();
    assert.equal(observerDisconnected, true);
});

test('normal customer-send preflight rejects every existing owner before composer mutation', async () => {
    const scenarios = [
        {
            name: 'local verification',
            arrange(api) { api.Verification.pending = { verificationToken: 1 }; },
        },
        {
            name: 'Message Center hold',
            arrange(api) { api.MessageCenterAgent.activeSendHold = async () => ({ id: 'mc-hold' }); },
        },
        {
            name: 'campaign owner',
            arrange(api) {
                api.MessageCenterAgent.activeSendHold = async () => null;
                api.Campaign.persistedSendOwnership = async () => ({ id: 'campaign-hold' });
            },
        },
        {
            name: 'native outcome hold',
            arrange(api) {
                api.MessageCenterAgent.activeSendHold = async () => null;
                api.Campaign.persistedSendOwnership = async () => null;
                api.Verification.activeNativeSendHold = async () => ({ id: 'native-hold' });
            },
        },
    ];

    for (const scenario of scenarios) {
        const { api, sandbox } = await loadAssistant();
        sandbox.location.pathname = '/messages/preflight-owner';
        sandbox.location.href = 'https://www.etsy.com/messages/preflight-owner';
        api.MessageCenterAgent.activeSendHold = async () => null;
        api.Campaign.persistedSendOwnership = async () => null;
        api.Verification.activeNativeSendHold = async () => null;
        api.UI.toast = () => {};
        scenario.arrange(api);
        let composerMutations = 0;
        const result = await api.Verification.dispatchNativeSend(null, null, {
            expectedConversationIdentity: api.Router.conversationIdentity(),
            prepareDispatch: async () => {
                composerMutations += 1;
                return null;
            },
        });
        assert.equal(result, false, scenario.name);
        assert.equal(composerMutations, 0, `${scenario.name} must fail before the composer callback`);
    }
});

test('message entries collapse nested Etsy selectors and inline-translate customer and seller siblings', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/inline-translation';
    sandbox.location.href = 'https://www.etsy.com/messages/inline-translation';

    const row = { className: 'wt-grid' };
    const makeContainer = (id, direction, text, className = '') => {
        const inner = {
            id: '', className: '', innerText: text, textContent: text,
            closest: selector => selector === '[data-message-id]' ? container : selector === '.wt-grid' ? row : null,
        };
        const container = {
            id: '', className, innerText: '', textContent: '',
            matches: selector => selector === '[data-message-text]' ? false : selector === '.message-bubble',
            querySelector: selector => selector === '[data-message-text]' ? inner : null,
            querySelectorAll: selector => selector === '[data-message-text]' ? [inner] : [],
            closest: selector => {
                if (selector === '[data-message-id]') return container;
                if (selector === '.wt-grid') return row;
                if (selector.includes('[data-message-direction]')) return container;
                return null;
            },
            getAttribute: name => name === 'data-message-id' ? id : name === 'data-message-direction' ? direction : '',
        };
        return { container, inner };
    };
    const incoming = makeContainer('etsy-message-17', 'incoming', 'Hello there.');
    const outerIncoming = {
        className: 'message-bubble',
        closest: selector => selector === '.wt-grid' ? row : null,
        querySelectorAll: selector => selector === '[data-message-id]' ? [incoming.container] : [],
    };
    const legacySeller = makeContainer('etsy-message-18', '', 'Seller answer.', 'message-bubble surface-informational-subtle');
    const scopeForEntries = {
        querySelectorAll: selector => selector === api.MessageAdapter.bubbleSelector
            ? [outerIncoming, incoming.inner, legacySeller.inner]
            : [],
    };
    const descriptors = api.MessageAdapter.getMessageEntries(scopeForEntries);
    assert.equal(descriptors.length, 2);
    assert.equal(descriptors[0].id, 'etsy-message-17');
    assert.equal(descriptors[0].role, 'customer');
    assert.equal(descriptors[0].text, 'Hello there.');
    assert.equal(descriptors[0].container, incoming.container);
    assert.equal(descriptors[1].id, 'etsy-message-18');
    assert.equal(descriptors[1].role, 'seller', 'a legacy outgoing class on the canonical container must be retained');

    let multipartContainer;
    const nestedFragment = {
        className: '', innerText: 'nested detail.', textContent: 'nested detail.', parentElement: null,
        closest: selector => selector === '[data-message-id]' ? multipartContainer : selector === '.wt-grid' ? row : null,
    };
    const firstFragment = {
        className: '', innerText: 'First paragraph with nested detail.', textContent: 'First paragraph with nested detail.',
        parentElement: null,
        contains: node => node === nestedFragment,
        closest: selector => selector === '[data-message-id]' ? multipartContainer : selector === '.wt-grid' ? row : null,
    };
    const secondFragment = {
        className: '', innerText: 'Second paragraph.', textContent: 'Second paragraph.', parentElement: null,
        closest: selector => selector === '[data-message-id]' ? multipartContainer : selector === '.wt-grid' ? row : null,
    };
    multipartContainer = {
        id: '', className: '', innerText: '', textContent: '',
        matches: selector => selector === '[data-message-text]' ? false : selector === '.message-bubble',
        querySelector: selector => selector === '[data-message-text]' ? firstFragment : null,
        querySelectorAll: selector => selector === '[data-message-text]'
            ? [firstFragment, nestedFragment, secondFragment]
            : [],
        closest: selector => {
            if (selector === '[data-message-id]') return multipartContainer;
            if (selector === '.wt-grid') return row;
            if (selector.includes('[data-message-direction]')) return multipartContainer;
            return null;
        },
        getAttribute: name => name === 'data-message-id' ? 'etsy-message-multipart' : name === 'data-message-direction' ? 'incoming' : '',
    };
    firstFragment.parentElement = multipartContainer;
    nestedFragment.parentElement = firstFragment;
    secondFragment.parentElement = multipartContainer;
    const multipartScope = {
        querySelectorAll: selector => selector === api.MessageAdapter.bubbleSelector
            ? [firstFragment, nestedFragment, secondFragment]
            : [],
    };
    const multipartEntries = api.MessageAdapter.getMessageEntries(multipartScope);
    assert.equal(multipartEntries.length, 1);
    assert.equal(multipartEntries[0].text, 'First paragraph with nested detail.\n\nSecond paragraph.');

    const createdNodes = [];
    const createNode = () => {
        const attributes = new Map();
        const node = {
            nodeType: 1,
            className: '',
            textContent: '',
            children: [],
            parentNode: null,
            isConnected: true,
            setAttribute(name, value) { attributes.set(name, String(value)); },
            getAttribute(name) { return attributes.get(name) || ''; },
            append(...children) { this.children.push(...children); for (const child of children) child.parentNode = this; },
            appendChild(child) { this.append(child); },
            matches(selector) { return selector === '[data-mema-conversation-translation]' && attributes.has('data-mema-conversation-translation'); },
            closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest?.(selector) || null; },
            remove() {
                this.isConnected = false;
                if (this.parentNode?.children) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
                this.parentNode = null;
            },
        };
        createdNodes.push(node);
        return node;
    };
    sandbox.document.createElement = createNode;
    const makeSource = id => {
        const parent = {
            children: [],
            insertBefore(node, reference) {
                const index = reference ? this.children.indexOf(reference) : -1;
                if (index < 0) this.children.push(node); else this.children.splice(index, 0, node);
                node.parentNode = this;
                node.isConnected = true;
            },
            removeChild(node) { node.remove(); },
        };
        const source = { id, nodeType: 1, isConnected: true, parentNode: parent, parentElement: parent, nextSibling: null };
        parent.children.push(source);
        return source;
    };
    const firstSource = makeSource('first');
    const secondSource = makeSource('second');
    const sellerSource = makeSource('seller');
    const entries = [
        { id: 'first', role: 'customer', text: 'Same incoming text.', bubble: firstSource, container: firstSource, anchor: firstSource },
        { id: 'second', role: 'customer', text: 'Same incoming text.', bubble: secondSource, container: secondSource, anchor: secondSource },
        { id: 'seller', role: 'seller', text: 'Same incoming text.', bubble: sellerSource, container: sellerSource, anchor: sellerSource },
    ];
    const scope = { isConnected: true };
    api.MessageAdapter.getConversationScope = () => scope;
    api.MessageAdapter.getMessageEntries = () => entries;
    api.MessageAdapter.getMessages = () => entries.map(({ id, role, text }) => ({ id, role, text }));
    api.MessageAdapter.getTextarea = () => ({});
    api.Store.settings.autoTurkishPreview = true;
    api.Store.settings.translator = 'google';
    api.Store.settings.previewLanguage = 'tr';
    api.ConversationTranslations.clear();
    let translationCalls = 0;
    api.Translator.translate = async (text, target, options) => {
        translationCalls += 1;
        assert.equal(text, 'Same incoming text.');
        assert.equal(target, 'tr');
        assert.equal(options.logHistory, false);
        return { text: '<img onerror=alert(1)> Türkçe metin', detectedLanguage: 'en', provider: api.Store.settings.translator };
    };

    assert.equal(await api.ConversationTranslations.refresh(), true);
    assert.equal(translationCalls, 1, 'identical customer and seller messages should share one provider request');
    assert.equal(api.ConversationTranslations.records.size, 3, 'each customer and seller bubble needs its own sibling');
    assert.ok(api.ConversationTranslations.records.has(sellerSource), 'the seller-authored message must also receive a Turkish translation record');
    for (const record of api.ConversationTranslations.records.values()) {
        const ownerLabel = record.role === 'seller' ? 'Sizin mesajınız' : 'Müşteri mesajı';
        assert.equal(record.state, 'translated');
        assert.equal(record.target, 'tr');
        assert.ok(['customer', 'seller'].includes(record.role));
        assert.equal(record.node.getAttribute('data-mema-message-role'), record.role);
        assert.ok(record.node.className.includes(`mema-inline-translation--${record.role}`));
        assert.equal(record.body.getAttribute('lang'), 'tr');
        assert.equal(record.node.children[0].getAttribute('lang'), 'tr');
        assert.equal(record.node.children[0].textContent, `${ownerLabel} · Türkçe çeviri`);
        assert.equal(record.body.textContent, '<img onerror=alert(1)> Türkçe metin');
        assert.equal(record.node.parentNode, record.sourceNode.parentNode);
        assert.notEqual(record.node.parentNode, record.sourceNode, 'translation must never be inserted inside the source bubble');
    }
    assert.equal(await api.ConversationTranslations.refresh(), true);
    assert.equal(translationCalls, 1, 'a second refresh must reuse the completed inline translation');
    assert.equal(entries[0].text, 'Same incoming text.');

    const removedRecord = api.ConversationTranslations.records.get(firstSource);
    const removedNode = removedRecord.node;
    removedNode.remove();
    assert.equal(api.ConversationTranslations.mutationIsOwned({
        type: 'childList', target: firstSource.parentNode, addedNodes: [], removedNodes: [removedNode],
    }), false, 'unexpected removal of an owned sibling must trigger a repair scan');
    assert.equal(await api.ConversationTranslations.refresh(), true);
    assert.equal(translationCalls, 2);
    assert.notEqual(api.ConversationTranslations.records.get(firstSource).node, removedNode);
    assert.equal(api.ConversationTranslations.records.get(firstSource).node.isConnected, true);

    const recordBeforeMove = api.ConversationTranslations.records.get(firstSource);
    const oldParent = firstSource.parentNode;
    const movedParent = {
        children: [],
        insertBefore(node, reference) {
            const index = reference ? this.children.indexOf(reference) : -1;
            if (index < 0) this.children.push(node); else this.children.splice(index, 0, node);
            node.parentNode = this;
            node.isConnected = true;
        },
        removeChild(node) { node.remove(); },
    };
    oldParent.children = oldParent.children.filter(child => child !== firstSource);
    movedParent.children.push(firstSource);
    firstSource.parentNode = movedParent;
    firstSource.parentElement = movedParent;
    assert.equal(await api.ConversationTranslations.refresh(), true);
    assert.equal(translationCalls, 3);
    const recordAfterMove = api.ConversationTranslations.records.get(firstSource);
    assert.notEqual(recordAfterMove.node, recordBeforeMove.node);
    assert.equal(recordBeforeMove.node.isConnected, false);
    assert.deepEqual(movedParent.children.slice(0, 2), [firstSource, recordAfterMove.node]);

    const recordBeforeBodyRemoval = api.ConversationTranslations.records.get(secondSource);
    const removedBody = recordBeforeBodyRemoval.body;
    removedBody.remove();
    assert.equal(api.ConversationTranslations.mutationIsOwned({
        type: 'childList', target: recordBeforeBodyRemoval.node, addedNodes: [], removedNodes: [removedBody],
    }), false, 'removing the owned record body must trigger a repair scan');
    assert.equal(await api.ConversationTranslations.refresh(), true);
    assert.equal(translationCalls, 4);
    const recordAfterBodyRemoval = api.ConversationTranslations.records.get(secondSource);
    assert.notEqual(recordAfterBodyRemoval.node, recordBeforeBodyRemoval.node);
    assert.notEqual(recordAfterBodyRemoval.body, removedBody);
    assert.equal(recordAfterBodyRemoval.body.parentNode, recordAfterBodyRemoval.node);

    api.Store.settings.translator = 'deepl';
    assert.equal(await api.ConversationTranslations.refresh(), true);
    assert.equal(translationCalls, 5, 'provider policy changes must rebuild all three siblings with one deduplicated request');
    assert.ok([...api.ConversationTranslations.records.values()].every(record => record.policy.includes('deepl')));

    const turkishSellerSource = makeSource('seller-tr');
    entries.push({
        id: 'seller-tr', role: 'seller', text: 'Teşekkür ederim.',
        bubble: turkishSellerSource, container: turkishSellerSource, anchor: turkishSellerSource,
    });
    let turkishDetectionCalls = 0;
    api.Translator.translate = async (text, target, options) => {
        turkishDetectionCalls += 1;
        assert.equal(text, 'Teşekkür ederim.');
        assert.equal(target, 'tr');
        assert.equal(options.logHistory, false);
        return { text, detectedLanguage: 'tr', provider: 'deepl' };
    };
    assert.equal(await api.ConversationTranslations.refresh(), true);
    const turkishSellerRecord = api.ConversationTranslations.records.get(turkishSellerSource);
    assert.equal(turkishSellerRecord.state, 'source-target');
    assert.equal(turkishSellerRecord.node, null, 'an already-Turkish seller message needs no redundant note');
    assert.equal(await api.ConversationTranslations.refresh(), true);
    assert.equal(turkishDetectionCalls, 1, 'the Turkish source sentinel prevents repeat provider requests');

    const previousTranslationNodes = [...api.ConversationTranslations.records.values()]
        .map(record => record.node)
        .filter(Boolean);
    api.Store.settings.previewLanguage = 'de';
    let germanTranslationCalls = 0;
    api.Translator.translate = async (text, target, options) => {
        germanTranslationCalls += 1;
        assert.equal(target, 'de');
        assert.equal(options.logHistory, false);
        if (text === 'Teşekkür ederim.') {
            return { text: 'Vielen Dank.', detectedLanguage: 'tr', provider: 'deepl' };
        }
        assert.equal(text, 'Same incoming text.');
        return { text: 'Derselbe eingehende Text.', detectedLanguage: 'en', provider: 'deepl' };
    };
    assert.equal(await api.ConversationTranslations.refresh(), true);
    assert.equal(germanTranslationCalls, 2, 'a new display language must request each unique source text in that language');
    assert.ok(previousTranslationNodes.every(node => node.isConnected === false), 'changing the display language must remove stale translation notes');
    for (const record of api.ConversationTranslations.records.values()) {
        const ownerLabel = record.role === 'seller' ? 'Sizin mesajınız' : 'Müşteri mesajı';
        assert.equal(record.state, 'translated');
        assert.equal(record.target, 'de');
        assert.equal(record.body.getAttribute('lang'), 'de');
        assert.equal(record.node.children[0].getAttribute('lang'), 'tr');
        assert.equal(record.node.children[0].textContent, `${ownerLabel} · Almanca çeviri`);
    }
    assert.equal(api.ConversationTranslations.records.get(turkishSellerSource).body.textContent, 'Vielen Dank.', 'a Turkish source must be translated when German is selected');
    assert.equal(await api.ConversationTranslations.refresh(), true);
    assert.equal(germanTranslationCalls, 2, 'completed translations in the selected language must be reused');

    const germanSellerSource = makeSource('seller-de');
    entries.push({
        id: 'seller-de', role: 'seller', text: 'Danke schön.',
        bubble: germanSellerSource, container: germanSellerSource, anchor: germanSellerSource,
    });
    let germanDetectionCalls = 0;
    api.Translator.translate = async (text, target, options) => {
        germanDetectionCalls += 1;
        assert.equal(text, 'Danke schön.');
        assert.equal(target, 'de');
        assert.equal(options.logHistory, false);
        return { text, detectedLanguage: 'de-DE', provider: 'deepl' };
    };
    assert.equal(await api.ConversationTranslations.refresh(), true);
    const germanSellerRecord = api.ConversationTranslations.records.get(germanSellerSource);
    assert.equal(germanSellerRecord.state, 'source-target');
    assert.equal(germanSellerRecord.node, null, 'a source already in the selected language needs no redundant note');
    assert.equal(await api.ConversationTranslations.refresh(), true);
    assert.equal(germanDetectionCalls, 1, 'the selected-language source sentinel prevents repeat provider requests');

    api.Store.settings.previewLanguage = 'zu';
    api.Store.settings.freeFallback = false;
    let unsupportedTargetCalls = 0;
    api.Translator.translate = async () => {
        unsupportedTargetCalls += 1;
        throw new Error('the provider must not be called for an unsupported target');
    };
    assert.equal(await api.ConversationTranslations.refresh(), true);
    assert.equal(unsupportedTargetCalls, 0, 'unsupported DeepL targets must be rejected before provider work starts');
    for (const record of api.ConversationTranslations.records.values()) {
        const ownerLabel = record.role === 'seller' ? 'Sizin mesajınız' : 'Müşteri mesajı';
        assert.equal(record.state, 'error');
        assert.equal(record.target, 'zu');
        assert.equal(record.node.children[0].textContent, `${ownerLabel} · Zulu çeviri`);
        assert.equal(record.body.getAttribute('lang'), 'tr', 'a Turkish provider error must not be announced as translated content');
        assert.match(record.body.textContent, /DeepL Zulu hedef dilini desteklemiyor/);
    }

    entries.splice(1);
    api.Store.settings.previewLanguage = 'fr';
    let releaseFrench;
    const frenchGate = new Promise(resolve => { releaseFrench = resolve; });
    let frenchCalls = 0;
    api.Translator.translate = async (_text, target) => {
        frenchCalls += 1;
        assert.equal(target, 'fr');
        await frenchGate;
        return { text: 'Ancienne traduction française.', detectedLanguage: 'en', provider: 'deepl' };
    };
    const staleFrenchRefresh = api.ConversationTranslations.refresh();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(frenchCalls, 1);
    const staleFrenchNode = api.ConversationTranslations.records.get(firstSource).node;
    api.Store.settings.previewLanguage = 'es';
    releaseFrench();
    assert.equal(await staleFrenchRefresh, false, 'a language change must invalidate an in-flight inline translation');
    assert.equal(api.ConversationTranslations.records.get(firstSource).state, 'loading', 'the stale provider result must not update the note');

    let spanishCalls = 0;
    api.Translator.translate = async (_text, target) => {
        spanishCalls += 1;
        assert.equal(target, 'es');
        return { text: 'Nuevo texto traducido.', detectedLanguage: 'en', provider: 'deepl' };
    };
    assert.equal(await api.ConversationTranslations.refresh(), true);
    assert.equal(spanishCalls, 1);
    const spanishRecord = api.ConversationTranslations.records.get(firstSource);
    assert.equal(staleFrenchNode.isConnected, false);
    assert.equal(spanishRecord.target, 'es');
    assert.equal(spanishRecord.node.children[0].textContent, 'Müşteri mesajı · İspanyolca çeviri');
    assert.equal(spanishRecord.body.getAttribute('lang'), 'es');
    assert.equal(spanishRecord.body.textContent, 'Nuevo texto traducido.');

    api.Store.settings.autoTurkishPreview = false;
    assert.equal(await api.ConversationTranslations.refresh(), false);
    assert.equal(api.ConversationTranslations.records.size, 0);
    assert.ok(createdNodes.filter(node => node.getAttribute('data-mema-conversation-translation')).every(node => node.isConnected === false));
});

test('translator shares an in-flight exact request without merging distinct source text', async () => {
    const { api } = await loadAssistant();
    api.Store.settings.translator = 'google';
    let requests = 0;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    api.Translator.google = async text => {
        requests += 1;
        await gate;
        return { text: `TR:${text}`, detectedLanguage: 'en', provider: 'google' };
    };

    const first = api.Translator.translate('Exact shared text', 'tr', { logHistory: false });
    const second = api.Translator.translate('Exact shared text', 'tr', { logHistory: false });
    const distinct = api.Translator.translate('Exact shared text🙂', 'tr', { logHistory: false });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(requests, 2);
    release();
    assert.equal((await first).text, 'TR:Exact shared text');
    assert.equal((await second).text, 'TR:Exact shared text');
    assert.equal((await distinct).text, 'TR:Exact shared text🙂');
    assert.equal(api.Translator.inflight.size, 0);
});

test('manual target language survives detection when automatic customer-language replies are disabled', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/conversation-1';
    sandbox.location.href = 'https://www.etsy.com/messages/conversation-1';
    const context = {
        conversationId: api.Router.conversationId(),
        routeFingerprint: api.Router.routeFingerprint(),
        lastCustomerMessage: 'Hola, necesito ayuda.',
        messages: [],
    };
    api.MessageAdapter.context = () => context;
    api.Translator.translate = async () => ({ text: 'Merhaba, yardıma ihtiyacım var.', detectedLanguage: 'es', provider: 'google' });
    api.Verification.invalidate = () => {};
    api.Campaign.current = () => null;
    api.Store.settings.autoTurkishPreview = true;
    api.UI.state.context = null;
    api.UI.state.targetLanguage = 'de';

    api.Store.settings.replyInCustomerLanguage = false;
    await api.UI.refreshMessages();
    assert.equal(api.UI.state.targetLanguage, 'de');
    assert.match(api.Prompt.system('reply', { preferences: { target_language: 'de' } }), /hedef dil.*de/i);
    assert.doesNotMatch(api.Prompt.system('reply', { preferences: { target_language: 'de' } }), /son anlamlı mesajıyla aynı dilde/i);

    api.Store.settings.replyInCustomerLanguage = true;
    api.UI.state.context = null;
    api.UI.state.targetLanguage = 'de';
    await api.UI.refreshMessages();
    assert.equal(api.UI.state.targetLanguage, 'es');
    assert.match(api.Prompt.system('reply', { preferences: { target_language: 'de' } }), /son anlamlı mesajıyla aynı dilde/i);
});

test('automatic customer-language mode resolves each conversation without reusing a stale target', async () => {
    const { api, sandbox } = await loadAssistant();
    let currentContext;
    const setConversation = (id, lastCustomerMessage) => {
        sandbox.location.pathname = `/messages/${id}`;
        sandbox.location.href = `https://www.etsy.com/messages/${id}`;
        currentContext = {
            conversationId: api.Router.conversationId(),
            routeFingerprint: api.Router.routeFingerprint(),
            customerName: 'Buyer',
            orderId: '',
            itemTitle: '',
            lastCustomerMessage,
            messages: [{ role: 'customer', text: lastCustomerMessage }],
        };
    };
    const calls = [];
    api.MessageAdapter.context = () => currentContext;
    api.Translator.translate = async (text, target) => {
        calls.push({ text, target });
        if (text.includes('Hallo') && target === 'tr') throw new Error('language detection failed');
        const detectedLanguage = text.includes('Hola') ? 'es' : text.includes('Bonjour') ? 'fr' : 'tr';
        return { text: `translated:${target}`, detectedLanguage, provider: 'google' };
    };
    api.Verification.invalidate = () => {};
    api.Campaign.current = () => null;
    api.UI.setBusy = () => {};
    api.UI.toast = () => {};
    api.Store.settings.replyInCustomerLanguage = true;
    api.Store.settings.autoTurkishPreview = true;
    api.UI.state.context = null;

    setConversation('spanish', 'Hola, necesito ayuda.');
    await api.UI.refreshMessages();
    assert.equal(api.UI.state.targetLanguage, 'es');

    api.Store.settings.autoTurkishPreview = false;
    setConversation('french', 'Bonjour, je voudrais de l’aide.');
    await api.UI.refreshMessages();
    assert.equal(api.UI.state.targetLanguage, '', 'a new conversation must clear the previous detected language');

    api.UI.state.draftTr = 'Yardımcı olabilirim.';
    await api.UI.generateReply({ method: 'free', replyMode: 'free' });

    assert.equal(api.UI.state.targetLanguage, 'fr');
    assert.ok(calls.some(call => call.text.includes('Bonjour') && call.target === 'tr'));
    assert.ok(calls.some(call => call.text === 'Yardımcı olabilirim.' && call.target === 'fr'));

    api.Store.settings.autoTurkishPreview = true;
    setConversation('german', 'Hallo, ich brauche Hilfe.');
    await api.UI.refreshMessages();
    assert.equal(api.UI.state.targetLanguage, '', 'failed detection must leave no previous-conversation target');

    api.UI.state.draftTr = 'Elbette yardımcı olurum.';
    await api.UI.generateReply({ method: 'free', replyMode: 'free' });
    assert.equal(api.UI.state.targetLanguage, 'en');
    assert.ok(calls.some(call => call.text === 'Elbette yardımcı olurum.' && call.target === 'en'));
});

test('English prompt preference switches between US and neutral English without stale US instructions', async () => {
    const { api } = await loadAssistant();
    api.Store.settings.replyInCustomerLanguage = true;

    api.Store.settings.preferUsEnglish = true;
    const usPrompt = api.Prompt.system('reply', { preferences: { target_language: 'en' } });
    assert.match(usPrompt, /Amerikan İngilizcesi|en-US/i);

    api.Store.settings.preferUsEnglish = false;
    const neutralPrompt = api.Prompt.system('reply', { preferences: { target_language: 'en' } });
    assert.match(neutralPrompt, /nötr|genel İngilizce/i);
    assert.doesNotMatch(neutralPrompt, /Amerikan İngilizcesi|en-US/i);
});

test('secret-free config export omits every API key and import preserves existing keys', async () => {
    const { api } = await loadAssistant();
    const exportedDeepLKey = 'deepl-export-secret';
    const exportedMessageCenterToken = 'message-center-export-secret';
    const exportedProviderKeys = {};

    api.Store.settings = {
        ...api.Store.settings,
        deeplApiKey: exportedDeepLKey,
        messageCenterAgentToken: exportedMessageCenterToken,
        configIncludeSecrets: true,
    };
    for (const [id, profile] of Object.entries(api.Store.providers)) {
        exportedProviderKeys[id] = `${id}-export-secret`;
        api.Store.providers[id] = { ...profile, apiKey: exportedProviderKeys[id] };
    }

    const safeSnapshot = api.ConfigManager.snapshot(false);
    assert.equal(safeSnapshot.includesApiKeys, false);
    assert.equal(safeSnapshot.settings.configIncludeSecrets, false);
    assert.equal(safeSnapshot.settings.deeplApiKey, '');
    assert.equal(safeSnapshot.settings.messageCenterAgentToken, '');
    for (const profile of Object.values(safeSnapshot.providers)) assert.equal(profile.apiKey, '');
    const serializedSnapshot = JSON.stringify(safeSnapshot);
    assert.equal(serializedSnapshot.includes(exportedDeepLKey), false);
    assert.equal(serializedSnapshot.includes(exportedMessageCenterToken), false);
    for (const apiKey of Object.values(exportedProviderKeys)) assert.equal(serializedSnapshot.includes(apiKey), false);

    const currentDeepLKey = 'deepl-current-secret';
    const currentMessageCenterToken = 'message-center-current-secret';
    const currentProviderKeys = {};
    api.Store.settings = {
        ...api.Store.settings,
        deeplApiKey: currentDeepLKey,
        messageCenterAgentToken: currentMessageCenterToken,
    };
    for (const [id, profile] of Object.entries(api.Store.providers)) {
        currentProviderKeys[id] = `${id}-current-secret`;
        api.Store.providers[id] = { ...profile, apiKey: currentProviderKeys[id] };
    }
    safeSnapshot.settings.defaultTone = 'formal';

    await api.ConfigManager.importText(JSON.stringify(safeSnapshot));

    assert.equal(api.Store.settings.defaultTone, 'formal');
    assert.equal(api.Store.settings.deeplApiKey, currentDeepLKey);
    assert.equal(api.Store.settings.messageCenterAgentToken, currentMessageCenterToken);
    for (const [id, apiKey] of Object.entries(currentProviderKeys)) {
        assert.equal(api.Store.providers[id].apiKey, apiKey);
    }
});

test('config import rejects malformed settings and provider types before changing any state', async () => {
    const malformedPayloads = [
        { settings: [], providers: {} },
        { settings: { openOnMessagePage: 'false' }, providers: {} },
        { settings: { retainHistoryDays: '90' }, providers: {} },
        { settings: { translator: 'not-a-translator' }, providers: {} },
        { settings: { aiProvider: 'not-an-ai-provider' }, providers: {} },
        { settings: { defaultReplyMethod: 'not-a-method' }, providers: {} },
        { settings: { retainHistoryDays: 0 }, providers: {} },
        { settings: { updateCheckHours: 169 }, providers: {} },
        { settings: { messageCenterSyncSeconds: 4 }, providers: {} },
        { settings: { messageCenterPollSeconds: 61 }, providers: {} },
        { settings: { messageCenterUrl: 'javascript:alert(1)' }, providers: {} },
        { settings: { defaultDeliveredTemplateId: 'invalid template id' }, providers: {} },
        { settings: {}, providers: [] },
        { settings: {}, providers: { openai: 'not-a-provider-profile' } },
        { settings: {}, providers: { openai: { apiKey: 123 } } },
        { settings: {}, providers: { openai: { models: ['gpt-5.6-luna', 42] } } },
        { settings: { shopName: 'Must not be saved' }, providers: {}, onboarding: [] },
    ];

    for (const malformed of malformedPayloads) {
        const { api, storage } = await loadAssistant();
        api.Store.settings = { ...api.Store.settings, shopName: 'Before import' };
        api.Store.providers.openai = {
            ...api.Store.providers.openai,
            apiKey: 'keep-this-key',
            model: 'gpt-5.6-luna',
        };
        const beforeSettings = copy(api.Store.settings);
        const beforeProviders = copy(api.Store.providers);
        const beforeStorage = copy(Object.fromEntries(storage));

        await assert.rejects(
            api.ConfigManager.importText(JSON.stringify({
                app: api.APP.id,
                schemaVersion: api.APP.configSchema,
                ...malformed,
            })),
            /config/i,
        );

        assert.deepEqual(copy(api.Store.settings), beforeSettings);
        assert.deepEqual(copy(api.Store.providers), beforeProviders);
        assert.deepEqual(copy(Object.fromEntries(storage)), beforeStorage);
    }
});

test('config import rejects future schemas before changing any state', async () => {
    const { api, storage } = await loadAssistant();
    api.Store.settings = { ...api.Store.settings, shopName: 'Before future import' };
    api.Store.templates = [...api.Store.templates, {
        id: 'tpl-existing-custom', name: 'Existing custom', text: 'Keep me', archived: false,
    }];
    const beforeSettings = copy(api.Store.settings);
    const beforeTemplates = copy(api.Store.templates);
    const beforeStorage = copy(Object.fromEntries(storage));

    await assert.rejects(
        api.ConfigManager.importText(JSON.stringify({
            app: api.APP.id,
            schemaVersion: api.APP.configSchema + 1,
            settings: { shopName: 'Must not be imported', futureSetting: true },
            providers: {},
            templates: [{ id: 'tpl-future', name: 'Future', text: 'Future template' }],
        })),
        /schema|sürüm|config/i,
    );

    assert.deepEqual(copy(api.Store.settings), beforeSettings);
    assert.deepEqual(copy(api.Store.templates), beforeTemplates);
    assert.deepEqual(copy(Object.fromEntries(storage)), beforeStorage);
});

test('config import atomically rejects noninteger schema versions', async () => {
    for (const schemaVersion of [6.5, '6.5', 'future']) {
        const { api, storage } = await loadAssistant();
        api.Store.settings = { ...api.Store.settings, shopName: 'Before malformed schema import' };
        const beforeSettings = copy(api.Store.settings);
        const beforeProviders = copy(api.Store.providers);
        const beforeTemplates = copy(api.Store.templates);
        const beforeStorage = copy(Object.fromEntries(storage));

        await assert.rejects(
            api.ConfigManager.importText(JSON.stringify({
                app: api.APP.id,
                schemaVersion,
                settings: { shopName: 'Must not be imported' },
                providers: {},
                templates: [{ id: 'tpl-malformed-schema', name: 'No import', text: 'No import' }],
            })),
            /schema|config/i,
        );

        assert.deepEqual(copy(api.Store.settings), beforeSettings);
        assert.deepEqual(copy(api.Store.providers), beforeProviders);
        assert.deepEqual(copy(api.Store.templates), beforeTemplates);
        assert.deepEqual(copy(Object.fromEntries(storage)), beforeStorage);
    }
});

test('config import validates every template before any write and preserves existing custom templates', async () => {
    const invalidTemplatePayloads = [
        {},
        [null],
        [[]],
        [{ id: 'tpl-invalid', name: 42, text: 'Text' }],
        [{ id: 'tpl-invalid', name: 'Name', text: 42 }],
        [{ id: 'tpl-invalid', name: 'Name', text: 'Text', archived: 'false' }],
        [{ id: 'tpl-invalid', name: 'Name', text: 'Text', tone: 'not-a-tone' }],
        [{ id: 'tpl-invalid', name: 'Name', text: 'Text', language: 42 }],
        [{ id: 'tpl-invalid', name: 'Name', text: 'Text', purpose: 'not-a-purpose' }],
        [{ id: 'tpl-invalid', name: 'Name', text: 'Text', unexpectedField: true }],
        [{ id: 'tpl-invalid', name: '   ', text: 'Text' }],
        [{ id: 'tpl-invalid', name: 'Name', text: '\n\t' }],
    ];

    for (const templates of invalidTemplatePayloads) {
        const { api, storage } = await loadAssistant();
        api.Store.settings = { ...api.Store.settings, shopName: 'Before template import' };
        api.Store.templates = [...api.Store.templates, {
            id: 'tpl-existing-custom', name: 'Existing custom', text: 'Keep me', archived: false,
        }];
        const beforeSettings = copy(api.Store.settings);
        const beforeTemplates = copy(api.Store.templates);
        const beforeStorage = copy(Object.fromEntries(storage));

        await assert.rejects(
            api.ConfigManager.importText(JSON.stringify({
                app: api.APP.id,
                schemaVersion: api.APP.configSchema,
                settings: { shopName: 'Must not be imported' },
                providers: {},
                templates,
            })),
            /templates?/i,
        );

        assert.deepEqual(copy(api.Store.settings), beforeSettings);
        assert.deepEqual(copy(api.Store.templates), beforeTemplates);
        assert.deepEqual(copy(Object.fromEntries(storage)), beforeStorage);
    }

    const { api, storage } = await loadAssistant();
    const custom = { id: 'tpl-existing-custom', name: 'Existing custom', text: 'Keep me', archived: false };
    await api.Store.saveTemplates([...api.Store.templates, custom]);
    await api.ConfigManager.importText(JSON.stringify({
        app: api.APP.id,
        schemaVersion: api.APP.configSchema,
        settings: { shopName: 'Valid import' },
        providers: {},
        templates: [],
    }));
    assert.equal(api.Store.settings.shopName, 'Valid import');
    assert.equal(api.Store.templates.find(item => item.id === custom.id)?.text, custom.text);
    assert.equal(storage.get(api.KEYS.templates).find(item => item.id === custom.id)?.text, custom.text);
});

test('stored and directly saved settings normalize malformed values fail-safe', async () => {
    const { api, storage } = await loadAssistant();
    storage.set(api.KEYS.settings, {
        ...api.DEFAULT_SETTINGS,
        autoSendCampaign: 'false',
        openOnMessagePage: 'true',
        messageCenterEnabled: 'false',
        translator: 'not-a-translator',
        aiProvider: 'not-an-ai-provider',
        defaultReplyMethod: 'not-a-method',
        retainHistoryDays: -40,
        updateCheckHours: 999,
        messageCenterSyncSeconds: '5',
        messageCenterPollSeconds: 100,
        messageCenterUrl: 'javascript:alert(1)',
    });
    storage.set(api.KEYS.configMeta, { schemaVersion: api.APP.configSchema, updatedAt: '' });

    await api.Store.load();

    assert.equal(api.Store.settings.autoSendCampaign, false);
    assert.equal(api.Store.settings.openOnMessagePage, false);
    assert.equal(api.Store.settings.messageCenterEnabled, false);
    assert.equal(api.Store.settings.translator, api.DEFAULT_SETTINGS.translator);
    assert.equal(api.Store.settings.aiProvider, api.DEFAULT_SETTINGS.aiProvider);
    assert.equal(api.Store.settings.defaultReplyMethod, api.DEFAULT_SETTINGS.defaultReplyMethod);
    assert.equal(api.Store.settings.retainHistoryDays, 1);
    assert.equal(api.Store.settings.updateCheckHours, 168);
    assert.equal(api.Store.settings.messageCenterSyncSeconds, api.DEFAULT_SETTINGS.messageCenterSyncSeconds);
    assert.equal(api.Store.settings.messageCenterPollSeconds, 60);
    assert.equal(api.Store.settings.messageCenterUrl, api.DEFAULT_SETTINGS.messageCenterUrl);
    assert.equal(api.campaignAutoSendAllowed({ purpose: 'delivery_followup' }), false);

    await api.Store.saveSettings({
        ...api.DEFAULT_SETTINGS,
        autoSendCampaign: 'true',
        openOnMessagePage: 'true',
        messageCenterEnabled: 'true',
        retainHistoryDays: 999,
        messageCenterSyncSeconds: -10,
    });
    assert.equal(api.Store.settings.autoSendCampaign, false);
    assert.equal(api.Store.settings.openOnMessagePage, false);
    assert.equal(api.Store.settings.messageCenterEnabled, false);
    assert.equal(api.Store.settings.retainHistoryDays, 365);
    assert.equal(api.Store.settings.messageCenterSyncSeconds, 5);
    assert.deepEqual(copy(storage.get(api.KEYS.settings)), copy(api.Store.settings));
});

test('loading an already-current schema does not rewrite config metadata or stored records', async () => {
    const { api, storage } = await loadAssistant();
    const updatedAt = '2026-08-28T12:00:00.000Z';
    storage.set(api.KEYS.settings, copy(api.Store.settings));
    storage.set(api.KEYS.providers, copy(api.Store.providers));
    storage.set(api.KEYS.templates, copy(api.Store.templates));
    storage.set(api.KEYS.history, []);
    storage.set(api.KEYS.statuses, copy(api.Store.statuses));
    storage.set(api.KEYS.campaign, null);
    storage.set(api.KEYS.configMeta, { schemaVersion: api.APP.configSchema, updatedAt });
    storage.set(api.KEYS.onboarding, copy(api.Store.onboarding));
    storage.set(api.KEYS.update, copy(api.Store.update));
    const writes = [];
    const originalSet = api.GMX.set;
    api.GMX.set = async (key, value) => {
        writes.push(key);
        return originalSet(key, value);
    };
    try {
        await api.Store.load();
    } finally {
        api.GMX.set = originalSet;
    }
    assert.deepEqual(writes, []);
    assert.equal(api.Store.configMeta.updatedAt, updatedAt);
    assert.deepEqual(storage.get(api.KEYS.configMeta), { schemaVersion: api.APP.configSchema, updatedAt });
});

test('current-schema malformed provider records normalize safely in runtime without rewriting storage', async () => {
    const { api, storage } = await loadAssistant();
    const malformedProviders = {
        ...copy(api.Store.providers),
        openai: { apiKey: { leaked: true }, model: 42, models: 'not-an-array', modelsFetchedAt: ['bad'] },
    };
    storage.set(api.KEYS.providers, copy(malformedProviders));
    storage.set(api.KEYS.configMeta, { schemaVersion: api.APP.configSchema, updatedAt: '2026-08-28T14:00:00.000Z' });
    const writes = [];
    const originalSet = api.GMX.set;
    api.GMX.set = async (key, value) => { writes.push(key); return originalSet(key, value); };
    try {
        await api.Store.load();
    } finally {
        api.GMX.set = originalSet;
    }
    const profile = api.Store.providers.openai;
    assert.equal(typeof profile.apiKey, 'string');
    assert.equal(typeof profile.model, 'string');
    assert.ok(Array.isArray(profile.models));
    assert.ok(profile.models.every(item => typeof item === 'string'));
    assert.equal(typeof profile.modelsFetchedAt, 'string');
    assert.deepEqual(storage.get(api.KEYS.providers), malformedProviders);
    assert.deepEqual(writes, []);
});

test('config import provider-write failure preserves the complete runtime and storage bundle', async () => {
    const { api, storage } = await loadAssistant();
    for (const [key, value] of [
        [api.KEYS.settings, api.Store.settings],
        [api.KEYS.providers, api.Store.providers],
        [api.KEYS.templates, api.Store.templates],
        [api.KEYS.onboarding, api.Store.onboarding],
        [api.KEYS.configMeta, api.Store.configMeta],
    ]) storage.set(key, copy(value));
    const beforeRuntime = {
        settings: copy(api.Store.settings), providers: copy(api.Store.providers), templates: copy(api.Store.templates),
        onboarding: copy(api.Store.onboarding), configMeta: copy(api.Store.configMeta),
    };
    const beforeStorage = copy(Object.fromEntries(storage));
    const originalSet = api.GMX.set;
    api.GMX.set = async (key, value) => {
        if (key === api.KEYS.providers && value?.openai?.apiKey === 'import-provider-write-failure') {
            throw new Error('injected imported provider write failure');
        }
        return originalSet(key, value);
    };
    try {
        await assert.rejects(api.ConfigManager.importText(JSON.stringify({
            app: api.APP.id,
            schemaVersion: api.APP.configSchema,
            settings: { shopName: 'Import must not partially persist' },
            providers: { openai: { apiKey: 'import-provider-write-failure' } },
            templates: [{ id: 'imported-template', name: 'Should not persist', text: 'Hello' }],
            onboarding: { completed: true, completedAt: '2026-08-28T14:00:00.000Z' },
        })), /injected imported provider write failure/);
    } finally {
        api.GMX.set = originalSet;
    }
    assert.deepEqual({
        settings: copy(api.Store.settings), providers: copy(api.Store.providers), templates: copy(api.Store.templates),
        onboarding: copy(api.Store.onboarding), configMeta: copy(api.Store.configMeta),
    }, beforeRuntime);
    assert.deepEqual(copy(Object.fromEntries(storage)), beforeStorage);
});

test('config import rejects prototype-pollution keys before changing any state', async () => {
    const { api, storage } = await loadAssistant();
    const base = `"app":${JSON.stringify(api.APP.id)},"schemaVersion":${api.APP.configSchema}`;
    const maliciousPayloads = [
        `{${base},"settings":{},"providers":{},"__proto__":{"polluted":true}}`,
        `{${base},"settings":{"constructor":"polluted"},"providers":{}}`,
        `{${base},"settings":{},"providers":{"prototype":{"polluted":true}}}`,
        `{${base},"settings":{},"providers":{"openai":{"__proto__":{"polluted":true}}}}`,
    ];
    const beforeSettings = copy(api.Store.settings);
    const beforeProviders = copy(api.Store.providers);

    for (const text of maliciousPayloads) {
        await assert.rejects(api.ConfigManager.importText(text), /config/i);
        assert.deepEqual(copy(api.Store.settings), beforeSettings);
        assert.deepEqual(copy(api.Store.providers), beforeProviders);
        assert.equal(storage.size, 0);
        assert.equal({}.polluted, undefined);
    }
});

test('config import ignores retired and unknown fields while accepting valid legacy profiles', async () => {
    const { api } = await loadAssistant();

    await api.ConfigManager.importText(JSON.stringify({
        app: api.APP.id,
        schemaVersion: 2,
        settings: {
            shopName: 'Legacy Shop',
            gatewayUrl: 'https://retired.example.invalid',
            deviceToken: 'retired-token',
            futureSetting: { nested: 'ignored' },
        },
        providers: {
            openai: {
                apiKey: '',
                model: 'gpt-4o-mini',
                models: ['gpt-4o-mini'],
                modelsFetchedAt: '2026-08-01T00:00:00.000Z',
                futureProviderField: { nested: 'ignored' },
            },
            futureProvider: { model: { nested: 'ignored' } },
        },
    }));

    assert.equal(api.Store.settings.shopName, 'Legacy Shop');
    assert.equal('gatewayUrl' in api.Store.settings, false);
    assert.equal('deviceToken' in api.Store.settings, false);
    assert.equal('futureSetting' in api.Store.settings, false);
    assert.equal(api.Store.providers.openai.model, 'gpt-4o-mini');
    assert.deepEqual(copy(api.Store.providers.openai.models), ['gpt-4o-mini']);
    assert.equal('futureProviderField' in api.Store.providers.openai, false);
    assert.equal('futureProvider' in api.Store.providers, false);
});

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

function installStandaloneNativeDispatchFixture(environment, options = {}) {
    const { api, sandbox } = environment;
    const conversationId = options.conversationId || 'conversation-a';
    const text = options.text || 'Standalone durable native reply';
    sandbox.location.pathname = `/messages/${conversationId}`;
    sandbox.location.search = '';
    sandbox.location.href = `https://www.etsy.com/messages/${conversationId}`;
    const scope = { id: `${conversationId}-scope`, querySelectorAll: () => [] };
    const textarea = { value: text, offsetParent: {} };
    const button = makeNativeSendButton(options.onClick || (() => {}));
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.getConversationScope = () => scope;
    api.MessageAdapter.getSendButton = () => button;
    api.MessageAdapter.context = () => ({
        conversationId,
        customerName: options.customerName || 'Ashley',
        orderId: options.orderId ?? 'native-order-a',
    });
    api.MessageAdapter.countOutgoing = () => Number(options.outgoingMatches || 0);
    api.Verification.waitForPendingOutgoing = options.waitForPendingOutgoing || (async () => true);
    api.UI.toast = () => {};
    api.UI.refreshCurrent = async () => {};
    const guard = api.Verification.beginNativeDispatchGuard();
    assert.ok(guard, 'standalone native fixture must create an exact dispatch guard');
    return { button, guard, scope, textarea };
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
    storage.set(api.KEYS.templates, copy(legacyTemplates));
    storage.set(api.KEYS.configMeta, copy(api.Store.configMeta));

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
    assert.equal(api.Store.configMeta.schemaVersion, api.APP.configSchema);
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

test('config import keeps legacy auto-open settings fail-closed but honors current-schema opt-in', async () => {
    const legacy = await loadAssistant();
    await legacy.api.ConfigManager.importText(JSON.stringify({
        app: legacy.api.APP.id,
        schemaVersion: 5,
        settings: { openOnMessagePage: true },
        providers: {},
    }));

    assert.equal(legacy.api.Store.settings.openOnMessagePage, false);
    assert.equal(legacy.storage.get(legacy.api.KEYS.settings).openOnMessagePage, false);

    const current = await loadAssistant();
    await current.api.ConfigManager.importText(JSON.stringify({
        app: current.api.APP.id,
        schemaVersion: current.api.APP.configSchema,
        settings: { openOnMessagePage: true },
        providers: {},
    }));

    assert.equal(current.api.Store.settings.openOnMessagePage, true);
    assert.equal(current.storage.get(current.api.KEYS.settings).openOnMessagePage, true);
});

test('reserved review-request template imports stay fail-closed without losing user content', async () => {
    for (const importedPurpose of [undefined, 'delivery_followup']) {
        const { api, storage } = await loadAssistant();
        const importedTemplate = {
            id: 'tpl-review-request',
            name: `My protected review template ${importedPurpose || 'missing'}`,
            category: 'My category',
            tone: 'short',
            language: 'en',
            shortcut: '/my-review',
            text: `Keep this user-authored text (${importedPurpose || 'missing'}).`,
            archived: true,
        };
        if (importedPurpose) importedTemplate.purpose = importedPurpose;

        await api.ConfigManager.importText(JSON.stringify({
            app: api.APP.id,
            schemaVersion: api.APP.configSchema,
            settings: {},
            providers: {},
            templates: [importedTemplate],
        }));

        const protectedTemplate = api.Store.templates.find((item) => item.id === 'tpl-review-request');
        assert.equal(protectedTemplate.purpose, 'review_request');
        assert.equal(protectedTemplate.name, importedTemplate.name);
        assert.equal(protectedTemplate.category, importedTemplate.category);
        assert.equal(protectedTemplate.tone, importedTemplate.tone);
        assert.equal(protectedTemplate.language, importedTemplate.language);
        assert.equal(protectedTemplate.shortcut, importedTemplate.shortcut);
        assert.equal(protectedTemplate.text, importedTemplate.text);
        assert.equal(protectedTemplate.archived, importedTemplate.archived);
        assert.equal(api.Outreach.purposeForTemplate(protectedTemplate), 'review_request');
        assert.equal(api.campaignAutoSendAllowed(protectedTemplate, { autoSendCampaign: true }), false);
        assert.equal(
            storage.get(api.KEYS.templates).find((item) => item.id === 'tpl-review-request').purpose,
            'review_request',
        );
    }
});

test('config import replaces unsafe or duplicate template IDs without losing templates', async () => {
    const { api, storage } = await loadAssistant();
    const importedTemplates = [
        { id: 'tpl-safe', name: 'Safe first', text: 'One' },
        { id: 'tpl-safe', name: 'Safe duplicate', text: 'Two' },
        { id: 'tpl-breakout\"><img data-template-injection src=x>', name: 'Unsafe', text: 'Three' },
        { name: 'Missing ID', text: 'Four' },
    ];

    await api.ConfigManager.importText(JSON.stringify({
        app: api.APP.id,
        schemaVersion: api.APP.configSchema,
        settings: {},
        providers: {},
        templates: importedTemplates,
    }));

    const names = new Set(importedTemplates.map((template) => template.name));
    const normalized = api.Store.templates.filter((template) => names.has(template.name));
    const ids = normalized.map((template) => template.id);
    assert.equal(normalized.length, importedTemplates.length);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(normalized.find((template) => template.name === 'Safe first').id, 'tpl-safe');
    assert.ok(ids.every((id) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)));
    assert.ok(ids.every((id) => !id.includes('data-template-injection')));
    assert.deepEqual(
        storage.get(api.KEYS.templates).filter((template) => names.has(template.name)),
        copy(normalized),
    );
});

test('template IDs are escaped in every template attribute rendering context', async () => {
    const { api } = await loadAssistant();
    const maliciousId = 'tpl-breakout\"><img data-template-injection src=x>';
    const maliciousTemplate = {
        id: maliciousId,
        name: 'Unsafe template',
        category: 'Test',
        tone: 'friendly',
        language: 'en',
        shortcut: '',
        text: 'Hello',
        archived: false,
    };
    api.Store.templates = [maliciousTemplate];
    api.UI.state.templateEditId = maliciousId;
    api.UI.state.selectedTemplateId = maliciousId;
    api.UI.state.orders = [];
    api.UI.state.selectedOrders = new Set();

    const markup = [
        api.UI.renderTemplates(),
        api.UI.renderOrders(),
        api.UI.renderMessages(),
    ].join('\n');

    assert.ok(markup.includes('tpl-breakout&amp;quot;') || markup.includes('tpl-breakout&quot;'));
    assert.ok(!markup.includes('<img data-template-injection'));
});

test('schema-3 Turkish review preset is corrected to English without losing user state', async () => {
    const { api, storage } = await loadAssistant();
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
    storage.set(api.KEYS.templates, copy(api.Store.templates));
    storage.set(api.KEYS.configMeta, copy(api.Store.configMeta));

    await api.Store.migrate();

    const migrated = api.Store.templates.find((item) => item.id === 'tpl-review-request');
    assert.equal(migrated.language, 'en');
    assert.match(migrated.text, /honest Etsy review/i);
    assert.equal(migrated.name, 'Yorum rica — küçük işletme (EN)');
    assert.equal(migrated.category, 'Benim kategorim');
    assert.equal(migrated.tone, 'short');
    assert.equal(migrated.shortcut, '/benim-review');
    assert.equal(migrated.archived, true);
    assert.equal(api.Store.configMeta.schemaVersion, api.APP.configSchema);
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
    assert.match(markup, /Yalnız “Yorum yok” olarak güncel biçimde onayladığınız siparişler/);
    assert.match(markup, /Otopilotu Başlat/);
    assert.match(markup, /data-action="orders-select-all">Onaylıları Seç/);
    assert.match(markup, /aria-label="Otomasyon durumu"/);

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
    assert.equal(api.campaignAutoSendAllowed(
        { purpose: 'review_request' },
        { autoSendCampaign: false },
        { runMode: 'autopilot', runState: 'running' },
    ), true);
    assert.equal(api.campaignAutoSendAllowed(
        { purpose: 'review_request' },
        { autoSendCampaign: true },
        { runMode: 'autopilot', runState: 'paused' },
    ), false);
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
    assert.match(markup, /data-order-select="order-1"[^>]*checked/);
});

test('failed review-decision persistence rerenders the durable value instead of leaving a false selection', async () => {
    const { api } = await loadAssistant();
    const handlers = new Map();
    api.UI.shadow = {
        addEventListener(type, handler) { handlers.set(type, handler); },
    };
    const originalDecision = api.Outreach.setManualDecision;
    const originalSetBusy = api.UI.setBusy;
    let renders = 0;
    let errors = 0;
    api.Outreach.setManualDecision = async () => { throw new Error('injected review decision write failure'); };
    api.UI.setBusy = () => {};
    api.UI.render = () => { renders += 1; };
    api.UI.toast = () => { errors += 1; };
    api.UI.bind();
    try {
        await handlers.get('change')({
            target: { dataset: { reviewDecision: 'order-1' }, value: 'eligible' },
        });
        assert.equal(errors, 1);
        assert.equal(renders, 1, 'the failed native selection must be replaced from durable state');
        assert.equal(api.UI.state.selectedOrders.has('order-1'), false);
    } finally {
        api.Outreach.setManualDecision = originalDecision;
        api.UI.setBusy = originalSetBusy;
    }
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
    api.UI.state.context = {
        conversationId: 'order-1', customerName: 'Ashley', orderId: 'order-1', lastCustomerMessage: '',
    };
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

test('message campaign skip and cancel require confirmation and reject stale revisions', async () => {
    const confirmationEnvironment = await loadAssistant();
    const { api, sandbox } = confirmationEnvironment;
    installGuidedFixture(confirmationEnvironment);
    api.UI.state.context = {
        conversationId: 'order-1', customerName: 'Ashley', orderId: 'order-1',
        lastCustomerMessage: '', routeFingerprint: api.Router.routeFingerprint(),
    };
    const markup = api.UI.renderMessages();
    assert.match(markup, /data-action="campaign-skip"[^>]*data-campaign-revision=/);
    assert.match(markup, /data-action="campaign-cancel"[^>]*data-campaign-revision=/);

    const originals = {
        confirm: sandbox.confirm,
        skipCurrent: api.Campaign.skipCurrent,
        skipOrder: api.Campaign.skipOrder,
        cancel: api.Campaign.cancel,
        setBusy: api.UI.setBusy,
        render: api.UI.render,
    };
    const calls = { skip: 0, cancel: 0, confirm: 0 };
    sandbox.confirm = () => { calls.confirm += 1; return false; };
    api.Campaign.skipCurrent = async () => { calls.skip += 1; };
    api.Campaign.skipOrder = async () => { calls.skip += 1; };
    api.Campaign.cancel = async () => { calls.cancel += 1; };
    api.UI.setBusy = () => {};
    api.UI.render = () => {};
    const campaign = api.Store.campaign;
    const item = api.Campaign.current();
    const targetFor = action => ({
        dataset: {
            action,
            campaignId: campaign.id,
            campaignItemId: item.id,
            campaignRevision: String(campaign.revision),
        },
    });
    try {
        await api.UI.onClick({ target: { closest: () => targetFor('campaign-skip') } });
        await api.UI.onClick({ target: { closest: () => targetFor('campaign-cancel') } });
        assert.deepEqual(calls, { skip: 0, cancel: 0, confirm: 2 });
    } finally {
        sandbox.confirm = originals.confirm;
        api.Campaign.skipCurrent = originals.skipCurrent;
        api.Campaign.skipOrder = originals.skipOrder;
        api.Campaign.cancel = originals.cancel;
        api.UI.setBusy = originals.setBusy;
        api.UI.render = originals.render;
    }

    const staleSkipEnvironment = await loadAssistant();
    const staleSkipFixture = installGuidedFixture(staleSkipEnvironment);
    const staleSkipBefore = copy(staleSkipEnvironment.api.Store.campaign);
    await assert.rejects(
        staleSkipEnvironment.api.Campaign.skipOrder('order-1', {
            expectedItemId: staleSkipFixture.first.id,
            expectedCampaignId: staleSkipBefore.id,
            expectedRevision: staleSkipBefore.revision - 1,
        }),
        /başka bir (?:Etsy )?sekmesinde değişti|güncel değil|revision/i,
    );
    assert.deepEqual(copy(staleSkipEnvironment.api.Store.campaign), staleSkipBefore);

    const staleCancelEnvironment = await loadAssistant();
    installGuidedFixture(staleCancelEnvironment);
    const staleCancelBefore = copy(staleCancelEnvironment.api.Store.campaign);
    await assert.rejects(
        staleCancelEnvironment.api.Campaign.cancel({
            expectedCampaignId: staleCancelBefore.id,
            expectedRevision: staleCancelBefore.revision - 1,
        }),
        /başka bir (?:Etsy )?sekmesinde değişti|güncel değil|revision/i,
    );
    assert.deepEqual(copy(staleCancelEnvironment.api.Store.campaign), staleCancelBefore);
});

test('manual reply insertion preserves a different occupied Etsy composer without side effects', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/order-1';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/order-1';
    const routeFingerprint = api.Router.routeFingerprint();
    const context = {
        conversationId: 'order-1',
        customerName: 'Ashley',
        orderId: 'order-1',
        lastCustomerMessage: 'Can you help with my order?',
        routeFingerprint,
    };
    const textarea = { value: 'My unsent manual Etsy draft', offsetParent: {} };
    api.UI.state.reply = 'Generated assistant reply';
    api.UI.state.replyMethod = 'free';
    api.UI.state.replyBinding = {
        conversationId: context.conversationId,
        routeFingerprint,
        messageHash: api.hashText(context.lastCustomerMessage),
    };

    const originals = {
        context: api.MessageAdapter.context,
        waitForTextarea: api.MessageAdapter.waitForTextarea,
        getTextarea: api.MessageAdapter.getTextarea,
        insert: api.MessageAdapter.insert,
        prepare: api.Verification.prepare,
        setStatus: api.Store.setStatus,
        addHistory: api.Store.addHistory,
    };
    const calls = { insert: 0, prepare: 0, setStatus: 0, addHistory: 0 };
    api.MessageAdapter.context = () => context;
    api.MessageAdapter.waitForTextarea = async () => textarea;
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.insert = () => { calls.insert += 1; };
    api.Verification.prepare = () => { calls.prepare += 1; };
    api.Store.setStatus = async () => { calls.setStatus += 1; };
    api.Store.addHistory = async () => { calls.addHistory += 1; };
    try {
        await assert.rejects(
            api.UI.insertReply(),
            /farklı.*taslak|mevcut metni korumak|üzerine yazılmadı/i,
        );
        assert.equal(textarea.value, 'My unsent manual Etsy draft');
        assert.deepEqual(calls, { insert: 0, prepare: 0, setStatus: 0, addHistory: 0 });
    } finally {
        api.MessageAdapter.context = originals.context;
        api.MessageAdapter.waitForTextarea = originals.waitForTextarea;
        api.MessageAdapter.getTextarea = originals.getTextarea;
        api.MessageAdapter.insert = originals.insert;
        api.Verification.prepare = originals.prepare;
        api.Store.setStatus = originals.setStatus;
        api.Store.addHistory = originals.addHistory;
    }
});

test('manual reply insertion revalidates the captured conversation context immediately before mutation', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/order-1';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/order-1';
    const routeFingerprint = api.Router.routeFingerprint();
    const currentContext = {
        conversationId: 'order-1', customerName: 'Ashley', orderId: 'order-1',
        lastCustomerMessage: 'Original customer message', routeFingerprint,
    };
    const driftedContext = {
        ...currentContext,
        conversationId: 'order-2',
        orderId: 'order-2',
        customerName: 'Morgan',
    };
    const textarea = { value: '', offsetParent: {} };
    api.UI.state.reply = 'Generated assistant reply';
    api.UI.state.replyBinding = {
        conversationId: currentContext.conversationId,
        routeFingerprint,
        messageHash: api.hashText(currentContext.lastCustomerMessage),
    };

    const originals = {
        context: api.MessageAdapter.context,
        waitForTextarea: api.MessageAdapter.waitForTextarea,
        getTextarea: api.MessageAdapter.getTextarea,
        insert: api.MessageAdapter.insert,
        prepare: api.Verification.prepare,
        setStatus: api.Store.setStatus,
        addHistory: api.Store.addHistory,
    };
    let contextReads = 0;
    const calls = { insert: 0, prepare: 0, setStatus: 0, addHistory: 0 };
    api.MessageAdapter.context = () => (++contextReads <= 2 ? currentContext : driftedContext);
    api.MessageAdapter.waitForTextarea = async () => textarea;
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.insert = () => { calls.insert += 1; };
    api.Verification.prepare = () => { calls.prepare += 1; };
    api.Store.setStatus = async () => { calls.setStatus += 1; };
    api.Store.addHistory = async () => { calls.addHistory += 1; };
    try {
        await assert.rejects(api.UI.insertReply(), /Konuşma değişti/i);
        assert.equal(contextReads, 3, 'the captured context must be checked after the post-wait route check');
        assert.deepEqual(calls, { insert: 0, prepare: 0, setStatus: 0, addHistory: 0 });
    } finally {
        api.MessageAdapter.context = originals.context;
        api.MessageAdapter.waitForTextarea = originals.waitForTextarea;
        api.MessageAdapter.getTextarea = originals.getTextarea;
        api.MessageAdapter.insert = originals.insert;
        api.Verification.prepare = originals.prepare;
        api.Store.setStatus = originals.setStatus;
        api.Store.addHistory = originals.addHistory;
    }
});

test('pending send verification renders reconciliation guidance without advance skip or stop controls', async () => {
    const environment = await loadAssistant();
    const { api, sandbox } = environment;
    installPendingResolutionFixture(environment);
    api.UI.state.context = {
        conversationId: 'order-1', customerName: 'Ashley', orderId: 'order-1',
        lastCustomerMessage: '', routeFingerprint: api.Router.routeFingerprint(),
    };

    const messagesMarkup = api.UI.renderMessages();
    assert.match(messagesMarkup, /Gönderim sonucu.*doğrulanmayı bekliyor/i);
    assert.match(messagesMarkup, /Etsy.*kontrol.*Gönderildi.*Gönderilmedi/is);
    assert.match(messagesMarkup, /data-order-confirm-sent="order-1"/);
    assert.match(messagesMarkup, /data-order-confirm-not-sent="order-1"/);
    assert.doesNotMatch(messagesMarkup, /data-action="campaign-(?:send-next|skip|cancel)"/);

    sandbox.location.pathname = '/your/orders/sold/completed';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/your/orders/sold/completed';
    api.UI.state.orders = [{
        orderId: 'order-1', customerName: 'Ashley', itemTitle: 'Custom Team Shirt', price: '$20',
        messageUrl: 'https://www.etsy.com/messages/order-1', delivered: true,
        status: { status: 'sent_pending_verification' },
    }];
    const ordersMarkup = api.UI.renderOrders();
    assert.match(ordersMarkup, /Etsy mesaj balonu.*doğrulanamadı.*tekrar gönderilmeyecek/is);
    assert.match(ordersMarkup, /data-order-open="order-1"[^>]*>.*Konuşmayı Aç/is);
    assert.doesNotMatch(ordersMarkup, /data-order-confirm-(?:sent|not-sent)=/);
    assert.doesNotMatch(ordersMarkup, /data-action="campaign-(?:start|cancel)"/);
    assert.doesNotMatch(ordersMarkup, /data-order-skip=/);
});

test('pending reconciliation controls stay bound to the campaign conversation', async () => {
    const environment = await loadAssistant();
    const { api, sandbox } = environment;
    installPendingResolutionFixture(environment);
    sandbox.location.pathname = '/messages/order-2';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/order-2';
    const context = {
        conversationId: 'order-2', customerName: 'Morgan', orderId: 'order-2',
        lastCustomerMessage: '', routeFingerprint: api.Router.routeFingerprint(),
    };
    api.UI.state.context = context;
    const originalContext = api.MessageAdapter.context;
    const originalResolve = api.Campaign.resolvePendingSend;
    const originalToast = api.UI.toast;
    let resolutions = 0;
    api.MessageAdapter.context = () => context;
    api.Campaign.resolvePendingSend = async () => { resolutions += 1; return 'sent'; };
    api.UI.toast = () => {};
    try {
        const markup = api.UI.renderMessages();
        assert.match(markup, /order-1|Sipariş #order-1/i);
        assert.doesNotMatch(markup, /data-order-confirm-(?:sent|not-sent)=/);
        await assert.rejects(
            api.UI.onClick({ target: { closest: () => ({ dataset: { orderConfirmSent: 'order-1' } }) } }),
            /doğru konuşma|konuşma değişti|bu konuşmaya ait değil/i,
        );
        assert.equal(resolutions, 0);
    } finally {
        api.MessageAdapter.context = originalContext;
        api.Campaign.resolvePendingSend = originalResolve;
        api.UI.toast = originalToast;
    }
});

test('pending reconciliation controls follow a receipt-bound compose send to its verified thread', async () => {
    const environment = await loadAssistant();
    const { api, sandbox } = environment;
    installPendingResolutionFixture(environment);
    const item = api.Store.campaign.items[0];
    item.messageUrl = 'https://www.etsy.com/messages/new?with_id=111&recipient_id=111&referring_id=10000001&referring_type=receipt';
    item.customerName = 'Ashley';
    sandbox.location.pathname = '/messages/created-thread';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/created-thread';
    const matchingContext = {
        conversationId: 'created-thread', customerName: 'Ashley', orderId: 'order-1',
        lastCustomerMessage: '', routeFingerprint: api.Router.routeFingerprint(),
    };
    api.UI.state.context = matchingContext;
    const originalContext = api.MessageAdapter.context;
    try {
        api.MessageAdapter.context = () => matchingContext;
        const matchingMarkup = api.UI.renderMessages();
        assert.match(matchingMarkup, /data-order-confirm-sent="order-1"/);
        assert.match(matchingMarkup, /data-order-confirm-not-sent="order-1"/);

        const wrongOrder = { ...matchingContext, orderId: 'order-2' };
        api.UI.state.context = wrongOrder;
        api.MessageAdapter.context = () => wrongOrder;
        const mismatchedMarkup = api.UI.renderMessages();
        assert.doesNotMatch(mismatchedMarkup, /data-order-confirm-(?:sent|not-sent)=/);
    } finally {
        api.MessageAdapter.context = originalContext;
    }
});

test('pending verification suppresses new campaign creation before replacement confirmation', async () => {
    const environment = await loadAssistant();
    const { api, sandbox } = environment;
    installPendingResolutionFixture(environment);
    sandbox.location.pathname = '/your/orders/sold/completed';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/your/orders/sold/completed';
    api.UI.state.selectedTemplateId = 'tpl-delivered';
    api.UI.state.orders = [{
        orderId: 'order-3', customerName: 'Taylor', itemTitle: 'Third Shirt', price: '$24',
        messageUrl: 'https://www.etsy.com/messages/order-3', delivered: true,
        status: { status: 'none' },
    }];
    api.UI.state.selectedOrders = new Set(['order-3']);

    const markup = api.UI.renderOrders();
    assert.doesNotMatch(markup, /data-action="campaign-create"/);

    const originalConfirm = sandbox.confirm;
    const originalCancel = api.Campaign.cancel;
    const originalSetBusy = api.UI.setBusy;
    let confirmations = 0;
    let cancellations = 0;
    sandbox.confirm = () => { confirmations += 1; return true; };
    api.Campaign.cancel = async () => { cancellations += 1; };
    api.UI.setBusy = () => {};
    try {
        await assert.rejects(api.UI.createCampaign(), /doğrulama|Gönderildi|Gönderilmedi/i);
        assert.equal(confirmations, 0);
        assert.equal(cancellations, 0);
    } finally {
        sandbox.confirm = originalConfirm;
        api.Campaign.cancel = originalCancel;
        api.UI.setBusy = originalSetBusy;
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
    let capturedAtClick = null;
    const button = makeNativeSendButton(() => {
        capturedAtClick = {
            sendCapturedAt: api.Verification.pending?.sendCapturedAt || '',
            campaignId: api.Verification.pending?.campaignId || '',
            campaignItemId: api.Verification.pending?.campaignItemId || '',
        };
        outgoing = true;
    });
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
        assert.ok(capturedAtClick.sendCapturedAt, 'guided dispatch must capture the exact composer immediately before clicking');
        assert.deepEqual({
            campaignId: capturedAtClick.campaignId,
            campaignItemId: capturedAtClick.campaignItemId,
        }, {
            campaignId: 'campaign-1',
            campaignItemId: 'item-1',
        });
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

test('campaign draft, guided, automatic, and native sends reject an explicit order or customer mismatch', async () => {
    const guidedEnvironment = await loadAssistant();
    const { api, documentListeners } = guidedEnvironment;
    installGuidedFixture(guidedEnvironment);
    const textarea = { value: 'Edited final text', offsetParent: {} };
    let captureHandler = null;
    let insertCalls = 0;
    const button = makeNativeSendButton(() => {}, event => captureHandler?.(event));
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.getConversationScope = () => ({ querySelectorAll: () => [] });
    api.MessageAdapter.getSendButton = () => button;
    api.MessageAdapter.context = () => ({
        conversationId: 'order-1', customerName: 'Different Buyer', orderId: 'order-2',
    });
    api.MessageAdapter.insert = () => { insertCalls += 1; };
    api.MessageAdapter.isSendButton = target => target === button;
    api.UI.toast = () => {};
    api.UI.shadow = { addEventListener() {} };
    api.UI.bind();
    captureHandler = documentListeners.get('click')?.at(-1);

    button.click();
    assert.equal(button.clickCount, 0, 'native Send must be blocked when campaign order/customer context conflicts');
    await assert.rejects(api.Campaign.sendCurrentByUser(), /güncel kampanya|konuşmayla eşleşmiyor/i);
    assert.equal(insertCalls, 0);
    assert.equal(button.clickCount, 0);

    const resumeEnvironment = await loadAssistant();
    const { api: resumeApi, storage: resumeStorage } = resumeEnvironment;
    installGuidedFixture(resumeEnvironment);
    const pendingCampaign = copy(resumeApi.Store.campaign);
    pendingCampaign.items[0].status = 'pending';
    delete pendingCampaign.items[0].reservation;
    const pendingStatuses = copy(resumeApi.Store.statuses);
    pendingStatuses.orders['order-1'].status = 'draft';
    pendingStatuses.outreach['order-1'].review_request.workflow = 'queued';
    resumeStorage.set(resumeApi.KEYS.campaign, copy(pendingCampaign));
    resumeStorage.set(resumeApi.KEYS.statuses, copy(pendingStatuses));
    resumeApi.Store.commitCoordinatedState(pendingCampaign, pendingStatuses, { invalidate: false, refresh: false });
    const emptyTextarea = { value: '', offsetParent: {} };
    let resumeInserts = 0;
    let resumeClicks = 0;
    resumeApi.MessageAdapter.getTextarea = () => emptyTextarea;
    resumeApi.MessageAdapter.waitForTextarea = async () => emptyTextarea;
    resumeApi.MessageAdapter.getConversationScope = () => ({ querySelectorAll: () => [] });
    resumeApi.MessageAdapter.context = () => ({
        conversationId: 'order-1', customerName: 'Different Buyer', orderId: 'order-2',
    });
    resumeApi.MessageAdapter.insert = () => { resumeInserts += 1; };
    resumeApi.MessageAdapter.getSendButton = () => messageCenterButton(() => { resumeClicks += 1; });

    await assert.rejects(resumeApi.Campaign.resume(), /sipariş veya müşteri.*eşleşmiyor/i);
    assert.equal(resumeInserts, 0, 'a mismatched campaign context must fail before draft insertion');
    assert.equal(resumeClicks, 0, 'a mismatched campaign context must fail before automatic dispatch');
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
    const textarea = { value: 'Edited final text', offsetParent: {} };
    api.MessageAdapter.getTextarea = () => textarea;
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

test('verified non-campaign sends remain sent when history persistence is unavailable', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/history-resilient';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/history-resilient';
    const originals = {
        context: api.MessageAdapter.context,
        countOutgoing: api.MessageAdapter.countOutgoing,
        waitForOutgoing: api.MessageAdapter.waitForOutgoing,
        tryLogOnce: api.History.tryLogOnce,
        toast: api.UI.toast,
    };
    api.MessageAdapter.context = () => ({
        conversationId: 'history-resilient', customerName: 'Buyer', orderId: 'history-order', messages: [],
    });
    api.MessageAdapter.countOutgoing = () => 0;
    api.MessageAdapter.waitForOutgoing = async () => true;
    api.History.tryLogOnce = async () => { throw new Error('injected history storage failure'); };
    api.UI.toast = () => {};
    try {
        api.Verification.prepare('A confirmed standalone reply', { method: 'manual' });
        assert.equal(await api.Verification.onSendClick(), true);
    } finally {
        api.MessageAdapter.context = originals.context;
        api.MessageAdapter.countOutgoing = originals.countOutgoing;
        api.MessageAdapter.waitForOutgoing = originals.waitForOutgoing;
        api.History.tryLogOnce = originals.tryLogOnce;
        api.UI.toast = originals.toast;
    }
    assert.equal(api.Store.getStatus('orders', 'history-order').status, 'sent');
    assert.equal(api.Store.getStatus('conversations', 'history-resilient').status, 'sent');
    assert.equal(api.Verification.pending, null);
    assert.equal(api.Verification.activePending, null);
});

async function verifyStandaloneSendWithStalledHistory(verified) {
    const { api, sandbox } = await loadAssistant();
    const suffix = verified ? 'history-stalled-sent' : 'history-stalled-failed';
    sandbox.location.pathname = `/messages/${suffix}`;
    sandbox.location.search = '';
    sandbox.location.href = `https://www.etsy.com/messages/${suffix}`;
    const originals = {
        context: api.MessageAdapter.context,
        countOutgoing: api.MessageAdapter.countOutgoing,
        waitForOutgoing: api.MessageAdapter.waitForOutgoing,
        tryLogOnce: api.History.tryLogOnce,
        toast: api.UI.toast,
    };
    api.MessageAdapter.context = () => ({
        conversationId: suffix, customerName: 'Buyer', orderId: `${suffix}-order`, messages: [],
    });
    api.MessageAdapter.countOutgoing = () => 0;
    api.MessageAdapter.waitForOutgoing = async () => verified;
    api.History.tryLogOnce = () => new Promise(() => {});
    api.UI.toast = () => {};
    let settled = false;
    let result;
    let failure;
    try {
        api.Verification.prepare('Standalone history stall probe', { method: 'manual' });
        void api.Verification.onSendClick().then(
            value => { result = value; settled = true; },
            error => { failure = error; settled = true; },
        );
        for (let turn = 0; turn < 12 && !settled; turn += 1) {
            await new Promise(resolve => setImmediate(resolve));
        }
        assert.ok(settled, 'history logging must not keep standalone verification pending');
    } finally {
        api.MessageAdapter.context = originals.context;
        api.MessageAdapter.countOutgoing = originals.countOutgoing;
        api.MessageAdapter.waitForOutgoing = originals.waitForOutgoing;
        api.History.tryLogOnce = originals.tryLogOnce;
        api.UI.toast = originals.toast;
    }
    assert.equal(failure, undefined);
    assert.equal(result, verified);
    assert.equal(api.Verification.pending, null);
    assert.equal(api.Verification.activePending, null);
    return { api, orderId: `${suffix}-order`, conversationId: suffix };
}

test('never-resolving history logging cannot block standalone verified status transitions', async () => {
    const { api, orderId, conversationId } = await verifyStandaloneSendWithStalledHistory(true);
    assert.equal(api.Store.getStatus('orders', orderId).status, 'sent');
    assert.equal(api.Store.getStatus('conversations', conversationId).status, 'sent');
});

test('never-resolving history logging cannot block standalone failed status transitions', async () => {
    const { api, orderId } = await verifyStandaloneSendWithStalledHistory(false);
    assert.equal(api.Store.getStatus('orders', orderId).status, 'error');
});

test('translation and reply generation survive an actual history storage rejection', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/history-write-rejection';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/history-write-rejection';
    const context = {
        conversationId: 'history-write-rejection', customerName: 'Buyer', firstName: 'Buyer', orderId: 'history-write-order',
        lastCustomerMessage: 'Hello', messages: [{ role: 'customer', text: 'Hello' }],
        routeFingerprint: api.Router.routeFingerprint(),
    };
    const originals = {
        addHistory: api.Store.addHistory,
        google: api.Translator.google,
        context: api.MessageAdapter.context,
        toast: api.UI.toast,
    };
    api.Store.addHistory = async () => { throw new Error('injected history storage rejection'); };
    api.Translator.google = async text => ({ text: `TR ${text}`, detectedLanguage: 'en', provider: 'google' });
    api.MessageAdapter.context = () => context;
    api.UI.toast = () => {};
    api.UI.state.selectedTemplateId = 'tpl-delivered';
    api.UI.state.targetLanguage = 'tr';
    api.Store.settings.replyInCustomerLanguage = false;
    api.Translator.cache.clear();
    try {
        assert.equal((await api.Translator.translate('History write translation', 'tr')).text, 'TR History write translation');
        assert.equal(await api.UI.generateReply({ method: 'template' }), true);
    } finally {
        api.Store.addHistory = originals.addHistory;
        api.Translator.google = originals.google;
        api.MessageAdapter.context = originals.context;
        api.UI.toast = originals.toast;
    }
    assert.ok(api.UI.state.reply);
});

test('never-resolving history logging cannot block Translator.translate', async () => {
    const { api } = await loadAssistant();
    const originalGoogle = api.Translator.google;
    const originalTryLog = api.History.tryLog;
    api.Translator.cache.clear();
    api.Translator.google = async text => ({ text: `TR ${text}`, detectedLanguage: 'en', provider: 'google' });
    api.History.tryLog = () => new Promise(() => {});
    let settled = false;
    let result;
    let failure;
    try {
        void api.Translator.translate('Translator history stall probe', 'tr').then(
            value => { result = value; settled = true; },
            error => { failure = error; settled = true; },
        );
        for (let turn = 0; turn < 12 && !settled; turn += 1) await new Promise(resolve => setImmediate(resolve));
    } finally {
        api.Translator.google = originalGoogle;
        api.History.tryLog = originalTryLog;
    }
    assert.ok(settled, 'translation must not await an auxiliary history write');
    assert.equal(failure, undefined);
    assert.equal(result?.text, 'TR Translator history stall probe');
});

test('never-resolving history logging cannot block UI reply generation', async () => {
    const { api, sandbox } = await loadAssistant();
    sandbox.location.pathname = '/messages/reply-history-stall';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/reply-history-stall';
    const context = {
        conversationId: 'reply-history-stall', customerName: 'Buyer', firstName: 'Buyer', orderId: 'reply-history-order',
        lastCustomerMessage: 'Hello', messages: [{ role: 'customer', text: 'Hello' }],
        routeFingerprint: api.Router.routeFingerprint(),
    };
    const originalContext = api.MessageAdapter.context;
    const originalTryLog = api.History.tryLog;
    const originalToast = api.UI.toast;
    api.MessageAdapter.context = () => context;
    api.History.tryLog = () => new Promise(() => {});
    api.UI.toast = () => {};
    api.UI.state.selectedTemplateId = 'tpl-delivered';
    api.UI.state.targetLanguage = 'tr';
    api.Store.settings.replyInCustomerLanguage = false;
    let settled = false;
    let result;
    let failure;
    try {
        void api.UI.generateReply({ method: 'template' }).then(
            value => { result = value; settled = true; },
            error => { failure = error; settled = true; },
        );
        for (let turn = 0; turn < 12 && !settled; turn += 1) await new Promise(resolve => setImmediate(resolve));
    } finally {
        api.MessageAdapter.context = originalContext;
        api.History.tryLog = originalTryLog;
        api.UI.toast = originalToast;
    }
    assert.ok(settled, 'reply generation must not await an auxiliary history write');
    assert.equal(failure, undefined);
    assert.equal(result, true);
    assert.ok(api.UI.state.reply);
});

test('manual sent and not-sent reconciliation update campaign, order, and outreach consistently', async () => {
    const sentEnvironment = await loadAssistant();
    installPendingResolutionFixture(sentEnvironment);
    assert.equal(await sentEnvironment.api.Campaign.resolvePendingSend('order-1', 'sent'), 'sent');
    await sentEnvironment.api.Store.historyWriteChain;
    assert.equal(sentEnvironment.api.Store.campaign.items[0].status, 'sent');
    assert.equal(sentEnvironment.api.Store.campaign.currentIndex, 1);
    assert.equal(sentEnvironment.api.Store.statuses.orders['order-1'].status, 'sent');
    assert.equal(sentEnvironment.api.Store.statuses.orders['order-1'].manuallyConfirmed, true);
    assert.equal(sentEnvironment.api.Store.statuses.outreach['order-1'].review_request.workflow, 'sent');
    assert.equal(sentEnvironment.api.Store.statuses.conversations['order-1'].status, 'sent');
    const manualVerified = sentEnvironment.api.Store.history.filter(event => event.type === 'send_verified');
    assert.equal(manualVerified.length, 1);
    assert.equal(manualVerified[0].orderId, 'order-1');
    assert.equal(manualVerified[0].conversationId, 'order-1');
    assert.equal(manualVerified[0].detail.manuallyConfirmed, true);
    assert.equal(sentEnvironment.api.History.stats().verified, 1);

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
    assert.equal(notSentEnvironment.api.Store.history.some(event => event.type === 'send_verified'), false);
});

test('manual sent reconciliation cannot be blocked by an auxiliary history write', async () => {
    const environment = await loadAssistant();
    installPendingResolutionFixture(environment);
    environment.api.History.tryLogOnce = () => new Promise(() => {});

    const result = await Promise.race([
        environment.api.Campaign.resolvePendingSend('order-1', 'sent'),
        new Promise(resolve => setTimeout(() => resolve('blocked'), 100)),
    ]);
    assert.equal(result, 'sent');
    assert.equal(environment.api.Store.campaign.items[0].status, 'sent');
    assert.equal(environment.api.Store.statuses.orders['order-1'].status, 'sent');
    assert.equal(environment.api.Store.statuses.outreach['order-1'].review_request.workflow, 'sent');
    assert.equal(environment.api.Store.statuses.conversations['order-1'].status, 'sent');
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

test('a native Etsy campaign Send click is routed through the fenced guided path exactly once', async () => {
    const environment = await loadAssistant();
    const { api, documentListeners } = environment;
    installGuidedFixture(environment);
    const textarea = { value: 'Edited final text', offsetParent: {} };
    let outgoing = false;
    let captureHandler = null;
    const button = makeNativeSendButton(
        () => { outgoing = true; },
        event => captureHandler?.(event),
    );
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.getSendButton = () => button;
    api.MessageAdapter.context = () => ({ conversationId: 'order-1', customerName: 'Ashley', orderId: 'order-1' });
    api.MessageAdapter.countOutgoing = () => outgoing ? 1 : 0;
    api.MessageAdapter.isSendButton = target => target === button;
    api.UI.toast = () => {};
    api.UI.refreshCurrent = async () => {};
    api.UI.reportUiError = error => { throw error; };
    api.UI.shadow = { addEventListener() {} };
    api.UI.bind();
    captureHandler = documentListeners.get('click')?.at(-1);

    button.click();
    button.click();

    await waitUntil(() => api.Store.statuses.orders['order-1']?.status === 'sent', 'native campaign send did not finish');
    assert.equal(button.clickCount, 1, 'the intercepted user click and rapid duplicate must produce one Etsy dispatch');
    assert.equal(api.Store.statuses.outreach['order-1'].review_request.workflow, 'sent');
});

test('a prepared standalone reply suppresses a rapid duplicate native Send click during verification', async () => {
    const environment = await loadAssistant();
    const { api, sandbox, documentListeners } = environment;
    sandbox.location.pathname = '/messages/conversation-a';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/conversation-a';
    const textarea = { value: 'Standalone prepared reply', offsetParent: {} };
    let captureHandler = null;
    let resolveOutgoing;
    const outgoingReady = new Promise(resolve => { resolveOutgoing = resolve; });
    const button = makeNativeSendButton(() => {}, event => captureHandler?.(event));
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.getSendButton = () => button;
    api.MessageAdapter.getConversationScope = () => ({
        id: 'conversation-scope',
        querySelectorAll: () => [],
    });
    api.MessageAdapter.context = () => ({ conversationId: 'conversation-a', customerName: 'Ashley', orderId: '' });
    api.MessageAdapter.countOutgoing = () => 0;
    api.MessageAdapter.waitForOutgoing = async () => outgoingReady;
    api.MessageAdapter.isSendButton = target => target === button;
    api.UI.toast = () => {};
    api.UI.refreshCurrent = async () => {};
    api.UI.shadow = { addEventListener() {} };
    api.UI.bind();
    captureHandler = documentListeners.get('click')?.at(-1);
    api.Verification.prepare(textarea.value, {
        conversationId: 'conversation-a',
        routeFingerprint: api.Router.routeFingerprint(),
        method: 'manual',
    });

    button.click();
    button.click();
    await waitUntil(() => button.clickCount === 1, 'standalone native dispatch did not start');
    assert.equal(button.clickCount, 1);
    assert.ok(api.Verification.nativeDispatchGuard);

    resolveOutgoing(true);
    await api.Verification.activePromise;
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(api.Verification.nativeDispatchGuard, null);
});

test('a Message Center programmatic click never consumes an unrelated standalone verification', async () => {
    const environment = await loadAssistant();
    const { api, sandbox, documentListeners } = environment;
    sandbox.location.pathname = '/messages/conversation-a';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/conversation-a';
    let captureHandler = null;
    const button = makeNativeSendButton(() => {}, event => captureHandler?.(event));
    const stalePending = { marker: 'unrelated-verification' };
    api.MessageAdapter.getSendButton = () => button;
    api.MessageAdapter.isSendButton = target => target === button;
    api.Verification.pending = stalePending;
    api.UI.shadow = { addEventListener() {} };
    api.UI.bind();
    captureHandler = documentListeners.get('click')?.at(-1);

    api.MessageCenterAgent.programmaticDispatchActive = true;
    button.click();
    api.MessageCenterAgent.programmaticDispatchActive = false;

    assert.equal(button.clickCount, 1);
    assert.equal(api.Verification.pending, stalePending);
    assert.equal(api.Verification.activePromise, null);
    assert.equal(api.Verification.nativeDispatchGuard, null);
});

test('a coordinated manual send survives composer remount and cannot deadlock campaign creation', async () => {
    const requestedLocks = [];
    const environment = await loadAssistant({ requestedLocks });
    const { api, sandbox, documentListeners } = environment;
    sandbox.location.pathname = '/messages/conversation-a';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/conversation-a';
    const scope = { id: 'conversation-scope', querySelectorAll: () => [] };
    let textarea = { value: 'A manually typed Etsy message', offsetParent: {} };
    let captureHandler = null;
    let outgoingWaitStarted = false;
    let resolveOutgoing;
    const outgoingReady = new Promise(resolve => { resolveOutgoing = resolve; });
    const button = makeNativeSendButton(
        () => { textarea = { value: 'A second draft after remount', offsetParent: {} }; },
        event => captureHandler?.(event),
    );
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.getConversationScope = () => scope;
    api.MessageAdapter.getSendButton = () => button;
    api.MessageAdapter.context = () => ({
        conversationId: 'conversation-a', customerName: 'Ashley', orderId: '',
    });
    api.MessageAdapter.countOutgoing = () => 0;
    api.MessageAdapter.waitForOutgoing = async () => {
        outgoingWaitStarted = true;
        return outgoingReady;
    };
    api.MessageAdapter.isSendButton = target => target === button;
    api.UI.toast = () => {};
    api.UI.refreshCurrent = async () => {};
    api.UI.shadow = { addEventListener() {} };
    api.UI.bind();
    captureHandler = documentListeners.get('click')?.at(-1);

    button.click();
    await waitUntil(() => outgoingWaitStarted, 'manual outgoing verification did not start');
    button.click();
    assert.equal(button.clickCount, 1, 'composer remount must not permit a second dispatch');

    let campaignSettled = false;
    const campaignCreation = api.Campaign.create([{
        orderId: 'order-2',
        customerName: 'Morgan',
        itemTitle: 'Second item',
        messageUrl: 'https://www.etsy.com/messages/conversation-b',
    }], 'tpl-delivered', 'template').finally(() => { campaignSettled = true; });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(campaignSettled, false, 'campaign creation must wait behind the active send fence');

    resolveOutgoing(true);
    await Promise.race([
        campaignCreation,
        new Promise((_, reject) => setTimeout(() => reject(new Error('campaign/send lock deadlock')), 2000)),
    ]);
    await waitUntil(() => api.Verification.nativeDispatchGuard === null, 'native send guard was not released');
    assert.equal(button.clickCount, 1);
    assert.equal(api.Store.campaign.status, 'active');
    assert.match(requestedLocks[0], /campaign-status-coordination/);
    assert.match(requestedLocks[1], /etsy-send-coordination/);
});

test('a persistent native ambiguity blocks every send path until late evidence is reconciled', async () => {
    const environment = await loadAssistant();
    const { api, sandbox, documentListeners } = environment;
    sandbox.location.pathname = '/messages/conversation-a';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/conversation-a';
    const scope = { id: 'conversation-scope', querySelectorAll: () => [] };
    const textarea = { value: 'Manual message with uncertain outcome', offsetParent: {} };
    let captureHandler = null;
    let outgoingMatches = 0;
    const button = makeNativeSendButton(() => { textarea.value = ''; }, event => captureHandler?.(event));
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.getConversationScope = () => scope;
    api.MessageAdapter.getSendButton = () => button;
    api.MessageAdapter.context = () => ({ conversationId: 'conversation-a', customerName: 'Ashley', orderId: '' });
    api.MessageAdapter.countOutgoing = () => outgoingMatches;
    api.MessageAdapter.waitForOutgoing = async () => false;
    api.MessageAdapter.isSendButton = target => target === button;
    api.UI.toast = () => {};
    api.UI.refreshCurrent = async () => {};
    api.UI.shadow = { addEventListener() {} };
    api.UI.bind();
    captureHandler = documentListeners.get('click')?.at(-1);

    button.click();
    await waitUntil(() => api.Verification.nativeDispatchGuard === null, 'ambiguous native send did not settle');
    assert.equal(button.clickCount, 1);
    const attempts = Object.values(await api.Verification.nativeSendAttempts());
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].stage, 'ambiguous');

    textarea.value = 'Manual message with uncertain outcome';
    button.click();
    assert.equal(button.clickCount, 1, 'a local retry must be blocked by the tombstone');

    const agent = configureMessageCenter(environment);
    const mcJob = messageCenterJob({ id: 'job-native-hold' });
    const mcResults = [];
    let contextReads = 0;
    agent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job: mcJob };
        if (requestPath.includes('/result')) mcResults.push(copy(body));
        return {};
    };
    api.MessageAdapter.waitForContext = async () => { contextReads += 1; return api.MessageAdapter.context(); };
    assert.equal(await agent.processNextJob(), false);
    assert.equal(contextReads, 0);
    assert.deepEqual(mcResults, [{
        status: 'failed', retryable: true, error: 'native_send_outcome_hold',
    }]);

    await assert.rejects(api.Campaign.create([{
        orderId: 'order-native-hold', customerName: 'Ashley', itemTitle: 'Held item',
        messageUrl: 'https://www.etsy.com/messages/conversation-a',
    }], 'tpl-delivered', 'template'), /belirsiz bir manuel Etsy gönderimi/i);

    outgoingMatches = 1;
    assert.equal(await api.Verification.resolveNativeManualReview('not_sent', {
        attemptId: attempts[0].id,
        ambiguityId: attempts[0].ambiguityId,
    }), 'sent');
    assert.deepEqual(await api.Verification.nativeSendAttempts(), {});
    assert.equal(api.Store.statuses.conversations['conversation-a'].status, 'sent');
});

test('a native verification exception retains a tombstone and manual resolution clears stale ownership', async () => {
    const environment = await loadAssistant();
    const { api, sandbox, documentListeners } = environment;
    sandbox.location.pathname = '/messages/conversation-a';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/conversation-a';
    const scope = { id: 'conversation-scope', querySelectorAll: () => [] };
    const textarea = { value: 'Manual message before verifier failure', offsetParent: {} };
    let captureHandler = null;
    const button = makeNativeSendButton(() => { textarea.value = ''; }, event => captureHandler?.(event));
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.getConversationScope = () => scope;
    api.MessageAdapter.getSendButton = () => button;
    api.MessageAdapter.context = () => ({ conversationId: 'conversation-a', customerName: 'Ashley', orderId: '' });
    api.MessageAdapter.countOutgoing = () => 0;
    api.MessageAdapter.waitForOutgoing = async () => { throw new Error('injected outgoing verifier failure'); };
    api.MessageAdapter.isSendButton = target => target === button;
    api.UI.toast = () => {};
    api.UI.refreshCurrent = async () => {};
    api.UI.shadow = { addEventListener() {} };
    api.UI.bind();
    captureHandler = documentListeners.get('click')?.at(-1);

    button.click();
    await waitUntil(() => api.Verification.nativeDispatchGuard === null, 'failed native verifier did not release its local guard');
    const attempt = Object.values(await api.Verification.nativeSendAttempts())[0];
    assert.equal(attempt.stage, 'ambiguous');
    assert.ok(api.Verification.pending, 'failed verification must retain exact local ownership');

    assert.equal(await api.Verification.resolveNativeManualReview('not_sent', {
        attemptId: attempt.id,
        ambiguityId: attempt.ambiguityId,
    }), 'not_sent');
    assert.equal(api.Verification.pending, null);
    assert.equal(api.Verification.hasSendOwnership('conversation-a'), false);
    assert.deepEqual(await api.Verification.nativeSendAttempts(), {});
});

test('a receipt-bound compose ambiguity is actionable and can be resolved without a thread transition', async () => {
    const environment = await loadAssistant();
    const { api, sandbox, documentListeners } = environment;
    const composeUrl = 'https://www.etsy.com/messages/new?with_id=12345&referring_id=98765&referring_type=receipt';
    sandbox.location.pathname = '/messages/new';
    sandbox.location.search = '?with_id=12345&referring_id=98765&referring_type=receipt';
    sandbox.location.href = composeUrl;
    const scope = { id: 'compose-scope', querySelectorAll: () => [] };
    const textarea = { value: 'Compose message with uncertain outcome', offsetParent: {} };
    let captureHandler = null;
    const button = makeNativeSendButton(() => { textarea.value = ''; }, event => captureHandler?.(event));
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.getConversationScope = () => scope;
    api.MessageAdapter.getSendButton = () => button;
    api.MessageAdapter.context = () => ({
        conversationId: api.Router.conversationId(), customerName: 'Ashley', orderId: '98765',
    });
    api.MessageAdapter.countOutgoing = () => 0;
    api.MessageAdapter.waitForOutgoing = async () => false;
    api.Verification.waitForPendingOutgoing = async () => false;
    api.MessageAdapter.isSendButton = target => target === button;
    api.UI.toast = () => {};
    api.UI.refreshCurrent = async () => {};
    api.UI.shadow = { addEventListener() {} };
    api.UI.bind();
    captureHandler = documentListeners.get('click')?.at(-1);

    button.click();
    await waitUntil(() => api.Verification.nativeDispatchGuard === null, 'compose ambiguity did not settle');
    const attempt = Object.values(await api.Verification.nativeSendAttempts())[0];
    assert.match(attempt.conversationIdentity, /^compose:/);
    assert.equal(api.Verification.nativeManualReviewContextIsCurrent(attempt), true);
    const markup = api.UI.renderSettings();
    assert.match(markup, /data-action="native-send-confirm-not-sent"[^>]*data-native-attempt-id/);

    assert.equal(await api.Verification.resolveNativeManualReview('not_sent', {
        attemptId: attempt.id,
        ambiguityId: attempt.ambiguityId,
    }), 'not_sent');
    assert.deepEqual(await api.Verification.nativeSendAttempts(), {});
});

test('compose ambiguity rebind requires the exact receipt and baselines existing thread history', async () => {
    const environment = await loadAssistant();
    const { api, sandbox } = environment;
    sandbox.location.pathname = '/messages/conversation-a';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/conversation-a';
    const scope = { id: 'thread-scope', querySelectorAll: () => [] };
    const textarea = { value: '', offsetParent: {} };
    let outgoingMatches = 1;
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.getConversationScope = () => scope;
    api.MessageAdapter.context = () => ({
        conversationId: 'conversation-a', customerName: 'Ashley', orderId: '98765',
    });
    api.MessageAdapter.countOutgoing = () => outgoingMatches;

    const baseAttempt = {
        stage: 'dispatched',
        text: 'Historically repeated compose text',
        textDigest: await api.sha256Text('Historically repeated compose text'),
        textDigestVersion: 'sha256-utf8-v1',
        baselineMatches: 0,
        customerName: 'Ashley',
        conversationId: 'compose:12345:receipt:98765',
        conversationUrl: 'https://www.etsy.com/messages/new?with_id=12345&referring_id=98765&referring_type=receipt',
        createdAt: new Date().toISOString(),
    };
    await api.Verification.persistNativeSendAttempt({
        ...baseAttempt,
        id: 'native-mismatched-receipt',
        ambiguityId: 'native-mismatched-ambiguity',
        orderId: '98765',
        conversationIdentity: 'compose:12345:receipt:99999',
    });
    assert.equal(await api.Verification.rebindNativeComposeHoldToCurrent(), false);
    assert.equal((await api.Verification.nativeSendAttempts())['native-mismatched-receipt'].conversationIdentity, 'compose:12345:receipt:99999');
    await api.Verification.clearNativeSendAttempt('native-mismatched-receipt');

    await api.Verification.persistNativeSendAttempt({
        ...baseAttempt,
        id: 'native-correct-receipt',
        ambiguityId: 'native-correct-ambiguity',
        orderId: '98765',
        conversationIdentity: 'compose:12345:receipt:98765',
    });
    assert.equal(await api.Verification.rebindNativeComposeHoldToCurrent(), true);
    const rebound = (await api.Verification.nativeSendAttempts())['native-correct-receipt'];
    assert.equal(rebound.conversationIdentity, 'conversation-a');
    assert.equal(rebound.baselineMatches, 1);

    assert.equal(await api.Verification.resolveNativeManualReview('not_sent', {
        attemptId: rebound.id,
        ambiguityId: rebound.ambiguityId,
    }), 'not_sent');
    assert.equal(outgoingMatches, 1);
    assert.deepEqual(await api.Verification.nativeSendAttempts(), {});
});

test('a second tab drops a native click instead of queueing it behind another send', async () => {
    const shared = {
        storage: new Map(), lockTails: new Map(), valueListeners: new Map(),
    };
    const first = await loadAssistant(shared);
    const second = await loadAssistant(shared);
    let resolveFirstOutgoing;
    let firstWaitStarted = false;
    const firstOutgoing = new Promise(resolve => { resolveFirstOutgoing = resolve; });

    function bindNative(environment, waitForOutgoing) {
        const { api, sandbox, documentListeners } = environment;
        sandbox.location.pathname = '/messages/conversation-a';
        sandbox.location.search = '';
        sandbox.location.href = 'https://www.etsy.com/messages/conversation-a';
        const scope = { id: 'scope', querySelectorAll: () => [] };
        const textarea = { value: 'Cross-tab native message', offsetParent: {} };
        let captureHandler = null;
        const button = makeNativeSendButton(() => { textarea.value = ''; }, event => captureHandler?.(event));
        api.MessageAdapter.getTextarea = () => textarea;
        api.MessageAdapter.getConversationScope = () => scope;
        api.MessageAdapter.getSendButton = () => button;
        api.MessageAdapter.context = () => ({ conversationId: 'conversation-a', customerName: 'Ashley', orderId: '' });
        api.MessageAdapter.countOutgoing = () => 0;
        api.MessageAdapter.waitForOutgoing = waitForOutgoing;
        api.MessageAdapter.isSendButton = target => target === button;
        api.UI.toast = () => {};
        api.UI.refreshCurrent = async () => {};
        api.UI.shadow = { addEventListener() {} };
        api.UI.bind();
        captureHandler = documentListeners.get('click')?.at(-1);
        return button;
    }

    const firstButton = bindNative(first, async () => {
        firstWaitStarted = true;
        return firstOutgoing;
    });
    const secondButton = bindNative(second, async () => true);
    firstButton.click();
    await waitUntil(() => firstWaitStarted, 'first tab did not acquire the send fence');
    secondButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(secondButton.clickCount, 0);

    resolveFirstOutgoing(true);
    await waitUntil(() => first.api.Verification.nativeDispatchGuard === null, 'first send did not finish');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(firstButton.clickCount, 1);
    assert.equal(secondButton.clickCount, 0, 'the losing click must not replay after the lock becomes free');
});

test('a verified native send keeps its durable postprocessing hold until finalization finishes', async () => {
    const shared = {
        storage: new Map(), lockTails: new Map(), valueListeners: new Map(),
    };
    const first = await loadAssistant(shared);
    const second = await loadAssistant(shared);
    const messageCenterTab = await loadAssistant(shared);
    configureMessageCenter(first);
    const agent = configureMessageCenter(messageCenterTab);
    const firstFixture = installStandaloneNativeDispatchFixture(first);
    const secondFixture = installStandaloneNativeDispatchFixture(second);
    const originalSetStatus = first.api.Store.setStatus;
    let finalizationStarted = false;
    let releaseFinalization;
    const finalizationGate = new Promise(resolve => { releaseFinalization = resolve; });
    first.api.Store.setStatus = async function (...args) {
        if (!finalizationStarted) {
            finalizationStarted = true;
            await finalizationGate;
        }
        return originalSetStatus.apply(this, args);
    };

    const firstSend = first.api.Verification.dispatchNativeSend(firstFixture.button, firstFixture.guard);
    await waitUntil(() => finalizationStarted, 'native postprocessing did not begin');
    const held = Object.values(await first.api.Verification.nativeSendAttempts());
    assert.equal(held.length, 1);
    assert.equal(held[0].stage, 'postprocessing');
    assert.ok(held[0].outgoingVerifiedAt);
    assert.equal(Object.keys(await first.api.Verification.nativeSentReceipts()).length, 1);

    const job = messageCenterJob({ id: 'job-native-postprocessing-race', text: firstFixture.textarea.value });
    const messageCenterResults = [];
    agent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job };
        if (requestPath.includes('/result')) messageCenterResults.push(copy(body));
        return {};
    };
    assert.equal(await agent.processNextJob(), true);
    assert.equal(firstFixture.button.clickCount, 1, 'exact native receipt must prevent a Message Center replay');
    assert.equal(messageCenterResults.length, 1);
    assert.equal(messageCenterResults[0].status, 'sent');
    assert.equal(messageCenterResults[0].duplicatePrevented, true);
    assert.equal(messageCenterResults[0].recoveredFromNativeReceipt, true);
    assert.equal((await first.api.Verification.nativeSendAttempts())[held[0].id].stage, 'postprocessing');

    assert.equal(
        await second.api.Verification.dispatchNativeSend(secondFixture.button, secondFixture.guard),
        false,
        'another tab must not dispatch while verified native finalization is pending',
    );
    assert.equal(secondFixture.button.clickCount, 0);
    assert.equal((await first.api.Verification.nativeSendAttempts())[held[0].id].stage, 'postprocessing');

    releaseFinalization();
    assert.equal(await firstSend, true);
    first.api.Store.setStatus = originalSetStatus;
    first.api.Verification.releaseNativeDispatchGuard(firstFixture.guard);
    second.api.Verification.releaseNativeDispatchGuard(secondFixture.guard);
    assert.equal(firstFixture.button.clickCount, 1);
    assert.deepEqual(await first.api.Verification.nativeSendAttempts(), {});
});

test('a postprocessing failure preserves verified evidence and not-sent resolution cannot downgrade it', async () => {
    const environment = await loadAssistant();
    const { api } = environment;
    configureMessageCenter(environment);
    const fixture = installStandaloneNativeDispatchFixture(environment);
    const originalSetStatus = api.Store.setStatus;
    api.Store.setStatus = async () => { throw new Error('injected native postprocessing failure'); };
    try {
        await assert.rejects(
            api.Verification.dispatchNativeSend(fixture.button, fixture.guard),
            /injected native postprocessing failure/,
        );
    } finally {
        api.Store.setStatus = originalSetStatus;
        api.Verification.releaseNativeDispatchGuard(fixture.guard);
    }
    const attempt = Object.values(await api.Verification.nativeSendAttempts())[0];
    const receipt = (await api.Verification.nativeSentReceipts())[attempt.id];
    assert.equal(attempt.stage, 'ambiguous');
    assert.ok(attempt.outgoingVerifiedAt);
    assert.equal(receipt.textDigest, attempt.textDigest);
    assert.equal(await api.Verification.resolveNativeManualReview('not_sent', {
        attemptId: attempt.id,
        ambiguityId: attempt.ambiguityId,
    }), 'sent');
    assert.deepEqual(await api.Verification.nativeSendAttempts(), {});
    assert.equal(api.Store.statuses.orders['native-order-a'].status, 'sent');
});

test('durable outgoing verification prevents a not-sent downgrade even without Message Center receipt', async () => {
    const environment = await loadAssistant();
    const { api } = environment;
    const fixture = installStandaloneNativeDispatchFixture(environment, {
        text: 'Verified native reply without agent configuration',
    });
    const originalSetStatus = api.Store.setStatus;
    api.Store.setStatus = async () => { throw new Error('injected receipt-free finalization failure'); };
    try {
        await assert.rejects(
            api.Verification.dispatchNativeSend(fixture.button, fixture.guard),
            /injected receipt-free finalization failure/,
        );
    } finally {
        api.Store.setStatus = originalSetStatus;
        api.Verification.releaseNativeDispatchGuard(fixture.guard);
    }
    const attempt = Object.values(await api.Verification.nativeSendAttempts())[0];
    assert.equal(attempt.stage, 'ambiguous');
    assert.ok(attempt.outgoingVerifiedAt);
    assert.deepEqual(await api.Verification.nativeSentReceipts(), {});
    assert.equal(await api.Verification.resolveNativeManualReview('not_sent', {
        attemptId: attempt.id,
        ambiguityId: attempt.ambiguityId,
    }), 'sent');
    assert.equal(api.Store.statuses.orders['native-order-a'].status, 'sent');
});

test('native dispatch fails before click when its durable attempt write is silently dropped', async () => {
    const environment = await loadAssistant();
    const { api } = environment;
    const fixture = installStandaloneNativeDispatchFixture(environment);
    const originalSet = api.GMX.set;
    api.GMX.set = async (key, value) => {
        if (String(key).endsWith(':native-send-attempts:v1')) return undefined;
        return originalSet(key, value);
    };
    try {
        await assert.rejects(
            api.Verification.dispatchNativeSend(fixture.button, fixture.guard),
            /güvenlik kaydı kalıcılaştırılamadı/i,
        );
    } finally {
        api.GMX.set = originalSet;
        api.Verification.releaseNativeDispatchGuard(fixture.guard);
    }
    assert.equal(fixture.button.clickCount, 0);
    assert.deepEqual(await api.Verification.nativeSendAttempts(), {});
});

test('unknown native hold lookup is read-only and cannot erase a concurrent tombstone', async () => {
    const shared = {
        storage: new Map(), lockTails: new Map(), valueListeners: new Map(),
    };
    const first = await loadAssistant(shared);
    const second = await loadAssistant(shared);
    const unknownText = 'Unknown future native state';
    await first.api.Verification.persistNativeSendAttempt({
        id: 'native-future-a',
        stage: 'future_post_dispatch',
        conversationIdentity: 'conversation-a',
        text: unknownText,
        textDigest: await first.api.sha256Text(unknownText),
        textDigestVersion: 'sha256-utf8-v1',
        createdAt: new Date().toISOString(),
    });
    let lookupWrites = 0;
    const originalSet = first.api.GMX.set;
    first.api.GMX.set = async (...args) => {
        lookupWrites += 1;
        return originalSet(...args);
    };
    const view = await first.api.Verification.activeNativeSendHold('conversation-b');
    first.api.GMX.set = originalSet;
    assert.equal(view.stage, 'ambiguous');
    assert.equal(view.globalHold, true);
    assert.equal(lookupWrites, 0, 'hold lookup must never mutate shared tombstone storage');

    const secondText = 'Concurrent durable native state';
    await second.api.Verification.persistNativeSendAttempt({
        id: 'native-dispatched-b',
        ambiguityId: 'native-ambiguity-b',
        stage: 'dispatched',
        conversationIdentity: 'conversation-b',
        text: secondText,
        textDigest: await second.api.sha256Text(secondText),
        textDigestVersion: 'sha256-utf8-v1',
        createdAt: new Date().toISOString(),
    });
    const records = await first.api.Verification.nativeSendAttempts();
    assert.deepEqual(Object.keys(records).sort(), ['native-dispatched-b', 'native-future-a']);
    assert.equal(records['native-future-a'].stage, 'future_post_dispatch');
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
    const textarea = { value: 'Edited final text', offsetParent: {} };
    api.MessageAdapter.getTextarea = () => textarea;
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

    const recovered = await api.Campaign.recoverDurableSendPartials();
    assert.deepEqual([...recovered.restoredNotSentItemIds], ['item-1']);
    assert.deepEqual(copy(api.Store.statuses.orders['order-1']), copy(fixture.previousOrderStatus));
    assert.deepEqual(
        copy(api.Store.statuses.outreach['order-1'].review_request),
        copy(fixture.previousOutreach),
    );
});

test('status-first pre-dispatch interruption is fenced and restored before any retry', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    const fixture = installGuidedFixture(environment);
    const draftText = 'Prepared review request';
    const draftDigest = await api.sha256Text(draftText);
    const attemptToken = 'pre-dispatch-attempt-1';
    const campaign = copy(api.Store.campaign);
    campaign.items[0].draftText = draftText;
    campaign.items[0].draftDigest = draftDigest;
    campaign.items[0].reservation = {
        ownerId: 'interrupted-tab', token: attemptToken, expiresAt: '2099-01-01T00:00:00.000Z',
    };
    const previousOrderStatus = {
        ...copy(api.Store.statuses.orders['order-1']),
        messageDigest: draftDigest,
    };
    const previousOutreach = copy(api.Store.statuses.outreach['order-1'].review_request);
    const statuses = copy(api.Store.statuses);
    statuses.orders['order-1'] = {
        ...previousOrderStatus,
        status: 'sent_pending_verification',
        sendAttemptToken: attemptToken,
        previousOrderStatus,
        previousOutreach,
    };
    statuses.outreach['order-1'].review_request = {
        ...previousOutreach,
        workflow: 'sent_pending_verification',
        sendAttemptToken: attemptToken,
    };
    storage.set(api.KEYS.campaign, copy(campaign));
    storage.set(api.KEYS.statuses, copy(statuses));
    api.Store.commitCoordinatedState(campaign, statuses, { invalidate: false, refresh: false });

    assert.equal(api.Campaign.hasUnresolvedSend(campaign, statuses), true);
    const recovered = await api.Campaign.recoverDurableSendPartials();
    assert.deepEqual([...recovered.restoredPreDispatchItemIds], [fixture.first.id]);
    assert.deepEqual(copy(api.Store.statuses.orders['order-1']), previousOrderStatus);
    assert.deepEqual(copy(api.Store.statuses.outreach['order-1'].review_request), previousOutreach);
    assert.equal(api.Store.campaign.items[0].status, 'inserted');
});

test('inserted campaign journal repairs its draft and outreach ledger before resume', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    installGuidedFixture(environment);
    const draftText = 'Prepared review request';
    const draftDigest = await api.sha256Text(draftText);
    const campaign = copy(api.Store.campaign);
    campaign.items[0].draftText = draftText;
    campaign.items[0].draftDigest = draftDigest;
    campaign.items[0].insertedAt = '2026-08-30T10:00:00.000Z';
    const statuses = copy(api.Store.statuses);
    statuses.orders['order-1'].status = 'draft';
    delete statuses.orders['order-1'].messageHash;
    delete statuses.orders['order-1'].messageDigest;
    statuses.outreach['order-1'].review_request.workflow = 'queued';
    delete statuses.outreach['order-1'].review_request.messageHash;
    storage.set(api.KEYS.campaign, copy(campaign));
    storage.set(api.KEYS.statuses, copy(statuses));
    api.Store.commitCoordinatedState(campaign, statuses, { invalidate: false, refresh: false });

    await api.Campaign.recoverDurableSendPartials();
    assert.equal(api.Store.statuses.orders['order-1'].status, 'inserted');
    assert.equal(api.Store.statuses.orders['order-1'].messageHash, api.hashText(draftText));
    assert.equal(api.Store.statuses.orders['order-1'].messageDigest, draftDigest);
    assert.equal(api.Store.statuses.outreach['order-1'].review_request.workflow, 'prepared');
    assert.equal(api.Store.statuses.outreach['order-1'].review_request.messageHash, api.hashText(draftText));
});

test('terminal durable send proof cannot be overwritten by a new campaign', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    installPendingResolutionFixture(environment);
    const campaign = copy(api.Store.campaign);
    campaign.status = 'completed';
    campaign.completedAt = '2026-08-30T10:00:00.000Z';
    campaign.items[0].status = 'sent';
    campaign.items[0].sendResolutionOutcome = 'verified';
    campaign.items[0].sendResolutionToken = campaign.items[0].sendAttemptToken;
    storage.set(api.KEYS.campaign, copy(campaign));
    api.Store.commitCoordinatedState(campaign, api.Store.statuses, { invalidate: false, refresh: false });

    await assert.rejects(
        api.Store.saveCampaignLocked({
            id: 'replacement-campaign', status: 'initializing', revision: 0, currentIndex: 0, items: [],
        }, { expectedRevision: 0 }),
        /Önceki kampanyanın kalıcı gönderim sonucu/,
    );
    assert.equal(storage.get(api.KEYS.campaign).id, campaign.id);
});

test('a draft resolved as not sent can be dispatched and verified on a fresh attempt', async () => {
    const environment = await loadAssistant();
    const { api } = environment;
    installPendingResolutionFixture(environment);
    assert.equal(await api.Campaign.resolvePendingSend('order-1', 'not_sent'), 'not_sent');
    assert.equal(api.Store.campaign.items[0].sendResolutionOutcome, 'not_sent');

    let outgoing = false;
    const button = makeNativeSendButton(() => { outgoing = true; });
    const textarea = { value: 'Edited final text', offsetParent: {} };
    api.MessageAdapter.getTextarea = () => textarea;
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

test('campaign resume refuses an already occupied composer before reserving or auto-sending', async () => {
    const environment = await loadAssistant();
    const { api, sandbox } = environment;
    sandbox.location.pathname = '/messages/order-1';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/order-1';
    api.Store.settings.replyInCustomerLanguage = false;
    api.Store.settings.autoSendCampaign = true;
    await api.Campaign.create([{
        orderId: 'order-1',
        customerName: 'Ashley',
        itemTitle: 'Custom Team Shirt',
        messageUrl: sandbox.location.href,
    }], 'tpl-delivered', 'template');

    const textarea = { value: 'My unsent manual Etsy draft', offsetParent: {} };
    const originals = {
        getTextarea: api.MessageAdapter.getTextarea,
        insert: api.MessageAdapter.insert,
        autoSendIfCurrent: api.Campaign.autoSendIfCurrent,
    };
    let insertCalls = 0;
    let autoSendCalls = 0;
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.insert = () => { insertCalls += 1; };
    api.Campaign.autoSendIfCurrent = async () => { autoSendCalls += 1; return true; };

    try {
        await assert.rejects(api.Campaign.resume(), /gönderilmemiş.*taslak|taslağ.*koru/i);
        assert.equal(textarea.value, 'My unsent manual Etsy draft');
        assert.equal(insertCalls, 0);
        assert.equal(autoSendCalls, 0);
        assert.equal(api.Store.campaign.items[0].status, 'pending');
        assert.equal(api.Store.statuses.orders['order-1'].status, 'draft');
        assert.equal(api.Store.campaign.items[0].reservation, undefined);
    } finally {
        api.MessageAdapter.getTextarea = originals.getTextarea;
        api.MessageAdapter.insert = originals.insert;
        api.Campaign.autoSendIfCurrent = originals.autoSendIfCurrent;
    }
});

test('order-compose resume replaces only the exact Etsy prefill and never auto-sends', async () => {
    const environment = await loadAssistant();
    const { api, sandbox } = environment;
    const orderId = '9876543210';
    const customerName = 'Fixture Buyer';
    const orderComposeUrl = `https://www.etsy.com/your/orders/sold/completed?ref=seller-platform-mcnav&expand_convo=true&order_id=${orderId}`;
    const identity = `compose:order:receipt:${orderId}`;
    const purchasePrefill = `https://www.etsy.com/your/purchases/${orderId}`;
    sandbox.location.pathname = '/your/orders/sold/completed';
    sandbox.location.search = `?ref=seller-platform-mcnav&expand_convo=true&order_id=${orderId}`;
    sandbox.location.href = orderComposeUrl;
    api.Store.settings.replyInCustomerLanguage = false;
    api.Store.settings.autoSendCampaign = true;
    await api.Campaign.create([{
        orderId,
        customerName,
        itemTitle: 'Custom Team Shirt',
        messageUrl: orderComposeUrl,
    }], 'tpl-delivered', 'template');
    assert.equal(api.campaignAutoSendAllowed(api.Store.campaign.items[0], { autoSendCampaign: true }), true,
        'the fixture purpose would normally permit automatic campaign sending');

    const textarea = { value: purchasePrefill, offsetParent: {} };
    const context = {
        conversationId: identity,
        customerName,
        customerFirstName: 'Fixture',
        orderId,
        itemTitle: 'Custom Team Shirt',
        messages: [],
        lastCustomerMessage: '',
        routeFingerprint: api.Router.routeFingerprint(),
    };
    const originals = {
        getTextarea: api.MessageAdapter.getTextarea,
        waitForTextarea: api.MessageAdapter.waitForTextarea,
        context: api.MessageAdapter.context,
        insert: api.MessageAdapter.insert,
        autoSendIfCurrent: api.Campaign.autoSendIfCurrent,
        open: api.UI.open,
        toast: api.UI.toast,
    };
    let insertCalls = 0;
    let autoSendCalls = 0;
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.waitForTextarea = async () => textarea;
    api.MessageAdapter.context = () => context;
    api.MessageAdapter.insert = (text, target) => {
        insertCalls += 1;
        target.value = text;
    };
    api.Campaign.autoSendIfCurrent = async () => { autoSendCalls += 1; return true; };
    api.UI.open = () => {};
    api.UI.toast = () => {};

    try {
        assert.equal(await api.Campaign.resume(), true);
        assert.equal(insertCalls, 1);
        assert.notEqual(textarea.value, purchasePrefill);
        assert.match(textarea.value, /Fixture/i);
        assert.equal(autoSendCalls, 0, 'the order drawer requires an explicit manual Send action');
        assert.equal(api.Store.campaign.items[0].status, 'inserted');
        assert.equal(api.Store.statuses.orders[orderId].status, 'inserted');
    } finally {
        Object.assign(api.MessageAdapter, {
            getTextarea: originals.getTextarea,
            waitForTextarea: originals.waitForTextarea,
            context: originals.context,
            insert: originals.insert,
        });
        api.Campaign.autoSendIfCurrent = originals.autoSendIfCurrent;
        api.UI.open = originals.open;
        api.UI.toast = originals.toast;
    }
});

test('order-compose resume waits for delayed exact order and buyer context across a safe composer remount', async () => {
    const environment = await loadAssistant();
    const { api, sandbox } = environment;
    const orderId = '9876543210';
    const customerName = 'Fixture Buyer';
    const orderComposeUrl = `https://www.etsy.com/your/orders/sold/completed?ref=seller-platform-mcnav&expand_convo=true&order_id=${orderId}`;
    const identity = `compose:order:receipt:${orderId}`;
    const purchasePrefill = `https://www.etsy.com/your/purchases/${orderId}`;
    sandbox.location.pathname = '/your/orders/sold/completed';
    sandbox.location.search = `?ref=seller-platform-mcnav&expand_convo=true&order_id=${orderId}`;
    sandbox.location.href = orderComposeUrl;
    api.Store.settings.replyInCustomerLanguage = false;
    api.Store.settings.autoSendCampaign = true;
    await api.Campaign.create([{
        orderId,
        customerName,
        itemTitle: 'Custom Team Shirt',
        messageUrl: orderComposeUrl,
    }], 'tpl-delivered', 'template');

    const firstTextarea = { value: purchasePrefill, offsetParent: {} };
    const hydratedTextarea = { value: purchasePrefill, offsetParent: {} };
    let currentTextarea = firstTextarea;
    let contextReads = 0;
    let insertCalls = 0;
    let insertedInto = null;
    let autoSendCalls = 0;
    const originals = {
        getTextarea: api.MessageAdapter.getTextarea,
        waitForTextarea: api.MessageAdapter.waitForTextarea,
        context: api.MessageAdapter.context,
        insert: api.MessageAdapter.insert,
        autoSendIfCurrent: api.Campaign.autoSendIfCurrent,
        open: api.UI.open,
        toast: api.UI.toast,
    };
    api.Campaign.contextHydrationTimeoutMs = 500;
    api.Campaign.contextHydrationPollMs = 25;
    api.MessageAdapter.getTextarea = () => currentTextarea;
    api.MessageAdapter.waitForTextarea = async () => currentTextarea;
    api.MessageAdapter.context = () => {
        contextReads += 1;
        if (contextReads === 1) {
            currentTextarea = hydratedTextarea;
            return {
                conversationId: identity,
                customerName: '',
                orderId: '',
                messages: [],
                lastCustomerMessage: '',
                routeFingerprint: api.Router.routeFingerprint(),
            };
        }
        return {
            conversationId: identity,
            customerName,
            customerFirstName: 'Fixture',
            orderId,
            itemTitle: 'Custom Team Shirt',
            messages: [],
            lastCustomerMessage: '',
            routeFingerprint: api.Router.routeFingerprint(),
        };
    };
    api.MessageAdapter.insert = (text, target) => {
        insertCalls += 1;
        insertedInto = target;
        target.value = text;
    };
    api.Campaign.autoSendIfCurrent = async () => { autoSendCalls += 1; return true; };
    api.UI.open = () => {};
    api.UI.toast = () => {};

    try {
        assert.equal(await api.Campaign.resume(), true);
        assert.ok(contextReads >= 2, 'missing order and buyer context must be polled until it hydrates');
        assert.equal(insertCalls, 1);
        assert.equal(insertedInto, hydratedTextarea, 'a remounted composer must be revalidated before insertion');
        assert.notEqual(hydratedTextarea.value, purchasePrefill);
        assert.equal(autoSendCalls, 0, 'the order drawer remains explicitly user-triggered');
        assert.equal(api.Store.campaign.items[0].status, 'inserted');
        assert.equal(api.Store.statuses.orders[orderId].status, 'inserted');
    } finally {
        Object.assign(api.MessageAdapter, {
            getTextarea: originals.getTextarea,
            waitForTextarea: originals.waitForTextarea,
            context: originals.context,
            insert: originals.insert,
        });
        api.Campaign.autoSendIfCurrent = originals.autoSendIfCurrent;
        api.UI.open = originals.open;
        api.UI.toast = originals.toast;
    }
});

test('order-compose resume fails closed on the first explicit customer mismatch without polling or insertion', async () => {
    const environment = await loadAssistant();
    const { api, sandbox } = environment;
    const orderId = '9876543210';
    const orderComposeUrl = `https://www.etsy.com/your/orders/sold/completed?ref=seller-platform-mcnav&expand_convo=true&order_id=${orderId}`;
    const identity = `compose:order:receipt:${orderId}`;
    const purchasePrefill = `https://www.etsy.com/your/purchases/${orderId}`;
    sandbox.location.pathname = '/your/orders/sold/completed';
    sandbox.location.search = `?ref=seller-platform-mcnav&expand_convo=true&order_id=${orderId}`;
    sandbox.location.href = orderComposeUrl;
    api.Store.settings.replyInCustomerLanguage = false;
    await api.Campaign.create([{
        orderId,
        customerName: 'Fixture Buyer',
        itemTitle: 'Custom Team Shirt',
        messageUrl: orderComposeUrl,
    }], 'tpl-delivered', 'template');

    const textarea = { value: purchasePrefill, offsetParent: {} };
    let contextReads = 0;
    let insertCalls = 0;
    let autoSendCalls = 0;
    const originals = {
        getTextarea: api.MessageAdapter.getTextarea,
        waitForTextarea: api.MessageAdapter.waitForTextarea,
        context: api.MessageAdapter.context,
        insert: api.MessageAdapter.insert,
        autoSendIfCurrent: api.Campaign.autoSendIfCurrent,
        open: api.UI.open,
        toast: api.UI.toast,
    };
    api.Campaign.contextHydrationTimeoutMs = 500;
    api.Campaign.contextHydrationPollMs = 25;
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.waitForTextarea = async () => textarea;
    api.MessageAdapter.context = () => {
        contextReads += 1;
        return {
            conversationId: identity,
            customerName: 'Wrong Buyer',
            orderId,
            messages: [],
            lastCustomerMessage: '',
            routeFingerprint: api.Router.routeFingerprint(),
        };
    };
    api.MessageAdapter.insert = () => { insertCalls += 1; };
    api.Campaign.autoSendIfCurrent = async () => { autoSendCalls += 1; return true; };
    api.UI.open = () => {};
    api.UI.toast = () => {};

    try {
        await assert.rejects(api.Campaign.resume(), /sipariş veya müşteri.*eşleşmiyor/i);
        assert.equal(contextReads, 1, 'an explicit mismatch must not be treated as incomplete hydration');
        assert.equal(insertCalls, 0);
        assert.equal(autoSendCalls, 0);
        assert.equal(textarea.value, purchasePrefill);
        assert.equal(api.Store.campaign.items[0].status, 'pending');
        assert.equal(api.Store.statuses.orders[orderId].status, 'draft');
        assert.equal(api.Store.campaign.items[0].reservation, undefined);
    } finally {
        Object.assign(api.MessageAdapter, {
            getTextarea: originals.getTextarea,
            waitForTextarea: originals.waitForTextarea,
            context: originals.context,
            insert: originals.insert,
        });
        api.Campaign.autoSendIfCurrent = originals.autoSendIfCurrent;
        api.UI.open = originals.open;
        api.UI.toast = originals.toast;
    }
});

test('campaign resume never overwrites a different occupied composer mounted while the draft is prepared', async () => {
    const environment = await loadAssistant();
    const { api, sandbox } = environment;
    sandbox.location.pathname = '/messages/order-1';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/order-1';
    api.Store.settings.replyInCustomerLanguage = false;
    api.Store.settings.autoSendCampaign = true;
    await api.Campaign.create([{
        orderId: 'order-1',
        customerName: 'Ashley',
        itemTitle: 'Custom Team Shirt',
        messageUrl: sandbox.location.href,
    }], 'tpl-delivered', 'template');

    let textarea = { value: '', offsetParent: {} };
    const originals = {
        getTextarea: api.MessageAdapter.getTextarea,
        context: api.MessageAdapter.context,
        insert: api.MessageAdapter.insert,
        autoSendIfCurrent: api.Campaign.autoSendIfCurrent,
    };
    let insertCalls = 0;
    let autoSendCalls = 0;
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.context = () => ({
        conversationId: 'order-1',
        customerName: 'Ashley',
        customerFirstName: 'Ashley',
        orderId: 'order-1',
        itemTitle: 'Custom Team Shirt',
        messages: [],
        lastCustomerMessage: '',
        routeFingerprint: api.Router.routeFingerprint(),
    });
    api.MessageAdapter.insert = () => { insertCalls += 1; };
    api.Campaign.autoSendIfCurrent = async () => { autoSendCalls += 1; return true; };

    try {
        const resume = api.Campaign.resume();
        await waitUntil(
            () => Boolean(api.Store.campaign.items[0].reservation),
            'campaign reservation was not acquired',
        );
        textarea = { value: 'My unsent manual Etsy draft', offsetParent: {} };

        await assert.rejects(resume, /gönderilmemiş.*taslak|taslağ.*koru/i);
        assert.equal(textarea.value, 'My unsent manual Etsy draft');
        assert.equal(insertCalls, 0);
        assert.equal(autoSendCalls, 0);
        assert.equal(api.Store.campaign.items[0].status, 'pending');
        assert.equal(api.Store.statuses.orders['order-1'].status, 'draft');
        assert.equal(api.Store.campaign.items[0].reservation, undefined);
    } finally {
        Object.assign(api.MessageAdapter, {
            getTextarea: originals.getTextarea,
            context: originals.context,
            insert: originals.insert,
        });
        api.Campaign.autoSendIfCurrent = originals.autoSendIfCurrent;
    }
});

test('campaign skip is state-preserving and rejects unresolved sends', async () => {
    const mismatchedEnvironment = await loadAssistant();
    const mismatchedFixture = installGuidedFixture(mismatchedEnvironment);
    const mismatchedBefore = {
        campaign: copy(mismatchedEnvironment.api.Store.campaign),
        statuses: copy(mismatchedEnvironment.api.Store.statuses),
    };

    const mismatched = await mismatchedEnvironment.api.Campaign.skipOrder('other-order', {
        expectedItemId: mismatchedFixture.first.id,
    });
    assert.equal(mismatched.skipped, false);
    assert.deepEqual(copy(mismatchedEnvironment.api.Store.campaign), mismatchedBefore.campaign);
    assert.deepEqual(copy(mismatchedEnvironment.api.Store.statuses), mismatchedBefore.statuses);

    const terminalEnvironment = await loadAssistant();
    installPendingResolutionFixture(terminalEnvironment);
    const terminalBefore = {
        campaign: copy(terminalEnvironment.api.Store.campaign),
        statuses: copy(terminalEnvironment.api.Store.statuses),
    };

    await assert.rejects(
        terminalEnvironment.api.Campaign.skipOrder('order-1'),
        /sonucu.*uzla|doğrulama/i,
    );
    assert.deepEqual(copy(terminalEnvironment.api.Store.campaign), terminalBefore.campaign);
    assert.deepEqual(copy(terminalEnvironment.api.Store.statuses), terminalBefore.statuses);
});

function configureMessageCenter(environment, overrides = {}) {
    const { api, sandbox } = environment;
    api.Store.settings = {
        ...api.Store.settings,
        messageCenterEnabled: true,
        messageCenterUrl: 'https://messages-a.example',
        messageCenterStoreId: 'shop-a',
        messageCenterAgentToken: 'token-a',
        ...overrides,
    };
    sandbox.location.pathname = '/messages/conversation-a';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/conversation-a';
    return api.MessageCenterAgent;
}

function messageCenterJob(overrides = {}) {
    return {
        id: 'job-1',
        type: 'reply',
        conversationId: 'conversation-a',
        conversationUrl: 'https://www.etsy.com/messages/conversation-a',
        text: 'Safe central reply',
        ...overrides,
    };
}

function fencedMessageCenterPending(agent, binding, job, stage, extra = {}) {
    return {
        job: copy(job),
        stage,
        leasedAt: new Date().toISOString(),
        ownerId: 'expired-owner',
        fenceToken: 'expired-fence',
        configId: agent.configId(binding),
        leaseExpiresAt: new Date(0).toISOString(),
        updatedAt: new Date().toISOString(),
        ...extra,
    };
}

function messageCenterButton(onClick) {
    const listeners = new Set();
    return {
        disabled: false,
        addEventListener(_type, listener) { listeners.add(listener); },
        removeEventListener(_type, listener) { listeners.delete(listener); },
        click() {
            for (const listener of [...listeners]) listener({ type: 'click' });
            onClick();
        },
    };
}

function installMessageCenterConversationFixture(environment, options = {}) {
    const { api } = environment;
    const textarea = options.textarea || { value: '', offsetParent: {} };
    const scope = options.scope || {
        id: 'conversation-scope',
        querySelectorAll: () => [],
    };
    let clicks = 0;
    const button = options.button || messageCenterButton(() => {
        clicks += 1;
        options.onClick?.(textarea);
    });
    const readContext = options.context || (() => ({
        conversationId: 'conversation-a',
        pageUrl: 'https://www.etsy.com/messages/conversation-a',
    }));
    api.MessageAdapter.waitForContext = async () => readContext();
    api.MessageAdapter.context = () => readContext();
    api.MessageAdapter.waitForTextarea = async () => textarea;
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.getConversationScope = () => scope;
    api.MessageAdapter.insert = (text, target) => { target.value = text; };
    api.MessageAdapter.getSendButton = () => button;
    api.MessageAdapter.countOutgoing = options.countOutgoing || (() => 0);
    api.MessageAdapter.waitForOutgoing = options.waitForOutgoing || (async () => true);
    api.UI.toast = () => {};
    api.UI.refreshCurrent = async () => {};
    return { textarea, scope, button, get clicks() { return clicks; } };
}

async function runInvalidMessageCenterJob(job) {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    const agent = configureMessageCenter(environment);
    const textarea = { value: '', offsetParent: {} };
    const results = [];
    let contextCalls = 0;
    let insertCalls = 0;
    let clickCalls = 0;
    agent.request = async (method, path, body) => {
        if (method === 'GET' && path.endsWith('/jobs/next')) return { job };
        if (path.includes('/result')) results.push(copy(body));
        return {};
    };
    agent.syncNow = async () => false;
    api.MessageAdapter.waitForContext = async () => {
        contextCalls += 1;
        return { conversationId: 'conversation-a' };
    };
    api.MessageAdapter.waitForTextarea = async () => textarea;
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.insert = (text, target) => { insertCalls += 1; target.value = text; };
    api.MessageAdapter.getSendButton = () => messageCenterButton(() => { clickCalls += 1; });
    api.MessageAdapter.waitForOutgoing = async () => true;

    await agent.processNextJob();
    return { agent, storage, results, contextCalls, insertCalls, clickCalls };
}

test('Message Center rejects an unknown job type before any Etsy DOM action', async () => {
    const job = messageCenterJob({ id: 'job-unknown', type: 'delete-conversation' });
    const result = await runInvalidMessageCenterJob(job);

    assert.equal(result.contextCalls, 0);
    assert.equal(result.insertCalls, 0);
    assert.equal(result.clickCalls, 0);
    assert.deepEqual(result.results, [{
        status: 'failed',
        retryable: false,
        error: 'unsupported_job_type',
    }]);
    assert.equal(result.storage.has(result.agent.pendingKey(result.agent.config())), false);
});

test('Message Center rejects a whitespace-only reply before any Etsy DOM action', async () => {
    const job = messageCenterJob({ id: 'job-empty-reply', text: '  \n\t  ' });
    const result = await runInvalidMessageCenterJob(job);

    assert.equal(result.contextCalls, 0);
    assert.equal(result.insertCalls, 0);
    assert.equal(result.clickCalls, 0);
    assert.deepEqual(result.results, [{
        status: 'failed',
        retryable: false,
        error: 'empty_reply_text',
    }]);
    assert.equal(result.storage.has(result.agent.pendingKey(result.agent.config())), false);
});

test('Message Center fences and fails a legacy pending record instead of blocking or dispatching it', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    const agent = configureMessageCenter(environment);
    const binding = agent.config();
    const job = messageCenterJob({ id: 'job-legacy' });
    storage.set(agent.pendingKey(binding), {
        job,
        stage: 'dispatched',
        baselineMatches: 0,
        updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const requests = [];
    let insertCalls = 0;
    let clickCalls = 0;
    agent.request = async (method, path, body) => {
        requests.push({ method, path, body: copy(body) });
        return {};
    };
    api.MessageAdapter.insert = () => { insertCalls += 1; };
    api.MessageAdapter.getSendButton = () => messageCenterButton(() => { clickCalls += 1; });

    await agent.processNextJob();

    assert.equal(insertCalls, 0);
    assert.equal(clickCalls, 0);
    assert.equal(requests.some(call => call.method === 'GET' && call.path.endsWith('/jobs/next')), false);
    assert.deepEqual(
        requests.filter(call => call.path.includes('/result')).map(call => call.body),
        [{ status: 'failed', retryable: false, error: 'legacy_pending_requires_manual_review' }],
    );
    assert.equal(storage.has(agent.pendingKey(binding)), false);
    assert.equal(storage.get(agent.legacyPendingKey(binding))?.pending?.job?.id, job.id);
    assert.match(agent.lastError, /legacy pending/i);
});

test('Message Center keeps a legacy rejection fenced and retries it after a result outage', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    const agent = configureMessageCenter(environment);
    const binding = agent.config();
    const job = messageCenterJob({ id: 'job-legacy-retry' });
    storage.set(agent.pendingKey(binding), {
        job,
        stage: 'prepared',
        updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const results = [];
    let resultAttempts = 0;
    let insertCalls = 0;
    let clickCalls = 0;
    agent.request = async (method, path, body) => {
        if (method === 'GET') throw new Error('legacy recovery must not lease another job');
        if (path.includes('/result')) {
            resultAttempts += 1;
            results.push(copy(body));
            if (resultAttempts === 1) throw new Error('result service offline');
        }
        return {};
    };
    api.MessageAdapter.insert = () => { insertCalls += 1; };
    api.MessageAdapter.getSendButton = () => messageCenterButton(() => { clickCalls += 1; });

    assert.equal(await agent.processNextJob(), false);
    const fenced = storage.get(agent.pendingKey(binding));
    assert.equal(fenced.stage, 'rejected');
    assert.equal(fenced.legacyBlocked, true);
    assert.equal(fenced.rejectionCode, 'legacy_pending_requires_manual_review');
    assert.ok(fenced.ownerId && fenced.fenceToken && fenced.configId);
    assert.match(agent.lastError, /result service offline/i);

    assert.equal(await agent.processNextJob(), false);
    assert.equal(resultAttempts, 2);
    assert.deepEqual(results, [
        { status: 'failed', retryable: false, error: 'legacy_pending_requires_manual_review' },
        { status: 'failed', retryable: false, error: 'legacy_pending_requires_manual_review' },
    ]);
    assert.equal(storage.has(agent.pendingKey(binding)), false);
    assert.equal(storage.get(agent.legacyPendingKey(binding))?.pending?.job?.id, job.id);
    assert.equal(insertCalls, 0);
    assert.equal(clickCalls, 0);
});

test('Message Center retries an accepted rejection after a lost response without returning to Etsy DOM', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    const agent = configureMessageCenter(environment);
    const binding = agent.config();
    const job = messageCenterJob({ id: 'job-rejection-response-lost' });
    const results = [];
    let resultAttempts = 0;
    let ownerConflict = true;
    let nextJobReads = 0;
    let contextReads = 0;
    let composerReads = 0;
    let clickCalls = 0;

    agent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) {
            nextJobReads += 1;
            return { job };
        }
        if (requestPath.includes('/result')) {
            resultAttempts += 1;
            results.push(copy(body));
            if (resultAttempts === 1) throw new Error('result accepted but response was lost');
        }
        return {};
    };
    api.Campaign.persistedSendOwnership = async () => ownerConflict;
    api.MessageAdapter.waitForContext = async () => { contextReads += 1; return null; };
    api.MessageAdapter.context = () => { contextReads += 1; return null; };
    api.MessageAdapter.waitForTextarea = async () => { composerReads += 1; return null; };
    api.MessageAdapter.getTextarea = () => { composerReads += 1; return null; };
    api.MessageAdapter.getSendButton = () => messageCenterButton(() => { clickCalls += 1; });

    assert.equal(await agent.processNextJob(), false);
    const rejected = storage.get(agent.pendingKey(binding));
    assert.equal(rejected.stage, 'rejected');
    assert.deepEqual(rejected.rejectionResult, {
        status: 'failed',
        retryable: true,
        error: 'etsy_send_owner_conflict',
    });
    assert.equal(resultAttempts, 1);

    ownerConflict = false;
    assert.equal(await agent.processNextJob(), false);
    assert.equal(resultAttempts, 2);
    assert.deepEqual(results, [
        { status: 'failed', retryable: true, error: 'etsy_send_owner_conflict' },
        { status: 'failed', retryable: true, error: 'etsy_send_owner_conflict' },
    ]);
    assert.equal(nextJobReads, 1, 'a rejected pending job must not lease a new Message Center job');
    assert.equal(contextReads, 0, 'a rejected pending job must never return to Etsy context discovery');
    assert.equal(composerReads, 0, 'a rejected pending job must never return to the Etsy composer');
    assert.equal(clickCalls, 0, 'a rejected pending job must never click Etsy Send');
    assert.equal(storage.has(agent.pendingKey(binding)), false);
});

test('Message Center fences a pre-dispatch failure before reporting and never re-enters Etsy after a lost response', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    const agent = configureMessageCenter(environment);
    const binding = agent.config();
    const job = messageCenterJob({ id: 'job-pre-dispatch-response-lost' });
    const textarea = { value: '', offsetParent: {} };
    const results = [];
    let resultAttempts = 0;
    let nextJobReads = 0;
    let composerAvailable = false;
    let contextReads = 0;
    let composerReads = 0;
    let insertCalls = 0;
    let clickCalls = 0;

    agent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) {
            nextJobReads += 1;
            return { job };
        }
        if (requestPath.includes('/result')) {
            resultAttempts += 1;
            results.push(copy(body));
            if (resultAttempts === 1) throw new Error('pre-dispatch result accepted but response was lost');
        }
        return {};
    };
    api.MessageAdapter.waitForContext = async () => {
        contextReads += 1;
        return { conversationId: 'conversation-a' };
    };
    api.MessageAdapter.waitForTextarea = async () => {
        composerReads += 1;
        return composerAvailable ? textarea : null;
    };
    api.MessageAdapter.getTextarea = () => {
        composerReads += 1;
        return composerAvailable ? textarea : null;
    };
    api.MessageAdapter.insert = (text, target) => { insertCalls += 1; target.value = text; };
    api.MessageAdapter.getSendButton = () => messageCenterButton(() => { clickCalls += 1; });

    assert.equal(await agent.processNextJob(), false);
    const rejected = storage.get(agent.pendingKey(binding));
    assert.equal(rejected.stage, 'rejected');
    assert.deepEqual(rejected.rejectionResult, {
        status: 'failed',
        retryable: true,
        error: 'Etsy cevap alanı bulunamadı.',
    });
    assert.equal(contextReads, 1);
    assert.equal(composerReads, 1);
    assert.equal(insertCalls, 0);
    assert.equal(clickCalls, 0);

    composerAvailable = true;
    contextReads = 0;
    composerReads = 0;
    assert.equal(await agent.processNextJob(), false);
    assert.equal(resultAttempts, 2);
    assert.deepEqual(results, [
        { status: 'failed', retryable: true, error: 'Etsy cevap alanı bulunamadı.' },
        { status: 'failed', retryable: true, error: 'Etsy cevap alanı bulunamadı.' },
    ]);
    assert.equal(nextJobReads, 1, 'the rejected pending failure must be retried before leasing any other job');
    assert.equal(contextReads, 0, 'the rejected failure retry must not rediscover Etsy context');
    assert.equal(composerReads, 0, 'the rejected failure retry must not inspect the now-available composer');
    assert.equal(insertCalls, 0, 'the rejected failure retry must not insert into Etsy');
    assert.equal(clickCalls, 0, 'the rejected failure retry must not click Etsy Send');
    assert.equal(storage.has(agent.pendingKey(binding)), false);
});

test('Message Center never inserts or clicks after the active conversation changes while resolving the composer', async () => {
    const environment = await loadAssistant();
    const { api, sandbox } = environment;
    const agent = configureMessageCenter(environment);
    const job = messageCenterJob();
    let resolveTextarea;
    let waitingForTextarea = false;
    const textareaReady = new Promise(resolve => { resolveTextarea = resolve; });
    const textareaA = { value: '', offsetParent: {} };
    const textareaB = { value: '', offsetParent: {} };
    let activeTextarea = textareaA;
    let insertCalls = 0;
    let clickCalls = 0;
    const resultCalls = [];

    agent.request = async (method, path) => {
        if (method === 'GET' && path.endsWith('/jobs/next')) return { job };
        if (path.includes('/result')) resultCalls.push({ method, path });
        return {};
    };
    api.MessageAdapter.waitForContext = async () => ({ conversationId: 'conversation-a' });
    api.MessageAdapter.context = () => ({
        conversationId: 'conversation-a',
        pageUrl: 'https://www.etsy.com/messages/conversation-a',
    });
    api.MessageAdapter.waitForTextarea = async () => { waitingForTextarea = true; return textareaReady; };
    api.MessageAdapter.getTextarea = () => activeTextarea;
    api.MessageAdapter.insert = (text, textarea) => { insertCalls += 1; textarea.value = text; };
    api.MessageAdapter.getSendButton = () => messageCenterButton(() => { clickCalls += 1; });

    const processing = agent.processNextJob();
    await waitUntil(() => waitingForTextarea, 'Message Center did not begin waiting for the composer');
    sandbox.location.pathname = '/messages/conversation-b';
    sandbox.location.href = 'https://www.etsy.com/messages/conversation-b';
    activeTextarea = textareaB;
    resolveTextarea(textareaB);
    await processing;

    assert.equal(insertCalls, 0);
    assert.equal(clickCalls, 0);
    assert.equal(textareaB.value, '');
    assert.equal(resultCalls.some(call => /status=sent/.test(call.path)), false);
});

test('Message Center revalidates a hydrate job after awaiting the conversation payload', async () => {
    const environment = await loadAssistant();
    const { api, sandbox } = environment;
    const agent = configureMessageCenter(environment);
    const job = messageCenterJob({ type: 'hydrate', text: '' });
    let resolvePayload;
    let waitingForPayload = false;
    const payloadReady = new Promise(resolve => { resolvePayload = resolve; });
    const requests = [];

    agent.request = async (method, path, body) => {
        requests.push({ method, path, body });
        if (method === 'GET' && path.endsWith('/jobs/next')) return { job };
        return {};
    };
    agent.currentConversationPayload = async () => { waitingForPayload = true; return payloadReady; };

    const processing = agent.processNextJob();
    await waitUntil(() => waitingForPayload, 'hydrate payload was not requested');
    sandbox.location.pathname = '/messages/conversation-b';
    sandbox.location.href = 'https://www.etsy.com/messages/conversation-b';
    resolvePayload({
        conversationId: 'conversation-b',
        conversationUrl: sandbox.location.href,
        buyerName: 'Buyer B',
        messages: [],
        hydrated: true,
    });
    await processing;

    assert.equal(requests.some(call => call.path.endsWith('/sync')), false);
    assert.equal(requests.some(call => call.path.includes('/result') && call.body?.status === 'completed'), false);
});

test('Message Center serializes tabs and uses its sent ledger to prevent a duplicate dispatch', async () => {
    const shared = {
        storage: new Map(),
        lockTails: new Map(),
        valueListeners: new Map(),
        requestedLocks: [],
    };
    const first = await loadAssistant(shared);
    const second = await loadAssistant(shared);
    const job = messageCenterJob();
    let clicks = 0;
    const results = [];

    for (const environment of [first, second]) {
        const { api } = environment;
        const agent = configureMessageCenter(environment);
        const textarea = { value: '', offsetParent: {} };
        const button = messageCenterButton(() => { clicks += 1; });
        agent.request = async (method, path, body) => {
            if (method === 'GET' && path.endsWith('/jobs/next')) return { job: copy(job) };
            if (path.includes('/result')) results.push(copy(body));
            return {};
        };
        api.MessageAdapter.waitForContext = async () => ({ conversationId: 'conversation-a' });
        api.MessageAdapter.waitForTextarea = async () => textarea;
        api.MessageAdapter.getTextarea = () => textarea;
        api.MessageAdapter.insert = (text, target) => { target.value = text; };
        api.MessageAdapter.getSendButton = () => button;
        api.MessageAdapter.waitForOutgoing = async () => true;
    }

    await Promise.all([
        first.api.MessageCenterAgent.processNextJob(),
        second.api.MessageCenterAgent.processNextJob(),
    ]);

    assert.equal(clicks, 1);
    assert.equal(results.filter(result => result.status === 'sent').length, 2);
    assert.equal(results.some(result => result.duplicatePrevented === true), true);
    assert.equal(shared.requestedLocks.filter(name => /message-center.*processor/i.test(name)).length, 2);
});

test('Message Center rejects a reused sent job id whose conversation or text changed', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    const agent = configureMessageCenter(environment);
    const binding = agent.config();
    const job = messageCenterJob({ text: 'A different reply must never be sent.' });
    storage.set(agent.sentLedgerKey(binding), {
        [job.id]: {
            at: new Date().toISOString(),
            conversationIdentity: 'conversation-a',
            textDigest: await api.sha256Text('The reply that was originally sent.'),
            textDigestVersion: 'sha256-utf8-v1',
            authorityId: agent.authorityId(binding),
            configId: agent.configId(binding),
        },
    });
    const results = [];
    let composerLookups = 0;
    agent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job: copy(job) };
        if (requestPath.includes('/result')) results.push(copy(body));
        return {};
    };
    api.MessageAdapter.waitForTextarea = async () => { composerLookups += 1; return null; };

    const processed = await agent.processNextJob();

    assert.equal(processed, false);
    assert.equal(composerLookups, 0, 'a conflicting sent job id must be rejected before any composer access');
    assert.deepEqual(results, [{
        status: 'failed',
        retryable: false,
        error: 'sent_ledger_job_conflict',
    }]);
    assert.match(agent.lastError, /aynı iş kimliğini farklı/i);
    assert.equal(storage.has(agent.pendingKey(binding)), false);
});

test('Message Center rejects a blank conversation URL instead of binding it to the current Etsy page', async () => {
    const environment = await loadAssistant();
    const { api } = environment;
    const agent = configureMessageCenter(environment);
    const job = messageCenterJob({ conversationUrl: '' });
    const results = [];
    let contextReads = 0;
    let composerReads = 0;
    agent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job };
        if (requestPath.includes('/result')) results.push(copy(body));
        return {};
    };
    api.MessageAdapter.waitForContext = async () => { contextReads += 1; return null; };
    api.MessageAdapter.waitForTextarea = async () => { composerReads += 1; return null; };

    assert.equal(await agent.processNextJob(), false);
    assert.equal(contextReads, 0);
    assert.equal(composerReads, 0);
    assert.deepEqual(results, [{
        status: 'failed',
        retryable: false,
        error: 'unsafe_conversation_url',
    }]);
});

test('Message Center fails before all Etsy DOM access when strong text digests are unavailable', async () => {
    const environment = await loadAssistant();
    const { api, sandbox } = environment;
    const agent = configureMessageCenter(environment);
    const job = messageCenterJob({ id: 'job-no-crypto' });
    const results = [];
    let contextReads = 0;
    let composerReads = 0;
    let clicks = 0;
    agent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job };
        if (requestPath.includes('/result')) results.push(copy(body));
        return {};
    };
    api.MessageAdapter.waitForContext = async () => { contextReads += 1; return null; };
    api.MessageAdapter.waitForTextarea = async () => { composerReads += 1; return null; };
    api.MessageAdapter.getSendButton = () => messageCenterButton(() => { clicks += 1; });
    sandbox.crypto = undefined;

    assert.equal(await agent.processNextJob(), false);
    assert.equal(contextReads, 0);
    assert.equal(composerReads, 0);
    assert.equal(clicks, 0);
    assert.deepEqual(results, [{
        status: 'failed',
        retryable: false,
        error: 'strong_text_digest_unavailable',
    }]);
});

test('Message Center never clears post-click evidence on ledger conflict or digest loss', async () => {
    const conflictEnvironment = await loadAssistant();
    const { api: conflictApi, storage: conflictStorage } = conflictEnvironment;
    const conflictAgent = configureMessageCenter(conflictEnvironment);
    const conflictBinding = conflictAgent.config();
    const conflictJob = messageCenterJob({ id: 'job-recover-ledger-conflict' });
    conflictStorage.set(conflictAgent.sentLedgerKey(conflictBinding), {
        [conflictJob.id]: {
            conversationIdentity: 'conversation-a',
            textDigest: await conflictApi.sha256Text('Different previously sent text'),
            textDigestVersion: 'sha256-utf8-v1',
            authorityId: conflictAgent.authorityId(conflictBinding),
            configId: conflictAgent.configId(conflictBinding),
        },
    });
    conflictStorage.set(conflictAgent.pendingKey(conflictBinding), fencedMessageCenterPending(
        conflictAgent,
        conflictBinding,
        conflictJob,
        'dispatched',
        { baselineMatches: 0, dispatchedAt: new Date().toISOString() },
    ));
    const conflictResults = [];
    let conflictDomReads = 0;
    conflictAgent.request = async (_method, requestPath, body) => {
        if (requestPath.includes('/result')) conflictResults.push(copy(body));
        return {};
    };
    conflictApi.MessageAdapter.waitForContext = async () => { conflictDomReads += 1; return null; };
    conflictApi.MessageAdapter.waitForTextarea = async () => { conflictDomReads += 1; return null; };
    assert.equal(await conflictAgent.processNextJob(), false);
    const conflictPending = conflictStorage.get(conflictAgent.pendingKey(conflictBinding));
    assert.equal(conflictPending.stage, 'ambiguous');
    assert.equal(conflictPending.ambiguityCode, 'recovering_sent_ledger_conflict_manual_review');
    assert.equal(conflictPending.globalHold, true);
    assert.equal(conflictDomReads, 0);
    assert.equal(conflictResults[0].manualReviewRequired, true);

    const digestEnvironment = await loadAssistant();
    const { api: digestApi, sandbox: digestSandbox, storage: digestStorage } = digestEnvironment;
    const digestAgent = configureMessageCenter(digestEnvironment);
    const digestBinding = digestAgent.config();
    const digestJob = messageCenterJob({ id: 'job-recover-no-digest' });
    digestStorage.set(digestAgent.pendingKey(digestBinding), fencedMessageCenterPending(
        digestAgent,
        digestBinding,
        digestJob,
        'recovering',
        { baselineMatches: 0, dispatchedAt: new Date().toISOString() },
    ));
    const digestResults = [];
    let digestDomReads = 0;
    digestAgent.request = async (_method, requestPath, body) => {
        if (requestPath.includes('/result')) digestResults.push(copy(body));
        return {};
    };
    digestApi.MessageAdapter.waitForContext = async () => { digestDomReads += 1; return null; };
    digestApi.MessageAdapter.waitForTextarea = async () => { digestDomReads += 1; return null; };
    digestSandbox.crypto = undefined;
    assert.equal(await digestAgent.processNextJob(), false);
    const digestPending = digestStorage.get(digestAgent.pendingKey(digestBinding));
    assert.equal(digestPending.stage, 'ambiguous');
    assert.equal(digestPending.ambiguityCode, 'recovering_strong_digest_unavailable_manual_review');
    assert.equal(digestPending.globalHold, true);
    assert.equal(digestDomReads, 0);
    assert.equal(digestResults[0].manualReviewRequired, true);
});

test('Message Center SHA-256 ledger separates astral emoji that collide under the legacy hash', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    const agent = configureMessageCenter(environment);
    const binding = agent.config();
    const job = messageCenterJob({ id: 'job-emoji-ledger', text: 'Order 😁' });
    storage.set(agent.sentLedgerKey(binding), {
        [job.id]: {
            at: new Date().toISOString(),
            conversationIdentity: 'conversation-a',
            textDigest: await api.sha256Text('Order 😀'),
            textDigestVersion: 'sha256-utf8-v1',
            authorityId: agent.authorityId(binding),
            configId: agent.configId(binding),
        },
    });
    const results = [];
    let composerReads = 0;
    agent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job };
        if (requestPath.includes('/result')) results.push(copy(body));
        return {};
    };
    api.MessageAdapter.waitForTextarea = async () => { composerReads += 1; return null; };

    assert.equal(await agent.processNextJob(), false);
    assert.equal(composerReads, 0);
    assert.deepEqual(results, [{
        status: 'failed', retryable: false, error: 'sent_ledger_job_conflict',
    }]);
});

test('Message Center can send a new job whose exact text already exists in conversation history', async () => {
    const environment = await loadAssistant();
    const { api } = environment;
    const agent = configureMessageCenter(environment);
    const job = messageCenterJob({ id: 'job-repeated-historical-text' });
    const results = [];
    let outgoingMatches = 1;
    const fixture = installMessageCenterConversationFixture(environment, {
        countOutgoing: () => outgoingMatches,
        onClick: () => { outgoingMatches = 2; },
        waitForOutgoing: async (_text, baseline) => outgoingMatches > baseline,
    });
    agent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job };
        if (requestPath.includes('/result')) results.push(copy(body));
        return {};
    };

    assert.equal(await agent.processNextJob(), true);
    assert.equal(fixture.clicks, 1);
    assert.equal(results.at(-1).status, 'sent');
    assert.equal(results.at(-1).duplicatePrevented, undefined);
});

test('Message Center never prunes older sent job tombstones when recording a new send', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    const agent = configureMessageCenter(environment);
    const binding = agent.config();
    const ledger = {};
    for (let index = 0; index < 300; index += 1) {
        ledger[`historical-job-${index}`] = {
            at: new Date(1_600_000_000_000 + index * 1000).toISOString(),
            conversationIdentity: 'conversation-a',
            textDigest: await api.sha256Text(`historical-text-${index}`),
            textDigestVersion: 'sha256-utf8-v1',
            authorityId: agent.authorityId(binding),
            configId: agent.configId(binding),
        };
    }
    storage.set(agent.sentLedgerKey(binding), ledger);
    const job = messageCenterJob({ id: 'job-after-large-ledger' });
    installMessageCenterConversationFixture(environment);
    agent.request = async (method, requestPath) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job };
        return {};
    };

    assert.equal(await agent.processNextJob(), true);
    const updated = storage.get(agent.sentLedgerKey(binding));
    assert.equal(Object.keys(updated).length, 301);
    assert.ok(updated['historical-job-0']);
    assert.ok(updated[job.id]);
});

test('Message Center keeps an ambiguous send fenced across job replay until manual resolution', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    const agent = configureMessageCenter(environment);
    const binding = agent.config();
    const job = messageCenterJob();
    const textarea = { value: '', offsetParent: {} };
    let clicks = 0;
    const button = messageCenterButton(() => { clicks += 1; });
    const results = [];
    agent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job: copy(job) };
        if (requestPath.includes('/result')) results.push(copy(body));
        return {};
    };
    api.MessageAdapter.waitForContext = async () => ({ conversationId: 'conversation-a' });
    api.MessageAdapter.context = () => ({
        conversationId: 'conversation-a',
        pageUrl: 'https://www.etsy.com/messages/conversation-a',
    });
    api.MessageAdapter.waitForTextarea = async () => textarea;
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.getConversationScope = () => ({
        id: 'conversation-scope',
        querySelectorAll: () => [],
    });
    api.MessageAdapter.insert = (text, target) => { target.value = text; };
    api.MessageAdapter.getSendButton = () => button;
    api.MessageAdapter.waitForOutgoing = async () => false;
    api.UI.toast = () => {};
    api.UI.refreshCurrent = async () => {};

    assert.equal(await agent.processNextJob(), false);
    assert.equal(clicks, 1);
    const ambiguous = storage.get(agent.pendingKey(binding));
    assert.equal(ambiguous.stage, 'ambiguous');
    assert.equal(ambiguous.ambiguityCode, 'send_verification_failed_manual_check_required');
    assert.equal(agent.manualReview.job.id, job.id);

    assert.equal(await agent.processNextJob(), false);
    assert.equal(clicks, 1, 'replaying an ambiguous job must never click Etsy Send again');
    assert.equal(results.filter(result => result.error === 'send_verification_failed_manual_check_required').length, 1);

    api.MessageAdapter.context = () => ({
        conversationId: 'conversation-b',
        pageUrl: 'https://www.etsy.com/messages/conversation-b',
    });
    await assert.rejects(agent.resolveManualReview('not_sent'), /aktif Etsy konuşmasına ait değil/i);
    assert.equal(storage.get(agent.pendingKey(binding)).stage, 'ambiguous');
    assert.equal(results.at(-1).error, 'send_verification_failed_manual_check_required');

    api.MessageAdapter.context = () => ({
        conversationId: 'conversation-a',
        pageUrl: 'https://www.etsy.com/messages/conversation-a',
    });
    assert.equal(await agent.resolveManualReview('not_sent'), 'not_sent');
    assert.equal(storage.has(agent.pendingKey(binding)), false);
    assert.equal(agent.manualReview, null);
    assert.equal(results.at(-1).error, 'manual_confirmed_not_sent');
    assert.equal(results.at(-1).retryable, true);
});

test('Message Center recovers from a post-ledger sync failure without a second Etsy click', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    const agent = configureMessageCenter(environment);
    const binding = agent.config();
    const job = messageCenterJob({ id: 'job-sync-recovery' });
    const results = [];
    const fixture = installMessageCenterConversationFixture(environment);
    agent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job };
        if (requestPath.includes('/result')) results.push(copy(body));
        return {};
    };
    let syncCalls = 0;
    agent.syncNow = async () => {
        syncCalls += 1;
        throw new Error('injected sync failure after sent ledger');
    };

    assert.equal(await agent.processNextJob(), false);
    assert.equal(fixture.clicks, 1);
    assert.equal(syncCalls, 1);
    assert.equal(storage.get(agent.pendingKey(binding)).stage, 'dispatched');
    assert.ok(storage.get(agent.sentLedgerKey(binding))[job.id].textDigest);

    assert.equal(await agent.processNextJob(), true);
    assert.equal(fixture.clicks, 1, 'ledger recovery must never click Etsy again');
    assert.equal(storage.has(agent.pendingKey(binding)), false);
    assert.deepEqual(results, [{
        status: 'sent',
        sentAt: results[0].sentAt,
        duplicatePrevented: true,
        recoveredFromLedger: true,
    }]);
});

test('Message Center retries one ambiguous result report without DOM replay or report spam', async () => {
    const environment = await loadAssistant();
    const { storage } = environment;
    const agent = configureMessageCenter(environment);
    const binding = agent.config();
    const job = messageCenterJob({ id: 'job-ambiguity-report-retry' });
    const fixture = installMessageCenterConversationFixture(environment, {
        waitForOutgoing: async () => false,
    });
    const resultBodies = [];
    let resultAttempts = 0;
    agent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job };
        if (requestPath.includes('/result')) {
            resultAttempts += 1;
            resultBodies.push(copy(body));
            if (resultAttempts === 1) throw new Error('injected result outage');
        }
        return {};
    };

    assert.equal(await agent.processNextJob(), false);
    assert.equal(fixture.clicks, 1);
    assert.equal(resultAttempts, 1);
    assert.equal(storage.get(agent.pendingKey(binding)).resultReportedAt, '');

    assert.equal(await agent.processNextJob(), false);
    assert.equal(fixture.clicks, 1);
    assert.equal(resultAttempts, 2);
    assert.ok(storage.get(agent.pendingKey(binding)).resultReportedAt);

    assert.equal(await agent.processNextJob(), false);
    assert.equal(fixture.clicks, 1);
    assert.equal(resultAttempts, 2, 'an acknowledged ambiguity must not report on every poll');
    assert.equal(resultBodies.every(body => body.manualReviewRequired === true), true);
});

test('late Etsy outgoing evidence overrides an unsafe not-sent Message Center decision', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    const agent = configureMessageCenter(environment);
    const binding = agent.config();
    const job = messageCenterJob({ id: 'job-late-outgoing' });
    let outgoingMatches = 0;
    const fixture = installMessageCenterConversationFixture(environment, {
        countOutgoing: () => outgoingMatches,
        waitForOutgoing: async () => false,
    });
    const results = [];
    agent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job };
        if (requestPath.includes('/result')) results.push(copy(body));
        return {};
    };

    assert.equal(await agent.processNextJob(), false);
    assert.equal(fixture.clicks, 1);
    const pending = storage.get(agent.pendingKey(binding));
    outgoingMatches = 1;

    assert.equal(await agent.resolveManualReview('not_sent', {
        jobId: job.id,
        ambiguityId: pending.ambiguityId,
    }), 'sent');
    assert.equal(storage.has(agent.pendingKey(binding)), false);
    assert.equal(results.at(-1).status, 'sent');
    assert.equal(results.at(-1).outgoingConfirmed, true);
    assert.equal(results.some(result => result.error === 'manual_confirmed_not_sent'), false);
});

test('a stale Message Center ambiguity control cannot resolve a newer pending job', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    const agent = configureMessageCenter(environment);
    const binding = agent.config();
    const newerJob = messageCenterJob({ id: 'job-newer-ambiguity' });
    storage.set(agent.pendingKey(binding), {
        job: newerJob,
        stage: 'ambiguous',
        ambiguityId: 'ambiguity-new',
        ambiguityCode: 'send_outcome_ambiguous_manual_check_required',
        resultReportedAt: new Date().toISOString(),
        baselineMatches: 0,
        ownerId: '',
        fenceToken: 'new-fence',
        configId: agent.configId(binding),
        leaseExpiresAt: new Date(0).toISOString(),
    });
    const results = [];
    agent.request = async (_method, requestPath, body) => {
        if (requestPath.includes('/result')) results.push(copy(body));
        return {};
    };
    api.MessageAdapter.getTextarea = () => null;

    await assert.rejects(
        agent.resolveManualReview('sent', { jobId: 'job-old', ambiguityId: 'ambiguity-old' }),
        /artık güncel değil/i,
    );
    assert.equal(storage.get(agent.pendingKey(binding)).job.id, newerJob.id);
    assert.equal(agent.manualReview.job.id, newerJob.id);
    assert.deepEqual(results, []);
});

test('Message Center rejects a declared conversation id that conflicts with its URL before DOM access', async () => {
    const environment = await loadAssistant();
    const { api } = environment;
    const agent = configureMessageCenter(environment);
    const job = messageCenterJob({ conversationId: 'conversation-b' });
    const results = [];
    let contextReads = 0;
    let composerReads = 0;
    agent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job: copy(job) };
        if (requestPath.includes('/result')) results.push(copy(body));
        return {};
    };
    api.MessageAdapter.waitForContext = async () => { contextReads += 1; return null; };
    api.MessageAdapter.waitForTextarea = async () => { composerReads += 1; return null; };

    assert.equal(await agent.processNextJob(), false);
    assert.equal(contextReads, 0);
    assert.equal(composerReads, 0);
    assert.deepEqual(results, [{
        status: 'failed',
        retryable: false,
        error: 'conversation_identity_conflict',
    }]);
});

test('Message Center defers without DOM access when a campaign owns the same conversation', async () => {
    const environment = await loadAssistant();
    const { api } = environment;
    const agent = configureMessageCenter(environment);
    installGuidedFixture(environment);
    const job = messageCenterJob({
        conversationId: 'order-1',
        conversationUrl: 'https://www.etsy.com/messages/order-1',
        text: 'Edited final text',
    });
    const results = [];
    let contextReads = 0;
    let composerReads = 0;
    agent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job: copy(job) };
        if (requestPath.includes('/result')) results.push(copy(body));
        return {};
    };
    api.MessageAdapter.waitForContext = async () => { contextReads += 1; return null; };
    api.MessageAdapter.waitForTextarea = async () => { composerReads += 1; return null; };

    assert.equal(await agent.processNextJob(), false);
    assert.equal(contextReads, 0);
    assert.equal(composerReads, 0);
    assert.deepEqual(results, [{
        status: 'failed',
        retryable: true,
        error: 'etsy_send_owner_conflict',
    }]);
    assert.equal(api.Store.campaign.items[0].status, 'inserted');
    assert.equal(api.Store.statuses.orders['order-1'].status, 'inserted');
});

test('Message Center reads persisted campaign ownership when another tab cache is stale', async () => {
    const shared = {
        storage: new Map(),
        lockTails: new Map(),
        valueListeners: new Map(),
    };
    const campaignTab = await loadAssistant(shared);
    const messageCenterTab = await loadAssistant(shared);
    installGuidedFixture(campaignTab);
    const { api } = messageCenterTab;
    const agent = configureMessageCenter(messageCenterTab);
    assert.equal(api.Store.campaign, null, 'the second tab intentionally starts with a stale campaign cache');
    const job = messageCenterJob({
        id: 'job-stale-campaign-cache',
        conversationId: 'order-1',
        conversationUrl: 'https://www.etsy.com/messages/order-1',
        text: 'Edited final text',
    });
    const results = [];
    let contextReads = 0;
    let composerReads = 0;
    agent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job };
        if (requestPath.includes('/result')) results.push(copy(body));
        return {};
    };
    api.MessageAdapter.waitForContext = async () => { contextReads += 1; return null; };
    api.MessageAdapter.waitForTextarea = async () => { composerReads += 1; return null; };

    assert.equal(await agent.processNextJob(), false);
    assert.equal(contextReads, 0);
    assert.equal(composerReads, 0);
    assert.deepEqual(results, [{
        status: 'failed', retryable: true, error: 'etsy_send_owner_conflict',
    }]);
});

test('a persistent Message Center hold blocks only the matching campaign conversation', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    const agent = configureMessageCenter(environment);
    const binding = agent.config();
    const pending = {
        job: messageCenterJob({ id: 'job-campaign-hold' }),
        stage: 'ambiguous',
        ambiguityId: 'ambiguity-campaign-hold',
        ownerId: 'other-tab',
        fenceToken: 'hold-fence',
        configId: agent.configId(binding),
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    storage.set(agent.pendingKey(binding), copy(pending));
    const statusesBefore = copy(api.Store.statuses);

    await assert.rejects(api.Campaign.create([{
        orderId: 'order-a', customerName: 'Ashley', itemTitle: 'Item A',
        messageUrl: 'https://www.etsy.com/messages/conversation-a',
    }], 'tpl-delivered', 'template'), /bekleyen Message Center/i);
    assert.equal(api.Store.campaign, null);
    assert.deepEqual(copy(api.Store.statuses), statusesBefore);

    const allowed = await api.Campaign.create([{
        orderId: 'order-b', customerName: 'Morgan', itemTitle: 'Item B',
        messageUrl: 'https://www.etsy.com/messages/conversation-b',
    }], 'tpl-delivered', 'template');
    assert.equal(allowed.status, 'active');
    assert.equal(allowed.items[0].orderId, 'order-b');
});

test('Message Center configuration import cannot orphan a pending ambiguous send', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    const agent = configureMessageCenter(environment);
    const binding = agent.config();
    const pending = {
        job: messageCenterJob({ id: 'job-config-guard' }),
        stage: 'ambiguous',
        ambiguityId: 'ambiguity-config-guard',
        ownerId: 'other-tab',
        fenceToken: 'config-fence',
        configId: agent.configId(binding),
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    storage.set(agent.pendingKey(binding), copy(pending));
    agent.manualReview = copy(pending);
    const beforeSettings = copy(api.Store.settings);
    const snapshot = api.ConfigManager.snapshot(true);
    snapshot.settings.messageCenterEnabled = false;
    snapshot.settings.messageCenterUrl = 'https://messages-b.example';
    snapshot.settings.messageCenterStoreId = 'shop-b';
    snapshot.settings.messageCenterAgentToken = 'token-b';

    await assert.rejects(
        api.ConfigManager.importText(JSON.stringify(snapshot)),
        /Bekleyen Message Center gönderimi çözülmeden/i,
    );
    assert.deepEqual(copy(api.Store.settings), beforeSettings);
    assert.equal(storage.get(agent.pendingKey(binding)).job.id, pending.job.id);
    assert.equal(agent.manualReview.job.id, pending.job.id);
});

test('manual review navigation preserves a draft and only opens the canonical Etsy conversation', async () => {
    const environment = await loadAssistant();
    const { api, sandbox } = environment;
    const agent = configureMessageCenter(environment);
    sandbox.location.pathname = '/messages/conversation-b';
    sandbox.location.href = 'https://www.etsy.com/messages/conversation-b';
    const textarea = { value: 'Do not lose this Etsy draft', offsetParent: {} };
    api.MessageAdapter.getTextarea = () => textarea;
    agent.manualReview = {
        stage: 'ambiguous',
        ambiguityId: 'ambiguity-open',
        job: messageCenterJob({ id: 'job-open-review' }),
    };

    await assert.rejects(
        async () => agent.openManualReviewConversation(),
        /gönderilmemiş manuel taslak/i,
    );
    assert.equal(sandbox.location.href, 'https://www.etsy.com/messages/conversation-b');

    textarea.value = '';
    assert.equal(agent.openManualReviewConversation(), true);
    assert.equal(sandbox.location.href, 'https://www.etsy.com/messages/conversation-a');

    agent.manualReview.job.conversationUrl = 'https://evil.example/messages/conversation-a';
    await assert.rejects(async () => agent.openManualReviewConversation(), /güvenli bir Etsy konuşma/i);
    assert.equal(sandbox.location.href, 'https://www.etsy.com/messages/conversation-a');
});

test('send errors provide actionable retry and reconciliation guidance', async () => {
    const { api } = await loadAssistant();
    const ambiguous = api.sendErrorGuidance(new Error('Gönderim doğrulanamadı'));
    const missingButton = api.sendErrorGuidance(new Error('Etkin Etsy Gönder düğmesi bulunamadı.'));
    const changedContext = api.sendErrorGuidance(new Error('Konuşma veya hazırlanan metin değişti.'));
    const conflictError = new Error('ledger conflict');
    conflictError.code = 'MESSAGE_CENTER_SENT_LEDGER_CONFLICT';
    const conflict = api.sendErrorGuidance(conflictError);

    assert.equal(ambiguous.code, 'send_result_ambiguous');
    assert.match(ambiguous.message, /yeniden göndermeyin/i);
    assert.match(ambiguous.message, /son mesaj balonunu kontrol/i);
    assert.doesNotMatch(ambiguous.message, /Gönderildi.*Gönderilmedi/i);
    assert.equal(missingButton.code, 'send_button_unavailable');
    assert.match(missingButton.message, /Hiçbir gönderim yapılmadı/i);
    assert.equal(changedContext.code, 'send_context_changed');
    assert.match(changedContext.message, /doğru siparişi yeniden aç/i);
    assert.equal(conflict.code, 'message_center_job_conflict');
    assert.match(conflict.message, /gönderim engellendi/i);
});

test('settings render durable Message Center ambiguity controls only for the matching conversation', async () => {
    const { api } = await loadAssistant();
    api.MessageCenterAgent.manualReview = {
        stage: 'ambiguous',
        ambiguityId: 'ambiguity-1',
        job: messageCenterJob(),
    };
    api.MessageCenterAgent.manualReviewContextIsCurrent = () => true;
    const matchingMarkup = api.UI.renderSettings();
    assert.match(matchingMarkup, /Message Center gönderim sonucu belirsiz/);
    assert.match(matchingMarkup, /data-action="message-center-confirm-sent"(?! disabled)/);
    assert.match(matchingMarkup, /data-action="message-center-confirm-not-sent"(?! disabled)/);

    api.MessageCenterAgent.manualReviewContextIsCurrent = () => false;
    const otherConversationMarkup = api.UI.renderSettings();
    assert.match(otherConversationMarkup, /<button[^>]*data-action="message-center-confirm-sent"[^>]*\sdisabled(?:\s|>)/);
    assert.match(otherConversationMarkup, /ilgili Etsy konuşmasını bu sekmede açın/);
});

test('Message Center fenced clear cannot delete another tab owner pending record', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    const agent = configureMessageCenter(environment);
    const binding = agent.config();
    const key = agent.pendingKey(binding);
    const pending = {
        job: messageCenterJob(),
        stage: 'leased',
        ownerId: 'other-tab',
        fenceToken: 'other-fence',
        configId: agent.configId(binding),
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    storage.set(key, copy(pending));

    const cleared = await agent.clearPending({
        pendingKey: key,
        jobId: pending.job.id,
        ownerId: agent.tabId,
        fenceToken: 'my-fence',
        configId: pending.configId,
    });

    assert.equal(cleared, false);
    assert.deepEqual(storage.get(key), pending);
});

test('Message Center disable or config generation change cancels an in-flight job before insert and report', async () => {
    const environment = await loadAssistant();
    const { api } = environment;
    const agent = configureMessageCenter(environment);
    const job = messageCenterJob();
    let resolveTextarea;
    let waitingForTextarea = false;
    const textareaReady = new Promise(resolve => { resolveTextarea = resolve; });
    const textarea = { value: '', offsetParent: {} };
    let inserts = 0;
    let clicks = 0;
    const jobResults = [];

    agent.request = async (method, path, body) => {
        if (method === 'GET' && path.endsWith('/jobs/next')) return { job };
        if (path.includes(`/jobs/${job.id}/result`)) jobResults.push({ path, body });
        return {};
    };
    api.MessageAdapter.waitForContext = async () => ({ conversationId: 'conversation-a' });
    api.MessageAdapter.waitForTextarea = async () => { waitingForTextarea = true; return textareaReady; };
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.insert = () => { inserts += 1; };
    api.MessageAdapter.getSendButton = () => messageCenterButton(() => { clicks += 1; });

    const processing = agent.processNextJob();
    await waitUntil(() => waitingForTextarea, 'Message Center did not reach the deferred composer');
    api.Store.settings.messageCenterEnabled = false;
    await agent.reconfigure();
    resolveTextarea(textarea);
    await processing;

    assert.equal(inserts, 0);
    assert.equal(clicks, 0);
    assert.deepEqual(jobResults, []);
    assert.ok(environment.storage.get(agent.pendingKey({ ...agent.config(), storeId: 'shop-a' })));

    const changedEnvironment = await loadAssistant();
    const changedAgent = configureMessageCenter(changedEnvironment);
    const changedJob = messageCenterJob({ id: 'job-config-change' });
    const changedTextarea = { value: '', offsetParent: {} };
    let resolveChangedTextarea;
    let changedWaiting = false;
    let changedInserts = 0;
    let changedClicks = 0;
    const changedRequests = [];
    const changedTextareaReady = new Promise(resolve => { resolveChangedTextarea = resolve; });
    changedAgent.request = async (method, path, body, binding) => {
        changedRequests.push({ method, path, body, binding: binding && { ...binding } });
        if (method === 'GET' && path.endsWith('/jobs/next')) return { job: changedJob };
        return {};
    };
    changedAgent.schedule = () => {};
    changedAgent.heartbeat = async () => true;
    changedAgent.syncNow = async () => false;
    changedEnvironment.api.MessageAdapter.waitForContext = async () => ({ conversationId: 'conversation-a' });
    changedEnvironment.api.MessageAdapter.waitForTextarea = async () => {
        changedWaiting = true;
        return changedTextareaReady;
    };
    changedEnvironment.api.MessageAdapter.getTextarea = () => changedTextarea;
    changedEnvironment.api.MessageAdapter.insert = () => { changedInserts += 1; };
    changedEnvironment.api.MessageAdapter.getSendButton = () => messageCenterButton(() => { changedClicks += 1; });

    const changedProcessing = changedAgent.processNextJob();
    await waitUntil(() => changedWaiting, 'Message Center did not reach the config-change checkpoint');
    changedEnvironment.api.Store.settings.messageCenterStoreId = 'shop-b';
    changedEnvironment.api.Store.settings.messageCenterAgentToken = 'token-b';
    changedEnvironment.api.Store.settings.messageCenterUrl = 'https://messages-b.example';
    const reconfiguration = changedAgent.reconfigure();
    resolveChangedTextarea(changedTextarea);
    await changedProcessing;
    await reconfiguration;

    assert.equal(changedInserts, 0);
    assert.equal(changedClicks, 0);
    assert.equal(changedRequests.some(call => call.path.includes('/result')), false);
    assert.deepEqual(
        changedRequests.find(call => call.method === 'GET')?.binding,
        {
            enabled: true,
            storeId: 'shop-a',
            token: 'token-a',
            serverUrl: 'https://messages-a.example',
            syncSeconds: 10,
            pollSeconds: 3,
        },
    );
    assert.ok(changedEnvironment.storage.get(changedAgent.pendingKey({ storeId: 'shop-a' })));
});

test('Message Center sync is single-flight and converts network rejection into visible agent state', async () => {
    const environment = await loadAssistant();
    const { api } = environment;
    const agent = configureMessageCenter(environment);
    let resolvePayload;
    let payloadCalls = 0;
    let requestCalls = 0;
    const payloadReady = new Promise(resolve => { resolvePayload = resolve; });
    agent.scanConversationList = () => [];
    agent.currentConversationPayload = async () => { payloadCalls += 1; return payloadReady; };
    agent.request = async () => { requestCalls += 1; throw new Error('central sync offline'); };

    const first = agent.syncNow();
    const second = agent.syncNow();
    resolvePayload({
        conversationId: 'conversation-a',
        conversationUrl: 'https://www.etsy.com/messages/conversation-a',
        buyerName: 'Buyer A',
        messages: [],
        hydrated: true,
    });

    assert.equal(await first, false);
    assert.equal(await second, false);
    assert.equal(payloadCalls, 1);
    assert.equal(requestCalls, 1);
    assert.match(agent.lastError, /central sync offline/);
    assert.equal(agent.syncPromise, null);
});

test('Message Center queues hydrated and changed-binding syncs behind a shallow sync', async () => {
    const environment = await loadAssistant();
    const { api } = environment;
    const agent = configureMessageCenter(environment);
    let releaseFirst;
    const firstGate = new Promise(resolve => { releaseFirst = resolve; });
    const calls = [];
    agent.syncOnce = async options => {
        calls.push({ hydrated: options.hydrated === true, generation: options.generation, binding: { ...options.binding } });
        if (calls.length === 1) await firstGate;
        return true;
    };
    const initialBinding = agent.config();
    const changedBinding = { ...initialBinding, token: 'token-b' };
    const shallow = agent.syncNow({ hydrated: false, binding: initialBinding, generation: agent.generation });
    await waitUntil(() => calls.length === 1, 'shallow sync did not start');
    const hydrated = agent.syncNow({ hydrated: true, binding: initialBinding, generation: agent.generation });
    const changed = agent.syncNow({ hydrated: false, binding: changedBinding, generation: agent.generation + 1 });
    releaseFirst();
    assert.deepEqual(await Promise.all([shallow, hydrated, changed]), [true, true, true]);
    assert.equal(calls.length, 3);
    assert.deepEqual(calls.map(call => ({ hydrated: call.hydrated, generation: call.generation, token: call.binding.token })), [
        { hydrated: false, generation: agent.generation, token: 'token-a' },
        { hydrated: true, generation: agent.generation, token: 'token-a' },
        { hydrated: false, generation: agent.generation + 1, token: 'token-b' },
    ]);
});

test('Message Center sent tombstones are scoped by server and survive token rotation for one authority', async () => {
    const changedServerEnvironment = await loadAssistant();
    const changedServerAgent = configureMessageCenter(changedServerEnvironment);
    const changedServerJob = messageCenterJob({ id: 'job-authority-scope' });
    const changedServerFixture = installMessageCenterConversationFixture(changedServerEnvironment);
    const changedServerResults = [];
    changedServerAgent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job: copy(changedServerJob) };
        if (requestPath.includes('/result')) changedServerResults.push(copy(body));
        return {};
    };
    const authorityA = changedServerAgent.config();
    assert.equal(await changedServerAgent.processNextJob(), true);
    changedServerFixture.textarea.value = '';
    changedServerEnvironment.api.Store.settings.messageCenterUrl = 'https://messages-b.example';
    changedServerEnvironment.api.Store.settings.messageCenterAgentToken = 'token-b';
    const authorityB = changedServerAgent.config();
    assert.notEqual(changedServerAgent.sentLedgerKey(authorityA), changedServerAgent.sentLedgerKey(authorityB));
    assert.equal(await changedServerAgent.processNextJob(), true);
    assert.equal(changedServerFixture.clicks, 2, 'a different server authority must not inherit a sent tombstone');
    assert.equal(changedServerResults.at(-1).duplicatePrevented, undefined);

    const rotatedEnvironment = await loadAssistant();
    const rotatedAgent = configureMessageCenter(rotatedEnvironment);
    const rotatedJob = messageCenterJob({ id: 'job-token-rotation' });
    const rotatedFixture = installMessageCenterConversationFixture(rotatedEnvironment);
    const rotatedResults = [];
    rotatedAgent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job: copy(rotatedJob) };
        if (requestPath.includes('/result')) rotatedResults.push(copy(body));
        return {};
    };
    const beforeRotation = rotatedAgent.config();
    assert.equal(await rotatedAgent.processNextJob(), true);
    rotatedFixture.textarea.value = '';
    rotatedEnvironment.api.Store.settings.messageCenterAgentToken = 'rotated-token';
    const afterRotation = rotatedAgent.config();
    assert.equal(rotatedAgent.sentLedgerKey(beforeRotation), rotatedAgent.sentLedgerKey(afterRotation));
    assert.equal(await rotatedAgent.processNextJob(), true);
    assert.equal(rotatedFixture.clicks, 1, 'token rotation must retain the same authority tombstone');
    assert.equal(rotatedResults.at(-1).duplicatePrevented, true);
});

test('Message Center migrates only an exact legacy ledger binding and fences unknown legacy authority', async () => {
    const exactEnvironment = await loadAssistant();
    const exactAgent = configureMessageCenter(exactEnvironment);
    const exactBinding = exactAgent.config();
    const exactJob = messageCenterJob({ id: 'job-legacy-exact' });
    exactEnvironment.storage.set(exactAgent.legacySentLedgerKey(exactBinding), {
        [exactJob.id]: {
            conversationIdentity: 'conversation-a',
            textDigest: await exactEnvironment.api.sha256Text(exactJob.text),
            textDigestVersion: 'sha256-utf8-v1',
            configId: exactAgent.configId(exactBinding),
        },
    });
    const exactFixture = installMessageCenterConversationFixture(exactEnvironment);
    const exactResults = [];
    exactAgent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job: exactJob };
        if (requestPath.includes('/result')) exactResults.push(copy(body));
        return {};
    };
    assert.equal(await exactAgent.processNextJob(), true);
    assert.equal(exactFixture.clicks, 0);
    assert.equal(exactResults[0].duplicatePrevented, true);
    assert.equal(
        exactEnvironment.storage.get(exactAgent.sentLedgerKey(exactBinding))[exactJob.id].authorityId,
        exactAgent.authorityId(exactBinding),
    );

    const unknownEnvironment = await loadAssistant();
    const unknownAgent = configureMessageCenter(unknownEnvironment, { messageCenterAgentToken: 'new-token' });
    const unknownBinding = unknownAgent.config();
    const oldBinding = { ...unknownBinding, token: 'old-token' };
    const unknownJob = messageCenterJob({ id: 'job-legacy-unknown-authority' });
    unknownEnvironment.storage.set(unknownAgent.legacySentLedgerKey(unknownBinding), {
        [unknownJob.id]: {
            conversationIdentity: 'conversation-a',
            textDigest: await unknownEnvironment.api.sha256Text(unknownJob.text),
            textDigestVersion: 'sha256-utf8-v1',
            configId: unknownAgent.configId(oldBinding),
        },
    });
    const unknownFixture = installMessageCenterConversationFixture(unknownEnvironment);
    const unknownResults = [];
    unknownAgent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job: unknownJob };
        if (requestPath.includes('/result')) unknownResults.push(copy(body));
        return {};
    };
    assert.equal(await unknownAgent.processNextJob(), false);
    assert.equal(unknownFixture.clicks, 0);
    assert.deepEqual(unknownResults, [{ status: 'failed', retryable: false, error: 'sent_ledger_job_conflict' }]);
});

test('Message Center retries an acknowledged sent-ledger result loss with the exact durable envelope and no DOM replay', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    const agent = configureMessageCenter(environment);
    const binding = agent.config();
    const job = messageCenterJob({ id: 'job-ledger-result-loss' });
    storage.set(agent.sentLedgerKey(binding), {
        [job.id]: {
            at: new Date().toISOString(),
            conversationIdentity: 'conversation-a',
            textDigest: await api.sha256Text(job.text),
            textDigestVersion: 'sha256-utf8-v1',
            authorityId: agent.authorityId(binding),
            configId: agent.configId(binding),
        },
    });
    const resultBodies = [];
    let resultAttempts = 0;
    let contextReads = 0;
    let composerReads = 0;
    let clicks = 0;
    agent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job };
        if (requestPath.includes('/result')) {
            resultBodies.push(copy(body));
            resultAttempts += 1;
            if (resultAttempts === 1) throw new Error('sent result accepted but response lost');
        }
        return {};
    };
    api.MessageAdapter.waitForContext = async () => { contextReads += 1; return null; };
    api.MessageAdapter.waitForTextarea = async () => { composerReads += 1; return null; };
    api.MessageAdapter.getSendButton = () => messageCenterButton(() => { clicks += 1; });

    assert.equal(await agent.processNextJob(), false);
    assert.equal(storage.get(agent.pendingKey(binding)).stage, 'result_pending');
    assert.equal(await agent.processNextJob(), true);
    assert.deepEqual(resultBodies, [resultBodies[0], resultBodies[0]]);
    assert.equal(contextReads, 0);
    assert.equal(composerReads, 0);
    assert.equal(clicks, 0);
    assert.equal(storage.has(agent.pendingKey(binding)), false);
});

test('Message Center retries a completed hydrate result loss without repeating sync or Etsy discovery', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    const agent = configureMessageCenter(environment);
    const binding = agent.config();
    const job = messageCenterJob({ id: 'job-hydrate-result-loss', type: 'hydrate', text: undefined });
    let payloadReads = 0;
    let syncCalls = 0;
    let resultAttempts = 0;
    const resultBodies = [];
    agent.currentConversationPayload = async () => {
        payloadReads += 1;
        return {
            conversationId: 'conversation-a',
            conversationUrl: 'https://www.etsy.com/messages/conversation-a',
            buyerName: 'Buyer A',
            messages: [],
            hydrated: true,
        };
    };
    agent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job };
        if (requestPath.endsWith('/sync')) syncCalls += 1;
        if (requestPath.includes('/result')) {
            resultBodies.push(copy(body));
            resultAttempts += 1;
            if (resultAttempts === 1) throw new Error('hydrate result accepted but response lost');
        }
        return {};
    };

    assert.equal(await agent.processNextJob(), false);
    assert.equal(storage.get(agent.pendingKey(binding)).stage, 'result_pending');
    assert.equal(await agent.processNextJob(), true);
    assert.equal(payloadReads, 1);
    assert.equal(syncCalls, 1);
    assert.deepEqual(resultBodies, [resultBodies[0], resultBodies[0]]);
    assert.equal(storage.has(agent.pendingKey(binding)), false);
    assert.equal(api.Router.conversationIdentity(), 'conversation-a');
});

test('Message Center clears only its exact inserted draft on pre-click failure and preserves a pre-existing identical draft', async () => {
    const cleanEnvironment = await loadAssistant();
    const cleanAgent = configureMessageCenter(cleanEnvironment);
    const cleanJob = messageCenterJob({ id: 'job-safe-composer-cleanup' });
    const cleanTextarea = { value: '', offsetParent: {} };
    const cleanResults = [];
    cleanAgent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job: cleanJob };
        if (requestPath.includes('/result')) cleanResults.push(copy(body));
        return {};
    };
    cleanEnvironment.api.MessageAdapter.waitForContext = async () => ({
        conversationId: 'conversation-a', pageUrl: 'https://www.etsy.com/messages/conversation-a',
    });
    cleanEnvironment.api.MessageAdapter.waitForTextarea = async () => cleanTextarea;
    cleanEnvironment.api.MessageAdapter.getTextarea = () => cleanTextarea;
    cleanEnvironment.api.MessageAdapter.insert = (text, target) => { target.value = text; };
    cleanEnvironment.api.MessageAdapter.waitForSendButton = async () => null;
    cleanEnvironment.api.MessageAdapter.getSendButton = () => null;
    assert.equal(await cleanAgent.processNextJob(), false);
    assert.equal(cleanTextarea.value, '');
    assert.deepEqual(cleanResults, [{ status: 'failed', retryable: true, error: 'send_button_unavailable' }]);
    assert.equal(cleanEnvironment.storage.has(cleanAgent.pendingKey(cleanAgent.config())), false);

    const preservedEnvironment = await loadAssistant();
    const preservedAgent = configureMessageCenter(preservedEnvironment);
    const preservedJob = messageCenterJob({ id: 'job-preserve-identical-draft' });
    const preservedTextarea = { value: preservedJob.text, offsetParent: {} };
    const preservedResults = [];
    preservedAgent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job: preservedJob };
        if (requestPath.includes('/result')) preservedResults.push(copy(body));
        return {};
    };
    preservedEnvironment.api.MessageAdapter.waitForContext = async () => ({
        conversationId: 'conversation-a', pageUrl: 'https://www.etsy.com/messages/conversation-a',
    });
    preservedEnvironment.api.MessageAdapter.waitForTextarea = async () => preservedTextarea;
    preservedEnvironment.api.MessageAdapter.getTextarea = () => preservedTextarea;
    preservedEnvironment.api.MessageAdapter.insert = (text, target) => { target.value = text; };
    preservedEnvironment.api.MessageAdapter.waitForSendButton = async () => null;
    preservedEnvironment.api.MessageAdapter.getSendButton = () => null;
    assert.equal(await preservedAgent.processNextJob(), false);
    assert.equal(preservedTextarea.value, preservedJob.text);
    assert.equal(preservedEnvironment.storage.has(preservedAgent.pendingKey(preservedAgent.config())), false);
    assert.deepEqual(preservedResults, [{ status: 'failed', retryable: true, error: 'composer_occupied' }]);
});

test('Message Center quarantines unknown and prepared reply stages without Etsy DOM access', async () => {
    for (const stage of ['future_post_dispatch', 'prepared']) {
        const environment = await loadAssistant();
        const { api, storage } = environment;
        const agent = configureMessageCenter(environment);
        const binding = agent.config();
        const job = messageCenterJob({ id: `job-stage-${stage}` });
        storage.set(agent.pendingKey(binding), fencedMessageCenterPending(agent, binding, job, stage));
        let contextReads = 0;
        let composerReads = 0;
        let inserts = 0;
        let clicks = 0;
        let gets = 0;
        const results = [];
        agent.request = async (method, requestPath, body) => {
            if (method === 'GET') gets += 1;
            if (requestPath.includes('/result')) results.push(copy(body));
            return {};
        };
        api.MessageAdapter.waitForContext = async () => { contextReads += 1; return null; };
        api.MessageAdapter.waitForTextarea = async () => { composerReads += 1; return null; };
        api.MessageAdapter.insert = () => { inserts += 1; };
        api.MessageAdapter.getSendButton = () => messageCenterButton(() => { clicks += 1; });
        assert.equal(await agent.processNextJob(), false);
        const pending = storage.get(agent.pendingKey(binding));
        assert.equal(pending.stage, 'ambiguous');
        assert.equal(results[0].manualReviewRequired, true);
        assert.equal(contextReads, 0);
        assert.equal(composerReads, 0);
        assert.equal(inserts, 0);
        assert.equal(clicks, 0);
        assert.equal(gets, 0);
    }
});

test('Message Center claims only a fresh exact native receipt from the same server authority', async () => {
    async function seedReceipt(environment, agent, { id, text, authority, dispatchedAt = new Date().toISOString() }) {
        return environment.api.Verification.persistNativeSentReceipt({
            id,
            text,
            textDigest: await environment.api.sha256Text(text),
            textDigestVersion: 'sha256-utf8-v1',
            conversationIdentity: 'conversation-a',
            conversationId: 'conversation-a',
            conversationUrl: 'https://www.etsy.com/messages/conversation-a',
            messageCenterAuthorityId: agent.authorityId(authority),
            dispatchedAt,
        });
    }

    const exactEnvironment = await loadAssistant();
    const exactAgent = configureMessageCenter(exactEnvironment);
    const exactAuthority = exactAgent.config();
    const exactJob = messageCenterJob({ id: 'job-native-receipt-exact' });
    await seedReceipt(exactEnvironment, exactAgent, {
        id: 'native-receipt-exact', text: exactJob.text, authority: exactAuthority,
    });
    exactEnvironment.api.Store.settings.messageCenterAgentToken = 'rotated-token';
    const exactFixture = installMessageCenterConversationFixture(exactEnvironment);
    const exactResults = [];
    exactAgent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job: exactJob };
        if (requestPath.includes('/result')) exactResults.push(copy(body));
        return {};
    };
    assert.equal(await exactAgent.processNextJob(), true);
    assert.equal(exactFixture.clicks, 0);
    assert.equal(exactResults[0].duplicatePrevented, true);
    assert.equal(exactResults[0].recoveredFromNativeReceipt, true);
    const exactReceipt = (await exactEnvironment.api.Verification.nativeSentReceipts())['native-receipt-exact'];
    assert.equal(exactReceipt.messageCenterJobId, exactJob.id);
    assert.equal(exactReceipt.messageCenterAuthorityId, exactAgent.authorityId(exactAgent.config()));

    const differentTextEnvironment = await loadAssistant();
    const differentTextAgent = configureMessageCenter(differentTextEnvironment);
    const differentTextAuthority = differentTextAgent.config();
    const differentTextJob = messageCenterJob({ id: 'job-native-receipt-different', text: 'A second, different central reply' });
    await seedReceipt(differentTextEnvironment, differentTextAgent, {
        id: 'native-receipt-different', text: 'A native reply sent during the lease race', authority: differentTextAuthority,
    });
    const differentTextFixture = installMessageCenterConversationFixture(differentTextEnvironment);
    const differentTextResults = [];
    differentTextAgent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job: differentTextJob };
        if (requestPath.includes('/result')) differentTextResults.push(copy(body));
        return {};
    };
    assert.equal(await differentTextAgent.processNextJob(), false);
    assert.equal(differentTextFixture.clicks, 0, 'a concurrent different native reply must fence the central reply');
    assert.equal(
        differentTextEnvironment.storage.get(differentTextAgent.pendingKey(differentTextAuthority)).ambiguityCode,
        'overlapping_native_receipt_manual_review',
    );
    assert.equal(differentTextResults[0].manualReviewRequired, true);

    const otherAuthorityEnvironment = await loadAssistant();
    const otherAuthorityAgent = configureMessageCenter(otherAuthorityEnvironment);
    const authorityA = otherAuthorityAgent.config();
    const otherAuthorityJob = messageCenterJob({ id: 'job-native-receipt-other-server' });
    await seedReceipt(otherAuthorityEnvironment, otherAuthorityAgent, {
        id: 'native-receipt-other-server', text: otherAuthorityJob.text, authority: authorityA,
    });
    otherAuthorityEnvironment.api.Store.settings.messageCenterUrl = 'https://messages-b.example';
    otherAuthorityEnvironment.api.Store.settings.messageCenterAgentToken = 'token-b';
    const otherAuthorityFixture = installMessageCenterConversationFixture(otherAuthorityEnvironment);
    const otherAuthorityResults = [];
    otherAuthorityAgent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job: otherAuthorityJob };
        if (requestPath.includes('/result')) otherAuthorityResults.push(copy(body));
        return {};
    };
    assert.equal(await otherAuthorityAgent.processNextJob(), true);
    assert.equal(otherAuthorityFixture.clicks, 1, 'another server must not claim authority A native evidence');
    assert.equal(otherAuthorityResults.at(-1).duplicatePrevented, undefined);

    const oldEnvironment = await loadAssistant();
    const oldAgent = configureMessageCenter(oldEnvironment);
    const oldAuthority = oldAgent.config();
    const oldJob = messageCenterJob({ id: 'job-native-receipt-old' });
    await seedReceipt(oldEnvironment, oldAgent, {
        id: 'native-receipt-old',
        text: oldJob.text,
        authority: oldAuthority,
        dispatchedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });
    const oldFixture = installMessageCenterConversationFixture(oldEnvironment);
    oldAgent.request = async (method, requestPath) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job: oldJob };
        return {};
    };
    assert.equal(await oldAgent.processNextJob(), true);
    assert.equal(oldFixture.clicks, 1, 'old same-text evidence must not satisfy a newly leased job');
});

test('an unknown native attempt is quarantined as a global hold for native, Message Center, and campaign sends', async () => {
    const environment = await loadAssistant();
    const { api, sandbox, documentListeners } = environment;
    const agent = configureMessageCenter(environment);
    const unknownText = 'Future native attempt text';
    await api.Verification.persistNativeSendAttempt({
        id: 'native-unknown-stage',
        stage: 'future_post_dispatch',
        conversationIdentity: 'conversation-b',
        conversationId: 'conversation-b',
        conversationUrl: 'https://www.etsy.com/messages/conversation-b',
        text: unknownText,
        textDigest: await api.sha256Text(unknownText),
        textDigestVersion: 'sha256-utf8-v1',
        dispatchedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
    });
    const hold = await api.Verification.activeNativeSendHold('conversation-a');
    assert.equal(hold.stage, 'ambiguous');
    assert.equal(hold.globalHold, true);
    assert.equal(hold.quarantinedStage, 'future_post_dispatch');

    const job = messageCenterJob({ id: 'job-unknown-native-global' });
    const results = [];
    let contextReads = 0;
    agent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job };
        if (requestPath.includes('/result')) results.push(copy(body));
        return {};
    };
    api.MessageAdapter.waitForContext = async () => { contextReads += 1; return null; };
    assert.equal(await agent.processNextJob(), false);
    assert.equal(contextReads, 0);
    assert.deepEqual(results, [{ status: 'failed', retryable: true, error: 'native_send_outcome_hold' }]);

    await assert.rejects(api.Campaign.create([{
        orderId: 'order-global-hold', customerName: 'Morgan', itemTitle: 'Held item',
        messageUrl: 'https://www.etsy.com/messages/conversation-a',
    }], 'tpl-delivered', 'template'), /belirsiz bir manuel Etsy gönderimi/i);

    const scope = { id: 'conversation-a-scope', querySelectorAll: () => [] };
    const textarea = { value: 'Manual retry while unknown hold exists', offsetParent: {} };
    let captureHandler = null;
    const button = makeNativeSendButton(() => {}, event => captureHandler?.(event));
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.getConversationScope = () => scope;
    api.MessageAdapter.getSendButton = () => button;
    api.MessageAdapter.context = () => ({ conversationId: 'conversation-a', customerName: 'Ashley', orderId: '' });
    api.MessageAdapter.countOutgoing = () => 0;
    api.MessageAdapter.isPotentialSendButton = target => target === button;
    api.MessageAdapter.isSendButton = target => target === button;
    api.UI.toast = () => {};
    api.UI.shadow = { addEventListener() {} };
    api.UI.bind();
    captureHandler = documentListeners.get('click')?.at(-1);
    button.click();
    assert.equal(button.clickCount, 0);
    assert.equal(sandbox.location.href, 'https://www.etsy.com/messages/conversation-a');
});

test('a rejected Message Center result remains a cross-path hold until its exact result is acknowledged', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    const agent = configureMessageCenter(environment);
    const binding = agent.config();
    const job = messageCenterJob({ id: 'job-rejected-cross-hold' });
    storage.set(agent.pendingKey(binding), fencedMessageCenterPending(agent, binding, job, 'rejected', {
        rejectionCode: 'etsy_send_owner_conflict',
        rejectionRetryable: true,
        rejectionResult: { status: 'failed', retryable: true, error: 'etsy_send_owner_conflict' },
    }));
    assert.equal((await agent.activeSendHold('conversation-a')).stage, 'rejected');

    const textarea = { value: 'Manual message blocked by rejected result', offsetParent: {} };
    const scope = { id: 'conversation-a-scope', querySelectorAll: () => [] };
    let nativeClicks = 0;
    const button = messageCenterButton(() => { nativeClicks += 1; });
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.getConversationScope = () => scope;
    api.MessageAdapter.getSendButton = () => button;
    api.MessageAdapter.context = () => ({ conversationId: 'conversation-a', customerName: 'Ashley', orderId: '' });
    api.MessageAdapter.countOutgoing = () => 0;
    api.UI.toast = () => {};
    const guard = api.Verification.beginNativeDispatchGuard();
    assert.equal(await api.Verification.dispatchNativeSend(button, guard), false);
    api.Verification.releaseNativeDispatchGuard(guard);
    assert.equal(nativeClicks, 0);
    await assert.rejects(api.Campaign.create([{
        orderId: 'order-rejected-hold', customerName: 'Ashley', itemTitle: 'Held item',
        messageUrl: 'https://www.etsy.com/messages/conversation-a',
    }], 'tpl-delivered', 'template'), /bekleyen Message Center/i);

    const results = [];
    agent.request = async (_method, requestPath, body) => {
        if (requestPath.includes('/result')) results.push(copy(body));
        return {};
    };
    assert.equal(await agent.processNextJob(), false);
    assert.deepEqual(results, [{ status: 'failed', retryable: true, error: 'etsy_send_owner_conflict' }]);
    assert.equal(storage.has(agent.pendingKey(binding)), false);
    assert.equal(await agent.activeSendHold('conversation-a'), null);
});

test('unknown campaign item and order states fail closed across all send paths', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    const agent = configureMessageCenter(environment);
    const campaign = {
        id: 'campaign-future-state',
        revision: 1,
        status: 'active',
        currentIndex: 0,
        items: [{
            id: 'item-future-state', campaignId: 'campaign-future-state', orderId: 'order-future-state',
            customerName: 'Ashley', messageUrl: 'https://www.etsy.com/messages/conversation-a',
            purpose: 'delivery_followup', templateId: 'tpl-delivered', templateHash: 'future-hash',
            method: 'template', status: 'future_post_dispatch',
        }],
    };
    const statuses = copy(api.Store.statuses);
    statuses.orders['order-future-state'] = { status: 'future_order_state' };
    storage.set(api.KEYS.campaign, copy(campaign));
    storage.set(api.KEYS.statuses, copy(statuses));
    api.Store.campaign = copy(campaign);
    api.Store.statuses = copy(statuses);
    assert.equal(api.Campaign.campaignOwnsConversation(campaign, 'conversation-a'), true);
    assert.equal(api.Campaign.orderCanEnterCampaign('order-future-state', statuses), false);
    assert.equal(api.Campaign.orderIsBlockedFromSend(campaign.items[0], statuses), true);

    const job = messageCenterJob({ id: 'job-future-campaign-state' });
    const fixture = installMessageCenterConversationFixture(environment);
    const results = [];
    agent.request = async (method, requestPath, body) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job };
        if (requestPath.includes('/result')) results.push(copy(body));
        return {};
    };
    assert.equal(await agent.processNextJob(), false);
    assert.equal(fixture.clicks, 0);
    assert.deepEqual(results, [{ status: 'failed', retryable: true, error: 'etsy_send_owner_conflict' }]);

    fixture.textarea.value = 'Manual message while campaign state is unknown';
    let nativeClicks = 0;
    const nativeButton = messageCenterButton(() => { nativeClicks += 1; });
    api.MessageAdapter.getSendButton = () => nativeButton;
    const guard = api.Verification.beginNativeDispatchGuard();
    assert.equal(await api.Verification.dispatchNativeSend(nativeButton, guard), false);
    api.Verification.releaseNativeDispatchGuard(guard);
    assert.equal(nativeClicks, 0);
    await assert.rejects(api.Campaign.create([{
        orderId: 'order-new', customerName: 'Morgan', itemTitle: 'New item',
        messageUrl: 'https://www.etsy.com/messages/conversation-b',
    }], 'tpl-delivered', 'template'), /Devam eden kampanya/i);
});

test('a failed campaign initialization cannot become an active ghost or touch the composer', async () => {
    const environment = await loadAssistant();
    const { api, sandbox, storage } = environment;
    sandbox.location.pathname = '/messages/conversation-a';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/conversation-a';
    const statusesBefore = copy(api.Store.statuses);
    const originalSaveCampaignLocked = api.Store.saveCampaignLocked;
    const originalMutateStatusesLocked = api.Store.mutateStatusesLocked;
    let saveCalls = 0;
    api.Store.saveCampaignLocked = async (...args) => {
        saveCalls += 1;
        if (saveCalls === 1) return originalSaveCampaignLocked.apply(api.Store, args);
        throw new Error('injected cancellation save failure');
    };
    api.Store.mutateStatusesLocked = async () => { throw new Error('injected status binding failure'); };
    try {
        await assert.rejects(api.Campaign.create([{
            orderId: 'order-ghost', customerName: 'Ashley', itemTitle: 'Ghost item',
            messageUrl: 'https://www.etsy.com/messages/conversation-a',
        }], 'tpl-delivered', 'template'), /injected status binding failure/);
    } finally {
        api.Store.saveCampaignLocked = originalSaveCampaignLocked;
        api.Store.mutateStatusesLocked = originalMutateStatusesLocked;
    }
    const persisted = storage.get(api.KEYS.campaign);
    assert.equal(persisted.status, 'initializing');
    assert.equal(api.Campaign.current(), null);
    assert.equal(api.Campaign.campaignOwnsConversation(persisted, 'conversation-a'), true);
    assert.deepEqual(copy(api.Store.statuses), statusesBefore);
    let inserts = 0;
    let clicks = 0;
    api.MessageAdapter.insert = () => { inserts += 1; };
    api.MessageAdapter.getSendButton = () => messageCenterButton(() => { clicks += 1; });
    assert.equal(await api.Campaign.resume(), false);
    assert.equal(inserts, 0);
    assert.equal(clicks, 0);
});

test('campaign compose context rejects an item bound to a different receipt even without DOM order text', async () => {
    const { api } = await loadAssistant();
    const item = {
        orderId: '11111111',
        customerName: 'Ashley',
        messageUrl: 'https://www.etsy.com/messages/new?with_id=123&referring_id=22222222&referring_type=receipt',
    };
    assert.equal(api.Campaign.contextMatchesItem({
        conversationId: 'compose:123:receipt:22222222',
        customerName: 'Ashley',
        orderId: '',
    }, item, 'compose:123:receipt:22222222'), false);
});

test('order-compose campaign context requires the exact DOM order and a nonempty exact buyer', async () => {
    const { api } = await loadAssistant();
    const orderId = '9876543210';
    const identity = `compose:order:receipt:${orderId}`;
    const item = {
        orderId,
        customerName: 'Fixture Buyer',
        messageUrl: `https://www.etsy.com/your/orders/sold/completed?ref=seller-platform-mcnav&expand_convo=true&order_id=${orderId}`,
    };
    const exact = {
        conversationId: identity,
        customerName: 'Fixture Buyer',
        orderId,
    };

    assert.equal(api.Campaign.contextMatchesItem(exact, item, identity), true);
    assert.equal(api.Campaign.contextMatchesItem({ ...exact, orderId: '' }, item, identity), false);
    assert.equal(api.Campaign.contextMatchesItem({ ...exact, orderId: '9876543211' }, item, identity), false);
    assert.equal(api.Campaign.contextMatchesItem({ ...exact, customerName: '' }, item, identity), false);
    assert.equal(api.Campaign.contextMatchesItem({ ...exact, customerName: 'Other Buyer' }, item, identity), false);
    assert.equal(api.Campaign.contextMatchesItem(exact, { ...item, customerName: '' }, identity), false,
        'legacy or corrupt campaign items without a buyer fail closed');
});

test('post-mutation Message Center stages quarantine before malformed payload validation', async () => {
    async function runCase({ id, stage, jobPatch }) {
        const environment = await loadAssistant();
        const { api, storage } = environment;
        const agent = configureMessageCenter(environment);
        const binding = agent.config();
        const job = messageCenterJob({ id, ...jobPatch });
        storage.set(agent.pendingKey(binding), fencedMessageCenterPending(agent, binding, job, stage, {
            baselineMatches: 3,
        }));
        let contextReads = 0;
        let composerReads = 0;
        let clicks = 0;
        const results = [];
        agent.request = async (_method, requestPath, body) => {
            if (requestPath.includes('/result')) results.push(copy(body));
            return {};
        };
        api.MessageAdapter.waitForContext = async () => { contextReads += 1; return null; };
        api.MessageAdapter.waitForTextarea = async () => { composerReads += 1; return null; };
        api.MessageAdapter.getSendButton = () => messageCenterButton(() => { clicks += 1; });

        assert.equal(await agent.processNextJob(), false);
        const quarantined = storage.get(agent.pendingKey(binding));
        assert.equal(quarantined.stage, 'ambiguous');
        assert.equal(quarantined.quarantinedStage, stage);
        assert.equal(quarantined.suppressOutgoingAutoConfirmation, true);
        assert.equal(contextReads, 0);
        assert.equal(composerReads, 0);
        assert.equal(clicks, 0);
        assert.equal(results.length, 1);
        assert.equal(results[0].manualReviewRequired, true);
        assert.ok(await agent.activeSendHold('unrelated-conversation'), 'malformed risky record must be a global send hold');
        await assert.rejects(api.Campaign.create([{
            orderId: `order-${id}`,
            customerName: 'Morgan',
            itemTitle: 'Held item',
            messageUrl: 'https://www.etsy.com/messages/unrelated-conversation',
        }], 'tpl-delivered', 'template'), /bekleyen Message Center/i);

        assert.equal(await agent.processNextJob(), false);
        assert.equal(results.length, 1, 'quarantined retry must not report or clear the exact tombstone again');
        assert.equal(storage.get(agent.pendingKey(binding)).stage, 'ambiguous');
    }

    await runCase({
        id: 'job-prepared-invalid-url',
        stage: 'prepared',
        jobPatch: { conversationUrl: 'https://evil.example/messages/conversation-a' },
    });
    await runCase({
        id: 'job-future-missing-type',
        stage: 'future_post_dispatch',
        jobPatch: { type: undefined, conversationUrl: '', conversationId: '' },
    });
});

test('Message Center result outbox write loss cannot report or replay Etsy work', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    const agent = configureMessageCenter(environment);
    const binding = agent.config();
    const job = messageCenterJob({ id: 'job-result-outbox-write-loss' });
    storage.set(agent.sentLedgerKey(binding), {
        [job.id]: {
            at: new Date().toISOString(),
            conversationIdentity: 'conversation-a',
            textDigest: await api.sha256Text(job.text),
            textDigestVersion: 'sha256-utf8-v1',
            authorityId: agent.authorityId(binding),
            configId: agent.configId(binding),
        },
    });
    let resultCalls = 0;
    let domReads = 0;
    agent.request = async (method, requestPath) => {
        if (method === 'GET' && requestPath.endsWith('/jobs/next')) return { job };
        if (requestPath.includes('/result')) resultCalls += 1;
        return {};
    };
    api.MessageAdapter.waitForContext = async () => { domReads += 1; return null; };
    api.MessageAdapter.waitForTextarea = async () => { domReads += 1; return null; };
    const pendingKey = agent.pendingKey(binding);
    const originalSet = api.GMX.set;
    api.GMX.set = async (key, value) => {
        if (key === pendingKey && value?.stage === 'result_pending') return undefined;
        return originalSet(key, value);
    };
    assert.equal(await agent.processNextJob(), false);
    api.GMX.set = originalSet;
    assert.equal(storage.get(pendingKey).stage, 'leased');
    assert.equal(resultCalls, 0, 'terminal result must not be posted before its exact outbox envelope is durable');
    assert.equal(domReads, 0);

    assert.equal(await agent.processNextJob(), true);
    assert.equal(resultCalls, 1);
    assert.equal(domReads, 0);
    assert.equal(storage.has(pendingKey), false);
});

test('composer form never routes a different submitter through Etsy Send', async () => {
    const environment = await loadAssistant();
    const { api, documentListeners } = environment;
    const form = { id: 'composer-form' };
    const saveDraft = { id: 'save-draft', type: 'submit' };
    let sendClicks = 0;
    const sendButton = { id: 'send', click() { sendClicks += 1; } };
    const warnings = [];
    api.MessageAdapter.potentialComposerForm = target => target === form ? form : null;
    api.MessageAdapter.currentComposerFormIsExact = target => target === form;
    api.MessageAdapter.getSendButton = () => sendButton;
    api.UI.toast = message => warnings.push(message);
    api.UI.shadow = { addEventListener() {} };
    api.UI.bind();
    const handler = documentListeners.get('submit')?.at(-1);
    const event = {
        target: form,
        submitter: saveDraft,
        defaultPrevented: false,
        immediatePropagationStopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopImmediatePropagation() { this.immediatePropagationStopped = true; },
    };
    handler(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.immediatePropagationStopped, true);
    assert.equal(sendClicks, 0);
    assert.match(warnings[0], /farklı bir işlem düğmesi/i);
});

test('history download defers object URL revocation until after the click turn', async () => {
    const { api, sandbox } = await loadAssistant();
    const events = [];
    let scheduled = null;
    sandbox.URL.createObjectURL = () => 'blob:test-history';
    sandbox.URL.revokeObjectURL = url => events.push(`revoke:${url}`);
    sandbox.setTimeout = (callback, delay) => {
        scheduled = { callback, delay };
        return 1;
    };
    sandbox.document.createElement = () => ({
        click() { events.push('click'); },
    });

    api.downloadText('history.json', '{}');
    assert.deepEqual(events, ['click']);
    assert.ok(scheduled?.delay >= 1000, 'object URL revocation must be deferred long enough for the download to begin');
    scheduled.callback();
    assert.deepEqual(events, ['click', 'revoke:blob:test-history']);
});

test('explicit campaign autopilot authorizes review-request sending only while running', async () => {
    const { api } = await loadAssistant();
    const reviewRequest = { purpose: 'review_request' };

    assert.equal(api.campaignAutoSendAllowed(
        reviewRequest,
        { autoSendCampaign: false },
        { runMode: 'autopilot', runState: 'running' },
    ), true);
    assert.equal(api.campaignAutoSendAllowed(
        reviewRequest,
        { autoSendCampaign: true },
        { runMode: 'autopilot', runState: 'paused' },
    ), false);
});

test('pending verification rejects autopilot pause without mutating campaign state or revision', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    installPendingResolutionFixture(environment);
    const runningCampaign = copy(api.Store.campaign);
    runningCampaign.runMode = 'autopilot';
    runningCampaign.runState = 'running';
    storage.set(api.KEYS.campaign, copy(runningCampaign));
    api.Store.commitCoordinatedState(runningCampaign, api.Store.statuses, { invalidate: false, refresh: false });
    const beforeCampaign = copy(api.Store.campaign);
    const beforePersisted = copy(storage.get(api.KEYS.campaign));
    const beforeGeneration = api.Campaign.workGeneration;

    await assert.rejects(api.Campaign.pauseAutopilot({
        expectedCampaignId: beforeCampaign.id,
        expectedRevision: beforeCampaign.revision,
    }));

    assert.deepEqual(copy(api.Store.campaign), beforeCampaign);
    assert.deepEqual(copy(storage.get(api.KEYS.campaign)), beforePersisted);
    assert.equal(api.Store.campaign.runState, 'running');
    assert.equal(api.Store.campaign.revision, beforeCampaign.revision);
    assert.equal(api.Campaign.workGeneration, beforeGeneration);
});

test('stale autopilot Start and Pause controls leave state and work generation unchanged', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    installGuidedFixture(environment);
    const pausedCampaign = copy(api.Store.campaign);
    pausedCampaign.runMode = 'autopilot';
    pausedCampaign.runState = 'paused';
    storage.set(api.KEYS.campaign, copy(pausedCampaign));
    api.Store.commitCoordinatedState(pausedCampaign, api.Store.statuses, { invalidate: false, refresh: false });
    const beforeStart = copy(api.Store.campaign);
    const beforeStartGeneration = api.Campaign.workGeneration;

    await assert.rejects(api.Campaign.startAutopilot({
        expectedCampaignId: 'stale-campaign-id',
        expectedRevision: beforeStart.revision,
    }), error => {
        assert.equal(error?.code, 'CAMPAIGN_REVISION_CONFLICT');
        return true;
    });
    assert.deepEqual(copy(api.Store.campaign), beforeStart);
    assert.deepEqual(copy(storage.get(api.KEYS.campaign)), beforeStart);
    assert.equal(api.Campaign.workGeneration, beforeStartGeneration);

    const runningCampaign = copy(api.Store.campaign);
    runningCampaign.runState = 'running';
    storage.set(api.KEYS.campaign, copy(runningCampaign));
    api.Store.commitCoordinatedState(runningCampaign, api.Store.statuses, { invalidate: false, refresh: false });
    const beforePause = copy(api.Store.campaign);
    const beforePauseGeneration = api.Campaign.workGeneration;

    await assert.rejects(api.Campaign.pauseAutopilot({
        expectedCampaignId: beforePause.id,
        expectedRevision: beforePause.revision + 1,
    }), error => {
        assert.equal(error?.code, 'CAMPAIGN_REVISION_CONFLICT');
        return true;
    });
    assert.deepEqual(copy(api.Store.campaign), beforePause);
    assert.deepEqual(copy(storage.get(api.KEYS.campaign)), beforePause);
    assert.equal(api.Campaign.workGeneration, beforePauseGeneration);
});

test('order-compose explicit autopilot journals exact draft SHA before one automatic dispatch', async () => {
    const environment = await loadAssistant();
    const { api, sandbox, storage } = environment;
    const orderId = '9876543210';
    const customerName = 'Fixture Buyer';
    const orderComposeUrl = `https://www.etsy.com/your/orders/sold/completed?ref=seller-platform-mcnav&expand_convo=true&order_id=${orderId}`;
    const identity = `compose:order:receipt:${orderId}`;
    const purchasePrefill = `https://www.etsy.com/your/purchases/${orderId}`;
    sandbox.location.pathname = '/your/orders/sold/completed';
    sandbox.location.search = `?ref=seller-platform-mcnav&expand_convo=true&order_id=${orderId}`;
    sandbox.location.href = orderComposeUrl;
    api.Store.settings.replyInCustomerLanguage = false;
    api.Store.settings.autoSendCampaign = false;
    await api.Campaign.create([{
        orderId,
        customerName,
        itemTitle: 'Custom Team Shirt',
        messageUrl: orderComposeUrl,
    }], 'tpl-delivered', 'template', { runMode: 'autopilot' });
    assert.equal(api.Store.campaign.runMode, 'autopilot');
    assert.equal(api.Store.campaign.runState, 'running');

    const textarea = { value: purchasePrefill, offsetParent: {} };
    const context = {
        conversationId: identity,
        customerName,
        customerFirstName: 'Fixture',
        orderId,
        itemTitle: 'Custom Team Shirt',
        messages: [],
        lastCustomerMessage: '',
        routeFingerprint: api.Router.routeFingerprint(),
    };
    const originals = {
        getTextarea: api.MessageAdapter.getTextarea,
        waitForTextarea: api.MessageAdapter.waitForTextarea,
        context: api.MessageAdapter.context,
        insert: api.MessageAdapter.insert,
        autoSendIfCurrent: api.Campaign.autoSendIfCurrent,
        onSendClick: api.Verification.onSendClick,
        open: api.UI.open,
        toast: api.UI.toast,
        setTimeout: sandbox.setTimeout,
    };
    let insertCalls = 0;
    let autoSendCalls = 0;
    let verificationCalls = 0;
    let digestAtDispatch = '';
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.waitForTextarea = async () => textarea;
    api.MessageAdapter.context = () => context;
    api.MessageAdapter.insert = (text, target) => {
        insertCalls += 1;
        target.value = text;
    };
    api.Campaign.autoSendIfCurrent = async (run) => {
        autoSendCalls += 1;
        const persistedCampaign = storage.get(api.KEYS.campaign);
        const persistedStatuses = storage.get(api.KEYS.statuses);
        const persistedItem = persistedCampaign?.items?.[persistedCampaign.currentIndex];
        assert.equal(persistedItem?.draftDigest, run.messageDigest);
        assert.equal(persistedStatuses?.orders?.[orderId]?.messageDigest, run.messageDigest);
        digestAtDispatch = run.messageDigest;
        return true;
    };
    api.Verification.onSendClick = async () => {
        verificationCalls += 1;
        return true;
    };
    api.UI.open = () => {};
    api.UI.toast = () => {};
    sandbox.setTimeout = callback => {
        callback();
        return 1;
    };

    try {
        assert.equal(await api.Campaign.resume(), true);
        const expectedDigest = await api.sha256Text(textarea.value);
        const storedCampaign = storage.get(api.KEYS.campaign);
        const storedItem = storedCampaign.items[storedCampaign.currentIndex];
        const storedOrder = storage.get(api.KEYS.statuses).orders[orderId];
        assert.equal(insertCalls, 1);
        assert.equal(autoSendCalls, 1);
        assert.equal(verificationCalls, 1);
        assert.equal(storedItem.status, 'inserted');
        assert.equal(storedItem.draftText, textarea.value);
        assert.equal(storedItem.draftDigest, expectedDigest);
        assert.equal(storedOrder.messageDigest, expectedDigest);
        assert.equal(digestAtDispatch, expectedDigest);
    } finally {
        Object.assign(api.MessageAdapter, {
            getTextarea: originals.getTextarea,
            waitForTextarea: originals.waitForTextarea,
            context: originals.context,
            insert: originals.insert,
        });
        api.Campaign.autoSendIfCurrent = originals.autoSendIfCurrent;
        api.Verification.onSendClick = originals.onSendClick;
        api.UI.open = originals.open;
        api.UI.toast = originals.toast;
        sandbox.setTimeout = originals.setTimeout;
    }
});

test('inserted autopilot reload with a draft digest mismatch pauses without dispatch', async () => {
    const environment = await loadAssistant();
    const { api, storage } = environment;
    installGuidedFixture(environment);
    const campaign = copy(api.Store.campaign);
    campaign.runMode = 'autopilot';
    campaign.runState = 'running';
    campaign.items[0].draftText = 'Expected exact automation draft';
    campaign.items[0].draftDigest = await api.sha256Text('Different persisted draft');
    storage.set(api.KEYS.campaign, copy(campaign));
    api.Store.commitCoordinatedState(campaign, api.Store.statuses, { invalidate: false, refresh: false });
    const beforeRevision = api.Store.campaign.revision;
    const beforeGeneration = api.Campaign.workGeneration;
    const originals = {
        sendCurrentByUser: api.Campaign.sendCurrentByUser,
        autoSendIfCurrent: api.Campaign.autoSendIfCurrent,
        getSendButton: api.MessageAdapter.getSendButton,
    };
    let guidedDispatches = 0;
    let automaticDispatches = 0;
    let sendClicks = 0;
    api.Campaign.sendCurrentByUser = async () => { guidedDispatches += 1; return true; };
    api.Campaign.autoSendIfCurrent = async () => { automaticDispatches += 1; return true; };
    api.MessageAdapter.getSendButton = () => ({
        disabled: false,
        click() { sendClicks += 1; },
    });

    try {
        await assert.rejects(api.Campaign.resume());
        const persisted = storage.get(api.KEYS.campaign);
        assert.equal(api.Store.campaign.runMode, 'autopilot');
        assert.equal(api.Store.campaign.runState, 'paused');
        assert.equal(api.Store.campaign.revision, beforeRevision + 1);
        assert.equal(api.Campaign.workGeneration, beforeGeneration + 1);
        assert.equal(persisted.runState, 'paused');
        assert.equal(persisted.items[0].draftText, 'Expected exact automation draft');
        assert.equal(guidedDispatches, 0);
        assert.equal(automaticDispatches, 0);
        assert.equal(sendClicks, 0);
    } finally {
        api.Campaign.sendCurrentByUser = originals.sendCurrentByUser;
        api.Campaign.autoSendIfCurrent = originals.autoSendIfCurrent;
        api.MessageAdapter.getSendButton = originals.getSendButton;
    }
});

test('verified autopilot item advances to the next recipient only while running', async () => {
    const { api, storage, sandbox } = await loadAssistant();
    const statuses = api.normalizeStatusState({});
    const campaign = {
        id: 'campaign-1', status: 'active', revision: 3, currentIndex: 1,
        runMode: 'autopilot', runState: 'running',
        items: [
            { id: 'item-a', status: 'sent', messageUrl: 'https://www.etsy.com/messages/order-a' },
            { id: 'item-b', status: 'pending', messageUrl: 'https://www.etsy.com/messages/order-b' },
        ],
    };
    storage.set(api.KEYS.campaign, copy(campaign));
    storage.set(api.KEYS.statuses, copy(statuses));
    api.Store.commitCoordinatedState(campaign, statuses, { invalidate: false, refresh: false });
    sandbox.location.pathname = '/messages/order-a';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/messages/order-a';
    const originalSetTimeout = sandbox.setTimeout;
    sandbox.setTimeout = callback => {
        callback();
        return 1;
    };

    try {
        assert.equal(await api.Campaign.advanceAfterVerified({
            campaignId: campaign.id,
            campaignItemId: 'item-a',
            advanceAfterVerified: false,
        }), true);
        assert.equal(sandbox.location.href, 'https://www.etsy.com/messages/order-b');

        const pausedCampaign = copy(storage.get(api.KEYS.campaign));
        pausedCampaign.runState = 'paused';
        storage.set(api.KEYS.campaign, copy(pausedCampaign));
        api.Store.commitCoordinatedState(pausedCampaign, api.Store.statuses, { invalidate: false, refresh: false });
        sandbox.location.href = 'https://www.etsy.com/messages/order-a';
        assert.equal(await api.Campaign.advanceAfterVerified({
            campaignId: campaign.id,
            campaignItemId: 'item-a',
            advanceAfterVerified: true,
        }), false);
        assert.equal(sandbox.location.href, 'https://www.etsy.com/messages/order-a');
    } finally {
        sandbox.setTimeout = originalSetTimeout;
    }
});

function convertGuidedCampaignFixtureToDeliveryFollowup(environment) {
    const { api, storage } = environment;
    const template = api.TemplateEngine.get('tpl-delivered');
    const templateHash = api.templateFingerprint(template);
    const campaign = copy(api.Store.campaign);
    campaign.purpose = 'delivery_followup';
    campaign.templateId = template.id;
    campaign.templateHash = templateHash;
    for (const item of campaign.items) {
        item.purpose = 'delivery_followup';
        item.templateId = template.id;
        item.templateHash = templateHash;
    }
    const statuses = copy(api.Store.statuses);
    statuses.orders['order-1'] = {
        ...statuses.orders['order-1'],
        purpose: 'delivery_followup',
        templateId: template.id,
        templateHash,
    };
    delete statuses.outreach['order-1'];
    delete statuses.outreach['order-2'];
    storage.set(api.KEYS.campaign, copy(campaign));
    storage.set(api.KEYS.statuses, copy(statuses));
    api.Store.commitCoordinatedState(campaign, statuses, { invalidate: false, refresh: false });
    return { campaign, statuses, templateHash };
}

function injectFirstSentStatusWriteFailure(environment, message) {
    const { api, sandbox } = environment;
    const originalSetValue = sandbox.GM.setValue;
    let failures = 0;
    sandbox.GM.setValue = async (key, value) => {
        if (key === api.KEYS.statuses
            && value?.orders?.['order-1']?.status === 'sent'
            && failures === 0) {
            failures += 1;
            throw new Error(message);
        }
        return originalSetValue(key, value);
    };
    return {
        failures: () => failures,
        restore() { sandbox.GM.setValue = originalSetValue; },
    };
}

async function recoverDurableSendPartialAfterReload(storage, options = {}) {
    const environment = await loadAssistant({ storage });
    const { api, sandbox } = environment;
    const persistedCampaign = copy(storage.get(api.KEYS.campaign));
    const persistedStatuses = copy(storage.get(api.KEYS.statuses));
    api.Store.commitCoordinatedState(persistedCampaign, persistedStatuses, { invalidate: false, refresh: false });
    const originalSetValue = sandbox.GM.setValue;
    let advancesAfterSent = 0;
    sandbox.GM.setValue = async (key, value) => {
        if (key === api.KEYS.campaign
            && value?.id === persistedCampaign.id
            && value?.currentIndex === 1) {
            advancesAfterSent += 1;
            assert.equal(storage.get(api.KEYS.statuses)?.orders?.['order-1']?.status, 'sent',
                'campaign advancement must happen only after the sent status is durable');
        }
        return originalSetValue(key, value);
    };
    try {
        assert.equal(typeof api.Campaign.recoverDurableSendPartials, 'function');
        await api.Campaign.recoverDurableSendPartials();
    } finally {
        sandbox.GM.setValue = originalSetValue;
    }

    const recoveredCampaign = storage.get(api.KEYS.campaign);
    const recoveredStatuses = storage.get(api.KEYS.statuses);
    const item = recoveredCampaign.items[0];
    const order = recoveredStatuses.orders['order-1'];
    assert.equal(order.status, 'sent');
    assert.equal(order.campaignId, recoveredCampaign.id);
    assert.equal(order.campaignItemId, item.id);
    assert.equal(order.purpose, item.purpose);
    assert.equal(order.templateId, item.templateId);
    assert.equal(order.templateHash, item.templateHash);
    assert.equal(recoveredCampaign.currentIndex, 1);
    assert.equal(recoveredCampaign.items[1].status, 'pending');
    assert.equal(advancesAfterSent, 1);
    if (options.expectReviewOutreach) {
        const outreach = recoveredStatuses.outreach['order-1']?.review_request;
        assert.equal(outreach?.workflow, 'sent');
        assert.equal(outreach?.campaignId, recoveredCampaign.id);
        assert.equal(outreach?.campaignItemId, item.id);
        assert.equal(outreach?.templateId, item.templateId);
        assert.equal(outreach?.templateHash, item.templateHash);
        assert.equal(outreach?.sendAttemptToken, '');
    }
    return { api, environment, recoveredCampaign, recoveredStatuses };
}

test('verified delivery send recovers its durable campaign-first partial before advancing', async () => {
    const environment = await loadAssistant();
    const { api, sandbox, storage } = environment;
    installGuidedFixture(environment, { twoItems: true });
    convertGuidedCampaignFixtureToDeliveryFollowup(environment);
    const initialHref = sandbox.location.href;
    const button = makeNativeSendButton();
    const textarea = { value: 'Exact verified delivery follow-up', offsetParent: {} };
    const originals = {
        getTextarea: api.MessageAdapter.getTextarea,
        getSendButton: api.MessageAdapter.getSendButton,
        context: api.MessageAdapter.context,
        countOutgoing: api.MessageAdapter.countOutgoing,
        waitForPendingOutgoing: api.Verification.waitForPendingOutgoing,
        toast: api.UI.toast,
        refreshCurrent: api.UI.refreshCurrent,
    };
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.getSendButton = () => button;
    api.MessageAdapter.context = () => ({
        conversationId: 'order-1', customerName: 'Ashley', orderId: 'order-1',
    });
    api.MessageAdapter.countOutgoing = () => 0;
    api.Verification.waitForPendingOutgoing = async () => true;
    api.UI.toast = () => {};
    api.UI.refreshCurrent = async () => {};
    const failure = injectFirstSentStatusWriteFailure(environment, 'injected verified status finalize failure');

    try {
        await assert.rejects(
            api.Campaign.sendCurrentByUser(),
            /injected verified status finalize failure/,
        );
    } finally {
        failure.restore();
        Object.assign(api.MessageAdapter, {
            getTextarea: originals.getTextarea,
            getSendButton: originals.getSendButton,
            context: originals.context,
            countOutgoing: originals.countOutgoing,
        });
        api.Verification.waitForPendingOutgoing = originals.waitForPendingOutgoing;
        api.UI.toast = originals.toast;
        api.UI.refreshCurrent = originals.refreshCurrent;
    }

    const partialCampaign = storage.get(api.KEYS.campaign);
    const partialStatuses = storage.get(api.KEYS.statuses);
    assert.equal(failure.failures(), 1);
    assert.equal(button.clickCount, 1);
    assert.equal(sandbox.location.href, initialHref);
    assert.equal(partialCampaign.currentIndex, 0);
    assert.equal(partialCampaign.items[0].status, 'sent');
    assert.equal(partialCampaign.items[0].sendResolutionOutcome, 'verified');
    assert.equal(partialCampaign.items[1].status, 'pending');
    assert.equal(partialStatuses.orders['order-1'].status, 'sent_pending_verification');
    assert.equal(partialStatuses.orders['order-1'].campaignId, partialCampaign.id);
    assert.equal(partialStatuses.orders['order-1'].campaignItemId, partialCampaign.items[0].id);

    const recovered = await recoverDurableSendPartialAfterReload(storage);
    assert.equal(recovered.recoveredCampaign.items[0].sendResolutionOutcome, 'verified');
});

test('manual sent resolution recovers its durable review partial before advancing', async () => {
    const environment = await loadAssistant();
    const { api, sandbox, storage } = environment;
    installPendingResolutionFixture(environment);
    const initialHref = sandbox.location.href;
    const failure = injectFirstSentStatusWriteFailure(environment, 'injected manual status finalize failure');

    try {
        await assert.rejects(
            api.Campaign.resolvePendingSend('order-1', 'sent'),
            /injected manual status finalize failure/,
        );
    } finally {
        failure.restore();
    }

    const partialCampaign = storage.get(api.KEYS.campaign);
    const partialStatuses = storage.get(api.KEYS.statuses);
    assert.equal(failure.failures(), 1);
    assert.equal(sandbox.location.href, initialHref);
    assert.equal(partialCampaign.currentIndex, 0);
    assert.equal(partialCampaign.items[0].status, 'sent');
    assert.equal(partialCampaign.items[0].sendResolutionOutcome, 'sent');
    assert.equal(partialCampaign.items[0].manuallyConfirmed, true);
    assert.equal(partialCampaign.items[1].status, 'pending');
    assert.equal(partialStatuses.orders['order-1'].status, 'sent_pending_verification');
    assert.equal(partialStatuses.outreach['order-1'].review_request.workflow, 'sent_pending_verification');

    const recovered = await recoverDurableSendPartialAfterReload(storage, { expectReviewOutreach: true });
    assert.equal(recovered.recoveredCampaign.items[0].sendResolutionOutcome, 'sent');
    assert.equal(recovered.recoveredCampaign.items[0].manuallyConfirmed, true);
});

test('outgoing evidence requires the complete normalized seller text instead of a 120-character prefix', async () => {
    const { api } = await loadAssistant();
    const expected = `${'A'.repeat(60)} ${'B'.repeat(59)}`;
    assert.equal(expected.length, 120);
    const prefixWithSuffix = `${expected} UNRELATED SUFFIX`;
    const normalizedExact = `  ${'A'.repeat(60)} \n\t ${'B'.repeat(59)}  `;
    const originalGetMessages = api.MessageAdapter.getMessages;
    try {
        api.MessageAdapter.getMessages = () => [{ role: 'seller', text: prefixWithSuffix }];
        assert.equal(api.MessageAdapter.countOutgoing(expected), 0);

        api.MessageAdapter.getMessages = () => [
            { role: 'seller', text: prefixWithSuffix },
            { role: 'seller', text: normalizedExact },
            { role: 'customer', text: expected },
        ];
        assert.equal(api.MessageAdapter.countOutgoing(expected), 1);
    } finally {
        api.MessageAdapter.getMessages = originalGetMessages;
    }
});

async function runFreshExplicitAutopilotVerification(verified) {
    const environment = await loadAssistant();
    const { api, sandbox, storage } = environment;
    const firstUrl = 'https://www.etsy.com/messages/order-1';
    const secondUrl = 'https://www.etsy.com/messages/order-2';
    sandbox.location.pathname = '/messages/order-1';
    sandbox.location.search = '';
    sandbox.location.href = firstUrl;
    await api.Outreach.setManualDecision('order-1', 'eligible');
    await api.Outreach.setManualDecision('order-2', 'eligible');
    const template = api.TemplateEngine.get('tpl-review-request');
    const created = await api.Campaign.create([
        {
            orderId: 'order-1', customerName: 'Ashley', itemTitle: 'First Shirt', messageUrl: firstUrl,
        },
        {
            orderId: 'order-2', customerName: 'Morgan', itemTitle: 'Second Shirt', messageUrl: secondUrl,
        },
    ], template.id, 'template', { runMode: 'autopilot' });
    assert.equal(created.runMode, 'autopilot');
    assert.equal(created.runState, 'running');
    assert.equal(created.currentIndex, 0);
    assert.equal(created.items[0].status, 'pending');

    const textarea = { value: '', offsetParent: {} };
    const conversationScope = {
        isConnected: true,
        contains: candidate => candidate === textarea,
        querySelectorAll: () => [],
    };
    const outgoingTexts = [];
    const button = makeNativeSendButton(() => { outgoingTexts.push(textarea.value); });
    const originals = {
        getTextarea: api.MessageAdapter.getTextarea,
        waitForTextarea: api.MessageAdapter.waitForTextarea,
        getConversationScope: api.MessageAdapter.getConversationScope,
        getSendButton: api.MessageAdapter.getSendButton,
        context: api.MessageAdapter.context,
        insert: api.MessageAdapter.insert,
        countOutgoing: api.MessageAdapter.countOutgoing,
        waitForPendingOutgoing: api.Verification.waitForPendingOutgoing,
        onSendClick: api.Verification.onSendClick,
        resumeReserved: api.Campaign.resumeReserved,
        autoSendIfCurrent: api.Campaign.autoSendIfCurrent,
        finalizeSendAttemptLocked: api.Store.finalizeSendAttemptLocked,
        navigateToConversation: api.Router.navigateToConversation,
        open: api.UI.open,
        toast: api.UI.toast,
        refreshCurrent: api.UI.refreshCurrent,
        setTimeout: sandbox.setTimeout,
    };
    let waitCalls = 0;
    let onSendClickCalls = 0;
    let resumeReservedCalls = 0;
    let autoSendCalls = 0;
    let finalizeCalls = 0;
    let finalizeResolved = false;
    const navigations = [];
    api.MessageAdapter.getTextarea = () => textarea;
    api.MessageAdapter.waitForTextarea = async () => textarea;
    api.MessageAdapter.getConversationScope = () => conversationScope;
    api.MessageAdapter.getSendButton = () => button;
    api.MessageAdapter.context = () => ({
        conversationId: 'order-1',
        customerName: 'Ashley',
        customerFirstName: 'Ashley',
        orderId: 'order-1',
        itemTitle: 'First Shirt',
        messages: [],
        lastCustomerMessage: '',
        routeFingerprint: api.Router.routeFingerprint(),
    });
    api.MessageAdapter.insert = (text, target) => { target.value = text; };
    api.MessageAdapter.countOutgoing = text => outgoingTexts.filter(entry => entry === text).length;
    api.Verification.waitForPendingOutgoing = async pending => {
        waitCalls += 1;
        assert.equal(button.clickCount, 1);
        assert.equal(api.MessageAdapter.countOutgoing(pending.text), 1,
            'the verification fixture must expose one exact outgoing delta after the click');
        return verified;
    };
    api.Verification.onSendClick = async function (...args) {
        onSendClickCalls += 1;
        return originals.onSendClick.apply(this, args);
    };
    api.Campaign.resumeReserved = async function (...args) {
        resumeReservedCalls += 1;
        return originals.resumeReserved.apply(this, args);
    };
    api.Campaign.autoSendIfCurrent = async function (...args) {
        autoSendCalls += 1;
        return originals.autoSendIfCurrent.apply(this, args);
    };
    api.Store.finalizeSendAttemptLocked = async function (...args) {
        finalizeCalls += 1;
        const result = await originals.finalizeSendAttemptLocked.apply(this, args);
        finalizeResolved ||= result === true;
        return result;
    };
    api.Router.navigateToConversation = function (value) {
        navigations.push({
            value,
            onSendClickCalls,
            finalizeResolved,
            campaign: copy(storage.get(api.KEYS.campaign)),
            statuses: copy(storage.get(api.KEYS.statuses)),
        });
        return originals.navigateToConversation.call(this, value);
    };
    api.UI.open = () => {};
    api.UI.toast = () => {};
    api.UI.refreshCurrent = async () => {};
    sandbox.setTimeout = callback => {
        queueMicrotask(callback);
        return 1;
    };

    let result;
    try {
        result = await api.Campaign.resume();
    } finally {
        Object.assign(api.MessageAdapter, {
            getTextarea: originals.getTextarea,
            waitForTextarea: originals.waitForTextarea,
            getConversationScope: originals.getConversationScope,
            getSendButton: originals.getSendButton,
            context: originals.context,
            insert: originals.insert,
            countOutgoing: originals.countOutgoing,
        });
        api.Verification.waitForPendingOutgoing = originals.waitForPendingOutgoing;
        api.Verification.onSendClick = originals.onSendClick;
        api.Campaign.resumeReserved = originals.resumeReserved;
        api.Campaign.autoSendIfCurrent = originals.autoSendIfCurrent;
        api.Store.finalizeSendAttemptLocked = originals.finalizeSendAttemptLocked;
        api.Router.navigateToConversation = originals.navigateToConversation;
        api.UI.open = originals.open;
        api.UI.toast = originals.toast;
        api.UI.refreshCurrent = originals.refreshCurrent;
        sandbox.setTimeout = originals.setTimeout;
    }

    return {
        api,
        sandbox,
        storage,
        result,
        button,
        firstUrl,
        secondUrl,
        navigations,
        waitCalls,
        onSendClickCalls,
        resumeReservedCalls,
        autoSendCalls,
        finalizeCalls,
        finalizeResolved,
    };
}

test('fresh explicit autopilot runs resumeReserved through real auto-send and verification before navigating', async () => {
    const run = await runFreshExplicitAutopilotVerification(true);
    const { api, storage } = run;
    const campaign = storage.get(api.KEYS.campaign);
    const statuses = storage.get(api.KEYS.statuses);
    const first = campaign.items[0];
    const outreach = statuses.outreach['order-1'].review_request;

    assert.equal(run.result, true);
    assert.equal(run.resumeReservedCalls, 1);
    assert.equal(run.autoSendCalls, 1);
    assert.equal(run.onSendClickCalls, 1, 'the normal automatic path must invoke Verification.onSendClick exactly once');
    assert.equal(run.waitCalls, 1);
    assert.equal(run.button.clickCount, 1);
    assert.equal(run.finalizeCalls, 1);
    assert.equal(run.finalizeResolved, true);
    assert.equal(first.status, 'sent');
    assert.equal(first.sendResolutionOutcome, 'verified');
    assert.equal(statuses.orders['order-1'].status, 'sent');
    assert.equal(outreach.workflow, 'sent');
    assert.equal(outreach.campaignId, campaign.id);
    assert.equal(outreach.campaignItemId, first.id);
    assert.equal(campaign.currentIndex, 1);
    assert.equal(campaign.items[1].status, 'pending');
    assert.equal(run.navigations.length, 1);
    assert.equal(run.navigations[0].value, run.secondUrl);
    assert.equal(run.navigations[0].onSendClickCalls, 1);
    assert.equal(run.navigations[0].finalizeResolved, true);
    assert.equal(run.navigations[0].campaign.items[0].status, 'sent');
    assert.equal(run.navigations[0].statuses.orders['order-1'].status, 'sent');
    assert.equal(run.navigations[0].statuses.outreach['order-1'].review_request.workflow, 'sent');
    assert.equal(run.sandbox.location.href, run.secondUrl);
});

test('fresh explicit autopilot keeps the first item pending and never navigates when verification fails', async () => {
    const run = await runFreshExplicitAutopilotVerification(false);
    const { api, storage } = run;
    const campaign = storage.get(api.KEYS.campaign);
    const statuses = storage.get(api.KEYS.statuses);

    assert.equal(run.result, false);
    assert.equal(run.resumeReservedCalls, 1);
    assert.equal(run.autoSendCalls, 1);
    assert.equal(run.onSendClickCalls, 1);
    assert.equal(run.waitCalls, 1);
    assert.equal(run.button.clickCount, 1);
    assert.equal(run.finalizeCalls, 0);
    assert.equal(run.finalizeResolved, false);
    assert.equal(campaign.currentIndex, 0);
    assert.equal(campaign.runMode, 'autopilot');
    assert.equal(campaign.runState, 'running');
    assert.equal(campaign.items[0].status, 'sent_pending_verification');
    assert.equal(campaign.items[1].status, 'pending');
    assert.equal(statuses.orders['order-1'].status, 'sent_pending_verification');
    assert.equal(statuses.outreach['order-1'].review_request.workflow, 'sent_pending_verification');
    assert.equal(run.navigations.length, 0);
    assert.equal(run.sandbox.location.href, run.firstUrl);
});

test('completed-order live review permalink is durable evidence and cannot enter a review campaign', async () => {
    const { api, storage } = await loadAssistant();
    await api.Outreach.setManualDecision('12345678', 'eligible');
    await api.Outreach.setManualDecision('12345679', 'eligible');

    const orderLink = {
        href: 'https://www.etsy.com/your/orders/sold/completed?order_id=12345678',
        parentElement: { textContent: '$24.00' },
    };
    const messageLink = { href: 'https://www.etsy.com/messages/reviewed-order-12345678' };
    const reviewLink = {
        href: '/shop/MakayShirts/reviews/987654321',
        textContent: 'Review',
        innerText: 'Review',
        getAttribute: () => '',
    };
    const row = {
        textContent: 'Delivered Order #12345678 Review',
        querySelectorAll(selector) {
            if (selector === 'a[href*="order_id="]') return [orderLink];
            if (selector === 'a[href*="/reviews/"]') return [reviewLink];
            if (selector.includes('/messages') || selector.includes('/conversations')) return [messageLink];
            if (selector === 'h2, .wt-text-title-small') return [{ textContent: 'Delivered' }];
            return [];
        },
        querySelector(selector) {
            if (selector.includes('btn-link.strong.fs-mask')) return { textContent: 'Reviewed Buyer' };
            return null;
        },
    };

    const order = api.OrdersAdapter.fromRow(row, 0);
    assert.equal(order.reviewExists, true);
    assert.equal(order.messageUrl, messageLink.href);
    assert.equal(api.OrdersAdapter.isReviewPermalink(reviewLink), true);
    assert.equal(api.OrdersAdapter.isReviewPermalink({
        ...reviewLink,
        href: 'https://evil.example/shop/MakayShirts/reviews/987654321',
    }), false);
    assert.equal(api.OrdersAdapter.isReviewPermalink({
        ...reviewLink,
        href: '/shop/MakayShirts/reviews/987654321?ref=orders',
    }), false);
    assert.equal(api.OrdersAdapter.isReviewPermalink({
        ...reviewLink,
        textContent: 'Review request',
        innerText: 'Review request',
    }), false);
    assert.equal(api.OrdersAdapter.rowHasExistingReview({
        textContent: 'Buyer left a review',
        querySelectorAll: selector => selector === '[aria-label]'
            ? [{ getAttribute: () => '5 out of 5 stars' }]
            : [],
    }), false, 'copy and stars without the strict row-local permalink must remain unknown');
    assert.equal(
        api.Campaign.orderCanEnterCampaign(order.orderId, api.Store.statuses, 'review_request', order),
        false,
        'live DOM evidence must override an earlier manual eligible decision',
    );

    const campaignOrder = {
        orderId: order.orderId,
        customerName: order.customerName,
        itemTitle: order.itemTitle,
        messageUrl: order.messageUrl,
        reviewExists: order.reviewExists,
    };
    await assert.rejects(
        api.Campaign.create([campaignOrder], 'tpl-review-request', 'template', { runMode: 'autopilot' }),
        /Yorum durumu/i,
    );
    assert.equal(storage.has(api.KEYS.campaign), false, 'rejection must happen before a campaign write');

    assert.equal(await api.OrdersAdapter.persistDetectedReviewEvidence([
        order,
        { orderId: '12345679', delivered: true, reviewExists: false },
        { orderId: '12345680', delivered: true, reviewExists: false },
    ]), 1);
    const outreach = api.Outreach.record(order.orderId, 'review_request');
    assert.equal(outreach.decision, 'ineligible');
    assert.equal(outreach.reason, 'review_exists');
    assert.equal(outreach.source, 'dom');
    assert.equal(outreach.evidenceExpiresAt, '');
    assert.equal(api.Campaign.orderCanEnterCampaign(order.orderId, api.Store.statuses, 'review_request'), false);
    api.UI.state.orders = [order];
    api.UI.state.selectedTemplateId = 'tpl-review-request';
    api.UI.state.selectedOrders = new Set([order.orderId]);
    const markup = api.UI.renderOrders();
    assert.match(markup, /Yorum var · Otomatik atlandı/);
    assert.match(markup, /Etsy yorumu bulundu — otomatik atlandı/);
    assert.match(markup, /data-review-decision="12345678"[^>]*disabled/);
    assert.match(markup, /value="review_exists" selected/);
    assert.doesNotMatch(markup, /data-order-select="12345678"[^>]*checked/);
    const absentWithManualEvidence = api.Outreach.record('12345679', 'review_request');
    assert.equal(absentWithManualEvidence.decision, 'eligible');
    assert.equal(absentWithManualEvidence.source, 'manual');
    assert.equal(api.Outreach.record('12345680', 'review_request').decision, 'unknown',
        'absence of a review link must remain unknown rather than auto-authorizing outreach');
});

test('running review autopilot skips durable review evidence before draft insertion or Etsy send', async () => {
    const { api, sandbox, storage } = await loadAssistant();
    await api.Outreach.setManualDecision('order-1', 'eligible');
    await api.Outreach.setManualDecision('order-2', 'eligible');
    const firstUrl = 'https://www.etsy.com/messages/review-order-1';
    const secondUrl = 'https://www.etsy.com/messages/review-order-2';
    const created = await api.Campaign.create([
        { orderId: 'order-1', customerName: 'Reviewed Buyer', itemTitle: 'First item', messageUrl: firstUrl },
        { orderId: 'order-2', customerName: 'Next Buyer', itemTitle: 'Second item', messageUrl: secondUrl },
    ], 'tpl-review-request', 'template', { runMode: 'autopilot' });
    sandbox.location.pathname = '/messages/review-order-1';
    sandbox.location.search = '';
    sandbox.location.href = firstUrl;

    assert.equal(await api.OrdersAdapter.persistDetectedReviewEvidence([{
        orderId: 'order-1',
        reviewExists: true,
    }]), 1);

    let insertCalls = 0;
    let autoSendCalls = 0;
    let onSendClickCalls = 0;
    const navigations = [];
    api.MessageAdapter.insert = () => { insertCalls += 1; };
    api.Campaign.autoSendIfCurrent = async () => { autoSendCalls += 1; return true; };
    api.Verification.onSendClick = async () => { onSendClickCalls += 1; return true; };
    api.Router.navigateToConversation = (value) => {
        navigations.push(value);
        sandbox.location.href = value;
        sandbox.location.pathname = new URL(value).pathname;
    };

    assert.equal(await api.Campaign.driveAutopilot({ recoveryComplete: true }), false);
    const campaign = storage.get(api.KEYS.campaign);
    const statuses = storage.get(api.KEYS.statuses);
    const outreach = statuses.outreach['order-1'].review_request;
    assert.equal(insertCalls, 0);
    assert.equal(autoSendCalls, 0);
    assert.equal(onSendClickCalls, 0);
    assert.equal(campaign.id, created.id);
    assert.equal(campaign.items[0].status, 'skipped');
    assert.equal(campaign.items[1].status, 'pending');
    assert.equal(campaign.currentIndex, 1);
    assert.equal(campaign.runState, 'running');
    assert.equal(statuses.orders['order-1'], undefined);
    assert.equal(outreach.decision, 'ineligible');
    assert.equal(outreach.reason, 'review_exists');
    assert.equal(outreach.source, 'dom');
    assert.equal(outreach.workflow, 'none');
    assert.equal(navigations.length, 1);
    assert.equal(navigations[0], secondUrl);
});
