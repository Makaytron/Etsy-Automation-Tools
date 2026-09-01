import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(
    repoRoot,
    'scripts/etsy-sale-campaign-batch-runner/Etsy-Sale-Campaign-Batch-Runner.user.js',
);

class FakeElement {
    constructor(textContent = '') {
        this.textContent = textContent;
        this.value = '';
        this.isConnected = true;
        this.disabled = false;
        this.parentElement = null;
        this.classList = { add() {}, remove() {}, contains() { return false; } };
    }
    addEventListener() {}
    appendChild() {}
    remove() {}
    setAttribute() {}
    getAttribute() { return null; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    closest() { return null; }
    matches() { return false; }
    click() {}
    focus() {}
    getBoundingClientRect() { return { width: 1, height: 1 }; }
    getClientRects() { return [{}]; }
}

async function loadManager() {
    const noop = () => {};
    const storage = new Map();
    let documentOverlayRoots = [];
    let currentModalShell = null;
    let currentModalContainer = null;
    const document = {
        readyState: 'loading',
        documentElement: new FakeElement(),
        body: new FakeElement(),
        head: new FakeElement(),
        scripts: [],
        createElement: () => new FakeElement(),
        getElementById: id => id === 'wt-modal-container' ? currentModalContainer : null,
        querySelector: () => null,
        querySelectorAll: selector => selector.includes('[role="dialog"]') || selector === '*'
            ? documentOverlayRoots
            : [],
        __setOverlayRoots(roots, shell = null, containerRoots = null) {
            documentOverlayRoots = Array.from(roots || []);
            currentModalShell = shell || documentOverlayRoots[0] || null;
            const ownedRoots = Array.from(containerRoots ?? documentOverlayRoots);
            if (!currentModalShell && !ownedRoots.length) {
                currentModalContainer = null;
                return;
            }
            const children = [currentModalShell, ...ownedRoots]
                .filter((node, index, all) => node && all.indexOf(node) === index);
            currentModalContainer = {
                children,
                contains(node) {
                    return ownedRoots.some(root => root === node || root.contains?.(node));
                },
            };
        },
        addEventListener: noop,
        removeEventListener: noop,
    };
    const GM = {
        info: { script: {} },
        getValue: async (key, fallback) => storage.has(key) ? storage.get(key) : fallback,
        setValue: async (key, value) => { storage.set(key, value); },
        deleteValue: async (key) => storage.delete(key),
        addValueChangeListener: noop,
        registerMenuCommand: noop,
        xmlHttpRequest: noop,
        getResourceURL: async () => '',
    };
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
        AbortController,
        crypto: webcrypto,
        location: {
            pathname: '/your/shops/me/sales-discounts/step/createSale',
            href: 'https://www.etsy.com/your/shops/me/sales-discounts/step/createSale',
            hostname: 'www.etsy.com',
            reloadCount: 0,
            reload() { this.reloadCount += 1; },
            assign(value) {
                const parsed = new URL(value, this.href);
                this.href = parsed.href;
                this.pathname = parsed.pathname;
            },
        },
        navigator: {},
        sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        document,
        Element: FakeElement,
        HTMLElement: FakeElement,
        HTMLInputElement: FakeElement,
        HTMLTextAreaElement: FakeElement,
        HTMLSelectElement: FakeElement,
        Node: FakeElement,
        Event: class {
            constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
        },
        MutationObserver: class { observe() {} disconnect() {} },
        BroadcastChannel: undefined,
        GM,
        GM_info: GM.info,
        GM_registerMenuCommand: noop,
        GM_unregisterMenuCommand: noop,
        confirm: () => true,
        alert: noop,
        addEventListener: noop,
        removeEventListener: noop,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        requestAnimationFrame: (callback) => setTimeout(callback, 0),
        cancelAnimationFrame: clearTimeout,
        getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1', pointerEvents: 'auto' }),
        history: { pushState: noop, replaceState: noop },
        CSS: { escape: String },
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    const source = fs.readFileSync(scriptPath, 'utf8');
    const initMarker = '    await initialize();';
    const initIndex = source.lastIndexOf(initMarker);
    assert.ok(initIndex > 0, 'Userscript initialization marker is missing.');
    const instrumented = `${source.slice(0, initIndex)}
    window.__MESM_TEST__ = Object.freeze({
        actionBadShell,
        acquireLease,
        assertForegroundTab,
        bindPanelAsyncAction,
        buildPlan,
        collectErrors,
        completeBatchVerification,
        detectBlockingForeignOverlay,
        detectFlowStage,
        evaluateTransientSaleLoadingWait,
        exactCoreMatch,
        ensureCurrentSubmissionForVerification,
        getCreateSaleRefs,
        getStructuredCreateSaleRefs,
        hasCreateSaleFormSignal,
        hasSaleFlowSignal,
        handleCompletionAck,
        handleVerifyCreated,
        loadState,
        samePanelJobState,
        policyEvidence,
        pauseBatchVerification,
        reconcileStage,
        resolveFreshStepActionButton,
        safeNonFinalStepRetry,
        settlePendingVerificationsAsStopped,
        skipCurrent,
        stepActionLabelMatches,
        stepActionReachedExpectedStage,
        stepActionSourceStage,
        structuredSaleSuccessRoot,
        structuredText,
        validCompletionDoneButton,
        waitForFreshStepActionButton,
        waitForStableSaleStep,
        waitForStepActionTransition,
        saleActionContextMatches,
        markSuccess,
        assertNoBlockingForeignOverlay,
        getPanelActionState() { return panelActionState ? { ...panelActionState } : null; },
        getTabId() { return TAB_ID; },
        setPanelState(panel, status) {
            panelEl = panel;
            statusEl = status;
        },
        setDocumentHidden(hidden) {
            document.hidden = !!hidden;
            document.visibilityState = hidden ? 'hidden' : 'visible';
        },
        setDocumentReadyState(value) { document.readyState = value; },
        setDocumentOverlayRoots(roots, shell = null, containerRoots = null) {
            document.__setOverlayRoots(roots, shell, containerRoots);
        },
        setLocationPath(value) {
            location.pathname = value;
            location.href = 'https://www.etsy.com' + value;
        },
        getLocationReloadCount() { return location.reloadCount; },
        setTestJob(value) { job = value; },
        async setStoredTestJob(value) {
            job = value;
            await gmSet(JOB_KEY, value);
        },
        async getStoredTestJob() { return await gmGet(JOB_KEY, null); },
    });
${source.slice(initIndex + initMarker.length)}`;

    await vm.runInContext(instrumented, vm.createContext(sandbox), { filename: scriptPath });
    assert.ok(sandbox.__MESM_TEST__);
    return sandbox.__MESM_TEST__;
}

function continueButton(contextText) {
    const context = {
        textContent: contextText,
        ownerDocument: null,
        querySelector: () => null,
        querySelectorAll: () => [],
    };
    return {
        textContent: 'Continue',
        value: '',
        type: 'button',
        shadowRoot: null,
        getAttribute: () => null,
        closest(selector) {
            if (selector.startsWith('#')) return null;
            if (selector.includes('form, main#main-content')) return context;
            return null;
        },
    };
}

function connectedStepButton(label, contextText) {
    const context = {
        textContent: contextText,
        ownerDocument: null,
        querySelector: () => null,
        querySelectorAll: () => [],
    };
    const button = new FakeElement(label);
    button.closest = selector => {
        if (selector.startsWith('#') || selector.includes('[hidden]') || selector.includes('[inert]')) return null;
        if (selector.includes('.wt-overlay__footer')) return context;
        if (selector.includes('[role="dialog"]') || selector.includes('form, main#main-content')) return context;
        return null;
    };
    return button;
}

function completionAckFixture(api, overrides = {}) {
    const activeJob = {
        schemaVersion: 5, version: '1.0.10', jobId: 'completion-ack-fixture', generation: 2,
        active: true, paused: false, pauseKind: '', phase: 'ack_complete', currentDate: '2026-08-16',
        batchStartDate: '2026-08-16', batchEndDate: '2026-08-17', saleDurationDays: 1,
        discount: 45, discountName: 'USA', countryValue: '0', listingScope: 'all',
        shop: { shopId: '90000001', shopName: 'SyntheticShop01' }, results: [], pendingVerifications: [],
        actionLedger: {}, needsPreflight: false, cooldownMinMs: 1200, cooldownMaxMs: 1200,
        ...overrides,
    };
    const plan = api.buildPlan(activeJob.currentDate, activeJob);
    const formEvidence = {
        idempotencyKey: plan.idempotencyKey, saleName: plan.saleName, discount: plan.discount,
        startDate: plan.startDateIso, endDate: plan.endDateIso, regionValue: '0', flowType: 'run_sale',
    };
    const queuedAt = new Date().toISOString();
    activeJob.submission = { status: 'submitted', idempotencyKey: plan.idempotencyKey, formEvidence };
    activeJob.formEvidence = formEvidence;
    activeJob.pendingVerifications = [{
        idempotencyKey: plan.idempotencyKey, startDate: plan.startDateIso, endDate: plan.endDateIso,
        saleName: plan.saleName, discount: plan.discount, countryValue: '0', formEvidence, queuedAt,
    }];
    activeJob.results = [{
        idempotencyKey: plan.idempotencyKey, startDate: plan.startDateIso,
        saleName: plan.saleName, status: 'PENDING_VERIFICATION',
    }];
    activeJob.completionAck = {
        idempotencyKey: plan.idempotencyKey, saleName: plan.saleName, startDate: plan.startDateIso,
        queuedAt, waitStartedAt: Date.now(), originTabId: api.getTabId(), advanceAfterClose: true,
    };
    return { activeJob, plan };
}

function structuredFormFixture({ includeName = true, footerDisabled = false, foreignContinue = false } = {}) {
    const root = new FakeElement(currentEtsyCopy);
    const fields = {
        start: new FakeElement(),
        end: new FakeElement(),
        discountType: new FakeElement(),
        discount: new FakeElement(),
        name: includeName ? new FakeElement() : null,
        region: new FakeElement(),
    };
    Object.values(fields).filter(Boolean).forEach(field => { field.parentElement = root; });
    const button = new FakeElement('Continue');
    button.disabled = footerDisabled;
    button.parentElement = root;
    button.closest = selector => {
        if (selector.startsWith('#') || selector.includes('[hidden]') || selector.includes('[inert]')) return null;
        if (selector.includes('.wt-overlay__modal') || selector.includes('form')) return root;
        if (selector.includes('.wt-overlay__footer')) return root;
        return null;
    };
    const foreignForm = new FakeElement();
    const foreignButton = new FakeElement('Continue');
    foreignButton.parentElement = foreignForm;
    foreignButton.closest = selector => {
        if (selector.startsWith('#') || selector.includes('[hidden]') || selector.includes('[inert]')) return null;
        if (selector === 'form') return foreignForm;
        if (selector.includes('.wt-overlay__footer')) return null;
        if (selector.includes('.wt-overlay__modal') || selector.includes('[role="dialog"]')) return root;
        return null;
    };
    root.contains = node => node === button || node === foreignButton || Object.values(fields).includes(node);
    root.querySelector = selector => /sales-and-coupons--start-date|what-discount|reward_type/.test(selector) ? fields.start : null;
    root.querySelectorAll = selector => {
        if (selector === '#sales-and-coupons--start-date') return [fields.start];
        if (selector === '#sales-and-coupons--end-date') return [fields.end];
        if (selector === '#what-discount') return [fields.discountType];
        if (selector === '#reward-percentage') return [fields.discount];
        if (selector === '#name-your-coupon') return fields.name ? [fields.name] : [];
        if (selector === '#what-region') return [fields.region];
        if (selector.startsWith('button, [role="button"]')) return foreignContinue ? [button, foreignButton] : [button];
        return [];
    };
    return { root, button, foreignButton };
}

const currentEtsyCopy = `
    Set up a sale
    Customize your sale
    Discount amount Percentage off Custom 45%
    Where is this offer valid? Everywhere
    Sale duration 08.08.2026 08.08.2026
    Terms and conditions (if applicable)
    Sale name 260808USA45
    Cancel Continue
`;

test('current Etsy sale form copy accepts its visible Continue action', async () => {
    const api = await loadManager();
    const button = continueButton(currentEtsyCopy);

    assert.equal(api.hasCreateSaleFormSignal(currentEtsyCopy), true);
    assert.equal(api.hasSaleFlowSignal(currentEtsyCopy), true);
    assert.equal(api.saleActionContextMatches(button, 'continue'), true);
    assert.equal(api.actionBadShell(button, 'continue'), false);
});

test('non-final Etsy navigation retries only on the exact unchanged source step', async () => {
    const api = await loadManager();
    const plan = { idempotencyKey: 'shop:2026-08-13:260813USA45' };
    const verifiedJob = {
        listingScopeVerified: {
            idempotencyKey: plan.idempotencyKey,
            scope: 'all',
        },
    };

    assert.equal(api.stepActionSourceStage('continue'), 'form');
    assert.equal(api.stepActionSourceStage('review'), 'listings');
    assert.equal(api.safeNonFinalStepRetry('continue', 'form', verifiedJob, plan), true);
    assert.equal(api.safeNonFinalStepRetry('continue', 'listings', verifiedJob, plan), false);
    assert.equal(api.safeNonFinalStepRetry('review', 'listings', verifiedJob, plan), true);
    assert.equal(api.safeNonFinalStepRetry('review', 'listings', {}, plan), false);
    assert.equal(api.safeNonFinalStepRetry('final_submit', 'review', verifiedJob, plan), false);
    assert.equal(api.stepActionReachedExpectedStage('review', 'review'), true);
    assert.equal(api.stepActionReachedExpectedStage('review', 'listings'), false);
});

test('Review transition acknowledgement observes the fresh final review step', async () => {
    const api = await loadManager();
    const stages = ['listings', 'listings', 'review'];
    let calls = 0;
    const result = await api.waitForStepActionTransition('review', {}, 180, () => ({
        stage: stages[Math.min(calls++, stages.length - 1)],
        ready: false,
        hydrating: false,
        ambiguous: false,
        errorTexts: [],
        root: null,
    }));

    assert.equal(result.type, 'advanced');
    assert.equal(result.stage, 'review');
    assert.ok(calls >= 3);
});

test('step action waits for document load and a stable freshly-rendered Etsy button', async () => {
    const api = await loadManager();
    api.setDocumentReadyState('loading');
    const first = connectedStepButton('Review and confirm', 'Which listings are included All listings Review and confirm');
    const replacement = connectedStepButton('Review and confirm', 'Which listings are included All listings Review and confirm');
    const control = new FakeElement();
    control.checked = true;
    let current = first;
    const refsFactory = () => ({
        stage: 'listings', structuredStep: true, hydrating: false, ambiguous: false,
        root: current.closest('[role="dialog"]'), reviewButton: current, reviewCandidate: current,
        listingAllControl: control, errorTexts: [], ready: false,
    });
    const started = Date.now();
    const pending = api.waitForStableSaleStep('listings', { actionName: 'review', stableMs: 250 }, 1200, refsFactory);
    setTimeout(() => { api.setDocumentReadyState('complete'); }, 90);
    setTimeout(() => { current.isConnected = false; current = replacement; }, 190);
    const result = await pending;

    assert.equal(result.type, 'ready');
    assert.equal(result.button, replacement);
    assert.ok(Date.now() - started >= 400);
});

test('legacy Etsy sale form copy remains supported', async () => {
    const api = await loadManager();
    const copy = 'Run a sale What discount Percentage off Start date End date Name your sale Cancel Continue';
    const button = continueButton(copy);

    assert.equal(api.hasCreateSaleFormSignal(copy), true);
    assert.equal(api.saleActionContextMatches(button, 'continue'), true);
});

test('Your sale is live success modal remains inside the trusted sale flow', async () => {
    const api = await loadManager();
    const copy = 'Your sale is live! Tell your friends and fans to mark their calendars, and remember to include your Share & Save link! Copy Done';
    const structuralRoot = {
        getAttribute: () => 'localized completion dialog',
        matches: () => false,
        querySelector: selector => selector === '[data-test-id="success-overlay"]' ? {} : null,
    };

    assert.equal(api.hasSaleFlowSignal(copy), true);
    assert.equal(api.structuredSaleSuccessRoot(structuralRoot), true);
});

test('transient Loading alerts do not pause the completed sale step', async () => {
    const api = await loadManager();
    const alertNode = new FakeElement('Loading');
    alertNode.matches = selector => selector.includes('[role="alert"]');
    alertNode.getAttribute = name => name === 'aria-live' ? 'assertive' : null;
    const root = new FakeElement();
    root.querySelectorAll = selector => selector === '[role="alert"]' ? [alertNode] : [];

    assert.deepEqual(Array.from(api.collectErrors(root)), []);

    alertNode.textContent = 'Something went wrong';
    assert.deepEqual(Array.from(api.collectErrors(root)), ['Something went wrong']);
});

test('an exact current-sale Loading shell waits without pausing or clicking, then clears on the same step', async () => {
    const api = await loadManager();
    const activeJob = {
        active: true, paused: false, pauseKind: '', jobId: 'transient-loading-job',
        phase: 'fill_form', currentDate: '2026-08-30',
    };
    await api.setStoredTestJob(activeJob);

    let clickCount = 0;
    const loading = new FakeElement('Loading');
    loading.matches = selector => selector.includes('[role="dialog"]');
    loading.contains = node => node === loading;
    loading.click = () => { clickCount += 1; };
    api.setDocumentOverlayRoots([loading], loading);

    const refs = { root: loading, hydrating: true };
    const gate = api.detectBlockingForeignOverlay(null, refs, [loading]);
    assert.equal(gate.kind, 'transient_sale_loading');
    assert.deepEqual({ ...api.evaluateTransientSaleLoadingWait(gate, 1_000) }, {
        state: 'waiting', elapsedMs: 0, remainingMs: 20_000,
    });

    let clickGateError = null;
    try { api.assertNoBlockingForeignOverlay(); }
    catch (error) { clickGateError = error; }
    assert.equal(clickGateError?.name, 'AutomationCancelledError');
    assert.equal(clickCount, 0);
    assert.equal((await api.getStoredTestJob()).paused, false);

    api.setDocumentOverlayRoots([]);
    assert.equal(api.detectBlockingForeignOverlay(null, { root: null, hydrating: true }, []), null);
    assert.deepEqual({ ...api.evaluateTransientSaleLoadingWait(null, 1_250) }, {
        state: 'clear', elapsedMs: 0, remainingMs: 20_000,
    });
    assert.equal(api.assertNoBlockingForeignOverlay(), true);
    const unchanged = await api.getStoredTestJob();
    assert.equal(unchanged.phase, 'fill_form');
    assert.equal(unchanged.currentDate, '2026-08-30');
    assert.equal(unchanged.paused, false);
});

test('a ready sale form accepts an exact no-control Loading sibling owned by the same Etsy modal container', async () => {
    const api = await loadManager();
    await api.setStoredTestJob({
        active: true, paused: false, jobId: 'ready-form-sibling-loader',
        phase: 'fill_form', currentDate: '2026-08-30',
    });
    const form = new FakeElement('Set up a sale Discount amount Sale duration Sale name Continue');
    form.matches = selector => selector.includes('[role="dialog"]');
    form.contains = node => node === form;
    let loadingClicks = 0;
    const loading = new FakeElement('Loading');
    loading.matches = selector => selector.includes('[role="dialog"]');
    loading.contains = node => node === loading;
    loading.click = () => { loadingClicks += 1; };
    api.setDocumentOverlayRoots([form, loading], form, [form, loading]);

    const readyRefs = {
        root: form, stage: 'form', ready: true, hydrating: false,
        structuredForm: true, errorTexts: [],
    };
    const gate = api.detectBlockingForeignOverlay(null, readyRefs, [form, loading]);
    assert.equal(gate.kind, 'transient_sale_loading');
    assert.match(gate.summary, /^loading$/i);
    assert.equal(api.evaluateTransientSaleLoadingWait(gate, 10_000).state, 'waiting');
    assert.equal(loadingClicks, 0);
    assert.equal((await api.getStoredTestJob()).paused, false);
});

test('a structured listings step accepts its exact no-control Loading sibling in the same Etsy modal container', async () => {
    const api = await loadManager();
    await api.setStoredTestJob({
        active: true, paused: false, jobId: 'listings-sibling-loader',
        phase: 'select_listings', currentDate: '2026-08-30',
    });
    const listings = new FakeElement('Which listings are included in your sale? All listings Review and confirm');
    listings.matches = selector => selector.includes('[role="dialog"]');
    listings.contains = node => node === listings;
    const loading = new FakeElement('Please wait');
    loading.matches = selector => selector.includes('[role="dialog"]');
    loading.contains = node => node === loading;
    api.setDocumentOverlayRoots([listings, loading], listings, [listings, loading]);

    const refs = {
        root: listings, stage: 'listings', ready: false, hydrating: false,
        structuredStep: true, ambiguous: false, errorTexts: [],
    };
    const gate = api.detectBlockingForeignOverlay(null, refs, [listings, loading]);
    assert.equal(gate.kind, 'transient_sale_loading');
    assert.match(gate.summary, /^please wait$/i);
    assert.equal(api.evaluateTransientSaleLoadingWait(gate, 12_000).state, 'waiting');
    assert.equal((await api.getStoredTestJob()).paused, false);
});

test('an exact Loading dialog outside the Etsy sale modal container remains foreign', async () => {
    const api = await loadManager();
    await api.setStoredTestJob({
        active: true, paused: false, jobId: 'outside-loading-dialog',
        phase: 'fill_form', currentDate: '2026-08-30',
    });
    const form = new FakeElement('Set up a sale Discount amount Sale duration Sale name Continue');
    form.matches = selector => selector.includes('[role="dialog"]');
    form.contains = node => node === form;
    const outsideLoading = new FakeElement('Loading');
    outsideLoading.matches = selector => selector.includes('[role="dialog"]');
    outsideLoading.contains = node => node === outsideLoading;
    api.setDocumentOverlayRoots([form, outsideLoading], form, [form]);

    const readyRefs = {
        root: form, stage: 'form', ready: true, hydrating: false,
        structuredForm: true, errorTexts: [],
    };
    const gate = api.detectBlockingForeignOverlay(null, readyRefs, [form, outsideLoading]);
    assert.equal(gate.kind, 'foreign');
    assert.match(gate.summary, /^loading$/i);
    let clickGateError = null;
    try { api.assertNoBlockingForeignOverlay(); }
    catch (error) { clickGateError = error; }
    assert.equal(clickGateError?.name, 'SafetyStopError');
});

test('a hard foreign modal wins over a simultaneous transient Loading shell', async () => {
    const api = await loadManager();
    await api.setStoredTestJob({
        active: true, paused: false, jobId: 'foreign-priority-job',
        phase: 'fill_form', currentDate: '2026-08-30',
    });
    const loading = new FakeElement('Loading');
    loading.matches = selector => selector.includes('[role="dialog"]');
    loading.contains = node => node === loading;
    const foreign = new FakeElement('Delete this listing permanently');
    foreign.matches = selector => selector.includes('[role="dialog"]');
    foreign.contains = node => node === foreign;
    api.setDocumentOverlayRoots([loading, foreign], loading);

    const gate = api.detectBlockingForeignOverlay(null, { root: loading, hydrating: true }, [loading, foreign]);
    assert.equal(gate.kind, 'foreign');
    assert.match(gate.summary, /delete this listing permanently/i);
});

test('transient Loading wait keeps its deadline across React root replacement and times out', async () => {
    const api = await loadManager();
    await api.setStoredTestJob({
        active: true, paused: false, jobId: 'bounded-loading-job',
        phase: 'open_form', currentDate: '2026-08-30',
    });
    const first = new FakeElement('Please wait…');
    first.matches = selector => selector.includes('[role="dialog"]');
    first.contains = node => node === first;
    api.setDocumentOverlayRoots([first], first);
    const firstGate = api.detectBlockingForeignOverlay(null, { root: first, hydrating: true }, [first]);
    assert.equal(api.evaluateTransientSaleLoadingWait(firstGate, 5_000).state, 'waiting');

    const replacement = new FakeElement('Processing');
    replacement.matches = selector => selector.includes('[role="dialog"]');
    replacement.contains = node => node === replacement;
    api.setDocumentOverlayRoots([replacement], replacement);
    const replacementGate = api.detectBlockingForeignOverlay(null, { root: replacement, hydrating: true }, [replacement]);
    const beforeDeadline = api.evaluateTransientSaleLoadingWait(replacementGate, 24_999);
    assert.equal(beforeDeadline.state, 'waiting');
    assert.equal(beforeDeadline.elapsedMs, 19_999);
    const atDeadline = api.evaluateTransientSaleLoadingWait(replacementGate, 25_000);
    assert.equal(atDeadline.state, 'timeout');
    assert.equal(atDeadline.elapsedMs, 20_000);
});

test('empty create-sale hydration returns quickly without the legacy whole-page crawler', async () => {
    const api = await loadManager();
    const started = performance.now();
    const refs = api.getCreateSaleRefs();
    const elapsed = performance.now() - started;

    assert.equal(refs.structuredForm, true);
    assert.equal(refs.hydrating, true);
    assert.equal(refs.ready, false);
    assert.equal(refs.continueButton, null);
    assert.ok(elapsed < 50, `empty hydration lookup took ${elapsed.toFixed(1)} ms`);
});

test('each success dialog is durably queued and closed before the next date starts', { timeout: 5000 }, async () => {
    const api = await loadManager();
    api.setDocumentReadyState('complete');
    api.setLocationPath('/test-only/unsupported');
    const activeJob = {
        schemaVersion: 5,
        version: '1.0.10',
        jobId: 'completion-regression-job',
        generation: 1,
        active: true,
        paused: false,
        pauseKind: '',
        phase: 'await_result',
        phaseStartedAt: Date.now(),
        currentDate: '2026-08-16',
        batchStartDate: '2026-08-16',
        batchEndDate: '2026-08-17',
        saleDurationDays: 1,
        discount: 45,
        discountName: 'USA',
        countryValue: '0',
        listingScope: 'all',
        shop: { shopId: '90000001', shopName: 'SyntheticShop01' },
        submission: null,
        results: [],
        pendingVerifications: [],
        batchVerifyState: null,
        actionLedger: {},
        needsPreflight: false,
        cooldownMinMs: 1200,
        cooldownMaxMs: 1200,
    };
    const submissionFor = plan => {
        const formEvidence = {
            idempotencyKey: plan.idempotencyKey,
            saleName: plan.saleName,
            discount: plan.discount,
            startDate: plan.startDateIso,
            endDate: plan.endDateIso,
            regionValue: '0',
            flowType: 'run_sale',
        };
        return {
            formEvidence,
            submission: {
                status: 'submitted',
                idempotencyKey: plan.idempotencyKey,
                regionValue: '0',
                listingScope: 'all',
                formEvidence,
            },
        };
    };
    const firstPlan = api.buildPlan(activeJob.currentDate, activeJob);
    Object.assign(activeJob, submissionFor(firstPlan));
    await api.setStoredTestJob(activeJob);
    const makeCompleteStep = () => {
        const root = new FakeElement('localized success content');
        const doneButton = new FakeElement('Done');
        const closedRefs = {
            root: null, stage: 'unknown', structuredStep: false,
            hydrating: false, ambiguous: false, ready: false, doneButton: null, errorTexts: [],
        };
        const completeRefs = {
            root,
            stage: 'complete',
            structuredStep: true,
            hydrating: false,
            ambiguous: false,
            ready: false,
            doneButton,
            errorTexts: [],
        };
        let currentRefs = completeRefs;
        let clicks = 0;
        let storedAtClick = null;
        doneButton.click = () => {
            clicks += 1;
            storedAtClick = api.getStoredTestJob();
            root.isConnected = false;
            doneButton.isConnected = false;
            currentRefs = closedRefs;
        };
        return {
            completeRefs,
            refsFactory: () => currentRefs,
            clicks: () => clicks,
            storedAtClick: async () => await storedAtClick,
        };
    };

    const firstStep = makeCompleteStep();
    assert.equal(await api.reconcileStage(firstPlan, firstStep.completeRefs, firstStep.refsFactory), true);
    assert.equal(firstStep.clicks(), 1);
    const firstQueuedAtClick = await firstStep.storedAtClick();
    assert.equal(firstQueuedAtClick.currentDate, '2026-08-16');
    assert.equal(firstQueuedAtClick.phase, 'ack_complete');
    assert.equal(firstQueuedAtClick.pendingVerifications.length, 1);
    assert.equal(firstQueuedAtClick.completionAck.idempotencyKey, firstPlan.idempotencyKey);
    assert.equal(firstQueuedAtClick.completionAck.originTabId, api.getTabId());
    const secondDayJob = await api.getStoredTestJob();
    assert.equal(secondDayJob.paused, false);
    assert.equal(secondDayJob.phase, 'preflight');
    assert.equal(secondDayJob.currentDate, '2026-08-17');
    assert.equal(secondDayJob.pendingVerifications.length, 1);
    assert.equal(secondDayJob.results[0].status, 'PENDING_VERIFICATION');

    const secondPlan = api.buildPlan(secondDayJob.currentDate, secondDayJob);
    Object.assign(secondDayJob, submissionFor(secondPlan), {
        phase: 'await_result',
        needsPreflight: false,
        notBefore: 0,
    });
    await api.setStoredTestJob(secondDayJob);
    const secondStep = makeCompleteStep();
    assert.equal(await api.reconcileStage(secondPlan, secondStep.completeRefs, secondStep.refsFactory), true);
    assert.equal(secondStep.clicks(), 1);
    const batchJob = await api.getStoredTestJob();
    assert.equal(batchJob.paused, false);
    assert.equal(batchJob.active, true);
    assert.equal(batchJob.phase, 'batch_verify');
    assert.equal(batchJob.currentDate, '2026-08-17');
    assert.equal(batchJob.needsPreflight, false);
    assert.equal(batchJob.pendingVerifications.length, 2);
    assert.equal(batchJob.completionAck, null);
    assert.deepEqual(Array.from(batchJob.results, row => row.status), ['PENDING_VERIFICATION', 'PENDING_VERIFICATION']);
});

test('queued form evidence remains usable after the live submission state is cleared', async () => {
    const api = await loadManager();
    const job = {
        shop: { shopId: '90000001' },
        countryValue: '0', discount: 45, discountName: 'USA', saleDurationDays: 1,
    };
    const plan = api.buildPlan('2026-08-16', job);
    const formEvidence = {
        idempotencyKey: plan.idempotencyKey, saleName: plan.saleName, discount: plan.discount,
        startDate: plan.startDateIso, endDate: plan.endDateIso, regionValue: '0', flowType: 'run_sale',
    };
    const submission = {
        status: 'submitted', idempotencyKey: plan.idempotencyKey,
        regionValue: '0', listingScope: 'all', formEvidence,
    };
    api.setTestJob({ ...job, submission: null, formEvidence: null });
    const candidate = {
        source: 'structured',
        path: 'context[0].data.initial_data.detailsAndStatsPageData.promotions[0]',
        promotionId: '1505757634534',
        raw: {
            sale_type: 'shopWide', reward_set_listing_ids: [],
            start_date_ms: Date.now() + 60_000, end_date_ms: Date.now() + 86_400_000,
            is_buyer_targeted_offer_campaign_stopped: false,
        },
        text: '',
    };

    const evidence = api.policyEvidence(candidate, plan, {
        postSubmit: true, countryValue: '0', submission, formEvidence,
    });
    assert.deepEqual({ ...evidence.fields }, { status: true, type: true, scope: true, region: true });
    assert.equal(evidence.ok, true);
});

test('an unsubmitted next day cannot enter created-sale verification', async () => {
    const api = await loadManager();
    api.setLocationPath('/test-only/unsupported');
    const activeJob = {
        schemaVersion: 5, version: '1.0.10', jobId: 'next-day-verification-regression', generation: 4,
        active: true, paused: false, pauseKind: '', phase: 'verify_created',
        currentDate: '2026-08-11', batchStartDate: '2026-08-10', batchEndDate: '2026-08-31',
        saleDurationDays: 1, discount: 45, discountName: 'USA', countryValue: '0', listingScope: 'all',
        shop: { shopId: '90000002', shopName: 'SyntheticShop02' },
        submission: null, formEvidence: null, actionLedger: {}, needsPreflight: false,
        verifyState: { startedAt: Date.now() - 30_000, attempts: 5, nextFetchAt: 0 },
        results: [], pendingVerifications: [],
    };
    const previousPlan = api.buildPlan('2026-08-10', activeJob);
    activeJob.pendingVerifications.push({
        idempotencyKey: previousPlan.idempotencyKey,
        startDate: previousPlan.startDateIso,
        saleName: previousPlan.saleName,
    });
    activeJob.results.push({
        idempotencyKey: previousPlan.idempotencyKey,
        startDate: previousPlan.startDateIso,
        saleName: previousPlan.saleName,
        status: 'PENDING_VERIFICATION',
    });
    await api.setStoredTestJob(activeJob);

    const currentPlan = api.buildPlan(activeJob.currentDate, activeJob);
    await api.handleVerifyCreated(currentPlan);
    const repaired = await api.getStoredTestJob();

    assert.equal(repaired.currentDate, '2026-08-11');
    assert.equal(repaired.phase, 'preflight');
    assert.equal(repaired.needsPreflight, true);
    assert.equal(repaired.verifyState, null);
    assert.equal(repaired.paused, false);
    assert.equal(repaired.results.length, 1);
    assert.equal(repaired.results[0].idempotencyKey, previousPlan.idempotencyKey);
    assert.equal(repaired.pendingVerifications.length, 1);
});

test('mismatched unaccounted final submission remains fail-closed', async () => {
    const api = await loadManager();
    api.setLocationPath('/test-only/unsupported');
    const activeJob = {
        schemaVersion: 5, version: '1.0.10', jobId: 'mismatched-submission-proof', generation: 1,
        active: true, paused: false, phase: 'verify_created', currentDate: '2026-08-11',
        batchStartDate: '2026-08-10', batchEndDate: '2026-08-31', saleDurationDays: 1,
        discount: 45, discountName: 'USA', countryValue: '0', listingScope: 'all',
        shop: { shopId: '90000002', shopName: 'SyntheticShop02' }, results: [], pendingVerifications: [],
        actionLedger: {}, submission: { status: 'submitted', idempotencyKey: '90000002:2026-08-10:260810USA45' },
    };
    await api.setStoredTestJob(activeJob);

    const currentPlan = api.buildPlan(activeJob.currentDate, activeJob);
    assert.equal(await api.ensureCurrentSubmissionForVerification(currentPlan), false);
    const blocked = await api.getStoredTestJob();
    assert.equal(blocked.paused, true);
    assert.equal(blocked.pauseKind, 'submission_ambiguous');
    assert.equal(blocked.submission.idempotencyKey, '90000002:2026-08-10:260810USA45');
    assert.match(blocked.errorReason, /Yanlış güne ait kayıt doğrulanmadı/);
});

test('v1.0.8 active verification queue survives the v1.0.12 patch migration', async () => {
    const api = await loadManager();
    api.setLocationPath('/your/shops/me/sales-discounts/details-stats');
    const oldJob = {
        schemaVersion: 5, version: '1.0.8', jobId: 'compatible-v108-job', generation: 7,
        active: true, paused: true, pauseKind: 'runtime_error', phase: 'verify_created',
        currentDate: '2026-08-11', batchStartDate: '2026-08-10', batchEndDate: '2026-08-31',
        saleDurationDays: 1, discount: 45, discountName: 'USA', countryValue: '0', listingScope: 'all',
        shop: { shopId: '90000002', shopName: 'SyntheticShop02' }, submission: null, formEvidence: null,
        needsPreflight: false, actionLedger: {}, verifyState: { attempts: 5 },
        results: [], pendingVerifications: [],
        errorReason: '260811USA45 kesin kod bulunamadı.',
    };
    const previous = api.buildPlan('2026-08-10', oldJob);
    oldJob.pendingVerifications.push({
        idempotencyKey: previous.idempotencyKey,
        startDate: previous.startDateIso,
        endDate: previous.endDateIso,
        saleName: previous.saleName,
        discount: previous.discount,
        countryValue: '0',
    });
    oldJob.results.push({
        idempotencyKey: previous.idempotencyKey,
        startDate: previous.startDateIso,
        saleName: previous.saleName,
        status: 'PENDING_VERIFICATION',
    });
    await api.setStoredTestJob(oldJob);

    await api.loadState();
    const migrated = await api.getStoredTestJob();
    assert.equal(migrated.version, '1.0.12');
    assert.equal(migrated.jobId, oldJob.jobId);
    assert.equal(migrated.generation, oldJob.generation + 1);
    assert.equal(migrated.currentDate, '2026-08-11');
    assert.equal(migrated.phase, 'ack_complete');
    assert.equal(migrated.paused, true);
    assert.equal(migrated.pauseKind, 'runtime_error');
    assert.equal(migrated.pendingVerifications.length, 1);
    assert.equal(migrated.pendingVerifications[0].idempotencyKey, previous.idempotencyKey);
    assert.equal(migrated.completionAck.idempotencyKey, previous.idempotencyKey);
    assert.equal(migrated.completionAck.originTabId, api.getTabId());
    assert.equal(migrated.completionAck.advanceAfterClose, false);
    assert.equal(migrated.results.length, 1);
    assert.equal(migrated.legacyAuditResults, undefined);
});

test('a paused v1.0.10 job at 18 of 20 preserves its date, phase, results, and verification queue', async () => {
    const api = await loadManager();
    const oldJob = {
        schemaVersion: 5, version: '1.0.10', jobId: 'paused-v110-18-of-20', generation: 18,
        active: true, paused: true, pauseKind: 'foreign_modal_blocking', phase: 'fill_form',
        currentDate: '2026-08-30', batchStartDate: '2026-08-12', batchEndDate: '2026-08-31',
        saleDurationDays: 1, discount: 45, discountName: 'USA', countryValue: '0', listingScope: 'all',
        shop: { shopId: '90000002', shopName: 'SyntheticShop02' }, originTabId: api.getTabId(),
        results: [], pendingVerifications: [], batchVerifyState: null, completionAck: null,
        actionLedger: {}, submission: null, formEvidence: null, needsPreflight: false,
        verifyState: null, verifyTimeoutMs: 20_000, cooldownMinMs: 2_200, cooldownMaxMs: 4_200,
        listingScopeVerified: false, notBefore: 0, expectedNavigationUntil: 0,
        expectedNavigationPath: '', promotionIndex: null,
        errorReason: 'Satış akışına ait olmayan açık Etsy penceresi algılandı: loading',
        updatedAt: '2026-08-10T00:00:00.000Z',
    };
    for (let day = 12; day <= 29; day += 1) {
        const date = `2026-08-${String(day).padStart(2, '0')}`;
        const plan = api.buildPlan(date, oldJob);
        const queuedAt = `2026-08-${String(day).padStart(2, '0')}T01:00:00.000Z`;
        oldJob.pendingVerifications.push({
            idempotencyKey: plan.idempotencyKey, startDate: plan.startDateIso, endDate: plan.endDateIso,
            saleName: plan.saleName, discount: plan.discount, countryValue: '0', submission: null,
            formEvidence: null, successMessage: 'queued', queuedAt, lastVerificationMessage: '',
        });
        oldJob.results.push({
            idempotencyKey: plan.idempotencyKey, status: 'PENDING_VERIFICATION', message: 'queued',
            saleName: plan.saleName, discount: plan.discount, startDate: plan.startDateIso,
            endDate: plan.endDateIso, shopId: oldJob.shop.shopId, shopName: oldJob.shop.shopName,
        });
    }
    const preservedResults = JSON.parse(JSON.stringify(oldJob.results));
    const preservedPending = JSON.parse(JSON.stringify(oldJob.pendingVerifications));
    await api.setStoredTestJob(oldJob);

    await api.loadState();
    const migrated = await api.getStoredTestJob();
    assert.equal(migrated.version, '1.0.12');
    assert.equal(migrated.generation, oldJob.generation + 1);
    assert.equal(migrated.currentDate, '2026-08-30');
    assert.equal(migrated.phase, 'fill_form');
    assert.equal(migrated.paused, true);
    assert.equal(migrated.pauseKind, 'foreign_modal_blocking');
    assert.equal(migrated.errorReason, oldJob.errorReason);
    assert.deepEqual(JSON.parse(JSON.stringify(migrated.results)), preservedResults);
    assert.deepEqual(JSON.parse(JSON.stringify(migrated.pendingVerifications)), preservedPending);
    assert.equal(migrated.completionAck, null);
    assert.equal(migrated.legacyAuditResults, undefined);
    assert.equal(migrated.legacyReconcileStartDate, undefined);
});

test('an active v1.0.11 transient-loading step survives the v1.0.12 patch migration', async () => {
    const api = await loadManager();
    const oldJob = {
        schemaVersion: 5, version: '1.0.11', jobId: 'active-v111-transient-loading', generation: 23,
        active: true, paused: false, pauseKind: '', phase: 'select_listings',
        currentDate: '2026-08-30', batchStartDate: '2026-08-12', batchEndDate: '2026-08-31',
        saleDurationDays: 1, discount: 45, discountName: 'USA', countryValue: '0', listingScope: 'all',
        shop: { shopId: '90000002', shopName: 'SyntheticShop02' }, originTabId: api.getTabId(),
        results: [], pendingVerifications: [], batchVerifyState: null, completionAck: null,
        actionLedger: { keep: { status: 'clicked', at: 1234 } }, submission: null,
        formEvidence: { saleName: '260830USA45' }, needsPreflight: false, verifyState: null,
        verifyTimeoutMs: 20_000, cooldownMinMs: 2_200, cooldownMaxMs: 4_200,
        listingScopeVerified: false, notBefore: 0, expectedNavigationUntil: 0,
        expectedNavigationPath: '', promotionIndex: null, errorReason: '',
        updatedAt: '2026-08-10T00:01:00.000Z',
    };
    const completedPlan = api.buildPlan('2026-08-29', oldJob);
    oldJob.pendingVerifications.push({
        idempotencyKey: completedPlan.idempotencyKey, startDate: completedPlan.startDateIso,
        endDate: completedPlan.endDateIso, saleName: completedPlan.saleName,
        discount: completedPlan.discount, countryValue: '0', submission: null,
        formEvidence: null, successMessage: 'queued', queuedAt: '2026-08-29T01:00:00.000Z',
        lastVerificationMessage: '',
    });
    oldJob.results.push({
        idempotencyKey: completedPlan.idempotencyKey, status: 'PENDING_VERIFICATION',
        message: 'queued', saleName: completedPlan.saleName, discount: completedPlan.discount,
        startDate: completedPlan.startDateIso, endDate: completedPlan.endDateIso,
        shopId: oldJob.shop.shopId, shopName: oldJob.shop.shopName,
    });
    const preservedResults = JSON.parse(JSON.stringify(oldJob.results));
    const preservedPending = JSON.parse(JSON.stringify(oldJob.pendingVerifications));
    const preservedLedger = JSON.parse(JSON.stringify(oldJob.actionLedger));
    await api.setStoredTestJob(oldJob);

    await api.loadState();
    const migrated = await api.getStoredTestJob();
    assert.equal(migrated.version, '1.0.12');
    assert.equal(migrated.generation, oldJob.generation + 1);
    assert.equal(migrated.currentDate, oldJob.currentDate);
    assert.equal(migrated.phase, 'select_listings');
    assert.equal(migrated.paused, false);
    assert.equal(migrated.pauseKind, '');
    assert.deepEqual(JSON.parse(JSON.stringify(migrated.results)), preservedResults);
    assert.deepEqual(JSON.parse(JSON.stringify(migrated.pendingVerifications)), preservedPending);
    assert.deepEqual(JSON.parse(JSON.stringify(migrated.actionLedger)), preservedLedger);
    assert.deepEqual(JSON.parse(JSON.stringify(migrated.formEvidence)), oldJob.formEvidence);
    assert.equal(migrated.completionAck, null);
    assert.equal(migrated.legacyAuditResults, undefined);
});

test('a v1.0.9 next-day loop dismisses the previous success modal before resuming preflight', async () => {
    const api = await loadManager();
    api.setDocumentReadyState('complete');
    const oldJob = {
        schemaVersion: 5, version: '1.0.9', jobId: 'stuck-v109-success-modal', generation: 5,
        active: true, paused: false, pauseKind: '', phase: 'preflight',
        currentDate: '2026-08-12', batchStartDate: '2026-08-11', batchEndDate: '2026-08-31',
        saleDurationDays: 1, discount: 45, discountName: 'USA', countryValue: '0', listingScope: 'all',
        shop: { shopId: '90000002', shopName: 'SyntheticShop02' }, submission: null, formEvidence: null,
        needsPreflight: true, actionLedger: {}, verifyState: null, results: [], pendingVerifications: [],
        cooldownMinMs: 1200, cooldownMaxMs: 1200,
    };
    const previous = api.buildPlan('2026-08-11', oldJob);
    oldJob.pendingVerifications.push({
        idempotencyKey: previous.idempotencyKey, startDate: previous.startDateIso,
        endDate: previous.endDateIso, saleName: previous.saleName, discount: previous.discount,
        countryValue: '0', queuedAt: new Date().toISOString(),
    });
    oldJob.results.push({
        idempotencyKey: previous.idempotencyKey, startDate: previous.startDateIso,
        saleName: previous.saleName, status: 'PENDING_VERIFICATION',
    });
    await api.setStoredTestJob(oldJob);
    await api.loadState();
    const recovered = await api.getStoredTestJob();
    assert.equal(recovered.phase, 'ack_complete');
    assert.equal(recovered.currentDate, '2026-08-12');
    assert.equal(recovered.completionAck.advanceAfterClose, false);

    const root = new FakeElement('localized success content');
    const doneButton = new FakeElement('Localized acknowledgement');
    let clicks = 0;
    let refs = {
        root, stage: 'complete', structuredStep: true, hydrating: false, ambiguous: false,
        ready: false, doneButton, errorTexts: [],
    };
    doneButton.click = () => {
        clicks += 1;
        root.isConnected = false;
        doneButton.isConnected = false;
        refs = { root: null, stage: 'unknown', hydrating: false, ambiguous: false, doneButton: null, errorTexts: [] };
    };

    const currentPlan = api.buildPlan(recovered.currentDate, recovered);
    assert.equal(await api.reconcileStage(currentPlan, refs, () => refs), true);
    const resumed = await api.getStoredTestJob();
    assert.equal(clicks, 1);
    assert.equal(resumed.currentDate, '2026-08-12');
    assert.equal(resumed.phase, 'preflight');
    assert.equal(resumed.needsPreflight, true);
    assert.equal(resumed.completionAck, null);
    assert.equal(resumed.pendingVerifications.length, 1);
    assert.equal(resumed.results.length, 1);
});

test('a missing Done action falls back to safe navigation without starting the next date behind the modal', async () => {
    const api = await loadManager();
    api.setDocumentReadyState('complete');
    const activeJob = {
        schemaVersion: 5, version: '1.0.10', jobId: 'completion-fallback', generation: 2,
        active: true, paused: false, phase: 'ack_complete', currentDate: '2026-08-16',
        batchStartDate: '2026-08-16', batchEndDate: '2026-08-17', saleDurationDays: 1,
        discount: 45, discountName: 'USA', countryValue: '0', listingScope: 'all',
        shop: { shopId: '90000001', shopName: 'SyntheticShop01' }, results: [], pendingVerifications: [],
        actionLedger: {}, needsPreflight: false, cooldownMinMs: 1200, cooldownMaxMs: 1200,
    };
    const plan = api.buildPlan(activeJob.currentDate, activeJob);
    const formEvidence = {
        idempotencyKey: plan.idempotencyKey, saleName: plan.saleName, discount: plan.discount,
        startDate: plan.startDateIso, endDate: plan.endDateIso, regionValue: '0', flowType: 'run_sale',
    };
    activeJob.submission = { status: 'submitted', idempotencyKey: plan.idempotencyKey, formEvidence };
    activeJob.formEvidence = formEvidence;
    activeJob.pendingVerifications.push({
        idempotencyKey: plan.idempotencyKey, startDate: plan.startDateIso, endDate: plan.endDateIso,
        saleName: plan.saleName, discount: plan.discount, countryValue: '0', formEvidence,
    });
    activeJob.completionAck = {
        idempotencyKey: plan.idempotencyKey, saleName: plan.saleName, startDate: plan.startDateIso,
        queuedAt: new Date().toISOString(), originTabId: api.getTabId(), advanceAfterClose: true,
    };
    await api.setStoredTestJob(activeJob);
    const openRefs = {
        root: new FakeElement('localized success content'), stage: 'complete', structuredStep: true,
        hydrating: false, ambiguous: false, ready: false, doneButton: null, errorTexts: [],
    };

    assert.equal(await api.handleCompletionAck(openRefs, () => openRefs, { buttonTimeout: 100, closeTimeout: 100 }), true);
    const navigating = await api.getStoredTestJob();
    assert.equal(navigating.phase, 'ack_complete');
    assert.equal(navigating.currentDate, '2026-08-16');
    assert.equal(navigating.completionAck.navigationAttempts, 1);
    assert.equal(navigating.expectedNavigationPath, '/your/shops/me/sales-discounts');

    const homeRefs = { root: null, stage: 'unknown', hydrating: false, ambiguous: false, doneButton: null, errorTexts: [] };
    assert.equal(await api.handleCompletionAck(homeRefs, () => homeRefs), true);
    const advanced = await api.getStoredTestJob();
    assert.equal(advanced.currentDate, '2026-08-17');
    assert.equal(advanced.phase, 'preflight');
    assert.equal(advanced.completionAck, null);
});

test('a React-replaced success modal must close before the active date can advance', async () => {
    const api = await loadManager();
    const { activeJob } = completionAckFixture(api, { jobId: 'completion-react-replacement' });
    await api.setStoredTestJob(activeJob);

    const oldRoot = new FakeElement('old completion root');
    const oldDone = new FakeElement('Done');
    let oldClicks = 0;
    oldDone.click = () => { oldClicks += 1; };
    const oldRefs = {
        root: oldRoot, stage: 'complete', structuredStep: true, hydrating: false,
        ambiguous: false, ready: false, doneButton: oldDone, errorTexts: [],
    };

    const replacementRoot = new FakeElement('replacement completion root');
    const replacementDone = new FakeElement('Done');
    let replacementClicks = 0;
    let storedAtReplacementClick = null;
    const closedRefs = {
        root: null, stage: 'unknown', structuredStep: false, hydrating: false,
        ambiguous: false, ready: false, doneButton: null, errorTexts: [],
    };
    let currentRefs = {
        root: replacementRoot, stage: 'complete', structuredStep: true, hydrating: false,
        ambiguous: false, ready: false, doneButton: replacementDone, errorTexts: [],
    };
    oldRoot.isConnected = false;
    oldDone.isConnected = false;
    replacementDone.click = () => {
        replacementClicks += 1;
        storedAtReplacementClick = api.getStoredTestJob();
        replacementRoot.isConnected = false;
        replacementDone.isConnected = false;
        currentRefs = closedRefs;
    };

    assert.equal(await api.handleCompletionAck(oldRefs, () => currentRefs, { buttonTimeout: 100, closeTimeout: 100 }), true);
    assert.equal(oldClicks, 0);
    assert.equal(replacementClicks, 1);
    const duringReplacementClick = await storedAtReplacementClick;
    assert.equal(duringReplacementClick.phase, 'ack_complete');
    assert.equal(duringReplacementClick.currentDate, '2026-08-16');
    const advanced = await api.getStoredTestJob();
    assert.equal(advanced.currentDate, '2026-08-17');
    assert.equal(advanced.phase, 'preflight');
    assert.equal(advanced.completionAck, null);
});

test('a completion acknowledgement cannot be closed or advanced from a different Etsy tab', async () => {
    const api = await loadManager();
    const { activeJob } = completionAckFixture(api, { jobId: 'foreign-tab-completion-ack' });
    activeJob.completionAck.originTabId = 'different-tab-id';
    await api.setStoredTestJob(activeJob);
    assert.equal(await api.acquireLease(activeJob), false);
    let clicks = 0;
    const doneButton = new FakeElement('Done');
    doneButton.click = () => { clicks += 1; };
    const foreignTabRefs = {
        root: null, stage: 'home', structuredStep: false, hydrating: false,
        ambiguous: false, ready: false, doneButton, errorTexts: [],
    };

    assert.equal(await api.handleCompletionAck(foreignTabRefs, () => foreignTabRefs, { buttonTimeout: 100 }), true);
    const retained = await api.getStoredTestJob();
    assert.equal(clicks, 0);
    assert.equal(retained.currentDate, '2026-08-16');
    assert.equal(retained.phase, 'ack_complete');
    assert.equal(retained.completionAck.originTabId, 'different-tab-id');
    assert.equal(retained.completionAck.navigationAttempts ?? 0, 0);
});

test('Done is never clicked twice when Etsy leaves the same success modal open', async () => {
    const api = await loadManager();
    const { activeJob } = completionAckFixture(api, { jobId: 'completion-done-exactly-once' });
    await api.setStoredTestJob(activeJob);
    const root = new FakeElement('localized success content');
    const doneButton = new FakeElement('Done');
    let clicks = 0;
    doneButton.click = () => { clicks += 1; };
    const openRefs = {
        root, stage: 'complete', structuredStep: true, hydrating: false,
        ambiguous: false, ready: false, doneButton, errorTexts: [],
    };

    assert.equal(await api.handleCompletionAck(openRefs, () => openRefs, { buttonTimeout: 100, closeTimeout: 100 }), true);
    let retained = await api.getStoredTestJob();
    assert.equal(clicks, 1);
    assert.equal(retained.phase, 'ack_complete');
    assert.equal(retained.currentDate, '2026-08-16');
    assert.equal(retained.completionAck.attempts, 1);
    assert.equal(retained.completionAck.navigationAttempts, 1);

    assert.equal(await api.handleCompletionAck(openRefs, () => openRefs, { buttonTimeout: 100, closeTimeout: 100 }), true);
    retained = await api.getStoredTestJob();
    assert.equal(clicks, 1);
    assert.equal(retained.currentDate, '2026-08-16');
    assert.equal(retained.completionAck.attempts, 1);
    assert.equal(retained.completionAck.navigationAttempts, 2);
});

test('concurrent acknowledgement handlers reserve only one durable Done click', async () => {
    const api = await loadManager();
    const { activeJob } = completionAckFixture(api, { jobId: 'concurrent-completion-done' });
    await api.setStoredTestJob(activeJob);
    const root = new FakeElement('localized success content');
    const doneButton = new FakeElement('Done');
    let clicks = 0;
    doneButton.click = () => { clicks += 1; };
    const openRefs = {
        root, stage: 'complete', structuredStep: true, hydrating: false,
        ambiguous: false, ready: false, doneButton, errorTexts: [],
    };

    await Promise.all([
        api.handleCompletionAck(openRefs, () => openRefs, { buttonTimeout: 100, closeTimeout: 100 }),
        api.handleCompletionAck(openRefs, () => openRefs, { buttonTimeout: 100, closeTimeout: 100 }),
    ]);
    const retained = await api.getStoredTestJob();
    assert.equal(clicks, 1);
    assert.equal(retained.phase, 'ack_complete');
    assert.equal(retained.currentDate, '2026-08-16');
    assert.equal(retained.completionAck.attempts, 1);
});

test('an unrecognized localized completion surface leaves acknowledgement mode through bounded safe navigation', async () => {
    const api = await loadManager();
    const { activeJob } = completionAckFixture(api, { jobId: 'localized-completion-fallback' });
    activeJob.completionAck.waitStartedAt = Date.now() - 5_000;
    await api.setStoredTestJob(activeJob);
    const hydratingRefs = {
        root: new FakeElement('Yerelleştirilmiş başarı penceresi'), stage: 'unknown',
        structuredStep: true, hydrating: true, ambiguous: false, ready: false,
        doneButton: null, errorTexts: [],
    };

    assert.equal(await api.handleCompletionAck(hydratingRefs, () => hydratingRefs, { buttonTimeout: 100 }), true);
    const navigating = await api.getStoredTestJob();
    assert.equal(navigating.phase, 'ack_complete');
    assert.equal(navigating.currentDate, '2026-08-16');
    assert.equal(navigating.completionAck.navigationAttempts, 1);
    assert.equal(navigating.expectedNavigationPath, '/your/shops/me/sales-discounts');
});

test('completion fallback reloads when the safe target is already the current route', async () => {
    const api = await loadManager();
    api.setLocationPath('/your/shops/me/sales-discounts');
    const { activeJob } = completionAckFixture(api, { jobId: 'same-route-completion-fallback' });
    await api.setStoredTestJob(activeJob);
    const openRefs = {
        root: new FakeElement('localized success content'), stage: 'complete', structuredStep: true,
        hydrating: false, ambiguous: false, ready: false, doneButton: null, errorTexts: [],
    };

    assert.equal(await api.handleCompletionAck(openRefs, () => openRefs, { buttonTimeout: 100 }), true);
    assert.equal(api.getLocationReloadCount(), 1);
    const retained = await api.getStoredTestJob();
    assert.equal(retained.phase, 'ack_complete');
    assert.equal(retained.currentDate, '2026-08-16');
    assert.equal(retained.completionAck.navigationAttempts, 1);
});

test('a corrupt acknowledgement without its queue pauses instead of polling forever', async () => {
    const api = await loadManager();
    const activeJob = {
        schemaVersion: 5, version: '1.0.10', jobId: 'corrupt-completion-ack', generation: 3,
        active: true, paused: false, pauseKind: '', phase: 'ack_complete', currentDate: '2026-08-16',
        batchStartDate: '2026-08-16', batchEndDate: '2026-08-17', saleDurationDays: 1,
        discount: 45, discountName: 'USA', countryValue: '0', listingScope: 'all',
        shop: { shopId: '90000001', shopName: 'SyntheticShop01' }, results: [], pendingVerifications: [],
        actionLedger: {}, needsPreflight: false,
        completionAck: { idempotencyKey: 'missing-queue-entry', saleName: '260816USA45', startDate: '2026-08-16' },
    };
    await api.setStoredTestJob(activeJob);
    const refs = { root: null, stage: 'unknown', hydrating: false, ambiguous: false, doneButton: null, errorTexts: [] };

    assert.equal(await api.handleCompletionAck(refs, () => refs, { buttonTimeout: 100 }), true);
    const paused = await api.getStoredTestJob();
    assert.equal(paused.paused, true);
    assert.equal(paused.pauseKind, 'completion_ack_failed');
    assert.equal(paused.phase, 'ack_complete');
    assert.equal(paused.generation, 4);
});

test('localized structural success actions do not depend on the Your sale is live copy', async () => {
    const api = await loadManager();
    const button = connectedStepButton('Yerelleştirilmiş onay', 'localized completion dialog');
    const refs = {
        root: button.closest('[role="dialog"]'), stage: 'complete', structuredStep: true,
        hydrating: false, ambiguous: false, doneButton: button, errorTexts: [],
    };
    assert.equal(api.validCompletionDoneButton(button, refs), true);
});

test('batch verification cannot be remapped by a stale completion modal', async () => {
    const api = await loadManager();
    const activeJob = {
        active: true, paused: false, phase: 'batch_verify', currentDate: '2026-08-17',
        batchStartDate: '2026-08-16', batchEndDate: '2026-08-17', saleDurationDays: 1,
        discount: 45, discountName: 'USA', countryValue: '0', listingScope: 'all',
        shop: { shopId: '90000001', shopName: 'SyntheticShop01' }, pendingVerifications: [], results: [],
    };
    api.setTestJob(activeJob);
    const refs = {
        root: new FakeElement('localized success content'), stage: 'complete', structuredStep: true,
        hydrating: false, ambiguous: false, doneButton: new FakeElement('Done'), errorTexts: [],
    };
    const plan = api.buildPlan(activeJob.currentDate, activeJob);
    assert.equal(await api.reconcileStage(plan, refs, () => refs), false);
    assert.equal(activeJob.phase, 'batch_verify');
});

test('batch verification completion finalizes only after its persistent queue is empty', async () => {
    const api = await loadManager();
    api.setLocationPath('/test-only/unsupported');
    const activeJob = {
        schemaVersion: 5, version: '1.0.10', jobId: 'batch-finish-job', generation: 3,
        active: true, paused: false, phase: 'batch_verify', currentDate: '2026-08-17',
        batchStartDate: '2026-08-16', batchEndDate: '2026-08-17', saleDurationDays: 1,
        discount: 45, discountName: 'USA', countryValue: '0', listingScope: 'all',
        shop: { shopId: '90000001', shopName: 'SyntheticShop01' },
        pendingVerifications: [], batchVerifyState: { attempts: 1 },
        results: [{ idempotencyKey: 'verified-1', status: 'SUCCESS', saleName: '260816USA45' }],
        startedAt: new Date().toISOString(), configSnapshot: {},
    };
    await api.setStoredTestJob(activeJob);

    assert.equal(await api.completeBatchVerification(), true);
    assert.equal(await api.getStoredTestJob(), null);
});

test('batch verifier has no path to click or resubmit a sale action', () => {
    const source = fs.readFileSync(scriptPath, 'utf8');
    const start = source.indexOf('    async function handleBatchVerify()');
    const end = source.indexOf('    async function ensureShopMatch', start);
    assert.ok(start > 0 && end > start);
    const body = source.slice(start, end);
    assert.doesNotMatch(body, /performStepAction|robustClick|handleConfirmSale|handleAwaitResult|queueSubmittedForBatchVerification/);
});

test('batch verification cannot skip one queued campaign', async () => {
    const api = await loadManager();
    api.setLocationPath('/test-only/unsupported');
    const activeJob = {
        schemaVersion: 5, version: '1.0.10', jobId: 'batch-skip-guard', generation: 2,
        active: true, paused: true, pauseKind: 'batch_verification_incomplete', phase: 'batch_verify',
        currentDate: '2026-08-17', batchStartDate: '2026-08-16', batchEndDate: '2026-08-17',
        saleDurationDays: 1, discount: 45, discountName: 'USA', countryValue: '0', listingScope: 'all',
        shop: { shopId: '90000001', shopName: 'SyntheticShop01' },
        pendingVerifications: [{ idempotencyKey: 'queued', saleName: '260816USA45', startDate: '2026-08-16' }],
        results: [{ idempotencyKey: 'queued', status: 'PENDING_VERIFICATION', saleName: '260816USA45' }],
    };
    await api.setStoredTestJob(activeJob);

    await api.skipCurrent();
    const unchanged = await api.getStoredTestJob();
    assert.equal(unchanged.phase, 'batch_verify');
    assert.equal(unchanged.paused, true);
    assert.equal(unchanged.pendingVerifications.length, 1);
    assert.equal(unchanged.results[0].status, 'PENDING_VERIFICATION');
});

test('stopping batch verification reports every unresolved campaign without resubmitting it', async () => {
    const api = await loadManager();
    const activeJob = {
        version: '1.0.10', jobId: 'batch-stop-report', active: true, phase: 'batch_verify',
        currentDate: '2026-08-17', batchStartDate: '2026-08-16', batchEndDate: '2026-08-17',
        saleDurationDays: 1, discount: 45, discountName: 'USA', countryValue: '0', listingScope: 'all',
        shop: { shopId: '90000001', shopName: 'SyntheticShop01' },
        results: [], pendingVerifications: [], batchVerifyState: { attempts: 3 },
    };
    for (const date of ['2026-08-16', '2026-08-17']) {
        const plan = api.buildPlan(date, activeJob);
        activeJob.pendingVerifications.push({
            idempotencyKey: plan.idempotencyKey,
            saleName: plan.saleName,
            startDate: plan.startDateIso,
        });
        activeJob.results.push({
            idempotencyKey: plan.idempotencyKey,
            saleName: plan.saleName,
            startDate: plan.startDateIso,
            status: 'PENDING_VERIFICATION',
        });
    }

    assert.equal(api.settlePendingVerificationsAsStopped(activeJob), 2);
    assert.equal(activeJob.pendingVerifications.length, 0);
    assert.equal(activeJob.batchVerifyState, null);
    assert.deepEqual(Array.from(activeJob.results, row => row.status), ['STOPPED', 'STOPPED']);
    assert.ok(activeJob.results.every(row => row.verified === false));
    assert.ok(activeJob.results.every(row => /otomatik olarak yeniden gönderilmedi/.test(row.message)));
});

test('a tab moved to the background cancels automation guards without mutating the job', async () => {
    const api = await loadManager();
    api.setDocumentHidden(true);
    assert.throws(() => api.assertForegroundTab(), error => error?.name === 'AutomationCancelledError');
    api.setDocumentHidden(false);
    assert.doesNotThrow(() => api.assertForegroundTab());
});

test('Continue outside a complete sale form remains fail-closed', async () => {
    const api = await loadManager();
    const incomplete = 'Set up a sale Discount amount Sale name Cancel Continue';
    const destructive = `${currentEtsyCopy} Permanently delete this listing`;

    assert.equal(api.hasCreateSaleFormSignal(incomplete), false);
    assert.equal(api.actionBadShell(continueButton(incomplete), 'continue'), true);
    assert.equal(api.saleActionContextMatches(continueButton(destructive), 'continue'), false);
});

test('partial structured form hydration stays fast and fail-closed without generic actions', async () => {
    const api = await loadManager();
    const partialFixture = structuredFormFixture({ includeName: false });
    const partial = api.getStructuredCreateSaleRefs(partialFixture.root);

    assert.equal(partial.structuredForm, true);
    assert.equal(partial.hydrating, true);
    assert.equal(partial.ready, false);
    assert.equal(partial.continueButton, null);

    const completeFixture = structuredFormFixture({ includeName: true });
    const complete = api.getStructuredCreateSaleRefs(completeFixture.root);
    assert.equal(complete.hydrating, false);
    assert.equal(complete.ready, true);
    assert.equal(complete.continueButton, completeFixture.button);
});

test('disabled Etsy footer action never falls through to a foreign nested Continue', async () => {
    const api = await loadManager();
    const fixture = structuredFormFixture({ footerDisabled: true, foreignContinue: true });
    const refs = api.getStructuredCreateSaleRefs(fixture.root);

    assert.equal(refs.continueButton, null);
    assert.equal(refs.continueCandidate, fixture.button);
    assert.equal(api.saleActionContextMatches(fixture.foreignButton, 'continue'), false);
    assert.equal(api.actionBadShell(fixture.foreignButton, 'continue'), true);
});

test('structured safety text preserves boundaries between adjacent DOM text nodes', async () => {
    const api = await loadManager();
    const nodes = [{ nodeValue: 'Continue' }, { nodeValue: 'Delete this listing permanently' }];
    let index = 0;
    const root = {
        textContent: 'ContinueDelete this listing permanently',
        ownerDocument: {
            createTreeWalker() {
                return { nextNode: () => nodes[index++] || null };
            },
        },
    };

    assert.equal(api.structuredText(root), 'continue delete this listing permanently');
});

test('Details and Stats shop-wide server record proves the current sale policy without copy scraping', async () => {
    const api = await loadManager();
    const candidate = {
        source: 'structured',
        path: 'context[0].data.initial_data.detailsAndStatsPageData.promotions[0]',
        promotionId: '1505757634534',
        raw: {
            promotion_type: 2,
            discoverability_type: 2,
            grants_buyer_targeted_offers: false,
            is_buyer_targeted_offer_campaign_stopped: false,
            start_date_ms: Date.now() + 60_000,
            end_date_ms: Date.now() + 86_400_000,
            sale_type: 'shopWide',
            reward_set_listing_ids: [],
        },
        text: '',
    };
    const plan = {
        idempotencyKey: '90000001:2026-08-11:260811USA45',
        saleName: '260811USA45', discount: 45,
        startDateIso: '2026-08-11', endDateIso: '2026-08-11',
    };
    const missingSubmissionProof = api.policyEvidence(candidate, plan, { countryValue: '0', postSubmit: true });
    assert.equal(missingSubmissionProof.fields.region, null);
    assert.equal(missingSubmissionProof.ok, false);

    const formEvidence = {
        idempotencyKey: plan.idempotencyKey, saleName: plan.saleName, discount: plan.discount,
        startDate: plan.startDateIso, endDate: plan.endDateIso,
        regionValue: '0', flowType: 'run_sale',
    };
    api.setTestJob({
        countryValue: '0', formEvidence,
        submission: {
            status: 'submitted', idempotencyKey: plan.idempotencyKey,
            regionValue: '0', listingScope: 'all', formEvidence,
        },
    });
    const evidence = api.policyEvidence(candidate, plan, { countryValue: '0', postSubmit: true });

    assert.deepEqual({ ...evidence.fields }, { status: true, type: true, scope: true, region: true });
    assert.equal(evidence.ok, true);

    const restricted = api.policyEvidence({
        ...candidate,
        raw: { ...candidate.raw, eligible_region_id: 209 },
    }, plan, { countryValue: '0', postSubmit: true });
    assert.equal(restricted.fields.region, false);
    assert.equal(restricted.ok, false);

    const selected = api.policyEvidence({
        ...candidate,
        raw: { ...candidate.raw, reward_set_listing_ids: [123] },
    }, plan, { countryValue: '0', postSubmit: true });
    assert.equal(selected.fields.scope, false);

    const stopped = api.policyEvidence({
        ...candidate,
        raw: { ...candidate.raw, is_buyer_targeted_offer_campaign_stopped: true },
    }, plan, { countryValue: '0', postSubmit: true });
    assert.equal(stopped.fields.status, false);
});

test('Details and Stats exclusive midnight end date matches the configured final sale day', async () => {
    const api = await loadManager();
    const plan = {
        saleName: '260811USA45', discount: 45,
        startDateIso: '2026-08-11', endDateIso: '2026-08-11',
    };
    const candidate = {
        source: 'structured',
        path: 'context[0].data.initial_data.detailsAndStatsPageData.promotions[0]',
        promotionId: '1505757634534',
        name: plan.saleName,
        discount: 45,
        discountKind: 'percent',
        startDates: ['2026-08-11'],
        endDates: ['2026-08-12'],
        text: '',
    };
    const core = api.exactCoreMatch(plan, candidate, [plan.saleName]);

    assert.equal(core.name, true);
    assert.equal(core.discount, true);
    assert.equal(core.start, true);
    assert.equal(core.end, true);
});

test('detached React action reference is re-resolved before the click', async () => {
    const api = await loadManager();
    const detached = { isConnected: false };
    const fresh = connectedStepButton('Continue', currentEtsyCopy);
    let resolutions = 0;

    const resolved = api.resolveFreshStepActionButton('continue', detached, {}, () => {
        resolutions += 1;
        return { continueButton: fresh };
    });

    assert.equal(resolved, fresh);
    assert.equal(resolutions, 1);

    const review = connectedStepButton('Review and confirm', 'Which listings are included All listings Review and confirm');
    const final = connectedStepButton('Confirm and create sale', 'Review your sale details Sale details Confirm and create sale');
    assert.equal(api.resolveFreshStepActionButton('review', detached, {}, () => ({
        structuredStep: true, ambiguous: false, stage: 'listings', reviewButton: review, reviewCandidate: review,
    })), review);
    assert.equal(api.resolveFreshStepActionButton('final_submit', detached, { final: true }, () => ({
        structuredStep: true, ambiguous: false, stage: 'review', finalButton: final, finalCandidate: final,
    })), final);
    assert.equal(api.resolveFreshStepActionButton('unknown', { isConnected: true }), null);
    assert.equal(api.resolveFreshStepActionButton('continue', detached, {}, () => ({ primaryButton: fresh })), null);
});

test('transient React footer replacement is polled before declaring Continue missing', async () => {
    const api = await loadManager();
    const detached = { isConnected: false };
    const staleFresh = connectedStepButton('Continue', currentEtsyCopy);
    staleFresh.isConnected = false;
    const fresh = connectedStepButton('Continue', currentEtsyCopy);
    let attempts = 0;

    const resolved = await api.waitForFreshStepActionButton('continue', detached, {}, () => {
        attempts += 1;
        if (attempts < 3) return { continueButton: null };
        if (attempts === 3) return { continueButton: staleFresh };
        return { continueButton: fresh };
    }, 500);

    assert.equal(resolved, fresh);
    assert.equal(attempts, 4);
});

test('connected step actions still require the expected exact action label', async () => {
    const api = await loadManager();
    const labeled = value => ({ textContent: value, getAttribute: () => null, value: '' });

    assert.equal(api.stepActionLabelMatches(labeled('Continue'), 'continue'), true);
    assert.equal(api.stepActionLabelMatches(labeled('Please continue'), 'continue'), true);
    assert.equal(api.stepActionLabelMatches(labeled('Continue shopping'), 'continue'), false);
    assert.equal(api.stepActionLabelMatches(labeled('Review and confirm'), 'review'), true);
    assert.equal(api.stepActionLabelMatches(labeled('Confirm and create sale'), 'final'), true);
    assert.equal(api.stepActionLabelMatches(labeled('Unrelated primary action'), 'continue'), false);
});

test('unchanged stored job does not require a destructive panel rerender', async () => {
    const api = await loadManager();
    const job = { jobId: 'job-1', active: true, paused: true, phase: 'fill_form', nested: { value: 1 } };
    assert.equal(api.samePanelJobState(job, structuredClone(job)), true);
    assert.equal(api.samePanelJobState(job, { ...job, paused: false }), false);
});

test('Retry acknowledges immediately and ignores duplicate or cross-action clicks while pending', { timeout: 2000 }, async () => {
    const api = await loadManager();
    const listeners = new Map();
    const button = {
        dataset: {},
        disabled: false,
        isConnected: true,
        innerHTML: '<span>Retry</span>',
        attributes: new Map(),
        addEventListener(type, listener) { listeners.set(type, listener); },
        setAttribute(name, value) { this.attributes.set(name, value); },
        removeAttribute(name) { this.attributes.delete(name); },
    };
    const stopListeners = new Map();
    const stopButton = {
        dataset: {}, disabled: false, isConnected: true, innerHTML: '<span>Stop</span>', attributes: new Map(),
        addEventListener(type, listener) { stopListeners.set(type, listener); },
        setAttribute(name, value) { this.attributes.set(name, value); },
        removeAttribute(name) { this.attributes.delete(name); },
    };
    const status = { textContent: '' };
    const panel = {
        querySelector: selector => selector === '#eda-retry' ? button : selector === '#eda-stop' ? stopButton : null,
        querySelectorAll: () => [button, stopButton],
    };
    let calls = 0;
    let startedResolve;
    const started = new Promise(resolve => { startedResolve = resolve; });
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    api.setPanelState(panel, status);
    api.bindPanelAsyncAction('#eda-retry', async () => { calls += 1; startedResolve(); await pending; }, 'Retry is starting', 'Continuing…');
    api.bindPanelAsyncAction('#eda-stop', async () => { calls += 1; }, 'Stop is starting', 'Stopping…', 'stop');

    const event = { preventDefault() {} };
    listeners.get('click')(event);
    listeners.get('click')(event);

    assert.equal(status.textContent, 'Retry is starting');
    assert.equal(button.disabled, true);
    assert.equal(stopButton.disabled, true);
    assert.equal(button.attributes.get('aria-busy'), 'true');
    assert.match(button.innerHTML, /eda-button-busy-spinner/);
    assert.match(button.innerHTML, /Continuing/);
    assert.equal(calls, 0, 'heavy work must wait until the busy state can paint');
    assert.equal(api.getPanelActionState()?.key, '#eda-retry');

    await started;
    assert.equal(calls, 1);

    const replacementListeners = new Map();
    const replacement = {
        dataset: {}, disabled: false, isConnected: true, innerHTML: '<span>Retry replacement</span>', attributes: new Map(),
        addEventListener(type, listener) { replacementListeners.set(type, listener); },
        setAttribute(name, value) { this.attributes.set(name, value); },
        removeAttribute(name) { this.attributes.delete(name); },
    };
    api.setPanelState({ querySelector: selector => selector === '#eda-stop' ? replacement : null }, { textContent: '' });
    api.bindPanelAsyncAction('#eda-stop', async () => { calls += 1; }, 'Stop replacement is starting', 'Stopping…', 'stop');
    replacementListeners.get('click')(event);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(calls, 1, 'a replacement panel button must share the same global action lock');

    finish();
    await pending;
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(button.disabled, false);
    assert.equal(stopButton.disabled, false);
    assert.equal(button.attributes.has('aria-busy'), false);
    assert.equal(button.innerHTML, '<span>Retry</span>');
    assert.equal(api.getPanelActionState(), null);
});

test('Start, Retry, Skip, and Stop all use the shared panel action lock', () => {
    const source = fs.readFileSync(scriptPath, 'utf8');
    for (const [selector, action] of [
        ['#eda-start', 'startBatch'],
        ['#eda-retry', 'retryCurrent'],
        ['#eda-skip', 'skipCurrent'],
        ['#eda-stop', 'stopBatch'],
    ]) {
        assert.match(source, new RegExp(`bindPanelAsyncAction\\('${selector}',\\s*${action},`));
    }
});
