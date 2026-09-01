# Behavioral UI Contract — Makaytron Etsy Message Assistant

Baseline version: **1.2.7**
Source: `scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js`

## Mount/isolation

- Main application uses **closed Shadow DOM**.
- Shadow CSS uses `:host` isolation and the `ma-` component family.
- Event routing relies heavily on `data-action` and related data attributes.
- There is also narrowly scoped global Etsy integration CSS (`mema-` family) for badges, notifications, inline translations and composer actions.

## Existing style layers

- base `CSS`
- `LAUNCHER_CSS`
- `UX_CSS`
- `PREMIUM_CSS`
- `GLOBAL_CSS`

Do not collapse/refactor these layers in the same commit as the first MKUI visual mapping. First obtain behavior parity; cleanup follows separately.

## Protected domains

- message context/composer/send-verification selectors
- translation and AI provider behavior
- draft generation and reply/send behavior
- automation/orders/history/settings state
- provider/API-key storage
- telemetry/storage contracts
- closed Shadow DOM mode
- grants/connect/match URLs

## Migration target

Adopt Workspace Shell semantics while preserving wide/fullscreen behavior, data-action routing and all global Etsy integration surfaces.
