# Message Assistant controlled live smoke-test checklist

This checklist is a human-controlled verification procedure for a real Etsy account. Passing local or CI tests never authorizes a live message. The final send action requires the account owner to inspect the exact recipient, order, and message and give an explicit go-ahead while present.

## Stop conditions

Stop without sending if any of these conditions is true:

- The account owner is absent or has not explicitly approved this one message.
- The order, buyer, delivery status, conversation, or message purpose is uncertain.
- A prior copy of the message may already have been sent, another Message Assistant tab is active, or the status is `pending`/unknown.
- The send control is missing, duplicated, disabled, generically labelled, or outside the expected conversation form.
- The compose route changes but the order/customer identity has not hydrated or does not match exactly.
- Etsy shows a warning, CAPTCHA, rate limit, authentication request, policy prompt, or unexpected navigation.

Do not retry an uncertain dispatch. First inspect the conversation for a new outgoing message and reconcile the status manually.

## Before opening Etsy

- [ ] Record the reviewed commit and userscript version (`1.2.2`).
- [ ] Confirm the focused tests, localhost fixture smoke, and distribution gate passed on that commit.
- [ ] Outside the live account, use the isolated fixture/test agent to prove ambiguous result → manual reconciliation → zero Etsy clicks on replay of the same job. Do not live-test Message Center until this rehearsal passes.
- [ ] Choose one delivered order and a legitimate, policy-compliant message purpose with the account owner.
- [ ] Confirm the recipient has not already received the same outreach and is not excluded by the assistant's history/status controls.
- [ ] Prepare a short, harmless draft without secrets or test-looking spam.
- [ ] Select exactly one send path. Disable unrelated campaigns/agents and close duplicate Etsy message/order tabs so only the controlled path can act.
- [ ] Agree that no cookies, nonces, buyer text, order identifiers, authenticated HTML, or unredacted screenshots will be copied into logs or issues.

## Controlled live run

- [ ] Open one new Etsy tab for the selected delivered order; leave unrelated existing tabs untouched.
- [ ] Verify the shop/account, delivered state, exact order, buyer, and intended conversation visually.
- [ ] Start the Message Assistant flow for only that order. Do not use batch/continuous mode.
- [ ] Confirm the assistant resolves one trusted conversation scope and one explicitly labelled send control.
- [ ] Compare the generated draft with the pre-approved text. Confirm the recipient and order again after any navigation.
- [ ] Pause before the final Etsy send action.
- [ ] The account owner reads the complete draft and says to send this one message now.
- [ ] Click send once. Do not double-click, refresh, navigate away, or start another run while verification is pending.
- [ ] Wait for the route and DOM to settle. Confirm exactly one new outgoing bubble appears in the correct thread.
- [ ] Confirm the assistant records the conversation/order as sent and completes the single campaign item without creating a second item.

## Failure handling

- [ ] If no outgoing bubble appears and dispatch is known not to have occurred, capture only redacted diagnostics and leave the item unsent for investigation.
- [ ] If dispatch may have occurred, treat it as unknown: do not press send again, do not run the agent, and inspect the thread after a safe wait/reload.
- [ ] If identity, scope, or button selection is wrong, close the controlled tab and return to the localhost fixture before changing code.
- [ ] Never weaken exact-identity checks, explicit labels, cross-tab locks, or fail-closed behavior to make the live smoke test pass.

## Cleanup and evidence

- [ ] Close the tab opened for the controlled run after the result is verified.
- [ ] Confirm no background campaign/agent remains active and no pending reservation or cross-tab lock remains.
- [ ] Restore only the settings intentionally changed for this test.
- [ ] Record pass/fail, timestamp, version, and redacted observations. Do not retain customer content or authenticated Etsy data.
- [ ] For a pass, record: one approved click, one outgoing message, correct identity, terminal `sent` status, and no retry.

Turkish version: [message-assistant-live-smoke-checklist.md](./message-assistant-live-smoke-checklist.md)
