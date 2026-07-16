# packages/core/src/paths/

## Responsibility

Centralizes resolution of ctxindex configuration, data, state, cache, and log directories.

## Design

- `resolveDir()` applies one precedence rule: `CTXINDEX_*_HOME`, then matching `XDG_*_HOME/ctxindex`, then a home-directory XDG-style default.
- `CtxindexPathEnvKey` and `XdgPathEnvKey` derive allowed keys from `EnvSchemaKey`, coupling path options to the validated environment contract.
- Public accessors (`configDir()`, `dataDir()`, `stateDir()`, `cacheDir()`, `logDir()`) prevent callers from hand-building repository paths.

## Data & control flow

Each accessor reads the memoized environment via `getEnv()`, selects the highest-precedence root, and returns a path. `logDir()` derives `logs` beneath `stateDir()`.

## Integration points

- Exported by the capability `index.ts`, which the `@ctxindex/core/paths` package subpath targets directly.
- `packages/core/src/config/io.ts` uses `configDir()`; storage and artifacts use `dataDir()`; logger uses `logDir()`; secrets use config/data paths.
- `packages/core/src/storage/init.ts` creates all five directory classes during initialization.
- Depends on `packages/core/src/config/env-loader.ts` and Node `os`/`path`.
