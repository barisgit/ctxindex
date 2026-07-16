# packages/core/src/auth/

## Responsibility

Owns Google OAuth grant lifecycle, secret references, token exchange/refresh, provider compatibility checks, and guarded Google HTTP access.

## Design/patterns

- `createAuthService()` in `service.ts` is a dependency-injected service factory implementing `AuthService` from `types.ts`; SQLite stores account/grant metadata while the injected `SecretVault` writes to the configured backend and resolves existing typed refs through their owning backend without fallback.
- `google-client.ts` is a narrow gateway for token and Gmail profile requests, with Zod response validation and egress allowlisting; loopback overrides are non-production only.
- `compatibility.ts` normalizes scope encodings and matches an `AdapterAuthSpec` to a grant by provider key plus required-scope containment.
- `index.ts` defines the public auth surface and re-exports auth-specific error types.

## Data & control flow

1. `addGoogleGrant()` writes refresh/access/client secrets, then transactionally inserts `accounts` and `grants` rows and returns generated account/grant IDs.
2. `resolveLinkedGrantAccessToken()` returns an unexpired stored access token or delegates to `refreshGoogleAccessToken()`.
3. Refresh resolves client credentials from environment or secret refs, reads the refresh token, calls `postOAuthTokenRequest()`, overwrites/stores the new access token, and updates grant expiry metadata.
4. `exchangeGoogleAuthCode()` posts the authorization-code grant; `getGoogleAccountEmail()` performs an allowlisted bearer request to the Gmail profile endpoint.

## Integration points

- Secrets/config/logging/storage dependencies are typed by `AuthDependencies` in `types.ts` and supplied from `packages/core/src/secrets/`, `config/`, `logger/`, and `storage/`.
- Network policy is enforced by `packages/core/src/net/index.ts` through `egressFetch`, `EGRESS_ALLOWLIST`, and `isLoopbackHost`.
- `packages/core/src/source/provider-context.ts` and provider-facing services consume `AuthService.resolveLinkedGrantAccessToken()`.
- Adapter auth declarations come from `@ctxindex/extension-sdk` and are checked by `isGrantCompatible()`.
