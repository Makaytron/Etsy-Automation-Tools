# Makaytron Etsy Message Assistant

<p><a href="./README.md">Türkçe</a> · <strong>English</strong></p>

Version: `1.2.6`

**Usage guide:** [English](./USAGE.en.md) · [Türkçe](./USAGE.md)

A Tampermonkey side panel for reading Etsy messages with Turkish previews, preparing controlled replies, managing templates, and running explicitly authorized, verified Otopilot campaigns with user-configured AI providers.

It includes an English-language, pressure-free, incentive-free honest-review request preset for delivered orders whose buyers the seller has confirmed have not yet reviewed, written in a new/small-business voice.

Review outreach uses a persistent per-order eligibility decision and purpose-based deduplication. Every new campaign requires a visible **Otopilotu Başlat (Start Otopilot)** opt-in. Otopilot processes exactly one recipient at a time and cannot advance until the current send state is durable and Etsy's new outgoing bubble is verified.

When Etsy adds a numeric conversation permalink to a delivered-order drawer after sending, the generic composer scope remains fail-closed. Verification can complete only from the pre-send captured order scope when one informational history link, one canonical numeric permalink, and a new matching outgoing bubble are all present. A manually confirmed sent result also records the conversation ledger and one idempotent verification-history event.

The script is standalone and does not require another Etsy Automation Tools package.

## Install

1. Install Tampermonkey.
2. Open the [userscript file](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js).
3. Review all permissions and confirm installation.
4. Open the panel from the compact **Assistant · Open** control at the top right.

## Safety and privacy

- The simplified premium panel separates primary work from utilities, presents one primary campaign action, shows durable progress, and replaces the dense delivered-orders table with responsive recipient cards.
- Selecting recipients or preparing a queue does not authorize a live send. Every new campaign requires a separate, explicit **Start Otopilot** action while its recipients and template are visible.
- Otopilot processes recipients strictly one at a time. It writes durable campaign/send state and verifies the matching outgoing Etsy bubble before opening or sending to the next recipient.
- A `pending`, suspicious, identity/text/scope mismatch, or inconclusive result stops Otopilot. It never automatically resends an uncertain item.
- **Duraklat (Pause)** prevents the next recipient from starting after any in-flight verification is safely resolved. **Otomasyonu Bitir / Durdur (Stop)** ends the remaining unsent queue; a pending result must be reconciled first.
- The legacy/global automatic-send setting is not authorization for a new Otopilot campaign and never grants review-request authority. Review outreach still requires a fresh per-order eligibility decision plus the campaign-level Otopilot opt-in.
- The panel is closed by default on message pages. It opens only from the **Open** control unless the user explicitly enables **Open Automatically on Message Page**.
- Conversation lists, individual conversations, Completed Orders, and Recent activity/Reviews are validated as separate contexts; drafting, queue, and insert controls stay hidden on the wrong page.
- On conversation-list pages, the panel shows Etsy's visible conversations with a Turkish-default quick display-language selector, translated previews with preserved source text, and safe conversation navigation.
- In an individual conversation, translations in the selected display language appear directly below up to the latest 40 customer and seller messages without changing their source bubbles. Explicit **Customer message / Your message** labels, distinct colors, and opposing alignment distinguish the two sides. Sources detected as already matching the target get no redundant note.
- AI replies use real paragraph breaks. Quick suggest/polish/translate and **Müşteriye Gönder (Send to Customer)** controls sit beside Etsy's reply composer and work without opening the panel. Both surfaces use the same shared actions; verified sending revalidates the conversation, exact composer text, single composer, ownership locks, and Etsy Send control, dispatches once, and consumes the draft after matching outgoing-bubble verification.
- This is an unofficial userscript, not an Etsy-approved integration. Etsy's [API Terms](https://www.etsy.com/legal/api/) state that automated systems or browser extensions accessing, analysing, or scraping Etsy data require Etsy's express written authorization; an explicit Otopilot opt-in does not itself grant that authorization.
- A strict same-origin `/shop/<shop>/reviews/<numeric>` permalink inside the Completed Orders row is accepted as definitive positive evidence only when its visible label is exactly **Review** or **Yorum**. The order is durably blocked as `review_exists`; the script does not cross-match buyer names, item titles, dashboard review cards, or public-shop HTML.
- The absence of that permalink is not evidence of no review and never makes an order automatically eligible. Remaining orders require a manual **No review** confirmation, which expires after two hours.
- Automation refreshes Completed Orders before **Start Otopilot**, so a known positive cannot enter the queue. If positive evidence appears after an order was queued or prepared, the send-time eligibility guard blocks it before any Etsy dispatch.
- When an older generic `sent` record cannot prove whether the prior message was a review request, the order remains blocked as ambiguous. Check the Etsy conversation before selecting **Önceki mesaj yorum talebi değildi — onayla (The previous message was not a review request — confirm)**; leave it blocked if you cannot verify that statement.
- Google Translate is the default provider and automatic translation preview is enabled by default. Visiting an individual conversation may therefore send up to the latest 40 customer and seller messages to the selected provider even while the panel is closed. Opening the panel on a conversation list may translate up to 50 visible previews. Disable automatic preview from Makaytron settings before opening a conversation if you do not want that transfer.
- Other translation and AI actions send relevant message context to DeepL, OpenAI, Anthropic, Gemini, DeepSeek, or OpenRouter when the user invokes those configured features.
- API keys and history are stored locally in Tampermonkey. History defaults to 90 days and at most 500 records.
- Configuration exports exclude API keys unless the user explicitly opts in.
- Settings and provider fields stay as drafts until **Save**; exporting a config or testing a connection does not silently change runtime settings.
- Stored API and agent secrets are never rendered into panel markup; they remain in local storage until a replacement or explicit draft deletion is saved.
- Canonical GitHub installations check the userscript version no more than once per 24 hours; another distributor remains responsible for its own update path.
- The update installation page opens only after a user action and only when no message campaign is active. Tampermonkey retains final approval.
- Pseudonymous telemetry is on by default with a visible first-use notice and a one-click Settings opt-out that requests deletion of this userscript's server-side record. Only daily open, successful draft/translation, and categorized-error counters are sent. Raw error text, message/generated text, customer/order/conversation IDs, URLs, and API keys are excluded.

Read the repository [Privacy](../../PRIVACY.en.md), [Security](../../SECURITY.en.md), and [Support](../../SUPPORT.en.md) documents.

## License

MIT
