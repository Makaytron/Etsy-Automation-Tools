# Makaytron Etsy Message Assistant usage guide

<p><a href="./USAGE.md">Türkçe</a> · <strong>English</strong></p>

Message Assistant supports three distinct workflows: translation/drafting in an individual Etsy conversation, explicitly authorized Otopilot for delivered orders, and reply drafting for shop reviews. Each workflow has its own page and send boundary.

## Page, tab, and action map

| Etsy context | Panel tab | Available action |
|---|---|---|
| `/messages` or `/messages/all` conversation list | **Messages** | A safe list read from Etsy's DOM with name/preview/unread details, display-language control, and a validated **Open** action; draft and insert controls stay hidden. |
| `/messages/<conversation-id>` with exactly one trusted composer | **Messages** | Preview/translate, Turkish draft, AI, templates, copy, and **Insert into Etsy** for that composer only. |
| `/your/orders/sold/completed` | **Otomasyon (Automation)** | Scan Delivered cards, record review eligibility, select recipients, and explicitly start one-at-a-time Otopilot. |
| New, open, or another `/your/orders/sold*` view | **Automation** | No production controls; links to **Completed Orders**. |
| `/your/shops/<shop>/dashboard/activity` with the **Reviews** filter | **Reviews** | Scan new/updated text reviews, translate/analyse, and insert a draft into the public reply field. |
| `/dashboard/activity` with another activity filter | **Reviews** | No production controls; guidance to select the **Reviews** filter. |
| Another or unsupported Shop Manager page | **No direct workflow** | Safe links to Messages, Completed Orders, and Recent activity. |
| Every supported Etsy page | **Templates / History / Settings** | Context-independent local management; the selected utility tab and unsaved draft survive Etsy route changes. |

The script fails closed when it cannot verify one visible conversation composer, the Completed Orders view, or a review card. The panel is closed by default and opens only when the user asks. If **Open Automatically on Message Page** is explicitly enabled, it still applies only to a verified single-conversation composer.

The simplified premium panel separates **Messages / Automation / Reviews** workspaces from **Templates / History / Settings** utilities. Automation presents one primary action, durable campaign status and progress, and responsive recipient cards. This visual simplification does not remove identity, durable-state, verification, or explicit-authorization boundaries.

The conversation list reads only safe links currently visible in Etsy's page and displays at most 50 rows. The **Display language** choice is persisted. Translated text is shown only inside the panel; Etsy's DOM is not changed, and the source preview remains available under **Show original message**. If DeepL does not support the selected target, the panel says so explicitly and uses Google only when **Free fallback** is enabled.

## Install and initial setup

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the [Message Assistant userscript](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js) and approve installation.
3. Open **Makaytron Ayarları (Makaytron Settings)** from the Tampermonkey menu.
4. Choose a translation engine. If needed, save and test your DeepL or AI provider, model, and API key.
5. Configure templates, signature, and reply preferences.

> **Privacy warning:** The panel is closed by default on message pages. Google Translate is the default provider and automatic Turkish preview is enabled by default. When the panel opens on the conversation list, it may send up to 50 visible preview texts to the selected translation provider, with no more than three concurrent requests; cached results are used first. Opening the list makes no translation requests when automatic preview is disabled. Changing **Display language** or selecting **Translate previews / Retry** explicitly starts translation of the visible previews. In an individual conversation, opening the panel through **Assistant · Open** or explicitly enabling **Open Automatically on Message Page** may send the latest customer message to the provider. If DeepL fails while **Free fallback** is enabled, translation may fall back to Google. Other, non-review delivered-order templates may also send the latest message to the selected translation provider to determine the target language even when automatic preview is off. The dedicated review-request template skips that language-detection transfer; choosing AI drafting can still send the context described below. Review the provider, automatic-preview, and fallback settings in **Makaytron Ayarları (Makaytron Settings)** before opening the panel or a queue if you do not want these transfers.

An AI drafting or polishing request may send the customer name, conversation and order IDs, item title, shop name/signature, up to the last 10 messages, and the draft, template, or instruction to the selected AI provider. Review that provider's privacy and retention terms.

## Individual customer reply

1. Open the correct Etsy conversation.
2. Open the panel from the top-right **Assistant · Open** control. The compact control remains on the page; the panel does not appear in the middle of the page by itself.
3. Read **Müşterinin Mesajı (Customer Message)** and, when needed, **Türkçe Göster (Show in Turkish)**.
4. Write your Turkish response or choose a template from **Hazır mesaj ekle… (Insert Saved Template)**.
5. Choose the appropriate action:
   - **Sadece Çevir (Translate Only):** translates your draft into the customer's language.
   - **AI ile Düzenle (Polish with AI):** improves the existing draft with the selected AI provider.
   - **AI Cevap Önersin (Suggest an AI Reply):** creates a new draft from the conversation context.
6. Read and edit **Gönderilecek Mesaj (Message to Send)**; regenerate or copy it if needed.
7. Select **Etsy'ye Aktar (Insert into Etsy)**.
8. Recheck the text in Etsy's composer and click Etsy's own **Send** button yourself.

In the normal individual workflow, **Insert into Etsy** fills the composer only; it does not send. If the conversation identity changes after drafting, the stale draft is rejected.

## Explicit Otopilot for delivered orders

1. Open **Completed Orders → Otomasyon (Automation)**.
2. When Automation refreshes, a strict same-origin `/shop/<shop>/reviews/<numeric>` permalink inside the Completed Orders row is definitive positive evidence only when its visible label is exactly **Review** or **Yorum**; that order is durably blocked as `review_exists`. The absence of this link does not mean no review. For every remaining order, set **Yorum Kontrolü (Review Check)** manually. **Yorum yok — kuyruğa uygun (No review — queue eligible)** selects that order and remains valid for two hours. **Review exists**, **Defer**, and **Do not contact / order issue** block review outreach.
3. Choose the default English-language **Yorum rica — küçük işletme (EN)** preset and inspect the preview. It requests an honest review without asking for a particular rating, a positive review, or an incentive. **Onaylıları Seç (Select Confirmed)** selects only fresh, confirmed eligible orders.
4. Select recipients and inspect the exact selected count, template, and method in the Automation summary. A known-positive order cannot be selected or queued. Selection is not live-send authority. A second `review_request` cannot be queued while the same order and purpose is queued, prepared, pending verification, suspicious, or verified sent.
5. Explicitly select **Otopilotu Başlat (Start Otopilot)** to authorize only this new campaign. The pre-start UI refresh reapplies known positives; if evidence appears while an order is queued or prepared, the send-time eligibility guard stops it before Etsy dispatch. This is not a permanent/global auto-send preference; every later campaign requires a fresh opt-in.
6. Otopilot processes recipients strictly one at a time. It durably records the next reservation and draft, verifies the exact order, buyer, conversation, and text, then dispatches. It cannot open or send to the next recipient until the new outgoing bubble is verified and terminal `sent` state is durable.
7. A `pending`, suspicious, timed-out, or identity/text/scope mismatch stops Otopilot and never triggers an automatic resend. Inspect the latest bubble in the exact conversation, then use **Gönderildi / Gönderilmedi (Sent / Not Sent)** only for the observed outcome. **Not Sent** does not click again by itself; retry or **Devam Et (Resume)** is a separate user decision.
8. **Duraklat (Pause)** lets an already-started verification finish safely but prevents the next recipient from starting; **Resume** continues from the same durable queue. **Bu Alıcıyı Atla (Skip This Recipient)** terminalizes only the current recipient. **Otomasyonu Bitir / Durdur (Stop)** ends the remaining unsent queue; an unresolved pending result must be reconciled first.

> **Live-send warning:** The legacy/global **Otomatik Gönderim (Automatic Sending)** setting is not authority for a new Otopilot campaign or for `review_request`. Review outreach requires a fresh eligibility decision for every order plus a separate **Start Otopilot** opt-in for the selected campaign. After opt-in, recipients are still processed only one at a time with durable state and outgoing verification.

> **Unofficial-integration warning:** This userscript is not approved by Etsy. Etsy's [API Terms](https://www.etsy.com/legal/api/) require express written authorization for automated systems or browser extensions that access, analyse, or scrape Etsy data. The explicit campaign opt-in is a safety boundary, not proof of Etsy authorization.

> **Automatic positive-evidence boundary:** The script accepts only a strict same-origin `/shop/<shop>/reviews/<numeric>` permalink inside that Completed Orders row, with a visible label exactly equal to **Review** or **Yorum**, as automatic `review_exists` evidence. It does not match by buyer name, item title, dashboard review card, or public-shop HTML. A missing link is not automatic eligibility: you make the **No review** decision, and **Select Confirmed** uses only fresh two-hour manual decisions. If definitive evidence appears for a queued or prepared item, the send-time eligibility guard blocks Etsy dispatch.

> **Upgrade safeguard:** If an older `sent` record cannot prove whether the previous message was a review request, the control shows an ambiguous state and keeps the order blocked. Inspect the Etsy conversation and choose **Önceki mesaj yorum talebi değildi — onayla (The previous message was not a review request — confirm)** only when that is true; leave the order blocked if you cannot verify it.

## Central Message Panel agent safety

- The agent accepts a job only when its declared conversation ID exactly matches its canonical URL. Reusing a job ID with different text or a different conversation stops before any Etsy composer access.
- Message Center defers when an active delivery campaign owns the same conversation, so the two workflows cannot race for Etsy's Send control.
- If the composer contains any user draft—even text identical to the agent job—Message Center leaves it untouched and does not send.
- The agent cannot advance past a safety stage until the exact SHA-256 send ledger and terminal result envelope are durable. If the server response is lost, it retries only the same result envelope and never clicks Etsy again.
- A verified native Etsy send keeps a durable cross-tab hold until local status/history finalization finishes. When an exact trusted native receipt exists, Message Center claims that evidence and does not send a duplicate.
- Unknown, malformed, or future send stages are never cleared automatically; they become a global manual-review hold across every send path.
- Etsy Send clicks, form submissions, and Ctrl/Command+Enter use the same guarded dispatch path. A different submit control in the same form is never converted into Send.
- If a new outgoing bubble cannot be verified conclusively, the job remains durably fenced as `ambiguous` and is never clicked again automatically. Open the matching conversation, inspect Etsy's latest bubble, and use **Settings → Central Message Panel Agent → Sent / Not Sent** only after you know the real outcome.
- Never resend while the outcome is uncertain. Reconciliation controls remain disabled until both the URL and the hydrated DOM conversation identity match the fenced job.

## Review reply draft

1. Open the **Reviews** filter and review cards in Shop Manager dashboard.
2. Use **TR Gör (Show in Turkish)** on the relevant card.
3. Select **AI Analiz ve Taslak Hazırla (Analyze and Draft with AI)**.
4. You may copy the private note and use **Etsy Alanına Aktar (Insert into Etsy)** for the public reply field.
5. Review the public reply and use Etsy's own publish control yourself.

Review replies are never published automatically.

## Templates, API keys, and backup

- Manage templates in **Şablonlar (Templates)** and insert them through **Insert Saved Template**.
- Values such as `/tesekkur`, `/teslim`, and `/yorumrica` are template metadata; typed slash commands are not executed automatically.
- API keys stay in Tampermonkey local storage. Use a dedicated provider key and a spending limit.
- Treat configuration backups as sensitive and inspect them before sharing. Depending on provider settings and script version, a backup may contain API keys, including a DeepL key; remove them before sharing.
- Message Assistant has no global keyboard shortcut. Open assistant, settings, config backup, and update check are available in the Tampermonkey menu.
- Limited pseudonymous usage telemetry is enabled by default with a visible first-use notice. Turning it off in Settings requests deletion of this userscript's server-side record; see [Privacy](../../PRIVACY.en.md).

## If something goes wrong

- If the wrong conversation or customer is detected, do not insert the draft; reopen the correct conversation and regenerate it.
- Always verify the recipient and Etsy composer after insertion.
- Do not restart an unverified Otopilot item. First inspect the exact conversation for the outgoing bubble; suspicious or `pending` state must never produce an automatic resend.
- Update installation is blocked while a message campaign is active.
- Never include customer messages, names, order IDs, API keys, cookies, or session data in an issue or screenshot.

[Package README](./README.en.md) · [Changelog](./CHANGELOG.md) · [Privacy](../../PRIVACY.en.md) · [Support](../../SUPPORT.en.md)
