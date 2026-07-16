# apps/cli/src/auth/

## Responsibility

Orchestrates provider-neutral OAuth Grant creation from validated CLI input while leaving OAuth protocol behavior in core.

## Design / patterns

- `handleAuthCommand` parses the `AuthArgs.kind` union, maps failures to stable exit codes, and scopes loaded definitions/runtime dependencies with `finally` cleanup.
- `handleAdd` pre-validates the provider plus repeated Adapter selection, then delegates authorization to core `authorizeProvider()`.
- The CLI supplies only an authorization-URL emitter; core owns loopback PKCE, token/identity requests, scope validation, and Grant persistence.

## Data & control flow

1. `handleAuthCommand(args)` calls `parseAuthArgs` and accepts only `auth add <provider> --adapter <id>...` with exactly one of `--loopback` or `--from-env`.
2. `loadAuthDefinitionDeps()` loads config and the Extension registry; `resolveOAuthSelection()` rejects unknown, duplicate, ambiguous, non-OAuth, or cross-provider Adapter selections before database initialization.
3. `openDeps()` builds the Auth service against the same definitions, and `authorizeProvider()` runs the selected OAuth flow.
4. The handler prints the authorization URL when needed and passes the exact authorization result to `formatGrantAdded()`, which renders the persisted Grant ID, provider, and granted scopes.

## Integration points

- Called by `apps/cli/src/commands/auth.ts`; parsed by `apps/cli/src/args/auth.ts`.
- Uses `loadAuthDefinitionDeps`/`openDeps` from `apps/cli/src/deps.ts` and format/error adapters under `apps/cli/src/format/`.
- Uses `resolveOAuthSelection()` and `authorizeProvider()` from `@ctxindex/core/auth`; loaded OAuth declarations originate in Adapter definitions.
