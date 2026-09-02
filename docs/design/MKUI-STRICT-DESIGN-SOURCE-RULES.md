# MKUI Strict Design Source Rules

> **Status: Normative / mandatory.** These rules apply to every new page, panel, component, state, notification and redesign in `Makaytron/Etsy-Automation-Tools`.

This document is the concise review checklist. The complete policy is [`DESIGN-SOURCE-LOCK.md`](./DESIGN-SOURCE-LOCK.md), and the machine-readable allowlist is [`DESIGN-SOURCE-REGISTRY.json`](./DESIGN-SOURCE-REGISTRY.json). When wording differs, the complete policy and registry are authoritative.

## 1. Approved design authorities

Every UI change MUST be traceable to the following approved sources:

| Priority | Approved source | Mandatory role |
|---:|---|---|
| 1 | [`Makaytron/Tamplate-Back-White-01`](https://github.com/Makaytron/Tamplate-Back-White-01) | Primary authority for the Makaytron application shell, visual language, spacing, typography, colors, borders, radius, forms, buttons, cards, sidebar, header, page rhythm, light/dark behavior and general composition. |
| 2 | [`Makaytron/Toast-01`](https://github.com/Makaytron/Toast-01) | Exclusive authority for toast and transient-notification appearance, motion, stacking, placement, status variants, dismissal, timing and accessibility behavior. |
| 3 | [ShadcnStore dashboard implementation](https://shadcnstore.com/templates/dashboard/shadcn-dashboard-landing-template/dashboard) | Applied reference for dashboard shell geometry, collapsible sidebar, header, navigation, responsive behavior, settings surfaces and content composition. |
| 4 | [ShadcnStore Blocks](https://shadcnstore.com/blocks) | Approved catalog for page sections and reusable blocks such as cards, forms, filters, data display, tables, empty states, settings, navigation and e-commerce/application surfaces. |

The sources are complementary, not interchangeable. `Tamplate-Back-White-01` defines the product family; `Toast-01` owns toasts; the applied ShadcnStore dashboard demonstrates composition; ShadcnStore Blocks supplies approved page-level and component-level patterns.

## 2. Machine-readable source registry

A source is approved only when its `source-id` exists in [`DESIGN-SOURCE-REGISTRY.json`](./DESIGN-SOURCE-REGISTRY.json).

For every visible UI change:

- cite at least one registered `template.*` id;
- cite `shadcn.dashboard.applied` for the page/shell composition;
- cite at least one exact registered `shadcn.blocks.*` family id;
- record the exact repository path registered for every repository-file source;
- record the exact ShadcnStore URL, registered family, visible block name and block number/variant;
- cite the applicable `toast.*` ids whenever transient feedback is added or changed;
- never use an invented alias, approximate path, bare repository name or general `/blocks` URL as the component source.

New source ids require explicit maintainer approval and a reviewed update to both the registry and the complete policy before implementation begins.

## 3. No-improvisation rule

Do not invent a new visual component, page layout, navigation pattern, toast system, card type, input treatment, modal language, table style, empty state or decorative element merely because it is convenient.

Before implementation, the contributor MUST identify the approved registered source and the exact source component, block, template area or existing Makaytron pattern being adapted.

When no suitable registered source exists:

1. Stop implementation of that surface.
2. Propose the missing pattern in a separate design-contract change.
3. Add the approved reference, source id and adaptation rules to the registry, policy and reference catalog.
4. Continue implementation only after that contract change is reviewed.

“Similar to Shadcn”, “inspired by the template” or “taken from the repo” is not sufficient traceability.

## 4. Required source map for every UI change

Every pull request that adds or changes UI MUST complete the repository pull-request template with these fields:

| Field | Required content |
|---|---|
| Approved source ids | Registered `template.*`, `shadcn.dashboard.applied`, exact `shadcn.blocks.*`, and applicable `toast.*` ids |
| Exact repository locators | Registry-matching `repository@ref:path` values for template and toast sources |
| Applied dashboard region | Exact applied-dashboard URL and the concrete sidebar/header/content region used |
| ShadcnStore block | Exact registered URL, family, visible block name and number/variant |
| Makaytron adaptation | Branding, copy, data, permissions, responsive behavior and userscript-specific changes |
| Preserved behavior | Existing `id`, `data-*`, ARIA, event, storage, selector, state and safety contracts retained |
| Evidence | Synthetic screenshot/preview plus behavior, accessibility, responsive and isolation tests |
| Exception | Link to an approved registry/policy change, or `None` |

A UI pull request without this map is incomplete and must not be merged. Unknown ids, mismatched paths, generic ShadcnStore references and unexplained placeholders fail CI.

## 5. Toast exclusivity

All toast, snackbar-like transient feedback, stacked notifications, success/error/warning/info messages, progress toasts and dismissible transient notices MUST derive from `Makaytron/Toast-01`.

At minimum, a changed toast system must cite:

- `toast.container` — `src/components/ToastContainer.tsx`
- `toast.item` — `src/components/Toast.tsx`
- `toast.styles` — `src/style.css`

Use `toast.progress`, `toast.close-button` and `toast.transitions` when the workflow includes those behaviors.

Allowed adaptations:

- namespace/class-prefix changes required for userscript isolation;
- framework-free inlining for standalone `.user.js` distribution;
- Makaytron tokens, text, icons, accessibility labels and responsive sizing;
- behavior-preserving integration with existing state machines.

Forbidden:

- introducing another toast library or unrelated toast visual language;
- creating per-script toast styles from scratch;
- silently changing timing, stacking, dismissal, motion, focus or live-region semantics;
- treating a toast as a modal, or a modal as a toast, to bypass this rule.

## 6. Adaptation boundaries

Approved sources MUST be adapted to Makaytron rather than copied blindly. Adaptation may cover:

- Makaytron branding and Turkish/English product copy;
- Etsy-specific data and workflows;
- compact, workspace and dashboard shell requirements;
- accessibility, keyboard behavior, mobile responsiveness and reduced motion;
- Shadow DOM, class prefixing, z-index coordination and host-page CSS isolation;
- preservation of dangerous-action confirmations, disabled/busy states, retries, verification and idempotency.

Adaptation MUST NOT alter protected business behavior merely to make a source block easier to use.

## 7. Runtime and dependency rules

The approved repositories and ShadcnStore pages are design/code references, not runtime CDNs.

Production userscripts MUST remain self-contained and MUST NOT fetch React, Tailwind, ShadcnStore, a remote block, `Tamplate-Back-White-01` or `Toast-01` at runtime. Required styles and framework-free behavior are adapted and inlined during development/build while preserving license and attribution obligations.

## 8. Existing-pattern preference

Before adapting another approved block, reuse an already-adapted MKUI production component when it satisfies the same job. This prevents five slightly different buttons, cards, filters, modals and toasts from appearing across the script family.

Preference order:

1. Existing approved MKUI component already used in production.
2. Registered direct adaptation from `Tamplate-Back-White-01`.
3. Registered composition from the applied ShadcnStore dashboard.
4. Registered, named and numbered ShadcnStore Block.
5. Registry/policy proposal when none of the above fits.

Toast work always follows the separate `Toast-01` exclusivity rule.

## 9. Prohibited shortcuts

The following are merge blockers:

- untraceable, unregistered or invented UI elements;
- generic AI-generated dashboard markup with no approved source mapping;
- mixed design languages across scripts;
- a second toast implementation;
- direct runtime dependency on a reference repository or ShadcnStore;
- removal or renaming of behavior hooks for visual convenience;
- copying a source without adapting accessibility, responsive behavior or userscript isolation;
- copying code/assets without checking applicable license and attribution requirements;
- updating screenshots or documentation to imply parity when production code does not match;
- editing the registry with guessed paths or unverified source-file pins merely to satisfy CI.

## 10. Definition of done

A UI change is complete only when:

- every cited source id exists in the registry;
- every exact path/URL/family/name/number matches the registered source;
- the source map is present and accurate;
- it follows the authority order above;
- all transient notifications follow `Toast-01`;
- no arbitrary component or page language was introduced;
- behavior contracts and protected Etsy workflows are unchanged unless separately scoped;
- responsive, accessibility, isolation, privacy, distribution and regression gates pass;
- screenshots/previews are generated from the production presentation layer;
- the MKUI bundle/presentation drift manifest is intentionally updated when required;
- Design Source Lock CI passes.

## 11. Review rule

These rules are binding. A request to deviate from them requires a separate, explicit update to this document, [`DESIGN-SOURCE-LOCK.md`](./DESIGN-SOURCE-LOCK.md), [`DESIGN-SOURCE-REGISTRY.json`](./DESIGN-SOURCE-REGISTRY.json) and the relevant MKUI contract/catalog before implementation. A code-review comment, temporary mockup or undocumented one-off decision is not an exception.
