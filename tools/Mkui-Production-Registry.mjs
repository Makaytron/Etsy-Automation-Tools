import { resolve } from 'node:path';

export const MKUI_ROOT = resolve(import.meta.dirname, '..');

export const MKUI_PRODUCTION_SCRIPTS = Object.freeze([
  Object.freeze({
    id: 'ads-keyword-manager',
    label: 'Ads Keyword Manager',
    path: 'scripts/etsy-ads-keyword-manager/Makaytron-Etsy-Ads-Keyword-Manager.user.js',
    cssPrefixes: Object.freeze(['maw-']),
    expectedShadowModes: Object.freeze([]),
    expectedTelemetryId: 'etsy-ads-keyword-manager',
  }),
  Object.freeze({
    id: 'keyword-market-analyzer',
    label: 'Keyword & Market Analyzer',
    path: 'scripts/etsy-keyword-market-analyzer/Makaytron-Etsy-Keyword-Market-Analyzer.user.js',
    cssPrefixes: Object.freeze(['ekma-', 'ekma-inline']),
    expectedShadowModes: Object.freeze(['open']),
    expectedTelemetryId: 'etsy-keyword-market-analyzer',
  }),
  Object.freeze({
    id: 'sale-manager',
    label: 'Sale Manager',
    path: 'scripts/etsy-sale-campaign-batch-runner/Etsy-Sale-Campaign-Batch-Runner.user.js',
    cssPrefixes: Object.freeze(['eda-']),
    expectedShadowModes: Object.freeze([]),
    expectedTelemetryId: 'etsy-sale-manager',
  }),
  Object.freeze({
    id: 'message-assistant',
    label: 'Message Assistant',
    path: 'scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js',
    cssPrefixes: Object.freeze(['ma-', 'mema-', 'mkui-']),
    expectedShadowModes: Object.freeze(['closed']),
    expectedTelemetryId: 'etsy-message-assistant',
  }),
  Object.freeze({
    id: 'listing-analyzer',
    label: 'Listing Analyzer',
    path: 'scripts/etsy-listing-analyzer/Makaytron-Etsy-Listing-Analyzer.user.js',
    cssPrefixes: Object.freeze(['meli-']),
    expectedShadowModes: Object.freeze(['open']),
    expectedTelemetryId: 'etsy-listing-analyzer',
  }),
]);

export const MKUI_CANONICAL_ROUTE_FIXTURES = Object.freeze([
  Object.freeze({ owner: 'ads-keyword-manager', url: 'https://www.etsy.com/your/shops/me/advertising/listings/1234567890' }),
  Object.freeze({ owner: 'keyword-market-analyzer', url: 'https://www.etsy.com/your/shops/example-shop/marketplace-insights?ref=dashboard' }),
  Object.freeze({ owner: 'sale-manager', url: 'https://www.etsy.com/your/shops/me/sales-discounts?ref=seller-platform' }),
  Object.freeze({ owner: 'sale-manager', url: 'https://etsy.com/your/shops/me/sales-discounts' }),
  Object.freeze({ owner: 'message-assistant', url: 'https://www.etsy.com/messages' }),
  Object.freeze({ owner: 'message-assistant', url: 'https://www.etsy.com/messages/123456789' }),
  Object.freeze({ owner: 'message-assistant', url: 'https://www.etsy.com/conversations/123456789' }),
  Object.freeze({ owner: 'message-assistant', url: 'https://www.etsy.com/your/orders/sold?ref=seller-platform' }),
  Object.freeze({ owner: 'message-assistant', url: 'https://www.etsy.com/your/shops/example-shop/dashboard' }),
  Object.freeze({ owner: 'listing-analyzer', url: 'https://www.etsy.com/your/shops/example-shop/tools/listings?ref=seller-platform' }),
  Object.freeze({ owner: 'listing-analyzer', url: 'https://www.etsy.com/your/shops/example-shop/listing-editor/edit/1234567890' }),
]);

export const MKUI_INTENTIONAL_SHARED_STORAGE_PROTOCOLS = Object.freeze([
  'makaytron-listing-research-request/v1',
  'makaytron-listing-research-result/v1',
]);

export const MKUI_STANDARD_DOM_EVENTS = Object.freeze([
  'abort', 'animationcancel', 'animationend', 'animationiteration', 'animationstart',
  'beforeinput', 'beforeunload', 'blur', 'change', 'click', 'close', 'contextmenu',
  'DOMContentLoaded', 'drag', 'dragend', 'dragenter', 'dragleave', 'dragover',
  'dragstart', 'drop', 'error', 'focus', 'focusin', 'focusout', 'hashchange',
  'input', 'keydown', 'keypress', 'keyup', 'load', 'message', 'mousedown',
  'mouseenter', 'mouseleave', 'mousemove', 'mouseout', 'mouseover', 'mouseup',
  'offline', 'online', 'pagehide', 'pageshow', 'pointercancel', 'pointerdown',
  'pointerenter', 'pointerleave', 'pointermove', 'pointerout', 'pointerover',
  'pointerup', 'popstate', 'readystatechange', 'reset', 'resize', 'scroll',
  'selectionchange', 'storage', 'submit', 'touchcancel', 'touchend', 'touchmove',
  'touchstart', 'transitioncancel', 'transitionend', 'transitionrun',
  'transitionstart', 'visibilitychange', 'wheel',
]);

export const MKUI_MAX_Z_INDEX = 2147483647;
export const MKUI_EXPECTED_VERSION = '1.0.0';
