# packages/core/

## Responsibility

Defines the private `@ctxindex/core` workspace package, which exposes the reusable domain, application-service, persistence, provider-execution, and runtime-infrastructure APIs used by ctxindex applications.

## Design/patterns

- `package.json` is an explicit ESM facade: `exports["."]` targets `src/index.ts`, while named subpaths such as `./storage`, `./registry`, `./source`, `./sync`, `./search`, and `./action` expose bounded capability barrels.
- `src/` is organized by capability rather than technical tier. Its registries and services coordinate Profile-owned semantics with Adapter-owned I/O, while repositories and sync workflows isolate SQLite mutation.
- The package remains source-consumed and private (`version: 0.0.0`); Bun runs TypeScript directly and `tsgo --noEmit` validates the package without a generated runtime distribution.
- Runtime dependencies reflect its boundaries: `@ctxindex/extension-sdk` for contracts, Zod for validation, Drizzle/Bun SQLite for persistence, and Pino for logging.

## Data & control flow

1. A consumer imports `@ctxindex/core` or a declared subpath; the `package.json` export map resolves directly to `src/index.ts` or the owning capability `index.ts`.
2. Application composition loads config and extensions, opens storage, constructs both secret backends behind a configured `SecretVault` plus `SecretBackendManager`, and builds auth, Realm, Source, search, and other services from exported factories and classes.
3. Core services validate calls against the extension registry, cross the provider boundary through Adapter operations when required, persist normalized state in SQLite, and return typed results, warnings, or `CtxindexError` subclasses.
4. Package scripts run type checking, Biome linting, and Bun tests in focused, integration, and e2e modes; they do not alter the runtime API surface.

## Integration points

- Primary implementation and detailed aggregate map: `packages/core/src/index.ts` and `packages/core/src/codemap.md`.
- Contract dependency: `packages/extension-sdk/src/index.ts`; applications inject semantic and provider definitions from `packages/profiles/src/` and `packages/adapters/src/` through public registry seams.
- Main application consumer/composition root: `apps/cli/src/deps.ts` and CLI command modules.
- Storage initialization consumes the migration manifest exported by `packages/core/src/migrations/index.ts`; package-level scripts and exports are declared in `packages/core/package.json`.
