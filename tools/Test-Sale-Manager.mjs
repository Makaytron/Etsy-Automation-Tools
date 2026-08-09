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
        saleActionContextMatches,
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

test('Retry acknowledges immediately and ignores duplicate clicks while pending', async () => {
    const api = await loadManager();
    const listeners = new Map();
    const button = {
        dataset: {},
        disabled: false,
        isConnected: true,
        attributes: new Map(),
        addEventListener(type, listener) { listeners.set(type, listener); },
        setAttribute(name, value) { this.attributes.set(name, value); },
        removeAttribute(name) { this.attributes.delete(name); },
    };
    const status = { textContent: '' };
    const panel = { querySelector: selector => selector === '#eda-retry' ? button : null };
    let calls = 0;
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    api.setPanelState(panel, status);
    api.bindPanelAsyncAction('#eda-retry', async () => { calls += 1; await pending; }, 'Retry is starting');

    const event = { preventDefault() {} };
    listeners.get('click')(event);
    listeners.get('click')(event);
    await Promise.resolve();

    assert.equal(status.textContent, 'Retry is starting');
    assert.equal(button.disabled, true);
    assert.equal(button.attributes.get('aria-busy'), 'true');
    assert.equal(calls, 1);

    finish();
    await pending;
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(button.disabled, false);
    assert.equal(button.attributes.has('aria-busy'), false);
});
