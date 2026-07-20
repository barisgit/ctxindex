# packages/core/src/source/

## Responsibility

Owns Source lifecycle and Adapter execution boundaries for sync, remote search, and retrieval, including labels, Realm/Grant validation, provider contexts, and Resource materialization.

## Design / patterns

- `createSourceService()` resolves Adapters by stable id, validates config/routing and optional Provider access, derives verbatim labels, enforces global label uniqueness, and resolves Source label-or-ID references.
- Defaults are `<account-label>-<adapter-tail>` for authenticated Sources or `<adapter-tail>` without an Account; no normalization or suffixing occurs.
- Provider-backed contexts strip sensitive config, enforce Grant compatibility from the exact imported Provider plus Adapter access scopes, enforce Adapter host allowlists, and perform bounded token refresh/retry behavior. Providerless contexts bypass Account, Grant, token, and Provider egress resolution.
- Remote search post-filters and Ref-deduplicates one provider origin, materializes it through one atomic Resource batch, yields after synchronous storage waits so scheduled cancellation wins, and degrades only exhausted optional-cache contention to a safe `storage_busy` warning.

## Data & control flow

Add resolves Realm, Adapter id, optional Grant, routing, config, and label before inserting. List/status join Realm/sync state and annotate Adapter availability by id. Label-based commands resolve to stable IDs before remove/sync/search/status/Action operations. Provider operations invoke Adapter methods with controlled fetch and persist validated results; providerless operations run without auth resolution. Source deletion cascades Source-owned generic rows.

## Integration points

Depends on registry, auth, realm, resource, ref, storage, sync, and egress. Constructed by CLI deps and consumed by Source/status/search/get/Action/sync workflows. Exported by `@ctxindex/core/source`.
