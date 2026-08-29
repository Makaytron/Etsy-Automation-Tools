# Makaytron Etsy Message Assistant v1.2.2

This standalone release hardens delivered-order messaging and compose-to-thread verification. It does not change the Etsy Automation Tools suite version, and it must not replace the suite release as GitHub `Latest`.

## Fixes

- Recognizes supported compose URLs without treating compose routes as established conversation threads.
- Resolves the explicitly labelled send control inside the trusted conversation scope, including Turkish Etsy labels, without using a generic submit-button fallback.
- Waits for route hydration and then requires the exact order, customer, composer, scope, and new outgoing-message evidence before recording a compose send as verified.
- Rejects stale identical message bubbles, identity mismatches, ambiguous controls, and compose routes in Message Center automation.
- Keeps uncertain dispatches fail-closed for manual reconciliation instead of retrying automatically.
- Rejects reused Message Center job IDs whose text or conversation identity changed, and requires the declared conversation ID to match the canonical URL before any DOM access.
- Keeps ambiguous Message Center work durably fenced across polling/reloads and exposes manual Sent / Not Sent reconciliation only on the matching hydrated conversation.
- Uses authority-scoped SHA-256 sent ledgers and durable terminal-result envelopes, so response loss retries only the exact report and never replays Etsy DOM work.
- Preserves every pre-existing composer draft, including identical text, and quarantines malformed, unknown, or future post-mutation stages before payload validation can clear evidence.
- Persists verified native sends as cross-tab postprocessing holds and lets the same-authority Message Center job claim the exact native receipt without a second Etsy click.
- Serializes Message Center dispatch with campaign coordination, defers when a campaign owns the conversation, routes native campaign clicks through the same fenced send path, and suppresses rapid duplicate native clicks for prepared standalone replies.
- Routes form submit and trusted Ctrl/Command+Enter through the guarded Send path while refusing to reinterpret a different submitter such as Save draft.
- Makes partially initialized and unknown campaign/item/order states fail closed before composer mutation or dispatch.
- Adds actionable error guidance, a read-only SHA-pinned CI workflow, expanded isolated-Chrome scenarios, deterministic standalone assets, and controlled Turkish/English live-test checklists.

## Required local validation

```powershell
node --check scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js
node --test tools/Test-Message-Assistant.mjs
node --test tools/Test-Message-Assistant-Browser-Fixture.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File tools/Test-Distribution.ps1
git diff --check
```

The fixture smoke test binds only to `127.0.0.1`, and its server process is stopped after the test. It does not open or write to Etsy.

## Build the two release assets

Run this only from the reviewed release commit:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/New-Message-Assistant-ReleaseAssets.ps1 -ExpectedVersion 1.2.2
```

The command creates an ignored `release-assets/etsy-message-assistant-v1.2.2/` directory containing exactly:

- `Makaytron-Etsy-Message-Assistant.user.js`
- `SHA256SUMS.txt`

The userscript asset is byte-identical to the reviewed source. The manifest contains its lowercase SHA-256 digest. The packager refuses to write into a non-empty output directory.

## Publish and verify

1. Confirm CI passed on the reviewed commit. A manual or matching tag run exposes the same two files as a short-lived workflow artifact; that artifact is not a published GitHub Release.
2. Create and verify a signed commit and signed annotated tag named `etsy-message-assistant-v1.2.2`.
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
