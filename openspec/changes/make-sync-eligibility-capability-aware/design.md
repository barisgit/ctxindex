## Context

`SyncApplicationService` already filters all-Source sync by `sources.sync_enabled` and by the loaded Adapter's `sync` capability, but it discards the filtered Sources without reporting them. When nothing is selected, the CLI prints `No sync-enabled Sources are available.` in summary mode and `{"mode":"sync","results":[],"warnings":[]}` in JSON, which is misleading for mailbox Sources that are sync-enabled but federated-only. A targeted sync only rejects a disabled Source; an unsupported Source reaches `syncSource`, which creates a Sync Run inside the coordinator and records Source state `failed` with `sync_unsupported`. `SourceService.getStatus` projects `COALESCE(last_status, 'pending')`, ignoring both the policy and the Adapter capability. The daemon routes sync and status through the same core services, so the fix belongs in core with only a schema/projection extension in the daemon RPC and rendering in the CLI.

## Goals / Non-Goals

**Goals:**

- Make selection explicit: every ineligible Source in an all-Source run is reported with a reason.
- Make zero-eligible runs explicit in human and JSON output while still succeeding.
- Reject targeted unsupported Sources as invalid usage before any effect.
- Make `status` distinguish never-run, disabled, and unsupported Sources.
- Keep daemon and direct behavior identical and Calendar/local sync unchanged.

**Non-Goals:**

- Changing Source creation defaults or adding a command to toggle sync policy.
- Changing `source list` inventory, which already exposes `syncEnabled` and the raw last run status.
- Adding skipped events to the `--format events` stream or new RPC event types.
- Changing remote search, retrieval, or Action eligibility.

## Decisions

1. **Capability check happens in selection, not in the coordinator.** Core `SyncApplicationService` partitions Sources into selected and skipped using one shared capability predicate, and the targeted path rejects unsupported Sources with `invalid_filter` before calling `syncSource`. The coordinator-level `sync_unsupported` guard stays as a defensive invariant for direct `syncSource` callers. Alternative considered: keep the targeted failure as a `sync_unsupported` Source result. Rejected because it records a failed Sync Run and failed Source state for a request that could never run, and the issue requires a usage/selection outcome before effects consistent with disabled Sources.
2. **Unsupported outranks disabled.** A Source whose Adapter cannot sync is reported `unsupported` even when it was also created with `--no-sync`, because enabling sync could not make it eligible. Targeted rejection checks capability before policy for the same reason.
3. **Missing Adapter definitions stay selected.** A Source whose Extension is not loaded has unknown capability; it remains selected so its unavailability surfaces as the existing `adapter_unavailable` failure and `extension_unavailable` availability, rather than being silently skipped.
4. **Status projects one effective value in the existing `lastStatus` field.** Precedence is recorded `needs_auth`, then `unsupported`, then `disabled`, then the recorded run status, then `pending`. `needs_auth` stays first because a missing Account binding affects federated operations too and is actionable. Alternative considered: a separate eligibility field beside an unchanged `lastStatus`. Rejected because `pending` would still be displayed for unsupported Sources, which is the reported defect, and it would add a second field agents must reconcile. `source list` keeps its raw last-run status because it is inventory, not the status projection.
5. **Zero eligible succeeds.** A global sync with nothing eligible is not a failure; it exits `0` with the summary line `No Sources are eligible for sync.` and a JSON document whose `results` is empty and whose `skipped` list explains why. Skipped Sources never contribute to the exit code.
6. **Skipped Sources are reported only in the terminal result.** The live events stream keeps its established per-selected-Source vocabulary; the terminal JSON, summary, and compact outputs carry the skipped list.

## Risks / Trade-offs

- [Callers matching the old `No sync-enabled Sources are available.` text or the exact three-field JSON shape] -> The repository is pre-alpha; tests and docs are updated and the new text is deterministic.
- [Projecting policy and capability into `lastStatus` hides a stale recorded run status for unsupported or disabled Sources] -> Run counters, last error, and last run time remain in the status row, and those Sources cannot run anyway.
- [Users with many mailbox Sources see one skipped line per Source on every global sync] -> The lines are short and explain why nothing synced; JSON callers can filter by reason.

## Migration Plan

No persistent state changes. Existing Sources keep their stored policy and sync state; only the projection and reporting change.

## Open Questions

None.
