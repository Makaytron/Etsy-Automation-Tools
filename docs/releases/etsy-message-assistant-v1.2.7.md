# Makaytron Etsy Message Assistant v1.2.7

This standalone privacy/security patch removes personalized default shop identity data and fixes the blank-signature Otopilot text-canonicalization mismatch exposed by that change.

## Highlights

- New installs start with an empty shop name and signature; user-saved settings remain unchanged.
- Campaign drafts are canonicalized before hashing and insertion, so a blank signature cannot cause the live composer/hash checks to treat the same message as different text.
- The public fixture privacy guard enforces neutral Message Assistant identity defaults in CI.
- Public Message Assistant screenshots remain excluded unless they are regenerated from audited, fully synthetic fixtures.

## Package assets

- `Makaytron-Etsy-Message-Assistant.user.js`
- `SHA256SUMS.txt`

The userscript asset must be byte-identical to the reviewed source at the signed `etsy-message-assistant-v1.2.7` tag. The suite release remains GitHub `Latest`.
