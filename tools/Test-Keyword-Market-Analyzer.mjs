import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(repoRoot, 'scripts/etsy-keyword-market-analyzer/Makaytron-Etsy-Keyword-Market-Analyzer.user.js');
const source = fs.readFileSync(scriptPath, 'utf8');

function currentVersions() {
    const metadata = source.match(/^\/\/ @version\s+(\d+\.\d+\.\d+)\s*$/m)?.[1];
    const runtime = source.match(/^\s*const APP_VERSION\s*=\s*['"](\d+\.\d+\.\d+)['"]\s*;\s*$/m)?.[1];
    assert.ok(metadata, 'Keyword analyzer @version is missing or not strict SemVer');
    assert.ok(runtime, 'Keyword analyzer APP_VERSION is missing or not strict SemVer');
    return { metadata, runtime };
}

class FakeElement {
    constructor() {
        this.lang = 'en';
        this.hidden = false;
        this.style = {};
        this.dataset = {};
        this.children = [];
        this.textContent = '';
        this.value = '';
        this.parentElement = null;
        this.isConnected = true;
    }
    addEventListener() {}
    removeEventListener() {}
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; }
    append(...children) { children.forEach((child) => this.appendChild(child)); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    remove() { this.isConnected = false; }
    setAttribute() {}
    getAttribute() { return null; }
    hasAttribute() { return false; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    closest() { return null; }
    matches() { return false; }
    contains() { return false; }
    cloneNode() { return new FakeElement(); }
    focus() {}
    click() {}
}

function loadAnalyzer() {
    const storage = new Map();
    const noop = () => {};
    const documentElement = new FakeElement();
    documentElement.lang = 'en';
    const body = new FakeElement();
    const head = new FakeElement();
    const document = {
        documentElement,
        body,
        head,
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
        addValueChangeListener: () => 1,
        xmlHttpRequest: noop,
        openInTab: noop,
    };
    class FakeBroadcastChannel {
        constructor(name) { this.name = name; this.onmessage = null; }
        postMessage() {}
        close() {}
        addEventListener() {}
        removeEventListener() {}
    }
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
        crypto: webcrypto,
        navigator: { language: 'en-US', languages: ['en-US'] },
        document,
        location: {
            pathname: '/your/shops/example-shop/marketplace-insights',
            href: 'https://www.etsy.com/your/shops/example-shop/marketplace-insights',
            origin: 'https://www.etsy.com',
            hostname: 'www.etsy.com',
            search: '',
            reload: noop,
            assign: noop,
        },
        history: { state: {}, pushState: noop, replaceState: noop },
        MutationObserver: class { observe() {} disconnect() {} },
        BroadcastChannel: FakeBroadcastChannel,
        Element: FakeElement,
        HTMLElement: FakeElement,
        HTMLInputElement: FakeElement,
        HTMLTextAreaElement: FakeElement,
        HTMLButtonElement: FakeElement,
        Node: FakeElement,
        Event: class { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } },
        CustomEvent: class { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } },
        GM,
        GM_info: GM.info,
        GM_registerMenuCommand: noop,
        GM_unregisterMenuCommand: noop,
        GM_xmlhttpRequest: noop,
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
        getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
        __EKMA_SKIP_INIT__: true,
        __EKMA_DISABLE_AUTO_UPDATE__: true,
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    const context = vm.createContext(sandbox);
    vm.runInContext(source, context, { filename: scriptPath });
    assert.ok(sandbox.__EKMA_TEST__, 'Keyword analyzer test API was not exposed.');
    return sandbox.__EKMA_TEST__;
}

function sortedActions(text) {
    return [...new Set([...text.matchAll(/data-action=\\?"([^"\\]+)\\?"/g)].map((match) => match[1]))].sort();
}

test('MKUI production state preserves standalone userscript identity and open Shadow DOM contract', () => {
    const { metadata, runtime } = currentVersions();
    assert.equal(runtime, metadata, 'APP_VERSION must equal userscript @version');
    assert.match(source, /const MKUI_VERSION = '1\.0\.0';/);
    assert.match(source, /host\.id = 'makaytron-etsy-keyword-market-analyzer';/);
    assert.equal((source.match(/attachShadow\(\{ mode: 'open' \}\)/g) || []).length, 1);
    assert.equal((source.match(/attachShadow\(\{ mode: 'closed' \}\)/g) || []).length, 0);
    assert.match(source, /:host\{all:initial;/);
    assert.match(source, /--ekma-radius-lg:14px/);
    assert.match(source, /--ekma-focus:0 0 0 3px rgba\(23,23,23,\.14\)/);
});

test('all protected panel actions remain present', () => {
    assert.deepEqual(sortedActions(source), [
        'cancel',
        'capture',
        'check-update',
        'clear-data',
        'download-result',
        'export',
        'export-result',
        'import-request',
        'install-update',
        'search',
    ]);
    assert.match(source, /data-research-json/);
    assert.match(source, /data-language=\\?"tr\\?"/);
    assert.match(source, /data-language=\\?"en\\?"/);
});

test('inline Marketplace Insights UI stays narrowly prefixed and separate from the panel shell', () => {
    assert.match(source, /style\.id = 'ekma-inline-styles'/);
    assert.match(source, /\.ekma-inline\{/);
    assert.match(source, /\[data-ekma-inline\]/);
    assert.doesNotMatch(source, /\.mk-shell[^\n]*ekma-inline/);
});

test('compact-number and percent parsing remain stable', () => {
    const api = loadAnalyzer();
    assert.equal(api.parseCompactNumber('1.2K'), 1200);
    assert.equal(api.parseCompactNumber('2.5M'), 2_500_000);
    assert.equal(api.parseCompactNumber('12,345'), 12345);
    assert.equal(api.parsePercent('+12.5%'), 12.5);
    assert.equal(api.parsePercent('-3,4%'), -3.4);
    assert.equal(api.parsePercent('n/a'), null);
});

test('opportunity scoring remains bounded and demand-sensitive', () => {
    const api = loadAnalyzer();
    const low = api.opportunityFor(10, 1_000_000);
    const high = api.opportunityFor(50_000, 2_000);
    assert.ok(low.score >= 0 && low.score <= 100);
    assert.ok(high.score >= 0 && high.score <= 100);
    assert.ok(high.score > low.score);
    assert.ok(['low', 'medium', 'high'].includes(low.label));
    assert.ok(['low', 'medium', 'high'].includes(high.label));
});

test('research envelope validation remains fail-closed for malformed input', () => {
    const api = loadAnalyzer();
    const envelope = api.Contract.validateEnvelope({});
    const request = api.Contract.validateResearchRequest({});
    assert.equal(envelope.ok, false);
    assert.equal(envelope.code, 'INVALID_ENVELOPE_KEYS');
    assert.equal(request.ok, false);
    assert.equal(request.code, 'INVALID_REQUEST_KEYS');
});

test('canonical Marketplace Insights navigation stays on the same shop route', () => {
    const api = loadAnalyzer();
    const url = new URL(api.marketplaceUrl('family vacation shirts'));
    assert.equal(url.origin, 'https://www.etsy.com');
    assert.equal(url.pathname, '/your/shops/example-shop/marketplace-insights/search');
    assert.equal(url.searchParams.get('query'), 'family vacation shirts');
    assert.equal(url.searchParams.get('search_trigger'), 'makaytron_keyword_analyzer');
});
