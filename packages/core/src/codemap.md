# packages/core/src/

## Responsibility

Implements provider-neutral domain and application services: exported-value Extension collection/complete registration, package-backed Catalog authoring and trusted Git provenance, unified immutable Extension installation, offline Documentation composition, OAuth App/Account/private Grant layering, Realm/Source lifecycle, constrained provider operations, generic storage, sync/search/retrieval, Actions, exports, Artifacts, and runtime infrastructure.

## Design / patterns

- Capability folders expose `index.ts` seams; root/package export maps publish them without provider-specific logic.
- The complete registry collects reachable exact Provider/Profile/Adapter/OAuth App values from Extension roots, validates them atomically, and exposes id-keyed runtime registries; Adapters remain the provider-I/O strategy boundary.
- Factory services receive explicit database, registry, secrets, auth, and logger dependencies.
- Local OAuth App config enters only through Provider-declared registration environment names. `oauth-app/managed-policy.ts` is a pure host-policy matcher over exact active App identity, owning Extension, and supported bundled provenance; it never inspects config or scopes. Authorization snapshots either the managed-resolved or explicitly selected App config into Grant-owned refs for runtime refresh.

## Data & control flow

1. Config/paths and secrets initialize runtime state; storage applies the fresh schema.
2. Trusted Catalog authoring resolves SDK-declared literal and npm/Git/local package entries into schema-v2 manifests with replay locks. Catalog-curated installs and direct installs then share content-addressed materialization records; Extension loading verifies those unified records offline, exact-selects exported roots, and validates one complete candidate registry. `oauth-app/` merges Extension Apps with secret-backed local BYOA records and separately matches host managed policy after activation; `account/` maintains globally labeled identities; `auth/` requests all loaded same-provider scopes regardless of App origin or managed status and updates one stable self-sufficient Grant per Account.
3. Realm/Source services persist required Source labels and explicit Grant bindings; Account removal marks bound Sources `needs_auth` and clears bindings.
4. Documentation sources adapt bundled values and the validated Extension projection into deterministic inventory, exact retrieval, and bounded in-memory text search without provider or storage I/O.
5. Sync/search/retrieval/Action/Artifact/export/thread services invoke constrained Adapter operations and persist validated generic results; Action contexts include same-Source local Resource resolution and remaining-budget-bounded verified cached Artifact byte resolution without provider I/O. Remote-search origins use atomic SQLite-coordinated cache batches so optional contention cannot discard provider results.

## Integration points

Public through `src/index.ts` and package subpaths; consumed primarily by `apps/cli/src/deps.ts`, `apps/cli/src/docs/`, and Adapter operation hosts. Detailed capability maps live in child folders including `catalog/`, `direct-extension/`, `documentation/`, `extension/`, `registry/`, `oauth-app/`, `account/`, `auth/`, `schema/`, and `source/`.
