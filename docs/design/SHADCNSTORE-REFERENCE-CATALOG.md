# ShadcnStore Reference Catalog for MKUI

This catalog records approved visual references for the Makaytron Etsy userscript family. These pages are design inputs, not runtime dependencies.

## Approved sources

1. Canonical local template
   - Repository: `Makaytron/Tamplate-Back-White-01`
   - Role: primary source for light theme tokens, application shell geometry, sidebar behavior, header hierarchy, cards, forms and dashboard spacing.

2. ShadcnStore block library
   - URL: https://shadcnstore.com/blocks
   - Role: optional component-pattern catalog for cards, application shells, data grids, KPI widgets, filters, empty states, forms, alerts, tables and responsive layouts.

3. Applied dashboard reference
   - URL: https://shadcnstore.com/templates/dashboard/shadcn-dashboard-landing-template/dashboard
   - Role: interaction and composition reference for the complete sidebar/header/content relationship, collapsed navigation, page hierarchy and dense dashboard surfaces.

## Selection priority

When references differ, use this order:

1. Existing userscript behavioral contract and safety constraints
2. `Tamplate-Back-White-01`
3. Applied ShadcnStore dashboard page
4. Individual ShadcnStore blocks

A block may improve presentation, but it must never replace or weaken a tested userscript workflow.

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

## Adaptation rules

- Extract layout and visual principles; do not add React or Tailwind runtime dependencies to userscripts.
- Do not copy generic template navigation labels into production tools.
- Preserve each script's existing Shadow DOM mode and scoped CSS strategy.
- Preserve all `data-*`, IDs, names, ARIA relationships and selectors used by JavaScript.
- Use the MKUI semantic token layer rather than hard-coding block-specific colors.
- Keep interfaces white/neutral by default; use success, warning and danger colors only for meaning.
- Any imported pattern must pass narrow/mobile layouts, keyboard focus, reduced-motion and Etsy CSS-isolation checks.
- External source availability must never affect installed script startup or rendering.

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
