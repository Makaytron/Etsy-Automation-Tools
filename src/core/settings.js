// Shared settings with defaults and validation.
//
// Values coming from storage or a restored backup are never trusted: every
// field is normalized, and anything invalid falls back to its default.

export const EDGES = Object.freeze(['right', 'left', 'top', 'bottom']);
export const THEMES = Object.freeze(['light', 'dark', 'system']);
export const DENSITIES = Object.freeze(['comfortable', 'compact']);
export const TOOL_IDS = Object.freeze(['sale-manager', 'message-assistant', 'ads-keyword-manager', 'listing-analyzer', 'keyword-market-analyzer']);

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
      });
      await coreNamespace.set('settings', next);
      cache = next;
      for (const fn of listeners) fn(next);
      return next;
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
