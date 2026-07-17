## Context

`search` currently hard-requires query text (`apps/cli/src/args/search.ts` rejects an empty positional) and supports only `--limit` with no way to resume past the first page. `SearchPlanner` (packages/core/src/search/planner.ts) plans local and remote legs per Source; `LocalSearchExecutor` (local-search.ts) already has an `allResources` enumeration path (used when the sanitized FTS query is empty) and a deterministic rank-then-ref sort. Remote search fans out to `search-remote` Adapters. Bundled skills never mention `--limit` or pagination.

Constraints: exit codes are stable API (SPEC §12, invalid usage = 2); `--json` output must be deterministic; no storage schema, auth, or adapter changes; remote filter-only enumeration and remote pagination are deferred.

## Goals / Non-Goals

**Goals:**
- Query positional optional when at least one filter (`--realm`, `--adapter`, `--source`, `--kind`, `--field`, `--since`, `--until`) is present: filter-only LOCAL enumeration with deterministic ordering.
- Local pagination for `search` so truncated result sets are resumable.
- Bundled skills teach filter-only enumeration and the pagination idiom.

**Non-Goals:**
- Remote filter-only enumeration and remote pagination (deferred; documented in the delta spec).
- Storage schema, auth, adapter, or `search-remote` contract changes.
- Ranking changes for queryful search.

## Decisions

### D1: `--offset` over an opaque continuation token

Local pagination uses `--offset <n>` (default 0) combined with the existing `--limit`.

Rationale: the local index is a single SQLite snapshot on one machine; there is no distributed cursor-consistency problem a token would solve. Ordering is already fully deterministic (enumeration: `occurred_at` DESC then `ref`; queryful: rank then `ref`), so `offset` is stable across invocations against an unchanged index. An opaque continuation token would require encoding/decoding, expiry semantics, and error taxonomy for stale tokens — all speculative complexity for a local CLI whose consumers are agents that can trivially add `--offset 20`. Interleaved writes between pages can shift an offset window either way; a snapshot token could only fix that by pinning state, which is out of scope pre-alpha.

### D2: `--offset` is valid only for local execution

`--offset` is accepted when the execution is guaranteed local: a filter-only (query-less) search, or a queryful search with `--local-only`. `--offset` with `--remote`, or with a queryful search that is not `--local-only`, is a usage error (exit 2). This keeps pagination deterministic: interleaved provider results have no stable global order to offset into. Remote pagination is deferred.

### D3: Filter-only enumeration is local-only and ordered by timestamp

When the query positional is absent and at least one filter is present, the planner runs ONLY the local leg for all planned Sources (equivalent to `--local-only`), regardless of Adapter routing. A query-less search MUST NOT invoke `search-remote`. `--remote` without a query is an actionable usage error (exit 2). Bare `search` with neither query nor filters remains an error (exit 2).

Enumeration ordering: primary `occurred_at` DESC with NULL timestamps last, tiebreak `ref` ascending (same `localeCompare` tiebreak the queryful path already uses). This is stable, index-friendly, and matches the "latest N" agent use case. Queryful local search keeps its existing rank-then-ref order (already deterministic), so offset pagination composes with both orders.

### D4: Pagination metadata in the result envelope

When pagination is engaged (local execution), the planner fetches `offset + limit + 1` candidates and reports `pagination: { offset, limit, hasMore }` in the result (and thus in `--json`). `hasMore: true` tells the agent to repeat the call with `--offset` advanced by `limit`. The field is present exactly when the execution is local (filter-only or `--local-only`), keeping JSON deterministic.

### D5: Surface area of the change

- `apps/cli/src/args/search.ts`: optional positional, `--offset` parsing, new validation errors, updated usage string.
- `packages/core/src/search/planner.ts` + `local-search.ts` + `types.ts`: optional text, enumeration ordering, offset/hasMore.
- `skills/getting-started.md`, `skills/reference/cli-overview.md`: enumeration + pagination idiom.

## Risks / Trade-offs

- [Offset windows shift when the index changes between pages] → Accepted: documented behavior of offset pagination over a live local index; deterministic against an unchanged index, which is the test contract.
- [`allResources` enumeration over a large index loads all rows before slicing] → Acceptable pre-alpha; ordering and slicing happen in SQL/JS over envelope rows only (no chunk joins in the enumeration path).
- [Existing oddity: an all-punctuation query sanitizes to an empty FTS expression and already enumerates] → Out of scope; behavior unchanged.

## Migration Plan

Pre-alpha, no compatibility obligations. Queryful `search` behavior is unchanged; new flags and the optional positional are additive. No rollback steps beyond reverting the commits.

## Open Questions

None.
