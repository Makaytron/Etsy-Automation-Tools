// ==UserScript==
// @name         Makaytron Etsy Listing Analyzer
// @name:tr      Makaytron Etsy Listing Analyzer
// @name:en      Makaytron Etsy Listing Analyzer
// @version      1.2.2
// @description  Etsy listing performansını izleyin, geçmişle karşılaştırın ve kullanıcı onaylı iyileştirme kuyrukları hazırlayın.
// @description:tr Etsy listing performansını izleyin, geçmişle karşılaştırın ve kullanıcı onaylı iyileştirme kuyrukları hazırlayın.
// @description:en Track Etsy listing performance, compare history, and prepare user-approved improvement queues.
// @namespace    https://github.com/Makaytron/EtsyScript
// @author       Makaytron (@Makaytron)
// @license      MIT
// @antifeature  tracking
// @homepageURL  https://github.com/Makaytron/Etsy-Automation-Tools/tree/main/scripts/etsy-listing-analyzer
// @supportURL   https://github.com/Makaytron/Etsy-Automation-Tools/issues
// @updateURL    https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-listing-analyzer/Makaytron-Etsy-Listing-Analyzer.user.js
// @downloadURL  https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-listing-analyzer/Makaytron-Etsy-Listing-Analyzer.user.js
// @match        https://www.etsy.com/your/shops/*/tools/listings*
// @match        https://www.etsy.com/your/shops/*/listing-editor/edit/*
// @icon         https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/assets/makaytron-logo.png
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM.addValueChangeListener
// @grant        GM.xmlHttpRequest
// @grant        GM.openInTab
// @grant        GM_info
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @connect      raw.githubusercontent.com
// @connect      sjwibgcflufmzaorlwqe.supabase.co
// @connect      api.github.com
// @noframes
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const APP_VERSION = '1.2.2';
    const TELEMETRY_ENDPOINT = 'https://sjwibgcflufmzaorlwqe.supabase.co/functions/v1/telemetry-ingest';
    const TELEMETRY_HEADER_NAME = 'x-makaytron-telemetry';
    const TELEMETRY_HEADER_VALUE = '1';
    const TELEMETRY_SCRIPT_ID = 'etsy-listing-analyzer';
    const TELEMETRY_ALLOWED_EVENTS = new Set(['script_opened', 'listing_full_scan_completed']);
    const TELEMETRY_ALLOWED_ERROR_CODES = new Set(['selector_listing_cards', 'selector_listing_pagination', 'selector_listing_editor', 'selector_listing_publish_verify', 'selector_listing_deactivate_verify', 'runtime_listing_scan', 'storage_listing_state']);
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
    let telemetryMenuCommandId = null;
    let telemetryMenuLanguage = '';

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
        notice.setAttribute('lang', state.settings.language);
        notice.style.cssText = 'all:initial;position:fixed;left:16px;bottom:16px;z-index:2147483647;box-sizing:border-box;width:min(380px,calc(100vw - 32px));padding:14px;border:1px solid #d6d6d6;border-radius:10px;background:#fff;color:#202020;box-shadow:0 16px 42px rgba(0,0,0,.2);font:13px/1.45 Inter,system-ui,sans-serif';
        notice.innerHTML = `<strong style="display:block;margin-bottom:5px;font-size:14px">${escapeHtml(t('telemetryTitle'))}</strong><span data-message style="display:block;color:#525252">${escapeHtml(t('telemetryNoticeBody'))}</span><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:11px"><a href="${TELEMETRY_PRIVACY_URL}" target="_blank" rel="noopener noreferrer" style="align-self:center;color:#303030;font-weight:650">${escapeHtml(t('telemetryPrivacy'))}</a><button type="button" data-disable style="margin-left:auto;padding:7px 9px;border:1px solid #d8a8a8;border-radius:7px;background:#fff;color:#991b1b;font:650 11px/1.2 system-ui;cursor:pointer">${escapeHtml(t('telemetryDisableDeleteShort'))}</button><button type="button" data-close style="padding:7px 10px;border:1px solid #202020;border-radius:7px;background:#202020;color:#fff;font:650 11px/1.2 system-ui;cursor:pointer">${escapeHtml(t('telemetryGotIt'))}</button></div>`;
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
                ? t('telemetryDisableFailedMenu')
                : result.deleted
                    ? t('telemetryDisabledDeleted')
                    : t('telemetryDisabledCleanupMenu');
            button.disabled = false;
        });
    }

    function installStandaloneDialogBehavior(overlay, initialFocusSelector = '[data-close]') {
        const shadowActive = state.shadow?.activeElement;
        const activeBeforeOpen = shadowActive instanceof HTMLElement ? shadowActive : document.activeElement;
        const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            overlay.remove();
            if (activeBeforeOpen instanceof HTMLElement && activeBeforeOpen.isConnected) activeBeforeOpen.focus();
        };
        overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
        overlay.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close();
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = Array.from(overlay.querySelectorAll(focusableSelector)).filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
            if (!focusable.length) { event.preventDefault(); return; }
            const first = focusable[0];
            const last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        });
        requestAnimationFrame(() => {
            const target = overlay.querySelector(initialFocusSelector) || overlay.querySelector(focusableSelector);
            if (!closed && target instanceof HTMLElement) target.focus();
        });
        return close;
    }

    async function openTelemetrySettings() {
        const modalId = `makaytron-telemetry-settings-${TELEMETRY_SCRIPT_ID}`;
        if (!document.documentElement || document.getElementById(modalId)) return;
        const modal = document.createElement('div');
        modal.id = modalId;
        modal.setAttribute('lang', state.settings.language);
        modal.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.42);font:13px/1.45 Inter,system-ui,sans-serif';
        modal.innerHTML = `<section role="dialog" aria-modal="true" aria-labelledby="${modalId}-title" style="box-sizing:border-box;width:min(440px,100%);padding:18px;border:1px solid #d6d6d6;border-radius:12px;background:#fff;color:#202020;box-shadow:0 20px 60px rgba(0,0,0,.28)"><h2 id="${modalId}-title" style="margin:0 0 7px;font-size:17px">${escapeHtml(t('telemetryTitle'))}</h2><p data-state style="margin:0;color:#525252"></p><p data-result role="status" aria-live="polite" style="min-height:20px;margin:9px 0 0;color:#525252"></p><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px"><a href="${TELEMETRY_PRIVACY_URL}" target="_blank" rel="noopener noreferrer" style="align-self:center;color:#303030;font-weight:650">${escapeHtml(t('telemetryPrivacyPolicy'))}</a><button type="button" data-enable style="margin-left:auto;padding:8px 10px;border:1px solid #b8b8b8;border-radius:7px;background:#fff;color:#202020;font:650 12px/1.2 system-ui;cursor:pointer">${escapeHtml(t('telemetryEnable'))}</button><button type="button" data-disable style="padding:8px 10px;border:1px solid #d8a8a8;border-radius:7px;background:#fff;color:#991b1b;font:650 12px/1.2 system-ui;cursor:pointer">${escapeHtml(t('telemetryDisableDelete'))}</button><button type="button" data-close style="padding:8px 10px;border:1px solid #202020;border-radius:7px;background:#202020;color:#fff;font:650 12px/1.2 system-ui;cursor:pointer">${escapeHtml(t('close'))}</button></div></section>`;
        document.documentElement.appendChild(modal);
        const closeModal = installStandaloneDialogBehavior(modal, '[data-close]');
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
                ? t('telemetryStatusEnabled')
                : enabledState === 'disabled'
                    ? t('telemetryStatusDisabled')
                    : t('telemetryStatusUnavailable');
            if (output) output.textContent = result || '';
            if (enableButton) enableButton.hidden = enabledState === 'enabled';
        };
        modal.querySelector('[data-close]')?.addEventListener('click', closeModal);
        modal.querySelector('[data-enable]')?.addEventListener('click', async () => {
            await renderState(await enableTelemetry() ? t('telemetryEnabled') : t('telemetrySaveFailed'));
        });
        modal.querySelector('[data-disable]')?.addEventListener('click', async () => {
            const result = await disableTelemetryAndDelete();
            await renderState(!result.disabled
                ? t('telemetryDisableFailedHere')
                : result.deleted
                    ? t('telemetryDisabledDeleted')
                    : t('telemetryDisabledCleanupHere'));
        });
        await renderState('');
    }

    function telemetryPanelOpened() {
        if (telemetrySuppressed()) return;
        void showTelemetryFirstRunNotice()
            .then(() => trackTelemetry('script_opened'))
            .catch(() => {});
    }

    function registerTelemetryMenuCommand(force = false) {
        const language = state.settings.language;
        if (telemetryMenuRegistered && !force && telemetryMenuLanguage === language) return;
        try {
            if (telemetryMenuRegistered && telemetryMenuCommandId != null) {
                if (typeof GM_unregisterMenuCommand === 'function') GM_unregisterMenuCommand(telemetryMenuCommandId);
                else if (typeof GM !== 'undefined' && typeof GM.unregisterMenuCommand === 'function') GM.unregisterMenuCommand(telemetryMenuCommandId);
                telemetryMenuRegistered = false;
                telemetryMenuCommandId = null;
            } else if (telemetryMenuRegistered) return;
            if (typeof GM_registerMenuCommand === 'function') telemetryMenuCommandId = GM_registerMenuCommand(`Makaytron · ${t('telemetryMenu')}`, openTelemetrySettings);
            else if (typeof GM !== 'undefined' && typeof GM.registerMenuCommand === 'function') telemetryMenuCommandId = GM.registerMenuCommand(`Makaytron · ${t('telemetryMenu')}`, openTelemetrySettings);
            else return;
            telemetryMenuRegistered = true;
            telemetryMenuLanguage = language;
        } catch {}
    }

    const RECORD_SCHEMA_VERSION = 2;
    const HEALTH_RESULT_SCHEMA_VERSION = 2;
    const QUEUE_SCHEMA_VERSION = 2;
    const HEALTH_ENGINE_VERSION = 7;
    const HEALTH_POLICY_VERSION = 3;
    const COLLECTION_SCHEMA_VERSION = 4;
    const LISTING_METRIC_CONTRACT = Object.freeze({
        id: 'etsy-listings-stats-card/v1',
        parserVersion: 5,
        scopes: Object.freeze({
            visits: 'rolling-30d', favorites: 'rolling-30d',
            sales: 'lifetime', revenue: 'lifetime', renewals: 'lifetime',
        }),
        rollingHeadings: Object.freeze(['last 30 days', 'son 30 gün', 'son 30 gun']),
        lifetimeHeadings: Object.freeze(['all time', 'tüm zamanlar', 'tum zamanlar']),
    });
    const MAX_COLLECTION_PAGES = 250;
    const COLLECTION_TRANSITION_TIMEOUT_MS = 15000;
    const COLLECTION_RETRY_ATTEMPTS = 3;
    const COLLECTION_RETRY_DELAYS_MS = Object.freeze([800, 1800]);
    const COLLECTION_STABLE_SAMPLES = 3;
    const COLLECTION_STABLE_SAMPLE_INTERVAL_MS = 250;
    const COLLECTION_STABLE_READ_TIMEOUT_MS = 4000;
    const SNAPSHOT_OBSERVATION_MAX_SKEW_MS = 15 * 60 * 1000;
    const SNAPSHOT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
    const DISPLAY_TIME_ZONE = 'UTC';
    const ANALYSIS_BATCH_SIZE = 40;
    const ANALYSIS_SEARCH_DEBOUNCE_MS = 180;
    const ANALYSIS_FRESHNESS_MS = 24 * 60 * 60 * 1000;
    const MAX_FILTER_PRESETS = 8;
    const MAX_BACKUP_RECORDS = 5000;
    const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
    const STORAGE_WARNING_BYTES = 8 * 1024 * 1024;
    const MAX_FEEDBACK_ENTRIES = 20;
    const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
    const UPDATE_CHECK_TIMEOUT_MS = 12000;
    const GITHUB_SCRIPT_PATH = 'scripts/etsy-listing-analyzer/Makaytron-Etsy-Listing-Analyzer.user.js';
    const GITHUB_RAW_REPOSITORY_URL = 'https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools';
    const GITHUB_CANONICAL_SCRIPT_URL = `${GITHUB_RAW_REPOSITORY_URL}/main/${GITHUB_SCRIPT_PATH}`;
    const GITHUB_API_REF_URL = 'https://api.github.com/repos/Makaytron/Etsy-Automation-Tools/commits/main';
    const RESEARCH_CHANNEL_NAME = 'makaytron:etsy-keyword-market-analyzer:v1';
    const RESEARCH_ENVELOPE_SCHEMA = 'makaytron-etsy-keyword-market-analyzer-envelope/v1';
    const RESEARCH_REQUEST_SCHEMA = 'makaytron-listing-research-request/v1';
    const RESEARCH_RESULT_SCHEMA = 'makaytron-listing-research-result/v1';
    const RESEARCH_EVIDENCE_SCHEMA = 'makaytron-research-evidence/v1';
    const RESEARCH_INSTALL_URL = 'https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-keyword-market-analyzer/Makaytron-Etsy-Keyword-Market-Analyzer.user.js';
    const RESEARCH_INSIGHTS_URL = 'https://www.etsy.com/your/shops/me/marketplace-insights/search';
    const RESEARCH_MESSAGE_MAX_BYTES = 64 * 1024;
    const RESEARCH_REQUEST_TTL_MS = 10 * 60 * 1000;
    const RESEARCH_MAX_TTL_MS = 30 * 60 * 1000;
    const RESEARCH_PROBE_TIMEOUT_MS = 3600;
    const RESEARCH_PROBE_RETRY_DELAYS_MS = Object.freeze([0, 600, 1500, 2600]);
    const RESEARCH_UI_TIMEOUT_MS = 2 * 60 * 1000;
    const RESEARCH_MAX_PENDING = 10;
    const RESEARCH_REMOTE_MAX_QUEUE = 30;
    const STORAGE_MUTATION_LOCK = 'makaytron-listing-analyzer:storage-mutation';
    const COLLECTION_HANDOFF_KEY = 'meli:v1:collection-navigation-handoff';
    const APP = Object.freeze({
        name: 'Makaytron Etsy Listing Analyzer',
        shortName: 'Listing Analyzer',
        storagePrefix: 'meli:v1',
        schema: RECORD_SCHEMA_VERSION,
        retentionDays: 400,
        maxSnapshots: 120,
        maxImprovements: 80,
        maxAuditEntries: 300,
    });
    const HEALTH_RULES = Object.freeze({
        anchorToleranceDays: Object.freeze({ 30: 7, 60: 10, 90: 14 }),
        minimumCohortSize: 8,
        fullStrengthCohortSize: 30,
        minimumCalibrationSize: 20,
        minimumCalibrationGroupSize: 8,
        favoritePriorRate: 3,
        favoritePriorVisits: 20,
        renewalWasteMinimum: 2,
        deactivationHistoryDays: 60,
        deactivationZeroObservationGapDays: 14,
        improvementCooldownDays: 45,
        experimentDays: 30,
        experimentEvaluationGraceDays: 7,
        experimentBaselineMaxAgeDays: 1,
        experimentConfidenceLevel: 0.95,
        maximumExactExperimentEvents: 1_000_000,
        experimentMatchedWindowToleranceDays: 0.25,
        recentSaleProtectionDays: 30,
        zeroBaselineGrowthMinimumVisits: 10,
    });
    const SNAPSHOT_NUMBER_FIELDS = Object.freeze(['visits', 'favorites', 'sales', 'revenue', 'renewals', 'stock', 'priceMin', 'priceMax']);
    const HEALTH_METRIC_FIELDS = Object.freeze(['visits', 'favorites', 'sales', 'revenue', 'renewals']);
    const DECISION_COUNT_FIELDS = Object.freeze(['visits', 'favorites', 'sales', 'renewals']);
    const EDITABLE_FIELDS = Object.freeze(['title', 'description', 'tags', 'materials']);

    const KEYS = Object.freeze({
        settings: `${APP.storagePrefix}:settings`,
        uiPreferences: `${APP.storagePrefix}:ui-preferences`,
        index: `${APP.storagePrefix}:listing-index`,
        queue: `${APP.storagePrefix}:queue`,
        audit: `${APP.storagePrefix}:audit`,
        lease: `${APP.storagePrefix}:lease`,
        collection: `${APP.storagePrefix}:collection`,
        collectionLease: `${APP.storagePrefix}:collection-lease`,
        analysisFilters: `${APP.storagePrefix}:analysis-filters`,
        filterPresets: `${APP.storagePrefix}:filter-presets`,
        updateCheck: `${APP.storagePrefix}:update-check`,
        aiRequests: `${APP.storagePrefix}:ai-requests`,
        feedback: `${APP.storagePrefix}:feedback`,
        researchRequests: `${APP.storagePrefix}:research-requests`,
        record: (listingId) => `${APP.storagePrefix}:listing:${listingId}`,
    });

    const DEFAULT_SETTINGS = Object.freeze({
        language: 'tr',
        collapsed: false,
        minVisitsToImprove: 20,
        minVisitsToProtect: 60,
        minRenewalsToReview: 2,
        declinePercent: 35,
        retentionDays: APP.retentionDays,
        maxSnapshots: APP.maxSnapshots,
    });
    const UI_SETTING_FIELDS = Object.freeze(['language', 'collapsed']);
    const HEALTH_SETTING_FIELDS = Object.freeze([
        'minVisitsToImprove', 'minVisitsToProtect', 'minRenewalsToReview', 'declinePercent',
        'retentionDays', 'maxSnapshots',
    ]);
    const HEALTH_THRESHOLD_CONTRACTS = Object.freeze({
        minVisitsToImprove: Object.freeze({ min: 1, max: 999999, step: 1, help: 'thresholdHelpImprove' }),
        minVisitsToProtect: Object.freeze({ min: 2, max: 1000000, step: 1, help: 'thresholdHelpProtect' }),
        minRenewalsToReview: Object.freeze({ min: 1, max: 1000000, step: 1, help: 'thresholdHelpRenewals' }),
        declinePercent: Object.freeze({ min: 1, max: 100, step: 1, help: 'thresholdHelpDecline' }),
    });

    const DEFAULT_ANALYSIS_FILTERS = Object.freeze({
        scope: 'all',
        lifecycle: '',
        diagnosis: '',
        recommendation: '',
        performance: '',
        trend: '',
        stock: '',
        confidence: '',
        sort: 'priority',
    });

    const BUILTIN_FILTER_PRESETS = Object.freeze([
        Object.freeze({ id: 'growing', labelKey: 'presetGrowing', filters: Object.freeze({ lifecycle: 'ACTIVE_GROWING' }) }),
        Object.freeze({ id: 'improve', labelKey: 'presetImprove', filters: Object.freeze({ recommendation: 'improve' }) }),
        Object.freeze({ id: 'declining', labelKey: 'presetDeclining', filters: Object.freeze({ lifecycle: 'ACTIVE_DECLINING' }) }),
        Object.freeze({ id: 'deactivate', labelKey: 'presetDeactivate', filters: Object.freeze({ lifecycle: 'DEACTIVATION_REVIEW' }) }),
        Object.freeze({ id: 'experiments', labelKey: 'presetExperiments', filters: Object.freeze({ lifecycle: 'EXPERIMENT_RUNNING' }) }),
        Object.freeze({ id: 'missing', labelKey: 'presetMissing', filters: Object.freeze({ performance: 'missing' }) }),
    ]);
    const FILTER_FACET_VALUES = Object.freeze({
        scope: Object.freeze(['all', 'page']),
        lifecycle: Object.freeze(['', 'DATA_GAP', 'BASELINE', 'LEARNING', 'ACTIVE_STABLE', 'ACTIVE_GROWING', 'ACTIVE_DECLINING', 'PROTECTED', 'EXPERIMENT_RUNNING', 'DORMANT', 'DEACTIVATION_REVIEW', 'INACTIVE']),
        diagnosis: Object.freeze(['', 'DISCOVERY_WEAK', 'ENGAGEMENT_WEAK', 'PURCHASE_FRICTION', 'SCALE_DISCOVERY', 'HEALTHY_OR_MIXED', 'INSUFFICIENT_SIGNAL']),
        recommendation: Object.freeze(['', 'improve', 'declining', 'deactivateReview', 'protected', 'monitor', 'waiting', 'growing']),
        performance: Object.freeze(['', 'sales', 'traffic-no-sales', 'no-activity', 'missing']),
        trend: Object.freeze(['', 'rising', 'falling', 'stable', 'unknown']),
        stock: Object.freeze(['', 'in', 'out', 'unknown']),
        confidence: Object.freeze(['', 'low', 'medium', 'high']),
    });

    const I18N = Object.freeze({
        tr: Object.freeze({
            launcher: 'Listing Analyzer panelini aç',
            panelAria: 'Makaytron Etsy Listing Analyzer kontrol paneli',
            product: 'Listing Analyzer',
            overview: 'Genel bakış',
            wideView: 'Geniş görünüm',
            compactView: 'Dar görünüm',
            ready: 'Hazır',
            scanning: 'Taranıyor',
            error: 'Hata',
            blocked: 'Durduruldu',
            saved: 'Kaydedildi',
            collapse: 'Paneli gizle',
            expand: 'Paneli aç',
            switchLanguage: 'Switch to English',
            pageReady: 'Bu sayfadaki listingler analiz için hazır.',
            editorReady: 'Bu listing için düzenleme ve işlem kuyruğu hazır.',
            unsupportedPage: 'Bu araç yalnız listing listesi ve listing düzenleyicisinde çalışır.',
            scanPage: 'Bu sayfayı tara',
            scanAndNext: 'Tara ve sonraki sayfayı aç',
            openAnalysis: 'Listing analizleri',
            aiExchange: 'AI önerileri',
            exportData: 'Yedek indir',
            queueTitle: 'İşlem kuyruğu',
            noQueue: 'Aktif işlem kuyruğu yok.',
            listings: 'Kayıtlı listing',
            pageListings: 'Bu sayfa',
            growing: 'Yükselişte',
            improve: 'İyileştir',
            deactivateReview: 'Kapatmayı incele',
            protected: 'Korunmalı',
            monitor: 'İzle',
            waiting: 'Veri bekleniyor',
            declining: 'Düşüşte',
            scanComplete: '{count} listing okundu; {saved} kayıt güncellendi.',
            noCards: 'Listing kartları bulunamadı. Etsy istatistik görünümünü açın.',
            nextMissing: 'Sonraki sayfa düğmesi bulunamadı veya devre dışı.',
            pageProgress: 'Sayfa {current}/{total}',
            analysisTitle: 'Listing analizleri',
            search: 'Başlık, SKU veya ID ara',
            filterAll: 'Tüm öneriler',
            selected: '{count} seçili',
            selectAll: 'Görünenleri seç',
            clearSelection: 'Seçimi kaldır',
            listing: 'Listing',
            performance: 'Performans',
            recommendation: 'Öneri',
            trend: 'Değişim',
            actions: 'İşlemler',
            visits: 'Ziyaret',
            favorites: 'Favori',
            sales: 'Satış',
            revenue: 'Gelir',
            renewals: 'Yenileme',
            stock: 'Stok',
            price: 'Fiyat',
            noData: 'Henüz kayıtlı listing yok.',
            editProposal: 'İyileştirme planı',
            history: 'Geçmiş',
            openEtsy: 'Etsy’de aç',
            proposalTitle: 'Listing iyileştirme önerisi',
            actionLabel: 'Planlanan işlem',
            actionUpdate: 'Seçtiğim alanları güncelle',
            actionDeactivate: 'Deaktivasyonu öner (listing silinmez)',
            actionSkip: 'İşlem yapma',
            title: 'Başlık',
            description: 'Açıklama',
            tags: 'Etiketler',
            materials: 'Materyaller',
            tagsHelp: 'Virgülle ayırın; en fazla 13 etiket ve etiket başına 20 karakter.',
            materialsHelp: 'Virgülle ayırın.',
            reason: 'Gerekçe / not',
            saveProposal: 'Öneriyi kaydet',
            cancel: 'İptal',
            close: 'Kapat',
            invalidTitle: 'Başlık 1–140 karakter olmalı.',
            invalidTags: 'En fazla 13 etiket kullanılabilir ve her etiket 20 karakteri geçemez.',
            changeField: 'Bu alanı değiştir',
            selectChangeField: 'UPDATE işlemi için değiştirilecek en az bir alan seçin.',
            proposalSaved: 'Öneri kaydedildi ve iyileştirme geçmişine başlangıç kaydı eklendi.',
            buildQueue: 'Seçilenlerden kuyruk hazırla',
            queueConfirm: '{count} listing için kullanıcı onaylı işlem kuyruğu hazırlansın mı? Hiçbir listing bu onayla otomatik yayımlanmayacak.',
            queueCreated: '{count} listing işlem kuyruğuna eklendi.',
            noProposalSelection: 'Seçmek tek başına kuyruk oluşturmaz. Önce İyileştirme planı’nda uygulanabilir bir işlem kaydedin veya geçerli AI öneri JSON’unu içe aktarın; ardından kaydedilmiş önerisi olan listingi seçip yeniden deneyin.',
            goFirst: 'İlk listingi aç',
            currentItem: 'Kuyruk {current}/{total}',
            applyForm: 'Öneriyi forma uygula',
            publishAfterReview: 'İnceledim, Etsy’de yayımla',
            openDeactivate: 'Etsy’de deaktive et',
            deactivateConfirm: '{id} numaralı listingi deaktive etmek istediğinizi onaylıyor musunuz? Script yalnız tam eşleşen Deactivate öğesine ve Etsy’nin son Deactivate onayına tıklar; Delete öğesine asla tıklamaz.',
            deactivateLegacyConfirm: '{id} numaralı listing eski manuel deaktivasyon adımında bekliyor ve hâlâ Active görünüyor. Bu listing için yeni v1.0.12 otomatik Deactivate akışını başlatmak istediğinizi onaylıyor musunuz? Delete öğesine asla tıklanmaz.',
            verifyDeactivate: 'Deaktivasyonu doğrula ve devam et',
            skipItem: 'Bu listingi atla',
            stopQueue: 'Kuyruğu durdur',
            continueQueue: 'Sonraki listing',
            routeMismatch: 'Kuyruk listing ID’si ile açık sayfa uyuşmuyor. İşlem güvenli biçimde durduruldu.',
            formNotReady: 'Gerekli Etsy form alanları hazır değil; hiçbir değişiklik uygulanmadı.',
            formApplied: 'Öneri forma uygulandı. Etsy alanlarını inceleyin; henüz yayımlanmadı.',
            publishDisabled: 'Etsy “Publish changes” düğmesi etkin değil. Form doğrulamalarını kontrol edin.',
            publishConfirm: 'Listing {id} için {fields} alanlarını Etsy’de yayımlamak istediğinizi onaylıyor musunuz?',
            publishSubmitted: 'Yayınlama Etsy’ye gönderildi; sonuç doğrulanıyor.',
            publishVerified: 'Etsy kaydı doğrulandı. İşlem geçmişe kaydedildi.',
            publishUnverified: 'Etsy sonucu doğrulanamadı. Körlemesine sonraki listinge geçilmedi.',
            deactivateOpened: 'Script Etsy deaktivasyonunu gönderdi; sonuç doğrulanıyor. Delete işlemi hiçbir zaman kullanılmaz.',
            deactivateVerified: 'Etsy deaktivasyonu doğrulandı ve işlem geçmişine eklendi.',
            deactivateNotVerified: 'Listing hâlâ aktif görünüyor; kuyruk ilerletilmedi.',
            deactivateUnverified: 'Deaktivasyon Etsy’ye gönderilmiş olabilir ancak sonuç doğrulanamadı. Çift işlem riskine karşı otomatik tekrar kapalıdır; listing durumunu doğrulayın veya kuyruğu durdurun.',
            queueStopped: 'İşlem kuyruğu durduruldu.',
            queueComplete: 'İşlem kuyruğu tamamlandı.',
            aiTitle: 'AI öneri alışverişi',
            aiIntro: 'Bu sürüm AI servisine ağ isteği göndermez. Seçili listingleri prompt/JSON olarak kopyalayın; AI sonucunu aşağıya yapıştırıp doğrulayın.',
            copyAiRequest: 'AI isteğini kopyala',
            importAiResponse: 'AI yanıtını içe aktar',
            aiResponseLabel: 'AI öneri JSON’u',
            aiCopied: '{count} listing için AI istek paketi panoya kopyalandı.',
            aiImportSuccess: '{count} geçerli AI önerisi içe aktarıldı.',
            aiImportError: 'AI JSON’u doğrulanamadı: {message}',
            selectForAi: 'Önce listing analiz kartlarından seçim yapın.',
            exportComplete: 'Yerel analiz yedeği indirildi.',
            historyTitle: 'Analiz ve iyileştirme geçmişi',
            capturedAt: 'Kayıt zamanı',
            changes: 'Değişiklikler',
            baseline: 'Başlangıç',
            latest: 'Güncel',
            noHistory: 'Karşılaştırma için en az iki farklı gün kaydı gerekir.',
            settingsTitle: 'Analiz eşikleri',
            minVisitsToImprove: 'Satış yoksa iyileştirme eşiği (ziyaret)',
            minVisitsToProtect: 'Güçlü listing ziyaret eşiği',
            minRenewalsToReview: 'Deaktivasyon inceleme eşiği (yenileme)',
            declinePercent: 'Düşüş uyarısı yüzdesi',
            saveSettings: 'Ayarları kaydet',
            settingsSaved: 'Analiz eşikleri kaydedildi.',
            openSettings: 'Eşikler',
            editThresholds: 'Analiz eşiklerini düzenle',
            clearData: 'Yerel analiz verilerini temizle',
            clearDataConfirm: 'Tüm listing snapshotları, iyileştirme kayıtları, AI eşleştirmeleri, kuyruk ve işlem geçmişi bu tarayıcıdan silinsin mi? Dil ve eşik ayarları korunur.',
            dataCleared: 'Yerel listing analiz verileri temizlendi; dil ve eşik ayarları korundu.',
            deleteUnsupported: 'Silme işlemi güvenlik nedeniyle desteklenmez.',
            leaseBlocked: 'İşlem kuyruğu başka bir sekmede açık. Bu sekmede yazma işlemi başlatılmadı.',
            reasonNew: 'Geçmiş karşılaştırması için yeni kayıt.',
            reasonGrowth: 'Ardışık 30 günlük pencerelerde ziyaret artışı, düşük sayım belirsizliği aşılarak doğrulandı.',
            reasonProtect: 'Satış ve gelir üreten güçlü listing; riskli toplu değişikliklerden koruyun.',
            reasonImproveTraffic: 'Ziyaret var ancak satış yok; başlık, görsel, fiyat ve teklif uyumunu inceleyin.',
            reasonDeactivate: 'En az {renewals} yenilemeye rağmen satış, ziyaret ve favori yok; deaktivasyonu inceleyin.',
            reasonDecline: 'Son 30 gün ziyareti önceki kayda göre %{percent} veya daha fazla düştü.',
            reasonMonitor: 'Acil aksiyon sinyali yok; yeni veri geldikçe izleyin.',
            reasonUnknown: 'Bazı performans metrikleri okunamadı; eksik değerler sıfır kabul edilmedi ve karar üretilmedi.',
            reasonLearning: 'Güvenilir karar için en az 30 günlük karşılaştırma geçmişi toplanıyor.',
            reasonExperiment: 'Yayımlanan iyileştirme 30 günlük değerlendirme penceresinde izleniyor.',
            reasonDormant: 'Listing hareketsiz görünüyor; kapatma kararı için güvenlik koşulları henüz tamamlanmadı.',
            reasonDeactivateSafe: '60+ günlük geçmiş, tekrarlanan sıfır trafik ve satış olmaması kapatma incelemesini destekliyor; son karar kullanıcıya aittir.',
            reasonInactive: 'Listing Etsy üzerinde pasif görünüyor; yazma işlemi önerilmedi.',
            health: 'Sağlık',
            healthy: 'Koru / izle',
            needsReview: 'İncelenecek',
            activeExperiments: 'Aktif deney',
            listingHealth: 'Listing sağlığı',
            healthAndHistory: 'Listing sağlığı ve geçmişi',
            lifecycle: 'Yaşam döngüsü',
            diagnosis: 'Performans teşhisi',
            confidence: 'Kanıt yeterliliği',
            evidence: 'Kanıtlar',
            showAllEvidence: 'Tüm kanıtları göster ({count})',
            confidenceDetails: 'Kanıt yeterliliği bileşenleri',
            dataQuality: 'Veri kalitesi',
            historyDepth: 'Geçmiş yeterliliği',
            trafficSample: 'Trafik örneklemi',
            cohortStrength: 'Karşılaştırma grubu',
            freshness: 'Güncellik',
            dataIntegrity: 'Veri tutarlılığı',
            shopBenchmark: 'Mağaza karşılaştırması',
            experiment: 'Deney',
            experimentState: 'Deney durumu',
            primaryMetric: 'Ana metrik',
            adjustedEffect: 'Gözlenen 30 günlük değişim',
            nextReview: 'Sonraki inceleme',
            afterNextSnapshot: 'Sonraki snapshot sonrası',
            missingData: 'Eksik veriler',
            whyRecommendation: 'Neden bu öneri?',
            details: 'Ayrıntılar',
            confidenceLimited: 'Bu değer istatistiksel olasılık değildir; veri kapsamı ve karar hazırlığını özetler.',
            lifecycleDataGap: 'Veri eksik',
            lifecycleBaseline: 'Başlangıç verisi',
            lifecycleLearning: 'Veri topluyor',
            lifecycleStable: 'Dengeli',
            lifecycleGrowing: 'Yükselişte',
            lifecycleDeclining: 'Düşüşte',
            lifecycleProtected: 'Korumalı',
            lifecycleExperiment: 'Deneyde',
            lifecycleDormant: 'Hareketsiz',
            lifecycleDeactivate: 'Kapatmayı incele',
            lifecycleInactive: 'Pasif',
            diagnosisDiscovery: 'Görünürlük zayıf',
            diagnosisEngagement: 'Ziyaret sonrası ilgi zayıf',
            diagnosisPurchase: 'Satın alma engeli olabilir',
            diagnosisScale: 'Erişim artırılabilir',
            diagnosisHealthy: 'Belirgin sorun yok',
            diagnosisInsufficient: 'Teşhis için veri az',
            confidenceLow: 'Düşük',
            confidenceMedium: 'Orta',
            confidenceHigh: 'Yüksek',
            confidenceVeryHigh: 'Çok yüksek',
            evidenceHistory: '{days} günlük geçmiş · {count} snapshot',
            evidenceTraffic: '30 günlük ziyaret: {current}; önceki pencere: {previous} · %{percent}',
            evidenceRecentSales: 'Yaklaşık son 30 gün: {sales} satış · {revenue} gelir',
            evidenceCohort: '{size} mağaza listingi içinde trafik yüzdeliği: {percentile}',
            evidenceAnomaly: '{count} veri tutarlılığı uyarısı bulundu.',
            guardExactCounters: 'Kararda kullanılan sayaçlar exact olarak doğrulandı',
            guardHistory: '60+ gün ve en az 3 tam snapshot',
            guardZeroTraffic: 'En az 14 gün arayla tekrarlanan sıfır trafik',
            guardNoSales: 'Listingde toplam satış/gelir yok ve son 60 gün de sıfır',
            guardRenewals: 'Satış olmadan yenileme maliyeti devam ediyor',
            guardActiveStock: 'Listing aktif ve stoklu',
            guardNoExperiment: 'Aktif deney yok',
            guardCooldown: 'Son 45 günde yayımlanan iyileştirme yok',
            guardSeasonal: 'Mevsimsel olmadığı açıkça doğrulandı',
            guardDataIntegrity: 'Son 60 günlük aktif dönemde veri tutarsızlığı yok',
            guardConfidence: 'Kanıt yeterliliği en az 80',
            experimentPlanned: 'Planlandı',
            experimentObserving: 'İzleniyor · {day}/30 gün',
            experimentWinner: 'Değişiklik sonrası artış sinyali',
            experimentUnderperformed: 'Değişiklik sonrası düşüş sinyali',
            experimentInconclusive: 'Belirsiz',
            experimentContaminated: 'Başka değişiklik nedeniyle ayrıştırılamadı',
            experimentStopped: 'Durduruldu',
            contentChanged: 'Listing içeriği öneri kaydedildikten sonra değişti. Form korunarak işlem durduruldu; öneriyi yeniden inceleyin.',
            proposalStale: 'Listing verisi veya analiz ayarları öneri kaydedildikten sonra değişti. Kuyruk oluşturulmadı; öneriyi yeniden inceleyin.',
            manualApproval: 'Her Etsy yazma işlemi listing bazında kullanıcı onayı ister.',
            confidenceFilter: 'Kanıt yeterliliği',
            confidenceLowFilter: 'Düşük yeterlilik', confidenceMediumFilter: 'Orta yeterlilik', confidenceHighFilter: 'Yüksek / çok yüksek yeterlilik',
            sortConfidence: 'En yüksek kanıt yeterliliği', analysisConfidence: 'Kanıt yeterliliği', historyConfidence: 'Geçmiş kanıt yeterliliği',
            snapshotConfidenceLimited: 'İlk tarama teşhisi kullanılabilir; büyüme, düşüş ve deaktivasyon için kanıt yeterliliği 30/60 günlük geçmiş oluşana kadar sınırlıdır.',
        }),
        en: Object.freeze({
            deactivateVerified: 'Etsy deactivation was verified and added to the action history.',
            launcher: 'Open Listing Analyzer panel', panelAria: 'Makaytron Etsy Listing Analyzer control panel', product: 'Listing Analyzer', overview: 'Overview', wideView: 'Wide view', compactView: 'Compact view', ready: 'Ready', scanning: 'Scanning', error: 'Error', blocked: 'Stopped', saved: 'Saved', collapse: 'Hide panel', expand: 'Open panel', switchLanguage: 'Türkçeye geç', pageReady: 'Listings on this page are ready for analysis.', editorReady: 'The edit and action queue is ready for this listing.', unsupportedPage: 'This tool only runs on the listing list and listing editor.', scanPage: 'Scan this page', scanAndNext: 'Scan and open next page', openAnalysis: 'Listing analysis', aiExchange: 'AI proposals', exportData: 'Download backup', queueTitle: 'Action queue', noQueue: 'There is no active action queue.', listings: 'Stored listings', pageListings: 'This page', growing: 'Growing', improve: 'Improve', deactivateReview: 'Review deactivation', protected: 'Protect', monitor: 'Monitor', waiting: 'Waiting for data', declining: 'Declining', scanComplete: '{count} listings read; {saved} records updated.', noCards: 'Listing cards were not found. Enable Etsy statistics view.', nextMissing: 'The next-page control was not found or is disabled.', pageProgress: 'Page {current}/{total}', analysisTitle: 'Listing analysis', search: 'Search title, SKU, or ID', filterAll: 'All recommendations', selected: '{count} selected', selectAll: 'Select visible', clearSelection: 'Clear selection', listing: 'Listing', performance: 'Performance', recommendation: 'Recommendation', trend: 'Change', actions: 'Actions', visits: 'Visits', favorites: 'Favorites', sales: 'Sales', revenue: 'Revenue', renewals: 'Renewals', stock: 'Stock', price: 'Price', noData: 'No listings have been stored yet.', editProposal: 'Improvement plan', history: 'History', openEtsy: 'Open on Etsy', proposalTitle: 'Listing improvement proposal', actionLabel: 'Planned action', actionUpdate: 'Update selected fields', actionDeactivate: 'Recommend deactivation (never deletes the listing)', actionSkip: 'Do nothing', title: 'Title', description: 'Description', tags: 'Tags', materials: 'Materials', tagsHelp: 'Comma-separated; up to 13 tags and 20 characters per tag.', materialsHelp: 'Separate with commas.', reason: 'Reason / note', saveProposal: 'Save proposal', cancel: 'Cancel', close: 'Close', invalidTitle: 'The title must contain 1–140 characters.', invalidTags: 'Use at most 13 tags and no more than 20 characters per tag.', changeField: 'Change this field', selectChangeField: 'Select at least one field to change for an UPDATE action.', proposalSaved: 'Proposal saved and an improvement baseline was recorded.', buildQueue: 'Build queue from selection', queueConfirm: 'Prepare a user-approved action queue for {count} listings? This confirmation will not publish any listing automatically.', queueCreated: '{count} listings were added to the action queue.', noProposalSelection: 'Selection alone does not create a queue. First save an actionable item in Improvement plan or import valid AI proposal JSON; then select the listing with that saved proposal and try again.', goFirst: 'Open first listing', currentItem: 'Queue {current}/{total}', applyForm: 'Apply proposal to form', publishAfterReview: 'Reviewed; publish on Etsy', openDeactivate: 'Deactivate on Etsy', deactivateConfirm: 'Do you confirm deactivating listing {id}? The script clicks only the exact Deactivate menu item and Etsy’s final Deactivate confirmation; it never clicks Delete.', deactivateLegacyConfirm: 'Listing {id} is waiting in the old manual deactivation step and is still visibly Active. Do you confirm starting the new v1.0.12 automatic Deactivate flow for this listing? Delete is never clicked.', verifyDeactivate: 'Verify deactivation and continue', skipItem: 'Skip this listing', stopQueue: 'Stop queue', continueQueue: 'Next listing', routeMismatch: 'The queued listing ID does not match the open page. Processing stopped safely.', formNotReady: 'Required Etsy form fields are not ready; no changes were applied.', formApplied: 'Proposal applied to the form. Review the Etsy fields; nothing has been published yet.', publishDisabled: 'Etsy’s “Publish changes” button is not enabled. Check form validation.', publishConfirm: 'Do you confirm publishing {fields} for listing {id} on Etsy?', publishSubmitted: 'Publish was submitted to Etsy; verifying the result.', publishVerified: 'Etsy save was verified and added to history.', publishUnverified: 'The Etsy result could not be verified. The queue did not advance blindly.', deactivateOpened: 'The script submitted the Etsy deactivation and is verifying the result. Delete is never used.', deactivateNotVerified: 'The listing still appears active; the queue did not advance.', deactivateUnverified: 'Deactivation may have been submitted to Etsy, but the result could not be verified. Automatic retry is disabled to avoid a duplicate action; verify the listing state or stop the queue.', queueStopped: 'The action queue was stopped.', queueComplete: 'The action queue is complete.', aiTitle: 'AI proposal exchange', aiIntro: 'This version sends no network request to an AI service. Copy selected listings as prompt/JSON, then paste and validate the AI result below.', copyAiRequest: 'Copy AI request', importAiResponse: 'Import AI response', aiResponseLabel: 'AI proposal JSON', aiCopied: 'AI request package for {count} listings copied to the clipboard.', aiImportSuccess: '{count} valid AI proposals imported.', aiImportError: 'AI JSON could not be validated: {message}', selectForAi: 'Select listings from the listing-analysis cards first.', exportComplete: 'Local analysis backup downloaded.', historyTitle: 'Analysis and improvement history', capturedAt: 'Captured at', changes: 'Changes', baseline: 'Baseline', latest: 'Latest', noHistory: 'At least two records from different days are required for comparison.', settingsTitle: 'Analysis thresholds', minVisitsToImprove: 'Improvement threshold when there are no sales (visits)', minVisitsToProtect: 'Strong-listing visit threshold', minRenewalsToReview: 'Deactivation review threshold (renewals)', declinePercent: 'Decline warning percentage', saveSettings: 'Save settings', settingsSaved: 'Analysis thresholds saved.', openSettings: 'Thresholds', editThresholds: 'Edit analysis thresholds', clearData: 'Clear local analysis data', clearDataConfirm: 'Delete all listing snapshots, improvement records, AI mappings, queue, and action history from this browser? Language and threshold settings are preserved.', dataCleared: 'Local listing analysis data was cleared; language and threshold settings were preserved.', deleteUnsupported: 'Deletion is not supported for safety.', leaseBlocked: 'The action queue is open in another tab. No write action started here.', reasonNew: 'New record; more history is needed for comparison.', reasonGrowth: 'Sales, revenue, visits, or favorites increased since the previous record.', reasonProtect: 'A strong revenue-generating listing; protect it from risky bulk changes.', reasonImproveTraffic: 'It has visits but no sales; review title, images, pricing, and offer alignment.', reasonDeactivate: 'No sales, visits, or favorites after at least {renewals} renewals; review deactivation.', reasonDecline: 'Last-30-day visits fell by at least {percent}% since the previous record.', reasonMonitor: 'No urgent action signal; continue collecting data.', reasonUnknown: 'Some performance metrics could not be read; missing values were not treated as zero and no decision was produced.',
            reasonLearning: 'At least 30 days of comparison history is being collected before a reliable decision.', reasonExperiment: 'The published improvement is being observed through its 30-day evaluation window.', reasonDormant: 'The listing looks dormant, but the safety conditions for a deactivation review are not complete.', reasonDeactivateSafe: 'A 60+ day history, repeated zero traffic, and no sales support a deactivation review; the user makes the final decision.', reasonInactive: 'The listing appears inactive on Etsy; no write action was recommended.',
            health: 'Health', healthy: 'Protect / monitor', needsReview: 'Needs review', activeExperiments: 'Active experiments', listingHealth: 'Listing health', healthAndHistory: 'Listing health & history', lifecycle: 'Lifecycle', diagnosis: 'Performance diagnosis', confidence: 'Evidence readiness', evidence: 'Evidence', showAllEvidence: 'Show all evidence ({count})', confidenceDetails: 'Evidence-readiness components', dataQuality: 'Data quality', historyDepth: 'History depth', trafficSample: 'Traffic sample', cohortStrength: 'Cohort strength', freshness: 'Capture freshness', dataIntegrity: 'Data integrity', shopBenchmark: 'Shop benchmark', experiment: 'Experiment', experimentState: 'Experiment status', primaryMetric: 'Primary metric', adjustedEffect: 'Observed 30-day change', nextReview: 'Next review', afterNextSnapshot: 'After the next snapshot', missingData: 'Missing data', whyRecommendation: 'Why this recommendation?', details: 'Details', confidenceLimited: 'This is not a statistical probability; it summarizes evidence coverage and decision readiness.',
            lifecycleDataGap: 'Data incomplete', lifecycleBaseline: 'Building baseline', lifecycleLearning: 'Learning', lifecycleStable: 'Stable', lifecycleGrowing: 'Growing', lifecycleDeclining: 'Declining', lifecycleProtected: 'Protected', lifecycleExperiment: 'Experiment running', lifecycleDormant: 'Dormant', lifecycleDeactivate: 'Review deactivation', lifecycleInactive: 'Inactive',
            diagnosisDiscovery: 'Low discovery', diagnosisEngagement: 'Weak post-visit interest', diagnosisPurchase: 'Possible purchase friction', diagnosisScale: 'Ready for more reach', diagnosisHealthy: 'No clear issue', diagnosisInsufficient: 'Not enough signal', confidenceLow: 'Low', confidenceMedium: 'Medium', confidenceHigh: 'High', confidenceVeryHigh: 'Very high',
            evidenceHistory: '{days} days of history · {count} snapshots', evidenceTraffic: '30-day visits: {current}; previous window: {previous} · {percent}%', evidenceRecentSales: 'Approximate last 30 days: {sales} sales · {revenue} revenue', evidenceCohort: 'Traffic percentile among {size} shop listings: {percentile}', evidenceAnomaly: '{count} data-integrity warning(s) found.',
            guardExactCounters: 'Decision counters are verified as exact', guardHistory: '60+ days and at least 3 complete snapshots', guardZeroTraffic: 'Repeated zero traffic at least 14 days apart', guardNoSales: 'No lifetime sales/revenue and no new sales/revenue in the last 60 days', guardRenewals: 'Renewal cost continues without sales', guardActiveStock: 'Listing is active and in stock', guardNoExperiment: 'No active experiment', guardCooldown: 'No published improvement in the last 45 days', guardSeasonal: 'Explicitly confirmed as non-seasonal', guardDataIntegrity: 'No data-integrity issue in the active 60-day epoch', guardConfidence: 'Evidence readiness is at least 80',
            experimentPlanned: 'Planned', experimentObserving: 'Observing · day {day}/30', experimentWinner: 'Post-change increase signal', experimentUnderperformed: 'Post-change decrease signal', experimentInconclusive: 'Inconclusive', experimentContaminated: 'Contaminated by another change', experimentStopped: 'Stopped', contentChanged: 'The listing content changed after the proposal was saved. The form was preserved and processing stopped; review the proposal again.', proposalStale: 'Listing data or analysis settings changed after the proposal was saved. No queue was created; review the proposal again.', manualApproval: 'Every Etsy write action requires listing-level user approval.',
            confidenceFilter: 'Evidence readiness',
            confidenceLowFilter: 'Low readiness', confidenceMediumFilter: 'Medium readiness', confidenceHighFilter: 'High / very high readiness',
            sortConfidence: 'Highest evidence readiness', analysisConfidence: 'Evidence readiness', historyConfidence: 'History evidence readiness',
            snapshotConfidenceLimited: 'The first-scan diagnosis is usable; evidence readiness for growth, decline, and deactivation remains limited until 30/60-day history is available.',
        }),
    });

    const EXTRA_I18N = Object.freeze({
        tr: Object.freeze({
            verifyPublish: 'Etsy yayınını doğrula ve devam et',
            listingContext: 'Listing bağlamı', seasonality: 'Mevsimsellik', listingType: 'Ürün türü',
            contextUnknown: 'Bilinmiyor', contextSeasonal: 'Mevsimsel', contextNonSeasonal: 'Mevsimsel değil', contextDigital: 'Dijital', contextPhysical: 'Fiziksel',
            saveContext: 'Bağlamı kaydet', contextSaved: 'Listing bağlamı kaydedildi; analiz yeniden hesaplandı.',
            sourceTimeUnknown: 'Etsy kaynak yenileme zamanı görünmüyor; güncellik tarama zamanına göredir.',
            effectFromZero: 'Sıfırdan yeni sinyal · mutlak değişim {amount}', exactInterval: '%{confidence} exact Poisson oran aralığı',
            scanAllPages: 'Tüm sayfaları tara', stopCollection: 'Taramayı durdur', resumeCollection: 'Taramaya devam et', collectionShortcut: 'Kısayol: CTRL + ALT + A',
            collectionStarting: 'Tüm sayfa taraması başlatılıyor…', collectionFirstPage: 'İlk sayfaya geçiliyor…', collectionProgress: 'Sayfa {current}/{total} · {pages} sayfa · {count} benzersiz listing', collectionComplete: '{pages} sayfada {count} benzersiz listing toplandı.', collectionPaused: 'Tarama durduruldu. Aynı düğmeyle kaldığınız yerden devam edebilirsiniz.', collectionBlocked: 'Tarama güvenli biçimde durdu: {reason}', collectionBusy: 'Tüm sayfa taraması başka bir sekmede çalışıyor.', collectionRouteRequired: 'Tüm sayfa taraması yalnız Etsy listing sayfasında başlatılabilir.', collectionPageChanged: 'Beklenen Etsy sayfası yüklenmedi.', collectionRepeatedPage: 'Aynı Etsy sayfası tekrar açıldığı için döngü durduruldu.', collectionOverlap: 'Farklı sayfalarda aynı listing görüldü; eksik veya karışık analiz oluşmaması için tarama durduruldu.', collectionStorageFailed: 'Yerel depolama yazılamadı; kota veya kapasite dolu olabilir. Yedek alın, eski analiz verilerini temizleyin ve yeniden deneyin.', collectionNewerSchema: 'Tarama kaydı daha yeni bir script sürümüne ait; veri korunarak işlem durduruldu.', collectionLimit: 'Güvenlik için {count} sayfa sınırında tarama durduruldu.', collectionPages: 'Toplanan sayfa', collectionListings: 'Benzersiz listing', collectionStatus: 'Toplu veri toplama',
            filters: 'Filtreler', hideFilters: 'Filtreleri gizle', clearFilters: 'Filtreleri sıfırla', resultsCount: '{visible} / {total} listing', showingCount: '{shown} gösteriliyor · {total} eşleşme', scope: 'Kapsam', scopeAll: 'Kayıtlı tüm listingler', scopePage: 'Bu Etsy sayfası', lifecycleFilter: 'Durum', diagnosisFilter: 'Sorun / fırsat', recommendationFilter: 'Öneri', performanceFilter: '30 günlük performans', trendFilter: 'Değişim', stockFilter: 'Stok', confidenceFilter: 'Veri güveni', sortBy: 'Sırala',
            analysisOverdueTitle: 'Analiz saati gecikti.', analysisOverdueCopy: 'Doğru veriler için tüm listinglerin analizi yapılmalı.', startAnalysis: 'Analizi başlat', openListingsForAnalysis: 'Listing sayfasına git', collectionActionStale: 'Listing analizi değişti veya süresi doldu. Doğru veriler için analizi yeniden başlatın.',
            optionAll: 'Tümü', performanceSales: 'Son 30 günde satış', performanceTrafficNoSales: 'Son 30 günde ziyaret var, satış yok', performanceNoActivity: 'Son 30 günde hareket yok', performanceMissing: 'Eksik veya tutarsız veri', trendRising: 'Yükselenler', trendFalling: 'Düşenler', trendStable: 'Değişmeyenler', trendUnknown: 'Karşılaştırması olmayanlar', stockIn: 'Stokta', stockOut: 'Tükendi', stockUnknown: 'Stok bilinmiyor', confidenceLowFilter: 'Düşük güven', confidenceMediumFilter: 'Orta güven', confidenceHighFilter: 'Yüksek / çok yüksek güven', sortPriority: 'Öncelikli öneri', sortScore: 'En yüksek 30 günlük erişim/ilgi', sortVisits: 'Son 30g en çok ziyaret', sortSales: 'Tüm-zaman en çok satış', sortRevenue: 'Tüm-zaman en yüksek gelir', sortConfidence: 'En yüksek güven', sortTitle: 'Başlık A–Z', noFilterResults: 'Bu filtrelere uyan listing bulunamadı.', loadMore: 'Daha fazla göster', hiddenSelected: '{count} seçim filtre nedeniyle gizli',
            performanceScore: '30 günlük erişim/ilgi', currentFunnelScore: '30 günlük erişim/ilgi', snapshotScore: '30 günlük erişim/ilgi', longitudinalScore: '30 günlük erişim/ilgi', analysisConfidence: 'Analiz güveni', historyConfidence: 'Geçmiş güveni', scoreOutOf: '{score}/100', snapshotBasis: 'Puan son 30 günlük ziyaret ile örneklem boyutuna göre yumuşatılmış favori oranını ölçer. Tüm-zaman satış, gelir ve yenilemeler karar sinyalidir; puanı yapay olarak yükseltmez.', longitudinalBasis: 'Puan son 30 günlük ziyaret ile örneklem boyutuna göre yumuşatılmış favori oranını ölçer; ardışık 30/60 günlük kayıtlar ayrıca trend ve güvenlik kararlarında kullanılır.', insufficientBasis: 'Güncel metrik eksik, eski veya tutarsız olduğu için erişim/ilgi puanı üretilmedi.', snapshotConfidenceLimited: 'İlk tarama teşhisi kullanılabilir; büyüme, düşüş ve kapatma güveni 30/60 günlük geçmiş oluşana kadar sınırlıdır.',
            visits30dLabel: 'Ziyaret · 30g', favorites30dLabel: 'Favori · 30g', salesAllTimeLabel: 'Satış · tüm-zaman', revenueAllTimeLabel: 'Gelir · tüm-zaman', renewalsAllTimeLabel: 'Yenileme · tüm-zaman',
            evidenceCurrentCounters: 'Son 30g: {visits} ziyaret · {favorites} favori; tüm-zaman: {sales} satış · {revenue} gelir · {renewals} yenileme', evidenceSnapshotScoreCohort: '30 günlük erişim/ilgi: {score}/100 · mağaza içi karşılaştırma', evidenceSnapshotScoreAbsolute: '30 günlük erişim/ilgi: {score}/100 · mutlak eşikler',
            snapshotRenewalWaste: 'Yenileme verimsizliği', snapshotWeakDiscovery: 'Görünürlük zayıf', snapshotWeakEngagement: 'İlgi zayıf', snapshotPurchaseFriction: 'Satış dönüşümü zayıf', snapshotProvenDemand: 'Satış kanıtı var', snapshotStrongCurrent: 'Güncel erişim/ilgi güçlü', snapshotMixed: 'Güncel sinyaller karışık', snapshotNoActivity: 'Güncel hareket yok', snapshotInsufficient: 'Güncel metrik okunamadı',
            reasonSnapshotRenewalWaste: '{renewals} yenilemeye rağmen satış, gelir ve favori yok. İyileştirmeyi önceliklendirin; kapatma için tarihsel kanıt gerekir.', reasonSnapshotDiscovery: 'Güncel ziyaret düzeyi mağaza içindeki görünürlüğün zayıf olduğunu gösteriyor.', reasonSnapshotEngagement: 'Yeterli ziyaret görülmesine rağmen favori ilgisi zayıf; görsel, başlık ve teklif uyumunu inceleyin.', reasonSnapshotPurchase: 'Ziyaret veya favori var fakat tüm-zaman satış ve gelir yok; fiyat, görseller ve teklif sürtünmesini inceleyin.', reasonSnapshotDemand: 'Tüm-zaman satış veya gelir kanıtı bu listingi korur; güncel erişim/ilgi ayrıca değerlendirilir ve zayıf olabilir. Tarihsel kanıt puanı yapay olarak yükseltmez.', reasonSnapshotStrong: 'Son 30 günlük ziyaret ve favori oranı güçlü bir konuma işaret ediyor; trend doğrulaması için yeni taramalar toplayın.', reasonSnapshotMixed: 'Güncel sayaçlarda tek başına güçlü bir sorun veya fırsat sinyali yok; karşılaştırmalı geçmiş toplamaya devam edin.', reasonSnapshotNoActivity: 'Sayaçlar eksiksiz okundu: son 30 günde ziyaret veya favori, tüm-zaman geçmişinde de satış veya gelir yok. Veri eksik değil; şimdilik izleyin.',
            filterPresets: 'Hazır filtreler', presetGrowing: 'Yükselişte', presetImprove: 'İyileştirilecek', presetDeclining: 'Düşüşte', presetDeactivate: 'Kapatmayı incele', presetExperiments: 'Aktif deneyler', presetMissing: 'Eksik / tutarsız veri', presetName: 'Preset adı', savePreset: 'Mevcut filtreyi kaydet', deletePreset: 'Preseti sil', presetSaved: 'Filtre preseti kaydedildi.', presetDeleted: 'Filtre preseti silindi.', presetLimit: 'En fazla {count} özel filtre preseti kaydedilebilir.', presetInvalid: 'Preset adı 2–32 karakter olmalı.',
            historyCharts: 'Tarihsel değişim grafikleri', noChartData: 'Grafik için en az iki geçerli kayıt gerekir.', chartApproximate: 'yaklaşık değer', chartLegacy: 'doğrulanmamış eski kayıt', chartStaleExcluded: '{count} eski gözlem grafikten çıkarıldı.', chartMissingExcluded: '{count} eksik veya okunamayan gözlem grafikten çıkarıldı.', chartCurrencyExcluded: '{count} önceki gözlem, para birimi güncel kayıttan farklı olduğu için grafikten çıkarıldı.', chartMixedCurrencies: 'karışık para birimleri', experimentTimeline: 'İyileştirme deney zaman çizelgesi', timelinePlanned: 'Öneri planlandı', timelinePublished: 'Etsy’de yayınlandı', timelineObserving: 'Gözlem başladı', timelineEvaluationDue: 'Değerlendirme tarihi', timelineEvaluated: 'Deney sonucu', timelineNotApplied: 'Henüz uygulanmadı',
            aiComparison: 'AI önerisi önce / sonra', aiComparisonEmpty: 'İçe aktarılmış bir AI önerisi henüz yok.', beforeValue: 'Önce', proposedValue: 'AI önerisi', appliedValue: 'Doğrulanan sonuç', changedFields: 'Değişen alanlar', valueNotCaptured: 'Önceki değer yakalanmadı.',
            collectionRetrying: 'Geçici sayfa hatası · {attempt}/{max} yeniden deneniyor…', errorReport: 'Ayrıntılı hata raporu', errorReportTitle: 'Sayfa tarama hata raporu', copyErrorReport: 'Raporu kopyala', reportCopied: 'Hata raporu panoya kopyalandı.', reportPhase: 'Aşama', reportExpectedPage: 'Beklenen sayfa', reportObservedPage: 'Görülen sayfa', reportAttempts: 'Deneme', reportTime: 'Hata zamanı', reportNoSensitiveData: 'Rapor yalnız teknik tarama durumunu içerir; çerez, oturum ve sayfa HTML’i içermez.',
            checkUpdate: 'Güncellemeyi denetle', updateChecking: 'Güncelleme denetleniyor…', updateAvailable: 'Yeni sürüm hazır: v{version}', updateCurrent: 'Listing Analyzer güncel.', updateFailed: 'Güncelleme denetlenemedi: {message}', installUpdate: 'Tampermonkey’de güncelle', updateInstallHelp: 'Kurulum Tampermonkey onay ekranında tamamlanır; script kendisini sessizce değiştirmez.', updateBlocked: 'Aktif tarama veya işlem kuyruğu varken güncelleme açılamaz.',
            importBackup: 'Yedek içe aktar', backupImportTitle: 'Analiz yedeğini içe aktar', backupImportIntro: 'JSON yedeği önce tamamen doğrulanır, sonra mevcut yerel verilerle güvenli biçimde birleştirilir. Eski işlem kuyruğu etkinleştirilmez.', chooseBackup: 'JSON yedeği seç', backupPreview: '{records} listing kaydı · {presets} özel preset', backupImportAction: 'Doğrula ve birleştir', backupInvalid: 'Yedek doğrulanamadı: {message}', backupImported: '{records} listing ve {presets} preset içe aktarıldı.', backupTooLarge: 'Yedek dosyası en fazla 25 MB olabilir.', backupQueueSkipped: 'Yedekteki işlem kuyruğu güvenlik nedeniyle otomatik etkinleştirilmedi.',
            storageUsage: 'Tahmini yerel veri', storageUsageValue: '{size} MB', storageQuotaWarning: 'Yerel depolama sınırına yaklaşıldı veya yazma reddedildi. Yedek alın, eski analiz verilerini azaltın ve işlemi yeniden deneyin.', storageWriteFailed: 'Yerel veri yazılamadı. Hiçbir toplu işlem eksik kayıtla devam etmedi.', thresholdInvalidValue: '{field} alanı {min}–{max} aralığında bir tam sayı olmalıdır.', thresholdQueueLocked: 'Analiz eşikleri aktif işlem kuyruğu sırasında değiştirilemez. Önce kuyruğu tamamlayın veya durdurun.', proposalQueueLocked: 'Bu listing aktif işlem kuyruğunda olduğu için önerisi değiştirilemez. Önce kuyruğu tamamlayın veya durdurun.',
            telemetryMenu: 'Kullanım ölçümleri ayarları', telemetryTitle: 'Gizlilik korumalı kullanım ölçümleri', telemetryNoticeBody: 'Kullanım ölçümleri varsayılan olarak açıktır. Yalnızca script kimliği ve sürümü, rastgele kurulum kimliği, izin verilen açılma/başarı sinyalleri ve sabit hata kodları gönderilir. Ham hata metni veya Etsy içeriği toplanmaz.', telemetryPrivacy: 'Gizlilik', telemetryPrivacyPolicy: 'Gizlilik politikası', telemetryEnable: 'Etkinleştir', telemetryDisableDeleteShort: 'Devre dışı bırak ve sil', telemetryDisableDelete: 'Devre dışı bırak ve sunucu verisini sil', telemetryGotIt: 'Anladım', telemetryStatusEnabled: 'Durum: etkin. Yalnızca izin verilen açılma/başarı sinyalleri ve sabit hata kodları gönderilir; ham hata metni veya Etsy içeriği toplanmaz.', telemetryStatusDisabled: 'Durum: devre dışı.', telemetryStatusUnavailable: 'Durum: kullanılamıyor. Ayar okunup doğrulanana kadar ölçümler bu sekmede engelli kalır.', telemetryEnabled: 'Kullanım ölçümleri etkinleştirildi.', telemetrySaveFailed: 'Ayar kaydedilemedi.', telemetryDisableFailedMenu: 'Ayar kaydedilemediği için kullanım ölçümleri devre dışı bırakılamadı. Ölçümler bu sekmede engelli kalır; userscript menüsünden yeniden deneyin.', telemetryDisableFailedHere: 'Ayar kaydedilemediği için kullanım ölçümleri devre dışı bırakılamadı. Ölçümler bu sekmede engelli kalır; buradan yeniden deneyin.', telemetryDisabledDeleted: 'Kullanım ölçümleri devre dışı; sunucu verisi silindi.', telemetryDisabledCleanupMenu: 'Kullanım ölçümleri devre dışı ancak sunucu temizliği tamamlanamadı; userscript menüsünden yeniden deneyin.', telemetryDisabledCleanupHere: 'Kullanım ölçümleri devre dışı ancak sunucu temizliği tamamlanamadı; buradan yeniden deneyebilirsiniz.',
            errorReportHistory: 'Hata geçmişi', errorReportGuidance: 'Önce sayfanın tamamen yüklendiğini kontrol edin. Ardından taramayı kaldığı yerden güvenle yeniden deneyebilirsiniz.', retryCollection: 'Taramayı yeniden dene', downloadErrorReports: 'Tüm raporları indir', reportDownloaded: 'Hata raporları indirildi.',
            lastAnalysis: 'Son başarılı analiz: {time}', analysisValidity: 'Analizler tamamlandıktan sonra 24 saat geçerlidir.',
            thresholdCalibration: 'Mağaza verisine göre önerilen eşikler', thresholdCalibrationCopy: 'Öneriler tam mağaza taramasındaki taze, deney dışı dağılımlardan hesaplanır; otomatik uygulanmaz.', calibrationAvailable: '{count} listing ile kalibre edildi.', calibrationInsufficient: 'Kalibrasyon için en az 20 okunabilir listing gerekir.', useRecommended: 'Önerilenleri forma uygula', recommendedValue: 'Öneri: {value}', thresholdImpact: 'Bu değerlerle yaklaşık {improve} listing iyileştirme, {protect} listing güçlü performans adayı olur.', thresholdRelationship: 'Güçlü listingleri koruma eşiği, iyileştirme eşiğinden büyük olmalıdır.', thresholdHelpImprove: 'Satış yokken iyileştirme incelemesini başlatacak en düşük ziyaret sayısı.', thresholdHelpProtect: 'Güçlü listing koruması için gereken ziyaret sayısı; iyileştirme eşiğinden yüksek olmalıdır.', thresholdHelpRenewals: 'Deaktivasyon incelemesinden önce gereken en düşük yenileme sayısı.', thresholdHelpDecline: 'Düşüş uyarısını başlatan yüzde değişim.', resetDefaults: 'Güvenli varsayılanlara dön',
            experimentOverlapTitle: 'Devam eden deneyle çakışma var', experimentOverlapCopy: 'Bu listingde hâlen izlenen bir iyileştirme deneyi var. Yeni değişiklik önceki deneyin sonucunu ayrıştırılamaz duruma getirebilir.', acknowledgeOverlap: 'Çakışmayı anladım; öneriyi yine de hazırlamak istiyorum.', experimentOverlapRequired: 'Devam eden deney çakışmasını onaylamadan bu öneri kuyruğa eklenemez.',
            aiErrorJson: 'JSON biçimi okunamadı. Fazladan virgül, eksik tırnak veya kod bloğu işareti olup olmadığını kontrol edin.', aiErrorSchema: 'Yanıt şeması geçersiz. schema alanı makaytron-listing-ai-proposals/v1 ve proposals alanı bir dizi olmalı.', aiErrorRequest: 'requestId bilinmiyor veya süresi dolmuş. AI istek paketini yeniden kopyalayın.', aiErrorProposal: 'Öneri doğrulanamadı: {path}.', aiErrorHelp: 'Beklenen alanı düzeltip aynı JSON’u yeniden deneyin; geçerli kayıtlar hata varken yazılmaz.', aiFormatHelp: 'tags ve materials alanları JSON dizisi (array), title ve description alanları metin olmalıdır.', copyAiTemplate: 'Örnek JSON’u kopyala', aiTemplateCopied: 'Örnek AI JSON’u panoya kopyalandı.',
            queueRecoveryTitle: 'Yarım kalan işlem kuyruğu bulundu', queueRecoveryCopy: 'Son adım tamamlanmadan sayfa kapanmış olabilir. Listing durumunu incelemeden aynı yazma işlemi tekrarlanmaz.', queueRecoveryRetry: 'Öğeyi güvenle yeniden hazırla', queueRecoveryConfirm: 'Mevcut Etsy formunu önce kontrol ettiniz mi? Öğe yalnız bekleyen duruma alınacak; hiçbir şey otomatik yayımlanmayacak.', queueRecoverySubmitted: 'Bu listing Etsy’ye gönderilmiş ancak sonucu doğrulanamamış olabilir. Çift gönderimi önlemek için otomatik tekrar kapalıdır; Etsy durumunu elle doğrulayın veya kuyruğu durdurun.', queueRecoveryOpen: 'Listing sayfasını güvenli inceleme için aç', queueRecoveryStop: 'Kuyruğu durdur',
            userFeedback: 'Geri bildirim', feedbackTitle: 'Listing Analyzer geri bildirimi', feedbackIntro: 'Notunuz önce yerel olarak kaydedilir. GitHub formu yalnız düğmeye bastığınızda açılır; listing başlıkları ve ID’leri eklenmez.', feedbackCategory: 'Konu', feedbackRating: 'Deneyim puanı', feedbackNote: 'Notunuz', feedbackDiagnostics: 'Anonim teknik özeti ekle', feedbackSend: 'Kaydet, kopyala ve GitHub formunu aç', feedbackSaved: 'Geri bildirim yerel olarak kaydedildi ve panoya kopyalandı.', feedbackInvalid: 'Lütfen 10–800 karakter arasında açıklayıcı bir not yazın.', feedbackBug: 'Hata', feedbackIdea: 'Öneri', feedbackUsability: 'Kullanılabilirlik', feedbackAnalysis: 'Analiz sonucu', feedbackCount: 'Yerel geri bildirim',
            researchStart: 'Marketplace Insights ile araştır', researchOneListing: 'Araştırma için tam olarak bir listing seçin.', researchProbing: 'Etsy Keyword & Market Analyzer aranıyor…', researchCompanionMissingTitle: 'Etsy Keyword & Market Analyzer gerekli', researchCompanionMissing: 'Bağlantılı Marketplace Insights araştırması için ayrı Etsy Keyword & Market Analyzer scripti gerekir. Listing Analyzer diğer tüm özellikleriyle bağımsız çalışmaya devam eder.', researchInstallHelp: 'Script sessizce kurulamaz. Kurulum sayfası yeni sekmede açılır ve son onayı userscript yöneticisinde siz verirsiniz.', researchOpenInstall: 'Yükleme sayfasını aç', researchTransferTitle: 'Marketplace Insights araştırması', researchWaitingReady: 'Insights sekmesinin hazır olması bekleniyor…', researchRequestSent: 'Araştırma isteği gönderildi; Analyzer açık kalmalıdır.', researchAcknowledged: 'İstek alındı; Etsy Marketplace Insights sonuçları bekleniyor…', researchTimedOut: 'Otomatik yanıt süresi doldu. Analyzer açık kalır ve geçerli sonuç süresi dolana kadar kabul edilir; gerekirse JSON kurtarma araçlarını kullanın.', researchComplete: '{count} anahtar kelime kanıtı doğrulandı; öneri otomatik yayımlanmadı.', researchSavedForReview: 'Başlık ve etiket önerisi inceleme için kaydedildi; hiçbir Etsy alanı değiştirilmedi.', researchNeedsEditor: 'Kanıt ve öneri kaydedildi. Etiketleri güvenle karşılaştırmak için listing düzenleyicisini bir kez açın; işlem kuyruğu oluşturulmadı.', researchFailed: 'Araştırma sonucu doğrulanamadı: {message}', researchCopyRequest: 'İstek JSON’unu kopyala', researchRequestCopied: 'Araştırma istek JSON’u panoya kopyalandı.', researchImportResult: 'Sonuç JSON’unu içe aktar', researchResultLabel: 'Tam RESEARCH_RESULT envelope JSON’u', researchReopenInsights: 'Insights sayfasını yeniden aç', researchEvidenceTitle: 'Marketplace Insights kanıtı', researchSearches30d: '30 günlük arama', researchSearchResults: 'Arama sonucu / rekabet göstergesi', researchOpportunity: 'Makaytron fırsat puanı', researchSourceNote: 'Kaynak: Etsy Marketplace Insights görünür sayfa verisi. Fırsat puanı Makaytron tarafından türetilmiştir.', researchStale: 'Listing başlığı veya etiketleri araştırma başladıktan sonra değişti; sonuç güvenli biçimde reddedildi.', researchNoSeeds: 'Araştırma için kullanılabilecek başlık veya etiket bulunamadı.', researchOpenProposal: 'Öneriyi incele', researchPendingExists: 'Bu listing için bekleyen araştırma yeniden açıldı.', researchErrorRemote: 'Keyword Analyzer araştırmayı tamamlayamadı: {message}', researchProposalReason: 'Marketplace Insights kanıtı: “{keyword}” — {searches} arama / 30 gün, {results} arama sonucu. Makaytron fırsat puanı türetilmiş metriktir.', researchTagReplacement: '13 etiket dolu olduğu için düşük kanıtlı “{old}” yerine “{keyword}” önerildi; değişiklik yalnız inceleme taslağıdır.', updateManagedExternally: 'Güncellemeler kurulum kaynağınız tarafından yönetiliyor; GitHub güncelleme akışı zorlanmadı.',
        }),
        en: Object.freeze({
            verifyPublish: 'Verify Etsy publish and continue',
            listingContext: 'Listing context', seasonality: 'Seasonality', listingType: 'Product type',
            contextUnknown: 'Unknown', contextSeasonal: 'Seasonal', contextNonSeasonal: 'Non-seasonal', contextDigital: 'Digital', contextPhysical: 'Physical',
            saveContext: 'Save context', contextSaved: 'Listing context saved and analysis recalculated.',
            sourceTimeUnknown: 'Etsy source-refresh time is not visible; freshness is based on capture time.',
            effectFromZero: 'New signal from zero · absolute change {amount}', exactInterval: '{confidence}% exact Poisson rate interval',
            scanAllPages: 'Collect all pages', stopCollection: 'Stop collection', resumeCollection: 'Resume collection', collectionShortcut: 'Shortcut: CTRL + ALT + A',
            collectionStarting: 'Starting all-page collection…', collectionFirstPage: 'Opening the first page…', collectionProgress: 'Page {current}/{total} · {pages} pages · {count} unique listings', collectionComplete: '{count} unique listings collected across {pages} pages.', collectionPaused: 'Collection stopped. Use the same button to resume.', collectionBlocked: 'Collection stopped safely: {reason}', collectionBusy: 'All-page collection is running in another tab.', collectionRouteRequired: 'All-page collection can only start on the Etsy listings page.', collectionPageChanged: 'The expected Etsy page did not load.', collectionRepeatedPage: 'Collection stopped because the same Etsy page appeared again.', collectionOverlap: 'The same listing appeared on different pages; collection stopped to avoid an incomplete or mixed analysis.', collectionStorageFailed: 'Local storage could not be written; its quota or capacity may be full. Export a backup, clear old analysis data, and retry.', collectionNewerSchema: 'The collection record belongs to a newer script schema; it was preserved and collection stopped.', collectionLimit: 'Collection stopped at the {count}-page safety limit.', collectionPages: 'Pages collected', collectionListings: 'Unique listings', collectionStatus: 'Bulk data collection',
            filters: 'Filters', hideFilters: 'Hide filters', clearFilters: 'Reset filters', resultsCount: '{visible} / {total} listings', showingCount: '{shown} shown · {total} matches', scope: 'Scope', scopeAll: 'All stored listings', scopePage: 'This Etsy page', lifecycleFilter: 'Status', diagnosisFilter: 'Issue / opportunity', recommendationFilter: 'Recommendation', performanceFilter: '30-day performance', trendFilter: 'Change', stockFilter: 'Stock', confidenceFilter: 'Data confidence', sortBy: 'Sort',
            analysisOverdueTitle: 'Analysis is overdue.', analysisOverdueCopy: 'All listings must be analyzed to show reliable data.', startAnalysis: 'Start analysis', openListingsForAnalysis: 'Open Listings', collectionActionStale: 'The listing analysis changed or expired. Start the analysis again before continuing.',
            optionAll: 'All', performanceSales: 'Sales in the last 30 days', performanceTrafficNoSales: 'Traffic but no sales in the last 30 days', performanceNoActivity: 'No activity in the last 30 days', performanceMissing: 'Missing or inconsistent data', trendRising: 'Rising', trendFalling: 'Falling', trendStable: 'Unchanged', trendUnknown: 'No comparison', stockIn: 'In stock', stockOut: 'Out of stock', stockUnknown: 'Stock unknown', confidenceLowFilter: 'Low confidence', confidenceMediumFilter: 'Medium confidence', confidenceHighFilter: 'High / very high confidence', sortPriority: 'Action priority', sortScore: 'Highest 30-day reach/engagement', sortVisits: 'Most visits · last 30d', sortSales: 'Most sales · all-time', sortRevenue: 'Highest revenue · all-time', sortConfidence: 'Highest confidence', sortTitle: 'Title A–Z', noFilterResults: 'No listings match these filters.', loadMore: 'Show more', hiddenSelected: '{count} selected item(s) hidden by filters',
            performanceScore: '30-day reach/engagement', currentFunnelScore: '30-day reach/engagement', snapshotScore: '30-day reach/engagement', longitudinalScore: '30-day reach/engagement', analysisConfidence: 'Analysis confidence', historyConfidence: 'History confidence', scoreOutOf: '{score}/100', snapshotBasis: 'The score measures last-30-day visits and a sample-size-smoothed favorite rate. All-time sales, revenue, and renewals are decision signals and do not artificially raise the score.', longitudinalBasis: 'The score measures last-30-day visits and a sample-size-smoothed favorite rate; consecutive 30/60-day records separately drive trend and safety decisions.', insufficientBasis: 'No reach/engagement score was produced because a current metric is missing, stale, or inconsistent.', snapshotConfidenceLimited: 'The first-scan diagnosis is usable; growth, decline, and deactivation confidence remain limited until 30/60-day history is available.',
            visits30dLabel: 'Visits · 30d', favorites30dLabel: 'Favorites · 30d', salesAllTimeLabel: 'Sales · all-time', revenueAllTimeLabel: 'Revenue · all-time', renewalsAllTimeLabel: 'Renewals · all-time',
            evidenceCurrentCounters: 'Last 30d: {visits} visits · {favorites} favorites; all-time: {sales} sales · {revenue} revenue · {renewals} renewals', evidenceSnapshotScoreCohort: '30-day reach/engagement: {score}/100 · within-shop comparison', evidenceSnapshotScoreAbsolute: '30-day reach/engagement: {score}/100 · absolute thresholds',
            snapshotRenewalWaste: 'Renewal waste', snapshotWeakDiscovery: 'Weak discovery', snapshotWeakEngagement: 'Weak engagement', snapshotPurchaseFriction: 'Weak sales conversion', snapshotProvenDemand: 'Proven demand', snapshotStrongCurrent: 'Strong current reach/engagement', snapshotMixed: 'Mixed current signals', snapshotNoActivity: 'No current activity', snapshotInsufficient: 'Current metric unreadable',
            reasonSnapshotRenewalWaste: '{renewals} renewals produced no sales, revenue, or favorites. Prioritize improvement; deactivation still requires historical evidence.', reasonSnapshotDiscovery: 'The current visit level indicates weak discovery within the shop.', reasonSnapshotEngagement: 'There is enough traffic, but favorite interest is weak; review imagery, title, and offer alignment.', reasonSnapshotPurchase: 'Visits or favorites exist, but all-time sales and revenue are zero; review pricing, imagery, and offer friction.', reasonSnapshotDemand: 'All-time sales or revenue protect this listing; current reach/engagement is assessed separately and may still be weak. Historical proof does not inflate the score.', reasonSnapshotStrong: 'Last-30-day visits and favorite rate indicate a strong position; collect new scans to confirm the trend.', reasonSnapshotMixed: 'Current counters do not show one strong issue or opportunity; continue collecting comparative history.', reasonSnapshotNoActivity: 'Every counter was read successfully: there are no last-30-day visits or favorites and no all-time sales or revenue. The data is complete; monitor for now.',
            filterPresets: 'Filter presets', presetGrowing: 'Growing', presetImprove: 'Needs improvement', presetDeclining: 'Declining', presetDeactivate: 'Review deactivation', presetExperiments: 'Active experiments', presetMissing: 'Missing / inconsistent data', presetName: 'Preset name', savePreset: 'Save current filters', deletePreset: 'Delete preset', presetSaved: 'Filter preset saved.', presetDeleted: 'Filter preset deleted.', presetLimit: 'You can save up to {count} custom filter presets.', presetInvalid: 'Preset names must contain 2–32 characters.',
            historyCharts: 'Historical change charts', noChartData: 'At least two valid records are required for a chart.', chartApproximate: 'approximate value', chartLegacy: 'unverified legacy record', chartStaleExcluded: '{count} stale observation(s) excluded from the chart.', chartMissingExcluded: '{count} missing or unreadable observation(s) excluded from the chart.', chartCurrencyExcluded: '{count} prior observation(s) excluded because their currency differs from the current record.', chartMixedCurrencies: 'mixed currencies', experimentTimeline: 'Improvement experiment timeline', timelinePlanned: 'Proposal planned', timelinePublished: 'Published on Etsy', timelineObserving: 'Observation started', timelineEvaluationDue: 'Evaluation due', timelineEvaluated: 'Experiment result', timelineNotApplied: 'Not applied yet',
            aiComparison: 'AI proposal before / after', aiComparisonEmpty: 'No imported AI proposal is available yet.', beforeValue: 'Before', proposedValue: 'AI proposal', appliedValue: 'Verified result', changedFields: 'Changed fields', valueNotCaptured: 'The previous value was not captured.',
            collectionRetrying: 'Temporary page error · retry {attempt}/{max}…', errorReport: 'Detailed error report', errorReportTitle: 'Page collection error report', copyErrorReport: 'Copy report', reportCopied: 'Error report copied to the clipboard.', reportPhase: 'Phase', reportExpectedPage: 'Expected page', reportObservedPage: 'Observed page', reportAttempts: 'Attempts', reportTime: 'Failure time', reportNoSensitiveData: 'The report contains technical collection state only; it excludes cookies, sessions, and page HTML.',
            checkUpdate: 'Check for updates', updateChecking: 'Checking for updates…', updateAvailable: 'New version available: v{version}', updateCurrent: 'Listing Analyzer is up to date.', updateFailed: 'Update check failed: {message}', installUpdate: 'Update in Tampermonkey', updateInstallHelp: 'Installation finishes in Tampermonkey’s confirmation screen; the script never replaces itself silently.', updateBlocked: 'An update cannot be opened while collection or the action queue is active.',
            importBackup: 'Import backup', backupImportTitle: 'Import analysis backup', backupImportIntro: 'The JSON backup is fully validated first, then safely merged with current local data. An old action queue is never activated.', chooseBackup: 'Choose JSON backup', backupPreview: '{records} listing records · {presets} custom presets', backupImportAction: 'Validate and merge', backupInvalid: 'Backup validation failed: {message}', backupImported: 'Imported {records} listings and {presets} presets.', backupTooLarge: 'The backup file must be 25 MB or smaller.', backupQueueSkipped: 'The action queue in the backup was not activated for safety.',
            storageUsage: 'Estimated local data', storageUsageValue: '{size} MB', storageQuotaWarning: 'Local storage is near its limit or rejected a write. Export a backup, reduce old data, and retry.', storageWriteFailed: 'Local data could not be written. No bulk workflow continued with an incomplete record.', thresholdInvalidValue: '{field} must be a whole number from {min} to {max}.', thresholdQueueLocked: 'Analysis thresholds cannot change while an action queue is active. Complete or stop the queue first.', proposalQueueLocked: 'This listing is part of an active action queue, so its proposal cannot change. Complete or stop the queue first.',
            telemetryMenu: 'Usage metrics settings', telemetryTitle: 'Privacy-preserving usage metrics', telemetryNoticeBody: 'Usage metrics are enabled by default. Only the script ID and version, a random installation ID, allowlisted open/success signals, and fixed error codes are sent. No raw error text or Etsy content is collected.', telemetryPrivacy: 'Privacy', telemetryPrivacyPolicy: 'Privacy policy', telemetryEnable: 'Enable', telemetryDisableDeleteShort: 'Disable & delete', telemetryDisableDelete: 'Disable & delete server data', telemetryGotIt: 'Got it', telemetryStatusEnabled: 'Status: enabled. Allowlisted open/success signals and fixed error codes only; no raw error text or Etsy content is collected.', telemetryStatusDisabled: 'Status: disabled.', telemetryStatusUnavailable: 'Status: unavailable. Usage metrics remain blocked in this tab until the setting can be read and verified.', telemetryEnabled: 'Usage metrics enabled.', telemetrySaveFailed: 'The setting could not be saved.', telemetryDisableFailedMenu: 'Usage metrics could not be disabled because the setting was not saved. Metrics remain blocked in this tab; retry from the userscript menu.', telemetryDisableFailedHere: 'Usage metrics could not be disabled because the setting was not saved. Metrics remain blocked in this tab; retry here.', telemetryDisabledDeleted: 'Usage metrics are disabled and server data was deleted.', telemetryDisabledCleanupMenu: 'Usage metrics are disabled, but cleanup could not be completed; retry from the userscript menu.', telemetryDisabledCleanupHere: 'Usage metrics are disabled, but cleanup could not be completed. You can retry here.',
            errorReportHistory: 'Failure history', errorReportGuidance: 'First verify that the page has fully loaded. You can then retry the collection safely from its saved position.', retryCollection: 'Retry collection', downloadErrorReports: 'Download all reports', reportDownloaded: 'Failure reports downloaded.',
            lastAnalysis: 'Last successful analysis: {time}', analysisValidity: 'Completed analyses remain valid for 24 hours.',
            thresholdCalibration: 'Thresholds suggested from shop data', thresholdCalibrationCopy: 'Suggestions use fresh, non-experimental distributions from a complete shop collection and are never applied automatically.', calibrationAvailable: 'Calibrated from {count} listings.', calibrationInsufficient: 'At least 20 readable listings are required for calibration.', useRecommended: 'Fill suggested values', recommendedValue: 'Suggested: {value}', thresholdImpact: 'With these values, about {improve} listings qualify for improvement review and {protect} as strong performers.', thresholdRelationship: 'The strong-listing protection threshold must be greater than the improvement threshold.', thresholdHelpImprove: 'Minimum visits that trigger improvement review when there are no sales.', thresholdHelpProtect: 'Visits required to protect a strong listing; this must exceed the improvement threshold.', thresholdHelpRenewals: 'Minimum renewals required before deactivation review.', thresholdHelpDecline: 'Percentage change that triggers a decline warning.', resetDefaults: 'Restore safe defaults',
            experimentOverlapTitle: 'This conflicts with an active experiment', experimentOverlapCopy: 'This listing still has an observed improvement experiment. A new change can make the earlier result impossible to isolate.', acknowledgeOverlap: 'I understand the overlap and still want to prepare this proposal.', experimentOverlapRequired: 'A proposal that overlaps an active experiment cannot enter the queue until you acknowledge it.',
            aiErrorJson: 'The JSON could not be parsed. Check for a trailing comma, missing quote, or code-fence markers.', aiErrorSchema: 'The response schema is invalid. schema must be makaytron-listing-ai-proposals/v1 and proposals must be an array.', aiErrorRequest: 'The requestId is unknown or expired. Copy a fresh AI request package.', aiErrorProposal: 'The proposal failed validation at {path}.', aiErrorHelp: 'Fix the expected field and retry the same JSON; no proposal is written while an error exists.', aiFormatHelp: 'tags and materials must be JSON arrays; title and description must be strings.', copyAiTemplate: 'Copy example JSON', aiTemplateCopied: 'Example AI JSON copied to the clipboard.',
            queueRecoveryTitle: 'An interrupted action queue was found', queueRecoveryCopy: 'The page may have closed before the last step finished. The same write is never repeated until you inspect the listing state.', queueRecoveryRetry: 'Safely prepare item again', queueRecoveryConfirm: 'Have you checked the current Etsy form? The item will only return to pending; nothing will publish automatically.', queueRecoverySubmitted: 'This listing may have been submitted to Etsy without a verified result. Automatic retry is disabled to prevent a duplicate write; verify Etsy manually or stop the queue.', queueRecoveryOpen: 'Open listing for safe review', queueRecoveryStop: 'Stop queue',
            userFeedback: 'Feedback', feedbackTitle: 'Listing Analyzer feedback', feedbackIntro: 'Your note is stored locally first. GitHub opens only when you press the button; listing titles and IDs are excluded.', feedbackCategory: 'Topic', feedbackRating: 'Experience rating', feedbackNote: 'Your note', feedbackDiagnostics: 'Include anonymous technical summary', feedbackSend: 'Save, copy, and open GitHub form', feedbackSaved: 'Feedback saved locally and copied to the clipboard.', feedbackInvalid: 'Please enter a clear note containing 10–800 characters.', feedbackBug: 'Bug', feedbackIdea: 'Idea', feedbackUsability: 'Usability', feedbackAnalysis: 'Analysis result', feedbackCount: 'Local feedback',
            researchStart: 'Research with Marketplace Insights', researchOneListing: 'Select exactly one listing for research.', researchProbing: 'Looking for Etsy Keyword & Market Analyzer…', researchCompanionMissingTitle: 'Etsy Keyword & Market Analyzer required', researchCompanionMissing: 'Connected Marketplace Insights research requires the separate Etsy Keyword & Market Analyzer script. Listing Analyzer continues to work independently with all other features.', researchInstallHelp: 'The script cannot install silently. Its install page opens in a new tab and you give the final approval in your userscript manager.', researchOpenInstall: 'Open install page', researchTransferTitle: 'Marketplace Insights research', researchWaitingReady: 'Waiting for the Insights tab to become ready…', researchRequestSent: 'Research request sent; keep Analyzer open.', researchAcknowledged: 'Request accepted; waiting for Etsy Marketplace Insights results…', researchTimedOut: 'The automatic response window elapsed. Analyzer stays open and accepts a valid result until it expires; use the JSON recovery controls if needed.', researchComplete: '{count} keyword evidence item(s) validated; the proposal was not published automatically.', researchSavedForReview: 'Title and tag proposal saved for review; no Etsy field was changed.', researchNeedsEditor: 'Evidence and suggestion were saved. Open the listing editor once to compare tags safely; no action queue item was created.', researchFailed: 'Research result could not be validated: {message}', researchCopyRequest: 'Copy request JSON', researchRequestCopied: 'Research request JSON copied to the clipboard.', researchImportResult: 'Import result JSON', researchResultLabel: 'Complete RESEARCH_RESULT envelope JSON', researchReopenInsights: 'Reopen Insights', researchEvidenceTitle: 'Marketplace Insights evidence', researchSearches30d: '30-day searches', researchSearchResults: 'Search results / competition indicator', researchOpportunity: 'Makaytron opportunity score', researchSourceNote: 'Source: visible Etsy Marketplace Insights page data. The opportunity score is derived by Makaytron.', researchStale: 'The listing title or tags changed after research started; the result was rejected safely.', researchNoSeeds: 'No usable title or tag was available for research.', researchOpenProposal: 'Review proposal', researchPendingExists: 'The pending research for this listing was reopened.', researchErrorRemote: 'Keyword Analyzer could not complete the research: {message}', researchProposalReason: 'Marketplace Insights evidence: “{keyword}” — {searches} searches / 30 days, {results} search results. The Makaytron opportunity score is a derived metric.', researchTagReplacement: 'Because all 13 tag slots are full, low-evidence “{old}” was replaced by “{keyword}” in the review draft only.', updateManagedExternally: 'Updates are managed by the installation source; the GitHub updater was not forced.',
        }),
    });

    const state = {
        settings: { ...DEFAULT_SETTINGS },
        records: [],
        pageListings: [],
        selectedIds: new Set(),
        queue: null,
        host: null,
        shadow: null,
        panel: null,
        launcher: null,
        modal: null,
        activeView: 'overview',
        wide: false,
        status: { key: 'ready', tone: 'ready', params: {} },
        menuIds: [],
        routeKey: '',
        routeGeneration: 0,
        routeTask: null,
        routeRetryKey: '',
        routeTimer: 0,
        editorInteractionEpoch: 0,
        editorInteractionConflict: false,
        editorInteractionWatcherInstalled: false,
        leaseTimer: 0,
        leaseToken: '',
        actionTask: null,
        collection: null,
        collectionLoop: null,
        collectionStartTask: null,
        collectionPauseRequested: false,
        collectionLeaseTimer: 0,
        collectionLeaseToken: '',
        collectionSyncTimer: 0,
        analysisExpiryTimer: 0,
        renderedAnalysisFresh: null,
        tabPresenceChannel: null,
        analysisQuery: '',
        analysisFilters: { ...DEFAULT_ANALYSIS_FILTERS },
        filterPresets: [],
        analysisFilterDrawerOpen: false,
        analysisLimit: ANALYSIS_BATCH_SIZE,
        updateState: { status: 'idle', latestVersion: '', checkedVersion: '', checkedAt: 0, error: '', commitSha: '', installUrl: '' },
        storageHealth: { estimateBytes: 0, warning: '', failedKey: '', failedAt: '', dirty: true },
        settingsSaveError: '',
        preferenceRevisions: {
            'uiPreferences:collapsed': 0,
            'uiPreferences:language': 0,
            healthSettings: 0,
            analysisFilters: 0,
            filterPresets: 0,
        },
        feedback: [],
        modalReturnFocus: null,
        researchChannel: null,
        researchProbeWaiters: new Map(),
        researchUiTimers: new Map(),
    };

    function randomId(prefix = 'id') {
        try { return `${prefix}-${crypto.randomUUID()}`; }
        catch { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
    }

    function randomNonce() {
        try {
            const bytes = new Uint8Array(24);
            crypto.getRandomValues(bytes);
            return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
        } catch { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`; }
    }

    let tabId = (() => {
        try {
            const key = `${APP.storagePrefix}:tab-id`;
            const existing = sessionStorage.getItem(key);
            if (existing) return existing;
            const created = randomId('tab');
            sessionStorage.setItem(key, created);
            return created;
        } catch { return randomId('tab'); }
    })();
    const pageInstanceId = randomId('page');

    async function ensureUniqueTabIdentity() {
        if (typeof BroadcastChannel !== 'function') return tabId;
        try {
            const channel = new BroadcastChannel(`${APP.storagePrefix}:tab-presence`);
            const probeId = randomId('probe');
            let duplicate = false;
            channel.addEventListener('message', (event) => {
                const message = event.data;
                if (!message || message.instanceId === pageInstanceId || message.tabId !== tabId) return;
                if (message.type === 'probe') channel.postMessage({ type: 'present', tabId, probeId: message.probeId, instanceId: pageInstanceId });
                if (message.type === 'present' && message.probeId === probeId) duplicate = true;
            });
            channel.postMessage({ type: 'probe', tabId, probeId, instanceId: pageInstanceId });
            await sleep(80);
            if (duplicate) {
                tabId = randomId('tab');
                try { sessionStorage.setItem(`${APP.storagePrefix}:tab-id`, tabId); } catch { /* optional */ }
            }
            state.tabPresenceChannel = channel;
        } catch { /* BroadcastChannel is an optional duplicate-tab hardening layer. */ }
        return tabId;
    }

    function t(key, params = {}) {
        const dictionary = I18N[state.settings.language] || I18N.tr;
        const extra = EXTRA_I18N[state.settings.language] || EXTRA_I18N.tr;
        const template = dictionary[key] ?? extra[key] ?? I18N.tr[key] ?? EXTRA_I18N.tr[key] ?? key;
        return String(template).replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (character) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        })[character]);
    }

    function normalizeSpace(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
    function nowIso() { return new Date().toISOString(); }
    function dayKey(iso = nowIso()) {
        const time = validTime(iso);
        return time === null ? '' : new Date(time).toISOString().slice(0, 10);
    }
    function sleep(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
    async function withNamedLock(name, callback) {
        if (!navigator.locks?.request) {
            const error = new Error('Cross-tab storage locking is unavailable.');
            error.code = 'STORAGE_LOCK_UNAVAILABLE';
            throw error;
        }
        return navigator.locks.request(name, { mode: 'exclusive' }, callback);
    }
    function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || 0)); }
    function uniqueStrings(values) {
        const seen = new Set();
        return values.map(normalizeSpace).filter((value) => value && !seen.has(value.toLocaleLowerCase()) && seen.add(value.toLocaleLowerCase()));
    }
    function sameStringSet(left, right) {
        const normalize = (values) => uniqueStrings(Array.isArray(values) ? values : []).map((value) => value.toLocaleLowerCase()).sort();
        return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
    }

    const DAY_MS = 86400000;
    function finiteOrNull(value) {
        if (!['number', 'string'].includes(typeof value)) return null;
        if (typeof value === 'string' && !value.trim()) return null;
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
    }
    function validTime(value) { const time = Date.parse(value); return Number.isFinite(time) ? time : null; }
    function daysBetween(newer, older) {
        const newerTime = validTime(newer); const olderTime = validTime(older);
        return newerTime === null || olderTime === null ? null : (newerTime - olderTime) / DAY_MS;
    }
    function freshnessAgeDays(snapshotAt, evaluatedAt) {
        const snapshotTime = validTime(snapshotAt); const evaluationTime = validTime(evaluatedAt);
        if (snapshotTime === null || evaluationTime === null || snapshotTime > evaluationTime + SNAPSHOT_FUTURE_TOLERANCE_MS) return null;
        return Math.max(0, (evaluationTime - snapshotTime) / DAY_MS);
    }
    function addDays(value, days) {
        const time = validTime(value);
        return time === null ? null : new Date(time + Number(days || 0) * DAY_MS).toISOString();
    }
    function median(values) {
        const sorted = values.map(finiteOrNull).filter(Number.isFinite).sort((a, b) => a - b);
        if (!sorted.length) return null;
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    }
    function percentileRank(values, value) {
        const target = finiteOrNull(value);
        const sorted = values.map(finiteOrNull).filter(Number.isFinite).sort((a, b) => a - b);
        if (target === null || !sorted.length) return null;
        const below = sorted.filter((item) => item < target).length;
        const equal = sorted.filter((item) => item === target).length;
        return clamp(Math.round(((below + (equal * 0.5)) / sorted.length) * 100), 0, 100);
    }
    function percentChange(current, previous) {
        const currentValue = finiteOrNull(current); const previousValue = finiteOrNull(previous);
        if (currentValue === null || previousValue === null || previousValue === 0) return null;
        return Math.round(((currentValue - previousValue) / previousValue) * 1000) / 10;
    }
    function safeRatio(numerator, denominator, multiplier = 1) {
        const top = finiteOrNull(numerator); const bottom = finiteOrNull(denominator);
        if (top === null || bottom === null || bottom <= 0) return null;
        return Math.round((top / bottom) * multiplier * 1000) / 1000;
    }
    function bayesianRate(numerator, denominator, priorRatePercent = HEALTH_RULES.favoritePriorRate, priorTrials = HEALTH_RULES.favoritePriorVisits) {
        const top = finiteOrNull(numerator); const bottom = finiteOrNull(denominator);
        const priorRate = finiteOrNull(priorRatePercent); const priorWeight = finiteOrNull(priorTrials);
        if (top === null || bottom === null || top < 0 || bottom < 0 || priorRate === null || priorRate < 0 || priorWeight === null || priorWeight <= 0) return null;
        return Math.round(((top + (priorRate / 100) * priorWeight) / (bottom + priorWeight)) * 100000) / 1000;
    }
    function logGamma(value) {
        const coefficients = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
        if (!Number.isFinite(value) || value <= 0) return null;
        if (value < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
        let shifted = value - 1;
        let sum = 0.9999999999998099;
        coefficients.forEach((coefficient, index) => { sum += coefficient / (shifted + index + 1); });
        const base = shifted + coefficients.length - 0.5;
        return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(base) - base + Math.log(sum);
    }

    function betaContinuedFraction(a, b, x) {
        const maxIterations = 2048; const epsilon = 3e-14; const floor = 1e-300;
        const sum = a + b; const plus = a + 1; const minus = a - 1;
        let c = 1; let d = 1 - (sum * x) / plus;
        if (Math.abs(d) < floor) d = floor;
        d = 1 / d;
        let result = d;
        let converged = false;
        for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
            const twice = iteration * 2;
            let term = (iteration * (b - iteration) * x) / ((minus + twice) * (a + twice));
            d = 1 + term * d; if (Math.abs(d) < floor) d = floor;
            c = 1 + term / c; if (Math.abs(c) < floor) c = floor;
            d = 1 / d; result *= d * c;
            if (![c, d, result].every(Number.isFinite)) return null;
            term = -((a + iteration) * (sum + iteration) * x) / ((a + twice) * (plus + twice));
            d = 1 + term * d; if (Math.abs(d) < floor) d = floor;
            c = 1 + term / c; if (Math.abs(c) < floor) c = floor;
            d = 1 / d;
            const delta = d * c;
            result *= delta;
            if (![c, d, delta, result].every(Number.isFinite)) return null;
            if (Math.abs(delta - 1) <= epsilon) { converged = true; break; }
        }
        return converged && Number.isFinite(result) ? result : null;
    }

    function regularizedBeta(x, a, b) {
        if (![x, a, b].every(Number.isFinite) || a <= 0 || b <= 0) return null;
        if (x <= 0) return 0;
        if (x >= 1) return 1;
        const gammaSum = logGamma(a + b); const gammaA = logGamma(a); const gammaB = logGamma(b);
        if (![gammaSum, gammaA, gammaB].every(Number.isFinite)) return null;
        const logBeta = gammaSum - gammaA - gammaB + a * Math.log(x) + b * Math.log1p(-x);
        if (!Number.isFinite(logBeta)) return null;
        const factor = Math.exp(logBeta);
        if (!Number.isFinite(factor)) return null;
        const fraction = x < (a + 1) / (a + b + 2)
            ? betaContinuedFraction(a, b, x)
            : betaContinuedFraction(b, a, 1 - x);
        if (!Number.isFinite(fraction)) return null;
        const value = x < (a + 1) / (a + b + 2)
            ? factor * fraction / a
            : 1 - factor * fraction / b;
        return Number.isFinite(value) && value >= -1e-12 && value <= 1 + 1e-12 ? Math.min(1, Math.max(0, value)) : null;
    }

    function inverseRegularizedBeta(probability, a, b) {
        if (![probability, a, b].every(Number.isFinite) || probability < 0 || probability > 1 || a <= 0 || b <= 0) return null;
        if (probability === 0) return 0;
        if (probability === 1) return 1;
        let low = 0; let high = 1;
        for (let iteration = 0; iteration < 100; iteration += 1) {
            const middle = (low + high) / 2;
            const observed = regularizedBeta(middle, a, b);
            if (!Number.isFinite(observed)) return null;
            if (observed < probability) low = middle;
            else high = middle;
        }
        return (low + high) / 2;
    }

    function exactPoissonRateRatioInterval(beforeEvents, beforeExposure, afterEvents, afterExposure, confidenceLevel = HEALTH_RULES.experimentConfidenceLevel) {
        const beforeCount = finiteOrNull(beforeEvents); const beforeSample = finiteOrNull(beforeExposure);
        const afterCount = finiteOrNull(afterEvents); const afterSample = finiteOrNull(afterExposure); const confidence = finiteOrNull(confidenceLevel);
        if (![beforeCount, beforeSample, afterCount, afterSample, confidence].every(Number.isFinite)
            || !Number.isSafeInteger(beforeCount) || !Number.isSafeInteger(afterCount) || beforeCount < 0 || afterCount < 0
            || beforeCount + afterCount > HEALTH_RULES.maximumExactExperimentEvents
            || beforeSample <= 0 || afterSample <= 0 || confidence <= 0 || confidence >= 1 || beforeCount + afterCount === 0) return null;
        const total = beforeCount + afterCount;
        const alpha = 1 - confidence;
        const lowerProbability = afterCount === 0 ? 0 : inverseRegularizedBeta(alpha / 2, afterCount, beforeCount + 1);
        const upperProbability = afterCount === total ? 1 : inverseRegularizedBeta(1 - alpha / 2, afterCount + 1, beforeCount);
        if (!Number.isFinite(lowerProbability) || !Number.isFinite(upperProbability)) return null;
        const toRatio = (probability) => {
            if (probability <= 0) return 0;
            if (probability >= 1) return null;
            return (probability * beforeSample) / (afterSample * (1 - probability));
        };
        const nullProbability = afterSample / (beforeSample + afterSample);
        const pIncrease = afterCount === 0 ? 1 : regularizedBeta(nullProbability, afterCount, beforeCount + 1);
        const pDecrease = beforeCount === 0 ? 1 : regularizedBeta(1 - nullProbability, beforeCount, afterCount + 1);
        const low = toRatio(lowerProbability); const high = toRatio(upperProbability);
        if (![pIncrease, pDecrease, low].every(Number.isFinite) || (high !== null && (!Number.isFinite(high) || low > high))) return null;
        const ratioKind = beforeCount === 0 ? 'infinite' : afterCount === 0 ? 'zero' : 'finite';
        return {
            method: 'conditional-exact-poisson', confidenceLevel: confidence,
            ratio: ratioKind === 'finite' ? (afterCount / afterSample) / (beforeCount / beforeSample) : ratioKind === 'zero' ? 0 : null,
            ratioKind, low, high, highOpen: upperProbability === 1,
            pValueIncrease: pIncrease, pValueDecrease: pDecrease, pValueTwoSided: Math.min(1, 2 * Math.min(pIncrease, pDecrease)),
            beforeEvents: beforeCount, beforeExposure: beforeSample, afterEvents: afterCount, afterExposure: afterSample,
        };
    }
    function separatedRateDirection(beforeSuccesses, beforeTrials, afterSuccesses, afterTrials) {
        const comparison = exactPoissonRateRatioInterval(beforeSuccesses, beforeTrials, afterSuccesses, afterTrials);
        return {
            comparison,
            winner: Boolean(comparison && comparison.low > 1),
            underperformed: Boolean(comparison && comparison.high !== null && comparison.high < 1),
        };
    }
    function fnv1a(value) {
        let hash = 0x811c9dc5;
        for (const character of String(value)) {
            hash ^= character.charCodeAt(0);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        return hash.toString(16).padStart(8, '0');
    }

    function parseDecimal(raw) {
        let value = String(raw ?? '').replace(/[^\d,.-]/g, '');
        if (!value) return null;
        const comma = value.lastIndexOf(',');
        const dot = value.lastIndexOf('.');
        if (comma >= 0 && dot >= 0) {
            const decimal = comma > dot ? ',' : '.';
            const thousands = decimal === ',' ? /\./g : /,/g;
            value = value.replace(thousands, '').replace(decimal, '.');
        } else if (comma >= 0) {
            const decimals = value.length - comma - 1;
            value = decimals > 0 && decimals <= 2 ? value.replace(',', '.') : value.replace(/,/g, '');
        } else if (dot >= 0) {
            const decimals = value.length - dot - 1;
            if (decimals > 2) value = value.replace(/\./g, '');
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function escapeRegExp(value) {
        return String(value).replace(/[.*+?^{}$()|[\]\\]/g, '\\$&');
    }

    function parseCountValue(raw) {
        const source = normalizeSpace(raw);
        const compact = source.match(/^(-?[\d][\d.,\s]*?)\s*([kmb])?$/i);
        if (!compact) return null;
        if (compact[2]) {
            const base = parseDecimal(compact[1]);
            const multiplier = { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[compact[2].toLowerCase()];
            return Number.isFinite(base) ? Math.round(base * multiplier) : null;
        }
        const parsed = Number(compact[1].replace(/[^\d-]/g, ''));
        return Number.isFinite(parsed) ? parsed : null;
    }

    function labeledPrefix(rows, labels) {
        const labelPattern = labels.map(escapeRegExp).join('|');
        const matcher = new RegExp(`^(.+?)\\s+(?:${labelPattern})$`, 'i');
        for (const row of rows) {
            const match = normalizeSpace(row).match(matcher);
            if (match) return match[1];
        }
        return null;
    }

    function parseCount(text, labels) {
        const prefix = labeledPrefix([text], labels);
        return prefix === null ? null : parseCountValue(prefix);
    }

    function parseCountFromRows(rows, labels) {
        const prefix = labeledPrefix(rows, labels);
        return prefix === null ? null : parseCountValue(prefix);
    }

    function parseMoneyFromLabel(text, labels) {
        const prefix = labeledPrefix([text], labels);
        return prefix === null ? null : parseDecimal(prefix);
    }

    const SUPPORTED_CURRENCY_CODES = new Set([
        'AED', 'ARS', 'AUD', 'BRL', 'CAD', 'CHF', 'CLP', 'CNY', 'CZK', 'DKK', 'EGP', 'EUR', 'GBP', 'HKD', 'HUF',
        'IDR', 'ILS', 'INR', 'JPY', 'KRW', 'MAD', 'MXN', 'MYR', 'NOK', 'NZD', 'PEN', 'PHP', 'PLN', 'RON', 'RUB',
        'SEK', 'SGD', 'THB', 'TRY', 'TWD', 'UAH', 'USD', 'VND', 'ZAR',
    ]);
    const CURRENCY_SYMBOL_CODES = Object.freeze({
        '$': Object.freeze(['ARS', 'AUD', 'CAD', 'CLP', 'HKD', 'MXN', 'NZD', 'SGD', 'USD']),
        '€': Object.freeze(['EUR']), '£': Object.freeze(['GBP']), '₺': Object.freeze(['TRY']),
        '¥': Object.freeze(['CNY', 'JPY']), '₹': Object.freeze(['INR']), '₽': Object.freeze(['RUB']), '₩': Object.freeze(['KRW']),
    });

    function currencyMarker(text) {
        const source = normalizeSpace(text);
        const qualifiedSymbols = [
            [/\bUS\s*\$/i, 'USD'], [/\bCA\s*\$/i, 'CAD'], [/\bAU?\s*\$/i, 'AUD'], [/\bNZ\s*\$/i, 'NZD'],
            [/\bHK\s*\$/i, 'HKD'], [/\bSG\s*\$/i, 'SGD'], [/\bMX\s*\$/i, 'MXN'], [/\bNT\s*\$/i, 'TWD'], [/\bR\s*\$/i, 'BRL'],
        ];
        const qualified = qualifiedSymbols.find(([pattern]) => pattern.test(source))?.[1];
        const rawCode = source.match(/\b(?:TL|[A-Z]{3})\b/i)?.[0]?.toUpperCase();
        const code = rawCode === 'TL' ? 'TRY' : rawCode;
        const symbol = source.match(/[$€£₺¥₹₽₩]/)?.[0];
        if (code) {
            if (!SUPPORTED_CURRENCY_CODES.has(code)) return '';
            if (qualified && qualified !== code) return '';
            if (!qualified && symbol && !(CURRENCY_SYMBOL_CODES[symbol] || []).includes(code)) return '';
            return `${code} `;
        }
        if (qualified) return `${qualified} `;
        return symbol || '';
    }

    function currencyDescriptor(value) {
        const marker = normalizeSpace(value);
        if (!marker) return null;
        const code = marker.toUpperCase() === 'TL' ? 'TRY' : marker.toUpperCase();
        if (SUPPORTED_CURRENCY_CODES.has(code)) return { marker: `${code} `, code, symbol: '' };
        if (Object.hasOwn(CURRENCY_SYMBOL_CODES, marker)) return { marker, code: '', symbol: marker };
        return null;
    }

    function currencyMarkerIsInvalid(text) {
        const source = normalizeSpace(text);
        const explicitCode = source.match(/\b(?:TL|[A-Z]{3})\b/i)?.[0] || '';
        const explicitSymbol = source.match(/[$€£₺¥₹₽₩]/)?.[0] || '';
        return Boolean((explicitCode || explicitSymbol) && !currencyMarker(source));
    }

    function currencyIdentity(value) {
        const descriptor = currencyDescriptor(value);
        if (!descriptor) return '';
        if (descriptor.code) return descriptor.code;
        const candidates = CURRENCY_SYMBOL_CODES[descriptor.symbol] || [];
        return candidates.length === 1 ? candidates[0] : descriptor.symbol;
    }

    function currenciesComparable(left, right) {
        const leftIdentity = currencyIdentity(left); const rightIdentity = currencyIdentity(right);
        return Boolean(leftIdentity && rightIdentity && leftIdentity === rightIdentity);
    }

    function resolveCardCurrency(priceCurrency, metricCurrency) {
        const price = currencyDescriptor(priceCurrency); const metric = currencyDescriptor(metricCurrency);
        if (!price && !metric) return '';
        if (!price || !metric) return (price || metric).marker;
        if (price.code && metric.code) return price.code === metric.code ? price.marker : '';
        if (price.symbol && metric.symbol) return price.symbol === metric.symbol ? price.marker : '';
        const coded = price.code ? price : metric; const symbolic = price.symbol ? price : metric;
        return (CURRENCY_SYMBOL_CODES[symbolic.symbol] || []).includes(coded.code) ? coded.marker : '';
    }

    function parseListingMetrics(rows) {
        const source = Array.isArray(rows) ? rows.map(normalizeSpace).filter(Boolean) : [];
        const revenuePrefix = labeledPrefix(source, ['revenue', 'gelir']);
        return {
            visits: parseCountFromRows(source, ['visit', 'visits', 'ziyaret', 'ziyaretler']),
            favorites: parseCountFromRows(source, ['favorite', 'favorites', 'favori', 'favoriler']),
            sales: parseCountFromRows(source, ['sale', 'sales', 'satış']),
            revenue: revenuePrefix === null ? null : parseDecimal(revenuePrefix),
            renewals: parseCountFromRows(source, ['renewal', 'renewals', 'yenileme', 'yenilemeler']),
            currency: revenuePrefix === null ? '' : currencyMarker(revenuePrefix),
        };
    }

    const LISTING_METRIC_LABELS = Object.freeze({
        visits: Object.freeze(['visit', 'visits', 'ziyaret', 'ziyaretler']),
        favorites: Object.freeze(['favorite', 'favorites', 'favori', 'favoriler']),
        sales: Object.freeze(['sale', 'sales', 'satış']),
        revenue: Object.freeze(['revenue', 'gelir']),
        renewals: Object.freeze(['renewal', 'renewals', 'yenileme', 'yenilemeler']),
    });

    function metricHeadingScope(value) {
        const heading = normalizeSpace(value).toLowerCase();
        if (LISTING_METRIC_CONTRACT.rollingHeadings.includes(heading)) return 'rolling-30d';
        if (LISTING_METRIC_CONTRACT.lifetimeHeadings.includes(heading)) return 'lifetime';
        return '';
    }

    function parseScopedListingMetrics(sections) {
        const source = (Array.isArray(sections) ? sections : []).map((section) => ({
            heading: normalizeSpace(section?.heading),
            scope: metricHeadingScope(section?.heading),
            rows: Array.isArray(section?.rows) ? section.rows.map(normalizeSpace).filter(Boolean) : [],
        })).filter((section) => section.scope);
        const rolling = source.filter((section) => section.scope === 'rolling-30d');
        const lifetime = source.filter((section) => section.scope === 'lifetime');
        if (rolling.length !== 1 || lifetime.length !== 1) return { valid: false, reason: 'metric-heading-contract' };
        const expected = { 'rolling-30d': ['visits', 'favorites'], lifetime: ['sales', 'revenue', 'renewals'] };
        const values = {}; const countPrecision = {}; let currency = '';
        for (const section of [rolling[0], lifetime[0]]) {
            const found = new Map();
            for (const row of section.rows) {
                const matching = Object.entries(LISTING_METRIC_LABELS).filter(([, labels]) => labeledPrefix([row], labels) !== null);
                if (matching.length !== 1) continue;
                const [field, labels] = matching[0];
                if (!expected[section.scope].includes(field) || found.has(field)) return { valid: false, reason: 'metric-row-contract' };
                const prefix = labeledPrefix([row], labels);
                if (field === 'revenue' && /[kmb]\s*$/i.test(prefix)) return { valid: false, reason: 'metric-value-contract' };
                if (field === 'revenue' && currencyMarkerIsInvalid(prefix)) return { valid: false, reason: 'metric-currency-contract' };
                const value = field === 'revenue' ? parseDecimal(prefix) : parseCountValue(prefix);
                if (!Number.isFinite(value)) return { valid: false, reason: 'metric-value-contract' };
                found.set(field, value);
                if (field !== 'revenue') countPrecision[field] = /[kmb]\s*$/i.test(prefix) ? 'approximate' : 'exact';
                if (field === 'revenue') currency = currencyMarker(prefix);
            }
            if (expected[section.scope].some((field) => !found.has(field))) return { valid: false, reason: 'metric-row-contract' };
            found.forEach((value, field) => { values[field] = value; });
        }
        return {
            valid: true,
            metrics: { ...values, currency },
            contract: {
                id: LISTING_METRIC_CONTRACT.id, version: 1, verified: true, source: 'etsy-listings-visible-dom',
                scopes: { ...LISTING_METRIC_CONTRACT.scopes },
                headings: { rolling30d: rolling[0].heading, lifetime: lifetime[0].heading },
                countPrecision,
                sourceUpdatedAt: null, sourceTimeStatus: 'unknown',
            },
        };
    }

    function normalizeMetricContract(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const scopes = raw.scopes && typeof raw.scopes === 'object' ? raw.scopes : {};
        const validScopes = HEALTH_METRIC_FIELDS.every((field) => scopes[field] === LISTING_METRIC_CONTRACT.scopes[field]);
        const headings = raw.headings && typeof raw.headings === 'object' ? raw.headings : {};
        const validHeadings = metricHeadingScope(headings.rolling30d) === 'rolling-30d' && metricHeadingScope(headings.lifetime) === 'lifetime';
        const countPrecision = raw.countPrecision && typeof raw.countPrecision === 'object' ? raw.countPrecision : {};
        const countFields = DECISION_COUNT_FIELDS;
        const validPrecision = countFields.every((field) => ['exact', 'approximate'].includes(countPrecision[field]));
        if (raw.id !== LISTING_METRIC_CONTRACT.id || Number(raw.version) !== 1 || raw.verified !== true
            || raw.source !== 'etsy-listings-visible-dom' || !validScopes || !validHeadings || !validPrecision) return null;
        const sourceUpdatedAt = validTime(raw.sourceUpdatedAt) === null ? null : new Date(validTime(raw.sourceUpdatedAt)).toISOString();
        return {
            id: LISTING_METRIC_CONTRACT.id, version: 1, verified: true,
            source: 'etsy-listings-visible-dom',
            scopes: { ...LISTING_METRIC_CONTRACT.scopes },
            headings: { rolling30d: normalizeSpace(headings.rolling30d), lifetime: normalizeSpace(headings.lifetime) },
            countPrecision: Object.fromEntries(countFields.map((field) => [field, countPrecision[field]])),
            sourceUpdatedAt,
            sourceTimeStatus: sourceUpdatedAt && raw.sourceTimeStatus === 'etsy-reported' ? 'etsy-reported' : 'unknown',
        };
    }

    function snapshotCountsAreExact(snapshot, fields) {
        const contract = normalizeMetricContract(snapshot?.metricContract);
        return Boolean(contract && (fields || []).every((field) => {
            const value = finiteOrNull(snapshot?.[field]);
            return contract.countPrecision?.[field] === 'exact' && Number.isSafeInteger(value) && value >= 0;
        }));
    }

    function revenueCurrenciesComparable(left, right) {
        const leftRevenue = finiteOrNull(left?.revenue); const rightRevenue = finiteOrNull(right?.revenue);
        if (leftRevenue === null || rightRevenue === null) return false;
        if (leftRevenue === 0 && rightRevenue === 0) return true;
        return currenciesComparable(left?.currency, right?.currency);
    }

    function parsePriceRange(text) {
        const values = String(text ?? '').split(/\s*[-–—]\s*/).map(parseDecimal).filter(Number.isFinite);
        return { min: values[0] ?? null, max: values[1] ?? values[0] ?? null, label: normalizeSpace(text) };
    }

    function formatNumber(value) {
        if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '—';
        return new Intl.NumberFormat(state.settings.language === 'tr' ? 'tr-TR' : 'en-US').format(Number(value));
    }

    function formatMoney(value, currency = '$') {
        if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '—';
        const marker = normalizeSpace(currency) || '$';
        const separator = /^[A-Z]{3}$/.test(marker) ? ' ' : '';
        return `${marker}${separator}${new Intl.NumberFormat(state.settings.language === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 2 }).format(Number(value))}`;
    }

    function formatDate(value) {
        if (!value) return '—';
        try {
            return new Intl.DateTimeFormat(state.settings.language === 'tr' ? 'tr-TR' : 'en-US', {
                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                timeZone: DISPLAY_TIME_ZONE, timeZoneName: 'short',
            }).format(new Date(value));
        }
        catch { return String(value); }
    }

    function normalizeUpdateState(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const allowed = ['idle', 'checking', 'current', 'available', 'error', 'managed'];
        const commitSha = /^[a-f0-9]{40}$/.test(String(source.commitSha || '')) ? String(source.commitSha) : '';
        const installUrl = commitSha ? pinnedUpdateUrl(commitSha) : '';
        const hasVerifiedInstall = Boolean(installUrl && String(source.installUrl || '') === installUrl);
        const requestedStatus = allowed.includes(source.status) && source.status !== 'checking' ? source.status : 'idle';
        const latestVersion = /^\d+\.\d+\.\d+$/.test(String(source.latestVersion || '')) ? String(source.latestVersion) : '';
        const checkedVersion = /^\d+\.\d+\.\d+$/.test(String(source.checkedVersion || '')) ? String(source.checkedVersion) : '';
        const belongsToInstalledVersion = checkedVersion === APP_VERSION;
        const requiresVerifiedInstall = ['current', 'available'].includes(requestedStatus);
        const validCachedStatus = requestedStatus === 'idle'
            || (belongsToInstalledVersion && (!requiresVerifiedInstall || (hasVerifiedInstall && latestVersion)));
        return {
            status: validCachedStatus ? requestedStatus : 'idle',
            latestVersion,
            checkedVersion: belongsToInstalledVersion ? checkedVersion : '',
            checkedAt: Math.max(0, Number(source.checkedAt) || 0),
            error: normalizeSpace(source.error).slice(0, 240),
            commitSha: hasVerifiedInstall && belongsToInstalledVersion ? commitSha : '',
            installUrl: hasVerifiedInstall && belongsToInstalledVersion ? installUrl : '',
            source: ['github', 'greasyfork', 'external'].includes(source.source) ? source.source : '',
        };
    }

    function serializedBytes(value) {
        try { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
        catch { return Number.POSITIVE_INFINITY; }
    }

    function storageErrorCode(error, operation = 'write') {
        const text = `${error?.name || ''} ${error?.message || error || ''}`;
        if (/quota|storage[^a-z]*(?:full|limit)|exceed/i.test(text)) return 'STORAGE_QUOTA_EXCEEDED';
        return operation === 'read' ? 'STORAGE_READ_FAILED' : 'STORAGE_WRITE_FAILED';
    }

    function rememberStorageFailure(key, error, operation = 'write') {
        state.storageHealth = {
            ...state.storageHealth,
            warning: storageErrorCode(error, operation),
            failedKey: String(key || ''),
            failedAt: nowIso(),
        };
    }

    function storageKeyAffectsEstimate(key) {
        const value = String(key || '');
        return [KEYS.index, KEYS.queue, KEYS.collection, KEYS.analysisFilters, KEYS.filterPresets, KEYS.feedback].includes(value)
            || value.startsWith(`${APP.storagePrefix}:listing:`);
    }

    function markStorageEstimateDirty(key = '') {
        if (!key || storageKeyAffectsEstimate(key)) state.storageHealth.dirty = true;
    }

    function refreshStorageEstimate(force = false) {
        if (!force && !state.storageHealth.dirty) return state.storageHealth;
        const estimate = serializedBytes({
            records: state.records,
            queue: state.queue,
            collection: state.collection,
            analysisFilters: state.analysisFilters,
            filterPresets: state.filterPresets,
            feedback: state.feedback,
        });
        state.storageHealth.estimateBytes = Number.isFinite(estimate) ? estimate : 0;
        state.storageHealth.dirty = false;
        if (estimate >= STORAGE_WARNING_BYTES && !state.storageHealth.warning) state.storageHealth.warning = 'STORAGE_NEAR_LIMIT';
        if (estimate < STORAGE_WARNING_BYTES && state.storageHealth.warning === 'STORAGE_NEAR_LIMIT') state.storageHealth.warning = '';
        return state.storageHealth;
    }

    const GMX = {
        async getOptional(key, fallback) {
            try { return await GM.getValue(key, fallback); } catch { void trackTelemetryError('storage_listing_state'); return fallback; }
        },
        async getStrict(key, fallback) {
            try { return await GM.getValue(key, fallback); }
            catch (cause) {
                rememberStorageFailure(key, cause, 'read');
                void trackTelemetryError('storage_listing_state');
                const error = new Error(`Unable to read ${key}.`);
                error.code = 'STORAGE_READ_FAILED';
                error.cause = cause;
                throw error;
            }
        },
        async get(key, fallback) { return this.getStrict(key, fallback); },
        async set(key, value) {
            try {
                await GM.setValue(key, value);
                markStorageEstimateDirty(key);
                if (state.storageHealth.failedKey === String(key)) state.storageHealth = { ...state.storageHealth, warning: '', failedKey: '', failedAt: '' };
                return true;
            } catch (error) {
                rememberStorageFailure(key, error);
                void trackTelemetryError('storage_listing_state');
                return false;
            }
        },
        async remove(key) {
            try { await GM.deleteValue(key); markStorageEstimateDirty(key); return true; } catch { void trackTelemetryError('storage_listing_state'); return false; }
        },
        register(label, callback) {
            try { return GM_registerMenuCommand(label, callback); } catch { return null; }
        },
        unregister(id) {
            try { if (id != null) GM_unregisterMenuCommand(id); } catch { /* ignored */ }
        },
        openTab(url) {
            try {
                if (typeof GM?.openInTab === 'function') return GM.openInTab(url, { active: true, insert: true, setParent: true });
            } catch { /* fall through to a safe, user-initiated link */ }
            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.click();
            return null;
        },
    };

    async function requireStored(key, value) {
        if (await GMX.set(key, value)) return value;
        const error = new Error(`Unable to persist ${key}.`);
        error.code = state.storageHealth.failedKey === String(key) ? state.storageHealth.warning || 'STORAGE_WRITE_FAILED' : 'STORAGE_WRITE_FAILED';
        throw error;
    }

    const orderedPreferenceWrites = new Map();
    const committedPreferenceValues = new Map();

    function preferenceSnapshot(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    function settingsFieldsSnapshot(settings, fields) {
        return Object.fromEntries(fields.map((field) => [field, settings?.[field]]));
    }

    function uiSettingsSnapshot(settings = state.settings) {
        const source = settings && typeof settings === 'object' ? settings : {};
        return {
            language: ['tr', 'en'].includes(source.language) ? source.language : DEFAULT_SETTINGS.language,
            collapsed: source.collapsed === true,
        };
    }

    function healthSettingsSnapshot(settings = state.settings) {
        const source = settings && typeof settings === 'object' ? settings : {};
        const normalized = { ...DEFAULT_SETTINGS, ...source, ...normalizeHealthThresholds(source) };
        normalized.retentionDays = clamp(normalized.retentionDays, 30, APP.retentionDays);
        normalized.maxSnapshots = clamp(normalized.maxSnapshots, 10, APP.maxSnapshots);
        return settingsFieldsSnapshot(normalized, HEALTH_SETTING_FIELDS);
    }

    function applySettingsFields(target, values, fields) {
        fields.forEach((field) => { if (Object.hasOwn(values || {}, field)) target[field] = values[field]; });
        return target;
    }

    function setCommittedPreference(key, value) {
        committedPreferenceValues.set(key, preferenceSnapshot(value));
    }

    function committedPreference(key, fallback) {
        return preferenceSnapshot(committedPreferenceValues.has(key) ? committedPreferenceValues.get(key) : fallback);
    }

    function queuePreferenceOperation(key, operation) {
        const previous = orderedPreferenceWrites.get(key) || Promise.resolve(true);
        const write = previous.catch(() => false).then(operation);
        const tracked = write.catch(() => false).finally(() => {
            if (orderedPreferenceWrites.get(key) === tracked) orderedPreferenceWrites.delete(key);
        });
        orderedPreferenceWrites.set(key, tracked);
        return write;
    }

    function queuePreferenceWrite(key, value, committedValue = value) {
        const snapshot = preferenceSnapshot(value);
        const committedSnapshot = preferenceSnapshot(committedValue);
        return queuePreferenceOperation(key, async () => {
            const saved = await GMX.set(key, snapshot);
            if (saved) setCommittedPreference(key, committedSnapshot);
            return saved;
        });
    }

    function beginPreferenceMutation(key) {
        state.preferenceRevisions[key] = (state.preferenceRevisions[key] || 0) + 1;
        return state.preferenceRevisions[key];
    }

    function preferenceMutationIsCurrent(key, revision) {
        return state.preferenceRevisions[key] === revision;
    }

    const QUEUE_TERMINAL_ITEM_STATUSES = Object.freeze(['verified', 'verified-deactivated', 'skipped']);
    const QUEUE_UPDATE_ITEM_STATUSES = Object.freeze(['applying', 'awaiting-user-review', 'submitted', 'submitted-unverified']);
    const QUEUE_DEACTIVATION_ITEM_STATUSES = Object.freeze([
        'awaiting-user-deactivation', 'deactivation-submitted', 'deactivation-submitted-unverified',
    ]);
    const QUEUE_OPEN_ITEM_STATUSES = Object.freeze([
        'pending', 'failed', ...QUEUE_UPDATE_ITEM_STATUSES, ...QUEUE_DEACTIVATION_ITEM_STATUSES,
    ]);

    function canonicalQueueEditUrl(listingId) {
        const normalizedId = String(listingId || '');
        return /^\d+$/.test(normalizedId)
            ? `https://www.etsy.com/your/shops/me/listing-editor/edit/${normalizedId}`
            : '';
    }

    function queueOptionalTimestampIsValid(value, notBefore = null) {
        if (value === undefined || value === null || value === '') return true;
        const timestamp = validTime(value);
        const lowerBound = validTime(notBefore);
        return timestamp !== null
            && timestamp <= Date.now() + SNAPSHOT_FUTURE_TOLERANCE_MS
            && (lowerBound === null || timestamp >= lowerBound);
    }

    function queueItemContractIsValid(item, queueCreatedAt = null) {
        if (!item || typeof item !== 'object') return false;
        const listingId = String(item.listingId || '');
        const status = String(item.status || '');
        const action = String(item.proposal?.action || '');
        if (!/^\d+$/.test(listingId)
            || ![...QUEUE_TERMINAL_ITEM_STATUSES, ...QUEUE_OPEN_ITEM_STATUSES].includes(status)
            || !['UPDATE', 'DEACTIVATE_REVIEW'].includes(action)) return false;
        if ((QUEUE_UPDATE_ITEM_STATUSES.includes(status) || status === 'verified') && action !== 'UPDATE') return false;
        if ((QUEUE_DEACTIVATION_ITEM_STATUSES.includes(status) || status === 'verified-deactivated') && action !== 'DEACTIVATE_REVIEW') return false;
        if (['submitted', 'submitted-unverified'].includes(status)
            && (!queueOptionalTimestampIsValid(item.submittedAt, queueCreatedAt)
                || !queueOptionalTimestampIsValid(item.publishSubmittedIntentAt, queueCreatedAt))) return false;
        if (['deactivation-submitted', 'deactivation-submitted-unverified'].includes(status)
            && (!queueOptionalTimestampIsValid(item.deactivationAuthorizedAt, queueCreatedAt)
                || !queueOptionalTimestampIsValid(item.deactivationSubmittedIntentAt, queueCreatedAt))) return false;
        return item.editUrl === canonicalQueueEditUrl(listingId);
    }

    function queueLifecycleIsValid(status, cursor, items) {
        const terminal = (item) => QUEUE_TERMINAL_ITEM_STATUSES.includes(String(item?.status || ''));
        const pending = (item) => String(item?.status || '') === 'pending';
        if (status === 'completed') return cursor === items.length && items.every(terminal);
        if (status === 'stopped' && items.length === 0) return cursor === 0;
        if (!['ready', 'running', 'stopped'].includes(status) || cursor >= items.length) return false;
        if (status === 'ready' && cursor !== 0) return false;
        return items.slice(0, cursor).every(terminal)
            && QUEUE_OPEN_ITEM_STATUSES.includes(String(items[cursor]?.status || ''))
            && items.slice(cursor + 1).every(pending);
    }

    function normalizeQueue(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const requestedSchema = raw.schema === undefined ? QUEUE_SCHEMA_VERSION : Number(raw.schema);
        if (!Number.isInteger(requestedSchema) || requestedSchema < 1) {
            return { ...raw, schema: requestedSchema, status: 'blocked', invalidSchema: true };
        }
        if (requestedSchema > QUEUE_SCHEMA_VERSION) {
            return { ...raw, schema: requestedSchema, status: 'blocked', unsupportedSchema: true };
        }
        const allowedStatuses = ['ready', 'running', 'stopped', 'completed'];
        const items = Array.isArray(raw.items) ? raw.items.map((item) => {
            if (!item || typeof item !== 'object') return null;
            const listingId = String(item.listingId || '');
            return { ...item, listingId, editUrl: canonicalQueueEditUrl(listingId) };
        }) : null;
        const cursor = Number(raw.cursor);
        const status = String(raw.status || '');
        const listingIds = items?.map((item) => item?.listingId) || [];
        const valid = items && queueOptionalTimestampIsValid(raw.createdAt)
            && items.every((item) => queueItemContractIsValid(item, raw.createdAt))
            && new Set(listingIds).size === listingIds.length
            && Number.isInteger(cursor) && cursor >= 0 && cursor <= items.length
            && allowedStatuses.includes(status) && queueLifecycleIsValid(status, cursor, items);
        if (!valid) return { ...raw, schema: QUEUE_SCHEMA_VERSION, status: 'blocked', invalidSchema: true };
        return {
            ...raw,
            schema: QUEUE_SCHEMA_VERSION,
            id: String(raw.id || 'legacy-queue'),
            status,
            cursor,
            items,
        };
    }

    function queueSchemaError(queue) {
        const error = new Error('The stored action queue uses a newer or invalid schema.');
        error.code = queue?.unsupportedSchema ? 'QUEUE_NEWER_SCHEMA' : 'QUEUE_INVALID_SCHEMA';
        return error;
    }

    async function assertProposalWritesAllowedLocked(listingIds) {
        const queue = normalizeQueue(await GMX.get(KEYS.queue, null));
        if (queue?.unsupportedSchema || queue?.invalidSchema) throw queueSchemaError(queue);
        if (!storedQueueHasActiveItem(queue)) return;
        const requested = new Set((Array.isArray(listingIds) ? listingIds : [listingIds]).map(String));
        if (!(queue.items || []).some((item) => requested.has(String(item?.listingId || '')))) return;
        const error = new Error('A queued listing proposal is frozen until the action queue completes or stops.');
        error.code = 'PROPOSAL_QUEUE_LOCKED';
        throw error;
    }

    async function assertHealthSettingsWritableLocked() {
        const queue = normalizeQueue(await GMX.get(KEYS.queue, null));
        if (queue?.unsupportedSchema || queue?.invalidSchema) throw queueSchemaError(queue);
        if (!storedQueueHasActiveItem(queue)) return;
        const error = new Error('Analysis thresholds are frozen while an action queue is active.');
        error.code = 'HEALTH_SETTINGS_QUEUE_LOCKED';
        throw error;
    }

    async function storedHealthSettingsLocked() {
        const stored = await GMX.get(KEYS.settings, {});
        return { ...DEFAULT_SETTINGS, ...healthSettingsSnapshot(stored) };
    }

    async function storedHealthPolicyLocked() {
        return healthPolicy(await storedHealthSettingsLocked());
    }

    const Store = {
        async loadSettings() {
            const stored = await GMX.get(KEYS.settings, {});
            const storedSource = stored && typeof stored === 'object' ? stored : {};
            const uiStored = await GMX.getOptional(KEYS.uiPreferences, null);
            const uiSource = uiStored && typeof uiStored === 'object' ? { ...storedSource, ...uiStored } : storedSource;
            const health = healthSettingsSnapshot(storedSource);
            const ui = uiSettingsSnapshot(uiSource);
            state.settings = { ...DEFAULT_SETTINGS, ...health, ...ui };
            setCommittedPreference(KEYS.settings, health);
            setCommittedPreference(KEYS.uiPreferences, ui);
            return state.settings;
        },
        async saveUiPreferences(fields = UI_SETTING_FIELDS) {
            const requestedFields = UI_SETTING_FIELDS.filter((field) => fields.includes(field));
            const local = uiSettingsSnapshot(state.settings);
            const patch = settingsFieldsSnapshot(local, requestedFields);
            return queuePreferenceOperation(KEYS.uiPreferences, () => withNamedLock(STORAGE_MUTATION_LOCK, async () => {
                const stored = await GMX.get(KEYS.uiPreferences, null);
                const durableFallback = committedPreference(KEYS.uiPreferences, uiSettingsSnapshot(DEFAULT_SETTINGS));
                const current = uiSettingsSnapshot(stored && typeof stored === 'object' ? stored : durableFallback);
                const candidate = uiSettingsSnapshot({ ...current, ...patch });
                const saved = await GMX.set(KEYS.uiPreferences, candidate);
                if (saved) setCommittedPreference(KEYS.uiPreferences, candidate);
                return saved;
            }));
        },
        async saveHealthSettings() {
            const snapshot = healthSettingsSnapshot(state.settings);
            state.settingsSaveError = '';
            return queuePreferenceOperation(KEYS.settings, () => withNamedLock(STORAGE_MUTATION_LOCK, async () => {
                try { await assertHealthSettingsWritableLocked(); }
                catch (error) { state.settingsSaveError = String(error?.code || ''); throw error; }
                const stored = await GMX.get(KEYS.settings, {});
                const candidate = { ...(stored && typeof stored === 'object' ? stored : {}), ...snapshot };
                const saved = await GMX.set(KEYS.settings, candidate);
                if (saved) setCommittedPreference(KEYS.settings, snapshot);
                return saved;
            }));
        },
        async loadAnalysisFilters() {
            state.analysisFilters = normalizeAnalysisFilters(await GMX.get(KEYS.analysisFilters, DEFAULT_ANALYSIS_FILTERS));
            setCommittedPreference(KEYS.analysisFilters, { filters: state.analysisFilters, query: state.analysisQuery, limit: state.analysisLimit });
            return state.analysisFilters;
        },
        async saveAnalysisFilters() {
            const normalized = normalizeAnalysisFilters(state.analysisFilters);
            return queuePreferenceWrite(KEYS.analysisFilters, normalized, { filters: normalized, query: state.analysisQuery, limit: state.analysisLimit });
        },
        async loadFilterPresets() {
            state.filterPresets = normalizeFilterPresets(await GMX.get(KEYS.filterPresets, { schema: 1, items: [] }));
            setCommittedPreference(KEYS.filterPresets, state.filterPresets);
            return state.filterPresets;
        },
        async upsertFilterPreset(candidate) {
            const normalizedCandidate = normalizeFilterPresets([candidate])[0];
            if (!normalizedCandidate) return false;
            return withNamedLock(STORAGE_MUTATION_LOCK, async () => {
                const durable = normalizeFilterPresets(await GMX.get(KEYS.filterPresets, { schema: 1, items: [] }));
                const idIndex = durable.findIndex((item) => item.id === normalizedCandidate.id);
                const nameIndex = durable.findIndex((item) => presetNameFold(item.name) === presetNameFold(normalizedCandidate.name));
                if (idIndex >= 0 && nameIndex >= 0 && idIndex !== nameIndex) return false;
                const index = idIndex >= 0 ? idIndex : nameIndex;
                if (index < 0 && durable.length >= MAX_FILTER_PRESETS) return false;
                const next = [...durable];
                if (index >= 0) {
                    const previous = next[index];
                    next.splice(index, 1, { ...normalizedCandidate, id: previous.id, createdAt: previous.createdAt });
                } else next.push(normalizedCandidate);
                const normalized = normalizeFilterPresets(next);
                await requireStored(KEYS.filterPresets, { schema: 1, items: normalized });
                state.filterPresets = normalized;
                setCommittedPreference(KEYS.filterPresets, normalized);
                return true;
            });
        },
        async deleteFilterPreset(presetId) {
            const id = String(presetId || '');
            if (!id) return false;
            return withNamedLock(STORAGE_MUTATION_LOCK, async () => {
                const durable = normalizeFilterPresets(await GMX.get(KEYS.filterPresets, { schema: 1, items: [] }));
                if (!durable.some((item) => item.id === id)) return false;
                const normalized = normalizeFilterPresets(durable.filter((item) => item.id !== id));
                await requireStored(KEYS.filterPresets, { schema: 1, items: normalized });
                state.filterPresets = normalized;
                setCommittedPreference(KEYS.filterPresets, normalized);
                return true;
            });
        },
        async loadFeedback() {
            const stored = await GMX.get(KEYS.feedback, []);
            state.feedback = (Array.isArray(stored) ? stored : []).map((item) => {
                if (!item || typeof item !== 'object') return null;
                const note = normalizeSpace(item.note).slice(0, 800);
                if (note.length < 10) return null;
                return {
                    id: String(item.id || randomId('feedback')),
                    at: validTime(item.at) ? String(item.at) : nowIso(),
                    category: ['bug', 'idea', 'usability', 'analysis'].includes(item.category) ? item.category : 'idea',
                    rating: clamp(item.rating, 1, 5), note,
                    diagnostics: item.diagnostics && typeof item.diagnostics === 'object' ? item.diagnostics : null,
                };
            }).filter(Boolean).slice(-MAX_FEEDBACK_ENTRIES);
            return state.feedback;
        },
        async appendFeedback(entry) {
            return withNamedLock(STORAGE_MUTATION_LOCK, async () => {
                const durable = await GMX.get(KEYS.feedback, []);
                const current = (Array.isArray(durable) ? durable : []).filter((item) => item && typeof item === 'object');
                const next = [...current.filter((item) => String(item.id || '') !== String(entry.id)), entry].slice(-MAX_FEEDBACK_ENTRIES);
                await requireStored(KEYS.feedback, next);
                state.feedback = next;
                return true;
            });
        },
        async loadUpdateState() {
            state.updateState = normalizeUpdateState(await GMX.getOptional(KEYS.updateCheck, {}));
            return state.updateState;
        },
        async saveUpdateState() {
            const candidate = normalizeUpdateState(state.updateState);
            state.updateState = candidate;
            return GMX.set(KEYS.updateCheck, candidate);
        },
        async getIndex() {
            const index = await GMX.get(KEYS.index, []);
            return Array.isArray(index) ? uniqueStrings(index.map(String)) : [];
        },
        async getRecord(listingId) {
            const expectedListingId = String(listingId || '');
            const record = await GMX.get(KEYS.record(expectedListingId), null);
            if (!record || typeof record !== 'object') return null;
            const storedListingId = Object.hasOwn(record, 'listingId')
                ? String(record.listingId ?? '')
                : expectedListingId;
            if (!expectedListingId || storedListingId !== expectedListingId) {
                const error = new Error(`Listing record identity mismatch for ${expectedListingId || '(empty)'}.`);
                error.code = 'RECORD_ID_MISMATCH';
                throw error;
            }
            const normalized = normalizeRecord(record, expectedListingId);
            if (!normalized || String(normalized.listingId || '') !== expectedListingId) {
                const error = new Error(`Listing record identity mismatch for ${expectedListingId}.`);
                error.code = 'RECORD_ID_MISMATCH';
                throw error;
            }
            return normalized;
        },
        async putRecordLocked(record, batchIndex = null, options = {}) {
            if (!record || typeof record !== 'object') throw new Error('Invalid listing record.');
            if (Number(record.schema || RECORD_SCHEMA_VERSION) > RECORD_SCHEMA_VERSION || record.unsupportedSchema) {
                throw new Error('This listing record was created by a newer data schema and was not overwritten.');
            }
            const listingId = String(record.listingId || '');
            if (!listingId) {
                const error = new Error('A listing record requires an identity.'); error.code = 'RECORD_ID_MISMATCH'; throw error;
            }
            const currentRaw = await GMX.get(KEYS.record(listingId), null);
            const currentStoredListingId = currentRaw && typeof currentRaw === 'object'
                ? (Object.hasOwn(currentRaw, 'listingId') ? String(currentRaw.listingId ?? '') : listingId)
                : listingId;
            if (currentRaw && typeof currentRaw === 'object' && currentStoredListingId !== listingId) {
                const error = new Error(`Listing record identity mismatch for ${listingId}.`); error.code = 'RECORD_ID_MISMATCH'; throw error;
            }
            const current = currentRaw && typeof currentRaw === 'object' ? normalizeRecord(currentRaw, listingId) : null;
            const merged = mergeRecordCopies(current, normalizeRecord(record, listingId), options.settings || state.settings);
            merged.lastWriteId = randomId('record-write');
            const index = batchIndex?.items || await this.getIndex();
            await requireStored(KEYS.record(listingId), merged);
            const verified = await GMX.get(KEYS.record(listingId), null);
            if (verified?.lastWriteId !== merged.lastWriteId) {
                const error = new Error('Listing record write verification failed.'); error.code = 'STORAGE_WRITE_FAILED'; throw error;
            }
            if (!index.includes(listingId)) {
                index.push(listingId);
                if (batchIndex) batchIndex.dirty = true;
                else await requireStored(KEYS.index, index);
            }
            return merged;
        },
        async putRecord(record) {
            return withNamedLock(STORAGE_MUTATION_LOCK, () => this.putRecordLocked(record));
        },
        async listRecords() {
            const index = await this.getIndex();
            const records = await Promise.all(index.map((id) => this.getRecord(id)));
            return records.filter(Boolean);
        },
        prepareSnapshot(listing, existingRecord = null) {
            const listingId = String(listing?.listingId || '');
            if (!listingId || (existingRecord && String(existingRecord.listingId || '') !== listingId)) {
                const error = new Error(`Listing record identity mismatch for ${listingId || '(empty)'}.`);
                error.code = 'RECORD_ID_MISMATCH';
                throw error;
            }
            const capturedAt = listing.capturedAt || nowIso();
            const existing = existingRecord || {
                schema: APP.schema,
                listingId,
                meta: {}, history: [], improvements: [], proposal: null,
            };
            if (existing.unsupportedSchema || Number(existing.schema || RECORD_SCHEMA_VERSION) > RECORD_SCHEMA_VERSION) {
                throw new Error('A newer listing record schema cannot be modified by this version.');
            }
            existing.meta = {
                ...existing.meta,
                title: listing.title || existing.meta?.title || '', sku: listing.sku || existing.meta?.sku || '', editUrl: listing.editUrl || existing.meta?.editUrl || '',
                publicUrl: listing.publicUrl || existing.meta.publicUrl || '', imageUrl: listing.imageUrl || existing.meta.imageUrl || '',
                listingState: normalizeListingState(listing.listingState) || existing.meta?.listingState || '',
                statusLabel: listing.statusLabel || existing.meta?.statusLabel || '', renewalLabel: listing.renewalLabel || existing.meta?.renewalLabel || '', lastSeenAt: capturedAt,
                shopKey: listing.shopKey || existing.meta?.shopKey || shopKeyFromUrl(listing.editUrl),
            };
            const snapshot = snapshotFromListing(listing, capturedAt);
            const history = Array.isArray(existing.history) ? existing.history : [];
            const sameDayIndex = history.findIndex((item) => item.day === snapshot.day);
            if (sameDayIndex >= 0) history[sameDayIndex] = mergeDailySnapshot(history[sameDayIndex], snapshot);
            else history.push(snapshot);
            const cutoff = Date.now() - clamp(state.settings.retentionDays, 30, APP.retentionDays) * 86400000;
            existing.history = history
                .filter((item) => Number.isFinite(Date.parse(item.at)) && Date.parse(item.at) >= cutoff)
                .sort((a, b) => String(a.at).localeCompare(String(b.at)))
                .slice(-clamp(state.settings.maxSnapshots, 10, APP.maxSnapshots));
            existing.improvements = (Array.isArray(existing.improvements) ? existing.improvements : []).slice(-APP.maxImprovements);
            updateExperimentEvaluations(existing, capturedAt);
            const evaluated = evaluateHealthRecords([existing], state.settings, capturedAt).get(existing.listingId);
            if (evaluated) { existing.health = evaluated; existing.analysis = evaluated.result; }
            return existing;
        },
        async saveSnapshot(listing) {
            const candidate = this.prepareSnapshot(listing, await this.getRecord(listing.listingId));
            return withNamedLock(STORAGE_MUTATION_LOCK, () => this.putRecordLocked(candidate));
        },
        async saveSnapshots(listings, guard = null) {
            const source = Array.isArray(listings) ? listings : [];
            const batchIndex = { items: await this.getIndex(), dirty: false };
            const saved = [];
            for (const listing of source) {
                if (guard) await guard(listing, saved.length);
                const candidate = this.prepareSnapshot(listing, await this.getRecord(listing.listingId));
                saved.push(await withNamedLock(STORAGE_MUTATION_LOCK, () => this.putRecordLocked(candidate, batchIndex)));
            }
            if (batchIndex.dirty) {
                await withNamedLock(STORAGE_MUTATION_LOCK, async () => {
                    const current = await this.getIndex();
                    await requireStored(KEYS.index, uniqueStrings([...current, ...batchIndex.items]));
                });
            }
            return saved;
        },
        async saveProposalLocked(listingId, proposal) {
            await assertProposalWritesAllowedLocked(listingId);
            const record = await this.getRecord(listingId);
            if (!record) throw new Error(`Unknown listing ${listingId}`);
            const before = captureEditableFieldsFromRecord(record);
            const fields = proposal.action === 'UPDATE' ? proposalFields(proposal, true) : [];
            if (proposal.action === 'UPDATE' && !fields.length) throw new Error('An UPDATE proposal must select at least one Etsy field.');
            const overlap = proposal.action === 'UPDATE' ? proposalExperimentOverlap(record) : null;
            record.improvements = Array.isArray(record.improvements) ? record.improvements : [];
            const savedAt = nowIso();
            const basis = recommendationBasis(record);
            let improvementId = null;
            let baselineFingerprint = null;
            const baselineCapturedAt = record.editor?.capturedAt || null;
            record.improvements.forEach((entry) => {
                if (entry?.status === 'planned') { entry.status = 'superseded'; entry.supersededAt = savedAt; }
            });
            if (proposal.action === 'UPDATE') {
                improvementId = `improvement-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                baselineFingerprint = await contentFingerprint(before);
                record.improvements.push({
                    id: improvementId,
                    at: savedAt, status: 'planned', action: proposal.action, note: proposal.reason || '',
                    source: String(proposal.source || 'manual'), requestId: String(proposal.requestId || ''), reference: String(proposal.reference || ''),
                    fields, before, proposed: Object.fromEntries(fields.map((field) => [field, proposal[field]])),
                    baselineSnapshot: record.history?.at(-1) || null, baselineFingerprint, baselineCapturedAt, basis,
                    experimentOverlap: overlap,
                    experiment: { state: 'planned', durationDays: HEALTH_RULES.experimentDays, primaryMetric: primaryMetricForFields(fields) },
                });
            }
            record.proposal = {
                ...proposal, fields, improvementId, baselineFingerprint, baselineCapturedAt, basis,
                experimentOverlap: overlap,
                experimentOverlapAcceptedAt: overlap && proposal.acknowledgeExperimentOverlap ? savedAt : null,
                updatedAt: savedAt,
            };
            record.improvements = record.improvements.slice(-APP.maxImprovements);
            return this.putRecordLocked(record);
        },
        async saveProposal(listingId, proposal) {
            return withNamedLock(STORAGE_MUTATION_LOCK, () => this.saveProposalLocked(listingId, proposal));
        },
        async saveListingContext(listingId, context) {
            return withNamedLock(STORAGE_MUTATION_LOCK, async () => {
                const record = await this.getRecord(listingId);
                if (!record || record.unsupportedSchema) throw new Error(`Unknown listing ${listingId}`);
                const from = { seasonality: normalizeSeasonality(record.meta?.seasonality, record.meta?.seasonal), listingType: normalizeListingType(record.meta?.listingType) };
                const to = { seasonality: normalizeSeasonality(context?.seasonality), listingType: normalizeListingType(context?.listingType) };
                const changedAt = nowIso();
                record.meta = { ...record.meta, ...to, contextUpdatedAt: changedAt, contextSource: 'user' };
                delete record.meta.seasonal;
                const saved = await this.putRecordLocked(record);
                await this.appendAuditLocked({ type: 'listing-context-set', listingId: String(listingId), from, to });
                return saved;
            });
        },
        async loadQueue() {
            const queue = await GMX.get(KEYS.queue, null);
            state.queue = normalizeQueue(queue);
            return state.queue;
        },
        async saveQueueLocked(queue) {
            const normalized = normalizeQueue(queue);
            const stored = normalizeQueue(await GMX.get(KEYS.queue, null));
            if (!normalized || normalized.unsupportedSchema || normalized.invalidSchema
                || stored?.unsupportedSchema || stored?.invalidSchema) {
                const error = new Error('A newer or invalid action queue cannot be overwritten by this version.');
                error.code = stored?.unsupportedSchema || normalized?.unsupportedSchema ? 'QUEUE_NEWER_SCHEMA' : 'QUEUE_INVALID_SCHEMA';
                throw error;
            }
            const candidate = { ...normalized, lastWriteId: randomId('queue-write') };
            await requireStored(KEYS.queue, candidate);
            const verified = await GMX.get(KEYS.queue, null);
            if (verified?.lastWriteId !== candidate.lastWriteId) {
                const error = new Error('Queue write verification failed.'); error.code = 'STORAGE_WRITE_FAILED'; throw error;
            }
            state.queue = candidate;
            return state.queue;
        },
        async saveQueue(queue) {
            return withNamedLock(STORAGE_MUTATION_LOCK, () => this.saveQueueLocked(queue));
        },
        async loadCollection() {
            state.collection = normalizeCollection(await GMX.get(KEYS.collection, null));
            return state.collection;
        },
        async saveCollectionLocked(collection, expected = {}) {
                const normalized = normalizeCollection(collection);
                const stored = normalizeCollection(await GMX.get(KEYS.collection, null));
                if (normalized?.unsupportedSchema || stored?.unsupportedSchema) {
                    const error = new Error('A newer collection schema cannot be overwritten by this version.');
                    error.code = 'COLLECTION_NEWER_SCHEMA';
                    throw error;
                }
                if (Object.hasOwn(expected, 'id') && (!stored || stored.id !== expected.id)) {
                    const error = new Error('Collection ownership changed.'); error.code = 'COLLECTION_LEASE_LOST'; throw error;
                }
                if (Object.hasOwn(expected, 'token') && stored?.leaseToken !== expected.token) {
                    const error = new Error('Collection fencing token changed.'); error.code = 'COLLECTION_LEASE_LOST'; throw error;
                }
                const sameCollection = Boolean(stored && stored.id === normalized?.id);
                if (sameCollection) {
                    const expectedRevision = Number(expected.writeRevision);
                    const expectedFingerprint = String(expected.manifestFingerprint || '');
                    if (!Object.hasOwn(expected, 'writeRevision') || !Number.isSafeInteger(expectedRevision)
                        || stored.writeRevision !== expectedRevision
                        || !Object.hasOwn(expected, 'manifestFingerprint')
                        || collectionManifestFingerprint(stored) !== expectedFingerprint) {
                        const error = new Error('Collection changed before the write completed.'); error.code = 'COLLECTION_LEASE_LOST'; throw error;
                    }
                }
                if (Object.hasOwn(expected, 'leaseToken')) {
                    const lease = await GMX.get(KEYS.collectionLease, null);
                    const validLease = lease?.owner === tabId && lease?.instanceId === pageInstanceId
                        && lease?.token === expected.leaseToken && Number(lease.expiresAt) > Date.now();
                    if (!validLease) { const error = new Error('Collection lease changed.'); error.code = 'COLLECTION_LEASE_LOST'; throw error; }
                }
                normalized.writeRevision = sameCollection ? stored.writeRevision + 1 : 1;
                if (!Number.isSafeInteger(normalized.writeRevision)) {
                    const error = new Error('Collection revision is exhausted.'); error.code = 'COLLECTION_LEASE_LOST'; throw error;
                }
                await requireStored(KEYS.collection, normalized);
                const verified = normalizeCollection(await GMX.get(KEYS.collection, null));
                if (!verified || verified.id !== normalized.id || verified.writeRevision !== normalized.writeRevision
                    || verified.leaseToken !== normalized.leaseToken
                    || collectionManifestFingerprint(verified) !== collectionManifestFingerprint(normalized)) {
                    const error = new Error('Collection write verification failed.'); error.code = 'STORAGE_WRITE_FAILED'; throw error;
                }
                state.collection = verified;
                return state.collection;
        },
        async saveCollection(collection, expected = {}) {
            return withNamedLock(STORAGE_MUTATION_LOCK, () => this.saveCollectionLocked(collection, expected));
        },
        async appendAuditLocked(entry) {
            const audit = await GMX.get(KEYS.audit, []);
            const items = Array.isArray(audit) ? audit : [];
            const auditEntry = { at: nowIso(), ...entry, writeId: randomId('audit-write') };
            items.push(auditEntry);
            await requireStored(KEYS.audit, items.slice(-APP.maxAuditEntries));
            const verified = await GMX.get(KEYS.audit, []);
            if (!Array.isArray(verified) || !verified.some((item) => item?.writeId === auditEntry.writeId)) {
                const error = new Error('Audit write verification failed.'); error.code = 'STORAGE_WRITE_FAILED'; throw error;
            }
            return auditEntry;
        },
        async appendAudit(entry) {
            return withNamedLock(STORAGE_MUTATION_LOCK, () => this.appendAuditLocked(entry));
        },
        async clearAnalysisData() {
            return withNamedLock(STORAGE_MUTATION_LOCK, async () => {
                const lease = await GMX.get(KEYS.lease, null);
                if ((lease?.token || lease?.owner) && Number(lease.expiresAt) > Date.now()) return false;
                const collectionLease = await GMX.get(KEYS.collectionLease, null);
                if (collectionLease?.token && Number(collectionLease.expiresAt) > Date.now()) return false;
                const storedCollection = normalizeCollection(await GMX.get(KEYS.collection, null));
                if (['starting', 'running'].includes(storedCollection?.status)) return false;
                const index = await this.getIndex();
                if (!await GMX.remove(KEYS.collection)) return false;
                state.collection = null; state.selectedIds.clear(); clearCollectionHandoff();
                for (const listingId of index) if (!await GMX.remove(KEYS.record(listingId))) return false;
                for (const key of [KEYS.index, KEYS.audit, KEYS.queue, KEYS.collectionLease, KEYS.aiRequests, KEYS.researchRequests]) if (!await GMX.remove(key)) return false;
                state.records = []; state.pageListings = []; state.queue = null;
                return true;
            });
        },
    };

    function compareSemver(left, right) {
        const parse = (value) => /^\d+\.\d+\.\d+$/.test(String(value || '')) ? String(value).split('.').map(Number) : null;
        const a = parse(left); const b = parse(right);
        if (!a || !b) return null;
        for (let index = 0; index < 3; index += 1) {
            if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
        }
        return 0;
    }

    function pinnedUpdateUrl(commitSha) {
        return /^[a-f0-9]{40}$/.test(String(commitSha || ''))
            ? `${GITHUB_RAW_REPOSITORY_URL}/${commitSha}/${GITHUB_SCRIPT_PATH}`
            : '';
    }

    function exactHttpsTarget(actualValue, expectedValue) {
        try {
            const actual = new URL(actualValue);
            const expected = new URL(expectedValue);
            return actual.protocol === 'https:'
                && actual.protocol === expected.protocol
                && actual.hostname === expected.hostname
                && actual.port === expected.port
                && actual.pathname === expected.pathname
                && actual.search === expected.search
                && actual.hash === expected.hash
                && !actual.username && !actual.password;
        } catch {
            return false;
        }
    }

    function metadataValues(source, key) {
        const escapedKey = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return Array.from(
            String(source || '').matchAll(new RegExp(`^// @${escapedKey}\\s+(.+?)\\s*$`, 'gm')),
            (match) => match[1].trim(),
        );
    }

    function distributionUrlKind(value) {
        const candidate = String(value || '').trim();
        if (candidate === GITHUB_CANONICAL_SCRIPT_URL) return 'github';
        try {
            const url = new URL(candidate);
            const authority = candidate.match(/^https:\/\/([^/?#]+)/i)?.[1] || '';
            const explicitPort = /:\d+$/.test(authority);
            const safeAuthority = url.protocol === 'https:' && !url.username && !url.password && !url.port && !explicitPort;
            const host = url.hostname.toLowerCase();
            if (safeAuthority && (host === 'greasyfork.org' || host.endsWith('.greasyfork.org'))) return 'greasyfork';
        } catch { /* malformed or non-HTTPS distribution URLs are external */ }
        return 'external';
    }

    function installedDistributionSource() {
        let info = null;
        try { if (typeof GM_info !== 'undefined') info = GM_info; } catch { /* optional userscript metadata */ }
        const candidates = [info?.script?.updateURL, info?.script?.downloadURL, info?.scriptUpdateURL, info?.scriptDownloadURL]
            .map((value) => String(value || '').trim()).filter(Boolean);
        if (!candidates.length) return 'github';
        const kinds = candidates.map(distributionUrlKind);
        if (kinds.every((kind) => kind === 'github')) return 'github';
        if (kinds.every((kind) => kind === 'greasyfork')) return 'greasyfork';
        return 'external';
    }

    function requestExactText(url, accept = 'text/plain') {
        return new Promise((resolve, reject) => {
            if (typeof GM === 'undefined' || typeof GM.xmlHttpRequest !== 'function') { reject(new Error('Tampermonkey request API is unavailable.')); return; }
            let settled = false;
            const finish = (handler, value) => { if (settled) return; settled = true; handler(value); };
            try {
                GM.xmlHttpRequest({
                    method: 'GET', url, timeout: UPDATE_CHECK_TIMEOUT_MS,
                    anonymous: true, headers: { Accept: accept },
                    onload: (response) => {
                        try {
                            if (!response.finalUrl) throw new Error('The update response did not expose its final address.');
                            if (!exactHttpsTarget(response.finalUrl, url)) throw new Error('GitHub response left the canonical update address.');
                            if (Number(response.status) !== 200) throw new Error(`GitHub HTTP ${Number(response.status) || 0}`);
                            const text = String(response.responseText || '');
                            if (!text || text.length > 2_000_000) throw new Error('The update response is empty or too large.');
                            finish(resolve, text);
                        } catch (error) { finish(reject, error); }
                    },
                    onerror: () => finish(reject, new Error('GitHub update request failed.')),
                    ontimeout: () => finish(reject, new Error('GitHub update request timed out.')),
                });
            } catch (error) { finish(reject, error); }
        });
    }

    async function requestCanonicalScript() {
        const refText = await requestExactText(GITHUB_API_REF_URL, 'application/vnd.github+json');
        let ref;
        try { ref = JSON.parse(refText); }
        catch { throw new Error('The GitHub commit response is invalid.'); }
        const commitSha = /^[a-f0-9]{40}$/.test(String(ref?.sha || '')) ? String(ref.sha) : '';
        if (!commitSha) throw new Error('The GitHub commit identity is invalid.');
        const installUrl = pinnedUpdateUrl(commitSha);
        const source = await requestExactText(installUrl, 'text/plain');
        if (!/^\/\/ ==UserScript==[\r\n]/.test(source)) throw new Error('The update metadata block is missing.');
        const namespaces = metadataValues(source, 'namespace');
        const names = metadataValues(source, 'name');
        const updateUrls = metadataValues(source, 'updateURL');
        const downloadUrls = metadataValues(source, 'downloadURL');
        const versions = metadataValues(source, 'version');
        if (namespaces.length !== 1 || namespaces[0] !== 'https://github.com/Makaytron/EtsyScript') {
            throw new Error('The update namespace is not trusted.');
        }
        if (names.length !== 1 || names[0] !== 'Makaytron Etsy Listing Analyzer') {
            throw new Error('The update product name is not trusted.');
        }
        if (updateUrls.length !== 1 || downloadUrls.length !== 1
            || updateUrls[0] !== GITHUB_CANONICAL_SCRIPT_URL || downloadUrls[0] !== GITHUB_CANONICAL_SCRIPT_URL) {
            throw new Error('The update distribution address is not trusted.');
        }
        const version = versions.length === 1 && /^\d+\.\d+\.\d+$/.test(versions[0]) ? versions[0] : '';
        if (!version || compareSemver(version, APP_VERSION) === null) throw new Error('The update version is invalid.');
        return { version, commitSha, installUrl };
    }

    async function checkForUpdates(options = {}) {
        const manual = Boolean(options.manual);
        const force = Boolean(options.force);
        const age = Date.now() - Number(state.updateState.checkedAt || 0);
        if (!force && state.updateState.status !== 'idle' && state.updateState.checkedAt && age >= 0 && age < UPDATE_CHECK_INTERVAL_MS) return state.updateState;
        if (state.updateState.status === 'checking') return state.updateState;
        const distributionSource = installedDistributionSource();
        if (distributionSource !== 'github') {
            state.updateState = { status: 'managed', latestVersion: '', checkedVersion: APP_VERSION, checkedAt: Date.now(), error: '', commitSha: '', installUrl: '', source: distributionSource };
            await Store.saveUpdateState();
            if (manual) { UI.setStatus('updateManagedExternally', 'ready'); UI.render(true); }
            return state.updateState;
        }
        state.updateState = { ...state.updateState, status: 'checking', error: '' };
        if (manual) { UI.setStatus('updateChecking', 'scanning'); UI.render(true); }
        try {
            const remote = await requestCanonicalScript();
            const comparison = compareSemver(remote.version, APP_VERSION);
            if (comparison === null) throw new Error('The update version could not be compared.');
            state.updateState = { status: comparison > 0 ? 'available' : 'current', latestVersion: remote.version, checkedVersion: APP_VERSION, checkedAt: Date.now(), error: '', commitSha: remote.commitSha, installUrl: remote.installUrl, source: 'github' };
            await Store.saveUpdateState();
            UI.setStatus(comparison > 0 ? 'updateAvailable' : 'updateCurrent', comparison > 0 ? 'blocked' : 'ready', { version: remote.version });
            UI.render(true);
            return state.updateState;
        } catch (error) {
            const message = normalizeSpace(error?.message || error || 'Unknown error').slice(0, 240);
            state.updateState = { status: 'error', latestVersion: '', checkedVersion: APP_VERSION, checkedAt: Date.now(), error: message, commitSha: '', installUrl: '' };
            await Store.saveUpdateState();
            if (manual) { UI.setStatus('updateFailed', 'error', { message }); UI.render(true); }
            return state.updateState;
        }
    }

    function openTampermonkeyUpdate() {
        const queueActive = Boolean(Queue?.activeItem?.());
        if (state.collection?.status === 'running' || queueActive) { UI.setStatus('updateBlocked', 'blocked'); UI.render(true); return false; }
        if (installedDistributionSource() !== 'github') { UI.setStatus('updateManagedExternally', 'ready'); UI.render(true); return false; }
        const installUrl = pinnedUpdateUrl(state.updateState.commitSha);
        if (!installUrl || state.updateState.installUrl !== installUrl) { UI.setStatus('updateFailed', 'error', { message: 'Verified update identity is unavailable.' }); UI.render(true); return false; }
        const link = document.createElement('a');
        link.href = installUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.click();
        return true;
    }

    function bindInstallUpdate(button) {
        if (!button || typeof button.addEventListener !== 'function') return false;
        button.addEventListener('click', () => { openTampermonkeyUpdate(); });
        return true;
    }

    function captureEditableFieldsFromRecord(record) {
        return {
            title: record?.editor?.title || record?.meta?.title || '',
            description: record?.editor?.description || '',
            tags: Array.isArray(record?.editor?.tags) ? record.editor.tags : [],
            materials: Array.isArray(record?.editor?.materials) ? record.editor.materials : [],
        };
    }

    function proposalFields(proposal, strict = false) {
        const raw = proposal?.fields;
        if (raw === undefined || raw === null) {
            if (strict) throw new Error('fields must explicitly list the Etsy fields to change');
            return EDITABLE_FIELDS.filter((field) => {
                if (field === 'title' || field === 'description') return typeof proposal?.[field] === 'string' && proposal[field].trim().length > 0;
                return Array.isArray(proposal?.[field]) && proposal[field].length > 0;
            });
        }
        if (!Array.isArray(raw)) throw new Error('fields must be an array');
        const normalized = raw.map((field) => String(field).trim());
        if (normalized.some((field) => !EDITABLE_FIELDS.includes(field))) throw new Error('fields contains an unsupported Etsy field');
        if (new Set(normalized).size !== normalized.length) throw new Error('fields contains a duplicate Etsy field');
        return normalized;
    }

    function validateEditableProposal(proposal) {
        if (proposal?.action !== 'UPDATE') throw new Error('Only UPDATE proposals can be applied to the Etsy form.');
        const fields = proposalFields(proposal, true);
        if (!fields.length) throw new Error('The proposal does not explicitly select an Etsy field to change.');
        const values = { fields };
        if (fields.includes('title')) {
            values.title = normalizeSpace(proposal.title);
            if (!values.title || values.title.length > 140) throw new Error('The selected title must contain 1-140 characters.');
        }
        if (fields.includes('description')) {
            if (typeof proposal.description !== 'string') throw new Error('The selected description must be a string.');
            values.description = proposal.description;
        }
        for (const field of ['tags', 'materials']) {
            if (!fields.includes(field)) continue;
            if (!Array.isArray(proposal[field]) || proposal[field].some((value) => typeof value !== 'string')) {
                throw new Error(`The selected ${field} field must be an array of strings.`);
            }
            values[field] = proposal[field].map(normalizeSpace);
            const folded = values[field].map((value) => value.toLocaleLowerCase());
            if (values[field].some((value) => !value) || new Set(folded).size !== folded.length) {
                throw new Error(`The selected ${field} field contains an empty or duplicate value.`);
            }
        }
        if (fields.includes('tags') && (values.tags.length > 13 || values.tags.some((tag) => tag.length > 20))) {
            throw new Error('The selected tags must contain at most 13 values and 20 characters per tag.');
        }
        if (fields.includes('materials') && (values.materials.length > 13 || values.materials.some((material) => !/^[\p{L}\p{N} ]+$/u.test(material)))) {
            throw new Error('The selected materials must contain at most 13 values using letters, numbers, and spaces only.');
        }
        return values;
    }

    function expectedEditorAfterProposal(before, proposal) {
        if (!before || typeof before !== 'object' || !Array.isArray(before.tags) || !Array.isArray(before.materials)) return null;
        const prepared = validateEditableProposal(proposal);
        const expected = {
            title: String(before.title ?? ''),
            description: String(before.description ?? ''),
            tags: [...before.tags],
            materials: [...before.materials],
            quantity: String(before.quantity ?? ''),
            sku: String(before.sku ?? ''),
        };
        prepared.fields.forEach((field) => { expected[field] = Array.isArray(prepared[field]) ? [...prepared[field]] : prepared[field]; });
        return expected;
    }

    function editorFieldMatches(field, actual, expected) {
        if (field === 'title') return normalizeSpace(actual?.title) === normalizeSpace(expected?.title);
        if (field === 'description') return String(actual?.description ?? '') === String(expected?.description ?? '');
        if (field === 'tags' || field === 'materials') return sameStringSet(actual?.[field], expected?.[field]);
        if (field === 'quantity' || field === 'sku') return String(actual?.[field] ?? '') === String(expected?.[field] ?? '');
        return false;
    }

    function editorMatchesSnapshot(editor, expected) {
        const integrity = editor?.[PILL_READ_INTEGRITY];
        return Boolean(expected
            && integrity?.tags === true
            && integrity?.materials === true
            && ['title', 'description', 'tags', 'materials', 'quantity', 'sku']
                .every((field) => editorFieldMatches(field, editor, expected)));
    }

    function editorMatchesExpectedProposal(editor, before, proposal) {
        let expected;
        try { expected = expectedEditorAfterProposal(before, proposal); } catch { return false; }
        return editorMatchesSnapshot(editor, expected);
    }

    function editorPublishIsDormant() {
        const button = EditorAdapter.publishButton();
        return !button || button.disabled === true || button.getAttribute?.('aria-disabled') === 'true';
    }

    function isEditorSurfaceTarget(target) {
        if (!(target instanceof Element) || state.host?.contains?.(target)) return false;
        const root = EditorAdapter.root();
        return root === document || Boolean(root?.contains?.(target));
    }

    const TRUSTED_EDITOR_MUTATION_EVENTS = Object.freeze(['beforeinput', 'input', 'change', 'click', 'drop']);

    function trustedEditorEventMayMutate(event) {
        if (event?.type !== 'click') return true;
        const target = event?.target;
        return target instanceof Element && Boolean(target.closest?.(
            'button,[role="button"],[role="menuitem"],[role="option"],input[type="checkbox"],input[type="radio"]',
        ));
    }

    function monitorTrustedEditorInput() {
        let conflict = false;
        const listener = (event) => {
            if (event.isTrusted === true && trustedEditorEventMayMutate(event) && isEditorSurfaceTarget(event.target)) conflict = true;
        };
        TRUSTED_EDITOR_MUTATION_EVENTS.forEach((type) => document.addEventListener(type, listener, true));
        return {
            conflicted: () => conflict,
            dispose: () => TRUSTED_EDITOR_MUTATION_EVENTS.forEach((type) => document.removeEventListener(type, listener, true)),
        };
    }

    function installTrustedEditorInteractionWatcher() {
        if (state.editorInteractionWatcherInstalled) return;
        state.editorInteractionWatcherInstalled = true;
        const listener = (event) => {
            if (event.isTrusted !== true || !trustedEditorEventMayMutate(event)
                || routeKind() !== 'editor' || !isEditorSurfaceTarget(event.target)) return;
            state.editorInteractionEpoch += 1;
            const identity = Queue.activeIdentity();
            if (!identity) return;
            const watchedStatuses = [
                'applying', 'awaiting-user-review', 'submitted', 'submitted-unverified',
                'awaiting-user-deactivation', 'deactivation-submitted', 'deactivation-submitted-unverified',
            ];
            if (!watchedStatuses.includes(String(identity.itemStatus || ''))) return;
            // This synchronous flag is deliberately fail-closed. The durable marker protects
            // reloads and other tabs, while this flag still blocks the current page if storage
            // is temporarily unavailable when the trusted interaction occurs.
            state.editorInteractionConflict = true;
            const at = nowIso();
            void withNamedLock(STORAGE_MUTATION_LOCK, async () => {
                const queue = normalizeQueue(await GMX.get(KEYS.queue, null));
                const item = queue?.items?.[identity.cursor];
                if (!queue || queue.invalidSchema || queue.unsupportedSchema
                    || String(queue.id) !== String(identity.queueId) || Number(queue.cursor) !== Number(identity.cursor)
                    || String(item?.listingId) !== String(identity.listingId)
                    || !watchedStatuses.includes(String(item?.status || ''))) return;
                item.editorInteractionConflictAt = at;
                await Store.saveQueueLocked(queue);
            }).catch(() => { /* Publishing also checks the synchronous interaction monitor. */ });
        };
        TRUSTED_EDITOR_MUTATION_EVENTS.forEach((type) => document.addEventListener(type, listener, true));
    }

    function currentShopKey(root = document) {
        const keys = Array.from(root?.querySelectorAll?.('[data-seller-nav="true"] a[href*="/shop/"]') || []).flatMap((anchor) => {
            try {
                const url = new URL(anchor.href, location.href);
                const match = url.pathname.match(/^\/shop\/([A-Za-z0-9]+)\/?$/);
                if (url.protocol !== 'https:' || url.hostname !== 'www.etsy.com' || url.port || url.username || url.password || !match) return [];
                return [`etsy-shop:${match[1].toLowerCase()}`];
            } catch { return []; }
        });
        const unique = uniqueStrings(keys);
        return unique.length === 1 ? unique[0] : '';
    }

    function normalizeListingState(value) {
        const normalized = normalizeSpace(value).toLowerCase().replace(/[\s-]+/g, '_');
        const aliases = {
            active: 'active', aktif: 'active',
            draft: 'draft', taslak: 'draft',
            expired: 'expired', süresi_dolmuş: 'expired', suresi_dolmus: 'expired',
            sold_out: 'sold_out', tükendi: 'sold_out', tukendi: 'sold_out',
            inactive: 'inactive', deactivated: 'inactive', pasif: 'inactive', devre_dışı: 'inactive', devre_disi: 'inactive',
        };
        return aliases[normalized] || '';
    }

    function listingStateLabel(value) {
        return { active: 'Active', draft: 'Draft', expired: 'Expired', sold_out: 'Sold out', inactive: 'Inactive' }[normalizeListingState(value)] || '';
    }

    function normalizeSeasonality(value, legacyValue = undefined) {
        const normalized = normalizeSpace(value).toLocaleLowerCase('en-US');
        if (['seasonal', 'non-seasonal', 'unknown'].includes(normalized)) return normalized;
        if (legacyValue === true) return 'seasonal';
        if (legacyValue === false) return 'non-seasonal';
        return 'unknown';
    }

    function normalizeListingType(value) {
        const normalized = normalizeSpace(value).toLocaleLowerCase('en-US');
        return ['digital', 'physical', 'unknown'].includes(normalized) ? normalized : 'unknown';
    }

    function pageListingState(root = document, href = location.href) {
        const signals = [];
        try {
            const explicit = normalizeListingState(new URL(href, location.href).searchParams.get('item_status'));
            if (explicit) signals.push(explicit);
        } catch { return ''; }
        Array.from(root?.querySelectorAll?.('input[name="item_status"]') || []).forEach((input) => {
            const label = input.closest?.('label');
            const hasLiveCheckedState = input && typeof input === 'object' && 'checked' in input;
            let selected = hasLiveCheckedState
                ? Boolean(input.checked)
                : Boolean(input.getAttribute?.('checked') !== null || input.getAttribute?.('aria-checked') === 'true');
            if (!hasLiveCheckedState) {
                try { selected = selected || input.matches?.(':checked'); } catch { /* optional selector support */ }
            }
            selected = selected || label?.getAttribute?.('aria-current') === 'true'
                || Boolean(label?.querySelector?.('[data-clg-id="WtAnnouncement"][role="status"]'));
            const stateValue = selected ? normalizeListingState(input.value) : '';
            if (stateValue) signals.push(stateValue);
        });
        const unique = uniqueStrings(signals);
        return unique.length === 1 ? unique[0] : '';
    }

    function recordListingState(record, derived = null) {
        const metaState = normalizeListingState(record?.meta?.listingState || record?.meta?.statusLabel);
        const currentState = normalizeListingState(derived?.current?.listingState || derived?.current?.statusLabel);
        if (metaState && currentState && metaState !== currentState) return '';
        return currentState || metaState;
    }

    function shopKeyFromUrl(url) {
        const routeShop = String(url || '').match(/\/your\/shops\/([^/]+)/i)?.[1]?.toLowerCase() || '';
        if (routeShop && routeShop !== 'me') return `etsy-shop:${routeShop}`;
        return currentShopKey();
    }

    function snapshotMetricIsCurrent(snapshot, field) {
        if (!Number.isFinite(snapshot?.[field])) return false;
        const capturedAt = validTime(snapshot.at);
        const observedAt = validTime(snapshot.observedAt?.[field]);
        if (capturedAt === null || observedAt === null || observedAt > capturedAt + 1000) return false;
        return capturedAt - observedAt <= SNAPSHOT_OBSERVATION_MAX_SKEW_MS;
    }

    function snapshotFromListing(listing, capturedAt) {
        const metricContract = normalizeMetricContract(listing.metricContract);
        const snapshot = {
            at: capturedAt, day: dayKey(capturedAt), visits: finiteOrNull(listing.visits), favorites: finiteOrNull(listing.favorites),
            sales: finiteOrNull(listing.sales), revenue: finiteOrNull(listing.revenue), renewals: finiteOrNull(listing.renewals), stock: finiteOrNull(listing.stock),
            priceMin: finiteOrNull(listing.price?.min), priceMax: finiteOrNull(listing.price?.max), priceLabel: normalizeSpace(listing.price?.label),
            currency: normalizeSpace(listing.currency), listingState: normalizeListingState(listing.listingState),
            statusLabel: normalizeSpace(listing.statusLabel), renewalLabel: normalizeSpace(listing.renewalLabel), observedAt: {}, metricContract,
        };
        SNAPSHOT_NUMBER_FIELDS.forEach((field) => { if (Number.isFinite(snapshot[field])) snapshot.observedAt[field] = capturedAt; });
        snapshot.quality = {
            parserVersion: LISTING_METRIC_CONTRACT.parserVersion,
            observedFields: HEALTH_METRIC_FIELDS.filter((field) => Number.isFinite(snapshot[field])),
            missingFields: HEALTH_METRIC_FIELDS.filter((field) => !Number.isFinite(snapshot[field])),
            metricContractId: metricContract?.id || '', metricScopeVerified: Boolean(metricContract), metricScopes: metricContract?.scopes || null,
            sourceUpdatedAt: metricContract?.sourceUpdatedAt || null, sourceTimeStatus: metricContract?.sourceTimeStatus || 'unknown', capturedAt,
        };
        return snapshot;
    }

    function normalizeSnapshot(raw) {
        if (!raw || typeof raw !== 'object' || validTime(raw.at) === null) return null;
        const at = new Date(validTime(raw.at)).toISOString();
        const metricContract = normalizeMetricContract(raw.metricContract);
        const snapshot = { ...raw, at, day: dayKey(at), observedAt: {}, metricContract };
        SNAPSHOT_NUMBER_FIELDS.forEach((field) => {
            snapshot[field] = finiteOrNull(raw[field]);
            const observed = validTime(raw.observedAt?.[field]);
            if (Number.isFinite(snapshot[field])) snapshot.observedAt[field] = observed === null ? at : new Date(observed).toISOString();
        });
        snapshot.priceLabel = normalizeSpace(raw.priceLabel);
        snapshot.currency = normalizeSpace(raw.currency);
        snapshot.listingState = normalizeListingState(raw.listingState || raw.statusLabel);
        snapshot.statusLabel = normalizeSpace(raw.statusLabel);
        snapshot.renewalLabel = normalizeSpace(raw.renewalLabel);
        const observedFields = HEALTH_METRIC_FIELDS.filter((field) => snapshotMetricIsCurrent(snapshot, field));
        snapshot.quality = {
            parserVersion: Number(raw.quality?.parserVersion) || 1,
            observedFields,
            missingFields: HEALTH_METRIC_FIELDS.filter((field) => !observedFields.includes(field)),
            metricContractId: metricContract?.id || '', metricScopeVerified: Boolean(metricContract), metricScopes: metricContract?.scopes || null,
            sourceUpdatedAt: metricContract?.sourceUpdatedAt || null, sourceTimeStatus: metricContract?.sourceTimeStatus || 'unknown',
            capturedAt: validTime(raw.quality?.capturedAt) === null ? at : new Date(validTime(raw.quality.capturedAt)).toISOString(),
        };
        return snapshot;
    }

    function mergeDailySnapshot(previousRaw, incomingRaw) {
        const left = normalizeSnapshot(previousRaw); const right = normalizeSnapshot(incomingRaw);
        if (!left) return right;
        if (!right) return left;
        if (left.day !== right.day) return validTime(right.at) >= validTime(left.at) ? right : left;
        const [previous, incoming] = validTime(left.at) <= validTime(right.at) ? [left, right] : [right, left];
        const merged = { ...previous, at: incoming.at, day: previous.day, observedAt: { ...previous.observedAt }, metricContract: incoming.metricContract || null };
        SNAPSHOT_NUMBER_FIELDS.forEach((field) => {
            if (Number.isFinite(incoming[field])) {
                merged[field] = incoming[field];
                merged.observedAt[field] = incoming.observedAt?.[field] || incoming.at;
            } else {
                merged[field] = null;
                delete merged.observedAt[field];
            }
        });
        ['priceLabel', 'currency', 'listingState', 'statusLabel', 'renewalLabel'].forEach((field) => { if (normalizeSpace(incoming[field])) merged[field] = normalizeSpace(incoming[field]); });
        const observedFields = HEALTH_METRIC_FIELDS.filter((field) => snapshotMetricIsCurrent(merged, field));
        merged.quality = {
            parserVersion: Math.max(Number(previous.quality?.parserVersion) || 1, Number(incoming.quality?.parserVersion) || 1),
            observedFields,
            missingFields: HEALTH_METRIC_FIELDS.filter((field) => !observedFields.includes(field)),
            metricContractId: merged.metricContract?.id || '', metricScopeVerified: Boolean(merged.metricContract), metricScopes: merged.metricContract?.scopes || null,
            sourceUpdatedAt: merged.metricContract?.sourceUpdatedAt || null, sourceTimeStatus: merged.metricContract?.sourceTimeStatus || 'unknown',
            capturedAt: merged.at,
            mergedCaptures: (Number(previous.quality?.mergedCaptures) || 1) + 1,
        };
        return merged;
    }

    function normalizeRecord(raw, expectedListingId = '') {
        if (!raw || typeof raw !== 'object') return null;
        const schema = Number(raw.schema ?? RECORD_SCHEMA_VERSION);
        const listingId = String(raw.listingId || expectedListingId || '');
        if (schema > RECORD_SCHEMA_VERSION) return { ...raw, listingId, unsupportedSchema: true };
        const record = {
            ...raw, schema: RECORD_SCHEMA_VERSION, listingId,
            meta: raw.meta && typeof raw.meta === 'object' ? { ...raw.meta } : {},
            improvements: Array.isArray(raw.improvements) ? [...raw.improvements] : [],
            proposal: raw.proposal && typeof raw.proposal === 'object' ? { ...raw.proposal } : null,
        };
        record.meta.shopKey = record.meta.shopKey || shopKeyFromUrl(record.meta.editUrl);
        record.meta.listingState = normalizeListingState(record.meta.listingState || record.meta.statusLabel);
        record.meta.seasonality = normalizeSeasonality(record.meta.seasonality, record.meta.seasonal);
        delete record.meta.seasonal;
        record.meta.listingType = normalizeListingType(record.meta.listingType);
        record.meta.contextUpdatedAt = validTime(record.meta.contextUpdatedAt) === null ? null : new Date(validTime(record.meta.contextUpdatedAt)).toISOString();
        const quarantine = Array.isArray(raw.quarantine) ? [...raw.quarantine] : [];
        const historySource = Array.isArray(raw.history) ? raw.history : [];
        if (raw.history !== undefined && !Array.isArray(raw.history)) quarantine.push({ reason: 'invalid-history-container', value: raw.history });
        const history = [];
        historySource.forEach((item) => {
            const snapshot = normalizeSnapshot(item);
            if (!snapshot) { quarantine.push({ reason: 'invalid-snapshot', value: item }); return; }
            const sameDay = history.findIndex((entry) => entry.day === snapshot.day);
            if (sameDay >= 0) history[sameDay] = mergeDailySnapshot(history[sameDay], snapshot);
            else history.push(snapshot);
        });
        record.history = history.sort((a, b) => String(a.at).localeCompare(String(b.at)));
        if (quarantine.length) record.quarantine = quarantine.slice(-20);
        if (raw.analysis && !raw.health && !raw.legacyAnalysis) record.legacyAnalysis = raw.analysis;
        return record;
    }

    function recordObjectTime(value) {
        if (!value || typeof value !== 'object') return 0;
        const direct = ['updatedAt', 'appliedAt', 'publishedAt', 'completedAt', 'supersededAt', 'verifiedAt', 'capturedAt', 'lastSeenAt', 'contextUpdatedAt', 'startAt', 'evaluateAt', 'contaminatedAt', 'at'];
        const nested = ['startAt', 'evaluateAt', 'contaminatedAt', 'completedAt'].map((key) => value.experiment?.[key]);
        return Math.max(0, ...direct.map((key) => validTime(value[key]) || 0), ...nested.map((item) => validTime(item) || 0));
    }

    function mergeTimedObject(current, incoming) {
        if (!current || typeof current !== 'object') return incoming && typeof incoming === 'object' ? { ...incoming } : incoming;
        if (!incoming || typeof incoming !== 'object') return { ...current };
        const incomingWins = recordObjectTime(incoming) >= recordObjectTime(current);
        const older = incomingWins ? current : incoming;
        const newer = incomingWins ? incoming : current;
        return { ...older, ...newer };
    }

    function mergeListingMeta(currentMeta, incomingMeta) {
        const current = currentMeta && typeof currentMeta === 'object' ? currentMeta : {};
        const incoming = incomingMeta && typeof incomingMeta === 'object' ? incomingMeta : {};
        const merged = mergeTimedObject(current, incoming) || {};
        const currentContextAt = validTime(current.contextUpdatedAt);
        const incomingContextAt = validTime(incoming.contextUpdatedAt);
        const currentHasContext = currentContextAt !== null
            || normalizeSeasonality(current.seasonality, current.seasonal) !== 'unknown'
            || normalizeListingType(current.listingType) !== 'unknown';
        const incomingHasContext = incomingContextAt !== null
            || normalizeSeasonality(incoming.seasonality, incoming.seasonal) !== 'unknown'
            || normalizeListingType(incoming.listingType) !== 'unknown';
        const contextSource = incomingContextAt !== null && (currentContextAt === null || incomingContextAt >= currentContextAt)
            ? incoming
            : currentContextAt !== null
                ? current
                : incomingHasContext || !currentHasContext
                    ? incoming
                    : current;
        merged.seasonality = normalizeSeasonality(contextSource.seasonality, contextSource.seasonal);
        merged.listingType = normalizeListingType(contextSource.listingType);
        merged.contextUpdatedAt = validTime(contextSource.contextUpdatedAt) === null
            ? null
            : new Date(validTime(contextSource.contextUpdatedAt)).toISOString();
        if (contextSource.contextSource) merged.contextSource = String(contextSource.contextSource);
        else delete merged.contextSource;
        delete merged.seasonal;
        return merged;
    }

    function applyRecordHistoryPolicy(record, retentionSettings = state.settings) {
        if (!record || typeof record !== 'object') return record;
        const cutoff = Date.now() - clamp(retentionSettings.retentionDays, 30, APP.retentionDays) * DAY_MS;
        return {
            ...record,
            history: (Array.isArray(record.history) ? record.history : [])
                .filter((snapshot) => (validTime(snapshot.at) || 0) >= cutoff)
                .slice(-clamp(retentionSettings.maxSnapshots, 10, APP.maxSnapshots)),
        };
    }

    function mergeRecordCopies(currentRaw, incomingRaw, retentionSettings = state.settings) {
        const incoming = normalizeRecord(incomingRaw, incomingRaw?.listingId);
        const current = normalizeRecord(currentRaw, incoming?.listingId);
        if (!current) return applyRecordHistoryPolicy(incoming, retentionSettings);
        if (!incoming) return applyRecordHistoryPolicy(current, retentionSettings);
        if (current.unsupportedSchema || incoming.unsupportedSchema) throw new Error('A newer listing record schema cannot be merged.');
        const merged = { ...current, ...incoming, schema: RECORD_SCHEMA_VERSION, listingId: incoming.listingId || current.listingId };

        merged.meta = mergeListingMeta(current.meta, incoming.meta);
        merged.editor = mergeTimedObject(current.editor, incoming.editor);
        merged.proposal = mergeTimedObject(current.proposal, incoming.proposal);
        merged.deactivation = mergeTimedObject(current.deactivation, incoming.deactivation);

        const history = [...(current.history || []), ...(incoming.history || [])]
            .map(normalizeSnapshot).filter(Boolean).sort((left, right) => String(left.at).localeCompare(String(right.at)));
        merged.history = [];
        history.forEach((snapshot) => {
            const sameDay = merged.history.findIndex((item) => item.day === snapshot.day);
            if (sameDay >= 0) {
                if (JSON.stringify(merged.history[sameDay]) !== JSON.stringify(snapshot)) merged.history[sameDay] = mergeDailySnapshot(merged.history[sameDay], snapshot);
            } else merged.history.push(snapshot);
        });
        merged.history = applyRecordHistoryPolicy(merged, retentionSettings).history;

        const improvements = new Map();
        [...(current.improvements || []), ...(incoming.improvements || [])].forEach((entry, index) => {
            if (!entry || typeof entry !== 'object') return;
            const key = String(entry.id || `legacy-${recordObjectTime(entry)}-${index}`);
            const previous = improvements.get(key);
            const combined = mergeTimedObject(previous, entry);
            if (previous?.experiment || entry.experiment) combined.experiment = mergeTimedObject(previous?.experiment, entry.experiment);
            improvements.set(key, combined);
        });
        merged.improvements = [...improvements.values()]
            .sort((left, right) => recordObjectTime(left) - recordObjectTime(right))
            .slice(-APP.maxImprovements);

        const currentLatest = validTime(current.history?.at(-1)?.at) || 0;
        const incomingLatest = validTime(incoming.history?.at(-1)?.at) || 0;
        if (currentLatest > incomingLatest) {
            merged.health = current.health;
            merged.analysis = current.analysis;
        }
        const quarantine = [...(current.quarantine || []), ...(incoming.quarantine || [])];
        if (quarantine.length) merged.quarantine = quarantine.slice(-20);
        merged.revision = Math.max(Number(current.revision) || 0, Number(incoming.revision) || 0) + 1;
        return merged;
    }

    function normalizeHealthThresholds(settings = {}) {
        const valueOrDefault = (value, fallback) => finiteOrNull(value) ?? fallback;
        const improveContract = HEALTH_THRESHOLD_CONTRACTS.minVisitsToImprove;
        const protectContract = HEALTH_THRESHOLD_CONTRACTS.minVisitsToProtect;
        const renewalContract = HEALTH_THRESHOLD_CONTRACTS.minRenewalsToReview;
        const declineContract = HEALTH_THRESHOLD_CONTRACTS.declinePercent;
        const minVisitsToImprove = Math.round(clamp(valueOrDefault(settings.minVisitsToImprove, DEFAULT_SETTINGS.minVisitsToImprove), improveContract.min, improveContract.max));
        const requestedProtect = Math.round(clamp(valueOrDefault(settings.minVisitsToProtect, DEFAULT_SETTINGS.minVisitsToProtect), protectContract.min, protectContract.max));
        return {
            minVisitsToImprove,
            minVisitsToProtect: Math.min(protectContract.max, Math.max(minVisitsToImprove + 1, requestedProtect)),
            minRenewalsToReview: Math.round(clamp(valueOrDefault(settings.minRenewalsToReview, DEFAULT_SETTINGS.minRenewalsToReview), renewalContract.min, renewalContract.max)),
            declinePercent: Math.round(clamp(valueOrDefault(settings.declinePercent, DEFAULT_SETTINGS.declinePercent), declineContract.min, declineContract.max)),
        };
    }

    function healthPolicy(settings = {}) {
        const thresholds = { ...normalizeHealthThresholds(settings), minimumCohortSize: HEALTH_RULES.minimumCohortSize };
        return { version: HEALTH_POLICY_VERSION, fingerprint: `hp${HEALTH_POLICY_VERSION}-${fnv1a(JSON.stringify(thresholds))}`, thresholds };
    }

    function recommendationStateFingerprint(record, health = record?.health) {
        const analysis = health?.result || record?.analysis || {};
        const latest = record?.history?.at(-1) || null;
        const metricContract = normalizeMetricContract(latest?.metricContract);
        const safeguards = (Array.isArray(analysis.safeguards) ? analysis.safeguards : [])
            .map((item) => [String(item?.key || ''), Boolean(item?.passed)])
            .sort((left, right) => left[0].localeCompare(right[0]));
        return fnv1a(JSON.stringify({
            context: {
                updatedAt: validTime(record?.meta?.contextUpdatedAt) === null ? null : new Date(validTime(record.meta.contextUpdatedAt)).toISOString(),
                seasonality: normalizeSeasonality(record?.meta?.seasonality, record?.meta?.seasonal),
                listingType: normalizeListingType(record?.meta?.listingType),
            },
            deactivation: record?.deactivation && typeof record.deactivation === 'object' ? {
                at: validTime(record.deactivation.at) === null ? null : new Date(validTime(record.deactivation.at)).toISOString(),
                operationId: String(record.deactivation.operationId || ''),
            } : null,
            latest: latest ? {
                at: latest.at || null,
                values: Object.fromEntries([...HEALTH_METRIC_FIELDS, 'stock', 'priceMin', 'priceMax'].map((field) => [field, finiteOrNull(latest[field])])),
                currency: String(latest.currency || ''), listingState: normalizeListingState(latest.listingState || latest.statusLabel),
                metricContract: metricContract ? { id: metricContract.id, countPrecision: metricContract.countPrecision } : null,
            } : null,
            health: {
                lifecycle: String(analysis.lifecycle || ''), code: String(analysis.code || ''),
                safeguards, anomalies: uniqueStrings(Array.isArray(analysis.anomalies) ? analysis.anomalies.map(String) : []).sort(),
            },
        }));
    }

    function recommendationBasis(record, health = record?.health) {
        return {
            engineVersion: Number(health?.engineVersion) || HEALTH_ENGINE_VERSION,
            policyFingerprint: health?.policy?.fingerprint || healthPolicy(state.settings).fingerprint,
            latestAt: record?.history?.at(-1)?.at || null,
            stateFingerprint: recommendationStateFingerprint(record, health),
        };
    }

    function recommendationBasisEquals(saved, current) {
        return Boolean(saved)
            && Number(saved.engineVersion) === Number(current.engineVersion)
            && saved.policyFingerprint === current.policyFingerprint
            && saved.latestAt === current.latestAt
            && typeof saved.stateFingerprint === 'string'
            && saved.stateFingerprint === current.stateFingerprint;
    }

    function recommendationBasisMatches(record, proposal = record?.proposal, health = record?.health) {
        return recommendationBasisEquals(proposal?.basis, recommendationBasis(record, health));
    }

    function findAnchor(history, current, targetDays, options = {}) {
        const tolerance = HEALTH_RULES.anchorToleranceDays[targetDays] ?? 7;
        const exactFields = Array.isArray(options.exactFields) ? options.exactFields : [];
        const sameRevenueCurrency = options.sameRevenueCurrency === true;
        if (!normalizeMetricContract(current?.metricContract)
            || (exactFields.length && !snapshotCountsAreExact(current, exactFields))) {
            return { snapshot: null, targetDays, actualDays: null, distance: null, complete: false };
        }
        let best = null;
        history.forEach((snapshot) => {
            if (snapshot === current) return;
            if (!normalizeMetricContract(snapshot?.metricContract)) return;
            if (!HEALTH_METRIC_FIELDS.every((field) => Number.isFinite(snapshot?.[field]))) return;
            if (exactFields.length && !snapshotCountsAreExact(snapshot, exactFields)) return;
            if (sameRevenueCurrency && !revenueCurrenciesComparable(current, snapshot)) return;
            const actualDays = daysBetween(current.at, snapshot.at);
            if (!Number.isFinite(actualDays) || actualDays <= 0) return;
            const distance = Math.abs(actualDays - targetDays);
            if (!best || distance < best.distance || (distance === best.distance && actualDays > best.actualDays)) best = { snapshot, targetDays, actualDays, distance };
        });
        return best && best.distance <= tolerance ? { ...best, complete: true } : { snapshot: null, targetDays, actualDays: null, distance: best?.distance ?? null, complete: false };
    }

    function findNonOverlappingTrendAnchor(history, current) {
        if (!normalizeMetricContract(current?.metricContract) || !snapshotCountsAreExact(current, ['visits'])) {
            return { snapshot: null, targetDays: 30, actualDays: null, distance: null, complete: false };
        }
        let best = null;
        history.forEach((snapshot) => {
            if (snapshot === current || !normalizeMetricContract(snapshot?.metricContract)) return;
            if (!snapshotCountsAreExact(snapshot, ['visits'])) return;
            if (!HEALTH_METRIC_FIELDS.every((field) => Number.isFinite(snapshot?.[field]))) return;
            const actualDays = daysBetween(current.at, snapshot.at);
            if (!Number.isFinite(actualDays) || actualDays < 30 || actualDays > 31) return;
            const distance = Math.abs(actualDays - 30);
            if (!best || distance < best.distance || (distance === best.distance && actualDays < best.actualDays)) {
                best = { snapshot, targetDays: 30, actualDays, distance, complete: true };
            }
        });
        return best || { snapshot: null, targetDays: 30, actualDays: null, distance: null, complete: false };
    }

    function currentStateEpoch(history, current) {
        const source = Array.isArray(history) ? history : [];
        const currentIndex = source.lastIndexOf(current);
        const stateValue = normalizeListingState(current?.listingState || current?.statusLabel);
        if (currentIndex < 0 || !stateValue) return current ? [current] : [];
        const epoch = [];
        for (let index = currentIndex; index >= 0; index -= 1) {
            const snapshot = source[index];
            if (normalizeListingState(snapshot?.listingState || snapshot?.statusLabel) !== stateValue) break;
            epoch.unshift(snapshot);
        }
        return epoch;
    }

    function snapshotForAnalysis(raw) {
        const snapshot = normalizeSnapshot(raw);
        if (!snapshot) return null;
        const staleObservedFields = [];
        SNAPSHOT_NUMBER_FIELDS.forEach((field) => {
            if (Number.isFinite(snapshot[field]) && !snapshotMetricIsCurrent(snapshot, field)) {
                snapshot[field] = null;
                staleObservedFields.push(field);
            }
        });
        snapshot.staleObservedFields = staleObservedFields;
        return snapshot;
    }

    function cumulativeWindow(current, anchor, field, targetDays) {
        if (!anchor?.snapshot || !Number.isFinite(current?.[field]) || !Number.isFinite(anchor.snapshot[field])) return { raw: null, normalized: null, actualDays: null, issue: 'missing-window' };
        if (DECISION_COUNT_FIELDS.includes(field)
            && (!snapshotCountsAreExact(current, [field]) || !snapshotCountsAreExact(anchor.snapshot, [field]))) {
            return { raw: null, normalized: null, actualDays: anchor.actualDays ?? null, issue: 'approximate-counts' };
        }
        if (field === 'revenue' && !revenueCurrenciesComparable(current, anchor.snapshot)) {
            return { raw: null, normalized: null, actualDays: anchor.actualDays ?? null, issue: 'currency-mismatch' };
        }
        const raw = current[field] - anchor.snapshot[field];
        if (raw < 0) return { raw: null, normalized: null, actualDays: anchor.actualDays ?? null, issue: 'cumulative-decrease' };
        const normalized = anchor.actualDays > 0 ? Math.round(raw * (targetDays / anchor.actualDays) * 1000) / 1000 : null;
        return { raw, normalized, actualDays: anchor.actualDays ?? null, issue: null };
    }

    function inspectHistory(history, evaluatedAt) {
        const anomalies = [];
        history.forEach((snapshot, index) => {
            (snapshot.staleObservedFields || []).forEach((field) => anomalies.push(`stale-observation-${field}`));
            if (!normalizeMetricContract(snapshot.metricContract)) anomalies.push('unverified-metric-scope');
            SNAPSHOT_NUMBER_FIELDS.forEach((field) => { if (Number.isFinite(snapshot[field]) && snapshot[field] < 0) anomalies.push(`negative-${field}`); });
            if (snapshot.sales === 0 && Number(snapshot.revenue) > 0) anomalies.push('revenue-without-sales');
            if (validTime(snapshot.at) > validTime(evaluatedAt) + SNAPSHOT_FUTURE_TOLERANCE_MS) anomalies.push('future-snapshot');
            if (index > 0) {
                const previous = history[index - 1];
                if (!revenueCurrenciesComparable(previous, snapshot)) anomalies.push('currency-mismatch');
                ['sales', 'revenue', 'renewals'].forEach((field) => {
                    if (field === 'revenue' && !revenueCurrenciesComparable(previous, snapshot)) return;
                    if (Number.isFinite(previous?.[field]) && Number.isFinite(snapshot[field]) && snapshot[field] < previous[field]) anomalies.push(`cumulative-decrease-${field}`);
                });
            }
        });
        return uniqueStrings(anomalies);
    }

    function deriveRecordMetrics(record, evaluatedAt) {
        const history = Array.isArray(record.history) ? record.history.map(snapshotForAnalysis).filter(Boolean).sort((a, b) => String(a.at).localeCompare(String(b.at))) : [];
        const current = history.at(-1) || null;
        if (!current) return { history, current: null, anchors: {}, anomalies: ['missing-history'], complete: false, snapshotCount: 0, completeSnapshotCount: 0, historySpanDays: 0 };
        const epochHistory = currentStateEpoch(history, current);
        const anchors = { d30: findAnchor(epochHistory, current, 30), d60: findAnchor(epochHistory, current, 60), d90: findAnchor(epochHistory, current, 90) };
        anchors.prior30 = anchors.d30.snapshot ? findAnchor(epochHistory, anchors.d30.snapshot, 30) : { snapshot: null, targetDays: 30, actualDays: null, distance: null, complete: false };
        anchors.trend30 = findNonOverlappingTrendAnchor(epochHistory, current);
        anchors.priorTrend30 = anchors.trend30.snapshot
            ? findNonOverlappingTrendAnchor(epochHistory, anchors.trend30.snapshot)
            : { snapshot: null, targetDays: 30, actualDays: null, distance: null, complete: false };
        anchors.d30Traffic = findAnchor(epochHistory, current, 30, { exactFields: ['visits'] });
        anchors.d60Traffic = findAnchor(epochHistory, current, 60, { exactFields: ['visits'] });
        anchors.prior30Traffic = anchors.d30Traffic.snapshot
            ? findAnchor(epochHistory, anchors.d30Traffic.snapshot, 30, { exactFields: ['visits'] })
            : { snapshot: null, targetDays: 30, actualDays: null, distance: null, complete: false };
        anchors.d30Sales = findAnchor(epochHistory, current, 30, { exactFields: ['sales'] });
        anchors.d60Sales = findAnchor(epochHistory, current, 60, { exactFields: ['sales'] });
        anchors.d30Revenue = findAnchor(epochHistory, current, 30, { sameRevenueCurrency: true });
        anchors.d60Revenue = findAnchor(epochHistory, current, 60, { sameRevenueCurrency: true });
        anchors.d30Renewals = findAnchor(epochHistory, current, 30, { exactFields: ['renewals'] });
        anchors.d60Renewals = findAnchor(epochHistory, current, 60, { exactFields: ['renewals'] });
        const sales30 = cumulativeWindow(current, anchors.d30Sales, 'sales', 30);
        const revenue30 = cumulativeWindow(current, anchors.d30Revenue, 'revenue', 30);
        const renewals30 = cumulativeWindow(current, anchors.d30Renewals, 'renewals', 30);
        const sales60 = cumulativeWindow(current, anchors.d60Sales, 'sales', 60);
        const revenue60 = cumulativeWindow(current, anchors.d60Revenue, 'revenue', 60);
        const renewals60 = cumulativeWindow(current, anchors.d60Renewals, 'renewals', 60);
        const trafficChangePercent = percentChange(current.visits, anchors.d30.snapshot?.visits);
        const priorTrafficChangePercent = anchors.d30.snapshot && anchors.prior30.snapshot
            ? percentChange(anchors.d30.snapshot.visits, anchors.prior30.snapshot.visits)
            : null;
        const trendTrafficChangePercent = percentChange(current.visits, anchors.trend30.snapshot?.visits);
        const priorTrendTrafficChangePercent = anchors.trend30.snapshot && anchors.priorTrend30.snapshot
            ? percentChange(anchors.trend30.snapshot.visits, anchors.priorTrend30.snapshot.visits)
            : null;
        const currentExactness = Object.fromEntries(DECISION_COUNT_FIELDS.map((field) => [field, snapshotCountsAreExact(current, [field])]));
        const trafficDecisionReady = currentExactness.visits;
        const reachDecisionReady = currentExactness.visits && currentExactness.favorites;
        const deactivationDecisionReady = DECISION_COUNT_FIELDS.every((field) => currentExactness[field]);
        const completeSnapshots = epochHistory.filter((snapshot) => normalizeMetricContract(snapshot.metricContract)
            && HEALTH_METRIC_FIELDS.every((field) => Number.isFinite(snapshot[field])));
        const deactivationCompleteSnapshots = completeSnapshots.filter((snapshot) => snapshotCountsAreExact(snapshot, DECISION_COUNT_FIELDS));
        const completeSnapshotCount = completeSnapshots.length;
        const historySpanDays = Math.max(0, daysBetween(current.at, epochHistory[0]?.at) || 0);
        const completeHistorySpanDays = Math.max(0, daysBetween(current.at, completeSnapshots[0]?.at) || 0);
        const deactivationCompleteSnapshotCount = deactivationCompleteSnapshots.length;
        const deactivationCompleteHistorySpanDays = Math.max(0, daysBetween(current.at, deactivationCompleteSnapshots[0]?.at) || 0);
        const decisionSnapshots = [
            ...Object.entries(anchors).filter(([key]) => key !== 'd90').map(([, anchor]) => anchor?.snapshot), current,
        ].filter(Boolean);
        const decisionStart = Math.min(...decisionSnapshots.map((snapshot) => validTime(snapshot.at)).filter(Number.isFinite));
        const decisionHistory = epochHistory.filter((snapshot) => validTime(snapshot.at) >= decisionStart && validTime(snapshot.at) <= validTime(current.at));
        const anomalies = inspectHistory(decisionHistory, evaluatedAt);
        return {
            history: epochHistory, fullHistory: history, current, anchors, snapshotCount: epochHistory.length, completeSnapshotCount, historySpanDays, completeHistorySpanDays,
            stateEpochStartAt: epochHistory[0]?.at || current.at, stateEpochSpanDays: historySpanDays, stateEpochSnapshotCount: epochHistory.length,
            complete: HEALTH_METRIC_FIELDS.every((field) => Number.isFinite(current[field])), currentExactness,
            trafficDecisionReady, reachDecisionReady, deactivationDecisionReady,
            deactivationCompleteSnapshotCount, deactivationCompleteHistorySpanDays,
            observedMetrics: HEALTH_METRIC_FIELDS.filter((field) => Number.isFinite(current[field])),
            missingMetrics: HEALTH_METRIC_FIELDS.filter((field) => !Number.isFinite(current[field])),
            anomalies, historicalAnomalies: inspectHistory(history, evaluatedAt), freshnessDays: freshnessAgeDays(current.at, evaluatedAt),
            visits30: currentExactness.visits ? current.visits : null,
            favorites30: currentExactness.favorites ? current.favorites : null,
            favoriteRate: currentExactness.visits && currentExactness.favorites ? safeRatio(current.favorites, current.visits, 100) : null,
            favoriteRateSmoothed: currentExactness.visits && currentExactness.favorites && Number(current.visits) > 0 ? bayesianRate(current.favorites, current.visits) : null,
            salesRateProxy: currentExactness.visits ? safeRatio(sales30.normalized, current.visits, 100) : null,
            revenuePerVisitProxy: currentExactness.visits ? safeRatio(revenue30.normalized, current.visits) : null,
            sales30: sales30.normalized, sales30Raw: sales30.raw, revenue30: revenue30.normalized, revenue30Raw: revenue30.raw, renewals30: renewals30.normalized, renewals30Raw: renewals30.raw,
            sales60: sales60.normalized, sales60Raw: sales60.raw, revenue60: revenue60.normalized, revenue60Raw: revenue60.raw, renewals60: renewals60.normalized, renewals60Raw: renewals60.raw,
            trafficChangePercent, priorTrafficChangePercent, trendTrafficChangePercent, priorTrendTrafficChangePercent,
            deltas: {
                visits: anchors.d30Traffic.snapshot ? current.visits - anchors.d30Traffic.snapshot.visits : null,
                favorites: anchors.d30.snapshot && snapshotCountsAreExact(current, ['favorites']) && snapshotCountsAreExact(anchors.d30.snapshot, ['favorites']) ? current.favorites - anchors.d30.snapshot.favorites : null,
                sales: sales30.raw, revenue: revenue30.raw, renewals: renewals30.raw,
            },
        };
    }

    function quantile(values, percentile) {
        const sorted = values.map(finiteOrNull).filter(Number.isFinite).sort((a, b) => a - b);
        if (!sorted.length) return null;
        const index = (sorted.length - 1) * percentile;
        const lower = Math.floor(index); const upper = Math.ceil(index);
        return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
    }

    function quantileSorted(sorted, percentile) {
        if (!sorted.length) return null;
        const index = (sorted.length - 1) * percentile;
        const lower = Math.floor(index); const upper = Math.ceil(index);
        return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
    }

    function medianSorted(sorted) {
        if (!sorted.length) return null;
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    }

    function percentileRankSorted(sorted, value) {
        const target = finiteOrNull(value);
        if (target === null || !sorted.length) return null;
        let lower = 0; let upper = sorted.length;
        while (lower < upper) {
            const middle = (lower + upper) >>> 1;
            if (sorted[middle] < target) lower = middle + 1;
            else upper = middle;
        }
        const below = lower;
        upper = sorted.length;
        while (lower < upper) {
            const middle = (lower + upper) >>> 1;
            if (sorted[middle] <= target) lower = middle + 1;
            else upper = middle;
        }
        const equal = lower - below;
        return clamp(Math.round(((below + (equal * 0.5)) / sorted.length) * 100), 0, 100);
    }

    function activeExperiment(record, evaluatedAt) {
        const entries = Array.isArray(record.improvements) ? record.improvements : [];
        return [...entries].reverse().find((entry) => {
            if (entry?.action !== 'UPDATE' || entry?.status !== 'published' || entry?.experiment?.state !== 'observing') return false;
            const deadline = addDays(entry.experiment.evaluateAt || addDays(entry.publishedAt, HEALTH_RULES.experimentDays), HEALTH_RULES.experimentEvaluationGraceDays);
            return !deadline || validTime(deadline) >= validTime(evaluatedAt);
        }) || null;
    }

    function cohortSegmentKey(shopKey, listingType = '*', seasonality = '*') {
        return `${shopKey}\u0000${listingType}\u0000${seasonality}`;
    }

    function fullCohortMembershipKey(segmentKey) {
        return `full\u0000${segmentKey}`;
    }

    function priceBandCohortMembershipKey(segmentKey, targetCurrency, targetPrice) {
        return `band\u0000${segmentKey}\u0000${currencyIdentity(targetCurrency)}\u0000${String(targetPrice)}`;
    }

    function createCohortContext(records, derivations, evaluatedAt) {
        const groups = new Map();
        const diagnostics = {
            eligibilityScans: 0,
            eligibleCandidates: 0,
            groupAssignments: 0,
            groupBuilds: 0,
            membershipBuilds: 0,
            benchmarkBuilds: 0,
            cohortMemberScans: 0,
            distributionSorts: 0,
        };
        records.forEach((candidate) => {
            diagnostics.eligibilityScans += 1;
            const derived = derivations.get(candidate.listingId);
            const shopKey = candidate.meta?.shopKey || shopKeyFromUrl(candidate.meta?.editUrl);
            if (!/^etsy-shop:[a-z0-9]+$/.test(shopKey)) return;
            if (!derived?.complete || recordListingState(candidate, derived) !== 'active') return;
            if (Number(derived.stateEpochSpanDays) < 29) return;
            if (!Number.isFinite(derived.freshnessDays) || derived.freshnessDays > 1 || derived.anomalies?.length) return;
            if (!Number.isFinite(derived.current?.stock) || derived.current.stock <= 0) return;
            if (activeExperiment(candidate, evaluatedAt)) return;
            const recentChange = [...(candidate.improvements || [])].reverse().find((entry) => entry?.publishedAt
                && daysBetween(evaluatedAt, entry.publishedAt) <= HEALTH_RULES.improvementCooldownDays);
            if (recentChange) return;
            const listingType = normalizeListingType(candidate.meta?.listingType);
            const seasonality = normalizeSeasonality(candidate.meta?.seasonality, candidate.meta?.seasonal);
            const descriptor = {
                record: candidate,
                derived,
                listingId: String(candidate.listingId),
                price: finiteOrNull(derived.current?.priceMin),
                currency: normalizeSpace(derived.current?.currency),
            };
            diagnostics.eligibleCandidates += 1;
            const typeSegments = listingType === 'unknown' ? ['*'] : ['*', listingType];
            const seasonSegments = seasonality === 'unknown' ? ['*'] : ['*', seasonality];
            for (const typeSegment of typeSegments) {
                for (const seasonSegment of seasonSegments) {
                    const key = cohortSegmentKey(shopKey, typeSegment, seasonSegment);
                    if (!groups.has(key)) { groups.set(key, []); diagnostics.groupBuilds += 1; }
                    groups.get(key).push(descriptor);
                    diagnostics.groupAssignments += 1;
                }
            }
        });
        const membershipRequestCounts = new Map();
        records.forEach((candidate) => {
            const target = derivations.get(candidate.listingId);
            const shopKey = candidate.meta?.shopKey || shopKeyFromUrl(candidate.meta?.editUrl);
            if (!/^etsy-shop:[a-z0-9]+$/.test(shopKey) || Number(target?.stateEpochSpanDays) < 29) return;
            const listingType = normalizeListingType(candidate.meta?.listingType);
            const seasonality = normalizeSeasonality(candidate.meta?.seasonality, candidate.meta?.seasonal);
            const segmentKey = cohortSegmentKey(
                shopKey,
                listingType === 'unknown' ? '*' : listingType,
                seasonality === 'unknown' ? '*' : seasonality,
            );
            const keys = [fullCohortMembershipKey(segmentKey)];
            const targetPrice = finiteOrNull(target?.current?.priceMin);
            const targetCurrency = normalizeSpace(target?.current?.currency);
            if (targetPrice !== null && targetCurrency) keys.push(priceBandCohortMembershipKey(segmentKey, targetCurrency, targetPrice));
            keys.forEach((key) => membershipRequestCounts.set(key, (membershipRequestCounts.get(key) || 0) + 1));
        });
        return { groups, memberships: new Map(), distributions: new Map(), membershipRequestCounts, diagnostics };
    }

    function cachedCohortMembership(context, key, source, predicate = null) {
        if (context.memberships.has(key)) return context.memberships.get(key);
        const members = predicate
            ? source.filter((candidate) => predicate(candidate))
            : source;
        if (predicate) context.diagnostics.cohortMemberScans += source.length;
        const listingCounts = new Map();
        members.forEach((candidate) => {
            listingCounts.set(candidate.listingId, (listingCounts.get(candidate.listingId) || 0) + 1);
        });
        const cacheable = (context.membershipRequestCounts.get(key) || 0) > 1;
        const membership = { key, members, listingCounts, cacheable };
        if (cacheable) context.memberships.set(key, membership);
        context.diagnostics.membershipBuilds += 1;
        return membership;
    }

    function cohortMetricValue(name, derived, targetCurrency) {
        if (name === 'revenuePerVisitProxy' && (!targetCurrency || !currenciesComparable(derived?.current?.currency, targetCurrency))) return null;
        return name === 'favoriteRate' ? derived?.favoriteRateSmoothed : derived?.[name];
    }

    function cachedCohortDistributions(context, membership, targetCurrency) {
        const cacheKey = `${membership.key}\u0000currency:${normalizeSpace(targetCurrency)}`;
        if (context.distributions.has(cacheKey)) return context.distributions.get(cacheKey);
        const metricNames = ['visits30', 'favoriteRate', 'salesRateProxy', 'revenuePerVisitProxy', 'sales30'];
        const distributions = {};
        metricNames.forEach((name) => {
            distributions[name] = membership.members
                .map((candidate) => ({
                    listingId: candidate.listingId,
                    value: cohortMetricValue(name, candidate.derived, targetCurrency),
                }))
                .filter((entry) => Number.isFinite(entry.value))
                .sort((left, right) => left.value - right.value);
            context.diagnostics.distributionSorts += 1;
        });
        if (membership.cacheable) context.distributions.set(cacheKey, distributions);
        return distributions;
    }

    function buildCohortBenchmark(record, derivations, context, evaluatedAt, policy) {
        context.diagnostics.benchmarkBuilds += 1;
        const target = derivations.get(record.listingId);
        const targetListingId = String(record.listingId);
        const targetShop = record.meta?.shopKey || shopKeyFromUrl(record.meta?.editUrl);
        const targetType = normalizeListingType(record.meta?.listingType);
        const targetSeasonality = normalizeSeasonality(record.meta?.seasonality, record.meta?.seasonal);
        const segmentKey = cohortSegmentKey(
            targetShop,
            targetType === 'unknown' ? '*' : targetType,
            targetSeasonality === 'unknown' ? '*' : targetSeasonality,
        );
        const reusableGroup = /^etsy-shop:[a-z0-9]+$/.test(targetShop) && Number(target?.stateEpochSpanDays) >= 29
            ? context.groups.get(segmentKey) || [] : [];
        const fullMembership = cachedCohortMembership(context, fullCohortMembershipKey(segmentKey), reusableGroup);
        let membership = fullMembership;
        const targetPrice = finiteOrNull(target?.current?.priceMin);
        const targetCurrency = normalizeSpace(target?.current?.currency);
        let priceBandApplied = false;
        if (targetPrice !== null && targetCurrency) {
            const bandKey = priceBandCohortMembershipKey(segmentKey, targetCurrency, targetPrice);
            const priceBand = cachedCohortMembership(context, bandKey, reusableGroup, (candidate) => {
                return currenciesComparable(candidate.currency, targetCurrency)
                    && candidate.price !== null && candidate.price > 0 && targetPrice > 0 && Math.abs(Math.log(candidate.price / targetPrice)) <= Math.log(1.3);
            });
            const priceBandPeerCount = priceBand.members.length - (priceBand.listingCounts.get(targetListingId) || 0);
            if (priceBandPeerCount >= policy.thresholds.minimumCohortSize) {
                membership = priceBand;
                priceBandApplied = true;
            }
        }
        const cohortSize = membership.members.length - (membership.listingCounts.get(targetListingId) || 0);
        const metricNames = ['visits30', 'favoriteRate', 'salesRateProxy', 'revenuePerVisitProxy', 'sales30'];
        const distributions = cachedCohortDistributions(context, membership, targetCurrency);
        const metrics = {};
        metricNames.forEach((name) => {
            const sorted = [];
            distributions[name].forEach((entry) => {
                if (entry.listingId !== targetListingId) sorted.push(entry.value);
            });
            const reliable = sorted.length >= policy.thresholds.minimumCohortSize;
            metrics[name] = {
                median: medianSorted(sorted), p25: quantileSorted(sorted, 0.25), p75: quantileSorted(sorted, 0.75),
                percentile: percentileRankSorted(sorted, cohortMetricValue(name, target, targetCurrency)), samples: sorted.length,
                reliable,
                strength: reliable ? clamp((sorted.length - HEALTH_RULES.minimumCohortSize + 1) / (HEALTH_RULES.fullStrengthCohortSize - HEALTH_RULES.minimumCohortSize + 1), 0, 1) : 0,
            };
        });
        const reliable = cohortSize >= policy.thresholds.minimumCohortSize;
        const strength = reliable ? clamp((cohortSize - HEALTH_RULES.minimumCohortSize + 1) / (HEALTH_RULES.fullStrengthCohortSize - HEALTH_RULES.minimumCohortSize + 1), 0, 1) : 0;
        const segments = [targetType !== 'unknown' ? targetType : '', targetSeasonality !== 'unknown' ? targetSeasonality : ''].filter(Boolean);
        const limitations = [targetType === 'unknown' ? 'listing-type-unknown' : '', targetSeasonality === 'unknown' ? 'seasonality-unknown' : ''].filter(Boolean);
        return { size: cohortSize, reliable, strength, scope: `${priceBandApplied ? 'active-shop-price-band' : 'active-shop'}${segments.length ? `-${segments.join('-')}` : ''}`, limitations, metrics };
    }

    function bootstrapMetricScore(metric, absoluteScore, percentileWeight = 0.65) {
        const absolute = clamp(Math.round(Number(absoluteScore) || 0), 0, 100);
        if (absolute === 0) return 0;
        const percentile = metric?.reliable ? finiteOrNull(metric.percentile) : null;
        const relativeWeight = clamp(Number(percentileWeight) || 0, 0, 1) * clamp(Number(metric?.strength) || 0, 0, 1);
        return percentile === null || relativeWeight === 0 ? absolute : clamp(Math.round(percentile * relativeWeight + absolute * (1 - relativeWeight)), 0, 100);
    }

    function bootstrapAssessment(record, derived, benchmark, policy) {
        const unavailable = {
            available: false, signal: 'INSUFFICIENT', diagnosis: 'INSUFFICIENT_SIGNAL', code: 'waiting', reasonKey: 'reasonNew',
            score: null, priority: 99, source: 'none', components: {},
        };
        if (!derived?.complete || !derived.current || !Number.isFinite(derived.freshnessDays) || derived.freshnessDays > 1 || derived.anomalies?.length
            || recordListingState(record, derived) !== 'active' || !Number.isFinite(derived.current.stock) || derived.current.stock <= 0) return unavailable;
        const current = derived.current;
        const sales = Number(current.sales); const revenue = Number(current.revenue); const renewals = Number(current.renewals);
        const salesExact = derived.currentExactness?.sales === true;
        const renewalsExact = derived.currentExactness?.renewals === true;
        const minRenewals = HEALTH_RULES.renewalWasteMinimum;
        const provenDemand = (salesExact && sales > 0) || revenue > 0;
        const noDemand = salesExact && sales === 0 && revenue === 0;
        const renewalMature = renewalsExact && renewals >= minRenewals;
        const favorites = derived.currentExactness?.favorites === true ? finiteOrNull(derived.favorites30) : null;
        const exactNoFavorites = favorites === 0;
        const renewalWasteReady = noDemand && renewalMature && exactNoFavorites;
        if (!derived.trafficDecisionReady && !provenDemand && !renewalWasteReady) return unavailable;
        const visits = derived.trafficDecisionReady ? finiteOrNull(derived.visits30) : null;
        const minVisits = Math.max(1, Number(policy.thresholds.minVisitsToImprove) || 1);
        const protectVisits = Math.max(minVisits, Number(policy.thresholds.minVisitsToProtect) || minVisits);
        const visibilityAbsolute = visits === null ? null : clamp((visits / protectVisits) * 100, 0, 100);
        const engagementEligible = derived.reachDecisionReady && visits !== null && visits >= minVisits;
        const smoothedFavoriteRate = derived.reachDecisionReady && visits > 0 ? bayesianRate(favorites, visits) : null;
        const engagementAbsolute = smoothedFavoriteRate === null ? null : clamp((smoothedFavoriteRate / 5) * 100, 0, 100);
        const engagementEvidence = derived.reachDecisionReady && visits !== null ? clamp(visits / minVisits, 0, 1) : 0;
        const engagementWeight = engagementAbsolute === null ? 0 : 35 * engagementEvidence;
        const engagementPercentileWeight = visits === null ? 0 : 0.65 * clamp(visits / protectVisits, 0, 1);
        const visibility = visibilityAbsolute === null ? null : bootstrapMetricScore(benchmark.metrics?.visits30, visibilityAbsolute);
        const engagement = engagementAbsolute === null ? null : bootstrapMetricScore(benchmark.metrics?.favoriteRate, engagementAbsolute, engagementPercentileWeight);
        const weighted = visibility === null ? [] : [{ value: visibility, weight: 65 }];
        if (engagement !== null && engagementWeight > 0) weighted.push({ value: engagement, weight: engagementWeight });
        const weight = weighted.reduce((sum, item) => sum + item.weight, 0);
        const rawScore = weight ? clamp(Math.round(weighted.reduce((sum, item) => sum + item.value * item.weight, 0) / weight), 0, 100) : null;
        const exactZeroReach = visits === 0 && exactNoFavorites;
        const combinedScoreReady = engagement !== null || exactZeroReach;
        const score = combinedScoreReady ? rawScore : null;
        const lowDiscovery = visits !== null && (visits < minVisits || visibility <= 25);
        const decisionFavoriteRate = finiteOrNull(derived.favoriteRateSmoothed);
        const weakEngagement = engagementEligible && (Number(decisionFavoriteRate) < 3 || engagement <= 25);
        const purchaseInterest = engagementEligible && Number(decisionFavoriteRate) >= 5;
        let funnelSignal = 'MIXED'; let diagnosis = 'HEALTHY_OR_MIXED';
        if (visits === 0 && exactNoFavorites) { funnelSignal = 'NO_ACTIVITY'; diagnosis = 'DISCOVERY_WEAK'; }
        else if (lowDiscovery) { funnelSignal = 'WEAK_DISCOVERY'; diagnosis = 'DISCOVERY_WEAK'; }
        else if (weakEngagement) { funnelSignal = 'WEAK_ENGAGEMENT'; diagnosis = 'ENGAGEMENT_WEAK'; }
        else if (engagement !== null && Number(score) >= 70) funnelSignal = 'STRONG_CURRENT';
        const cumulativeSignal = provenDemand ? 'PROVEN_DEMAND' : noDemand && renewalMature && exactNoFavorites ? 'RENEWAL_WASTE' : noDemand ? 'NO_DEMAND' : null;
        let signal = funnelSignal; let code = 'monitor'; let reasonKey = funnelSignal === 'NO_ACTIVITY' ? 'reasonSnapshotNoActivity'
            : funnelSignal === 'WEAK_DISCOVERY' ? 'reasonSnapshotDiscovery'
                : funnelSignal === 'WEAK_ENGAGEMENT' ? 'reasonSnapshotEngagement'
                    : funnelSignal === 'STRONG_CURRENT' ? 'reasonSnapshotStrong' : 'reasonSnapshotMixed';
        let priority = funnelSignal === 'STRONG_CURRENT' ? 4 : 5;
        if (provenDemand) {
            code = 'protected'; reasonKey = 'reasonSnapshotDemand'; priority = 6;
        } else if (renewalWasteReady) {
            signal = 'RENEWAL_WASTE'; diagnosis = lowDiscovery ? 'DISCOVERY_WEAK' : derived.reachDecisionReady ? 'ENGAGEMENT_WEAK' : 'INSUFFICIENT_SIGNAL'; code = 'improve'; reasonKey = 'reasonSnapshotRenewalWaste'; priority = 0;
        } else if (funnelSignal === 'WEAK_DISCOVERY') {
            code = 'improve'; priority = 1;
        } else if (funnelSignal === 'WEAK_ENGAGEMENT') {
            code = 'improve'; priority = 2;
        } else if (noDemand && (purchaseInterest || renewalMature)) {
            signal = 'PURCHASE_FRICTION'; diagnosis = 'PURCHASE_FRICTION'; code = 'improve'; reasonKey = 'reasonSnapshotPurchase'; priority = 3;
        }
        const severity = signal === 'RENEWAL_WASTE' ? renewals
            : signal === 'PURCHASE_FRICTION' ? score
                : code === 'improve' && Number.isFinite(score) ? 100 - score
                    : code === 'improve' && Number.isFinite(visibility) ? 100 - visibility : 0;
        return {
            available: true, signal, funnelSignal, cumulativeSignal, diagnosis, code, reasonKey, score, priority, severity,
            source: benchmark.metrics?.visits30?.reliable ? 'shop-cohort' : 'absolute-thresholds',
            components: { visibility, engagement, engagementEvidence: Math.round(engagementEvidence * 100), smoothedFavoriteRate },
            evidence: { visits, favorites, sales, revenue, renewals },
        };
    }

    function confidenceFor(derived, benchmark, policy) {
        const completeness = Math.round((derived.observedMetrics?.length || 0) / HEALTH_METRIC_FIELDS.length * 100);
        const historyDepth = Math.round(Math.min(100, (Math.min(derived.completeHistorySpanDays || 0, 60) / 60) * 70 + (Math.min(derived.completeSnapshotCount || 0, 3) / 3) * 30));
        const zeroTrafficSnapshots = (derived.history || []).filter((snapshot) => HEALTH_METRIC_FIELDS.every((field) => Number.isFinite(snapshot?.[field]))
            && snapshotCountsAreExact(snapshot, DECISION_COUNT_FIELDS) && snapshot.visits === 0);
        const repeatedZeroEvidence = derived.current?.visits === 0 && zeroTrafficSnapshots.some((left, index) => zeroTrafficSnapshots.slice(index + 1)
            .some((right) => Math.abs(daysBetween(right.at, left.at) || 0) >= HEALTH_RULES.deactivationZeroObservationGapDays));
        const trafficSample = repeatedZeroEvidence ? 100 : Math.round(Math.min(100, ((finiteOrNull(derived.current?.visits) || 0) / Math.max(1, policy.thresholds.minVisitsToProtect)) * 100));
        const cohortStrength = Math.round(clamp(Number(benchmark.metrics?.visits30?.strength) || 0, 0, 1) * 100);
        const freshness = !Number.isFinite(derived.freshnessDays) ? 0 : derived.freshnessDays <= 1 ? 100 : derived.freshnessDays <= 7 ? 75 : derived.freshnessDays <= 30 ? 35 : 0;
        const integrity = Math.max(0, 100 - (derived.anomalies?.length || 0) * 25);
        const components = { dataQuality: completeness, historyDepth, trafficSample, cohortStrength, freshness, dataIntegrity: integrity };
        let score = Math.round(completeness * 0.25 + historyDepth * 0.25 + trafficSample * 0.15 + cohortStrength * 0.10 + freshness * 0.10 + integrity * 0.15);
        const caps = [];
        if (!derived.complete) { score = Math.min(score, 39); caps.push('missing-metrics'); }
        if (!derived.trafficDecisionReady) { score = Math.min(score, 39); caps.push('approximate-traffic-counter'); }
        if (!derived.anchors?.d30Traffic?.complete) { score = Math.min(score, 39); caps.push('insufficient-30-day-history'); }
        else if (!derived.anchors?.d60Traffic?.complete || derived.completeSnapshotCount < 3) { score = Math.min(score, 69); caps.push('insufficient-60-day-history'); }
        if ((derived.anomalies || []).some((item) => /future|currency-mismatch|cumulative-decrease|unverified-metric-scope|revenue-without-sales|stale-observation|negative-/.test(item))) { score = Math.min(score, 39); caps.push('data-integrity'); }
        const band = score < 40 ? 'low' : score < 70 ? 'medium' : score < 85 ? 'high' : 'veryHigh';
        return { score, band, components, caps };
    }

    function decisionPercentile(benchmark, metricName) {
        const metric = benchmark?.metrics?.[metricName];
        return metric?.reliable && Number(metric.strength) >= 1 ? finiteOrNull(metric.percentile) : null;
    }

    function diagnosePerformance(derived, benchmark, policy, confidence) {
        if (!derived.complete || confidence.score < 40) return 'INSUFFICIENT_SIGNAL';
        const visits = derived.visits30; const favoriteRate = derived.favoriteRateSmoothed; const sales = derived.sales30;
        if (benchmark.reliable) {
            const visitsRank = decisionPercentile(benchmark, 'visits30');
            const favoriteRank = decisionPercentile(benchmark, 'favoriteRate');
            const salesRank = decisionPercentile(benchmark, 'salesRateProxy');
            if (Number.isFinite(visitsRank) && visitsRank <= 25) return 'DISCOVERY_WEAK';
            if (Number.isFinite(favoriteRank) && favoriteRank <= 25 && Number.isFinite(visitsRank) && visitsRank >= 40) return 'ENGAGEMENT_WEAK';
            if (((Number.isFinite(sales) && sales === 0) || (Number.isFinite(salesRank) && salesRank <= 25))
                && Number.isFinite(favoriteRank) && favoriteRank >= 50 && Number.isFinite(visitsRank) && visitsRank >= 40) return 'PURCHASE_FRICTION';
            if (Number.isFinite(sales) && sales > 0 && Number.isFinite(salesRank) && salesRank >= 50
                && Number.isFinite(visitsRank) && visitsRank < 50) return 'SCALE_DISCOVERY';
        }
        if (Number(visits) < policy.thresholds.minVisitsToImprove) return 'DISCOVERY_WEAK';
        if (Number.isFinite(favoriteRate) && favoriteRate < 3) return 'ENGAGEMENT_WEAK';
        if (Number.isFinite(sales) && sales === 0 && Number(favoriteRate) >= 5) return 'PURCHASE_FRICTION';
        if (Number.isFinite(sales) && sales > 0 && Number(visits) < policy.thresholds.minVisitsToProtect) return 'SCALE_DISCOVERY';
        return 'HEALTHY_OR_MIXED';
    }

    function deactivationSafeguards(record, derived, confidence, evaluatedAt, policy) {
        const within60 = derived.history.filter((snapshot) => {
            const age = daysBetween(derived.current.at, snapshot.at);
            return Number.isFinite(age) && age >= 0 && age <= HEALTH_RULES.deactivationHistoryDays + 2;
        });
        const exactSafetySnapshots = within60.filter((snapshot) => snapshotCountsAreExact(snapshot, DECISION_COUNT_FIELDS));
        const zeroObservations = exactSafetySnapshots.filter((snapshot) => snapshot.visits === 0 && snapshot.favorites === 0 && snapshot.sales === 0 && snapshot.revenue === 0);
        const currentZeroObservation = derived.deactivationDecisionReady && derived.current.visits === 0 && derived.current.favorites === 0 && derived.current.sales === 0 && derived.current.revenue === 0;
        const separatedZeros = zeroObservations.some((left, index) => zeroObservations.slice(index + 1).some((right) => Math.abs(daysBetween(right.at, left.at) || 0) >= HEALTH_RULES.deactivationZeroObservationGapDays));
        const recentImprovement = [...(record.improvements || [])].reverse().find((entry) => entry?.publishedAt && daysBetween(evaluatedAt, entry.publishedAt) <= HEALTH_RULES.improvementCooldownDays);
        const experiment = activeExperiment(record, evaluatedAt);
        const integrityAnomalies = inspectHistory(within60, evaluatedAt);
        const checks = [
            { key: 'guardExactCounters', passed: derived.deactivationDecisionReady && exactSafetySnapshots.length >= 3 },
            { key: 'guardHistory', passed: derived.deactivationCompleteHistorySpanDays >= 58 && derived.deactivationCompleteSnapshotCount >= 3 },
            { key: 'guardZeroTraffic', passed: currentZeroObservation && zeroObservations.length >= 2 && separatedZeros },
            { key: 'guardNoSales', passed: derived.sales60Raw === 0 && derived.revenue60Raw === 0 && derived.current.sales === 0 && derived.current.revenue === 0 },
            { key: 'guardRenewals', passed: Number(derived.renewals60Raw) >= 1 && Number(derived.current.renewals) >= policy.thresholds.minRenewalsToReview },
            { key: 'guardActiveStock', passed: recordListingState(record, derived) === 'active' && Number(derived.current.stock) > 0 },
            { key: 'guardNoExperiment', passed: !experiment },
            { key: 'guardCooldown', passed: !recentImprovement },
            { key: 'guardSeasonal', passed: normalizeSeasonality(record.meta?.seasonality, record.meta?.seasonal) === 'non-seasonal' },
            { key: 'guardDataIntegrity', passed: integrityAnomalies.length === 0 },
            { key: 'guardConfidence', passed: confidence.score >= 80 },
        ];
        return { checks, passed: checks.every((item) => item.passed), zeroObservationCount: zeroObservations.length };
    }

    function trafficEvidenceSelection(derived) {
        const useExactTrend = derived?.anchors?.trend30?.complete === true;
        return {
            anchor: useExactTrend ? derived.anchors.trend30 : derived?.anchors?.d30,
            percent: useExactTrend ? derived.trendTrafficChangePercent : derived?.trafficChangePercent,
        };
    }

    function evidenceFor(derived, benchmark, bootstrap = null) {
        const evidence = [{ key: 'evidenceHistory', params: { days: Math.round(derived.historySpanDays || 0), count: derived.snapshotCount || 0 } }];
        if (derived.current) {
            evidence.push({ key: 'evidenceCurrentCounters', params: {
                visits: derived.current.visits ?? '—', favorites: derived.current.favorites ?? '—', sales: derived.current.sales ?? '—',
                revenue: derived.current.revenue ?? '—', renewals: derived.current.renewals ?? '—',
            } });
        }
        if (bootstrap?.available && Number.isFinite(bootstrap.score)) evidence.push({
            key: bootstrap.source === 'shop-cohort' ? 'evidenceSnapshotScoreCohort' : 'evidenceSnapshotScoreAbsolute',
            params: { score: bootstrap.score },
        });
        const { anchor: trafficEvidenceAnchor, percent: trafficEvidencePercent } = trafficEvidenceSelection(derived);
        if (trafficEvidenceAnchor?.complete) {
            evidence.push(
                { key: 'evidenceTraffic', params: { current: derived.current?.visits ?? '—', previous: trafficEvidenceAnchor.snapshot?.visits ?? '—', percent: trafficEvidencePercent ?? '—' } },
            );
        }
        if (derived.anchors?.d30?.complete) evidence.push(
            { key: 'evidenceRecentSales', params: { sales: derived.sales30 ?? '—', revenue: derived.revenue30 ?? '—' } },
        );
        if (benchmark.size) evidence.push({ key: 'evidenceCohort', params: { size: benchmark.size, percentile: benchmark.metrics.visits30.percentile ?? '—' } });
        if (derived.anomalies?.length) evidence.push({ key: 'evidenceAnomaly', params: { count: derived.anomalies.length } });
        return evidence;
    }

    function materialTrendGrowth(beforeVisits, afterVisits, changePercent, direction, minimumPercent, policy) {
        if (!direction?.winner) return false;
        const effect = relativeEffectSummary(finiteOrNull(beforeVisits), finiteOrNull(afterVisits));
        if (effect.kind === 'relative') return Number(changePercent) >= minimumPercent;
        if (effect.kind !== 'from-zero') return false;
        const absoluteMinimum = Math.max(
            HEALTH_RULES.zeroBaselineGrowthMinimumVisits,
            Number(policy?.thresholds?.minVisitsToImprove) || 0,
        );
        return Number(afterVisits) >= absoluteMinimum;
    }

    function classifyHealth(record, derived, benchmark, policy, evaluatedAt) {
        const confidence = confidenceFor(derived, benchmark, policy);
        const bootstrap = bootstrapAssessment(record, derived, benchmark, policy);
        const listingState = recordListingState(record, derived);
        const trafficAssessmentEligible = Boolean(derived.complete && derived.trafficDecisionReady && derived.current
            && Number.isFinite(derived.freshnessDays) && derived.freshnessDays <= 1
            && !confidence.caps.includes('data-integrity') && listingState === 'active'
            && Number.isFinite(derived.current.stock) && derived.current.stock > 0);
        const assessmentEligible = trafficAssessmentEligible;
        const longitudinalReady = Boolean(trafficAssessmentEligible && derived.anchors?.d30Traffic?.complete);
        const diagnosis = longitudinalReady && assessmentEligible ? diagnosePerformance(derived, benchmark, policy, confidence) : bootstrap.diagnosis;
        const deactivation = derived.current ? deactivationSafeguards(record, derived, confidence, evaluatedAt, policy) : { checks: [], passed: false };
        const experiment = activeExperiment(record, evaluatedAt);
        const inactive = Boolean(listingState && listingState !== 'active');
        const recentTrafficExact = derived.anchors?.trend30?.complete
            && snapshotCountsAreExact(derived.anchors.trend30.snapshot, ['visits']) && snapshotCountsAreExact(derived.current, ['visits']);
        const priorTrafficExact = derived.anchors?.priorTrend30?.complete
            && snapshotCountsAreExact(derived.anchors.priorTrend30.snapshot, ['visits']) && snapshotCountsAreExact(derived.anchors.trend30?.snapshot, ['visits']);
        const recentTrafficDirection = recentTrafficExact
            ? separatedRateDirection(derived.anchors?.trend30?.snapshot?.visits, 30, derived.current?.visits, 30)
            : { comparison: null, winner: false, underperformed: false };
        const priorTrafficDirection = priorTrafficExact
            ? separatedRateDirection(derived.anchors?.priorTrend30?.snapshot?.visits, 30, derived.anchors?.trend30?.snapshot?.visits, 30)
            : { comparison: null, winner: false, underperformed: false };
        const persistentGrowth = materialTrendGrowth(
            derived.anchors?.trend30?.snapshot?.visits, derived.current?.visits,
            derived.trendTrafficChangePercent, recentTrafficDirection, 15, policy,
        ) && materialTrendGrowth(
            derived.anchors?.priorTrend30?.snapshot?.visits, derived.anchors?.trend30?.snapshot?.visits,
            derived.priorTrendTrafficChangePercent, priorTrafficDirection, 5, policy,
        );
        const persistentDecline = Number(derived.trendTrafficChangePercent) <= -policy.thresholds.declinePercent && Number(derived.priorTrendTrafficChangePercent) <= -10
            && recentTrafficDirection.underperformed && priorTrafficDirection.underperformed;
        const recentStrength = Number(derived.sales30) >= 2 || Number(derived.salesRateProxy) >= 2 || Number(derived.revenue30) > 0;
        let lifecycle = 'ACTIVE_STABLE';
        if (record.unsupportedSchema || !derived.current || !derived.complete || !listingState || confidence.caps.includes('data-integrity')) lifecycle = 'DATA_GAP';
        else if (inactive) lifecycle = 'INACTIVE';
        else if (experiment) lifecycle = 'EXPERIMENT_RUNNING';
        else if (deactivation.passed) lifecycle = 'DEACTIVATION_REVIEW';
        else if (derived.snapshotCount === 1) lifecycle = 'BASELINE';
        else if (persistentGrowth) lifecycle = 'ACTIVE_GROWING';
        else if (persistentDecline && recentStrength) lifecycle = 'PROTECTED';
        else if (persistentDecline) lifecycle = 'ACTIVE_DECLINING';
        else if (recentStrength) lifecycle = 'PROTECTED';
        else if (!derived.anchors.d30Traffic.complete) lifecycle = 'LEARNING';
        else if (confidence.score < 40 || diagnosis === 'INSUFFICIENT_SIGNAL') lifecycle = 'DATA_GAP';
        else if (derived.deactivationDecisionReady && derived.current.visits === 0 && derived.current.favorites === 0
            && Number.isFinite(derived.sales60Raw) && Number.isFinite(derived.revenue60Raw)
            && derived.sales60Raw === 0 && derived.revenue60Raw === 0) lifecycle = 'DORMANT';

        const weakDiagnoses = new Set(['DISCOVERY_WEAK', 'ENGAGEMENT_WEAK', 'PURCHASE_FRICTION']);
        const legacyByLifecycle = {
            DATA_GAP: 'waiting', BASELINE: 'waiting', LEARNING: 'waiting', ACTIVE_GROWING: 'growing', ACTIVE_DECLINING: 'declining',
            PROTECTED: 'protected', EXPERIMENT_RUNNING: 'monitor', DORMANT: 'improve', DEACTIVATION_REVIEW: 'deactivateReview', INACTIVE: 'monitor', ACTIVE_STABLE: weakDiagnoses.has(diagnosis) ? 'improve' : 'monitor',
        };
        const bootstrapLifecycle = ['BASELINE', 'LEARNING'].includes(lifecycle) && bootstrap.available;
        const code = bootstrapLifecycle ? bootstrap.code : legacyByLifecycle[lifecycle] || 'waiting';
        let tone = {
            ACTIVE_GROWING: 'success', PROTECTED: 'success', ACTIVE_STABLE: 'balanced', EXPERIMENT_RUNNING: 'balanced',
            ACTIVE_DECLINING: 'danger', DEACTIVATION_REVIEW: 'danger', DORMANT: 'warning',
        }[lifecycle] || 'neutral';
        if (bootstrapLifecycle) {
            const currentProblem = ['DISCOVERY_WEAK', 'ENGAGEMENT_WEAK', 'PURCHASE_FRICTION'].includes(bootstrap.diagnosis);
            tone = currentProblem ? 'warning' : bootstrap.funnelSignal === 'STRONG_CURRENT' ? 'success' : 'balanced';
        }
        const reasonKey = bootstrapLifecycle ? bootstrap.reasonKey : ({
            DATA_GAP: 'reasonUnknown', BASELINE: 'reasonNew', LEARNING: 'reasonLearning', ACTIVE_GROWING: 'reasonGrowth', ACTIVE_DECLINING: 'reasonDecline',
            PROTECTED: 'reasonProtect', EXPERIMENT_RUNNING: 'reasonExperiment', DORMANT: 'reasonDormant', DEACTIVATION_REVIEW: 'reasonDeactivateSafe', INACTIVE: 'reasonInactive', ACTIVE_STABLE: weakDiagnoses.has(diagnosis) ? 'reasonImproveTraffic' : 'reasonMonitor',
        }[lifecycle] || 'reasonMonitor');
        const nextReviewAt = lifecycle === 'EXPERIMENT_RUNNING' ? experiment.experiment?.evaluateAt : addDays(evaluatedAt, lifecycle === 'DEACTIVATION_REVIEW' ? 7 : lifecycle === 'DATA_GAP' ? 1 : 30);
        const assessmentMode = longitudinalReady ? 'longitudinal' : bootstrap.available ? 'snapshot' : 'insufficient';
        const currentAssessment = assessmentEligible && bootstrap.available ? bootstrap : null;
        const score = currentAssessment?.score ?? null;
        const deactivationEligible = Boolean(derived.complete && derived.deactivationDecisionReady && derived.current
            && Number.isFinite(derived.freshnessDays) && derived.freshnessDays <= 1
            && !confidence.caps.includes('data-integrity') && listingState === 'active'
            && Number.isFinite(derived.current.stock) && derived.current.stock > 0);
        const deactivationHistoryReady = Boolean(deactivationEligible
            && deactivation.checks.find((item) => item.key === 'guardExactCounters')?.passed
            && deactivation.checks.find((item) => item.key === 'guardHistory')?.passed);
        const trendInferenceReady = Boolean(longitudinalReady && recentTrafficDirection.comparison && priorTrafficDirection.comparison);
        const selectedTrafficEvidence = trafficEvidenceSelection(derived);
        return {
            algorithmVersion: HEALTH_ENGINE_VERSION, lifecycle, diagnosis, code, tone, reasonKey,
            reasonParams: { renewals: bootstrapLifecycle ? bootstrap.evidence.renewals : policy.thresholds.minRenewalsToReview, percent: policy.thresholds.declinePercent },
            score, assessmentMode, scoreBasis: Number.isFinite(score) ? 'current-30d-reach-engagement' : 'insufficient',
            currentAssessment, bootstrap: assessmentMode === 'snapshot' ? bootstrap : null,
            readiness: { snapshot: bootstrap.available, trend: trendInferenceReady, deactivationHistory: deactivationHistoryReady },
            confidence: confidence.score, confidenceBand: confidence.band, confidenceComponents: confidence.components, confidenceCaps: confidence.caps,
            derived: {
                visits30: derived.visits30 ?? null, favorites30: derived.favorites30 ?? null, favoriteRate: derived.favoriteRate ?? null,
                sales30: derived.sales30 ?? null, revenue30: derived.revenue30 ?? null, renewals30: derived.renewals30 ?? null,
                current: derived.current ? Object.fromEntries(HEALTH_METRIC_FIELDS.map((field) => [field, derived.current[field] ?? null])) : null,
                sales60: derived.sales60 ?? null, revenue60: derived.revenue60 ?? null, renewals60: derived.renewals60 ?? null,
                salesRateProxy: derived.salesRateProxy ?? null, revenuePerVisitProxy: derived.revenuePerVisitProxy ?? null,
                trafficChangePercent: derived.trafficChangePercent ?? null, previousTrafficChangePercent: derived.priorTrafficChangePercent ?? null,
                trendTrafficChangePercent: derived.trendTrafficChangePercent ?? null,
                previousTrendTrafficChangePercent: derived.priorTrendTrafficChangePercent ?? null,
                historySpanDays: Math.round(derived.historySpanDays || 0), completeHistorySpanDays: Math.round(derived.completeHistorySpanDays || 0), snapshotCount: derived.snapshotCount || 0,
                stateEpochStartAt: derived.stateEpochStartAt || null, stateEpochSpanDays: Math.round(derived.stateEpochSpanDays || 0),
                exactness: { ...(derived.currentExactness || {}) },
                trendIntervals: { recent: recentTrafficDirection.comparison, prior: priorTrafficDirection.comparison },
                anchors: Object.fromEntries(Object.entries(derived.anchors || {}).map(([key, anchor]) => [key, anchor?.snapshot ? { at: anchor.snapshot.at, actualDays: Math.round(anchor.actualDays * 10) / 10 } : null])),
            },
            benchmark, evidence: evidenceFor(derived, benchmark, bootstrap), safeguards: deactivation.checks, anomalies: derived.anomalies || [], historicalAnomalies: derived.historicalAnomalies || [], experiment: experiment?.experiment || null,
            deltas: derived.deltas || {}, declinePercent: Number(selectedTrafficEvidence.percent) < 0 ? Math.abs(Math.round(selectedTrafficEvidence.percent)) : 0,
            nextReviewAt, calculatedAt: evaluatedAt,
        };
    }

    function evaluateHealthRecords(records, settings = DEFAULT_SETTINGS, evaluatedAt = nowIso(), diagnostics = null) {
        const policy = healthPolicy(settings);
        const normalized = records.map((record) => normalizeRecord(record, record?.listingId)).filter(Boolean);
        const derivations = new Map(normalized.map((record) => [record.listingId, deriveRecordMetrics(record, evaluatedAt)]));
        const cohortContext = createCohortContext(normalized, derivations, evaluatedAt);
        const output = new Map();
        normalized.forEach((record) => {
            const derived = derivations.get(record.listingId);
            const benchmark = buildCohortBenchmark(record, derivations, cohortContext, evaluatedAt, policy);
            const result = classifyHealth(record, derived, benchmark, policy, evaluatedAt);
            output.set(record.listingId, {
                schemaVersion: HEALTH_RESULT_SCHEMA_VERSION, engineVersion: HEALTH_ENGINE_VERSION,
                policy, input: { latestAt: derived.current?.at || null, anchor30At: derived.anchors?.d30?.snapshot?.at || null, anchor60At: derived.anchors?.d60?.snapshot?.at || null, observedMetrics: derived.observedMetrics || [] },
                result, calculatedAt: evaluatedAt,
            });
        });
        if (diagnostics && typeof diagnostics === 'object') Object.assign(diagnostics, cohortContext.diagnostics);
        return output;
    }

    function analyseRecord(record, allRecords = [record], evaluatedAt = nowIso()) {
        return evaluateHealthRecords(allRecords?.length ? allRecords : [record], state.settings, evaluatedAt).get(String(record.listingId))?.result || {
            algorithmVersion: HEALTH_ENGINE_VERSION, lifecycle: 'DATA_GAP', diagnosis: 'INSUFFICIENT_SIGNAL', code: 'waiting', tone: 'neutral', reasonKey: 'reasonUnknown', deltas: {}, confidence: 0, confidenceBand: 'low', calculatedAt: evaluatedAt,
        };
    }

    function analysisLabel(code) {
        return t({ growing: 'growing', protected: 'protected', improve: 'improve', deactivateReview: 'deactivateReview', declining: 'declining', monitor: 'monitor' }[code] || 'waiting');
    }

    function lifecycleLabel(lifecycle) {
        return t({ DATA_GAP: 'lifecycleDataGap', BASELINE: 'lifecycleBaseline', LEARNING: 'lifecycleLearning', ACTIVE_STABLE: 'lifecycleStable', ACTIVE_GROWING: 'lifecycleGrowing', ACTIVE_DECLINING: 'lifecycleDeclining', PROTECTED: 'lifecycleProtected', EXPERIMENT_RUNNING: 'lifecycleExperiment', DORMANT: 'lifecycleDormant', DEACTIVATION_REVIEW: 'lifecycleDeactivate', INACTIVE: 'lifecycleInactive' }[lifecycle] || 'lifecycleDataGap');
    }

    function diagnosisLabel(diagnosis) {
        return t({ DISCOVERY_WEAK: 'diagnosisDiscovery', ENGAGEMENT_WEAK: 'diagnosisEngagement', PURCHASE_FRICTION: 'diagnosisPurchase', SCALE_DISCOVERY: 'diagnosisScale', HEALTHY_OR_MIXED: 'diagnosisHealthy', INSUFFICIENT_SIGNAL: 'diagnosisInsufficient' }[diagnosis] || 'diagnosisInsufficient');
    }

    function assessmentLabel(analysis) {
        if (analysis?.assessmentMode !== 'snapshot') return diagnosisLabel(analysis?.diagnosis);
        return t({
            RENEWAL_WASTE: 'snapshotRenewalWaste', WEAK_DISCOVERY: 'snapshotWeakDiscovery', WEAK_ENGAGEMENT: 'snapshotWeakEngagement',
            PURCHASE_FRICTION: 'snapshotPurchaseFriction', PROVEN_DEMAND: 'snapshotProvenDemand', STRONG_CURRENT: 'snapshotStrongCurrent',
            MIXED: 'snapshotMixed', NO_ACTIVITY: 'snapshotNoActivity', INSUFFICIENT: 'snapshotInsufficient',
        }[analysis.bootstrap?.signal] || 'snapshotInsufficient');
    }

    function analysisScoreLabel(analysis) {
        return t('currentFunnelScore');
    }

    function analysisConfidenceLabel(analysis) {
        return t(analysis?.assessmentMode === 'snapshot' ? 'historyConfidence' : 'analysisConfidence');
    }

    function confidenceLabel(band) { return t({ low: 'confidenceLow', medium: 'confidenceMedium', high: 'confidenceHigh', veryHigh: 'confidenceVeryHigh' }[band] || 'confidenceLow'); }

    function normalizeAnalysisFilters(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const allowed = {
            scope: ['all', 'page'],
            lifecycle: ['', 'DATA_GAP', 'BASELINE', 'LEARNING', 'ACTIVE_STABLE', 'ACTIVE_GROWING', 'ACTIVE_DECLINING', 'PROTECTED', 'EXPERIMENT_RUNNING', 'DORMANT', 'DEACTIVATION_REVIEW', 'INACTIVE'],
            diagnosis: ['', 'DISCOVERY_WEAK', 'ENGAGEMENT_WEAK', 'PURCHASE_FRICTION', 'SCALE_DISCOVERY', 'HEALTHY_OR_MIXED', 'INSUFFICIENT_SIGNAL'],
            recommendation: ['', 'improve', 'declining', 'deactivateReview', 'protected', 'monitor', 'waiting', 'growing'],
            performance: ['', 'sales', 'traffic-no-sales', 'no-activity', 'missing'],
            trend: ['', 'rising', 'falling', 'stable', 'unknown'],
            stock: ['', 'in', 'out', 'unknown'],
            confidence: ['', 'low', 'medium', 'high'],
            sort: ['priority', 'score', 'visits', 'sales', 'revenue', 'confidence', 'title'],
        };
        return Object.fromEntries(Object.entries(DEFAULT_ANALYSIS_FILTERS).map(([key, fallback]) => {
            const value = String(source[key] ?? fallback);
            return [key, allowed[key].includes(value) ? value : fallback];
        }));
    }

    function normalizeFilterPresets(raw) {
        const source = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
        const names = new Set();
        const ids = new Set();
        return source.map((item, sourceIndex) => {
            if (!item || typeof item !== 'object') return null;
            const name = normalizeSpace(item.name).slice(0, 32);
            const folded = presetNameFold(name);
            const validId = /^preset-[a-z0-9-]{6,80}$/i.test(String(item.id || ''));
            const legacyIdentity = fnv1a(JSON.stringify({
                sourceIndex,
                name,
                filters: item.filters || item.filter || item.criteria || {},
                query: item.query || item.search || '',
                createdAt: validTime(item.createdAt) || 0,
                updatedAt: validTime(item.updatedAt) || 0,
            }));
            let id = validId ? String(item.id) : `preset-legacy-${legacyIdentity}`;
            while (ids.has(id)) {
                if (validId) return null;
                id = `preset-legacy-${legacyIdentity}-${sourceIndex}`;
                if (ids.has(id)) return null;
            }
            if (name.length < 2 || names.has(folded)) return null;
            names.add(folded);
            ids.add(id);
            const legacy = item.filters && typeof item.filters === 'object' ? item.filters
                : item.filter && typeof item.filter === 'object' ? item.filter
                    : item.criteria && typeof item.criteria === 'object' ? item.criteria : {};
            const recommendation = String(legacy.recommendation || item.recommendation || '');
            const lifecycleAliases = {
                growing: 'ACTIVE_GROWING', declining: 'ACTIVE_DECLINING', deactivateReview: 'DEACTIVATION_REVIEW',
                protected: 'PROTECTED', experiments: 'EXPERIMENT_RUNNING', missing: 'DATA_GAP',
            };
            const migratedFilters = {
                ...legacy,
                scope: legacy.scope ?? legacy.range,
                lifecycle: legacy.lifecycle ?? legacy.status ?? lifecycleAliases[recommendation],
                diagnosis: legacy.diagnosis ?? legacy.issue,
                recommendation: legacy.recommendation ?? recommendation,
                performance: legacy.performance,
                trend: legacy.trend ?? legacy.change,
                stock: legacy.stock ?? legacy.availability,
                confidence: legacy.confidence ?? legacy.dataConfidence,
                sort: legacy.sort ?? legacy.order,
            };
            return {
                id,
                name,
                filters: normalizeAnalysisFilters(migratedFilters),
                query: normalizeSpace(item.query).slice(0, 120) || normalizeSpace(item.search).slice(0, 120),
                createdAt: validTime(item.createdAt) ? new Date(validTime(item.createdAt)).toISOString() : '1970-01-01T00:00:00.000Z',
                updatedAt: validTime(item.updatedAt) ? new Date(validTime(item.updatedAt)).toISOString() : '1970-01-01T00:00:00.000Z',
            };
        }).filter(Boolean).slice(-MAX_FILTER_PRESETS);
    }

    function analysisFilterCount(filters = state.analysisFilters) {
        const normalized = normalizeAnalysisFilters(filters);
        return ['scope', 'lifecycle', 'diagnosis', 'recommendation', 'performance', 'trend', 'stock', 'confidence']
            .filter((key) => normalized[key] !== DEFAULT_ANALYSIS_FILTERS[key]).length;
    }

    function recordTrendDirection(record) {
        const analysis = record.analysis || record.health?.result || {};
        if (analysis.lifecycle === 'ACTIVE_GROWING') return 'rising';
        if (analysis.lifecycle === 'ACTIVE_DECLINING') return 'falling';
        const deltas = analysis.deltas || {};
        const weighted = [['sales', 4], ['revenue', 4], ['visits', 2], ['favorites', 2]]
            .map(([key, weight]) => {
                const value = finiteOrNull(deltas[key]);
                return value === null ? null : Math.sign(value) * weight;
            })
            .filter(Number.isFinite);
        if (!weighted.length) return 'unknown';
        const total = weighted.reduce((sum, value) => sum + value, 0);
        if (total > 0) return 'rising';
        if (total < 0) return 'falling';
        return 'stable';
    }

    function recentPerformanceMetrics(record) {
        const derived = record?.analysis?.derived || record?.health?.result?.derived || {};
        const latest = record?.history?.at(-1) || {};
        const recentOrGuaranteedZero = (recent, cumulative, exact) => {
            const value = finiteOrNull(recent);
            if (value !== null) return value;
            return exact && finiteOrNull(cumulative) === 0 ? 0 : null;
        };
        const verifiedContract = normalizeMetricContract(latest.metricContract);
        return {
            visits: finiteOrNull(derived.visits30),
            favorites: finiteOrNull(derived.favorites30),
            sales: recentOrGuaranteedZero(derived.sales30, latest.sales, snapshotCountsAreExact(latest, ['sales'])),
            revenue: recentOrGuaranteedZero(derived.revenue30, latest.revenue, Boolean(verifiedContract)),
            renewals: recentOrGuaranteedZero(derived.renewals30, latest.renewals, snapshotCountsAreExact(latest, ['renewals'])),
        };
    }

    const ANALYSIS_FACET_NAMES = Object.freeze(Object.keys(FILTER_FACET_VALUES));

    function analysisCaseFold(value, language = state.settings.language) {
        const locale = language === 'tr' ? 'tr-TR' : 'en-US';
        return String(value ?? '').normalize('NFKC').toLocaleLowerCase(locale);
    }

    function presetNameFold(value) {
        // Preset identity is durable data, so it must not change with the UI locale.
        return normalizeSpace(value).normalize('NFKC').toLowerCase();
    }

    function scheduleAnalysisSearch(previousTimer, callback) {
        if (previousTimer !== null) clearTimeout(previousTimer);
        return setTimeout(callback, ANALYSIS_SEARCH_DEBOUNCE_MS);
    }

    function analysisRecordFacts(record, foldedQuery, pageIds) {
        const latest = record.history?.at(-1) || {};
        const analysis = record.analysis || record.health?.result || {};
        const recent = recentPerformanceMetrics(record);
        const activityFields = ['visits', 'favorites', 'sales', 'revenue'];
        const recentMissing = activityFields.some((field) => recent[field] === null);
        const unreadCurrentMetric = HEALTH_METRIC_FIELDS.some((field) => finiteOrNull(latest[field]) === null);
        const performance = [''];
        if (recent.sales !== null && recent.sales > 0) performance.push('sales');
        if (recent.visits > 0 && recent.sales === 0) performance.push('traffic-no-sales');
        if (!recentMissing && activityFields.every((field) => recent[field] === 0)) performance.push('no-activity');
        if (recentMissing || unreadCurrentMetric || analysis.lifecycle === 'DATA_GAP') performance.push('missing');
        const stock = finiteOrNull(latest.stock);
        const band = analysis.confidenceBand || 'low';
        const confidence = ['high', 'veryHigh'].includes(band) ? 'high' : band === 'medium' ? 'medium' : 'low';
        const values = {
            scope: ['all', ...(pageIds?.has(String(record.listingId)) ? ['page'] : [])],
            lifecycle: ['', String(analysis.lifecycle || '')],
            diagnosis: ['', String(analysis.diagnosis || '')],
            recommendation: ['', String(analysis.code || '')],
            performance,
            trend: ['', recordTrendDirection(record)],
            stock: ['', stock === null ? 'unknown' : stock > 0 ? 'in' : 'out'],
            confidence: ['', confidence],
        };
        return {
            queryMatches: !foldedQuery || analysisCaseFold(`${record.listingId} ${record.meta?.title || ''} ${record.meta?.sku || ''}`).includes(foldedQuery),
            values: Object.fromEntries(Object.entries(values).map(([facet, matches]) => [facet, new Set(matches)])),
        };
    }

    function analysisFactsForRecords(records, query, pageIds) {
        const foldedQuery = analysisCaseFold(normalizeSpace(query));
        return records.map((record) => ({ record, facts: analysisRecordFacts(record, foldedQuery, pageIds) }));
    }

    function recordMatchesAnalysisFilters(record, filters, query, pageIds, facts = null) {
        const normalized = normalizeAnalysisFilters(filters);
        const resolved = facts || analysisRecordFacts(record, analysisCaseFold(normalizeSpace(query)), pageIds);
        return resolved.queryMatches && ANALYSIS_FACET_NAMES.every((facet) => resolved.values[facet].has(normalized[facet]));
    }

    function analysisFacetCountsFromFacts(factRows, filters, diagnostics = null) {
        const normalized = normalizeAnalysisFilters(filters);
        const counts = Object.fromEntries(Object.entries(FILTER_FACET_VALUES).map(([facet, values]) => [facet, Object.fromEntries(values.map((value) => [value, 0]))]));
        factRows.forEach(({ facts }) => {
            if (diagnostics && typeof diagnostics === 'object') diagnostics.recordsScanned = Number(diagnostics.recordsScanned || 0) + 1;
            if (!facts.queryMatches) return;
            const failedFacets = ANALYSIS_FACET_NAMES.filter((facet) => !facts.values[facet].has(normalized[facet]));
            ANALYSIS_FACET_NAMES.forEach((facet) => {
                if (failedFacets.length > 1 || (failedFacets.length === 1 && failedFacets[0] !== facet)) return;
                facts.values[facet].forEach((value) => {
                    if (Object.prototype.hasOwnProperty.call(counts[facet], value)) counts[facet][value] += 1;
                });
            });
        });
        return counts;
    }

    function analysisFacetCounts(records, filters, query, pageIds, diagnostics = null) {
        return analysisFacetCountsFromFacts(analysisFactsForRecords(records, query, pageIds), filters, diagnostics);
    }

    function presetResultCount(preset, records = collectedAnalysisRecords()) {
        const filters = normalizeAnalysisFilters({ ...DEFAULT_ANALYSIS_FILTERS, ...(preset?.filters || {}) });
        const query = normalizeSpace(preset?.query);
        const pageIds = new Set(state.pageListings.map((item) => String(item.listingId)));
        return records.filter((record) => recordMatchesAnalysisFilters(record, filters, query, pageIds)).length;
    }

    function analysisPresetIsActive(preset) {
        const targetFilters = normalizeAnalysisFilters({ ...DEFAULT_ANALYSIS_FILTERS, ...(preset?.filters || {}) });
        return JSON.stringify(targetFilters) === JSON.stringify(normalizeAnalysisFilters(state.analysisFilters))
            && normalizeSpace(preset?.query) === normalizeSpace(state.analysisQuery);
    }

    function sortAnalysisRecords(records, sort = state.analysisFilters.sort) {
        const latestValue = (record, key) => finiteOrNull(record.history?.at(-1)?.[key]) ?? Number.NEGATIVE_INFINITY;
        const scoreValue = (record) => finiteOrNull(record.analysis?.score) ?? Number.NEGATIVE_INFINITY;
        const priority = { deactivateReview: 0, declining: 1, improve: 2, waiting: 3, growing: 4, monitor: 5, protected: 6 };
        const output = [...records];
        output.sort((left, right) => {
            if (sort === 'title') return String(left.meta?.title || '').localeCompare(String(right.meta?.title || ''), state.settings.language);
            if (sort === 'confidence') return Number(right.analysis?.confidence || 0) - Number(left.analysis?.confidence || 0);
            if (sort === 'score') return scoreValue(right) - scoreValue(left) || String(left.listingId).localeCompare(String(right.listingId));
            if (['visits', 'sales', 'revenue'].includes(sort)) return latestValue(right, sort) - latestValue(left, sort);
            const difference = (priority[left.analysis?.code] ?? 99) - (priority[right.analysis?.code] ?? 99);
            if (difference) return difference;
            if (left.analysis?.code === 'improve') {
                const leftAssessment = left.analysis?.currentAssessment || left.analysis?.bootstrap;
                const rightAssessment = right.analysis?.currentAssessment || right.analysis?.bootstrap;
                const bootstrapPriority = Number(leftAssessment?.priority ?? 99) - Number(rightAssessment?.priority ?? 99);
                if (bootstrapPriority) return bootstrapPriority;
                const bootstrapSeverity = Number(rightAssessment?.severity ?? 0) - Number(leftAssessment?.severity ?? 0);
                if (bootstrapSeverity) return bootstrapSeverity;
                const scoreDifference = scoreValue(left) - scoreValue(right);
                if (scoreDifference) return scoreDifference;
            }
            return Number(right.analysis?.confidence || 0) - Number(left.analysis?.confidence || 0)
                || scoreValue(right) - scoreValue(left) || String(left.listingId).localeCompare(String(right.listingId));
        });
        return output;
    }

    function readableCalibrationRows(records = null, evaluatedAt = nowIso()) {
        const candidates = Array.isArray(records) ? records : (analysisCollectionIsFresh() ? collectedAnalysisRecords() : []);
        return candidates.map((candidate) => {
            const record = normalizeRecord(candidate, candidate?.listingId);
            const derived = record ? deriveRecordMetrics(record, evaluatedAt) : null;
            return { record, derived };
        }).filter(({ record, derived }) => {
            const recentChange = [...(record?.improvements || [])].reverse().find((entry) => entry?.publishedAt
                && daysBetween(evaluatedAt, entry.publishedAt) <= HEALTH_RULES.improvementCooldownDays);
            return record && derived?.complete && derived.trafficDecisionReady && derived.anchors?.d30Traffic?.complete
                && Number.isFinite(derived.freshnessDays) && derived.freshnessDays <= 1 && !derived.anomalies?.length
                && Number.isFinite(derived.visits30) && Number.isFinite(derived.sales30)
                && recordListingState(record, derived) === 'active'
                && !activeExperiment(record, evaluatedAt) && !recentChange;
        });
    }

    function thresholdImpactCounts(records = null, values = state.settings, evaluatedAt = nowIso()) {
        const readable = readableCalibrationRows(records, evaluatedAt);
        const thresholds = normalizeHealthThresholds(values);
        return {
            improve: readable.filter(({ derived }) => derived.sales30 === 0 && derived.visits30 >= thresholds.minVisitsToImprove).length,
            protect: readable.filter(({ derived }) => derived.sales30 > 0 && derived.visits30 >= thresholds.minVisitsToProtect).length,
        };
    }

    function thresholdCalibration(records = null, evaluatedAt = nowIso()) {
        const readable = readableCalibrationRows(records, evaluatedAt);
        if (readable.length < HEALTH_RULES.minimumCalibrationSize) return { available: false, sampleSize: readable.length, values: null };
        const visits = readable.map(({ derived }) => finiteOrNull(derived.visits30)).filter(Number.isFinite);
        const noSaleVisits = readable.filter(({ derived }) => derived.sales30 === 0)
            .map(({ derived }) => finiteOrNull(derived.visits30)).filter((value) => Number.isFinite(value) && value > 0);
        const sellingVisits = readable.filter(({ derived }) => Number(derived.sales30) > 0)
            .map(({ derived }) => finiteOrNull(derived.visits30)).filter(Number.isFinite);
        const dormantRenewals = readable.filter(({ derived }) => derived.currentExactness?.renewals === true && derived.anchors?.d60?.complete
            && derived.sales60Raw === 0 && derived.revenue60Raw === 0
            && derived.current?.sales === 0 && derived.current?.revenue === 0)
            .map(({ derived }) => finiteOrNull(derived.current?.renewals)).filter(Number.isFinite);
        const declines = readable.map(({ derived }) => finiteOrNull(derived.trendTrafficChangePercent))
            .filter((value) => Number.isFinite(value) && value < 0).map(Math.abs);
        const enough = (values) => values.length >= HEALTH_RULES.minimumCalibrationGroupSize;
        const improve = enough(noSaleVisits) ? Math.max(10, Math.round(quantile(noSaleVisits, 0.75))) : DEFAULT_SETTINGS.minVisitsToImprove;
        const protectBase = enough(sellingVisits) ? Math.round(quantile(sellingVisits, 0.50)) : DEFAULT_SETTINGS.minVisitsToProtect;
        const groupSizes = { noSaleVisits: noSaleVisits.length, sellingVisits: sellingVisits.length, dormantRenewals: dormantRenewals.length, declines: declines.length };
        const calibratedFields = {
            minVisitsToImprove: enough(noSaleVisits), minVisitsToProtect: enough(sellingVisits),
            minRenewalsToReview: enough(dormantRenewals), declinePercent: enough(declines),
        };
        const values = normalizeHealthThresholds({
            minVisitsToImprove: improve,
            minVisitsToProtect: Math.max(improve + 10, protectBase),
            minRenewalsToReview: enough(dormantRenewals) ? clamp(Math.round(median(dormantRenewals)), 2, 10) : DEFAULT_SETTINGS.minRenewalsToReview,
            declinePercent: enough(declines) ? clamp(Math.round(quantile(declines, 0.75)), 20, 60) : DEFAULT_SETTINGS.declinePercent,
        });
        return {
            available: true,
            sampleSize: readable.length,
            groupSizes,
            calibratedFields,
            values,
        };
    }

    function activeObservedImprovement(record) {
        return [...(Array.isArray(record?.improvements) ? record.improvements : [])].reverse().find((entry) => (
            entry?.action === 'UPDATE' && entry?.status === 'published' && entry?.experiment?.state === 'observing'
        )) || null;
    }

    function proposalExperimentOverlap(record) {
        const improvement = activeObservedImprovement(record);
        return improvement ? {
            improvementId: String(improvement.id || ''),
            primaryMetric: String(improvement.experiment?.primaryMetric || ''),
            evaluateAt: String(improvement.experiment?.evaluateAt || ''),
        } : null;
    }

    function collectedAnalysisRecords(records = state.records) {
        const collectedIds = new Set((state.collection?.uniqueIds || []).map(String));
        return records.filter((record) => collectedIds.has(String(record.listingId)));
    }

    function selectedCurrentCollectionRecords() {
        if (!analysisCollectionIsFresh()) return [];
        return collectedAnalysisRecords().filter((record) => state.selectedIds.has(String(record.listingId)));
    }

    function pruneSelectionToCollection() {
        const allowed = new Set((state.collection?.status === 'completed' ? state.collection.uniqueIds : []).map(String));
        [...state.selectedIds].forEach((listingId) => { if (!allowed.has(String(listingId))) state.selectedIds.delete(listingId); });
    }

    function filteredAnalysisRecords(records = collectedAnalysisRecords(), factRows = null) {
        const rows = factRows || analysisFactsForRecords(
            records,
            normalizeSpace(state.analysisQuery),
            new Set(state.pageListings.map((item) => String(item.listingId))),
        );
        return sortAnalysisRecords(
            rows.filter(({ record, facts }) => recordMatchesAnalysisFilters(record, state.analysisFilters, '', null, facts)).map(({ record }) => record),
            state.analysisFilters.sort,
        );
    }

    function experimentStateLabel(experiment) {
        if (!experiment) return '—';
        const key = { planned: 'experimentPlanned', observing: 'experimentObserving', winner: 'experimentWinner', underperformed: 'experimentUnderperformed', inconclusive: 'experimentInconclusive', contaminated: 'experimentContaminated', stopped: 'experimentStopped' }[experiment.state] || 'experimentInconclusive';
        return t(key, { day: experiment.day ?? 0 });
    }

    function analysisReason(record) {
        const analysis = record.analysis || record.health?.result || analyseRecord(record, state.records);
        return t(analysis.reasonKey || 'reasonMonitor', {
            renewals: state.settings.minRenewalsToReview,
            percent: state.settings.declinePercent,
            ...(analysis.reasonParams || {}),
        });
    }

    function canonicalEditableContent(editor) {
        const normalizeList = (values) => uniqueStrings(Array.isArray(values) ? values : []).map((value) => value.toLocaleLowerCase()).sort((a, b) => a.localeCompare(b));
        return {
            description: String(editor?.description ?? '').replace(/\r\n?/g, '\n').trim(),
            materials: normalizeList(editor?.materials),
            tags: normalizeList(editor?.tags),
            title: normalizeSpace(editor?.title),
        };
    }

    async function contentFingerprint(editor) {
        const canonical = JSON.stringify(canonicalEditableContent(editor));
        if (globalThis.crypto?.subtle) {
            const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
            return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
        }
        return `fnv1a-${fnv1a(canonical)}`;
    }

    function researchJsonSize(value) {
        try { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
        catch { return Number.POSITIVE_INFINITY; }
    }

    function requireExactResearchObject(value, keys, label) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
        const actual = Object.keys(value).sort();
        const expected = [...keys].sort();
        if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} keys mismatch`);
        return value;
    }

    function researchTime(value) {
        if (Number.isFinite(Number(value)) && value !== '') return Number(value);
        const parsed = Date.parse(String(value || ''));
        return Number.isFinite(parsed) ? parsed : null;
    }

    function researchEnvelope(type, requestId, nonce, payload, expiresAt = Date.now() + RESEARCH_REQUEST_TTL_MS) {
        const sentAt = Date.now();
        const message = {
            schema: RESEARCH_ENVELOPE_SCHEMA,
            type,
            requestId: String(requestId || ''),
            nonce: String(nonce || ''),
            sentAt,
            expiresAt: Number(expiresAt),
            sender: 'listing-analyzer',
            payload: payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {},
        };
        if (researchJsonSize(message) > RESEARCH_MESSAGE_MAX_BYTES) {
            const error = new Error('research message exceeds 64 KiB'); error.code = 'RESEARCH_SIZE'; throw error;
        }
        return message;
    }

    function validateResearchEnvelope(raw, expectedTypes = null) {
        requireExactResearchObject(raw, ['schema', 'type', 'requestId', 'nonce', 'sentAt', 'expiresAt', 'sender', 'payload'], 'research envelope');
        if (researchJsonSize(raw) > RESEARCH_MESSAGE_MAX_BYTES) throw new Error('research envelope exceeds 64 KiB');
        if (raw.schema !== RESEARCH_ENVELOPE_SCHEMA) throw new Error('research envelope schema mismatch');
        const type = String(raw.type || '');
        const allowed = ['CAPABILITIES', 'RESEARCH_READY', 'RESEARCH_ACK', 'RESEARCH_RESULT', 'ERROR'];
        if (!allowed.includes(type) || (expectedTypes && !expectedTypes.includes(type))) throw new Error(`unsupported research message ${type || '(missing)'}`);
        if (raw.sender !== 'keyword-market-analyzer') throw new Error('unexpected research sender');
        const requestId = String(raw.requestId || '');
        const nonce = String(raw.nonce || '');
        if (!/^[A-Za-z0-9:_-]{8,160}$/.test(requestId)) throw new Error('invalid research requestId');
        if (!/^[A-Za-z0-9_-]{16,160}$/.test(nonce)) throw new Error('invalid research nonce');
        if (!Number.isInteger(raw.sentAt) || !Number.isInteger(raw.expiresAt)) throw new Error('research envelope times must be integer epoch milliseconds');
        const sentAt = raw.sentAt;
        const expiresAt = raw.expiresAt;
        const now = Date.now();
        if (sentAt === null || expiresAt === null || expiresAt <= sentAt || expiresAt - sentAt > RESEARCH_MAX_TTL_MS) throw new Error('invalid research TTL');
        if (sentAt > now + 60_000 || expiresAt < now) throw new Error('expired research envelope');
        if (!raw.payload || typeof raw.payload !== 'object' || Array.isArray(raw.payload)) throw new Error('research payload must be an object');
        return { ...raw, type, requestId, nonce, sentAt, expiresAt };
    }

    function canonicalResearchContent(record) {
        const editable = captureEditableFieldsFromRecord(record);
        return { title: normalizeSpace(editable.title), tags: uniqueStrings(editable.tags || []).map((tag) => tag.toLocaleLowerCase()).sort((a, b) => a.localeCompare(b)) };
    }

    async function researchContentHash(record) {
        const canonical = JSON.stringify(canonicalResearchContent(record));
        if (!globalThis.crypto?.subtle) { const error = new Error('SHA-256 is unavailable'); error.code = 'RESEARCH_HASH_UNAVAILABLE'; throw error; }
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
        return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    }

    function researchSeedKeywords(record) {
        const editable = captureEditableFieldsFromRecord(record);
        const fromTags = uniqueStrings(editable.tags || []).filter((value) => value.length >= 2 && value.length <= 50);
        const title = normalizeSpace(editable.title);
        const titleParts = uniqueStrings(title.split(/[|,;/]+/)).filter((value) => value.length >= 2 && value.length <= 50);
        let titleFallback = title.slice(0, 50).trim();
        if (title.length > 50) titleFallback = titleFallback.replace(/\s+\S*$/, '').trim();
        if (!titleFallback) titleFallback = title.slice(0, 50).trim();
        return uniqueStrings([...fromTags, ...titleParts, titleFallback]).slice(0, 3);
    }

    function normalizeResearchCache(raw) {
        const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        const now = Date.now();
        return Object.fromEntries(Object.entries(source).filter(([requestId, entry]) => {
            if (!/^[A-Za-z0-9:_-]{8,160}$/.test(requestId) || !entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
            const expiresAt = researchTime(entry.expiresAt);
            const completedAt = researchTime(entry.completedAt);
            return expiresAt !== null && (expiresAt >= now || (completedAt !== null && completedAt + DAY_MS >= now));
        }).sort((left, right) => String(left[1]?.updatedAt || left[1]?.createdAt).localeCompare(String(right[1]?.updatedAt || right[1]?.createdAt))).slice(-RESEARCH_MAX_PENDING));
    }

    async function persistResearchEntryLocked(entry) {
        const cache = normalizeResearchCache(await GMX.get(KEYS.researchRequests, {}));
        const writeId = randomId('research-write');
        const candidate = { ...entry, updatedAt: nowIso(), writeId };
        cache[candidate.requestId] = candidate;
        const bounded = normalizeResearchCache(cache);
        if (!bounded[candidate.requestId]) throw new Error('research request cache is full');
        await requireStored(KEYS.researchRequests, bounded);
        const verified = await GMX.get(KEYS.researchRequests, {});
        if (verified?.[candidate.requestId]?.writeId !== writeId) {
            const error = new Error('research request write verification failed'); error.code = 'STORAGE_WRITE_FAILED'; throw error;
        }
        return candidate;
    }

    async function getResearchEntry(requestId) {
        return normalizeResearchCache(await GMX.get(KEYS.researchRequests, {}))[String(requestId || '')] || null;
    }

    async function activeResearchForListing(listingId) {
        const cache = normalizeResearchCache(await GMX.get(KEYS.researchRequests, {}));
        return Object.values(cache).find((entry) => String(entry.listingId) === String(listingId) && !['completed', 'failed'].includes(entry.status) && researchTime(entry.expiresAt) > Date.now()) || null;
    }

    async function prepareResearchEntry(record, expectedIdentity) {
        return withNamedLock(STORAGE_MUTATION_LOCK, async () => {
            const fenced = await assertFreshCollectionLocked(expectedIdentity);
            const latest = fenced.records.find((item) => String(item.listingId) === String(record.listingId));
            if (!latest) { const error = new Error('selected listing is outside the current collection'); error.code = 'COLLECTION_INCOMPLETE'; throw error; }
            const seeds = researchSeedKeywords(latest).slice(0, 1);
            if (!seeds.length) { const error = new Error(t('researchNoSeeds')); error.code = 'RESEARCH_NO_SEEDS'; throw error; }
            const requestId = randomId('research');
            const nonce = randomNonce();
            const createdAt = nowIso();
            const expiresAt = new Date(Date.now() + RESEARCH_REQUEST_TTL_MS).toISOString();
            const contentHash = await researchContentHash(latest);
            const editable = captureEditableFieldsFromRecord(latest);
            if (!editable.title || editable.title.length > 140) throw new Error('research title must contain 1-140 characters');
            if (!Array.isArray(editable.tags) || editable.tags.length > 13 || editable.tags.some((tag) => !normalizeSpace(tag) || normalizeSpace(tag).length > 20)) throw new Error('research tags are invalid');
            if (seeds.length < 1 || seeds.length > 3 || new Set(seeds.map((seed) => seed.toLocaleLowerCase())).size !== seeds.length) throw new Error('research seed keywords are invalid');
            const payload = {
                schema: RESEARCH_REQUEST_SCHEMA,
                opaqueReference: 'L001',
                contentHash,
                title: editable.title,
                tags: editable.tags,
                seedKeywords: seeds,
                maxSeeds: 1,
            };
            if (researchJsonSize(payload) > RESEARCH_MESSAGE_MAX_BYTES / 2) throw new Error('research request payload is too large');
            return persistResearchEntryLocked({
                schema: 'makaytron-listing-research-pending/v1', requestId, nonce, createdAt, expiresAt,
                ownerTabId: tabId, listingId: String(latest.listingId), opaqueReference: 'L001', contentHash,
                collection: collectionIdentity(fenced.collection), editableDataCaptured: Boolean(latest.editor?.capturedAt),
                status: 'waiting-ready', request: payload,
            });
        });
    }

    function researchRequestEnvelope(entry) {
        return researchEnvelope('RESEARCH_REQUEST', entry.requestId, entry.nonce, entry.request, researchTime(entry.expiresAt));
    }

    function researchInsightsUrl() { return RESEARCH_INSIGHTS_URL; }

    function postResearchEnvelope(message) {
        if (!state.researchChannel) throw new Error('BroadcastChannel is unavailable');
        if (researchJsonSize(message) > RESEARCH_MESSAGE_MAX_BYTES) throw new Error('research message exceeds 64 KiB');
        state.researchChannel.postMessage(message);
    }

    function clearResearchProbeTimers(waiter) {
        clearTimeout(waiter?.timeout);
        (waiter?.retryTimers || []).forEach((timer) => clearTimeout(timer));
        if (waiter) waiter.retryTimers = [];
    }

    async function probeResearchCompanion() {
        if (!state.researchChannel) return null;
        const requestId = randomId('probe');
        const nonce = randomNonce();
        return new Promise((resolve) => {
            const timeout = window.setTimeout(() => {
                const waiter = state.researchProbeWaiters.get(requestId);
                clearResearchProbeTimers(waiter);
                state.researchProbeWaiters.delete(requestId);
                resolve(null);
            }, RESEARCH_PROBE_TIMEOUT_MS);
            const waiter = { nonce, resolve, timeout, retryTimers: [], capabilities: null, readyState: '' };
            state.researchProbeWaiters.set(requestId, waiter);
            const sendProbe = () => {
                if (state.researchProbeWaiters.get(requestId) !== waiter) return;
                try { postResearchEnvelope(researchEnvelope('PROBE', requestId, nonce, { wants: ['research'] }, Date.now() + 10_000)); }
                catch {
                    clearResearchProbeTimers(waiter);
                    state.researchProbeWaiters.delete(requestId);
                    resolve(null);
                }
            };
            sendProbe();
            if (state.researchProbeWaiters.get(requestId) === waiter) {
                waiter.retryTimers = RESEARCH_PROBE_RETRY_DELAYS_MS.slice(1).map((delay) => window.setTimeout(sendProbe, delay));
            }
        });
    }

    function validateResearchCapabilities(payload) {
        requireExactResearchObject(payload, ['version', 'standalone', 'maxSeedKeywords', 'maxRelatedKeywords', 'cacheTtlDays', 'networkAccess'], 'research capabilities');
        if (typeof payload.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(payload.version)) throw new Error('invalid companion version');
        if (payload.standalone !== true || payload.networkAccess !== false) throw new Error('unsupported companion capabilities');
        if (!Number.isInteger(payload.maxSeedKeywords) || payload.maxSeedKeywords < 1 || payload.maxSeedKeywords > 3) throw new Error('invalid seed limit');
        if (!Number.isInteger(payload.maxRelatedKeywords) || payload.maxRelatedKeywords < 1 || payload.maxRelatedKeywords > 25) throw new Error('invalid related-keyword limit');
        if (payload.cacheTtlDays !== 7) throw new Error('unsupported companion cache TTL');
        return payload;
    }

    function validateResearchReadyPayload(payload) {
        const stateValue = payload?.state;
        requireExactResearchObject(payload, stateValue === 'busy' ? ['state', 'activeRequestId'] : ['state'], 'research ready');
        if (!['ready', 'busy'].includes(stateValue)) throw new Error('invalid research ready state');
        if (stateValue === 'busy' && (typeof payload.activeRequestId !== 'string' || !/^[A-Za-z0-9:_-]{8,160}$/.test(payload.activeRequestId))) throw new Error('invalid active research request');
        return { ...payload };
    }

    function validateResearchAckPayload(payload) {
        requireExactResearchObject(payload, ['accepted', 'queuePosition'], 'research acknowledgement');
        if (payload.accepted !== true || !Number.isInteger(payload.queuePosition) || payload.queuePosition < 0 || payload.queuePosition >= RESEARCH_REMOTE_MAX_QUEUE) throw new Error('invalid research acknowledgement');
        return { accepted: true, queuePosition: payload.queuePosition };
    }

    function validateResearchErrorPayload(payload) {
        requireExactResearchObject(payload, ['code', 'message', 'retryable'], 'research error');
        if (typeof payload.code !== 'string' || !/^[A-Z][A-Z0-9_]{1,63}$/.test(payload.code)) throw new Error('invalid research error code');
        if (typeof payload.message !== 'string' || !normalizeSpace(payload.message) || payload.message.length > 300) throw new Error('invalid research error message');
        if (typeof payload.retryable !== 'boolean') throw new Error('invalid research retryable flag');
        return { code: payload.code, message: normalizeSpace(payload.message), retryable: payload.retryable };
    }

    function researchMetric(value, label, options = {}) {
        if (value === null) return null;
        const min = options.min ?? 0;
        const max = options.max ?? 1_000_000_000_000;
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`invalid ${label}`);
        return value;
    }

    function validateResearchKeywords(rawKeywords) {
        if (!Array.isArray(rawKeywords) || rawKeywords.length < 1 || rawKeywords.length > 28) throw new Error('research keywords must contain 1-28 items');
        const seen = new Set();
        return rawKeywords.map((item) => {
            requireExactResearchObject(item, ['keyword', 'searches30d', 'searchResults', 'trend7dPercent', 'opportunity'], 'research keyword');
            if (typeof item.keyword !== 'string') throw new Error('research keyword text must be a string');
            const keyword = normalizeSpace(item.keyword);
            const key = keyword.toLocaleLowerCase();
            if (!keyword || keyword.length > 80 || seen.has(key)) throw new Error(`invalid or duplicate research keyword ${keyword || '(missing)'}`);
            seen.add(key);
            const searches30d = researchMetric(item.searches30d, `${keyword} searches30d`);
            const searchResults = researchMetric(item.searchResults, `${keyword} searchResults`);
            const trend7dPercent = researchMetric(item.trend7dPercent, `${keyword} trend7dPercent`, { min: -1000, max: 1000 });
            const opportunity = requireExactResearchObject(item.opportunity, ['score', 'label', 'metric'], 'research opportunity');
            if (opportunity.metric !== 'makaytron-derived' || typeof opportunity.label !== 'string') throw new Error(`invalid opportunity for ${keyword}`);
            const score = researchMetric(opportunity.score, `${keyword} opportunity score`, { min: 0, max: 100 });
            if (score === null) throw new Error(`missing opportunity score for ${keyword}`);
            const label = opportunity.label.toUpperCase();
            if (!['LOW', 'MEDIUM', 'HIGH'].includes(label)) throw new Error(`invalid opportunity label for ${keyword}`);
            return { keyword, searches30d, searchResults, trend7dPercent, opportunity: { score, label, metric: 'makaytron-derived' } };
        });
    }

    function validateResearchResultPayload(raw, entry) {
        requireExactResearchObject(raw, ['schema', 'opaqueReference', 'contentHash', 'capturedAt', 'source', 'keywords'], 'research result');
        if (researchJsonSize(raw) > RESEARCH_MESSAGE_MAX_BYTES) throw new Error('research result exceeds 64 KiB');
        if (raw.schema !== RESEARCH_RESULT_SCHEMA) throw new Error('research result schema mismatch');
        if (typeof raw.opaqueReference !== 'string' || raw.opaqueReference !== entry.opaqueReference) throw new Error('research opaque reference mismatch');
        if (typeof raw.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(raw.contentHash) || raw.contentHash !== entry.contentHash) { const error = new Error(t('researchStale')); error.code = 'RESEARCH_STALE'; throw error; }
        if (raw.source !== 'etsy-marketplace-insights-dom') throw new Error('unsupported research source');
        if (typeof raw.capturedAt !== 'string') throw new Error('invalid research capture time');
        const capturedAt = researchTime(raw.capturedAt);
        if (capturedAt === null || capturedAt > Date.now() + 60_000 || capturedAt < Date.now() - 7 * DAY_MS) throw new Error('invalid research capture time');
        const keywords = validateResearchKeywords(raw.keywords);
        return { schema: RESEARCH_RESULT_SCHEMA, opaqueReference: entry.opaqueReference, contentHash: entry.contentHash, capturedAt: new Date(capturedAt).toISOString(), source: raw.source, keywords };
    }

    function validateResearchEvidence(raw) {
        requireExactResearchObject(raw, ['schema', 'requestId', 'opaqueReference', 'contentHash', 'source', 'capturedAt', 'keywords'], 'research evidence');
        if (raw.schema !== RESEARCH_EVIDENCE_SCHEMA) throw new Error('research evidence schema mismatch');
        if (typeof raw.requestId !== 'string' || !/^[A-Za-z0-9:_-]{8,160}$/.test(raw.requestId)) throw new Error('invalid research evidence requestId');
        if (typeof raw.opaqueReference !== 'string' || !/^[A-Za-z0-9:_-]{1,128}$/.test(raw.opaqueReference)) throw new Error('invalid research evidence reference');
        if (typeof raw.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(raw.contentHash)) throw new Error('invalid research evidence hash');
        if (raw.source !== 'etsy-marketplace-insights-dom') throw new Error('invalid research evidence source');
        if (typeof raw.capturedAt !== 'string') throw new Error('invalid research evidence time');
        const capturedAt = researchTime(raw.capturedAt);
        if (capturedAt === null || capturedAt > Date.now() + 60_000) throw new Error('invalid research evidence time');
        return {
            schema: RESEARCH_EVIDENCE_SCHEMA,
            requestId: raw.requestId,
            opaqueReference: raw.opaqueReference,
            contentHash: raw.contentHash,
            source: raw.source,
            capturedAt: new Date(capturedAt).toISOString(),
            keywords: validateResearchKeywords(raw.keywords),
        };
    }

    function validateResearchSuggestion(raw) {
        requireExactResearchObject(raw, ['schema', 'action', 'fields', 'title', 'tags', 'reason', 'source', 'requestId', 'reference', 'researchEvidence', 'generatedAt', 'requiresEditorCapture'], 'research suggestion');
        if (raw.schema !== 'makaytron-listing-research-suggestion/v1') throw new Error('research suggestion schema mismatch');
        if (!['UPDATE', 'SKIP'].includes(raw.action) || !Array.isArray(raw.fields)) throw new Error('invalid research suggestion action');
        const fields = raw.fields.map((field) => String(field));
        if (fields.some((field) => !['title', 'tags'].includes(field)) || new Set(fields).size !== fields.length) throw new Error('invalid research suggestion fields');
        if ((raw.action === 'UPDATE') !== (fields.length > 0)) throw new Error('research suggestion action/fields mismatch');
        if (typeof raw.title !== 'string' || !normalizeSpace(raw.title) || raw.title.length > 140) throw new Error('invalid research suggestion title');
        if (!Array.isArray(raw.tags) || raw.tags.length > 13 || raw.tags.some((tag) => typeof tag !== 'string' || !normalizeSpace(tag) || tag.length > 20)) throw new Error('invalid research suggestion tags');
        if (typeof raw.reason !== 'string' || !normalizeSpace(raw.reason) || raw.reason.length > 1000) throw new Error('invalid research suggestion reason');
        if (raw.source !== 'marketplace-insights') throw new Error('invalid research suggestion source');
        if (typeof raw.requestId !== 'string' || !/^[A-Za-z0-9:_-]{8,160}$/.test(raw.requestId)) throw new Error('invalid research suggestion requestId');
        if (typeof raw.reference !== 'string' || !/^[A-Za-z0-9:_-]{1,128}$/.test(raw.reference)) throw new Error('invalid research suggestion reference');
        if (typeof raw.generatedAt !== 'string' || researchTime(raw.generatedAt) === null) throw new Error('invalid research suggestion time');
        if (typeof raw.requiresEditorCapture !== 'boolean') throw new Error('invalid research suggestion capture flag');
        const researchEvidence = validateResearchEvidence(raw.researchEvidence);
        if (researchEvidence.requestId !== raw.requestId || researchEvidence.opaqueReference !== raw.reference) throw new Error('research suggestion evidence mismatch');
        return {
            schema: raw.schema, action: raw.action, fields, title: normalizeSpace(raw.title), tags: uniqueStrings(raw.tags),
            reason: normalizeSpace(raw.reason), source: raw.source, requestId: raw.requestId, reference: raw.reference,
            researchEvidence, generatedAt: new Date(researchTime(raw.generatedAt)).toISOString(), requiresEditorCapture: raw.requiresEditorCapture,
        };
    }

    function buildResearchSuggestion(record, result, entry) {
        const current = captureEditableFieldsFromRecord(record);
        const titleLower = normalizeSpace(current.title).toLocaleLowerCase();
        const ranked = [...result.keywords].sort((left, right) => Number(right.opportunity.score || 0) - Number(left.opportunity.score || 0) || Number(right.searches30d || 0) - Number(left.searches30d || 0));
        const titleKeyword = ranked.find((item) => item.keyword.length <= 50 && !titleLower.includes(item.keyword.toLocaleLowerCase()));
        let title = normalizeSpace(current.title);
        if (titleKeyword) {
            const prefix = `${titleKeyword.keyword} | `;
            const room = Math.max(0, 140 - prefix.length);
            let tail = title.slice(0, room);
            if (tail.length < title.length) tail = tail.replace(/\s+\S*$/, '').trim();
            title = normalizeSpace(`${prefix}${tail}`).slice(0, 140);
        }
        const existingTags = uniqueStrings(current.tags || []);
        const existingTagSet = new Set(existingTags.map((tag) => tag.toLocaleLowerCase()));
        const availableSlots = entry.editableDataCaptured ? Math.max(0, 13 - existingTags.length) : 0;
        const tagCandidates = ranked.filter((item) => item.keyword.length <= 20
            && !existingTagSet.has(item.keyword.toLocaleLowerCase())
            && item.searches30d !== null && item.searchResults !== null);
        const addedTags = tagCandidates.slice(0, Math.min(3, availableSlots)).map((item) => item.keyword);
        const tags = [...existingTags, ...addedTags];
        let tagReplacement = null;
        if (entry.editableDataCaptured && existingTags.length === 13 && tagCandidates.length) {
            const evidenceByKeyword = new Map(ranked.map((item) => [item.keyword.toLocaleLowerCase(), item]));
            const weakest = existingTags.map((tag, index) => {
                const evidenceItem = evidenceByKeyword.get(tag.toLocaleLowerCase());
                return { tag, index, score: evidenceItem ? evidenceItem.opportunity.score : -1, searches: evidenceItem?.searches30d ?? -1 };
            }).sort((left, right) => left.score - right.score || left.searches - right.searches || right.index - left.index)[0];
            const strongestCandidate = tagCandidates[0];
            if (weakest && strongestCandidate.opportunity.score > weakest.score) {
                tags[weakest.index] = strongestCandidate.keyword;
                tagReplacement = { old: weakest.tag, keyword: strongestCandidate.keyword };
            }
        }
        const fields = [];
        if (title && title !== normalizeSpace(current.title)) fields.push('title');
        if (!sameStringSet(tags, existingTags)) fields.push('tags');
        const strongest = ranked[0];
        const evidence = {
            schema: RESEARCH_EVIDENCE_SCHEMA,
            requestId: entry.requestId,
            opaqueReference: entry.opaqueReference,
            contentHash: entry.contentHash,
            source: result.source,
            capturedAt: result.capturedAt,
            keywords: ranked,
        };
        let reason = t('researchProposalReason', { keyword: strongest.keyword, searches: formatNumber(strongest.searches30d), results: formatNumber(strongest.searchResults) });
        if (tagReplacement) reason = `${reason} ${t('researchTagReplacement', tagReplacement)}`;
        return {
            schema: 'makaytron-listing-research-suggestion/v1',
            action: fields.length ? 'UPDATE' : 'SKIP', fields, title, tags,
            reason,
            source: 'marketplace-insights', requestId: entry.requestId, reference: entry.opaqueReference,
            researchEvidence: evidence, generatedAt: nowIso(), requiresEditorCapture: !entry.editableDataCaptured,
        };
    }

    function researchSuggestionForRecord(record) {
        let stored = null;
        try { stored = validateResearchSuggestion(record?.researchSuggestion); }
        catch { return null; }
        if (!stored || !stored.requiresEditorCapture || !record?.editor?.capturedAt) return stored;
        const evidence = stored.researchEvidence;
        const entry = {
            requestId: String(stored.requestId || evidence.requestId || ''),
            opaqueReference: String(stored.reference || evidence.opaqueReference || ''),
            contentHash: String(evidence.contentHash || ''),
            editableDataCaptured: true,
        };
        try {
            const result = validateResearchResultPayload({
                schema: RESEARCH_RESULT_SCHEMA,
                opaqueReference: entry.opaqueReference,
                contentHash: entry.contentHash,
                capturedAt: evidence.capturedAt,
                source: evidence.source,
                keywords: evidence.keywords,
            }, entry);
            return { ...buildResearchSuggestion(record, result, entry), generatedAt: stored.generatedAt || nowIso(), rematerializedAt: nowIso() };
        } catch { return stored; }
    }

    function transitionResearchEntry(entry, nextStatus, patch = {}, allowedStatuses = []) {
        const currentStatus = String(entry?.status || '');
        if (['completed', 'failed'].includes(currentStatus)) return entry;
        if (allowedStatuses.length && !allowedStatuses.includes(currentStatus)) return entry;
        return { ...entry, ...patch, status: nextStatus };
    }

    function researchResultStatusAccepts(status) {
        return ['waiting-ready', 'request-sent', 'acknowledged', 'processing'].includes(String(status || ''));
    }

    async function consumeResearchResult(envelope) {
        return withNamedLock(STORAGE_MUTATION_LOCK, async () => {
            const cache = normalizeResearchCache(await GMX.get(KEYS.researchRequests, {}));
            let entry = cache[envelope.requestId];
            if (!entry || entry.nonce !== envelope.nonce) throw new Error('unknown or expired research request');
            if (entry.ownerTabId !== tabId) throw new Error('research request belongs to another Analyzer tab');
            if (entry.status === 'completed') {
                const duplicateResult = validateResearchResultPayload(envelope.payload, entry);
                const duplicateHash = `fnv1a-${fnv1a(JSON.stringify(duplicateResult))}`;
                if (duplicateHash !== entry.resultHash) throw new Error('conflicting research replay rejected');
                return { duplicate: true, entry, count: Number(entry.evidenceCount) || 0 };
            }
            if (!researchResultStatusAccepts(entry.status)) {
                throw new Error('research request no longer accepts results');
            }
            if (researchTime(entry.expiresAt) < Date.now()) throw new Error('research request expired');
            const expectedIdentity = entry.collection || {};
            const fenced = await assertFreshCollectionLocked(expectedIdentity);
            const record = fenced.records.find((item) => String(item.listingId) === String(entry.listingId));
            if (!record) throw new Error('research listing is no longer in the current collection');
            const currentHash = await researchContentHash(record);
            if (currentHash !== entry.contentHash) { const error = new Error(t('researchStale')); error.code = 'RESEARCH_STALE'; throw error; }
            const result = validateResearchResultPayload(envelope.payload, entry);
            const resultHash = `fnv1a-${fnv1a(JSON.stringify(result))}`;
            entry = await persistResearchEntryLocked({ ...entry, status: 'processing', resultHash });
            try {
                const suggestion = buildResearchSuggestion(record, result, entry);
                record.researchEvidence = suggestion.researchEvidence;
                record.researchSuggestion = suggestion;
                await Store.putRecordLocked(record);
                entry = await persistResearchEntryLocked({ ...entry, status: 'completed', completedAt: nowIso(), evidenceCount: result.keywords.length, suggestionPrepared: suggestion.fields.length > 0 });
                return { duplicate: false, entry, count: result.keywords.length, suggestion };
            } catch (error) {
                await persistResearchEntryLocked({ ...entry, status: 'acknowledged', resultHash: '', lastError: normalizeSpace(error?.message).slice(0, 240) });
                throw error;
            }
        });
    }

    async function updateResearchEntry(requestId, mutate) {
        return withNamedLock(STORAGE_MUTATION_LOCK, async () => {
            const entry = await getResearchEntry(requestId);
            if (!entry) return null;
            return persistResearchEntryLocked(mutate({ ...entry }) || entry);
        });
    }

    async function rejectResearchResult(envelope, error) {
        if (error?.code === 'STORAGE_WRITE_FAILED') return false;
        const entry = await getResearchEntry(envelope?.requestId);
        if (!entry || entry.nonce !== envelope?.nonce || entry.ownerTabId !== tabId) return false;
        const message = normalizeSpace(error?.message || error || 'Research result rejected.').slice(0, 300) || 'Research result rejected.';
        if (entry.status !== 'completed') {
            try {
                await updateResearchEntry(entry.requestId, (current) => ({ ...current, status: 'failed', failedAt: nowIso(), lastError: message }));
            } catch { /* Still notify the companion so it can release its queue item. */ }
        }
        clearResearchUiTimer(entry.requestId);
        try {
            postResearchEnvelope(researchEnvelope('ERROR', entry.requestId, entry.nonce, { code: 'RESULT_REJECTED', message, retryable: false }, Date.now() + 60_000));
        } catch { /* Local rejection remains terminal even if the companion tab closed. */ }
        return true;
    }

    function clearResearchUiTimer(requestId) {
        const timer = state.researchUiTimers.get(requestId);
        if (timer) clearTimeout(timer);
        state.researchUiTimers.delete(requestId);
    }

    function scheduleResearchUiTimeout(requestId) {
        clearResearchUiTimer(requestId);
        state.researchUiTimers.set(requestId, window.setTimeout(() => {
            state.researchUiTimers.delete(requestId);
            UI.updateResearchTransfer('researchTimedOut', 'blocked');
        }, RESEARCH_UI_TIMEOUT_MS));
    }

    async function handleResearchMessage(raw) {
        let envelope;
        try { envelope = validateResearchEnvelope(raw); }
        catch { return; }
        if (envelope.type === 'CAPABILITIES') {
            const waiter = state.researchProbeWaiters.get(envelope.requestId);
            if (!waiter || waiter.nonce !== envelope.nonce) return;
            try {
                waiter.capabilities = validateResearchCapabilities(envelope.payload);
                if (waiter.readyState) {
                    clearResearchProbeTimers(waiter); state.researchProbeWaiters.delete(envelope.requestId);
                    waiter.resolve({ ...waiter.capabilities, readyState: waiter.readyState });
                }
            } catch { /* A malformed capability response is equivalent to no compatible companion. */ }
            return;
        }
        if (envelope.type === 'RESEARCH_READY') {
            const waiter = state.researchProbeWaiters.get(envelope.requestId);
            if (waiter && waiter.nonce === envelope.nonce) {
                let ready;
                try { ready = validateResearchReadyPayload(envelope.payload); }
                catch { return; }
                waiter.readyState = ready.state;
                if (waiter.capabilities) {
                    clearResearchProbeTimers(waiter); state.researchProbeWaiters.delete(envelope.requestId);
                    waiter.resolve({ ...waiter.capabilities, readyState: ready.state });
                }
                return;
            }
        }
        const entry = await getResearchEntry(envelope.requestId);
        if (!entry || entry.nonce !== envelope.nonce || entry.ownerTabId !== tabId || researchTime(entry.expiresAt) < Date.now()) return;
        if (envelope.type === 'RESEARCH_READY') {
            let ready;
            try { ready = validateResearchReadyPayload(envelope.payload); }
            catch { return; }
            const remoteState = ready.state;
            if (remoteState === 'busy') { UI.updateResearchTransfer('researchWaitingReady', 'scanning'); return; }
            try {
                if (!['waiting-ready', 'request-sent'].includes(entry.status)) return;
                const current = await updateResearchEntry(entry.requestId, (candidate) => ['waiting-ready', 'request-sent'].includes(candidate.status)
                    ? { ...candidate, status: 'request-sent', requestSentAt: candidate.requestSentAt || nowIso() }
                    : candidate);
                if (!current || current.status !== 'request-sent') return;
                postResearchEnvelope(researchRequestEnvelope(current));
                UI.updateResearchTransfer('researchRequestSent', 'scanning');
                scheduleResearchUiTimeout(entry.requestId);
            } catch (error) { UI.updateResearchTransfer('researchFailed', 'error', { message: normalizeSpace(error?.message) }); }
            return;
        }
        if (envelope.type === 'RESEARCH_ACK') {
            try { validateResearchAckPayload(envelope.payload); }
            catch { return; }
            const updated = await updateResearchEntry(entry.requestId, (current) => transitionResearchEntry(
                current,
                'acknowledged',
                { acknowledgedAt: current.acknowledgedAt || nowIso() },
                ['request-sent', 'acknowledged'],
            ));
            if (updated?.status === 'acknowledged') UI.updateResearchTransfer('researchAcknowledged', 'scanning');
            return;
        }
        if (envelope.type === 'ERROR') {
            let remoteError;
            try { remoteError = validateResearchErrorPayload(envelope.payload); }
            catch { return; }
            const message = remoteError.message.slice(0, 240);
            const updated = await updateResearchEntry(entry.requestId, (current) => transitionResearchEntry(
                current,
                'failed',
                { failedAt: nowIso(), lastError: message },
                ['waiting-ready', 'request-sent', 'acknowledged', 'processing'],
            ));
            if (updated?.status !== 'failed') return;
            clearResearchUiTimer(entry.requestId);
            UI.updateResearchTransfer('researchErrorRemote', 'error', { message });
            return;
        }
        if (envelope.type === 'RESEARCH_RESULT') {
            try {
                const consumed = await consumeResearchResult(envelope);
                postResearchEnvelope(researchEnvelope('RESEARCH_RECEIVED', entry.requestId, entry.nonce, { accepted: true }, Date.now() + 60_000));
                clearResearchUiTimer(entry.requestId);
                await refreshRecords();
                UI.setStatus('researchComplete', 'ready', { count: consumed.count });
                UI.updateResearchTransfer(consumed.suggestion?.requiresEditorCapture ? 'researchNeedsEditor' : 'researchSavedForReview', 'ready');
                UI.toast(t('researchComplete', { count: consumed.count }), 'success');
            } catch (error) {
                const message = error?.code === 'RESEARCH_STALE' ? t('researchStale') : normalizeSpace(error?.message || error);
                await rejectResearchResult(envelope, error);
                UI.updateResearchTransfer('researchFailed', 'error', { message });
            }
        }
    }

    function installResearchBridge() {
        if (typeof BroadcastChannel !== 'function') return false;
        try {
            const channel = new BroadcastChannel(RESEARCH_CHANNEL_NAME);
            channel.addEventListener('message', (event) => { void handleResearchMessage(event.data); });
            state.researchChannel = channel;
            return true;
        } catch { return false; }
    }

    function primaryMetricForFields(fields) {
        if (fields.includes('title') || fields.includes('tags')) return 'visits30';
        if (fields.includes('description')) return 'salesRateProxy';
        return 'favoriteRate';
    }

    function experimentRate(events, exposure) {
        const count = finiteOrNull(events); const sample = finiteOrNull(exposure);
        return count === null || sample === null || count < 0 || sample <= 0 ? null : count / sample;
    }

    function relativeEffectSummary(before, after) {
        if (!Number.isFinite(before) || !Number.isFinite(after) || before < 0 || after < 0) return { kind: 'invalid', percent: null, absolute: null };
        const absolute = Math.round((after - before) * 1000000) / 1000000;
        if (before === 0) return after > 0 ? { kind: 'from-zero', percent: null, absolute } : { kind: 'unchanged', percent: 0, absolute: 0 };
        return { kind: 'relative', percent: Math.round(((after - before) / before) * 1000) / 10, absolute };
    }

    function relativeEffectPercent(before, after) { return relativeEffectSummary(before, after).percent; }

    function findExperimentMetricAnchor(history, current, requiredFields, targetDays = 30, toleranceDays = HEALTH_RULES.experimentMatchedWindowToleranceDays, notBefore = null, exactFields = []) {
        if (!current || !normalizeMetricContract(current.metricContract) || !snapshotCountsAreExact(current, exactFields)) return null;
        const minimumTime = validTime(notBefore);
        let best = null;
        (Array.isArray(history) ? history : []).forEach((snapshot) => {
            if (!snapshot || snapshot === current || !normalizeMetricContract(snapshot.metricContract)) return;
            if (!snapshotCountsAreExact(snapshot, exactFields)) return;
            if (normalizeListingState(snapshot.listingState) !== 'active' || Number(snapshot.stock) <= 0) return;
            if ((requiredFields || []).some((field) => !Number.isFinite(snapshot[field]))) return;
            const snapshotTime = validTime(snapshot.at);
            if (minimumTime !== null && snapshotTime < minimumTime) return;
            const actualDays = daysBetween(current.at, snapshot.at);
            if (!Number.isFinite(actualDays) || actualDays <= 0) return;
            const distance = Math.abs(actualDays - targetDays);
            if (distance > toleranceDays) return;
            if (!best || distance < best.distance || (distance === best.distance && actualDays > best.actualDays)) best = { snapshot, actualDays, distance };
        });
        return best;
    }

    function experimentExposureIssue(history, baseline, current) {
        if (!baseline || !current || normalizeListingState(baseline.listingState) !== 'active' || normalizeListingState(current.listingState) !== 'active') return 'listing-state-changed';
        const start = validTime(baseline.at); const end = validTime(current.at);
        if (start === null || end === null || start > end) return 'listing-state-changed';
        const observedByTime = new Map([...(Array.isArray(history) ? history : []), baseline, current].map((snapshot) => [String(snapshot?.at || ''), snapshot]));
        const observed = [...observedByTime.values()].filter((snapshot) => {
            const time = validTime(snapshot?.at);
            return time !== null && time >= start && time <= end;
        }).sort((left, right) => validTime(left.at) - validTime(right.at));
        const baselineMin = finiteOrNull(baseline.priceMin); const baselineMax = finiteOrNull(baseline.priceMax);
        const baselineCurrency = normalizeSpace(baseline.currency);
        if (baselineMin === null || baselineMax === null || !baselineCurrency) return 'price-exposure-unverified';
        let previous = null;
        for (const snapshot of observed) {
            if (!normalizeMetricContract(snapshot.metricContract)) return 'metric-scope-unverified';
            if (normalizeListingState(snapshot.listingState) !== 'active') return 'listing-state-changed';
            if (!Number.isFinite(snapshot.stock) || Number(snapshot.stock) <= 0) return 'stock-exposure-changed';
            const priceMin = finiteOrNull(snapshot.priceMin); const priceMax = finiteOrNull(snapshot.priceMax);
            const currency = normalizeSpace(snapshot.currency);
            if (priceMin === null || priceMax === null || !currency) return 'price-exposure-unverified';
            if (Math.abs(priceMin - baselineMin) > 1e-9 || Math.abs(priceMax - baselineMax) > 1e-9 || !currenciesComparable(currency, baselineCurrency)) return 'price-changed';
            if (previous && ['sales', 'revenue', 'renewals'].some((field) => Number.isFinite(previous[field])
                && Number.isFinite(snapshot[field]) && snapshot[field] < previous[field])) return 'cumulative-counter-decreased';
            previous = snapshot;
        }
        return '';
    }

    function experimentMetricResult(metric, baseline, current, history) {
        if (!normalizeMetricContract(baseline?.metricContract) || !normalizeMetricContract(current?.metricContract)) {
            return { valid: false, reason: 'metric-scope-unverified', effect: { kind: 'invalid', percent: null, absolute: null }, baseline: {}, current: {}, winnerReady: false, underperformedReady: false };
        }
        const baselineVisits = finiteOrNull(baseline?.visits);
        const currentVisits = finiteOrNull(current?.visits);
        if (metric === 'visits30') {
            if (!snapshotCountsAreExact(baseline, ['visits']) || !snapshotCountsAreExact(current, ['visits'])) {
                return { valid: false, reason: 'approximate-counts', effect: { kind: 'invalid', percent: null, absolute: null }, baseline: {}, current: {}, winnerReady: false, underperformedReady: false };
            }
            const before = experimentRate(baselineVisits, HEALTH_RULES.experimentDays); const after = experimentRate(currentVisits, HEALTH_RULES.experimentDays);
            const direction = separatedRateDirection(baselineVisits, HEALTH_RULES.experimentDays, currentVisits, HEALTH_RULES.experimentDays);
            const effect = relativeEffectSummary(baselineVisits, currentVisits);
            return {
                valid: Number.isFinite(before) && Number.isFinite(after), effect,
                baseline: { metricValue: baselineVisits, visits: baselineVisits, windowStartAt: baseline.at },
                current: { metricValue: currentVisits, visits: currentVisits, rateRatioInterval: direction.comparison, windowEndAt: current.at },
                winnerReady: direction.winner && Number(currentVisits) >= 20,
                underperformedReady: direction.underperformed && Number(baselineVisits) >= 20,
            };
        }
        if (metric === 'favoriteRate') {
            if (!snapshotCountsAreExact(baseline, ['visits', 'favorites']) || !snapshotCountsAreExact(current, ['visits', 'favorites'])) {
                return { valid: false, reason: 'approximate-counts', effect: { kind: 'invalid', percent: null, absolute: null }, baseline: {}, current: {}, winnerReady: false, underperformedReady: false };
            }
            const baselineFavorites = finiteOrNull(baseline?.favorites);
            const currentFavorites = finiteOrNull(current?.favorites);
            const beforeRate = experimentRate(baselineFavorites, baselineVisits);
            const afterRate = experimentRate(currentFavorites, currentVisits);
            const before = Number.isFinite(beforeRate) ? beforeRate * 100 : null;
            const after = Number.isFinite(afterRate) ? afterRate * 100 : null;
            const direction = separatedRateDirection(baselineFavorites, baselineVisits, currentFavorites, currentVisits);
            return {
                valid: Number.isFinite(before) && Number.isFinite(after), effect: relativeEffectSummary(before, after),
                baseline: { metricValue: before, rate: before, favorites: baselineFavorites, visits: baselineVisits },
                current: { metricValue: after, rate: after, favorites: currentFavorites, visits: currentVisits, rateRatioInterval: direction.comparison },
                winnerReady: direction.winner,
                underperformedReady: direction.underperformed,
            };
        }
        if (![baseline, current].every((snapshot) => snapshotCountsAreExact(snapshot, ['visits', 'sales']))) {
            return { valid: false, reason: 'approximate-counts', effect: { kind: 'invalid', percent: null, absolute: null }, baseline: {}, current: {}, winnerReady: false, underperformedReady: false };
        }
        const baselineAnchor = findExperimentMetricAnchor(history, baseline, ['visits', 'sales'], 30, HEALTH_RULES.experimentMatchedWindowToleranceDays, null, ['visits', 'sales']);
        const currentAnchor = findExperimentMetricAnchor(history, current, ['visits', 'sales'], 30, HEALTH_RULES.experimentMatchedWindowToleranceDays, baseline.at, ['visits', 'sales']);
        if (!baselineAnchor || !currentAnchor) return { valid: false, reason: 'window-mismatch', effect: { kind: 'invalid', percent: null, absolute: null }, baseline: {}, current: {}, winnerReady: false, underperformedReady: false };
        if (Math.abs(baselineAnchor.actualDays - currentAnchor.actualDays) > HEALTH_RULES.experimentMatchedWindowToleranceDays) {
            return { valid: false, reason: 'window-mismatch', effect: { kind: 'invalid', percent: null, absolute: null }, baseline: {}, current: {}, winnerReady: false, underperformedReady: false };
        }
        if (![baselineAnchor.snapshot, baseline, currentAnchor.snapshot, current].every((snapshot) => snapshotCountsAreExact(snapshot, ['visits', 'sales']))) {
            return { valid: false, reason: 'approximate-counts', effect: { kind: 'invalid', percent: null, absolute: null }, baseline: {}, current: {}, winnerReady: false, underperformedReady: false };
        }
        const baselineWindowIssue = experimentExposureIssue(history, baselineAnchor.snapshot, baseline);
        const currentWindowIssue = experimentExposureIssue(history, currentAnchor.snapshot, current);
        if (baselineWindowIssue || currentWindowIssue) return { valid: false, reason: baselineWindowIssue || currentWindowIssue, effect: { kind: 'invalid', percent: null, absolute: null }, baseline: {}, current: {}, winnerReady: false, underperformedReady: false };
        const baselineSales = Number.isFinite(baseline.sales) && Number.isFinite(baselineAnchor.snapshot.sales) ? baseline.sales - baselineAnchor.snapshot.sales : null;
        const afterSales = Number.isFinite(current.sales) && Number.isFinite(currentAnchor.snapshot.sales) ? current.sales - currentAnchor.snapshot.sales : null;
        const beforeRate = experimentRate(baselineSales, baselineVisits);
        const afterRate = experimentRate(afterSales, currentVisits);
        const before = Number.isFinite(beforeRate) ? beforeRate * 100 : null;
        const after = Number.isFinite(afterRate) ? afterRate * 100 : null;
        const direction = separatedRateDirection(baselineSales, baselineVisits, afterSales, currentVisits);
        return {
            valid: Number.isInteger(baselineSales) && baselineSales >= 0 && Number.isInteger(afterSales) && afterSales >= 0 && Number.isFinite(before) && Number.isFinite(after),
            effect: relativeEffectSummary(before, after),
            baseline: { metricValue: before, sales: baselineSales, rawSales: baselineSales, rate: before, visits: baselineVisits, windowStartAt: baselineAnchor.snapshot.at, windowEndAt: baseline.at, windowDays: baselineAnchor.actualDays },
            current: { metricValue: after, sales: afterSales, rawSales: afterSales, rate: after, visits: currentVisits, windowStartAt: currentAnchor.snapshot.at, windowEndAt: current.at, windowDays: currentAnchor.actualDays, rateRatioInterval: direction.comparison },
            winnerReady: direction.winner && Number(afterSales) >= 2,
            underperformedReady: direction.underperformed && Number(baselineSales) >= 2,
        };
    }

    function updateExperimentEvaluations(record, evaluatedAt = nowIso()) {
        const history = Array.isArray(record.history) ? record.history.map(normalizeSnapshot).filter(Boolean).sort((a, b) => String(a.at).localeCompare(String(b.at))) : [];
        const published = (record.improvements || []).filter((entry) => entry?.action === 'UPDATE' && entry?.status === 'published' && entry?.publishedAt).sort((a, b) => String(a.publishedAt).localeCompare(String(b.publishedAt)));
        const terminalStates = new Set(['winner', 'underperformed', 'inconclusive', 'contaminated', 'stopped']);
        published.forEach((entry, index) => {
            const requiresMethodMigration = Number(entry.experiment?.methodVersion) !== 2;
            entry.experiment = { state: 'observing', durationDays: HEALTH_RULES.experimentDays, primaryMetric: primaryMetricForFields(entry.fields || []), ...(entry.experiment || {}), methodVersion: 2 };
            const finishExperiment = (nextState, at = evaluatedAt) => {
                entry.experiment.state = nextState;
                entry.experiment.waitingForSnapshot = false;
                if (!entry.experiment.evaluatedAt) entry.experiment.evaluatedAt = at;
            };
            const startAt = entry.publishedAt;
            const evaluateAt = entry.experiment.evaluateAt || addDays(startAt, HEALTH_RULES.experimentDays);
            const evaluationDeadlineAt = addDays(evaluateAt, HEALTH_RULES.experimentEvaluationGraceDays);
            const day = Math.max(0, Math.floor(daysBetween(evaluatedAt, startAt) || 0));
            Object.assign(entry.experiment, { startAt, evaluateAt, evaluationDeadlineAt, day });
            if (terminalStates.has(entry.experiment.state) && entry.experiment.evaluatedAt && !requiresMethodMigration) return;
            if (requiresMethodMigration) {
                entry.experiment.state = 'observing';
                delete entry.experiment.evaluatedAt; delete entry.experiment.evaluationSnapshotAt;
                delete entry.experiment.effectPercent; delete entry.experiment.effectAbsolute; delete entry.experiment.effectKind;
                delete entry.experiment.baseline; delete entry.experiment.current;
            }
            if (published[index + 1] && validTime(published[index + 1].publishedAt) < validTime(evaluateAt)) {
                entry.experiment.contaminatedAt = published[index + 1].publishedAt; finishExperiment('contaminated', entry.experiment.contaminatedAt); return;
            }
            if (day < HEALTH_RULES.experimentDays) { entry.experiment.state = 'observing'; entry.experiment.waitingForSnapshot = false; return; }
            const baselineCandidates = [normalizeSnapshot(entry.baselineSnapshot), ...history]
                .filter((snapshot) => snapshot && validTime(snapshot.at) <= validTime(startAt))
                .sort((left, right) => validTime(left.at) - validTime(right.at));
            const baseline = baselineCandidates.at(-1) || null;
            const baselineAge = baseline ? daysBetween(startAt, baseline.at) : null;
            if (!baseline || !Number.isFinite(baselineAge) || baselineAge < 0 || baselineAge > HEALTH_RULES.experimentBaselineMaxAgeDays
                || !normalizeMetricContract(baseline.metricContract) || normalizeListingState(baseline.listingState) !== 'active' || Number(baseline.stock) <= 0) {
                entry.experiment.invalidReason = 'invalid-baseline'; finishExperiment('inconclusive'); return;
            }
            const metric = entry.experiment.primaryMetric || primaryMetricForFields(entry.fields || []);
            const candidates = history.filter((snapshot) => validTime(snapshot.at) >= validTime(evaluateAt)
                && validTime(snapshot.at) <= validTime(evaluationDeadlineAt) && validTime(snapshot.at) <= validTime(evaluatedAt));
            const nextPublished = published[index + 1] || null;
            let selected = null; let contamination = ''; let lastInvalidReason = 'missing-evaluation-snapshot';
            for (const current of candidates) {
                if (nextPublished && validTime(nextPublished.publishedAt) <= validTime(current.at)) { contamination = 'subsequent-publish'; break; }
                contamination = experimentExposureIssue(history, baseline, current);
                if (contamination) break;
                const result = experimentMetricResult(metric, baseline, current, history);
                if (result.valid) { selected = { current, result }; break; }
                lastInvalidReason = result.reason || 'invalid-metric-window';
            }
            if (!contamination && nextPublished && validTime(nextPublished.publishedAt) <= Math.min(validTime(evaluatedAt) || 0, validTime(evaluationDeadlineAt) || 0)) contamination = 'subsequent-publish';
            if (contamination) {
                entry.experiment.invalidReason = contamination;
                entry.experiment.contaminatedAt = nextPublished && contamination === 'subsequent-publish' ? nextPublished.publishedAt : evaluatedAt;
                finishExperiment('contaminated', entry.experiment.contaminatedAt); return;
            }
            if (!selected) {
                entry.experiment.invalidReason = lastInvalidReason;
                if ((validTime(evaluatedAt) || 0) <= (validTime(evaluationDeadlineAt) || 0)) {
                    entry.experiment.state = 'observing'; entry.experiment.waitingForSnapshot = true; return;
                }
                finishExperiment('inconclusive'); return;
            }
            const { current, result } = selected;
            const evaluationDelay = daysBetween(current.at, evaluateAt);
            entry.experiment.baseline = result.baseline;
            entry.experiment.current = result.current;
            entry.experiment.effectPercent = result.effect.percent;
            entry.experiment.effectAbsolute = result.effect.absolute;
            entry.experiment.effectKind = result.effect.kind;
            entry.experiment.evaluationSnapshotAt = current.at;
            entry.experiment.baselineAgeDays = Math.round(baselineAge * 10) / 10;
            entry.experiment.evaluationDelayDays = Math.round(evaluationDelay * 10) / 10;
            entry.experiment.baselineSourceTimeStatus = baseline.metricContract?.sourceTimeStatus || 'unknown';
            entry.experiment.evaluationSourceTimeStatus = current.metricContract?.sourceTimeStatus || 'unknown';
            delete entry.experiment.invalidReason;
            const materiallyPositive = result.effect.kind === 'from-zero' ? result.winnerReady : Number.isFinite(result.effect.percent) && result.effect.percent >= 15;
            const materiallyNegative = Number.isFinite(result.effect.percent) && result.effect.percent <= -15;
            if (!result.valid || result.effect.kind === 'invalid') finishExperiment('inconclusive');
            else if (result.winnerReady && materiallyPositive) finishExperiment('winner');
            else if (result.underperformedReady && materiallyNegative) finishExperiment('underperformed');
            else finishExperiment('inconclusive');
        });
        return record;
    }

    function historyMetricQuality(snapshot, metric) {
        if (!Number.isFinite(snapshot?.[metric])) return 'missing';
        if (!snapshotMetricIsCurrent(snapshot, metric)) return 'stale';
        if (metric === 'revenue' && !currencyIdentity(snapshot.currency)) return 'missing';
        const contract = normalizeMetricContract(snapshot.metricContract);
        if (!contract) return 'legacy';
        if (DECISION_COUNT_FIELDS.includes(metric) && contract.countPrecision?.[metric] !== 'exact') return 'approximate';
        return 'exact';
    }

    function buildHistoryChartModel(history, metric) {
        const snapshots = (Array.isArray(history) ? history : []).map(normalizeSnapshot).filter(Boolean).sort((a, b) => String(a.at).localeCompare(String(b.at)));
        const qualityCounts = { exact: 0, approximate: 0, legacy: 0, stale: 0, missing: 0 };
        const qualities = snapshots.map((snapshot) => {
            const quality = historyMetricQuality(snapshot, metric);
            qualityCounts[quality] += 1;
            return quality;
        });
        const rawValues = snapshots.map((snapshot, index) => ['missing', 'stale'].includes(qualities[index]) ? null : finiteOrNull(snapshot[metric]));
        const currencyEntries = metric === 'revenue' ? snapshots.map((snapshot, index) => Number.isFinite(rawValues[index]) ? {
            identity: currencyIdentity(snapshot.currency), marker: normalizeSpace(snapshot.currency),
        } : null) : [];
        const currencyDisplay = new Map();
        currencyEntries.forEach((entry) => { if (entry?.identity) currencyDisplay.set(entry.identity, entry.marker); });
        const currencyIdentities = [...currencyDisplay.keys()];
        const activeCurrencyIdentity = metric === 'revenue' ? [...currencyEntries].reverse().find((entry) => entry?.identity)?.identity || '' : '';
        const activeCurrency = activeCurrencyIdentity ? currencyDisplay.get(activeCurrencyIdentity) || '' : '';
        const comparableCurrencies = metric !== 'revenue' || currencyIdentities.length <= 1;
        const values = rawValues.map((value, index) => {
            if (!Number.isFinite(value)) return null;
            if (metric !== 'revenue' || comparableCurrencies) return value;
            return currencyEntries[index]?.identity === activeCurrencyIdentity ? value : null;
        });
        const excludedCurrencyCount = rawValues.filter((value, index) => Number.isFinite(value)
            && metric === 'revenue' && !comparableCurrencies && currencyEntries[index]?.identity !== activeCurrencyIdentity).length;
        const finiteValues = values.filter(Number.isFinite);
        const currencies = [...currencyDisplay.values()];
        const empty = {
            metric, snapshots, segments: [], points: [], min: null, max: null, domainMin: null, domainMax: null,
            tone: 'neutral', qualityCounts, currencies, currencyIdentities, activeCurrency, activeCurrencyIdentity,
            comparableCurrencies, excludedCurrencyCount, width: 320, height: 92,
        };
        if (snapshots.length < 2 || finiteValues.length < 2) return empty;
        const width = 320; const height = 92; const paddingX = 10; const paddingY = 10;
        const min = Math.min(...finiteValues); const max = Math.max(...finiteValues); const flat = min === max;
        const domainMin = flat ? min : Math.min(0, min); const domainMax = flat ? max : Math.max(0, max);
        const range = domainMax - domainMin || 1;
        const times = snapshots.map((snapshot) => validTime(snapshot.at));
        const firstTime = Math.min(...times); const lastTime = Math.max(...times); const timeRange = lastTime - firstTime;
        const coordinates = values.map((value, index) => Number.isFinite(value) ? {
            index, value, at: snapshots[index].at, quality: qualities[index],
            currency: metric === 'revenue' ? normalizeSpace(snapshots[index].currency) : '',
            currencyIdentity: metric === 'revenue' ? currencyIdentity(snapshots[index].currency) : '',
            decisionGrade: qualities[index] === 'exact',
            x: paddingX + (timeRange > 0 ? (times[index] - firstTime) / timeRange : index / Math.max(1, snapshots.length - 1)) * (width - paddingX * 2),
            y: flat
                ? (value === 0 ? height - paddingY : height / 2)
                : paddingY + ((domainMax - value) / range) * (height - paddingY * 2),
        } : null);
        const segments = []; let current = [];
        coordinates.forEach((point) => {
            if (point) current.push(point);
            else if (current.length) { segments.push(current); current = []; }
        });
        if (current.length) segments.push(current);
        const points = coordinates.filter(Boolean);
        const toneSegment = comparableCurrencies && segments.length === 1 ? segments[0] : null;
        const toneReady = toneSegment?.length >= 2 && toneSegment[0].decisionGrade && toneSegment.at(-1).decisionGrade;
        const change = toneReady ? toneSegment.at(-1).value - toneSegment[0].value : 0;
        return {
            metric, snapshots, segments, points, min, max, domainMin, domainMax,
            tone: toneReady ? (change > 0 ? 'up' : change < 0 ? 'down' : 'neutral') : 'neutral', width, height, qualityCounts,
            currencies, currencyIdentities, activeCurrency, activeCurrencyIdentity, comparableCurrencies, excludedCurrencyCount,
        };
    }

    function buildExperimentTimeline(record) {
        const terminal = new Set(['winner', 'underperformed', 'inconclusive', 'contaminated', 'stopped']);
        const events = [];
        (Array.isArray(record?.improvements) ? record.improvements : []).forEach((improvement) => {
            const experiment = improvement?.experiment || {};
            if (improvement?.at) events.push({ at: improvement.at, key: 'timelinePlanned', type: 'planned', improvement, experiment });
            if (improvement?.publishedAt) events.push({ at: improvement.publishedAt, key: 'timelinePublished', type: 'published', improvement, experiment });
            if (experiment.startAt) events.push({ at: experiment.startAt, key: 'timelineObserving', type: 'observing', improvement, experiment });
            if (experiment.evaluateAt) events.push({ at: experiment.evaluateAt, key: 'timelineEvaluationDue', type: 'due', improvement, experiment });
            if (terminal.has(experiment.state)) events.push({ at: experiment.evaluatedAt || experiment.contaminatedAt || experiment.evaluateAt || improvement.publishedAt || improvement.at, key: 'timelineEvaluated', type: experiment.state, improvement, experiment });
        });
        const causalOrder = { planned: 0, published: 1, observing: 2, due: 3, winner: 4, underperformed: 4, inconclusive: 4, contaminated: 4, stopped: 4 };
        return events.filter((event) => validTime(event.at)).sort((left, right) => validTime(left.at) - validTime(right.at) || (causalOrder[left.type] ?? 9) - (causalOrder[right.type] ?? 9));
    }

    function routeKind(pathname = location.pathname) {
        if (/\/your\/shops\/[^/]+\/tools\/listings\/?$/i.test(pathname)) return 'listings';
        if (/\/your\/shops\/[^/]+\/listing-editor\/edit\/\d+\/?$/i.test(pathname)) return 'editor';
        return 'unsupported';
    }

    function currentListingId(pathname = location.pathname) {
        return pathname.match(/\/listing-editor\/edit\/(\d+)\/?$/i)?.[1] || '';
    }

    function statsViewEnabled(href = location.href) {
        try {
            const values = new URL(href, location.href).searchParams.getAll('stats');
            return values.length === 1 && values[0].toLowerCase() === 'true';
        } catch { return false; }
    }

    function elementIsUsable(element) {
        if (!element || element.closest?.('[hidden],[aria-hidden="true"],[inert]')) return false;
        try {
            if (typeof element.checkVisibility === 'function' && !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
        } catch { /* Fall back to computed style. */ }
        try {
            const style = typeof getComputedStyle === 'function' ? getComputedStyle(element) : null;
            if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
        } catch { /* A detached transient node is not accepted below. */ }
        return !document.documentElement?.contains || document.documentElement.contains(element);
    }

    const ListingPageAdapter = {
        cardRoots() {
            return Array.from(document.querySelectorAll('li.wt-block-grid__item')).filter(elementIsUsable);
        },
        cardLinks(roots = this.cardRoots()) {
            const found = [];
            const seen = new Set();
            roots.forEach((card) => {
                const candidates = Array.from(card.querySelectorAll('a[href*="/listing-editor/edit/"]')).filter(elementIsUsable);
                const link = candidates.find((item) => item.matches('a.card-body'))
                    || candidates.find((item) => !item.closest('[role="menu"],.card-actions') && item.querySelector('.card-title, h2[title], h2'));
                const id = link?.href.match(/\/listing-editor\/edit\/(\d+)/i)?.[1];
                if (id && !seen.has(id)) { seen.add(id); found.push(link); }
            });
            return found;
        },
        metricSections(link) {
            return Array.from(link?.querySelectorAll('.card-meta') || []).filter(elementIsUsable).map((container) => {
                const heading = container.querySelector('h6');
                if (!heading || !elementIsUsable(heading)) return null;
                const rows = Array.from(container.querySelectorAll('.card-meta-row .card-meta-row-item')).filter(elementIsUsable)
                    .map((item) => normalizeSpace(item.textContent)).filter(Boolean);
                return { heading: normalizeSpace(heading.textContent), rows };
            }).filter(Boolean);
        },
        metricRows(link) {
            return this.metricSections(link).flatMap((section) => section.rows);
        },
        parseCard(link, verifiedShopKey = currentShopKey(), verifiedListingState = pageListingState()) {
            const card = link?.closest('li.wt-block-grid__item');
            if (!card || !elementIsUsable(card) || !elementIsUsable(link)) return null;
            const editId = link.href.match(/\/listing-editor\/edit\/(\d+)/i)?.[1] || '';
            const publicLink = card.querySelector('a[href*="/listing/"]');
            const publicId = publicLink?.href.match(/\/listing\/(\d+)(?:\/|$)/i)?.[1] || '';
            const statsLink = card.querySelector('a[href*="/stats/listings/"]');
            const statsId = statsLink?.href.match(/\/stats\/listings\/(\d+)/i)?.[1] || '';
            const ids = [editId, publicId, statsId].filter(Boolean);
            if (!editId || new Set(ids).size > 1) return null;
            const title = normalizeSpace(card.querySelector('.card-title, h2[title], h2')?.getAttribute('title') || card.querySelector('.card-title, h2')?.textContent);
            const sku = normalizeSpace(card.querySelector('.card-meta-row-sku [data-value="true"], .card-meta-row-sku')?.textContent);
            const quantityText = normalizeSpace(card.querySelector('.card-meta-row-quantity')?.textContent);
            const priceText = normalizeSpace(card.querySelector('.card-meta-row-price span, .card-meta-row-price')?.textContent);
            const renewalLabel = normalizeSpace(card.querySelector('.card-meta-row-status')?.textContent);
            const image = card.querySelector('.card-img-wrap img, img');
            const parsedMetrics = parseScopedListingMetrics(this.metricSections(link));
            const metrics = parsedMetrics.metrics || {};
            const priceCurrency = currencyMarker(priceText);
            const metricCurrency = String(metrics.currency || '');
            const currency = resolveCardCurrency(priceCurrency, metricCurrency);
            if (!verifiedShopKey || !normalizeListingState(verifiedListingState) || !title
                || currencyMarkerIsInvalid(priceText) || !currency || !parsedMetrics.valid
                || !HEALTH_METRIC_FIELDS.every((field) => Number.isFinite(metrics[field]))) return null;
            const listingState = normalizeListingState(verifiedListingState);
            return {
                listingId: editId, title, sku, editUrl: link.href, shopKey: verifiedShopKey,
                publicUrl: publicLink?.href || '', imageUrl: image?.currentSrc || image?.src || '',
                stock: parseCount(quantityText, ['in stock', 'stokta', 'stock', 'stok']),
                price: parsePriceRange(priceText), currency,
                listingState, statusLabel: listingStateLabel(listingState), renewalLabel,
                visits: metrics.visits, favorites: metrics.favorites, sales: metrics.sales,
                revenue: metrics.revenue, renewals: metrics.renewals, metricContract: parsedMetrics.contract, capturedAt: nowIso(),
            };
        },
        scan(links = this.cardLinks()) {
            const shopKey = currentShopKey();
            const listingState = pageListingState();
            if (!shopKey || !listingState || !statsViewEnabled()) return [];
            return links.map((link) => this.parseCard(link, shopKey, listingState)).filter(Boolean);
        },
        contentSignature(listings = this.scan()) {
            return listings.map((item) => String(item.listingId)).sort().join('\u001f');
        },
        readSignature(listings) {
            return JSON.stringify([...listings].sort((left, right) => String(left.listingId).localeCompare(String(right.listingId))).map((item) => [
                String(item.listingId), item.title, item.sku, item.listingState, item.statusLabel, item.renewalLabel, item.stock,
                item.price?.min, item.price?.max, item.price?.label || '', item.currency || '',
                item.visits, item.favorites, item.sales, item.revenue, item.renewals,
                item.metricContract?.id || '', item.metricContract?.headings || null, item.metricContract?.countPrecision || null,
            ]));
        },
        paginationNav() {
            const candidates = Array.from(document.querySelectorAll('nav[aria-label="Listings pagination"],nav[aria-label*="pagination" i],nav[aria-label*="sayfa" i]'));
            return candidates.find(elementIsUsable) || null;
        },
        pageSelect(nav = this.paginationNav()) {
            const host = nav?.querySelector('clg-select');
            return host?.shadowRoot?.querySelector('select') || nav?.querySelector('select') || null;
        },
        pageInfo(observedCardCount = null) {
            const nav = this.paginationNav();
            const cardCount = Number.isInteger(observedCardCount) && observedCardCount >= 0 ? observedCardCount : this.cardLinks().length;
            let routeCurrent = null;
            let routeOffset = 0;
            let routePageValid = true;
            if (routeKind() === 'listings') {
                try {
                    const params = new URL(location.href).searchParams;
                    const values = params.getAll('page');
                    if (!values.length) routeCurrent = 1;
                    else if (values.length === 1 && /^[1-9]\d*$/.test(values[0])) routeCurrent = Number(values[0]);
                    else routePageValid = false;
                    const offsets = params.getAll('offset');
                    if (!offsets.length) routeOffset = 0;
                    else if (offsets.length === 1 && offsets[0] === '0') routeOffset = 0;
                    else routePageValid = false;
                } catch { routePageValid = false; }
            }
            if (!nav) {
                const ambiguous = cardCount >= ANALYSIS_BATCH_SIZE;
                let explicitPagedLocation = false;
                try {
                    const url = new URL(location.href);
                    explicitPagedLocation = (routeCurrent ?? Number(url.searchParams.get('page') || 1)) > 1 || routeOffset > 0 || Number(url.searchParams.get('offset') || 0) > 0;
                } catch { explicitPagedLocation = true; }
                return { current: 1, total: 1, valid: routePageValid && cardCount > 0 && !ambiguous && !explicitPagedLocation, hasPagination: false, ambiguous, explicitPagedLocation };
            }
            const text = normalizeSpace(nav.textContent);
            const match = text.match(/(?:Page|Sayfa)\s*(\d+).*?(?:of|\/)\s*(\d+)/i);
            const select = this.pageSelect(nav);
            const current = routeCurrent ?? Number(select?.value || match?.[1]);
            const total = Number(match?.[2] || select?.options?.length);
            const valid = routePageValid && Number.isInteger(current) && Number.isInteger(total) && current >= 1 && total >= 1 && current <= total;
            return { current: valid ? current : 0, total: valid ? total : 0, valid, hasPagination: true, ambiguous: false };
        },
        pageSignature(listings = this.scan(), page = this.pageInfo().current) {
            const ids = listings.map((item) => String(item.listingId)).sort();
            return `${page}|${ids.length}|${ids.join('\u001f')}`;
        },
        snapshotState(options = {}) {
            const roots = this.cardRoots();
            const pageInfo = this.pageInfo(roots.length);
            const links = this.cardLinks(roots);
            const listings = this.scan(links);
            const linkIds = links.map((link) => link?.href?.match(/\/listing-editor\/edit\/(\d+)/i)?.[1] || '');
            const listingIds = listings.map((listing) => String(listing.listingId || ''));
            const expectedCount = Math.max(0, Number(options.expectedCount) || 0);
            const cardinalityValid = roots.length > 0 && roots.length === links.length && links.length === listings.length;
            const idsValid = listingIds.every((id) => /^\d+$/.test(id)) && linkIds.every((id) => /^\d+$/.test(id))
                && new Set(listingIds).size === listingIds.length && new Set(linkIds).size === linkIds.length
                && listingIds.every((id) => linkIds.includes(id));
            let valid = pageInfo.valid && cardinalityValid && idsValid;
            const contractIds = uniqueStrings(listings.map((listing) => listing.metricContract?.id).filter(Boolean));
            valid = valid && contractIds.length === 1 && contractIds[0] === LISTING_METRIC_CONTRACT.id;
            if (options.requirePagination && !pageInfo.hasPagination) valid = false;
            if (expectedCount) valid = valid && listings.length === expectedCount;
            else if (pageInfo.total > 1 && pageInfo.current < pageInfo.total) valid = valid && listings.length === ANALYSIS_BATCH_SIZE;
            else valid = valid && listings.length <= ANALYSIS_BATCH_SIZE;
            const signature = valid ? JSON.stringify([pageInfo.current, pageInfo.total, this.readSignature(listings)]) : '';
            return { valid, pageInfo, roots, rootCount: roots.length, links, listings, signature, metricContractId: valid ? contractIds[0] : '' };
        },
        async readStable(options = {}) {
            const timeout = window.__MAKAYTRON_LISTING_TEST__ === true
                ? (Number(options.timeout) || 600)
                : (Number(options.timeout) || COLLECTION_STABLE_READ_TIMEOUT_MS);
            const interval = window.__MAKAYTRON_LISTING_TEST__ === true ? 10 : COLLECTION_STABLE_SAMPLE_INTERVAL_MS;
            const deadline = Date.now() + timeout;
            let previousSignature = '';
            let stableSamples = 0;
            let deferredUnboundedPage = null;
            while (Date.now() <= deadline) {
                const snapshot = this.snapshotState(options);
                if (snapshot.valid) {
                    const sameSignature = snapshot.signature === previousSignature;
                    const requiresFullObservation = !Number(options.expectedCount)
                        && snapshot.pageInfo.current === snapshot.pageInfo.total;
                    if (!sameSignature || !requiresFullObservation) deferredUnboundedPage = null;
                    stableSamples = sameSignature ? stableSamples + 1 : 1;
                    previousSignature = snapshot.signature;
                    if (stableSamples >= COLLECTION_STABLE_SAMPLES) {
                        if (!requiresFullObservation) return snapshot;
                        deferredUnboundedPage = snapshot;
                    }
                } else {
                    previousSignature = '';
                    stableSamples = 0;
                    deferredUnboundedPage = null;
                }
                await sleep(interval);
            }
            return deferredUnboundedPage;
        },
        nextButton() {
            const nav = this.paginationNav();
            const matchesNext = (button) => /^(?:next|next page|sonraki|sonraki sayfa)$/i.test(normalizeSpace(button?.getAttribute('aria-label')));
            const shadowButtons = Array.from(nav?.querySelectorAll('clg-icon-button') || []).map((host) => host.shadowRoot?.querySelector('button')).filter(Boolean);
            return shadowButtons.find(matchesNext) || Array.from(nav?.querySelectorAll('button') || []).find(matchesNext) || null;
        },
        pageControl(page) {
            const nav = this.paginationNav();
            const select = this.pageSelect(nav);
            const option = Array.from(select?.options || []).find((item) => Number(item.value || normalizeSpace(item.textContent)) === Number(page));
            if (select && option) return { type: 'select', element: select, value: option.value };
            const candidates = Array.from(nav?.querySelectorAll('a[href],button') || []);
            const element = candidates.find((item) => Number(normalizeSpace(item.textContent)) === Number(page) || Number(item.getAttribute('aria-label')?.match(/\d+/)?.[0]) === Number(page));
            return element ? { type: 'click', element } : null;
        },
        isDisabled(button) {
            return !button || Boolean(button.disabled) || button.getAttribute('aria-disabled') === 'true';
        },
    };

    function setNativeValue(element, value) {
        if (!element) return false;
        const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (setter) setter.call(element, String(value ?? ''));
        else element.value = String(value ?? '');
        element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(value ?? '') }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
    }

    const PILL_REMOVE_SELECTOR = [
        'button.le-chip-remove',
        'button[aria-label^="Delete tag "]',
        'button[aria-label^="Delete material "]',
        'button[aria-label^="Etiketi sil "]',
        'button[aria-label^="Malzemeyi sil "]',
        'button[aria-label="Remove"]',
        'button[aria-label="Kaldır"]',
    ].join(',');

    function pillItemValue(item) {
        if (!item?.querySelector(PILL_REMOVE_SELECTOR)) return '';
        const clone = item.cloneNode(true);
        clone.querySelectorAll('button,[aria-label="Remove"],[aria-label="Kaldır"]').forEach((button) => button.remove());
        return normalizeSpace(clone.textContent).replace(/All \d+ used|Tüm \d+.*$/i, '').trim();
    }

    function pillFieldState(container) {
        const items = Array.from(container?.querySelectorAll?.('li') || []);
        const parsed = items.map(pillItemValue);
        return { values: parsed.filter(Boolean), complete: parsed.every(Boolean) };
    }

    function pillValues(container) {
        return pillFieldState(container).values;
    }

    const PILL_READ_INTEGRITY = Symbol('meli-pill-read-integrity');

    function isInactiveStatus(value) {
        return /^(?:Inactive|Deactivated|Pasif|Devre dışı)$/i.test(normalizeSpace(value));
    }

    function isActiveStatus(value) {
        return /^(?:Active|Aktif)$/i.test(normalizeSpace(value));
    }

    const DEACTIVATE_ACTION_LABEL = /^(?:Deactivate|Devre dışı bırak|Pasifleştir)$/iu;
    const DEACTIVATE_DIALOG_LABEL = /^(?:Deactivate listing\?|Deactivate listing|Listing(?:'i)? devre dışı bırak\?|İlan(?:ı)? devre dışı bırak\?)$/iu;
    const CANCEL_ACTION_LABEL = /^(?:Cancel|İptal)$/iu;
    const DEACTIVATE_DIALOG_READY_TIMEOUT_MS = 10000;

    function controlIsEnabled(element) {
        return Boolean(element && elementIsUsable(element) && !element.disabled && element.getAttribute?.('aria-disabled') !== 'true');
    }

    function hasDeletionSemantics(element) {
        const values = [
            element?.getAttribute?.('aria-label'), element?.getAttribute?.('data-action'),
            element?.getAttribute?.('data-test'), element?.id,
        ].map((value) => normalizeSpace(value)).filter(Boolean);
        return values.some((value) => /(?:^|[\s_-])(?:delete|remove|sil|kaldır)(?:$|[\s_-])/iu.test(value));
    }

    async function waitFor(predicate, timeout = 5000, interval = 100) {
        const started = Date.now();
        while (Date.now() - started < timeout) {
            try { const result = predicate(); if (result) return result; } catch { /* retry */ }
            await sleep(interval);
        }
        return null;
    }

    const EditorAdapter = {
        root() {
            const title = document.querySelector('#listing-title-input');
            return title?.closest?.('main,[role="main"]') || document.querySelector('main,[role="main"]') || document;
        },
        visibleTitle() { return normalizeSpace(document.querySelector('header h3[role="button"].wt-text-title-large')?.textContent); },
        ready() {
            const title = document.querySelector('#listing-title-input');
            const description = document.querySelector('#listing-description-textarea');
            return Boolean(title && description && normalizeSpace(title.value || this.visibleTitle()) && String(description.value || '').trim());
        },
        read() {
            const tagsField = document.querySelector('#field-tags');
            const materialsField = document.querySelector('#field-materials');
            const tags = pillFieldState(tagsField);
            const materials = pillFieldState(materialsField);
            const editor = {
                title: document.querySelector('#listing-title-input')?.value || this.visibleTitle(),
                description: document.querySelector('#listing-description-textarea')?.value || '',
                tags: tags.values, materials: materials.values,
                quantity: document.querySelector('#listing-quantity-input')?.value || '',
                sku: document.querySelector('#listing-sku-input')?.value || '',
            };
            Object.defineProperty(editor, PILL_READ_INTEGRITY, { value: Object.freeze({ tags: tags.complete, materials: materials.complete }) });
            return editor;
        },
        async captureCurrent(expected = {}) {
            const listingId = currentListingId();
            const shopKey = currentShopKey();
            if (!listingId || !shopKey || !this.ready()) return null;
            const routeKey = routeLocationKey();
            const editUrl = String(location.href || '');
            const editor = this.read();
            if ((expected.listingId && String(expected.listingId) !== listingId) || (expected.routeKey && String(expected.routeKey) !== routeKey)) return null;
            const record = await Store.getRecord(listingId) || {
                schema: APP.schema, listingId, meta: { title: editor.title, editUrl, shopKey, lastSeenAt: nowIso() },
                history: [], improvements: [], proposal: null,
            };
            if (currentListingId() !== listingId || routeLocationKey() !== routeKey || String(location.href || '') !== editUrl) return null;
            record.editor = { ...editor, capturedAt: nowIso() };
            record.meta = { ...record.meta, title: record.editor.title || record.meta?.title || '', editUrl, shopKey, lastSeenAt: nowIso() };
            await Store.putRecord(record);
            return record;
        },
        async syncPills(fieldSelector, inputSelector, buttonSelector, desiredValues, options = {}) {
            const guard = typeof options.guard === 'function' ? options.guard : () => true;
            const beforeMutation = typeof options.beforeMutation === 'function' ? options.beforeMutation : null;
            const guarded = () => {
                try { return guard() === true; } catch { return false; }
            };
            const mutationAllowed = async () => {
                try { if (beforeMutation) await beforeMutation(); } catch { return false; }
                return guarded();
            };
            const liveField = () => document.querySelector(fieldSelector);
            if (!guarded() || !liveField() || !document.querySelector(inputSelector) || !document.querySelector(buttonSelector)) return false;
            const liveValues = () => {
                const snapshot = pillFieldState(liveField());
                return snapshot.complete ? snapshot.values : null;
            };
            const desired = uniqueStrings(desiredValues);
            const desiredLower = new Set(desired.map((value) => value.toLocaleLowerCase()));
            const initialValues = liveValues();
            if (!initialValues) return false;
            const removals = initialValues.filter((value) => !desiredLower.has(value.toLocaleLowerCase()));
            for (const value of removals) {
                const item = Array.from(liveField()?.querySelectorAll('li') || []).find((candidate) => (
                    pillItemValue(candidate).toLocaleLowerCase() === value.toLocaleLowerCase()
                ));
                const remove = item?.querySelector(PILL_REMOVE_SELECTOR);
                if (!remove) return false;
                if (!await mutationAllowed()) return false;
                remove.click();
                const removed = await waitFor(() => {
                    if (!guarded()) return null;
                    const values = liveValues();
                    return values && !values.some((itemValue) => itemValue.toLocaleLowerCase() === value.toLocaleLowerCase());
                }, 3000);
                if (!removed || !guarded()) return false;
            }
            const valuesAfterRemoval = liveValues();
            if (!valuesAfterRemoval) return false;
            let current = new Set(valuesAfterRemoval.map((value) => value.toLocaleLowerCase()));
            for (const value of desired) {
                if (current.has(value.toLocaleLowerCase())) continue;
                const inputReady = await waitFor(() => {
                    if (!guarded()) return null;
                    const input = document.querySelector(inputSelector);
                    return input && !input.disabled ? input : null;
                }, 3000);
                if (!inputReady || !await mutationAllowed()) return false;
                setNativeValue(inputReady, value);
                await sleep(120);
                const addReady = await waitFor(() => {
                    if (!guarded()) return null;
                    const button = document.querySelector(buttonSelector);
                    return button && !button.disabled && button.getAttribute('aria-disabled') !== 'true' ? button : null;
                }, 3000);
                if (!addReady || !await mutationAllowed()) return false;
                addReady.click();
                const added = await waitFor(() => {
                    if (!guarded()) return null;
                    const values = liveValues();
                    return values && values.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase());
                }, 3000);
                if (!added || !guarded()) return false;
                const addedValues = liveValues();
                if (!addedValues) return false;
                current = new Set(addedValues.map((item) => item.toLocaleLowerCase()));
            }
            const completedValues = liveValues();
            if (!completedValues) return false;
            const finalValues = completedValues.map((value) => value.toLocaleLowerCase());
            const finalSet = new Set(finalValues);
            return finalValues.length === desiredLower.size && finalSet.size === desiredLower.size && desired.every((value) => finalSet.has(value.toLocaleLowerCase()));
        },
        preflightProposal(proposal) {
            const prepared = validateEditableProposal(proposal);
            const selectors = {
                title: ['#listing-title-input'],
                description: ['#listing-description-textarea'],
                tags: ['#field-tags', '#listing-tags-input', '#listing-tags-button'],
                materials: ['#field-materials', '#listing-materials-input', '#listing-materials-button'],
            };
            for (const field of prepared.fields) {
                const controls = selectors[field].map((selector) => document.querySelector(selector));
                const controlsThatMustStartEnabled = field === 'tags' || field === 'materials' ? [] : controls;
                const unreadablePills = (field === 'tags' || field === 'materials') && controls[0] && !pillFieldState(controls[0]).complete;
                if (controls.some((control) => !control) || controlsThatMustStartEnabled.some((control) => control.disabled) || unreadablePills) {
                    void trackTelemetryError('selector_listing_editor');
                    throw new Error(t('formNotReady'));
                }
            }
            return prepared;
        },
        changedFields(before, after, fields = EDITABLE_FIELDS) {
            return fields.filter((field) => {
                if (field === 'title') return normalizeSpace(before?.title) !== normalizeSpace(after?.title);
                if (field === 'description') return String(before?.description ?? '') !== String(after?.description ?? '');
                if (field === 'tags' || field === 'materials') return !sameStringSet(before?.[field], after?.[field]);
                return false;
            });
        },
        async restore(before, fields = EDITABLE_FIELDS) {
            try {
                if (fields.includes('title')) setNativeValue(document.querySelector('#listing-title-input'), String(before?.title || ''));
                if (fields.includes('description')) setNativeValue(document.querySelector('#listing-description-textarea'), String(before?.description || ''));
                if (fields.includes('tags') && !await this.syncPills('#field-tags', '#listing-tags-input', '#listing-tags-button', before?.tags || [])) return false;
                if (fields.includes('materials') && !await this.syncPills('#field-materials', '#listing-materials-input', '#listing-materials-button', before?.materials || [])) return false;
                return Boolean(await waitFor(() => this.changedFields(before, this.read(), fields).length === 0 && this.formIsClean() === true, 3000));
            } catch { return false; }
        },
        async applyProposal(proposal, expectedBefore = null, options = {}) {
            if (!this.ready()) { void trackTelemetryError('selector_listing_editor'); throw new Error(t('formNotReady')); }
            const prepared = this.preflightProposal(proposal);
            const fields = prepared.fields;
            const before = this.read();
            if (expectedBefore && !editorMatchesSnapshot(before, expectedBefore)) {
                throw new Error('The Etsy editor changed immediately before proposal application.');
            }
            const expected = {
                title: String(before.title ?? ''), description: String(before.description ?? ''),
                tags: [...before.tags], materials: [...before.materials],
                quantity: String(before.quantity ?? ''), sku: String(before.sku ?? ''),
            };
            const expectedListingId = String(options.listingId || '');
            const assertLease = typeof options.assertLease === 'function' ? options.assertLease : async () => true;
            let trustedInputConflict = false;
            const watchTrustedInput = (event) => {
                if (event.isTrusted === true && trustedEditorEventMayMutate(event) && isEditorSurfaceTarget(event.target)) trustedInputConflict = true;
            };
            const guard = (excludedField = '') => {
                if (trustedInputConflict || (expectedListingId && (routeKind() !== 'editor' || currentListingId() !== expectedListingId))) return false;
                const live = this.read();
                const integrity = live?.[PILL_READ_INTEGRITY];
                return integrity?.tags === true && integrity?.materials === true
                    && ['title', 'description', 'tags', 'materials', 'quantity', 'sku']
                        .filter((field) => field !== excludedField)
                        .every((field) => editorFieldMatches(field, live, expected));
            };
            const changed = [];
            TRUSTED_EDITOR_MUTATION_EVENTS.forEach((type) => document.addEventListener(type, watchTrustedInput, true));
            try {
                await assertLease();
                if (!guard() || this.formIsClean() !== true || !editorPublishIsDormant()) {
                    throw new Error('The Etsy editor changed immediately before proposal application.');
                }
                if (fields.includes('title') && normalizeSpace(before.title) !== prepared.title) {
                    await assertLease();
                    if (!guard()) throw new Error('The Etsy editor changed during proposal application.');
                    setNativeValue(document.querySelector('#listing-title-input'), prepared.title); changed.push('title');
                    expected.title = prepared.title;
                    if (!guard()) throw new Error('The Etsy title did not reach the requested state.');
                }
                if (fields.includes('description') && before.description !== prepared.description) {
                    await assertLease();
                    if (!guard()) throw new Error('The Etsy editor changed during proposal application.');
                    setNativeValue(document.querySelector('#listing-description-textarea'), prepared.description); changed.push('description');
                    expected.description = prepared.description;
                    if (!guard()) throw new Error('The Etsy description did not reach the requested state.');
                }
                if (fields.includes('tags')) {
                    await assertLease();
                    if (!guard()) throw new Error('The Etsy editor changed during proposal application.');
                    const success = await this.syncPills('#field-tags', '#listing-tags-input', '#listing-tags-button', prepared.tags, {
                        guard: () => guard('tags'), beforeMutation: assertLease,
                    });
                    if (success) expected.tags = [...prepared.tags];
                    if (!success || !guard()) { void trackTelemetryError('selector_listing_editor'); throw new Error('Etsy tags control did not reach the requested state.'); }
                    if (!sameStringSet(before.tags, prepared.tags)) changed.push('tags');
                }
                if (fields.includes('materials')) {
                    await assertLease();
                    if (!guard()) throw new Error('The Etsy editor changed during proposal application.');
                    const success = await this.syncPills('#field-materials', '#listing-materials-input', '#listing-materials-button', prepared.materials, {
                        guard: () => guard('materials'), beforeMutation: assertLease,
                    });
                    if (success) expected.materials = [...prepared.materials];
                    if (!success || !guard()) { void trackTelemetryError('selector_listing_editor'); throw new Error('Etsy materials control did not reach the requested state.'); }
                    if (!sameStringSet(before.materials, prepared.materials)) changed.push('materials');
                }
                if (!changed.length) throw new Error('The selected Etsy fields already match the proposal; nothing was changed.');
                return changed;
            } catch (error) {
                error.changedFields = this.changedFields(before, this.read(), fields);
                error.trustedInputConflict = trustedInputConflict;
                throw error;
            } finally {
                TRUSTED_EDITOR_MUTATION_EVENTS.forEach((type) => document.removeEventListener(type, watchTrustedInput, true));
            }
        },
        publishButton() { return document.querySelector('#shop-manager--listing-publish-edit,button[data-test="publish"]'); },
        statusTexts(allowModalBackground = false) {
            const candidates = Array.from(document.querySelectorAll('[data-unsaved-changes="true"],[data-test="save-status"],#save-state'));
            const visible = candidates.filter((element) => elementIsUsable(element)
                || (allowModalBackground && Boolean(element.offsetParent)));
            return uniqueStrings(visible.map((element) => normalizeSpace(element.textContent)));
        },
        statusText() {
            return this.statusTexts().join(' · ');
        },
        formIsClean(allowModalBackground = false) {
            const texts = this.statusTexts(allowModalBackground);
            let clean = false;
            let dirty = false;
            texts.forEach((text) => {
                if (/no unsaved changes|kaydedilmemiş değişiklik yok/i.test(text)) clean = true;
                else if (/unsaved changes?|kaydedilmemiş değişiklik/i.test(text)) dirty = true;
            });
            if (dirty) return false;
            if (clean) return true;
            return null;
        },
        deactivateMoreButton() {
            const root = this.root();
            const scope = root?.querySelector?.('#more-option-menu');
            if (!scope || scope.closest?.('[role="dialog"],[role="alertdialog"],[aria-modal="true"]')) return null;
            const candidates = Array.from(scope.querySelectorAll('button[aria-label="More options"],button[aria-label="Daha fazla seçenek"]'))
                .filter((button) => controlIsEnabled(button));
            return candidates.length === 1 ? candidates[0] : null;
        },
        deactivateMenuItem() {
            const root = this.root();
            const scope = root?.querySelector?.('#more-option-menu');
            if (!scope) return null;
            const candidates = Array.from(scope.querySelectorAll('[role="menu"] [role="menuitem"]')).filter((button) => (
                button.tagName === 'BUTTON'
                && controlIsEnabled(button)
                && !button.closest('[role="dialog"],[role="alertdialog"],[aria-modal="true"]')
                && DEACTIVATE_ACTION_LABEL.test(normalizeSpace(button.textContent))
                && !hasDeletionSemantics(button)
            ));
            return candidates.length === 1 ? candidates[0] : null;
        },
        visibleModalDialogs() {
            return Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"],[role="alertdialog"][aria-modal="true"]'))
                .filter((dialog) => elementIsUsable(dialog) && dialog.getAttribute?.('aria-hidden') !== 'true');
        },
        deactivateDialogContract() {
            const dialogs = this.visibleModalDialogs();
            if (dialogs.length !== 1) return null;
            const dialog = dialogs[0];
            if (typeof dialog.getAttribute !== 'function' || typeof dialog.querySelector !== 'function' || typeof dialog.querySelectorAll !== 'function') return null;
            const heading = normalizeSpace(dialog.getAttribute('aria-label') || dialog.querySelector('h1,h2,h3,[role="heading"]')?.textContent);
            if (!DEACTIVATE_DIALOG_LABEL.test(heading)) return null;
            const buttons = Array.from(dialog.querySelectorAll('button'));
            const confirmButtons = buttons.filter((button) => (
                button.id === 'shop-manager--listing-publish'
                && controlIsEnabled(button)
                && DEACTIVATE_ACTION_LABEL.test(normalizeSpace(button.textContent))
                && !hasDeletionSemantics(button)
            ));
            const cancelButtons = buttons.filter((button) => controlIsEnabled(button) && CANCEL_ACTION_LABEL.test(normalizeSpace(button.textContent)));
            if (confirmButtons.length !== 1 || cancelButtons.length !== 1) return null;
            return { dialog, confirmButton: confirmButtons[0], cancelButton: cancelButtons[0] };
        },
        async openDeactivate() {
            if (this.visibleModalDialogs().length) return false;
            const more = this.deactivateMoreButton();
            if (!more) return false;
            if (!this.deactivateMenuItem()) more.click();
            const action = await waitFor(() => this.deactivateMenuItem(), 3000);
            if (!action) return false;
            await sleep(120);
            const focused = await waitFor(() => {
                const current = this.deactivateMenuItem();
                if (!current) return null;
                current.scrollIntoView({ block: 'nearest' });
                current.focus({ preventScroll: true });
                return document.activeElement === current ? current : null;
            }, 1000, 50);
            return Boolean(focused);
        },
        async openDeactivateDialog() {
            if (!await this.openDeactivate()) return false;
            await sleep(80);
            const action = this.deactivateMenuItem();
            if (!action) return false;
            action.click();
            return Boolean(await waitFor(() => this.deactivateDialogContract(), DEACTIVATE_DIALOG_READY_TIMEOUT_MS, 80));
        },
        clickDeactivateConfirmation() {
            const contract = this.deactivateDialogContract();
            if (!contract) return false;
            contract.confirmButton.click();
            return true;
        },
        cancelDeactivateDialog() {
            const contract = this.deactivateDialogContract();
            if (!contract) return false;
            contract.cancelButton.click();
            return true;
        },
        async cancelDeactivateDialogWhenReady(timeout = 2000) {
            if (!this.visibleModalDialogs().length) return false;
            const contract = this.deactivateDialogContract()
                || await waitFor(() => this.deactivateDialogContract(), timeout, 80);
            if (!contract) return false;
            contract.cancelButton.click();
            return true;
        },
        listingStatusLabels() {
            const root = this.root();
            if (!root?.querySelectorAll) return [];
            const titleBar = root.querySelector?.('#form-title-bar');
            const statusRegion = titleBar?.nextElementSibling;
            const structuredCandidates = statusRegion?.querySelectorAll
                ? Array.from(statusRegion.querySelectorAll('[data-clg-id="WtBadge"],[data-listing-status]'))
                : [];
            const fallbackSelectors = ['.wt-badge--statusValue', '.wt-badge--statusInformational', '[data-listing-status]'];
            const candidates = structuredCandidates.length
                ? structuredCandidates
                : fallbackSelectors.flatMap((selector) => Array.from(root.querySelectorAll(selector)));
            return uniqueStrings(candidates.filter((element) => element.offsetParent !== null).map((element) => (
                normalizeSpace(element.textContent || element.getAttribute('data-listing-status') || element.getAttribute('data-status'))
            ))).filter((status) => isActiveStatus(status) || isInactiveStatus(status));
        },
        appearsInactive() {
            return this.listingStatusLabels().some(isInactiveStatus);
        },
    };

    function actionLeaseLostError(message = 'Action lease ownership changed.') {
        const error = new Error(message);
        error.code = 'ACTION_LEASE_LOST';
        return error;
    }

    function durableLeaseIsActive(lease, referenceTime = Date.now()) {
        return Boolean((lease?.token || lease?.owner) && Number(lease.expiresAt) > Number(referenceTime));
    }

    function storedQueueHasActiveItem(queue) {
        const normalized = normalizeQueue(queue);
        if (normalized?.unsupportedSchema || normalized?.invalidSchema) return true;
        return Boolean(normalized && ['ready', 'running'].includes(String(normalized.status || ''))
            && Array.isArray(normalized.items) && normalized.items[Number(normalized.cursor)]);
    }

    const UNCERTAIN_PROVIDER_SUBMISSION_STATUSES = Object.freeze([
        'submitted',
        'submitted-unverified',
        'deactivation-submitted',
        'deactivation-submitted-unverified',
    ]);

    async function blockCollectionForUncertainQueueStopLocked(queue, item) {
        if (!UNCERTAIN_PROVIDER_SUBMISSION_STATUSES.includes(String(item?.status || ''))) return null;
        const stored = normalizeCollection(await GMX.get(KEYS.collection, null));
        if (!stored || stored.unsupportedSchema
            || !['starting', 'running', 'paused', 'completed'].includes(String(stored.status || ''))) return stored;
        const collectionScope = collectionScopeParts(stored.scopeKey);
        const queueScope = collectionScopeParts(queue?.scopeKey);
        const record = await Store.getRecord(item?.listingId);
        const recordShopKey = String(record?.meta?.shopKey || '').toLowerCase();
        const queueShopKey = queueScope?.shopKey || (/^etsy-shop:[a-z0-9]+$/.test(recordShopKey) ? recordShopKey : '');
        const sameSourceCollection = Boolean(queue?.collectionId && String(queue.collectionId) === stored.id);
        const sameKnownShop = Boolean(collectionScope && queueShopKey && collectionScope.shopKey === queueShopKey);
        const overlappingRun = ['starting', 'running'].includes(String(stored.status || ''));
        if (!overlappingRun && !sameSourceCollection && !sameKnownShop) return stored;
        const blockedAt = nowIso();
        return Store.saveCollectionLocked({
            ...stored,
            status: 'blocked',
            stoppedAt: blockedAt,
            updatedAt: blockedAt,
            leaseToken: '',
            handoffToken: '',
            handoffPage: 0,
            handoffExpiresAt: '',
            retry: null,
            error: {
                key: 'collectionPageChanged',
                reason: 'An unverified Etsy submission may have changed listing data; run a new full scan.',
                reportId: '',
            },
        }, {
            id: stored.id,
            token: stored.leaseToken,
            writeRevision: stored.writeRevision,
            manifestFingerprint: collectionManifestFingerprint(stored),
        });
    }

    const Lease = {
        async assertOwnerLocked(expectedToken = state.leaseToken) {
            const token = String(expectedToken || '');
            const current = await GMX.get(KEYS.lease, null);
            const valid = token
                && current?.owner === tabId
                && current?.instanceId === pageInstanceId
                && current?.token === token
                && Number(current.expiresAt) > Date.now();
            if (!valid) throw actionLeaseLostError();
            return current;
        },
        async assertOwner(expectedToken = state.leaseToken) {
            return withNamedLock(STORAGE_MUTATION_LOCK, () => this.assertOwnerLocked(expectedToken));
        },
        async withFence(expectedToken, callback) {
            return withNamedLock(STORAGE_MUTATION_LOCK, async () => {
                await this.assertOwnerLocked(expectedToken);
                return callback();
            });
        },
        async acquire(options = {}) {
            try { return await this.acquireStrict(options); }
            catch (error) {
                if (error?.code === 'STORAGE_READ_FAILED') return false;
                throw error;
            }
        },
        async acquireStrict(options = {}) {
            clearInterval(state.leaseTimer);
            const acquired = await withNamedLock(STORAGE_MUTATION_LOCK, async () => {
                const collectionLease = await GMX.get(KEYS.collectionLease, null);
                const storedCollection = normalizeCollection(await GMX.get(KEYS.collection, null));
                const allowCollectionConflictForQueueStop = options.allowCollectionConflictForQueueStop === true;
                if (!allowCollectionConflictForQueueStop && (durableLeaseIsActive(collectionLease)
                    || ['starting', 'running'].includes(String(storedCollection?.status || '')))) return false;
                const current = await GMX.get(KEYS.lease, null);
                const active = durableLeaseIsActive(current);
                const sameOwner = current?.owner === tabId && current?.instanceId === pageInstanceId;
                if (active && !sameOwner) return false;
                const token = active && sameOwner ? String(current.token) : randomId('action-lease');
                const lease = { owner: tabId, instanceId: pageInstanceId, token, expiresAt: Date.now() + 15000 };
                if (!await GMX.set(KEYS.lease, lease)) return false;
                const verified = await GMX.get(KEYS.lease, null);
                if (verified?.owner !== tabId || verified?.instanceId !== pageInstanceId || verified?.token !== token) return false;
                state.leaseToken = token;
                return true;
            });
            if (!acquired) return false;
            state.leaseTimer = window.setInterval(async () => {
                if (!state.leaseToken) return;
                await withNamedLock(STORAGE_MUTATION_LOCK, async () => {
                    const held = await GMX.get(KEYS.lease, null);
                    if (held?.owner !== tabId || held?.instanceId !== pageInstanceId || held?.token !== state.leaseToken || Number(held.expiresAt) <= Date.now()) {
                        clearInterval(state.leaseTimer); state.leaseTimer = 0; state.leaseToken = '';
                        return;
                    }
                    if (!await GMX.set(KEYS.lease, { ...held, expiresAt: Date.now() + 15000 })) {
                        clearInterval(state.leaseTimer); state.leaseTimer = 0; state.leaseToken = '';
                    }
                });
            }, 5000);
            return true;
        },
        async release(expectedToken = state.leaseToken) {
            clearInterval(state.leaseTimer); state.leaseTimer = 0;
            const token = String(expectedToken || '');
            await withNamedLock(STORAGE_MUTATION_LOCK, async () => {
                const current = await GMX.get(KEYS.lease, null);
                if (current?.owner === tabId && current?.instanceId === pageInstanceId && current?.token === token) await GMX.remove(KEYS.lease);
            });
            if (state.leaseToken === token) state.leaseToken = '';
        },
    };

    const Queue = {
        activeItem() {
            if (!state.queue || state.queue.unsupportedSchema || state.queue.invalidSchema || !Array.isArray(state.queue.items)) return null;
            return state.queue.items[state.queue.cursor] || null;
        },
        activeIdentity() {
            const item = this.activeItem();
            return {
                queueId: String(state.queue?.id || ''),
                cursor: Number(state.queue?.cursor),
                listingId: String(item?.listingId || ''),
                itemStatus: String(item?.status || ''),
            };
        },
        async withFencedActiveItem(fenceToken, expectedStatuses, callback, expectedIdentity = this.activeIdentity()) {
            const expectedQueueId = String(expectedIdentity?.queueId || '');
            const expectedCursor = Number(expectedIdentity?.cursor);
            const expectedListingId = String(expectedIdentity?.listingId || '');
            if (!expectedQueueId || !Number.isInteger(expectedCursor) || !expectedListingId) {
                throw actionLeaseLostError('The action queue is no longer active.');
            }
            const allowedStatuses = Array.isArray(expectedStatuses) ? expectedStatuses.map(String) : [];
            return Lease.withFence(fenceToken, async () => {
                const queue = normalizeQueue(await GMX.get(KEYS.queue, null));
                const item = queue && Array.isArray(queue.items) ? queue.items[expectedCursor] : null;
                const queueMatches = queue
                    && !queue.unsupportedSchema && !queue.invalidSchema
                    && String(queue.id || '') === expectedQueueId
                    && Number(queue.cursor) === expectedCursor
                    && ['ready', 'running'].includes(String(queue.status || ''))
                    && String(item?.listingId || '') === expectedListingId;
                if (!queueMatches || (allowedStatuses.length && !allowedStatuses.includes(String(item.status || '')))) {
                    throw actionLeaseLostError('The action queue changed while Etsy verification was in progress.');
                }
                return callback(queue, item);
            });
        },
        async updateItemFenced(patch, fenceToken, expectedStatuses = [], expectedIdentity = this.activeIdentity()) {
            return this.withFencedActiveItem(fenceToken, expectedStatuses, async (queue, item) => {
                Object.assign(item, patch);
                await Lease.assertOwnerLocked(fenceToken);
                const saved = await Store.saveQueueLocked(queue);
                return saved.items[saved.cursor] || null;
            }, expectedIdentity);
        },
        async advanceFenced(status, fenceToken, expectedStatuses = [], expectedIdentity = this.activeIdentity(), auditEntry = null) {
            return this.withFencedActiveItem(fenceToken, expectedStatuses, async (queue, item) => {
                if (auditEntry) await Store.appendAuditLocked(typeof auditEntry === 'function' ? auditEntry(queue, item) : auditEntry);
                item.status = status;
                queue.cursor += 1;
                const completed = queue.cursor >= queue.items.length;
                if (completed) {
                    queue.status = 'completed';
                    queue.completedAt = nowIso();
                } else queue.status = 'running';
                await Lease.assertOwnerLocked(fenceToken);
                const saved = await Store.saveQueueLocked(queue);
                return { completed, next: completed ? null : saved.items[saved.cursor] || null };
            }, expectedIdentity);
        },
        async stopFenced(reason, fenceToken, expectedStatuses = [], expectedIdentity = this.activeIdentity()) {
            return this.withFencedActiveItem(fenceToken, expectedStatuses, async (queue, item) => {
                await blockCollectionForUncertainQueueStopLocked(queue, item);
                queue.status = 'stopped';
                queue.stoppedAt = nowIso();
                queue.stopReason = reason;
                await Store.appendAuditLocked({ type: 'queue-stopped', queueId: queue.id, listingId: item.listingId, reason });
                await Lease.assertOwnerLocked(fenceToken);
                return Store.saveQueueLocked(queue);
            }, expectedIdentity);
        },
        recoveryState() {
            const item = this.activeItem();
            if (!item || !['ready', 'running'].includes(String(state.queue?.status || ''))) return null;
            const uncertain = ['applying', 'awaiting-user-review', 'submitted', 'submitted-unverified', 'deactivation-submitted', 'deactivation-submitted-unverified'];
            const submitted = ['submitted', 'submitted-unverified', 'deactivation-submitted', 'deactivation-submitted-unverified'].includes(item.status);
            if (!uncertain.includes(String(item.status || '')) || (!submitted && item.runtimeOwner === pageInstanceId)) return null;
            return { item, submitted };
        },
        async create(records, expectedIdentity) {
            const requestedIds = uniqueStrings(records.map((record) => String(record.listingId)));
            return withNamedLock(STORAGE_MUTATION_LOCK, async () => {
                const existingQueue = normalizeQueue(await GMX.get(KEYS.queue, null));
                if (existingQueue?.unsupportedSchema || existingQueue?.invalidSchema) {
                    const error = new Error('The stored action queue uses a newer or invalid schema.');
                    error.code = existingQueue.unsupportedSchema ? 'QUEUE_NEWER_SCHEMA' : 'QUEUE_INVALID_SCHEMA';
                    throw error;
                }
                if (storedQueueHasActiveItem(existingQueue)) {
                    const error = new Error('An action queue is already active.'); error.code = 'QUEUE_ACTIVE'; throw error;
                }
                const collectionLease = await GMX.get(KEYS.collectionLease, null);
                const storedCollection = normalizeCollection(await GMX.get(KEYS.collection, null));
                if (durableLeaseIsActive(collectionLease)
                    || ['starting', 'running'].includes(String(storedCollection?.status || ''))) {
                    const error = new Error('All-page collection is active.'); error.code = 'COLLECTION_ACTIVE'; throw error;
                }
                const fenced = await assertFreshCollectionLocked(expectedIdentity);
                const storedPolicy = await storedHealthPolicyLocked();
                const latestById = new Map(fenced.records.map((record) => [String(record.listingId), record]));
                const latestRecords = requestedIds.map((listingId) => latestById.get(listingId));
                if (latestRecords.some((record) => !record)) {
                    const error = new Error('A selected listing is no longer part of the completed collection.'); error.code = 'COLLECTION_INCOMPLETE'; throw error;
                }
                latestRecords.forEach((record) => {
                    if (!record.proposal || record.proposal.action === 'SKIP') {
                        const error = new Error('A selected proposal is no longer available.'); error.code = 'PROPOSAL_STALE'; throw error;
                    }
                    let fields;
                    try { fields = proposalFields(record.proposal, true); }
                    catch (cause) { const error = new Error(cause?.message || 'The proposal fields are invalid.'); error.code = 'PROPOSAL_INVALID'; throw error; }
                    if (record.proposal.action === 'UPDATE' && (!fields.length || !record.proposal.improvementId)) {
                        const error = new Error('An UPDATE proposal is incomplete.'); error.code = 'PROPOSAL_INVALID'; throw error;
                    }
                    if (record.proposal.action !== 'UPDATE' && fields.length) {
                        const error = new Error('A non-UPDATE proposal selects editable fields.'); error.code = 'PROPOSAL_INVALID'; throw error;
                    }
                    if (!recommendationBasisMatches(record)) {
                        const error = new Error('The proposal basis changed.'); error.code = 'PROPOSAL_STALE'; throw error;
                    }
                    if (record.proposal?.basis?.policyFingerprint !== storedPolicy.fingerprint) {
                        const error = new Error('The stored analysis thresholds changed.'); error.code = 'PROPOSAL_STALE'; throw error;
                    }
                    if (record.proposal.experimentOverlap && !record.proposal.experimentOverlapAcceptedAt) {
                        const error = new Error('The proposal overlaps an active experiment.'); error.code = 'PROPOSAL_EXPERIMENT_OVERLAP'; throw error;
                    }
                });
                const items = latestRecords.map((record) => ({
                    listingId: String(record.listingId), title: record.meta?.title || '', editUrl: record.meta?.editUrl || `https://www.etsy.com/your/shops/me/listing-editor/edit/${record.listingId}`,
                    proposal: record.proposal, status: 'pending', attempts: 0, error: '', before: null, changedFields: [],
                }));
                const identity = collectionIdentity(fenced.collection);
                const queue = {
                    schema: QUEUE_SCHEMA_VERSION, id: `queue-${Date.now()}`, createdAt: nowIso(), status: 'ready', cursor: 0, items,
                    collectionId: identity.id, scopeKey: identity.scopeKey, completedAt: identity.completedAt,
                };
                const saved = await Store.saveQueueLocked(queue);
                await Store.appendAuditLocked({ type: 'queue-created', queueId: queue.id, count: items.length, collectionId: identity.id });
                return saved;
            });
        },
        async navigate(item = this.activeItem()) {
            if (!item) return;
            await Lease.release();
            if (typeof window.__MAKAYTRON_LISTING_NAVIGATE__ === 'function') window.__MAKAYTRON_LISTING_NAVIGATE__(item.editUrl);
            else location.assign(item.editUrl);
        },
    };

    async function waitForActionVerification(predicate, fenceToken, timeout = 5000, interval = 100) {
        const started = Date.now();
        while (Date.now() - started < timeout) {
            await Lease.assertOwner(fenceToken);
            let result = null;
            try { result = predicate(); } catch { /* retry while the lease is still held */ }
            if (result) {
                await Lease.assertOwner(fenceToken);
                try { result = predicate(); } catch { result = null; }
                if (result) return result;
            }
            await sleep(interval);
        }
        await Lease.assertOwner(fenceToken);
        return null;
    }

    function normalizeCollection(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const schema = Math.max(1, Number(raw.schema) || 1);
        if (schema > COLLECTION_SCHEMA_VERSION) {
            return {
                schema, id: String(raw.id || 'unsupported-collection'), status: 'blocked', scopeKey: String(raw.scopeKey || ''), metricContractId: '',
                writeRevision: Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(Number(raw.writeRevision) || 0))),
                startedAt: String(raw.startedAt || ''), updatedAt: String(raw.updatedAt || ''), completedAt: null, stoppedAt: null,
                expectedPage: 1, totalPages: 1, pages: {}, uniqueIds: [], duplicateCount: 0, returningToFirst: false,
                leaseToken: '', handoffToken: '', handoffPage: 0, handoffExpiresAt: '', unsupportedSchema: true, legacySchema: false,
                retry: null, failureReports: [],
                error: { key: 'collectionNewerSchema', reason: 'Unsupported collection schema.', reportId: '' },
            };
        }
        const legacySchema = schema < COLLECTION_SCHEMA_VERSION;
        const allowedStatuses = ['starting', 'running', 'paused', 'blocked', 'completed'];
        const pages = {};
        Object.entries(raw.pages && typeof raw.pages === 'object' ? raw.pages : {}).forEach(([pageKey, value]) => {
            const page = Number(pageKey);
            if (!Number.isInteger(page) || page < 1 || page > MAX_COLLECTION_PAGES || !value || typeof value !== 'object') return;
            pages[String(page)] = {
                signature: String(value.signature || ''), contentSignature: String(value.contentSignature || ''),
                ids: uniqueStrings(Array.isArray(value.ids) ? value.ids.map(String) : []),
                count: Math.max(0, Number(value.count) || 0), capturedAt: String(value.capturedAt || ''), metricContractId: String(value.metricContractId || ''),
            };
        });
        const pageIds = Object.values(pages).flatMap((page) => page.ids);
        const failureReports = (Array.isArray(raw.failureReports) ? raw.failureReports : []).map((report) => {
            if (!report || typeof report !== 'object') return null;
            return {
                schema: 1, id: String(report.id || randomId('collection-error')), at: String(report.at || nowIso()),
                collectionId: String(report.collectionId || raw.id || ''), key: String(report.key || 'collectionPageChanged'),
                phase: normalizeSpace(report.phase || 'page-read').slice(0, 80), message: normalizeSpace(report.message).slice(0, 300),
                expectedPage: Math.max(1, Number(report.expectedPage) || 1), observedPage: Math.max(0, Number(report.observedPage) || 0),
                totalPages: Math.max(1, Number(report.totalPages) || 1), attempts: Math.max(1, Number(report.attempts) || 1),
                maxAttempts: Math.max(1, Number(report.maxAttempts) || COLLECTION_RETRY_ATTEMPTS),
                collectedPages: Math.max(0, Number(report.collectedPages) || 0), uniqueListings: Math.max(0, Number(report.uniqueListings) || 0),
                linkCount: Math.max(0, Number(report.linkCount) || 0), parsedCount: Math.max(0, Number(report.parsedCount) || 0),
                route: /^\/your\/shops\/[^?#\s]+\/tools\/listings(?:\?(?:stats=true|page=\d+|stats=true&page=\d+|page=\d+&stats=true))?$/.test(String(report.route || '')) ? String(report.route) : '',
                recovered: Boolean(report.recovered), recoveredAt: report.recoveredAt ? String(report.recoveredAt) : null,
            };
        }).filter(Boolean).slice(-20);
        const retry = raw.retry && typeof raw.retry === 'object' ? {
            phase: normalizeSpace(raw.retry.phase).slice(0, 80), page: Math.max(1, Number(raw.retry.page) || 1),
            attempt: clamp(raw.retry.attempt, 1, COLLECTION_RETRY_ATTEMPTS), maxAttempts: COLLECTION_RETRY_ATTEMPTS,
            lastAt: String(raw.retry.lastAt || nowIso()),
        } : null;
        return {
            schema, id: String(raw.id || `collection-${Date.now()}`),
            writeRevision: Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(Number(raw.writeRevision) || 0))),
            status: legacySchema ? 'blocked' : (allowedStatuses.includes(raw.status) ? raw.status : 'blocked'), scopeKey: String(raw.scopeKey || ''), metricContractId: String(raw.metricContractId || ''),
            startedAt: String(raw.startedAt || nowIso()), updatedAt: String(raw.updatedAt || nowIso()),
            completedAt: legacySchema ? null : (raw.completedAt ? String(raw.completedAt) : null), stoppedAt: raw.stoppedAt ? String(raw.stoppedAt) : null,
            expectedPage: Math.max(1, Number(raw.expectedPage) || 1), totalPages: Math.max(1, Number(raw.totalPages) || 1), pages,
            uniqueIds: uniqueStrings([...(Array.isArray(raw.uniqueIds) ? raw.uniqueIds.map(String) : []), ...pageIds]),
            duplicateCount: Math.max(0, Number(raw.duplicateCount) || 0),
            returningToFirst: Boolean(raw.returningToFirst),
            leaseToken: String(raw.leaseToken || ''), handoffToken: String(raw.handoffToken || ''),
            handoffPage: Math.max(0, Number(raw.handoffPage) || 0), handoffExpiresAt: String(raw.handoffExpiresAt || ''), unsupportedSchema: false, legacySchema,
            retry, failureReports,
            error: legacySchema
                ? { key: 'collectionPageChanged', reason: 'Collection must be rescanned with the current parser.', reportId: '' }
                : (raw.error && typeof raw.error === 'object' ? { key: String(raw.error.key || ''), reason: String(raw.error.reason || ''), reportId: String(raw.error.reportId || '') } : null),
        };
    }

    function collectionManifestIsComplete(collection) {
        const totalPages = Number(collection?.totalPages);
        if (!collection || !Number.isInteger(totalPages) || totalPages < 1 || totalPages > MAX_COLLECTION_PAGES) return false;
        if (collection.metricContractId !== LISTING_METRIC_CONTRACT.id) return false;
        if (Number(collection.duplicateCount) !== 0 || !Array.isArray(collection.uniqueIds) || !collection.uniqueIds.length) return false;
        const pageKeys = Object.keys(collection.pages || {});
        if (pageKeys.length !== totalPages || pageKeys.some((key) => !/^\d+$/.test(key) || Number(key) < 1 || Number(key) > totalPages)) return false;
        const collectedIds = [];
        for (let page = 1; page <= totalPages; page += 1) {
            const manifest = collection.pages?.[String(page)];
            const ids = Array.isArray(manifest?.ids) ? manifest.ids.map(String) : [];
            const count = Number(manifest?.count);
            if (!manifest || !Number.isInteger(count) || count < 1 || count > ANALYSIS_BATCH_SIZE || ids.length !== count) return false;
            if (manifest.metricContractId !== collection.metricContractId) return false;
            if (page < totalPages && count !== ANALYSIS_BATCH_SIZE) return false;
            if (new Set(ids).size !== ids.length || ids.some((id) => !id)) return false;
            const contentSignature = [...ids].sort().join('\u001f');
            if (manifest.contentSignature !== contentSignature || manifest.signature !== `${page}|${count}|${contentSignature}`) return false;
            collectedIds.push(...ids);
        }
        const uniqueIds = collection.uniqueIds.map(String);
        const collectedSet = new Set(collectedIds);
        return collectedSet.size === collectedIds.length
            && new Set(uniqueIds).size === uniqueIds.length
            && uniqueIds.length === collectedIds.length
            && uniqueIds.every((id) => collectedSet.has(id));
    }

    function collectionIsFresh(collection = state.collection, referenceTime = Date.now(), expected = {}) {
        if (!collection || collection.schema !== COLLECTION_SCHEMA_VERSION || collection.legacySchema
            || collection.status !== 'completed' || !collectionManifestIsComplete(collection)) return false;
        const completedAt = Date.parse(collection.completedAt || '');
        if (!Number.isFinite(completedAt)) return false;
        const age = Number(referenceTime) - completedAt;
        const totalPages = Math.max(1, Number(collection.totalPages) || 1);
        const expectedScope = String(expected.scopeKey ?? (routeKind() === 'listings' ? collectionScopeKey() : collection.scopeKey || ''));
        const expectedTotalPages = Math.max(1, Number(expected.totalPages ?? (routeKind() === 'listings' ? ListingPageAdapter.pageInfo().total : totalPages)) || 1);
        if (!expectedScope || collection.scopeKey !== expectedScope || totalPages !== expectedTotalPages) return false;
        if (age < -300000 || age >= ANALYSIS_FRESHNESS_MS) return false;
        return Array.from({ length: totalPages }, (_, index) => collection.pages?.[String(index + 1)]).every((page) => {
            const capturedAt = Date.parse(page?.capturedAt || '');
            const pageAge = Number(referenceTime) - capturedAt;
            return Number.isFinite(capturedAt) && pageAge >= -300000 && pageAge < ANALYSIS_FRESHNESS_MS;
        });
    }

    function collectionManifestFingerprint(collection) {
        if (!collection || typeof collection !== 'object') return '';
        const pageManifest = Object.keys(collection.pages || {}).sort((left, right) => Number(left) - Number(right)).map((page) => {
            const entry = collection.pages[page] || {};
            return [
                String(page), String(entry.signature || ''), String(entry.contentSignature || ''), String(entry.metricContractId || ''),
                Math.max(0, Number(entry.count) || 0), String(entry.capturedAt || ''), (entry.ids || []).map(String),
            ];
        });
        const metricContractId = String(collection.metricContractId || '');
        return fnv1a(JSON.stringify({
            schema: Number(collection.schema) || 0, id: String(collection.id || ''), scopeKey: String(collection.scopeKey || ''),
            metricContractId, totalPages: Math.max(1, Number(collection.totalPages) || 1),
            duplicateCount: Math.max(0, Number(collection.duplicateCount) || 0), pageManifest,
            uniqueIds: (collection.uniqueIds || []).map(String),
        }));
    }

    function collectionIdentity(collection = state.collection) {
        if (!collection) return null;
        const metricContractId = String(collection.metricContractId || '');
        const manifestFingerprint = collectionManifestFingerprint(collection);
        return {
            id: String(collection.id || ''), scopeKey: String(collection.scopeKey || ''), metricContractId, manifestFingerprint,
            writeRevision: Math.max(0, Number(collection.writeRevision) || 0),
            completedAt: String(collection.completedAt || ''), totalPages: Math.max(1, Number(collection.totalPages) || 1),
        };
    }

    function collectionScopeParts(scopeKey) {
        const match = String(scopeKey || '').match(/^(etsy-shop:[a-z0-9]+)\|status:([a-z_]+)\|/i);
        if (!match) return null;
        const listingState = normalizeListingState(match[2]);
        return listingState ? { shopKey: match[1].toLowerCase(), listingState } : null;
    }

    function collectionPageObservationTimes(collection) {
        const observedById = new Map();
        Object.values(collection?.pages || {}).forEach((page) => {
            const observedAt = validTime(page?.capturedAt);
            (Array.isArray(page?.ids) ? page.ids : []).forEach((listingId) => {
                const id = String(listingId || '');
                if (id && !observedById.has(id)) observedById.set(id, observedAt);
            });
        });
        return observedById;
    }

    function collectionListingsObservedAt(listings) {
        const source = Array.isArray(listings) ? listings : [];
        if (!source.length) return '';
        const observations = source.map((listing) => validTime(listing?.capturedAt));
        if (observations.some((value) => value === null)) return '';
        return new Date(Math.min(...observations)).toISOString();
    }

    function collectionHasAllRecords(collection = state.collection, records = state.records) {
        if (!collection || collection.status !== 'completed' || !collectionManifestIsComplete(collection)) return false;
        const startedAt = validTime(collection.startedAt);
        if (startedAt === null) return false;
        const readableById = new Map((records || [])
            .filter((record) => record && !record.unsupportedSchema)
            .map((record) => [String(record.listingId), record]));
        const observationById = collectionPageObservationTimes(collection);
        const scope = collectionScopeParts(collection.scopeKey);
        const collectedIds = new Set((collection.uniqueIds || []).map(String));
        if (scope?.listingState === 'inactive') {
            const enteredInactiveScopeDuringOrAfterCollection = [...readableById.values()].some((record) => (
                !collectedIds.has(String(record.listingId))
                && String(record.meta?.shopKey || '').toLowerCase() === scope.shopKey
                && validTime(record.deactivation?.at) !== null
                && validTime(record.deactivation.at) >= startedAt
            ));
            if (enteredInactiveScopeDuringOrAfterCollection) return false;
        }
        return (collection.uniqueIds || []).every((listingId) => {
            const record = readableById.get(String(listingId));
            if (!record) return false;
            if (!['active', 'inactive'].includes(String(scope?.listingState || ''))) return true;
            const observedAt = observationById.get(String(listingId));
            if (observedAt === null || observedAt === undefined) return false;
            const deactivatedAt = validTime(record.deactivation?.at);
            return deactivatedAt === null || deactivatedAt < observedAt;
        });
    }

    function analysisCollectionIsFresh(collection = state.collection, records = state.records, referenceTime = Date.now()) {
        return collectionIsFresh(collection, referenceTime) && collectionHasAllRecords(collection, records);
    }

    async function assertFreshCollectionLocked(expectedIdentity) {
        const stored = normalizeCollection(await GMX.get(KEYS.collection, null));
        const identity = collectionIdentity(stored);
        const matches = expectedIdentity && identity && identity.id === expectedIdentity.id
            && identity.scopeKey === expectedIdentity.scopeKey && identity.completedAt === expectedIdentity.completedAt
            && identity.totalPages === expectedIdentity.totalPages && identity.metricContractId === expectedIdentity.metricContractId
            && identity.manifestFingerprint === expectedIdentity.manifestFingerprint
            && Number.isSafeInteger(Number(expectedIdentity.writeRevision))
            && identity.writeRevision === Number(expectedIdentity.writeRevision);
        if (!matches || !collectionIsFresh(stored, Date.now(), { scopeKey: expectedIdentity?.scopeKey, totalPages: expectedIdentity?.totalPages })) {
            const error = new Error('The completed listing collection changed or expired.'); error.code = 'COLLECTION_STALE'; throw error;
        }
        const records = [];
        for (const listingId of stored.uniqueIds || []) {
            const record = await Store.getRecord(listingId);
            if (!record || record.unsupportedSchema) {
                const error = new Error(`Listing record ${listingId} is unavailable.`); error.code = 'COLLECTION_INCOMPLETE'; throw error;
            }
            records.push(record);
        }
        let freshnessRecords = records;
        const scope = collectionScopeParts(stored.scopeKey);
        if (scope?.listingState === 'inactive') {
            const collectedIds = new Set(records.map((record) => String(record.listingId)));
            const extraRecords = [];
            for (const listingId of await Store.getIndex()) {
                if (collectedIds.has(String(listingId))) continue;
                const candidate = await Store.getRecord(listingId);
                if (candidate && !candidate.unsupportedSchema
                    && String(candidate.meta?.shopKey || '').toLowerCase() === scope.shopKey
                    && validTime(candidate.deactivation?.at) !== null) extraRecords.push(candidate);
            }
            freshnessRecords = [...records, ...extraRecords];
        }
        if (!collectionHasAllRecords(stored, freshnessRecords)) {
            const error = new Error('A listing state changed after the completed collection.'); error.code = 'COLLECTION_STALE'; throw error;
        }
        return { collection: stored, records };
    }

    async function invalidateCollectionForRecordMutationLocked(listingId, changedAt, knownShopKey = '') {
        const stored = normalizeCollection(await GMX.get(KEYS.collection, null));
        const mutationAt = validTime(changedAt);
        if (!stored || !['running', 'paused', 'completed'].includes(String(stored.status || '')) || mutationAt === null) return stored;
        const scope = collectionScopeParts(stored.scopeKey);
        if (!scope || !['active', 'inactive'].includes(scope.listingState)) return stored;
        const record = await Store.getRecord(listingId);
        const candidateShopKey = String(knownShopKey || record?.meta?.shopKey || '').toLowerCase();
        if (!/^etsy-shop:[a-z0-9]+$/.test(candidateShopKey) || candidateShopKey !== scope.shopKey) return stored;
        let invalidated = false;
        if (scope.listingState === 'inactive') {
            const startedAt = validTime(stored.startedAt);
            invalidated = startedAt === null || mutationAt >= startedAt;
        } else {
            const observedAt = collectionPageObservationTimes(stored).get(String(listingId));
            invalidated = observedAt === null || observedAt === undefined
                ? false
                : mutationAt >= observedAt;
        }
        if (!invalidated) return stored;
        return Store.saveCollectionLocked({
            ...stored, status: 'blocked', updatedAt: nowIso(),
            error: {
                key: 'collectionPageChanged',
                reason: 'A listing state changed during or after this collection; run a new full scan.',
                reportId: '',
            },
        }, {
            id: stored.id, token: stored.leaseToken, writeRevision: stored.writeRevision,
            manifestFingerprint: collectionManifestFingerprint(stored),
        });
    }

    async function assertCollectionPageObservationsCurrentLocked(listings) {
        const observedAt = validTime(collectionListingsObservedAt(listings));
        if (observedAt === null) {
            const error = new Error('The listing page observation time is unavailable.'); error.code = 'COLLECTION_STATE_CHANGED'; throw error;
        }
        for (const listing of listings) {
            const record = await Store.getRecord(listing.listingId);
            const deactivatedAt = validTime(record?.deactivation?.at);
            if (deactivatedAt !== null && deactivatedAt >= observedAt) {
                const error = new Error(`Listing ${listing.listingId} changed after the page was observed.`);
                error.code = 'COLLECTION_STATE_CHANGED';
                throw error;
            }
        }
        return new Date(observedAt).toISOString();
    }

    async function assertFreshCollection(expectedIdentity = collectionIdentity()) {
        return withNamedLock(STORAGE_MUTATION_LOCK, () => assertFreshCollectionLocked(expectedIdentity));
    }

    function readCollectionHandoff() {
        try {
            const value = JSON.parse(sessionStorage.getItem(COLLECTION_HANDOFF_KEY) || 'null');
            return value && typeof value === 'object' ? value : null;
        } catch { return null; }
    }

    function writeCollectionHandoff(value) {
        try { sessionStorage.setItem(COLLECTION_HANDOFF_KEY, JSON.stringify(value)); return true; }
        catch { return false; }
    }

    function clearCollectionHandoff() {
        try { sessionStorage.removeItem(COLLECTION_HANDOFF_KEY); } catch { /* optional */ }
    }

    const CollectionLease = {
        async owns(token = state.collectionLeaseToken) {
            if (!token) return false;
            const current = await GMX.get(KEYS.collectionLease, null);
            return current?.owner === tabId && current?.instanceId === pageInstanceId
                && current?.token === token && Number(current.expiresAt) > Date.now();
        },
        async assertOwns(token = state.collectionLeaseToken) {
            if (await this.owns(token)) return true;
            const error = new Error('Collection lease was lost.'); error.code = 'COLLECTION_LEASE_LOST'; throw error;
        },
        async acquire(options = {}) {
            try { return await this.acquireStrict(options); }
            catch (error) {
                if (error?.code === 'STORAGE_READ_FAILED') return false;
                throw error;
            }
        },
        async acquireStrict(options = {}) {
            const expectedCollectionId = Object.hasOwn(options, 'expectedCollectionId') ? String(options.expectedCollectionId || '') : '';
            const allowedCollectionStatuses = expectedCollectionId
                ? uniqueStrings(Array.isArray(options.allowedCollectionStatuses) && options.allowedCollectionStatuses.length
                    ? options.allowedCollectionStatuses.map(String)
                    : ['running'])
                : [];
            const pendingHandoff = normalizeCollection(await GMX.get(KEYS.collection, null));
            if (expectedCollectionId && (pendingHandoff?.id !== expectedCollectionId
                || !allowedCollectionStatuses.includes(String(pendingHandoff?.status || '')))) return false;
            const pendingLease = await GMX.get(KEYS.collectionLease, null);
            const pendingLeaseActive = Boolean((pendingLease?.token || pendingLease?.owner) && Number(pendingLease.expiresAt) > Date.now());
            const pendingHandoffActive = pendingHandoff?.status === 'running' && pendingHandoff.handoffToken
                && (validTime(pendingHandoff.handoffExpiresAt) || 0) > Date.now();
            if (pendingHandoffActive && !(options.allowAbandonedHandoff && !pendingLeaseActive)) {
                const handoffPage = Math.max(1, Number(pendingHandoff.handoffPage) || 1);
                const stable = await ListingPageAdapter.readStable({
                    requirePagination: pendingHandoff.totalPages > 1,
                    expectedCount: pendingHandoff.pages?.[String(handoffPage)]?.count || 0,
                    timeout: 10000,
                });
                if (!stable || stable.pageInfo.current !== handoffPage || stable.pageInfo.total !== pendingHandoff.totalPages) return false;
            }
            clearInterval(state.collectionLeaseTimer);
            state.collectionLeaseTimer = 0;
            const acquired = await withNamedLock(STORAGE_MUTATION_LOCK, async () => {
                const actionLease = await GMX.get(KEYS.lease, null);
                const storedQueue = await GMX.get(KEYS.queue, null);
                if (durableLeaseIsActive(actionLease) || storedQueueHasActiveItem(storedQueue)) return false;
                const current = await GMX.get(KEYS.collectionLease, null);
                const active = durableLeaseIsActive(current);
                const sameOwner = current?.owner === tabId && current?.instanceId === pageInstanceId;
                const handoff = readCollectionHandoff();
                const stored = normalizeCollection(await GMX.get(KEYS.collection, null));
                if (expectedCollectionId && (!stored || stored.unsupportedSchema || stored.id !== expectedCollectionId
                    || !allowedCollectionStatuses.includes(String(stored.status || '')))) return false;
                const storedHandoffActive = Boolean(stored && stored.status === 'running' && stored.handoffToken
                    && (validTime(stored.handoffExpiresAt) || 0) > Date.now());
                const handoffValid = Boolean(handoff && storedHandoffActive && !stored.unsupportedSchema
                    && handoff.collectionId === stored.id && handoff.token === stored.handoffToken
                    && Number(handoff.page) === Number(stored.handoffPage) && Number(handoff.page) === ListingPageAdapter.pageInfo().current
                    && (validTime(stored.handoffExpiresAt) || 0) > Date.now());
                const mayAdoptActiveHandoff = handoffValid && active && current?.owner === tabId && current?.token === stored.leaseToken;
                const mayRecoverAbandonedHandoff = Boolean(options.allowAbandonedHandoff && !active && stored?.status === 'running'
                    && stored?.id === (expectedCollectionId || state.collection?.id) && stored?.scopeKey === collectionScopeKey());
                if (active && !sameOwner && !mayAdoptActiveHandoff) return false;
                if (!active && storedHandoffActive && !handoffValid && !mayRecoverAbandonedHandoff) return false;
                const token = active && sameOwner ? String(current.token) : randomId('collection-lease');
                const claim = { owner: tabId, token, instanceId: pageInstanceId, expiresAt: Date.now() + 20000 };
                if (!await GMX.set(KEYS.collectionLease, claim)) return false;
                const verified = await GMX.get(KEYS.collectionLease, null);
                if (verified?.owner !== tabId || verified?.instanceId !== pageInstanceId || verified?.token !== token) return false;
                const bindsStoredCollection = Boolean(stored && (expectedCollectionId || handoffValid || mayRecoverAbandonedHandoff));
                if (bindsStoredCollection) {
                    const clearHandoff = handoffValid || mayRecoverAbandonedHandoff;
                    const needsWrite = stored.leaseToken !== token || (clearHandoff && Boolean(stored.handoffToken || stored.handoffPage || stored.handoffExpiresAt));
                    try {
                        state.collection = needsWrite
                            ? await Store.saveCollectionLocked({
                                ...stored, leaseToken: token,
                                ...(clearHandoff ? { handoffToken: '', handoffPage: 0, handoffExpiresAt: '' } : {}),
                                updatedAt: nowIso(),
                            }, {
                                id: stored.id, token: stored.leaseToken, writeRevision: stored.writeRevision,
                                manifestFingerprint: collectionManifestFingerprint(stored), leaseToken: token,
                            })
                            : stored;
                    } catch (error) {
                        const held = await GMX.get(KEYS.collectionLease, null);
                        if (held?.owner === tabId && held?.instanceId === pageInstanceId && held?.token === token) await GMX.remove(KEYS.collectionLease);
                        throw error;
                    }
                    if (clearHandoff) clearCollectionHandoff();
                }
                state.collectionLeaseToken = token;
                return true;
            });
            if (!acquired) return false;
            state.collectionLeaseTimer = window.setInterval(async () => {
                if (state.collection?.status !== 'running' || !state.collectionLeaseToken) return;
                await withNamedLock(STORAGE_MUTATION_LOCK, async () => {
                    const held = await GMX.get(KEYS.collectionLease, null);
                    if (held?.owner !== tabId || held?.instanceId !== pageInstanceId || held?.token !== state.collectionLeaseToken || Number(held.expiresAt) <= Date.now()) {
                        clearInterval(state.collectionLeaseTimer); state.collectionLeaseTimer = 0; state.collectionLeaseToken = '';
                        return;
                    }
                    const renewed = { ...held, expiresAt: Date.now() + 20000 };
                    if (!await GMX.set(KEYS.collectionLease, renewed)) {
                        clearInterval(state.collectionLeaseTimer); state.collectionLeaseTimer = 0; state.collectionLeaseToken = '';
                    }
                });
            }, 6000);
            return true;
        },
        async release() {
            clearInterval(state.collectionLeaseTimer); state.collectionLeaseTimer = 0;
            const token = state.collectionLeaseToken;
            const released = await withNamedLock(STORAGE_MUTATION_LOCK, async () => {
                const current = await GMX.get(KEYS.collectionLease, null);
                if (current?.owner === tabId && current?.instanceId === pageInstanceId && current?.token === token) return GMX.remove(KEYS.collectionLease);
                return !current || current?.token !== token;
            });
            if (released) state.collectionLeaseToken = '';
            return released;
        },
    };

    function collectionScopeKey(href = location.href, shopKey = currentShopKey(), listingState = pageListingState(document, href)) {
        const normalizedState = normalizeListingState(listingState);
        if (!/^etsy-shop:[a-z0-9]+$/.test(shopKey) || !normalizedState) return '';
        const url = new URL(href, location.href);
        const transient = new Set(['page', 'offset', 'ref', 'referrer', 'from_page', 'click_key', 'click_sum', 'organic_search_click', 'campaign_label']);
        [...url.searchParams.keys()].forEach((key) => {
            if (transient.has(key.toLowerCase()) || /^utm_/i.test(key)) url.searchParams.delete(key);
        });
        url.hash = '';
        url.searchParams.sort();
        const query = url.searchParams.toString();
        return `${shopKey}|status:${normalizedState}|${url.pathname}${query ? `?${query}` : ''}`;
    }

    function collectionScopeHref(scopeKey) {
        const match = String(scopeKey || '').match(/^etsy-shop:[a-z0-9]+\|status:[a-z_]+\|(\/your\/shops\/[^/?#]+\/tools\/listings(?:\?[^#]*)?)$/i);
        if (!match) return '';
        try {
            const url = new URL(match[1], 'https://www.etsy.com');
            if (url.origin !== 'https://www.etsy.com' || !/^\/your\/shops\/[^/?#]+\/tools\/listings\/?$/i.test(url.pathname)) return '';
            return `${url.pathname}${url.search}`;
        } catch { return ''; }
    }

    function collectionScopeMatches(collection = state.collection, href = location.href, root = document) {
        const actual = collectionScopeKey(href, currentShopKey(root), pageListingState(root, href));
        return Boolean(actual && collection?.scopeKey && actual === collection.scopeKey);
    }

    async function activatePageControl(control, page) {
        if (!control?.element) return false;
        if (typeof window.__MAKAYTRON_LISTING_PAGE_NAVIGATE__ === 'function') {
            await window.__MAKAYTRON_LISTING_PAGE_NAVIGATE__(page, control);
            return true;
        }
        if (control.type === 'select') {
            const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
            if (setter) setter.call(control.element, String(control.value));
            else control.element.value = String(control.value);
            control.element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            control.element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            return true;
        }
        control.element.click();
        return true;
    }

    function collectionPageConflict(collection, snapshot) {
        const current = Number(snapshot?.pageInfo?.current) || 0;
        const listings = Array.isArray(snapshot?.listings) ? snapshot.listings : [];
        const contentSignature = ListingPageAdapter.contentSignature(listings);
        const repeated = Object.entries(collection?.pages || {}).some(([page, item]) => Number(page) !== current && item.contentSignature === contentSignature);
        const collected = new Set((collection?.uniqueIds || []).map(String));
        const overlap = !collection?.pages?.[String(current)] && listings.some((item) => collected.has(String(item.listingId)));
        return { repeated, overlap };
    }

    function collectionPageMatchesManifest(collection, snapshot) {
        const current = Number(snapshot?.pageInfo?.current) || 0;
        const manifest = collection?.pages?.[String(current)];
        if (!manifest) return true;
        const listings = Array.isArray(snapshot?.listings) ? snapshot.listings : [];
        return manifest.metricContractId === snapshot?.metricContractId
            && snapshot.metricContractId === collection?.metricContractId
            && manifest.signature === ListingPageAdapter.pageSignature(listings, current);
    }

    function pageIdentityMatchesCollection(pageInfo, collection) {
        return Boolean(pageInfo?.valid && Number(pageInfo.total) === Number(collection?.totalPages));
    }

    const Collection = {
        pageCount() { return Object.keys(state.collection?.pages || {}).length; },
        async reconcileLeaseLoss(expectedCollectionId = state.collection?.id) {
            clearInterval(state.collectionLeaseTimer); state.collectionLeaseTimer = 0; state.collectionLeaseToken = '';
            return withNamedLock(STORAGE_MUTATION_LOCK, async () => {
                const lease = await GMX.get(KEYS.collectionLease, null);
                const activeOwner = Boolean((lease?.token || lease?.owner) && Number(lease.expiresAt) > Date.now());
                const stored = normalizeCollection(await GMX.get(KEYS.collection, null));
                if (stored?.id === expectedCollectionId && stored.status === 'running' && !activeOwner) {
                    const paused = await Store.saveCollectionLocked({
                        ...stored, status: 'paused', stoppedAt: nowIso(), updatedAt: nowIso(), leaseToken: '',
                        handoffToken: '', handoffPage: 0, handoffExpiresAt: '', retry: null,
                    }, {
                        id: stored.id, token: stored.leaseToken, writeRevision: stored.writeRevision,
                        manifestFingerprint: collectionManifestFingerprint(stored),
                    });
                    if (!paused || paused.status !== 'paused') throw new Error('Collection pause reconciliation failed.');
                    clearCollectionHandoff();
                    return { paused: true, activeOwner: false };
                }
                state.collection = stored;
                return { paused: false, activeOwner };
            });
        },
        failureReport(key, options = {}) {
            const pageInfo = ListingPageAdapter.pageInfo();
            const url = new URL(location.href);
            const safeParams = new URLSearchParams();
            if (url.searchParams.get('stats') === 'true') safeParams.set('stats', 'true');
            if (/^\d+$/.test(String(url.searchParams.get('page') || ''))) safeParams.set('page', url.searchParams.get('page'));
            const query = safeParams.toString();
            return {
                schema: 1, id: randomId('collection-error'), at: nowIso(), collectionId: String(state.collection?.id || ''),
                key, phase: normalizeSpace(options.phase || 'collection').slice(0, 80), message: t(key, options.params || {}),
                expectedPage: Math.max(1, Number(options.expectedPage || state.collection?.expectedPage) || 1),
                observedPage: Math.max(0, Number(options.observedPage ?? pageInfo.current) || 0), totalPages: Math.max(1, Number(state.collection?.totalPages || pageInfo.total) || 1),
                attempts: Math.max(1, Number(options.attempts) || 1), maxAttempts: Math.max(1, Number(options.maxAttempts) || COLLECTION_RETRY_ATTEMPTS),
                collectedPages: this.pageCount(), uniqueListings: state.collection?.uniqueIds?.length || 0,
                linkCount: ListingPageAdapter.cardLinks().length, parsedCount: ListingPageAdapter.scan().length,
                route: `${url.pathname}${query ? `?${query}` : ''}`, recovered: false, recoveredAt: null,
            };
        },
        async retryTransient(phase, operation, key = 'collectionPageChanged') {
            let lastError = null;
            for (let attempt = 1; attempt <= COLLECTION_RETRY_ATTEMPTS; attempt += 1) {
                if (state.collection?.status !== 'running' || state.collectionPauseRequested) return { ok: false, cancelled: true, value: null, attempts: attempt - 1 };
                await CollectionLease.assertOwns();
                if (attempt > 1) {
                    const configured = COLLECTION_RETRY_DELAYS_MS[Math.min(attempt - 2, COLLECTION_RETRY_DELAYS_MS.length - 1)];
                    await sleep(window.__MAKAYTRON_LISTING_TEST__ === true ? Math.min(configured, 40) : configured);
                    if (state.collection?.status !== 'running' || state.collectionPauseRequested) return { ok: false, cancelled: true, value: null, attempts: attempt - 1 };
                    await CollectionLease.assertOwns();
                }
                try {
                    const value = await operation(attempt);
                    if (value) {
                        if (state.collection?.status !== 'running' || state.collectionPauseRequested) return { ok: false, cancelled: true, value: null, attempts: attempt };
                        await CollectionLease.assertOwns();
                        if (attempt > 1 && state.collection && await CollectionLease.owns()) {
                            await this.persist({ retry: null });
                            await Store.appendAudit({ type: 'collection-page-recovered', collectionId: state.collection.id, phase, page: state.collection.expectedPage, attempts: attempt });
                        }
                        if (state.collection?.status !== 'running' || state.collectionPauseRequested) return { ok: false, cancelled: true, value: null, attempts: attempt };
                        await CollectionLease.assertOwns();
                        return { ok: true, value, attempts: attempt };
                    }
                } catch (error) { lastError = error; }
                if (attempt < COLLECTION_RETRY_ATTEMPTS && state.collection && await CollectionLease.owns()) {
                    await this.persist({ retry: { phase, page: state.collection.expectedPage, attempt, maxAttempts: COLLECTION_RETRY_ATTEMPTS, lastAt: nowIso() } });
                    UI.setStatus('collectionRetrying', 'scanning', { attempt: attempt + 1, max: COLLECTION_RETRY_ATTEMPTS }); UI.render();
                }
            }
            const report = this.failureReport(key, { phase, attempts: COLLECTION_RETRY_ATTEMPTS, maxAttempts: COLLECTION_RETRY_ATTEMPTS });
            if (lastError) report.message = `${report.message} (${normalizeSpace(lastError?.message || lastError).slice(0, 160)})`;
            return { ok: false, value: null, attempts: COLLECTION_RETRY_ATTEMPTS, report };
        },
        async persist(patch = {}, options = {}) {
            if (!state.collection) return null;
            const token = state.collectionLeaseToken;
            const base = state.collection;
            const candidate = { ...base, ...patch, leaseToken: token, updatedAt: nowIso() };
            const observedListings = Array.isArray(options.observedListings) ? options.observedListings : [];
            const saved = await withNamedLock(STORAGE_MUTATION_LOCK, async () => {
                await CollectionLease.assertOwns(token);
                if (observedListings.length) await assertCollectionPageObservationsCurrentLocked(observedListings);
                return Store.saveCollectionLocked(candidate, {
                    id: base.id, token: base.leaseToken, writeRevision: base.writeRevision,
                    manifestFingerprint: collectionManifestFingerprint(base), leaseToken: token,
                });
            });
            await CollectionLease.assertOwns(token);
            return saved;
        },
        serializeStart(factory) {
            if (state.collectionStartTask) return state.collectionStartTask;
            const tracked = Promise.resolve().then(factory).finally(() => {
                if (state.collectionStartTask === tracked) state.collectionStartTask = null;
            });
            state.collectionStartTask = tracked;
            return tracked;
        },
        start() { return this.serializeStart(() => this.startOnce()); },
        async startOnce() {
            if (state.collectionLoop) await state.collectionLoop;
            state.collectionPauseRequested = false;
            if (routeKind() !== 'listings') { UI.setStatus('collectionRouteRequired', 'blocked'); UI.render(); return null; }
            if (state.collection?.unsupportedSchema) { UI.setStatus('collectionNewerSchema', 'blocked'); UI.render(); return null; }
            const initial = await ListingPageAdapter.readStable({ requirePagination: false });
            if (!initial?.pageInfo?.valid) { UI.setStatus('collectionPageChanged', 'blocked'); UI.render(); return null; }
            if (!await CollectionLease.acquire()) { UI.setStatus('collectionBusy', 'blocked'); UI.render(); return null; }
            const pageInfo = initial.pageInfo;
            if (pageInfo.total > MAX_COLLECTION_PAGES) {
                await CollectionLease.release();
                UI.setStatus('collectionLimit', 'blocked', { count: MAX_COLLECTION_PAGES }); UI.render(); return null;
            }
            const createdAt = nowIso();
            try {
                await Store.saveCollection({
                    schema: COLLECTION_SCHEMA_VERSION, id: `collection-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, status: 'running',
                    scopeKey: collectionScopeKey(), metricContractId: initial.metricContractId, startedAt: createdAt, updatedAt: createdAt, expectedPage: 1,
                    totalPages: pageInfo.total, pages: {}, uniqueIds: [], duplicateCount: 0, returningToFirst: false, leaseToken: state.collectionLeaseToken,
                    handoffToken: '', handoffPage: 0, handoffExpiresAt: '', retry: null, failureReports: [], error: null,
                }, { leaseToken: state.collectionLeaseToken });
                state.selectedIds.clear();
            } catch (error) {
                await CollectionLease.release();
                UI.setStatus(error?.code === 'COLLECTION_NEWER_SCHEMA' ? 'collectionNewerSchema' : 'collectionStorageFailed', 'blocked'); UI.render();
                return null;
            }
            UI.setStatus(pageInfo.current === 1 ? 'collectionStarting' : 'collectionFirstPage', 'scanning'); UI.render();
            return this.run();
        },
        resume() { return this.serializeStart(() => this.resumeOnce()); },
        async resumeOnce() {
            state.collectionPauseRequested = false;
            if (routeKind() !== 'listings') { UI.setStatus('collectionRouteRequired', 'blocked'); UI.render(); return null; }
            if (!state.collection || !['paused', 'running'].includes(state.collection.status)) return this.startOnce();
            const expectedCollectionId = state.collection.id;
            const observed = await ListingPageAdapter.readStable({ requirePagination: state.collection.totalPages > 1 });
            if (!observed?.pageInfo?.valid || state.collection.schema !== COLLECTION_SCHEMA_VERSION
                || state.collection.scopeKey !== collectionScopeKey() || state.collection.totalPages !== observed.pageInfo.total
                || state.collection.metricContractId !== observed.metricContractId) {
                UI.setStatus('collectionPageChanged', 'blocked'); UI.render(); return null;
            }
            if (!await CollectionLease.acquire({
                allowAbandonedHandoff: true, expectedCollectionId, allowedCollectionStatuses: ['paused', 'running'],
            })) { UI.setStatus('collectionBusy', 'blocked'); UI.render(); return null; }
            if (!state.collection || state.collection.id !== expectedCollectionId || !['paused', 'running'].includes(state.collection.status)
                || state.collection.schema !== COLLECTION_SCHEMA_VERSION || state.collection.scopeKey !== collectionScopeKey()
                || state.collection.totalPages !== observed.pageInfo.total || state.collection.metricContractId !== observed.metricContractId) {
                await CollectionLease.release();
                UI.setStatus('collectionPageChanged', 'blocked'); UI.render(); return null;
            }
            const firstMissing = Array.from({ length: state.collection.totalPages }, (_, index) => index + 1).find((page) => !state.collection.pages[String(page)]);
            const expectedPage = state.collection.returningToFirst ? 1 : firstMissing || state.collection.totalPages;
            try { await this.persist({ status: 'running', expectedPage, stoppedAt: null, retry: null, error: null }); }
            catch (error) { await CollectionLease.release(); UI.setStatus(error?.code === 'COLLECTION_LEASE_LOST' ? 'collectionBusy' : 'collectionStorageFailed', 'blocked'); UI.render(); return null; }
            UI.setStatus('collectionProgress', 'scanning', this.progressParams()); UI.render();
            return this.run();
        },
        async pause() {
            if (!state.collection || state.collection.status !== 'running') return null;
            if (!await CollectionLease.owns()) { UI.setStatus('collectionBusy', 'blocked'); UI.render(); return null; }
            try { await this.persist({ status: 'paused', stoppedAt: nowIso(), handoffToken: '', handoffPage: 0, handoffExpiresAt: '' }); }
            catch (error) { UI.setStatus(error?.code === 'COLLECTION_LEASE_LOST' ? 'collectionBusy' : 'collectionStorageFailed', 'blocked'); UI.render(); return null; }
            clearCollectionHandoff();
            await CollectionLease.release();
            UI.setStatus('collectionPaused', 'blocked'); UI.render();
            return state.collection;
        },
        async settleCancelledOperation() {
            if (state.collectionPauseRequested && state.collection?.status === 'running') {
                state.collectionPauseRequested = false;
                return this.pause();
            }
            return state.collection;
        },
        async toggle() {
            if (state.collection?.status === 'running') {
                if (await CollectionLease.owns()) {
                    if (state.collectionLoop) {
                        state.collectionPauseRequested = true;
                        UI.setStatus('collectionPaused', 'blocked'); UI.render();
                        return state.collection;
                    }
                    return this.pause();
                }
                if (state.collectionLoop) {
                    state.collectionPauseRequested = true;
                    UI.setStatus('collectionPaused', 'blocked'); UI.render();
                    return state.collection;
                }
                return this.resume();
            }
            if (state.collection?.status === 'paused') return this.resume();
            return this.start();
        },
        progressParams(pageInfo = ListingPageAdapter.pageInfo()) {
            return { current: pageInfo.current, total: state.collection?.totalPages || pageInfo.total, pages: this.pageCount(), count: state.collection?.uniqueIds?.length || 0 };
        },
        async block(key, params = {}, suppliedReport = null) {
            const reason = t(key, params);
            const report = suppliedReport || this.failureReport(key, { phase: params.phase || key, params });
            if (state.collection) {
                try {
                    if (await CollectionLease.owns()) await this.persist({ status: 'blocked', stoppedAt: nowIso(), handoffToken: '', handoffPage: 0, handoffExpiresAt: '', retry: null, failureReports: [...(state.collection.failureReports || []), report].slice(-20), error: { key, reason, reportId: report.id } });
                    else await this.reconcileLeaseLoss(state.collection.id);
                }
                catch (error) { console.error(`[${APP.name}] collection block persistence`, error); state.collection.status = 'blocked'; state.collection.failureReports = [...(state.collection.failureReports || []), report].slice(-20); state.collection.error = { key, reason, reportId: report.id }; }
            }
            clearCollectionHandoff();
            await CollectionLease.release();
            UI.setStatus('collectionBlocked', 'blocked', { reason }); UI.render();
            return null;
        },
        async complete(firstPageListings = []) {
            const pageInfo = ListingPageAdapter.pageInfo();
            if (!pageInfo.valid || pageInfo.current !== 1) return this.block('collectionPageChanged');
            const firstPageManifest = state.collection?.pages?.['1'];
            const firstPageIds = firstPageListings.map((item) => String(item.listingId));
            if (!collectionManifestIsComplete(state.collection) || !firstPageManifest || !firstPageListings.length
                || ListingPageAdapter.contentSignature(firstPageListings) !== firstPageManifest.contentSignature) return this.block('collectionPageChanged');
            if (new Set(firstPageIds).size !== firstPageIds.length) return this.block('collectionOverlap');
            state.pageListings = firstPageListings;
            await refreshRecords({ persist: true, scopeIds: state.collection.uniqueIds });
            await this.persist({ status: 'completed', completedAt: nowIso(), expectedPage: 1, returningToFirst: false, handoffToken: '', handoffPage: 0, handoffExpiresAt: '', retry: null, error: null });
            pruneSelectionToCollection();
            await Store.appendAudit({ type: 'collection-complete', collectionId: state.collection.id, pages: this.pageCount(), count: state.collection.uniqueIds.length });
            void trackTelemetry('listing_full_scan_completed');
            clearCollectionHandoff();
            await CollectionLease.release();
            state.activeView = 'analysis';
            state.wide = true;
            UI.setStatus('collectionComplete', 'ready', { pages: this.pageCount(), count: state.collection.uniqueIds.length }); UI.render();
            return state.collection;
        },
        async prepareNavigationHandoff(page) {
            if (!state.collection || !await CollectionLease.owns()) return false;
            const handoff = {
                collectionId: state.collection.id, token: randomId('collection-handoff'), page: Number(page),
                expiresAt: new Date(Date.now() + 60000).toISOString(),
            };
            if (!writeCollectionHandoff(handoff)) return false;
            try {
                await this.persist({ handoffToken: handoff.token, handoffPage: handoff.page, handoffExpiresAt: handoff.expiresAt });
                return true;
            } catch (error) {
                clearCollectionHandoff();
                throw error;
            }
        },
        async navigateTo(page, beforeContentSignature) {
            const current = ListingPageAdapter.pageInfo().current;
            const next = page === current + 1 ? ListingPageAdapter.nextButton() : null;
            const direct = ListingPageAdapter.pageControl(page);
            const control = direct || (next && !ListingPageAdapter.isDisabled(next) ? { type: 'click', element: next } : null);
            const beforeFirstLink = ListingPageAdapter.cardLinks()[0] || null;
            if (!control || !await this.prepareNavigationHandoff(page) || !await activatePageControl(control, page)) return false;
            const transitioned = await waitFor(() => {
                const listings = ListingPageAdapter.scan();
                const firstLink = ListingPageAdapter.cardLinks()[0] || null;
                return listings.length > 0
                    && ListingPageAdapter.pageInfo().current === Number(page)
                    && (ListingPageAdapter.contentSignature(listings) !== beforeContentSignature || firstLink !== beforeFirstLink);
            }, COLLECTION_TRANSITION_TIMEOUT_MS, 250);
            if (!transitioned) return false;
            if (state.collection?.status !== 'running') return true;
            return CollectionLease.acquire({ expectedCollectionId: state.collection.id });
        },
        async navigateWithRetry(page, beforeContentSignature) {
            return this.retryTransient('navigation', async () => {
                if (ListingPageAdapter.pageInfo().current === Number(page)) {
                    const stable = await ListingPageAdapter.readStable({
                        requirePagination: state.collection?.totalPages > 1,
                        expectedCount: state.collection?.pages?.[String(page)]?.count || 0,
                    });
                    if (stable) return CollectionLease.acquire({ expectedCollectionId: state.collection.id });
                }
                return this.navigateTo(page, beforeContentSignature);
            }, 'collectionPageChanged');
        },
        async run() {
            if (state.collectionLoop) return state.collectionLoop;
            state.collectionLoop = (async () => {
                if (!state.collection || state.collection.status !== 'running') return null;
                const expectedCollectionId = state.collection.id;
                if (!await CollectionLease.acquire({ allowAbandonedHandoff: true, expectedCollectionId })) {
                    UI.setStatus('collectionBusy', 'blocked'); UI.render();
                    return null;
                }
                const stored = await withNamedLock(STORAGE_MUTATION_LOCK, async () => normalizeCollection(await GMX.get(KEYS.collection, null)));
                const ownedStoredCollection = stored?.id === expectedCollectionId && stored?.status === 'running'
                    && stored?.scopeKey === state.collection.scopeKey && stored?.totalPages === state.collection.totalPages
                    && stored?.leaseToken === state.collectionLeaseToken;
                if (!ownedStoredCollection) {
                    await CollectionLease.release();
                    state.collection = stored;
                    UI.setStatus('collectionBusy', 'blocked'); UI.render();
                    return null;
                }
                state.collection = stored;
                while (state.collection?.status === 'running') {
                    await CollectionLease.assertOwns();
                    if (state.collectionPauseRequested) {
                        state.collectionPauseRequested = false;
                        return this.pause();
                    }
                    if (routeKind() !== 'listings') return this.block('collectionRouteRequired');
                    const scopeReadiness = await this.retryTransient('shop-scope', () => waitFor(
                        () => collectionScopeMatches(state.collection) ? true : null,
                        window.__MAKAYTRON_LISTING_TEST__ === true ? 700 : 10000,
                        250,
                    ));
                    if (!scopeReadiness.ok) return scopeReadiness.cancelled ? this.settleCancelledOperation() : this.block('collectionPageChanged', {}, scopeReadiness.report);
                    const pageIdentity = await this.retryTransient('page-identity', () => waitFor(() => {
                        const observed = ListingPageAdapter.pageInfo();
                        return pageIdentityMatchesCollection(observed, state.collection) ? observed : null;
                    }, window.__MAKAYTRON_LISTING_TEST__ === true ? 700 : 10000, 250));
                    if (!pageIdentity.ok) {
                        if (!pageIdentity.cancelled) void trackTelemetryError('selector_listing_pagination');
                        return pageIdentity.cancelled ? this.settleCancelledOperation() : this.block('collectionPageChanged', {}, pageIdentity.report);
                    }
                    let pageInfo = pageIdentity.value;
                    if (pageInfo.total > MAX_COLLECTION_PAGES) return this.block('collectionLimit', { count: MAX_COLLECTION_PAGES });
                    if (pageInfo.current !== state.collection.expectedPage) {
                        const before = ListingPageAdapter.contentSignature();
                        UI.setStatus(state.collection.expectedPage === 1 ? 'collectionFirstPage' : 'collectionProgress', 'scanning', this.progressParams(pageInfo)); UI.render();
                        const navigation = await this.navigateWithRetry(state.collection.expectedPage, before);
                        if (!navigation.ok) {
                            if (!navigation.cancelled) void trackTelemetryError('selector_listing_pagination');
                            return navigation.cancelled ? this.settleCancelledOperation() : this.block('collectionPageChanged', {}, navigation.report);
                        }
                        continue;
                    }
                    let pageRead = await this.retryTransient('page-read', async () => {
                        return ListingPageAdapter.readStable({
                            requirePagination: state.collection.totalPages > 1,
                            expectedCount: state.collection.pages[String(state.collection.expectedPage)]?.count || 0,
                        });
                    }, 'noCards');
                    if (!pageRead.ok) {
                        if (!pageRead.cancelled) void trackTelemetryError('selector_listing_cards');
                        return pageRead.cancelled ? this.settleCancelledOperation() : this.block('noCards', {}, pageRead.report);
                    }
                    if (!collectionPageMatchesManifest(state.collection, pageRead.value)) {
                        const settledManifest = await this.retryTransient('page-settle', async () => {
                            const snapshot = await ListingPageAdapter.readStable({
                                requirePagination: state.collection.totalPages > 1,
                                expectedCount: state.collection.pages[String(state.collection.expectedPage)]?.count || 0,
                            });
                            return snapshot && collectionPageMatchesManifest(state.collection, snapshot) ? snapshot : null;
                        }, 'collectionPageChanged');
                        if (!settledManifest.ok) {
                            if (!settledManifest.cancelled) void trackTelemetryError('selector_listing_cards');
                            return settledManifest.cancelled ? this.settleCancelledOperation() : this.block('collectionPageChanged', {}, settledManifest.report);
                        }
                        pageRead = settledManifest;
                    }
                    const initialConflict = collectionPageConflict(state.collection, pageRead.value);
                    const repeatedPage = !state.collection.returningToFirst && initialConflict.repeated;
                    const overlappingPage = !state.collection.returningToFirst && initialConflict.overlap;
                    if (repeatedPage || overlappingPage) {
                        const settled = await this.retryTransient('page-settle', async () => {
                            const snapshot = await ListingPageAdapter.readStable({
                                requirePagination: state.collection.totalPages > 1,
                                expectedCount: state.collection.pages[String(state.collection.expectedPage)]?.count || 0,
                            });
                            const conflict = collectionPageConflict(state.collection, snapshot);
                            return snapshot && !conflict.repeated && !conflict.overlap ? snapshot : null;
                        }, repeatedPage ? 'collectionRepeatedPage' : 'collectionOverlap');
                        if (!settled.ok) {
                            if (!settled.cancelled) void trackTelemetryError('selector_listing_pagination');
                            const key = repeatedPage ? 'collectionRepeatedPage' : 'collectionOverlap';
                            return settled.cancelled ? this.settleCancelledOperation() : this.block(key, {}, settled.report);
                        }
                        pageRead = settled;
                    }
                    const { links, listings } = pageRead.value;
                    pageInfo = pageRead.value.pageInfo;
                    if (pageInfo.current !== state.collection.expectedPage || pageInfo.total !== state.collection.totalPages
                        || pageRead.value.metricContractId !== state.collection.metricContractId) return this.block('collectionPageChanged');
                    const signature = ListingPageAdapter.pageSignature(listings);
                    const contentSignature = ListingPageAdapter.contentSignature(listings);
                    if (state.collection.returningToFirst) {
                        const firstPage = state.collection.pages['1'];
                        if (pageInfo.current !== 1 || !firstPage || firstPage.signature !== signature) return this.block('collectionPageChanged');
                        return this.complete(listings);
                    }
                    if (!state.collection.pages[String(pageInfo.current)]) {
                        const previousIds = new Set(state.collection.uniqueIds);
                        const duplicateCount = listings.reduce((count, item) => count + (previousIds.has(String(item.listingId)) ? 1 : 0), 0);
                        if (duplicateCount > 0) return this.block('collectionOverlap');
                        const pageCapturedAt = collectionListingsObservedAt(listings);
                        if (!pageCapturedAt) return this.block('collectionPageChanged');
                        await scanCurrentPage({ listings, deferEvaluation: true, silentStatus: true, collectionLeaseToken: state.collectionLeaseToken });
                        await CollectionLease.assertOwns();
                        listings.forEach((item) => previousIds.add(String(item.listingId)));
                        const pages = {
                            ...state.collection.pages,
                            [String(pageInfo.current)]: {
                                signature, contentSignature, ids: listings.map((item) => String(item.listingId)), count: listings.length,
                                capturedAt: pageCapturedAt, metricContractId: pageRead.value.metricContractId,
                            },
                        };
                        await this.persist(
                            { pages, uniqueIds: [...previousIds], duplicateCount: state.collection.duplicateCount + duplicateCount },
                            { observedListings: listings },
                        );
                        await Store.appendAudit({ type: 'collection-page', collectionId: state.collection.id, page: pageInfo.current, totalPages: pageInfo.total, count: listings.length });
                    } else if (state.collection.pages[String(pageInfo.current)].signature !== signature) return this.block('collectionPageChanged');
                    UI.setStatus('collectionProgress', 'scanning', this.progressParams(pageInfo)); UI.render();
                    const next = ListingPageAdapter.nextButton();
                    if (pageInfo.current === pageInfo.total) {
                        if (!ListingPageAdapter.isDisabled(next)) return this.block('collectionPageChanged');
                        if (pageInfo.total === 1) return this.complete(listings);
                        await this.persist({ expectedPage: 1, returningToFirst: true });
                        const navigation = await this.navigateWithRetry(1, contentSignature);
                        if (!navigation.ok) {
                            if (!navigation.cancelled) void trackTelemetryError('selector_listing_pagination');
                            return navigation.cancelled ? this.settleCancelledOperation() : this.block('collectionPageChanged', {}, navigation.report);
                        }
                        continue;
                    }
                    if (this.pageCount() >= MAX_COLLECTION_PAGES) return this.block('collectionLimit', { count: MAX_COLLECTION_PAGES });
                    const expectedPage = pageInfo.current + 1;
                    if (ListingPageAdapter.isDisabled(next) && !ListingPageAdapter.pageControl(expectedPage)) {
                        void trackTelemetryError('selector_listing_pagination');
                        return this.block('collectionPageChanged');
                    }
                    await this.persist({ expectedPage });
                    const navigation = await this.navigateWithRetry(expectedPage, contentSignature);
                    if (!navigation.ok) {
                        if (!navigation.cancelled) void trackTelemetryError('selector_listing_pagination');
                        return navigation.cancelled ? this.settleCancelledOperation() : this.block('collectionPageChanged', {}, navigation.report);
                    }
                }
                return state.collection;
            })().catch((error) => {
                if (error?.code === 'COLLECTION_PAUSE_REQUESTED') return this.pause();
                console.error(`[${APP.name}] collection ${String(error)}`, error);
                if (error?.code === 'COLLECTION_LEASE_LOST') {
                    return this.reconcileLeaseLoss(state.collection?.id).then((result) => {
                        UI.setStatus(result.paused ? 'collectionPaused' : 'collectionBusy', 'blocked'); UI.render(); return state.collection;
                    }).catch((reconcileError) => {
                        console.error(`[${APP.name}] collection lease reconciliation`, reconcileError);
                        UI.setStatus('collectionStorageFailed', 'error'); UI.render(); return null;
                    });
                }
                const storageFailure = ['STORAGE_READ_FAILED', 'STORAGE_WRITE_FAILED', 'STORAGE_QUOTA_EXCEEDED'].includes(error?.code);
                if (!storageFailure) void trackTelemetryError('runtime_listing_scan');
                return this.block(storageFailure ? 'collectionStorageFailed' : 'collectionPageChanged');
            }).finally(() => { state.collectionLoop = null; UI.render(); });
            return state.collectionLoop;
        },
    };

    const MAKAYTRON_LOGO_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAAAxCAYAAAAlSqxqAAAho0lEQVR42s18eZykZXXuc877fl9VdfU6+zAwDDvMyCJDEHBpNm+UTVCqwSV6jRG9aoz8EEVFasobkxglel2SSLxZrrmadGmiqCAaM/QMakBxAWlEgsM+MNM93V3VtXzf977n5I/3q+pBWQac5N76Tc1Sv+mq9z37ec5zivBf9ahWGQBQqwkAHFe54hCh8mnC9gS20QYVXU3MHRH/ILLOtDiZ+vk//9GP+j9fqRjU6/43PYYCdHN13JxRm3K9135yxUvLB46VN6n4EwzJ4US8RkCrFVQm0gzQWav6aAp6RIXv9CR3r/3g13b037NaZWyaJpp49uej/xLh7yW8EyauOlvjkbeQjc4kW1wGtgAzCATNf1fvIFknUe9v8+o+d9fff+mLwO0ZKpMG9YnnrAStVAzl5/jhZZdFh2zYeZYhukiFxgl6aNGayFAQi0ChCoAITAqicL6u80idn7eEOxi4KUvl+uW1b/wMAFRB2FIlyo3s/w8F5ELbdOHvH8YDqz5iioOvMoVBeJdBVQWqCPfkJQWogpnYmhhEQNpt/aCdtN997xfet61arXKtVtNgzPsoeAVhosJUr/vvXX5K6ajlK95gCG8rWHNsbC1Sr0i8QFRElUAggBRQ7UuIFKq5FiwTlSzBWoNGJ/Mi+u1Mss+suubGrwOATlYMJupC+3BG+s81/ElTr0/4oy56z8WFkVV/bkpDK32aCsJdODerpaMwA6pQFRBIGapEUBMVjXPOtZPuVff83buuDUrYokFKzyD8apV7Frn7D887Pwb+sFyMj8tE0c68kELBIICIgPBLcwVAw997xyOAmECsGu7AQiBbsozMCbppdlOj0a0e9CffvpUAXFMF12qQ/ycK6An/2Inqu8zg2MfJFuB86gBYRkgHvXsGDyCAgs3kkgAAcB6UmJgpKtFic/7P7v4/77qi9/77EnJuufKCoY0jcm3R8puJGe1MfJA4cfCQ4HsAg0ihyA8FgjUKtgTvgaSrSLqCtKvwuViNgRaKJHGBaPlwzN0sy5I0/cgnrm7XaphyexvAf5kCxserdmqq5o6d+OB74mUHfMQ7LyoCELHmEibkHk6Uh59cIQAoRCYwEZgojwSqSuy5ULILc7v/7N6/v/KK3uc8qfAnK4Ym6n7H1eccMzZgvjBciE6Y62QSYjqxanAeIvoVUQSrtwwwKxZbgscf85idFXQ6Cp9p+J+5oRgGrAVsBJRK8MtXRGbDgTG6PvnOzGLzdzb80fadk5MVM/EUCZr+s2L+Eee/5w0DK9f9LZi8ijKYqXfZIHiGisCnHXiXQZyHGgMbxYgLRZCxIBH05ENEEBWowHFctM352Svv/cJ7PvZknrC1Om7PqE25+6vnnDZW4H8qRvHqxdQ5IrLQXqbJL9+TpgAkwePiiNFoCXbcn+DxXYIsFVhDsJbBTMj9BoaAyOTZSEPIYpAWCnAbDixG8bC/mwbb54++Z+t9T+UJ+1UBeYKUo89/zynR8jVbYeIYkhGxJQL2SraA67bhui147/seEf4kGGNgigOICiUw5z8Zoi6gosQkXmD2NPZc8NDk1V/bWwl9y//geacuK+IGa+xo13vPxGYv7YcDiwKZgERBSmBDiCKD+x9K8YsdGVwGFGJCZABDgGGB4eCRAoLkMdSwwoBgTPAIKCAebtlIZEujct/yNdmZA1f9y4NPpoT9pwBVwpYtdPDN9w8Prjv6tmho7AiXdIWImCjc1RgDVUXSnIe6FCCC1yULD4IJyiBSGBOjODQMNgYqPZtViBcBgZI02TM7u/vkXd/4k1+iWmUFQLWa7Kied/SYpW3W0srEqScmQ0RLsZ4ApB6UAaQKJQJzOMPP7knw0GMehZgRGYIhgmEFE2CNImaFZYXJz5t6RSYENgzLGoppApgJXuBGipHV2P3Y8swZh3729kZuZ/3igfdb5JmYYNRqUl627mO2PHaESxPHzJynNDAzVBXdhT3QLIUSQ0L50beFXlzu/du7DN3mAsT54DkqUBUAyt6lEkXF5UMDg38FgCenNxG21HSu+orR0QhfKsa8spN5T4CBAiq58FWBjgMluVeBwASIA277aQcP7HQoFhnGUB7jBZYVkRFELDCkeSUEWKsYKQErB4CCCR7OtJS7Iku25TIX+ej5883hvyGCYqLCexs+76eSx9TrdX/kOZe/zAyvfJPLEg9Vq9B+kgWAzvwsvAvCVxUoBEqkIPYAhAAPiAY55c2Pd+g05+F9yLVePEQFIjBpp+XiuHjmunOuesel9QlPBM2Mv26kVNjUTMUxsdF+lZOHnFYGTQWKEEqCzhk/mu7i8T1ei0XyRHCG1BtWYVYxJN6SeMsQNiFBWwtEhmGIULCKVbHDAAuUQ54ABy8wJihhebl80a0Tp19B9bqfrFT6cjf7QfyESgUHA4V47OgvcaG8Sr1DyLihqQIzugt74LMuiEzojEJIUGZDxsZMEGJbYCaQimivPOlZvngPshG89xAvEO8gLiN4pxHkhTOtM67rvLf8mqFS/L6FTuYYaqkXznohrpVCveb9BqACxDHjrn9P9MFdTgZLlgciy4OR4cgQFxhUtKCh2HC5YNkYJlURw9DYMEUEWBJYKCICBlngFfAgGAKIEdI9gxSiBcsvfvWRa758Tv2m3ZOViqlPT6vdD1UPozbh7bmXv90MjG1yWdcT2IhK7pOMrNWAT9oAm2D1CpBThY0oTTpZ2nr802m7szUeGXtBqTx0eRQXB8RlCiIKYSmEI2m3Ql73DuIdVIXgU3TVjJx+0kzdsG5aTL2KesNEefALatDFFHCAGu5XQXEEPPRoKg/udLyyHJtWmqadLP1uB7INPpuOmRaKBpEv2QPZ0IkFa18yVDRHxREhzZwYVYoYZPJ+BUxYzh6zXuHA4DwfgJhEVUZKhYHUZ3+swCsrGzfqfkjCoU1c/+LXrSmuOuJnZmB4TH0GEIecaizEO3TnZ2AM5+6uIJCCWbMkTeZ2PXxx8/Yv3tB7x1UvefupwyuWX2/i4grJnBAtJQoVD46KABHEZVDvQOIw33H6mY2P0EWr5zGXIMdu8lqdCdryQNeDIhN6XWIwEZJU/I/uzEyzm3VIs7/sJK3P/c5tP5l+qttev3ntwGEbDnlpHEWXLytF46kXqKhYpv4ZiQCvwB4xAIdcAKI8MaswgWYb7Red/I/bvzdZqZjfzAMqdUZ9wtvBd1/J5ZFlLks8gQwg4YMVSFuN0Fghb7YEYIaqBy/MPPIHzdu/eMPGSjWexrTH2Nm867q3fD966TsuKY6suokME0Ty/kyhonDdNhDFUOdgJMN8onjp2AJdsGpe5lMlQyDVAKSRISAVaKJga0PAz4spY9U/9oiYPfOtH2Tdube84Y67f5x3xXTz6aeb3atW9SuCSi/W1utt3L7zqwC+uuPS095ajgsfiyNTTkSFqZdPFZYUw1axiJAjlDQH9SDDxcgmLnongO9VfjMPqDJQ0wNPedNhhXUH/cQWB0veZQFFIIKJLCRLkDbmAeZQBQUherZF05zdWd+9/bqJX+tmL7sswnXXZetefvn7yiOr/0h86lnViIbYn+eXoBLvIVmG+okP43lDHbRcULNqbnEAdMGF9iiv/UUVUQSfdaz5l+/v+ubt99068dFZNLeOj9ubp6akhqfGbjTkO8bkpBCR3vWq0168qhx/JbZ2WVdEDQUgAyAYBhpkkQXBQ/O0H1tDqfOtR+dmN764fvuDz70KqmwiAMrLRt5vCoNlnyVKRKQ5BCgiSFvNftMjohDvVRTsklZrpIz3AUpTp//Kha+7zqEyaR658eMf6bbmtzJHxnvvIQKIB1TgXQoWh/lEcfGqeZw4kmDRh1glOXgW4r5AJFRBohIKAlJf4tj87N65Wz5x262v/Ogeak5WKuaMqSn3dMLP47VSve6JSPWyzdGmL39v+wMLjQud+E7BsCpUmUKJSkwomRxNpVCGG8vkIH50IC4vGxo857mXodUqoz4ha05+7UZTKL/au0xElHtVCxsD321DsixcXiRYv7IUjKVzV7S+9cubrruvii2EX2/PFRvvUgCSJYtvc2mnpQBBRKEC8QKIoJM4rDFdXLahgbZTsAYrCwIgUKrQru/1boAAIioDUWR27mref8ttP5+4ldCZvPhiM/EcBj103e3ZDy/bHJ301R9tX8jSy4sRMRtSNgAbghpCbAgFE5TBhsB5icqGtVCIX/bcFTA9TQA0Gl1xlYnLRfVOmZn6jZR3yNqtvidAFUYVzUzojJEGausf+aIoaFNl+slDYK0mqEyand/69M/TtPMJYwssoqISoGqjimbX4fcOmsNhAwnaLnSgPRiVNSReBfVtWlXVMmnSydzMnrk3XD0zs1Murjwn4fceJ113e6aVijn0/373s3u66dbhomEYeBhAOXTzsQXYBpiCgnLYk1BkzYnbX3PsGD8366/Luhe9/jhbLF8iLlUCjC51NUg7LYjPlqxFFV0nekDs+HWrds1j9y9uAaCVyfpTu3x9QlCtctt3/zTrNHeADXvxwlAspoJNQwlev76FhiNYzpH8Xtpse0gq/UoIqlARGbRs5hrNj2z+px9v21odt7QfRpz1/M+G+g93VBWGCUwgQ1ADWM4t3xCMJVjL5EMJvG7VwNjz+LlavykMXs3RQKzeSxB+iLGSpfDddr/tp7w0ayaZXrauicPs/M9XXffzx7U3X3q68e30NO355qcaSdr9IFQpj2dInODtGxoYsQ5OuI+xgQD2gG+lAAd0kghQESlHxswstO5+rPnAh7Va5dNrU34/NKGYqNe9AvTB9i03t7z+tFSMmAw8OOAS1igiFlDeGbMhgFXKpYhNRJuenQLy2e6a37r0JCoOXqSSikKMqkAl4DRZtxWapABfggjoeOCYgVRevWYeC4vpfQAEExPP/Nn1uke1yju/9Ykvpu3m9shEZqEr/tTRNi5Y00EjUZB6qAhIQ+KVpgN83kjn1s/M6p1Hq7F4xWn1hzv16WmiZzHSfKbHzdVxU6/De8a34t4ggQkwISEbk3fF+dMYUmsYhdge8uwU0OveBoau4ahkvfMh9akACCWiT7p9uE8VUC9IUsGbDmhgmeliIfG7nlBc75vHiUs7V2Rp1zE8v/2QploIJAxqcnCMQJlC2xmoDzUovBc/bK1pNNtfOvwLP7xRJ3+zuP9kj9OnQ8+QqNySiEBJOaCrAQJhCvHfsMKEUSexAUyR1vOzsv5aTdaefMmLbWn4XHGJEIQhwdJFFK7TAsT3Kx9A0MoUxw+08dvLGlhIFGR4HgBuvmvXvvUg9bpHpWIe3/ZXP3hkofPn56919NKVHWmmCE1OXuFACdLMAOkZvgKqGjFzt92eXZhvvV8Bwl0bFfv7kRtmhviBZuqEGaxESgwoK2CWJs7IkVRlhaqs4Gf7IRoPXc1RkVVURYRUfMDoXQqXdkPREZIeVBWZd3jt6gUMaopMCD5Tebb3qwC4plrlNx6w8Jkr1+9OE0c5ZtdDUwiaeGjbAUwBcAujfxmyhrYtFH646Z9+ci+qeFaUkX19bEEt2EpzqNmG6VjDkLwqC7OGQG0BLYUhEEGZYn421r9688QZtjjw3yTriooY5C2/iISavyd8LzAA2k5x/EAHZ44tYiENeDyrKz3bC04CqNVqUj1s4XVHDErccSIMJUKo/5kIWHQBmsrJIAqCBfjhDun7Zw5/ychxv/t81KCoVMx+9wBUAQAfzzYXH/KlKCRd7hMqAiYVylLiEI5Cp06en1XsL5TeT1ER3nkVyZMfEdR7+LSL/jwr736983jt2i6K5NH1DOcJpNHY3nFzX2glqNfljv9x1qFxxO9qZl5ZiVUkTMmIoW0Hbbn8rgECd14xaJT+es9yecgsK5WXD3wwqKay38U/HZI69nSiNY/pUGzgVRkBFSAAJGHiZvqsAzAriKjJ+2r9K0648OWmNHy2uEyYyRAQwox4SJbkgTe8xlC0HfD8gRQvGl7Eng7BeaKuA5zw+r2Vui9JmAAdie2HRuJ4KHMitMSfAETh5xJ4rwF2EIH3QJkEd7SL+Pz8CjOIrkQDQxeOnPp7Z6I+4fe3F+zatZEUwADJyW0agGHymsPTZBhkAkRJvNQZERGMwSP7UApuVACGC4NbTFQMLaX2Bo0BEPOZC96fMwOUQli6eFUb1qfoOiDNlFpdQeZ4Y3Xt2gGq1USfAQzUapWpXvf3vfNlLyrH5tUL3VQ4zDIBDcN7LHpoCrAxYeIlBAbDEvDJ2ZWYRwwDqLERDQ4NXwtsjHMv2G/z8KnTIQygZPByFzpCCsOYEHZgOI//BLKBy6IAfOJ28DNaP2qybNN5F9rSyMniMg+oUQ3QMBjwPoOqXyJUUYj9xxW7OLXcxEJHoF6RZkrtrlc2dv2Bh609BgBNVJ4aClGAMD1N1fFxa6AfjY1hFclBRQKpAqnAN9J8nhwSmyhhyAq2toZww+IoRoxAiIxK5geGx05YdebZ70Z9wmO8un+8oDJpUNuimy6qnlgoFE6DdBXMTPkMoNeIwnDA4YlAzJyIwIn/GT9DCajA5oiK5WtgLFQ9aZ9sqZDc+sNLHghlCcgLLhxrwroUSQpkmcB5UJKpLxprBkuF8wHo23aN09Mon6le9685yr5tZdGe0kqdh7IRH5o+KODnU2jqA5vNh9fYMFJYfGZuNZRtGJAzg5gY4v3g8NjVoy98y/GYqrn9EYrGd91FAGkaFT8QRXFUMk4k59yRCXRLNdSb1kMJGhmi1Mue+bY+jQLC4WR009pLTWn0OJ+lXlW5J2QQIFmWazmHHVTQTj02xm2cUu6gkQSdpA5wjpClyt0MKBSLr6ngwNLNU1PyZKFAq2Cq1/0db3zRoSNF+6Gu80IKJtXQ8apCE4EspqEIkIADOQ8Mk+DLu4vYNssYjhjKFsQGRJZUQVGxVBpevubvsHJ8UCcnpU+bf07S32qnpmruwFdULzTFgVdqt+lHODPaH4cqlHPIszcNVJGiIajP7jj2L7Y/xE8Jfdc3KnB4gePye0GsKp5EBJLX/ep9eOaJuBeDxDu8fLAFSj06GSPNgDQDMqfIPHErdX6oVD7irFPXXFoDpDo+bn4ddh9nADRULH52MLYjaaYgUerxFxUEXUhy/iz1+aURFDMJ4VOPD8N6B59loBwHIDYgaxkqfnBk7Pj1Lzzzc0SkumWLPhcljI9vtZg6w6182QcOGxgc+ktRr7FPaHWUQnKekUIhZmlUqRrSFBOQdbNvPTUcXakwUJORo458tSkNb1JxAoDDqE8hXuCdQ4/XIRrq8ZZTnFRK8YqRFuaSYJGZp/AUQuqBNFVKvOrQ8PCWPzj44FGcfrpU9xLADy/bbKk25abffNZVq0rFs5vdzDOI4RXkJbhLywesv8+aC2TZEaP4m5ky7s6KGIgI3U4nlMoBpA9lCBsjkvqhseWXbLj4w/+biBi1moyPV+0SFfoZ0ODKpJmaOsOtvPADh40tX/a1yNjVSaerY9ThtYUUmeZMP8P5GXNKjKpaNrzQTrNup/2Vp6oECKjS6tX/XErXbfxRVB49QrxTYmYAYA5kSBFZSjA5z6CdOPyvA2ZcZaRpd3Qt7k8sMlGYXPO+hw+pykAU8c49jc+/efu21xMR/vLEE6PNmwPGfscbz7xobTmqgwheNJBKNW9iQNC5JMAPOQwtCpQYcn9m6fz711CHizBE8KqICkWUl6/aqys1YGKQYW/ikmm1mt+aefSRdzS3ffLeIF/lm2/ewlOrNmkAmyuoANi18S6a2rIlJBwAB1/6xxcVbOHTkTUH+PaiNFLPpw3M4u+PugddCVWPWs7JWqE6UVU/XIzMTKN94+raN8/RapXpqRDP4aPPf0dhxQGfgnivRIaXWLIh7KBH6Q6Rx5iIFuYXtv3s2MdaKwyf00lTWYTle1oR5jKGzUsy6aGWIt6SMbsXmp++9fvbrvw7oAsAd77u9FetLsefN4aLqSiMCTfugW5YdEuTrvzDHaBjsaG3PTiCL7bGsMwSfJ8EICgOj6A4uiKfmDHYcD45Y2/jkkm6nblWu/HJ3Quzf939l08++HQOsOrC2qnDAwOXx4ViBeLhux0hSXmmLbhi3cO46uCHMZdZkKUl2n1vSMqQGOBdM82zNly79V+1UjH0JGNPLFv2giFdf8id0dDoQeJdIHeESiKAXHtV8DnVRIwSP/7A42fuPjfZWEzx6cUkcRHBZmA82I3wQMug5XRpWB5gDImIebbdubMIuf609Tho5VDh9cYwUhE1TIQeqsgEJAJtZjkDNlAsvJKMFmN+cLHz/ZPuW7d2cHD0YPEZhLjH7IJ6j4Hlq1AaWQ7VQHMM2LwBAZ6MMWRiJO32vPNuayb+u1nm7xFNGkatLZQKa5hpkyE7zozTjI3Jd9si3pF6R5qlaKcp/uHYB3DKcAOLYnK8p597IYAfK8Vm9/zi11Z/6KYLekRd+2uxv07erznvTXF5ZL2K98RsVBSQQOfrDVlVAcMGkl8g2TPzEzxy/dZfuHN3r0+TrMDGOg0shcMHMhxQ8Hi8S5hNGIuOkAbUjovGyeFrSsceMoRjB4vAovdIM69selz2XMmZgFouYCzaAx1IC5Z1sZt2j+z84tJmtvbkQZU6iB0BlvL+gJjR3jMDZovS6LKgBObAtiYYiKpqKoVicbQUFS5S4CIvDiqa09FzMpfLkCVtZN2WV+cMxAMuxWLqcOxAByeMdNAW6kWpJXIAkRYNo9VNut3G4vsIQD3A7LBPrHzqMnLw8aNUGLocTEoht+abRKH5Il5yKwlhgSRzSJoLVSLghc2Bu++Nkqkxa85uOecBNqkoCiw4tEw4tCxwIDgJ7xMZYsuZeECaKQhMoW+UUCJQPlOgjkdvgwj5YocAUrbWPDS3530rv77zQYN/eDDdfOnfxkMr/7u4zIFgqUcFA9Ca2QkVj/KK1UvD+t7eEWC8evVpR4gBJkvEIPFenUtVnFeII4gYeG/UZxDvYMQjST0uOXwOg9ZhLuOcd6cg4h425gcKxj4223r/wZ/47l09Cv0Tq6BAGFUtHfTWaGDkIHVewoZWzuIlzi0hXN4YBhSeTMRpc2Fr5/6bvv6v14xb1Ou+wfaTifQnguC8CEgFyDTUY5bCU1WReLDT0KRT3uSRKkgA8gB39xJ+oB1BVP1oHJmZxuLWz3/9tmu1UjEeVebOzt/33cUfm6hgAfg+P5QBMgbt2cfR2PlA4JpGEYDA2g6GZoiNMUTGgMAiSl48q/OGxFl4MaH8dlDvwN6h0XV43kADr1qzgEYW7srcIyQThMiNDMR2dmHxhjX/89sf7S3w/So7mlGvy9ABRy835aF3siHt7UxoLzUQLZFcQVBRNcbAd9quPbfzvQDkjNoqrVarfP1hL/jG7izbPhhZVmhfCH3KIHpcnXya5n14aq6pHpPBK5D4X6sOVSEFa3mx051t7mq8qQYINm5UVIHd01OL0t11ies2H2MTmVB80RIpLrJIFxuYf+BedGZ3QQngKAYbu7SjQBSmaS6DugziUojzEOcgLgF8BoiDS1N0Fhfx3iNmMWR9GASTLtX9UDdasLbVbN+5a9ee10MBVJ64Pcm59RMApdHD3x6XR9fmxTMTKNDL8+TbayZywN2DrUma8591D2/7Qeic637L9DTVajWZN/SBZmCLIUyHGHu9AXpK6a8E5Iwu7WG4XkGJQKVn9dQLfWoNKbzH7vmFNx69/Y4dk5WKoVpNAp2lYmZ+8o17u41HL8i6izMw1gDqeosfIewEzmrzsYcw98ufY3H3o8jSJOwrswWRCQMV7W3DKlQdVFJIliLpdpC2FvHQXAdvPayBc9Z2MJ/ljOg+Aw9utBDZVrvz77sbixds/MwPZrGl+mtEBOo3yis2r1l28JF3RuWRZeq9or/I1ou7uhQFFJ5tZLrN+Xvnd9zzW3jneU3stbs7WQlz1ztfe9anjihE72ikzgGwey9gLOkiJK3+5hAtlQ6UL94s7TcBTOyGGPaRmYV3H/KNW6/de/n6V0vpkaN/+8Ro7MCv2OLgQZIljpjs0n5YLljJYyVb2EIRtjgAUyyFmCVhzi0+C2yPLIXPMhjxeLwLXLiujc+fuoBUBJJv34hCmeFHSpFdbHV/Ortn8aIN127f8dQ7Yr26/5jzPlZaeeAV4pwnJhPY5Yo+0Y/71Y9nY0zWaTcbO+8/yz287Qc5T1SegGRWQV/beV7xmFZn6qBCdNJ86hwBtm/yhCVH1KW1wyfoYOnTISpqmP1YZO2jM3MfO+j6f7ty6/i4PWNqyj0dg2Pk2HMPjQdXf8EWh18gPhVVAfWm9j36OgdrkLy77+2x/aqowsYMYVeHcP4BLfz1C+ZgycPlna+o+sgYMxgbLLY7X9rxyKOXHfcXd849qZHs5QE0uubU9bzukDttqTwYpkz97iHfWjdBGSKObGyzbqe7+PjDr0wf+PaNQAg9T4rl12qy9ZLf3rAh8t9ZE5lDm6nPRCXa6+37hB5i6jd3PR1xbyFOxEfGmCHDmJlvfOSAr3zvqqe71F5aCGdbu3lgxUGbrjXF8lvZRFDvvKoQiLi3M0Z72YHuVf+GddnAt+pkAWr/3UNb+JPj5sEkSISVoEIAj5YsdVLfaKduy4prvvnxveXwtHvCY5su+GS87IDfD9YPE7ZS8u0WIgVImEBgy2l78bH2nl2vS375ze9gfNziqSwQwGQFZqIOf8MlLzvsmMj94+rYbm4mmWr4KgY23KuY6Yn6CFVJmPASMGityTLXaS623n3gV7//51qtMmo13Tduz5J3jh1/0bmmOPxhUxw6ntlAfaphOVX7izQ94VNvjUMVqQCLGeGQssP7N7XwmvVNXUy9eLDGhmw5tuhkDt67f5xdaNcO+dNtd2veZDwD+Qw0eOT40aXRg/6N48FB8R7gfgHUG98z2EBdgqQ5//XGYzvehd2337ev317Ss4DPXXDa0AsGCh9bEZnLxiKLjvNwAgmcIuoXOr2vZ7BMPGDDlGsxSb+7p9G44qgbbr81t3zBsyNWBVp5OG9x7PkTb7CFobeYOH4+mTiw+sRDc/qpU4WTsAEJAOsHvF5ycJfefHgL6wsptzyjZBlsgEYnS5jw9W6SfHpl7Ts3770qu08HW3bsuZ+Nhw+4TNCjbi2ZooqDd+mCy9KbXXfhs+27b7zxCa69r3s0e7nh93/n7BetJnprrHh52dCyuJ8Ol6odp4pW5jrq3C0+dX918D/f8mUAsm9h55mZfb39uOXPf9XpsIULiaNxYnOoMaZcMIxyxFhV9HjeqMPpqzOMr+xiRSmDTzwWElFSfQyQnwrLTd1uduOBf7j1nj6BIF+V3WfLWH38KzZ41VMEhRNh+UAiWiaibfXZA96ld6SN5vbk4al/7+8C0xbaO+HusxIAQnXpq1y2v/GsQ0dTPbNEOM4r1nvFCIHaRHhEoNNZ2v7O8fV/u/PJlPgbLxWOj5tfCZ3xshMuOHx5gY8+/4iBY1+y1m44ZjhdvTbulgqapY2u7Oko7wTpjkj9nc2U7jryj7+5+wnMjelpei7G8R+/mnkLzbDt7gAAAABJRU5ErkJggg==';

    const STYLES = `
        :host{all:initial;--meli-bg:#fff;--meli-fg:#171717;--meli-muted:#f7f7f7;--meli-muted-2:#f2f2f2;--meli-muted-fg:#737373;--meli-border:#e7e7e7;--meli-input:#dedede;--meli-primary:#1f1f1f;--meli-primary-fg:#fafafa;--meli-danger:#b91c1c;--meli-danger-soft:#fff1f1;--meli-warning:#8a5a00;--meli-warning-soft:#fff8ed;--meli-success:#276749;--success:var(--meli-success);--meli-success-soft:#eef8f1;--meli-shadow:0 1px 3px rgba(15,23,42,.08),0 18px 44px rgba(15,23,42,.13);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--meli-fg);font-variant-numeric:tabular-nums}
        *,*:before,*:after{box-sizing:border-box}button,input,textarea,select{font:inherit}.meli-svg{width:17px;height:17px;display:block;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
        .meli-launcher{position:fixed;right:0;top:148px;z-index:2147483645;width:62px;height:52px;padding:0;border:1px solid #d7d7d7;border-right:0;border-radius:10px 0 0 10px;background:#fff;color:#171717;box-shadow:0 10px 26px rgba(0,0,0,.17);cursor:pointer;display:flex;align-items:center;justify-content:center}.meli-launcher[hidden]{display:none}.meli-launcher-logo{display:block;width:43px;height:auto;object-fit:contain}.meli-badge{position:absolute;right:4px;top:4px;min-width:17px;height:17px;padding:0 4px;border-radius:999px;background:var(--meli-danger);color:#fff;font:750 9px/17px Inter,system-ui,sans-serif;text-align:center}
        .meli-panel{position:fixed;z-index:2147483645;top:12px;right:12px;bottom:12px;width:min(620px,calc(100vw - 24px));display:grid;grid-template-columns:60px minmax(0,1fr);grid-template-rows:60px minmax(0,1fr);overflow:hidden;border:1px solid var(--meli-border);border-radius:12px;background:var(--meli-bg);box-shadow:var(--meli-shadow);font-size:12.5px;line-height:1.45;transition:width .2s ease,grid-template-columns .2s ease}.meli-panel[hidden]{display:none}.meli-panel.is-wide{width:min(1120px,calc(100vw - 24px));grid-template-columns:184px minmax(0,1fr)}
        .meli-head{grid-column:1/-1;min-width:0;padding:9px 11px 9px 14px;display:flex;align-items:center;gap:11px;border-bottom:1px solid var(--meli-border);background:#fff}.meli-logo{width:48px;height:32px;display:flex;align-items:center;justify-content:center;flex:0 0 auto}.meli-logo-link{border-radius:7px;text-decoration:none}.meli-logo-link:focus-visible{outline:2px solid #171717;outline-offset:3px}.meli-brand-logo{display:block;width:43px;height:auto;object-fit:contain}.meli-brand{min-width:0;flex:1}.meli-title{margin:0;font-size:14px;font-weight:730;letter-spacing:-.015em;line-height:1.2}.meli-subtitle{margin-top:3px;color:var(--meli-muted-fg);font-size:11px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.meli-version{height:22px;padding:0 8px;display:inline-flex;align-items:center;border:1px solid var(--meli-border);border-radius:999px;background:var(--meli-muted);color:#525252;font-size:10px;font-weight:700}.meli-head-actions{display:flex;align-items:center;gap:6px;flex:0 0 auto}.meli-icon,.meli-lang{width:32px;min-width:32px;height:32px;padding:0;border:1px solid var(--meli-border);border-radius:7px;background:#fff;color:#525252;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}.meli-lang{width:auto;min-width:34px;padding:0 7px;font-size:10.5px;font-weight:750;letter-spacing:.04em}.meli-icon:hover,.meli-lang:hover{background:var(--meli-muted);color:#171717}
        .meli-nav{grid-column:1;grid-row:2;padding:10px 7px;display:flex;flex-direction:column;gap:5px;border-right:1px solid var(--meli-border);background:#fafafa;overflow:auto}.meli-nav-btn{width:100%;min-height:40px;padding:0;display:flex;align-items:center;justify-content:center;gap:9px;border:1px solid transparent;border-radius:7px;background:transparent;color:#737373;font-size:12px;font-weight:650;cursor:pointer}.meli-nav-btn:hover{background:#fff;color:#171717}.meli-nav-btn.is-active{border-color:#dedede;background:#fff;color:#171717;box-shadow:0 1px 2px rgba(0,0,0,.04)}.meli-nav-label{display:none;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.meli-panel.is-wide .meli-nav{padding:10px}.meli-panel.is-wide .meli-nav-btn{padding:0 11px;justify-content:flex-start}.meli-panel.is-wide .meli-nav-label{display:block}
        .meli-main{grid-column:2;grid-row:2;min-width:0;overflow:auto;overscroll-behavior:contain;padding:18px;background:var(--meli-muted)}.meli-view{min-width:0;max-width:100%;animation:meli-view-in .16s ease}.meli-view-head{margin-bottom:14px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.meli-view-title{margin:0;font-size:18px;font-weight:740;letter-spacing:-.025em;line-height:1.2}.meli-view-copy{margin:4px 0 0;color:#737373;font-size:11.5px;line-height:1.45}.meli-card{overflow:hidden;border:1px solid var(--meli-border);border-radius:9px;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.04)}.meli-card+.meli-card{margin-top:12px}.meli-card-head{min-height:43px;padding:9px 11px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid var(--meli-border);background:#fafafa}.meli-card-head strong{font-size:12.5px}.meli-card-body{padding:12px}
        .meli-status{margin-bottom:12px;padding:11px 12px;display:flex;align-items:flex-start;gap:10px;border:1px solid var(--meli-border);border-radius:9px;background:#fff}.meli-status-mark{width:28px;height:28px;display:grid;place-items:center;flex:0 0 auto;border:1px solid var(--meli-border);border-radius:7px;background:var(--meli-muted);color:#525252}.meli-status[data-tone="ready"] .meli-status-mark{border-color:#c9dfd1;background:var(--meli-success-soft);color:var(--meli-success)}.meli-status[data-tone="scanning"] .meli-status-mark{border-color:#eed69a;background:var(--meli-warning-soft);color:var(--meli-warning)}.meli-status[data-tone="blocked"] .meli-status-mark,.meli-status[data-tone="error"] .meli-status-mark{border-color:#f1c0c0;background:var(--meli-danger-soft);color:var(--meli-danger)}.meli-status strong{display:block;font-size:12.5px;font-weight:720}.meli-status span{display:block;margin-top:2px;color:#525252;font-size:11.5px;line-height:1.42;overflow-wrap:anywhere}
        .meli-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.meli-panel.is-wide .meli-grid{grid-template-columns:repeat(6,minmax(0,1fr))}.meli-stat{min-width:0;padding:11px;border:1px solid var(--meli-border);border-radius:8px;background:#fff}.meli-stat span{display:block;margin-bottom:5px;color:#8a8a8a;font-size:9.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}.meli-stat strong{display:block;overflow:hidden;font-size:16px;font-weight:740;line-height:1.25;text-overflow:ellipsis;white-space:nowrap}.meli-stat[data-tone="warning"] strong{color:var(--meli-warning)}.meli-stat[data-tone="danger"] strong{color:var(--meli-danger)}
        .meli-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.meli-btn{min-height:36px;padding:0 12px;display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--meli-input);border-radius:7px;background:#fff;color:#171717;box-shadow:0 1px 2px rgba(0,0,0,.04);font:650 12px/1 Inter,system-ui,sans-serif;cursor:pointer;transition:background .15s,border-color .15s,color .15s;white-space:nowrap}.meli-btn:hover{border-color:#cfcfcf;background:#f7f7f7}.meli-btn.primary{border-color:var(--meli-primary);background:var(--meli-primary);color:var(--meli-primary-fg)}.meli-btn.primary:hover{background:#303030}.meli-btn.danger{color:var(--meli-danger);border-color:#f1c0c0}.meli-btn.danger:hover{background:var(--meli-danger-soft)}.meli-btn:disabled{opacity:.5;cursor:not-allowed}.meli-btn:focus-visible,.meli-icon:focus-visible,.meli-lang:focus-visible,.meli-nav-btn:focus-visible,.meli-input:focus-visible,.meli-select:focus-visible,.meli-textarea:focus-visible{outline:2px solid #525252;outline-offset:2px}
        .meli-queue{overflow:hidden;border:1px solid var(--meli-border);border-radius:8px;background:#fff}.meli-queue-title{min-height:41px;padding:9px 11px;display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid var(--meli-border);background:#fafafa;font-weight:720}.meli-queue-body{padding:11px}.meli-queue p{margin:0;color:#525252;font-size:11.5px}.meli-note{margin:12px 0 0;padding:10px 11px;border:1px solid #eed69a;border-radius:8px;background:var(--meli-warning-soft);color:#704900;font-size:11px;line-height:1.45}
        .meli-toolbar{min-height:45px;padding:8px 10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;border-bottom:1px solid var(--meli-border);background:#fafafa}.meli-toolbar.bottom{border-top:1px solid var(--meli-border);border-bottom:0}.meli-toolbar-meta{margin-left:auto;color:#737373;font-size:11px;font-weight:650}.meli-input,.meli-select,.meli-textarea{width:100%;border:1px solid #d9d9d9;border-radius:7px;outline:none;background:#fff;color:#171717;padding:9px 10px;font:12.5px/1.4 Inter,system-ui,sans-serif;transition:border-color .15s,box-shadow .15s}.meli-input,.meli-select{height:40px}.meli-input:focus,.meli-select:focus,.meli-textarea:focus{border-color:#525252;box-shadow:0 0 0 3px rgba(23,23,23,.09)}.meli-toolbar .meli-input{flex:1;min-width:180px;height:34px}.meli-toolbar .meli-select{width:auto;min-width:150px;height:34px;padding-top:0;padding-bottom:0}
        .meli-analysis-card,.meli-form-card{overflow:hidden;border:1px solid #d9d9d9;border-radius:9px;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.04)}.meli-meta{margin-top:3px;color:#737373;font-size:10.5px;line-height:1.38}.meli-pill{min-width:66px;padding:4px 7px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #dedede;border-radius:999px;background:#f7f7f7;color:#525252;font-size:10px;font-weight:750;white-space:nowrap}.meli-pill.success{color:var(--meli-success);border-color:#c9dfd1;background:var(--meli-success-soft)}.meli-pill.warning{color:var(--meli-warning);border-color:#eed69a;background:var(--meli-warning-soft)}.meli-pill.danger{color:#991b1b;border-color:#f1c0c0;background:var(--meli-danger-soft)}.meli-mini{min-height:30px;padding:0 8px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #e1e1e1;border-radius:6px;background:#fff;color:#404040;font:650 10.5px/1 Inter,system-ui,sans-serif;text-decoration:none;cursor:pointer;white-space:nowrap}.meli-mini:hover{border-color:#cfcfcf;background:#f7f7f7}.meli-check{width:16px;height:16px;accent-color:#1f1f1f}.meli-empty{min-height:120px;padding:24px;display:grid;place-items:center;color:#737373;font-size:12px;text-align:center}
        .meli-form-grid{padding:13px;display:grid;grid-template-columns:1fr 1fr;gap:12px}.meli-field{min-width:0;display:grid;gap:6px}.meli-field.full{grid-column:1/-1}.meli-field-head{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#404040;font-size:11.5px;font-weight:700}.meli-field-toggle{display:inline-flex;align-items:center;gap:6px;color:#737373;font-size:10.5px;font-weight:650;white-space:nowrap}.meli-field-toggle input{width:15px;height:15px;margin:0;accent-color:#1f1f1f}.meli-field[data-edit-field]{padding:10px;border:1px solid var(--meli-border);border-radius:8px;background:#fafafa;transition:opacity .15s,border-color .15s,background .15s}.meli-field[data-edit-field].is-selected{border-color:#b8b8b8;background:#fff;box-shadow:0 0 0 2px rgba(23,23,23,.04)}.meli-field[data-edit-field].is-disabled{opacity:.55}.meli-field small{display:block;color:#737373;font-size:10.5px;line-height:1.4}.meli-textarea{min-height:112px;resize:vertical}.meli-feedback{min-height:20px;margin-top:8px;color:var(--meli-danger);font-size:11.5px;font-weight:650}.meli-history{display:grid;gap:8px}.meli-history-item{border:1px solid var(--meli-border);border-radius:8px;padding:10px;background:#fff}.meli-history-metrics{display:flex;flex-wrap:wrap;gap:8px;margin-top:5px;color:#525252;font-size:11.5px}.meli-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.meli-setting{padding:11px;border:1px solid var(--meli-border);border-radius:8px;background:#fff}.meli-setting span{display:block;color:#737373;font-size:10.5px;line-height:1.35}.meli-setting strong{display:block;margin-top:5px;font-size:16px}.meli-ai-layout{display:grid;gap:12px}.meli-ai-layout .meli-textarea{min-height:320px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px}
        .meli-health-trigger{border:1px solid #dedede;font-family:inherit;cursor:pointer}.meli-health-trigger:focus-visible{outline:2px solid #525252;outline-offset:2px}.meli-health-diagnosis{max-width:220px;margin-top:6px;overflow:hidden;color:#303030;font-size:11.5px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}.meli-health-context{margin-bottom:12px;padding:11px 12px;border:1px solid var(--meli-border);border-radius:9px;background:#fff}.meli-health-context>div:first-child{display:flex;align-items:center;gap:8px}.meli-health-detail{display:grid;gap:10px}.meli-health-summary,.meli-detail-card{padding:13px;border:1px solid var(--meli-border);border-radius:9px;background:#fff}.meli-health-summary>div:first-child{display:flex;align-items:center;justify-content:space-between;gap:10px}.meli-health-summary h3,.meli-detail-card h3{margin:8px 0 0;font-size:13px}.meli-detail-card h3{margin:0 0 9px}.meli-health-cap{margin-top:9px;padding:8px;border-radius:7px;background:var(--meli-warning-soft);color:var(--meli-warning);font-size:10.5px;font-weight:650}.meli-evidence,.meli-safeguards{margin:0;padding-left:18px;color:#404040;font-size:11.5px;line-height:1.55}.meli-safeguards{padding:0;display:grid;gap:6px;list-style:none}.meli-safeguards li{display:flex;align-items:flex-start;gap:7px;color:#737373}.meli-safeguards li[data-passed="true"]{color:#276749}.meli-safeguards span{width:14px;flex:0 0 auto;font-weight:800}.meli-confidence-list{display:grid;gap:8px}.meli-confidence-row{display:grid;grid-template-columns:128px 1fr 32px;align-items:center;gap:8px;color:#525252;font-size:10.5px}.meli-confidence-row>div{height:5px;overflow:hidden;border-radius:999px;background:#ededed}.meli-confidence-row i{height:100%;display:block;border-radius:inherit;background:#525252}.meli-confidence-row b{text-align:right;font-size:10.5px}
        .meli-analysis-card{display:flex;min-height:0;flex-direction:column;border-radius:14px;background:#f4f4f3;box-shadow:0 14px 34px rgba(15,23,42,.07)}.meli-analysis-controls{padding:12px;display:grid;grid-template-columns:minmax(220px,1fr) minmax(170px,220px);gap:10px;border-bottom:1px solid var(--meli-border);background:#fff}.meli-analysis-search{position:relative}.meli-analysis-search>.meli-svg{position:absolute;left:12px;top:11px;z-index:1;width:16px;height:16px;color:#8a8a8a}.meli-analysis-search .meli-input{padding-left:38px}.meli-selection-tools{grid-column:1/-1;display:flex;align-items:center;gap:12px}.meli-selection-tools .meli-toolbar-meta{margin-right:auto}.meli-text-btn{min-height:28px;padding:0;border:0;background:transparent;color:#525252;font:700 10.5px/1 Inter,system-ui,sans-serif;cursor:pointer}.meli-text-btn:hover{color:#171717;text-decoration:underline}.meli-listing-list{min-height:160px;max-height:calc(100dvh - 272px);padding:12px;display:grid;grid-template-columns:1fr;align-content:start;gap:12px;overflow:auto;overscroll-behavior:contain}.meli-panel.is-wide .meli-listing-list{grid-template-columns:repeat(2,minmax(420px,1fr))}.meli-listing-card{min-width:0;overflow:hidden;border:1px solid #dfdfdc;border-radius:14px;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.035);transition:border-color .16s,box-shadow .16s,transform .16s}.meli-listing-card:hover{border-color:#c9c9c6;box-shadow:0 8px 22px rgba(15,23,42,.08);transform:translateY(-1px)}.meli-listing-card.is-selected{border-color:#171717;box-shadow:0 0 0 1px #171717,0 8px 22px rgba(15,23,42,.09)}.meli-listing-card-head{min-height:82px;padding:13px;display:grid;grid-template-columns:22px 58px minmax(0,1fr) auto;align-items:center;gap:11px}.meli-card-select{width:18px;height:18px;display:grid;place-items:center}.meli-card-select .meli-check{margin:0}.meli-card-thumb{width:58px;height:58px;display:grid;place-items:center;object-fit:cover;border:1px solid #e8e8e5;border-radius:11px;background:#efefec;color:#8a8a8a}.meli-card-thumb.is-empty .meli-svg{width:20px;height:20px}.meli-card-identity{min-width:0}.meli-card-identity h3{margin:0;display:-webkit-box;overflow:hidden;color:#171717;font-size:13.5px;font-weight:760;letter-spacing:-.012em;line-height:1.32;-webkit-box-orient:vertical;-webkit-line-clamp:2}.meli-card-meta{margin-top:5px;display:flex;align-items:center;gap:6px;color:#8a8a8a;font-size:9.5px;font-weight:650}.meli-card-meta i{width:2px;height:2px;border-radius:50%;background:#b5b5b5}.meli-card-status{margin-top:3px;overflow:hidden;color:#737373;font-size:9.5px;text-overflow:ellipsis;white-space:nowrap}.meli-card-health{min-width:158px;display:grid;justify-items:end;gap:4px}.meli-score-copy{display:grid;justify-items:end;gap:1px}.meli-score-copy span{color:#737373;font-size:8px;font-weight:760;letter-spacing:.04em;text-transform:uppercase}.meli-score-copy strong{color:#171717;font-size:14px}.meli-card-confidence{color:#737373;font-size:8.5px;font-weight:680}.meli-confidence-track{width:100%;height:3px;overflow:hidden;border-radius:99px;background:#ececea}.meli-confidence-track i{height:100%;display:block;border-radius:inherit;background:#292929}.meli-metrics-strip{padding:9px 13px;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:0;border-top:1px solid #ededeb;border-bottom:1px solid #ededeb;background:#fafaf9}.meli-metric{min-width:0;padding:0 8px;border-right:1px solid #e8e8e5}.meli-metric:first-child{padding-left:0}.meli-metric:last-child{padding-right:0;border-right:0}.meli-metric>span{display:block;overflow:hidden;color:#8a8a8a;font-size:8.5px;font-weight:760;letter-spacing:.055em;text-overflow:ellipsis;text-transform:uppercase;white-space:nowrap}.meli-metric>div{margin-top:3px;display:flex;align-items:baseline;gap:5px}.meli-metric strong{overflow:hidden;color:#171717;font-size:13px;font-weight:780;text-overflow:ellipsis;white-space:nowrap}.meli-metric small{color:#9a9a9a;font-size:8.5px;font-weight:700}.meli-metric small.up{color:#276749}.meli-metric small.down{color:#b45309}.meli-card-insight{min-height:58px;padding:10px 13px;display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:9px}.meli-insight-icon{width:28px;height:28px;display:grid;place-items:center;border-radius:8px;background:#f1f1ef;color:#525252}.meli-insight-icon .meli-svg{width:15px;height:15px}.meli-card-insight b{display:block;font-size:11.5px}.meli-card-insight p{margin:2px 0 0;display:-webkit-box;overflow:hidden;color:#737373;font-size:9.5px;line-height:1.35;-webkit-box-orient:vertical;-webkit-line-clamp:2}.meli-card-insight>span{max-width:118px;color:#8a8a8a;font-size:9px;line-height:1.35;text-align:right}.meli-listing-card-foot{min-height:43px;padding:7px 9px;display:flex;justify-content:flex-end;gap:6px;border-top:1px solid #ededeb;background:#fcfcfb}.meli-card-action{min-height:30px;padding:0 9px;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid #e1e1df;border-radius:8px;background:#fff;color:#404040;font:700 10px/1 Inter,system-ui,sans-serif;text-decoration:none;cursor:pointer}.meli-card-action .meli-svg{width:14px;height:14px}.meli-card-action:hover{border-color:#bdbdb9;background:#f5f5f3}.meli-card-action.primary{border-color:#1f1f1f;background:#1f1f1f;color:#fff}.meli-card-action.primary:hover{background:#333}.meli-bulk-bar{min-height:61px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid var(--meli-border);background:#fff}.meli-bulk-bar[hidden]{display:none!important}.meli-bulk-bar>div:first-child{min-width:0}.meli-bulk-bar b{display:block;font-size:11.5px}.meli-bulk-bar span{display:block;margin-top:2px;overflow:hidden;color:#8a8a8a;font-size:9.5px;text-overflow:ellipsis;white-space:nowrap}.meli-bulk-bar>div:last-child{display:flex;gap:7px}
        .meli-overlay{position:fixed;inset:0;z-index:2147483646;padding:6vh 18px 24px;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;background:rgba(0,0,0,.30);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#171717}.meli-modal{width:min(820px,calc(100vw - 32px));max-height:88vh;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--meli-border);border-radius:12px;background:#fff;box-shadow:0 25px 50px -12px rgba(0,0,0,.26)}.meli-modal.small{width:min(820px,calc(100vw - 32px))}.meli-modal-head{min-height:64px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--meli-border);background:#fff}.meli-modal-brand{min-width:0;display:flex;align-items:center;gap:10px}.meli-modal-logo{width:48px;height:32px;display:flex;align-items:center;justify-content:center;flex:0 0 auto}.meli-modal-title{margin:0;font-size:15px;font-weight:720;letter-spacing:-.015em;line-height:1.25}.meli-modal-subtitle{margin-top:3px;color:#737373;font-size:11.5px}.meli-modal-body{padding:18px;overflow:auto;background:#f7f7f7}.meli-modal-foot{padding:12px 16px;display:flex;align-items:center;justify-content:flex-end;gap:8px;border-top:1px solid var(--meli-border);background:#fafafa}
        .meli-toast-root{position:fixed;top:16px;left:50%;z-index:2147483647;transform:translateX(-50%);width:min(360px,calc(100vw - 32px));display:grid;gap:8px;pointer-events:none;font:600 14px/1.4 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.meli-toast{--meli-toast:#343a4a;min-height:44px;padding:10px 10px 10px 13px;border-radius:10px;display:flex;align-items:center;gap:10px;color:#fff;background:var(--meli-toast);box-shadow:0 8px 24px rgba(24,28,45,.18);opacity:0;transform:translateY(8px);transition:opacity .18s ease,transform .18s ease;pointer-events:auto}.meli-toast.is-visible{opacity:1;transform:none}.meli-toast[data-tone="success"]{--meli-toast:#178847}.meli-toast[data-tone="error"]{--meli-toast:#c23b3b}.meli-toast[data-tone="warning"]{--meli-toast:#a85710}.meli-toast-mark{width:20px;height:20px;border:2px solid currentColor;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;font-size:11px;line-height:1}.meli-toast-copy{min-width:0;flex:1;overflow-wrap:anywhere}.meli-toast-close{width:28px;height:28px;padding:0;border:0;border-radius:7px;display:grid;place-items:center;color:inherit;background:transparent;cursor:pointer;opacity:.72}.meli-toast-close:hover{opacity:1;background:rgba(255,255,255,.14)}
        @keyframes meli-view-in{from{opacity:.5;transform:translateY(3px)}to{opacity:1;transform:none}}
        @media(max-width:760px){.meli-panel,.meli-panel.is-wide{top:8px;right:8px;bottom:8px;left:8px;width:auto;grid-template-columns:52px minmax(0,1fr)}.meli-head{padding-left:9px}.meli-main{padding:12px}.meli-launcher{top:auto;bottom:86px}.meli-grid,.meli-panel.is-wide .meli-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.meli-panel.is-wide .meli-nav{padding:10px 7px}.meli-panel.is-wide .meli-nav-btn{padding:0;justify-content:center}.meli-panel.is-wide .meli-nav-label{display:none}.meli-overlay{padding:10px}.meli-modal,.meli-modal.small{width:100%;max-height:calc(100dvh - 20px)}.meli-modal-body{padding:12px}.meli-form-grid,.meli-settings-grid{grid-template-columns:1fr}.meli-field.full{grid-column:auto}.meli-toolbar .meli-input,.meli-toolbar .meli-select{width:100%;min-width:0;height:44px;font-size:16px}.meli-modal-foot{flex-wrap:wrap}.meli-modal-foot>.meli-btn{flex:1}.meli-toast-root{top:12px}}
        @media(max-width:480px){.meli-panel,.meli-panel.is-wide{top:4px;right:4px;bottom:4px;left:4px;width:auto;grid-template-columns:48px minmax(0,1fr)}.meli-head{padding:8px;gap:6px}.meli-logo{width:40px}.meli-brand-logo{width:37px}.meli-title{font-size:12.5px}.meli-subtitle{display:none}.meli-head-actions{gap:4px}.meli-icon,.meli-lang{width:29px;min-width:29px;height:29px}.meli-main{padding:10px}.meli-nav{padding:8px 5px}.meli-nav-btn{min-height:38px}.meli-grid,.meli-panel.is-wide .meli-grid{grid-template-columns:1fr 1fr;gap:7px}.meli-stat{padding:9px}.meli-view-title{font-size:16px}.meli-toolbar{padding:8px}.meli-field-toggle{white-space:normal;text-align:right}.meli-modal-head{padding:10px 12px}.meli-modal-title{font-size:14px}.meli-modal-subtitle{font-size:10.5px}.meli-modal-body{padding:10px}.meli-modal-foot{padding:10px}.meli-toast-root{top:8px;width:calc(100vw - 20px)}}
        @media(max-width:1100px){.meli-panel.is-wide .meli-listing-list{grid-template-columns:1fr}}
        @media(max-width:760px){.meli-analysis-controls{grid-template-columns:1fr}.meli-selection-tools{grid-column:auto;flex-wrap:wrap}.meli-listing-list,.meli-panel.is-wide .meli-listing-list{max-height:calc(100dvh - 280px);padding:9px;grid-template-columns:1fr}.meli-listing-card-head{grid-template-columns:22px 52px minmax(0,1fr);padding:11px;gap:9px}.meli-card-thumb{width:52px;height:52px}.meli-card-health{grid-column:2/-1;width:100%;padding-top:7px;display:grid;grid-template-columns:auto 1fr;align-items:center;justify-items:start}.meli-score-copy,.meli-card-confidence{justify-self:end}.meli-card-confidence,.meli-confidence-track{grid-column:1/-1}.meli-confidence-track{min-width:70px}.meli-metrics-strip{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 0}.meli-metric:nth-child(3){border-right:0}.meli-metric:nth-child(n+4){padding-top:7px;border-top:1px solid #e8e8e5}.meli-card-insight{grid-template-columns:28px minmax(0,1fr)}.meli-card-insight>span{grid-column:2;max-width:none;text-align:left}.meli-bulk-bar{align-items:stretch;flex-direction:column}.meli-bulk-bar>div:last-child{display:grid;grid-template-columns:1fr 1fr}.meli-card-action{flex:1}.meli-card-action span{display:block}.meli-confidence-row{grid-template-columns:106px 1fr 30px}}
        @media(max-width:480px){.meli-analysis-controls{padding:9px}.meli-listing-list{padding:7px}.meli-listing-card{border-radius:11px}.meli-card-insight p{font-size:9px}.meli-listing-card-foot{display:grid;grid-template-columns:1fr 1fr}.meli-card-action:first-child{grid-column:1/-1}.meli-bulk-bar>div:last-child{grid-template-columns:1fr}.meli-bulk-bar .meli-btn{width:100%}}
        /* Premium monochrome surfaces and a legible numeric scale. */
        :host{--meli-muted:#f5f5f5;--meli-muted-2:#eeeeee;--meli-muted-fg:#595959;--meli-border:#dedede;--meli-input:#cfcfcf;--meli-warning-soft:#fff;--meli-success-soft:#fff;--meli-danger-soft:#fff;--meli-shadow:0 1px 3px rgba(0,0,0,.08),0 18px 44px rgba(0,0,0,.14)}
        .meli-panel{font-size:13px}.meli-subtitle{font-size:11.5px}.meli-version{color:#404040;font-size:11px}.meli-nav{background:#fafafa}.meli-nav-btn{color:#595959;font-size:12.5px}.meli-main{background:#f5f5f5}.meli-view-copy{color:#595959;font-size:12px}.meli-stat span{color:#595959;font-size:10px}.meli-stat strong,.meli-stat[data-tone="warning"] strong,.meli-stat[data-tone="danger"] strong{color:#171717;font-size:18px}.meli-toolbar-meta,.meli-text-btn{color:#404040;font-size:11.5px}.meli-meta{color:#595959;font-size:11px}.meli-pill{border-color:#bdbdbd;background:#fff;color:#303030;font-size:10.5px}.meli-pill.success{border-color:#a9d8be;background:#edf8f1;color:#1f7a4d}.meli-pill.balanced{border-color:#b9cdf8;background:#eff6ff;color:#1d4ed8}.meli-pill.warning{border-color:#e5c56b;background:#fff9df;color:#8a5a00}.meli-pill.danger{border-color:#efb4ae;background:#fff1f0;color:#b42318}.meli-note{border-color:#cfcfcf;background:#fff;color:#404040}.meli-status[data-tone="ready"] .meli-status-mark,.meli-status[data-tone="scanning"] .meli-status-mark,.meli-status[data-tone="blocked"] .meli-status-mark,.meli-status[data-tone="error"] .meli-status-mark{border-color:#bdbdbd;background:#fff;color:#303030}.meli-health-diagnosis{font-size:12px}.meli-health-cap{border:1px solid #bdbdbd;background:#fff;color:#303030}.meli-safeguards li[data-passed="true"]{color:#303030}.meli-confidence-row,.meli-confidence-row b{font-size:11.5px}.meli-confidence-row{grid-template-columns:132px 1fr 38px}
        .meli-analysis-card{background:#f2f2f2;box-shadow:0 14px 34px rgba(0,0,0,.08)}.meli-listing-card{border-color:#d9d9d9;box-shadow:0 1px 2px rgba(0,0,0,.04)}.meli-listing-card:hover{border-color:#bdbdbd;box-shadow:0 8px 22px rgba(0,0,0,.09)}.meli-card-thumb{border-color:#dedede;background:#ededed;color:#595959}.meli-card-identity h3{font-size:15px}.meli-card-meta,.meli-card-status{color:#595959;font-size:11.5px}.meli-card-health>b{color:#303030;font-size:11.5px}.meli-card-confidence{color:#595959;font-size:10.5px}.meli-confidence-track{height:5px;background:#e2e2e2}.meli-metrics-strip{padding:12px 13px;grid-template-columns:repeat(3,minmax(0,1fr));border-color:#dedede;background:#f5f5f5}.meli-metric{padding:0 12px;border-color:#dedede}.meli-metric:nth-child(3){padding-right:0;border-right:0}.meli-metric:nth-child(4){padding-left:0}.meli-metric:nth-child(n+4){margin-top:10px;padding-top:10px;border-top:1px solid #dedede}.meli-metric>span{color:#595959;font-size:10.5px;letter-spacing:.035em}.meli-metric>div{margin-top:4px;display:grid;align-items:start;gap:2px}.meli-metric strong{overflow:visible;font-size:16px;line-height:1.15;text-overflow:clip}.meli-metric small{display:block;min-height:13px;color:#595959;font-size:11.5px;font-weight:750;line-height:1.2}.meli-metric small.up{color:#1f7a4d}.meli-metric small.down{color:#b42318}.meli-insight-icon{background:#ededed}.meli-insight-icon[data-lifecycle="ACTIVE_GROWING"]{color:#16a34a}.meli-insight-icon[data-lifecycle="PROTECTED"]{color:#166534}.meli-insight-icon[data-lifecycle="ACTIVE_STABLE"]{color:#1d4ed8}.meli-insight-icon[data-lifecycle="EXPERIMENT_RUNNING"]{color:#7c3aed}.meli-insight-icon[data-lifecycle="BASELINE"],.meli-insight-icon[data-lifecycle="LEARNING"]{color:#ca8a04}.meli-insight-icon[data-lifecycle="DORMANT"]{color:#d97706}.meli-insight-icon[data-lifecycle="ACTIVE_DECLINING"]{color:#dc2626}.meli-insight-icon[data-lifecycle="DEACTIVATION_REVIEW"]{color:#991b1b}.meli-card-insight b{font-size:13px}.meli-card-insight p{color:#525252;font-size:11.5px;line-height:1.45}.meli-card-insight>span{color:#595959;font-size:11.5px}.meli-listing-card-foot{border-color:#dedede;background:#f7f7f7}.meli-card-action{border-color:#d0d0d0;color:#303030;font-size:12px}.meli-card-action:hover{border-color:#999;background:#f2f2f2}.meli-bulk-bar span{color:#595959;font-size:11px}.meli-main,.meli-listing-list{scrollbar-gutter:stable;scrollbar-width:auto;scrollbar-color:#686868 #e7e7e7}.meli-main::-webkit-scrollbar,.meli-listing-list::-webkit-scrollbar{width:10px;height:10px}.meli-main::-webkit-scrollbar-track,.meli-listing-list::-webkit-scrollbar-track{border-left:1px solid #d5d5d5;background:#e7e7e7}.meli-main::-webkit-scrollbar-thumb,.meli-listing-list::-webkit-scrollbar-thumb{min-height:48px;border:2px solid #e7e7e7;border-radius:999px;background:#686868}.meli-main::-webkit-scrollbar-thumb:hover,.meli-listing-list::-webkit-scrollbar-thumb:hover{background:#303030}
        .meli-collection-card{margin-top:12px;padding:13px;border:1px solid #d6d6d6;border-radius:10px;background:#fff}.meli-collection-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.meli-collection-head>div{display:grid;gap:2px}.meli-collection-head span{color:#595959;font-size:10px;font-weight:760;letter-spacing:.055em;text-transform:uppercase}.meli-collection-head strong{font-size:13px}.meli-collection-head>b{font-size:13px}.meli-collection-track{height:7px;margin-top:10px;overflow:hidden;border-radius:99px;background:#e4e4e4}.meli-collection-track i{height:100%;display:block;border-radius:inherit;background:#202020;transition:width .18s ease}.meli-collection-meta{margin-top:10px;display:flex;gap:22px}.meli-collection-meta span{display:flex;align-items:center;gap:6px;color:#595959;font-size:11px}.meli-collection-meta b{color:#171717}.meli-shortcut-hint{align-self:center;color:#595959;font-size:10.5px;font-weight:650}
        .meli-main{overflow-y:scroll}.meli-main[data-view-panel="analysis"]{overflow:hidden}.meli-main[data-view-panel="analysis"]>.meli-view{height:100%;min-height:0;display:flex;flex-direction:column}.meli-main[data-view-panel="analysis"] .meli-view-head{flex:0 0 auto}.meli-main[data-view-panel="analysis"] .meli-analysis-card{min-height:0;flex:1}.meli-analysis-controls{grid-template-columns:minmax(240px,1fr) auto minmax(185px,225px);align-items:end}.meli-filter-toggle{height:40px;padding:0 12px;display:inline-flex;align-items:center;gap:7px;border:1px solid #cfcfcf;border-radius:8px;background:#fff;color:#303030;font:720 12px/1 Inter,system-ui,sans-serif;cursor:pointer}.meli-filter-toggle:hover,.meli-filter-toggle[aria-expanded="true"]{border-color:#8a8a8a;background:#f2f2f2}.meli-filter-toggle .meli-svg{width:15px;height:15px}.meli-filter-toggle b{min-width:18px;height:18px;padding:0 5px;border-radius:99px;background:#202020;color:#fff;font:750 9px/18px Inter,system-ui,sans-serif;text-align:center}.meli-sort-control{min-width:0;display:grid;gap:4px}.meli-sort-control>span,.meli-filter-drawer label>span{color:#595959;font-size:9.5px;font-weight:760;letter-spacing:.045em;text-transform:uppercase}.meli-filter-drawer{grid-column:1/-1;padding:11px;max-height:230px;display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));align-items:end;gap:10px;border:1px solid #d8d8d8;border-radius:10px;background:#f5f5f5;overflow-y:auto}.meli-filter-drawer[hidden]{display:none!important}.meli-filter-drawer label{min-width:0;display:grid;gap:5px}.meli-filter-drawer .meli-btn{height:40px}.meli-selection-tools{grid-column:1/-1;padding-top:2px;flex-wrap:wrap}.meli-selection-tools .meli-toolbar-meta{margin-right:0}.meli-selection-tools [data-results-count]{margin-right:auto;color:#171717}.meli-hidden-selected{color:#595959;font-size:10.5px;font-weight:650}.meli-listing-list{height:auto;min-height:0;max-height:none;flex:1;grid-auto-rows:max-content;overflow-x:hidden;overflow-y:scroll}.meli-listing-list:focus-visible,.meli-modal-body:focus-visible{outline:2px solid #525252;outline-offset:-3px}.meli-empty,.meli-load-more{grid-column:1/-1}.meli-empty{gap:10px}.meli-load-more{padding:12px;display:flex;align-items:center;justify-content:center;gap:12px;border:1px solid #d7d7d7;border-radius:10px;background:#fff;color:#595959;font-size:11px;font-weight:650}
        .meli-analysis-gate{min-height:0;flex:1;display:grid;place-items:center;padding:36px;border:1px solid #d6d6d6;border-radius:14px;background:#fff;text-align:center;box-shadow:0 14px 34px rgba(0,0,0,.06)}.meli-analysis-gate-inner{width:min(100%,520px);display:grid;justify-items:center}.meli-analysis-gate-icon{width:58px;height:58px;display:grid;place-items:center;border:1px solid #d6d6d6;border-radius:18px;background:#f1f1f1;color:#303030}.meli-analysis-gate-icon .meli-svg{width:25px;height:25px}.meli-analysis-gate h3{margin:20px 0 0;color:#171717;font-size:24px;font-weight:780;letter-spacing:-.025em;line-height:1.18}.meli-analysis-gate p{margin:9px 0 0;color:#595959;font-size:13px;line-height:1.55}.meli-analysis-gate .meli-btn{min-width:180px;margin-top:20px}.meli-analysis-gate-shortcut{margin-top:11px;color:#595959;font-size:11px;font-weight:680}.meli-analysis-gate-progress{width:min(100%,360px);margin-top:17px}.meli-analysis-gate-progress .meli-collection-track{margin-top:0}.meli-analysis-gate-progress span{display:block;margin-top:7px;color:#595959;font-size:10.5px;font-weight:650}
        .meli-main,.meli-analysis-card,.meli-listing-list,.meli-modal-body,.meli-filter-drawer{scrollbar-gutter:stable;scrollbar-width:auto;scrollbar-color:#555 #e3e3e3}.meli-main::-webkit-scrollbar,.meli-analysis-card::-webkit-scrollbar,.meli-listing-list::-webkit-scrollbar,.meli-modal-body::-webkit-scrollbar,.meli-filter-drawer::-webkit-scrollbar{width:12px;height:12px}.meli-main::-webkit-scrollbar-track,.meli-analysis-card::-webkit-scrollbar-track,.meli-listing-list::-webkit-scrollbar-track,.meli-modal-body::-webkit-scrollbar-track,.meli-filter-drawer::-webkit-scrollbar-track{border-left:1px solid #cfcfcf;background:#e3e3e3}.meli-main::-webkit-scrollbar-thumb,.meli-analysis-card::-webkit-scrollbar-thumb,.meli-listing-list::-webkit-scrollbar-thumb,.meli-modal-body::-webkit-scrollbar-thumb,.meli-filter-drawer::-webkit-scrollbar-thumb{min-height:52px;border:2px solid #e3e3e3;border-radius:999px;background:#555}.meli-main::-webkit-scrollbar-thumb:hover,.meli-analysis-card::-webkit-scrollbar-thumb:hover,.meli-listing-list::-webkit-scrollbar-thumb:hover,.meli-modal-body::-webkit-scrollbar-thumb:hover,.meli-filter-drawer::-webkit-scrollbar-thumb:hover{background:#202020}.meli-modal-body{min-height:0;overscroll-behavior:contain}
        @media(max-width:900px){.meli-analysis-controls{grid-template-columns:minmax(180px,1fr) auto}.meli-sort-control{grid-column:1/-1}.meli-filter-drawer{grid-template-columns:repeat(2,minmax(130px,1fr))}}
        @media(max-width:760px),(max-height:620px){.meli-analysis-card{overflow-y:auto}.meli-analysis-card .meli-listing-list,.meli-panel.is-wide .meli-analysis-card .meli-listing-list{height:max-content;min-height:160px;max-height:none;flex:0 0 auto;overflow:visible}.meli-analysis-card .meli-bulk-bar{position:sticky;bottom:0;z-index:2}}
        @media(max-width:760px){.meli-analysis-controls{grid-template-columns:1fr}.meli-filter-toggle,.meli-sort-control{grid-column:auto;width:100%}}
        @media(max-width:520px){.meli-filter-drawer{grid-template-columns:1fr;max-height:260px}.meli-selection-tools{align-items:flex-start;flex-direction:column}.meli-selection-tools [data-results-count]{margin-right:0}.meli-shortcut-hint{width:100%}.meli-analysis-card .meli-bulk-bar{align-items:flex-start;flex-direction:column}.meli-analysis-gate{padding:24px 18px}.meli-analysis-gate h3{font-size:21px}}
        .meli-update-banner,.meli-storage-banner{margin-bottom:12px;padding:11px 12px;display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #a3a3a3;border-radius:10px;background:#fff}.meli-storage-banner{border-left:4px solid #525252}.meli-update-banner div,.meli-storage-banner div{min-width:0}.meli-update-banner strong,.meli-storage-banner strong{display:block;font-size:12px}.meli-update-banner span,.meli-storage-banner span{display:block;margin-top:3px;color:#595959;font-size:10.5px}.meli-update-actions{display:flex;align-items:center;gap:7px;flex:0 0 auto}
        .meli-import-zone{padding:14px;border:1px dashed #a3a3a3;border-radius:10px;background:#fff}.meli-import-zone input[type="file"]{width:100%;margin-top:10px}.meli-backup-preview{margin-top:12px;padding:12px;border:1px solid #a3a3a3;border-radius:9px;background:#fff}.meli-backup-preview[hidden]{display:none}.meli-calibration{margin-bottom:12px;padding:12px;border:1px solid #cfcfcf;border-radius:9px;background:#fff}.meli-calibration h3{margin:0;font-size:12px}.meli-calibration p{margin:5px 0 0;color:#595959;font-size:10.5px}.meli-threshold-impact{margin-top:10px;padding:9px 10px;border:1px solid #d8d8d8;border-radius:8px;background:#f5f5f5;color:#303030;font-size:10.5px}.meli-conflict-warning,.meli-queue-recovery{padding:12px;border:1px solid #a3a3a3;border-left:4px solid #b42318;border-radius:9px;background:#fff}.meli-conflict-warning strong,.meli-queue-recovery strong{display:block;font-size:12px}.meli-conflict-warning p,.meli-queue-recovery p{margin:5px 0 0;color:#404040;font-size:11px}.meli-feedback-form{display:grid;gap:12px}.meli-feedback-form .meli-note{margin:0}
        .meli-preset-zone{grid-column:1/-1;display:grid;gap:8px}.meli-preset-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.meli-preset-head>span{color:#595959;font-size:9.5px;font-weight:760;letter-spacing:.045em;text-transform:uppercase}.meli-preset-list{display:flex;align-items:center;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:thin}.meli-preset-wrap{position:relative;display:inline-flex;align-items:center;flex:0 0 auto}.meli-preset-wrap .meli-preset-chip{padding-right:28px}.meli-preset-chip{min-height:30px;padding:0 9px;display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;border:1px solid #d0d0d0;border-radius:999px;background:#fff;color:#303030;font:700 10.5px/1 Inter,system-ui,sans-serif;cursor:pointer}.meli-preset-chip:hover,.meli-preset-chip.is-active{border-color:#202020;background:#202020;color:#fff}.meli-preset-chip b{font-size:9px;opacity:.72}.meli-preset-chip-delete{position:absolute;right:5px;width:18px;height:18px;padding:0;border:0;border-radius:50%;display:grid;place-items:center;background:transparent;color:#737373;cursor:pointer}.meli-preset-wrap:has(.meli-preset-chip.is-active) .meli-preset-chip-delete{color:#fff}.meli-preset-editor{display:grid;grid-template-columns:minmax(150px,1fr) auto;gap:7px}.meli-preset-editor .meli-input{height:36px}.meli-preset-editor .meli-btn{height:36px}
        .meli-chart-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.meli-chart{min-width:0;padding:10px;border:1px solid #dedede;border-radius:9px;background:#fafafa}.meli-chart-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}.meli-chart-head b{font-size:11px}.meli-chart-head span{color:#595959;font-size:9.5px}.meli-chart svg{width:100%;height:auto;margin-top:6px;display:block;overflow:visible}.meli-chart-gridline{stroke:#dedede;stroke-width:1}.meli-chart-line{fill:none;stroke:#303030;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.meli-chart-line[data-quality="limited"]{stroke-dasharray:5 3}.meli-chart[data-tone="up"] .meli-chart-line,.meli-chart[data-tone="up"] .meli-chart-point:last-of-type{stroke:#1f7a4d;fill:#1f7a4d}.meli-chart[data-tone="down"] .meli-chart-line,.meli-chart[data-tone="down"] .meli-chart-point:last-of-type{stroke:#b42318;fill:#b42318}.meli-chart-point{fill:#fff;stroke:#525252;stroke-width:1.5}.meli-chart-point[data-quality="approximate"]{stroke-dasharray:2 1}.meli-chart-point[data-quality="legacy"]{fill:#fff4cc;stroke:#8a5a00}.meli-chart-quality{display:block;margin-top:5px;color:#737373;font-size:9.5px}.meli-chart-empty{min-height:92px;display:grid;place-items:center;color:#737373;font-size:10.5px;text-align:center}
        .meli-experiment-timeline{position:relative;display:grid;gap:0}.meli-experiment-event{position:relative;padding:0 0 16px 24px}.meli-experiment-event:last-child{padding-bottom:0}.meli-experiment-event:before{content:"";position:absolute;left:6px;top:7px;bottom:-7px;width:1px;background:#cfcfcf}.meli-experiment-event:last-child:before{display:none}.meli-experiment-dot{position:absolute;left:1px;top:3px;width:11px;height:11px;border:2px solid #737373;border-radius:50%;background:#fff}.meli-experiment-event[data-type="winner"] .meli-experiment-dot{border-color:#1f7a4d;background:#1f7a4d}.meli-experiment-event[data-type="underperformed"] .meli-experiment-dot{border-color:#b42318;background:#b42318}.meli-experiment-event[data-type="observing"] .meli-experiment-dot{border-color:#7c3aed}.meli-experiment-event strong{display:block;font-size:11.5px}.meli-experiment-event time,.meli-experiment-event span{display:block;margin-top:2px;color:#595959;font-size:10.5px}
        .meli-ai-comparisons{display:grid;gap:10px}.meli-diff-card{overflow:hidden;border:1px solid #d6d6d6;border-radius:10px;background:#fff}.meli-diff-head{padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid #e3e3e3}.meli-diff-head div{min-width:0}.meli-diff-head strong{display:block;overflow:hidden;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.meli-diff-head span{color:#595959;font-size:9.5px}.meli-diff-fields{display:grid}.meli-diff-field{padding:10px 12px;border-top:1px solid #ededed}.meli-diff-field:first-child{border-top:0}.meli-diff-field>strong{display:block;margin-bottom:7px;font-size:10px;text-transform:uppercase}.meli-diff-columns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.meli-diff-value{min-width:0;padding:8px;border:1px solid #dedede;border-radius:7px;background:#f7f7f7}.meli-diff-value b{display:block;margin-bottom:4px;color:#595959;font-size:9px;text-transform:uppercase}.meli-diff-value pre{max-height:100px;margin:0;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;color:#202020;font:10.5px/1.42 ui-monospace,SFMono-Regular,Consolas,monospace}.meli-diff-value.is-proposed{border-color:#a3a3a3;background:#fff}
        .meli-report-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.meli-report-grid div{padding:9px;border:1px solid #dedede;border-radius:8px;background:#fff}.meli-report-grid span{display:block;color:#595959;font-size:9.5px;text-transform:uppercase}.meli-report-grid b{display:block;margin-top:4px;font-size:12px;overflow-wrap:anywhere}.meli-report-json{max-height:260px;margin:10px 0 0;padding:10px;overflow:auto;border:1px solid #dedede;border-radius:8px;background:#171717;color:#f5f5f5;white-space:pre-wrap;overflow-wrap:anywhere;font:10px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}
        .meli-research-card-summary{margin-top:6px;padding-top:6px;border-top:1px solid #e6e6e6}.meli-research-card-summary b{overflow:hidden;color:#202020;font-size:10.5px;text-overflow:ellipsis;white-space:nowrap}.meli-research-card-summary span{display:block;margin-top:2px;color:#595959;font-size:9.5px}.meli-research-evidence{padding:13px;border:1px solid #d6d6d6;border-radius:10px;background:#fff}.meli-research-evidence h3{margin:0 0 10px;font-size:13px}.meli-research-evidence>div{display:grid;gap:7px}.meli-research-evidence-row{padding:9px;display:grid;grid-template-columns:minmax(120px,1.25fr) repeat(3,minmax(90px,1fr));gap:8px;border:1px solid #e3e3e3;border-radius:8px;background:#fafafa}.meli-research-evidence-row>strong{overflow-wrap:anywhere;font-size:11.5px}.meli-research-evidence-row span{color:#595959;font-size:9px}.meli-research-evidence-row span b{display:block;margin-top:3px;color:#202020;font-size:10.5px}.meli-research-evidence p,.meli-research-evidence time{display:block;margin:10px 0 0;color:#595959;font-size:10px;line-height:1.45}.meli-research-transfer{display:grid;gap:12px}.meli-research-json{min-height:180px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10.5px}.meli-install-url{display:block;margin-top:12px;padding:9px;overflow-wrap:anywhere;border:1px solid #dedede;border-radius:7px;background:#f5f5f5;color:#303030;font-size:9.5px}.meli-status[data-research-transfer-status][data-tone="error"]{border-color:#fecaca;background:#fff7f7}.meli-status[data-research-transfer-status][data-tone="ready"]{border-color:#bbf7d0;background:#f7fff9}
        @media(max-width:620px){.meli-chart-grid{grid-template-columns:1fr}.meli-diff-columns{grid-template-columns:1fr}.meli-report-grid{grid-template-columns:1fr}.meli-research-evidence-row{grid-template-columns:1fr 1fr}.meli-update-banner,.meli-storage-banner{align-items:flex-start;flex-direction:column}.meli-update-actions{width:100%}.meli-update-actions .meli-btn{flex:1}}
        @media(prefers-reduced-motion:reduce){.meli-panel,.meli-view,.meli-toast{animation:none;transition:none}.meli-toast{transform:none}}
    `;

    function logoMarkup(className = 'meli-brand-logo') {
        return `<img class="${escapeHtml(className)}" src="${MAKAYTRON_LOGO_URL}" alt="Makaytron">`;
    }

    function logoLinkMarkup(className = 'meli-logo') {
        return `<a class="${escapeHtml(className)} meli-logo-link" href="https://makaytron.com/" target="_blank" rel="noopener noreferrer" aria-label="Makaytron.com">${logoMarkup()}</a>`;
    }

    function iconSvg(name) {
        const paths = {
            overview: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
            analysis: '<path d="M4 19V9m6 10V5m6 14v-7m4 7H2"/>',
            ai: '<path d="m12 3 1.2 4.2L17 9l-3.8 1.8L12 15l-1.2-4.2L7 9l3.8-1.8L12 3Z"/><path d="m19 14 .7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14Z"/>',
            queue: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="m3 6 1 1 2-2m-3 7 1 1 2-2m-3 7 1 1 2-2"/>',
            settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
            wide: '<path d="M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5"/>',
            close: '<path d="m6 6 12 12M18 6 6 18"/>',
            activity: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
            history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5m4-1v5l3 2"/>',
            external: '<path d="M14 3h7v7m0-7-9 9"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
            spark: '<path d="m12 2 1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/>',
        };
        return `<svg class="meli-svg" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.activity}</svg>`;
    }

    function downloadJson(filename, value) {
        const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    async function copyText(text) {
        try { await navigator.clipboard.writeText(text); return true; }
        catch {
            const textarea = document.createElement('textarea'); textarea.value = text; textarea.style.position = 'fixed'; textarea.style.opacity = '0';
            document.body.appendChild(textarea); textarea.select(); const copied = document.execCommand('copy'); textarea.remove(); return copied;
        }
    }

    function sanitizeImportedUrl(value, kind = 'etsy') {
        const source = String(value || '');
        if (!source) return '';
        if (kind === 'image' && /^data:image\/(?:png|gif|jpeg|webp)[;,]/i.test(source)) return source.slice(0, 250000);
        try {
            const url = new URL(source);
            if (url.protocol !== 'https:' || url.port || url.username || url.password) return '';
            if (kind === 'etsy' && url.hostname.toLowerCase() !== 'www.etsy.com') return '';
            if (kind === 'image' && !/(^|\.)etsystatic\.com$/i.test(url.hostname)) return '';
            return url.href.slice(0, 2000);
        } catch { return ''; }
    }

    function sanitizeImportedPublicListingUrl(value, listingId) {
        const sanitized = sanitizeImportedUrl(value, 'etsy');
        if (!sanitized) return '';
        try {
            const url = new URL(sanitized);
            const match = url.pathname.match(/^\/listing\/(\d+)(?:\/|$)/);
            return match && match[1] === String(listingId) ? url.href.slice(0, 2000) : '';
        } catch { return ''; }
    }

    function normalizeBackupDocument(raw) {
        if (!raw || typeof raw !== 'object') throw new Error('backup root must be an object');
        if (String(raw.schema || '') !== 'makaytron-listing-analyzer-backup/v1') throw new Error('unsupported backup schema');
        if (serializedBytes(raw) > MAX_BACKUP_BYTES) throw new Error(t('backupTooLarge'));
        if (!Array.isArray(raw.records) || raw.records.length > MAX_BACKUP_RECORDS) throw new Error(`records must contain 0-${MAX_BACKUP_RECORDS} items`);
        const ids = new Set();
        const records = raw.records.map((item, index) => {
            const listingId = String(item?.listingId || '');
            if (!/^\d+$/.test(listingId) || ids.has(listingId)) throw new Error(`records[${index}].listingId is invalid or duplicated`);
            ids.add(listingId);
            const record = normalizeRecord(item, listingId);
            if (!record || record.unsupportedSchema) throw new Error(`records[${index}] uses an unsupported schema`);
            record.meta = {
                ...record.meta,
                editUrl: canonicalQueueEditUrl(listingId),
                publicUrl: sanitizeImportedPublicListingUrl(record.meta?.publicUrl, listingId),
                imageUrl: sanitizeImportedUrl(record.meta?.imageUrl, 'image'),
            };
            return record;
        });
        if (raw.settings !== undefined && (!raw.settings || typeof raw.settings !== 'object' || Array.isArray(raw.settings))) {
            throw new Error('settings must be an object when provided');
        }
        const settingsRaw = raw.settings || {};
        const settings = {};
        Object.keys(HEALTH_THRESHOLD_CONTRACTS).forEach((key) => {
            if (!Object.hasOwn(settingsRaw, key)) return;
            const value = settingsRaw[key];
            const contract = HEALTH_THRESHOLD_CONTRACTS[key];
            if (typeof value !== 'number' || !Number.isInteger(value) || value < contract.min || value > contract.max) throw new Error(`settings.${key} is invalid`);
            settings[key] = value;
        });
        for (const [key, min, max] of [['retentionDays', 30, APP.retentionDays], ['maxSnapshots', 10, APP.maxSnapshots]]) {
            if (!Object.hasOwn(settingsRaw, key)) continue;
            const value = settingsRaw[key];
            if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error(`settings.${key} is invalid`);
            settings[key] = value;
        }
        if (raw.analysisFilters !== undefined && (!raw.analysisFilters || typeof raw.analysisFilters !== 'object' || Array.isArray(raw.analysisFilters))) {
            throw new Error('analysisFilters must be an object when provided');
        }
        return {
            records,
            settings,
            analysisFilters: raw.analysisFilters === undefined ? null : normalizeAnalysisFilters(raw.analysisFilters),
            filterPresets: normalizeFilterPresets(raw.filterPresets),
            queueSkipped: Boolean(raw.queue),
        };
    }

    function mergeFilterPresetCollections(current, incoming, stats = null) {
        const merged = normalizeFilterPresets(current);
        let applied = 0;
        let skipped = 0;
        normalizeFilterPresets(incoming).forEach((preset) => {
            const idIndex = merged.findIndex((item) => item.id === preset.id);
            const nameIndex = merged.findIndex((item) => presetNameFold(item.name) === presetNameFold(preset.name));
            if (idIndex >= 0 && nameIndex >= 0 && idIndex !== nameIndex) { skipped += 1; return; }
            const index = idIndex >= 0 ? idIndex : nameIndex;
            if (index >= 0) {
                const existing = merged[index];
                if ((validTime(preset.updatedAt) || 0) > (validTime(existing.updatedAt) || 0)) {
                    merged[index] = { ...preset, id: existing.id, createdAt: existing.createdAt };
                    applied += 1;
                } else skipped += 1;
            } else if (merged.length < MAX_FILTER_PRESETS) { merged.push(preset); applied += 1; }
            else skipped += 1;
        });
        if (stats && typeof stats === 'object') Object.assign(stats, { applied, skipped });
        return normalizeFilterPresets(merged);
    }

    async function importBackupDocument(raw) {
        const backup = normalizeBackupDocument(raw);
        const result = await withNamedLock(STORAGE_MUTATION_LOCK, async () => {
            const actionLease = await GMX.get(KEYS.lease, null);
            const collectionLease = await GMX.get(KEYS.collectionLease, null);
            const storedQueue = normalizeQueue(await GMX.get(KEYS.queue, null));
            const storedCollection = normalizeCollection(await GMX.get(KEYS.collection, null));
            const busy = durableLeaseIsActive(actionLease) || durableLeaseIsActive(collectionLease)
                || storedQueueHasActiveItem(storedQueue) || storedCollection?.unsupportedSchema
                || ['starting', 'running'].includes(String(storedCollection?.status || ''));
            if (busy) {
                const error = new Error('Backup import is blocked while an action queue or collection is active.');
                error.code = 'IMPORT_BUSY';
                throw error;
            }
            const storedSettings = await GMX.get(KEYS.settings, {});
            const durableHealthSettings = healthSettingsSnapshot({ ...state.settings, ...(storedSettings && typeof storedSettings === 'object' ? storedSettings : {}) });
            const mergedHealthSettings = { ...durableHealthSettings, ...backup.settings };
            if (!validateThresholdSettings(mergedHealthSettings).valid) throw new Error('backup threshold settings are contradictory');
            const nextSettings = {
                ...state.settings,
                ...mergedHealthSettings,
                language: state.settings.language,
                collapsed: state.settings.collapsed,
            };
            const durableAnalysisFilters = normalizeAnalysisFilters(await GMX.get(KEYS.analysisFilters, DEFAULT_ANALYSIS_FILTERS));
            const durablePresetEnvelope = await GMX.get(KEYS.filterPresets, { schema: 1, items: [] });
            const nextAnalysisFilters = backup.analysisFilters || durableAnalysisFilters;
            const presetMergeStats = {};
            const nextFilterPresets = mergeFilterPresetCollections(
                normalizeFilterPresets(durablePresetEnvelope),
                backup.filterPresets,
                presetMergeStats,
            );
            const healthSettings = healthSettingsSnapshot(nextSettings);
            const durableIndex = await Store.getIndex();
            // Resolve every deterministic record conflict before the first write. This keeps
            // a malformed late record from leaving earlier records or the collection changed.
            for (const incoming of backup.records) {
                const listingId = String(incoming.listingId);
                const currentRaw = await GMX.get(KEYS.record(listingId), null);
                if (currentRaw && typeof currentRaw === 'object') {
                    const storedListingId = Object.hasOwn(currentRaw, 'listingId') ? String(currentRaw.listingId ?? '') : listingId;
                    if (storedListingId !== listingId) {
                        const error = new Error(`Listing record identity mismatch for ${listingId}.`);
                        error.code = 'RECORD_ID_MISMATCH';
                        throw error;
                    }
                }
                const current = currentRaw && typeof currentRaw === 'object' ? normalizeRecord(currentRaw, listingId) : null;
                if (current?.unsupportedSchema) throw new Error(`Listing record ${listingId} uses a newer schema.`);
                const candidate = mergeRecordCopies(current, incoming, nextSettings);
                if (!candidate || candidate.unsupportedSchema || String(candidate.listingId || '') !== listingId) {
                    const error = new Error(`Listing record identity mismatch for ${listingId}.`);
                    error.code = 'RECORD_ID_MISMATCH';
                    throw error;
                }
            }
            if (backup.records.length > 0 && storedCollection && ['paused', 'completed'].includes(String(storedCollection.status || ''))) {
                const invalidatedAt = nowIso();
                await Store.saveCollectionLocked({
                    ...storedCollection,
                    status: 'blocked',
                    stoppedAt: invalidatedAt,
                    updatedAt: invalidatedAt,
                    leaseToken: '',
                    handoffToken: '',
                    handoffPage: 0,
                    handoffExpiresAt: '',
                    retry: null,
                    error: {
                        key: 'collectionPageChanged',
                        reason: 'Imported listing data requires a new full collection.',
                        reportId: '',
                    },
                }, {
                    id: storedCollection.id,
                    token: storedCollection.leaseToken,
                    writeRevision: storedCollection.writeRevision,
                    manifestFingerprint: collectionManifestFingerprint(storedCollection),
                });
                state.selectedIds.clear();
            }
            const batchIndex = { items: [...durableIndex], dirty: false };
            for (const record of backup.records) await Store.putRecordLocked(record, batchIndex, { settings: nextSettings });
            if (batchIndex.dirty) await requireStored(KEYS.index, batchIndex.items);
            await requireStored(KEYS.settings, { ...(storedSettings && typeof storedSettings === 'object' ? storedSettings : {}), ...healthSettings });
            await requireStored(KEYS.analysisFilters, nextAnalysisFilters);
            await requireStored(KEYS.filterPresets, { schema: 1, items: nextFilterPresets });
            state.settings = nextSettings;
            state.analysisFilters = nextAnalysisFilters;
            state.filterPresets = nextFilterPresets;
            setCommittedPreference(KEYS.settings, healthSettings);
            setCommittedPreference(KEYS.analysisFilters, { filters: nextAnalysisFilters, query: state.analysisQuery, limit: state.analysisLimit });
            setCommittedPreference(KEYS.filterPresets, nextFilterPresets);
            await Store.appendAuditLocked({ type: 'backup-imported', records: backup.records.length, presets: presetMergeStats.applied, presetsSkipped: presetMergeStats.skipped, queueSkipped: backup.queueSkipped });
            return { records: backup.records.length, presets: presetMergeStats.applied, presetsSkipped: presetMergeStats.skipped, queueSkipped: backup.queueSkipped };
        });
        await refreshRecords({ render: false });
        refreshStorageEstimate();
        return result;
    }

    function feedbackDiagnostics() {
        const browser = /Edg\//.test(navigator.userAgent) ? 'Edge' : /Firefox\//.test(navigator.userAgent) ? 'Firefox' : /Chrome\//.test(navigator.userAgent) ? 'Chromium' : 'Other';
        return {
            appVersion: APP_VERSION,
            language: state.settings.language,
            browser,
            route: routeKind(),
            recordCount: state.records.length,
            collectionStatus: state.collection?.status || 'none',
            collectionPages: Object.keys(state.collection?.pages || {}).length,
        };
    }

    function feedbackMarkdown(entry) {
        const categories = { bug: 'Bug', idea: 'Idea', usability: 'Usability', analysis: 'Analysis' };
        const diagnostics = entry.diagnostics ? `\n\n### Technical summary\n\n\`\`\`json\n${JSON.stringify(entry.diagnostics, null, 2)}\n\`\`\`` : '';
        return `### Listing Analyzer feedback\n\n- Category: ${categories[entry.category] || 'Idea'}\n- Rating: ${entry.rating}/5\n- Version: ${APP_VERSION}\n\n### Note\n\n${entry.note}${diagnostics}\n\n_No listing titles, listing IDs, cookies, sessions, or page HTML are included._`;
    }

    async function saveUserFeedback(input) {
        const note = normalizeSpace(input?.note).slice(0, 800);
        if (note.length < 10) throw new Error(t('feedbackInvalid'));
        const entry = {
            id: randomId('feedback'), at: nowIso(),
            category: ['bug', 'idea', 'usability', 'analysis'].includes(input?.category) ? input.category : 'idea',
            rating: clamp(input?.rating, 1, 5), note,
            diagnostics: input?.includeDiagnostics ? feedbackDiagnostics() : null,
        };
        await Store.appendFeedback(entry);
        const markdown = feedbackMarkdown(entry);
        await copyText(markdown);
        const title = `[Listing Analyzer feedback] ${entry.category}`;
        const issueUrl = `https://github.com/Makaytron/Etsy-Automation-Tools/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(markdown)}`;
        window.open(issueUrl, '_blank', 'noopener,noreferrer');
        return entry;
    }

    function validateThresholdSettings(values) {
        const fields = ['minVisitsToImprove', 'minVisitsToProtect', 'minRenewalsToReview', 'declinePercent'];
        const invalid = fields.find((key) => !Number.isInteger(values?.[key])
            || values[key] < HEALTH_THRESHOLD_CONTRACTS[key].min
            || values[key] > HEALTH_THRESHOLD_CONTRACTS[key].max);
        if (invalid) return { valid: false, reason: 'range', field: invalid, ...HEALTH_THRESHOLD_CONTRACTS[invalid] };
        if (values.minVisitsToProtect <= values.minVisitsToImprove) return { valid: false, reason: 'relationship', field: 'minVisitsToProtect' };
        return { valid: true, reason: '', field: '' };
    }


    async function persistThresholdSettings(values) {
        const fields = ['minVisitsToImprove', 'minVisitsToProtect', 'minRenewalsToReview', 'declinePercent'];
        const previous = healthSettingsSnapshot(state.settings);
        const revision = beginPreferenceMutation('healthSettings');
        const normalized = normalizeHealthThresholds(values);
        fields.forEach((key) => { state.settings[key] = normalized[key]; });
        let saved = false;
        try { saved = await Store.saveHealthSettings(); } catch { saved = false; }
        const current = preferenceMutationIsCurrent('healthSettings', revision);
        if (!saved && current) {
            applySettingsFields(state.settings, committedPreference(KEYS.settings, previous), HEALTH_SETTING_FIELDS);
        }
        return saved && current;
    }

    function capturePanelFocus() {
        const active = state.shadow?.activeElement;
        if (!(active instanceof HTMLElement) || !state.panel?.contains(active)) return null;
        const dataAttribute = Array.from(active.attributes || []).find((attribute) => attribute.name.startsWith('data-') && attribute.name !== 'data-base-label');
        let selector = '';
        if (dataAttribute) selector = dataAttribute.value
            ? `[${dataAttribute.name}="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(dataAttribute.value) : dataAttribute.value}"]`
            : `[${dataAttribute.name}]`;
        else if (active.id) selector = `#${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(active.id) : active.id}`;
        const candidates = selector ? Array.from(state.panel.querySelectorAll(selector)) : [];
        const selectionStart = typeof active.selectionStart === 'number' ? active.selectionStart : null;
        const selectionEnd = typeof active.selectionEnd === 'number' ? active.selectionEnd : null;
        return { selector, index: Math.max(0, candidates.indexOf(active)), selectionStart, selectionEnd };
    }

    function restorePanelFocus(snapshot) {
        if (!snapshot?.selector || state.settings.collapsed || !state.panel) return;
        const candidates = Array.from(state.panel.querySelectorAll(snapshot.selector));
        const target = candidates[snapshot.index] || candidates[0];
        if (!(target instanceof HTMLElement)) return;
        target.focus();
        if (snapshot.selectionStart !== null && typeof target.setSelectionRange === 'function') {
            try { target.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd); } catch { /* not a text control */ }
        }
    }

    const UI = {
        async mount() {
            if (state.host?.isConnected) return;
            state.host = document.createElement('div');
            state.host.id = 'makaytron-etsy-listing-analyzer';
            state.host.setAttribute('lang', state.settings.language);
            state.shadow = state.host.attachShadow({ mode: 'open' });
            state.shadow.innerHTML = `<style>${STYLES}</style><button class="meli-launcher" type="button" aria-label="${escapeHtml(t('launcher'))}">${logoMarkup('meli-launcher-logo')}<span class="meli-badge" data-launch-badge hidden>0</span></button><section class="meli-panel" role="complementary" aria-label="${escapeHtml(t('panelAria'))}"></section><div class="meli-toast-root" data-toast-root aria-live="polite" aria-atomic="true"></div>`;
            document.documentElement.appendChild(state.host);
            state.launcher = state.shadow.querySelector('.meli-launcher');
            state.panel = state.shadow.querySelector('.meli-panel');
            state.launcher.addEventListener('click', () => { void this.setCollapsed(false); });
            this.render(true);
        },
        setStatus(key, tone = 'ready', params = {}) {
            state.status = { key, tone, params };
            this.renderStatus();
            const successKeys = new Set(['scanComplete', 'collectionComplete', 'proposalSaved', 'queueCreated', 'formApplied', 'publishVerified', 'deactivateVerified', 'queueComplete', 'aiCopied', 'aiImportSuccess', 'exportComplete', 'settingsSaved', 'dataCleared']);
            if (tone === 'error' || tone === 'blocked') this.toast(t(key, params), tone === 'error' ? 'error' : 'warning');
            else if (successKeys.has(key)) this.toast(t(key, params), 'success');
        },
        renderStatus() {
            const element = state.shadow?.querySelector('.meli-status');
            if (!element) return;
            element.dataset.tone = state.status.tone;
            element.querySelector('strong').textContent = t({ error: 'error', blocked: 'blocked', scanning: 'scanning' }[state.status.tone] || 'ready');
            element.querySelector('span').textContent = t(state.status.key, state.status.params);
        },
        async setCollapsed(collapsed) {
            const previous = uiSettingsSnapshot(state.settings);
            const candidate = Boolean(collapsed);
            const revisionKey = 'uiPreferences:collapsed';
            const revision = beginPreferenceMutation(revisionKey);
            state.settings.collapsed = candidate;
            let saved = false;
            try { saved = await Store.saveUiPreferences(['collapsed']); } catch { saved = false; }
            if (!saved && preferenceMutationIsCurrent(revisionKey, revision)) {
                applySettingsFields(state.settings, committedPreference(KEYS.uiPreferences, previous), ['collapsed']);
            }
            this.renderVisibility();
            if (!saved && preferenceMutationIsCurrent(revisionKey, revision)) this.toast(t('storageWriteFailed'), 'error');
            const focusTarget = state.settings.collapsed
                ? state.launcher
                : state.panel?.querySelector(`[data-view="${state.activeView}"]`) || state.panel?.querySelector('[data-collapse]');
            if (focusTarget instanceof HTMLElement) focusTarget.focus();
            registerMenus();
            return saved;
        },
        async toggleLanguage() {
            const previous = uiSettingsSnapshot(state.settings);
            const candidate = previous.language === 'tr' ? 'en' : 'tr';
            const revisionKey = 'uiPreferences:language';
            const revision = beginPreferenceMutation(revisionKey);
            state.settings.language = candidate;
            let saved = false;
            try { saved = await Store.saveUiPreferences(['language']); } catch { saved = false; }
            if (!saved && preferenceMutationIsCurrent(revisionKey, revision)) {
                applySettingsFields(state.settings, committedPreference(KEYS.uiPreferences, previous), ['language']);
            }
            this.render(true);
            registerMenus();
            registerTelemetryMenuCommand(true);
            if (!saved && preferenceMutationIsCurrent(revisionKey, revision)) this.toast(t('storageWriteFailed'), 'error');
            return saved;
        },
        renderVisibility() {
            if (!state.panel || !state.launcher) return;
            state.panel.hidden = Boolean(state.settings.collapsed);
            state.launcher.hidden = !state.settings.collapsed;
            if (!state.settings.collapsed) telemetryPanelOpened();
        },
        summary() {
            const counts = { growing: 0, improve: 0, deactivateReview: 0, protected: 0, declining: 0, healthy: 0, needsReview: 0, experiments: 0 };
            const scopedRecords = analysisCollectionIsFresh() ? collectedAnalysisRecords() : [];
            scopedRecords.forEach((record) => {
                const code = record.analysis?.code;
                if (code in counts) counts[code] += 1;
                if (['protected', 'monitor', 'growing'].includes(code) && !['DATA_GAP', 'INACTIVE'].includes(record.analysis?.lifecycle)) counts.healthy += 1;
                if (['improve', 'declining', 'deactivateReview'].includes(code)) counts.needsReview += 1;
                if (record.analysis?.lifecycle === 'EXPERIMENT_RUNNING') counts.experiments += 1;
            });
            return counts;
        },
        render(force = false) {
            if (!state.panel) return;
            const focusSnapshot = capturePanelFocus();
            const views = new Set(['overview', 'analysis', 'ai', 'queue', 'settings']);
            if (!views.has(state.activeView)) state.activeView = 'overview';
            state.host?.setAttribute('lang', state.settings.language);
            state.panel.setAttribute('lang', state.settings.language);
            state.panel.setAttribute('aria-label', t('panelAria'));
            state.panel.classList.toggle('is-wide', Boolean(state.wide));
            state.panel.innerHTML = `
                <header class="meli-head">
                    ${logoLinkMarkup()}
                    <div class="meli-brand"><div class="meli-title">${escapeHtml(t('product'))}</div><div class="meli-subtitle">Makaytron · ${state.settings.language === 'tr' ? 'Listing analizi · Yerel veri' : 'Listing analysis · Local data'}</div></div>
                    <span class="meli-version" data-app-version>v${escapeHtml(APP_VERSION)}</span>
                    <div class="meli-head-actions">
                        <button class="meli-lang" data-language type="button" title="${escapeHtml(t('switchLanguage'))}" aria-label="${escapeHtml(t('switchLanguage'))}">${state.settings.language.toUpperCase()}</button>
                        <button class="meli-icon" data-wide type="button" title="${escapeHtml(t(state.wide ? 'compactView' : 'wideView'))}" aria-label="${escapeHtml(t(state.wide ? 'compactView' : 'wideView'))}">${iconSvg('wide')}</button>
                        <button class="meli-icon" data-collapse type="button" title="${escapeHtml(t('collapse'))}" aria-label="${escapeHtml(t('collapse'))}">${iconSvg('close')}</button>
                    </div>
                </header>
                ${this.navigation()}
                <main class="meli-main" data-view-panel="${escapeHtml(state.activeView)}">${this.renderView()}</main>
            `;
            this.bindPanel();
            this.renderVisibility();
            this.updateBadge();
            restorePanelFocus(focusSnapshot);
        },
        navigation() {
            const items = [
                ['overview', 'overview', 'overview', ''],
                ['analysis', 'analysisTitle', 'analysis', 'analysis'],
                ['ai', 'aiExchange', 'ai', 'ai'],
                ['queue', 'queueTitle', 'queue', ''],
                ['settings', 'settingsTitle', 'settings', 'settings'],
            ];
            return `<nav class="meli-nav" aria-label="${escapeHtml(t('panelAria'))}">${items.map(([view, label, icon, action]) => `<button class="meli-nav-btn ${state.activeView === view ? 'is-active' : ''}" data-view="${view}" ${action ? `data-action="${action}"` : ''} type="button" title="${escapeHtml(t(label))}" ${state.activeView === view ? 'aria-current="page"' : ''}>${iconSvg(icon)}<span class="meli-nav-label">${escapeHtml(t(label))}</span></button>`).join('')}</nav>`;
        },
        renderView() {
            if (state.activeView === 'analysis') return this.analysisView();
            if (state.activeView === 'ai') return this.aiView();
            if (state.activeView === 'queue') return this.queueView();
            if (state.activeView === 'settings') return this.settingsView();
            return this.overviewView();
        },
        viewHeader(title, copy = '') {
            return `<div class="meli-view-head"><div><h2 class="meli-view-title">${escapeHtml(title)}</h2>${copy ? `<p class="meli-view-copy">${escapeHtml(copy)}</p>` : ''}</div></div>`;
        },
        statusCard() {
            const toneKey = { error: 'error', blocked: 'blocked', scanning: 'scanning' }[state.status.tone] || 'ready';
            return `<div class="meli-status" data-tone="${escapeHtml(state.status.tone)}"><div class="meli-status-mark">${iconSvg('activity')}</div><div><strong>${escapeHtml(t(toneKey))}</strong><span>${escapeHtml(t(state.status.key, state.status.params))}</span></div></div>`;
        },
        updateBanner() {
            if (state.updateState.status !== 'available') return '';
            return `<div class="meli-update-banner" data-update-banner><div><strong>${escapeHtml(t('updateAvailable', { version: state.updateState.latestVersion }))}</strong><span>${escapeHtml(t('updateInstallHelp'))}</span></div><div class="meli-update-actions"><button class="meli-btn primary" data-install-update type="button">${escapeHtml(t('installUpdate'))}</button></div></div>`;
        },
        storageBanner() {
            refreshStorageEstimate();
            if (!state.storageHealth.warning) return '';
            const size = (state.storageHealth.estimateBytes / (1024 * 1024)).toFixed(1);
            return `<div class="meli-storage-banner" data-storage-warning role="status"><div><strong>${escapeHtml(t('storageUsage'))}: ${escapeHtml(t('storageUsageValue', { size }))}</strong><span>${escapeHtml(t('storageQuotaWarning'))}</span></div><div class="meli-update-actions"><button class="meli-btn" data-action="export" type="button">${escapeHtml(t('exportData'))}</button><button class="meli-btn" data-import-backup type="button">${escapeHtml(t('importBackup'))}</button></div></div>`;
        },
        collectionCard() {
            const job = state.collection;
            const pages = Collection.pageCount();
            const total = job?.totalPages || ListingPageAdapter.pageInfo().total || 1;
            const count = job?.uniqueIds?.length || 0;
            const progress = job ? clamp((pages / Math.max(1, total)) * 100, 0, 100) : 0;
            const status = job?.status === 'completed' ? t('saved') : job?.status === 'running' ? t('scanning') : job?.status === 'paused' || job?.status === 'blocked' ? t('blocked') : t('ready');
            const hasReport = job?.status === 'blocked' && job.failureReports?.length;
            return `<article class="meli-collection-card" data-collection-status="${escapeHtml(job?.status || 'idle')}"><div class="meli-collection-head"><div><span>${escapeHtml(t('collectionStatus'))}</span><strong>${escapeHtml(status)}</strong></div><b>${formatNumber(Math.round(progress))}%</b></div><div class="meli-collection-track" role="progressbar" aria-label="${escapeHtml(t('collectionStatus'))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}"><i style="width:${progress}%"></i></div><div class="meli-collection-meta"><span>${escapeHtml(t('collectionPages'))}<b>${formatNumber(pages)} / ${formatNumber(total)}</b></span><span>${escapeHtml(t('collectionListings'))}<b>${formatNumber(count)}</b></span></div>${hasReport ? `<div class="meli-actions"><button class="meli-btn" data-error-report type="button">${escapeHtml(t('errorReport'))}</button></div>` : ''}</article>`;
        },
        overviewView() {
            const counts = this.summary();
            const page = routeKind();
            const locallyRunning = state.collection?.status === 'running' && Boolean(state.collectionLoop && state.collectionLeaseToken);
            const collectionLabel = locallyRunning ? 'stopCollection' : ['running', 'paused'].includes(state.collection?.status) ? 'resumeCollection' : 'scanAllPages';
            return `<section class="meli-view">${this.viewHeader(t('overview'), t('manualApproval'))}${this.updateBanner()}${this.storageBanner()}${this.statusCard()}
                <div class="meli-grid">
                    <div class="meli-stat"><span>${escapeHtml(t('listings'))}</span><strong>${formatNumber(state.records.length)}</strong></div>
                    <div class="meli-stat"><span>${escapeHtml(t('pageListings'))}</span><strong>${formatNumber(state.pageListings.length)}</strong></div>
                    <div class="meli-stat"><span>${escapeHtml(t('healthy'))}</span><strong>${formatNumber(counts.healthy)}</strong></div>
                    <div class="meli-stat" data-tone="warning"><span>${escapeHtml(t('needsReview'))}</span><strong>${formatNumber(counts.needsReview)}</strong></div>
                    <div class="meli-stat"><span>${escapeHtml(t('activeExperiments'))}</span><strong>${formatNumber(counts.experiments)}</strong></div>
                    <div class="meli-stat" data-tone="danger"><span>${escapeHtml(t('deactivateReview'))}</span><strong>${formatNumber(counts.deactivateReview)}</strong></div>
                </div>
                ${page === 'listings' ? this.collectionCard() : ''}
                <article class="meli-card" style="margin-top:12px"><div class="meli-card-head"><strong>${escapeHtml(t('actions'))}</strong></div><div class="meli-card-body"><div class="meli-actions" style="margin-top:0">
                    ${page === 'listings' ? `<button class="meli-btn primary" data-action="scan-all" type="button" title="${escapeHtml(t('collectionShortcut'))}">${escapeHtml(t(collectionLabel))}</button><button class="meli-btn" data-action="scan" type="button">${escapeHtml(t('scanPage'))}</button><span class="meli-shortcut-hint">${escapeHtml(t('collectionShortcut'))}</span>` : ''}
                    <button class="meli-btn" data-overview-action="analysis" type="button">${escapeHtml(t('openAnalysis'))}</button>
                    <button class="meli-btn" data-overview-action="ai" type="button">${escapeHtml(t('aiExchange'))}</button>
                    <button class="meli-btn" data-action="export" type="button">${escapeHtml(t('exportData'))}</button>
                    <button class="meli-btn" data-import-backup type="button">${escapeHtml(t('importBackup'))}</button><input data-backup-file type="file" accept="application/json,.json" hidden>
                    <button class="meli-btn" data-feedback type="button">${escapeHtml(t('userFeedback'))}</button>
                    <button class="meli-btn" data-overview-action="settings" type="button">${escapeHtml(t('openSettings'))}</button>
                </div></div></article>
                <article class="meli-card">${this.queueCard()}</article>
                <p class="meli-note">${escapeHtml(t('manualApproval'))}</p>
            </section>`;
        },
        analysisView() {
            const fresh = analysisCollectionIsFresh();
            state.renderedAnalysisFresh = fresh;
            scheduleAnalysisFreshnessExpiry();
            if (!fresh) return this.analysisGateView();
            const analysisRecords = collectedAnalysisRecords();
            const filters = normalizeAnalysisFilters(state.analysisFilters);
            const selected = (value, current) => value === current ? ' selected' : '';
            const lifecycleOptions = ['DATA_GAP','BASELINE','LEARNING','ACTIVE_STABLE','ACTIVE_GROWING','ACTIVE_DECLINING','PROTECTED','EXPERIMENT_RUNNING','DORMANT','DEACTIVATION_REVIEW','INACTIVE'];
            const diagnosisOptions = ['DISCOVERY_WEAK','ENGAGEMENT_WEAK','PURCHASE_FRICTION','SCALE_DISCOVERY','HEALTHY_OR_MIXED','INSUFFICIENT_SIGNAL'];
            const recommendationOptions = ['improve','declining','deactivateReview','protected','monitor','waiting','growing'];
            const filterCount = analysisFilterCount(filters) + (normalizeSpace(state.analysisQuery) ? 1 : 0);
            const builtinPresets = BUILTIN_FILTER_PRESETS.map((preset) => `<button class="meli-preset-chip ${analysisPresetIsActive(preset) ? 'is-active' : ''}" data-apply-builtin-preset="${escapeHtml(preset.id)}" type="button"><span>${escapeHtml(t(preset.labelKey))}</span><b>${formatNumber(presetResultCount(preset, analysisRecords))}</b></button>`).join('');
            const customPresets = state.filterPresets.map((preset) => `<span class="meli-preset-wrap"><button class="meli-preset-chip ${analysisPresetIsActive(preset) ? 'is-active' : ''}" data-apply-custom-preset="${escapeHtml(preset.id)}" type="button"><span>${escapeHtml(preset.name)}</span><b>${formatNumber(presetResultCount(preset, analysisRecords))}</b></button><button class="meli-preset-chip-delete" data-delete-preset="${escapeHtml(preset.id)}" type="button" title="${escapeHtml(t('deletePreset'))}" aria-label="${escapeHtml(`${t('deletePreset')}: ${preset.name}`)}">×</button></span>`).join('');
            return `<section class="meli-view">${this.viewHeader(t('analysisTitle'), t('selected', { count: state.selectedIds.size }))}
                <div class="meli-analysis-card">
                    <div class="meli-analysis-controls">
                        <div class="meli-preset-zone"><div class="meli-preset-head"><span>${escapeHtml(t('filterPresets'))}</span></div><div class="meli-preset-list">${builtinPresets}${customPresets}</div><div class="meli-preset-editor"><input class="meli-input" data-preset-name maxlength="32" placeholder="${escapeHtml(t('presetName'))}"><button class="meli-btn" data-save-preset type="button">${escapeHtml(t('savePreset'))}</button></div></div>
                        <div class="meli-analysis-search">${iconSvg('analysis')}<input class="meli-input" data-table-search data-analysis-search type="search" value="${escapeHtml(state.analysisQuery)}" placeholder="${escapeHtml(t('search'))}"></div>
                        <button class="meli-filter-toggle" data-toggle-filters type="button" aria-expanded="${state.analysisFilterDrawerOpen ? 'true' : 'false'}">${iconSvg('settings')}<span>${escapeHtml(t('filters'))}</span><b data-filter-count>${formatNumber(filterCount)}</b></button>
                        <label class="meli-sort-control"><span>${escapeHtml(t('sortBy'))}</span><select class="meli-select" data-analysis-filter="sort"><option value="priority"${selected('priority', filters.sort)}>${escapeHtml(t('sortPriority'))}</option><option value="score"${selected('score', filters.sort)}>${escapeHtml(t('sortScore'))}</option><option value="visits"${selected('visits', filters.sort)}>${escapeHtml(t('sortVisits'))}</option><option value="sales"${selected('sales', filters.sort)}>${escapeHtml(t('sortSales'))}</option><option value="revenue"${selected('revenue', filters.sort)}>${escapeHtml(t('sortRevenue'))}</option><option value="confidence"${selected('confidence', filters.sort)}>${escapeHtml(t('sortConfidence'))}</option><option value="title"${selected('title', filters.sort)}>${escapeHtml(t('sortTitle'))}</option></select></label>
                        <div class="meli-filter-drawer" data-filter-drawer ${state.analysisFilterDrawerOpen ? '' : 'hidden'}>
                            <label><span>${escapeHtml(t('scope'))}</span><select class="meli-select" data-analysis-filter="scope"><option value="all"${selected('all', filters.scope)}>${escapeHtml(t('scopeAll'))}</option><option value="page"${selected('page', filters.scope)}>${escapeHtml(t('scopePage'))}</option></select></label>
                            <label><span>${escapeHtml(t('lifecycleFilter'))}</span><select class="meli-select" data-analysis-filter="lifecycle"><option value="">${escapeHtml(t('optionAll'))}</option>${lifecycleOptions.map((value) => `<option value="${value}"${selected(value, filters.lifecycle)}>${escapeHtml(lifecycleLabel(value))}</option>`).join('')}</select></label>
                            <label><span>${escapeHtml(t('diagnosisFilter'))}</span><select class="meli-select" data-analysis-filter="diagnosis"><option value="">${escapeHtml(t('optionAll'))}</option>${diagnosisOptions.map((value) => `<option value="${value}"${selected(value, filters.diagnosis)}>${escapeHtml(diagnosisLabel(value))}</option>`).join('')}</select></label>
                            <label><span>${escapeHtml(t('recommendationFilter'))}</span><select class="meli-select" data-analysis-filter="recommendation"><option value="">${escapeHtml(t('optionAll'))}</option>${recommendationOptions.map((value) => `<option value="${value}"${selected(value, filters.recommendation)}>${escapeHtml(analysisLabel(value))}</option>`).join('')}</select></label>
                            <label><span>${escapeHtml(t('performanceFilter'))}</span><select class="meli-select" data-analysis-filter="performance"><option value="">${escapeHtml(t('optionAll'))}</option><option value="sales"${selected('sales', filters.performance)}>${escapeHtml(t('performanceSales'))}</option><option value="traffic-no-sales"${selected('traffic-no-sales', filters.performance)}>${escapeHtml(t('performanceTrafficNoSales'))}</option><option value="no-activity"${selected('no-activity', filters.performance)}>${escapeHtml(t('performanceNoActivity'))}</option><option value="missing"${selected('missing', filters.performance)}>${escapeHtml(t('performanceMissing'))}</option></select></label>
                            <label><span>${escapeHtml(t('trendFilter'))}</span><select class="meli-select" data-analysis-filter="trend"><option value="">${escapeHtml(t('optionAll'))}</option><option value="rising"${selected('rising', filters.trend)}>${escapeHtml(t('trendRising'))}</option><option value="falling"${selected('falling', filters.trend)}>${escapeHtml(t('trendFalling'))}</option><option value="stable"${selected('stable', filters.trend)}>${escapeHtml(t('trendStable'))}</option><option value="unknown"${selected('unknown', filters.trend)}>${escapeHtml(t('trendUnknown'))}</option></select></label>
                            <label><span>${escapeHtml(t('stockFilter'))}</span><select class="meli-select" data-analysis-filter="stock"><option value="">${escapeHtml(t('optionAll'))}</option><option value="in"${selected('in', filters.stock)}>${escapeHtml(t('stockIn'))}</option><option value="out"${selected('out', filters.stock)}>${escapeHtml(t('stockOut'))}</option><option value="unknown"${selected('unknown', filters.stock)}>${escapeHtml(t('stockUnknown'))}</option></select></label>
                            <label><span>${escapeHtml(t('confidenceFilter'))}</span><select class="meli-select" data-analysis-filter="confidence"><option value="">${escapeHtml(t('optionAll'))}</option><option value="low"${selected('low', filters.confidence)}>${escapeHtml(t('confidenceLowFilter'))}</option><option value="medium"${selected('medium', filters.confidence)}>${escapeHtml(t('confidenceMediumFilter'))}</option><option value="high"${selected('high', filters.confidence)}>${escapeHtml(t('confidenceHighFilter'))}</option></select></label>
                            <button class="meli-btn" data-reset-filters type="button">${escapeHtml(t('clearFilters'))}</button>
                        </div>
                        <div class="meli-selection-tools"><span class="meli-toolbar-meta" data-results-count>${escapeHtml(t('resultsCount', { visible: analysisRecords.length, total: analysisRecords.length }))}</span><span class="meli-toolbar-meta" data-selected-count>${escapeHtml(t('selected', { count: state.selectedIds.size }))}</span><span class="meli-hidden-selected" data-hidden-selected></span><button class="meli-text-btn" data-select-visible type="button">${escapeHtml(t('selectAll'))}</button><button class="meli-text-btn" data-clear-selection type="button">${escapeHtml(t('clearSelection'))}</button></div>
                    </div>
                    <div class="meli-listing-list" data-table-body tabindex="0" role="region" aria-label="${escapeHtml(t('analysisTitle'))}"></div>
                    <div class="meli-bulk-bar" data-bulk-bar ${state.selectedIds.size ? '' : 'hidden'}><div><b data-selected-count>${escapeHtml(t('selected', { count: state.selectedIds.size }))}</b><span>${escapeHtml(t('manualApproval'))}</span></div><div><button class="meli-btn" data-start-research type="button" ${state.selectedIds.size === 1 ? '' : 'disabled'} title="${escapeHtml(state.selectedIds.size === 1 ? t('researchStart') : t('researchOneListing'))}">${escapeHtml(t('researchStart'))}</button><button class="meli-btn" data-open-ai type="button">${escapeHtml(t('aiExchange'))}</button><button class="meli-btn primary" data-build-queue type="button">${escapeHtml(t('buildQueue'))}</button>${Queue.activeItem() ? `<button class="meli-btn" data-action="go-current" type="button">${escapeHtml(t('goFirst'))}</button>` : ''}</div></div>
                </div>
            </section>`;
        },
        analysisGateView() {
            const status = state.collection?.status || '';
            const onListingsPage = routeKind() === 'listings';
            const locallyRunning = status === 'running' && Boolean(state.collectionLoop && state.collectionLeaseToken);
            const buttonLabel = locallyRunning ? t('stopCollection') : ['running', 'paused'].includes(status) ? t('resumeCollection') : t('startAnalysis');
            const totalPages = Math.max(1, Number(state.collection?.totalPages) || 1);
            const completedPages = Object.keys(state.collection?.pages || {}).length;
            const progress = Math.max(0, Math.min(100, Math.round((completedPages / totalPages) * 100)));
            const progressMarkup = ['running', 'paused'].includes(status) ? `<div class="meli-analysis-gate-progress"><div class="meli-collection-track" role="progressbar" aria-label="${escapeHtml(t('collectionProgress', Collection.progressParams()))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}"><i style="width:${progress}%"></i></div><span>${escapeHtml(t('collectionProgress', Collection.progressParams()))}</span></div>` : '';
            const listingsHref = collectionScopeHref(state.collection?.scopeKey) || '/your/shops/me/tools/listings?stats=true';
            const actionMarkup = onListingsPage
                ? `<button class="meli-btn primary" data-analysis-scan type="button">${escapeHtml(buttonLabel)}</button><span class="meli-analysis-gate-shortcut">${escapeHtml(t('collectionShortcut'))}</span>`
                : `<a class="meli-btn primary" data-analysis-open-listings href="${escapeHtml(listingsHref)}">${escapeHtml(t('openListingsForAnalysis'))}</a>`;
            const reportMarkup = status === 'blocked' && state.collection?.failureReports?.length ? `<button class="meli-btn" data-error-report type="button">${escapeHtml(t('errorReport'))}</button>` : '';
            return `<section class="meli-view">${this.viewHeader(t('analysisTitle'))}
                <div class="meli-analysis-gate" data-analysis-gate>
                    <div class="meli-analysis-gate-inner">
                        <div class="meli-analysis-gate-icon" aria-hidden="true">${iconSvg('activity')}</div>
                        <h3>${escapeHtml(t('analysisOverdueTitle'))}</h3>
                        <p>${escapeHtml(t('analysisOverdueCopy'))}</p>
                        ${progressMarkup}
                        ${actionMarkup}
                        ${reportMarkup}
                    </div>
                </div>
            </section>`;
        },
        aiView() {
            return `<section class="meli-view">${this.viewHeader(t('aiTitle'), t('aiIntro'))}
                <article class="meli-card"><div class="meli-card-body meli-ai-layout">
                    <div class="meli-actions" style="margin-top:0"><button class="meli-btn primary" data-copy-ai type="button">${escapeHtml(t('copyAiRequest'))}</button><button class="meli-btn" data-copy-ai-template type="button">${escapeHtml(t('copyAiTemplate'))}</button></div>
                    <label class="meli-field"><span class="meli-field-head">${escapeHtml(t('aiResponseLabel'))}</span><textarea id="meli-ai-json" class="meli-textarea" data-ai-json aria-invalid="false" aria-describedby="meli-ai-format-help meli-ai-feedback" placeholder='{"schema":"makaytron-listing-ai-proposals/v1","requestId":"...","proposals":[{"reference":"L001",...}]}'></textarea><small id="meli-ai-format-help">${escapeHtml(t('aiFormatHelp'))}</small></label>
                    <div id="meli-ai-feedback" class="meli-feedback" data-ai-feedback role="status" aria-live="polite"></div>
                    <div class="meli-actions"><button class="meli-btn primary" data-import-ai type="button">${escapeHtml(t('importAiResponse'))}</button></div>
                </div></article>
                ${this.aiComparisonView()}
            </section>`;
        },
        queueView() {
            const item = Queue.activeItem();
            return `<section class="meli-view">${this.viewHeader(t('queueTitle'), item ? t('currentItem', { current: state.queue.cursor + 1, total: state.queue.items.length }) : t('noQueue'))}<article class="meli-card">${this.queueCard()}</article><p class="meli-note">${escapeHtml(t('manualApproval'))}</p></section>`;
        },
        settingsView() {
            const fields = ['minVisitsToImprove','minVisitsToProtect','minRenewalsToReview','declinePercent'];
            const updateCopy = state.updateState.status === 'checking' ? t('updateChecking') : state.updateState.status === 'available' ? t('updateAvailable', { version: state.updateState.latestVersion }) : state.updateState.status === 'current' ? t('updateCurrent') : state.updateState.status === 'managed' ? t('updateManagedExternally') : state.updateState.status === 'error' ? t('updateFailed', { message: state.updateState.error }) : t('checkUpdate');
            const installAction = ['current', 'available'].includes(state.updateState.status) ? `<button class="meli-btn" data-install-update type="button">${escapeHtml(t('installUpdate'))}</button>` : '';
            return `<section class="meli-view">${this.viewHeader(t('settingsTitle'))}${this.updateBanner()}${this.storageBanner()}<div class="meli-settings-grid">${fields.map((key) => `<div class="meli-setting"><span>${escapeHtml(t(key))}</span><strong>${escapeHtml(state.settings[key])}</strong></div>`).join('')}</div><article class="meli-card" style="margin-top:12px"><div class="meli-card-body"><div class="meli-actions" style="margin-top:0"><button class="meli-btn primary" data-open-settings-modal type="button">${escapeHtml(t('editThresholds'))}</button><button class="meli-btn" data-import-backup type="button">${escapeHtml(t('importBackup'))}</button><input data-backup-file type="file" accept="application/json,.json" hidden><button class="meli-btn" data-feedback type="button">${escapeHtml(t('userFeedback'))}</button><button class="meli-btn" data-check-update type="button" ${state.updateState.status === 'checking' ? 'disabled' : ''}>${escapeHtml(updateCopy)}</button>${installAction}</div><p class="meli-meta" style="margin:10px 0 0">${escapeHtml(t('updateInstallHelp'))}</p><p class="meli-meta">${escapeHtml(t('feedbackCount'))}: ${formatNumber(state.feedback.length)}</p></div></article></section>`;
        },
        queueCard() {
            const queue = state.queue;
            const item = Queue.activeItem();
            const page = routeKind();
            const recovery = Queue.recoveryState();
            if (recovery) {
                const copy = recovery.submitted ? t('queueRecoverySubmitted') : t('queueRecoveryCopy');
                const canVerifyDeactivation = page === 'editor' && item.proposal?.action === 'DEACTIVATE_REVIEW'
                    && DEACTIVATION_VERIFY_STATUSES.includes(String(item.status || ''));
                const canVerifyPublish = page === 'editor' && item.proposal?.action === 'UPDATE'
                    && ['submitted', 'submitted-unverified'].includes(String(item.status || ''));
                return `<div class="meli-queue"><div class="meli-queue-title"><span>${escapeHtml(t('queueRecoveryTitle'))}</span>${queue?.items ? `<span>${Math.min(queue.cursor + 1, queue.items.length)}/${queue.items.length}</span>` : ''}</div><div class="meli-queue-body"><div class="meli-queue-recovery" data-queue-recovery role="alert"><strong>${escapeHtml(t('listing'))} ${escapeHtml(item.listingId)}</strong><p>${escapeHtml(copy)}</p><div class="meli-actions"><button class="meli-btn primary" data-recovery-open-listing type="button">${escapeHtml(t('queueRecoveryOpen'))}</button>${canVerifyPublish ? `<button class="meli-btn" data-action="verify-publish" type="button">${escapeHtml(t('verifyPublish'))}</button>` : ''}${canVerifyDeactivation ? `<button class="meli-btn" data-action="verify-deactivate" type="button">${escapeHtml(t('verifyDeactivate'))}</button>` : ''}${recovery.submitted ? '' : `<button class="meli-btn" data-queue-recover type="button">${escapeHtml(t('queueRecoveryRetry'))}</button>`}<button class="meli-btn danger" data-recovery-stop type="button">${escapeHtml(t('queueRecoveryStop'))}</button></div></div></div></div>`;
            }
            return `<div class="meli-queue"><div class="meli-queue-title"><span>${escapeHtml(t('queueTitle'))}</span>${queue?.items ? `<span>${Math.min(queue.cursor + (item ? 1 : 0), queue.items.length)}/${queue.items.length}</span>` : ''}</div><div class="meli-queue-body">${item ? `<p>${escapeHtml(item.title || item.listingId)} · ${escapeHtml(item.status)}</p>${page === 'editor' ? this.editorQueueActions(item) : `<div class="meli-actions"><button class="meli-btn primary" data-action="go-current" type="button">${escapeHtml(t('goFirst'))}</button></div>`}` : `<p>${escapeHtml(t('noQueue'))}</p>`}</div></div>`;
        },
        editorQueueActions(item) {
            const mismatch = currentListingId() && currentListingId() !== String(item.listingId);
            if (mismatch) return `<p>${escapeHtml(t('routeMismatch'))}</p><div class="meli-actions"><button class="meli-btn" data-action="go-current" type="button">${escapeHtml(t('goFirst'))}</button></div>`;
            if (item.proposal?.action === 'DEACTIVATE_REVIEW') {
                if (String(item.status || '') === 'awaiting-user-deactivation') {
                    return `<div class="meli-actions"><button class="meli-btn primary" data-action="verify-deactivate" type="button">${escapeHtml(t('verifyDeactivate'))}</button><button class="meli-btn danger" data-action="stop" type="button">${escapeHtml(t('stopQueue'))}</button></div>`;
                }
                if (DEACTIVATION_VERIFY_STATUSES.includes(String(item.status || ''))) {
                    return `<div class="meli-actions"><button class="meli-btn primary" data-action="verify-deactivate" type="button">${escapeHtml(t('verifyDeactivate'))}</button><button class="meli-btn danger" data-action="stop" type="button">${escapeHtml(t('stopQueue'))}</button></div>`;
                }
                return `<div class="meli-actions"><button class="meli-btn primary" data-action="deactivate" type="button">${escapeHtml(t('openDeactivate'))}</button><button class="meli-btn" data-action="skip" type="button">${escapeHtml(t('skipItem'))}</button><button class="meli-btn danger" data-action="stop" type="button">${escapeHtml(t('stopQueue'))}</button></div>`;
            }
            if (['submitted', 'submitted-unverified'].includes(String(item.status || ''))) {
                return `<div class="meli-actions"><button class="meli-btn primary" data-action="verify-publish" type="button">${escapeHtml(t('verifyPublish'))}</button><button class="meli-btn danger" data-action="stop" type="button">${escapeHtml(t('stopQueue'))}</button></div>`;
            }
            return `<div class="meli-actions"><button class="meli-btn primary" data-action="apply" type="button">${escapeHtml(t('applyForm'))}</button><button class="meli-btn" data-action="publish" type="button">${escapeHtml(t('publishAfterReview'))}</button><button class="meli-btn" data-action="skip" type="button">${escapeHtml(t('skipItem'))}</button><button class="meli-btn danger" data-action="stop" type="button">${escapeHtml(t('stopQueue'))}</button></div>`;
        },
        bindPanel() {
            const root = state.panel;
            root.querySelector('[data-language]')?.addEventListener('click', () => { void this.toggleLanguage(); });
            root.querySelector('[data-wide]')?.addEventListener('click', () => { state.wide = !state.wide; this.render(true); });
            root.querySelector('[data-collapse]')?.addEventListener('click', () => { void this.setCollapsed(true); });
            root.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
                const view = button.dataset.view;
                if (view === 'analysis') { void this.openAnalysis(); return; }
                if (view === 'ai') { this.openAi(); return; }
                if (view === 'settings') { this.openSettings(); return; }
                state.activeView = view;
                this.render(true);
            }));
            root.querySelector('[data-action="scan"]')?.addEventListener('click', () => { void scanCurrentPage(); });
            root.querySelector('[data-action="scan-all"]')?.addEventListener('click', () => { void Collection.toggle(); });
            root.querySelector('[data-analysis-scan]')?.addEventListener('click', () => { void Collection.toggle(); });
            root.querySelector('[data-overview-action="analysis"]')?.addEventListener('click', () => { void this.openAnalysis(); });
            root.querySelector('[data-overview-action="ai"]')?.addEventListener('click', () => { this.openAi(); });
            root.querySelector('[data-action="export"]')?.addEventListener('click', () => { void exportBackup(); });
            const backupInput = root.querySelector('[data-backup-file]');
            root.querySelectorAll('[data-import-backup]').forEach((button) => button.addEventListener('click', () => backupInput?.click()));
            backupInput?.addEventListener('change', () => { const file = backupInput.files?.[0]; if (file) this.openBackupImport(file); });
            root.querySelectorAll('[data-feedback]').forEach((button) => button.addEventListener('click', () => this.openFeedback()));
            root.querySelector('[data-overview-action="settings"]')?.addEventListener('click', () => { this.openSettings(); });
            root.querySelector('[data-open-settings-modal]')?.addEventListener('click', () => { this.openSettingsModal(); });
            root.querySelector('[data-check-update]')?.addEventListener('click', () => { void checkForUpdates({ manual: true, force: true }); });
            bindInstallUpdate(root.querySelector('[data-install-update]'));
            root.querySelectorAll('[data-error-report]').forEach((button) => button.addEventListener('click', () => { this.openCollectionErrorReport(); }));
            root.querySelector('[data-action="go-current"]')?.addEventListener('click', () => { void Queue.navigate(); });
            root.querySelector('[data-action="apply"]')?.addEventListener('click', () => { void applyCurrentProposal(); });
            root.querySelector('[data-action="publish"]')?.addEventListener('click', () => { void publishCurrentProposal(); });
            root.querySelector('[data-action="verify-publish"]')?.addEventListener('click', () => { void verifyCurrentPublish(); });
            root.querySelector('[data-action="deactivate"]')?.addEventListener('click', () => { void openCurrentDeactivate(); });
            root.querySelector('[data-action="verify-deactivate"]')?.addEventListener('click', () => { void verifyCurrentDeactivate(); });
            root.querySelector('[data-action="skip"]')?.addEventListener('click', () => { void skipCurrentItem(); });
            root.querySelector('[data-action="stop"]')?.addEventListener('click', () => { void stopCurrentQueue('user'); });
            root.querySelector('[data-recovery-open-listing]')?.addEventListener('click', () => { void Queue.navigate(); });
            root.querySelector('[data-recovery-stop]')?.addEventListener('click', () => { void stopCurrentQueue('recovery-user'); });
            root.querySelector('[data-queue-recover]')?.addEventListener('click', () => { void recoverCurrentItem(); });
            if (state.activeView === 'analysis') this.bindAnalysis(root);
            if (state.activeView === 'ai') this.bindAi(root);
        },
        bindAnalysis(root) {
            const body = root.querySelector('[data-table-body]');
            if (!body) return;
            const search = root.querySelector('[data-table-search]');
            const updateSelected = (visible) => {
                const visibleIds = new Set(visible.map((record) => String(record.listingId)));
                const hiddenCount = [...state.selectedIds].filter((listingId) => !visibleIds.has(String(listingId))).length;
                root.querySelectorAll('[data-selected-count]').forEach((element) => { element.textContent = t('selected', { count: state.selectedIds.size }); });
                const hidden = root.querySelector('[data-hidden-selected]');
                if (hidden) { hidden.textContent = hiddenCount ? t('hiddenSelected', { count: hiddenCount }) : ''; hidden.hidden = hiddenCount === 0; }
                const bulkBar = root.querySelector('[data-bulk-bar]'); if (bulkBar) bulkBar.hidden = state.selectedIds.size === 0;
                const researchButton = root.querySelector('[data-start-research]');
                if (researchButton) { researchButton.disabled = state.selectedIds.size !== 1; researchButton.title = state.selectedIds.size === 1 ? t('researchStart') : t('researchOneListing'); }
            };
            const syncPresetState = () => {
                root.querySelectorAll('[data-apply-builtin-preset]').forEach((button) => {
                    const preset = BUILTIN_FILTER_PRESETS.find((item) => item.id === button.dataset.applyBuiltinPreset);
                    button.classList.toggle('is-active', Boolean(preset && analysisPresetIsActive(preset)));
                });
                root.querySelectorAll('[data-apply-custom-preset]').forEach((button) => {
                    const preset = state.filterPresets.find((item) => item.id === button.dataset.applyCustomPreset);
                    button.classList.toggle('is-active', Boolean(preset && analysisPresetIsActive(preset)));
                });
            };
            const updateFacetCounts = (analysisRecords, factRows = null) => {
                const counts = factRows
                    ? analysisFacetCountsFromFacts(factRows, state.analysisFilters)
                    : analysisFacetCounts(analysisRecords, state.analysisFilters, normalizeSpace(state.analysisQuery), new Set(state.pageListings.map((item) => String(item.listingId))));
                root.querySelectorAll('[data-analysis-filter]').forEach((control) => {
                    const facet = control.dataset.analysisFilter;
                    if (!counts[facet]) return;
                    Array.from(control.options || []).forEach((option) => {
                        if (!option.dataset.baseLabel) option.dataset.baseLabel = option.textContent.replace(/\s+\(\d+\)$/, '');
                        const count = counts[facet][option.value] ?? 0;
                        option.textContent = `${option.dataset.baseLabel} (${formatNumber(count)})`;
                        option.disabled = count === 0 && option.value !== control.value;
                    });
                });
            };
            const renderRows = (options = {}) => {
                const previousScrollTop = options.preserveScroll ? body.scrollTop : 0;
                const analysisRecords = collectedAnalysisRecords();
                const factRows = analysisFactsForRecords(analysisRecords, state.analysisQuery, new Set(state.pageListings.map((item) => String(item.listingId))));
                const visible = filteredAnalysisRecords(analysisRecords, factRows);
                const shown = visible.slice(0, state.analysisLimit);
                const moreMarkup = shown.length < visible.length ? `<div class="meli-load-more"><span>${escapeHtml(t('showingCount', { shown: shown.length, total: visible.length }))}</span><button class="meli-btn" data-load-more type="button">${escapeHtml(t('loadMore'))}</button></div>` : '';
                if (options.append && visible.length) {
                    const rendered = body.querySelectorAll('[data-listing-card]').length;
                    body.querySelector('[data-load-more]')?.closest('.meli-load-more')?.remove();
                    body.insertAdjacentHTML('beforeend', `${shown.slice(rendered).map((record) => this.recordRow(record)).join('')}${moreMarkup}`);
                } else if (!analysisRecords.length) body.innerHTML = `<div class="meli-empty"><span>${escapeHtml(t('noData'))}</span></div>`;
                else if (!visible.length) body.innerHTML = `<div class="meli-empty"><span>${escapeHtml(t('noFilterResults'))}</span><button class="meli-btn" data-empty-reset type="button">${escapeHtml(t('clearFilters'))}</button></div>`;
                else body.innerHTML = `${shown.map((record) => this.recordRow(record)).join('')}${moreMarkup}`;
                if (options.preserveScroll) body.scrollTop = previousScrollTop;
                else body.scrollTop = 0;
                const resultCopy = t('resultsCount', { visible: visible.length, total: analysisRecords.length });
                root.querySelectorAll('[data-results-count]').forEach((element) => { element.textContent = resultCopy; });
                const filterCount = analysisFilterCount() + (normalizeSpace(state.analysisQuery) ? 1 : 0);
                const badge = root.querySelector('[data-filter-count]'); if (badge) badge.textContent = formatNumber(filterCount);
                const reset = root.querySelector('[data-reset-filters]'); if (reset) reset.disabled = filterCount === 0;
                updateFacetCounts(analysisRecords, factRows);
                syncPresetState();
                updateSelected(visible);
                return visible;
            };
            const syncFilterControls = () => {
                root.querySelectorAll('[data-analysis-filter]').forEach((control) => { control.value = state.analysisFilters[control.dataset.analysisFilter] ?? ''; });
                if (search) search.value = state.analysisQuery;
            };
            const resetFilters = async () => {
                const previous = { filters: state.analysisFilters, query: state.analysisQuery, limit: state.analysisLimit };
                const revision = beginPreferenceMutation('analysisFilters');
                state.analysisFilters = { ...DEFAULT_ANALYSIS_FILTERS };
                state.analysisQuery = '';
                state.analysisLimit = ANALYSIS_BATCH_SIZE;
                syncFilterControls();
                visible = renderRows();
                const saved = await Store.saveAnalysisFilters();
                if (!saved && preferenceMutationIsCurrent('analysisFilters', revision)) {
                    const committed = committedPreference(KEYS.analysisFilters, previous);
                    state.analysisFilters = committed.filters;
                    if (state.analysisQuery === '') state.analysisQuery = committed.query;
                    state.analysisLimit = committed.limit;
                    syncFilterControls();
                    visible = renderRows();
                    this.toast(t('storageWriteFailed'), 'error');
                }
                return saved;
            };
            const applyPreset = async (preset) => {
                if (!preset) return;
                const previous = { filters: state.analysisFilters, query: state.analysisQuery, limit: state.analysisLimit };
                const revision = beginPreferenceMutation('analysisFilters');
                const candidateFilters = normalizeAnalysisFilters({ ...DEFAULT_ANALYSIS_FILTERS, ...(preset.filters || {}) });
                const candidateQuery = normalizeSpace(preset.query).slice(0, 120);
                state.analysisFilters = candidateFilters;
                state.analysisQuery = candidateQuery;
                state.analysisLimit = ANALYSIS_BATCH_SIZE;
                syncFilterControls();
                visible = renderRows();
                const saved = await Store.saveAnalysisFilters();
                if (!saved && preferenceMutationIsCurrent('analysisFilters', revision)) {
                    const committed = committedPreference(KEYS.analysisFilters, previous);
                    state.analysisFilters = committed.filters;
                    if (state.analysisQuery === candidateQuery) state.analysisQuery = committed.query;
                    state.analysisLimit = committed.limit;
                    syncFilterControls();
                    visible = renderRows();
                    this.toast(t('storageWriteFailed'), 'error');
                }
                return saved;
            };
            let visible = renderRows();
            body.addEventListener('change', (event) => {
                const checkbox = event.target instanceof Element ? event.target.closest('[data-row-select]') : null;
                if (!checkbox) return;
                checkbox.checked ? state.selectedIds.add(checkbox.dataset.rowSelect) : state.selectedIds.delete(checkbox.dataset.rowSelect);
                checkbox.closest('.meli-listing-card')?.classList.toggle('is-selected', checkbox.checked);
                updateSelected(visible);
            });
            body.addEventListener('click', (event) => {
                const target = event.target instanceof Element ? event.target : null;
                if (!target) return;
                const proposal = target.closest('[data-proposal]');
                if (proposal) {
                    const record = state.records.find((item) => item.listingId === proposal.dataset.proposal);
                    if (record) this.openProposal(record);
                    return;
                }
                const researchEvidence = target.closest('[data-research-evidence]');
                if (researchEvidence) {
                    const record = state.records.find((item) => item.listingId === researchEvidence.dataset.researchEvidence);
                    if (record) this.openResearchEvidence(record);
                    return;
                }
                const history = target.closest('[data-history]');
                if (history) {
                    const record = state.records.find((item) => item.listingId === history.dataset.history);
                    if (record) this.openHistory(record);
                    return;
                }
                if (target.closest('[data-load-more]')) {
                    state.analysisLimit += ANALYSIS_BATCH_SIZE;
                    visible = renderRows({ append: true, preserveScroll: true });
                    return;
                }
                if (target.closest('[data-empty-reset]')) void resetFilters();
            });
            let searchRenderTimer = null;
            search?.addEventListener('input', () => {
                state.analysisQuery = search.value;
                state.analysisLimit = ANALYSIS_BATCH_SIZE;
                searchRenderTimer = scheduleAnalysisSearch(searchRenderTimer, () => {
                    searchRenderTimer = null;
                    if (body.isConnected !== false) visible = renderRows();
                });
            });
            root.querySelectorAll('[data-analysis-filter]').forEach((control) => control.addEventListener('change', async () => {
                const previous = { filters: state.analysisFilters, limit: state.analysisLimit };
                const revision = beginPreferenceMutation('analysisFilters');
                state.analysisFilters = normalizeAnalysisFilters({ ...state.analysisFilters, [control.dataset.analysisFilter]: control.value });
                state.analysisLimit = ANALYSIS_BATCH_SIZE;
                visible = renderRows();
                const saved = await Store.saveAnalysisFilters();
                if (!saved && preferenceMutationIsCurrent('analysisFilters', revision)) {
                    const committed = committedPreference(KEYS.analysisFilters, { ...previous, query: state.analysisQuery });
                    state.analysisFilters = committed.filters;
                    state.analysisLimit = committed.limit;
                    syncFilterControls();
                    visible = renderRows();
                    this.toast(t('storageWriteFailed'), 'error');
                }
            }));
            root.querySelector('[data-toggle-filters]')?.addEventListener('click', (event) => {
                state.analysisFilterDrawerOpen = !state.analysisFilterDrawerOpen;
                event.currentTarget.setAttribute('aria-expanded', String(state.analysisFilterDrawerOpen));
                const drawer = root.querySelector('[data-filter-drawer]'); if (drawer) drawer.hidden = !state.analysisFilterDrawerOpen;
            });
            root.querySelector('[data-reset-filters]')?.addEventListener('click', () => { void resetFilters(); });
            root.querySelectorAll('[data-apply-builtin-preset]').forEach((button) => button.addEventListener('click', () => {
                const preset = BUILTIN_FILTER_PRESETS.find((item) => item.id === button.dataset.applyBuiltinPreset);
                void applyPreset(preset);
            }));
            root.querySelectorAll('[data-apply-custom-preset]').forEach((button) => button.addEventListener('click', () => {
                const preset = state.filterPresets.find((item) => item.id === button.dataset.applyCustomPreset);
                void applyPreset(preset);
            }));
            root.querySelector('[data-save-preset]')?.addEventListener('click', async () => {
                const input = root.querySelector('[data-preset-name]');
                const name = normalizeSpace(input?.value).slice(0, 32);
                if (name.length < 2) { this.toast(t('presetInvalid'), 'warning'); input?.focus(); return; }
                const existingIndex = state.filterPresets.findIndex((item) => presetNameFold(item.name) === presetNameFold(name));
                if (existingIndex < 0 && state.filterPresets.length >= MAX_FILTER_PRESETS) { this.toast(t('presetLimit', { count: MAX_FILTER_PRESETS }), 'warning'); return; }
                const previous = existingIndex >= 0 ? state.filterPresets[existingIndex] : null;
                const candidate = { id: previous?.id || randomId('preset'), name, filters: normalizeAnalysisFilters(state.analysisFilters), query: normalizeSpace(state.analysisQuery).slice(0, 120), createdAt: previous?.createdAt || nowIso(), updatedAt: nowIso() };
                const previousPresets = state.filterPresets;
                const nextPresets = [...state.filterPresets];
                if (existingIndex >= 0) nextPresets.splice(existingIndex, 1, candidate); else nextPresets.push(candidate);
                const revision = beginPreferenceMutation('filterPresets');
                state.filterPresets = nextPresets;
                let saved = false;
                try { saved = await Store.upsertFilterPreset(candidate); }
                catch { saved = false; }
                if (!preferenceMutationIsCurrent('filterPresets', revision)) return;
                if (!saved) {
                    state.filterPresets = committedPreference(KEYS.filterPresets, previousPresets);
                    this.toast(t('storageWriteFailed'), 'error');
                } else this.toast(t('presetSaved'), 'success');
                this.render(true);
            });
            root.querySelectorAll('[data-delete-preset]').forEach((button) => button.addEventListener('click', async () => {
                const previousPresets = state.filterPresets;
                const revision = beginPreferenceMutation('filterPresets');
                state.filterPresets = state.filterPresets.filter((item) => item.id !== button.dataset.deletePreset);
                let saved = false;
                try { saved = await Store.deleteFilterPreset(button.dataset.deletePreset); }
                catch { saved = false; }
                if (!preferenceMutationIsCurrent('filterPresets', revision)) return;
                if (!saved) {
                    state.filterPresets = committedPreference(KEYS.filterPresets, previousPresets);
                    this.toast(t('storageWriteFailed'), 'error');
                } else this.toast(t('presetDeleted'), 'success');
                this.render(true);
            }));
            root.querySelector('[data-select-visible]')?.addEventListener('click', () => {
                root.querySelectorAll('[data-row-select]').forEach((checkbox) => {
                    state.selectedIds.add(checkbox.dataset.rowSelect);
                    checkbox.checked = true;
                    checkbox.closest('.meli-listing-card')?.classList.add('is-selected');
                });
                updateSelected(visible);
            });
            root.querySelector('[data-clear-selection]')?.addEventListener('click', () => {
                state.selectedIds.clear();
                root.querySelectorAll('[data-row-select]').forEach((checkbox) => {
                    checkbox.checked = false;
                    checkbox.closest('.meli-listing-card')?.classList.remove('is-selected');
                });
                updateSelected(visible);
            });
            root.querySelector('[data-build-queue]')?.addEventListener('click', () => { void buildQueueFromSelection(); });
            root.querySelector('[data-start-research]')?.addEventListener('click', () => { void startMarketplaceResearchSelection(); });
            root.querySelector('[data-open-ai]')?.addEventListener('click', () => this.openAi());
        },
        bindAi(root) {
            root.querySelector('[data-copy-ai]')?.addEventListener('click', async () => {
                await copyAiRequest();
                const feedback = root.querySelector('[data-ai-feedback]');
                if (feedback) feedback.textContent = t(state.status.key, state.status.params);
            });
            root.querySelector('[data-copy-ai-template]')?.addEventListener('click', async () => {
                await copyText(aiProposalTemplate()); this.toast(t('aiTemplateCopied'), 'success');
            });
            root.querySelector('[data-import-ai]')?.addEventListener('click', () => {
                const feedbackProxy = {
                    style: { set color(value) { const current = state.panel?.querySelector('[data-ai-feedback]'); if (current) current.style.color = value; } },
                    set textContent(value) { const current = state.panel?.querySelector('[data-ai-feedback]'); if (current) current.textContent = value; },
                    setAttribute(name, value) { state.panel?.querySelector('[data-ai-feedback]')?.setAttribute(name, value); },
                    get dataset() { return state.panel?.querySelector('[data-ai-feedback]')?.dataset || {}; },
                };
                void importAiResponse(root.querySelector('[data-ai-json]')?.value || '', feedbackProxy);
            });
        },
        updateBadge() {
            const badge = state.shadow?.querySelector('[data-launch-badge]');
            if (!badge) return;
            const summary = this.summary();
            const count = summary.deactivateReview + summary.improve + summary.declining;
            badge.textContent = count > 99 ? '99+' : String(count);
            badge.hidden = count === 0;
        },
        openModal(title, body, options = {}) {
            const active = state.shadow?.activeElement;
            const fallback = state.panel?.querySelector('[data-open-settings-modal], [data-view="settings"], [data-feedback], [data-import-backup]');
            const returnFocus = active instanceof HTMLElement && active.isConnected && !state.modal?.contains(active) ? active : fallback;
            this.closeModal({ restoreFocus: false });
            state.modalReturnFocus = returnFocus instanceof HTMLElement ? returnFocus : null;
            const overlay = document.createElement('div');
            overlay.className = 'meli-overlay';
            overlay.setAttribute('lang', state.settings.language);
            overlay.innerHTML = `<section class="meli-modal ${options.small ? 'small' : ''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><div class="meli-modal-head"><div class="meli-modal-brand">${logoLinkMarkup('meli-modal-logo')}<div><h2 class="meli-modal-title">${escapeHtml(title)}</h2><div class="meli-modal-subtitle">Makaytron · Etsy Listing Analyzer · v${escapeHtml(APP_VERSION)}</div></div></div><button class="meli-icon" data-modal-close type="button" aria-label="${escapeHtml(t('close'))}">${iconSvg('close')}</button></div><div class="meli-modal-body" tabindex="0" role="region" aria-label="${escapeHtml(title)}">${body}</div>${options.footer || ''}</section>`;
            state.shadow.appendChild(overlay);
            state.modal = overlay;
            overlay.querySelector('[data-modal-close]')?.addEventListener('click', () => this.closeModal());
            overlay.addEventListener('click', (event) => { if (event.target === overlay) this.closeModal(); });
            overlay.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.closeModal(); return; }
                if (event.key !== 'Tab') return;
                const focusable = Array.from(overlay.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter((node) => node instanceof HTMLElement && !node.hidden && node.getClientRects().length);
                if (!focusable.length) { event.preventDefault(); overlay.querySelector('.meli-modal-body')?.focus(); return; }
                const first = focusable[0]; const last = focusable.at(-1);
                if (event.shiftKey && (state.shadow.activeElement === first || !overlay.contains(state.shadow.activeElement))) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && state.shadow.activeElement === last) { event.preventDefault(); first.focus(); }
            });
            overlay.querySelector('input,select,textarea,button')?.focus();
        },
        closeModal(options = {}) {
            const returnFocus = state.modalReturnFocus;
            state.modal?.remove();
            state.modal = null;
            state.modalReturnFocus = null;
            if (options.restoreFocus !== false && returnFocus?.isConnected) returnFocus.focus();
        },
        toast(message, tone = 'info', duration = 3600) {
            const root = state.shadow?.querySelector('[data-toast-root]');
            if (!root || !message) return;
            while (root.children.length >= 4) root.firstElementChild?.remove();
            const marks = { success: '✓', error: '!', warning: '!', info: 'i' };
            const item = document.createElement('div');
            item.className = 'meli-toast';
            item.dataset.tone = marks[tone] ? tone : 'info';
            item.setAttribute('role', item.dataset.tone === 'error' ? 'alert' : 'status');
            const mark = document.createElement('span');
            mark.className = 'meli-toast-mark';
            mark.textContent = marks[item.dataset.tone];
            const copy = document.createElement('span');
            copy.className = 'meli-toast-copy';
            copy.textContent = String(message);
            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'meli-toast-close';
            close.setAttribute('aria-label', t('close'));
            close.textContent = '×';
            item.append(mark, copy, close);
            root.appendChild(item);
            const remove = () => {
                item.classList.remove('is-visible');
                window.setTimeout(() => item.remove(), 180);
            };
            close.addEventListener('click', remove);
            requestAnimationFrame(() => item.classList.add('is-visible'));
            window.setTimeout(remove, duration);
        },
        researchEvidenceMarkup(evidence, limit = 10) {
            let validated;
            try { validated = validateResearchEvidence(evidence); }
            catch { return ''; }
            const rows = validated.keywords.slice(0, clamp(limit, 1, 28)).map((item) => `<div class="meli-research-evidence-row"><strong>${escapeHtml(item.keyword)}</strong><span>${escapeHtml(t('researchSearches30d'))}<b>${escapeHtml(formatNumber(item.searches30d))}</b></span><span>${escapeHtml(t('researchSearchResults'))}<b>${escapeHtml(formatNumber(item.searchResults))}</b></span><span>${escapeHtml(t('researchOpportunity'))}<b>${escapeHtml(`${formatNumber(item.opportunity.score)} · ${item.opportunity.label}`)}</b></span></div>`).join('');
            return `<section class="meli-research-evidence"><h3>${escapeHtml(t('researchEvidenceTitle'))}</h3><div>${rows}</div><p>${escapeHtml(t('researchSourceNote'))}</p><time datetime="${escapeHtml(validated.capturedAt)}">${escapeHtml(formatDate(validated.capturedAt))}</time></section>`;
        },
        openResearchEvidence(record) {
            let evidence;
            try { evidence = validateResearchEvidence(record.researchEvidence); }
            catch { return; }
            const footer = `<div class="meli-modal-foot"><button class="meli-btn" data-research-review type="button">${escapeHtml(t('researchOpenProposal'))}</button><button class="meli-btn primary" data-modal-close-secondary type="button">${escapeHtml(t('close'))}</button></div>`;
            this.openModal(`${t('researchEvidenceTitle')} · ${record.listingId}`, this.researchEvidenceMarkup(evidence, 25), { small: true, footer });
            state.modal?.querySelector('[data-research-review]')?.addEventListener('click', () => { this.closeModal(); this.openProposal(record); });
            state.modal?.querySelector('[data-modal-close-secondary]')?.addEventListener('click', () => this.closeModal());
        },
        openResearchMissingModal(entry = null) {
            const body = `<div class="meli-form-card"><div class="meli-card-body"><p class="meli-note" style="margin:0 0 10px">${escapeHtml(t('researchCompanionMissing'))}</p><p class="meli-note" style="margin:0">${escapeHtml(t('researchInstallHelp'))}</p><code class="meli-install-url">${escapeHtml(RESEARCH_INSTALL_URL)}</code><div class="meli-feedback" data-research-missing-feedback></div></div></div>`;
            const copyAction = entry ? `<button class="meli-btn" data-research-copy-missing type="button">${escapeHtml(t('researchCopyRequest'))}</button>` : '';
            const footer = `<div class="meli-modal-foot"><button class="meli-btn" data-research-install-cancel type="button">${escapeHtml(t('cancel'))}</button>${copyAction}<button class="meli-btn primary" data-research-install-open type="button">${escapeHtml(t('researchOpenInstall'))}</button></div>`;
            this.openModal(t('researchCompanionMissingTitle'), body, { small: true, footer });
            state.modal?.querySelector('[data-research-install-cancel]')?.addEventListener('click', () => this.closeModal());
            state.modal?.querySelector('[data-research-copy-missing]')?.addEventListener('click', async () => {
                const feedback = state.modal?.querySelector('[data-research-missing-feedback]');
                try { await copyText(JSON.stringify(researchRequestEnvelope(entry), null, 2)); if (feedback) feedback.textContent = t('researchRequestCopied'); }
                catch (error) { if (feedback) feedback.textContent = t('researchFailed', { message: normalizeSpace(error?.message) }); }
            });
            state.modal?.querySelector('[data-research-install-open]')?.addEventListener('click', () => {
                GMX.openTab(RESEARCH_INSTALL_URL);
            });
        },
        openResearchTransfer(entry) {
            const statusKey = entry.status === 'completed' ? 'researchComplete' : entry.status === 'acknowledged' ? 'researchAcknowledged' : entry.status === 'request-sent' ? 'researchRequestSent' : 'researchWaitingReady';
            const statusParams = entry.status === 'completed' ? { count: Number(entry.evidenceCount) || 0 } : {};
            const body = `<div class="meli-research-transfer"><div class="meli-status" data-research-transfer-status data-tone="scanning" role="status" aria-live="polite" aria-atomic="true"><div class="meli-status-mark">${iconSvg('activity')}</div><div><strong>${escapeHtml(t('scanning'))}</strong><span>${escapeHtml(t(statusKey, statusParams))}</span></div></div><div class="meli-report-grid"><div><span>requestId</span><b>${escapeHtml(entry.requestId)}</b></div><div><span>reference</span><b>${escapeHtml(entry.opaqueReference)}</b></div><div><span>${escapeHtml(t('capturedAt'))}</span><b>${escapeHtml(formatDate(entry.createdAt))}</b></div><div><span>TTL</span><b>${escapeHtml(formatDate(entry.expiresAt))}</b></div></div><label class="meli-field"><span class="meli-field-head">${escapeHtml(t('researchResultLabel'))}</span><textarea class="meli-textarea meli-research-json" data-research-result-json placeholder='{"schema":"${RESEARCH_ENVELOPE_SCHEMA}","type":"RESEARCH_RESULT",...}'></textarea></label><div class="meli-feedback" data-research-feedback></div><div class="meli-actions"><button class="meli-btn" data-research-copy-request type="button">${escapeHtml(t('researchCopyRequest'))}</button><button class="meli-btn primary" data-research-import-result type="button">${escapeHtml(t('researchImportResult'))}</button></div></div>`;
            const footer = `<div class="meli-modal-foot"><button class="meli-btn" data-research-reopen type="button">${escapeHtml(t('researchReopenInsights'))}</button><button class="meli-btn" data-research-review type="button" ${entry.status === 'completed' ? '' : 'hidden'}>${escapeHtml(t('researchOpenProposal'))}</button><button class="meli-btn" data-research-close type="button">${escapeHtml(t('close'))}</button></div>`;
            this.openModal(t('researchTransferTitle'), body, { small: true, footer });
            const modal = state.modal;
            modal.querySelector('[data-research-copy-request]')?.addEventListener('click', async () => {
                const feedback = modal.querySelector('[data-research-feedback]');
                try { await copyText(JSON.stringify(researchRequestEnvelope(entry), null, 2)); feedback.textContent = t('researchRequestCopied'); feedback.style.color = 'var(--success)'; }
                catch (error) { feedback.textContent = t('researchFailed', { message: normalizeSpace(error?.message) }); }
            });
            modal.querySelector('[data-research-import-result]')?.addEventListener('click', async () => {
                const feedback = modal.querySelector('[data-research-feedback]');
                try {
                    const consumed = await importResearchResultJson(modal.querySelector('[data-research-result-json]')?.value || '');
                    feedback.textContent = t('researchComplete', { count: consumed.count }); feedback.style.color = 'var(--success)';
                    this.updateResearchTransfer(consumed.suggestion?.requiresEditorCapture ? 'researchNeedsEditor' : 'researchSavedForReview', 'ready');
                } catch (error) {
                    const message = error?.code === 'RESEARCH_STALE' ? t('researchStale') : normalizeSpace(error?.message || error);
                    feedback.textContent = t('researchFailed', { message }); feedback.style.color = 'var(--meli-danger)';
                    this.updateResearchTransfer('researchFailed', 'error', { message });
                }
            });
            modal.querySelector('[data-research-reopen]')?.addEventListener('click', () => { GMX.openTab(researchInsightsUrl(entry)); this.updateResearchTransfer('researchWaitingReady', 'scanning'); });
            modal.querySelector('[data-research-review]')?.addEventListener('click', async () => {
                const record = await Store.getRecord(entry.listingId);
                if (record && state.modal === modal) { this.closeModal(); this.openProposal(record); }
            });
            modal.querySelector('[data-research-close]')?.addEventListener('click', () => this.closeModal());
        },
        updateResearchTransfer(key, tone = 'scanning', params = {}) {
            const status = state.modal?.querySelector('[data-research-transfer-status]');
            if (!status) return;
            status.dataset.tone = tone;
            const strong = status.querySelector('strong'); if (strong) strong.textContent = t(tone === 'error' ? 'error' : tone === 'blocked' ? 'blocked' : tone === 'ready' ? 'saved' : 'scanning');
            const copy = status.querySelector('span'); if (copy) copy.textContent = t(key, params);
            const review = state.modal?.querySelector('[data-research-review]'); if (review && tone === 'ready') review.hidden = false;
        },
        async openAnalysis() {
            state.activeView = 'analysis';
            state.wide = true;
            await refreshRecords();
        },
        recordRow(record) {
            const latest = record.history?.at(-1) || {};
            const analysis = record.analysis || record.health?.result || analyseRecord(record, state.records);
            const deltas = analysis.deltas || {};
            const currency = normalizeSpace(latest.currency) || '$';
            const signed = (value) => value === null || value === undefined ? '' : value === 0 ? '±0' : `${value > 0 ? '+' : ''}${formatNumber(value)}`;
            const reviewLine = analysis.experiment ? experimentStateLabel(analysis.experiment) : `${t('nextReview')}: ${formatDate(analysis.nextReviewAt)}`;
            const metric = (label, value, delta, moneyCurrency = '') => {
                const deltaText = moneyCurrency && Number.isFinite(delta)
                    ? (delta === 0 ? `±${formatMoney(0, moneyCurrency)}` : `${delta > 0 ? '+' : '−'}${formatMoney(Math.abs(delta), moneyCurrency)}`)
                    : signed(delta);
                return `<div class="meli-metric"><span>${escapeHtml(label)}</span><div><strong>${moneyCurrency ? formatMoney(value, moneyCurrency) : formatNumber(value)}</strong><small class="${Number(delta) > 0 ? 'up' : Number(delta) < 0 ? 'down' : ''}">${escapeHtml(deltaText)}</small></div></div>`;
            };
            const selected = state.selectedIds.has(record.listingId);
            const needsAction = ['improve', 'declining', 'deactivateReview'].includes(analysis.code);
            let researchEvidence = null;
            try { researchEvidence = validateResearchEvidence(record.researchEvidence); }
            catch { /* Invalid local evidence is not rendered or reused. */ }
            const strongestKeyword = researchEvidence?.keywords?.[0] || null;
            const researchSummary = strongestKeyword ? `<div class="meli-research-card-summary"><b>${escapeHtml(strongestKeyword.keyword)}</b><span>${escapeHtml(t('researchSearches30d'))}: ${escapeHtml(formatNumber(strongestKeyword.searches30d))} · ${escapeHtml(t('researchSearchResults'))}: ${escapeHtml(formatNumber(strongestKeyword.searchResults))}</span></div>` : '';
            return `<article class="meli-listing-card ${selected ? 'is-selected' : ''}" data-listing-card="${escapeHtml(record.listingId)}">
                <header class="meli-listing-card-head">
                    <label class="meli-card-select"><input class="meli-check" data-row-select="${escapeHtml(record.listingId)}" type="checkbox" aria-label="${escapeHtml(`${t('listing')}: ${record.meta?.title || record.listingId}`)}" ${selected ? 'checked' : ''}><span></span></label>
                    ${record.meta?.imageUrl ? `<img class="meli-card-thumb" src="${escapeHtml(record.meta.imageUrl)}" alt="">` : `<div class="meli-card-thumb is-empty">${iconSvg('analysis')}</div>`}
                    <div class="meli-card-identity"><h3>${escapeHtml(record.meta?.title || record.listingId)}</h3><div class="meli-card-meta"><span>ID ${escapeHtml(record.listingId)}</span><i></i><span>${escapeHtml(record.meta?.sku || 'SKU —')}</span></div><div class="meli-card-status">${escapeHtml(record.meta?.statusLabel || '')}</div></div>
                    <div class="meli-card-health"><button class="meli-pill ${escapeHtml(analysis.tone)} meli-health-trigger" data-history="${escapeHtml(record.listingId)}" type="button">${escapeHtml(lifecycleLabel(analysis.lifecycle))}</button><b class="meli-score-copy"><span>${escapeHtml(analysisScoreLabel(analysis))}</span><strong>${escapeHtml(Number.isFinite(analysis.score) ? t('scoreOutOf', { score: formatNumber(analysis.score) }) : '—')}</strong></b><small class="meli-card-confidence">${escapeHtml(analysisConfidenceLabel(analysis))}: ${escapeHtml(confidenceLabel(analysis.confidenceBand))}</small><div class="meli-confidence-track" data-performance-score><i style="width:${clamp(analysis.score, 0, 100)}%"></i></div></div>
                </header>
                <div class="meli-metrics-strip">
                    ${metric(t('visits30dLabel'), latest.visits, deltas.visits)}
                    ${metric(t('favorites30dLabel'), latest.favorites, deltas.favorites)}
                    ${metric(t('salesAllTimeLabel'), latest.sales, deltas.sales)}
                    ${metric(t('revenueAllTimeLabel'), latest.revenue, deltas.revenue, currency)}
                    ${metric(t('renewalsAllTimeLabel'), latest.renewals, deltas.renewals)}
                    ${metric(t('stock'), latest.stock, null)}
                </div>
                <div class="meli-card-insight"><div class="meli-insight-icon" data-lifecycle="${escapeHtml(analysis.lifecycle)}">${iconSvg('activity')}</div><div><b>${escapeHtml(assessmentLabel(analysis))}</b><p>${escapeHtml(analysisReason(record))}</p>${researchSummary}</div><span>${escapeHtml(reviewLine)}</span></div>
                <footer class="meli-listing-card-foot"><button class="meli-card-action ${needsAction ? 'primary' : ''}" data-proposal="${escapeHtml(record.listingId)}" type="button">${iconSvg('spark')}<span>${escapeHtml(t('editProposal'))}</span></button>${researchEvidence ? `<button class="meli-card-action" data-research-evidence="${escapeHtml(record.listingId)}" type="button">${iconSvg('analysis')}<span>${escapeHtml(t('researchEvidenceTitle'))}</span></button>` : ''}<button class="meli-card-action" data-history="${escapeHtml(record.listingId)}" type="button">${iconSvg('history')}<span>${escapeHtml(t('details'))}</span></button><a class="meli-card-action" href="${escapeHtml(record.meta?.editUrl || '#')}" target="_blank" rel="noopener">${iconSvg('external')}<span>${escapeHtml(t('openEtsy'))}</span></a></footer>
            </article>`;
        },
        openProposal(record) {
            const current = captureEditableFieldsFromRecord(record);
            const researchSuggestion = researchSuggestionForRecord(record);
            const proposal = record.proposal || researchSuggestion || { action: record.analysis?.code === 'deactivateReview' ? 'DEACTIVATE_REVIEW' : 'UPDATE', ...current, reason: analysisReason(record) };
            const selectedFields = record.proposal || researchSuggestion ? proposalFields(proposal) : [];
            const has = (key) => Object.prototype.hasOwnProperty.call(proposal, key);
            const values = {
                title: has('title') ? proposal.title : current.title,
                description: has('description') ? proposal.description : current.description,
                tags: has('tags') && Array.isArray(proposal.tags) ? proposal.tags : current.tags,
                materials: has('materials') && Array.isArray(proposal.materials) ? proposal.materials : current.materials,
            };
            const field = (key, label, value, options = {}) => `<div class="meli-field ${options.full ? 'full' : ''} ${selectedFields.includes(key) ? 'is-selected' : ''}" data-edit-field="${key}"><div class="meli-field-head"><span>${escapeHtml(label)}</span><label class="meli-field-toggle"><input data-proposal-field="${key}" type="checkbox" ${selectedFields.includes(key) ? 'checked' : ''}> ${escapeHtml(t('changeField'))}</label></div><textarea class="meli-textarea" ${options.style ? `style="${options.style}"` : ''} ${options.maxlength ? `maxlength="${options.maxlength}"` : ''} data-proposal-input="${key}" data-proposal-${key}>${escapeHtml(value)}</textarea>${options.help ? `<small>${escapeHtml(options.help)}</small>` : ''}</div>`;
            const analysis = record.analysis || record.health?.result || analyseRecord(record, state.records);
            const overlap = activeObservedImprovement(record);
            const researchNeedsEditor = Boolean(researchSuggestion && !record.editor?.capturedAt);
            let proposalEvidence = null;
            try { proposalEvidence = validateResearchEvidence(proposal.researchEvidence); }
            catch { /* Invalid local evidence is omitted and cannot be copied into a proposal. */ }
            const context = `<div class="meli-health-context"><div><span class="meli-pill ${escapeHtml(analysis.tone)}">${escapeHtml(lifecycleLabel(analysis.lifecycle))}</span> <b>${escapeHtml(assessmentLabel(analysis))}</b></div><div class="meli-meta">${escapeHtml(analysisScoreLabel(analysis))}: ${escapeHtml(Number.isFinite(analysis.score) ? t('scoreOutOf', { score: formatNumber(analysis.score) }) : '—')} · ${escapeHtml(analysisConfidenceLabel(analysis))}: ${formatNumber(analysis.confidence)}/100 ${escapeHtml(confidenceLabel(analysis.confidenceBand))}</div><div class="meli-meta">${escapeHtml(t('whyRecommendation'))} ${escapeHtml(analysisReason(record))}</div></div>${proposalEvidence ? this.researchEvidenceMarkup(proposalEvidence, 5) : ''}`;
            const overlapMarkup = overlap ? `<div class="meli-conflict-warning" data-experiment-conflict role="alert"><strong>${escapeHtml(t('experimentOverlapTitle'))}</strong><p>${escapeHtml(t('experimentOverlapCopy'))}</p><label class="meli-field-toggle" style="margin-top:10px"><input data-experiment-conflict-confirm type="checkbox" ${proposal.experimentOverlapAcceptedAt ? 'checked' : ''}> ${escapeHtml(t('acknowledgeOverlap'))}</label></div>` : '';
            const captureWarning = researchNeedsEditor ? `<div class="meli-feedback" style="color:var(--meli-warning)">${escapeHtml(t('researchNeedsEditor'))}</div>` : '';
            const body = `${context}${overlapMarkup}${captureWarning}<div class="meli-form-card"><div class="meli-form-grid"><label class="meli-field full"><span class="meli-field-head">${escapeHtml(t('actionLabel'))}</span><select class="meli-select" data-proposal-action><option value="UPDATE" ${proposal.action === 'UPDATE' ? 'selected' : ''}>${escapeHtml(t('actionUpdate'))}</option><option value="DEACTIVATE_REVIEW" ${proposal.action === 'DEACTIVATE_REVIEW' ? 'selected' : ''}>${escapeHtml(t('actionDeactivate'))}</option><option value="SKIP" ${proposal.action === 'SKIP' ? 'selected' : ''}>${escapeHtml(t('actionSkip'))}</option></select></label>${field('title', t('title'), values.title || '', { full: true, style: 'min-height:72px', maxlength: 140 })}${field('description', t('description'), values.description || '', { full: true })}${field('tags', t('tags'), (values.tags || []).join(', '), { help: t('tagsHelp') })}${field('materials', t('materials'), (values.materials || []).join(', '), { help: t('materialsHelp') })}<label class="meli-field full"><span class="meli-field-head">${escapeHtml(t('reason'))}</span><textarea class="meli-textarea" style="min-height:76px" data-proposal-reason>${escapeHtml(proposal.reason || '')}</textarea></label></div></div><div class="meli-feedback" data-proposal-feedback role="alert" aria-live="polite"></div>`;
            const editorAction = researchNeedsEditor && record.meta?.editUrl ? `<a class="meli-btn" href="${escapeHtml(record.meta.editUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('openEtsy'))}</a>` : '';
            const footer = `<div class="meli-modal-foot">${editorAction}<button class="meli-btn" data-proposal-cancel type="button">${escapeHtml(t('cancel'))}</button><button class="meli-btn primary" data-proposal-save type="button" ${researchNeedsEditor ? 'disabled' : ''}>${escapeHtml(t('saveProposal'))}</button></div>`;
            this.openModal(t('proposalTitle'), body, { small: true, footer });
            const modal = state.modal;
            const syncFieldState = (checkbox) => checkbox.closest('[data-edit-field]')?.classList.toggle('is-selected', checkbox.checked);
            modal.querySelectorAll('[data-proposal-field]').forEach((checkbox) => {
                syncFieldState(checkbox);
                checkbox.addEventListener('change', () => syncFieldState(checkbox));
            });
            const syncActionState = () => {
                const updating = modal.querySelector('[data-proposal-action]').value === 'UPDATE';
                modal.querySelectorAll('[data-edit-field]').forEach((wrapper) => {
                    wrapper.classList.toggle('is-disabled', !updating);
                    wrapper.querySelectorAll('textarea,input').forEach((control) => { control.disabled = !updating; });
                });
            };
            modal.querySelector('[data-proposal-action]').addEventListener('change', syncActionState);
            syncActionState();
            modal.querySelectorAll('[data-proposal-input]').forEach((input) => input.addEventListener('input', () => {
                const checkbox = modal.querySelector(`[data-proposal-field="${input.dataset.proposalInput}"]`);
                if (!checkbox) return;
                checkbox.checked = true;
                syncFieldState(checkbox);
            }));
            modal.querySelector('[data-proposal-cancel]').addEventListener('click', () => this.closeModal());
            modal.querySelector('[data-proposal-save]').addEventListener('click', async () => {
                const action = modal.querySelector('[data-proposal-action]').value;
                const fields = action === 'UPDATE' ? Array.from(modal.querySelectorAll('[data-proposal-field]:checked')).map((input) => input.dataset.proposalField) : [];
                const feedback = modal.querySelector('[data-proposal-feedback]');
                if (action === 'UPDATE' && !fields.length) { feedback.textContent = t('selectChangeField'); return; }
                if (overlap && !modal.querySelector('[data-experiment-conflict-confirm]')?.checked) { feedback.textContent = t('experimentOverlapRequired'); return; }
                const title = normalizeSpace(modal.querySelector('[data-proposal-input="title"]').value);
                const tags = uniqueStrings(modal.querySelector('[data-proposal-input="tags"]').value.split(','));
                const materials = uniqueStrings(modal.querySelector('[data-proposal-input="materials"]').value.split(','));
                if (fields.includes('title') && (!title || title.length > 140)) { feedback.textContent = t('invalidTitle'); return; }
                if (fields.includes('tags') && (tags.length > 13 || tags.some((tag) => tag.length > 20))) { feedback.textContent = t('invalidTags'); return; }
                const saved = { action, fields, reason: modal.querySelector('[data-proposal-reason]').value.trim(), source: String(proposal.source || 'manual') };
                if (proposal.requestId) saved.requestId = String(proposal.requestId);
                if (proposal.reference) saved.reference = String(proposal.reference);
                if (proposalEvidence) saved.researchEvidence = proposalEvidence;
                saved.acknowledgeExperimentOverlap = Boolean(overlap && modal.querySelector('[data-experiment-conflict-confirm]')?.checked);
                if (fields.includes('title')) saved.title = title;
                if (fields.includes('description')) saved.description = modal.querySelector('[data-proposal-input="description"]').value.trim();
                if (fields.includes('tags')) saved.tags = tags;
                if (fields.includes('materials')) saved.materials = materials;
                try {
                    await Store.saveProposal(record.listingId, saved);
                    state.records = await Store.listRecords();
                    if (state.modal === modal) this.closeModal();
                    this.setStatus('proposalSaved', 'ready');
                    this.render(true);
                } catch (error) {
                    feedback.textContent = t(error?.code === 'PROPOSAL_QUEUE_LOCKED' ? 'proposalQueueLocked' : 'storageWriteFailed');
                }
            });
        },
        historyChart(history, metric, label, moneyCurrency = '') {
            const model = buildHistoryChartModel(history, metric);
            const valueLabel = (value, currency = '') => moneyCurrency
                ? (normalizeSpace(currency) ? formatMoney(value, currency) : `${formatNumber(value)} (?)`)
                : formatNumber(value);
            const qualityNotes = [];
            if (model.qualityCounts?.approximate) qualityNotes.push(`${model.qualityCounts.approximate} ${t('chartApproximate')}`);
            if (model.qualityCounts?.legacy) qualityNotes.push(`${model.qualityCounts.legacy} ${t('chartLegacy')}`);
            if (model.qualityCounts?.stale) qualityNotes.push(t('chartStaleExcluded', { count: model.qualityCounts.stale }));
            if (model.qualityCounts?.missing) qualityNotes.push(t('chartMissingExcluded', { count: model.qualityCounts.missing }));
            if (model.excludedCurrencyCount) qualityNotes.push(t('chartCurrencyExcluded', { count: model.excludedCurrencyCount }));
            const qualityMarkup = qualityNotes.length ? `<small class="meli-chart-quality">${escapeHtml(qualityNotes.join(' · '))}</small>` : '';
            if (model.points.length < 2) return `<article class="meli-chart" data-history-chart="${escapeHtml(metric)}"><div class="meli-chart-head"><b>${escapeHtml(label)}</b><span>—</span></div><div class="meli-chart-empty">${escapeHtml(t('noChartData'))}</div>${qualityMarkup}</article>`;
            const lineMarkup = model.segments.filter((segment) => segment.length > 1).map((segment) => {
                const quality = segment.every((point) => point.decisionGrade) ? 'exact' : 'limited';
                return `<polyline class="meli-chart-line" data-quality="${quality}" points="${segment.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')}"></polyline>`;
            }).join('');
            const pointsMarkup = model.points.map((point) => {
                const flags = point.quality === 'approximate' ? [t('chartApproximate')] : point.quality === 'legacy' ? [t('chartLegacy')] : [];
                const formatted = valueLabel(point.value, point.currency);
                const shown = point.quality === 'approximate' ? `≈${formatted}` : formatted;
                const title = [formatDate(point.at), shown, ...flags].join(' · ');
                return `<circle class="meli-chart-point" data-quality="${escapeHtml(point.quality)}" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="3"><title>${escapeHtml(title)}</title></circle>`;
            }).join('');
            const first = model.points[0]; const last = model.points.at(-1);
            const aria = `${label}: ${valueLabel(first.value, first.currency)} → ${valueLabel(last.value, last.currency)}`;
            const rangeLabel = moneyCurrency && !model.comparableCurrencies
                ? `${valueLabel(model.min, model.activeCurrency)} – ${valueLabel(model.max, model.activeCurrency)} · ${model.currencies.join(' / ')} · ${t('chartMixedCurrencies')}`
                : `${valueLabel(model.min, model.activeCurrency || model.currencies[0] || moneyCurrency)} – ${valueLabel(model.max, model.activeCurrency || model.currencies[0] || moneyCurrency)}`;
            return `<article class="meli-chart" data-history-chart="${escapeHtml(metric)}" data-tone="${model.tone}"><div class="meli-chart-head"><b>${escapeHtml(label)}</b><span>${escapeHtml(rangeLabel)}</span></div><svg viewBox="0 0 ${model.width} ${model.height}" role="img" aria-label="${escapeHtml(aria)}"><title>${escapeHtml(aria)}</title><desc>${escapeHtml(`${formatDate(first.at)} – ${formatDate(last.at)}`)}</desc><line class="meli-chart-gridline" x1="10" y1="10" x2="310" y2="10"></line><line class="meli-chart-gridline" x1="10" y1="82" x2="310" y2="82"></line>${lineMarkup}${pointsMarkup}</svg>${qualityMarkup}</article>`;
        },
        experimentTimeline(record) {
            const events = buildExperimentTimeline(record);
            if (!events.length) return '';
            return `<section class="meli-detail-card" data-experiment-timeline><h3>${escapeHtml(t('experimentTimeline'))}</h3><div class="meli-experiment-timeline">${events.map((event) => {
                const effect = Number.isFinite(event.experiment?.effectPercent) ? `${event.experiment.effectPercent > 0 ? '+' : ''}${event.experiment.effectPercent}%` : '';
                const detail = event.type === 'planned' ? (event.improvement.fields || []).map((field) => t(field)).join(', ') : event.type === 'due' ? event.experiment.primaryMetric || '—' : ['winner','underperformed','inconclusive','contaminated','stopped'].includes(event.type) ? `${experimentStateLabel(event.experiment)}${effect ? ` · ${effect}` : ''}` : '';
                return `<article class="meli-experiment-event" data-type="${escapeHtml(event.type)}"><i class="meli-experiment-dot"></i><strong>${escapeHtml(t(event.key))}</strong><time datetime="${escapeHtml(event.at)}">${escapeHtml(formatDate(event.at))}</time>${detail ? `<span>${escapeHtml(detail)}</span>` : ''}</article>`;
            }).join('')}</div></section>`;
        },
        aiComparisonView() {
            const comparisons = [];
            collectedAnalysisRecords().forEach((record) => {
                const improvements = (record.improvements || []).filter((item) => item?.action === 'UPDATE' && item?.source === 'ai-import');
                improvements.slice(-3).forEach((improvement) => comparisons.push({ record, improvement }));
                if (!improvements.length && record.proposal?.source === 'ai-import' && record.proposal?.improvementId) {
                    const improvement = (record.improvements || []).find((item) => item.id === record.proposal.improvementId);
                    if (improvement) comparisons.push({ record, improvement });
                }
            });
            comparisons.sort((left, right) => String(right.improvement.at).localeCompare(String(left.improvement.at)));
            const formatValue = (value, missing = false) => {
                if (missing) return t('valueNotCaptured');
                if (Array.isArray(value)) return value.length ? value.join('\n') : '[]';
                return value === null || value === undefined ? '—' : String(value) || '—';
            };
            const cards = comparisons.slice(0, 12).map(({ record, improvement }) => {
                const fields = Array.isArray(improvement.fields) ? improvement.fields : [];
                const applied = improvement.status === 'published' && improvement.after && typeof improvement.after === 'object';
                const fieldRows = fields.map((field) => {
                    const missingBefore = field !== 'title' && !improvement.baselineCapturedAt;
                    return `<div class="meli-diff-field" data-diff-field="${escapeHtml(field)}"><strong>${escapeHtml(t(field))}</strong><div class="meli-diff-columns"><div class="meli-diff-value"><b>${escapeHtml(t('beforeValue'))}</b><pre>${escapeHtml(formatValue(improvement.before?.[field], missingBefore))}</pre></div><div class="meli-diff-value is-proposed"><b>${escapeHtml(t('proposedValue'))}</b><pre>${escapeHtml(formatValue(improvement.proposed?.[field]))}</pre></div><div class="meli-diff-value"><b>${escapeHtml(t('appliedValue'))}</b><pre>${escapeHtml(applied ? formatValue(improvement.after?.[field]) : t('timelineNotApplied'))}</pre></div></div></div>`;
                }).join('');
                return `<article class="meli-diff-card" data-ai-comparison="${escapeHtml(record.listingId)}"><div class="meli-diff-head"><div><strong>${escapeHtml(record.meta?.title || record.listingId)}</strong><span>ID ${escapeHtml(record.listingId)} · ${escapeHtml(formatDate(improvement.at))}</span></div><span class="meli-pill ${applied ? 'success' : 'balanced'}">${escapeHtml(applied ? t('timelinePublished') : experimentStateLabel(improvement.experiment))}</span></div><div class="meli-diff-fields">${fieldRows}</div></article>`;
            }).join('');
            return `<article class="meli-card"><div class="meli-card-head"><strong>${escapeHtml(t('aiComparison'))}</strong></div><div class="meli-card-body"><div class="meli-ai-comparisons">${cards || `<div class="meli-empty">${escapeHtml(t('aiComparisonEmpty'))}</div>`}</div></div></article>`;
        },
        openHistory(record) {
            const history = Array.isArray(record.history) ? [...record.history].reverse() : [];
            const improvements = Array.isArray(record.improvements) ? [...record.improvements].reverse() : [];
            const analysis = record.analysis || record.health?.result || analyseRecord(record, state.records);
            const currency = normalizeSpace(record.history?.at(-1)?.currency) || '$';
            const evidence = Array.isArray(analysis.evidence) ? analysis.evidence : [];
            const components = analysis.confidenceComponents || {};
            const componentKeys = ['dataQuality', 'historyDepth', 'trafficSample', 'cohortStrength', 'freshness', 'dataIntegrity'];
            const extraEvidence = evidence.slice(3);
            const experiment = analysis.experiment;
            const basisKey = analysis.scoreBasis === 'insufficient' || !Number.isFinite(analysis.score)
                ? 'insufficientBasis'
                : analysis.assessmentMode === 'snapshot' ? 'snapshotBasis'
                    : analysis.assessmentMode === 'longitudinal' ? 'longitudinalBasis' : 'insufficientBasis';
            const capKey = analysis.assessmentMode === 'snapshot' ? 'snapshotConfidenceLimited' : 'confidenceLimited';
            const summary = `<section class="meli-health-summary"><div><span class="meli-pill ${escapeHtml(analysis.tone)}">${escapeHtml(lifecycleLabel(analysis.lifecycle))}</span><strong>${escapeHtml(analysisScoreLabel(analysis))}: ${escapeHtml(Number.isFinite(analysis.score) ? t('scoreOutOf', { score: formatNumber(analysis.score) }) : '—')}</strong></div><h3>${escapeHtml(assessmentLabel(analysis))}</h3><div class="meli-meta">${escapeHtml(analysisConfidenceLabel(analysis))}: ${formatNumber(analysis.confidence)}/100 · ${escapeHtml(confidenceLabel(analysis.confidenceBand))}</div><div class="meli-meta">${escapeHtml(t(basisKey))}</div><div class="meli-meta">${escapeHtml(t('nextReview'))}: ${escapeHtml(formatDate(analysis.nextReviewAt))}</div>${analysis.confidenceCaps?.length ? `<div class="meli-health-cap">${escapeHtml(t(capKey))}</div>` : ''}</section>`;
            const seasonality = normalizeSeasonality(record.meta?.seasonality, record.meta?.seasonal);
            const listingType = normalizeListingType(record.meta?.listingType);
            const option = (value, label, selected) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${escapeHtml(t(label))}</option>`;
            const contextCard = `<section class="meli-detail-card"><h3>${escapeHtml(t('listingContext'))}</h3><div class="meli-form-grid"><label class="meli-field"><span class="meli-field-head">${escapeHtml(t('seasonality'))}</span><select class="meli-select" data-seasonality>${option('unknown', 'contextUnknown', seasonality)}${option('non-seasonal', 'contextNonSeasonal', seasonality)}${option('seasonal', 'contextSeasonal', seasonality)}</select></label><label class="meli-field"><span class="meli-field-head">${escapeHtml(t('listingType'))}</span><select class="meli-select" data-listing-type>${option('unknown', 'contextUnknown', listingType)}${option('digital', 'contextDigital', listingType)}${option('physical', 'contextPhysical', listingType)}</select></label></div><p class="meli-meta">${escapeHtml(t('sourceTimeUnknown'))}</p><div class="meli-actions"><button class="meli-btn" data-save-listing-context type="button">${escapeHtml(t('saveContext'))}</button></div><div class="meli-feedback" data-listing-context-feedback role="status" aria-live="polite"></div></section>`;
            const evidenceCard = `<section class="meli-detail-card"><h3>${escapeHtml(t('evidence'))}</h3><ul class="meli-evidence">${evidence.slice(0, 3).map((item) => `<li>${escapeHtml(t(item.key, item.params))}</li>`).join('')}</ul>${extraEvidence.length ? `<div data-extra-evidence hidden><ul class="meli-evidence">${extraEvidence.map((item) => `<li>${escapeHtml(t(item.key, item.params))}</li>`).join('')}</ul></div><button class="meli-mini" data-show-evidence type="button">${escapeHtml(t('showAllEvidence', { count: evidence.length }))}</button>` : ''}</section>`;
            const confidenceCard = `<section class="meli-detail-card"><h3>${escapeHtml(t('confidenceDetails'))}</h3><div class="meli-confidence-list">${componentKeys.map((key) => `<div class="meli-confidence-row"><span>${escapeHtml(t(key))}</span><div><i style="width:${clamp(components[key], 0, 100)}%"></i></div><b>${formatNumber(components[key])}</b></div>`).join('')}</div></section>`;
            const interval = experiment?.current?.rateRatioInterval;
            const effectText = Number.isFinite(experiment?.effectPercent)
                ? `${experiment.effectPercent > 0 ? '+' : ''}${experiment.effectPercent}%`
                : experiment?.effectKind === 'from-zero' ? t('effectFromZero', { amount: formatNumber(experiment.effectAbsolute) }) : '—';
            const intervalText = interval ? `${t('exactInterval', { confidence: Math.round(Number(interval.confidenceLevel) * 100) })}: ${Number(interval.low).toFixed(3)}–${interval.highOpen ? '∞' : Number(interval.high).toFixed(3)}` : '';
            const experimentCard = experiment ? `<section class="meli-detail-card"><h3>${escapeHtml(t('experiment'))}</h3><div class="meli-history-metrics"><span>${escapeHtml(t('experimentState'))}: <b>${escapeHtml(experimentStateLabel(experiment))}</b></span><span>${escapeHtml(t('primaryMetric'))}: <b>${escapeHtml(experiment.primaryMetric || '—')}</b></span><span>${escapeHtml(t('adjustedEffect'))}: <b>${escapeHtml(effectText)}</b></span>${intervalText ? `<span>${escapeHtml(intervalText)}</span>` : ''}</div></section>` : '';
            const safeguardCard = ['DEACTIVATION_REVIEW', 'DORMANT'].includes(analysis.lifecycle) && analysis.safeguards?.length ? `<section class="meli-detail-card"><h3>${escapeHtml(t('deactivateReview'))}</h3><ul class="meli-safeguards">${analysis.safeguards.map((item) => `<li data-passed="${item.passed}"><span>${item.passed ? '✓' : '—'}</span>${escapeHtml(t(item.key))}</li>`).join('')}</ul></section>` : '';
            const charts = `<section class="meli-detail-card"><h3>${escapeHtml(t('historyCharts'))}</h3><div class="meli-chart-grid">${this.historyChart(record.history, 'visits', t('visits30dLabel'))}${this.historyChart(record.history, 'favorites', t('favorites30dLabel'))}${this.historyChart(record.history, 'sales', t('salesAllTimeLabel'))}${this.historyChart(record.history, 'revenue', t('revenueAllTimeLabel'), currency)}${this.historyChart(record.history, 'renewals', t('renewalsAllTimeLabel'))}</div></section>`;
            const experimentTimeline = this.experimentTimeline(record);
            const timeline = `<section class="meli-detail-card"><h3>${escapeHtml(t('historyTitle'))}</h3><div class="meli-history">${history.length ? history.map((item) => `<article class="meli-history-item"><b>${escapeHtml(formatDate(item.at))}</b><div class="meli-history-metrics"><span>${t('visits30dLabel')}: ${formatNumber(item.visits)}</span><span>${t('favorites30dLabel')}: ${formatNumber(item.favorites)}</span><span>${t('salesAllTimeLabel')}: ${formatNumber(item.sales)}</span><span>${t('revenueAllTimeLabel')}: ${formatMoney(item.revenue, normalizeSpace(item.currency) || currency)}</span><span>${t('renewalsAllTimeLabel')}: ${formatNumber(item.renewals)}</span></div></article>`).join('') : `<div class="meli-empty">${escapeHtml(t('noHistory'))}</div>`}${improvements.map((item) => `<article class="meli-history-item"><span class="meli-pill warning">${escapeHtml(item.experiment ? experimentStateLabel(item.experiment) : item.status || 'planned')}</span> <b>${escapeHtml(formatDate(item.at))}</b><div class="meli-meta">${escapeHtml(item.note || item.action || '')}</div></article>`).join('')}</div></section>`;
            this.openModal(`${t('healthAndHistory')} · ${record.listingId}`, `<div class="meli-health-detail">${summary}${contextCard}${evidenceCard}${confidenceCard}${experimentCard}${safeguardCard}${charts}${experimentTimeline}${timeline}</div>`, { small: true });
            const modal = state.modal;
            modal?.querySelector('[data-show-evidence]')?.addEventListener('click', (event) => {
                const extra = modal.querySelector('[data-extra-evidence]'); if (!extra) return;
                extra.hidden = false; event.currentTarget.remove();
            });
            modal?.querySelector('[data-save-listing-context]')?.addEventListener('click', async (event) => {
                const button = event.currentTarget; const feedback = modal.querySelector('[data-listing-context-feedback]');
                button.disabled = true;
                try {
                    await Store.saveListingContext(record.listingId, {
                        seasonality: modal.querySelector('[data-seasonality]')?.value,
                        listingType: modal.querySelector('[data-listing-type]')?.value,
                    });
                    await refreshRecords({ persist: true, render: false });
                    const updated = state.records.find((item) => String(item.listingId) === String(record.listingId));
                    if (state.modal === modal) { this.closeModal(); this.render(true); if (updated) this.openHistory(updated); }
                    this.toast(t('contextSaved'), 'success');
                } catch (error) {
                    button.disabled = false; if (feedback) feedback.textContent = normalizeSpace(error?.message || error);
                }
            });
        },
        openCollectionErrorReport() {
            const reports = state.collection?.failureReports || [];
            const reportId = String(state.collection?.error?.reportId || '');
            const report = reports.find((item) => item.id === reportId) || reports.at(-1);
            if (!report) return;
            const fields = [
                ['reportTime', formatDate(report.at)], ['reportPhase', report.phase],
                ['reportExpectedPage', `${report.expectedPage} / ${report.totalPages}`], ['reportObservedPage', report.observedPage || '—'],
                ['reportAttempts', `${report.attempts} / ${report.maxAttempts}`], ['collectionListings', report.uniqueListings],
            ];
            const body = `<p class="meli-note">${escapeHtml(t('reportNoSensitiveData'))}</p><div class="meli-report-grid">${fields.map(([key, value]) => `<div><span>${escapeHtml(t(key))}</span><b>${escapeHtml(value)}</b></div>`).join('')}</div><pre class="meli-report-json" data-error-json>${escapeHtml(JSON.stringify(report, null, 2))}</pre>`;
            const footer = `<div class="meli-modal-foot"><button class="meli-btn" data-copy-error-report type="button">${escapeHtml(t('copyErrorReport'))}</button><button class="meli-btn primary" data-modal-close-secondary type="button">${escapeHtml(t('close'))}</button></div>`;
            this.openModal(t('errorReportTitle'), body, { small: true, footer });
            state.modal?.querySelector('[data-copy-error-report]')?.addEventListener('click', async () => {
                await copyText(JSON.stringify(report, null, 2));
                this.toast(t('reportCopied'), 'success');
            });
            state.modal?.querySelector('[data-modal-close-secondary]')?.addEventListener('click', () => this.closeModal());
        },
        openAi() {
            state.activeView = 'ai';
            this.render(true);
        },
        openBackupImport(initialFile = null) {
            const body = `<div class="meli-import-zone"><p class="meli-meta">${escapeHtml(t('backupImportIntro'))}</p><label class="meli-field"><span class="meli-field-head">${escapeHtml(t('chooseBackup'))}</span><input data-backup-modal-file type="file" accept="application/json,.json"></label></div><div class="meli-backup-preview" data-backup-preview hidden></div><div class="meli-feedback" data-backup-feedback role="alert" aria-live="polite"></div>`;
            const footer = `<div class="meli-modal-foot"><button class="meli-btn" data-backup-cancel type="button">${escapeHtml(t('cancel'))}</button><button class="meli-btn primary" data-backup-import-confirm type="button" disabled>${escapeHtml(t('backupImportAction'))}</button></div>`;
            this.openModal(t('backupImportTitle'), body, { small: true, footer });
            const modal = state.modal;
            const input = modal.querySelector('[data-backup-modal-file]');
            const preview = modal.querySelector('[data-backup-preview]');
            const feedback = modal.querySelector('[data-backup-feedback]');
            const confirmButton = modal.querySelector('[data-backup-import-confirm]');
            let parsed = null;
            const inspectFile = async (file) => {
                parsed = null; confirmButton.disabled = true; preview.hidden = true; feedback.textContent = '';
                if (!file) return;
                try {
                    if (file.size > MAX_BACKUP_BYTES) throw new Error(t('backupTooLarge'));
                    const raw = JSON.parse(await file.text());
                    const normalized = normalizeBackupDocument(raw);
                    parsed = raw;
                    preview.innerHTML = `<strong>${escapeHtml(t('backupPreview', { records: normalized.records.length, presets: normalized.filterPresets.length }))}</strong>${normalized.queueSkipped ? `<p class="meli-meta">${escapeHtml(t('backupQueueSkipped'))}</p>` : ''}`;
                    preview.hidden = false; confirmButton.disabled = false;
                } catch (error) {
                    feedback.textContent = t('backupInvalid', { message: normalizeSpace(error?.message || error).slice(0, 240) });
                }
            };
            input.addEventListener('change', () => { void inspectFile(input.files?.[0]); });
            modal.querySelector('[data-backup-cancel]').addEventListener('click', () => this.closeModal());
            confirmButton.addEventListener('click', async () => {
                if (!parsed) return;
                confirmButton.disabled = true;
                try {
                    const result = await importBackupDocument(parsed);
                    if (state.modal === modal) this.closeModal();
                    this.setStatus('backupImported', 'ready', result);
                    this.toast(t('backupImported', result), 'success');
                    this.render(true);
                } catch (error) {
                    if (state.modal === modal) {
                        confirmButton.disabled = false;
                        feedback.textContent = t('backupInvalid', { message: normalizeSpace(error?.message || error).slice(0, 240) });
                    }
                }
            });
            if (initialFile) void inspectFile(initialFile);
        },
        openFeedback() {
            const body = `<div class="meli-feedback-form" data-feedback-dialog><p class="meli-note" data-feedback-privacy>${escapeHtml(t('feedbackIntro'))}</p><label class="meli-field"><span class="meli-field-head">${escapeHtml(t('feedbackCategory'))}</span><select class="meli-select" data-feedback-category><option value="bug">${escapeHtml(t('feedbackBug'))}</option><option value="idea">${escapeHtml(t('feedbackIdea'))}</option><option value="usability">${escapeHtml(t('feedbackUsability'))}</option><option value="analysis">${escapeHtml(t('feedbackAnalysis'))}</option></select></label><label class="meli-field"><span class="meli-field-head">${escapeHtml(t('feedbackRating'))}</span><select class="meli-select" data-feedback-rating>${[5,4,3,2,1].map((value) => `<option value="${value}">${value} / 5</option>`).join('')}</select></label><label class="meli-field"><span class="meli-field-head">${escapeHtml(t('feedbackNote'))}</span><textarea class="meli-textarea" data-feedback-message minlength="10" maxlength="800"></textarea></label><label class="meli-field-toggle"><input data-feedback-diagnostics type="checkbox" checked> ${escapeHtml(t('feedbackDiagnostics'))}</label><div class="meli-feedback" data-feedback-error role="alert" aria-live="polite"></div></div>`;
            const footer = `<div class="meli-modal-foot"><button class="meli-btn" data-feedback-cancel type="button">${escapeHtml(t('cancel'))}</button><button class="meli-btn primary" data-feedback-submit type="button">${escapeHtml(t('feedbackSend'))}</button></div>`;
            this.openModal(t('feedbackTitle'), body, { small: true, footer });
            const modal = state.modal;
            modal.querySelector('[data-feedback-cancel]').addEventListener('click', () => this.closeModal());
            const submitButton = modal.querySelector('[data-feedback-submit]');
            let feedbackSaveInFlight = false;
            submitButton.addEventListener('click', async () => {
                if (feedbackSaveInFlight) return;
                const errorNode = modal.querySelector('[data-feedback-error]');
                feedbackSaveInFlight = true;
                submitButton.disabled = true;
                try {
                    await saveUserFeedback({
                        category: modal.querySelector('[data-feedback-category]').value,
                        rating: modal.querySelector('[data-feedback-rating]').value,
                        note: modal.querySelector('[data-feedback-message]').value,
                        includeDiagnostics: modal.querySelector('[data-feedback-diagnostics]').checked,
                    });
                    if (state.modal === modal) this.closeModal();
                    this.toast(t('feedbackSaved'), 'success'); this.render(true);
                } catch (error) {
                    if (state.modal === modal) errorNode.textContent = normalizeSpace(error?.message || error);
                } finally {
                    feedbackSaveInFlight = false;
                    if (state.modal === modal) submitButton.disabled = false;
                }
            });
        },
        openSettings() {
            state.activeView = 'settings';
            this.render(true);
            this.openSettingsModal();
        },
        openSettingsModal() {
            const fields = ['minVisitsToImprove','minVisitsToProtect','minRenewalsToReview','declinePercent'];
            const contracts = HEALTH_THRESHOLD_CONTRACTS;
            const calibration = thresholdCalibration();
            const calibrationCopy = calibration.available ? t('calibrationAvailable', { count: calibration.sampleSize }) : t('calibrationInsufficient');
            const recommended = normalizeHealthThresholds(calibration.values || DEFAULT_SETTINGS);
            const fieldMarkup = fields.map((key) => {
                const contract = contracts[key]; const helpId = `meli-threshold-help-${key}`;
                return `<label class="meli-field"><span class="meli-field-head">${escapeHtml(t(key))}<small>${escapeHtml(t('recommendedValue', { value: recommended[key] }))}</small></span><input class="meli-input" data-setting="${key}" type="number" min="${contract.min}" max="${contract.max}" step="${contract.step}" value="${escapeHtml(state.settings[key])}" aria-invalid="false" aria-describedby="${helpId}"><small id="${helpId}">${escapeHtml(t(contract.help))}</small></label>`;
            }).join('');
            const body = `<section class="meli-calibration"><h3>${escapeHtml(t('thresholdCalibration'))}</h3><p>${escapeHtml(t('thresholdCalibrationCopy'))}</p><p>${escapeHtml(calibrationCopy)}</p><div class="meli-actions"><button class="meli-btn" data-use-calibration type="button" ${calibration.available ? '' : 'disabled'}>${escapeHtml(t('useRecommended'))}</button><button class="meli-btn" data-threshold-defaults type="button">${escapeHtml(t('resetDefaults'))}</button></div></section><div class="meli-form-card"><div class="meli-form-grid">${fieldMarkup}</div></div><div class="meli-threshold-impact" data-threshold-impact aria-live="polite"></div><div class="meli-feedback" data-settings-feedback role="alert" aria-live="polite"></div>`;
            const footer = `<div class="meli-modal-foot"><button class="meli-btn danger" data-clear-data type="button">${escapeHtml(t('clearData'))}</button><span style="flex:1"></span><button class="meli-btn" data-settings-cancel type="button">${escapeHtml(t('cancel'))}</button><button class="meli-btn primary" data-settings-save type="button">${escapeHtml(t('saveSettings'))}</button></div>`;
            this.openModal(t('settingsTitle'), body, { small: true, footer });
            const modal = state.modal;
            const readValues = () => Object.fromEntries(fields.map((key) => [key, Number(modal.querySelector(`[data-setting="${key}"]`).value)]));
            const feedback = modal.querySelector('[data-settings-feedback]');
            const saveButton = modal.querySelector('[data-settings-save]');
            let settingsSaveInFlight = false;
            const writeValues = (values) => fields.forEach((key) => {
                const input = modal.querySelector(`[data-setting="${key}"]`);
                input.value = String(values[key]);
                input.setAttribute('aria-invalid', 'false');
                feedback.textContent = '';
            });
            const updateImpact = () => {
                const values = readValues();
                const { improve, protect } = thresholdImpactCounts(null, values);
                modal.querySelector('[data-threshold-impact]').textContent = t('thresholdImpact', { improve, protect });
            };
            modal.querySelectorAll('[data-setting]').forEach((input) => input.addEventListener('input', () => {
                input.setAttribute('aria-invalid', 'false');
                if (!modal.querySelector('[data-setting][aria-invalid="true"]')) feedback.textContent = '';
                updateImpact();
            }));
            modal.querySelector('[data-use-calibration]').addEventListener('click', () => { writeValues(recommended); updateImpact(); });
            modal.querySelector('[data-threshold-defaults]').addEventListener('click', () => { writeValues(DEFAULT_SETTINGS); updateImpact(); });
            updateImpact();
            modal.querySelector('[data-settings-cancel]').addEventListener('click', () => this.closeModal());
            modal.querySelector('[data-clear-data]').addEventListener('click', async () => {
                if (!confirm(t('clearDataConfirm'))) return;
                if (!await Store.clearAnalysisData()) { this.setStatus('leaseBlocked', 'blocked'); return; }
                this.closeModal();
                this.setStatus('dataCleared', 'ready');
                this.render(true);
            });
            saveButton.addEventListener('click', async () => {
                if (settingsSaveInFlight) return;
                const values = readValues();
                const validation = validateThresholdSettings(values);
                modal.querySelectorAll('[data-setting]').forEach((input) => input.setAttribute('aria-invalid', 'false'));
                if (!validation.valid && validation.reason === 'range') {
                    const input = modal.querySelector(`[data-setting="${validation.field}"]`);
                    input.setAttribute('aria-invalid', 'true');
                    feedback.textContent = t('thresholdInvalidValue', { field: t(validation.field), min: validation.min, max: validation.max });
                    input.focus();
                    return;
                }
                if (!validation.valid) {
                    const input = modal.querySelector('[data-setting="minVisitsToProtect"]');
                    input.setAttribute('aria-invalid', 'true');
                    feedback.textContent = t('thresholdRelationship');
                    input.focus();
                    return;
                }
                feedback.textContent = '';
                settingsSaveInFlight = true;
                saveButton.disabled = true;
                try {
                    if (!await persistThresholdSettings(values)) {
                        feedback.textContent = t(state.settingsSaveError === 'HEALTH_SETTINGS_QUEUE_LOCKED' ? 'thresholdQueueLocked' : 'storageWriteFailed');
                        return;
                    }
                    await refreshRecords({ persist: true, render: false });
                    if (state.modal === modal) this.closeModal();
                    this.setStatus('settingsSaved', 'ready');
                    this.render(true);
                } catch (error) {
                    if (state.modal === modal) feedback.textContent = t('storageWriteFailed');
                } finally {
                    settingsSaveInFlight = false;
                    if (state.modal === modal && modal.isConnected !== false) saveButton.disabled = false;
                }
            });
        },
    };

    function evaluationScopeRecords(records, scopeIds) {
        const allowed = new Set((Array.isArray(scopeIds) ? scopeIds : []).map(String));
        return (Array.isArray(records) ? records : []).filter((record) => record && !record.unsupportedSchema && allowed.has(String(record.listingId)));
    }

    async function refreshRecords(options = {}) {
        const evaluatedAt = options.evaluatedAt || nowIso();
        state.records = await Store.listRecords();
        state.records.forEach((record) => updateExperimentEvaluations(record, evaluatedAt));
        const requestedScopeIds = Array.isArray(options.scopeIds) ? options.scopeIds : null;
        const completedScopeIds = state.collection?.status === 'completed' && state.collection.schema === COLLECTION_SCHEMA_VERSION
            ? state.collection.uniqueIds : null;
        const scopeIds = requestedScopeIds || completedScopeIds || [];
        const cohort = evaluationScopeRecords(state.records, scopeIds);
        const evaluated = cohort.length ? evaluateHealthRecords(cohort, state.settings, evaluatedAt) : new Map();
        const cohortIds = new Set(cohort.map((record) => String(record.listingId)));
        state.records.filter((record) => record && !record.unsupportedSchema && !cohortIds.has(String(record.listingId))).forEach((record) => {
            const isolated = evaluateHealthRecords([record], state.settings, evaluatedAt).get(String(record.listingId));
            if (isolated) evaluated.set(String(record.listingId), isolated);
        });
        const migrationIds = new Set();
        state.records.forEach((record) => {
            const health = evaluated.get(record.listingId);
            if (health) {
                const previous = record.health;
                const currentEnvelope = Number(previous?.schemaVersion) === HEALTH_RESULT_SCHEMA_VERSION
                    && Number(previous?.engineVersion) === HEALTH_ENGINE_VERSION
                    && previous?.policy?.fingerprint === health.policy.fingerprint
                    && JSON.stringify(previous?.input || null) === JSON.stringify(health.input);
                if (!currentEnvelope) migrationIds.add(String(record.listingId));
                record.health = health;
                record.analysis = health.result;
            }
        });
        if (options.persist || migrationIds.size) {
            const persisted = [];
            for (const record of state.records) {
                const shouldWrite = options.persist || migrationIds.has(String(record.listingId));
                persisted.push(record.unsupportedSchema || !shouldWrite ? record : await Store.putRecord(record));
            }
            state.records = persisted;
        }
        if (options.render !== false) UI.render();
        return state.records;
    }

    async function scanCurrentPage(options = {}) {
        if (routeKind() !== 'listings') return [];
        if (!options.silentStatus) UI.setStatus('pageReady', 'scanning');
        const stable = Array.isArray(options.listings) ? null : await ListingPageAdapter.readStable({ requirePagination: false });
        const listings = Array.isArray(options.listings) ? options.listings : (stable?.listings || []);
        if (!listings.length) { UI.setStatus('noCards', 'error'); return []; }
        state.pageListings = listings;
        const saved = await Store.saveSnapshots(listings, options.collectionLeaseToken ? async () => {
            if (state.collectionPauseRequested) {
                const error = new Error('Collection pause requested.'); error.code = 'COLLECTION_PAUSE_REQUESTED'; throw error;
            }
            await CollectionLease.assertOwns(options.collectionLeaseToken);
        } : null);
        if (options.collectionLeaseToken) await CollectionLease.assertOwns(options.collectionLeaseToken);
        if (options.deferEvaluation) state.records = await Store.listRecords();
        else await refreshRecords({ persist: true, evaluatedAt: listings.map((listing) => listing.capturedAt).sort().at(-1) || nowIso() });
        const pageInfo = ListingPageAdapter.pageInfo();
        if (!options.silentStatus) { UI.setStatus('scanComplete', 'ready', { count: listings.length, saved: saved.length }); UI.render(); }
        if (!options.deferEvaluation) await Store.appendAudit({ type: 'scan', page: pageInfo.current, totalPages: pageInfo.total, count: listings.length });
        return listings;
    }

    function aiListingPayload(record, reference) {
        const latest = record.history?.at(-1) || {};
        const editable = captureEditableFieldsFromRecord(record);
        const analysis = record.analysis || record.health?.result || {};
        return {
            reference, editableDataCaptured: Boolean(record.editor?.capturedAt),
            title: editable.title, description: editable.description, tags: editable.tags, materials: editable.materials,
            metrics: {
                visits30d: latest.visits ?? null, favorites30d: latest.favorites ?? null, salesAllTime: latest.sales ?? null,
                revenueAllTime: latest.revenue ?? null, renewalsAllTime: latest.renewals ?? null,
                salesApprox30d: analysis.derived?.sales30 ?? null, revenueApprox30d: analysis.derived?.revenue30 ?? null,
                favoriteRate: analysis.derived?.favoriteRate ?? null, salesRateProxy: analysis.derived?.salesRateProxy ?? null,
            },
            health: {
                engineVersion: HEALTH_ENGINE_VERSION, lifecycle: analysis.lifecycle || 'DATA_GAP', diagnosis: analysis.diagnosis || 'INSUFFICIENT_SIGNAL',
                assessmentMode: analysis.assessmentMode || 'insufficient', performanceScore: analysis.score ?? null,
                scoreBasis: analysis.scoreBasis || 'insufficient', scoreComponents: analysis.currentAssessment?.components || analysis.bootstrap?.components || null,
                currentSignal: analysis.currentAssessment?.funnelSignal || null, cumulativeSignal: analysis.currentAssessment?.cumulativeSignal || null,
                snapshotSignal: analysis.bootstrap?.signal || null, confidence: analysis.confidence ?? 0,
                confidenceBand: analysis.confidenceBand || 'low', confidenceCaps: analysis.confidenceCaps || [],
                readiness: analysis.readiness || { snapshot: false, trend: false, deactivationHistory: false },
                evidence: (analysis.evidence || []).map((item) => ({ key: item.key, params: item.params })),
            },
            recommendation: analysis.code || 'waiting', reason: analysisReason(record),
        };
    }

    async function jsonFingerprint(value) {
        const serialized = JSON.stringify(value);
        if (globalThis.crypto?.subtle) {
            const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
            return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
        }
        return `fnv1a-${fnv1a(serialized)}`;
    }

    async function aiRequestPackage(records, expectedIdentity) {
        const requestId = `air-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const requestedIds = uniqueStrings(records.map((record) => String(record.listingId)));
        const prepared = await withNamedLock(STORAGE_MUTATION_LOCK, async () => {
            const fenced = await assertFreshCollectionLocked(expectedIdentity);
            const evaluated = evaluateHealthRecords(fenced.records, state.settings, nowIso());
            const latestById = new Map(fenced.records.map((record) => {
                const health = evaluated.get(String(record.listingId));
                return [String(record.listingId), health ? { ...record, health, analysis: health.result } : record];
            }));
            const latestRecords = requestedIds.map((listingId) => latestById.get(listingId));
            if (latestRecords.some((record) => !record)) {
                const error = new Error('A selected listing is no longer part of the completed collection.'); error.code = 'COLLECTION_INCOMPLETE'; throw error;
            }
            const aliasMap = {};
            latestRecords.forEach((record, index) => { aliasMap[`L${String(index + 1).padStart(3, '0')}`] = String(record.listingId); });
            const listingPayloads = latestRecords.map((record, index) => aiListingPayload(record, `L${String(index + 1).padStart(3, '0')}`));
            const recordFences = {};
            for (let index = 0; index < latestRecords.length; index += 1) {
                const reference = `L${String(index + 1).padStart(3, '0')}`;
                const record = latestRecords[index];
                recordFences[reference] = {
                    listingId: String(record.listingId),
                    editableFingerprint: await contentFingerprint(captureEditableFieldsFromRecord(record)),
                    payloadFingerprint: await jsonFingerprint(listingPayloads[index]),
                    proposalFingerprint: await jsonFingerprint(record.proposal || null),
                    basis: recommendationBasis(record, record.health),
                };
            }
            const identity = collectionIdentity(fenced.collection);
            const requestEntry = {
                createdAt: nowIso(), aliases: aliasMap, recordFences, collectionId: identity.id,
                scopeKey: identity.scopeKey, completedAt: identity.completedAt, totalPages: identity.totalPages,
                metricContractId: identity.metricContractId, manifestFingerprint: identity.manifestFingerprint, writeRevision: identity.writeRevision,
                writeId: randomId('ai-request-write'),
            };
            const requests = await GMX.get(KEYS.aiRequests, {});
            const cache = requests && typeof requests === 'object' ? { ...requests } : {};
            cache[requestId] = requestEntry;
            const bounded = Object.fromEntries(Object.entries(cache).sort((a, b) => String(a[1]?.createdAt).localeCompare(String(b[1]?.createdAt))).slice(-10));
            await requireStored(KEYS.aiRequests, bounded);
            const verified = await GMX.get(KEYS.aiRequests, {});
            if (verified?.[requestId]?.writeId !== requestEntry.writeId) {
                const error = new Error('AI request cache write verification failed.'); error.code = 'STORAGE_WRITE_FAILED'; throw error;
            }
            return { latestRecords, listingPayloads, requestEntry };
        });
        return {
            schema: 'makaytron-listing-ai-request/v1', requestId, generatedAt: nowIso(),
            collection: {
                id: prepared.requestEntry.collectionId, scopeKey: prepared.requestEntry.scopeKey,
                completedAt: prepared.requestEntry.completedAt, totalPages: prepared.requestEntry.totalPages,
                metricContractId: prepared.requestEntry.metricContractId, manifestFingerprint: prepared.requestEntry.manifestFingerprint,
                writeRevision: prepared.requestEntry.writeRevision,
            },
            instructions: {
                outputSchema: 'makaytron-listing-ai-proposals/v1',
                constraints: ['Return JSON only', 'Echo requestId and each opaque reference exactly', 'Every proposal must include fields: an explicit subset of title, description, tags, materials', 'Fields omitted from fields stay unchanged', 'Use fields:["tags"] with tags:[] only when intentionally clearing every tag', 'title: 1-140 chars when title is selected', 'tags: max 13; each max 20 chars', 'Never invent performance data', 'action: UPDATE, DEACTIVATE_REVIEW, or SKIP; non-UPDATE actions use fields:[]'],
            },
            listings: prepared.listingPayloads,
        };
    }

    async function copyAiRequest() {
        const expectedIdentity = collectionIdentity();
        const records = selectedCurrentCollectionRecords();
        if (!records.length) { UI.setStatus('selectForAi', 'blocked'); return; }
        try {
            const request = await aiRequestPackage(records, expectedIdentity);
            await copyText(JSON.stringify(request, null, 2));
            UI.setStatus('aiCopied', 'ready', { count: request.listings.length });
            const feedback = state.modal?.querySelector('[data-ai-feedback]'); if (feedback) feedback.textContent = t('aiCopied', { count: request.listings.length });
        } catch (error) {
            UI.setStatus(['COLLECTION_STALE', 'COLLECTION_INCOMPLETE'].includes(error?.code) ? 'collectionActionStale' : 'collectionStorageFailed', 'blocked');
        }
    }

    function aiValidationError(code, path, detail = '') {
        const error = new Error(detail || code);
        error.code = code;
        error.path = path;
        return error;
    }

    function aiErrorDetails(error) {
        const code = String(error?.code || 'AI_PROPOSAL');
        const path = String(error?.path || 'proposals');
        const key = code === 'AI_JSON' ? 'aiErrorJson' : code === 'AI_SCHEMA' ? 'aiErrorSchema' : code === 'AI_REQUEST' ? 'aiErrorRequest' : 'aiErrorProposal';
        const format = /\.(?:tags|materials)$/.test(path) ? (state.settings.language === 'tr' ? 'Beklenen biçim: dizi (array).' : 'Expected format: array.') : '';
        const detail = normalizeSpace(error?.message).slice(0, 180);
        return { code, path, message: `${t(key, { path })}${detail && detail !== code ? ` ${detail}` : ''}`, format, help: t('aiErrorHelp') };
    }

    function aiProposalTemplate() {
        return JSON.stringify({
            schema: 'makaytron-listing-ai-proposals/v1', requestId: 'PASTE_REQUEST_ID',
            proposals: [{ reference: 'L001', action: 'UPDATE', fields: ['title'], title: 'New title', reason: 'Why this change should help' }],
        }, null, 2);
    }

    function validateAiProposal(raw, aliasMap, knownIds, proposalIndex = 0) {
        const base = `proposals[${proposalIndex}]`;
        if (!raw || typeof raw !== 'object') throw aiValidationError('AI_PROPOSAL', base, 'proposal must be an object');
        const reference = String(raw.reference || '');
        const listingId = String(aliasMap?.[reference] || '');
        if (!reference || !listingId) throw aiValidationError('AI_PROPOSAL', `${base}.reference`, `unknown reference ${reference || '(missing)'}`);
        if (!knownIds.has(listingId)) throw aiValidationError('AI_PROPOSAL', `${base}.reference`, `unknown listingId ${listingId}`);
        const action = String(raw.action || 'UPDATE').toUpperCase();
        if (!['UPDATE','DEACTIVATE_REVIEW','SKIP'].includes(action)) throw aiValidationError('AI_PROPOSAL', `${base}.action`, `unsupported action ${action}`);
        let fields;
        try { fields = proposalFields(raw, true); }
        catch (error) { throw aiValidationError('AI_PROPOSAL', `${base}.fields`, error?.message || 'invalid fields'); }
        if (action === 'UPDATE' && !fields.length) throw aiValidationError('AI_PROPOSAL', `${base}.fields`, `no fields selected for ${listingId}`);
        if (action !== 'UPDATE' && fields.length) throw aiValidationError('AI_PROPOSAL', `${base}.fields`, `non-UPDATE action must not select fields for ${listingId}`);
        const title = normalizeSpace(raw.title || '');
        const description = typeof raw.description === 'string' ? raw.description.trim() : '';
        if (fields.includes('tags') && !Array.isArray(raw.tags)) throw aiValidationError('AI_PROPOSAL', `${base}.tags`, `tags must be an array for ${listingId}`);
        if (fields.includes('materials') && !Array.isArray(raw.materials)) throw aiValidationError('AI_PROPOSAL', `${base}.materials`, `materials must be an array for ${listingId}`);
        if (fields.includes('description') && typeof raw.description !== 'string') throw aiValidationError('AI_PROPOSAL', `${base}.description`, `description must be a string for ${listingId}`);
        const tags = uniqueStrings(Array.isArray(raw.tags) ? raw.tags : []);
        const materials = uniqueStrings(Array.isArray(raw.materials) ? raw.materials : []);
        if (fields.includes('title') && (!title || title.length > 140)) throw aiValidationError('AI_PROPOSAL', `${base}.title`, `invalid title for ${listingId}`);
        if (tags.length > 13 || tags.some((tag) => tag.length > 20)) throw aiValidationError('AI_PROPOSAL', `${base}.tags`, `invalid tags for ${listingId}`);
        return { reference, listingId, action, fields, title, description, tags, materials, reason: String(raw.reason || '').trim(), source: 'ai-import' };
    }

    async function importAiResponse(text, feedback) {
        try {
            let documentValue;
            try { documentValue = JSON.parse(text); }
            catch { throw aiValidationError('AI_JSON', '$', 'invalid JSON'); }
            if (documentValue?.schema !== 'makaytron-listing-ai-proposals/v1' || !Array.isArray(documentValue.proposals)) throw aiValidationError('AI_SCHEMA', '$.schema/proposals', 'schema/proposals missing');
            const requestId = String(documentValue.requestId || '');
            const proposals = await withNamedLock(STORAGE_MUTATION_LOCK, async () => {
                const requestsRaw = await GMX.get(KEYS.aiRequests, {});
                const requests = requestsRaw && typeof requestsRaw === 'object' ? { ...requestsRaw } : {};
                const request = requests[requestId];
                const aliasMap = request?.aliases;
                const recordFences = request?.recordFences;
                if (!requestId || !aliasMap || typeof aliasMap !== 'object' || !recordFences || typeof recordFences !== 'object') {
                    throw aiValidationError('AI_REQUEST', '$.requestId', 'unknown, expired, or legacy requestId');
                }
                const expectedIdentity = {
                    id: String(request.collectionId || ''), scopeKey: String(request.scopeKey || ''),
                    completedAt: String(request.completedAt || ''), totalPages: Math.max(1, Number(request.totalPages) || 1),
                    metricContractId: String(request.metricContractId || ''), manifestFingerprint: String(request.manifestFingerprint || ''),
                    writeRevision: Math.max(0, Number(request.writeRevision) || 0),
                };
                const fenced = await assertFreshCollectionLocked(expectedIdentity);
                const knownIds = new Set((fenced.collection.uniqueIds || []).map(String));
                if (Object.values(aliasMap).some((listingId) => !knownIds.has(String(listingId)))) throw aiValidationError('AI_REQUEST', '$.requestId', 'AI request contains a listing outside the current collection');
                const storedSettings = await GMX.get(KEYS.settings, {});
                const settings = { ...DEFAULT_SETTINGS, ...(storedSettings && typeof storedSettings === 'object' ? storedSettings : {}) };
                Object.assign(settings, normalizeHealthThresholds(settings));
                const evaluated = evaluateHealthRecords(fenced.records, settings, nowIso());
                const currentById = new Map(fenced.records.map((record) => {
                    const health = evaluated.get(String(record.listingId));
                    return [String(record.listingId), health ? { ...record, health, analysis: health.result } : record];
                }));
                for (const [reference, listingIdValue] of Object.entries(aliasMap)) {
                    const listingId = String(listingIdValue);
                    const expectedFence = recordFences[reference];
                    const currentRecord = currentById.get(listingId);
                    const editableFingerprint = currentRecord
                        ? await contentFingerprint(captureEditableFieldsFromRecord(currentRecord))
                        : '';
                    const payloadFingerprint = currentRecord ? await jsonFingerprint(aiListingPayload(currentRecord, reference)) : '';
                    const proposalFingerprint = currentRecord ? await jsonFingerprint(currentRecord.proposal || null) : '';
                    const fenceMatches = expectedFence && String(expectedFence.listingId || '') === listingId
                        && expectedFence.editableFingerprint === editableFingerprint
                        && expectedFence.payloadFingerprint === payloadFingerprint
                        && expectedFence.proposalFingerprint === proposalFingerprint
                        && recommendationBasisEquals(expectedFence.basis, recommendationBasis(currentRecord, currentRecord?.health));
                    if (!fenceMatches) throw aiValidationError('AI_REQUEST', '$.requestId', `record-stale ${reference}`);
                }
                const references = documentValue.proposals.map((proposal) => String(proposal?.reference || ''));
                const duplicateReferences = references.filter((reference, index, array) => reference && array.indexOf(reference) !== index);
                if (duplicateReferences.length) throw aiValidationError('AI_PROPOSAL', '$.proposals', `duplicate reference ${duplicateReferences[0]}`);
                const validated = documentValue.proposals.map((proposal, index) => validateAiProposal(proposal, aliasMap, knownIds, index));
                await assertProposalWritesAllowedLocked(validated.map((proposal) => proposal.listingId));
                for (const proposal of validated) await Store.saveProposalLocked(proposal.listingId, { ...proposal, requestId });
                delete requests[requestId];
                await requireStored(KEYS.aiRequests, requests);
                const verified = await GMX.get(KEYS.aiRequests, {});
                if (verified?.[requestId]) {
                    const error = new Error('AI request cache cleanup failed.'); error.code = 'STORAGE_WRITE_FAILED'; throw error;
                }
                return validated;
            });
            await refreshRecords();
            UI.setStatus('aiImportSuccess', 'ready', { count: proposals.length });
            UI.render(true);
            state.panel?.querySelector('[data-ai-json]')?.setAttribute('aria-invalid', 'false');
            if (feedback) { feedback.style.color = 'var(--success)'; feedback.textContent = t('aiImportSuccess', { count: proposals.length }); }
            return { ok: true, count: proposals.length };
        } catch (error) {
            const collectionStale = ['COLLECTION_STALE', 'COLLECTION_INCOMPLETE'].includes(error?.code);
            const details = collectionStale ? { code: error.code, path: '$.requestId', message: t('collectionActionStale'), format: '', help: t('aiErrorHelp') } : aiErrorDetails(error);
            const message = `${details.message} ${details.format || ''} ${details.help}`.replace(/\s+/g, ' ').trim();
            state.panel?.querySelector('[data-ai-json]')?.setAttribute('aria-invalid', 'true');
            if (feedback) {
                feedback.setAttribute('role', 'alert'); feedback.setAttribute('aria-live', 'assertive');
                feedback.dataset.aiErrorPath = details.path;
                feedback.textContent = `${details.message} (${details.path}) ${details.format || ''} ${details.help}`.replace(/\s+/g, ' ').trim();
            }
            UI.setStatus(collectionStale ? 'collectionActionStale' : 'aiImportError', collectionStale ? 'blocked' : 'error', { message });
            return { ok: false, error: details };
        }
    }

    async function importResearchResultJson(text) {
        if (new TextEncoder().encode(String(text || '')).byteLength > RESEARCH_MESSAGE_MAX_BYTES) throw new Error('research result exceeds 64 KiB');
        let raw;
        try { raw = JSON.parse(String(text || '')); }
        catch { throw new Error('research result is not valid JSON'); }
        const envelope = validateResearchEnvelope(raw, ['RESEARCH_RESULT']);
        let consumed;
        try { consumed = await consumeResearchResult(envelope); }
        catch (error) { await rejectResearchResult(envelope, error); throw error; }
        try { postResearchEnvelope(researchEnvelope('RESEARCH_RECEIVED', envelope.requestId, envelope.nonce, { accepted: true }, Date.now() + 60_000)); }
        catch { /* Manual JSON recovery remains successful without an active channel. */ }
        clearResearchUiTimer(envelope.requestId);
        await refreshRecords();
        UI.setStatus('researchComplete', 'ready', { count: consumed.count });
        UI.toast(t('researchComplete', { count: consumed.count }), 'success');
        return consumed;
    }

    async function startMarketplaceResearchSelection() {
        const records = selectedCurrentCollectionRecords();
        if (records.length !== 1) { UI.setStatus('researchOneListing', 'blocked'); UI.toast(t('researchOneListing'), 'warning'); return; }
        try {
            let entry = await activeResearchForListing(records[0].listingId);
            if (entry) {
                entry = await updateResearchEntry(entry.requestId, (current) => ({ ...current, ownerTabId: tabId }));
                UI.setStatus('researchPendingExists', 'ready');
            } else entry = await prepareResearchEntry(records[0], collectionIdentity());
            UI.openResearchTransfer(entry);
            UI.setStatus('researchProbing', 'scanning');
            UI.updateResearchTransfer('researchProbing', 'scanning');
            UI.toast(t('researchProbing'), 'info', 1800);
            GMX.openTab(researchInsightsUrl(entry));
            await sleep(window.__MAKAYTRON_LISTING_TEST__ === true ? 30 : 450);
            const capabilities = await probeResearchCompanion();
            if (!capabilities) { UI.openResearchMissingModal(entry); return; }
            entry = await updateResearchEntry(entry.requestId, (current) => transitionResearchEntry(
                current,
                'request-sent',
                { requestSentAt: current.requestSentAt || nowIso() },
                ['waiting-ready', 'request-sent', 'acknowledged'],
            ));
            if (!entry) throw new Error('research request is no longer available');
            if (entry.status !== 'request-sent') return;
            postResearchEnvelope(researchRequestEnvelope(entry));
            UI.updateResearchTransfer('researchRequestSent', 'scanning');
            scheduleResearchUiTimeout(entry.requestId);
        } catch (error) {
            const stale = ['COLLECTION_STALE', 'COLLECTION_INCOMPLETE'].includes(error?.code);
            const key = stale ? 'collectionActionStale' : error?.code === 'RESEARCH_NO_SEEDS' ? 'researchNoSeeds' : 'researchFailed';
            const params = key === 'researchFailed' ? { message: normalizeSpace(error?.message || error) } : {};
            UI.setStatus(key, stale ? 'blocked' : 'error', params);
            UI.toast(t(key, params), stale ? 'warning' : 'error');
        }
    }

    async function exportBackup() {
        const records = await refreshRecords({ render: false });
        const queue = await Store.loadQueue();
        const collection = await Store.loadCollection();
        const audit = await GMX.get(KEYS.audit, []);
        downloadJson(`makaytron-listing-analyzer-${dayKey()}.json`, { schema: 'makaytron-listing-analyzer-backup/v1', producerVersion: APP_VERSION, recordSchemaVersion: RECORD_SCHEMA_VERSION, healthEngineVersion: HEALTH_ENGINE_VERSION, exportedAt: nowIso(), settings: state.settings, analysisFilters: state.analysisFilters, filterPresets: state.filterPresets, collection, records, queue, audit });
        UI.setStatus('exportComplete', 'ready');
    }

    function runActionTask(factory) {
        if (state.actionTask) return state.actionTask;
        const tracked = Promise.resolve().then(factory).finally(() => {
            if (state.actionTask === tracked) state.actionTask = null;
        });
        state.actionTask = tracked;
        return tracked;
    }

    function buildQueueFromSelection() { return runActionTask(buildQueueFromSelectionOnce); }

    async function buildQueueFromSelectionOnce() {
        const expectedIdentity = collectionIdentity();
        const selected = selectedCurrentCollectionRecords().filter((record) => record.proposal && record.proposal.action !== 'SKIP');
        if (!selected.length) { UI.setStatus('noProposalSelection', 'blocked'); return; }
        if (!confirm(t('queueConfirm', { count: selected.length }))) return;
        if (!await Lease.acquire()) { UI.setStatus('leaseBlocked', 'blocked'); return; }
        try {
            const queue = await Queue.create(selected, expectedIdentity);
            UI.closeModal(); UI.setStatus('queueCreated', 'ready', { count: queue.items.length }); UI.render();
        } catch (error) {
            await Lease.release();
            if (['COLLECTION_STALE', 'COLLECTION_INCOMPLETE'].includes(error?.code)) UI.setStatus('collectionActionStale', 'blocked');
            else if (error?.code === 'PROPOSAL_EXPERIMENT_OVERLAP') UI.setStatus('experimentOverlapRequired', 'blocked');
            else UI.setStatus(error?.code === 'PROPOSAL_STALE' ? 'proposalStale' : 'formNotReady', 'error');
        }
    }

    function applyCurrentProposal() { return runActionTask(applyCurrentProposalOnce); }

    function updateProposalStaleError(message = 'The queued UPDATE proposal is no longer current.') {
        const error = new Error(message);
        error.code = 'PROPOSAL_STALE';
        return error;
    }

    function editableProposalFenceValue(proposal) {
        const validated = validateEditableProposal(proposal);
        return JSON.stringify({
            action: 'UPDATE',
            fields: validated.fields,
            title: validated.title,
            description: validated.description,
            tags: validated.tags,
            materials: validated.materials,
        });
    }

    function publishOperationId(queue, item) {
        return String(item?.publishAttemptId || `publish-${queue?.id || 'queue'}-${Number(queue?.cursor) || 0}-${item?.listingId || 'listing'}`);
    }

    function storedEditorMatchesExpectedProposal(editor, before, proposal) {
        let expected;
        try { expected = expectedEditorAfterProposal(before, proposal); } catch { return false; }
        return Boolean(expected && ['title', 'description', 'tags', 'materials', 'quantity', 'sku']
            .every((field) => editorFieldMatches(field, editor, expected)));
    }

    function legacyPublishedImprovementMatches(queue, item, record, improvement) {
        if (!queue || !item || !record || !improvement
            || item.publishAttemptId || item.publishSubmittedIntentAt || improvement.publishOperationId
            || improvement.status !== 'published') return false;
        const submittedAt = validTime(item.submittedAt);
        const publishedAt = validTime(improvement.publishedAt);
        const appliedAt = validTime(record.proposal?.appliedAt);
        if (submittedAt === null || publishedAt === null || appliedAt !== publishedAt
            || publishedAt < submittedAt || publishedAt - submittedAt > 10 * 60 * 1000) return false;
        return storedEditorMatchesExpectedProposal(improvement.after, item.before, item.proposal)
            && storedEditorMatchesExpectedProposal(record.editor, item.before, item.proposal);
    }

    function legacyPublishAuditMatches(entry, queue, item, publishedAt) {
        const auditAt = validTime(entry?.at);
        const publishedTime = validTime(publishedAt);
        return Boolean(entry?.type === 'listing-published' && !entry.operationId
            && String(entry.queueId || '') === String(queue?.id || '')
            && String(entry.listingId || '') === String(item?.listingId || '')
            && sameStringSet(entry.fields, item?.changedFields)
            && auditAt !== null && publishedTime !== null
            && auditAt >= publishedTime && auditAt - publishedTime <= 10 * 60 * 1000);
    }

    function currentEditorInteractionIsClean(item) {
        return Boolean(item
            && item.runtimeOwner === pageInstanceId
            && !item.editorInteractionConflictAt
            && !state.editorInteractionConflict
            && Number(item.editorInteractionEpochAtApply) === Number(state.editorInteractionEpoch));
    }

    async function assertCurrentUpdateProposalLocked(queue, item, options = {}) {
        if (!queue || !item || item.proposal?.action !== 'UPDATE') throw updateProposalStaleError();
        const record = await Store.getRecord(item.listingId);
        const current = record?.proposal;
        if (!record || record.unsupportedSchema || current?.action !== 'UPDATE'
            || !current.updatedAt || current.updatedAt !== item.proposal.updatedAt
            || !current.improvementId || current.improvementId !== item.proposal.improvementId
            || !recommendationBasisEquals(current.basis, item.proposal.basis)) throw updateProposalStaleError();
        let queuedValue; let currentValue;
        try {
            queuedValue = editableProposalFenceValue(item.proposal);
            currentValue = editableProposalFenceValue(current);
        } catch { throw updateProposalStaleError(); }
        const improvement = (record.improvements || []).find((entry) => entry?.id === current.improvementId);
        const committedOperation = options.allowCommitted === true
            && improvement?.status === 'published'
            && improvement?.publishOperationId === publishOperationId(queue, item);
        if (queuedValue !== currentValue || !improvement) throw updateProposalStaleError();
        const legacyCommittedOperation = options.allowCommitted === true
            && legacyPublishedImprovementMatches(queue, item, record, improvement);
        if (committedOperation || legacyCommittedOperation) return record;
        const storedPolicy = await storedHealthPolicyLocked();
        if (improvement.status !== 'planned'
            || !recommendationBasisMatches(record, current)
            || current.basis?.policyFingerprint !== storedPolicy.fingerprint) throw updateProposalStaleError();
        return record;
    }

    async function applyCurrentProposalOnce() {
        let item = Queue.activeItem();
        const actionIdentity = Queue.activeIdentity();
        if (!item || currentListingId() !== String(item.listingId)) { UI.setStatus('routeMismatch', 'blocked'); return; }
        if (!['pending', 'failed'].includes(item.status)) { UI.setStatus('formNotReady', 'blocked'); return; }
        if (EditorAdapter.formIsClean() !== true) { UI.setStatus('formNotReady', 'blocked'); return; }
        if (!editorPublishIsDormant()) { UI.setStatus('formNotReady', 'blocked'); return; }
        try { EditorAdapter.preflightProposal(item.proposal); }
        catch { UI.setStatus('formNotReady', 'blocked'); return; }
        if (!await Lease.acquire()) { UI.setStatus('leaseBlocked', 'blocked'); return; }
        const fenceToken = state.leaseToken;
        let before = null;
        let interactionEpochAtApply = 0;
        let applying = false;
        try {
            item = await Queue.withFencedActiveItem(fenceToken, ['pending', 'failed'], async (queue, storedItem) => {
                await assertCurrentUpdateProposalLocked(queue, storedItem);
                return { ...storedItem };
            }, actionIdentity);
            state.editorInteractionConflict = false;
            interactionEpochAtApply = state.editorInteractionEpoch;
            before = EditorAdapter.read();
            if (!editorMatchesSnapshot(before, before)) throw new Error('The Etsy editor baseline could not be read completely.');
            const beforeFingerprint = await contentFingerprint(before);
            if (item.proposal?.baselineCapturedAt && item.proposal?.baselineFingerprint && beforeFingerprint !== item.proposal.baselineFingerprint) {
                await Queue.updateItemFenced(
                    { status: 'failed', changedFields: [], error: t('contentChanged'), contentChangedAt: nowIso() },
                    fenceToken,
                    ['pending', 'failed'],
                    actionIdentity,
                );
                await Lease.release(fenceToken);
                UI.setStatus('contentChanged', 'blocked'); return;
            }
            const baselineCapturedAt = nowIso();
            await Queue.withFencedActiveItem(fenceToken, ['pending', 'failed'], async (queue, storedItem) => {
                await assertCurrentUpdateProposalLocked(queue, storedItem);
                Object.assign(storedItem, {
                    status: 'applying', changedFields: [], error: '', runtimeOwner: pageInstanceId,
                    runtimeBaselineFingerprint: beforeFingerprint, runtimeBaselineCapturedAt: baselineCapturedAt,
                    editorInteractionConflictAt: '', editorInteractionEpochAtApply: interactionEpochAtApply,
                });
                await Lease.assertOwnerLocked(fenceToken);
                await Store.saveQueueLocked(queue);
            }, actionIdentity);
            applying = true;
            await Lease.withFence(fenceToken, async () => {
                const baselineRecord = await Store.getRecord(item.listingId);
                const baselineImprovement = (baselineRecord?.improvements || []).find((entry) => entry.id === item.proposal?.improvementId && entry.status === 'planned');
                if (baselineRecord && baselineImprovement) {
                    baselineImprovement.before = {
                        title: String(before.title || ''), description: String(before.description || ''),
                        tags: Array.isArray(before.tags) ? [...before.tags] : [], materials: Array.isArray(before.materials) ? [...before.materials] : [],
                    };
                    baselineImprovement.baselineFingerprint = beforeFingerprint;
                    baselineImprovement.baselineCapturedAt = baselineCapturedAt;
                    if (baselineRecord.proposal?.improvementId === baselineImprovement.id) {
                        baselineRecord.proposal = { ...baselineRecord.proposal, baselineFingerprint: beforeFingerprint, baselineCapturedAt };
                    }
                    await Lease.assertOwnerLocked(fenceToken);
                    await Store.putRecordLocked(baselineRecord);
                }
            });
            // `applying` is a durable proposal freeze. Long Etsy pill synchronization runs
            // outside the storage lock so the action lease heartbeat can keep renewing.
            const liveBeforeMutation = EditorAdapter.read();
            if (routeKind() !== 'editor' || currentListingId() !== String(item.listingId)
                || EditorAdapter.formIsClean() !== true || !editorPublishIsDormant()
                || !editorMatchesSnapshot(liveBeforeMutation, before)) {
                throw new Error('The Etsy editor changed before proposal application.');
            }
            const changedFields = await EditorAdapter.applyProposal(item.proposal, before, {
                listingId: item.listingId,
                assertLease: () => Lease.assertOwner(fenceToken),
            });
            await Queue.withFencedActiveItem(fenceToken, ['applying'], async (queue, storedItem) => {
                await assertCurrentUpdateProposalLocked(queue, storedItem);
                if (storedItem.editorInteractionConflictAt || state.editorInteractionConflict
                    || Number(storedItem.editorInteractionEpochAtApply) !== Number(state.editorInteractionEpoch)) {
                    throw updateProposalStaleError('The Etsy editor was changed during proposal application.');
                }
                const editorAfterApply = EditorAdapter.read();
                if (!editorMatchesExpectedProposal(editorAfterApply, before, storedItem.proposal)) {
                    void trackTelemetryError('selector_listing_editor');
                    const mismatch = new Error('The Etsy form does not exactly match the proposal overlay and untouched baseline fields.');
                    mismatch.changedFields = EditorAdapter.changedFields(before, editorAfterApply, proposalFields(storedItem.proposal, true));
                    throw mismatch;
                }
                Object.assign(storedItem, {
                    status: 'awaiting-user-review', before, changedFields,
                    attempts: (storedItem.attempts || 0) + 1, appliedAt: nowIso(), error: '', runtimeOwner: pageInstanceId,
                });
                await Lease.assertOwnerLocked(fenceToken);
                await Store.saveQueueLocked(queue);
            }, actionIdentity);
            UI.setStatus('formApplied', 'ready'); UI.render();
        } catch (error) {
            const ownedFields = before ? proposalFields(item.proposal, true) : [];
            let rollbackFenceSafe = false;
            if (before && state.leaseToken === fenceToken && routeKind() === 'editor' && currentListingId() === String(item.listingId)) {
                try { await Lease.assertOwner(fenceToken); rollbackFenceSafe = true; } catch { /* Never mutate a different route after a lost fence. */ }
            }
            if (before && rollbackFenceSafe && routeKind() === 'editor' && currentListingId() === String(item.listingId)) {
                let expected = null;
                try { expected = expectedEditorAfterProposal(before, item.proposal); } catch { /* invalid proposal already fails closed */ }
                const live = EditorAdapter.read();
                const safeScalarRollback = error?.trustedInputConflict ? [] : ownedFields.filter((field) => (
                    ['title', 'description'].includes(field)
                    && !editorFieldMatches(field, live, before)
                    && editorFieldMatches(field, live, expected)
                ));
                if (safeScalarRollback.length) await EditorAdapter.restore(before, safeScalarRollback);
            }
            const remainingChangedFields = before
                ? EditorAdapter.changedFields(before, EditorAdapter.read(), EDITABLE_FIELDS)
                : [];
            const dirty = before ? EditorAdapter.formIsClean() !== true : false;
            const manualReview = dirty || remainingChangedFields.length > 0;
            try {
                await Queue.updateItemFenced(
                    manualReview
                        ? {
                            status: 'awaiting-user-review', before, changedFields: remainingChangedFields,
                            error: String(error?.message || error), runtimeOwner: dirty ? pageInstanceId : '',
                        }
                        : { status: 'failed', changedFields: [], error: String(error?.message || error) },
                    fenceToken,
                    applying ? ['applying'] : ['pending', 'failed'],
                    actionIdentity,
                );
            } catch { await Store.loadQueue(); }
            if (!dirty) await Lease.release(fenceToken);
            UI.setStatus('formNotReady', manualReview ? 'blocked' : 'error');
            UI.render();
        }
    }

    function verifiedPublishedEditor(item, conflictDetected = () => false) {
        if (conflictDetected() || item?.editorInteractionConflictAt) {
            throw actionLeaseLostError('The Etsy editor was changed before publish commit.');
        }
        const verifiedEditor = EditorAdapter.read();
        if (routeKind() !== 'editor' || currentListingId() !== String(item?.listingId)
            || EditorAdapter.formIsClean() !== true || !editorPublishIsDormant()
            || !editorMatchesExpectedProposal(verifiedEditor, item?.before, item?.proposal)) {
            throw actionLeaseLostError('The published editor evidence changed before commit.');
        }
        return verifiedEditor;
    }

    async function commitVerifiedPublish(fenceToken, expectedIdentity, conflictDetected = () => false) {
        return Queue.withFencedActiveItem(fenceToken, ['submitted', 'submitted-unverified'], async (queue, item) => {
            await assertCurrentUpdateProposalLocked(queue, item, { allowCommitted: true });
            await Lease.assertOwnerLocked(fenceToken);
            const verifiedEditor = verifiedPublishedEditor(item, conflictDetected);
            const durableHealthSettings = await storedHealthSettingsLocked();
            await Lease.assertOwnerLocked(fenceToken);
            const operationId = publishOperationId(queue, item);
            const record = await Store.getRecord(item.listingId);
            const existingImprovement = (record?.improvements || []).find((entry) => entry.id === item.proposal?.improvementId);
            const alreadyCommitted = existingImprovement?.status === 'published' && existingImprovement?.publishOperationId === operationId;
            const legacyCommitted = legacyPublishedImprovementMatches(queue, item, record, existingImprovement);
            const submittedIntentAt = validTime(item.publishSubmittedIntentAt) ?? validTime(item.submittedAt);
            const publishedAt = new Date(validTime(alreadyCommitted || legacyCommitted ? existingImprovement.publishedAt : null) ?? submittedIntentAt ?? Date.now()).toISOString();
            let savedRecord = record;
            if (record && !alreadyCommitted && !legacyCommitted) {
                record.editor = { ...verifiedEditor, capturedAt: publishedAt };
                const improvement = (record.improvements || []).find((entry) => entry.id === item.proposal?.improvementId && entry.status === 'planned');
                if (!improvement) throw updateProposalStaleError();
                (record.improvements || []).forEach((entry) => {
                    if (entry !== improvement && entry?.status === 'published' && entry?.experiment?.state === 'observing') {
                        entry.experiment.state = 'contaminated'; entry.experiment.contaminatedAt = publishedAt;
                    }
                });
                if (!improvement.baselineCapturedAt && item.before) {
                    improvement.before = {
                        title: String(item.before.title || ''), description: String(item.before.description || ''),
                        tags: Array.isArray(item.before.tags) ? [...item.before.tags] : [], materials: Array.isArray(item.before.materials) ? [...item.before.materials] : [],
                    };
                    improvement.baselineCapturedAt = item.runtimeBaselineCapturedAt || item.appliedAt || publishedAt;
                    improvement.baselineFingerprint = item.runtimeBaselineFingerprint || improvement.baselineFingerprint;
                }
                improvement.status = 'published';
                improvement.publishOperationId = operationId;
                improvement.publishedAt = publishedAt;
                improvement.after = record.editor;
                improvement.baselineSnapshot = record.history?.at(-1) || improvement.baselineSnapshot || null;
                improvement.experiment = { ...(improvement.experiment || {}), state: 'observing', startAt: publishedAt, evaluateAt: addDays(publishedAt, HEALTH_RULES.experimentDays), day: 0, durationDays: HEALTH_RULES.experimentDays, primaryMetric: primaryMetricForFields(improvement.fields || []) };
                if (record.proposal?.improvementId === improvement.id) record.proposal = { ...record.proposal, appliedAt: publishedAt };
                updateExperimentEvaluations(record, publishedAt);
                const health = evaluateHealthRecords([record], durableHealthSettings, publishedAt).get(record.listingId);
                if (health) { record.health = health; record.analysis = health.result; }
                await Lease.assertOwnerLocked(fenceToken);
                savedRecord = await Store.putRecordLocked(record, null, { settings: durableHealthSettings });
            } else if (record && legacyCommitted) {
                existingImprovement.publishOperationId = operationId;
                const health = evaluateHealthRecords([record], durableHealthSettings, publishedAt).get(record.listingId);
                if (health) { record.health = health; record.analysis = health.result; }
                await Lease.assertOwnerLocked(fenceToken);
                savedRecord = await Store.putRecordLocked(record, null, { settings: durableHealthSettings });
            }
            const savedImprovement = (savedRecord?.improvements || []).find((entry) => entry.id === item.proposal?.improvementId);
            if (savedRecord && savedImprovement?.status === 'published' && savedImprovement?.publishOperationId === operationId) {
                const stateIndex = state.records.findIndex((entry) => String(entry?.listingId || '') === String(savedRecord.listingId));
                if (stateIndex >= 0) state.records[stateIndex] = savedRecord;
                else state.records.push(savedRecord);
            }

            await Lease.assertOwnerLocked(fenceToken);
            await invalidateCollectionForRecordMutationLocked(
                item.listingId,
                publishedAt,
                savedRecord?.meta?.shopKey || record?.meta?.shopKey || '',
            );
            await Lease.assertOwnerLocked(fenceToken);
            const audit = await GMX.get(KEYS.audit, []);
            const alreadyAudited = Array.isArray(audit)
                && audit.some((entry) => (entry?.type === 'listing-published' && entry?.operationId === operationId)
                    || (legacyCommitted && legacyPublishAuditMatches(entry, queue, item, publishedAt)));
            if (!alreadyAudited) {
                await Store.appendAuditLocked({
                    type: 'listing-published', operationId, queueId: queue.id,
                    listingId: item.listingId, fields: item.changedFields,
                });
            }

            // Re-check after every awaited local write. If Etsy or the user changed the
            // page meanwhile, the idempotent record/audit may remain, but the queue stays
            // submitted so an explicit verification can safely finish it without re-clicking.
            await assertCurrentUpdateProposalLocked(queue, item, { allowCommitted: true });
            await Lease.assertOwnerLocked(fenceToken);
            verifiedPublishedEditor(item, conflictDetected);
            item.status = 'verified';
            item.verifiedAt = publishedAt;
            item.error = '';
            queue.cursor += 1;
            const completed = queue.cursor >= queue.items.length;
            if (completed) {
                queue.status = 'completed';
                queue.completedAt = publishedAt;
            } else queue.status = 'running';
            const savedQueue = await Store.saveQueueLocked(queue);
            return { completed, next: completed ? null : savedQueue.items[savedQueue.cursor] || null };
        }, expectedIdentity);
    }

    async function finishVerifiedPublish(outcome, fenceToken, item, navigationAllowed = () => true) {
        if (outcome.completed) {
            await Lease.release(fenceToken);
            UI.setStatus('queueComplete', 'ready');
            UI.render();
            return;
        }
        UI.setStatus('publishVerified', 'ready');
        UI.render();
        if (!navigationAllowed() || routeKind() !== 'editor' || currentListingId() !== String(item.listingId)) {
            await Lease.release(fenceToken);
            UI.setStatus('formNotReady', 'blocked');
            UI.render();
            return;
        }
        await Queue.navigate(outcome.next);
    }

    function publishCurrentProposal() { return runActionTask(publishCurrentProposalOnce); }

    async function publishCurrentProposalOnce() {
        const item = Queue.activeItem();
        const actionIdentity = Queue.activeIdentity();
        const blockBeforePublish = async (key) => {
            if (state.leaseToken) await Lease.release(state.leaseToken);
            UI.setStatus(key, 'blocked');
        };
        if (!item || currentListingId() !== String(item.listingId)) { await blockBeforePublish('routeMismatch'); return; }
        if (!item.changedFields?.length || item.status !== 'awaiting-user-review') { await blockBeforePublish('formNotReady'); return; }
        if (!currentEditorInteractionIsClean(item)) { await blockBeforePublish('formNotReady'); return; }
        if (!editorMatchesExpectedProposal(EditorAdapter.read(), item.before, item.proposal)) { await blockBeforePublish('formNotReady'); return; }
        const button = EditorAdapter.publishButton();
        if (!button) { void trackTelemetryError('selector_listing_editor'); await blockBeforePublish('publishDisabled'); return; }
        if (button.disabled || button.getAttribute('aria-disabled') === 'true') { await blockBeforePublish('publishDisabled'); return; }
        const currentRecord = await Store.getRecord(item.listingId);
        if (activeObservedImprovement(currentRecord) && !item.proposal?.experimentOverlapAcceptedAt) {
            if (!confirm(`${t('experimentOverlapTitle')}\n\n${t('experimentOverlapCopy')}`)) return;
        }
        if (!confirm(t('publishConfirm', { id: item.listingId, fields: item.changedFields.join(', ') }))) return;
        if (!await Lease.acquire()) { UI.setStatus('leaseBlocked', 'blocked'); return; }

        const fenceToken = state.leaseToken;
        const statusBefore = EditorAdapter.statusText();
        let providerSubmitted = false;
        const conflictMonitor = monitorTrustedEditorInput();
        try {
            await Queue.withFencedActiveItem(fenceToken, ['awaiting-user-review'], async (queue, storedItem) => {
                const publishButton = () => {
                    if (routeKind() !== 'editor' || currentListingId() !== String(storedItem.listingId)
                        || conflictMonitor.conflicted()
                        || !currentEditorInteractionIsClean(storedItem)
                        || EditorAdapter.formIsClean() !== true
                        || !editorMatchesExpectedProposal(EditorAdapter.read(), storedItem.before, storedItem.proposal)) return null;
                    const candidate = EditorAdapter.publishButton();
                    return candidate && !candidate.disabled && candidate.getAttribute('aria-disabled') !== 'true'
                        ? candidate
                        : null;
                };
                await assertCurrentUpdateProposalLocked(queue, storedItem);
                if (!publishButton()) throw updateProposalStaleError('The editor changed before publish.');
                const publishAttemptId = randomId('publish-attempt');
                const submittedIntentAt = nowIso();
                storedItem.status = 'submitted';
                storedItem.submittedAt = submittedIntentAt;
                storedItem.publishAttemptId = publishAttemptId;
                storedItem.publishSubmittedIntentAt = submittedIntentAt;
                storedItem.runtimeOwner = pageInstanceId;
                storedItem.error = '';
                await Lease.assertOwnerLocked(fenceToken);
                await Store.saveQueueLocked(queue);

                // The storage lock fences proposal writers. Recheck both the durable proposal and
                // the live editor after the submitted intent is durable and immediately before click.
                await assertCurrentUpdateProposalLocked(queue, storedItem);
                await Lease.assertOwnerLocked(fenceToken);
                const finalButton = publishButton();
                if (!finalButton) {
                    storedItem.status = 'awaiting-user-review';
                    delete storedItem.submittedAt;
                    delete storedItem.publishAttemptId;
                    delete storedItem.publishSubmittedIntentAt;
                    await Lease.assertOwnerLocked(fenceToken);
                    await Store.saveQueueLocked(queue);
                    throw updateProposalStaleError('The editor changed before publish.');
                }
                providerSubmitted = true;
                finalButton.click();
            }, actionIdentity);
            UI.setStatus('publishSubmitted', 'scanning');
            const verified = await waitForActionVerification(() => {
                const publish = EditorAdapter.publishButton();
                const text = EditorAdapter.statusText();
                return currentListingId() === String(item.listingId)
                    && text !== statusBefore
                    && EditorAdapter.formIsClean() === true
                    && editorMatchesExpectedProposal(EditorAdapter.read(), item.before, item.proposal)
                    && (!publish || publish.disabled || publish.getAttribute('aria-disabled') === 'true');
            }, fenceToken, 25000, 300);
            if (!verified) {
                void trackTelemetryError('selector_listing_publish_verify');
                await Queue.updateItemFenced(
                    { status: 'submitted-unverified', error: t('publishUnverified') },
                    fenceToken,
                    ['submitted'],
                    actionIdentity,
                );
                await Lease.release(fenceToken);
                UI.setStatus('publishUnverified', 'blocked');
                UI.render();
                return;
            }

            const publishConflict = () => conflictMonitor.conflicted() || state.editorInteractionConflict
                || Number(item.editorInteractionEpochAtApply) !== Number(state.editorInteractionEpoch);
            if (publishConflict()) throw actionLeaseLostError('The Etsy editor was changed during publish verification.');
            const outcome = await commitVerifiedPublish(fenceToken, actionIdentity, publishConflict);
            await finishVerifiedPublish(outcome, fenceToken, item, () => !publishConflict());
        } catch (error) {
            if (error?.code === 'ACTION_LEASE_LOST' && state.leaseToken === fenceToken) {
                clearInterval(state.leaseTimer);
                state.leaseTimer = 0;
                state.leaseToken = '';
            }
            await Store.loadQueue();
            const recovery = Queue.recoveryState();
            const uncertainSubmission = providerSubmitted || recovery?.submitted === true;
            if (state.leaseToken === fenceToken) await Lease.release(fenceToken);
            void trackTelemetryError(error?.code === 'ACTION_LEASE_LOST' || String(error?.code || '').startsWith('STORAGE_')
                ? 'storage_listing_state'
                : 'selector_listing_publish_verify');
            UI.setStatus(uncertainSubmission ? 'publishUnverified' : 'formNotReady', uncertainSubmission ? 'blocked' : 'error');
            UI.render();
        } finally {
            conflictMonitor.dispose();
        }
    }

    function verifyCurrentPublish() { return runActionTask(verifyCurrentPublishOnce); }

    async function verifyCurrentPublishOnce() {
        let item = Queue.activeItem();
        const actionIdentity = Queue.activeIdentity();
        const submittedStatuses = ['submitted', 'submitted-unverified'];
        if (!item || currentListingId() !== String(item.listingId) || item.proposal?.action !== 'UPDATE') {
            UI.setStatus('routeMismatch', 'blocked'); return;
        }
        if (!submittedStatuses.includes(String(item.status || '')) || item.editorInteractionConflictAt) {
            UI.setStatus('publishUnverified', 'blocked'); return;
        }
        try { verifiedPublishedEditor(item, () => state.editorInteractionConflict); }
        catch { UI.setStatus('publishUnverified', 'blocked'); return; }
        if (!await Lease.acquire()) { UI.setStatus('leaseBlocked', 'blocked'); return; }
        const fenceToken = state.leaseToken;
        const conflictMonitor = monitorTrustedEditorInput();
        const publishConflict = () => conflictMonitor.conflicted() || state.editorInteractionConflict;
        try {
            item = await Queue.withFencedActiveItem(
                fenceToken,
                submittedStatuses,
                async (_queue, storedItem) => ({ ...storedItem }),
                actionIdentity,
            );
            verifiedPublishedEditor(item, publishConflict);
            const outcome = await commitVerifiedPublish(fenceToken, actionIdentity, publishConflict);
            await finishVerifiedPublish(outcome, fenceToken, item, () => !publishConflict());
        } catch (error) {
            if (state.leaseToken === fenceToken) await Lease.release(fenceToken);
            await Store.loadQueue();
            UI.setStatus(error?.code === 'ACTION_LEASE_LOST' ? 'leaseBlocked' : 'publishUnverified', 'blocked');
            UI.render();
        } finally {
            conflictMonitor.dispose();
        }
    }

    const DEACTIVATION_START_STATUSES = Object.freeze(['pending', 'failed']);
    const DEACTIVATION_VERIFY_STATUSES = Object.freeze(['awaiting-user-deactivation', 'deactivation-submitted', 'deactivation-submitted-unverified']);
    const DEACTIVATION_AUTO_RECOVERY_MAX_AGE_MS = 2 * 60 * 1000;

    function automaticDeactivationRecovery(item = Queue.activeItem(), at = Date.now()) {
        if (!['ready', 'running'].includes(String(state.queue?.status || ''))) return null;
        if (!item || item.proposal?.action !== 'DEACTIVATE_REVIEW') return null;
        if (!['deactivation-submitted', 'deactivation-submitted-unverified'].includes(String(item.status || ''))) return null;
        const listingId = String(item.listingId || '');
        const submittedAt = Date.parse(String(item.deactivationSubmittedIntentAt || ''));
        const age = Number(at) - submittedAt;
        const statusBefore = Array.isArray(item.deactivationStatusBefore) ? item.deactivationStatusBefore : [];
        if (!/^\d+$/.test(listingId) || !item.deactivationAttemptId || !Number.isFinite(submittedAt)
            || !Number.isFinite(age) || age < 0 || age > DEACTIVATION_AUTO_RECOVERY_MAX_AGE_MS
            || !statusBefore.length || !statusBefore.every(isActiveStatus)) return null;
        return { item, editUrl: `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}` };
    }

    function deactivationActiveBaseline(item, expected = null) {
        if (!item || routeKind() !== 'editor' || currentListingId() !== String(item.listingId) || item.proposal?.action !== 'DEACTIVATE_REVIEW') return null;
        if (EditorAdapter.formIsClean() !== true) return null;
        const statuses = EditorAdapter.listingStatusLabels();
        if (!statuses.length || !statuses.every(isActiveStatus)) return null;
        if (expected && !sameStringSet(statuses, expected)) return null;
        if (routeKind() !== 'editor' || currentListingId() !== String(item.listingId) || EditorAdapter.formIsClean() !== true) return null;
        return statuses;
    }

    function deactivationModalBaseline(item, expected) {
        if (!item || routeKind() !== 'editor' || currentListingId() !== String(item.listingId) || item.proposal?.action !== 'DEACTIVATE_REVIEW') return null;
        if (!EditorAdapter.deactivateDialogContract() || EditorAdapter.formIsClean(true) !== true) return null;
        const statuses = EditorAdapter.listingStatusLabels();
        if (!statuses.length || !statuses.every(isActiveStatus) || !sameStringSet(statuses, expected)) return null;
        if (routeKind() !== 'editor' || currentListingId() !== String(item.listingId) || !EditorAdapter.deactivateDialogContract()) return null;
        return statuses;
    }

    function deactivationStaleError(message = 'The deactivation recommendation is no longer current.') {
        const error = new Error(message);
        error.code = 'DEACTIVATION_STALE';
        return error;
    }

    async function assertCurrentDeactivationEligibilityLocked(queue, item) {
        if (!queue || !item || item.proposal?.action !== 'DEACTIVATE_REVIEW') throw deactivationStaleError();
        const record = await Store.getRecord(item.listingId);
        if (!record || record.unsupportedSchema || record.proposal?.action !== 'DEACTIVATE_REVIEW') throw deactivationStaleError();
        if (!record.proposal.updatedAt || record.proposal.updatedAt !== item.proposal.updatedAt
            || !recommendationBasisEquals(record.proposal.basis, item.proposal.basis)) throw deactivationStaleError();
        const storedSettings = await GMX.get(KEYS.settings, {});
        const settings = { ...DEFAULT_SETTINGS, ...(storedSettings && typeof storedSettings === 'object' ? storedSettings : {}) };
        Object.assign(settings, normalizeHealthThresholds(settings));
        const records = await Store.listRecords();
        const evaluatedAt = nowIso();
        const health = evaluateHealthRecords(records.length ? records : [record], settings, evaluatedAt).get(String(record.listingId));
        if (!health) throw deactivationStaleError();
        const evaluatedRecord = { ...record, health, analysis: health.result };
        const result = health.result;
        const safeguards = Array.isArray(result?.safeguards) ? result.safeguards : [];
        const eligible = result?.lifecycle === 'DEACTIVATION_REVIEW'
            && result?.code === 'deactivateReview'
            && safeguards.length > 0 && safeguards.every((check) => check?.passed === true)
            && (!Array.isArray(result?.anomalies) || result.anomalies.length === 0)
            && recordListingState(record, deriveRecordMetrics(record, evaluatedAt)) === 'active'
            && recommendationBasisMatches(evaluatedRecord, item.proposal, health);
        if (!eligible) throw deactivationStaleError();
        return evaluatedRecord;
    }

    function verifiedDeactivationStatus(item, statusBefore, statusAfter, conflictDetected = () => false) {
        if (conflictDetected() || item?.editorInteractionConflictAt) {
            throw actionLeaseLostError('The Etsy editor changed before deactivation commit.');
        }
        const verifiedStatusAfter = routeKind() === 'editor' && currentListingId() === String(item?.listingId)
            ? EditorAdapter.listingStatusLabels()
            : [];
        const storedBefore = Array.isArray(item?.deactivationStatusBefore) ? item.deactivationStatusBefore : [];
        const activeBefore = storedBefore.length > 0 && storedBefore.every(isActiveStatus) && sameStringSet(storedBefore, statusBefore);
        const inactiveAfter = verifiedStatusAfter.length > 0 && verifiedStatusAfter.every(isInactiveStatus)
            && !sameStringSet(storedBefore, verifiedStatusAfter) && sameStringSet(statusAfter, verifiedStatusAfter);
        if (!activeBefore || !inactiveAfter) throw actionLeaseLostError('The deactivation evidence changed before commit.');
        return verifiedStatusAfter;
    }

    async function commitVerifiedDeactivation(fenceToken, actionIdentity, statusBefore, statusAfter, conflictDetected = () => false) {
        return Queue.withFencedActiveItem(fenceToken, DEACTIVATION_VERIFY_STATUSES, async (queue, storedItem) => {
            await Lease.assertOwnerLocked(fenceToken);
            const verifiedStatusAfter = verifiedDeactivationStatus(storedItem, statusBefore, statusAfter, conflictDetected);
            const completedAt = nowIso();
            const operationId = String(storedItem.deactivationAttemptId || `deactivate-${queue.id}-${queue.cursor}-${storedItem.listingId}`);
            const record = await Store.getRecord(storedItem.listingId);
            const existingOperationAt = record?.deactivation?.operationId === operationId ? validTime(record.deactivation.at) : null;
            const submittedIntentAt = validTime(storedItem.deactivationSubmittedIntentAt);
            const operationAt = new Date(existingOperationAt ?? submittedIntentAt ?? Date.now()).toISOString();
            let savedRecord = record;
            let recordWriteError = null;
            if (record && record.deactivation?.operationId !== operationId) {
                record.deactivation = {
                    at: operationAt, operationId, reason: storedItem.proposal?.reason || '',
                    baselineSnapshot: record.history?.at(-1) || null, userConfirmed: true, automated: true,
                };
                const improvement = (record.improvements || []).find((entry) => entry.id === storedItem.proposal?.improvementId && entry.status === 'planned');
                if (improvement) { improvement.status = 'deactivated'; improvement.completedAt = operationAt; }
                try {
                    await Lease.assertOwnerLocked(fenceToken);
                    savedRecord = await Store.putRecordLocked(record);
                } catch (error) {
                    savedRecord = null;
                    recordWriteError = error;
                }
            }
            if (savedRecord?.deactivation?.operationId === operationId) {
                const stateIndex = state.records.findIndex((entry) => String(entry?.listingId || '') === String(savedRecord.listingId));
                if (stateIndex >= 0) state.records[stateIndex] = savedRecord;
                else state.records.push(savedRecord);
            }
            let collectionInvalidationError = null;
            try {
                await Lease.assertOwnerLocked(fenceToken);
                await invalidateCollectionForRecordMutationLocked(
                    storedItem.listingId,
                    savedRecord?.deactivation?.operationId === operationId ? savedRecord.deactivation.at : operationAt,
                    savedRecord?.meta?.shopKey || record?.meta?.shopKey || '',
                );
            } catch (error) {
                collectionInvalidationError = error;
            }
            if (recordWriteError) throw recordWriteError;
            if (collectionInvalidationError) throw collectionInvalidationError;
            await Lease.assertOwnerLocked(fenceToken);
            const audit = await GMX.get(KEYS.audit, []);
            const alreadyAudited = Array.isArray(audit) && audit.some((entry) => entry?.type === 'listing-deactivated' && entry?.operationId === operationId);
            if (!alreadyAudited) {
                await Store.appendAuditLocked({
                    type: 'listing-deactivated', operationId, queueId: queue.id, listingId: storedItem.listingId,
                    reason: storedItem.proposal?.reason || '', automated: true,
                });
            }
            await Lease.assertOwnerLocked(fenceToken);
            const finalStatusAfter = verifiedDeactivationStatus(storedItem, statusBefore, statusAfter, conflictDetected);
            storedItem.status = 'verified-deactivated';
            storedItem.verifiedAt = completedAt;
            storedItem.deactivationStatusAfter = finalStatusAfter;
            storedItem.error = '';
            queue.cursor += 1;
            const completed = queue.cursor >= queue.items.length;
            if (completed) { queue.status = 'completed'; queue.completedAt = completedAt; }
            else queue.status = 'running';
            const saved = await Store.saveQueueLocked(queue);
            return { completed, next: completed ? null : saved.items[saved.cursor] || null };
        }, actionIdentity);
    }

    async function finishVerifiedDeactivation(outcome, fenceToken, navigationAllowed = () => true) {
        if (outcome.completed) {
            await Lease.release(fenceToken);
            UI.setStatus('queueComplete', 'ready'); UI.render(); return;
        }
        UI.setStatus('deactivateVerified', 'ready'); UI.render();
        if (!navigationAllowed()) {
            await Lease.release(fenceToken);
            UI.setStatus('formNotReady', 'blocked'); UI.render(); return;
        }
        await Queue.navigate(outcome.next);
    }

    function openCurrentDeactivate() { return runActionTask(() => openCurrentDeactivateOnce()); }

    async function openCurrentDeactivateOnce(options = {}) {
        let item = Queue.activeItem();
        const actionIdentity = Queue.activeIdentity();
        if (!item || currentListingId() !== String(item.listingId) || item.proposal?.action !== 'DEACTIVATE_REVIEW') { UI.setStatus('routeMismatch', 'blocked'); return; }
        if (!DEACTIVATION_START_STATUSES.includes(String(item.status || ''))) { UI.setStatus('deactivateNotVerified', 'blocked'); return; }
        const statusBefore = deactivationActiveBaseline(item);
        if (!statusBefore) { UI.setStatus('deactivateNotVerified', 'blocked'); return; }
        if (options.confirmationGranted !== true && !confirm(t('deactivateConfirm', { id: item.listingId }))) return;
        if (!await Lease.acquire()) { UI.setStatus('leaseBlocked', 'blocked'); return; }
        const fenceToken = state.leaseToken;
        state.editorInteractionConflict = false;
        const interactionEpochAtDeactivation = state.editorInteractionEpoch;
        let submissionArmed = false;
        let providerClicked = false;
        const conflictMonitor = monitorTrustedEditorInput();
        const deactivationConflict = () => conflictMonitor.conflicted() || state.editorInteractionConflict
            || Number(interactionEpochAtDeactivation) !== Number(state.editorInteractionEpoch);
        try {
            item = await Queue.withFencedActiveItem(fenceToken, DEACTIVATION_START_STATUSES, async (queue, storedItem) => {
                await assertCurrentDeactivationEligibilityLocked(queue, storedItem);
                return { ...storedItem };
            }, actionIdentity);
            if (!deactivationActiveBaseline(item, statusBefore)) throw actionLeaseLostError('The listing changed before the deactivation dialog opened.');
            if (!await EditorAdapter.openDeactivateDialog()) {
                await EditorAdapter.cancelDeactivateDialogWhenReady();
                await Lease.release(fenceToken);
                void trackTelemetryError('selector_listing_editor'); UI.setStatus('formNotReady', 'error'); return;
            }
            await Lease.assertOwner(fenceToken);
            if (!deactivationModalBaseline(item, statusBefore)) throw actionLeaseLostError('The listing changed before deactivation submission.');
            const attemptId = randomId('deactivation-attempt');
            await Queue.updateItemFenced(
                {
                    status: 'deactivation-submitted', deactivationAttemptId: attemptId,
                    deactivationStatusBefore: statusBefore, deactivationAuthorizedAt: nowIso(),
                    deactivationSubmittedIntentAt: nowIso(), runtimeOwner: pageInstanceId, error: '',
                    editorInteractionConflictAt: '', editorInteractionEpochAtDeactivation: interactionEpochAtDeactivation,
                },
                fenceToken,
                DEACTIVATION_START_STATUSES,
                actionIdentity,
            );
            submissionArmed = true;
            await Lease.assertOwner(fenceToken);
            await Queue.withFencedActiveItem(fenceToken, ['deactivation-submitted'], async (queue, storedItem) => {
                await assertCurrentDeactivationEligibilityLocked(queue, storedItem);
                await Lease.assertOwnerLocked(fenceToken);
                if (deactivationConflict() || !deactivationModalBaseline(storedItem, statusBefore)) {
                    throw actionLeaseLostError('The listing changed after deactivation submission was armed.');
                }
                if (!EditorAdapter.clickDeactivateConfirmation()) throw new Error('The Etsy deactivation confirmation was no longer safe to click.');
                return true;
            }, actionIdentity);
            providerClicked = true;
            const statusAfter = await waitForActionVerification(() => {
                if (currentListingId() !== String(item.listingId)) return null;
                const statuses = EditorAdapter.listingStatusLabels();
                return statuses.length && statuses.every(isInactiveStatus) && !sameStringSet(statusBefore, statuses) ? statuses : null;
            }, fenceToken, 25000, 300);
            if (!statusAfter) {
                void trackTelemetryError('selector_listing_deactivate_verify');
                await Queue.updateItemFenced(
                    { status: 'deactivation-submitted-unverified', deactivationClickedAt: nowIso(), error: t('deactivateUnverified') },
                    fenceToken,
                    ['deactivation-submitted'],
                    actionIdentity,
                );
                await Lease.release(fenceToken);
                UI.setStatus('deactivateUnverified', 'blocked'); UI.render(); return;
            }
            if (deactivationConflict()) throw actionLeaseLostError('The Etsy editor changed during deactivation verification.');
            const outcome = await commitVerifiedDeactivation(fenceToken, actionIdentity, statusBefore, statusAfter, deactivationConflict);
            await finishVerifiedDeactivation(outcome, fenceToken, () => (
                !deactivationConflict() && routeKind() === 'editor' && currentListingId() === String(item.listingId)
            ));
        } catch (error) {
            if (!submissionArmed) await EditorAdapter.cancelDeactivateDialogWhenReady();
            if (submissionArmed && state.leaseToken === fenceToken) {
                try {
                    await Queue.updateItemFenced(
                        {
                            status: 'deactivation-submitted-unverified',
                            deactivationClickedAt: providerClicked ? nowIso() : '',
                            error: normalizeSpace(error?.message || error).slice(0, 240),
                        },
                        fenceToken,
                        ['deactivation-submitted'],
                        actionIdentity,
                    );
                } catch { /* The durable submitted state already prevents an automatic retry. */ }
            }
            if (state.leaseToken === fenceToken) await Lease.release(fenceToken);
            await Store.loadQueue();
            const uncertain = submissionArmed || ['deactivation-submitted', 'deactivation-submitted-unverified'].includes(String(Queue.activeItem()?.status || ''));
            UI.setStatus(uncertain ? 'deactivateUnverified' : (error?.code === 'DEACTIVATION_STALE' ? 'deactivateNotVerified' : error?.code === 'ACTION_LEASE_LOST' ? 'leaseBlocked' : 'formNotReady'), uncertain || ['ACTION_LEASE_LOST', 'DEACTIVATION_STALE'].includes(error?.code) ? 'blocked' : 'error');
            UI.render();
        } finally {
            conflictMonitor.dispose();
        }
    }

    function verifyCurrentDeactivate() { return runActionTask(verifyCurrentDeactivateOnce); }

    async function verifyCurrentDeactivateOnce() {
        let item = Queue.activeItem();
        const actionIdentity = Queue.activeIdentity();
        if (!item || currentListingId() !== String(item.listingId) || item.proposal?.action !== 'DEACTIVATE_REVIEW') { UI.setStatus('routeMismatch', 'blocked'); return; }
        if (!DEACTIVATION_VERIFY_STATUSES.includes(String(item.status || ''))) { UI.setStatus('deactivateNotVerified', 'blocked'); return; }
        if (!await Lease.acquire()) { UI.setStatus('leaseBlocked', 'blocked'); return; }
        const fenceToken = state.leaseToken;
        const conflictMonitor = monitorTrustedEditorInput();
        const deactivationConflict = () => conflictMonitor.conflicted() || state.editorInteractionConflict;
        try {
            item = await Queue.withFencedActiveItem(fenceToken, DEACTIVATION_VERIFY_STATUSES, async (_queue, storedItem) => ({ ...storedItem }), actionIdentity);
            const statusBefore = Array.isArray(item.deactivationStatusBefore) ? item.deactivationStatusBefore : [];
            const statusAfter = EditorAdapter.listingStatusLabels();
            const activeBefore = statusBefore.length > 0 && statusBefore.every(isActiveStatus);
            const inactiveAfter = statusAfter.length > 0 && statusAfter.every(isInactiveStatus);
            const statusChanged = statusBefore.length > 0 && statusAfter.length > 0 && !sameStringSet(statusBefore, statusAfter);
            if (!statusAfter.length || (statusChanged && !inactiveAfter)) void trackTelemetryError('selector_listing_deactivate_verify');
            if (!activeBefore || !inactiveAfter || !statusChanged) {
                await Lease.release(fenceToken);
                UI.setStatus('deactivateNotVerified', 'blocked'); return;
            }
            if (deactivationConflict()) throw actionLeaseLostError('The Etsy editor changed during deactivation verification.');
            const outcome = await commitVerifiedDeactivation(fenceToken, actionIdentity, statusBefore, statusAfter, deactivationConflict);
            await finishVerifiedDeactivation(outcome, fenceToken, () => (
                !deactivationConflict() && routeKind() === 'editor' && currentListingId() === String(item.listingId)
            ));
        } catch (error) {
            if (state.leaseToken === fenceToken) await Lease.release(fenceToken);
            await Store.loadQueue();
            UI.setStatus(error?.code === 'ACTION_LEASE_LOST' ? 'leaseBlocked' : 'deactivateNotVerified', 'blocked');
            UI.render();
        } finally {
            conflictMonitor.dispose();
        }
    }

    function skipCurrentItem() { return runActionTask(skipCurrentItemOnce); }

    async function skipCurrentItemOnce() {
        const item = Queue.activeItem();
        const actionIdentity = Queue.activeIdentity();
        if (!item) return;
        if (!['pending', 'failed'].includes(String(item.status || ''))) { UI.setStatus('formNotReady', 'blocked'); return; }
        if (routeKind() === 'editor' && currentListingId() === String(item.listingId) && EditorAdapter.formIsClean() !== true) {
            UI.setStatus('formNotReady', 'blocked'); return;
        }
        if (!await Lease.acquire()) { UI.setStatus('leaseBlocked', 'blocked'); return; }
        const fenceToken = state.leaseToken;
        try {
            const outcome = await Queue.advanceFenced(
                'skipped',
                fenceToken,
                ['pending', 'failed'],
                actionIdentity,
                (queue, storedItem) => ({ type: 'queue-item-skipped', queueId: queue.id, listingId: storedItem.listingId }),
            );
            if (outcome.completed) {
                await Lease.release(fenceToken);
                UI.setStatus('queueComplete', 'ready'); UI.render(); return;
            }
            UI.render();
            await Queue.navigate(outcome.next);
        } catch (error) {
            if (state.leaseToken === fenceToken) await Lease.release(fenceToken);
            await Store.loadQueue(); UI.setStatus('leaseBlocked', 'blocked'); UI.render();
        }
    }

    function stopCurrentQueue(reason = 'user') { return runActionTask(() => stopCurrentQueueOnce(reason)); }

    async function stopCurrentQueueOnce(reason = 'user') {
        const item = Queue.activeItem();
        const actionIdentity = Queue.activeIdentity();
        if (!item) return;
        const dirtyAppliedEditor = routeKind() === 'editor'
            && currentListingId() === String(item.listingId)
            && ['applying', 'awaiting-user-review'].includes(String(item.status || ''))
            && EditorAdapter.formIsClean() !== true;
        if (dirtyAppliedEditor) { UI.setStatus('formNotReady', 'blocked'); return; }
        if (!await Lease.acquire({ allowCollectionConflictForQueueStop: true })) { UI.setStatus('leaseBlocked', 'blocked'); return; }
        const fenceToken = state.leaseToken;
        try {
            await Queue.stopFenced(reason, fenceToken, [actionIdentity.itemStatus], actionIdentity);
            await Lease.release(fenceToken);
            UI.setStatus('queueStopped', 'blocked'); UI.render();
        } catch {
            if (state.leaseToken === fenceToken) await Lease.release(fenceToken);
            await Store.loadQueue(); UI.setStatus('leaseBlocked', 'blocked'); UI.render();
        }
    }

    function recoverCurrentItem() { return runActionTask(recoverCurrentItemOnce); }

    async function recoverCurrentItemOnce() {
        const recovery = Queue.recoveryState();
        const item = recovery?.item;
        const actionIdentity = Queue.activeIdentity();
        if (!item || recovery.submitted) return;
        const editorIsDirty = () => routeKind() === 'editor'
            && currentListingId() === String(item.listingId)
            && EditorAdapter.formIsClean() !== true;
        if (editorIsDirty()) { UI.setStatus('formNotReady', 'blocked'); return; }
        if (!confirm(t('queueRecoveryConfirm'))) return;
        if (!await Lease.acquire()) { UI.setStatus('leaseBlocked', 'blocked'); return; }
        const fenceToken = state.leaseToken;
        try {
            if (editorIsDirty()) {
                await Lease.release(fenceToken);
                UI.setStatus('formNotReady', 'blocked');
                return;
            }
            await Queue.updateItemFenced(
                { status: 'pending', error: '', changedFields: [], runtimeOwner: '', editorInteractionConflictAt: '' },
                fenceToken,
                [actionIdentity.itemStatus],
                actionIdentity,
            );
            await Lease.release(fenceToken);
            UI.setStatus('editorReady', 'ready'); UI.render(true);
        } catch {
            if (state.leaseToken === fenceToken) await Lease.release(fenceToken);
            await Store.loadQueue(); UI.setStatus('leaseBlocked', 'blocked'); UI.render();
        }
    }

    function registerMenus() {
        state.menuIds.forEach((id) => GMX.unregister(id)); state.menuIds = [];
        [
            [state.settings.collapsed ? 'expand' : 'collapse', () => UI.setCollapsed(!state.settings.collapsed)],
            ['scanPage', () => scanCurrentPage()],
            ['scanAllPages', () => Collection.toggle()],
            ['openAnalysis', () => UI.openAnalysis()],
            ['aiExchange', () => UI.openAi()],
            ['exportData', () => exportBackup()],
            ['checkUpdate', () => checkForUpdates({ manual: true, force: true })],
            ['switchLanguage', () => UI.toggleLanguage()],
        ].forEach(([key, callback]) => { const id = GMX.register(`Makaytron · ${t(key)}`, callback); if (id != null) state.menuIds.push(id); });
    }

    function routeLocationKey() { return `${location.pathname}${location.search || ''}`; }

    function handleRoute(options = {}) {
        const force = options?.force === true;
        const key = routeLocationKey();
        if (!force && state.routeKey === key && state.panel) return Promise.resolve(null);
        if (state.routeTask?.key === key) {
            if (force) state.routeRetryKey = key;
            return state.routeTask.promise;
        }
        if (state.routeKey !== key) state.routeKey = '';
        const generation = ++state.routeGeneration;
        const isCurrent = () => state.routeGeneration === generation && routeLocationKey() === key;
        const promise = (async () => {
            await Store.loadQueue();
            if (!isCurrent()) return null;
            const kind = routeKind();
            if (kind === 'listings') {
                const automaticRecovery = automaticDeactivationRecovery();
                if (automaticRecovery) {
                    state.routeKey = key;
                    UI.setStatus('deactivateOpened', 'scanning');
                    UI.render();
                    location.assign(automaticRecovery.editUrl);
                    return kind;
                }
                const stable = await ListingPageAdapter.readStable({
                    requirePagination: state.collection?.status === 'running' && state.collection.totalPages > 1,
                    timeout: window.__MAKAYTRON_LISTING_TEST__ === true ? 120 : 10000,
                });
                if (!isCurrent()) return null;
                state.pageListings = stable?.listings || [];
                if (state.collection?.status === 'running' && stable && collectionScopeMatches(state.collection)) {
                    UI.setStatus('collectionProgress', 'scanning', Collection.progressParams(stable.pageInfo));
                    void Collection.run();
                } else {
                    UI.setStatus(state.collection?.status === 'running' ? 'collectionPageChanged' : stable ? 'pageReady' : 'noCards', state.collection?.status === 'running' || !stable ? 'blocked' : 'ready');
                }
                if (stable) state.routeKey = key;
            } else if (kind === 'editor') {
                const editorReady = await waitFor(() => EditorAdapter.ready(), window.__MAKAYTRON_LISTING_TEST__ === true ? 120 : 12000, 250);
                if (!isCurrent()) return null;
                if (!editorReady) { void trackTelemetryError('selector_listing_editor'); UI.setStatus('formNotReady', 'blocked'); UI.render(); return null; }
                const captured = await EditorAdapter.captureCurrent({ routeKey: key, listingId: currentListingId() });
                if (!isCurrent()) return null;
                if (!captured) { UI.setStatus('formNotReady', 'blocked'); UI.render(); return null; }
                await refreshRecords({ render: false });
                if (!isCurrent()) return null;
                const item = Queue.activeItem();
                const automaticRecovery = automaticDeactivationRecovery(item);
                if (automaticRecovery && String(item.listingId) === currentListingId()) {
                    state.routeKey = key;
                    UI.setStatus('deactivateOpened', 'scanning');
                    UI.render();
                    void verifyCurrentDeactivate();
                    return kind;
                }
                if (item && String(item.listingId) !== currentListingId() && ['ready','running'].includes(state.queue?.status)) UI.setStatus('routeMismatch', 'blocked');
                else UI.setStatus('editorReady', 'ready');
                state.routeKey = key;
            } else {
                UI.setStatus('unsupportedPage', 'blocked');
                state.routeKey = key;
            }
            if (isCurrent()) UI.render();
            return kind;
        })();
        const task = { key, generation, promise };
        state.routeTask = task;
        const finalize = () => {
            if (state.routeTask === task) state.routeTask = null;
            const currentKey = routeLocationKey();
            if (state.routeRetryKey && state.routeRetryKey !== currentKey) state.routeRetryKey = '';
            if (state.routeRetryKey === currentKey && !state.routeTask) {
                const retry = state.routeKey !== currentKey;
                state.routeRetryKey = '';
                if (retry) void handleRoute({ force: true });
            }
        };
        void promise.then(finalize, finalize);
        return promise;
    }

    function collectionFingerprint(collection) {
        if (!collection) return 'none';
        const pages = Object.entries(collection.pages || {}).map(([page, value]) => [page, value?.capturedAt || '', value?.contentSignature || '']);
        return JSON.stringify([collection.id, collection.status, collection.updatedAt, collection.completedAt, collection.scopeKey, collection.totalPages, collection.returningToFirst, pages]);
    }

    function collectionFreshUntil(collection = state.collection) {
        if (!collection || collection.status !== 'completed') return null;
        const times = [collection.completedAt, ...Object.values(collection.pages || {}).map((page) => page?.capturedAt)]
            .map(validTime).filter(Number.isFinite);
        if (times.length !== 1 + Math.max(1, Number(collection.totalPages) || 1)) return null;
        return Math.min(...times) + ANALYSIS_FRESHNESS_MS;
    }

    function scheduleAnalysisFreshnessExpiry() {
        clearTimeout(state.analysisExpiryTimer);
        state.analysisExpiryTimer = 0;
        if (state.activeView !== 'analysis') return;
        const freshUntil = collectionFreshUntil();
        if (!Number.isFinite(freshUntil) || freshUntil <= Date.now()) return;
        const delay = Math.min(2147483647, Math.max(25, freshUntil - Date.now() + 25));
        state.analysisExpiryTimer = window.setTimeout(async () => {
            state.analysisExpiryTimer = 0;
            await syncCollectionState();
            if (analysisCollectionIsFresh()) scheduleAnalysisFreshnessExpiry();
        }, delay);
    }

    async function syncCollectionState() {
        if (state.collectionLoop && await CollectionLease.owns()) return false;
        const previousFingerprint = collectionFingerprint(state.collection);
        const stored = normalizeCollection(await GMX.get(KEYS.collection, null));
        const changed = collectionFingerprint(stored) !== previousFingerprint;
        if (changed) {
            state.collection = stored;
            markStorageEstimateDirty();
            pruneSelectionToCollection();
            if (stored?.status === 'completed') await refreshRecords();
            else UI.render();
        }
        const fresh = analysisCollectionIsFresh();
        if (state.activeView === 'analysis' && state.renderedAnalysisFresh !== fresh) {
            if (!fresh) pruneSelectionToCollection();
            UI.render(true);
        }
        return changed;
    }

    function installCollectionWatcher() {
        clearInterval(state.collectionSyncTimer);
        state.collectionSyncTimer = window.setInterval(() => { void syncCollectionState(); }, 4000);
        window.addEventListener('focus', () => { void syncCollectionState(); });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) void syncCollectionState(); });
    }

    function installRouteWatcher() {
        let lastUrl = location.href;
        state.routeTimer = window.setInterval(() => {
            if (location.href !== lastUrl) { lastUrl = location.href; void handleRoute({ force: true }); }
        }, 600);
        const observer = new MutationObserver(() => {
            const key = routeLocationKey();
            if (state.routeKey === key) return;
            const kind = routeKind();
            const hydrated = kind === 'listings'
                ? ListingPageAdapter.cardLinks().length > 0
                : kind === 'editor' && EditorAdapter.ready();
            if (hydrated) void handleRoute({ force: true });
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    async function init() {
        await ensureUniqueTabIdentity();
        installTrustedEditorInteractionWatcher();
        installResearchBridge();
        await Store.loadSettings(); await Store.loadAnalysisFilters(); await Store.loadFilterPresets(); await Store.loadFeedback(); await Store.loadUpdateState(); await Store.loadQueue(); await Store.loadCollection(); await UI.mount();
        await refreshRecords();
        refreshStorageEstimate();
        registerMenus(); registerTelemetryMenuCommand(); installRouteWatcher(); installCollectionWatcher(); await handleRoute();
        window.setTimeout(() => { void checkForUpdates({ manual: false, force: false }); }, 1400);
        window.addEventListener('beforeunload', () => {
            clearInterval(state.routeTimer); clearInterval(state.leaseTimer); clearInterval(state.collectionLeaseTimer); clearInterval(state.collectionSyncTimer); clearTimeout(state.analysisExpiryTimer);
            state.researchProbeWaiters.forEach(clearResearchProbeTimers); state.researchProbeWaiters.clear();
            state.researchUiTimers.forEach((timer) => clearTimeout(timer)); state.researchUiTimers.clear();
            state.researchChannel?.close(); state.tabPresenceChannel?.close();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && state.modal) UI.closeModal();
            const editable = event.composedPath().some((target) => target instanceof Element && Boolean(target.closest('input,textarea,select,button,a[href],[contenteditable="true"],[role="textbox"],[role="button"]')));
            if (event.repeat || event.isComposing || editable || event.getModifierState?.('AltGraph')) return;
            if (event.altKey && event.ctrlKey && !event.shiftKey && !event.metaKey && event.code === 'KeyL') { event.preventDefault(); void UI.setCollapsed(!state.settings.collapsed); }
            if (event.altKey && event.ctrlKey && !event.shiftKey && !event.metaKey && event.code === 'KeyA') { event.preventDefault(); void Collection.toggle(); }
        });
    }

    if (window.__MAKAYTRON_LISTING_TEST__ === true) {
        window.__MELI_TEST__ = Object.freeze({
            versions: Object.freeze({ app: APP_VERSION, recordSchema: RECORD_SCHEMA_VERSION, healthSchema: HEALTH_RESULT_SCHEMA_VERSION, engine: HEALTH_ENGINE_VERSION, policy: HEALTH_POLICY_VERSION, collectionSchema: COLLECTION_SCHEMA_VERSION, queueSchema: QUEUE_SCHEMA_VERSION }),
            parseCountValue,
            parseListingMetrics,
            parseScopedListingMetrics,
            normalizeMetricContract,
            statsViewEnabled,
            routeKind,
            currentListingId,
            currencyMarker,
            finiteOrNull,
            dayKey,
            formatDate,
            translate: t,
            currentShopKey,
            normalizeListingState,
            normalizeSeasonality,
            normalizeListingType,
            pageListingState,
            recommendationBasisMatches,
            validateEditableProposal,
            validateAiProposal,
            pillReadIntegrity: PILL_READ_INTEGRITY,
            editorMatchesExpectedProposal,
            normalizeRecord,
            normalizeQueue,
            normalizeSnapshot,
            mergeDailySnapshot,
            deriveRecordMetrics,
            findAnchor,
            median,
            percentileRank,
            exactPoissonRateRatioInterval,
            relativeEffectSummary,
            normalizeHealthThresholds,
            thresholdContracts: HEALTH_THRESHOLD_CONTRACTS,
            normalizeAnalysisFilters,
            filterFacetValues: FILTER_FACET_VALUES,
            analysisCaseFold,
            scheduleAnalysisSearch,
            analysisRecordFacts,
            recentPerformanceMetrics,
            recordMatchesAnalysisFilters,
            analysisFacetCounts,
            sortAnalysisRecords,
            thresholdCalibration,
            thresholdImpactCounts,
            buildHistoryChartModel,
            normalizeCollection,
            collectionManifestIsComplete,
            collectionIsFresh,
            analysisCollectionIsFresh,
            assertFreshCollection,
            collectionScopeKey,
            collectionScopeHref,
            collectionScopeMatches,
            collectionPageConflict,
            collectionPageMatchesManifest,
            pageIdentityMatchesCollection,
            evaluationScopeRecords,
            elementIsUsable,
            ListingPageAdapter,
            collectionRuntime: Object.freeze({
                state, Store, KEYS, CollectionLease, Collection,
                invalidateCollectionForRecordMutationLocked,
                collectionListingsObservedAt,
            }),
            aiRuntime: Object.freeze({ aiRequestPackage, importAiResponse }),
            backupRuntime: Object.freeze({ normalizeBackupDocument, importBackupDocument }),
            currentCollectionIdentity: () => collectionIdentity(),
            syncCollectionState,
            canonicalEditableContent,
            contentFingerprint,
            researchContentHash,
            researchSeedKeywords,
            researchEnvelope,
            validateResearchEnvelope,
            validateResearchCapabilities,
            validateResearchReadyPayload,
            validateResearchAckPayload,
            validateResearchErrorPayload,
            validateResearchResultPayload,
            validateResearchEvidence,
            validateResearchSuggestion,
            transitionResearchEntry,
            researchResultStatusAccepts,
            buildResearchSuggestion,
            researchSuggestionForRecord,
            importResearchResultJson,
            refreshRecords,
            distributionUrlKind,
            installedDistributionSource,
            updater: Object.freeze({
                state,
                Store,
                UI,
                Queue,
                GITHUB_CANONICAL_SCRIPT_URL,
                GITHUB_API_REF_URL,
                pinnedUpdateUrl,
                exactHttpsTarget,
                metadataValues,
                normalizeUpdateState,
                requestExactText,
                requestCanonicalScript,
                checkForUpdates,
                openTampermonkeyUpdate,
                bindInstallUpdate,
            }),
            actionRuntime: Object.freeze({
                state,
                Store,
                KEYS,
                Lease,
                Queue,
                EditorAdapter,
                installTrustedEditorInteractionWatcher,
                applyCurrentProposal,
                publishCurrentProposal,
                verifyCurrentPublish,
                openCurrentDeactivate,
                verifyCurrentDeactivate,
                automaticDeactivationRecovery,
                skipCurrentItem,
                stopCurrentQueue,
                recoverCurrentItem,
            }),
            settingsRuntime: Object.freeze({
                state, Store, persistThresholdSettings, validateThresholdSettings,
                refreshStorageEstimate, markStorageEstimateDirty,
                capturePanelFocus, restorePanelFocus, installStandaloneDialogBehavior,
                committedPreference, beginPreferenceMutation, preferenceMutationIsCurrent,
            }),
            routeRuntime: Object.freeze({ state, Store, UI, handleRoute, routeLocationKey }),
            updateExperimentEvaluations,
            evaluateRecord(record, peers = [record], settings = DEFAULT_SETTINGS, evaluatedAt = nowIso()) {
                const records = Array.isArray(peers) && peers.length ? peers : [record];
                return evaluateHealthRecords(records, { ...DEFAULT_SETTINGS, ...(settings || {}) }, evaluatedAt).get(String(record.listingId)) || null;
            },
            evaluateRecords(records, settings = DEFAULT_SETTINGS, evaluatedAt = nowIso()) {
                return Object.fromEntries(evaluateHealthRecords(records, { ...DEFAULT_SETTINGS, ...(settings || {}) }, evaluatedAt));
            },
            evaluateRecordsWithDiagnostics(records, settings = DEFAULT_SETTINGS, evaluatedAt = nowIso()) {
                const diagnostics = {};
                const evaluations = Object.fromEntries(evaluateHealthRecords(records, { ...DEFAULT_SETTINGS, ...(settings || {}) }, evaluatedAt, diagnostics));
                return { evaluations, diagnostics };
            },
        });
    }

    if (window.__MAKAYTRON_LISTING_SKIP_INIT__ !== true) {
        void init().catch((error) => {
            console.error(`[${APP.name}]`, error);
            if (state.panel) UI.setStatus('formNotReady', 'error');
        });
    }
})();
