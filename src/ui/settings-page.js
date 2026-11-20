// Settings page of the workspace, tab by tab as in the design canvas:
// Settings (General), Settings-Tools, Settings-AI (+ Settings-Provider),
// Settings-Notify, Settings-Privacy (+ Reset-Confirm), Settings-Keys,
// Settings-Updates and Settings-Help.

import { h, icon } from './dom.js';
import { ICONS } from './icons.js';
import { card, row, segmented, toggle, switchRow, select, labeled, pageTabs, pageHead, banner, alertBox, openDialog } from './controls.js';
import { UI_LANGUAGES } from './strings-workspace.js';
import { languageStatus } from './language-status.js';
import { TOOL_IDS, NOTICE_EVENTS, SHORTCUT_ACTIONS, DEFAULT_SHORTCUTS } from '../core/settings.js';
import { RELEASE_NOTES } from '../core/release-notes.js';
import { RELEASES_PAGE } from '../core/updates.js';
import { formatBytes, formatDate } from './format.js';

const TABS = ['general', 'tools', 'ai', 'notifications', 'privacy', 'shortcuts', 'updates', 'help'];
const NOTICE_TOOLS = {
  seriesDone: ['sale-manager'], seriesStopped: ['sale-manager'], newMessage: ['message-assistant'], autopilotWaiting: ['message-assistant'],
  scanDone: ['ads-keyword-manager', 'listing-analyzer'], queueWaiting: ['listing-analyzer'], newVersion: [],
};
const SHORTCUT_WHERE = { drawer: null, workspace: null, adsClosePage: 'ads-keyword-manager', adsScanAll: 'ads-keyword-manager', laScanAll: 'listing-analyzer', salePause: 'sale-manager', maInsertDraft: 'message-assistant' };
const GUIDE = 'https://github.com/Makaytron/Etsy-Automation-Tools/blob/main/scripts';
const GUIDES = [
  ['start', 'etsy-automation-tools/README.md'], ['sale-manager', 'etsy-sale-campaign-batch-runner/README.md'], ['message-assistant', 'etsy-message-assistant/README.md'],
  ['ads-keyword-manager', 'etsy-ads-keyword-manager/README.md'], ['listing-analyzer', 'etsy-listing-analyzer/README.md'], ['keyword-market-analyzer', 'etsy-keyword-market-analyzer/README.md'],
];
// Storage namespaces behind the groups of the delete dialog (Reset-Confirm).
const DELETE_GROUPS = [
  ['settings', ['core', 'sale-manager', 'message-assistant', 'ads-keyword-manager']],
  ['research', ['keyword-market-analyzer']],
  ['reports', ['listing-analyzer']],
];

export function renderSettingsPage(doc, ctx) {
  const { t, text, language, settings, storage, appVersion, scope, container, host, notices, updates, reports, tab = 'general', onTab, message = '', say, migration, migrationState = {}, runMigration, onDataDeleted, refresh } = ctx;
  const s = settings.get();
  const note = h(doc, 'p', { class: 'xs mute2', role: 'status', 'aria-live': 'polite', 'data-role': 'settings-message', text: message });
  const twoCols = (left, right) => h(doc, 'div', { class: 'cols' }, h(doc, 'div', { class: 'col grow', style: 'gap: 16px;' }, left), h(doc, 'div', { class: 'col side' }, right));
  const upToDate = updates?.state().latest && !updates.available();

  // ── General ─────────────────────────────────────────────────────────
  const general = () => twoCols([
    card(doc, { id: 'eat-appearance', title: t('set.appearance'), list: true },
      row(doc, { label: t('set.theme'), hint: t('set.themeHint'), labelId: 'eat-theme' }, segmented(doc, {
        labelledBy: 'eat-theme', name: 'theme', value: s.theme,
        options: ['light', 'dark', 'system'].map((v) => ({ value: v, label: t(`set.theme.${v}`) })),
        onChange: (theme) => settings.update({ theme }),
      })),
      row(doc, { label: t('set.density'), hint: t('set.densityHint'), labelId: 'eat-density' }, segmented(doc, {
        labelledBy: 'eat-density', name: 'density', value: s.density,
        options: ['comfortable', 'compact'].map((v) => ({ value: v, label: t(`set.density.${v}`) })),
        onChange: (density) => settings.update({ density }),
      }))),
    card(doc, { id: 'eat-drawer', title: t('set.drawer'), description: t('set.drawerHint'), list: true },
      h(doc, 'div', { class: 'li', style: 'align-items: flex-start; gap: 16px;' },
        drawerPreview(doc, s.drawer),
        h(doc, 'span', { class: 'col grow', style: 'gap: 8px;' },
          h(doc, 'span', { class: 'sm b', id: 'eat-edge', text: t('set.edge') }),
          h(doc, 'span', { class: 'xs mute', text: t('set.edgeHint') }),
          segmented(doc, {
            labelledBy: 'eat-edge', name: 'edge', value: s.drawer.edge,
            options: ['right', 'left', 'top', 'bottom'].map((v) => ({ value: v, label: t(`set.edge.${v}`) })),
            onChange: (edge) => settings.update({ drawer: { edge } }),
          }),
          h(doc, 'label', { class: 'row xs mute2', style: 'gap: 8px;' }, t('set.offset'),
            h(doc, 'input', { type: 'range', min: 0, max: 100, value: Math.round(s.drawer.offset * 100), name: 'offset', style: 'accent-color: var(--primary); flex: 1 1 auto;', 'aria-label': t('set.offset'), onchange: (e) => settings.update({ drawer: { offset: Number(e.target.value) / 100 } }) })))),
      switchRow(doc, { name: 'openOnLoad', label: t('set.openOnLoad'), hint: t('set.openOnLoadHint'), checked: s.drawer.openOnLoad, onChange: (openOnLoad) => settings.update({ drawer: { openOnLoad } }) }),
      switchRow(doc, { name: 'keepOpen', label: t('set.keepOpen'), hint: t('set.keepOpenHint'), checked: s.drawer.keepOpenWhileRunning, onChange: (keepOpenWhileRunning) => settings.update({ drawer: { keepOpenWhileRunning } }) })),
  ], [
    languageCard(),
    card(doc, { id: 'eat-format', title: t('set.formatTitle'), bodyClass: 'card-b g2' },
      labeled(doc, { label: t('set.formatDate'), id: 'eat-fmt-date' }, select(doc, { id: 'eat-fmt-date', name: 'format-date', value: s.format.date, options: ['auto', 'd-mmm-y', 'dd.mm.yyyy', 'mm/dd/yyyy', 'yyyy-mm-dd'].map((v) => ({ value: v, label: v === 'auto' ? t('set.formatAuto') : formatDate(Date.UTC(2026, 10, 19, 12), { ...s.format, date: v }, language) })), onChange: (date) => settings.update({ format: { date } }) })),
      labeled(doc, { label: t('set.formatZone'), id: 'eat-fmt-zone' }, select(doc, { id: 'eat-fmt-zone', name: 'format-zone', value: s.format.timezone, options: [{ value: 'browser', label: t('set.zoneBrowser', { offset: utcOffset() }) }, { value: 'UTC', label: 'UTC' }], onChange: (timezone) => settings.update({ format: { timezone } }) })),
      labeled(doc, { label: t('set.formatNumber'), id: 'eat-fmt-number' }, select(doc, { id: 'eat-fmt-number', name: 'format-number', value: s.format.number, options: [{ value: 'auto', label: t('set.formatAuto') }, { value: 'dot', label: '$1.984,50' }, { value: 'comma', label: '$1,984.50' }], onChange: (number) => settings.update({ format: { number } }) })),
      labeled(doc, { label: t('set.formatWeek'), id: 'eat-fmt-week' }, select(doc, { id: 'eat-fmt-week', name: 'format-week', value: s.format.weekStart, options: ['auto', 'monday', 'sunday', 'saturday'].map((v) => ({ value: v, label: v === 'auto' ? t('set.formatAuto') : weekday(v) })), onChange: (weekStart) => settings.update({ format: { weekStart } }) }))),
  ]);

  function utcOffset() {
    const m = -new Date().getTimezoneOffset();
    return `UTC${m >= 0 ? '+' : '−'}${Math.floor(Math.abs(m) / 60)}${Math.abs(m) % 60 ? `:${String(Math.abs(m) % 60).padStart(2, '0')}` : ''}`;
  }
  function weekday(v) {
    const day = { monday: 1, sunday: 0, saturday: 6 }[v];
    return new Intl.DateTimeFormat(language, { weekday: 'long' }).format(new Date(Date.UTC(2026, 10, 15 + day)));
  }

  // The language card downloads the chosen pack first and switches only when it is there (Settings: "Dil").
  function languageCard() {
    const pending = ctx.pendingLanguage && ctx.pendingLanguage !== language ? ctx.pendingLanguage : null;
    const pendingState = pending ? text.languageState(pending) : null;
    const size = text.packSize(language);
    const currentName = UI_LANGUAGES.find((l) => l.code === language)?.name ?? language;
    const pick = select(doc, {
      id: 'eat-language-new', name: 'language', value: pending ?? language,
      options: UI_LANGUAGES.map((l) => ({ value: l.code, label: l.english && l.english !== l.name ? `${l.name} · ${l.english}` : l.name })),
      onChange: (code) => { ctx.setPendingLanguage?.(code === language ? null : code); if (code !== language) void text.ensureLanguage(code).then(() => refresh?.()); },
    });
    const pendingName = pending ? UI_LANGUAGES.find((l) => l.code === pending)?.name ?? pending : '';
    return card(doc, { id: 'eat-language', title: t('set.language'), description: t('set.languageHint'), bodyClass: 'card-b col' },
      h(doc, 'div', { class: 'row sm' },
        h(doc, 'span', { class: 'grow mute2', text: t('set.languageNow') }),
        h(doc, 'span', { class: 'b', text: currentName }),
        size ? h(doc, 'span', { class: 'xs mute', text: `· ${t('set.packSize', { size: formatBytes(size, language) })}` }) : null),
      labeled(doc, { label: t('set.languageNew'), id: 'eat-language-new' }, pick),
      pendingState?.status === 'loading' ? banner(doc, { iconPaths: ICONS.download, title: t('set.packLoading', { language: pendingName }), text: t('set.packLoadingText'), after: null }) : null,
      pendingState?.status === 'error' ? alertBox(doc, { tone: 'warn', title: t('lang.failed') }) : null,
      text ? languageStatus(doc, text) : null,
      pending ? h(doc, 'div', { class: 'row' },
        h(doc, 'span', { class: 'grow' }),
        h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', 'data-action': 'language-cancel', onclick: () => { ctx.setPendingLanguage?.(null); refresh?.(); }, text: t('dlg.cancel') }),
        pendingState?.status === 'error'
          ? h(doc, 'button', { class: 'btn btn-o btn-sm', type: 'button', 'data-action': 'language-retry', onclick: () => { void text.ensureLanguage(pending).then(() => refresh?.()); refresh?.(); }, text: t('lang.retry') })
          : h(doc, 'button', { class: 'btn btn-p btn-sm', type: 'button', 'data-action': 'language-apply', disabled: !['ready', 'bundled'].includes(pendingState?.status), onclick: () => { ctx.setPendingLanguage?.(null); settings.update({ language: pending }); }, text: t('set.languageApply') }))
        : null);
  }

  // ── Tools ───────────────────────────────────────────────────────────
  const tools = () => [
    card(doc, { id: 'eat-tools', title: t('set.toolsTitle'), description: t('set.toolsHint'), bodyClass: 'card-flush' },
      h(doc, 'table', { class: 'tbl' },
        h(doc, 'thead', {}, h(doc, 'tr', {}, h(doc, 'th', { text: t('set.colTool') }), h(doc, 'th', { text: t('set.colState') }), h(doc, 'th', { class: 'r', text: t('set.colData') }), h(doc, 'th', { class: 'r', text: t('set.colMore') }), h(doc, 'th', { class: 'r', text: t('set.colSwitch') }))),
        h(doc, 'tbody', {}, TOOL_IDS.map((id) => {
          const on = s.tools[id] !== false;
          return h(doc, 'tr', { 'data-tool': id },
            h(doc, 'td', {}, h(doc, 'span', { class: 'b', text: t(`tool.${id}`) }), h(doc, 'div', { class: 'xs mute', text: t(`page.${id}`) })),
            h(doc, 'td', {}, h(doc, 'span', { class: on ? 'badge' : 'badge out' }, h(doc, 'span', { class: 'dot' }), t(on ? 'set.on' : 'set.off'))),
            h(doc, 'td', { class: 'r num mute2', 'data-role': 'tool-bytes', text: ctx.usage ? formatBytes(ctx.usage.bytes[id] ?? 0, language) : '…' }),
            h(doc, 'td', { class: 'r' }, h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', disabled: !on, onclick: () => ctx.openTool?.(id, 'settings'), text: t('set.toolSettings') })),
            h(doc, 'td', { class: 'r', style: 'width: 64px;' }, toggle(doc, { name: `tool-${id}`, checked: on, label: t('set.toolSwitch', { tool: t(`tool.${id}`) }), onChange: (next) => settings.update({ tools: { [id]: next } }) })));
        })))),
    card(doc, { id: 'eat-links', title: t('set.linksTitle'), list: true },
      switchRow(doc, { name: 'kwToListing', label: t('set.linkKw'), hint: t('set.linkKwHint'), checked: s.links.kwToListing, onChange: (kwToListing) => settings.update({ links: { kwToListing } }) }),
      switchRow(doc, { name: 'orderInfo', label: t('set.linkOrders'), hint: t('set.linkOrdersHint'), checked: s.links.orderInfoInMessages, onChange: (orderInfoInMessages) => settings.update({ links: { orderInfoInMessages } }) })),
  ];

  // ── AI providers ────────────────────────────────────────────────────
  const ai = () => {
    const engine = host?.module?.('message-assistant')?.aiProviders?.() ?? null;
    if (!engine) {
      return [card(doc, { id: 'eat-ai', title: t('set.aiTitle'), description: t('set.aiHint') },
        alertBox(doc, { tone: 'info', text: t('set.aiElsewhere') }),
        h(doc, 'div', { class: 'row', style: 'margin-top: 12px;' }, h(doc, 'a', { class: 'btn btn-o btn-sm', href: '/messages', text: t('tool.goToPage') })))];
    }
    const list = engine.list();
    const active = engine.active();
    const saved = list.filter((p) => p.hasKey && !p.keyless);
    const translators = list.filter((p) => p.kind === 'translate' && (p.hasKey || p.keyless));
    const writers = list.filter((p) => p.kind === 'text' && p.hasKey);
    return twoCols([
      card(doc, { id: 'eat-ai', title: t('set.aiTitle'), description: t('set.aiHint'), list: true, actions: h(doc, 'button', { class: 'btn btn-o btn-sm', type: 'button', 'data-action': 'ai-add', onclick: (e) => providerDialog(engine, null, e.currentTarget), text: t('set.aiAdd') }) },
        saved.length ? saved.map((p) => h(doc, 'div', { class: 'li li-ai', 'data-provider': p.id },
          h(doc, 'span', { class: 'col grow', style: 'gap: 1px;' }, h(doc, 'span', { class: 'sm b', text: p.name }), h(doc, 'span', { class: 'xs mute', text: [t(p.kind === 'translate' ? 'set.aiTranslate' : 'set.aiText'), t('set.aiKeyHere'), p.model].filter(Boolean).join(' · ') })),
          h(doc, 'span', { class: 'badge ok', text: t('set.aiSaved') }),
          h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', onclick: (e) => providerDialog(engine, p, e.currentTarget), text: t('set.edit') }),
          h(doc, 'button', { class: 'btn btn-g btn-sm err-text', type: 'button', onclick: async () => { await engine.remove(p.id); say(t('set.aiRemoved', { name: p.name })); }, text: t('set.remove') })))
          : h(doc, 'div', { class: 'li' }, h(doc, 'span', { class: 'xs mute', text: t('set.aiNone') }))),
    ], [
      card(doc, { id: 'eat-ai-use', title: t('set.aiUseTitle'), bodyClass: 'card-b col' },
        labeled(doc, { label: t('set.aiUseTranslate'), id: 'eat-ai-translate' }, select(doc, { id: 'eat-ai-translate', name: 'ai-translate', value: active.translator, options: translators.map((p) => ({ value: p.id, label: p.name })), onChange: async (translator) => { await engine.use({ translator }); say(t('set.saved')); } })),
        labeled(doc, { label: t('set.aiUseDrafts'), id: 'eat-ai-drafts' }, select(doc, { id: 'eat-ai-drafts', name: 'ai-drafts', value: active.provider, options: (writers.length ? writers : list.filter((p) => p.kind === 'text')).map((p) => ({ value: p.id, label: p.name })), onChange: async (provider) => { await engine.use({ provider }); say(t('set.saved')); } }))),
    ]);
  };

  function providerDialog(engine, current, trigger) {
    const catalog = engine.list().filter((p) => !p.keyless);
    let choice = current?.id ?? catalog.find((p) => !p.hasKey)?.id ?? catalog[0].id;
    const keyInput = h(doc, 'input', { class: 'input mono', id: 'eat-ai-key', type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: current?.hasKey ? '••••••••' : '' });
    const modelSlot = h(doc, 'div', {});
    const options = h(doc, 'div', { class: 'col', style: 'gap: 8px;', role: 'radiogroup', 'aria-label': t('set.aiProvider') });
    const linkSlot = h(doc, 'span', { class: 'hint' });
    function draw() {
      options.replaceChildren(...catalog.map((p) => h(doc, 'label', { class: choice === p.id ? 'pv on' : 'pv' },
        h(doc, 'input', { type: 'radio', name: 'ai-provider', value: p.id, checked: choice === p.id, disabled: Boolean(current), onchange: () => { choice = p.id; draw(); } }),
        h(doc, 'span', { class: 'grow', text: p.name }),
        h(doc, 'span', { class: 'xs mute', text: t(p.kind === 'translate' ? 'set.aiTranslate' : 'set.aiText') }))));
      const p = catalog.find((x) => x.id === choice);
      modelSlot.replaceChildren(p.models.length ? labeled(doc, { label: t('set.aiModel'), id: 'eat-ai-model' }, select(doc, { id: 'eat-ai-model', name: 'ai-model', value: p.model || p.models[0], options: p.models.map((m) => ({ value: m, label: m })), onChange: () => {} })) : h(doc, 'span', {}));
      linkSlot.replaceChildren(t('set.aiKeyWhere'), ' ', p.apiKeyUrl ? h(doc, 'a', { href: p.apiKeyUrl, target: '_blank', rel: 'noopener noreferrer', text: new URL(p.apiKeyUrl).host }) : '');
    }
    draw();
    const body = h(doc, 'div', { class: 'col', style: 'gap: 14px;' }, options,
      h(doc, 'div', { class: 'field' }, h(doc, 'label', { class: 'label', for: 'eat-ai-key', text: t('set.aiKey') }), keyInput, linkSlot),
      modelSlot,
      h(doc, 'span', { class: 'hint', text: t('set.aiKeyPrivacy') }));
    const { close } = openDialog(doc, container, {
      title: current ? t('set.aiEditTitle', { name: current.name }) : t('set.aiAddTitle'), body, closeLabel: t('dlg.cancel'), returnFocus: trigger, width: 576,
      footer: (done) => [
        h(doc, 'button', { class: 'btn btn-g', type: 'button', onclick: done, text: t('dlg.cancel') }),
        h(doc, 'button', { class: 'btn btn-p', type: 'button', 'data-action': 'ai-save', onclick: async () => {
          const key = keyInput.value.trim();
          const model = body.querySelector('[name="ai-model"]')?.value;
          if (!key && !current?.hasKey) { keyInput.focus(); return; }
          await engine.save(choice, { apiKey: key || undefined, model });
          close();
          say(t('set.saved'));
        }, text: t('set.save') })],
    });
    void close;
  }

  // ── Notifications ───────────────────────────────────────────────────
  const notifications = () => {
    const perm = notices?.permission?.() ?? 'unsupported';
    const tbl = h(doc, 'table', { class: 'tbl' },
      h(doc, 'thead', {}, h(doc, 'tr', {}, h(doc, 'th', { text: t('set.ntEvent') }), h(doc, 'th', { text: t('set.ntPanel') }), h(doc, 'th', { text: t('set.ntDesktop') }))),
      h(doc, 'tbody', {}, NOTICE_EVENTS.map((e) => h(doc, 'tr', { 'data-event': e },
        h(doc, 'td', {}, h(doc, 'span', { class: 'b', text: t(`nt.ev.${e}`) }), h(doc, 'div', { class: 'xs mute', text: NOTICE_TOOLS[e].length ? NOTICE_TOOLS[e].map((id) => t(`tool.${id}`)).join(' · ') : t('set.tab.updates') })),
        h(doc, 'td', {}, toggle(doc, { name: `nt-${e}-panel`, checked: s.notify.events[e].panel, label: t('set.ntPanelLabel', { event: t(`nt.ev.${e}`) }), onChange: (panel) => settings.update({ notify: { events: { [e]: { panel } } } }) })),
        h(doc, 'td', {}, toggle(doc, { name: `nt-${e}-desktop`, checked: s.notify.events[e].desktop, label: t('set.ntDesktopLabel', { event: t(`nt.ev.${e}`) }), onChange: (desktop) => settings.update({ notify: { events: { [e]: { desktop } } } }) }))))));
    return twoCols([
      card(doc, { id: 'eat-nt', title: t('set.ntTitle'), bodyClass: 'card-flush' }, tbl),
    ], [
      card(doc, { id: 'eat-nt-desktop', title: t('set.ntDesktopTitle'), bodyClass: 'card-b col' },
        perm === 'granted' ? alertBox(doc, { tone: 'info', text: t('set.ntGranted') })
          : perm === 'unsupported' ? alertBox(doc, { tone: 'info', text: t('set.ntUnsupported') })
            : alertBox(doc, { tone: 'warn', text: t(perm === 'denied' ? 'set.ntDenied' : 'set.ntAsk') }),
        perm === 'default' ? h(doc, 'div', {}, h(doc, 'button', { class: 'btn btn-o btn-sm', type: 'button', 'data-action': 'nt-permission', onclick: async () => { await notices.requestPermission(); refresh?.(); }, text: t('set.ntRequest') })) : null),
      card(doc, { id: 'eat-nt-quiet', title: t('set.ntQuiet'), description: t('set.ntQuietHint'), bodyClass: 'card-b col' },
        h(doc, 'div', { class: 'row' }, h(doc, 'span', { class: 'sm grow', id: 'eat-quiet-label', text: t('set.ntQuiet') }), toggle(doc, { name: 'quiet', checked: s.notify.quiet.on, labelledBy: 'eat-quiet-label', onChange: (on) => settings.update({ notify: { quiet: { on } } }) })),
        h(doc, 'div', { class: 'g2', style: 'gap: 10px;' },
          labeled(doc, { label: t('set.ntStart'), id: 'eat-quiet-start' }, h(doc, 'input', { class: 'input', id: 'eat-quiet-start', type: 'time', value: s.notify.quiet.start, disabled: !s.notify.quiet.on, onchange: (e) => settings.update({ notify: { quiet: { start: e.target.value } } }) })),
          labeled(doc, { label: t('set.ntEnd'), id: 'eat-quiet-end' }, h(doc, 'input', { class: 'input', id: 'eat-quiet-end', type: 'time', value: s.notify.quiet.end, disabled: !s.notify.quiet.on, onchange: (e) => settings.update({ notify: { quiet: { end: e.target.value } } }) }))),
        h(doc, 'div', { class: 'row' }, h(doc, 'span', { class: 'sm grow', id: 'eat-sound-label', text: t('set.ntSound') }), toggle(doc, { name: 'sound', checked: s.notify.sound, labelledBy: 'eat-sound-label', onChange: (sound) => settings.update({ notify: { sound } }) }))),
    ]);
  };

  // ── Privacy and data ────────────────────────────────────────────────
  async function downloadBackup() {
    const backup = await storage.exportBackup({ appVersion });
    const blob = new scope.Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = scope.URL.createObjectURL(blob);
    const a = h(doc, 'a', { href: url, download: `etsy-automation-tools-backup-${backup.createdAt.slice(0, 10)}.json` });
    container.append(a); a.click(); a.remove();
    scope.setTimeout(() => scope.URL.revokeObjectURL(url), 10000);
  }

  async function restoreBackup(file) {
    try {
      const count = await storage.importBackup(JSON.parse(await file.text()));
      await settings.load();
      await settings.update({});
      say(t('set.backupRestored', { count }));
    } catch {
      say(t('set.backupInvalid'));
    }
  }

  function confirmDelete(trigger) {
    const word = t('dlg.confirmWord');
    const groups = Object.fromEntries(DELETE_GROUPS.map(([g]) => [g, true]));
    let keys = false;
    const typed = h(doc, 'input', { class: 'input', id: 'eat-confirm', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'eat-confirm-hint' });
    const deleteButton = h(doc, 'button', { class: 'btn btn-d', type: 'button', disabled: true, 'data-action': 'confirm-delete' });
    const count = () => Object.values(groups).filter(Boolean).length + (keys ? 1 : 0);
    const sync = () => {
      deleteButton.textContent = t('dlg.deleteGroups', { count: count() });
      deleteButton.disabled = !count() || typed.value.trim().toLocaleUpperCase(language) !== word;
    };
    typed.addEventListener('input', sync);
    const opt = (name, label, hint, checked, onChange, first = false) => h(doc, 'label', { class: 'row del-opt', style: first ? '' : 'border-top: 1px solid var(--line2);' },
      h(doc, 'input', { type: 'checkbox', class: 'chk', name, checked, style: 'margin-top: 2px;', onchange: (e) => { onChange(e.target.checked); sync(); } }),
      h(doc, 'span', { class: 'col grow', style: 'gap: 1px;' }, h(doc, 'span', { class: 'sm b', text: label }), h(doc, 'span', { class: 'xs mute', text: hint })));
    const body = h(doc, 'div', { class: 'col', style: 'gap: 14px;' },
      h(doc, 'div', { class: 'del-box' },
        opt('delete-settings', t('dlg.groupSettings'), t('dlg.groupSettingsHint'), true, (v) => { groups.settings = v; }, true),
        opt('delete-research', t('dlg.groupResearch'), t('tool.keyword-market-analyzer'), true, (v) => { groups.research = v; }),
        opt('delete-reports', t('dlg.groupReports'), t('tool.listing-analyzer'), true, (v) => { groups.reports = v; }),
        opt('delete-keys', t('dlg.deleteKeys'), t('dlg.deleteKeysHint'), false, (v) => { keys = v; })),
      h(doc, 'div', { class: 'field' },
        h(doc, 'label', { class: 'label', for: 'eat-confirm', id: 'eat-confirm-label' }, ...t('dlg.confirmLabel', { word: '\u0000' }).split('\u0000').flatMap((part, i) => (i ? [h(doc, 'b', { class: 'mono', text: word }), part] : [part]))),
        typed,
        h(doc, 'span', { class: 'hint', id: 'eat-confirm-hint', text: t('dlg.deleteBackupHint') })));
    sync();
    const { close } = openDialog(doc, container, {
      title: t('dlg.deleteTitle'), description: t('dlg.deleteText'), body, closeLabel: t('dlg.cancel'), returnFocus: trigger, width: 520,
      footer: (done) => [
        h(doc, 'button', { class: 'btn btn-o btn-sm', type: 'button', 'data-action': 'backup-first', onclick: downloadBackup }, icon(doc, ICONS.download, 14), t('dlg.backupFirst')),
        h(doc, 'span', { class: 'grow' }),
        h(doc, 'button', { class: 'btn btn-g', type: 'button', onclick: done, text: t('dlg.cancel') }), deleteButton],
    });
    deleteButton.addEventListener('click', async () => {
      const namespaces = DELETE_GROUPS.filter(([g]) => groups[g]).flatMap(([, ns]) => ns);
      if (namespaces.length) await storage.clear({ namespaces, includeSecrets: keys });
      else if (keys) await storage.clear({ namespaces: ['__none__'], includeSecrets: true });
      await settings.load();
      await settings.update({});
      onDataDeleted?.(); // transfer records went with the data: the card must not say "transferred before"
      close();
      say(t('dlg.deleted'));
    });
  }

  const fileInput = h(doc, 'input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: (e) => { const f = e.target.files?.[0]; if (f) restoreBackup(f); e.target.value = ''; } });
  const RESULT = { imported: ['mig.imported', 'ok'], already: ['mig.already', ''], busy: ['mig.busy', 'warn'], error: ['mig.error', 'err'], rejected: ['mig.rejected', 'err'] };

  function migrationRow() {
    const { running, results, done = [] } = migrationState;
    const rows = (results ?? []).map((r) => {
      const [label, tone] = RESULT[r.state] ?? RESULT.error;
      return h(doc, 'tr', { 'data-tool': r.tool },
        h(doc, 'td', { class: 'b', text: t(`tool.${r.tool}`) }),
        h(doc, 'td', {}, h(doc, 'span', { class: tone ? `badge ${tone}` : 'badge', text: t(label) })),
        h(doc, 'td', {}, r.sas ? h(doc, 'span', { class: 'mono b', 'data-sas': r.sas, text: r.sas }) : h(doc, 'span', { class: 'mute', text: '—' })));
    });
    return [
      h(doc, 'div', { class: 'li', 'data-role': 'migration' },
        h(doc, 'span', { class: 'col grow', style: 'gap: 1px;' },
          h(doc, 'span', { class: 'sm b', text: t('mig.title') }),
          h(doc, 'span', { class: 'xs mute', text: done.length ? t('mig.done', { tools: done.map((id) => t(`tool.${id}`)).join(', ') }) : t('mig.text') })),
        h(doc, 'button', { class: done.length ? 'btn btn-g btn-sm' : 'btn btn-o btn-sm', type: 'button', 'data-action': 'start-migration', disabled: Boolean(running) || !migration, onclick: () => runMigration?.() },
          running ? h(doc, 'span', { class: 'spin', style: 'width: 14px; height: 14px;' }) : null,
          running ? t('mig.running') : done.length ? t('mig.again') : t('mig.start'))),
      running || results ? h(doc, 'div', { class: 'li col', style: 'align-items: stretch; gap: 10px;' },
        h(doc, 'ol', { class: 'xs mute2', style: 'margin: 0; padding-inline-start: 18px; display: flex; flex-direction: column; gap: 4px;' }, h(doc, 'li', { text: t('mig.step1') }), h(doc, 'li', { text: t('mig.step2') })),
        running ? h(doc, 'p', { class: 'row xs mute2', role: 'status', 'aria-live': 'polite', 'data-role': 'mig-wait' }, h(doc, 'span', { class: 'spin', style: 'width: 12px; height: 12px;', 'aria-hidden': 'true' }), t('mig.wait')) : null,
        results && !results.length ? h(doc, 'p', { class: 'xs mute2', role: 'status', text: t('mig.none') }) : null,
        results?.length ? h(doc, 'div', { class: 'card' }, h(doc, 'table', { class: 'tbl' },
          h(doc, 'thead', {}, h(doc, 'tr', {}, h(doc, 'th', { text: t('mig.colTool') }), h(doc, 'th', { text: t('mig.colResult') }), h(doc, 'th', { text: t('mig.colCode') }))),
          h(doc, 'tbody', {}, rows))) : null,
        results?.some((r) => r.sas) ? h(doc, 'p', { class: 'xs mute', text: t('mig.codeHint') }) : null) : null,
    ];
  }

  const privacy = () => {
    const usage = ctx.usage;
    const max = usage ? Math.max(1, ...TOOL_IDS.map((id) => usage.bytes[id] ?? 0)) : 1;
    return twoCols([
      card(doc, { id: 'eat-backup', title: t('set.backupTitle'), list: true },
        row(doc, { label: t('set.backupDownload'), hint: t('set.backupHint') }, h(doc, 'button', { class: 'btn btn-o btn-sm', type: 'button', 'data-action': 'backup', onclick: downloadBackup }, icon(doc, ICONS.download, 14), t('set.backupButton'))),
        row(doc, { label: t('set.backupRestore'), hint: t('set.restoreHint') }, h(doc, 'button', { class: 'btn btn-o btn-sm', type: 'button', 'data-action': 'restore', onclick: () => fileInput.click() }, icon(doc, ICONS.upload, 14), t('set.chooseFile')), fileInput),
        migrationRow()),
      card(doc, { id: 'eat-privacy', title: t('set.privacyTitle'), list: true },
        switchRow(doc, { name: 'showPro', label: t('set.proToggle'), hint: t('set.proHint'), checked: s.showProSuggestions, onChange: (showProSuggestions) => settings.update({ showProSuggestions }) }),
        h(doc, 'div', { class: 'li' }, h(doc, 'a', { class: 'xs b', href: `https://github.com/Makaytron/Etsy-Automation-Tools/blob/main/${language === 'tr' ? 'PRIVACY.md' : 'PRIVACY.en.md'}`, target: '_blank', rel: 'noopener noreferrer', style: 'text-underline-offset: 3px;', text: t('set.privacyRead') }))),
    ], [
      card(doc, { id: 'eat-usage', title: t('set.dataTitle'), description: usage ? t('set.dataTotal', { size: formatBytes(usage.total, language) }) : t('set.dataHint'), bodyClass: 'card-b col' },
        TOOL_IDS.map((id) => h(doc, 'div', { class: 'col', style: 'gap: 6px;', 'data-tool': id },
          h(doc, 'div', { class: 'row sm' }, h(doc, 'span', { class: 'grow', text: t(`tool.${id}`) }), h(doc, 'span', { class: 'b num', text: usage ? formatBytes(usage.bytes[id] ?? 0, language) : '…' })),
          h(doc, 'div', { class: 'prog' }, h(doc, 'i', { style: `width: ${usage ? Math.max(2, Math.round(((usage.bytes[id] ?? 0) / max) * 100)) : 0}%;` }))))),
      h(doc, 'section', { class: 'danger-card', 'aria-labelledby': 'eat-delete-title' },
        h(doc, 'span', { class: 'col grow', style: 'gap: 2px;' }, h(doc, 'span', { class: 'sm b err-text', id: 'eat-delete-title', text: t('set.deleteAll') }), h(doc, 'span', { class: 'xs mute', text: t('set.deleteAllHint') })),
        h(doc, 'button', { class: 'btn btn-d btn-sm', type: 'button', 'data-action': 'delete-data', onclick: (e) => confirmDelete(e.currentTarget), text: t('set.deleteData') })),
    ]);
  };

  // ── Shortcuts ───────────────────────────────────────────────────────
  const shortcuts = () => card(doc, { id: 'eat-keys', title: t('set.keysTitle'), description: t('set.keysHint'), bodyClass: 'card-flush' },
    h(doc, 'table', { class: 'tbl' },
      h(doc, 'thead', {}, h(doc, 'tr', {}, h(doc, 'th', { text: t('set.keysAction') }), h(doc, 'th', { text: t('set.keysWhere') }), h(doc, 'th', { text: t('set.keysKeys') }), h(doc, 'th', { class: 'r' }))),
      h(doc, 'tbody', {}, SHORTCUT_ACTIONS.map((a) => {
        const capturing = ctx.capturing === a;
        return h(doc, 'tr', { 'data-shortcut': a },
          h(doc, 'td', { class: 'b', text: t(`key.${a}`) }),
          h(doc, 'td', { class: 'mute2', text: SHORTCUT_WHERE[a] ? t(`tool.${SHORTCUT_WHERE[a]}`) : t('set.keysEverywhere') }),
          h(doc, 'td', {}, capturing ? h(doc, 'span', { class: 'xs b', text: t('set.keysPress') }) : keys(s.shortcuts.keys[a])),
          h(doc, 'td', { class: 'r' }, h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', 'data-action': `key-${a}`, onclick: (e) => ctx.capture?.(a, e.currentTarget), text: capturing ? t('dlg.cancel') : t('set.keysChange') })));
      }))),
    h(doc, 'div', { class: 'card-f' },
      toggle(doc, { name: 'shortcuts', checked: s.shortcuts.on, labelledBy: 'eat-keys-on', onChange: (on) => settings.update({ shortcuts: { on } }) }),
      h(doc, 'span', { class: 'sm grow', id: 'eat-keys-on', text: t('set.keysOn') }),
      h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', 'data-action': 'keys-reset', onclick: () => settings.update({ shortcuts: { keys: { ...DEFAULT_SHORTCUTS } } }), text: t('set.keysReset') })));

  function keys(binding) {
    const parts = String(binding).split('+');
    return h(doc, 'span', { class: 'row', style: 'gap: 4px;' }, parts.map((k) => h(doc, 'span', { class: 'kbd', text: k })));
  }

  // ── Updates ─────────────────────────────────────────────────────────
  const updatesTab = () => {
    const st = updates?.state() ?? {};
    const available = updates?.available();
    return twoCols([
      card(doc, { id: 'eat-notes', title: t('set.notesTitle'), list: true },
        RELEASE_NOTES.map((n) => h(doc, 'div', { class: 'col', style: 'padding: 12px 16px; gap: 6px;' },
          h(doc, 'div', { class: 'row' }, h(doc, 'span', { class: 'mono b', text: n.version }), h(doc, 'span', { class: 'xs mute grow', text: formatDate(Date.parse(`${n.date}T12:00:00Z`), s.format, language) }), n.version === appVersion ? h(doc, 'span', { class: 'badge dark', text: t('set.installed') }) : null),
          h(doc, 'ul', { class: 'sm mute2 notes' }, n.items.map((k) => h(doc, 'li', { text: t(k) })))))),
    ], [
      card(doc, { id: 'eat-version', title: t('set.versionTitle'), bodyClass: 'card-b col' },
        h(doc, 'div', { class: 'row' }, h(doc, 'span', { class: 'mono b', style: 'font-size: 22px; line-height: 28px;', text: appVersion }), h(doc, 'span', { class: 'grow' }),
          st.latest ? h(doc, 'span', { class: available ? 'badge warn' : 'badge ok', 'data-role': 'update-state', text: available ? t('set.updateAvailable', { version: st.latest }) : t('set.upToDate') }) : null),
        h(doc, 'span', { class: 'xs mute2', text: st.checkedAt ? t('set.lastCheck', { when: formatDate(st.checkedAt, s.format, language, { time: true }) }) : t('set.neverChecked') }),
        st.error ? alertBox(doc, { tone: 'warn', text: t('set.checkFailed') }) : null,
        h(doc, 'div', { class: 'row' },
          h(doc, 'button', { class: 'btn btn-o btn-sm', type: 'button', 'data-action': 'check-update', disabled: Boolean(st.checking), onclick: async () => { await updates.check(); refresh?.(); } }, st.checking ? h(doc, 'span', { class: 'spin', style: 'width: 14px; height: 14px;' }) : null, t('set.checkNow')),
          h(doc, 'a', { class: 'btn btn-g btn-sm', href: available && st.url ? st.url : RELEASES_PAGE, target: '_blank', rel: 'noopener noreferrer' }, available ? t('set.installUpdate') : t('set.githubPage'), icon(doc, ICONS.external, 14))),
        h(doc, 'span', { class: 'xs mute', text: t('set.updateHow') })),
      card(doc, { id: 'eat-channel', title: t('set.channelTitle'), bodyClass: 'card-b col' },
        segmented(doc, { labelledBy: 'eat-channel-title', name: 'channel', value: s.updates.channel, options: [{ value: 'stable', label: t('set.channelStable') }, { value: 'beta', label: t('set.channelBeta') }], onChange: (channel) => settings.update({ updates: { channel } }) }),
        h(doc, 'span', { class: 'xs mute', text: t('set.channelHint') })),
    ]);
  };

  // ── Help ────────────────────────────────────────────────────────────
  const help = () => {
    const list = reports?.list() ?? [];
    const STATE = { fixed: 'ok', open: '', sent: 'out' };
    return twoCols([
      card(doc, { id: 'eat-guides', title: t('set.guidesTitle'), list: true },
        GUIDES.map(([id, path]) => h(doc, 'a', { class: 'li', href: `${GUIDE}/${path}`, target: '_blank', rel: 'noopener noreferrer', style: 'text-decoration: none;' },
          h(doc, 'span', { class: 'col grow', style: 'gap: 1px;' }, h(doc, 'span', { class: 'sm b', text: id === 'start' ? t('set.guideStart') : t(`tool.${id}`) }), h(doc, 'span', { class: 'xs mute', text: t(`set.guide.${id}`) })),
          h(doc, 'span', { class: 'xs mute' }, icon(doc, ICONS.external, 14))))),
    ], [
      card(doc, { id: 'eat-report', title: t('ws.report'), description: t('set.reportHint') },
        h(doc, 'button', { class: 'btn btn-p', type: 'button', 'data-action': 'report-problem', onclick: (e) => text.report?.({ returnFocus: e.currentTarget }), text: t('ws.report') })),
      card(doc, { id: 'eat-reports', title: t('set.reportsTitle'), bodyClass: list.length ? 'card-flush' : 'card-b', actions: list.length ? h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', 'data-action': 'reports-refresh', onclick: async () => { await reports.refresh(); refresh?.(); }, text: t('set.reportsRefresh') }) : null },
        list.length ? h(doc, 'table', { class: 'tbl' },
          h(doc, 'thead', {}, h(doc, 'tr', {}, h(doc, 'th', { text: t('set.reportsId') }), h(doc, 'th', { text: t('set.reportsTopic') }), h(doc, 'th', { text: t('set.reportsState') }))),
          h(doc, 'tbody', {}, list.map((r) => h(doc, 'tr', {},
            h(doc, 'td', { class: 'mono xs', style: 'white-space: nowrap;', text: r.id }),
            h(doc, 'td', { class: 'sm', text: t(`fb.cat.${r.category}`) }),
            h(doc, 'td', {}, h(doc, 'span', { class: `badge ${STATE[r.state] ?? ''}`, text: r.state === 'fixed' && r.fixedIn ? t('set.reportFixedIn', { version: r.fixedIn }) : t(`set.report.${r.state}`) }))))))
          : h(doc, 'span', { class: 'xs mute', text: t('set.reportsNone') })),
      card(doc, { id: 'eat-about', title: t('set.aboutTitle'), bodyClass: 'card-b col' },
        h(doc, 'div', { class: 'row sm' }, h(doc, 'span', { class: 'grow mute2', text: t('set.aboutProduct') }), h(doc, 'span', { class: 'b', text: `Etsy Automation Tools ${appVersion}` })),
        h(doc, 'div', { class: 'row sm' }, h(doc, 'span', { class: 'grow mute2', text: t('set.aboutDeveloper') }), h(doc, 'a', { class: 'b', href: 'https://makaytron.com', target: '_blank', rel: 'noopener noreferrer', text: 'Makaytron.com' })),
        h(doc, 'div', { class: 'row sm' }, h(doc, 'span', { class: 'grow mute2', text: t('set.aboutLicense') }), h(doc, 'span', { class: 'b', text: t('set.aboutMit') })),
        h(doc, 'span', { class: 'xs mute', text: t('set.aboutEtsy') })),
    ]);
  };

  const pages = { general, tools, ai, notifications, privacy, shortcuts, updates: updatesTab, help };
  return [
    pageHead(doc, {
      overline: 'Etsy Automation Tools', title: t('set.title'), description: t('set.description'), titleId: 'eat-settings-title',
      actions: upToDate ? [h(doc, 'span', { class: 'badge ok', text: t('set.versionBadge', { version: appVersion }) })] : [],
    }),
    pageTabs(doc, { label: t('set.sections'), name: 'settings-tab', value: tab, options: TABS.map((v) => ({ value: v, label: t(`set.tab.${v}`) })), onChange: (next) => onTab(next) }),
    (pages[tab] ?? general)(),
    note,
  ];
}

/** Mini picture of the window with the drawer and its button (Settings: "Düğmenin yeri"). */
function drawerPreview(doc, drawer) {
  const side = drawer.edge === 'right' ? 'right' : 'left';
  const along = `${Math.round(10 + drawer.offset * 70)}%`;
  const tab = {
    right: `right: 74px; top: calc(${along} - 11px); width: 10px; height: 22px; border-radius: 4px 0 0 4px;`,
    left: `left: 74px; top: calc(${along} - 11px); width: 10px; height: 22px; border-radius: 0 4px 4px 0;`,
    top: `top: 14px; left: calc(${along} - 11px); width: 22px; height: 10px; border-radius: 0 0 4px 4px;`,
    bottom: `bottom: 0; left: calc(${along} - 11px); width: 22px; height: 10px; border-radius: 4px 4px 0 0;`,
  }[drawer.edge];
  return h(doc, 'div', { class: 'drawer-preview', 'aria-hidden': 'true' },
    h(doc, 'div', { style: 'position: absolute; left: 0; right: 0; top: 0; height: 14px; background: var(--line2);' }),
    h(doc, 'div', { style: `position: absolute; ${side}: 0; top: 14px; bottom: 0; width: 74px; background: #fff; border-${side === 'right' ? 'left' : 'right'}: 1px solid var(--input);` }),
    h(doc, 'div', { style: `position: absolute; background: var(--primary); ${tab}` }));
}
