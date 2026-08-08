import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const keywordRelativePath = 'scripts/etsy-keyword-market-analyzer/Makaytron-Etsy-Keyword-Market-Analyzer.user.js';
const listingRelativePath = 'scripts/etsy-listing-analyzer/Makaytron-Etsy-Listing-Analyzer.user.js';
const rawRepositoryUrl = 'https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools';
const apiRefUrl = 'https://api.github.com/repos/Makaytron/Etsy-Automation-Tools/commits/main';
const trustedNamespace = 'https://github.com/Makaytron/EtsyScript';
const commitSha = 'a'.repeat(40);

function nextPatch(version) {
    const parts = String(version).split('.').map(Number);
    assert.equal(parts.length, 3);
    assert.ok(parts.every(Number.isInteger));
    return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

function fixtureSource({ name, relativePath, version }) {
    const canonicalUrl = `${rawRepositoryUrl}/main/${relativePath}`;
    return [
        '// ==UserScript==',
        `// @name         ${name}`,
        `// @version      ${version}`,
        `// @namespace    ${trustedNamespace}`,
        `// @updateURL    ${canonicalUrl}`,
        `// @downloadURL  ${canonicalUrl}`,
        '// ==/UserScript==',
        '',
        '(function () {})();',
        '',
    ].join('\n');
}

class FakeElement {
    constructor(openedUrls) {
        this.openedUrls = openedUrls;
        this.listeners = new Map();
        this.href = '';
        this.hidden = false;
        this.disabled = false;
        this.textContent = '';
        this.style = {};
    }

    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }
    appendChild() {}
    remove() {}
    setAttribute() {}
    getAttribute() { return null; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    closest() { return null; }
    focus() {}
    click() {
        if (this.href) this.openedUrls.push(this.href);
        for (const listener of this.listeners.get('click') ?? []) listener({ currentTarget: this, target: this });
    }

    async trigger(type) {
        for (const listener of this.listeners.get(type) ?? []) {
            await listener({ currentTarget: this, target: this });
        }
    }
}

function createSandbox({ canonicalUrl, routes, listing = false }) {
    const storage = new Map();
    const openedUrls = [];
    const noop = () => {};
    const documentElement = new FakeElement(openedUrls);
    const document = {
        documentElement,
        body: new FakeElement(openedUrls),
        head: new FakeElement(openedUrls),
        createElement: () => new FakeElement(openedUrls),
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: noop,
        removeEventListener: noop,
    };
    const xmlHttpRequest = (request) => {
        const route = routes.get(request.url);
        queueMicrotask(() => {
            if (!route) {
                request.onerror?.();
                return;
            }
            request.onload?.({
                status: route.status ?? 200,
                finalUrl: route.finalUrl ?? request.url,
                responseText: route.body ?? '',
            });
        });
    };
    const gmInfo = {
        script: { updateURL: canonicalUrl, downloadURL: canonicalUrl },
        scriptUpdateURL: canonicalUrl,
        scriptDownloadURL: canonicalUrl,
    };
    const GM = {
        info: gmInfo,
        getValue: async (key, fallback) => storage.has(key) ? storage.get(key) : fallback,
        setValue: async (key, value) => { storage.set(key, value); },
        deleteValue: async (key) => storage.delete(key),
        addValueChangeListener: noop,
        xmlHttpRequest,
        openInTab: (url) => { openedUrls.push(url); return null; },
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
        MutationObserver: class { observe() {} disconnect() {} },
        BroadcastChannel: undefined,
        GM,
        GM_info: listing ? gmInfo : null,
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
        __EKMA_SKIP_INIT__: !listing,
        __MAKAYTRON_LISTING_TEST__: listing,
        __MAKAYTRON_LISTING_SKIP_INIT__: listing,
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    const context = vm.createContext(sandbox);
    return { sandbox, context, storage, openedUrls };
}

function toRealm(environment, value) {
    return vm.runInContext(`(${JSON.stringify(value)})`, environment.context);
}

function updaterRoutes({
    relativePath,
    productName,
    version,
    finalUrl,
    sourceOverride,
    apiFinalUrl,
    apiBody,
    apiStatus,
}) {
    const canonicalUrl = `${rawRepositoryUrl}/main/${relativePath}`;
    const pinnedUrl = `${rawRepositoryUrl}/${commitSha}/${relativePath}`;
    return {
        canonicalUrl,
        pinnedUrl,
        routes: new Map([
            [apiRefUrl, {
                status: apiStatus,
                finalUrl: apiFinalUrl,
                body: apiBody ?? JSON.stringify({ sha: commitSha }),
            }],
            [pinnedUrl, {
                finalUrl: finalUrl ?? pinnedUrl,
                body: sourceOverride ?? fixtureSource({ name: productName, relativePath, version }),
            }],
        ]),
    };
}

function loadKeyword(options = {}) {
    const source = fs.readFileSync(path.join(repoRoot, keywordRelativePath), 'utf8');
    const metadataVersion = source.match(/^\/\/ @version\s+(\d+\.\d+\.\d+)\s*$/m)?.[1];
    assert.ok(metadataVersion);
    const version = options.version ?? nextPatch(metadataVersion);
    const routeSet = updaterRoutes({
        relativePath: keywordRelativePath,
        productName: 'Makaytron Etsy Keyword & Market Analyzer',
        version,
        finalUrl: options.finalUrl,
        sourceOverride: options.sourceOverride,
        apiFinalUrl: options.apiFinalUrl,
        apiBody: options.apiBody,
        apiStatus: options.apiStatus,
    });
    const environment = createSandbox({ canonicalUrl: routeSet.canonicalUrl, routes: routeSet.routes });
    vm.runInContext(source, environment.context, { filename: keywordRelativePath });
    const api = environment.sandbox.__EKMA_TEST__;
    assert.ok(api);
    api.UI.status = () => {};
    api.Runtime.ui = {
        version: new FakeElement(environment.openedUrls),
        updateBanner: new FakeElement(environment.openedUrls),
        installUpdate: new FakeElement(environment.openedUrls),
        checkUpdate: new FakeElement(environment.openedUrls),
        source: new FakeElement(environment.openedUrls),
    };
    return { ...environment, api, metadataVersion, remoteVersion: version, pinnedUrl: routeSet.pinnedUrl };
}

function loadListing(options = {}) {
    const source = fs.readFileSync(path.join(repoRoot, listingRelativePath), 'utf8');
    const metadataVersion = source.match(/^\/\/ @version\s+(\d+\.\d+\.\d+)\s*$/m)?.[1];
    assert.ok(metadataVersion);
    const version = options.version ?? nextPatch(metadataVersion);
    const routeSet = updaterRoutes({
        relativePath: listingRelativePath,
        productName: 'Makaytron Etsy Listing Analyzer',
        version,
        finalUrl: options.finalUrl,
        sourceOverride: options.sourceOverride,
        apiFinalUrl: options.apiFinalUrl,
        apiBody: options.apiBody,
        apiStatus: options.apiStatus,
    });
    const environment = createSandbox({ canonicalUrl: routeSet.canonicalUrl, routes: routeSet.routes, listing: true });
    vm.runInContext(source, environment.context, { filename: listingRelativePath });
    const rootApi = environment.sandbox.__MELI_TEST__;
    assert.ok(rootApi?.updater);
    const api = rootApi.updater;
    const statuses = [];
    api.UI.setStatus = (key) => { statuses.push(key); };
    api.UI.render = () => {};
    api.Queue.activeItem = () => null;
    return { ...environment, api, rootApi, statuses, metadataVersion, remoteVersion: version, pinnedUrl: routeSet.pinnedUrl };
}

test('Keyword Analyzer warns for a newer version and opens only the verified commit-pinned script', async () => {
    const environment = loadKeyword();
    const state = await environment.api.checkForUpdates({ manual: true, force: true });
    assert.equal(state.status, 'available');
    assert.equal(state.latestVersion, environment.remoteVersion);
    assert.equal(state.commitSha, commitSha);
    assert.equal(state.installUrl, environment.pinnedUrl);
    assert.equal(environment.api.Runtime.ui.updateBanner.hidden, false);
    assert.match(environment.api.Runtime.ui.updateBanner.textContent, new RegExp(environment.remoteVersion.replaceAll('.', '\\.')));
    assert.equal(environment.api.Runtime.ui.installUpdate.hidden, false);
    assert.equal(environment.api.bindInstallUpdate(environment.api.Runtime.ui.installUpdate), true);
    await environment.api.Runtime.ui.installUpdate.trigger('click');
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(environment.openedUrls, [environment.pinnedUrl]);
});

test('Keyword Analyzer blocks update while research is active and rejects a tampered install identity', async () => {
    const environment = loadKeyword();
    const state = await environment.api.checkForUpdates({ manual: true, force: true });
    await environment.api.Store.set(environment.api.KEYS.queue, toRealm(environment, [{
        requestId: 'test-request-001',
        nonce: 'test_nonce_00000001',
        status: 'running',
        deadlineAt: Date.now() + 60_000,
    }]));
    assert.deepEqual(
        Array.from(await environment.api.Store.queue(), (item) => item.status),
        ['running'],
    );
    assert.equal(await environment.api.openUpdatePage(), false);
    assert.deepEqual(environment.openedUrls, []);
    await environment.api.Store.set(environment.api.KEYS.queue, []);
    await environment.api.Store.set(environment.api.KEYS.update, { ...state, installUrl: `${state.installUrl}?changed=1` });
    assert.equal(await environment.api.openUpdatePage(), false);
    assert.deepEqual(environment.openedUrls, []);
});

test('Keyword Analyzer treats the current version as current without an update warning', async () => {
    const first = loadKeyword();
    const environment = loadKeyword({ version: first.metadataVersion });
    const state = await environment.api.checkForUpdates({ manual: true, force: true });
    assert.equal(state.status, 'current');
    assert.equal(environment.api.Runtime.ui.updateBanner.hidden, true);
    assert.equal(environment.api.Runtime.ui.installUpdate.hidden, true);
});

test('Keyword Analyzer rejects redirect drift and a different userscript at the pinned URL', async () => {
    const redirected = loadKeyword({ finalUrl: `${rawRepositoryUrl}/${commitSha}/${keywordRelativePath}?mirror=1` });
    assert.equal((await redirected.api.checkForUpdates({ manual: true, force: true })).status, 'error');
    assert.deepEqual(redirected.openedUrls, []);

    const wrongSource = fixtureSource({
        name: 'Makaytron Etsy Listing Analyzer',
        relativePath: keywordRelativePath,
        version: nextPatch(redirected.metadataVersion),
    });
    const wrongProduct = loadKeyword({ sourceOverride: wrongSource });
    assert.equal((await wrongProduct.api.checkForUpdates({ manual: true, force: true })).status, 'error');
    assert.deepEqual(wrongProduct.openedUrls, []);
});

test('Listing Analyzer warns for a newer version and opens only the verified commit-pinned script', async () => {
    const environment = loadListing();
    const state = await environment.api.checkForUpdates({ manual: true, force: true });
    assert.equal(state.status, 'available');
    assert.equal(state.latestVersion, environment.remoteVersion);
    assert.equal(state.commitSha, commitSha);
    assert.equal(state.installUrl, environment.pinnedUrl);
    assert.match(environment.api.UI.updateBanner(), /data-update-banner/);
    assert.match(environment.api.UI.updateBanner(), new RegExp(environment.remoteVersion.replaceAll('.', '\\.')));
    const installButton = new FakeElement(environment.openedUrls);
    assert.equal(environment.api.bindInstallUpdate(installButton), true);
    await installButton.trigger('click');
    assert.deepEqual(environment.openedUrls, [environment.pinnedUrl]);
});

test('Listing Analyzer blocks update during active work and rejects a tampered install identity', async () => {
    const environment = loadListing();
    const state = await environment.api.checkForUpdates({ manual: true, force: true });
    environment.api.state.collection = { status: 'running' };
    assert.equal(environment.api.openTampermonkeyUpdate(), false);
    assert.deepEqual(environment.openedUrls, []);
    environment.api.state.collection = null;
    environment.api.Queue.activeItem = () => ({ id: 'active-queue-item' });
    assert.equal(environment.api.openTampermonkeyUpdate(), false);
    assert.deepEqual(environment.openedUrls, []);
    environment.api.Queue.activeItem = () => null;
    environment.api.state.updateState = { ...state, installUrl: `${state.installUrl}?changed=1` };
    assert.equal(environment.api.openTampermonkeyUpdate(), false);
    assert.deepEqual(environment.openedUrls, []);
});

test('Listing Analyzer treats the current version as current without an update banner', async () => {
    const first = loadListing();
    const environment = loadListing({ version: first.metadataVersion });
    const state = await environment.api.checkForUpdates({ manual: true, force: true });
    assert.equal(state.status, 'current');
    assert.equal(environment.api.UI.updateBanner(), '');
    assert.equal(state.commitSha, commitSha);
    assert.equal(state.installUrl, environment.pinnedUrl);
    assert.ok(environment.statuses.includes('updateCurrent'));
    assert.ok(!environment.statuses.includes('updateAvailable'));
    assert.deepEqual(environment.openedUrls, []);
});

test('Both analyzers reject GitHub API redirect, HTTP, JSON, and commit identity drift', async () => {
    for (const load of [loadKeyword, loadListing]) {
        for (const options of [
            { apiFinalUrl: `${apiRefUrl}?drift=1` },
            { apiStatus: 503 },
            { apiBody: '{not-json' },
            { apiBody: JSON.stringify({ sha: 'not-a-commit-sha' }) },
        ]) {
            const environment = load(options);
            assert.equal((await environment.api.checkForUpdates({ manual: true, force: true })).status, 'error');
            assert.deepEqual(environment.openedUrls, []);
        }
    }
});

test('Both analyzers reject missing, duplicate, or drifted userscript identity metadata', async () => {
    for (const [load, productName, relativePath] of [
        [loadKeyword, 'Makaytron Etsy Keyword & Market Analyzer', keywordRelativePath],
        [loadListing, 'Makaytron Etsy Listing Analyzer', listingRelativePath],
    ]) {
        const probe = load();
        const version = nextPatch(probe.metadataVersion);
        const canonicalUrl = `${rawRepositoryUrl}/main/${relativePath}`;
        const valid = fixtureSource({ name: productName, relativePath, version });
        const invalidSources = [
            valid.replace('// ==UserScript==', '// UserScript metadata missing'),
            valid.replace(`// @name         ${productName}`, '// @name         Different Product'),
            valid.replace(`// @name         ${productName}`, `// @name         ${productName}\n// @name         Different Product`),
            valid.replace(`// @namespace    ${trustedNamespace}`, '// @namespace    https://example.invalid/untrusted'),
            valid.replace(`// @namespace    ${trustedNamespace}`, `// @namespace    ${trustedNamespace}\n// @namespace    https://example.invalid/untrusted`),
            valid.replace(`// @updateURL    ${canonicalUrl}`, '// @updateURL    https://example.invalid/wrong.user.js'),
            valid.replace(`// @updateURL    ${canonicalUrl}`, `// @updateURL    ${canonicalUrl}\n// @updateURL    https://example.invalid/wrong.user.js`),
            valid.replace(`// @downloadURL  ${canonicalUrl}`, '// @downloadURL  https://example.invalid/wrong.user.js'),
            valid.replace(`// @downloadURL  ${canonicalUrl}`, `// @downloadURL  ${canonicalUrl}\n// @downloadURL  https://example.invalid/wrong.user.js`),
            valid.replace(`// @version      ${version}`, '// @version      invalid'),
            valid.replace(`// @version      ${version}`, `// @version      ${version}\n// @version      99.0.0`),
        ];
        for (const sourceOverride of invalidSources) {
            const environment = load({ sourceOverride });
            assert.equal((await environment.api.checkForUpdates({ manual: true, force: true })).status, 'error');
            assert.deepEqual(environment.openedUrls, []);
        }
    }
});

test('Listing Analyzer rejects redirect drift and a different userscript at the pinned URL', async () => {
    const redirected = loadListing({ finalUrl: `${rawRepositoryUrl}/${commitSha}/${listingRelativePath}#mirror` });
    assert.equal((await redirected.api.checkForUpdates({ manual: true, force: true })).status, 'error');
    assert.deepEqual(redirected.openedUrls, []);

    const wrongSource = fixtureSource({
        name: 'Makaytron Etsy Keyword & Market Analyzer',
        relativePath: listingRelativePath,
        version: nextPatch(redirected.metadataVersion),
    });
    const wrongProduct = loadListing({ sourceOverride: wrongSource });
    assert.equal((await wrongProduct.api.checkForUpdates({ manual: true, force: true })).status, 'error');
    assert.deepEqual(wrongProduct.openedUrls, []);
});

test('Both updaters reject query, fragment, credential, and path drift', () => {
    const keyword = loadKeyword();
    const listing = loadListing();
    for (const [api, expected] of [
        [keyword.api, keyword.api.GITHUB_RAW_SCRIPT_URL],
        [listing.api, listing.api.GITHUB_CANONICAL_SCRIPT_URL],
    ]) {
        assert.equal(api.exactHttpsTarget(expected, expected), true);
        assert.equal(api.exactHttpsTarget(`${expected}?x=1`, expected), false);
        assert.equal(api.exactHttpsTarget(`${expected}#x`, expected), false);
        assert.equal(api.exactHttpsTarget(expected.replace('https://', 'https://user:pass@'), expected), false);
        assert.equal(api.exactHttpsTarget(expected.replace('.user.js', '-other.user.js'), expected), false);
    }
});
