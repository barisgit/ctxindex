# packages/core/src/relation/

## Responsibility

Persistence and traversal layer for named Resource relations whose targets are either exact Refs or profile-defined natural-key field/value pairs.

## Design/patterns

- `RelationStore` in `relation-store.ts` is a SQLite-backed repository with replace-all writes and derived relation resolution.
- `RelationWrite` stores unresolved intent; `StoredRelation.resolvedResourceIds` exposes current matches from `relation_resolutions`.
- `resolve()` materializes targets lazily before `list()` and `traverse()`, allowing relations to resolve as Resources or indexed fields appear later.
- `index.ts` re-exports the store API.

## Data & control flow

1. `replace()` transactionally validates the source Resource, deletes its prior edges, validates each relation/target, and inserts rows into `relations`.
2. `resolve()` clears prior resolutions, matches either `resources.ref` or `field_index(field, value_text)`, and rebuilds `relation_resolutions`.
3. `list()` resolves and returns all outgoing relation definitions plus target Resource IDs.
4. `traverse()` resolves every edge of the requested relation name, then joins resolution and Resource tables to return visible incoming, outgoing, or bidirectional neighbors; soft-deleted Resources are excluded by default.

## Integration points

- `packages/core/src/resource/resource-store.ts` derives `RelationWrite` values from Profile payload extractors and calls `RelationStore.replace()` during full writes.
- `packages/core/src/thread/thread-service.ts` uses `list()` and `traverse()` to discover conversation and parent topology.
- Target contracts come from `ProfileRelationTarget` in `@ctxindex/extension-sdk`; Ref syntax comes from `packages/core/src/ref/ref.ts`.
- Persists through `packages/core/src/storage/db.ts` into `relations`, `relation_resolutions`, `resources`, and `field_index`.
