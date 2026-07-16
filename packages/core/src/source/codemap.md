# packages/core/src/source/

## Responsibility

Owns Source lifecycle and the Adapter execution boundary for sync, remote search, and retrieval, including Realm/Grant validation, provider context creation, and materialization of provider Resources.

## Design/patterns

- `createSourceService()` is a service factory over database, logger, registry, and optional Realm service dependencies; it validates Adapter config/routing/auth before persistence.
- `createSourceProviderContext()` is an anti-corruption boundary: it resolves a persisted Source and Adapter, strips sensitive config keys, verifies Grant compatibility, and supplies a provider-safe fetch/logger/context.
- Authorized fetch decorates outbound requests with resolved OAuth tokens and retries one 401 after forced refresh; auth/network errors are sanitized into core error categories.
- `remote-search.ts`, `retrieve.ts`, and `sync-source.ts` are capability-specific Adapter operation facades.

## Data & control flow

1. `addSource()` resolves an explicit Realm, Adapter version, compatible Grant, routing override, and Zod-validated config, then inserts `sources`; list/status methods join Realm and sync state and annotate Adapter availability.
2. Provider operations call `createSourceProviderContext()`, which loads Source/Grant rows, resolves the Adapter registry entry and token, then invokes the Adapter with sanitized config and controlled fetch.
3. `searchSourceRemote()` verifies provider results against time/typed field filters, stores verified partial Resources as `adhoc`, and returns warnings.
4. `getSourceResource()` returns cached deleted/hydrated data or `retrieveSourceResource()` enforces exactly one matching payload-bearing Resource and stores it complete; `syncSource()` drives Adapter sync through `SyncCoordinator`.
5. `removeSource()` deletes the Source and fixed-point sweeps foreign-key orphans, including adapter-owned tables, inside a deferred-FK transaction.

## Integration points

- Depends on `packages/core/src/registry/`, `auth/`, `realm/`, `resource/`, `ref/`, `storage/`, `sync/`, and `net/egressFetch`.
- Adapter contracts come from `@ctxindex/extension-sdk`; concrete operations are supplied by `packages/adapters/` definitions.
- `apps/cli/src/deps.ts` constructs `SourceService`; CLI source/status/get commands consume its types and methods, and `apps/cli/src/sync/runner.ts` calls `syncSource()`.
- `index.ts` is exported as `@ctxindex/core/source`.
