# Security Policy

<p><a href="./SECURITY.md">Türkçe</a> · <strong>English</strong></p>

## Supported versions

Security fixes apply only to the newest userscript sources in this repository. When reporting a problem, include the affected script, installation URL, and exact version.

## Report a vulnerability

Do not place vulnerabilities, API keys, session cookies, or customer data in a public issue.

1. Use **Security → Report a vulnerability** in the repository.
2. Include the affected script and version.
3. Provide reproduction steps, expected impact, and redacted evidence.
4. Do not run destructive or irreversible experiments on a live Etsy account.

If private reporting is unavailable, use [SUPPORT.en.md](./SUPPORT.en.md) only to request contact without including sensitive details.

## Secrets and data

- API keys are stored in Tampermonkey storage and used only with the provider selected by the user.
- AI or translation text may be sent to that third-party provider.
- Configuration exports exclude keys by default. Treat exports that deliberately include keys as secrets.
- Changes that bypass Etsy Sale Manager's fail-closed checks or Message Assistant's user review controls are security-sensitive.
- Ads Keyword Manager changes visible Etsy keyword controls only after a user action; its all-page operation and remote rule-list replacement require explicit confirmation. Changes that bypass those confirmations, the local list backup, or the no-action-on-load guarantee are security-sensitive.
- Listing Analyzer performance classifications are decision support, not live-write authority. Editing or deactivating listings and other bulk actions require explicit user selection/confirmation, an exact listing identity, and before/after verification. Bypassing these boundaries, the active-job/tab lock, or fail-closed handling is security-sensitive.
- Listing Analyzer `v1.0.1` fills only approved title, description, tag, and material fields, then waits for user confirmation before Etsy Publish for every listing. For deactivation, it only opens Etsy's options and focuses the relevant item; the user clicks Deactivate and the final confirmation. Delete is never automated. AI exchange is network-free request JSON/prompt export plus validated proposal import; the script requests neither Etsy nor AI API credentials.
- Listing Analyzer retries temporary page reads/navigation at most three times; storage, schema, ownership, and Etsy-write failures are not retried. Technical error reports exclude session data and page content. Update checks verify GitHub's `main` commit identity, read only the immutable commit raw path, and open that same verified URL in Tampermonkey's confirmation screen.
- Keyword & Market Analyzer reads only the rendered Marketplace Insights DOM and uses no cookie, token, or Etsy private API. After the user starts research, a seed keyword goes to Etsy as the `query` in normal search navigation and may consume quota; hiding that transfer or bypassing quota violates the security/integrity boundary. `Search results` must remain labelled as Etsy's result/competition indicator, while opportunity remains a Makaytron-derived signal. Inventing missing metrics or removing that distinction is security- and integrity-sensitive.
- The analyzer integration validates schema/type, `requestId`, one-time nonce, expiry, a 64 KiB size cap, and content hash. Silent companion installation, remote code execution, accepting stale/replayed results, or turning research directly into automatic Publish violates the trust boundary.
- Automatic in-app update checks run no more than once per 24 hours, never open an installation page without a user click, and do not force GitHub updates over another distribution source.

Credential disclosure, unintended Etsy submissions, incorrect campaign creation, unintended advertising or listing changes/deactivation, listing/keyword research history disclosure, stale/replay integration results, rule/update-chain manipulation, and third-party boundary violations are in scope. See [PRIVACY.en.md](./PRIVACY.en.md) for data flows and retention.
