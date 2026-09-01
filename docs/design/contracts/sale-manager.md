# Behavioral UI Contract — Etsy Sale Manager

Baseline version: **1.0.12**
Source: `scripts/etsy-sale-campaign-batch-runner/Etsy-Sale-Campaign-Batch-Runner.user.js`

## Mount/isolation

- Current UI is not Shadow DOM based.
- Existing visual system uses script-scoped `eda-` styles/tokens.
- Uses userscript style/resource APIs; preserve current mount strategy during v1 visual migration.

## High-risk protected domains

This script performs Etsy write operations. MKUI work must not alter:

- campaign/sale creation logic
- form/transition/scope selectors
- verification and network verification
- batching/scheduling/retry safeguards
- duplicate/double-submit protections
- busy/disabled semantics
- telemetry/storage contracts
- grants/connect/match URLs

## QA gate

A visually correct Sale Manager is not acceptable unless create/confirm/verify/report behavior passes the pre-migration functional checks with the same state transitions.
