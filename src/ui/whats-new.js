// "What's new" dialog after an update (design canvas artboard WhatsNew;
// adaptation of template.primitive.dialog). It opens once per new version on
// the first seller page, only when Settings › Updates allows it
// (settings.updateNotes); a first install records the version without it.

import { h, icon } from './dom.js';
import { ICONS } from './icons.js';
import { openDialog } from './controls.js';
import { RELEASE_NOTES } from '../core/release-notes.js';
import { compareVersions } from '../core/i18n.js';
import { formatDate } from './format.js';

const SEEN_KEY = 'seenVersion';

/** Shows the notes of `appVersion` if the user moved up to it from an older version. */
export async function maybeShowWhatsNew({ doc, container, text, settings, store, appVersion, onAllNotes }) {
  const seen = await store.get(SEEN_KEY, null).catch(() => null);
  await store.set(SEEN_KEY, appVersion).catch(() => {});
  // No record yet: a first install (still in setup) or an upgrade from a version that kept none.
  if (!seen && !settings.get().onboarded) return false;
  if ((seen && compareVersions(appVersion, String(seen)) <= 0) || !settings.get().updateNotes) return false;
  const notes = RELEASE_NOTES.find((n) => n.version === appVersion);
  if (!notes) return false;
  const { t } = text;
  const s = settings.get();
  const body = h(doc, 'div', { class: 'col', style: 'gap: 12px;', 'data-role': 'whats-new' },
    h(doc, 'div', { class: 'list', style: 'border: 1px solid var(--line); border-radius: 10.4px;' },
      notes.items.map((key) => h(doc, 'div', { class: 'li', style: 'align-items: flex-start; gap: 10px;' },
        icon(doc, ICONS.check, 16),
        h(doc, 'span', { class: 'sm', text: t(key) })))),
    h(doc, 'div', { class: 'banner' }, icon(doc, ICONS.info), h(doc, 'span', { class: 'grow', text: t('wn.kept') })));
  const show = h(doc, 'input', { type: 'checkbox', class: 'chk', name: 'wn-show', checked: true, onchange: (e) => settings.update({ updateNotes: e.target.checked }) });
  openDialog(doc, container, {
    title: `${t('set.notesTitle')} · ${appVersion}`,
    description: t('wn.updated', { date: formatDate(Date.parse(notes.date), s.format, text.language()) }),
    body, closeLabel: t('fb.cancel'), width: 560,
    footer: (close) => [
      h(doc, 'label', { class: 'row xs mute2', style: 'gap: 8px; margin-inline-end: auto;' }, show, t('wn.show')),
      h(doc, 'button', { class: 'btn btn-g', type: 'button', 'data-action': 'wn-all', onclick: () => { close(); onAllNotes?.(); }, text: t('wn.all') }),
      h(doc, 'button', { class: 'btn btn-p', type: 'button', 'data-action': 'wn-ok', onclick: close, text: t('wn.ok') }),
    ],
  });
  return true;
}
