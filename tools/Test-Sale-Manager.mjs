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
}

async function loadManager() {
    const noop = () => {};
    const storage = new Map();
    const document = {
        readyState: 'loading',
        documentElement: new FakeElement(),
        body: new FakeElement(),
        head: new FakeElement(),
        scripts: [],
        createElement: () => new FakeElement(),
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
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
        bindPanelAsyncAction,
        hasCreateSaleFormSignal,
        hasSaleFlowSignal,
        samePanelJobState,
        resolveFreshStepActionButton,
        saleActionContextMatches,
        getPanelActionState() { return panelActionState ? { ...panelActionState } : null; },
        setPanelState(panel, status) {
            panelEl = panel;
            statusEl = status;
        },
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

test('legacy Etsy sale form copy remains supported', async () => {
    const api = await loadManager();
    const copy = 'Run a sale What discount Percentage off Start date End date Name your sale Cancel Continue';
    const button = continueButton(copy);

    assert.equal(api.hasCreateSaleFormSignal(copy), true);
    assert.equal(api.saleActionContextMatches(button, 'continue'), true);
});

test('Continue outside a complete sale form remains fail-closed', async () => {
    const api = await loadManager();
    const incomplete = 'Set up a sale Discount amount Sale name Cancel Continue';
    const destructive = `${currentEtsyCopy} Permanently delete this listing`;

    assert.equal(api.hasCreateSaleFormSignal(incomplete), false);
    assert.equal(api.actionBadShell(continueButton(incomplete), 'continue'), true);
    assert.equal(api.saleActionContextMatches(continueButton(destructive), 'continue'), false);
});

test('detached React action reference is re-resolved before the click', async () => {
    const api = await loadManager();
    const detached = { isConnected: false };
    const fresh = { isConnected: true };
    let resolutions = 0;

    const resolved = api.resolveFreshStepActionButton('continue', detached, {}, () => {
        resolutions += 1;
        return { continueButton: fresh };
    });

    assert.equal(resolved, fresh);
    assert.equal(resolutions, 1);

    const review = {};
    const final = {};
    assert.equal(api.resolveFreshStepActionButton('review', detached, {}, () => ({ reviewButton: review })), review);
    assert.equal(api.resolveFreshStepActionButton('final_submit', detached, { final: true }, () => ({ finalButton: final })), final);
    assert.equal(api.resolveFreshStepActionButton('unknown', { isConnected: true }), null);
    assert.equal(api.resolveFreshStepActionButton('continue', detached, {}, () => ({ primaryButton: fresh })), null);
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
