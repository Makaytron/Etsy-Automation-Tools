// Toasts for notices announced while the page is open (design canvas artboard
// States: success, error and info toasts with a timer line). The notice itself
// stays in the bell's list; the toast only says it as it happens.
// Design sources: Toast-01 anatomy as adapted in the canvas (.toast/.in/.ico/.pl).

import { h, icon } from './dom.js';
import { ICONS } from './icons.js';

const SHOW_MS = 6000;
const TONE = { seriesDone: 'ok', scanDone: 'ok', seriesStopped: 'err', autopilotWaiting: 'info', queueWaiting: 'info', newMessage: 'info', newVersion: 'info' };
const STYLE = {
  ok: { glyph: ICONS.check, well: 'background: #ecfdf3; color: #15803d;' },
  err: { glyph: ICONS.alert, well: 'background: #fef2f2; color: #b91c1c;' },
  info: { glyph: ICONS.info, well: 'background: var(--soft); color: var(--ink2);' },
};

/** Watches `notices` and shows a toast for each notice added after it starts. */
export function createToasts({ doc, container, text, notices, now = () => Date.now() }) {
  if (!notices) return () => {};
  const since = now();
  const shown = new Set(notices.list().map((n) => n.id));
  let stack = null;

  function show(n) {
    if (!stack?.isConnected) {
      stack = h(doc, 'div', { class: 'col', role: 'region', 'aria-live': 'polite', 'aria-label': text.t('nt.title'), style: 'position: fixed; inset-inline-end: 16px; bottom: 16px; gap: 8px; z-index: 2147483646;' });
      container.append(stack);
    }
    const tone = TONE[n.event] ?? 'info';
    const { glyph, well } = STYLE[tone];
    const remove = () => el.remove();
    const el = h(doc, 'div', { class: 'toast', role: tone === 'err' ? 'alert' : 'status', 'data-notice': n.id },
      h(doc, 'div', { class: 'in' },
        h(doc, 'span', { class: 'ico', style: well }, icon(doc, glyph, 14)),
        h(doc, 'span', { class: 'col grow', style: 'gap: 2px; min-width: 0;' },
          h(doc, 'span', { class: 'sm b', text: n.title }),
          n.detail ? h(doc, 'span', { class: 'xs mute', text: n.detail }) : null),
        h(doc, 'button', { class: 'ib', type: 'button', 'aria-label': text.t('fb.cancel'), onclick: remove }, icon(doc, ICONS.close, 14))),
      h(doc, 'div', { class: 'pl', style: `animation: eat-toast-timer ${SHOW_MS}ms linear forwards;` }));
    stack.append(el);
    doc.defaultView?.setTimeout(remove, SHOW_MS);
  }

  return notices.subscribe((items) => {
    for (const n of items) {
      if (shown.has(n.id)) continue;
      shown.add(n.id);
      if (n.at >= since) show(n);
    }
  });
}
