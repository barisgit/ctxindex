# packages/core/src/logger/

## Responsibility

Constructs the process logger, applies mandatory secret redaction, routes records to rotating files and optional human-readable stderr, and manages rotated-log compression.

## Design

- `createLogger()` is the configurable factory; `logger()` is a memoized async singleton and `child()` adds typed operational bindings.
- Pino multistream separates the durable file destination from TTY-only `pino-pretty` output.
- Pino path redaction covers known secret field names, while `sanitizeLogValue()` recursively redacts nested plain objects and replaces an environment-provided canary token in strings.
- `fileStream()` selects synchronous single-file output or `pino-roll`; scheduled compression gzips inactive rotated logs.

## Data & control flow

1. `createLogger()` obtains `CtxindexConfig` from options or `readConfig()`, resolves the log directory and precedence-ordered level override, and opens the file stream.
2. Each log call passes through the `logMethod` hook for recursive sanitization and optional compression scheduling.
3. Pino writes the sanitized record to the file stream and, when stderr is a TTY, to pretty stderr.
4. `logger()` shares the resulting promise; `child()` derives a logger with run/source/adapter/account/realm/operation bindings.

## Integration points

- Exported through `packages/core/src/logger.ts`; `apps/cli/src/deps.ts` creates the application logger.
- `RealmServiceDeps` and auth, search, secrets, and source service dependencies accept the exported `Logger` type.
- Depends on `packages/core/src/config/`, `packages/core/src/paths/index.ts`, Pino, `pino-pretty`, and `pino-roll`.
