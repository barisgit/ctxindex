## ADDED Requirements

### Requirement: Severity-correct bounded sync diagnostics
Core MUST aggregate warning and error diagnostics separately for every Sync Run. Warning emissions MUST increment `warnings_count`, MUST NOT increment `errors_count`, and MUST retain the last emitted warning as a structured diagnostic containing its stable code, message, and optional Ref. Diagnostic persistence MUST remain bounded to counts and the last structured value rather than an unbounded history.

A terminal run failure MUST count as exactly one error without converting, discarding, or incrementing warnings emitted earlier in the run. Sync results and current Source sync status MUST expose `warningsCount`, `lastWarning`, `errorsCount`, and `lastError` with their corresponding severities.

#### Scenario: Warning-only run completes successfully
- **WHEN** an Adapter emits one or more warnings and then completes
- **THEN** the run is completed, current Source status is idle, `warningsCount` reflects every warning, `lastWarning` is the last structured warning, `errorsCount` is zero, and `lastError` is absent

#### Scenario: Warnings survive a terminal failure
- **WHEN** an Adapter emits warnings and later terminates with a typed sync failure
- **THEN** the persisted run and current Source status retain the warning count and last warning while recording exactly one error and the terminal error summary

#### Scenario: Diagnostic retention remains bounded
- **WHEN** a run emits many warnings
- **THEN** persistence stores the aggregate count and only the last structured warning rather than a warning history

## MODIFIED Requirements

### Requirement: Sync concurrency and SQLite coordination
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

ctxindex MUST coordinate sync executions through an advisory lock table:

```text
sync_locks
  scope          PK; 'global' or 'source:<source_id>'
  run_id         FK sync_runs.id when held by a running sync
  acquired_at    ms since epoch
```

The sync runner MUST acquire the appropriate lock row before beginning Adapter sync work, and the associated `sync_run` MUST remain `running` while the lock is held. If the row already exists, the runner MUST exit with `sync_runs.status = failed` and `error_summary = "sync busy"` because the attempt was not explicitly cancelled.

A crashed sync MUST be recoverable by a stale-lock release step at startup: if `sync_runs[run_id].status` is not `running`, the lock row is deleted.

At minimum, an implementation MUST hold a global advisory lock (`scope = 'global'`) for the duration of any sync. Per-source concurrency (`scope = 'source:<source_id>'`) MAY be added without a schema migration. Which scope a release writes is captured in its milestone document.

SQLite MUST be opened in WAL mode with `foreign_keys = ON`, `synchronous = NORMAL`, and a configured `busy_timeout`. Readers (search, status) MUST NOT take the sync lock.

#### Scenario: Concurrent sync attempts fail without blocking readers
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings
