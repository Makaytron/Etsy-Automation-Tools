# Makaytron Etsy Message Assistant usage guide

<p><a href="./USAGE.md">Türkçe</a> · <strong>English</strong></p>

Message Assistant supports three distinct workflows: translation/drafting in an individual Etsy conversation, a controlled queue for delivered orders, and reply drafting for shop reviews. Each workflow has its own page and send boundary.

## Supported pages

| Workflow | Etsy page |
|---|---|
| Individual customer reply | `/messages*` or `/conversations*` |
| Delivered-order messaging | `/your/orders/sold*` |
| Review analysis and reply draft | Shop Manager dashboard with the **Reviews** view open |

The script waits safely in an unverified dashboard context and does not send anything until the expected page is available.

## Install and initial setup

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the [Message Assistant userscript](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js) and approve installation.
3. Open **Makaytron Ayarları (Makaytron Settings)** from the Tampermonkey menu.
4. Choose a translation engine. If needed, save and test your DeepL or AI provider, model, and API key.
5. Configure templates, signature, and reply preferences.

> **Privacy warning:** Google Translate is the default provider and automatic Turkish preview is enabled by default. Opening a conversation may send the latest customer message to Google Translate. If DeepL fails while **Ücretsiz fallback (Free fallback)** is enabled, translation may fall back to Google. Other, non-review delivered-order templates may also send the latest message to the selected translation provider to determine the target language even when automatic preview is off. The dedicated review-request template skips that language-detection transfer; choosing AI drafting can still send the context described below. Review the provider, automatic-preview, and fallback settings in **Makaytron Ayarları (Makaytron Settings)** before opening messages or a queue if you do not want these transfers.

An AI drafting or polishing request may send the customer name, conversation and order IDs, item title, shop name/signature, up to the last 10 messages, and the draft, template, or instruction to the selected AI provider. Review that provider's privacy and retention terms.

## Individual customer reply

1. Open the correct Etsy conversation.
2. Read **Müşterinin Mesajı (Customer Message)** and, when needed, **Türkçe Göster (Show in Turkish)**.
3. Write your Turkish response or choose a template from **Hazır mesaj ekle… (Insert Saved Template)**.
4. Choose the appropriate action:
   - **Sadece Çevir (Translate Only):** translates your draft into the customer's language.
   - **AI ile Düzenle (Polish with AI):** improves the existing draft with the selected AI provider.
   - **AI Cevap Önersin (Suggest an AI Reply):** creates a new draft from the conversation context.
5. Read and edit **Gönderilecek Mesaj (Message to Send)**; regenerate or copy it if needed.
6. Select **Etsy'ye Aktar (Insert into Etsy)**.
7. Recheck the text in Etsy's composer and click Etsy's own **Send** button yourself.

In the normal individual workflow, **Insert into Etsy** fills the composer only; it does not send. If the conversation identity changes after drafting, the stale draft is rejected.

## Delivered-order message queue

1. Open **Completed Orders → Teslim Edilenler (Delivered Orders)**.
2. Set **Yorum Kontrolü (Review Check)** for each order. **Yorum yok — kuyruğa uygun (No review — queue eligible)** selects that order and remains valid for two hours. **Review exists**, **Defer**, and **Do not contact / order issue** block review outreach.
3. Choose the default English-language **Yorum rica — küçük işletme (EN)** preset and inspect the preview. It requests an honest review without asking for a particular rating, a positive review, or an incentive. **Onaylıları Seç (Select Confirmed)** selects only fresh, confirmed eligible orders.
4. Select **Seçilenlere Mesaj Hazırla (Prepare Messages for Selected)**. A second `review_request` cannot be queued while that order and purpose is already queued, prepared, pending verification, ambiguous, or verified sent.
5. The script opens the next conversation and completely fills the Etsy composer. Review or edit the text in Etsy, then click the panel's **Gönder ve Sonrakine Geç (Send and Go to Next)** button once.
6. That explicit user click triggers Etsy **Send**. The queue advances only after a new outgoing bubble is verified. An uncertain result stays in place and requires **Gönderildi / Gönderilmedi (Sent / Not Sent)** reconciliation. **Not Sent** safely returns the draft for a fresh attempt while preserving any newer eligibility decision. Use **Atla ve Sonraki (Skip and Next)** or **Durdur (Stop)** when needed.

> **Live-send warning:** Global **Otomatik Gönderim (Automatic Sending)** remains live-send authority for other delivery templates. It is ignored for `review_request`; each review request starts only from your **Send and Go to Next** click.

> **Unofficial-integration warning:** This userscript is not approved by Etsy. Etsy's [API Terms](https://www.etsy.com/legal/api/) require express written authorization for automated systems or browser extensions that access, analyse, or scrape Etsy data. The manual per-recipient click is a safety boundary, not proof of Etsy authorization.

> **Review-status limitation:** The Etsy Completed Orders card does not expose an order-to-review identifier that this script can match reliably. You make the **No review** decision; **Select Confirmed** uses only fresh local decisions. The script does not guess by buyer name or item title.

> **Upgrade safeguard:** If an older `sent` record cannot prove whether the previous message was a review request, the control shows an ambiguous state and keeps the order blocked. Inspect the Etsy conversation and choose **Önceki mesaj yorum talebi değildi — onayla (The previous message was not a review request — confirm)** only when that is true; leave the order blocked if you cannot verify it.

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
- Before retrying an unverified queue item, look for the sent message bubble in the conversation.
- Update installation is blocked while a message campaign is active.
- Never include customer messages, names, order IDs, API keys, cookies, or session data in an issue or screenshot.

[Package README](./README.en.md) · [Changelog](./CHANGELOG.md) · [Privacy](../../PRIVACY.en.md) · [Support](../../SUPPORT.en.md)
