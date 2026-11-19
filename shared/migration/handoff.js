    // BEGIN MIGRATION HANDOFF (shared/migration/handoff.js)
    // One-time transfer of a standalone script's saved data to the unified
    // Etsy Automation Tools script. Userscript storage is private to each
    // script, so the two scripts meet on the same Etsy tab:
    //
    // 1. The user presses "Aktar" in the standalone script, which arms its
    //    responder for a short window. Nothing is offered while it is not armed
    //    or while a job of that script is running.
    // 2. The unified script sends a request with a fresh ECDH P-256 public key.
    // 3. The responder answers with its own public key and the data, encrypted
    //    with AES-GCM under a key derived from the shared secret (HKDF-SHA-256,
    //    salted with the session id). Page scripts that only listen cannot read
    //    it. Both sides can show the same 4-digit check code (sas) derived from
    //    the shared key.
    // 4. The unified script imports the data and acknowledges with a digest of
    //    what it received; the standalone script then records the transfer.
    //    It does not delete its own data, so the user can go back.
    //
    // API keys and tokens never leave the standalone script: secret fields are
    // removed before encryption, and the receiver removes them again.
    // Locks, leases, update checks and send/publication journals are not
    // transferred; they only make sense inside the script that owns them.
    //
    // This file is plain script (no module syntax) so it can be inlined both
    // into the unified build and into the final versions of the standalone
    // scripts, like shared/lifecycle/spa-lifecycle.js.

    const MIGRATION_PROTOCOL = 'eat-migration';
    const MIGRATION_VERSION = 1;
    const MIGRATION_EVENT = 'makaytron:eat-migration';
    const MIGRATION_MAX_BYTES = 32 * 1024 * 1024;

    const MIGRATION_SPECS = Object.freeze({
        'sale-manager': Object.freeze({
            keys: ['eda-batch-config-v4', 'eda-batch-report-v4', 'eda-batch-report-history-v4', 'eda-batch-config-v3', 'eda-batch-report-v3'],
            prefixes: [],
            secrets: {},
        }),
        'ads-keyword-manager': Object.freeze({
            keys: ['adWordlist', 'adWordlistBackup', 'adWordlistLanguage', 'adWordlistPanelCollapsed'],
            prefixes: [],
            secrets: {},
        }),
        'keyword-market-analyzer': Object.freeze({
            keys: ['ekma:v1:settings', 'ekma:v1:research-queue', 'ekma:v1:research-cache', 'ekma:v1:captures', 'ekma:v1:result-envelopes'],
            prefixes: [],
            secrets: {},
        }),
        'listing-analyzer': Object.freeze({
            keys: ['meli:v1:settings', 'meli:v1:ui-preferences', 'meli:v1:listing-index', 'meli:v1:queue', 'meli:v1:audit',
                'meli:v1:collection', 'meli:v1:analysis-filters', 'meli:v1:filter-presets', 'meli:v1:ai-requests',
                'meli:v1:feedback', 'meli:v1:research-requests'],
            prefixes: ['meli:v1:listing:'],
            secrets: {},
        }),
        'message-assistant': Object.freeze({
            keys: ['mema:settings', 'mema:providers', 'mema:templates', 'mema:history', 'mema:statuses', 'mema:campaign',
                'mema:config-meta', 'mema:onboarding'],
            prefixes: [],
            // value paths that hold credentials; '*' matches every key of an object
            secrets: { 'mema:settings': ['deeplApiKey', 'messageCenterAgentToken'], 'mema:providers': ['*.apiKey'] },
        }),
    });

    function migrationStripSecrets(spec, key, value) {
        const paths = spec.secrets[key];
        if (!paths || !value || typeof value !== 'object') return value;
        const copy = JSON.parse(JSON.stringify(value));
        for (const path of paths) {
            const [head, field] = path.split('.');
            if (head === '*' && field) {
                for (const item of Object.values(copy)) if (item && typeof item === 'object' && field in item) item[field] = '';
            } else if (head in copy) {
                copy[head] = '';
            }
        }
        return copy;
    }

    /** Reads the transferable values of one tool. `store` is { get(key), keys() }. */
    async function migrationCollect(spec, store) {
        const values = {};
        const wanted = new Set(spec.keys);
        if (spec.prefixes.length) {
            for (const key of await store.keys()) if (spec.prefixes.some((p) => key.startsWith(p))) wanted.add(key);
        }
        for (const key of [...wanted].sort()) {
            const value = await store.get(key);
            if (value !== undefined && value !== null) values[key] = migrationStripSecrets(spec, key, value);
        }
        return values;
    }

    function migrationIsTransferableKey(spec, key) {
        return spec.keys.includes(key) || spec.prefixes.some((p) => key.startsWith(p) && /^[A-Za-z0-9:._-]{1,120}$/.test(key));
    }

    function migrationBytesToBase64(bytes) {
        let binary = '';
        const step = 0x8000;
        for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
        return btoa(binary);
    }

    function migrationBase64ToBytes(text) {
        const binary = atob(text);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    function migrationRandomId(cryptoApi) {
        return migrationBytesToBase64(cryptoApi.getRandomValues(new Uint8Array(16))).replace(/[^A-Za-z0-9]/g, '').slice(0, 22);
    }

    async function migrationKeyPair(cryptoApi) {
        const pair = await cryptoApi.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
        const raw = new Uint8Array(await cryptoApi.subtle.exportKey('raw', pair.publicKey));
        return { pair, publicKey: migrationBytesToBase64(raw) };
    }

    /** AES-GCM key and 4-digit check code from our private key and the peer's public key. */
    async function migrationSharedKey(cryptoApi, privateKey, peerPublicKey, session, tool) {
        const peer = await cryptoApi.subtle.importKey('raw', migrationBase64ToBytes(peerPublicKey), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
        const bits = await cryptoApi.subtle.deriveBits({ name: 'ECDH', public: peer }, privateKey, 256);
        const material = await cryptoApi.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey', 'deriveBits']);
        const enc = new TextEncoder();
        const params = (label) => ({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode(session), info: enc.encode(`${MIGRATION_PROTOCOL}-v${MIGRATION_VERSION}|${tool}|${label}`) });
        const key = await cryptoApi.subtle.deriveKey(params('key'), material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        const sasBits = new Uint8Array(await cryptoApi.subtle.deriveBits(params('sas'), material, 32));
        const sas = String((((sasBits[0] << 24) >>> 0) + (sasBits[1] << 16) + (sasBits[2] << 8) + sasBits[3]) % 10000).padStart(4, '0');
        return { key, sas };
    }

    async function migrationDigest(cryptoApi, text) {
        const hash = new Uint8Array(await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(text)));
        return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    function migrationValidMessage(message) {
        return message && typeof message === 'object' && message.protocol === MIGRATION_PROTOCOL && message.v === MIGRATION_VERSION
            && typeof message.type === 'string' && typeof message.session === 'string' && /^[A-Za-z0-9]{16,40}$/.test(message.session);
    }

    /** Transport over DOM events; both userscript sandboxes share the page document. Payloads are JSON strings. */
    function createDomMigrationTransport(doc) {
        return {
            send(message) { doc.dispatchEvent(new CustomEvent(MIGRATION_EVENT, { detail: JSON.stringify(message) })); },
            subscribe(handler) {
                const listener = (event) => {
                    if (typeof event.detail !== 'string' || event.detail.length > MIGRATION_MAX_BYTES * 2) return;
                    let message;
                    try { message = JSON.parse(event.detail); } catch { return; }
                    if (migrationValidMessage(message)) handler(message);
                };
                doc.addEventListener(MIGRATION_EVENT, listener);
                return () => doc.removeEventListener(MIGRATION_EVENT, listener);
            },
        };
    }

    /**
     * Standalone-script side. `store` is { get(key), keys() } over the script's
     * own storage; `isBusy()` reports a running job; `onDone(record)` stores
     * that the transfer happened.
     */
    function createMigrationResponder({ tool, appVersion, store, transport, cryptoApi, isBusy = () => false, onStatus = () => {}, onDone = () => {}, now = () => new Date() }) {
        const spec = MIGRATION_SPECS[tool];
        if (!spec) throw new Error(`Unknown migration tool: ${tool}`);
        let armedUntil = 0;
        let pending = null; // { session, digest }
        let unsubscribe = null;

        async function answer(message) {
            if (Date.now() > armedUntil || pending) return;
            if (!Array.isArray(message.tools) || !message.tools.includes(tool) || typeof message.publicKey !== 'string') return;
            if (await isBusy()) { onStatus({ state: 'busy' }); transport.send({ protocol: MIGRATION_PROTOCOL, v: MIGRATION_VERSION, type: 'busy', session: message.session, tool }); return; }
            const values = await migrationCollect(spec, store);
            const plaintext = JSON.stringify({ tool, appVersion, exportedAt: now().toISOString(), values });
            if (plaintext.length > MIGRATION_MAX_BYTES) { onStatus({ state: 'too-large' }); return; }
            const { pair, publicKey } = await migrationKeyPair(cryptoApi);
            const { key, sas } = await migrationSharedKey(cryptoApi, pair.privateKey, message.publicKey, message.session, tool);
            const iv = cryptoApi.getRandomValues(new Uint8Array(12));
            const ciphertext = new Uint8Array(await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)));
            pending = { session: message.session, digest: await migrationDigest(cryptoApi, plaintext) };
            onStatus({ state: 'offered', sas });
            transport.send({ protocol: MIGRATION_PROTOCOL, v: MIGRATION_VERSION, type: 'offer', session: message.session, tool, publicKey, iv: migrationBytesToBase64(iv), ciphertext: migrationBytesToBase64(ciphertext) });
        }

        function handle(message) {
            if (message.type === 'request') {
                answer(message).catch((error) => onStatus({ state: 'error', error }));
            } else if (message.type === 'ack' && pending && message.session === pending.session && message.tool === tool) {
                const ok = message.digest === pending.digest;
                pending = null;
                armedUntil = 0;
                if (ok) { onDone({ tool, at: now().toISOString() }); onStatus({ state: 'done' }); } else onStatus({ state: 'error', error: new Error('migration_digest_mismatch') });
            }
        }

        return {
            arm(ms = 120000) {
                armedUntil = Date.now() + ms;
                pending = null;
                if (!unsubscribe) unsubscribe = transport.subscribe(handle);
                onStatus({ state: 'armed' });
            },
            disarm() { armedUntil = 0; pending = null; unsubscribe?.(); unsubscribe = null; },
            get armed() { return Date.now() <= armedUntil; },
        };
    }

    /** Unified-script side. Resolves with the decrypted bundles that arrived before the timeout. */
    function createMigrationRequester({ transport, cryptoApi }) {
        async function request({ tools = Object.keys(MIGRATION_SPECS), timeoutMs = 4000 } = {}) {
            const session = migrationRandomId(cryptoApi);
            const { pair, publicKey } = await migrationKeyPair(cryptoApi);
            const results = [];
            const work = [];
            const unsubscribe = transport.subscribe((message) => {
                if (message.session !== session || !tools.includes(message.tool)) return;
                if (message.type === 'busy') { results.push({ tool: message.tool, state: 'busy' }); return; }
                if (message.type !== 'offer' || results.some((r) => r.tool === message.tool)) return;
                const entry = { tool: message.tool, state: 'pending' };
                results.push(entry);
                work.push((async () => {
                    try {
                        const { key, sas } = await migrationSharedKey(cryptoApi, pair.privateKey, message.publicKey, session, message.tool);
                        const plain = await cryptoApi.subtle.decrypt({ name: 'AES-GCM', iv: migrationBase64ToBytes(message.iv) }, key, migrationBase64ToBytes(message.ciphertext));
                        const text = new TextDecoder().decode(plain);
                        const bundle = JSON.parse(text);
                        if (bundle.tool !== message.tool) throw new Error('migration_tool_mismatch');
                        Object.assign(entry, { state: 'received', sas, bundle, digest: await migrationDigest(cryptoApi, text) });
                    } catch (error) {
                        Object.assign(entry, { state: 'error', error });
                    }
                })());
            });
            transport.send({ protocol: MIGRATION_PROTOCOL, v: MIGRATION_VERSION, type: 'request', session, tools, publicKey });
            await new Promise((resolve) => setTimeout(resolve, timeoutMs));
            unsubscribe();
            await Promise.all(work);
            const ack = (tool) => {
                const entry = results.find((r) => r.tool === tool && r.state === 'received');
                if (entry) transport.send({ protocol: MIGRATION_PROTOCOL, v: MIGRATION_VERSION, type: 'ack', session, tool, digest: entry.digest });
            };
            return { session, results, ack };
        }
        return { request };
    }
    // END MIGRATION HANDOFF
