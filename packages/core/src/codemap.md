# packages/core/src/

## Responsibility

Implements provider-neutral domain and application services: exported-value Extension collection/complete registration, trusted Git Catalog provenance, OAuth App/Account/private Grant layering, Realm/Source lifecycle, constrained provider operations, generic storage, sync/search/retrieval, Actions, exports, Artifacts, and runtime infrastructure.

## Design / patterns

- Capability folders expose `index.ts` seams; root/package export maps publish them without provider-specific logic.
- The complete registry collects reachable exact Provider/Profile/Adapter/OAuth App values from Extension roots, validates them atomically, and exposes id-keyed runtime registries; Adapters remain the provider-I/O strategy boundary.
- Factory services receive explicit database, registry, secrets, auth, and logger dependencies.
- Local OAuth App config enters only through Provider-declared registration environment names; authorization snapshots the selected App config into Grant-owned refs for runtime refresh.

## Data & control flow

1. Config/paths and secrets initialize runtime state; storage applies the fresh schema.
2. Extension loading resolves manifest-owned entries from built-ins, explicit packages, and offline installed Catalog provenance, collects exported roots, and validates one complete candidate registry. `oauth-app/` merges Extension Apps with secret-backed local BYOA records; `account/` maintains globally labeled identities; `auth/` requests all loaded same-provider scopes and updates one stable self-sufficient Grant per Account.
3. Realm/Source services persist required Source labels and explicit Grant bindings; Account removal marks bound Sources `needs_auth` and clears bindings.
4. Sync/search/retrieval/Action/Artifact/export/thread services invoke constrained Adapter operations and persist validated generic results; Action contexts include same-Source local Resource resolution and verified cached Artifact byte resolution without provider I/O. Remote-search origins use atomic SQLite-coordinated cache batches so optional contention cannot discard provider results.

## Integration points

Public through `src/index.ts` and package subpaths; consumed primarily by `apps/cli/src/deps.ts` and Adapter operation hosts. Detailed capability maps live in child folders including `catalog/`, `extension/`, `registry/`, `oauth-app/`, `account/`, `auth/`, `schema/`, and `source/`.
