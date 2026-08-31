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
        const metricContainer = listingFixtureElement('div', { class: 'card-meta' }, '', [
            listingFixtureElement('h6', {}, defaults.metricHeading),
        ]);
        for (let metricIndex = 0; metricIndex < defaults.metricRows.length; metricIndex += 2) {
            const row = listingFixtureElement('div', { class: 'card-meta-row' });
            defaults.metricRows.slice(metricIndex, metricIndex + 2).forEach((metricText) => {
                row.append(listingFixtureElement('div', { class: 'card-meta-row-item text-gray-lighter selected-color' }, metricText));
            });
            metricContainer.append(row);
        }
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
            metricContainer,
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
        ...overrides,
    };
}

function record(id, history, meta = {}) {
    return {
        schema: 1,
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
    const originals = { pageInfo: adapter.pageInfo, paginationNav: adapter.paginationNav, cardLinks: adapter.cardLinks, scan: adapter.scan };
    const listing = (id) => ({ listingId: String(id), title: `L${id}`, sku: '', listingState: 'active', statusLabel: 'Active', renewalLabel: 'Auto-renews', stock: 1, price: { min: 10, max: 10 }, visits: 1, favorites: 0, sales: 0, revenue: 0, renewals: 0 });
    adapter.pageInfo = () => ({ current: 2, total: 17, valid: true, hasPagination: true, ambiguous: false });
    adapter.cardLinks = () => Array.from({ length: 39 }, () => ({}));
    adapter.scan = () => Array.from({ length: 39 }, (_, index) => listing(index + 1));
    assert.equal(adapter.snapshotState({ requirePagination: true }).valid, false);
    adapter.cardLinks = () => Array.from({ length: 40 }, () => ({}));
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
});

test('sanitized current Etsy fixture parses 40 canonical inactive listings and preserves every explicit zero metric', () => {
    const { api, sandbox } = loadAnalyzer();
    const fixture = JSON.parse(fs.readFileSync(sanitizedListingsFixturePath, 'utf8'));
    assert.equal(fixture.schema, 'makaytron-etsy-listing-dom-fixture/v1');
    assert.equal(fixture.cards.length, 40);
    assert.ok(fixture.cards.every((card) => /^Synthetic Fixture Listing \d{2}$/.test(card.title)));
    assert.deepEqual(fixture.defaults.metricRows, ['0 visits', '0 favorite', '0 sales', '$0 revenue', '0 renewal']);

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
    const originals = { paginationNav: adapter.paginationNav, cardLinks: adapter.cardLinks, scan: adapter.scan };
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
    adapter.cardLinks = () => Array.from({ length: 40 }, () => ({}));
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
        adapter.cardLinks = () => Array.from({ length: 13 }, () => ({}));
        adapter.scan = () => Array.from({ length: 13 }, (_, index) => ({ listingId: String(index + 1) }));
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

test('integrity anomalies cannot be labeled as growing or stable', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const broken = record('301', [
        snapshot('2026-07-02T12:00:00.000Z'),
        snapshot(evaluatedAt, { visits: 0, favorites: 5 }),
    ]);
    const result = api.evaluateRecord(broken, [broken], undefined, evaluatedAt).result;
    assert.equal(result.lifecycle, 'DATA_GAP');
    assert.equal(result.diagnosis, 'INSUFFICIENT_SIGNAL');
    assert.ok(result.anomalies.includes('favorites-without-visits'));

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
    assert.equal(staleResult.diagnosis, 'INSUFFICIENT_SIGNAL');
    assert.ok(staleResult.confidence <= 39);
    assert.ok(staleResult.confidenceCaps.includes('data-integrity'));
    assert.equal(staleResult.assessmentMode, 'insufficient');
    assert.equal(staleResult.score, null);
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
        record('bootstrap-anomaly', [snapshot(evaluatedAt, { visits: 0, favorites: 1, renewals: 4 })]),
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
    assert.match(markup, /Geçmiş güveni: Düşük/);
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

test('cohort benchmark excludes stale peers and reports price-band fallback honestly', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const target = record('500', [
        snapshot('2026-07-02T12:00:00.000Z', { visits: 10, priceMin: 100, priceMax: 100 }),
        snapshot(evaluatedAt, { visits: 20, priceMin: 100, priceMax: 100 }),
    ]);
    const peers = Array.from({ length: 7 }, (_, index) => record(String(501 + index), [
        snapshot('2026-07-02T12:00:00.000Z', { visits: 10, priceMin: 10, priceMax: 10 }),
        snapshot(evaluatedAt, { visits: 20, priceMin: 10, priceMax: 10 }),
    ]));
    const fallback = api.evaluateRecord(target, [target, ...peers], undefined, evaluatedAt).result.benchmark;
    assert.equal(fallback.scope, 'shop');
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
    assert.equal(withoutStale.size, 1);
});

test('an eight-listing cohort is usable without claiming full statistical strength', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const peers = Array.from({ length: 8 }, (_, index) => record(`cohort-strength-${index}`, [
        snapshot(evaluatedAt, { visits: 30 + index, favorites: 1 }),
    ]));
    const result = api.evaluateRecord(peers[0], peers, undefined, evaluatedAt).result;
    assert.equal(result.benchmark.reliable, true);
    assert.equal(result.confidenceComponents.cohortStrength, 27);
    assert.ok(result.confidenceComponents.cohortStrength < 100);
});

test('cohort favorite percentiles smooth low-traffic outliers', () => {
    const { api } = loadAnalyzer();
    const evaluatedAt = '2026-08-01T12:00:00.000Z';
    const lowTraffic = record('cohort-low-traffic', [snapshot(evaluatedAt, { visits: 1, favorites: 1 })]);
    const stableTraffic = record('cohort-stable-traffic', [snapshot(evaluatedAt, { visits: 100, favorites: 10 })]);
    const fillers = Array.from({ length: 6 }, (_, index) => record(`cohort-filler-${index}`, [
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
    const peers = Array.from({ length: 7 }, (_, index) => record(String(601 + index), [
        snapshot(evaluatedAt, { visits: 500, favorites: 25 }),
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
    const scoped = Array.from({ length: 8 }, (_, index) => record(String(650 + index), [
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
    candidate.health = {
        schemaVersion: api.versions.healthSchema,
        engineVersion: 2,
        policy: { version: 1, fingerprint: 'old-policy', thresholds: {} },
        input: { latestAt: evaluatedAt, anchor30At: null, anchor60At: null, observedMetrics: [] },
        result: { lifecycle: 'BASELINE', diagnosis: 'INSUFFICIENT_SIGNAL', code: 'waiting', confidence: 39 },
    };
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
    const collection = { pages: { 1: { contentSignature: api.ListingPageAdapter.contentSignature(first), ids: first.map((item) => item.listingId), count: 40 } }, uniqueIds: first.map((item) => item.listingId) };
    collection.pages[1].signature = api.ListingPageAdapter.pageSignature(first, 1);
    assert.equal(api.collectionPageMatchesManifest(collection, { pageInfo: { current: 1 }, listings: ids(21, 40) }), false);
    assert.equal(api.collectionPageMatchesManifest(collection, { pageInfo: { current: 1 }, listings: [...first].reverse() }), true);
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

    const current = api.normalizeCollection({ schema: api.versions.collectionSchema, id: 'new', status: 'completed', scopeKey: '/scope', completedAt: now, totalPages: 1, pages: { 1: { signature: '1|1|1', contentSignature: '1', ids: ['1'], count: 1, capturedAt: now } }, uniqueIds: ['1'] });
    assert.equal(api.collectionIsFresh(current, Date.now(), { scopeKey: '/scope', totalPages: 1 }), true);
    assert.deepEqual(Array.from(api.evaluationScopeRecords([record('1', []), record('2', [])], ['2']), (item) => item.listingId), ['2']);

    const firstIds = Array.from({ length: 40 }, (_, index) => String(index + 1));
    const lastIds = ['40', '41'];
    const firstContent = [...firstIds].sort().join('\u001f');
    const lastContent = [...lastIds].sort().join('\u001f');
    const malformed = api.normalizeCollection({
        schema: api.versions.collectionSchema,
        id: 'overlap',
        status: 'completed',
        scopeKey: '/scope',
        completedAt: now,
        totalPages: 2,
        pages: {
            1: { signature: `1|40|${firstContent}`, contentSignature: firstContent, ids: firstIds, count: 40, capturedAt: now },
            2: { signature: `2|2|${lastContent}`, contentSignature: lastContent, ids: lastIds, count: 2, capturedAt: now },
        },
        uniqueIds: [...firstIds, '41'],
        duplicateCount: 0,
    });
    assert.equal(api.collectionManifestIsComplete(malformed), false);
    assert.equal(api.collectionIsFresh(malformed, Date.now(), { scopeKey: '/scope', totalPages: 2 }), false);
});

test('percentile ranks stay within the documented 0-100 range', () => {
    const { api } = loadAnalyzer();
    assert.equal(api.percentileRank([1, 2], 100), 100);
    assert.equal(api.percentileRank([1, 2], -100), 0);
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

test('failed threshold persistence restores the complete runtime settings bundle', async () => {
    const { api } = loadAnalyzer();
    const runtime = api.settingsRuntime;
    const originalSaveSettings = runtime.Store.saveSettings;
    const before = plain(runtime.state.settings);
    runtime.Store.saveSettings = async () => false;
    try {
        assert.equal(await runtime.persistThresholdSettings({
            minVisitsToImprove: 99,
            minVisitsToProtect: 199,
            minRenewalsToReview: 9,
            declinePercent: 55,
        }), false);
        assert.deepEqual(plain(runtime.state.settings), before);
    } finally {
        runtime.Store.saveSettings = originalSaveSettings;
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

test('backup import sanitizes non-Etsy URLs, skips its queue, and preserves local display settings', async () => {
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
    assert.equal(normalized.records[0].meta.editUrl, '');
    assert.equal(normalized.records[0].meta.publicUrl, '');
    assert.equal(normalized.records[0].meta.imageUrl, '');
    assert.equal(normalized.settings.minVisitsToImprove, 41);

    const imported = await api.backupRuntime.importBackupDocument(rawBackup);
    assert.deepEqual(plain(imported), { records: 1, presets: 1, queueSkipped: true });
    const importedRecord = await runtime.Store.getRecord(listingId);
    assert.equal(importedRecord.meta.title, 'Synthetic Backup Round Trip');
    assert.equal(importedRecord.meta.editUrl, '');
    assert.equal(importedRecord.meta.publicUrl, '');
    assert.equal(importedRecord.meta.imageUrl, '');
    assert.equal(runtime.state.settings.language, 'en');
    assert.equal(runtime.state.settings.collapsed, true);
    assert.equal(runtime.state.settings.minVisitsToImprove, 41);
    assert.equal(storage.get(runtime.KEYS.settings).language, 'en');
    assert.equal(storage.get(runtime.KEYS.settings).collapsed, true);
    assert.equal(storage.get(runtime.KEYS.analysisFilters).performance, 'no-activity');
    assert.equal(storage.get(runtime.KEYS.filterPresets).items[0].name, 'Synthetic review');
    assert.deepEqual(plain(storage.get(runtime.KEYS.queue)), existingQueue);
    assert.equal(storage.get(runtime.KEYS.audit).at(-1).type, 'backup-imported');
    assert.equal(storage.get(runtime.KEYS.audit).at(-1).queueSkipped, true);
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
    const originalQuerySelector = sandbox.document.querySelector;
    sandbox.document.querySelector = (selector) => ({
        '#listing-title-input': title,
        '#listing-description-textarea': description,
        '#field-tags': field,
        '#listing-tags-input': input,
        '#listing-tags-button': addButton,
    })[selector] || null;
    try {
        const changed = await api.actionRuntime.EditorAdapter.applyProposal({ action: 'UPDATE', fields: ['tags'], tags: ['new tag'] });
        assert.deepEqual(Array.from(changed), ['tags']);
        assert.deepEqual(pills, ['new tag']);
    } finally {
        sandbox.document.querySelector = originalQuerySelector;
    }
});

test('editor apply restores earlier field changes when a later pill control fails', async () => {
    const { api, sandbox } = loadAnalyzer();
    const adapter = api.actionRuntime.EditorAdapter;
    const title = new sandbox.HTMLInputElement(); title.value = 'Original title'; title.disabled = false;
    const description = new sandbox.HTMLTextAreaElement(); description.value = 'Original description'; description.disabled = false;
    const tagField = { querySelectorAll: () => [] };
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
    assert.equal(failure.editorRestored, true);
    assert.deepEqual(Array.from(failure.changedFields), ['title']);
    assert.equal(title.value, 'Original title');
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

    const winner = make('904', 40, 60, [improvement('win')]);
    api.updateExperimentEvaluations(winner, evaluateAt);
    assert.equal(winner.improvements[0].experiment.state, 'winner');
    assert.equal(winner.improvements[0].experiment.effectPercent, 50);

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

test('sales experiments normalize exposure days and reject a stale publication baseline', () => {
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
    api.updateExperimentEvaluations(delayed, '2026-02-07T00:00:00.000Z');
    const normalized = delayed.improvements[0].experiment;
    assert.equal(normalized.current.rawSales, 2);
    assert.equal(normalized.current.exposureDays, 37);
    assert.equal(normalized.current.sales, 1.622);
    assert.equal(normalized.evaluationDelayDays, 7);
    assert.equal(normalized.current.rateRatioInterval.afterEvents, 2);
    assert.equal(normalized.current.rateRatioInterval.afterExposure, normalized.current.effectiveVisitExposure);
    assert.equal(Math.round(normalized.current.effectiveVisitExposure * 1000) / 1000, 123.333);

    const stale = record('sales-stale-baseline', [
        snapshot('2025-12-02T00:00:00.000Z', { visits: 100, sales: 0 }),
        snapshot('2025-12-29T00:00:00.000Z', { visits: 100, sales: 2 }),
        snapshot('2026-01-31T00:00:00.000Z', { visits: 100, sales: 4 }),
    ]);
    stale.improvements.push({
        id: 'stale-baseline', action: 'UPDATE', status: 'published', publishedAt: '2026-01-01T00:00:00.000Z', fields: ['description'],
        baselineSnapshot: snapshot('2025-12-29T00:00:00.000Z', { visits: 100, sales: 2 }),
    });
    api.updateExperimentEvaluations(stale, '2026-02-01T00:00:00.000Z');
    assert.equal(stale.improvements[0].experiment.state, 'inconclusive');
    assert.equal(stale.improvements[0].experiment.current, undefined);
});

test('stale skip cannot resurrect or overwrite a newer stored queue', async () => {
    const { api, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const stale = {
        schema: 1, id: 'queue-old', status: 'ready', cursor: 0,
        items: [
            { listingId: 'old-1', status: 'pending', editUrl: 'https://www.etsy.com/your/shops/me/listing-editor/edit/old-1' },
            { listingId: 'old-2', status: 'pending', editUrl: 'https://www.etsy.com/your/shops/me/listing-editor/edit/old-2' },
        ],
    };
    const newer = {
        schema: 1, id: 'queue-new', status: 'completed', cursor: 1,
        items: [{ listingId: 'new-1', status: 'verified', editUrl: 'https://www.etsy.com/your/shops/me/listing-editor/edit/new-1' }],
    };
    runtime.state.queue = plain(stale);
    storage.set(runtime.KEYS.queue, plain(newer));
    await runtime.skipCurrentItem();
    assert.deepEqual(plain(storage.get(runtime.KEYS.queue)), newer);
    assert.deepEqual(plain(runtime.state.queue), newer);
    assert.equal(storage.has(runtime.KEYS.audit), false);
    assert.equal(storage.has(runtime.KEYS.lease), false);
});

test('concurrent skip clicks commit one fenced transition and one audit entry', async () => {
    const { api, storage } = loadAnalyzer();
    const runtime = api.actionRuntime;
    const queue = {
        schema: 1, id: 'queue-double', status: 'ready', cursor: 0,
        items: [
            { listingId: 'double-1', status: 'pending', editUrl: 'https://www.etsy.com/your/shops/me/listing-editor/edit/double-1' },
            { listingId: 'double-2', status: 'pending', editUrl: 'https://www.etsy.com/your/shops/me/listing-editor/edit/double-2' },
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
    const recovery = runtime.automaticDeactivationRecovery(item, now);
    assert.equal(recovery.editUrl, 'https://www.etsy.com/your/shops/me/listing-editor/edit/4309502756');
    assert.equal(runtime.automaticDeactivationRecovery({ ...item, status: 'awaiting-user-deactivation' }, now), null);
    assert.equal(runtime.automaticDeactivationRecovery({ ...item, deactivationAttemptId: '' }, now), null);
    assert.equal(runtime.automaticDeactivationRecovery({ ...item, deactivationStatusBefore: [] }, now), null);
    assert.equal(runtime.automaticDeactivationRecovery({ ...item, deactivationSubmittedIntentAt: '2026-08-31T15:55:00.000Z' }, now), null);
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
    runtime.state.queue = plain(queue);
    storage.set(runtime.KEYS.queue, plain(queue));
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
        assert.deepEqual(plain(storage.get(runtime.KEYS.queue)), queue);
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
    runtime.state.queue = plain(queue);
    storage.set(runtime.KEYS.queue, plain(queue));
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

test('a legacy manual deactivation wait can enter the automatic flow only while still visibly Active', async () => {
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
        assert.equal(finalClicks, 1);
        assert.equal(saved.cursor, 1);
        assert.equal(saved.status, 'completed');
        assert.equal(saved.items[0].status, 'verified-deactivated');
        assert.deepEqual(saved.items[0].deactivationStatusBefore, ['Active']);
        assert.deepEqual(saved.items[0].deactivationStatusAfter, ['Inactive']);
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
    runtime.state.queue = plain(queue);
    storage.set(runtime.KEYS.queue, plain(queue));
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
    runtime.state.queue = plain(queue);
    storage.set(runtime.KEYS.queue, plain(queue));
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

test('concurrent deactivation verification advances exactly one queue item', async () => {
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
