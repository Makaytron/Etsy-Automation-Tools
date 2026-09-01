import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(repoRoot, 'scripts/etsy-listing-analyzer/Makaytron-Etsy-Listing-Analyzer.user.js');
const sanitizedListingsFixturePath = path.join(repoRoot, 'scripts/etsy-listing-analyzer/fixtures/sanitized-listings-page.json');
const metricContractId = 'etsy-listings-stats-card/v1';

class FakeElement {
    addEventListener() {}
    appendChild() {}
    dispatchEvent() { return true; }
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

function loadAnalyzer() {
    const noop = () => {};
    const storage = new Map();
    const documentElement = new FakeElement();
    const document = {
        documentElement,
        body: new FakeElement(),
        head: new FakeElement(),
        createElement: () => new FakeElement(),
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
        crypto: webcrypto,
        location: {
            pathname: '/unsupported',
            search: '',
            href: 'https://www.etsy.com/unsupported',
            hostname: 'www.etsy.com',
            assign(url) { this.href = String(url); },
        },
        navigator: { locks: { request: async (_name, _options, callback) => callback() } },
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
        InputEvent: class {
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
        getComputedStyle: () => ({}),
        history: { pushState: noop, replaceState: noop },
        CSS: { escape: String },
        __MAKAYTRON_LISTING_TEST__: true,
        __MAKAYTRON_LISTING_SKIP_INIT__: true,
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    const context = vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(scriptPath, 'utf8'), context, { filename: scriptPath });
    assert.ok(sandbox.__MELI_TEST__);
    return { api: sandbox.__MELI_TEST__, context, sandbox, storage };
}

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function completeEditorSnapshot(api, value) {
    const snapshot = plain(value);
    Object.defineProperty(snapshot, api.pillReadIntegrity, {
        value: Object.freeze({ tags: true, materials: true }),
    });
    return snapshot;
}

function splitSelectorList(selector) {
    const parts = [];
    let current = '';
    let bracketDepth = 0;
    let quote = '';
    for (const character of String(selector || '')) {
        if (quote) {
            current += character;
            if (character === quote) quote = '';
            continue;
        }
        if (character === '"' || character === "'") { quote = character; current += character; continue; }
        if (character === '[') bracketDepth += 1;
        if (character === ']') bracketDepth = Math.max(0, bracketDepth - 1);
        if (character === ',' && bracketDepth === 0) {
            if (current.trim()) parts.push(current.trim());
            current = '';
            continue;
        }
        current += character;
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
}

function splitSelectorChain(selector) {
    const parts = [];
    let current = '';
    let bracketDepth = 0;
    let quote = '';
    for (const character of String(selector || '').trim()) {
        if (quote) {
            current += character;
            if (character === quote) quote = '';
            continue;
        }
        if (character === '"' || character === "'") { quote = character; current += character; continue; }
        if (character === '[') bracketDepth += 1;
        if (character === ']') bracketDepth = Math.max(0, bracketDepth - 1);
        if (/\s/.test(character) && bracketDepth === 0) {
            if (current.trim()) parts.push(current.trim());
            current = '';
            continue;
        }
        current += character;
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
}

function fixtureNodeMatchesSimple(node, selector) {
    let rest = String(selector || '').trim();
    const tag = rest.match(/^[a-z][\w-]*/i)?.[0] || '';
    if (tag) {
        if (node.tagName !== tag.toUpperCase()) return false;
        rest = rest.slice(tag.length);
    }
    while (rest) {
        const id = rest.match(/^#([\w-]+)/);
        if (id) {
            if (node.getAttribute('id') !== id[1]) return false;
            rest = rest.slice(id[0].length);
            continue;
        }
        const className = rest.match(/^\.([\w-]+)/);
        if (className) {
            const classes = String(node.getAttribute('class') || '').split(/\s+/).filter(Boolean);
            if (!classes.includes(className[1])) return false;
            rest = rest.slice(className[0].length);
            continue;
        }
        const attribute = rest.match(/^\[\s*([\w:-]+)\s*(?:(\*=|\^=|\$=|=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+))\s*(i)?\s*)?\]/i);
        if (attribute) {
            const [, name, operator, doubleQuoted, singleQuoted, bare, insensitiveFlag] = attribute;
            const actual = node.getAttribute(name);
            if (actual === null) return false;
            if (operator) {
                let left = String(actual);
                let right = String(doubleQuoted ?? singleQuoted ?? bare ?? '');
                if (insensitiveFlag) { left = left.toLocaleLowerCase(); right = right.toLocaleLowerCase(); }
                if (operator === '=' && left !== right) return false;
                if (operator === '*=' && !left.includes(right)) return false;
                if (operator === '^=' && !left.startsWith(right)) return false;
                if (operator === '$=' && !left.endsWith(right)) return false;
            }
            rest = rest.slice(attribute[0].length);
            continue;
        }
        return false;
    }
    return Boolean(tag || selector);
}

function fixtureNodeMatches(node, selector) {
    return splitSelectorList(selector).some((candidate) => {
        const chain = splitSelectorChain(candidate);
        if (!chain.length || !fixtureNodeMatchesSimple(node, chain.at(-1))) return false;
        let ancestor = node.parentElement;
        for (let index = chain.length - 2; index >= 0; index -= 1) {
            while (ancestor && !fixtureNodeMatchesSimple(ancestor, chain[index])) ancestor = ancestor.parentElement;
            if (!ancestor) return false;
            ancestor = ancestor.parentElement;
        }
        return true;
    });
}

class ListingFixtureNode {
    constructor(tagName, attributes = {}, text = '') {
        this.tagName = String(tagName).toUpperCase();
        this.attributes = new Map(Object.entries(attributes).map(([key, value]) => [key, String(value)]));
        this.children = [];
        this.parentElement = null;
        this._text = String(text || '');
        this.checked = false;
        this.disabled = false;
        this.shadowRoot = null;
    }
    append(...children) {
        children.flat().filter(Boolean).forEach((child) => {
            child.parentElement = this;
            this.children.push(child);
        });
        return this;
    }
    appendChild(child) { this.append(child); return child; }
    get textContent() { return [this._text, ...this.children.map((child) => child.textContent)].filter(Boolean).join(' '); }
    set textContent(value) { this._text = String(value || ''); this.children = []; }
    get href() { return this.getAttribute('href') || ''; }
    get src() { return this.getAttribute('src') || ''; }
    get currentSrc() { return this.src; }
    get value() { return this._value ?? this.getAttribute('value') ?? ''; }
    set value(value) { this._value = String(value); }
    get options() { return this.querySelectorAll('option'); }
    get offsetParent() { return this.parentElement; }
    get isConnected() { return Boolean(this.closest('html')); }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    hasAttribute(name) { return this.attributes.has(name); }
    matches(selector) { return fixtureNodeMatches(this, selector); }
    closest(selector) {
        let current = this;
        while (current) {
            if (fixtureNodeMatches(current, selector)) return current;
            current = current.parentElement;
        }
        return null;
    }
    querySelectorAll(selector) {
        const matches = [];
        const visit = (node) => node.children.forEach((child) => {
            if (fixtureNodeMatches(child, selector)) matches.push(child);
            visit(child);
        });
        visit(this);
        return matches;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    contains(candidate) {
        let current = candidate;
        while (current) {
            if (current === this) return true;
            current = current.parentElement;
        }
        return false;
    }
    checkVisibility() { return !this.closest('[hidden],[aria-hidden="true"],[inert]'); }
}

class ListingFixtureDocument {
    constructor(documentElement) {
        this.documentElement = documentElement;
        this.body = documentElement.querySelector('body');
        this.head = documentElement.querySelector('head');
    }
    querySelectorAll(selector) { return this.documentElement.querySelectorAll(selector); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function listingFixtureElement(tagName, attributes = {}, text = '', children = []) {
    return new ListingFixtureNode(tagName, attributes, text).append(children);
}

function buildSanitizedListingsDocument(fixture) {
    const { page, defaults, cards } = fixture;
    const html = listingFixtureElement('html');
    const head = listingFixtureElement('head');
    const body = listingFixtureElement('body');
    html.append(head, body);

    body.append(listingFixtureElement('nav', { 'data-seller-nav': 'true' }, '', [
        listingFixtureElement('a', { href: page.shopHref }, 'Synthetic fixture shop'),
    ]));

    const stateFilters = listingFixtureElement('section', { 'data-fixture': 'listing-state' });
    for (const stateValue of ['active', 'inactive']) {
        const input = listingFixtureElement('input', { name: 'item_status', value: stateValue });
        input.checked = stateValue === page.selectedState;
        stateFilters.append(listingFixtureElement('label', {}, stateValue, [input]));
    }
    body.append(stateFilters);

    const grid = listingFixtureElement('ul', { class: 'wt-block-grid' });
    cards.forEach((entry, index) => {
        const number = String(index + 1).padStart(2, '0');
        const editUrl = `https://www.etsy.com/your/shops/me/listing-editor/edit/${entry.listingId}`;
        const publicUrl = `https://www.etsy.com/listing/${entry.listingId}/synthetic-fixture-${number}`;
        const statsUrl = `https://www.etsy.com/your/shops/me/stats/listings/${entry.listingId}`;
        const metricContainers = defaults.metricSections.map((section) => {
            const container = listingFixtureElement('div', { class: 'card-meta' }, '', [listingFixtureElement('h6', {}, section.heading)]);
            for (let metricIndex = 0; metricIndex < section.rows.length; metricIndex += 2) {
                const row = listingFixtureElement('div', { class: 'card-meta-row' });
                section.rows.slice(metricIndex, metricIndex + 2).forEach((metricText) => {
                    row.append(listingFixtureElement('div', { class: 'card-meta-row-item text-gray-lighter selected-color' }, metricText));
                });
                container.append(row);
            }
            return container;
        });
        const editLink = listingFixtureElement('a', { class: 'card-body', href: editUrl }, '', [
            listingFixtureElement('div', { class: 'card-title', title: entry.title }, entry.title),
            listingFixtureElement('div', { class: 'card-meta-row-sku' }, '', [
                listingFixtureElement('span', { 'data-value': 'true' }, `${defaults.skuPrefix}${number}`),
            ]),
            listingFixtureElement('div', { class: 'card-meta-row-quantity' }, defaults.stockText),
            listingFixtureElement('div', { class: 'card-meta-row-price' }, '', [
                listingFixtureElement('span', {}, defaults.priceText),
            ]),
            listingFixtureElement('div', { class: 'card-meta-row-status' }, defaults.renewalLabel),
            listingFixtureElement('div', { class: 'card-img-wrap' }, '', [
                listingFixtureElement('img', { src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' }),
            ]),
            ...metricContainers,
        ]);
        grid.append(listingFixtureElement('li', { class: 'wt-block-grid__item' }, '', [
            editLink,
            listingFixtureElement('a', { href: publicUrl }, 'Public listing'),
            listingFixtureElement('a', { href: statsUrl }, 'Listing statistics'),
        ]));
    });
    body.append(grid);

    const select = listingFixtureElement('select', {}, '', [listingFixtureElement('option', { value: '1' }, '1')]);
    select.value = '1';
    const next = listingFixtureElement('button', { 'aria-label': 'Next' }, 'Next');
    next.disabled = true;
    body.append(listingFixtureElement('nav', { 'aria-label': page.paginationLabel }, page.paginationText, [select, next]));
    return new ListingFixtureDocument(html);
}

function snapshot(at, overrides = {}) {
    return {
        at,
        day: at.slice(0, 10),
        visits: 0,
        favorites: 0,
        sales: 0,
        revenue: 0,
        renewals: 0,
        stock: 10,
        priceMin: 20,
        priceMax: 20,
        priceLabel: '$20.00',
        currency: '$',
        listingState: 'active',
        statusLabel: 'Active',
        metricContract: {
            id: 'etsy-listings-stats-card/v1', version: 1, verified: true, source: 'etsy-listings-visible-dom',
            scopes: { visits: 'rolling-30d', favorites: 'rolling-30d', sales: 'lifetime', revenue: 'lifetime', renewals: 'lifetime' },
            headings: { rolling30d: 'LAST 30 DAYS', lifetime: 'ALL TIME' }, sourceUpdatedAt: null, sourceTimeStatus: 'unknown',
            countPrecision: { visits: 'exact', favorites: 'exact', sales: 'exact', renewals: 'exact' },
        },
        ...overrides,
    };
}

function record(id, history, meta = {}) {
    return {
        schema: 2,
        listingId: String(id),
        meta: {
            title: `Listing ${id}`,
            statusLabel: 'Active',
            listingState: 'active',
            shopKey: 'etsy-shop:shopone',
            editUrl: `https://www.etsy.com/your/shops/shop-one/listing-editor/edit/${id}`,
            ...meta,
        },
        history,
        improvements: [],
        proposal: null,
    };
}

async function installEligibleDeactivationQueue(api, runtime, storage, queue, listingId) {
    const evaluatedAt = new Date().toISOString();
    const atDaysAgo = (days) => new Date(Date.parse(evaluatedAt) - days * 86400000).toISOString();
    const candidate = record(String(listingId), [
        snapshot(atDaysAgo(60), { renewals: 0 }),
        snapshot(atDaysAgo(30), { renewals: 1 }),
        snapshot(evaluatedAt, { renewals: 2 }),
    ], { seasonality: 'non-seasonal' });
    const health = api.evaluateRecord(candidate, [candidate], undefined, evaluatedAt);
    assert.equal(health.result.lifecycle, 'DEACTIVATION_REVIEW');
    candidate.health = health;
    candidate.analysis = health.result;
    await runtime.Store.putRecord(candidate);
    await runtime.Store.saveProposal(String(listingId), { action: 'DEACTIVATE_REVIEW', fields: [], reason: 'test' });
    const savedRecord = await runtime.Store.getRecord(String(listingId));
    const item = queue.items.find((entry) => String(entry.listingId) === String(listingId));
    assert.ok(item);
    item.proposal = plain(savedRecord.proposal);
    runtime.state.queue = plain(queue);
    storage.set(runtime.KEYS.queue, plain(queue));
    return savedRecord;
}

test('metric parser reads only complete labeled rows, including compact counts and currency', () => {
    const { api } = loadAnalyzer();
    const parsed = plain(api.parseListingMetrics([
        '1.2K visits',
        '34 favorites',
        '2 sales',
        '€53,79 revenue',
        '4 renewals',
    ]));
    assert.deepEqual(parsed, { visits: 1200, favorites: 34, sales: 2, revenue: 53.79, renewals: 4, currency: '€' });
    assert.equal(api.parseListingMetrics(['100 Sales Goal Tracker', '2 sales']).sales, 2);
    assert.equal(api.parseListingMetrics(['Edit']).sales, null);
});

test('scoped metric contract accepts only one complete rolling and lifetime section', () => {
    const { api } = loadAnalyzer();
    const english = plain(api.parseScopedListingMetrics([
        { heading: 'LAST 30 DAYS', rows: ['12 visits', '3 favorites'] },
        { heading: 'ALL TIME', rows: ['4 sales', '$55 revenue', '2 renewals'] },
    ]));
    assert.equal(english.valid, true);
    assert.equal(english.contract.id, metricContractId);
    assert.deepEqual(english.contract.countPrecision, { visits: 'exact', favorites: 'exact', sales: 'exact', renewals: 'exact' });
    assert.deepEqual(english.metrics, { visits: 12, favorites: 3, sales: 4, revenue: 55, renewals: 2, currency: '$' });

    const compact = plain(api.parseScopedListingMetrics([
        { heading: 'LAST 30 DAYS', rows: ['1.2K visits', '3 favorites'] },
        { heading: 'ALL TIME', rows: ['4 sales', '$55 revenue', '2 renewals'] },
    ]));
    assert.equal(compact.valid, true);
    assert.equal(compact.metrics.visits, 1200);
    assert.equal(compact.contract.countPrecision.visits, 'approximate');

    const turkishHeadings = api.parseScopedListingMetrics([
        { heading: 'SON 30 GUN', rows: ['12 visits', '3 favorites'] },
        { heading: 'TUM ZAMANLAR', rows: ['4 sales', '$55 revenue', '2 renewals'] },
    ]);
    assert.equal(turkishHeadings.valid, true);

    assert.equal(api.parseScopedListingMetrics([
        { heading: 'SEO PERFORMANCE', rows: ['12 visits', '3 favorites'] },
        { heading: 'ALL TIME', rows: ['4 sales', '$55 revenue', '2 renewals'] },
    ]).valid, false);
    assert.equal(api.parseScopedListingMetrics([
        { heading: 'LAST 30 DAYS', rows: ['12 visits', '13 visits', '3 favorites'] },
        { heading: 'ALL TIME', rows: ['4 sales', '$55 revenue', '2 renewals'] },
    ]).valid, false);
    assert.equal(api.parseScopedListingMetrics([
        { heading: 'LAST 30 DAYS', rows: ['12 visits', '3 favorites'] },
        { heading: 'ALL TIME', rows: ['4 sales', '$55 revenue'] },
    ]).valid, false);
    assert.equal(api.parseScopedListingMetrics([
        { heading: 'LAST 30 DAYS', rows: ['12 visits', '3 favorites'] },
        { heading: 'ALL TIME', rows: ['4 sales', '$1.2K revenue', '2 renewals'] },
    ]).valid, false);
    assert.equal(api.parseScopedListingMetrics([
        { heading: 'LAST 30 DAYS', rows: ['12 visits', '3 favorites'] },
        { heading: 'LAST 30 DAYS', rows: ['12 visits', '3 favorites'] },
        { heading: 'ALL TIME', rows: ['4 sales', '$55 revenue', '2 renewals'] },
    ]).valid, false);

    assert.equal(api.statsViewEnabled('https://www.etsy.com/your/shops/me/tools/listings?stats=true'), true);
    assert.equal(api.statsViewEnabled('https://www.etsy.com/your/shops/me/tools/listings'), false);
    assert.equal(api.statsViewEnabled('https://www.etsy.com/your/shops/me/tools/listings?stats=false'), false);
    assert.equal(api.statsViewEnabled('https://www.etsy.com/your/shops/me/tools/listings?stats=true&stats=true'), false);
    assert.equal(api.normalizeMetricContract({ ...english.contract, version: 2 }), null);
    assert.equal(api.normalizeMetricContract({ ...english.contract, source: 'backup-claim' }), null);
    assert.equal(api.normalizeMetricContract({ ...english.contract, headings: { rolling30d: 'SEO PERFORMANCE', lifetime: 'ALL TIME' } }), null);
    assert.equal(api.normalizeMetricContract({ ...english.contract, countPrecision: {} }), null);
});

test('route recognition requires an exact supported Etsy pathname', () => {
    const { api } = loadAnalyzer();
    assert.equal(api.routeKind('/your/shops/me/tools/listings'), 'listings');
    assert.equal(api.routeKind('/your/shops/me/listing-editor/edit/1234567890'), 'editor');
    assert.equal(api.routeKind('/your/shops/me/listing-editor/edit/1234567890/'), 'editor');
    assert.equal(api.currentListingId('/your/shops/me/listing-editor/edit/1234567890/'), '1234567890');
    assert.equal(api.routeKind('/your/shops/me/listing-editor/edit/1234567890/delete'), 'unsupported');
    assert.equal(api.routeKind('/your/shops/me/listing-editor/edit/1234567890anything'), 'unsupported');
    assert.equal(api.currentListingId('/your/shops/me/listing-editor/edit/1234567890/delete'), '');
    assert.equal(api.currentListingId('/your/shops/me/listing-editor/edit/1234567890anything'), '');
});

test('card adapter scopes metric rows, rejects menu-only edit links, and rejects partial non-final pages', () => {
    const { api, sandbox } = loadAnalyzer();
    const fadingElement = { closest: () => null };
    sandbox.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '0' });
    assert.equal(api.elementIsUsable(fadingElement), false);
    sandbox.getComputedStyle = () => ({});
    const metricContainer = {
        querySelector: (selector) => selector === 'h6' ? {} : null,
        querySelectorAll: () => [{ textContent: '2 sales' }, { textContent: '$10 revenue' }],
    };
    const link = { querySelectorAll: () => [metricContainer], textContent: '100 Sales Goal Tracker' };
    assert.deepEqual(Array.from(api.ListingPageAdapter.metricRows(link)), ['2 sales', '$10 revenue']);

    const menuLink = {
        href: 'https://www.etsy.com/your/shops/me/listing-editor/edit/123',
        matches: () => false,
        querySelector: () => null,
        getAttribute: () => null,
        closest: (selector) => selector.includes('[role="menu"]') ? {} : null,
    };
    const card = {
        querySelectorAll: () => [menuLink],
        closest: () => null,
    };
    sandbox.document.querySelectorAll = (selector) => selector === 'li.wt-block-grid__item' ? [card] : [];
    assert.equal(api.ListingPageAdapter.cardLinks().length, 0);

    const adapter = api.ListingPageAdapter;
    const originals = { pageInfo: adapter.pageInfo, paginationNav: adapter.paginationNav, cardRoots: adapter.cardRoots, cardLinks: adapter.cardLinks, scan: adapter.scan };
    const listing = (id) => ({ listingId: String(id), title: `L${id}`, sku: '', listingState: 'active', statusLabel: 'Active', renewalLabel: 'Auto-renews', stock: 1, price: { min: 10, max: 10 }, visits: 1, favorites: 0, sales: 0, revenue: 0, renewals: 0, metricContract: snapshot('2026-01-01T00:00:00.000Z').metricContract });
    const linkFor = (id) => ({ href: `https://www.etsy.com/your/shops/me/listing-editor/edit/${id}` });
    adapter.pageInfo = () => ({ current: 2, total: 17, valid: true, hasPagination: true, ambiguous: false });
    adapter.cardRoots = () => Array.from({ length: 39 }, () => ({}));
    adapter.cardLinks = () => Array.from({ length: 39 }, (_, index) => linkFor(index + 1));
    adapter.scan = () => Array.from({ length: 39 }, (_, index) => listing(index + 1));
    assert.equal(adapter.snapshotState({ requirePagination: true }).valid, false);
    adapter.cardRoots = () => Array.from({ length: 40 }, () => ({}));
    adapter.cardLinks = () => Array.from({ length: 40 }, (_, index) => linkFor(index + 1));
    adapter.scan = () => Array.from({ length: 40 }, (_, index) => listing(index + 1));
    assert.equal(adapter.snapshotState({ requirePagination: true }).valid, true);
    Object.assign(adapter, originals);
    adapter.paginationNav = () => null;
    adapter.cardLinks = () => Array.from({ length: 40 }, () => ({}));
    assert.deepEqual(plain(adapter.pageInfo()), { current: 1, total: 1, valid: false, hasPagination: false, ambiguous: true, explicitPagedLocation: false });
    adapter.cardLinks = () => Array.from({ length: 41 }, () => ({}));
    assert.equal(adapter.pageInfo().ambiguous, true);
    assert.equal(adapter.pageInfo().valid, false);
    sandbox.location.href = 'https://www.etsy.com/your/shops/me/tools/listings?page=2';
    adapter.cardLinks = () => Array.from({ length: 10 }, () => ({}));
    assert.equal(adapter.pageInfo().explicitPagedLocation, true);
    assert.equal(adapter.pageInfo().valid, false);
    Object.assign(adapter, originals);
    assert.equal(adapter.contentSignature([listing(2), listing(1)]), adapter.contentSignature([listing(1), listing(2)]));
    const exactListing = listing(1);
    const approximateListing = plain(exactListing);
    approximateListing.metricContract.countPrecision.visits = 'approximate';
    assert.notEqual(adapter.readSignature([exactListing]), adapter.readSignature([approximateListing]));
    const otherCurrencyListing = plain(exactListing);
    exactListing.currency = '$';
    otherCurrencyListing.currency = 'EUR';
    assert.notEqual(adapter.readSignature([exactListing]), adapter.readSignature([otherCurrencyListing]));
});

test('sanitized current Etsy fixture parses 40 canonical inactive listings and preserves every explicit zero metric', () => {
    const { api, sandbox } = loadAnalyzer();
    const fixture = JSON.parse(fs.readFileSync(sanitizedListingsFixturePath, 'utf8'));
    assert.equal(fixture.schema, 'makaytron-etsy-listing-dom-fixture/v2');
    assert.equal(fixture.cards.length, 40);
    assert.ok(fixture.cards.every((card) => /^Synthetic Fixture Listing \d{2}$/.test(card.title)));
    assert.deepEqual(fixture.defaults.metricSections, [
        { heading: 'LAST 30 DAYS', rows: ['0 visits', '0 favorite'] },
        { heading: 'ALL TIME', rows: ['0 sales', '$0 revenue', '0 renewal'] },
    ]);

    const originalDocument = sandbox.document;
    const fixtureDocument = buildSanitizedListingsDocument(fixture);
    sandbox.document = fixtureDocument;
    const fixtureUrl = new URL(fixture.page.href);
    sandbox.location.pathname = fixtureUrl.pathname;
    sandbox.location.search = fixtureUrl.search;
    sandbox.location.href = fixtureUrl.href;
    try {
        assert.equal(api.currentShopKey(), 'etsy-shop:syntheticfixture0001');
        assert.equal(api.pageListingState(), 'inactive');
        assert.equal(api.ListingPageAdapter.cardRoots().length, 40);
        assert.equal(api.ListingPageAdapter.cardLinks().length, 40);

        const listings = api.ListingPageAdapter.scan();
        assert.equal(listings.length, 40);
        assert.equal(new Set(listings.map((listing) => listing.listingId)).size, 40);
        listings.forEach((listing, index) => {
            const fixtureCard = fixture.cards[index];
            const number = String(index + 1).padStart(2, '0');
            assert.equal(listing.listingId, fixtureCard.listingId);
            assert.equal(listing.title, fixtureCard.title);
            assert.equal(listing.editUrl, `https://www.etsy.com/your/shops/me/listing-editor/edit/${fixtureCard.listingId}`);
            assert.equal(listing.publicUrl, `https://www.etsy.com/listing/${fixtureCard.listingId}/synthetic-fixture-${number}`);
            assert.equal(listing.sku, `FIXTURE-SKU-${number}`);
            assert.equal(listing.listingState, 'inactive');
            assert.equal(listing.statusLabel, 'Inactive');
            assert.equal(listing.stock, 10);
            assert.deepEqual(plain(listing.price), { min: 20, max: 20, label: '$20.00' });
            assert.equal(listing.currency, '$');
            for (const metric of ['visits', 'favorites', 'sales', 'revenue', 'renewals']) {
                assert.equal(listing[metric], 0, `${fixtureCard.title} should preserve ${metric}=0`);
            }
        });

        const snapshot = api.ListingPageAdapter.snapshotState({ requirePagination: true, expectedCount: 40 });
        assert.equal(snapshot.valid, true);
        assert.deepEqual(plain(snapshot.pageInfo), { current: 1, total: 1, valid: true, hasPagination: true, ambiguous: false });
        assert.equal(snapshot.links.length, 40);
        assert.equal(snapshot.listings.length, 40);
    } finally {
        sandbox.document = originalDocument;
    }
});

test('stable read waits through a delayed pagination render instead of accepting transient 1/1 state', async () => {
    const { api } = loadAnalyzer();
    const adapter = api.ListingPageAdapter;
    const original = adapter.snapshotState;
    let calls = 0;
    const noPagination = { valid: true, pageInfo: { current: 1, total: 1, valid: true, hasPagination: false }, links: [{}], listings: [{ listingId: '1' }], signature: 'single' };
    const paginated = { valid: true, pageInfo: { current: 1, total: 17, valid: true, hasPagination: true }, links: [{}], listings: [{ listingId: '1' }], signature: 'paginated' };
    adapter.snapshotState = () => (++calls <= 3 ? noPagination : paginated);
    const result = await adapter.readStable();
    adapter.snapshotState = original;
    assert.equal(result.pageInfo.total, 17);
    assert.ok(calls >= 6);
});

test('shadow pagination contract reconciles the route page and reads final-page controls', async () => {
    const { api, sandbox } = loadAnalyzer();
    const adapter = api.ListingPageAdapter;
    const originals = { paginationNav: adapter.paginationNav, cardRoots: adapter.cardRoots, cardLinks: adapter.cardLinks, scan: adapter.scan };
    const options = Array.from({ length: 17 }, (_, index) => ({ value: String(index + 1), textContent: String(index + 1) }));
    const select = { value: '1', options };
    const previous = { disabled: false, getAttribute: (name) => name === 'aria-label' ? 'Previous' : null };
    const next = { disabled: false, getAttribute: (name) => name === 'aria-label' ? 'Next' : null };
    const nav = {
        textContent: 'Page of 17',
        querySelector: (selector) => selector === 'clg-select' ? { shadowRoot: { querySelector: () => select } } : null,
        querySelectorAll: (selector) => selector === 'clg-icon-button'
            ? [{ shadowRoot: { querySelector: () => previous } }, { shadowRoot: { querySelector: () => next } }]
            : [],
    };
    adapter.paginationNav = () => nav;
    adapter.cardRoots = () => Array.from({ length: 40 }, () => ({}));
    adapter.cardLinks = () => Array.from({ length: 40 }, (_, index) => ({ href: `https://www.etsy.com/your/shops/me/listing-editor/edit/${index + 1}` }));
    try {
        sandbox.location.pathname = '/your/shops/me/tools/listings';
        sandbox.location.href = 'https://www.etsy.com/your/shops/me/tools/listings?stats=true&page=2';
        assert.deepEqual(plain(adapter.pageInfo()), { current: 2, total: 17, valid: true, hasPagination: true, ambiguous: false });
        assert.equal(adapter.nextButton(), next);
        assert.equal(adapter.isDisabled(adapter.nextButton()), false);
        const finalControl = adapter.pageControl(17);
        assert.equal(finalControl.type, 'select');
        assert.equal(finalControl.element, select);
        assert.equal(finalControl.value, '17');
        sandbox.location.href = 'https://www.etsy.com/your/shops/me/tools/listings?stats=true&page=17';
        next.disabled = true;
        assert.deepEqual(plain(adapter.pageInfo()), { current: 17, total: 17, valid: true, hasPagination: true, ambiguous: false });
        assert.equal(adapter.isDisabled(adapter.nextButton()), true);
        adapter.cardRoots = () => Array.from({ length: 13 }, () => ({}));
        adapter.cardLinks = () => Array.from({ length: 13 }, (_, index) => ({ href: `https://www.etsy.com/your/shops/me/listing-editor/edit/${index + 1}` }));
        adapter.scan = () => Array.from({ length: 13 }, (_, index) => ({ listingId: String(index + 1), metricContract: snapshot('2026-01-01T00:00:00.000Z').metricContract }));
        const finalPage = await adapter.readStable({ requirePagination: true, timeout: 600 });
        assert.equal(finalPage.listings.length, 13);
        select.value = '17';
        sandbox.location.href = 'https://www.etsy.com/your/shops/me/tools/listings?stats=true';
        assert.equal(adapter.pageInfo().current, 1);
        for (const invalid of ['0', '-1', '1.5', '18', '2&page=3']) {
            sandbox.location.href = `https://www.etsy.com/your/shops/me/tools/listings?stats=true&page=${invalid}`;
            assert.equal(adapter.pageInfo().valid, false);
        }
        for (const invalidOffset of ['', '-1', 'abc', '40', '0&offset=0']) {
            sandbox.location.href = `https://www.etsy.com/your/shops/me/tools/listings?stats=true&offset=${invalidOffset}`;
            assert.equal(adapter.pageInfo().valid, false);
        }
        sandbox.location.href = 'https://www.etsy.com/your/shops/me/tools/listings?stats=true&offset=0';
        assert.equal(adapter.pageInfo().current, 1);
    } finally {
        Object.assign(adapter, originals);
    }
});

test('collection navigation prefers the shadow select over the adjacent icon button', async () => {
    const { api } = loadAnalyzer();
    const adapter = api.ListingPageAdapter;
    const runtime = api.collectionRuntime;
    const collection = runtime.Collection;
    const lease = runtime.CollectionLease;
    const originals = {
        pageInfo: adapter.pageInfo,
        nextButton: adapter.nextButton,
        isDisabled: adapter.isDisabled,
        pageControl: adapter.pageControl,
        cardLinks: adapter.cardLinks,
        scan: adapter.scan,
        contentSignature: adapter.contentSignature,
        prepareNavigationHandoff: collection.prepareNavigationHandoff,
        acquire: lease.acquire,
    };
    const events = [];
    const select = {
        value: '1',
        dispatchEvent(event) {
            events.push(event.type);
            if (event.type === 'change') {
                current = 2;
                signature = 'after';
                firstLink = {};
            }
        },
    };
    const next = {};
    let current = 1;
    let signature = 'before';
    let firstLink = {};
    adapter.pageInfo = () => ({ current, total: 17, valid: true });
    adapter.nextButton = () => next;
    adapter.isDisabled = () => false;
    adapter.pageControl = (page) => ({ type: 'select', element: select, value: String(page) });
    adapter.cardLinks = () => [firstLink];
    adapter.scan = () => [{ listingId: String(current) }];
    adapter.contentSignature = () => signature;
    collection.prepareNavigationHandoff = async () => true;
    lease.acquire = async () => true;
    try {
        assert.equal(await collection.navigateTo(2, 'before'), true);
        assert.equal(select.value, '2');
        assert.deepEqual(events, ['input', 'change']);
    } finally {
        Object.assign(adapter, {
            pageInfo: originals.pageInfo,
            nextButton: originals.nextButton,
            isDisabled: originals.isDisabled,
            pageControl: originals.pageControl,
            cardLinks: originals.cardLinks,
            scan: originals.scan,
            contentSignature: originals.contentSignature,
        });
        collection.prepareNavigationHandoff = originals.prepareNavigationHandoff;
        lease.acquire = originals.acquire;
    }
});

test('first read of the final page observes the full window before accepting its unknown card count', async () => {
    const { api } = loadAnalyzer();
    const adapter = api.ListingPageAdapter;
    const original = adapter.snapshotState;
    let calls = 0;
    const partial = { valid: true, pageInfo: { current: 17, total: 17, valid: true, hasPagination: true }, links: Array(3).fill({}), listings: Array.from({ length: 3 }, (_, index) => ({ listingId: String(index + 1) })), signature: 'final-3' };
    const complete = { valid: true, pageInfo: { current: 17, total: 17, valid: true, hasPagination: true }, links: Array(10).fill({}), listings: Array.from({ length: 10 }, (_, index) => ({ listingId: String(index + 1) })), signature: 'final-10' };
    adapter.snapshotState = () => (++calls <= 4 ? partial : complete);
    const result = await adapter.readStable({ timeout: 600 });
    adapter.snapshotState = original;
    assert.equal(result.listings.length, 10);
});

test('abandoned handoff recovery skips target-page preflight when its lease has expired', async () => {
    const { api, storage } = loadAnalyzer();
    const runtime = api.collectionRuntime;
    const expired = new Date(Date.now() - 60_000).toISOString();
    const raw = {
        schema: api.versions.collectionSchema,
        id: 'expired-handoff',
        status: 'running',
        scopeKey: '',
        startedAt: expired,
        updatedAt: expired,
        expectedPage: 2,
        totalPages: 2,
        pages: { 1: { signature: '1', contentSignature: '1', ids: ['1'], count: 1, capturedAt: expired } },
        uniqueIds: ['1'],
        duplicateCount: 0,
        returningToFirst: false,
        leaseToken: 'old-lease',
        handoffToken: 'expired-token',
        handoffPage: 2,
        handoffExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        failureReports: [],
    };
    storage.set(runtime.KEYS.collection, raw);
    storage.set(runtime.KEYS.collectionLease, { owner: 'other', token: 'old-lease', instanceId: 'old-page', expiresAt: Date.now() - 1 });
    runtime.state.collection = api.normalizeCollection(raw);
    let stableReads = 0;
    const originalReadStable = api.ListingPageAdapter.readStable;
    api.ListingPageAdapter.readStable = async () => { stableReads += 1; return null; };
    try {
        assert.equal(await runtime.CollectionLease.acquire({ allowAbandonedHandoff: true }), true);
        assert.equal(stableReads, 0);
        assert.equal(runtime.state.collection.handoffToken, '');
        assert.notEqual(runtime.state.collection.leaseToken, 'old-lease');
    } finally {
        api.ListingPageAdapter.readStable = originalReadStable;
        await runtime.CollectionLease.release();
    }
});

test('same-day partial captures do not carry stale metrics into the new observation', () => {
    const { api } = loadAnalyzer();
    const previous = snapshot('2026-08-08T09:00:00.000Z', { visits: 10, revenue: 99.5 });
    const incoming = snapshot('2026-08-08T12:00:00.000Z', { visits: null, revenue: null });
    const merged = plain(api.mergeDailySnapshot(previous, incoming));
    assert.equal(merged.visits, null);
    assert.equal(merged.revenue, null);
    assert.ok(!merged.quality.observedFields.includes('visits'));
    assert.ok(!merged.quality.observedFields.includes('revenue'));
    assert.ok(!Object.hasOwn(merged.observedAt, 'visits'));
    const reverseOrder = plain(api.mergeDailySnapshot(incoming, previous));
    assert.equal(reverseOrder.at, incoming.at);
    assert.equal(reverseOrder.visits, null);
    assert.equal(reverseOrder.revenue, null);
});

test('DORMANT requires a complete 60-day anchor instead of treating missing history as zero', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const thirtyDays = record('101', [
        snapshot('2026-07-02T12:00:00.000Z'),
        snapshot(evaluatedAt),
    ], { seasonal: true });
    const shortResult = api.evaluateRecord(thirtyDays, [thirtyDays], undefined, evaluatedAt).result;
    assert.notEqual(shortResult.lifecycle, 'DORMANT');
    assert.equal(shortResult.derived.anchors.d60, null);

    const sixtyDays = record('102', [
        snapshot('2026-06-02T12:00:00.000Z'),
        snapshot('2026-07-02T12:00:00.000Z'),
        snapshot(evaluatedAt),
    ], { seasonal: true });
    assert.equal(api.evaluateRecord(sixtyDays, [sixtyDays], undefined, evaluatedAt).result.lifecycle, 'DORMANT');
});

test('trend anchors never cross an inactive state epoch or an unverified legacy metric scope', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const reactivatedNow = record('epoch-now', [
        snapshot('2026-06-02T12:00:00.000Z', { visits: 40 }),
        snapshot('2026-07-02T12:00:00.000Z', { visits: 0, listingState: 'inactive', statusLabel: 'Inactive' }),
        snapshot(evaluatedAt, { visits: 20 }),
    ]);
    const nowDerived = plain(api.deriveRecordMetrics(reactivatedNow, evaluatedAt));
    assert.equal(nowDerived.stateEpochSnapshotCount, 1);
    assert.equal(nowDerived.anchors.d30.complete, false);
    assert.equal(nowDerived.anchors.d60.complete, false);
    assert.equal(api.evaluateRecord(reactivatedNow, [reactivatedNow], undefined, evaluatedAt).result.lifecycle, 'BASELINE');

    const activeForThirty = record('epoch-thirty', [
        snapshot('2026-06-02T12:00:00.000Z', { visits: 0, listingState: 'inactive', statusLabel: 'Inactive' }),
        snapshot('2026-07-02T12:00:00.000Z', { visits: 10 }),
        snapshot(evaluatedAt, { visits: 20 }),
    ]);
    const thirtyDerived = plain(api.deriveRecordMetrics(activeForThirty, evaluatedAt));
    assert.equal(thirtyDerived.stateEpochSnapshotCount, 2);
    assert.equal(thirtyDerived.anchors.d30.complete, true);
    assert.equal(thirtyDerived.anchors.d60.complete, false);

    const legacyAnchor = record('legacy-anchor', [
        snapshot('2026-07-02T12:00:00.000Z', { visits: 10, metricContract: null }),
        snapshot(evaluatedAt, { visits: 20 }),
    ]);
    const legacyResult = api.evaluateRecord(legacyAnchor, [legacyAnchor], undefined, evaluatedAt).result;
    assert.equal(legacyResult.derived.anchors.d30, null);
    assert.equal(legacyResult.lifecycle, 'LEARNING');
    assert.ok(legacyResult.historicalAnomalies.includes('unverified-metric-scope'));
});

test('deactivation fails closed until non-seasonal status is explicit', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const history = [
        snapshot('2026-06-02T12:00:00.000Z', { renewals: 0 }),
        snapshot('2026-07-02T12:00:00.000Z', { renewals: 2 }),
        snapshot(evaluatedAt, { renewals: 4 }),
    ];
    const unknown = record('201', history);
    const confirmed = record('202', history, { seasonal: false });
    const unknownResult = api.evaluateRecord(unknown, [unknown], undefined, evaluatedAt).result;
    const confirmedResult = api.evaluateRecord(confirmed, [confirmed], undefined, evaluatedAt).result;
    assert.notEqual(unknownResult.lifecycle, 'DEACTIVATION_REVIEW');
    assert.equal(unknownResult.safeguards.find((item) => item.key === 'guardSeasonal').passed, false);
    assert.equal(confirmedResult.lifecycle, 'DEACTIVATION_REVIEW');
});

test('listing context migrates, persists, audits, and survives a later snapshot', async () => {
    const { api, storage } = loadAnalyzer();
    const runtime = api.collectionRuntime;
    assert.equal(api.normalizeSeasonality(undefined, true), 'seasonal');
    assert.equal(api.normalizeSeasonality(undefined, false), 'non-seasonal');
    assert.equal(api.normalizeSeasonality('invalid'), 'unknown');
    assert.equal(api.normalizeListingType('invalid'), 'unknown');

    const original = record('context-1', [snapshot('2026-08-30T12:00:00.000Z')], { seasonal: false });
    await runtime.Store.putRecord(original);
    const migrated = await runtime.Store.getRecord('context-1');
    assert.equal(migrated.meta.seasonality, 'non-seasonal');
    assert.equal(Object.hasOwn(migrated.meta, 'seasonal'), false);

    await runtime.Store.saveListingContext('context-1', { seasonality: 'seasonal', listingType: 'digital' });
    const saved = await runtime.Store.getRecord('context-1');
    assert.equal(saved.meta.seasonality, 'seasonal');
    assert.equal(saved.meta.listingType, 'digital');
    assert.equal(saved.meta.contextSource, 'user');
    assert.ok(Number.isFinite(Date.parse(saved.meta.contextUpdatedAt)));
    const audit = [...storage.entries()].find(([key]) => key.endsWith(':audit'))?.[1] || [];
    const contextAudit = audit.find((entry) => entry.type === 'listing-context-set');
    assert.deepEqual(plain(contextAudit.from), { seasonality: 'non-seasonal', listingType: 'unknown' });
    assert.deepEqual(plain(contextAudit.to), { seasonality: 'seasonal', listingType: 'digital' });

    const next = runtime.Store.prepareSnapshot({
        listingId: 'context-1', title: 'Listing context-1', sku: '',
        editUrl: saved.meta.editUrl, publicUrl: '', imageUrl: '', shopKey: saved.meta.shopKey,
        listingState: 'active', statusLabel: 'Active', renewalLabel: 'Auto-renews', stock: 10,
        price: { min: 20, max: 20 }, currency: '$', visits: 5, favorites: 1, sales: 0, revenue: 0, renewals: 0,
        metricContract: snapshot('2026-08-31T12:00:00.000Z').metricContract,
        capturedAt: '2026-08-31T12:00:00.000Z',
    }, saved);
    assert.equal(next.meta.seasonality, 'seasonal');
    assert.equal(next.meta.listingType, 'digital');
});

test('record merging fences listing context by contextUpdatedAt instead of lastSeenAt', async () => {
    const { api } = loadAnalyzer();
    const store = api.collectionRuntime.Store;
    const current = record('context-merge', [snapshot('2026-08-29T12:00:00.000Z')], {
        seasonality: 'seasonal', listingType: 'digital', contextSource: 'user',
        contextUpdatedAt: '2026-08-20T12:00:00.000Z', lastSeenAt: '2026-08-29T12:00:00.000Z',
    });
    await store.putRecord(current);
    const staleContextWithNewerScan = record('context-merge', [
        snapshot('2026-08-30T12:00:00.000Z'),
    ], {
        seasonality: 'non-seasonal', listingType: 'physical', contextSource: 'user',
        contextUpdatedAt: '2026-08-10T12:00:00.000Z', lastSeenAt: '2026-08-30T12:00:00.000Z',
    });
    await store.putRecord(staleContextWithNewerScan);
    const saved = await store.getRecord('context-merge');
    assert.equal(saved.meta.lastSeenAt, '2026-08-30T12:00:00.000Z');
    assert.equal(saved.meta.contextUpdatedAt, '2026-08-20T12:00:00.000Z');
    assert.equal(saved.meta.seasonality, 'seasonal');
    assert.equal(saved.meta.listingType, 'digital');
});

test('deactivation review requires the current snapshot to remain at zero traffic', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const recovered = record('203', [
        snapshot('2026-06-02T12:00:00.000Z', { renewals: 0 }),
        snapshot('2026-07-02T12:00:00.000Z', { renewals: 2 }),
        snapshot(evaluatedAt, { visits: 10, renewals: 4 }),
    ], { seasonal: false });
    const peers = Array.from({ length: 7 }, (_, index) => record(String(204 + index), [
        snapshot('2026-06-02T12:00:00.000Z', { renewals: 0 }),
        snapshot('2026-07-02T12:00:00.000Z', { renewals: 2 }),
        snapshot(evaluatedAt, { visits: 10, renewals: 4 }),
    ], { seasonal: false }));
    const result = api.evaluateRecord(recovered, [recovered, ...peers], undefined, evaluatedAt).result;
    assert.notEqual(result.lifecycle, 'DEACTIVATION_REVIEW');
    assert.equal(result.safeguards.find((item) => item.key === 'guardZeroTraffic').passed, false);
});

test('deactivation history requires at least 58 days of complete snapshots', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const partialSixty = record('history-partial', [
        snapshot('2026-06-02T12:00:00.000Z', { revenue: null, renewals: 0 }),
        snapshot('2026-06-12T12:00:00.000Z', { renewals: 0 }),
        snapshot('2026-07-02T12:00:00.000Z', { renewals: 2 }),
        snapshot(evaluatedAt, { renewals: 4 }),
    ], { seasonal: false });
    const partialResult = api.evaluateRecord(partialSixty, [partialSixty], undefined, evaluatedAt).result;
    assert.equal(partialResult.derived.completeHistorySpanDays, 50);
    assert.equal(partialResult.safeguards.find((item) => item.key === 'guardHistory').passed, false);
    assert.equal(partialResult.readiness.deactivationHistory, false);
    assert.notEqual(partialResult.lifecycle, 'DEACTIVATION_REVIEW');

    const completeFiftyNine = record('history-complete', [
        snapshot('2026-06-03T12:00:00.000Z', { renewals: 0 }),
        snapshot('2026-07-02T12:00:00.000Z', { renewals: 2 }),
        snapshot(evaluatedAt, { renewals: 4 }),
    ], { seasonal: false });
    const completeResult = api.evaluateRecord(completeFiftyNine, [completeFiftyNine], undefined, evaluatedAt).result;
    assert.equal(completeResult.derived.completeHistorySpanDays, 59);
    assert.equal(completeResult.safeguards.find((item) => item.key === 'guardHistory').passed, true);
    assert.equal(completeResult.readiness.deactivationHistory, true);
});

test('an anomalous intermediate snapshot inside the active deactivation window blocks the action', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const candidate = record('deactivation-intermediate-anomaly', [
        snapshot('2026-06-02T12:00:00.000Z', { visits: 0, renewals: 0 }),
        snapshot('2026-06-17T12:00:00.000Z', { visits: -1, renewals: 1 }),
        snapshot('2026-07-02T12:00:00.000Z', { visits: 0, renewals: 2 }),
        snapshot(evaluatedAt, { visits: 0, renewals: 4 }),
    ], { seasonality: 'non-seasonal' });
    const result = api.evaluateRecord(candidate, [candidate], undefined, evaluatedAt).result;
    assert.ok(result.anomalies.includes('negative-visits'));
    assert.ok(result.historicalAnomalies.includes('negative-visits'));
    assert.equal(result.safeguards.find((item) => item.key === 'guardDataIntegrity').passed, false);
    assert.notEqual(result.lifecycle, 'DEACTIVATION_REVIEW');
});

test('favorites without a same-window visit remain valid evidence without inventing a rate', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const broken = record('301', [
        snapshot('2026-07-02T12:00:00.000Z'),
        snapshot(evaluatedAt, { visits: 0, favorites: 5 }),
    ]);
    const result = api.evaluateRecord(broken, [broken], undefined, evaluatedAt).result;
    assert.notEqual(result.lifecycle, 'DATA_GAP');
    assert.ok(!result.anomalies.includes('favorites-without-visits'));
    assert.equal(result.derived.favoriteRate, null);

    const impossibleRevenue = record('301-revenue', [
        snapshot(evaluatedAt, { visits: 10, sales: 0, revenue: 20 }),
    ]);
    const revenueResult = api.evaluateRecord(impossibleRevenue, [impossibleRevenue], undefined, evaluatedAt).result;
    assert.equal(revenueResult.lifecycle, 'DATA_GAP');
    assert.equal(revenueResult.assessmentMode, 'insufficient');
    assert.equal(revenueResult.code, 'waiting');
    assert.ok(revenueResult.anomalies.includes('revenue-without-sales'));

    const saleWithoutRevenue = record('301-sale', [
        snapshot(evaluatedAt, { visits: 10, sales: 1, revenue: 0 }),
    ]);
    const saleResult = api.evaluateRecord(saleWithoutRevenue, [saleWithoutRevenue], undefined, evaluatedAt).result;
    assert.equal(saleResult.assessmentMode, 'snapshot');
    assert.equal(saleResult.bootstrap.cumulativeSignal, 'PROVEN_DEMAND');
    assert.equal(saleResult.code, 'protected');
});

test('stale anchor observations and negative metrics fail closed at low confidence', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const stale = record('302', [
        snapshot('2026-06-02T12:00:00.000Z', { visits: 80 }),
        snapshot('2026-07-02T12:00:00.000Z', { visits: 90, observedAt: { visits: '2026-07-02T10:00:00.000Z' } }),
        snapshot(evaluatedAt, { visits: 100 }),
    ]);
    const staleResult = api.evaluateRecord(stale, [stale], undefined, evaluatedAt).result;
    assert.equal(staleResult.derived.anchors.d30, null);
    assert.equal(staleResult.lifecycle, 'DATA_GAP');
    assert.ok(staleResult.confidenceCaps.includes('data-integrity'));
    assert.equal(staleResult.assessmentMode, 'insufficient');
    assert.equal(staleResult.score, null);
    assert.ok(staleResult.anomalies.includes('stale-observation-visits'));
    assert.ok(staleResult.historicalAnomalies.includes('stale-observation-visits'));
    assert.equal(staleResult.readiness.trend, false);

    const negative = record('303', [
        snapshot('2026-06-02T12:00:00.000Z', { visits: 10 }),
        snapshot('2026-07-02T12:00:00.000Z', { visits: 10 }),
        snapshot(evaluatedAt, { visits: -5 }),
    ]);
    const negativeResult = api.evaluateRecord(negative, [negative], undefined, evaluatedAt).result;
    assert.equal(negativeResult.lifecycle, 'DATA_GAP');
    assert.equal(negativeResult.diagnosis, 'INSUFFICIENT_SIGNAL');
    assert.ok(negativeResult.confidence <= 39);
    assert.ok(negativeResult.anomalies.includes('negative-visits'));
    assert.equal(negativeResult.assessmentMode, 'insufficient');
    assert.equal(negativeResult.score, null);
    assert.equal(negativeResult.readiness.trend, false);
});

test('cumulative decreases cannot expose a longitudinal score or readiness', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const broken = record('303b', [
        snapshot('2026-07-02T12:00:00.000Z', { visits: 40, favorites: 4, sales: 5, revenue: 100, renewals: 5 }),
        snapshot(evaluatedAt, { visits: 60, favorites: 5, sales: 4, revenue: 80, renewals: 4 }),
    ]);
    const result = api.evaluateRecord(broken, [broken], undefined, evaluatedAt).result;
    assert.equal(result.lifecycle, 'DATA_GAP');
    assert.equal(result.diagnosis, 'INSUFFICIENT_SIGNAL');
    assert.equal(result.assessmentMode, 'insufficient');
    assert.equal(result.score, null);
    assert.deepEqual(plain(result.readiness), { snapshot: false, trend: false, deactivationHistory: false });
    assert.ok(result.confidenceCaps.includes('data-integrity'));
});

test('traffic confidence bonus requires repeated zero observations including the current snapshot', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const recovered = record('304', [
        snapshot('2026-06-02T12:00:00.000Z'),
        snapshot('2026-07-02T12:00:00.000Z'),
        snapshot(evaluatedAt, { visits: 10 }),
    ]);
    const dormant = record('305', [
        snapshot('2026-06-02T12:00:00.000Z'),
        snapshot('2026-07-02T12:00:00.000Z'),
        snapshot(evaluatedAt),
    ]);
    assert.notEqual(api.evaluateRecord(recovered, [recovered], undefined, evaluatedAt).result.confidenceComponents.trafficSample, 100);
    assert.equal(api.evaluateRecord(dormant, [dormant], undefined, evaluatedAt).result.confidenceComponents.trafficSample, 100);
});

test('first-snapshot bootstrap separates renewal waste, funnel weakness, and proven demand', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const candidates = [
        record('bootstrap-a', [snapshot(evaluatedAt, { visits: 0, favorites: 0, sales: 0, revenue: 0, renewals: 2 })]),
        record('bootstrap-b', [snapshot(evaluatedAt, { visits: 50, favorites: 0, sales: 0, revenue: 0, renewals: 2 })]),
        record('bootstrap-c', [snapshot(evaluatedAt, { visits: 50, favorites: 5, sales: 0, revenue: 0, renewals: 2 })]),
        record('bootstrap-d', [snapshot(evaluatedAt, { visits: 50, favorites: 5, sales: 3, revenue: 120, renewals: 3 })]),
        record('bootstrap-e', [snapshot(evaluatedAt, { visits: 5, favorites: 0, sales: 0, revenue: 0, renewals: 0 })]),
        record('bootstrap-f', [snapshot(evaluatedAt, { visits: 80, favorites: 8, sales: 1, revenue: 40, renewals: 1 })]),
        record('bootstrap-g', [snapshot(evaluatedAt, { visits: 160, favorites: 12, sales: 4, revenue: 200, renewals: 4 })]),
        record('bootstrap-h', [snapshot(evaluatedAt, { visits: 20, favorites: 1, sales: 0, revenue: 0, renewals: 1 })]),
        record('bootstrap-i', [snapshot(evaluatedAt, { visits: 0, favorites: 0, sales: 1, revenue: 20, renewals: 3 })]),
        record('bootstrap-zero', [snapshot(evaluatedAt)]),
    ];
    const results = api.evaluateRecords(candidates, undefined, evaluatedAt);
    const a = results['bootstrap-a'].result;
    const b = results['bootstrap-b'].result;
    const c = results['bootstrap-c'].result;
    const d = results['bootstrap-d'].result;

    assert.equal(a.lifecycle, 'BASELINE');
    assert.equal(a.assessmentMode, 'snapshot');
    assert.equal(a.bootstrap.signal, 'RENEWAL_WASTE');
    assert.equal(a.diagnosis, 'DISCOVERY_WEAK');
    assert.equal(a.code, 'improve');
    assert.ok(a.score <= 25);
    assert.ok(a.confidence <= 39);
    assert.deepEqual(plain(a.readiness), { snapshot: true, trend: false, deactivationHistory: false });

    assert.equal(b.bootstrap.signal, 'RENEWAL_WASTE');
    assert.equal(b.diagnosis, 'ENGAGEMENT_WEAK');
    assert.equal(b.code, 'improve');
    assert.ok(b.score > a.score);

    assert.equal(c.bootstrap.signal, 'PURCHASE_FRICTION');
    assert.equal(c.bootstrap.cumulativeSignal, 'NO_DEMAND');
    assert.equal(c.diagnosis, 'PURCHASE_FRICTION');
    assert.equal(c.code, 'improve');

    assert.equal(d.bootstrap.cumulativeSignal, 'PROVEN_DEMAND');
    assert.equal(d.code, 'protected');
    assert.equal(d.scoreBasis, 'current-30d-reach-engagement');
    assert.deepEqual(plain(d.currentAssessment.components), plain(d.bootstrap.components));
    const provenWithoutCurrentReach = results['bootstrap-i'].result;
    assert.equal(provenWithoutCurrentReach.bootstrap.signal, 'NO_ACTIVITY');
    assert.equal(provenWithoutCurrentReach.bootstrap.funnelSignal, 'NO_ACTIVITY');
    assert.equal(provenWithoutCurrentReach.bootstrap.cumulativeSignal, 'PROVEN_DEMAND');
    assert.equal(provenWithoutCurrentReach.diagnosis, 'DISCOVERY_WEAK');
    assert.equal(provenWithoutCurrentReach.code, 'protected');
    assert.equal(provenWithoutCurrentReach.score, 0);
    const zero = results['bootstrap-zero'].result;
    assert.equal(zero.assessmentMode, 'snapshot');
    assert.equal(zero.bootstrap.signal, 'NO_ACTIVITY');
    assert.equal(zero.code, 'monitor');
    assert.equal(zero.score, 0);
    assert.notEqual(zero.diagnosis, 'INSUFFICIENT_SIGNAL');
    assert.equal(results['bootstrap-e'].result.bootstrap.signal, 'WEAK_DISCOVERY');
    assert.ok(results['bootstrap-e'].result.score <= 39);

    const scores = new Set(Object.values(results).map((item) => item.result.score).filter(Number.isFinite));
    assert.ok(scores.size > 3);
    Object.values(results).forEach(({ result }) => {
        assert.ok(!['ACTIVE_GROWING', 'ACTIVE_DECLINING', 'DORMANT', 'DEACTIVATION_REVIEW'].includes(result.lifecycle));
        assert.equal(result.readiness.trend, false);
        assert.equal(result.readiness.deactivationHistory, false);
    });
});

test('bootstrap treats two and four renewals as evidence but never as deactivation history', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const results = [];
    for (const renewals of [2, 4]) {
        const candidate = record(`renewals-${renewals}`, [snapshot(evaluatedAt, { renewals })], { seasonal: false });
        const result = api.evaluateRecord(candidate, [candidate], undefined, evaluatedAt).result;
        results.push(result);
        assert.equal(result.bootstrap.signal, 'RENEWAL_WASTE');
        assert.equal(result.code, 'improve');
        assert.equal(result.lifecycle, 'BASELINE');
        assert.equal(result.readiness.deactivationHistory, false);
        assert.notEqual(result.lifecycle, 'DEACTIVATION_REVIEW');
    }
    assert.ok(results[1].bootstrap.severity > results[0].bootstrap.severity);

    const learning = record('renewals-learning', [
        snapshot('2026-07-18T12:00:00.000Z', { renewals: 1 }),
        snapshot(evaluatedAt, { renewals: 2 }),
    ], { seasonal: false });
    const learningResult = api.evaluateRecord(learning, [learning], undefined, evaluatedAt).result;
    assert.equal(learningResult.lifecycle, 'LEARNING');
    assert.equal(learningResult.bootstrap.signal, 'RENEWAL_WASTE');
    assert.equal(learningResult.code, 'improve');
    assert.equal(learningResult.readiness.deactivationHistory, false);
});

test('bootstrap fails closed for unread, stale, anomalous, inactive, or out-of-stock current data', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const cases = [
        record('bootstrap-missing', [snapshot(evaluatedAt, { revenue: null, renewals: 4 })]),
        record('bootstrap-stale', [snapshot('2026-07-20T12:00:00.000Z', { renewals: 4 })]),
        record('bootstrap-anomaly', [snapshot(evaluatedAt, { sales: 0, revenue: 1, renewals: 4 })]),
        record('bootstrap-inactive', [snapshot(evaluatedAt, { renewals: 4, listingState: 'inactive', statusLabel: 'Inactive' })], { listingState: 'inactive', statusLabel: 'Inactive' }),
        record('bootstrap-stock', [snapshot(evaluatedAt, { renewals: 4, stock: 0 })]),
    ];
    cases.forEach((candidate) => {
        const result = api.evaluateRecord(candidate, [candidate], undefined, evaluatedAt).result;
        assert.equal(result.assessmentMode, 'insufficient');
        assert.equal(result.bootstrap, null);
        assert.equal(result.readiness.snapshot, false);
        assert.notEqual(result.code, 'improve');
        assert.notEqual(result.lifecycle, 'DEACTIVATION_REVIEW');
    });
});

test('analysis cards label current reach separately from history confidence', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const candidate = record('bootstrap-card', [snapshot(evaluatedAt, { renewals: 2 })]);
    candidate.analysis = api.evaluateRecord(candidate, [candidate], undefined, evaluatedAt).result;
    const markup = api.updater.UI.recordRow(candidate);
    assert.match(markup, /30 günlük erişim\/ilgi/);
    assert.match(markup, /Geçmiş kanıt yeterliliği: Düşük/);
    assert.match(markup, /Yenileme verimsizliği/);
    assert.match(markup, /Ziyaret · 30g/);
    assert.match(markup, /Satış · tüm-zaman/);
    assert.doesNotMatch(markup, />39 · Düşük</);
    assert.doesNotMatch(markup, /width:39%/);

    const protectedButQuiet = record('protected-quiet-card', [snapshot(evaluatedAt, { sales: 1, revenue: 20 })]);
    protectedButQuiet.analysis = api.evaluateRecord(protectedButQuiet, [protectedButQuiet], undefined, evaluatedAt).result;
    const quietMarkup = api.updater.UI.recordRow(protectedButQuiet);
    assert.equal(protectedButQuiet.analysis.code, 'protected');
    assert.equal(protectedButQuiet.analysis.score, 0);
    assert.equal(protectedButQuiet.analysis.diagnosis, 'DISCOVERY_WEAK');
    assert.doesNotMatch(quietMarkup, /meli-pill success meli-health-trigger/);
    assert.match(quietMarkup, /meli-pill warning meli-health-trigger/);
});

test('complete all-zero counters are explicit no-activity evidence instead of missing data', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const candidate = record('no-activity-card', [snapshot(evaluatedAt)]);
    candidate.analysis = api.evaluateRecord(candidate, [candidate], undefined, evaluatedAt).result;
    const markup = api.updater.UI.recordRow(candidate);
    assert.equal(candidate.analysis.assessmentMode, 'snapshot');
    assert.equal(candidate.analysis.bootstrap.signal, 'NO_ACTIVITY');
    assert.equal(candidate.analysis.score, 0);
    assert.match(markup, /Güncel hareket yok/);
    assert.match(markup, /Veri eksik değil/);
    assert.doesNotMatch(markup, /Güncel metrik okunamadı/);
});

test('renewal-waste evidence starts at two renewals independently of deactivation settings', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const strictDeactivation = { minRenewalsToReview: 5 };
    const two = record('renewal-waste-two', [snapshot(evaluatedAt, { renewals: 2 })]);
    const one = record('renewal-waste-one', [snapshot(evaluatedAt, { renewals: 1 })]);
    assert.equal(api.evaluateRecord(two, [two], strictDeactivation, evaluatedAt).result.bootstrap.signal, 'RENEWAL_WASTE');
    assert.notEqual(api.evaluateRecord(one, [one], { minRenewalsToReview: 1 }, evaluatedAt).result.bootstrap.signal, 'RENEWAL_WASTE');
});

test('the current reach score keeps one meaning with or without longitudinal history', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const first = record('score-first', [snapshot(evaluatedAt, { visits: 50, favorites: 5, sales: 2, revenue: 80 })]);
    const history = record('score-history', [
        snapshot('2026-07-02T12:00:00.000Z', { visits: 40, favorites: 4, sales: 1, revenue: 40 }),
        snapshot(evaluatedAt, { visits: 50, favorites: 5, sales: 2, revenue: 80 }),
    ]);
    const firstResult = api.evaluateRecord(first, [first], undefined, evaluatedAt).result;
    const historyResult = api.evaluateRecord(history, [history], undefined, evaluatedAt).result;
    assert.equal(firstResult.assessmentMode, 'snapshot');
    assert.equal(historyResult.assessmentMode, 'longitudinal');
    assert.equal(firstResult.score, historyResult.score);
    assert.equal(firstResult.scoreBasis, 'current-30d-reach-engagement');
    assert.equal(historyResult.scoreBasis, 'current-30d-reach-engagement');
    assert.equal(historyResult.bootstrap, null);
    assert.ok(historyResult.currentAssessment);
});

test('favorite evidence enters the reach score continuously at the visit threshold', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const score = (visits, favorites) => api.evaluateRecord(
        record(`smooth-${visits}-${favorites}`, [snapshot(evaluatedAt, { visits, favorites })]),
        undefined,
        undefined,
        evaluatedAt,
    ).result.score;
    const zeroAt19 = score(19, 0);
    const zeroAt20 = score(20, 0);
    const oneAt19 = score(19, 1);
    const oneAt20 = score(20, 1);
    assert.ok(zeroAt20 >= zeroAt19);
    assert.ok(oneAt20 >= oneAt19);
    assert.ok(Math.abs(zeroAt20 - zeroAt19) <= 2);
    assert.ok(Math.abs(oneAt20 - oneAt19) <= 2);
    assert.ok(oneAt20 - zeroAt20 < 25);
});

test('rolling trend windows are consecutive and do not reuse a nearby 60-day anchor', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-03-10T00:00:00.000Z';
    const history = [
        snapshot('2026-01-19T00:00:00.000Z', { visits: 70 }),
        snapshot('2026-02-01T00:00:00.000Z', { visits: 80 }),
        snapshot('2026-02-15T00:00:00.000Z', { visits: 90 }),
        snapshot(evaluatedAt, { visits: 100 }),
    ];
    const derived = plain(api.deriveRecordMetrics(record('consecutive-windows', history), evaluatedAt));
    assert.equal(derived.anchors.d30.actualDays, 37);
    assert.equal(derived.anchors.d60.actualDays, 50);
    assert.equal(derived.anchors.prior30.complete, false);
    assert.equal(derived.priorTrafficChangePercent, null);
});

test('exact rolling trend inference uses only consecutive non-overlapping 30-31 day windows', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-31T12:00:00.000Z';
    const atDaysAgo = (days) => new Date(Date.parse(evaluatedAt) - days * 86400000).toISOString();
    const overlapping = record('trend-overlap', [
        snapshot(atDaysAgo(58), { visits: 25 }),
        snapshot(atDaysAgo(29), { visits: 100 }),
        snapshot(evaluatedAt, { visits: 400 }),
    ]);
    const overlapResult = api.evaluateRecord(overlapping, [overlapping], undefined, evaluatedAt).result;
    assert.equal(overlapResult.derived.trafficChangePercent, 300);
    assert.equal(overlapResult.derived.trendTrafficChangePercent, null);
    assert.equal(overlapResult.derived.trendIntervals.recent, null);
    assert.equal(overlapResult.readiness.trend, false);
    assert.notEqual(overlapResult.lifecycle, 'ACTIVE_GROWING');

    const consecutive = record('trend-consecutive', [
        snapshot(atDaysAgo(60), { visits: 25 }),
        snapshot(atDaysAgo(30), { visits: 100 }),
        snapshot(evaluatedAt, { visits: 400 }),
    ]);
    const consecutiveResult = api.evaluateRecord(consecutive, [consecutive], undefined, evaluatedAt).result;
    assert.equal(consecutiveResult.derived.trendTrafficChangePercent, 300);
    assert.ok(consecutiveResult.derived.trendIntervals.recent);
    assert.ok(consecutiveResult.derived.trendIntervals.prior);
    assert.equal(consecutiveResult.readiness.trend, true);
    assert.equal(consecutiveResult.lifecycle, 'ACTIVE_GROWING');

    const tooWide = record('trend-too-wide', [
        snapshot(atDaysAgo(62.02), { visits: 25 }),
        snapshot(atDaysAgo(31.01), { visits: 100 }),
        snapshot(evaluatedAt, { visits: 400 }),
    ]);
    const tooWideResult = api.evaluateRecord(tooWide, [tooWide], undefined, evaluatedAt).result;
    assert.equal(tooWideResult.derived.trendTrafficChangePercent, null);
    assert.equal(tooWideResult.readiness.trend, false);
    assert.notEqual(tooWideResult.lifecycle, 'ACTIVE_GROWING');
});

test('exact trend anchors are not shadowed by a closer approximate snapshot', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-31T12:00:00.000Z';
    const atDaysAgo = (days) => new Date(Date.parse(evaluatedAt) - days * 86400000).toISOString();
    const approximateContract = plain(snapshot(evaluatedAt).metricContract);
    approximateContract.countPrecision.visits = 'approximate';
    const candidate = record('trend-anchor-selection', [
        snapshot(atDaysAgo(61.5), { visits: 50 }),
        snapshot(atDaysAgo(30.75), { visits: 100 }),
        snapshot(atDaysAgo(29.75), { visits: 200, metricContract: approximateContract }),
        snapshot(evaluatedAt, { visits: 400 }),
    ]);
    const result = api.evaluateRecord(candidate, [candidate], undefined, evaluatedAt).result;
    assert.equal(result.derived.anchors.d30.actualDays, 29.8);
    assert.equal(result.derived.anchors.trend30.actualDays, 30.8);
    assert.equal(result.derived.trafficChangePercent, 100);
    assert.equal(result.derived.trendTrafficChangePercent, 300);
    assert.ok(result.derived.trendIntervals.recent);
    const trafficEvidence = result.evidence.find((item) => item.key === 'evidenceTraffic');
    assert.deepEqual(plain(trafficEvidence?.params), { current: 400, previous: 100, percent: 300 });
});

test('fallback traffic evidence and exported decline use the same exact anchor', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-31T12:00:00.000Z';
    const candidate = record('traffic-evidence-fallback', [
        snapshot('2026-08-02T12:00:00.000Z', { visits: 100 }),
        snapshot(evaluatedAt, { visits: 50 }),
    ]);
    const result = api.evaluateRecord(candidate, [candidate], undefined, evaluatedAt).result;
    assert.equal(result.derived.anchors.d30.actualDays, 29);
    assert.equal(result.derived.anchors.trend30, null);
    assert.equal(result.derived.trafficChangePercent, -50);
    assert.equal(result.derived.trendTrafficChangePercent, null);
    assert.deepEqual(plain(result.evidence.find((item) => item.key === 'evidenceTraffic')?.params), {
        current: 50, previous: 100, percent: -50,
    });
    assert.equal(result.declinePercent, 50);
});

test('compact approximate traffic can describe change but cannot produce an exact trend lifecycle', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const approximateContract = plain(snapshot(evaluatedAt).metricContract);
    approximateContract.countPrecision.visits = 'approximate';
    const candidate = record('approximate-trend', [
        snapshot('2026-06-02T12:00:00.000Z', { visits: 100, metricContract: approximateContract }),
        snapshot('2026-07-02T12:00:00.000Z', { visits: 200, metricContract: approximateContract }),
        snapshot(evaluatedAt, { visits: 400, metricContract: approximateContract }),
    ]);
    const result = api.evaluateRecord(candidate, [candidate], undefined, evaluatedAt).result;
    assert.equal(result.derived.trafficChangePercent, 100);
    assert.equal(result.derived.previousTrafficChangePercent, 100);
    assert.equal(result.derived.trendIntervals.recent, null);
    assert.equal(result.derived.trendIntervals.prior, null);
    assert.equal(result.readiness.trend, false);
    assert.notEqual(result.lifecycle, 'ACTIVE_GROWING');
    assert.notEqual(result.lifecycle, 'ACTIVE_DECLINING');
});

test('priority and explicit score sorting use bootstrap evidence instead of the shared confidence cap', () => {
    const { api } = loadAnalyzer();
    const rows = [
        { listingId: 'mixed', analysis: { code: 'monitor', score: 70, confidence: 39, bootstrap: { priority: 5 } } },
        { listingId: 'engagement', analysis: { code: 'improve', score: 30, confidence: 39, bootstrap: { priority: 2 } } },
        { listingId: 'waste-high', analysis: { code: 'improve', score: 20, confidence: 39, bootstrap: { priority: 0 } } },
        { listingId: 'waste-low', analysis: { code: 'improve', score: 5, confidence: 39, bootstrap: { priority: 0 } } },
    ];
    assert.deepEqual(plain(api.sortAnalysisRecords(rows, 'priority').map((item) => item.listingId)), ['waste-low', 'waste-high', 'engagement', 'mixed']);
    assert.deepEqual(plain(api.sortAnalysisRecords(rows, 'score').map((item) => item.listingId)), ['mixed', 'engagement', 'waste-high', 'waste-low']);
    assert.equal(api.normalizeAnalysisFilters({ sort: 'score' }).sort, 'score');
});

test('purchase-friction priority increases with exposed current demand', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const lower = record('friction-lower', [snapshot(evaluatedAt, { visits: 30, favorites: 3 })]);
    const higher = record('friction-higher', [snapshot(evaluatedAt, { visits: 100, favorites: 10 })]);
    const evaluated = api.evaluateRecords([lower, higher], undefined, evaluatedAt);
    lower.analysis = evaluated[lower.listingId].result;
    higher.analysis = evaluated[higher.listingId].result;
    assert.equal(lower.analysis.bootstrap.signal, 'PURCHASE_FRICTION');
    assert.equal(higher.analysis.bootstrap.signal, 'PURCHASE_FRICTION');
    assert.ok(higher.analysis.bootstrap.severity > lower.analysis.bootstrap.severity);
    assert.deepEqual(plain(api.sortAnalysisRecords([lower, higher], 'priority').map((item) => item.listingId)), ['friction-higher', 'friction-lower']);
});

test('performance filters use rolling 30-day metrics rather than all-time counters', () => {
    const { api } = loadAnalyzer();
    const candidate = record('401', [snapshot('2026-08-01T12:00:00.000Z', { visits: 500, sales: 12, revenue: 300 })]);
    candidate.analysis = { lifecycle: 'ACTIVE_STABLE', diagnosis: 'HEALTHY_OR_MIXED', confidence: 80, code: 'monitor', derived: { visits30: 50, favorites30: 0, sales30: 0, revenue30: 0, renewals30: 0 } };
    const filters = { performance: 'traffic-no-sales' };
    assert.equal(api.recordMatchesAnalysisFilters(candidate, filters, '', new Set()), true);
    assert.equal(api.recordMatchesAnalysisFilters(candidate, { performance: 'sales' }, '', new Set()), false);

    const baseline = record('402', [snapshot('2026-08-01T12:00:00.000Z', { visits: 10, renewals: 2 })]);
    baseline.analysis = { lifecycle: 'BASELINE', diagnosis: 'DISCOVERY_WEAK', confidence: 39, code: 'improve', derived: { visits30: 10, favorites30: 0, sales30: null, revenue30: null, renewals30: null } };
    assert.equal(api.recordMatchesAnalysisFilters(baseline, { performance: 'missing' }, '', new Set()), false);
    assert.equal(api.recordMatchesAnalysisFilters(baseline, { recommendation: 'improve' }, '', new Set()), true);
    assert.equal(api.normalizeAnalysisFilters({ recommendation: 'not-valid' }).recommendation, '');

    const allZero = record('403', [snapshot('2026-08-01T12:00:00.000Z')]);
    allZero.analysis = api.evaluateRecord(allZero, [allZero], undefined, '2026-08-01T12:00:00.000Z').result;
    assert.equal(api.recordMatchesAnalysisFilters(allZero, { performance: 'no-activity' }, '', new Set()), true);

    const renewalWasteNoTraffic = record('403b', [snapshot('2026-08-01T12:00:00.000Z', { renewals: 2 })]);
    renewalWasteNoTraffic.analysis = api.evaluateRecord(renewalWasteNoTraffic, [renewalWasteNoTraffic], undefined, '2026-08-01T12:00:00.000Z').result;
    assert.equal(renewalWasteNoTraffic.analysis.bootstrap.signal, 'RENEWAL_WASTE');
    assert.equal(api.recordMatchesAnalysisFilters(renewalWasteNoTraffic, { performance: 'no-activity' }, '', new Set()), true);
    assert.equal(api.recordMatchesAnalysisFilters(renewalWasteNoTraffic, { performance: 'missing' }, '', new Set()), false);

    const trafficNeverSold = record('404', [snapshot('2026-08-01T12:00:00.000Z', { visits: 50 })]);
    trafficNeverSold.analysis = api.evaluateRecord(trafficNeverSold, [trafficNeverSold], undefined, '2026-08-01T12:00:00.000Z').result;
    assert.equal(api.recordMatchesAnalysisFilters(trafficNeverSold, { performance: 'traffic-no-sales' }, '', new Set()), true);

    const historicalSale = record('405', [snapshot('2026-08-01T12:00:00.000Z', { visits: 50, sales: 1, revenue: 20 })]);
    historicalSale.analysis = api.evaluateRecord(historicalSale, [historicalSale], undefined, '2026-08-01T12:00:00.000Z').result;
    assert.equal(api.recordMatchesAnalysisFilters(historicalSale, { performance: 'sales' }, '', new Set()), false);
    assert.equal(api.recordMatchesAnalysisFilters(historicalSale, { performance: 'missing' }, '', new Set()), true);
    assert.equal(api.recentPerformanceMetrics(historicalSale).sales, null);
});

test('analysis facet counts match the brute-force disjunctive reference in one record pass', () => {
    const { api } = loadAnalyzer();
    api.settingsRuntime.state.settings.language = 'tr';
    const at = '2026-08-01T12:00:00.000Z';
    const rows = [
        record('facet-sale-missing', [snapshot(at)], { title: 'İPEK IŞIK', sku: 'SATIŞ-1' }),
        record('facet-traffic', [snapshot(at)], { title: 'Trafik', sku: 'TR-2' }),
        record('facet-zero', [snapshot(at)], { title: 'Boş', sku: 'ZERO-3' }),
        record('facet-gap', [snapshot(at, { stock: null })], { title: 'Eksik', sku: 'GAP-4' }),
    ];
    rows[0].analysis = { lifecycle: 'ACTIVE_STABLE', diagnosis: 'HEALTHY_OR_MIXED', code: 'monitor', confidenceBand: 'veryHigh', deltas: { visits: 2 }, derived: { visits30: null, favorites30: null, sales30: 2, revenue30: 40 } };
    rows[1].analysis = { lifecycle: 'ACTIVE_STABLE', diagnosis: 'PURCHASE_FRICTION', code: 'improve', confidenceBand: 'medium', deltas: { visits: -2 }, derived: { visits30: 50, favorites30: 0, sales30: 0, revenue30: 0 } };
    rows[2].analysis = { lifecycle: 'DORMANT', diagnosis: 'DISCOVERY_WEAK', code: 'deactivateReview', confidenceBand: 'low', deltas: { visits: 0, favorites: 0 }, derived: { visits30: 0, favorites30: 0, sales30: 0, revenue30: 0 } };
    rows[3].analysis = { lifecycle: 'DATA_GAP', diagnosis: 'INSUFFICIENT_SIGNAL', code: 'waiting', confidenceBand: 'low', deltas: {}, derived: { visits30: null, favorites30: null, sales30: null, revenue30: null } };
    const filters = api.normalizeAnalysisFilters({ scope: 'page', lifecycle: 'ACTIVE_STABLE', recommendation: 'monitor', performance: 'sales', confidence: 'high' });
    const pageIds = new Set(rows.slice(0, 3).map((item) => item.listingId));
    const query = 'İPEK';
    const expected = Object.fromEntries(Object.entries(plain(api.filterFacetValues)).map(([facet, values]) => [facet, Object.fromEntries(values.map((value) => [
        value,
        rows.filter((candidate) => api.recordMatchesAnalysisFilters(candidate, { ...filters, [facet]: value }, query, pageIds)).length,
    ]))]));
    const diagnostics = {};
    const actual = plain(api.analysisFacetCounts(rows, filters, query, pageIds, diagnostics));
    assert.deepEqual(actual, expected);
    assert.equal(diagnostics.recordsScanned, rows.length);
    assert.deepEqual({
        scope: { all: actual.scope.all, page: actual.scope.page },
        lifecycle: { all: actual.lifecycle[''], stable: actual.lifecycle.ACTIVE_STABLE, dormant: actual.lifecycle.DORMANT },
        performance: { all: actual.performance[''], sales: actual.performance.sales, missing: actual.performance.missing, zero: actual.performance['no-activity'] },
        trend: { all: actual.trend[''], rising: actual.trend.rising, falling: actual.trend.falling },
        stock: { all: actual.stock[''], in: actual.stock.in, unknown: actual.stock.unknown },
        confidence: { all: actual.confidence[''], high: actual.confidence.high, low: actual.confidence.low },
    }, {
        scope: { all: 1, page: 1 },
        lifecycle: { all: 1, stable: 1, dormant: 0 },
        performance: { all: 1, sales: 1, missing: 1, zero: 0 },
        trend: { all: 1, rising: 1, falling: 0 },
        stock: { all: 1, in: 1, unknown: 0 },
        confidence: { all: 1, high: 1, low: 0 },
    });

    const overlapping = plain(api.analysisFacetCounts(rows, {}, '', pageIds));
    assert.equal(overlapping.performance.sales, 1);
    assert.equal(overlapping.performance.missing, 2);
    assert.equal(api.analysisCaseFold('İPEK IŞIK', 'tr'), 'ipek ışık');
    assert.equal(api.analysisCaseFold('I', 'en'), 'i');
    assert.equal(api.recordMatchesAnalysisFilters(rows[0], {}, 'ipek ışık', pageIds), true);
});

test('analysis search debounce executes only the latest scheduled render', async () => {
    const { api } = loadAnalyzer();
    const calls = [];
    let timer = null;
    timer = api.scheduleAnalysisSearch(timer, () => calls.push('first'));
    timer = api.scheduleAnalysisSearch(timer, () => calls.push('second'));
    api.scheduleAnalysisSearch(timer, () => calls.push('latest'));
    await new Promise((resolve) => setTimeout(resolve, 240));
    assert.deepEqual(calls, ['latest']);
});

test('cohort benchmark excludes stale peers and reports price-band fallback honestly', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const target = record('500', [
        snapshot('2026-07-02T12:00:00.000Z', { visits: 10, priceMin: 100, priceMax: 100 }),
        snapshot(evaluatedAt, { visits: 20, priceMin: 100, priceMax: 100 }),
    ]);
    const peers = Array.from({ length: 8 }, (_, index) => record(String(501 + index), [
        snapshot('2026-07-02T12:00:00.000Z', { visits: 10, priceMin: 10, priceMax: 10 }),
        snapshot(evaluatedAt, { visits: 20, priceMin: 10, priceMax: 10 }),
    ]));
    const fallback = api.evaluateRecord(target, [target, ...peers], undefined, evaluatedAt).result.benchmark;
    assert.equal(fallback.scope, 'active-shop');
    assert.equal(fallback.size, 8);
    assert.equal(fallback.reliable, true);

    const inactivePeer = record('598', [
        snapshot('2026-07-02T12:00:00.000Z', { visits: 10, priceMin: 100, priceMax: 100, listingState: 'inactive', statusLabel: 'Inactive' }),
        snapshot(evaluatedAt, { visits: 999, priceMin: 100, priceMax: 100, listingState: 'inactive', statusLabel: 'Inactive' }),
    ], { listingState: 'inactive', statusLabel: 'Inactive' });
    const withoutInactive = api.evaluateRecord(target, [target, ...peers, inactivePeer], undefined, evaluatedAt).result.benchmark;
    assert.equal(withoutInactive.size, 8);

    const stalePeer = record('599', [
        snapshot('2025-11-01T12:00:00.000Z', { visits: 10, priceMin: 100, priceMax: 100 }),
        snapshot('2025-12-01T12:00:00.000Z', { visits: 20, priceMin: 100, priceMax: 100 }),
    ]);
    const withoutStale = api.evaluateRecord(target, [target, stalePeer], undefined, evaluatedAt).result.benchmark;
    assert.equal(withoutStale.size, 0);
});

test('known cohort segments exclude mismatched listing type and seasonality', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const historyFor = (visits) => [
        snapshot('2026-07-02T12:00:00.000Z', { visits }),
        snapshot(evaluatedAt, { visits: visits + 5 }),
    ];
    const target = record('cohort-segment-target', historyFor(20), {
        listingType: 'physical', seasonality: 'non-seasonal',
    });
    const matching = Array.from({ length: 8 }, (_, index) => record(`cohort-segment-match-${index}`, historyFor(30 + index), {
        listingType: 'physical', seasonality: 'non-seasonal',
    }));
    const wrongType = Array.from({ length: 8 }, (_, index) => record(`cohort-segment-digital-${index}`, historyFor(100 + index), {
        listingType: 'digital', seasonality: 'non-seasonal',
    }));
    const wrongSeason = Array.from({ length: 8 }, (_, index) => record(`cohort-segment-seasonal-${index}`, historyFor(200 + index), {
        listingType: 'physical', seasonality: 'seasonal',
    }));
    const peers = [target, ...matching, ...wrongType, ...wrongSeason];
    const benchmark = api.evaluateRecord(target, peers, undefined, evaluatedAt).result.benchmark;
    assert.equal(benchmark.size, matching.length);
    assert.equal(benchmark.reliable, true);
    assert.match(benchmark.scope, /physical-non-seasonal$/);
    assert.deepEqual(plain(benchmark.limitations), []);
});

test('cohort eligibility, memberships, and sorted distributions are reused across equivalent targets', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const rows = Array.from({ length: 120 }, (_, index) => record(`cohort-scale-${index}`, [
        snapshot('2026-07-02T12:00:00.000Z', { visits: 20 + index, favorites: index % 5 }),
        snapshot(evaluatedAt, { visits: 25 + index, favorites: index % 5 }),
    ]));
    const { evaluations, diagnostics } = plain(api.evaluateRecordsWithDiagnostics(rows, undefined, evaluatedAt));
    assert.equal(Object.keys(evaluations).length, rows.length);
    assert.equal(evaluations[rows[0].listingId].result.benchmark.size, rows.length - 1);
    assert.equal(diagnostics.eligibilityScans, rows.length);
    assert.equal(diagnostics.eligibleCandidates, rows.length);
    assert.equal(diagnostics.groupAssignments, rows.length);
    assert.equal(diagnostics.groupBuilds, 1);
    assert.equal(diagnostics.membershipBuilds, 2);
    assert.equal(diagnostics.cohortMemberScans, rows.length);
    assert.equal(diagnostics.benchmarkBuilds, rows.length);
    assert.equal(diagnostics.distributionSorts, 5);
});

test('an eight-listing cohort is usable without claiming full statistical strength', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const peers = Array.from({ length: 9 }, (_, index) => record(`cohort-strength-${index}`, [
        snapshot('2026-07-02T12:00:00.000Z', { visits: 25 + index, favorites: 1 }),
        snapshot(evaluatedAt, { visits: 30 + index, favorites: 1 }),
    ]));
    const result = api.evaluateRecord(peers[0], peers, undefined, evaluatedAt).result;
    assert.equal(result.benchmark.reliable, true);
    assert.equal(result.confidenceComponents.cohortStrength, 4);
    assert.ok(result.confidenceComponents.cohortStrength < 100);
});

test('cohort influence ramps continuously from eight peers to full strength', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const historyFor = (visits, favorites) => [
        snapshot('2026-07-02T12:00:00.000Z', { visits, favorites }),
        snapshot(evaluatedAt, { visits, favorites }),
    ];
    const target = record('cohort-ramp-target', historyFor(20, 1));
    const peers = Array.from({ length: 30 }, (_, index) => record(`cohort-ramp-peer-${index}`, historyFor(100 + index, 10)));
    const withSeven = api.evaluateRecord(target, [target, ...peers.slice(0, 7)], undefined, evaluatedAt).result;
    const withEight = api.evaluateRecord(target, [target, ...peers.slice(0, 8)], undefined, evaluatedAt).result;
    const withFifteen = api.evaluateRecord(target, [target, ...peers.slice(0, 15)], undefined, evaluatedAt).result;
    const withThirty = api.evaluateRecord(target, [target, ...peers], undefined, evaluatedAt).result;
    assert.equal(withSeven.benchmark.reliable, false);
    assert.equal(withSeven.benchmark.strength, 0);
    assert.equal(withSeven.confidenceComponents.cohortStrength, 0);
    assert.equal(withEight.benchmark.reliable, true);
    assert.ok(Math.abs(withEight.benchmark.strength - (1 / 23)) < 1e-12);
    assert.equal(withEight.confidenceComponents.cohortStrength, 4);
    assert.ok(withEight.benchmark.strength < withFifteen.benchmark.strength);
    assert.ok(withFifteen.benchmark.strength < withThirty.benchmark.strength);
    assert.equal(withThirty.benchmark.strength, 1);
    assert.ok(Math.abs(withEight.score - withSeven.score) <= 3);
    assert.equal(withEight.diagnosis, withSeven.diagnosis);
});

test('cohort favorite percentiles smooth low-traffic outliers', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const lowTraffic = record('cohort-low-traffic', [snapshot('2026-07-02T12:00:00.000Z', { visits: 1, favorites: 1 }), snapshot(evaluatedAt, { visits: 1, favorites: 1 })]);
    const stableTraffic = record('cohort-stable-traffic', [snapshot('2026-07-02T12:00:00.000Z', { visits: 100, favorites: 10 }), snapshot(evaluatedAt, { visits: 100, favorites: 10 })]);
    const fillers = Array.from({ length: 7 }, (_, index) => record(`cohort-filler-${index}`, [
        snapshot('2026-07-02T12:00:00.000Z', { visits: 100, favorites: 4 + (index % 2) }),
        snapshot(evaluatedAt, { visits: 100, favorites: 4 + (index % 2) }),
    ]));
    const peers = [lowTraffic, stableTraffic, ...fillers];
    const lowResult = api.evaluateRecord(lowTraffic, peers, undefined, evaluatedAt).result;
    const stableResult = api.evaluateRecord(stableTraffic, peers, undefined, evaluatedAt).result;
    assert.equal(lowResult.benchmark.metrics.favoriteRate.reliable, true);
    assert.ok(stableResult.benchmark.metrics.favoriteRate.percentile > lowResult.benchmark.metrics.favoriteRate.percentile);
});

test('non-active Etsy states are never treated as active health or cohort candidates', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    for (const listingState of ['draft', 'expired', 'sold_out', 'inactive']) {
        const candidate = record(`state-${listingState}`, [
            snapshot('2026-06-02T12:00:00.000Z', { visits: 10, listingState, statusLabel: listingState }),
            snapshot('2026-07-02T12:00:00.000Z', { visits: 10, listingState, statusLabel: listingState }),
            snapshot(evaluatedAt, { visits: 10, listingState, statusLabel: listingState }),
        ], { listingState, statusLabel: listingState });
        assert.equal(api.evaluateRecord(candidate, [candidate], undefined, evaluatedAt).result.lifecycle, 'INACTIVE');
    }
    const conflicted = record('state-conflict', [
        snapshot('2026-06-02T12:00:00.000Z'),
        snapshot('2026-07-02T12:00:00.000Z'),
        snapshot(evaluatedAt, { listingState: 'inactive', statusLabel: 'Inactive' }),
    ]);
    assert.equal(api.evaluateRecord(conflicted, [conflicted], undefined, evaluatedAt).result.lifecycle, 'DATA_GAP');
});

test('sparse cohort metrics never drive a percentile diagnosis from one sample', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const target = record('600', [
        snapshot('2026-06-02T12:00:00.000Z', { visits: 500 }),
        snapshot('2026-07-02T12:00:00.000Z', { visits: 500 }),
        snapshot(evaluatedAt, { visits: 500, favorites: 25, sales: 1 }),
    ]);
    const peers = Array.from({ length: 8 }, (_, index) => record(String(601 + index), [
        snapshot('2026-07-02T12:00:00.000Z', { visits: index === 0 ? 500 : 0, favorites: index === 0 ? 25 : 0 }),
        snapshot(evaluatedAt, { visits: index === 0 ? 500 : 0, favorites: index === 0 ? 25 : 0 }),
    ]));
    const result = api.evaluateRecord(target, [target, ...peers], undefined, evaluatedAt).result;
    assert.equal(result.benchmark.size, 8);
    assert.equal(result.benchmark.metrics.salesRateProxy.samples, 1);
    assert.equal(result.benchmark.metrics.salesRateProxy.reliable, false);
    assert.equal(result.diagnosis, 'HEALTHY_OR_MIXED');
});

test('record refresh evaluates the completed collection together and isolates outside history', async () => {
    const { api, storage } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const runtime = api.collectionRuntime;
    const scoped = Array.from({ length: 9 }, (_, index) => record(String(650 + index), [
        snapshot('2026-07-02T12:00:00.000Z', { visits: 100 }),
        snapshot(evaluatedAt, { visits: 120, favorites: 6 }),
    ]));
    const outside = record('699', [
        snapshot('2025-11-01T12:00:00.000Z', { visits: 1 }),
        snapshot('2025-12-01T12:00:00.000Z', { visits: 999, favorites: 999 }),
    ]);
    const all = [...scoped, outside];
    storage.set(runtime.KEYS.index, all.map((item) => item.listingId));
    all.forEach((item) => storage.set(runtime.KEYS.record(item.listingId), item));
    const refreshed = await api.refreshRecords({ scopeIds: scoped.map((item) => item.listingId), evaluatedAt });
    const target = refreshed.find((item) => item.listingId === '650');
    const isolated = refreshed.find((item) => item.listingId === '699');
    assert.equal(target.analysis.benchmark.size, 8);
    assert.equal(isolated.analysis.benchmark.size, 0);
});

test('record refresh persists a stale health-engine result before later fenced actions', async () => {
    const { api, storage } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const runtime = api.collectionRuntime;
    const candidate = record('engine-migration', [snapshot(evaluatedAt, { renewals: 2 })]);
    candidate.health = plain(api.evaluateRecord(candidate, [candidate], undefined, evaluatedAt));
    candidate.health.engineVersion = api.versions.engine - 1;
    candidate.health.result = { ...candidate.health.result, code: 'waiting', bootstrap: null, score: null };
    candidate.analysis = candidate.health.result;
    storage.set(runtime.KEYS.index, [candidate.listingId]);
    storage.set(runtime.KEYS.record(candidate.listingId), candidate);

    const refreshed = await api.refreshRecords({ scopeIds: [candidate.listingId], evaluatedAt, render: false });
    const inMemory = refreshed[0];
    const persisted = storage.get(runtime.KEYS.record(candidate.listingId));
    assert.equal(inMemory.health.engineVersion, api.versions.engine);
    assert.equal(inMemory.analysis.bootstrap.signal, 'RENEWAL_WASTE');
    assert.equal(inMemory.analysis.code, 'improve');
    assert.equal(persisted.health.engineVersion, api.versions.engine);
    assert.equal(persisted.analysis.bootstrap.signal, 'RENEWAL_WASTE');
    assert.equal(persisted.analysis.code, 'improve');
    assert.equal(persisted.analysis.score, 0);
    const withProposal = await runtime.Store.saveProposal(candidate.listingId, { action: 'SKIP', reason: 'migration fence' });
    assert.equal(withProposal.proposal.basis.engineVersion, api.versions.engine);
    assert.equal(withProposal.health.engineVersion, api.versions.engine);
    assert.equal(withProposal.analysis.code, 'improve');
});

test('optional zero-traffic cohort metrics do not suppress deactivation review', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const makeDormant = (id) => record(id, [
        snapshot('2026-06-02T12:00:00.000Z', { renewals: 0 }),
        snapshot('2026-07-02T12:00:00.000Z', { renewals: 2 }),
        snapshot(evaluatedAt, { renewals: 4 }),
    ], { seasonal: false });
    const target = makeDormant('700');
    const single = api.evaluateRecord(target, [target], undefined, evaluatedAt).result;
    const peers = Array.from({ length: 7 }, (_, index) => makeDormant(String(701 + index)));
    const grouped = api.evaluateRecord(target, [target, ...peers], undefined, evaluatedAt).result;
    assert.equal(single.lifecycle, 'DEACTIVATION_REVIEW');
    assert.equal(grouped.lifecycle, 'DEACTIVATION_REVIEW');
    assert.ok(single.confidence >= 80);
    assert.ok(grouped.confidence >= 80);
});

test('threshold calibration and impact exclude stale rows and use rolling sales', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const fresh = Array.from({ length: 4 }, (_, index) => record(String(800 + index), [
        snapshot('2026-07-02T12:00:00.000Z', { visits: 40, sales: 12 }),
        snapshot(evaluatedAt, { visits: 50, sales: 12 }),
    ]));
    const stale = Array.from({ length: 4 }, (_, index) => record(String(804 + index), [
        snapshot('2026-07-02T12:00:00.000Z', { visits: 40 }),
        snapshot(evaluatedAt, { visits: 999, observedAt: { visits: '2026-08-01T10:00:00.000Z' } }),
    ]));
    const calibration = plain(api.thresholdCalibration([...fresh, ...stale], evaluatedAt));
    assert.deepEqual(calibration, { available: false, sampleSize: 4, values: null });
    const impact = plain(api.thresholdImpactCounts([...fresh, ...stale], { minVisitsToImprove: 20, minVisitsToProtect: 60 }, evaluatedAt));
    assert.deepEqual(impact, { improve: 4, protect: 0 });
});

test('threshold calibration requires twenty clean rows and excludes recent experiments', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const clean = Array.from({ length: 20 }, (_, index) => record(`calibration-clean-${index}`, [
        snapshot('2026-07-02T12:00:00.000Z', { visits: 10 + index, sales: 0 }),
        snapshot(evaluatedAt, { visits: 20 + index * 3, sales: index >= 10 ? 1 : 0 }),
    ]));
    const experiment = record('calibration-experiment', [
        snapshot('2026-07-02T12:00:00.000Z', { visits: 30 }),
        snapshot(evaluatedAt, { visits: 300 }),
    ]);
    experiment.improvements.push({
        id: 'experiment', action: 'UPDATE', status: 'published', publishedAt: '2026-07-20T12:00:00.000Z', fields: ['title'],
        experiment: { state: 'observing', evaluateAt: '2026-08-19T12:00:00.000Z' },
    });
    const recent = record('calibration-recent', [
        snapshot('2026-07-02T12:00:00.000Z', { visits: 30 }),
        snapshot(evaluatedAt, { visits: 400 }),
    ]);
    recent.improvements.push({
        id: 'recent', action: 'UPDATE', status: 'published', publishedAt: '2026-07-20T12:00:00.000Z', fields: ['title'],
        experiment: { state: 'winner', evaluatedAt: '2026-07-31T12:00:00.000Z' },
    });
    const nineteen = plain(api.thresholdCalibration(clean.slice(0, 19), evaluatedAt));
    assert.deepEqual(nineteen, { available: false, sampleSize: 19, values: null });
    const calibrated = plain(api.thresholdCalibration([...clean, experiment, recent], evaluatedAt));
    assert.equal(calibrated.available, true);
    assert.equal(calibrated.sampleSize, 20);
    assert.ok(calibrated.values.minVisitsToImprove >= 10);
    assert.ok(calibrated.values.minVisitsToProtect > calibrated.values.minVisitsToImprove);
    assert.deepEqual(plain(api.thresholdImpactCounts(clean, {
        minVisitsToImprove: 'broken', minVisitsToProtect: '', minRenewalsToReview: {}, declinePercent: Number.NaN,
    }, evaluatedAt)), { improve: 10, protect: 6 });
});

test('calibration falls back per sparse subgroup and central policy repairs contradictory thresholds', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const clean = Array.from({ length: 20 }, (_, index) => record(`calibration-group-${index}`, [
        snapshot('2026-07-02T12:00:00.000Z', { visits: index === 0 ? 100 : 20, sales: 0, renewals: 0 }),
        snapshot(evaluatedAt, { visits: index === 0 ? 41 : 20, sales: 0, renewals: index === 0 ? 10 : 0 }),
    ]));
    const calibration = plain(api.thresholdCalibration(clean, evaluatedAt));
    assert.equal(calibration.available, true);
    assert.equal(calibration.groupSizes.declines, 1);
    assert.equal(calibration.groupSizes.dormantRenewals, 0);
    assert.equal(calibration.calibratedFields.declinePercent, false);
    assert.equal(calibration.calibratedFields.minRenewalsToReview, false);
    assert.equal(calibration.values.declinePercent, 35);
    assert.equal(calibration.values.minRenewalsToReview, 2);

    const normalized = plain(api.normalizeHealthThresholds({
        minVisitsToImprove: 100,
        minVisitsToProtect: 10,
        minRenewalsToReview: 0,
        declinePercent: 999,
    }));
    assert.deepEqual(normalized, {
        minVisitsToImprove: 100,
        minVisitsToProtect: 101,
        minRenewalsToReview: 1,
        declinePercent: 100,
    });
    assert.deepEqual(plain(api.normalizeHealthThresholds({
        minVisitsToImprove: 'broken', minVisitsToProtect: '', minRenewalsToReview: {}, declinePercent: Number.NaN,
    })), {
        minVisitsToImprove: 20,
        minVisitsToProtect: 60,
        minRenewalsToReview: 2,
        declinePercent: 35,
    });
    const candidate = record('policy-repair', [snapshot(evaluatedAt, { visits: 50 })]);
    const evaluated = api.evaluateRecord(candidate, [candidate], { minVisitsToImprove: 100, minVisitsToProtect: 10 }, evaluatedAt);
    assert.equal(evaluated.policy.thresholds.minVisitsToImprove, 100);
    assert.equal(evaluated.policy.thresholds.minVisitsToProtect, 101);
});

test('decline calibration uses the same exact non-overlapping trend population as lifecycle decisions', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-31T12:00:00.000Z';
    const atDaysAgo = (days) => new Date(Date.parse(evaluatedAt) - days * 86400000).toISOString();
    const rows = (days) => Array.from({ length: 20 }, (_, index) => record(`decline-calibration-${days}-${index}`, [
        snapshot(atDaysAgo(days), { visits: 100 }),
        snapshot(evaluatedAt, { visits: index < 10 ? 40 + index : 100 }),
    ]));
    const overlapping = plain(api.thresholdCalibration(rows(29), evaluatedAt));
    assert.equal(overlapping.available, true);
    assert.equal(overlapping.groupSizes.declines, 0);
    assert.equal(overlapping.calibratedFields.declinePercent, false);
    assert.equal(overlapping.values.declinePercent, 35);

    const exact = plain(api.thresholdCalibration(rows(30), evaluatedAt));
    assert.equal(exact.available, true);
    assert.equal(exact.groupSizes.declines, 10);
    assert.equal(exact.calibratedFields.declinePercent, true);
    assert.ok(exact.values.declinePercent >= 51 && exact.values.declinePercent <= 60);
});

test('collection scope ignores pagination and tracking drift but preserves analysis filters', () => {
    const { api } = loadAnalyzer();
    const shopRoot = { querySelectorAll: () => [{ href: 'https://www.etsy.com/shop/FixtureShop' }] };
    assert.equal(api.currentShopKey(shopRoot), 'etsy-shop:fixtureshop');
    assert.equal(api.currentShopKey({ querySelectorAll: () => [{ href: 'https://evil.example/shop/FixtureShop' }] }), '');
    assert.equal(api.currentShopKey({ querySelectorAll: () => [
        { href: 'https://www.etsy.com/shop/FixtureShop' },
        { href: 'https://www.etsy.com/shop/AnotherShop' },
    ] }), '');
    const selectedStateInput = (value) => ({
        value,
        checked: false,
        getAttribute: () => null,
        matches: () => false,
        closest: () => ({ getAttribute: () => null, querySelector: () => ({}) }),
    });
    assert.equal(api.pageListingState({ querySelectorAll: () => [selectedStateInput('active')] }), 'active');
    assert.equal(api.pageListingState({ querySelectorAll: () => [selectedStateInput('inactive')] }), 'inactive');
    const shopKey = 'etsy-shop:fixture';
    const first = api.collectionScopeKey('https://www.etsy.com/your/shops/me/tools/listings?stats=true&page=1&ref=seller-platform-mcnav&utm_source=x', shopKey, 'active');
    const next = api.collectionScopeKey('https://www.etsy.com/your/shops/me/tools/listings?page=2&stats=true', shopKey, 'active');
    const different = api.collectionScopeKey('https://www.etsy.com/your/shops/me/tools/listings?stats=false&page=2', shopKey, 'active');
    assert.equal(first, next);
    assert.notEqual(first, different);
    assert.notEqual(first, api.collectionScopeKey('https://www.etsy.com/your/shops/me/tools/listings?stats=true', shopKey, 'inactive'));
    assert.equal(api.collectionScopeKey('https://www.etsy.com/your/shops/me/tools/listings', '', 'active'), '');
    let hydrated = false;
    const delayedRoot = { querySelectorAll: (selector) => {
        if (!hydrated) return [];
        return selector.includes('item_status') ? [selectedStateInput('active')] : [{ href: 'https://www.etsy.com/shop/FixtureShop' }];
    } };
    const delayedCollection = { scopeKey: api.collectionScopeKey('https://www.etsy.com/your/shops/me/tools/listings?stats=true', 'etsy-shop:fixtureshop', 'active') };
    assert.equal(api.collectionScopeMatches(delayedCollection, 'https://www.etsy.com/your/shops/me/tools/listings?stats=true&page=2', delayedRoot), false);
    hydrated = true;
    assert.equal(api.collectionScopeMatches(delayedCollection, 'https://www.etsy.com/your/shops/me/tools/listings?stats=true&page=2', delayedRoot), true);
});

test('collection conflict detection catches both exact repeats and partial cross-page overlap', () => {
    const { api } = loadAnalyzer();
    assert.equal(api.pageIdentityMatchesCollection({ valid: true, current: 1, total: 1 }, { totalPages: 17 }), false);
    assert.equal(api.pageIdentityMatchesCollection({ valid: true, current: 1, total: 17 }, { totalPages: 17 }), true);
    const ids = (start, count) => Array.from({ length: count }, (_, index) => ({ listingId: String(start + index) }));
    const first = ids(1, 40);
    const collection = { metricContractId, pages: { 1: { metricContractId, contentSignature: api.ListingPageAdapter.contentSignature(first), ids: first.map((item) => item.listingId), count: 40 } }, uniqueIds: first.map((item) => item.listingId) };
    collection.pages[1].signature = api.ListingPageAdapter.pageSignature(first, 1);
    assert.equal(api.collectionPageMatchesManifest(collection, { pageInfo: { current: 1 }, listings: ids(21, 40), metricContractId }), false);
    assert.equal(api.collectionPageMatchesManifest(collection, { pageInfo: { current: 1 }, listings: [...first].reverse(), metricContractId }), true);
    const exact = plain(api.collectionPageConflict(collection, { pageInfo: { current: 2 }, listings: [...first].reverse() }));
    assert.deepEqual(exact, { repeated: true, overlap: true });
    const partial = plain(api.collectionPageConflict(collection, { pageInfo: { current: 2 }, listings: ids(21, 40) }));
    assert.deepEqual(partial, { repeated: false, overlap: true });
    const clean = plain(api.collectionPageConflict(collection, { pageInfo: { current: 2 }, listings: ids(41, 40) }));
    assert.deepEqual(clean, { repeated: false, overlap: false });
});

test('legacy collections are invalidated and current collection peers can be isolated exactly', () => {
    const { api } = loadAnalyzer();
    const now = new Date().toISOString();
    const legacy = api.normalizeCollection({ schema: 1, id: 'old', status: 'completed', completedAt: now, totalPages: 1, pages: { 1: { ids: ['1'], count: 1, capturedAt: now } }, uniqueIds: ['1'] });
    assert.equal(legacy.status, 'blocked');
    assert.equal(legacy.legacySchema, true);
    assert.equal(api.collectionIsFresh(legacy, Date.now(), { scopeKey: '/scope', totalPages: 1 }), false);

    const previousRelease = api.normalizeCollection({
        schema: 3, id: 'v1.2.0-completed', status: 'completed', scopeKey: '/scope', metricContractId,
        completedAt: now, totalPages: 1,
        pages: { 1: { signature: '1|1|1', contentSignature: '1', ids: ['1'], count: 1, capturedAt: now, metricContractId } },
        uniqueIds: ['1'],
    });
    assert.equal(previousRelease.status, 'blocked');
    assert.equal(previousRelease.completedAt, null);
    assert.equal(previousRelease.legacySchema, true);
    assert.equal(api.collectionIsFresh(previousRelease, Date.now(), { scopeKey: '/scope', totalPages: 1 }), false);

    const current = api.normalizeCollection({ schema: api.versions.collectionSchema, id: 'new', status: 'completed', scopeKey: '/scope', metricContractId, completedAt: now, totalPages: 1, pages: { 1: { signature: '1|1|1', contentSignature: '1', ids: ['1'], count: 1, capturedAt: now, metricContractId } }, uniqueIds: ['1'] });
    assert.equal(api.collectionIsFresh(current, Date.now(), { scopeKey: '/scope', totalPages: 1 }), true);
    assert.deepEqual(Array.from(api.evaluationScopeRecords([record('1', []), record('2', [])], ['2']), (item) => item.listingId), ['2']);
    api.collectionRuntime.state.collection = current;
    const identity = plain(api.currentCollectionIdentity());
    assert.equal(identity.metricContractId, metricContractId);
    assert.equal(identity.writeRevision, 0);
    assert.match(identity.manifestFingerprint, /^[0-9a-f]{8}$/);
    current.pages['1'].capturedAt = new Date(Date.parse(now) + 3600000).toISOString();
    const recapturedIdentity = plain(api.currentCollectionIdentity());
    assert.notEqual(recapturedIdentity.manifestFingerprint, identity.manifestFingerprint);
    current.pages['1'].capturedAt = now;
    current.pages['1'].signature = '1|1|tampered';
    const tamperedIdentity = plain(api.currentCollectionIdentity());
    assert.notEqual(tamperedIdentity.manifestFingerprint, identity.manifestFingerprint);

    const firstIds = Array.from({ length: 40 }, (_, index) => String(index + 1));
    const lastIds = ['40', '41'];
    const firstContent = [...firstIds].sort().join('\u001f');
    const lastContent = [...lastIds].sort().join('\u001f');
    const malformed = api.normalizeCollection({
        schema: api.versions.collectionSchema,
        id: 'overlap',
        status: 'completed',
        scopeKey: '/scope',
        metricContractId,
        completedAt: now,
        totalPages: 2,
        pages: {
            1: { signature: `1|40|${firstContent}`, contentSignature: firstContent, ids: firstIds, count: 40, capturedAt: now, metricContractId },
            2: { signature: `2|2|${lastContent}`, contentSignature: lastContent, ids: lastIds, count: 2, capturedAt: now, metricContractId },
        },
        uniqueIds: [...firstIds, '41'],
        duplicateCount: 0,
    });
    assert.equal(api.collectionManifestIsComplete(malformed), false);
    assert.equal(api.collectionIsFresh(malformed, Date.now(), { scopeKey: '/scope', totalPages: 2 }), false);
});

test('collection writes use revision and canonical manifest compare-and-swap fences', async () => {
    const { api, storage } = loadAnalyzer();
    const runtime = api.collectionRuntime;
    const now = new Date().toISOString();
    const base = api.normalizeCollection({
        schema: api.versions.collectionSchema, id: 'collection-cas', writeRevision: 4, status: 'running', scopeKey: '/scope',
        metricContractId, startedAt: now, updatedAt: now, expectedPage: 2, totalPages: 2,
        pages: { 1: { signature: '1|1|1', contentSignature: '1', ids: ['1'], count: 1, capturedAt: now, metricContractId } },
        uniqueIds: ['1'], duplicateCount: 0, leaseToken: '', failureReports: [],
    });
    runtime.state.collection = base;
    storage.set(runtime.KEYS.collection, plain(base));
    const identity = plain(api.currentCollectionIdentity());
    const saved = await runtime.Store.saveCollection({ ...base, status: 'paused', updatedAt: new Date(Date.parse(now) + 1000).toISOString() }, {
        id: base.id, token: '', writeRevision: 4, manifestFingerprint: identity.manifestFingerprint,
    });
    assert.equal(saved.writeRevision, 5);
    assert.equal(saved.status, 'paused');

    const staleLocal = plain(saved);
    runtime.state.collection = api.normalizeCollection(staleLocal);
    const staleIdentity = plain(api.currentCollectionIdentity());
    const remoteRevision = { ...staleLocal, writeRevision: 6, status: 'blocked' };
    storage.set(runtime.KEYS.collection, plain(remoteRevision));
    await assert.rejects(
        runtime.Store.saveCollection({ ...staleLocal, status: 'running' }, {
            id: staleLocal.id, token: staleLocal.leaseToken, writeRevision: staleLocal.writeRevision,
            manifestFingerprint: staleIdentity.manifestFingerprint,
        }),
        (error) => error?.code === 'COLLECTION_LEASE_LOST',
    );
    assert.deepEqual(plain(storage.get(runtime.KEYS.collection)), plain(remoteRevision));

    storage.set(runtime.KEYS.collection, plain(staleLocal));
    const sameRevisionManifestDrift = plain(staleLocal);
    sameRevisionManifestDrift.pages['1'].capturedAt = new Date(Date.parse(now) + 2000).toISOString();
    storage.set(runtime.KEYS.collection, sameRevisionManifestDrift);
    await assert.rejects(
        runtime.Store.saveCollection({ ...staleLocal, status: 'running' }, {
            id: staleLocal.id, token: staleLocal.leaseToken, writeRevision: staleLocal.writeRevision,
            manifestFingerprint: staleIdentity.manifestFingerprint,
        }),
        (error) => error?.code === 'COLLECTION_LEASE_LOST',
    );
    assert.deepEqual(plain(storage.get(runtime.KEYS.collection)), sameRevisionManifestDrift);
});

test('collection resume reloads the newer stored manifest before calculating its next page', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const runtime = api.collectionRuntime;
    const now = new Date().toISOString();
    sandbox.location.pathname = '/your/shops/shop-one/tools/listings';
    sandbox.location.search = '?stats=true&item_status=active';
    sandbox.location.href = `https://www.etsy.com${sandbox.location.pathname}${sandbox.location.search}`;
    const originalQuerySelectorAll = sandbox.document.querySelectorAll;
    sandbox.document.querySelectorAll = (selector) => {
        if (selector.includes('[data-seller-nav="true"]')) return [{ href: 'https://www.etsy.com/shop/ShopOne' }];
        if (selector.includes('input[name="item_status"]')) return [{ value: 'active', checked: true, closest: () => null, getAttribute: () => null, matches: () => true }];
        return [];
    };
    const scopeKey = api.collectionScopeKey(sandbox.location.href, 'etsy-shop:shopone', 'active');
    const page = (number) => ({
        signature: `${number}|1|${number}`, contentSignature: String(number), ids: [String(number)], count: 1,
        capturedAt: now, metricContractId,
    });
    const local = api.normalizeCollection({
        schema: api.versions.collectionSchema, id: 'collection-resume-fresh', writeRevision: 4, status: 'paused', scopeKey,
        metricContractId, startedAt: now, updatedAt: now, stoppedAt: now, expectedPage: 2, totalPages: 3,
        pages: { 1: page(1) }, uniqueIds: ['1'], duplicateCount: 0, leaseToken: '', failureReports: [],
    });
    const stored = api.normalizeCollection({
        ...local, writeRevision: 5, pages: { 1: page(1), 2: page(2) }, uniqueIds: ['1', '2'], expectedPage: 3,
        updatedAt: new Date(Date.parse(now) + 1000).toISOString(),
    });
    runtime.state.collection = local;
    storage.set(runtime.KEYS.collection, plain(stored));
    const originalReadStable = api.ListingPageAdapter.readStable;
    const originalRun = runtime.Collection.run;
    api.ListingPageAdapter.readStable = async () => ({ pageInfo: { current: 2, total: 3, valid: true }, metricContractId, listings: [{ listingId: '2' }] });
    runtime.Collection.run = async () => runtime.state.collection;
    try {
        const resumed = await runtime.Collection.resumeOnce();
        assert.equal(resumed.status, 'running');
        assert.equal(resumed.expectedPage, 3);
        assert.deepEqual(Object.keys(plain(resumed.pages)).sort(), ['1', '2']);
        assert.deepEqual(plain(resumed.uniqueIds), ['1', '2']);
        assert.equal(resumed.writeRevision, 7);
        assert.equal(plain(storage.get(runtime.KEYS.collection)).writeRevision, 7);
    } finally {
        api.ListingPageAdapter.readStable = originalReadStable;
        runtime.Collection.run = originalRun;
        await runtime.CollectionLease.release();
        sandbox.document.querySelectorAll = originalQuerySelectorAll;
    }
});

test('collection resume cannot claim or rewrite a same-id run already completed by another tab', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const runtime = api.collectionRuntime;
    const now = new Date().toISOString();
    sandbox.location.pathname = '/your/shops/shop-one/tools/listings';
    sandbox.location.search = '?stats=true&item_status=active';
    sandbox.location.href = `https://www.etsy.com${sandbox.location.pathname}${sandbox.location.search}`;
    const originalQuerySelectorAll = sandbox.document.querySelectorAll;
    sandbox.document.querySelectorAll = (selector) => {
        if (selector.includes('[data-seller-nav="true"]')) return [{ href: 'https://www.etsy.com/shop/ShopOne' }];
        if (selector.includes('input[name="item_status"]')) return [{ value: 'active', checked: true, closest: () => null, getAttribute: () => null, matches: () => true }];
        return [];
    };
    const scopeKey = api.collectionScopeKey(sandbox.location.href, 'etsy-shop:shopone', 'active');
    const listingId = '9900000000000188';
    const page = {
        signature: `1|1|${listingId}`, contentSignature: listingId, ids: [listingId], count: 1,
        capturedAt: now, metricContractId,
    };
    const local = api.normalizeCollection({
        schema: api.versions.collectionSchema, id: 'collection-resume-completed-elsewhere', writeRevision: 4,
        status: 'paused', scopeKey, metricContractId, startedAt: now, updatedAt: now, stoppedAt: now,
        expectedPage: 1, totalPages: 1, pages: { 1: page }, uniqueIds: [listingId], duplicateCount: 0,
        leaseToken: '', failureReports: [],
    });
    const stored = api.normalizeCollection({
        ...local, writeRevision: 5, status: 'completed', completedAt: new Date(Date.parse(now) + 1000).toISOString(),
        updatedAt: new Date(Date.parse(now) + 1000).toISOString(),
    });
    const pendingAi = {
        'air-pending-completed-elsewhere': {
            collectionId: stored.id, scopeKey: stored.scopeKey, writeRevision: stored.writeRevision,
            manifestFingerprint: 'completed-manifest-must-remain-unchanged',
        },
    };
    runtime.state.collection = local;
    storage.set(runtime.KEYS.collection, plain(stored));
    storage.set(runtime.KEYS.aiRequests, plain(pendingAi));
    const originalReadStable = api.ListingPageAdapter.readStable;
    const originalRun = runtime.Collection.run;
    let runCalls = 0;
    api.ListingPageAdapter.readStable = async () => ({
        pageInfo: { current: 1, total: 1, valid: true }, metricContractId, listings: [{ listingId }],
    });
    runtime.Collection.run = async () => { runCalls += 1; return runtime.state.collection; };
    const storedBefore = plain(storage.get(runtime.KEYS.collection));
    try {
        assert.equal(await runtime.Collection.resumeOnce(), null);
        assert.equal(runCalls, 0);
        assert.deepEqual(plain(storage.get(runtime.KEYS.collection)), storedBefore);
        assert.deepEqual(plain(storage.get(runtime.KEYS.aiRequests)), pendingAi);
        assert.equal(storage.has(runtime.KEYS.collectionLease), false);
    } finally {
        api.ListingPageAdapter.readStable = originalReadStable;
        runtime.Collection.run = originalRun;
        sandbox.document.querySelectorAll = originalQuerySelectorAll;
    }
});

test('collection acquire rejects a replaced collection id without leaving a lease claim', async () => {
    const { api, storage } = loadAnalyzer();
    const runtime = api.collectionRuntime;
    const now = new Date().toISOString();
    const local = api.normalizeCollection({ schema: api.versions.collectionSchema, id: 'collection-a', status: 'paused', startedAt: now, updatedAt: now, totalPages: 1, pages: {}, uniqueIds: [] });
    const replacement = api.normalizeCollection({ ...local, id: 'collection-b', writeRevision: 3 });
    runtime.state.collection = local;
    storage.set(runtime.KEYS.collection, plain(replacement));
    assert.equal(await runtime.CollectionLease.acquire({ expectedCollectionId: local.id }), false);
    assert.equal(storage.has(runtime.KEYS.collectionLease), false);
    assert.equal(plain(storage.get(runtime.KEYS.collection)).id, 'collection-b');
});

test('action queues and full collection mutually exclude their complete lifecycles', async () => {
    const { api, storage } = loadAnalyzer();
    const collectionRuntime = api.collectionRuntime;
    const actionRuntime = api.actionRuntime;
    const now = new Date().toISOString();
    const running = api.normalizeCollection({
        schema: api.versions.collectionSchema, id: 'collection-lifecycle-interlock', status: 'running',
        scopeKey: 'etsy-shop:shopone|status:active|/your/shops/me/tools/listings?item_status=active&stats=true',
        metricContractId, startedAt: now, updatedAt: now, expectedPage: 1, totalPages: 1,
        pages: {}, uniqueIds: [], duplicateCount: 0, leaseToken: '', failureReports: [],
    });

    assert.equal(await actionRuntime.Lease.acquire(), true);
    assert.equal(await collectionRuntime.CollectionLease.acquire(), false);
    assert.equal(storage.has(collectionRuntime.KEYS.collectionLease), false);
    await actionRuntime.Lease.release();

    collectionRuntime.state.collection = running;
    storage.set(collectionRuntime.KEYS.collection, plain(running));
    assert.equal(await collectionRuntime.CollectionLease.acquire({ expectedCollectionId: running.id }), true);
    assert.equal(await actionRuntime.Lease.acquire(), false);
    assert.equal(storage.has(actionRuntime.KEYS.lease), false);
    await assert.rejects(
        actionRuntime.Queue.create([], null),
        (error) => error?.code === 'COLLECTION_ACTIVE',
    );
    await collectionRuntime.CollectionLease.release();

    const completed = {
        ...plain(collectionRuntime.state.collection), status: 'completed', completedAt: now, updatedAt: now,
    };
    collectionRuntime.state.collection = api.normalizeCollection(completed);
    storage.set(collectionRuntime.KEYS.collection, plain(completed));
    storage.set(collectionRuntime.KEYS.collectionLease, {
        owner: 'expired-owner', instanceId: 'expired-page', token: 'expired-collection-lease', expiresAt: Date.now() - 1,
    });
    assert.equal(await actionRuntime.Lease.acquire(), true);
    assert.equal(await collectionRuntime.CollectionLease.acquire(), false);
    await actionRuntime.Lease.release();
    storage.delete(collectionRuntime.KEYS.collectionLease);

    const uncertainQueue = {
        schema: 1, id: 'queue-lifecycle-interlock', status: 'running', cursor: 0,
        items: [{
            listingId: '9900000000000299', status: 'deactivation-submitted-unverified',
            proposal: { action: 'DEACTIVATE_REVIEW' },
        }],
    };
    actionRuntime.state.queue = plain(uncertainQueue);
    storage.set(actionRuntime.KEYS.queue, plain(uncertainQueue));
    assert.equal(await collectionRuntime.CollectionLease.acquire(), false);
    assert.equal(storage.has(collectionRuntime.KEYS.collectionLease), false);

    uncertainQueue.status = 'stopped';
    actionRuntime.state.queue = plain(uncertainQueue);
    storage.set(actionRuntime.KEYS.queue, plain(uncertainQueue));
    assert.equal(await collectionRuntime.CollectionLease.acquire(), true);
    await collectionRuntime.CollectionLease.release();

    const overlappingCollection = api.normalizeCollection({
        ...plain(running), id: 'collection-legacy-overlap', writeRevision: 3,
        leaseToken: 'legacy-collection-token',
    });
    const overlappingQueue = {
        ...plain(uncertainQueue), id: 'queue-legacy-overlap', status: 'running',
        items: [{
            listingId: '9900000000000300', status: 'deactivation-submitted-unverified',
            proposal: { action: 'DEACTIVATE_REVIEW' },
        }],
    };
    collectionRuntime.state.collection = overlappingCollection;
    storage.set(collectionRuntime.KEYS.collection, plain(overlappingCollection));
    assert.equal(await collectionRuntime.CollectionLease.acquire({ expectedCollectionId: overlappingCollection.id }), true);
    const staleCollectionOwnerState = plain(collectionRuntime.state.collection);
    const ownedCollectionLease = plain(storage.get(collectionRuntime.KEYS.collectionLease));
    actionRuntime.state.queue = plain(overlappingQueue);
    storage.set(actionRuntime.KEYS.queue, plain(overlappingQueue));
    assert.equal(await actionRuntime.Lease.acquire(), false);

    const originalSaveCollectionLocked = collectionRuntime.Store.saveCollectionLocked;
    collectionRuntime.Store.saveCollectionLocked = async () => {
        const error = new Error('injected collection block failure');
        error.code = 'STORAGE_WRITE_FAILED';
        throw error;
    };
    try {
        await actionRuntime.stopCurrentQueue('legacy-overlap-block-failure');
    } finally {
        collectionRuntime.Store.saveCollectionLocked = originalSaveCollectionLocked;
    }
    assert.equal(plain(storage.get(actionRuntime.KEYS.queue)).status, 'running');
    assert.equal(plain(storage.get(collectionRuntime.KEYS.collection)).status, 'running');
    assert.equal(storage.has(actionRuntime.KEYS.lease), false);

    await actionRuntime.stopCurrentQueue('legacy-overlap-recovery');
    assert.equal(plain(storage.get(actionRuntime.KEYS.queue)).status, 'stopped');
    const blockedCollection = plain(storage.get(collectionRuntime.KEYS.collection));
    assert.equal(blockedCollection.status, 'blocked');
    assert.equal(blockedCollection.writeRevision, staleCollectionOwnerState.writeRevision + 1);
    assert.equal(blockedCollection.error.key, 'collectionPageChanged');
    assert.equal(blockedCollection.leaseToken, '');
    assert.equal(storage.has(actionRuntime.KEYS.lease), false);
    assert.deepEqual(plain(storage.get(collectionRuntime.KEYS.collectionLease)), ownedCollectionLease);

    const legacyPersist = async (candidate, expected) => {
        const stored = api.normalizeCollection(storage.get(collectionRuntime.KEYS.collection));
        if (expected.id && stored?.id !== expected.id) {
            const error = new Error('legacy collection ownership changed');
            error.code = 'COLLECTION_LEASE_LOST';
            throw error;
        }
        if (expected.token && stored?.leaseToken !== expected.token) {
            const error = new Error('legacy collection fencing token changed');
            error.code = 'COLLECTION_LEASE_LOST';
            throw error;
        }
        const lease = storage.get(collectionRuntime.KEYS.collectionLease);
        if (expected.leaseToken && (lease?.token !== expected.leaseToken || Number(lease.expiresAt) <= Date.now())) {
            const error = new Error('legacy collection lease changed');
            error.code = 'COLLECTION_LEASE_LOST';
            throw error;
        }
        storage.set(collectionRuntime.KEYS.collection, plain(candidate));
    };
    await assert.rejects(
        legacyPersist(
            { ...plain(staleCollectionOwnerState), status: 'running', expectedPage: 2 },
            {
                id: staleCollectionOwnerState.id,
                token: staleCollectionOwnerState.leaseToken,
                leaseToken: ownedCollectionLease.token,
            },
        ),
        (error) => error?.code === 'COLLECTION_LEASE_LOST',
    );
    assert.deepEqual(plain(storage.get(collectionRuntime.KEYS.collection)), blockedCollection);

    collectionRuntime.state.collection = api.normalizeCollection(staleCollectionOwnerState);
    await assert.rejects(
        collectionRuntime.Collection.persist({ expectedPage: 2 }),
        (error) => error?.code === 'COLLECTION_LEASE_LOST',
    );
    assert.deepEqual(plain(storage.get(collectionRuntime.KEYS.collection)), blockedCollection);
    await collectionRuntime.CollectionLease.release();
    assert.equal(await collectionRuntime.CollectionLease.acquire({ expectedCollectionId: overlappingCollection.id }), false);
});

test('safety-critical storage reads fail closed while optional UI preferences retain fallback behavior', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const action = api.actionRuntime;
    const collection = api.collectionRuntime;
    const originalGetValue = sandbox.GM.getValue;
    const failReadOnce = async (key, operation) => {
        let failed = false;
        sandbox.GM.getValue = async (candidate, fallback) => {
            if (!failed && candidate === key) {
                failed = true;
                throw new Error(`injected read failure for ${key}`);
            }
            return originalGetValue(candidate, fallback);
        };
        try { await operation(); }
        finally { sandbox.GM.getValue = originalGetValue; }
        assert.equal(failed, true);
    };

    const foreignLease = {
        owner: 'another-tab', instanceId: 'another-page', token: 'foreign-action-token', expiresAt: Date.now() + 60_000,
    };
    storage.set(action.KEYS.lease, plain(foreignLease));
    await failReadOnce(action.KEYS.lease, async () => {
        assert.equal(await action.Lease.acquire(), false);
    });
    assert.deepEqual(plain(storage.get(action.KEYS.lease)), foreignLease);
    assert.equal(action.state.leaseToken, '');
    storage.delete(action.KEYS.lease);

    await failReadOnce(action.KEYS.collectionLease, async () => {
        assert.equal(await action.Lease.acquire(), false);
    });
    assert.equal(storage.has(action.KEYS.lease), false);

    const activeQueue = {
        schema: api.versions.queueSchema, id: 'queue-read-failure', status: 'ready', cursor: 0,
        items: [{ listingId: 'read-failure-1', status: 'pending' }],
    };
    storage.set(action.KEYS.queue, plain(activeQueue));
    await failReadOnce(action.KEYS.queue, async () => {
        assert.equal(await collection.CollectionLease.acquire(), false);
    });
    assert.deepEqual(plain(storage.get(action.KEYS.queue)), activeQueue);
    assert.equal(storage.has(collection.KEYS.collectionLease), false);

    await failReadOnce(action.KEYS.index, async () => {
        await assert.rejects(action.Store.getIndex(), (error) => error?.code === 'STORAGE_READ_FAILED');
    });

    const queueBeforeCasFailure = plain(activeQueue);
    await failReadOnce(action.KEYS.queue, async () => {
        await assert.rejects(
            action.Store.saveQueueLocked({ ...plain(activeQueue), status: 'stopped' }),
            (error) => error?.code === 'STORAGE_READ_FAILED',
        );
    });
    assert.deepEqual(plain(storage.get(action.KEYS.queue)), queueBeforeCasFailure);
    storage.delete(action.KEYS.queue);

    const now = new Date().toISOString();
    const pausedCollection = api.normalizeCollection({
        schema: api.versions.collectionSchema, id: 'collection-read-failure', status: 'paused',
        scopeKey: 'etsy-shop:shopone|status:active|/your/shops/me/tools/listings?item_status=active&stats=true',
        metricContractId, startedAt: now, updatedAt: now, stoppedAt: now,
        expectedPage: 1, totalPages: 1, pages: {}, uniqueIds: [], duplicateCount: 0,
    });
    storage.set(collection.KEYS.collection, plain(pausedCollection));
    const collectionBeforeCasFailure = plain(storage.get(collection.KEYS.collection));
    await failReadOnce(collection.KEYS.collection, async () => {
        await assert.rejects(
            collection.Store.saveCollectionLocked({ ...plain(pausedCollection), error: { key: 'test' } }),
            (error) => error?.code === 'STORAGE_READ_FAILED',
        );
    });
    assert.deepEqual(plain(storage.get(collection.KEYS.collection)), collectionBeforeCasFailure);

    await failReadOnce(action.KEYS.settings, async () => {
        await assert.rejects(action.Store.loadSettings(), (error) => error?.code === 'STORAGE_READ_FAILED');
    });
    storage.set(action.KEYS.settings, { language: 'en', minVisitsToImprove: 27, minVisitsToProtect: 67 });
    await failReadOnce(action.KEYS.uiPreferences, async () => {
        const settings = await action.Store.loadSettings();
        assert.equal(settings.language, 'en');
        assert.equal(settings.minVisitsToImprove, 27);
    });
    for (const [key, load] of [
        [action.KEYS.analysisFilters, () => action.Store.loadAnalysisFilters()],
        [action.KEYS.filterPresets, () => action.Store.loadFilterPresets()],
        [action.KEYS.feedback, () => action.Store.loadFeedback()],
    ]) {
        await failReadOnce(key, async () => {
            await assert.rejects(load(), (error) => error?.code === 'STORAGE_READ_FAILED');
        });
    }
});

test('queue schema migration accepts legacy data but forward and malformed schemas stay immutable', async () => {
    const { api, storage } = loadAnalyzer();
    const action = api.actionRuntime;
    const collection = api.collectionRuntime;
    const futureQueue = {
        schema: api.versions.queueSchema + 1,
        id: 'queue-from-future', status: 'ready', cursor: 0,
        futureField: { mustSurvive: true },
        items: [{ listingId: 'future-1', status: 'pending' }],
    };
    storage.set(action.KEYS.queue, plain(futureQueue));
    const loadedFuture = await action.Store.loadQueue();
    assert.equal(loadedFuture.unsupportedSchema, true);
    assert.equal(loadedFuture.status, 'blocked');
    assert.equal(action.Queue.activeItem(), null);
    assert.equal(await collection.CollectionLease.acquire(), false);
    assert.equal(storage.has(collection.KEYS.collectionLease), false);
    await action.skipCurrentItem();
    await assert.rejects(
        action.Store.saveQueue({ schema: api.versions.queueSchema, id: 'replacement', status: 'stopped', cursor: 0, items: [] }),
        (error) => error?.code === 'QUEUE_NEWER_SCHEMA',
    );
    assert.deepEqual(plain(storage.get(action.KEYS.queue)), futureQueue);

    const malformedQueue = { schema: api.versions.queueSchema, id: 'queue-malformed', status: 'ready', cursor: 4, items: [] };
    storage.set(action.KEYS.queue, plain(malformedQueue));
    const loadedMalformed = await action.Store.loadQueue();
    assert.equal(loadedMalformed.invalidSchema, true);
    assert.equal(action.Queue.activeItem(), null);
    await assert.rejects(
        action.Store.saveQueue({ schema: api.versions.queueSchema, id: 'replacement-2', status: 'stopped', cursor: 0, items: [] }),
        (error) => error?.code === 'QUEUE_INVALID_SCHEMA',
    );
    assert.deepEqual(plain(storage.get(action.KEYS.queue)), malformedQueue);

    const validItem = (listingId, status = 'pending', action = 'UPDATE') => ({
        listingId, status, proposal: { action },
        editUrl: `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`,
    });
    const inconsistentCompleted = {
        schema: api.versions.queueSchema, id: 'queue-inconsistent-completed', status: 'completed', cursor: 0,
        items: [validItem('9000000001')],
    };
    storage.set(action.KEYS.queue, plain(inconsistentCompleted));
    assert.equal((await action.Store.loadQueue()).invalidSchema, true);
    assert.equal(await collection.CollectionLease.acquire(), false);
    assert.deepEqual(plain(storage.get(action.KEYS.queue)), inconsistentCompleted);

    const unresolvedPredecessor = {
        schema: api.versions.queueSchema, id: 'queue-unresolved-predecessor', status: 'running', cursor: 1,
        items: [validItem('9000000002', 'submitted'), validItem('9000000003')],
    };
    assert.equal(api.normalizeQueue(unresolvedPredecessor).invalidSchema, true);

    const pendingCompleted = {
        schema: api.versions.queueSchema, id: 'queue-pending-completed', status: 'completed', cursor: 1,
        items: [validItem('9000000004')],
    };
    assert.equal(api.normalizeQueue(pendingCompleted).invalidSchema, true);

    const futureActionTimestamp = '9999-12-31T23:59:59.000Z';
    const recentQueueCreatedAt = new Date(Date.now() - 60_000).toISOString();
    const futurePublishIntent = {
        schema: api.versions.queueSchema, id: 'queue-future-publish-intent', status: 'running', cursor: 0,
        items: [{ ...validItem('9000000006', 'submitted', 'UPDATE'), submittedAt: futureActionTimestamp, publishSubmittedIntentAt: futureActionTimestamp }],
    };
    assert.equal(api.normalizeQueue(futurePublishIntent).invalidSchema, true);
    const futureDeactivationIntent = {
        schema: api.versions.queueSchema, id: 'queue-future-deactivation-intent', status: 'running', cursor: 0,
        items: [{ ...validItem('9000000007', 'deactivation-submitted', 'DEACTIVATE_REVIEW'), deactivationSubmittedIntentAt: futureActionTimestamp }],
    };
    assert.equal(api.normalizeQueue(futureDeactivationIntent).invalidSchema, true);
    const stalePublishIntent = {
        schema: api.versions.queueSchema, id: 'queue-stale-publish-intent', status: 'running', cursor: 0,
        createdAt: recentQueueCreatedAt,
        items: [{ ...validItem('9000000009', 'submitted', 'UPDATE'), submittedAt: '1970-01-01T00:00:00.000Z' }],
    };
    assert.equal(api.normalizeQueue(stalePublishIntent).invalidSchema, true);
    const staleDeactivationIntent = {
        schema: api.versions.queueSchema, id: 'queue-stale-deactivation-intent', status: 'running', cursor: 0,
        createdAt: recentQueueCreatedAt,
        items: [{ ...validItem('9000000010', 'deactivation-submitted', 'DEACTIVATE_REVIEW'), deactivationSubmittedIntentAt: '1970-01-01T00:00:00.000Z' }],
    };
    assert.equal(api.normalizeQueue(staleDeactivationIntent).invalidSchema, true);
    const preCreationPublishIntent = {
        schema: api.versions.queueSchema, id: 'queue-pre-creation-publish-intent', status: 'running', cursor: 0,
        createdAt: recentQueueCreatedAt,
        items: [{ ...validItem('9000000011', 'submitted', 'UPDATE'), submittedAt: new Date(Date.parse(recentQueueCreatedAt) - 1).toISOString() }],
    };
    assert.equal(api.normalizeQueue(preCreationPublishIntent).invalidSchema, true);
    const legacySubmittedWithoutIntent = {
        schema: 1, id: 'queue-legacy-submitted-without-intent', status: 'running', cursor: 0,
        items: [validItem('9000000008', 'submitted', 'UPDATE')],
    };
    assert.equal(api.normalizeQueue(legacySubmittedWithoutIntent).invalidSchema, undefined);

    const legacyUnsafeUrl = {
        schema: 1, id: 'queue-legacy-url', status: 'ready', cursor: 0,
        items: [{ ...validItem('9000000005'), editUrl: 'https://example.com/unsafe' }],
    };
    const canonicalized = api.normalizeQueue(legacyUnsafeUrl);
    assert.equal(canonicalized.invalidSchema, undefined);
    assert.equal(canonicalized.schema, api.versions.queueSchema);
    assert.equal(canonicalized.items[0].editUrl, 'https://www.etsy.com/your/shops/me/listing-editor/edit/9000000005');

    const legacyQueue = { id: 'queue-legacy', status: 'stopped', cursor: 0, items: [] };
    storage.set(action.KEYS.queue, plain(legacyQueue));
    const migrated = await action.Store.loadQueue();
    assert.equal(migrated.schema, api.versions.queueSchema);
    await action.Store.saveQueue(migrated);
    assert.equal(storage.get(action.KEYS.queue).schema, api.versions.queueSchema);
});

test('active queues freeze queued proposals and health thresholds but not display preferences', async () => {
    const { api, storage } = loadAnalyzer();
    const action = api.actionRuntime;
    const settings = api.settingsRuntime;
    await action.Store.loadSettings();
    const listingId = '9100000001';
    const candidate = record(listingId, [snapshot('2026-08-31T12:00:00.000Z')]);
    candidate.editor = { title: candidate.meta.title, description: 'Stable', tags: [], materials: [], capturedAt: '2026-08-31T12:00:00.000Z' };
    await action.Store.putRecord(candidate);
    const saved = await action.Store.saveProposal(listingId, { action: 'UPDATE', fields: ['title'], title: 'Frozen proposal' });
    const queue = {
        schema: api.versions.queueSchema, id: 'queue-freeze', status: 'ready', cursor: 0,
        items: [{
            listingId, status: 'applying', proposal: plain(saved.proposal),
            editUrl: `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`,
        }],
    };
    action.state.queue = plain(queue);
    storage.set(action.KEYS.queue, plain(queue));
    await assert.rejects(
        action.Store.saveProposal(listingId, { action: 'UPDATE', fields: ['title'], title: 'Concurrent replacement' }),
        (error) => error?.code === 'PROPOSAL_QUEUE_LOCKED',
    );
    assert.equal((await action.Store.getRecord(listingId)).proposal.title, 'Frozen proposal');

    const thresholdsBefore = plain(storage.get(action.KEYS.settings) || {});
    assert.equal(await settings.persistThresholdSettings({
        minVisitsToImprove: 31, minVisitsToProtect: 71, minRenewalsToReview: 4, declinePercent: 41,
    }), false);
    assert.equal(settings.state.settingsSaveError, 'HEALTH_SETTINGS_QUEUE_LOCKED');
    assert.deepEqual(plain(storage.get(action.KEYS.settings) || {}), thresholdsBefore);

    settings.state.settings.language = 'en';
    assert.equal(await action.Store.saveUiPreferences(['language']), true);
    assert.equal(storage.get(action.KEYS.uiPreferences).language, 'en');
});

test('percentile ranks stay within the documented 0-100 range', () => {
    const { api } = loadAnalyzer();
    assert.equal(api.percentileRank([1, 2], 100), 100);
    assert.equal(api.percentileRank([1, 2], -100), 0);
    assert.equal(api.percentileRank([1, 2], 1), 25);
    assert.equal(api.percentileRank([1, 1, 2, 2], 1), 25);
});

test('exact Poisson rate-ratio inference handles sparse and zero-baseline counts without fake percentages', () => {
    const { api } = loadAnalyzer();
    const sparse = plain(api.exactPoissonRateRatioInterval(2, 100, 8, 100));
    assert.equal(sparse.method, 'conditional-exact-poisson');
    assert.equal(sparse.confidenceLevel, 0.95);
    assert.equal(sparse.ratio, 4);
    assert.ok(sparse.low < 1 && sparse.high > 1);

    const fromZero = plain(api.exactPoissonRateRatioInterval(0, 100, 6, 100));
    assert.equal(fromZero.ratioKind, 'infinite');
    assert.equal(fromZero.high, null);
    assert.equal(fromZero.highOpen, true);
    assert.ok(fromZero.low > 1);
    assert.deepEqual(plain(api.relativeEffectSummary(0, 6)), { kind: 'from-zero', percent: null, absolute: 6 });

    const forward = api.exactPoissonRateRatioInterval(4, 30, 12, 60);
    const reverse = api.exactPoissonRateRatioInterval(12, 60, 4, 30);
    const scaled = api.exactPoissonRateRatioInterval(4, 300, 12, 600);
    assert.ok(Math.abs(forward.low - (1 / reverse.high)) < 1e-10);
    assert.ok(Math.abs(forward.high - (1 / reverse.low)) < 1e-10);
    assert.ok(Math.abs(forward.low - scaled.low) < 1e-10);
    assert.ok(Math.abs(forward.high - scaled.high) < 1e-10);
    assert.equal(api.exactPoissonRateRatioInterval(0, 100, 0, 100), null);
    assert.equal(api.exactPoissonRateRatioInterval(1.5, 100, 2, 100), null);
    assert.equal(api.exactPoissonRateRatioInterval(1, 0, 2, 100), null);
    const supportedBoundary = api.exactPoissonRateRatioInterval(500_000, 100, 500_000, 100);
    assert.ok(supportedBoundary && supportedBoundary.low <= 1 && supportedBoundary.high >= 1);
    assert.equal(api.exactPoissonRateRatioInterval(100_000_000, 100, 100_000_000, 100), null);
});

test('snapshot normalization preserves explicit zeroes without coercing blank or structured values to zero', () => {
    const { api } = loadAnalyzer();
    const normalized = plain(api.normalizeSnapshot({
        at: '2026-08-20T12:00:00.000Z',
        visits: '   ',
        favorites: false,
        sales: [],
        revenue: '0',
        renewals: 0,
    }));
    assert.equal(normalized.visits, null);
    assert.equal(normalized.favorites, null);
    assert.equal(normalized.sales, null);
    assert.equal(normalized.revenue, 0);
    assert.equal(normalized.renewals, 0);
    assert.equal(api.finiteOrNull(' 0 '), 0);
});

test('record storage keys cannot redirect snapshots through a mismatched embedded listing identity', async () => {
    const { api, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const expectedId = 'record-key-123';
    const redirectedId = 'record-payload-999';
    const corrupted = record(redirectedId, [snapshot(new Date().toISOString())]);
    storage.set(runtime.KEYS.index, [expectedId]);

    for (const embeddedId of ['', 0, redirectedId]) {
        storage.set(runtime.KEYS.record(expectedId), { ...plain(corrupted), listingId: embeddedId });
        await assert.rejects(
            runtime.Store.getRecord(expectedId),
            (error) => error?.code === 'RECORD_ID_MISMATCH',
        );
    }
    storage.set(runtime.KEYS.record(expectedId), plain(corrupted));

    await assert.rejects(
        runtime.Store.saveSnapshot({ listingId: expectedId, capturedAt: new Date().toISOString() }),
        (error) => error?.code === 'RECORD_ID_MISMATCH',
    );
    assert.deepEqual(plain(storage.get(runtime.KEYS.record(expectedId))), corrupted);
    assert.equal(storage.has(runtime.KEYS.record(redirectedId)), false);
    assert.deepEqual(plain(storage.get(runtime.KEYS.index)), [expectedId]);
});

test('history charts plot explicit zero points and leave unread values as gaps', () => {
    const { api } = loadAnalyzer();
    const model = plain(api.buildHistoryChartModel([
        { at: '2026-08-01T12:00:00.000Z', visits: 0 },
        { at: '2026-08-02T12:00:00.000Z', visits: '   ' },
        { at: '2026-08-03T12:00:00.000Z', visits: 0 },
    ], 'visits'));
    assert.deepEqual(model.points.map((point) => point.value), [0, 0]);
    assert.equal(model.segments.length, 2);
    assert.equal(model.min, 0);
    assert.equal(model.max, 0);
});

test('live listing-state radio selection overrides a stale checked HTML attribute', () => {
    const { api } = loadAnalyzer();
    const input = (value, checked, staleAttribute = false) => ({
        value,
        checked,
        getAttribute: (name) => name === 'checked' && staleAttribute ? '' : null,
        closest: () => null,
        matches: () => checked,
    });
    const root = { querySelectorAll: () => [input('active', false, true), input('inactive', true)] };
    assert.equal(api.pageListingState(root, 'https://www.etsy.com/your/shops/me/tools/listings'), 'inactive');
});

test('saved collection scope produces a validated listings return link', () => {
    const { api } = loadAnalyzer();
    const scope = 'etsy-shop:fixture|status:inactive|/your/shops/me/tools/listings?item_status=inactive&stats=true';
    assert.equal(api.collectionScopeHref(scope), '/your/shops/me/tools/listings?item_status=inactive&stats=true');
    assert.equal(api.collectionScopeHref('etsy-shop:fixture|status:active|https://evil.example/listings'), '');
    assert.equal(api.collectionScopeHref('/your/shops/me/tools/listings?stats=true'), '');
});

test('failed threshold persistence restores health fields without clobbering display preferences', async () => {
    const { api } = loadAnalyzer();
    const runtime = api.settingsRuntime;
    await runtime.Store.loadSettings();
    const originalSaveSettings = runtime.Store.saveHealthSettings;
    const before = plain(runtime.state.settings);
    runtime.Store.saveHealthSettings = async () => false;
    try {
        runtime.state.settings.language = 'en';
        runtime.state.settings.collapsed = true;
        assert.equal(await runtime.persistThresholdSettings({
            minVisitsToImprove: 99,
            minVisitsToProtect: 199,
            minRenewalsToReview: 9,
            declinePercent: 55,
        }), false);
        assert.deepEqual(plain(Object.fromEntries([
            'minVisitsToImprove', 'minVisitsToProtect', 'minRenewalsToReview', 'declinePercent', 'retentionDays', 'maxSnapshots',
        ].map((key) => [key, runtime.state.settings[key]]))), plain(Object.fromEntries([
            'minVisitsToImprove', 'minVisitsToProtect', 'minRenewalsToReview', 'declinePercent', 'retentionDays', 'maxSnapshots',
        ].map((key) => [key, before[key]]))));
        assert.equal(runtime.state.settings.language, 'en');
        assert.equal(runtime.state.settings.collapsed, true);
    } finally {
        runtime.Store.saveHealthSettings = originalSaveSettings;
    }
});

test('overlapping threshold saves cannot report stale success or roll back past the last durable write', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const runtime = api.settingsRuntime;
    await runtime.Store.loadSettings();
    const originalSetValue = sandbox.GM.setValue;
    let settingsWrites = 0;
    let releaseFirstWrite = null;
    sandbox.GM.setValue = async (key, value) => {
        if (key !== api.actionRuntime.KEYS.settings) return originalSetValue(key, value);
        settingsWrites += 1;
        if (settingsWrites === 1) {
            await new Promise((resolve) => { releaseFirstWrite = resolve; });
            storage.set(key, plain(value));
            return;
        }
        throw new Error('second threshold write failed');
    };
    const firstValues = {
        minVisitsToImprove: 21, minVisitsToProtect: 61, minRenewalsToReview: 3, declinePercent: 36,
    };
    const secondValues = {
        minVisitsToImprove: 22, minVisitsToProtect: 62, minRenewalsToReview: 4, declinePercent: 37,
    };
    try {
        const first = runtime.persistThresholdSettings(firstValues);
        for (let attempt = 0; attempt < 20 && !releaseFirstWrite; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        assert.equal(typeof releaseFirstWrite, 'function');
        const second = runtime.persistThresholdSettings(secondValues);
        releaseFirstWrite();
        assert.equal(await first, false);
        assert.equal(await second, false);
        assert.equal(settingsWrites, 2);
        assert.deepEqual(plain(Object.fromEntries(Object.keys(firstValues).map((key) => [key, runtime.state.settings[key]]))), firstValues);
        assert.deepEqual(plain(Object.fromEntries(Object.keys(firstValues).map((key) => [key, storage.get(api.actionRuntime.KEYS.settings)[key]]))), firstValues);
    } finally {
        sandbox.GM.setValue = originalSetValue;
    }
});

test('editor proposal preflight rejects invalid tags before any form mutation', () => {
    const { api } = loadAnalyzer();
    assert.throws(() => api.validateEditableProposal({
        action: 'UPDATE',
        fields: ['title', 'tags'],
        title: 'Safe title',
        tags: ['valid', 'x'.repeat(21)],
    }), /at most 13 values and 20 characters/);
    assert.throws(() => api.validateEditableProposal({
        action: 'UPDATE',
        fields: ['tags'],
        tags: ['same', 'SAME'],
    }), /empty or duplicate/);
    assert.throws(() => api.validateEditableProposal({
        action: 'UPDATE',
        fields: ['materials'],
        materials: ['cotton-blend'],
    }), /letters, numbers, and spaces only/);
});

test('AI proposals reject listing deletion and accept deactivation review instead', () => {
    const { api } = loadAnalyzer();
    const aliases = { L001: '9900000000000001' };
    const knownIds = new Set(['9900000000000001']);
    assert.throws(() => api.validateAiProposal({
        reference: 'L001',
        action: 'DELETE',
        fields: [],
        reason: 'unsupported destructive action',
    }, aliases, knownIds), /unsupported action DELETE/);
    const proposal = api.validateAiProposal({
        reference: 'L001',
        action: 'DEACTIVATE_REVIEW',
        fields: [],
        reason: 'user review required',
    }, aliases, knownIds);
    assert.equal(proposal.action, 'DEACTIVATE_REVIEW');
    assert.deepEqual(plain(proposal.fields), []);
});

test('AI request packages import one synthetic response exactly once and clean up its opaque request', async () => {
    const { api, storage } = loadAnalyzer();
    const runtime = api.collectionRuntime;
    const now = new Date().toISOString();
    const listingId = '9900000000000191';
    const candidate = record(listingId, [snapshot(now)], {
        title: 'Synthetic AI Round Trip',
        shopKey: 'etsy-shop:syntheticfixture',
    });
    candidate.editor = {
        title: 'Synthetic AI Round Trip',
        description: 'Synthetic description before import',
        tags: ['synthetic', 'fixture'],
        materials: ['cotton'],
        capturedAt: now,
    };
    const storedCandidate = await runtime.Store.putRecord(candidate);
    const collection = api.normalizeCollection({
        schema: api.versions.collectionSchema,
        id: 'collection-synthetic-ai-roundtrip',
        status: 'completed',
        scopeKey: 'etsy-shop:syntheticfixture|active',
        metricContractId,
        startedAt: now,
        updatedAt: now,
        completedAt: now,
        expectedPage: 1,
        totalPages: 1,
        pages: {
            1: {
                signature: `1|1|${listingId}`,
                contentSignature: listingId,
                ids: [listingId],
                count: 1,
                capturedAt: now,
                metricContractId,
            },
        },
        uniqueIds: [listingId],
        duplicateCount: 0,
        failureReports: [],
    });
    assert.equal(api.collectionManifestIsComplete(collection), true);
    runtime.state.collection = collection;
    runtime.state.records = [storedCandidate];
    storage.set(runtime.KEYS.collection, plain(collection));

    const request = await api.aiRuntime.aiRequestPackage([storedCandidate], api.currentCollectionIdentity());
    assert.equal(request.schema, 'makaytron-listing-ai-request/v1');
    assert.equal(request.listings.length, 1);
    assert.equal(request.listings[0].reference, 'L001');
    assert.equal(request.listings[0].title, 'Synthetic AI Round Trip');
    assert.equal(Object.hasOwn(request.listings[0], 'listingId'), false);
    assert.equal(storage.get(runtime.KEYS.aiRequests)[request.requestId].aliases.L001, listingId);

    const response = JSON.stringify({
        schema: 'makaytron-listing-ai-proposals/v1',
        requestId: request.requestId,
        proposals: [{
            reference: 'L001',
            action: 'UPDATE',
            fields: ['description'],
            description: 'Synthetic description after import',
            reason: 'Synthetic round-trip verification',
        }],
    });
    const imported = await api.aiRuntime.importAiResponse(response, null);
    assert.deepEqual(plain(imported), { ok: true, count: 1 });
    assert.equal(storage.get(runtime.KEYS.aiRequests)[request.requestId], undefined);
    assert.equal(storage.has(runtime.KEYS.queue), false);

    const afterImport = await runtime.Store.getRecord(listingId);
    assert.equal(afterImport.proposal.action, 'UPDATE');
    assert.deepEqual(plain(afterImport.proposal.fields), ['description']);
    assert.equal(afterImport.proposal.description, 'Synthetic description after import');
    assert.equal(afterImport.proposal.source, 'ai-import');
    assert.equal(afterImport.proposal.requestId, request.requestId);
    assert.equal(afterImport.improvements.length, 1);
    assert.equal(afterImport.improvements[0].status, 'planned');

    const replay = await api.aiRuntime.importAiResponse(response, null);
    assert.equal(replay.ok, false);
    assert.equal(replay.error.code, 'AI_REQUEST');
    assert.equal(replay.error.path, '$.requestId');
    const afterReplay = await runtime.Store.getRecord(listingId);
    assert.equal(afterReplay.improvements.length, 1);
    assert.equal(afterReplay.proposal.requestId, request.requestId);
});

test('AI imports atomically reject changed editor and analytical payload records', async () => {
    const { api, storage } = loadAnalyzer();
    const runtime = api.collectionRuntime;
    const now = new Date().toISOString();
    const atDaysAgo = (days) => new Date(Date.parse(now) - days * 86400000).toISOString();
    const ids = ['9900000000000291', '9900000000000292'];
    const candidates = ids.map((listingId) => {
        const candidate = record(listingId, [
            snapshot(atDaysAgo(60), { visits: 100, sales: 0, revenue: 0 }),
            snapshot(atDaysAgo(30), { visits: 100, sales: 5, revenue: 50 }),
            snapshot(now, { visits: 100, sales: 10, revenue: 100 }),
        ], { title: `AI fence ${listingId}`, shopKey: 'etsy-shop:syntheticfixture' });
        candidate.editor = {
            title: `AI fence ${listingId}`, description: `Description ${listingId}`,
            tags: ['synthetic', 'fixture'], materials: ['cotton'], capturedAt: now,
        };
        return candidate;
    });
    const storedRecords = [];
    for (const candidate of candidates) storedRecords.push(await runtime.Store.putRecord(candidate));
    const contentSignature = [...ids].sort().join('\u001f');
    const collection = api.normalizeCollection({
        schema: api.versions.collectionSchema, id: 'collection-ai-record-fence', status: 'completed',
        scopeKey: 'etsy-shop:syntheticfixture|active', metricContractId, startedAt: now, updatedAt: now, completedAt: now,
        expectedPage: 1, totalPages: 1,
        pages: { 1: { signature: `1|2|${contentSignature}`, contentSignature, ids, count: 2, capturedAt: now, metricContractId } },
        uniqueIds: ids, duplicateCount: 0, failureReports: [],
    });
    runtime.state.collection = collection;
    runtime.state.records = storedRecords;
    storage.set(runtime.KEYS.collection, plain(collection));

    const request = await api.aiRuntime.aiRequestPackage(storedRecords, api.currentCollectionIdentity());
    const editorChanged = plain(storage.get(runtime.KEYS.record(ids[0])));
    editorChanged.editor.description = 'Changed after the AI request';
    storage.set(runtime.KEYS.record(ids[0]), editorChanged);
    const analyticsChanged = plain(storage.get(runtime.KEYS.record(ids[1])));
    analyticsChanged.history[1].sales = 1;
    analyticsChanged.history[1].revenue = 10;
    storage.set(runtime.KEYS.record(ids[1]), analyticsChanged);

    const response = JSON.stringify({
        schema: 'makaytron-listing-ai-proposals/v1', requestId: request.requestId,
        proposals: ids.map((_listingId, index) => ({
            reference: `L${String(index + 1).padStart(3, '0')}`, action: 'UPDATE', fields: ['description'],
            description: `Proposed ${index + 1}`, reason: 'stale payload regression',
        })),
    });
    const imported = await api.aiRuntime.importAiResponse(response, null);
    assert.equal(imported.ok, false);
    assert.equal(imported.error.code, 'AI_REQUEST');
    assert.equal(imported.error.path, '$.requestId');
    assert.ok(storage.get(runtime.KEYS.aiRequests)[request.requestId]);
    for (const listingId of ids) {
        const saved = await runtime.Store.getRecord(listingId);
        assert.equal(saved.proposal, null);
        assert.equal(saved.improvements.length, 0);
    }
});

test('AI import cannot supersede a newer manual proposal saved after request export', async () => {
    const { api, storage } = loadAnalyzer();
    const runtime = api.collectionRuntime;
    const now = new Date().toISOString();
    const listingId = '9900000000000293';
    const candidate = record(listingId, [snapshot(now, { visits: 42, favorites: 3 })], {
        title: 'AI proposal race fence', shopKey: 'etsy-shop:syntheticfixture',
    });
    candidate.editor = {
        title: 'AI proposal race fence', description: 'Description before export',
        tags: ['synthetic', 'fixture'], materials: ['cotton'], capturedAt: now,
    };
    const storedCandidate = await runtime.Store.putRecord(candidate);
    const collection = api.normalizeCollection({
        schema: api.versions.collectionSchema, id: 'collection-ai-proposal-race', status: 'completed',
        scopeKey: 'etsy-shop:syntheticfixture|active', metricContractId, startedAt: now, updatedAt: now, completedAt: now,
        expectedPage: 1, totalPages: 1,
        pages: { 1: { signature: `1|1|${listingId}`, contentSignature: listingId, ids: [listingId], count: 1, capturedAt: now, metricContractId } },
        uniqueIds: [listingId], duplicateCount: 0, failureReports: [],
    });
    runtime.state.collection = collection;
    runtime.state.records = [storedCandidate];
    storage.set(runtime.KEYS.collection, plain(collection));

    const request = await api.aiRuntime.aiRequestPackage([storedCandidate], api.currentCollectionIdentity());
    await runtime.Store.saveProposal(listingId, {
        action: 'UPDATE', fields: ['title'], title: 'Newer manual proposal',
        reason: 'This proposal was saved after AI export', source: 'manual',
    });
    const newerRecord = await runtime.Store.getRecord(listingId);
    const newerProposal = plain(newerRecord.proposal);
    const newerImprovements = plain(newerRecord.improvements);

    const response = JSON.stringify({
        schema: 'makaytron-listing-ai-proposals/v1', requestId: request.requestId,
        proposals: [{
            reference: 'L001', action: 'UPDATE', fields: ['description'],
            description: 'Stale AI response', reason: 'Must not replace the newer manual proposal',
        }],
    });
    const imported = await api.aiRuntime.importAiResponse(response, null);
    assert.equal(imported.ok, false);
    assert.equal(imported.error.code, 'AI_REQUEST');
    assert.equal(imported.error.path, '$.requestId');
    assert.ok(storage.get(runtime.KEYS.aiRequests)[request.requestId]);
    const afterImport = await runtime.Store.getRecord(listingId);
    assert.deepEqual(plain(afterImport.proposal), newerProposal);
    assert.deepEqual(plain(afterImport.improvements), newerImprovements);
    assert.equal(afterImport.proposal.source, 'manual');
    assert.equal(afterImport.proposal.title, 'Newer manual proposal');
});

test('verified deactivation invalidates its saved proposal basis and every earlier AI request', async () => {
    const { api, storage } = loadAnalyzer();
    const runtime = api.collectionRuntime;
    const now = new Date().toISOString();
    const deactivatedAt = new Date(Date.parse(now) + 1000).toISOString();
    const completedAt = new Date(Date.parse(now) + 2000).toISOString();
    const listingId = '9900000000000294';
    const candidate = record(listingId, [snapshot(now, { visits: 0, favorites: 0 })], {
        title: 'AI deactivation state fence', shopKey: 'etsy-shop:syntheticfixture',
    });
    candidate.editor = {
        title: 'AI deactivation state fence', description: 'Description before deactivation',
        tags: ['synthetic', 'fixture'], materials: ['cotton'], capturedAt: now,
    };
    await runtime.Store.putRecord(candidate);
    const savedPlan = await runtime.Store.saveProposal(listingId, {
        action: 'DEACTIVATE_REVIEW', fields: [], reason: 'Synthetic verified-deactivation fence', source: 'manual',
    });
    const collection = api.normalizeCollection({
        schema: api.versions.collectionSchema, id: 'collection-ai-deactivation-fence', status: 'completed',
        scopeKey: 'etsy-shop:syntheticfixture|status:active|/your/shops/me/tools/listings?item_status=active&stats=true',
        metricContractId, startedAt: now, updatedAt: completedAt, completedAt,
        expectedPage: 1, totalPages: 1,
        pages: { 1: { signature: `1|1|${listingId}`, contentSignature: listingId, ids: [listingId], count: 1, capturedAt: now, metricContractId } },
        uniqueIds: [listingId], duplicateCount: 0, failureReports: [],
    });
    runtime.state.collection = collection;
    runtime.state.records = [savedPlan];
    storage.set(runtime.KEYS.collection, plain(collection));

    const collectionIdentity = api.currentCollectionIdentity();
    const request = await api.aiRuntime.aiRequestPackage([savedPlan], collectionIdentity);
    const beforeDeactivationProposal = plain(savedPlan.proposal);
    const marked = await runtime.Store.getRecord(listingId);
    marked.deactivation = {
        at: deactivatedAt, operationId: 'deactivate-ai-fence-001',
        reason: 'Synthetic verified-deactivation fence', baselineSnapshot: marked.history.at(-1),
        userConfirmed: true, automated: true,
    };
    const deactivated = await runtime.Store.putRecord(marked);
    runtime.state.records = [deactivated];
    assert.equal(api.recommendationBasisMatches(deactivated), false);
    assert.equal(api.analysisCollectionIsFresh(), false);
    await assert.rejects(api.assertFreshCollection(collectionIdentity), (error) => error?.code === 'COLLECTION_STALE');
    await assert.rejects(
        api.aiRuntime.aiRequestPackage([deactivated], collectionIdentity),
        (error) => error?.code === 'COLLECTION_STALE',
    );
    const invalidatedCollection = await runtime.invalidateCollectionForRecordMutationLocked(
        listingId,
        deactivated.deactivation.at,
        'etsy-shop:syntheticfixture',
    );
    assert.equal(invalidatedCollection.status, 'blocked');
    assert.equal(invalidatedCollection.writeRevision, collection.writeRevision + 1);
    assert.equal(plain(storage.get(runtime.KEYS.collection)).status, 'blocked');

    const response = JSON.stringify({
        schema: 'makaytron-listing-ai-proposals/v1', requestId: request.requestId,
        proposals: [{
            reference: 'L001', action: 'UPDATE', fields: ['description'],
            description: 'Stale response after deactivation', reason: 'Must not revive stale active-state work',
        }],
    });
    const imported = await api.aiRuntime.importAiResponse(response, null);
    assert.equal(imported.ok, false);
    assert.equal(imported.error.code, 'COLLECTION_STALE');
    assert.equal(imported.error.path, '$.requestId');
    assert.ok(storage.get(runtime.KEYS.aiRequests)[request.requestId]);
    const afterImport = await runtime.Store.getRecord(listingId);
    assert.deepEqual(plain(afterImport.proposal), beforeDeactivationProposal);
    assert.equal(afterImport.deactivation.operationId, 'deactivate-ai-fence-001');
});

test('deactivation invalidates same-shop inactive membership even when the listing was absent', async () => {
    const { api, storage } = loadAnalyzer();
    const runtime = api.collectionRuntime;
    const startedAt = new Date(Date.now() - 5000).toISOString();
    const capturedAt = new Date(Date.now() - 4000).toISOString();
    const completedAt = new Date(Date.now() - 3000).toISOString();
    const deactivatedAt = new Date(Date.now() - 2000).toISOString();
    const listingId = '9900000000000295';
    const memberId = '9900000000000296';
    const target = record(listingId, [snapshot(capturedAt)], { shopKey: 'etsy-shop:shopone' });
    target.deactivation = {
        at: deactivatedAt, operationId: 'deactivate-inactive-membership-001', reason: 'scope transition',
        baselineSnapshot: target.history.at(-1), userConfirmed: true, automated: true,
    };
    const member = record(memberId, [snapshot(capturedAt, { listingState: 'inactive', statusLabel: 'Inactive' })], {
        shopKey: 'etsy-shop:shopone', listingState: 'inactive', statusLabel: 'Inactive',
    });
    await runtime.Store.putRecord(target);
    await runtime.Store.putRecord(member);
    const collection = api.normalizeCollection({
        schema: api.versions.collectionSchema, id: 'collection-inactive-membership', status: 'completed',
        scopeKey: 'etsy-shop:shopone|status:inactive|/your/shops/me/tools/listings?item_status=inactive&stats=true',
        metricContractId, startedAt, updatedAt: completedAt, completedAt, expectedPage: 1, totalPages: 1,
        pages: { 1: { signature: `1|1|${memberId}`, contentSignature: memberId, ids: [memberId], count: 1, capturedAt, metricContractId } },
        uniqueIds: [memberId], duplicateCount: 0, failureReports: [],
    });
    runtime.state.collection = collection;
    runtime.state.records = [member, target];
    storage.set(runtime.KEYS.collection, plain(collection));

    assert.equal(api.analysisCollectionIsFresh(), false);
    await assert.rejects(api.assertFreshCollection(api.currentCollectionIdentity()), (error) => error?.code === 'COLLECTION_STALE');
    const invalidated = await runtime.invalidateCollectionForRecordMutationLocked(listingId, deactivatedAt, 'etsy-shop:shopone');
    assert.equal(invalidated.status, 'blocked');

    const otherShopMember = record('9900000000000297', [snapshot(capturedAt, { listingState: 'inactive', statusLabel: 'Inactive' })], {
        shopKey: 'etsy-shop:shoptwo', listingState: 'inactive', statusLabel: 'Inactive',
    });
    await runtime.Store.putRecord(otherShopMember);
    const crossShop = api.normalizeCollection({
        ...plain(collection), id: 'collection-inactive-other-shop', writeRevision: 0, status: 'completed',
        scopeKey: 'etsy-shop:shoptwo|status:inactive|/your/shops/me/tools/listings?item_status=inactive&stats=true',
        pages: {
            1: {
                signature: `1|1|${otherShopMember.listingId}`, contentSignature: otherShopMember.listingId,
                ids: [otherShopMember.listingId], count: 1, capturedAt, metricContractId,
            },
        },
        uniqueIds: [otherShopMember.listingId],
    });
    runtime.state.collection = crossShop;
    runtime.state.records = [otherShopMember, target];
    storage.set(runtime.KEYS.collection, plain(crossShop));
    assert.equal(api.analysisCollectionIsFresh(), true);
    const untouched = await runtime.invalidateCollectionForRecordMutationLocked(listingId, deactivatedAt, 'etsy-shop:shopone');
    assert.equal(untouched.status, 'completed');
    assert.equal(untouched.writeRevision, crossShop.writeRevision);
});

test('collection page persistence rejects a post-read deactivation and accepts a genuinely later observation', async () => {
    const { api, storage } = loadAnalyzer();
    const runtime = api.collectionRuntime;
    const listingId = '9900000000000298';
    const deactivatedAt = new Date(Date.now() - 3000).toISOString();
    const observedBefore = new Date(Date.parse(deactivatedAt) - 1000).toISOString();
    const observedAfter = new Date(Date.parse(deactivatedAt) + 1000).toISOString();
    const target = record(listingId, [snapshot(observedBefore)], { shopKey: 'etsy-shop:shopone' });
    target.deactivation = {
        at: deactivatedAt, operationId: 'deactivate-page-observation-001', reason: 'page fence',
        baselineSnapshot: target.history.at(-1), userConfirmed: true, automated: true,
    };
    await runtime.Store.putRecord(target);
    const scopeKey = 'etsy-shop:shopone|status:active|/your/shops/me/tools/listings?item_status=active&stats=true';
    const makeRun = (id, startedAt) => api.normalizeCollection({
        schema: api.versions.collectionSchema, id, status: 'running', scopeKey, metricContractId,
        startedAt, updatedAt: startedAt, expectedPage: 1, totalPages: 1, pages: {}, uniqueIds: [],
        duplicateCount: 0, leaseToken: '', failureReports: [],
    });
    const alreadyObservedRun = makeRun('collection-page-observation-running', observedBefore);
    alreadyObservedRun.pages = {
        1: {
            signature: `1|1|${listingId}`, contentSignature: listingId, ids: [listingId], count: 1,
            capturedAt: observedBefore, metricContractId,
        },
    };
    alreadyObservedRun.uniqueIds = [listingId];
    runtime.state.collection = alreadyObservedRun;
    storage.set(runtime.KEYS.collection, plain(alreadyObservedRun));
    const blockedRun = await runtime.invalidateCollectionForRecordMutationLocked(listingId, deactivatedAt, 'etsy-shop:shopone');
    assert.equal(blockedRun.status, 'blocked');

    const staleRun = makeRun('collection-page-observation-stale', observedBefore);
    runtime.state.collection = staleRun;
    storage.set(runtime.KEYS.collection, plain(staleRun));
    assert.equal(await runtime.CollectionLease.acquire({ expectedCollectionId: staleRun.id }), true);
    const staleListing = { listingId, listingState: 'active', capturedAt: observedBefore };
    const stalePage = {
        signature: `1|1|${listingId}`, contentSignature: listingId, ids: [listingId], count: 1,
        capturedAt: observedBefore, metricContractId,
    };
    await assert.rejects(
        runtime.Collection.persist({ pages: { 1: stalePage }, uniqueIds: [listingId] }, { observedListings: [staleListing] }),
        (error) => error?.code === 'COLLECTION_STATE_CHANGED',
    );
    assert.deepEqual(plain(storage.get(runtime.KEYS.collection).pages), {});
    await runtime.CollectionLease.release();

    const laterRun = makeRun('collection-page-observation-later', observedAfter);
    runtime.state.collection = laterRun;
    storage.set(runtime.KEYS.collection, plain(laterRun));
    assert.equal(await runtime.CollectionLease.acquire({ expectedCollectionId: laterRun.id }), true);
    const laterListing = { listingId, listingState: 'active', capturedAt: observedAfter };
    const laterPage = { ...stalePage, capturedAt: observedAfter };
    const saved = await runtime.Collection.persist(
        { pages: { 1: laterPage }, uniqueIds: [listingId] },
        { observedListings: [laterListing] },
    );
    assert.equal(saved.pages['1'].capturedAt, observedAfter);
    assert.equal(runtime.collectionListingsObservedAt([
        { listingId: 'a', capturedAt: observedAfter },
        { listingId: 'b', capturedAt: deactivatedAt },
    ]), deactivatedAt);
    await runtime.CollectionLease.release();
});

test('backup import replaces unsafe edit URLs, skips its queue, and preserves local display settings', async () => {
    const { api, storage } = loadAnalyzer();
    const runtime = api.collectionRuntime;
    const now = new Date().toISOString();
    const listingId = '9900000000000192';
    runtime.state.settings = {
        ...runtime.state.settings,
        language: 'en',
        collapsed: true,
        minVisitsToImprove: 20,
    };
    runtime.state.analysisFilters = api.normalizeAnalysisFilters({});
    runtime.state.filterPresets = [];
    storage.set(runtime.KEYS.uiPreferences, { language: 'en', collapsed: true });
    storage.set(runtime.KEYS.filterPresets, { schema: 1, items: [{
        id: 'preset-concurrent-durable',
        name: 'Concurrent durable preset',
        filters: { recommendation: 'monitor', sort: 'priority' },
        query: 'durable only',
        createdAt: now,
        updatedAt: now,
    }] });
    const existingQueue = { schema: 1, id: 'queue-existing-local', status: 'stopped', cursor: 0, items: [] };
    storage.set(runtime.KEYS.queue, plain(existingQueue));

    const candidate = record(listingId, [snapshot(now)], {
        title: 'Synthetic Backup Round Trip',
        shopKey: 'etsy-shop:syntheticfixture',
        editUrl: `https://malicious.invalid/edit/${listingId}`,
        publicUrl: `https://malicious.invalid/listing/${listingId}`,
        imageUrl: 'javascript:alert(1)',
    });
    candidate.editor = {
        title: 'Synthetic Backup Round Trip',
        description: 'Synthetic backup description',
        tags: ['backup', 'fixture'],
        materials: ['linen'],
        capturedAt: now,
    };
    const rawBackup = {
        schema: 'makaytron-listing-analyzer-backup/v1',
        producerVersion: api.versions.app,
        exportedAt: now,
        settings: {
            language: 'tr',
            collapsed: false,
            minVisitsToImprove: 41,
            minVisitsToProtect: 91,
            minRenewalsToReview: 5,
            declinePercent: 22,
            retentionDays: 180,
            maxSnapshots: 90,
        },
        analysisFilters: { scope: 'page', performance: 'no-activity', sort: 'visits' },
        filterPresets: [{
            id: 'preset-synthetic-roundtrip',
            name: 'Synthetic review',
            filters: { recommendation: 'improve', sort: 'score' },
            query: 'synthetic fixture',
            createdAt: now,
            updatedAt: now,
        }],
        records: [candidate],
        queue: { schema: 1, id: 'queue-from-untrusted-backup', status: 'ready', cursor: 0, items: [{ listingId }] },
    };

    const normalized = api.backupRuntime.normalizeBackupDocument(rawBackup);
    assert.equal(normalized.queueSkipped, true);
    const canonicalEditUrl = `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`;
    assert.equal(normalized.records[0].meta.editUrl, canonicalEditUrl);
    assert.equal(normalized.records[0].meta.publicUrl, '');
    assert.equal(normalized.records[0].meta.imageUrl, '');
    assert.equal(normalized.settings.minVisitsToImprove, 41);

    const imported = await api.backupRuntime.importBackupDocument(rawBackup);
    assert.deepEqual(plain(imported), { records: 1, presets: 1, presetsSkipped: 0, queueSkipped: true });
    const importedRecord = await runtime.Store.getRecord(listingId);
    assert.equal(importedRecord.meta.title, 'Synthetic Backup Round Trip');
    assert.equal(importedRecord.meta.editUrl, canonicalEditUrl);
    assert.equal(importedRecord.meta.publicUrl, '');
    assert.equal(importedRecord.meta.imageUrl, '');
    assert.equal(runtime.state.settings.language, 'en');
    assert.equal(runtime.state.settings.collapsed, true);
    assert.equal(runtime.state.settings.minVisitsToImprove, 41);
    assert.equal(storage.get(runtime.KEYS.uiPreferences).language, 'en');
    assert.equal(storage.get(runtime.KEYS.uiPreferences).collapsed, true);
    assert.equal(storage.get(runtime.KEYS.analysisFilters).performance, 'no-activity');
    assert.deepEqual(
        storage.get(runtime.KEYS.filterPresets).items.map((item) => item.name).sort(),
        ['Concurrent durable preset', 'Synthetic review'],
    );
    assert.deepEqual(plain(storage.get(runtime.KEYS.queue)), existingQueue);
    assert.equal(storage.get(runtime.KEYS.audit).at(-1).type, 'backup-imported');
    assert.equal(storage.get(runtime.KEYS.audit).at(-1).queueSkipped, true);
});

test('backup import refuses active work and invalidates a previously fresh completed collection', async () => {
    const { api, storage } = loadAnalyzer();
    const runtime = api.collectionRuntime;
    const listingId = '9900000000000293';
    const now = Date.now();
    const existingAt = new Date(now - 2_000).toISOString();
    const importedAt = new Date(now - 500).toISOString();
    const importedRecord = record(listingId, [snapshot(importedAt, { visits: 999 })], {
        title: 'Imported mutation', shopKey: 'etsy-shop:shopone',
    });
    const backup = {
        schema: 'makaytron-listing-analyzer-backup/v1',
        producerVersion: api.versions.app,
        exportedAt: importedAt,
        settings: {}, analysisFilters: {}, filterPresets: [], records: [importedRecord],
    };

    const activeLease = {
        owner: 'other-tab', instanceId: 'other-page', token: 'active-import-blocker', expiresAt: now + 60_000,
    };
    storage.set(runtime.KEYS.lease, plain(activeLease));
    await assert.rejects(
        api.backupRuntime.importBackupDocument(backup),
        (error) => error?.code === 'IMPORT_BUSY',
    );
    assert.deepEqual(plain(storage.get(runtime.KEYS.lease)), activeLease);
    assert.equal(storage.has(runtime.KEYS.record(listingId)), false);
    assert.equal(storage.has(runtime.KEYS.index), false);
    storage.delete(runtime.KEYS.lease);

    const existingRecord = await runtime.Store.putRecord(record(listingId, [snapshot(existingAt, { visits: 10 })]));
    const scopeKey = 'etsy-shop:shopone|status:active|/your/shops/me/tools/listings?item_status=active&stats=true';
    const completedAt = new Date(now - 1_000).toISOString();
    const completed = api.normalizeCollection({
        schema: api.versions.collectionSchema, id: 'collection-before-backup-import', writeRevision: 4,
        status: 'completed', scopeKey, metricContractId,
        startedAt: new Date(now - 3_000).toISOString(), updatedAt: completedAt, completedAt,
        expectedPage: 1, totalPages: 1,
        pages: {
            1: {
                signature: `1|1|${listingId}`, contentSignature: listingId, ids: [listingId], count: 1,
                capturedAt: existingAt, metricContractId,
            },
        },
        uniqueIds: [listingId], duplicateCount: 0, leaseToken: '', failureReports: [],
    });
    runtime.state.collection = completed;
    runtime.state.records = [existingRecord];
    storage.set(runtime.KEYS.collection, plain(completed));
    assert.equal(api.analysisCollectionIsFresh(completed, [existingRecord], now), true);

    const result = await api.backupRuntime.importBackupDocument(backup);
    assert.equal(result.records, 1);
    const invalidated = plain(storage.get(runtime.KEYS.collection));
    assert.equal(invalidated.status, 'blocked');
    assert.equal(invalidated.error.key, 'collectionPageChanged');
    assert.match(invalidated.error.reason, /new full collection/i);
    assert.equal(api.analysisCollectionIsFresh(runtime.state.collection, runtime.state.records, now), false);
});

test('editor preflight accepts a full pill field whose input is disabled until a tag is removed', () => {
    const { api, sandbox } = loadAnalyzer();
    const input = new sandbox.HTMLInputElement();
    input.disabled = true;
    const field = {};
    const addButton = { disabled: true };
    const originalQuerySelector = sandbox.document.querySelector;
    sandbox.document.querySelector = (selector) => ({
        '#field-tags': field,
        '#listing-tags-input': input,
        '#listing-tags-button': addButton,
    })[selector] || null;
    try {
        assert.doesNotThrow(() => api.actionRuntime.EditorAdapter.preflightProposal({
            action: 'UPDATE',
            fields: ['tags'],
            tags: Array.from({ length: 13 }, (_, index) => `tag ${index + 1}`),
        }));
    } finally {
        sandbox.document.querySelector = originalQuerySelector;
    }
});

test('pill synchronization types first and then waits for Etsy to enable Add', async () => {
    const { api, sandbox } = loadAnalyzer();
    const pills = [];
    const events = [];
    const input = new sandbox.HTMLInputElement();
    input.disabled = false;
    input.value = '';
    const addButton = {
        disabled: true,
        getAttribute: () => null,
        click() {
            events.push('click');
            pills.push(input.value);
            input.value = '';
            this.disabled = true;
        },
    };
    input.dispatchEvent = (event) => {
        events.push(event.type);
        if (event.type === 'input') addButton.disabled = !input.value;
        return true;
    };
    const pillItem = (value) => ({
        isConnected: true,
        querySelector: () => ({}),
        cloneNode: () => ({ textContent: value, querySelectorAll: () => [] }),
    });
    const field = { querySelectorAll: () => pills.map(pillItem) };
    const originalQuerySelector = sandbox.document.querySelector;
    sandbox.document.querySelector = (selector) => ({
        '#field-tags': field,
        '#listing-tags-input': input,
        '#listing-tags-button': addButton,
    })[selector] || null;
    try {
        assert.equal(await api.actionRuntime.EditorAdapter.syncPills('#field-tags', '#listing-tags-input', '#listing-tags-button', ['new tag']), true);
        assert.deepEqual(pills, ['new tag']);
        assert.ok(events.indexOf('input') < events.indexOf('click'));
    } finally {
        sandbox.document.querySelector = originalQuerySelector;
    }
});

test('pill synchronization follows React-reused items and replaced field controls', async () => {
    const { api, sandbox } = loadAnalyzer();
    const pills = ['old tag', 'keep tag'];
    let input;
    let addButton;
    let field;
    const rebuild = (full = false) => {
        input = new sandbox.HTMLInputElement();
        input.value = '';
        input.disabled = full;
        addButton = {
            disabled: true,
            getAttribute: () => null,
            click() {
                pills.push(input.value);
                rebuild(true);
            },
        };
        input.dispatchEvent = (event) => {
            if (event.type === 'input') addButton.disabled = !input.value;
            return true;
        };
        field = {
            querySelectorAll: () => pills.map((value) => {
                const remove = {
                    click() {
                        pills.splice(pills.indexOf(value), 1);
                        rebuild(false);
                    },
                };
                return {
                    isConnected: true,
                    querySelector: () => remove,
                    cloneNode: () => ({ textContent: value, querySelectorAll: () => [] }),
                };
            }),
        };
    };
    rebuild(true);
    const originalQuerySelector = sandbox.document.querySelector;
    sandbox.document.querySelector = (selector) => ({
        '#field-tags': field,
        '#listing-tags-input': input,
        '#listing-tags-button': addButton,
    })[selector] || null;
    try {
        assert.equal(await api.actionRuntime.EditorAdapter.syncPills(
            '#field-tags', '#listing-tags-input', '#listing-tags-button', ['keep tag', 'new tag'],
        ), true);
        assert.deepEqual(pills, ['keep tag', 'new tag']);
    } finally {
        sandbox.document.querySelector = originalQuerySelector;
    }
});

test('pill synchronization lets an always-enabled Add control receive React input state before clicking', async () => {
    const { api, sandbox } = loadAnalyzer();
    const pills = [];
    let reactValue = '';
    const input = new sandbox.HTMLInputElement();
    input.disabled = false;
    input.value = '';
    input.dispatchEvent = (event) => {
        if (event.type === 'input') setTimeout(() => { reactValue = input.value; }, 20);
        return true;
    };
    const addButton = {
        disabled: false,
        getAttribute: () => null,
        click() {
            if (reactValue) pills.push(reactValue);
        },
    };
    const field = {
        querySelectorAll: () => pills.map((value) => ({
            querySelector: () => ({}),
            cloneNode: () => ({ textContent: value, querySelectorAll: () => [] }),
        })),
    };
    const originalQuerySelector = sandbox.document.querySelector;
    sandbox.document.querySelector = (selector) => ({
        '#field-materials': field,
        '#listing-materials-input': input,
        '#listing-materials-button': addButton,
    })[selector] || null;
    try {
        assert.equal(await api.actionRuntime.EditorAdapter.syncPills(
            '#field-materials', '#listing-materials-input', '#listing-materials-button', ['Cotton Blend'],
        ), true);
        assert.deepEqual(pills, ['Cotton Blend']);
    } finally {
        sandbox.document.querySelector = originalQuerySelector;
    }
});

test('editor apply accepts a pill Add button that starts disabled until input', async () => {
    const { api, sandbox } = loadAnalyzer();
    const pills = [];
    const title = new sandbox.HTMLInputElement(); title.value = 'Original title'; title.disabled = false;
    const description = new sandbox.HTMLTextAreaElement(); description.value = 'Description'; description.disabled = false;
    const input = new sandbox.HTMLInputElement(); input.value = ''; input.disabled = false;
    const addButton = {
        disabled: true,
        getAttribute: () => null,
        click() { pills.push(input.value); input.value = ''; this.disabled = true; },
    };
    input.dispatchEvent = (event) => {
        if (event.type === 'input') addButton.disabled = !input.value;
        return true;
    };
    const pillItem = (value) => ({
        isConnected: true,
        querySelector: () => ({}),
        cloneNode: () => ({ textContent: value, querySelectorAll: () => [] }),
    });
    const field = { querySelectorAll: () => pills.map(pillItem) };
    const emptyField = { querySelectorAll: () => [] };
    const originalQuerySelector = sandbox.document.querySelector;
    const originalQuerySelectorAll = sandbox.document.querySelectorAll;
    sandbox.document.querySelector = (selector) => ({
        '#listing-title-input': title,
        '#listing-description-textarea': description,
        '#field-tags': field,
        '#listing-tags-input': input,
        '#listing-tags-button': addButton,
        '#field-materials': emptyField,
    })[selector] || null;
    sandbox.document.querySelectorAll = (selector) => selector.includes('data-unsaved-changes') ? [{
        textContent: 'You have no unsaved changes.', closest: () => null, checkVisibility: () => true,
    }] : [];
    try {
        const changed = await api.actionRuntime.EditorAdapter.applyProposal({ action: 'UPDATE', fields: ['tags'], tags: ['new tag'] });
        assert.deepEqual(Array.from(changed), ['tags']);
        assert.deepEqual(pills, ['new tag']);
    } finally {
        sandbox.document.querySelector = originalQuerySelector;
        sandbox.document.querySelectorAll = originalQuerySelectorAll;
    }
});

test('editor apply reports earlier field changes without automatically overwriting them after a later failure', async () => {
    const { api, sandbox } = loadAnalyzer();
    const adapter = api.actionRuntime.EditorAdapter;
    const title = new sandbox.HTMLInputElement(); title.value = 'Original title'; title.disabled = false;
    const description = new sandbox.HTMLTextAreaElement(); description.value = 'Original description'; description.disabled = false;
    const tagField = { querySelectorAll: () => [] };
    const materialField = { querySelectorAll: () => [] };
    const tagInput = new sandbox.HTMLInputElement(); tagInput.disabled = false;
    const tagButton = { disabled: false, getAttribute: () => null };
    const originalQuerySelector = sandbox.document.querySelector;
    const originalQuerySelectorAll = sandbox.document.querySelectorAll;
    const originalSyncPills = adapter.syncPills;
    sandbox.document.querySelector = (selector) => ({
        '#listing-title-input': title,
        '#listing-description-textarea': description,
        '#field-tags': tagField,
        '#listing-tags-input': tagInput,
        '#listing-tags-button': tagButton,
        '#field-materials': materialField,
    })[selector] || null;
    sandbox.document.querySelectorAll = (selector) => selector.includes('data-unsaved-changes') ? [{
        textContent: 'You have no unsaved changes.',
        closest: () => null,
        checkVisibility: () => true,
    }] : [];
    adapter.syncPills = async () => false;
    let failure;
    try {
        await adapter.applyProposal({ action: 'UPDATE', fields: ['title', 'tags'], title: 'Changed title', tags: ['new tag'] });
    } catch (error) {
        failure = error;
    } finally {
        adapter.syncPills = originalSyncPills;
        sandbox.document.querySelector = originalQuerySelector;
        sandbox.document.querySelectorAll = originalQuerySelectorAll;
    }
    assert.ok(failure);
    assert.equal(failure.editorRestored, undefined);
    assert.deepEqual(Array.from(failure.changedFields), ['title']);
    assert.equal(title.value, 'Changed title');
});

test('editor clean-state ignores hidden status copies and recognizes one unsaved change', () => {
    const { api, sandbox } = loadAnalyzer();
    const hiddenClean = {
        textContent: 'You have no unsaved changes.',
        closest: () => null,
        checkVisibility: () => false,
    };
    const visibleStatus = {
        textContent: 'There is 1 unsaved change.',
        closest: () => null,
        checkVisibility: () => true,
    };
    const originalQuerySelectorAll = sandbox.document.querySelectorAll;
    sandbox.document.querySelectorAll = () => [hiddenClean, visibleStatus];
    try {
        assert.equal(api.actionRuntime.EditorAdapter.statusText(), 'There is 1 unsaved change.');
        assert.equal(api.actionRuntime.EditorAdapter.formIsClean(), false);
        visibleStatus.textContent = 'You have no unsaved changes.';
        assert.equal(api.actionRuntime.EditorAdapter.formIsClean(), true);
        visibleStatus.checkVisibility = () => false;
        assert.equal(api.actionRuntime.EditorAdapter.statusText(), '');
        assert.equal(api.actionRuntime.EditorAdapter.formIsClean(), null);
        visibleStatus.offsetParent = {};
        assert.equal(api.actionRuntime.EditorAdapter.formIsClean(true), true);
        visibleStatus.textContent = 'There is 1 unsaved change.';
        assert.equal(api.actionRuntime.EditorAdapter.formIsClean(true), false);
    } finally {
        sandbox.document.querySelectorAll = originalQuerySelectorAll;
    }
});

test('an unrecognized Etsy pill fails closed instead of looking like an empty tag field', async () => {
    const { api, sandbox } = loadAnalyzer();
    const adapter = api.actionRuntime.EditorAdapter;
    const unknownPill = {
        querySelector: () => null,
        cloneNode: () => ({ textContent: 'Existing tag', querySelectorAll: () => [] }),
    };
    const field = { querySelectorAll: () => [unknownPill] };
    const input = new sandbox.HTMLInputElement(); input.disabled = false;
    const addButton = { disabled: false, getAttribute: () => null };
    const originalQuerySelector = sandbox.document.querySelector;
    sandbox.document.querySelector = (selector) => ({
        '#field-tags': field,
        '#listing-tags-input': input,
        '#listing-tags-button': addButton,
    })[selector] || null;
    try {
        assert.throws(() => adapter.preflightProposal({ action: 'UPDATE', fields: ['tags'], tags: [] }));
        assert.equal(await adapter.syncPills('#field-tags', '#listing-tags-input', '#listing-tags-button', []), false);
    } finally {
        sandbox.document.querySelector = originalQuerySelector;
    }
});

test('deactivation menu re-resolves a React-replaced item and verifies focus without clicking it', async () => {
    const { api, sandbox } = loadAnalyzer();
    const adapter = api.actionRuntime.EditorAdapter;
    let moreClicks = 0;
    let deactivateClicks = 0;
    let stableFocuses = 0;
    const more = { disabled: false, getAttribute: () => null, click: () => { moreClicks += 1; } };
    const action = (stable) => ({
        tagName: 'BUTTON', disabled: false,
        offsetParent: {},
        textContent: 'Deactivate',
        getAttribute: () => null,
        closest: () => null,
        scrollIntoView() {},
        click: () => { deactivateClicks += 1; },
        focus() {
            if (stable) stableFocuses += 1;
            sandbox.document.activeElement = this;
        },
    });
    const transient = action(false);
    const stable = action(true);
    let reads = 0;
    const originalRoot = adapter.root;
    const originalQuerySelectorAll = sandbox.document.querySelectorAll;
    const scope = {
        closest: () => null,
        querySelectorAll: (selector) => {
            if (selector.startsWith('button[aria-label=')) return [more];
            if (selector === '[role="menu"] [role="menuitem"]') return reads++ === 0 ? [] : [reads === 2 ? transient : stable];
            return [];
        },
    };
    adapter.root = () => ({ querySelector: (selector) => selector === '#more-option-menu' ? scope : null });
    sandbox.document.querySelectorAll = () => [];
    try {
        assert.equal(await adapter.openDeactivate(), true);
        assert.equal(moreClicks, 1);
        assert.equal(deactivateClicks, 0);
        assert.ok(stableFocuses >= 1);
        assert.equal(sandbox.document.activeElement, stable);
    } finally {
        adapter.root = originalRoot;
        sandbox.document.querySelectorAll = originalQuerySelectorAll;
    }
});

test('automatic deactivation selects Deactivate beside Delete and clicks only the exact final confirmation', async () => {
    const { api, sandbox } = loadAnalyzer();
    const adapter = api.actionRuntime.EditorAdapter;
    let deactivateClicks = 0;
    let deleteClicks = 0;
    let confirmClicks = 0;
    let modalOpen = false;
    const control = (textContent, attributes = {}, click = () => {}) => ({
        tagName: 'BUTTON', textContent, disabled: false, id: attributes.id || '',
        getAttribute: (name) => attributes[name] ?? null,
        closest: () => null,
        click,
    });
    const deactivate = control('Deactivate', { 'data-clg-id': 'WtMenuItem' }, () => { deactivateClicks += 1; modalOpen = true; });
    const remove = control('Delete', { 'data-action': 'delete-listing' }, () => { deleteClicks += 1; });
    const cancel = control('Cancel', { 'data-clg-id': 'WtButton' });
    const finalDeactivate = control('Deactivate', { id: 'shop-manager--listing-publish', 'data-clg-id': 'WtButton' }, () => { confirmClicks += 1; });
    const dialog = {
        getAttribute: (name) => ({ 'aria-hidden': 'false', 'aria-label': 'Deactivate listing?' })[name] ?? null,
        querySelector: () => null,
        querySelectorAll: (selector) => selector === 'button' ? [cancel, finalDeactivate] : [],
        closest: () => null,
    };
    const scope = {
        querySelectorAll: (selector) => selector === '[role="menu"] [role="menuitem"]' ? [remove, deactivate] : [],
    };
    const originalRoot = adapter.root;
    const originalOpen = adapter.openDeactivate;
    const originalQuerySelectorAll = sandbox.document.querySelectorAll;
    adapter.root = () => ({ querySelector: (selector) => selector === '#more-option-menu' ? scope : null });
    adapter.openDeactivate = async () => true;
    sandbox.document.querySelectorAll = () => modalOpen ? [dialog] : [];
    try {
        assert.equal(await adapter.openDeactivateDialog(), true);
        assert.equal(deactivateClicks, 1);
        assert.equal(deleteClicks, 0);
        assert.equal(confirmClicks, 0);
        assert.equal(adapter.clickDeactivateConfirmation(), true);
        assert.equal(confirmClicks, 1);
        assert.equal(deleteClicks, 0);
    } finally {
        adapter.root = originalRoot;
        adapter.openDeactivate = originalOpen;
        sandbox.document.querySelectorAll = originalQuerySelectorAll;
    }
});

test('deactivation waits past the former three-second limit for Etsy modal hydration', async () => {
    const { api, sandbox } = loadAnalyzer();
    const adapter = api.actionRuntime.EditorAdapter;
    let menuClicks = 0;
    let requestedAt = 0;
    const control = (textContent, attributes = {}, click = () => {}) => ({
        tagName: 'BUTTON', textContent, disabled: false, id: attributes.id || '',
        getAttribute: (name) => attributes[name] ?? null,
        closest: () => null,
        click,
    });
    const deactivate = control('Deactivate', { 'data-clg-id': 'WtMenuItem' }, () => {
        menuClicks += 1;
        requestedAt = Date.now();
    });
    const cancel = control('Cancel', { 'data-clg-id': 'WtButton' });
    const finalDeactivate = control('Deactivate', { id: 'shop-manager--listing-publish', 'data-clg-id': 'WtButton' });
    const dialog = {
        getAttribute: (name) => ({ 'aria-hidden': 'false', 'aria-label': 'Deactivate listing?' })[name] ?? null,
        querySelector: () => null,
        querySelectorAll: (selector) => selector === 'button' ? [cancel, finalDeactivate] : [],
        closest: () => null,
    };
    const scope = { querySelectorAll: (selector) => selector === '[role="menu"] [role="menuitem"]' ? [deactivate] : [] };
    const originalRoot = adapter.root;
    const originalOpen = adapter.openDeactivate;
    const originalQuerySelectorAll = sandbox.document.querySelectorAll;
    adapter.root = () => ({ querySelector: (selector) => selector === '#more-option-menu' ? scope : null });
    adapter.openDeactivate = async () => true;
    sandbox.document.querySelectorAll = () => requestedAt && Date.now() - requestedAt >= 3200 ? [dialog] : [];
    const started = Date.now();
    try {
        assert.equal(await adapter.openDeactivateDialog(), true);
        assert.equal(menuClicks, 1);
        assert.ok(Date.now() - started >= 3000);
    } finally {
        adapter.root = originalRoot;
        adapter.openDeactivate = originalOpen;
        sandbox.document.querySelectorAll = originalQuerySelectorAll;
    }
});

test('deactivation confirmation rejects wrong, ambiguous, disabled, and deletion dialogs without clicking', () => {
    const { api, sandbox } = loadAnalyzer();
    const adapter = api.actionRuntime.EditorAdapter;
    let clicks = 0;
    const button = (textContent, id = 'shop-manager--listing-publish', disabled = false, action = '') => ({
        tagName: 'BUTTON', textContent, id, disabled,
        getAttribute: (name) => name === 'data-action' ? action || null : null,
        closest: () => null,
        click: () => { clicks += 1; },
    });
    const dialog = (label, buttons) => ({
        getAttribute: (name) => name === 'aria-hidden' ? 'false' : name === 'aria-label' ? label : null,
        querySelector: () => null,
        querySelectorAll: (selector) => selector === 'button' ? buttons : [],
        closest: () => null,
    });
    const cancel = button('Cancel', 'cancel');
    const exact = button('Deactivate');
    const originalQuerySelectorAll = sandbox.document.querySelectorAll;
    try {
        for (const dialogs of [
            [dialog('Delete listing?', [cancel, exact])],
            [dialog('Deactivate listing?', [cancel, button('Delete', 'shop-manager--listing-publish', false, 'delete-listing')])],
            [dialog('Deactivate listing?', [cancel, button('Deactivate', 'shop-manager--listing-publish', true)])],
            [dialog('Deactivate listing?', [cancel, exact]), dialog('Deactivate listing?', [cancel, exact])],
        ]) {
            sandbox.document.querySelectorAll = () => dialogs;
            assert.equal(adapter.clickDeactivateConfirmation(), false);
        }
        assert.equal(clicks, 0);
    } finally {
        sandbox.document.querySelectorAll = originalQuerySelectorAll;
    }
});

test('editor status verification ignores unrelated badges outside the current editor root', () => {
    const { api, sandbox } = loadAnalyzer();
    const adapter = api.actionRuntime.EditorAdapter;
    const target = { offsetParent: {}, textContent: 'Active', getAttribute: () => null };
    const unrelated = { offsetParent: {}, textContent: 'Inactive', getAttribute: () => null };
    const editorRoot = {
        querySelector: () => null,
        querySelectorAll: (selector) => selector === '.wt-badge--statusValue' ? [target] : [],
    };
    const title = { closest: () => editorRoot };
    const originalQuerySelector = sandbox.document.querySelector;
    const originalQuerySelectorAll = sandbox.document.querySelectorAll;
    sandbox.document.querySelector = (selector) => selector === '#listing-title-input' ? title : null;
    sandbox.document.querySelectorAll = () => [unrelated];
    try {
        assert.deepEqual(Array.from(adapter.listingStatusLabels()), ['Active']);
    } finally {
        sandbox.document.querySelector = originalQuerySelector;
        sandbox.document.querySelectorAll = originalQuerySelectorAll;
    }
});

test('editor status verification reads Etsy inactive informational badge from the header status row', () => {
    const { api, sandbox } = loadAnalyzer();
    const adapter = api.actionRuntime.EditorAdapter;
    const inactive = { offsetParent: {}, textContent: 'Inactive', getAttribute: (name) => name === 'data-clg-id' ? 'WtBadge' : null };
    const featured = { offsetParent: {}, textContent: 'Featured', getAttribute: (name) => name === 'data-clg-id' ? 'WtBadge' : null };
    const statusRegion = { querySelectorAll: () => [inactive, featured] };
    const titleBar = { nextElementSibling: statusRegion };
    const editorRoot = {
        querySelector: (selector) => selector === '#form-title-bar' ? titleBar : null,
        querySelectorAll: () => [],
    };
    const title = { closest: () => editorRoot };
    const originalQuerySelector = sandbox.document.querySelector;
    sandbox.document.querySelector = (selector) => selector === '#listing-title-input' ? title : null;
    try {
        assert.deepEqual(Array.from(adapter.listingStatusLabels()), ['Inactive']);
    } finally {
        sandbox.document.querySelector = originalQuerySelector;
    }
});

test('editor capture never writes a new route into the previous listing record', async () => {
    const { api, sandbox } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const adapter = runtime.EditorAdapter;
    const title = new sandbox.HTMLInputElement(); title.value = 'Listing A';
    const description = new sandbox.HTMLTextAreaElement(); description.value = 'Description A';
    const originalQuerySelector = sandbox.document.querySelector;
    const originalQuerySelectorAll = sandbox.document.querySelectorAll;
    const originalGetRecord = runtime.Store.getRecord;
    const originalPutRecord = runtime.Store.putRecord;
    let finishRead;
    let writes = 0;
    runtime.Store.getRecord = () => new Promise((resolve) => { finishRead = resolve; });
    runtime.Store.putRecord = async () => { writes += 1; };
    sandbox.document.querySelector = (selector) => ({
        '#listing-title-input': title,
        '#listing-description-textarea': description,
    })[selector] || null;
    sandbox.document.querySelectorAll = (selector) => selector.includes('[data-seller-nav="true"]')
        ? [{ href: 'https://www.etsy.com/shop/FixtureShop' }]
        : [];
    sandbox.location.pathname = '/your/shops/me/listing-editor/edit/101';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/your/shops/me/listing-editor/edit/101';
    try {
        const capture = adapter.captureCurrent({ routeKey: sandbox.location.pathname, listingId: '101' });
        await Promise.resolve();
        sandbox.location.pathname = '/your/shops/me/listing-editor/edit/202';
        sandbox.location.href = 'https://www.etsy.com/your/shops/me/listing-editor/edit/202';
        title.value = 'Listing B';
        description.value = 'Description B';
        finishRead(null);
        assert.equal(await capture, null);
        assert.equal(writes, 0);
    } finally {
        runtime.Store.getRecord = originalGetRecord;
        runtime.Store.putRecord = originalPutRecord;
        sandbox.document.querySelector = originalQuerySelector;
        sandbox.document.querySelectorAll = originalQuerySelectorAll;
    }
});

test('replacing an UPDATE proposal supersedes its old planned improvement', async () => {
    const { api } = loadAnalyzer();
    const store = api.collectionRuntime.Store;
    const candidate = record('proposal-replace', [snapshot('2026-08-20T12:00:00.000Z')]);
    candidate.editor = { title: 'Original', description: 'Description', tags: [], materials: [], capturedAt: '2026-08-20T12:00:00.000Z' };
    await store.putRecord(candidate);
    const update = await store.saveProposal(candidate.listingId, { action: 'UPDATE', fields: ['title'], title: 'Changed', reason: 'test' });
    assert.equal(update.improvements.at(-1).status, 'planned');
    const skipped = await store.saveProposal(candidate.listingId, { action: 'SKIP', fields: [], reason: 'cancelled' });
    assert.equal(skipped.proposal.action, 'SKIP');
    assert.equal(skipped.proposal.improvementId, null);
    assert.equal(skipped.improvements.at(-1).status, 'superseded');
    assert.ok(skipped.improvements.at(-1).supersededAt);
});

test('terminal research entries cannot regress on delayed ACK or ERROR messages', () => {
    const { api } = loadAnalyzer();
    const completed = { requestId: 'r1', status: 'completed', resultHash: 'hash' };
    const failed = { requestId: 'r2', status: 'failed', lastError: 'terminal' };
    assert.equal(api.transitionResearchEntry(completed, 'acknowledged', { acknowledgedAt: 'later' }, ['request-sent']), completed);
    assert.equal(api.transitionResearchEntry(completed, 'failed', { lastError: 'late error' }, ['acknowledged']), completed);
    assert.equal(api.transitionResearchEntry(completed, 'request-sent', { requestSentAt: 'late probe' }, ['waiting-ready']), completed);
    assert.equal(api.transitionResearchEntry(failed, 'acknowledged', {}, ['request-sent']), failed);
    const acknowledged = plain(api.transitionResearchEntry({ requestId: 'r3', status: 'request-sent' }, 'acknowledged', { acknowledgedAt: 'now' }, ['request-sent']));
    assert.deepEqual(acknowledged, { requestId: 'r3', status: 'acknowledged', acknowledgedAt: 'now' });
    assert.equal(api.researchResultStatusAccepts('waiting-ready'), true);
    assert.equal(api.researchResultStatusAccepts('failed'), false);
});

test('Marketplace Insights content hashing and seed selection are deterministic and bounded', async () => {
    const { api } = loadAnalyzer();
    const first = {
        title: '  Patriotic Chicken Shirt  ',
        description: 'Line one\r\nLine two\r\n',
        tags: ['Farmhouse Gift', 'chicken shirt', 'farmhouse gift'],
        materials: ['Cotton', 'Polyester'],
    };
    const reordered = {
        title: 'Patriotic Chicken Shirt',
        description: 'Line one\nLine two',
        tags: ['CHICKEN SHIRT', 'FARMHOUSE GIFT'],
        materials: ['polyester', 'cotton'],
    };
    assert.deepEqual(plain(api.canonicalEditableContent(first)), {
        description: 'Line one\nLine two',
        materials: ['cotton', 'polyester'],
        tags: ['chicken shirt', 'farmhouse gift'],
        title: 'Patriotic Chicken Shirt',
    });
    assert.equal(await api.contentFingerprint(first), await api.contentFingerprint(reordered));

    const sourceRecord = record('901', [snapshot('2026-08-31T12:00:00.000Z')]);
    sourceRecord.editor = {
        capturedAt: '2026-08-31T12:00:00.000Z',
        title: 'Chicken Shirt | Farmhouse Tee',
        tags: ['Chicken Shirt'],
        description: '',
        materials: [],
    };
    assert.deepEqual(plain(api.researchSeedKeywords(sourceRecord)), ['Chicken Shirt', 'Farmhouse Tee', 'Chicken Shirt | Farmhouse Tee']);
    assert.match(await api.researchContentHash(sourceRecord), /^[a-f0-9]{64}$/);
});

test('Marketplace Insights protocol accepts exact trusted payloads and rejects drift', () => {
    const { api } = loadAnalyzer();
    const now = Date.now();
    const outgoing = plain(api.researchEnvelope(
        'PROBE',
        'probe:test-001',
        'abcdefghijklmnop',
        { wants: ['research'] },
        now + 60_000,
    ));
    assert.equal(outgoing.sender, 'listing-analyzer');
    assert.throws(() => api.researchEnvelope('PROBE', 'probe:test-001', 'abcdefghijklmnop', { filler: 'x'.repeat(70_000) }, now + 60_000), /64 KiB/);

    const capabilities = {
        version: '1.0.3', standalone: true, maxSeedKeywords: 3,
        maxRelatedKeywords: 25, cacheTtlDays: 7, networkAccess: false,
    };
    const inbound = {
        ...outgoing,
        type: 'CAPABILITIES',
        sender: 'keyword-market-analyzer',
        payload: capabilities,
    };
    assert.equal(api.validateResearchEnvelope(inbound, ['CAPABILITIES']).type, 'CAPABILITIES');
    assert.deepEqual(plain(api.validateResearchCapabilities(capabilities)), capabilities);
    assert.deepEqual(plain(api.validateResearchReadyPayload({ state: 'ready' })), { state: 'ready' });
    assert.deepEqual(plain(api.validateResearchReadyPayload({ state: 'busy', activeRequestId: 'research:test-001' })), { state: 'busy', activeRequestId: 'research:test-001' });
    assert.deepEqual(plain(api.validateResearchAckPayload({ accepted: true, queuePosition: 0 })), { accepted: true, queuePosition: 0 });
    assert.deepEqual(plain(api.validateResearchErrorPayload({ code: 'QUERY_FAILED', message: '  Etsy query failed  ', retryable: true })), { code: 'QUERY_FAILED', message: 'Etsy query failed', retryable: true });

    assert.throws(() => api.validateResearchEnvelope({ ...inbound, extra: true }, ['CAPABILITIES']), /keys mismatch/);
    assert.throws(() => api.validateResearchEnvelope({ ...inbound, sender: 'unknown' }, ['CAPABILITIES']), /sender/);
    assert.throws(() => api.validateResearchEnvelope({ ...inbound, sentAt: now - 120_000, expiresAt: now - 60_000 }, ['CAPABILITIES']), /expired/);
    assert.throws(() => api.validateResearchCapabilities({ ...capabilities, networkAccess: true }), /capabilities/);
    assert.throws(() => api.validateResearchReadyPayload({ state: 'busy', activeRequestId: 'short' }), /active research request/);
    assert.throws(() => api.validateResearchAckPayload({ accepted: true, queuePosition: -1 }), /acknowledgement/);
    assert.throws(() => api.validateResearchErrorPayload({ code: 'bad', message: 'x', retryable: true }), /error code/);
});

test('Marketplace Insights result produces a validated title/tag plan and rematerializes after editor capture', () => {
    const { api } = loadAnalyzer();
    const contentHash = 'a'.repeat(64);
    const entry = {
        requestId: 'research:test-001', opaqueReference: 'L001', contentHash, editableDataCaptured: true,
    };
    const rawResult = {
        schema: 'makaytron-listing-research-result/v1',
        opaqueReference: 'L001',
        contentHash,
        capturedAt: new Date().toISOString(),
        source: 'etsy-marketplace-insights-dom',
        keywords: [
            { keyword: 'patriotic chicken', searches30d: 320, searchResults: 9400, trend7dPercent: 12.5, opportunity: { score: 93, label: 'HIGH', metric: 'makaytron-derived' } },
            { keyword: 'farmhouse chicken', searches30d: 140, searchResults: 5100, trend7dPercent: null, opportunity: { score: 78, label: 'MEDIUM', metric: 'makaytron-derived' } },
        ],
    };
    const result = api.validateResearchResultPayload(rawResult, entry);
    assert.equal(result.keywords.length, 2);
    assert.throws(() => api.validateResearchResultPayload({ ...rawResult, keywords: [...rawResult.keywords, { ...rawResult.keywords[0], keyword: 'PATRIOTIC CHICKEN' }] }, entry), /duplicate/);
    assert.throws(
        () => api.validateResearchResultPayload({ ...rawResult, contentHash: 'b'.repeat(64) }, entry),
        (error) => error?.code === 'RESEARCH_STALE',
    );

    const listing = record('902', [snapshot('2026-08-31T12:00:00.000Z')]);
    listing.editor = {
        capturedAt: '2026-08-31T12:00:00.000Z',
        title: 'Fourth of July Shirt',
        description: 'Description',
        tags: ['summer tee', 'july fourth', 'usa shirt', 'gift for her', 'gift for him', 'country tee', 'farm life', 'hen shirt', 'red white blue', 'holiday top', 'graphic tee', 'unisex shirt'],
        materials: ['cotton'],
    };
    const suggestion = api.buildResearchSuggestion(listing, result, entry);
    const validated = api.validateResearchSuggestion(suggestion);
    assert.equal(validated.action, 'UPDATE');
    assert.deepEqual(plain(validated.fields).sort(), ['tags', 'title']);
    assert.match(validated.title, /^patriotic chicken \| /i);
    assert.ok(validated.tags.includes('patriotic chicken'));
    assert.equal(validated.tags.length, 13);
    assert.equal(validated.researchEvidence.requestId, entry.requestId);

    const uncapturedEntry = { ...entry, editableDataCaptured: false };
    const uncaptured = record('903', [snapshot('2026-08-31T12:00:00.000Z')], { title: 'Fourth of July Shirt' });
    uncaptured.researchSuggestion = api.buildResearchSuggestion(uncaptured, result, uncapturedEntry);
    assert.equal(uncaptured.researchSuggestion.requiresEditorCapture, true);
    assert.deepEqual(plain(uncaptured.researchSuggestion.fields), ['title']);
    uncaptured.editor = { ...listing.editor, tags: listing.editor.tags.slice(0, 11) };
    const rematerialized = api.researchSuggestionForRecord(uncaptured);
    assert.equal(rematerialized.requiresEditorCapture, false);
    assert.ok(rematerialized.fields.includes('tags'));
});

test('improvement experiments reach winner, underperformed, contaminated, and inconclusive states deterministically', () => {
    const { api } = loadAnalyzer();
    const evaluateAt = '2026-02-01T00:00:00.000Z';
    const make = (id, beforeVisits, afterVisits, improvements) => ({
        ...record(id, [
            snapshot('2026-01-01T00:00:00.000Z', { visits: beforeVisits }),
            snapshot('2026-01-31T00:00:00.000Z', { visits: afterVisits }),
        ]),
        improvements,
    });
    const improvement = (id, publishedAt = '2026-01-01T00:00:00.000Z') => ({
        id, action: 'UPDATE', status: 'published', publishedAt, fields: ['title'],
        baselineSnapshot: snapshot('2026-01-01T00:00:00.000Z', { visits: 40 }),
    });

    const winner = make('904', 40, 100, [improvement('win')]);
    api.updateExperimentEvaluations(winner, evaluateAt);
    assert.equal(winner.improvements[0].experiment.state, 'winner');
    assert.equal(winner.improvements[0].experiment.effectPercent, 150);

    const underperformed = make('905', 40, 20, [improvement('loss')]);
    api.updateExperimentEvaluations(underperformed, evaluateAt);
    assert.equal(underperformed.improvements[0].experiment.state, 'underperformed');
    assert.equal(underperformed.improvements[0].experiment.effectPercent, -50);

    const severeDecline = make('905-severe', 100, 10, [{
        ...improvement('severe-loss'),
        baselineSnapshot: snapshot('2026-01-01T00:00:00.000Z', { visits: 100 }),
    }]);
    api.updateExperimentEvaluations(severeDecline, evaluateAt);
    assert.equal(severeDecline.improvements[0].experiment.state, 'underperformed');
    assert.equal(severeDecline.improvements[0].experiment.effectPercent, -90);

    const contaminated = make('906', 40, 60, [improvement('first'), improvement('second', '2026-01-05T00:00:00.000Z')]);
    api.updateExperimentEvaluations(contaminated, evaluateAt);
    assert.equal(contaminated.improvements[0].experiment.state, 'contaminated');
    assert.equal(contaminated.improvements[0].experiment.contaminatedAt, '2026-01-05T00:00:00.000Z');

    const inconclusive = make('907', 40, 10, [improvement('missing')]);
    inconclusive.history = [snapshot('2026-01-01T00:00:00.000Z', { visits: 40 })];
    api.updateExperimentEvaluations(inconclusive, evaluateAt);
    assert.equal(inconclusive.improvements[0].experiment.state, 'observing');
    assert.equal(inconclusive.improvements[0].experiment.waitingForSnapshot, true);
    assert.equal(inconclusive.improvements[0].experiment.evaluatedAt, undefined);
    api.updateExperimentEvaluations(inconclusive, '2026-02-08T00:00:00.000Z');
    assert.equal(inconclusive.improvements[0].experiment.state, 'inconclusive');
});

test('rate experiments require a separated Poisson rate-ratio interval instead of tiny-count wins', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-02-01T00:00:00.000Z';
    const candidate = record('rate-small-sample', [
        snapshot('2026-01-01T00:00:00.000Z', { visits: 20, favorites: 1 }),
        snapshot('2026-01-31T00:00:00.000Z', { visits: 20, favorites: 2 }),
    ]);
    candidate.improvements.push({
        id: 'favorite-rate', action: 'UPDATE', status: 'published', publishedAt: '2026-01-01T00:00:00.000Z', fields: ['materials'],
        baselineSnapshot: snapshot('2026-01-01T00:00:00.000Z', { visits: 20, favorites: 1 }),
    });
    api.updateExperimentEvaluations(candidate, evaluatedAt);
    assert.equal(candidate.improvements[0].experiment.effectPercent, 100);
    assert.equal(candidate.improvements[0].experiment.state, 'inconclusive');
    const interval = candidate.improvements[0].experiment.current.rateRatioInterval;
    assert.ok(interval.low <= 1 && interval.high >= 1);

    const visitsCandidate = record('visits-small-sample', [
        snapshot('2026-01-01T00:00:00.000Z', { visits: 20 }),
        snapshot('2026-01-31T00:00:00.000Z', { visits: 24 }),
    ]);
    visitsCandidate.improvements.push({
        id: 'visit-rate', action: 'UPDATE', status: 'published', publishedAt: '2026-01-01T00:00:00.000Z', fields: ['title'],
        baselineSnapshot: snapshot('2026-01-01T00:00:00.000Z', { visits: 20 }),
    });
    api.updateExperimentEvaluations(visitsCandidate, evaluatedAt);
    assert.equal(visitsCandidate.improvements[0].experiment.effectPercent, 20);
    assert.equal(visitsCandidate.improvements[0].experiment.state, 'inconclusive');
    const visitsInterval = visitsCandidate.improvements[0].experiment.current.rateRatioInterval;
    assert.ok(visitsInterval.low <= 1 && visitsInterval.high >= 1);
});

test('experiment grace accepts the first valid late snapshot and zero-baseline effects stay non-percent', () => {
    const { api } = loadAnalyzer();
    const delayed = record('experiment-grace', [snapshot('2026-01-01T00:00:00.000Z', { visits: 40 })]);
    delayed.improvements.push({
        id: 'grace', action: 'UPDATE', status: 'published', publishedAt: '2026-01-01T00:00:00.000Z', fields: ['title'],
        baselineSnapshot: snapshot('2026-01-01T00:00:00.000Z', { visits: 40 }),
    });
    api.updateExperimentEvaluations(delayed, '2026-02-01T00:00:00.000Z');
    assert.equal(delayed.improvements[0].experiment.state, 'observing');
    assert.equal(delayed.improvements[0].experiment.waitingForSnapshot, true);
    delayed.history.push(snapshot('2026-02-05T00:00:00.000Z', { visits: 100 }));
    api.updateExperimentEvaluations(delayed, '2026-02-05T00:00:00.000Z');
    assert.equal(delayed.improvements[0].experiment.state, 'winner');
    assert.equal(delayed.improvements[0].experiment.evaluationDelayDays, 5);

    const zeroBaseline = record('experiment-zero-baseline', [
        snapshot('2026-01-01T00:00:00.000Z', { visits: 100, favorites: 0 }),
        snapshot('2026-01-31T00:00:00.000Z', { visits: 100, favorites: 6 }),
    ]);
    zeroBaseline.improvements.push({
        id: 'zero-favorites', action: 'UPDATE', status: 'published', publishedAt: '2026-01-01T00:00:00.000Z', fields: ['materials'],
        baselineSnapshot: snapshot('2026-01-01T00:00:00.000Z', { visits: 100, favorites: 0 }),
    });
    api.updateExperimentEvaluations(zeroBaseline, '2026-02-01T00:00:00.000Z');
    const experiment = zeroBaseline.improvements[0].experiment;
    assert.equal(experiment.state, 'winner');
    assert.equal(experiment.effectKind, 'from-zero');
    assert.equal(experiment.effectPercent, null);
    assert.equal(experiment.effectAbsolute, 6);
    assert.ok(experiment.current.rateRatioInterval.low > 1);
    assert.equal(experiment.current.rateRatioInterval.highOpen, true);
});

test('experiments reject look-ahead snapshots and compact approximate counts', () => {
    const { api } = loadAnalyzer();
    const lookAhead = record('experiment-look-ahead', [
        snapshot('2026-01-01T00:00:00.000Z', { visits: 40 }),
        snapshot('2026-02-05T00:00:00.000Z', { visits: 100 }),
    ]);
    lookAhead.improvements.push({
        id: 'future-snapshot', action: 'UPDATE', status: 'published', publishedAt: '2026-01-01T00:00:00.000Z', fields: ['title'],
        baselineSnapshot: snapshot('2026-01-01T00:00:00.000Z', { visits: 40 }),
    });
    api.updateExperimentEvaluations(lookAhead, '2026-02-01T00:00:00.000Z');
    assert.equal(lookAhead.improvements[0].experiment.state, 'observing');
    assert.equal(lookAhead.improvements[0].experiment.waitingForSnapshot, true);
    assert.equal(lookAhead.improvements[0].experiment.evaluationSnapshotAt, undefined);
    api.updateExperimentEvaluations(lookAhead, '2026-02-05T00:00:00.000Z');
    assert.equal(lookAhead.improvements[0].experiment.state, 'winner');

    const approximateContract = plain(snapshot('2026-01-01T00:00:00.000Z').metricContract);
    approximateContract.countPrecision.visits = 'approximate';
    const approximate = record('experiment-approximate-count', [
        snapshot('2026-01-01T00:00:00.000Z', { visits: 1_200, metricContract: approximateContract }),
        snapshot('2026-01-31T00:00:00.000Z', { visits: 2_400, metricContract: approximateContract }),
    ]);
    approximate.improvements.push({
        id: 'approximate', action: 'UPDATE', status: 'published', publishedAt: '2026-01-01T00:00:00.000Z', fields: ['title'],
        baselineSnapshot: snapshot('2026-01-01T00:00:00.000Z', { visits: 1_200, metricContract: approximateContract }),
    });
    api.updateExperimentEvaluations(approximate, '2026-02-08T00:00:00.000Z');
    assert.equal(approximate.improvements[0].experiment.state, 'inconclusive');
    assert.equal(approximate.improvements[0].experiment.invalidReason, 'approximate-counts');
    assert.equal(approximate.improvements[0].experiment.current, undefined);
});

test('a second publication before the used grace snapshot contaminates the earlier experiment', () => {
    const { api } = loadAnalyzer();
    const candidate = record('experiment-late-contamination', [
        snapshot('2026-01-01T00:00:00.000Z', { visits: 40 }),
        snapshot('2026-02-05T00:00:00.000Z', { visits: 100 }),
    ]);
    candidate.improvements.push(
        {
            id: 'first', action: 'UPDATE', status: 'published', publishedAt: '2026-01-01T00:00:00.000Z', fields: ['title'],
            baselineSnapshot: snapshot('2026-01-01T00:00:00.000Z', { visits: 40 }),
        },
        {
            id: 'second', action: 'UPDATE', status: 'published', publishedAt: '2026-02-02T00:00:00.000Z', fields: ['tags'],
            baselineSnapshot: snapshot('2026-02-02T00:00:00.000Z', { visits: 40 }),
        },
    );
    api.updateExperimentEvaluations(candidate, '2026-02-05T00:00:00.000Z');
    assert.equal(candidate.improvements[0].experiment.state, 'contaminated');
    assert.equal(candidate.improvements[0].experiment.contaminatedAt, '2026-02-02T00:00:00.000Z');
});

test('sales experiments require matched 30-day windows and reject a stale publication baseline', () => {
    const { api } = loadAnalyzer();
    const delayed = record('sales-window-normalized', [
        snapshot('2025-12-02T00:00:00.000Z', { visits: 100, sales: 0 }),
        snapshot('2026-01-01T00:00:00.000Z', { visits: 100, sales: 3 }),
        snapshot('2026-02-07T00:00:00.000Z', { visits: 100, sales: 5 }),
    ]);
    delayed.improvements.push({
        id: 'sales-window', action: 'UPDATE', status: 'published', publishedAt: '2026-01-01T00:00:00.000Z', fields: ['description'],
        baselineSnapshot: snapshot('2026-01-01T00:00:00.000Z', { visits: 100, sales: 3 }),
    });
    api.updateExperimentEvaluations(delayed, '2026-02-08T00:00:00.000Z');
    assert.equal(delayed.improvements[0].experiment.state, 'inconclusive');
    assert.equal(delayed.improvements[0].experiment.invalidReason, 'window-mismatch');

    const matched = record('sales-window-matched', [
        snapshot('2025-12-02T00:00:00.000Z', { visits: 100, sales: 0 }),
        snapshot('2026-01-01T00:00:00.000Z', { visits: 100, sales: 2 }),
        snapshot('2026-01-08T00:00:00.000Z', { visits: 100, sales: 2 }),
        snapshot('2026-02-07T00:00:00.000Z', { visits: 100, sales: 12 }),
    ]);
    matched.improvements.push({
        id: 'sales-window-valid', action: 'UPDATE', status: 'published', publishedAt: '2026-01-01T00:00:00.000Z', fields: ['description'],
        baselineSnapshot: snapshot('2026-01-01T00:00:00.000Z', { visits: 100, sales: 2 }),
    });
    api.updateExperimentEvaluations(matched, '2026-02-07T00:00:00.000Z');
    const evaluated = matched.improvements[0].experiment;
    assert.equal(evaluated.state, 'winner');
    assert.equal(evaluated.baseline.rawSales, 2);
    assert.equal(evaluated.current.rawSales, 10);
    assert.equal(evaluated.baseline.windowDays, 30);
    assert.equal(evaluated.current.windowDays, 30);
    assert.equal(evaluated.current.rateRatioInterval.beforeEvents, 2);
    assert.equal(evaluated.current.rateRatioInterval.afterEvents, 10);
    assert.equal(evaluated.evaluationDelayDays, 7);

    const sparseMatched = record('sales-window-sparse', [
        snapshot('2025-12-02T00:00:00.000Z', { visits: 100, sales: 0 }),
        snapshot('2026-01-01T00:00:00.000Z', { visits: 100, sales: 2 }),
        snapshot('2026-01-08T00:00:00.000Z', { visits: 100, sales: 2 }),
        snapshot('2026-02-07T00:00:00.000Z', { visits: 100, sales: 10 }),
    ]);
    sparseMatched.improvements.push({
        id: 'sales-window-sparse', action: 'UPDATE', status: 'published', publishedAt: '2026-01-01T00:00:00.000Z', fields: ['description'],
        baselineSnapshot: snapshot('2026-01-01T00:00:00.000Z', { visits: 100, sales: 2 }),
    });
    api.updateExperimentEvaluations(sparseMatched, '2026-02-07T00:00:00.000Z');
    assert.equal(sparseMatched.improvements[0].experiment.current.rawSales, 8);
    assert.equal(sparseMatched.improvements[0].experiment.state, 'inconclusive');

    const interruptedBaseline = record('sales-window-interrupted-baseline', [
        snapshot('2025-12-02T00:00:00.000Z', { visits: 100, sales: 0 }),
        snapshot('2025-12-15T00:00:00.000Z', { visits: 100, sales: 1, listingState: 'inactive', statusLabel: 'Inactive' }),
        snapshot('2026-01-01T00:00:00.000Z', { visits: 100, sales: 2 }),
        snapshot('2026-01-08T00:00:00.000Z', { visits: 100, sales: 2 }),
        snapshot('2026-02-07T00:00:00.000Z', { visits: 100, sales: 12 }),
    ]);
    interruptedBaseline.improvements.push({
        id: 'sales-window-interrupted', action: 'UPDATE', status: 'published', publishedAt: '2026-01-01T00:00:00.000Z', fields: ['description'],
        baselineSnapshot: snapshot('2026-01-01T00:00:00.000Z', { visits: 100, sales: 2 }),
    });
    api.updateExperimentEvaluations(interruptedBaseline, '2026-02-08T00:00:00.000Z');
    assert.equal(interruptedBaseline.improvements[0].experiment.state, 'inconclusive');
    assert.equal(interruptedBaseline.improvements[0].experiment.invalidReason, 'listing-state-changed');

    const unverifiedPrice = record('sales-window-unverified-price', [
        snapshot('2025-12-02T00:00:00.000Z', { visits: 100, sales: 0 }),
        snapshot('2026-01-08T00:00:00.000Z', { visits: 100, sales: 2 }),
        snapshot('2026-02-07T00:00:00.000Z', { visits: 100, sales: 12 }),
    ]);
    unverifiedPrice.improvements.push({
        id: 'sales-window-price', action: 'UPDATE', status: 'published', publishedAt: '2026-01-01T00:00:00.000Z', fields: ['description'],
        baselineSnapshot: snapshot('2026-01-01T00:00:00.000Z', { visits: 100, sales: 2, priceMin: null }),
    });
    api.updateExperimentEvaluations(unverifiedPrice, '2026-02-07T00:00:00.000Z');
    assert.equal(unverifiedPrice.improvements[0].experiment.state, 'contaminated');
    assert.equal(unverifiedPrice.improvements[0].experiment.invalidReason, 'price-exposure-unverified');

    const mismatchedDurations = record('sales-window-duration-mismatch', [
        snapshot('2025-12-03T00:00:00.000Z', { visits: 100, sales: 0 }),
        snapshot('2026-01-01T00:00:00.000Z', { visits: 100, sales: 2 }),
        snapshot('2026-01-07T00:00:00.000Z', { visits: 100, sales: 2 }),
        snapshot('2026-02-07T00:00:00.000Z', { visits: 100, sales: 12 }),
    ]);
    mismatchedDurations.improvements.push({
        id: 'sales-window-duration', action: 'UPDATE', status: 'published', publishedAt: '2026-01-01T00:00:00.000Z', fields: ['description'],
        baselineSnapshot: snapshot('2026-01-01T00:00:00.000Z', { visits: 100, sales: 2 }),
    });
    api.updateExperimentEvaluations(mismatchedDurations, '2026-02-08T00:00:00.000Z');
    assert.equal(mismatchedDurations.improvements[0].experiment.state, 'inconclusive');
    assert.equal(mismatchedDurations.improvements[0].experiment.invalidReason, 'window-mismatch');

    const stale = record('sales-stale-baseline', [
        snapshot('2025-12-02T00:00:00.000Z', { visits: 100, sales: 0 }),
        snapshot('2025-12-29T00:00:00.000Z', { visits: 100, sales: 2 }),
        snapshot('2026-01-31T00:00:00.000Z', { visits: 100, sales: 4 }),
    ]);
    stale.improvements.push({
        id: 'stale-baseline', action: 'UPDATE', status: 'published', publishedAt: '2026-01-01T00:00:00.000Z', fields: ['description'],
        baselineSnapshot: snapshot('2025-12-29T00:00:00.000Z', { visits: 100, sales: 2 }),
    });
    api.updateExperimentEvaluations(stale, '2026-02-08T00:00:00.000Z');
    assert.equal(stale.improvements[0].experiment.state, 'inconclusive');
    assert.equal(stale.improvements[0].experiment.current, undefined);
});

test('sales experiment anchors prefer exact counts over a closer approximate capture', () => {
    const { api } = loadAnalyzer();
    const baselineAt = '2026-01-01T00:00:00.000Z';
    const currentAt = '2026-01-31T00:00:00.000Z';
    const before = (days) => new Date(Date.parse(baselineAt) - days * 86400000).toISOString();
    const approximateContract = plain(snapshot(baselineAt).metricContract);
    approximateContract.countPrecision.sales = 'approximate';
    const candidate = record('sales-anchor-exact-first', [
        snapshot(before(30.1), { visits: 100, sales: 0 }),
        snapshot(before(29.95), { visits: 100, sales: 1, metricContract: approximateContract }),
        snapshot(baselineAt, { visits: 100, sales: 2 }),
        snapshot(currentAt, { visits: 100, sales: 12 }),
    ]);
    candidate.improvements.push({
        id: 'sales-anchor-selection', action: 'UPDATE', status: 'published', publishedAt: baselineAt, fields: ['description'],
        baselineSnapshot: snapshot(baselineAt, { visits: 100, sales: 2 }),
    });
    api.updateExperimentEvaluations(candidate, '2026-02-01T00:00:00.000Z');
    const experiment = candidate.improvements[0].experiment;
    assert.equal(experiment.state, 'winner');
    assert.equal(experiment.baseline.rawSales, 2);
    assert.equal(experiment.current.rawSales, 10);
    assert.equal(experiment.baseline.windowDays, 30.1);
    assert.equal(experiment.current.windowDays, 30);
});

test('stale skip cannot resurrect or overwrite a newer stored queue', async () => {
    const { api, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const stale = {
        schema: api.versions.queueSchema, id: 'queue-old', status: 'ready', cursor: 0,
        items: [
            { listingId: '9200000001', status: 'pending', editUrl: 'https://www.etsy.com/your/shops/me/listing-editor/edit/9200000001', proposal: { action: 'UPDATE' } },
            { listingId: '9200000002', status: 'pending', editUrl: 'https://www.etsy.com/your/shops/me/listing-editor/edit/9200000002', proposal: { action: 'UPDATE' } },
        ],
    };
    const newer = {
        schema: api.versions.queueSchema, id: 'queue-new', status: 'completed', cursor: 1,
        items: [{ listingId: '9200000003', status: 'verified', editUrl: 'https://www.etsy.com/your/shops/me/listing-editor/edit/9200000003', proposal: { action: 'UPDATE' } }],
    };
    runtime.state.queue = plain(stale);
    storage.set(runtime.KEYS.queue, plain(newer));
    await runtime.skipCurrentItem();
    assert.deepEqual(plain(storage.get(runtime.KEYS.queue)), newer);
    assert.deepEqual(plain(runtime.state.queue), newer);
    assert.equal(storage.has(runtime.KEYS.audit), false);
    assert.equal(storage.has(runtime.KEYS.lease), false);
});

test('UPDATE apply and publish revalidate the durable proposal before DOM mutation and final click', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const listingId = '9300000001';
    const editor = {
        title: 'Original durable title', description: 'Stable description', tags: ['stable'], materials: ['cotton'],
    };
    const base = record(listingId, [snapshot(new Date().toISOString())], {
        title: editor.title,
        editUrl: `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`,
    });
    base.editor = { ...plain(editor), capturedAt: new Date().toISOString() };
    await runtime.Store.putRecord(base);
    const first = await runtime.Store.saveProposal(listingId, {
        action: 'UPDATE', fields: ['title'], title: 'Queued title A', reason: 'first proposal',
    });
    const queuedProposal = plain(first.proposal);
    const second = await runtime.Store.saveProposal(listingId, {
        action: 'UPDATE', fields: ['title'], title: 'New durable title B', reason: 'replacement proposal',
    });
    assert.notEqual(second.proposal.improvementId, queuedProposal.improvementId);

    const pendingQueue = {
        schema: api.versions.queueSchema, id: 'queue-stale-update-apply', status: 'ready', cursor: 0,
        items: [{
            listingId, status: 'pending', attempts: 0, error: '', before: null, changedFields: [],
            editUrl: `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`,
            proposal: queuedProposal,
        }],
    };
    runtime.state.queue = plain(pendingQueue);
    storage.set(runtime.KEYS.queue, plain(pendingQueue));
    sandbox.location.pathname = `/your/shops/me/listing-editor/edit/${listingId}`;
    sandbox.location.search = '';
    sandbox.location.href = `https://www.etsy.com${sandbox.location.pathname}`;

    const originals = {
        preflight: runtime.EditorAdapter.preflightProposal,
        clean: runtime.EditorAdapter.formIsClean,
        read: runtime.EditorAdapter.read,
        apply: runtime.EditorAdapter.applyProposal,
        button: runtime.EditorAdapter.publishButton,
        status: runtime.EditorAdapter.statusText,
    };
    let applyCalls = 0;
    let publishClicks = 0;
    let providerStatus = 'Editing';
    let publishEnabled = false;
    const publishButton = {
        get disabled() { return !publishEnabled; },
        getAttribute(name) { return name === 'aria-disabled' ? null : null; },
        click() { publishClicks += 1; providerStatus = 'Saved'; publishEnabled = false; },
    };
    runtime.EditorAdapter.preflightProposal = () => true;
    runtime.EditorAdapter.formIsClean = () => true;
    runtime.EditorAdapter.read = () => completeEditorSnapshot(api, editor);
    runtime.EditorAdapter.applyProposal = async (proposal) => {
        applyCalls += 1;
        editor.title = proposal.title;
        return ['title'];
    };
    runtime.EditorAdapter.publishButton = () => publishButton;
    runtime.EditorAdapter.statusText = () => providerStatus;
    try {
        await runtime.applyCurrentProposal();
        assert.equal(applyCalls, 0);
        assert.equal(editor.title, 'Original durable title');
        assert.equal(storage.get(runtime.KEYS.queue).items[0].status, 'failed');
        assert.equal(storage.has(runtime.KEYS.lease), false);

        const awaitingQueue = {
            ...plain(pendingQueue), id: 'queue-stale-update-publish', status: 'running',
            items: [{
                ...plain(pendingQueue.items[0]), status: 'awaiting-user-review',
                changedFields: ['title'], runtimeOwner: 'previous-page-instance',
            }],
        };
        editor.title = queuedProposal.title;
        publishEnabled = true;
        runtime.state.queue = plain(awaitingQueue);
        storage.set(runtime.KEYS.queue, plain(awaitingQueue));
        await runtime.publishCurrentProposal();
        assert.equal(publishClicks, 0);
        assert.equal(storage.get(runtime.KEYS.queue).items[0].status, 'awaiting-user-review');
        assert.equal(storage.has(runtime.KEYS.lease), false);
        assert.equal((await runtime.Store.getRecord(listingId)).proposal.improvementId, second.proposal.improvementId);
    } finally {
        runtime.EditorAdapter.preflightProposal = originals.preflight;
        runtime.EditorAdapter.formIsClean = originals.clean;
        runtime.EditorAdapter.read = originals.read;
        runtime.EditorAdapter.applyProposal = originals.apply;
        runtime.EditorAdapter.publishButton = originals.button;
        runtime.EditorAdapter.statusText = originals.status;
    }
});

test('UPDATE fences untouched editor fields after apply and before publish', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const listingId = '9300000010';
    const baseline = {
        title: 'Untouched title', description: 'Untouched description', tags: ['old-tag'], materials: ['cotton'],
        quantity: '5', sku: 'SKU-5',
    };
    const editor = plain(baseline);
    const candidate = record(listingId, [snapshot(new Date().toISOString())], {
        title: baseline.title,
        editUrl: `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`,
    });
    candidate.editor = { ...plain(baseline), capturedAt: new Date().toISOString() };
    await runtime.Store.loadSettings();
    await runtime.Store.putRecord(candidate);
    const saved = await runtime.Store.saveProposal(listingId, {
        action: 'UPDATE', fields: ['tags'], tags: ['new-tag'], reason: 'untouched-field fence',
    });
    const queue = {
        schema: api.versions.queueSchema, id: 'queue-editor-overlay-fence', status: 'ready', cursor: 0,
        items: [{
            listingId, status: 'pending', attempts: 0, error: '', before: null, changedFields: [],
            editUrl: candidate.meta.editUrl, proposal: plain(saved.proposal),
        }],
    };
    runtime.state.queue = plain(queue);
    storage.set(runtime.KEYS.queue, plain(queue));
    sandbox.location.pathname = `/your/shops/me/listing-editor/edit/${listingId}`;
    sandbox.location.search = '';
    sandbox.location.href = `https://www.etsy.com${sandbox.location.pathname}`;
    const originals = {
        preflight: runtime.EditorAdapter.preflightProposal,
        clean: runtime.EditorAdapter.formIsClean,
        read: runtime.EditorAdapter.read,
        apply: runtime.EditorAdapter.applyProposal,
        restore: runtime.EditorAdapter.restore,
        button: runtime.EditorAdapter.publishButton,
        status: runtime.EditorAdapter.statusText,
    };
    let injectUntouchedDrift = true;
    let applyCalls = 0;
    let publishClicks = 0;
    runtime.EditorAdapter.preflightProposal = () => true;
    runtime.EditorAdapter.formIsClean = () => true;
    runtime.EditorAdapter.read = () => completeEditorSnapshot(api, editor);
    runtime.EditorAdapter.applyProposal = async (proposal) => {
        applyCalls += 1;
        editor.tags = [...proposal.tags];
        if (injectUntouchedDrift) editor.title = 'Parallel unexpected title';
        return ['tags'];
    };
    runtime.EditorAdapter.restore = async (before, fields) => {
        fields.forEach((field) => { editor[field] = Array.isArray(before[field]) ? [...before[field]] : before[field]; });
        return true;
    };
    let publishEnabled = false;
    const publishButton = {
        get disabled() { return !publishEnabled; },
        getAttribute: () => null,
        click() { publishClicks += 1; },
    };
    runtime.EditorAdapter.publishButton = () => publishButton;
    runtime.EditorAdapter.statusText = () => 'Editing';
    try {
        publishEnabled = true;
        await runtime.applyCurrentProposal();
        assert.equal(applyCalls, 0);
        assert.equal(storage.get(runtime.KEYS.queue).items[0].status, 'pending');
        publishEnabled = false;
        await runtime.applyCurrentProposal();
        assert.equal(applyCalls, 1);
        assert.equal(storage.get(runtime.KEYS.queue).items[0].status, 'awaiting-user-review');
        assert.equal(editor.title, 'Parallel unexpected title');
        assert.deepEqual(editor.tags, ['new-tag']);
        assert.deepEqual(plain(storage.get(runtime.KEYS.queue).items[0].changedFields), ['title', 'tags']);
        assert.equal(storage.has(runtime.KEYS.lease), false);

        editor.title = baseline.title;
        editor.tags = [...baseline.tags];
        await runtime.recoverCurrentItem();
        assert.equal(storage.get(runtime.KEYS.queue).items[0].status, 'pending');
        injectUntouchedDrift = false;
        await runtime.applyCurrentProposal();
        const awaiting = plain(storage.get(runtime.KEYS.queue));
        assert.equal(awaiting.items[0].status, 'awaiting-user-review');
        assert.deepEqual(awaiting.items[0].changedFields, ['tags']);
        publishEnabled = true;
        editor.title = 'Autosaved unrelated title';
        await runtime.publishCurrentProposal();
        assert.equal(publishClicks, 0);
        assert.equal(storage.get(runtime.KEYS.queue).items[0].status, 'awaiting-user-review');
        assert.equal(storage.has(runtime.KEYS.lease), false);
    } finally {
        runtime.EditorAdapter.preflightProposal = originals.preflight;
        runtime.EditorAdapter.formIsClean = originals.clean;
        runtime.EditorAdapter.read = originals.read;
        runtime.EditorAdapter.applyProposal = originals.apply;
        runtime.EditorAdapter.restore = originals.restore;
        runtime.EditorAdapter.publishButton = originals.button;
        runtime.EditorAdapter.statusText = originals.status;
        if (runtime.state.leaseToken) await runtime.Lease.release();
    }
});

test('slow UPDATE form work leaves the storage lock free for lease renewal', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const listingId = '9300000011';
    const capturedAt = new Date().toISOString();
    const editor = { title: 'Lease baseline', description: 'Stable description', tags: ['stable'], materials: ['cotton'] };
    const candidate = record(listingId, [snapshot(capturedAt)], {
        title: editor.title, editUrl: `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`,
    });
    candidate.editor = { ...plain(editor), capturedAt };
    await runtime.Store.loadSettings();
    await runtime.Store.putRecord(candidate);
    const saved = await runtime.Store.saveProposal(listingId, {
        action: 'UPDATE', fields: ['title'], title: 'Lease-renewed title', reason: 'slow apply fixture',
    });
    const queue = {
        schema: api.versions.queueSchema, id: 'queue-slow-apply', status: 'ready', cursor: 0,
        items: [{
            listingId, status: 'pending', attempts: 0, error: '', before: null, changedFields: [],
            editUrl: candidate.meta.editUrl, proposal: plain(saved.proposal),
        }],
    };
    runtime.state.queue = plain(queue);
    storage.set(runtime.KEYS.queue, plain(queue));
    sandbox.location.pathname = `/your/shops/me/listing-editor/edit/${listingId}`;
    sandbox.location.search = '';
    sandbox.location.href = `https://www.etsy.com${sandbox.location.pathname}`;

    const originals = {
        preflight: runtime.EditorAdapter.preflightProposal,
        clean: runtime.EditorAdapter.formIsClean,
        read: runtime.EditorAdapter.read,
        apply: runtime.EditorAdapter.applyProposal,
        requestLock: sandbox.navigator.locks.request,
        setInterval: sandbox.setInterval,
        clearInterval: sandbox.clearInterval,
    };
    const lockTails = new Map();
    sandbox.navigator.locks.request = (name, _options, callback) => {
        const previous = lockTails.get(name) || Promise.resolve();
        const run = previous.catch(() => {}).then(callback);
        lockTails.set(name, run.catch(() => {}));
        return run;
    };
    let leaseTick = null;
    sandbox.setInterval = (callback, milliseconds) => {
        if (milliseconds === 5000) { leaseTick = callback; return 93011; }
        return originals.setInterval(callback, milliseconds);
    };
    sandbox.clearInterval = (timer) => { if (timer !== 93011) originals.clearInterval(timer); };
    let renewalFinishedDuringApply = false;
    let renewalPromise = Promise.resolve();
    runtime.EditorAdapter.preflightProposal = () => true;
    runtime.EditorAdapter.formIsClean = () => true;
    runtime.EditorAdapter.read = () => completeEditorSnapshot(api, editor);
    runtime.EditorAdapter.applyProposal = async (proposal) => {
        assert.equal(typeof leaseTick, 'function');
        const firstExpiry = Number(storage.get(runtime.KEYS.lease)?.expiresAt);
        renewalPromise = Promise.resolve(leaseTick()).then(() => Number(storage.get(runtime.KEYS.lease)?.expiresAt) > firstExpiry);
        renewalFinishedDuringApply = await Promise.race([
            renewalPromise,
            new Promise((resolve) => setTimeout(() => resolve(false), 20)),
        ]);
        editor.title = proposal.title;
        return ['title'];
    };
    try {
        await runtime.applyCurrentProposal();
        assert.equal(await renewalPromise, true);
        assert.equal(renewalFinishedDuringApply, true);
        assert.equal(storage.get(runtime.KEYS.queue).items[0].status, 'awaiting-user-review');
        assert.equal(editor.title, 'Lease-renewed title');
    } finally {
        runtime.EditorAdapter.preflightProposal = originals.preflight;
        runtime.EditorAdapter.formIsClean = originals.clean;
        runtime.EditorAdapter.read = originals.read;
        runtime.EditorAdapter.applyProposal = originals.apply;
        if (runtime.state.leaseToken) await runtime.Lease.release();
        sandbox.navigator.locks.request = originals.requestLock;
        sandbox.setInterval = originals.setInterval;
        sandbox.clearInterval = originals.clearInterval;
    }
});

test('stored threshold drift blocks UPDATE form mutation and the final publish click', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const listingId = '9300000012';
    const capturedAt = new Date().toISOString();
    const editor = { title: 'Policy baseline', description: 'Stable description', tags: ['stable'], materials: ['cotton'] };
    const candidate = record(listingId, [snapshot(capturedAt)], {
        title: editor.title, editUrl: `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`,
    });
    candidate.editor = { ...plain(editor), capturedAt };
    await runtime.Store.loadSettings();
    await runtime.Store.putRecord(candidate);
    const saved = await runtime.Store.saveProposal(listingId, {
        action: 'UPDATE', fields: ['title'], title: 'Policy proposal', reason: 'policy fence fixture',
    });
    const queue = {
        schema: api.versions.queueSchema, id: 'queue-policy-fence', status: 'ready', cursor: 0,
        items: [{
            listingId, status: 'pending', attempts: 0, error: '', before: null, changedFields: [],
            editUrl: candidate.meta.editUrl, proposal: plain(saved.proposal),
        }],
    };
    runtime.state.queue = plain(queue);
    storage.set(runtime.KEYS.queue, plain(queue));
    sandbox.location.pathname = `/your/shops/me/listing-editor/edit/${listingId}`;
    sandbox.location.search = '';
    sandbox.location.href = `https://www.etsy.com${sandbox.location.pathname}`;
    const originals = {
        preflight: runtime.EditorAdapter.preflightProposal,
        clean: runtime.EditorAdapter.formIsClean,
        read: runtime.EditorAdapter.read,
        apply: runtime.EditorAdapter.applyProposal,
        button: runtime.EditorAdapter.publishButton,
        status: runtime.EditorAdapter.statusText,
    };
    let applyCalls = 0;
    let publishClicks = 0;
    let publishEnabled = false;
    const publishButton = { get disabled() { return !publishEnabled; }, getAttribute: () => null, click: () => { publishClicks += 1; } };
    runtime.EditorAdapter.preflightProposal = () => true;
    runtime.EditorAdapter.formIsClean = () => true;
    runtime.EditorAdapter.read = () => completeEditorSnapshot(api, editor);
    runtime.EditorAdapter.applyProposal = async (proposal) => { applyCalls += 1; editor.title = proposal.title; return ['title']; };
    runtime.EditorAdapter.publishButton = () => publishButton;
    runtime.EditorAdapter.statusText = () => 'Editing';
    try {
        storage.set(runtime.KEYS.settings, {
            minVisitsToImprove: 35, minVisitsToProtect: 85, minRenewalsToReview: 7, declinePercent: 49,
            retentionDays: 400, maxSnapshots: 120,
        });
        await runtime.applyCurrentProposal();
        assert.equal(applyCalls, 0);
        assert.equal(editor.title, 'Policy baseline');
        assert.equal(storage.get(runtime.KEYS.queue).items[0].status, 'failed');

        storage.set(runtime.KEYS.settings, {
            minVisitsToImprove: 20, minVisitsToProtect: 60, minRenewalsToReview: 2, declinePercent: 35,
            retentionDays: 400, maxSnapshots: 120,
        });
        const retryQueue = plain(storage.get(runtime.KEYS.queue));
        retryQueue.items[0].status = 'pending';
        retryQueue.items[0].error = '';
        runtime.state.queue = plain(retryQueue);
        storage.set(runtime.KEYS.queue, plain(retryQueue));
        await runtime.applyCurrentProposal();
        assert.equal(applyCalls, 1);
        assert.equal(storage.get(runtime.KEYS.queue).items[0].status, 'awaiting-user-review');
        publishEnabled = true;
        storage.set(runtime.KEYS.settings, {
            minVisitsToImprove: 35, minVisitsToProtect: 85, minRenewalsToReview: 7, declinePercent: 49,
            retentionDays: 400, maxSnapshots: 120,
        });
        await runtime.publishCurrentProposal();
        assert.equal(publishClicks, 0);
        assert.equal(storage.get(runtime.KEYS.queue).items[0].status, 'awaiting-user-review');
        assert.equal(storage.has(runtime.KEYS.lease), false);
    } finally {
        runtime.EditorAdapter.preflightProposal = originals.preflight;
        runtime.EditorAdapter.formIsClean = originals.clean;
        runtime.EditorAdapter.read = originals.read;
        runtime.EditorAdapter.applyProposal = originals.apply;
        runtime.EditorAdapter.publishButton = originals.button;
        runtime.EditorAdapter.statusText = originals.status;
        if (runtime.state.leaseToken) await runtime.Lease.release();
    }
});

test('two-item UPDATE publish is single-flight and advances once after verified provider save', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const firstListingId = '9300000020';
    const secondListingId = '9300000021';
    const capturedAt = new Date().toISOString();
    const editor = {
        title: 'Single-flight baseline', description: 'Stable description',
        tags: ['stable'], materials: ['cotton'], quantity: '3', sku: 'SINGLE-3',
    };
    await runtime.Store.loadSettings();
    const firstRecord = record(firstListingId, [snapshot(capturedAt)], {
        title: editor.title,
        editUrl: `https://www.etsy.com/your/shops/me/listing-editor/edit/${firstListingId}`,
    });
    firstRecord.editor = { ...plain(editor), capturedAt };
    const secondRecord = record(secondListingId, [snapshot(capturedAt)], {
        title: 'Second queued listing',
        editUrl: `https://www.etsy.com/your/shops/me/listing-editor/edit/${secondListingId}`,
    });
    secondRecord.editor = {
        title: 'Second queued listing', description: 'Second stable description',
        tags: ['second'], materials: ['linen'], quantity: '2', sku: 'NEXT-2', capturedAt,
    };
    await runtime.Store.putRecord(firstRecord);
    await runtime.Store.putRecord(secondRecord);
    const firstSaved = await runtime.Store.saveProposal(firstListingId, {
        action: 'UPDATE', fields: ['title'], title: 'Single-flight published title', reason: 'happy-path publish',
    });
    const secondSaved = await runtime.Store.saveProposal(secondListingId, {
        action: 'UPDATE', fields: ['title'], title: 'Second proposed title', reason: 'next queue item',
    });
    const secondEditUrl = secondRecord.meta.editUrl;
    const queue = {
        schema: api.versions.queueSchema, id: 'queue-two-item-publish-single-flight', status: 'ready', cursor: 0,
        items: [
            {
                listingId: firstListingId, status: 'pending', attempts: 0, error: '', before: null, changedFields: [],
                editUrl: firstRecord.meta.editUrl, proposal: plain(firstSaved.proposal),
            },
            {
                listingId: secondListingId, status: 'pending', attempts: 0, error: '', before: null, changedFields: [],
                editUrl: secondEditUrl, proposal: plain(secondSaved.proposal),
            },
        ],
    };
    runtime.state.queue = plain(queue);
    storage.set(runtime.KEYS.queue, plain(queue));
    sandbox.location.pathname = `/your/shops/me/listing-editor/edit/${firstListingId}`;
    sandbox.location.search = '';
    sandbox.location.href = `https://www.etsy.com${sandbox.location.pathname}`;

    const originals = {
        preflight: runtime.EditorAdapter.preflightProposal,
        clean: runtime.EditorAdapter.formIsClean,
        read: runtime.EditorAdapter.read,
        apply: runtime.EditorAdapter.applyProposal,
        button: runtime.EditorAdapter.publishButton,
        status: runtime.EditorAdapter.statusText,
        navigate: sandbox.__MAKAYTRON_LISTING_NAVIGATE__,
    };
    let providerClicks = 0;
    let publishEnabled = false;
    let providerStatus = 'Editing';
    const navigations = [];
    runtime.EditorAdapter.preflightProposal = () => true;
    runtime.EditorAdapter.formIsClean = () => true;
    runtime.EditorAdapter.read = () => completeEditorSnapshot(api, editor);
    runtime.EditorAdapter.applyProposal = async (proposal) => {
        editor.title = proposal.title;
        return ['title'];
    };
    runtime.EditorAdapter.publishButton = () => ({
        get disabled() { return !publishEnabled; },
        getAttribute: (name) => (name === 'aria-disabled' && !publishEnabled ? 'true' : null),
        click: () => {
            providerClicks += 1;
            providerStatus = 'Saved';
            publishEnabled = false;
        },
    });
    runtime.EditorAdapter.statusText = () => providerStatus;
    sandbox.__MAKAYTRON_LISTING_NAVIGATE__ = (url) => { navigations.push(String(url)); };
    try {
        await runtime.applyCurrentProposal();
        assert.equal(storage.get(runtime.KEYS.queue).items[0].status, 'awaiting-user-review');
        publishEnabled = true;

        const firstPublish = runtime.publishCurrentProposal();
        const concurrentPublish = runtime.publishCurrentProposal();
        assert.strictEqual(concurrentPublish, firstPublish);
        await Promise.all([firstPublish, concurrentPublish]);

        const savedQueue = plain(storage.get(runtime.KEYS.queue));
        const audit = plain(storage.get(runtime.KEYS.audit) || []);
        assert.equal(providerClicks, 1);
        assert.equal(savedQueue.items[0].status, 'verified');
        assert.equal(savedQueue.cursor, 1);
        assert.equal(savedQueue.status, 'running');
        assert.equal(savedQueue.items[1].status, 'pending');
        assert.equal(audit.filter((entry) => entry.type === 'listing-published').length, 1);
        assert.deepEqual(navigations, [secondEditUrl]);
        assert.equal(storage.has(runtime.KEYS.lease), false);
    } finally {
        runtime.EditorAdapter.preflightProposal = originals.preflight;
        runtime.EditorAdapter.formIsClean = originals.clean;
        runtime.EditorAdapter.read = originals.read;
        runtime.EditorAdapter.applyProposal = originals.apply;
        runtime.EditorAdapter.publishButton = originals.button;
        runtime.EditorAdapter.statusText = originals.status;
        if (originals.navigate === undefined) delete sandbox.__MAKAYTRON_LISTING_NAVIGATE__;
        else sandbox.__MAKAYTRON_LISTING_NAVIGATE__ = originals.navigate;
        if (runtime.state.leaseToken) await runtime.Lease.release();
    }
});

test('submitted UPDATE verification recovers idempotently after a local queue write failure', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const listingId = '9300000013';
    const submittedAt = new Date(Date.now() - 1000).toISOString();
    const before = {
        title: 'Publish recovery baseline', description: 'Stable description',
        tags: ['stable'], materials: ['cotton'], quantity: '4', sku: 'RECOVERY-4',
    };
    const editor = { ...plain(before), title: 'Published recovery title' };
    const recoveryHistory = Array.from({ length: 11 }, (_, index) => snapshot(
        new Date(Date.parse(submittedAt) - (10 - index) * 6 * 86400000).toISOString(),
    ));
    const candidate = record(listingId, recoveryHistory, {
        title: before.title,
        editUrl: `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`,
    });
    candidate.editor = { ...plain(before), capturedAt: submittedAt };
    await runtime.Store.loadSettings();
    const durableHealthSettings = plain(runtime.state.settings);
    candidate.health = plain(api.evaluateRecord(candidate, [candidate], durableHealthSettings, submittedAt));
    candidate.analysis = plain(candidate.health.result);
    const durablePolicyFingerprint = candidate.health.policy.fingerprint;
    await runtime.Store.putRecord(candidate);
    const saved = await runtime.Store.saveProposal(listingId, {
        action: 'UPDATE', fields: ['title'], title: editor.title, reason: 'idempotent publish recovery',
    });
    runtime.state.records = [plain(saved)];
    const operationId = 'publish-attempt-recovery-001';
    const queue = {
        schema: api.versions.queueSchema, id: 'queue-publish-recovery', status: 'running', cursor: 0,
        items: [{
            listingId, status: 'submitted-unverified', attempts: 1, error: 'synthetic interrupted commit',
            before: plain(before), changedFields: ['title'], runtimeOwner: 'previous-page-instance',
            runtimeBaselineCapturedAt: submittedAt, publishAttemptId: operationId,
            publishSubmittedIntentAt: submittedAt, submittedAt,
            editUrl: candidate.meta.editUrl, proposal: plain(saved.proposal),
        }],
    };
    runtime.state.queue = plain(queue);
    storage.set(runtime.KEYS.queue, plain(queue));
    sandbox.location.pathname = `/your/shops/me/listing-editor/edit/${listingId}`;
    sandbox.location.search = '';
    sandbox.location.href = `https://www.etsy.com${sandbox.location.pathname}`;

    const originals = {
        read: runtime.EditorAdapter.read,
        clean: runtime.EditorAdapter.formIsClean,
        button: runtime.EditorAdapter.publishButton,
        saveQueueLocked: runtime.Store.saveQueueLocked,
    };
    let providerClicks = 0;
    runtime.EditorAdapter.read = () => completeEditorSnapshot(api, editor);
    runtime.EditorAdapter.formIsClean = () => true;
    runtime.EditorAdapter.publishButton = () => ({
        disabled: true,
        getAttribute: (name) => (name === 'aria-disabled' ? 'true' : null),
        click: () => { providerClicks += 1; },
    });
    runtime.state.settings = {
        ...runtime.state.settings,
        minVisitsToImprove: 35,
        minVisitsToProtect: 85,
        minRenewalsToReview: 7,
        declinePercent: 49,
        retentionDays: 30,
        maxSnapshots: 10,
    };
    const durableSubmittedQueue = plain(queue);
    let failQueueWrite = true;
    runtime.Store.saveQueueLocked = async function saveQueueLockedWithOneFailure(...args) {
        if (failQueueWrite) {
            failQueueWrite = false;
            storage.set(runtime.KEYS.queue, plain(durableSubmittedQueue));
            const error = new Error('synthetic queue write failure');
            error.code = 'STORAGE_WRITE_FAILED';
            throw error;
        }
        return originals.saveQueueLocked.apply(this, args);
    };
    try {
        await runtime.verifyCurrentPublish();
        const afterFirst = await runtime.Store.getRecord(listingId);
        const firstImprovement = afterFirst.improvements.find((entry) => entry.id === saved.proposal.improvementId);
        assert.equal(firstImprovement.status, 'published');
        assert.equal(firstImprovement.publishOperationId, operationId);
        assert.equal(firstImprovement.publishedAt, submittedAt);
        assert.equal(runtime.state.records[0].improvements.find((entry) => entry.id === saved.proposal.improvementId).status, 'published');
        assert.equal(storage.get(runtime.KEYS.queue).items[0].status, 'submitted-unverified');
        assert.equal(plain(storage.get(runtime.KEYS.audit)).filter((entry) => entry.type === 'listing-published').length, 1);

        await Promise.all([runtime.verifyCurrentPublish(), runtime.verifyCurrentPublish()]);
        const afterRetry = await runtime.Store.getRecord(listingId);
        const retriedImprovement = afterRetry.improvements.find((entry) => entry.id === saved.proposal.improvementId);
        const savedQueue = plain(storage.get(runtime.KEYS.queue));
        assert.equal(retriedImprovement.publishedAt, submittedAt);
        assert.equal(afterRetry.health.policy.fingerprint, durablePolicyFingerprint);
        assert.equal(afterRetry.history.length, 11);
        assert.equal(savedQueue.status, 'completed');
        assert.equal(savedQueue.cursor, 1);
        assert.equal(savedQueue.items[0].status, 'verified');
        assert.equal(plain(storage.get(runtime.KEYS.audit)).filter((entry) => entry.type === 'listing-published').length, 1);
        assert.equal(providerClicks, 0);
        assert.equal(storage.has(runtime.KEYS.lease), false);
    } finally {
        runtime.EditorAdapter.read = originals.read;
        runtime.EditorAdapter.formIsClean = originals.clean;
        runtime.EditorAdapter.publishButton = originals.button;
        runtime.Store.saveQueueLocked = originals.saveQueueLocked;
        if (runtime.state.leaseToken) await runtime.Lease.release();
    }
});

test('legacy UPDATE partial commit is adopted without republishing or duplicating its audit', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const listingId = '9300000015';
    const submittedAt = new Date(Date.now() - 2000).toISOString();
    const publishedAt = new Date(Date.now() - 1000).toISOString();
    const before = {
        title: 'Legacy publish baseline', description: 'Stable legacy description',
        tags: ['legacy'], materials: ['linen'], quantity: '3', sku: 'LEGACY-3',
    };
    const editor = { ...plain(before), title: 'Legacy published title' };
    const candidate = record(listingId, [snapshot(submittedAt)], {
        title: before.title,
        editUrl: `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`,
    });
    candidate.editor = { ...plain(before), capturedAt: submittedAt };
    await runtime.Store.loadSettings();
    candidate.health = plain(api.evaluateRecord(candidate, [candidate], runtime.state.settings, submittedAt));
    candidate.analysis = plain(candidate.health.result);
    await runtime.Store.putRecord(candidate);
    const saved = await runtime.Store.saveProposal(listingId, {
        action: 'UPDATE', fields: ['title'], title: editor.title, reason: 'legacy partial publish fixture',
    });
    const legacyRecord = await runtime.Store.getRecord(listingId);
    const legacyImprovement = legacyRecord.improvements.find((entry) => entry.id === saved.proposal.improvementId);
    legacyRecord.editor = { ...plain(editor), capturedAt: publishedAt };
    legacyRecord.proposal = { ...legacyRecord.proposal, appliedAt: publishedAt };
    legacyImprovement.status = 'published';
    legacyImprovement.publishedAt = publishedAt;
    legacyImprovement.after = plain(legacyRecord.editor);
    legacyImprovement.experiment = {
        ...(legacyImprovement.experiment || {}), state: 'observing', startAt: publishedAt,
        evaluateAt: new Date(Date.parse(publishedAt) + 30 * 86400000).toISOString(), day: 0, durationDays: 30,
    };
    delete legacyImprovement.publishOperationId;
    storage.set(runtime.KEYS.record(listingId), plain(legacyRecord));

    const queueId = 'queue-legacy-publish-recovery';
    const queue = {
        schema: api.versions.queueSchema, id: queueId, status: 'running', cursor: 0,
        items: [{
            listingId, status: 'submitted', attempts: 1, error: '', submittedAt,
            before: plain(before), changedFields: ['title'], runtimeOwner: 'legacy-page-instance',
            editUrl: candidate.meta.editUrl, proposal: plain(saved.proposal),
        }],
    };
    runtime.state.queue = plain(queue);
    storage.set(runtime.KEYS.queue, plain(queue));
    storage.set(runtime.KEYS.audit, [{
        at: new Date(Date.parse(publishedAt) + 100).toISOString(), type: 'listing-published',
        queueId, listingId, fields: ['title'], writeId: 'legacy-audit-write',
    }]);
    sandbox.location.pathname = `/your/shops/me/listing-editor/edit/${listingId}`;
    sandbox.location.search = '';
    sandbox.location.href = `https://www.etsy.com${sandbox.location.pathname}`;

    const originals = {
        read: runtime.EditorAdapter.read,
        clean: runtime.EditorAdapter.formIsClean,
        button: runtime.EditorAdapter.publishButton,
    };
    let providerClicks = 0;
    runtime.EditorAdapter.read = () => completeEditorSnapshot(api, editor);
    runtime.EditorAdapter.formIsClean = () => true;
    runtime.EditorAdapter.publishButton = () => ({
        disabled: true,
        getAttribute: (name) => (name === 'aria-disabled' ? 'true' : null),
        click: () => { providerClicks += 1; },
    });
    try {
        await runtime.verifyCurrentPublish();
        const recovered = await runtime.Store.getRecord(listingId);
        const improvement = recovered.improvements.find((entry) => entry.id === saved.proposal.improvementId);
        const durableQueue = plain(storage.get(runtime.KEYS.queue));
        const audit = plain(storage.get(runtime.KEYS.audit));
        assert.equal(improvement.status, 'published');
        assert.equal(improvement.publishedAt, publishedAt);
        assert.equal(improvement.experiment.startAt, publishedAt);
        assert.equal(improvement.publishOperationId, `publish-${queueId}-0-${listingId}`);
        assert.equal(durableQueue.status, 'completed');
        assert.equal(durableQueue.items[0].status, 'verified');
        assert.equal(audit.filter((entry) => entry.type === 'listing-published').length, 1);
        assert.equal(providerClicks, 0);
        assert.equal(storage.has(runtime.KEYS.lease), false);
    } finally {
        runtime.EditorAdapter.read = originals.read;
        runtime.EditorAdapter.formIsClean = originals.clean;
        runtime.EditorAdapter.publishButton = originals.button;
        if (runtime.state.leaseToken) await runtime.Lease.release();
    }
});

test('trusted editor input blocks UPDATE publish even when its durable conflict marker cannot be written', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const listingId = '9300000014';
    const capturedAt = new Date().toISOString();
    const before = {
        title: 'Trusted-input baseline', description: 'Stable description',
        tags: ['stable'], materials: ['cotton'], quantity: '2', sku: 'TRUSTED-2',
    };
    const editor = plain(before);
    const candidate = record(listingId, [snapshot(capturedAt)], {
        title: before.title,
        editUrl: `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`,
    });
    candidate.editor = { ...plain(before), capturedAt };
    await runtime.Store.loadSettings();
    await runtime.Store.putRecord(candidate);
    const saved = await runtime.Store.saveProposal(listingId, {
        action: 'UPDATE', fields: ['title'], title: 'Trusted-input proposal', reason: 'synchronous conflict fence',
    });
    const queue = {
        schema: api.versions.queueSchema, id: 'queue-trusted-input-fence', status: 'ready', cursor: 0,
        items: [{
            listingId, status: 'pending', attempts: 0, error: '', before: null, changedFields: [],
            editUrl: candidate.meta.editUrl, proposal: plain(saved.proposal),
        }],
    };
    runtime.state.queue = plain(queue);
    storage.set(runtime.KEYS.queue, plain(queue));
    sandbox.location.pathname = `/your/shops/me/listing-editor/edit/${listingId}`;
    sandbox.location.search = '';
    sandbox.location.href = `https://www.etsy.com${sandbox.location.pathname}`;

    const originals = {
        addEventListener: sandbox.document.addEventListener,
        getValue: sandbox.GM.getValue,
        preflight: runtime.EditorAdapter.preflightProposal,
        clean: runtime.EditorAdapter.formIsClean,
        read: runtime.EditorAdapter.read,
        apply: runtime.EditorAdapter.applyProposal,
        button: runtime.EditorAdapter.publishButton,
    };
    const listeners = new Map();
    sandbox.document.addEventListener = (type, listener) => { listeners.set(type, listener); };
    let publishEnabled = false;
    let publishClicks = 0;
    runtime.EditorAdapter.preflightProposal = () => true;
    runtime.EditorAdapter.formIsClean = () => true;
    runtime.EditorAdapter.read = () => completeEditorSnapshot(api, editor);
    runtime.EditorAdapter.applyProposal = async (proposal) => { editor.title = proposal.title; return ['title']; };
    runtime.EditorAdapter.publishButton = () => ({
        get disabled() { return !publishEnabled; },
        getAttribute: () => null,
        click: () => { publishClicks += 1; },
    });
    try {
        runtime.installTrustedEditorInteractionWatcher();
        await runtime.applyCurrentProposal();
        publishEnabled = true;
        assert.equal(storage.get(runtime.KEYS.queue).items[0].status, 'awaiting-user-review');
        assert.equal(typeof listeners.get('input'), 'function');

        let failQueueRead = true;
        sandbox.GM.getValue = async (key, fallback) => {
            if (key === runtime.KEYS.queue && failQueueRead) {
                failQueueRead = false;
                throw new Error('synthetic watcher storage failure');
            }
            return originals.getValue(key, fallback);
        };
        listeners.get('input')({ type: 'input', isTrusted: true, target: new FakeElement() });
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(runtime.state.editorInteractionConflict, true);
        assert.equal(storage.get(runtime.KEYS.queue).items[0].editorInteractionConflictAt || '', '');

        await runtime.publishCurrentProposal();
        assert.equal(publishClicks, 0);
        assert.equal(storage.get(runtime.KEYS.queue).items[0].status, 'awaiting-user-review');
        assert.equal(storage.has(runtime.KEYS.lease), false);
    } finally {
        sandbox.document.addEventListener = originals.addEventListener;
        sandbox.GM.getValue = originals.getValue;
        runtime.EditorAdapter.preflightProposal = originals.preflight;
        runtime.EditorAdapter.formIsClean = originals.clean;
        runtime.EditorAdapter.read = originals.read;
        runtime.EditorAdapter.applyProposal = originals.apply;
        runtime.EditorAdapter.publishButton = originals.button;
        if (runtime.state.leaseToken) await runtime.Lease.release();
    }
});

test('dirty editor recovery never resets an uncertain queue item to pending', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const listingId = '9300000002';
    const queue = {
        schema: api.versions.queueSchema, id: 'queue-dirty-recovery', status: 'running', cursor: 0,
        items: [{
            listingId, status: 'awaiting-user-review', runtimeOwner: 'previous-page-instance',
            changedFields: ['title'], proposal: { action: 'UPDATE', fields: ['title'], title: 'Unsaved editor title' },
        }],
    };
    runtime.state.queue = plain(queue);
    storage.set(runtime.KEYS.queue, plain(queue));
    sandbox.location.pathname = `/your/shops/me/listing-editor/edit/${listingId}`;
    sandbox.location.search = '';
    sandbox.location.href = `https://www.etsy.com${sandbox.location.pathname}`;
    const originalClean = runtime.EditorAdapter.formIsClean;
    const originalConfirm = sandbox.confirm;
    let confirmations = 0;
    runtime.EditorAdapter.formIsClean = () => false;
    sandbox.confirm = () => { confirmations += 1; return true; };
    try {
        await runtime.recoverCurrentItem();
        assert.equal(confirmations, 0);
        assert.deepEqual(plain(storage.get(runtime.KEYS.queue)), queue);
        assert.equal(storage.has(runtime.KEYS.lease), false);
    } finally {
        runtime.EditorAdapter.formIsClean = originalClean;
        sandbox.confirm = originalConfirm;
    }
});

test('concurrent skip clicks commit one fenced transition and one audit entry', async () => {
    const { api, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const queue = {
        schema: api.versions.queueSchema, id: 'queue-double', status: 'ready', cursor: 0,
        items: [
            { listingId: '9400000001', status: 'pending', editUrl: 'https://www.etsy.com/your/shops/me/listing-editor/edit/9400000001', proposal: { action: 'UPDATE' } },
            { listingId: '9400000002', status: 'pending', editUrl: 'https://www.etsy.com/your/shops/me/listing-editor/edit/9400000002', proposal: { action: 'UPDATE' } },
        ],
    };
    runtime.state.queue = plain(queue);
    storage.set(runtime.KEYS.queue, plain(queue));
    await Promise.all([runtime.skipCurrentItem(), runtime.skipCurrentItem()]);
    const saved = plain(storage.get(runtime.KEYS.queue));
    assert.equal(saved.cursor, 1);
    assert.equal(saved.status, 'running');
    assert.equal(saved.items[0].status, 'skipped');
    assert.equal(saved.items[1].status, 'pending');
    assert.equal(plain(storage.get(runtime.KEYS.audit)).length, 1);
    assert.equal(storage.has(runtime.KEYS.lease), false);
});

test('legacy deactivation verification remains available and submitted deactivation enters no-retry recovery', () => {
    const { api } = loadAnalyzer();
    const runtime = api.actionRuntime;
    runtime.state.queue = {
        id: 'deactivate-reload', status: 'running', cursor: 0,
        items: [{ listingId: '55', status: 'awaiting-user-deactivation', runtimeOwner: 'old-page', proposal: { action: 'DEACTIVATE_REVIEW' } }],
    };
    assert.equal(runtime.Queue.recoveryState(), null);
    runtime.state.queue.items[0].status = 'deactivation-submitted-unverified';
    const recovery = runtime.Queue.recoveryState();
    assert.equal(recovery.submitted, true);
    assert.equal(recovery.item.listingId, '55');
});

test('fresh durable deactivation submission permits only canonical automatic verification recovery', () => {
    const { api } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const now = Date.parse('2026-08-31T16:00:00.000Z');
    const item = {
        listingId: '4309502756', status: 'deactivation-submitted',
        proposal: { action: 'DEACTIVATE_REVIEW' },
        deactivationAttemptId: 'attempt-1', deactivationStatusBefore: ['Active'],
        deactivationSubmittedIntentAt: '2026-08-31T15:59:30.000Z',
        editUrl: 'https://example.com/unsafe',
    };
    runtime.state.queue = { status: 'running', cursor: 0, items: [item] };
    const recovery = runtime.automaticDeactivationRecovery(item, now);
    assert.equal(recovery.editUrl, 'https://www.etsy.com/your/shops/me/listing-editor/edit/4309502756');
    assert.equal(runtime.automaticDeactivationRecovery({ ...item, status: 'awaiting-user-deactivation' }, now), null);
    assert.equal(runtime.automaticDeactivationRecovery({ ...item, deactivationAttemptId: '' }, now), null);
    assert.equal(runtime.automaticDeactivationRecovery({ ...item, deactivationStatusBefore: [] }, now), null);
    assert.equal(runtime.automaticDeactivationRecovery({ ...item, deactivationSubmittedIntentAt: '2026-08-31T15:55:00.000Z' }, now), null);
    runtime.state.queue.status = 'stopped';
    assert.equal(runtime.automaticDeactivationRecovery(item, now), null);
});

test('a missing deactivation menu releases the action lease without changing the queue', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const queue = {
        id: 'deactivate-menu', status: 'ready', cursor: 0,
        items: [{
            listingId: '77', status: 'pending', editUrl: 'https://www.etsy.com/your/shops/me/listing-editor/edit/77',
            proposal: { action: 'DEACTIVATE_REVIEW' },
        }],
    };
    await installEligibleDeactivationQueue(api, runtime, storage, queue, '77');
    const queueBefore = plain(storage.get(runtime.KEYS.queue));
    sandbox.location.pathname = '/your/shops/me/listing-editor/edit/77';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/your/shops/me/listing-editor/edit/77';
    const originalLabels = runtime.EditorAdapter.listingStatusLabels;
    const originalClean = runtime.EditorAdapter.formIsClean;
    const originalOpen = runtime.EditorAdapter.openDeactivateDialog;
    const originalCancel = runtime.EditorAdapter.cancelDeactivateDialogWhenReady;
    let cancelAttempts = 0;
    runtime.EditorAdapter.listingStatusLabels = () => ['Active'];
    runtime.EditorAdapter.formIsClean = () => true;
    runtime.EditorAdapter.openDeactivateDialog = async () => false;
    runtime.EditorAdapter.cancelDeactivateDialogWhenReady = async () => { cancelAttempts += 1; return false; };
    try {
        await runtime.openCurrentDeactivate();
        assert.equal(cancelAttempts, 1);
        assert.equal(storage.has(runtime.KEYS.lease), false);
        assert.deepEqual(plain(storage.get(runtime.KEYS.queue)), queueBefore);
    } finally {
        runtime.EditorAdapter.listingStatusLabels = originalLabels;
        runtime.EditorAdapter.formIsClean = originalClean;
        runtime.EditorAdapter.openDeactivateDialog = originalOpen;
        runtime.EditorAdapter.cancelDeactivateDialogWhenReady = originalCancel;
    }
});

test('automatic deactivation submits once, verifies Active to Inactive, and advances once under double click', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const queue = {
        id: 'deactivate-automatic', status: 'ready', cursor: 0,
        items: [
            {
                listingId: '78', status: 'pending', editUrl: 'https://www.etsy.com/your/shops/me/listing-editor/edit/78',
                proposal: { action: 'DEACTIVATE_REVIEW', reason: 'test' },
            },
            {
                listingId: '79', status: 'pending', editUrl: 'https://www.etsy.com/your/shops/me/listing-editor/edit/79',
                proposal: { action: 'DEACTIVATE_REVIEW', reason: 'test' },
            },
        ],
    };
    await installEligibleDeactivationQueue(api, runtime, storage, queue, '78');
    sandbox.location.pathname = '/your/shops/me/listing-editor/edit/78';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/your/shops/me/listing-editor/edit/78';
    let status = 'Active';
    let finalClicks = 0;
    const originals = {
        labels: runtime.EditorAdapter.listingStatusLabels,
        clean: runtime.EditorAdapter.formIsClean,
        open: runtime.EditorAdapter.openDeactivateDialog,
        modal: runtime.EditorAdapter.deactivateDialogContract,
        confirm: runtime.EditorAdapter.clickDeactivateConfirmation,
    };
    runtime.EditorAdapter.listingStatusLabels = () => [status];
    runtime.EditorAdapter.formIsClean = () => true;
    runtime.EditorAdapter.openDeactivateDialog = async () => true;
    runtime.EditorAdapter.deactivateDialogContract = () => ({});
    runtime.EditorAdapter.clickDeactivateConfirmation = () => { finalClicks += 1; status = 'Inactive'; return true; };
    try {
        await Promise.all([runtime.openCurrentDeactivate(), runtime.openCurrentDeactivate()]);
        const saved = plain(storage.get(runtime.KEYS.queue));
        assert.equal(finalClicks, 1);
        assert.equal(saved.cursor, 1);
        assert.equal(saved.status, 'running');
        assert.equal(saved.items[0].status, 'verified-deactivated');
        assert.deepEqual(saved.items[0].deactivationStatusBefore, ['Active']);
        assert.deepEqual(saved.items[0].deactivationStatusAfter, ['Inactive']);
        assert.equal(saved.items[1].status, 'pending');
        assert.equal(plain(storage.get(runtime.KEYS.audit)).filter((entry) => entry.type === 'listing-deactivated').length, 1);
        assert.equal(storage.has(runtime.KEYS.lease), false);
    } finally {
        runtime.EditorAdapter.listingStatusLabels = originals.labels;
        runtime.EditorAdapter.formIsClean = originals.clean;
        runtime.EditorAdapter.openDeactivateDialog = originals.open;
        runtime.EditorAdapter.deactivateDialogContract = originals.modal;
        runtime.EditorAdapter.clickDeactivateConfirmation = originals.confirm;
    }
});

test('deactivation final click rejects a concurrent threshold change', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const settings = api.settingsRuntime;
    const queue = {
        id: 'deactivate-threshold-fence', status: 'ready', cursor: 0,
        items: [{
            listingId: '780', status: 'pending',
            editUrl: 'https://www.etsy.com/your/shops/me/listing-editor/edit/780',
            proposal: { action: 'DEACTIVATE_REVIEW', reason: 'test' },
        }],
    };
    await settings.Store.loadSettings();
    await installEligibleDeactivationQueue(api, runtime, storage, queue, '780');
    sandbox.location.pathname = '/your/shops/me/listing-editor/edit/780';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/your/shops/me/listing-editor/edit/780';
    let status = 'Active';
    let thresholdWrite = null;
    const originals = {
        labels: runtime.EditorAdapter.listingStatusLabels,
        clean: runtime.EditorAdapter.formIsClean,
        open: runtime.EditorAdapter.openDeactivateDialog,
        modal: runtime.EditorAdapter.deactivateDialogContract,
        confirm: runtime.EditorAdapter.clickDeactivateConfirmation,
    };
    runtime.EditorAdapter.listingStatusLabels = () => [status];
    runtime.EditorAdapter.formIsClean = () => true;
    runtime.EditorAdapter.openDeactivateDialog = async () => true;
    runtime.EditorAdapter.deactivateDialogContract = () => ({});
    runtime.EditorAdapter.clickDeactivateConfirmation = () => {
        thresholdWrite = settings.persistThresholdSettings({
            minVisitsToImprove: 21,
            minVisitsToProtect: 60,
            minRenewalsToReview: 4,
            declinePercent: 35,
        });
        status = 'Inactive';
        return true;
    };
    try {
        await runtime.openCurrentDeactivate();
        assert.ok(thresholdWrite);
        assert.equal(await thresholdWrite, false);
        assert.equal(settings.state.settingsSaveError, 'HEALTH_SETTINGS_QUEUE_LOCKED');
        assert.equal(settings.state.settings.minVisitsToImprove, 20);
        assert.equal(storage.has(runtime.KEYS.settings), false);
        const saved = plain(storage.get(runtime.KEYS.queue));
        assert.equal(saved.status, 'completed');
        assert.equal(saved.items[0].status, 'verified-deactivated');
    } finally {
        runtime.EditorAdapter.listingStatusLabels = originals.labels;
        runtime.EditorAdapter.formIsClean = originals.clean;
        runtime.EditorAdapter.openDeactivateDialog = originals.open;
        runtime.EditorAdapter.deactivateDialogContract = originals.modal;
        runtime.EditorAdapter.clickDeactivateConfirmation = originals.confirm;
    }
});

test('deactivation retry keeps its immutable operation time and preserves a later fresh collection', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const collectionRuntime = api.collectionRuntime;
    const listingId = '785';
    const intentAt = new Date(Date.now() - 4000).toISOString();
    const oldStartedAt = new Date(Date.now() - 7000).toISOString();
    const oldObservedAt = new Date(Date.now() - 6000).toISOString();
    const oldCompletedAt = new Date(Date.now() - 5000).toISOString();
    const laterObservedAt = new Date(Date.now() - 2000).toISOString();
    const laterCompletedAt = new Date(Date.now() - 1000).toISOString();
    const queue = {
        id: 'deactivate-immutable-time', status: 'running', cursor: 0,
        items: [{
            listingId, status: 'deactivation-submitted-unverified',
            editUrl: `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`,
            proposal: { action: 'DEACTIVATE_REVIEW', reason: 'immutable marker test' },
        }],
    };
    await installEligibleDeactivationQueue(api, runtime, storage, queue, listingId);
    const storedQueue = plain(storage.get(runtime.KEYS.queue));
    storedQueue.status = 'running';
    storedQueue.items[0].status = 'deactivation-submitted-unverified';
    storedQueue.items[0].deactivationAttemptId = 'deactivation-attempt-immutable-001';
    storedQueue.items[0].deactivationStatusBefore = ['Active'];
    storedQueue.items[0].deactivationSubmittedIntentAt = intentAt;
    runtime.state.queue = plain(storedQueue);
    storage.set(runtime.KEYS.queue, plain(storedQueue));
    const makeCollection = (id, startedAt, observedAt, completedAt) => api.normalizeCollection({
        schema: api.versions.collectionSchema, id, status: 'completed',
        scopeKey: 'etsy-shop:shopone|status:active|/your/shops/me/tools/listings?item_status=active&stats=true',
        metricContractId, startedAt, updatedAt: completedAt, completedAt, expectedPage: 1, totalPages: 1,
        pages: {
            1: {
                signature: `1|1|${listingId}`, contentSignature: listingId, ids: [listingId], count: 1,
                capturedAt: observedAt, metricContractId,
            },
        },
        uniqueIds: [listingId], duplicateCount: 0, failureReports: [],
    });
    const oldCollection = makeCollection('collection-before-deactivation-retry', oldStartedAt, oldObservedAt, oldCompletedAt);
    collectionRuntime.state.collection = oldCollection;
    storage.set(collectionRuntime.KEYS.collection, plain(oldCollection));
    sandbox.location.pathname = `/your/shops/me/listing-editor/edit/${listingId}`;
    sandbox.location.search = '';
    sandbox.location.href = `https://www.etsy.com${sandbox.location.pathname}`;
    const originalLabels = runtime.EditorAdapter.listingStatusLabels;
    const originalSaveQueueLocked = runtime.Store.saveQueueLocked;
    const queueBeforeFailedCommit = plain(storage.get(runtime.KEYS.queue));
    runtime.EditorAdapter.listingStatusLabels = () => ['Inactive'];
    let failQueueWrite = true;
    runtime.Store.saveQueueLocked = async function saveQueueLockedWithOneFailure(...args) {
        if (failQueueWrite) {
            failQueueWrite = false;
            storage.set(runtime.KEYS.queue, plain(queueBeforeFailedCommit));
            const error = new Error('synthetic queue write failure');
            error.code = 'STORAGE_WRITE_FAILED';
            throw error;
        }
        return originalSaveQueueLocked.apply(this, args);
    };
    try {
        await runtime.verifyCurrentDeactivate();
        const afterFirst = await runtime.Store.getRecord(listingId);
        assert.equal(afterFirst.deactivation.operationId, 'deactivation-attempt-immutable-001');
        assert.equal(afterFirst.deactivation.at, intentAt);
        assert.equal(plain(storage.get(collectionRuntime.KEYS.collection)).status, 'blocked');
        assert.equal(plain(storage.get(runtime.KEYS.queue)).items[0].status, 'deactivation-submitted-unverified');

        const laterCollection = makeCollection(
            'collection-after-deactivation-retry',
            new Date(Date.parse(intentAt) + 1000).toISOString(),
            laterObservedAt,
            laterCompletedAt,
        );
        collectionRuntime.state.collection = laterCollection;
        storage.set(collectionRuntime.KEYS.collection, plain(laterCollection));
        await runtime.verifyCurrentDeactivate();

        const afterRetry = await runtime.Store.getRecord(listingId);
        const savedQueue = plain(storage.get(runtime.KEYS.queue));
        const savedCollection = plain(storage.get(collectionRuntime.KEYS.collection));
        assert.equal(afterRetry.deactivation.at, intentAt);
        assert.equal(savedQueue.status, 'completed');
        assert.equal(savedQueue.cursor, 1);
        assert.equal(savedQueue.items[0].status, 'verified-deactivated');
        assert.equal(savedCollection.status, 'completed');
        assert.equal(savedCollection.id, laterCollection.id);
        assert.equal(plain(storage.get(runtime.KEYS.audit)).filter((entry) => entry.type === 'listing-deactivated').length, 1);
    } finally {
        runtime.EditorAdapter.listingStatusLabels = originalLabels;
        runtime.Store.saveQueueLocked = originalSaveQueueLocked;
        if (runtime.state.leaseToken) await runtime.Lease.release();
    }
});

test('deactivation revalidates health and blocks a stale seasonal recommendation before opening Etsy', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const queue = {
        id: 'deactivate-stale-preflight', status: 'ready', cursor: 0,
        items: [{ listingId: '783', status: 'pending', editUrl: 'https://www.etsy.com/your/shops/me/listing-editor/edit/783', proposal: { action: 'DEACTIVATE_REVIEW' } }],
    };
    await installEligibleDeactivationQueue(api, runtime, storage, queue, '783');
    await runtime.Store.saveListingContext('783', { seasonality: 'seasonal', listingType: 'unknown' });
    sandbox.location.pathname = '/your/shops/me/listing-editor/edit/783';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/your/shops/me/listing-editor/edit/783';
    const originals = {
        labels: runtime.EditorAdapter.listingStatusLabels, clean: runtime.EditorAdapter.formIsClean,
        open: runtime.EditorAdapter.openDeactivateDialog, confirm: runtime.EditorAdapter.clickDeactivateConfirmation,
    };
    let openAttempts = 0;
    let finalClicks = 0;
    runtime.EditorAdapter.listingStatusLabels = () => ['Active'];
    runtime.EditorAdapter.formIsClean = () => true;
    runtime.EditorAdapter.openDeactivateDialog = async () => { openAttempts += 1; return true; };
    runtime.EditorAdapter.clickDeactivateConfirmation = () => { finalClicks += 1; return true; };
    try {
        await runtime.openCurrentDeactivate();
        const saved = plain(storage.get(runtime.KEYS.queue));
        assert.equal(openAttempts, 0);
        assert.equal(finalClicks, 0);
        assert.equal(saved.items[0].status, 'pending');
        assert.equal(saved.cursor, 0);
        assert.equal(storage.has(runtime.KEYS.lease), false);
    } finally {
        runtime.EditorAdapter.listingStatusLabels = originals.labels;
        runtime.EditorAdapter.formIsClean = originals.clean;
        runtime.EditorAdapter.openDeactivateDialog = originals.open;
        runtime.EditorAdapter.clickDeactivateConfirmation = originals.confirm;
    }
});

test('deactivation revalidates again under the final-click fence when context changes after dialog open', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const queue = {
        id: 'deactivate-stale-final', status: 'ready', cursor: 0,
        items: [{ listingId: '784', status: 'pending', editUrl: 'https://www.etsy.com/your/shops/me/listing-editor/edit/784', proposal: { action: 'DEACTIVATE_REVIEW' } }],
    };
    await installEligibleDeactivationQueue(api, runtime, storage, queue, '784');
    sandbox.location.pathname = '/your/shops/me/listing-editor/edit/784';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/your/shops/me/listing-editor/edit/784';
    const originals = {
        labels: runtime.EditorAdapter.listingStatusLabels, clean: runtime.EditorAdapter.formIsClean,
        open: runtime.EditorAdapter.openDeactivateDialog, modal: runtime.EditorAdapter.deactivateDialogContract,
        confirm: runtime.EditorAdapter.clickDeactivateConfirmation,
    };
    let finalClicks = 0;
    runtime.EditorAdapter.listingStatusLabels = () => ['Active'];
    runtime.EditorAdapter.formIsClean = () => true;
    runtime.EditorAdapter.openDeactivateDialog = async () => {
        await runtime.Store.saveListingContext('784', { seasonality: 'seasonal', listingType: 'unknown' });
        return true;
    };
    runtime.EditorAdapter.deactivateDialogContract = () => ({});
    runtime.EditorAdapter.clickDeactivateConfirmation = () => { finalClicks += 1; return true; };
    try {
        await runtime.openCurrentDeactivate();
        const saved = plain(storage.get(runtime.KEYS.queue));
        assert.equal(finalClicks, 0);
        assert.equal(saved.items[0].status, 'deactivation-submitted-unverified');
        assert.match(saved.items[0].deactivationAttemptId, /^deactivation-attempt-/);
        assert.equal(saved.cursor, 0);
        assert.equal((plain(storage.get(runtime.KEYS.audit)) || []).some((entry) => entry.type === 'listing-deactivated'), false);
        assert.equal(storage.has(runtime.KEYS.lease), false);
    } finally {
        runtime.EditorAdapter.listingStatusLabels = originals.labels;
        runtime.EditorAdapter.formIsClean = originals.clean;
        runtime.EditorAdapter.openDeactivateDialog = originals.open;
        runtime.EditorAdapter.deactivateDialogContract = originals.modal;
        runtime.EditorAdapter.clickDeactivateConfirmation = originals.confirm;
    }
});

test('a legacy manual deactivation wait cannot enter the automatic click flow', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const queue = {
        id: 'deactivate-legacy-upgrade', status: 'running', cursor: 0,
        items: [{
            listingId: '82', status: 'awaiting-user-deactivation', editUrl: 'https://www.etsy.com/your/shops/me/listing-editor/edit/82',
            deactivationStatusBefore: ['Active'], proposal: { action: 'DEACTIVATE_REVIEW', reason: 'legacy test' },
        }],
    };
    runtime.state.queue = plain(queue);
    storage.set(runtime.KEYS.queue, plain(queue));
    sandbox.location.pathname = '/your/shops/me/listing-editor/edit/82';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/your/shops/me/listing-editor/edit/82';
    let status = 'Active';
    let finalClicks = 0;
    const originals = {
        labels: runtime.EditorAdapter.listingStatusLabels,
        clean: runtime.EditorAdapter.formIsClean,
        open: runtime.EditorAdapter.openDeactivateDialog,
        modal: runtime.EditorAdapter.deactivateDialogContract,
        confirm: runtime.EditorAdapter.clickDeactivateConfirmation,
    };
    runtime.EditorAdapter.listingStatusLabels = () => [status];
    runtime.EditorAdapter.formIsClean = () => true;
    runtime.EditorAdapter.openDeactivateDialog = async () => true;
    runtime.EditorAdapter.deactivateDialogContract = () => ({});
    runtime.EditorAdapter.clickDeactivateConfirmation = () => { finalClicks += 1; status = 'Inactive'; return true; };
    try {
        await runtime.openCurrentDeactivate();
        const saved = plain(storage.get(runtime.KEYS.queue));
        assert.equal(finalClicks, 0);
        assert.equal(saved.cursor, 0);
        assert.equal(saved.status, 'running');
        assert.equal(saved.items[0].status, 'awaiting-user-deactivation');
        assert.equal(storage.has(runtime.KEYS.audit), false);
        assert.equal(storage.has(runtime.KEYS.lease), false);
    } finally {
        runtime.EditorAdapter.listingStatusLabels = originals.labels;
        runtime.EditorAdapter.formIsClean = originals.clean;
        runtime.EditorAdapter.openDeactivateDialog = originals.open;
        runtime.EditorAdapter.deactivateDialogContract = originals.modal;
        runtime.EditorAdapter.clickDeactivateConfirmation = originals.confirm;
    }
});

test('an armed deactivation that loses its final control becomes unverified and is never retried automatically', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const queue = {
        id: 'deactivate-no-retry', status: 'ready', cursor: 0,
        items: [{
            listingId: '80', status: 'pending', editUrl: 'https://www.etsy.com/your/shops/me/listing-editor/edit/80',
            proposal: { action: 'DEACTIVATE_REVIEW', reason: 'test' },
        }],
    };
    await installEligibleDeactivationQueue(api, runtime, storage, queue, '80');
    sandbox.location.pathname = '/your/shops/me/listing-editor/edit/80';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/your/shops/me/listing-editor/edit/80';
    let finalAttempts = 0;
    const originals = {
        labels: runtime.EditorAdapter.listingStatusLabels,
        clean: runtime.EditorAdapter.formIsClean,
        open: runtime.EditorAdapter.openDeactivateDialog,
        modal: runtime.EditorAdapter.deactivateDialogContract,
        confirm: runtime.EditorAdapter.clickDeactivateConfirmation,
    };
    runtime.EditorAdapter.listingStatusLabels = () => ['Active'];
    runtime.EditorAdapter.formIsClean = () => true;
    runtime.EditorAdapter.openDeactivateDialog = async () => true;
    runtime.EditorAdapter.deactivateDialogContract = () => ({});
    runtime.EditorAdapter.clickDeactivateConfirmation = () => { finalAttempts += 1; return false; };
    try {
        await runtime.openCurrentDeactivate();
        let saved = plain(storage.get(runtime.KEYS.queue));
        assert.equal(finalAttempts, 1);
        assert.equal(saved.cursor, 0);
        assert.equal(saved.items[0].status, 'deactivation-submitted-unverified');
        assert.match(saved.items[0].deactivationAttemptId, /^deactivation-attempt-/);
        assert.deepEqual(saved.items[0].deactivationStatusBefore, ['Active']);
        assert.equal(storage.has(runtime.KEYS.audit), false);
        assert.equal(storage.has(runtime.KEYS.lease), false);
        await runtime.openCurrentDeactivate();
        saved = plain(storage.get(runtime.KEYS.queue));
        assert.equal(finalAttempts, 1);
        assert.equal(saved.items[0].status, 'deactivation-submitted-unverified');
        assert.equal(saved.cursor, 0);
    } finally {
        runtime.EditorAdapter.listingStatusLabels = originals.labels;
        runtime.EditorAdapter.formIsClean = originals.clean;
        runtime.EditorAdapter.openDeactivateDialog = originals.open;
        runtime.EditorAdapter.deactivateDialogContract = originals.modal;
        runtime.EditorAdapter.clickDeactivateConfirmation = originals.confirm;
    }
});

test('route drift after a durable deactivation arm prevents the final click and leaves recovery-only state', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const queue = {
        id: 'deactivate-route-drift', status: 'ready', cursor: 0,
        items: [{
            listingId: '81', status: 'pending', editUrl: 'https://www.etsy.com/your/shops/me/listing-editor/edit/81',
            proposal: { action: 'DEACTIVATE_REVIEW', reason: 'test' },
        }],
    };
    await installEligibleDeactivationQueue(api, runtime, storage, queue, '81');
    sandbox.location.pathname = '/your/shops/me/listing-editor/edit/81';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/your/shops/me/listing-editor/edit/81';
    let finalClicks = 0;
    const originals = {
        labels: runtime.EditorAdapter.listingStatusLabels,
        clean: runtime.EditorAdapter.formIsClean,
        open: runtime.EditorAdapter.openDeactivateDialog,
        modal: runtime.EditorAdapter.deactivateDialogContract,
        confirm: runtime.EditorAdapter.clickDeactivateConfirmation,
    };
    runtime.EditorAdapter.listingStatusLabels = () => ['Active'];
    runtime.EditorAdapter.formIsClean = () => {
        if (storage.get(runtime.KEYS.queue)?.items?.[0]?.status === 'deactivation-submitted') {
            sandbox.location.pathname = '/your/shops/me/listing-editor/edit/999';
        }
        return true;
    };
    runtime.EditorAdapter.openDeactivateDialog = async () => true;
    runtime.EditorAdapter.deactivateDialogContract = () => ({});
    runtime.EditorAdapter.clickDeactivateConfirmation = () => { finalClicks += 1; return true; };
    try {
        await runtime.openCurrentDeactivate();
        const saved = plain(storage.get(runtime.KEYS.queue));
        assert.equal(finalClicks, 0);
        assert.equal(saved.cursor, 0);
        assert.equal(saved.items[0].status, 'deactivation-submitted-unverified');
        assert.match(saved.items[0].deactivationAttemptId, /^deactivation-attempt-/);
        assert.equal(storage.has(runtime.KEYS.audit), false);
        assert.equal(storage.has(runtime.KEYS.lease), false);
    } finally {
        runtime.EditorAdapter.listingStatusLabels = originals.labels;
        runtime.EditorAdapter.formIsClean = originals.clean;
        runtime.EditorAdapter.openDeactivateDialog = originals.open;
        runtime.EditorAdapter.deactivateDialogContract = originals.modal;
        runtime.EditorAdapter.clickDeactivateConfirmation = originals.confirm;
    }
});

test('concurrent legacy deactivation verification advances exactly one queue item', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const queue = {
        id: 'deactivate-double', status: 'running', cursor: 0,
        items: [
            {
                listingId: '88', status: 'awaiting-user-deactivation', editUrl: 'https://www.etsy.com/your/shops/me/listing-editor/edit/88',
                deactivationStatusBefore: ['Active'], proposal: { action: 'DEACTIVATE_REVIEW', reason: 'test' },
            },
            {
                listingId: '89', status: 'pending', editUrl: 'https://www.etsy.com/your/shops/me/listing-editor/edit/89',
                proposal: { action: 'DEACTIVATE_REVIEW', reason: 'test' },
            },
        ],
    };
    runtime.state.queue = plain(queue);
    storage.set(runtime.KEYS.queue, plain(queue));
    sandbox.location.pathname = '/your/shops/me/listing-editor/edit/88';
    sandbox.location.search = '';
    sandbox.location.href = 'https://www.etsy.com/your/shops/me/listing-editor/edit/88';
    const originalLabels = runtime.EditorAdapter.listingStatusLabels;
    runtime.EditorAdapter.listingStatusLabels = () => ['Inactive'];
    try {
        await Promise.all([runtime.verifyCurrentDeactivate(), runtime.verifyCurrentDeactivate()]);
        const saved = plain(storage.get(runtime.KEYS.queue));
        assert.equal(saved.cursor, 1);
        assert.equal(saved.items[0].status, 'verified-deactivated');
        assert.equal(saved.items[1].status, 'pending');
        assert.equal(plain(storage.get(runtime.KEYS.audit)).filter((entry) => entry.type === 'listing-deactivated').length, 1);
        assert.equal(storage.has(runtime.KEYS.lease), false);
    } finally {
        runtime.EditorAdapter.listingStatusLabels = originalLabels;
    }
});

test('full-collection preflight is single-flight under a double click', async () => {
    const { api } = loadAnalyzer();
    const runtime = api.collectionRuntime;
    const originalStartOnce = runtime.Collection.startOnce;
    let calls = 0;
    let release;
    runtime.Collection.startOnce = () => {
        calls += 1;
        return new Promise((resolve) => { release = resolve; });
    };
    try {
        const first = runtime.Collection.start();
        const second = runtime.Collection.start();
        assert.equal(first, second);
        await Promise.resolve();
        assert.equal(calls, 1);
        release('done');
        assert.equal(await first, 'done');
    } finally {
        runtime.Collection.startOnce = originalStartOnce;
    }
});

test('a navigation cancellation requested by Pause persists a paused collection and releases its lease', async () => {
    const { api, storage } = loadAnalyzer();
    const runtime = api.collectionRuntime;
    const now = new Date().toISOString();
    const raw = {
        schema: api.versions.collectionSchema,
        id: 'pause-during-navigation',
        status: 'running',
        scopeKey: '',
        startedAt: now,
        updatedAt: now,
        expectedPage: 2,
        totalPages: 2,
        pages: { 1: { signature: '1|1|1', contentSignature: '1', ids: ['1'], count: 1, capturedAt: now } },
        uniqueIds: ['1'],
        duplicateCount: 0,
        returningToFirst: false,
        leaseToken: '',
        handoffToken: '',
        handoffPage: 0,
        handoffExpiresAt: '',
        failureReports: [],
    };
    runtime.state.collection = api.normalizeCollection(raw);
    storage.set(runtime.KEYS.collection, plain(raw));
    assert.equal(await runtime.CollectionLease.acquire(), true);
    const owned = { ...plain(runtime.state.collection), leaseToken: runtime.state.collectionLeaseToken };
    runtime.state.collection = api.normalizeCollection(owned);
    storage.set(runtime.KEYS.collection, plain(owned));
    runtime.state.collectionPauseRequested = true;

    const result = await runtime.Collection.settleCancelledOperation();

    assert.equal(result.status, 'paused');
    assert.equal(runtime.state.collectionPauseRequested, false);
    assert.equal(runtime.state.collectionLeaseToken, '');
    assert.equal(storage.has(runtime.KEYS.collectionLease), false);
    assert.equal(plain(storage.get(runtime.KEYS.collection)).status, 'paused');
});

test('a Pause requested while a transient read resolves cannot report that read as successful', async () => {
    const { api, storage } = loadAnalyzer();
    const runtime = api.collectionRuntime;
    const now = new Date().toISOString();
    const raw = {
        schema: api.versions.collectionSchema,
        id: 'pause-as-read-resolves',
        status: 'running',
        scopeKey: '',
        startedAt: now,
        updatedAt: now,
        expectedPage: 1,
        totalPages: 1,
        pages: {},
        uniqueIds: [],
        duplicateCount: 0,
        returningToFirst: false,
        leaseToken: '',
        handoffToken: '',
        handoffPage: 0,
        handoffExpiresAt: '',
        failureReports: [],
    };
    runtime.state.collection = api.normalizeCollection(raw);
    storage.set(runtime.KEYS.collection, plain(raw));
    assert.equal(await runtime.CollectionLease.acquire(), true);

    try {
        const result = await runtime.Collection.retryTransient('page-read', async () => {
            runtime.state.collectionPauseRequested = true;
            return { listings: [{ listingId: '1' }] };
        });

        assert.equal(result.ok, false);
        assert.equal(result.cancelled, true);
        assert.equal(result.attempts, 1);
        assert.equal(result.value, null);
    } finally {
        runtime.state.collectionPauseRequested = false;
        await runtime.CollectionLease.release();
    }
});

test('same-route hydration retries after an initial empty listing read', async () => {
    const { api, sandbox } = loadAnalyzer();
    const runtime = api.routeRuntime;
    const adapter = api.ListingPageAdapter;
    const originalReadStable = adapter.readStable;
    const originalSetStatus = runtime.UI.setStatus;
    const originalRender = runtime.UI.render;
    const statuses = [];
    runtime.UI.setStatus = (key, tone = 'ready') => { runtime.state.status = { key, tone, params: {} }; statuses.push(key); };
    runtime.UI.render = () => {};
    runtime.state.panel = {};
    runtime.state.routeKey = '';
    runtime.state.routeTask = null;
    sandbox.location.pathname = '/your/shops/me/tools/listings';
    sandbox.location.search = '?stats=true';
    sandbox.location.href = `https://www.etsy.com${sandbox.location.pathname}${sandbox.location.search}`;
    let reads = 0;
    adapter.readStable = async () => (++reads === 1 ? null : { listings: [{ listingId: 'late' }], pageInfo: { current: 1, total: 1, valid: true } });
    try {
        await runtime.handleRoute();
        assert.equal(runtime.state.routeKey, '');
        assert.equal(statuses.at(-1), 'noCards');
        await runtime.handleRoute();
        assert.equal(runtime.state.routeKey, `${sandbox.location.pathname}${sandbox.location.search}`);
        assert.deepEqual(plain(runtime.state.pageListings), [{ listingId: 'late' }]);
        assert.equal(statuses.at(-1), 'pageReady');
    } finally {
        adapter.readStable = originalReadStable;
        runtime.UI.setStatus = originalSetStatus;
        runtime.UI.render = originalRender;
        runtime.state.panel = null;
    }
});

test('fresh submitted deactivation redirects from listings only to its canonical editor for verification', async () => {
    const { api, sandbox, storage } = loadAnalyzer();
    const runtime = api.routeRuntime;
    const adapter = api.ListingPageAdapter;
    const now = new Date().toISOString();
    const queue = {
        id: 'deactivation-redirect', status: 'running', cursor: 0,
        items: [{
            listingId: '4309502756', status: 'deactivation-submitted',
            proposal: { action: 'DEACTIVATE_REVIEW' },
            deactivationAttemptId: 'attempt-redirect', deactivationStatusBefore: ['Active'],
            deactivationSubmittedIntentAt: now, editUrl: 'https://example.com/unsafe',
        }],
    };
    storage.set(api.actionRuntime.KEYS.queue, plain(queue));
    runtime.state.queue = plain(queue);
    runtime.state.panel = {};
    runtime.state.routeKey = '';
    runtime.state.routeTask = null;
    sandbox.location.pathname = '/your/shops/me/tools/listings';
    sandbox.location.search = '?stats=true';
    sandbox.location.href = `https://www.etsy.com${sandbox.location.pathname}${sandbox.location.search}`;
    const originalReadStable = adapter.readStable;
    const originalAssign = sandbox.location.assign;
    const originalSetStatus = runtime.UI.setStatus;
    const originalRender = runtime.UI.render;
    let reads = 0;
    let assigned = '';
    adapter.readStable = async () => { reads += 1; return null; };
    sandbox.location.assign = (url) => { assigned = String(url); };
    runtime.UI.setStatus = () => {};
    runtime.UI.render = () => {};
    try {
        assert.equal(await runtime.handleRoute({ force: true }), 'listings');
        assert.equal(assigned, 'https://www.etsy.com/your/shops/me/listing-editor/edit/4309502756');
        assert.equal(reads, 0);
        assert.equal(storage.get(api.actionRuntime.KEYS.queue).items[0].status, 'deactivation-submitted');
    } finally {
        adapter.readStable = originalReadStable;
        sandbox.location.assign = originalAssign;
        runtime.UI.setStatus = originalSetStatus;
        runtime.UI.render = originalRender;
        runtime.state.panel = null;
    }
});

test('a delayed old route cannot overwrite the current route state', async () => {
    const { api, sandbox } = loadAnalyzer();
    const runtime = api.routeRuntime;
    const adapter = api.ListingPageAdapter;
    const originalReadStable = adapter.readStable;
    const originalSetStatus = runtime.UI.setStatus;
    const originalRender = runtime.UI.render;
    let beginRead;
    const readStarted = new Promise((resolve) => { beginRead = resolve; });
    let finishRead;
    adapter.readStable = () => {
        beginRead();
        return new Promise((resolve) => { finishRead = resolve; });
    };
    runtime.UI.setStatus = (key, tone = 'ready') => { runtime.state.status = { key, tone, params: {} }; };
    runtime.UI.render = () => {};
    runtime.state.panel = {};
    runtime.state.pageListings = [{ listingId: 'sentinel' }];
    sandbox.location.pathname = '/your/shops/me/tools/listings';
    sandbox.location.search = '?stats=true';
    sandbox.location.href = `https://www.etsy.com${sandbox.location.pathname}${sandbox.location.search}`;
    try {
        const oldRoute = runtime.handleRoute({ force: true });
        await readStarted;
        sandbox.location.pathname = '/unsupported';
        sandbox.location.search = '';
        sandbox.location.href = 'https://www.etsy.com/unsupported';
        const currentRoute = runtime.handleRoute({ force: true });
        await currentRoute;
        finishRead({ listings: [{ listingId: 'stale' }], pageInfo: { current: 1, total: 1, valid: true } });
        await oldRoute;
        assert.equal(runtime.state.routeKey, '/unsupported');
        assert.equal(runtime.state.status.key, 'unsupportedPage');
        assert.deepEqual(plain(runtime.state.pageListings), [{ listingId: 'sentinel' }]);
    } finally {
        adapter.readStable = originalReadStable;
        runtime.UI.setStatus = originalSetStatus;
        runtime.UI.render = originalRender;
        runtime.state.panel = null;
    }
});

test('approximate counters remain descriptive and cannot authorize deactivation or calibration', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-31T12:00:00.000Z';
    const atDaysAgo = (days) => new Date(Date.parse(evaluatedAt) - days * 86400000).toISOString();
    const exactHistory = [
        snapshot(atDaysAgo(60), { renewals: 0 }),
        snapshot(atDaysAgo(45), { renewals: 1 }),
        snapshot(atDaysAgo(30), { renewals: 2 }),
        snapshot(evaluatedAt, { renewals: 4 }),
    ];
    const exactCandidate = record('precision-exact-control', exactHistory, { seasonality: 'non-seasonal' });
    assert.equal(api.evaluateRecord(exactCandidate, [exactCandidate], undefined, evaluatedAt).result.lifecycle, 'DEACTIVATION_REVIEW');

    for (const field of ['visits', 'favorites', 'sales', 'renewals']) {
        const approximateContract = plain(snapshot(evaluatedAt).metricContract);
        approximateContract.countPrecision[field] = 'approximate';
        const candidate = record(`precision-${field}`, [
            ...exactHistory.slice(0, -1),
            snapshot(evaluatedAt, { renewals: 4, metricContract: approximateContract }),
        ], { seasonality: 'non-seasonal' });
        const result = api.evaluateRecord(candidate, [candidate], undefined, evaluatedAt).result;
        assert.notEqual(result.lifecycle, 'DEACTIVATION_REVIEW', `${field} approximation must fail closed`);
        assert.equal(result.readiness.deactivationHistory, false);
        assert.equal(result.safeguards.find((item) => item.key === 'guardExactCounters')?.passed, false);
    }

    const approximateSalesContract = plain(snapshot(evaluatedAt).metricContract);
    approximateSalesContract.countPrecision.sales = 'approximate';
    const approximateRows = Array.from({ length: 20 }, (_, index) => record(`precision-calibration-${index}`, [
        snapshot(atDaysAgo(30), { visits: 1200, sales: 1200, metricContract: approximateSalesContract }),
        snapshot(evaluatedAt, { visits: 1200, sales: 1200, metricContract: approximateSalesContract }),
    ]));
    assert.deepEqual(plain(api.thresholdCalibration(approximateRows, evaluatedAt)), { available: false, sampleSize: 0, values: null });
    assert.deepEqual(plain(api.thresholdImpactCounts(approximateRows, undefined, evaluatedAt)), { improve: 0, protect: 0 });
});

test('exact precision labels still reject fractional, negative, and unsafe counters', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-31T12:00:00.000Z';
    const invalidValues = [1.5, -1, Number.MAX_SAFE_INTEGER + 1];
    invalidValues.forEach((visits, index) => {
        const candidate = record(`invalid-exact-${index}`, [snapshot(evaluatedAt, { visits })]);
        const derived = api.deriveRecordMetrics(candidate, evaluatedAt);
        const result = api.evaluateRecord(candidate, [candidate], undefined, evaluatedAt).result;
        assert.equal(derived.currentExactness.visits, false);
        assert.equal(result.readiness.trend, false);
        assert.equal(result.readiness.deactivationHistory, false);
    });

    const fractionalRenewals = record('fractional-renewal-history', [
        snapshot('2026-07-02T12:00:00.000Z', { renewals: 0 }),
        snapshot('2026-08-01T12:00:00.000Z', { renewals: 1.5 }),
        snapshot(evaluatedAt, { renewals: 2.5 }),
    ], { seasonality: 'non-seasonal' });
    const result = api.evaluateRecord(fractionalRenewals, [fractionalRenewals], undefined, evaluatedAt).result;
    assert.notEqual(result.lifecycle, 'DEACTIVATION_REVIEW');
    assert.equal(result.readiness.deactivationHistory, false);
    assert.equal(result.safeguards.find((item) => item.key === 'guardExactCounters')?.passed, false);
});

test('metric precision fences isolate traffic, engagement, demand, renewal, and deactivation consumers', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-31T12:00:00.000Z';
    const atDaysAgo = (days) => new Date(Date.parse(evaluatedAt) - days * 86400000).toISOString();
    const approximate = (...fields) => {
        const contract = plain(snapshot(evaluatedAt).metricContract);
        fields.forEach((field) => { contract.countPrecision[field] = 'approximate'; });
        return contract;
    };

    const approximateSales = approximate('sales');
    const growing = record('precision-isolated-growth', [
        snapshot(atDaysAgo(60), { visits: 25, favorites: 3, sales: 0, metricContract: approximateSales }),
        snapshot(atDaysAgo(30), { visits: 100, favorites: 8, sales: 0, metricContract: approximateSales }),
        snapshot(evaluatedAt, { visits: 400, favorites: 20, sales: 0, metricContract: approximateSales }),
    ]);
    const growingResult = api.evaluateRecord(growing, [growing], undefined, evaluatedAt).result;
    assert.equal(growingResult.lifecycle, 'ACTIVE_GROWING');
    assert.ok(Number.isFinite(growingResult.score));
    assert.equal(growingResult.derived.sales30, null);
    assert.equal(growingResult.readiness.trend, true);
    assert.equal(growingResult.readiness.deactivationHistory, false);

    const approximateFavorites = approximate('favorites');
    const discovery = record('precision-traffic-only', [
        snapshot(atDaysAgo(30), { visits: 5, favorites: 2, metricContract: approximateFavorites }),
        snapshot(evaluatedAt, { visits: 5, favorites: 2, metricContract: approximateFavorites }),
    ]);
    const discoveryResult = api.evaluateRecord(discovery, [discovery], undefined, evaluatedAt).result;
    assert.equal(discoveryResult.diagnosis, 'DISCOVERY_WEAK');
    assert.equal(discoveryResult.code, 'improve');
    assert.equal(discoveryResult.score, null);
    assert.equal(discoveryResult.scoreBasis, 'insufficient');
    assert.notEqual(discoveryResult.currentAssessment.funnelSignal, 'STRONG_CURRENT');
    assert.equal(discoveryResult.currentAssessment.components.engagement, null);
    assert.equal(discoveryResult.evidence.some((item) => item.key.startsWith('evidenceSnapshotScore')), false);

    const highVisibilityOnly = record('precision-high-traffic-only', [snapshot(evaluatedAt, {
        visits: 100, favorites: 20, metricContract: approximateFavorites,
    })]);
    const highVisibilityResult = api.evaluateRecord(highVisibilityOnly, [highVisibilityOnly], undefined, evaluatedAt).result;
    assert.equal(highVisibilityResult.score, null);
    assert.equal(highVisibilityResult.scoreBasis, 'insufficient');
    assert.notEqual(highVisibilityResult.currentAssessment.funnelSignal, 'STRONG_CURRENT');
    assert.equal(highVisibilityResult.currentAssessment.components.visibility, 100);
    assert.equal(highVisibilityResult.currentAssessment.components.engagement, null);

    const exactFavoritesControl = record('precision-engagement-control', [snapshot(evaluatedAt, {
        visits: 100, favorites: 20,
    })]);
    const exactFavoritesResult = api.evaluateRecord(exactFavoritesControl, [exactFavoritesControl], undefined, evaluatedAt).result;
    assert.ok(Number.isFinite(exactFavoritesResult.score));
    assert.equal(exactFavoritesResult.scoreBasis, 'current-30d-reach-engagement');
    assert.equal(exactFavoritesResult.currentAssessment.funnelSignal, 'STRONG_CURRENT');
    assert.equal(exactFavoritesResult.evidence.some((item) => item.key.startsWith('evidenceSnapshotScore')), true);

    const approximateTrafficAndRenewals = approximate('visits', 'renewals');
    const provenDemand = record('precision-demand-only', [snapshot(evaluatedAt, {
        visits: 100, favorites: 10, sales: 1, revenue: 20, renewals: 2, metricContract: approximateTrafficAndRenewals,
    })]);
    const demandResult = api.evaluateRecord(provenDemand, [provenDemand], undefined, evaluatedAt).result;
    assert.equal(demandResult.code, 'protected');
    assert.equal(demandResult.score, null);
    assert.equal(demandResult.readiness.snapshot, true);
    assert.equal(demandResult.readiness.deactivationHistory, false);

    const approximateSalesOnly = record('precision-no-false-demand', [snapshot(evaluatedAt, {
        visits: 100, favorites: 10, sales: 1000, revenue: 0, metricContract: approximateSales,
    })]);
    const approximateSalesResult = api.evaluateRecord(approximateSalesOnly, [approximateSalesOnly], undefined, evaluatedAt).result;
    assert.notEqual(approximateSalesResult.code, 'protected');
    assert.equal(approximateSalesResult.currentAssessment.cumulativeSignal, null);

    const approximateRenewals = approximate('renewals');
    const exactDemand = record('precision-renewals-independent', [snapshot(evaluatedAt, {
        visits: 100, favorites: 10, sales: 1, revenue: 0, renewals: 2000, metricContract: approximateRenewals,
    })]);
    assert.equal(api.evaluateRecord(exactDemand, [exactDemand], undefined, evaluatedAt).result.code, 'protected');

    const approximateRenewalWaste = record('precision-no-false-renewal-waste', [snapshot(evaluatedAt, {
        visits: 100, favorites: 0, sales: 0, revenue: 0, renewals: 2000, metricContract: approximateRenewals,
    })]);
    const approximateRenewalResult = api.evaluateRecord(approximateRenewalWaste, [approximateRenewalWaste], undefined, evaluatedAt).result;
    assert.notEqual(approximateRenewalResult.currentAssessment.cumulativeSignal, 'RENEWAL_WASTE');

    const approximateZeroSales = record('precision-no-false-zero-demand', [snapshot(evaluatedAt, {
        visits: 100, favorites: 0, sales: 0, revenue: 0, renewals: 2, metricContract: approximateSales,
    })]);
    const approximateZeroSalesResult = api.evaluateRecord(approximateZeroSales, [approximateZeroSales], undefined, evaluatedAt).result;
    assert.equal(approximateZeroSalesResult.currentAssessment.cumulativeSignal, null);

    const approximateVisits = approximate('visits');
    const exactRenewalWaste = record('precision-renewal-waste-independent', [snapshot(evaluatedAt, {
        visits: 1000, favorites: 0, sales: 0, revenue: 0, renewals: 2, metricContract: approximateVisits,
    })]);
    const exactRenewalWasteResult = api.evaluateRecord(exactRenewalWaste, [exactRenewalWaste], undefined, evaluatedAt).result;
    assert.equal(exactRenewalWasteResult.code, 'improve');
    assert.equal(exactRenewalWasteResult.bootstrap.signal, 'RENEWAL_WASTE');
    assert.equal(exactRenewalWasteResult.score, null);

    const approximateRenewalRows = Array.from({ length: 20 }, (_, index) => record(`precision-renewal-calibration-${index}`, [
        snapshot(atDaysAgo(60), { visits: 100, renewals: 0, metricContract: approximateRenewals }),
        snapshot(atDaysAgo(30), { visits: 100, renewals: 1000, metricContract: approximateRenewals }),
        snapshot(evaluatedAt, { visits: 100, renewals: 2000, metricContract: approximateRenewals }),
    ]));
    const renewalCalibration = plain(api.thresholdCalibration(approximateRenewalRows, evaluatedAt));
    assert.equal(renewalCalibration.available, true);
    assert.equal(renewalCalibration.groupSizes.dormantRenewals, 0);
    assert.equal(renewalCalibration.calibratedFields.minRenewalsToReview, false);
});

test('exact cumulative anchors are not shadowed by a closer approximate sales capture', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-31T12:00:00.000Z';
    const atDaysAgo = (days) => new Date(Date.parse(evaluatedAt) - days * 86400000).toISOString();
    const approximateContract = plain(snapshot(evaluatedAt).metricContract);
    approximateContract.countPrecision.sales = 'approximate';
    const candidate = record('exact-sales-anchor', [
        snapshot(atDaysAgo(30.5), { visits: 100, sales: 0 }),
        snapshot(atDaysAgo(30), { visits: 100, sales: 9, metricContract: approximateContract }),
        snapshot(evaluatedAt, { visits: 100, sales: 10 }),
    ]);
    const derived = plain(api.deriveRecordMetrics(candidate, evaluatedAt));
    assert.equal(derived.anchors.d30.actualDays, 30);
    assert.equal(derived.anchors.d30Sales.actualDays, 30.5);
    assert.equal(derived.sales30Raw, 10);
    assert.ok(derived.sales30 > 9.8 && derived.sales30 < 9.9);
});

test('currency drift never creates a revenue delta or monetary protection signal', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-31T12:00:00.000Z';
    const mixed = record('currency-mixed', [
        snapshot('2026-07-02T12:00:00.000Z', { sales: 5, revenue: 100, currency: '$', priceLabel: '$20.00' }),
        snapshot('2026-08-01T12:00:00.000Z', { sales: 5, revenue: 100, currency: '$', priceLabel: '$20.00' }),
        snapshot(evaluatedAt, { sales: 5, revenue: 110, currency: '€', priceLabel: '€20.00' }),
    ]);
    const mixedResult = api.evaluateRecord(mixed, [mixed], undefined, evaluatedAt).result;
    assert.equal(mixedResult.derived.revenue30, null);
    assert.equal(mixedResult.derived.revenue60, null);
    assert.ok(mixedResult.anomalies.includes('currency-mismatch'));
    assert.ok(!mixedResult.anomalies.includes('cumulative-decrease-revenue'));
    assert.equal(mixedResult.lifecycle, 'DATA_GAP');

    const sameCurrency = record('currency-control', [
        snapshot('2026-08-01T12:00:00.000Z', { sales: 5, revenue: 100, currency: '$' }),
        snapshot(evaluatedAt, { sales: 5, revenue: 110, currency: '$' }),
    ]);
    assert.equal(api.deriveRecordMetrics(sameCurrency, evaluatedAt).revenue30Raw, 10);

    const zeroAcrossCurrencies = record('currency-zero-control', [
        snapshot('2026-08-01T12:00:00.000Z', { revenue: 0, currency: '$' }),
        snapshot(evaluatedAt, { revenue: 0, currency: '€' }),
    ]);
    const zeroDerived = api.deriveRecordMetrics(zeroAcrossCurrencies, evaluatedAt);
    assert.equal(zeroDerived.revenue30Raw, 0);
    assert.ok(!zeroDerived.anomalies.includes('currency-mismatch'));
});

test('future snapshots inside the former one-day window fail closed', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-31T12:00:00.000Z';
    const futureAt = new Date(Date.parse(evaluatedAt) + 60 * 60 * 1000).toISOString();
    const candidate = record('future-hour', [
        snapshot(new Date(Date.parse(futureAt) - 60 * 86400000).toISOString(), { renewals: 0 }),
        snapshot(new Date(Date.parse(futureAt) - 30 * 86400000).toISOString(), { renewals: 2 }),
        snapshot(futureAt, { renewals: 4 }),
    ], { seasonality: 'non-seasonal' });
    const result = api.evaluateRecord(candidate, [candidate], undefined, evaluatedAt).result;
    assert.equal(result.lifecycle, 'DATA_GAP');
    assert.ok(result.anomalies.includes('future-snapshot'));
    assert.equal(result.readiness.deactivationHistory, false);

    const withinTolerance = record('future-tolerated', [snapshot('2026-08-31T12:04:59.000Z')]);
    const beyondTolerance = record('future-rejected', [snapshot('2026-08-31T12:05:01.000Z')]);
    assert.ok(!api.evaluateRecord(withinTolerance, [withinTolerance], undefined, evaluatedAt).result.anomalies.includes('future-snapshot'));
    assert.ok(api.evaluateRecord(beyondTolerance, [beyondTolerance], undefined, evaluatedAt).result.anomalies.includes('future-snapshot'));

    const futureCalibration = Array.from({ length: 20 }, (_, index) => record(`future-calibration-${index}`, [
        snapshot(new Date(Date.parse(futureAt) - 30 * 86400000).toISOString(), { visits: 50, sales: 0 }),
        snapshot(futureAt, { visits: 50, sales: 0 }),
    ]));
    assert.deepEqual(plain(api.thresholdCalibration(futureCalibration, evaluatedAt)), { available: false, sampleSize: 0, values: null });
});

test('exact zero-baseline traffic can become growth without inventing a percentage', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-31T12:00:00.000Z';
    const makeCandidate = (id, middleVisits) => record(id, [
        snapshot('2026-07-02T12:00:00.000Z', { visits: 0 }),
        snapshot('2026-08-01T12:00:00.000Z', { visits: middleVisits }),
        snapshot(evaluatedAt, { visits: 100 }),
    ]);
    const settings = { minVisitsToImprove: 10, minVisitsToProtect: 60 };
    const tiny = api.evaluateRecord(makeCandidate('zero-growth-tiny', 9), undefined, settings, evaluatedAt).result;
    const material = api.evaluateRecord(makeCandidate('zero-growth-material', 10), undefined, settings, evaluatedAt).result;
    assert.notEqual(tiny.lifecycle, 'ACTIVE_GROWING');
    assert.equal(material.lifecycle, 'ACTIVE_GROWING');
    assert.equal(material.derived.previousTrendTrafficChangePercent, null);
    assert.equal(material.derived.trendIntervals.prior.ratioKind, 'infinite');
    assert.ok(material.derived.trendIntervals.prior.low > 1);
});

test('hard cohort diagnoses require full strength for the metric being used', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-31T12:00:00.000Z';
    const target = record('metric-strength-target', [
        snapshot('2026-07-02T12:00:00.000Z', { visits: 500, favorites: 20, sales: 0 }),
        snapshot('2026-08-01T12:00:00.000Z', { visits: 500, favorites: 20, sales: 0 }),
        snapshot(evaluatedAt, { visits: 500, favorites: 20, sales: 1 }),
    ]);
    const sparsePeers = Array.from({ length: 30 }, (_, index) => {
        const usable = index < 8;
        return record(`metric-strength-peer-${index}`, [
            snapshot('2026-08-01T12:00:00.000Z', { visits: usable ? 500 : 0, favorites: usable ? 50 : 0, sales: 0 }),
            snapshot(evaluatedAt, { visits: usable ? 500 : 0, favorites: usable ? 50 : 0, sales: usable ? 1 : 0 }),
        ]);
    });
    const sparse = api.evaluateRecord(target, [target, ...sparsePeers], undefined, evaluatedAt).result;
    assert.equal(sparse.benchmark.size, 30);
    assert.equal(sparse.benchmark.strength, 1);
    assert.equal(sparse.benchmark.metrics.favoriteRate.samples, 8);
    assert.ok(sparse.benchmark.metrics.favoriteRate.strength < 1);
    assert.equal(sparse.diagnosis, 'HEALTHY_OR_MIXED');

    const fullPeers = Array.from({ length: 30 }, (_, index) => record(`metric-full-peer-${index}`, [
        snapshot('2026-08-01T12:00:00.000Z', { visits: 500, favorites: 50, sales: 0 }),
        snapshot(evaluatedAt, { visits: 500, favorites: 50, sales: 1 }),
    ]));
    const full = api.evaluateRecord(target, [target, ...fullPeers], undefined, evaluatedAt).result;
    assert.equal(full.benchmark.metrics.favoriteRate.samples, 30);
    assert.equal(full.benchmark.metrics.favoriteRate.strength, 1);
    assert.equal(full.diagnosis, 'ENGAGEMENT_WEAK');
});

test('price cohorts and revenue metrics never mix currencies', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-31T12:00:00.000Z';
    const makePriced = (id, currency, favorites = 5) => record(id, [
        snapshot('2026-08-01T12:00:00.000Z', { visits: 100, favorites, sales: 0, revenue: 0, priceMin: 100, priceMax: 100, currency }),
        snapshot(evaluatedAt, { visits: 100, favorites, sales: 1, revenue: 10, priceMin: 100, priceMax: 100, currency }),
    ]);
    const target = makePriced('currency-cohort-target', '$');
    const usdPeers = Array.from({ length: 8 }, (_, index) => makePriced(`currency-usd-${index}`, '$', 6));
    const eurPeers = Array.from({ length: 22 }, (_, index) => makePriced(`currency-eur-${index}`, '€', 7));
    const result = api.evaluateRecord(target, [target, ...usdPeers, ...eurPeers], undefined, evaluatedAt).result;
    assert.equal(result.benchmark.size, 8);
    assert.match(result.benchmark.scope, /price-band/);
    assert.equal(result.benchmark.metrics.revenuePerVisitProxy.samples, 8);
});

test('price-band cache treats canonical currency aliases as comparable', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-31T12:00:00.000Z';
    const makePriced = (id, currency) => record(id, [
        snapshot('2026-08-01T12:00:00.000Z', { visits: 100, sales: 0, revenue: 0, priceMin: 100, priceMax: 100, currency }),
        snapshot(evaluatedAt, { visits: 100, sales: 1, revenue: 10, priceMin: 100, priceMax: 100, currency }),
    ]);
    const target = makePriced('currency-alias-target', 'EUR ');
    const aliases = Array.from({ length: 8 }, (_, index) => makePriced(`currency-alias-${index}`, index % 2 ? 'EUR ' : '€'));
    const otherCurrency = Array.from({ length: 10 }, (_, index) => makePriced(`currency-alias-usd-${index}`, '$'));
    const benchmark = api.evaluateRecord(target, [target, ...aliases, ...otherCurrency], undefined, evaluatedAt).result.benchmark;
    assert.equal(benchmark.size, 8);
    assert.match(benchmark.scope, /price-band/);
    assert.equal(benchmark.metrics.revenuePerVisitProxy.samples, 8);
});

test('cached cohort distributions match the uncached price-band and self-exclusion oracle', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-31T12:00:00.000Z';
    const makePriced = (id, price, currency, index) => record(id, [
        snapshot('2026-08-01T12:00:00.000Z', {
            visits: 40 + index, favorites: index % 5, sales: index, revenue: index * 10,
            priceMin: price, priceMax: price, currency,
        }),
        snapshot(evaluatedAt, {
            visits: 50 + index, favorites: (index % 5) + 1, sales: index + 1, revenue: (index + 1) * 12,
            priceMin: price, priceMax: price, currency,
        }),
    ], { listingType: 'physical', seasonality: 'non-seasonal' });
    const samePrice = Array.from({ length: 8 }, (_, index) => makePriced(`cache-oracle-${index}`, 100, '$', index));
    const rows = [
        ...samePrice,
        makePriced('cache-oracle-boundary', 130, '$', 8),
        makePriced('cache-oracle-outside', 130.01, '$', 9),
        makePriced('cache-oracle-eur', 100, '€', 10),
    ];
    const evaluated = plain(api.evaluateRecordsWithDiagnostics(rows, undefined, evaluatedAt));
    const derived = new Map(rows.map((item) => [item.listingId, api.deriveRecordMetrics(item, evaluatedAt)]));
    const quantile = (sorted, q) => {
        if (!sorted.length) return null;
        const position = (sorted.length - 1) * q;
        const lower = Math.floor(position);
        const upper = Math.ceil(position);
        return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
    };
    const oracleMedian = (sorted) => {
        if (!sorted.length) return null;
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    };
    const percentile = (sorted, target) => {
        if (!sorted.length || !Number.isFinite(target)) return null;
        const below = sorted.filter((value) => value < target).length;
        const equal = sorted.filter((value) => value === target).length;
        return Math.max(0, Math.min(100, Math.round(((below + equal * 0.5) / sorted.length) * 100)));
    };
    const metricValue = (name, item, targetCurrency) => {
        const value = derived.get(item.listingId);
        if (name === 'revenuePerVisitProxy' && item.history.at(-1).currency !== targetCurrency) return null;
        return name === 'favoriteRate' ? value.favoriteRateSmoothed : value[name];
    };
    const manual = (target) => {
        const targetDerived = derived.get(target.listingId);
        const targetCurrency = target.history.at(-1).currency;
        const targetPrice = targetDerived.current.priceMin;
        let cohort = rows.filter((item) => item.listingId !== target.listingId);
        const band = cohort.filter((item) => {
            const candidate = derived.get(item.listingId);
            return item.history.at(-1).currency === targetCurrency
                && candidate.current.priceMin > 0
                && Math.abs(Math.log(candidate.current.priceMin / targetPrice)) <= Math.log(1.3);
        });
        if (band.length >= 8) cohort = band;
        const metrics = {};
        for (const name of ['visits30', 'favoriteRate', 'salesRateProxy', 'revenuePerVisitProxy', 'sales30']) {
            const sorted = cohort.map((item) => metricValue(name, item, targetCurrency)).filter(Number.isFinite).sort((a, b) => a - b);
            const reliable = sorted.length >= 8;
            metrics[name] = {
                median: oracleMedian(sorted),
                p25: quantile(sorted, 0.25),
                p75: quantile(sorted, 0.75),
                percentile: percentile(sorted, metricValue(name, target, targetCurrency)),
                samples: sorted.length,
                reliable,
                strength: reliable ? Math.max(0, Math.min(1, (sorted.length - 8 + 1) / (30 - 8 + 1))) : 0,
            };
        }
        return { size: cohort.length, metrics };
    };

    for (const target of samePrice) {
        const expected = manual(target);
        const actual = evaluated.evaluations[target.listingId].result.benchmark;
        assert.equal(actual.size, expected.size);
        assert.equal(actual.scope, 'active-shop-price-band-physical-non-seasonal');
        assert.deepEqual(actual.metrics, expected.metrics);
    }
    assert.equal(evaluated.diagnostics.distributionSorts, 20);
});

test('calibration output and settings UI share one bounded threshold contract', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-31T12:00:00.000Z';
    const rows = Array.from({ length: 20 }, (_, index) => record(`extreme-calibration-${index}`, [
        snapshot('2026-08-01T12:00:00.000Z', { visits: 2_000_000 + index * 10_000, sales: 0, renewals: 0 }),
        snapshot(evaluatedAt, { visits: 2_100_000 + index * 10_000, sales: index >= 10 ? 1 : 0, renewals: index }),
    ]));
    const calibration = plain(api.thresholdCalibration(rows, evaluatedAt));
    assert.equal(calibration.available, true);
    assert.deepEqual(calibration.values, plain(api.normalizeHealthThresholds(calibration.values)));
    assert.equal(calibration.values.minVisitsToImprove, api.thresholdContracts.minVisitsToImprove.max);
    assert.equal(calibration.values.minVisitsToProtect, api.thresholdContracts.minVisitsToProtect.max);
    assert.ok(calibration.values.minVisitsToProtect > calibration.values.minVisitsToImprove);
    const boundary = plain(api.normalizeHealthThresholds({
        minVisitsToImprove: 9_000_000,
        minVisitsToProtect: 9_000_001,
        minRenewalsToReview: 9_000_000,
        declinePercent: 1000,
    }));
    assert.deepEqual(boundary, {
        minVisitsToImprove: 999999,
        minVisitsToProtect: 1000000,
        minRenewalsToReview: 1000000,
        declinePercent: 100,
    });
});

test('snapshot state rejects duplicate IDs and malformed roots on a final page', () => {
    const { api, sandbox } = loadAnalyzer();
    const fixture = JSON.parse(fs.readFileSync(sanitizedListingsFixturePath, 'utf8'));
    const duplicated = plain(fixture);
    duplicated.cards.push({ ...duplicated.cards[0], title: 'Synthetic Fixture Duplicate' });
    const originalDocument = sandbox.document;
    const duplicateDocument = buildSanitizedListingsDocument(duplicated);
    sandbox.document = duplicateDocument;
    const fixtureUrl = new URL(fixture.page.href);
    sandbox.location.pathname = fixtureUrl.pathname;
    sandbox.location.search = fixtureUrl.search;
    sandbox.location.href = fixtureUrl.href;
    try {
        assert.equal(api.ListingPageAdapter.cardRoots().length, 41);
        assert.equal(api.ListingPageAdapter.cardLinks().length, 40);
        const duplicateState = api.ListingPageAdapter.snapshotState({ requirePagination: true });
        assert.equal(duplicateState.rootCount, 41);
        assert.equal(duplicateState.valid, false);

        const malformedDocument = buildSanitizedListingsDocument(fixture);
        const malformedLink = malformedDocument.querySelector('a.card-body');
        malformedLink.setAttribute('href', 'https://www.etsy.com/your/shops/me/tools/listings');
        sandbox.document = malformedDocument;
        assert.equal(api.ListingPageAdapter.cardRoots().length, 40);
        assert.equal(api.ListingPageAdapter.cardLinks().length, 39);
        assert.equal(api.ListingPageAdapter.snapshotState({ requirePagination: true }).valid, false);
    } finally {
        sandbox.document = originalDocument;
    }
});

test('listing capture resolves known currency aliases and rejects mismatched or unsupported markers', () => {
    const { api, sandbox } = loadAnalyzer();
    const fixture = JSON.parse(fs.readFileSync(sanitizedListingsFixturePath, 'utf8'));
    const mismatched = plain(fixture);
    mismatched.defaults.metricSections[1].rows[1] = '€0 revenue';
    const originalDocument = sandbox.document;
    const fixtureDocument = buildSanitizedListingsDocument(mismatched);
    sandbox.document = fixtureDocument;
    const fixtureUrl = new URL(fixture.page.href);
    sandbox.location.pathname = fixtureUrl.pathname;
    sandbox.location.search = fixtureUrl.search;
    sandbox.location.href = fixtureUrl.href;
    try {
        assert.equal(api.ListingPageAdapter.cardRoots().length, 40);
        assert.equal(api.ListingPageAdapter.scan().length, 0);
        assert.equal(api.ListingPageAdapter.snapshotState({ requirePagination: true }).valid, false);

        const usdAlias = plain(fixture);
        usdAlias.defaults.priceText = 'USD 20.00';
        usdAlias.defaults.metricSections[1].rows[1] = '$0 revenue';
        sandbox.document = buildSanitizedListingsDocument(usdAlias);
        const usdListings = api.ListingPageAdapter.scan();
        assert.equal(usdListings.length, 40);
        assert.equal(usdListings[0].currency, 'USD ');

        const tryAlias = plain(fixture);
        tryAlias.defaults.priceText = 'TRY 20.00';
        tryAlias.defaults.metricSections[1].rows[1] = '₺0 revenue';
        sandbox.document = buildSanitizedListingsDocument(tryAlias);
        assert.equal(api.ListingPageAdapter.scan().length, 40);
        assert.equal(api.currencyMarker('TL 10.00'), 'TRY ');

        const unsupported = plain(fixture);
        unsupported.defaults.priceText = 'XYZ 20.00';
        unsupported.defaults.metricSections[1].rows[1] = 'XYZ 0 revenue';
        sandbox.document = buildSanitizedListingsDocument(unsupported);
        assert.equal(api.ListingPageAdapter.scan().length, 0);
        assert.equal(api.currencyMarker('XYZ 10.00'), '');

        for (const conflictingMarker of ['XYZ $', 'EUR $']) {
            const conflicting = plain(fixture);
            conflicting.defaults.priceText = `${conflictingMarker}20.00`;
            conflicting.defaults.metricSections[1].rows[1] = `${conflictingMarker}0 revenue`;
            sandbox.document = buildSanitizedListingsDocument(conflicting);
            assert.equal(api.ListingPageAdapter.scan().length, 0, `${conflictingMarker} must fail closed`);
            assert.equal(api.currencyMarker(`${conflictingMarker}10.00`), '');
        }

        const unsupportedPriceOnly = plain(fixture);
        unsupportedPriceOnly.defaults.priceText = 'XYZ 20.00';
        unsupportedPriceOnly.defaults.metricSections[1].rows[1] = '$0 revenue';
        sandbox.document = buildSanitizedListingsDocument(unsupportedPriceOnly);
        assert.equal(api.ListingPageAdapter.scan().length, 0);
    } finally {
        sandbox.document = originalDocument;
    }
});

test('history charts expose quality, omit stale values, and keep zero on the baseline', () => {
    const { api } = loadAnalyzer();
    const approximateContract = plain(snapshot('2026-08-02T12:00:00.000Z').metricContract);
    approximateContract.countPrecision.visits = 'approximate';
    const model = plain(api.buildHistoryChartModel([
        snapshot('2026-08-01T12:00:00.000Z', { visits: 0 }),
        snapshot('2026-08-02T12:00:00.000Z', { visits: 1, metricContract: approximateContract }),
        { ...snapshot('2026-08-03T12:00:00.000Z', { visits: 2 }), metricContract: null },
        snapshot('2026-08-04T12:00:00.000Z', { visits: 3, observedAt: { visits: '2026-08-04T10:00:00.000Z' } }),
        snapshot('2026-08-05T12:00:00.000Z', { visits: '   ' }),
        snapshot('2026-08-06T12:00:00.000Z', { visits: 4 }),
    ], 'visits'));
    assert.deepEqual(model.qualityCounts, { exact: 2, approximate: 1, legacy: 1, stale: 1, missing: 1 });
    assert.deepEqual(model.points.map((point) => point.quality), ['exact', 'approximate', 'legacy', 'exact']);
    assert.equal(model.segments.length, 2);

    const zeroModel = plain(api.buildHistoryChartModel([
        snapshot('2026-08-01T12:00:00.000Z', { visits: 0 }),
        snapshot('2026-08-02T12:00:00.000Z', { visits: 0 }),
    ], 'visits'));
    assert.ok(zeroModel.points.every((point) => point.y === 82));
    const flatPositive = plain(api.buildHistoryChartModel([
        snapshot('2026-08-01T12:00:00.000Z', { visits: 50 }),
        snapshot('2026-08-02T12:00:00.000Z', { visits: 50 }),
    ], 'visits'));
    assert.ok(flatPositive.points.every((point) => point.y === 46));

    const markup = api.updater.UI.historyChart([
        snapshot('2026-08-01T12:00:00.000Z', { visits: 0 }),
        snapshot('2026-08-02T12:00:00.000Z', { visits: 1, metricContract: approximateContract }),
        { ...snapshot('2026-08-03T12:00:00.000Z', { visits: 2 }), metricContract: null },
    ], 'visits', 'Visits');
    assert.match(markup, /data-quality="approximate"/);
    assert.match(markup, /data-quality="legacy"/);
    assert.match(markup, /≈/);

    const limitedEndpoint = plain(api.buildHistoryChartModel([
        snapshot('2026-08-01T12:00:00.000Z', { visits: 100 }),
        snapshot('2026-08-02T12:00:00.000Z', { visits: 200, metricContract: approximateContract }),
    ], 'visits'));
    assert.equal(limitedEndpoint.tone, 'neutral');
});

test('revenue charts compare one canonical currency at a time and never color limited evidence', () => {
    const { api } = loadAnalyzer();
    const model = plain(api.buildHistoryChartModel([
        snapshot('2026-08-01T12:00:00.000Z', { revenue: 100, currency: '$' }),
        snapshot('2026-08-02T12:00:00.000Z', { revenue: 110, currency: '$' }),
        snapshot('2026-08-03T12:00:00.000Z', { revenue: 120, currency: '€' }),
        snapshot('2026-08-04T12:00:00.000Z', { revenue: 130, currency: '€' }),
    ], 'revenue'));
    assert.deepEqual(model.currencies, ['$', '€']);
    assert.equal(model.comparableCurrencies, false);
    assert.equal(model.tone, 'neutral');
    assert.equal(model.segments.length, 1);
    assert.equal(model.excludedCurrencyCount, 2);
    assert.deepEqual(model.points.map((point) => point.currency), ['€', '€']);
    assert.equal(model.min, 120);
    assert.equal(model.max, 130);

    const aliases = plain(api.buildHistoryChartModel([
        snapshot('2026-08-01T12:00:00.000Z', { revenue: 100, currency: 'EUR' }),
        snapshot('2026-08-02T12:00:00.000Z', { revenue: 110, currency: '€' }),
    ], 'revenue'));
    assert.equal(aliases.comparableCurrencies, true);
    assert.deepEqual(aliases.currencyIdentities, ['EUR']);
    assert.equal(aliases.segments.length, 1);
    assert.equal(aliases.tone, 'up');

    const unknownUnitHistory = [
        snapshot('2026-08-01T12:00:00.000Z', { revenue: 100, currency: '€' }),
        snapshot('2026-08-02T12:00:00.000Z', { revenue: 110, currency: '€' }),
        snapshot('2026-08-03T12:00:00.000Z', { revenue: 999, currency: '' }),
    ];
    const unknownUnit = plain(api.buildHistoryChartModel(unknownUnitHistory, 'revenue'));
    assert.equal(unknownUnit.qualityCounts.missing, 1);
    assert.equal(unknownUnit.points.length, 2);
    const markup = api.updater.UI.historyChart(unknownUnitHistory, 'revenue', 'Revenue', '$');
    assert.doesNotMatch(markup, /\$/);
});

test('snapshot day keys and displayed timestamps use one canonical UTC contract', () => {
    const { api } = loadAnalyzer();
    assert.equal(api.dayKey('2026-09-01T00:30:00+02:00'), '2026-08-31');
    const normalized = plain(api.normalizeSnapshot({
        ...snapshot('2026-09-01T00:30:00+02:00'),
        day: '2026-09-01',
    }));
    assert.equal(normalized.day, '2026-08-31');
    const merged = plain(api.normalizeRecord(record('utc-day-merge', [
        snapshot('2026-09-01T00:30:00+02:00', { day: '2026-09-01', visits: 1 }),
        snapshot('2026-08-31T23:30:00.000Z', { day: '2026-08-31', visits: 2 }),
    ])));
    assert.equal(merged.history.length, 1);
    assert.equal(merged.history[0].day, '2026-08-31');
    assert.equal(merged.history[0].quality.mergedCaptures, 2);
    api.settingsRuntime.state.settings.language = 'en';
    assert.match(api.formatDate('2026-09-01T00:30:00+02:00'), /Aug 31, 2026.*UTC/);
});

test('history details never describe an unavailable longitudinal score as measured', () => {
    const { api } = loadAnalyzer();
    const ui = api.updater.UI;
    api.settingsRuntime.state.settings.language = 'en';
    const candidate = record('history-insufficient-score', [
        snapshot('2026-07-02T12:00:00.000Z', { visits: 80 }),
        snapshot('2026-08-01T12:00:00.000Z', { visits: 100 }),
    ]);
    candidate.analysis = {
        lifecycle: 'ACTIVE_STABLE', diagnosis: 'HEALTHY_OR_MIXED', code: 'monitor', tone: 'balanced',
        score: null, scoreBasis: 'insufficient', assessmentMode: 'longitudinal', confidence: 50,
        confidenceBand: 'medium', confidenceComponents: {}, confidenceCaps: [], evidence: [], safeguards: [],
        nextReviewAt: '2026-09-01T12:00:00.000Z',
    };
    const originalOpenModal = ui.openModal;
    let markup = '';
    ui.openModal = (_title, body) => { markup = body; };
    try { ui.openHistory(candidate); }
    finally { ui.openModal = originalOpenModal; }
    assert.ok(markup.includes(api.translate('insufficientBasis')));
    assert.equal(markup.includes(api.translate('longitudinalBasis')), false);
});

test('UI preference writes are ordered snapshots and repeated failures restore last-confirmed settings', async () => {
    const { api, sandbox } = loadAnalyzer();
    const runtime = api.settingsRuntime;
    await runtime.Store.loadSettings();
    const pending = [];
    sandbox.GM.setValue = (key, value) => new Promise((resolve) => pending.push({ key, value: plain(value), resolve }));

    runtime.state.settings.language = 'en';
    const first = runtime.Store.saveUiPreferences(['language']);
    runtime.state.settings.language = 'tr';
    const second = runtime.Store.saveUiPreferences(['language']);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(pending.length, 1);
    assert.equal(pending[0].value.language, 'en');
    pending[0].resolve();
    assert.equal(await first, true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(pending.length, 2);
    assert.equal(pending[1].value.language, 'tr');
    pending[1].resolve();
    assert.equal(await second, true);

    sandbox.GM.setValue = async () => { throw new Error('synthetic write failure'); };
    const collapse = api.updater.UI.setCollapsed(true);
    const language = api.updater.UI.toggleLanguage();
    assert.deepEqual(await Promise.all([collapse, language]), [false, false]);
    assert.equal(runtime.state.settings.collapsed, false);
    assert.equal(runtime.state.settings.language, 'tr');
});

test('independent UI preferences reconcile mixed write outcomes field by field', async () => {
    const runPair = async (outcomes) => {
        const { api, sandbox, storage } = loadAnalyzer();
        const runtime = api.settingsRuntime;
        const key = api.actionRuntime.KEYS.uiPreferences;
        await runtime.Store.loadSettings();
        const pending = [];
        sandbox.GM.setValue = (storageKey, value) => {
            if (storageKey !== key) { storage.set(storageKey, plain(value)); return Promise.resolve(); }
            return new Promise((resolve, reject) => pending.push({
                key: storageKey,
                value: plain(value),
                resolve,
                reject,
            }));
        };
        const collapse = api.updater.UI.setCollapsed(true);
        const language = api.updater.UI.toggleLanguage();
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(pending.length, 1);
        if (outcomes[0]) { storage.set(pending[0].key, pending[0].value); pending[0].resolve(); }
        else pending[0].reject(new Error('synthetic first-write failure'));
        assert.equal(await collapse, outcomes[0]);
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(pending.length, 2);
        if (outcomes[1]) { storage.set(pending[1].key, pending[1].value); pending[1].resolve(); }
        else pending[1].reject(new Error('synthetic second-write failure'));
        assert.equal(await language, outcomes[1]);
        const durable = plain(storage.get(key));
        return { state: plain(runtime.state.settings), durable };
    };

    const firstFails = await runPair([false, true]);
    assert.equal(firstFails.state.collapsed, false);
    assert.equal(firstFails.state.language, 'en');
    assert.deepEqual(firstFails.durable, { language: 'en', collapsed: false });

    const secondFails = await runPair([true, false]);
    assert.equal(secondFails.state.collapsed, true);
    assert.equal(secondFails.state.language, 'tr');
    assert.deepEqual(secondFails.durable, { language: 'tr', collapsed: true });
});

test('preset UI rolls back optimistic save and delete state when persistence rejects', async () => {
    const exercise = async (operation) => {
        const { api, storage } = loadAnalyzer();
        const runtime = api.settingsRuntime;
        const UI = api.updater.UI;
        const key = api.actionRuntime.KEYS.filterPresets;
        const now = new Date().toISOString();
        const originalPreset = {
            id: 'preset-durable-rollback', name: 'Durable preset',
            filters: { recommendation: 'monitor', sort: 'priority' }, query: 'durable',
            createdAt: now, updatedAt: now,
        };
        storage.set(key, { schema: 1, items: [plain(originalPreset)] });
        await runtime.Store.loadFilterPresets();
        const durableBefore = plain(runtime.state.filterPresets);

        const body = new FakeElement();
        body.scrollTop = 0;
        body.innerHTML = '';
        const input = new FakeElement();
        input.value = 'Optimistic preset';
        const saveButton = new FakeElement();
        const deleteButton = new FakeElement();
        deleteButton.dataset = { deletePreset: originalPreset.id };
        let handler = null;
        saveButton.addEventListener = (type, callback) => { if (operation === 'save' && type === 'click') handler = callback; };
        deleteButton.addEventListener = (type, callback) => { if (operation === 'delete' && type === 'click') handler = callback; };
        const root = new FakeElement();
        root.querySelector = (selector) => ({
            '[data-table-body]': body,
            '[data-preset-name]': input,
            '[data-save-preset]': saveButton,
        }[selector] || null);
        root.querySelectorAll = (selector) => (selector === '[data-delete-preset]' ? [deleteButton] : []);

        const method = operation === 'save' ? 'upsertFilterPreset' : 'deleteFilterPreset';
        const originalMethod = runtime.Store[method];
        runtime.Store[method] = async () => { throw new Error('synthetic preset persistence rejection'); };
        try {
            UI.bindAnalysis(root);
            assert.equal(typeof handler, 'function');
            await handler();
            assert.deepEqual(plain(runtime.state.filterPresets), durableBefore);
        } finally {
            runtime.Store[method] = originalMethod;
        }
    };

    await exercise('save');
    await exercise('delete');
});

test('filter preset identity remains stable when the UI language changes', async () => {
    const { api, storage } = loadAnalyzer();
    const runtime = api.settingsRuntime;
    const key = api.actionRuntime.KEYS.filterPresets;
    const createdAt = '2026-08-31T12:00:00.000Z';
    const presets = [
        { id: 'preset-latin-i-plan', name: 'I plan', filters: { sort: 'priority' }, query: '', createdAt, updatedAt: createdAt },
        { id: 'preset-dotless-i-plan', name: 'ı plan', filters: { sort: 'score' }, query: '', createdAt, updatedAt: createdAt },
    ];
    storage.set(key, { schema: 1, items: plain(presets) });
    runtime.state.settings.language = 'tr';
    assert.equal((await runtime.Store.loadFilterPresets()).length, 2);
    assert.equal(await runtime.Store.upsertFilterPreset({
        id: 'preset-third-stable', name: 'Third plan', filters: { sort: 'visits' }, query: '',
        createdAt, updatedAt: '2026-08-31T12:01:00.000Z',
    }), true);
    assert.deepEqual(
        plain(storage.get(key).items).map((item) => item.id).sort(),
        ['preset-dotless-i-plan', 'preset-latin-i-plan', 'preset-third-stable'],
    );
    runtime.state.settings.language = 'en';
    assert.equal((await runtime.Store.loadFilterPresets()).length, 3);
});

test('display-only writes cannot overwrite thresholds changed by another tab', async () => {
    const { api, storage } = loadAnalyzer();
    const runtime = api.settingsRuntime;
    const keys = api.actionRuntime.KEYS;
    await runtime.Store.loadSettings();
    storage.set(keys.settings, {
        minVisitsToImprove: 44,
        minVisitsToProtect: 94,
        minRenewalsToReview: 6,
        declinePercent: 48,
        retentionDays: 400,
        maxSnapshots: 120,
    });
    runtime.state.settings.collapsed = true;
    assert.equal(await runtime.Store.saveUiPreferences(['collapsed']), true);
    const durableThresholds = storage.get(keys.settings);
    assert.deepEqual({
        minVisitsToImprove: durableThresholds.minVisitsToImprove,
        minVisitsToProtect: durableThresholds.minVisitsToProtect,
        minRenewalsToReview: durableThresholds.minRenewalsToReview,
        declinePercent: durableThresholds.declinePercent,
    }, {
        minVisitsToImprove: 44,
        minVisitsToProtect: 94,
        minRenewalsToReview: 6,
        declinePercent: 48,
    });
    assert.deepEqual(plain(storage.get(keys.uiPreferences)), { language: 'tr', collapsed: true });
});

test('storage size estimation is cached until a relevant state write marks it dirty', () => {
    const { api } = loadAnalyzer();
    const runtime = api.settingsRuntime;
    runtime.state.records = [{ listingId: 'storage-one', history: [] }];
    runtime.markStorageEstimateDirty();
    const first = runtime.refreshStorageEstimate().estimateBytes;
    assert.equal(runtime.state.storageHealth.dirty, false);
    runtime.state.records.push({ listingId: 'storage-two', history: [{ note: 'x'.repeat(500) }] });
    assert.equal(runtime.refreshStorageEstimate().estimateBytes, first);
    runtime.markStorageEstimateDirty();
    assert.ok(runtime.refreshStorageEstimate().estimateBytes > first);
});

test('cross-tab collection synchronization invalidates the storage estimate cache', async () => {
    const { api, storage } = loadAnalyzer();
    const runtime = api.settingsRuntime;
    const collectionRuntime = api.collectionRuntime;
    const now = '2026-08-31T12:00:00.000Z';
    runtime.state.collection = api.normalizeCollection({
        schema: api.versions.collectionSchema, id: 'collection-local-cache', status: 'paused',
        startedAt: now, updatedAt: now, totalPages: 1, pages: {}, uniqueIds: [],
    });
    runtime.markStorageEstimateDirty();
    runtime.refreshStorageEstimate();
    assert.equal(runtime.state.storageHealth.dirty, false);
    storage.set(collectionRuntime.KEYS.collection, api.normalizeCollection({
        schema: api.versions.collectionSchema, id: 'collection-remote-cache', status: 'paused',
        startedAt: now, updatedAt: '2026-08-31T12:01:00.000Z', totalPages: 1, pages: {}, uniqueIds: [],
    }));
    assert.equal(await api.syncCollectionState(), true);
    assert.equal(runtime.state.storageHealth.dirty, true);
});

test('panel focus survives a full render without stealing focus from outside the panel', () => {
    const { api, sandbox } = loadAnalyzer();
    const runtime = api.settingsRuntime;
    const active = new sandbox.HTMLElement();
    active.attributes = [{ name: 'data-analysis-search', value: '' }];
    active.selectionStart = 3;
    active.selectionEnd = 6;
    runtime.state.shadow = { activeElement: active };
    runtime.state.panel = {
        contains: (element) => element === active,
        querySelectorAll: () => [active],
    };
    const snapshot = runtime.capturePanelFocus();
    assert.deepEqual(plain(snapshot), { selector: '[data-analysis-search]', index: 0, selectionStart: 3, selectionEnd: 6 });

    const replacement = new sandbox.HTMLElement();
    let focused = false;
    let selection = null;
    replacement.focus = () => { focused = true; };
    replacement.setSelectionRange = (start, end) => { selection = [start, end]; };
    runtime.state.panel.querySelectorAll = () => [replacement];
    runtime.restorePanelFocus(snapshot);
    assert.equal(focused, true);
    assert.deepEqual(selection, [3, 6]);

    runtime.state.shadow.activeElement = new sandbox.HTMLElement();
    assert.equal(runtime.capturePanelFocus(), null);
});

test('standalone telemetry dialog traps focus and restores it on Escape and backdrop close', async () => {
    const { api, sandbox } = loadAnalyzer();
    const runtime = api.settingsRuntime;
    const returnFocus = new sandbox.HTMLElement();
    returnFocus.isConnected = true;
    let returned = 0;
    returnFocus.focus = () => { returned += 1; sandbox.document.activeElement = returnFocus; };
    sandbox.document.activeElement = returnFocus;
    runtime.state.shadow = null;

    const buildOverlay = () => {
        const listeners = new Map();
        const first = new sandbox.HTMLElement();
        const close = new sandbox.HTMLElement();
        first.focus = () => { sandbox.document.activeElement = first; };
        close.focus = () => { sandbox.document.activeElement = close; };
        const overlay = {
            removed: false,
            addEventListener: (type, listener) => listeners.set(type, listener),
            querySelectorAll: () => [first, close],
            querySelector: (selector) => selector === '[data-close]' ? close : first,
            remove() { this.removed = true; },
        };
        return { overlay, listeners, first, close };
    };

    const escapeDialog = buildOverlay();
    runtime.installStandaloneDialogBehavior(escapeDialog.overlay);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(sandbox.document.activeElement, escapeDialog.close);
    let tabPrevented = false;
    escapeDialog.listeners.get('keydown')({ key: 'Tab', shiftKey: false, preventDefault: () => { tabPrevented = true; } });
    assert.equal(tabPrevented, true);
    assert.equal(sandbox.document.activeElement, escapeDialog.first);
    escapeDialog.listeners.get('keydown')({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
    assert.equal(escapeDialog.overlay.removed, true);
    assert.equal(sandbox.document.activeElement, returnFocus);

    const backdropDialog = buildOverlay();
    runtime.installStandaloneDialogBehavior(backdropDialog.overlay);
    backdropDialog.listeners.get('click')({ target: backdropDialog.overlay });
    assert.equal(backdropDialog.overlay.removed, true);
    assert.equal(returned, 2);
});

test('threshold validation distinguishes range input from storage errors', () => {
    const { api } = loadAnalyzer();
    const validate = api.settingsRuntime.validateThresholdSettings;
    assert.deepEqual(plain(validate({ minVisitsToImprove: 20, minVisitsToProtect: 60, minRenewalsToReview: 4, declinePercent: 35 })), { valid: true, reason: '', field: '' });
    const fractional = plain(validate({ minVisitsToImprove: 1.5, minVisitsToProtect: 60, minRenewalsToReview: 4, declinePercent: 35 }));
    assert.equal(fractional.reason, 'range');
    assert.equal(fractional.field, 'minVisitsToImprove');
    assert.equal(fractional.min, 1);
    const relationship = plain(validate({ minVisitsToImprove: 60, minVisitsToProtect: 60, minRenewalsToReview: 4, declinePercent: 35 }));
    assert.deepEqual(relationship, { valid: false, reason: 'relationship', field: 'minVisitsToProtect' });
});

test('UI contracts keep the panel responsive and expose progress and localized telemetry', () => {
    const { api } = loadAnalyzer();
    const source = fs.readFileSync(scriptPath, 'utf8');
    assert.match(source, /width:min\(620px,calc\(100vw - 24px\)\)/);
    assert.match(source, /\.meli-panel\.is-wide\{width:min\(1120px,calc\(100vw - 24px\)\)/);
    assert.match(source, /@media\(max-width:480px\).*?\.meli-panel,\.meli-panel\.is-wide\{[^}]*width:auto/s);
    assert.match(api.updater.UI.collectionCard(), /role="progressbar"[^>]*aria-valuemin="0"[^>]*aria-valuemax="100"[^>]*aria-valuenow="0"/);
    api.settingsRuntime.state.settings.language = 'tr';
    assert.equal(api.translate('telemetryMenu'), 'Kullanım ölçümleri ayarları');
    api.settingsRuntime.state.settings.language = 'en';
    assert.equal(api.translate('telemetryMenu'), 'Usage metrics settings');
    assert.match(source, /data-setting="\$\{key\}"[^>]*aria-invalid="false"/);
    assert.match(source, /input\.setAttribute\('aria-invalid', 'true'\)/);
});

test('history chart markup reports missing and prior-currency exclusions explicitly', () => {
    const { api } = loadAnalyzer();
    api.settingsRuntime.state.settings.language = 'en';
    const missingMarkup = api.updater.UI.historyChart([
        snapshot('2026-08-01T12:00:00.000Z', { visits: 0 }),
        snapshot('2026-08-02T12:00:00.000Z', { visits: '   ' }),
        snapshot('2026-08-03T12:00:00.000Z', { visits: 2 }),
    ], 'visits', 'Visits');
    assert.match(missingMarkup, /1 missing or unreadable observation\(s\) excluded from the chart\./);

    const currencyMarkup = api.updater.UI.historyChart([
        snapshot('2026-08-01T12:00:00.000Z', { revenue: 100, currency: '$' }),
        snapshot('2026-08-02T12:00:00.000Z', { revenue: 110, currency: '$' }),
        snapshot('2026-08-03T12:00:00.000Z', { revenue: 120, currency: '€' }),
        snapshot('2026-08-04T12:00:00.000Z', { revenue: 130, currency: '€' }),
    ], 'revenue', 'Revenue', '€');
    assert.match(currencyMarkup, /2 prior observation\(s\) excluded because their currency differs from the current record\./);
});
