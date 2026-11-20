// Placement of the full-window workspace over Etsy, and the inline styles of
// the design canvas's SuiteHeader and SuiteNav artboards turned into classes
// with the same values. Look rules come from suite-css.js.
//
// Design source: canvas artboards SuiteHeader, SuiteNav, Sale-Overview, Settings
// (adaptations of template.shell.site-header, template.shell.app-sidebar,
// template.shell.base-layout and shadcn.blocks.application-shell, App Shell 2).

export const WORKSPACE_CSS = `
.win { position: fixed; inset: 0; width: auto; height: auto; z-index: 4; }
.win-h { height: 64px; display: flex; align-items: center; gap: 12px; padding: 0 16px 0 20px; border-bottom: 1px solid var(--line); background: #fff; color: var(--fg); flex: none; }
.win-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--fg); min-width: 0; }
.win-brand img { width: 40px; height: 21px; object-fit: contain; flex: none; }
.win-brand > span { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.win-brand b { font-size: 16px; line-height: 18px; font-weight: 700; letter-spacing: -0.02em; }
.win-brand small { font-size: 11px; line-height: 14px; font-weight: 500; color: var(--muted); white-space: nowrap; }
.win-vsep { width: 1px; height: 20px; background: var(--line); flex: none; }
.win-bell { position: relative; }
.win-bell .cnt { position: absolute; top: -6px; right: -6px; min-width: 16px; height: 16px; padding: 0 4px; font-size: 9px; }
.win-nav { width: 248px; flex: none; display: flex; flex-direction: column; gap: 4px; padding: 16px 12px; background: var(--side); border-right: 1px solid var(--line); overflow-y: auto; }
.win-nav .ov { display: block; padding: 4px 10px 6px; }
.win-nav .ov + .ov, .win-nav .ov.g2nd { padding: 18px 10px 6px; }
.nv { min-height: 40px; padding: 6px 10px; display: flex; align-items: center; gap: 10px; border-radius: 8.4px; text-decoration: none; color: var(--ink2); font-size: 13px; font-weight: 500; border: none; background: transparent; width: 100%; text-align: start; cursor: pointer; font-family: inherit; }
.nv:hover { background: var(--soft); color: var(--fg); }
.nv.on { background: var(--soft); color: var(--fg); font-weight: 600; }
.nv svg { color: var(--muted); flex: none; }
.nv.on svg { color: var(--fg); }
.nv .here { color: var(--muted2); font-weight: 500; gap: 5px; }
.nv .here .dot { background: var(--primary); }
.nav-pro { border: 1px solid var(--line); border-radius: 10.4px; background: #fff; padding: 14px; display: flex; flex-direction: column; gap: 6px; }
.nav-pro a { text-underline-offset: 3px; }
.nav-foot { padding: 10px 10px 0; gap: 6px; }
.nav-foot a, .nav-foot button { color: var(--muted); text-decoration: none; background: none; border: none; padding: 0; font: inherit; cursor: pointer; }
.nav-foot a.site { color: var(--muted2); font-weight: 600; }
.main { overflow-y: auto; }

/* Settings pages (Settings, Settings-*) */
.cols { display: flex; gap: 16px; align-items: flex-start; }
.cols > .side { width: 460px; flex: none; gap: 16px; }
.card-flush { padding: 0; }
.card-b.col { gap: 12px; }
.err-text { color: #b91c1c !important; }
.danger-card { border: 1px solid #fecaca; border-radius: 12px; background: #fff; padding: 16px; display: flex; align-items: center; gap: 12px; }
.del-box { border: 1px solid var(--line); border-radius: 10.4px; overflow: hidden; }
.del-opt { gap: 10px; padding: 10px 12px; align-items: flex-start; cursor: pointer; }
.drawer-preview { position: relative; width: 200px; height: 118px; flex: none; border: 1px solid var(--input); border-radius: 8px; background: var(--soft2); overflow: hidden; }
.notes { margin: 0; padding-inline-start: 18px; display: flex; flex-direction: column; gap: 2px; }
.well-err { background: #fef2f2; color: #b91c1c; }
.mkui-root > .overlay { position: fixed; z-index: 7; }
.modal { max-height: calc(100vh - 80px); }
.modal-title { font-size: 17px; line-height: 24px; }
.modal-b { overflow-y: auto; }
.theme-dark .danger-card { background: #1a1a1a; border-color: #5c1d1d; }
.theme-dark .err-text { color: #f87171 !important; }
.theme-dark .del-box { border-color: #2e2e2e; }
@media (max-width: 1100px) { .cols { flex-direction: column; align-items: stretch; } .cols > .side { width: auto; } }

/* Tool pages */
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.spend-bar { width: 64px; height: 6px; border-radius: 999px; background: #f0f0f0; overflow: hidden; display: inline-block; }
.spend-bar > span { display: block; height: 6px; background: var(--primary); border-radius: 999px; }
.sale-steps { list-style: none; margin: 0; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.sale-steps .well { width: 24px; height: 24px; border-radius: 999px; }
.sale-steps .step-done { background: var(--primary); color: var(--pfg); }
.sale-steps .step-now { background: #fff; border: 2px solid var(--primary); }
.sale-steps .step-next { background: #fff; border: 1px solid var(--input); }
.code-out { border: 1px solid var(--line); border-radius: 10.4px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
.sale-form { display: contents; }
.savebar { margin: auto -32px -24px; position: sticky; bottom: -24px; }
.theme-dark .spend-bar, .theme-dark .sale-steps .step-now, .theme-dark .sale-steps .step-next { background: #262626; }
.theme-dark .code-out { border-color: #2e2e2e; }

/* First-run setup (Onboarding-Language, Onboarding) */
.ob-panel { width: 460px; max-height: min(900px, calc(100vh - 40px)); background: #fff; border: 1px solid var(--line); border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgb(0 0 0 / .25); }
.ob-panel.lang { height: min(820px, calc(100vh - 40px)); }
.ob-h { padding: 24px 24px 16px; display: flex; flex-direction: column; gap: 12px; border-bottom: 1px solid var(--line2); flex: none; }
.ob-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--fg); min-width: 0; }
.ob-brand img { width: 40px; height: 21px; object-fit: contain; flex: none; }
.ob-brand > span { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.ob-brand b { font-size: 15px; line-height: 18px; font-weight: 700; letter-spacing: -0.02em; }
.ob-brand small { font-size: 11px; line-height: 14px; font-weight: 500; color: var(--muted); white-space: nowrap; }
.ob-title { font-size: 22px; line-height: 28px; }
.ob-steps { gap: 6px; font-weight: 500; }
.ob-step { height: 4px; width: 32px; border-radius: 999px; background: var(--outline); flex: none; }
.ob-step.on { background: var(--primary); }
.ob-b { flex: 1 1 auto; min-height: 0; padding: 16px 24px; display: flex; flex-direction: column; gap: 12px; }
.ob-scroll { gap: 16px; overflow-y: auto; }
.ob-langs { border: 1px solid var(--line); border-radius: 10.4px; overflow-y: auto; flex: 1 1 auto; min-height: 0; }
.ob-f { padding: 16px 24px; border-top: 1px solid var(--line2); display: flex; align-items: center; gap: 8px; flex: none; }
.ob-link { background: none; border: none; padding: 0; font: inherit; font-size: 12px; color: var(--fg); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; text-align: start; }
.ob-set { margin: 0; padding: 0; border: none; display: flex; flex-direction: column; gap: 8px; }
.ob-set > legend { padding: 0; margin-bottom: 8px; }
.ob-tool { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--outline); border-radius: 10.4px; cursor: pointer; }
.ob-tool.on { border-color: var(--primary); }
.ob-tool .chk { margin: 2px 0 0; }
.ob-opt { display: flex; gap: 12px; align-items: flex-start; padding: 12px; border: 1px solid var(--line); border-radius: 10.4px; }
.ob-privacy { font-weight: 500; text-underline-offset: 3px; }
.lg { position: relative; }
.theme-dark .ob-panel { background: #1a1a1a; border-color: #2e2e2e; }
.theme-dark .ob-h, .theme-dark .ob-f { border-color: #262626; }
.theme-dark .ob-langs, .theme-dark .ob-opt { border-color: #2e2e2e; }
.theme-dark .ob-tool { border-color: #383838; }
.theme-dark .ob-tool.on { border-color: #ededed; }

/* Problem report dialog (Feedback) */
.fb-box { border: 1px solid var(--line); border-radius: 10.4px; overflow: hidden; }
.fb-box-h { padding: 10px 12px; background: var(--soft2); border-bottom: 1px solid var(--line2); }
.fb-box-f { padding: 8px 12px; border-top: 1px solid var(--line2); gap: 6px; }
.li.fb-fact { padding: 7px 12px; cursor: pointer; }
.fb-fact-k { width: 120px; flex: none; }
.theme-dark .fb-box, .theme-dark .fb-box-h, .theme-dark .fb-box-f { border-color: #2e2e2e; }
.theme-dark .fb-box-h { background: #1e1e1e; }
.theme-dark .fb-opt { border-color: #2e2e2e; }
.theme-dark .fb-opt.on { border-color: #ededed; box-shadow: 0 0 0 1px #ededed; }

/* Notification popover (Notifications, Notifications-Empty) */
.pop.nt { position: fixed; width: 400px; overflow: hidden; z-index: 6; }
.nt-head { padding: 14px 16px; border-bottom: 1px solid var(--line2); }
.nt-list { max-height: 420px; overflow-y: auto; }
.nt-item { display: flex; gap: 12px; padding: 12px 16px; border: none; border-bottom: 1px solid var(--line2); color: var(--fg); background: #fff; width: 100%; text-align: start; cursor: pointer; font: inherit; }
.nt-item.unread { background: var(--soft2); }
.nt-item .dot { margin-top: 7px; background: var(--primary); }
.nt-item .dot.none { background: transparent; }
.nt-foot { padding: 10px 16px; background: var(--soft2); }
.nt-empty { align-items: center; text-align: center; padding: 36px 32px 32px; gap: 8px; }
.nt-empty + .nt-foot { border-top: 1px solid var(--line2); }
.nt-well { width: 44px; height: 44px; border-radius: 12px; background: var(--soft2); border: 1px solid var(--line); display: flex; align-items: center; justify-content: center; }
.nt-link { background: none; border: none; padding: 0; color: var(--fg); cursor: pointer; text-decoration: underline; text-underline-offset: 3px; font-family: inherit; }
.theme-dark .nt-item { background: #1a1a1a; border-color: #262626; }
.theme-dark .nt-item.unread, .theme-dark .nt-foot, .theme-dark .nt-well { background: #1e1e1e; border-color: #2e2e2e; }
.theme-dark .nt-head, .theme-dark .nt-empty + .nt-foot { border-color: #262626; }
.theme-dark .win-h { background: #1a1a1a; border-color: #2e2e2e; }
.theme-dark .nav-pro { background: #1a1a1a; border-color: #2e2e2e; }
.theme-dark .win-nav { background: #161616; border-color: #2e2e2e; }
[dir="rtl"] .win-h { padding: 0 20px 0 16px; }
[dir="rtl"] .win-bell .cnt { right: auto; left: -6px; }
[dir="rtl"] .nv span { unicode-bidi: plaintext; }
@media (max-width: 1100px) {
  .win-nav { width: 64px; padding: 16px 10px; align-items: center; }
  .win-nav .ov, .win-nav .nav-pro, .win-nav .nav-foot { display: none; }
  .win-nav .nv { position: relative; width: 44px; height: 40px; min-height: 40px; padding: 0; justify-content: center; }
  .win-nav .nv > span:not(.cnt) { display: none; }
  .win-nav .nv .cnt { position: absolute; top: 2px; right: 0; min-width: 16px; height: 16px; padding: 0 4px; font-size: 9px; }
  .main { padding: 20px 24px; gap: 16px; }
}
`;
