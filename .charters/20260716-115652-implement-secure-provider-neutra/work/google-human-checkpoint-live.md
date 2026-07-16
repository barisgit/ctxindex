# Google mailbox + Calendar Human checkpoint — live partial evidence

Date: 2026-07-16
State: paused before Gmail read or any wider Calendar read.

## Observed

- The user ran the ignored loopback authorization and explicitly confirmed completion.
- Safe structural inventory shows one Google Account and one Grant, with no Sources before binding.
- The Grant stored exactly five granted scopes: Calendar events read-only, Gmail compose, Gmail read-only, OpenID, and Google's canonical `userinfo.email` spelling for the requested `email` scope. It contains no Gmail send or Calendar write scope.
- Named `Google Mailbox Checkpoint` and `Google Calendar Checkpoint` Sources were bound to that same Grant in exact Realm `google-checkpoint`.
- The Calendar Source selects `primary` with `past_days=1` and `future_days=7`.
- One live Calendar sync completed successfully with zero warnings/errors and zero events in that bounded window.

## Privacy and mutation boundary

Raw account/provider output remains only in ignored mode-0600 checkpoint files. This evidence retains no email address, subject, provider id, local Account/Grant/Source id, OAuth URL/state/code, token, event/message content, attendee, or title. No Action, Draft, send, Calendar mutation, attachment, or export command ran.

## Pause reason

The approved eight-day Calendar window contains no events, so there is no event Ref for the required local search/get proof. Per the approved plan, the read was not widened automatically. Await explicit approval to replace the Calendar Source with a 30-day past / 30-day future window, then continue the bounded Calendar search/get and Gmail `newer_than:7d` limit-3 search/get.
