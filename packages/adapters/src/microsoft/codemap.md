# packages/adapters/src/microsoft/

## Responsibility

Owns the shared Microsoft identity provider definition and Microsoft Graph-backed Adapter implementations, including provider-owned Outlook Draft create/update mutations.

## Design/patterns

- `provider.ts` declares the provider-neutral `microsoftOAuthProvider` once for reuse by Microsoft Adapters: the `common` v2 OAuth endpoints support personal and organizational Accounts, PKCE is mandatory, the public client has no secret, and Graph `/me` supplies subject, label, email, and principal identities.
- Provider policy centralizes base scopes, fixed account-selection prompting, credential environment keys, and the only allowed OAuth/identity hosts.
- `mailbox/` implements the federated Outlook mailbox Adapter over Microsoft Graph and binds the communication Profile's shared reversible Draft contracts to Graph-specific handlers; see `packages/adapters/src/microsoft/mailbox/codemap.md`.

## Data & control flow

1. Built-in composition registers `microsoftMailboxAdapterDefinition`, whose OAuth declaration references `microsoftOAuthProvider` and adds mailbox scope `Mail.ReadWrite`.
2. Core authorization resolves `CTXINDEX_MICROSOFT_CLIENT_ID` and `CTXINDEX_MICROSOFT_REFRESH_TOKEN`, runs the Microsoft OAuth flow, and fetches Graph `/me` to establish Account identity.
3. Authenticated mailbox operation contexts then cross the Graph boundary through the child module's transport helpers. Draft create/update performs one Graph mutation, validates the returned complete Draft, and yields a canonical Source-scoped Draft Resource; no send capability is defined.

## Integration points

- Exported from `packages/adapters/src/index.ts` as `microsoftOAuthProvider` plus the mailbox config and Adapter definition.
- Consumes `OAuthProviderSpec` from `@ctxindex/extension-sdk`; the mailbox child consumes core configuration/errors and the provider-neutral communication Profile.
- External hosts: `login.microsoftonline.com` for authorization/tokens and `graph.microsoft.com` for identity and mailbox data.
