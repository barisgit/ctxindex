## Why

The `sync` CLI currently tolerates malformed arguments and can begin execution after silently discarding unknown flags, unexpected positionals, duplicate flags, boolean assignments, or missing flag values. Because sync execution records runs and may contact providers or mutate local materialization, invalid usage must be rejected before any side effect.

## What Changes

- Define the accepted `sync` argument grammar as closed and reject every argument outside it with invalid-usage exit `2`.
- Reject duplicate scalar and boolean flags instead of choosing one value.
- Reject `--format json=<value>` and other assignments to boolean flags.
- Require scalar flags to receive exactly one following or inline value.
- Require malformed input to fail before creating sync runs or changing Source sync state.
- **Breaking:** malformed invocations that were previously tolerated now fail with exit `2`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sync-operations`: define strict sync-command validation before sync execution begins.

## Impact

The change affects only the thin CLI sync argument parser and its parser and isolated CLI tests. It does not change core sync execution, Adapter behavior, storage schemas, provider calls, or valid command output.
