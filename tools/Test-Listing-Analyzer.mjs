import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(repoRoot, 'scripts/etsy-listing-analyzer/Makaytron-Etsy-Listing-Analyzer.user.js');

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
            href: 'https://www.etsy.com/unsupported',
            hostname: 'www.etsy.com',
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
