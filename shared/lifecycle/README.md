# Etsy SPA lifecycle

`spa-lifecycle.js` is the shared source inlined into every userscript in the production package registry. It is bundled locally; there is no runtime fetch or remote execution.

Run `node tools/Sync-SPA-Lifecycle.mjs --write` after changing the shared source. Check with `node tools/Sync-SPA-Lifecycle.mjs --check` and `node --test tools/Test-SPA-Lifecycle.mjs`.

Broad Etsy `@match` patterns only install the lightweight route listener on the initial document. Each product retains its own runtime route predicate and delays application initialization until that predicate matches. A Tampermonkey `urlchange` listener, Navigation API listener, history traversal events, and URL-only polling cover same-document navigation without patching Etsy's history methods across userscript sandboxes.

The listener serializes lazy activation and retries entry if a previous asynchronous activation finishes after a newer entry. Route tokens include a generation and exact URL; leaving and returning to the same URL cannot revive old work. Product suspension removes its UI, stops page adaptation and automation drivers, and releases owned resources. Pending send/publication journals remain available for verification and recovery.

The Chrome regression begins on an unsupported path, loads the actual complete production script, and exercises pushState, replaceState, Back, Forward, exit, and re-entry. The fixture supplies local storage and network stubs; no real Etsy page, account, message, or API credential is used. Existing product suites cover the action-specific fences.
