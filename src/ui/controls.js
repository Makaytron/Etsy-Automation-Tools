// Small controls mapped to the template primitives (see styles-workspace.js for the sources).

import { h, icon } from './dom.js';
import { ICONS } from './icons.js';

/** Card with title, description and content. */
export function card(doc, { title, description, id }, ...content) {
  const titleId = `${id}-title`;
  return h(doc, 'section', { class: 'card', 'aria-labelledby': titleId },
    h(doc, 'div', { class: 'card-header' },
      h(doc, 'h3', { class: 'card-title', id: titleId, text: title }),
      description ? h(doc, 'p', { class: 'card-description', text: description }) : null),
    h(doc, 'div', { class: 'card-content' }, ...content));
}

/** Label + hint on the left, a control on the right. */
export function field(doc, { label, hint, labelId }, control) {
  return h(doc, 'div', { class: 'field' },
    h(doc, 'div', { class: 'field-text' },
      h(doc, 'span', { class: 'field-label', id: labelId, text: label }),
      hint ? h(doc, 'span', { class: 'field-hint', text: hint }) : null),
    control);
}

/**
 * Tab list used as a single-choice control (template.primitive.tabs).
 * Arrow keys move the selection, as in the WAI-ARIA tabs pattern.
 */
export function segmented(doc, { labelledBy, options, value, onChange, name }) {
  const list = h(doc, 'div', { class: 'tabs-list', role: 'tablist', 'aria-labelledby': labelledBy });
  const buttons = options.map((option) => h(doc, 'button', {
    class: 'tabs-trigger', type: 'button', role: 'tab', 'data-value': option.value, 'data-name': name,
    'aria-selected': String(option.value === value), tabindex: option.value === value ? '0' : '-1',
    onclick: () => select(option.value, true),
  }, option.label));
  function select(next, focus) {
    for (const b of buttons) {
      const on = b.dataset.value === next;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    }
    onChange(next);
  }
  list.addEventListener('keydown', (event) => {
    const i = buttons.findIndex((b) => b.getAttribute('aria-selected') === 'true');
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const rtl = list.closest('[dir="rtl"]') && (event.key === 'ArrowRight' || event.key === 'ArrowLeft');
    const next = buttons[(i + (rtl ? -step : step) + buttons.length) % buttons.length];
    select(next.dataset.value, true);
  });
  list.append(...buttons);
  return list;
}

/** Checkbox with label and hint (template.primitive.checkbox). */
export function checkbox(doc, { label, hint, checked, onChange, name }) {
  const input = h(doc, 'input', { type: 'checkbox', name, checked: Boolean(checked), onchange: (e) => onChange(e.target.checked) });
  return h(doc, 'label', { class: 'check' }, input,
    h(doc, 'span', { class: 'field-text' }, h(doc, 'span', { class: 'field-label', text: label }), hint ? h(doc, 'span', { class: 'field-hint', text: hint }) : null));
}

/** Native select styled as the template select trigger. */
export function select(doc, { labelledBy, options, value, onChange, name }) {
  const el = h(doc, 'select', { class: 'select', name, 'aria-labelledby': labelledBy, onchange: (e) => onChange(e.target.value) },
    options.map((o) => h(doc, 'option', { value: o.value, selected: o.value === value, text: o.label })));
  return el;
}

/**
 * Modal dialog (template.primitive.dialog). Focus moves in on open and back
 * to `returnFocus` on close; Escape and the overlay close it.
 */
export function openDialog(doc, container, { title, description, body, footer, closeLabel, returnFocus }) {
  const titleId = 'eat-dialog-title';
  const close = () => { overlay.remove(); returnFocus?.focus(); };
  const dialog = h(doc, 'div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h(doc, 'div', { class: 'dialog-header' },
      h(doc, 'h2', { class: 'dialog-title', id: titleId, text: title }),
      description ? h(doc, 'p', { class: 'dialog-description', text: description }) : null),
    body,
    h(doc, 'div', { class: 'dialog-footer' }, footer(close)),
    h(doc, 'button', { class: 'btn btn-ghost btn-icon close dialog-close', type: 'button', 'aria-label': closeLabel, onclick: close }, icon(doc, ICONS.close)));
  const overlay = h(doc, 'div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) close(); } }, dialog);
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  container.append(overlay);
  (dialog.querySelector('input, button:not(.dialog-close)') ?? dialog).focus();
  return { close, dialog };
}
