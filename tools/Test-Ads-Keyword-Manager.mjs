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
            pathname: '/your/shops/me/advertising/listings/123',
            href: 'https://www.etsy.com/your/shops/me/advertising/listings/123',
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
        keywordListIsEmpty,
        getMetricValue,
        isHighClickRatioRow,
        watchKeywordRows,
        stopWatchingKeywordRows,
        decoratedSignature: () => decoratedRowsSignature,
    });
${source.slice(closureIndex)}`;
    vm.runInContext(instrumented, context, { filename: scriptPath });
    assert.ok(sandbox.__MAW_TEST__);
    return { api: sandbox.__MAW_TEST__, rows, sandbox };
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

test('an ad without targeted keywords is recognised as empty, not as a broken table', () => {
    // Etsy draws only "Targeted keywords (0)" and no accordion; the panel used to say the table could not load.
    const { api, rows, sandbox } = loadManager();
    let title = { textContent: 'Targeted keywords (0)' };
    let accordion = null;
    sandbox.document.querySelector = (selector) => (selector === '[data-test-id="accordion-title"]' ? title
        : selector === '#listing-detail-targeted-keywords-accordion' ? accordion : null);
    assert.equal(api.keywordListIsEmpty(), true);
    title = { textContent: 'Hedeflenen anahtar kelimeler ( 0 )' };
    assert.equal(api.keywordListIsEmpty(), true, 'any language, as long as the count is zero');
    title = { textContent: 'Targeted keywords (12)' };
    assert.equal(api.keywordListIsEmpty(), false, 'keywords that have not loaded yet are not "empty"');
    title = { textContent: 'Targeted keywords (0)' };
    accordion = {};
    assert.equal(api.keywordListIsEmpty(), false, 'an accordion on the page means a real table');
    accordion = null;
    rows.push(new FakeRow(new FakeCell('', [textNode('bts tshirt')])));
    assert.equal(api.keywordListIsEmpty(), false, 'rows on the page are never empty');
    rows.length = 0;
    title = null;
    assert.equal(api.keywordListIsEmpty(), false, 'no title: the old error stays');
});

test('the counts follow the keyword rows shown, also when Etsy replaces them after the first read', async () => {
    // Moving from one ad to another, Etsy kept the previous ad's table on screen for a moment; the panel
    // counted those rows and kept the counts after the new ad's rows arrived.
    const { api, rows } = loadManager();
    const row = (word) => new FakeRow(new FakeCell('', [textNode(word)]));
    rows.push(row('salem shirt'), row('witch tee'));
    api.watchKeywordRows();
    try {
        const until = async (check) => { for (let i = 0; i < 100 && !check(); i += 1) await new Promise((r) => setTimeout(r, 50)); };
        await until(() => api.decoratedSignature() === 'salem shirt\nwitch tee');
        assert.equal(api.decoratedSignature(), 'salem shirt\nwitch tee', 'the first rows are read');
        rows.length = 0;
        rows.push(row('dolly shirt'), row('dolly parton tee'), row('dolly parton'));
        await until(() => api.decoratedSignature().startsWith('dolly'));
        assert.equal(api.decoratedSignature(), 'dolly shirt\ndolly parton tee\ndolly parton', 'the replaced rows are read again');
        // Back on an ad whose keyword section Etsy left closed: the old rows go, the old counts are dropped.
        rows.length = 0;
        await until(() => api.decoratedSignature() === '');
        assert.equal(api.decoratedSignature(), '', 'rows that left the page are not counted any more');
        rows.push(row('salem shirt'));
        await until(() => api.decoratedSignature() === 'salem shirt');
        assert.equal(api.decoratedSignature(), 'salem shirt', 'the section\'s rows are read once they are shown');
    } finally {
        api.stopWatchingKeywordRows();
    }
    assert.equal(api.decoratedSignature(), '', 'leaving the ad forgets the rows');
});
