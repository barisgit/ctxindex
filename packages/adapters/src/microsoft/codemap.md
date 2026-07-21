# packages/adapters/src/microsoft/

## Responsibility

Owns the shared Microsoft identity and Graph transport layer plus the Microsoft Calendar and Outlook mailbox Adapter implementations.

## Design/patterns

- `provider.ts` declares the reusable `microsoftOAuthProvider` definition root once with `defineProvider()` and `auth.oauth2()` for both Microsoft Adapters: the `common` v2 OAuth endpoints support personal and organizational Accounts, PKCE is mandatory, the public client has no secret, and Graph `/me` supplies subject, label, email, and principal identities.
- `oauth-app.ts` binds embedded public native-App registration metadata to that exact Provider with the ordinary SDK App factory. The owning `ctxindex.microsoft` Extension and separate bundled host policy make it eligible for managed omission; embedding is not evidence of publisher, tenant, consent, scope, or production verification.
- Provider policy centralizes base scopes, fixed account-selection prompting, the add-time `CTXINDEX_MICROSOFT_CLIENT_ID` key, and the only allowed OAuth/identity hosts; refresh tokens are persisted with Grants rather than declared as environment input.
- `transport.ts` is the provider-root Graph boundary shared by both child Adapters: canonical v1.0/mock URL construction, immutable-ID/text-body preferences, bounded JSON and HTTP error translation with retry metadata plus redacted provider diagnostics, and same-origin/path validation for opaque continuation links.
- `calendar/` implements indexed read-only event sync/retrieval against the `calendar.event@1` Profile; `mailbox/` implements federated Outlook message operations and reversible standalone or threaded-reply Draft Actions. See their child codemaps.

## Data & control flow

1. `ctxindexMicrosoftExtension` registers the public App plus Microsoft Calendar and mailbox definitions; both Adapters directly reference `microsoftOAuthProvider`, separately add `Calendars.Read` and `Mail.ReadWrite`, and bind their concrete calendar or mail Profile.
2. `account add microsoft` may resolve the policy-matched bundled App; `oauth-app add microsoft <label> --from-env` plus explicit `account add microsoft --app <label>` remains the local BYOA path. Both run the same scope-union and loopback lifecycle, persist the selected App snapshot and refresh token on the Account's stable private Grant, and fetch Graph `/me` to establish identity.
3. Authenticated operation contexts cross the shared Graph transport. Calendar sync/retrieve normalizes events and persists cursor progression; mailbox operations normalize messages and attachments, derive replies from complete local Resources, and attest one-mutation Draft results. No send capability is defined.

## Integration points

- Exported from `packages/adapters/src/index.ts` as `microsoftOAuthProvider`, `ctxindexMicrosoftOAuthApp`, and Calendar/mailbox config schemas and Adapter definitions; the App and both Adapters are registered in `builtins.ts`.
- Uses `defineProvider()` and `auth.oauth2()` from `@ctxindex/extension-sdk`; child modules consume core configuration/errors and concrete calendar/mail Profile definitions.
- External hosts: `login.microsoftonline.com` for authorization/tokens and `graph.microsoft.com` for identity, calendar, and mailbox data.
