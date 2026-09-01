import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const configuredPort = Number.parseInt(process.env.MEMA_FIXTURE_PORT || '8766', 10);
const PORT = Number.isInteger(configuredPort) && configuredPort >= 0 && configuredPort <= 65535
    ? configuredPort
    : 8766;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = path.join(repoRoot, 'tools', 'fixtures', 'message-assistant-delivered');
const fixtureScriptPath = path.join(fixtureRoot, 'fixture.js');
const userscriptPath = path.join(
    repoRoot,
    'scripts',
    'etsy-message-assistant',
    'Makaytron-Etsy-Message-Assistant.user.js',
);
const bootstrapMarker = '    await App.init();';

function installPreviewLanguageFixtureScenario() {
    const bodyPrefixes = Object.freeze({ tr: 'Türkçe', de: 'Almanca' });
    const waitForTranslations = async (target, languageName) => {
        const startedAt = Date.now();
        while (Date.now() - startedAt < 5000) {
            const nodes = [...document.querySelectorAll('[data-mema-conversation-translation][data-state="translated"]')];
            const ready = nodes.length === 2 && nodes.every(node => {
                const label = node.querySelector('.mema-inline-translation__label');
                const body = node.querySelector('.mema-inline-translation__text');
                const role = node.getAttribute('data-mema-message-role');
                const ownerLabel = role === 'seller' ? 'Sizin mesajınız' : 'Müşteri mesajı';
                return label?.textContent?.trim() === `${ownerLabel} · ${languageName} çeviri`
                    && body?.getAttribute('lang') === target
                    && Boolean(body.textContent);
            });
            if (ready) return nodes;
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        throw new Error(`Inline translations did not settle in ${target}.`);
    };
    const snapshotTranslations = nodes => nodes.map(node => {
        const label = node.querySelector('.mema-inline-translation__label');
        const body = node.querySelector('.mema-inline-translation__text');
        return {
            messageId: node.previousElementSibling?.querySelector('[data-message-id]')?.getAttribute('data-message-id') || '',
            messageRole: node.getAttribute('data-mema-message-role') || '',
            label: label?.textContent?.trim() || '',
            labelLang: label?.getAttribute('lang') || '',
            lang: body?.getAttribute('lang') || '',
            text: body?.textContent || '',
            backgroundColor: getComputedStyle(node).backgroundColor,
        };
    });

    globalThis.addEventListener('mema:test-api-ready', () => {
        const fixture = globalThis.__MEMA_FIXTURE__;
        const originalScenario = fixture.runInlineTranslationScenario.bind(fixture);
        fixture.runInlineTranslationScenario = async () => {
            const api = fixture.api;
            fixture.translationRequests.length = 0;
            api.Store.settings.previewLanguage = 'tr';
            api.Translator.translate = async (text, target, options = {}) => {
                const normalizedTarget = String(target);
                fixture.translationRequests.push({
                    text: String(text),
                    target: normalizedTarget,
                    logHistory: options.logHistory !== false,
                });
                return {
                    text: `${bodyPrefixes[normalizedTarget] || normalizedTarget}: ${text}`,
                    detectedLanguage: 'en',
                    provider: 'google',
                };
            };

            const initialResult = await originalScenario();
            const initialNodes = await waitForTranslations('tr', 'Türkçe');
            const initialTranslatedRows = snapshotTranslations(initialNodes);

            api.Store.settings.previewLanguage = 'de';
            await api.ConversationTranslations.refresh();
            const translatedNodes = await waitForTranslations('de', 'Almanca');
            const translatedRows = snapshotTranslations(translatedNodes);
            const translatedContext = api.MessageAdapter.context();

            return {
                ...initialResult,
                after: {
                    ...initialResult.after,
                    previewLanguage: api.Store.settings.previewLanguage,
                    initialTranslationCount: initialNodes.length,
                    translationCount: translatedNodes.length,
                    initialTranslatedRows,
                    translatedRows,
                    oldTranslationsRemoved: initialNodes.every(node => node.isConnected === false),
                    translatedMessages: translatedContext.messages,
                    translationRequests: JSON.parse(JSON.stringify(fixture.translationRequests)),
                },
            };
        };
    }, { once: true });
}

async function instrumentedFixture() {
    const source = await readFile(fixtureScriptPath, 'utf8');
    return `${source}\n;(${installPreviewLanguageFixtureScenario.toString()})();\n`;
}

async function instrumentedUserscript() {
    const source = await readFile(userscriptPath, 'utf8');
    if (source.split(bootstrapMarker).length !== 2) {
        throw new Error('Message Assistant bootstrap marker is missing or ambiguous.');
    }
    return source.replace(bootstrapMarker, `
    globalThis.__MEMA_TEST__ = Object.freeze({
        APP,
        KEYS,
        DEFAULT_SETTINGS: clone(DEFAULT_SETTINGS),
        DEFAULT_TEMPLATES: clone(DEFAULT_TEMPLATES),
        Store,
        History,
        TemplateEngine,
        Campaign,
        Outreach,
        Verification,
        MessageAdapter,
        ConversationTranslations,
        ComposerQuickActions,
        OrdersAdapter,
        MessageCenterAgent,
        GMX,
        Translator,
        AI,
        Router,
        UI,
        App,
        hashText,
    });
    globalThis.dispatchEvent(new CustomEvent('mema:test-api-ready'));
`);
}

const staticRoutes = new Map([
    ['/', { file: path.join(fixtureRoot, 'index.html'), type: 'text/html; charset=utf-8' }],
]);

const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', `http://${HOST}:${PORT}`);
    response.setHeader('Cache-Control', 'no-store, max-age=0');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'",
    );

    if (!['GET', 'HEAD'].includes(request.method || '')) {
        response.writeHead(405, { Allow: 'GET, HEAD' });
        response.end('Method Not Allowed\n');
        return;
    }
    if (url.pathname === '/health') {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ ok: true, fixture: 'message-assistant-delivered', pid: process.pid }));
        return;
    }
    if (url.pathname === '/assistant.js') {
        try {
            const body = await instrumentedUserscript();
            response.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
            response.end(request.method === 'HEAD' ? undefined : body);
        } catch (error) {
            response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end(`${error.message}\n`);
        }
        return;
    }
    if (url.pathname === '/fixture.js') {
        try {
            const body = await instrumentedFixture();
            response.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
            response.end(request.method === 'HEAD' ? undefined : body);
        } catch (error) {
            response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end(`${error.message}\n`);
        }
        return;
    }
    if (url.pathname === '/favicon.ico') {
        response.writeHead(204);
        response.end();
        return;
    }
    const route = staticRoutes.get(url.pathname);
    if (!route) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not Found\n');
        return;
    }
    try {
        const body = await readFile(route.file);
        response.writeHead(200, { 'Content-Type': route.type });
        response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(`${error.message}\n`);
    }
});

server.listen(PORT, HOST, () => {
    const address = server.address();
    const listeningPort = typeof address === 'object' && address ? address.port : PORT;
    process.stdout.write(`Message Assistant browser fixture: http://${HOST}:${listeningPort}/\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
}
