# packages/core/src/

## Responsibility

Implements provider-neutral domain and application services: Extension registration and trusted Git Catalog provenance, OAuth client/Account/Grant layering, Realm/Source lifecycle, constrained provider operations, generic storage, sync/search/retrieval, Actions, exports, Artifacts, and runtime infrastructure.

## Design / patterns

- Capability folders expose `index.ts` seams; root/package export maps publish them without provider-specific logic.
- Registries validate Profiles, Adapters, OAuth providers, scopes, and host authority; Adapters remain the provider-I/O strategy boundary.
- Factory services receive explicit database, registry, secrets, auth, and logger dependencies.
- OAuth client credentials enter through add-time declared environment names, persist as client refs, and are copied to Grant-owned refs for runtime refresh.

## Data & control flow

1. Config/paths and secrets initialize runtime state; storage applies the fresh schema.
2. Extension loading builds registries from built-ins, paths, and offline installed Catalog provenance. `catalog/` acquires explicit immutable Git snapshots; `client/` persists provider-scoped labeled clients; `account/` maintains globally labeled identities; `auth/` requests all loaded same-provider scopes and updates one stable Grant per Account.
3. Realm/Source services persist required Source labels and explicit Grant bindings; Account removal marks bound Sources `needs_auth` and clears bindings.
4. Sync/search/retrieval/Action/Artifact/export/thread services invoke constrained Adapter operations and persist validated generic results; remote-search origins use atomic SQLite-coordinated cache batches so optional contention cannot discard provider results.

## Integration points

Public through `src/index.ts` and package subpaths; consumed primarily by `apps/cli/src/deps.ts` and Adapter operation hosts. Detailed capability maps live in child folders including `catalog/`, `extension/`, `client/`, `account/`, `auth/`, `schema/`, and `source/`.
