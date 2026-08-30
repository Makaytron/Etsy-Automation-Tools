# Makaytron Etsy Message Assistant v1.2.3

This standalone patch fixes delayed order-context hydration in zero-conversation order drawers and strengthens compact-panel browser coverage. It does not change the Etsy Automation Tools suite version, and it must not replace the suite release as GitHub `Latest`.

## Fixes

- Waits for late order and buyer hydration on a receipt-bound order composer instead of abandoning the selected delivered-order customer when the composer appears first.
- Revalidates the route, campaign revision, reservation, composer identity, and composer contents during every hydration poll.
- Fails immediately on an explicit order or customer mismatch and never overwrites an occupied composer.
- Preserves Etsy's exact same-order purchases prefill until the expected order and buyer context is available.
- Keeps delivered-order preparation user-controlled: delayed hydration may insert one verified draft, but it cannot click Send, submit the form, or create outgoing-message evidence.

## Regression coverage

- Adds an isolated-Chrome zero-conversation scenario whose buyer and order DOM hydrates 1.6 seconds after the composer; it verifies one draft insertion and zero dispatches.
- Exercises the compact message-list geometry at 620px desktop-panel and 360px narrow widths with 1,000+ character language options, long customer names, translated previews, and expanded original text.
- Confirms delivered-order table overflow remains contained in its own horizontal scroller.
- Keeps the browser fixture localhost-only with external requests blocked, and closes every target, Chrome process, server, proxy, and temporary profile after the run.

## Required local validation

```powershell
node --check scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js
node --test tools/Test-Message-Assistant.mjs
node --test tools/Test-Message-Assistant-Browser-Fixture.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File tools/Test-Distribution.ps1
git diff --check
```

The fixture smoke test binds only to `127.0.0.1`, blocks external browser requests, and stops its browser and server processes after the test. It does not open or write to Etsy.

## Build the two release assets

Run this only from the reviewed release commit:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/New-Message-Assistant-ReleaseAssets.ps1 -ExpectedVersion 1.2.3
```

The command creates an ignored `release-assets/etsy-message-assistant-v1.2.3/` directory containing exactly:

- `Makaytron-Etsy-Message-Assistant.user.js`
- `SHA256SUMS.txt`

The userscript asset is byte-identical to the reviewed source. The manifest contains its lowercase SHA-256 digest. The packager refuses to write into a non-empty output directory.

## Publish and verify

1. Confirm CI passed on the reviewed commit. A manual or matching tag run exposes the same two files as a short-lived workflow artifact; that artifact is not a published GitHub Release.
2. Create and verify a signed commit and signed annotated tag named `etsy-message-assistant-v1.2.3`.
3. Push canonical `main`, then verify public Raw parity:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File tools/Test-Distribution.ps1 -Online -RemoteParity
   ```

4. Push the signed tag and publish one standalone GitHub Release with only the two generated assets. Leave the suite release as GitHub `Latest`.
5. After GitHub, Greasy Fork, and SourceForge have synchronized, run the read-only hosted gate:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File tools/Test-Distribution.ps1 -HostedChannels -PackageSlug etsy-message-assistant
   ```

Do not use `-StandaloneLatest` unless the maintainer separately decides that this standalone package should replace the suite as GitHub `Latest`.

See the controlled live smoke-test checklist in [English](../message-assistant-live-smoke-checklist.en.md) or [Turkish](../message-assistant-live-smoke-checklist.md) before the first real-account verification.
