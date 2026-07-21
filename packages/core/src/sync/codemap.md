# packages/core/src/sync/

## Responsibility

Coordinates transactional Source synchronization: validates Adapter emissions, serializes runs with a global lock, applies Resource changes, records checkpoints/counters/status, and maps failures into durable sync state.

## Design/patterns

- `SyncCoordinator.run()` is a transaction-script/state-machine around an injected `SyncDrive`; provider code emits values but cannot directly mutate storage.
- `parseSyncEmission()` is a strict Zod boundary for current `SyncEmission` variants (`upsertResource`, `removeResource`, `checkpoint`, `warning`) and JSON-safe cursors.
- Emissions are buffered and validated before application; `diff` mode uses a sentinel rollback transaction to exercise writes without persisting them.
- Each validated emission advances cumulative count-only progress and awaits an optional observer, propagating consumer backpressure through the Adapter's awaited `emit` call.
- `sync_locks` provides global mutual exclusion, including stale-lock recovery via process liveness; bounded warning/error summaries prevent unbounded persistence.
- The only accepted operation contract is the current strict SDK `SyncEmission` union parsed by `emission.ts`; no prototype item/mail operation path remains.

## Data & control flow

1. `source/syncSource()` constructs `SyncCoordinator` and supplies a drive that resolves provider context and invokes the Adapter `sync` operation.
2. `run()` loads the Source and prior cursor, creates a running `sync_runs` row, recovers stale ownership, and atomically acquires the global `sync_locks` row.
3. The drive emits through `parseSyncEmission()`; warnings are collected, checkpoints advance the prospective cursor, Resource refs are checked against the requested Source, and an optional observer receives cumulative progress in emission order.
4. Non-diff runs transactionally apply upserts/removals via `ResourceStore`, persist checkpoints, advance `source_sync_state`, finalize counters/status, and release the lock. Diff runs calculate effects but roll back Resource writes and do not advance state.
5. Cancellation/auth/provider failures finalize the run, map `source_sync_state` to `needs_auth` or `failed`, preserve the prior cursor, release the lock, and rethrow.

## Integration points

- Depends on `@ctxindex/extension-sdk` sync contracts plus `packages/core/src/resource/resource-store.ts`, `registry/profile-registry.ts`, `ref/ref.ts`, `errors.ts`, and `exit-codes.ts`.
- Persists against `sources`, `sync_runs`, `sync_locks`, `sync_run_checkpoints`, and `source_sync_state` declared under `packages/core/src/schema/`.
- `packages/core/src/source/sync-source.ts` is the Adapter-facing entry. `SyncApplicationService` wraps one or many Source runs with awaited start/progress/terminal events; direct CLI and daemon consumers share that boundary.
- `index.ts` exports `SyncCoordinator` and exit-code mapping through `@ctxindex/core/sync`.
