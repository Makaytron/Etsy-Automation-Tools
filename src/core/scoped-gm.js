// A `GM` object for an adopted standalone engine.
//
// The engine keeps calling GM.getValue('eda-batch-config-v4') as before; the
// shim stores it under the tool's namespace as `legacy.<key>`, the same place
// the transfer from the standalone script writes to. Menu commands are
// dropped (the unified script has its own), resources come from the build,
// and the reported script info has no update URLs, so the engine never runs
// the standalone package's own update check.
//
// Credentials inside stored objects (API keys, tokens) never land in the
// tool's namespace: `secrets` names them with the transfer's path format
// ('field' or '*.field', see shared/migration/handoff.js). On write they are
// split off into `eat:secret:<tool>.<key>`, which backups and the transfer
// never include; on read they are merged back, so the engine sees the same
// object it wrote.

import { KEY_PREFIX, SECRET_PREFIX } from './storage.js';
import { legacyStorageKey } from './migration.js';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const copy = (value) => JSON.parse(JSON.stringify(value));

/** Splits `value` into [value without credentials, credentials or null]. */
export function splitSecrets(paths, value) {
  if (!paths?.length || !isObject(value)) return [value, null];
  const rest = copy(value);
  const found = {};
  let any = false;
  for (const path of paths) {
    const [head, field] = path.split('.');
    if (head === '*' && field) {
      for (const [id, item] of Object.entries(rest)) {
        if (!isObject(item) || !(field in item)) continue;
        if (item[field] !== '' && item[field] != null) { found[id] = { ...(found[id] ?? {}), [field]: item[field] }; any = true; }
        item[field] = '';
      }
    } else if (head in rest) {
      if (rest[head] !== '' && rest[head] != null) { found[head] = rest[head]; any = true; }
      rest[head] = '';
    }
  }
  return [rest, any ? found : null];
}

/** Puts credentials split off by splitSecrets back into a stored value. */
export function mergeSecrets(paths, value, secret) {
  if (!paths?.length || !isObject(value) || !isObject(secret)) return value;
  const merged = copy(value);
  for (const path of paths) {
    const [head, field] = path.split('.');
    if (head === '*' && field) {
      for (const [id, item] of Object.entries(merged)) {
        if (isObject(item) && isObject(secret[id]) && field in secret[id]) item[field] = secret[id][field];
      }
    } else if (head in secret) {
      merged[head] = secret[head];
    }
  }
  return merged;
}

export function createScopedGm({ gm, namespace, doc, info = {}, resources = {}, secrets = {} }) {
  const base = `${KEY_PREFIX}${namespace}:`;
  const map = (key) => {
    const local = legacyStorageKey(key);
    if (!local) throw new Error(`Key cannot be stored for ${namespace}: ${key}`);
    return base + local;
  };
  const secretKey = (key) => `${SECRET_PREFIX}${namespace}.${legacyStorageKey(key)}`;
  const pathsFor = (key) => (Object.prototype.hasOwnProperty.call(secrets, key) ? secrets[key] : null);
  const withSecrets = async (key, value) => {
    const paths = pathsFor(key);
    if (!paths || !isObject(value)) return value;
    return mergeSecrets(paths, value, await gm.getValue(secretKey(key), null));
  };
  const unmapPrefix = `${base}legacy.`;
  return Object.freeze({
    info: Object.freeze({ script: Object.freeze({ name: info.name ?? 'Etsy Automation Tools', version: info.version ?? '', updateURL: '', downloadURL: '' }), scriptHandler: gm?.info?.scriptHandler ?? '' }),
    getValue: async (key, fallback) => withSecrets(key, await gm.getValue(map(key), fallback)),
    setValue: async (key, value) => {
      const paths = pathsFor(key);
      if (!paths) return gm.setValue(map(key), value);
      const [rest, found] = splitSecrets(paths, value);
      if (found) await gm.setValue(secretKey(key), found);
      else await gm.deleteValue(secretKey(key));
      return gm.setValue(map(key), rest);
    },
    deleteValue: async (key) => {
      if (pathsFor(key)) await gm.deleteValue(secretKey(key));
      return gm.deleteValue(map(key));
    },
    listValues: async () => (typeof gm.listValues === 'function' ? (await gm.listValues()) : [])
      .filter((k) => k.startsWith(unmapPrefix)).map((k) => k.slice(unmapPrefix.length)),
    addValueChangeListener: typeof gm?.addValueChangeListener === 'function'
      ? (key, callback) => gm.addValueChangeListener(map(key), (_name, oldValue, newValue, remote) => {
        if (!pathsFor(key)) return callback(key, oldValue, newValue, remote);
        void withSecrets(key, newValue).then((merged) => callback(key, oldValue, merged, remote));
        return undefined;
      })
      : undefined,
    removeValueChangeListener: typeof gm?.removeValueChangeListener === 'function' ? (id) => gm.removeValueChangeListener(id) : undefined,
    registerMenuCommand: () => null,
    xmlHttpRequest: typeof gm?.xmlHttpRequest === 'function' ? (details) => gm.xmlHttpRequest(details) : undefined,
    getResourceURL: async (name) => resources[name] ?? '',
    addStyle: (css) => {
      const style = doc.createElement('style');
      style.textContent = css;
      (doc.head ?? doc.documentElement).append(style);
      return style;
    },
  });
}
