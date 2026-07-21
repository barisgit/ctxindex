## Context

The promoted architecture has a safe single-instance daemon, exact runtime discovery, retained ownership, graceful RPC shutdown, and packaged sibling executable. Its product lifecycle is still the prototype lifecycle: the user launches it in a foreground terminal, ordinary commands only use it when discovery metadata already exists, and lifecycle commands are named `serve`, `health`, and `shutdown`.

The CLI is the only public integration surface. Locally invalid invocations must remain side-effect free, initialization remains an explicit bootstrap exception, a selected private RPC route never falls back to direct SQLite after transport loss, and a platform without retained daemon ownership must retain the existing direct mode. The package must work from a source checkout and from the relocated npm artifact without ambient PATH lookup.

## Goals / Non-Goals

**Goals:**

- Remove foreground process management through an explicit detached background start operation.
- Provide idempotent background `start`, `stop`, and health-backed `status` operations with deterministic JSON.
- Bound readiness and shutdown observation; surface safe actionable failure.
- Converge concurrent launch requests on one lease-owning daemon and recover after crashes or stale metadata/socket state.
- Use Bun process facilities that apply equally to macOS and Linux once each platform has a verified ownership backend.

**Non-Goals:**

- Login autostart, launchd/systemd/Windows-service installation, scheduled sync, crash restart loops, or an always-on supervisor.
- Expanding advertised daemon platform support or replacing the retained ownership backend in this change.
- Public/remote RPC, protocol compatibility, TCP, OpenAPI, batching, or a background job queue.
- Migrating additional stateful command families to RPC.

## Decisions

### 1. Background lifecycle is explicit until stateful command parity

`daemon start` ensures the exact runtime daemon is ready. If none is discoverable, the CLI detaches the packaged sibling daemon (or the pinned Bun source entrypoint) and waits for health for a bounded interval. The process outlives the invoking CLI and continues until explicit stop, process exit/crash, or machine shutdown.

Ordinary commands keep the existing rule: they use a validated selected daemon when it is running and otherwise use their current direct route. Command-triggered autostart is enabled only after the promotion inventory proves every stateful command is daemon-routed or a safe bootstrap/filesystem-only exception. Starting earlier would acquire exclusive SQLite ownership and make still-direct OAuth, Account, secret, Artifact, Action, purge, and Extension operations fail. This gate avoids replacing foreground inconvenience with a less obvious broken workflow.

This still avoids an installer and platform service-manager policy while providing usable background operation now. Command-triggered autostart, login boot, and crash restart can be layered on later without changing the lifecycle mechanics.

### 2. Retained ownership, not PID metadata, is the single-instance authority

Discovery PID is observational only. A CLI never sends a signal to it. The daemon's existing exclusive lifecycle and database leases remain the only authority for ownership, so stale or reused PIDs cannot target another process.

Concurrent callers may reach process creation before the winning daemon publishes `starting`. Every child must contend on the same lifecycle lease; only one can initialize or bind. Losing launch attempts exit cleanly, while all callers poll the exact runtime and converge on the winner. Same-process ensure calls are coalesced to avoid redundant children in the common case. A separate PID-file lock is rejected because it would reintroduce stale ownership and platform-specific process probing.

### 3. Lifecycle observation is a bounded state machine

`start` uses the sequence `discovery -> health -> detached launch if needed -> readiness poll`. Existing `starting` metadata is observed before another launch; `stopping` is observed until ownership settles before restart. A stale `ready` record may trigger a contender; the lifecycle lease decides whether replacement is allowed. Startup has one fixed upper bound and returns a stable daemon failure if no compatible ready instance appears.

`status` never starts or mutates anything. It reports `stopped`, `starting`, `running`, `stopping`, `unavailable`, or `unsupported`; `running` is backed by successful RPC health. `stop` is idempotent: stopped/unsupported state is reported without launching, a live daemon receives graceful RPC shutdown, and stale state is removed only after exclusive lifecycle ownership proves no daemon retains it.

### 4. Detachment is portable and diagnostics are private

The CLI uses Bun's detached spawn, ignored stdin, an independent process group where supported, and `unref`; it does not use launchd, shell backgrounding, or Darwin-only flags. Startup stdout/stderr go to an owner-private bounded-location log below the daemon state root. User-facing errors mention the lifecycle status command and log category without reflecting host paths or raw child output.

The executable is resolved exactly as today: source mode uses the current pinned Bun executable and repository daemon entrypoint, while a packaged CLI uses only its executable sibling or an explicit test/build override. Ambient PATH lookup is rejected.

### 5. Routing remains unchanged until the parity gate

Argument validation and help complete without launching a daemon. `init` stays direct. Test endpoint override selects only that endpoint and never spawns a process. Where the retained ownership backend is absent for the operating-system platform, commands preserve the current direct route; filesystem or safety failures on an otherwise supported platform fail closed rather than silently dropping ownership.

Once a daemon is selected or launched, transport loss remains daemon-unavailable and never reopens SQLite directly.

### 6. Preserve the active exact protocol version during integration

This lifecycle change does not alter RPC wire shape or own a protocol bump. When rebased after streaming RPC, it must preserve the coordinated protocol-v2 constants and fixtures rather than restoring v1. Lifecycle tests derive protocol identity from the CLI's active exact constant so the branches integrate without creating a stale-daemon compatibility hole.

## Risks / Trade-offs

- [Cross-process callers can briefly create losing contender processes] -> Retained non-blocking ownership prevents duplicate initialization/database access; contenders exit immediately and callers converge on health. Same-process work is coalesced.
- [A detached child can fail before RPC is available] -> Bound readiness, keep diagnostics private, and return one actionable stable failure rather than raw stderr.
- [Background daemon ownership blocks still-unmigrated commands] -> Keep startup explicit and retain the current ownership fence until the broader promotion change proves complete parity; enable ordinary-command autostart only at that gate.
- [Stale discovery or socket files survive SIGKILL] -> Replacement/cleanup occurs only while holding the lifecycle lease; PID state is never trusted.
- [Linux currently lacks an advertised retained-lease backend] -> Keep lifecycle spawn primitives portable, preserve direct behavior where ownership is unavailable, and do not claim Linux daemon support from this change.

## Migration Plan

No persistent domain or schema migration is required. The pre-alpha command surface changes in place: scripts using `daemon serve`, `daemon health`, or `daemon shutdown` must use `daemon start`, `daemon status`, or `daemon stop`. Existing safe discovery, lease, and socket files remain compatible; stale files are recovered through retained ownership.

## Open Questions

None.
