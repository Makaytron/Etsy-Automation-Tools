// Message Assistant screens, as the design canvas draws them: the drawer
// section (Msg-OnEtsy) and the workspace page with Conversations (Msg-Inbox,
// with the Msg-Drafting and Msg-AIError states of the draft card), Quick
// replies (Msg-Templates) and Autopilot and reviews (Msg-Automation,
// Msg-AutopilotConfirm), plus the first-use page (Msg-Empty).
//
// The screens read the engine's view (conversation list, open conversation,
// draft, templates, campaign, reviews) and call the engine's own methods, so
// its checks decide: the draft belongs to the open conversation, an unsent
// text in Etsy's box is never overwritten, and nothing presses Etsy's Send.
//
// Design sources: template.primitive.card, .table, .badge, .button, .tabs,
// .input, .select, .dialog; shadcn.blocks.datatable for the autopilot table.

import { h, icon } from '../ui/dom.js';
import { ICONS } from '../ui/icons.js';
import { pageHead, pageTabs, segmented, toggle, alertBox, banner, openDialog } from '../ui/controls.js';
import { interpolate } from '../core/i18n.js';
import { packText } from '../core/language-packs.js';

export const MA_STRINGS = Object.freeze({
  en: Object.freeze({
    tabs: 'Message Assistant pages', inbox: 'Conversations', templates: 'Quick replies', automation: 'Autopilot and reviews',
    inboxText: 'Read messages in your own language and prepare a reply draft you check before sending.',
    templatesText: 'Write the replies you send often once. They are translated to the buyer’s language and their variables are checked before they are added.',
    automationText: 'The autopilot opens waiting buyers one by one and prepares a draft. No message is sent without your approval.',
    services: 'Translation: {translator} · AI: {ai}', noAi: 'No AI connection', startAutopilot: 'Start the autopilot', refresh: 'Refresh',
    search: 'Search buyer or order', filter: 'Filter', unread: 'Unread · {n}', all: 'All',
    listElsewhere: 'The conversation list is read on Etsy’s Messages list. Go back to it to see every conversation here.',
    listEmpty: 'No conversation matches.', translatePreviews: 'Translate the previews', noOrder: 'No order', order: 'Order #{id}',
    pick: 'Pick a conversation', pickText: 'Choose a conversation on the left. It opens on Etsy and its translation and reply tools appear here.',
    openOrder: 'Open the order', writesIn: 'writes in {language}', translation: '{language} translation', showTranslation: 'Show in {language}',
    draft: 'Reply draft', draftReady: 'Ready to check', draftStale: 'Conversation changed', draftNone: 'No draft yet',
    fromTemplate: 'From the quick reply', fromAi: 'Prepared with {ai}', fromTranslate: 'Translated from your text', riskHigh: 'Needs a manual check', riskNone: 'No risk found',
    toBuyer: 'Text for the buyer', replyLanguage: 'Reply language', buyersLanguage: '{language} · buyer’s language', inYours: 'In {language}: {text}',
    neverSends: 'The message does not reach the buyer until you send it on Etsy.',
    regenerate: 'Prepare again', copy: 'Copy', insert: 'Add to the message box', makeDraft: 'Prepare a draft with AI', orTemplate: 'or add a quick reply from the right.',
    needKey: 'Connect an AI provider to prepare drafts.', connectAi: 'Connect an AI provider',
    preparing: 'Preparing…', preparingText: 'The draft is being prepared in {language} · usually 3–5 seconds',
    failed: 'Could not prepare', noConnection: 'No connection', errorTitle: 'The AI provider could not be reached.', errorKeep: 'The message and its translation stay as they are.',
    errorCode: 'Error code: {code} · {version}', report: 'Report a problem', updateKey: 'Update the key', retry: 'Try again',
    orderTitle: 'Order', quick: 'Quick replies', add: 'Add', manage: 'Manage the quick replies →', noTemplates: 'No quick reply yet.',
    emptyTitle: 'No conversation read yet', emptyText: 'When you open Messages on Etsy, the conversations are listed here. For translation and reply drafts, connecting an AI provider is enough.',
    openMessages: 'Open the Messages page', step1: 'Open Messages', step1Text: 'Go to Messages on Etsy.', step2: 'Read in your language', step2Text: 'Every message is translated to your language.',
    step3: 'Check the draft', step3Text: 'No message goes out until you send it.',
    newTemplate: 'New quick reply', searchTemplates: 'Search the quick replies', valid: 'Valid', missingVar: 'Unknown variable', archivedBadge: 'Archived',
    name: 'Name', group: 'Group', textTr: 'Text (write in Turkish)', addVariable: 'Add a variable:', previewBuyer: 'Preview in the buyer’s language', previewLanguages: 'Preview language',
    previewLoading: 'Translating the preview…', previewFailed: 'The preview could not be translated.',
    checkOk: 'Checked. All {n} variables can be filled from the order.', checkNone: 'Checked. The text has no variables.', checkBad: 'Unknown variable: {list}. It stays as written in the message.',
    archive: 'Archive the quick reply', unarchive: 'Use the quick reply again', cancel: 'Cancel', save: 'Save the quick reply', untitled: 'New quick reply',
    autopilot: 'Autopilot', apOn: 'On · {done} of {total} buyers handled', apPaused: 'Paused · {done} of {total} buyers handled', apOff: 'No autopilot is running',
    apOffText: 'The autopilot starts from the orders you select on Etsy’s Sold orders page, in the assistant’s Automation section.',
    openOrders: 'Open Sold orders', openAutomation: 'Open the Automation section', pause: 'Pause the autopilot', resume: 'Continue the autopilot',
    progress: 'Progress', colBuyer: 'Buyer', colItem: 'Item', colReply: 'Reply used', colStatus: 'Status', openConversation: 'Open the conversation',
    sPending: 'Queued', sDraft: 'Draft ready', sInserted: 'Waiting for your approval', sSent: 'Sent', sPendingCheck: 'Checking the send', sSkipped: 'Skipped', sError: 'Left to you',
    youApproved: 'You approved',
    rules: 'Autopilot rules', rule1: 'Ask me before every message', rule1Text: 'The autopilot only prepares drafts.', always: 'Always on', rule1Off: 'Automatic sending is on in the assistant settings.',
    rule2: 'Go on to the next buyer', rule2Text: 'After a send is confirmed, the next buyer opens.', rule3: 'Wait for the check', rule3Text: 'The next buyer starts only after Etsy shows the sent message.',
    reviews: 'Review replies', reviewsCount: '{n} reviews on this page', reviewsElsewhere: 'Reviews are read on the shop dashboard’s reviews.', openReviews: 'Open the reviews',
    reviewDraft: 'Prepare a draft', copyDraft: 'Copy the draft', checkRisk: 'Check: {risk}', rating: '{n} / 5',
    confirmTitle: 'The autopilot will open {n} buyers in order', confirmText: 'For every buyer it prepares a draft from the matching quick reply.',
    confirm1: 'No message is sent without your approval.', confirm2: 'Buyers without a matching reply are left to you.', confirm3: 'You can pause at any time.',
    close: 'Close', drawerAi: '{ai} · {model}', drawerOpen: 'Open the assistant', drawerContext: 'Open a conversation to translate it or prepare a reply.',
    waiting: '{n} unread conversations', openWorkspace: 'Open the workspace →', draftAdded: 'Draft ready',
  }),
});

// Bundled English; other languages read the downloaded pack ("ma." keys).
function texts(language) {
  const lang = MA_STRINGS[language] ? language : 'en';
  return (key, vars) => interpolate(MA_STRINGS[language]?.[key] ?? packText(language, `ma.${key}`) ?? MA_STRINGS[lang][key] ?? MA_STRINGS.en[key] ?? key, vars);
}

const TRANSLATORS = { google: 'Google Translate', deepl: 'DeepL' };
const PREVIEW_LANGUAGES = ['tr', 'en', 'de', 'fr'];
const STATUS = {
  pending: ['sPending', ''], draft: ['sDraft', 'out'], inserted: ['sInserted', 'dark'], sent: ['sSent', 'ok'],
  sent_pending_verification: ['sPendingCheck', 'warn'], skipped: ['sSkipped', 'out'], error: ['sError', 'warn'],
};

function languageName(code, language) {
  if (!code) return '';
  try { return new Intl.DisplayNames([language || 'en'], { type: 'language' }).of(code) ?? code; } catch { return code; }
}

const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase() || '·';

function servicesBadge(doc, ts, view) {
  if (!view.ai.hasKey) return h(doc, 'span', { class: 'badge err', 'data-ma-state': 'no-key' }, h(doc, 'span', { class: 'dot', style: 'background: #b91c1c;' }), ts('noAi'));
  return h(doc, 'span', { class: 'badge', 'data-ma-state': 'ready' }, h(doc, 'span', { class: 'dot' }), ts('services', { translator: TRANSLATORS[view.translator] ?? view.translator, ai: view.ai.name }));
}

function languageSelect(doc, ts, { value, languages, language, onChange, buyer }) {
  const options = languages.length ? languages : [{ code: value || 'en' }];
  return h(doc, 'select', { class: 'input', style: 'height: 28px; width: auto; padding: 0 8px; font-size: 12px;', 'aria-label': ts('replyLanguage'), 'data-ma': 'reply-language', onchange: (e) => onChange(e.target.value) },
    options.map((o) => h(doc, 'option', { value: o.code, selected: o.code === value, text: o.code === buyer ? ts('buyersLanguage', { language: languageName(o.code, language) }) : languageName(o.code, language) })));
}

function shieldLine(doc, ts) {
  return h(doc, 'span', { class: 'row xs mute2', style: 'gap: 6px;' }, icon(doc, ICONS.shield, 14), ts('neverSends'));
}

/** Drawer section on Messages, Sold orders and the shop dashboard (Msg-OnEtsy). */
export function renderMaDrawer(doc, { snap, view, language, actions, unread = 0 }) {
  const ts = texts(language);
  const c = view?.conversation;
  const active = (view?.templates ?? []).filter((t) => !t.archived);
  const body = c
    ? h(doc, 'div', { class: 'col', style: 'gap: 12px;' },
      h(doc, 'div', { class: 'row', style: 'gap: 10px;' },
        h(doc, 'span', { class: 'av', text: initials(c.name) }),
        h(doc, 'span', { class: 'col grow', style: 'gap: 1px; min-width: 0;' },
          h(doc, 'span', { class: 'sm b trunc', id: 'eat-current', text: c.name || 'Message Assistant' }),
          h(doc, 'span', { class: 'xs mute trunc', text: [c.orderId ? ts('order', { id: c.orderId }) : ts('noOrder'), c.language ? ts('writesIn', { language: languageName(c.language, language) }) : ''].filter(Boolean).join(' · ') })),
        c.reply && c.replyCurrent ? h(doc, 'span', { class: 'badge ok', 'data-ma-state': 'draft', text: ts('draftAdded') }) : null),
      h(doc, 'label', { class: 'row', style: 'gap: 6px;' }, h(doc, 'span', { class: 'xs mute2 grow', text: ts('replyLanguage') }),
        languageSelect(doc, ts, { value: c.replyLanguage || c.language || 'en', languages: actions.languages(), language, buyer: c.language, onChange: (code) => actions.setReplyLanguage(code) })),
      h(doc, 'div', { class: 'row' },
        h(doc, 'button', { class: 'btn btn-o btn-sm grow', type: 'button', 'data-ma': 'translate', disabled: snap.busy, onclick: () => actions.translate(), text: ts('showTranslation', { language: languageName(view.previewLanguage, language) }) }),
        h(doc, 'button', { class: 'btn btn-p btn-sm grow', type: 'button', 'data-ma': 'draft', disabled: snap.busy || !view.ai.hasKey, onclick: () => actions.draft(), text: ts('makeDraft') })),
      active.length ? [h(doc, 'span', { class: 'ov', text: ts('quick') }),
        h(doc, 'div', { class: 'list', style: 'border: 1px solid #e7e7e7; border-radius: 10.4px;' }, active.slice(0, 4).map((t) => h(doc, 'div', { class: 'li', style: 'padding: 8px 12px;' },
          h(doc, 'span', { class: 'sm grow trunc', text: t.name }),
          h(doc, 'button', { class: 'btn btn-g btn-sm', style: 'height: 26px;', type: 'button', 'data-ma-template': t.id, disabled: snap.busy, onclick: () => actions.useTemplate(t.id), text: ts('add') }))))] : null,
      shieldLine(doc, ts))
    : h(doc, 'div', { class: 'col', style: 'gap: 12px;' },
      h(doc, 'div', { class: 'row' }, icon(doc, ICONS['message-assistant']), h(doc, 'span', { class: 'h3 grow', id: 'eat-current', text: 'Message Assistant' }), servicesBadge(doc, ts, view ?? { ai: snap.ai, translator: snap.translator })),
      h(doc, 'span', { class: 'xs mute2', 'data-role': 'ma-context', text: ts('drawerContext') }),
      h(doc, 'button', { class: 'btn btn-o btn-sm', type: 'button', 'data-ma': 'open-panel', onclick: () => actions.openPanel(), text: ts('drawerOpen') }));
  return h(doc, 'div', { class: 'col', style: 'gap: 12px;', 'data-role': 'ma-drawer' }, body,
    h(doc, 'div', { class: 'row', style: 'gap: 8px; padding-top: 10px; border-top: 1px solid #ececec;' },
      h(doc, 'span', { class: 'xs mute2 grow', text: unread ? ts('waiting', { n: unread }) : '' }),
      h(doc, 'button', { class: 'xs b ob-link', type: 'button', 'data-ma': 'details', onclick: () => actions.openDetails(), text: ts('openWorkspace') })));
}

/** Workspace page with Conversations, Quick replies and Autopilot and reviews. */
export function renderMaPage(doc, { view, language, actions, tab = 'inbox', onTab, local, container, version }) {
  const ts = texts(language);
  const current = ['inbox', 'templates', 'automation'].includes(tab) ? tab : 'inbox';
  const list = local.list ?? [];
  const unread = list.filter((item) => item.unread).length;
  const tabs = pageTabs(doc, {
    label: ts('tabs'), name: 'ma-tab', value: current, onChange: onTab,
    options: [{ value: 'inbox', label: ts('inbox'), count: unread }, { value: 'templates', label: ts('templates') }, { value: 'automation', label: ts('automation') }],
  });
  const busy = view.busy;

  // ---- Conversations ----------------------------------------------------
  const inbox = () => {
    const c = view.conversation;
    if (!c && !list.length) {
      return [h(doc, 'section', { class: 'card', style: 'flex: 1 1 auto; display: flex;', 'data-role': 'ma-empty' },
        h(doc, 'div', { class: 'empty' },
          h(doc, 'span', { class: 'ei' }, icon(doc, ICONS['message-assistant'], 24)),
          h(doc, 'p', { class: 'et', text: ts('emptyTitle') }),
          h(doc, 'p', { class: 'ed', text: ts('emptyText') }),
          h(doc, 'div', { class: 'ea' },
            h(doc, 'a', { class: 'btn btn-p', href: 'https://www.etsy.com/messages', 'data-ma': 'go-messages', text: ts('openMessages') }),
            view.ai.hasKey ? null : h(doc, 'button', { class: 'btn btn-o', type: 'button', 'data-ma': 'connect-ai', onclick: () => actions.openSettings('ai'), text: ts('connectAi') })),
          h(doc, 'div', { class: 'steps' }, [['step1', 'step1Text'], ['step2', 'step2Text'], ['step3', 'step3Text']].map(([title, text], i) => h(doc, 'div', {},
            h(doc, 'span', { class: 'n', text: String(i + 1) }), h(doc, 'span', {}, h(doc, 'span', { class: 'st', text: ts(title) }), h(doc, 'span', { class: 'sd', text: ts(text) })))))))];
    }
    const query = String(local.query ?? '').trim().toLocaleLowerCase(language);
    const shown = list.filter((item) => (local.filter !== 'unread' || item.unread)
      && (!query || `${item.name} ${item.preview} ${item.translated}`.toLocaleLowerCase(language).includes(query)));
    const left = h(doc, 'div', { style: 'width: 320px; flex: none; border-right: 1px solid #e7e7e7; display: flex; flex-direction: column; min-height: 0;' },
      h(doc, 'div', { style: 'padding: 12px; border-bottom: 1px solid #ececec; display: flex; gap: 8px;' },
        h(doc, 'div', { class: 'search grow' }, icon(doc, ICONS.search),
          h(doc, 'input', { class: 'input', type: 'search', placeholder: ts('search'), 'aria-label': ts('search'), name: 'ma-search', value: local.query ?? '', 'data-ma': 'search',
            oninput: (e) => actions.setLocal({ query: e.target.value }) }))),
      h(doc, 'div', { style: 'padding: 8px 12px; border-bottom: 1px solid #ececec;' },
        segmented(doc, { label: ts('filter'), name: 'ma-filter', value: local.filter === 'unread' ? 'unread' : 'all', onChange: (value) => actions.setLocal({ filter: value }),
          options: [{ value: 'unread', label: ts('unread', { n: unread }) }, { value: 'all', label: ts('all') }] })),
      h(doc, 'div', { style: 'flex: 1 1 auto; overflow: auto;', 'data-role': 'ma-list' },
        shown.map((item) => h(doc, 'a', {
          class: item.id === c?.id ? 'cv on' : 'cv', href: item.url, 'data-conversation': item.id,
          onclick: (e) => { e.preventDefault(); actions.openConversation(item.url); },
        }, h(doc, 'span', { class: 'av', text: initials(item.name) }),
        h(doc, 'span', { class: 'col grow', style: 'gap: 2px; min-width: 0;' },
          h(doc, 'span', { class: 'row' }, h(doc, 'span', { class: item.unread ? 'sm b grow trunc' : 'sm grow trunc', text: item.name }), h(doc, 'span', { class: 'xxs mute', text: item.time })),
          h(doc, 'span', { class: 'xs trunc', text: item.translated || item.preview })))),
        list.length && !shown.length ? h(doc, 'div', { class: 'xs mute', style: 'padding: 12px 14px;', text: ts('listEmpty') }) : null,
        list.length ? null : h(doc, 'div', { class: 'xs mute', style: 'padding: 12px 14px;', text: ts('listElsewhere') })));

    const middle = c ? conversationColumn(c) : h(doc, 'div', { class: 'grow', style: 'display: flex;' },
      h(doc, 'div', { class: 'empty' }, h(doc, 'span', { class: 'ei' }, icon(doc, ICONS['message-assistant'], 24)),
        h(doc, 'p', { class: 'et', text: ts('pick') }), h(doc, 'p', { class: 'ed', text: ts('pickText') })));

    const active = view.templates.filter((t) => !t.archived);
    const right = h(doc, 'aside', { style: 'width: 280px; flex: none; border-left: 1px solid #e7e7e7; display: flex; flex-direction: column;' },
      h(doc, 'div', { style: 'padding: 14px 16px; border-bottom: 1px solid #ececec;' }, h(doc, 'span', { class: 'h3', text: ts('orderTitle') })),
      h(doc, 'div', { style: 'padding: 14px 16px; display: flex; gap: 12px; border-bottom: 1px solid #ececec;' },
        h(doc, 'span', { class: 'thumb' }),
        h(doc, 'span', { class: 'col', style: 'gap: 2px; min-width: 0;' },
          h(doc, 'span', { class: 'sm b', text: c?.itemTitle || (c?.orderId ? ts('order', { id: c.orderId }) : ts('noOrder')) }),
          c?.orderId && c.itemTitle ? h(doc, 'span', { class: 'xs mute', text: ts('order', { id: c.orderId }) }) : null)),
      h(doc, 'div', { style: 'padding: 14px 16px 6px;' }, h(doc, 'span', { class: 'ov', text: ts('quick') })),
      h(doc, 'div', { class: 'list', style: 'padding: 0 4px; overflow: auto;' },
        active.length ? active.map((t) => h(doc, 'button', {
          class: 'li sm', type: 'button', style: 'padding: 10px 12px; width: 100%; border: none; background: transparent; text-align: start; cursor: pointer;',
          'data-ma-template': t.id, disabled: !c || busy, onclick: () => actions.useTemplate(t.id),
        }, h(doc, 'span', { class: 'grow trunc', text: t.name }), h(doc, 'span', { class: 'xxs mute', text: ts('add') })))
          : h(doc, 'span', { class: 'xs mute', style: 'padding: 6px 12px;', text: ts('noTemplates') })),
      h(doc, 'span', { class: 'grow' }),
      h(doc, 'div', { style: 'padding: 12px 16px; border-top: 1px solid #ececec;' },
        h(doc, 'button', { class: 'xs b ob-link', type: 'button', 'data-ma': 'manage-templates', onclick: () => onTab('templates'), text: ts('manage') })));

    return [h(doc, 'div', { class: 'card', style: 'flex: 1 1 auto; min-height: 0; display: flex;', 'data-role': 'ma-inbox' }, left, middle, right)];
  };

  function conversationColumn(c) {
    const preview = languageName(view.previewLanguage, language);
    const customer = c.messages.filter((m) => m.role === 'customer').slice(-2);
    const error = view.error && ['generate-reply', 'regenerate-reply', 'template-reply', 'insert-reply', 'translate-last', 'copy'].includes(view.error.action) ? view.error : null;
    const replyLanguage = c.replyLanguage || c.language || 'en';
    let draftCard;
    if (busy && !c.reply) {
      draftCard = h(doc, 'section', { class: 'card', style: 'margin-top: auto;', 'data-ma-draft': 'preparing' },
        h(doc, 'div', { class: 'card-h' }, icon(doc, ICONS.sparkles),
          h(doc, 'div', { class: 'col grow', style: 'gap: 2px;' }, h(doc, 'span', { class: 'h3', text: ts('draft') })),
          h(doc, 'span', { class: 'badge', text: ts('preparing') })),
        h(doc, 'div', { class: 'card-b col', style: 'gap: 10px;' },
          h(doc, 'div', { class: 'ld-box', 'aria-hidden': 'true' }, h(doc, 'span', { class: 'shim', style: 'height: 10px; width: 88%;' }), h(doc, 'span', { class: 'shim', style: 'height: 10px; width: 74%;' }), h(doc, 'span', { class: 'shim', style: 'height: 10px; width: 40%;' })),
          h(doc, 'span', { class: 'row xs mute2', style: 'gap: 6px;', role: 'status' }, h(doc, 'span', { class: 'spin', style: 'width: 12px; height: 12px;' }), ts('preparingText', { language: languageName(replyLanguage, language) }))),
        h(doc, 'div', { class: 'card-f', style: 'justify-content: flex-end;' }, h(doc, 'button', { class: 'btn btn-p btn-sm', type: 'button', disabled: true }, h(doc, 'span', { class: 'spin', style: 'width: 12px; height: 12px;' }), ts('preparing'))));
    } else if (error && !c.reply) {
      draftCard = h(doc, 'section', { class: 'card', style: 'margin-top: auto;', 'data-ma-draft': 'error' },
        h(doc, 'div', { class: 'card-h' },
          h(doc, 'div', { class: 'col grow', style: 'gap: 2px;' }, h(doc, 'span', { class: 'h3', text: ts('draft') }), h(doc, 'span', { class: 'xxs mute', text: ts('failed') })),
          h(doc, 'span', { class: 'badge err', text: ts('noConnection') })),
        h(doc, 'div', { class: 'card-b col', style: 'gap: 12px;' },
          alertBox(doc, { tone: 'err', title: ts('errorTitle'), text: `${error.message} ${ts('errorKeep')}` }),
          h(doc, 'span', { class: 'mono xxs mute', 'data-role': 'ma-error-code', text: ts('errorCode', { code: `MSG-${(error.code || 'error').toUpperCase()}`, version }) })),
        h(doc, 'div', { class: 'card-f' },
          h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', 'data-ma': 'report', onclick: (e) => actions.report({ category: 'wrong-result', tool: 'message-assistant', errorCode: `ma_${error.code || 'error'}`, returnFocus: e.currentTarget }), text: ts('report') }),
          h(doc, 'span', { class: 'grow' }),
          h(doc, 'button', { class: 'btn btn-o btn-sm', type: 'button', 'data-ma': 'update-key', onclick: () => actions.openSettings('ai'), text: ts('updateKey') }),
          h(doc, 'button', { class: 'btn btn-p btn-sm', type: 'button', 'data-ma': 'retry', onclick: () => actions.draft() }, icon(doc, ICONS.refresh, 14), ts('retry'))));
    } else if (c.reply) {
      const source = c.replyMethod === 'template' ? ts('fromTemplate') : c.replyMethod.startsWith('ai') ? ts('fromAi', { ai: view.ai.name }) : ts('fromTranslate');
      draftCard = h(doc, 'section', { class: 'card', style: 'margin-top: auto;', 'data-ma-draft': 'ready' },
        h(doc, 'div', { class: 'card-h' }, icon(doc, ICONS.sparkles),
          h(doc, 'div', { class: 'col grow', style: 'gap: 2px;' }, h(doc, 'span', { class: 'h3', text: ts('draft') }),
            h(doc, 'span', { class: 'xxs mute', text: `${source} · ${c.risk === 'high' ? ts('riskHigh') : ts('riskNone')}` })),
          c.replyCurrent ? h(doc, 'span', { class: c.risk === 'high' ? 'badge warn' : 'badge ok', text: c.risk === 'high' ? ts('riskHigh') : ts('draftReady') }) : h(doc, 'span', { class: 'badge warn', text: ts('draftStale') })),
        h(doc, 'div', { class: 'card-b col', style: 'gap: 10px;' },
          h(doc, 'div', { class: 'field' },
            h(doc, 'div', { class: 'row' }, h(doc, 'span', { class: 'label grow', id: 'eat-ma-reply-label', text: ts('toBuyer') }),
              h(doc, 'label', { class: 'row', style: 'gap: 6px;' }, h(doc, 'span', { class: 'xs mute2', text: ts('replyLanguage') }),
                languageSelect(doc, ts, { value: replyLanguage, languages: actions.languages(), language, buyer: c.language, onChange: (code) => actions.setReplyLanguage(code) }))),
            h(doc, 'textarea', { class: 'input', rows: '3', 'aria-labelledby': 'eat-ma-reply-label', 'data-ma': 'reply', oninput: (e) => actions.editReply(e.target.value) }, c.reply)),
          c.replyTr ? h(doc, 'span', { class: 'xs mute', text: ts('inYours', { language: languageName('tr', language), text: c.replyTr }) }) : null,
          shieldLine(doc, ts)),
        h(doc, 'div', { class: 'card-f', style: 'flex-wrap: wrap; justify-content: flex-end;' },
          h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', 'data-ma': 'regenerate', disabled: busy, onclick: () => actions.regenerate(), text: ts('regenerate') }),
          h(doc, 'button', { class: 'btn btn-o btn-sm', type: 'button', 'data-ma': 'copy', disabled: busy || !c.replyCurrent, onclick: () => actions.copy(), text: ts('copy') }),
          h(doc, 'button', { class: 'btn btn-p btn-sm', type: 'button', 'data-ma': 'insert', disabled: busy || !c.replyCurrent || !c.canInsert, onclick: () => actions.insert(), text: ts('insert') })));
    } else {
      draftCard = h(doc, 'section', { class: 'card', style: 'margin-top: auto;', 'data-ma-draft': 'none' },
        h(doc, 'div', { class: 'card-h' }, icon(doc, ICONS.sparkles),
          h(doc, 'div', { class: 'col grow', style: 'gap: 2px;' }, h(doc, 'span', { class: 'h3', text: ts('draft') }), h(doc, 'span', { class: 'xxs mute', text: view.ai.hasKey ? ts('orTemplate') : ts('needKey') })),
          h(doc, 'span', { class: 'badge out', text: ts('draftNone') })),
        h(doc, 'div', { class: 'card-f', style: 'justify-content: flex-end;' },
          view.ai.hasKey ? null : h(doc, 'button', { class: 'btn btn-o btn-sm', type: 'button', 'data-ma': 'connect-ai', onclick: () => actions.openSettings('ai'), text: ts('connectAi') }),
          h(doc, 'button', { class: 'btn btn-p btn-sm', type: 'button', 'data-ma': 'draft', disabled: busy || !view.ai.hasKey, onclick: () => actions.draft() }, icon(doc, ICONS.sparkles, 14), ts('makeDraft'))));
    }
    return h(doc, 'div', { class: 'grow', style: 'display: flex; flex-direction: column; min-height: 0; min-width: 0;', 'data-role': 'ma-conversation' },
      h(doc, 'div', { style: 'padding: 14px 20px; border-bottom: 1px solid #ececec; display: flex; align-items: center; gap: 12px;' },
        h(doc, 'div', { class: 'col grow', style: 'gap: 2px; min-width: 0;' },
          h(doc, 'span', { class: 'h2', text: c.name }),
          h(doc, 'span', { class: 'xs mute trunc', text: [c.orderId ? ts('order', { id: c.orderId }) : ts('noOrder'), c.itemTitle, c.language ? ts('writesIn', { language: languageName(c.language, language) }) : ''].filter(Boolean).join(' · ') })),
        c.orderId ? h(doc, 'a', { class: 'btn btn-o btn-sm', href: `https://www.etsy.com/your/orders/sold?order_id=${encodeURIComponent(c.orderId)}`, target: '_blank', rel: 'noopener', text: ts('openOrder') }) : null),
      h(doc, 'div', { style: 'flex: 1 1 auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; overflow: auto; background: #fcfcfc;' },
        h(doc, 'div', { style: 'max-width: 560px; display: flex; flex-direction: column; gap: 6px;' },
          customer.map((m) => h(doc, 'div', { style: 'background: #ffffff; border: 1px solid #e7e7e7; border-radius: 12px; padding: 12px 14px;', class: 'sm', 'data-role': 'ma-message', text: m.text })),
          c.translation
            ? h(doc, 'div', { style: 'background: #f2f2f2; border-radius: 12px; padding: 10px 14px;', class: 'sm', 'data-role': 'ma-translation' },
              h(doc, 'span', { class: 'xxs mute b', style: 'display: block; margin-bottom: 2px;', text: ts('translation', { language: preview }) }), c.translation)
            : c.last ? h(doc, 'button', { class: 'btn btn-o btn-sm', style: 'align-self: flex-start;', type: 'button', 'data-ma': 'translate', disabled: busy, onclick: () => actions.translate() }, icon(doc, ICONS.globe, 14), ts('showTranslation', { language: preview })) : null),
        draftCard));
  }

  // ---- Quick replies ----------------------------------------------------
  const templatesTab = () => {
    const variables = actions.variables();
    const all = view.templates;
    const editing = local.template ?? all.find((t) => t.id === local.templateId) ?? all.find((t) => !t.archived) ?? null;
    const draft = local.templateDraft && local.templateDraft.id === (editing?.id ?? '') ? local.templateDraft : editing ? { id: editing.id, name: editing.name, category: editing.category, text: editing.text } : null;
    const query = String(local.templateQuery ?? '').trim().toLocaleLowerCase(language);
    const shown = all.filter((t) => !query || `${t.name} ${t.category}`.toLocaleLowerCase(language).includes(query));
    const pick = (t) => actions.setLocal({ templateId: t.id, template: null, templateDraft: null, previewText: null });
    const left = h(doc, 'div', { style: 'width: 320px; flex: none; border-right: 1px solid #e7e7e7; display: flex; flex-direction: column; min-height: 0;' },
      h(doc, 'div', { style: 'padding: 12px; border-bottom: 1px solid #ececec;' },
        h(doc, 'div', { class: 'search' }, icon(doc, ICONS.search),
          h(doc, 'input', { class: 'input', type: 'search', placeholder: ts('searchTemplates'), 'aria-label': ts('searchTemplates'), name: 'ma-template-search', value: local.templateQuery ?? '', oninput: (e) => actions.setLocal({ templateQuery: e.target.value }) }))),
      h(doc, 'div', { style: 'flex: 1 1 auto; overflow: auto;', 'data-role': 'ma-templates' }, shown.map((t) => h(doc, 'a', {
        class: t.id === draft?.id ? 'tp on' : 'tp', href: '#', 'data-template': t.id, onclick: (e) => { e.preventDefault(); pick(t); },
      }, h(doc, 'span', { class: 'col grow', style: 'gap: 2px; min-width: 0;' }, h(doc, 'span', { class: 'sm b trunc', text: t.name }), h(doc, 'span', { class: 'xs mute', text: t.category })),
      t.archived ? h(doc, 'span', { class: 'badge out', text: ts('archivedBadge') })
        : t.unknown.length ? h(doc, 'span', { class: 'badge warn', text: ts('missingVar') }) : h(doc, 'span', { class: 'badge ok', text: ts('valid') })))));
    if (!draft) return [h(doc, 'div', { class: 'card', style: 'flex: 1 1 auto; min-height: 0; display: flex;' }, left)];

    // Each field merges into the latest draft, so editing the name and then the text keeps both.
    const update = (patch) => { local.templateDraft = { ...(local.templateDraft?.id === draft.id ? local.templateDraft : draft), ...patch }; };
    const textArea = h(doc, 'textarea', { class: 'input', rows: '4', id: 'eat-ma-tpl-text', 'data-ma': 'template-text', oninput: (e) => update({ text: e.target.value }) }, draft.text);
    const used = [...new Set([...String(draft.text).matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]))];
    const unknown = used.filter((v) => !variables.includes(v));
    const groups = [...new Set(all.map((t) => t.category).filter(Boolean))];
    // Turkish needs no translation; another language is translated only when chosen.
    const previewLanguage = local.previewLanguage ?? 'tr';
    if (local.previewText == null && !local.previewLoading) {
      local.previewLoading = true;
      actions.previewTemplate(draft.text, previewLanguage).then(
        (text) => actions.setLocal({ previewText: text, previewLoading: false }),
        () => actions.setLocal({ previewText: '', previewError: true, previewLoading: false }));
    }
    const right = h(doc, 'div', { class: 'grow', style: 'padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; overflow: auto; min-width: 0;', 'data-role': 'ma-template-editor' },
      h(doc, 'div', { class: 'g2', style: 'gap: 16px;' },
        h(doc, 'label', { class: 'field' }, h(doc, 'span', { class: 'label', text: ts('name') }),
          h(doc, 'input', { class: 'input', type: 'text', value: draft.name, 'data-ma': 'template-name', oninput: (e) => update({ name: e.target.value }) })),
        h(doc, 'label', { class: 'field' }, h(doc, 'span', { class: 'label', text: ts('group') }),
          h(doc, 'input', { class: 'input', type: 'text', value: draft.category, list: 'eat-ma-groups', 'data-ma': 'template-group', oninput: (e) => update({ category: e.target.value }) }),
          h(doc, 'datalist', { id: 'eat-ma-groups' }, groups.map((g) => h(doc, 'option', { value: g }))))),
      h(doc, 'label', { class: 'field', for: 'eat-ma-tpl-text' }, h(doc, 'span', { class: 'label', text: ts('textTr') }), textArea),
      h(doc, 'div', { class: 'row', style: 'flex-wrap: wrap; gap: 6px;' },
        h(doc, 'span', { class: 'xs mute', style: 'margin-right: 4px;', text: ts('addVariable') }),
        variables.map((v) => h(doc, 'button', {
          class: 'var', type: 'button', 'data-variable': v, onclick: () => {
            const token = `{{${v}}}`;
            const start = textArea.selectionStart ?? textArea.value.length;
            textArea.setRangeText(token, start, textArea.selectionEnd ?? start, 'end');
            textArea.focus();
            update({ text: textArea.value });
          },
        }, `{{${v}}}`))),
      h(doc, 'div', { class: 'field' },
        h(doc, 'span', { class: 'label', id: 'eat-ma-preview-label', text: ts('previewBuyer') }),
        h(doc, 'div', { class: 'row', style: 'margin-bottom: 4px;' },
          segmented(doc, { labelledBy: 'eat-ma-preview-label', name: 'ma-preview', value: previewLanguage, options: PREVIEW_LANGUAGES.map((code) => ({ value: code, label: languageName(code, language) })),
            onChange: (code) => actions.setLocal({ previewLanguage: code, previewText: null, previewError: false }) }),
          h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', 'data-ma': 'preview-refresh', 'aria-label': ts('refresh'), onclick: () => actions.setLocal({ previewText: null, previewError: false }) }, icon(doc, ICONS.refresh, 14))),
        h(doc, 'div', { style: 'border: 1px solid #e7e7e7; border-radius: 8.4px; background: #fafafa; padding: 12px; white-space: pre-wrap;', class: 'sm', 'data-role': 'ma-preview', 'aria-live': 'polite' },
          local.previewText == null ? ts('previewLoading') : local.previewError ? ts('previewFailed') : local.previewText)),
      unknown.length
        ? banner(doc, { tone: 'warn', iconPaths: ICONS.alert, text: ts('checkBad', { list: unknown.map((v) => `{{${v}}}`).join(', ') }) })
        : banner(doc, { tone: 'ok', iconPaths: ICONS.check, text: used.length ? ts('checkOk', { n: used.length }) : ts('checkNone') }));
    const stored = all.find((t) => t.id === draft.id);
    return [
      h(doc, 'div', { class: 'card', style: 'flex: 1 1 auto; min-height: 0; display: flex;' }, left, right),
      h(doc, 'div', { class: 'savebar', 'data-role': 'ma-template-bar' },
        stored ? h(doc, 'button', { class: 'btn btn-g', type: 'button', style: stored.archived ? null : 'color: #b91c1c;', 'data-ma': 'template-archive', disabled: busy,
          onclick: () => actions.archiveTemplate(stored.id, !stored.archived) }, icon(doc, stored.archived ? ICONS.refresh : ICONS.trash, 16), ts(stored.archived ? 'unarchive' : 'archive')) : null,
        h(doc, 'span', { class: 'grow' }),
        h(doc, 'button', { class: 'btn btn-g', type: 'button', 'data-ma': 'template-cancel', onclick: () => actions.setLocal({ template: null, templateDraft: null, previewText: null }), text: ts('cancel') }),
        h(doc, 'button', { class: 'btn btn-p', type: 'button', 'data-ma': 'template-save', disabled: busy,
          onclick: async () => { const d = local.templateDraft ?? draft; if (await actions.saveTemplate({ ...d, id: stored ? d.id : '' })) actions.setLocal({ template: null, templateDraft: null, templateId: stored ? d.id : null }); }, text: ts('save') })),
    ];
  };

  // ---- Autopilot and reviews --------------------------------------------
  const automationTab = () => {
    const camp = view.campaign?.active ? view.campaign : null;
    const items = camp?.items ?? [];
    const done = items.filter((i) => i.status === 'sent' || i.status === 'skipped').length;
    const running = camp?.runMode === 'autopilot' && camp.runState === 'running';
    const templateName = (id) => view.templates.find((t) => t.id === id)?.name ?? '—';
    const autopilot = h(doc, 'section', { class: 'card', 'data-role': 'ma-autopilot' },
      h(doc, 'div', { class: 'card-h' },
        h(doc, 'div', { class: 'col grow', style: 'gap: 2px;' }, h(doc, 'h2', { class: 'h2', text: ts('autopilot') }),
          h(doc, 'span', { class: 'xs mute', text: camp ? ts(running ? 'apOn' : 'apPaused', { done, total: items.length }) : ts('apOff') })),
        camp ? (running
          ? h(doc, 'button', { class: 'btn btn-o btn-sm', type: 'button', 'data-ma': 'pause', disabled: busy, onclick: () => actions.campaignPause() }, icon(doc, ICONS.pause, 14), ts('pause'))
          : h(doc, 'button', { class: 'btn btn-p btn-sm', type: 'button', 'data-ma': 'resume', disabled: busy, onclick: (e) => confirmResume(e.currentTarget, items.length - done) }, icon(doc, ICONS.play, 14), ts('resume'))) : null),
      camp
        ? [h(doc, 'div', { class: 'card-b col', style: 'gap: 8px;' },
          h(doc, 'div', { class: 'row xs mute2' }, h(doc, 'span', { class: 'grow', text: ts('progress') }), h(doc, 'span', { class: 'num', text: `${done} / ${items.length}` })),
          h(doc, 'div', { class: 'prog' }, h(doc, 'i', { style: `width: ${items.length ? Math.round((done / items.length) * 1000) / 10 : 0}%;` }))),
        h(doc, 'table', { class: 'tbl tbl-tight' },
          h(doc, 'thead', {}, h(doc, 'tr', {}, [ts('colBuyer'), ts('colItem'), ts('colReply'), ts('colStatus'), ''].map((label, i) => h(doc, 'th', { class: i === 4 ? 'r' : null, text: label })))),
          h(doc, 'tbody', {}, items.map((item) => {
            const [label, tone] = STATUS[item.status] ?? STATUS.pending;
            const needsYou = item.status === 'error' || item.status === 'inserted' || item.status === 'sent_pending_verification';
            return h(doc, 'tr', { 'data-order': item.orderId, style: item.status === 'error' ? 'background: #fafafa;' : null },
              h(doc, 'td', { class: 'b', text: item.name }),
              h(doc, 'td', { class: 'mute2 trunc', style: 'max-width: 200px;', text: item.itemTitle || '—' }),
              h(doc, 'td', { text: templateName(item.templateId) }),
              h(doc, 'td', {}, h(doc, 'span', { class: tone ? `badge ${tone}` : 'badge' }, tone ? null : h(doc, 'span', { class: 'dot soft' }), ts(label))),
              h(doc, 'td', { class: 'r' }, item.status === 'sent' ? h(doc, 'span', { class: 'xs mute', text: ts('youApproved') })
                : needsYou && item.url ? h(doc, 'button', { class: item.status === 'inserted' ? 'btn btn-p btn-sm' : 'btn btn-o btn-sm', type: 'button', 'data-ma': 'open-item', onclick: () => actions.openConversation(item.url), text: ts('openConversation') }) : null));
          })))]
        : h(doc, 'div', { class: 'card-b col', style: 'gap: 12px;' },
          h(doc, 'p', { class: 'sm mute2', text: ts('apOffText') }),
          h(doc, 'div', { class: 'row' },
            h(doc, 'a', { class: 'btn btn-o btn-sm', href: 'https://www.etsy.com/your/orders/sold/completed', text: ts('openOrders') }),
            h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', 'data-ma': 'open-automation', onclick: () => actions.openPanel('orders'), text: ts('openAutomation') }))));
    const rules = h(doc, 'section', { class: 'card', 'data-role': 'ma-rules' },
      h(doc, 'div', { class: 'card-h' }, h(doc, 'h2', { class: 'h2', text: ts('rules') })),
      h(doc, 'div', { class: 'rg' },
        h(doc, 'div', {}, h(doc, 'span', { class: 'sm b', text: ts('rule1') }), h(doc, 'span', { class: 'xs mute', text: view.autoSend ? ts('rule1Off') : ts('rule1Text') }),
          view.autoSend ? null : h(doc, 'span', { class: 'badge out', style: 'align-self: flex-start;', text: ts('always') })),
        h(doc, 'div', {}, h(doc, 'span', { class: 'sm b', id: 'eat-ma-rule2', text: ts('rule2') }), h(doc, 'span', { class: 'xs mute', text: ts('rule2Text') }),
          toggle(doc, { name: 'ma-auto-advance', checked: view.autoAdvance, labelledBy: 'eat-ma-rule2', disabled: busy, onChange: (on) => actions.setAutoAdvance(on) })),
        h(doc, 'div', {}, h(doc, 'span', { class: 'sm b', text: ts('rule3') }), h(doc, 'span', { class: 'xs mute', text: ts('rule3Text') }),
          h(doc, 'span', { class: 'badge out', style: 'align-self: flex-start;', text: ts('always') }))));
    const reviewsOn = view.page === 'reviews';
    const reviews = h(doc, 'aside', { class: 'card', style: 'width: 400px; flex: none;', 'data-role': 'ma-reviews' },
      h(doc, 'div', { class: 'card-h' },
        h(doc, 'div', { class: 'col grow', style: 'gap: 2px;' }, h(doc, 'h2', { class: 'h2', text: ts('reviews') }),
          h(doc, 'span', { class: 'xs mute', text: reviewsOn ? ts('reviewsCount', { n: view.reviews.length }) : ts('reviewsElsewhere') })),
        reviewsOn ? h(doc, 'button', { class: 'ib', type: 'button', 'aria-label': ts('refresh'), 'data-ma': 'reviews-refresh', disabled: busy, onclick: () => actions.refreshReviews() }, icon(doc, ICONS.refresh)) : null),
      reviewsOn
        ? h(doc, 'div', { class: 'list' }, view.reviews.map((r) => h(doc, 'div', { class: 'col', style: 'padding: 14px 16px; gap: 8px;', 'data-review': r.id },
          h(doc, 'div', { class: 'row' }, h(doc, 'span', { class: 'sm b grow', text: r.name }), r.rating != null ? h(doc, 'span', { class: r.rating >= 4 ? 'badge out num' : 'badge warn num', text: ts('rating', { n: r.rating }) }) : null),
          r.text ? h(doc, 'p', { class: 'sm mute2', text: `“${r.text}”` }) : null,
          r.reply ? h(doc, 'div', { style: 'border: 1px solid #e7e7e7; border-radius: 8.4px; background: #fafafa; padding: 10px 12px;', class: 'sm', text: r.reply }) : null,
          h(doc, 'div', { class: 'row' },
            r.risk && r.risk !== 'low' ? h(doc, 'span', { class: 'badge warn', text: ts('checkRisk', { risk: r.risk }) }) : null,
            h(doc, 'span', { class: 'grow' }),
            h(doc, 'button', { class: 'btn btn-g btn-sm', type: 'button', 'data-ma': 'review-draft', disabled: busy || !view.ai.hasKey, onclick: () => actions.reviewDraft(r.id), text: r.reply ? ts('regenerate') : ts('reviewDraft') }),
            r.reply ? h(doc, 'button', { class: 'btn btn-o btn-sm', type: 'button', 'data-ma': 'review-copy', disabled: busy, onclick: () => actions.reviewCopy(r.id), text: ts('copyDraft') }) : null))))
        : h(doc, 'div', { class: 'card-b' }, h(doc, 'a', { class: 'btn btn-o btn-sm', href: 'https://www.etsy.com/your/shops/me/dashboard/activity', text: ts('openReviews') })));
    return [h(doc, 'div', { style: 'display: flex; gap: 16px; align-items: flex-start;' }, h(doc, 'div', { class: 'col grow', style: 'gap: 16px; min-width: 0;' }, autopilot, rules), reviews)];
  };

  function confirmResume(returnFocus, remaining) {
    openDialog(doc, container, {
      title: ts('confirmTitle', { n: remaining }), description: ts('confirmText'), closeLabel: ts('close'), returnFocus, width: 520,
      body: h(doc, 'div', { class: 'col', style: 'gap: 10px;' }, ['confirm1', 'confirm2', 'confirm3'].map((key) => h(doc, 'span', { class: 'row sm', style: 'gap: 8px;' }, icon(doc, ICONS.check, 16), ts(key)))),
      footer: (close) => [
        h(doc, 'button', { class: 'btn btn-g', type: 'button', onclick: close, text: ts('cancel') }),
        h(doc, 'button', { class: 'btn btn-p', type: 'button', 'data-ma': 'confirm-resume', onclick: () => { close(); void actions.campaignResume(); }, text: ts('startAutopilot') }),
      ],
    });
  }

  const heads = {
    inbox: pageHead(doc, { overline: 'MESSAGE ASSISTANT', title: ts('inbox'), description: ts('inboxText'), actions: [
      servicesBadge(doc, ts, view),
      h(doc, 'button', { class: 'btn btn-o', type: 'button', 'data-ma': 'start-autopilot', onclick: () => onTab('automation'), text: ts('startAutopilot') }),
      h(doc, 'button', { class: 'btn btn-o', type: 'button', 'data-ma': 'refresh', disabled: busy, onclick: () => actions.refresh() }, icon(doc, ICONS.refresh, 16), ts('refresh'))] }),
    templates: pageHead(doc, { overline: 'MESSAGE ASSISTANT', title: ts('templates'), description: ts('templatesText'), actions: [
      h(doc, 'button', { class: 'btn btn-p', type: 'button', 'data-ma': 'template-new', onclick: () => actions.setLocal({ template: { id: '', name: ts('untitled'), category: '', text: '', unknown: [] }, templateDraft: null, previewText: null }) }, icon(doc, ICONS.plus, 16), ts('newTemplate'))] }),
    automation: pageHead(doc, { overline: 'MESSAGE ASSISTANT', title: ts('automation'), description: ts('automationText') }),
  };
  const body = current === 'templates' ? templatesTab() : current === 'automation' ? automationTab() : inbox();
  return h(doc, 'div', { style: 'display: contents;', 'data-role': 'ma-page', 'data-ma-tab': current }, heads[current], tabs, ...body);
}
