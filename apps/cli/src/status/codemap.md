# apps/cli/src/status/

## Responsibility

Runs ensured-daemon or unsupported-platform direct status inspection and maps the result into the established CLI presentation and exit taxonomy.

## Design / patterns

- `commands/status.ts` owns the typed Citty definition and resolves one shared pretty/text/json format before this folder receives a normalized `StatusCommandInput`, never argv.
- The handler ensures one exact daemon endpoint on supported platforms; that endpoint is authoritative and never falls back to direct database access.
- Direct execution resolves an optional Source label or ID through `SourceService`, formats status, and closes retained dependencies in `finally`.
- SIGINT is request-scoped through one `AbortController`, and errors use the shared stable exit mapping.

## Data & control flow

The command descriptor passes typed Source and semantic format to `handleStatusCommand`. The handler ensures daemon RPC or opens direct dependencies only for an unsupported result, obtains normalized rows, delegates complete compact JSON, escaped TSV, or pretty presentation to `format/status.ts`, and always removes cancellation listeners and closes direct state.

## Integration points

Called by `commands/status.ts`; depends on `daemon/client.ts`, `openDeps`, `format/status.ts`, and `format/exit.ts`.
