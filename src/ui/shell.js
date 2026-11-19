// Drawer shell: the edge button and the drawer on Etsy seller pages.
//
// Everything renders inside a closed shadow root, so Etsy's page scripts can
// neither read the drawer nor restyle it, and our styles never leak into
// Etsy. Position, edge and open-on-load come from shared settings.

import { h, icon } from './dom.js';
import { ICONS } from './icons.js';
import { TOOL_HOME } from './strings.js';
import { SHELL_CSS } from './styles.js';
import { WORKSPACE_CSS } from './styles-workspace.js';
import { createText } from './text.js';
import { createLanguagePacks } from '../core/language-packs.js';
import { createWorkspace } from './workspace.js';
import { openOnboarding } from './onboarding.js';
import { tabRect, snapToEdge, drawerSide, drawerWidth, TAB_SHORT } from '../core/drawer-geometry.js';
import { TOOL_IDS } from '../core/settings.js';

const DRAG_THRESHOLD = 5;
const HOST_ID = 'makaytron-eat-root';

export function createShell({ scope, settings, host, storage, appVersion, migration, assets = {}, onActiveChange }) {
  const doc = scope.document;
  const state = { open: false, drag: null, mounted: false };
  let root; let container; let tab; let sheet; let zones; let titleId; let workspace; let hostEl;
  let unsubscribe = [];

  // Language packs download on demand; a change re-renders whatever is open.
  let text = null;
  const packs = createLanguagePacks({ gm: scope.GM, cache: storage.namespace('core'), appVersion, onChange: () => text?.packChanged() });
  text = createText({ settings, scope, packs });
  const { t, language } = text;
  const viewport = () => ({ width: scope.innerWidth, height: scope.innerHeight });
  const theme = () => {
    const pref = settings.get().theme;
    if (pref === 'light' || pref === 'dark') return pref;
    return scope.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  function mount() {
    if (state.mounted) return;
    hostEl = h(doc, 'div', { id: HOST_ID });
    root = hostEl.attachShadow({ mode: 'closed' });
    const style = h(doc, 'style', { text: `${assets.mkuiTokens ?? ''}\n${SHELL_CSS}\n${WORKSPACE_CSS}` });
    container = h(doc, 'div', { class: 'mkui-root' });
    root.append(style, container);
    doc.documentElement.append(hostEl);
    titleId = 'eat-sheet-title';
    tab = h(doc, 'button', {
      class: 'tab', type: 'button', 'aria-haspopup': 'dialog', 'aria-controls': 'eat-sheet', 'aria-expanded': 'false',
      onpointerdown: onPointerDown, onkeydown: onTabKey,
    }, assets.logo ? h(doc, 'img', { src: assets.logo, alt: '' }) : null, h(doc, 'span', { class: 'grip', 'aria-hidden': 'true' }));
    container.append(tab);
    workspace = createWorkspace({ scope, container, text, settings, storage, host, appVersion, migration, assets, onClose: onWorkspaceClose });
    scope.addEventListener('resize', layout);
    const scheme = scope.matchMedia?.('(prefers-color-scheme: dark)');
    scheme?.addEventListener?.('change', applyChrome);
    unsubscribe = [
      settings.subscribe(() => { applyChrome(); render(); layout(); }),
      () => workspace.dispose(),
      text.onPackChange(() => { applyChrome(); render(); if (workspace?.isOpen) workspace.refresh(); }),
      () => scheme?.removeEventListener?.('change', applyChrome),
    ];
    state.mounted = true;
    applyChrome();
    render();
    if (!settings.get().onboarded) {
      openOnboarding({ doc, container, text, settings, scope, onDone: () => tab.focus({ preventScroll: true }) });
    } else if (settings.get().drawer.openOnLoad) {
      setOpen(true, { focus: false });
    }
    layout();
  }

  function unmount() {
    if (!state.mounted) return;
    for (const off of unsubscribe) off();
    unsubscribe = [];
    scope.removeEventListener('resize', layout);
    if (workspace?.isOpen) workspace.close();
    doc.getElementById(HOST_ID)?.remove();
    state.mounted = false;
    state.open = false;
  }

  function applyChrome() {
    const lang = language();
    void text.ensurePack();
    container.setAttribute('data-theme', theme());
    container.setAttribute('lang', lang);
    container.setAttribute('dir', text.direction());
    container.setAttribute('data-density', settings.get().density);
    tab.setAttribute('aria-label', state.open ? t('drawer.close') : t('drawer.open'));
  }

  function statusText(id) {
    const module = host.module?.(id);
    const tool = t(`tool.${id}`);
    if (!module?.migrated) return t('drawer.notMigrated');
    const status = module.status?.();
    if (status === 'standalone') return t('drawer.standaloneActive', { tool });
    if (status === 'running') return t('drawer.engineRunning', { tool });
    return t('drawer.engineStarting', { tool });
  }

  // ── Drawer content ──────────────────────────────────────────────────
  function render() {
    sheet?.remove();
    const s = settings.get();
    const active = host.activeTool;
    const enabled = TOOL_IDS.filter((id) => s.tools[id] !== false);
    const toolLink = (id) => h(doc, 'li', {},
      h(doc, 'a', { class: 'tool', href: TOOL_HOME[id], 'aria-current': id === active ? 'page' : null },
        icon(doc, ICONS[id]),
        h(doc, 'span', { class: 'tool-text' }, h(doc, 'span', { class: 'tool-name', text: t(`tool.${id}`) }), h(doc, 'span', { class: 'tool-where', text: t(`where.${id}`) }))));

    const toolView = active ? host.module?.(active)?.renderDrawer?.(toolUi()) : null;
    const current = active
      ? h(doc, 'section', { class: 'section', 'aria-labelledby': 'eat-current' },
        h(doc, 'span', { class: 'overline', id: 'eat-current', text: t('drawer.thisPage') }),
        toolView ?? h(doc, 'div', { class: 'current' }, icon(doc, ICONS[active]), h(doc, 'span', { text: t(`tool.${active}`) })),
        toolView ? null : h(doc, 'p', { class: 'muted', 'data-role': 'tool-status', text: statusText(active) }))
      : h(doc, 'section', { class: 'section empty' },
        h(doc, 'span', { class: 'empty-icon' }, icon(doc, ICONS.compass, 20)),
        h(doc, 'strong', { text: t('drawer.noTool') }),
        h(doc, 'p', { class: 'muted', text: t('drawer.noToolHint') }));

    const others = enabled.filter((id) => id !== active);
    const tools = h(doc, 'section', { class: 'section', 'aria-labelledby': 'eat-tools' },
      h(doc, 'span', { class: 'overline', id: 'eat-tools', text: active ? t('drawer.otherTools') : t('drawer.tools') }),
      h(doc, 'ul', { class: 'tools' }, others.map(toolLink)));

    const footer = s.showProSuggestions
      ? h(doc, 'div', { class: 'sheet-footer' },
        h(doc, 'span', {}, `${t('drawer.pro')} `, h(doc, 'a', { href: 'https://makaytron.com', target: '_blank', rel: 'noopener noreferrer', text: `${t('drawer.proLink')} →` })),
        h(doc, 'button', { class: 'btn btn-ghost btn-icon close', type: 'button', 'aria-label': t('drawer.hidePro'), onclick: () => settings.update({ showProSuggestions: false }) }, icon(doc, ICONS.close, 14)))
      : null;

    const routeLabel = active ? t(`tool.${active}`) : t('page.unsupported');
    sheet = h(doc, 'aside', { class: 'sheet', id: 'eat-sheet', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': titleId, hidden: !state.open, onkeydown: onSheetKey },
      h(doc, 'header', { class: 'sheet-header' },
        h(doc, 'a', { class: 'brand', href: 'https://makaytron.com', target: '_blank', rel: 'noopener noreferrer', 'aria-label': t('drawer.brandLink') },
          assets.logo ? h(doc, 'img', { src: assets.logo, alt: '' }) : null,
          h(doc, 'span', { class: 'brand-text' }, h(doc, 'h2', { class: 'sheet-title', id: titleId, text: 'Makaytron.com' }), h(doc, 'p', { class: 'sheet-description', text: `Etsy Automation Tools · ${routeLabel}` }))),
        h(doc, 'button', { class: 'btn btn-ghost btn-icon close', type: 'button', 'aria-label': t('ws.open'), 'data-action': 'open-workspace', onclick: openWorkspace }, icon(doc, ICONS.expand)),
        h(doc, 'button', { class: 'btn btn-ghost btn-icon close', type: 'button', 'aria-label': t('drawer.close'), 'data-action': 'close-drawer', onclick: () => setOpen(false) }, icon(doc, ICONS.close))),
      h(doc, 'div', { class: 'sheet-body' }, current, tools),
      footer);
    container.append(sheet);
    layout();
  }

  // ── Geometry ────────────────────────────────────────────────────────
  function layout() {
    if (!state.mounted || state.drag) return;
    const { edge, offset } = settings.get().drawer;
    const vp = viewport();
    const side = drawerSide(edge);
    const width = Math.min(drawerWidth(vp.width), vp.width);
    const rect = tabRect(edge, offset, vp);
    let x = rect.x;
    if (state.open && edge === 'right') x = vp.width - width - TAB_SHORT;
    if (state.open && edge === 'left') x = width;
    Object.assign(tab.style, { left: `${x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    tab.setAttribute('data-edge', edge);
    sheet.setAttribute('data-side', side);
    sheet.style.width = `${width}px`;
  }

  // Engines adopted from standalone scripts draw their own panels at the top layer too; whatever opens last stays on top.
  function raise() {
    if (hostEl && hostEl.nextElementSibling) doc.documentElement.append(hostEl);
  }

  function setOpen(open, { focus = true } = {}) {
    if (open) raise();
    state.open = open;
    sheet.hidden = !open;
    tab.setAttribute('aria-expanded', String(open));
    tab.setAttribute('aria-label', open ? t('drawer.close') : t('drawer.open'));
    layout();
    onActiveChange?.(open);
    if (focus) (open ? sheet.querySelector('[data-action="close-drawer"]') : tab).focus({ preventScroll: true });
  }

  function openWorkspace(page) {
    raise();
    setOpen(false, { focus: false });
    tab.hidden = true;
    workspace.open({ page: typeof page === 'string' ? page : undefined, returnFocus: tab });
  }

  /** What a tool's drawer section may use. */
  function toolUi() {
    return { doc, container, language: language(), openWorkspace: (page) => openWorkspace(page), hide: () => setOpen(false, { focus: false }) };
  }

  function onWorkspaceClose(backToDrawer) {
    tab.hidden = false;
    layout();
    if (backToDrawer) setOpen(true); else tab.focus({ preventScroll: true });
  }

  function onSheetKey(event) {
    if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
  }

  function onTabKey(event) {
    if (event.key === 'Escape' && state.open) { event.preventDefault(); setOpen(false); }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(!state.open); }
  }

  // ── Dragging the edge button ────────────────────────────────────────
  function onPointerDown(event) {
    if (event.button !== 0) return;
    try { tab.setPointerCapture?.(event.pointerId); } catch { /* pointer already released; listeners below still work */ }
    state.drag = { id: event.pointerId, x0: event.clientX, y0: event.clientY, moved: false };
    tab.addEventListener('pointermove', onPointerMove);
    tab.addEventListener('pointerup', onPointerUp);
    tab.addEventListener('pointercancel', cancelDrag);
    doc.addEventListener('keydown', onDragKey, true);
  }

  function onPointerMove(event) {
    const d = state.drag;
    if (!d || event.pointerId !== d.id) return;
    if (!d.moved && Math.hypot(event.clientX - d.x0, event.clientY - d.y0) < DRAG_THRESHOLD) return;
    if (!d.moved) { d.moved = true; tab.classList.add('dragging'); showZones(); }
    const snap = snapToEdge({ x: event.clientX, y: event.clientY }, viewport());
    d.snap = snap;
    Object.assign(tab.style, { left: `${event.clientX - 23}px`, top: `${event.clientY - 32}px`, width: '46px', height: '64px' });
    for (const zone of zones.querySelectorAll('.zone')) zone.toggleAttribute('data-on', zone.dataset.edge === snap.edge);
    const chip = zones.querySelector('.chip');
    chip.textContent = t('drag.hint', { edge: t(`edge.${snap.edge}`), side: t(`side.${snap.side}`) });
    Object.assign(chip.style, { left: `${Math.min(event.clientX + 34, scope.innerWidth - 260)}px`, top: `${event.clientY - 2}px` });
  }

  async function onPointerUp(event) {
    const d = state.drag;
    endDrag();
    if (!d || event.pointerId !== d.id) return;
    if (!d.moved) { setOpen(!state.open); return; }
    if (d.snap) await settings.update({ drawer: { edge: d.snap.edge, offset: d.snap.offset } });
    layout();
  }

  function onDragKey(event) {
    if (event.key === 'Escape' && state.drag?.moved) { event.preventDefault(); event.stopPropagation(); cancelDrag(); }
  }

  function cancelDrag() { endDrag(); layout(); }

  function endDrag() {
    tab.removeEventListener('pointermove', onPointerMove);
    tab.removeEventListener('pointerup', onPointerUp);
    tab.removeEventListener('pointercancel', cancelDrag);
    doc.removeEventListener('keydown', onDragKey, true);
    tab.classList.remove('dragging');
    zones?.remove();
    zones = null;
    state.drag = null;
  }

  function showZones() {
    zones = h(doc, 'div', { class: 'zones', 'aria-hidden': 'true' },
      ['left', 'right', 'top', 'bottom'].map((edge) => h(doc, 'div', { class: 'zone', 'data-edge': edge })),
      h(doc, 'div', { class: 'chip' }),
      h(doc, 'div', { class: 'help', text: t('drag.help') }));
    container.insertBefore(zones, tab);
  }

  return {
    mount,
    unmount,
    refresh: () => { if (state.mounted) { render(); workspace?.refresh(); } },
    open: () => setOpen(true),
    openWorkspace: () => openWorkspace(),
    close: () => setOpen(false),
    get isOpen() { return state.open; },
  };
}
