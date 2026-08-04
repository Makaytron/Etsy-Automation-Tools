# Makaytron Etsy Listing Analyzer User-Controlled Dry-Run Checklist

The user performs this checklist in their own Etsy shop. Do not share credentials, cookies, session data, or authenticated HTML. Repository automation does not edit or deactivate live listings.

## Read-only start

- Check the script version and Tampermonkey permissions.
- Open the panel on the listing-management page and first run only the visible-card scan and snapshot action.
- Compare the card count and extracted listing IDs independently with the Etsy page.
- Confirm that unreadable traffic, favorite, sale, revenue, or renewal fields appear as unknown rather than `0`.
- Repeat the same-day scan and confirm that it updates the sample instead of creating a false rise or decline.
- If you can simulate a temporary collection failure, confirm that the page is retried only a bounded number of times and that a persistent failure creates a detailed report without listing content, cookies, or session data.
- Confirm that filter presets, per-option result counts, and historical charts update from the complete collection.

## One-listing trial

- Select one non-critical listing.
- Read the proposed before/after diff, listing identity, and action type.
- Confirm that **Fields to change** contains only the intended fields. An empty tag or material list must mean clear-all only when that field was explicitly selected.
- For an AI improvement, anonymize the exported request JSON/prompt. Confirm that the script makes no provider network request and imports only validated proposal JSON.
- Compare the AI “before”, “proposal”, and post-publish “verified result” fields; an unapplied proposal must never be presented as a result.
- Confirm that the improvement experiment timeline orders planning, publishing, observation, and evaluation events correctly.
- Prefer a reversible text improvement rather than deactivation for the first trial.
- Confirm that every listing waits for explicit user approval before Etsy Publish. For deactivation, the script must only open Etsy's options and focus the relevant item; the user must click Deactivate and Etsy's final confirmation. Delete must never be automated.

## After the action

- Reload the Etsy listing page and manually verify the target field.
- Inspect the before/after values and verification result in the script's action record.
- If anything is unexpected, do not start the bulk queue. Report the problem through a private support/security channel after removing sensitive data.
- Confirm that the Tampermonkey update check anonymously reads the canonical GitHub commit identity, validates raw metadata only at that immutable commit, and never starts installation automatically.
- Delete Listing Analyzer history and exported reports separately when needed.

Etsy's current interface can change over time. Always complete this one-listing check before the first bulk write.
