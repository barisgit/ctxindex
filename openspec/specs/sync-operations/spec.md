# Sync Operations Specification

## Purpose
Define sync modes, run history, transactional cursor advancement, advisory locking, recovery, and SQLite coordination.

## Requirements

### Requirement: Sync modes, history, and transactional cursors
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

ctxindex MUST support at least the `sync` mode and SHOULD support `resync` and `diff`:

- `sync`: incremental sync when a source cursor exists;
- `resync`: full refetch/reconcile for a source;
- `diff`: support-aware dry-run comparison of remote/local state.

An individual source adapter MAY declare which subset of these modes it supports through its capabilities.

Each execution of `sync`, `resync`, or `diff` for a source MUST create a sync run record.

A sync run MUST record at least source, mode, status, start time, completion time when known, cursor before, cursor after when committed, item counts, and error summary when failed.

Core MUST keep current source sync state separate from sync run history. Current sync state is the latest durable cursor/status used by future syncs; sync runs are the audit trail of attempts.

Core MUST support checkpoints for long-running syncs when an adapter can expose safe checkpoint state. A checkpoint MUST NOT become the source's current cursor until the run completes successfully.

Source adapters MUST NOT write core tables directly. They MUST return typed operations, and core MUST validate and apply those operations transactionally.

Adapters do not own tables ([generic storage](../generic-storage/spec.md)). Adapter-specific sync state belongs in the cursor; blobs belong in the artifact store.

Core MUST advance sync cursors only after resource/chunk/tombstone/index writes commit successfully.

#### Scenario: A sync attempt records history and commits its cursor only with data
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Sync concurrency and SQLite coordination
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

ctxindex MUST coordinate sync executions through an advisory lock table:

```text
sync_locks
  scope          PK; 'global' or 'source:<source_id>'
  run_id         FK sync_runs.id when held by a running sync
  acquired_at    ms since epoch
```

The sync runner MUST acquire the appropriate lock row before beginning Adapter sync work, and the associated `sync_run` MUST remain `running` while the lock is held. If the row already exists, the runner MUST exit with `sync_runs.status = cancelled` and `error_summary = "sync busy"`.

A crashed sync MUST be recoverable by a stale-lock release step at startup: if `sync_runs[run_id].status` is not `running`, the lock row is deleted.

At minimum, an implementation MUST hold a global advisory lock (`scope = 'global'`) for the duration of any sync. Per-source concurrency (`scope = 'source:<source_id>'`) MAY be added without a schema migration. Which scope a release writes is captured in its milestone document.

SQLite MUST be opened in WAL mode with `foreign_keys = ON`, `synchronous = NORMAL`, and a configured `busy_timeout`. Readers (search, status) MUST NOT take the sync lock.

#### Scenario: Concurrent sync attempts are cancelled without blocking readers
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings
