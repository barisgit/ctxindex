# packages/core/src/search/

## Responsibility

Implements validated local SQLite search and multi-Source routing that unifies indexed and provider-side results with warnings and optional execution explanations.

## Design/patterns

- `LocalSearchExecutor` is a query object over `CtxindexDatabase` plus `ProfileRegistry`; it builds parameterized SQL filters and searches resource/chunk FTS indexes.
- `SearchPlanner` applies a planner/strategy pattern: each Source is assigned local, remote, both, or unavailable legs from CLI overrides, Source routing, Adapter routing/capabilities, and hybrid coverage.
- `resolveSearchQuery()` is the preflight boundary for kind aliases, typed Profile field filters, limits, and time ranges; `sanitizeQuery()` creates strict FTS5 terms plus relaxed prefix fallback.
- Results retain evidence (`LocalSearchEvidence.indexPaths`) and origin rank; `interleave()` round-robins origins and deduplicates by Ref.

## Data & control flow

1. `SearchPlanner.search()` validates options through `resolveSearchQuery()`, selects Sources, and calls `plan()` for routing decisions.
2. Local legs call `LocalSearchExecutor.search()`, which validates Realm/Source/kind filters, queries `resources_fts` and `chunks_fts` (or all Resources for empty text), joins typed `field_index` filters, ranks candidates, and limits results.
3. Remote legs run concurrently with per-Source abort timeouts through `source/searchSourceRemote()`; failures become warnings/degraded outcomes rather than aborting all Sources.
4. Local and provider origins are interleaved, deduplicated by Ref, limited, and returned with warnings plus `SourceSearchExplain` when requested.

## Integration points

- Depends on `packages/core/src/storage/db.ts`, `registry/profile-registry.ts`, and SQLite tables/FTS indexes associated with `resources`, `chunks`, and `field_index`.
- Remote execution delegates to `packages/core/src/source/remote-search.ts`, using registry, auth, logger, and fetch dependencies.
- `apps/cli/src/commands/search.ts` constructs `SearchPlanner`; `index.ts` exports the planner, preflight, sanitizer, executor, and result/query types through `packages/core/src/search.ts`.
