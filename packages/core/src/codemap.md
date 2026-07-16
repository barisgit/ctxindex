# packages/core/src/

## Responsibility

Implements ctxindex's core domain and application layer: extension definition registration, Realm/Source lifecycle, authenticated provider operations, Resource/Relation persistence, sync/search/retrieval, Actions, exports, Artifacts, threads, and shared runtime infrastructure.

## Design/patterns

- Capability folders expose canonical `index.ts` Interfaces; the root `index.ts` composes the primary API and package subpaths target those capability indexes directly without root shims.
- Profiles and Adapters from `@ctxindex/extension-sdk` form the strategy/plugin boundary: `extension/loader.ts` loads definitions, `registry/` validates and indexes Profiles, Adapters, and provider-neutral OAuth declarations, Profiles own payload semantics, and Adapters own provider I/O plus API-host authority.
- Factory-built application services (`createRealmService()`, `createSourceService()`, `createThreadService()`) and repositories (`ResourceStore`, `RelationStore`, `ArtifactStore`) receive explicit database, registry, auth, and logger dependencies.
- SQLite is the system of record: `schema/` defines tables, `storage/` opens and bootstraps databases, and `sync/` applies validated Adapter emissions transactionally. Zod guards configuration, extension, provider, and payload boundaries.
- Cross-cutting contracts are centralized in `errors.ts` (`CtxindexError` hierarchy), `exit-codes.ts` (`mapSyncErrorCode()`), `ids.ts` (`newId()`), `ref/` (`parseRef()`), plus `config/`, `paths/`, `logger/`, `net/`, and `secrets/`; the latter routes typed refs without fallback and switches backends with copy/verify/reference-commit/config-commit/cleanup ordering.

## Data & control flow

1. `config/readConfig()` and `paths/` resolve runtime state; on first initialization `secrets/initialize.ts` probes Keychain, falls back to file only during selection, and persists the choice before `storage/bootstrapDatabase()` creates directories, opens SQLite, and applies migrations.
2. `extension/loadExtensions()` builds an `ExtensionRegistry`; `account/` and `auth/` establish provider-neutral Account identity and Grant state, while Realm and `source/createSourceService()` operations establish ownership and Adapter coordinates used by later calls.
3. Source sync runs `source/syncSource()` into `SyncCoordinator.run()`, which validates emissions, writes Resources through `ResourceStore`, resolves Relations through `RelationStore`, and advances durable sync state.
4. Reads and commands enter through `SearchPlanner`, `getSourceResource()`, `runAction()`, `exportSourceResource()`, `ArtifactService`, or `ThreadService`; these resolve registry definitions, invoke Adapter operations through `createSourceProviderContext()` when needed, and return validated domain results and warnings.
5. Failures cross module boundaries as typed errors from `errors.ts`; sync terminal failures are normalized to stable process outcomes by `mapSyncErrorCode()`.

## Integration points

- Public package surface: `packages/core/src/index.ts` and the subpath barrels referenced by `packages/core/package.json`.
- Provider contracts and definitions: `packages/extension-sdk/src/index.ts`, `packages/profiles/src/`, and concrete definitions in `packages/adapters/src/`.
- Application composition and consumers: `apps/cli/src/deps.ts`, CLI command handlers, and `apps/cli/src/sync/runner.ts`.
- Persistence boundary: `packages/core/src/schema/`, `packages/core/src/storage/`, and stores under `resource/`, `relation/`, and `artifact/`.
- Detailed capability maps live in each populated child `codemap.md`, including `account/`, `auth/`, `source/`, `sync/`, `search/`, `registry/`, and infrastructure folders; private cross-capability helpers are mapped under `internal/`.
