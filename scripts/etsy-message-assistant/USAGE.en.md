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

> **Privacy warning:** Google Translate is the default provider and automatic Turkish preview is enabled by default. Opening a conversation may send the latest customer message to Google Translate. If DeepL fails while **Ücretsiz fallback (Free fallback)** is enabled, translation may fall back to Google. The delivered-order queue may also send the latest message to the selected translation provider to determine the target language even when automatic preview is off. Review the provider, automatic-preview, and fallback settings in **Makaytron Ayarları (Makaytron Settings)** before opening messages or a queue if you do not want these transfers.

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
2. Select only eligible cards that Etsy actually marks as `Delivered`.
3. Choose the template and method, then review the preview.
4. Select **Seçilenlere Mesaj Hazırla (Prepare Messages for Selected)**.
5. With **Otomatik Gönderim (Automatic Sending)** off—the default—the script opens the next conversation and inserts one message. Review it and click Etsy **Send** yourself.
6. After the sent bubble is verified, the default-on **Doğrulama Sonrası Sıradaki (Next After Verification)** setting advances automatically. If you turned it off, use **Sırayı Devam Ettir (Resume Queue)** on the orders page. Use **Atla ve Sonraki (Skip and Next)** or **Durdur (Stop)** when needed.

> **Live-send warning:** If you explicitly enable **Otomatik Gönderim (Automatic Sending)**, the script may click Etsy **Send** automatically. This option is live-send authority. An unverified send stays pending; it is never resent blindly and requires **Gönderildi (Sent) / Gönderilmedi (Not Sent)** reconciliation.

## Review reply draft

1. Open the **Reviews** filter and review cards in Shop Manager dashboard.
2. Use **TR Gör (Show in Turkish)** on the relevant card.
3. Select **AI Analiz ve Taslak Hazırla (Analyze and Draft with AI)**.
4. You may copy the private note and use **Etsy Alanına Aktar (Insert into Etsy)** for the public reply field.
5. Review the public reply and use Etsy's own publish control yourself.

Review replies are never published automatically.

## Templates, API keys, and backup

- Manage templates in **Şablonlar (Templates)** and insert them through **Insert Saved Template**.
- Values such as `/tesekkur` and `/teslim` are template metadata; typed slash commands are not executed automatically.
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
