# Behavioral UI Contract — Makaytron Etsy Message Assistant

Baseline version: **1.2.9**
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
- all existing `data-*` behavioral hooks
- global Etsy integration surfaces under the `mema-` family

## Migration result

MKUI 1.0.0 Workspace Shell mapping is complete in version 1.2.9. Wide/fullscreen behavior, data-action routing and all global Etsy integration surfaces remain protected.

The first guarded transformer is `tools/Apply-Mkui-Message-Pilot.mjs`. It must fail closed if protected metadata, the `data-*` signature, Shadow DOM mount count or the global Etsy CSS layer changes. Focused invariants live in `tools/Test-Mkui-Message-Assistant.mjs`.
