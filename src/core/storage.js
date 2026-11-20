// Namespaced storage for the unified script.
//
// Every key lives under `eat:v1:<namespace>:<key>`, so modules cannot
// overwrite each other and the shared core keeps its own `core` namespace.
// Secrets (API keys) live in a separate `eat:secret:` space: they are never
// part of a backup export and are only removed by an explicit choice.

export const KEY_PREFIX = 'eat:v1:';
export const SECRET_PREFIX = 'eat:secret:';
const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]{1,40}$/;
const KEY_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;

function assertNamespace(namespace) {
  if (!NAMESPACE_PATTERN.test(namespace)) throw new TypeError(`Invalid storage namespace: ${namespace}`);
}
function assertKey(key) {
  if (!KEY_PATTERN.test(key)) throw new TypeError(`Invalid storage key: ${key}`);
}

/** Creates a storage facade over a ValueStore (see gm.js). */
export function createStorage(store) {
  if (!store) throw new TypeError('A value store is required');

  function namespace(name) {
    assertNamespace(name);
    const base = `${KEY_PREFIX}${name}:`;
    return {
      name,
      async get(key, fallback = undefined) { assertKey(key); return store.get(base + key, fallback); },
      async set(key, value) { assertKey(key); await store.set(base + key, value); },
      async delete(key) { assertKey(key); await store.delete(base + key); },
      async keys() {
        return (await store.keys()).filter((k) => k.startsWith(base)).map((k) => k.slice(base.length));
      },
    };
  }

  const secrets = {
    async get(id) { assertKey(id); return store.get(SECRET_PREFIX + id, null); },
    async set(id, value) { assertKey(id); await store.set(SECRET_PREFIX + id, value); },
    async delete(id) { assertKey(id); await store.delete(SECRET_PREFIX + id); },
    async ids() {
      return (await store.keys()).filter((k) => k.startsWith(SECRET_PREFIX)).map((k) => k.slice(SECRET_PREFIX.length));
    },
  };

  /** Backup of all non-secret data. Secrets are excluded by construction. */
  async function exportBackup({ appVersion, now = new Date() } = {}) {
    const data = {};
    for (const key of await store.keys()) {
      if (key.startsWith(KEY_PREFIX)) data[key.slice(KEY_PREFIX.length)] = await store.get(key);
    }
    return { format: 'etsy-automation-tools-backup', formatVersion: 1, appVersion, createdAt: now.toISOString(), data };
  }

  /** Restores a backup produced by exportBackup. Never touches secrets. */
  async function importBackup(backup) {
    if (backup?.format !== 'etsy-automation-tools-backup' || backup.formatVersion !== 1 || typeof backup.data !== 'object' || backup.data === null) {
      throw new TypeError('Not an Etsy Automation Tools backup');
    }
    const entries = Object.entries(backup.data);
    for (const [key] of entries) {
      const [ns, ...rest] = key.split(':');
      assertNamespace(ns);
      assertKey(rest.join(':'));
    }
    for (const [key, value] of entries) await store.set(KEY_PREFIX + key, value);
    return entries.length;
  }

  /**
   * Deletes local data. `namespaces` limits the deletion to those namespaces;
   * secrets are removed only when `includeSecrets` is true.
   */
  async function clear({ namespaces = null, includeSecrets = false } = {}) {
    const wanted = namespaces ? new Set(namespaces) : null;
    let removed = 0;
    for (const key of await store.keys()) {
      const isData = key.startsWith(KEY_PREFIX);
      const isSecret = key.startsWith(SECRET_PREFIX);
      if (isData) {
        const ns = key.slice(KEY_PREFIX.length).split(':')[0];
        if (wanted && !wanted.has(ns)) continue;
      } else if (!(isSecret && includeSecrets)) {
        continue;
      }
      await store.delete(key);
      removed += 1;
    }
    return removed;
  }

  /** Bytes kept per namespace (UTF-8 of each stored JSON value); secrets are counted apart. */
  async function usage() {
    const bytes = {};
    let secretsBytes = 0;
    const size = (value) => new TextEncoder().encode(JSON.stringify(value ?? null)).length;
    for (const key of await store.keys()) {
      if (key.startsWith(KEY_PREFIX)) {
        const ns = key.slice(KEY_PREFIX.length).split(':')[0];
        bytes[ns] = (bytes[ns] ?? 0) + size(await store.get(key, null)) + key.length;
      } else if (key.startsWith(SECRET_PREFIX)) {
        secretsBytes += size(await store.get(key, null)) + key.length;
      }
    }
    return { bytes, secrets: secretsBytes, total: Object.values(bytes).reduce((a, b) => a + b, 0) };
  }

  return { namespace, secrets, exportBackup, importBackup, clear, usage };
}
