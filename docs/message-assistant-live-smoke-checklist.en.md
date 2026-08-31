# Message Assistant controlled live smoke-test checklist

This checklist validates explicit opt-in Otopilot on a real Etsy account with exactly one controlled recipient. Passing local or CI tests never authorizes a live message. Live Otopilot starts only when the account owner is present, has inspected the exact recipient, order, message, and one-item selection, and explicitly approves **Otopilotu Başlat (Start Otopilot)** for that campaign.

## Stop conditions

Stop without sending if any of these conditions is true:

- The account owner is absent or has not explicitly approved this one-recipient Otopilot campaign.
- More than one recipient is selected, the selection summary is unclear, or the primary action is not explicitly labelled **Start Otopilot**.
- The order, buyer, delivery status, conversation, or message purpose is uncertain.
- The order row contains a same-origin `/shop/<shop>/reviews/<numeric>` link labelled exactly **Review** or **Yorum**, or the assistant marks the order `review_exists`.
- There is no fresh manual confirmation that the buyer has not reviewed beyond merely not seeing a Review/Yorum link; link absence is never automatic eligibility.
- A prior copy of the message may already have been sent, another Message Assistant tab is active, or the status is `pending`/unknown.
- The send control is missing, duplicated, disabled, generically labelled, or outside the expected conversation form.
- The compose route changes but the order/customer identity has not hydrated or does not match exactly.
- Etsy shows a warning, CAPTCHA, rate limit, authentication request, policy prompt, or unexpected navigation.

Do not retry an uncertain dispatch. First inspect the conversation for a new outgoing message and reconcile the status manually.

## Before opening Etsy

- [ ] Record the reviewed commit and userscript version (`1.2.5`).
- [ ] Confirm the focused tests, localhost fixture smoke, and distribution gate passed on that commit.
- [ ] Outside the live account, use the isolated fixture/test agent to prove ambiguous result → manual reconciliation → zero Etsy clicks on replay of the same job. Do not live-test Message Center until this rehearsal passes.
- [ ] Choose one delivered order and a legitimate, policy-compliant message purpose with the account owner.
- [ ] Confirm the recipient has not already received the same outreach and is not excluded by the assistant's history/status controls.
- [ ] In the fixture, confirm a Completed Orders UI refresh turns a strict same-origin numeric row permalink labelled exactly **Review/Yorum** into a durable `review_exists` block and rejects the wrong origin, path, or label.
- [ ] Confirm the script does not match buyer names, item titles, dashboard review cards, or public-shop HTML, and that link absence does not create automatic **No review** status. Give a fresh manual **No review** confirmation for the controlled order and stay inside its two-hour lifetime.
- [ ] Prepare a short, harmless draft without secrets or test-looking spam.
- [ ] Confirm the legacy/global **Automatic Sending** setting is not treated as authority for this campaign or a review request; the new campaign must require its own **Start Otopilot** opt-in.
- [ ] Confirm **Pause**, **Resume**, and **End Automation / Stop** controls are visible and understandable.
- [ ] Select exactly one send path. Disable unrelated campaigns/agents and close duplicate Etsy message/order tabs so only the controlled path can act.
- [ ] Agree that no cookies, nonces, buyer text, order identifiers, authenticated HTML, or unredacted screenshots will be copied into logs or issues.

## Controlled live run

- [ ] Open one new Etsy tab for the selected delivered order; leave unrelated existing tabs untouched.
- [ ] Verify the shop/account, delivered state, exact order, buyer, and intended conversation visually.
- [ ] In **Automation**, select only this order. Do not broaden the live smoke test to multiple recipients; this procedure exercises the real Otopilot contract with one controlled recipient.
- [ ] Confirm the UI refresh before **Start Otopilot** reapplies review evidence. If a definitive positive appears, the order must not remain selected or queued; end the live test without sending.
- [ ] In the fixture, confirm that definitive positive evidence appearing for a selected/queued/prepared item makes the send-time eligibility guard stop before composer or Etsy Send activity; do not provoke this case with a live dispatch.
- [ ] Confirm the assistant resolves one trusted conversation scope and one explicitly labelled send control.
- [ ] Compare the generated draft with the pre-approved text. Confirm the recipient and order again after any navigation.
- [ ] Pause immediately before **Start Otopilot** and re-read the selected count (`1`), template, and method.
- [ ] The account owner reads the complete draft and explicitly approves running this one-recipient campaign now.
- [ ] Select **Start Otopilot** once. Do not also click Etsy's native Send; while verification is pending, do not double-click, refresh, navigate away, select **Resume**, or start another workflow.
- [ ] Confirm Otopilot durably reserves/prepares only this recipient and does not claim a second recipient.
- [ ] Wait for the route and DOM to settle. Confirm exactly one new outgoing bubble appears in the correct thread.
- [ ] Confirm that only after outgoing-bubble verification the assistant records durable terminal `sent` state for the conversation/order/campaign item, without creating a second item or retry.

## Failure handling

- [ ] If no outgoing bubble appears and dispatch is known not to have occurred, capture only redacted diagnostics, confirm Otopilot stopped, and leave the item unsent for investigation.
- [ ] If dispatch may have occurred, treat it as `pending`/suspicious: do not select **Resume** or **Start Otopilot**, do not resend or run the agent, and inspect the exact thread after a safe wait/reload.
- [ ] On any identity, text, scope, or outgoing-evidence mismatch, confirm Otopilot stops without automatic resend and never starts the next recipient.
- [ ] If identity, scope, or button selection is wrong, close the controlled tab and return to the localhost fixture before changing code.
- [ ] Never weaken exact-identity checks, explicit labels, cross-tab locks, or fail-closed behavior to make the live smoke test pass.

## Cleanup and evidence

- [ ] Close the tab opened for the controlled run after the result is verified.
- [ ] If the campaign is nonterminal, use **Pause** or **End Automation / Stop** only from a safe state; never mark an unresolved send Not Sent merely for cleanup.
- [ ] Confirm no Otopilot/campaign/agent remains active and no pending reservation or cross-tab lock remains.
- [ ] Restore only the settings intentionally changed for this test.
- [ ] Record pass/fail, timestamp, version, and redacted observations. Do not retain customer content or authenticated Etsy data.
- [ ] For a pass, record: one explicit Otopilot opt-in, one controlled recipient, one outgoing message, correct identity, outgoing verification, durable terminal `sent` state, and no retry.

Turkish version: [message-assistant-live-smoke-checklist.md](./message-assistant-live-smoke-checklist.md)
