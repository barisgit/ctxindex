# packages/core/src/source/

## Responsibility

Owns Source lifecycle and Adapter execution boundaries for sync, remote search, and retrieval, including labels, Realm/Grant validation, provider contexts, and Resource materialization.

## Design / patterns

- `createSourceService()` validates Adapter config/routing/auth, derives verbatim labels, enforces global label uniqueness, and resolves Source label-or-ID references.
- Defaults are `<account-label>-<adapter-tail>` for authenticated Sources or `<adapter-tail>` without an Account; no normalization or suffixing occurs.
- Provider contexts strip sensitive config, enforce Grant compatibility and Adapter host allowlists, and perform bounded token refresh/retry behavior.
- Remote search post-filters and Ref-deduplicates one provider origin, materializes it through one atomic Resource batch, passes through the Adapter's opaque continuation, yields after synchronous storage waits so scheduled cancellation wins, and degrades only exhausted optional-cache contention to a safe `storage_busy` warning.

## Data & control flow

Add resolves Realm, Adapter, Grant, routing, config, and label before inserting. List/status join Realm/sync state and annotate Adapter availability. Label-based commands resolve to stable IDs before remove/sync/search/status/Action operations. Provider operations invoke Adapter methods with controlled fetch and persist validated results; remote search returns verified Resources, warnings, and any continuation without interpreting the token. Cache contention preserves provider results, while cancellation and non-contention failures retain their terminal paths. Source deletion cascades Source-owned generic rows.

## Integration points

Depends on registry, auth, realm, resource, ref, storage, sync, and egress. Constructed by CLI deps and consumed by Source/status/search/get/Action/sync workflows. Exported by `@ctxindex/core/source`.
