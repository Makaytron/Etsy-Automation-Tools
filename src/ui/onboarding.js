// First-run setup: language, then tools. Shown once on the first Etsy seller page.
//
// Design sources: template.primitive.dialog (modal frame, title, description, footer),
// template.primitive.progress (step indicator), template.primitive.select (language),
// template.primitive.checkbox (tools), template.primitive.badge (detected language),
// template.primitive.button. Design gap: the registry has no radio list, so the language
// is chosen with the select primitive instead of the radio list in the design board.

import { h } from './dom.js';
import { checkbox, select } from './controls.js';
import { UI_LANGUAGES } from './strings-workspace.js';
import { languageStatus } from './language-status.js';
import { TOOL_IDS } from '../core/settings.js';

export function openOnboarding({ doc, container, text, settings, scope, onDone }) {
  const { t } = text;
  const draft = { step: 1, language: text.language(), tools: { ...settings.get().tools } };
  const detected = (scope.navigator?.languages ?? [])[0] ?? '';
  // The opening sentence says the language came from the browser; once the user picks another one it no longer does.
  const openedIn = draft.language;
  let overlay = null;

  function progress(n, total) {
    return h(doc, 'div', { class: 'ob-progress' },
      h(doc, 'div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(n), 'aria-label': t('ob.step', { n, total }) },
        h(doc, 'div', { class: 'progress-indicator', style: `width:${(n / total) * 100}%` })),
      h(doc, 'span', { class: 'field-hint', text: t('ob.step', { n, total }) }));
  }

  function stepLanguage() {
    return [
      h(doc, 'div', { class: 'dialog-header' },
        h(doc, 'h2', { class: 'dialog-title', id: 'eat-ob-title', text: t('ob.langTitle') }),
        h(doc, 'p', { class: 'dialog-description', text: t(draft.language === openedIn ? 'ob.langText' : 'ob.langTextChosen') })),
      progress(1, 2),
      h(doc, 'div', { class: 'field', style: 'align-items:center' },
        select(doc, {
          labelledBy: 'eat-ob-title', name: 'ob-language', value: draft.language,
          options: UI_LANGUAGES.map((l) => ({ value: l.code, label: l.name })),
          onChange: async (language) => { draft.language = language; await settings.update({ language }); render(); },
        }),
        detected ? h(doc, 'span', { class: 'badge', text: t('ob.detected', { tag: detected }) }) : null),
      languageStatus(doc, text),
      h(doc, 'p', { class: 'field-hint', text: t('ob.privacy') }),
      h(doc, 'div', { class: 'dialog-footer' },
        // The setup goes on only once the chosen language is there.
        h(doc, 'button', { class: 'btn btn-default', type: 'button', 'data-action': 'ob-continue', disabled: !['ready', 'bundled'].includes(text.pack().status), onclick: async () => { await settings.update({ language: draft.language }); draft.step = 2; render(); }, text: t('ob.continue') })),
    ];
  }

  function stepTools() {
    return [
      h(doc, 'div', { class: 'dialog-header' },
        h(doc, 'h2', { class: 'dialog-title', id: 'eat-ob-title', text: t('ob.toolsTitle') }),
        h(doc, 'p', { class: 'dialog-description', text: t('ob.toolsText') })),
      progress(2, 2),
      h(doc, 'div', { class: 'check-list' },
        TOOL_IDS.map((id) => checkbox(doc, { name: `ob-tool-${id}`, label: t(`tool.${id}`), hint: t(`where.${id}`), checked: draft.tools[id] !== false, onChange: (on) => { draft.tools[id] = on; } }))),
      h(doc, 'p', { class: 'field-hint', text: t('ob.migrateHint') }),
      h(doc, 'div', { class: 'dialog-footer' },
        h(doc, 'button', { class: 'btn btn-outline', type: 'button', 'data-action': 'ob-back', onclick: () => { draft.step = 1; render(); }, text: t('ob.back') }),
        h(doc, 'button', { class: 'btn btn-default', type: 'button', 'data-action': 'ob-finish', onclick: finish, text: t('ob.finish') })),
    ];
  }

  async function finish() {
    await settings.update({ language: draft.language, tools: draft.tools, onboarded: true });
    end();
    onDone?.(true);
  }

  // A language pack that finishes (or fails) while the setup is open redraws it.
  let stopPackWatch = text.onPackChange?.(() => { if (overlay) render(); }) ?? null;
  function close() { overlay?.remove(); overlay = null; }
  function end() { close(); stopPackWatch?.(); stopPackWatch = null; }

  function render() {
    const focused = overlay?.getRootNode?.().activeElement;
    const keep = focused && overlay?.contains(focused) ? (focused.getAttribute('name') ?? focused.dataset.action) : null;
    close();
    const dialog = h(doc, 'div', { class: 'dialog onboarding', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'eat-ob-title', 'aria-label': t('ob.label') },
      ...(draft.step === 1 ? stepLanguage() : stepTools()));
    overlay = h(doc, 'div', { class: 'overlay' }, dialog);
    // "Later" is Escape: the setup shows again on the next seller page.
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); end(); onDone?.(false); } });
    container.append(overlay);
    const target = keep ? dialog.querySelector(`[name="${keep}"], [data-action="${keep}"]`) : null;
    (target ?? dialog.querySelector('select, input, button')).focus({ preventScroll: true });
  }

  render();
  return { close: end };
}
