## Why

The promoted local-daemon architecture is not yet a usable default lifecycle. Ordinary stateful commands currently discover an already-running daemon or keep using a direct runtime, explicit lifecycle commands require the user to manage the process, and Linux is not advertised because retained ownership has only been verified on Darwin. That makes `sync` appear inert in normal use and prevents the daemon's typed streaming and single-runtime ownership from being dependable product behavior.

Now that the daemon boundary, semantic procedures, and request tracking exist, ctxindex needs the missing operational contract: stateful commands start the one compatible daemon when needed, use it without a direct fallback, and let it stop itself after a bounded period with no active business work. Linux must meet the same ownership and lifecycle guarantees before this behavior is considered complete.

## What Changes

- Make every ordinary stateful CLI command ensure one compatible local daemon before invoking its semantic procedure; concurrent commands converge on the same daemon.
- Preserve streamed sync progress and terminal outcomes through the existing typed oRPC stream rather than replacing it with polling or a command tunnel.
- Make the daemon begin graceful automatic shutdown after a bounded idle timeout measured only while no business request is active; active, queued, and streaming work prevents idle expiry.
- Require Linux and Darwin to support the same retained single-owner lifecycle and fail closed before state access when safe daemon ownership cannot be established.
- Keep `daemon start`, `daemon status`, and `daemon stop` as explicit operational controls with idempotent, exact-runtime behavior; ordinary command startup is not a service-manager installation or machine-login autostart feature.
- Remove silent direct-mode fallback for initialized stateful commands on advertised daemon platforms. Bootstrap initialization and proven filesystem-only operations remain the only explicit direct exceptions defined by daemon promotion.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-daemon`: Add command-triggered ensure/start, activity-aware idle shutdown, Linux support, and convergence/safety requirements for the automatic lifecycle.
- `cli-surface`: Require initialized stateful commands to ensure and use the daemon while retaining only the promoted safe direct exceptions.
- `generic-storage`: Require verified Linux retained ownership equivalent to Darwin and prohibit direct state access after automatic daemon selection begins.
- `daemon-operation-streams`: Preserve typed streaming progress across automatic daemon startup and idle-lifetime accounting.

## Impact

- Affects daemon lifecycle and admission/shutdown logic, CLI daemon selection and startup, the Linux and Darwin retained-lease backends, and compiled multi-process/e2e coverage.
- Extends the existing private exact-versioned oRPC use but does not create a public RPC API, service installation, remote access, batching, OpenAPI, or a background queue.
- Changes initialized stateful CLI execution from optional daemon selection/direct composition to daemon-required execution on advertised platforms. Stable CLI commands, formats, and exit taxonomy remain the public contract.
- Requires coordination with `promote-local-daemon-architecture`: its semantic command parity and explicit direct-exception inventory remain prerequisites; this change completes the on-demand operational lifecycle after those boundaries are satisfied.
