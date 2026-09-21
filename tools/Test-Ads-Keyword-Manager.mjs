import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(
    repoRoot,
    'scripts/etsy-ads-keyword-manager/Makaytron-Etsy-Ads-Keyword-Manager.user.js',
);

class FakeElement {
    constructor({ text = '', excluded = false } = {}) {
        this.textContent = text;
        this.excluded = excluded;
        this.hidden = false;
        this.children = [];
        this.style = {};
        this.dataset = {};
        this.parentElement = null;
    }

    addEventListener() {}
    appendChild() {}
    remove() {}
    setAttribute() {}
    getAttribute() { return null; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    closest() { return this.excluded ? new FakeElement() : null; }
    matches() { return false; }
    click() {}
    focus() {}
}

class FakeCell extends FakeElement {
    constructor(title, candidates = []) {
        super();
        this.title = title;
        this.candidates = candidates;
    }

    querySelector(selector) {
        if (selector === ':scope > .wt-table--responsive__title') {
            return this.title ? new FakeElement({ text: this.title }) : null;
        }
        return null;
    }

    querySelectorAll(selector) {
        return selector === 'p, span' ? this.candidates : [];
    }
}

class FakeRow extends FakeElement {
    constructor(keywordCell, metricCells = []) {
        super();
        this.keywordCell = keywordCell;
        this.metricCells = metricCells;
        this.children = [keywordCell, ...metricCells];
        this.table = { querySelectorAll: () => [] };
    }

    querySelector(selector) {
        return selector === 'th.wt-table__row__cell' ? this.keywordCell : null;
    }

    querySelectorAll(selector) {
        return selector === ':scope > td' ? this.metricCells : [];
    }

    closest(selector) {
        return selector === 'table' ? this.table : null;
    }
}

function textNode(text, excluded = false) {
    return new FakeElement({ text, excluded });
}

function loadManager() {
    const rows = [];
    const storage = new Map();
    const noop = () => {};
    const document = {
        readyState: 'loading',
        documentElement: new FakeElement(),
        body: new FakeElement(),
        head: new FakeElement(),
        createElement: () => {
            const element = new FakeElement();
            Object.defineProperty(element, 'innerHTML', {
                set(value) { this.textContent = String(value); this.value = String(value); },
            });
            return element;
        },
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => rows,
        addEventListener: noop,
        removeEventListener: noop,
    };
    const GM = {
        info: { script: {} },
        getValue: async (key, fallback) => storage.has(key) ? storage.get(key) : fallback,
        setValue: async (key, value) => { storage.set(key, value); },
        deleteValue: async (key) => storage.delete(key),
        addValueChangeListener: noop,
        xmlHttpRequest: noop,
        openInTab: noop,
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
        location: {
            pathname: '/your/shops/test/advertising',
            href: 'https://www.etsy.com/your/shops/test/advertising',
            hostname: 'www.etsy.com',
        },
        navigator: {},
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
        getComputedStyle: () => ({ display: 'table-row', visibility: 'visible' }),
        history: { pushState: noop, replaceState: noop },
        CSS: { escape: String },
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    const context = vm.createContext(sandbox);
    const source = fs.readFileSync(scriptPath, 'utf8');
    const closureMarker = '\n})();';
    const closureIndex = source.lastIndexOf(closureMarker);
    assert.ok(closureIndex > 0, 'Userscript closure marker is missing.');
    const instrumented = `${source.slice(0, closureIndex)}
    window.__MAW_TEST__ = Object.freeze({
        getReadableCellText,
        getRowWord,
        getAllRows,
        waitForKeywordRows,
        getMetricValue,
        isHighClickRatioRow,
    });
${source.slice(closureIndex)}`;
    vm.runInContext(instrumented, context, { filename: scriptPath });
    assert.ok(sandbox.__MAW_TEST__);
    return { api: sandbox.__MAW_TEST__, rows };
}

test('nested Etsy keyword wins over responsive, hidden, and control text', () => {
    const { api } = loadManager();
    const cell = new FakeCell('', [
        textNode('Targeted keyword', true),
        textNode('Hidden duplicate', true),
        textNode('Toggle keyword', true),
        textNode('  bts tshirt  '),
    ]);
    assert.equal(api.getReadableCellText(cell), 'bts tshirt');
    assert.equal(api.getRowWord(new FakeRow(cell)), 'bts tshirt');
});

test('missing readable keyword remains fail-closed', () => {
    const { api } = loadManager();
    const cell = new FakeCell('', [textNode('Targeted keyword', true), textNode('   ')]);
    assert.equal(api.getReadableCellText(cell), null);
    assert.equal(api.getRowWord(new FakeRow(cell)), null);
});

test('nested responsive metric cells parse visible values only', () => {
    const { api } = loadManager();
    const keyword = new FakeCell('', [textNode('bts tshirt')]);
    const clicks = new FakeCell('Clicks', [textNode('Clicks', true), textNode('1,234')]);
    const orders = new FakeCell('Orders', [textNode('Orders', true), textNode('2')]);
    const row = new FakeRow(keyword, [clicks, orders]);
    assert.equal(api.getMetricValue(row, ['Clicks']), 1234);
    assert.equal(api.getMetricValue(row, ['Orders']), 2);
    assert.equal(api.isHighClickRatioRow(row), true);
});

test('row readiness waits for keyword text hydration', async () => {
    const { api, rows } = loadManager();
    const cell = new FakeCell('', [textNode('Targeted keyword', true)]);
    rows.push(new FakeRow(cell));
    setTimeout(() => cell.candidates.push(textNode('bts concert shirt')), 20);
    assert.equal(await api.waitForKeywordRows(500), true);
});

/* Ads Command Center v1 presentation contract. */
await import('./Test-Ads-Command-Center-v1.mjs');
