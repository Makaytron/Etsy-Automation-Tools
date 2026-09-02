# MKUI Design Contract v1

Status: **active production migration**

## Visual authority and references

MKUI is adapted for standalone Etsy userscripts from the following approved sources:

1. `Makaytron/Tamplate-Back-White-01` — canonical local light-dashboard implementation and primary visual authority.
2. https://shadcnstore.com/templates/dashboard/shadcn-dashboard-landing-template/dashboard — applied dashboard composition reference.
3. https://shadcnstore.com/blocks — component-pattern catalog for application shells, interfaces, data grids, KPI cards, filters, forms, tables, alerts and empty states.

The full selection and adaptation policy lives in [`SHADCNSTORE-REFERENCE-CATALOG.md`](./SHADCNSTORE-REFERENCE-CATALOG.md).

When references differ, existing userscript safety/behavior contracts win first, followed by the local template, the applied dashboard, and then individual blocks.

Current adoption: All five production userscripts are migrated to MKUI v1. Listing Analyzer `1.2.3` is the canonical Dashboard Shell implementation; cross-script coexistence QA and canonical bundle/hash drift enforcement are the active follow-up gates.

## Goal

All five Makaytron Etsy userscripts must look like one product family without sharing business logic. MKUI owns presentation; each userscript keeps its own selectors, state machines, storage, network behavior, telemetry, verification and write operations.

## Non-negotiable migration rule

A visual migration must not require a business-behavior test to be weakened, deleted or rewritten merely to make the new UI pass. Existing `data-*`, `id`, `name`, ARIA and selector hooks used by JavaScript are treated as public behavioral API until a separate behavior refactor explicitly replaces them.

## Runtime model

- No React runtime in userscripts.
- No Tailwind runtime in userscripts.
- No remote MKUI CSS/JS dependency at runtime.
- Shared MKUI sources are bundled/inlined into each `.user.js` during build or migration.
- Existing Shadow DOM modes are preserved during v1 migration.
- Etsy page CSS must not be globally reset by MKUI.
- ShadcnStore and template URLs are design references only; installed scripts must not fetch them.

## Canonical visual tokens

MKUI uses semantic tokens rather than script-specific color names: background, surface, foreground, muted, border, input, primary, success, warning, danger, radii, shadows, spacing and focus ring. The light palette follows the monochrome system used by the local template and Listing Analyzer.

## Primitive components

The first stable primitive set is:

- Button: primary, secondary, ghost, danger, icon, small
- Input, select, textarea, checkbox, switch
- Field label, help text, validation text
- Card: head, body, foot
- Badge/pill/status
- Alert/notice
- Toolbar
- Progress
- Table shell
- Empty state
- Toast
- Modal shell

New primitives may be adapted from approved ShadcnStore blocks only after they are mapped to MKUI semantic tokens and pass the owning script's behavior and isolation tests.

## Shells

### Compact
Used by Ads Keyword Manager, Keyword & Market Analyzer and Sale Manager. Compact tools may keep their current panel widths; MKUI standardizes visual language rather than forcing identical geometry.

### Workspace
Used by Message Assistant. Keeps its current closed Shadow DOM and wide/fullscreen behavior while adopting MKUI tokens and primitives. The applied ShadcnStore dashboard informs its header/sidebar/content relationship without importing generic dashboard features.

### Dashboard
Used by Listing Analyzer. Its existing collapsed/expanded navigation model is the userscript reference implementation for translating the local template and applied ShadcnStore dashboard into an Etsy-safe shell.

## Behavioral DOM contract

During v1 migration these categories are immutable unless the owning script's contract explicitly says otherwise:

- `data-action`
- `data-view`
- `data-*` state/status hooks
- element IDs queried by JavaScript
- input `name`/`value` relationships
- `aria-controls`, `aria-expanded`, `aria-hidden`, `role`
- selectors used for event delegation

Class names may be restyled or augmented, but a class queried by JavaScript is also behavioral API.

## Isolation contract

MKUI styles must be scoped to the script host/root. Global styles are permitted only for a script's pre-existing Etsy inline integration surface and must remain narrowly prefixed. A regression test should compare representative Etsy elements before/after mounting and require zero unintended MKUI computed-style changes.

## Status colors

Color is semantic, not decorative:

- neutral/info: monochrome
- success: green
- warning: amber
- danger/error: red

Text/icon/state must communicate status without depending on color alone.

## Accessibility baseline

- Visible `:focus-visible` ring
- No removal of existing ARIA relationships
- Disabled/busy states remain programmatically detectable
- `prefers-reduced-motion` respected where animation exists
- Touch targets remain usable on narrow viewports

## Versioning

Shared source version is `1.0.0`. Migrated production scripts carry an explicit `MKUI_VERSION` marker. Once all five scripts are migrated, CI will additionally enforce a canonical bundle/hash drift check across production scripts.

## Out of scope for v1

- Rewriting userscripts in React
- Converting every script to Shadow DOM
- Changing Etsy selectors
- Changing API/provider code
- Changing telemetry/storage schemas
- Refactoring queue/publish/sale/send algorithms
- Adding template-only features such as theme customizer, generic command search, billing/pro UI or generic dashboard pages
