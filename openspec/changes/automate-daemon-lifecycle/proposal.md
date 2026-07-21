## Why

The accepted daemon architecture still requires an operator to keep a foreground `ctxindex daemon serve` process open before normal commands can use it. That makes the daemon-owned path unsuitable as the default local runtime and leaves stale discovery state, duplicate launch races, startup readiness, and routine monitoring to the user. Detached background lifecycle is required now so an explicitly started daemon is reliable without a second terminal or manual process supervision. Command-triggered autostart remains gated until every stateful command can coexist with exclusive daemon database ownership.

## What Changes

- **BREAKING (pre-alpha):** remove the supported foreground `daemon serve`, `daemon health`, and `daemon shutdown` product commands and replace them with background-oriented `daemon start`, `daemon status`, and `daemon stop` commands.
- Establish an explicit promotion gate for command-triggered autostart: it remains disabled until every stateful command is daemon-routed or a proven bootstrap/filesystem-only exception, so background ownership cannot unexpectedly block still-direct commands.
- Define bounded, idempotent start/stop/status behavior, including concurrent launch convergence, graceful stop observation, actionable startup failure, and deterministic human/JSON output for running and stopped state.
- Recover safely from process death and stale discovery/socket state without trusting a PID as ownership evidence, killing an unrelated process, or allowing a second daemon to own the same runtime.
- Detach the daemon with owner-private file-backed diagnostics and cross-platform process primitives; do not introduce launchd/systemd integration, login autostart, or scheduled background work.
- Preserve direct behavior where the current architecture explicitly requires bootstrap or where the platform cannot support daemon ownership.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-daemon`: replace foreground-only operation with bounded background lifecycle, concurrent-start convergence, safe stale-state recovery, and observable stopped/running status.
- `cli-surface`: replace foreground lifecycle commands with thin background lifecycle operations while preserving current direct/selected routing until the full stateful-parity gate enables command-triggered autostart.
- `error-taxonomy`: make detached startup and lifecycle failures actionable through the existing stable daemon failure exit class without exposing raw paths, process output, or host errors.

## Impact

The change affects `apps/cli`, `apps/daemon`, and `@ctxindex/local-daemon`, plus their compiled package and multi-process tests. It changes the pre-alpha daemon command surface but not the private exact-versioned RPC protocol or stored domain schema. The CLI spawns only the packaged sibling daemon (or the pinned Bun/source entrypoint during development), writes no provider data, uses no live authentication, and continues to rely on retained lifecycle/database ownership as the authority for single-instance safety.
