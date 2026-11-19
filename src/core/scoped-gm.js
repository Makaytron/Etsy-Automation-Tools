// A `GM` object for an adopted standalone engine.
//
// The engine keeps calling GM.getValue('eda-batch-config-v4') as before; the
// shim stores it under the tool's namespace as `legacy.<key>`, the same place
// the transfer from the standalone script writes to. Menu commands are
// dropped (the unified script has its own), resources come from the build,
// and the reported script info has no update URLs, so the engine never runs
// the standalone package's own update check.

import { KEY_PREFIX } from './storage.js';
import { legacyStorageKey } from './migration.js';

export function createScopedGm({ gm, namespace, doc, info = {}, resources = {} }) {
  const base = `${KEY_PREFIX}${namespace}:`;
  const map = (key) => {
    const local = legacyStorageKey(key);
    if (!local) throw new Error(`Key cannot be stored for ${namespace}: ${key}`);
    return base + local;
  };
  const unmapPrefix = `${base}legacy.`;
  return Object.freeze({
    info: Object.freeze({ script: Object.freeze({ name: info.name ?? 'Etsy Automation Tools', version: info.version ?? '', updateURL: '', downloadURL: '' }), scriptHandler: gm?.info?.scriptHandler ?? '' }),
    getValue: (key, fallback) => gm.getValue(map(key), fallback),
    setValue: (key, value) => gm.setValue(map(key), value),
    deleteValue: (key) => gm.deleteValue(map(key)),
    listValues: async () => (typeof gm.listValues === 'function' ? (await gm.listValues()) : [])
      .filter((k) => k.startsWith(unmapPrefix)).map((k) => k.slice(unmapPrefix.length)),
    addValueChangeListener: typeof gm?.addValueChangeListener === 'function'
      ? (key, callback) => gm.addValueChangeListener(map(key), (_name, oldValue, newValue, remote) => callback(key, oldValue, newValue, remote))
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
