## Capability Implementation Targets

- `sync-operations` → `openspec/specs/sync-operations/implementation.md`
- `error-taxonomy` → `openspec/specs/error-taxonomy/implementation.md`
- `generic-storage` → `openspec/specs/generic-storage/implementation.md`
- `cli-surface` → `openspec/specs/cli-surface/implementation.md`

## Module Ownership

`@ctxindex/core` owns diagnostic aggregation in `SyncCoordinator`, schema columns, and Source/status projections. Adapter warning emissions remain the public extension-SDK input contract. `@ctxindex/cli` consumes core results and Source rows, formatting only; it does not infer diagnostic severity. No Adapter or Profile receives storage access.

## Interfaces and Data Flow

`SyncWarning` remains the structured warning shape. `SyncRunResult` adds `warningsCount` and `lastWarning` while retaining the complete ephemeral `warnings` array used by one command invocation. A core-owned weak failure-diagnostics channel associates the same bounded warning/error summary with the original thrown object without wrapping it or changing exit mapping. `SourceRow` and `StatusRow` add warning projections, with `StatusRow.lastWarning` retaining the structured value; Source inventory also projects the joined run's error summary as `lastError`.

The coordinator increments a local warning count as validated warning emissions arrive and tracks the last value. On successful completion it writes zero errors plus a field-bounded warning snapshot and returns the original aggregates. On failure it writes one error plus the already accumulated warning fields, associates bounded diagnostics with the original error object, and rethrows that same cause. CLI output directly projects those values, uses a safe public `lastError` message rather than raw provider/runtime detail, and preserves existing failure exit mapping.

## Storage and State

`sync_runs` and `source_sync_state` each own `warnings_count INTEGER NOT NULL DEFAULT 0` and nullable `last_warning_json TEXT`; current Source state also owns existing error status while the run row retains its bounded error summary. Core serializes exactly one `SyncWarning` with each string field bounded to the diagnostic summary limit and parses it defensively at read boundaries. The canonical initial migration and Drizzle schemas stay aligned.

## Security and Compatibility

Warnings may contain provider-safe diagnostic detail already admitted by the existing emission contract; no new secret or egress path is added. JSON and human output must not expose terminal exception detail beyond existing bounded/error-safe behavior. Because ctxindex is pre-alpha, only fresh schema initialization is updated and no compatibility alias or migration is added.

## Verification

Coordinator tests cover warning-only aggregation, last-warning retention, failure preservation, and bounded persistence. Schema/migrator tests cover fresh columns. Source service and CLI formatter/command tests cover JSON and text projections, warning-only success, and mixed warning/error behavior. Repository CI, strict OpenSpec validation, and the compiled-extension gate remain cross-cutting checks.

## Promotion Notes

- Promote the `SyncRunResult` warning fields, coordinator severity boundary, and focused verification statement into `openspec/specs/sync-operations/implementation.md`.
- Promote the runner-only warning/error classification and unchanged final exit translation boundary into `openspec/specs/error-taxonomy/implementation.md`.
- Promote ownership of the two bounded warning columns and structured parse boundary into `openspec/specs/generic-storage/implementation.md`.
- Promote direct core-to-CLI warning projections and formatter-only ownership into `openspec/specs/cli-surface/implementation.md`.
