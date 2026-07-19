# apps/cli/src/sync/

## Responsibility

Runs one-Source or all-eligible-Source sync, aggregates outcomes, formats results, and chooses the command exit code.

## Design / patterns

- A requested Source label or ID resolves through `SourceService` to the stable ID before sync eligibility checks.
- `SyncDeps` and `SyncServices` inject direct infrastructure/core execution; exact-tuple discovery can instead select the typed daemon client. An `AbortController` converts SIGINT to request-scoped cancellation in either route.
- Status-discriminated results support summary, compact, events, and JSON output.

## Data & control flow

The runner parses the complete argv before selection. A selected endpoint invokes `sync.run` and never falls back; no selector opens the retained-lease direct runtime and invokes `SyncApplicationService`. Both routes map into the established summary, compact, events, and JSON projections and maximum stable failure exit.

## Integration points

Called by `commands/sync.ts`; depends separately on `daemon/client.ts` for RPC and `openDeps` plus the core sync application service for the retained legacy path.
