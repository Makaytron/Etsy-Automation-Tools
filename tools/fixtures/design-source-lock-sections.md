<!-- DESIGN-SOURCE-LOCK:README_EN -->
## Mandatory design sources

All new pages, panels and visible components in this repository are source-locked. UI work must be adapted from the following approved sources rather than invented ad hoc:

1. [Makaytron/Tamplate-Back-White-01](https://github.com/Makaytron/Tamplate-Back-White-01) — primary application template and canonical source for shell, sidebar, header, cards, forms, tables, spacing and theme structure.
2. [Makaytron/Toast-01](https://github.com/Makaytron/Toast-01) — mandatory source for toast, snackbar and transient-notification behavior and presentation.
3. [Applied ShadcnStore dashboard](https://shadcnstore.com/templates/dashboard/shadcn-dashboard-landing-template/dashboard) — complete sidebar/header/content composition reference.
4. [ShadcnStore blocks](https://shadcnstore.com/blocks) — approved catalog for application, dashboard, data, form, filter, table, card, alert and empty-state blocks.

Every substantial UI pull request must name the exact repository path or ShadcnStore block used and explain the Makaytron adaptation. Do not invent a new card, sidebar, modal, table, empty state, toolbar, loader, alert or toast when adding a page. If no approved source fits, stop and record a design gap for explicit maintainer approval before implementation.

Userscripts remain framework-free at runtime: approved React/Tailwind patterns are adapted and bundled locally without loading React, Tailwind, Toast-01 or ShadcnStore from the network. Existing behavior, privacy, confirmation and fail-closed contracts always take precedence over visual references.

The normative rules are in [Mandatory Design Source Lock](./docs/design/DESIGN-SOURCE-LOCK.md).
<!-- /DESIGN-SOURCE-LOCK:README_EN -->

<!-- DESIGN-SOURCE-LOCK:README_TR -->
## Zorunlu tasarım kaynakları

Bu depoya eklenecek bütün yeni sayfalar, paneller ve görünür bileşenler kaynak kilidine tabidir. Arayüzler gelişigüzel oluşturulmayacak; aşağıdaki onaylı kaynaklardan doğrudan uyarlanacaktır:

1. [Makaytron/Tamplate-Back-White-01](https://github.com/Makaytron/Tamplate-Back-White-01) — ana uygulama template'i; shell, sol menü, header, kart, form, tablo, spacing ve tema yapısının birincil kaynağıdır.
2. [Makaytron/Toast-01](https://github.com/Makaytron/Toast-01) — toast, snackbar ve geçici bildirimlerin davranış ve görünümünde zorunlu kaynaktır.
3. [Uygulanmış ShadcnStore dashboard](https://shadcnstore.com/templates/dashboard/shadcn-dashboard-landing-template/dashboard) — sidebar/header/content bütünlüğü ve tam dashboard kompozisyonu için referanstır.
4. [ShadcnStore blocks](https://shadcnstore.com/blocks) — uygulama, dashboard, veri, form, filtre, tablo, kart, uyarı ve boş durum bloklarının onaylı kataloğudur.

Önemli her arayüz değişikliğinde kullanılan repo yolu veya ShadcnStore blok adı/numarası açıkça yazılmalıdır. Sayfa eklerken kafadan kart, menü, modal, tablo, boş durum, toolbar, loader, uyarı ya da toast üretilmeyecektir. Uygun kaynak bulunamazsa geliştirme durdurulur; uygulamadan önce maintainer onaylı bir tasarım boşluğu kaydı açılır.

Userscriptler çalışma anında framework bağımlılığı taşımaz: React/Tailwind tabanlı onaylı örnekler yerel, framework'süz ve scope edilmiş MKUI koduna uyarlanır; React, Tailwind, Toast-01 veya ShadcnStore ağdan yüklenmez. Mevcut davranış, gizlilik, onay ve belirsizlikte durma sözleşmeleri görsel referanslardan önce gelir.

Kesin kurallar [Zorunlu Tasarım Kaynağı Kilidi](./docs/design/DESIGN-SOURCE-LOCK.md) belgesindedir.
<!-- /DESIGN-SOURCE-LOCK:README_TR -->

<!-- DESIGN-SOURCE-LOCK:CONTRIBUTING_EN -->
#### Mandatory design-source lock

Any pull request that adds or substantially changes visible UI must follow [DESIGN-SOURCE-LOCK.md](../docs/design/DESIGN-SOURCE-LOCK.md):

- Inspect [Tamplate-Back-White-01](https://github.com/Makaytron/Tamplate-Back-White-01) first and use it as the primary application template.
- Use [Toast-01](https://github.com/Makaytron/Toast-01) for every new or modified toast/snackbar/transient-notification pattern.
- Select the complete shell relationship from the [applied ShadcnStore dashboard](https://shadcnstore.com/templates/dashboard/shadcn-dashboard-landing-template/dashboard) and individual components from [ShadcnStore blocks](https://shadcnstore.com/blocks).
- Record the exact repository path, page URL, block family and block name/number in the pull request.
- Do not invent new visual component anatomy. When no approved source fits, stop and request explicit maintainer approval before implementation.
- Preserve existing behavior hooks, selectors, accessibility, privacy, confirmations and fail-closed flows while adapting the approved source.
<!-- /DESIGN-SOURCE-LOCK:CONTRIBUTING_EN -->

<!-- DESIGN-SOURCE-LOCK:CONTRIBUTING_TR -->
#### Zorunlu tasarım kaynağı kilidi

Görünür arayüz ekleyen veya önemli ölçüde değiştiren her pull request [DESIGN-SOURCE-LOCK.md](../docs/design/DESIGN-SOURCE-LOCK.md) kurallarına uymalıdır:

- Önce [Tamplate-Back-White-01](https://github.com/Makaytron/Tamplate-Back-White-01) incelenmeli ve ana uygulama template'i olarak kullanılmalıdır.
- Yeni veya değiştirilen her toast/snackbar/geçici bildirim için [Toast-01](https://github.com/Makaytron/Toast-01) kullanılmalıdır.
- Tam shell ilişkisi [uygulanmış ShadcnStore dashboard](https://shadcnstore.com/templates/dashboard/shadcn-dashboard-landing-template/dashboard) üzerinden, tekil bileşenler ise [ShadcnStore blocks](https://shadcnstore.com/blocks) içinden seçilmelidir.
- Kullanılan kesin repo yolu, sayfa URL'si, blok ailesi ve blok adı/numarası pull requestte yazılmalıdır.
- Yeni görsel bileşen anatomisi kafadan üretilmemelidir. Uygun onaylı kaynak yoksa geliştirme durdurulmalı ve uygulamadan önce açık maintainer onayı alınmalıdır.
- Onaylı kaynak uyarlanırken mevcut davranış hookları, selectorlar, erişilebilirlik, gizlilik, onay ve belirsizlikte durma akışları korunmalıdır.
<!-- /DESIGN-SOURCE-LOCK:CONTRIBUTING_TR -->

<!-- DESIGN-SOURCE-LOCK:PR -->
## Design-source compliance / Tasarım kaynağı uyumu

<!-- Complete this section for every visible UI change. Görünür UI değişikliklerinde bu bölümü doldurun. -->

- UI changed / UI değişti: `Yes / No`
- Shell/template source and exact path / Shell-template kaynağı ve kesin yolu:
- ShadcnStore block URL, family, name and number / ShadcnStore blok URL'si, ailesi, adı ve numarası:
- Toast-01 mapping, or `N/A` when no transient feedback exists / Toast-01 eşlemesi veya geçici bildirim yoksa `N/A`:
- Makaytron adaptation summary / Makaytron uyarlama özeti:

- [ ] I used [Tamplate-Back-White-01](https://github.com/Makaytron/Tamplate-Back-White-01) as the primary application template. / Ana uygulama template'i olarak Tamplate-Back-White-01 kullandım.
- [ ] I selected component anatomy from the [applied dashboard](https://shadcnstore.com/templates/dashboard/shadcn-dashboard-landing-template/dashboard) or a named [ShadcnStore block](https://shadcnstore.com/blocks). / Bileşen anatomisini uygulanmış dashboard veya adı belirtilmiş ShadcnStore bloğundan seçtim.
- [ ] Every new or modified toast/snackbar/notification follows [Toast-01](https://github.com/Makaytron/Toast-01), or this is `N/A`. / Yeni veya değiştirilen her toast/snackbar/bildirim Toast-01'i izliyor veya bu değişiklik için `N/A`.
- [ ] I did not invent an unapproved card, menu, sidebar, modal, table, filter, empty state, toolbar, loader, alert or toast. / Onaysız kart, menü, sidebar, modal, tablo, filtre, boş durum, toolbar, loader, uyarı veya toast üretmedim.
- [ ] Existing behavior hooks and safety contracts remain intact. / Mevcut davranış hookları ve güvenlik sözleşmeleri korunuyor.
<!-- /DESIGN-SOURCE-LOCK:PR -->

<!-- DESIGN-SOURCE-LOCK:CONTRACT_VISUAL -->
## Visual authority and mandatory source lock

MKUI is adapted for standalone Etsy userscripts only from the following approved sources:

1. [Makaytron/Tamplate-Back-White-01](https://github.com/Makaytron/Tamplate-Back-White-01) — canonical local light-dashboard implementation and primary visual authority for shell, sidebar, header, cards, forms, tables, spacing, responsiveness and theme structure.
2. [Makaytron/Toast-01](https://github.com/Makaytron/Toast-01) — mandatory toast/snackbar/transient-notification source for lifecycle, stacking, placement, timing, progress, close behavior, safe-area handling, RTL and accessibility.
3. [Applied ShadcnStore dashboard](https://shadcnstore.com/templates/dashboard/shadcn-dashboard-landing-template/dashboard) — complete composition reference for sidebar/header/content hierarchy, collapsed navigation and dense dashboard surfaces.
4. [ShadcnStore blocks](https://shadcnstore.com/blocks) — approved component-pattern catalog for application shells, interfaces, data grids, KPI cards, filters, forms, tables, alerts, listing/order surfaces and empty states.

The normative no-invention and source-traceability rules are in [`DESIGN-SOURCE-LOCK.md`](./DESIGN-SOURCE-LOCK.md). The detailed block-selection catalog is in [`SHADCNSTORE-REFERENCE-CATALOG.md`](./SHADCNSTORE-REFERENCE-CATALOG.md).

When references differ, existing userscript safety/behavior/privacy/accessibility contracts win first. For page and component presentation, the local template is followed by the applied dashboard and then the selected block. For any toast or transient notification, `Toast-01` is mandatory and is then mapped to MKUI semantic tokens.

No new visible component anatomy may be invented from memory. Every substantial surface must name an exact approved source path or block. When no approved source fits, implementation stops until explicit maintainer approval and a documented catalog/policy update exist.

Current adoption: all five production userscripts are migrated to MKUI v1 and protected by per-script, cross-script, CSS-isolation and bundle/presentation-drift gates.
<!-- /DESIGN-SOURCE-LOCK:CONTRACT_VISUAL -->

<!-- DESIGN-SOURCE-LOCK:CATALOG_APPROVED -->
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
<!-- /DESIGN-SOURCE-LOCK:CATALOG_APPROVED -->

<!-- DESIGN-SOURCE-LOCK:CATALOG_ADAPTATION -->
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
<!-- /DESIGN-SOURCE-LOCK:CATALOG_ADAPTATION -->

<!-- DESIGN-SOURCE-LOCK:MKUI_README -->
## Mandatory design-source lock

MKUI source and every production presentation change must follow [`docs/design/DESIGN-SOURCE-LOCK.md`](../../docs/design/DESIGN-SOURCE-LOCK.md):

- `Makaytron/Tamplate-Back-White-01` is the primary application template.
- `Makaytron/Toast-01` is mandatory for toast/snackbar/transient-notification behavior.
- The applied ShadcnStore dashboard defines complete shell composition.
- `https://shadcnstore.com/blocks` is the approved individual-block catalog.
- New component anatomy must not be invented. The exact source must be recorded before implementation and in the pull request.

These are design/build inputs only. Production userscripts remain framework-free, locally bundled and Etsy-safe at runtime.
<!-- /DESIGN-SOURCE-LOCK:MKUI_README -->
