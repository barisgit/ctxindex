# packages/core/src/resource/

## Responsibility

Canonical SQLite repository for Resource lifecycle, Profile validation, hydration state, search projections, relation extraction, and synced-versus-adhoc deletion semantics.

## Design/patterns

- `ResourceStore` in `resource-store.ts` is a transactional repository around the `resources`, `field_index`, and `chunks` tables, delegating edges to `RelationStore`.
- `upsertMany()` is the cross-process cache-write boundary: it validates every Ref/Source association before collapsing duplicates, reserves SQLite with `BEGIN IMMEDIATE`, and delegates exhausted busy/locked result families to central storage normalization.
- Profiles act as schema plus projection strategies: schema validation, title/summary/time/chunk extraction, typed search-field extraction, and relation extraction all occur at the persistence boundary.
- Unknown Profile versions use degraded storage with `UnknownProfileWarning`; partial writes preserve already hydrated content.
- `index.ts` re-exports the repository API.

## Data & control flow

1. `upsert()` delegates one Resource to `upsertMany()`; the batch keeps the final input for each Ref and commits or rolls back all Resources and projections together.
2. `write()` obtains the Source's Realm, preserves `synced` origin precedence, derives Profile title and summary (falling back to the input envelope) plus time/chunk projections, and either updates envelope metadata for a partial existing hydration or upserts the full Resource.
3. Full writes replace field/chunk projections and call `RelationStore.replace()` with relations extracted from the payload.
4. `get()` maps a SQLite row and decoded `payload_json` to `StoredResource`; soft-deleted rows are hidden unless requested.
5. `remove()` hard-deletes `adhoc` Resources but marks `synced` Resources with `deleted_at`.

## Integration points

- Profile contracts/lookup: `@ctxindex/extension-sdk` and `packages/core/src/registry/profile-registry.ts`.
- Relations: `packages/core/src/relation/relation-store.ts`.
- Ref and identity utilities: `packages/core/src/ref/ref.ts` and `packages/core/src/ids.ts`.
- Used by Action, Artifact, Source retrieval/sync, search, and Thread services; persistence is provided by `packages/core/src/storage/db.ts`.
