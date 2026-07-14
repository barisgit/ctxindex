## Why

The repository contains useful prototype experiments, but ctxindex has not shipped a product version. V1 needs one coherent contract through which agents can discover, retrieve, materialize, and safely act on personal context across realms and providers, instead of accumulating independent provider tools and prototype-specific storage.

## What Changes

- Establishes V1 directly; prototype databases, table names, and CLI behavior carry no migration or compatibility requirements.
- Introduces Profiles as the sole domain-vocabulary mechanism and Adapters as provider-operation implementations, bundled by trusted Extensions.
- Uses generic Resource, field-index, chunk/FTS, Relation, Artifact, and Source/Sync storage with no domain or adapter-private tables.
- Gives every Resource a stable `ctx://` Ref across synced and ad-hoc access.
- Keeps user-defined Realms (`personal`, `company`, `university`, ...) as exact operating scopes; there is no implicit `global` Realm.
- Adds uniform sync, search, retrieve, thread, download, and export operations.
- Adds typed Profile Actions implemented by Adapters through existing Source/Auth boundaries.
- Limits V1 mutations to reversible provider-persisted email Draft create/update; sending and other domain mutations are deferred.
- Derives CLI arguments, affordances, and agent documentation from loaded definitions.

## Capabilities

Canonical requirement-level behavior lives in root `SPEC.md`; OpenSpec capability specs reference its sections and capture testable V1 slices without duplicating it.

### New Capabilities

- `profile-vocabulary`: definitions, registries, pure vocabulary, and runtime validation (SPEC §3a)
- `generic-storage`: Resource storage, typed fields, origins, and Relations (SPEC §3b, §4)
- `extension-loading`: trusted dynamic loading, capability consistency, and removal semantics (SPEC §3d)
- `retrieval-and-artifacts`: get/thread/download/export and Artifact lifecycle (SPEC §10f)
- `search-routing`: local/provider planning, field filters, and warning degradation (SPEC §10, §10e)
- `provider-actions`: typed Profile Actions, Adapter bindings, affordances, and V1 email Draft behavior (SPEC §3a, §3c, §10g)

### Modified Capabilities

None. This is the first OpenSpec-managed product version.

## Impact

- `packages/core`: fresh generic schema and orchestration services; no prototype-data migration.
- `packages/extension-sdk`: public type-only authoring contract.
- `packages/profiles`: canonical Profile definitions.
- bundled Adapters: rewritten against capability contexts and normalized emissions.
- `apps/cli`: registry-derived interface, including generic `action describe|run`.
- toolchain: Bun 1.3.14 minimum project pin; D3 compiled-extension regression retained.
