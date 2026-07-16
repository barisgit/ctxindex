# packages/core/src/thread/

## Responsibility

Read service that reconstructs a conversation/thread view from stored Resources and resolved relations, returning either a deterministic tree or flat message list.

## Design/patterns

- `createThreadService()` in `thread-service.ts` is a factory over `ResourceStore` and `RelationStore`; `ThreadService.get()` is its query boundary.
- Relation names are configurable through `ThreadRelationNames`, with `DEFAULT_THREAD_RELATION_NAMES` set to `conversation` and `parent`.
- Graph discovery uses breadth-first expansion over both relation directions; parent selection is deterministic, prefers same-Source candidates, and rejects cycles through `wouldCreateCycle()`.
- `index.ts` re-exports the thread API.

## Data & control flow

1. `get(ref)` validates and loads the seed Resource, then traverses `conversation` and `parent` relations in both directions to collect visible connected Resources.
2. For each child in lexical Ref order, `RelationStore.list()` supplies parent candidates; same-Source then lexical ordering selects the first assignment that cannot create a cycle.
3. Children and roots are sorted by `occurredAt` (null last) then Ref and recursively converted to `ThreadNode` values without internal Resource IDs.
4. Missing Profile versions are deduplicated into sorted warnings. No parent assignments yields `mode: 'flat'`; otherwise the result is `mode: 'tree'`.

## Integration points

- Resource loading: `packages/core/src/resource/resource-store.ts`.
- Graph resolution/traversal: `packages/core/src/relation/relation-store.ts`.
- Profile lookup/warnings: `packages/core/src/registry/profile-registry.ts`.
- Ref validation and database access: `packages/core/src/ref/` and `packages/core/src/storage/db.ts`; public export is `packages/core/src/thread/index.ts`.
