# apps/cli/src/sync/

## Responsibility

Runs one-Source or all-eligible-Source sync, aggregates outcomes, formats results, and chooses the command exit code.

## Design / patterns

- A requested Source label or ID resolves through `SourceService` to the stable ID before sync eligibility checks; all-Source filtering resolves each Adapter by `adapter_id` only.
- `SyncDeps` and `SyncServices` inject infrastructure/core execution; an `AbortController` converts SIGINT to cooperative cancellation.
- Status-discriminated results support summary, compact, events, and JSON output.

## Data & control flow

The runner parses argv, resolves or lists adapter-version-free Source rows, filters current Adapter capabilities by stable id, executes `syncSource` sequentially, converts thrown errors to typed failed results, emits warnings, and returns the maximum stable failure exit.

## Integration points

Called by `commands/sync.ts`; depends on `openDeps`, `format/exit.ts`, registry capabilities, `SourceService`, and `@ctxindex/core/source#syncSource`.
