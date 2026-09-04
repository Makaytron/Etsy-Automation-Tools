# Repository agent rules

These rules apply to the entire repository.

## Tampermonkey auto-update and release consistency contract

Any change to a production userscript under `scripts/**/*.user.js` must remain automatically updateable by Tampermonkey and must leave the public release metadata synchronized.

For every modified existing userscript:

1. Increase `@version` using strict `major.minor.patch` SemVer. Default to a patch increase unless the task explicitly requires a minor or major release.
2. Keep the runtime version synchronized with metadata:
   - `const APP_VERSION = 'x.y.z';`, or
   - `const VERSION = 'x.y.z';`
3. Preserve the existing `@name` and `@namespace`. They are installed-userscript identity fields; changing either can create a second Tampermonkey identity instead of updating the existing installation.
4. Preserve exactly one `@updateURL` and one `@downloadURL`.
5. Both URLs must point to the exact canonical raw file on `main`:
   `https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/<userscript-path>`
6. Never set `@downloadURL` to `none` for a production script.
7. Keep release documentation synchronized with the same userscript version:
   - package `README.md`,
   - package `README.en.md`,
   - newest package `CHANGELOG.md` version heading,
   - the script row in root `README.md`,
   - the script row in root `README.tr.md`.
8. Do not rewrite historical release notes, versioned screenshots, migration baselines, or versioned audit snapshots merely because the current userscript version increased. Historical artifacts keep the version they actually represent.
9. All five current production userscripts participate in MKUI drift protection. After a production userscript change, verify the generated MKUI manifest and coexistence audit are current. Regenerate them with their documented `--write`/`--apply` commands only when the corresponding check reports drift.
10. Do not replace Tampermonkey's native update mechanism with remote code execution, `eval`, or a custom self-updater. Existing in-app version checks are supplemental only.

Adding a new production userscript is a distribution-schema change, not just a new file. Before it can ship, extend the exact-five inventory and all affected registries/gates deliberately: `tools/Test-Distribution.ps1`, hosted-channel mappings, MKUI production registry/drift coverage where applicable, root/package documentation, and a dedicated product CI. The new script must then follow the same update URL, SemVer, documentation, identity, privacy, and release rules from its first reviewed release.

Standalone release tags must use the exact form `<package-slug>-v<current-@version>`, must be annotated rather than lightweight, and must resolve to the exact reviewed commit being released. The tag signature and the release commit signature must both be verified before release publication. Package CI runs `node tools/Validate-Standalone-Tag.mjs --package-slug <package-slug>`; on GitHub tag pushes this uses GitHub's verification result, while local tag validation falls back to `git verify-tag` and `git verify-commit`. Never publish from a tag that fails this contract. Hosted-release parity remains mandatory under `DISTRIBUTION.md`.

Suite release tags must use the exact form `v<VERSION>`, must be annotated rather than lightweight, must resolve to the exact reviewed commit being released, must have `docs/releases/v<VERSION>.md` present, and must have both tag and release-commit signatures verified before publication. Suite Release CI runs `node tools/Validate-Suite-Tag.mjs`. Complete release assets and hosted-channel parity remain mandatory under `DISTRIBUTION.md`.

## Historical migration tools

`tools/Apply-Mkui-*.mjs` and `tools/Finalize-Mkui-*.mjs` are deterministic migration records for the versions named in those transformations. Do not treat their historical source/target version numbers as the current production version, and do not use a one-time migration transformer as a normal current-version CI assertion after the migration is complete.

Current production CI should validate behavior, invariants, metadata/runtime synchronization, generated manifests, and drift without requiring the production script to remain forever on the migration's historical target version.

Historical migration, pilot, preview, and audit workflows are read-only reproductions after the corresponding change has shipped. They must use `contents: read`, must not create or push branches, tags, commits, releases, or production changes, and must not act as self-updaters. Generated preview/output files may exist only in the runner workspace or be uploaded as workflow artifacts. Historical source checkout must use an immutable commit SHA and verify that exact SHA before reproduction; mutable branch names are not valid historical identities. The pinned commit must also remain an ancestor of `main` unless the historical record explicitly documents why it is intentionally outside mainline history.

## Merge discipline

GitHub branch protection may not require every repository workflow as a server-side status check. Repository agents must therefore enforce the stricter rule themselves:

1. Never merge a pull request while any workflow triggered for that PR is queued or in progress.
2. Never merge when any triggered workflow has failed, timed out, or been cancelled unless the failing workflow is proven unrelated and the repository owner explicitly accepts that exception.
3. For userscript, distribution, MKUI, fixture/privacy, or release changes, wait for every triggered product CI and shared gate to report `success` before merging.
4. Re-check the PR head SHA immediately before merge and merge only the reviewed/tested head.
5. Do not bypass this rule merely because GitHub reports the pull request as mergeable.

## Required validation

Before completing a userscript change, run:

```bash
node tools/Validate-Userscript-Auto-Update.mjs
node tools/Build-Mkui-Bundle-Manifest.mjs --check
node tools/Audit-Mkui-Cross-Script-Coexistence.mjs --check
```

When a base commit is available, also verify that every changed userscript increased its version while preserving installed identity:

```bash
node tools/Validate-Userscript-Auto-Update.mjs --base <base-commit>
```

Run the repository distribution gate on a PowerShell-capable environment:

```powershell
./tools/Test-Distribution.ps1
```

If an MKUI check reports a generated artifact is stale, use the documented regeneration command for that artifact, review the resulting diff, and rerun the checks. Do not hand-edit generated fingerprints to make a check pass.

The GitHub Actions workflow `.github/workflows/userscript-auto-update-contract.yml` enforces the core userscript release contract on pull requests and pushes to `main`. Additional MKUI and distribution workflows enforce derived artifacts and behavior.