# Microsoft mailbox + Calendar + Draft Human checkpoint plan

Date prepared: 2026-07-16
Status: paused before app registration, browser login, consent, Source creation, provider traffic, or Draft mutation.
Ignored runtime: `.ctxindex/checkpoints/microsoft-mail-calendar/`

## Prepared isolation

- Git confirms the entire runtime is ignored by the repository `.ctxindex/` rule.
- Dedicated config/data/state/cache directories are mode 0700; plan, config, client-id placeholder, self-address placeholder, auth runner, and Draft template are mode 0600.
- The isolated config explicitly selects encrypted file secrets before initialization, so preparation did not choose or probe the native Keychain.
- `ctxindex init` and Realm `microsoft-checkpoint` creation passed with no provider traffic.
- No secret status command, Account, Grant, Source, OAuth operation, token, provider response, or Draft exists yet.

## Exact Entra registration and consent boundary

Create or reuse one public Microsoft Entra application with:

- supported account types: organizational directories plus personal Microsoft Accounts, matching the declared `/common` authority;
- Mobile and desktop applications/public-client platform;
- loopback redirect `http://127.0.0.1/callback`; ctxindex adds an ephemeral port at runtime while preserving the registered `/callback` path;
- public client flows enabled;
- no client secret, certificate, or application permission;
- Microsoft Graph delegated permissions only: `User.Read`, `Mail.ReadWrite`, and `Calendars.Read`.

The authorization request adds declared `openid` and `offline_access`. `Mail.Send`, `Calendars.ReadWrite`, application permissions, send routes, and Calendar mutation permissions are forbidden. Tenant policy may require administrator approval; stop and record that as a blocker rather than broadening permissions.

Registration references:

- <https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app>
- <https://learn.microsoft.com/en-us/entra/identity-platform/reply-url>
- <https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-registration>

The mode-0600 ignored `client-id` file accepts only the public Application ID. `run-auth.ts` supplies it in memory and performs one S256 loopback authorization selecting both Microsoft Adapters. The first mandatory pause is active now, before registration/login/consent.

## Bounded read plan after explicit approval

1. Run the prepared combined loopback authorization and let the user complete registration/login/consent without sharing credentials.
2. Structurally verify one Microsoft Account and one compatible Grant. Requested scopes are exactly `openid`, `offline_access`, `User.Read`, `Mail.ReadWrite`, and `Calendars.Read`; a token response may omit the OIDC/offline entries from its returned granted-scope list.
3. Add named `Microsoft Mailbox Checkpoint` and `Microsoft Calendar Checkpoint` Sources to exact Realm `microsoft-checkpoint`, sharing the Grant. Calendar selects `default`, `past_days=30`, and `future_days=30`.
4. Run remote mailbox query `meeting` with limit 3 and `get` at most one result. If empty, stop instead of broadening.
5. Run one Calendar sync over that bounded window, local exact-Realm query `meeting`, and `get` at most one event. If empty, stop instead of broadening.
6. Keep raw results only in ignored mode-0600 files. Tracked evidence retains structural counts, scope names, route/method classes, and no-send checks—not identities, addresses, subjects, bodies, attendees, provider ids, OAuth URLs/state/codes, tokens, or raw payloads.
7. Run no attachment download, export, Action, Draft, send, or Calendar mutation during this read phase.

## Exact Draft plan and second pause

Before mutation the user supplies their own Microsoft address only through the ignored mode-0600 `self-address` file. The prepared exact complete-replacement payloads are:

- Create: self-addressed; empty cc/bcc; subject `ctxindex Microsoft Draft checkpoint`; body `Draft checkpoint created by ctxindex. This message must remain unsent.`
- Update the returned immutable Draft Ref once: same self-address/empty cc/bcc; subject `ctxindex Microsoft Draft checkpoint updated`; body `Draft checkpoint updated once by ctxindex. This message must remain unsent.`

After bounded reads, pause again and present the resolved structural payload before any mutation. On explicit approval, permit exactly one Graph `POST /me/messages` and one `PATCH /me/messages/{immutable-id}`. Never call a send route. Then pause a third time for user Outlook UI confirmation that the updated item exists in Drafts and nothing was sent.

Task 10.4 remains incomplete until all three Human approvals and redacted live evidence are complete.
