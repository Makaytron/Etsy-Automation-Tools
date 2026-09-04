# Repository agent rules

These rules apply to the entire repository.

## Tampermonkey auto-update contract

Any change to a production userscript under `scripts/**/*.user.js` must remain automatically updateable by Tampermonkey.

For every modified userscript:

1. Increase `@version` using strict `major.minor.patch` SemVer. Default to a patch increase unless the task explicitly requires a minor or major release.
2. Keep the runtime version synchronized with metadata:
   - `const APP_VERSION = 'x.y.z';`, or
   - `const VERSION = 'x.y.z';`
3. Preserve exactly one `@updateURL` and one `@downloadURL`.
4. Both URLs must point to the exact canonical raw file on `main`:
   `https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/<userscript-path>`
5. Never set `@downloadURL` to `none` for a production script.
6. Do not replace Tampermonkey's native update mechanism with remote code execution, `eval`, or a custom self-updater. Existing in-app version checks are supplemental only.
7. New production userscripts must follow the same contract from their first commit.

Before completing a userscript change, run:

```bash
node tools/Validate-Userscript-Auto-Update.mjs
```

When a base commit is available, also verify that every changed userscript increased its version:

```bash
node tools/Validate-Userscript-Auto-Update.mjs --base <base-commit>
```

The GitHub Actions workflow `.github/workflows/userscript-auto-update-contract.yml` enforces this contract on pull requests and pushes to `main`.