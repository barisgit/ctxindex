## 1. Atomic Resource batch storage

- [x] 1.1 Add a failing focused `ResourceStore` test for one immediate batch committing deduplicated Refs with complete fields, chunks, and Relations, then implement `upsertMany()` and make `upsert()` share the batch path
- [x] 1.2 Add a failing projection-error test proving the entire Resource batch rolls back, then pass the focused ResourceStore suite
- [x] 1.3 Add a failing separate-connection contention test for bounded exhaustion and raw SQLite error leakage, then normalize busy/locked failures to actionable `storage_busy` while preserving the cause
- [x] 1.4 Add a failing pragma-order/concurrent-open regression, apply the five-second timeout before lock-sensitive pragmas, and pass focused storage tests
- [x] 1.5 Slice gate: run all core Resource and storage tests plus typecheck/lint for the affected package

## 2. Remote-search degradation

- [x] 2.1 Add a failing remote-search test proving batch cache exhaustion preserves the complete provider result set with one `storage_busy` warning, then switch per-Resource writes to per-origin `upsertMany()`
- [x] 2.2 Add failing cancellation and non-busy storage failure tests, then preserve cancelled semantics and propagate terminal non-contention errors without raw SQLite leakage
- [x] 2.3 Slice gate: run focused Source remote-search and search-planner tests plus affected package typecheck/lint

## 3. Separate-process CLI regression

- [x] 3.1 Add a deterministic failing compiled CLI e2e test that launches concurrent remote searches against one shared database with overlapping synthetic results
- [x] 3.2 Make the separate-process test pass with successful complete results, atomic/deduplicated cache projections, and no raw SQLite busy output
- [x] 3.3 Slice gate: run the compiled CLI concurrency test and the existing compiled-extension e2e test

## 4. Doctrine and final verification

- [x] 4.1 Promote applicable doctrine into canonical generic-storage, search-routing, and error-taxonomy implementation sidecars
- [x] 4.2 Refresh affected `codemap.md` files via cartography and refresh `SYSTEM.md` from the changed capability contracts
- [x] 4.3 Run `bun run ci` and `bunx openspec validate --all --strict`
- [x] 4.4 Run OpenSpec verification for `make-concurrent-remote-search-cache-writes-safe` and resolve every critical issue or warning

## 5. Review remediation

- [x] 5.1 Centralize SQLite contention normalization across database setup, migrations, and Resource batches with real setup exhaustion coverage
- [x] 5.2 Validate every batch input before Ref deduplication and cover invalid-then-valid duplicates
- [x] 5.3 Yield after synchronous cache waits so scheduled cancellation wins after exhausted and successful contention
- [x] 5.4 Make compiled multi-process contention externally controlled, then rerun focused slices and final gates
- [x] 5.5 Require a compile-time-only acquisition trace from every compiled search process before releasing the external lock, serialize pending fresh-database migrations, and rerun final gates
