import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureServerPath = path.join(repoRoot, 'tools', 'Run-Message-Assistant-Browser-Fixture.mjs');
const TIMEOUT_MS = 30_000;
const LOCAL_FETCH_TIMEOUT_MS = 2_000;

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function fetchLocal(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOCAL_FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

async function waitUntil(operation, label, timeout = 10_000) {
    const started = Date.now();
    let lastError = null;
    while (Date.now() - started < timeout) {
        try {
            const result = await operation();
            if (result) return result;
        } catch (error) { lastError = error; }
        await delay(50);
    }
    throw new Error(`Timed out waiting for ${label}.${lastError ? ` ${lastError.message}` : ''}`);
}

function chromeExecutable() {
    const candidates = [
        process.env.CHROME_PATH,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        process.platform === 'darwin' && '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        process.platform === 'linux' && '/usr/bin/google-chrome',
        process.platform === 'linux' && '/usr/bin/google-chrome-stable',
        process.platform === 'linux' && '/usr/bin/chromium',
    ].filter(Boolean);
    return candidates;
}

async function findChrome() {
    const { access } = await import('node:fs/promises');
    for (const candidate of chromeExecutable()) {
        try {
            await access(candidate);
            return candidate;
        } catch { /* try the next standard location */ }
    }
    throw new Error('Google Chrome was not found. Set CHROME_PATH to run the isolated browser fixture.');
}

class CdpConnection {
    constructor(socket) {
        this.socket = socket;
        this.nextId = 1;
        this.pending = new Map();
        this.listeners = new Map();
        socket.addEventListener('message', event => this.receive(event.data));
        socket.addEventListener('close', () => {
            for (const { reject } of this.pending.values()) reject(new Error('Chrome DevTools connection closed.'));
            this.pending.clear();
        });
    }

    static async connect(url) {
        const socket = new WebSocket(url);
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Chrome DevTools WebSocket timed out.')), 10_000);
            socket.addEventListener('open', () => {
                clearTimeout(timeout);
                resolve();
            }, { once: true });
            socket.addEventListener('error', () => {
                clearTimeout(timeout);
                reject(new Error('Chrome DevTools WebSocket failed.'));
            }, { once: true });
        });
        return new CdpConnection(socket);
    }

    receive(raw) {
        const message = JSON.parse(String(raw));
        if (message.id) {
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            if (message.error) pending.reject(new Error(message.error.message || 'Chrome DevTools command failed.'));
            else pending.resolve(message.result || {});
            return;
        }
        for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
    }

    send(method, params = {}, timeoutMs = 30_000) {
        const id = this.nextId++;
        const promise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Chrome DevTools command timed out: ${method}`));
            }, timeoutMs);
            this.pending.set(id, {
                resolve(value) { clearTimeout(timeout); resolve(value); },
                reject(error) { clearTimeout(timeout); reject(error); },
            });
        });
        try {
            this.socket.send(JSON.stringify({ id, method, params }));
        } catch (error) {
            this.pending.get(id)?.reject(error);
            this.pending.delete(id);
        }
        return promise;
    }

    on(method, listener) {
        const listeners = this.listeners.get(method) || [];
        listeners.push(listener);
        this.listeners.set(method, listeners);
    }

    close() {
        if (this.socket.readyState < WebSocket.CLOSING) this.socket.close();
    }
}

async function startFixtureServer() {
    const child = spawn(process.execPath, [fixtureServerPath], {
        cwd: repoRoot,
        env: { ...process.env, MEMA_FIXTURE_PORT: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    try {
        const url = await waitUntil(() => {
            if (child.exitCode !== null) throw new Error(`Fixture server exited with code ${child.exitCode}.`);
            return output.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
        }, 'fixture server', 10_000);
        return { child, url, get output() { return output; } };
    } catch (error) {
        try { await stopChild(child); } catch (cleanupError) { error.cleanupError = cleanupError; }
        if (output) error.fixtureServerOutput = output;
        throw error;
    }
}

async function waitForChildExit(child, timeoutMs) {
    if (!child || child.exitCode !== null || child.signalCode !== null) return true;
    return Promise.race([
        new Promise(resolve => child.once('exit', () => resolve(true))),
        delay(timeoutMs).then(() => false),
    ]);
}

async function stopChild(child) {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    if (await waitForChildExit(child, 3_000)) return;
    child.kill('SIGKILL');
    if (!await waitForChildExit(child, 3_000)) throw new Error(`Child process ${child.pid || 'unknown'} did not exit after SIGKILL.`);
}

async function startBlackholeProxy() {
    const sockets = new Set();
    const server = createServer(socket => {
        sockets.add(socket);
        socket.once('close', () => sockets.delete(socket));
        socket.destroy();
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Blackhole proxy did not bind to an isolated local port.');
    return { server, sockets, port: address.port };
}

async function stopBlackholeProxy(proxy) {
    if (!proxy?.server) return;
    for (const socket of proxy.sockets || []) socket.destroy();
    if (!proxy.server.listening) return;
    await new Promise((resolve, reject) => proxy.server.close(error => error ? reject(error) : resolve()));
}

async function removeChromeProfile(profile) {
    if (!profile) return;
    const resolvedProfile = path.resolve(profile);
    assert.ok(resolvedProfile.startsWith(path.resolve(os.tmpdir()) + path.sep), 'Chrome profile cleanup stays inside the OS temp directory.');
    await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

async function startChrome(proxyPort) {
    const executable = await findChrome();
    const profile = await mkdtemp(path.join(os.tmpdir(), 'mema-chrome-fixture-'));
    let child = null;
    let browser = null;
    try {
        child = spawn(executable, [
        '--headless=new',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-features=OptimizationHints,MediaRouter',
        '--disable-quic',
        '--disable-sync',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost',
        '--metrics-recording-only',
        '--no-default-browser-check',
        '--no-first-run',
        '--password-store=basic',
        `--proxy-server=http://127.0.0.1:${proxyPort}`,
        '--proxy-bypass-list=127.0.0.1;localhost;[::1]',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        'about:blank',
        ], {
            stdio: ['ignore', 'ignore', 'pipe'],
            windowsHide: true,
        });
        let stderr = '';
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', chunk => { stderr += chunk; });
        const activePortPath = path.join(profile, 'DevToolsActivePort');
        const port = await waitUntil(async () => {
            if (child.exitCode !== null) throw new Error(`Isolated Chrome exited with code ${child.exitCode}.`);
            const content = await readFile(activePortPath, 'utf8');
            return Number.parseInt(content.split(/\r?\n/)[0], 10) || 0;
        }, 'isolated Chrome DevTools port', 15_000);
        const version = await waitUntil(async () => {
            if (child.exitCode !== null) throw new Error(`Isolated Chrome exited with code ${child.exitCode}.`);
            const response = await fetchLocal(`http://127.0.0.1:${port}/json/version`);
            return response.ok ? response.json() : null;
        }, 'isolated Chrome DevTools endpoint', 10_000);
        browser = await CdpConnection.connect(version.webSocketDebuggerUrl);
        return { browser, child, port, profile, get stderr() { return stderr; } };
    } catch (error) {
        try { await stopChrome({ browser, child, profile }); } catch (cleanupError) { error.cleanupError = cleanupError; }
        throw error;
    }
}

async function stopChrome(chrome) {
    if (!chrome) return;
    let failure = null;
    try { if (chrome.browser) await chrome.browser.send('Browser.close', {}, 3_000); } catch (error) { failure = error; }
    try { chrome.browser?.close(); } catch (error) { failure ||= error; }
    try { await stopChild(chrome.child); } catch (error) { failure ||= error; }
    try { await removeChromeProfile(chrome.profile); } catch (error) { failure ||= error; }
    if (failure) throw failure;
}

async function pageSocketUrl(port, targetId) {
    return waitUntil(async () => {
        const response = await fetchLocal(`http://127.0.0.1:${port}/json/list`);
        const targets = await response.json();
        return targets.find(target => target.id === targetId)?.webSocketDebuggerUrl || '';
    }, `Chrome page target ${targetId}`, 10_000);
}

async function evaluate(page, expression) {
    const response = await page.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
    });
    if (response.exceptionDetails) {
        const description = response.exceptionDetails.exception?.description
            || response.exceptionDetails.text
            || 'Browser fixture evaluation failed.';
        throw new Error(description);
    }
    return response.result?.value;
}

async function waitForFixtureInteraction(page, label = 'fixture interaction readiness') {
    await waitUntil(
        () => evaluate(page, 'globalThis.__MEMA_FIXTURE__?.interactionReady === true'),
        label,
        5_000,
    );
}

async function dispatchTrustedModifiedEnter(page, { count = 1, modifier = 'ctrl' } = {}) {
    const isMeta = modifier === 'meta';
    const modifiers = isMeta ? 4 : 2;
    const modifierKey = isMeta ? 'Meta' : 'Control';
    const modifierCode = isMeta ? 'MetaLeft' : 'ControlLeft';
    const modifierVirtualKey = isMeta ? 91 : 17;
    await page.send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        modifiers,
        windowsVirtualKeyCode: modifierVirtualKey,
        nativeVirtualKeyCode: modifierVirtualKey,
        key: modifierKey,
        code: modifierCode,
    });
    try {
        for (let index = 0; index < count; index += 1) {
            await page.send('Input.dispatchKeyEvent', {
                type: 'rawKeyDown',
                modifiers,
                windowsVirtualKeyCode: 13,
                nativeVirtualKeyCode: 13,
                key: 'Enter',
                code: 'Enter',
            });
            await page.send('Input.dispatchKeyEvent', {
                type: 'keyUp',
                modifiers,
                windowsVirtualKeyCode: 13,
                nativeVirtualKeyCode: 13,
                key: 'Enter',
                code: 'Enter',
            });
        }
    } finally {
        await page.send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            modifiers: 0,
            windowsVirtualKeyCode: modifierVirtualKey,
            nativeVirtualKeyCode: modifierVirtualKey,
            key: modifierKey,
            code: modifierCode,
        });
    }
}

async function requestFixtureFormSubmit(page, submitterId = '') {
    await evaluate(page, `(() => {
        const form = document.getElementById('fixture-message-form');
        if (!form) throw new Error('Fixture composer form is missing.');
        const submitterId = ${JSON.stringify(submitterId)};
        const submitter = submitterId ? document.getElementById(submitterId) : null;
        if (submitterId && !submitter) throw new Error('Fixture submitter is missing.');
        if (submitter) form.requestSubmit(submitter);
        else form.requestSubmit();
        return true;
    })()`);
}

async function runBrowserScenario(chrome, fixtureUrl, query, method, interaction = null, viewport = null) {
    let targetId = null;
    let page = null;
    const requests = [];
    const blockedRequests = [];
    const externalSockets = [];
    const consoleErrors = [];
    let interceptionError = null;
    const allowedOrigin = new URL(fixtureUrl).origin;
    try {
        ({ targetId } = await chrome.browser.send('Target.createTarget', { url: 'about:blank' }));
        page = await CdpConnection.connect(await pageSocketUrl(chrome.port, targetId));
        page.on('Network.requestWillBeSent', event => requests.push(event.request?.url || ''));
        page.on('Network.webSocketCreated', event => externalSockets.push(event.url || ''));
        page.on('Network.webTransportCreated', event => externalSockets.push(event.url || ''));
        page.on('Runtime.consoleAPICalled', event => {
            if (event.type === 'error') consoleErrors.push(event.args?.map(argument => argument.value || argument.description || '').join(' ') || 'console.error');
        });
        page.on('Fetch.requestPaused', event => {
            const requestUrl = event.request?.url || '';
            let isAllowed = false;
            try { isAllowed = new URL(requestUrl).origin === allowedOrigin; } catch { /* fail closed below */ }
            const command = isAllowed ? 'Fetch.continueRequest' : 'Fetch.failRequest';
            const params = isAllowed
                ? { requestId: event.requestId }
                : { requestId: event.requestId, errorReason: 'BlockedByClient' };
            if (!isAllowed) blockedRequests.push(requestUrl);
            void page.send(command, params).catch(error => { interceptionError = error; });
        });
        await page.send('Network.enable');
        await page.send('Runtime.enable');
        await page.send('Page.enable');
        if (viewport) {
            await page.send('Emulation.setDeviceMetricsOverride', {
                width: viewport.width,
                height: viewport.height,
                deviceScaleFactor: 1,
                mobile: false,
            });
        }
        await page.send('Fetch.enable', {
            patterns: [
                { urlPattern: 'http://*', requestStage: 'Request' },
                { urlPattern: 'https://*', requestStage: 'Request' },
            ],
        });
        const targetUrl = new URL(query, fixtureUrl).href;
        await page.send('Page.navigate', { url: targetUrl });
        await waitUntil(
            async () => evaluate(page, `Boolean(
                globalThis.__MEMA_FIXTURE__?.api?.UI?.shadow
                && document.getElementById('fixture-state')?.textContent === 'hazır'
            )`),
            `${method} fixture readiness`,
            15_000,
        );
        const resultPromise = evaluate(page, `(async () => globalThis.__MEMA_FIXTURE__.${method}())()`);
        void resultPromise.catch(() => {});
        if (interaction) await interaction(page);
        const result = await resultPromise;
        await delay(250);
        if (interceptionError) throw interceptionError;
        const externalRequests = requests.filter(url => url
            && url !== 'about:blank'
            && !url.startsWith(`${allowedOrigin}/`)
            && !url.startsWith('data:'));
        assert.deepEqual(externalRequests, [], `${method} must not issue an external browser request.`);
        assert.deepEqual(blockedRequests, [], `${method} attempted a blocked external browser request.`);
        assert.deepEqual(externalSockets, [], `${method} attempted an external WebSocket or WebTransport request.`);
        assert.deepEqual(result?.externalNetworkAttempts || [], [], `${method} attempted fixture-blocked navigation or network access.`);
        return { result, requests, blockedRequests, externalSockets, consoleErrors };
    } finally {
        try {
            page?.close();
        } finally {
            if (targetId) await chrome.browser.send('Target.closeTarget', { targetId }, 3_000).catch(() => false);
        }
    }
}

function assertResponsiveMessageListLayout(layout, { viewportWidth, desktopPanel = false }) {
    const tolerance = 1;
    const noHorizontalOverflow = (box, label) => {
        assert.ok(box.scrollWidth <= box.clientWidth + tolerance,
            `${label} has no horizontal overflow (${box.scrollWidth} <= ${box.clientWidth}).`);
    };
    const inside = (child, parent, label) => {
        assert.ok(child.left >= parent.left - tolerance && child.right <= parent.right + tolerance,
            `${label} stays inside its parent bounds.`);
    };

    assert.equal(layout.viewportWidth, viewportWidth);
    assert.equal(layout.itemCount, 2);
    assert.ok(layout.optionCount > 200, 'the full language catalog remains rendered');
    assert.ok(layout.longestLanguageOptionLength > 1_000, 'the fixture includes a genuinely long language option');
    assert.doesNotMatch(layout.appClasses, /(?:^|\s)ma-app--wide(?:\s|$)/,
        'message-list mode keeps the default compact panel');
    assert.ok(layout.row.width > 0 && layout.row.height > 0, 'the long conversation row remains visible');
    assert.ok(layout.rowBody.width > 0, 'the flexible conversation row body remains visible');
    assert.ok(layout.openButton.width > 0, 'the fixed conversation-open action remains visible');

    for (const [label, box] of [
        ['assistant main area', layout.main],
        ['assistant view', layout.view],
        ['message-list shell', layout.shell],
        ['message-list controls', layout.controls],
        ['conversation list', layout.list],
        ['conversation row', layout.row],
        ['expanded original-message body', layout.disclosureBody],
    ]) noHorizontalOverflow(box, label);

    inside(layout.shell, layout.view, 'the message-list shell');
    inside(layout.controls, layout.shell, 'the language controls');
    inside(layout.select, layout.controls, 'the long language selector');
    inside(layout.list, layout.shell, 'the conversation list');
    inside(layout.row, layout.list, 'the long conversation row');
    inside(layout.openButton, layout.row, 'the conversation-open action');
    inside(layout.disclosureBody, layout.rowBody, 'the expanded original-message body');

    assert.ok(layout.title.scrollWidth > layout.title.clientWidth,
        'the long customer name exercises clipped intrinsic content');
    assert.ok(layout.preview.scrollWidth > layout.preview.clientWidth,
        'the long translated preview exercises clipped intrinsic content');

    if (desktopPanel) {
        assert.ok(Math.abs(layout.app.width - 680) <= tolerance,
            `the default premium desktop message panel remains 680px wide (actual ${layout.app.width}).`);
    } else {
        assert.ok(layout.app.left >= 3 && layout.app.right <= viewportWidth - 3,
            'the mobile panel respects its viewport inset');
        assert.ok(layout.app.width < viewportWidth, 'the mobile panel stays narrower than the viewport');
    }
}

test('Message Assistant isolated Chrome regression fixture', { timeout: 600_000 }, async t => {
    let server = null;
    let chrome = null;
    let proxy = null;
    let failure = null;
    try {
        proxy = await startBlackholeProxy();
        server = await startFixtureServer();
        chrome = await startChrome(proxy.port);

        await t.test('route-before-DOM hydration and double Otopilot start send exactly once in Turkish', { timeout: TIMEOUT_MS }, async () => {
            const { result } = await runBrowserScenario(chrome, server.url, '/?transition=1&label=tr&double=1', 'runScenario');
            assert.equal(result.after.sendCount, 1);
            assert.equal(result.after.doubleClick, true);
            assert.equal(result.after.sendLanguage, 'tr');
            assert.equal(result.after.campaignStatus, 'completed');
        });

        await t.test('English Send label resolves and explicit Otopilot verifies', { timeout: TIMEOUT_MS }, async () => {
            const { result } = await runBrowserScenario(chrome, server.url, '/?label=en', 'runScenario');
            assert.equal(result.after.sendCount, 1);
            assert.equal(result.after.sendLanguage, 'en');
            assert.equal(result.after.orderStatus, 'sent');
        });

        await t.test('disabled Send stops Otopilot closed without a native click', { timeout: TIMEOUT_MS }, async () => {
            const { result } = await runBrowserScenario(chrome, server.url, '/?disabled=1&label=tr', 'runDisabledSendScenario');
            assert.equal(result.after.sendCount, 0);
            assert.equal(result.after.itemStatus, 'inserted');
            assert.notEqual(result.after.orderStatus, 'sent');
        });

        await t.test('href-less native order drawer replaces only Etsy prefill and Otopilot sends once', { timeout: TIMEOUT_MS }, async () => {
            const { result, consoleErrors } = await runBrowserScenario(
                chrome,
                server.url,
                '/?order_surface=1&label=en',
                'runOrderSurfaceScenario',
            );
            assert.equal(result.after.messageUrl,
                'https://www.etsy.com/your/orders/sold/completed?ref=seller-platform-mcnav&expand_convo=true&order_id=10000001');
            assert.equal(result.after.routeIdentity, 'compose:order:receipt:10000001');
            assert.equal(result.after.initialComposerText, 'https://www.etsy.com/your/purchases/10000001');
            assert.equal(result.before.messageHistoryInsideComposer, true);
            assert.notEqual(result.after.expectedText, result.after.initialComposerText);
            assert.equal(result.after.autoSendCampaign, true);
            assert.equal(result.after.purpose, 'delivery_followup');
            assert.equal(result.after.runMode, 'autopilot');
            assert.equal(result.after.campaignStatus, 'completed');
            assert.equal(result.after.itemStatus, 'sent');
            assert.equal(result.after.orderStatus, 'sent');
            assert.equal(result.after.sendCount, 1);
            assert.equal(result.after.nativeTargetClickCount, 1);
            assert.equal(result.after.formSubmitCount, 1);
            assert.equal(result.after.outgoingCount, 1);
            assert.equal(result.after.postSendPermalinkCount, 1);
            assert.equal(result.after.postSendComposerScopeResolved, false);
            assert.equal(result.after.lastSentText, result.after.expectedText);
            assert.equal(result.after.composerText, '');
            assert.equal(result.after.conversationStatus, 'sent');
            assert.deepEqual(consoleErrors, []);
        });

        await t.test('delayed order-compose context hydrates before one fail-safe draft insertion', { timeout: TIMEOUT_MS }, async () => {
            const { result, consoleErrors } = await runBrowserScenario(
                chrome,
                server.url,
                '/?order_surface=1&delayed_order_context=1&label=en',
                'runDelayedOrderContextScenario',
            );
            assert.ok(result.after.hydrationDelayMs >= 1500);
            assert.equal(result.after.preHydrationComposerText, 'https://www.etsy.com/your/purchases/10000001');
            assert.equal(result.after.draftInsertionCount, 1);
            assert.equal(result.after.itemStatus, 'sent');
            assert.equal(result.after.sendCount, 1);
            assert.equal(result.after.nativeTargetClickCount, 1);
            assert.equal(result.after.formSubmitCount, 1);
            assert.equal(result.after.outgoingCount, 1);
            assert.deepEqual(consoleErrors, []);
        });

        await t.test('order drawer Otopilot sends exactly once after one explicit start', { timeout: TIMEOUT_MS }, async () => {
            const { result, consoleErrors } = await runBrowserScenario(
                chrome,
                server.url,
                '/?order_surface=1&label=en',
                'runOrderSurfaceManualSendScenario',
            );
            assert.equal(result.after.autoSendCampaign, true);
            assert.equal(result.after.purpose, 'delivery_followup');
            assert.equal(result.after.runMode, 'autopilot');
            assert.equal(result.after.sendCount, 1);
            assert.equal(result.after.nativeTargetClickCount, 1);
            assert.equal(result.after.formSubmitCount, 1);
            assert.equal(result.after.outgoingCount, 1);
            assert.equal(result.after.postSendPermalinkCount, 1);
            assert.equal(result.after.postSendComposerScopeResolved, false);
            assert.equal(result.after.lastSentText, result.after.expectedText);
            assert.equal(result.after.composerText, '');
            assert.equal(result.after.campaignStatus, 'completed');
            assert.equal(result.after.itemStatus, 'sent');
            assert.equal(result.after.orderStatus, 'sent');
            assert.equal(result.after.conversationId, 'compose:order:receipt:10000001');
            assert.equal(result.after.conversationStatus, 'sent');
            assert.deepEqual(consoleErrors, []);
        });

        await t.test('narrow delivered-order layout keeps premium cards inside the assistant view', { timeout: TIMEOUT_MS }, async () => {
            const { result, consoleErrors } = await runBrowserScenario(
                chrome,
                server.url,
                '/',
                'runResponsiveOrdersScenario',
                null,
                { width: 900, height: 900 },
            );
            const layout = result.after;
            assert.equal(layout.viewportWidth, 900);
            assert.equal(layout.containerType, 'inline-size');
            assert.ok(layout.hero.width > 0 && layout.hero.height > 0, 'the premium automation hero remains visible');
            assert.ok(layout.card.width > 0 && layout.card.height > 0, 'the delivered-order card remains visible');
            assert.ok(layout.toolbar.top >= layout.hero.bottom - 1, 'the selection toolbar follows the automation hero');
            assert.ok(layout.grid.top >= layout.toolbar.bottom - 1, 'the premium order grid follows the selection toolbar');
            assert.ok(layout.main.scrollWidth <= layout.main.clientWidth + 1, 'the assistant main area has no horizontal overflow');
            assert.ok(layout.grid.scrollWidth <= layout.grid.clientWidth + 1, 'the premium order grid has no horizontal overflow');
            assert.ok(layout.card.scrollWidth <= layout.card.clientWidth + 1, 'the order card has no horizontal overflow');
            assert.ok(layout.hero.left >= layout.view.left - 1 && layout.hero.right <= layout.view.right + 1,
                'the automation hero stays inside the visible assistant view');
            assert.ok(layout.grid.left >= layout.view.left - 1 && layout.grid.right <= layout.view.right + 1,
                'the order grid stays inside the visible assistant view');
            assert.ok(layout.card.left >= layout.grid.left - 1 && layout.card.right <= layout.grid.right + 1,
                'the order card stays inside its grid column');
            assert.ok(layout.cardTop.left >= layout.card.left - 1 && layout.cardTop.right <= layout.card.right + 1,
                'the card header stays inside the premium order card');
            assert.ok(layout.cardBody.left >= layout.card.left - 1 && layout.cardBody.right <= layout.card.right + 1,
                'the card actions stay inside the premium order card');
            assert.deepEqual(consoleErrors, []);
        });

        await t.test('default 680px premium message panel contains long language options and conversation text', { timeout: TIMEOUT_MS }, async () => {
            const { result, consoleErrors } = await runBrowserScenario(
                chrome,
                server.url,
                '/?message_list=1',
                'runResponsiveMessageListScenario',
                null,
                { width: 1440, height: 900 },
            );
            assertResponsiveMessageListLayout(result.after, { viewportWidth: 1440, desktopPanel: true });
            assert.deepEqual(consoleErrors, []);
        });

        await t.test('narrow mobile message panel contains long language options and conversation text', { timeout: TIMEOUT_MS }, async () => {
            const { result, consoleErrors } = await runBrowserScenario(
                chrome,
                server.url,
                '/?message_list=1',
                'runResponsiveMessageListScenario',
                null,
                { width: 360, height: 800 },
            );
            assertResponsiveMessageListLayout(result.after, { viewportWidth: 360 });
            assert.deepEqual(consoleErrors, []);
        });

        await t.test('wrong order after compose hydration cannot create sent ledgers', { timeout: TIMEOUT_MS }, async () => {
            const { result } = await runBrowserScenario(
                chrome,
                server.url,
                '/?transition=1&transition_order=10009999',
                'runMismatchScenario',
            );
            assert.equal(result.after.actualOrderId, '10009999');
            assert.notEqual(result.after.itemStatus, 'sent');
            assert.equal(result.after.sentConversationCount, 0);
        });

        await t.test('wrong customer after compose hydration cannot create sent ledgers', { timeout: TIMEOUT_MS }, async () => {
            const { result } = await runBrowserScenario(
                chrome,
                server.url,
                '/?transition=1&transition_buyer=Wrong%20Fixture%20Buyer',
                'runMismatchScenario',
            );
            assert.equal(result.after.actualBuyerName, 'Wrong Fixture Buyer');
            assert.notEqual(result.after.orderStatus, 'sent');
            assert.equal(result.after.sentConversationCount, 0);
        });

        await t.test('Message Center local job reaches composer, one Send, and duplicate-safe ledger', { timeout: TIMEOUT_MS }, async () => {
            const { result } = await runBrowserScenario(chrome, server.url, '/?label=en', 'runMessageCenterScenario');
            assert.equal(result.after.sendCount, 1);
            assert.ok(result.after.sentLedger);
            assert.equal(result.after.pending, null);
            assert.equal(result.after.results[1]?.duplicatePrevented, true);
        });

        await t.test('trusted CDP Ctrl+Enter reaches one guarded form submit', { timeout: TIMEOUT_MS }, async () => {
            const { result, consoleErrors } = await runBrowserScenario(
                chrome,
                server.url,
                '/?native_input=shortcut&shortcut_count=1&label=en',
                'runNativeInputScenario',
                async page => {
                    await waitForFixtureInteraction(page, 'trusted Ctrl+Enter fixture readiness');
                    await dispatchTrustedModifiedEnter(page);
                },
            );
            assert.equal(result.after.shortcutEvents.length, 1);
            assert.equal(result.after.shortcutEvents[0]?.isTrusted, true);
            assert.equal(result.after.sendCount, 1);
            assert.equal(result.after.formSubmitEvents.length, 1);
            assert.deepEqual(consoleErrors, []);
        });

        await t.test('trusted CDP Meta+Enter reaches one guarded form submit', { timeout: TIMEOUT_MS }, async () => {
            const { result, consoleErrors } = await runBrowserScenario(
                chrome,
                server.url,
                '/?native_input=shortcut&shortcut_count=1&shortcut_modifier=meta&label=en',
                'runNativeInputScenario',
                async page => {
                    await waitForFixtureInteraction(page, 'trusted Meta+Enter fixture readiness');
                    await dispatchTrustedModifiedEnter(page, { modifier: 'meta' });
                },
            );
            assert.equal(result.after.shortcutEvents.length, 1);
            assert.equal(result.after.shortcutEvents[0]?.isTrusted, true);
            assert.equal(result.after.shortcutEvents[0]?.metaKey, true);
            assert.equal(result.after.nativeShortcutHandlerCount, 0);
            assert.equal(result.after.sendCount, 1);
            assert.equal(result.after.formSubmitEvents.length, 1);
            assert.deepEqual(consoleErrors, []);
        });

        await t.test('direct requestSubmit routes through one guarded native form submit', { timeout: TIMEOUT_MS }, async () => {
            const { result, consoleErrors } = await runBrowserScenario(
                chrome,
                server.url,
                '/?native_input=request-submit&label=tr',
                'runNativeInputScenario',
                async page => {
                    await waitForFixtureInteraction(page, 'direct requestSubmit fixture readiness');
                    await requestFixtureFormSubmit(page);
                },
            );
            assert.equal(result.after.submitIntents.length, 2);
            assert.equal(result.after.nativeTargetClickCount, 1);
            assert.equal(result.after.sendCount, 1);
            assert.equal(result.after.formSubmitEvents.length, 1);
            assert.deepEqual(consoleErrors, []);
        });

        await t.test('exact composer Save draft submitter never routes to Send', { timeout: TIMEOUT_MS }, async () => {
            const { result, consoleErrors } = await runBrowserScenario(
                chrome,
                server.url,
                '/?native_input=request-submit&label=en',
                'runNonSendSubmitterScenario',
                async page => {
                    await waitForFixtureInteraction(page, 'Save draft submitter fixture readiness');
                    await requestFixtureFormSubmit(page, 'fixture-save-draft');
                },
            );
            assert.equal(result.after.submitIntents.length, 1);
            assert.equal(result.after.submitIntents[0]?.submitterId, 'fixture-save-draft');
            assert.equal(result.after.sendClickIntents.length, 0);
            assert.equal(result.after.nativeTargetClickCount, 0);
            assert.equal(result.after.formSubmitEvents.length, 0);
            assert.equal(result.after.sendCount, 0);
            assert.equal(result.after.outgoingCount, 0);
            assert.equal(result.after.composerText, result.after.expectedText);
            assert.equal(result.after.nativeAttemptCount, 0);
            assert.equal(result.after.sentConversationCount, 0);
            assert.ok(result.after.toastMessages.some(entry => entry.type === 'warning'
                && /farklı bir işlem düğmesi|Gönder olarak çalıştırılmadı/i.test(entry.message)));
            assert.deepEqual(consoleErrors, []);
        });

        await t.test('rapid double trusted Ctrl+Enter dispatches once', { timeout: TIMEOUT_MS }, async () => {
            const { result, consoleErrors } = await runBrowserScenario(
                chrome,
                server.url,
                '/?native_input=shortcut&shortcut_count=2&label=en',
                'runNativeInputScenario',
                async page => {
                    await waitForFixtureInteraction(page, 'double Ctrl+Enter fixture readiness');
                    await dispatchTrustedModifiedEnter(page, { count: 2 });
                },
            );
            assert.equal(result.after.shortcutEvents.length, 2);
            assert.ok(result.after.shortcutEvents.every(event => event.isTrusted));
            assert.equal(result.after.nativeShortcutHandlerCount, 0);
            assert.equal(result.after.nativeTargetClickCount, 1);
            assert.equal(result.after.sendCount, 1);
            assert.deepEqual(consoleErrors, []);
        });

        for (const blocked of ['hold', 'stale', 'disabled']) {
            await t.test(`${blocked} composer blocks requestSubmit and trusted Ctrl+Enter`, { timeout: TIMEOUT_MS }, async () => {
                const disabledQuery = blocked === 'disabled' ? '&disabled=1' : '';
                const { result, consoleErrors } = await runBrowserScenario(
                    chrome,
                    server.url,
                    `/?native_input=blocked&block=${blocked}${disabledQuery}`,
                    'runNativeInputScenario',
                    async page => {
                        await waitForFixtureInteraction(page, `${blocked} native input fixture readiness`);
                        await requestFixtureFormSubmit(page);
                        await dispatchTrustedModifiedEnter(page);
                    },
                );
                assert.equal(result.after.shortcutEvents.length, 1);
                assert.equal(result.after.shortcutEvents[0]?.isTrusted, true);
                assert.equal(result.after.nativeTargetClickCount, 0);
                assert.equal(result.after.sendCount, 0);
                assert.equal(result.after.formSubmitEvents.length, 0);
                assert.equal(result.after.outgoingCount, 0);
                assert.equal(result.after.nativeShortcutHandlerCount, 0);
                assert.equal(result.after.nativeAttemptCount, blocked === 'hold' ? 1 : 0);
                assert.deepEqual(consoleErrors, []);
            });
        }
    } catch (error) {
        if (server?.output) error.fixtureServerOutput = server.output;
        if (chrome?.stderr) error.chromeStderr = chrome.stderr;
        failure = error;
    } finally {
        try { await stopChrome(chrome); } catch (error) { failure ||= error; }
        try { await stopChild(server?.child); } catch (error) { failure ||= error; }
        try { await stopBlackholeProxy(proxy); } catch (error) { failure ||= error; }
    }
    if (failure) throw failure;
});
