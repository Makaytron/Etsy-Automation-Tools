// First-run setup: language, then tools. Shown once on the first Etsy seller page.
//
// Markup follows the design canvas artboards Onboarding-Language,
// Onboarding-LangError and Onboarding (adaptations of template.primitive.dialog,
// .input, .checkbox, .progress, .badge and .button). The language step opens in
// the browser's language (its strings are bundled for every language); the
// setup goes on only once the chosen language's pack is there.

import { h, icon } from './dom.js';
import { ICONS } from './icons.js';
import { toggle } from './controls.js';
import { UI_LANGUAGES } from './strings-workspace.js';
import { TOOL_IDS } from '../core/settings.js';
import { formatBytes } from './format.js';

export function openOnboarding({ doc, container, text, settings, scope, assets = {}, onDone }) {
  const { t } = text;
  const draft = { step: 1, language: text.language(), tools: { ...settings.get().tools }, autoTranslate: settings.get().ai.autoTranslate, query: '' };
  const detected = (scope.navigator?.languages ?? [])[0] ?? '';
  // The opening sentence says the language came from the browser; once the user picks another one it no longer does.
  const openedIn = draft.language;
  let overlay = null;

  function brand() {
    return h(doc, 'div', {}, h(doc, 'a', { class: 'ob-brand', href: 'https://makaytron.com', target: '_blank', rel: 'noopener noreferrer', 'aria-label': t('drawer.brandLink') },
      assets.logo ? h(doc, 'img', { src: assets.logo, alt: '' }) : null,
      h(doc, 'span', {}, h(doc, 'b', { text: 'Makaytron.com' }), h(doc, 'small', { text: `Etsy Automation Tools · ${t('ob.setup')}` }))));
  }

  function steps(n, total, extra = null) {
    return h(doc, 'div', { class: 'row xs mute2 ob-steps', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(n), 'aria-label': t('ob.step', { n, total }) },
      Array.from({ length: total }, (_, i) => h(doc, 'span', { class: i < n ? 'ob-step on' : 'ob-step' })),
      h(doc, 'span', { style: 'margin-inline-start: 6px;', text: n === 1 ? `${n} / ${total}` : t('ob.step', { n, total }) }),
      extra);
  }

  function head(title, description, n, extra) {
    return h(doc, 'div', { class: 'ob-h' }, brand(),
      h(doc, 'div', { class: 'col', style: 'gap: 4px;' },
        h(doc, 'h1', { class: 'h1 ob-title', id: 'eat-ob-title', text: title }),
        h(doc, 'p', { class: 'sm mute', text: description })),
      steps(n, 2, extra));
  }

  function stepLanguage() {
    const state = text.languageState(draft.language);
    const ready = ['ready', 'bundled'].includes(state.status);
    const name = UI_LANGUAGES.find((l) => l.code === draft.language)?.name ?? draft.language;
    const q = draft.query.trim().toLocaleLowerCase();
    const list = UI_LANGUAGES.filter((l) => !q || l.name.toLocaleLowerCase().includes(q) || (l.english ?? '').toLocaleLowerCase().includes(q) || l.code.startsWith(q));
    // The suggested (detected) language first, then the rest.
    list.sort((a, b) => (b.code === openedIn) - (a.code === openedIn));
    const progress = state.status === 'loading'
      ? h(doc, 'div', { class: 'banner', style: 'padding: 10px 12px;', role: 'status', 'data-role': 'lang-status', 'data-state': 'loading' },
        icon(doc, ICONS.download),
        h(doc, 'span', { class: 'grow col', style: 'gap: 6px;' },
          h(doc, 'span', { class: 'xs' }, h(doc, 'b', { text: t('set.packLoading', { language: name }) }), ' ', t('ob.packRest', { language: name })),
          h(doc, 'span', { class: 'prog', style: 'background: #e7e7e7;' }, h(doc, 'i', { style: `width: ${state.total ? Math.round((state.loaded / state.total) * 100) : 30}%;` })),
          state.loaded ? h(doc, 'span', { class: 'xxs mute num', text: state.total ? `${formatBytes(state.loaded, draft.language).replace(/ KB$/, '')} / ${formatBytes(state.total, draft.language)}` : formatBytes(state.loaded, draft.language) }) : null))
      : state.status === 'error'
        ? h(doc, 'div', { class: 'al err', role: 'alert', 'data-role': 'lang-status', 'data-state': 'error' },
          icon(doc, ICONS.error),
          h(doc, 'span', { class: 'col grow', style: 'gap: 8px;' },
            h(doc, 'span', {}, h(doc, 'b', { text: t('ob.packFailedTitle', { language: name }) }), ' ', t('lang.failed')),
            h(doc, 'span', { class: 'row' },
              h(doc, 'button', { class: 'btn btn-o btn-sm', type: 'button', 'data-action': 'lang-retry', onclick: () => { void text.ensureLanguage(draft.language).then(render); render(); }, text: t('lang.retry') }),
              h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', 'data-action': 'lang-english', onclick: async () => { draft.language = 'en'; await settings.update({ language: 'en' }); render(); }, text: t('ob.useEnglish') }))))
        : null;
    return [
      head(t('ob.langTitle'), t(draft.language === openedIn ? 'ob.langText' : 'ob.langTextChosen'), 1),
      h(doc, 'div', { class: 'ob-b' },
        h(doc, 'div', { class: 'search' }, icon(doc, ICONS.search), h(doc, 'input', { class: 'input', type: 'search', name: 'ob-search', value: draft.query, placeholder: t('ob.search'), 'aria-label': t('ob.search'), oninput: (e) => { draft.query = e.target.value; render(); } })),
        h(doc, 'span', { class: 'row xs mute2' }, h(doc, 'span', { class: 'grow', text: t('ob.suggested') }), detected ? h(doc, 'span', { class: 'badge out', text: t('ob.detected', { tag: detected }) }) : null),
        h(doc, 'div', { class: 'ob-langs', role: 'radiogroup', 'aria-labelledby': 'eat-ob-title' },
          list.map((l) => h(doc, 'label', { class: l.code === draft.language ? 'lg on' : 'lg' },
            h(doc, 'input', { type: 'radio', name: 'ob-language', value: l.code, checked: l.code === draft.language, onchange: async () => { draft.language = l.code; void text.ensureLanguage(l.code).then(render); await settings.update({ language: l.code }); render(); } }),
            h(doc, 'span', { lang: l.code, dir: 'auto', text: l.name }),
            h(doc, 'span', { class: 'en', text: l.english ?? '' })))),
        progress),
      h(doc, 'div', { class: 'ob-f' },
        h(doc, 'span', { class: 'col grow', style: 'gap: 2px;' },
          h(doc, 'span', { class: 'xs mute', text: t('ob.later2') }),
          h(doc, 'button', { class: 'xs b ob-link', type: 'button', 'data-action': 'ob-report', onclick: (e) => text.report?.({ category: 'language-pack', errorCode: state.status === 'error' ? state.code ?? 'i18n_pack_download' : null, returnFocus: e.currentTarget }), text: t('ob.problem') })),
        // The setup goes on only once the chosen language is there.
        h(doc, 'button', { class: 'btn btn-p btn-lg', type: 'button', 'data-action': 'ob-continue', disabled: !ready, onclick: async () => { await settings.update({ language: draft.language }); draft.step = 2; render(); }, text: t('ob.continueIn', { language: name }) })),
    ];
  }

  function stepTools() {
    const count = TOOL_IDS.filter((id) => draft.tools[id] !== false).length;
    const name = UI_LANGUAGES.find((l) => l.code === draft.language)?.name ?? draft.language;
    return [
      head(t('ob.welcome'), t('ob.toolsText'), 2,
        [h(doc, 'span', { class: 'grow' }), h(doc, 'button', { class: 'ob-link mute2', type: 'button', 'data-action': 'ob-back', onclick: () => { draft.step = 1; render(); }, text: t('ob.langChange', { language: name }) })]),
      h(doc, 'div', { class: 'ob-b ob-scroll' },
        h(doc, 'fieldset', { class: 'ob-set' },
          h(doc, 'legend', { class: 'ov', text: t('ws.navTools') }),
          TOOL_IDS.map((id) => {
            const on = draft.tools[id] !== false;
            return h(doc, 'label', { class: on ? 'ob-tool on' : 'ob-tool' },
              h(doc, 'input', { type: 'checkbox', class: 'chk', name: `ob-tool-${id}`, checked: on, onchange: (e) => { draft.tools[id] = e.target.checked; render(); } }),
              h(doc, 'span', { class: 'col', style: 'gap: 2px;' }, h(doc, 'span', { class: 'b', style: 'font-size: 14px;', text: t(`tool.${id}`) }), h(doc, 'span', { class: 'xs mute', text: t(`where.${id}`) })));
          })),
        h(doc, 'fieldset', { class: 'ob-set' },
          h(doc, 'legend', { class: 'ov', text: t('ob.linksData') }),
          h(doc, 'div', { class: 'ob-opt' },
            h(doc, 'span', { class: 'col grow', style: 'gap: 2px;' }, h(doc, 'span', { class: 'sm b', id: 'eat-ob-ai', text: t('ob.ai') }), h(doc, 'span', { class: 'xs mute', text: t(draft.autoTranslate ? 'ob.aiOn' : 'ob.aiOff') })),
            toggle(doc, { name: 'ob-ai', checked: draft.autoTranslate, labelledBy: 'eat-ob-ai', onChange: (on) => { draft.autoTranslate = on; render(); } })),
          h(doc, 'span', { class: 'xs mute', text: t('ob.migrateHint') }),
          h(doc, 'a', { class: 'xs mute2 ob-privacy', href: `https://github.com/Makaytron/Etsy-Automation-Tools/blob/main/${draft.language === 'tr' ? 'PRIVACY.md' : 'PRIVACY.en.md'}`, target: '_blank', rel: 'noopener noreferrer', text: t('set.privacyRead') }))),
      h(doc, 'div', { class: 'ob-f' },
        h(doc, 'span', { class: 'xs mute grow', 'data-role': 'ob-count', text: t('ob.selected', { count }) }),
        h(doc, 'button', { class: 'btn btn-g', type: 'button', 'data-action': 'ob-all', onclick: () => { for (const id of TOOL_IDS) draft.tools[id] = true; render(); }, text: t('ob.selectAll') }),
        h(doc, 'button', { class: 'btn btn-p btn-lg', type: 'button', 'data-action': 'ob-finish', disabled: !count, onclick: finish, text: t('ob.finish') })),
    ];
  }

  async function finish() {
    await settings.update({ language: draft.language, tools: draft.tools, ai: { autoTranslate: draft.autoTranslate }, onboarded: true });
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
    const keepValue = focused?.name === 'ob-language' ? focused.value : null;
    const scroll = overlay?.querySelector('.ob-langs, .ob-scroll')?.scrollTop ?? 0;
    close();
    const dialog = h(doc, 'div', { class: `ob-panel${draft.step === 1 ? ' lang' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'eat-ob-title', 'aria-label': t('ob.label') },
      ...(draft.step === 1 ? stepLanguage() : stepTools()));
    overlay = h(doc, 'div', { class: 'overlay' }, dialog);
    // "Later" is Escape: the setup shows again on the next seller page.
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); end(); onDone?.(false); } });
    container.append(overlay);
    const list = dialog.querySelector('.ob-langs, .ob-scroll');
    if (list) list.scrollTop = scroll;
    const target = keepValue ? dialog.querySelector(`[name="ob-language"][value="${keepValue}"]`) : keep ? dialog.querySelector(`[name="${keep}"], [data-action="${keep}"]`) : null;
    (target ?? dialog.querySelector('[name="ob-language"]:checked, input, button')).focus({ preventScroll: true });
  }

  void text.ensureLanguage?.(draft.language);
  render();
  return { close: end };
}
