# MKUI

Canonical, framework-free source for the Makaytron Etsy userscript visual system.

All five production userscripts carry MKUI as an inlined/mapped presentation layer. They do not fetch this directory or any remote stylesheet at runtime.

## Canonical source

- `tokens.css` — canonical light-theme semantic values
- `primitives.css` — framework-free component primitives
- `shells.css` — Compact / Workspace / Dashboard shell geometry
- `constants.js` — source version marker
- `bundle-manifest.json` — canonical bundle hash and production presentation fingerprints

Do not add React, Tailwind runtime, remote stylesheets or external icon dependencies to userscripts through MKUI.

## Production markers

`tools/Build-Mkui-Bundle-Manifest.mjs` hashes these files in a stable order:

1. `constants.js`
2. `tokens.css`
3. `primitives.css`
4. `shells.css`

The generated SHA-256 value must appear as `MKUI_BUNDLE_HASH` in every production userscript. The manifest also records each script’s `MKUI_VERSION`, userscript version and presentation fingerprint.

Verify the committed state without changing files:

```powershell
node tools/Build-Mkui-Bundle-Manifest.mjs --check
node --test tools/Test-Mkui-Drift.mjs
```

After an intentional, reviewed MKUI source or production presentation change, regenerate markers and evidence together:

```powershell
node tools/Build-Mkui-Bundle-Manifest.mjs --apply --write
node tools/Audit-Mkui-Cross-Script-Coexistence.mjs --write
```

Commit the canonical source, affected production userscripts, `bundle-manifest.json` and the coexistence audit in the same change.

## Drift exceptions

The `exceptions` array is only for a temporary, explicitly reviewed production presentation transition. An entry must contain:

```json
{
  "scriptId": "listing-analyzer",
  "expectedPresentationHash": "sha256:<old fingerprint>",
  "actualPresentationHash": "sha256:<new fingerprint>",
  "reason": "A meaningful explanation of the temporary reviewed difference.",
  "expires": "YYYY-MM-DD"
}
```

The old and new fingerprints must match exactly and the expiry must still be valid. Exceptions cannot bypass a changed canonical bundle, a missing/wrong `MKUI_BUNDLE_HASH`, an incorrect `MKUI_VERSION` or an unknown production script.

Never edit stored hashes merely to silence CI. The manifest must describe the production source that was actually reviewed.

Cross-script coexistence policy and verification commands are documented in `docs/design/MKUI-CROSS-SCRIPT-QA.md`.
