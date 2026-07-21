## Context

The accepted daemon prototype already has a detached explicit lifecycle, exact runtime discovery, retained single-owner leases on Darwin, typed semantic oRPC procedures, request tracking, cancellation, and typed sync streams. It does not provide the product behavior users reasonably expect: ordinary stateful commands do not ensure a daemon, an idle daemon never exits automatically, and Linux remains a direct-mode platform because its retained ownership backend is absent.

`promote-local-daemon-architecture` remains the prerequisite for full semantic command parity and the explicit safe-direct exception inventory. This change does not weaken that ordering. It completes the operational lifecycle once a command belongs to the promoted daemon surface, and it makes Linux a required advertised platform rather than a silent direct fallback.

The stakeholders are CLI users and agents that need a zero-administration local service, maintainers who need one database/runtime owner, and Extension authors whose long-running sync operations must retain progress, cancellation, and immutable-registry guarantees.

## Goals / Non-Goals

**Goals:**

- Make initialized stateful CLI commands transparently ensure one exact compatible daemon.
- Preserve typed progress streaming and cancellation across command-triggered startup.
- Stop an unused daemon automatically without interrupting admitted business work.
- Provide equivalent retained ownership and lifecycle safety on Linux and Darwin.
- Keep explicit lifecycle commands useful for inspection, eager startup, and immediate graceful stop.

**Non-Goals:**

- Machine-login autostart, launchd/systemd units, a permanent service, supervisor escalation, or foreground serving.
- Public/remote RPC, TCP, batching, OpenAPI, an SDK, authentication changes, scheduling, or a job queue.
- Windows support in this change.
- Expanding command parity beyond the semantic procedures and safe exception inventory owned by `promote-local-daemon-architecture`.
- Changing sync business behavior, provider behavior, storage schema, CLI output formats, or stable exit categories.

## Decisions

### 1. Ensure on demand at the daemon-client boundary

Every initialized stateful command resolves its canonical runtime identity and calls one shared ensure-ready operation before constructing the typed daemon client. Ensure first validates compatible ready metadata and health. If absent or stale, it launches the exact detached daemon and waits within the existing readiness bound. Concurrent callers contend through the retained lifecycle lease and converge on the winner; same-process callers share one in-flight ensure.

This is command-triggered process startup, not service installation or login autostart. It keeps the public CLI zero-administration without introducing platform service-manager policy.

Direct fallback is rejected after ensure begins. Falling back would reintroduce dual database/runtime ownership and would make a failed daemon indistinguishable from a successful direct command. Pre-initialization and the promotion change's tested filesystem-only exception allowlist remain outside ensure.

### 2. Five-minute activity-aware idle lifetime

The default idle timeout is five minutes. It is fixed product behavior for this pre-alpha slice rather than a new user configuration surface. Tests may inject a shorter clock/timeout through internal composition.

The idle deadline begins when the daemon becomes ready and resets only after the last admitted business request settles. An admitted unary request, an admitted stream until its iterator settles, and any other tracked business request suppress automatic shutdown regardless of duration. Health, status, ensure probes, and lifecycle control do not extend the business idle lifetime.

Expiry atomically changes admission from ready to stopping before graceful drain begins. A command that races after that transition may wait for the old owner to release and perform one bounded ensure/reconnect before invoking its business procedure; it must never replay a procedure that may already have executed. Explicit `daemon stop` retains its current cancellation-and-drain semantics and does not wait for the idle deadline.

This model wins over a periodic process killer because it composes with request tracking, stream cleanup, SQLite ownership, and shutdown timeout behavior.

### 3. Sync remains one typed oRPC stream

Automatic ensure is completed before opening the sync procedure stream. From that point, the existing typed producer-order event sequence, terminal return/error, backpressure, cancellation, and iterator cleanup contracts remain authoritative. The complete stream lifetime counts as one active business request, so a slow provider or backpressured consumer cannot be terminated by idle expiry.

Polling a status table or introducing a background queue is rejected: either would duplicate state and weaken immediate progress/cancellation semantics.

### 4. Linux uses the same retained lease model with its native advisory lock

Linux lifecycle and database lease files use a permanent owner-private regular file and a non-blocking retained `flock(2)` shared/exclusive lock held by an open file description. The backend must preserve alias/inode contention, process-death release, shared direct-owner versus exclusive daemon-owner behavior during the promotion transition, and immediate reacquisition. It must apply the same no-symlink, regular-file, owner, and mode checks as Darwin before acquisition.

The platform backend remains injected behind the existing retained-lease abstraction. Darwin keeps its proven `O_SHLOCK`/`O_EXLOCK` implementation. Linux is advertised only after compiled multi-process tests prove contention, crash release, alias behavior, privacy checks, and operation from the packaged CLI/daemon artifacts. An unavailable or unsafe primitive fails closed before SQLite opens; initialized stateful commands report the bounded daemon failure rather than silently composing a direct runtime.

### 5. Explicit lifecycle commands remain exact and idempotent

`daemon start` eagerly performs the same ensure-ready operation ordinary commands use. `daemon status` remains side-effect-free and never starts or keeps alive a daemon. `daemon stop` targets only exact compatible runtime ownership and remains idempotent and graceful. No foreground serve command is added.

## Risks / Trade-offs

- [The daemon may exit between ensure and business invocation] -> Treat stopping/unavailable-before-invocation as a bounded reconnectable race, wait for ownership release, and retry ensure once without replaying any invoked business operation.
- [Idle accounting can leak or stop too early around streams] -> Tie activity to the authoritative admission/request tracker and settle it in every completion, cancellation, disconnect, iterator-return, and error path.
- [Concurrent command startup can create a child storm] -> Share in-process ensure work and rely on lifecycle ownership plus winner readiness discovery across processes.
- [Linux advisory locking differs from Darwin flags] -> Keep a behavioral backend contract and require compiled multi-process parity gates before advertising Linux.
- [A five-minute daemon lifetime adds repeated cold starts for sporadic use] -> Startup remains bounded and automatic; explicit `daemon start` is available when a user wants eager readiness, while lifecycle probes do not make a supposedly idle daemon permanent.
- [This change depends on unfinished promotion parity] -> Gate default ensure routing on the complete stateful-command inventory and safe-exception architecture tests; do not expose mixed direct/daemon behavior as complete.

## Migration Plan

1. Land the promotion change's complete semantic command inventory and safe direct-exception allowlist.
2. Add and verify the Linux retained-lease backend without changing Darwin behavior.
3. Introduce shared ensure-ready behavior and route promoted initialized stateful commands through it.
4. Add request-tracker-owned idle accounting and graceful automatic shutdown with an injectable test clock.
5. Enable default on-demand daemon routing only after compiled Darwin and Linux concurrency, crash, stream, and lifecycle journeys pass.

No database or persistent configuration migration is required. Stale matching discovery metadata continues through the existing owner-validated recovery path.

## Open Questions

None.
