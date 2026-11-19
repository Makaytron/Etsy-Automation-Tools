// Value-store adapters.
//
// Tampermonkey exposes either the promise API (`GM.getValue`) or the legacy
// synchronous API (`GM_getValue`). Core code only talks to the small async
// interface below so it can run unchanged under Tampermonkey and in tests.

/**
 * @typedef {object} ValueStore
 * @property {(key: string, fallback?: unknown) => Promise<unknown>} get
 * @property {(key: string, value: unknown) => Promise<void>} set
 * @property {(key: string) => Promise<void>} delete
 * @property {() => Promise<string[]>} keys
 */

/** Builds a ValueStore over the userscript manager's API, or null when none is granted. */
export function createGmStore(scope = globalThis) {
  const gm = scope.GM;
  if (gm && typeof gm.getValue === 'function') {
    return {
      get: (key, fallback) => gm.getValue(key, fallback),
      set: (key, value) => gm.setValue(key, value),
      delete: (key) => gm.deleteValue(key),
      keys: async () => (typeof gm.listValues === 'function' ? gm.listValues() : []),
    };
  }
  if (typeof scope.GM_getValue === 'function') {
    return {
      get: async (key, fallback) => scope.GM_getValue(key, fallback),
      set: async (key, value) => { scope.GM_setValue(key, value); },
      delete: async (key) => { scope.GM_deleteValue(key); },
      keys: async () => (typeof scope.GM_listValues === 'function' ? scope.GM_listValues() : []),
    };
  }
  return null;
}

/** In-memory ValueStore for tests and for running without storage grants. */
export function createMemoryStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get: async (key, fallback) => (data.has(key) ? structuredClone(data.get(key)) : fallback),
    set: async (key, value) => { data.set(key, structuredClone(value)); },
    delete: async (key) => { data.delete(key); },
    keys: async () => [...data.keys()],
    snapshot: () => Object.fromEntries(data),
  };
}
