# Google mailbox + Calendar Human checkpoint — live partial evidence

Date: 2026-07-16
State: complete.

## Observed

- The user ran the ignored loopback authorization and explicitly confirmed completion.
- Safe structural inventory shows one Google Account and one Grant, with no Sources before binding.
- The Grant stored exactly five granted scopes: Calendar events read-only, Gmail compose, Gmail read-only, OpenID, and Google's canonical `userinfo.email` spelling for the requested `email` scope. It contains no Gmail send or Calendar write scope.
- Named `Google Mailbox Checkpoint` and `Google Calendar Checkpoint` Sources were bound to that same Grant in exact Realm `google-checkpoint`.
- The Calendar Source selects `primary` with `past_days=1` and `future_days=7`.
- One live Calendar sync completed successfully with zero warnings/errors and zero events in that bounded window.
- After explicit user approval, the Calendar Source was replaced with the same name/calendar/Grant and a 30-day past / 30-day future window. That read completed but produced zero Resources and one bounded `google_calendar_unsupported_event` warning.
- The approved Gmail `newer_than:7d` remote search returned three provider results at the explicit limit and a truncation warning. `get` on at most one result returned a complete `communication.message@1` shape with no warning. Only structural keys/counts were observed; content was not copied into evidence.
- Under the user's explicit blanket approval to continue read-only verification, the final primary-Calendar Source used a one-year past / one-year future window. Sync completed with two supported Resources and six bounded unsupported-event warnings.
- Local Calendar search for the approved broad term returned one `calendar.event@1` from the exact Source. `get` returned one complete synced Google timed-event shape with title/status/provider identity fields present and no warning; no values were copied into evidence.
- Final inventory structurally confirms one Google Account, one Grant, and exactly the named mailbox/calendar Sources in Realm `google-checkpoint`, both linked to that Grant.

## Privacy and mutation boundary

Raw account/provider output remains only in ignored mode-0600 checkpoint files. This evidence retains no email address, subject, provider id, local Account/Grant/Source id, OAuth URL/state/code, token, event/message content, attendee, or title. No Action, Draft, send, Calendar mutation, attachment, or export command ran.

## Result

The live checkpoint passes. One compatible Grant supports both named Sources; Calendar sync/search/get and bounded Gmail remote search/get succeeded through generic commands. The only provider mutations were OAuth authorization/token operations explicitly approved by the user. No ctxindex Action, Draft, send, Calendar write, attachment download, or export ran.
