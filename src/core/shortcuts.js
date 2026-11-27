// Keyboard shortcuts (Settings › Shortcuts).

const NAMED = { ' ': 'Space', Enter: 'Enter', Escape: 'Escape', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' };

// Combinations Etsy's seller pages or the browser already use; choosing one gets a warning.
export const RESERVED = Object.freeze(['Ctrl+F', 'Ctrl+S', 'Ctrl+P', 'Ctrl+K', 'Ctrl+Z', 'Ctrl+Y', 'Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+A', 'Ctrl+T', 'Ctrl+W', 'Ctrl+R', 'Ctrl+L', 'Ctrl+Shift+T', 'Ctrl+Shift+N', 'Ctrl+Shift+I', 'Ctrl+Shift+J', 'Ctrl+Enter']);

/** "Ctrl+Shift+M" for a keydown event, or null for a bare modifier or an unusable key. */
export function comboFromEvent(event) {
  const key = event.key;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null;
  let name = NAMED[key] ?? null;
  if (!name && /^F(?:[1-9]|1[0-2])$/.test(key)) name = key;
  if (!name && /^Key[A-Z]$/.test(event.code ?? '')) name = event.code.slice(3);
  if (!name && /^Digit\d$/.test(event.code ?? '')) name = event.code.slice(5);
  if (!name && key.length === 1) name = key.toUpperCase();
  if (!name) return null;
  const mods = [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Meta'].filter(Boolean);
  if (!mods.length && !/^F\d/.test(name)) return null; // a plain letter would fight with typing
  return [...mods, name].join('+');
}

/** The action bound to an event, if shortcuts are on. Typing in a field never triggers one, except Ctrl+Enter style bindings. */
export function actionForEvent(event, shortcuts, { focused = null } = {}) {
  if (!shortcuts?.on) return null;
  const combo = comboFromEvent(event);
  if (!combo) return null;
  // focused: the field focused inside a closed shadow root, which the document only sees as its host.
  const target = focused ?? event.composedPath?.()[0] ?? event.target;
  const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName ?? '') || target?.isContentEditable;
  for (const [action, binding] of Object.entries(shortcuts.keys)) {
    if (binding !== combo) continue;
    if (typing && !/Enter$/.test(combo)) return null;
    return action;
  }
  return null;
}
