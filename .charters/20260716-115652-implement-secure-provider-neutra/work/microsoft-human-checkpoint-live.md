# Microsoft mailbox + Calendar + Draft Human checkpoint — live evidence

Date: 2026-07-16
State: complete.

## Authorization and inventory

- The existing AI Gateway public-client registration was reused after the user explicitly approved portal changes, login, consent, and its previously consented broader Calendar permission in anticipation of a later Calendar-write change.
- The first live attempt failed before token issuance with safe provider code `AADSTS50194` because the registration was single-tenant while the provider contract uses `/common`. The user changed the registration to organizational-plus-personal audience and access-token version 2.
- Core was corrected test-first to advertise Microsoft-compatible `http://localhost:<ephemeral>/oauth/callback` while keeping the listener pinned to IPv4 loopback. Provider callback failures now expose only a bounded error token and vendor code, never the description, ids, state, or URL.
- One final Microsoft Account and one Grant were persisted. The authorization request selected only the mailbox and read-only Calendar Adapters, but Microsoft returned the client's cumulative granted scopes: `Calendars.Read`, `Calendars.ReadWrite`, `Mail.Read`, `Mail.ReadWrite`, `User.Read`, `email`, `openid`, and `profile`. This broader granted set is recorded rather than presented as requested scope. `Mail.Send` is absent.
- Exactly named `Microsoft Mailbox Checkpoint` and `Microsoft Calendar Checkpoint` Sources share that Grant in exact Realm `microsoft-checkpoint`. The Calendar Source selects `default`, `past_days=30`, and `future_days=30`.

## Bounded reads

- One exact-Source remote mailbox query for `meeting` returned three provider results at the explicit limit and one truncation warning. `get` on at most one result returned one complete `communication.message@1` Resource with no warning.
- One default-Calendar sync over the bounded 61-day window completed with nine supported Resources, no updates or deletions, one `microsoft_calendar_malformed_event` warning, and nine `microsoft_calendar_unresolved_series_start` warnings.
- The exact-Source local Calendar query for `meeting` returned no result. Per the approved plan, no broader query or Calendar `get` was attempted.

## Privacy and mutation boundary

Raw Account, Source, search, sync, and retrieval payloads remain only in ignored mode-0600 checkpoint files. This evidence retains no identity, address, subject, body, attendee, provider id, local Account/Grant/Source id, OAuth URL/state/code, token, event title, or message content.

After a separate explicit approval, one Outlook Draft create and one update ran against the same immutable Draft Ref. Both returned complete Resources with zero warnings; the update preserved one self-recipient, cleared CC/BCC, and left exactly one local Draft row. The user visually confirmed the exact updated subject/body in Outlook Draft editing state and then explicitly confirmed that no matching message was sent.

No send-like Action or route, Calendar mutation, attachment download, or export ran. The Human checkpoint passes with the broader provider-returned cumulative scope set disclosed above; ctxindex itself requested only the selected mailbox and read-only Calendar scopes and exercised no Calendar write capability.
