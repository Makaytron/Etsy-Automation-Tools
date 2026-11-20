// Notification centre: what the tools announce (a series stopped, a scan
// finished, a new version…), kept for seven days in this browser.
//
// Each event is shown in the panel and/or on the desktop as Settings ›
// Notifications says (settings.notify). Desktop notices use the browser's own
// Notification API, only after the user granted it, and never in quiet hours.
// Nothing leaves the browser.

const KEY = 'notices';
const MAX_ITEMS = 50;
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

export function normalizeNotice(input) {
  const src = input && typeof input === 'object' ? input : {};
  const at = Number(src.at);
  if (!Number.isFinite(at)) return null;
  const title = text(src.title, 160);
  if (!title) return null;
  return {
    id: text(src.id, 40) || `n${at.toString(36)}`,
    event: text(src.event, 40),
    tool: text(src.tool, 40),
    title,
    detail: text(src.detail, 240),
    page: text(src.page, 80),
    needsAction: src.needsAction === true,
    read: src.read === true,
    at,
  };
}

/** True when `now` (a Date) is inside the HH:MM quiet window, which may cross midnight. */
export function inQuietHours(quiet, now) {
  if (!quiet?.on) return false;
  const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const m = now.getHours() * 60 + now.getMinutes();
  const start = toMin(quiet.start);
  const end = toMin(quiet.end);
  return start <= end ? m >= start && m < end : m >= start || m < end;
}

export function createNotices({ store, settings, scope, now = () => Date.now() }) {
  let items = [];
  const listeners = new Set();
  const emit = () => { for (const fn of listeners) fn(items); };
  const fresh = (list) => list.filter((n) => now() - n.at < KEEP_MS).slice(0, MAX_ITEMS);
  const stored = async () => { const raw = await store.get(KEY, []); return (Array.isArray(raw) ? raw : []).map(normalizeNotice).filter(Boolean); };
  /** Union by id, newest first; a notice read in any tab stays read. */
  function merge(...lists) {
    const byId = new Map();
    for (const n of lists.flat()) { const seen = byId.get(n.id); byId.set(n.id, seen ? { ...seen, read: seen.read || n.read } : n); }
    return fresh([...byId.values()].sort((a, b) => b.at - a.at));
  }
  // Several Etsy tabs share the stored history: every change is applied to the stored list as it is now,
  // never by writing back this tab's older copy.
  async function mutate(change) {
    items = fresh(change(merge(await stored())));
    await store.set(KEY, items);
    emit();
  }

  async function load() {
    items = merge(await stored());
    emit();
    return items;
  }

  function desktop(item) {
    const N = scope?.Notification;
    if (!N || N.permission !== 'granted') return;
    if (inQuietHours(settings.get().notify.quiet, new Date(now()))) return;
    try {
      const n = new N(item.title, { body: item.detail, silent: !settings.get().notify.sound, tag: `eat-${item.event}` });
      n.onclick = () => { scope.focus?.(); n.close(); };
    } catch { /* the browser refused; the panel still has it */ }
  }

  async function add({ event, tool = '', title, detail = '', page = '', needsAction = false }) {
    const prefs = settings.get().notify.events[event] ?? { panel: true, desktop: false };
    const item = normalizeNotice({ event, tool, title, detail, page, needsAction, at: now(), id: `n${now().toString(36)}${Math.random().toString(36).slice(2, 6)}` });
    if (!item) return null;
    if (prefs.desktop) desktop(item);
    if (!prefs.panel) return null;
    await mutate((list) => [item, ...list]);
    return item;
  }

  async function markAllRead() {
    await mutate((list) => list.map((n) => ({ ...n, read: true })));
  }

  async function markRead(id) {
    await mutate((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  async function clear() {
    await mutate(() => []);
  }

  return {
    load,
    add,
    markAllRead,
    markRead,
    clear,
    list: (filter = 'all') => (filter === 'action' ? items.filter((n) => n.needsAction) : items),
    unread: () => items.filter((n) => !n.read).length,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Browser permission for desktop notices: 'granted' | 'denied' | 'default' | 'unsupported'. */
    permission: () => scope?.Notification?.permission ?? 'unsupported',
    requestPermission: async () => (scope?.Notification?.requestPermission ? scope.Notification.requestPermission() : 'unsupported'),
  };
}
