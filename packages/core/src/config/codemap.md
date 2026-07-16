# packages/core/src/config/

## Responsibility

Owns runtime environment capture, TOML configuration persistence, schema validation/defaults, and secret-reference URI validation for core consumers.

## Design

- `env-loader.ts` defines `EnvSchema`, snapshots `process.env` through memoized `getEnv()`, and exports the key set used by typed path resolution.
- `schema.ts` uses Zod as the canonical `CtxindexConfig` contract and constructs defaults through `defaultConfig()`.
- `env-uri.ts` treats `env:`, `keychain:`, and `file:` values as secret references; `parseEnvUri()` and `resolveEnvUri()` emit typed `CtxindexConfigError`s.
- `io.ts` is the repository boundary: TOML parsing on read and atomic temp-file/rename writes with restrictive permissions.

## Data & control flow

1. `readConfig()` resolves `configPath()`, returns `defaultConfig()` when absent, otherwise parses TOML.
2. Secret references are checked before `configSchema.parse()` returns typed configuration.
3. `writeConfig()` repeats validation, serializes normalized config, creates the parent directory, writes a mode-`0600` temporary file, then renames it into place.
4. Environment consumers call `getEnv()` once per process snapshot; `resolveEnvUri()` maps an `env:` URI to that snapshot.

## Integration points

- Exported by the capability `index.ts`, targeted directly by the `@ctxindex/core/config` package subpath and re-exported by `packages/core/src/index.ts`; CLI auth, definitions, secrets commands, and adapters consume that public seam.
- `packages/core/src/paths/index.ts` supplies `configDir()` and consumes typed environment keys.
- `packages/core/src/extension/loader.ts`, `packages/core/src/logger/index.ts`, secrets, auth, and storage initialization consume configuration or environment values.
- Depends on `@iarna/toml`, Zod, Bun file I/O, and `packages/core/src/errors.ts`.
