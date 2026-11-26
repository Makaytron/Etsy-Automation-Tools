// What the design canvas leaves to the page and the script must add: fixed
// positions over Etsy, the shadow-root host, and the inline styles of the
// canvas's drawer and edge button turned into classes with the same values.
//
// Design source: the canvas "Makaytron Etsy Automation Tools — Birleşik Panel"
// (artboards Main, Drawer-Idle, Drawer-Error, Drawer-Session, Launcher-Closed,
// Launcher-Drag, Launcher-Left/Top/Bottom), itself an adaptation of
// template.primitive.sheet, template.primitive.button and
// shadcn.blocks.application-shell (App Shell 2). All look rules come from
// suite-css.js; this file only places them.

export const SHELL_CSS = `
@keyframes eat-toast-timer { from { width: 100%; } to { width: 0; } }
@media (prefers-reduced-motion: reduce) { .toast .pl { animation: none !important; } }
:host { all: initial; }
.mkui-root { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; }
.mkui-root > * { pointer-events: auto; }
.mkui-root > .zones { pointer-events: none; }

/* Edge button (Launcher-Closed: .etab .r/.l/.t/.b) */
.etab { position: fixed; padding: 0; cursor: pointer; touch-action: none; user-select: none; font: inherit; transition: left .2s ease, top .2s ease; }
.etab img { pointer-events: none; -webkit-user-drag: none; }
/* The edge button steps aside while the full workspace is open (suite.css gives .etab display:flex, which beats [hidden]). */
.etab[hidden] { display: none; }
/* Etsy keeps its own icons on the left: there the closed button leaves a 12px handle and comes out on hover or keyboard focus. */
.etab.l:not(.att):not(.dragging):not(:hover):not(:focus-visible) { transform: translateX(-34px); }
.etab.l { transition: left .2s ease, top .2s ease, transform .15s ease; }
.etab.t .grip, .etab.b .grip { transform: rotate(90deg); }
/* Open beside the drawer it looks like the drawer's own handle (Main: .dock::before): logo only. */
.etab.att { z-index: 2; box-shadow: -6px 4px 12px -4px rgb(0 0 0 / .12); }
.etab.att.l { box-shadow: 6px 4px 12px -4px rgb(0 0 0 / .12); }
.etab.att .grip, .etab.att .st { display: none; }
.etab.dragging { transition: none; border: 1px solid #e7e7e7; border-radius: 12px; transform: rotate(-4deg); box-shadow: 0 18px 30px -8px rgb(0 0 0 / .28); cursor: grabbing; z-index: 3; }
.etab.ghost { opacity: .45; box-shadow: none; pointer-events: none; }
.etab-tip { position: fixed; z-index: 3; width: 230px; background: #1f1f1f; color: #fafafa; border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; pointer-events: none; }
.etab-tip .xxs { color: #d4d4d4; }

/* Drop zones while dragging (Launcher-Drag) */
.zones { position: fixed; inset: 0; background: rgb(255 255 255 / .35); }
.zone { position: fixed; border: 2px dashed #b4b4b4; border-radius: 12px; }
.zone[data-on] { border-color: #1f1f1f; background: rgb(31 31 31 / .04); }
.zone[data-edge="left"] { left: 6px; top: 70px; bottom: 70px; width: 56px; }
.zone[data-edge="right"] { right: 6px; top: 70px; bottom: 70px; width: 56px; }
.zone[data-edge="top"] { top: 6px; left: 70px; right: 70px; height: 52px; }
.zone[data-edge="bottom"] { bottom: 6px; left: 70px; right: 70px; height: 52px; }
.drop-chip { position: fixed; background: #1f1f1f; color: #fafafa; border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; white-space: nowrap; }
.drop-chip .xxs { color: #d4d4d4; }
.drop-help { position: fixed; left: 50%; bottom: 76px; transform: translateX(-50%); background: #fff; border: 1px solid #e7e7e7; border-radius: 999px; padding: 8px 14px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / .1); white-space: nowrap; }

/* Drawer (Main: .dock; suite.css gives it the full-height edge form) */
.dock { position: fixed; display: flex; flex-direction: column; background: #fff; transition: transform .3s ease-in-out; }
.dock[hidden] { display: flex; visibility: hidden; transform: translateX(100%); }
.dock.left[hidden] { transform: translateX(-100%); }
.dock-h { height: 56px; display: flex; align-items: center; gap: 10px; padding: 0 10px 0 14px; border-bottom: 1px solid var(--line2); flex: none; }
.dock-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--fg); min-width: 0; }
.dock-brand img { width: 32px; height: 17px; object-fit: contain; flex: none; }
.dock-brand > span { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.dock-brand b { font-size: 14px; line-height: 18px; font-weight: 700; letter-spacing: -0.02em; }
.dock-brand small { font-size: 11px; line-height: 14px; font-weight: 500; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dock-now { padding: 14px; display: flex; flex-direction: column; gap: 12px; border-bottom: 1px solid var(--line2); }
.dock > div.dock-now { overflow-y: auto; }
.dock-idle { padding: 28px 24px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; gap: 8px; border-bottom: 1px solid var(--line2); }
.dock-idle .well-lg { width: 44px; height: 44px; border-radius: 12px; background: var(--soft2); border: 1px solid var(--line); display: flex; align-items: center; justify-content: center; }
.dock-idle .h3 { margin-top: 6px; }
.dock-idle .xs { max-width: 300px; }
.dock-tools { padding: 10px 0 6px; flex: none; }
.dock-tools .ov { display: block; padding: 0 14px; }
.dock-tools .tl:first-of-type { margin-top: 4px; }
.dock-tools .tl[aria-current="page"] { background: var(--soft2); }
.dock-foot { padding: 10px 10px 10px 14px; border-top: 1px solid var(--line2); background: var(--soft2); display: flex; align-items: center; gap: 8px; flex: none; }
.dock-foot a { text-underline-offset: 3px; }
.dock-foot .ib { width: 28px; height: 28px; }
.tl { display: flex; align-items: center; gap: 10px; padding: 9px 14px; text-decoration: none; color: var(--fg); }
.tl:hover { background: var(--soft2); }
.tl svg { color: var(--muted); flex: none; }
.theme-dark .dock-h, .theme-dark .dock-now, .theme-dark .dock-idle { border-color: #262626; }
.theme-dark .dock-foot { border-color: #262626; background: #1e1e1e; }
.theme-dark .dock-idle .well-lg { background: #1e1e1e; border-color: #2e2e2e; }
[dir="rtl"] .dock-h { padding: 0 14px 0 10px; }
[dir="rtl"] .dock-foot { padding: 10px 14px 10px 10px; }
@media (prefers-reduced-motion: reduce) { .etab, .etab.l, .dock { transition: none; } }
`;
