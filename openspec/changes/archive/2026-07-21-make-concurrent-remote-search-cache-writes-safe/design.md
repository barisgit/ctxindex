## Context

Remote-search adapters return provider-ranked Resources, then core optionally materializes those hits into the shared SQLite database. Today each Resource is written in its own deferred transaction. Concurrent CLI processes can therefore race between reads and writes, partially materialize one origin, and expose `SQLITE_BUSY`/`database is locked` before the successful provider result is returned. The database already configures a five-second busy bound and WAL mode. The CLI, core storage, all remote-search adapters, and agents running simultaneous commands are affected.

## Goals / Non-Goals

**Goals:**
- Coordinate concurrent writers through SQLite within the existing bounded wait.
- Commit all cache projections for one remote origin together, with duplicate Refs materialized once.
- Preserve verified provider results if optional cache persistence exhausts its bound.
- Emit stable, actionable `storage_busy` diagnostics without leaking raw SQLite errors.
- Preserve the existing cancellation outcome and exit 130 behavior.

**Non-Goals:**
- Provider rate-limit retries, pagination, or filter changes.
- Cross-host or distributed locking.
- A lock daemon, lockfile protocol, schema migration, or new numeric exit code.
- Changing sync, retrieval, or Action materialization degradation semantics.

## Decisions

1. SQLite remains the only cross-process coordinator. Resource batches acquire the writer reservation with `BEGIN IMMEDIATE`, use the database's existing five-second busy timeout, and explicitly commit or roll back. This closes the deferred-transaction read/write promotion race without introducing another lock owner. An external lock service or process-local mutex would either duplicate SQLite coordination or fail to cover multiple CLI processes.

2. Database setup installs `busy_timeout` before lock-sensitive pragmas such as `journal_mode`. Opening a database while another process is initializing or writing must receive the same bounded contention behavior as later transactions.

3. `ResourceStore` materializes a batch in one transaction. Every input's Ref grammar and Source ownership are validated before duplicate Refs are collapsed, so an invalid earlier duplicate cannot be hidden by a later valid occurrence. The last valid occurrence determines stored state to preserve the observable final state of today's sequential writes. The batch returns results in first-Ref order and replaces each Resource's fields, chunks, Relations, and envelope within the same commit.

4. Core storage owns one SQLite busy/locked classifier and normalizer. Database open/setup, schema migrations, and Resource batch acquisition all use it to wrap exhausted contention as `CtxindexError` code `storage_busy` with an actionable retry message and the original error retained as the cause. Other SQLite and validation errors remain terminal and unchanged. This code uses the existing generic exit-50 fallback rather than adding a numeric mapping.

5. Remote search treats only `storage_busy` from optional cache materialization as per-origin degradation. It returns every verified provider Resource and appends one `storage_busy` warning for that origin. Because SQLite's synchronous wait blocks JavaScript timers, remote execution yields one event-loop turn after either successful materialization or a thrown wait before checking the signal. A cancellation scheduled during either wait therefore wins; non-contention storage errors remain terminal. This prevents cache policy from hiding data/validation defects.

6. Verification uses deterministic lock holders and synthetic providers. A compiled CLI test acquires an external test-side writer transaction, waits until three separate processes reach a provider barrier, releases their results, and then waits for a compile-time-only test trace from each process immediately before its SQLite cache reservation before releasing SQLite within the five-second bound. Production builds cannot enable this trace. Focused core tests prove atomic projection rollback, input validation before Ref deduplication, exhaustion wrapping during setup/migration/batch acquisition, cancellation precedence after failed and successful waits, and absence of raw `SQLITE_BUSY` text.

## Risks / Trade-offs

- [A large origin batch holds the sole SQLite writer longer than one per-Resource transaction] → Remote result limits bound the batch, preparation/validation occurs before or within the same synchronous operation, and the approach removes repeated transaction acquisition.
- [SQLite's synchronous busy wait cannot run JavaScript abort callbacks while blocked] → Check cancellation immediately before materialization, yield one event-loop turn after the wait returns, and check again; retain the five-second upper bound and existing signal semantics.
- [Last-occurrence Ref deduplication may hide inconsistent duplicate provider envelopes] → Validate every Ref and Source association before deduplication, then preserve the existing sequential final state while the returned provider result list and later planner merge retain their established contracts.
- [WAL setup itself can contend on database open] → Configure the busy timeout first and cover concurrent initialization in focused tests.

## Migration Plan

No persistent schema or user data migration is required. Existing databases adopt the pragma order and transaction behavior on the next process open.

## Open Questions

None.
