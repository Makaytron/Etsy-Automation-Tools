# MKUI Strict Design Source Rules

> **Status: Normative / mandatory.** These rules apply to every new page, panel, component, state, notification, and redesign in `Makaytron/Etsy-Automation-Tools`.

## 1. Approved design authorities

Every UI change MUST be traceable to one or more of the following approved sources:

| Priority | Approved source | Mandatory role |
|---:|---|---|
| 1 | [`Makaytron/Tamplate-Back-White-01`](https://github.com/Makaytron/Tamplate-Back-White-01) | Primary authority for the Makaytron application shell, visual language, spacing, typography, colors, borders, radius, forms, buttons, cards, sidebar, header, page rhythm, light/dark behavior, and general composition. |
| 2 | [`Makaytron/Toast-01`](https://github.com/Makaytron/Toast-01) | Exclusive authority for toast and transient notification appearance, motion, stacking, placement, status variants, dismissal, timing, and accessibility behavior. |
| 3 | [ShadcnStore dashboard implementation](https://shadcnstore.com/templates/dashboard/shadcn-dashboard-landing-template/dashboard) | Applied reference for dashboard shell geometry, collapsible sidebar, header, navigation, responsive behavior, settings surfaces, and content composition. |
| 4 | [ShadcnStore Blocks](https://shadcnstore.com/blocks) | Approved catalog for page sections and reusable blocks such as cards, forms, filters, data display, tables, empty states, settings, navigation, and e-commerce/application surfaces. |

The sources are complementary, not interchangeable. `Tamplate-Back-White-01` defines the product family; `Toast-01` owns toasts; the applied ShadcnStore dashboard demonstrates composition; ShadcnStore Blocks supplies approved page-level and component-level patterns.

## 2. No-improvisation rule

Do not invent a new visual component, page layout, navigation pattern, toast system, card type, input treatment, modal language, table style, empty state, or decorative element merely because it is convenient.

Before implementation, the contributor MUST identify the approved source and the exact source component, block, template area, or existing Makaytron pattern being adapted.

When no suitable approved source exists:

1. Stop implementation of that surface.
2. Propose the missing pattern in a separate design-contract change.
3. Add the approved reference and adaptation rules to the reference catalog.
4. Continue implementation only after that contract change is reviewed.

“Similar to Shadcn” or “inspired by the template” is not sufficient traceability.

## 3. Required source map for every UI change

Every pull request that adds or changes UI MUST include a source map with these fields:

| Field | Required content |
|---|---|
| Surface | Page, panel, component, state, toast, modal, or navigation area being changed |
| Approved authority | One of the four approved sources above |
| Exact reference | Repository path, component name, block name/number, or template region |
| Makaytron adaptation | Branding, copy, data, permissions, responsive behavior, or userscript-specific changes |
| Preserved behavior | Existing `id`, `data-*`, ARIA, event, storage, selector, and state contracts retained |
| Exception | Link to an approved design-contract change, or `None` |

A UI pull request without this map is incomplete and must not be merged.

## 4. Toast exclusivity

All toast, snackbar-like transient feedback, stacked notifications, success/error/warning/info messages, progress toasts, and dismissible transient notices MUST derive from `Makaytron/Toast-01`.

Allowed adaptations:

- namespace/class-prefix changes required for userscript isolation;
- framework-free inlining for standalone `.user.js` distribution;
- Makaytron tokens, text, icons, accessibility labels, and responsive sizing;
- behavior-preserving integration with existing state machines.

Forbidden:

- introducing another toast library or unrelated toast visual language;
- creating per-script toast styles from scratch;
- silently changing timing, stacking, dismissal, motion, focus, or live-region semantics;
- treating a toast as a modal, or a modal as a toast, to bypass this rule.

## 5. Adaptation boundaries

Approved sources MUST be adapted to Makaytron rather than copied blindly. Adaptation may cover:

- Makaytron branding and Turkish/English product copy;
- Etsy-specific data and workflows;
- compact, workspace, and dashboard shell requirements;
- accessibility, keyboard behavior, mobile responsiveness, and reduced motion;
- Shadow DOM, class prefixing, z-index coordination, and host-page CSS isolation;
- preservation of dangerous-action confirmations, disabled/busy states, retries, verification, and idempotency.

Adaptation MUST NOT alter protected business behavior just to make a source block easier to use.

## 6. Runtime and dependency rules

The approved repositories and ShadcnStore pages are design/code references, not runtime CDNs.

Production userscripts MUST remain self-contained and MUST NOT fetch React, Tailwind, ShadcnStore, a remote block, `Tamplate-Back-White-01`, or `Toast-01` at runtime. Required styles and framework-free behavior are adapted and inlined during development/build while preserving license and attribution obligations.

## 7. Existing-pattern preference

Before importing another approved block, reuse an already-adapted MKUI production component when it satisfies the same job. This prevents five slightly different buttons, cards, filters, modals, and toasts from appearing across the script family.

Preference order:

1. Existing approved MKUI component already used in production.
2. Direct adaptation from `Tamplate-Back-White-01`.
3. Direct adaptation from the applied ShadcnStore dashboard.
4. Direct adaptation from an identified ShadcnStore Block.
5. Contract proposal when none of the above fits.

Toast work always follows the separate `Toast-01` exclusivity rule.

## 8. Prohibited shortcuts

The following are merge blockers:

- untraceable or invented UI elements;
- generic AI-generated dashboard markup with no approved source mapping;
- mixed design languages across scripts;
- a second toast implementation;
- direct runtime dependency on a reference repository or ShadcnStore;
- removal or renaming of behavior hooks for visual convenience;
- copying a source without adapting accessibility, responsive behavior, or userscript isolation;
- copying code/assets without checking applicable license and attribution requirements;
- updating screenshots or documentation to imply parity when production code does not match.

## 9. Definition of done

A UI change is complete only when:

- its source map is present and accurate;
- it follows the authority order above;
- all transient notifications follow `Toast-01`;
- no arbitrary component or page language was introduced;
- behavior contracts and protected Etsy workflows are unchanged unless separately scoped;
- responsive, accessibility, isolation, privacy, distribution, and regression gates pass;
- screenshots/previews are generated from the production presentation layer;
- the MKUI bundle/presentation drift manifest is intentionally updated when required.

## 10. Review rule

These rules are binding. A request to deviate from them requires a separate, explicit update to this document and the relevant MKUI contract/catalog before implementation. A code review comment, temporary mockup, or undocumented one-off decision is not an exception.
