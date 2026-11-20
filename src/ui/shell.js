// Drawer shell: the edge button and the drawer on Etsy seller pages.
//
// Everything renders inside a closed shadow root, so Etsy's page scripts can
// neither read the drawer nor restyle it, and our styles never leak into
// Etsy. Position, edge and open-on-load come from shared settings.
//
// Markup follows the design canvas artboards Main, Drawer-Idle, Drawer-Error,
// Drawer-Session, Launcher-Closed and Launcher-Drag class for class.

import { h, icon } from './dom.js';
import { ICONS } from './icons.js';
import { TOOL_HOME } from './strings.js';
import { SUITE_CSS } from './suite-css.js';
import { SHELL_CSS } from './styles.js';
import { WORKSPACE_CSS } from './styles-workspace.js';
import { createText } from './text.js';
import { createLanguagePacks } from '../core/language-packs.js';
import { openFeedback } from './feedback.js';
import { createWorkspace } from './workspace.js';
import { openOnboarding } from './onboarding.js';
import { maybeShowWhatsNew } from './whats-new.js';
import { createToasts } from './toasts.js';
import { tabRect, snapToEdge, drawerSide, drawerWidth, TAB_SHORT, TAB_LONG } from '../core/drawer-geometry.js';
import { TOOL_IDS } from '../core/settings.js';
import { actionForEvent } from '../core/shortcuts.js';

const DRAG_THRESHOLD = 5;
const HOST_ID = 'makaytron-eat-root';
const EDGE_CLASS = { right: 'r', left: 'l', top: 't', bottom: 'b' };

export function createShell({ scope, settings, host, storage, appVersion, migration, assets = {}, notices = null, updates = null, reports = null, onActiveChange }) {
  const doc = scope.document;
  const state = { open: false, drag: null, mounted: false };
  let root; let container; let tab; let sheet; let zones; let tip; let titleId; let workspace; let hostEl;
  let unsubscribe = [];

  // Language packs download on demand; a change re-renders whatever is open.
  let text = null;
  const packs = createLanguagePacks({ gm: scope.GM, cache: storage.namespace('core'), appVersion, onChange: () => text?.packChanged() });
  text = createText({ settings, scope, packs });
  // "Report a problem" anywhere in the interface opens the same dialog.
  text.report = (options = {}) => openFeedback({ doc, container, text, scope, appVersion, host, reports, ...options });
  const { t, language } = text;
  const viewport = () => ({ width: scope.innerWidth, height: scope.innerHeight });
  const theme = () => {
    const pref = settings.get().theme;
    if (pref === 'light' || pref === 'dark') return pref;
    return scope.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  function mount() {
    if (state.mounted) return;
    // Fonts must be declared in the document: @font-face inside a shadow root is ignored by browsers.
    if (assets.fonts && !doc.getElementById(`${HOST_ID}-fonts`)) (doc.head ?? doc.documentElement).append(h(doc, 'style', { id: `${HOST_ID}-fonts`, text: assets.fonts }));
    hostEl = h(doc, 'div', { id: HOST_ID });
    root = hostEl.attachShadow({ mode: 'closed' });
    const style = h(doc, 'style', { text: `${assets.mkuiTokens ?? ''}\n${SUITE_CSS}\n${SHELL_CSS}\n${WORKSPACE_CSS}` });
    container = h(doc, 'div', { class: 'mkui-root' });
    if (assets.logo) container.style.setProperty('--mk-logo', `url("${assets.logo}")`);
    root.append(style, container);
    doc.documentElement.append(hostEl);
    titleId = 'eat-sheet-title';
    tab = h(doc, 'button', {
      class: 'etab r', type: 'button', 'aria-haspopup': 'dialog', 'aria-controls': 'eat-sheet', 'aria-expanded': 'false',
      onpointerdown: onPointerDown, onkeydown: onTabKey,
      onpointerenter: () => showTip(true), onpointerleave: () => showTip(false), onfocus: () => showTip(true), onblur: () => showTip(false),
    },
    h(doc, 'span', { class: 'st', 'data-role': 'tab-count', hidden: true }),
    assets.logo ? h(doc, 'img', { src: assets.logo, alt: '' }) : null,
    h(doc, 'span', { class: 'grip', 'aria-hidden': 'true' }));
    container.append(tab);
    workspace = createWorkspace({ scope, container, text, settings, storage, host, appVersion, migration, notices, updates, reports, assets, onClose: onWorkspaceClose });
    scope.addEventListener('resize', layout);
    doc.addEventListener('keydown', onShortcut, true);
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
    unsubscribe.push(createToasts({ doc, container, text, notices }));
    void maybeShowWhatsNew({ doc, container, text, settings, store: storage.namespace('core'), appVersion, onAllNotes: () => openWorkspace('settings') }).catch(() => {});
    if (!settings.get().onboarded) {
      openOnboarding({ doc, container, text, settings, scope, assets, onDone: () => tab.focus({ preventScroll: true }) });
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
    doc.removeEventListener('keydown', onShortcut, true);
    if (workspace?.isOpen) workspace.close();
    doc.getElementById(HOST_ID)?.remove();
    state.mounted = false;
    state.open = false;
  }

  function applyChrome() {
    const lang = language();
    void text.ensurePack();
    const dark = theme() === 'dark';
    container.setAttribute('data-theme', dark ? 'dark' : 'light');
    container.classList.toggle('theme-dark', dark);
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

  function activeTool() {
    const s = settings.get();
    const enabled = TOOL_IDS.filter((id) => s.tools[id] !== false);
    // A turned-off tool stays out of the drawer, even on its own page.
    return { enabled, active: enabled.includes(host.activeTool) ? host.activeTool : null };
  }

  // ── Drawer content (Main / Drawer-Idle) ─────────────────────────────
  function render() {
    sheet?.remove();
    const s = settings.get();
    const { enabled, active } = activeTool();
    const toolLink = (id) => h(doc, 'a', { class: 'tl', href: TOOL_HOME[id], 'data-tool': id, 'aria-current': id === active ? 'page' : null },
      icon(doc, ICONS[id]),
      h(doc, 'span', { class: 'col grow' },
        h(doc, 'span', { class: 'sm b', 'data-role': 'tool-name', text: t(`tool.${id}`) }),
        h(doc, 'span', { class: 'xxs mute', text: t(`where.${id}`) })),
      host.module?.(id)?.drawerCount?.() ? h(doc, 'span', { class: 'cnt', text: String(host.module(id).drawerCount()) }) : null);

    const toolView = active ? host.module?.(active)?.renderDrawer?.(toolUi()) : null;
    const now = active
      ? h(doc, 'div', { class: 'dock-now', 'aria-labelledby': 'eat-current' },
        toolView ?? h(doc, 'div', { class: 'row' }, icon(doc, ICONS[active]), h(doc, 'span', { class: 'h3 grow', id: 'eat-current', text: t(`tool.${active}`) })),
        toolView ? null : h(doc, 'p', { class: 'xs mute2', 'data-role': 'tool-status', text: statusText(active) }),
        // While the tool's engine starts, its section shows the canvas's loading skeleton (Loaders).
        !toolView && host.module?.(active)?.migrated && host.module(active).status?.() === 'starting'
          ? h(doc, 'div', { class: 'ld-box', 'aria-hidden': 'true', 'data-role': 'tool-loading' },
            [0, 1].map(() => h(doc, 'div', { class: 'row', style: 'gap: 12px;' }, h(doc, 'span', { class: 'shim', style: 'width: 40px; height: 40px; flex: none;' }),
              h(doc, 'span', { class: 'col grow', style: 'gap: 8px;' }, h(doc, 'span', { class: 'shim', style: 'height: 10px; width: 80%;' }), h(doc, 'span', { class: 'shim', style: 'height: 10px; width: 50%;' })))))
          : null)
      : h(doc, 'div', { class: 'dock-idle', 'data-role': 'drawer-idle' },
        h(doc, 'span', { class: 'well-lg' }, icon(doc, ICONS.compass, 20)),
        h(doc, 'span', { class: 'h3', 'data-role': 'no-tool', text: t('drawer.noTool') }),
        h(doc, 'span', { class: 'xs mute', text: t('drawer.noToolHint') }));

    const others = enabled.filter((id) => id !== active);
    const tools = h(doc, 'div', { class: 'dock-tools', role: 'navigation', 'aria-labelledby': 'eat-tools' },
      h(doc, 'span', { class: 'ov', id: 'eat-tools', text: active ? t('drawer.otherTools') : t('drawer.tools') }),
      others.map(toolLink));

    const footer = s.showProSuggestions
      ? h(doc, 'div', { class: 'dock-foot' },
        h(doc, 'span', { class: 'xs mute2 grow' }, `${t('drawer.pro')} `, h(doc, 'a', { class: 'b', href: 'https://makaytron.com', target: '_blank', rel: 'noopener noreferrer', text: `${t('drawer.proLink')} →` })),
        h(doc, 'button', { class: 'ib', type: 'button', 'aria-label': t('drawer.hidePro'), onclick: () => settings.update({ showProSuggestions: false }) }, icon(doc, ICONS.close, 14)))
      : null;

    const routeLabel = active ? pageLabel(active) : t('page.unsupported');
    const side = drawerSide(s.drawer.edge);
    sheet = h(doc, 'div', { class: `dock notab${side === 'left' ? ' left' : ''}`, id: 'eat-sheet', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': titleId, hidden: !state.open, onkeydown: onSheetKey },
      h(doc, 'div', { class: 'dock-h' },
        h(doc, 'div', { class: 'grow', style: 'min-width: 0;' },
          h(doc, 'a', { class: 'dock-brand', href: 'https://makaytron.com', target: '_blank', rel: 'noopener noreferrer', 'aria-label': t('drawer.brandLink') },
            assets.logo ? h(doc, 'img', { src: assets.logo, alt: '' }) : null,
            h(doc, 'span', {}, h(doc, 'b', { id: titleId, text: 'Makaytron.com' }), h(doc, 'small', { 'data-role': 'drawer-context', text: `Etsy Automation Tools · ${routeLabel}` })))),
        h(doc, 'button', { class: 'ib', type: 'button', 'aria-label': t('ws.open'), 'data-action': 'open-workspace', onclick: openWorkspace }, icon(doc, ICONS.expand)),
        h(doc, 'button', { class: 'ib', type: 'button', 'aria-label': t('drawer.close'), 'data-action': 'close-drawer', onclick: () => setOpen(false) }, icon(doc, ICONS.close))),
      now, tools, footer);
    container.append(sheet);
    updateTab();
    layout();
  }

  /** The Etsy page a tool works on, as the drawer header names it (Main: "Sales & Discounts"). */
  function pageLabel(id) {
    return t(`page.${id}`);
  }

  // ── Edge button status (Launcher-Closed) ────────────────────────────
  function launcherStatus() {
    const { active } = activeTool();
    return active ? host.module?.(active)?.launcherStatus?.() ?? null : null;
  }

  function updateTab() {
    const status = launcherStatus();
    const count = tab.querySelector('.st');
    count.hidden = !status?.count;
    count.textContent = status?.count ? String(status.count) : '';
  }

  function showTip(show) {
    tip?.remove();
    tip = null;
    if (!show || state.open || state.drag?.moved) return;
    const status = launcherStatus();
    const r = tab.getBoundingClientRect();
    tip = h(doc, 'div', { class: 'etab-tip', role: 'tooltip' },
      h(doc, 'span', { class: 'xs b', text: 'Makaytron.com · Etsy Automation Tools' }),
      h(doc, 'span', { class: 'xxs', text: [status?.text, t('tab.tip')].filter(Boolean).join(' ') }));
    const edge = settings.get().drawer.edge;
    const top = edge === 'bottom' ? r.top - 76 : edge === 'top' ? r.bottom + 8 : r.top - 8;
    const left = edge === 'right' ? r.left - 242 : edge === 'left' ? r.right + 12 : Math.min(r.left, scope.innerWidth - 242);
    Object.assign(tip.style, { top: `${Math.max(8, top)}px`, left: `${Math.max(8, left)}px` });
    container.append(tip);
  }

  // ── Geometry ────────────────────────────────────────────────────────
  function layout() {
    if (!state.mounted || state.drag) return;
    const { edge, offset } = settings.get().drawer;
    const vp = viewport();
    const width = Math.min(drawerWidth(vp.width), vp.width);
    const rect = tabRect(edge, offset, vp);
    let x = rect.x;
    if (state.open && edge === 'right') x = vp.width - width - TAB_SHORT;
    if (state.open && edge === 'left') x = width;
    Object.assign(tab.style, { left: `${x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    tab.className = `etab ${EDGE_CLASS[edge]}${state.open ? ((edge === 'left' || edge === 'right') ? ' att' : ' on') : ''}`;
    tab.setAttribute('data-edge', edge);
    sheet.setAttribute('data-side', drawerSide(edge));
    sheet.style.setProperty('width', `${width}px`, 'important');
  }

  // Engines adopted from standalone scripts draw their own panels at the top layer too; whatever opens last stays on top.
  function raise() {
    if (hostEl && hostEl.nextElementSibling) doc.documentElement.append(hostEl);
  }

  function setOpen(open, { focus = true } = {}) {
    if (open) raise();
    showTip(false);
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
    return { doc, container, language: language(), openWorkspace: (page) => openWorkspace(page), hide: () => setOpen(false, { focus: false }), report: (options) => text.report(options) };
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

  // ── Keyboard shortcuts (Settings › Shortcuts) ───────────────────────
  function onShortcut(event) {
    // While Settings › Shortcuts records a new binding, the keys belong to the recorder, not to the bindings.
    if (workspace?.capturing) return;
    // Typing in one of our own fields: the closed shadow root shows only its host to the document, so ask the root.
    const focused = event.composedPath?.()[0] === hostEl ? root.activeElement : null;
    const action = actionForEvent(event, settings.get().shortcuts, { focused });
    if (!action) return;
    if (action === 'drawer') { event.preventDefault(); if (workspace?.isOpen) workspace.close(); setOpen(!state.open); return; }
    if (action === 'workspace') { event.preventDefault(); if (workspace?.isOpen) workspace.close(); else openWorkspace(); return; }
    // Tool actions go to the tool running on this page, if it handles them.
    const { active } = activeTool();
    if (active && host.module?.(active)?.shortcut?.(action) === true) event.preventDefault();
  }

  // ── Dragging the edge button (Launcher-Drag) ────────────────────────
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
    if (!d.moved) { d.moved = true; showTip(false); showZones(); tab.className = 'etab dragging'; }
    const snap = snapToEdge({ x: event.clientX, y: event.clientY }, viewport());
    d.snap = snap;
    Object.assign(tab.style, { left: `${event.clientX - TAB_SHORT / 2}px`, top: `${event.clientY - TAB_LONG / 2}px`, width: `${TAB_SHORT}px`, height: `${TAB_LONG}px` });
    for (const zone of zones.querySelectorAll('.zone')) zone.toggleAttribute('data-on', zone.dataset.edge === snap.edge);
    // drag.hint is "Drop: {edge} edge · the drawer opens from the {side}": the canvas shows it as two lines.
    const [first, second = ''] = t('drag.hint', { edge: t(`edge.${snap.edge}`), side: t(`side.${snap.side}`) }).split(' · ');
    const chip = zones.querySelector('.drop-chip');
    chip.firstChild.textContent = first;
    chip.lastChild.textContent = second ? second[0].toLocaleUpperCase(language()) + second.slice(1) : '';
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
    zones?.remove();
    zones = null;
    state.drag = null;
  }

  function showZones() {
    // The button's old place stays as a faded copy while it is dragged (Launcher-Drag).
    const ghost = tab.cloneNode(true);
    ghost.className = `${tab.className} ghost`;
    ghost.removeAttribute('id');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.tabIndex = -1;
    zones = h(doc, 'div', { class: 'zones', 'aria-hidden': 'true' },
      ['left', 'right', 'top', 'bottom'].map((edge) => h(doc, 'div', { class: 'zone', 'data-edge': edge })),
      ghost,
      h(doc, 'div', { class: 'drop-chip' }, h(doc, 'span', { class: 'xs b' }), h(doc, 'span', { class: 'xxs' })),
      h(doc, 'div', { class: 'drop-help xs mute2', text: t('drag.help') }));
    container.insertBefore(zones, tab);
  }

  return {
    t,
    mount,
    unmount,
    refresh: () => { if (state.mounted) { render(); workspace?.refresh(); } },
    open: () => setOpen(true),
    openWorkspace: () => openWorkspace(),
    close: () => setOpen(false),
    get isOpen() { return state.open; },
  };
}
