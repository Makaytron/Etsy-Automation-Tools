# Makaytron Etsy Message Assistant v1.2.5

This standalone patch adds the explicitly opted-in, one-recipient-at-a-time Otopilot and its simplified premium Automation interface. It also verifies delivered-order sends when Etsy adds the newly created numeric conversation permalink to the receipt drawer after the native Send action, and completes conversation/history records for a user-confirmed sent reconciliation. It does not change the Etsy Automation Tools suite version, and it must not replace the suite release as GitHub `Latest`.

v1.2.4 was not tagged or published as a standalone release and is superseded by this patch.

## Otopilot contract and premium interface

- Every new campaign requires a visible **Otopilotu Başlat (Start Otopilot)** opt-in while the selected recipients, template, and method are shown. Recipient selection and the legacy/global automatic-send setting are not live-send authority.
- Otopilot processes recipients strictly one at a time. It durably records the current reservation/draft, revalidates the exact order, buyer, conversation, and text, and cannot advance until the matching outgoing Etsy bubble is verified and terminal `sent` state is durable.
- `pending`, suspicious, timed-out, malformed-stage, or identity/text/scope mismatch stops Otopilot fail-closed. It never automatically resends an uncertain item; reconciliation requires inspection of the exact Etsy conversation and an explicit **Sent / Not Sent** result.
- **Pause / Resume**, **Skip This Recipient**, and **End Automation / Stop** controls preserve the durable queue. Pause prevents the next recipient from starting after any in-flight verification; Stop cannot bypass an unresolved send result.
- The legacy/global `autoSendCampaign` preference does not authorize a new Otopilot campaign and never grants review-request authority. A review request still requires a fresh per-order eligibility decision plus campaign-specific Otopilot opt-in.
- A strict same-origin `/shop/<shop>/reviews/<numeric>` permalink inside the Completed Orders row is definitive positive evidence only with the exact visible label **Review** or **Yorum**. It is persisted as a `review_exists` block. The script does not cross-match buyer names, item titles, dashboard review cards, or public-shop HTML, and a missing permalink never means automatic eligibility; the manual **No review** confirmation remains valid for two hours.
- Automation refreshes the Completed Orders UI before **Start Otopilot**, so a known positive cannot enter the queue. If evidence appears for an already queued or prepared item, the send-time eligibility guard blocks it before Etsy dispatch.
- The premium panel separates primary work from utility navigation. Automation uses one primary action, a durable status/progress hero, and responsive recipient cards instead of the dense delivered-orders table; the safety boundaries remain unchanged.

## Fixes

- Keeps the generic composer scope fail-closed after Etsy adds `/conversations/<numeric-id>` beside the existing informational Message history link.
- Allows only the already captured pre-send receipt scope to prove the result, and only when the route, order, composer, one exact informational link, one canonical numeric permalink, and a new matching seller bubble all remain bound.
- Rejects missing timestamps, detached scopes, wrong orders/routes, extra or duplicate conversation links, unsafe URLs, and a result without an outgoing-count delta.
- Writes the conversation `sent` ledger and one idempotent `send_verified` history event when the user manually confirms a pending campaign send as sent. A not-sent reconciliation creates no verified event.

## Regression coverage

- Unit tests cover the exact numeric permalink parser, strict two-link shape, captured receipt-scope binding, outgoing delta, and manual reconciliation records.
- Review-evidence regressions cover exact row-local same-origin permalink acceptance, spoofed-origin/path/label rejection, durable `review_exists` persistence, exclusion from selection/campaign creation, and the queued/prepared send-time guard before composer or Send activity.
- The isolated-Chrome fixture adds the observed numeric permalink at native submit time while proving the generic composer resolver remains closed.
- The fixture verifies one explicit Otopilot opt-in for one controlled recipient, one native target click, one form submit, one outgoing bubble, durable terminal campaign/order/conversation ledgers, and no retry.
- Every test target, Chrome process, server, proxy, and temporary profile is closed after the run.

## Required local validation

```powershell
node --check scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js
node --check tools/Test-Message-Assistant.mjs
node --check tools/Test-Message-Assistant-Browser-Fixture.mjs
node --check tools/fixtures/message-assistant-delivered/fixture.js
node --test tools/Test-Message-Assistant.mjs
node --test tools/Test-Message-Assistant-Browser-Fixture.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File tools/Test-Distribution.ps1
git diff --check
```

The browser fixture binds only to `127.0.0.1`, blocks external browser requests, and stops its browser and server processes after the test. It does not open or write to Etsy.

## Build the two release assets

Run this only from the reviewed release commit:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/New-Message-Assistant-ReleaseAssets.ps1 -ExpectedVersion 1.2.5
```

The command creates an ignored `release-assets/etsy-message-assistant-v1.2.5/` directory containing exactly:

- `Makaytron-Etsy-Message-Assistant.user.js`
- `SHA256SUMS.txt`

The userscript asset is byte-identical to the reviewed source. The manifest contains its lowercase SHA-256 digest. The packager refuses to write into a non-empty output directory.

## Publish and verify

1. Confirm CI passed on the reviewed commit. A manual or matching tag run exposes the same two files as a short-lived workflow artifact; that artifact is not a published GitHub Release.
2. Create and verify a signed commit and signed annotated tag named `etsy-message-assistant-v1.2.5`.
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

See the controlled live smoke-test checklist in [English](../message-assistant-live-smoke-checklist.en.md) or [Turkish](../message-assistant-live-smoke-checklist.md) before any real-account verification. Live validation is limited to one controlled recipient and one explicit Otopilot opt-in; it must not be broadened into a multi-recipient run.
