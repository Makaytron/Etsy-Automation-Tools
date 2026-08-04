// ==UserScript==
// @name         Makaytron Etsy Keyword & Market Analyzer
// @name:tr      Makaytron Etsy Keyword & Market Analyzer
// @name:en      Makaytron Etsy Keyword & Market Analyzer
// @version      1.0.1
// @description  Etsy Marketplace Insights verilerini sayfada analiz edin ve Listing Analyzer ile güvenli araştırma sonuçları paylaşın.
// @description:tr Etsy Marketplace Insights verilerini sayfada analiz edin ve Listing Analyzer ile güvenli araştırma sonuçları paylaşın.
// @description:en Analyze Etsy Marketplace Insights data in-page and securely share research results with Listing Analyzer.
// @namespace    https://github.com/Makaytron/EtsyScript
// @author       Makaytron (@Makaytron)
// @license      MIT
// @antifeature  tracking
// @homepageURL  https://github.com/Makaytron/Etsy-Automation-Tools/tree/main/scripts/etsy-keyword-market-analyzer
// @supportURL   https://github.com/Makaytron/Etsy-Automation-Tools/issues
// @updateURL    https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-keyword-market-analyzer/Makaytron-Etsy-Keyword-Market-Analyzer.user.js
// @downloadURL  https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-keyword-market-analyzer/Makaytron-Etsy-Keyword-Market-Analyzer.user.js
// @match        https://www.etsy.com/your/shops/*/marketplace-insights*
// @icon         https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/assets/makaytron-logo.png
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM.addValueChangeListener
// @grant        GM.xmlHttpRequest
// @grant        GM.openInTab
// @grant        GM.info
// @grant        GM_registerMenuCommand
// @connect      raw.githubusercontent.com
// @connect      sjwibgcflufmzaorlwqe.supabase.co
// @noframes
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const APP_VERSION = '1.0.1';
    const TELEMETRY_ENDPOINT = 'https://sjwibgcflufmzaorlwqe.supabase.co/functions/v1/telemetry-ingest';
    const TELEMETRY_HEADER_NAME = 'x-makaytron-telemetry';
    const TELEMETRY_HEADER_VALUE = '1';
    const TELEMETRY_SCRIPT_ID = 'etsy-keyword-market-analyzer';
    const TELEMETRY_ALLOWED_EVENTS = new Set(['script_opened', 'keyword_research_completed']);
    const TELEMETRY_ALLOWED_ERROR_CODES = new Set(['selector_keyword_result_scope', 'selector_keyword_results', 'selector_keyword_navigation', 'runtime_research_capture', 'runtime_research_parse', 'runtime_research_queue', 'storage_research_state']);
    const TELEMETRY_PRIVACY_URL = 'https://github.com/Makaytron/Etsy-Automation-Tools/blob/main/PRIVACY.en.md';
    const TELEMETRY_STORAGE_PREFIX = `makaytron-telemetry:${TELEMETRY_SCRIPT_ID}:v1`;
    const TELEMETRY_KEYS = Object.freeze({
        installationId: `${TELEMETRY_STORAGE_PREFIX}:installation-id`,
        enabled: `${TELEMETRY_STORAGE_PREFIX}:enabled`,
        enablePending: `${TELEMETRY_STORAGE_PREFIX}:enable-pending`,
        consentOperation: `${TELEMETRY_STORAGE_PREFIX}:consent-operation`,
        noticeSeen: `${TELEMETRY_STORAGE_PREFIX}:notice-seen:error-codes-v1`,
        sentDays: `${TELEMETRY_STORAGE_PREFIX}:sent-days`,
    });
    const TELEMETRY_MISSING_VALUE = `${TELEMETRY_STORAGE_PREFIX}:missing`;
    const TELEMETRY_CONSENT_OPERATION_TTL_MS = 30_000;
    const TELEMETRY_SENT_DAYS_OWNER_KEY = '__installationId';
    const TELEMETRY_SENT_DAYS_LOCK_NAME = `${TELEMETRY_STORAGE_PREFIX}:sent-days-operation`;
    const TELEMETRY_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const telemetryPendingEvents = new Set();
    const telemetryRequests = new Set();
    let telemetrySentDaysWriteChain = Promise.resolve(false);
    let telemetryOperationChain = Promise.resolve(false);
    let telemetryInstallationPromise = null;
    let telemetryInstallationListenerPromise = null;
    let telemetryInstallationListenerReady = false;
    let telemetryInstallationChangeChain = Promise.resolve(false);
    let telemetryRemoteSentDaysRevision = 0;
    let telemetryLatestRemoteSentDays = null;
    let telemetryBlockedInSession = false;
    let telemetryMenuRegistered = false;

    async function telemetryReadValue(key, fallback) {
        try {
            if (typeof GM !== 'undefined' && typeof GM.getValue === 'function') return { ok: true, value: await GM.getValue(key, fallback) };
            if (typeof GM_getValue === 'function') return { ok: true, value: GM_getValue(key, fallback) };
        } catch { return { ok: false, value: fallback }; }
        return { ok: false, value: fallback };
    }

    async function telemetryGetValue(key, fallback) {
        return (await telemetryReadValue(key, fallback)).value;
    }

    async function telemetrySetValue(key, value) {
        try {
            if (typeof GM !== 'undefined' && typeof GM.setValue === 'function') await GM.setValue(key, value);
            else if (typeof GM_setValue === 'function') GM_setValue(key, value);
            else return false;
            return true;
        } catch { return false; }
    }

    async function telemetryDeleteValue(key) {
        try {
            if (typeof GM !== 'undefined' && typeof GM.deleteValue === 'function') await GM.deleteValue(key);
            else if (typeof GM_deleteValue === 'function') GM_deleteValue(key);
            else return telemetrySetValue(key, null);
            return true;
        } catch { return false; }
    }

    function telemetrySuppressed() {
        return navigator.webdriver === true
            || navigator.doNotTrack === '1'
            || globalThis.doNotTrack === '1'
            || navigator.globalPrivacyControl === true;
    }

    function telemetryUuid() {
        if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
        const bytes = new Uint8Array(16);
        if (typeof globalThis.crypto?.getRandomValues === 'function') globalThis.crypto.getRandomValues(bytes);
        else return '';
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = [...bytes].map(value => value.toString(16).padStart(2, '0'));
        return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
    }

    function telemetryWebLocksAvailable() {
        const locks = typeof navigator !== 'undefined' ? navigator.locks : null;
        return !!locks && typeof locks.request === 'function';
    }

    function withTelemetrySentDaysLock(operation) {
        const locks = typeof navigator !== 'undefined' ? navigator.locks : null;
        if (locks && typeof locks.request === 'function') {
            return locks.request(
                TELEMETRY_SENT_DAYS_LOCK_NAME,
                { mode: 'exclusive' },
                () => operation(true),
            );
        }
        return Promise.resolve(false);
    }

    async function telemetryDeleteAndConfirmMissing(key) {
        await telemetryDeleteValue(key);
        const readback = await telemetryReadValue(key, TELEMETRY_MISSING_VALUE);
        const cleared = readback.ok && readback.value === TELEMETRY_MISSING_VALUE;
        if (!cleared) telemetryBlockedInSession = true;
        return cleared;
    }

    async function clearTelemetrySentDaysForInstallationLocked(installationId) {
        const remoteRevisionBefore = telemetryRemoteSentDaysRevision;
        const read = await telemetryReadValue(TELEMETRY_KEYS.sentDays, TELEMETRY_MISSING_VALUE);
        if (!read.ok) { telemetryBlockedInSession = true; return false; }
        if (read.value === TELEMETRY_MISSING_VALUE) return true;
        const stored = read.value && typeof read.value === 'object' && !Array.isArray(read.value) ? read.value : null;
        const owner = stored?.[TELEMETRY_SENT_DAYS_OWNER_KEY];
        if (typeof owner === 'string' && TELEMETRY_UUID_PATTERN.test(owner) && owner !== installationId) return true;
        const cleared = await telemetryDeleteAndConfirmMissing(TELEMETRY_KEYS.sentDays);
        const remoteValue = telemetryLatestRemoteSentDays;
        const remoteOwner = remoteValue?.[TELEMETRY_SENT_DAYS_OWNER_KEY];
        if (telemetryRemoteSentDaysRevision !== remoteRevisionBefore
            && typeof remoteOwner === 'string' && TELEMETRY_UUID_PATTERN.test(remoteOwner)
            && remoteOwner !== installationId) {
            await telemetrySetValue(TELEMETRY_KEYS.sentDays, remoteValue);
            const restored = await telemetryReadValue(TELEMETRY_KEYS.sentDays, null);
            const preserved = restored.ok
                && restored.value?.[TELEMETRY_SENT_DAYS_OWNER_KEY] === remoteOwner;
            if (!preserved) telemetryBlockedInSession = true;
            return preserved;
        }
        return cleared;
    }

    function clearTelemetrySentDaysForInstallation(installationId) {
        return withTelemetrySentDaysLock(
            () => clearTelemetrySentDaysForInstallationLocked(installationId),
            { destructive: true },
        );
    }

    async function reconcileReplacedTelemetryInstallation(oldInstallationId) {
        const [deleted, sentDaysCleared] = await Promise.all([
            telemetryDeleteInstallation(oldInstallationId),
            clearTelemetrySentDaysForInstallation(oldInstallationId),
        ]);
        if (!deleted || !sentDaysCleared) telemetryBlockedInSession = true;
        return deleted && sentDaysCleared;
    }

    function queueTelemetryInstallationReconciliation(oldValue, newValue, remote) {
        if (remote !== true
            || typeof oldValue !== 'string'
            || !TELEMETRY_UUID_PATTERN.test(oldValue)
            || oldValue === newValue) return;
        const cleanup = telemetryInstallationChangeChain.then(
            () => reconcileReplacedTelemetryInstallation(oldValue),
            () => reconcileReplacedTelemetryInstallation(oldValue),
        );
        telemetryInstallationChangeChain = cleanup.catch(() => {
            telemetryBlockedInSession = true;
            return false;
        });
    }

    async function ensureTelemetryInstallationListener() {
        if (telemetryInstallationListenerReady) return true;
        if (telemetryInstallationListenerPromise) return telemetryInstallationListenerPromise;
        const pending = (async () => {
            try {
                const modern = typeof GM !== 'undefined' && typeof GM.addValueChangeListener === 'function'
                    ? GM.addValueChangeListener.bind(GM)
                    : null;
                const legacy = typeof GM_addValueChangeListener === 'function' ? GM_addValueChangeListener : null;
                const register = modern || legacy;
                if (!register) return false;
                const installationListenerId = await register(
                    TELEMETRY_KEYS.installationId,
                    (_key, oldValue, newValue, remote) => queueTelemetryInstallationReconciliation(oldValue, newValue, remote),
                );
                const sentDaysListenerId = await register(
                    TELEMETRY_KEYS.sentDays,
                    (_key, _oldValue, newValue, remote) => {
                        if (remote !== true) return;
                        telemetryRemoteSentDaysRevision += 1;
                        telemetryLatestRemoteSentDays = newValue && typeof newValue === 'object' && !Array.isArray(newValue)
                            ? { ...newValue } : null;
                    },
                );
                telemetryInstallationListenerReady = installationListenerId !== undefined && installationListenerId !== null
                    && sentDaysListenerId !== undefined && sentDaysListenerId !== null;
                return telemetryInstallationListenerReady;
            } catch { return false; }
        })();
        telemetryInstallationListenerPromise = pending;
        try { return await pending; }
        finally { if (telemetryInstallationListenerPromise === pending) telemetryInstallationListenerPromise = null; }
    }

    function normalizeTelemetryConsentOperation(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const token = typeof value.token === 'string' ? value.token : '';
        const intent = value.intent === 'enable' || value.intent === 'disable' ? value.intent : '';
        const startedAt = Number(value.startedAt);
        return token && intent && Number.isFinite(startedAt) ? { token, intent, startedAt } : null;
    }

    function telemetryConsentOperationActive(operation) {
        const age = Date.now() - Number(operation?.startedAt);
        return !!operation && age >= -5_000 && age < TELEMETRY_CONSENT_OPERATION_TTL_MS;
    }

    function telemetryConsentOperationToken() {
        const uuid = telemetryUuid();
        return TELEMETRY_UUID_PATTERN.test(uuid)
            ? uuid
            : `op-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
    }

    async function telemetryConsentIdle() {
        const read = await telemetryReadValue(TELEMETRY_KEYS.consentOperation, TELEMETRY_MISSING_VALUE);
        if (!read.ok) { telemetryBlockedInSession = true; return false; }
        if (read.value === TELEMETRY_MISSING_VALUE) return true;
        const operation = normalizeTelemetryConsentOperation(read.value);
        if (!operation) { telemetryBlockedInSession = true; return false; }
        return !telemetryConsentOperationActive(operation);
    }

    async function beginTelemetryConsentOperation(intent) {
        const existingRead = await telemetryReadValue(TELEMETRY_KEYS.consentOperation, TELEMETRY_MISSING_VALUE);
        if (!existingRead.ok) { telemetryBlockedInSession = true; return ''; }
        if (existingRead.value !== TELEMETRY_MISSING_VALUE) {
            const existing = normalizeTelemetryConsentOperation(existingRead.value);
            if (!existing || telemetryConsentOperationActive(existing)) return '';
        }
        const operation = { token: telemetryConsentOperationToken(), intent, startedAt: Date.now() };
        await telemetrySetValue(TELEMETRY_KEYS.consentOperation, operation);
        let verified = await telemetryReadValue(TELEMETRY_KEYS.consentOperation, null);
        if (!verified.ok || normalizeTelemetryConsentOperation(verified.value)?.token !== operation.token) return '';
        await new Promise((resolve) => setTimeout(resolve, 0));
        verified = await telemetryReadValue(TELEMETRY_KEYS.consentOperation, null);
        return verified.ok && normalizeTelemetryConsentOperation(verified.value)?.token === operation.token
            ? operation.token : '';
    }

    async function telemetryConsentOperationOwned(token, intent) {
        const read = await telemetryReadValue(TELEMETRY_KEYS.consentOperation, null);
        const operation = read.ok ? normalizeTelemetryConsentOperation(read.value) : null;
        return !!operation && operation.token === token && operation.intent === intent
            && telemetryConsentOperationActive(operation);
    }

    async function releaseTelemetryConsentOperation(token, intent) {
        if (!await telemetryConsentOperationOwned(token, intent)) return false;
        await telemetryDeleteValue(TELEMETRY_KEYS.consentOperation);
        const readback = await telemetryReadValue(TELEMETRY_KEYS.consentOperation, TELEMETRY_MISSING_VALUE);
        const released = readback.ok && readback.value === TELEMETRY_MISSING_VALUE;
        if (!released) telemetryBlockedInSession = true;
        return released;
    }

    async function telemetryInstallationId() {
        if (telemetryInstallationPromise) return telemetryInstallationPromise;
        const pending = (async () => {
            const listenerReady = await ensureTelemetryInstallationListener();
            const storedRead = await telemetryReadValue(TELEMETRY_KEYS.installationId, '');
            if (!storedRead.ok) return '';
            const stored = storedRead.value;
            if (typeof stored === 'string' && TELEMETRY_UUID_PATTERN.test(stored)) return stored;
            if (!listenerReady && !telemetryWebLocksAvailable()) return '';
            const created = telemetryUuid();
            if (!TELEMETRY_UUID_PATTERN.test(created) || !await telemetrySetValue(TELEMETRY_KEYS.installationId, created)) return '';
            const verifiedRead = await telemetryReadValue(TELEMETRY_KEYS.installationId, '');
            return verifiedRead.ok && typeof verifiedRead.value === 'string' && TELEMETRY_UUID_PATTERN.test(verifiedRead.value)
                ? verifiedRead.value : '';
        })();
        telemetryInstallationPromise = pending;
        try { return await pending; }
        finally { if (telemetryInstallationPromise === pending) telemetryInstallationPromise = null; }
    }

    function sendTelemetry(method, payload) {
        return new Promise(resolve => {
            const modernRequest = typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function'
                ? GM.xmlHttpRequest.bind(GM)
                : null;
            const request = modernRequest || (typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null);
            if (!request) { resolve(false); return; }
            let settled = false;
            const finish = value => {
                if (settled) return;
                settled = true;
                resolve(Boolean(value));
            };
            const options = {
                method,
                url: TELEMETRY_ENDPOINT,
                headers: {
                    'Content-Type': 'application/json',
                    [TELEMETRY_HEADER_NAME]: TELEMETRY_HEADER_VALUE,
                },
                data: JSON.stringify(payload),
                anonymous: true,
                timeout: 8000,
                onload: response => finish(Number(response?.status) === 202),
                onerror: () => finish(false),
                onabort: () => finish(false),
                ontimeout: () => finish(false),
            };
            try {
                const pending = request(options);
                if (pending && typeof pending.then === 'function') {
                    pending.then(response => finish(Number(response?.status) === 202)).catch(() => finish(false));
                }
            } catch { finish(false); }
        });
    }

    function dispatchTelemetry(method, payload) {
        const request = sendTelemetry(method, payload);
        telemetryRequests.add(request);
        void request.finally(() => telemetryRequests.delete(request));
        return request;
    }

    function withTelemetryOperationLock(callback) {
        const run = () => {
            const locks = typeof navigator !== 'undefined' ? navigator.locks : null;
            return locks && typeof locks.request === 'function'
                ? locks.request(`${TELEMETRY_STORAGE_PREFIX}:operation`, { mode: 'exclusive' }, callback)
                : callback();
        };
        const operation = telemetryOperationChain.then(run, run);
        telemetryOperationChain = operation.catch(() => false);
        return operation;
    }

    function telemetryDeleteInstallation(installationId) {
        if (typeof installationId !== 'string' || !TELEMETRY_UUID_PATTERN.test(installationId)) return Promise.resolve(false);
        return dispatchTelemetry('DELETE', {
            schema: 1,
            installation_id: installationId,
            script_id: TELEMETRY_SCRIPT_ID,
            app_version: APP_VERSION,
        });
    }

    async function compensateTelemetryInstallation(installationId) {
        telemetryBlockedInSession = true;
        return telemetryDeleteInstallation(installationId);
    }

    async function telemetrySignalStillEnabled(installationId) {
        if (telemetryBlockedInSession) return false;
        if (!await telemetryConsentIdle()) return false;
        const enabledRead = await telemetryReadValue(TELEMETRY_KEYS.enabled, true);
        if (!enabledRead.ok || enabledRead.value !== true || telemetryBlockedInSession) return false;
        const pendingRead = await telemetryReadValue(TELEMETRY_KEYS.enablePending, TELEMETRY_MISSING_VALUE);
        if (!pendingRead.ok || pendingRead.value !== TELEMETRY_MISSING_VALUE || telemetryBlockedInSession) return false;
        const installationRead = await telemetryReadValue(TELEMETRY_KEYS.installationId, '');
        return installationRead.ok && installationRead.value === installationId && !telemetryBlockedInSession;
    }

    function markTelemetrySignalSent(signalKey, utcDay, installationId) {
        const write = telemetrySentDaysWriteChain.then(() => withTelemetrySentDaysLock(async (lockHeld) => {
            const failClosed = async (clearSentDays = false) => {
                if (clearSentDays && lockHeld) {
                    await clearTelemetrySentDaysForInstallationLocked(installationId);
                }
                await compensateTelemetryInstallation(installationId);
                return false;
            };
            if (!await telemetrySignalStillEnabled(installationId)) return failClosed();
            const storedDaysRead = await telemetryReadValue(TELEMETRY_KEYS.sentDays, {});
            if (!storedDaysRead.ok) return failClosed();
            const storedDays = storedDaysRead.value;
            const sentDays = storedDays && typeof storedDays === 'object' && !Array.isArray(storedDays)
                && storedDays[TELEMETRY_SENT_DAYS_OWNER_KEY] === installationId ? storedDays : {};
            if (!await telemetrySetValue(TELEMETRY_KEYS.sentDays, {
                ...sentDays,
                [TELEMETRY_SENT_DAYS_OWNER_KEY]: installationId,
                [signalKey]: utcDay,
            })) return failClosed(true);
            if (await telemetrySignalStillEnabled(installationId)) return true;
            return failClosed(true);
        }));
        telemetrySentDaysWriteChain = write.catch(() => false);
        return write;
    }

    async function trackTelemetry(eventName) {
        if (!TELEMETRY_ALLOWED_EVENTS.has(eventName) || telemetrySuppressed() || !telemetryWebLocksAvailable()) return false;
        return withTelemetryOperationLock(async () => {
            if (telemetryBlockedInSession || telemetryPendingEvents.has(eventName)) return false;
            telemetryPendingEvents.add(eventName);
            try {
                const enabledRead = await telemetryReadValue(TELEMETRY_KEYS.enabled, true);
                if (!enabledRead.ok || enabledRead.value !== true || telemetryBlockedInSession) return false;
                if (!await telemetryConsentIdle()) return false;
                const pendingRead = await telemetryReadValue(TELEMETRY_KEYS.enablePending, TELEMETRY_MISSING_VALUE);
                if (!pendingRead.ok || pendingRead.value !== TELEMETRY_MISSING_VALUE || telemetryBlockedInSession) return false;
                const installationId = await telemetryInstallationId();
                if (!installationId || telemetryBlockedInSession) return false;
                const utcDay = new Date().toISOString().slice(0, 10);
                const storedDaysRead = await telemetryReadValue(TELEMETRY_KEYS.sentDays, {});
                if (!storedDaysRead.ok) return false;
                const storedDays = storedDaysRead.value;
                const sentDays = storedDays && typeof storedDays === 'object' && !Array.isArray(storedDays)
                    && storedDays[TELEMETRY_SENT_DAYS_OWNER_KEY] === installationId ? storedDays : {};
                if (sentDays[eventName] === utcDay) return false;
                if (telemetryBlockedInSession) return false;
                const accepted = await dispatchTelemetry('POST', {
                    schema: 1,
                    installation_id: installationId,
                    script_id: TELEMETRY_SCRIPT_ID,
                    event_name: eventName,
                    app_version: APP_VERSION,
                });
                if (!accepted) return false;
                if (!await telemetrySignalStillEnabled(installationId)) {
                    await compensateTelemetryInstallation(installationId);
                    return false;
                }
                return markTelemetrySignalSent(eventName, utcDay, installationId);
            } catch { return false; }
            finally { telemetryPendingEvents.delete(eventName); }
        });
    }

    async function trackTelemetryError(errorCode) {
        if (!TELEMETRY_ALLOWED_ERROR_CODES.has(errorCode) || telemetrySuppressed() || !telemetryWebLocksAvailable()) return false;
        const signalKey = `error:${errorCode}`;
        return withTelemetryOperationLock(async () => {
            if (telemetryBlockedInSession || telemetryPendingEvents.has(signalKey)) return false;
            telemetryPendingEvents.add(signalKey);
            try {
                const enabledRead = await telemetryReadValue(TELEMETRY_KEYS.enabled, true);
                if (!enabledRead.ok || enabledRead.value !== true || telemetryBlockedInSession) return false;
                if (!await telemetryConsentIdle()) return false;
                const pendingRead = await telemetryReadValue(TELEMETRY_KEYS.enablePending, TELEMETRY_MISSING_VALUE);
                if (!pendingRead.ok || pendingRead.value !== TELEMETRY_MISSING_VALUE || telemetryBlockedInSession) return false;
                const installationId = await telemetryInstallationId();
                if (!installationId || telemetryBlockedInSession) return false;
                const utcDay = new Date().toISOString().slice(0, 10);
                const storedDaysRead = await telemetryReadValue(TELEMETRY_KEYS.sentDays, {});
                if (!storedDaysRead.ok) return false;
                const storedDays = storedDaysRead.value;
                const sentDays = storedDays && typeof storedDays === 'object' && !Array.isArray(storedDays)
                    && storedDays[TELEMETRY_SENT_DAYS_OWNER_KEY] === installationId ? storedDays : {};
                if (sentDays[signalKey] === utcDay || telemetryBlockedInSession) return false;
                const accepted = await dispatchTelemetry('POST', {
                    schema: 1,
                    installation_id: installationId,
                    script_id: TELEMETRY_SCRIPT_ID,
                    error_code: errorCode,
                    app_version: APP_VERSION,
                });
                if (!accepted) return false;
                if (!await telemetrySignalStillEnabled(installationId)) {
                    await compensateTelemetryInstallation(installationId);
                    return false;
                }
                return markTelemetrySignalSent(signalKey, utcDay, installationId);
            } catch { return false; }
            finally { telemetryPendingEvents.delete(signalKey); }
        });
    }

    async function disableTelemetryAndDelete() {
        return withTelemetryOperationLock(async () => {
            telemetryBlockedInSession = true;
            const consentToken = await beginTelemetryConsentOperation('disable');
            if (!consentToken) return { disabled: false, deleted: false };
            let outcome = { disabled: false, deleted: false };
            try {
                outcome = await (async () => {
                    const settingSaved = await telemetrySetValue(TELEMETRY_KEYS.enabled, false);
                    const settingRead = settingSaved
                        ? await telemetryReadValue(TELEMETRY_KEYS.enabled, true)
                        : { ok: false, value: true };
                    if (!settingRead.ok || settingRead.value !== false) return { disabled: false, deleted: false };
                    if (!await telemetryConsentOperationOwned(consentToken, 'disable')) return { disabled: false, deleted: false };
                    await Promise.allSettled([...telemetryRequests]);
                    await telemetrySentDaysWriteChain.catch(() => false);
                    const installationRead = await telemetryReadValue(TELEMETRY_KEYS.installationId, '');
                    if (!installationRead.ok) return { disabled: true, deleted: false };
                    if (!await telemetryConsentOperationOwned(consentToken, 'disable')) return { disabled: false, deleted: false };
                    const installationId = installationRead.value;
                    let deleted = true;
                    if (typeof installationId === 'string' && TELEMETRY_UUID_PATTERN.test(installationId)) {
                        deleted = await dispatchTelemetry('DELETE', {
                            schema: 1,
                            installation_id: installationId,
                            script_id: TELEMETRY_SCRIPT_ID,
                            app_version: APP_VERSION,
                        });
                    }
                    if (!await telemetryConsentOperationOwned(consentToken, 'disable')) return { disabled: false, deleted: false };
                    if (deleted) {
                        const sentDaysCleared = await withTelemetrySentDaysLock(
                            () => telemetryDeleteAndConfirmMissing(TELEMETRY_KEYS.sentDays),
                            { destructive: true },
                        );
                        if (!sentDaysCleared) return { disabled: true, deleted: false };
                        const installationCleared = await telemetryDeleteAndConfirmMissing(TELEMETRY_KEYS.installationId);
                        const pendingCleared = await telemetryDeleteAndConfirmMissing(TELEMETRY_KEYS.enablePending);
                        return { disabled: true, deleted: installationCleared && sentDaysCleared && pendingCleared };
                    }
                    return { disabled: true, deleted: false };
                })();
            } finally {
                const released = await releaseTelemetryConsentOperation(consentToken, 'disable');
                if (!released && outcome.disabled) outcome = { disabled: false, deleted: false };
            }
            return outcome;
        });
    }

    async function enableTelemetry() {
        if (!telemetryWebLocksAvailable()) {
            telemetryBlockedInSession = true;
            return false;
        }
        return withTelemetryOperationLock(async () => {
            telemetryBlockedInSession = true;
            const consentToken = await beginTelemetryConsentOperation('enable');
            if (!consentToken) return false;
            let enabled = false;
            try {
                const installationId = await telemetryInstallationId();
                if (!installationId || !await telemetryConsentOperationOwned(consentToken, 'enable')) return false;

                await telemetrySetValue(TELEMETRY_KEYS.enablePending, installationId);
                let pendingRead = await telemetryReadValue(TELEMETRY_KEYS.enablePending, TELEMETRY_MISSING_VALUE);
                if (!pendingRead.ok || pendingRead.value !== installationId) {
                    pendingRead = await telemetryReadValue(TELEMETRY_KEYS.enablePending, TELEMETRY_MISSING_VALUE);
                    if (!pendingRead.ok || pendingRead.value !== installationId) return false;
                }
                if (!await telemetryConsentOperationOwned(consentToken, 'enable')) return false;

                await telemetrySetValue(TELEMETRY_KEYS.enabled, true);
                let settingRead = await telemetryReadValue(TELEMETRY_KEYS.enabled, false);
                if (!settingRead.ok || settingRead.value !== true) {
                    settingRead = await telemetryReadValue(TELEMETRY_KEYS.enabled, false);
                }
                let installationRead = await telemetryReadValue(TELEMETRY_KEYS.installationId, '');
                if (!installationRead.ok || installationRead.value !== installationId) {
                    installationRead = await telemetryReadValue(TELEMETRY_KEYS.installationId, '');
                }
                if (settingRead.ok && settingRead.value === true
                    && installationRead.ok && installationRead.value === installationId
                    && await telemetryConsentOperationOwned(consentToken, 'enable')) {
                    if (!await telemetryDeleteAndConfirmMissing(TELEMETRY_KEYS.enablePending)) return false;
                    enabled = true;
                } else if (await telemetryConsentOperationOwned(consentToken, 'enable')) {
                    await telemetrySetValue(TELEMETRY_KEYS.enabled, false);
                    let rollbackRead = await telemetryReadValue(TELEMETRY_KEYS.enabled, true);
                    if (!rollbackRead.ok || rollbackRead.value !== false) {
                        rollbackRead = await telemetryReadValue(TELEMETRY_KEYS.enabled, true);
                    }
                    if (rollbackRead.ok && rollbackRead.value === false) {
                        await telemetryDeleteAndConfirmMissing(TELEMETRY_KEYS.enablePending);
                    }
                }
            } finally {
                const released = await releaseTelemetryConsentOperation(consentToken, 'enable');
                if (!released) enabled = false;
                telemetryBlockedInSession = !enabled;
            }
            return enabled;
        });
    }

    async function showTelemetryFirstRunNotice() {
        const noticeId = `makaytron-telemetry-notice-${TELEMETRY_SCRIPT_ID}`;
        if (!document.documentElement || document.getElementById(noticeId)) return;
        const enabledRead = await telemetryReadValue(TELEMETRY_KEYS.enabled, true);
        if (!enabledRead.ok) { telemetryBlockedInSession = true; return; }
        if (enabledRead.value !== true) return;
        if (!await telemetryConsentIdle()) return;
        const pendingRead = await telemetryReadValue(TELEMETRY_KEYS.enablePending, TELEMETRY_MISSING_VALUE);
        if (!pendingRead.ok || pendingRead.value !== TELEMETRY_MISSING_VALUE) { telemetryBlockedInSession = true; return; }
        const noticeSeenRead = await telemetryReadValue(TELEMETRY_KEYS.noticeSeen, false);
        if (!noticeSeenRead.ok) { telemetryBlockedInSession = true; return; }
        if (noticeSeenRead.value === true) return;
        const notice = document.createElement('aside');
        notice.id = noticeId;
        notice.setAttribute('role', 'status');
        notice.style.cssText = 'all:initial;position:fixed;left:16px;bottom:16px;z-index:2147483647;box-sizing:border-box;width:min(380px,calc(100vw - 32px));padding:14px;border:1px solid #d6d6d6;border-radius:10px;background:#fff;color:#202020;box-shadow:0 16px 42px rgba(0,0,0,.2);font:13px/1.45 Inter,system-ui,sans-serif';
        notice.innerHTML = `<strong style="display:block;margin-bottom:5px;font-size:14px">Privacy-preserving usage metrics</strong><span data-message style="display:block;color:#525252">Usage metrics are enabled by default. Only the script ID, version, a random installation ID, allowlisted open/success signals, and fixed error codes are sent. No raw error text or Etsy content is collected.</span><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:11px"><a href="${TELEMETRY_PRIVACY_URL}" target="_blank" rel="noopener noreferrer" style="align-self:center;color:#303030;font-weight:650">Privacy</a><button type="button" data-disable style="margin-left:auto;padding:7px 9px;border:1px solid #d8a8a8;border-radius:7px;background:#fff;color:#991b1b;font:650 11px/1.2 system-ui;cursor:pointer">Disable &amp; delete</button><button type="button" data-close style="padding:7px 10px;border:1px solid #202020;border-radius:7px;background:#202020;color:#fff;font:650 11px/1.2 system-ui;cursor:pointer">Got it</button></div>`;
        document.documentElement.appendChild(notice);
        const noticeSaved = await telemetrySetValue(TELEMETRY_KEYS.noticeSeen, true);
        const noticeVerified = noticeSaved
            ? await telemetryReadValue(TELEMETRY_KEYS.noticeSeen, false)
            : { ok: false, value: false };
        if (!noticeVerified.ok || noticeVerified.value !== true) telemetryBlockedInSession = true;
        notice.querySelector('[data-close]')?.addEventListener('click', () => notice.remove());
        notice.querySelector('[data-disable]')?.addEventListener('click', async event => {
            const button = event.currentTarget;
            button.disabled = true;
            const result = await disableTelemetryAndDelete();
            const message = notice.querySelector('[data-message]');
            if (message) message.textContent = !result.disabled
                ? 'Usage metrics could not be disabled because the setting was not saved. Metrics remain blocked in this tab; retry from the userscript menu.'
                : result.deleted
                    ? 'Usage metrics are disabled and server data was deleted.'
                    : 'Usage metrics are disabled, but cleanup could not be completed; retry from the userscript menu.';
            button.disabled = false;
        });
    }

    async function openTelemetrySettings() {
        const modalId = `makaytron-telemetry-settings-${TELEMETRY_SCRIPT_ID}`;
        if (!document.documentElement || document.getElementById(modalId)) return;
        const modal = document.createElement('div');
        modal.id = modalId;
        modal.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.42);font:13px/1.45 Inter,system-ui,sans-serif';
        modal.innerHTML = `<section role="dialog" aria-modal="true" aria-label="Usage metrics settings" style="box-sizing:border-box;width:min(440px,100%);padding:18px;border:1px solid #d6d6d6;border-radius:12px;background:#fff;color:#202020;box-shadow:0 20px 60px rgba(0,0,0,.28)"><h2 style="margin:0 0 7px;font-size:17px">Privacy-preserving usage metrics</h2><p data-state style="margin:0;color:#525252"></p><p data-result style="min-height:20px;margin:9px 0 0;color:#525252"></p><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px"><a href="${TELEMETRY_PRIVACY_URL}" target="_blank" rel="noopener noreferrer" style="align-self:center;color:#303030;font-weight:650">Privacy policy</a><button type="button" data-enable style="margin-left:auto;padding:8px 10px;border:1px solid #b8b8b8;border-radius:7px;background:#fff;color:#202020;font:650 12px/1.2 system-ui;cursor:pointer">Enable</button><button type="button" data-disable style="padding:8px 10px;border:1px solid #d8a8a8;border-radius:7px;background:#fff;color:#991b1b;font:650 12px/1.2 system-ui;cursor:pointer">Disable &amp; delete server data</button><button type="button" data-close style="padding:8px 10px;border:1px solid #202020;border-radius:7px;background:#202020;color:#fff;font:650 12px/1.2 system-ui;cursor:pointer">Close</button></div></section>`;
        document.documentElement.appendChild(modal);
        const renderState = async result => {
            const enabledRead = await telemetryReadValue(TELEMETRY_KEYS.enabled, true);
            const pendingRead = await telemetryReadValue(TELEMETRY_KEYS.enablePending, TELEMETRY_MISSING_VALUE);
            const consentIdle = await telemetryConsentIdle();
            if (!enabledRead.ok || !pendingRead.ok) telemetryBlockedInSession = true;
            const enabledState = !enabledRead.ok || !pendingRead.ok || !consentIdle
                || pendingRead.value !== TELEMETRY_MISSING_VALUE
                || (enabledRead.value !== false && telemetryBlockedInSession)
                ? 'unavailable'
                : enabledRead.value === false ? 'disabled' : 'enabled';
            const state = modal.querySelector('[data-state]');
            const output = modal.querySelector('[data-result]');
            const enableButton = modal.querySelector('[data-enable]');
            if (state) state.textContent = enabledState === 'enabled'
                ? 'Status: enabled. Allowlisted open/success signals and fixed error codes only; no raw error text or Etsy content is collected.'
                : enabledState === 'disabled'
                    ? 'Status: disabled.'
                    : 'Status: unavailable. Usage metrics remain blocked in this tab until the setting can be read and verified.';
            if (output) output.textContent = result || '';
            if (enableButton) enableButton.hidden = enabledState === 'enabled';
        };
        modal.querySelector('[data-close]')?.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', event => { if (event.target === modal) modal.remove(); });
        modal.querySelector('[data-enable]')?.addEventListener('click', async () => {
            await renderState(await enableTelemetry() ? 'Usage metrics enabled.' : 'The setting could not be saved.');
        });
        modal.querySelector('[data-disable]')?.addEventListener('click', async () => {
            const result = await disableTelemetryAndDelete();
            await renderState(!result.disabled
                ? 'Usage metrics could not be disabled because the setting was not saved. Metrics remain blocked in this tab; retry here.'
                : result.deleted
                    ? 'Usage metrics disabled; server data deleted.'
                    : 'Usage metrics are disabled, but cleanup could not be completed. You can retry here.');
        });
        await renderState('');
    }

    function telemetryPanelOpened() {
        if (telemetrySuppressed()) return;
        void showTelemetryFirstRunNotice()
            .then(() => trackTelemetry('script_opened'))
            .catch(() => {});
    }

    function registerTelemetryMenuCommand() {
        if (telemetryMenuRegistered) return;
        try {
            if (typeof GM !== 'undefined' && typeof GM.registerMenuCommand === 'function') GM.registerMenuCommand('Makaytron · Usage metrics settings', openTelemetrySettings);
            else if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('Makaytron · Usage metrics settings', openTelemetrySettings);
            else return;
            telemetryMenuRegistered = true;
        } catch {}
    }

    const APP = Object.freeze({
        name: 'Makaytron Etsy Keyword & Market Analyzer',
        shortName: 'Etsy Keyword & Market Analyzer',
        storagePrefix: 'ekma:v1',
    });
    const GITHUB_SCRIPT_PATH = 'scripts/etsy-keyword-market-analyzer/Makaytron-Etsy-Keyword-Market-Analyzer.user.js';
    const GITHUB_RAW_SCRIPT_URL = `https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/${GITHUB_SCRIPT_PATH}`;
    const MAKAYTRON_LOGO_URL = 'https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/assets/makaytron-logo.png';
    const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
    const UPDATE_CHECK_TIMEOUT_MS = 12 * 1000;
    const UPDATE_CHECK_STALE_MS = UPDATE_CHECK_TIMEOUT_MS * 2;

    const CHANNEL_NAME = 'makaytron:etsy-keyword-market-analyzer:v1';
    const ENVELOPE_SCHEMA = 'makaytron-etsy-keyword-market-analyzer-envelope/v1';
    const REQUEST_SCHEMA = 'makaytron-listing-research-request/v1';
    const RESULT_SCHEMA = 'makaytron-listing-research-result/v1';
    const MESSAGE_TYPES = Object.freeze([
        'PROBE',
        'CAPABILITIES',
        'RESEARCH_READY',
        'RESEARCH_REQUEST',
        'RESEARCH_ACK',
        'RESEARCH_RESULT',
        'RESEARCH_RECEIVED',
        'ERROR',
    ]);
    const MAX_MESSAGE_BYTES = 64 * 1024;
    const MESSAGE_TTL_MS = 10 * 60 * 1000;
    const MAX_MESSAGE_TTL_MS = 30 * 60 * 1000;
    const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
    const DOM_RESULT_TIMEOUT_MS = 30 * 1000;
    const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
    const MAX_SEED_KEYWORDS_DEFAULT = 1;
    const MAX_SEED_KEYWORDS_CAP = 3;
    const MAX_RELATED_KEYWORDS = 25;
    const MAX_KEYWORD_LENGTH = 80;
    const MAX_CACHE_ENTRIES = 80;
    const MAX_CAPTURE_ENTRIES = 100;
    const MAX_QUEUE_ENTRIES = 30;
    const MAX_EXPORT_BYTES = 2 * 1024 * 1024;
    const OBSERVER_DEBOUNCE_MS = 250;
    const SUPPORTED_ROUTE = /^\/your\/shops\/[^/]+\/marketplace-insights(?:\/search)?\/?$/;
    const QUEUE_TERMINAL_RETENTION_MS = 24 * 60 * 60 * 1000;
    const RESULT_HISTORY_TTL_MS = CACHE_TTL_MS;
    const MAX_RESULT_ENVELOPES = 30;
    const LEASE_SCHEMA = 'makaytron-keyword-market-analyzer-processor-lease/v1';
    const LEASE_TTL_MS = 5_000;
    const LEASE_RENEW_MS = 1_500;
    const LEASE_SETTLE_MS = 60;
    const TAB_PRESENCE_SETTLE_MS = 90;

    const KEYS = Object.freeze({
        queue: `${APP.storagePrefix}:research-queue`,
        cache: `${APP.storagePrefix}:research-cache`,
        captures: `${APP.storagePrefix}:captures`,
        settings: `${APP.storagePrefix}:settings`,
        update: `${APP.storagePrefix}:update-state`,
        lease: `${APP.storagePrefix}:processor-lease`,
        results: `${APP.storagePrefix}:result-envelopes`,
    });

    const CAPABILITIES = Object.freeze({
        version: APP_VERSION,
        standalone: true,
        maxSeedKeywords: MAX_SEED_KEYWORDS_CAP,
        maxRelatedKeywords: MAX_RELATED_KEYWORDS,
        cacheTtlDays: 7,
        networkAccess: false,
    });

    const TEXT_ALIASES = Object.freeze({
        searches: Object.freeze(['searches', 'aramalar']),
        searchResults: Object.freeze(['search results', 'arama sonuçları']),
        similarSearchTerms: Object.freeze(['similar search terms', 'benzer arama terimleri']),
        yourSearch: Object.freeze(['your search', 'aramanız']),
    });

    const I18N = Object.freeze({
        tr: Object.freeze({
            launcher: 'Etsy Keyword & Market Analyzer panelini aç',
            panelTitle: 'Etsy Keyword & Market Analyzer',
            keyword: 'Anahtar kelime',
            search: 'Etsy Insights’ta ara',
            capture: 'Bu sayfayı analiz et ve kaydet',
            export: 'JSON dışa aktar',
            researchJson: 'Listing Analyzer araştırma zarfı (JSON)',
            researchJsonHelp: 'Listing Analyzer yoksa tam RESEARCH_REQUEST zarfını buraya yapıştırın. Sonuç tam RESEARCH_RESULT zarfı olarak kopyalanabilir veya indirilebilir.',
            importRequest: 'Araştırma talebini içe aktar',
            copyResult: 'Sonuç zarfını kopyala',
            downloadResult: 'Sonuç zarfını indir',
            importAccepted: 'Araştırma talebi doğrulandı ve kuyruğa alındı: {requestId}',
            importDelegated: 'Araştırma talebi bu sekmeden işlemci sekmesine aktarıldı: {requestId}',
            importRejected: 'Araştırma zarfı reddedildi: {message}',
            resultCopied: 'Tam RESEARCH_RESULT zarfı panoya kopyalandı.',
            resultDownloaded: 'Tam RESEARCH_RESULT zarfı indirildi.',
            resultMissing: 'Dışa aktarılabilecek geçerli bir RESEARCH_RESULT zarfı yok.',
            clipboardError: 'Panoya erişilemedi; sonuç zarfı JSON alanına yazıldı.',
            cancel: 'Aktif araştırmayı iptal et',
            close: 'Kapat',
            saved: 'Kaydedilen araştırma',
            ready: 'Hazır. Etsy verileri yalnız açık sayfanın DOM yapısından okunur.',
            noResult: 'Bu sayfada tamamlanmış Marketplace Insights sonucu bulunamadı.',
            captured: 'Analiz kaydedildi.',
            invalidKeyword: 'Geçerli bir anahtar kelime yazın.',
            queueEmpty: 'İptal edilecek aktif araştırma yok.',
            queueCancelled: 'Aktif araştırma iptal edildi.',
            clearData: 'Yerel verileri temizle',
            clearDataConfirm: 'Kaydedilmiş araştırmalar, sonuç zarfları, 7 günlük cache ve araştırma kuyruğu silinsin mi? Dil tercihiniz korunur.',
            clearDataDone: 'Yerel araştırma verileri temizlendi. Dil tercihi korundu.',
            clearDataError: 'Yerel veriler doğrulanarak temizlenemedi.',
            researchProgress: 'Listing araştırması: seed {current}/{total} · {keyword}',
            researchSent: 'Araştırma sonucu Analyzer’a gönderildi: {count} anahtar kelime.',
            researchFailed: 'Araştırma tamamlanamadı: {message}',
            exportTooLarge: 'Dışa aktarma 2 MiB güvenlik sınırını aşıyor.',
            checkUpdate: 'Şimdi güncelleme denetle',
            checkingUpdate: 'Güncelleme denetleniyor…',
            updateCurrent: 'v{version} güncel.',
            updateAvailable: 'Yeni sürüm hazır: v{version}',
            updateError: 'Güncelleme denetlenemedi; ana analiz çalışmaya devam eder.',
            updateExternal: 'Kurulum kaynağınızın güncelleme mekanizması kullanılıyor.',
            installUpdate: 'Güncelleme sayfasını aç',
            installConfirm: 'Canonical Makaytron userscript kurulum sayfası açılsın mı? Son onay userscript yöneticinizde verilir.',
            updateBusy: 'Aktif araştırma varken güncelleme açılamaz.',
            installSource: 'Kurulum kaynağı',
            sourceGithub: 'Canonical GitHub',
            sourceExternal: 'Userscript yöneticisi / diğer',
            sourceUnknown: 'Bilinmiyor',
            searches30d: '30 günlük Etsy araması',
            searchResults: 'Etsy arama sonucu (rekabet göstergesi)',
            opportunity: 'Makaytron türetilmiş fırsat metriği',
            trend: '7 günlük değişim',
            searchesShort: 'Arama',
            resultsShort: 'Sonuç',
            opportunityShort: 'Fırsat',
            trendShort: 'Trend',
            capturedAt: 'Yakalama',
            low: 'Düşük',
            medium: 'Orta',
            high: 'Yüksek',
        }),
        en: Object.freeze({
            launcher: 'Open Etsy Keyword & Market Analyzer',
            panelTitle: 'Etsy Keyword & Market Analyzer',
            keyword: 'Keyword',
            search: 'Search in Etsy Insights',
            capture: 'Analyze and save this page',
            export: 'Export JSON',
            researchJson: 'Listing Analyzer research envelope (JSON)',
            researchJsonHelp: 'When Listing Analyzer is unavailable, paste a complete RESEARCH_REQUEST envelope here. The complete RESEARCH_RESULT envelope can be copied or downloaded.',
            importRequest: 'Import research request',
            copyResult: 'Copy result envelope',
            downloadResult: 'Download result envelope',
            importAccepted: 'Research request validated and queued: {requestId}',
            importDelegated: 'Research request relayed from this tab to the processor tab: {requestId}',
            importRejected: 'Research envelope rejected: {message}',
            resultCopied: 'Complete RESEARCH_RESULT envelope copied to the clipboard.',
            resultDownloaded: 'Complete RESEARCH_RESULT envelope downloaded.',
            resultMissing: 'There is no valid RESEARCH_RESULT envelope to export.',
            clipboardError: 'Clipboard access failed; the result envelope was written into the JSON field.',
            cancel: 'Cancel active research',
            close: 'Close',
            saved: 'Saved research',
            ready: 'Ready. Etsy data is read only from the open page DOM.',
            noResult: 'No completed Marketplace Insights result was found on this page.',
            captured: 'Analysis saved.',
            invalidKeyword: 'Enter a valid keyword.',
            queueEmpty: 'There is no active research to cancel.',
            queueCancelled: 'Active research cancelled.',
            clearData: 'Clear local data',
            clearDataConfirm: 'Delete saved research, result envelopes, the seven-day cache, and research queue? Your language preference is preserved.',
            clearDataDone: 'Local research data cleared. Language preference was preserved.',
            clearDataError: 'Local data could not be cleared and verified.',
            researchProgress: 'Listing research: seed {current}/{total} · {keyword}',
            researchSent: 'Research result sent to Analyzer: {count} keywords.',
            researchFailed: 'Research could not be completed: {message}',
            exportTooLarge: 'Export exceeds the 2 MiB safety limit.',
            checkUpdate: 'Check for updates now',
            checkingUpdate: 'Checking for updates…',
            updateCurrent: 'v{version} is current.',
            updateAvailable: 'New version available: v{version}',
            updateError: 'Update check failed; core analysis remains available.',
            updateExternal: 'Your installation source manages updates.',
            installUpdate: 'Open update page',
            installConfirm: 'Open the canonical Makaytron userscript installation page? Your userscript manager owns the final confirmation.',
            updateBusy: 'An update cannot be opened while research is active.',
            installSource: 'Installation source',
            sourceGithub: 'Canonical GitHub',
            sourceExternal: 'Userscript manager / other',
            sourceUnknown: 'Unknown',
            searches30d: 'Etsy searches over 30 days',
            searchResults: 'Etsy search results (competition indicator)',
            opportunity: 'Makaytron-derived opportunity metric',
            trend: '7-day change',
            searchesShort: 'Search',
            resultsShort: 'Results',
            opportunityShort: 'Score',
            trendShort: 'Trend',
            capturedAt: 'Captured',
            low: 'Low',
            medium: 'Medium',
            high: 'High',
        }),
    });

    const Runtime = {
        channel: null,
        processing: false,
        observer: null,
        observerTimer: 0,
        ui: null,
        tabId: '',
        pageInstanceId: `ekma-page:${Date.now()}:${randomToken(8)}`,
        identityReady: null,
        presenceChannel: null,
        leaseToken: '',
        leaseRenewTimer: 0,
        leaseTakeoverTimer: 0,
        queueProcessTimer: 0,
        navigationPending: false,
    };

    let language = String(document.documentElement.lang || '').toLowerCase().startsWith('tr') ? 'tr' : 'en';
    const t = (key) => I18N[language][key] || I18N.en[key] || key;

    function tf(key, values = {}) {
        return Object.entries(values).reduce(
            (output, [name, value]) => output.replaceAll(`{${name}}`, String(value)),
            t(key),
        );
    }

    function isPlainObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
            && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
    }

    function hasExactKeys(value, required, optional = []) {
        if (!isPlainObject(value)) return false;
        const allowed = new Set([...required, ...optional]);
        const keys = Object.keys(value);
        return required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
            && keys.every((key) => allowed.has(key));
    }

    function jsonByteSize(value) {
        try {
            return new TextEncoder().encode(JSON.stringify(value)).byteLength;
        } catch {
            return Infinity;
        }
    }

    function normalizeText(value) {
        return String(value ?? '').replace(/\s+/g, ' ').trim();
    }

    function normalizeKeyword(value) {
        return normalizeText(value).toLocaleLowerCase('en-US');
    }

    function validIdentifier(value, min = 8, max = 128) {
        return typeof value === 'string'
            && value.length >= min
            && value.length <= max
            && /^[A-Za-z0-9._:-]+$/.test(value);
    }

    function validNonce(value) {
        return typeof value === 'string'
            && value.length >= 16
            && value.length <= 128
            && /^[A-Za-z0-9_-]+$/.test(value);
    }

    function randomToken(bytes = 16) {
        const values = new Uint8Array(bytes);
        crypto.getRandomValues(values);
        return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
    }

    function freshContext(prefix = 'ekma') {
        return {
            requestId: `${prefix}:${Date.now()}:${randomToken(6)}`,
            nonce: randomToken(16),
        };
    }

    function validateEnvelope(value, now = Date.now()) {
        const required = ['schema', 'type', 'requestId', 'nonce', 'sentAt', 'expiresAt', 'sender', 'payload'];
        if (!hasExactKeys(value, required)) return { ok: false, code: 'INVALID_ENVELOPE_KEYS' };
        if (jsonByteSize(value) > MAX_MESSAGE_BYTES) return { ok: false, code: 'MESSAGE_TOO_LARGE' };
        if (value.schema !== ENVELOPE_SCHEMA) return { ok: false, code: 'INVALID_ENVELOPE_SCHEMA' };
        if (!MESSAGE_TYPES.includes(value.type)) return { ok: false, code: 'INVALID_MESSAGE_TYPE' };
        if (!validIdentifier(value.requestId)) return { ok: false, code: 'INVALID_REQUEST_ID' };
        if (!validNonce(value.nonce)) return { ok: false, code: 'INVALID_NONCE' };
        if (!Number.isInteger(value.sentAt) || !Number.isInteger(value.expiresAt)) {
            return { ok: false, code: 'INVALID_MESSAGE_TIME' };
        }
        if (value.sender !== 'listing-analyzer' && value.sender !== 'keyword-market-analyzer') {
            return { ok: false, code: 'INVALID_SENDER' };
        }
        if (value.sentAt > now + 30_000 || value.sentAt < now - MAX_MESSAGE_TTL_MS) {
            return { ok: false, code: 'MESSAGE_TIME_OUT_OF_RANGE' };
        }
        if (value.expiresAt <= now || value.expiresAt <= value.sentAt
            || value.expiresAt - value.sentAt > MAX_MESSAGE_TTL_MS) {
            return { ok: false, code: 'MESSAGE_EXPIRED' };
        }
        if (!isPlainObject(value.payload)) return { ok: false, code: 'INVALID_PAYLOAD' };
        return { ok: true, value };
    }

    function validateResearchRequest(payload) {
        const required = ['schema', 'opaqueReference', 'contentHash', 'title', 'tags', 'seedKeywords', 'maxSeeds'];
        if (!hasExactKeys(payload, required)) return { ok: false, code: 'INVALID_REQUEST_KEYS' };
        if (payload.schema !== REQUEST_SCHEMA) return { ok: false, code: 'INVALID_REQUEST_SCHEMA' };
        if (!validIdentifier(payload.opaqueReference, 1, 128)) return { ok: false, code: 'INVALID_OPAQUE_REFERENCE' };
        if (typeof payload.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(payload.contentHash)) {
            return { ok: false, code: 'INVALID_CONTENT_HASH' };
        }
        if (typeof payload.title !== 'string' || payload.title.length > 140) {
            return { ok: false, code: 'INVALID_TITLE' };
        }
        if (!Array.isArray(payload.tags) || payload.tags.length > 13
            || payload.tags.some((tag) => typeof tag !== 'string' || !normalizeText(tag) || tag.length > 20)) {
            return { ok: false, code: 'INVALID_TAGS' };
        }
        if (!Array.isArray(payload.seedKeywords) || payload.seedKeywords.length < 1
            || payload.seedKeywords.length > MAX_SEED_KEYWORDS_CAP
            || payload.seedKeywords.some((keyword) => typeof keyword !== 'string'
                || !normalizeText(keyword) || keyword.length > MAX_KEYWORD_LENGTH)) {
            return { ok: false, code: 'INVALID_SEED_KEYWORDS' };
        }
        if (!Number.isInteger(payload.maxSeeds) || payload.maxSeeds < 1
            || payload.maxSeeds > MAX_SEED_KEYWORDS_CAP
            || payload.seedKeywords.length > payload.maxSeeds) {
            return { ok: false, code: 'INVALID_MAX_SEEDS' };
        }
        const normalizedSeeds = payload.seedKeywords.map(normalizeText);
        if (new Set(normalizedSeeds.map(normalizeKeyword)).size !== normalizedSeeds.length) {
            return { ok: false, code: 'DUPLICATE_SEED_KEYWORDS' };
        }
        return {
            ok: true,
            value: {
                schema: REQUEST_SCHEMA,
                opaqueReference: payload.opaqueReference,
                contentHash: payload.contentHash,
                title: normalizeText(payload.title),
                tags: payload.tags.map(normalizeText),
                seedKeywords: normalizedSeeds,
                maxSeeds: payload.maxSeeds,
            },
        };
    }

    function makeEnvelope(type, context, payload) {
        const now = Date.now();
        const envelope = {
            schema: ENVELOPE_SCHEMA,
            type,
            requestId: context.requestId,
            nonce: context.nonce,
            sentAt: now,
            expiresAt: now + MESSAGE_TTL_MS,
            sender: 'keyword-market-analyzer',
            payload,
        };
        if (!validateEnvelope(envelope, now).ok || jsonByteSize(envelope) > MAX_MESSAGE_BYTES) return null;
        return envelope;
    }

    function sendEnvelope(envelope) {
        if (!Runtime.channel) return false;
        if (!validateEnvelope(envelope).ok || envelope.sender !== 'keyword-market-analyzer') return false;
        Runtime.channel.postMessage(envelope);
        return true;
    }

    function postMessage(type, context, payload) {
        const envelope = makeEnvelope(type, context, payload);
        return envelope && sendEnvelope(envelope) ? envelope : null;
    }

    function queueTime(value) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
    }

    function normalizeQueueRecords(value, now = Date.now()) {
        const source = Array.isArray(value) ? value.filter(isPlainObject) : [];
        const terminalStatuses = new Set(['completed', 'cancelled', 'failed']);
        const liveStatuses = new Set(['queued', 'running', 'awaiting-receipt']);
        const live = [];
        const terminal = [];
        for (const raw of source) {
            if (!validIdentifier(raw.requestId) || !validNonce(raw.nonce)) continue;
            const item = { ...raw };
            if (liveStatuses.has(item.status)) {
                const deadlineAt = queueTime(item.deadlineAt);
                if (deadlineAt === null || deadlineAt <= now) {
                    item.status = 'failed';
                    item.updatedAt = now;
                    item.terminalAt = now;
                    item.error = {
                        code: raw.status === 'awaiting-receipt' ? 'RECEIPT_TIMEOUT' : 'REQUEST_TIMEOUT',
                        message: raw.status === 'awaiting-receipt'
                            ? 'Research result receipt expired.' : 'Research request exceeded its time limit.',
                        retryable: raw.status !== 'awaiting-receipt',
                    };
                    delete item.result;
                    delete item.resultEnvelope;
                    item.seedResults = [];
                    terminal.push(item);
                } else {
                    live.push(item);
                }
                continue;
            }
            if (!terminalStatuses.has(item.status)) continue;
            const terminalAt = queueTime(item.terminalAt) ?? queueTime(item.updatedAt);
            if (terminalAt === null || now - terminalAt > QUEUE_TERMINAL_RETENTION_MS) continue;
            terminal.push(item);
        }
        const boundedLive = live.slice(0, MAX_QUEUE_ENTRIES);
        const terminalCapacity = Math.max(0, MAX_QUEUE_ENTRIES - boundedLive.length);
        const boundedTerminal = terminalCapacity > 0
            ? terminal.slice(-Math.min(10, terminalCapacity))
            : [];
        const items = [...boundedTerminal, ...boundedLive];
        return {
            items,
            changed: !Array.isArray(value) || JSON.stringify(items) !== JSON.stringify(value),
        };
    }

    function researchStorageStateError() {
        const error = new Error('Local research state storage failed.');
        error.telemetryCode = 'storage_research_state';
        return error;
    }

    const Store = {
        async get(key, fallback) {
            try {
                return await GM.getValue(key, fallback);
            } catch {
                void trackTelemetryError('storage_research_state');
                throw researchStorageStateError();
            }
        },
        async set(key, value) {
            try {
                await GM.setValue(key, value);
                return value;
            } catch {
                void trackTelemetryError('storage_research_state');
                throw researchStorageStateError();
            }
        },
        async delete(key) {
            try {
                await GM.deleteValue(key);
                const sentinel = `ekma-deleted:${randomToken(8)}`;
                if (await GM.getValue(key, sentinel) !== sentinel) throw new Error('STORAGE_DELETE_READBACK_FAILED');
                return true;
            } catch {
                void trackTelemetryError('storage_research_state');
                throw researchStorageStateError();
            }
        },
        async queue() {
            const value = await this.get(KEYS.queue, []);
            const normalized = normalizeQueueRecords(value);
            if (normalized.changed) await this.set(KEYS.queue, normalized.items);
            return normalized.items;
        },
        async saveQueue(queue) {
            const normalized = normalizeQueueRecords(queue);
            return this.set(KEYS.queue, normalized.items);
        },
        async captures() {
            const value = await this.get(KEYS.captures, []);
            return Array.isArray(value) ? value.filter(isPlainObject).slice(-MAX_CAPTURE_ENTRIES) : [];
        },
        async cache() {
            const now = Date.now();
            const value = await this.get(KEYS.cache, []);
            const pruned = Array.isArray(value)
                ? value.filter((entry) => isPlainObject(entry)
                    && Number.isFinite(entry.savedAt)
                    && now - entry.savedAt <= CACHE_TTL_MS
                    && isPlainObject(entry.result)).slice(-MAX_CACHE_ENTRIES)
                : [];
            if (!Array.isArray(value) || pruned.length !== value.length) await this.set(KEYS.cache, pruned);
            return pruned;
        },
        async resultEnvelopes() {
            const now = Date.now();
            const value = await this.get(KEYS.results, []);
            const pruned = Array.isArray(value)
                ? value.filter((entry) => isPlainObject(entry)
                    && Number.isFinite(entry.savedAt)
                    && now - entry.savedAt <= RESULT_HISTORY_TTL_MS
                    && validateEnvelope(entry.envelope, now).ok
                    && entry.envelope.type === 'RESEARCH_RESULT'
                    && entry.envelope.sender === 'keyword-market-analyzer').slice(-MAX_RESULT_ENVELOPES)
                : [];
            if (!Array.isArray(value) || JSON.stringify(pruned) !== JSON.stringify(value)) await this.set(KEYS.results, pruned);
            return pruned;
        },
        async saveResultEnvelope(envelope) {
            const checked = validateEnvelope(envelope);
            if (!checked.ok || envelope.type !== 'RESEARCH_RESULT' || envelope.sender !== 'keyword-market-analyzer') {
                throw new Error('INVALID_RESULT_ENVELOPE');
            }
            const values = (await this.resultEnvelopes()).filter((entry) => !(
                entry.envelope.requestId === envelope.requestId && entry.envelope.nonce === envelope.nonce
            ));
            values.push({ savedAt: Date.now(), envelope });
            await this.set(KEYS.results, values.slice(-MAX_RESULT_ENVELOPES));
            return envelope;
        },
        async removeResultEnvelope(requestId, nonce) {
            const values = (await this.resultEnvelopes()).filter((entry) => !(
                entry.envelope.requestId === requestId && entry.envelope.nonce === nonce
            ));
            await this.set(KEYS.results, values);
        },
    };

    function delay(ms) {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    function requestQueueProcessing(delayMs = 0) {
        window.clearTimeout(Runtime.queueProcessTimer);
        Runtime.queueProcessTimer = window.setTimeout(() => {
            Runtime.queueProcessTimer = 0;
            if (Runtime.processing) {
                requestQueueProcessing(100);
                return;
            }
            void processQueue();
        }, Math.max(0, delayMs));
    }

    function persistTabIdentity() {
        let state = null;
        try { state = isPlainObject(history.state) ? history.state : {}; } catch { state = {}; }
        try {
            history.replaceState({ ...state, __makaytronEkmaTabId: Runtime.tabId }, document.title, location.href);
        } catch { /* The instance-bound lease remains safe when history state is unavailable. */ }
    }

    function ensureTabIdentity() {
        let state = null;
        try { state = isPlainObject(history.state) ? history.state : {}; } catch { state = {}; }
        const stored = typeof state.__makaytronEkmaTabId === 'string' ? state.__makaytronEkmaTabId : '';
        Runtime.tabId = validIdentifier(stored, 12, 160)
            ? stored
            : `ekma-tab:${Date.now()}:${randomToken(8)}`;
        persistTabIdentity();
        return Runtime.tabId;
    }

    async function ensureUniqueTabIdentity() {
        if (Runtime.identityReady) return Runtime.identityReady;
        Runtime.identityReady = (async () => {
            ensureTabIdentity();
            if (typeof BroadcastChannel !== 'function') return Runtime.tabId;
            let channel = null;
            try {
                channel = new BroadcastChannel(`${APP.storagePrefix}:tab-presence`);
                const probeId = `ekma-probe:${Date.now()}:${randomToken(8)}`;
                let duplicate = false;
                channel.addEventListener('message', (event) => {
                    const message = event.data;
                    if (!isPlainObject(message)
                        || message.instanceId === Runtime.pageInstanceId
                        || message.tabId !== Runtime.tabId
                        || !validIdentifier(message.instanceId, 12, 160)) return;
                    if (message.type === 'probe' && validIdentifier(message.probeId, 12, 160)) {
                        channel.postMessage({
                            type: 'present',
                            tabId: Runtime.tabId,
                            probeId: message.probeId,
                            instanceId: Runtime.pageInstanceId,
                        });
                    } else if (message.type === 'present' && message.probeId === probeId) {
                        duplicate = true;
                    }
                });
                channel.postMessage({
                    type: 'probe',
                    tabId: Runtime.tabId,
                    probeId,
                    instanceId: Runtime.pageInstanceId,
                });
                await delay(TAB_PRESENCE_SETTLE_MS);
                if (duplicate) {
                    Runtime.tabId = `ekma-tab:${Date.now()}:${randomToken(8)}`;
                    persistTabIdentity();
                }
                Runtime.presenceChannel = channel;
            } catch {
                try { channel?.close(); } catch { /* optional collision-hardening channel */ }
            }
            return Runtime.tabId;
        })();
        return Runtime.identityReady;
    }

    function normalizeLease(value, now = Date.now()) {
        if (!isPlainObject(value)
            || value.schema !== LEASE_SCHEMA
            || !validIdentifier(value.ownerId, 12, 160)
            || !validIdentifier(value.instanceId, 12, 160)
            || !validNonce(value.token)
            || !Number.isInteger(value.acquiredAt)
            || !Number.isInteger(value.renewedAt)
            || !Number.isInteger(value.expiresAt)
            || value.expiresAt <= value.renewedAt
            || value.expiresAt - value.renewedAt > LEASE_TTL_MS + 250) return null;
        return { ...value, expired: value.expiresAt <= now };
    }

    async function withLeaseMutation(callback) {
        if (navigator.locks?.request) {
            return navigator.locks.request(`${APP.storagePrefix}:processor-lease-mutation`, { mode: 'exclusive' }, callback);
        }
        return callback();
    }

    const Lease = {
        async current() {
            return normalizeLease(await Store.get(KEYS.lease, null));
        },
        clearTimers() {
            window.clearTimeout(Runtime.leaseRenewTimer);
            window.clearTimeout(Runtime.leaseTakeoverTimer);
            Runtime.leaseRenewTimer = 0;
            Runtime.leaseTakeoverTimer = 0;
        },
        scheduleRenewal() {
            window.clearTimeout(Runtime.leaseRenewTimer);
            if (!Runtime.leaseToken) return;
            Runtime.leaseRenewTimer = window.setTimeout(async () => {
                const renewed = await this.renew();
                if (renewed) this.scheduleRenewal();
            }, LEASE_RENEW_MS);
        },
        scheduleTakeover(expiresAt) {
            if (Runtime.leaseTakeoverTimer) return;
            const delayMs = Math.max(100, Math.min(LEASE_TTL_MS + 250, Number(expiresAt || Date.now()) - Date.now() + 75));
            Runtime.leaseTakeoverTimer = window.setTimeout(() => {
                Runtime.leaseTakeoverTimer = 0;
                requestQueueProcessing();
            }, delayMs);
        },
        async acquire() {
            await ensureUniqueTabIdentity();
            const outcome = await withLeaseMutation(async () => {
                const now = Date.now();
                const current = normalizeLease(await Store.get(KEYS.lease, null), now);
                const sameInstance = current
                    && current.ownerId === Runtime.tabId
                    && current.instanceId === Runtime.pageInstanceId;
                if (current && !current.expired && !sameInstance) {
                    return { acquired: false, expiresAt: current.expiresAt };
                }
                const token = sameInstance && !current.expired
                    ? current.token : randomToken(16);
                const candidate = {
                    schema: LEASE_SCHEMA,
                    ownerId: Runtime.tabId,
                    instanceId: Runtime.pageInstanceId,
                    token,
                    acquiredAt: sameInstance ? current.acquiredAt : now,
                    renewedAt: now,
                    expiresAt: now + LEASE_TTL_MS,
                };
                await Store.set(KEYS.lease, candidate);
                await delay(LEASE_SETTLE_MS);
                const verified = normalizeLease(await Store.get(KEYS.lease, null));
                if (!verified || verified.expired
                    || verified.ownerId !== candidate.ownerId
                    || verified.instanceId !== candidate.instanceId
                    || verified.token !== token) {
                    return { acquired: false, expiresAt: verified?.expiresAt || now + LEASE_TTL_MS };
                }
                return { acquired: true, token, expiresAt: verified.expiresAt };
            });
            if (!outcome.acquired) {
                Runtime.leaseToken = '';
                this.scheduleTakeover(outcome.expiresAt);
                return false;
            }
            Runtime.leaseToken = outcome.token;
            this.scheduleRenewal();
            return true;
        },
        async owns() {
            if (!Runtime.tabId || !Runtime.leaseToken) return false;
            const current = normalizeLease(await Store.get(KEYS.lease, null));
            return Boolean(current && !current.expired
                && current.ownerId === Runtime.tabId
                && current.instanceId === Runtime.pageInstanceId
                && current.token === Runtime.leaseToken);
        },
        async assertOwner() {
            if (await this.owns()) return true;
            const error = new Error('PROCESSOR_LEASE_LOST');
            error.code = 'PROCESSOR_LEASE_LOST';
            throw error;
        },
        async renew() {
            if (!Runtime.tabId || !Runtime.leaseToken) return false;
            const renewed = await withLeaseMutation(async () => {
                const current = normalizeLease(await Store.get(KEYS.lease, null));
                if (!current || current.expired
                    || current.ownerId !== Runtime.tabId
                    || current.instanceId !== Runtime.pageInstanceId
                    || current.token !== Runtime.leaseToken) return false;
                const now = Date.now();
                const next = { ...current, renewedAt: now, expiresAt: now + LEASE_TTL_MS };
                delete next.expired;
                await Store.set(KEYS.lease, next);
                const verified = normalizeLease(await Store.get(KEYS.lease, null));
                return Boolean(verified && !verified.expired
                    && verified.ownerId === Runtime.tabId
                    && verified.instanceId === Runtime.pageInstanceId
                    && verified.token === Runtime.leaseToken);
            });
            if (!renewed) {
                Runtime.leaseToken = '';
                window.clearTimeout(Runtime.leaseRenewTimer);
                Runtime.leaseRenewTimer = 0;
            }
            return renewed;
        },
        async release() {
            this.clearTimers();
            if (!Runtime.tabId || !Runtime.leaseToken) return false;
            const token = Runtime.leaseToken;
            const released = await withLeaseMutation(async () => {
                const current = normalizeLease(await Store.get(KEYS.lease, null));
                if (!current
                    || current.ownerId !== Runtime.tabId
                    || current.instanceId !== Runtime.pageInstanceId
                    || current.token !== token) return false;
                await Store.delete(KEYS.lease);
                return !normalizeLease(await Store.get(KEYS.lease, null));
            });
            if (released) Runtime.leaseToken = '';
            return released;
        },
    };

    function installationSource() {
        let info = null;
        try { info = GM?.info || globalThis.GM_info || null; } catch { info = null; }
        const script = isPlainObject(info?.script) ? info.script : {};
        const candidates = [script.downloadURL, script.updateURL].filter((value) => typeof value === 'string' && value);
        const allCanonical = candidates.length > 0 && candidates.every((value) => {
            try {
                const candidate = new URL(value);
                const canonical = new URL(GITHUB_RAW_SCRIPT_URL);
                return candidate.protocol === 'https:'
                    && candidate.protocol === canonical.protocol
                    && candidate.hostname === canonical.hostname
                    && candidate.port === canonical.port
                    && candidate.pathname === canonical.pathname
                    && candidate.search === canonical.search
                    && candidate.hash === canonical.hash
                    && !candidate.username && !candidate.password;
            } catch {
                return false;
            }
        });
        if (allCanonical) return { kind: 'github', labelKey: 'sourceGithub' };
        if (candidates.length || normalizeText(info?.scriptHandler)) return { kind: 'external', labelKey: 'sourceExternal' };
        return { kind: 'unknown', labelKey: 'sourceUnknown' };
    }

    function compareSemver(left, right) {
        const parse = (value) => {
            const match = String(value || '').match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
            return match ? match.slice(1).map(Number) : null;
        };
        const a = parse(left);
        const b = parse(right);
        if (!a || !b) return null;
        for (let index = 0; index < 3; index += 1) {
            if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
        }
        return 0;
    }

    function normalizeUpdateState(value) {
        const source = isPlainObject(value) ? value : {};
        return {
            status: ['idle', 'checking', 'current', 'available', 'error', 'external'].includes(source.status)
                ? source.status : 'idle',
            latestVersion: typeof source.latestVersion === 'string' ? source.latestVersion : '',
            checkedAt: Number.isFinite(source.checkedAt) ? source.checkedAt : 0,
            error: typeof source.error === 'string' ? source.error.slice(0, 300) : '',
        };
    }

    function requestCanonicalScript() {
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (callback, value) => {
                if (settled) return;
                settled = true;
                callback(value);
            };
            try {
                GM.xmlHttpRequest({
                    method: 'GET',
                    url: GITHUB_RAW_SCRIPT_URL,
                    anonymous: true,
                    timeout: UPDATE_CHECK_TIMEOUT_MS,
                    headers: { Accept: 'text/plain', 'Cache-Control': 'no-cache' },
                    onload: (response) => {
                        try {
                            if (Number(response.status) !== 200) throw new Error(`UPDATE_HTTP_${response.status}`);
                            if (!response.finalUrl) throw new Error('UPDATE_FINAL_URL_MISSING');
                            const expected = new URL(GITHUB_RAW_SCRIPT_URL);
                            const finalUrl = new URL(response.finalUrl);
                            const exactTarget = finalUrl.protocol === expected.protocol
                                && finalUrl.hostname === expected.hostname
                                && finalUrl.port === expected.port
                                && finalUrl.pathname === expected.pathname
                                && !finalUrl.username && !finalUrl.password;
                            if (!exactTarget) throw new Error('UPDATE_REDIRECT_REJECTED');
                            const source = String(response.responseText || '');
                            if (!source || source.length > 2_000_000) throw new Error('UPDATE_SOURCE_SIZE_INVALID');
                            finish(resolve, source);
                        } catch (error) {
                            finish(reject, error);
                        }
                    },
                    onerror: () => finish(reject, new Error('UPDATE_NETWORK_ERROR')),
                    ontimeout: () => finish(reject, new Error('UPDATE_TIMEOUT')),
                });
            } catch (error) {
                finish(reject, error);
            }
        });
    }

    async function updateState() {
        return normalizeUpdateState(await Store.get(KEYS.update, null));
    }

    async function saveUpdateState(value) {
        const normalized = normalizeUpdateState(value);
        await Store.set(KEYS.update, normalized);
        renderUpdateState(normalized);
        return normalized;
    }

    async function checkForUpdates(options = {}) {
        const manual = options.manual === true;
        const force = manual || options.force === true;
        const source = installationSource();
        const current = await updateState();
        const checkingAge = Date.now() - current.checkedAt;
        const checkingIsFresh = current.status === 'checking'
            && current.checkedAt > 0
            && checkingAge >= 0
            && checkingAge < UPDATE_CHECK_STALE_MS;
        if (checkingIsFresh && !force) return current;
        if (source.kind === 'external') {
            const next = await saveUpdateState({ status: 'external', latestVersion: '', checkedAt: Date.now(), error: '' });
            if (manual) UI.status(t('updateExternal'));
            return next;
        }
        if (source.kind === 'unknown' && !manual) return current;
        const age = Date.now() - current.checkedAt;
        if (!force && current.checkedAt && age >= 0 && age < UPDATE_CHECK_INTERVAL_MS) {
            renderUpdateState(current);
            return current;
        }
        await saveUpdateState({ ...current, status: 'checking', checkedAt: Date.now(), error: '' });
        if (manual) UI.status(t('checkingUpdate'));
        try {
            const sourceText = await requestCanonicalScript();
            const match = sourceText.match(/^\/\/ @version\s+([^\s]+)$/m);
            if (!match || compareSemver(match[1], APP_VERSION) === null) throw new Error('UPDATE_VERSION_INVALID');
            const available = compareSemver(match[1], APP_VERSION) > 0;
            const next = await saveUpdateState({
                status: available ? 'available' : 'current',
                latestVersion: match[1],
                checkedAt: Date.now(),
                error: '',
            });
            if (manual) UI.status(available
                ? tf('updateAvailable', { version: match[1] })
                : tf('updateCurrent', { version: APP_VERSION }));
            return next;
        } catch (error) {
            const next = await saveUpdateState({
                status: 'error',
                latestVersion: '',
                checkedAt: Date.now(),
                error: String(error?.message || error).slice(0, 300),
            });
            if (manual) UI.status(t('updateError'));
            return next;
        }
    }

    function renderUpdateState(state) {
        if (!Runtime.ui) return;
        const normalized = normalizeUpdateState(state);
        Runtime.ui.version.textContent = normalized.status === 'available'
            ? `v${APP_VERSION} → v${normalized.latestVersion}` : `v${APP_VERSION}`;
        Runtime.ui.updateBanner.hidden = !['available', 'error', 'external'].includes(normalized.status);
        Runtime.ui.updateBanner.textContent = normalized.status === 'available'
            ? tf('updateAvailable', { version: normalized.latestVersion })
            : normalized.status === 'external' ? t('updateExternal') : normalized.status === 'error' ? t('updateError') : '';
        Runtime.ui.installUpdate.hidden = normalized.status !== 'available';
        Runtime.ui.checkUpdate.disabled = normalized.status === 'checking';
        Runtime.ui.source.textContent = `${t('installSource')}: ${t(installationSource().labelKey)}`;
    }

    async function openUpdatePage() {
        const queue = await Store.queue();
        if (queue.some((item) => ['queued', 'running', 'awaiting-receipt'].includes(item.status))) {
            UI.status(t('updateBusy'));
            return false;
        }
        if (!window.confirm(t('installConfirm'))) return false;
        try {
            if (typeof GM.openInTab === 'function') {
                GM.openInTab(GITHUB_RAW_SCRIPT_URL, { active: true, insert: true, setParent: true });
            } else {
                const anchor = document.createElement('a');
                anchor.href = GITHUB_RAW_SCRIPT_URL;
                anchor.target = '_blank';
                anchor.rel = 'noopener noreferrer';
                document.documentElement.appendChild(anchor);
                anchor.click();
                anchor.remove();
            }
            return true;
        } catch {
            UI.status(t('updateError'));
            return false;
        }
    }

    function parseCompactNumber(value) {
        const original = normalizeText(value);
        if (!original) return null;
        const match = original.match(/([-+]?\d[\d.,\s]*)\s*(k|m|b|bn|bin|mn|mio|million|milyon)?\b/i);
        if (!match) return null;
        let numeric = match[1].replace(/\s/g, '');
        const suffixRaw = match[2] || '';
        const suffix = suffixRaw.toLowerCase();
        const both = numeric.includes(',') && numeric.includes('.');
        if (both) {
            const decimal = numeric.lastIndexOf(',') > numeric.lastIndexOf('.') ? ',' : '.';
            const thousands = decimal === ',' ? '.' : ',';
            numeric = numeric.split(thousands).join('').replace(decimal, '.');
        } else if (numeric.includes(',')) {
            const tail = numeric.length - numeric.lastIndexOf(',') - 1;
            numeric = tail === 3 && !suffix ? numeric.replace(/,/g, '') : numeric.replace(',', '.');
        } else if (numeric.includes('.')) {
            const tail = numeric.length - numeric.lastIndexOf('.') - 1;
            if (tail === 3 && !suffix && (numeric.match(/\./g) || []).length === 1) numeric = numeric.replace('.', '');
        }
        const base = Number(numeric);
        if (!Number.isFinite(base) || base < 0) return null;
        let multiplier = 1;
        if (suffix === 'k' || suffix === 'bin') multiplier = 1_000;
        else if (suffix === 'm' || suffix === 'mn' || suffix === 'mio'
            || suffix === 'million' || suffix === 'milyon') multiplier = 1_000_000;
        else if (suffix === 'b' || suffix === 'bn') {
            multiplier = language === 'tr' && suffixRaw === 'B' ? 1_000 : 1_000_000_000;
        }
        return Math.round(base * multiplier);
    }

    function parsePercent(value) {
        const match = normalizeText(value).match(/([+-]?\d+(?:[.,]\d+)?)\s*%/);
        if (!match) return null;
        const parsed = Number(match[1].replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : null;
    }

    function opportunityFor(searches30d, searchResults) {
        const demand = Math.min(1, Math.log10(Math.max(0, searches30d) + 1) / 5);
        const ratio = Math.max(0, searches30d) / Math.max(1, searchResults);
        const efficiency = Math.min(1, Math.log10(1 + (ratio * 1_000)) / 3);
        const score = Math.max(0, Math.min(100, Math.round((demand * 0.55 + efficiency * 0.45) * 100)));
        const label = score >= 65 ? 'high' : score >= 35 ? 'medium' : 'low';
        return {
            score,
            label,
            metric: 'makaytron-derived',
        };
    }

    function exactText(element) {
        return normalizeText(element?.textContent).toLocaleLowerCase('en-US');
    }

    function matchesAlias(value, aliases) {
        const normalized = normalizeText(value).toLocaleLowerCase('en-US');
        return aliases.includes(normalized);
    }

    function isVisibleResultElement(element) {
        if (!element || !element.isConnected) return false;
        for (let current = element; current && current.nodeType === 1; current = current.parentElement) {
            if (current.hidden || current.getAttribute('aria-hidden') === 'true') return false;
            if (typeof getComputedStyle === 'function') {
                const style = getComputedStyle(current);
                if (style.display === 'none' || style.visibility === 'hidden'
                    || style.visibility === 'collapse' || style.opacity === '0') return false;
            }
        }
        return true;
    }

    function valueFromMetricLabel(aliases, scope) {
        if (!scope || !isVisibleResultElement(scope)) return null;
        const labels = Array.from(scope.querySelectorAll('h1,h2,h3,h4,h5,h6,span,div'));
        for (const label of labels) {
            if (!isVisibleResultElement(label)
                || label.closest('table,[data-ekma-inline]')
                || !matchesAlias(label.textContent, aliases)) continue;
            const container = label.parentElement;
            if (!container || !scope.contains(container) || !isVisibleResultElement(container)) continue;
            const preferred = container.querySelector('.wt-text-title-larger');
            const preferredValue = isVisibleResultElement(preferred) ? parseCompactNumber(preferred?.textContent) : null;
            if (preferredValue !== null) return { value: preferredValue, container };
            for (const child of Array.from(container.children)) {
                if (child === label || !isVisibleResultElement(child)) continue;
                const parsed = parseCompactNumber(child.textContent);
                if (parsed !== null) return { value: parsed, container };
            }
        }
        return null;
    }

    function queryKeyword() {
        const url = new URL(location.href);
        const fromUrl = normalizeText(url.searchParams.get('query'));
        if (fromUrl) return fromUrl.slice(0, MAX_KEYWORD_LENGTH);
        const input = document.querySelector('input[name="query"], input[type="search"]');
        return normalizeText(input?.value).slice(0, MAX_KEYWORD_LENGTH);
    }

    function findMainKeywordAnchor(keyword) {
        const wanted = normalizeKeyword(keyword);
        const explicit = Array.from(document.querySelectorAll('[data-ekma-main-keyword]'))
            .find((element) => isVisibleResultElement(element) && normalizeKeyword(element.textContent) === wanted);
        if (explicit) return explicit;
        const candidates = Array.from(document.querySelectorAll('span,div,h1,h2,h3,h4,h5'))
            .filter((element) => isVisibleResultElement(element)
                && !element.closest('[data-ekma-inline]')
                && normalizeKeyword(element.textContent) === wanted);
        return candidates.find((element) => {
            let ancestor = element.parentElement;
            for (let depth = 0; ancestor && depth < 5; depth += 1, ancestor = ancestor.parentElement) {
                if (!isVisibleResultElement(ancestor)) continue;
                const content = exactText(ancestor);
                if (TEXT_ALIASES.yourSearch.some((alias) => content.includes(alias))) return true;
            }
            return false;
        }) || null;
    }

    function resultScopeForAnchor(anchor) {
        const main = anchor?.closest('main,[role="main"]');
        if (!main || !isVisibleResultElement(main)) return null;
        const declaredScope = anchor.closest('[data-ekma-result-scope]');
        if (declaredScope && declaredScope !== main && isVisibleResultElement(declaredScope)) {
            const searches = valueFromMetricLabel(TEXT_ALIASES.searches, declaredScope);
            const results = valueFromMetricLabel(TEXT_ALIASES.searchResults, declaredScope);
            if (searches && results) return { scope: declaredScope, searches, results };
        }
        for (let scope = anchor.parentElement; scope && scope !== main; scope = scope.parentElement) {
            if (!isVisibleResultElement(scope)) continue;
            const searches = valueFromMetricLabel(TEXT_ALIASES.searches, scope);
            const results = valueFromMetricLabel(TEXT_ALIASES.searchResults, scope);
            if (searches && results) return { scope, searches, results };
        }
        return null;
    }

    function similarTermsTable(scope) {
        if (!scope || !isVisibleResultElement(scope)) return null;
        return Array.from(scope.querySelectorAll('table')).find((table) => {
            if (!isVisibleResultElement(table)) return false;
            const headers = Array.from(table.querySelectorAll('thead th,thead td'));
            return headers.some((header) => isVisibleResultElement(header)
                && matchesAlias(header.textContent, TEXT_ALIASES.similarSearchTerms));
        }) || null;
    }

    function captureRelatedTerms(scope) {
        const table = similarTermsTable(scope);
        if (!table) return [];
        const values = [];
        for (const row of Array.from(table.querySelectorAll('tbody tr')).slice(0, MAX_RELATED_KEYWORDS)) {
            if (!isVisibleResultElement(row)) continue;
            const cells = Array.from(row.children).filter((cell) => cell.matches('th,td'));
            if (cells.length < 3 || cells.some((cell) => !isVisibleResultElement(cell))) continue;
            const keywordTarget = cells[0].querySelector('[data-ekma-keyword],[role="button"]') || cells[0];
            const keyword = normalizeText(keywordTarget.textContent);
            const searches30d = parseCompactNumber(cells[1].textContent);
            const searchResults = parseCompactNumber(cells[2].textContent);
            if (!keyword || keyword.length > MAX_KEYWORD_LENGTH || searches30d === null || searchResults === null) continue;
            values.push({
                keyword,
                searches30d,
                searchResults,
                opportunity: opportunityFor(searches30d, searchResults),
                _anchor: cells[0],
            });
        }
        return values;
    }

    function captureCurrentPage() {
        const keyword = queryKeyword();
        if (!keyword) return null;
        const anchor = findMainKeywordAnchor(keyword);
        if (!anchor) return null;
        const result = resultScopeForAnchor(anchor);
        if (!result) return null;
        const { scope: resultScope, searches, results } = result;
        const percentCandidates = Array.from(searches.container.querySelectorAll('span,button,div'));
        let trend7dPercent = null;
        for (const candidate of percentCandidates) {
            if (!isVisibleResultElement(candidate)) continue;
            trend7dPercent = parsePercent(candidate.textContent);
            if (trend7dPercent !== null) break;
        }
        const main = {
            keyword,
            searches30d: searches.value,
            searchResults: results.value,
            opportunity: opportunityFor(searches.value, results.value),
            _anchor: anchor,
        };
        if (trend7dPercent !== null) main.trend7dPercent = trend7dPercent;
        return {
            schema: 'makaytron-marketplace-insights-capture/v1',
            capturedAt: new Date().toISOString(),
            source: 'etsy-marketplace-insights-dom',
            main,
            related: captureRelatedTerms(resultScope),
        };
    }

    function publicKeyword(keyword) {
        const output = {
            keyword: keyword.keyword,
            searches30d: keyword.searches30d,
            searchResults: keyword.searchResults,
            trend7dPercent: Number.isFinite(keyword.trend7dPercent) ? keyword.trend7dPercent : null,
            opportunity: {
                score: keyword.opportunity.score,
                label: keyword.opportunity.label,
                metric: 'makaytron-derived',
            },
        };
        return output;
    }

    function publicCapture(capture) {
        return {
            schema: capture.schema,
            capturedAt: capture.capturedAt,
            source: capture.source,
            main: publicKeyword(capture.main),
            related: capture.related.slice(0, MAX_RELATED_KEYWORDS).map(publicKeyword),
        };
    }

    function keywordDomId(keyword) {
        let hash = 2166136261;
        for (const char of normalizeKeyword(keyword)) {
            hash ^= char.charCodeAt(0);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function formatNumber(value) {
        return new Intl.NumberFormat(language === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 0 }).format(value);
    }

    function formatCompactNumber(value) {
        return new Intl.NumberFormat(language === 'tr' ? 'tr-TR' : 'en-US', {
            notation: 'compact',
            maximumFractionDigits: 1,
        }).format(value);
    }

    function ensureInlineStyles() {
        if (document.getElementById('ekma-inline-styles')) return;
        const style = document.createElement('style');
        style.id = 'ekma-inline-styles';
        style.textContent = `
            .ekma-inline{display:flex;align-items:center;flex-wrap:wrap;gap:4px 7px;width:max-content;max-width:100%;margin-top:6px;padding:5px 7px;box-sizing:border-box;border:1px solid #d8d8d8;border-radius:7px;background:#fafafa;color:#171717;font:600 10.5px/1.25 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums;box-shadow:0 1px 2px rgba(0,0,0,.035)}
            .ekma-inline__brand{width:18px;height:18px;display:inline-grid;place-items:center;flex:0 0 auto;border:1px solid #cfcfcf;border-radius:5px;background:#fff;color:#171717;font-size:9px;font-weight:800;line-height:1}
            .ekma-inline__grid{display:flex;align-items:center;flex-wrap:wrap;gap:3px 8px;min-width:0}
            .ekma-inline__metric{display:inline-flex;align-items:baseline;gap:4px;min-width:0;color:#595959;white-space:nowrap}
            .ekma-inline__metric b{color:#737373;font-size:8.5px;font-weight:760;letter-spacing:.035em;text-transform:uppercase}
            .ekma-inline__metric strong{color:#171717;font-size:10.5px;font-weight:780}
            .ekma-inline__metric--opportunity{padding:2px 6px;border:1px solid #cfcfcf;border-radius:999px;background:#fff}
            .ekma-inline__metric--opportunity[data-tone="high"]{border-color:#a9d8be;background:#edf8f1}.ekma-inline__metric--opportunity[data-tone="high"] b,.ekma-inline__metric--opportunity[data-tone="high"] strong{color:#1f7a4d}
            .ekma-inline__metric--opportunity[data-tone="medium"]{border-color:#e5c56b;background:#fff9df}.ekma-inline__metric--opportunity[data-tone="medium"] b,.ekma-inline__metric--opportunity[data-tone="medium"] strong{color:#8a5a00}
            .ekma-inline__metric--opportunity[data-tone="low"]{border-color:#efb4ae;background:#fff1f0}.ekma-inline__metric--opportunity[data-tone="low"] b,.ekma-inline__metric--opportunity[data-tone="low"] strong{color:#b42318}
            .ekma-inline__metric--trend[data-tone="up"] strong{color:#1f7a4d}.ekma-inline__metric--trend[data-tone="down"] strong{color:#b42318}
            .ekma-inline__note{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
            @media(max-width:640px){.ekma-inline{width:100%}.ekma-inline__grid{gap:4px 9px}}
        `;
        document.head.appendChild(style);
    }

    function renderInlineKeyword(keyword, anchor, capturedAt) {
        if (!anchor || !anchor.isConnected) return;
        const container = anchor.matches('th,td')
            ? anchor
            : (anchor.closest('[data-ekma-main-keyword-cell],[class*="wt-grid__item"]') || anchor.parentElement || anchor);
        const id = keywordDomId(keyword.keyword);
        let inline = container.querySelector(`:scope > [data-ekma-inline="${id}"]`);
        if (!inline) {
            inline = document.createElement('div');
            inline.className = 'ekma-inline';
            inline.dataset.ekmaInline = id;
            container.appendChild(inline);
        }
        const fingerprint = JSON.stringify(publicKeyword(keyword));
        if (inline.dataset.ekmaFingerprint === fingerprint) return;
        inline.dataset.ekmaFingerprint = fingerprint;
        inline.replaceChildren();

        const brand = document.createElement('div');
        brand.className = 'ekma-inline__brand';
        brand.textContent = 'M';
        brand.title = 'Makaytron';
        brand.setAttribute('aria-label', 'Makaytron');
        const grid = document.createElement('div');
        grid.className = 'ekma-inline__grid';
        const metrics = [
            {
                key: 'searches',
                label: t('searchesShort'),
                fullLabel: t('searches30d'),
                value: formatCompactNumber(keyword.searches30d),
                fullValue: formatNumber(keyword.searches30d),
            },
            {
                key: 'results',
                label: t('resultsShort'),
                fullLabel: t('searchResults'),
                value: formatCompactNumber(keyword.searchResults),
                fullValue: formatNumber(keyword.searchResults),
            },
            {
                key: 'opportunity',
                label: t('opportunityShort'),
                fullLabel: t('opportunity'),
                value: `${keyword.opportunity.score} · ${t(keyword.opportunity.label)}`,
                fullValue: `${keyword.opportunity.score}/100 · ${t(keyword.opportunity.label)}`,
                tone: keyword.opportunity.label,
            },
        ];
        metrics.push({
            key: 'trend',
            label: t('trendShort'),
            fullLabel: t('trend'),
            value: Number.isFinite(keyword.trend7dPercent) ? `${keyword.trend7dPercent > 0 ? '+' : ''}${keyword.trend7dPercent}%` : '—',
            fullValue: Number.isFinite(keyword.trend7dPercent) ? `${keyword.trend7dPercent > 0 ? '+' : ''}${keyword.trend7dPercent}%` : '—',
            tone: !Number.isFinite(keyword.trend7dPercent) ? 'neutral' : (keyword.trend7dPercent > 0 ? 'up' : keyword.trend7dPercent < 0 ? 'down' : 'neutral'),
        });
        for (const metric of metrics) {
            const item = document.createElement('span');
            item.className = `ekma-inline__metric ekma-inline__metric--${metric.key}`;
            if (metric.tone) item.dataset.tone = metric.tone;
            item.title = `${metric.fullLabel}: ${metric.fullValue}`;
            item.setAttribute('aria-label', item.title);
            const strong = document.createElement('b');
            strong.textContent = metric.label;
            const value = document.createElement('strong');
            value.textContent = metric.value;
            item.append(strong, value);
            grid.appendChild(item);
        }
        const note = document.createElement('time');
        note.className = 'ekma-inline__note';
        note.dateTime = capturedAt;
        note.textContent = `${t('capturedAt')}: ${new Date(capturedAt).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US')}`;
        inline.dataset.searches30d = String(keyword.searches30d);
        inline.dataset.searchResults = String(keyword.searchResults);
        inline.dataset.opportunityScore = String(keyword.opportunity.score);
        inline.dataset.trend7dPercent = Number.isFinite(keyword.trend7dPercent) ? String(keyword.trend7dPercent) : '';
        inline.setAttribute('role', 'group');
        inline.setAttribute('aria-label', ['Makaytron', ...metrics.map((metric) => `${metric.fullLabel}: ${metric.fullValue}`)].join('. '));
        inline.append(brand, grid, note);
    }

    function renderCapture(capture) {
        if (!capture) return false;
        ensureInlineStyles();
        renderInlineKeyword(capture.main, capture.main._anchor, capture.capturedAt);
        capture.related.forEach((keyword) => renderInlineKeyword(keyword, keyword._anchor, capture.capturedAt));
        return true;
    }

    async function saveCapture(capture) {
        const clean = publicCapture(capture);
        const captures = await Store.captures();
        const key = `${normalizeKeyword(clean.main.keyword)}:${clean.capturedAt.slice(0, 10)}`;
        const next = captures.filter((entry) => entry.key !== key);
        next.push({ key, savedAt: Date.now(), capture: clean });
        await Store.set(KEYS.captures, next.slice(-MAX_CAPTURE_ENTRIES));
        return clean;
    }

    function cacheKey(request) {
        return `${request.contentHash}:${request.seedKeywords.map(normalizeKeyword).join('|')}`;
    }

    async function cachedResult(request) {
        const key = cacheKey(request);
        const cache = await Store.cache();
        return cache.find((entry) => entry.key === key)?.result || null;
    }

    async function saveCachedResult(request, result) {
        const key = cacheKey(request);
        const cache = (await Store.cache()).filter((entry) => entry.key !== key);
        cache.push({ key, savedAt: Date.now(), result });
        await Store.set(KEYS.cache, cache.slice(-MAX_CACHE_ENTRIES));
    }

    function marketplaceUrl(keyword, _context = null, trigger = 'makaytron_keyword_analyzer') {
        const shopMatch = location.pathname.match(/^\/your\/shops\/([^/]+)\/marketplace-insights(?:\/|$)/);
        const shop = shopMatch ? shopMatch[1] : 'me';
        const url = new URL(`/your/shops/${encodeURIComponent(shop)}/marketplace-insights/search`, location.origin);
        url.searchParams.set('search_trigger', trigger);
        url.searchParams.set('query', normalizeText(keyword));
        return url.href;
    }

    function navigateTo(url) {
        Runtime.navigationPending = true;
        if (typeof window.__EKMA_TEST_NAVIGATE__ === 'function') {
            window.__EKMA_TEST_NAVIGATE__(url);
            return;
        }
        try {
            const state = isPlainObject(history.state) ? history.state : {};
            history.pushState({ ...state, __makaytronEkmaTabId: Runtime.tabId }, '', url);
            location.reload();
        } catch {
            location.assign(url);
        }
    }

    function waitForCapture(expectedKeyword, timeoutMs = DOM_RESULT_TIMEOUT_MS) {
        return new Promise((resolve, reject) => {
            const wanted = normalizeKeyword(expectedKeyword);
            const tryCapture = () => {
                const capture = captureCurrentPage();
                if (!capture || normalizeKeyword(capture.main.keyword) !== wanted) return null;
                const anchor = capture.main._anchor;
                if (!anchor || normalizeKeyword(anchor.textContent) !== wanted) return null;
                return capture;
            };
            const scope = document.querySelector('main') || document.body || document.documentElement;
            if (!scope) {
                const error = new Error('RESULT_SCOPE_MISSING');
                error.telemetryCode = 'selector_keyword_result_scope';
                reject(error);
                return;
            }
            let timer = 0;
            let poller = 0;
            let settled = false;
            let candidate = null;
            let candidateFingerprint = '';
            let candidateSince = 0;
            let lastMutationAt = Date.now();
            const fingerprint = (capture) => JSON.stringify({
                keyword: normalizeKeyword(capture.main.keyword),
                searches30d: capture.main.searches30d,
                searchResults: capture.main.searchResults,
                trend7dPercent: Number.isFinite(capture.main.trend7dPercent) ? capture.main.trend7dPercent : null,
                related: capture.related.map((keyword) => [
                    normalizeKeyword(keyword.keyword), keyword.searches30d, keyword.searchResults,
                    Number.isFinite(keyword.trend7dPercent) ? keyword.trend7dPercent : null,
                ]),
            });
            const sample = () => {
                const capture = tryCapture();
                if (!capture) {
                    candidate = null;
                    candidateFingerprint = '';
                    candidateSince = 0;
                    return null;
                }
                const nextFingerprint = fingerprint(capture);
                if (nextFingerprint !== candidateFingerprint) {
                    candidateFingerprint = nextFingerprint;
                    candidateSince = Date.now();
                }
                candidate = capture;
                return capture;
            };
            const finish = (capture) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                clearInterval(poller);
                observer.disconnect();
                resolve(capture);
            };
            const maybeFinish = () => {
                const capture = sample();
                const now = Date.now();
                if (capture
                    && candidateSince > 0
                    && now - candidateSince >= OBSERVER_DEBOUNCE_MS
                    && now - lastMutationAt >= OBSERVER_DEBOUNCE_MS) finish(candidate);
            };
            const observer = new MutationObserver(() => {
                lastMutationAt = Date.now();
                sample();
            });
            observer.observe(scope, { childList: true, subtree: true, characterData: true });
            sample();
            poller = window.setInterval(maybeFinish, 50);
            timer = window.setTimeout(() => {
                maybeFinish();
                if (settled) return;
                clearInterval(poller);
                observer.disconnect();
                const resultScopePresent = !!document.querySelector('main');
                const error = new Error(resultScopePresent ? 'RESULT_DOM_TIMEOUT' : 'RESULT_SCOPE_MISSING');
                error.telemetryCode = resultScopePresent ? 'selector_keyword_results' : 'selector_keyword_result_scope';
                reject(error);
            }, timeoutMs);
        });
    }

    function resultFromItem(item) {
        const deduped = new Map();
        for (const capture of item.seedResults) {
            for (const keyword of [capture.main, ...capture.related]) {
                const key = normalizeKeyword(keyword.keyword);
                const existing = deduped.get(key);
                if (!existing || keyword.searches30d > existing.searches30d) deduped.set(key, publicKeyword(keyword));
            }
        }
        const seedOrder = new Map(item.payload.seedKeywords.map((keyword, index) => [normalizeKeyword(keyword), index]));
        const ranked = Array.from(deduped.values()).sort((left, right) => {
            const leftSeed = seedOrder.has(normalizeKeyword(left.keyword)) ? seedOrder.get(normalizeKeyword(left.keyword)) : 999;
            const rightSeed = seedOrder.has(normalizeKeyword(right.keyword)) ? seedOrder.get(normalizeKeyword(right.keyword)) : 999;
            return leftSeed - rightSeed || right.opportunity.score - left.opportunity.score || right.searches30d - left.searches30d;
        });
        const seeds = ranked.filter((keyword) => seedOrder.has(normalizeKeyword(keyword.keyword)));
        const related = ranked.filter((keyword) => !seedOrder.has(normalizeKeyword(keyword.keyword))).slice(0, MAX_RELATED_KEYWORDS);
        const keywords = [...seeds, ...related];
        return {
            schema: RESULT_SCHEMA,
            opaqueReference: item.payload.opaqueReference,
            contentHash: item.payload.contentHash,
            capturedAt: new Date().toISOString(),
            source: 'etsy-marketplace-insights-dom',
            keywords,
        };
    }

    function resultEnvelopeForItem(item, result) {
        const envelope = makeEnvelope('RESEARCH_RESULT', item, result);
        if (!envelope) return null;
        const deadlineAt = queueTime(item.deadlineAt);
        if (deadlineAt !== null && deadlineAt < envelope.expiresAt) envelope.expiresAt = deadlineAt;
        return validateEnvelope(envelope).ok ? envelope : null;
    }

    async function failQueueItem(item, code, message, retryable = false) {
        await Lease.assertOwner();
        const queue = await Store.queue();
        const target = queue.find((entry) => entry.requestId === item.requestId && entry.nonce === item.nonce);
        if (!target || ['completed', 'cancelled', 'failed'].includes(target.status)) return false;
        const now = Date.now();
        const safeMessage = String(message || code).slice(0, 300);
        target.status = code === 'CANCELLED' ? 'cancelled' : 'failed';
        target.updatedAt = now;
        target.terminalAt = now;
        target.error = { code, message: safeMessage, retryable: Boolean(retryable) };
        delete target.result;
        delete target.resultEnvelope;
        target.seedResults = [];
        await Lease.assertOwner();
        await Store.saveQueue(queue);
        await Lease.assertOwner();
        await Store.removeResultEnvelope(target.requestId, target.nonce);
        await Lease.assertOwner();
        postMessage('ERROR', target, { code, message: safeMessage, retryable: Boolean(retryable) });
        UI.status(tf('researchFailed', { message: safeMessage.slice(0, 160) }));
        return true;
    }

    async function processQueue() {
        if (Runtime.processing) return false;
        if (!await Lease.acquire()) return false;
        Runtime.processing = true;
        let activeItem = null;
        let activeTelemetryCode = '';
        try {
            await Lease.assertOwner();
            const rawQueue = await Store.get(KEYS.queue, []);
            const now = Date.now();
            const newlyExpired = Array.isArray(rawQueue) ? rawQueue.filter((entry) => isPlainObject(entry)
                && ['queued', 'running', 'awaiting-receipt'].includes(entry.status)
                && queueTime(entry.deadlineAt) !== null
                && queueTime(entry.deadlineAt) <= now) : [];
            const queue = await Store.queue();
            for (const expired of newlyExpired) {
                const awaitingReceipt = expired.status === 'awaiting-receipt';
                postMessage('ERROR', expired, {
                    code: awaitingReceipt ? 'RECEIPT_TIMEOUT' : 'REQUEST_TIMEOUT',
                    message: awaitingReceipt ? 'Research result receipt expired.' : 'Research request exceeded its time limit.',
                    retryable: !awaitingReceipt,
                });
            }
            let item = queue.find((entry) => entry.status === 'running')
                || queue.find((entry) => entry.status === 'queued');
            if (!item) return true;
            activeItem = item;
            item.status = 'running';
            item.updatedAt = Date.now();
            await Lease.assertOwner();
            await Store.saveQueue(queue);

            const seedIndex = Number.isInteger(item.seedIndex) ? item.seedIndex : 0;
            const expectedKeyword = item.payload.seedKeywords[seedIndex];
            if (!expectedKeyword) {
                let result;
                try { result = resultFromItem(item); }
                catch (error) { activeTelemetryCode = 'runtime_research_parse'; throw error; }
                const resultEnvelope = resultEnvelopeForItem(item, result);
                if (!resultEnvelope) {
                    const error = new Error('RESULT_ENVELOPE_INVALID');
                    error.telemetryCode = 'runtime_research_parse';
                    throw error;
                }
                await Lease.assertOwner();
                await saveCachedResult(item.payload, result);
                const latest = await Store.queue();
                const target = latest.find((entry) => entry.requestId === item.requestId && entry.nonce === item.nonce);
                if (!target || target.status !== 'running') return true;
                target.status = 'awaiting-receipt';
                target.result = result;
                target.resultEnvelope = resultEnvelope;
                target.updatedAt = Date.now();
                await Lease.assertOwner();
                await Store.saveQueue(latest);
                await Lease.assertOwner();
                await Store.saveResultEnvelope(resultEnvelope);
                void trackTelemetry('keyword_research_completed');
                await Lease.assertOwner();
                sendEnvelope(resultEnvelope);
                UI.status(tf('researchSent', { count: result.keywords.length }));
                return true;
            }

            UI.status(tf('researchProgress', {
                current: seedIndex + 1,
                total: item.payload.seedKeywords.length,
                keyword: expectedKeyword,
            }));

            if (normalizeKeyword(queryKeyword()) !== normalizeKeyword(expectedKeyword)) {
                item.navigationAttempts = Number(item.navigationAttempts || 0) + 1;
                if (item.navigationAttempts > 2) {
                    void trackTelemetryError('selector_keyword_navigation');
                    await failQueueItem(item, 'NAVIGATION_LOOP', 'Marketplace Insights navigation could not reach the requested keyword.', true);
                    return true;
                }
                await Lease.assertOwner();
                await Store.saveQueue(queue);
                await Lease.assertOwner();
                navigateTo(marketplaceUrl(expectedKeyword, item, 'makaytron_listing_analyzer'));
                return true;
            }

            const capture = await waitForCapture(expectedKeyword);
            try { renderCapture(capture); }
            catch (error) { activeTelemetryCode = 'runtime_research_capture'; throw error; }
            await Lease.assertOwner();
            const current = await Store.queue();
            item = current.find((entry) => entry.requestId === item.requestId && entry.nonce === item.nonce);
            if (!item || item.status !== 'running') return true;
            item.seedResults = Array.isArray(item.seedResults) ? item.seedResults : [];
            try { item.seedResults[seedIndex] = publicCapture(capture); }
            catch (error) { activeTelemetryCode = 'runtime_research_parse'; throw error; }
            item.seedIndex = seedIndex + 1;
            item.navigationAttempts = 0;
            item.updatedAt = Date.now();
            await Lease.assertOwner();
            await Store.saveQueue(current);
        } catch (error) {
            if (error?.code === 'PROCESSOR_LEASE_LOST' || error?.message === 'PROCESSOR_LEASE_LOST') {
                const current = await Lease.current();
                Lease.scheduleTakeover(current?.expiresAt);
            } else if (await Lease.owns()) {
                const telemetryCode = TELEMETRY_ALLOWED_ERROR_CODES.has(activeTelemetryCode)
                    ? activeTelemetryCode
                    : TELEMETRY_ALLOWED_ERROR_CODES.has(error?.telemetryCode) ? error.telemetryCode : 'runtime_research_queue';
                void trackTelemetryError(telemetryCode);
                if (activeItem) {
                    await failQueueItem(
                        activeItem,
                        'RESEARCH_FAILED',
                        `Marketplace Insights result could not be captured (${String(error?.message || 'unknown').slice(0, 120)}).`,
                        true,
                    );
                }
            }
        } finally {
            Runtime.processing = false;
        }
        if (Runtime.navigationPending || !await Lease.owns()) return true;
        const remaining = await Store.queue();
        if (remaining.some((entry) => ['queued', 'running'].includes(entry.status))) return processQueue();
        return true;
    }

    async function handleProbe(envelope) {
        if (!hasExactKeys(envelope.payload, ['wants'])
            || !Array.isArray(envelope.payload.wants)
            || envelope.payload.wants.some((item) => typeof item !== 'string')) return;
        if (!await Lease.acquire()) return false;
        await Lease.assertOwner();
        postMessage('CAPABILITIES', envelope, CAPABILITIES);
        const queue = await Store.queue();
        const busy = queue.some((item) => ['queued', 'running'].includes(item.status));
        postMessage('RESEARCH_READY', envelope, {
            state: busy ? 'busy' : 'ready',
            ...(busy ? { activeRequestId: queue.find((item) => ['queued', 'running'].includes(item.status))?.requestId } : {}),
        });
        let changed = false;
        for (const item of queue.filter((entry) => entry.status === 'awaiting-receipt' && isPlainObject(entry.result))) {
            const resultEnvelope = resultEnvelopeForItem(item, item.result);
            if (!resultEnvelope) continue;
            item.resultEnvelope = resultEnvelope;
            item.updatedAt = Date.now();
            changed = true;
            await Lease.assertOwner();
            await Store.saveResultEnvelope(resultEnvelope);
            await Lease.assertOwner();
            sendEnvelope(resultEnvelope);
        }
        if (changed) {
            await Lease.assertOwner();
            await Store.saveQueue(queue);
        }
        return true;
    }

    async function handleResearchRequest(envelope) {
        if (!await Lease.acquire()) return false;
        await Lease.assertOwner();
        const validated = validateResearchRequest(envelope.payload);
        if (!validated.ok) {
            postMessage('ERROR', envelope, { code: validated.code, message: 'Research request validation failed.', retryable: false });
            return true;
        }
        const queue = await Store.queue();
        const sameId = queue.find((item) => item.requestId === envelope.requestId);
        if (sameId) {
            if (sameId.nonce !== envelope.nonce) {
                postMessage('ERROR', envelope, { code: 'REQUEST_ID_CONFLICT', message: 'Request ID is already bound to another nonce.', retryable: false });
                return true;
            }
            postMessage('RESEARCH_ACK', envelope, {
                accepted: true,
                queuePosition: Math.max(0, queue.filter((item) => ['queued', 'running'].includes(item.status)).indexOf(sameId)),
            });
            if (sameId.status === 'awaiting-receipt' && isPlainObject(sameId.result)) {
                const resultEnvelope = resultEnvelopeForItem(sameId, sameId.result);
                if (resultEnvelope) {
                    sameId.resultEnvelope = resultEnvelope;
                    sameId.updatedAt = Date.now();
                    await Lease.assertOwner();
                    await Store.saveQueue(queue);
                    await Lease.assertOwner();
                    await Store.saveResultEnvelope(resultEnvelope);
                    await Lease.assertOwner();
                    sendEnvelope(resultEnvelope);
                }
            }
            return true;
        }
        if (queue.filter((item) => ['queued', 'running', 'awaiting-receipt'].includes(item.status)).length >= MAX_QUEUE_ENTRIES) {
            postMessage('ERROR', envelope, { code: 'QUEUE_FULL', message: 'Research queue reached its bounded capacity.', retryable: true });
            return true;
        }

        const cached = await cachedResult(validated.value);
        const now = Date.now();
        const item = {
            requestId: envelope.requestId,
            nonce: envelope.nonce,
            status: cached ? 'awaiting-receipt' : 'queued',
            payload: validated.value,
            createdAt: now,
            updatedAt: now,
            deadlineAt: Math.min(envelope.expiresAt, now + REQUEST_TIMEOUT_MS),
            seedIndex: 0,
            seedResults: [],
            navigationAttempts: 0,
            ...(cached ? { result: cached } : {}),
        };
        const cachedEnvelope = cached ? resultEnvelopeForItem(item, cached) : null;
        if (cached && !cachedEnvelope) {
            postMessage('ERROR', envelope, { code: 'RESULT_ENVELOPE_INVALID', message: 'Cached research result could not be safely enveloped.', retryable: true });
            return true;
        }
        if (cachedEnvelope) item.resultEnvelope = cachedEnvelope;
        queue.push(item);
        await Lease.assertOwner();
        await Store.saveQueue(queue);
        if (cachedEnvelope) {
            await Lease.assertOwner();
            await Store.saveResultEnvelope(cachedEnvelope);
        }
        const position = queue.filter((entry) => ['queued', 'running'].includes(entry.status)).findIndex((entry) => entry.requestId === item.requestId);
        postMessage('RESEARCH_ACK', item, { accepted: true, queuePosition: Math.max(0, position) });
        if (cachedEnvelope) {
            await Lease.assertOwner();
            sendEnvelope(cachedEnvelope);
        }
        else requestQueueProcessing();
        return true;
    }

    async function handleResearchReceived(envelope) {
        if (!hasExactKeys(envelope.payload, ['accepted']) || envelope.payload.accepted !== true) return;
        if (!await Lease.acquire()) return false;
        const queue = await Store.queue();
        const item = queue.find((entry) => entry.requestId === envelope.requestId && entry.nonce === envelope.nonce);
        if (!item || item.status !== 'awaiting-receipt') return true;
        const now = Date.now();
        item.status = 'completed';
        delete item.result;
        delete item.resultEnvelope;
        item.seedResults = [];
        item.updatedAt = now;
        item.terminalAt = now;
        await Lease.assertOwner();
        await Store.saveQueue(queue);
        void trackTelemetry('keyword_research_completed');
        requestQueueProcessing();
        return true;
    }

    async function handleRemoteError(envelope) {
        if (!hasExactKeys(envelope.payload, ['code', 'message', 'retryable'])) return;
        if (!['CANCELLED', 'RESULT_REJECTED'].includes(envelope.payload.code)
            || typeof envelope.payload.message !== 'string'
            || typeof envelope.payload.retryable !== 'boolean') return;
        if (!await Lease.acquire()) return false;
        const queue = await Store.queue();
        const item = queue.find((entry) => entry.requestId === envelope.requestId && entry.nonce === envelope.nonce);
        const isRejected = envelope.payload.code === 'RESULT_REJECTED';
        if (!item || (isRejected ? item.status !== 'awaiting-receipt'
            : !['queued', 'running', 'awaiting-receipt'].includes(item.status))) return true;
        const now = Date.now();
        item.status = isRejected ? 'failed' : 'cancelled';
        item.updatedAt = now;
        item.terminalAt = now;
        item.error = {
            code: envelope.payload.code,
            message: envelope.payload.message.slice(0, 300),
            retryable: false,
        };
        delete item.result;
        delete item.resultEnvelope;
        item.seedResults = [];
        await Lease.assertOwner();
        await Store.saveQueue(queue);
        await Lease.assertOwner();
        await Store.removeResultEnvelope(item.requestId, item.nonce);
        requestQueueProcessing();
        return true;
    }

    async function onChannelMessage(event) {
        const checked = validateEnvelope(event.data);
        if (!checked.ok) return;
        const envelope = checked.value;
        if (envelope.sender !== 'listing-analyzer') return;
        if (envelope.type === 'PROBE') await handleProbe(envelope);
        else if (envelope.type === 'RESEARCH_REQUEST') await handleResearchRequest(envelope);
        else if (envelope.type === 'RESEARCH_RECEIVED') await handleResearchReceived(envelope);
        else if (envelope.type === 'ERROR') await handleRemoteError(envelope);
    }

    function startChannel() {
        if (typeof BroadcastChannel !== 'function') return false;
        try {
            Runtime.channel = new BroadcastChannel(CHANNEL_NAME);
            Runtime.channel.addEventListener('message', (event) => { void onChannelMessage(event); });
            return true;
        } catch {
            Runtime.channel = null;
            return false;
        }
    }

    async function cancelActiveResearch() {
        if (!await Lease.acquire()) return false;
        const queue = await Store.queue();
        const item = queue.find((entry) => ['queued', 'running', 'awaiting-receipt'].includes(entry.status));
        if (!item) return false;
        const now = Date.now();
        item.status = 'cancelled';
        item.updatedAt = now;
        item.terminalAt = now;
        delete item.result;
        delete item.resultEnvelope;
        item.seedResults = [];
        await Lease.assertOwner();
        await Store.saveQueue(queue);
        await Lease.assertOwner();
        await Store.removeResultEnvelope(item.requestId, item.nonce);
        await Lease.assertOwner();
        postMessage('ERROR', item, { code: 'CANCELLED', message: 'Research was cancelled by the user.', retryable: false });
        requestQueueProcessing();
        return true;
    }

    async function importResearchEnvelopeText(text) {
        const source = typeof text === 'string' ? text.trim() : '';
        if (!source) throw new Error('EMPTY_RESEARCH_ENVELOPE');
        if (new TextEncoder().encode(source).byteLength > MAX_MESSAGE_BYTES) throw new Error('MESSAGE_TOO_LARGE');
        let parsed;
        try {
            parsed = JSON.parse(source);
        } catch {
            throw new Error('INVALID_JSON');
        }
        const checked = validateEnvelope(parsed);
        if (!checked.ok) throw new Error(checked.code);
        const envelope = checked.value;
        if (envelope.type !== 'RESEARCH_REQUEST') throw new Error('IMPORT_REQUIRES_RESEARCH_REQUEST');
        if (envelope.sender !== 'listing-analyzer') throw new Error('IMPORT_REQUIRES_LISTING_ANALYZER_SENDER');
        const request = validateResearchRequest(envelope.payload);
        if (!request.ok) throw new Error(request.code);
        const handled = await handleResearchRequest(envelope);
        if (handled) return { accepted: true, delegated: false, requestId: envelope.requestId };
        if (!Runtime.channel) throw new Error('PROCESSOR_TAB_BUSY');
        Runtime.channel.postMessage(envelope);
        return { accepted: true, delegated: true, requestId: envelope.requestId };
    }

    async function exportResearchResultEnvelope(requestId = '') {
        const entries = await Store.resultEnvelopes();
        const match = [...entries].reverse().find((entry) => !requestId || entry.envelope.requestId === requestId);
        return match ? JSON.parse(JSON.stringify(match.envelope)) : null;
    }

    function writeResearchJsonField(value) {
        if (!Runtime.ui?.researchJson) return false;
        Runtime.ui.researchJson.value = value;
        Runtime.ui.researchJson.focus();
        Runtime.ui.researchJson.select();
        return true;
    }

    async function copyResearchResultEnvelope(requestId = '') {
        const envelope = await exportResearchResultEnvelope(requestId);
        if (!envelope) return { ok: false, fallback: false };
        const body = JSON.stringify(envelope, null, 2);
        try {
            if (!navigator.clipboard?.writeText) throw new Error('CLIPBOARD_UNAVAILABLE');
            await navigator.clipboard.writeText(body);
            return { ok: true, fallback: false };
        } catch {
            writeResearchJsonField(body);
            try { document.execCommand?.('copy'); } catch { /* The selected field remains accessible. */ }
            return { ok: true, fallback: true };
        }
    }

    async function downloadResearchResultEnvelope(requestId = '') {
        const envelope = await exportResearchResultEnvelope(requestId);
        if (!envelope) return false;
        const safeRequestId = envelope.requestId.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80);
        return downloadJson(envelope, `makaytron-etsy-research-result-${safeRequestId}.json`);
    }

    async function clearLocalData() {
        if (!window.confirm(t('clearDataConfirm'))) return false;
        const queue = await Store.queue();
        for (const item of queue.filter((entry) => ['queued', 'running', 'awaiting-receipt'].includes(entry.status))) {
            postMessage('ERROR', item, { code: 'CANCELLED', message: 'Local research data was cleared by the user.', retryable: false });
        }
        try {
            Lease.clearTimers();
            Runtime.leaseToken = '';
            await Store.delete(KEYS.lease);
            await Promise.all([
                Store.delete(KEYS.captures),
                Store.delete(KEYS.cache),
                Store.delete(KEYS.queue),
                Store.delete(KEYS.results),
            ]);
            return true;
        } catch {
            return false;
        }
    }

    function downloadJson(value, filename = `makaytron-etsy-keyword-research-${new Date().toISOString().slice(0, 10)}.json`) {
        const body = JSON.stringify(value, null, 2);
        if (new TextEncoder().encode(body).byteLength > MAX_EXPORT_BYTES) return false;
        const blob = new Blob([body], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
        return true;
    }

    const UI = {
        mount() {
            if (document.getElementById('makaytron-etsy-keyword-market-analyzer')) return;
            const host = document.createElement('div');
            host.id = 'makaytron-etsy-keyword-market-analyzer';
            const shadow = host.attachShadow({ mode: 'open' });
            shadow.innerHTML = `
                <style>
                    :host{all:initial;--ekma-bg:#fff;--ekma-fg:#171717;--ekma-muted:#f5f5f5;--ekma-muted-fg:#595959;--ekma-border:#dedede;--ekma-input:#cfcfcf;--ekma-primary:#1f1f1f;--ekma-primary-fg:#fafafa;--ekma-danger:#b42318;--ekma-danger-soft:#fff1f0;--ekma-shadow:0 1px 3px rgba(0,0,0,.08),0 18px 44px rgba(0,0,0,.14);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ekma-fg);font-variant-numeric:tabular-nums}
                    .launcher{position:fixed;right:0;top:148px;z-index:2147483000;width:62px;height:52px;padding:0;border:1px solid #d7d7d7;border-right:0;border-radius:10px 0 0 10px;background:#fff;color:#171717;box-shadow:0 10px 26px rgba(0,0,0,.17);cursor:pointer;display:flex;align-items:center;justify-content:center}.launcher:hover{background:#f7f7f7}.launcher:focus-visible{outline:2px solid #171717;outline-offset:3px}.launcher-logo{display:block;width:43px;height:auto;object-fit:contain}
                    .panel{position:fixed;z-index:2147483000;top:12px;right:12px;bottom:12px;width:min(440px,calc(100vw - 24px));overflow:auto;overscroll-behavior:contain;box-sizing:border-box;padding:0 14px 14px;border:1px solid var(--ekma-border);border-radius:12px;background:var(--ekma-bg);color:var(--ekma-fg);box-shadow:var(--ekma-shadow);font:500 12.5px/1.45 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;scrollbar-gutter:stable}.panel[hidden],[hidden]{display:none!important}
                    .head{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:48px minmax(0,1fr) auto;align-items:center;gap:10px;margin:0 -14px 14px;padding:10px 12px 10px 14px;border-bottom:1px solid var(--ekma-border);background:#fff}.logo{width:43px;height:32px;object-fit:contain}.identity{min-width:0}.identity strong,.identity small{display:block}.identity strong{overflow:hidden;color:#171717;font-size:14px;font-weight:730;letter-spacing:-.015em;line-height:1.22;text-overflow:ellipsis}.identity small{margin-top:3px;overflow:hidden;color:var(--ekma-muted-fg);font-size:10.5px;line-height:1.25;text-overflow:ellipsis;white-space:nowrap}.version{display:inline-flex;height:20px;margin-top:5px;padding:0 7px;align-items:center;border:1px solid var(--ekma-border);border-radius:999px;background:var(--ekma-muted);color:#525252;font-size:9.5px;font-weight:700}.head-controls{display:flex;align-items:center;gap:5px}.lang,.close{min-width:32px;height:32px;padding:0;border:1px solid var(--ekma-border);border-radius:7px;background:#fff;color:#525252;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}.lang{width:auto;padding:0 7px;font:750 10px/1 Inter,system-ui,sans-serif;letter-spacing:.04em}.lang[aria-pressed="true"]{border-color:#1f1f1f;background:#1f1f1f;color:#fff}.close{font:400 21px/1 Inter,system-ui,sans-serif}.lang:hover,.close:hover{background:#f5f5f5;color:#171717}.lang[aria-pressed="true"]:hover{background:#303030;color:#fff}.lang:focus-visible,.close:focus-visible{outline:2px solid #525252;outline-offset:2px}
                    .field{display:block;margin-bottom:11px}.field span{display:block;margin-bottom:6px;color:#404040;font-size:11.5px;font-weight:700}.field input,.field textarea{width:100%;box-sizing:border-box;border:1px solid var(--ekma-input);border-radius:7px;outline:none;background:#fff;color:#171717;padding:9px 10px;font:12.5px/1.4 Inter,system-ui,sans-serif;transition:border-color .15s,box-shadow .15s}.field input{height:40px}.field textarea{min-height:112px;resize:vertical;font:10.5px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}.field input:focus,.field textarea:focus{border-color:#525252;box-shadow:0 0 0 3px rgba(23,23,23,.09)}.help{display:block;margin:-4px 0 10px;color:var(--ekma-muted-fg);font-size:10.5px;line-height:1.42}
                    .actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.actions button,.updates button{min-height:36px;padding:0 11px;border:1px solid var(--ekma-input);border-radius:7px;background:#fff;color:#171717;box-shadow:0 1px 2px rgba(0,0,0,.04);font:650 11.5px/1.2 Inter,system-ui,sans-serif;cursor:pointer}.actions button:hover,.updates button:hover{border-color:#b8b8b8;background:#f5f5f5}.actions .primary{border-color:var(--ekma-primary);background:var(--ekma-primary);color:var(--ekma-primary-fg)}.actions .primary:hover{background:#303030}.actions [data-action="cancel"],.actions [data-action="clear-data"]{border-color:#efb4ae;color:var(--ekma-danger)}.actions [data-action="cancel"]:hover,.actions [data-action="clear-data"]:hover{background:var(--ekma-danger-soft)}.actions button:focus-visible,.updates button:focus-visible{outline:2px solid #525252;outline-offset:2px}
                    .status,.update-banner{margin-top:11px;padding:10px 11px;border:1px solid var(--ekma-border);border-radius:8px;background:#fafafa;color:#404040;font-size:10.5px;line-height:1.45}.update-banner{background:#fff;color:#303030}.updates{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}.updates button{min-height:32px;padding:0 9px;font-size:10.5px}.count,.source{margin-top:9px;color:var(--ekma-muted-fg);font-size:10.5px}
                    @media(max-width:520px){.launcher{top:auto;right:0;bottom:18px}.panel{inset:8px;width:auto}.actions{grid-template-columns:1fr}.head{grid-template-columns:43px minmax(0,1fr) auto}.logo{width:39px}.identity small{display:none}.lang,.close{min-width:30px;height:30px;padding:0 6px}}
                </style>
                <button type="button" class="launcher" aria-label="${t('launcher')}" title="${t('launcher')}"><img class="launcher-logo" src="${MAKAYTRON_LOGO_URL}" alt=""></button>
                <section class="panel" aria-label="${APP.name}" hidden>
                    <div class="head">
                        <img class="logo" src="${MAKAYTRON_LOGO_URL}" alt="Makaytron">
                        <div class="identity"><strong>${APP.shortName}</strong><small>Makaytron · Marketplace Insights</small><span class="version">v${APP_VERSION}</span></div>
                        <div class="head-controls"><button type="button" class="lang" data-language="tr" aria-pressed="${language === 'tr'}">TR</button><button type="button" class="lang" data-language="en" aria-pressed="${language === 'en'}">EN</button><button type="button" class="close" aria-label="${t('close')}">×</button></div>
                    </div>
                    <label class="field"><span>${t('keyword')}</span><input type="text" maxlength="80" autocomplete="off"></label>
                    <label class="field"><span>${t('researchJson')}</span><textarea data-research-json maxlength="65536" spellcheck="false" aria-describedby="ekma-research-json-help"></textarea></label>
                    <small class="help" id="ekma-research-json-help">${t('researchJsonHelp')}</small>
                    <div class="actions">
                        <button type="button" class="primary" data-action="search">${t('search')}</button>
                        <button type="button" data-action="capture">${t('capture')}</button>
                        <button type="button" data-action="export">${t('export')}</button>
                        <button type="button" data-action="import-request">${t('importRequest')}</button>
                        <button type="button" data-action="export-result">${t('copyResult')}</button>
                        <button type="button" data-action="download-result">${t('downloadResult')}</button>
                        <button type="button" data-action="cancel">${t('cancel')}</button>
                        <button type="button" data-action="clear-data">${t('clearData')}</button>
                    </div>
                    <div class="status" role="status" aria-live="polite">${t('ready')}</div>
                    <div class="update-banner" role="status" aria-live="polite" hidden></div>
                    <div class="updates"><button type="button" data-action="check-update">${t('checkUpdate')}</button><button type="button" data-action="install-update" hidden>${t('installUpdate')}</button></div>
                    <div class="count"></div>
                    <div class="source"></div>
                </section>`;
            document.body.appendChild(host);
            Runtime.ui = {
                host,
                shadow,
                launcher: shadow.querySelector('.launcher'),
                panel: shadow.querySelector('.panel'),
                input: shadow.querySelector('input'),
                researchJson: shadow.querySelector('[data-research-json]'),
                status: shadow.querySelector('.status'),
                count: shadow.querySelector('.count'),
                version: shadow.querySelector('.version'),
                updateBanner: shadow.querySelector('.update-banner'),
                checkUpdate: shadow.querySelector('[data-action="check-update"]'),
                installUpdate: shadow.querySelector('[data-action="install-update"]'),
                source: shadow.querySelector('.source'),
            };
            Runtime.ui.input.value = queryKeyword();
            Runtime.ui.launcher.addEventListener('click', () => this.toggle());
            shadow.querySelector('.close').addEventListener('click', () => this.toggle(false));
            shadow.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', () => { void this.setLanguage(button.dataset.language); }));
            shadow.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && !Runtime.ui.panel.hidden) {
                    event.preventDefault();
                    this.toggle(false);
                }
            });
            shadow.querySelector('[data-action="search"]').addEventListener('click', () => {
                const keyword = normalizeText(Runtime.ui.input.value);
                if (!keyword) return this.status(t('invalidKeyword'));
                navigateTo(marketplaceUrl(keyword));
            });
            shadow.querySelector('[data-action="capture"]').addEventListener('click', () => { void this.captureAndSave(); });
            shadow.querySelector('[data-action="export"]').addEventListener('click', () => { void this.export(); });
            shadow.querySelector('[data-action="import-request"]').addEventListener('click', async () => {
                try {
                    const outcome = await importResearchEnvelopeText(Runtime.ui.researchJson.value);
                    this.status(tf(outcome.delegated ? 'importDelegated' : 'importAccepted', { requestId: outcome.requestId }));
                } catch (error) {
                    this.status(tf('importRejected', { message: String(error?.message || 'INVALID_ENVELOPE').slice(0, 120) }));
                }
                await this.refreshCount();
            });
            shadow.querySelector('[data-action="export-result"]').addEventListener('click', async () => {
                const outcome = await copyResearchResultEnvelope();
                this.status(!outcome.ok ? t('resultMissing') : t(outcome.fallback ? 'clipboardError' : 'resultCopied'));
            });
            shadow.querySelector('[data-action="download-result"]').addEventListener('click', async () => {
                this.status(await downloadResearchResultEnvelope() ? t('resultDownloaded') : t('resultMissing'));
            });
            shadow.querySelector('[data-action="cancel"]').addEventListener('click', async () => {
                this.status(await cancelActiveResearch() ? t('queueCancelled') : t('queueEmpty'));
                await this.refreshCount();
            });
            shadow.querySelector('[data-action="clear-data"]').addEventListener('click', async () => {
                this.status(await clearLocalData() ? t('clearDataDone') : t('clearDataError'));
                await this.refreshCount();
            });
            Runtime.ui.checkUpdate.addEventListener('click', () => { void checkForUpdates({ manual: true, force: true }); });
            Runtime.ui.installUpdate.addEventListener('click', () => { void openUpdatePage(); });
            void this.refreshCount();
            void updateState().then(renderUpdateState);
        },
        toggle(force) {
            if (!Runtime.ui) return;
            const open = force ?? Runtime.ui.panel.hidden;
            Runtime.ui.panel.hidden = !open;
            if (open) {
                telemetryPanelOpened();
                Runtime.ui.input.focus();
            }
            else Runtime.ui.launcher.focus();
        },
        async setLanguage(next) {
            if (!['tr', 'en'].includes(next) || next === language) return;
            language = next;
            await Store.set(KEYS.settings, { language });
            Runtime.ui?.host.remove();
            Runtime.ui = null;
            document.querySelectorAll('[data-ekma-inline]').forEach((element) => element.remove());
            this.mount();
            const capture = captureCurrentPage();
            if (capture) renderCapture(capture);
            this.toggle(true);
        },
        status(message) {
            if (Runtime.ui) Runtime.ui.status.textContent = message;
        },
        async captureAndSave(timeoutMs = DOM_RESULT_TIMEOUT_MS) {
            const expectedKeyword = queryKeyword();
            if (!expectedKeyword) {
                this.status(t('noResult'));
                return false;
            }
            try {
                const capture = await waitForCapture(expectedKeyword, timeoutMs);
                renderCapture(capture);
                await saveCapture(capture);
                void trackTelemetry('keyword_research_completed');
                this.status(t('captured'));
                await this.refreshCount();
                return true;
            } catch (error) {
                const telemetryCode = TELEMETRY_ALLOWED_ERROR_CODES.has(error?.telemetryCode)
                    ? error.telemetryCode
                    : 'runtime_research_capture';
                void trackTelemetryError(telemetryCode);
                this.status(t('noResult'));
                return false;
            }
        },
        async export() {
            const captures = await Store.captures();
            const downloaded = downloadJson({
                schema: 'makaytron-keyword-market-analyzer-export/v1',
                exportedAt: new Date().toISOString(),
                app: { name: APP.name, version: APP_VERSION },
                captures: captures.map((entry) => entry.capture).filter(isPlainObject),
            });
            if (!downloaded) this.status(t('exportTooLarge'));
        },
        async refreshCount() {
            if (!Runtime.ui) return;
            const captures = await Store.captures();
            Runtime.ui.count.textContent = `${t('saved')}: ${captures.length}`;
        },
    };

    function installDomObserver() {
        Runtime.observer?.disconnect();
        const scope = document.querySelector('main') || document.body;
        if (!scope) return;
        Runtime.observer = new MutationObserver(() => {
            window.clearTimeout(Runtime.observerTimer);
            Runtime.observerTimer = window.setTimeout(() => {
                const capture = captureCurrentPage();
                if (capture) renderCapture(capture);
            }, OBSERVER_DEBOUNCE_MS);
        });
        Runtime.observer.observe(scope, { childList: true, subtree: true, characterData: true });
    }

    function registerMenuCommands() {
        if (typeof GM_registerMenuCommand !== 'function') return;
        GM_registerMenuCommand(t('launcher'), () => UI.toggle(true));
        GM_registerMenuCommand(t('capture'), () => { void UI.captureAndSave(); });
        GM_registerMenuCommand(t('export'), () => { void UI.export(); });
        GM_registerMenuCommand(t('importRequest'), () => {
            UI.toggle(true);
            Runtime.ui?.researchJson.focus();
        });
        GM_registerMenuCommand(t('copyResult'), async () => {
            const outcome = await copyResearchResultEnvelope();
            UI.status(!outcome.ok ? t('resultMissing') : t(outcome.fallback ? 'clipboardError' : 'resultCopied'));
        });
        GM_registerMenuCommand(t('clearData'), async () => {
            UI.status(await clearLocalData() ? t('clearDataDone') : t('clearDataError'));
            await UI.refreshCount();
        });
        GM_registerMenuCommand(t('checkUpdate'), () => { void checkForUpdates({ manual: true, force: true }); });
    }

    async function boot() {
        if (!SUPPORTED_ROUTE.test(location.pathname)) return;
        const settings = await Store.get(KEYS.settings, null);
        if (isPlainObject(settings) && ['tr', 'en'].includes(settings.language)) language = settings.language;
        await ensureUniqueTabIdentity();
        UI.mount();
        const capture = captureCurrentPage();
        if (capture) renderCapture(capture);
        installDomObserver();
        registerMenuCommands();
        registerTelemetryMenuCommand();
        startChannel();
        await Store.cache();
        await processQueue();
        if (!window.__EKMA_DISABLE_AUTO_UPDATE__) {
            window.setTimeout(() => { void checkForUpdates({ manual: false, force: false }); }, 1500);
        }
    }

    if (window.__EKMA_SKIP_INIT__) {
        window.__EKMA_TEST__ = {
            APP,
            APP_VERSION,
            CHANNEL_NAME,
            ENVELOPE_SCHEMA,
            REQUEST_SCHEMA,
            RESULT_SCHEMA,
            CAPABILITIES,
            GITHUB_RAW_SCRIPT_URL,
            UPDATE_CHECK_INTERVAL_MS,
            UPDATE_CHECK_STALE_MS,
            KEYS,
            Contract: { validateEnvelope, validateResearchRequest, makeEnvelope },
            Store,
            Lease,
            ensureUniqueTabIdentity,
            UI,
            Runtime,
            parseCompactNumber,
            parsePercent,
            opportunityFor,
            captureCurrentPage,
            publicCapture,
            renderCapture,
            waitForCapture,
            saveCapture,
            marketplaceUrl,
            handleResearchRequest,
            handleResearchReceived,
            handleRemoteError,
            onChannelMessage,
            processQueue,
            pruneQueue: () => Store.queue(),
            importResearchEnvelopeText,
            exportResearchResultEnvelope,
            copyResearchResultEnvelope,
            downloadResearchResultEnvelope,
            cancelActiveResearch,
            clearLocalData,
            installationSource,
            compareSemver,
            checkForUpdates,
            openUpdatePage,
            boot,
        };
    } else {
        void boot();
    }
})();
