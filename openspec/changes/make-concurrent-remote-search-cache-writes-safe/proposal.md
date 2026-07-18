## Why

Concurrent remote searches against one ctxindex state can contend while caching provider results and expose SQLite `database is locked` failures. Provider discovery is read-only from the user's perspective, so bounded local cache contention must not discard already-successful provider results or leak backend-specific errors.

## What Changes

- Define a bounded multi-process write-contention contract for generic Resource materialization.
- Make each remote origin's optional cache materialization atomic and Ref-deduplicated.
- Preserve verified provider results when optional cache materialization exhausts its contention bound, with an actionable per-origin `storage_busy` warning.
- Normalize terminal contention exhaustion to `storage_busy` under the existing exit-50 taxonomy while preserving cancellation semantics.
- Add deterministic separate-process regression coverage for concurrent remote-search cache writes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `generic-storage`: Add bounded cross-process Resource batch materialization with atomic projections and Ref deduplication.
- `search-routing`: Make optional remote-result caching atomic per origin and non-fatal when bounded storage contention is exhausted.
- `error-taxonomy`: Normalize exhausted SQLite write contention without exposing raw SQLite errors or adding an exit code.

## Impact

The change affects `@ctxindex/core` database initialization, Resource persistence, remote-search execution, and related compiled CLI/storage tests. It adds no service, schema migration, provider-specific behavior, network access, or numeric exit code, and does not change canonical provider ownership of remotely discovered Resources.
