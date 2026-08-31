(() => {
    'use strict';

    const ORDER_ID = '10000001';
    const RECIPIENT_ID = '20000002';
    const BUYER_NAME = 'Fixture Buyer';
    const LEGACY_MESSAGE_URL = `https://www.etsy.com/conversations/new?with_id=${RECIPIENT_ID}&recipient_id=${RECIPIENT_ID}&referring_id=${ORDER_ID}&referring_type=receipt`;
    const ORDER_SURFACE_URL = `https://www.etsy.com/your/orders/sold/completed?ref=seller-platform-mcnav&expand_convo=true&order_id=${ORDER_ID}`;
    const PURCHASE_PREFILL_URL = `https://www.etsy.com/your/purchases/${ORDER_ID}`;
    const THREAD_URL = 'https://www.etsy.com/messages/fixture-created-thread';
    const parameters = new URL(location.href).searchParams;
    const orderSurfaceMode = parameters.get('order_surface') === '1';
    const messageListMode = parameters.get('message_list') === '1';
    const delayedOrderContextMode = parameters.get('delayed_order_context') === '1';
    const MESSAGE_URL = orderSurfaceMode ? ORDER_SURFACE_URL : LEGACY_MESSAGE_URL;
    const simulateComposeTransition = parameters.get('transition') === '1';
    const sendLanguage = parameters.get('label') === 'en' ? 'en' : 'tr';
    const nativeSendDisabled = parameters.get('disabled') === '1';
    const transitionOrderId = parameters.get('transition_order') || ORDER_ID;
    const transitionBuyerName = parameters.get('transition_buyer') || BUYER_NAME;
    const nativeInputMode = parameters.get('native_input') || '';
    const nativeInputBlock = parameters.get('block') || '';
    const shortcutCount = Math.max(1, Number.parseInt(parameters.get('shortcut_count') || '1', 10) || 1);
    const shortcutModifier = parameters.get('shortcut_modifier') === 'meta' ? 'meta' : 'ctrl';
    const LONG_LIST_BUYER = `FixtureBuyer${'LongName'.repeat(8)}`;
    const LONG_LIST_PREVIEW = `Preview${'UnbrokenMessageSegment'.repeat(70)}`;
    const storage = new Map();
    const valueListeners = new Map();
    const networkAttempts = [];
    const shortcutEvents = [];
    const submitIntents = [];
    const sendClickIntents = [];
    const formSubmitEvents = [];
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
        const sendButton = event.target.closest?.('#fixture-native-send');
        if (sendButton) sendClickIntents.push({
            isTrusted: event.isTrusted,
            defaultPrevented: event.defaultPrevented,
        });
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
    document.addEventListener('submit', (event) => {
        if (event.target?.id !== 'fixture-message-form') return;
        submitIntents.push({
            isTrusted: event.isTrusted,
            submitterId: event.submitter?.id || '',
            defaultPrevented: event.defaultPrevented,
        });
    }, true);
    document.addEventListener('keydown', (event) => {
        if (event.target?.id !== 'fixture-message' || event.key !== 'Enter'
            || (!event.ctrlKey && !event.metaKey) || event.shiftKey) return;
        shortcutEvents.push({
            isTrusted: event.isTrusted,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            repeat: event.repeat,
        });
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
              ${orderSurfaceMode
                    ? `<p><a href="https://www.etsy.com/conversations/with/fixturebuyer?ref=order_details">Message history</a></p>
                       <clg-icon-button role="button" tabindex="0" aria-label="Message buyer"><clg-icon name="message"></clg-icon>Message buyer</clg-icon-button>`
                    : `<clg-icon-button role="link" tabindex="0" aria-label="Message buyer" href="${MESSAGE_URL}">Message buyer</clg-icon-button>`}
            </div>
          </section>`;
        setFixtureState('sipariş sayfası');
    }

    function renderMessageList() {
        route = 'messages';
        routeUrl = 'https://www.etsy.com/messages/all';
        fixtureRoot().innerHTML = `
          <h1>Messages - Conversation list fixture</h1>
          <section class="conversations-subapp">
            <ul class="scrolling-message-list" aria-label="Conversation list">
              <li class="conversation-row unread" role="listitem" data-conversation-id="fixture-long-thread">
                <a href="https://www.etsy.com/messages/fixture-long-thread"
                   aria-label="Conversation with ${LONG_LIST_BUYER}, from 1 hour ago">
                  <span class="buyer-name" data-test-id="buyer-name">${LONG_LIST_BUYER}</span>
                  <span class="message-preview" data-test-id="message-preview">${LONG_LIST_PREVIEW}</span>
                  <time datetime="2026-08-29T12:00:00.000Z">1 hour ago</time>
                  <span aria-label="Unread">Unread</span>
                </a>
              </li>
              <li class="conversation-row" role="listitem" data-conversation-id="fixture-short-thread">
                <a href="https://www.etsy.com/messages/fixture-short-thread"
                   aria-label="Conversation with Second Fixture Buyer, from 2 hours ago">
                  <span class="buyer-name" data-test-id="buyer-name">Second Fixture Buyer</span>
                  <span class="message-preview" data-test-id="message-preview">A normal visible message preview.</span>
                  <time datetime="2026-08-29T11:00:00.000Z">2 hours ago</time>
                </a>
              </li>
            </ul>
          </section>`;
        setFixtureState('message list');
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

    async function appendOutgoingAfterTransitionBaseline(text) {
        await waitUntil(() => {
            const pending = api?.Verification?.activePending || api?.Verification?.pending;
            return pending?.transitionBaselineMatches != null
                && pending.transitionBaselineRouteFingerprint === api.Router.routeFingerprint();
        }, 'compose transition verification baseline', 7000);
        const hydratedPanel = fixtureRoot().querySelector('[role="tabpanel"]');
        if (!hydratedPanel) throw new Error('Fixture lost the hydrated conversation panel.');
        appendOutgoing(hydratedPanel, text);
        await routeListener?.(api.Router.routeFingerprint());
    }

    async function appendMismatchedOutgoing(text) {
        await new Promise(resolve => setTimeout(resolve, 550));
        const hydratedPanel = fixtureRoot().querySelector('[role="tabpanel"]');
        if (!hydratedPanel) throw new Error('Fixture lost the mismatched conversation panel.');
        appendOutgoing(hydratedPanel, text);
        await routeListener?.(api.Router.routeFingerprint());
    }

    async function runComposeTransition(text) {
        await waitUntil(
            () => {
                const pending = api?.Verification?.activePending;
                return pending?.sourceWasCompose && pending?.sendCapturedAt ? pending : null;
            },
            'active compose send verification',
            5000,
        );

        routeUrl = THREAD_URL;
        fixtureRoot().innerHTML = '<h1>Messages — loading created thread</h1><div role="status" aria-busy="true">Konuşma yükleniyor…</div>';
        setFixtureState('konuşma rotası değişti; DOM yükleniyor');
        history.pushState({}, '', '/fixture/created-thread');
        await routeListener?.(api.Router.routeFingerprint());

        await new Promise(resolve => setTimeout(resolve, 350));
        renderConversation({ thread: true });
        await routeListener?.(api.Router.routeFingerprint());
        const exactTransition = transitionOrderId === ORDER_ID && transitionBuyerName === BUYER_NAME;
        if (exactTransition) await appendOutgoingAfterTransitionBaseline(text);
        else await appendMismatchedOutgoing(text);
    }

    function renderConversation({ thread = false, incoming = false } = {}) {
        route = 'messages';
        routeUrl = thread ? THREAD_URL : MESSAGE_URL;
        const effectiveBuyerName = thread ? transitionBuyerName : BUYER_NAME;
        const effectiveOrderId = thread ? transitionOrderId : ORDER_ID;
        const delayOrderContext = orderSurfaceMode && delayedOrderContextMode && !thread;
        const orderContextMarkup = `
              <h3 class="buyer-name"><a href="https://www.etsy.com/people/fixture-buyer">${effectiveBuyerName}</a></h3>
              <a href="https://www.etsy.com/your/orders/sold/completed?order_id=${effectiveOrderId}">Order #${effectiveOrderId}</a>
              ${orderSurfaceMode && !thread
                    ? '<a data-fixture-message-history href="https://www.etsy.com/conversations/with/fixturebuyer?ref=order_details">Message history</a>'
                    : ''}`;
        const nativeSendLabel = sendLanguage === 'en' ? 'Send' : 'Mesaj gönder';
        fixtureRoot().innerHTML = `
          <h1>Messages — ${thread ? 'Created thread' : 'New conversation'} fixture</h1>
          <section class="conversations-subapp">
            <div role="tabpanel" ${thread ? 'data-conversation-id="fixture-created-thread"' : ''}>
              <div id="fixture-order-context" ${delayOrderContext ? 'aria-busy="true"' : ''}>${delayOrderContext ? '' : orderContextMarkup}</div>
              <a href="https://www.etsy.com/transaction/30000003" title="Fixture Item">Fixture Item</a>
              ${incoming ? `<div class="wt-grid"><div data-message-direction="incoming" data-message-id="fixture-incoming-1"><span data-message-text>Hello from the fixture buyer.</span></div></div>` : ''}
              <div class="fixture-composer">
                <form id="fixture-message-form">
                  <label for="fixture-message">Reply</label>
                  <textarea id="fixture-message" name="message" placeholder="Reply"></textarea>
                  <button id="fixture-save-draft" type="submit" aria-label="Save draft">Save draft</button>
                  <button id="fixture-native-send" type="submit" aria-label="${nativeSendLabel}" ${nativeSendDisabled ? 'disabled' : ''}>${nativeSendLabel}</button>
                </form>
              </div>
            </div>
          </section>`;
        const form = document.getElementById('fixture-message-form');
        const textarea = document.getElementById('fixture-message');
        const sendButton = document.getElementById('fixture-native-send');
        if (orderSurfaceMode && !thread) {
            textarea.value = PURCHASE_PREFILL_URL;
            window.__MEMA_FIXTURE__.initialComposerText = textarea.value;
        }
        textarea.addEventListener('input', () => {
            if (textarea.value.trim() && textarea.value !== PURCHASE_PREFILL_URL) {
                window.__MEMA_FIXTURE__.draftInsertionCount += 1;
            }
        });
        if (delayOrderContext) {
            window.__MEMA_FIXTURE__.contextHydrationScheduledAt = performance.now();
            setTimeout(() => {
                const target = document.getElementById('fixture-order-context');
                if (!target || target.getAttribute('aria-busy') !== 'true') return;
                window.__MEMA_FIXTURE__.preHydrationComposerText = textarea.value;
                target.innerHTML = orderContextMarkup;
                target.removeAttribute('aria-busy');
                window.__MEMA_FIXTURE__.contextHydratedAt = performance.now();
            }, 1600);
        }
        sendButton.addEventListener('click', () => {
            window.__MEMA_FIXTURE__.nativeTargetClickCount += 1;
        });
        textarea.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey) || event.shiftKey || event.repeat) return;
            window.__MEMA_FIXTURE__.nativeShortcutHandlerCount += 1;
            event.preventDefault();
            form.requestSubmit(sendButton);
        });
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const text = textarea.value.trim();
            if (!text) return;
            const panel = sendButton.closest('[role="tabpanel"]');
            formSubmitEvents.push({
                isTrusted: event.isTrusted,
                submitterId: event.submitter?.id || '',
            });
            textarea.value = '';
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            window.__MEMA_FIXTURE__.sendCount += 1;
            window.__MEMA_FIXTURE__.lastSentText = text;
            document.getElementById('fixture-send-count').textContent = String(window.__MEMA_FIXTURE__.sendCount);
            if (simulateComposeTransition && !thread) {
                window.__MEMA_FIXTURE__.transitionPromise = runComposeTransition(text);
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

    const assertFixture = (condition, message) => {
        if (!condition) throw new Error(`Fixture assertion failed: ${message}`);
    };

    async function prepareCampaign({ expectSendEnabled = false, deliveryFollowup = false } = {}) {
        if (!api) throw new Error('Message Assistant test API is not ready.');
        const shadow = await waitUntil(() => api.UI.shadow, 'Message Assistant shadow root');
        if (!api.UI.state.open) shadow.querySelector('[data-action="toggle-app"]').click();
        await waitUntil(() => api.UI.state.open && api.UI.state.page === 'orders', 'orders panel open');

        if (deliveryFollowup) {
            const selection = await waitUntil(
                () => shadow.querySelector(`[data-order-select="${ORDER_ID}"]`),
                'delivered order selection',
            );
            if (!selection.checked) selection.click();
        } else {
            const decision = await waitUntil(() => shadow.querySelector(`[data-review-decision="${ORDER_ID}"]`), 'review decision');
            decision.value = 'eligible';
            decision.dispatchEvent(new Event('change', { bubbles: true }));
        }
        await waitUntil(
            () => shadow.querySelector(`[data-order-select="${ORDER_ID}"]`)?.checked,
            'eligible order selected',
        );

        shadow.querySelector('[data-action="campaign-create"]').click();
        await waitUntil(() => route === 'messages', 'fixture conversation navigation');
        await waitUntil(() => api.Store.campaign?.items?.[0]?.status === 'inserted', 'campaign inserted state');
        const textarea = await waitUntil(
            () => document.getElementById('fixture-message')?.value.trim() && document.getElementById('fixture-message'),
            'campaign draft insertion',
        );
        const guidedButton = await waitUntil(() => {
            const candidate = api.UI.shadow.querySelector('[data-action="campaign-send-next"]');
            return candidate && (!expectSendEnabled || !candidate.disabled) ? candidate : null;
        }, expectSendEnabled ? 'enabled guided send control' : 'guided send control');
        const nativeButton = document.getElementById('fixture-native-send');
        const resolvedButton = api.MessageAdapter.getSendButton();
        const before = {
            routeIdentity: api.Router.conversationIdentity(routeUrl),
            messageUrl: api.Store.campaign?.items?.[0]?.messageUrl || '',
            initialComposerText: window.__MEMA_FIXTURE__.initialComposerText,
            composerText: textarea.value,
            nativeButtonResolved: resolvedButton === nativeButton,
            messageHistoryInsideComposer: Boolean(document.querySelector('[data-fixture-message-history]')),
            guidedButtonEnabled: Boolean(guidedButton && !guidedButton.disabled),
            campaignStatus: api.Store.campaign?.status || '',
            itemStatus: api.Store.campaign?.items?.[0]?.status || '',
        };

        const expectedRouteIdentity = orderSurfaceMode
            ? `compose:order:receipt:${ORDER_ID}`
            : `compose:${RECIPIENT_ID}:receipt:${ORDER_ID}`;
        assertFixture(before.routeIdentity === expectedRouteIdentity, 'compose route identity');
        assertFixture(before.messageUrl === MESSAGE_URL, 'receipt-bound campaign URL');
        if (orderSurfaceMode) assertFixture(before.messageHistoryInsideComposer, 'order composer includes Etsy Message history link');
        assertFixture(Boolean(before.composerText.trim()), 'non-empty campaign draft');
        assertFixture(before.campaignStatus === 'active', 'active campaign before Send');
        assertFixture(before.itemStatus === 'inserted', 'inserted item before Send');
        return { shadow, textarea, nativeButton, guidedButton, before };
    }

    async function runScenario(options = {}) {
        const prepared = await prepareCampaign({ expectSendEnabled: true });
        const { guidedButton, before } = prepared;
        assertFixture(before.nativeButtonResolved, `${sendLanguage} native Etsy Send selector`);
        assertFixture(before.guidedButtonEnabled, 'guided send control');

        const doubleClick = options.doubleClick === true || parameters.get('double') === '1';
        guidedButton.click();
        if (doubleClick) guidedButton.click();
        if (simulateComposeTransition) {
            const transitionPromise = await waitUntil(
                () => window.__MEMA_FIXTURE__.transitionPromise,
                'compose transition fixture task',
            );
            await transitionPromise;
        }
        await waitUntil(() => api.Store.campaign?.status === 'completed', 'verified campaign completion');
        await waitUntil(() => api.Store.statuses.orders?.[ORDER_ID]?.status === 'sent', 'persistent sent order status');
        const conversationId = simulateComposeTransition
            ? 'fixture-created-thread'
            : api.Router.conversationIdFromUrl(routeUrl);
        await waitUntil(() => api.Store.statuses.conversations?.[conversationId]?.status === 'sent', 'conversation ledger');

        const result = {
            before,
            after: {
                sendCount: window.__MEMA_FIXTURE__.sendCount,
                lastSentText: window.__MEMA_FIXTURE__.lastSentText,
                outgoingCount: document.querySelectorAll('[data-message-direction="outgoing"]').length,
                campaignStatus: api.Store.campaign?.status || '',
                itemStatus: api.Store.campaign?.items?.[0]?.status || '',
                orderStatus: api.Store.statuses.orders?.[ORDER_ID]?.status || '',
                conversationId,
                conversationStatus: api.Store.statuses.conversations?.[conversationId]?.status || '',
                outreachWorkflow: api.Store.statuses.outreach?.[ORDER_ID]?.review_request?.workflow || '',
                sendLanguage,
                doubleClick,
            },
            externalNetworkAttempts: copy(networkAttempts),
        };
        assertFixture(result.after.sendCount === 1, 'exactly one native Send click');
        assertFixture(result.after.lastSentText === before.composerText.trim(), 'sent text matches the inserted draft');
        assertFixture(result.after.outgoingCount === 1, 'exactly one semantic outgoing bubble');
        assertFixture(result.after.campaignStatus === 'completed', 'completed campaign after verification');
        assertFixture(result.after.itemStatus === 'sent', 'sent campaign item after verification');
        assertFixture(result.after.orderStatus === 'sent', 'sent order after verification');
        assertFixture(result.after.conversationStatus === 'sent', 'conversation ledger after verification');
        assertFixture(result.after.outreachWorkflow === 'sent', 'sent review-request workflow after verification');
        document.getElementById('fixture-last-result').textContent = JSON.stringify(result.after);
        return result;
    }

    async function runDisabledSendScenario() {
        assertFixture(nativeSendDisabled, 'disabled-send scenario flag');
        const { nativeButton, guidedButton, before } = await prepareCampaign();
        assertFixture(!before.nativeButtonResolved, 'disabled native Send rejected');
        assertFixture(!before.guidedButtonEnabled && guidedButton?.disabled, 'guided Send remains disabled');

        let error = '';
        try { await api.Campaign.sendCurrentByUser(); }
        catch (caught) { error = String(caught?.message || caught); }
        nativeButton.click();
        await new Promise(resolve => setTimeout(resolve, 100));

        const result = {
            sendCount: window.__MEMA_FIXTURE__.sendCount,
            outgoingCount: document.querySelectorAll('[data-message-direction="outgoing"]').length,
            campaignStatus: api.Store.campaign?.status || '',
            itemStatus: api.Store.campaign?.items?.[0]?.status || '',
            orderStatus: api.Store.statuses.orders?.[ORDER_ID]?.status || '',
            error,
        };
        assertFixture(/Send|Gönder/i.test(error), 'disabled Send reports an explicit error');
        assertFixture(result.sendCount === 0, 'disabled native Send never clicked');
        assertFixture(result.outgoingCount === 0, 'disabled Send creates no outgoing bubble');
        assertFixture(result.campaignStatus === 'active', 'disabled Send leaves campaign active');
        assertFixture(result.itemStatus === 'inserted', 'disabled Send leaves draft inserted');
        assertFixture(result.orderStatus !== 'sent', 'disabled Send creates no sent order ledger');
        document.getElementById('fixture-last-result').textContent = JSON.stringify(result);
        return { before, after: result, externalNetworkAttempts: copy(networkAttempts) };
    }

    async function runOrderSurfaceScenario() {
        assertFixture(orderSurfaceMode, 'order-compose surface scenario flag');
        await api.Store.saveSettings({
            ...api.Store.settings,
            autoSendCampaign: true,
            replyInCustomerLanguage: false,
            defaultDeliveredTemplateId: 'tpl-delivered',
        });
        api.UI.state.ordersTemplateInitialized = false;
        api.UI.refreshOrders();
        api.UI.render();

        const { before } = await prepareCampaign({ expectSendEnabled: true, deliveryFollowup: true });
        await new Promise(resolve => setTimeout(resolve, 1400));
        const result = {
            messageUrl: api.Store.campaign?.items?.[0]?.messageUrl || '',
            routeIdentity: api.Router.conversationIdentity(routeUrl),
            initialComposerText: before.initialComposerText,
            composerText: document.getElementById('fixture-message')?.value || '',
            autoSendCampaign: api.Store.settings.autoSendCampaign,
            purpose: api.Store.campaign?.items?.[0]?.purpose || '',
            campaignStatus: api.Store.campaign?.status || '',
            itemStatus: api.Store.campaign?.items?.[0]?.status || '',
            orderStatus: api.Store.statuses.orders?.[ORDER_ID]?.status || '',
            guidedButtonEnabled: before.guidedButtonEnabled,
            sendCount: window.__MEMA_FIXTURE__.sendCount,
            nativeTargetClickCount: window.__MEMA_FIXTURE__.nativeTargetClickCount,
            formSubmitCount: formSubmitEvents.length,
            outgoingCount: document.querySelectorAll('[data-message-direction="outgoing"]').length,
        };
        assertFixture(result.messageUrl === ORDER_SURFACE_URL, 'href-less native control synthesized the exact order surface');
        assertFixture(result.routeIdentity === `compose:order:receipt:${ORDER_ID}`, 'receipt-bound order surface identity');
        assertFixture(result.initialComposerText === PURCHASE_PREFILL_URL, 'exact Etsy purchase prefill observed');
        assertFixture(Boolean(result.composerText.trim()) && result.composerText !== PURCHASE_PREFILL_URL,
            'campaign draft safely replaces the exact Etsy purchase prefill');
        assertFixture(result.autoSendCampaign && result.purpose === 'delivery_followup',
            'scenario would normally permit campaign automatic sending');
        assertFixture(result.campaignStatus === 'active' && result.itemStatus === 'inserted' && result.orderStatus === 'inserted',
            'order surface remains prepared for explicit manual Send');
        assertFixture(result.guidedButtonEnabled, 'explicit guided Send remains available');
        assertFixture(result.sendCount === 0 && result.nativeTargetClickCount === 0 && result.formSubmitCount === 0,
            'order surface never dispatches automatically');
        assertFixture(result.outgoingCount === 0, 'order surface creates no outgoing message before manual Send');
        document.getElementById('fixture-last-result').textContent = JSON.stringify(result);
        return { before, after: result, externalNetworkAttempts: copy(networkAttempts) };
    }

    async function runDelayedOrderContextScenario() {
        assertFixture(orderSurfaceMode && delayedOrderContextMode, 'delayed order context scenario flags');
        const scenario = await runOrderSurfaceScenario();
        const result = {
            ...scenario.after,
            draftInsertionCount: window.__MEMA_FIXTURE__.draftInsertionCount,
            preHydrationComposerText: window.__MEMA_FIXTURE__.preHydrationComposerText,
            hydrationDelayMs: window.__MEMA_FIXTURE__.contextHydratedAt
                - window.__MEMA_FIXTURE__.contextHydrationScheduledAt,
        };
        assertFixture(result.hydrationDelayMs >= 1500, 'buyer/order context hydrates at least 1500 ms later');
        assertFixture(result.preHydrationComposerText === PURCHASE_PREFILL_URL,
            'exact Etsy purchases prefill remains untouched before context hydration');
        assertFixture(result.draftInsertionCount === 1, 'production prepares the draft exactly once');
        assertFixture(result.sendCount === 0 && result.nativeTargetClickCount === 0
            && result.formSubmitCount === 0 && result.outgoingCount === 0,
        'delayed context preparation never dispatches');
        return { before: scenario.before, after: result, externalNetworkAttempts: copy(networkAttempts) };
    }

    async function runOrderSurfaceManualSendScenario() {
        const noAuto = await runOrderSurfaceScenario();
        const expectedText = noAuto.after.composerText;
        const guidedButton = await waitUntil(() => {
            const candidate = api.UI.shadow.querySelector('[data-action="campaign-send-next"]');
            return candidate && !candidate.disabled ? candidate : null;
        }, 'order surface guided Send control');
        guidedButton.click();

        await waitUntil(() => api.Store.campaign?.status === 'completed', 'order surface campaign completion');
        await waitUntil(() => api.Store.statuses.orders?.[ORDER_ID]?.status === 'sent', 'order surface sent order ledger');
        const conversationId = api.Router.conversationIdFromUrl(routeUrl);
        await waitUntil(
            () => api.Store.statuses.conversations?.[conversationId]?.status === 'sent',
            'order surface sent conversation ledger',
        );
        const result = {
            noAuto: noAuto.after,
            expectedText,
            lastSentText: window.__MEMA_FIXTURE__.lastSentText,
            composerText: document.getElementById('fixture-message')?.value || '',
            sendCount: window.__MEMA_FIXTURE__.sendCount,
            nativeTargetClickCount: window.__MEMA_FIXTURE__.nativeTargetClickCount,
            formSubmitCount: formSubmitEvents.length,
            outgoingCount: document.querySelectorAll('[data-message-direction="outgoing"]').length,
            campaignStatus: api.Store.campaign?.status || '',
            itemStatus: api.Store.campaign?.items?.[0]?.status || '',
            orderStatus: api.Store.statuses.orders?.[ORDER_ID]?.status || '',
            conversationId,
            conversationStatus: api.Store.statuses.conversations?.[conversationId]?.status || '',
        };
        assertFixture(result.noAuto.sendCount === 0
            && result.noAuto.nativeTargetClickCount === 0
            && result.noAuto.formSubmitCount === 0
            && result.noAuto.outgoingCount === 0,
        'manual scenario first proves the full no-auto observation window');
        assertFixture(result.sendCount === 1 && result.nativeTargetClickCount === 1 && result.formSubmitCount === 1,
            'one explicit guided action reaches one native form submit');
        assertFixture(result.outgoingCount === 1, 'manual order-surface send creates one outgoing message');
        assertFixture(result.lastSentText === result.expectedText, 'manual order-surface send preserves the exact prepared text');
        assertFixture(result.composerText === '', 'manual order-surface send clears the composer');
        assertFixture(result.campaignStatus === 'completed'
            && result.itemStatus === 'sent'
            && result.orderStatus === 'sent'
            && result.conversationStatus === 'sent',
        'manual order-surface send completes every durable ledger');
        document.getElementById('fixture-last-result').textContent = JSON.stringify(result);
        return { after: result, externalNetworkAttempts: copy(networkAttempts) };
    }

    async function runMismatchScenario() {
        assertFixture(simulateComposeTransition, 'mismatch scenario uses compose transition');
        assertFixture(
            transitionOrderId !== ORDER_ID || transitionBuyerName !== BUYER_NAME,
            'mismatch scenario changes customer or order',
        );
        const { guidedButton, before } = await prepareCampaign({ expectSendEnabled: true });
        assertFixture(before.nativeButtonResolved && before.guidedButtonEnabled, 'mismatch scenario can dispatch locally');
        guidedButton.click();
        await waitUntil(() => window.__MEMA_FIXTURE__.sendCount === 1, 'single local dispatch');
        const transitionPromise = await waitUntil(
            () => window.__MEMA_FIXTURE__.transitionPromise,
            'mismatched compose transition fixture task',
        );
        await transitionPromise;
        await waitUntil(() => document.querySelector('[role="tabpanel"]'), 'mismatched thread hydration');
        await waitUntil(
            () => document.querySelectorAll('[data-message-direction="outgoing"]').length === 1,
            'mismatched outgoing bubble',
        );
        await new Promise(resolve => setTimeout(resolve, 300));
        await waitUntil(() => !api.Verification.activePromise, 'mismatch verification stops', 5000);

        const conversationStatuses = Object.values(api.Store.statuses.conversations || {});
        const result = {
            sendCount: window.__MEMA_FIXTURE__.sendCount,
            outgoingCount: document.querySelectorAll('[data-message-direction="outgoing"]').length,
            actualOrderId: api.MessageAdapter.context().orderId,
            actualBuyerName: api.MessageAdapter.context().customerName,
            campaignStatus: api.Store.campaign?.status || '',
            itemStatus: api.Store.campaign?.items?.[0]?.status || '',
            orderStatus: api.Store.statuses.orders?.[ORDER_ID]?.status || '',
            sentConversationCount: conversationStatuses.filter(status => status?.status === 'sent').length,
        };
        assertFixture(result.sendCount === 1, 'mismatch still records only one local native click');
        assertFixture(result.campaignStatus !== 'completed', 'mismatch cannot complete campaign');
        assertFixture(result.itemStatus !== 'sent', 'mismatch cannot mark campaign item sent');
        assertFixture(result.orderStatus !== 'sent', 'mismatch cannot mark order sent');
        assertFixture(result.sentConversationCount === 0, 'mismatch cannot create a sent conversation ledger');
        document.getElementById('fixture-last-result').textContent = JSON.stringify(result);
        return { before, after: result, externalNetworkAttempts: copy(networkAttempts) };
    }

    async function prepareNativeInputScenario({ exposeInteraction = true } = {}) {
        assertFixture(['shortcut', 'request-submit', 'blocked'].includes(nativeInputMode), 'native input mode');
        assertFixture(['', 'hold', 'stale', 'disabled'].includes(nativeInputBlock), 'native input block');
        renderConversation({ thread: true, incoming: true });
        history.pushState({}, '', '/fixture/native-input-thread');

        const form = document.getElementById('fixture-message-form');
        const textarea = document.getElementById('fixture-message');
        const sendButton = document.getElementById('fixture-native-send');
        if (nativeInputBlock === 'stale') {
            form.closest('[role="tabpanel"]').dataset.conversationId = 'fixture-stale-thread';
        }
        await routeListener?.(api.Router.routeFingerprint());

        const conversationIdentity = api.Router.conversationIdentity();
        if (nativeInputBlock === 'hold') {
            const timestamp = new Date().toISOString();
            await api.Verification.persistNativeSendAttempt({
                id: 'fixture-native-send-hold',
                stage: 'ambiguous',
                conversationId: 'fixture-created-thread',
                conversationIdentity,
                conversationUrl: THREAD_URL,
                text: 'Earlier fixture message with an unresolved result.',
                textDigest: 'a'.repeat(64),
                textDigestVersion: 'sha256-utf8-v1',
                dispatchedAt: timestamp,
                createdAt: timestamp,
                ambiguousAt: timestamp,
            });
        }

        const text = 'Manual fixture reply through the guarded composer.';
        textarea.value = text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
        assertFixture(document.activeElement === textarea, 'native input composer focus');
        if (nativeInputBlock === 'hold') {
            assertFixture(api.Verification.localNativeSendHoldIsCurrent(conversationIdentity), 'native send hold is current');
        } else if (nativeInputBlock === 'stale') {
            assertFixture(!api.MessageAdapter.getTextarea() && !api.MessageAdapter.getSendButton(), 'stale composer is rejected');
        } else if (nativeInputBlock === 'disabled') {
            assertFixture(nativeSendDisabled && sendButton.disabled, 'disabled native Send fixture');
            assertFixture(!api.MessageAdapter.getSendButton(), 'disabled native Send is rejected');
        } else {
            assertFixture(api.MessageAdapter.getTextarea() === textarea, 'current native composer');
            assertFixture(api.MessageAdapter.getSendButton() === sendButton, 'current native Send');
        }
        if (exposeInteraction) window.__MEMA_FIXTURE__.interactionReady = true;
        return { form, textarea, sendButton, text, conversationIdentity };
    }

    async function nativeInputResult(text) {
        const attempts = await api.Verification.nativeSendAttempts();
        const conversationStatuses = Object.values(api.Store.statuses.conversations || {});
        return {
            nativeInputMode,
            nativeInputBlock,
            shortcutCount,
            shortcutModifier,
            sendCount: window.__MEMA_FIXTURE__.sendCount,
            nativeTargetClickCount: window.__MEMA_FIXTURE__.nativeTargetClickCount,
            nativeShortcutHandlerCount: window.__MEMA_FIXTURE__.nativeShortcutHandlerCount,
            lastSentText: window.__MEMA_FIXTURE__.lastSentText,
            outgoingCount: document.querySelectorAll('[data-message-direction="outgoing"]').length,
            composerText: document.getElementById('fixture-message')?.value || '',
            shortcutEvents: copy(shortcutEvents),
            submitIntents: copy(submitIntents),
            sendClickIntents: copy(sendClickIntents),
            formSubmitEvents: copy(formSubmitEvents),
            nativeAttemptCount: Object.keys(attempts).length,
            nativeAttempts: Object.values(attempts).map(attempt => ({
                id: attempt?.id || '',
                stage: attempt?.stage || '',
                conversationIdentity: attempt?.conversationIdentity || '',
            })),
            orderStatus: api.Store.statuses.orders?.[ORDER_ID]?.status || '',
            conversationStatus: api.Store.statuses.conversations?.['fixture-created-thread']?.status || '',
            sentConversationCount: conversationStatuses.filter(status => status?.status === 'sent').length,
            expectedText: text,
        };
    }

    async function runNativeInputScenario() {
        const { text } = await prepareNativeInputScenario();
        if (nativeInputMode === 'blocked') {
            await waitUntil(
                () => submitIntents.length >= 1 && shortcutEvents.length >= shortcutCount,
                'blocked requestSubmit and trusted shortcut intents',
                5000,
            );
            await new Promise(resolve => setTimeout(resolve, 700));
            const result = await nativeInputResult(text);
            assertFixture(result.shortcutEvents.length === shortcutCount, 'all blocked shortcut intents observed');
            assertFixture(
                result.shortcutEvents.every(event => event.isTrusted
                    && (shortcutModifier === 'meta' ? event.metaKey : event.ctrlKey)),
                `blocked shortcut events are trusted ${shortcutModifier}+Enter`,
            );
            assertFixture(result.nativeShortcutHandlerCount === 0, 'blocked shortcut is stopped before Etsy target handlers');
            assertFixture(result.submitIntents.length === 1, 'only the directly requested blocked submit intent is observed');
            assertFixture(
                result.sendClickIntents.length === (nativeInputBlock === 'hold' ? 2 : 0),
                'blocked Send click intent count',
            );
            assertFixture(result.sendCount === 0 && result.formSubmitEvents.length === 0, 'blocked input cannot reach Etsy form submit');
            assertFixture(result.nativeTargetClickCount === 0, 'blocked input cannot reach the native Send target');
            assertFixture(result.outgoingCount === 0, 'blocked input creates no outgoing bubble');
            assertFixture(result.composerText === text, 'blocked input preserves the composer text');
            assertFixture(result.orderStatus !== 'sent' && result.sentConversationCount === 0, 'blocked input creates no sent ledger');
            if (nativeInputBlock === 'hold') {
                assertFixture(result.nativeAttemptCount === 1, 'existing native hold remains the only attempt');
                assertFixture(
                    result.nativeAttempts[0]?.id === 'fixture-native-send-hold'
                        && result.nativeAttempts[0]?.stage === 'ambiguous',
                    'existing native hold identity and stage are preserved',
                );
            } else assertFixture(result.nativeAttemptCount === 0, 'blocked input creates no native send attempt');
            document.getElementById('fixture-last-result').textContent = JSON.stringify(result);
            return { after: result, externalNetworkAttempts: copy(networkAttempts) };
        }

        if (nativeInputMode === 'shortcut') {
            await waitUntil(() => shortcutEvents.length >= shortcutCount, 'trusted shortcut intents', 5000);
        } else {
            await waitUntil(() => submitIntents.length >= 1, 'direct requestSubmit intent', 5000);
        }
        await waitUntil(() => window.__MEMA_FIXTURE__.sendCount === 1, 'single guarded form submit', 10000);
        await waitUntil(
            () => !api.Verification.nativeDispatchGuard
                && !api.Verification.pending
                && !api.Verification.activePending
                && !api.Verification.activePromise,
            'native send verification completion',
            10000,
        );
        await waitUntil(
            () => api.Store.statuses.conversations?.['fixture-created-thread']?.status === 'sent',
            'native conversation sent ledger',
            5000,
        );
        const result = await nativeInputResult(text);
        if (nativeInputMode === 'shortcut') {
            assertFixture(result.shortcutEvents.length === shortcutCount, 'expected shortcut count observed');
            assertFixture(
                result.shortcutEvents.every(event => event.isTrusted
                    && (shortcutModifier === 'meta' ? event.metaKey : event.ctrlKey)
                    && !event.repeat),
                `trusted ${shortcutModifier}+Enter keydown events`,
            );
            assertFixture(result.nativeShortcutHandlerCount === 0, 'shortcut is stopped before Etsy target handlers');
            assertFixture(result.submitIntents.length === 1, 'shortcut produces one guarded submit intent');
            assertFixture(result.sendClickIntents.length === shortcutCount + 1, 'shortcut click intents are duplicate-safe');
        } else {
            assertFixture(result.submitIntents.length === 2, 'requestSubmit is intercepted before exactly one guarded submit');
            assertFixture(result.sendClickIntents.length === 2, 'requestSubmit reaches exactly one guarded native click');
        }
        assertFixture(result.sendCount === 1 && result.formSubmitEvents.length === 1, 'one real Etsy form submit');
        assertFixture(result.nativeTargetClickCount === 1, 'one guarded native Send target click');
        assertFixture(result.lastSentText === text && result.composerText === '', 'exact native text sent and composer cleared');
        assertFixture(result.outgoingCount === 1, 'one native outgoing bubble');
        assertFixture(result.nativeAttemptCount === 0, 'native send hold cleared after verification');
        assertFixture(result.orderStatus === 'sent' && result.conversationStatus === 'sent', 'native send ledgers persisted');
        document.getElementById('fixture-last-result').textContent = JSON.stringify(result);
        return { after: result, externalNetworkAttempts: copy(networkAttempts) };
    }

    async function runNonSendSubmitterScenario() {
        assertFixture(nativeInputMode === 'request-submit' && !nativeInputBlock, 'non-Send submitter input mode');
        const { text } = await prepareNativeInputScenario({ exposeInteraction: false });
        const saveDraftButton = document.getElementById('fixture-save-draft');
        assertFixture(saveDraftButton?.type === 'submit', 'Save draft is a real secondary submitter');
        assertFixture(!api.MessageAdapter.hasExplicitSendLabel(saveDraftButton), 'Save draft is not a Send control');

        const toastMessages = [];
        const originalToast = api.UI.toast;
        api.UI.toast = function fixtureToast(message, type, ...rest) {
            toastMessages.push({ message: String(message || ''), type: String(type || '') });
            return originalToast.call(this, message, type, ...rest);
        };
        window.__MEMA_FIXTURE__.interactionReady = true;
        try {
            await waitUntil(
                () => submitIntents.some(event => event.submitterId === 'fixture-save-draft'),
                'Save draft submit intent',
                5000,
            );
            await new Promise(resolve => setTimeout(resolve, 700));
            const result = {
                ...await nativeInputResult(text),
                toastMessages: copy(toastMessages),
            };
            assertFixture(result.submitIntents.length === 1, 'one Save draft submit intent');
            assertFixture(result.submitIntents[0]?.submitterId === 'fixture-save-draft', 'non-Send submitter identity preserved');
            assertFixture(result.sendClickIntents.length === 0 && result.nativeTargetClickCount === 0, 'Save draft never routes to Send');
            assertFixture(result.formSubmitEvents.length === 0 && result.sendCount === 0, 'Save draft never reaches the real form submit handler');
            assertFixture(result.outgoingCount === 0 && result.composerText === text, 'Save draft creates no outgoing bubble and preserves text');
            assertFixture(result.nativeAttemptCount === 0, 'Save draft creates no native send attempt');
            assertFixture(result.orderStatus !== 'sent' && result.sentConversationCount === 0, 'Save draft creates no sent ledger');
            assertFixture(result.toastMessages.some(entry => entry.type === 'warning'
                && /farklı bir işlem düğmesi|Gönder olarak çalıştırılmadı/i.test(entry.message)), 'Save draft rejection warns the user');
            document.getElementById('fixture-last-result').textContent = JSON.stringify(result);
            return { after: result, externalNetworkAttempts: copy(networkAttempts) };
        } finally {
            api.UI.toast = originalToast;
        }
    }

    async function runMessageCenterScenario() {
        if (!api?.MessageCenterAgent) throw new Error('Message Center test API is not ready.');
        assertFixture(transitionOrderId === ORDER_ID && transitionBuyerName === BUYER_NAME, 'Message Center exact thread identity');
        renderConversation({ thread: true, incoming: true });
        history.pushState({}, '', '/fixture/message-center-thread');
        await routeListener?.(api.Router.routeFingerprint());

        const agent = api.MessageCenterAgent;
        const job = {
            id: 'fixture-message-center-job-1',
            type: 'reply',
            conversationId: 'fixture-created-thread',
            conversationUrl: THREAD_URL,
            text: 'Message Center fixture reply.',
        };
        const requests = [];
        const results = [];
        let nextJobCalls = 0;
        agent.request = async (method, path, body = null, binding = agent.config()) => {
            requests.push({ method, path, body: copy(body), storeId: binding.storeId });
            if (method === 'GET' && path.endsWith('/jobs/next')) {
                nextJobCalls += 1;
                return { job: nextJobCalls <= 2 ? copy(job) : null };
            }
            if (method === 'POST' && path.endsWith(`/jobs/${job.id}/result`)) results.push(copy(body));
            return { ok: true };
        };

        await api.Store.saveSettings({
            ...api.Store.settings,
            messageCenterEnabled: true,
            messageCenterStoreId: 'fixture-store',
            messageCenterAgentToken: 'fixture-token',
            messageCenterUrl: location.origin,
            messageCenterSyncSeconds: 120,
            messageCenterPollSeconds: 60,
        });

        try {
            const firstRun = await agent.reconfigure();
            await waitUntil(() => results.some(result => result?.status === 'sent'), 'Message Center sent result', 10000);
            const secondRun = await agent.processNextJob();
            await waitUntil(() => results.length === 2, 'Message Center duplicate result');
            const binding = agent.config();
            const ledger = await globalThis.GM.getValue(agent.sentLedgerKey(binding), {});
            const pending = await globalThis.GM.getValue(agent.pendingKey(binding), null);
            const result = {
                firstRun,
                secondRun,
                sendCount: window.__MEMA_FIXTURE__.sendCount,
                outgoingCount: document.querySelectorAll('[data-message-direction="outgoing"]').length,
                composerText: document.getElementById('fixture-message')?.value || '',
                sentLedger: ledger[job.id] || null,
                pending,
                nextJobCalls,
                results,
                requestPaths: requests.map(request => `${request.method} ${request.path}`),
            };
            assertFixture(result.firstRun === true, 'Message Center processes the local job');
            assertFixture(result.secondRun === true, 'Message Center safely resolves duplicate job');
            assertFixture(result.sendCount === 1, 'Message Center duplicate job clicks Send once');
            assertFixture(result.outgoingCount === 1, 'Message Center creates one outgoing bubble');
            assertFixture(result.composerText === '', 'Message Center composer clears after Send');
            assertFixture(Boolean(result.sentLedger), 'Message Center writes sent ledger');
            assertFixture(result.pending === null, 'Message Center clears pending job');
            assertFixture(result.results[0]?.status === 'sent', 'Message Center reports sent');
            assertFixture(result.results[1]?.duplicatePrevented === true, 'Message Center reports duplicate prevention');
            document.getElementById('fixture-last-result').textContent = JSON.stringify(result);
            return { after: result, externalNetworkAttempts: copy(networkAttempts) };
        } finally {
            agent.clearTimers();
            agent.generation += 1;
            api.Store.settings.messageCenterEnabled = false;
        }
    }

    async function runResponsiveOrdersScenario() {
        api.UI.open('orders');
        await api.UI.refreshCurrent();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const shadow = api.UI.shadow;
        const main = shadow.querySelector('.ma-main');
        const view = shadow.querySelector('.ma-view');
        const layout = shadow.querySelector('.ma-orders-layout');
        const list = shadow.querySelector('.ma-orders-list');
        const tableWrap = shadow.querySelector('.ma-orders-list > .ma-table-wrap');
        const table = tableWrap?.querySelector('.ma-table');
        const row = tableWrap?.querySelector('tbody tr');
        const sideCard = layout?.children?.[1];
        assertFixture(main && view && layout && list && tableWrap && table && row && sideCard, 'responsive order layout nodes');
        const rect = node => {
            const value = node.getBoundingClientRect();
            return {
                left: value.left,
                right: value.right,
                top: value.top,
                bottom: value.bottom,
                width: value.width,
                height: value.height,
            };
        };
        const result = {
            viewportWidth: innerWidth,
            containerType: getComputedStyle(main).containerType,
            gridColumns: getComputedStyle(layout).gridTemplateColumns,
            main: { clientWidth: main.clientWidth, scrollWidth: main.scrollWidth },
            view: rect(view),
            layout: { ...rect(layout), clientWidth: layout.clientWidth, scrollWidth: layout.scrollWidth },
            list: rect(list),
            tableWrap: { ...rect(tableWrap), clientWidth: tableWrap.clientWidth, scrollWidth: tableWrap.scrollWidth },
            table: rect(table),
            row: rect(row),
            sideCard: rect(sideCard),
        };
        document.getElementById('fixture-last-result').textContent = JSON.stringify(result);
        return { after: result, externalNetworkAttempts: copy(networkAttempts) };
    }

    async function runResponsiveMessageListScenario() {
        assertFixture(messageListMode, 'responsive message-list scenario flag');
        await api.Store.saveSettings({
            ...api.Store.settings,
            autoTurkishPreview: false,
        });
        api.UI.open('messages');
        await api.UI.refreshCurrent();

        const items = api.UI.messageListItems();
        const stressItem = items.find(item => item.conversationId === 'fixture-long-thread');
        assertFixture(stressItem && items.length === 2, 'two real conversation-list rows are scanned');
        api.UI.state.messageListTranslations.set(
            api.UI.messageListTranslationKey(stressItem, 'tr'),
            {
                text: `Translated${'UnbrokenTranslatedSegment'.repeat(70)}`,
                detectedLanguage: 'en',
                provider: 'google',
            },
        );
        api.UI.render();

        const shadow = api.UI.shadow;
        const select = shadow.querySelector('[data-message-list-language]');
        assertFixture(select, 'message-list language selector');
        for (const [value, label] of [
            ['fixture-long-a', `FixtureLanguage${'UnbrokenLanguageOption'.repeat(70)}`],
            ['fixture-long-b', `SecondFixtureLanguage${'AnotherUnbrokenLanguageOption'.repeat(60)}`],
        ]) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            select.appendChild(option);
        }
        select.value = 'fixture-long-a';

        const row = shadow.querySelector('[data-message-open-url*="fixture-long-thread"]')?.closest('.ma-message-list__item');
        const details = row?.querySelector('.ma-disclosure');
        if (details) details.open = true;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const app = shadow.querySelector('.ma-app');
        const main = shadow.querySelector('.ma-main');
        const view = shadow.querySelector('.ma-view');
        const shell = shadow.querySelector('.ma-message-list-shell');
        const controls = shadow.querySelector('.ma-message-list-controls');
        const list = shell?.querySelector(':scope > .ma-list');
        const rowBody = row?.querySelector('.ma-list-item__body');
        const openButton = row?.querySelector('[data-message-open-url]');
        const title = row?.querySelector('.ma-list-item__title');
        const preview = row?.querySelector('.ma-list-item__desc');
        const disclosureBody = row?.querySelector('.ma-disclosure__body');
        assertFixture(
            app && main && view && shell && controls && select && list && row && rowBody
                && openButton && title && preview && details && disclosureBody,
            'responsive message-list layout nodes',
        );
        const rect = node => {
            const value = node.getBoundingClientRect();
            return {
                left: value.left,
                right: value.right,
                top: value.top,
                bottom: value.bottom,
                width: value.width,
                height: value.height,
            };
        };
        const sizedRect = node => ({
            ...rect(node),
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
        });
        const optionLengths = [...select.options].map(option => option.textContent.length);
        const result = {
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
            appClasses: app.className,
            appGridColumns: getComputedStyle(app).gridTemplateColumns,
            itemCount: items.length,
            optionCount: select.options.length,
            longestLanguageOptionLength: Math.max(...optionLengths),
            app: sizedRect(app),
            main: sizedRect(main),
            view: sizedRect(view),
            shell: sizedRect(shell),
            controls: sizedRect(controls),
            select: sizedRect(select),
            list: sizedRect(list),
            row: sizedRect(row),
            rowBody: sizedRect(rowBody),
            openButton: sizedRect(openButton),
            title: sizedRect(title),
            preview: sizedRect(preview),
            disclosureBody: sizedRect(disclosureBody),
        };
        document.getElementById('fixture-last-result').textContent = JSON.stringify(result);
        return { after: result, externalNetworkAttempts: copy(networkAttempts) };
    }

    window.__MEMA_FIXTURE__ = {
        orderId: ORDER_ID,
        recipientId: RECIPIENT_ID,
        messageUrl: MESSAGE_URL,
        orderSurfaceMode,
        messageListMode,
        delayedOrderContextMode,
        orderSurfaceUrl: ORDER_SURFACE_URL,
        purchasePrefillUrl: PURCHASE_PREFILL_URL,
        simulateComposeTransition,
        sendLanguage,
        nativeSendDisabled,
        transitionOrderId,
        transitionBuyerName,
        nativeInputMode,
        nativeInputBlock,
        shortcutCount,
        shortcutModifier,
        transitionPromise: null,
        interactionReady: false,
        initialComposerText: '',
        draftInsertionCount: 0,
        preHydrationComposerText: '',
        contextHydrationScheduledAt: 0,
        contextHydratedAt: 0,
        sendCount: 0,
        nativeTargetClickCount: 0,
        nativeShortcutHandlerCount: 0,
        lastSentText: '',
        networkAttempts,
        runScenario,
        runDisabledSendScenario,
        runOrderSurfaceScenario,
        runDelayedOrderContextScenario,
        runOrderSurfaceManualSendScenario,
        runMismatchScenario,
        runNativeInputScenario,
        runNonSendSubmitterScenario,
        runMessageCenterScenario,
        runResponsiveOrdersScenario,
        runResponsiveMessageListScenario,
        get api() { return api; },
    };

    if (messageListMode) renderMessageList();
    else renderOrders();
    globalThis.addEventListener('mema:test-api-ready', async () => {
        api = globalThis.__MEMA_TEST__;
        const originalConversationIdFromUrl = api.Router.conversationIdFromUrl.bind(api.Router);
        const originalCanonicalConversationUrl = api.Router.canonicalConversationUrl.bind(api.Router);
        const originalIsComposeTarget = api.Router.isComposeTarget.bind(api.Router);
        const originalOrderComposeTargetFromUrl = api.Router.orderComposeTargetFromUrl.bind(api.Router);
        const originalAgentCanonicalConversationUrl = api.MessageCenterAgent.canonicalConversationUrl.bind(api.MessageCenterAgent);
        api.Router.page = () => route;
        api.Router.isCompletedOrdersPage = () => route === 'orders';
        api.Router.isMessageListPage = () => messageListMode && route === 'messages';
        api.Router.conversationIdFromUrl = (value = routeUrl) => {
            const candidate = String(value || '');
            if (candidate.startsWith(location.origin)) return route === 'messages'
                ? originalConversationIdFromUrl(routeUrl)
                : '';
            return originalConversationIdFromUrl(candidate);
        };
        api.Router.canonicalConversationUrl = (value, options = {}) => {
            const candidate = String(value || '');
            return originalCanonicalConversationUrl(candidate.startsWith(location.origin) ? routeUrl : candidate, options);
        };
        api.Router.isComposeTarget = (value = routeUrl) => {
            const candidate = String(value || '');
            return originalIsComposeTarget(candidate.startsWith(location.origin) ? routeUrl : candidate);
        };
        api.Router.orderComposeTargetFromUrl = (value = routeUrl) => {
            const candidate = String(value || '');
            return originalOrderComposeTargetFromUrl(candidate.startsWith(location.origin) ? routeUrl : candidate);
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
        api.MessageCenterAgent.canonicalConversationUrl = value => {
            const candidate = String(value || '');
            return originalAgentCanonicalConversationUrl(candidate.startsWith(location.origin) ? routeUrl : candidate);
        };
        await api.App.init();
        setFixtureState('hazır');
    }, { once: true });
})();
