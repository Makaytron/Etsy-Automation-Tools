# Makaytron Etsy Message Assistant

<p><a href="./README.md">Türkçe</a> · <strong>English</strong></p>

Version: `1.2.0`

**Usage guide:** [English](./USAGE.en.md) · [Türkçe](./USAGE.md)

A Tampermonkey side panel for reading Etsy messages with Turkish previews, preparing controlled replies, managing templates, and using AI providers configured by the user.

It includes an English-language, pressure-free, incentive-free honest-review request preset for delivered orders whose buyers the seller has confirmed have not yet reviewed, written in a new/small-business voice.

Review outreach uses a persistent per-order eligibility decision and purpose-based deduplication. The script prepares the composer; **Send and Go to Next** sends only after the user's click, verifies the outgoing bubble, and advances only after verification.

The script is standalone and does not require another Etsy Automation Tools package.

## Install

1. Install Tampermonkey.
2. Open the [userscript file](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js).
3. Review all permissions and confirm installation.
4. Open the panel from the compact **Assistant · Open** control at the top right.

## Safety and privacy

- Automatic sending is off by default. Review requests ignore the global auto-send option and always require a per-recipient **Send and Go to Next** click.
- The panel is closed by default on message pages. It opens only from the **Open** control unless the user explicitly enables **Open Automatically on Message Page**.
- Conversation lists, individual conversations, Completed Orders, and Recent activity/Reviews are validated as separate contexts; drafting, queue, and insert controls stay hidden on the wrong page.
- On conversation-list pages, the panel shows Etsy's visible conversations with a Turkish-default quick display-language selector, translated previews with preserved source text, and safe conversation navigation.
- This is an unofficial userscript, not an Etsy-approved integration. Etsy's [API Terms](https://www.etsy.com/legal/api/) state that automated systems or browser extensions accessing, analysing, or scraping Etsy data require Etsy's express written authorization; keeping the final click manual does not by itself grant that authorization.
- Etsy's completed-order card does not provide the script with a reliable order-to-review match. Confirm that the buyer has not already reviewed before selecting a review-request recipient; that local confirmation expires after two hours.
- When an older generic `sent` record cannot prove whether the prior message was a review request, the order remains blocked as ambiguous. Check the Etsy conversation before selecting **Önceki mesaj yorum talebi değildi — onayla (The previous message was not a review request — confirm)**; leave it blocked if you cannot verify that statement.
- Google Translate is the default provider and automatic translation preview is enabled by default. Opening the panel on a conversation list may send its visible message previews to the selected translation provider; opening it in one conversation may send the latest customer message. Changing the quick display language retranslates the visible list previews. Keep the panel closed or disable automatic preview from Makaytron settings before opening it if you do not want that transfer.
- Other translation and AI actions send relevant message context to DeepL, OpenAI, Anthropic, Gemini, DeepSeek, or OpenRouter when the user invokes those configured features.
- API keys and history are stored locally in Tampermonkey. History defaults to 90 days and at most 500 records.
- Configuration exports exclude API keys unless the user explicitly opts in.
- Settings and provider fields stay as drafts until **Save**; exporting a config or testing a connection does not silently change runtime settings.
- Canonical GitHub installations check the userscript version no more than once per 24 hours; another distributor remains responsible for its own update path.
- The update installation page opens only after a user action and only when no message campaign is active. Tampermonkey retains final approval.
- Pseudonymous telemetry is on by default with a visible first-use notice and a one-click Settings opt-out that requests deletion of this userscript's server-side record. Only daily open, successful draft/translation, and categorized-error counters are sent. Raw error text, message/generated text, customer/order/conversation IDs, URLs, and API keys are excluded.

Read the repository [Privacy](../../PRIVACY.en.md), [Security](../../SECURITY.en.md), and [Support](../../SUPPORT.en.md) documents.

## License

MIT
