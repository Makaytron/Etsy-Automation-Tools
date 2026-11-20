// Settings page of the workspace: General, Tools, Privacy and data.

import { h } from './dom.js';
import { card, field, segmented, checkbox, select, openDialog } from './controls.js';
import { UI_LANGUAGES } from './strings-workspace.js';
import { languageStatus } from './language-status.js';
import { TOOL_IDS } from '../core/settings.js';

export function renderSettingsPage(doc, { t, text, language, settings, storage, appVersion, scope, container, tab = 'general', onTab, message = '', say, migration, migrationState = {}, runMigration, onDataDeleted }) {
  const s = settings.get();
  const notice = h(doc, 'p', { class: 'notice', role: 'status', 'aria-live': 'polite', text: message });

  const tabs = segmented(doc, {
    labelledBy: 'eat-settings-title', name: 'settings-tab', value: tab,
    options: [{ value: 'general', label: t('set.tab.general') }, { value: 'tools', label: t('set.tab.tools') }, { value: 'privacy', label: t('set.tab.privacy') }],
    onChange: (next) => onTab(next),
  });

  const general = () => h(doc, 'div', { class: 'cards' },
    card(doc, { id: 'eat-appearance', title: t('set.appearance') },
      field(doc, { label: t('set.theme'), hint: t('set.themeHint'), labelId: 'eat-theme' }, segmented(doc, {
        labelledBy: 'eat-theme', name: 'theme', value: s.theme,
        options: ['light', 'dark', 'system'].map((v) => ({ value: v, label: t(`set.theme.${v}`) })),
        onChange: (theme) => settings.update({ theme }),
      })),
      field(doc, { label: t('set.density'), hint: t('set.densityHint'), labelId: 'eat-density' }, segmented(doc, {
        labelledBy: 'eat-density', name: 'density', value: s.density,
        options: ['comfortable', 'compact'].map((v) => ({ value: v, label: t(`set.density.${v}`) })),
        onChange: (density) => settings.update({ density }),
      }))),
    card(doc, { id: 'eat-language', title: t('set.language'), description: t('set.languageHint') },
      select(doc, {
        labelledBy: 'eat-language-title', name: 'language', value: s.language ?? '',
        options: UI_LANGUAGES.map((l) => ({ value: l.code, label: l.name })),
        onChange: (language) => settings.update({ language }),
      }),
      text ? languageStatus(doc, text) : null),
    card(doc, { id: 'eat-drawer', title: t('set.drawer'), description: t('set.drawerHint') },
      field(doc, { label: t('set.edge'), hint: t('set.edgeHint'), labelId: 'eat-edge' }, segmented(doc, {
        labelledBy: 'eat-edge', name: 'edge', value: s.drawer.edge,
        options: ['right', 'left', 'top', 'bottom'].map((v) => ({ value: v, label: t(`set.edge.${v}`) })),
        onChange: (edge) => settings.update({ drawer: { edge } }),
      })),
      checkbox(doc, { name: 'openOnLoad', label: t('set.openOnLoad'), hint: t('set.openOnLoadHint'), checked: s.drawer.openOnLoad, onChange: (openOnLoad) => settings.update({ drawer: { openOnLoad } }) }),
      checkbox(doc, { name: 'keepOpen', label: t('set.keepOpen'), hint: t('set.keepOpenHint'), checked: s.drawer.keepOpenWhileRunning, onChange: (keepOpenWhileRunning) => settings.update({ drawer: { keepOpenWhileRunning } }) }),
      h(doc, 'div', {}, h(doc, 'button', { class: 'btn btn-outline btn-sm', type: 'button', 'data-action': 'reset-position', onclick: () => settings.update({ drawer: { edge: 'right', offset: 0.5 } }), text: t('set.resetPosition') }))));

  const tools = () => h(doc, 'div', { class: 'cards' },
    card(doc, { id: 'eat-tools', title: t('set.toolsTitle'), description: t('set.toolsHint') },
      TOOL_IDS.map((id) => checkbox(doc, { name: `tool-${id}`, label: t(`tool.${id}`), hint: t(`where.${id}`), checked: s.tools[id] !== false, onChange: (on) => settings.update({ tools: { [id]: on } }) }))),
    card(doc, { id: 'eat-pro', title: t('set.proTitle') },
      checkbox(doc, { name: 'showPro', label: t('set.proToggle'), hint: t('set.proHint'), checked: s.showProSuggestions, onChange: (showProSuggestions) => settings.update({ showProSuggestions }) })));

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
    let keys = false;
    const typed = h(doc, 'input', { class: 'input', id: 'eat-confirm', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'eat-confirm-label' });
    const deleteButton = h(doc, 'button', { class: 'btn btn-destructive', type: 'button', disabled: true, 'data-action': 'confirm-delete', text: t('dlg.delete') });
    typed.addEventListener('input', () => { deleteButton.disabled = typed.value.trim().toLocaleUpperCase(language) !== word; });
    const body = h(doc, 'div', { class: 'card-content', style: 'padding:0' },
      h(doc, 'div', { class: 'check-list' },
        checkbox(doc, { name: 'delete-data', label: t('dlg.deleteSettings'), hint: t('dlg.deleteSettingsHint'), checked: true, onChange: () => {} }),
        checkbox(doc, { name: 'delete-keys', label: t('dlg.deleteKeys'), hint: t('dlg.deleteKeysHint'), checked: false, onChange: (on) => { keys = on; } })),
      h(doc, 'label', { class: 'label', for: 'eat-confirm', id: 'eat-confirm-label', text: t('dlg.confirmLabel', { word }) }),
      typed);
    body.querySelector('input[name="delete-data"]').disabled = true; // the data group is always part of this action
    const { close } = openDialog(doc, container, {
      title: t('dlg.deleteTitle'), description: t('dlg.deleteText'), body, closeLabel: t('dlg.cancel'), returnFocus: trigger,
      footer: (done) => [h(doc, 'button', { class: 'btn btn-outline', type: 'button', onclick: done, text: t('dlg.cancel') }), deleteButton],
    });
    deleteButton.addEventListener('click', async () => {
      await storage.clear({ includeSecrets: keys });
      await settings.load();
      await settings.update({});
      onDataDeleted?.(); // transfer records went with the data: the card must not say "transferred before"
      close();
      say(t('dlg.deleted'));
    });
  }

  const fileInput = h(doc, 'input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: (e) => { const f = e.target.files?.[0]; if (f) restoreBackup(f); e.target.value = ''; } });
  const RESULT = { imported: ['mig.imported', 'badge-ok'], already: ['mig.already', ''], busy: ['mig.busy', 'badge-warn'], error: ['mig.error', 'badge-err'], rejected: ['mig.rejected', 'badge-err'] };
  const migrationCard = () => {
    const { running, results, done = [] } = migrationState;
    const rows = (results ?? []).map((r) => {
      const [label, tone] = RESULT[r.state] ?? RESULT.error;
      return h(doc, 'tr', { 'data-tool': r.tool },
        h(doc, 'td', { text: t(`tool.${r.tool}`) }),
        h(doc, 'td', {}, h(doc, 'span', { class: `badge ${tone}`, text: t(label) })),
        h(doc, 'td', {}, r.sas ? h(doc, 'span', { class: 'mono', 'data-sas': r.sas, text: r.sas }) : h(doc, 'span', { class: 'field-hint', text: '—' })));
    });
    return card(doc, { id: 'eat-migration', title: t('mig.title'), description: t('mig.text') },
      h(doc, 'ol', { class: 'steps-list' }, h(doc, 'li', { text: t('mig.step1') }), h(doc, 'li', { text: t('mig.step2') })),
      done.length ? h(doc, 'p', { class: 'field-hint', 'data-role': 'mig-done', text: t('mig.done', { tools: done.map((id) => t(`tool.${id}`)).join(', ') }) }) : null,
      h(doc, 'div', {}, h(doc, 'button', { class: 'btn btn-default btn-sm', type: 'button', 'data-action': 'start-migration', disabled: Boolean(running) || !migration, onclick: () => runMigration?.(), text: running ? t('mig.running') : t('mig.start') })),
      running ? h(doc, 'p', { class: 'field-hint busy', role: 'status', 'aria-live': 'polite', 'data-role': 'mig-wait' }, h(doc, 'span', { class: 'spinner', 'aria-hidden': 'true' }), h(doc, 'span', { text: t('mig.wait') })) : null,
      results && !results.length ? h(doc, 'p', { class: 'field-hint', role: 'status', text: t('mig.none') }) : null,
      results?.length ? h(doc, 'div', { class: 'table-wrap' }, h(doc, 'table', { class: 'table' },
        h(doc, 'thead', {}, h(doc, 'tr', {}, h(doc, 'th', { text: t('mig.colTool') }), h(doc, 'th', { text: t('mig.colResult') }), h(doc, 'th', { text: t('mig.colCode') }))),
        h(doc, 'tbody', {}, rows))) : null,
      results?.some((r) => r.sas) ? h(doc, 'p', { class: 'field-hint', text: t('mig.codeHint') }) : null);
  };

  const privacy = () => h(doc, 'div', { class: 'cards' },
    migrationCard(),
    card(doc, { id: 'eat-backup', title: t('set.backupTitle'), description: t('set.backupHint') },
      h(doc, 'div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
        h(doc, 'button', { class: 'btn btn-outline btn-sm', type: 'button', 'data-action': 'backup', onclick: downloadBackup, text: t('set.backupDownload') }),
        h(doc, 'button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-action': 'restore', onclick: () => fileInput.click(), text: t('set.backupRestore') }),
        fileInput)),
    card(doc, { id: 'eat-data', title: t('set.dataTitle'), description: t('set.dataHint') },
      h(doc, 'div', {}, h(doc, 'button', { class: 'btn btn-destructive btn-sm', type: 'button', 'data-action': 'delete-data', onclick: (e) => confirmDelete(e.currentTarget), text: t('set.deleteData') }))));

  const pages = { general, tools, privacy };
  return h(doc, 'div', { style: 'display:contents' },
    h(doc, 'div', { class: 'page-head' },
      h(doc, 'h1', { class: 'page-title', id: 'eat-settings-title', text: t('set.title') }),
      h(doc, 'p', { class: 'page-description', text: t('set.description') })),
    tabs,
    (pages[tab] ?? general)(),
    notice);
}
