# Makaytron Etsy Message Assistant v1.2.4

> Unpublished: this candidate was superseded by v1.2.5 after the controlled live smoke test exposed a post-send verification regression. Do not tag or publish v1.2.4.

This standalone patch restores delivered-order draft preparation when Etsy renders an informational Message history link inside the same receipt drawer as the composer. It does not change the Etsy Automation Tools suite version, and it must not replace the suite release as GitHub `Latest`.

## Fixes

- Treats one exact Etsy `/conversations/with/... ?ref=order_details` link as receipt-drawer metadata instead of a conflicting active conversation.
- Keeps the exception receipt-compose-only and rejects credentialed, hashed, extra-query, malformed, duplicate, or genuinely unrelated conversation links.
- Preserves the existing exact-order, exact-buyer, single-composer, single-Send-control, and occupied-draft checks.
- Keeps order-drawer preparation user-controlled: the verified draft may replace only Etsy's exact same-order purchases prefill and can never submit automatically.

## Regression coverage

- Extends the isolated-Chrome order drawer with the same Message history link structure observed on Etsy.
- Verifies one draft insertion, zero automatic Send clicks, zero form submissions, and zero outgoing bubbles before explicit user action.
- Adds unit coverage proving that duplicate or unrelated conversation links remain fail-closed and that the narrow exception is unavailable on normal message threads.
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
powershell -NoProfile -ExecutionPolicy Bypass -File tools/New-Message-Assistant-ReleaseAssets.ps1 -ExpectedVersion 1.2.4
```

The command creates an ignored `release-assets/etsy-message-assistant-v1.2.4/` directory containing exactly:

- `Makaytron-Etsy-Message-Assistant.user.js`
- `SHA256SUMS.txt`

The userscript asset is byte-identical to the reviewed source. The manifest contains its lowercase SHA-256 digest. The packager refuses to write into a non-empty output directory.

## Publish and verify

1. Confirm CI passed on the reviewed commit. A manual or matching tag run exposes the same two files as a short-lived workflow artifact; that artifact is not a published GitHub Release.
2. Create and verify a signed commit and signed annotated tag named `etsy-message-assistant-v1.2.4`.
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
