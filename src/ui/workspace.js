// Full-window workspace: sidebar navigation, header and pages.

import { h, icon } from './dom.js';
import { ICONS } from './icons.js';
import { TOOL_HOME } from './strings.js';
import { renderSettingsPage } from './settings-page.js';
import { TOOL_IDS } from '../core/settings.js';

const SUPPORT_URL = 'https://github.com/Makaytron/Etsy-Automation-Tools/issues';

export function createWorkspace({ scope, container, text, settings, storage, host, appVersion, migration, assets = {}, onClose }) {
  const doc = scope.document;
  const { t } = text;
  const state = { open: false, page: 'settings', tab: 'general', toolTab: {}, returnFocus: null, message: '', migration: { running: false, results: null, done: [] } };

  async function runMigration() {
    if (!migration || state.migration.running) return;
    state.migration = { ...state.migration, running: true, results: null };
    render();
    try {
      const results = await migration.run();
      state.migration = { running: false, results, done: await migration.done() };
    } catch {
      state.migration = { running: false, results: [], done: state.migration.done };
    }
    render();
  }
  let root = null;

  function focusKey(el) {
    if (!el || !root?.contains(el)) return null;
    return el.dataset?.page ?? (el.dataset?.value ? `${el.dataset.name}=${el.dataset.value}` : el.getAttribute('name') ?? el.dataset?.action ?? null);
  }
  function restoreFocus(key) {
    if (!key) return;
    const [name, value] = key.split('=');
    const el = value !== undefined
      ? root.querySelector(`[data-name="${name}"][data-value="${value}"]`)
      : root.querySelector(`[data-page="${key}"], [name="${key}"], [data-action="${key}"]`);
    el?.focus({ preventScroll: true });
  }

  function menuButton(page, label, iconPaths) {
    return h(doc, 'li', {}, h(doc, 'button', {
      class: 'ws-menu-button', type: 'button', 'data-page': page, 'aria-current': state.page === page ? 'page' : null,
      title: label, onclick: () => go(page),
    }, icon(doc, iconPaths), h(doc, 'span', { text: label })));
  }

  function toolPage(id) {
    const custom = host.module?.(id)?.renderPage?.({
      doc, container, language: text.language(), tab: state.toolTab[id] ?? 'overview',
      onTab: (tab) => { state.toolTab[id] = tab; state.message = ''; render(); },
      message: state.message, say: (message) => { state.message = message; render(); },
      openWorkspace: (page) => go(page), hide: () => close(false),
    });
    if (custom) return custom;
    return h(doc, 'div', { style: 'display:contents' },
      h(doc, 'div', { class: 'page-head' },
        h(doc, 'h1', { class: 'page-title', text: t(`tool.${id}`) })),
      h(doc, 'section', { class: 'card' },
        h(doc, 'div', { class: 'card-header' },
          h(doc, 'h2', { class: 'card-title', text: t('tool.notMigratedTitle', { tool: t(`tool.${id}`) }) }),
          h(doc, 'p', { class: 'card-description', text: t('tool.notMigratedText', { where: t(`where.${id}`) }) })),
        h(doc, 'div', { class: 'card-content' },
          h(doc, 'div', {}, h(doc, 'a', { class: 'btn btn-default btn-sm', href: TOOL_HOME[id], text: t('tool.goToPage') })))));
  }

  function render() {
    if (!state.open) return;
    const keep = focusKey(root?.getRootNode?.().activeElement);
    root?.remove();
    const s = settings.get();
    const active = host.activeTool;
    const enabled = TOOL_IDS.filter((id) => s.tools[id] !== false);
    if (state.page.startsWith('tool:') && !enabled.includes(state.page.slice(5))) state.page = 'settings';

    const page = state.page === 'settings'
      ? renderSettingsPage(doc, {
        t, language: text.language(), settings, storage, appVersion, scope, container,
        tab: state.tab, onTab: (tab) => { state.tab = tab; state.message = ''; render(); },
        message: state.message, say: (message) => { state.message = message; render(); },
        migration, migrationState: state.migration, runMigration,
      })
      : toolPage(state.page.slice(5));

    root = h(doc, 'div', { class: 'ws', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('ws.label'), id: 'eat-workspace', onkeydown: onKey },
      h(doc, 'nav', { class: 'ws-sidebar', 'aria-label': t('ws.nav') },
        h(doc, 'a', { class: 'ws-brand', href: 'https://makaytron.com', target: '_blank', rel: 'noopener noreferrer', 'aria-label': t('drawer.brandLink') },
          h(doc, 'span', { class: 'ws-logo' }, assets.logo ? h(doc, 'img', { src: assets.logo, alt: '' }) : null),
          h(doc, 'span', { class: 'ws-brand-text' }, h(doc, 'b', { text: 'Makaytron.com' }), h(doc, 'small', { text: 'Etsy Automation Tools' }))),
        h(doc, 'div', { class: 'ws-group' },
          h(doc, 'div', { class: 'ws-group-label', text: t('ws.navTools') }),
          h(doc, 'ul', { class: 'ws-menu' }, enabled.map((id) => menuButton(`tool:${id}`, t(`tool.${id}`), ICONS[id])))),
        h(doc, 'div', { class: 'ws-group' },
          h(doc, 'div', { class: 'ws-group-label', text: t('ws.navMakaytron') }),
          h(doc, 'ul', { class: 'ws-menu' },
            h(doc, 'li', {}, h(doc, 'a', { class: 'ws-menu-button', href: 'https://makaytron.com', target: '_blank', rel: 'noopener noreferrer', title: t('ws.pro') }, icon(doc, ICONS.compass), h(doc, 'span', { text: t('ws.pro') }))),
            menuButton('settings', t('ws.settings'), ICONS.settings))),
        h(doc, 'div', { class: 'ws-sidebar-footer' },
          h(doc, 'a', { href: 'https://makaytron.com', target: '_blank', rel: 'noopener noreferrer', text: 'makaytron.com' }),
          h(doc, 'span', { 'aria-hidden': 'true', text: '·' }),
          h(doc, 'a', { href: SUPPORT_URL, target: '_blank', rel: 'noopener noreferrer', text: t('ws.report') }))),
      h(doc, 'div', { class: 'ws-inset' },
        h(doc, 'header', { class: 'ws-header' },
          h(doc, 'span', { class: 'ws-context', text: t('ws.thisPage', { page: active ? t(`tool.${active}`) : t('page.unsupported') }) }),
          h(doc, 'span', { class: 'ws-spacer' }),
          h(doc, 'button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-action': 'back-to-drawer', onclick: () => close(true), text: t('ws.backToDrawer') }),
          h(doc, 'button', { class: 'btn btn-ghost btn-icon close', type: 'button', 'aria-label': t('ws.close'), 'data-action': 'close-workspace', onclick: () => close(false) }, icon(doc, ICONS.close))),
        h(doc, 'main', { class: 'ws-main' }, page)));
    container.append(root);
    if (keep) restoreFocus(keep);
  }

  function onKey(event) {
    if (event.key === 'Escape' && !container.querySelector('.overlay')) { event.stopPropagation(); close(true); }
  }

  function go(page) {
    state.page = page;
    state.message = '';
    render();
    restoreFocus(page);
  }

  function open({ page, tab, returnFocus } = {}) {
    const active = host.activeTool;
    state.page = page ?? (active ? `tool:${active}` : 'settings');
    if (tab) state.tab = tab;
    state.returnFocus = returnFocus ?? null;
    state.open = true;
    render();
    root.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
    migration?.done().then((done) => { state.migration = { ...state.migration, done }; render(); }).catch(() => {});
  }

  function close(backToDrawer) {
    state.open = false;
    root?.remove();
    root = null;
    onClose?.(backToDrawer);
  }

  const unsubscribe = settings.subscribe(() => render());

  return { open, close: () => close(false), refresh: render, dispose: unsubscribe, get isOpen() { return state.open; } };
}
