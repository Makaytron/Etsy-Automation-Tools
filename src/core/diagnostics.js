// Problem reports ("Sorun bildir").
//
// A report is built from an allowlist only: product version, browser family
// and major version, OS family, interface language, region taken from the
// browser locale, the redacted route template, an error code from the known
// list, the problem category the user picked, and the user's own note.
// Shop names, customer data, URLs with identifiers, and API keys never enter a
// report. `buildReport` returns exactly what will be sent, so the UI can show
// it to the user before sending.

import { describePath } from './routes.js';

export const PROBLEM_CATEGORIES = Object.freeze([
  'language-pack', 'tool-not-starting', 'interrupted', 'wrong-result', 'display', 'suggestion',
  'etsy-page-changed', 'ai-or-translation', 'other',
]);
/** The six choices of the report dialog (design canvas: Feedback). */
export const DIALOG_CATEGORIES = Object.freeze(['language-pack', 'tool-not-starting', 'interrupted', 'wrong-result', 'display', 'suggestion']);
/** Groups of technical facts the user can leave out of a report. */
export const REPORT_GROUPS = Object.freeze(['version', 'system', 'locale', 'page', 'error']);
const TOOLS = new Set(['sale-manager', 'message-assistant', 'ads-keyword-manager', 'listing-analyzer', 'keyword-market-analyzer']);

export const ERROR_CODES = Object.freeze(new Set([
  'i18n_pack_download', 'i18n_pack_format', 'i18n_pack_language', 'i18n_pack_version', 'i18n_pack_strings',
  'i18n_pack_value', 'i18n_pack_markup', 'i18n_pack_missing', 'i18n_pack_unavailable',
  'storage_unavailable', 'storage_quota', 'module_mount', 'module_unmount', 'route_lifecycle',
  'etsy_session_expired', 'etsy_selector_missing',
  'sale_form_field_missing', 'sale_verification_failed',
  'ads_table_missing', 'ads_page_unreachable',
  'listing_scan_interrupted', 'listing_editor_field_missing',
  'kw_insights_table_missing',
  'msg_ai_unauthorized', 'msg_ai_unreachable', 'msg_translation_failed',
]));

const NOTE_LIMIT = 1000;

export function browserInfo(userAgent = '') {
  const ua = String(userAgent);
  const pairs = [['Edge', /Edg\/(\d+)/], ['Opera', /OPR\/(\d+)/], ['Firefox', /Firefox\/(\d+)/], ['Chrome', /Chrome\/(\d+)/], ['Safari', /Version\/(\d+).*Safari/]];
  let browser = { name: 'other', major: null };
  for (const [name, re] of pairs) {
    const m = ua.match(re);
    if (m) { browser = { name, major: Number(m[1]) }; break; }
  }
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad/.test(ua) ? 'iOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'other';
  return { browser: browser.name, browserMajor: browser.major, os };
}

/** Removes things that look like keys, e-mail addresses, URLs and long numbers from free text. */
export function scrubNote(text) {
  return String(text ?? '')
    .slice(0, NOTE_LIMIT)
    .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}\b/g, '[key]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[key]')
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
    .replace(/https?:\/\/\S+/g, '[link]')
    .replace(/\b\d{6,}\b/g, '[number]')
    .trim();
}

/**
 * Builds the report payload. `env` carries runtime facts (userAgent,
 * browser locale, pathname, interface language); only derived, allowlisted
 * values are copied out of it.
 */
export function buildReport({ appVersion, category, tool = null, errorCode = null, errorAt = null, note = '', includeNote = true, omit = [] }, env) {
  const { browser, browserMajor, os } = browserInfo(env.userAgent);
  const locale = typeof env.locale === 'string' ? env.locale : '';
  const region = /^[a-z]{2,3}-([A-Z]{2})$/.exec(locale)?.[1] ?? null;
  const { routeId, template } = describePath(env.pathname);
  const off = new Set(omit);
  const keep = (group, value) => (off.has(group) ? null : value);
  const offset = Number.isFinite(env.utcOffsetMinutes) ? env.utcOffsetMinutes : null;
  const handler = typeof env.handler === 'string' && /^[A-Za-z ]{2,30} \d+(?:\.\d+){0,3}$/.test(env.handler) ? env.handler : null;
  const code = ERROR_CODES.has(errorCode) ? errorCode : null;
  return {
    format: 'etsy-automation-tools-report',
    formatVersion: 2,
    appVersion: keep('version', appVersion),
    handler: keep('version', handler),
    category: PROBLEM_CATEGORIES.includes(category) ? category : 'other',
    tool: TOOLS.has(tool) ? tool : null,
    errorCode: keep('error', code),
    errorAt: keep('error', code && typeof errorAt === 'string' && /^\d{2}:\d{2}$/.test(errorAt) ? errorAt : null),
    browser: keep('system', browser),
    browserMajor: keep('system', browserMajor),
    os: keep('system', os),
    uiLanguage: keep('locale', typeof env.uiLanguage === 'string' ? env.uiLanguage.slice(0, 12) : null),
    browserLocale: keep('locale', /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(locale) ? locale : null),
    region: keep('locale', region),
    utcOffset: keep('locale', offset === null ? null : `UTC${offset >= 0 ? '+' : '-'}${Math.floor(Math.abs(offset) / 60)}${Math.abs(offset) % 60 ? `:${String(Math.abs(offset) % 60).padStart(2, '0')}` : ''}`),
    routeId: keep('page', routeId),
    routeTemplate: keep('page', template),
    note: includeNote ? scrubNote(note) : '',
  };
}
