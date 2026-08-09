# Makaytron Etsy Message Assistant

<p><a href="./README.md">Türkçe</a> · <strong>English</strong></p>

Version: `1.0.3`

**Usage guide:** [English](./USAGE.en.md) · [Türkçe](./USAGE.md)

A Tampermonkey side panel for reading Etsy messages with Turkish previews, preparing controlled replies, managing templates, and using AI providers configured by the user.

The script is standalone and does not require another Etsy Automation Tools package.

## Install

1. Install Tampermonkey.
2. Open the [userscript file](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js).
3. Review all permissions and confirm installation.

## Safety and privacy

- Automatic sending is off by default. Review every draft before clicking Etsy's send button.
- Google Translate is the default provider and automatic Turkish preview is enabled by default. Opening a message page may automatically send the latest customer message to Google Translate; disable this option from Makaytron settings in the Tampermonkey menu before visiting messages if you do not want that transfer.
- Other translation and AI actions send relevant message context to DeepL, OpenAI, Anthropic, Gemini, DeepSeek, or OpenRouter when the user invokes those configured features.
- API keys and history are stored locally in Tampermonkey. History defaults to 90 days and at most 500 records.
- Configuration exports exclude API keys unless the user explicitly opts in.
- Canonical GitHub installations check the userscript version no more than once per 24 hours; another distributor remains responsible for its own update path.
- The update installation page opens only after a user action and only when no message campaign is active. Tampermonkey retains final approval.
- Pseudonymous telemetry is on by default with a visible first-use notice and a one-click Settings opt-out that requests deletion of this userscript's server-side record. Only daily open, successful draft/translation, and categorized-error counters are sent. Raw error text, message/generated text, customer/order/conversation IDs, URLs, and API keys are excluded.

Read the repository [Privacy](../../PRIVACY.en.md), [Security](../../SECURITY.en.md), and [Support](../../SUPPORT.en.md) documents.

## License

MIT
