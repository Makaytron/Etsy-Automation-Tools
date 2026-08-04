// ==UserScript==
// @name         Makaytron Etsy Ads Keyword Manager
// @name:tr      Makaytron Etsy Ads Keyword Manager
// @name:en      Makaytron Etsy Ads Keyword Manager
// @version      1.0.2
// @description  Etsy Ads anahtar kelime eşleşmelerini form tabanlı bir panelden yönetin.
// @description:tr Etsy Ads anahtar kelime eşleşmelerini form tabanlı bir panelden yönetin.
// @description:en Manage Etsy Ads keyword matches from a form-based control panel.
// @namespace    https://github.com/Makaytron/EtsyScript
// @author       Makaytron (@Makaytron)
// @license      MIT
// @antifeature  tracking
// @homepageURL  https://github.com/Makaytron/Etsy-Automation-Tools/tree/main/scripts/etsy-ads-keyword-manager
// @supportURL   https://github.com/Makaytron/Etsy-Automation-Tools/issues
// @updateURL    https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-ads-keyword-manager/Makaytron-Etsy-Ads-Keyword-Manager.user.js
// @downloadURL  https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-ads-keyword-manager/Makaytron-Etsy-Ads-Keyword-Manager.user.js
// @match        https://www.etsy.com/your/shops/me/advertising/listings/*
// @icon         https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/assets/makaytron-logo.png
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM.addValueChangeListener
// @grant        GM_info
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_addElement
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @connect      sjwibgcflufmzaorlwqe.supabase.co
// @noframes
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ─── Constants ────────────────────────────────────────────────────────────

    const SCRIPT_SOURCE_URL = 'https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-ads-keyword-manager/Makaytron-Etsy-Ads-Keyword-Manager.user.js';
    const WORD_LIST_URL = 'https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-ads-keyword-manager/keyword-rules.txt';
    const APP_VERSION = '1.0.2';
    const TELEMETRY_ENDPOINT = 'https://sjwibgcflufmzaorlwqe.supabase.co/functions/v1/telemetry-ingest';
    const TELEMETRY_HEADER_NAME = 'x-makaytron-telemetry';
    const TELEMETRY_HEADER_VALUE = '1';
    const TELEMETRY_SCRIPT_ID = 'etsy-ads-keyword-manager';
    const TELEMETRY_ALLOWED_EVENTS = new Set(['script_opened', 'ads_keyword_change_applied']);
    const TELEMETRY_ALLOWED_ERROR_CODES = new Set(['selector_ads_table', 'selector_ads_control', 'selector_ads_pagination', 'selector_ads_verification', 'network_rules_update', 'runtime_keyword_change', 'storage_rules_state']);
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

    const MAKAYTRON_WEBSITE_URL = 'https://makaytron.com';
    // Keep the visible UI self-contained; opening an Etsy Ads page must not fetch a branding asset.
    const MAKAYTRON_LOGO_URL = 'data:image/png;base64,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';
    const PANEL_ROOT_ID = 'makaytron-ad-wordlist';
    const TOAST_ROOT_ID = 'makaytron-ad-wordlist-toasts';
    const EDITOR_MODAL_ID = 'makaytron-ad-wordlist-editor';
    const PANEL_COLLAPSED_KEY = 'adWordlistPanelCollapsed';
    const LANGUAGE_KEY = 'adWordlistLanguage';
    const WORDLIST_BACKUP_KEY = 'adWordlistBackup';
    const SCRIPT_UPDATE_STATE_KEY = 'adKeywordManagerScriptUpdateState';
    const SCRIPT_UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
    const MAX_REMOTE_SCRIPT_BYTES = 1_000_000;
    const KEYWORD_ACCORDION_SELECTOR = '#listing-detail-targeted-keywords-accordion';
    const KEYWORD_ROW_SELECTOR = `${KEYWORD_ACCORDION_SELECTOR} tbody tr.wt-table__row`;
    const PAGE_CHANGE_TIMEOUT_MS = 15_000;
    const INITIAL_ROWS_TIMEOUT_MS = 15_000;
    const MAX_AUTO_PAGES = 100;
    const MAX_WORDLIST_BYTES = 250_000;

    const DEFAULT_WORDLIST = `dtf
svg
png
sticker
zip
hat
=hoody
=hoddy
=hoodie
=womens hoodie
=womens sweatshirts
=women&#39;s sweatshirts
=women hoodies
=graphic hoodies
=graphic hoodie
=hoddies&#39; for women
=graphic hoodies for women
=sweatshirt
=sweater
=mens hoodies
=hoodie women
=hoodies for men
=trendy hoodies
=trendy
=graphic sweatshirt
=plus size hoodie
=toddler
=halloween
=basketball
slippers
=men&#39;s hoodies
doll
design
=nurse
=shirt
decal
embroider
transfer
iron on
pants
earrings
jewelry
purse
ornament
headband
bracelet
necklace
decor
patch
cardigan
skirt
mug
bag
tumbler
=football
dxf
=mens sweatshirt
=gender-neutral adult sweatshirts
=gender-neutral adult hoodies
vinyl
glitter
cricut
=baseball
jacket
=tshirt
=comfort colors
=graphic tees
socks
ready to press
poster
bottle
wall art
shoes
shorts
plushie
plush
pitcher
helmet
glove
blanket
=womens hoodie
=womens sweatshirts
=women&#39;s sweatshirts
=women hoodies
=graphic hoodies
=graphic hoodie
=hoddies&#39; for women
=graphic hoodies for women
=sweatshirt
=sweater
=mens hoodies
=hoodie women
=hoodies for men
=trendy hoodies
=trendy
=graphic sweatshirt
=plus size hoodie
=toddler
=halloween
=basketball
=popular shirts
=shirt for woman
=mom
=trendy shirt
=tshirt
=mama
=popular shirt
=trending shirt
=popular now shirt
=trend
=comfort colors tshirt
=trendy shirts
=plus size graphic tees
=preppy shirt
=mother
=comfort colors
=women shirt
=popular
=women shirts
=graphic tees for women
=womens graphic t shirts
=women’s shirts
=t shirt
=shirts for women
=comfort colors® shirt
=graphic tshirt women
=plus size t shirts
=trend shirt
=trend shirt
=womens tshirts
=bestseller shirt
=trending now shirt
=trendy comfort colors shirt
=comfort colors shirts
=t shirts for women
=trendy tshirts
=comfort colors graphic tee
=comfort tshirt
=comfort tshirt
=comfort colors tee
=adult shirt
=trendy tee
=trendy shirt for women
=womens clothing
=shirt trend
=trendy tshirt
=plus size clothing
=graphic shirts
=trendy shirt women
=trending tshirt
=popular shirts
=womens shirts trendy
=hottrend tshirt
=plus size graphic tee
=graphic tee popular now
=plus size graphic tshirts
=trendy tshirt for women
=women graphic tees
=retro shirts
=plus size t shirt
keychain
=comfort color tshirts
=comfort color t shirts
=womens comfort colors shirts
=comfort color t-shirts
=t shirts
=women graphic shirt
=graphic tee for women
=womens shirts
=womens shirt
=t-shirt
=comfort colors t shirt
=comfort colors shirt
=comfort colors t-shirt
=trending tees
=best selling tshirts
=womens plus size clothing
=trending t shirt
=comfort colors tshirts
=women graphic tee
=women’s tshirts
=women’s graphic tees
=women’s clothing
=womens tshirts trendy
=womens tshirt
=womens t shirts trendy
=womens shirts
=womens shirt
=womens plus size shirts
=womens graphic tshirts
=womens graphic tshirt
=women's t-shirts comfort colors
=women&#39;s shirts
=women&#39;s shirt
=women&#39;s graphic tees
=women&#39;s graphic tee
=women&#39;s comfort colors tshirt
=women&#39;s comfort colors shirt
=women tshirt
=women short sleeve shirts
=women shirt trendy
=women graphic shirts
=tshirts popular now
=tshirts for women trendy
=tshirts for women
=tshirt trendy
=tshirt trending
=tshirt for women trendy
=tshirt for women
=trendy womens shirt
=trendy women shirt
=trendy tshirts women
=trendy tshirts for women
=trendy tees
=trendy t shirts for women
=trendy t shirts
=trendy shirts for women
=trendy graphic tee
=trendy graphic shirts
=trendy gifts
=trendy clothing
=trending tshirts
=trending t shirts
=trending shirts
=t shirt popular now
=t shirt women trendy
=t shirts for women trendy
=this awesome
=stripes shirts
=stripes shirt
=striped t shirt
=striped shirts
=striped shirt women
=striped graphic tees
=stripe tshirt
=shirts trending
=shirts for women trendy
=shirts for women comfort colors
=shirt trendy
=shirt trending today
=shirt trending
=shirt popular now
=shirt for women trendy
=shirt for women
=retro tshirts
=retro tshirt
=retro striped shirt
=popular shirts now
=popular t shirts
=popular tees
=popular tshirt
=preppy shirts
=preppy tshirt
=plus size shirt
=popular gifts
=popular graphic shirt
=popular graphic tee
=popular graphic tshirts
popular now
=popular shirt now
=popular shirts for women
=plus size clothing for women
oversized
=now popular shirts
=graphic shirt
=graphic shirt women
=graphic shirts for women
=graphic tee shirt
=gender-neutral adult clothing
=gift shirt
=comfort colors women`;

    // ─── Localization ─────────────────────────────────────────────────────────

    const I18N = Object.freeze({
        tr: Object.freeze({
            panelAria: 'Makaytron Etsy Ads Keyword Manager kontrol paneli',
            subtitle: 'Makaytron · Reklam Araçları',
            ready: 'Hazır',
            running: 'Çalışıyor',
            completed: 'Tamamlandı',
            warning: 'Uyarı',
            error: 'Hata',
            logoOpen: 'Makaytron web sitesini aç',
            collapsePanel: 'Paneli gizle',
            expandPanel: 'Paneli aç',
            switchLanguage: 'İngilizceye geç',
            languageChanged: 'Dil Türkçe olarak değiştirildi.',
            languageChangeFailed: 'Dil tercihi kaydedilemedi: {error}',
            keywordTableWaiting: 'Anahtar kelime tablosu bekleniyor.',
            statPage: 'Sayfa',
            statRows: 'Satır',
            statMatches: 'Eşleşen',
            statHighRatio: 'Yüksek oran',
            closeCurrentPage: 'Bu sayfadaki eşleşmeleri kapat',
            openCurrentPage: 'Bu sayfadaki eşleşmeleri aç',
            closeAllPages: 'Tüm sayfalardaki eşleşmeleri kapat',
            editWordlist: 'Kelime listesi',
            updateWordlist: 'Listeyi güncelle',
            checkScriptUpdate: 'Sürümü denetle',
            scriptUpdateChecking: 'Yeni script sürümü denetleniyor…',
            scriptUpdateCurrent: 'Etsy Ads Keyword Manager güncel · v{version}',
            scriptUpdateAvailable: 'Yeni sürüm hazır: v{version}',
            scriptUpdateInstall: 'Kurulum sayfasını aç',
            scriptUpdateFailed: 'Sürüm denetlenemedi. Ana araç çalışmaya devam eder: {error}',
            scriptUpdateInvalid: 'Uzak script geçerli bir sürüm bilgisi içermiyor.',
            scriptUpdateBlocked: 'Sürüm denetimi için önce açık editörü veya devam eden kelime işlemini tamamlayın.',
            scriptInstallBlocked: 'Kurulum sayfası, açık editör veya devam eden kelime işlemi varken açılamaz.',
            scriptUpdateExternalSource: 'Güncellemeler kurulum kaynağınız tarafından yönetiliyor; özel GitHub denetimi çalıştırılmadı.',
            scriptUpdateUnknownSource: 'Kurulum kaynağı GitHub olarak doğrulanamadı; özel GitHub denetimi çalıştırılmadı.',
            confirmScriptInstall: 'v{version} kurulum sayfası yeni sekmede açılsın mı? Tampermonkey son onayı sizden isteyecek; hiçbir sürüm sessizce kurulmaz.',
            scriptInstallOpening: 'v{version} kurulum sayfası açılıyor.',
            currentPage: 'mevcut sayfa',
            allPages: 'tüm sayfalar',
            safeMatchMode: 'Kullanıcı kontrollü eşleşme',
            requestTimeout: 'İstek zaman aşımına uğradı.',
            rowOne: 'satır',
            rowMany: 'satır',
            matchOne: 'eşleşme',
            matchMany: 'eşleşme',
            keywordOne: 'kelime',
            keywordMany: 'kelime',
            ruleOne: 'kural',
            ruleMany: 'kural',
            enabled: 'açıldı',
            disabled: 'kapatıldı',
            keywordFallback: 'Kelime',
            keywordChangeFailed: '{keyword} değiştirilemedi.',
            keywordChanged: '{keyword}\nKelime {state}',
            nextButtonMissing: 'Sonraki sayfa düğmesi bulunamadı; işlem güvenli biçimde durduruldu.',
            nextPageTimeout: 'Sonraki anahtar kelime sayfası zamanında yüklenmedi.',
            keywordRowsFailed: 'Anahtar kelime satırları yüklenemedi.',
            repeatedPage: 'Aynı anahtar kelime sayfası tekrar algılandı; işlem durduruldu.',
            processingPage: '{page}. sayfadaki eşleşmeler işleniyor.',
            processingKeywords: 'Kelimeler işleniyor',
            maxPagesReached: 'Güvenlik sınırı olan {count} sayfaya ulaşıldı.',
            totalChanged: 'Toplam {keywords} {state}.',
            operationBusy: 'Başka bir kelime işlemi zaten devam ediyor.',
            editorOperationBlocked: 'Önce açık kelime listesi formunu kapatın veya kaydedin.',
            allPagesWillProcess: 'Tüm sayfalardaki eşleşmeler işlenecek.',
            confirmAllPages: 'Tüm sayfalardaki eşleşen Etsy Ads anahtar kelimeleri kapatılacak. Devam edilsin mi?',
            confirmCurrentPageShortcut: 'Klavye kısayolu bu sayfadaki eşleşen Etsy Ads anahtar kelimelerini kapatacak. Devam edilsin mi?',
            currentPageProcessing: 'Mevcut sayfa işleniyor.',
            operationStopped: 'İşlem durduruldu: {error}',
            operationStoppedFallback: 'İşlem durduruldu.',
            consoleOperationFailed: 'İşlem başarısız:',
            remoteChecking: 'Uzak kelime listesi denetleniyor.',
            confirmListUpdate: 'Kayıtlı kelime listeniz GitHub’daki varsayılan listeyle değiştirilecek. Mevcut listenin yedeği alınarak devam edilsin mi?',
            confirmListRestore: 'Yedeklenen kelime listesi geri yüklensin mi?',
            listUpdating: 'Liste güncelleniyor',
            remoteListEmpty: 'Uzak kelime listesi boş.',
            remoteListTooLarge: 'Uzak kelime listesi beklenenden büyük.',
            fetchingKeywords: 'Kelimeler alınıyor',
            keywordsUpdated: '{keywords} güncellendi.',
            keywordsUpdatedSuccess: '{keywords} başarıyla güncellendi.',
            backupListMissing: 'Geri yüklenecek kelime listesi yedeği bulunamadı.',
            backupRestored: 'Yedek kelime listesi geri yüklendi.',
            backupRestoredStatus: 'Yedek geri yüklendi · {rules} · {matches}.',
            backupRestoreFailed: 'Yedek kelime listesi geri yüklenemedi: {error}',
            consoleListFailed: 'Kelime listesi alınamadı:',
            listFetchFailed: 'Kelimeler alınamadı: {error}',
            listFetchFailedFallback: 'Kelime listesi alınamadı.',
            editorTitle: 'Kelime Listesi',
            close: 'Kapat',
            editorNote: 'Teknik işaret kullanmanıza gerek yok. Kelime veya ifadeyi yazın, ardından listedeki hangi anahtar kelimeleri bulacağını seçin.',
            addRuleTitle: 'Yeni kelime filtresi ekle',
            editRuleTitle: 'Eklenen filtreyi düzenle',
            ruleValueLabel: 'Filtrelemek istediğiniz kelime veya ifade',
            ruleValuePlaceholder: 'Örn. t-shirt veya comfort colors',
            matchTypeLabel: 'Listedeki hangi anahtar kelimeleri bulsun?',
            matchContains: 'İfadeyi içeriyor',
            matchExact: 'Birebir aynı',
            matchRegex: 'Özel kural',
            matchContainsOption: 'İfadeyi içeriyorsa (önerilen)',
            matchExactOption: 'Yalnızca birebir aynıysa',
            matchRegexOption: 'Özel arama kuralı (ileri seviye)',
            matchContainsHelp: 'Örnek: “bts” yazarsanız “bts shirt” ve “cute bts gift” gibi içinde “bts” geçen anahtar kelimeler bulunur.',
            matchExactHelp: 'Örnek: “bts shirt” yazarsanız yalnızca aynı anahtar kelime bulunur; önünde veya sonunda başka kelime olanlar bulunmaz.',
            matchRegexHelp: 'Yalnızca özel arama kalıplarını bilen ileri düzey kullanıcılar içindir. Emin değilseniz ilk seçeneği kullanın.',
            customRuleValueLabel: 'Özel arama kuralı',
            customRulePlaceholder: 'Örn. bts|army',
            addRule: 'Listeye ekle',
            updateRule: 'Değişikliği uygula',
            cancelEdit: 'Düzenlemeyi iptal et',
            ruleListTitle: 'Eklenen filtreler',
            searchRulesPlaceholder: 'Kurallarda ara',
            searchRulesAria: 'Kural listesinde ara',
            noRules: 'Henüz kural eklenmedi.',
            noSearchResults: 'Aramanızla eşleşen kural bulunamadı.',
            editRule: 'Kuralı düzenle',
            removeRule: 'Kuralı sil',
            ruleRequired: 'Bir kelime veya ifade yazın.',
            invalidRegex: 'Özel arama kuralı geçerli değil. İşaretleri kontrol edip yeniden deneyin.',
            duplicateRule: 'Bu kural listede zaten var.',
            pendingRule: 'Önce yazdığınız filtreyi “Listeye ekle” düğmesiyle ekleyin veya alanı temizleyin.',
            pendingEdit: 'Önce değişikliği uygulayın veya düzenlemeyi iptal edin.',
            discardChanges: 'Kaydedilmemiş değişiklikler silinsin mi?',
            localListTooLarge: 'Kural listesi izin verilen boyutu aşıyor.',
            ruleAdded: 'Kural eklendi.',
            ruleUpdated: 'Kural güncellendi.',
            ruleRemoved: 'Kural silindi.',
            cancel: 'Vazgeç',
            save: 'Kaydet',
            editorDirty: 'Kaydedilmedi · {matches} mevcut',
            editorSaved: 'Kayıtlı · {matches} mevcut',
            atLeastOneRule: 'En az bir kural gerekli.',
            emptyListCannotSave: 'Kelime listesi boş kaydedilemez.',
            rulesSaved: '{rules} kaydedildi.',
            rulesSavedStatus: '{rules} kaydedildi · {matches}.',
            rulesSavedPreviewFailed: '{rules} kaydedildi; ancak sayfadaki önizleme yenilenemedi: {error}',
            editorSaveFailed: 'Kelime listesi kaydedilemedi: {error}',
            menuCloseCurrent: 'Bu sayfadaki eşleşmeleri kapat',
            menuOpenCurrent: 'Bu sayfadaki eşleşmeleri aç',
            menuCloseAll: 'Tüm sayfalarda kapat',
            menuUpdateList: 'Kelime listesini güncelle',
            menuRestoreList: 'Yedek kelime listesini geri yükle',
            menuEditList: 'Kelime listesini düzenle',
            menuTogglePanel: 'Paneli aç veya gizle',
            menuSwitchLanguage: 'İngilizceye geç',
            menuCheckScriptUpdate: 'Script sürümünü denetle',
            loadingKeywordTable: 'Anahtar kelime tablosu yükleniyor.',
            preparing: 'Hazırlanıyor',
            keywordTableFailed: 'Anahtar kelime tablosu yüklenemedi.',
            rowsReady: '{rows} bulundu · {matches} hazır.',
            appReady: 'Makaytron Etsy Ads Keyword Manager hazır · CTRL + ALT + K',
            consoleInitializationFailed: 'Başlatma başarısız:',
            appStartFailed: 'Kelime Yöneticisi başlatılamadı: {error}',
            appStartFailedFallback: 'Kelime Yöneticisi başlatılamadı.',
        }),
        en: Object.freeze({
            panelAria: 'Makaytron Etsy Ads Keyword Manager control panel',
            subtitle: 'Makaytron · Ads Toolkit',
            ready: 'Ready',
            running: 'Running',
            completed: 'Completed',
            warning: 'Warning',
            error: 'Error',
            logoOpen: 'Open the Makaytron website',
            collapsePanel: 'Hide panel',
            expandPanel: 'Open panel',
            switchLanguage: 'Switch to Turkish',
            languageChanged: 'Language changed to English.',
            languageChangeFailed: 'Could not save the language preference: {error}',
            keywordTableWaiting: 'Waiting for the keyword table.',
            statPage: 'Page',
            statRows: 'Rows',
            statMatches: 'Matches',
            statHighRatio: 'High ratio',
            closeCurrentPage: 'Disable matches on this page',
            openCurrentPage: 'Enable matches on this page',
            closeAllPages: 'Disable matches on all pages',
            editWordlist: 'Keyword list',
            updateWordlist: 'Update list',
            checkScriptUpdate: 'Check version',
            scriptUpdateChecking: 'Checking for a newer script version…',
            scriptUpdateCurrent: 'Etsy Ads Keyword Manager is current · v{version}',
            scriptUpdateAvailable: 'A new version is ready: v{version}',
            scriptUpdateInstall: 'Open install page',
            scriptUpdateFailed: 'The version check failed. The main tool remains available: {error}',
            scriptUpdateInvalid: 'The remote script does not contain valid version metadata.',
            scriptUpdateBlocked: 'Finish the open editor or keyword operation before checking the script version.',
            scriptInstallBlocked: 'The install page cannot open while an editor or keyword operation is active.',
            scriptUpdateExternalSource: 'Updates are managed by your installation source; the private GitHub check was not run.',
            scriptUpdateUnknownSource: 'The installation source could not be verified as GitHub; the private GitHub check was not run.',
            confirmScriptInstall: 'Open the v{version} install page in a new tab? Tampermonkey will ask for final approval; no version is installed silently.',
            scriptInstallOpening: 'Opening the v{version} install page.',
            currentPage: 'current page',
            allPages: 'all pages',
            safeMatchMode: 'User-controlled matching',
            requestTimeout: 'The request timed out.',
            rowOne: 'row',
            rowMany: 'rows',
            matchOne: 'match',
            matchMany: 'matches',
            keywordOne: 'keyword',
            keywordMany: 'keywords',
            ruleOne: 'rule',
            ruleMany: 'rules',
            enabled: 'enabled',
            disabled: 'disabled',
            keywordFallback: 'Keyword',
            keywordChangeFailed: '{keyword} could not be changed.',
            keywordChanged: '{keyword}\nKeyword {state}',
            nextButtonMissing: 'The Next button was not found; the operation stopped safely.',
            nextPageTimeout: 'The next keyword page did not load in time.',
            keywordRowsFailed: 'Keyword rows could not be loaded.',
            repeatedPage: 'The same keyword page was detected again; the operation stopped.',
            processingPage: 'Processing matches on page {page}.',
            processingKeywords: 'Processing keywords',
            maxPagesReached: 'The safety limit of {count} pages was reached.',
            totalChanged: '{keywords} {state} in total.',
            operationBusy: 'Another keyword operation is already running.',
            editorOperationBlocked: 'Close or save the open keyword-list form first.',
            allPagesWillProcess: 'Matches on every page will be processed.',
            confirmAllPages: 'Matching Etsy Ads keywords on every page will be disabled. Continue?',
            confirmCurrentPageShortcut: 'The keyboard shortcut will disable matching Etsy Ads keywords on this page. Continue?',
            currentPageProcessing: 'Processing the current page.',
            operationStopped: 'Operation stopped: {error}',
            operationStoppedFallback: 'The operation stopped.',
            consoleOperationFailed: 'Operation failed:',
            remoteChecking: 'Checking the remote keyword list.',
            confirmListUpdate: 'Your saved keyword list will be replaced with the default list from GitHub. Continue after backing up the current list?',
            confirmListRestore: 'Restore the backed-up keyword list?',
            listUpdating: 'Updating list',
            remoteListEmpty: 'The remote keyword list is empty.',
            remoteListTooLarge: 'The remote keyword list is larger than expected.',
            fetchingKeywords: 'Fetching keywords',
            keywordsUpdated: '{keywords} updated.',
            keywordsUpdatedSuccess: '{keywords} updated successfully.',
            backupListMissing: 'No backed-up keyword list is available to restore.',
            backupRestored: 'The backed-up keyword list was restored.',
            backupRestoredStatus: 'Backup restored · {rules} · {matches}.',
            backupRestoreFailed: 'Could not restore the backed-up keyword list: {error}',
            consoleListFailed: 'Could not retrieve the keyword list:',
            listFetchFailed: 'Could not retrieve keywords: {error}',
            listFetchFailedFallback: 'Could not retrieve the keyword list.',
            editorTitle: 'Keyword List',
            close: 'Close',
            editorNote: 'No technical symbols are required. Enter a keyword or phrase, then choose which keywords in the list it should find.',
            addRuleTitle: 'Add a new keyword filter',
            editRuleTitle: 'Edit the selected filter',
            ruleValueLabel: 'Keyword or phrase you want to filter',
            ruleValuePlaceholder: 'e.g. t-shirt or comfort colors',
            matchTypeLabel: 'Which keywords in the list should this find?',
            matchContains: 'Contains keyword',
            matchExact: 'Exact wording',
            matchRegex: 'Custom rule',
            matchContainsOption: 'Contains entered text (recommended)',
            matchExactOption: 'Exact same wording only',
            matchRegexOption: 'Custom search rule (advanced)',
            matchContainsHelp: 'Example: entering “bts” finds keywords such as “bts shirt” and “cute bts gift”.',
            matchExactHelp: 'Example: entering “bts shirt” finds only that exact keyword; keywords with extra words are excluded.',
            matchRegexHelp: 'For advanced users who already know custom search patterns. If you are unsure, use the first option.',
            customRuleValueLabel: 'Custom search rule',
            customRulePlaceholder: 'e.g. bts|army',
            addRule: 'Add to list',
            updateRule: 'Apply change',
            cancelEdit: 'Cancel editing',
            ruleListTitle: 'Added filters',
            searchRulesPlaceholder: 'Search rules',
            searchRulesAria: 'Search the rule list',
            noRules: 'No rules have been added yet.',
            noSearchResults: 'No rules match your search.',
            editRule: 'Edit rule',
            removeRule: 'Remove rule',
            ruleRequired: 'Enter a keyword or phrase.',
            invalidRegex: 'That custom search rule is not valid. Check the symbols and try again.',
            duplicateRule: 'This rule already exists in the list.',
            pendingRule: 'Use “Add to list” to add the filter you entered, or clear the field first.',
            pendingEdit: 'Apply the change or cancel editing first.',
            discardChanges: 'Discard unsaved changes?',
            localListTooLarge: 'The rule list exceeds the allowed size.',
            ruleAdded: 'Rule added.',
            ruleUpdated: 'Rule updated.',
            ruleRemoved: 'Rule removed.',
            cancel: 'Cancel',
            save: 'Save',
            editorDirty: 'Unsaved · {matches} on this page',
            editorSaved: 'Saved · {matches} on this page',
            atLeastOneRule: 'At least one rule is required.',
            emptyListCannotSave: 'The keyword list cannot be saved while empty.',
            rulesSaved: '{rules} saved.',
            rulesSavedStatus: '{rules} saved · {matches}.',
            rulesSavedPreviewFailed: '{rules} saved, but the page preview could not be refreshed: {error}',
            editorSaveFailed: 'Could not save the keyword list: {error}',
            menuCloseCurrent: 'Disable matches on this page',
            menuOpenCurrent: 'Enable matches on this page',
            menuCloseAll: 'Disable matches on all pages',
            menuUpdateList: 'Update keyword list',
            menuRestoreList: 'Restore backed-up keyword list',
            menuEditList: 'Edit keyword list',
            menuTogglePanel: 'Show or hide panel',
            menuSwitchLanguage: 'Switch to Turkish',
            menuCheckScriptUpdate: 'Check script version',
            loadingKeywordTable: 'Loading the keyword table.',
            preparing: 'Preparing',
            keywordTableFailed: 'The keyword table could not be loaded.',
            rowsReady: '{rows} found · {matches} ready.',
            appReady: 'Makaytron Etsy Ads Keyword Manager is ready · CTRL + ALT + K',
            consoleInitializationFailed: 'Initialization failed:',
            appStartFailed: 'Keyword Manager could not start: {error}',
            appStartFailedFallback: 'Keyword Manager could not start.',
        }),
    });

    let currentLanguage = 'tr';
    let languageLoaded = false;

    function t(key, params = {}) {
        const template = I18N[currentLanguage]?.[key] ?? I18N.tr[key] ?? key;
        return String(template).replace(/\{([a-zA-Z]\w*)\}/g, (match, name) => (
            Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
        ));
    }

    function quantity(count, unit) {
        const value = Number(count) || 0;
        const form = value === 1 ? 'One' : 'Many';
        return `${value} ${t(`${unit}${form}`)}`;
    }

    async function loadLanguage() {
        if (languageLoaded) return currentLanguage;
        try {
            currentLanguage = (await GM.getValue(LANGUAGE_KEY, 'tr')) === 'en' ? 'en' : 'tr';
        } catch {
            currentLanguage = 'tr';
        }
        languageLoaded = true;
        return currentLanguage;
    }

    // ─── Makaytron UI theme ───────────────────────────────────────────────────

    function addStyle(css) {
        try {
            return GM_addElement('style', { type: 'text/css', textContent: css });
        } catch {
            const style = document.createElement('style');
            style.textContent = css;
            (document.head || document.documentElement).appendChild(style);
            return style;
        }
    }

    addStyle(`
        #${PANEL_ROOT_ID}{--maw-bg:#fff;--maw-fg:#171717;--maw-card:#fff;--maw-muted:#f7f7f7;--maw-muted-2:#f2f2f2;--maw-muted-fg:#737373;--maw-border:#e7e7e7;--maw-input:#dedede;--maw-primary:#1f1f1f;--maw-primary-fg:#fafafa;--maw-danger:#b91c1c;--maw-danger-soft:#fff1f1;--maw-warning:#8a5a00;--maw-warning-soft:#fff8ed;--maw-success:#276749;--maw-success-soft:#eef8f1;position:fixed;right:18px;top:86px;width:372px;z-index:2147483645;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:var(--maw-fg);font-variant-numeric:tabular-nums}
        #${PANEL_ROOT_ID} *,#${EDITOR_MODAL_ID} *{box-sizing:border-box}
        #${PANEL_ROOT_ID} .maw-card{overflow:hidden;border:1px solid var(--maw-border);border-radius:11px;background:var(--maw-card);box-shadow:0 1px 3px rgba(15,23,42,.08),0 12px 30px rgba(15,23,42,.08)}
        #${PANEL_ROOT_ID} .maw-head{padding:13px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--maw-border);background:#fff}
        #${PANEL_ROOT_ID} .maw-brand,.maw-modal-brand{min-width:0;display:flex;align-items:center;gap:10px}
        #${PANEL_ROOT_ID} .maw-logo-shell,.maw-modal-logo-shell{width:48px;height:32px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;text-decoration:none}
        #${PANEL_ROOT_ID} .maw-logo,.maw-modal-logo{display:block;width:43px;height:auto;object-fit:contain}
        #${PANEL_ROOT_ID} .maw-brand-copy{min-width:0}
        #${PANEL_ROOT_ID} .maw-title{margin:0;font-size:13.5px;font-weight:700;letter-spacing:-.015em;line-height:1.22}
        #${PANEL_ROOT_ID} .maw-sub{margin-top:3px;color:var(--maw-muted-fg);font-size:11.5px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #${PANEL_ROOT_ID} .maw-head-tools{display:flex;align-items:center;gap:7px;flex:0 0 auto}
        #${PANEL_ROOT_ID} .maw-head-meta{display:flex;flex-direction:column;align-items:flex-end;gap:5px}
        #${PANEL_ROOT_ID} .maw-version,#${PANEL_ROOT_ID} .maw-pill{height:20px;padding:0 7px;display:inline-flex;align-items:center;border:1px solid var(--maw-border);border-radius:999px;background:var(--maw-muted);color:#525252;font-size:10.5px;font-weight:650;white-space:nowrap}
        #${PANEL_ROOT_ID} .maw-version{min-height:20px!important;cursor:pointer}
        #${PANEL_ROOT_ID} .maw-version:hover{border-color:#cfcfcf;background:#fff;color:#171717}
        #${PANEL_ROOT_ID} .maw-pill{gap:5px;background:#fff}
        #${PANEL_ROOT_ID} .maw-pill::before{content:'';width:6px;height:6px;border-radius:50%;background:#a3a3a3}
        #${PANEL_ROOT_ID} .maw-pill[data-state='running']::before{background:#171717;box-shadow:0 0 0 3px rgba(23,23,23,.08)}
        #${PANEL_ROOT_ID} .maw-pill[data-state='success']{color:var(--maw-success);background:var(--maw-success-soft);border-color:#c9dfd1}
        #${PANEL_ROOT_ID} .maw-pill[data-state='success']::before{background:var(--maw-success)}
        #${PANEL_ROOT_ID} .maw-pill[data-state='warning']{color:var(--maw-warning);background:var(--maw-warning-soft);border-color:#eed69a}
        #${PANEL_ROOT_ID} .maw-pill[data-state='warning']::before{background:var(--maw-warning)}
        #${PANEL_ROOT_ID} .maw-pill[data-state='error']{color:#991b1b;background:var(--maw-danger-soft);border-color:#f1c0c0}
        #${PANEL_ROOT_ID} .maw-pill[data-state='error']::before{background:var(--maw-danger)}
        #${PANEL_ROOT_ID} button,.maw-modal button{min-height:36px;padding:0 12px;display:inline-flex;align-items:center;justify-content:center;gap:6px;border-radius:6px;font:650 12.5px/1 Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;cursor:pointer;transition:background .15s ease,border-color .15s ease,color .15s ease,box-shadow .15s ease;white-space:nowrap}
        #${PANEL_ROOT_ID} button:focus-visible,.maw-modal button:focus-visible,.maw-modal textarea:focus-visible{outline:2px solid #525252;outline-offset:2px}
        #${PANEL_ROOT_ID} button:disabled,.maw-modal button:disabled{opacity:.5;cursor:not-allowed}
        #${PANEL_ROOT_ID} .maw-icon-btn,.maw-modal .maw-icon-btn{width:30px;min-width:30px;height:30px;min-height:30px;padding:0;border:1px solid var(--maw-border,#e7e7e7);background:#fff;color:#737373}
        #${PANEL_ROOT_ID} .maw-icon-btn:hover,.maw-modal .maw-icon-btn:hover{background:#f7f7f7;color:#171717}
        #${PANEL_ROOT_ID} .maw-lang-btn{height:24px;min-height:24px!important;min-width:30px;padding:0 7px!important;border:1px solid var(--maw-border);border-radius:6px;background:#fff;color:#404040;font-size:10.5px!important;font-weight:750!important;letter-spacing:.03em}
        #${PANEL_ROOT_ID} .maw-lang-btn:hover{border-color:#cfcfcf;background:#f7f7f7}
        .maw-svg{width:15px;height:15px;display:block;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
        #${PANEL_ROOT_ID} .maw-body{padding:14px}
        #${PANEL_ROOT_ID} .maw-status-card{margin-bottom:12px;padding:10px 11px;display:flex;align-items:flex-start;gap:9px;border:1px solid var(--maw-border);border-radius:8px;background:var(--maw-muted)}
        #${PANEL_ROOT_ID} .maw-status-icon{width:25px;height:25px;display:grid;place-items:center;flex:0 0 auto;border:1px solid var(--maw-border);border-radius:7px;background:#fff;color:#525252}
        #${PANEL_ROOT_ID} .maw-status-copy{min-width:0}
        #${PANEL_ROOT_ID} .maw-status-title{font-size:12.5px;font-weight:700;color:#262626}
        #${PANEL_ROOT_ID} .maw-status-text{margin-top:2px;color:#525252;font-size:11.5px;line-height:1.42;overflow-wrap:anywhere}
        #${PANEL_ROOT_ID} .maw-update-banner{margin:-2px 0 12px;padding:9px 10px;display:flex;align-items:center;justify-content:space-between;gap:9px;border:1px solid var(--maw-border);border-radius:8px;background:#fafafa;color:#525252;font-size:11.5px;line-height:1.4}
        #${PANEL_ROOT_ID} .maw-update-banner[hidden]{display:none}
        #${PANEL_ROOT_ID} .maw-update-banner[data-state='available']{border-color:#eed69a;background:var(--maw-warning-soft);color:var(--maw-warning)}
        #${PANEL_ROOT_ID} .maw-update-banner[data-state='error']{border-color:#f1c0c0;background:var(--maw-danger-soft);color:#991b1b}
        #${PANEL_ROOT_ID} .maw-update-banner[data-state='current']{border-color:#c9dfd1;background:var(--maw-success-soft);color:var(--maw-success)}
        #${PANEL_ROOT_ID} .maw-update-message{min-width:0;overflow-wrap:anywhere}
        #${PANEL_ROOT_ID} .maw-update-install{min-height:30px;padding:0 9px;flex:0 0 auto;border:1px solid currentColor;background:#fff;color:inherit;font-size:11px}
        #${PANEL_ROOT_ID} .maw-update-install[hidden]{display:none}
        #${PANEL_ROOT_ID} .maw-grid{margin-bottom:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px}
        #${PANEL_ROOT_ID} .maw-chip{min-width:0;padding:9px 10px;border:1px solid var(--maw-border);border-radius:8px;background:#fff}
        #${PANEL_ROOT_ID} .maw-label{margin-bottom:4px;color:#8a8a8a;font-size:10px;font-weight:650;letter-spacing:.07em;text-transform:uppercase}
        #${PANEL_ROOT_ID} .maw-value{overflow:hidden;color:#171717;font-size:13px;font-weight:700;line-height:1.3;text-overflow:ellipsis;white-space:nowrap}
        #${PANEL_ROOT_ID} .maw-value[data-tone='warning']{color:var(--maw-warning)}
        #${PANEL_ROOT_ID} .maw-value[data-tone='danger']{color:var(--maw-danger)}
        #${PANEL_ROOT_ID} .maw-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
        #${PANEL_ROOT_ID} .maw-actions .maw-wide{grid-column:1/-1}
        #${PANEL_ROOT_ID} .maw-primary{border:1px solid var(--maw-primary);background:var(--maw-primary);color:var(--maw-primary-fg);box-shadow:0 1px 2px rgba(0,0,0,.08)}
        #${PANEL_ROOT_ID} .maw-primary:hover{border-color:#303030;background:#303030}
        #${PANEL_ROOT_ID} .maw-secondary,.maw-modal .maw-secondary{border:1px solid var(--maw-input,#dedede);background:#fff;color:#171717;box-shadow:0 1px 2px rgba(0,0,0,.04)}
        #${PANEL_ROOT_ID} .maw-secondary:hover,.maw-modal .maw-secondary:hover{border-color:#cfcfcf;background:#f7f7f7}
        #${PANEL_ROOT_ID} .maw-warning{border:1px solid #eed69a;background:#fff;color:#8a5a00}
        #${PANEL_ROOT_ID} .maw-warning:hover{border-color:#dfc26f;background:#fffaf0}
        #${PANEL_ROOT_ID} .maw-help{margin-top:11px;padding:9px 10px;border:1px solid var(--maw-border);border-radius:8px;background:#fafafa;color:#737373;font-size:11px;line-height:1.45}
        #${PANEL_ROOT_ID} .maw-key{padding:2px 5px;border:1px solid #d7d7d7;border-bottom-width:2px;border-radius:4px;background:#fff;color:#404040;font:650 10.5px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace}
        #${PANEL_ROOT_ID} .maw-footer{margin-top:12px;padding-top:11px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid var(--maw-border);font-size:11.5px}
        #${PANEL_ROOT_ID} .maw-footer-tools{display:flex;align-items:center;justify-content:flex-end;gap:7px;min-width:0}
        #${PANEL_ROOT_ID} .maw-footer a{display:inline-flex;align-items:center;gap:5px;color:#525252;font-weight:600;text-decoration:none}
        #${PANEL_ROOT_ID} .maw-footer a:hover{color:#171717;text-decoration:underline;text-underline-offset:3px}
        #${PANEL_ROOT_ID} .maw-collapsed-tab{display:none;width:44px;height:58px;min-height:58px;padding:0;border:1px solid #2b2b2b;border-right:0;border-radius:9px 0 0 9px;background:#1f1f1f;color:#fff;box-shadow:0 8px 22px rgba(0,0,0,.18)}
        #${PANEL_ROOT_ID}.is-collapsed{right:0;top:148px;width:44px}
        #${PANEL_ROOT_ID}.is-collapsed .maw-card{display:none}
        #${PANEL_ROOT_ID}.is-collapsed .maw-collapsed-tab{display:flex}
        #${TOAST_ROOT_ID}{position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:390px;display:flex;flex-direction:column;gap:8px;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;pointer-events:none}
        .maw-toast{opacity:0;transform:translateY(8px);padding:11px 13px;border:1px solid rgba(255,255,255,.13);border-radius:8px;background:#262626;color:#fff;box-shadow:0 12px 28px rgba(15,23,42,.2);font-size:12.5px;line-height:1.45;white-space:pre-line;transition:opacity .2s ease,transform .2s ease}
        .maw-toast.is-visible{opacity:1;transform:translateY(0)}.maw-toast.success{background:#276749}.maw-toast.warning{background:#8a5a00}.maw-toast.error{background:#b91c1c}
        .maw-modal-backdrop{position:fixed;inset:0;z-index:2147483646;padding:6vh 18px 24px;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;background:rgba(0,0,0,.30);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#171717}
        .maw-modal{--maw-border:#e7e7e7;--maw-muted:#f7f7f7;--maw-input:#dedede;--maw-primary:#1f1f1f;width:min(820px,calc(100vw - 32px));max-height:88vh;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--maw-border);border-radius:12px;background:#fff;box-shadow:0 25px 50px -12px rgba(0,0,0,.26)}
        .maw-modal-head{min-height:64px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--maw-border);background:#fff}
        .maw-modal-logo{width:43px}.maw-modal-title{margin:0;font-size:15px;font-weight:700;letter-spacing:-.015em}.maw-modal-subtitle{margin-top:3px;color:#737373;font-size:11.5px;line-height:1.35}
        .maw-modal-body{padding:18px;overflow:auto;background:#f7f7f7}
        .maw-modal-note{margin-bottom:12px;padding:11px 12px;border:1px solid #e7e7e7;border-radius:8px;background:#fff;color:#525252;font-size:12px;line-height:1.5}
        .maw-modal-note code{padding:2px 5px;border:1px solid #e1e1e1;border-radius:4px;background:#f5f5f5;color:#262626;font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}
        .maw-rule-form-card,.maw-rule-list-card{overflow:hidden;border:1px solid #d9d9d9;border-radius:9px;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.04)}
        .maw-rule-list-card{margin-top:12px}
        .maw-section-head{min-height:43px;padding:8px 11px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid #e7e7e7;background:#fafafa}
        .maw-section-title{margin:0;color:#262626;font-size:12.5px;font-weight:700}.maw-section-count{color:#737373;font-size:11.5px;font-weight:650}
        .maw-rule-form{padding:13px}.maw-form-grid{display:grid;grid-template-columns:minmax(220px,1fr) minmax(280px,1.15fr) auto;gap:10px;align-items:end}
        .maw-field{min-width:0;display:grid;gap:5px}.maw-field-label{color:#404040;font-size:11.5px;font-weight:700}
        .maw-rule-input,.maw-rule-select,.maw-rule-search{width:100%;height:40px;padding:0 11px;border:1px solid #d9d9d9;border-radius:7px;outline:none;background:#fff;color:#171717;font:12.5px/1.3 Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;transition:border-color .15s ease,box-shadow .15s ease}
        .maw-rule-input:focus,.maw-rule-select:focus,.maw-rule-search:focus{border-color:#525252;box-shadow:0 0 0 3px rgba(23,23,23,.09)}
        .maw-rule-submit{height:40px;min-height:40px!important}.maw-rule-form-meta{min-height:27px;margin-top:9px;display:flex;align-items:center;gap:10px}
        .maw-match-help{min-width:0;flex:1;color:#737373;font-size:11.5px;line-height:1.4}.maw-form-feedback{color:#737373;font-size:11.5px;font-weight:650}.maw-form-feedback.is-success{color:#276749}.maw-form-feedback.is-error{color:#b91c1c}
        .maw-cancel-edit{min-height:28px!important;height:28px;padding:0 8px!important;border:0!important;background:transparent!important;color:#737373!important;font-size:11.5px!important}.maw-cancel-edit[hidden]{display:none!important}.maw-cancel-edit:hover{color:#171717!important;text-decoration:underline}
        .maw-rule-search-wrap{width:min(230px,48%)}.maw-rule-search{height:32px;padding:0 9px;font-size:11.5px}
        .maw-rule-list{max-height:320px;overflow:auto}.maw-rule-row{min-height:55px;padding:9px 10px;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;border-bottom:1px solid #ededed}.maw-rule-row:last-child{border-bottom:0}
        .maw-rule-badge{min-width:66px;padding:4px 7px;border:1px solid #dedede;border-radius:999px;background:#f7f7f7;color:#525252;font-size:10px;font-weight:750;text-align:center;white-space:nowrap}.maw-rule-badge[data-type='exact']{border-color:#eed69a;background:#fff8ed;color:#8a5a00}.maw-rule-badge[data-type='regex']{border-color:#d6d6d6;background:#f0f0f0;color:#262626}
        .maw-rule-value{min-width:0;overflow:hidden;color:#262626;font:12.5px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;text-overflow:ellipsis;white-space:nowrap}.maw-rule-actions{display:flex;align-items:center;gap:5px}
        .maw-row-btn{width:30px!important;min-width:30px!important;height:30px!important;min-height:30px!important;padding:0!important;border:1px solid #e1e1e1!important;border-radius:6px!important;background:#fff!important;color:#737373!important}.maw-row-btn:hover{border-color:#cfcfcf!important;background:#f7f7f7!important;color:#171717!important}.maw-row-btn.is-danger:hover{border-color:#f1c0c0!important;background:#fff1f1!important;color:#b91c1c!important}
        .maw-rule-empty{min-height:120px;padding:24px;display:grid;place-items:center;color:#737373;font-size:12px;text-align:center}
        .maw-modal-footer{padding:12px 16px;display:flex;align-items:center;justify-content:flex-end;gap:8px;border-top:1px solid var(--maw-border);background:#fafafa}
        .maw-modal-status{margin-right:auto;color:#737373;font-size:11.5px}.maw-modal-status.is-dirty{color:#8a5a00}.maw-modal-status.is-saved{color:#276749}
        .maw-modal .maw-primary{border:1px solid #1f1f1f;background:#1f1f1f;color:#fafafa}.maw-modal .maw-primary:hover{background:#303030;border-color:#303030}
        @media(max-width:760px){#${PANEL_ROOT_ID}{top:auto;right:12px;bottom:12px;left:12px;width:auto}#${PANEL_ROOT_ID}.is-collapsed{top:auto;right:0;bottom:88px;left:auto;width:44px}#${PANEL_ROOT_ID} .maw-card{max-height:calc(100dvh - 24px);overflow-x:hidden;overflow-y:auto}#${PANEL_ROOT_ID} .maw-head{position:sticky;top:0;z-index:2}#${PANEL_ROOT_ID} .maw-grid,#${PANEL_ROOT_ID} .maw-actions{grid-template-columns:1fr}#${PANEL_ROOT_ID} .maw-actions .maw-wide{grid-column:auto}#${TOAST_ROOT_ID}{right:12px;bottom:12px;left:auto;width:min(320px,calc(100vw - 24px));max-width:none}#${TOAST_ROOT_ID} .maw-toast{width:100%}#${TOAST_ROOT_ID} .maw-toast:nth-last-child(n+3){display:none}.maw-modal-backdrop{padding:10px}.maw-modal{width:100%;max-height:calc(100dvh - 20px)}.maw-modal-body{padding:12px}.maw-form-grid{grid-template-columns:1fr}.maw-rule-input,.maw-rule-select,.maw-rule-search{height:44px;font-size:16px}.maw-rule-submit{width:100%;height:44px;min-height:44px!important}.maw-rule-form-meta{align-items:flex-start;flex-wrap:wrap}.maw-cancel-edit{margin-left:auto}.maw-section-head{align-items:flex-start;flex-wrap:wrap}.maw-rule-search-wrap{width:100%}.maw-rule-list{max-height:42vh}.maw-rule-row{grid-template-columns:1fr auto;gap:7px}.maw-rule-badge{grid-column:1;justify-self:start}.maw-rule-value{grid-column:1}.maw-rule-actions{grid-column:2;grid-row:1/3}.maw-row-btn{width:38px!important;min-width:38px!important;height:38px!important;min-height:38px!important}.maw-modal-footer{flex-wrap:wrap}.maw-modal-footer>button{flex:1}.maw-modal-status{width:100%;margin:0 0 4px}}
    `);

    const ICON_PATHS = {
        shield: '<path d="M12 3l7 3v5c0 4.6-2.9 8-7 10-4.1-2-7-5.4-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
        power: '<path d="M12 2v10"/><path d="M6.2 5.8a8 8 0 1 0 11.6 0"/>',
        check: '<path d="M5 12l4 4L19 6"/>',
        layers: '<path d="M12 3L3 8l9 5 9-5-9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 16l9 5 9-5"/>',
        edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
        refresh: '<path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.7-2.6L20 11"/><path d="M4 13l2.2 4.6A7 7 0 0 0 17.9 15"/>',
        chevronRight: '<path d="M9 18l6-6-6-6"/>',
        chevronLeft: '<path d="M15 18l-6-6 6-6"/>',
        close: '<path d="M6 6l12 12M18 6L6 18"/>',
    };

    function uiIcon(name) {
        return `<svg class="maw-svg" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
    }

    function notify(type, message, duration = 3400) {
        let root = document.getElementById(TOAST_ROOT_ID);
        if (!root) {
            root = document.createElement('div');
            root.id = TOAST_ROOT_ID;
            document.documentElement.appendChild(root);
        }
        while (root.children.length >= 4) root.firstElementChild?.remove();
        const toast = document.createElement('div');
        toast.className = `maw-toast ${type || 'info'}`;
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
        toast.textContent = String(message ?? '').replace(/<br\s*\/?>/gi, '\n');
        root.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('is-visible'));
        setTimeout(() => {
            toast.classList.remove('is-visible');
            setTimeout(() => toast.remove(), 220);
        }, duration);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const randInt = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;

    const HTML_ENTITY_PATTERN = /&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/giu;
    const APOSTROPHE_PATTERN = /[‘’‚‛′ʼ＇`´]/g;

    const decodeHtmlEntities = (() => {
        const textarea = document.createElement('textarea');
        return (value) => String(value ?? '').replace(HTML_ENTITY_PATTERN, (entity) => {
            textarea.innerHTML = entity;
            return textarea.value;
        });
    })();

    function normalizeText(value) {
        return decodeHtmlEntities(value)
            .normalize('NFKC')
            .replace(APOSTROPHE_PATTERN, "'")
            .replace(/\s+/g, ' ')
            .trim()
            .toLocaleLowerCase('en-US');
    }

    async function waitUntil(predicate, timeoutMs, intervalMs = 200) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (predicate()) return true;
            await sleep(intervalMs);
        }
        return false;
    }

    function xmlGet(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                timeout: 15_000,
                onload:  (r) => (r.status === 200 ? resolve(r.responseText) : reject(new Error(`HTTP ${r.status}`))),
                onerror: (e) => reject(e),
                ontimeout: () => reject(new Error(t('requestTimeout'))),
            });
        });
    }

    // ─── Wordlist ─────────────────────────────────────────────────────────────

    /**
     * Load wordlist from storage; seed with defaults on first run.
     * Returns a parsed array — never calls getFilteredRows recursively.
     */
    function parseWordlist(raw) {
        if (typeof raw !== 'string') return [];
        return Array.from(new Set(raw
            .split('\n')
            .map((word) => word.replace('\r', '').trim())
            .filter(Boolean)));
    }

    async function getRulesValue(key, fallback) {
        try { return await GM.getValue(key, fallback); }
        catch (error) { void trackTelemetryError('storage_rules_state'); throw error; }
    }

    async function setRulesValue(key, value) {
        try { await GM.setValue(key, value); }
        catch (error) { void trackTelemetryError('storage_rules_state'); throw error; }
    }

    async function loadWordlist() {
        let raw = await getRulesValue('adWordlist', '');
        if (typeof raw !== 'string' || !raw.trim()) {
            raw = DEFAULT_WORDLIST;
            await setRulesValue('adWordlist', raw);
        }
        return parseWordlist(raw);
    }

    function wordMatchesRow(word, rowWord) {
        if (!rowWord) return false;
        const decodedWord = decodeHtmlEntities(word).trim();
        if (!decodedWord) return false;
        const normalizedRow = normalizeText(rowWord);
        if (decodedWord.startsWith('=')) {
            return normalizedRow === normalizeText(decodedWord.slice(1));
        }
        if (decodedWord.startsWith('/') && decodedWord.endsWith('/') && decodedWord.length > 2) {
            const pattern = decodedWord
                .slice(1, -1)
                .normalize('NFKC')
                .replace(APOSTROPHE_PATTERN, "'");
            try { return new RegExp(pattern, 'iu').test(normalizedRow); }
            catch { return false; }
        }
        return normalizedRow.includes(normalizeText(decodedWord));
    }

    // ─── DOM helpers ──────────────────────────────────────────────────────────

    /** Extract keyword text from a table row */
    function getRowWord(rowEl) {
        const wordCell = rowEl.querySelector('th.wt-table__row__cell');
        if (!wordCell) return null;
        const wordEl = Array.from(wordCell.querySelectorAll(':scope > p, :scope > span')).find(
            (candidate) => candidate.getAttribute('aria-hidden') !== 'true' &&
                !candidate.closest('.wt-table--responsive__title') &&
                !candidate.matches('.wt-screen-reader-only')
        );
        return wordEl?.textContent?.trim() || null;
    }

    /** All keyword rows currently in the DOM */
    function getAllRows() {
        return Array.from(document.querySelectorAll(KEYWORD_ROW_SELECTOR)).filter((row) => {
            const style = window.getComputedStyle(row);
            return !row.hidden && row.getAttribute('aria-hidden') !== 'true' &&
                style.display !== 'none' && style.visibility !== 'hidden';
        });
    }

    function waitForKeywordRows(timeoutMs = INITIAL_ROWS_TIMEOUT_MS) {
        return waitUntil(() => getAllRows().length > 0, timeoutMs);
    }

    /** Rows whose keyword matches the current wordlist */
    async function getFilteredRows() {
        const wordlist = await loadWordlist();
        const rows = getAllRows();
        const rowWords = rows.map(getRowWord);
        if (rowWords.some((word) => !word)) {
            throw adsOperationError(t('keywordRowsFailed'), 'selector_ads_table');
        }
        return rows.filter((row, index) => wordlist.some((word) => wordMatchesRow(word, rowWords[index])));
    }

    // ─── ROAS colouring ───────────────────────────────────────────────────────

    function getMetricValue(row, columnNames) {
        const table = row.closest('table');
        if (!table) return 0;
        const normalizedNames = (Array.isArray(columnNames) ? columnNames : [columnNames])
            .map(normalizeText);
        const semanticCell = Array.from(row.querySelectorAll(':scope > td')).find(
            (cell) => normalizedNames.includes(normalizeText(
                cell.querySelector(':scope > .wt-table--responsive__title')?.textContent
            ))
        );
        const headers = Array.from(table.querySelectorAll('thead th'));
        const columnIndex = headers.findIndex(
            (header) => normalizedNames.includes(normalizeText(header.textContent))
        );
        const cell = semanticCell || (columnIndex >= 0 ? row.children[columnIndex] : null);
        if (!cell) return 0;

        const valueEl = cell?.querySelector(':scope > p, :scope > span');
        const rawValue = valueEl?.textContent ?? '';
        const integerText = rawValue.replace(/[^\d-]/g, '');
        return integerText ? Number(integerText) : 0;
    }

    function isHighClickRatioRow(row) {
        const clicks = getMetricValue(row, ['Clicks', 'Click', 'Tıklamalar', 'Tıklama']);
        const orders = getMetricValue(row, ['Orders', 'Order', 'Siparişler', 'Sipariş']);
        return (orders > 0 && clicks / orders > 25) || (orders === 0 && clicks > 25);
    }

    function setManagedRowColor(row, color, accent) {
        row.style.backgroundColor = color;
        row.style.boxShadow = `inset 3px 0 ${accent}`;
        row.dataset.adWordlistColor = 'true';
    }

    function clearManagedRowColors() {
        getAllRows().forEach((row) => {
            if (row.dataset.adWordlistColor === 'true') {
                row.style.removeProperty('background-color');
                row.style.removeProperty('box-shadow');
                delete row.dataset.adWordlistColor;
            }
        });
    }

    function colorRoas() {
        getAllRows().forEach((row) => {
            if (isHighClickRatioRow(row)) setManagedRowColor(row, '#fff1f1', '#b91c1c');
        });
    }

    async function decorateRows() {
        clearManagedRowColors();
        const filteredRows = await getFilteredRows();
        filteredRows.forEach((row) => setManagedRowColor(row, '#fff8ed', '#8a5a00'));
        colorRoas();
        updatePanelStats(filteredRows);
        return filteredRows;
    }

    // ─── Makaytron control panel ──────────────────────────────────────────────

    let panelEl = null;
    let panelCollapsed = false;
    let languageChangePromise = null;
    let panelStatusModel = { messageKey: 'keywordTableWaiting', state: 'ready', titleKey: '', params: {}, literal: false };

    function renderPanelStatus() {
        if (!panelEl) return;
        const textEl = panelEl.querySelector('[data-panel-status-text]');
        const titleEl = panelEl.querySelector('[data-panel-status-title]');
        const pillEl = panelEl.querySelector('[data-panel-state]');
        const labelKeys = { ready: 'ready', running: 'running', success: 'completed', warning: 'warning', error: 'error' };
        const label = t(labelKeys[panelStatusModel.state] || 'ready');
        const message = panelStatusModel.literal
            ? String(panelStatusModel.messageKey || t('ready'))
            : t(panelStatusModel.messageKey || 'ready', panelStatusModel.params);
        if (textEl) textEl.textContent = message;
        if (titleEl) titleEl.textContent = panelStatusModel.titleKey
            ? t(panelStatusModel.titleKey, panelStatusModel.params)
            : label;
        if (pillEl) {
            pillEl.dataset.state = panelStatusModel.state;
            pillEl.textContent = label;
        }
    }

    function setPanelStatus(messageKey, state = 'ready', titleKey = '', params = {}, literal = false) {
        panelStatusModel = { messageKey, state, titleKey, params, literal };
        renderPanelStatus();
    }

    function applyPanelLanguage() {
        if (!panelEl) return;
        const setText = (selector, value) => {
            const element = panelEl.querySelector(selector);
            if (element) element.textContent = value;
        };
        panelEl.setAttribute('aria-label', t('panelAria'));
        const logoLink = panelEl.querySelector('.maw-logo-shell');
        if (logoLink) logoLink.setAttribute('aria-label', t('logoOpen'));
        setText('.maw-sub', t('subtitle'));
        setText('[data-stat-label="page"]', t('statPage'));
        setText('[data-stat-label="rows"]', t('statRows'));
        setText('[data-stat-label="matches"]', t('statMatches'));
        setText('[data-stat-label="high"]', t('statHighRatio'));
        setText('[data-action-label="close-page"]', t('closeCurrentPage'));
        setText('[data-action-label="open-page"]', t('openCurrentPage'));
        setText('[data-action-label="close-all"]', t('closeAllPages'));
        setText('[data-action-label="edit"]', t('editWordlist'));
        setText('[data-action-label="update"]', t('updateWordlist'));
        setText('[data-current-page-label]', t('currentPage'));
        setText('[data-all-pages-label]', t('allPages'));
        setText('[data-safe-mode]', t('safeMatchMode'));

        const collapseButton = panelEl.querySelector('[data-collapse]');
        if (collapseButton) {
            collapseButton.setAttribute('aria-label', t('collapsePanel'));
            collapseButton.title = t('collapsePanel');
        }
        const expandButton = panelEl.querySelector('[data-expand]');
        if (expandButton) {
            expandButton.setAttribute('aria-label', t('expandPanel'));
            expandButton.title = t('expandPanel');
        }
        const languageButton = panelEl.querySelector('[data-language-toggle]');
        if (languageButton) {
            languageButton.textContent = currentLanguage === 'tr' ? 'EN' : 'TR';
            languageButton.setAttribute('aria-label', t('switchLanguage'));
            languageButton.title = t('switchLanguage');
        }
        const updateCheckButton = panelEl.querySelector('[data-script-update-check]');
        if (updateCheckButton) {
            updateCheckButton.setAttribute('aria-label', t('checkScriptUpdate'));
            updateCheckButton.title = t('checkScriptUpdate');
        }
        const updateInstallButton = panelEl.querySelector('[data-script-update-install]');
        if (updateInstallButton) updateInstallButton.textContent = t('scriptUpdateInstall');
        renderPanelStatus();
        renderScriptUpdateStatus();
    }

    function switchLanguage() {
        if (languageChangePromise) return languageChangePromise;
        if (activeOperation || wordlistUpdateRunning) {
            notify('warning', t('operationBusy'));
            return null;
        }

        const previousLanguage = currentLanguage;
        const nextLanguage = currentLanguage === 'tr' ? 'en' : 'tr';
        const languageButton = panelEl?.querySelector('[data-language-toggle]');
        if (languageButton) languageButton.disabled = true;
        languageChangePromise = GM.setValue(LANGUAGE_KEY, nextLanguage)
            .then(() => {
                currentLanguage = nextLanguage;
                applyPanelLanguage();
                applyEditorLanguage();
                registerMenuCommands();
                setPanelStatus('languageChanged', 'success');
                notify('success', t('languageChanged'));
            })
            .catch((error) => {
                currentLanguage = previousLanguage;
                applyPanelLanguage();
                notify('error', t('languageChangeFailed', { error: error?.message || error }));
            })
            .finally(() => {
                languageChangePromise = null;
                const currentButton = panelEl?.querySelector('[data-language-toggle]');
                if (currentButton) currentButton.disabled = false;
            });
        return languageChangePromise;
    }

    function setPanelBusy(busy) {
        panelEl?.querySelectorAll('[data-busy-action]').forEach((button) => {
            button.disabled = Boolean(busy);
        });
    }

    function updatePanelStats(filteredRows = []) {
        if (!panelEl) return;
        const rows = getAllRows();
        const highCount = rows.filter(isHighClickRatioRow).length;
        const currentPage = document.querySelector(
            `${KEYWORD_ACCORDION_SELECTOR} nav button[aria-current="true"]`
        )?.textContent?.trim() || '—';
        const values = {
            page: currentPage,
            rows: String(rows.length),
            matches: String(filteredRows.length),
            high: String(highCount),
        };
        Object.entries(values).forEach(([key, value]) => {
            const element = panelEl.querySelector(`[data-stat="${key}"]`);
            if (element) element.textContent = value;
        });
        const matchEl = panelEl.querySelector('[data-stat="matches"]');
        const highEl = panelEl.querySelector('[data-stat="high"]');
        if (matchEl) matchEl.dataset.tone = filteredRows.length ? 'warning' : '';
        if (highEl) highEl.dataset.tone = highCount ? 'danger' : '';
    }

    async function setPanelCollapsed(collapsed) {
        panelCollapsed = Boolean(collapsed);
        panelEl?.classList.toggle('is-collapsed', panelCollapsed);
        try { await GM.setValue(PANEL_COLLAPSED_KEY, panelCollapsed); }
        catch { /* Panel state persistence is optional. */ }
        if (!panelCollapsed && panelEl?.isConnected) telemetryPanelOpened();
    }

    async function mountMakaytronPanel() {
        if (panelEl?.isConnected) return panelEl;
        await loadLanguage();
        document.getElementById(PANEL_ROOT_ID)?.remove();
        try { panelCollapsed = Boolean(await GM.getValue(PANEL_COLLAPSED_KEY, false)); }
        catch { panelCollapsed = false; }

        panelEl = document.createElement('section');
        panelEl.id = PANEL_ROOT_ID;
        panelEl.setAttribute('aria-label', t('panelAria'));
        panelEl.innerHTML = `
            <div class="maw-card">
                <header class="maw-head">
                    <div class="maw-brand">
                        <a class="maw-logo-shell" href="${MAKAYTRON_WEBSITE_URL}" target="_blank" rel="noopener noreferrer" aria-label="${t('logoOpen')}">
                            <img class="maw-logo" src="${MAKAYTRON_LOGO_URL}" alt="Makaytron">
                        </a>
                        <div class="maw-brand-copy">
                            <h3 class="maw-title">Etsy Ads Keyword Manager</h3>
                            <div class="maw-sub">${t('subtitle')}</div>
                        </div>
                    </div>
                    <div class="maw-head-tools">
                        <div class="maw-head-meta"><button type="button" class="maw-version" data-script-update-check aria-label="${t('checkScriptUpdate')}" title="${t('checkScriptUpdate')}">v${APP_VERSION}</button><span class="maw-pill" data-panel-state="ready">${t('ready')}</span></div>
                        <button type="button" class="maw-icon-btn" data-collapse aria-label="${t('collapsePanel')}" title="${t('collapsePanel')}">${uiIcon('chevronRight')}</button>
                    </div>
                </header>
                <div class="maw-body">
                    <div class="maw-status-card">
                        <div class="maw-status-icon">${uiIcon('shield')}</div>
                        <div class="maw-status-copy"><div class="maw-status-title" data-panel-status-title>${t('ready')}</div><div class="maw-status-text" data-panel-status-text>${t('keywordTableWaiting')}</div></div>
                    </div>
                    <div class="maw-update-banner" data-script-update-banner role="status" aria-live="polite" hidden>
                        <span class="maw-update-message" data-script-update-message></span>
                        <button type="button" class="maw-update-install" data-script-update-install hidden>${t('scriptUpdateInstall')}</button>
                    </div>
                    <div class="maw-grid">
                        <div class="maw-chip"><div class="maw-label" data-stat-label="page">${t('statPage')}</div><div class="maw-value" data-stat="page">—</div></div>
                        <div class="maw-chip"><div class="maw-label" data-stat-label="rows">${t('statRows')}</div><div class="maw-value" data-stat="rows">0</div></div>
                        <div class="maw-chip"><div class="maw-label" data-stat-label="matches">${t('statMatches')}</div><div class="maw-value" data-stat="matches">0</div></div>
                        <div class="maw-chip"><div class="maw-label" data-stat-label="high">${t('statHighRatio')}</div><div class="maw-value" data-stat="high">0</div></div>
                    </div>
                    <div class="maw-actions">
                        <button type="button" class="maw-primary" data-action="close-page" data-busy-action>${uiIcon('power')}<span data-action-label="close-page">${t('closeCurrentPage')}</span></button>
                        <button type="button" class="maw-secondary" data-action="open-page" data-busy-action>${uiIcon('check')}<span data-action-label="open-page">${t('openCurrentPage')}</span></button>
                        <button type="button" class="maw-warning maw-wide" data-action="close-all" data-busy-action>${uiIcon('layers')}<span data-action-label="close-all">${t('closeAllPages')}</span></button>
                        <button type="button" class="maw-secondary" data-action="edit" data-busy-action>${uiIcon('edit')}<span data-action-label="edit">${t('editWordlist')}</span></button>
                        <button type="button" class="maw-secondary" data-action="update" data-busy-action>${uiIcon('refresh')}<span data-action-label="update">${t('updateWordlist')}</span></button>
                    </div>
                    <div class="maw-help"><span class="maw-key">Ctrl Space</span> <span data-current-page-label>${t('currentPage')}</span> · <span class="maw-key">Ctrl Alt K</span> <span data-all-pages-label>${t('allPages')}</span></div>
                    <footer class="maw-footer"><a href="${MAKAYTRON_WEBSITE_URL}" target="_blank" rel="noopener noreferrer">Makaytron</a><div class="maw-footer-tools"><button type="button" class="maw-lang-btn" data-language-toggle data-busy-action aria-label="${t('switchLanguage')}" title="${t('switchLanguage')}">${currentLanguage === 'tr' ? 'EN' : 'TR'}</button><span data-safe-mode>${t('safeMatchMode')}</span></div></footer>
                </div>
            </div>
            <button type="button" class="maw-collapsed-tab" data-expand aria-label="${t('expandPanel')}" title="${t('expandPanel')}">${uiIcon('chevronLeft')}</button>
        `;
        document.documentElement.appendChild(panelEl);
        panelEl.classList.toggle('is-collapsed', panelCollapsed);
        if (!panelCollapsed) telemetryPanelOpened();
        applyPanelLanguage();
        panelEl.querySelector('[data-collapse]')?.addEventListener('click', () => { void setPanelCollapsed(true); });
        panelEl.querySelector('[data-expand]')?.addEventListener('click', () => { void setPanelCollapsed(false); });
        panelEl.querySelector('[data-language-toggle]')?.addEventListener('click', () => { void switchLanguage(); });
        panelEl.querySelector('[data-script-update-check]')?.addEventListener('click', () => { void checkScriptUpdate({ manual: true }); });
        panelEl.querySelector('[data-script-update-install]')?.addEventListener('click', () => { openScriptInstallPage(); });
        panelEl.querySelector('[data-action="close-page"]')?.addEventListener('click', () => { void runToggleRows(false); });
        panelEl.querySelector('[data-action="open-page"]')?.addEventListener('click', () => { void runToggleRows(true); });
        panelEl.querySelector('[data-action="close-all"]')?.addEventListener('click', () => { void requestDisableAllPages(); });
        panelEl.querySelector('[data-action="edit"]')?.addEventListener('click', () => { void openWordlistEditor(); });
        panelEl.querySelector('[data-action="update"]')?.addEventListener('click', () => { void ensureWord(); });
        return panelEl;
    }

    // ─── Core actions ─────────────────────────────────────────────────────────

    let activeOperation = null;

    function adsOperationError(message, telemetryCode) {
        const error = new Error(message);
        error.telemetryCode = telemetryCode;
        return error;
    }

    function adsExpectedOperationError(message) {
        const error = new Error(message);
        error.telemetryExpected = true;
        return error;
    }

    function checkboxLifecyclePending(checkbox, row) {
        const truthyAttribute = (element, name) => {
            const value = element?.getAttribute?.(name);
            return value === '' || value === 'true' || value === '1';
        };
        if (!checkbox || checkbox.disabled || truthyAttribute(checkbox, 'aria-busy')
            || truthyAttribute(checkbox, 'aria-disabled') || truthyAttribute(checkbox, 'data-loading')
            || truthyAttribute(checkbox, 'data-pending')) return true;
        if (!row) return false;
        if (truthyAttribute(row, 'aria-busy') || truthyAttribute(row, 'data-loading')
            || truthyAttribute(row, 'data-pending')) return true;
        if (row.querySelector('[aria-busy="true"],[data-loading="true"],[data-pending="true"],[role="progressbar"],.wt-spinner')) {
            return true;
        }
        const lifecycleClasses = `${checkbox.className || ''} ${row.className || ''}`.toLocaleLowerCase('en-US');
        return /(?:^|[\s_-])(loading|pending|saving|updating|spinner)(?:$|[\s_-])/.test(lifecycleClasses);
    }

    async function waitForStableCheckboxState(checkbox, targetState, activate, options = {}) {
        const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 4_000;
        const acknowledgedStableMs = Number.isFinite(options.acknowledgedStableMs)
            ? options.acknowledgedStableMs : 300;
        const unacknowledgedStableMs = Number.isFinite(options.unacknowledgedStableMs)
            ? options.unacknowledgedStableMs : 2_100;
        const row = checkbox?.closest('tr,[role="row"]') || checkbox?.parentElement || null;
        const observedRoot = row || checkbox;
        const deadline = Date.now() + timeoutMs;
        let lastState = Boolean(checkbox?.checked);
        let lastPending = checkboxLifecyclePending(checkbox, row);
        let sawPendingLifecycle = lastPending;
        let sawTargetState = lastState === targetState;
        let lastObservedChangeAt = Date.now();

        const noteActivity = () => { lastObservedChangeAt = Date.now(); };
        const observer = typeof MutationObserver === 'function' && observedRoot
            ? new MutationObserver(noteActivity)
            : null;
        observer?.observe(observedRoot, {
            attributes: true,
            childList: true,
            subtree: true,
        });
        checkbox?.addEventListener('input', noteActivity);
        checkbox?.addEventListener('change', noteActivity);

        try {
            activate();
            while (Date.now() < deadline) {
                if (!checkbox.isConnected) return false;
                const state = Boolean(checkbox.checked);
                const pending = checkboxLifecyclePending(checkbox, row);
                if (state !== lastState || pending !== lastPending) {
                    lastObservedChangeAt = Date.now();
                    lastState = state;
                    lastPending = pending;
                }
                if (pending) sawPendingLifecycle = true;
                if (state === targetState) sawTargetState = true;
                else if (sawTargetState && !pending) return false;

                if (state === targetState && !pending) {
                    const requiredStableMs = sawPendingLifecycle
                        ? acknowledgedStableMs
                        : unacknowledgedStableMs;
                    if (Date.now() - lastObservedChangeAt >= requiredStableMs) return true;
                }
                await sleep(50);
            }
            return false;
        } finally {
            observer?.disconnect();
            checkbox?.removeEventListener('input', noteActivity);
            checkbox?.removeEventListener('change', noteActivity);
        }
    }

    async function toggleCurrentPage(targetState) {
        const filteredRows = await getFilteredRows();
        const stateLabel = t(targetState ? 'enabled' : 'disabled');
        let count = 0;

        for (const row of filteredRows) {
            const checkbox = row.querySelector('input[type=checkbox]');
            if (!checkbox) {
                void trackTelemetryError('selector_ads_control');
                throw adsOperationError(t('keywordChangeFailed', {
                    keyword: getRowWord(row) || t('keywordFallback'),
                }), 'selector_ads_control');
            }
            if (checkbox.disabled || checkbox.checked === targetState) continue;
            const changed = await waitForStableCheckboxState(
                checkbox,
                targetState,
                () => checkbox.click()
            );
            if (!changed) {
                throw adsOperationError(t('keywordChangeFailed', {
                    keyword: getRowWord(row) || t('keywordFallback'),
                }), 'selector_ads_verification');
            }
            void trackTelemetry('ads_keyword_change_applied');
            notify('success', t('keywordChanged', {
                keyword: getRowWord(row) || t('keywordFallback'),
                state: stateLabel,
            }));
            count++;
        }

        return count;
    }

    function capturePageState() {
        const nav = document.querySelector(`${KEYWORD_ACCORDION_SELECTOR} nav`);
        const currentPage = nav?.querySelector('button[aria-current="true"]')?.textContent?.trim() || '';
        const rows = getAllRows();
        const words = rows.map(getRowWord).filter(Boolean);
        return {
            currentPage,
            rows,
            wordsSignature: words.join('\u001f'),
            signature: `${currentPage}|${words.length}|${words.join('\u001f')}`,
        };
    }

    function getNextButton() {
        const nav = document.querySelector(`${KEYWORD_ACCORDION_SELECTOR} nav`);
        if (!nav) return null;
        const buttons = Array.from(nav.querySelectorAll('button'));
        const namedNext = buttons.find(
            (button) => normalizeText(button.querySelector('.wt-screen-reader-only')?.textContent) === 'next'
        );
        const lastButton = buttons.at(-1) || null;
        return namedNext || (lastButton?.querySelector('.wt-screen-reader-only') ? lastButton : null);
    }

    function isButtonDisabled(button) {
        return !button || button.disabled || button.getAttribute('aria-disabled') === 'true';
    }

    async function goToNextPage(previousState) {
        const nextButton = getNextButton();
        if (!nextButton) {
            throw adsOperationError(t('nextButtonMissing'), 'selector_ads_pagination');
        }
        if (isButtonDisabled(nextButton)) return 'end';

        nextButton.click();
        const changed = await waitUntil(
            () => {
                const currentState = capturePageState();
                const pageChanged = previousState.currentPage
                    ? Boolean(currentState.currentPage && currentState.currentPage !== previousState.currentPage)
                    : true;
                const rowsReplaced = previousState.rows.every((row) => !row.isConnected);
                const wordsChanged = currentState.wordsSignature !== previousState.wordsSignature;
                return currentState.rows.length > 0 && pageChanged && (rowsReplaced || wordsChanged);
            },
            PAGE_CHANGE_TIMEOUT_MS
        );
        if (!changed) {
            throw adsOperationError(t('nextPageTimeout'), 'selector_ads_pagination');
        }
        await sleep(250);
        return 'moved';
    }

    /**
     * Toggle filtered rows on/off.
     * @param {boolean} targetState  true = enable, false = disable
     * @param {boolean} autoPaginate navigate to next page when done
     */
    async function toggleRows(targetState, autoPaginate = false) {
        const stateLabel = t(targetState ? 'enabled' : 'disabled');
        const visitedPages = new Set();
        let totalCount = 0;
        let pageCount = 0;

        while (true) {
            const rowsReady = await waitForKeywordRows();
            if (!rowsReady) throw adsOperationError(t('keywordRowsFailed'), 'selector_ads_table');

            const pageState = capturePageState();
            if (visitedPages.has(pageState.signature)) {
                throw adsOperationError(t('repeatedPage'), 'selector_ads_pagination');
            }
            visitedPages.add(pageState.signature);
            pageCount++;
            setPanelStatus(
                'processingPage',
                'running',
                'processingKeywords',
                { page: pageState.currentPage || pageCount }
            );

            totalCount += await toggleCurrentPage(targetState);
            await decorateRows();

            if (!autoPaginate) break;
            if (pageCount >= MAX_AUTO_PAGES && !isButtonDisabled(getNextButton())) {
                throw adsExpectedOperationError(t('maxPagesReached', { count: MAX_AUTO_PAGES }));
            }

            const navigation = await goToNextPage(pageState);
            if (navigation === 'end') {
                break;
            }
        }

        const resultParams = { keywords: quantity(totalCount, 'keyword'), state: stateLabel };
        notify('success', t('totalChanged', resultParams));
        setPanelStatus('totalChanged', 'success', '', resultParams);
    }

    function runToggleRows(targetState, autoPaginate = false) {
        if (activeOperation || wordlistUpdateRunning) {
            notify('warning', t('operationBusy'));
            return activeOperation;
        }
        if (document.getElementById(EDITOR_MODAL_ID)) {
            notify('warning', t('editorOperationBlocked'));
            return null;
        }

        setPanelBusy(true);
        setPanelStatus(autoPaginate ? 'allPagesWillProcess' : 'currentPageProcessing', 'running');
        activeOperation = toggleRows(targetState, autoPaginate)
            .catch((error) => {
                if (!error?.telemetryExpected) {
                    const telemetryCode = TELEMETRY_ALLOWED_ERROR_CODES.has(error?.telemetryCode) ? error.telemetryCode : 'runtime_keyword_change';
                    void trackTelemetryError(telemetryCode);
                }
                console.error('[Makaytron Etsy Ads Keyword Manager]', t('consoleOperationFailed'), error);
                notify('error', t('operationStopped', { error: error?.message || error }));
                setPanelStatus(error?.message || t('operationStoppedFallback'), 'error', '', {}, true);
            })
            .finally(() => {
                activeOperation = null;
                setPanelBusy(false);
            });
        return activeOperation;
    }

    function requestDisableAllPages() {
        if (activeOperation || wordlistUpdateRunning) {
            notify('warning', t('operationBusy'));
            return activeOperation;
        }
        if (document.getElementById(EDITOR_MODAL_ID)) {
            notify('warning', t('editorOperationBlocked'));
            return null;
        }
        if (!window.confirm(t('confirmAllPages'))) return null;
        return runToggleRows(false, true);
    }

    function requestShortcutDisableCurrentPage() {
        if (activeOperation || wordlistUpdateRunning) {
            notify('warning', t('operationBusy'));
            return activeOperation;
        }
        if (document.getElementById(EDITOR_MODAL_ID)) {
            notify('warning', t('editorOperationBlocked'));
            return null;
        }
        if (!window.confirm(t('confirmCurrentPageShortcut'))) return null;
        return runToggleRows(false, false);
    }

    // ─── Remote wordlist update ───────────────────────────────────────────────

    let wordlistUpdateRunning = false;

    async function ensureWord() {
        if (activeOperation || wordlistUpdateRunning) {
            notify('warning', t('operationBusy'));
            return;
        }
        if (document.getElementById(EDITOR_MODAL_ID)) {
            notify('warning', t('editorOperationBlocked'));
            return;
        }
        if (!window.confirm(t('confirmListUpdate'))) return;
        wordlistUpdateRunning = true;
        setPanelBusy(true);
        setPanelStatus('remoteChecking', 'running', 'listUpdating');
        try {
            let text;
            let words;
            try {
                text = await xmlGet(`${WORD_LIST_URL}?t=${Date.now()}`);
                const byteLength = new TextEncoder().encode(text).length;
                words = parseWordlist(text);
                if (!words.length) throw new Error(t('remoteListEmpty'));
                if (byteLength > MAX_WORDLIST_BYTES) throw new Error(t('remoteListTooLarge'));
            } catch (error) {
                void trackTelemetryError('network_rules_update');
                throw error;
            }

            notify('success', t('fetchingKeywords'));
            try {
                const currentValue = await GM.getValue('adWordlist', DEFAULT_WORDLIST);
                await GM.setValue(WORDLIST_BACKUP_KEY, typeof currentValue === 'string' ? currentValue : DEFAULT_WORDLIST);
                await GM.setValue('adWordlist', text);
            } catch (error) {
                void trackTelemetryError('storage_rules_state');
                throw error;
            }
            await decorateRows();
            const updateParams = { keywords: quantity(words.length, 'keyword') };
            notify('success', t('keywordsUpdated', updateParams));
            setPanelStatus('keywordsUpdatedSuccess', 'success', '', updateParams);
        } catch (error) {
            console.error('[Makaytron Etsy Ads Keyword Manager]', t('consoleListFailed'), error);
            notify('error', t('listFetchFailed', { error: error?.message || error }));
            setPanelStatus(error?.message || t('listFetchFailedFallback'), 'error', '', {}, true);
        } finally {
            wordlistUpdateRunning = false;
            setPanelBusy(false);
        }
    }

    async function restoreWordlistBackup() {
        if (activeOperation || wordlistUpdateRunning) {
            notify('warning', t('operationBusy'));
            return;
        }
        if (document.getElementById(EDITOR_MODAL_ID)) {
            notify('warning', t('editorOperationBlocked'));
            return;
        }
        const backup = await getRulesValue(WORDLIST_BACKUP_KEY, '');
        if (typeof backup !== 'string' || !backup.trim()) {
            notify('warning', t('backupListMissing'));
            return;
        }
        if (!window.confirm(t('confirmListRestore'))) return;
        wordlistUpdateRunning = true;
        setPanelBusy(true);
        setPanelStatus('listUpdating', 'running');
        try {
            const byteLength = new TextEncoder().encode(backup).length;
            const rules = parseWordlist(backup);
            if (!rules.length || byteLength > MAX_WORDLIST_BYTES) throw new Error(t('localListTooLarge'));
            await setRulesValue('adWordlist', backup);
            const filteredRows = await decorateRows();
            const restoreParams = {
                rules: quantity(rules.length, 'rule'),
                matches: quantity(filteredRows.length, 'match'),
            };
            notify('success', t('backupRestored'));
            setPanelStatus('backupRestoredStatus', 'success', '', restoreParams);
        } catch (error) {
            notify('error', t('backupRestoreFailed', { error: error?.message || error }));
            setPanelStatus('backupRestoreFailed', 'error', '', { error: error?.message || error });
        } finally {
            wordlistUpdateRunning = false;
            setPanelBusy(false);
        }
    }

    // ─── Script version update ───────────────────────────────────────────────

    let scriptUpdateCheckRunning = false;
    let scriptUpdateAutoScheduled = false;
    let scriptUpdateStatusModel = {
        state: 'idle',
        messageKey: '',
        params: {},
        latestVersion: '',
    };

    function parseSemVer(version) {
        const match = String(version || '').trim().match(
            /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/
        );
        if (!match) return null;
        return {
            core: match.slice(1, 4).map(Number),
            prerelease: match[4] ? match[4].split('.') : [],
        };
    }

    function compareSemVer(leftVersion, rightVersion) {
        const left = parseSemVer(leftVersion);
        const right = parseSemVer(rightVersion);
        if (!left || !right) return null;
        for (let index = 0; index < 3; index += 1) {
            if (left.core[index] !== right.core[index]) {
                return left.core[index] > right.core[index] ? 1 : -1;
            }
        }
        if (!left.prerelease.length && !right.prerelease.length) return 0;
        if (!left.prerelease.length) return 1;
        if (!right.prerelease.length) return -1;
        const length = Math.max(left.prerelease.length, right.prerelease.length);
        for (let index = 0; index < length; index += 1) {
            const leftPart = left.prerelease[index];
            const rightPart = right.prerelease[index];
            if (leftPart === undefined) return -1;
            if (rightPart === undefined) return 1;
            if (leftPart === rightPart) continue;
            const leftNumeric = /^\d+$/.test(leftPart);
            const rightNumeric = /^\d+$/.test(rightPart);
            if (leftNumeric && rightNumeric) return Number(leftPart) > Number(rightPart) ? 1 : -1;
            if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
            return leftPart > rightPart ? 1 : -1;
        }
        return 0;
    }

    function extractRemoteScriptVersion(source) {
        if (typeof source !== 'string') return '';
        const match = source.match(/^\/\/\s*@version\s+([^\s]+)\s*$/m);
        return match && parseSemVer(match[1]) ? match[1] : '';
    }

    function getScriptSourceKind() {
        let info = null;
        try {
            info = typeof GM_info === 'object' && GM_info ? GM_info : null;
        } catch {
            info = null;
        }
        const scriptInfo = info?.script || {};
        const sourceUrls = [
            scriptInfo.downloadURL,
            scriptInfo.updateURL,
        ].filter((value) => typeof value === 'string' && value.trim());
        if (!sourceUrls.length) return 'unknown';
        if (sourceUrls.some((url) => /(?:greasyfork|sleazyfork)\.org/i.test(url))) return 'external';
        try {
            const canonical = new URL(SCRIPT_SOURCE_URL);
            const isCanonicalSource = sourceUrls.every((value) => {
                const candidate = new URL(value);
                return candidate.protocol === 'https:'
                    && candidate.origin === canonical.origin
                    && candidate.pathname === canonical.pathname
                    && !candidate.username
                    && !candidate.password
                    && !candidate.search
                    && !candidate.hash;
            });
            return isCanonicalSource ? 'github' : 'external';
        } catch {
            return 'external';
        }
    }

    function isCriticalKeywordWorkActive() {
        return Boolean(
            activeOperation
            || wordlistUpdateRunning
            || document.getElementById(EDITOR_MODAL_ID)
        );
    }

    function renderScriptUpdateStatus() {
        if (!panelEl) return;
        const banner = panelEl.querySelector('[data-script-update-banner]');
        const message = panelEl.querySelector('[data-script-update-message]');
        const installButton = panelEl.querySelector('[data-script-update-install]');
        const checkButton = panelEl.querySelector('[data-script-update-check]');
        if (!banner || !message || !installButton) return;

        const visible = scriptUpdateStatusModel.state !== 'idle';
        banner.hidden = !visible;
        banner.dataset.state = scriptUpdateStatusModel.state;
        message.textContent = visible
            ? t(scriptUpdateStatusModel.messageKey, scriptUpdateStatusModel.params)
            : '';
        installButton.hidden = scriptUpdateStatusModel.state !== 'available';
        installButton.textContent = t('scriptUpdateInstall');
        if (checkButton) checkButton.disabled = scriptUpdateCheckRunning;
    }

    function setScriptUpdateStatus(state, messageKey, params = {}, latestVersion = '') {
        scriptUpdateStatusModel = { state, messageKey, params, latestVersion };
        renderScriptUpdateStatus();
    }

    async function readScriptUpdateState() {
        try {
            const value = await GM.getValue(SCRIPT_UPDATE_STATE_KEY, {});
            return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        } catch {
            return {};
        }
    }

    async function writeScriptUpdateState(value) {
        try {
            await GM.setValue(SCRIPT_UPDATE_STATE_KEY, value);
        } catch {
            // Update-check persistence is optional and must never block the main tool.
        }
    }

    async function checkScriptUpdate({ manual = false } = {}) {
        if (scriptUpdateCheckRunning) return null;
        if (isCriticalKeywordWorkActive()) {
            if (manual) {
                setScriptUpdateStatus('blocked', 'scriptUpdateBlocked');
                notify('warning', t('scriptUpdateBlocked'));
            }
            return null;
        }
        const sourceKind = getScriptSourceKind();
        if (sourceKind !== 'github') {
            if (manual) {
                const messageKey = sourceKind === 'unknown'
                    ? 'scriptUpdateUnknownSource'
                    : 'scriptUpdateExternalSource';
                setScriptUpdateStatus('external', messageKey);
                notify('warning', t(messageKey));
            }
            return null;
        }

        const previousState = await readScriptUpdateState();
        const now = Date.now();
        const lastCheckedAt = Number(previousState.lastCheckedAt) || 0;
        if (!manual && now - lastCheckedAt < SCRIPT_UPDATE_INTERVAL_MS) {
            const cachedVersion = typeof previousState.latestVersion === 'string'
                ? previousState.latestVersion
                : '';
            if (compareSemVer(cachedVersion, APP_VERSION) === 1) {
                setScriptUpdateStatus(
                    'available',
                    'scriptUpdateAvailable',
                    { version: cachedVersion },
                    cachedVersion
                );
            }
            return previousState;
        }

        scriptUpdateCheckRunning = true;
        setScriptUpdateStatus('checking', 'scriptUpdateChecking');
        const checkingState = { ...previousState, lastCheckedAt: now, lastStatus: 'checking' };
        await writeScriptUpdateState(checkingState);
        try {
            const source = await xmlGet(`${SCRIPT_SOURCE_URL}?update_check=${now}`);
            if (new TextEncoder().encode(String(source)).length > MAX_REMOTE_SCRIPT_BYTES) {
                throw new Error(t('scriptUpdateInvalid'));
            }
            const latestVersion = extractRemoteScriptVersion(source);
            const comparison = compareSemVer(latestVersion, APP_VERSION);
            if (!latestVersion || comparison === null) throw new Error(t('scriptUpdateInvalid'));

            const available = comparison === 1;
            const nextState = {
                lastCheckedAt: now,
                lastStatus: available ? 'available' : 'current',
                latestVersion,
            };
            await writeScriptUpdateState(nextState);
            if (available) {
                setScriptUpdateStatus(
                    'available',
                    'scriptUpdateAvailable',
                    { version: latestVersion },
                    latestVersion
                );
                if (manual) notify('warning', t('scriptUpdateAvailable', { version: latestVersion }));
            } else {
                setScriptUpdateStatus(
                    'current',
                    'scriptUpdateCurrent',
                    { version: APP_VERSION },
                    latestVersion
                );
                if (manual) notify('success', t('scriptUpdateCurrent', { version: APP_VERSION }));
            }
            return nextState;
        } catch (error) {
            const errorMessage = error?.message || String(error);
            await writeScriptUpdateState({
                ...checkingState,
                lastStatus: 'error',
                lastError: errorMessage,
            });
            setScriptUpdateStatus('error', 'scriptUpdateFailed', { error: errorMessage });
            if (manual) notify('warning', t('scriptUpdateFailed', { error: errorMessage }));
            else console.warn('[Makaytron Etsy Ads Keyword Manager] Update check failed:', error);
            return null;
        } finally {
            scriptUpdateCheckRunning = false;
            renderScriptUpdateStatus();
        }
    }

    function openScriptInstallPage() {
        if (isCriticalKeywordWorkActive()) {
            notify('warning', t('scriptInstallBlocked'));
            return;
        }
        const sourceKind = getScriptSourceKind();
        if (sourceKind !== 'github') {
            const messageKey = sourceKind === 'unknown'
                ? 'scriptUpdateUnknownSource'
                : 'scriptUpdateExternalSource';
            setScriptUpdateStatus('external', messageKey);
            notify('warning', t(messageKey));
            return;
        }
        const latestVersion = scriptUpdateStatusModel.latestVersion;
        if (!latestVersion || compareSemVer(latestVersion, APP_VERSION) !== 1) return;
        if (!window.confirm(t('confirmScriptInstall', { version: latestVersion }))) return;
        window.open(SCRIPT_SOURCE_URL, '_blank', 'noopener,noreferrer');
        notify('success', t('scriptInstallOpening', { version: latestVersion }));
    }

    function scheduleAutomaticScriptUpdateCheck() {
        if (scriptUpdateAutoScheduled) return;
        scriptUpdateAutoScheduled = true;
        window.setTimeout(() => { void checkScriptUpdate(); }, 1_500);
    }

    // ─── Wordlist editor popup ────────────────────────────────────────────────

    let editorOpenSequence = 0;
    let editorCleanup = null;
    let editorRelocalize = null;

    function applyEditorLanguage() {
        editorRelocalize?.();
    }

    function decodeEditorRule(rawRule, id) {
        const decoded = decodeHtmlEntities(rawRule).trim();
        if (decoded.startsWith('=') && decoded.length > 1) {
            return { id, type: 'exact', value: decoded.slice(1).trim(), sourceRaw: rawRule, edited: false };
        }
        if (decoded.startsWith('/') && decoded.endsWith('/') && decoded.length > 2) {
            return { id, type: 'regex', value: decoded.slice(1, -1), sourceRaw: rawRule, edited: false };
        }
        return { id, type: 'contains', value: decoded, sourceRaw: rawRule, edited: false };
    }

    function normalizeEditorRuleValue(value, type) {
        const rawValue = String(value ?? '');
        if (type === 'regex') {
            const wrappedValue = rawValue.trim();
            if (wrappedValue.startsWith('/') && wrappedValue.endsWith('/') && wrappedValue.length > 1) {
                return wrappedValue.slice(1, -1);
            }
            return rawValue;
        }
        let normalized = rawValue.trim();
        if (type === 'exact' && normalized.startsWith('=')) normalized = normalized.slice(1).trim();
        if (type === 'contains' && normalized.startsWith('=')) normalized = normalized.slice(1).trim();
        if (type === 'contains' && normalized.startsWith('/') && normalized.endsWith('/') && normalized.length > 1) {
            normalized = normalized.slice(1, -1).trim();
        }
        return normalized;
    }

    function editorRuleDuplicateKey(rule) {
        const type = ['contains', 'exact', 'regex'].includes(rule?.type) ? rule.type : 'contains';
        const value = normalizeEditorRuleValue(rule?.value, type);
        if (type === 'regex') {
            return `${type}:${value.normalize('NFKC').replace(APOSTROPHE_PATTERN, "'")}`;
        }
        return `${type}:${normalizeText(value)}`;
    }

    function encodeEditorRule(rule) {
        if (!rule?.edited && typeof rule?.sourceRaw === 'string' && rule.sourceRaw.trim()) return rule.sourceRaw.trim();
        const value = normalizeEditorRuleValue(rule?.value, rule?.type);
        if (!value) return '';
        if (rule.type === 'exact') return `=${value}`;
        if (rule.type === 'regex') return `/${value}/`;
        return value;
    }

    async function openWordlistEditor() {
        if (activeOperation || wordlistUpdateRunning) {
            notify('warning', t('operationBusy'));
            return;
        }
        const existingEditor = document.getElementById(EDITOR_MODAL_ID);
        if (existingEditor) {
            existingEditor.querySelector('[data-rule-input]')?.focus();
            return;
        }
        const previouslyFocused = document.activeElement;
        const openSequence = ++editorOpenSequence;
        editorCleanup?.();
        document.getElementById(EDITOR_MODAL_ID)?.remove();
        const storedValue = await getRulesValue('adWordlist', DEFAULT_WORDLIST);
        if (openSequence !== editorOpenSequence) return;
        const initialValue = typeof storedValue === 'string' ? storedValue : DEFAULT_WORDLIST;
        let nextRuleId = 1;
        let rules = parseWordlist(initialValue)
            .map((rawRule) => decodeEditorRule(rawRule, nextRuleId++))
            .filter((rule) => rule.value);
        const serializeRules = () => rules.map(encodeEditorRule).filter(Boolean).join('\n');
        let savedValue = serializeRules();
        let editingId = null;
        let saveInProgress = false;

        const backdrop = document.createElement('div');
        backdrop.id = EDITOR_MODAL_ID;
        backdrop.className = 'maw-modal-backdrop';
        backdrop.innerHTML = `
            <div class="maw-modal" role="dialog" aria-modal="true" aria-labelledby="maw-editor-title">
                <header class="maw-modal-head">
                    <div class="maw-modal-brand">
                        <a class="maw-modal-logo-shell" href="${MAKAYTRON_WEBSITE_URL}" target="_blank" rel="noopener noreferrer" aria-label="${t('logoOpen')}"><img class="maw-modal-logo" src="${MAKAYTRON_LOGO_URL}" alt="Makaytron"></a>
                        <div><h3 class="maw-modal-title" id="maw-editor-title" data-editor-title>${t('editorTitle')}</h3><div class="maw-modal-subtitle">Makaytron · Etsy Ads Keyword Manager · v${APP_VERSION}</div></div>
                    </div>
                    <button type="button" class="maw-icon-btn" data-close data-editor-close-icon aria-label="${t('close')}">${uiIcon('close')}</button>
                </header>
                <div class="maw-modal-body">
                    <div class="maw-modal-note" data-editor-note>${t('editorNote')}</div>
                    <div class="maw-rule-form-card">
                        <div class="maw-section-head"><h4 class="maw-section-title" data-rule-form-title>${t('addRuleTitle')}</h4></div>
                        <form class="maw-rule-form" data-rule-form novalidate>
                            <div class="maw-form-grid">
                                <label class="maw-field"><span class="maw-field-label" data-rule-value-label>${t('ruleValueLabel')}</span><input type="text" class="maw-rule-input" data-rule-input autocomplete="off" placeholder="${t('ruleValuePlaceholder')}" aria-describedby="maw-rule-feedback"></label>
                                <label class="maw-field"><span class="maw-field-label" data-rule-type-label>${t('matchTypeLabel')}</span><select class="maw-rule-select" data-rule-type><option value="contains">${t('matchContainsOption')}</option><option value="exact">${t('matchExactOption')}</option><option value="regex">${t('matchRegexOption')}</option></select></label>
                                <button type="submit" class="maw-primary maw-rule-submit" data-rule-submit>${uiIcon('check')}<span data-rule-submit-label>${t('addRule')}</span></button>
                            </div>
                            <div class="maw-rule-form-meta"><span class="maw-match-help" data-match-help>${t('matchContainsHelp')}</span><span class="maw-form-feedback" id="maw-rule-feedback" data-form-feedback role="status" aria-live="polite"></span><button type="button" class="maw-cancel-edit" data-cancel-edit hidden>${t('cancelEdit')}</button></div>
                        </form>
                    </div>
                    <div class="maw-rule-list-card">
                        <div class="maw-section-head"><div><h4 class="maw-section-title" data-rule-list-title>${t('ruleListTitle')}</h4><span class="maw-section-count" data-editor-count>${quantity(rules.length, 'rule')}</span></div><div class="maw-rule-search-wrap"><input type="search" class="maw-rule-search" data-rule-search placeholder="${t('searchRulesPlaceholder')}" aria-label="${t('searchRulesAria')}"></div></div>
                        <div class="maw-rule-list" data-rule-list></div>
                    </div>
                </div>
                <footer class="maw-modal-footer">
                    <span class="maw-modal-status" data-editor-status>${t('ready')}</span>
                    <button type="button" class="maw-secondary" data-close data-editor-cancel>${t('cancel')}</button>
                    <button type="button" class="maw-primary" data-save>${uiIcon('check')}<span data-editor-save-label>${t('save')}</span></button>
                </footer>
            </div>
        `;
        document.documentElement.appendChild(backdrop);

        const countEl = backdrop.querySelector('[data-editor-count]');
        const statusEl = backdrop.querySelector('[data-editor-status]');
        const saveButton = backdrop.querySelector('[data-save]');
        const ruleForm = backdrop.querySelector('[data-rule-form]');
        const ruleInput = backdrop.querySelector('[data-rule-input]');
        const ruleType = backdrop.querySelector('[data-rule-type]');
        const ruleValueLabel = backdrop.querySelector('[data-rule-value-label]');
        const ruleSubmitLabel = backdrop.querySelector('[data-rule-submit-label]');
        const ruleFormTitle = backdrop.querySelector('[data-rule-form-title]');
        const matchHelp = backdrop.querySelector('[data-match-help]');
        const formFeedback = backdrop.querySelector('[data-form-feedback]');
        const cancelEditButton = backdrop.querySelector('[data-cancel-edit]');
        const searchInput = backdrop.querySelector('[data-rule-search]');
        const ruleList = backdrop.querySelector('[data-rule-list]');

        const typeLabelKey = (type) => ({ contains: 'matchContains', exact: 'matchExact', regex: 'matchRegex' }[type] || 'matchContains');
        const typeHelpKey = (type) => ({ contains: 'matchContainsHelp', exact: 'matchExactHelp', regex: 'matchRegexHelp' }[type] || 'matchContainsHelp');

        let formFeedbackState = { key: '', tone: '' };
        const setFormFeedback = (key = '', tone = '') => {
            formFeedbackState = { key, tone };
            formFeedback.textContent = key ? t(key) : '';
            formFeedback.className = `maw-form-feedback${tone ? ` is-${tone}` : ''}`;
            formFeedback.setAttribute('role', tone === 'error' ? 'alert' : 'status');
            ruleInput.setAttribute('aria-invalid', tone === 'error' ? 'true' : 'false');
        };

        const getPreview = () => {
            const encodedRules = rules.map(encodeEditorRule).filter(Boolean);
            const matches = getAllRows().filter((row) => {
                const rowWord = getRowWord(row);
                return encodedRules.some((rule) => wordMatchesRow(rule, rowWord));
            }).length;
            return { matches };
        };

        const getDraftState = () => {
            const type = ['contains', 'exact', 'regex'].includes(ruleType.value) ? ruleType.value : 'contains';
            const normalizedValue = normalizeEditorRuleValue(ruleInput.value, type);
            const hasInput = type === 'regex' ? ruleInput.value.length > 0 : Boolean(ruleInput.value.trim());
            if (editingId === null) return { hasPendingDraft: hasInput, hasEditChanges: false };
            const editingRule = rules.find((rule) => rule.id === editingId);
            const hasEditChanges = !editingRule || editingRule.type !== type || editingRule.value !== normalizedValue;
            return { hasPendingDraft: hasEditChanges, hasEditChanges };
        };

        const refreshEditorMeta = () => {
            const { matches } = getPreview();
            const { hasPendingDraft } = getDraftState();
            const dirty = serializeRules() !== savedValue || hasPendingDraft;
            countEl.textContent = quantity(rules.length, 'rule');
            const statusParams = { matches: quantity(matches, 'match') };
            statusEl.textContent = t(dirty ? 'editorDirty' : 'editorSaved', statusParams);
            statusEl.className = `maw-modal-status ${dirty ? 'is-dirty' : 'is-saved'}`;
            return { rules, matches, dirty };
        };

        const renderFormMode = () => {
            const isEditing = editingId !== null;
            const isCustomRule = ruleType.value === 'regex';
            ruleFormTitle.textContent = t(isEditing ? 'editRuleTitle' : 'addRuleTitle');
            ruleSubmitLabel.textContent = t(isEditing ? 'updateRule' : 'addRule');
            cancelEditButton.hidden = !isEditing;
            matchHelp.textContent = t(typeHelpKey(ruleType.value));
            ruleValueLabel.textContent = t(isCustomRule ? 'customRuleValueLabel' : 'ruleValueLabel');
            ruleInput.placeholder = t(isCustomRule ? 'customRulePlaceholder' : 'ruleValuePlaceholder');
        };

        const resetForm = ({ keepFeedback = false } = {}) => {
            editingId = null;
            ruleInput.value = '';
            ruleType.value = 'contains';
            if (!keepFeedback) setFormFeedback();
            renderFormMode();
            refreshEditorMeta();
        };

        const renderRuleList = () => {
            const search = normalizeText(searchInput.value);
            const visibleRules = rules.filter((rule) => !search || normalizeText(`${rule.value} ${t(typeLabelKey(rule.type))}`).includes(search));
            ruleList.replaceChildren();
            if (!visibleRules.length) {
                const empty = document.createElement('div');
                empty.className = 'maw-rule-empty';
                empty.textContent = rules.length ? t('noSearchResults') : t('noRules');
                ruleList.appendChild(empty);
                refreshEditorMeta();
                return;
            }

            visibleRules.forEach((rule) => {
                const row = document.createElement('div');
                row.className = 'maw-rule-row';
                row.dataset.ruleId = String(rule.id);

                const badge = document.createElement('span');
                badge.className = 'maw-rule-badge';
                badge.dataset.type = rule.type;
                badge.textContent = t(typeLabelKey(rule.type));

                const value = document.createElement('div');
                value.className = 'maw-rule-value';
                value.textContent = rule.value;
                value.title = rule.value;

                const actions = document.createElement('div');
                actions.className = 'maw-rule-actions';
                const editButton = document.createElement('button');
                editButton.type = 'button';
                editButton.className = 'maw-row-btn';
                editButton.dataset.editRule = String(rule.id);
                editButton.setAttribute('aria-label', `${t('editRule')}: ${rule.value}`);
                editButton.title = t('editRule');
                editButton.innerHTML = uiIcon('edit');
                const removeButton = document.createElement('button');
                removeButton.type = 'button';
                removeButton.className = 'maw-row-btn is-danger';
                removeButton.dataset.removeRule = String(rule.id);
                removeButton.setAttribute('aria-label', `${t('removeRule')}: ${rule.value}`);
                removeButton.title = t('removeRule');
                removeButton.innerHTML = uiIcon('close');
                actions.append(editButton, removeButton);
                row.append(badge, value, actions);
                ruleList.appendChild(row);
            });
            refreshEditorMeta();
        };

        const startEditing = (id) => {
            const rule = rules.find((item) => item.id === id);
            if (!rule) return;
            editingId = id;
            ruleInput.value = rule.value;
            ruleType.value = rule.type;
            setFormFeedback();
            renderFormMode();
            refreshEditorMeta();
            ruleInput.focus();
            ruleInput.select();
        };

        const removeRule = (id) => {
            if (!rules.some((rule) => rule.id === id)) return;
            rules = rules.filter((rule) => rule.id !== id);
            if (editingId === id) resetForm();
            setFormFeedback('ruleRemoved', 'success');
            renderRuleList();
        };

        const submitRule = () => {
            const type = ['contains', 'exact', 'regex'].includes(ruleType.value) ? ruleType.value : 'contains';
            const value = normalizeEditorRuleValue(ruleInput.value, type);
            if (!value) {
                setFormFeedback('ruleRequired', 'error');
                ruleInput.focus();
                return;
            }
            if (type === 'regex') {
                try { new RegExp(value, 'iu'); }
                catch {
                    setFormFeedback('invalidRegex', 'error');
                    ruleInput.focus();
                    return;
                }
            }

            const candidateKey = editorRuleDuplicateKey({ type, value });
            const duplicate = rules.some((rule) => rule.id !== editingId && editorRuleDuplicateKey(rule) === candidateKey);
            if (duplicate) {
                setFormFeedback('duplicateRule', 'error');
                ruleInput.focus();
                return;
            }

            const wasEditing = editingId !== null;
            if (wasEditing) {
                rules = rules.map((rule) => rule.id === editingId ? { ...rule, type, value, sourceRaw: null, edited: true } : rule);
            } else {
                rules.unshift({ id: nextRuleId++, type, value, sourceRaw: null, edited: true });
            }
            searchInput.value = '';
            resetForm({ keepFeedback: true });
            setFormFeedback(wasEditing ? 'ruleUpdated' : 'ruleAdded', 'success');
            renderRuleList();
            ruleInput.focus();
        };

        const relocalize = () => {
            backdrop.querySelector('.maw-modal-logo-shell')?.setAttribute('aria-label', t('logoOpen'));
            const titleEl = backdrop.querySelector('[data-editor-title]');
            const noteEl = backdrop.querySelector('[data-editor-note]');
            const closeButton = backdrop.querySelector('[data-editor-close-icon]');
            const cancelButton = backdrop.querySelector('[data-editor-cancel]');
            const saveLabel = backdrop.querySelector('[data-editor-save-label]');
            if (titleEl) titleEl.textContent = t('editorTitle');
            if (noteEl) noteEl.textContent = t('editorNote');
            if (closeButton) closeButton.setAttribute('aria-label', t('close'));
            if (cancelButton) cancelButton.textContent = t('cancel');
            if (saveLabel) saveLabel.textContent = t('save');
            backdrop.querySelector('[data-rule-type-label]').textContent = t('matchTypeLabel');
            ruleType.querySelector('option[value="contains"]').textContent = t('matchContainsOption');
            ruleType.querySelector('option[value="exact"]').textContent = t('matchExactOption');
            ruleType.querySelector('option[value="regex"]').textContent = t('matchRegexOption');
            searchInput.placeholder = t('searchRulesPlaceholder');
            searchInput.setAttribute('aria-label', t('searchRulesAria'));
            backdrop.querySelector('[data-rule-list-title]').textContent = t('ruleListTitle');
            cancelEditButton.textContent = t('cancelEdit');
            setFormFeedback(formFeedbackState.key, formFeedbackState.tone);
            renderFormMode();
            renderRuleList();
        };

        const onKeyDown = (event) => {
            if (event.key === 'Escape' && !saveInProgress) close();
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                if (!saveInProgress) saveButton.click();
            }
        };
        const close = (force = false) => {
            if (saveInProgress && !force) return;
            const hasUnsavedRules = serializeRules() !== savedValue;
            const { hasPendingDraft } = getDraftState();
            if (!force && (hasUnsavedRules || hasPendingDraft) && !window.confirm(t('discardChanges'))) return;
            document.removeEventListener('keydown', onKeyDown, true);
            backdrop.remove();
            if (editorCleanup === forceClose) editorCleanup = null;
            if (editorRelocalize === relocalize) editorRelocalize = null;
            if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus();
        };
        const forceClose = () => close(true);
        const setEditorSaving = (busy) => {
            saveInProgress = busy;
            backdrop.querySelector('.maw-modal')?.setAttribute('aria-busy', String(busy));
            backdrop.querySelectorAll('button,input,select').forEach((control) => { control.disabled = busy; });
        };
        editorCleanup = forceClose;
        editorRelocalize = relocalize;

        ruleForm.addEventListener('submit', (event) => {
            event.preventDefault();
            submitRule();
        });
        ruleInput.addEventListener('input', () => {
            if (formFeedback.classList.contains('is-error')) setFormFeedback();
            refreshEditorMeta();
        });
        ruleType.addEventListener('change', () => {
            setFormFeedback();
            renderFormMode();
            refreshEditorMeta();
        });
        cancelEditButton.addEventListener('click', () => {
            resetForm();
            ruleInput.focus();
        });
        searchInput.addEventListener('input', renderRuleList);
        ruleList.addEventListener('click', (event) => {
            const editButton = event.target.closest('[data-edit-rule]');
            const removeButton = event.target.closest('[data-remove-rule]');
            if (editButton) startEditing(Number(editButton.dataset.editRule));
            if (removeButton) removeRule(Number(removeButton.dataset.removeRule));
        });
        backdrop.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => close()));
        backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
        document.addEventListener('keydown', onKeyDown, true);
        saveButton.addEventListener('click', async () => {
            if (saveInProgress) return;
            const draftState = getDraftState();
            if (editingId !== null && draftState.hasEditChanges) {
                setFormFeedback('pendingEdit', 'error');
                ruleInput.focus();
                return;
            }
            if (editingId !== null) resetForm();
            if (editingId === null && draftState.hasPendingDraft) {
                setFormFeedback('pendingRule', 'error');
                ruleInput.focus();
                return;
            }
            if (!rules.length) {
                statusEl.textContent = t('atLeastOneRule');
                statusEl.className = 'maw-modal-status is-dirty';
                notify('warning', t('emptyListCannotSave'));
                return;
            }
            const serializedValue = serializeRules();
            if (new TextEncoder().encode(serializedValue).length > MAX_WORDLIST_BYTES) {
                statusEl.textContent = t('editorSaveFailed', { error: t('localListTooLarge') });
                statusEl.className = 'maw-modal-status is-dirty';
                notify('error', t('editorSaveFailed', { error: t('localListTooLarge') }));
                return;
            }
            setEditorSaving(true);
            try {
                await setRulesValue('adWordlist', serializedValue);
                rules = rules.map((rule) => ({ ...rule, sourceRaw: encodeEditorRule(rule), edited: false }));
                savedValue = serializedValue;
                refreshEditorMeta();
                try {
                    const filteredRows = await decorateRows();
                    const saveParams = {
                        rules: quantity(rules.length, 'rule'),
                        matches: quantity(filteredRows.length, 'match'),
                    };
                    notify('success', t('rulesSaved', saveParams));
                    setPanelStatus('rulesSavedStatus', 'success', '', saveParams);
                } catch (previewError) {
                    const previewParams = {
                        rules: quantity(rules.length, 'rule'),
                        error: previewError?.message || previewError,
                    };
                    notify('warning', t('rulesSavedPreviewFailed', previewParams));
                    setPanelStatus('rulesSavedPreviewFailed', 'warning', '', previewParams);
                }
            } catch (error) {
                statusEl.textContent = t('editorSaveFailed', { error: error?.message || error });
                statusEl.className = 'maw-modal-status is-dirty';
                notify('error', t('editorSaveFailed', { error: error?.message || error }));
            } finally {
                setEditorSaving(false);
            }
        });
        relocalize();
        requestAnimationFrame(() => ruleInput.focus());
    }

    // ─── Menu commands ────────────────────────────────────────────────────────

    let menuCommandIds = [];
    let menuCommandsRegistered = false;

    function registerMenuCommands() {
        if (menuCommandsRegistered) {
            if (typeof GM_unregisterMenuCommand !== 'function') return;
            menuCommandIds.forEach((id) => {
                try { GM_unregisterMenuCommand(id); }
                catch { /* The userscript manager may already have removed it. */ }
            });
        }

        const commands = [
            ['menuCloseCurrent', () => runToggleRows(false)],
            ['menuOpenCurrent', () => runToggleRows(true)],
            ['menuCloseAll', () => requestDisableAllPages()],
            ['menuUpdateList', () => ensureWord()],
            ['menuRestoreList', () => restoreWordlistBackup()],
            ['menuEditList', () => openWordlistEditor()],
            ['menuTogglePanel', () => setPanelCollapsed(!panelCollapsed)],
            ['menuSwitchLanguage', () => switchLanguage()],
            ['menuCheckScriptUpdate', () => checkScriptUpdate({ manual: true })],
        ];
        menuCommandIds = commands.map(([key, callback]) => (
            GM_registerMenuCommand(`Makaytron · ${t(key)}`, callback)
        )).filter((id) => id !== undefined && id !== null);
        menuCommandsRegistered = true;
    }

    // ─── Keyboard shortcuts ───────────────────────────────────────────────────

    function isEditableTarget(target) {
        return target instanceof Element && Boolean(
            target.closest('input, textarea, select, button, a[href], [contenteditable="true"], [role="textbox"], [role="button"]')
        );
    }

    document.addEventListener('keydown', (e) => {
        if (e.repeat || e.isComposing || document.getElementById(EDITOR_MODAL_ID) || isEditableTarget(e.target)) return;
        if (e.getModifierState?.('AltGraph')) return;

        const autoShortcut = e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey && e.code === 'KeyK';
        const pageShortcut = e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && e.code === 'Space';
        if (!autoShortcut && !pageShortcut) return;

        e.preventDefault();
        if (autoShortcut) requestDisableAllPages();
        else requestShortcutDisableCurrentPage();
    });

    // ─── Page load ────────────────────────────────────────────────────────────

    async function initializePage() {
        await loadLanguage();
        registerMenuCommands();
        registerTelemetryMenuCommand();
        await mountMakaytronPanel();
        scheduleAutomaticScriptUpdateCheck();
        setPanelStatus('loadingKeywordTable', 'running', 'preparing');
        const rowsReady = await waitForKeywordRows();
        if (!rowsReady) {
            void trackTelemetryError('selector_ads_table');
            throw new Error(t('keywordTableFailed'));
        }
        const filteredRows = await decorateRows();
        setPanelStatus(
            'rowsReady',
            filteredRows.length ? 'warning' : 'ready',
            '',
            {
                rows: quantity(getAllRows().length, 'row'),
                matches: quantity(filteredRows.length, 'match'),
            }
        );
        notify('success', t('appReady'));
    }

    function startInitialization() {
        initializePage().catch((error) => {
            console.error('[Makaytron Etsy Ads Keyword Manager]', t('consoleInitializationFailed'), error);
            notify('error', t('appStartFailed', { error: error?.message || error }));
            setPanelStatus(error?.message || t('appStartFailedFallback'), 'error', '', {}, true);
        });
    }

    if (document.readyState === 'complete') {
        startInitialization();
    } else {
        window.addEventListener('load', startInitialization, { once: true });
    }

})();
