# Google mailbox + Calendar Human checkpoint plan

Date prepared: 2026-07-16
Status: paused before browser login, consent, Source creation, or provider traffic.
Ignored runtime: `.ctxindex/checkpoints/google-mail-calendar/`

## Prepared isolation

- Git confirms the entire runtime is ignored through `.gitignore`'s `.ctxindex/` rule.
- Dedicated config/data/state/cache homes exist with mode-0600 plan/config files.
- The isolated config explicitly selects encrypted file secrets, preventing initialization/auth from choosing the native Keychain.
- `ctxindex init` and Realm `google-checkpoint` creation passed without provider traffic.
- No Account, Grant, Source, OAuth token, or provider payload exists yet.

A one-time `secrets status --json` confirmed `backend: file` and zero references. That status operation checks backend availability and therefore may perform its documented synthetic native-Keychain probe (random probe key write/read/delete); it did not list/read existing Keychain secrets or expose values. Do not run status again during this checkpoint.

## Consent request

One explicit loopback authorization will select both loaded Google Adapters and request exactly:

- `openid`
- `email`
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.compose`
- `https://www.googleapis.com/auth/calendar.events.readonly`

Forbidden/absent: Gmail send, Calendar write scopes, Calendar Actions, send routes, or any other mutation permission.

The user must explicitly approve opening the browser/login/consent and provide or approve two harmless search phrases expected to match at least one recent mailbox item and one event. If a query returns zero results, stop instead of broadening automatically.

## Bounded read plan after approval

1. Run one loopback authorization and let the user complete Google login/consent without sharing credentials.
2. Structurally verify one Account/one compatible Grant and exact scopes without preserving subject, token, OAuth URL/state, or credential values.
3. Add named mailbox and primary-calendar Sources in `google-checkpoint`, sharing the Grant. Bound Calendar to `past_days=1` and `future_days=7`.
4. Run one Calendar full sync over that eight-day rolling window, one exact local search, and `get` at most one returned event.
5. Run one remote Gmail search with limit 3 and `get` at most one returned message.
6. Keep raw results only in ignored mode-0600 files. Charter evidence will retain only exit status, counts, Source/Profile/Ref shape, scope names, and no-mutation/egress checks.
7. Run no Action, draft, send, attachment download, export, or Calendar mutation command.

Task 6.8 remains incomplete until the user confirms the expected Account/Sources and bounded results.
