// Minimal event bus shared by the core and the tools.

export function createEvents(onError = (error) => console.error('[Etsy Automation Tools]', error)) {
  const handlers = new Map();
  return {
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
      return () => handlers.get(type)?.delete(fn);
    },
    emit(type, detail) {
      for (const fn of handlers.get(type) ?? []) {
        try { fn(detail); } catch (error) { onError(error); }
      }
    },
  };
}
