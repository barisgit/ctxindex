# packages/core/src/search/

## Responsibility

Implements validated local SQLite search and multi-Source routing that unifies indexed and provider-side results with warnings and optional execution explanations.

## Design/patterns

- `LocalSearchExecutor` is a query object over `CtxindexDatabase` plus `ProfileRegistry`; it builds parameterized SQL filters and searches resource/chunk FTS indexes.
- `SearchPlanner` applies a planner/strategy pattern: each Source is assigned local, remote, both, or unavailable legs from CLI overrides, Source routing, Adapter routing/capabilities, and hybrid coverage. Query-less filtered remote execution is explicit, and opaque continuation is constrained to one exact remote Source.
- `resolveSearchQuery()` is the preflight boundary for kind aliases, typed Profile field filters, limits, time ranges, and provider continuation pass-through; `sanitizeQuery()` creates strict FTS5 terms plus relaxed prefix fallback.
- Results retain evidence (`LocalSearchEvidence.indexPaths`) and origin rank; `interleave()` round-robins origins and deduplicates by Ref.

## Data & control flow

1. `SearchPlanner.search()` validates options through `resolveSearchQuery()`, selects Sources, and calls `plan()` for routing decisions.
2. Local legs call `LocalSearchExecutor.search()`, which validates Realm/Source/kind filters, queries `resources_fts` and `chunks_fts` (or all Resources for empty text), joins typed `field_index` filters, ranks candidates, and limits results.
3. Remote legs run concurrently through `source/searchSourceRemote()` with per-Source timeouts linked to the caller signal; caller cancellation aborts active provider legs, while ordinary per-Source failures, including unsupported filters, become warnings/degraded outcomes rather than aborting peers. A resumed exact-Source request passes one opaque continuation to the selected Adapter, and its continuation validation remains terminal invalid usage.
4. Local and provider origins are interleaved, deduplicated by Ref, and limited. Local execution returns offset pagination; one exact-Source remote execution returns `{ limit, hasMore, continuation }`. When a merged result cannot expose an Adapter continuation, a truncation warning names the exact Source to rerun instead of promising a returned cursor; warnings and optional `SourceSearchExplain` accompany either result.

## Integration points

- Depends on `packages/core/src/storage/db.ts`, `registry/profile-registry.ts`, and SQLite tables/FTS indexes associated with `resources`, `chunks`, and `field_index`.
- Remote execution delegates to `packages/core/src/source/remote-search.ts`, using registry, auth, logger, and fetch dependencies.
- `apps/cli/src/commands/search.ts` constructs `SearchPlanner`; the capability `index.ts` is the direct `@ctxindex/core/search` target and exports the planner, preflight, sanitizer, executor, and result/query types.
