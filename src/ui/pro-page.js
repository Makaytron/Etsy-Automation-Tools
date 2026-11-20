// Makaytron Pro page of the workspace (design canvas artboard Pro; template
// card, table and button primitives, shadcn.blocks.kpi-widgets for the
// feature tiles). The script collects nothing here: sign-up and plans live on
// makaytron.com and open in a new tab.

import { h, icon } from './dom.js';
import { ICONS } from './icons.js';
import { pageHead } from './controls.js';

const SITE = 'https://makaytron.com';
const FEATURE_ICONS = {
  niche: ICONS.compass,
  drafts: ICONS.file,
  mockups: [['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }], ['circle', { cx: 9, cy: 9, r: 2 }], ['path', { d: 'm21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21' }]],
  queue: [['path', { d: 'm3 17 2 2 4-4' }], ['path', { d: 'm3 7 2 2 4-4' }], ['path', { d: 'M13 6h8' }], ['path', { d: 'M13 12h8' }], ['path', { d: 'M13 18h8' }]],
};

export function renderProPage(doc, { t, settings, onHide }) {
  const link = (props, ...children) => h(doc, 'a', { href: SITE, target: '_blank', rel: 'noopener noreferrer', ...props }, ...children);
  const steps = ['niche', 'library', 'draft', 'mockup', 'publish'];
  const rows = [['where', 'whereFree', 'wherePro'], ['jobs', 'yes', 'jobsPro'], ['analysis', 'yes', 'analysisPro'], ['library', 'no', 'yes'], ['queue', 'no', 'queuePro']];
  return [
    pageHead(doc, {
      overline: 'makaytron.com', title: 'Makaytron Pro', description: t('pro.lead'),
      actions: [
        settings ? h(doc, 'button', { class: 'btn btn-g', type: 'button', 'data-action': 'pro-hide', onclick: () => { settings.update({ showProSuggestions: false }); onHide?.(); }, text: t('pro.hide') }) : null,
        link({ class: 'btn btn-p btn-lg' }, t('pro.visit'), icon(doc, ICONS.external)),
      ],
    }),
    h(doc, 'div', { class: 'flow', role: 'list', 'aria-label': t('pro.flow') },
      steps.flatMap((step, i) => [i ? icon(doc, ICONS.arrowRight) : null, h(doc, 'span', { class: 's', role: 'listitem', text: t(`pro.step.${step}`) })])),
    h(doc, 'div', { class: 'g4' },
      Object.entries(FEATURE_ICONS).map(([id, paths]) => h(doc, 'div', { class: 'ft' },
        h(doc, 'span', { class: 'well' }, icon(doc, paths)),
        h(doc, 'span', { class: 'h3', text: t(`pro.ft.${id}`) }),
        h(doc, 'span', { class: 'xs mute', text: t(`pro.ft.${id}Text`) })))),
    h(doc, 'div', { class: 'cols' },
      h(doc, 'section', { class: 'card grow', 'aria-labelledby': 'eat-pro-compare' },
        h(doc, 'div', { class: 'card-h' }, h(doc, 'h2', { class: 'h2', id: 'eat-pro-compare', text: t('pro.compare') })),
        h(doc, 'table', { class: 'tbl' },
          h(doc, 'thead', {}, h(doc, 'tr', {}, h(doc, 'th', { text: t('pro.colWhat') }), h(doc, 'th', { text: t('pro.colFree') }), h(doc, 'th', { text: 'Makaytron Pro' }))),
          h(doc, 'tbody', {}, rows.map(([what, free, pro]) => h(doc, 'tr', {},
            h(doc, 'td', { class: 'b', text: t(`pro.row.${what}`) }),
            h(doc, 'td', { class: free === 'no' ? 'mute' : free === 'yes' ? '' : 'mute2', text: t(`pro.cell.${free}`) }),
            h(doc, 'td', { class: pro === 'yes' ? '' : 'mute2', text: t(`pro.cell.${pro}`) }))))),
        h(doc, 'div', { class: 'card-f' },
          h(doc, 'span', { class: 'xs mute grow', text: t('pro.plans') }),
          link({ class: 'xs b', style: 'text-underline-offset: 3px;', text: `${t('pro.plansLink')} →` }))),
      h(doc, 'section', { class: 'card', style: 'width: 400px; flex: none;', 'aria-labelledby': 'eat-pro-news' },
        h(doc, 'div', { class: 'card-h' }, h(doc, 'div', { class: 'col grow', style: 'gap: 2px;' }, h(doc, 'h2', { class: 'h2', id: 'eat-pro-news', text: t('pro.news') }), h(doc, 'span', { class: 'xs mute', text: t('pro.newsText') }))),
        h(doc, 'div', { class: 'card-b col', style: 'gap: 12px;' },
          h(doc, 'span', { class: 'xs mute2', text: t('pro.newsHow') }),
          link({ class: 'btn btn-o', style: 'width: 100%;' }, t('pro.newsButton'), icon(doc, ICONS.external, 14)),
          h(doc, 'a', { class: 'xs mute2', href: `${SITE}`, target: '_blank', rel: 'noopener noreferrer', style: 'text-underline-offset: 3px;', text: t('set.privacyRead') })))),
  ];
}
