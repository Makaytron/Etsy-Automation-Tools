// Shared settings with defaults and validation.
//
// Values coming from storage or a restored backup are never trusted: every
// field is normalized, and anything invalid falls back to its default.

export const EDGES = Object.freeze(['right', 'left', 'top', 'bottom']);
export const THEMES = Object.freeze(['light', 'dark', 'system']);
export const DENSITIES = Object.freeze(['comfortable', 'compact']);
export const TOOL_IDS = Object.freeze(['sale-manager', 'message-assistant', 'ads-keyword-manager', 'listing-analyzer', 'keyword-market-analyzer']);

// Events the tools announce (design canvas: Settings-Notify). Each can show in the panel and on the desktop.
export const NOTICE_EVENTS = Object.freeze(['seriesDone', 'seriesStopped', 'newMessage', 'autopilotWaiting', 'scanDone', 'queueWaiting', 'newVersion']);
const NOTICE_DEFAULTS = Object.freeze({
  seriesDone: [true, true], seriesStopped: [true, true], newMessage: [true, false], autopilotWaiting: [true, true],
  scanDone: [true, false], queueWaiting: [true, false], newVersion: [true, false],
});

// Keyboard shortcuts (design canvas: Settings-Keys). A binding is "Ctrl+Shift+M"-style text.
export const SHORTCUT_ACTIONS = Object.freeze(['drawer', 'workspace', 'adsClosePage', 'adsScanAll', 'laScanAll', 'salePause', 'maInsertDraft']);
export const DEFAULT_SHORTCUTS = Object.freeze({
  drawer: 'Ctrl+Shift+M', workspace: 'Ctrl+Shift+O', adsClosePage: 'Ctrl+Space', adsScanAll: 'Ctrl+Alt+K',
  laScanAll: 'Ctrl+Alt+A', salePause: 'Ctrl+Shift+P', maInsertDraft: 'Ctrl+Enter',
});
const SHORTCUT_PATTERN = /^(?:(?:Ctrl|Alt|Shift|Meta)\+){0,3}(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|Space|Enter|Escape|Tab|Backspace|Delete|Arrow(?:Up|Down|Left|Right)|[,.\/;'\[\]\`=-])$/;

export const DATE_FORMATS = Object.freeze(['auto', 'd-mmm-y', 'dd.mm.yyyy', 'mm/dd/yyyy', 'yyyy-mm-dd']);
export const NUMBER_FORMATS = Object.freeze(['auto', 'comma', 'dot']);
export const WEEK_STARTS = Object.freeze(['auto', 'monday', 'sunday', 'saturday']);
export const UPDATE_CHANNELS = Object.freeze(['stable', 'beta']);
export const AI_TASKS = Object.freeze(['translate', 'drafts', 'listing']);
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const TIMEZONE_PATTERN = /^(?:browser|UTC|[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){1,2})$/;

export const DEFAULT_SETTINGS = Object.freeze({
  language: null, // null until the user picks one in onboarding
  theme: 'system',
  density: 'comfortable',
  drawer: Object.freeze({
    edge: 'right',
    offset: 0.5, // position along the edge, 0..1
    openOnLoad: false,
    keepOpenWhileRunning: true,
  }),
  tools: Object.freeze(Object.fromEntries(TOOL_IDS.map((id) => [id, true]))),
  showProSuggestions: true,
  updateNotes: true,
  onboarded: false, // first-run setup finished
  notify: Object.freeze({
    events: Object.freeze(Object.fromEntries(NOTICE_EVENTS.map((e) => [e, Object.freeze({ panel: NOTICE_DEFAULTS[e][0], desktop: NOTICE_DEFAULTS[e][1] })]))),
    quiet: Object.freeze({ on: false, start: '23:00', end: '08:00' }),
    sound: false,
  }),
  shortcuts: Object.freeze({ on: true, keys: DEFAULT_SHORTCUTS }),
  updates: Object.freeze({ channel: 'stable' }),
  format: Object.freeze({ date: 'auto', timezone: 'browser', number: 'auto', weekStart: 'auto' }),
  ai: Object.freeze({ translate: null, drafts: null, listing: null, confirmBeforeSend: false, hideNames: true, autoTranslate: false }),
  links: Object.freeze({ kwToListing: true, orderInfoInMessages: true }),
});

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const LANGUAGE_PATTERN = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2}|-\d{3})?$/;

export function normalizeSettings(input) {
  const src = input && typeof input === 'object' ? input : {};
  const d = DEFAULT_SETTINGS;
  const drawer = src.drawer && typeof src.drawer === 'object' ? src.drawer : {};
  const tools = src.tools && typeof src.tools === 'object' ? src.tools : {};
  const offset = Number(drawer.offset);
  return {
    language: typeof src.language === 'string' && LANGUAGE_PATTERN.test(src.language) ? src.language : d.language,
    theme: pick(src.theme, THEMES, d.theme),
    density: pick(src.density, DENSITIES, d.density),
    drawer: {
      edge: pick(drawer.edge, EDGES, d.drawer.edge),
      offset: Number.isFinite(offset) ? Math.min(1, Math.max(0, offset)) : d.drawer.offset,
      openOnLoad: bool(drawer.openOnLoad, d.drawer.openOnLoad),
      keepOpenWhileRunning: bool(drawer.keepOpenWhileRunning, d.drawer.keepOpenWhileRunning),
    },
    tools: Object.fromEntries(TOOL_IDS.map((id) => [id, bool(tools[id], true)])),
    showProSuggestions: bool(src.showProSuggestions, d.showProSuggestions),
    updateNotes: bool(src.updateNotes, d.updateNotes),
    onboarded: bool(src.onboarded, d.onboarded),
    notify: normalizeNotify(src.notify),
    shortcuts: normalizeShortcuts(src.shortcuts),
    updates: { channel: pick(obj(src.updates).channel, UPDATE_CHANNELS, d.updates.channel) },
    format: {
      date: pick(obj(src.format).date, DATE_FORMATS, d.format.date),
      timezone: typeof obj(src.format).timezone === 'string' && TIMEZONE_PATTERN.test(src.format.timezone) ? src.format.timezone : d.format.timezone,
      number: pick(obj(src.format).number, NUMBER_FORMATS, d.format.number),
      weekStart: pick(obj(src.format).weekStart, WEEK_STARTS, d.format.weekStart),
    },
    ai: {
      ...Object.fromEntries(AI_TASKS.map((task) => [task, typeof obj(src.ai)[task] === 'string' && /^[a-z0-9-]{1,40}$/.test(src.ai[task]) ? src.ai[task] : null])),
      confirmBeforeSend: bool(obj(src.ai).confirmBeforeSend, d.ai.confirmBeforeSend),
      hideNames: bool(obj(src.ai).hideNames, d.ai.hideNames),
      autoTranslate: bool(obj(src.ai).autoTranslate, d.ai.autoTranslate),
    },
    links: {
      kwToListing: bool(obj(src.links).kwToListing, d.links.kwToListing),
      orderInfoInMessages: bool(obj(src.links).orderInfoInMessages, d.links.orderInfoInMessages),
    },
  };
}

function obj(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }

function normalizeNotify(input) {
  const src = obj(input);
  const d = DEFAULT_SETTINGS.notify;
  const events = obj(src.events);
  const quiet = obj(src.quiet);
  return {
    events: Object.fromEntries(NOTICE_EVENTS.map((e) => [e, { panel: bool(obj(events[e]).panel, d.events[e].panel), desktop: bool(obj(events[e]).desktop, d.events[e].desktop) }])),
    quiet: {
      on: bool(quiet.on, d.quiet.on),
      start: typeof quiet.start === 'string' && TIME_PATTERN.test(quiet.start) ? quiet.start : d.quiet.start,
      end: typeof quiet.end === 'string' && TIME_PATTERN.test(quiet.end) ? quiet.end : d.quiet.end,
    },
    sound: bool(src.sound, d.sound),
  };
}

function normalizeShortcuts(input) {
  const src = obj(input);
  const keys = obj(src.keys);
  return {
    on: bool(src.on, true),
    keys: Object.fromEntries(SHORTCUT_ACTIONS.map((a) => [a, typeof keys[a] === 'string' && SHORTCUT_PATTERN.test(keys[a]) ? keys[a] : DEFAULT_SHORTCUTS[a]])),
  };
}

/** Settings bound to the `core` storage namespace. */
export function createSettings(coreNamespace) {
  let cache = null;
  const listeners = new Set();
  return {
    async load() {
      cache = normalizeSettings(await coreNamespace.get('settings', null));
      return cache;
    },
    get() {
      if (!cache) throw new Error('Settings not loaded');
      return cache;
    },
    async update(patch) {
      const current = cache ?? (await this.load());
      const next = normalizeSettings({
        ...current,
        ...patch,
        drawer: { ...current.drawer, ...(patch?.drawer ?? {}) },
        tools: { ...current.tools, ...(patch?.tools ?? {}) },
        notify: merge(current.notify, patch?.notify),
        shortcuts: merge(current.shortcuts, patch?.shortcuts),
        updates: { ...current.updates, ...(patch?.updates ?? {}) },
        format: { ...current.format, ...(patch?.format ?? {}) },
        ai: { ...current.ai, ...(patch?.ai ?? {}) },
        links: { ...current.links, ...(patch?.links ?? {}) },
      });
      await coreNamespace.set('settings', next);
      cache = next;
      for (const fn of listeners) fn(next);
      return next;
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

/** Deep merge for nested settings patches (plain objects only). */
function merge(base, patch) {
  if (!patch || typeof patch !== 'object') return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && base?.[k] && typeof base[k] === 'object' ? merge(base[k], v) : v;
  return out;
}
