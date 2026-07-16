# packages/core/src/config/

## Responsibility

Owns runtime environment capture, TOML configuration persistence, schema validation/defaults, and secret-reference URI validation for core consumers.

## Design

- `env-loader.ts` is the central typed environment allowlist. `EnvSchema` includes runtime paths/logging, provider-neutral OAuth routing, Google and Microsoft credential keys, loopback-only Gmail/Calendar/Graph test bases, and test controls; memoized `getEnv()` snapshots `process.env`, while `readEnvironmentVariable()` exposes only well-formed provider-declared `CTXINDEX_*` names.
- Microsoft additions are `CTXINDEX_MICROSOFT_CLIENT_ID`, `CTXINDEX_MICROSOFT_REFRESH_TOKEN`, and `CTXINDEX_GRAPH_MOCK_BASE_URL`; the Adapter independently constrains mock routing to non-production `127.0.0.1` origins.
- `schema.ts` defines the Zod `CtxindexConfig` contract and keychain/file secret-backend default; `env-uri.ts` validates and resolves `env:`, `keychain:`, and `file:` references; `io.ts` performs TOML reads and atomic restrictive writes.

## Data & control flow

1. `readConfig()` returns `defaultConfig()` when absent or parses and validates persisted TOML and secret references.
2. `writeConfig()` validates and normalizes configuration, writes a mode-`0600` temporary file, then atomically renames it; backend switching commits only after copied secrets and database refs are usable.
3. Environment consumers call `getEnv()` for one immutable process snapshot; OAuth providers declare central credential-key names, and `resolveEnvUri()` maps an `env:` URI to that snapshot.
4. Provider test transports read their central mock-base keys, then apply provider-specific production and loopback guards before constructing request URLs.

## Integration points

- Exported by `index.ts`, the `@ctxindex/core/config` subpath, and `packages/core/src/index.ts`; CLI auth, definitions, paths, logging, secrets, storage, and built-in Adapters consume this seam.
- Microsoft provider and mailbox consumers live under `packages/adapters/src/microsoft/`; Google counterparts consume the existing Google keys.
- Depends on `@iarna/toml`, Zod, Bun file I/O, paths, and `packages/core/src/errors.ts`.
