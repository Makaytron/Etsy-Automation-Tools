# Mandatory Design Source Lock

Status: **normative and required**

This policy applies to every new page, panel, drawer, modal, card, table, filter, form, empty state, toolbar, navigation area, toast, notification and other visible interface added to `Makaytron/Etsy-Automation-Tools`.

The purpose is simple: Makaytron interfaces must be adapted from approved, inspectable design sources. Contributors and agents must not invent a parallel component library or improvise new UI anatomy from memory.

## Approved sources

### 1. Primary application template

- Repository: https://github.com/Makaytron/Tamplate-Back-White-01
- Role: canonical source for the Makaytron light application language, semantic tokens, page shell, sidebar, header, content hierarchy, cards, forms, tables, spacing, responsive behavior and theme structure.

This repository is the first visual implementation to inspect before adding or changing an application surface.

### 2. Mandatory toast and notification source

- Repository: https://github.com/Makaytron/Toast-01
- Role: canonical source for toast lifecycle, container placement, stacking, severity variants, close behavior, progress/timing behavior, responsive safe-area handling, RTL support and notification accessibility.

All toast, snackbar and transient-notification work must be based on `Toast-01`. Do not add a second custom toast system. Existing script-specific toast code may remain until touched; once changed, it must be mapped toward the approved Toast-01 behavior while preserving the owning script's safety and regression contracts.

### 3. Applied dashboard reference

- URL: https://shadcnstore.com/templates/dashboard/shadcn-dashboard-landing-template/dashboard
- Role: complete applied reference for sidebar/header/content composition, collapsed navigation, page hierarchy, dense dashboard layout and responsive dashboard behavior.

Use this page to understand how approved parts work together. Do not copy generic demo labels or unrelated features into production tools.

### 4. Approved block catalog

- URL: https://shadcnstore.com/blocks
- Role: approved catalog for application shells, application interfaces, KPI cards, data grids, tables, charts, forms, filters, product/listing cards, order views, alerts, empty states and responsive sections.

A specific block must be chosen and named before implementing the corresponding surface.

## Machine-readable source registry

[`DESIGN-SOURCE-REGISTRY.json`](./DESIGN-SOURCE-REGISTRY.json) is the machine-readable authority for approved source files and ShadcnStore families. Its `source-id` values are part of the design contract, not optional documentation shorthand.

Mandatory registry rules:

- Every visible UI pull request must list the registered `source-id` values used.
- Every UI change must include at least one `template.*` source, `shadcn.dashboard.applied`, and one exact `shadcn.blocks.*` family source.
- A repository source is valid only when the PR also records the exact repository path registered for that `source-id`.
- A ShadcnStore block-family source is valid only when the PR records the exact registered URL plus the selected block family, visible block name and block number/variant.
- A changed toast/snackbar/transient notification must include the relevant `toast.*` ids; at minimum `toast.container`, `toast.item` and `toast.styles`.
- An unregistered source id, approximate source name or invented alias is invalid.
- Adding a new `source-id` requires explicit maintainer approval and a reviewed registry update before UI implementation starts.
- The registry is a design/build allowlist. It never authorizes remote runtime loading from the template repositories or ShadcnStore.

The human-readable policy and machine-readable registry must remain consistent. CI fails when the registry is malformed, required ids disappear, or a UI pull request cites unknown ids.

## Precedence

When approved references differ, use this order:

1. Existing userscript behavior, safety, privacy and accessibility contracts
2. `Makaytron/Tamplate-Back-White-01`
3. `Makaytron/Toast-01` for toast and transient-notification behavior
4. The applied ShadcnStore dashboard for complete shell composition
5. The selected ShadcnStore block for the individual component or section
6. MKUI semantic-token adaptation required by the owning script

A design reference never authorizes weakening confirmation, verification, fail-closed behavior, privacy controls, selector contracts or tested workflows.

## No-invention rule

The following requirements are mandatory:

- Do not design a new visible component from scratch when adding or changing a page.
- Do not create arbitrary cards, panels, menus, sidebars, modals, tables, filters, empty states, loaders, alerts or toasts merely because they are easy to code.
- Every major visible region must map to one approved source: a registered repository file/component, the applied dashboard, or a registered ShadcnStore block family and named variant.
- Combining approved patterns is allowed only when the source of each major region remains identifiable and the result still belongs to the same Makaytron design system.
- Product-specific copy, fields, actions, data density, permissions and state labels may be adapted to the real workflow. The visual anatomy, hierarchy and interaction pattern must still come from an approved source.
- When no approved source fits, stop implementation and record a design gap. A custom pattern may be introduced only after explicit maintainer approval and an update to this policy and `DESIGN-SOURCE-REGISTRY.json`.
- “Inspired by shadcn”, “similar to the template” or a bare repository name is not enough. The registered `source-id`, exact source path or URL, block family and block name/number must be recorded.

## Required source mapping before implementation

For every new page or substantial UI change, record all of the following in the pull request:

1. **Approved source ids** — every registered `template.*`, `shadcn.*` and applicable `toast.*` id used
2. **Exact repository paths** — exact registered `Tamplate-Back-White-01` and `Toast-01` paths used
3. **Shell source** — exact template shell path and the applied-dashboard region used
4. **Component source** — exact registered ShadcnStore URL plus block family and visible block name/number
5. **Toast source** — exact `Toast-01` source ids and paths when transient feedback exists
6. **Adaptation note** — what was changed for Makaytron data, wording, permissions, density and safety
7. **Behavior-preservation note** — which existing hooks, selectors, state machines and confirmations remain unchanged
8. **Evidence** — synthetic screenshots and the relevant behavior, accessibility, responsive and isolation tests

A UI pull request without this mapping is incomplete. Unknown ids, mismatched paths and generic catalog references fail closed.

## Toast rules

All new or modified toast systems must preserve the relevant Toast-01 concepts:

- one canonical container per owning surface
- deterministic stacking and maximum-count behavior
- `info`, `success`, `warning` and `error` semantics
- visible close control when the notification is dismissible
- programmatic dismissal and update support where the workflow requires it
- pause/resume behavior for timed notifications when focus or hover would otherwise hide important information
- progress/timing feedback when auto-dismiss is used
- mobile safe-area behavior
- RTL compatibility where supported by the product
- `aria-live`/status semantics and keyboard-accessible dismissal
- reduced-motion fallback

Userscripts must not add React or Tailwind as runtime dependencies merely to use `Toast-01`. They must adapt the approved behavior and presentation into the existing framework-free, bundled and scoped MKUI runtime.

## Adaptation boundaries

Allowed:

- Makaytron branding and semantic MKUI tokens
- Turkish/English product copy
- real product fields and actions
- width and density changes required by a Compact, Workspace or Dashboard shell
- responsive adaptations
- removal of irrelevant demo content
- framework-free ports required by userscripts

Not allowed:

- unrelated demo navigation or fake features
- a new visual language beside MKUI
- arbitrary decorative components with no registered source
- remote runtime dependency on the template, Toast-01 or ShadcnStore
- unscoped CSS that changes Etsy host elements
- replacing tested behavior hooks only to match a block
- copying a visual pattern without recording its registered source id and exact locator

## Implementation gate

Before coding:

- choose the MKUI shell
- choose registered `source-id` values for every major region
- record the exact template and Toast-01 paths from the registry
- identify the applied-dashboard composition used
- identify the exact ShadcnStore family URL and named block variant
- verify that the selected source supports the real workflow

Before merge:

- complete the design-source section in the pull request template
- ensure every cited id exists in `DESIGN-SOURCE-REGISTRY.json`
- update Turkish and English documentation together when visible behavior changes
- provide synthetic visual evidence
- pass the owning script's behavior tests
- pass cross-script CSS isolation and coexistence checks
- pass MKUI drift protection
- pass Design Source Lock CI and the registry/PR-source tests

## Exceptions

There are no implicit exceptions. An exception requires explicit maintainer approval, a concrete reason, a limited scope, visual evidence and a documented replacement or standardization plan. Until that approval is recorded, the implementation must not proceed with an invented component or an unregistered source id.
