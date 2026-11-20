// Controls in the markup of the design canvas (suite.css classes):
// card / card-h / card-b, list rows (.li), segmented choice (.seg), switch,
// select (.input), page tabs (.tabs / .tab) and the modal (.overlay / .modal).
// The canvas adapts template.primitive.card, .tabs, .select, .checkbox,
// .dialog and .button; keyboard behaviour follows the WAI-ARIA patterns.

import { h, icon } from './dom.js';
import { ICONS } from './icons.js';

/** Card: header (title, optional description, optional actions) and body. */
export function card(doc, { title, description, id, actions, bodyClass = 'card-b', list = false }, ...content) {
  const titleId = `${id}-title`;
  return h(doc, 'section', { class: 'card', 'aria-labelledby': titleId, id },
    h(doc, 'div', { class: 'card-h' },
      h(doc, 'div', { class: 'col grow', style: 'gap: 2px;' },
        h(doc, 'h2', { class: 'h2', id: titleId, text: title }),
        description ? h(doc, 'span', { class: 'xs mute', text: description }) : null),
      actions ?? null),
    list ? h(doc, 'div', { class: 'list' }, ...content) : h(doc, 'div', { class: bodyClass }, ...content));
}

/** List row: bold label and hint on the left, a control on the right. */
export function row(doc, { label, hint, labelId, danger = false }, ...controls) {
  return h(doc, 'div', { class: 'li' },
    h(doc, 'span', { class: 'col grow', style: 'gap: 1px;' },
      h(doc, 'span', { class: danger ? 'sm b err-text' : 'sm b', id: labelId, text: label }),
      hint ? h(doc, 'span', { class: 'xs mute', text: hint }) : null),
    ...controls);
}

/** Kept for callers that put a control under a label: same as row(). */
export function field(doc, { label, hint, labelId }, control) {
  return row(doc, { label, hint, labelId }, control);
}

/** Labelled form field (label above the control). */
export function labeled(doc, { label, id }, control) {
  return h(doc, 'label', { class: 'field', for: id }, h(doc, 'span', { class: 'label', text: label }), control);
}

/**
 * Segmented single choice (.seg). A radio group: arrow keys move the choice.
 * `data-name` / `data-value` identify the buttons.
 */
export function segmented(doc, { labelledBy, label, options, value, onChange, name }) {
  const group = h(doc, 'div', { class: 'seg', role: 'radiogroup', 'aria-labelledby': labelledBy ?? null, 'aria-label': labelledBy ? null : label ?? null });
  const buttons = options.map((option) => h(doc, 'button', {
    class: option.value === value ? 'on' : null, type: 'button', role: 'radio', 'data-value': option.value, 'data-name': name,
    'aria-checked': String(option.value === value), tabindex: option.value === value ? '0' : '-1',
    onclick: () => choose(option.value, true),
  }, option.label));
  function choose(next, focus) {
    for (const b of buttons) {
      const on = b.dataset.value === next;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    }
    onChange(next);
  }
  group.addEventListener('keydown', (event) => {
    const i = buttons.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const rtl = group.closest('[dir="rtl"]') && (event.key === 'ArrowRight' || event.key === 'ArrowLeft');
    const next = buttons[(i + (rtl ? -step : step) + buttons.length) % buttons.length];
    choose(next.dataset.value, true);
  });
  group.append(...buttons);
  return group;
}

/** Switch (.switch, role="switch"). */
export function toggle(doc, { checked, onChange, name, label, labelledBy, disabled = false }) {
  const el = h(doc, 'button', {
    class: checked ? 'switch on' : 'switch', type: 'button', role: 'switch', name, 'data-name': name,
    'aria-checked': String(Boolean(checked)), 'aria-label': labelledBy ? null : label ?? null, 'aria-labelledby': labelledBy ?? null, disabled,
    onclick: () => {
      const on = el.getAttribute('aria-checked') !== 'true';
      el.setAttribute('aria-checked', String(on));
      el.classList.toggle('on', on);
      onChange(on);
    },
  }, h(doc, 'span', {}));
  return el;
}

/** A row with a switch: the common settings line. */
export function switchRow(doc, { name, label, hint, checked, onChange, disabled }) {
  const labelId = `eat-${name}-label`;
  return row(doc, { label, hint, labelId }, toggle(doc, { name, checked, onChange, labelledBy: labelId, disabled }));
}

/** Kept for older callers: a checkbox rendered as the canvas's switch row. */
export function checkbox(doc, { label, hint, checked, onChange, name }) {
  return switchRow(doc, { name, label, hint, checked, onChange });
}

/** Native select styled as the canvas's input. */
export function select(doc, { labelledBy, id, options, value, onChange, name, label }) {
  return h(doc, 'select', { class: 'input', name, id: id ?? null, 'aria-labelledby': labelledBy ?? null, 'aria-label': labelledBy || id ? null : label ?? null, onchange: (e) => onChange(e.target.value) },
    options.map((o) => h(doc, 'option', { value: o.value, selected: o.value === value, text: o.label })));
}

/** Page tabs (.tabs / .tab.on) as a tablist of buttons. */
export function pageTabs(doc, { label, options, value, onChange, name }) {
  const list = h(doc, 'nav', { class: 'tabs', role: 'tablist', 'aria-label': label });
  const buttons = options.map((o) => h(doc, 'button', {
    class: o.value === value ? 'tab on' : 'tab', type: 'button', role: 'tab', 'data-name': name, 'data-value': o.value,
    'aria-selected': String(o.value === value), tabindex: o.value === value ? '0' : '-1', onclick: () => onChange(o.value),
  }, o.label, o.count ? h(doc, 'span', { class: 'cnt', text: String(o.count) }) : null));
  list.addEventListener('keydown', (event) => {
    const i = buttons.findIndex((b) => b.getAttribute('aria-selected') === 'true');
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const rtl = list.closest('[dir="rtl"]');
    buttons[(i + (rtl ? -step : step) + buttons.length) % buttons.length].click();
  });
  list.append(...buttons);
  return list;
}

/** Inline alert (.al) — tone: err | warn | info. */
export function alertBox(doc, { tone = 'info', title, text, role = tone === 'err' ? 'alert' : 'status' }) {
  const glyph = { err: ICONS.error, warn: ICONS.alert, info: ICONS.info }[tone];
  return h(doc, 'div', { class: `al ${tone}`, role },
    icon(doc, glyph),
    h(doc, 'span', {}, title ? h(doc, 'b', { text: title }) : null, title && text ? ' ' : null, text ?? null));
}

/** Page banner (.banner) — tone: '' | ok | warn | err. */
export function banner(doc, { tone = '', iconPaths = ICONS.info, title, text, after = null }) {
  return h(doc, 'div', { class: tone ? `banner ${tone}` : 'banner', role: tone === 'err' ? 'alert' : 'status' },
    icon(doc, iconPaths),
    h(doc, 'span', { class: 'grow' }, title ? h(doc, 'span', { class: 't', text: title }) : null, title && text ? ' ' : null, text ?? null),
    after);
}

/** Page head (.ph): overline, title, description and actions on the right. */
export function pageHead(doc, { overline, title, description, titleId, actions = [] }) {
  return h(doc, 'div', { class: 'ph' },
    h(doc, 'div', { class: 'col grow' },
      overline ? h(doc, 'span', { class: 'ov', text: overline }) : null,
      h(doc, 'h1', { class: 'h1', id: titleId ?? null, text: title }),
      description ? h(doc, 'p', { class: 'desc', text: description }) : null),
    ...actions);
}

/**
 * Modal (.overlay / .modal, template.primitive.dialog). Focus moves in on
 * open and back to `returnFocus` on close; Escape and the overlay close it.
 * `width` follows the canvas (448 small, 576 medium, 768 large).
 */
export function openDialog(doc, container, { title, description, body, footer, closeLabel, returnFocus, width = 448, iconWell = null, tone = '' }) {
  const titleId = 'eat-dialog-title';
  const close = () => { overlay.remove(); returnFocus?.focus(); };
  const dialog = h(doc, 'div', { class: 'modal', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': titleId, style: `width: ${width}px;` },
    h(doc, 'div', { class: 'modal-h' },
      iconWell ? h(doc, 'span', { class: tone === 'err' ? 'well well-err' : 'well' }, icon(doc, iconWell)) : null,
      h(doc, 'div', { class: 'col grow', style: 'gap: 4px;' },
        h(doc, 'h2', { class: 'h2 modal-title', id: titleId, text: title }),
        description ? h(doc, 'p', { class: 'sm mute2', text: description }) : null),
      h(doc, 'button', { class: 'ib', type: 'button', 'aria-label': closeLabel, 'data-action': 'dialog-close', onclick: close }, icon(doc, ICONS.close))),
    h(doc, 'div', { class: 'modal-b' }, body),
    h(doc, 'div', { class: 'modal-f' }, h(doc, 'span', { class: 'grow' }), footer(close)));
  const overlay = h(doc, 'div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) close(); } }, dialog);
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  container.append(overlay);
  (dialog.querySelector('.modal-b input, .modal-b select, .modal-b button, .modal-f button') ?? dialog).focus();
  return { close, dialog };
}
