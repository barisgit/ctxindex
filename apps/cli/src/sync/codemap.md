# apps/cli/src/sync/

## Responsibility

Runs the CLI sync workflow for one Source or all eligible Sources, aggregates per-source outcomes, formats results, and determines the command exit code.

## Design / patterns

- `SyncDeps`/`OpenSyncDeps` and `SyncServices` inject infrastructure and the core `syncSource` operation.
- `SourceSyncOutput` is a status-discriminated success/failure union used for aggregation and rendering.
- An `AbortController` converts `SIGINT` into cooperative cancellation and is removed in `finally`.
- `formatSyncOutput` supports summary, compact, event-stream, and JSON representations.

## Data & control flow

1. `handleSyncCommand` parses argv with `parseSyncArgs` and opens dependencies.
2. A requested Source is looked up and checked for sync eligibility; otherwise sources are listed, filtered to sync-enabled adapters, and sorted.
3. Sources run sequentially through injected `syncSource({ db, registry, authService, logger, sourceId, mode, signal })`.
4. Success results retain run counts/warnings; thrown failures become `FailedSourceSync` values via `mapErrorToExit`.
5. `formatSyncOutput` renders the aggregate, and the handler returns the maximum failure exit code or zero.

## Integration points

- Called by `apps/cli/src/commands/sync.ts`; parsing comes from `apps/cli/src/args/sync.ts`.
- Default infrastructure comes from `openDeps` in `apps/cli/src/deps.ts`; failures use `apps/cli/src/format/exit.ts`.
- Core execution is `syncSource` from `@ctxindex/core/source`; result types come from `@ctxindex/core/sync` and modes from `@ctxindex/extension-sdk`.
- Source selection uses `sourceService` and registry adapter capabilities supplied by `CliDeps`.
