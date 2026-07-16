# apps/cli/src/auth/

## Responsibility

Orchestrates CLI Google OAuth grant creation and listing, including credential resolution, token acquisition, account detection, and persistence.

## Design / patterns

- `handleAuthCommand` dispatches the `AuthArgs.kind` union and scopes `openDeps()` resources with `finally` cleanup.
- `resolveAddCreds` and `obtainGoogleTokens` in `add-google.ts` select explicit, environment, auth-code, refresh-token, or loopback flows.
- `openLoopbackFlow` in `google-loopback.ts` implements localhost callback OAuth with state validation and PKCE S256; browser opening is injectable.
- CLI `CtxindexAuthError` values and `mapCoreAuthError` translate flow/core failures into stable exit codes.

## Data & control flow

1. `handleAuthCommand(args)` calls `parseAuthArgs`.
2. `list` opens dependencies, calls `authService.listGoogleGrants()`, and renders `formatGrants`.
3. `add` resolves client credentials and adapter scopes via `googleOAuthScopes(registry)`.
4. `obtainGoogleTokens` either accepts/exchanges a refresh token, exchanges an auth code, or runs `openLoopbackFlow` and exchanges its callback code.
5. `detectGoogleAccountEmail` optionally resolves identity, then `authService.addGoogleGrant` persists the grant and `formatGrantAdded` renders success.

## Integration points

- Called by `apps/cli/src/commands/auth.ts`; parsed by `apps/cli/src/args/auth.ts`.
- Uses `openDeps` from `apps/cli/src/deps.ts` and formatters in `apps/cli/src/format/auth.ts` plus `format/exit.ts`.
- Uses `@ctxindex/core/auth` for token requests, account lookup, auth-provider keys, and `AuthService`; uses `@ctxindex/core/config` for `CTXINDEX_*` environment values.
- `google-loopback.ts` integrates with a localhost `node:net` server and `Bun.spawn` browser launch commands.
