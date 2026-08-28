(() => {
    'use strict';

    const ORDER_ID = '10000001';
    const RECIPIENT_ID = '20000002';
    const BUYER_NAME = 'Fixture Buyer';
    const MESSAGE_URL = `https://www.etsy.com/conversations/new?with_id=${RECIPIENT_ID}&recipient_id=${RECIPIENT_ID}&referring_id=${ORDER_ID}&referring_type=receipt`;
    const THREAD_URL = 'https://www.etsy.com/messages/fixture-created-thread';
    const simulateComposeTransition = new URL(location.href).searchParams.get('transition') === '1';
    const storage = new Map();
    const valueListeners = new Map();
    const networkAttempts = [];
    let route = 'orders';
    let routeUrl = 'https://www.etsy.com/your/orders/sold/completed';
    let api = null;
    let routeListener = null;

    const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    const emitStorage = (key, oldValue, newValue) => {
        for (const handler of valueListeners.get(key) || []) handler(key, copy(oldValue), copy(newValue), false);
    };

    globalThis.GM = {
        info: { script: { updateURL: 'fixture://disabled', downloadURL: 'fixture://disabled' } },
        async getValue(key, fallback) { return copy(storage.has(key) ? storage.get(key) : fallback); },
        async setValue(key, value) {
            const oldValue = storage.get(key);
            storage.set(key, copy(value));
            emitStorage(key, oldValue, value);
        },
        async deleteValue(key) {
            const oldValue = storage.get(key);
            storage.delete(key);
            emitStorage(key, oldValue, undefined);
        },
        addValueChangeListener(key, handler) {
            const handlers = valueListeners.get(key) || [];
            handlers.push(handler);
            valueListeners.set(key, handlers);
            return handlers.length;
        },
        registerMenuCommand() {},
        addStyle(css) {
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
        },
        async getResourceURL() {
            return 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221%22 height=%221%22/%3E';
        },
        openInTab(url) { networkAttempts.push({ kind: 'open', url: String(url) }); return null; },
        xmlHttpRequest(options) {
            networkAttempts.push({ kind: 'xhr-blocked', url: String(options?.url || '') });
            queueMicrotask(() => options?.onerror?.(new Error('Fixture blocks external requests.')));
        },
    };
    globalThis.GM_info = globalThis.GM.info;
    globalThis.GM_addValueChangeListener = (key, handler) => globalThis.GM.addValueChangeListener(key, handler);
    globalThis.confirm = () => true;
    globalThis.open = url => { networkAttempts.push({ kind: 'window-open', url: String(url) }); return null; };
    document.addEventListener('click', (event) => {
        const link = event.target.closest?.('[href]');
        if (!link) return;
        try {
            const target = new URL(link.getAttribute('href') || '', location.href);
            if (target.origin === location.origin) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            networkAttempts.push({ kind: 'navigation-blocked', url: target.href });
        } catch {
            event.preventDefault();
            event.stopImmediatePropagation();
            networkAttempts.push({ kind: 'navigation-blocked', url: String(link.getAttribute('href') || '') });
        }
    }, true);

    const fixtureRoot = () => document.getElementById('etsy-fixture');
    const stateNode = () => document.getElementById('fixture-state');
    const setFixtureState = text => { stateNode().textContent = text; };

    function renderOrders() {
        route = 'orders';
        routeUrl = 'https://www.etsy.com/your/orders/sold/completed';
        fixtureRoot().innerHTML = `
          <h1>Completed Orders — Fixture</h1>
          <section class="order-group-list">
            <div class="panel-body-row">
              <div aria-label="Select this order from ${BUYER_NAME} on Aug 28, 2026"></div>
              <button class="btn-link strong fs-mask" type="button">${BUYER_NAME}</button>
              <h2>Teslim edildi</h2>
              <p><a href="https://www.etsy.com/your/orders/sold/completed?order_id=${ORDER_ID}">Sipariş #${ORDER_ID} — $24.00</a></p>
              <p><a href="https://www.etsy.com/transaction/30000003" title="Fixture Item"><img alt="Fixture Item" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="> Fixture Item</a></p>
              <clg-icon-button role="link" tabindex="0" aria-label="Message buyer" href="${MESSAGE_URL}">Message buyer</clg-icon-button>
            </div>
          </section>`;
        setFixtureState('sipariş sayfası');
    }

    function appendOutgoing(panel, text) {
        const row = document.createElement('div');
        row.className = 'wt-grid';
        const bubble = document.createElement('div');
        bubble.dataset.messageDirection = 'outgoing';
        bubble.dataset.messageId = `fixture-outgoing-${window.__MEMA_FIXTURE__.sendCount}`;
        const messageText = document.createElement('span');
        messageText.dataset.messageText = '';
        messageText.textContent = text;
        bubble.appendChild(messageText);
        row.appendChild(bubble);
        panel.insertBefore(row, panel.querySelector('.fixture-composer'));
    }

    function renderConversation({ thread = false } = {}) {
        route = 'messages';
        if (!thread) routeUrl = MESSAGE_URL;
        fixtureRoot().innerHTML = `
          <h1>Messages — ${thread ? 'Created thread' : 'New conversation'} fixture</h1>
          <section class="conversations-subapp">
            <div role="tabpanel" data-conversation-id="${thread ? 'fixture-created-thread' : `compose-${RECIPIENT_ID}`}">
              <h3 class="buyer-name"><a href="https://www.etsy.com/people/fixture-buyer">${BUYER_NAME}</a></h3>
              <a href="https://www.etsy.com/your/orders/sold/completed?order_id=${ORDER_ID}">Order #${ORDER_ID}</a>
              <a href="https://www.etsy.com/transaction/30000003" title="Fixture Item">Fixture Item</a>
              <div class="fixture-composer">
                <form id="fixture-message-form">
                  <label for="fixture-message">Reply</label>
                  <textarea id="fixture-message" name="message" placeholder="Reply"></textarea>
                </form>
                <button id="fixture-native-send" type="button" aria-label="Mesaj gönder">Mesaj gönder</button>
              </div>
            </div>
          </section>`;
        const textarea = document.getElementById('fixture-message');
        const sendButton = document.getElementById('fixture-native-send');
        sendButton.addEventListener('click', () => {
            const text = textarea.value.trim();
            if (!text) return;
            const panel = sendButton.closest('[role="tabpanel"]');
            textarea.value = '';
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            window.__MEMA_FIXTURE__.sendCount += 1;
            window.__MEMA_FIXTURE__.lastSentText = text;
            document.getElementById('fixture-send-count').textContent = String(window.__MEMA_FIXTURE__.sendCount);
            if (simulateComposeTransition && !thread) {
                routeUrl = THREAD_URL;
                fixtureRoot().innerHTML = '<h1>Messages — loading created thread</h1><div role="status" aria-busy="true">Konuşma yükleniyor…</div>';
                setFixtureState('konuşma rotası değişti; DOM yükleniyor');
                history.pushState({}, '', '/fixture/created-thread');
                queueMicrotask(() => {
                    void routeListener?.(api.Router.routeFingerprint());
                });
                setTimeout(() => {
                    renderConversation({ thread: true });
                    void routeListener?.(api.Router.routeFingerprint());
                    setTimeout(() => {
                        const hydratedPanel = fixtureRoot().querySelector('[role="tabpanel"]');
                        appendOutgoing(hydratedPanel, text);
                        void routeListener?.(api.Router.routeFingerprint());
                    }, 550);
                }, 350);
            } else appendOutgoing(panel, text);
        });
        setFixtureState('mesaj sayfası');
    }

    const waitUntil = async (predicate, label, timeout = 8000) => {
        const started = performance.now();
        while (performance.now() - started < timeout) {
            const result = predicate();
            if (result) return result;
            await new Promise(resolve => setTimeout(resolve, 30));
        }
        throw new Error(`Fixture timeout: ${label}`);
    };

    async function runScenario() {
        if (!api) throw new Error('Message Assistant test API is not ready.');
        const shadow = api.UI.shadow;
        shadow.querySelector('[data-action="toggle-app"]').click();
        await waitUntil(() => api.UI.state.open && api.UI.state.page === 'orders', 'orders panel open');

        const decision = await waitUntil(() => shadow.querySelector(`[data-review-decision="${ORDER_ID}"]`), 'review decision');
        decision.value = 'eligible';
        decision.dispatchEvent(new Event('change', { bubbles: true }));
        await waitUntil(
            () => shadow.querySelector(`[data-order-select="${ORDER_ID}"]`)?.checked,
            'eligible order selected',
        );

        shadow.querySelector('[data-action="campaign-create"]').click();
        await waitUntil(() => route === 'messages', 'fixture conversation navigation');
        const textarea = await waitUntil(
            () => document.getElementById('fixture-message')?.value.trim() && document.getElementById('fixture-message'),
            'campaign draft insertion',
        );
        await waitUntil(() => api.Store.campaign?.items?.[0]?.status === 'inserted', 'campaign inserted state');
        await waitUntil(
            () => api.UI.shadow.querySelector('[data-action="campaign-send-next"]'),
            'guided send control',
        );
        const nativeButton = document.getElementById('fixture-native-send');
        const resolvedButton = api.MessageAdapter.getSendButton();
        const guidedButton = shadow.querySelector('[data-action="campaign-send-next"]');
        const before = {
            routeIdentity: api.Router.conversationIdentity(routeUrl),
            messageUrl: api.Store.campaign?.items?.[0]?.messageUrl || '',
            composerText: textarea.value,
            nativeButtonResolved: resolvedButton === nativeButton,
            guidedButtonEnabled: Boolean(guidedButton && !guidedButton.disabled),
            campaignStatus: api.Store.campaign?.status || '',
            itemStatus: api.Store.campaign?.items?.[0]?.status || '',
        };

        const assertFixture = (condition, message) => {
            if (!condition) throw new Error(`Fixture assertion failed: ${message}`);
        };
        assertFixture(before.routeIdentity === `compose:${RECIPIENT_ID}:receipt:${ORDER_ID}`, 'compose route identity');
        assertFixture(before.messageUrl === MESSAGE_URL, 'receipt-bound campaign URL');
        assertFixture(Boolean(before.composerText.trim()), 'non-empty campaign draft');
        assertFixture(before.nativeButtonResolved, 'native Etsy Send selector');
        assertFixture(before.guidedButtonEnabled, 'guided send control');
        assertFixture(before.campaignStatus === 'active', 'active campaign before Send');
        assertFixture(before.itemStatus === 'inserted', 'inserted item before Send');

        guidedButton.click();
        await waitUntil(() => api.Store.campaign?.status === 'completed', 'verified campaign completion');
        await waitUntil(() => api.Store.statuses.orders?.[ORDER_ID]?.status === 'sent', 'persistent sent order status');
        await waitUntil(
            () => api.Store.statuses.conversations?.['fixture-created-thread']?.status === 'sent',
            'created thread conversation ledger',
        );

        const result = {
            before,
            after: {
                sendCount: window.__MEMA_FIXTURE__.sendCount,
                lastSentText: window.__MEMA_FIXTURE__.lastSentText,
                outgoingCount: document.querySelectorAll('[data-message-direction="outgoing"]').length,
                campaignStatus: api.Store.campaign?.status || '',
                itemStatus: api.Store.campaign?.items?.[0]?.status || '',
                orderStatus: api.Store.statuses.orders?.[ORDER_ID]?.status || '',
                conversationStatus: api.Store.statuses.conversations?.['fixture-created-thread']?.status || '',
                outreachWorkflow: api.Store.statuses.outreach?.[ORDER_ID]?.review_request?.workflow || '',
            },
            externalNetworkAttempts: copy(networkAttempts),
        };
        assertFixture(result.after.sendCount === 1, 'exactly one native Send click');
        assertFixture(result.after.lastSentText === before.composerText.trim(), 'sent text matches the inserted draft');
        assertFixture(result.after.outgoingCount === 1, 'exactly one semantic outgoing bubble');
        assertFixture(result.after.campaignStatus === 'completed', 'completed campaign after verification');
        assertFixture(result.after.itemStatus === 'sent', 'sent campaign item after verification');
        assertFixture(result.after.orderStatus === 'sent', 'sent order after verification');
        assertFixture(result.after.conversationStatus === 'sent', 'created thread conversation ledger after verification');
        assertFixture(result.after.outreachWorkflow === 'sent', 'sent review-request workflow after verification');
        document.getElementById('fixture-last-result').textContent = JSON.stringify(result.after);
        return result;
    }

    window.__MEMA_FIXTURE__ = {
        orderId: ORDER_ID,
        recipientId: RECIPIENT_ID,
        messageUrl: MESSAGE_URL,
        simulateComposeTransition,
        sendCount: 0,
        lastSentText: '',
        networkAttempts,
        runScenario,
        get api() { return api; },
    };

    renderOrders();
    globalThis.addEventListener('mema:test-api-ready', async () => {
        api = globalThis.__MEMA_TEST__;
        const originalConversationIdFromUrl = api.Router.conversationIdFromUrl.bind(api.Router);
        const originalCanonicalConversationUrl = api.Router.canonicalConversationUrl.bind(api.Router);
        const originalIsComposeTarget = api.Router.isComposeTarget.bind(api.Router);
        api.Router.page = () => route;
        api.Router.isCompletedOrdersPage = () => route === 'orders';
        api.Router.isMessageListPage = () => false;
        api.Router.conversationIdFromUrl = (value = routeUrl) => {
            const candidate = String(value || '');
            if (candidate.startsWith(location.origin)) return route === 'messages'
                ? originalConversationIdFromUrl(routeUrl)
                : '';
            return originalConversationIdFromUrl(candidate);
        };
        api.Router.canonicalConversationUrl = (value, options = {}) => originalCanonicalConversationUrl(value, options);
        api.Router.isComposeTarget = (value = routeUrl) => {
            const candidate = String(value || '');
            return originalIsComposeTarget(candidate.startsWith(location.origin) ? routeUrl : candidate);
        };
        api.Router.routeFingerprint = () => `${routeUrl}|${route}|${api.Router.conversationIdFromUrl(routeUrl)}`;
        api.Router.start = onChange => { routeListener = onChange; };
        api.Router.navigateToConversation = value => {
            const safe = originalCanonicalConversationUrl(value);
            if (!safe) throw new Error('Fixture rejected an unsafe conversation URL.');
            routeUrl = safe;
            renderConversation();
            history.pushState({}, '', '/fixture/messages');
            queueMicrotask(() => {
                void routeListener?.(api.Router.routeFingerprint());
            });
            return true;
        };
        await api.App.init();
        setFixtureState('hazır');
    }, { once: true });
})();
