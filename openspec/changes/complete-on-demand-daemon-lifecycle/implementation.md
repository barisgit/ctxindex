## Capability Implementation Targets

- `local-daemon` → `openspec/specs/local-daemon/implementation.md`
- `cli-surface` → `openspec/specs/cli-surface/implementation.md`
- `generic-storage` → `openspec/specs/generic-storage/implementation.md`
- `daemon-operation-streams` → `openspec/specs/daemon-operation-streams/implementation.md`

## Module Ownership

`@ctxindex/local-daemon` owns canonical runtime/database identity, discovery metadata, lifecycle/database lease paths, the injected retained `FileLeaseBackend`, and platform backend selection. Its Darwin and Linux implementations expose the same acquire/release interface and holder-neutral failures; no CLI or daemon application module contains platform lock constants or system calls.

`apps/cli/src/daemon/lifecycle.ts` owns resolving the exact packaged daemon launch, detached spawn, readiness observation, stale-state recovery, and one shared ensure-ready operation. `apps/cli/src/daemon/client.ts` owns exact selection, compatibility validation, the typed private client facade, stream consumption/cancellation, and the bounded pre-invocation reconnect race. Command handlers depend on that facade and do not import daemon application/runtime composition or storage.

`apps/daemon` remains the Bun composition root. Runtime startup acquires both exclusive leases before SQLite open and creates one immutable registry and application. The daemon application admission/request tracker owns business activity lifetime. Transport/router code remains a one-time contract adaptation and does not implement idle policy or business logic.

`@ctxindex/rpc` remains a pure schema-first private contract and router composer. On-demand startup and idle timing introduce no procedure, command tunnel, polling contract, or second application interface. Existing sync stream schemas and the contract-derived application shape remain authoritative.

## Interfaces and Data Flow

The lifecycle facade exposes one internal `ensureReady(runtime, signal?)` operation used by explicit start and initialized stateful command setup. It performs local runtime identity resolution, compatible health reuse, owner-safe stale recovery, detached launch when needed, and bounded readiness observation. Same-process calls share one in-flight promise keyed by canonical runtime identity; cross-process convergence is supplied only by retained ownership and discovery validation.

Command flow is: parse and locally validate, classify through the promoted stateful/safe-exception inventory, ensure ready, create the exact typed daemon selection, then invoke one semantic procedure. A transport failure before procedure admission may wait for a stopping owner to release and repeat ensure once. The invocation layer records whether procedure admission/invocation may have occurred and never retries after that boundary. All failures normalize through the existing daemon failure registry and CLI exit mapper.

The daemon application has one injected monotonic clock and idle duration, with the five-minute production value composed at the daemon root and short deterministic values used only by tests. Admission and request tracking expose activity transitions to one idle controller. The controller arms only when the application is ready and the tracked business count is zero, disarms on admission, and rearms from settlement when the count returns to zero. Timer expiry and admission serialize through the same stopping/admission transition. Lifecycle health/status/ensure probes bypass business tracking and cannot touch the idle deadline.

Automatic expiry calls the same graceful shutdown coordinator as explicit stop after atomically closing admission. It does not create a parallel close path. Signal shutdown, explicit stop, and idle expiry converge on one idempotent shutdown promise that drains request tracking, closes SQLite, and releases endpoint/database/lifecycle ownership in the established order.

Sync flow remains: ensure ready, invoke the typed streaming procedure, validate and present each event in producer order, and consume one terminal return or declared failure. The stream's admission token is retained until iterator finalization in every normal, error, abort, disconnect, and early-return path. Backpressure remains at the existing one-item bounded handoff and the CLI's abort signal remains request-scoped.

## Storage and State

Idle deadline, timer handle, active-business count, in-flight ensure promises, and any bounded reconnect state are process-local and ephemeral. They are never stored in SQLite or discovery metadata. Discovery metadata remains bounded owner-private observation state and cannot prove ownership.

The Linux `FileLeaseBackend` uses permanent canonical lease files validated as non-symlink owner-private regular files and retains a non-blocking shared or exclusive `flock(2)` on the opened file description until `FileLease.release()` or process death. It never unlinks the permanent lease file and never attributes a conflict from file contents. The same backend owns lifecycle and database leases. Canonicalization occurs before file acquisition so aliases contend on the same identity.

The daemon retains the exclusive database lease across the complete SQLite open/use/close lifetime, including active stream drain and shutdown timeout. Migration-only direct openers retain a shared lease across the corresponding open/use/close lifetime until daemon promotion removes them. No schema or durable configuration change is introduced.

## Security and Compatibility

The daemon remains local-only and owner-private; automatic startup does not add TCP, remote peers, service-manager integration, or a public RPC surface. Spawned processes inherit no interactive stdin. Raw roots, socket paths, SQLite paths, lock contents, provider values, secrets, stacks, and child output remain excluded from public failures and discovery values.

Exact protocol and canonical runtime compatibility still precede business admission. A stale or mismatched endpoint cannot be reused or removed without retained lifecycle ownership. Ensure never uses PID metadata for liveness proof or signalling. Linux file acquisition must fail closed on symlink, non-regular type, wrong uid, non-private permissions, primitive absence, or unsupported filesystem semantics before SQLite open.

CLI command/format/exit compatibility remains the supported agent contract. The private RPC remains exact-versioned. The five-minute timeout is internal product policy, not a new compatibility-bearing configuration field. Automatic lifecycle must not add provider egress; only the requested business operation can do so.

## Verification

- Focused lifecycle tests cover compatible reuse, absent/stale startup, same-process ensure sharing, concurrent process convergence, bounded readiness failure, stopping races, and no retry after possible procedure invocation.
- Application tests use an injected monotonic clock to prove readiness idle, reset-after-last-settlement, overlapping requests, long unary work, active streams, health/status non-activity, explicit stop precedence, idempotent shutdown convergence, and shutdown-timeout ownership.
- CLI architecture and command tests prove local validation precedes ensure, every promoted stateful command uses the daemon facade, safe exceptions do not start it, and no ensured command composes runtime/storage directly.
- Linux and Darwin compiled multi-process suites cover shared/exclusive contention, canonical aliases, unsafe file rejection, concurrent startup, SIGKILL/crash release, immediate reacquisition, packaged detached spawn, idle exit, and restart.
- Typed sync tests cover automatic first-command startup, ordered progress, terminal return/error, backpressure beyond the idle duration, cancellation, disconnect, iterator return, and exactly-once activity settlement.
- Cross-cutting gates include focused package tests, compiled CLI/daemon e2e on Linux and Darwin, `bun run ci`, `bun run test:integration`, `bun run test:e2e`, strict OpenSpec validation, diff checking, cartography refresh, system-reference refresh, and independent lifecycle/storage review.

## Promotion Notes

- Merge command-triggered ensure, activity-aware idle coordination, shared shutdown ownership, exact lifecycle controls, and Darwin/Linux support doctrine into `openspec/specs/local-daemon/implementation.md`.
- Merge parse/validate-before-ensure, stateful inventory routing, safe direct exceptions, bounded pre-invocation reconnect, no post-invocation replay, client-owned presentation/exits, and no direct fallback doctrine into `openspec/specs/cli-surface/implementation.md`.
- Merge the injected platform backend boundary, Linux retained `flock(2)` semantics, permanent private lease files, full SQLite-handle lease lifetime, crash release, alias contention, and fail-closed platform behavior into `openspec/specs/generic-storage/implementation.md`.
- Merge stream admission-token lifetime, idle suppression through iterator settlement, automatic-start-before-stream, existing backpressure/cancellation, and exactly-once cleanup doctrine into `openspec/specs/daemon-operation-streams/implementation.md`.
