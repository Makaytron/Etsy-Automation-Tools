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
                    options.requestedLocks?.push(name);
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
        OrdersAdapter,
        MessageCenterAgent,
        ReviewsAdapter,
        GMX,
        Translator,
        Prompt,
        AI,
        Router,
        Updates,
        UI,
        App,
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
        conversationUrl: 'https://www.etsy.com/messages/alice',
    }), true);
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
    const history = api.Store.history.filter(item => item.type === 'translated');
    assert.equal(history.length, 1);
    assert.equal(history[0].status, 'partial');
    assert.equal(history[0].detail.previews, 1);
    assert.equal(history[0].detail.failed, 1);
    assert.equal(api.History.stats().failed, 1);
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

    await api.App.onRoute();
    assert.equal(api.UI.state.page, 'templates');

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
    assert.match(ordersMarkup, /Gönderim sonucu.*doğrulanmayı bekliyor/i);
    assert.match(ordersMarkup, /Etsy.*kontrol.*Gönderildi.*Gönderilmedi/is);
    assert.match(ordersMarkup, /data-order-confirm-sent="order-1"/);
    assert.match(ordersMarkup, /data-order-confirm-not-sent="order-1"/);
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

test('campaign skip is a state-preserving no-op without a matching skippable active item', async () => {
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

    const terminal = await terminalEnvironment.api.Campaign.skipOrder('order-1');
    assert.equal(terminal.skipped, false);
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
