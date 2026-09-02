# ShadcnStore Reference Catalog for MKUI

This catalog records approved visual references for the Makaytron Etsy userscript family. These pages are design inputs, not runtime dependencies.

## Approved sources

1. Primary local application template
   - Repository: https://github.com/Makaytron/Tamplate-Back-White-01
   - Role: mandatory first source for light-theme tokens, application shell geometry, sidebar behavior, header hierarchy, cards, forms, tables, dashboard spacing, responsive behavior and theme structure.

2. Mandatory toast and notification source
   - Repository: https://github.com/Makaytron/Toast-01
   - Role: canonical toast lifecycle and presentation source for placement, stacking, severity, close/update/dismiss behavior, timing/progress, focus/hover pause, safe areas, RTL and accessibility.

3. Applied ShadcnStore dashboard reference
   - URL: https://shadcnstore.com/templates/dashboard/shadcn-dashboard-landing-template/dashboard
   - Role: complete interaction and composition reference for sidebar/header/content relationships, collapsed navigation, page hierarchy and dense dashboard surfaces.

4. ShadcnStore block library
   - URL: https://shadcnstore.com/blocks
   - Role: approved component catalog for cards, application shells, interfaces, data grids, KPI widgets, filters, empty states, forms, alerts, tables, listing/order views and responsive layouts.

## Source-lock priority

When references differ, use this order:

1. Existing userscript behavioral, safety, privacy and accessibility contracts
2. `Tamplate-Back-White-01` for application and page structure
3. `Toast-01` for toast/snackbar/transient-notification behavior
4. Applied ShadcnStore dashboard for complete shell composition
5. The explicitly named ShadcnStore block for an individual region
6. MKUI semantic-token and framework-free adaptation

A reference may improve presentation, but it must never replace or weaken a tested userscript workflow. A contributor must not invent an alternative component when an approved pattern exists.

## Approved block families

For userscripts, prefer patterns from:

- Application Shell Sections
- Application Interface Sections
- Data Grid & Datatable Components
- KPI Cards & Dashboard Widgets
- Product Filter Bars and Sidebars when useful for listing/search tools
- Order History and Orders Table Components when useful for Sale Manager or order workflows
- Listing Card Sections when useful for Listing Analyzer
- Form, empty-state, alert and status patterns from any compatible block family

Marketing-only sections such as hero, testimonial, pricing and newsletter blocks are not application defaults. They may be used only when a real tool surface requires that composition.

## Mandatory adaptation rules

- Inspect `Tamplate-Back-White-01` before designing a new page or surface.
- Use `Toast-01` for every new or changed toast, snackbar and transient notification; do not introduce a parallel toast system.
- Select and record the exact source before coding: repository path, applied-dashboard region, or ShadcnStore block family plus block name/number.
- Do not create new visual component anatomy from scratch. If no approved pattern fits, stop and request explicit maintainer approval before implementation.
- Extract layout, interaction and visual principles; do not add React or Tailwind runtime dependencies to userscripts.
- Do not copy generic template navigation labels or unrelated demo features into production tools.
- Preserve each script's existing Shadow DOM mode and scoped CSS strategy.
- Preserve all `data-*`, IDs, names, ARIA relationships and selectors used by JavaScript.
- Use the MKUI semantic token layer rather than hard-coding block-specific colors.
- Keep interfaces white/neutral by default; use success, warning and danger colors only for meaning.
- Any adapted pattern must pass narrow/mobile layouts, keyboard focus, reduced-motion and Etsy CSS-isolation checks.
- External source availability must never affect installed script startup or rendering.
- Every visible UI pull request must complete the design-source section in `.github/PULL_REQUEST_TEMPLATE.md`.

## Script mapping

| Script | Shell | Preferred references |
|---|---|---|
| Ads Keyword Manager | Compact | form cards, status cards, compact toolbars |
| Keyword & Market Analyzer | Compact | KPI cards, tables, filters, research summaries |
| Sale Manager | Compact | order tables, confirmations, destructive-state patterns |
| Message Assistant | Workspace | applied dashboard shell, application interfaces, cards, forms, status/empty states |
| Listing Analyzer | Dashboard | applied dashboard shell, data grids, filters, KPI widgets, listing cards |

## Review requirement

Every future MKUI change should name the source pattern used and explain how it was adapted without changing business behavior. Visual references are accepted only after the owning script's regression suite and cross-script isolation gate pass.
