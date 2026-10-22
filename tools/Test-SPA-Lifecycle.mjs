import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm, access } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(await readFile(path.join(root, 'config/production-packages.json'), 'utf8'));
const shared = (await readFile(path.join(root, 'shared/lifecycle/spa-lifecycle.js'), 'utf8')).trim();
const sources = new Map(await Promise.all(registry.map(async product => [product.id, await readFile(path.join(root, product.scriptPath), 'utf8')])));
const surfaces = {
    'ads-keyword-manager': ['/your/shops/me/advertising/listings/123', 'makaytron-ad-wordlist'],
    'keyword-market-analyzer': ['/your/shops/me/marketplace-insights', 'makaytron-etsy-keyword-market-analyzer'],
    'listing-analyzer': ['/your/shops/me/tools/listings', 'makaytron-etsy-listing-analyzer'],
    'message-assistant': ['/messages', 'makaytron-etsy-message-assistant'],
    'sale-manager': ['/your/shops/me/sales-discounts', 'eda-batch-root'],
};

for (const product of registry) {
    test(`${product.id} shares the tested bootstrap and injects before an Etsy SPA entry`, async () => {
        const source = sources.get(product.id);
        const inline = source.slice(source.indexOf('    // BEGIN SPA LIFECYCLE'), source.indexOf('    // END SPA LIFECYCLE') + '    // END SPA LIFECYCLE'.length).trim();
        assert.equal(inline, shared);
        assert.match(source, /^\/\/ @match\s+https:\/\/www\.etsy\.com\/\*$/m);
        assert.match(source, /^\/\/ @grant\s+window\.onurlchange$/m);
        const location = { pathname: '/outside', href: 'https://www.etsy.com/outside' };
        const listeners = new Map();
        const timers = new Set();
        const add = (name, callback) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); };
        const window = {
            addEventListener: add, removeEventListener: (name, callback) => listeners.get(name)?.delete(callback),
            setInterval: callback => { timers.add(callback); return callback; }, clearInterval: callback => timers.delete(callback),
            navigation: { addEventListener: add, removeEventListener() {} },
        };
        const predicate = source.match(/const RouteLifecycle = createRouteLifecycle\((.+)\);/)[1];
        const routePattern = source.match(/    const RUNTIME_ROUTE_PATTERN = .+;/)[0];
        const runtime = vm.createContext({ window, location, console });
        vm.runInContext(`${shared}\n${routePattern}\nglobalThis.lifecycle = createRouteLifecycle(${predicate});`, runtime);
        const lifecycle = runtime.lifecycle;
        let entries = 0, exits = 0;
        await lifecycle.start({ enter: () => { entries += 1; }, leave: () => { exits += 1; } });
        assert.equal(entries, 0);
        const navigate = (pathname, event) => {
            location.pathname = pathname; location.href = `https://www.etsy.com${pathname}`;
            for (const callback of event ? listeners.get(event) || [] : timers) callback();
        };
        navigate(surfaces[product.id][0], 'currententrychange');
        await Promise.resolve(); await Promise.resolve();
        assert.equal(entries, 1);
        const oldWork = lifecycle.capture();
        navigate('/outside', 'urlchange');
        assert.equal(exits, 1);
        assert.equal(lifecycle.current(oldWork), false);
        navigate(surfaces[product.id][0]);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(entries, 2);
        assert.equal(lifecycle.current(oldWork), false, 'returning to the same URL never revives stale work');
        lifecycle.dispose();
        assert.equal(timers.size, 0);
    });
}

function browserScenario(surface) {
    const [allowedPath, rootId] = surface;
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const count = () => document.querySelectorAll(`#${rootId}`).length;
    const wait = async (predicate, label) => {
        for (let elapsed = 0; elapsed < 5000; elapsed += 25) {
            if (predicate()) return;
            await delay(25);
        }
        throw new Error(`Timed out: ${label}; roots=${count()}; errors=${JSON.stringify(globalThis.spaErrors)}`);
    };
    const run = async () => {
        const documentIdentity = document;
        await delay(50);
        if (count() || globalThis.spaMenus.size) throw new Error('Application booted on an unsupported initial page');
        history.pushState({}, '', allowedPath);
        await wait(() => count() === 1, 'first SPA entry');
        history.replaceState({}, '', '/outside');
        await wait(() => count() === 0, 'SPA exit cleanup');
        history.replaceState({}, '', allowedPath);
        await wait(() => count() === 1, 'second SPA entry');
        const menuCount = globalThis.spaMenus.size;
        history.pushState({}, '', '/outside');
        await wait(() => count() === 0, 'second cleanup');
        history.back();
        await wait(() => count() === 1, 'Back entry');
        history.forward();
        await wait(() => count() === 0, 'Forward exit');
        history.replaceState({}, '', allowedPath);
        await wait(() => count() === 1, 'final SPA entry');
        await delay(300);
        if (count() !== 1 || globalThis.spaMenus.size !== menuCount) throw new Error('Duplicate UI or menu registrations');
        if (document !== documentIdentity) throw new Error('The document was reloaded');
        if (globalThis.spaOffRouteRequests.length) throw new Error(`Off-route requests: ${JSON.stringify(globalThis.spaOffRouteRequests)}`);
        return { pass: true, roots: count(), menuCount };
    };
    run().then(result => { document.getElementById('result').textContent = JSON.stringify(result); }, error => {
        document.getElementById('result').textContent = JSON.stringify({ pass: false, error: error.message });
    });
}

function allInstalledScenario(surfaces) {
    const entries = Object.values(surfaces);
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const roots = () => entries.filter(([, id]) => document.getElementById(id)).map(([, id]) => id);
    const settle = async expected => {
        for (let elapsed = 0; elapsed < 5000; elapsed += 25) {
            if (JSON.stringify(roots()) === JSON.stringify(expected)) return;
            await delay(25);
        }
        throw new Error(`Installed suite roots: ${JSON.stringify(roots())}; expected ${JSON.stringify(expected)}; ${JSON.stringify(spaErrors)}`);
    };
    const run = async () => {
        const originalDocument = document;
        await delay(50);
        await settle([]);
        let menuCount;
        for (let round = 0; round < 2; round += 1) {
            for (const [pathname, id] of entries) {
                history.pushState({}, '', pathname);
                await settle([id]);
                history.replaceState({}, '', '/outside');
                await settle([]);
            }
            if (!round) menuCount = spaMenus.size;
            else if (spaMenus.size !== menuCount) throw new Error('Repeated entry duplicated installed-suite menu commands');
        }
        if (document !== originalDocument) throw new Error('Installed suite reloaded the document');
        if (spaOffRouteRequests.length) throw new Error(`Installed suite made off-route requests: ${JSON.stringify(spaOffRouteRequests)}`);
        return { pass: true, menuCount, roots: roots() };
    };
    run().then(result => { document.getElementById('result').textContent = JSON.stringify(result); }, error => {
        document.getElementById('result').textContent = JSON.stringify({ pass: false, error: error.message });
    });
}

function fixture(product) {
    const installed = product.id === 'all-installed' ? registry : [product];
    const source = installed.map(item => {
        let code = sources.get(item.id);
        const routeDeclaration = code.match(/    const RouteLifecycle = createRouteLifecycle\(.+\);/)[0];
        return code.replace(routeDeclaration, `${routeDeclaration}\n    globalThis.spaGates.push(() => RouteLifecycle.allowed());`);
    }).join('\n');
    const mocks = `
        globalThis.spaErrors = [];
        const originalConsoleError = console.error.bind(console);
        console.error = (...args) => { spaErrors.push(args.map(String).join(' ')); originalConsoleError(...args); };
        globalThis.spaOffRouteRequests = []; globalThis.spaMenus = new Map(); globalThis.spaGates = [];
        globalThis.spaAllowed = () => spaGates.some(allowed => allowed());
        addEventListener('error', event => spaErrors.push(event.message));
        addEventListener('unhandledrejection', event => spaErrors.push(String(event.reason)));
        const values = new Map(); let nextMenu = 0;
        const register = (label, callback) => { const id = ++nextMenu; spaMenus.set(id, {label, callback}); return id; };
        const request = options => {
            if (!globalThis.spaAllowed?.()) spaOffRouteRequests.push(options.url);
            setTimeout(() => options.onload?.({status:503,responseText:'{}'}), 0);
            return {abort(){}};
        };
        globalThis.GM = {
            info:{script:{}}, getValue:async(key,fallback)=>values.has(key)?structuredClone(values.get(key)):fallback,
            setValue:async(key,value)=>values.set(key,structuredClone(value)), deleteValue:async key=>values.delete(key),
            addValueChangeListener(){}, registerMenuCommand:register, unregisterMenuCommand:id=>spaMenus.delete(id),
            addStyle:css=>{const node=document.createElement('style');node.textContent=css;document.head.appendChild(node);},
            getResourceURL:async()=>'', xmlHttpRequest:request, openInTab(){},
        };
        globalThis.GM_info=GM.info; globalThis.GM_registerMenuCommand=register;
        globalThis.GM_unregisterMenuCommand=id=>spaMenus.delete(id); globalThis.GM_xmlhttpRequest=request;
        globalThis.GM_addValueChangeListener=()=>{}; globalThis.GM_addStyle=GM.addStyle;
        globalThis.__MAKAYTRON_LISTING_TEST__=true; globalThis.__EKMA_DISABLE_AUTO_UPDATE__=true;
        globalThis.confirm=()=>false; globalThis.alert=()=>{};
    `;
    const scenario = product.id === 'all-installed' ? allInstalledScenario : browserScenario;
    const argument = product.id === 'all-installed' ? surfaces : surfaces[product.id];
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:"></head><body><main></main><pre id="result">pending</pre><script>${mocks}</script><script>${source.replace(/<\/script/gi, '<\\/script')}</script><script>(${scenario.toString()})(${JSON.stringify(argument)});</script></body></html>`;
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(operation, label) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        try { const value = await operation(); if (value) return value; } catch {}
        await delay(25);
    }
    throw new Error(`Timed out waiting for ${label}`);
}
async function connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let nextId = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
        const data = JSON.parse(event.data);
        const handler = pending.get(data.id);
        if (!handler) return;
        pending.delete(data.id); clearTimeout(handler.timer);
        if (data.error) handler.reject(new Error(data.error.message)); else handler.resolve(data.result);
    });
    return {
        close: () => socket.close(),
        call(method, params = {}) {
            const id = ++nextId;
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
                pending.set(id, { resolve, reject, timer });
                socket.send(JSON.stringify({ id, method, params }));
            });
        },
    };
}

test('all production applications activate and suspend across actual same-document Chrome navigation', { timeout: 120000 }, async t => {
    const browserProducts = [...registry, { id: 'all-installed' }];
    const candidates = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
    let chrome;
    for (const candidate of candidates) { try { await access(candidate); chrome = candidate; break; } catch {} }
    assert.ok(chrome, 'Chrome must be available for SPA browser validation');
    const server = createServer((req, res) => {
        const product = browserProducts.find(item => item.id === new URL(req.url, 'http://localhost').searchParams.get('product'));
        res.writeHead(product ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(product ? fixture(product) : 'Not found');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        for (const product of browserProducts) await t.test(product.id, async () => {
            const profile = await mkdtemp(path.join(os.tmpdir(), 'makaytron-spa-'));
            let child, page;
            try {
                child = spawn(chrome, [
                    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-extensions',
                    '--disable-component-update', '--no-default-browser-check', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
                    `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank',
                ], { windowsHide: true, stdio: 'ignore' });
                const port = await until(async () => Number.parseInt(await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8'), 10), 'Chrome port');
                const url = `http://127.0.0.1:${server.address().port}/outside?product=${product.id}`;
                const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
                page = await connect(target.webSocketDebuggerUrl);
                const result = await until(async () => {
                    const response = await page.call('Runtime.evaluate', { expression: 'document.getElementById("result")?.textContent', returnByValue: true });
                    const value = response.result?.value;
                    return value && value !== 'pending' ? JSON.parse(value) : null;
                }, product.id);
                assert.equal(result.pass, true, JSON.stringify(result));
            } finally {
                page?.close();
                if (child && child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)); }
                assert.ok(path.resolve(profile).startsWith(path.resolve(os.tmpdir()) + path.sep));
                await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
            }
        });
    } finally { await new Promise(resolve => server.close(resolve)); }
});
