## Why

Sync warnings are currently persisted and reported as errors, so warning-only successful runs appear unhealthy and agents cannot distinguish degraded completion from failure. The persisted run history, current Source status, and CLI output need separate bounded warning and error accounting while retaining stable diagnostic details and exit behavior.

## What Changes

- Persist a warning count and the last structured warning separately from error count and last error for each Sync Run and current Source sync state.
- Count only error-severity diagnostics in error fields; warning-only completed runs remain successful, idle, and exit 0.
- Preserve warnings emitted before a terminal failure while counting that failure as one error.
- Expose warning count and last warning alongside existing diagnostics in sync results, status JSON/text, and Source inventory output.
- Keep diagnostic retention bounded to counts plus the last structured value; do not add diagnostic history.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sync-operations`: Separate warning and error aggregation, persistence, and run results.
- `error-taxonomy`: Define severity-correct diagnostic accounting while preserving stable terminal failure mappings and exits.
- `generic-storage`: Store bounded warning diagnostics in Sync Run and current Source sync state bookkeeping.
- `cli-surface`: Expose separate warning diagnostics in existing sync, status, and Source inventory output surfaces.

## Impact

Affected code is limited to provider-neutral core sync/schema/storage, the thin CLI formatters and sync runner, focused tests, the fresh canonical schema migration, and agent-facing status documentation. No provider contracts, credentials, network behavior, or unbounded diagnostic storage are introduced.
