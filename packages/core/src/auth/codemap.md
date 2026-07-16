# packages/core/src/auth/

## Responsibility

Owns provider-neutral OAuth authorization, Grant lifecycle, token exchange/refresh, identity discovery, Adapter selection and compatibility, loopback PKCE, and bounded OAuth HTTP access.

## Design/patterns

- `createAuthService()` in `service.ts` is a dependency-injected `AuthService`: SQLite stores Grant metadata, `AccountService` owns Account identity upserts, and the injected `SecretsStore` persists typed client/token references.
- `authorize-provider.ts` orchestrates Adapter-derived scopes and either environment-refresh or browser loopback authorization before identity discovery and durable Grant creation.
- `selection.ts` validates provider/Adapter selection and deterministically unions provider base scopes with selected operation scopes; `compatibility.ts` checks provider identity plus required-scope containment.
- `oauth-endpoints.ts`, `oauth-token.ts`, `oauth-identity.ts`, and `oauth-scopes.ts` isolate endpoint host policy, protocol requests/validation, declared JSON identity extraction, and scope invariants; `oauth.ts` is their barrel.
- `loopback.ts` implements localhost callback OAuth with state validation and PKCE S256; browser launching and URL emission are injectable.

## Data & control flow

1. `authorizeProvider()` resolves one declared OAuth provider and selected Adapters, reads only provider-declared environment keys, and selects `loopback` or `from-env` acquisition.
2. OAuth requests resolve declared or non-production loopback endpoints, enforce the provider's `allowedHosts`, reject redirects, validate token scopes, and fetch a provider-declared subject/label/verified identities.
3. `AuthService.addGrant()` writes typed client/token secrets, then transactionally upserts the Account and inserts normalized Grant metadata; any persistence failure cleans every newly written ref.
4. `resolveLinkedGrantAccessToken()` returns an unexpired token or `refreshAccessToken()` resolves the loaded provider declaration, refreshes through its token endpoint, validates scopes, writes replacement access/refresh refs before the database update, then cleans old refs best-effort.

## Integration points

- Provider declarations and Adapter auth contracts come from `@ctxindex/extension-sdk` through `packages/core/src/registry/`; built-ins supply Google and Microsoft declarations from `packages/adapters/src/google-oauth-provider.ts` and `packages/adapters/src/microsoft/provider.ts`.
- Account persistence is delegated to `packages/core/src/account/`; secrets/config/logging/storage dependencies are supplied by their core capabilities.
- OAuth and provider API requests use `packages/core/src/net/egressFetch` with declaration-specific host lists.
- `packages/core/src/source/provider-context.ts`, CLI auth/source workflows, and provider-facing services consume the public `@ctxindex/core/auth` surface.
