# packages/core/src/logger/

## Responsibility

Constructs the process logger, applies mandatory secret redaction, routes records to rotating files and optional human-readable stderr, and manages rotated-log compression.

## Design

- `createLogger()` is the configurable factory; `logger()` is a memoized async singleton and `child()` adds typed operational bindings.
- Pino multistream separates the durable file destination from TTY-only `pino-pretty` output.
- `redaction.ts` owns Pino paths plus recursive field/canary sanitization; `rotation.ts` owns synchronous or `pino-roll` streams and scheduled inactive-log compression.
- `index.ts` keeps the stable logger Interface and coordinates those private Modules with Pino multistream and optional TTY presentation.

## Data & control flow

1. `createLogger()` obtains `CtxindexConfig` from options or `readConfig()`, resolves the log directory and precedence-ordered level override, and opens the file stream.
2. Each log call passes through the `logMethod` hook for recursive sanitization and optional compression scheduling.
3. Pino writes the sanitized record to the file stream and, when stderr is a TTY, to pretty stderr.
4. `logger()` shares the resulting promise; `child()` derives a logger with run/source/adapter/account/realm/operation bindings.

## Integration points

- Exported directly from `packages/core/src/logger/index.ts` as `@ctxindex/core/logger`; `apps/cli/src/deps.ts` creates the application logger.
- `RealmServiceDeps` and auth, search, secrets, and source service dependencies accept the exported `Logger` type.
- Depends on `packages/core/src/config/`, `packages/core/src/paths/index.ts`, Pino, `pino-pretty`, and `pino-roll`.
