// Full-window workspace: header, sidebar navigation and pages.
//
// Markup follows the design canvas artboards SuiteHeader, SuiteNav and the
// page artboards (Sale-Overview, Settings, Pro…) class for class.

import { h, icon } from './dom.js';
import { ICONS } from './icons.js';
import { TOOL_HOME } from './strings.js';
import { renderSettingsPage } from './settings-page.js';
import { renderProPage } from './pro-page.js';
import { toggleNotifications } from './notifications.js';
import { TOOL_IDS } from '../core/settings.js';
import { languageName } from './text.js';
import { comboFromEvent, RESERVED } from '../core/shortcuts.js';

export function createWorkspace({ scope, container, text, settings, storage, host, appVersion, migration, notices, updates, reports, assets = {}, onClose }) {
  const doc = scope.document;
  const { t } = text;
  const state = { open: false, page: 'settings', tab: 'general', toolTab: {}, returnFocus: null, message: '', migration: { running: false, results: null, done: [] }, usage: null, pendingLanguage: null, capturing: null };

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

  /** SuiteNav row. `here` adds "Runs on this page"; `count` a counter. */
  function navItem(page, label, iconPaths, { here = false, count = 0 } = {}) {
    return h(doc, 'button', {
      class: state.page === page ? 'nv on' : 'nv', type: 'button', 'data-page': page, 'aria-current': state.page === page ? 'page' : null,
      title: label, onclick: () => go(page),
    }, icon(doc, iconPaths),
    here
      ? h(doc, 'span', { class: 'col grow', style: 'min-width: 0;' },
        h(doc, 'span', { class: 'trunc', text: label }),
        h(doc, 'span', { class: 'row xxs here' }, h(doc, 'span', { class: 'dot' }), t('ws.runsHere')))
      : h(doc, 'span', { class: 'grow trunc', text: label }),
    count ? h(doc, 'span', { class: 'cnt', text: String(count) }) : null);
  }

  function toolPage(id) {
    const custom = host.module?.(id)?.renderPage?.({
      doc, container, language: text.language(), tab: state.toolTab[id] ?? 'overview',
      onTab: (tab) => { state.toolTab[id] = tab; state.message = ''; render(); },
      message: state.message, say: (message) => { state.message = message; render(); },
      openWorkspace: (page) => go(page), hide: () => close(false), report: (options) => text.report?.(options),
      openSettings: (tab) => { state.tab = tab; go('settings'); },
      notify: (item) => notices?.add(item),
    });
    if (custom) return custom;
    const module = host.module?.(id);
    const tool = t(`tool.${id}`);
    const head = h(doc, 'div', { class: 'ph' }, h(doc, 'div', { class: 'col grow' }, h(doc, 'span', { class: 'ov', text: 'Etsy Automation Tools' }), h(doc, 'h1', { class: 'h1', text: tool })));
    if (module?.migrated) {
      // The tool is here but has no screen right now: its standalone script runs on this page, or this is not its page.
      const standalone = module.status?.() === 'standalone';
      return [head, h(doc, 'div', { class: 'empty', 'data-role': standalone ? 'tool-standalone' : 'tool-elsewhere' },
        h(doc, 'span', { class: 'ei' }, icon(doc, ICONS[id], 24)),
        h(doc, 'p', { class: 'et', text: tool }),
        h(doc, 'p', { class: 'ed', text: standalone ? t('drawer.standaloneActive', { tool }) : t('tool.openOnPage', { tool }) }),
        standalone ? null : h(doc, 'div', { class: 'ea' }, h(doc, 'a', { class: 'btn btn-p', href: TOOL_HOME[id], text: t('tool.goToPage') })))];
    }
    return [head, h(doc, 'div', { class: 'empty' },
      h(doc, 'span', { class: 'ei' }, icon(doc, ICONS[id], 24)),
      h(doc, 'p', { class: 'et', text: t('tool.notMigratedTitle', { tool }) }),
      h(doc, 'p', { class: 'ed', text: t('tool.notMigratedText', { where: t(`where.${id}`) }) }),
      h(doc, 'div', { class: 'ea' }, h(doc, 'a', { class: 'btn btn-p', href: TOOL_HOME[id], text: t('tool.goToPage') })))];
  }

  function etsySession() {
    // Seller pages need a signed-in Etsy account; Etsy sends signed-out visitors to its sign-in page.
    const path = scope.location?.pathname ?? '';
    if (/\/signin|\/join/.test(path)) return 'closed';
    return /^\/(your|messages)\b/.test(path) ? 'open' : null;
  }

  function header(active) {
    const unread = notices?.unread() ?? 0;
    const session = etsySession();
    return h(doc, 'header', { class: 'win-h' },
      h(doc, 'a', { class: 'win-brand', href: 'https://makaytron.com', target: '_blank', rel: 'noopener noreferrer', 'aria-label': t('drawer.brandLink') },
        assets.logo ? h(doc, 'img', { src: assets.logo, alt: '' }) : null,
        h(doc, 'span', {}, h(doc, 'b', { text: 'Makaytron.com' }), h(doc, 'small', { text: 'Etsy Automation Tools' }))),
      h(doc, 'span', { class: 'badge out mono', 'data-role': 'app-version', text: `v${appVersion}` }),
      h(doc, 'span', { class: 'win-vsep', 'aria-hidden': 'true' }),
      h(doc, 'span', { class: 'row xs mute2', 'data-role': 'ws-context' }, h(doc, 'span', { class: 'dot' }), t('ws.thisPage', { page: active ? t(`page.${active}`) : t('page.unsupported') })),
      h(doc, 'span', { class: 'grow' }),
      session ? h(doc, 'span', { class: `badge${session === 'closed' ? ' warn' : ''}`, 'data-role': 'etsy-session' }, h(doc, 'span', { class: 'dot' }), t(session === 'open' ? 'ws.sessionOpen' : 'ws.sessionClosed')) : null,
      h(doc, 'button', {
        class: 'ib o win-bell', type: 'button', 'data-action': 'open-notifications', 'aria-haspopup': 'dialog',
        'aria-label': unread ? t('nt.bellUnread', { count: unread }) : t('nt.bell'),
        onclick: (e) => toggleNotifications({ doc, root, anchor: e.currentTarget, text, notices, onSettings: () => { state.page = 'settings'; state.tab = 'notifications'; render(); }, onChange: render }),
      }, icon(doc, ICONS.bell), unread ? h(doc, 'span', { class: 'cnt', text: String(unread) }) : null),
      h(doc, 'button', { class: 'btn btn-o btn-sm', type: 'button', 'data-action': 'open-language', 'aria-label': t('ws.languageButton', { language: languageName(text.language()) }), onclick: () => { state.page = 'settings'; state.tab = 'general'; render(); root.querySelector('[name="language"]')?.focus({ preventScroll: true }); } },
        icon(doc, ICONS.globe, 14), languageName(text.language())),
      h(doc, 'button', { class: 'ib o', type: 'button', 'data-action': 'back-to-drawer', 'aria-label': t('ws.backToDrawer'), onclick: () => close(true) }, icon(doc, ICONS.shrink)),
      h(doc, 'button', { class: 'ib o', type: 'button', 'data-action': 'close-workspace', 'aria-label': t('ws.close'), onclick: () => close(false) }, icon(doc, ICONS.close)));
  }

  function nav(enabled, active) {
    const s = settings.get();
    return h(doc, 'nav', { class: 'win-nav', 'aria-label': t('ws.nav') },
      h(doc, 'span', { class: 'ov', text: t('ws.navTools') }),
      enabled.map((id) => navItem(`tool:${id}`, t(`tool.${id}`), ICONS[id], { here: id === active, count: host.module?.(id)?.drawerCount?.() ?? 0 })),
      h(doc, 'span', { class: 'ov g2nd', text: t('ws.navMakaytron') }),
      navItem('pro', t('ws.pro'), ICONS.compass),
      navItem('settings', t('ws.settings'), ICONS.settings),
      h(doc, 'span', { class: 'grow' }),
      s.showProSuggestions
        ? h(doc, 'div', { class: 'nav-pro' },
          h(doc, 'span', { class: 'h3', text: 'Makaytron Pro' }),
          h(doc, 'span', { class: 'xs mute', text: t('ws.proCard') }),
          h(doc, 'a', { class: 'xs b', href: '#', onclick: (e) => { e.preventDefault(); go('pro'); }, text: `${t('ws.proLook')} →` }))
        : null,
      h(doc, 'div', { class: 'row xxs mute nav-foot' },
        h(doc, 'a', { class: 'site', href: 'https://makaytron.com', target: '_blank', rel: 'noopener noreferrer', text: 'makaytron.com' }),
        h(doc, 'span', { 'aria-hidden': 'true', text: '·' }),
        h(doc, 'button', { type: 'button', 'data-action': 'report-problem', onclick: (e) => text.report?.({ returnFocus: e.currentTarget }), text: t('ws.report') })));
  }

  function render() {
    if (!state.open) return;
    const keep = focusKey(root?.getRootNode?.().activeElement);
    root?.remove();
    const s = settings.get();
    const enabled = TOOL_IDS.filter((id) => s.tools[id] !== false);
    const active = enabled.includes(host.activeTool) ? host.activeTool : null;
    if (state.page.startsWith('tool:') && !enabled.includes(state.page.slice(5))) state.page = 'settings';

    let page;
    if (state.page === 'settings') {
      page = renderSettingsPage(doc, {
        t, text, language: text.language(), settings, storage, appVersion, scope, container, host, notices, updates, reports,
        usage: state.usage, pendingLanguage: state.pendingLanguage, setPendingLanguage: (code) => { state.pendingLanguage = code; render(); },
        capturing: state.capturing, capture: startCapture, refresh: render,
        openTool: (id, tab) => { state.toolTab[id] = tab; go(`tool:${id}`); },
        tab: state.tab, onTab: (tab) => { state.tab = tab; state.message = ''; render(); onSettingsTab(tab); },
        message: state.message, say: (message) => { state.message = message; render(); },
        migration, migrationState: state.migration, runMigration,
        onDataDeleted: () => { state.migration = { running: false, results: null, done: [] }; },
      });
    } else if (state.page === 'pro') {
      page = renderProPage(doc, { t, text, settings, onHide: () => go('settings') });
    } else {
      page = toolPage(state.page.slice(5));
    }

    root = h(doc, 'div', { class: 'win', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('ws.label'), id: 'eat-workspace', onkeydown: onKey },
      header(active),
      h(doc, 'div', { class: 'wbody' },
        nav(enabled, active),
        h(doc, 'main', { class: 'main' }, page)));
    container.append(root);
    if (keep) restoreFocus(keep);
  }

  function onKey(event) {
    if (state.capturing) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') { state.capturing = null; render(); return; }
      const combo = comboFromEvent(event);
      if (!combo) return;
      const action = state.capturing;
      const taken = Object.entries(settings.get().shortcuts.keys).find(([a, k]) => a !== action && k === combo);
      state.capturing = null;
      if (taken) { state.message = t('set.keysTaken', { keys: combo, action: t(`key.${taken[0]}`) }); render(); return; }
      state.message = RESERVED.includes(combo) ? t('set.keysReserved', { keys: combo }) : '';
      settings.update({ shortcuts: { keys: { [action]: combo } } });
      return;
    }
    if (event.key === 'Escape' && !container.querySelector('.overlay, .pop[data-role="notifications"]')) { event.stopPropagation(); close(true); }
  }

  function startCapture(action) {
    state.capturing = state.capturing === action ? null : action;
    state.message = '';
    render();
  }

  // Data sizes and the update check are read when the tabs that show them open.
  function onSettingsTab(tab) {
    if (['tools', 'privacy'].includes(tab)) storage.usage?.().then((usage) => { state.usage = usage; render(); }).catch(() => {});
    if (tab === 'updates') updates?.checkIfStale().then(render).catch(() => {});
  }

  function go(page) {
    state.page = page;
    state.message = '';
    render();
    restoreFocus(page);
    if (page === 'settings') onSettingsTab(state.tab);
  }

  function open({ page, tab, returnFocus } = {}) {
    const active = settings.get().tools[host.activeTool] !== false ? host.activeTool : null;
    state.page = page ?? (active ? `tool:${active}` : 'settings');
    if (tab) state.tab = tab;
    state.returnFocus = returnFocus ?? null;
    state.open = true;
    render();
    if (state.page === 'settings') onSettingsTab(state.tab);
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
  const offNotices = notices?.subscribe?.(() => render()) ?? (() => {});

  return { open, close: () => close(false), refresh: render, dispose: () => { unsubscribe(); offNotices(); }, get isOpen() { return state.open; } };
}
