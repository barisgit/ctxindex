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

### Requirement: Calendar sync contracts have deterministic repeated-run replay evidence
Automated acceptance evidence SHALL apply one shared persisted sync lifecycle to Google Calendar and the default Microsoft Calendar using only invented provider-shaped fixtures and loopback provider mocks. The lifecycle SHALL cover a multi-page initial sync, unchanged incremental sync, one add/update/delete transition, a repeated unchanged transition, provider-declared cursor invalidation with bounded full reconciliation, and a final unchanged incremental sync. Every phase SHALL execute in a fresh CLI process against one provider-local isolated state directory.

The evidence SHALL verify committed cursor use and advancement without interpreting provider cursor contents; stable Refs and unchanged normalized materialization; exact add/update/delete counters; exactly one tombstone without duplication; the provider's stable invalidation warning; at most one full recovery reconciliation; and no additional change after recovery. Provider-specific replay code SHALL be limited to mock setup, provider-state transition, cursor expiry, and inspection of expected redacted read routes.

#### Scenario: Both calendar providers complete the shared replay
- **WHEN** the automated replay runs the shared lifecycle for Google Calendar and the default Microsoft Calendar
- **THEN** each provider satisfies the same persisted Resource, Ref, Sync Run, cursor, tombstone, warning, and unchanged-replay assertions without live authentication or provider data

#### Scenario: Recovery remains bounded and non-destructive
- **WHEN** either loopback provider rejects the replay's committed cursor using its declared invalidation response
- **THEN** exactly one bounded full reconciliation replaces the cursor, preserves the visible Resource and tombstone snapshot, and is followed by an unchanged incremental run

### Requirement: Strict sync command grammar
The `sync` command MUST accept only the documented `--source <id>`, `--mode sync|resync|diff`, `--format summary|events|compact`, and presence-only `--format json` options. It MUST reject unknown flags, unexpected positional arguments, duplicate scalar or boolean flags, assignments to boolean flags, and scalar flags without values as invalid usage with exit `2`.

Sync options MUST occur after the selected `sync` command. Option-like tokens before `sync` MUST be rejected with exit `2` rather than discarded by root-command selection. Explicit help and valid global options MUST retain their existing behavior.

Malformed sync arguments MUST be rejected before sync execution begins and MUST NOT create a Sync Run, change Source sync state, access a provider, or update local materialization. Valid invocations and explicit help requests MUST retain their existing behavior.

#### Scenario: Malformed tokens are rejected deterministically
- **WHEN** a caller supplies an unknown flag, unexpected positional argument, duplicate scalar or boolean flag, boolean assignment, or scalar flag without a value
- **THEN** the command exits `2` with an invalid-usage diagnostic identifying the malformed argument

#### Scenario: Invalid usage has no sync side effects
- **WHEN** malformed sync arguments target a configured Source
- **THEN** the command creates no Sync Run and leaves Source sync state and local materialization unchanged

#### Scenario: Prefix options cannot bypass sync validation
- **WHEN** a caller places an option-like token before the selected `sync` command
- **THEN** the command exits `2` before storage or provider access instead of executing sync with the token discarded

#### Scenario: Valid and help invocations are preserved
- **WHEN** a caller supplies a valid combination of documented sync options or explicitly requests sync help
- **THEN** the command retains its existing execution or help behavior respectively

### Requirement: Disabled Source sync enforcement
An all-Source sync MUST exclude Sources whose sync policy is disabled. A sync targeting a disabled Source MUST fail as invalid usage before invoking any provider operation and MUST produce no provider calls or sync runs. Disabling sync MUST NOT disable independently supported remote search, retrieval, download, or Actions.

#### Scenario: All-Source sync skips a disabled Source
- **WHEN** sync runs without an explicit Source and inventory includes a disabled Source
- **THEN** that Source causes no provider operation and produces no sync result

#### Scenario: Targeted sync rejects a disabled Source
- **WHEN** sync explicitly targets a disabled Source
- **THEN** the command exits with invalid usage and invokes no provider operation

### Requirement: Observable sync progress
Sync orchestration MUST optionally report ordered provider-neutral progress through
an awaited observer. For every selected Source it MUST report Source start before
provider work, cumulative count-only progress after each validated Adapter
emission, and exactly one Source completed or failed event before advancing to the
next Source. Progress counts MUST distinguish observed upserts, removals,
checkpoints, and warnings and MUST NOT imply commit before successful completion.

The observer MUST receive no Resource payload, Ref, cursor, provider response,
secret, or host path. Omitting the observer MUST preserve the existing terminal
result and storage behavior.

#### Scenario: Adapter emits work and completes
- **WHEN** one Source emits validated upserts, a checkpoint, and a warning before completing
- **THEN** the observer receives Source start, monotonically cumulative count-only progress in emission order, and one Source completed event
- **THEN** the final aggregate result retains the same committed counts and warning semantics

#### Scenario: Source fails after progress
- **WHEN** a Source emits progress and then fails
- **THEN** the observer receives that progress followed by exactly one Source failed event with the existing failure diagnostics
- **THEN** transactional cursor and materialization guarantees remain unchanged
