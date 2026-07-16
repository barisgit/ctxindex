# apps/cli/bin/

## Responsibility

Provides the executable shim for the ctxindex CLI.

## Design / patterns

`ctxindex.mjs` is a thin async entry point: it contains no command or domain logic and assigns `process.exitCode` rather than terminating the process directly.

## Data & control flow

1. `apps/cli/bin/ctxindex.mjs` reads `process.argv.slice(2)`.
2. It awaits `runCli(args)` from `apps/cli/src/main.ts`.
3. The returned numeric code becomes `process.exitCode`.

## Integration points

- Called by the package executable/runtime.
- Depends only on `runCli` in `apps/cli/src/main.ts`, which owns command registration and execution.
