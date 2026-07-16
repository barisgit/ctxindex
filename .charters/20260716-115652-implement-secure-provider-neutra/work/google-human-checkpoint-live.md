# Google mailbox + Calendar Human checkpoint — live partial evidence

Date: 2026-07-16
State: Gmail read proof complete; paused before a second Calendar-window expansion.

## Observed

- The user ran the ignored loopback authorization and explicitly confirmed completion.
- Safe structural inventory shows one Google Account and one Grant, with no Sources before binding.
- The Grant stored exactly five granted scopes: Calendar events read-only, Gmail compose, Gmail read-only, OpenID, and Google's canonical `userinfo.email` spelling for the requested `email` scope. It contains no Gmail send or Calendar write scope.
- Named `Google Mailbox Checkpoint` and `Google Calendar Checkpoint` Sources were bound to that same Grant in exact Realm `google-checkpoint`.
- The Calendar Source selects `primary` with `past_days=1` and `future_days=7`.
- One live Calendar sync completed successfully with zero warnings/errors and zero events in that bounded window.
- After explicit user approval, the Calendar Source was replaced with the same name/calendar/Grant and a 30-day past / 30-day future window. That read completed but produced zero Resources and one bounded `google_calendar_unsupported_event` warning.
- The approved Gmail `newer_than:7d` remote search returned three provider results at the explicit limit and a truncation warning. `get` on at most one result returned a complete `communication.message@1` shape with no warning. Only structural keys/counts were observed; content was not copied into evidence.

## Privacy and mutation boundary

Raw account/provider output remains only in ignored mode-0600 checkpoint files. This evidence retains no email address, subject, provider id, local Account/Grant/Source id, OAuth URL/state/code, token, event/message content, attendee, or title. No Action, Draft, send, Calendar mutation, attachment, or export command ran.

## Pause reason

Neither the approved eight-day nor 60-day Calendar window produced a supported event Ref, so Calendar local search/get cannot yet run. Per the approved plan, the read will not be widened again automatically. Await explicit approval to replace the Calendar Source with a one-year past / one-year future window. Gmail search/get is complete and will not be repeated.
