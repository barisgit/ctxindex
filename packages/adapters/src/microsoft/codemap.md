# packages/adapters/src/microsoft/

## Responsibility

Owns the shared Microsoft identity and Graph transport layer plus the Microsoft Calendar and Outlook mailbox Adapter implementations.

## Design/patterns

- `provider.ts` declares the provider-neutral `microsoftOAuthProvider` once for reuse by Microsoft Adapters: the `common` v2 OAuth endpoints support personal and organizational Accounts, PKCE is mandatory, the public client has no secret, and Graph `/me` supplies subject, label, email, and principal identities.
- Provider policy centralizes base scopes, fixed account-selection prompting, the add-time `CTXINDEX_MICROSOFT_CLIENT_ID` key, and the only allowed OAuth/identity hosts; refresh tokens are persisted with Grants rather than declared as environment input.
- `transport.ts` is the provider-root Graph boundary shared by both child Adapters: canonical v1.0/mock URL construction, immutable-ID/text-body preferences, JSON and HTTP error translation with retry metadata, and same-origin/path validation for opaque continuation links.
- `calendar/` implements indexed read-only event sync/retrieval against the `calendar.event@1` Profile; `mailbox/` implements federated Outlook message operations and reversible standalone or threaded-reply Draft Actions. See their child codemaps.

## Data & control flow

1. Built-in composition registers Microsoft Calendar and mailbox definitions; both reference `microsoftOAuthProvider`, adding `Calendars.Read` and `Mail.ReadWrite` respectively.
2. `client add microsoft --from-env` imports `CTXINDEX_MICROSOFT_CLIENT_ID` into the secrets backend. Core authorization resolves that persisted client, runs loopback consent, persists the returned refresh token on the Account's stable Grant, and fetches Graph `/me` to establish identity.
3. Authenticated operation contexts cross the shared Graph transport. Calendar sync/retrieve normalizes events and persists cursor progression; mailbox operations normalize messages and attachments, derive replies from complete local Resources, and attest one-mutation Draft results. No send capability is defined.

## Integration points

- Exported from `packages/adapters/src/index.ts` as `microsoftOAuthProvider` plus Calendar and mailbox config schemas and Adapter definitions; both definitions are registered in `builtins.ts`.
- Consumes `OAuthProviderSpec` from `@ctxindex/extension-sdk`; child modules consume core configuration/errors and the provider-neutral calendar/communication Profiles.
- External hosts: `login.microsoftonline.com` for authorization/tokens and `graph.microsoft.com` for identity, calendar, and mailbox data.
