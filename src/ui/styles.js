// Styles of the drawer shell, scoped to its closed shadow root.
//
// Design sources (docs/design/DESIGN-SOURCE-REGISTRY.json):
// - template.theme.tokens        colours come from shared/mkui/tokens.css (MKUI adaptation of the template tokens),
//                                inlined by the build; dark values below follow the same semantic names
// - template.primitive.sheet     drawer: fixed, full height, max 24rem (384px), border on the inner edge,
//                                shadow-lg, header p-4 / gap 1.5, title font-semibold, description text-sm muted,
//                                close control top-4 right-4 at 70% opacity. Adapted as a non-modal sheet
//                                (no overlay) so the Etsy page stays usable beside it.
// - template.primitive.button    edge button and actions: h-9, px-4, rounded-md, text-sm, font-medium,
//                                default / outline / ghost variants, icon size 9, 3px focus ring.
// - shadcn.dashboard.applied     composition of header, sections and footer in a narrow column.
// - shadcn.blocks.application-shell, block "App Shell 2" (collapsible icon rail with a mobile sheet):
//                                the drawer is the sheet form of the shell; the narrow-window rail comes with the workspace.

export const SHELL_CSS = `
:host { all: initial; }
.mkui-root { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; font-size: 14px; line-height: 20px; -webkit-font-smoothing: antialiased; }
.mkui-root[data-theme="dark"] {
  --mk-bg: #0b0b0b; --mk-surface: #171717; --mk-fg: #ededed; --mk-muted: #262626; --mk-muted-fg: #a3a3a3;
  --mk-border: #2e2e2e; --mk-input: #404040; --mk-primary: #ededed; --mk-primary-strong: #ffffff; --mk-primary-fg: #141414;
  --mk-success: #4ade80; --mk-success-soft: #10261a; --mk-warning: #fbbf24; --mk-warning-soft: #2a2110;
  --mk-danger: #f87171; --mk-danger-soft: #2a1515;
  --mk-shadow-panel: 0 0 0 1px #262626, 0 18px 44px rgba(0,0,0,.7); --mk-focus: 0 0 0 3px rgba(237,237,237,.25);
}
.mkui-root * { box-sizing: border-box; }
.mkui-root :focus-visible { outline: none; box-shadow: var(--mk-focus); }

/* Button (template.primitive.button) */
.btn { pointer-events: auto; display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 36px; padding: 0 16px; border-radius: var(--mk-radius-sm); border: 1px solid transparent; font: 500 14px/20px var(--mk-font); white-space: nowrap; cursor: pointer; text-decoration: none; background: transparent; color: var(--mk-fg); }
.btn svg { flex: none; }
.btn-default { background: var(--mk-primary); color: var(--mk-primary-fg); }
.btn-default:hover { background: var(--mk-primary-strong); }
.btn-outline { background: var(--mk-surface); border-color: var(--mk-border); }
.btn-outline:hover, .btn-ghost:hover { background: var(--mk-muted); }
.btn-icon { width: 36px; padding: 0; }
.btn-sm { height: 32px; padding: 0 12px; font-size: 13px; }

/* Edge button: an icon button attached to a window edge */
.tab { pointer-events: auto; position: fixed; display: flex; align-items: center; justify-content: center; gap: 5px; background: var(--mk-surface); color: var(--mk-fg); border: 1px solid var(--mk-border); box-shadow: 0 6px 14px -4px rgba(0,0,0,.16); cursor: pointer; padding: 0; touch-action: none; user-select: none; transition: left .2s ease, top .2s ease, transform .2s ease; }
.tab img { width: 26px; height: 14px; object-fit: contain; pointer-events: none; }
.tab .grip { width: 16px; height: 4px; background: radial-gradient(circle, var(--mk-muted-fg) 1px, transparent 1.5px) 0 0 / 4px 4px; opacity: .7; }
.tab[data-edge="right"] { flex-direction: column; border-right: none; border-radius: 12px 0 0 12px; }
.tab[data-edge="left"] { flex-direction: column; border-left: none; border-radius: 0 12px 12px 0; }
.tab[data-edge="top"] { border-top: none; border-radius: 0 0 12px 12px; }
.tab[data-edge="bottom"] { border-bottom: none; border-radius: 12px 12px 0 0; }
.tab.dragging { transition: none; border: 1px solid var(--mk-border); border-radius: 12px; transform: rotate(-4deg); box-shadow: 0 18px 30px -8px rgba(0,0,0,.28); cursor: grabbing; }

/* Drop zones while dragging */
.zones { position: fixed; inset: 0; pointer-events: none; background: rgba(255,255,255,.18); }
.zone { position: fixed; border: 2px dashed var(--mk-input); border-radius: 12px; }
.zone[data-on] { border-color: var(--mk-primary); background: color-mix(in srgb, var(--mk-primary) 5%, transparent); }
.zone[data-edge="left"] { left: 6px; top: 70px; bottom: 70px; width: 56px; }
.zone[data-edge="right"] { right: 6px; top: 70px; bottom: 70px; width: 56px; }
.zone[data-edge="top"] { top: 6px; left: 70px; right: 70px; height: 52px; }
.zone[data-edge="bottom"] { bottom: 6px; left: 70px; right: 70px; height: 52px; }
.chip { position: fixed; padding: 8px 10px; border-radius: 8px; background: var(--mk-primary); color: var(--mk-primary-fg); font: 600 12px/17px var(--mk-font); white-space: nowrap; }
.help { position: fixed; left: 50%; bottom: 76px; transform: translateX(-50%); padding: 8px 14px; border-radius: 999px; background: var(--mk-surface); color: var(--mk-muted-fg); border: 1px solid var(--mk-border); font: 12px/17px var(--mk-font); white-space: nowrap; }

/* Drawer (template.primitive.sheet, non-modal) */
.sheet { pointer-events: auto; position: fixed; top: 0; bottom: 0; display: flex; flex-direction: column; background: var(--mk-surface); color: var(--mk-fg); box-shadow: var(--mk-shadow-panel); font-family: var(--mk-font); transition: transform .3s ease-in-out; }
.sheet[data-side="right"] { right: 0; border-left: 1px solid var(--mk-border); }
.sheet[data-side="left"] { left: 0; border-right: 1px solid var(--mk-border); }
.sheet[data-side="right"][hidden] { display: flex; transform: translateX(100%); visibility: hidden; }
.sheet[data-side="left"][hidden] { display: flex; transform: translateX(-100%); visibility: hidden; }
.sheet-header { display: flex; align-items: center; gap: 10px; padding: 12px 10px 12px 16px; border-bottom: 1px solid var(--mk-border); }
.brand { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1 1 auto; text-decoration: none; color: inherit; }
.brand img { width: 32px; height: 17px; object-fit: contain; flex: none; }
.brand-text { display: flex; flex-direction: column; min-width: 0; }
.sheet-title { margin: 0; font-size: 14px; line-height: 18px; font-weight: 600; letter-spacing: -.01em; }
.sheet-description { margin: 0; font-size: 12px; line-height: 16px; color: var(--mk-muted-fg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.close { opacity: .7; }
.close:hover { opacity: 1; }
.sheet-body { flex: 1 1 auto; overflow-y: auto; display: flex; flex-direction: column; }
.section { padding: 16px; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid var(--mk-border); }
.section:last-child { border-bottom: none; }
.overline { font-size: 11px; line-height: 14px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--mk-muted-fg); }
.current { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.muted { color: var(--mk-muted-fg); font-size: 13px; line-height: 19px; margin: 0; }
.empty { align-items: center; text-align: center; padding: 28px 24px; }
.empty-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: var(--mk-muted); }
.tools { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.tool { display: flex; align-items: center; gap: 10px; padding: 9px 8px; margin: 0 -8px; border-radius: var(--mk-radius-sm); text-decoration: none; color: inherit; }
.tool:hover { background: var(--mk-muted); }
.tool svg { color: var(--mk-muted-fg); flex: none; }
.tool[aria-current="page"] { background: var(--mk-muted); }
.tool-text { display: flex; flex-direction: column; min-width: 0; }
.tool-name { font-weight: 600; font-size: 13px; line-height: 18px; }
.tool-where { font-size: 11px; line-height: 14px; color: var(--mk-muted-fg); }
.sheet-footer { margin-top: auto; display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 16px; border-top: 1px solid var(--mk-border); background: var(--mk-bg); font-size: 12px; line-height: 17px; color: var(--mk-muted-fg); }
.sheet-footer span { flex: 1 1 auto; }
.sheet-footer a { color: var(--mk-fg); font-weight: 600; text-underline-offset: 3px; }
[dir="rtl"] .sheet-header { padding: 12px 16px 12px 10px; }
@media (prefers-reduced-motion: reduce) { .tab, .sheet { transition: none; } }
`;
