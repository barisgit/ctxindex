# packages/core/

## Responsibility

Defines the private `@ctxindex/core` workspace package, exposing provider-neutral domain, application-service, persistence, provider-execution, and runtime-infrastructure APIs used by ctxindex applications and Adapters.

## Design/patterns

- `package.json` is an explicit ESM facade: `.` targets `src/index.ts`, while named capability subpaths expose bounded barrels.
- `src/` is organized by capability. Registries and services coordinate Profile semantics with Adapter-owned Google, Microsoft, or filesystem I/O while repositories and sync workflows isolate SQLite mutation.
- `src/sync/application-service.ts` extracts target resolution, deterministic multi-Source orchestration, failure normalization, and warning aggregation from presentation and transport so direct CLI and daemon composition share one application behavior.
- Runtime dependencies reflect core boundaries: Extension SDK contracts, Zod validation, Drizzle/Bun SQLite persistence, and Pino logging; provider SDK details remain outside core.

## Data & control flow

1. Consumers import the root or a declared subpath; exports resolve directly to source capability indexes.
2. Application composition loads built-in, manifest-declared explicit, and exact installed Catalog Extension entries through common export collection, documentation resolution, and complete-registry validation, opens storage, constructs typed secret, OAuth App, Account/private Grant, Realm, and Source services, then builds operation workflows.
3. Core validates calls against registries, constrains provider network contexts, persists normalized state when required, and returns typed results, warnings, or core errors.
4. `SyncApplicationService.run()` resolves an optional Source reference or enumerates eligible sync-enabled Sources, invokes `syncSource()` serially with cancellation, preserves per-Source failures, and returns a provider-neutral aggregate for either direct CLI rendering or daemon RPC projection.

## Integration points

- Implementation and aggregate map: `packages/core/src/index.ts` and `packages/core/src/codemap.md`; trusted Git distribution is mapped under `packages/core/src/catalog/codemap.md`.
- Contracts and definitions: `packages/extension-sdk/`, `packages/profiles/`, and built-in Adapters including Microsoft identity/mailbox under `packages/adapters/src/microsoft/`.
- Primary consumers/composition roots: `apps/cli/src/deps.ts` and `apps/daemon/src/runtime.ts`; storage initialization consumes core migrations, while both sync routes construct the same core application service.
