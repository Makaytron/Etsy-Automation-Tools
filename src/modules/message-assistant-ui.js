// Message Assistant screens: drawer section and workspace page.
//
// Message Assistant's own panel holds its detailed work (conversation
// translation, replies, order automation, reviews, templates, history,
// provider settings). These screens summarise its state and start its own
// actions; every action opens its panel, where the engine's checks and
// confirmations apply before anything is sent on Etsy.
//
// Design sources: template.primitive.card, template.primitive.table, template.primitive.badge,
// template.primitive.button; shadcn.blocks.kpi-widgets (https://shadcnstore.com/blocks/application/widgets)
// for the four summary tiles; shadcn.blocks.datatable (https://shadcnstore.com/blocks/application/datatables)
// for the section list.

import { h } from '../ui/dom.js';
import { card } from '../ui/controls.js';
import { interpolate } from '../core/i18n.js';
import { packText } from '../core/language-packs.js';

export const MA_STRINGS = Object.freeze({
  en: Object.freeze({
    title: 'Customer messages', description: 'Translates Etsy messages and prepares replies with your own AI provider and API key.',
    aiReady: 'AI ready', aiMissing: 'No API key', campaign: 'Campaign running',
    aiLine: '{provider} · {model}', aiNone: 'Add your AI provider key in the assistant settings to prepare replies.',
    ctxMessages: 'Translation and reply are ready for this conversation.', ctxList: 'Open a conversation to translate it or prepare a reply.',
    ctxOrders: 'Order message automation works on this page.', ctxReviews: 'Reviews on this page can be translated and answered.', ctxOther: 'Works on Messages, Sold orders and the shop dashboard.',
    translate: 'Translate the last message', reply: 'Prepare a reply', openPanel: 'Open the assistant', details: 'Open details',
    tileAi: 'AI provider', tileTranslation: 'Translation', tileTemplates: 'Templates', tileHistory: 'History',
    noModel: 'No model chosen', previewIn: 'Preview in {language}', activeTemplates: 'Active templates', records: 'Saved records',
    sections: 'Sections', sectionNote: 'Detailed work opens in the Message Assistant panel on this page.',
    colSection: 'Section', colWhat: 'What it does', open: 'Open',
    sMessages: 'Messages', dMessages: 'Translate a conversation, prepare and check a reply.',
    sOrders: 'Automation', dOrders: 'Message buyers of sold orders one by one, with checks.',
    sReviews: 'Reviews', dReviews: 'Translate reviews and prepare public answers.',
    sTemplates: 'Templates', dTemplates: 'Reply templates with variables.',
    sHistory: 'History', dHistory: 'Translations, replies and sends kept on this computer.',
    sSettings: 'Settings', dSettings: 'AI provider, model and key, translation, signature.',
    campaignNote: 'A message campaign is running. Its progress and controls are in the Automation section.',
  }),
  tr: Object.freeze({
    title: 'Müşteri mesajları', description: 'Etsy mesajlarını çevirir, kendi AI sağlayıcınız ve API anahtarınızla cevap hazırlar.',
    aiReady: 'AI hazır', aiMissing: 'API anahtarı yok', campaign: 'Kampanya sürüyor',
    aiLine: '{provider} · {model}', aiNone: 'Cevap hazırlamak için asistan ayarlarına AI sağlayıcı anahtarınızı girin.',
    ctxMessages: 'Bu konuşmada çeviri ve cevap hazırlama hazır.', ctxList: 'Çevirmek veya cevap hazırlamak için bir konuşma açın.',
    ctxOrders: 'Sipariş mesajı otomasyonu bu sayfada çalışır.', ctxReviews: 'Bu sayfadaki yorumlar çevrilip cevaplanabilir.', ctxOther: 'Mesajlar, Satılan siparişler ve mağaza panosunda çalışır.',
    translate: 'Son mesajı çevir', reply: 'Cevap hazırla', openPanel: 'Asistanı aç', details: 'Ayrıntıları aç',
    tileAi: 'AI sağlayıcı', tileTranslation: 'Çeviri', tileTemplates: 'Şablonlar', tileHistory: 'Geçmiş',
    noModel: 'Model seçilmedi', previewIn: 'Önizleme dili: {language}', activeTemplates: 'Etkin şablon', records: 'Kayıtlı işlem',
    sections: 'Bölümler', sectionNote: 'Ayrıntılı çalışma bu sayfadaki Message Assistant panelinde açılır.',
    colSection: 'Bölüm', colWhat: 'Ne yapar', open: 'Aç',
    sMessages: 'Mesajlar', dMessages: 'Konuşmayı çevirir, cevap hazırlar ve kontrol eder.',
    sOrders: 'Otomasyon', dOrders: 'Satılan siparişlerin alıcılarına tek tek, kontrollü mesaj.',
    sReviews: 'Yorumlar', dReviews: 'Yorumları çevirir, herkese açık cevap hazırlar.',
    sTemplates: 'Şablonlar', dTemplates: 'Değişkenli cevap şablonları.',
    sHistory: 'Geçmiş', dHistory: 'Bu bilgisayarda tutulan çeviri, cevap ve gönderimler.',
    sSettings: 'Ayarlar', dSettings: 'AI sağlayıcı, model ve anahtar, çeviri, imza.',
    campaignNote: 'Bir mesaj kampanyası sürüyor. İlerlemesi ve kontrolleri Otomasyon bölümünde.',
  }),
});

// Bundled English and Turkish; other languages read the downloaded pack ("ma." keys).
function texts(language) {
  const lang = MA_STRINGS[language] ? language : 'en';
  return (key, vars) => interpolate(MA_STRINGS[language]?.[key] ?? packText(language, `ma.${key}`) ?? MA_STRINGS[lang][key] ?? MA_STRINGS.en[key] ?? key, vars);
}

const TRANSLATORS = { google: 'Google Translate', deepl: 'DeepL' };
const SECTIONS = [['messages', 'sMessages', 'dMessages'], ['orders', 'sOrders', 'dOrders'], ['reviews', 'sReviews', 'dReviews'],
  ['templates', 'sTemplates', 'dTemplates'], ['history', 'sHistory', 'dHistory'], ['settings', 'sSettings', 'dSettings']];

function badge(doc, ts, snap) {
  if (snap.campaign) return h(doc, 'span', { class: 'badge badge-dark', 'data-ma-state': 'campaign', text: ts('campaign') });
  return snap.ai.hasKey
    ? h(doc, 'span', { class: 'badge badge-ok', 'data-ma-state': 'ready', text: ts('aiReady') })
    : h(doc, 'span', { class: 'badge badge-warn', 'data-ma-state': 'no-key', text: ts('aiMissing') });
}

function contextLine(ts, snap) {
  if (snap.page === 'messages') return ts(snap.canCompose ? 'ctxMessages' : 'ctxList');
  if (snap.page === 'orders') return ts('ctxOrders');
  if (snap.page === 'reviews') return ts('ctxReviews');
  return ts('ctxOther');
}

/** Drawer section on Messages, Sold orders and the shop dashboard. */
export function renderMaDrawer(doc, { snap, language, actions }) {
  const ts = texts(language);
  return h(doc, 'div', { class: 'ads-drawer', 'data-role': 'ma-drawer' },
    h(doc, 'div', { class: 'current' }, h(doc, 'span', { class: 'grow', text: 'Message Assistant' }), badge(doc, ts, snap)),
    h(doc, 'div', { class: 'stack' },
      h(doc, 'p', { class: 'muted', 'data-role': 'ma-ai', text: snap.ai.hasKey ? ts('aiLine', { provider: snap.ai.name, model: snap.ai.model || ts('noModel') }) : ts('aiNone') }),
      h(doc, 'p', { class: 'muted', 'data-role': 'ma-context', text: contextLine(ts, snap) })),
    h(doc, 'div', { class: 'row-actions' },
      snap.canCompose ? h(doc, 'button', { class: 'btn btn-default btn-sm', type: 'button', 'data-ma': 'translate', disabled: snap.busy, onclick: () => actions.translateLast(), text: ts('translate') }) : null,
      snap.canCompose ? h(doc, 'button', { class: 'btn btn-outline btn-sm', type: 'button', 'data-ma': 'reply', disabled: snap.busy || !snap.ai.hasKey, onclick: () => actions.generateReply(), text: ts('reply') }) : null,
      h(doc, 'button', { class: `btn ${snap.canCompose ? 'btn-ghost' : 'btn-default'} btn-sm`, type: 'button', 'data-ma': 'open-panel', onclick: () => actions.openPanel(), text: ts('openPanel') }),
      h(doc, 'button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-ma': 'details', onclick: () => actions.openDetails(), text: ts('details') })));
}

/** Workspace page: summary tiles and the sections of the assistant panel. */
export function renderMaPage(doc, { snap, language, actions }) {
  const ts = texts(language);
  const tile = (label, value, hint, attrs = {}) => h(doc, 'div', { class: 'tile', ...attrs },
    h(doc, 'span', { class: 'overline', text: label }), h(doc, 'span', { class: 'tile-value', text: value }), hint ? h(doc, 'span', { class: 'field-hint', text: hint }) : null);
  return h(doc, 'div', { style: 'display:contents' },
    h(doc, 'div', { class: 'page-head' },
      h(doc, 'span', { class: 'overline', text: 'Message Assistant' }),
      h(doc, 'h1', { class: 'page-title', text: ts('title') }),
      h(doc, 'p', { class: 'page-description', text: ts('description') })),
    h(doc, 'div', { class: 'stack-lg' },
      h(doc, 'div', { class: 'tiles' },
        tile(ts('tileAi'), snap.ai.name, snap.ai.hasKey ? (snap.ai.model || ts('noModel')) : ts('aiMissing'), { 'data-ma-tile': 'ai' }),
        tile(ts('tileTranslation'), TRANSLATORS[snap.translator] ?? snap.translator, ts('previewIn', { language: snap.previewLanguage.toUpperCase() })),
        tile(ts('tileTemplates'), String(snap.templates), ts('activeTemplates'), { 'data-ma-tile': 'templates' }),
        tile(ts('tileHistory'), String(snap.history), ts('records'))),
      snap.campaign ? h(doc, 'p', { class: 'alert-warn', role: 'status', text: ts('campaignNote') }) : null,
      snap.ai.hasKey ? null : h(doc, 'p', { class: 'alert-warn', 'data-role': 'ma-no-key', text: ts('aiNone') }),
      card(doc, { id: 'eat-ma-sections', title: ts('sections'), description: ts('sectionNote') },
        h(doc, 'div', { class: 'table-wrap' }, h(doc, 'table', { class: 'table', 'data-role': 'ma-sections' },
          h(doc, 'thead', {}, h(doc, 'tr', {}, [ts('colSection'), ts('colWhat'), ''].map((c) => h(doc, 'th', { text: c })))),
          h(doc, 'tbody', {}, SECTIONS.map(([id, name, what]) => h(doc, 'tr', { 'data-section': id },
            h(doc, 'td', { text: ts(name) }),
            h(doc, 'td', { class: 'muted', text: ts(what) }),
            h(doc, 'td', {}, h(doc, 'button', { class: 'btn btn-outline btn-sm', type: 'button', 'data-ma-open': id, onclick: () => actions.openPanel(id), text: ts('open') }))))))))));
}
