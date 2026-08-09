// ==UserScript==
// @name         Makaytron Etsy Sale Manager
// @name:tr      Makaytron Etsy Sale Manager
// @name:en      Makaytron Etsy Sale Manager
// @version      1.0.11
// @description  Bulk Sales & Discounts Automation for Etsy: schedule, verify, and report sale campaigns safely
// @description:tr Etsy Sales and Discounts kampanyalarını güvenli toplu seriler hâlinde planlar, doğrular ve raporlar
// @description:en Bulk Sales & Discounts Automation for Etsy: schedule, verify, and report sale campaigns safely
// @namespace    https://github.com/Makaytron/EtsyScript
// @author       Makaytron (@Makaytron)
// @license      MIT
// @antifeature  tracking
// @homepageURL  https://github.com/Makaytron/Etsy-Automation-Tools/tree/main/scripts/etsy-sale-campaign-batch-runner
// @supportURL   https://github.com/Makaytron/Etsy-Automation-Tools/issues
// @updateURL    https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-sale-campaign-batch-runner/Etsy-Sale-Campaign-Batch-Runner.user.js
// @downloadURL  https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-sale-campaign-batch-runner/Etsy-Sale-Campaign-Batch-Runner.user.js
// @resource     makaytronLogo https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/assets/makaytron-logo.png
// @match        https://www.etsy.com/your/shops/me/sales-discounts*
// @match        https://etsy.com/your/shops/me/sales-discounts*
// @icon         https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/assets/makaytron-logo.png
// @grant        GM.addStyle
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM.addValueChangeListener
// @grant        GM_addValueChangeListener
// @grant        GM.registerMenuCommand
// @grant        GM.xmlHttpRequest
// @grant        GM.getResourceURL
// @grant        GM.info
// @connect      raw.githubusercontent.com
// @connect      sjwibgcflufmzaorlwqe.supabase.co
// @noframes
// @run-at       document-idle
// ==/UserScript==

(async function () {
    'use strict';

    const VERSION = '1.0.11';
    const TELEMETRY_ENDPOINT = 'https://sjwibgcflufmzaorlwqe.supabase.co/functions/v1/telemetry-ingest';
    const TELEMETRY_HEADER_NAME = 'x-makaytron-telemetry';
    const TELEMETRY_HEADER_VALUE = '1';
    const TELEMETRY_SCRIPT_ID = 'etsy-sale-manager';
    const TELEMETRY_ALLOWED_EVENTS = new Set(['script_opened', 'sale_series_completed']);
    const TELEMETRY_ALLOWED_ERROR_CODES = new Set(['selector_sale_form', 'selector_sale_transition', 'selector_sale_scope', 'selector_sale_verification', 'network_sale_verification', 'runtime_sale_action', 'storage_sale_state']);
    const TELEMETRY_PRIVACY_URL = 'https://github.com/Makaytron/Etsy-Automation-Tools/blob/main/PRIVACY.en.md';
    const TELEMETRY_STORAGE_PREFIX = `makaytron-telemetry:${TELEMETRY_SCRIPT_ID}:v1`;
    const TELEMETRY_KEYS = Object.freeze({
        installationId: `${TELEMETRY_STORAGE_PREFIX}:installation-id`,
        enabled: `${TELEMETRY_STORAGE_PREFIX}:enabled`,
        consentIntent: `${TELEMETRY_STORAGE_PREFIX}:consent-intent`,
        noticeSeen: `${TELEMETRY_STORAGE_PREFIX}:notice-seen:error-codes-v1`,
        sentDays: `${TELEMETRY_STORAGE_PREFIX}:sent-days`,
    });
    const TELEMETRY_OPERATION_LOCK_NAME = `${TELEMETRY_STORAGE_PREFIX}:operation`;
    const TELEMETRY_IDENTITY_LOCK_NAME = `${TELEMETRY_STORAGE_PREFIX}:identity`;
    const TELEMETRY_SENT_DAYS_LOCK_NAME = `${TELEMETRY_STORAGE_PREFIX}:sent-days`;
    const TELEMETRY_SENT_DAYS_OWNER = '__installation_id';
    const TELEMETRY_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const telemetryPendingEvents = new Set();
    const telemetryRequests = new Set();
    let telemetrySentDaysWriteChain = Promise.resolve(false);
    let telemetryOperationChain = Promise.resolve(false);
    let telemetryInstallationIdPromise = null;
    let telemetryIdentityListenerPromise = null;
    let telemetryIdentityListenerRegistered = false;
    let telemetryIdentityReconciliationChain = Promise.resolve(true);
    let telemetryPreferenceStateUnavailable = false;
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

    function withTelemetrySentDaysLock(operation, options = {}) {
        if (!telemetryWebLocksAvailable()) return Promise.resolve(false);
        return navigator.locks.request(
            TELEMETRY_SENT_DAYS_LOCK_NAME,
            { mode: 'exclusive' },
            () => operation(true),
        );
    }

    function clearTelemetrySentDaysConfirmed(installationId = '', options = {}) {
        return withTelemetrySentDaysLock(
            () => clearTelemetrySentDaysConfirmedLocked(installationId, options),
            { destructive: true },
        );
    }

    async function clearTelemetrySentDaysConfirmedLocked(installationId = '', options = {}) {
        const force = options.force === true;
        const consentIntent = options.consentIntent || null;
        if (consentIntent && !await telemetryConsentIntentIsCurrent(consentIntent)) return false;
        if (!force) {
            // A remote tab may already have replaced both the installation ID and its
            // dedupe markers while cleanup for the superseded ID is still queued. Do
            // not let the stale cleanup delete the new tab's marker write.
            const activeInstallationRead = await telemetryReadValue(TELEMETRY_KEYS.installationId, '');
            if (!activeInstallationRead.ok) return false;
            const activeInstallationId = activeInstallationRead.value;
            if (typeof activeInstallationId === 'string'
                && TELEMETRY_UUID_PATTERN.test(activeInstallationId)
                && activeInstallationId !== installationId) return true;

        }
        const currentRead = await telemetryReadValue(TELEMETRY_KEYS.sentDays, null);
        if (!currentRead.ok) return false;
        const current = currentRead.value;
        if (current == null) return true;
        const owner = current && typeof current === 'object' && !Array.isArray(current)
            ? current[TELEMETRY_SENT_DAYS_OWNER]
            : '';
        if (typeof owner === 'string' && owner && owner !== installationId) return !force;
        if (consentIntent && !await telemetryConsentIntentIsCurrent(consentIntent)) return false;
        await telemetryDeleteValue(TELEMETRY_KEYS.sentDays);
        const confirmed = await telemetryReadValue(TELEMETRY_KEYS.sentDays, null);
        if (consentIntent && !await telemetryConsentIntentIsCurrent(consentIntent)) return false;
        return !!(confirmed.ok && confirmed.value == null);
    }

    async function deleteTelemetryServerRecord(installationId) {
        if (typeof installationId !== 'string' || !TELEMETRY_UUID_PATTERN.test(installationId)) return false;
        return dispatchTelemetry('DELETE', {
            schema: 1,
            installation_id: installationId,
            script_id: TELEMETRY_SCRIPT_ID,
            app_version: VERSION,
        });
    }

    function reconcileRemoteTelemetryIdentity(oldValue, newValue, remote) {
        const oldInstallationId = typeof oldValue === 'string' && TELEMETRY_UUID_PATTERN.test(oldValue) ? oldValue : '';
        const newInstallationId = typeof newValue === 'string' && TELEMETRY_UUID_PATTERN.test(newValue) ? newValue : '';
        if (remote !== true || !oldInstallationId || oldInstallationId === newInstallationId) return Promise.resolve(true);
        telemetryBlockedInSession = true;
        const cleanup = telemetryIdentityReconciliationChain.then(() => withTelemetryOperationLock(async () => {
            await Promise.allSettled([...telemetryRequests]);
            await telemetrySentDaysWriteChain.catch(() => false);
            const sentDaysCleared = await clearTelemetrySentDaysConfirmed(oldInstallationId);
            const serverDeleted = await deleteTelemetryServerRecord(oldInstallationId);
            if (!sentDaysCleared || !serverDeleted) telemetryBlockedInSession = true;
            return sentDaysCleared && serverDeleted;
        }));
        telemetryIdentityReconciliationChain = cleanup.catch(() => {
            telemetryBlockedInSession = true;
            return false;
        });
        return cleanup;
    }

    async function ensureTelemetryIdentityListener() {
        if (telemetryIdentityListenerRegistered) return true;
        if (telemetryIdentityListenerPromise) return telemetryIdentityListenerPromise;
        const pending = (async () => {
            const modernListener = typeof GM !== 'undefined' && typeof GM.addValueChangeListener === 'function'
                ? GM.addValueChangeListener.bind(GM)
                : null;
            const legacyListener = typeof GM_addValueChangeListener === 'function' ? GM_addValueChangeListener : null;
            const addListener = modernListener || legacyListener;
            if (!addListener) return false;
            try {
                await addListener(TELEMETRY_KEYS.installationId, (_name, oldValue, newValue, remote) => {
                    void reconcileRemoteTelemetryIdentity(oldValue, newValue, remote);
                });
                telemetryIdentityListenerRegistered = true;
                return true;
            } catch { return false; }
        })();
        telemetryIdentityListenerPromise = pending;
        try { return await pending; }
        finally {
            if (telemetryIdentityListenerPromise === pending) telemetryIdentityListenerPromise = null;
        }
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
        return typeof navigator?.locks?.request === 'function';
    }

    async function beginTelemetryConsentIntent(action) {
        if (!['enable', 'disable'].includes(action)) return null;
        const token = telemetryUuid();
        if (!TELEMETRY_UUID_PATTERN.test(token)) return null;
        const intent = { action, token };
        if (!await telemetrySetValue(TELEMETRY_KEYS.consentIntent, intent)) return null;
        const intentRead = await telemetryReadValue(TELEMETRY_KEYS.consentIntent, null);
        return intentRead.ok
            && intentRead.value?.action === action
            && intentRead.value?.token === token
            ? intent
            : null;
    }

    async function telemetryConsentIntentIsCurrent(intent) {
        if (!intent?.action || !intent?.token) return false;
        const intentRead = await telemetryReadValue(TELEMETRY_KEYS.consentIntent, null);
        return intentRead.ok
            && intentRead.value?.action === intent.action
            && intentRead.value?.token === intent.token;
    }

    async function telemetryInstallationId() {
        if (telemetryInstallationIdPromise) return telemetryInstallationIdPromise;
        const pending = (async () => {
            const listenerAvailable = await ensureTelemetryIdentityListener();
            const storedRead = await telemetryReadValue(TELEMETRY_KEYS.installationId, '');
            if (!storedRead.ok) return '';
            const stored = storedRead.value;
            if (typeof stored === 'string' && TELEMETRY_UUID_PATTERN.test(stored)) return stored;
            const createAndConfirm = async () => {
                const created = telemetryUuid();
                if (!TELEMETRY_UUID_PATTERN.test(created)) return '';
                await telemetrySetValue(TELEMETRY_KEYS.installationId, created);
                const confirmedRead = await telemetryReadValue(TELEMETRY_KEYS.installationId, '');
                const confirmed = confirmedRead.value;
                return confirmedRead.ok && typeof confirmed === 'string' && TELEMETRY_UUID_PATTERN.test(confirmed) ? confirmed : '';
            };
            if (telemetryWebLocksAvailable()) {
                try {
                    return await navigator.locks.request(TELEMETRY_IDENTITY_LOCK_NAME, { mode: 'exclusive' }, async () => {
                        const currentRead = await telemetryReadValue(TELEMETRY_KEYS.installationId, '');
                        if (!currentRead.ok) return '';
                        const current = currentRead.value;
                        if (typeof current === 'string' && TELEMETRY_UUID_PATTERN.test(current)) return current;
                        return createAndConfirm();
                    });
                } catch { return ''; }
            }
            if (!listenerAvailable) return '';
            return createAndConfirm();
        })();
        telemetryInstallationIdPromise = pending;
        try { return await pending; }
        finally {
            if (telemetryInstallationIdPromise === pending) telemetryInstallationIdPromise = null;
        }
    }

    function withTelemetryOperationLock(operation) {
        const run = async () => {
            if (telemetryWebLocksAvailable()) {
                return navigator.locks.request(TELEMETRY_OPERATION_LOCK_NAME, { mode: 'exclusive' }, operation);
            }
            return operation();
        };
        const pending = telemetryOperationChain.then(run, run);
        telemetryOperationChain = pending.catch(() => false);
        return pending;
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

    async function telemetryIdentityFence(installationId) {
        const enabledRead = await telemetryReadValue(TELEMETRY_KEYS.enabled, true);
        const installationRead = await telemetryReadValue(TELEMETRY_KEYS.installationId, '');
        return !!(enabledRead.ok
            && enabledRead.value === true
            && installationRead.ok
            && installationRead.value === installationId
            && !telemetryPreferenceStateUnavailable
            && !telemetryBlockedInSession);
    }

    async function compensateAcceptedTelemetry(installationId, options = {}) {
        telemetryBlockedInSession = true;
        const sentDaysCleared = options.sentDaysLockHeld === true
            ? await clearTelemetrySentDaysConfirmedLocked(installationId)
            : await clearTelemetrySentDaysConfirmed(installationId);
        const serverDeleted = await deleteTelemetryServerRecord(installationId);
        return sentDaysCleared && serverDeleted;
    }

    function markTelemetrySignalSentLocked(signalKey, utcDay, installationId) {
        const write = telemetrySentDaysWriteChain.then(async () => {
            if (!TELEMETRY_UUID_PATTERN.test(String(installationId || '')) || !await telemetryIdentityFence(installationId)) {
                await compensateAcceptedTelemetry(installationId, { sentDaysLockHeld: true });
                return false;
            }
            const storedDaysRead = await telemetryReadValue(TELEMETRY_KEYS.sentDays, {});
            if (!storedDaysRead.ok) {
                await compensateAcceptedTelemetry(installationId, { sentDaysLockHeld: true });
                return false;
            }
            const storedDays = storedDaysRead.value;
            const sentDays = storedDays
                && typeof storedDays === 'object'
                && !Array.isArray(storedDays)
                && storedDays[TELEMETRY_SENT_DAYS_OWNER] === installationId
                ? storedDays
                : {};
            if (!await telemetryIdentityFence(installationId)) {
                await compensateAcceptedTelemetry(installationId, { sentDaysLockHeld: true });
                return false;
            }
            if (!await telemetrySetValue(TELEMETRY_KEYS.sentDays, {
                ...sentDays,
                [TELEMETRY_SENT_DAYS_OWNER]: installationId,
                [signalKey]: utcDay,
            })) {
                await compensateAcceptedTelemetry(installationId, { sentDaysLockHeld: true });
                return false;
            }
            if (!await telemetryIdentityFence(installationId)) {
                await compensateAcceptedTelemetry(installationId, { sentDaysLockHeld: true });
                return false;
            }
            return true;
        });
        telemetrySentDaysWriteChain = write.catch(() => false);
        return write;
    }

    function markTelemetrySignalSent(signalKey, utcDay, installationId) {
        return withTelemetrySentDaysLock(
            () => markTelemetrySignalSentLocked(signalKey, utcDay, installationId),
        );
    }

    async function trackTelemetry(eventName) {
        if (!TELEMETRY_ALLOWED_EVENTS.has(eventName) || telemetryBlockedInSession || telemetryPreferenceStateUnavailable || telemetrySuppressed() || telemetryPendingEvents.has(eventName)) return false;
        telemetryPendingEvents.add(eventName);
        try {
            return await withTelemetryOperationLock(async () => {
                const enabledRead = await telemetryReadValue(TELEMETRY_KEYS.enabled, true);
                if (!enabledRead.ok || enabledRead.value !== true || telemetryBlockedInSession || telemetryPreferenceStateUnavailable) return false;
                const installationId = await telemetryInstallationId();
                if (!installationId || telemetryBlockedInSession) return false;
                return withTelemetrySentDaysLock(async () => {
                    const utcDay = new Date().toISOString().slice(0, 10);
                    const storedDaysRead = await telemetryReadValue(TELEMETRY_KEYS.sentDays, {});
                    if (!storedDaysRead.ok) return false;
                    const storedDays = storedDaysRead.value;
                    const sentDays = storedDays
                        && typeof storedDays === 'object'
                        && !Array.isArray(storedDays)
                        && storedDays[TELEMETRY_SENT_DAYS_OWNER] === installationId
                        ? storedDays
                        : {};
                    if (sentDays[eventName] === utcDay || telemetryBlockedInSession) return false;
                    const accepted = await dispatchTelemetry('POST', {
                        schema: 1,
                        installation_id: installationId,
                        script_id: TELEMETRY_SCRIPT_ID,
                        event_name: eventName,
                        app_version: VERSION,
                    });
                    if (!accepted) return false;
                    return markTelemetrySignalSentLocked(eventName, utcDay, installationId);
                });
            });
        } catch { return false; }
        finally { telemetryPendingEvents.delete(eventName); }
    }

    async function trackTelemetryError(errorCode) {
        if (!TELEMETRY_ALLOWED_ERROR_CODES.has(errorCode) || telemetryBlockedInSession || telemetryPreferenceStateUnavailable || telemetrySuppressed()) return false;
        const signalKey = `error:${errorCode}`;
        if (telemetryPendingEvents.has(signalKey)) return false;
        telemetryPendingEvents.add(signalKey);
        try {
            return await withTelemetryOperationLock(async () => {
                const enabledRead = await telemetryReadValue(TELEMETRY_KEYS.enabled, true);
                if (!enabledRead.ok || enabledRead.value !== true || telemetryBlockedInSession || telemetryPreferenceStateUnavailable) return false;
                const installationId = await telemetryInstallationId();
                if (!installationId || telemetryBlockedInSession) return false;
                return withTelemetrySentDaysLock(async () => {
                    const utcDay = new Date().toISOString().slice(0, 10);
                    const storedDaysRead = await telemetryReadValue(TELEMETRY_KEYS.sentDays, {});
                    if (!storedDaysRead.ok) return false;
                    const storedDays = storedDaysRead.value;
                    const sentDays = storedDays
                        && typeof storedDays === 'object'
                        && !Array.isArray(storedDays)
                        && storedDays[TELEMETRY_SENT_DAYS_OWNER] === installationId
                        ? storedDays
                        : {};
                    if (sentDays[signalKey] === utcDay || telemetryBlockedInSession) return false;
                    const accepted = await dispatchTelemetry('POST', {
                        schema: 1,
                        installation_id: installationId,
                        script_id: TELEMETRY_SCRIPT_ID,
                        error_code: errorCode,
                        app_version: VERSION,
                    });
                    if (!accepted) return false;
                    return markTelemetrySignalSentLocked(signalKey, utcDay, installationId);
                });
            });
        } catch { return false; }
        finally { telemetryPendingEvents.delete(signalKey); }
    }

    async function telemetryConfirmedDisableResult(consentIntent, deleted = false) {
        const stillDisabled = await telemetryReadValue(TELEMETRY_KEYS.enabled, true);
        const intentCurrent = await telemetryConsentIntentIsCurrent(consentIntent);
        return {
            disabled: stillDisabled.ok && stillDisabled.value === false && intentCurrent,
            deleted: deleted && intentCurrent,
        };
    }

    async function clearTelemetryInstallationIdConfirmed(installationId, consentIntent) {
        if (!await telemetryConsentIntentIsCurrent(consentIntent)) return false;
        const currentRead = await telemetryReadValue(TELEMETRY_KEYS.installationId, null);
        if (!currentRead.ok) return false;
        if (currentRead.value == null) return true;
        if (currentRead.value !== installationId) return false;
        if (!await telemetryConsentIntentIsCurrent(consentIntent)) return false;
        await telemetryDeleteValue(TELEMETRY_KEYS.installationId);
        const confirmed = await telemetryReadValue(TELEMETRY_KEYS.installationId, null);
        return !!(confirmed.ok
            && confirmed.value == null
            && await telemetryConsentIntentIsCurrent(consentIntent));
    }

    async function disableTelemetryAndDelete() {
        telemetryBlockedInSession = true;
        try {
            return await withTelemetryOperationLock(async () => {
                const consentIntent = await beginTelemetryConsentIntent('disable');
                if (!consentIntent) return { disabled: false, deleted: false };
                const settingSaved = await telemetrySetValue(TELEMETRY_KEYS.enabled, false);
                const settingRead = settingSaved
                    ? await telemetryReadValue(TELEMETRY_KEYS.enabled, true)
                    : { ok: false, value: true };
                telemetryPreferenceStateUnavailable = !settingRead.ok;
                if (!settingRead.ok || settingRead.value !== false) return { disabled: false, deleted: false };
                if (!await telemetryConsentIntentIsCurrent(consentIntent)) return { disabled: false, deleted: false };
                telemetryPreferenceStateUnavailable = false;
                await Promise.allSettled([...telemetryRequests]);
                await telemetrySentDaysWriteChain.catch(() => false);
                if (!await telemetryConsentIntentIsCurrent(consentIntent)) return { disabled: false, deleted: false };
                const installationRead = await telemetryReadValue(TELEMETRY_KEYS.installationId, '');
                if (!installationRead.ok) return telemetryConfirmedDisableResult(consentIntent);
                const installationId = installationRead.value;
                let deleted = true;
                if (typeof installationId === 'string' && TELEMETRY_UUID_PATTERN.test(installationId)) {
                    if (!await telemetryConsentIntentIsCurrent(consentIntent)) return { disabled: false, deleted: false };
                    deleted = await deleteTelemetryServerRecord(installationId);
                }
                if (deleted) {
                    if (!await telemetryConsentIntentIsCurrent(consentIntent)) return { disabled: false, deleted: false };
                    const sentDaysCleared = await clearTelemetrySentDaysConfirmed(installationId, { force: true, consentIntent });
                    // Keep the installation ID as a retry handle when the shared
                    // dedupe key cannot be cleared safely (notably without Web Locks).
                    const installationCleared = sentDaysCleared
                        ? await clearTelemetryInstallationIdConfirmed(installationId, consentIntent)
                        : false;
                    const stillDisabled = await telemetryReadValue(TELEMETRY_KEYS.enabled, true);
                    const intentCurrent = await telemetryConsentIntentIsCurrent(consentIntent);
                    return {
                        disabled: stillDisabled.ok && stillDisabled.value === false && intentCurrent,
                        deleted: installationCleared && sentDaysCleared && intentCurrent,
                    };
                }
                const stillDisabled = await telemetryReadValue(TELEMETRY_KEYS.enabled, true);
                const intentCurrent = await telemetryConsentIntentIsCurrent(consentIntent);
                return {
                    disabled: stillDisabled.ok && stillDisabled.value === false && intentCurrent,
                    deleted: false,
                };
            });
        } catch { return { disabled: false, deleted: false }; }
    }

    async function resolveTelemetryEnableFailure(installationId, consentIntent) {
        telemetryBlockedInSession = true;
        if (!await telemetryConsentIntentIsCurrent(consentIntent)) return false;
        await telemetrySetValue(TELEMETRY_KEYS.enabled, false);
        const durablePreference = await telemetryReadValue(TELEMETRY_KEYS.enabled, true);
        if (!await telemetryConsentIntentIsCurrent(consentIntent)) return false;
        if (durablePreference.ok && durablePreference.value === false) {
            telemetryPreferenceStateUnavailable = false;
            return false;
        }
        if (durablePreference.ok && durablePreference.value === true) {
            const installationRead = await telemetryReadValue(TELEMETRY_KEYS.installationId, '');
            if (installationRead.ok
                && installationRead.value === installationId
                && await telemetryConsentIntentIsCurrent(consentIntent)) {
                telemetryPreferenceStateUnavailable = false;
                telemetryBlockedInSession = false;
                return true;
            }
        }
        telemetryPreferenceStateUnavailable = true;
        return false;
    }

    async function enableTelemetry() {
        telemetryBlockedInSession = true;
        // GM storage offers no atomic compare-and-delete primitive. Without a
        // cross-tab Web Lock an in-flight disable could erase an ID after this
        // function reported success, so re-enabling must fail closed.
        if (!telemetryWebLocksAvailable()) return false;
        try {
            return await withTelemetryOperationLock(async () => {
                const consentIntent = await beginTelemetryConsentIntent('enable');
                if (!consentIntent) return false;
                const installationId = await telemetryInstallationId();
                const installationRead = installationId
                    ? await telemetryReadValue(TELEMETRY_KEYS.installationId, '')
                    : { ok: false, value: '' };
                if (!installationId || !installationRead.ok || installationRead.value !== installationId) {
                    const durablePreference = await telemetryReadValue(TELEMETRY_KEYS.enabled, true);
                    telemetryPreferenceStateUnavailable = !durablePreference.ok || durablePreference.value === true;
                    return false;
                }
                if (!await telemetryConsentIntentIsCurrent(consentIntent)) return false;
                if (!await telemetrySetValue(TELEMETRY_KEYS.enabled, true)) {
                    return resolveTelemetryEnableFailure(installationId, consentIntent);
                }
                const settingRead = await telemetryReadValue(TELEMETRY_KEYS.enabled, false);
                if (!settingRead.ok || settingRead.value !== true) {
                    return resolveTelemetryEnableFailure(installationId, consentIntent);
                }
                if (!await telemetryConsentIntentIsCurrent(consentIntent)) return false;
                const finalInstallationRead = await telemetryReadValue(TELEMETRY_KEYS.installationId, '');
                if (!finalInstallationRead.ok || finalInstallationRead.value !== installationId) {
                    return resolveTelemetryEnableFailure(installationId, consentIntent);
                }
                if (!await telemetryConsentIntentIsCurrent(consentIntent)) return false;
                telemetryPreferenceStateUnavailable = false;
                telemetryBlockedInSession = false;
                return true;
            });
        } catch {
            telemetryBlockedInSession = true;
            const durablePreference = await telemetryReadValue(TELEMETRY_KEYS.enabled, true);
            telemetryPreferenceStateUnavailable = !durablePreference.ok || durablePreference.value === true;
            return false;
        }
    }

    async function telemetryEnabledState() {
        if (telemetryPreferenceStateUnavailable) return 'unavailable';
        const enabledRead = await telemetryReadValue(TELEMETRY_KEYS.enabled, true);
        if (!enabledRead.ok) return 'unavailable';
        if (enabledRead.value === true) return 'enabled';
        if (enabledRead.value === false) return 'disabled';
        return 'unavailable';
    }

    async function showTelemetryFirstRunNotice() {
        const noticeId = `makaytron-telemetry-notice-${TELEMETRY_SCRIPT_ID}`;
        if (!document.documentElement) return false;
        const enabledState = await telemetryEnabledState();
        const noticeSeenRead = await telemetryReadValue(TELEMETRY_KEYS.noticeSeen, false);
        if (!noticeSeenRead.ok || (noticeSeenRead.value !== true && noticeSeenRead.value !== false)) return false;
        if (enabledState === 'disabled') return false;
        if (noticeSeenRead.value === true) return enabledState === 'enabled';
        if (document.getElementById(noticeId)) return false;
        const notice = document.createElement('aside');
        notice.id = noticeId;
        notice.setAttribute('role', 'status');
        notice.style.cssText = 'all:initial;position:fixed;left:16px;bottom:16px;z-index:2147483647;box-sizing:border-box;width:min(380px,calc(100vw - 32px));padding:14px;border:1px solid #d6d6d6;border-radius:10px;background:#fff;color:#202020;box-shadow:0 16px 42px rgba(0,0,0,.2);font:13px/1.45 Inter,system-ui,sans-serif';
        const initialMessage = enabledState === 'enabled'
            ? 'Usage metrics are enabled by default. Only the script ID, version, a random installation ID, allowlisted open/success signals, and fixed error codes are sent. No raw error text or Etsy content is collected.'
            : 'Usage metrics status is unavailable because the local setting could not be read. No metric will be sent until the setting can be confirmed.';
        notice.dataset.telemetryStatus = enabledState;
        notice.innerHTML = `<strong style="display:block;margin-bottom:5px;font-size:14px">Privacy-preserving usage metrics</strong><span data-message style="display:block;color:#525252">${initialMessage}</span><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:11px"><a href="${TELEMETRY_PRIVACY_URL}" target="_blank" rel="noopener noreferrer" style="align-self:center;color:#303030;font-weight:650">Privacy</a><button type="button" data-disable style="margin-left:auto;padding:7px 9px;border:1px solid #d8a8a8;border-radius:7px;background:#fff;color:#991b1b;font:650 11px/1.2 system-ui;cursor:pointer">Disable &amp; delete</button><button type="button" data-close style="padding:7px 10px;border:1px solid #202020;border-radius:7px;background:#202020;color:#fff;font:650 11px/1.2 system-ui;cursor:pointer">Got it</button></div>`;
        document.documentElement.appendChild(notice);
        notice.querySelector('[data-close]')?.addEventListener('click', () => notice.remove());
        notice.querySelector('[data-disable]')?.addEventListener('click', async event => {
            const button = event.currentTarget;
            button.disabled = true;
            const result = await disableTelemetryAndDelete();
            const message = notice.querySelector('[data-message]');
            if (message) message.textContent = !result.disabled
                ? 'The setting could not be saved or confirmed. Metrics are blocked only for this browser session; retry from the userscript menu.'
                : result.deleted
                    ? 'Usage metrics are disabled and server data was deleted.'
                    : 'Usage metrics are disabled, but cleanup could not be completed; retry from the userscript menu.';
            button.disabled = false;
        });
        if (enabledState !== 'enabled') return false;
        const noticeSaved = await telemetrySetValue(TELEMETRY_KEYS.noticeSeen, true);
        const noticeConfirmed = noticeSaved
            ? await telemetryReadValue(TELEMETRY_KEYS.noticeSeen, false)
            : { ok: false, value: false };
        if (!noticeConfirmed.ok || noticeConfirmed.value !== true) {
            telemetryBlockedInSession = true;
            notice.dataset.telemetryStatus = 'unavailable';
            const message = notice.querySelector('[data-message]');
            if (message) message.textContent = 'Usage metrics notice state could not be saved or confirmed. Metrics are blocked for this browser session.';
            return false;
        }
        return true;
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
            const enabledState = await telemetryEnabledState();
            const state = modal.querySelector('[data-state]');
            const output = modal.querySelector('[data-result]');
            const enableButton = modal.querySelector('[data-enable]');
            if (state) {
                state.dataset.telemetryStatus = enabledState;
                state.textContent = enabledState === 'enabled'
                    ? 'Status: enabled. Allowlisted open/success signals and fixed error codes only; no raw error text or Etsy content is collected.'
                    : enabledState === 'disabled'
                        ? 'Status: disabled.'
                        : 'Status: unavailable. The local usage-metrics setting could not be read; no enabled status is being assumed.';
            }
            if (output) output.textContent = result || '';
            if (enableButton) enableButton.hidden = enabledState === 'enabled';
        };
        modal.querySelector('[data-close]')?.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', event => { if (event.target === modal) modal.remove(); });
        modal.querySelector('[data-enable]')?.addEventListener('click', async () => {
            await renderState(await enableTelemetry() ? 'Usage metrics enabled.' : 'Usage metrics could not be enabled and remain blocked.');
        });
        modal.querySelector('[data-disable]')?.addEventListener('click', async () => {
            const result = await disableTelemetryAndDelete();
            await renderState(!result.disabled
                ? 'The setting could not be saved or confirmed. Metrics are blocked only for this browser session; retry here.'
                : result.deleted
                    ? 'Usage metrics disabled; server data deleted.'
                    : 'Usage metrics are disabled, but cleanup could not be completed. You can retry here.');
        });
        await renderState('');
    }

    function telemetryPanelOpened() {
        if (telemetrySuppressed()) return;
        void showTelemetryFirstRunNotice()
            .then(canTrack => canTrack ? trackTelemetry('script_opened') : false)
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
    const ROOT_ID = 'eda-batch-root';
    const TOAST_ID = 'eda-batch-toast-root';
    const PANEL_COLLAPSE_SESSION_KEY = 'eda-sale-campaign-panel-collapsed-v1';
    const STORAGE_KEY = 'eda-batch-config-v4';
    const JOB_KEY = 'eda-batch-job-v4';
    const REPORT_KEY = 'eda-batch-report-v4';
    const REPORT_HISTORY_KEY = 'eda-batch-report-history-v4';
    const LEASE_KEY = 'eda-batch-lease-v4';
    const MUTEX_KEY = 'eda-batch-mutex-v4';
    const LEGACY_STORAGE_KEY = 'eda-batch-config-v3';
    const LEGACY_JOB_KEY = 'eda-batch-job-v3';
    const LEGACY_REPORT_KEY = 'eda-batch-report-v3';
    const STATE_LOCK_NAME = 'eda-sale-batch-state-v4';
    const LEASE_MS = 15000;
    const LEASE_RENEW_MS = 3500;
    const LEASE_HANDOFF_SESSION_KEY = 'eda-batch-lease-handoff-v4';
    const LEASE_HANDOFF_MAX_AGE_MS = 10000;
    const SHOP_IDENTITY_TIMEOUT_MS = 20000;
    const TRANSIENT_SALE_LOADING_TIMEOUT_MS = 20000;
    const TRANSIENT_SALE_LOADING_PHASES = new Set([
        'open_form', 'fill_form', 'await_listings', 'select_listings',
        'await_review', 'confirm_sale', 'await_result',
    ]);
    const FINAL_RESULT_WAIT_MS = 12000;
    const ACTION_GRACE_MS = 14000;
    const NON_FINAL_RESERVATION_TTL_MS = 18000;
    const FETCH_TIMEOUT_MS = 12000;
    const MAX_VERIFY_FETCH_ATTEMPTS = 6;
    const MAX_LIST_PAGES = 12;
    const PROMOTION_INDEX_TTL_MS = 90000;
    const PROMOTION_INDEX_MAX_USES = 6;
    const FETCH_BUDGET_WINDOW_MS = 60000;
    const FETCH_BUDGET_MAX = 24;
    const FETCH_MIN_GAP_MS = 650;
    const CREATE_SALE_URL = 'https://www.etsy.com/your/shops/me/sales-discounts/step/createSale?ref=seller-platform-mcnav';
    const PROMOTIONS_URL = 'https://www.etsy.com/your/shops/me/sales-discounts?ref=seller-platform-mcnav';
    const DETAILS_STATS_URL = 'https://www.etsy.com/your/shops/me/sales-discounts/details-stats?ref=seller-platform-mcnav';

    const GITHUB_USERNAME = 'Makaytron';
    const GITHUB_REPOSITORY = 'Etsy-Automation-Tools';
    const GITHUB_BRANCH = 'main';
    const GITHUB_SCRIPT_PATH = 'scripts/etsy-sale-campaign-batch-runner/Etsy-Sale-Campaign-Batch-Runner.user.js';
    const GITHUB_PROFILE_URL = `https://github.com/${GITHUB_USERNAME}`;
    const GITHUB_REPOSITORY_URL = `https://github.com/${GITHUB_USERNAME}/${GITHUB_REPOSITORY}`;
    const GITHUB_PROJECT_URL = `${GITHUB_REPOSITORY_URL}/tree/${GITHUB_BRANCH}/scripts/etsy-sale-campaign-batch-runner`;
    const MAKAYTRON_WEBSITE_URL = 'https://makaytron.com';
    const GITHUB_RAW_SCRIPT_URL = `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${GITHUB_REPOSITORY}/${GITHUB_BRANCH}/${GITHUB_SCRIPT_PATH}`;
    const UPDATE_STATE_KEY = 'eda-batch-update-state-v1';
    const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
    const UPDATE_CHECK_TIMEOUT_MS = 12000;
    let MAKAYTRON_LOGO_URL = 'https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/assets/makaytron-logo.png';

    try {
        const cachedLogoUrl = await GM.getResourceURL?.('makaytronLogo');
        if (cachedLogoUrl) MAKAYTRON_LOGO_URL = String(cachedLogoUrl);
    } catch (error) {
        console.warn('Makaytron logo resource unavailable', error);
    }

    const today = new Date();
    const DEFAULT_CONFIG = {
        discount: 25,
        discountName: '',
        batchStartDate: isoDate(today),
        batchEndDate: isoDate(today),
        saleDurationDays: 1,
        countryValue: '0',
        listingScope: 'all',
        autoResumeOnLoad: true,
        verifyTimeoutMs: 20000,
        cooldownMinMs: 2200,
        cooldownMaxMs: 4200,
    };

    const TAB_ID = getOrCreateTabId();
    const INSTANCE_ID = randomId('instance-');
    let config = { ...DEFAULT_CONFIG };
    let job = null;
    let lastReport = null;
    let panelEl = null;
    let statusEl = null;
    let panelActionState = null;
    let panelActionSequence = 0;
    let lastRenderedJobSignature = null;
    let lastRenderedLeaseOwned = null;
    let tickLock = false;
    let timerId = null;
    let leaseOwned = false;
    let ownedLeaseNonce = '';
    let lastLeaseRenewAt = 0;
    let lastShopIdentity = null;
    let lastShopIdentityAt = 0;
    let automationController = new AbortController();
    let stateChannel = null;
    let fetchRequestTimes = [];
    let lastFetchStartedAt = 0;
    let updateState = { status: 'idle', latestVersion: '', checkedAt: 0, error: '', notifiedVersion: '' };
    let panelCollapsed = readPanelCollapsed();
    let routeActive = isSupportedRoute();
    let lastObservedUrl = location.href;
    let routeWatchTimerId = null;
    let saleFlowObserver = null;
    let observedSaleFlowRoot = null;
    let transitionTickTimerId = null;
    let transientSaleLoadingWait = null;

    addStyle(`
        #${ROOT_ID}{
            --eda-bg:#fff;--eda-fg:#171717;--eda-card:#fff;--eda-muted:#f7f7f7;--eda-muted-2:#f2f2f2;
            --eda-muted-fg:#737373;--eda-border:#e7e7e7;--eda-input:#dedede;--eda-primary:#1f1f1f;
            --eda-primary-fg:#fafafa;--eda-danger:#b91c1c;--eda-warning:#9a6700;--eda-success:#276749;
            position:fixed;right:18px;top:86px;width:372px;z-index:2147483645;
            font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:var(--eda-fg);
            font-variant-numeric:tabular-nums;
        }
        #${ROOT_ID} *,.eda-modal *,.eda-report *{box-sizing:border-box}
        #${ROOT_ID} .eda-card{background:var(--eda-card);border:1px solid var(--eda-border);border-radius:11px;box-shadow:0 1px 3px rgba(15,23,42,.08),0 12px 30px rgba(15,23,42,.08);overflow:hidden}
        #${ROOT_ID}.eda-collapsed{right:0;top:148px;width:44px}
        #${ROOT_ID}.eda-collapsed .eda-collapsed-tab{width:44px;height:58px;min-height:58px;padding:0;border:1px solid #2b2b2b;border-right:0;border-radius:9px 0 0 9px;background:#1f1f1f;color:#fff;box-shadow:0 8px 22px rgba(0,0,0,.18)}
        #${ROOT_ID}.eda-collapsed .eda-collapsed-tab:hover{background:#303030}
        #${ROOT_ID}.eda-collapsed .eda-collapsed-tab .eda-svg{width:19px;height:19px}
        #${ROOT_ID} .eda-head{padding:13px 14px;background:var(--eda-card);border-bottom:1px solid var(--eda-border);display:flex;justify-content:space-between;gap:12px;align-items:center}
        #${ROOT_ID} .eda-brand{display:flex;align-items:center;gap:10px;min-width:0}
        #${ROOT_ID} .eda-logo-shell,.eda-modal-logo-shell{display:flex;align-items:center;justify-content:center;flex:0 0 auto;width:48px;height:32px;border:0;border-radius:0;background:transparent;overflow:visible;text-decoration:none}
        #${ROOT_ID} .eda-logo,.eda-modal-logo{display:block;width:43px;height:auto;object-fit:contain}
        #${ROOT_ID} .eda-brand-copy{min-width:0}
        #${ROOT_ID} .eda-title{margin:0;font-size:13.5px;font-weight:700;letter-spacing:-.015em;line-height:1.22;white-space:normal;overflow:visible;text-overflow:clip}
        #${ROOT_ID} .eda-sub{margin-top:3px;font-size:11.5px;color:var(--eda-muted-fg);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #${ROOT_ID} .eda-head-tools{display:flex;align-items:center;gap:7px;flex:0 0 auto}
        #${ROOT_ID} .eda-head-meta{display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex:0 0 auto}
        #${ROOT_ID} .eda-collapse-head{width:30px;min-width:30px;height:30px;min-height:30px;padding:0;border:1px solid var(--eda-border);border-radius:7px;background:#fff;color:#737373}
        #${ROOT_ID} .eda-collapse-head:hover{background:var(--eda-muted);color:#171717}
        #${ROOT_ID} .eda-version{display:inline-flex;align-items:center;height:20px;padding:0 7px;border:1px solid var(--eda-border);border-radius:999px;background:var(--eda-muted);font-size:10.5px;font-weight:650;color:#525252}
        #${ROOT_ID} .eda-pill{display:inline-flex;align-items:center;gap:5px;height:20px;border-radius:999px;border:1px solid var(--eda-border);padding:0 7px;font-size:10.5px;font-weight:650;white-space:nowrap;background:#fff;color:#525252}
        #${ROOT_ID} .eda-pill::before{content:'';width:6px;height:6px;border-radius:50%;background:#a3a3a3}
        #${ROOT_ID} .eda-pill.run::before{background:#171717;box-shadow:0 0 0 3px rgba(23,23,23,.08)}
        #${ROOT_ID} .eda-pill.pause{border-color:#f1c0c0;background:#fff8f8;color:#991b1b}
        #${ROOT_ID} .eda-pill.pause::before{background:#b91c1c}
        #${ROOT_ID} .eda-body{padding:14px}
        #${ROOT_ID} .eda-status-card{display:flex;align-items:flex-start;gap:9px;margin-bottom:12px;padding:10px 11px;border:1px solid var(--eda-border);border-radius:8px;background:var(--eda-muted)}
        #${ROOT_ID} .eda-status-icon{display:flex;align-items:center;justify-content:center;flex:0 0 auto;width:25px;height:25px;border-radius:7px;background:#fff;border:1px solid var(--eda-border);color:#525252}
        #${ROOT_ID} .eda-status{min-height:34px;font-size:12px;line-height:1.45;color:#525252;white-space:pre-line;overflow-wrap:anywhere}
        #${ROOT_ID} .eda-progress-wrap{margin:0 0 12px}
        #${ROOT_ID} .eda-progress-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;font-size:11.5px;color:var(--eda-muted-fg)}
        #${ROOT_ID} .eda-progress-head strong{color:var(--eda-fg);font-weight:650}
        #${ROOT_ID} .eda-progress-track{height:6px;border-radius:999px;background:var(--eda-muted-2);overflow:hidden}
        #${ROOT_ID} .eda-progress-bar{height:100%;border-radius:999px;background:var(--eda-primary);transition:width .25s ease}
        #${ROOT_ID} .eda-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
        #${ROOT_ID} .eda-chip{border:1px solid var(--eda-border);background:#fff;border-radius:8px;padding:9px 10px;min-width:0;transition:border-color .15s ease,background .15s ease}
        #${ROOT_ID} .eda-chip:hover{border-color:#cfcfcf;background:#fcfcfc}
        #${ROOT_ID} .eda-label{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#8a8a8a;margin-bottom:4px;font-weight:650}
        #${ROOT_ID} .eda-value{font-size:12.5px;font-weight:650;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        #${ROOT_ID} .eda-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
        #${ROOT_ID} .eda-actions.three{grid-template-columns:1fr 1fr 1fr}
        #${ROOT_ID} .eda-actions>button{min-width:0;width:100%;overflow:hidden}
        #${ROOT_ID} .eda-actions>button>span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis}
        #${ROOT_ID} button,.eda-modal button,.eda-report button,.eda-button-link{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;border-radius:6px;padding:0 12px;font-family:inherit;font-size:12.5px;font-weight:650;cursor:pointer;transition:background .15s ease,border-color .15s ease,color .15s ease,box-shadow .15s ease;text-decoration:none;white-space:nowrap}
        #${ROOT_ID} button:focus-visible,.eda-modal button:focus-visible,.eda-report button:focus-visible,.eda-button-link:focus-visible{outline:2px solid #525252;outline-offset:2px}
        #${ROOT_ID} button:not(:disabled):active,.eda-modal button:not(:disabled):active,.eda-report button:not(:disabled):active{transform:translateY(1px);box-shadow:none}
        #${ROOT_ID} button:disabled,.eda-modal button:disabled,.eda-report button:disabled{opacity:.5;cursor:not-allowed}
        #${ROOT_ID} button[aria-busy="true"]{opacity:1;cursor:progress}
        #${ROOT_ID} .eda-button-busy-spinner{width:14px;height:14px;flex:0 0 auto;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:eda-button-spin .7s linear infinite}
        @keyframes eda-button-spin{to{transform:rotate(360deg)}}
        @media (prefers-reduced-motion:reduce){#${ROOT_ID} .eda-button-busy-spinner{animation-duration:1.4s}}
        .eda-primary{background:var(--eda-primary,#1f1f1f);border:1px solid var(--eda-primary,#1f1f1f);color:var(--eda-primary-fg,#fafafa);box-shadow:0 1px 2px rgba(0,0,0,.08)}
        .eda-primary:hover{background:#303030;border-color:#303030}
        .eda-secondary{background:#fff;border:1px solid var(--eda-input,#dedede);color:var(--eda-fg,#171717);box-shadow:0 1px 2px rgba(0,0,0,.04)}
        .eda-secondary:hover{background:var(--eda-muted,#f7f7f7);border-color:#cfcfcf}
        .eda-ghost{background:transparent;border:1px solid transparent;color:var(--eda-muted-fg,#737373)}
        .eda-ghost:hover{background:var(--eda-muted,#f7f7f7);color:var(--eda-fg,#171717)}
        .eda-danger{background:#fff;border:1px solid #efcaca;color:#a61b1b}
        .eda-danger:hover{background:#fff5f5;border-color:#e6aaaa}
        .eda-success{background:#fff;border:1px solid #c9dfd1;color:#276749}
        .eda-success:hover{background:#f4faf6;border-color:#a9ccb5}
        .eda-warning{background:#fff;border:1px solid #eed69a;color:#8a5a00}
        .eda-warning:hover{background:#fffaf0;border-color:#dfc26f}
        .eda-svg{width:15px;height:15px;display:block;flex:0 0 auto;stroke:currentColor}
        #${ROOT_ID} .eda-update-card{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0;padding:10px 11px;border:1px solid #ead18d;border-radius:8px;background:#fffaf0}
        #${ROOT_ID} .eda-update-copy{min-width:0}
        #${ROOT_ID} .eda-update-title{display:flex;align-items:center;gap:5px;font-size:12.5px;font-weight:700;color:#6f4700}
        #${ROOT_ID} .eda-update-desc{margin-top:2px;font-size:11px;line-height:1.35;color:#8a650f}
        #${ROOT_ID} .eda-update-card button{min-height:31px;padding:0 10px;flex:0 0 auto}
        #${ROOT_ID} .eda-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding-top:11px;border-top:1px solid var(--eda-border);font-size:11.5px}
        #${ROOT_ID} .eda-footer-link{display:inline-flex;align-items:center;gap:5px;min-width:0;color:#525252;text-decoration:none;font-weight:600}
        #${ROOT_ID} .eda-footer-link:hover{color:#171717;text-decoration:underline;text-underline-offset:3px}
        #${ROOT_ID} .eda-link-button{appearance:none;border:0;background:transparent;padding:0;min-height:0;color:#737373;font-size:11.5px;font-weight:600;box-shadow:none}
        #${ROOT_ID} .eda-link-button:hover{color:#171717;text-decoration:underline;text-underline-offset:3px;background:transparent}
        #${TOAST_ID}{position:fixed;right:18px;bottom:18px;z-index:2147483647;display:flex;flex-direction:column;gap:8px;max-width:390px;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
        .eda-toast{opacity:0;transform:translateY(8px);transition:opacity .2s ease,transform .2s ease;border-radius:8px;padding:11px 13px;color:#fff;box-shadow:0 12px 28px rgba(15,23,42,.2);font-size:12.5px;line-height:1.45;border:1px solid rgba(255,255,255,.13)}
        .eda-toast.show{opacity:1;transform:translateY(0)}.eda-toast.info{background:#262626}.eda-toast.success{background:#276749}.eda-toast.warning{background:#8a5a00}.eda-toast.error{background:#b91c1c}
        .eda-modal-backdrop,.eda-report-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.30);display:flex;align-items:flex-start;justify-content:center;z-index:2147483646;padding:6vh 18px 24px;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#171717;overflow-y:auto}
        .eda-modal,.eda-report{--eda-border:#e7e7e7;--eda-muted:#f7f7f7;--eda-input:#dedede;--eda-fg:#171717;--eda-muted-fg:#737373;--eda-primary:#1f1f1f;--eda-primary-fg:#fafafa;width:min(820px,calc(100vw - 32px));max-height:88vh;overflow:hidden;border-radius:12px;background:#fff;box-shadow:0 25px 50px -12px rgba(0,0,0,.26);border:1px solid var(--eda-border);display:flex;flex-direction:column}
        .eda-modal-head,.eda-report-head{min-height:64px;padding:12px 16px;background:#fff;color:#171717;border-bottom:1px solid var(--eda-border);display:flex;justify-content:space-between;gap:12px;align-items:center;flex:0 0 auto}
        .eda-modal-brand{display:flex;align-items:center;gap:10px;min-width:0}
        .eda-modal-title,.eda-report-title{margin:0;font-size:15px;font-weight:700;letter-spacing:-.015em}
        .eda-modal-subtitle{margin-top:3px;font-size:11.5px;color:#737373;line-height:1.35}
        .eda-icon-button{width:34px;min-width:34px;height:34px;min-height:34px;padding:0!important;border:1px solid transparent!important;border-radius:7px!important;background:transparent!important;color:#737373!important}
        .eda-icon-button:hover{background:#f5f5f5!important;color:#171717!important}
        .eda-modal-body,.eda-report-body{padding:18px;overflow:auto;max-height:calc(88vh - 128px);scrollbar-width:thin;scrollbar-color:#d4d4d4 transparent}
        .eda-modal-footer,.eda-report-footer{padding:12px 16px;border-top:1px solid var(--eda-border);display:flex;gap:8px;justify-content:flex-end;align-items:center;background:#fafafa;flex:0 0 auto}
        .eda-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .eda-field label{display:block;font-size:12px;font-weight:650;margin-bottom:6px;color:#262626}
        .eda-field input,.eda-field select{width:100%;height:38px;border:1px solid var(--eda-input);border-radius:6px;padding:0 10px;font:inherit;font-size:13px;background:#fff;color:#171717;transition:border-color .15s ease,box-shadow .15s ease}
        .eda-field input:focus,.eda-field select:focus{outline:none;border-color:#737373;box-shadow:0 0 0 2px rgba(23,23,23,.08)}
        .eda-field small{display:block;margin-top:5px;font-size:11px;color:#737373;line-height:1.4}
        .eda-note{border-radius:8px;background:#f7f7f7;border:1px solid #e7e7e7;padding:11px 12px;font-size:12px;color:#525252;line-height:1.5;margin-bottom:14px}
        .eda-section-title{margin:2px 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#8a8a8a;font-weight:700}
        .eda-about-card{margin-top:16px;border:1px solid #e7e7e7;border-radius:9px;background:#fff;padding:13px}
        .eda-about-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}
        .eda-about-item{padding:9px;border-radius:7px;background:#f7f7f7;min-width:0}
        .eda-about-item span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#8a8a8a;margin-bottom:4px;font-weight:650}
        .eda-about-item strong{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .eda-about-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
        .eda-inline-link{color:#262626;font-weight:650;text-decoration:underline;text-underline-offset:3px}
        .eda-inline-link:hover{color:#000}
        .eda-table-wrap{overflow:auto;border:1px solid #e7e7e7;border-radius:8px}
        .eda-table{width:100%;border-collapse:collapse;font-size:12px;background:#fff}
        .eda-table th,.eda-table td{border-bottom:1px solid #ededed;padding:9px 8px;text-align:left;vertical-align:top}
        .eda-table th{font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:#737373;background:#fafafa;position:sticky;top:0;z-index:1}
        .eda-table tr:last-child td{border-bottom:0}
        .eda-table a{color:#262626;font-weight:600;text-underline-offset:2px}
        .eda-status-success{color:#276749;font-weight:700}.eda-status-error{color:#b91c1c;font-weight:700}.eda-status-stopped{color:#8a5a00;font-weight:700}
        @media(max-width:760px){
            #${ROOT_ID}{width:calc(100vw - 24px);right:12px;left:12px;top:auto;bottom:12px}
            #${ROOT_ID}.eda-collapsed{width:44px;right:0;left:auto;top:auto;bottom:88px}
            #${ROOT_ID} .eda-grid,#${ROOT_ID} .eda-actions,#${ROOT_ID} .eda-actions.three,.eda-form-grid,.eda-about-grid{grid-template-columns:1fr}
            #${ROOT_ID} .eda-head{align-items:flex-start}
            #${ROOT_ID} .eda-head-meta{gap:4px}
            .eda-modal-backdrop,.eda-report-backdrop{padding:10px;align-items:flex-start}
            .eda-modal,.eda-report{width:100%;max-height:calc(100dvh - 20px)}
            .eda-modal-body,.eda-report-body{max-height:calc(100dvh - 148px);padding:14px}
            .eda-modal-footer,.eda-report-footer{flex-wrap:wrap}
            .eda-modal-footer button,.eda-report-footer button{flex:1}
            .eda-table td,.eda-table th{white-space:normal}
        }
    `);

    function isSupportedRoute() {
        return /^\/your\/shops\/me\/sales-discounts(?:\/|$)/.test(location.pathname);
    }

    function readPanelCollapsed() {
        try { return sessionStorage.getItem(PANEL_COLLAPSE_SESSION_KEY) === '1'; }
        catch { return false; }
    }

    function writePanelCollapsed(value) {
        panelCollapsed = !!value;
        try { sessionStorage.setItem(PANEL_COLLAPSE_SESSION_KEY, panelCollapsed ? '1' : '0'); } catch {}
    }

    function removeOwnUi() {
        try { document.getElementById(ROOT_ID)?.remove(); } catch {}
        try { document.getElementById(TOAST_ID)?.remove(); } catch {}
        document.querySelectorAll('.eda-modal-backdrop,.eda-report-backdrop').forEach(node => node.remove());
        panelEl = null;
        statusEl = null;
    }

    async function syncRouteUi(force = false) {
        const supported = isSupportedRoute();
        if (!supported) {
            if (routeActive || force || panelEl?.isConnected) {
                routeActive = false;
                abortAutomation('unsupported-route');
                await releaseLease(job?.jobId || null);
                removeOwnUi();
            }
            return false;
        }

        const entered = !routeActive;
        routeActive = true;
        if (entered && job?.active && !job.paused) resetAutomationController();
        if (!panelEl?.isConnected) mountPanel();
        else renderPanel();
        if (entered && job?.active && !job.paused) setTimeout(processTick, 80);
        return true;
    }

    function installRouteWatcher() {
        const schedule = () => setTimeout(() => { syncRouteUi().catch(error => console.warn('Route UI sync failed', error)); }, 0);
        for (const method of ['pushState', 'replaceState']) {
            const original = history[method];
            if (typeof original !== 'function' || original.__edaWrapped) continue;
            const wrapped = function (...args) {
                const result = original.apply(this, args);
                schedule();
                return result;
            };
            Object.defineProperty(wrapped, '__edaWrapped', { value: true });
            history[method] = wrapped;
        }
        window.addEventListener('popstate', schedule);
        window.addEventListener('hashchange', schedule);
        routeWatchTimerId = setInterval(() => {
            if (location.href === lastObservedUrl) return;
            lastObservedUrl = location.href;
            schedule();
        }, 500);
    }

    function addStyle(css) {
        if (typeof GM?.addStyle === 'function') {
            GM.addStyle(css);
            return;
        }
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    function pad2(value) { return String(value).padStart(2, '0'); }
    function randomId(prefix = '') {
        const rand = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
        return `${prefix}${rand}`;
    }
    function getOrCreateTabId() {
        const key = 'eda-batch-tab-id-v4';
        try {
            let value = sessionStorage.getItem(key);
            if (!value) {
                value = randomId('tab-');
                sessionStorage.setItem(key, value);
            }
            return value;
        } catch {
            return randomId('tab-');
        }
    }

    function normalizePathname(value) {
        const path = String(value || '').trim();
        if (!path) return '';
        try {
            const parsed = new URL(path, location.href);
            return parsed.pathname.replace(/\/+$/, '') || '/';
        } catch {
            return path.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
        }
    }

    function readLeaseHandoff(options = {}) {
        try {
            const raw = sessionStorage.getItem(LEASE_HANDOFF_SESSION_KEY);
            if (!raw) return null;
            const marker = JSON.parse(raw);
            const age = Date.now() - Number(marker?.at || 0);
            if (!marker?.owner || !marker?.tabId || age < 0 || age > LEASE_HANDOFF_MAX_AGE_MS) {
                sessionStorage.removeItem(LEASE_HANDOFF_SESSION_KEY);
                return null;
            }
            if (options.requirePath !== false && marker.expectedPath) {
                const currentPath = normalizePathname(location.pathname);
                const expectedPath = normalizePathname(marker.expectedPath);
                if (currentPath !== expectedPath) return null;
            }
            return marker;
        } catch {
            try { sessionStorage.removeItem(LEASE_HANDOFF_SESSION_KEY); } catch {}
            return null;
        }
    }

    function markLeaseHandoff(expectedJobId = '', expectedPath = '', options = {}) {
        try {
            if (options.preserveExisting) {
                const existing = readLeaseHandoff({ requirePath: false });
                if (existing?.owner === INSTANCE_ID
                    && existing?.tabId === TAB_ID
                    && (!expectedJobId || !existing.jobId || String(existing.jobId) === String(expectedJobId))) {
                    return existing;
                }
            }
            const marker = {
                owner: INSTANCE_ID,
                tabId: TAB_ID,
                jobId: String(expectedJobId || ''),
                expectedPath: normalizePathname(expectedPath),
                at: Date.now(),
                nonce: randomId('handoff-'),
            };
            sessionStorage.setItem(LEASE_HANDOFF_SESSION_KEY, JSON.stringify(marker));
            return marker;
        } catch {
            return null;
        }
    }

    function clearLeaseHandoff() {
        try { sessionStorage.removeItem(LEASE_HANDOFF_SESSION_KEY); } catch {}
    }
    class AutomationCancelledError extends Error {
        constructor(message = 'Otomasyon işlemi iptal edildi.') {
            super(message);
            this.name = 'AutomationCancelledError';
        }
    }
    class FetchTimeoutError extends Error {
        constructor(message = 'Etsy isteği zaman aşımına uğradı.') {
            super(message);
            this.name = 'FetchTimeoutError';
        }
    }
    function rawSleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    function sleep(ms) {
        const signal = automationController?.signal;
        if (!signal) return rawSleep(ms);
        if (signal.aborted) return Promise.reject(new AutomationCancelledError());
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                signal.removeEventListener('abort', onAbort);
                resolve();
            }, ms);
            const onAbort = () => {
                clearTimeout(timer);
                signal.removeEventListener('abort', onAbort);
                reject(new AutomationCancelledError());
            };
            signal.addEventListener('abort', onAbort, { once: true });
        });
    }
    function abortAutomation(reason = 'cancelled') {
        try { automationController?.abort(reason); } catch {}
    }
    function resetAutomationController() {
        abortAutomation('reset');
        automationController = new AbortController();
    }
    function isoDate(date) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`; }
    function usDate(date) { return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}/${date.getFullYear()}`; }
    function usShortDate(date) { return date?.toLocaleDateString?.('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) || ''; }
    function trWeekday(date) { return date.toLocaleDateString('tr-TR', { weekday: 'long' }); }
    function parseIso(value) {
        const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return null;
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return d && d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null;
    }
    function addDays(date, days) { const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()); d.setDate(d.getDate() + days); return d; }
    function daysInclusive(a, b) {
        const startDay = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
        const endDay = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
        return Math.floor((endDay - startDay) / 86400000) + 1;
    }
    function intVal(value, fallback) { const n = Number.parseInt(String(value), 10); return Number.isFinite(n) ? n : fallback; }
    function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
    function cleanCode(value) { return String(value || '').replace(/[^a-z0-9]/gi, '').toUpperCase(); }
    function html(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function text(node) {
        const lightText = String(node?.textContent || '');
        const shadowText = node?.shadowRoot ? String(node.shadowRoot.textContent || '') : '';
        return `${lightText} ${shadowText}`.replace(/\s+/g, ' ').trim();
    }
    function low(value) { return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase(); }
    function uniq(items) { return Array.from(new Set(items.filter(Boolean))); }
    function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
    function escapeRegExp(value) { return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function sameDay(a, b) { return !!(a && b) && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
    function boolish(value) {
        if (value === true || value === 1) return true;
        if (value === false || value === 0) return false;
        const normalized = low(value);
        if (/^(?:true|1|yes|on)$/.test(normalized)) return true;
        if (/^(?:false|0|no|off|null|undefined|)$/.test(normalized)) return false;
        return null;
    }
    function promotionIdFromUrl(value) {
        try {
            const parsed = new URL(String(value || ''), location.origin);
            return parsed.pathname.match(/\/sales-discounts\/(?:details-stats\/)?promotion\/(\d+)(?:\/|$)/)?.[1] || '';
        } catch {
            return String(value || '').match(/\/sales-discounts\/(?:details-stats\/)?promotion\/(\d+)(?:[/?#]|$)/)?.[1] || '';
        }
    }
    function ownBlockingUiOpen() {
        return !!document.querySelector('.eda-report-backdrop, .eda-modal-backdrop');
    }
    function tabIsHidden() {
        return document.hidden === true || document.visibilityState === 'hidden';
    }
    function assertForegroundTab() {
        if (tabIsHidden()) throw new AutomationCancelledError('Sekme arka plana alındı; bu turda hiçbir Etsy işlemi yapılmadı.');
    }

    function saleStorageStateError() {
        const error = new Error('Local sale state storage failed.');
        error.telemetryCode = 'storage_sale_state';
        return error;
    }

    async function gmGet(key, fallback = null) {
        try { return await GM.getValue(key, fallback); }
        catch { void trackTelemetryError('storage_sale_state'); throw saleStorageStateError(); }
    }
    async function gmSet(key, value) {
        try { await GM.setValue(key, value); }
        catch { void trackTelemetryError('storage_sale_state'); throw saleStorageStateError(); }
    }
    async function gmDelete(key) {
        try { await GM.deleteValue(key); }
        catch {
            try { await GM.setValue(key, null); }
            catch { void trackTelemetryError('storage_sale_state'); throw saleStorageStateError(); }
        }
    }


    function normalizeUpdateState(value) {
        const source = value && typeof value === 'object' ? value : {};
        return {
            status: ['idle', 'checking', 'current', 'available', 'external', 'unavailable', 'error'].includes(source.status) ? source.status : 'idle',
            latestVersion: String(source.latestVersion || ''),
            checkedAt: Number(source.checkedAt || 0),
            error: String(source.error || ''),
            notifiedVersion: String(source.notifiedVersion || ''),
        };
    }

    function versionCore(value) {
        return String(value || '')
            .trim()
            .replace(/^v/i, '')
            .split(/[+-]/, 1)[0]
            .split('.')
            .map(part => Number.parseInt(part.replace(/\D/g, '') || '0', 10));
    }

    function compareVersions(left, right) {
        const a = versionCore(left);
        const b = versionCore(right);
        const length = Math.max(a.length, b.length, 3);
        for (let index = 0; index < length; index += 1) {
            const av = Number(a[index] || 0);
            const bv = Number(b[index] || 0);
            if (av > bv) return 1;
            if (av < bv) return -1;
        }
        return 0;
    }

    function userscriptVersionFromSource(source) {
        return String(source || '').match(/^\s*\/\/\s*@version\s+([^\s]+)\s*$/mi)?.[1] || '';
    }

    function installationSourceUrls() {
        try {
            const info = (typeof GM !== 'undefined' && GM?.info)
                || (typeof GM_info !== 'undefined' ? GM_info : null);
            return [info?.script?.downloadURL, info?.script?.updateURL]
                .map(value => String(value || '').trim())
                .filter(Boolean);
        } catch {
            return [];
        }
    }

    function installationSourceUrl() {
        return installationSourceUrls()[0] || '';
    }

    function usesGitHubUpdateChannel() {
        const sources = installationSourceUrls();
        if (!sources.length) return false;
        try {
            const canonical = new URL(GITHUB_RAW_SCRIPT_URL);
            return sources.every(source => {
                const candidate = new URL(source);
                return candidate.protocol === 'https:'
                    && candidate.origin === canonical.origin
                    && candidate.pathname === canonical.pathname
                    && !candidate.username
                    && !candidate.password
                    && !candidate.search
                    && !candidate.hash;
            });
        } catch {
            return false;
        }
    }

    function requestText(url, timeoutMs = UPDATE_CHECK_TIMEOUT_MS) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (kind, value) => {
                if (settled) return;
                settled = true;
                kind === 'resolve' ? resolve(value) : reject(value instanceof Error ? value : new Error(String(value || 'Request failed')));
            };
            const onResponse = response => {
                const status = Number(response?.status || 0);
                if (status >= 200 && status < 300) {
                    finish('resolve', String(response?.responseText || ''));
                    return;
                }
                const error = new Error(status === 404 ? 'GitHub güncelleme dosyası henüz yayınlanmamış.' : `GitHub yanıtı HTTP ${status || 'bilinmiyor'}.`);
                error.status = status;
                finish('reject', error);
            };

            if (typeof GM?.xmlHttpRequest === 'function') {
                try {
                    const maybePromise = GM.xmlHttpRequest({
                        method: 'GET',
                        url,
                        timeout: timeoutMs,
                        headers: { Accept: 'text/plain', 'Cache-Control': 'no-cache' },
                        onload: onResponse,
                        onerror: () => finish('reject', new Error('GitHub bağlantısı kurulamadı.')),
                        ontimeout: () => finish('reject', new Error('GitHub güncelleme kontrolü zaman aşımına uğradı.')),
                    });
                    if (maybePromise && typeof maybePromise.then === 'function') {
                        maybePromise.then(onResponse).catch(error => finish('reject', error));
                    }
                    return;
                } catch (error) {
                    finish('reject', error);
                    return;
                }
            }

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            fetch(url, { cache: 'no-store', credentials: 'omit', signal: controller.signal })
                .then(async response => {
                    clearTimeout(timer);
                    if (!response.ok) {
                        const error = new Error(response.status === 404 ? 'GitHub güncelleme dosyası henüz yayınlanmamış.' : `GitHub yanıtı HTTP ${response.status}.`);
                        error.status = response.status;
                        throw error;
                    }
                    return await response.text();
                })
                .then(value => finish('resolve', value))
                .catch(error => {
                    clearTimeout(timer);
                    finish('reject', error?.name === 'AbortError' ? new Error('GitHub güncelleme kontrolü zaman aşımına uğradı.') : error);
                });
        });
    }

    async function loadUpdateState() {
        updateState = normalizeUpdateState(await gmGet(UPDATE_STATE_KEY, null));
        if (updateState.status === 'checking') updateState.status = 'idle';
        return updateState;
    }

    async function saveUpdateState(next) {
        updateState = normalizeUpdateState(next);
        await gmSet(UPDATE_STATE_KEY, updateState);
        renderPanel();
        return updateState;
    }

    async function checkForUpdates(options = {}) {
        const manual = options.manual === true;
        const force = options.force === true || manual;
        if (!usesGitHubUpdateChannel()) {
            await saveUpdateState({
                ...updateState,
                status: 'external',
                latestVersion: '',
                checkedAt: Date.now(),
                error: '',
            });
            if (manual) toast('Güncellemeler kurulum yaptığın dağıtım platformu tarafından yönetiliyor.', 'info', 5200);
            return updateState;
        }
        if (updateState.status === 'checking') {
            if (manual) toast('Güncelleme kontrolü zaten çalışıyor.', 'info');
            return updateState;
        }
        const age = Date.now() - Number(updateState.checkedAt || 0);
        if (!force && updateState.checkedAt && age >= 0 && age < UPDATE_CHECK_INTERVAL_MS) {
            renderPanel();
            return updateState;
        }

        updateState = { ...updateState, status: 'checking', error: '' };
        renderPanel();
        try {
            const separator = GITHUB_RAW_SCRIPT_URL.includes('?') ? '&' : '?';
            const source = await requestText(`${GITHUB_RAW_SCRIPT_URL}${separator}eda_check=${Date.now()}`);
            const latestVersion = userscriptVersionFromSource(source);
            if (!latestVersion) throw new Error('GitHub dosyasında @version bilgisi bulunamadı.');
            const available = compareVersions(latestVersion, VERSION) > 0;
            const next = {
                ...updateState,
                status: available ? 'available' : 'current',
                latestVersion,
                checkedAt: Date.now(),
                error: '',
            };
            const shouldNotify = available && updateState.notifiedVersion !== latestVersion;
            if (shouldNotify) next.notifiedVersion = latestVersion;
            await saveUpdateState(next);
            if (available) {
                toast(`Yeni Makaytron sürümü hazır: v${latestVersion}. Paneldeki Güncelle düğmesini kullan.`, 'warning', 6500);
            } else if (manual) {
                toast(`v${VERSION} güncel.`, 'success', 3200);
            }
            return updateState;
        } catch (error) {
            const unavailable = Number(error?.status || 0) === 404 || /henüz yayınlanmamış/i.test(String(error?.message || ''));
            await saveUpdateState({
                ...updateState,
                status: unavailable ? 'unavailable' : 'error',
                latestVersion: '',
                checkedAt: Date.now(),
                error: String(error?.message || error || 'Güncelleme kontrolü başarısız.'),
            });
            if (manual) {
                toast(unavailable
                    ? `GitHub dosyası henüz yok. ${GITHUB_USERNAME}/${GITHUB_REPOSITORY} deposunun köküne ${GITHUB_SCRIPT_PATH} yüklendiğinde kontrol çalışacak.`
                    : `Güncelleme kontrolü başarısız: ${error?.message || error}`, 'warning', 6500);
            }
            return updateState;
        }
    }

    function openExternal(url) {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        document.documentElement.appendChild(anchor);
        anchor.click();
        anchor.remove();
    }

    function openGitHubRepository() {
        openExternal(GITHUB_REPOSITORY_URL);
    }

    function installAvailableUpdate() {
        if (!usesGitHubUpdateChannel()) {
            toast('Bu kurulumun güncellemeleri dağıtım platformu tarafından yönetiliyor.', 'info', 5200);
            return;
        }
        if (job?.active) {
            toast('Güncellemeden önce aktif seriyi durdur. Böylece yarım kalan işlem oluşmaz.', 'warning', 5200);
            return;
        }
        openExternal(GITHUB_RAW_SCRIPT_URL);
        toast('Tampermonkey güncelleme onayı açıldı. Açılan ekranda Güncelle/Yükle düğmesini onayla.', 'info', 5600);
    }

    function decodeJsonString(value) {
        try { return JSON.parse(`"${String(value || '').replace(/"/g, '\\"')}"`); }
        catch { return String(value || '').replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16))).replace(/\\"/g, '"').replace(/\\\//g, '/'); }
    }
    function extractShopIdentityFromSource(source, options = {}) {
        const raw = String(source || '');
        if (!raw) return null;
        const markers = ['"current_shop"', '"shop_data"', '&quot;current_shop&quot;', '&quot;shop_data&quot;'];
        for (const marker of markers) {
            let searchFrom = 0;
            while (searchFrom < raw.length) {
                const index = raw.indexOf(marker, searchFrom);
                if (index < 0) break;
                const contextWindow = raw.slice(Math.max(0, index - 1600), index + 4200).replace(/&quot;/g, '"');
                const markerOffset = contextWindow.indexOf(marker.replace(/&quot;/g, '"'));
                const shopChunk = contextWindow.slice(Math.max(0, markerOffset), Math.max(0, markerOffset) + 2600);
                const idMatch = shopChunk.match(/"shop_id"\s*:\s*"?(\d+)"?/i);
                const nameMatch = shopChunk.match(/"shop_name"\s*:\s*"((?:\\.|[^"\\])*)"/i);
                const currentUserMatch = contextWindow.match(/"current_user"\s*:\s*\{[\s\S]{0,900}?"user_id"\s*:\s*"?(\d+)"?/i);
                const shopUserMatch = shopChunk.match(/"(?:user_id|owner_user_id|owner_id)"\s*:\s*"?(\d+)"?/i);
                if (idMatch) {
                    return {
                        shopId: String(idMatch[1]),
                        shopName: decodeJsonString(nameMatch?.[1] || ''),
                        userId: String(currentUserMatch?.[1] || shopUserMatch?.[1] || ''),
                    };
                }
                searchFrom = index + marker.length;
            }
        }
        if (options.allowDocumentFallback !== false) {
            const dataNode = document.querySelector?.('[data-shop-id]');
            const dataId = dataNode?.getAttribute?.('data-shop-id');
            if (dataId && /^\d+$/.test(dataId)) {
                return { shopId: dataId, shopName: dataNode.getAttribute('data-shop-name') || '', userId: dataNode.getAttribute('data-user-id') || '' };
            }
        }
        return null;
    }
    function detectShopIdentity(force = false) {
        const now = Date.now();
        if (!force && lastShopIdentity && now - lastShopIdentityAt < 1600) return lastShopIdentity;
        let identity = null;
        for (const script of Array.from(document.scripts || [])) {
            identity = extractShopIdentityFromSource(script.textContent || '');
            if (identity) break;
        }
        if (!identity) identity = extractShopIdentityFromSource(document.documentElement?.innerHTML || '');
        lastShopIdentity = identity;
        lastShopIdentityAt = now;
        return identity;
    }
    function shopLabel(identity) {
        if (!identity) return 'Bilinmiyor';
        return identity.shopName ? `${identity.shopName} (#${identity.shopId})` : `#${identity.shopId}`;
    }
    function sameShop(expected, actual) {
        if (!expected?.shopId || !actual?.shopId) return false;
        if (String(expected.shopId) !== String(actual.shopId)) return false;
        if (expected.userId && actual.userId && String(expected.userId) !== String(actual.userId)) return false;
        return true;
    }


    function evidenceElementHidden(element) {
        if (!element || element.nodeType !== 1) return false;
        if (element.matches?.('script, style, noscript, template, [hidden], [aria-hidden="true"], [inert], input[type="hidden"]')) return true;
        const inlineStyle = low(element.getAttribute?.('style') || '');
        if (/(?:^|;)\s*display\s*:\s*none\b|(?:^|;)\s*visibility\s*:\s*hidden\b|(?:^|;)\s*opacity\s*:\s*0(?:\D|$)/.test(inlineStyle)) return true;
        const className = low(typeof element.className === 'string' ? element.className : element.getAttribute?.('class') || '');
        if (/(?:^|\s)(?:wt-display-none|wt-hidden|is-hidden|display-none|d-none|hidden|visually-hidden|sr-only|wt-screen-reader-only)(?:\s|$)/.test(className)) return true;
        if (/\b(?:display|visibility)[-_]?(?:none|hidden)\b/.test(className)) return true;
        return false;
    }
    function evidenceNodeVisible(node) {
        let element = node?.nodeType === 1 ? node : node?.parentElement;
        if (!element) return false;
        let current = element;
        while (current && current.nodeType === 1) {
            if (evidenceElementHidden(current)) return false;
            current = current.parentElement;
        }
        if (element.ownerDocument === document && element.isConnected) {
            try {
                current = element;
                while (current && current.nodeType === 1 && current !== document.documentElement) {
                    const style = getComputedStyle(current);
                    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
                    current = current.parentElement;
                }
            } catch {}
        }
        return true;
    }

    function semanticVisibleText(root, options = {}) {
        const container = root?.nodeType === 9
            ? (root.querySelector?.('main#main-content, main, [role="main"]') || root.body || root.documentElement)
            : root;
        if (!container) return '';
        const doc = container.ownerDocument || (root?.nodeType === 9 ? root : document);
        const segments = [];
        try {
            const walker = doc.createTreeWalker(container, 4);
            let node = walker.nextNode();
            while (node) {
                const value = String(node.nodeValue || '').replace(/\s+/g, ' ').trim();
                if (value && evidenceNodeVisible(node)) segments.push(value);
                node = walker.nextNode();
            }
        } catch {
            const fallback = String(container.textContent || '').replace(/\s+/g, ' ').trim();
            if (fallback) segments.push(fallback);
        }
        if (options.includeValues) {
            Array.from(container.querySelectorAll?.('input:not([type="hidden"]), textarea, select') || []).forEach(field => {
                if (!evidenceNodeVisible(field)) return;
                const value = String(field.value ?? field.getAttribute?.('value') ?? '').replace(/\s+/g, ' ').trim();
                if (value) segments.push(value);
            });
        }
        return segments.join(' ').replace(/\s+/g, ' ').trim();
    }

    function hasAllListingsNegation(value) {
        const source = low(value);
        return /\bnot\s+all\s+(?:active\s+|eligible\s+)?listings?\b|\ball\s+(?:active\s+|eligible\s+)?listings?\s+(?:are\s+)?not\s+(?:selected|included|covered)\b|\b(?:does\s+not|doesn['’]t|do\s+not|don['’]t)\s+(?:apply|include|cover)\s+(?:to\s+)?all\s+(?:active\s+|eligible\s+)?listings?\b|\bwithout\s+all\s+(?:active\s+|eligible\s+)?listings?\b|\bexcept\s+(?:for\s+)?(?:some|specific|selected|individual|unavailable|ineligible|\d+)\s+listings?\b|\bonly\s+(?:some|specific|selected|individual|\d+)\s+listings?\b|\bnot\s+every\s+listing\b|\ball\s+(?:active\s+|eligible\s+)?listings?\s+(?:are\s+)?(?:selected|included|covered)?\s*[,;:]?\s*(?:except|excluding)\b|\ball\s+(?:active\s+|eligible\s+)?listings?\b[^.!?]{0,100}\b(?:except|excluding)\s+(?:\d+\s+)?(?:unavailable|ineligible|specific|selected|individual)?\s*listings?\b/.test(source);
    }
    async function withStateLock(fn) {
        if (navigator.locks?.request) {
            return await navigator.locks.request(STATE_LOCK_NAME, { mode: 'exclusive' }, fn);
        }
        const token = randomId('mutex-');
        const deadline = Date.now() + 2200;
        while (Date.now() < deadline) {
            const current = await gmGet(MUTEX_KEY, null);
            if (!current || Number(current.expiresAt || 0) < Date.now()) {
                const candidate = { owner: INSTANCE_ID, token, expiresAt: Date.now() + 2600 };
                await gmSet(MUTEX_KEY, candidate);
                await rawSleep(35 + Math.floor(Math.random() * 65));
                const check = await gmGet(MUTEX_KEY, null);
                if (check?.owner === INSTANCE_ID && check?.token === token) {
                    try { return await fn(); }
                    finally {
                        const latest = await gmGet(MUTEX_KEY, null);
                        if (latest?.owner === INSTANCE_ID && latest?.token === token) await gmDelete(MUTEX_KEY);
                    }
                }
            }
            await rawSleep(70 + Math.floor(Math.random() * 90));
        }
        throw new Error('Sekmeler arası state kilidi alınamadı. İşlem güvenlik için durduruldu.');
    }

    async function acquireLease(activeJob = job, options = {}) {
        if (!activeJob?.active || (activeJob.paused && options.allowPaused !== true)) return false;
        const acknowledgementTabId = String(activeJob.completionAck?.originTabId || '');
        if (acknowledgementTabId && acknowledgementTabId !== TAB_ID) {
            leaseOwned = false;
            ownedLeaseNonce = '';
            return false;
        }
        const now = Date.now();
        const current = await gmGet(LEASE_KEY, null);
        if (current?.owner === INSTANCE_ID && current?.jobId === activeJob.jobId) {
            ownedLeaseNonce = String(current.nonce || ownedLeaseNonce || '');
            if (Number(current.expiresAt || 0) - now > LEASE_RENEW_MS) {
                leaseOwned = true;
                clearLeaseHandoff();
                return true;
            }
            const renewed = { ...current, heartbeatAt: now, expiresAt: now + LEASE_MS, shopId: activeJob.shop?.shopId || '', tabId: TAB_ID };
            await gmSet(LEASE_KEY, renewed);
            leaseOwned = true;
            ownedLeaseNonce = String(renewed.nonce || '');
            lastLeaseRenewAt = now;
            clearLeaseHandoff();
            return true;
        }

        const handoff = readLeaseHandoff();
        const handoffMatches = !!(current
            && current.owner !== INSTANCE_ID
            && current.tabId === TAB_ID
            && String(current.jobId || '') === String(activeJob.jobId || '')
            && handoff?.owner === current.owner
            && handoff?.tabId === TAB_ID
            && (!handoff.jobId || String(handoff.jobId) === String(activeJob.jobId || '')));

        if (current && Number(current.expiresAt || 0) > now && current.owner !== INSTANCE_ID && !handoffMatches) {
            leaseOwned = false;
            ownedLeaseNonce = '';
            return false;
        }

        const nonce = randomId('lease-');
        const candidate = {
            owner: INSTANCE_ID,
            tabId: TAB_ID,
            nonce,
            jobId: activeJob.jobId,
            shopId: activeJob.shop?.shopId || '',
            heartbeatAt: now,
            expiresAt: now + LEASE_MS,
            inheritedFrom: handoffMatches ? current.owner : '',
        };
        await gmSet(LEASE_KEY, candidate);
        await rawSleep(65 + Math.floor(Math.random() * 95));
        const check = await gmGet(LEASE_KEY, null);
        leaseOwned = !!(check?.owner === INSTANCE_ID && check?.nonce === nonce && check?.jobId === activeJob.jobId);
        ownedLeaseNonce = leaseOwned ? nonce : '';
        if (leaseOwned) {
            lastLeaseRenewAt = now;
            clearLeaseHandoff();
        }
        return leaseOwned;
    }
    async function verifyLease(activeJob = job) {
        const lease = await gmGet(LEASE_KEY, null);
        const ok = !!(activeJob?.active
            && lease?.owner === INSTANCE_ID
            && lease?.jobId === activeJob.jobId
            && (!ownedLeaseNonce || lease?.nonce === ownedLeaseNonce)
            && Number(lease.expiresAt || 0) > Date.now());
        leaseOwned = ok;
        ownedLeaseNonce = ok ? String(lease.nonce || ownedLeaseNonce || '') : '';
        return ok;
    }
    async function releaseLease(expectedJobId = null) {
        try {
            const lease = await gmGet(LEASE_KEY, null);
            if (lease?.owner !== INSTANCE_ID || (ownedLeaseNonce && lease?.nonce !== ownedLeaseNonce)) {
                leaseOwned = false;
                ownedLeaseNonce = '';
                return false;
            }
            if (expectedJobId && lease.jobId && String(lease.jobId) !== String(expectedJobId)) {
                leaseOwned = false;
                ownedLeaseNonce = '';
                return false;
            }
            await gmDelete(LEASE_KEY);
            leaseOwned = false;
            ownedLeaseNonce = '';
            return true;
        } catch (error) {
            console.warn('Lease release failed', error);
            leaseOwned = false;
            ownedLeaseNonce = '';
            return false;
        }
    }
    function isOwnUi(el) { return !!el?.closest?.(`#${ROOT_ID}, #${TOAST_ID}, .eda-modal-backdrop, .eda-report-backdrop`); }
    function isBadEtsyShell(el) {
        const t = low(el?.getAttribute?.('aria-label') || '') + ' ' + low(text(el));
        if (/update your settings|locale preferences|privacy settings|required cookies|personalized advertising/.test(t)) return true;
        if (el?.id === 'wt-modal-container' && !hasSaleFlowSignal(t)) return true;
        return false;
    }

    function saleFlowText(value) {
        return low(typeof value === 'string' ? value : (semanticVisibleText(value) || text(value)));
    }

    function hasDestructiveOrUnrelatedActionText(value) {
        const source = saleFlowText(value);
        return /\bare\s+you\s+sure\s+you\s+want\s+to\s+(?:delete|remove|discard|deactivate|disconnect|unlink|refund|archive)\b|\b(?:delete|remove|discard|deactivate|disconnect|unlink|refund|archive)\s+(?:this\s+|the\s+)?(?:item|listing|order|account|shop|connection|changes?)\s*(?:permanently|now)?\b|\b(?:permanently\s+delete|confirm\s+(?:deletion|removal|refund)|move\s+to\s+trash|close\s+shop|cancel\s+(?:order|account|listing))\b/.test(source);
    }

    function hasCreateSaleFormSignal(value) {
        const source = saleFlowText(value);
        const heading = /\b(?:set up a sale|run a sale)\b/.test(source);
        const discount = /\b(?:what discount|discount amount|amount off|percentage off)\b/.test(source);
        const duration = /\bsale duration\b/.test(source)
            || (/\bstart date\b/.test(source) && /\bend date\b/.test(source));
        const name = /\b(?:sale name|name your (?:sale|coupon)|promo(?:tion)? name)\b/.test(source);
        return heading && discount && duration && name;
    }

    function hasSaleFlowSignal(value) {
        const source = saleFlowText(value);
        const formStage = hasCreateSaleFormSignal(source);
        const listingStage = /\bwhich listings are included\b/.test(source)
            && /\b(?:review|all listings|entire shop|specific listings)\b/.test(source);
        const reviewStage = /\breview your sale details\b/.test(source)
            && /\b(?:confirm(?: and create)? sale|create sale|run sale|publish sale|sale details)\b/.test(source);
        const completionStage = /\b(?:your sale is (?:scheduled|live)|sale is (?:scheduled|live)|successfully scheduled|successfully created)\b/.test(source);
        return formStage || listingStage || reviewStage || completionStage;
    }

    function isTransientDateOverlay(element) {
        if (!element) return false;
        const structureSignal = !!element.querySelector?.('[role="grid"], [role="gridcell"], table, [data-datepicker], [class*="datepicker" i], [class*="calendar" i]');
        if (!structureSignal) return false;
        const source = saleFlowText(element);
        const calendarSignal = /\b(?:calendar|date picker|choose a date|select a date|previous month|next month|today)\b/.test(source)
            || /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+20\d{2}\b/.test(source);
        if (!calendarSignal) return false;
        if (hasDestructiveOrUnrelatedActionText(element) || /\b(?:deactivate|delete|remove|archive|listing|order|account|shop)\b/.test(source)) return false;
        if (/\b(?:confirm sale|review your sale details|which listings are included)\b/.test(source)) return false;
        const active = document.activeElement;
        if (!(active instanceof HTMLInputElement)) return false;
        const fieldSource = low(`${active.id || ''} ${active.name || ''} ${active.placeholder || ''} ${active.getAttribute('aria-label') || ''} ${fieldLabelText(active, document)}`);
        const saleDateField = /\b(?:start|end|begin|finish)\b/.test(fieldSource) && /\bdate\b/.test(fieldSource)
            && !!active.closest?.('form, [role="dialog"], .wt-overlay__modal, .wt-overlay, .wt-modal, main');
        if (!saleDateField) return false;
        const relationIds = [active.getAttribute('aria-controls'), active.getAttribute('aria-owns'), active.getAttribute('data-datepicker-id')]
            .filter(Boolean).flatMap(value => String(value).split(/\s+/));
        const explicitlyLinked = !!(element.id && relationIds.includes(element.id));
        return explicitlyLinked || isCreateSalePath();
    }
    function popoverIsOpen(element) {
        try { return element.matches?.(':popover-open') || false; }
        catch { return element.hasAttribute?.('data-open') || element.getAttribute?.('aria-hidden') === 'false'; }
    }

    function visibleEtsyOverlayRoots() {
        const selectors = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open], .wt-overlay__modal, .wt-modal, .wt-overlay';
        const all = queryAllDeep(document, selectors);
        queryAllDeep(document, '[popover]').forEach(element => { if (popoverIsOpen(element)) all.push(element); });
        const unique = Array.from(new Set(all))
            .filter(element => !isOwnUi(element) && visible(element) && !isTransientDateOverlay(element));
        return unique.filter(element => !unique.some(other => other !== element && element.contains(other)));
    }
    function overlaySummary(element) {
        const value = saleFlowText(element).slice(0, 220);
        return value || element?.getAttribute?.('aria-label') || element?.id || element?.className || 'etiketsiz Etsy penceresi';
    }

    function overlayRootsRelated(left, right) {
        return !!(left && right && (left === right || left.contains?.(right) || right.contains?.(left)));
    }

    function normalizedTransientSaleLoadingText(value) {
        return low(value).replace(/[\s.!,:;…]+$/g, '').trim();
    }

    function isExactTransientSaleLoadingOverlay(element, refs = null) {
        if (!element || !job?.active || !isCreateSalePath()) return false;
        if (!TRANSIENT_SALE_LOADING_PHASES.has(String(job.phase || ''))) return false;
        const trustedHydration = refs?.hydrating === true;
        const trustedReadyForm = refs?.ready === true && refs?.structuredForm === true;
        const trustedStructuredStep = refs?.structuredStep === true
            && refs?.ambiguous !== true
            && ['listings', 'review', 'complete'].includes(String(refs?.stage || ''));
        if (!trustedHydration && !trustedReadyForm && !trustedStructuredStep) return false;

        const shell = currentSaleOverlayShell();
        const owners = [shell, refs?.root].filter(Boolean);
        const modalContainer = document.getElementById('wt-modal-container');
        const directlyRelated = owners.some(owner => overlayRootsRelated(element, owner));
        const sameModalContainer = !!(modalContainer?.contains?.(element)
            && owners.some(owner => modalContainer.contains(owner)));
        if (!directlyRelated && !sameModalContainer) return false;

        const source = saleFlowText(element);
        const ariaLabels = [
            element.getAttribute?.('aria-label') || '',
            ...queryAllDeep(element, '[aria-label], [role="progressbar"]').map(node => node.getAttribute?.('aria-label') || ''),
        ].filter(Boolean);
        const allowed = new Set(['loading', 'please wait', 'saving', 'submitting', 'processing']);
        const candidates = [source, ...ariaLabels]
            .map(normalizedTransientSaleLoadingText)
            .filter(Boolean);
        if (!candidates.some(value => allowed.has(value))) return false;

        const safetyText = `${source} ${ariaLabels.join(' ')}`;
        if (hasDestructiveOrUnrelatedActionText(safetyText)) return false;
        const visibleControls = queryAllDeep(element, 'button, [role="button"], a[href], input, select, textarea')
            .some(evidenceNodeVisible);
        if (visibleControls) return false;

        // Do not turn a real modal whose body happens to contain "Loading" into a wait.
        // Every visible text fragment must be one of Etsy's exact transient-only states.
        return !source || allowed.has(normalizedTransientSaleLoadingText(source));
    }

    function transientSaleLoadingWaitKey() {
        return [job?.jobId || '', job?.currentDate || '', job?.phase || '', normalizePathname(location.pathname)].join('|');
    }

    function evaluateTransientSaleLoadingWait(overlay, now = Date.now()) {
        if (!overlay || overlay.kind !== 'transient_sale_loading') {
            transientSaleLoadingWait = null;
            return { state: 'clear', elapsedMs: 0, remainingMs: TRANSIENT_SALE_LOADING_TIMEOUT_MS };
        }
        const instant = Number.isFinite(Number(now)) ? Number(now) : Date.now();
        const key = transientSaleLoadingWaitKey();
        if (!transientSaleLoadingWait || transientSaleLoadingWait.key !== key) {
            transientSaleLoadingWait = { key, startedAt: instant };
        }
        const elapsedMs = Math.max(0, instant - transientSaleLoadingWait.startedAt);
        const remainingMs = Math.max(0, TRANSIENT_SALE_LOADING_TIMEOUT_MS - elapsedMs);
        return {
            state: elapsedMs >= TRANSIENT_SALE_LOADING_TIMEOUT_MS ? 'timeout' : 'waiting',
            elapsedMs,
            remainingMs,
        };
    }

    function detectBlockingForeignOverlay(allowedRoot = null, refs = null, suppliedRoots = null) {
        const roots = suppliedRoots || visibleEtsyOverlayRoots();
        let transient = null;
        for (const root of roots) {
            const relatedToAllowed = !!(allowedRoot && overlayRootsRelated(root, allowedRoot));
            const trustedStructuredForm = !!getStructuredCreateSaleRefs(root, { includeErrors: false });
            const trustedSaleFlow = trustedStructuredForm || structuredSaleSuccessRoot(root)
                || (hasSaleFlowSignal(root) && !hasDestructiveOrUnrelatedActionText(root));
            if (trustedSaleFlow && (!allowedRoot || relatedToAllowed)) continue;
            if (isExactTransientSaleLoadingOverlay(root, refs)) {
                transient ||= { kind: 'transient_sale_loading', element: root, summary: overlaySummary(root) };
                continue;
            }
            // A hard foreign modal always wins, even when a transient loading shell is
            // visible at the same time. This preserves the original fail-closed gate.
            return { kind: 'foreign', element: root, summary: overlaySummary(root) };
        }
        return transient;
    }

    function assertNoBlockingForeignOverlay(allowedRoot = null) {
        const blocking = detectBlockingForeignOverlay(allowedRoot, getCreateSaleRefs());
        if (blocking?.kind === 'transient_sale_loading') {
            throw new AutomationCancelledError('Etsy geçici yükleme penceresi açık; bu turda hiçbir alan değiştirilmedi ve hiçbir düğmeye tıklanmadı.');
        }
        if (blocking?.kind === 'foreign') {
            throw new SafetyStopError(`Etsy üzerinde satış akışına ait olmayan açık bir pencere algılandı. Arka plandaki alanlara veya düğmelere basılmadı. Önce bu pencereyi kapat: ${blocking.summary}`);
        }
        return true;
    }

    function saleActionContextMatches(button, kind = '') {
        if (!button || isOwnUi(button)) return false;
        if (kind === 'continue') {
            const structuredRoot = nearestStructuredSaleSurface(button);
            const structuredForm = structuredRoot
                ? getStructuredCreateSaleRefs(structuredRoot, { includeErrors: false })
                : null;
            if (structuredForm) return structuredCreateSaleActionMatches(button, structuredForm);
        }
        if (['review', 'final', 'done'].includes(kind)) {
            const structuredStep = getStructuredSaleStepRefs(null, { includeErrors: false });
            if (structuredStep?.ambiguous) return false;
            if (structuredStep) return structuredSaleStepActionMatches(button, kind, structuredStep);
            if (structuredSaleStepRootMatches(nearestStructuredSaleSurface(button), kind)) return false;
        }
        const context = nearestActionContext(button);
        const source = saleFlowText(context);
        if (!source || hasDestructiveOrUnrelatedActionText(source)) return false;
        if (!hasSaleFlowSignal(source)) return false;
        if (kind === 'continue') {
            return hasCreateSaleFormSignal(source);
        }
        if (kind === 'review') {
            return /which listings are included|all listings|entire shop|all eligible listings/.test(source)
                && /review/.test(source);
        }
        if (kind === 'final') {
            return (/review your sale details|sale details/.test(source) || (/review\s*(?:and|&)\s*confirm/.test(source) && /sale|discount|promotion/.test(source)))
                && /confirm|create|run|publish|submit/.test(low(buttonLabel(button)));
        }
        if (kind === 'done') {
            return /your sale is scheduled|sale is scheduled|successfully scheduled|successfully created/.test(source)
                && /^done$/.test(low(buttonLabel(button)));
        }
        return true;
    }
    function visible(el) {
        if (!el || !(el instanceof Element) || isOwnUi(el)) return false;
        if (el.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
        let current = el;
        while (current && current instanceof Element && current !== document.documentElement) {
            const style = getComputedStyle(current);
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
            current = current.parentElement;
        }
        const rect = el.getBoundingClientRect();
        return !!(rect.width || rect.height || el.getClientRects().length);
    }
    function actionable(el) {
        if (!visible(el) || el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest?.('[inert]')) return false;
        try { if (getComputedStyle(el).pointerEvents === 'none') return false; } catch {}
        return true;
    }
    function queryAllDeep(root, selector) {
        const start = root || document;
        const output = [];
        const seenNodes = new Set();
        const seenRoots = new Set();
        const queue = [start];

        while (queue.length) {
            const currentRoot = queue.shift();
            if (!currentRoot || seenRoots.has(currentRoot) || typeof currentRoot.querySelectorAll !== 'function') continue;
            seenRoots.add(currentRoot);

            Array.from(currentRoot.querySelectorAll(selector)).forEach(node => {
                if (!seenNodes.has(node)) {
                    seenNodes.add(node);
                    output.push(node);
                }
            });

            Array.from(currentRoot.querySelectorAll('*')).forEach(node => {
                if (node.shadowRoot && !seenRoots.has(node.shadowRoot)) queue.push(node.shadowRoot);
            });
        }
        return output;
    }

    function allVisible(root, selector) {
        const start = root || document;
        const direct = typeof start.querySelectorAll === 'function'
            ? Array.from(start.querySelectorAll(selector)).filter(visible)
            : [];
        // Etsy currently uses ordinary DOM for most form controls. Traverse open shadow
        // roots only as a fallback so the 700 ms runner loop stays lightweight.
        return direct.length ? direct : queryAllDeep(start, selector).filter(visible);
    }

    async function waitFor(fn, timeout = 9000, step = 160) {
        const started = Date.now();
        let lastLeaseCheckAt = 0;
        while (Date.now() - started <= timeout) {
            const result = fn();
            if (result) return result;
            if (job?.active && !job.paused && Date.now() - lastLeaseCheckAt >= 1200) {
                const fresh = await gmGet(JOB_KEY, null);
                validateFreshForToken(fresh, makeToken(job));
                if (!(await acquireLease(fresh))) throw new AutomationCancelledError('Uzun bekleme sırasında sekme sahipliği kaybedildi.');
                job = fresh;
                lastLeaseCheckAt = Date.now();
            }
            await sleep(step);
        }
        return null;
    }

    function fieldScore(root) {
        if (!root || isOwnUi(root) || isBadEtsyShell(root)) return -100;
        const t = saleFlowText(root);
        const isOverlay = !!root.matches?.('[role="dialog"], .wt-overlay, .wt-modal, .wt-overlay__modal');
        if (isOverlay && (!hasSaleFlowSignal(t) || hasDestructiveOrUnrelatedActionText(t))) return -100;
        let score = 0;

        if (/set up a sale/.test(t)) score += 18;
        if (/which listings are included/.test(t)) score += 22;
        if (/review your sale details/.test(t)) score += 24;
        if (/your sale is scheduled|sale is scheduled/.test(t)) score += 28;
        if (/review\s*(and|&)\s*confirm/.test(t)) score += 12;
        if (/confirm\s*(and\s*create\s*)?sale/.test(t)) score += 12;
        if (/\bdone\b/.test(t) && /scheduled|success|sale/.test(t)) score += 10;

        if (/run a sale/.test(t)) score += 6;
        if (/what discount|discount amount|amount off|percentage off/.test(t)) score += 5;
        if (/start date|sale duration/.test(t)) score += 5;
        if (/end date|sale duration/.test(t)) score += 5;
        if (/sale name|name your sale|name your coupon|promo name|promotion name/.test(t)) score += 5;
        if (root.querySelector?.('#what-discount, #reward-percentage, #name-your-coupon, select[name="reward_type"], select[name="reward_type_percent_dropdown"], input[name="promo_name"], input[data-datepicker-input="true"]')) score += 22;

        if (isOverlay) score += 30;
        if (root.matches?.('.sales-and-discounts-subapp, main#main-content, main')) score -= 8;
        if (root === document.body) score -= 20;
        return score;
    }

    function getFlowRoot() {
        const selectors = [
            '[role="dialog"]',
            '.wt-overlay__modal',
            '.wt-overlay',
            '.wt-modal',
            '.wt-overlay__main',
            '.sales-and-discounts-subapp',
            'main#main-content',
            'main',
        ];
        const candidates = [];
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                const isPageRoot = selector === 'main#main-content' || selector === '.sales-and-discounts-subapp' || selector === 'main';
                if (!visible(el) && !isPageRoot) return;
                if (!isPageRoot && (!hasSaleFlowSignal(el) || hasDestructiveOrUnrelatedActionText(el))) return;
                candidates.push(el);
            });
        });
        candidates.push(document.body);
        return candidates
            .map(el => ({ el, score: fieldScore(el) }))
            .filter(item => item.score > -50)
            .sort((a, b) => b.score - a.score)[0]?.el || document;
    }

    function nearestStructuredSaleSurface(element) {
        return element?.closest?.('.wt-overlay__modal, [role="dialog"], .wt-overlay, .wt-modal')
            || element?.closest?.('form')
            || null;
    }

    const STRUCTURED_SALE_FOOTER_SELECTOR = '.wt-overlay__footer__action, .wt-overlay__footer, .wt-overlay__sticky-footer-container';

    function structuredCreateSaleRoots(preferredRoot = null) {
        if (preferredRoot?.querySelector) return [preferredRoot];
        const anchors = Array.from(document.querySelectorAll([
            '#sales-and-coupons--start-date',
            '#sales-and-coupons--end-date',
            '#start-date',
            '#start_date',
            '#end-date',
            '#end_date',
            'input[name*="start" i][name*="date" i]',
            'input[name*="end" i][name*="date" i]',
            '#what-discount',
            'select[name="reward_type"]',
            '#reward-percentage',
            'select[name="reward_type_percent_dropdown"]',
            '#name-your-coupon',
            'input[name="promo_name"]',
            '#what-region',
            'select[name="eligible_region_id"]',
        ].join(', ')));
        return uniq(anchors.map(nearestStructuredSaleSurface).filter(Boolean));
    }

    function directVisibleField(root, selectors) {
        if (!root?.querySelectorAll) return null;
        for (const selector of selectors) {
            const found = Array.from(root.querySelectorAll(selector)).find(visible);
            if (found) return found;
        }
        return null;
    }

    function structuredText(root) {
        if (!root) return '';
        const segments = [];
        try {
            const doc = root.ownerDocument || document;
            const walker = doc.createTreeWalker(root, 4);
            let node = walker.nextNode();
            while (node) {
                const value = String(node.nodeValue || '').replace(/\s+/g, ' ').trim();
                if (value) segments.push(value);
                node = walker.nextNode();
            }
        } catch {}
        return low(segments.length ? segments.join(' ') : text(root));
    }

    function structuredContinueLabel(value) {
        const label = low(value);
        return (/\bcontinue\b/.test(label) || /^next(?:\b|$)/.test(label))
            && !/continue shopping|continue to (?:cart|checkout)|next month|previous month/.test(label);
    }

    // Etsy's current Run a sale form has stable field IDs/names. Prefer this verified,
    // tightly-scoped path before the generic semantic crawler. Besides being much faster,
    // it survives copy changes and avoids losing Continue while React is rebuilding text.
    function getStructuredCreateSaleRefs(preferredRoot = null, options = {}) {
        let hydratingRefs = null;
        for (const root of structuredCreateSaleRoots(preferredRoot)) {
            if (!root || isOwnUi(root)) continue;
            const strongAnchor = root.querySelector([
                '#sales-and-coupons--start-date', '#sales-and-coupons--end-date',
                '#what-discount', 'select[name="reward_type"]',
                '#reward-percentage', 'select[name="reward_type_percent_dropdown"]',
                '#name-your-coupon', 'input[name="promo_name"]',
                '#what-region', 'select[name="eligible_region_id"]',
            ].join(', '));
            if (!strongAnchor) continue;
            const startDate = directVisibleField(root, [
                '#sales-and-coupons--start-date', '#start-date', '#start_date',
                'input[name*="start" i][name*="date" i]', 'input[id*="start" i][id*="date" i]',
            ]);
            const endDate = directVisibleField(root, [
                '#sales-and-coupons--end-date', '#end-date', '#end_date',
                'input[name*="end" i][name*="date" i]', 'input[id*="end" i][id*="date" i]',
            ]);
            const discountType = directVisibleField(root, ['#what-discount', 'select[name="reward_type"]']);
            const discountSelect = directVisibleField(root, ['#reward-percentage', 'select[name="reward_type_percent_dropdown"]']);
            const saleNameInput = directVisibleField(root, ['#name-your-coupon', 'input[name="promo_name"]']);
            const regionSelect = directVisibleField(root, ['#what-region', 'select[name="eligible_region_id"]']);
            if (hasDestructiveOrUnrelatedActionText(structuredText(root))) continue;

            const complete = !!(startDate && endDate && discountType && discountSelect && saleNameInput && regionSelect);
            if (!complete) {
                hydratingRefs ||= {
                    root,
                    ready: false,
                    structuredForm: true,
                    hydrating: true,
                    startDate,
                    endDate,
                    discountType,
                    discountSelect,
                    customDiscountInput: null,
                    saleNameInput,
                    regionSelect,
                    listingAllControl: null,
                    continueButton: null,
                    continueCandidate: null,
                    reviewButton: null,
                    reviewCandidate: null,
                    doneButton: null,
                    finalButton: null,
                    finalCandidate: null,
                    errorTexts: [],
                };
                continue;
            }

            const labeledCandidates = Array.from(root.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]'))
                .filter(button => !isOwnUi(button) && nearestStructuredSaleSurface(button) === root)
                .filter(button => visible(button) && structuredContinueLabel(buttonLabel(button)));
            const footerCandidates = labeledCandidates.filter(button => !!button.closest(STRUCTURED_SALE_FOOTER_SELECTOR));
            const requiredFields = [startDate, endDate, discountType, discountSelect, saleNameInput, regionSelect];
            const fieldForms = requiredFields.map(field => field.closest('form'));
            const sharedFieldForm = fieldForms[0] && fieldForms.every(form => form === fieldForms[0])
                ? fieldForms[0]
                : null;
            const formCandidates = sharedFieldForm
                ? labeledCandidates.filter(button => button.closest('form') === sharedFieldForm)
                : [];
            const ownedCandidates = footerCandidates.length ? footerCandidates : formCandidates;
            // More than one visible exact-label action in the trusted owner is ambiguous.
            // Do not prefer an actionable impostor over Etsy's temporarily disabled action.
            const candidates = ownedCandidates.length === 1 ? ownedCandidates : [];
            const continueButton = candidates.find(actionable) || null;
            const continueCandidate = continueButton || candidates[0] || null;
            return {
                root,
                ready: true,
                structuredForm: true,
                hydrating: false,
                startDate,
                endDate,
                discountType,
                discountSelect,
                customDiscountInput: findCustomPercentInput(root, discountSelect, startDate, endDate),
                saleNameInput,
                regionSelect,
                listingAllControl: null,
                continueButton,
                continueCandidate,
                reviewButton: null,
                reviewCandidate: null,
                doneButton: null,
                finalButton: null,
                finalCandidate: null,
                errorTexts: options.includeErrors === false ? [] : collectErrors(root),
            };
        }
        return hydratingRefs;
    }

    function structuredCreateSaleActionMatches(button, refs = null) {
        if (!button || isOwnUi(button) || !structuredContinueLabel(buttonLabel(button))) return false;
        const root = nearestStructuredSaleSurface(button);
        if (!root) return false;
        const state = refs || getStructuredCreateSaleRefs(root, { includeErrors: false });
        return !!(state?.ready && (state.continueButton === button || state.continueCandidate === button));
    }

    function structuredSaleSuccessRoot(root) {
        const expectedCompletion = !!(job?.active
            && (job.completionAck || ['submitted', 'reserved'].includes(job.submission?.status)));
        if (!root || (!isCreateSalePath() && !expectedCompletion)) return false;
        const ariaLabel = low(root.getAttribute?.('aria-label') || '');
        return /\bsuccess\b/.test(ariaLabel)
            || root.matches?.('[data-test-id="success-overlay"]')
            || !!root.querySelector?.('[data-test-id="success-overlay"]');
    }

    function structuredSaleStepRootMatches(root, kind = '') {
        if (!root) return false;
        const source = structuredText(root);
        if (hasDestructiveOrUnrelatedActionText(source)) return false;
        if (kind === 'done' && structuredSaleSuccessRoot(root)) return true;
        if (!source) return false;
        if (kind === 'review') return /which listings are included|all listings|entire shop|all eligible listings/.test(source);
        if (kind === 'final') return /review your sale details|sale details/.test(source);
        if (kind === 'done') return /your sale is (?:scheduled|live)|sale is (?:scheduled|live)|successfully scheduled|successfully created/.test(source);
        return false;
    }

    function getStructuredSaleStepRefs(preferredButton = null, options = {}) {
        const buttons = preferredButton
            ? [preferredButton]
            : Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]'));
        const matches = [];
        for (const button of buttons) {
            if (!button || isOwnUi(button)) continue;
            const label = low(buttonLabel(button));
            const root = nearestStructuredSaleSurface(button);
            if (!root) continue;
            const structuralDone = structuredSaleSuccessRoot(root)
                && (button.matches?.('button[type="submit"], input[type="submit"]') || low(button.getAttribute?.('type')) === 'submit');
            if (!/^review\s*(?:and|&)\s*confirm$/.test(label)
                && !/^(?:confirm(?:\s+and\s+create)?\s+sale|create\s+sale|run\s+sale|publish\s+sale|submit\s+sale)$/.test(label)
                && !/^done$/.test(label)
                && !structuralDone) continue;
            if (!visible(button)) continue;
            if (!button.closest(STRUCTURED_SALE_FOOTER_SELECTOR)) continue;
            const source = structuredText(root);
            if (hasDestructiveOrUnrelatedActionText(source)) continue;
            const reviewMatch = /^review\s*(?:and|&)\s*confirm$/.test(label)
                && /which listings are included|all listings|entire shop|all eligible listings/.test(source);
            const finalMatch = /^(?:confirm(?:\s+and\s+create)?\s+sale|create\s+sale|run\s+sale|publish\s+sale|submit\s+sale)$/.test(label)
                && /review your sale details|sale details/.test(source);
            const doneMatch = structuralDone || (/^done$/.test(label)
                && /your sale is (?:scheduled|live)|sale is (?:scheduled|live)|successfully scheduled|successfully created/.test(source));
            if (!(reviewMatch || finalMatch || doneMatch)) continue;
            matches.push({ button, root, stage: reviewMatch ? 'listings' : finalMatch ? 'review' : 'complete' });
        }
        if (!matches.length) return null;

        const stages = new Set(matches.map(match => match.stage));
        const roots = new Set(matches.map(match => match.root));
        if (stages.size !== 1 || roots.size !== 1 || matches.length !== 1) {
            return {
                root: matches[0].root,
                stage: 'unknown',
                ready: false,
                structuredStep: true,
                ambiguous: true,
                startDate: null,
                endDate: null,
                discountType: null,
                discountSelect: null,
                customDiscountInput: null,
                saleNameInput: null,
                regionSelect: null,
                listingAllControl: null,
                continueButton: null,
                continueCandidate: null,
                reviewButton: null,
                reviewCandidate: null,
                finalButton: null,
                finalCandidate: null,
                doneButton: null,
                errorTexts: [],
            };
        }

        const selected = matches.find(match => actionable(match.button)) || matches[0];
        const { button, root, stage } = selected;
        const enabled = actionable(button) ? button : null;
        const reviewMatch = stage === 'listings';
        const finalMatch = stage === 'review';
        const doneMatch = stage === 'complete';
        return {
            root,
            stage,
            ready: false,
            structuredStep: true,
            ambiguous: false,
            startDate: null,
            endDate: null,
            discountType: null,
            discountSelect: null,
            customDiscountInput: null,
            saleNameInput: null,
            regionSelect: null,
            listingAllControl: reviewMatch ? findListingScopeControl(root) : null,
            continueButton: null,
            continueCandidate: null,
            reviewButton: reviewMatch ? enabled : null,
            reviewCandidate: reviewMatch ? button : null,
            finalButton: finalMatch ? enabled : null,
            finalCandidate: finalMatch ? button : null,
            doneButton: doneMatch ? enabled : null,
            errorTexts: options.includeErrors === false ? [] : collectErrors(root),
        };
    }

    function structuredSaleStepActionMatches(button, kind = '', refs = null) {
        const state = refs || getStructuredSaleStepRefs(null, { includeErrors: false });
        if (!state || state.ambiguous) return false;
        if (kind === 'review') return state.stage === 'listings' && state.reviewCandidate === button;
        if (kind === 'final') return state.stage === 'review' && state.finalCandidate === button;
        if (kind === 'done') return state.stage === 'complete' && state.doneButton === button;
        return false;
    }

    function findOne(root, selectors) {
        for (const selector of selectors) {
            const found = allVisible(root, selector)[0];
            if (found) return found;
        }
        return null;
    }

    function labelMatches(label, patterns) {
        const t = low(text(label));
        return patterns.some(pattern => pattern.test(t));
    }

    function byLabel(root, patterns, fieldSelector = 'input, select, textarea') {
        const labels = allVisible(root, 'label').filter(label => labelMatches(label, patterns));
        for (const label of labels) {
            const forId = label.getAttribute('for');
            if (forId) {
                const field = root.querySelector(`#${CSS.escape(forId)}`);
                if (field && visible(field) && field.matches(fieldSelector)) return field;
            }
            const nested = label.querySelector(fieldSelector);
            if (nested && visible(nested)) return nested;
            const block = label.closest('div,fieldset,section,li') || label.parentElement;
            const nearby = block ? allVisible(block, fieldSelector)[0] : null;
            if (nearby) return nearby;
        }
        return null;
    }

    function byTextyAttrs(root, patterns, fieldSelector = 'input, select, textarea') {
        return allVisible(root, fieldSelector).find(field => {
            const source = low([
                field.id,
                field.name,
                field.placeholder,
                field.getAttribute('aria-label'),
                field.getAttribute('data-testid'),
            ].join(' '));
            return patterns.some(pattern => pattern.test(source));
        }) || null;
    }

    function selectWithPercentOptions(root) {
        return allVisible(root, 'select').find(select => {
            const opts = Array.from(select.options || []).map(option => low(`${option.textContent} ${option.value}`)).join(' ');
            return /%|percent|percentage|custom/.test(opts);
        }) || null;
    }

    function findFormSubmitButton(root, fields = []) {
        const anchorField = fields.find(Boolean) || null;
        const scope = anchorField?.closest?.('form')
            || anchorField?.closest?.('[role="dialog"], .wt-overlay__modal, .wt-overlay, .wt-modal')
            || (root?.matches?.('[role="dialog"], .wt-overlay__modal, .wt-overlay, .wt-modal') ? root : null);
        if (!scope) return null;

        const candidates = allVisible(scope, 'button[type="submit"], input[type="submit"]')
            .filter(button => !actionBadShell(button, 'continue'))
            .filter(button => !/cancel|back|close|done/i.test(low(buttonLabel(button))));
        if (!candidates.length) return null;

        const enabled = candidates.filter(actionable);
        if (enabled.length === 1) return enabled[0];
        if (!enabled.length && candidates.length === 1) return candidates[0];

        const ranked = candidates.map(button => {
            const label = low(buttonLabel(button));
            const attr = low(`${button.className || ''} ${button.getAttribute('data-testid') || ''}`);
            let score = 0;
            if (/continue|next|select.*listing|choose.*listing|review/.test(label)) score += 30;
            if (/wt-btn--filled|wt-btn--primary|primary/.test(attr)) score += 8;
            if (actionable(button)) score += 5;
            return { button, score };
        }).sort((a, b) => b.score - a.score);
        return ranked[0]?.score > 0 ? ranked[0].button : null;
    }

    function findListingScopeControl(root) {
        const controlSelector = 'input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], [aria-checked], button[aria-pressed], [role="button"][aria-pressed]';
        const disallowed = /\b(?:on|for)\s+(?:this|the|current)\s+page\b|\bcurrent\s+page\b|\bvisible\s+(?:items?|listings?)\b|\b(?:items?|listings?)\s+(?:shown|visible)\b|\bpage\s+(?:items?|listings?)\b/i;
        const describesAll = value => {
            const source = String(value || '').replace(/\s+/g, ' ').trim();
            if (!source || disallowed.test(source) || hasAllListingsNegation(source)) return false;
            return /^(?:select\s+)?all\s+(?:active\s+|eligible\s+)?listings?\b/i.test(source)
                || /^(?:the\s+)?entire\s+shop\b/i.test(source);
        };

        const labels = allVisible(root, 'label').filter(label => describesAll(semanticVisibleText(label)));
        for (const label of labels) {
            const forId = label.getAttribute('for');
            if (forId) {
                const field = root.querySelector?.(`#${CSS.escape(forId)}`) || document.getElementById(forId);
                if (field && field.matches?.(controlSelector)) return field;
            }
            const nested = label.querySelector(controlSelector);
            if (nested) return nested;
            if (label.matches('[role="radio"], [role="checkbox"], [aria-checked], [aria-pressed]')) return label;
        }

        const controls = queryAllDeep(root || document, controlSelector);
        return controls.find(control => {
            if (control.closest?.('[hidden], [aria-hidden="true"], [inert]')) return false;
            const associated = associatedVisibleLabel(control, root);
            const source = [
                control.getAttribute?.('aria-label'),
                control.getAttribute?.('data-label'),
                associated ? semanticVisibleText(associated) : '',
            ].filter(Boolean).join(' ');
            return describesAll(source) && (visible(control) || !!associated || control.matches?.('[role="radio"], [role="checkbox"]'));
        }) || null;
    }

    function fieldLabelText(field, root = document) {
        if (!field) return '';
        const nested = field.closest?.('label');
        if (nested) return semanticVisibleText(nested);
        const id = field.id;
        if (id) {
            const scope = root && typeof root.querySelector === 'function' ? root : document;
            const label = scope.querySelector?.(`label[for="${CSS.escape(id)}"]`) || document.querySelector?.(`label[for="${CSS.escape(id)}"]`);
            if (label) return semanticVisibleText(label);
        }
        return '';
    }

    function customPercentInputEvidence(input, discountSelect = null, root = document) {
        if (!input) return false;
        const label = low(fieldLabelText(input, root));
        const attrs = low(`${input.id || ''} ${input.name || ''} ${input.placeholder || ''} ${input.getAttribute?.('aria-label') || ''} ${input.getAttribute?.('data-testid') || ''}`);
        const source = `${label} ${attrs}`;
        const controlledBySelect = !!(discountSelect && [discountSelect.getAttribute?.('aria-controls'), discountSelect.getAttribute?.('aria-describedby')]
            .filter(Boolean).some(value => String(value).split(/\s+/).includes(input.id)));
        const negative = /minimum|min(?:imum)?\s+(?:order|purchase)|order\s+amount|subtotal|threshold|quantity|spend|cart|currency|dollars?|usd|fixed\s+amount/.test(source);
        const positive = /%|\bpercent(?:age)?\b|\bpct\b/.test(source)
            || (/\bcustom\b/.test(source) && /\b(?:discount|reward)\b/.test(source));
        return !negative && (positive || controlledBySelect);
    }

    function findCustomPercentInput(root, discountSelect = null, startDate = null, endDate = null) {
        const inputs = allVisible(root, 'input[type="number"], input[inputmode="numeric"], input[name*="percent" i], input[id*="percent" i], input[name*="discount" i], input[id*="discount" i]')
            .filter(input => input !== startDate && input !== endDate);
        const ranked = inputs.map(input => {
            const label = low(fieldLabelText(input, root));
            const attrs = low(`${input.id || ''} ${input.name || ''} ${input.placeholder || ''} ${input.getAttribute('aria-label') || ''} ${input.getAttribute('data-testid') || ''}`);
            const source = `${label} ${attrs}`;
            let score = 0;
            if (/\bpercentage\b|\bpercent\b|%|\bpct\b/.test(source)) score += 100;
            if (/\bcustom\b/.test(source) && /\b(?:discount|reward|percentage|percent)\b/.test(source)) score += 45;
            if (discountSelect && [discountSelect.getAttribute('aria-controls'), discountSelect.getAttribute('aria-describedby')]
                .filter(Boolean).some(value => String(value).split(/\s+/).includes(input.id))) score += 80;
            if (/minimum|min(?:imum)?\s+(?:order|purchase)|order\s+amount|subtotal|threshold|quantity|spend|cart/.test(source)) score -= 160;
            if (/currency|dollars?|usd|fixed\s+amount|money\s+off/.test(source)) score -= 120;
            if (!customPercentInputEvidence(input, discountSelect, root)) score -= 100;
            return { input, score };
        }).sort((a, b) => b.score - a.score);
        return ranked[0]?.score >= 60 ? ranked[0].input : null;
    }

    function emptyCreateSaleRefs(root = null, extras = {}) {
        return {
            root,
            ready: false,
            structuredForm: false,
            structuredStep: false,
            hydrating: false,
            ambiguous: false,
            stage: 'unknown',
            startDate: null,
            endDate: null,
            discountType: null,
            discountSelect: null,
            customDiscountInput: null,
            saleNameInput: null,
            regionSelect: null,
            listingAllControl: null,
            continueButton: null,
            continueCandidate: null,
            reviewButton: null,
            reviewCandidate: null,
            doneButton: null,
            finalButton: null,
            finalCandidate: null,
            errorTexts: [],
            ...extras,
        };
    }

    function currentSaleOverlayShell() {
        const container = document.getElementById('wt-modal-container');
        if (!container) return null;
        return Array.from(container.children || []).find(root => root?.isConnected
            && root.matches?.('[role="dialog"], .wt-overlay, .wt-modal')
            && root.getAttribute?.('aria-hidden') !== 'true') || null;
    }

    function getCreateSaleRefs() {
        const shell = currentSaleOverlayShell();
        const structuredStep = shell ? getStructuredSaleStepRefs() : null;
        if (structuredStep) return structuredStep;
        if (shell && structuredSaleSuccessRoot(shell)) {
            return emptyCreateSaleRefs(shell, {
                structuredStep: true,
                stage: 'complete',
                errorTexts: collectErrors(shell),
            });
        }
        const structuredForm = getStructuredCreateSaleRefs();
        if (structuredForm) return structuredForm;

        // Current Etsy sale routes are handled only by the bounded structural adapters above.
        // During React hydration the modal can briefly contain neither fields nor a footer.
        // Treat that state as loading instead of invoking the legacy full-page semantic crawler,
        // which can monopolize the main thread for hundreds or thousands of milliseconds.
        if (shell || isCreateSalePath()) {
            return emptyCreateSaleRefs(shell, { structuredForm: true, hydrating: true });
        }
        if (isSupportedRoute()) return emptyCreateSaleRefs();

        // Compatibility fallback for non-current/offline integrations only. It is intentionally
        // unreachable on supported live Etsy sale routes so automation can fail closed without
        // freezing the page when Etsy changes its DOM.
        const root = getFlowRoot();
        const dateInputs = allVisible(root, 'input[data-datepicker-input="true"], input[type="date"], input[placeholder*="MM"], input[placeholder*="YYYY"], input[aria-label*="date" i], input[id*="date" i], input[name*="date" i]')
            .filter(input => !/search|filter|birthday|birth/i.test(`${input.name || ''} ${input.id || ''} ${input.placeholder || ''} ${input.getAttribute('aria-label') || ''}`));
        const startDate = findOne(root, ['#start-date', '#start_date', 'input[name*="start" i][name*="date" i]', 'input[id*="start" i][id*="date" i]', 'input[aria-label*="start" i][aria-label*="date" i]']) || byLabel(root, [/start\s*date/, /starts/, /begin/], 'input') || byTextyAttrs(root, [/start.*date/, /date.*start/, /starts?/], 'input') || dateInputs[0] || null;
        const endDate = findOne(root, ['#end-date', '#end_date', 'input[name*="end" i][name*="date" i]', 'input[id*="end" i][id*="date" i]', 'input[aria-label*="end" i][aria-label*="date" i]']) || byLabel(root, [/end\s*date/, /ends/, /finish/], 'input') || byTextyAttrs(root, [/end.*date/, /date.*end/, /ends?/], 'input') || dateInputs.find(input => input !== startDate) || null;
        const discountType = findOne(root, ['#what-discount', 'select[name="reward_type"]']) || byLabel(root, [/what\s*discount/, /discount\s*type/], 'select') || null;
        const discountSelect = findOne(root, ['#reward-percentage', 'select[name="reward_type_percent_dropdown"]']) || byLabel(root, [/amount\s*off/, /discount\s*amount/, /percentage\s*off/, /percent/], 'select') || selectWithPercentOptions(root);
        const saleNameInput = findOne(root, ['#name-your-coupon', 'input[name="promo_name"]']) || byLabel(root, [/name\s*your\s*(sale|coupon)/, /promo\s*name/, /promotion\s*name/, /coupon\s*code/], 'input') || byTextyAttrs(root, [/promo.*name/, /coupon.*name/, /sale.*name/], 'input');
        const regionSelect = findOne(root, ['#what-region', 'select[name="eligible_region_id"]']) || byLabel(root, [/where.*valid/, /region/, /country/, /location/], 'select') || null;
        const customDiscountInput = findCustomPercentInput(root, discountSelect, startDate, endDate);

        const continuePositive = [/^continue$/i, /^continue\b/i, /^next$/i, /^next\b/i, /select\s+(all\s+)?listings?/i, /choose\s+(the\s+)?listings?/i];
        const continueNegative = [/cancel/i, /back/i, /done/i, /close/i, /continue shopping/i];
        const reviewPositive = [/review\s*(and|&)\s*confirm/i, /^review$/i, /^review\b/i];
        const reviewNegative = [/cancel/i, /back/i, /done/i, /close/i];
        const finalPositive = [/confirm\s*(and\s*create\s*)?sale/i, /^(create|run|publish|submit)\s*(sale|promotion)?$/i, /confirm\s*(sale|promotion)$/i, /^confirm$/i];
        const finalNegative = [/cancel/i, /back/i, /done/i, /close/i, /copy/i];
        const labeledContinue = findButtonDeep(continuePositive, continueNegative, { kind: 'continue', root });
        const labeledContinueAny = labeledContinue || findButtonDeep(continuePositive, continueNegative, { kind: 'continue', root, includeDisabled: true });
        const submitCandidate = findFormSubmitButton(root, [saleNameInput, startDate, endDate, discountSelect]);
        const continueButton = labeledContinue || (submitCandidate && actionable(submitCandidate) ? submitCandidate : null);
        const continueCandidate = labeledContinueAny || submitCandidate || null;
        const reviewButton = findButtonDeep(reviewPositive, reviewNegative, { kind: 'review', root });
        const reviewCandidate = reviewButton || findButtonDeep(reviewPositive, reviewNegative, { kind: 'review', root, includeDisabled: true });
        const finalButton = findButtonDeep(finalPositive, finalNegative, { kind: 'final', root });
        const finalCandidate = finalButton || findButtonDeep(finalPositive, finalNegative, { kind: 'final', root, includeDisabled: true });

        return {
            root,
            ready: !!(startDate && endDate && saleNameInput && discountSelect),
            startDate,
            endDate,
            discountType,
            discountSelect,
            customDiscountInput,
            saleNameInput,
            regionSelect,
            listingAllControl: findListingScopeControl(root),
            continueButton,
            continueCandidate,
            reviewButton,
            reviewCandidate,
            doneButton: findButtonDeep([/^done$/i], [/cancel/i, /back/i, /close/i, /copy/i], { kind: 'done', root }),
            finalButton,
            finalCandidate,
            errorTexts: collectErrors(root),
        };
    }

    function buttonLabel(button) {
        const sources = [
            text(button),
            button?.getAttribute?.('aria-label'),
            button?.getAttribute?.('title'),
            button?.getAttribute?.('data-label'),
            button?.getAttribute?.('data-testid'),
            button?.value,
        ];
        return sources.map(value => String(value || '').replace(/\s+/g, ' ').trim()).find(Boolean) || '';
    }

    function findButton(root, positivePatterns, negativePatterns = []) {
        const buttons = allVisible(root, 'button, a[role="button"], [role="button"], input[type="button"], input[type="submit"]')
            .filter(actionable)
            .filter(button => !isBadEtsyShell(button.closest('[role="dialog"], .wt-overlay, .wt-modal') || button));
        const ranked = buttons.map(button => {
            const label = buttonLabel(button);
            const labelLow = low(label);
            const attr = low(`${button.className || ''} ${button.getAttribute('data-testid') || ''} ${button.type || ''}`);
            const neg = negativePatterns.some(pattern => pattern.test(labelLow));
            const exact = positivePatterns.some(pattern => pattern.test(label));
            let score = exact ? 10 : 0;
            if (/wt-btn--filled|wt-btn--primary|primary/.test(attr)) score += 2;
            if (button.closest('.wt-overlay__sticky-footer-container, .wt-overlay__footer, footer')) score += 2;
            if (/set up/i.test(label) && button.matches('a')) score -= 4;
            return { button, label, neg, score };
        }).filter(item => !item.neg && item.score > 0).sort((a, b) => b.score - a.score);
        return ranked[0]?.button || null;
    }

    function nearestActionContext(button) {
        if (!button) return getFlowRoot() || button;
        const overlay = button.closest?.('[role="dialog"], .wt-overlay__modal, .wt-overlay, .wt-modal');
        if (overlay) return overlay;
        return button.closest?.('form, main#main-content, main, section, article, .wt-card, .wt-grid') || getFlowRoot() || button;
    }
    function actionContextText(button) {
        const context = nearestActionContext(button);
        const value = low(text(context));
        return value.length > 1800 ? value.slice(0, 1800) : value;
    }

    function actionBadShell(button, kind = '') {
        if (!button || isOwnUi(button)) return true;
        if (kind === 'continue') {
            const structuredRoot = nearestStructuredSaleSurface(button);
            const structuredForm = structuredRoot
                ? getStructuredCreateSaleRefs(structuredRoot, { includeErrors: false })
                : null;
            if (structuredForm) return !structuredCreateSaleActionMatches(button, structuredForm);
        }
        if (['review', 'final', 'done'].includes(kind)) {
            const structuredStep = getStructuredSaleStepRefs(null, { includeErrors: false });
            if (structuredStep?.ambiguous) return true;
            if (structuredStep) return !structuredSaleStepActionMatches(button, kind, structuredStep);
            if (structuredSaleStepRootMatches(nearestStructuredSaleSurface(button), kind)) return true;
        }
        const shell = button.closest('[role="dialog"], .wt-overlay, .wt-modal, footer, [data-wt-menu-body], .wt-menu__body') || button;
        if (isBadEtsyShell(shell)) return true;
        const label = low(buttonLabel(button));
        const context = actionContextText(button);
        if (button.closest('footer') && !/sale|discount|promotion|promo|offer|created|scheduled|success/.test(context)) return true;
        if (kind !== 'continue' && /^set up$/.test(label)) return true;
        if (/privacy settings|update your settings|locale preferences|required cookies|personalized advertising/.test(context)) return true;
        if (hasDestructiveOrUnrelatedActionText(context)) return true;
        if (['continue', 'review', 'final', 'done'].includes(kind) && !saleActionContextMatches(button, kind)) return true;
        return false;
    }

    function findButtonDeep(positivePatterns, negativePatterns = [], options = {}) {
        const flowRoot = getFlowRoot();
        const rootCandidates = uniq([options.root, flowRoot, document.querySelector('[role="dialog"], .wt-overlay__modal, .wt-overlay, .wt-modal'), document.querySelector('main#main-content'), document.querySelector('main'), document.body]);
        const seen = new Set();
        const buttons = [];
        rootCandidates.forEach(root => {
            if (!root) return;
            // Include anchors only when Etsy styles/declares them as buttons. Ordinary sale navigation
            // links are still handled exclusively by findRunSaleLink().
            allVisible(root, 'button, a[role="button"], [role="button"], a.wt-btn, a[data-clg-id="WtButton"], input[type="button"], input[type="submit"]').forEach(button => {
                if (seen.has(button)) return;
                seen.add(button);
                buttons.push(button);
            });
        });

        const ranked = buttons
            .filter(button => options.includeDisabled ? visible(button) : actionable(button))
            .filter(button => !actionBadShell(button, options.kind || ''))
            .map(button => {
                const label = buttonLabel(button);
                const labelLow = low(label);
                const attr = low(`${button.className || ''} ${button.getAttribute('data-testid') || ''} ${button.getAttribute('data-clg-id') || ''} ${button.type || ''}`);
                const context = actionContextText(button);
                const neg = negativePatterns.some(pattern => pattern.test(labelLow));
                const labelMatch = positivePatterns.some(pattern => pattern.test(label)) || positivePatterns.some(pattern => pattern.test(labelLow));
                let score = 0;

                if (labelMatch) score += 50;
                else {
                    // Never select a step action only because it is primary/filled.
                    return { button, label, neg, score: -100 };
                }

                if (/wt-btn--filled|wt-btn--primary|primary|submit/.test(attr)) score += 5;
                if (button.matches('input[type="submit"], button[type="submit"]')) score += 3;
                if (button.closest('[role="dialog"], .wt-overlay__modal, .wt-overlay, .wt-modal')) score += 12;
                else if (button.closest('main#main-content, main')) score += 2;
                if (button.closest('.wt-overlay__sticky-footer-container, .wt-overlay__footer')) score += 5;
                if (button.closest('footer') && !button.closest('main#main-content, main, [role="dialog"], .wt-overlay, .wt-modal')) score -= 20;
                if (/set up/i.test(label) && button.matches('a')) score -= 30;

                if (options.kind === 'review') {
                    if (/^review\s*(and|&)\s*confirm$/.test(labelLow)) score += 25;
                    if (!/review/.test(labelLow)) score -= 80;
                    if (/which listings are included|review\s*(and|&)\s*confirm|sale|discount|promotion/.test(context)) score += 6;
                }
                if (options.kind === 'done') {
                    if (/^done$/.test(labelLow)) score += 30;
                    if (/success|created|scheduled|your sale is scheduled|sale|discount|promotion|promo|offer/.test(context)) score += 10;
                    if (!/^done$/.test(labelLow)) score -= 100;
                }
                if (options.kind === 'continue') {
                    if (/^continue$/.test(labelLow)) score += 25;
                    else if (/^continue\b/.test(labelLow)) score += 20;
                    else if (/^next$/.test(labelLow)) score += 18;
                    else if (/^next\b/.test(labelLow)) score += 14;
                    else if (/select\s+(all\s+)?listings?|choose\s+(the\s+)?listings?/.test(labelLow)) score += 12;
                    else score -= 80;
                    if (/set up a sale|sale|discount|date|promotion|coupon|promo|listing/.test(context)) score += 6;
                    if (options.includeDisabled && !actionable(button)) score -= 2;
                }
                if (options.kind === 'final') {
                    if (/^confirm\s*(and\s*create\s*)?sale$/.test(labelLow)) score += 30;
                    if (!/confirm|create|run|publish|submit/.test(labelLow)) score -= 80;
                    if (/review your sale details|review|sale|discount|promotion|promo|offer/.test(context)) score += 8;
                }
                return { button, label, neg, score };
            })
            .filter(item => !item.neg && item.score > 0)
            .sort((a, b) => b.score - a.score);
        return ranked[0]?.button || null;
    }

    function collectErrors(root = getFlowRoot()) {
        const selectors = [
            '.has-error-msg',
            '.wt-alert--error',
            '[role="alert"]',
            '.wt-validation__message',
            '.wt-status-message',
            '[data-testid*="error"]',
        ];
        const negative = /\berror\b|failed|failure|could\s+not|couldn['’]?t|can(?:not|'t)|unable|invalid|required|conflict|overlap|already exists|not created|not scheduled|not available|isn['’]?t available|there was a problem|please fix|highlighted fields|try again|something went wrong|too many|rate limit|temporarily blocked|verify (?:you are|that you're) human|captcha|access denied/i;
        const harmless = /characters remaining|this sale applies to all eligible listings|all eligible listings (?:are )?(?:selected|included)|privacy settings|required cookies|personalized advertising|successfully saved|changes saved|sale is scheduled|your sale is scheduled/i;
        const transient = /^(?:loading|please wait|saving|submitting|processing)(?:[\s.…!]*?)$/i;
        const out = [];
        selectors.forEach(selector => {
            allVisible(root, selector).forEach(node => {
                const value = semanticVisibleText(node) || text(node);
                if (!value || harmless.test(value) || transient.test(value.trim())) return;
                const explicitError = node.matches?.('.has-error-msg, .wt-alert--error, .wt-validation__message, [data-testid*="error"]');
                const assertiveAlert = node.matches?.('[role="alert"]') && node.getAttribute?.('aria-live') !== 'polite';
                if (negative.test(value) || explicitError || assertiveAlert) out.push(value);
            });
        });
        return uniq(out).slice(0, 6);
    }
    function detectChallenge(root = document) {
        const doc = root?.nodeType === 9 ? root : (root?.ownerDocument || document);
        const title = String(doc?.title || '').replace(/\s+/g, ' ').trim();
        const strong = /\bcaptcha\b|verify (?:you are|that you're) human|are you a (?:human|robot)|access denied|too many requests|rate limit|temporarily blocked|unusual traffic|security check|complete the security check|press and hold/i;
        const normalSales = /sales and discounts|details\s*&\s*stats|set up a sale|run a sale/i;
        const candidates = [];
        if (title) candidates.push(title);
        const selectors = [
            'h1', 'h2', 'h3', '[role="alert"]', '[role="alertdialog"]',
            '[data-testid*="captcha" i]', '[id*="captcha" i]', '[class*="captcha" i]',
            '[aria-label*="captcha" i]', 'iframe[title*="captcha" i]', 'form[action*="captcha" i]'
        ];
        selectors.forEach(selector => {
            Array.from(doc?.querySelectorAll?.(selector) || []).forEach(node => {
                if (!evidenceNodeVisible(node)) return;
                const value = semanticVisibleText(node).slice(0, 1200);
                if (value) candidates.push(value);
                const marker = `${node.getAttribute?.('id') || ''} ${node.getAttribute?.('class') || ''} ${node.getAttribute?.('aria-label') || ''} ${node.getAttribute?.('title') || ''}`;
                if (marker) candidates.push(marker);
            });
        });
        for (const candidate of candidates) {
            if (strong.test(candidate)) {
                const match = candidate.match(/.{0,90}(captcha|verify (?:you are|that you're) human|are you a (?:human|robot)|access denied|too many requests|rate limit|temporarily blocked|unusual traffic|security check|complete the security check|press and hold).{0,150}/i)?.[0];
                return match || 'Etsy güvenlik veya hız sınırı ekranı algılandı.';
            }
        }
        const main = doc?.querySelector?.('main#main-content, main, [role="main"]') || doc?.body;
        const mainText = semanticVisibleText(main).slice(0, 5000);
        if (mainText && strong.test(mainText) && !normalSales.test(mainText)) {
            return mainText.match(/.{0,90}(captcha|verify (?:you are|that you're) human|are you a (?:human|robot)|access denied|too many requests|rate limit|temporarily blocked|unusual traffic|security check|complete the security check|press and hold).{0,150}/i)?.[0]
                || 'Etsy güvenlik veya hız sınırı ekranı algılandı.';
        }
        return '';
    }

    function nativeSet(el, value) {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor?.set) descriptor.set.call(el, value);
        else el.value = value;
    }

    function fire(el) {
        try { el.focus?.(); } catch {}
        const tracker = el?._valueTracker;
        if (tracker?.setValue) {
            try { tracker.setValue('__eda_previous_value__'); } catch {}
        }
        try {
            el.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: String(el?.value ?? ''),
            }));
        } catch {
            el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        }
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        try { el.blur?.(); } catch { el.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true })); }
    }

    function fireTypingEvents(el) {
        ['keydown', 'keypress', 'keyup'].forEach(type => {
            try { el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, key: '0' })); }
            catch { el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true })); }
        });
        fire(el);
    }

    function removeDateReadOnlyTemporarily(el) {
        if (!el || !(el instanceof HTMLInputElement)) return () => {};
        const hadReadonly = el.hasAttribute('readonly');
        const oldReadonly = el.getAttribute('readonly');
        const oldAriaReadonly = el.getAttribute('aria-readonly');
        try { el.removeAttribute('readonly'); el.removeAttribute('aria-readonly'); } catch {}
        return () => {
            try {
                if (hadReadonly) el.setAttribute('readonly', oldReadonly ?? '');
                if (oldAriaReadonly !== null) el.setAttribute('aria-readonly', oldAriaReadonly);
            } catch {}
        };
    }

    function slashNoZero(date) { return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`; }
    function compactUsDate(date) { return `${pad2(date.getMonth() + 1)}${pad2(date.getDate())}${date.getFullYear()}`; }
    function longUsDate(date) { return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }

    function parseFlexibleDate(value) {
        const raw = String(value || '').replace(/\s+/g, ' ').trim();
        if (!raw) return null;
        let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (m) return parseIso(`${m[1]}-${pad2(m[2])}-${pad2(m[3])}`);
        m = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
        if (m) {
            const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
            const d = new Date(year, Number(m[1]) - 1, Number(m[2]));
            return d && d.getFullYear() === year && d.getMonth() === Number(m[1]) - 1 && d.getDate() === Number(m[2]) ? d : null;
        }
        m = raw.match(/^(\d{2})(\d{2})(\d{4})$/);
        if (m) {
            const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
            return d && d.getFullYear() === Number(m[3]) && d.getMonth() === Number(m[1]) - 1 && d.getDate() === Number(m[2]) ? d : null;
        }
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
        return null;
    }

    function dateValueMatches(el, date) {
        if (!el || !date) return false;
        const value = String(el.value || el.getAttribute('value') || '').trim();
        const parsed = parseFlexibleDate(value);
        if (sameDay(parsed, date)) return true;
        const normalized = value.toLowerCase();
        return [usDate(date), slashNoZero(date), compactUsDate(date), isoDate(date), longUsDate(date)]
            .map(v => String(v).toLowerCase())
            .includes(normalized);
    }

    async function pasteText(el, value) {
        try {
            el.focus?.();
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.select?.();
            const ok = document.execCommand?.('insertText', false, String(value));
            fireTypingEvents(el);
            await sleep(120);
            return !!ok;
        } catch {
            return false;
        }
    }

    async function fillDateField(el, date) {
        if (!el || !visible(el) || !date) return false;
        el.scrollIntoView?.({ block: 'center', inline: 'nearest' });
        await sleep(80);
        const restoreReadonly = removeDateReadOnlyTemporarily(el);
        const candidates = el.type === 'date'
            ? [isoDate(date), usDate(date), slashNoZero(date)]
            : [usDate(date), slashNoZero(date), compactUsDate(date), isoDate(date), longUsDate(date)];
        try {
            for (const candidate of candidates) {
                try { el.click?.(); } catch {}
                await sleep(40);
                if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                    try { el.select?.(); } catch {}
                    try { el.setSelectionRange?.(0, String(el.value || '').length); } catch {}
                }
                nativeSet(el, '');
                fireTypingEvents(el);
                await sleep(40);
                nativeSet(el, candidate);
                fireTypingEvents(el);
                await sleep(180);
                if (dateValueMatches(el, date)) return true;

                nativeSet(el, '');
                fireTypingEvents(el);
                await pasteText(el, candidate);
                await sleep(180);
                if (dateValueMatches(el, date)) return true;
            }
        } finally {
            restoreReadonly();
        }
        return dateValueMatches(el, date);
    }

    function describeField(el) {
        if (!el) return 'yok';
        return `${el.tagName.toLowerCase()}#${el.id || '-'}[name=${el.getAttribute('name') || '-'}][type=${el.getAttribute('type') || '-'}][placeholder=${el.getAttribute('placeholder') || '-'}][aria=${el.getAttribute('aria-label') || '-'}] value="${String(el.value || '').trim()}"`;
    }

    async function fillField(el, value) {
        if (!el || !visible(el)) return false;
        el.scrollIntoView?.({ block: 'center', inline: 'nearest' });
        await sleep(50);
        el.focus?.();
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            try { el.select?.(); } catch {}
        }
        nativeSet(el, String(value));
        fire(el);
        await sleep(130);
        if (String(el.value).trim() === String(value).trim()) return true;
        try {
            el.focus?.();
            document.execCommand?.('selectAll', false, null);
            document.execCommand?.('insertText', false, String(value));
            fire(el);
        } catch {}
        await sleep(120);
        if (String(el.value).trim() === String(value).trim()) return true;
        nativeSet(el, String(value));
        fire(el);
        await sleep(100);
        return String(el.value).trim() === String(value).trim();
    }

    async function selectOption(select, desiredValues, desiredTextPatterns = []) {
        if (!select || !visible(select)) return false;
        const options = Array.from(select.options || []);
        const desired = Array.isArray(desiredValues) ? desiredValues.map(String) : [String(desiredValues)];
        let option = options.find(opt => desired.includes(String(opt.value)));
        if (!option) option = options.find(opt => desiredTextPatterns.some(pattern => pattern.test(low(opt.textContent || opt.label || opt.value))));
        if (!option) return false;
        return fillField(select, option.value);
    }

    function discountOptionSource(option) {
        return low(`${option?.textContent || ''} ${option?.label || ''} ${option?.value || ''}`);
    }

    function hasPercentSignal(value) {
        return /%|\bpercent(?:age)?\b|\bpct\b/.test(low(value));
    }

    function hasFixedAmountSignal(value) {
        const source = low(value);
        return /[$€£¥]|\b(?:usd|eur|gbp|dollars?|fixed(?: amount)?|money off|cash off)\b/.test(source)
            || (/\bamount\s+off\b/.test(source) && !hasPercentSignal(source));
    }

    function optionLooksPercentage(option) {
        const source = discountOptionSource(option);
        return hasPercentSignal(source) && !/^\s*[$€£¥]/.test(source);
    }

    function optionLooksFixedAmount(option) {
        const source = discountOptionSource(option);
        return hasFixedAmountSignal(source) && !hasPercentSignal(source);
    }

    function percentModeEvidence(refs) {
        if (!refs?.discountSelect) return false;
        const typeOption = refs.discountType?.selectedOptions?.[0] || null;
        const typeSource = low(`${refs.discountType?.value || ''} ${discountOptionSource(typeOption)}`);
        if (typeSource) {
            if (hasFixedAmountSignal(typeSource) && !hasPercentSignal(typeSource)) return false;
            if (hasPercentSignal(typeSource)) return true;
        }
        const selected = refs.discountSelect.selectedOptions?.[0] || null;
        if (selected) {
            if (optionLooksFixedAmount(selected)) return false;
            if (optionLooksPercentage(selected)) return true;
        }
        const optionSources = Array.from(refs.discountSelect.options || []).map(discountOptionSource);
        const surrounding = low(text(refs.discountSelect.closest?.('label, fieldset, section, div') || refs.discountSelect));
        const hasPercentOption = optionSources.some(source => hasPercentSignal(source));
        const hasOnlyFixedOptions = optionSources.length > 0 && optionSources.every(source => !hasPercentSignal(source) && hasFixedAmountSignal(source));
        if (hasOnlyFixedOptions) return false;
        return hasPercentOption && hasPercentSignal(surrounding) && !hasFixedAmountSignal(surrounding.replace(/percentage\s+off/g, ''));
    }

    async function ensureDiscountPercent(refs) {
        if (!refs?.discountSelect) return false;
        if (percentModeEvidence(refs)) return true;
        if (!refs.discountType) return false;
        const changed = await selectOption(refs.discountType, ['percent', 'percentage', 'pct'], [/^percentage\s+off$/, /\bpercent(?:age)?\b/, /%/]);
        if (!changed) return false;
        await sleep(180);
        return percentModeEvidence(getCreateSaleRefs());
    }
    async function setDiscount(refs, percent) {
        const desired = String(percent);
        if (!refs?.discountSelect) return { ok: false, message: 'Discount select bulunamadı.' };
        if (!percentModeEvidence(refs)) return { ok: false, message: 'İndirim alanının yüzde modunda olduğu kesin doğrulanamadı.' };
        const options = Array.from(refs.discountSelect.options || []);
        const preset = options.find(option => {
            const valueNumber = discountNumber(option.value);
            const textNumber = discountNumber(option.textContent || option.label);
            return optionLooksPercentage(option) && (Number(valueNumber) === Number(percent) || Number(textNumber) === Number(percent));
        });
        if (preset) {
            const selected = await fillField(refs.discountSelect, preset.value);
            await sleep(120);
            const fresh = getCreateSaleRefs();
            const current = fresh.discountSelect?.selectedOptions?.[0];
            const currentNumber = discountNumber(current?.textContent || current?.label || fresh.discountSelect?.value);
            return {
                ok: !!(selected && percentModeEvidence(fresh) && optionLooksPercentage(current) && Number(currentNumber) === Number(percent)),
                mode: 'preset',
                message: selected ? '' : 'Yüzde preset seçeneği seçilemedi.',
            };
        }

        const custom = options.find(option => /\bcustom\b|\bother\b|different|enter.*amount/.test(discountOptionSource(option)));
        if (!custom) return { ok: false, message: `Yüzde ${desired} preset veya güvenli custom seçeneği bulunamadı.` };
        const customOk = await fillField(refs.discountSelect, custom.value);
        await sleep(250);
        const fresh = getCreateSaleRefs();
        if (!customOk || !percentModeEvidence(fresh)) return { ok: false, message: 'Custom yüzde modu açılamadı.' };
        const input = fresh.customDiscountInput || refs.customDiscountInput;
        if (!input) return { ok: false, message: 'Custom yüzde alanı bulunamadı.' };
        if (!customPercentInputEvidence(input, fresh.discountSelect, fresh.root)) return { ok: false, message: 'Custom alanın yüzde değeri aldığı kesin doğrulanamadı.' };
        const inputOk = await fillField(input, desired);
        return { ok: !!(inputOk && String(input.value).trim() === desired && percentModeEvidence(getCreateSaleRefs())), mode: 'custom', message: inputOk ? '' : 'Custom yüzde değeri yazılamadı.' };
    }
    class SafetyStopError extends Error {
        constructor(message) {
            super(message);
            this.name = 'SafetyStopError';
        }
    }

    let shopIdentityMissingSince = 0;

    function scheduleStepDays(source) {
        return clamp(intVal(source?.saleDurationDays, 1), 1, 30);
    }

    function buildPlan(dateInput, source) {
        const start = dateInput instanceof Date ? dateInput : parseIso(String(dateInput || ''));
        if (!start || !source) return null;
        const discount = clamp(intVal(source.discount, DEFAULT_CONFIG.discount), 1, 90);
        const duration = scheduleStepDays(source);
        const promoEnd = addDays(start, duration - 1);
        const prefix = cleanCode(source.discountName).slice(0, 12);
        const year2 = pad2(start.getFullYear() % 100);
        const saleName = `${year2}${pad2(start.getMonth() + 1)}${pad2(start.getDate())}${prefix}${discount}`.slice(0, 20);
        const legacySaleName = `${pad2(start.getMonth() + 1)}${pad2(start.getDate())}${prefix}${discount}`.slice(0, 20);
        const shopId = source.shop?.shopId || 'unknown-shop';
        return {
            startDate: start,
            endDate: promoEnd,
            startDateIso: isoDate(start),
            endDateIso: isoDate(promoEnd),
            startDateInput: usDate(start),
            endDateInput: usDate(promoEnd),
            startShort: usShortDate(start),
            endShort: usShortDate(promoEnd),
            dayName: trWeekday(start),
            saleName,
            legacySaleName,
            discount,
            duration,
            idempotencyKey: `${shopId}:${isoDate(start)}:${saleName}`,
        };
    }

    function getProgressInfo(activeJob = job) {
        if (!activeJob?.batchStartDate || !activeJob?.batchEndDate) return { total: 0, completed: 0, currentIndex: 0, percent: 0 };
        const start = parseIso(activeJob.batchStartDate);
        const end = parseIso(activeJob.batchEndDate);
        const current = parseIso(activeJob.currentDate || activeJob.batchStartDate);
        if (!start || !end || !current) return { total: 0, completed: 0, currentIndex: 0, percent: 0 };
        const step = scheduleStepDays(activeJob);
        const span = Math.max(0, daysInclusive(start, end));
        const total = span ? Math.floor((span - 1) / step) + 1 : 0;
        const keys = new Set((activeJob.results || []).map(row => row.idempotencyKey || `${row.startDate}:${row.saleName}`));
        const completed = keys.size;
        const diff = Math.max(0, daysInclusive(start, current) - 1);
        const currentIndex = total ? clamp(Math.floor(diff / step) + 1, 1, total) : 0;
        return { total, completed, currentIndex, percent: total ? Math.round((completed / total) * 100) : 0 };
    }

    function currentPlan() {
        if (job?.currentDate) return buildPlan(job.currentDate, job);
        return buildPlan(config.batchStartDate, { ...config, shop: detectShopIdentity() || null });
    }

    function resultRow(plan, status, message, extras = {}, activeJob = job) {
        return {
            idempotencyKey: plan.idempotencyKey,
            status,
            message,
            saleName: extras.saleName || plan.saleName,
            discount: plan.discount,
            startDate: plan.startDateIso,
            endDate: plan.endDateIso,
            startDateInput: plan.startDateInput,
            endDateInput: plan.endDateInput,
            url: extras.url || '',
            verified: !!extras.verified,
            existing: !!extras.existing,
            shopId: activeJob?.shop?.shopId || '',
            shopName: activeJob?.shop?.shopName || '',
            createdAt: new Date().toISOString(),
        };
    }

    function upsertResult(results, row) {
        const list = Array.isArray(results) ? [...results] : [];
        const index = list.findIndex(item => (item.idempotencyKey && item.idempotencyKey === row.idempotencyKey) || (!item.idempotencyKey && item.startDate === row.startDate && item.saleName === row.saleName));
        if (index >= 0) list[index] = row;
        else list.push(row);
        return list;
    }

    function pendingVerificationEntry(plan, activeJob = job, message = '') {
        if (!plan?.idempotencyKey || !activeJob) return null;
        const submission = clone(activeJob.submission) || null;
        const formEvidence = clone(activeJob.formEvidence || submission?.formEvidence) || null;
        return {
            idempotencyKey: plan.idempotencyKey,
            startDate: plan.startDateIso,
            endDate: plan.endDateIso,
            saleName: plan.saleName,
            discount: plan.discount,
            countryValue: String(activeJob.countryValue ?? '0'),
            submission,
            formEvidence,
            successMessage: String(message || 'Etsy başarı adımı doğrulandı; toplu liste doğrulaması bekleniyor.'),
            queuedAt: new Date().toISOString(),
            lastVerificationMessage: '',
        };
    }

    function normalizePendingVerification(entry, activeJob) {
        if (!entry || typeof entry !== 'object' || !entry.startDate) return null;
        const plan = buildPlan(entry.startDate, activeJob);
        if (!plan) return null;
        const idempotencyKey = String(entry.idempotencyKey || plan.idempotencyKey);
        const saleName = String(entry.saleName || plan.saleName);
        if (idempotencyKey !== plan.idempotencyKey || saleName !== plan.saleName) return null;
        return {
            idempotencyKey,
            startDate: plan.startDateIso,
            endDate: plan.endDateIso,
            saleName,
            discount: plan.discount,
            countryValue: String(entry.countryValue ?? activeJob?.countryValue ?? '0'),
            submission: entry.submission && typeof entry.submission === 'object' ? clone(entry.submission) : null,
            formEvidence: entry.formEvidence && typeof entry.formEvidence === 'object' ? clone(entry.formEvidence) : null,
            successMessage: String(entry.successMessage || ''),
            queuedAt: String(entry.queuedAt || ''),
            lastVerificationMessage: String(entry.lastVerificationMessage || ''),
        };
    }

    function upsertPendingVerification(entries, entry) {
        const list = Array.isArray(entries) ? [...entries] : [];
        if (!entry?.idempotencyKey) return list;
        const index = list.findIndex(item => item?.idempotencyKey === entry.idempotencyKey);
        if (index >= 0) list[index] = entry;
        else list.push(entry);
        return list;
    }

    function normalizeCompletionAck(value, activeJob) {
        if (!value || typeof value !== 'object') return null;
        const idempotencyKey = String(value.idempotencyKey || '');
        const queued = (activeJob?.pendingVerifications || []).find(entry => entry?.idempotencyKey === idempotencyKey);
        if (!idempotencyKey || !queued) return null;
        const saleName = String(value.saleName || queued.saleName || '');
        const startDate = String(value.startDate || queued.startDate || '');
        if (saleName !== String(queued.saleName || '') || startDate !== String(queued.startDate || '')) return null;
        const originTabId = String(value.originTabId
            || queued.submission?.tabId
            || activeJob?.submission?.tabId
            || activeJob?.originTabId
            || '');
        if (!originTabId) return null;
        return {
            idempotencyKey,
            saleName,
            startDate,
            originTabId,
            queuedAt: String(value.queuedAt || queued.queuedAt || new Date().toISOString()),
            attempts: Math.max(0, intVal(value.attempts, 0)),
            lastAttemptAt: Math.max(0, Number(value.lastAttemptAt || 0)),
            waitStartedAt: Math.max(0, Number(value.waitStartedAt || 0)),
            navigationAttempts: Math.max(0, intVal(value.navigationAttempts, 0)),
            lastNavigationAt: Math.max(0, Number(value.lastNavigationAt || 0)),
            advanceAfterClose: value.advanceAfterClose !== false,
            resumePhase: String(value.resumePhase || ''),
            resumeNeedsPreflight: value.resumeNeedsPreflight === true,
            resumeNotBefore: Math.max(0, Number(value.resumeNotBefore || 0)),
        };
    }

    function planFromPendingVerification(entry, activeJob = job) {
        const plan = buildPlan(entry?.startDate, activeJob);
        if (!plan || plan.idempotencyKey !== entry?.idempotencyKey || plan.saleName !== entry?.saleName) return null;
        return plan;
    }

    function normalizeResult(row, activeJob) {
        if (!row || typeof row !== 'object') return null;
        const plan = row.startDate ? buildPlan(row.startDate, activeJob) : null;
        return {
            ...row,
            idempotencyKey: row.idempotencyKey || (plan ? `${activeJob.shop?.shopId || 'unknown-shop'}:${row.startDate}:${row.saleName || plan.saleName}` : randomId('legacy-result-')),
            shopId: row.shopId || activeJob.shop?.shopId || '',
            shopName: row.shopName || activeJob.shop?.shopName || '',
        };
    }

    function normalizeConfig(saved) {
        const next = { ...DEFAULT_CONFIG, ...(saved && typeof saved === 'object' ? saved : {}) };
        next.discount = clamp(intVal(next.discount, DEFAULT_CONFIG.discount), 1, 90);
        next.saleDurationDays = clamp(intVal(next.saleDurationDays, 1), 1, 30);
        next.discountName = cleanCode(next.discountName).slice(0, 12);
        next.countryValue = String(next.countryValue ?? '0');
        next.listingScope = 'all';
        next.autoResumeOnLoad = next.autoResumeOnLoad !== false;
        next.verifyTimeoutMs = clamp(intVal(next.verifyTimeoutMs, DEFAULT_CONFIG.verifyTimeoutMs), 15000, 45000);
        next.cooldownMinMs = clamp(intVal(next.cooldownMinMs, DEFAULT_CONFIG.cooldownMinMs), 1200, 10000);
        next.cooldownMaxMs = clamp(intVal(next.cooldownMaxMs, DEFAULT_CONFIG.cooldownMaxMs), next.cooldownMinMs, 15000);
        return next;
    }

    function migrateLegacyActiveJob(legacyJob) {
        const archived = Array.isArray(legacyJob?.results) ? legacyJob.results.map(row => ({ ...row })) : [];
        const startDate = legacyJob.batchStartDate || archived.map(row => row?.startDate).filter(Boolean).sort()[0] || legacyJob.currentDate || config.batchStartDate;
        return {
            schemaVersion: 5,
            version: VERSION,
            jobId: randomId('job-'),
            active: true,
            paused: true,
            pauseKind: 'legacy_reconcile',
            errorReason: `Eski sürümden ${archived.length} sonuç güvenilir başarı olarak taşınmadı. Seri ${startDate} tarihinden başlayarak Etsy üzerinde yeniden ön kontrolden geçirilecek; mevcut kampanyalar tekrar oluşturulmayacak. Doğru mağazayı açıp Devam Et düğmesine bas.`,
            pendingError: null,
            generation: 1,
            phase: 'preflight',
            phaseStartedAt: Date.now(),
            currentDate: startDate,
            batchStartDate: startDate,
            batchEndDate: legacyJob.batchEndDate || config.batchEndDate,
            saleDurationDays: clamp(intVal(legacyJob.saleDurationDays, 1), 1, 30),
            discount: clamp(intVal(legacyJob.discount, config.discount), 1, 90),
            discountName: cleanCode(legacyJob.discountName || config.discountName).slice(0, 12),
            countryValue: String(legacyJob.countryValue ?? config.countryValue ?? '0'),
            listingScope: 'all',
            listingScopeVerified: false,
            verifyTimeoutMs: clamp(intVal(legacyJob.verifyTimeoutMs, config.verifyTimeoutMs), 15000, 45000),
            cooldownMinMs: config.cooldownMinMs,
            cooldownMaxMs: config.cooldownMaxMs,
            shop: null,
            startedAt: legacyJob.startedAt || new Date().toISOString(),
            configSnapshot: { ...config, shop: null },
            results: [],
            pendingVerifications: [],
            batchVerifyState: null,
            completionAck: null,
            legacyAuditResults: archived,
            legacyReconcileStartDate: startDate,
            migratedFrom: legacyJob.version || '3.x',
            actionLedger: {},
            submission: null,
            needsPreflight: true,
            notBefore: 0,
            verifyState: null,
            openFormAttempts: 0,
            expectedNavigationUntil: 0,
            expectedNavigationPath: '',
        };
    }

    function sanitizeUntrustedReport(report, reason = 'Eski sürüm raporu Etsy üzerinde yeniden doğrulanmadı.') {
        if (!report || typeof report !== 'object') return null;
        const copy = clone(report) || {};
        copy.legacyUnverified = true;
        copy.trustNote = reason;
        copy.results = (Array.isArray(copy.results) ? copy.results : []).map(row => ({
            ...row,
            verified: false,
            existing: false,
            trust: 'legacy_unverified',
            message: `${reason} ${String(row?.message || '')}`.trim(),
        }));
        return copy;
    }

    function normalizePromotionIndex(index, activeJob) {
        if (!index || typeof index !== 'object' || !activeJob?.shop?.shopId) return null;
        if (String(index.shopId || '') !== String(activeJob.shop.shopId)) return null;
        if (!index.complete || !Array.isArray(index.records)) return null;
        return {
            shopId: String(index.shopId),
            complete: true,
            builtAt: Number(index.builtAt || 0),
            expiresAt: Number(index.expiresAt || 0),
            uses: Math.max(0, intVal(index.uses, 0)),
            pagesRead: Math.max(0, intVal(index.pagesRead, 0)),
            records: index.records.slice(0, 5000),
        };
    }

    async function loadState() {
        const savedV4 = await gmGet(STORAGE_KEY, null);
        const savedLegacy = savedV4 ? null : await gmGet(LEGACY_STORAGE_KEY, null);
        config = normalizeConfig(savedV4 || savedLegacy);
        if (!savedV4) await gmSet(STORAGE_KEY, config);

        job = await withStateLock(async () => {
            let current = await gmGet(JOB_KEY, null);
            if (!current) {
                const legacyJob = await gmGet(LEGACY_JOB_KEY, null);
                if (legacyJob?.active) {
                    current = migrateLegacyActiveJob(legacyJob);
                    await gmSet(LEGACY_JOB_KEY, { active: false, migratedTo: VERSION, migratedAt: new Date().toISOString() });
                }
            }
            if (!current) return null;

            const original = clone(current);
            const next = clone(current);
            const loadedVersion = String(next.version || '');
            const loadedSchemaVersion = intVal(next.schemaVersion, 0);
            const compatibleStateUpgrade = ['1.0.8', '1.0.9'].includes(loadedVersion) && loadedSchemaVersion === 5;
            next.schemaVersion = 5;
            next.jobId = next.jobId || randomId('job-');
            next.generation = intVal(next.generation, 1);
            next.results = (next.results || []).map(row => normalizeResult(row, next)).filter(Boolean);
            next.pendingVerifications = (Array.isArray(next.pendingVerifications) ? next.pendingVerifications : [])
                .map(entry => normalizePendingVerification(entry, next))
                .filter(Boolean);
            next.batchVerifyState = next.batchVerifyState && typeof next.batchVerifyState === 'object'
                ? next.batchVerifyState
                : null;
            next.completionAck = normalizeCompletionAck(next.completionAck, next);

            // v1.0.8/v1.0.9 could persist the completed campaign and advance the active
            // date while leaving Etsy's success dialog open. Recover that durable queue
            // without treating the old dialog as proof for the new active date.
            if (next.active && compatibleStateUpgrade && !next.completionAck && next.pendingVerifications.length && !next.submission) {
                const orderedPending = [...next.pendingVerifications]
                    .sort((left, right) => String(left?.queuedAt || '').localeCompare(String(right?.queuedAt || '')));
                const queued = orderedPending[orderedPending.length - 1];
                const resumePhase = next.phase === 'batch_verify' ? 'batch_verify' : 'preflight';
                next.completionAck = normalizeCompletionAck({
                    idempotencyKey: queued?.idempotencyKey,
                    saleName: queued?.saleName,
                    startDate: queued?.startDate,
                    originTabId: queued?.submission?.tabId || next.originTabId || TAB_ID,
                    queuedAt: queued?.queuedAt,
                    advanceAfterClose: false,
                    resumePhase,
                    resumeNeedsPreflight: resumePhase === 'preflight',
                    resumeNotBefore: next.notBefore,
                }, next);
                if (next.completionAck) {
                    next.phase = 'ack_complete';
                    next.needsPreflight = false;
                    next.notBefore = 0;
                    next.verifyState = null;
                    next.expectedNavigationUntil = 0;
                    next.expectedNavigationPath = '';
                }
            }
            // Invalidate every in-flight token held by an older userscript instance. The
            // generation change is visible across tabs even when the recovered job remains
            // active, preventing v1.0.8/v1.0.9 code from writing over the acknowledgement.
            if (next.active && compatibleStateUpgrade && loadedVersion !== VERSION) {
                next.generation = Number(next.generation || 0) + 1;
            }
            next.actionLedger = next.actionLedger && typeof next.actionLedger === 'object' ? next.actionLedger : {};
            const ambiguousNonFinalReservations = Object.entries(next.actionLedger).filter(([, record]) => record?.status === 'reserved' && (!next.submission?.reservationId || record.reservationId !== next.submission.reservationId) && (record.owner !== INSTANCE_ID || Date.now() - Number(record.at || 0) >= NON_FINAL_RESERVATION_TTL_MS));
            if (next.active && ambiguousNonFinalReservations.length) {
                ambiguousNonFinalReservations.forEach(([key]) => { delete next.actionLedger[key]; });
                next.paused = true;
                next.pauseKind = 'action_reservation_recovery';
                next.errorReason = `${ambiguousNonFinalReservations.length} adet Continue/Review rezervasyonu tıklama kesinleşmeden yarım kalmış. Rezervasyonlar temizlendi; Devam Et sayfanın gerçek aşamasını uzlaştıracak.`;
                next.generation = Number(next.generation || 0) + 1;
            }
            next.verifyTimeoutMs = clamp(intVal(next.verifyTimeoutMs, config.verifyTimeoutMs), 15000, 45000);
            next.cooldownMinMs = clamp(intVal(next.cooldownMinMs, config.cooldownMinMs), 1200, 10000);
            next.cooldownMaxMs = clamp(intVal(next.cooldownMaxMs, config.cooldownMaxMs), next.cooldownMinMs, 15000);
            next.listingScope = 'all';
            next.listingScopeVerified = next.listingScopeVerified && typeof next.listingScopeVerified === 'object' ? next.listingScopeVerified : false;

            if (next.active && loadedVersion !== VERSION && !compatibleStateUpgrade) {
                const archived = Array.isArray(next.results) ? next.results.map(row => ({ ...row })) : [];
                const reconcileStart = next.batchStartDate || archived.map(row => row?.startDate).filter(Boolean).sort()[0] || next.currentDate || config.batchStartDate;
                next.legacyAuditResults = [...(Array.isArray(next.legacyAuditResults) ? next.legacyAuditResults : []), ...archived];
                next.results = [];
                next.legacyReconcileStartDate = reconcileStart;
                next.paused = true;
                next.pauseKind = 'upgrade_reconcile';
                next.errorReason = `v${loadedVersion} işindeki ${archived.length} eski sonuç güvenilir kabul edilmedi. Devam edildiğinde ${reconcileStart} tarihinden başlayarak bütün günler Etsy'de yeniden ön kontrolden geçirilecek.`;
                next.generation += 1;
                next.actionLedger = {};
                next.listingScopeVerified = false;
                next.needsPreflight = true;
                next.verifyState = null;
                next.pendingVerifications = [];
                next.batchVerifyState = null;
                next.completionAck = null;
                next.promotionIndex = null;
                if (['submitted', 'reserved'].includes(next.submission?.status)) {
                    next.phase = 'verify_created';
                    next.reconcileAfterSubmitted = true;
                } else {
                    next.currentDate = reconcileStart;
                    next.phase = 'preflight';
                    next.submission = null;
                }
            } else next.promotionIndex = null;

            if (!next.active && next.terminalStatus && loadedVersion !== VERSION) {
                const sanitized = sanitizeUntrustedReport({ results: next.results }, `v${loadedVersion || 'eski'} terminal iş sonuçları Etsy üzerinde yeniden doğrulanmadı.`);
                next.results = sanitized?.results || [];
                next.legacyUnverified = true;
                next.trustNote = sanitized?.trustNote || '';
            }

            next.version = VERSION;
            if (next.active && next.submission?.status === 'reserved' && !next.paused) {
                next.paused = true;
                next.pauseKind = 'submission_ambiguous';
                next.errorReason = 'Final onay için rezervasyon kaydı bulundu ancak gerçek tıklama kesinleştirilemedi. Duplicate riskine karşı final tekrar tıklanmayacak; Devam Et yalnızca Etsy listesinden doğrulama yapacak.';
                next.phase = 'verify_created';
                next.generation += 1;
            }
            if (next.active && !next.shop?.shopId) {
                next.paused = true;
                if (!['legacy_reconcile', 'upgrade_reconcile'].includes(next.pauseKind)) {
                    next.pauseKind = 'shop_identity_missing';
                    next.errorReason = 'Aktif işin mağaza kimliği yok. Doğru Etsy mağazasındayken yeniden devam ettir.';
                }
            }
            const expectedNavigation = Number(next.expectedNavigationUntil || 0) > Date.now()
                && (!next.expectedNavigationPath || location.pathname.includes(next.expectedNavigationPath));
            if (next.active && !config.autoResumeOnLoad && !next.paused && !expectedNavigation) {
                next.paused = true;
                next.pauseKind = 'resume_required';
                next.errorReason = 'Otomatik devam kapalı. Sayfa yüklendi; devam etmek için Devam Et düğmesine bas.';
                next.generation += 1;
            }
            if (expectedNavigation) {
                next.expectedNavigationUntil = 0;
                next.expectedNavigationPath = '';
            }
            next.updatedAt = next.updatedAt || new Date().toISOString();
            if (JSON.stringify(next) !== JSON.stringify(original)) await gmSet(JOB_KEY, next);
            return next;
        });

        const currentReport = await gmGet(REPORT_KEY, null);
        const legacyReport = currentReport ? null : await gmGet(LEGACY_REPORT_KEY, null);
        const loadedReport = currentReport || legacyReport;
        lastReport = loadedReport && String(loadedReport.version || '') === VERSION && !loadedReport.legacyUnverified
            ? loadedReport
            : sanitizeUntrustedReport(loadedReport, `v${loadedReport?.version || 'eski'} raporu Etsy üzerinde yeniden doğrulanmadı; doğrulama alanları güvenilir kabul edilmedi.`);
    }
    async function saveConfig() {
        await gmSet(STORAGE_KEY, config);
        renderPanel();
    }

    function samePanelJobState(previous, next) {
        try { return JSON.stringify(previous ?? null) === JSON.stringify(next ?? null); }
        catch { return false; }
    }

    function markPanelRenderedState() {
        try { lastRenderedJobSignature = JSON.stringify(job ?? null); }
        catch { lastRenderedJobSignature = null; }
        lastRenderedLeaseOwned = leaseOwned;
    }

    async function refreshJob() {
        const fresh = await gmGet(JOB_KEY, null);
        job = fresh;
        const panelMissing = !panelEl || !panelEl.isConnected || !panelEl.firstElementChild;
        let jobChanged = true;
        try { jobChanged = lastRenderedJobSignature !== JSON.stringify(fresh ?? null); }
        catch {}
        if (panelMissing || jobChanged || lastRenderedLeaseOwned !== leaseOwned) renderPanel();
        return job;
    }

    async function saveReport(report) {
        lastReport = report;
        await gmSet(REPORT_KEY, report);
        const history = await gmGet(REPORT_HISTORY_KEY, []);
        const existing = Array.isArray(history) ? history : [];
        const next = [report, ...existing.filter(item => !report?.jobId || item?.jobId !== report.jobId)].slice(0, 20);
        await gmSet(REPORT_HISTORY_KEY, next);
        renderPanel();
    }

    function ensureToastRoot() {
        let root = document.getElementById(TOAST_ID);
        if (!root) {
            root = document.createElement('div');
            root.id = TOAST_ID;
            document.documentElement.appendChild(root);
        }
        return root;
    }

    function toast(message, type = 'info', duration = 3400) {
        if (!isSupportedRoute()) return;
        const root = ensureToastRoot();
        const node = document.createElement('div');
        node.className = `eda-toast ${type}`;
        node.textContent = message;
        root.appendChild(node);
        requestAnimationFrame(() => node.classList.add('show'));
        setTimeout(() => { node.classList.remove('show'); setTimeout(() => node.remove(), 220); }, duration);
    }

    function setStatus(message) { if (statusEl) statusEl.textContent = message; }
    function isCreateSalePath() { return /\/your\/shops\/me\/sales-discounts\/step\/createSale\/?$/.test(location.pathname); }
    function isPromotionsHomePath() { return /\/your\/shops\/me\/sales-discounts\/?$/.test(location.pathname); }
    function isDetailsStatsPath() { return /\/your\/shops\/me\/sales-discounts\/details-stats\/?$/.test(location.pathname); }
    function isVerificationPath() { return isDetailsStatsPath(); }
    function go(url) {
        if (location.href === url) return;
        let expectedPath = '';
        try { expectedPath = new URL(url, location.href).pathname; } catch {}
        markLeaseHandoff(job?.jobId || '', expectedPath);
        location.assign(url);
    }

    function findRunSaleLink() {
        const links = allVisible(document, 'a[href*="/sales-discounts/step/createSale"]');
        const scored = links.map(link => {
            const card = link.closest('.wt-card, .wt-grid__item, section, div') || link;
            const cardText = low(text(card));
            let score = 0;
            if (/run a sale/.test(cardText)) score += 10;
            if (/set lower prices/.test(cardText)) score += 4;
            if (/set up/.test(low(text(link)))) score += 2;
            return { link, score };
        }).sort((a, b) => b.score - a.score);
        return scored[0]?.link || null;
    }

    function makeToken(activeJob = job) {
        if (!activeJob) return null;
        return {
            jobId: activeJob.jobId,
            generation: Number(activeJob.generation || 0),
            currentDate: activeJob.currentDate,
        };
    }

    function validateFreshForToken(fresh, token, options = {}) {
        if (!fresh?.active) throw new AutomationCancelledError('Aktif iş artık yok.');
        if (!token || fresh.jobId !== token.jobId || Number(fresh.generation || 0) !== Number(token.generation || 0) || fresh.currentDate !== token.currentDate) {
            throw new AutomationCancelledError('İş durumu başka bir işlem tarafından değiştirildi.');
        }
        if (fresh.paused && !options.allowPaused) throw new AutomationCancelledError('İş duraklatıldı.');
        return fresh;
    }

    async function assertTokenFresh(token, options = {}) {
        assertForegroundTab();
        const fresh = validateFreshForToken(await gmGet(JOB_KEY, null), token, options);
        if (options.requireLease !== false && !(await acquireLease(fresh))) throw new AutomationCancelledError('Bu sekme artık iş sahibi değil.');
        assertForegroundTab();
        if (options.requireShop !== false) {
            const identity = detectShopIdentity(true);
            if (!identity?.shopId) throw new SafetyStopError('Etsy mağaza kimliği okunamadı; yanlış mağazada işlem riskine karşı durduruldu.');
            if (!sameShop(fresh.shop, identity)) throw new SafetyStopError(`Mağaza değişti. İş ${shopLabel(fresh.shop)} için; açık sayfa ${shopLabel(identity)}.`);
        }
        if (options.requireOverlayClear !== false) assertNoBlockingForeignOverlay();
        job = fresh;
        return fresh;
    }

    async function mutateJob(token, mutator, options = {}) {
        return await withStateLock(async () => {
            const fresh = validateFreshForToken(await gmGet(JOB_KEY, null), token, options);
            const next = clone(fresh);
            await mutator(next, fresh);
            next.updatedAt = new Date().toISOString();
            await gmSet(JOB_KEY, next);
            job = next;
            renderPanel();
            try { stateChannel?.postMessage({ type: 'state', jobId: next.jobId, generation: next.generation, phase: next.phase, paused: next.paused }); } catch {}
            return next;
        });
    }

    async function setPhase(phase, extras = {}, token = makeToken()) {
        if (!token) return null;
        const updated = await mutateJob(token, next => {
            next.phase = phase;
            next.phaseStartedAt = Date.now();
            Object.assign(next, extras);
        });
        scheduleTransitionTick(35);
        return updated;
    }

    function actionKey(plan, actionName) { return `${plan.idempotencyKey}:${actionName}`; }
    function actionRecord(activeJob, plan, actionName) { return activeJob?.actionLedger?.[actionKey(plan, actionName)] || null; }
    function actionIsRecent(activeJob, plan, actionName, grace = ACTION_GRACE_MS) {
        const record = actionRecord(activeJob, plan, actionName);
        const lastAttemptAt = Number(record?.clickedAt || record?.at || 0);
        return !!(lastAttemptAt && Date.now() - lastAttemptAt < grace);
    }

    async function markError(plan, reason, pauseKind = 'runtime_error', telemetryCode = '') {
        if (TELEMETRY_ALLOWED_ERROR_CODES.has(telemetryCode)) void trackTelemetryError(telemetryCode);
        const message = String(reason || 'Bilinmeyen hata');
        const currentJobId = job?.jobId;
        const currentDate = plan?.startDateIso || job?.currentDate;
        const next = await withStateLock(async () => {
            const fresh = await gmGet(JOB_KEY, null);
            if (!fresh?.active || (currentJobId && fresh.jobId !== currentJobId) || (currentDate && fresh.currentDate !== currentDate)) return null;
            const changed = clone(fresh);
            changed.paused = true;
            changed.pauseKind = pauseKind;
            changed.errorReason = message;
            changed.errorAt = new Date().toISOString();
            changed.pendingError = plan ? resultRow(plan, 'ERROR', message, {}, fresh) : null;
            changed.generation = Number(changed.generation || 0) + 1;
            changed.expectedNavigationUntil = 0;
            changed.expectedNavigationPath = '';
            await gmSet(JOB_KEY, changed);
            return changed;
        });
        if (!next) return;
        job = next;
        abortAutomation('paused');
        await releaseLease();
        renderPanel();
        setStatus(`Seri duraklatıldı${plan ? `: ${plan.saleName}` : ''}\n${message}\nYeniden Dene veya Bu Günü Atla seçeneğini kullan.`);
        toast(`Hata: ${plan?.saleName || 'aktif iş'} — seri duraklatıldı.`, 'error', 7000);
        try { stateChannel?.postMessage({ type: 'cancel', jobId: next.jobId, generation: next.generation }); } catch {}
    }

    function nextScheduleDate(activeJob, currentIso) {
        const date = parseIso(currentIso);
        return date ? isoDate(addDays(date, scheduleStepDays(activeJob))) : null;
    }

    function batchCompleteAt(activeJob, dateIso) {
        const date = parseIso(dateIso);
        const end = parseIso(activeJob?.batchEndDate);
        return !date || !end || date.getTime() > end.getTime();
    }

    function randomCooldown(activeJob) {
        const min = clamp(intVal(activeJob?.cooldownMinMs, config.cooldownMinMs), 1200, 10000);
        const max = clamp(intVal(activeJob?.cooldownMaxMs, config.cooldownMaxMs), min, 15000);
        return min + Math.floor(Math.random() * (max - min + 1));
    }

    async function finalizeTerminalJob(expectedJobId = null, showReport = true) {
        const finalized = await withStateLock(async () => {
            const terminal = await gmGet(JOB_KEY, null);
            if (!terminal || terminal.active || !terminal.terminalStatus || (expectedJobId && terminal.jobId !== expectedJobId)) return null;
            const report = {
                version: VERSION,
                status: terminal.terminalStatus,
                jobId: terminal.jobId,
                shop: terminal.shop || null,
                startedAt: terminal.startedAt,
                finishedAt: terminal.finishedAt || new Date().toISOString(),
                configSnapshot: terminal.configSnapshot || {},
                results: Array.isArray(terminal.results) ? terminal.results : [],
                legacyAuditResults: Array.isArray(terminal.legacyAuditResults) ? terminal.legacyAuditResults : [],
                legacyUnverified: !!terminal.legacyUnverified,
                trustNote: terminal.trustNote || '',
            };
            await gmSet(REPORT_KEY, report);
            const history = await gmGet(REPORT_HISTORY_KEY, []);
            const existing = Array.isArray(history) ? history : [];
            await gmSet(REPORT_HISTORY_KEY, [report, ...existing.filter(item => item?.jobId !== report.jobId)].slice(0, 20));
            await gmDelete(JOB_KEY);
            return { report, terminalJobId: terminal.jobId };
        });
        if (!finalized) {
            job = await gmGet(JOB_KEY, null);
            renderPanel();
            return false;
        }
        const { report, terminalJobId } = finalized;
        lastReport = report;
        job = null;
        abortAutomation('finished');
        await releaseLease(terminalJobId);
        if (report.status === 'completed' && report.results.length > 0 && report.results.every(row => row.status === 'SUCCESS')) {
            void trackTelemetry('sale_series_completed');
        }
        renderPanel();
        const ok = report.results.filter(row => row.status === 'SUCCESS').length;
        const err = report.results.filter(row => row.status === 'ERROR').length;
        const stopped = report.results.filter(row => row.status === 'STOPPED').length;
        toast(`Seri ${report.status === 'stopped' ? 'durduruldu' : 'bitti'}. Başarılı: ${ok}, Hata: ${err}, Durdurulan: ${stopped}`, err ? 'warning' : 'success', 6200);
        if (showReport) openReport(report, true);
        return true;
    }

    async function commitDayResult(plan, row) {
        const token = makeToken();
        if (!token) return;
        const committed = await withStateLock(async () => {
            const fresh = validateFreshForToken(await gmGet(JOB_KEY, null), token, { allowPaused: true });
            const next = clone(fresh);
            next.results = upsertResult(next.results, row);
            next.pendingError = null;
            next.errorReason = '';
            next.errorAt = '';
            next.pauseKind = '';
            next.paused = false;
            next.generation = Number(next.generation || 0) + 1;
            const completedDate = next.currentDate;
            const scheduledNextDate = nextScheduleDate(next, next.currentDate);
            const nextDate = next.reconcileAfterSubmitted && next.legacyReconcileStartDate ? next.legacyReconcileStartDate : scheduledNextDate;
            next.reconcileAfterSubmitted = false;
            next.actionLedger = {};
            next.listingScopeVerified = false;
            next.completionAck = null;
            next.submission = null;
            next.formEvidence = null;
            next.verifyState = null;
            next.needsPreflight = true;
            next.legacyPreflightDate = null;
            next.openFormAttempts = 0;
            next.phaseStartedAt = Date.now();
            next.notBefore = Date.now() + randomCooldown(next);
            if (batchCompleteAt(next, nextDate)) {
                if (Array.isArray(next.pendingVerifications) && next.pendingVerifications.length) {
                    next.currentDate = completedDate;
                    next.active = true;
                    next.phase = 'batch_verify';
                    next.needsPreflight = false;
                    next.batchVerifyState = next.batchVerifyState || { startedAt: Date.now(), attempts: 0, nextFetchAt: Date.now() + 700 };
                    next.notBefore = Date.now() + 700;
                } else {
                    next.currentDate = completedDate;
                    next.active = false;
                    next.terminalStatus = 'completed';
                    next.finishedAt = new Date().toISOString();
                    next.phase = 'completed';
                }
                next.expectedNavigationUntil = 0;
                next.expectedNavigationPath = '';
            } else {
                next.currentDate = nextDate;
                next.active = true;
                next.phase = 'preflight';
                next.expectedNavigationUntil = 0;
                next.expectedNavigationPath = '';
            }
            next.updatedAt = new Date().toISOString();
            await gmSet(JOB_KEY, next);
            return next;
        });
        job = committed;
        abortAutomation('day-committed');
        if (!committed.active) {
            await finalizeTerminalJob(committed.jobId, true);
            return;
        }
        resetAutomationController();
        toast(`${row.status === 'SUCCESS' ? 'Tamamlandı' : 'Atlandı'}: ${row.saleName}`, row.status === 'SUCCESS' ? 'success' : 'warning', 3000);
        if (committed.phase === 'batch_verify') {
            go(DETAILS_STATS_URL);
            return;
        }
        setTimeout(() => processTick(), 80);
    }

    function completionAckQueueEntry(activeJob, ack = activeJob?.completionAck) {
        if (!ack?.idempotencyKey) return null;
        return (activeJob?.pendingVerifications || []).find(entry => entry?.idempotencyKey === ack.idempotencyKey) || null;
    }

    function validCompletionDoneButton(button, refs = null) {
        if (!(button?.isConnected && actionable(button))) return false;
        if (refs?.ambiguous || detectFlowStage(refs) !== 'complete' || refs?.doneButton !== button) return false;
        if (refs?.structuredStep) return structuredSaleStepActionMatches(button, 'done', refs);
        return /^done$/i.test(buttonLabel(button)) && !actionBadShell(button, 'done');
    }

    function completionModalGone(refs, previousRoot = null) {
        if (!refs || refs.hydrating || refs.ambiguous) return false;
        if (detectFlowStage(refs) === 'complete') return false;
        const liveStep = getStructuredSaleStepRefs(null, { includeErrors: false });
        if (liveStep?.stage === 'complete' || liveStep?.ambiguous) return false;
        const liveShell = currentSaleOverlayShell();
        // During acknowledgement, any still-visible Etsy sale overlay means the old success
        // surface has not safely yielded yet. This also covers localized/experiment variants
        // whose copy and success attributes are unknown to the adapter.
        if (liveShell && visible(liveShell)) return false;
        if (previousRoot && previousRoot.isConnected === false) return true;
        return ['form', 'listings', 'review', 'verification', 'home'].includes(detectFlowStage(refs));
    }

    function completionAckNavigationTarget(activeJob, ack) {
        if (ack?.advanceAfterClose === false) {
            return ack.resumePhase === 'batch_verify' ? DETAILS_STATS_URL : PROMOTIONS_URL;
        }
        const nextDate = nextScheduleDate(activeJob, ack?.startDate || activeJob?.currentDate);
        return batchCompleteAt(activeJob, nextDate) ? DETAILS_STATS_URL : PROMOTIONS_URL;
    }

    async function pauseCompletionAck(reason) {
        const currentJobId = job?.jobId;
        const stopped = await withStateLock(async () => {
            const fresh = await gmGet(JOB_KEY, null);
            if (!fresh?.active || fresh.jobId !== currentJobId) return null;
            if (!completionAckQueueEntry(fresh) && fresh.phase !== 'ack_complete') return null;
            const next = clone(fresh);
            next.paused = true;
            next.pauseKind = 'completion_ack_failed';
            next.errorReason = String(reason || 'Etsy başarı penceresi güvenli biçimde kapatılamadı.');
            next.errorAt = new Date().toISOString();
            next.pendingError = null;
            next.generation = Number(next.generation || 0) + 1;
            next.expectedNavigationUntil = 0;
            next.expectedNavigationPath = '';
            next.updatedAt = new Date().toISOString();
            await gmSet(JOB_KEY, next);
            return next;
        });
        if (!stopped) return false;
        job = stopped;
        abortAutomation('completion-ack-failed');
        await releaseLease();
        renderPanel();
        setStatus(`Seri duraklatıldı\n${stopped.errorReason}\nKampanya yeniden gönderilmeyecek. Başarı penceresini kapatıp Yeniden Dene seçeneğini kullan.`);
        toast('Etsy başarı penceresi kapatılamadı; yeni güne geçilmedi.', 'error', 7000);
        return true;
    }

    async function finishCompletionAck() {
        const token = makeToken();
        if (!token) return null;
        const committed = await withStateLock(async () => {
            const fresh = validateFreshForToken(await gmGet(JOB_KEY, null), token);
            const ack = normalizeCompletionAck(fresh.completionAck, fresh);
            const queued = completionAckQueueEntry(fresh, ack);
            if (!ack || !queued) throw new SafetyStopError('Başarı penceresi onay kaydı doğrulama kuyruğuyla eşleşmiyor. Yeni güne geçilmedi.');
            if (ack.originTabId !== TAB_ID) throw new AutomationCancelledError('Başarı penceresi yalnız onu oluşturan Etsy sekmesinde kapatılabilir.');
            const next = clone(fresh);
            next.completionAck = null;
            next.expectedNavigationUntil = 0;
            next.expectedNavigationPath = '';

            if (ack.advanceAfterClose === false) {
                next.phase = ack.resumePhase === 'batch_verify' ? 'batch_verify' : 'preflight';
                next.needsPreflight = next.phase === 'preflight' ? true : ack.resumeNeedsPreflight;
                next.notBefore = Math.max(0, Number(ack.resumeNotBefore || 0));
                if (next.phase === 'preflight') {
                    next.submission = null;
                    next.formEvidence = null;
                    next.verifyState = null;
                    next.actionLedger = {};
                    next.listingScopeVerified = false;
                }
            } else {
                if (fresh.currentDate !== ack.startDate
                    || !['submitted', 'reserved'].includes(fresh.submission?.status)
                    || fresh.submission?.idempotencyKey !== ack.idempotencyKey) {
                    throw new SafetyStopError('Kapatılan başarı penceresi aktif gönderim kaydıyla eşleşmiyor. Tarih ilerletilmedi.');
                }
                const completedDate = ack.startDate;
                const nextDate = nextScheduleDate(next, completedDate);
                const creationComplete = batchCompleteAt(next, nextDate);
                next.actionLedger = {};
                next.listingScopeVerified = false;
                next.submission = null;
                next.formEvidence = null;
                next.verifyState = null;
                next.legacyPreflightDate = null;
                next.openFormAttempts = 0;
                next.phaseStartedAt = Date.now();
                if (creationComplete) {
                    next.currentDate = completedDate;
                    next.phase = 'batch_verify';
                    next.needsPreflight = false;
                    next.batchVerifyState = { startedAt: Date.now(), attempts: 0, nextFetchAt: Date.now() + 700 };
                    next.notBefore = Date.now() + 700;
                } else {
                    next.currentDate = nextDate;
                    next.phase = 'preflight';
                    next.needsPreflight = true;
                    next.notBefore = Date.now() + randomCooldown(next);
                }
            }

            next.generation = Number(next.generation || 0) + 1;
            if (next.phase === 'batch_verify') {
                next.expectedNavigationUntil = Date.now() + 18000;
                next.expectedNavigationPath = '/sales-discounts/details-stats';
            } else if (next.phase === 'preflight' && !isPromotionsHomePath()) {
                next.expectedNavigationUntil = Date.now() + 18000;
                next.expectedNavigationPath = '/your/shops/me/sales-discounts';
            }
            next.updatedAt = new Date().toISOString();
            await gmSet(JOB_KEY, next);
            return next;
        });
        job = committed;
        abortAutomation('completion-acknowledged');
        resetAutomationController();
        renderPanel();
        if (committed.phase === 'batch_verify') {
            if (!isDetailsStatsPath()) go(DETAILS_STATS_URL);
            else scheduleTransitionTick(0);
        } else if (committed.phase === 'preflight' && !isPromotionsHomePath()) {
            go(PROMOTIONS_URL);
        } else {
            scheduleTransitionTick(0);
        }
        return committed;
    }

    async function navigateAwayFromCompletionAck(reason = '') {
        const token = makeToken();
        if (!token) return false;
        const updated = await mutateJob(token, next => {
            const ack = normalizeCompletionAck(next.completionAck, next);
            if (!ack || !completionAckQueueEntry(next, ack)) throw new SafetyStopError('Başarı penceresi onay kaydı doğrulama kuyruğuyla eşleşmiyor.');
            if (ack.originTabId !== TAB_ID) throw new AutomationCancelledError('Başarı penceresi yalnız onu oluşturan Etsy sekmesinde kapatılabilir.');
            ack.navigationAttempts += 1;
            ack.lastNavigationAt = Date.now();
            next.completionAck = ack;
            const target = completionAckNavigationTarget(next, ack);
            next.expectedNavigationUntil = Date.now() + 18000;
            next.expectedNavigationPath = new URL(target, location.href).pathname;
        });
        const ack = updated.completionAck;
        if (ack.navigationAttempts > 3) {
            await pauseCompletionAck(`${reason || 'Done düğmesi veya modal kapanışı doğrulanamadı.'} Güvenli sayfa geçişi de ${ack.navigationAttempts} kez tamamlanamadı.`);
            return false;
        }
        const target = completionAckNavigationTarget(updated, ack);
        setStatus(`${ack.saleName || 'Oluşturulan kampanya'} kaydedildi; başarı penceresi kapanmadığı için güvenli Etsy sayfasına geçiliyor. Yeni kampanya başlatılmayacak.`);
        const targetPath = new URL(target, location.href).pathname;
        if (normalizePathname(location.pathname) === normalizePathname(targetPath)) {
            markLeaseHandoff(updated.jobId || '', targetPath);
            try { location.reload(); }
            catch { location.assign(`${target}${target.includes('?') ? '&' : '?'}makaytron_ack=${Date.now()}`); }
        } else {
            go(target);
        }
        return true;
    }

    async function handleCompletionAck(initialRefs = null, refsFactory = getCreateSaleRefs, options = {}) {
        const active = await gmGet(JOB_KEY, null);
        if (!active?.active) return false;
        job = active;
        const ack = normalizeCompletionAck(active.completionAck, active);
        if (!ack || !completionAckQueueEntry(active, ack)) {
            await pauseCompletionAck('Başarı penceresi bekleme aşaması var ancak buna ait kalıcı doğrulama kuyruğu bulunamadı.');
            return true;
        }
        if (ack.originTabId !== TAB_ID) {
            setStatus(`Başarı penceresi başka Etsy sekmesinde bekleniyor: ${ack.saleName}\nBu sekme modalı kapatmayacak ve tarihi ilerletmeyecek.`);
            if (leaseOwned) await releaseLease(active.jobId);
            return true;
        }

        let refs = initialRefs || refsFactory();
        if (completionModalGone(refs)) {
            await finishCompletionAck();
            return true;
        }
        // A recorded acknowledgement attempt is a durable exactly-once boundary. If Etsy
        // kept or recreated the modal after that attempt, do not click Done again; leave via
        // the non-creating Sales & Discounts route while retaining the acknowledgement.
        if (ack.attempts > 0) {
            await navigateAwayFromCompletionAck('Done düğmesine daha önce tıklandı ancak başarı penceresi hâlâ açık görünüyor. Düğme tekrar tıklanmayacak.');
            return true;
        }
        const buttonTimeout = Math.max(100, Number(options.buttonTimeout || 2400));
        const closeTimeout = Math.max(100, Number(options.closeTimeout || 3200));
        if (detectFlowStage(refs) !== 'complete') {
            const waitStartedAt = Math.max(0, Number(ack.waitStartedAt || 0));
            if (!waitStartedAt) {
                const token = makeToken();
                await mutateJob(token, next => {
                    const current = normalizeCompletionAck(next.completionAck, next);
                    if (!current || !completionAckQueueEntry(next, current)) throw new SafetyStopError('Başarı penceresi beklenirken kalıcı onay kaydı değişti.');
                    current.waitStartedAt = Date.now();
                    next.completionAck = current;
                });
            } else if (Date.now() - waitStartedAt >= buttonTimeout) {
                await navigateAwayFromCompletionAck('Etsy başarı penceresi yapısal olarak tanınamadı veya tamamen yüklenmedi.');
                return true;
            }
            setStatus(`Etsy başarı penceresinin yüklenmesi bekleniyor: ${ack.saleName}`);
            scheduleTransitionTick(120);
            return true;
        }

        setStatus(`Oluşturuldu: ${ack.saleName}\nDone düğmesi bekleniyor; pencere kapanmadan sonraki güne geçilmeyecek.`);
        let observed = await waitFor(() => {
            const freshRefs = refsFactory();
            if (completionModalGone(freshRefs, refs?.root)) return { type: 'closed', refs: freshRefs };
            refs = freshRefs;
            return validCompletionDoneButton(freshRefs?.doneButton, freshRefs)
                ? { type: 'button', refs: freshRefs, button: freshRefs.doneButton }
                : null;
        }, buttonTimeout, 75);
        if (observed?.type === 'closed') {
            await finishCompletionAck();
            return true;
        }
        if (!observed?.button) {
            await navigateAwayFromCompletionAck('Etsy başarı penceresinde güvenilir Done düğmesi bulunamadı.');
            return true;
        }

        const token = makeToken();
        let doneAttemptReserved = false;
        await mutateJob(token, next => {
            const current = normalizeCompletionAck(next.completionAck, next);
            if (!current || !completionAckQueueEntry(next, current)) throw new SafetyStopError('Done tıklamasından önce başarı kaydı değişti.');
            if (current.attempts > 0) return;
            current.attempts += 1;
            current.lastAttemptAt = Date.now();
            next.completionAck = current;
            doneAttemptReserved = true;
            // Done can perform a full navigation. Mark the whole Sales & Discounts route
            // as expected before clicking so auto-resume=false cannot pause mid-transition.
            next.expectedNavigationUntil = Date.now() + 18000;
            next.expectedNavigationPath = '/sales-discounts';
        });
        if (!doneAttemptReserved) {
            await navigateAwayFromCompletionAck('Done düğmesi başka bir işlem tarafından zaten ele alındı. Düğme tekrar tıklanmayacak.');
            return true;
        }
        refs = refsFactory();
        if (completionModalGone(refs, observed.refs?.root)) {
            await finishCompletionAck();
            return true;
        }
        const doneButton = validCompletionDoneButton(refs?.doneButton, refs) ? refs.doneButton : null;
        if (!doneButton) {
            await navigateAwayFromCompletionAck('Done düğmesi tıklamadan hemen önce Etsy tarafından yenilendi ve güvenli biçimde tekrar bulunamadı.');
            return true;
        }
        assertForegroundTab();
        assertNoBlockingForeignOverlay(refs.root || nearestActionContext(doneButton));
        // The acknowledgement may perform a full-page navigation to a locale- or
        // experiment-dependent Sales & Discounts route. Preserve same-tab ownership
        // without assuming the exact destination path.
        markLeaseHandoff(job?.jobId || '', '');
        if (!robustClick(doneButton)) {
            await navigateAwayFromCompletionAck('Done düğmesine tıklama uygulanamadı.');
            return true;
        }

        const previousRoot = refs.root;
        observed = await waitFor(() => {
            const freshRefs = refsFactory();
            return completionModalGone(freshRefs, previousRoot) ? { type: 'closed', refs: freshRefs } : null;
        }, closeTimeout, 75);
        if (observed?.type === 'closed') {
            await finishCompletionAck();
            return true;
        }
        await navigateAwayFromCompletionAck('Done tıklandı ancak Etsy başarı penceresinin kapandığı doğrulanamadı.');
        return true;
    }

    async function queueSubmittedForBatchVerification(plan, message = '', completionRefs = null, refsFactory = getCreateSaleRefs) {
        const token = makeToken();
        if (!token || !plan) return false;
        const committed = await withStateLock(async () => {
            const fresh = validateFreshForToken(await gmGet(JOB_KEY, null), token);
            const submission = clone(fresh.submission) || null;
            if (!['submitted', 'reserved'].includes(submission?.status)) throw new SafetyStopError('Etsy başarı adımı görüldü ancak bu güne bağlı final gönderim kaydı bulunamadı. Kampanya yeniden gönderilmeyecek.');
            submission.status = 'submitted';
            submission.idempotencyKey = submission.idempotencyKey || plan.idempotencyKey;
            submission.formEvidence = submission.formEvidence || clone(fresh.formEvidence) || null;
            if (submission.idempotencyKey !== plan.idempotencyKey) throw new SafetyStopError('Etsy başarı adımı ile kilitli final gönderim kaydı aynı kampanyaya ait değil. Kampanya yeniden gönderilmeyecek.');

            const next = clone(fresh);
            next.submission = submission;
            const entry = pendingVerificationEntry(plan, next, message);
            if (!entry?.formEvidence) throw new SafetyStopError('Toplu doğrulama için gerekli kilitli form kanıtı bulunamadı. Kampanya yeniden gönderilmeyecek.');
            next.pendingVerifications = upsertPendingVerification(next.pendingVerifications, entry);
            next.results = upsertResult(next.results, resultRow(plan, 'PENDING_VERIFICATION', entry.successMessage, { verified: false }, next));
            next.pendingError = null;
            next.errorReason = '';
            next.errorAt = '';
            next.pauseKind = '';
            next.paused = false;
            next.generation = Number(next.generation || 0) + 1;
            next.completionAck = {
                idempotencyKey: entry.idempotencyKey,
                saleName: entry.saleName,
                startDate: entry.startDate,
                originTabId: String(submission.tabId || TAB_ID),
                queuedAt: entry.queuedAt,
                attempts: 0,
                lastAttemptAt: 0,
                waitStartedAt: Date.now(),
                navigationAttempts: 0,
                lastNavigationAt: 0,
                advanceAfterClose: true,
                resumePhase: '',
                resumeNeedsPreflight: false,
                resumeNotBefore: 0,
            };
            next.phase = 'ack_complete';
            next.needsPreflight = false;
            next.notBefore = 0;
            next.phaseStartedAt = Date.now();
            next.expectedNavigationUntil = 0;
            next.expectedNavigationPath = '';
            next.updatedAt = new Date().toISOString();
            await gmSet(JOB_KEY, next);
            return next;
        });
        job = committed;
        abortAutomation('sale-queued-for-batch-verification');
        resetAutomationController();
        renderPanel();
        toast(`Oluşturuldu; seri sonunda doğrulanacak: ${plan.saleName}`, 'success', 3200);
        await handleCompletionAck(completionRefs, refsFactory);
        return true;
    }

    async function markSuccess(plan, message, extras = {}) {
        if (extras.cacheRecord) await rememberVerifiedPromotion(plan, extras.cacheRecord);
        const rowExtras = { ...extras };
        delete rowExtras.cacheRecord;
        const row = resultRow(plan, 'SUCCESS', message, rowExtras, job);
        await commitDayResult(plan, row);
    }
    async function retryCurrent() {
        const observed = detectFlowStage(getCreateSaleRefs());
        const currentIdentity = detectShopIdentity(true);
        const pausedJob = await gmGet(JOB_KEY, null);
        if (!pausedJob?.active || !pausedJob.paused) return;
        const leaseCandidate = clone(pausedJob);
        if (!leaseCandidate.shop?.shopId) {
            if (!currentIdentity?.shopId) {
                toast('Mağaza kimliği okunamadı. Doğru Etsy mağazasını açıp sayfayı yeniledikten sonra tekrar Devam Et düğmesine bas.', 'error', 6200);
                return;
            }
            leaseCandidate.shop = currentIdentity;
        }
        setStatus('Devam etme isteği alındı; bu sekmenin iş sahipliği doğrulanıyor.');
        const owner = await acquireLease(leaseCandidate, { allowPaused: true });
        if (!owner) {
            setStatus('Seri duraklatılmış durumda kaldı; bu sekme iş sahipliğini alamadı. Diğer Etsy sekmelerini kontrol et.');
            toast('Başka bir Etsy sekmesindeki aktif sahiplik nedeniyle bu sekmede devam edilmedi.', 'warning', 6200);
            return;
        }
        let resumedPauseKind = '';
        let updated = null;
        try {
            updated = await withStateLock(async () => {
                const fresh = await gmGet(JOB_KEY, null);
                if (!fresh?.active || !fresh.paused
                    || fresh.jobId !== pausedJob.jobId
                    || Number(fresh.generation || 0) !== Number(pausedJob.generation || 0)) return null;
                const next = clone(fresh);
                resumedPauseKind = String(fresh.pauseKind || '');
                if (!next.shop?.shopId) {
                    next.shop = currentIdentity;
                    next.configSnapshot = { ...(next.configSnapshot || {}), shop: currentIdentity };
                }
                next.paused = false;
                next.pauseKind = '';
                next.errorReason = '';
                next.errorAt = '';
                next.pendingError = null;
                next.generation = Number(next.generation || 0) + 1;
                next.phaseStartedAt = Date.now();
                next.notBefore = 0;
                next.expectedNavigationUntil = 0;
                next.expectedNavigationPath = '';
                if (next.completionAck || next.phase === 'ack_complete' || resumedPauseKind === 'completion_ack_failed') {
                    next.phase = 'ack_complete';
                    next.needsPreflight = false;
                } else if (resumedPauseKind === 'batch_verification_incomplete' || next.phase === 'batch_verify') {
                    next.phase = 'batch_verify';
                    next.batchVerifyState = { startedAt: Date.now(), attempts: 0, nextFetchAt: Date.now() };
                } else if (['submitted', 'reserved'].includes(next.submission?.status)) {
                    next.phase = 'verify_created';
                } else if (next.needsPreflight) {
                    next.phase = 'preflight';
                    next.actionLedger = {};
                    next.listingScopeVerified = false;
                } else {
                    const map = { form: 'fill_form', listings: 'select_listings', review: 'confirm_sale', complete: 'verify_created', verification: 'verify_created' };
                    next.phase = map[observed] || 'open_form';
                    next.actionLedger = {};
                    if (observed === 'form' || observed === 'listings' || observed === 'unknown') next.listingScopeVerified = false;
                    next.submission = null;
                }
                await gmSet(JOB_KEY, next);
                return next;
            });
        } catch (error) {
            await releaseLease(pausedJob.jobId);
            throw error;
        }
        if (!updated) {
            await releaseLease(pausedJob.jobId);
            toast('Mağaza kimliği okunamadı. Doğru Etsy mağazasını açıp sayfayı yeniledikten sonra tekrar Devam Et düğmesine bas.', 'error', 6200);
            return;
        }
        job = updated;
        resetAutomationController();
        renderPanel();
        setStatus('Aynı gün için yeniden deneme başlatılıyor; sekme sahipliği doğrulanıyor.');
        if (!(await verifyLease(updated))) {
            const repaused = await withStateLock(async () => {
                const fresh = await gmGet(JOB_KEY, null);
                if (!fresh?.active || fresh.jobId !== updated.jobId
                    || Number(fresh.generation || 0) !== Number(updated.generation || 0)) return null;
                const next = clone(fresh);
                next.paused = true;
                next.pauseKind = 'lease_conflict';
                next.errorReason = 'Devam etme sırasında sekme sahipliği kaybedildi; hiçbir Etsy işlemi yapılmadı.';
                next.errorAt = new Date().toISOString();
                next.generation = Number(next.generation || 0) + 1;
                next.updatedAt = new Date().toISOString();
                await gmSet(JOB_KEY, next);
                return next;
            });
            if (repaused) job = repaused;
            renderPanel();
            setStatus('Seri duraklatılmış durumda kaldı; bu sekme iş sahipliğini kaybetti. Diğer Etsy sekmelerini kontrol et.');
            toast('Sekme sahipliği doğrulanamadığı için devam edilmedi.', 'warning', 6200);
            return;
        }
        renderPanel();
        toast(['resume_required', 'legacy_migration', 'legacy_reconcile', 'upgrade_review', 'upgrade_reconcile', 'shop_identity_missing', 'submission_ambiguous', 'shop_identity_timeout', 'batch_verification_incomplete'].includes(resumedPauseKind) ? `Seri ${shopLabel(updated.shop)} mağazasında devam ediyor.` : 'Aynı gün güvenli biçimde yeniden deneniyor.', 'info', 3600);
        if (['verify_created', 'batch_verify'].includes(updated.phase) && !isDetailsStatsPath()) {
            go(DETAILS_STATS_URL);
            return;
        }
        if (updated.phase === 'open_form' && !isCreateSalePath()) {
            go(CREATE_SALE_URL);
            return;
        }
        scheduleTransitionTick(0);
    }

    function waitForPanelActionPaint() {
        return new Promise(resolve => {
            if (document.hidden || typeof requestAnimationFrame !== 'function') {
                setTimeout(resolve, 0);
                return;
            }
            let settled = false;
            const done = () => {
                if (settled) return;
                settled = true;
                clearTimeout(fallbackTimer);
                resolve();
            };
            const fallbackTimer = setTimeout(done, 80);
            requestAnimationFrame(() => requestAnimationFrame(done));
        });
    }

    function bindPanelAsyncAction(selector, action, pendingMessage, pendingLabel = 'İşleniyor…', actionKey = selector) {
        const button = panelEl?.querySelector?.(selector);
        if (!button) return;
        button.addEventListener('click', event => {
            event.preventDefault();
            if (panelActionState || button.disabled || button.dataset?.edaBusy === '1') return;
            const actionId = ++panelActionSequence;
            const originalHtml = button.innerHTML;
            let failureMessage = '';
            panelActionState = { id: actionId, key: actionKey, message: pendingMessage, label: pendingLabel, startedAt: Date.now() };
            const primaryButtons = Array.from(panelEl?.querySelectorAll?.('#eda-start, #eda-retry, #eda-skip, #eda-stop') || []);
            const primaryDisabledState = new Map(primaryButtons.map(item => [item, !!item.disabled]));
            primaryButtons.forEach(item => { item.disabled = true; });
            if (button.dataset) button.dataset.edaBusy = '1';
            button.disabled = true;
            button.setAttribute?.('aria-busy', 'true');
            button.innerHTML = `<span class="eda-button-busy-spinner" aria-hidden="true"></span><span>${html(pendingLabel)}</span>`;
            setStatus(pendingMessage);
            Promise.resolve()
                .then(waitForPanelActionPaint)
                .then(action)
                .catch(error => {
                    console.error(`EDA v${VERSION} panel action failed`, error);
                    const message = error?.message || String(error);
                    failureMessage = `İşlem başlatılamadı: ${message}`;
                    setStatus(failureMessage);
                    toast(failureMessage, 'error', 6200);
                })
                .finally(() => {
                    if (panelActionState?.id === actionId) panelActionState = null;
                    if (button.dataset) delete button.dataset.edaBusy;
                    button.removeAttribute?.('aria-busy');
                    if (button.isConnected) {
                        button.innerHTML = originalHtml;
                        button.disabled = false;
                    }
                    if (panelEl instanceof Element && panelEl.isConnected) {
                        renderPanel();
                        if (failureMessage) setStatus(failureMessage);
                    } else {
                        primaryButtons.forEach(item => { item.disabled = primaryDisabledState.get(item) || false; });
                    }
                });
        });
    }

    async function skipCurrent() {
        const active = await gmGet(JOB_KEY, null);
        if (!active?.active || !active.paused) return;
        if (active.completionAck || active.phase === 'ack_complete' || active.pauseKind === 'completion_ack_failed') {
            setStatus('Oluşturulan kampanyanın başarı penceresi henüz güvenli biçimde kapatılmadı. Bu gün atlanamaz; kampanya tekrar gönderilmeden yalnız Done kapanışı yeniden denenecek.');
            toast('Başarı penceresi beklerken gün atlama kapalıdır. Yeniden Dene veya Durdur seçeneğini kullan.', 'warning', 6200);
            return;
        }
        if (active.phase === 'batch_verify' || active.pauseKind === 'batch_verification_incomplete') {
            setStatus('Toplu doğrulama sırasında tek bir gün atlanamaz. Devam Et yalnız doğrulamayı tekrarlar; Durdur ise doğrulanamayan kampanyaları yeniden göndermeden rapora işler.');
            toast('Toplu doğrulamada gün atlama kapalıdır; hiçbir kampanya yeniden gönderilmeyecek.', 'warning', 6200);
            return;
        }
        job = active;
        const plan = currentPlan();
        if (!plan) return;
        const row = active.pendingError || resultRow(plan, 'ERROR', active.errorReason || 'Kullanıcı bu günü atladı.', {}, active);
        row.message = row.message || 'Kullanıcı bu günü atladı.';
        await commitDayResult(plan, row);
    }

    function settlePendingVerificationsAsStopped(activeJob) {
        const entries = Array.isArray(activeJob?.pendingVerifications) ? activeJob.pendingVerifications : [];
        for (const entry of entries) {
            const plan = planFromPendingVerification(entry, activeJob);
            if (!plan) continue;
            activeJob.results = upsertResult(activeJob.results, resultRow(
                plan,
                'STOPPED',
                'Kampanya Etsy başarı adımına ulaştı ancak kullanıcı toplu doğrulamayı durdurdu. Kesin liste doğrulaması yapılmadı ve kampanya otomatik olarak yeniden gönderilmedi.',
                { verified: false },
                activeJob,
            ));
        }
        activeJob.pendingVerifications = [];
        activeJob.batchVerifyState = null;
        return entries.length;
    }

    async function stopBatch() {
        const terminal = await withStateLock(async () => {
            const fresh = await gmGet(JOB_KEY, null);
            if (!fresh?.active) return null;
            const next = clone(fresh);
            const pendingStopped = settlePendingVerificationsAsStopped(next);
            if (!pendingStopped) {
                const plan = buildPlan(next.currentDate, next);
                if (plan) next.results = upsertResult(next.results, resultRow(plan, 'STOPPED', 'Kullanıcı tarafından durduruldu.', {}, next));
            }
            next.active = false;
            next.paused = false;
            next.terminalStatus = 'stopped';
            next.finishedAt = new Date().toISOString();
            next.phase = 'stopped';
            next.generation = Number(next.generation || 0) + 1;
            next.expectedNavigationUntil = 0;
            next.expectedNavigationPath = '';
            await gmSet(JOB_KEY, next);
            return next;
        });
        if (!terminal) return;
        job = terminal;
        abortAutomation('stopped');
        try { stateChannel?.postMessage({ type: 'cancel', jobId: terminal.jobId, generation: terminal.generation }); } catch {}
        await releaseLease();
        await finalizeTerminalJob(terminal.jobId, true);
    }

    function verifyWritten(refs, plan, activeJob = job) {
        const checks = [];
        checks.push({ label: 'başlangıç tarihi', ok: dateValueMatches(refs.startDate, plan.startDate) });
        checks.push({ label: 'bitiş tarihi', ok: dateValueMatches(refs.endDate, plan.endDate) });
        checks.push({ label: 'promosyon adı', ok: !!refs.saleNameInput && String(refs.saleNameInput.value).trim().toUpperCase() === plan.saleName.toUpperCase() });
        const selected = refs.discountSelect?.selectedOptions?.[0] || null;
        const selectedNumber = discountNumber(selected?.textContent || selected?.label || refs.discountSelect?.value);
        const freshRefs = getCreateSaleRefs();
        const customInput = freshRefs.customDiscountInput;
        const customValue = String(customInput?.value || '').trim();
        const presetPercent = !!(percentModeEvidence(refs) && optionLooksPercentage(selected) && Number(selectedNumber) === Number(plan.discount));
        const customPercent = !!(percentModeEvidence(refs) && /\bcustom\b|\bother\b|different/.test(discountOptionSource(selected)) && customPercentInputEvidence(customInput, freshRefs.discountSelect, freshRefs.root) && customValue === String(plan.discount));
        checks.push({ label: 'yüzde indirim türü', ok: percentModeEvidence(refs) });
        checks.push({ label: 'indirim', ok: presetPercent || customPercent });
        const desiredRegion = String(activeJob?.countryValue ?? '0');
        const hasRegion = !!refs.regionSelect;
        const hasOption = hasRegion && Array.from(refs.regionSelect.options || []).some(option => String(option.value) === desiredRegion);
        checks.push({ label: 'bölge alanı', ok: hasRegion });
        checks.push({ label: 'bölge seçeneği', ok: hasOption });
        checks.push({ label: 'bölge değeri', ok: hasOption && String(refs.regionSelect.value) === desiredRegion });
        return checks;
    }
    function robustClick(button) {
        try { button.focus?.({ preventScroll: true }); } catch { try { button.focus?.(); } catch {} }
        const opts = { bubbles: true, cancelable: true, view: window };
        try { button.dispatchEvent(new MouseEvent('mousedown', opts)); } catch {}
        try { button.dispatchEvent(new MouseEvent('mouseup', opts)); } catch {}
        try { button.click(); return true; }
        catch {
            try { return button.dispatchEvent(new MouseEvent('click', opts)); }
            catch { return false; }
        }
    }

    function stepActionLabelMatches(button, kind = '') {
        const label = low(buttonLabel(button));
        if (kind === 'continue') {
            return structuredContinueLabel(label)
                || /select\s+(?:all\s+)?listings?|choose\s+(?:the\s+)?listings?/.test(label);
        }
        if (kind === 'review') return /^review\s*(?:and|&)\s*confirm$/.test(label) || /^review(?:\b|$)/.test(label);
        if (kind === 'final') return /^(?:confirm(?:\s+and\s+create)?\s+sale|create\s+sale|run\s+sale|publish\s+sale|submit\s+sale|confirm)$/.test(label);
        return false;
    }

    function validFreshStepActionButton(button, kind = '', refs = null) {
        if (!(button?.isConnected && actionable(button) && stepActionLabelMatches(button, kind))) return false;
        if (refs?.structuredForm) return kind === 'continue' && structuredCreateSaleActionMatches(button, refs);
        if (refs?.structuredStep) return structuredSaleStepActionMatches(button, kind, refs);
        return !actionBadShell(button, kind);
    }

    function resolveFreshStepActionButton(actionName, button, options = {}, refsFactory = getCreateSaleRefs) {
        const kind = options.final || actionName === 'final_submit' ? 'final' : actionName;
        if (!['continue', 'review', 'final'].includes(kind)) return null;
        if (validFreshStepActionButton(button, kind)) return button;

        // React can replace Etsy's footer button after the form's final input/change events.
        // Re-resolve only the expected action through the same fail-closed context filters;
        // never click a detached reference or fall back to an arbitrary primary button.
        const refs = refsFactory();
        const resolved = kind === 'continue'
            ? refs?.continueButton
            : kind === 'review'
                ? refs?.reviewButton
                : refs?.finalButton;
        return validFreshStepActionButton(resolved, kind, refs) ? resolved : null;
    }

    async function waitForFreshStepActionButton(actionName, button, options = {}, refsFactory = getCreateSaleRefs, timeout = 1200) {
        const startedAt = Date.now();
        let candidate = button;
        do {
            const resolved = resolveFreshStepActionButton(actionName, candidate, options, refsFactory);
            if (resolved) return resolved;
            candidate = null;
            if (Date.now() - startedAt >= timeout) break;
            await sleep(55);
        } while (Date.now() - startedAt <= timeout);
        return null;
    }

    function stepActionSourceStage(actionName, options = {}) {
        if (options.final || actionName === 'final_submit') return 'review';
        if (actionName === 'continue') return 'form';
        if (actionName === 'review') return 'listings';
        return 'unknown';
    }

    function stepActionReachedExpectedStage(actionName, stage, options = {}) {
        if (options.final || actionName === 'final_submit') return ['complete', 'verification', 'home'].includes(stage);
        if (actionName === 'continue') return ['listings', 'review', 'complete', 'verification', 'home'].includes(stage);
        if (actionName === 'review') return ['review', 'complete', 'verification', 'home'].includes(stage);
        return false;
    }

    async function waitForStepActionTransition(actionName, options = {}, timeout = 1100, refsFactory = getCreateSaleRefs) {
        let latest = { stage: 'unknown', refs: null, error: '' };
        const observed = await waitFor(() => {
            const refs = refsFactory();
            const error = Array.isArray(refs?.errorTexts) && refs.errorTexts.length ? refs.errorTexts.join(' | ') : '';
            const stage = detectFlowStage(refs);
            latest = { stage, refs, error };
            if (error) return { type: 'error', ...latest };
            if (stepActionReachedExpectedStage(actionName, stage, options)) return { type: 'advanced', ...latest };
            return null;
        }, timeout, 55);
        return observed || { type: 'timeout', ...latest };
    }

    function saleStepActionButton(refs, actionName, options = {}) {
        if (options.final || actionName === 'final_submit') return refs?.finalButton || null;
        if (actionName === 'continue') return refs?.continueButton || null;
        if (actionName === 'review') return refs?.reviewButton || null;
        return null;
    }

    function stableNodeSetMatches(left, right) {
        return Array.isArray(left)
            && Array.isArray(right)
            && left.length === right.length
            && left.every((node, index) => node === right[index]);
    }

    function saleStepFingerprint(refs, stage, actionName = '', options = {}) {
        const button = saleStepActionButton(refs, actionName, options);
        const fields = actionName === 'continue' || options.mode === 'form'
            ? [refs?.startDate, refs?.endDate, refs?.discountType, refs?.discountSelect, refs?.customDiscountInput, refs?.saleNameInput, refs?.regionSelect]
            : [];
        const values = fields.filter(Boolean).map(field => String(field.value ?? '')).join('\u241f');
        const scope = refs?.listingAllControl
            ? `${controlChecked(refs.listingAllControl)}:${refs.listingAllControl.getAttribute?.('aria-checked') || ''}`
            : '';
        return [
            document.readyState,
            stage,
            buttonLabel(button),
            button?.disabled === true,
            button?.getAttribute?.('aria-disabled') || '',
            scope,
            values,
        ].join('|');
    }

    async function waitForStableSaleStep(expectedStage, options = {}, timeout = 12000, refsFactory = getCreateSaleRefs) {
        const stableMs = Math.max(250, Number(options.stableMs || 420));
        let stableSince = 0;
        let stableNodes = null;
        let stableFingerprint = '';
        let latest = { stage: 'unknown', refs: null, button: null, error: '' };
        const observed = await waitFor(() => {
            const refs = refsFactory();
            const stage = detectFlowStage(refs);
            const button = saleStepActionButton(refs, options.actionName || '', options);
            const error = Array.isArray(refs?.errorTexts) && refs.errorTexts.length ? refs.errorTexts.join(' | ') : '';
            latest = { stage, refs, button, error };
            if (error) return { type: 'error', ...latest };
            if (options.actionName && stepActionReachedExpectedStage(options.actionName, stage, options)) {
                return { type: 'advanced', ...latest };
            }
            if (!refs || refs.hydrating || refs.ambiguous || stage === 'unknown' || document.readyState !== 'complete') {
                stableSince = 0;
                stableNodes = null;
                stableFingerprint = '';
                return null;
            }
            if (stage !== expectedStage) return { type: 'changed', ...latest };

            let ready = false;
            let nodes = [];
            if (options.mode === 'form') {
                nodes = [refs.root, refs.startDate, refs.endDate, refs.discountType, refs.discountSelect, refs.saleNameInput, refs.regionSelect];
                ready = !!(refs.ready && nodes.every(node => node?.isConnected !== false));
            } else if (options.mode === 'listings') {
                nodes = [refs.root, refs.listingAllControl, refs.reviewCandidate];
                ready = !!(refs.listingAllControl && refs.reviewCandidate && nodes.every(node => node?.isConnected !== false));
            } else if (options.mode === 'complete') {
                nodes = [refs.root, refs.doneButton].filter(Boolean);
                ready = !!(refs.root && refs.root.isConnected !== false && stage === 'complete');
            } else if (options.actionName) {
                const kind = options.final || options.actionName === 'final_submit' ? 'final' : options.actionName;
                nodes = [refs.root, button];
                if (options.actionName === 'review') nodes.push(refs.listingAllControl);
                ready = validFreshStepActionButton(button, kind, refs)
                    && (options.actionName !== 'review' || controlChecked(refs.listingAllControl));
            }
            if (!ready) {
                stableSince = 0;
                stableNodes = null;
                stableFingerprint = '';
                return null;
            }

            const fingerprint = saleStepFingerprint(refs, stage, options.actionName || '', options);
            if (!stableNodeSetMatches(stableNodes, nodes) || stableFingerprint !== fingerprint) {
                stableNodes = nodes;
                stableFingerprint = fingerprint;
                stableSince = Date.now();
                return null;
            }
            if (Date.now() - stableSince < stableMs) return null;
            return { type: 'ready', ...latest, stableForMs: Date.now() - stableSince };
        }, timeout, 75);
        return observed || { type: 'timeout', ...latest };
    }

    function safeNonFinalStepRetry(actionName, stage, activeJob, plan) {
        if (stage !== stepActionSourceStage(actionName)) return false;
        if (actionName === 'continue') return true;
        return actionName === 'review' && listingScopeIsVerified(activeJob, plan);
    }

    async function performStepAction(plan, actionName, button, nextPhase, options = {}) {
        if (ownBlockingUiOpen()) {
            setStatus('Script penceresi açıkken otomasyon geçici olarak bekletiliyor.');
            return false;
        }
        const sourceStage = stepActionSourceStage(actionName, options);
        const actionLabel = options.label || actionName;
        setStatus(`${actionLabel} için Etsy ${sourceStage} adımının tamamen yüklenmesi ve sabitlenmesi bekleniyor.`);
        const stableStep = await waitForStableSaleStep(sourceStage, { ...options, actionName }, 12000);
        if (stableStep.type === 'error') {
            await markError(plan, stableStep.error, 'runtime_error', 'selector_sale_transition');
            return false;
        }
        if (stableStep.type === 'advanced' || stableStep.type === 'changed') {
            scheduleTransitionTick(0);
            return true;
        }
        if (stableStep.type !== 'ready' || !stableStep.button) {
            await markError(plan, `${actionLabel} adımı 12 saniye içinde tamamen yüklenip sabitlenmedi. Tıklama yapılmadı.`, 'runtime_error', 'selector_sale_transition');
            return false;
        }
        let actionButton = stableStep.button;
        assertNoBlockingForeignOverlay(nearestActionContext(actionButton));
        const token = makeToken();
        await assertTokenFresh(token);
        actionButton = await waitForFreshStepActionButton(actionName, actionButton, options);
        if (!actionButton) {
            await markError(plan, `${options.label || actionName} düğmesi güvenlik kontrolü sırasında yenilendi ancak tekrar bulunamadı.`, 'runtime_error', 'selector_sale_transition');
            return false;
        }
        assertNoBlockingForeignOverlay(nearestActionContext(actionButton));
        const label = buttonLabel(actionButton) || actionLabel;
        const reservationId = randomId('action-');
        const committed = await withStateLock(async () => {
            const fresh = validateFreshForToken(await gmGet(JOB_KEY, null), token);
            const key = actionKey(plan, actionName);
            if (options.final && fresh.submission?.status === 'submitted') return { already: true, state: fresh };
            const existing = fresh.actionLedger?.[key];
            if (existing?.status === 'clicked') return { already: true, state: fresh };
            if (existing?.status === 'reserved') return { pending: true, state: fresh, existing };
            const next = clone(fresh);
            next.actionLedger = next.actionLedger || {};
            next.actionLedger[key] = { status: 'reserved', at: Date.now(), owner: INSTANCE_ID, tabId: TAB_ID, label, reservationId };
            next.lastActionLabel = `${actionName}:${label}:reserved`;
            if (options.final) {
                next.submission = {
                    status: 'reserved',
                    idempotencyKey: plan.idempotencyKey,
                    saleName: plan.saleName,
                    reservedAt: Date.now(),
                    owner: INSTANCE_ID,
                    tabId: TAB_ID,
                    reservationId,
                    label,
                    flowType: 'run_sale',
                    regionValue: String(fresh.countryValue ?? '0'),
                    listingScope: listingScopeIsVerified(fresh, plan) ? 'all' : '',
                    formEvidence: fresh.formEvidence || null,
                };
            }
            await gmSet(JOB_KEY, next);
            return { already: false, state: next, key };
        });
        job = committed.state;
        renderPanel();
        if (committed.already) return true;
        if (committed.pending) {
            const age = Date.now() - Number(committed.existing?.at || 0);
            await markError(plan, `${options.label || actionName} için tamamlanmamış bir rezervasyon bulundu (${Math.max(0, Math.round(age / 1000))} sn). Düğme yeniden tıklanmadı; sayfa aşaması uzlaştırılarak kullanıcı onayı istendi.`, 'action_reservation_ambiguous');
            return false;
        }

        const rollback = async () => {
            await withStateLock(async () => {
                const fresh = await gmGet(JOB_KEY, null);
                if (!fresh?.active || fresh.jobId !== token.jobId || fresh.currentDate !== token.currentDate) return;
                const record = fresh.actionLedger?.[committed.key];
                if (record?.status !== 'reserved' || record.reservationId !== reservationId) return;
                const next = clone(fresh);
                delete next.actionLedger[committed.key];
                if (options.final && next.submission?.status === 'reserved' && next.submission?.reservationId === reservationId) next.submission = null;
                next.updatedAt = new Date().toISOString();
                await gmSet(JOB_KEY, next);
                job = next;
            });
        };

        await sleep(80);
        if (ownBlockingUiOpen()) {
            await rollback();
            setStatus('Rapor/ayar penceresi açıldığı için düğme rezervasyonu geri alındı; arka planda tıklama yapılmadı.');
            return false;
        }
        await assertTokenFresh(token);
        actionButton = await waitForFreshStepActionButton(actionName, actionButton, options);
        if (!actionButton) {
            await rollback();
            await markError(plan, `${label} için güvenli rezervasyon yapıldı ancak düğme tıklamadan önce kayboldu. Rezervasyon geri alındı; Yeniden Dene ile aynı adım tekrar edilebilir.`, 'runtime_error', 'selector_sale_transition');
            return false;
        }
        assertNoBlockingForeignOverlay(nearestActionContext(actionButton));
        const clicked = robustClick(actionButton);
        if (!clicked) {
            await rollback();
            await markError(plan, `${label} tıklanamadı. Tıklama gerçekleşmediği için rezervasyon geri alındı; Yeniden Dene ile aynı adım tekrar edilebilir.`, 'runtime_error', 'selector_sale_transition');
            return false;
        }

        let attempts = 1;
        let transition = null;
        if (!options.final) {
            transition = await waitForStepActionTransition(actionName, options, 1100);
            if (transition.type === 'error') {
                await rollback();
                await markError(plan, transition.error, 'runtime_error', 'selector_sale_transition');
                return false;
            }

            // Continue and Review are reversible navigation actions. Etsy can occasionally
            // consume focus without advancing the React step. Retry at most once, and only
            // while the exact source step, token, ownership and scope evidence are intact.
            // The final sale submission never enters this branch and remains exactly-once.
            if (transition.type === 'timeout') {
                await assertTokenFresh(token);
                const retryRefs = getCreateSaleRefs();
                const retryStage = detectFlowStage(retryRefs);
                if (stepActionReachedExpectedStage(actionName, retryStage, options)) {
                    transition = { type: 'advanced', stage: retryStage, refs: retryRefs, error: '' };
                } else if (safeNonFinalStepRetry(actionName, retryStage, job, plan)) {
                    const stableRetry = await waitForStableSaleStep(retryStage, { ...options, actionName, stableMs: 300 }, 1800);
                    const retryButton = stableRetry.type === 'ready' ? stableRetry.button : null;
                    if (retryButton && validFreshStepActionButton(retryButton, actionName, stableRetry.refs)) {
                        assertNoBlockingForeignOverlay(nearestActionContext(retryButton));
                        assertForegroundTab();
                        setStatus(`${label} ilk tıklamadan sonra aynı Etsy adımında kaldı; doğrulanmış düğmeye güvenli son tekrar uygulanıyor.`);
                        if (robustClick(retryButton)) {
                            attempts = 2;
                            transition = await waitForStepActionTransition(actionName, options, 1800);
                            if (transition.type === 'error') {
                                await rollback();
                                await markError(plan, transition.error, 'runtime_error', 'selector_sale_transition');
                                return false;
                            }
                        }
                    }
                }
            }
        }

        const finalized = await withStateLock(async () => {
            const fresh = validateFreshForToken(await gmGet(JOB_KEY, null), token);
            const record = fresh.actionLedger?.[committed.key];
            if (record?.reservationId !== reservationId) return fresh;
            const next = clone(fresh);
            next.actionLedger[committed.key] = {
                ...record,
                status: 'clicked',
                clickedAt: Date.now(),
                attempts,
                transitionObserved: transition?.type === 'advanced',
                transitionStage: transition?.stage || '',
            };
            next.phase = nextPhase;
            next.phaseStartedAt = Date.now();
            next.lastActionLabel = `${actionName}:${label}:clicked`;
            if (options.final) {
                next.submission = {
                    ...(next.submission || {}),
                    status: 'submitted',
                    submittedAt: Date.now(),
                    reservationId,
                };
            }
            next.updatedAt = new Date().toISOString();
            await gmSet(JOB_KEY, next);
            return next;
        });
        job = finalized;
        renderPanel();
        scheduleTransitionTick(35);
        return true;
    }
    function detectFlowStage(refs = getCreateSaleRefs()) {
        if (refs?.hydrating || refs?.ambiguous) return 'unknown';
        if (['listings', 'review', 'complete'].includes(refs?.stage)) return refs.stage;
        const saleOverlay = currentSaleOverlayShell();
        if (isDetailsStatsPath() && !saleOverlay) return 'verification';
        if (isPromotionsHomePath() && !saleOverlay) return 'home';
        const rootText = saleFlowText(refs.root || getFlowRoot());
        const negative = /could\s+not|couldn['’]?t|failed|failure|unable|invalid|not created|not scheduled|conflict|error/.test(rootText);
        if (!negative && /your sale is (?:scheduled|live)|sale is (?:scheduled|live)|successfully (created|scheduled)|your sale has been created/.test(rootText)) return 'complete';
        if (/which listings are included|select (the )?listings|choose (the )?listings/.test(rootText) && !refs.ready) return 'listings';
        if (/review your sale details/.test(rootText) && !refs.ready) return 'review';
        if (refs.ready) return 'form';
        return 'unknown';
    }
    async function reconcileStage(plan, refs = getCreateSaleRefs(), refsFactory = getCreateSaleRefs) {
        const stage = detectFlowStage(refs);
        const active = job;
        if (active.completionAck || active.phase === 'ack_complete') {
            await handleCompletionAck(refs, refsFactory);
            return true;
        }
        // Batch verification is read-only and must never be remapped to a creation
        // phase because an old or cached sale-step DOM is still disappearing.
        if (active.phase === 'batch_verify') return false;
        if (active.phase === 'preflight' || active.needsPreflight) return false;
        if (stage === 'complete') {
            setStatus(`Etsy başarı adımının tamamen yüklenmesi ve sabitlenmesi bekleniyor: ${plan.saleName}`);
            const stableComplete = await waitForStableSaleStep('complete', { mode: 'complete' }, 12000, refsFactory);
            if (stableComplete.type === 'error') {
                await markError(plan, stableComplete.error, 'runtime_error', 'selector_sale_transition');
                return true;
            }
            if (stableComplete.type === 'timeout') {
                await markError(plan, 'Etsy başarı adımı 12 saniye içinde tamamen yüklenip sabitlenmedi; doğrulama sayfasına geçilmedi.', 'runtime_error', 'selector_sale_transition');
                return true;
            }
            if (stableComplete.type === 'changed' && !['verification', 'home'].includes(stableComplete.stage)) {
                scheduleTransitionTick(0);
                return true;
            }
            if (['submitted', 'reserved'].includes(active.submission?.status)) {
                await queueSubmittedForBatchVerification(
                    plan,
                    `Etsy başarı adımı doğrulandı: ${plan.saleName}. Kesin liste doğrulaması seri sonunda yapılacak.`,
                    stableComplete.refs,
                    refsFactory,
                );
                return true;
            }
            if (active.phase !== 'verify_created') {
                await setPhase('verify_created', { verifyState: active.verifyState || { startedAt: Date.now(), attempts: 0, nextFetchAt: Date.now() + 1000 } });
                return true;
            }
            return false;
        }
        if (stage === 'verification' || stage === 'home') {
            if (['submitted', 'reserved'].includes(active.submission?.status) || active.phase === 'await_result' || active.phase === 'verify_created') {
                if (active.phase !== 'verify_created') {
                    await setPhase('verify_created', { verifyState: active.verifyState || { startedAt: Date.now(), attempts: 0, nextFetchAt: Date.now() + 1000 } });
                    return true;
                }
            }
            // Submission yokken ana Sales and discounts sayfası open_form akışının
            // normal başlangıç noktasıdır; doğrulama ekranı olarak yorumlanmaz.
            return false;
        }
        if (['submitted', 'reserved'].includes(active.submission?.status)) {
            if (!['await_result', 'verify_created'].includes(active.phase)) await setPhase('await_result');
            return false;
        }
        if (stage === 'form') {
            if (active.phase === 'open_form') { await setPhase('fill_form'); return true; }
            if (active.phase === 'fill_form') return false;
            if (active.phase === 'await_listings' && actionIsRecent(active, plan, 'continue')) return false;
            if (active.phase === 'await_listings') {
                const attempts = Number(actionRecord(active, plan, 'continue')?.attempts || 1);
                await markError(plan, `Continue ${attempts > 1 ? 'iki güvenli denemeye' : 'bir denemeye'} rağmen Etsy form ekranından ilerlemedi.`);
                return true;
            }
            await markError(plan, `Etsy ekranı geriye form aşamasına döndü; kayıtlı aşama ${active.phase}. Yanlış adımı otomatik tekrarlamamak için durduruldu.`);
            return true;
        }
        if (stage === 'listings') {
            if (active.phase === 'await_review' && actionIsRecent(active, plan, 'review')) return false;
            if (active.phase === 'await_review') {
                const attempts = Number(actionRecord(active, plan, 'review')?.attempts || 1);
                await markError(plan, `Review and confirm ${attempts > 1 ? 'iki güvenli denemeye' : 'bir denemeye'} rağmen Etsy listing seçim ekranından ilerlemedi.`);
                return true;
            }
            if (active.phase !== 'select_listings') { await setPhase('select_listings'); return true; }
            return false;
        }
        if (stage === 'review') {
            if (!listingScopeIsVerified(active, plan)) {
                await markError(plan, 'Review ekranına geçildi ancak bu gün için seçili All listings kontrolünden üretilmiş kapsam kanıtı yok. Serbest metin kanıtı kabul edilmedi ve final gönderilmedi.', 'listing_scope_unverified');
                return true;
            }
            if (job.phase !== 'confirm_sale') { await setPhase('confirm_sale'); return true; }
            return false;
        }
        return false;
    }

    async function waitForPostFillAction(timeout = 12000) {
        let latestRefs = getCreateSaleRefs();
        const result = await waitFor(() => {
            latestRefs = getCreateSaleRefs();
            if (latestRefs.errorTexts.length) return { type: 'error', refs: latestRefs, message: latestRefs.errorTexts.join(' | ') };
            if (latestRefs.continueButton) return { type: 'continue', refs: latestRefs, button: latestRefs.continueButton };
            const stage = detectFlowStage(latestRefs);
            if (stage !== 'form' && stage !== 'unknown') return { type: 'advanced', refs: latestRefs, stage };
            return null;
        }, timeout, 180);
        return result || { type: 'timeout', refs: latestRefs };
    }

    async function handlePreflight(plan) {
        const token = makeToken();
        setStatus(`Duplicate ön kontrolü yapılıyor: ${plan.saleName}`);
        const includeLegacy = !!job?.migratedFrom || Array.isArray(job?.legacyAuditResults);
        const aliases = uniq(includeLegacy ? [plan.saleName, plan.legacySaleName] : [plan.saleName]);
        const result = await verifyByFetch(plan, { aliases, strict: true, postSubmit: false, countryValue: job?.countryValue, token, allowCache: false });
        if (result.fatal || !result.readComplete) {
            await markError(plan, `Duplicate ön kontrolü kesin olarak tamamlanamadı. Yeni kampanya gönderilmedi. ${result.message}`, 'verification_safety');
            return;
        }
        if (result.ok) {
            await markSuccess(plan, `Kampanya daha önce oluşturulmuş; tekrar gönderilmeden durum, tür, bölge ve kapsamıyla doğrulandı. ${result.message}`, { url: result.url, verified: true, existing: true, saleName: result.matchedName || plan.saleName, cacheRecord: result.cacheRecord });
            return;
        }
        if (result.ambiguousExisting) {
            await markError(plan, `Aynı kampanya koduna ait kayıt bulundu ancak bütün güvenlik alanları doğrulanamadı veya uyuşmadı. Duplicate riskine karşı yeni kampanya gönderilmedi. ${result.message}`, result.policyMismatch ? 'existing_policy_mismatch' : 'duplicate_ambiguous');
            return;
        }
        if (!result.notFound) {
            await markError(plan, `Promosyon listesi kesin "bulunamadı" sonucu üretmedi. Yeni kampanya gönderilmedi. ${result.message}`, 'verification_safety');
            return;
        }
        await mutateJob(token, next => {
            next.needsPreflight = false;
            next.phase = 'open_form';
            next.phaseStartedAt = Date.now();
            next.expectedNavigationUntil = Date.now() + 18000;
            next.expectedNavigationPath = '/sales-discounts/step/createSale';
        });
        go(CREATE_SALE_URL);
    }
    async function handleOpenForm(plan) {
        const refs = getCreateSaleRefs();
        if (refs.ready) {
            await setPhase('fill_form');
            return;
        }
        const elapsed = Date.now() - Number(job.phaseStartedAt || Date.now());
        if (isCreateSalePath()) {
            setStatus(`Run a sale formu bekleniyor: ${plan.saleName}`);
            if (elapsed > 24000) await markError(plan, 'Run a sale form alanları görünmedi. Etsy sayfası yüklenmedi veya DOM değişti.', 'runtime_error', 'selector_sale_form');
            return;
        }
        if (elapsed > 30000 || Number(job.openFormAttempts || 0) >= 4) {
            await markError(plan, `Etsy Run a sale sayfasını açmadı veya ana sayfaya geri yönlendirdi. Deneme: ${Number(job.openFormAttempts || 0)}.`, 'runtime_error', 'selector_sale_transition');
            return;
        }
        const token = makeToken();
        const now = Date.now();
        if (job.openFormNavigationAt && now - Number(job.openFormNavigationAt) < 3500) return;
        await mutateJob(token, next => {
            next.openFormAttempts = Number(next.openFormAttempts || 0) + 1;
            next.openFormNavigationAt = now;
            next.expectedNavigationUntil = now + 18000;
            next.expectedNavigationPath = '/sales-discounts/step/createSale';
        });
        setStatus(`Run a sale ekranı açılıyor: ${plan.saleName}\nDeneme: ${Number(job.openFormAttempts || 0)}/4`);
        const link = findRunSaleLink();
        await assertTokenFresh(token);
        if (link && actionable(link)) {
            assertNoBlockingForeignOverlay();
            if (!robustClick(link)) go(link.href || CREATE_SALE_URL);
        } else {
            go(CREATE_SALE_URL);
        }
    }

    async function handleFillForm(plan) {
        const token = makeToken();
        setStatus(`Etsy form adımının tamamen yüklenmesi ve alanların sabitlenmesi bekleniyor: ${plan.saleName}`);
        const stableForm = await waitForStableSaleStep('form', { mode: 'form' }, 15000);
        if (stableForm.type === 'error') {
            await markError(plan, stableForm.error, 'runtime_error', 'selector_sale_form');
            return;
        }
        if (stableForm.type === 'changed' || stableForm.type === 'advanced') {
            scheduleTransitionTick(0);
            return;
        }
        if (stableForm.type !== 'ready') {
            await markError(plan, 'Etsy form adımı 15 saniye içinde tamamen yüklenip sabitlenmedi; hiçbir alan değiştirilmedi.', 'runtime_error', 'selector_sale_form');
            return;
        }
        let refs = stableForm.refs;
        setStatus(`Form dolduruluyor\n${plan.saleName} · ${plan.startDateInput} → ${plan.endDateInput} · %${plan.discount}`);
        const percentOk = await ensureDiscountPercent(refs);
        await assertTokenFresh(token);
        if (!percentOk) { await markError(plan, 'Discount type yüzde moduna alınamadı.', 'runtime_error', 'selector_sale_form'); return; }
        const startOk = await fillDateField(refs.startDate, plan.startDate);
        await assertTokenFresh(token);
        refs = getCreateSaleRefs();
        const endOk = await fillDateField(refs.endDate, plan.endDate);
        await assertTokenFresh(token);
        refs = getCreateSaleRefs();
        const discountResult = await setDiscount(refs, plan.discount);
        await assertTokenFresh(token);
        refs = getCreateSaleRefs();
        const nameOk = await fillField(refs.saleNameInput, plan.saleName);
        await assertTokenFresh(token);
        refs = getCreateSaleRefs();
        const desiredRegion = String(job.countryValue ?? '0');
        if (!refs.regionSelect) { await markError(plan, 'Bölge alanı bulunamadı; yanlış bölgeyle kampanya oluşturma riski nedeniyle durduruldu.', 'runtime_error', 'selector_sale_form'); return; }
        const regionOption = Array.from(refs.regionSelect.options || []).find(option => String(option.value) === desiredRegion);
        if (!regionOption) { await markError(plan, `Hedef bölge seçeneği Etsy formunda yok: ${desiredRegion}. Mevcut değer sessizce bırakılmadı.`); return; }
        const regionOk = await fillField(refs.regionSelect, desiredRegion);
        await assertTokenFresh(token);
        await sleep(360);
        refs = getCreateSaleRefs();
        const checks = verifyWritten(refs, plan, job);
        const ok = startOk && endOk && nameOk && discountResult.ok && regionOk && checks.every(check => check.ok);
        if (!ok) {
            const failed = checks.filter(check => !check.ok).map(check => check.label).join(', ') || discountResult.message || 'bilinmeyen alan';
            const dateDebug = /tarih/.test(failed) ? ` | start=${describeField(refs.startDate)} | end=${describeField(refs.endDate)}` : '';
            await markError(plan, `Form doğrulaması başarısız: ${failed}${dateDebug}`, 'runtime_error', 'selector_sale_form');
            return;
        }
        await mutateJob(token, next => {
            next.formEvidence = { idempotencyKey: plan.idempotencyKey, saleName: plan.saleName, discount: plan.discount, startDate: plan.startDateIso, endDate: plan.endDateIso, regionValue: desiredRegion, flowType: 'run_sale', recordedAt: new Date().toISOString() };
        });
        [refs.startDate, refs.endDate, refs.discountSelect, refs.customDiscountInput, refs.saleNameInput, refs.regionSelect].filter(Boolean).forEach(field => fire(field));
        setStatus(`Continue düğmesinin etkinleşmesi bekleniyor: ${plan.saleName}`);
        const action = await waitForPostFillAction(12000);
        await assertTokenFresh(token);
        if (action.type === 'error') { await markError(plan, action.message); return; }
        if (action.type === 'continue') {
            setStatus(`Continue tıklanıyor ve Etsy adım geçişi doğrulanıyor: ${plan.saleName}`);
            await performStepAction(plan, 'continue', action.button, 'await_listings', { label: 'Continue' });
            return;
        }
        if (action.type === 'advanced') {
            const map = { listings: 'select_listings', review: 'confirm_sale', complete: 'verify_created', verification: 'verify_created' };
            if (map[action.stage]) await setPhase(map[action.stage]);
            return;
        }
        const disabled = action.refs?.continueCandidate && !actionable(action.refs.continueCandidate);
        const details = visibleButtonSummary(12, true) || 'yok';
        await markError(plan, disabled
            ? `Continue düğmesi mevcut fakat etkinleşmedi. Düğme: ${buttonLabel(action.refs.continueCandidate) || 'etiketsiz'} [disabled]. Görünen düğmeler: ${details}.`
            : `Continue/Next düğmesi 12 saniye içinde bulunamadı. Görünen düğmeler: ${details}.`, 'runtime_error', 'selector_sale_transition');
    }

    async function handleAwaitListings(plan) {
        const refs = getCreateSaleRefs();
        if (refs.errorTexts.length) { await markError(plan, refs.errorTexts.join(' | ')); return; }
        const stage = detectFlowStage(refs);
        if (stage === 'listings') { await setPhase('select_listings'); return; }
        if (stage === 'review') { await setPhase('confirm_sale'); return; }
        if (stage === 'complete' || stage === 'verification') { await setPhase('verify_created'); return; }
        const elapsed = Date.now() - Number(job.phaseStartedAt || Date.now());
        if (elapsed > ACTION_GRACE_MS) {
            const attempts = Number(actionRecord(job, plan, 'continue')?.attempts || 1);
            await markError(plan, `Continue ${attempts > 1 ? 'iki güvenli denemeye' : 'bir denemeye'} rağmen listing seçim ekranına geçmedi. Görünen düğmeler: ${visibleButtonSummary(10, true) || 'yok'}.`, 'runtime_error', 'selector_sale_transition');
        } else {
            setStatus(`Continue sonrası Etsy geçişi bekleniyor: ${plan.saleName}\nYalnız aynı form adımında kaldığı doğrulanırsa güvenli tek tekrar uygulanır.`);
        }
    }

    function controlChecked(control) {
        if (!control) return false;
        if ('checked' in control) return !!control.checked;
        return ['aria-checked', 'aria-pressed', 'aria-selected'].some(name => control.getAttribute?.(name) === 'true');
    }

    function associatedVisibleLabel(control, root = document) {
        if (!control) return null;
        const nested = control.closest?.('label');
        if (nested && visible(nested)) return nested;
        const id = control.id;
        if (!id) return null;
        const scope = root && typeof root.querySelector === 'function' ? root : document;
        const label = scope.querySelector?.(`label[for="${CSS.escape(id)}"]`) || document.querySelector?.(`label[for="${CSS.escape(id)}"]`);
        return label && visible(label) ? label : null;
    }

    function pageExplicitlyUsesAllListings(root) {
        const source = low(semanticVisibleText(root || getFlowRoot()));
        const finiteSelection = /\b(?:selected|included|chosen)\s*[:\-]?\s*[1-9]\d*\s+(?:of\s+\d+\s+)?listings?\b/.test(source)
            || /\b[1-9]\d*\s+(?:of\s+\d+\s+)?listings?\s+(?:selected|included|chosen)\b/.test(source)
            || /\b(?:applies?\s+to|scope\s*:)\s*[1-9]\d*\s+listings?\b/.test(source);
        const specificSelection = /(?:choose|select)\s+(?:specific|individual|some|the)\s+listings?|specific\s+listings?|individual\s+listings?/.test(source);
        if (finiteSelection || specificSelection || hasAllListingsNegation(source)) return false;
        return /\bthis sale applies to all eligible listings\b/.test(source)
            || /\ball\s+(?:active\s+|eligible\s+)?listings?\s+(?:are\s+)?(?:selected|included)\b/.test(source)
            || /\b(?:listings?\s+included|selection|scope)\s*[:\-]\s*all\s+(?:active\s+|eligible\s+)?listings?\b/.test(source)
            || /\bentire\s+shop\s+(?:is\s+)?(?:selected|included)\b/.test(source);
    }
    function listingScopeIsVerified(activeJob, plan) {
        const evidence = activeJob?.listingScopeVerified;
        return !!(evidence && evidence.idempotencyKey === plan?.idempotencyKey && evidence.scope === 'all');
    }

    async function persistAllListingsEvidence(plan, reason) {
        if (listingScopeIsVerified(job, plan)) return true;
        const token = makeToken();
        await mutateJob(token, next => {
            next.listingScopeVerified = {
                scope: 'all',
                idempotencyKey: plan.idempotencyKey,
                verifiedAt: new Date().toISOString(),
                reason: String(reason || 'All listings doğrulandı.'),
            };
        });
        return true;
    }

    async function ensureAllListingsSelected(plan, refs) {
        const control = refs.listingAllControl;
        if (!control) {
            return {
                ok: false,
                found: false,
                message: 'All listings seçeneğine ait gerçek radio/checkbox kontrolü bulunamadı. Serbest metin kapsam kanıtı olarak kullanılmadı.',
            };
        }
        if (controlChecked(control)) return { ok: true, found: true, message: 'All listings kontrolü zaten seçili.' };
        const token = makeToken();
        await assertTokenFresh(token);
        const key = actionKey(plan, 'select_all_listings');
        const reservationId = randomId('action-');
        const committed = await withStateLock(async () => {
            const fresh = validateFreshForToken(await gmGet(JOB_KEY, null), token);
            if (fresh.actionLedger?.[key]?.status === 'clicked') return { already: true, state: fresh };
            if (fresh.actionLedger?.[key]?.status === 'reserved') return { pending: true, state: fresh };
            const next = clone(fresh);
            next.actionLedger = next.actionLedger || {};
            next.actionLedger[key] = { status: 'reserved', at: Date.now(), owner: INSTANCE_ID, tabId: TAB_ID, label: 'All listings', reservationId };
            await gmSet(JOB_KEY, next);
            return { already: false, state: next, key };
        });
        job = committed.state;
        if (committed.already) {
            const freshControl = getCreateSaleRefs().listingAllControl;
            return { ok: controlChecked(freshControl), found: true, message: controlChecked(freshControl) ? 'All listings kontrolü daha önce seçildi.' : 'All listings tıklama kaydı bulundu ancak gerçek kontrol seçili değil; yeniden tıklanmadı.' };
        }
        if (committed.pending) return { ok: false, found: true, message: 'All listings seçimi için tamamlanmamış bir rezervasyon bulundu; arka planda yeniden tıklanmadı.' };

        const rollback = async () => {
            await withStateLock(async () => {
                const fresh = await gmGet(JOB_KEY, null);
                if (!fresh?.active || fresh.jobId !== token.jobId || fresh.currentDate !== token.currentDate) return;
                const record = fresh.actionLedger?.[committed.key];
                if (record?.status !== 'reserved' || record.reservationId !== reservationId) return;
                const next = clone(fresh);
                delete next.actionLedger[committed.key];
                next.updatedAt = new Date().toISOString();
                await gmSet(JOB_KEY, next);
                job = next;
            });
        };

        const clickTarget = actionable(control) ? control : associatedVisibleLabel(control, refs.root);
        if (ownBlockingUiOpen()) {
            await rollback();
            setStatus('Rapor/ayar penceresi açıldığı için All listings rezervasyonu geri alındı; arka planda tıklama yapılmadı.');
            return { ok: false, found: true, blocked: true, message: 'Script penceresi açıkken All listings seçimi bekletildi.' };
        }
        try { assertNoBlockingForeignOverlay(nearestActionContext(clickTarget)); }
        catch (error) { await rollback(); throw error; }
        if (!clickTarget || !visible(clickTarget)) {
            await rollback();
            return { ok: false, found: true, message: 'All listings seçeneğinin görünür etiketi tıklanamadı.' };
        }
        if (ownBlockingUiOpen()) {
            await rollback();
            setStatus('Rapor/ayar penceresi açıldığı için All listings rezervasyonu geri alındı; arka planda tıklama yapılmadı.');
            return { ok: false, found: true, blocked: true, message: 'Script penceresi açıkken All listings seçimi bekletildi.' };
        }
        assertForegroundTab();
        if (!robustClick(clickTarget)) {
            await rollback();
            return { ok: false, found: true, message: 'All listings seçeneğinin görünür etiketi tıklanamadı.' };
        }
        await sleep(350);
        await assertTokenFresh(token);
        const freshControl = getCreateSaleRefs().listingAllControl;
        if (!controlChecked(freshControl)) {
            await rollback();
            return { ok: false, found: true, message: 'All listings etiketi tıklandı fakat kontrol seçili duruma geçmedi; rezervasyon geri alındı.' };
        }
        const finalized = await withStateLock(async () => {
            const fresh = validateFreshForToken(await gmGet(JOB_KEY, null), token);
            const record = fresh.actionLedger?.[committed.key];
            if (record?.status !== 'reserved' || record.reservationId !== reservationId) return fresh;
            const next = clone(fresh);
            next.actionLedger[committed.key] = { ...record, status: 'clicked', clickedAt: Date.now() };
            await gmSet(JOB_KEY, next);
            return next;
        });
        job = finalized;
        return { ok: true, found: true, message: 'All listings kontrolü seçildi.' };
    }
    async function handleSelectListings(plan) {
        setStatus(`Etsy listing seçim adımının tamamen yüklenmesi ve sabitlenmesi bekleniyor: ${plan.saleName}`);
        const stableListings = await waitForStableSaleStep('listings', { mode: 'listings' }, 12000);
        if (stableListings.type === 'error') { await markError(plan, stableListings.error); return; }
        if (stableListings.type === 'changed' || stableListings.type === 'advanced') {
            scheduleTransitionTick(0);
            return;
        }
        if (stableListings.type !== 'ready') {
            await markError(plan, 'Etsy listing seçim adımı 12 saniye içinde tamamen yüklenip sabitlenmedi; hiçbir seçim veya tıklama yapılmadı.', 'runtime_error', 'selector_sale_scope');
            return;
        }
        let refs = stableListings.refs;
        const selection = await ensureAllListingsSelected(plan, refs);
        if (!selection.ok) {
            if (selection.blocked) {
                setStatus(`Script penceresi açıkken All listings seçimi bekletiliyor: ${plan.saleName}\n${selection.message}`);
                return;
            }
            const elapsed = Date.now() - Number(job.phaseStartedAt || Date.now());
            if (elapsed > 16000 || selection.found) await markError(plan, `${selection.message} Review durumu: ${refs.reviewCandidate ? buttonLabel(refs.reviewCandidate) || 'etiketsiz' : 'bulunamadı'}${refs.reviewCandidate && !actionable(refs.reviewCandidate) ? ' [disabled]' : ''}.`, 'runtime_error', 'selector_sale_scope');
            else setStatus(`All listings seçimi bekleniyor: ${plan.saleName}\n${selection.message}`);
            return;
        }
        await persistAllListingsEvidence(plan, selection.message);
        refs = getCreateSaleRefs();
        if (refs.reviewButton) {
            setStatus(`Review and confirm tıklanıyor ve Etsy adım geçişi doğrulanıyor: ${plan.saleName}`);
            await performStepAction(plan, 'review', refs.reviewButton, 'await_review', { label: 'Review and confirm' });
            return;
        }
        if (refs.finalButton) { await setPhase('confirm_sale'); return; }
        const elapsed = Date.now() - Number(job.phaseStartedAt || Date.now());
        if (elapsed > 18000) {
            const disabled = refs.reviewCandidate && !actionable(refs.reviewCandidate);
            await markError(plan, disabled ? 'Review and confirm düğmesi mevcut fakat etkinleşmedi; All listings seçimi Etsy tarafından kabul edilmemiş olabilir.' : 'Review and confirm düğmesi bulunamadı.', 'runtime_error', 'selector_sale_transition');
        } else {
            setStatus(`Review and confirm düğmesi bekleniyor: ${plan.saleName}`);
        }
    }

    async function handleAwaitReview(plan) {
        const refs = getCreateSaleRefs();
        if (refs.errorTexts.length) { await markError(plan, refs.errorTexts.join(' | ')); return; }
        const stage = detectFlowStage(refs);
        if (stage === 'review') { await setPhase('confirm_sale'); return; }
        if (stage === 'complete' || stage === 'verification') { await setPhase('verify_created'); return; }
        const elapsed = Date.now() - Number(job.phaseStartedAt || Date.now());
        if (elapsed > ACTION_GRACE_MS) {
            const attempts = Number(actionRecord(job, plan, 'review')?.attempts || 1);
            await markError(plan, `Review and confirm ${attempts > 1 ? 'iki güvenli denemeye' : 'bir denemeye'} rağmen final inceleme ekranına geçmedi. Görünen düğmeler: ${visibleButtonSummary(10, true) || 'yok'}.`, 'runtime_error', 'selector_sale_transition');
        } else {
            setStatus(`Review sonrası Etsy geçişi bekleniyor: ${plan.saleName}\nYalnız aynı listing adımında kaldığı doğrulanırsa güvenli tek tekrar uygulanır.`);
        }
    }

    async function handleConfirmSale(plan) {
        const refs = getCreateSaleRefs();
        if (refs.errorTexts.length) { await markError(plan, refs.errorTexts.join(' | ')); return; }
        if (!listingScopeIsVerified(job, plan)) {
            await markError(plan, 'Final onay öncesinde seçili All listings kontrolünden üretilmiş kapsam kanıtı yok. Serbest metin kanıtı kabul edilmedi; kampanya gönderilmedi.', 'listing_scope_unverified');
            return;
        }
        if (job.submission?.status === 'submitted') { await setPhase('await_result'); return; }
        if (job.submission?.status === 'reserved') { await setPhase('verify_created'); return; }
        const stage = detectFlowStage(refs);
        if (refs.finalButton || refs.finalCandidate || stage === 'review') {
            setStatus(`Final onay yalnızca bir kez gönderiliyor: ${plan.saleName}`);
            await performStepAction(plan, 'final_submit', refs.finalButton, 'await_result', { label: 'Confirm sale', final: true });
            return;
        }
        if (stage === 'complete' || stage === 'verification') { await setPhase('verify_created'); return; }
        const elapsed = Date.now() - Number(job.phaseStartedAt || Date.now());
        if (elapsed > 18000) {
            const disabled = refs.finalCandidate && !actionable(refs.finalCandidate);
            await markError(plan, disabled ? 'Final onay düğmesi mevcut fakat etkin değil.' : `Final onay düğmesi bulunamadı. Görünen düğmeler: ${visibleButtonSummary(10, true) || 'yok'}.`, 'runtime_error', 'selector_sale_transition');
        } else {
            setStatus(`Final onay düğmesi bekleniyor: ${plan.saleName}`);
        }
    }

    async function handleAwaitResult(plan) {
        const refs = getCreateSaleRefs();
        if (refs.errorTexts.length) { await markError(plan, refs.errorTexts.join(' | ')); return; }
        const challenge = detectChallenge();
        if (challenge) { await markError(plan, challenge, 'rate_limit_or_challenge'); return; }
        const stage = detectFlowStage(refs);
        if (stage === 'complete' || stage === 'verification') {
            await setPhase('verify_created', { verifyState: { startedAt: Date.now(), attempts: 0, nextFetchAt: Date.now() + 1800 } });
            return;
        }
        const submittedAt = Number(job.submission?.submittedAt || job.phaseStartedAt || Date.now());
        const elapsed = Date.now() - submittedAt;
        if (elapsed > FINAL_RESULT_WAIT_MS) {
            const token = makeToken();
            await mutateJob(token, next => {
                next.phase = 'verify_created';
                next.phaseStartedAt = Date.now();
                next.verifyState = { startedAt: Date.now(), attempts: 0, nextFetchAt: Date.now() + 1800 };
                next.expectedNavigationUntil = Date.now() + 18000;
                next.expectedNavigationPath = '/sales-discounts/details-stats';
            });
            go(DETAILS_STATS_URL);
            return;
        }
        setStatus(`Final gönderildi; Etsy yanıtı bekleniyor: ${plan.saleName}\nFinal düğmesine tekrar basılmayacak.`);
    }

    function visibleButtonSummary(limit = 8, includeDisabled = false) {
        return allVisible(document, 'button, a[role="button"], [role="button"], a.wt-btn, a[data-clg-id="WtButton"], input[type="button"], input[type="submit"]')
            .filter(button => includeDisabled ? visible(button) : actionable(button))
            .filter(button => !actionBadShell(button, 'summary'))
            .map(button => {
                const label = buttonLabel(button);
                if (!label) return '';
                return includeDisabled && !actionable(button) ? `${label} [disabled]` : label;
            })
            .filter(Boolean)
            .slice(0, limit)
            .join(' / ');
    }

    function dateTextVariants(date) {
        if (!date) return [];
        return uniq([
            isoDate(date),
            usDate(date),
            `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`,
            date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        ]).map(value => low(value));
    }

    function exactDateValue(year, month, day) {
        const y = Number(year);
        const m = Number(month);
        const d = Number(day);
        const value = new Date(y, m - 1, d);
        return value.getFullYear() === y && value.getMonth() === m - 1 && value.getDate() === d ? value : null;
    }

    function extractDateMentions(source) {
        const raw = String(source || '');
        const out = [];
        const spans = new Set();
        const add = (match, date) => {
            if (!date) return;
            const key = `${match.index}:${match[0].length}`;
            if (spans.has(key)) return;
            spans.add(key);
            out.push({ date, index: match.index, raw: match[0] });
        };
        let match;
        const isoPattern = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;
        while ((match = isoPattern.exec(raw))) add(match, exactDateValue(match[1], match[2], match[3]));
        const numericPattern = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/g;
        while ((match = numericPattern.exec(raw))) {
            const year = String(match[3]).length === 2 ? Number(`20${match[3]}`) : Number(match[3]);
            add(match, exactDateValue(year, match[1], match[2]));
        }
        const monthPattern = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+20\d{2}\b/gi;
        while ((match = monthPattern.exec(raw))) {
            const cleaned = match[0].replace(/(\d)(?:st|nd|rd|th)\b/i, '$1');
            const parsed = new Date(cleaned);
            if (!Number.isNaN(parsed.getTime())) add(match, new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
        }
        const dayFirstPattern = /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+20\d{2}\b/gi;
        while ((match = dayFirstPattern.exec(raw))) {
            const cleaned = match[0].replace(/(\d)(?:st|nd|rd|th)\b/i, '$1');
            const parsed = new Date(cleaned);
            if (!Number.isNaN(parsed.getTime())) add(match, new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
        }
        return out.sort((a, b) => a.index - b.index);
    }

    function containsDateText(source, date) {
        return extractDateMentions(source).some(item => sameDay(item.date, date));
    }

    function countDateMentions(source, date) {
        return extractDateMentions(source).filter(item => sameDay(item.date, date)).length;
    }

    function labeledDateMatch(source, kind, date) {
        const normalized = low(source);
        const label = kind === 'start'
            ? /(?:start(?:ing)?\s*date|starts?|begins?|beginning)/g
            : /(?:end(?:ing)?\s*date|ends?|expires?|expiration)/g;
        let match;
        while ((match = label.exec(normalized))) {
            if (containsDateText(normalized.slice(match.index, match.index + 220), date)) return true;
        }
        return false;
    }

    function endDateEvidence(source, plan, options = {}) {
        if (!sameDay(plan.startDate, plan.endDate)) return containsDateText(source, plan.endDate);
        if (options.requireLabeledSingleDay) {
            return labeledDateMatch(source, 'start', plan.startDate) && labeledDateMatch(source, 'end', plan.endDate);
        }
        return countDateMentions(source, plan.endDate) >= 2;
    }

    function exactCodeInText(source, code) {
        const escaped = escapeRegExp(String(code || '').toUpperCase());
        const regex = new RegExp(`(?:^|[^A-Z0-9_\\\-/])${escaped}(?=$|[^A-Z0-9_\\\-/])`, 'i');
        return regex.test(String(source || '').toUpperCase());
    }
    function parseAssignedJsonObject(source, marker = 'Etsy.Context') {
        const raw = String(source || '');
        const markerIndex = raw.indexOf(marker);
        if (markerIndex < 0) return null;
        let start = raw.indexOf('{', markerIndex + marker.length);
        if (start < 0) return null;
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let i = start; i < raw.length; i += 1) {
            const char = raw[i];
            if (inString) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === '"') inString = false;
                continue;
            }
            if (char === '"') inString = true;
            else if (char === '{') depth += 1;
            else if (char === '}') {
                depth -= 1;
                if (depth === 0) {
                    try { return JSON.parse(raw.slice(start, i + 1)); }
                    catch { return null; }
                }
            }
        }
        return null;
    }

    function pageContextsFromDocument(root = document) {
        const contexts = [];
        const seen = new Set();
        const push = value => {
            if (!value || typeof value !== 'object') return;
            let key = '';
            try { key = JSON.stringify(value); } catch { key = randomId('context-'); }
            if (seen.has(key)) return;
            seen.add(key);
            contexts.push(value);
        };
        if (root === document) {
            try { push(window?.Etsy?.Context); } catch {}
        }
        Array.from(root?.querySelectorAll?.('script') || []).forEach(script => {
            const source = String(script.textContent || '').trim();
            if (!source) return;
            if (/application\/json/i.test(script.type || '') || /^[\[{]/.test(source)) {
                try { push(JSON.parse(source)); } catch {}
            }
            if (source.includes('Etsy.Context')) push(parseAssignedJsonObject(source, 'Etsy.Context'));
        });
        return contexts;
    }
    function findSalesDataCollections(contexts) {
        const collections = [];
        const seen = new Set();
        const walk = (value, depth = 0) => {
            if (!value || typeof value !== 'object' || depth > 10 || seen.has(value)) return;
            seen.add(value);
            if (Object.prototype.hasOwnProperty.call(value, 'sales_data') && value.sales_data && typeof value.sales_data === 'object') {
                collections.push(value.sales_data);
            }
            if (Array.isArray(value)) value.forEach(item => walk(item, depth + 1));
            else Object.values(value).forEach(item => walk(item, depth + 1));
        };
        contexts.forEach(context => walk(context));
        return collections;
    }

    function epochDateCandidates(value) {
        if (value == null || value === '') return [];
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) return [];
        const millis = numeric < 1e12 ? numeric * 1000 : numeric;
        const date = new Date(millis);
        if (Number.isNaN(date.getTime())) return [];
        const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const utc = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
        return uniq([isoDate(local), isoDate(utc)]);
    }

    function discountNumber(value) {
        if (value == null) return null;
        const match = String(value).match(/-?\d+(?:\.\d+)?/);
        return match ? Number(match[0]) : null;
    }

    function normalizePolicyRaw(raw) {
        if (!raw || typeof raw !== 'object') return {};
        const nested = raw.promotion_data && typeof raw.promotion_data === 'object' ? raw.promotion_data : {};
        return { ...raw, ...nested };
    }

    function structuredDiscountEvidence(rawInput) {
        const raw = normalizePolicyRaw(rawInput || {});
        const percentFields = [raw.reward_percent_discount_on_order, raw.reward_percent_discount_on_items_in_set, raw.percent_discount, raw.discount_percent, raw.percentage];
        const fixedFields = [raw.reward_fixed_discount_on_order, raw.reward_fixed_discount_on_items_in_set, raw.fixed_discount, raw.amount_discount, raw.discount_amount];
        const percentField = percentFields.map(discountNumber).find(value => Number.isFinite(value) && value > 0);
        const fixedField = fixedFields.map(discountNumber).find(value => Number.isFinite(value) && value > 0);
        const displayValue = raw.discount_value ?? raw.reward_value ?? raw.discount ?? '';
        const displaySource = low(displayValue);
        const explicitType = low(raw.reward_type ?? raw.discount_type ?? raw.discount_kind ?? raw.value_type);
        if (percentField != null) return { kind: 'percent', value: Number(percentField) };
        if (fixedField != null) return { kind: 'fixed', value: Number(fixedField) };
        if (hasPercentSignal(displaySource) || /percent|percentage|pct/.test(explicitType)) return { kind: 'percent', value: discountNumber(displayValue) };
        if (hasFixedAmountSignal(displaySource) || /fixed|amount|money|currency/.test(explicitType)) return { kind: 'fixed', value: discountNumber(displayValue) };
        return { kind: 'unknown', value: null };
    }

    function compactPolicyRaw(rawInput) {
        const raw = normalizePolicyRaw(rawInput || {});
        const keys = [
            'status','state','promotion_status','is_cancelled','is_canceled','is_stopped','is_deleted','is_active','is_scheduled',
            'promotion_type','discoverability_type','promotion_subtype','grants_buyer_targeted_offers','is_buyer_targeted_offer_campaign_stopped',
            'start_date','start_date_ms','end_date','end_date_ms','sale_type','type','promotion_kind','offer_type','listing_scope','scope','all_listings','applies_to_all_listings',
            'reward_set_listing_ids','listing_ids','eligible_listing_ids','included_listing_ids','eligible_region_id','region_id','region','eligible_region','country_scope','is_everywhere',
            'discount_value','reward_percent_discount_on_order','reward_percent_discount_on_items_in_set','reward_fixed_discount_on_order','reward_fixed_discount_on_items_in_set','reward_value','discount','reward_type','discount_type','discount_kind','value_type'
        ];
        const out = {};
        keys.forEach(key => { if (Object.prototype.hasOwnProperty.call(raw, key)) out[key] = raw[key]; });
        return out;
    }

    function structuredPromotionRecords(root = document) {
        const records = [];
        const seen = new Set();
        const contexts = Array.isArray(root) ? root : pageContextsFromDocument(root);
        const walk = (value, path = '', depth = 0) => {
            if (!value || typeof value !== 'object' || depth > 12 || seen.has(value)) return;
            seen.add(value);
            if (Array.isArray(value)) {
                value.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1));
                return;
            }
            const normalized = normalizePolicyRaw(value);
            const name = normalized.promotion_name ?? normalized.sale_name ?? normalized.promo_name ?? normalized.coupon_name ?? normalized.name;
            const promotionId = normalized.promotion_id ?? normalized.promotionId ?? normalized.id;
            if (name && promotionId && /sales_data|promotion_data|promotions|discount/i.test(path + ' ' + JSON.stringify(Object.keys(normalized)))) {
                const discountEvidence = structuredDiscountEvidence(normalized);
                records.push({
                    source: 'structured',
                    path,
                    raw: compactPolicyRaw(normalized),
                    name: String(name),
                    promotionId: String(promotionId),
                    href: `/your/shops/me/sales-discounts/details-stats/promotion/${encodeURIComponent(String(promotionId))}`,
                    discount: discountEvidence.value,
                    discountKind: discountEvidence.kind,
                    startDates: uniq([
                        ...epochDateCandidates(normalized.start_date_ms),
                        ...epochDateCandidates(normalized.start_date),
                        ...epochDateCandidates(normalized.startDate),
                        ...(parseFlexibleDate(normalized.start_date_text || normalized.startDateText) ? [isoDate(parseFlexibleDate(normalized.start_date_text || normalized.startDateText))] : []),
                    ]),
                    endDates: uniq([
                        ...epochDateCandidates(normalized.end_date_ms),
                        ...epochDateCandidates(normalized.end_date),
                        ...epochDateCandidates(normalized.endDate),
                        ...(parseFlexibleDate(normalized.end_date_text || normalized.endDateText) ? [isoDate(parseFlexibleDate(normalized.end_date_text || normalized.endDateText))] : []),
                    ]),
                    text: JSON.stringify(compactPolicyRaw(normalized)),
                });
            }
            Object.entries(value).forEach(([key, child]) => walk(child, `${path}.${key}`, depth + 1));
        };
        contexts.forEach((context, index) => walk(context, `context[${index}]`, 0));
        return records;
    }
    function promotionCandidates(root = document) {
        const selector = 'a[href*="/sales-discounts/promotion/"], a[href*="/sales-discounts/details-stats/promotion/"]';
        const isNumericLink = link => /\/sales-discounts\/(?:details-stats\/)?promotion\/\d+(?:[/?#]|$)/.test(link?.getAttribute?.('href') || link?.href || '');
        const linksWithin = node => {
            const links = [];
            if (node?.matches?.(selector) && isNumericLink(node)) links.push(node);
            Array.from(node?.querySelectorAll?.(selector) || []).filter(isNumericLink).forEach(link => links.push(link));
            return Array.from(new Set(links));
        };
        const links = Array.from(root?.querySelectorAll?.(selector) || []).filter(isNumericLink).filter(evidenceNodeVisible);
        const seen = new Set();
        const rows = [];
        links.forEach(link => {
            const href = link.href || link.getAttribute('href') || '';
            const promotionId = promotionIdFromUrl(href);
            if (!promotionId || seen.has(promotionId)) return;
            const boundary = link.closest('tr, [data-testid*="promotion" i], [data-testid*="discount" i], [data-testid*="sale" i], article, li, .wt-card') || link.parentElement || link;
            if (boundary.closest?.('[role="alert"], .wt-alert--error, .has-error-msg, .wt-validation__message, [data-testid*="error" i]')) return;
            let current = link;
            let isolated = link;
            while (current && boundary.contains(current)) {
                const localLinks = linksWithin(current);
                if (localLinks.length === 1 && localLinks[0] === link) isolated = current;
                else if (localLinks.length > 1) break;
                if (current === boundary) break;
                current = current.parentElement;
            }
            const isolatedLinks = linksWithin(isolated);
            if (isolatedLinks.length !== 1 || isolatedLinks[0] !== link) return;
            const codeNode = isolated.querySelector?.('[data-testid*="discount-code" i], [data-testid*="promo-code" i], [data-testid*="promotion-code" i], [data-testid*="coupon-code" i]');
            const linkText = semanticVisibleText(link);
            const codeText = semanticVisibleText(codeNode) || linkText;
            const candidateText = semanticVisibleText(isolated);
            if (!candidateText) return;
            seen.add(promotionId);
            rows.push({
                source: 'dom',
                node: isolated,
                boundary,
                isolated: true,
                multiLinkBoundary: linksWithin(boundary).length > 1,
                text: candidateText,
                name: codeText,
                codeText,
                href,
                promotionId,
                raw: null,
            });
        });
        return rows;
    }
    function exactCoreMatch(plan, candidate, aliases) {
        const source = candidate.text || '';
        const explicitNames = [candidate.name, candidate.codeText].filter(Boolean).map(value => String(value).trim().toUpperCase());
        const matchedName = aliases.find(name => explicitNames.includes(String(name || '').trim().toUpperCase()))
            || (candidate.isolated ? aliases.find(name => exactCodeInText(source, name)) : null);
        if (!matchedName) return { matchedName: '', name: false, discount: false, start: false, end: false };
        let discountMatch = false;
        if (candidate.discountKind === 'fixed') discountMatch = false;
        else if (candidate.discountKind === 'percent') discountMatch = Number(candidate.discount) === Number(plan.discount);
        else if (candidate.discount != null) discountMatch = hasPercentSignal(source) && Number(candidate.discount) === Number(plan.discount);
        else discountMatch = new RegExp(`(?:^|[^0-9])${plan.discount}\\s*%(?:$|[^0-9])`, 'i').test(source);
        const startMatch = Array.isArray(candidate.startDates)
            ? candidate.startDates.includes(plan.startDateIso)
            : containsDateText(source, plan.startDate);
        const planEnd = plan.endDate instanceof Date ? plan.endDate : parseIso(plan.endDateIso);
        const exclusiveEndIso = planEnd ? isoDate(addDays(planEnd, 1)) : '';
        const endMatch = Array.isArray(candidate.endDates)
            ? candidate.endDates.some(value => value === plan.endDateIso || (isCanonicalDetailsStatsRecord(candidate) && !!exclusiveEndIso && value === exclusiveEndIso))
            : endDateEvidence(source, plan);
        return { matchedName, name: true, discount: discountMatch, start: startMatch, end: endMatch };
    }
    function rawEpochMillis(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) return null;
        return numeric < 1e12 ? numeric * 1000 : numeric;
    }
    function isCanonicalDetailsStatsRecord(candidate) {
        return candidate?.source === 'structured'
            && /^\d+$/.test(String(candidate?.promotionId || ''))
            && /detailsAndStatsPageData\.promotions\[\d+\]/.test(String(candidate?.path || ''));
    }
    function submittedFormEvidenceMatches(plan, expectedRegion, options = {}) {
        const submission = options.submission || job?.submission;
        const evidence = options.formEvidence || job?.formEvidence || submission?.formEvidence;
        if (!options.postSubmit || !submission || submission.status !== 'submitted') return false;
        if (!evidence || !plan?.idempotencyKey) return false;
        return submission.idempotencyKey === plan.idempotencyKey
            && evidence.idempotencyKey === plan.idempotencyKey
            && evidence.saleName === plan.saleName
            && Number(evidence.discount) === Number(plan.discount)
            && evidence.startDate === plan.startDateIso
            && evidence.endDate === plan.endDateIso
            && evidence.flowType === 'run_sale'
            && String(evidence.regionValue ?? '') === String(expectedRegion)
            && String(submission.regionValue ?? '') === String(expectedRegion)
            && submission.listingScope === 'all';
    }
    function policyEvidence(candidate, plan, options = {}) {
        const raw = normalizePolicyRaw(candidate.raw || {});
        const display = low(candidate.text || '');
        const expectedRegion = String(options.countryValue ?? job?.countryValue ?? '0');
        const canonicalDetailsRecord = isCanonicalDetailsStatsRecord(candidate);

        const rawType = low(raw.sale_type ?? raw.type ?? raw.promotion_kind ?? raw.offer_type);
        const normalizedType = rawType.replace(/[^a-z0-9]+/g, '');
        const positiveTypes = ['sale', 'runsale', 'shopwide', 'shopwidesale'];
        const negativeTypes = ['promocode', 'coupon', 'targetedoffer', 'abandonedcart', 'thankyou', 'favorites', 'favoriteditem', 'makeanoffer'];
        const structuredRunSale = positiveTypes.includes(normalizedType);

        const rawStatus = low(raw.status ?? raw.state ?? raw.promotion_status);
        const rawStartMs = rawEpochMillis(raw.start_date_ms ?? raw.start_date);
        const rawEndMs = rawEpochMillis(raw.end_date_ms ?? raw.end_date);
        const explicitlyStopped = boolish(raw.is_buyer_targeted_offer_campaign_stopped) === true;
        const temporalStatusKnown = canonicalDetailsRecord && structuredRunSale && rawStartMs != null && rawEndMs != null;
        const temporalStatusPositive = temporalStatusKnown && !explicitlyStopped && rawEndMs >= Date.now();
        const statusNegative = [raw.is_cancelled, raw.is_canceled, raw.is_stopped, raw.is_deleted].some(value => boolish(value) === true)
            || (temporalStatusKnown && (explicitlyStopped || rawEndMs < Date.now()))
            || ['canceled', 'cancelled', 'stopped', 'expired', 'ended', 'inactive', 'draft', 'deleted'].includes(rawStatus)
            || /\bstatus\s*:\s*(?:cancell?ed|stopped|expired|ended|inactive|draft|deleted)\b/.test(display);
        const statusPositive = [raw.is_scheduled, raw.is_active].some(value => boolish(value) === true)
            || temporalStatusPositive
            || ['active', 'scheduled', 'running', 'upcoming', 'live'].includes(rawStatus)
            || /\bstatus\s*:\s*(?:active|scheduled|running|upcoming|live)\b|\b(?:active sale|scheduled sale|currently active|upcoming sale)\b/.test(display);

        let typeValue = null;
        if (rawType) {
            if (structuredRunSale) typeValue = true;
            else if (negativeTypes.includes(normalizedType)) typeValue = false;
        } else if (/\b(?:sale|promotion)\s*type\s*:\s*(?:run a sale|sale)\b|\btype\s*:\s*sale\b|\brun a sale\b/.test(display)) {
            typeValue = true;
        } else if (/\b(?:sale|promotion)\s*type\s*:\s*(?:coupon|promo code|targeted offer|abandoned cart|thank you)\b|\btargeted offer\b|\babandoned cart\b/.test(display)) {
            typeValue = false;
        }

        const explicitListingIds = raw.reward_set_listing_ids ?? raw.listing_ids ?? raw.eligible_listing_ids ?? raw.included_listing_ids;
        const rawScope = low(raw.listing_scope ?? raw.scope);
        const scopeNegated = hasAllListingsNegation(display);
        const finiteSelection = /\b(?:selected|included|chosen)\s*[:\-]?\s*[1-9]\d*\s+(?:of\s+\d+\s+)?listings?\b/.test(display)
            || /\b[1-9]\d*\s+(?:of\s+\d+\s+)?listings?\s+(?:selected|included|chosen)\b/.test(display);
        const structuredAll = boolish(raw.all_listings) === true || boolish(raw.applies_to_all_listings) === true || ['all', 'entire_shop'].includes(rawScope)
            || (normalizedType === 'shopwide' && Array.isArray(explicitListingIds) && explicitListingIds.length === 0);
        const structuredSpecific = ['specific', 'selected', 'individual'].includes(rawScope)
            || (Array.isArray(explicitListingIds) && explicitListingIds.length > 0);
        let scopeValue = null;
        if (structuredSpecific || scopeNegated || finiteSelection || /\bspecific\s+listings?|\bindividual\s+listings?/.test(display)) scopeValue = false;
        else if (structuredAll) scopeValue = true;

        const rawRegionSource = raw.eligible_region_id ?? raw.region_id ?? raw.region ?? raw.eligible_region ?? raw.country_scope;
        const rawRegion = rawRegionSource && typeof rawRegionSource === 'object'
            ? (rawRegionSource.id ?? rawRegionSource.value ?? rawRegionSource.region_id ?? rawRegionSource.name ?? rawRegionSource.label)
            : rawRegionSource;
        const rawRegionText = low(rawRegion ?? '');
        const hasExplicitRegion = ['eligible_region_id', 'region_id', 'region', 'eligible_region', 'country_scope', 'is_everywhere']
            .some(key => Object.prototype.hasOwnProperty.call(raw, key));
        let regionValue = null;
        if (rawRegion != null && rawRegionText !== '') {
            if (expectedRegion === '0') regionValue = rawRegionText === '0' || /^(?:everywhere|worldwide|all(?: countries| regions)?)$/.test(rawRegionText);
            else regionValue = rawRegionText === low(expectedRegion);
        } else if (expectedRegion === '0') {
            if (/\b(?:region|valid in|available in)\s*:\s*(?:everywhere|worldwide|all countries|all regions)\b/.test(display)) regionValue = true;
            else if (/\b(?:region|valid in|available in)\s*:\s*(?:united states(?: only)?|u\.s\.(?: only)?|us(?: only)?|specific countr(?:y|ies))\b/.test(display)) regionValue = false;
        } else if (new RegExp(`\\b(?:region|valid in|available in)\\s*:\\s*${escapeRegExp(low(expectedRegion))}\\b`).test(display)) {
            regionValue = true;
        }
        if (boolish(raw.is_everywhere) === true && expectedRegion === '0') regionValue = true;
        // Details & Stats omits the default worldwide region. Post-submit verification
        // may bridge only that omitted field with the exact locked form/submission proof;
        // preflight and any explicit conflicting region remain fail-closed.
        const regionFromSubmittedForm = regionValue == null
            && expectedRegion === '0'
            && !hasExplicitRegion
            && canonicalDetailsRecord
            && normalizedType === 'shopwide'
            && submittedFormEvidenceMatches(plan, expectedRegion, options);
        if (regionFromSubmittedForm) regionValue = true;

        const fields = {
            status: statusNegative ? false : (statusPositive ? true : null),
            type: typeValue,
            scope: scopeValue,
            region: regionValue,
        };
        const mismatches = Object.entries(fields).filter(([, value]) => value === false).map(([key]) => key);
        const unknown = Object.entries(fields).filter(([, value]) => value == null).map(([key]) => key);
        return { ok: mismatches.length === 0 && unknown.length === 0, fields, mismatches, unknown, serverOnly: !regionFromSubmittedForm };
    }
    function activePromotionFilterEvidence(root, source = '') {
        const normalized = low(source);
        const textEvidence = /match(?:es)?\s+(?:your\s+)?current\s+filters?|clear\s+(?:all\s+)?filters?|filters?\s*\([1-9]\d*\)|filtered\s+by|status\s+filter\s*:\s*(?!all\b)|search\s+results?\s+for|no\s+(?:sales|discounts|promotions)\s+match/.test(normalized);
        const defaultValue = value => !value || /^(?:all|any|all statuses|all promotions|show all|all_statuses|all_promotions|show_all)$/.test(low(value));
        let controlEvidence = false;
        Array.from(root?.querySelectorAll?.('select, input, [aria-pressed="true"], [aria-selected="true"], [data-filter]') || []).forEach(control => {
            if (controlEvidence || !evidenceNodeVisible(control)) return;
            const descriptor = low(`${control.id || ''} ${control.getAttribute?.('name') || ''} ${control.getAttribute?.('aria-label') || ''} ${control.getAttribute?.('data-testid') || ''}`);
            if (!/filter|status|search|query|promotion/.test(descriptor)) return;
            if (control.matches?.('input')) {
                const value = low(control.value || '');
                if (!defaultValue(value)) controlEvidence = true;
            } else if (control.matches?.('select')) {
                const rawValue = low(control.value || '');
                const selectedText = low(control.selectedOptions?.[0]?.textContent || '');
                if (!defaultValue(rawValue) || !defaultValue(selectedText)) controlEvidence = true;
            } else if (control.getAttribute?.('aria-pressed') === 'true' || control.getAttribute?.('aria-selected') === 'true') {
                const label = low(semanticVisibleText(control));
                if (!defaultValue(label)) controlEvidence = true;
            }
        });
        let urlEvidence = false;
        try {
            const href = root?.location?.href || root?.querySelector?.('link[rel="canonical"]')?.href || '';
            if (href) {
                const parsed = new URL(href, location.origin);
                urlEvidence = Array.from(parsed.searchParams.entries()).some(([key, value]) => /filter|status|search|query|q/i.test(key) && !defaultValue(value));
            }
        } catch {}
        return textEvidence || controlEvidence || urlEvidence;
    }
    function assessPromotionListReadability(root = document) {
        const contexts = pageContextsFromDocument(root);
        const salesCollections = findSalesDataCollections(contexts);
        const structured = structuredPromotionRecords(contexts);
        const rows = promotionCandidates(root);
        const container = root?.querySelector?.('main#main-content, main, [role="main"]') || root?.body || root?.documentElement || root;
        const source = low(semanticVisibleText(container, { includeValues: true }));
        const filterActive = activePromotionFilterEvidence(root, source);
        const explicitEmptyText = /\bno\s+(?:sales|discounts|promotions)(?:\s+yet)?\b|\bnothing\s+to\s+show\b|\byou\s+(?:do\s+not|don['’]t|haven['’]t)\s+(?:have|created)\s+any\s+(?:sales|discounts|promotions)\b/.test(source);
        const explicitEmpty = explicitEmptyText && !filterActive;
        const ariaBusy = Array.from(root?.querySelectorAll?.('[aria-busy="true"], .wt-spinner, [data-testid*="loading" i], [class*="skeleton" i]') || []).some(evidenceNodeVisible);
        const loadingText = /\bloading\s+(?:promotions|sales|discounts)\b|\bplease wait\b/.test(source);
        const loading = ariaBusy || loadingText;
        const controlTexts = Array.from(root?.querySelectorAll?.('button, [role="button"], a') || []).filter(evidenceNodeVisible).map(node => low(semanticVisibleText(node))).filter(Boolean);
        const hasLoadMore = controlTexts.some(value => /^(?:load|show|view)\s+more(?:\s+(?:promotions|sales|discounts))?$|more\s+(?:promotions|sales|discounts)/.test(value));
        let rangeIncomplete = false;
        const rangePatterns = [
            /showing\s+(\d+)\s*[-–—]\s*(\d+)\s+of\s+(\d+)/g,
            /(\d+)\s*[-–—]\s*(\d+)\s+of\s+(\d+)\s+(?:promotions|sales|discounts)/g,
            /showing\s+(\d+)\s+of\s+(\d+)\s+(?:promotions|sales|discounts)?/g,
        ];
        for (const pattern of rangePatterns) {
            let match;
            while ((match = pattern.exec(source))) {
                const end = Number(match[2]);
                const total = Number(match[3] ?? match[2]);
                const shown = match.length === 3 ? Number(match[1]) : end;
                if ((match.length >= 4 && end < total) || (match.length === 3 && shown < total)) rangeIncomplete = true;
            }
        }
        const concrete = structured.length > 0 || rows.length > 0;
        const readable = !loading && (concrete || explicitEmpty);
        const dynamicIncomplete = loading || hasLoadMore || rangeIncomplete || filterActive;
        const complete = readable && !dynamicIncomplete;
        const message = loading
            ? 'Promosyon listesi hâlâ yükleniyor (aria-busy/spinner/loading). Görünen satırlar tam liste kabul edilmedi.'
            : !readable
                ? (filterActive
                    ? 'Promosyon görünümü aktif filtre/arama altında ve tam mağaza listesi olarak okunamaz; kampanya yok kabul edilmedi.'
                    : 'Promosyon listesi kesin okunamadı; gizli boş durum, boş sales_data kabuğu veya hydrate edilmemiş Etsy yanıtı kampanya yok sayılmadı.')
                : dynamicIncomplete
                    ? (filterActive
                        ? 'Promosyon görünümünde aktif filtre/arama var; filtre dışındaki kayıtlar kontrol edilmeden kampanya yok kabul edilmedi.'
                        : 'Promosyon listesi kısmi görünüyor; Load more/sanal liste veya gösterilen-toplam aralığı tüm kayıtların yüklenmediğini gösteriyor.')
                    : 'Promosyon listesi okunabilir ve bu sayfa için tam görünüyor.';
        return { readable, complete, contexts, salesCollections, structured, rows, explicitEmpty, loading, dynamicIncomplete, hasLoadMore, rangeIncomplete, filterActive, message };
    }
    function serializePromotionCandidate(candidate) {
        if (!candidate) return null;
        const sourceText = String(candidate.text || '').slice(0, 6000);
        const percentMatch = sourceText.match(/(?:^|[^0-9])(\d+(?:\.\d+)?)\s*%(?:$|[^0-9])/);
        const dateIsos = uniq(extractDateMentions(sourceText).map(item => isoDate(item.date)));
        const existingStarts = Array.isArray(candidate.startDates) ? candidate.startDates.filter(Boolean) : [];
        const existingEnds = Array.isArray(candidate.endDates) ? candidate.endDates.filter(Boolean) : [];
        const discountKind = candidate.discountKind || (percentMatch ? 'percent' : (hasFixedAmountSignal(sourceText) ? 'fixed' : 'unknown'));
        const discount = candidate.discount ?? (discountKind === 'percent' && percentMatch ? Number(percentMatch[1]) : null);
        return {
            source: candidate.source || 'unknown',
            path: candidate.path || '',
            raw: compactPolicyRaw(candidate.raw || {}),
            name: candidate.name || '',
            codeText: candidate.codeText || '',
            promotionId: candidate.promotionId || '',
            href: candidate.href || '',
            discount,
            discountKind,
            startDates: existingStarts.length ? existingStarts : dateIsos,
            endDates: existingEnds.length ? existingEnds : dateIsos,
            text: sourceText,
        };
    }

    function promotionCandidateKey(candidate) {
        return String(candidate?.promotionId || candidate?.href || `${candidate?.name || candidate?.codeText || ''}|${(candidate?.startDates || []).join(',')}|${(candidate?.endDates || []).join(',')}|${candidate?.discount ?? ''}`);
    }

    function mergePromotionRecords(existing, incoming) {
        const map = new Map();
        [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])].forEach(candidate => {
            const serialized = serializePromotionCandidate(candidate);
            if (!serialized) return;
            map.set(promotionCandidateKey(serialized), serialized);
        });
        return Array.from(map.values()).slice(0, 5000);
    }

    function assessPromotionCandidates(plan, candidates, readability, options = {}) {
        const aliases = uniq(options.aliases?.length ? options.aliases : [plan.saleName]);
        const negative = /could not|failed|failure|unable|invalid|not created|not scheduled|conflict|overlap|error|try again|already exists/i;
        const matches = [];
        let closest = null;
        for (const candidate of candidates) {
            const candidateText = candidate.text || '';
            if (!candidateText || negative.test(candidateText)) continue;
            const core = exactCoreMatch(plan, candidate, aliases);
            if (!core.name) continue;
            const href = candidate.href || (candidate.promotionId ? `/your/shops/me/sales-discounts/details-stats/promotion/${candidate.promotionId}` : '');
            const numericLink = /\/sales-discounts\/(?:details-stats\/)?promotion\/\d+(?:[/?#]|$)/.test(href || '');
            const policy = policyEvidence(candidate, plan, options);
            const score = 50 + (core.discount ? 15 : 0) + (core.start ? 15 : 0) + (core.end ? 10 : 0) + (numericLink ? 5 : 0);
            const current = { score, candidate, core, policy, href, numericLink };
            matches.push(current);
            if (!closest || score > closest.score) closest = current;
        }

        const exactMatches = matches.filter(item => item.core.discount && item.core.start && item.core.end);
        const conflicting = exactMatches.find(item => item.policy.mismatches.length > 0);
        if (conflicting) {
            return {
                ok: false,
                readComplete: !!readability.complete,
                ambiguousExisting: true,
                policyMismatch: true,
                detailRequired: !!conflicting.numericLink,
                url: conflicting.href || '',
                matchedName: conflicting.core.matchedName,
                cacheRecord: serializePromotionCandidate(conflicting.candidate),
                message: `Kod, yüzde indirim ve tarihler bulundu ancak çelişkili/uyumsuz sunucu politika alanları algılandı: ${conflicting.policy.mismatches.join(', ')}.`,
            };
        }

        const verified = exactMatches.find(item => item.numericLink && item.policy.ok);
        if (verified) {
            const proofText = verified.policy.serverOnly
                ? 'yalnızca Etsy sunucu verisinden'
                : 'Etsy sunucu kaydı ve aynı gönderime bağlı kilitli form kanıtından';
            return {
                ok: true,
                readComplete: true,
                url: verified.href,
                matchedName: verified.core.matchedName,
                source: verified.candidate.source || 'list',
                cacheRecord: serializePromotionCandidate(verified.candidate),
                message: `Promosyon kodu, yüzde indirim, tarihler, durum, tür, bölge ve All listings kapsamıyla ${proofText} doğrulandı: ${verified.core.matchedName}.`,
            };
        }

        if (exactMatches.length) {
            const best = exactMatches.sort((a, b) => b.score - a.score)[0];
            const policyText = best.policy.mismatches.length
                ? `Uyumsuz politika alanları: ${best.policy.mismatches.join(', ')}.`
                : `Etsy sunucusunda doğrulanamayan politika alanları: ${best.policy.unknown.join(', ')}.`;
            return {
                ok: false,
                readComplete: !!readability.complete,
                ambiguousExisting: true,
                policyMismatch: best.policy.mismatches.length > 0,
                detailRequired: !!best.numericLink,
                url: best.href,
                matchedName: best.core.matchedName,
                cacheRecord: serializePromotionCandidate(best.candidate),
                message: `Kod, yüzde indirim ve tarihler bulundu; ${policyText}`,
            };
        }

        if (closest) {
            const missing = [!closest.core.discount && 'yüzde indirim', !closest.core.start && 'başlangıç', !closest.core.end && 'bitiş', !closest.numericLink && 'sayısal detay bağlantısı'].filter(Boolean).join(', ');
            return { ok: false, readComplete: !!readability.complete, ambiguousExisting: true, url: closest.href || '', matchedName: closest.core.matchedName, cacheRecord: serializePromotionCandidate(closest.candidate), message: `Kod gerçek promosyon kaydında bulundu ancak kesin alanlar eksik: ${missing || 'bilinmeyen alan'}.` };
        }
        if (!readability.readable || !readability.complete) return { ok: false, readComplete: false, unreadable: !readability.readable, dynamicIncomplete: !!readability.dynamicIncomplete, message: readability.message };
        return { ok: false, readComplete: true, notFound: true, message: `Tam ve okunabilir promosyon verisinde kesin kod bulunamadı: ${aliases.join(' / ')}.` };
    }

    function promotionIndexUsable(activeJob = job) {
        const index = activeJob?.promotionIndex;
        return !!(index && index.complete && Array.isArray(index.records)
            && String(index.shopId || '') === String(activeJob?.shop?.shopId || '')
            && Number(index.expiresAt || 0) > Date.now()
            && Number(index.uses || 0) < PROMOTION_INDEX_MAX_USES);
    }

    async function verifyUsingPromotionIndex(plan, options = {}) {
        if (!options.strict || options.postSubmit || options.allowCache === false || !promotionIndexUsable(job)) return null;
        const token = options.token || makeToken();
        const index = job.promotionIndex;
        const result = assessPromotionCandidates(plan, index.records, { readable: true, complete: true, message: 'Kısa süreli tam promosyon indeksi kullanıldı.' }, options);
        // A cached "not found" is never authoritative: another tab/device/user may have
        // created the campaign after the index was built. Only a positive code candidate
        // with a concrete detail URL may be used, and that detail is fetched fresh below.
        if ((!result.ok && !result.ambiguousExisting) || !result.url) return null;
        await mutateJob(token, next => {
            if (next.promotionIndex && String(next.promotionIndex.shopId || '') === String(next.shop?.shopId || '')) {
                next.promotionIndex.uses = Number(next.promotionIndex.uses || 0) + 1;
            }
        });
        return {
            ...result,
            fromCache: true,
            detailRequired: true,
            readComplete: true,
            message: `${result.message} Pozitif indeks adayı taze detay sayfasıyla yeniden doğrulanacak. İndeks yaşı: ${Math.max(0, Math.round((Date.now() - Number(index.builtAt || 0)) / 1000))} sn.`,
        };
    }

    async function persistPromotionIndex(token, records, pagesRead) {
        if (!token) return;
        await mutateJob(token, next => {
            next.promotionIndex = {
                shopId: String(next.shop?.shopId || ''),
                complete: true,
                builtAt: Date.now(),
                expiresAt: Date.now() + PROMOTION_INDEX_TTL_MS,
                uses: 0,
                pagesRead: Math.max(0, intVal(pagesRead, 0)),
                records: mergePromotionRecords([], records),
            };
        });
    }

    async function rememberVerifiedPromotion(plan, record) {
        const token = makeToken();
        if (!token || !record) return;
        await mutateJob(token, next => {
            const index = next.promotionIndex;
            if (!index?.complete || String(index.shopId || '') !== String(next.shop?.shopId || '')) return;
            index.records = mergePromotionRecords(index.records, [record]);
            index.expiresAt = Date.now() + PROMOTION_INDEX_TTL_MS;
        });
    }

    function verifyInDocument(plan, root = document, options = {}) {
        const readability = assessPromotionListReadability(root);
        const candidates = [...readability.structured, ...readability.rows];
        return assessPromotionCandidates(plan, candidates, readability, options);
    }
    function detailEvidenceScore(source) {
        const textValue = low(source);
        const dates = extractDateMentions(textValue).length;
        let score = 0;
        if (/\d+(?:\.\d+)?\s*%/.test(textValue)) score += 2;
        if (dates >= 2) score += 2;
        if (/\bstatus\s*:|\b(?:active|scheduled|upcoming|running)\b/.test(textValue)) score += 1;
        if (/\b(?:sale|promotion)\s*type\s*:|\brun a sale\b/.test(textValue)) score += 1;
        if (/\b(?:region|valid in|available in)\s*:/.test(textValue)) score += 1;
        if (/\b(?:listings? included|scope)\s*:|\ball listings\b|\bentire shop\b/.test(textValue)) score += 1;
        return score;
    }

    function promotionDetailDomCandidates(root, aliases, expectedUrl = '') {
        const container = root?.querySelector?.('main#main-content, main, [role="main"]') || root?.body || root?.documentElement || root;
        if (!container) return [];
        const exactElement = element => {
            const value = semanticVisibleText(element);
            return aliases.some(alias => String(value || '').trim().toUpperCase() === String(alias || '').trim().toUpperCase()
                || new RegExp(`^(?:promotion|sale|code|name)\\s*[:#-]?\\s*${escapeRegExp(String(alias || ''))}$`, 'i').test(value));
        };
        const codeNodes = Array.from(container.querySelectorAll?.('[data-testid*="code" i], code, strong, b, span, p, dd, dt, th, td, h1, h2, h3, h4') || [])
            .filter(evidenceNodeVisible)
            .filter(exactElement);
        const candidates = [];
        const seen = new Set();
        codeNodes.forEach(codeNode => {
            let current = codeNode;
            let chosen = null;
            while (current && current !== container && current.nodeType === 1) {
                const tagOk = current.matches?.('section, article, dl, tr, form, .wt-card, [data-testid*="promotion" i], [data-testid*="sale" i], [data-testid*="discount" i]');
                const value = semanticVisibleText(current, { includeValues: true });
                if (tagOk && exactCodeInText(value, aliases.find(alias => exactCodeInText(value, alias)) || '') && detailEvidenceScore(value) >= 4) {
                    chosen = current;
                    break;
                }
                current = current.parentElement;
            }
            if (!chosen || seen.has(chosen)) return;
            seen.add(chosen);
            const value = semanticVisibleText(chosen, { includeValues: true });
            const matchedName = aliases.find(alias => exactCodeInText(value, alias)) || '';
            candidates.push({
                source: 'detail-dom',
                node: chosen,
                isolated: true,
                name: matchedName,
                codeText: matchedName,
                promotionId: promotionIdFromUrl(expectedUrl),
                href: expectedUrl,
                text: value,
                raw: null,
            });
        });
        return candidates;
    }

    function readableDetailText(root) {
        const container = root?.querySelector?.('main#main-content, main, [role="main"]') || root?.body || root?.documentElement || root;
        return semanticVisibleText(container, { includeValues: true });
    }

    function staticErrorTexts(root) {
        const selectors = '[role="alert"], .wt-alert--error, .has-error-msg, .wt-validation__message, [data-testid*="error" i]';
        const negative = /\berror\b|could\s+not|couldn['’]?t|failed|failure|unable|invalid|required|conflict|overlap|already exists|not created|not scheduled|not available|isn['’]?t available|there was a problem|please fix|highlighted fields|try again|something went wrong|too many|rate limit|temporarily blocked|verify (?:you are|that you're) human|captcha|access denied/i;
        return uniq(Array.from(root?.querySelectorAll?.(selectors) || [])
            .filter(evidenceNodeVisible)
            .map(node => semanticVisibleText(node))
            .filter(value => value && negative.test(value)))
            .slice(0, 6);
    }
    function verifyPromotionDetail(plan, root, options = {}) {
        const aliases = uniq(options.aliases?.length ? options.aliases : [plan.saleName]);
        const explicitErrors = staticErrorTexts(root);
        if (explicitErrors.length) return { ok: false, fatal: true, message: `Promosyon detay sayfası hata verdi: ${explicitErrors.join(' | ')}` };
        const expectedUrl = String(options.expectedUrl || options.requestedUrl || '');
        const finalUrl = String(options.finalUrl || expectedUrl || '');
        const expectedId = promotionIdFromUrl(expectedUrl);
        const finalId = promotionIdFromUrl(finalUrl);
        if (expectedId && finalId !== expectedId) {
            return { ok: false, fatal: true, message: `Promosyon detay isteği beklenen kayıtta kalmadı. Beklenen ID: ${expectedId}; nihai URL: ${finalUrl || 'bilinmiyor'}.` };
        }

        const structured = structuredPromotionRecords(root).filter(candidate => !expectedId || String(candidate.promotionId || '') === expectedId);
        const structuredMatches = structured.filter(candidate => exactCoreMatch(plan, candidate, aliases).name);
        const domMatches = promotionDetailDomCandidates(root, aliases, expectedUrl || finalUrl);
        const candidates = [...structuredMatches, ...domMatches];
        if (!candidates.length) {
            return { ok: false, ambiguousExisting: false, message: 'Promosyon detayında hedef koda bağlı tekil ve yerel bir doğrulama kökü bulunamadı; bütün sayfa metni kanıt olarak kullanılmadı.' };
        }

        const assessed = candidates.map(candidate => ({
            candidate,
            core: exactCoreMatch(plan, candidate, aliases),
            policy: policyEvidence(candidate, plan, options),
        }));
        const exact = assessed.filter(item => item.core.name && item.core.discount && item.core.start && item.core.end);
        const verified = exact.filter(item => item.policy.ok);
        if (verified.length === 1) {
            const item = verified[0];
            const proofText = item.policy.serverOnly
                ? 'sunucu kaydından'
                : 'sunucu kaydı ve aynı gönderime bağlı kilitli form kanıtından';
            return {
                ok: true,
                matchedName: item.core.matchedName,
                source: item.candidate.source || 'detail',
                cacheRecord: serializePromotionCandidate(item.candidate),
                message: `Promosyon detayında tek promotion kaydına bağlı kod, yüzde indirim, tarihler, durum, tür, bölge ve kapsam ${proofText} doğrulandı: ${item.core.matchedName}.`,
            };
        }
        if (verified.length > 1) {
            return { ok: false, fatal: true, ambiguousExisting: true, message: 'Promosyon detayında birden fazla bağımsız kayıt aynı hedef kodu doğruladı; alanlar birleştirilmeden güvenlik için durduruldu.' };
        }
        const best = exact[0] || assessed[0];
        const missing = [!best.core.name && 'kod', !best.core.discount && 'yüzde indirim', !best.core.start && 'başlangıç tarihi', !best.core.end && 'bitiş tarihi'].filter(Boolean);
        const policyPart = best.policy.mismatches.length ? `uyumsuz politika: ${best.policy.mismatches.join(', ')}` : best.policy.unknown.length ? `Etsy sunucusunda eksik politika: ${best.policy.unknown.join(', ')}` : '';
        return {
            ok: false,
            ambiguousExisting: !!best.core.name,
            policyMismatch: best.policy.mismatches.length > 0,
            matchedName: best.core.matchedName,
            cacheRecord: serializePromotionCandidate(best.candidate),
            message: `Promosyon detayında kesin doğrulama tamamlanamadı: ${[...missing, policyPart].filter(Boolean).join(', ') || 'bilinmeyen alan'}.`,
        };
    }
    function extractShopIdentityFromHtml(htmlText) {
        return extractShopIdentityFromSource(htmlText, { allowDocumentFallback: false });
    }

    async function fetchWithTimeout(url, init = {}, timeoutMs = FETCH_TIMEOUT_MS) {
        const globalSignal = automationController?.signal;
        if (globalSignal?.aborted) throw new AutomationCancelledError();
        const localController = new AbortController();
        let timeoutId = null;
        let removeGlobalAbort = () => {};
        let settled = false;
        const cancelPromise = new Promise((_, reject) => {
            const onAbort = () => {
                try { localController.abort(globalSignal?.reason || 'cancelled'); } catch {}
                reject(new AutomationCancelledError());
            };
            if (globalSignal) {
                globalSignal.addEventListener('abort', onAbort, { once: true });
                removeGlobalAbort = () => globalSignal.removeEventListener('abort', onAbort);
            }
        });
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                try { localController.abort('timeout'); } catch {}
                reject(new FetchTimeoutError(`Etsy isteği ${timeoutMs} ms içinde tamamlanmadı.`));
            }, timeoutMs);
        });
        const fetchPromise = Promise.resolve().then(() => fetch(url, { ...init, signal: localController.signal }));
        fetchPromise.catch(() => {});
        try {
            const response = await Promise.race([fetchPromise, cancelPromise, timeoutPromise]);
            settled = true;
            return response;
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
            removeGlobalAbort();
            if (!settled && globalSignal?.aborted) {
                try { localController.abort(globalSignal.reason || 'cancelled'); } catch {}
            }
        }
    }


    async function awaitAutomationBound(promise, timeoutMs, label = 'Etsy yanıtı') {
        const signal = automationController?.signal;
        if (signal?.aborted) throw new AutomationCancelledError();
        let timer = null;
        let removeAbort = () => {};
        const wrapped = Promise.resolve(promise);
        wrapped.catch(() => {});
        const cancel = new Promise((_, reject) => {
            const onAbort = () => reject(new AutomationCancelledError());
            if (signal) {
                signal.addEventListener('abort', onAbort, { once: true });
                removeAbort = () => signal.removeEventListener('abort', onAbort);
            }
        });
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new FetchTimeoutError(`${label} ${timeoutMs} ms içinde tamamlanmadı.`)), timeoutMs);
        });
        try { return await Promise.race([wrapped, cancel, timeout]); }
        finally {
            if (timer) clearTimeout(timer);
            removeAbort();
        }
    }

    async function maintainLeaseForToken(token) {
        if (!token) return;
        const fresh = validateFreshForToken(await gmGet(JOB_KEY, null), token);
        if (!(await acquireLease(fresh))) throw new AutomationCancelledError('Doğrulama sırasında sekme sahipliği kaybedildi.');
        job = fresh;
    }


    async function awaitWithLeaseHeartbeat(promise, token = null) {
        let settled = false;
        let value;
        let failure;
        const task = Promise.resolve(promise).then(
            result => { settled = true; value = result; },
            error => { settled = true; failure = error; },
        );
        task.catch(() => {});
        while (!settled) {
            await Promise.race([task, rawSleep(Math.max(900, LEASE_RENEW_MS - 500))]);
            if (!settled && token) await maintainLeaseForToken(token);
        }
        await task;
        if (failure) throw failure;
        return value;
    }

    async function awaitFetchBudget(token = null) {
        while (true) {
            const now = Date.now();
            fetchRequestTimes = fetchRequestTimes.filter(at => now - at < FETCH_BUDGET_WINDOW_MS);
            const gapWait = Math.max(0, FETCH_MIN_GAP_MS - (now - lastFetchStartedAt));
            const budgetWait = fetchRequestTimes.length >= FETCH_BUDGET_MAX
                ? Math.max(0, FETCH_BUDGET_WINDOW_MS - (now - fetchRequestTimes[0]) + 50)
                : 0;
            const waitMs = Math.max(gapWait, budgetWait);
            if (waitMs <= 0) break;
            if (token) await maintainLeaseForToken(token);
            await sleep(Math.min(waitMs, 1500));
        }
        const startedAt = Date.now();
        lastFetchStartedAt = startedAt;
        fetchRequestTimes.push(startedAt);
    }

    function paginationProgressState(value, baseUrl = DETAILS_STATS_URL) {
        try {
            const parsed = new URL(String(value || ''), baseUrl);
            const groups = new Map();
            const add = (group, rawValue) => {
                const source = String(rawValue ?? '');
                const numeric = /^(?:page|offset)$/.test(group) && /^\d+$/.test(source)
                    ? String(Number(source))
                    : source;
                if (!groups.has(group)) groups.set(group, new Set());
                groups.get(group).add(numeric);
            };
            parsed.searchParams.forEach((rawValue, rawKey) => {
                const key = String(rawKey || '').toLowerCase().replace(/-/g, '_');
                if (/^(?:page|page_number|pagenumber|p)$/.test(key)) add('page', rawValue);
                else if (/^(?:offset|start_index|startindex)$/.test(key)) add('offset', rawValue);
                else if (/^(?:cursor|next_cursor|nextcursor|after|after_cursor|aftercursor|before|before_cursor|beforecursor|end_cursor|endcursor)$/.test(key)) add('cursor', rawValue);
                else if (key === 'start') add(/^\d+$/.test(String(rawValue)) ? 'offset' : 'cursor', rawValue);
            });
            const entries = Array.from(groups.entries())
                .map(([group, values]) => [group, Array.from(values).sort()])
                .sort(([left], [right]) => left.localeCompare(right));
            const normalizePath = path => path.replace(/\/+$/, '') || '/';
            return {
                ok: true,
                origin: parsed.origin,
                pathname: normalizePath(parsed.pathname),
                entries,
                hasProgress: entries.length > 0,
                identity: entries.map(([group, values]) => `${group}=${values.join('|')}`).join('&'),
            };
        } catch {
            return { ok: false, origin: '', pathname: '', entries: [], hasProgress: false, identity: '' };
        }
    }

    function paginationRequestKey(value, baseUrl = DETAILS_STATS_URL) {
        const state = paginationProgressState(value, baseUrl);
        if (!state.ok) return String(value || '');
        return `${state.origin}${state.pathname}${state.identity ? `?${state.identity}` : ''}`;
    }

    function paginationProgressMatches(requestedUrl, finalUrl) {
        const requested = paginationProgressState(requestedUrl);
        const final = paginationProgressState(finalUrl, requestedUrl);
        if (!requested.ok || !final.ok) return false;
        if (!requested.hasProgress) return true;
        const finalGroups = new Map(final.entries);
        return requested.entries.every(([group, expectedValues]) => {
            const actualValues = finalGroups.get(group);
            return !!actualValues
                && actualValues.length === expectedValues.length
                && actualValues.every((value, index) => value === expectedValues[index]);
        });
    }

    async function fetchVerifiedDocument(url, label = 'doğrulama', options = {}) {
        const strict = !!options.strict;
        const token = options.token || null;
        try {
            if (token) await maintainLeaseForToken(token);
            await awaitFetchBudget(token);
            const response = await awaitWithLeaseHeartbeat(
                fetchWithTimeout(url, { credentials: 'include', cache: 'no-store', redirect: 'follow' }, intVal(options.timeoutMs, FETCH_TIMEOUT_MS)),
                token,
            );
            if (response.status === 403 || response.status === 429) return { loaded: false, fatal: true, message: `Etsy ${label} isteğini ${response.status} ile engelledi. Seri durduruldu.` };
            if (!response.ok) {
                void trackTelemetryError('network_sale_verification');
                return { loaded: false, fatal: strict || response.status >= 500, retryable: !strict, telemetryCode: 'network_sale_verification', message: `${label} isteği başarısız: HTTP ${response.status}.` };
            }
            const finalUrl = String(response.url || url || '');
            if (options.expectedRouteUrl) {
                let routeMatches = false;
                try {
                    const expected = new URL(String(options.expectedRouteUrl), DETAILS_STATS_URL);
                    const final = new URL(finalUrl, expected);
                    const etsy = new URL(DETAILS_STATS_URL);
                    const normalizePath = value => value.replace(/\/+$/, '') || '/';
                    routeMatches = expected.origin === etsy.origin
                        && final.origin === etsy.origin
                        && normalizePath(final.pathname) === normalizePath(expected.pathname);
                } catch {}
                if (!routeMatches) {
                    void trackTelemetryError('selector_sale_verification');
                    return { loaded: false, fatal: true, retryable: false, telemetryCode: 'selector_sale_verification', message: `${label} yanıtı beklenen Etsy rotasında kalmadı. Nihai URL: ${finalUrl || 'bilinmiyor'}.` };
                }
            }
            if (options.expectedPaginationUrl && !paginationProgressMatches(options.expectedPaginationUrl, finalUrl)) {
                void trackTelemetryError('selector_sale_verification');
                return { loaded: false, fatal: true, retryable: false, telemetryCode: 'selector_sale_verification', message: `${label} yanıtı istenen sayfa/cursor ilerlemesini korumadı. İstenen URL: ${options.expectedPaginationUrl}; nihai URL: ${finalUrl || 'bilinmiyor'}.` };
            }
            const htmlText = await awaitWithLeaseHeartbeat(
                awaitAutomationBound(response.text(), intVal(options.timeoutMs, FETCH_TIMEOUT_MS), `${label} gövdesi`),
                token,
            );
            if (token) await maintainLeaseForToken(token);
            const doc = new DOMParser().parseFromString(htmlText, 'text/html');
            if (!doc?.documentElement) { void trackTelemetryError('selector_sale_verification'); return { loaded: false, fatal: strict, retryable: !strict, telemetryCode: 'selector_sale_verification', message: `${label} yanıtı DOM belgesine dönüştürülemedi.` }; }
            const challenge = detectChallenge(doc);
            if (challenge) return { loaded: false, fatal: true, message: `Etsy ${label} yanıtında güvenlik/hız sınırı algılandı: ${challenge}` };
            const fetchedIdentity = extractShopIdentityFromHtml(htmlText);
            if (!fetchedIdentity?.shopId) { void trackTelemetryError('selector_sale_verification'); return { loaded: false, fatal: true, telemetryCode: 'selector_sale_verification', message: `${label} yanıtında mağaza kimliği okunamadı.` }; }
            if (!sameShop(job.shop, fetchedIdentity)) return { loaded: false, fatal: true, message: `${label} yanıtı farklı mağazaya ait: ${shopLabel(fetchedIdentity)}.` };
            return { loaded: true, doc, url: finalUrl, identity: fetchedIdentity, htmlText };
        } catch (error) {
            if (error instanceof AutomationCancelledError) throw error;
            void trackTelemetryError('network_sale_verification');
            const timeout = error instanceof FetchTimeoutError;
            return { loaded: false, fatal: strict, retryable: !strict, telemetryCode: 'network_sale_verification', message: `${label} isteği ${timeout ? 'zaman aşımına uğradı' : 'çalışmadı'}: ${error?.message || error}` };
        }
    }
    function addPaginationUrl(urls, value, baseUrl, paramHint = '') {
        if (value == null || value === '') return;
        try {
            const parsed = new URL(String(value), baseUrl || DETAILS_STATS_URL);
            if (parsed.origin === new URL(DETAILS_STATS_URL).origin
                && /\/your\/shops\/me\/sales-discounts\/details-stats\/?$/.test(parsed.pathname)) {
                urls.push(parsed.href);
                return;
            }
        } catch {}
        if (!paramHint) return;
        try {
            const parsed = new URL(baseUrl || DETAILS_STATS_URL);
            parsed.searchParams.set(paramHint, String(value));
            urls.push(parsed.href);
        } catch {}
    }

    function structuredPaginationEvidence(root, baseUrl) {
        const contexts = pageContextsFromDocument(root);
        const urls = [];
        const seen = new Set();
        const positions = { page: new Set(), offset: new Set(), cursor: new Set() };
        let indicatesMore = false;
        let unresolved = false;
        const numeric = value => {
            const n = Number(value);
            return Number.isFinite(n) ? n : null;
        };
        const truthy = value => value === true || value === 1 || /^(?:true|yes|1)$/i.test(String(value ?? ''));
        const first = (obj, keys) => {
            for (const key of keys) if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
            return undefined;
        };
        const pageParam = () => {
            try {
                const parsed = new URL(baseUrl || DETAILS_STATS_URL);
                return Array.from(parsed.searchParams.keys()).find(key => /^(?:page|page_number|p)$/i.test(key)) || 'page';
            } catch { return 'page'; }
        };
        const cursorParam = () => {
            try {
                const parsed = new URL(baseUrl || DETAILS_STATS_URL);
                return Array.from(parsed.searchParams.keys()).find(key => /cursor|after|start/i.test(key)) || 'cursor';
            } catch { return 'cursor'; }
        };
        const walk = (value, path = '', depth = 0) => {
            if (!value || typeof value !== 'object' || depth > 12 || seen.has(value)) return;
            seen.add(value);
            if (Array.isArray(value)) {
                value.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1));
                return;
            }
            const keys = Object.keys(value);
            const contextLabel = `${path} ${keys.join(' ')}`;
            const signal = /promotion|sales|discount|pagination|pager|page[_ ]?info/i.test(contextLabel);
            if (signal) {
                const nextUrl = first(value, ['next_page_url', 'nextPageUrl', 'next_url', 'nextUrl', 'next_href', 'nextHref']);
                const nextPage = first(value, ['next_page', 'nextPage', 'next_page_number', 'nextPageNumber']);
                const explicitCurrentPage = first(value, ['current_page', 'currentPage', 'page_number', 'pageNumber']);
                const currentPage = numeric(explicitCurrentPage !== undefined
                    ? explicitCurrentPage
                    : /pagination|pager|page[_ ]?info/i.test(contextLabel) ? first(value, ['page']) : undefined);
                const totalPages = numeric(first(value, ['total_pages', 'totalPages', 'page_count', 'pageCount', 'num_pages', 'numPages', 'last_page', 'lastPage']));
                const hasNext = first(value, ['has_next_page', 'hasNextPage', 'has_more', 'hasMore', 'more_results', 'moreResults']);
                const nextCursor = first(value, ['next_cursor', 'nextCursor', 'end_cursor', 'endCursor', 'after_cursor', 'afterCursor']);
                const explicitCurrentCursor = first(value, ['current_cursor', 'currentCursor']);
                const currentCursor = explicitCurrentCursor !== undefined
                    ? explicitCurrentCursor
                    : /pagination|pager/i.test(contextLabel) ? first(value, ['cursor']) : undefined;
                const total = numeric(first(value, ['total', 'total_count', 'totalCount', 'result_count', 'resultCount']));
                const offset = numeric(first(value, ['offset', 'start', 'start_index', 'startIndex']));
                const limit = numeric(first(value, ['limit', 'per_page', 'perPage', 'page_size', 'pageSize']));

                if (currentPage != null) positions.page.add(String(currentPage));
                if (offset != null) positions.offset.add(String(offset));
                if (currentCursor != null && currentCursor !== '') positions.cursor.add(String(currentCursor));
                if (nextUrl) addPaginationUrl(urls, nextUrl, baseUrl);
                if (nextPage != null && nextPage !== '') {
                    indicatesMore = true;
                    addPaginationUrl(urls, nextPage, baseUrl, pageParam());
                }
                if (currentPage != null && totalPages != null && currentPage < totalPages) {
                    indicatesMore = true;
                    addPaginationUrl(urls, currentPage + 1, baseUrl, pageParam());
                }
                if (truthy(hasNext)) {
                    indicatesMore = true;
                    if (nextCursor != null && nextCursor !== '') addPaginationUrl(urls, nextCursor, baseUrl, cursorParam());
                }
                if (total != null && limit != null && limit > 0 && (offset ?? 0) + limit < total) {
                    indicatesMore = true;
                    try {
                        const parsed = new URL(baseUrl || DETAILS_STATS_URL);
                        const offsetKey = Array.from(parsed.searchParams.keys()).find(key => /offset|start/i.test(key)) || 'offset';
                        parsed.searchParams.set(offsetKey, String((offset ?? 0) + limit));
                        urls.push(parsed.href);
                    } catch {}
                }
            }
            Object.entries(value).forEach(([key, child]) => walk(child, `${path}.${key}`, depth + 1));
        };
        contexts.forEach((context, index) => walk(context, `context[${index}]`, 0));
        const uniqueUrls = uniq(urls);
        if (indicatesMore && !uniqueUrls.length) unresolved = true;
        return {
            urls: uniqueUrls,
            indicatesMore,
            unresolved,
            positions: {
                page: Array.from(positions.page).sort(),
                offset: Array.from(positions.offset).sort(),
                cursor: Array.from(positions.cursor).sort(),
            },
            message: unresolved ? 'Yapılandırılmış Etsy verisi başka promosyon sayfası olduğunu gösteriyor ancak güvenli sonraki sayfa adresi üretilemedi.' : '',
        };
    }

    function structuredPaginationMatchesRequest(requestedUrl, evidence) {
        const requested = paginationProgressState(requestedUrl);
        if (!requested.ok) return false;
        if (!requested.hasProgress) return true;
        const requestedGroups = new Map(requested.entries);
        return ['page', 'offset', 'cursor'].every(group => {
            const expected = requestedGroups.get(group);
            const observed = Array.isArray(evidence?.positions?.[group]) ? evidence.positions[group] : [];
            if (!expected?.length) return true;
            // A page/cursor in the response URL is not proof that Etsy returned the
            // corresponding body. Progress requests require an explicit structured
            // body position so a repeated page-one payload cannot become notFound.
            if (!observed.length) return false;
            return observed.every(value => expected.includes(String(value)));
        });
    }

    function collectPaginationUrls(root, baseUrl) {
        const urls = [];
        Array.from(root?.querySelectorAll?.('a[href], link[rel="next"][href]') || []).forEach(node => {
            const href = node.getAttribute('href') || '';
            if (!href) return;
            let parsed = null;
            try { parsed = new URL(href, baseUrl || DETAILS_STATS_URL); } catch { return; }
            if (parsed.origin !== new URL(DETAILS_STATS_URL).origin) return;
            if (!/\/your\/shops\/me\/sales-discounts\/details-stats\/?$/.test(parsed.pathname)) return;
            const inPager = !!node.closest?.('[aria-label*="pagination" i], nav, .wt-pagination, [data-testid*="pagination" i]');
            const hasPageParam = Array.from(parsed.searchParams.keys()).some(key => /page|offset|cursor|start|after|before/i.test(key));
            if (node.getAttribute('rel') === 'next' || inPager || hasPageParam) urls.push(parsed.href);
        });
        return uniq(urls);
    }

    async function verifyByFetch(plan, options = {}) {
        const strict = !!options.strict;
        const token = options.token || makeToken();
        const cached = await verifyUsingPromotionIndex(plan, options);
        if (cached) {
            if (cached.detailRequired && cached.url) {
                const detailPage = await fetchVerifiedDocument(cached.url, 'önbellekteki promosyon detay doğrulama', { strict, token, expectedRouteUrl: cached.url });
                if (!detailPage.loaded) return { ...cached, ok: false, fatal: !!detailPage.fatal || strict, readComplete: false, telemetryCode: detailPage.telemetryCode, message: `${cached.message} Detay kontrolü başarısız: ${detailPage.message}` };
                const detailResult = verifyPromotionDetail(plan, detailPage.doc, { ...options, expectedUrl: cached.url, finalUrl: detailPage.url });
                if (detailResult.ok) return { ...detailResult, ok: true, readComplete: true, url: detailPage.url, matchedName: detailResult.matchedName || cached.matchedName, fromCache: true };
                return { ...cached, ok: false, ambiguousExisting: true, policyMismatch: !!detailResult.policyMismatch, readComplete: true, message: `${cached.message} ${detailResult.message}` };
            }
            return cached;
        }

        const queue = [DETAILS_STATS_URL];
        const queued = new Set([paginationRequestKey(DETAILS_STATS_URL)]);
        const seen = new Set();
        let pagesRead = 0;
        let lastMessage = '';
        let collectedRecords = [];
        while (queue.length) {
            if (pagesRead >= MAX_LIST_PAGES) {
                return { ok: false, fatal: true, readComplete: false, message: `Promosyon listesi ${MAX_LIST_PAGES} sayfa sınırını aştı; duplicate kontrolü tamamlanamadı.` };
            }
            if (token) await maintainLeaseForToken(token);
            const url = queue.shift();
            let canonical = '';
            try { canonical = new URL(url, location.origin).href; } catch { canonical = String(url); }
            const requestKey = paginationRequestKey(canonical);
            queued.delete(requestKey);
            if (seen.has(requestKey)) continue;
            seen.add(requestKey);
            const listPage = await fetchVerifiedDocument(canonical, `promosyon listesi doğrulama (sayfa ${pagesRead + 1})`, { strict, token, expectedRouteUrl: DETAILS_STATS_URL, expectedPaginationUrl: canonical });
            if (!listPage.loaded) return { ok: false, fatal: !!listPage.fatal, retryable: !!listPage.retryable, readComplete: false, telemetryCode: listPage.telemetryCode, message: listPage.message };
            const finalKey = paginationRequestKey(listPage.url || canonical, canonical);
            if (finalKey !== requestKey && seen.has(finalKey)) {
                return { ok: false, fatal: strict, retryable: !strict, readComplete: false, telemetryCode: 'selector_sale_verification', message: 'Promosyon sayfalaması daha önce okunmuş bir sayfa/cursor durumuna yönlendirildi; kesin bulunamadı sonucu üretilmedi.' };
            }
            seen.add(finalKey);
            pagesRead += 1;
            const basePageUrl = listPage.url || canonical;
            const structuredPagination = structuredPaginationEvidence(listPage.doc, basePageUrl);
            if (!structuredPaginationMatchesRequest(canonical, structuredPagination)) {
                void trackTelemetryError('selector_sale_verification');
                return { ok: false, fatal: strict, retryable: !strict, readComplete: false, telemetryCode: 'selector_sale_verification', message: `Promosyon yanıt gövdesindeki sayfa/cursor konumu istenen ilerlemeyle uyuşmuyor. İstenen URL: ${canonical}.` };
            }
            const readability = assessPromotionListReadability(listPage.doc);
            const pageCandidates = [...readability.structured, ...readability.rows];
            if (options.allowCache !== false) collectedRecords = mergePromotionRecords(collectedRecords, pageCandidates);
            const listResult = assessPromotionCandidates(plan, pageCandidates, readability, options);
            lastMessage = listResult.message;
            if (listResult.ok) return { ...listResult, readComplete: true, pagesRead };
            if (listResult.detailRequired && listResult.url) {
                const detailPage = await fetchVerifiedDocument(listResult.url, 'promosyon detay doğrulama', { strict, token, expectedRouteUrl: listResult.url });
                if (!detailPage.loaded) {
                    return { ok: false, fatal: !!detailPage.fatal || strict, retryable: !strict, ambiguousExisting: true, readComplete: false, telemetryCode: detailPage.telemetryCode, url: listResult.url, matchedName: listResult.matchedName, message: `${listResult.message} Detay kontrolü başarısız: ${detailPage.message}` };
                }
                const detailResult = verifyPromotionDetail(plan, detailPage.doc, { ...options, expectedUrl: listResult.url, finalUrl: detailPage.url });
                if (detailResult.ok) return { ...detailResult, ok: true, readComplete: true, url: detailPage.url, matchedName: detailResult.matchedName || listResult.matchedName, pagesRead };
                return { ok: false, fatal: !!detailResult.fatal, ambiguousExisting: true, policyMismatch: !!detailResult.policyMismatch, readComplete: true, url: listResult.url, matchedName: listResult.matchedName, cacheRecord: detailResult.cacheRecord, message: `${listResult.message} ${detailResult.message}` };
            }
            if (listResult.ambiguousExisting) return { ...listResult, readComplete: true, pagesRead };

            // Pagination is evaluated before rejecting an otherwise empty page. A genuinely
            // paginated Etsy response may have no rows on the current page but still expose a
            // same-origin, safe next-page URL. An unhydrated app shell has no such evidence and
            // remains fail-closed.
            const domPaginationUrls = collectPaginationUrls(listPage.doc, basePageUrl);
            const before = queue.length;
            [...domPaginationUrls, ...structuredPagination.urls].forEach(nextUrl => {
                let normalized = '';
                try { normalized = new URL(nextUrl, basePageUrl).href; } catch { normalized = String(nextUrl); }
                const nextKey = paginationRequestKey(normalized, basePageUrl);
                if (!seen.has(nextKey) && !queued.has(nextKey)) {
                    queue.push(normalized);
                    queued.add(nextKey);
                }
            });
            const addedSafePage = queue.length > before;
            if (structuredPagination.unresolved && !domPaginationUrls.length) {
                void trackTelemetryError('selector_sale_verification');
                return { ok: false, fatal: strict, retryable: !strict, readComplete: false, telemetryCode: 'selector_sale_verification', message: structuredPagination.message };
            }
            if (!readability.readable && !addedSafePage) {
                void trackTelemetryError('selector_sale_verification');
                return { ok: false, fatal: strict, retryable: !strict, readComplete: false, telemetryCode: 'selector_sale_verification', message: readability.message };
            }
            if (readability.dynamicIncomplete && !addedSafePage) {
                void trackTelemetryError('selector_sale_verification');
                return { ok: false, fatal: strict, retryable: !strict, readComplete: false, telemetryCode: 'selector_sale_verification', message: `${readability.message} Güvenli bir sonraki sayfa URL'si bulunamadı; kampanya yok kabul edilmedi.` };
            }
            if (!listResult.readComplete && !addedSafePage) {
                void trackTelemetryError('selector_sale_verification');
                return { ok: false, fatal: strict, retryable: !strict, readComplete: false, telemetryCode: 'selector_sale_verification', message: listResult.message };
            }
        }
        if (strict && !options.postSubmit && options.allowCache !== false && token) await persistPromotionIndex(token, collectedRecords, pagesRead);
        return { ok: false, notFound: true, readComplete: pagesRead > 0, pagesRead, message: lastMessage || 'Bütün okunabilir promosyon sayfaları kontrol edildi; kesin eşleşme bulunamadı.' };
    }
    async function updateVerifyState(token, updater) {
        return await mutateJob(token, next => {
            const now = Date.now();
            const current = next.verifyState && typeof next.verifyState === 'object' ? next.verifyState : {};
            next.verifyState = {
                ...current,
                startedAt: Number(current.startedAt || 0) > 0 ? Number(current.startedAt) : (Number(next.phaseStartedAt || 0) > 0 ? Number(next.phaseStartedAt) : now),
                attempts: Math.max(0, intVal(current.attempts, 0)),
                nextFetchAt: Number(current.nextFetchAt || 0) > 0 ? Number(current.nextFetchAt) : now + 1800,
            };
            updater(next.verifyState, next);
        });
    }

    function verifyRetryDelay(attempt) {
        const delays = [1200, 2200, 3400, 4800, 6200, 7600];
        return delays[Math.min(Math.max(0, attempt - 1), delays.length - 1)];
    }

    function currentSubmissionMatchesPlan(activeJob, plan) {
        const submission = activeJob?.submission;
        return !!(plan?.idempotencyKey
            && ['submitted', 'reserved'].includes(submission?.status)
            && submission.idempotencyKey === plan.idempotencyKey);
    }

    function submissionAlreadyAccountedFor(activeJob, submission) {
        const key = submission?.idempotencyKey;
        if (!key) return false;
        return (activeJob?.pendingVerifications || []).some(entry => entry?.idempotencyKey === key)
            || (activeJob?.results || []).some(row => row?.idempotencyKey === key);
    }

    async function ensureCurrentSubmissionForVerification(plan) {
        const token = makeToken();
        if (!token || !plan) return false;
        let outcome = 'ambiguous';
        let reason = '';
        const checked = await withStateLock(async () => {
            const fresh = validateFreshForToken(await gmGet(JOB_KEY, null), token);
            if (currentSubmissionMatchesPlan(fresh, plan)) {
                outcome = 'exact';
                return fresh;
            }

            const submission = fresh.submission;
            const staleAccounted = !!submission && submissionAlreadyAccountedFor(fresh, submission);
            const finalRecord = actionRecord(fresh, plan, 'final_submit');
            const currentFinalEvidence = ['reserved', 'clicked'].includes(finalRecord?.status)
                || fresh.formEvidence?.idempotencyKey === plan.idempotencyKey;
            if ((!submission || staleAccounted) && !currentFinalEvidence) {
                const next = clone(fresh);
                next.phase = 'preflight';
                next.phaseStartedAt = Date.now();
                next.needsPreflight = true;
                next.verifyState = null;
                next.notBefore = 0;
                next.expectedNavigationUntil = 0;
                next.expectedNavigationPath = '';
                if (staleAccounted) {
                    next.submission = null;
                    next.formEvidence = null;
                }
                next.updatedAt = new Date().toISOString();
                await gmSet(JOB_KEY, next);
                outcome = 'repaired';
                return next;
            }

            if (submission) {
                reason = `Doğrulama kaydı ${submission.idempotencyKey || 'kimliksiz'} kampanyasına ait; aktif gün ${plan.idempotencyKey}. Yanlış güne ait kayıt doğrulanmadı ve hiçbir kampanya yeniden gönderilmedi.`;
            } else {
                reason = `Aktif ${plan.saleName} günü için final gönderim kanıtı bulunamadı. Yarım kalmış final işlemini tekrar gönderme riski nedeniyle doğrulama veya oluşturma yapılmadı.`;
            }
            return fresh;
        });
        job = checked;
        renderPanel();
        if (outcome === 'exact') return true;
        if (outcome === 'repaired') {
            setStatus(`Yanlış güne ait doğrulama aşaması düzeltildi: ${plan.saleName}\nÖnce salt okunur duplicate kontrolü yapılacak; kampanya yalnız kesin olarak bulunamazsa oluşturma akışına geçecek.`);
            toast(`${plan.saleName} için hatalı doğrulama geçişi düzeltildi; önce güvenli ön kontrol yapılacak.`, 'warning', 6200);
            scheduleTransitionTick(0);
            return false;
        }
        await markError(plan, reason, 'submission_ambiguous');
        return false;
    }

    async function handleVerifyCreated(plan) {
        if (!(await ensureCurrentSubmissionForVerification(plan))) return;
        const token = makeToken();
        if (!isVerificationPath()) {
            const state = job.verifyState || {};
            const elapsed = Date.now() - Number(job.phaseStartedAt || Date.now());
            setStatus(`Kesin doğrulama sayfası açılıyor: ${plan.saleName}`);
            if (!state.navigationAt || Date.now() - Number(state.navigationAt) > 4500) {
                await updateVerifyState(token, verify => { verify.navigationAt = Date.now(); verify.startedAt = verify.startedAt || Date.now(); });
                const currentToken = makeToken();
                await mutateJob(currentToken, next => {
                    next.expectedNavigationUntil = Date.now() + 18000;
                    next.expectedNavigationPath = '/sales-discounts/details-stats';
                });
                go(DETAILS_STATS_URL);
            }
            if (elapsed > 15000) await markError(plan, 'Promosyon doğrulama sayfasına geçilemedi. Başarılı sayılmadı.', 'runtime_error', 'selector_sale_transition');
            return;
        }
        const challenge = detectChallenge();
        if (challenge) { await markError(plan, challenge, 'rate_limit_or_challenge'); return; }
        const pageErrors = collectErrors(document);
        if (pageErrors.length) { await markError(plan, pageErrors.join(' | '), 'verification_error'); return; }
        if (!Number(job.verifyState?.pageReadyAt || 0)) {
            await updateVerifyState(token, verify => {
                const now = Date.now();
                verify.pageReadyAt = now;
                verify.startedAt = now;
                verify.nextFetchAt = now + 600;
            });
        }
        const verifyOptions = { postSubmit: true, strict: false, countryValue: job?.countryValue, token, allowCache: false };
        let result = verifyInDocument(plan, document, verifyOptions);
        if (result.policyMismatch) { await markError(plan, result.message, 'created_policy_mismatch'); return; }
        if (result.ok) {
            await markSuccess(plan, result.message, { url: result.url, verified: true, cacheRecord: result.cacheRecord });
            return;
        }
        if (!job.verifyState || Number(job.verifyState.startedAt || 0) <= 0 || Number(job.verifyState.nextFetchAt || 0) <= 0) {
            await updateVerifyState(token, () => {});
        }
        const verifyState = {
            ...(job.verifyState || {}),
            startedAt: Number(job.verifyState?.startedAt || 0),
            attempts: Math.max(0, intVal(job.verifyState?.attempts, 0)),
            nextFetchAt: Number(job.verifyState?.nextFetchAt || 0),
        };
        const startedAt = Number(verifyState.startedAt || job.phaseStartedAt || Date.now());
        const elapsed = Date.now() - startedAt;
        const timeout = Number(job.verifyTimeoutMs || config.verifyTimeoutMs);
        const mayFetch = elapsed <= timeout && verifyState.attempts < MAX_VERIFY_FETCH_ATTEMPTS && Date.now() >= Number(verifyState.nextFetchAt || 0);
        if (mayFetch) {
            const attempt = verifyState.attempts + 1;
            await updateVerifyState(token, verify => {
                verify.attempts = attempt;
                verify.nextFetchAt = Date.now() + verifyRetryDelay(attempt);
                verify.lastMessage = result.message;
            });
            result = await verifyByFetch(plan, verifyOptions);
            await assertTokenFresh(token);
            if (result.fatal) { await markError(plan, result.message, 'verification_safety'); return; }
            if (result.policyMismatch) { await markError(plan, result.message, 'created_policy_mismatch'); return; }
            if (result.ok) { await markSuccess(plan, result.message, { url: result.url, verified: true, cacheRecord: result.cacheRecord }); return; }
        }
        const currentState = job.verifyState || verifyState;
        const currentAttempts = Number(currentState.attempts || 0);
        setStatus(`Promosyon kesin satırla doğrulanıyor: ${plan.saleName}\n${result.message}\nFetch denemesi: ${currentAttempts}/${MAX_VERIFY_FETCH_ATTEMPTS}`);
        if (elapsed > timeout) {
            const telemetryCode = TELEMETRY_ALLOWED_ERROR_CODES.has(result.telemetryCode) ? result.telemetryCode : 'runtime_sale_action';
            await markError(plan, `Promosyon Etsy listesinde kod + indirim + tarih + durum + tür + bölge + kapsam alanlarıyla doğrulanamadı. ${currentAttempts} fetch denemesi yapıldı. Son kontrol: ${result.message}`, 'runtime_error', telemetryCode);
        }
    }

    function batchVerificationOptions(entry, token) {
        return {
            postSubmit: true,
            strict: false,
            allowCache: false,
            countryValue: entry.countryValue,
            submission: entry.submission,
            formEvidence: entry.formEvidence,
            token,
        };
    }

    async function verifyPendingBatchEntry(entry, candidates, readability, token, allowListFetch = false) {
        const plan = planFromPendingVerification(entry, job);
        if (!plan) return { ok: false, fatal: true, message: `Bekleyen doğrulama kaydı iş planıyla uyuşmuyor: ${entry?.saleName || 'bilinmeyen'}.` };
        const options = batchVerificationOptions(entry, token);
        let result = assessPromotionCandidates(plan, candidates, readability, options);
        if (result.detailRequired && result.url) {
            const detailPage = await fetchVerifiedDocument(result.url, 'toplu promosyon detay doğrulama', { strict: false, token, expectedRouteUrl: result.url });
            if (!detailPage.loaded) return { ...result, ok: false, readComplete: false, retryable: true, message: `${result.message} Detay kontrolü başarısız: ${detailPage.message}` };
            const detailResult = verifyPromotionDetail(plan, detailPage.doc, { ...options, expectedUrl: result.url, finalUrl: detailPage.url });
            if (detailResult.ok) return { ...detailResult, ok: true, readComplete: true, url: detailPage.url, matchedName: detailResult.matchedName || result.matchedName };
            result = { ...result, ...detailResult, ok: false, ambiguousExisting: true, readComplete: true, message: `${result.message} ${detailResult.message}` };
        }
        if (!result.ok && allowListFetch && !result.policyMismatch) {
            const fetched = await verifyByFetch(plan, options);
            if (fetched.ok || fetched.fatal || fetched.policyMismatch || fetched.ambiguousExisting) return fetched;
            result = fetched;
        }
        return result;
    }

    async function pauseBatchVerification(message) {
        const currentJobId = job?.jobId;
        const changed = await withStateLock(async () => {
            const fresh = await gmGet(JOB_KEY, null);
            if (!fresh?.active || fresh.jobId !== currentJobId || fresh.phase !== 'batch_verify') return null;
            const next = clone(fresh);
            next.paused = true;
            next.pauseKind = 'batch_verification_incomplete';
            next.errorReason = String(message || 'Toplu doğrulama tamamlanamadı.');
            next.errorAt = new Date().toISOString();
            next.pendingError = null;
            next.generation = Number(next.generation || 0) + 1;
            next.expectedNavigationUntil = 0;
            next.expectedNavigationPath = '';
            next.updatedAt = new Date().toISOString();
            await gmSet(JOB_KEY, next);
            return next;
        });
        if (!changed) return;
        job = changed;
        abortAutomation('batch-verification-paused');
        await releaseLease();
        renderPanel();
        setStatus(`Toplu doğrulama duraklatıldı. Hiçbir kampanya yeniden gönderilmeyecek.\n${changed.errorReason}\nYeniden Dene yalnız doğrulamayı tekrarlar.`);
        toast('Toplu doğrulama tamamlanamadı; oluşturma tekrarlanmayacak.', 'warning', 7000);
    }

    async function completeBatchVerification() {
        const currentJobId = job?.jobId;
        const completed = await withStateLock(async () => {
            const fresh = await gmGet(JOB_KEY, null);
            if (!fresh?.active || fresh.jobId !== currentJobId || fresh.phase !== 'batch_verify') return null;
            if (Array.isArray(fresh.pendingVerifications) && fresh.pendingVerifications.length) return null;
            const next = clone(fresh);
            next.active = false;
            next.paused = false;
            next.pauseKind = '';
            next.errorReason = '';
            next.pendingError = null;
            next.terminalStatus = 'completed';
            next.finishedAt = new Date().toISOString();
            next.phase = 'completed';
            next.batchVerifyState = null;
            next.expectedNavigationUntil = 0;
            next.expectedNavigationPath = '';
            next.updatedAt = new Date().toISOString();
            await gmSet(JOB_KEY, next);
            return next;
        });
        if (!completed) return false;
        job = completed;
        await finalizeTerminalJob(completed.jobId, true);
        return true;
    }

    async function handleBatchVerify() {
        const token = makeToken();
        const pending = Array.isArray(job.pendingVerifications) ? job.pendingVerifications : [];
        if (!pending.length) {
            await completeBatchVerification();
            return;
        }
        if (!isVerificationPath()) {
            setStatus(`Seri oluşturma tamamlandı. ${pending.length} kampanya için tek toplu doğrulama sayfası açılıyor.`);
            await mutateJob(token, next => {
                next.expectedNavigationUntil = Date.now() + 18000;
                next.expectedNavigationPath = '/sales-discounts/details-stats';
            });
            go(DETAILS_STATS_URL);
            return;
        }

        const challenge = detectChallenge();
        if (challenge) { await pauseBatchVerification(challenge); return; }
        const pageErrors = collectErrors(document);
        if (pageErrors.length) { await pauseBatchVerification(pageErrors.join(' | ')); return; }
        const state = job.batchVerifyState || { startedAt: Date.now(), attempts: 0, nextFetchAt: Date.now() };
        if (Date.now() < Number(state.nextFetchAt || 0)) {
            setStatus(`Toplu doğrulama hazırlanıyor: ${pending.length} kampanya bekliyor.`);
            return;
        }

        const attempt = Math.max(0, intVal(state.attempts, 0)) + 1;
        const readability = assessPromotionListReadability(document);
        const candidates = [...readability.structured, ...readability.rows];
        const resolved = [];
        const unresolved = [];
        setStatus(`Toplu doğrulama yapılıyor: ${pending.length} kampanya · deneme ${attempt}/${MAX_VERIFY_FETCH_ATTEMPTS}`);
        for (const entry of pending) {
            await maintainLeaseForToken(token);
            const result = await verifyPendingBatchEntry(entry, candidates, readability, token, attempt > 1);
            if (result.ok) resolved.push({ entry, result });
            else unresolved.push({ entry, result });
        }

        const updated = await mutateJob(token, next => {
            resolved.forEach(({ entry, result }) => {
                const plan = planFromPendingVerification(entry, next);
                if (!plan) return;
                next.results = upsertResult(next.results, resultRow(plan, 'SUCCESS', result.message, {
                    verified: true,
                    url: result.url || '',
                    saleName: result.matchedName || plan.saleName,
                }, next));
            });
            const unresolvedById = new Map(unresolved.map(item => [item.entry.idempotencyKey, item.result]));
            next.pendingVerifications = (next.pendingVerifications || [])
                .filter(entry => !resolved.some(item => item.entry.idempotencyKey === entry.idempotencyKey))
                .map(entry => ({
                    ...entry,
                    lastVerificationMessage: String(unresolvedById.get(entry.idempotencyKey)?.message || entry.lastVerificationMessage || ''),
                }));
            next.batchVerifyState = {
                startedAt: Number(state.startedAt || Date.now()),
                attempts: attempt,
                nextFetchAt: Date.now() + verifyRetryDelay(attempt),
                lastAttemptAt: Date.now(),
            };
        });
        if (!updated.pendingVerifications.length) {
            await completeBatchVerification();
            return;
        }

        const elapsed = Date.now() - Number(updated.batchVerifyState?.startedAt || Date.now());
        const timeout = Number(updated.verifyTimeoutMs || config.verifyTimeoutMs);
        if (attempt >= MAX_VERIFY_FETCH_ATTEMPTS || elapsed > timeout || unresolved.some(item => item.result.fatal || item.result.policyMismatch)) {
            const summary = updated.pendingVerifications
                .slice(0, 6)
                .map(entry => `${entry.saleName}: ${entry.lastVerificationMessage || 'kesin doğrulama yok'}`)
                .join(' | ');
            await pauseBatchVerification(`${updated.pendingVerifications.length} kampanya kesin doğrulanamadı. ${summary}`);
            return;
        }
        setStatus(`${resolved.length} kampanya bu turda doğrulandı; ${updated.pendingVerifications.length} kampanya Etsy liste senkronu için bekliyor. Oluşturma tekrarlanmayacak.`);
        scheduleTransitionTick(verifyRetryDelay(attempt));
    }

    async function ensureShopMatch(plan) {
        const identity = detectShopIdentity(true);
        if (!identity?.shopId) {
            if (!shopIdentityMissingSince) shopIdentityMissingSince = Date.now();
            const elapsed = Date.now() - shopIdentityMissingSince;
            const lease = await gmGet(LEASE_KEY, null);
            const exactLeaseOwner = !!(leaseOwned
                && lease?.owner === INSTANCE_ID
                && lease?.jobId === job?.jobId
                && ownedLeaseNonce
                && lease?.nonce === ownedLeaseNonce
                && Number(lease.expiresAt || 0) > Date.now());
            if (elapsed >= SHOP_IDENTITY_TIMEOUT_MS && exactLeaseOwner) {
                await markError(plan, 'Etsy mağaza kimliği 20 saniye boyunca bu lease sahibi sekmede okunamadı. Yanlış mağazada işlem riskine karşı seri duraklatıldı. Doğru mağazayı açıp sayfayı yeniledikten sonra Devam Et düğmesine bas.', 'shop_identity_timeout');
                return false;
            }
            const remaining = Math.max(0, Math.ceil((SHOP_IDENTITY_TIMEOUT_MS - elapsed) / 1000));
            setStatus(`Etsy mağaza kimliği bu sekmede henüz okunamadı.\nAktif iş: ${shopLabel(job?.shop)}\n${exactLeaseOwner ? `Bu exact lease sahibi sekme işlem yapmadan bekliyor; ${remaining} sn sonra güvenli duraklatma uygulanacak.` : 'Bu sekme exact lease sahibi değil; ortak işi duraklatmadan tamamen pasif kalıyor.'}`);
            return false;
        }
        shopIdentityMissingSince = 0;
        if (!sameShop(job?.shop, identity)) {
            if (leaseOwned) await releaseLease(job?.jobId);
            setStatus(`Bu sekme farklı Etsy mağazasında ve pasif.\nAktif iş: ${shopLabel(job?.shop)}\nAçık sekme: ${shopLabel(identity)}\nOrtak seri duraklatılmadı veya değiştirilmedi.`);
            return false;
        }
        return true;
    }
    function scheduleTransitionTick(delay = 35) {
        if (transitionTickTimerId) return;
        const run = () => {
            transitionTickTimerId = null;
            if (tabIsHidden() || !job?.active || job.paused || !isSupportedRoute()) return;
            if (tickLock) {
                transitionTickTimerId = setTimeout(run, 35);
                return;
            }
            void processTick();
        };
        transitionTickTimerId = setTimeout(run, Math.max(0, Number(delay) || 0));
    }

    function installSaleFlowTransitionObserver() {
        const target = document.getElementById('wt-modal-container');
        if (target === observedSaleFlowRoot && saleFlowObserver) return;
        try { saleFlowObserver?.disconnect(); } catch {}
        saleFlowObserver = null;
        observedSaleFlowRoot = target || null;
        if (!target || typeof MutationObserver !== 'function') return;
        saleFlowObserver = new MutationObserver(records => {
            if (tabIsHidden() || !job?.active || job.paused) return;
            const relevant = records.some(record => {
                const element = record.target?.nodeType === 1 ? record.target : record.target?.parentElement;
                return !isOwnUi(element);
            });
            if (relevant) scheduleTransitionTick(35);
        });
        saleFlowObserver.observe(target, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['aria-hidden', 'aria-disabled', 'disabled', 'class'],
        });
    }

    async function processTick() {
        if (!isSupportedRoute() || tickLock || tabIsHidden()) return;
        installSaleFlowTransitionObserver();
        tickLock = true;
        try {
            await refreshJob();
            assertForegroundTab();
            if (!job) return;
            if (!job.active) { await finalizeTerminalJob(job.jobId, true); return; }
            if (job.paused) { await releaseLease(); return; }
            if (document.readyState !== 'complete') {
                setStatus('Etsy sayfasının tüm kaynaklarıyla yüklenmesi bekleniyor. Bu sırada hiçbir alan değiştirilmeyecek ve hiçbir düğmeye tıklanmayacak.');
                return;
            }
            const plan = buildPlan(job.currentDate, job);
            if (!plan) { await markError(null, 'Aktif tarih planı oluşturulamadı.'); return; }
            const earlyIdentity = detectShopIdentity(true);
            if (earlyIdentity?.shopId && !sameShop(job?.shop, earlyIdentity)) {
                setStatus(`Bu sekme farklı Etsy mağazasında ve pasif.
Aktif iş: ${shopLabel(job?.shop)}
Açık sekme: ${shopLabel(earlyIdentity)}`);
                return;
            }
            if (ownBlockingUiOpen()) {
                if (leaseOwned) await acquireLease(job);
                setStatus('Rapor veya ayar penceresi açık. Bu sekmede arka plan otomasyonu ve tüm tıklamalar geçici olarak durduruldu.');
                return;
            }
            if (Number(job.notBefore || 0) > Date.now()) {
                setStatus(`Sonraki kampanya öncesi güvenli bekleme\n${Math.ceil((Number(job.notBefore) - Date.now()) / 1000)} saniye`);
                return;
            }
            const owner = await acquireLease(job);
            if (!owner) {
                const lease = await gmGet(LEASE_KEY, null);
                setStatus(`Bu seri başka Etsy sekmesinde çalışıyor.\nSahip: ${lease?.owner ? String(lease.owner).slice(0, 24) : 'bilinmiyor'}\nBu sekme hiçbir işlem yapmayacak.`);
                return;
            }
            if (!(await ensureShopMatch(plan))) return;
            assertForegroundTab();
            const challenge = detectChallenge();
            if (challenge) { await markError(plan, challenge, 'rate_limit_or_challenge'); return; }
            const refs = getCreateSaleRefs();
            // An acknowledgement phase exists specifically because the previous Etsy success
            // overlay is still open. Handle that overlay before the generic foreign-modal gate;
            // otherwise a localized success copy could be paused as unrelated UI.
            if (job.completionAck || job.phase === 'ack_complete') {
                await handleCompletionAck(refs);
                return;
            }
            const blocking = detectBlockingForeignOverlay(null, refs);
            if (blocking?.kind === 'transient_sale_loading') {
                const wait = evaluateTransientSaleLoadingWait(blocking);
                if (wait.state === 'timeout') {
                    await markError(plan, `Etsy geçici yükleme penceresi ${Math.ceil(TRANSIENT_SALE_LOADING_TIMEOUT_MS / 1000)} saniye içinde kapanmadı. Arka planda hiçbir alan değiştirilmedi ve hiçbir düğmeye tıklanmadı: ${blocking.summary}`, 'transient_loading_timeout');
                    return;
                }
                setStatus(`Etsy geçici yükleme penceresinin kapanması bekleniyor: ${blocking.summary}\nBu sırada hiçbir alan değiştirilmeyecek ve hiçbir düğmeye tıklanmayacak. Güvenli bekleme sınırı: ${Math.max(1, Math.ceil(wait.remainingMs / 1000))} sn.`);
                scheduleTransitionTick(Math.min(250, wait.remainingMs));
                return;
            }
            evaluateTransientSaleLoadingWait(null);
            if (blocking?.kind === 'foreign') {
                await markError(plan, `Satış akışına ait olmayan açık Etsy penceresi algılandı. Arka planda hiçbir işlem yapılmadı. Önce pencereyi kapat: ${blocking.summary}`, 'foreign_modal_blocking');
                return;
            }
            const progress = getProgressInfo(job);
            if (job.phase === 'batch_verify') {
                setStatus(`Oluşturma serisi tamamlandı · ${shopLabel(job.shop)}\n${job.pendingVerifications?.length || 0} kampanya topluca doğrulanacak.`);
            } else {
                setStatus(`Seri çalışıyor · ${shopLabel(job.shop)}\n${progress.completed}/${progress.total} tamamlandı\nSıradaki: ${plan.dayName} · ${plan.saleName}`);
            }
            if (await reconcileStage(plan, refs)) return;
            await refreshJob();
            if (!job?.active || job.paused) return;
            switch (job.phase) {
                case 'preflight': await handlePreflight(plan); break;
                case 'open_form': await handleOpenForm(plan); break;
                case 'fill_form': await handleFillForm(plan); break;
                case 'await_listings': await handleAwaitListings(plan); break;
                case 'select_listings': await handleSelectListings(plan); break;
                case 'await_review': await handleAwaitReview(plan); break;
                case 'confirm_sale': await handleConfirmSale(plan); break;
                case 'await_result': await handleAwaitResult(plan); break;
                case 'ack_complete': await handleCompletionAck(refs); break;
                case 'verify_created': await handleVerifyCreated(plan); break;
                case 'batch_verify': await handleBatchVerify(); break;
                default: await setPhase('open_form'); break;
            }
        } catch (error) {
            if (error instanceof AutomationCancelledError) return;
            if (!(error instanceof SafetyStopError) && error?.telemetryCode !== 'storage_sale_state') void trackTelemetryError('runtime_sale_action');
            console.error(`EDA v${VERSION} tick failed`, error);
            const active = await gmGet(JOB_KEY, null);
            job = active;
            const plan = active?.currentDate ? buildPlan(active.currentDate, active) : null;
            if (active?.active) await markError(plan, error?.message || String(error), error instanceof SafetyStopError ? 'safety_stop' : 'runtime_error');
            else toast(`Script hatası: ${error?.message || error}`, 'error', 5600);
        } finally {
            tickLock = false;
        }
    }
    async function startBatch() {
        const start = parseIso(config.batchStartDate);
        const end = parseIso(config.batchEndDate);
        if (!start || !end) { toast('Başlangıç ve bitiş tarihleri doğru değil.', 'error'); return; }
        if (start.getTime() > end.getTime()) { toast('Başlangıç tarihi bitiş tarihinden sonra olamaz.', 'error'); return; }
        const identity = detectShopIdentity(true);
        if (!identity?.shopId) { toast('Etsy mağaza kimliği okunamadı. Sayfayı yenileyip doğru mağazada tekrar başlat.', 'error', 6200); return; }
        config = normalizeConfig(config);
        await saveConfig();
        const created = await withStateLock(async () => {
            const existing = await gmGet(JOB_KEY, null);
            if (existing?.active) return null;
            const now = Date.now();
            const next = {
                schemaVersion: 5,
                version: VERSION,
                jobId: randomId('job-'),
                active: true,
                paused: false,
                pauseKind: '',
                errorReason: '',
                pendingError: null,
                generation: 1,
                phase: 'preflight',
                phaseStartedAt: now,
                currentDate: config.batchStartDate,
                batchStartDate: config.batchStartDate,
                batchEndDate: config.batchEndDate,
                saleDurationDays: config.saleDurationDays,
                discount: config.discount,
                discountName: config.discountName,
                countryValue: config.countryValue,
                listingScope: 'all',
                listingScopeVerified: false,
                verifyTimeoutMs: config.verifyTimeoutMs,
                cooldownMinMs: config.cooldownMinMs,
                cooldownMaxMs: config.cooldownMaxMs,
                shop: identity,
                originTabId: TAB_ID,
                originInstanceId: INSTANCE_ID,
                startedAt: new Date().toISOString(),
                configSnapshot: { ...config, shop: identity },
                results: [],
                pendingVerifications: [],
                batchVerifyState: null,
                completionAck: null,
                promotionIndex: null,
                actionLedger: {},
                submission: null,
                needsPreflight: true,
                notBefore: 0,
                verifyState: null,
                openFormAttempts: 0,
                openFormNavigationAt: 0,
                expectedNavigationUntil: 0,
                expectedNavigationPath: '',
            };
            await gmSet(JOB_KEY, next);
            await gmSet(LEGACY_JOB_KEY, { active: false, supersededBy: VERSION, supersededAt: new Date().toISOString() });
            return next;
        });
        if (!created) { toast('Zaten aktif bir seri var.', 'warning'); return; }
        job = created;
        resetAutomationController();
        await releaseLease();
        await acquireLease(job);
        renderPanel();
        const step = scheduleStepDays(job);
        toast(step === 1 ? 'Günlük seri başlatıldı; ilk duplicate kontrolü yapılıyor.' : `${step} günlük çakışmasız seri başlatıldı; başlangıçlar ${step} gün arayla ilerleyecek ve her gün önce duplicate kontrolü yapılacak.`, 'success', 4800);
        setTimeout(() => processTick(), 0);
    }

    function download(filename, content, type = 'text/plain;charset=utf-8') {
        const blob = content instanceof Blob ? content : new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.documentElement.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function reportRows(report) {
        const shop = report?.shop || {};
        return [
            ['Shop Name', 'Shop ID', 'Status', 'Sale Name', 'Discount', 'Start Date', 'End Date', 'Verified', 'Existing', 'URL', 'Message', 'Created At'],
            ...(report?.results || []).map(row => [
                row.shopName || shop.shopName || '',
                row.shopId || shop.shopId || '',
                row.status,
                row.saleName,
                row.discount,
                row.startDate,
                row.endDate,
                row.verified ? 'yes' : 'no',
                row.existing ? 'yes' : 'no',
                row.url || '',
                row.message || '',
                row.createdAt || '',
            ]),
        ];
    }

    function spreadsheetSafe(value) {
        const source = String(value ?? '');
        return /^[\t\r\n ]*[=+\-@]/.test(source) ? `'${source}` : source;
    }

    function csvEscape(value) {
        const source = spreadsheetSafe(value);
        return /[",\n]/.test(source) ? `"${source.replace(/"/g, '""')}"` : source;
    }
    function downloadCsv(report = lastReport) {
        if (!report?.results?.length) { toast('İndirilecek rapor yok.', 'warning'); return; }
        const csv = reportRows(report).map(row => row.map(csvEscape).join(',')).join('\n');
        download(`etsy-sale-report-${report.shop?.shopName || report.shop?.shopId || 'shop'}-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
    }

    function xmlEscape(value) {
        return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }

    function downloadExcel(report = lastReport) {
        if (!report?.results?.length) { toast('İndirilecek rapor yok.', 'warning'); return; }
        const rows = reportRows(report);
        const worksheetRows = rows.map((row, rowIndex) => `<Row>${row.map(cell => `<Cell><Data ss:Type="String">${xmlEscape(spreadsheetSafe(cell))}</Data></Cell>`).join('')}</Row>`).join('');
        const workbook = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Sales"><Table>${worksheetRows}</Table></Worksheet></Workbook>`;
        download(`etsy-sale-report-${report.shop?.shopName || report.shop?.shopId || 'shop'}-${new Date().toISOString().slice(0, 10)}.xml`, workbook, 'application/vnd.ms-excel;charset=utf-8');
    }

    function uiIcon(name, className = 'eda-svg') {
        const paths = {
            activity: '<path d="M3 12h3l2-5 4 10 2-5h7"/><path d="M3 5v14h18"/>',
            play: '<path d="m8 5 11 7-11 7Z"/>',
            stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
            settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55V20h-3v-.09a1.7 1.7 0 0 0-1.03-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.55-1.03H5v-3h.45A1.7 1.7 0 0 0 7 9.94a1.7 1.7 0 0 0-.34-1.88L6.6 8l2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 11.69 4.7V4h3v.7a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06L19.8 8l-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1.03H21v3h-.05A1.7 1.7 0 0 0 19.4 15Z"/>',
            report: '<path d="M6 3h9l3 3v15H6Z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
            external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',
            refresh: '<path d="M20 6v5h-5"/><path d="M19 11a7 7 0 1 0 1 5"/>',
            download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
            x: '<path d="m6 6 12 12M18 6 6 18"/>',
            github: '<path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.61-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.84a9.6 9.6 0 0 1 2.5.34c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.86V21c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" fill="currentColor" stroke="none"/>',
            check: '<path d="m5 12 4 4L19 6"/>',
            alert: '<path d="M12 3 2.5 20h19Z"/><path d="M12 9v4M12 17h.01"/>',
            chevronLeft: '<path d="m15 18-6-6 6-6"/>',
            chevronRight: '<path d="m9 18 6-6-6-6"/>',
        };
        return `<svg class="${html(className)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.activity}</svg>`;
    }

    function updateBannerHtml() {
        if (updateState.status !== 'available' || !updateState.latestVersion || compareVersions(updateState.latestVersion, VERSION) <= 0) return '';
        return `<div class="eda-update-card" role="status">
            <div class="eda-update-copy"><div class="eda-update-title">${uiIcon('alert')} Yeni sürüm v${html(updateState.latestVersion)} hazır</div><div class="eda-update-desc">Mevcut sürüm v${html(VERSION)}. Tampermonkey onayıyla güvenli biçimde güncellenir.</div></div>
            <button type="button" class="eda-warning" id="eda-install-update">${uiIcon('download')} Güncelle</button>
        </div>`;
    }

    function updateCheckLabel() {
        if (updateState.status === 'checking') return 'Denetleniyor…';
        if (updateState.status === 'current') return `v${VERSION} güncel`;
        if (updateState.status === 'available') return `v${updateState.latestVersion} hazır`;
        if (updateState.status === 'external') return 'Platform güncellemeleri';
        return 'Güncellemeyi denetle';
    }

    function modalBrandHtml(title, subtitle) {
        return `<div class="eda-modal-brand"><a class="eda-modal-logo-shell" href="${MAKAYTRON_WEBSITE_URL}" target="_blank" rel="noopener noreferrer" aria-label="Makaytron web sitesini aç"><img class="eda-modal-logo" src="${MAKAYTRON_LOGO_URL}" alt="Makaytron"></a><div><h3 class="eda-modal-title">${html(title)}</h3><div class="eda-modal-subtitle">${html(subtitle)}</div></div></div>`;
    }

    function openSettings() {
        if (!isSupportedRoute()) return;
        if (job?.active) {
            toast('Aktif seri sırasında ayarlar kilitlidir. Önce seriyi durdur.', 'warning', 4500);
            return;
        }
        const backdrop = document.createElement('div');
        backdrop.className = 'eda-modal-backdrop';
        backdrop.innerHTML = `
            <div class="eda-modal" role="dialog" aria-modal="true" aria-label="Toplu kampanya ayarları">
                <div class="eda-modal-head">
                    ${modalBrandHtml('Toplu kampanya ayarları', `Makaytron · v${VERSION} · @${GITHUB_USERNAME}`)}
                    <button type="button" class="eda-icon-button" data-close aria-label="Kapat">${uiIcon('x')}</button>
                </div>
                <div class="eda-modal-body">
                    <div class="eda-note"><strong>Kod biçimi:</strong> YYMMDD + PREFIX + indirim. Örnek: <strong>260503SPRING25</strong>. Süre 2–30 gün seçilirse yeni kampanyalar aynı süre aralığıyla başlatılır ve birbirleriyle çakışmaz.</div>
                    <div class="eda-section-title">Kampanya ayarları</div>
                    <div class="eda-form-grid">
                        <div class="eda-field"><label for="eda-config-start-date">Başlangıç tarihi</label><input id="eda-config-start-date" type="date" value="${html(config.batchStartDate)}"><small>İlk kampanyanın başlangıcı.</small></div>
                        <div class="eda-field"><label for="eda-end">Son başlangıç tarihi</label><input id="eda-end" type="date" value="${html(config.batchEndDate)}"><small>Bu tarihten sonra yeni kampanya başlatılmaz.</small></div>
                        <div class="eda-field"><label for="eda-duration">Promosyon süresi</label><input id="eda-duration" type="number" min="1" max="30" value="${html(config.saleDurationDays)}"><small>Başlangıçlar da bu kadar gün arayla ilerler.</small></div>
                        <div class="eda-field"><label for="eda-discount">İndirim yüzdesi</label><input id="eda-discount" type="number" min="1" max="90" value="${html(config.discount)}"><small>Etsy preset yoksa güvenli custom yüzde alanı kullanılır.</small></div>
                        <div class="eda-field"><label for="eda-prefix">Promosyon kod prefix</label><input id="eda-prefix" type="text" maxlength="12" value="${html(config.discountName)}"><small>Sadece harf ve rakam; yıl ve tarih otomatik eklenir.</small></div>
                        <div class="eda-field"><label for="eda-country">Geçerlilik bölgesi</label><select id="eda-country"><option value="0" ${String(config.countryValue) === '0' ? 'selected' : ''}>Everywhere</option></select><small>Seçenek Etsy formunda bulunamazsa işlem güvenli biçimde durur.</small></div>
                        <div class="eda-field" style="grid-column:1/-1"><label style="display:flex;align-items:center;gap:8px"><input id="eda-auto-resume" type="checkbox" ${config.autoResumeOnLoad ? 'checked' : ''} style="width:16px;height:16px"> Sayfa yenilenince veya planlı navigasyondan sonra otomatik devam et</label><small>Beklenmeyen sayfa yüklemesinde kullanıcı onayı istenir; scriptin planlı geçişleri güvenli biçimde devam eder.</small></div>
                    </div>
                    <div class="eda-about-card">
                        <div class="eda-section-title">Makaytron ve GitHub güncellemeleri</div>
                        <div class="eda-about-grid">
                            <div class="eda-about-item"><span>Sürüm</span><strong>v${VERSION}</strong></div>
                            <div class="eda-about-item"><span>GitHub kullanıcı adı</span><strong>@${GITHUB_USERNAME}</strong></div>
                            <div class="eda-about-item"><span>Repo</span><strong>${GITHUB_USERNAME}/${GITHUB_REPOSITORY}</strong></div>
                        </div>
                        <div class="eda-about-actions">
                            <a class="eda-button-link eda-secondary" href="${GITHUB_PROJECT_URL}" target="_blank" rel="noopener noreferrer">${uiIcon('github')} GitHub deposu</a>
                            <button type="button" class="eda-secondary" data-check-update ${updateState.status === 'checking' ? 'disabled' : ''}>${uiIcon('refresh')} ${html(updateCheckLabel())}</button>
                            ${updateState.status === 'available' ? `<button type="button" class="eda-warning" data-install-update>${uiIcon('download')} v${html(updateState.latestVersion)} yükle</button>` : ''}
                        </div>
                        <p style="margin:10px 0 0;font-size:11px;line-height:1.5;color:#737373">GitHub hesabı güncelleme almak için zorunlu değildir. Sorun bildirmek veya depoyu Watch etmek için <a class="eda-inline-link" href="https://github.com/signup" target="_blank" rel="noopener noreferrer">ücretsiz GitHub üyeliği oluştur</a>, ardından <strong>@${GITHUB_USERNAME}</strong> hesabını takip et. Güncelle düğmesi Tampermonkey onay ekranını açar; güvenlik nedeniyle script kendisini sessizce değiştirmez.</p>
                    </div>
                </div>
                <div class="eda-modal-footer"><button type="button" class="eda-ghost" data-close>Vazgeç</button><button type="button" class="eda-primary" data-save>${uiIcon('check')} Kaydet</button></div>
            </div>`;
        const close = () => backdrop.remove();
        backdrop.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', close));
        backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
        backdrop.querySelector('[data-check-update]')?.addEventListener('click', () => checkForUpdates({ manual: true, force: true }));
        backdrop.querySelector('[data-install-update]')?.addEventListener('click', installAvailableUpdate);
        backdrop.querySelector('[data-save]')?.addEventListener('click', async () => {
            config.batchStartDate = String(backdrop.querySelector('#eda-config-start-date')?.value || config.batchStartDate);
            config.batchEndDate = String(backdrop.querySelector('#eda-end')?.value || config.batchEndDate);
            config.saleDurationDays = clamp(intVal(backdrop.querySelector('#eda-duration')?.value, config.saleDurationDays), 1, 30);
            config.discount = clamp(intVal(backdrop.querySelector('#eda-discount')?.value, config.discount), 1, 90);
            config.discountName = cleanCode(backdrop.querySelector('#eda-prefix')?.value || '').slice(0, 12);
            config.countryValue = String(backdrop.querySelector('#eda-country')?.value || '0');
            config.autoResumeOnLoad = !!backdrop.querySelector('#eda-auto-resume')?.checked;
            config = normalizeConfig(config);
            await saveConfig();
            toast('Ayarlar kaydedildi.', 'success');
            close();
        });
        document.documentElement.appendChild(backdrop);
    }

    function openReport(report = lastReport, force = false) {
        if (!isSupportedRoute()) return;
        if (!report?.results?.length) {
            if (force) toast('Rapor kaydı yok.', 'warning');
            return;
        }
        document.querySelector('.eda-report-backdrop')?.remove();
        const rows = report.results || [];
        const ok = rows.filter(row => row.status === 'SUCCESS').length;
        const err = rows.filter(row => row.status === 'ERROR').length;
        const stopped = rows.filter(row => row.status === 'STOPPED').length;
        const trustWarning = report.legacyUnverified
            ? `<div class="eda-note" style="background:#fffaf0;border-color:#ead18d;color:#7a5300"><strong>Güven uyarısı:</strong> ${html(report.trustNote || 'Bu eski rapor Etsy üzerinde yeniden doğrulanmadı.')} Eski verified değerleri kesin başarı olarak gösterilmez.</div>`
            : '';
        const backdrop = document.createElement('div');
        backdrop.className = 'eda-report-backdrop';
        backdrop.innerHTML = `
            <div class="eda-report" role="dialog" aria-modal="true" aria-label="Seri raporu">
                <div class="eda-report-head">${modalBrandHtml('Seri raporu', `${shopLabel(report.shop)} · v${VERSION} · Başarılı ${ok} · Hata ${err} · Durdurulan ${stopped}`)}<button type="button" class="eda-icon-button" data-close aria-label="Kapat">${uiIcon('x')}</button></div>
                <div class="eda-report-body">${trustWarning}<div class="eda-table-wrap"><table class="eda-table"><thead><tr><th>Durum</th><th>Kod</th><th>Tarih</th><th>Doğrulama</th><th>Mesaj</th></tr></thead><tbody>${rows.map(row => `<tr><td class="eda-status-${String(row.status).toLowerCase()}">${html(row.status)}</td><td><strong>${html(row.saleName)}</strong><br><small>%${html(row.discount)}</small></td><td>${html(row.startDate)} → ${html(row.endDate)}</td><td>${row.verified ? 'Kesin' : report.legacyUnverified ? 'Eski / doğrulanmadı' : 'Hayır'}${row.existing ? '<br><small>Önceden mevcut</small>' : ''}${row.url ? `<br><a href="${html(row.url)}" target="_blank" rel="noreferrer">Detayı aç</a>` : ''}</td><td>${html(row.message || '')}</td></tr>`).join('')}</tbody></table></div></div>
                <div class="eda-report-footer"><button type="button" class="eda-secondary" data-csv>${uiIcon('download')} CSV indir</button><button type="button" class="eda-success" data-xls>${uiIcon('download')} Excel XML indir</button><button type="button" class="eda-ghost" data-close>Kapat</button></div>
            </div>`;
        const close = () => backdrop.remove();
        backdrop.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', close));
        backdrop.querySelector('[data-csv]')?.addEventListener('click', () => downloadCsv(report));
        backdrop.querySelector('[data-xls]')?.addEventListener('click', () => downloadExcel(report));
        backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
        document.documentElement.appendChild(backdrop);
    }
    function renderPanel() {
        if (!isSupportedRoute()) {
            removeOwnUi();
            return;
        }
        if (!panelEl) return;
        if (panelCollapsed) {
            panelEl.dataset.telemetryOpen = '0';
            panelEl.classList.add('eda-collapsed');
            panelEl.innerHTML = `<button type="button" class="eda-collapsed-tab" id="eda-expand-panel" aria-label="Makaytron Etsy Sale Manager panelini aç" title="Paneli aç">${uiIcon('chevronLeft')}</button>`;
            panelEl.querySelector('#eda-expand-panel')?.addEventListener('click', () => {
                writePanelCollapsed(false);
                renderPanel();
            });
            statusEl = null;
            markPanelRenderedState();
            return;
        }
        panelEl.classList.remove('eda-collapsed');
        if (panelEl.dataset.telemetryOpen !== '1') {
            panelEl.dataset.telemetryOpen = '1';
            telemetryPanelOpened();
        }
        const progress = getProgressInfo(job);
        const plan = currentPlan();
        const phaseNames = {
            preflight: 'Ön kontrol',
            open_form: 'Run a sale açılıyor',
            fill_form: 'Form dolduruluyor',
            await_listings: 'Listing ekranı bekleniyor',
            select_listings: 'All listings seçiliyor',
            await_review: 'Review ekranı bekleniyor',
            confirm_sale: 'Final onay hazırlanıyor',
            await_result: 'Etsy sonucu bekleniyor',
            ack_complete: 'Başarı penceresi kapatılıyor',
            verify_created: 'Kesin liste doğrulaması',
            batch_verify: 'Toplu seri doğrulaması',
            completed: 'Tamamlandı',
            stopped: 'Durduruldu',
        };
        const paused = !!(job?.active && job.paused);
        const batchVerificationPaused = !!(paused && (job?.phase === 'batch_verify' || job?.pauseKind === 'batch_verification_incomplete'));
        const statusText = panelActionState?.message || (paused
            ? batchVerificationPaused
                ? `Toplu doğrulama duraklatıldı: ${job.errorReason || 'Etsy kayıtları henüz kesin doğrulanamadı'}
Devam Et yalnız doğrulamayı tekrarlar; hiçbir kampanya yeniden oluşturulmaz.`
                : `Seri duraklatıldı: ${job.errorReason || 'Kullanıcı devamı gerekli'}
Aynı günü yeniden deneyebilir veya açıkça atlayabilirsin.`
            : job?.active
                ? `Seri çalışıyor: ${phaseNames[job.phase] || job.phase}
Mağaza: ${shopLabel(job.shop)}`
                : 'Ayarları kontrol et ve toplu kampanya serisini başlat.');
        const retryLabel = ['resume_required', 'legacy_migration', 'legacy_reconcile', 'upgrade_review', 'upgrade_reconcile', 'shop_identity_missing', 'submission_ambiguous', 'shop_identity_timeout', 'action_reservation_recovery', 'action_reservation_ambiguous', 'batch_verification_incomplete'].includes(job?.pauseKind) ? 'Devam Et' : 'Yeniden Dene';
        const panelActionButton = (key, normalContent, normallyDisabled = false) => {
            const busy = panelActionState?.key === key;
            const disabled = normallyDisabled || !!panelActionState;
            return {
                attrs: `${disabled ? 'disabled' : ''} ${busy ? 'data-eda-busy="1" aria-busy="true"' : ''}`.trim(),
                content: busy
                    ? `<span class="eda-button-busy-spinner" aria-hidden="true"></span><span>${html(panelActionState.label)}</span>`
                    : normalContent,
            };
        };
        const startAction = panelActionButton('start', `${uiIcon('play')}<span>Seriyi Başlat</span>`, !!job?.active);
        const retryAction = panelActionButton('retry', `${uiIcon('play')}<span>${retryLabel}</span>`);
        const skipAction = panelActionButton('skip', '<span>Bu Günü Atla</span>');
        const stopAction = panelActionButton('stop', `${uiIcon('stop')}<span>Durdur</span>`, !job?.active);
        const primaryActions = paused
            ? batchVerificationPaused
                ? `<div class="eda-actions"><button type="button" class="eda-primary" id="eda-retry" ${retryAction.attrs}>${retryAction.content}</button><button type="button" class="eda-danger" id="eda-stop" ${stopAction.attrs}>${stopAction.content}</button></div>`
                : `<div class="eda-actions three"><button type="button" class="eda-primary" id="eda-retry" ${retryAction.attrs}>${retryAction.content}</button><button type="button" class="eda-warning" id="eda-skip" ${skipAction.attrs}>${skipAction.content}</button><button type="button" class="eda-danger" id="eda-stop" ${stopAction.attrs}>${stopAction.content}</button></div>`
            : `<div class="eda-actions"><button type="button" class="eda-primary" id="eda-start" ${startAction.attrs}>${startAction.content}</button><button type="button" class="eda-danger" id="eda-stop" ${stopAction.attrs}>${stopAction.content}</button></div>`;
        const statusClass = paused ? 'pause' : job?.active ? 'run' : 'ready';
        const statusLabel = paused ? 'Duraklatıldı' : job?.active ? 'Çalışıyor' : 'Hazır';
        const shownProgress = job?.active ? progress.percent : (lastReport?.results?.length ? 100 : 0);
        const progressLabel = job?.active ? `${progress.completed}/${progress.total}` : `${lastReport?.results?.length || 0} rapor kaydı`;
        panelEl.innerHTML = `
            <div class="eda-card">
                <div class="eda-head">
                    <div class="eda-brand"><a class="eda-logo-shell" href="${MAKAYTRON_WEBSITE_URL}" target="_blank" rel="noopener noreferrer" aria-label="Makaytron web sitesini aç"><img class="eda-logo" src="${MAKAYTRON_LOGO_URL}" alt="Makaytron"></a><div class="eda-brand-copy"><h3 class="eda-title">Makaytron Etsy Sale Manager</h3><div class="eda-sub">Bulk Sales &amp; Discounts Automation</div></div></div>
                    <div class="eda-head-tools"><div class="eda-head-meta"><span class="eda-version">v${VERSION}</span><span class="eda-pill ${statusClass}">${statusLabel}</span></div><button type="button" class="eda-collapse-head" id="eda-collapse-panel" aria-label="Paneli gizle" title="Paneli gizle">${uiIcon('chevronRight')}</button></div>
                </div>
                <div class="eda-body">
                    <div class="eda-status-card"><span class="eda-status-icon">${uiIcon(paused ? 'alert' : 'activity')}</span><div class="eda-status" id="eda-status-text" role="status" aria-live="polite">${html(statusText)}</div></div>
                    <div class="eda-progress-wrap"><div class="eda-progress-head"><span>Seri ilerlemesi</span><strong>${html(progressLabel)}</strong></div><div class="eda-progress-track"><div class="eda-progress-bar" style="width:${clamp(Number(shownProgress || 0), 0, 100)}%"></div></div></div>
                    <div class="eda-grid">
                        <div class="eda-chip"><div class="eda-label">Mağaza</div><div class="eda-value">${html(job?.shop ? shopLabel(job.shop) : shopLabel(detectShopIdentity()))}</div></div>
                        <div class="eda-chip"><div class="eda-label">Aralık / Süre</div><div class="eda-value">${html(`${config.batchStartDate || '-'} → ${config.batchEndDate || '-'} / ${config.saleDurationDays}g`)}</div></div>
                        <div class="eda-chip"><div class="eda-label">Aktif Başlangıç</div><div class="eda-value">${html(plan ? `${plan.dayName} · ${plan.startDateInput}` : '-')}</div></div>
                        <div class="eda-chip"><div class="eda-label">İlerleme</div><div class="eda-value">${html(progressLabel)}</div></div>
                        <div class="eda-chip"><div class="eda-label">Kod / İndirim</div><div class="eda-value">${html(`${plan?.saleName || '-'} / %${plan?.discount ?? config.discount}`)}</div></div>
                        <div class="eda-chip"><div class="eda-label">Sekme Sahibi</div><div class="eda-value">${html(job?.active ? (leaseOwned ? 'Bu sekme' : 'Kontrol ediliyor') : '-')}</div></div>
                    </div>
                    ${updateBannerHtml()}
                    ${primaryActions}
                    <div class="eda-actions three"><button type="button" class="eda-secondary" id="eda-settings" ${job?.active ? 'disabled' : ''}>${uiIcon('settings')} Ayarlar</button><button type="button" class="eda-secondary" id="eda-report">${uiIcon('report')} Rapor</button><button type="button" class="eda-ghost" id="eda-open-sale" ${job?.active ? 'disabled' : ''}>${uiIcon('external')} Run Sale</button></div>
                    <div class="eda-footer"><a class="eda-footer-link" href="${GITHUB_PROJECT_URL}" target="_blank" rel="noopener noreferrer">${uiIcon('github')} @${GITHUB_USERNAME}</a><button type="button" class="eda-link-button" id="eda-check-update" ${updateState.status === 'checking' ? 'disabled' : ''}>${html(updateCheckLabel())}</button></div>
                </div>
            </div>`;
        statusEl = panelEl.querySelector('#eda-status-text');
        panelEl.querySelector('#eda-collapse-panel')?.addEventListener('click', () => { writePanelCollapsed(true); renderPanel(); });
        bindPanelAsyncAction('#eda-start', startBatch, 'Seri başlatılıyor; mağaza ve ayarlar doğrulanıyor…', 'Başlıyor…', 'start');
        bindPanelAsyncAction('#eda-retry', retryCurrent, 'Aynı gün için yeniden deneme başlatılıyor…', retryLabel === 'Devam Et' ? 'Devam…' : 'Deneniyor…', 'retry');
        bindPanelAsyncAction('#eda-skip', skipCurrent, 'Aktif gün güvenli biçimde atlanıyor…', 'Atlanıyor…', 'skip');
        bindPanelAsyncAction('#eda-stop', stopBatch, 'Seri durduruluyor ve durum kaydediliyor…', 'Duruyor…', 'stop');
        panelEl.querySelector('#eda-settings')?.addEventListener('click', openSettings);
        panelEl.querySelector('#eda-report')?.addEventListener('click', () => openReport(lastReport, true));
        panelEl.querySelector('#eda-open-sale')?.addEventListener('click', () => go(CREATE_SALE_URL));
        panelEl.querySelector('#eda-check-update')?.addEventListener('click', () => checkForUpdates({ manual: true, force: true }));
        panelEl.querySelector('#eda-install-update')?.addEventListener('click', installAvailableUpdate);
        markPanelRenderedState();
    }

    function mountPanel() {
        if (!isSupportedRoute()) {
            removeOwnUi();
            return;
        }
        if (document.getElementById(ROOT_ID)) {
            panelEl = document.getElementById(ROOT_ID);
        } else {
            panelEl = document.createElement('div');
            panelEl.id = ROOT_ID;
            document.documentElement.appendChild(panelEl);
        }
        renderPanel();
    }

    function registerShortcuts() {
        registerTelemetryMenuCommand();
        try { GM.registerMenuCommand?.('Makaytron · Etsy Sale Manager ayarları', openSettings); } catch {}
        try { GM.registerMenuCommand?.('Makaytron · Güncellemeleri denetle', () => checkForUpdates({ manual: true, force: true })); } catch {}
        try { GM.registerMenuCommand?.(`GitHub @${GITHUB_USERNAME}`, openGitHubRepository); } catch {}
        document.addEventListener('keydown', event => {
            if (!isSupportedRoute() || !event.altKey || !event.shiftKey) return;
            if (event.key.toLowerCase() === 'e') openSettings();
            if (event.key.toLowerCase() === 'r') openReport(lastReport, true);
            if (event.key.toLowerCase() === 'u') checkForUpdates({ manual: true, force: true });
        });
    }

    async function initializeStateSync() {
        try {
            stateChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('eda-sale-batch-v4') : null;
            if (stateChannel) {
                stateChannel.addEventListener('message', async event => {
                    const payload = event.data || {};
                    if (payload.type === 'cancel' && (!job || payload.jobId === job.jobId)) abortAutomation('remote-cancel');
                    if (payload.type === 'state') {
                        const fresh = await gmGet(JOB_KEY, null);
                        if (!fresh || !fresh.active || fresh.paused || (job && fresh.generation !== job.generation)) abortAutomation('remote-state-change');
                        job = fresh;
                        renderPanel();
                    }
                });
            }
        } catch (error) {
            console.warn('BroadcastChannel unavailable', error);
        }
        try {
            GM.addValueChangeListener?.(JOB_KEY, (_name, oldValue, newValue, remote) => {
                if (!remote) return;
                const changed = !newValue || !newValue.active || newValue.paused || Number(newValue.generation || 0) !== Number(oldValue?.generation || 0);
                if (changed) abortAutomation('remote-gm-change');
                job = newValue || null;
                renderPanel();
            });
        } catch (error) {
            console.warn('GM value listener unavailable', error);
        }
        const prepareLeaseHandoff = event => {
            if (event?.type === 'pagehide' && event.persisted) return;
            // Unload sırasında asenkron GM silme güvenilir değildir ve yeni sayfanın devraldığı
            // lease'i yarış koşuluyla silebilir. Tek kullanımlık session handoff yeni instance'ın
            // aynı navigasyonda lease'i hemen devralmasını sağlar; kapanan sekmede lease en geç
            // LEASE_MS sonunda kendiliğinden düşer.
            markLeaseHandoff(job?.jobId || '', job?.expectedNavigationPath || location.pathname, { preserveExisting: true });
        };
        window.addEventListener('pagehide', prepareLeaseHandoff);
        window.addEventListener('beforeunload', prepareLeaseHandoff);
    }

    async function initialize() {
        try {
            await loadState();
            await loadUpdateState();
            installRouteWatcher();
            if (isSupportedRoute()) mountPanel();
            registerShortcuts();
            await initializeStateSync();
            if (job && !job.active && job.terminalStatus) await finalizeTerminalJob(job.jobId, false);
            if (job?.active) {
                resetAutomationController();
                if (job.paused) toast('Aktif seri güvenlik nedeniyle duraklatılmış durumda.', 'warning', 4200);
                else toast('Aktif seri bulundu; mağaza ve sekme kilidi doğrulanarak devam ediliyor.', 'info', 3800);
            }
            timerId = setInterval(processTick, 1000);
            setTimeout(() => { checkForUpdates({ manual: false, force: false }).catch(error => console.warn('Update check failed', error)); }, 1400);
            document.addEventListener('visibilitychange', () => {
                if (tabIsHidden()) {
                    abortAutomation('tab-hidden');
                    if (transitionTickTimerId) {
                        clearTimeout(transitionTickTimerId);
                        transitionTickTimerId = null;
                    }
                    if (leaseOwned) void releaseLease(job?.jobId || null);
                    return;
                }
                resetAutomationController();
                syncRouteUi().catch(() => {});
                scheduleTransitionTick(0);
            });
            if (job?.active && !job.paused) setTimeout(processTick, 450);
        } catch (error) {
            console.error(`EDA v${VERSION} initialize failed`, error);
            if (isSupportedRoute()) { mountPanel(); toast(`Script başlatılamadı: ${error?.message || error}`, 'error', 7000); }
        }
    }
    await initialize();
})();
