# packages/core/

## Responsibility

Defines the private `@ctxindex/core` workspace package, exposing provider-neutral domain, application-service, persistence, provider-execution, and runtime-infrastructure APIs used by ctxindex applications and Adapters.

## Design/patterns

- `package.json` is an explicit ESM facade: `.` targets `src/index.ts`, while named capability subpaths expose bounded barrels.
- `src/` is organized by capability. Registries and services coordinate Profile semantics with Adapter-owned Google, Microsoft, or filesystem I/O while repositories and sync workflows isolate SQLite mutation.
- Runtime dependencies reflect core boundaries: Extension SDK contracts, Zod validation, Drizzle/Bun SQLite persistence, and Pino logging; provider SDK details remain outside core.

## Data & control flow

1. Consumers import the root or a declared subpath; exports resolve directly to source capability indexes.
2. Application composition loads central config/environment keys and extensions, opens storage, constructs secret/auth services, and builds Realm, Source, search, retrieval, Artifact, and Action workflows.
3. Core validates calls against registries, constrains provider network contexts, persists normalized state when required, and returns typed results, warnings, or core errors.

## Integration points

- Implementation and aggregate map: `packages/core/src/index.ts` and `packages/core/src/codemap.md`.
- Contracts and definitions: `packages/extension-sdk/`, `packages/profiles/`, and built-in Adapters including Microsoft identity/mailbox under `packages/adapters/src/microsoft/`.
- Primary consumer/composition root: `apps/cli/src/deps.ts`; storage initialization consumes core migrations.
