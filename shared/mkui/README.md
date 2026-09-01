# MKUI

Canonical, framework-free source for the Makaytron Etsy userscript visual system.

**Important:** this directory is intentionally not imported by production userscripts yet. The first commit creates a zero-runtime-impact foundation. The Ads Keyword Manager pilot will prove the bundling/mapping approach before MKUI is wired into other scripts.

Files:

- `tokens.css` — canonical light-theme semantic values
- `primitives.css` — framework-free component primitives
- `shells.css` — Compact / Workspace / Dashboard shell geometry
- `constants.js` — source version marker

Do not add React, Tailwind runtime, remote stylesheets or external icon dependencies to userscripts through MKUI.
