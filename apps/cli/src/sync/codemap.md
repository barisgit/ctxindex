# apps/cli/src/sync/

## Responsibility

Runs one-Source or all-eligible-Source sync, aggregates outcomes, formats results, and chooses the command exit code.

## Design / patterns

- A requested Source label or ID resolves through `SourceService` to the stable ID before sync eligibility checks.
- `commands/sync.ts` owns the typed Citty definition, including bounded `mode` and output `format` enums with defaults; the runner receives `SyncCommandInput` rather than argv.
- `SyncDeps` and `SyncServices` inject unsupported-platform direct infrastructure/core execution; exact-tuple ensure selects the typed daemon client on supported platforms. An `AbortController` converts SIGINT to request-scoped cancellation in either route.
- Status-discriminated results support summary, compact, events, and JSON output. Direct and daemon routes project into one live event vocabulary.

## Data & control flow

The shared command model validates tokens and Citty produces one typed sync input before the runner ensures a route. A selected endpoint invokes streamed `sync.run` and never falls back; only an unsupported result opens the retained-lease direct runtime and invokes `SyncApplicationService` with the same awaited event sink. Events output writes each event as it arrives, human formats may place live progress on stderr, and JSON suppresses live writes so stdout remains one terminal document. Both routes preserve the established terminal projections and maximum stable failure exit.

## Integration points

Called by `commands/sync.ts`; parsing/help comes from `command-model.ts`. Runtime execution depends separately on `daemon/client.ts` for RPC and `openDeps` plus the core sync application service for the retained direct path.
