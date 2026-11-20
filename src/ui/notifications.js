// The notification popover under the workspace bell.
//
// Design source: canvas artboards Notifications and Notifications-Empty
// (adaptation of template.primitive.card and template.primitive.tabs as a
// popover; shadcn.blocks.application-interface).

import { h, icon } from './dom.js';
import { ICONS } from './icons.js';

/** "2 min", "1 h", "Yesterday" or a date, in the interface language. */
export function relativeTime(at, now, language, t) {
  const min = Math.max(0, Math.round((now - at) / 60000));
  if (min < 60) return t('nt.minutes', { n: Math.max(1, min) });
  const hours = Math.round(min / 60);
  if (hours < 24 && new Date(at).getDate() === new Date(now).getDate()) return t('nt.hours', { n: hours });
  const day = 24 * 60 * 60 * 1000;
  if (now - at < 2 * day) return t('nt.yesterday');
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }).format(new Date(at));
}

let open = null;

export function toggleNotifications({ doc, root, anchor, text, notices, onSettings, onChange, now = () => Date.now() }) {
  if (open) { close(); return; }
  if (!notices) return;
  const { t } = text;
  let filter = 'all';

  function close() {
    open?.el.remove();
    doc.removeEventListener('pointerdown', onOutside, true);
    open?.anchor?.setAttribute('aria-expanded', 'false');
    open = null;
  }
  function onOutside(event) {
    const path = event.composedPath();
    if (!path.includes(open?.el) && !path.includes(anchor)) close();
  }

  function item(n) {
    return h(doc, 'button', {
      type: 'button', class: `nt-item${n.read ? '' : ' unread'}`, 'data-notice': n.id,
      onclick: async () => { await notices.markRead(n.id); onChange?.(); },
    },
    h(doc, 'span', { class: `dot${n.read ? ' none' : ''}` }),
    h(doc, 'span', { class: 'col grow', style: 'gap: 2px;' },
      h(doc, 'span', { class: n.read ? 'sm' : 'sm b', text: n.title }),
      h(doc, 'span', { class: 'xs mute', text: [n.tool ? t(`tool.${n.tool}`) : t('nt.app'), n.detail].filter(Boolean).join(' · ') })),
    h(doc, 'span', { class: 'xxs mute', style: 'white-space: nowrap;', text: relativeTime(n.at, now(), text.language(), t) }));
  }

  function body() {
    const list = notices.list(filter);
    const unread = notices.unread();
    const waiting = notices.list('action').length;
    const foot = h(doc, 'div', { class: 'row nt-foot' },
      h(doc, 'span', { class: 'xs mute grow', text: t('nt.last7') }),
      h(doc, 'button', { type: 'button', class: 'xs b nt-link', onclick: () => { close(); onSettings?.(); }, text: `${t('nt.settings')} →` }));
    if (!notices.list('all').length) {
      return [
        h(doc, 'div', { class: 'row nt-head' }, h(doc, 'span', { class: 'h2 grow', id: 'eat-nt-title', text: t('nt.title') })),
        h(doc, 'div', { class: 'col nt-empty' },
          h(doc, 'span', { class: 'nt-well' }, icon(doc, ICONS.bell, 20)),
          h(doc, 'span', { class: 'h3', style: 'margin-top: 8px;', text: t('nt.none') }),
          h(doc, 'span', { class: 'xs mute', style: 'max-width: 300px;', text: t('nt.noneText') })),
        foot];
    }
    return [
      h(doc, 'div', { class: 'row nt-head' },
        h(doc, 'span', { class: 'h2 grow', id: 'eat-nt-title', text: t('nt.title') }),
        unread ? h(doc, 'span', { class: 'badge dark', text: t('nt.new', { count: unread }) }) : null,
        h(doc, 'button', { type: 'button', class: 'btn btn-g btn-sm', 'data-action': 'notices-read', onclick: async () => { await notices.markAllRead(); onChange?.(); }, text: t('nt.readAll') })),
      h(doc, 'div', { class: 'seg', role: 'group', 'aria-label': t('nt.filter'), style: 'margin: 10px 16px 6px;' },
        h(doc, 'button', { type: 'button', class: filter === 'all' ? 'on' : null, 'aria-pressed': String(filter === 'all'), onclick: () => { filter = 'all'; draw(); }, text: t('nt.all') }),
        h(doc, 'button', { type: 'button', class: filter === 'action' ? 'on' : null, 'aria-pressed': String(filter === 'action'), onclick: () => { filter = 'action'; draw(); }, text: `${t('nt.waiting')} · ${waiting}` })),
      h(doc, 'div', { class: 'nt-list' }, list.map(item)),
      foot];
  }

  const el = h(doc, 'div', { class: 'pop nt', role: 'dialog', 'aria-labelledby': 'eat-nt-title', 'data-role': 'notifications', onkeydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); anchor.focus(); } } });
  function draw() { el.replaceChildren(...body()); }
  draw();
  const r = anchor.getBoundingClientRect();
  Object.assign(el.style, { top: `${r.bottom + 8}px`, right: `${Math.max(16, doc.defaultView.innerWidth - r.right - 16)}px` });
  root.append(el);
  anchor.setAttribute('aria-expanded', 'true');
  open = { el, anchor };
  doc.addEventListener('pointerdown', onOutside, true);
  el.querySelector('button')?.focus({ preventScroll: true });
}
