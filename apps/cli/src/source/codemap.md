# apps/cli/src/source/

## Responsibility

Orchestrates CLI Source add, list, and remove operations, including adapter-config validation and auth-grant selection.

## Design / patterns

- `handleSourceCommand` dispatches the `SourceArgs.kind` discriminated union and owns dependency cleanup.
- Add operations validate JSON through the selected adapter's `configSchema.safeParse` before persistence.
- `resolveSourceGrant` isolates auth-selection policy: unauthenticated adapters need no grant; supported OAuth adapters require one unambiguous compatible grant, optionally narrowed by account.
- Validation failures use `CtxindexValidationError`; other failures flow through `mapErrorToExit`.

## Data & control flow

1. `handleSourceCommand(args)` obtains source descriptions with `loadCliDefinitions`, then calls `parseSourceArgs`.
2. `list` calls `sourceService.listSources()` and `formatSources`; `remove` calls `removeSource()` and `formatSourceRemoved`.
3. `add` resolves the requested adapter/version, parses and validates config JSON, then calls `resolveSourceGrant(authService, adapter.auth, account)`.
4. Validated realm, adapter, config, and grant data flow to `sourceService.addSource()`, followed by `formatSourceAdded`.
5. Dependencies close in `finally`; the handler returns a numeric exit code.

## Integration points

- Called by `apps/cli/src/commands/source.ts`; uses parsing from `apps/cli/src/args/source.ts`.
- Uses `loadCliDefinitions` in `apps/cli/src/definitions.ts`, `openDeps` in `deps.ts`, source formatters, and `format/exit.ts`.
- Uses registry adapter descriptions/config schemas and `SourceService` through CLI dependencies.
- `resolve-source-grant.ts` uses `AuthService`, `isGrantCompatible`, and `providerIdForAuth` from `@ctxindex/core/auth`; `--account` accepts an Account ID or Grant ID.
