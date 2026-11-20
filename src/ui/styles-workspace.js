// Styles of the workspace, settings controls and dialog (closed shadow root).
//
// Design sources (docs/design/DESIGN-SOURCE-REGISTRY.json):
// - template.shell.base-layout   sidebar + inset; page title text-2xl bold tight, muted description, px-6 py-6, gap 4-6
// - template.shell.app-sidebar   header lockup: size-8 rounded-lg primary square logo + two-line name
// - template.shell.site-header   border-b header row, px-6 py-3, actions pushed right
// - template.navigation.nav-main + template.primitive.sidebar
//                                sidebar width 16rem, group label h-8 px-2 text-xs medium 70% opacity,
//                                menu button p-2 rounded-md text-sm, active = accent background + font-medium
// - template.primitive.card      rounded-xl border py-6 shadow-sm gap-6, header px-6 gap-1.5, title semibold, description text-sm muted
// - template.primitive.tabs      list h-9 rounded-lg p-[3px] muted; trigger rounded-md px-2 text-sm medium, active = background + shadow-sm
// - template.primitive.checkbox  size-4 rounded-[4px] border, checked = primary
// - template.primitive.select    h-9 rounded-md border px-3 text-sm shadow-xs (native select keeps keyboard and screen reader support)
// - template.primitive.input     same frame as select
// - template.primitive.dialog    overlay black/50; content centered max-w-lg rounded-lg border p-6 shadow-lg gap-4;
//                                title text-lg semibold; footer row justify-end gap-2
// - shadcn.blocks.application-shell, block "App Shell 2": the sidebar collapses to a 3rem icon rail on narrow windows.
// Design gap (recorded, not invented): the registry has no switch or slider, so on/off settings use the checkbox
// and the position along the edge is set by dragging the button.

export const WORKSPACE_CSS = `
.ws { pointer-events: auto; position: fixed; inset: 0; display: flex; background: var(--mk-bg); color: var(--mk-fg); font-family: var(--mk-font); }
.ws[hidden] { display: none; }
.ws-sidebar { width: 256px; flex: none; display: flex; flex-direction: column; gap: 8px; padding: 8px; background: var(--mk-surface); border-right: 1px solid var(--mk-border); overflow-y: auto; }
[dir="rtl"] .ws-sidebar { border-right: none; border-left: 1px solid var(--mk-border); }
.ws-brand { display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: var(--mk-radius-sm); text-decoration: none; color: inherit; }
.ws-brand:hover { background: var(--mk-muted); }
.ws-logo { width: 32px; height: 32px; border-radius: 10px; background: var(--mk-primary); display: flex; align-items: center; justify-content: center; flex: none; }
.ws-logo img { width: 24px; height: 13px; object-fit: contain; filter: brightness(0) invert(1); }
.mkui-root[data-theme="dark"] .ws-logo img { filter: none; }
.ws-brand-text { display: grid; line-height: 1.2; min-width: 0; }
.ws-brand-text b { font-size: 14px; font-weight: 600; }
.ws-brand-text small { font-size: 12px; color: var(--mk-muted-fg); }
.ws-group { display: flex; flex-direction: column; }
.ws-group-label { height: 32px; display: flex; align-items: center; padding: 0 8px; font-size: 12px; font-weight: 500; color: var(--mk-muted-fg); }
.ws-menu { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.ws-menu-button { display: flex; width: 100%; align-items: center; gap: 8px; padding: 8px; border: none; border-radius: var(--mk-radius-sm); background: transparent; color: inherit; font: 400 14px/20px var(--mk-font); text-align: start; text-decoration: none; cursor: pointer; }
.ws-menu-button:hover { background: var(--mk-muted); }
.ws-menu-button[aria-current="page"] { background: var(--mk-muted); font-weight: 500; }
.ws-menu-button svg { flex: none; color: var(--mk-muted-fg); }
.ws-menu-button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; unicode-bidi: plaintext; }
.ws-sidebar-footer { margin-top: auto; display: flex; gap: 8px; padding: 8px; font-size: 12px; color: var(--mk-muted-fg); }
.ws-sidebar-footer a { color: inherit; }
.ws-link { padding: 0; border: 0; background: none; color: inherit; font: inherit; text-decoration: underline; cursor: pointer; }
.ws-inset { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; background: var(--mk-surface); }
.ws-header { display: flex; align-items: center; gap: 8px; padding: 12px 24px; border-bottom: 1px solid var(--mk-border); min-height: 57px; }
.ws-context { font-size: 13px; color: var(--mk-muted-fg); }
.ws-spacer { flex: 1 1 auto; }
.ws-main { flex: 1 1 auto; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 24px; }
.page-head { display: flex; flex-direction: column; gap: 8px; }
.page-title { margin: 0; font-size: 24px; line-height: 32px; font-weight: 700; letter-spacing: -.025em; }
.page-description { margin: 0; color: var(--mk-muted-fg); }

/* Card */
.card { background: var(--mk-surface); border: 1px solid var(--mk-border); border-radius: 14px; box-shadow: var(--mk-shadow-card); padding: 24px 0; display: flex; flex-direction: column; gap: 24px; }
.card-header { padding: 0 24px; display: flex; flex-direction: column; gap: 6px; }
.card-title { margin: 0; font-size: 16px; line-height: 1; font-weight: 600; }
.card-description { margin: 0; font-size: 14px; color: var(--mk-muted-fg); }
.card-content { padding: 0 24px; display: flex; flex-direction: column; gap: 20px; }
.cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
.field { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.field-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.field-label { font-size: 14px; font-weight: 500; }
.field-hint { font-size: 13px; line-height: 18px; color: var(--mk-muted-fg); }

/* Tabs */
.tabs-list { display: inline-flex; height: 36px; width: fit-content; align-items: center; padding: 3px; border-radius: 10px; background: var(--mk-muted); color: var(--mk-muted-fg); flex: none; }
.tabs-trigger { height: calc(100% - 1px); display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 4px 10px; border: 1px solid transparent; border-radius: var(--mk-radius-sm); background: transparent; color: var(--mk-fg); font: 500 14px/20px var(--mk-font); white-space: nowrap; cursor: pointer; }
.tabs-trigger[aria-selected="true"] { background: var(--mk-surface); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.mkui-root[data-theme="dark"] .tabs-trigger[aria-selected="true"] { background: var(--mk-bg); border-color: var(--mk-input); }
.tabs-trigger:not([aria-selected="true"]) { color: var(--mk-muted-fg); }

/* Checkbox row */
.check { display: flex; align-items: flex-start; gap: 12px; cursor: pointer; }
.check input { appearance: none; -webkit-appearance: none; margin: 2px 0 0; width: 16px; height: 16px; flex: none; border: 1px solid var(--mk-input); border-radius: 4px; background: var(--mk-surface); display: grid; place-content: center; cursor: pointer; }
.check input:checked { background: var(--mk-primary); border-color: var(--mk-primary); }
.check input:checked::after { content: ""; width: 9px; height: 5px; border: 2px solid var(--mk-primary-fg); border-top: none; border-right: none; transform: rotate(-45deg) translate(1px, -1px); }

/* Select / input */
.select, .input { height: 36px; border: 1px solid var(--mk-input); border-radius: var(--mk-radius-sm); background: transparent; color: var(--mk-fg); padding: 0 12px; font: 14px/20px var(--mk-font); box-shadow: 0 1px 2px rgba(0,0,0,.05); }
.select option { color: #171717; background: #ffffff; }
.input { width: 100%; }

/* Notice line */
.notice { font-size: 13px; color: var(--mk-muted-fg); min-height: 18px; margin: 0; }

/* Dialog */
.overlay { pointer-events: auto; position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; padding: 16px; }
.dialog { position: relative; width: 100%; max-width: 512px; max-height: calc(100vh - 32px); overflow-y: auto; display: grid; gap: 16px; padding: 24px; border: 1px solid var(--mk-border); border-radius: var(--mk-radius-md); background: var(--mk-surface); color: var(--mk-fg); box-shadow: var(--mk-shadow-modal); font-family: var(--mk-font); }
.dialog-header { display: flex; flex-direction: column; gap: 8px; }
.dialog-title { margin: 0; font-size: 18px; line-height: 1; font-weight: 600; }
.dialog-description { margin: 0; font-size: 14px; color: var(--mk-muted-fg); }
.dialog-footer { display: flex; justify-content: flex-end; gap: 8px; }
.dialog-close { position: absolute; top: 12px; right: 12px; }
.check-list { border: 1px solid var(--mk-border); border-radius: var(--mk-radius-md); display: flex; flex-direction: column; }
.check-list .check { padding: 12px; }
.check-list .check + .check { border-top: 1px solid var(--mk-border); }
.btn-destructive { background: var(--mk-danger); color: #ffffff; }
.btn[disabled] { opacity: .5; pointer-events: none; }
.label { font-size: 13px; font-weight: 500; }

/* Progress (template.primitive.progress), badge (template.primitive.badge), table (template.primitive.table) */
.ob-progress { display: flex; align-items: center; gap: 12px; }
.progress { position: relative; flex: 1 1 auto; height: 8px; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--mk-primary) 20%, transparent); }
.progress-indicator { height: 100%; background: var(--mk-primary); transition: width .2s ease; }
.badge { display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 2px 8px; border: 1px solid var(--mk-border); border-radius: var(--mk-radius-sm); font-size: 12px; font-weight: 500; white-space: nowrap; flex: none; }
.badge-ok { color: var(--mk-success); background: var(--mk-success-soft); border-color: transparent; }
.badge-warn { color: var(--mk-warning); background: var(--mk-warning-soft); border-color: transparent; }
.badge-err { color: var(--mk-danger); background: var(--mk-danger-soft); border-color: transparent; }
.table-wrap { border: 1px solid var(--mk-border); border-radius: var(--mk-radius-md); overflow: hidden; }
.table { width: 100%; border-collapse: collapse; font-size: 14px; }
.table th { height: 40px; padding: 0 8px 0 12px; text-align: start; font-weight: 500; color: var(--mk-muted-fg); border-bottom: 1px solid var(--mk-border); }
.table td { padding: 8px 8px 8px 12px; border-bottom: 1px solid var(--mk-border); }
.table tr:last-child td { border-bottom: none; }
.mono { font-family: "JetBrains Mono", ui-monospace, Menlo, monospace; font-weight: 700; letter-spacing: .08em; }
/* Busy state (template.primitive.loading-spinner) */
.busy { display: flex; align-items: center; gap: 8px; }
.spinner { flex: none; width: 16px; height: 16px; border: 2px solid currentColor; border-inline-end-color: transparent; border-radius: 50%; animation: eat-spin .75s linear infinite; }
@keyframes eat-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2.5s; } }
.steps-list { margin: 0; padding-inline-start: 20px; display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
.onboarding { max-width: 480px; }

/* Tool screens: KPI tiles (shadcn.blocks.kpi-widgets), stacks, code text */
.tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.tile { border: 1px solid var(--mk-border); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; background: var(--mk-surface); box-shadow: var(--mk-shadow-card); }
.tile-value { font-size: 20px; line-height: 28px; font-weight: 700; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.stack { display: flex; flex-direction: column; gap: 8px; }
.stack-lg { display: flex; flex-direction: column; gap: 16px; }
.row-between { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.row-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.grow { flex: 1 1 auto; min-width: 0; }
.mono-code { font-family: "JetBrains Mono", ui-monospace, Menlo, monospace; font-weight: 700; font-size: 13px; }
.badge-dark { background: var(--mk-primary); color: var(--mk-primary-fg); border-color: transparent; }
.alert-warn { margin: 0; padding: 12px 14px; border-radius: var(--mk-radius-md); background: var(--mk-warning-soft); color: var(--mk-warning); font-size: 13px; }
.field-col { display: flex; flex-direction: column; gap: 6px; }
.table-scroll { max-height: 280px; overflow: auto; }
.sale-drawer, .ads-drawer { display: flex; flex-direction: column; gap: 12px; }
.ads-drawer p { margin: 0; }
.tile .badge { align-self: flex-start; }
.sale-drawer .progress { flex: none; }
@media (max-width: 1100px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

.mkui-root[data-density="compact"] .card { padding: 16px 0; gap: 16px; }
.mkui-root[data-density="compact"] .card-content { gap: 14px; }

/* Narrow windows: App Shell 2 icon rail */
@media (max-width: 1100px) {
  .ws-sidebar { width: 48px; padding: 8px 4px; }
  .ws-brand-text, .ws-group-label, .ws-menu-button span, .ws-sidebar-footer { display: none; }
  .ws-brand, .ws-menu-button { justify-content: center; padding: 8px 0; }
  .cards { grid-template-columns: minmax(0, 1fr); }
}
`;
