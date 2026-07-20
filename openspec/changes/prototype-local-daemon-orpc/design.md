## Context

The CLI currently owns runtime composition. Each process can open and migrate SQLite, load built-in and external Extensions, construct provider-neutral services, execute one command, and exit. WAL, a bounded busy timeout, and normalized contention errors protect correctness across processes, but they are not a single-owner architecture. The existing `openDeps()` boundary is already a useful description of the runtime that a daemon must own, while CLI parsers, formatters, and final exit mapping are established agent-facing contracts.

This change is a disposable architecture prototype. Its purpose is to test the hard boundaries—typed transport, process ownership, Extension lifetime, long-running cancellation, error fidelity, and multi-process testing—before daemon behavior is promoted into the normal release path. The user selected Bun for the prototype and oRPC for transport type safety, with the RPC router isolated from business logic.

## Goals / Non-Goals

**Goals:**

- Prove one long-lived Bun process can own SQLite, runtime composition, and one immutable loaded Extension registry.
- Prove the existing CLI can remain the sole agent-facing surface while delegating a meaningful read/write workflow over typed RPC.
- Exercise a real long-running operation and cancellation rather than an artificial delay endpoint.
- Keep the router package limited to validated procedure composition, delegation, safe error transport, and future middleware attachment.
- Produce enough evidence to recommend promotion or replacement.

**Non-Goals:**

- Convert the complete CLI, establish a released compatibility promise, or remove the direct path for commands outside the expanded prototype surface.
- Add daemon autostart, detached process management, launchd/systemd integration, or background scheduling.
- Add a job queue, WebSocket/SSE transport, streaming command output, a web UI, TCP/remote access, or an MCP surface. OAuth authorization and byte-streaming operations remain later migration slices because they require distinct browser/file-transfer decisions.
- Hot-reload Extensions, support Node.js, change storage schema, or change provider behavior.

## Decisions

### 1. The prototype is an explicit foreground daemon

The daemon starts explicitly in the foreground, initializes the complete runtime before readiness, handles termination signals or a typed local shutdown request, and stops admission before cancellation/draining. It closes SQLite and releases its leases only after active work settles; a non-cooperative request leaves it stopping and owned until settlement or explicit force-termination. Tests spawn and reap it directly.

Rejected alternatives were CLI autostart and a detached `daemon start` command. Both add lifecycle races, logging ownership, stale-process recovery, and platform service concerns before the RPC and ownership model is proven.

### 2. Local RPC uses oRPC over Bun HTTP on a Unix-domain socket and two leases

The oRPC Fetch handler and client link use Bun's Unix-socket HTTP serving and fetching. Before identity is derived, the shared path resolver canonicalizes the complete effective config/data/state/cache tuple, resolving symlinks, aliases, and existing ancestors before appending any missing suffix. Lifecycle and endpoint-discovery metadata live below the canonical state root. Because Unix socket paths are sharply bounded on macOS and worktree roots can already exceed that limit, the socket itself lives in a short private runtime directory and uses a deterministic digest of the full canonical tuple; tests may override it with another short isolated path. Health exposes only safe digests, never a raw root or SQLite path.

Startup acquires two independent exclusive leases before opening SQLite: a lifecycle lease keyed by the canonical state root and recording the full canonical tuple, and a database lease keyed by the canonical SQLite path derived from the data root. The lifecycle lease rejects the same state root paired with different config/data/cache as runtime mismatch. The database lease prevents different state roots sharing one data root from double-owning the database. Readiness is reported only after both leases, runtime initialization, and bind. Stale cleanup relies on kernel-lock release plus validated ownership; lock files are permanent and never blindly unlinked.

On supported Darwin filesystems, leases are retained kernel file locks acquired through `node:fs`: `O_EXLOCK | O_NONBLOCK` for daemon ownership and `O_SHLOCK | O_NONBLOCK` for a legacy direct stateful process. The database lock file is the permanent `<canonical-sqlite>.owner.lock`, created `0600`; lifecycle uses the equivalent permanent private file beneath canonical state. Acquisition validates no symlink, regular-file type, current uid, and private mode. Direct processes hold a shared database lease from before SQLite open through after close, removing the time-of-check/time-of-use race; multiple direct holders may coexist but block daemon startup, and daemon exclusivity blocks them. Unsupported platforms/filesystems fail closed. Kernel release on exit/SIGKILL enables immediate reacquisition without heartbeat or unlink recovery.

This wins over a fixed loopback TCP port because it has no port collision or discovery problem and gives worktree/test isolation a direct filesystem identity. It wins over a custom binary protocol because oRPC can remain transport typed while Bun supplies the local transport. TCP, remote access, and authentication middleware remain outside the prototype.

### 3. `@ctxindex/rpc` is a contract-first package with zero business logic

A separate private workspace package defines a pure `@orpc/contract` contract containing the exact bounded input, plain success output, and declared error schemas. `createDaemonRouter(application, expectations)` uses `implement(contract)` to attach compatibility middleware and thin handlers. Each handler delegates exactly once to the narrow injected `DaemonRpcApplication`, converts its internal result into either a validated plain success value or a declared typed oRPC error, and applies no branch based on business data. Compatibility expectations are immutable construction data, so middleware never calls `application.health()` as hidden delegation. The package owns no database, runtime construction, provider access, Extension loading, filesystem/process lifecycle, CLI formatting, Source selection or iteration, retry loop, use-case orchestration, error-class inspection, or domain decision. The daemon application implements the injected interface and owns all use-case orchestration, including calls into core business services and safe DTO projection.

### 4. Shared lifecycle infrastructure is separate from RPC and applications

The private `@ctxindex/local-daemon` package is shared by `apps/daemon` and `apps/cli`. It owns canonical resolution of the config/data/state/cache tuple and SQLite path, safe identity digests, short endpoint resolution, validated lifecycle/discovery metadata, exclusive lifecycle/database and shared database retained-lease primitives. It contains no oRPC router, DTO, database composition, business rule, core service, Extension loading, CLI formatting, or process/application orchestration.

The Bun transport adapter lives in the daemon and the socket-aware client adapter lives in the CLI. This preserves the option of a future Node transport adapter without weakening the prototype's Bun-first choice. The formal contract is transport-independent even though the current protocol remains private and local-only.

### 5. The vertical slice expands from sync/status to normal setup and access

`system.health` returns protocol version, daemon/build version, process identity, startup time, readiness, and Extension diagnostic count. `sync.run` delegates a typed sync request and request signal to a daemon-agnostic core application service. `status.get` reads the resulting state through the same daemon runtime. The expanded prototype additionally routes Realm add/list, Source add/list/remove, search, exact get, and local thread traversal through daemon-owned services. The CLI keeps all existing argument parsing, readable/JSON formatting, stdout/stderr separation, and exit mapping.

Together these slices prove initialization-independent configuration writes, Source registry validation, local and provider-backed discovery/retrieval, SQLite writes and reads across separate client processes, existing result shapes, a realistic long-running cancellation path, and one process-owned runtime. Account/OAuth App/secrets, Artifact download/export byte transfer, typed Actions, and purge remain subsequent slices rather than being collapsed into an untyped command tunnel.

### 6. A database lease fences every direct or unconverted stateful command

Realm add/list, Source definitions/add/list/remove, sync/status, search, exact get, local thread traversal, health, and shutdown use semantic RPC procedures when validated lifecycle/discovery metadata exists for the exact canonical tuple, or when a test endpoint override explicitly selects it. After selection, an unreachable or stale endpoint is `daemon_unavailable` with no direct fallback and the client does not open SQLite. With neither selector, commands that retain a direct implementation keep that behavior behind a shared database lease.

Before every unconverted/direct stateful CLI path composes a runtime or opens SQLite, it resolves the canonical database path and attempts retained shared acquisition. Exclusive conflict fails `prototype_unsupported` with exit `50` before open. Successful acquisition is held until after SQLite closes, while the command otherwise retains existing behavior. Stateless commands may remain direct. This fence applies by database identity, not state-root discovery, so a different state root sharing the same data root cannot bypass it.

Promotion requires converting every stateful path or defining a deliberate daemon-local exception. The prototype report lists the blocked commands rather than implying complete migration.

### 7. Every DTO and declared error crosses as a closed bounded safe value

JavaScript error identity cannot survive RPC. Every request and plain success value uses the exact strict bounded DTOs in `implementation.md`. Each `RpcFailure` variant is a declared typed oRPC error whose `data` is that exact bounded variant and whose outer oRPC message is constant; there is no serialized `RpcResult` success/failure envelope. Per-Source sync failures are projections, never `Error` values. Oversized search, Resource, or thread projections fail as `result_too_large`; they are never truncated into a different valid result. Causes, stacks, diagnostics bags, provider bodies, tokens, Extension paths, raw paths, dynamic outer error messages, and raw backend errors never cross the boundary. The CLI validates declared error data, reconstructs public classification, and remains the only numeric exit mapper. Unknown link/protocol exceptions become daemon-unavailable. Daemon unavailability, protocol mismatch, runtime mismatch, database-lease conflict, shutdown timeout, prototype-unsupported, and result-too-large all use exit `50`; cancellation retains `130` and locally invalid input retains `2`.

### 8. Unary request cancellation must reach the selected operation

The client attaches its `AbortSignal` to the oRPC call; every router procedure uses oRPC's native handler signal and forwards that exact signal through the injected application interface. The serialized/validated server transport context contains request id plus protocol/runtime identity only and never carries or validates an `AbortSignal`. Signal-less in-process calls receive one safe non-aborted signal. Daemon orchestration passes it to the selected Realm, Source, sync, search, retrieval, or thread operation and, where applicable, through core orchestration and Adapters. The e2e proof interrupts a real sync, requires exit `130`, and verifies the daemon records cancellation rather than continuing silently; focused tests prove native signal identity and the signal-less fallback while exactly-once procedure coverage exercises every handler.

If aborted Unix-socket fetch does not reliably abort the server handler, the prototype will add a typed operation identity and explicit cancellation procedure. It will not report successful cancellation while work continues. Streaming/event iterators are deferred because current sync event formatting is accumulated rather than live.

### 9. Extension state is immutable for one daemon lifetime

The daemon loads built-ins, explicit paths, and exact installed Catalog provenance once before readiness. Startup performs no Catalog refresh. Catalog/config changes require daemon restart during the prototype. This avoids dynamic-import cache ambiguity and mixed registries across active requests.

Configured relative Extension paths are a known current-process ambiguity. Prototype tests use absolute paths; promotion must canonicalize their persisted resolution independently.

### 10. No queue is introduced

The daemon initially runs requests directly with per-request cancellation and bounded active-operation tracking. A queue is justified only after background sync, scheduling, fairness, concurrency limits, or crash recovery has observable requirements. Adding one now would hide rather than test the fundamental process and cancellation behavior.

## Risks / Trade-offs

- **Expanded command migration can still be mistaken for complete single ownership** → Daemon mode is explicit, has no direct-storage fallback for selected daemon calls, and the final report states exactly which command families remain direct or unsupported.
- **Unary disconnect may not propagate cancellation through Bun and oRPC** → A compiled multi-process test makes this a gate; fall back to explicit operation cancellation if required.
- **Unix socket cleanup can steal a live daemon's endpoint** → Use a private parent, active health probing, ownership metadata, exclusive single-instance acquisition, and cleanup only by the owning process.
- **Unix socket paths have platform length limits** → Keep discovery metadata under the canonical state root but derive the socket in a short private runtime directory from the full tuple digest; allow a short explicit override for tests.
- **Different runtime tuples can target one database** → Require the separate canonical SQLite-path lease and reject mismatched owners before open.
- **Non-cooperative cancellation can outlive the shutdown deadline** → Return structured timeout while retaining SQLite and both leases; never claim complete until settlement or explicit force-termination.
- **RPC can leak diagnostics or lose typed error meaning** → Validate a closed safe error envelope and test redaction plus every mapped prototype failure.
- **A long-lived registry changes config/Extension refresh expectations** → Treat registry state as immutable and require restart; do not hot-reload in this prototype.
- **Process-memoized environment and logger state can contaminate in-process tests** → Test daemon lifecycles in spawned processes with isolated state and readiness polling, never fixed sleeps.
- **Foreground-only operation is less convenient** → Accept that cost to keep service management outside the architecture proof.

## Migration Plan

No storage migration is added. The prototype uses the existing database and isolated path overrides.

1. Add the RPC package, daemon application, endpoint resolver, and focused unit tests without redirecting existing commands.
2. Extract sync orchestration into a daemon-agnostic core application service and preserve current direct-call tests.
3. Add daemon-mode health, sync, status, and shutdown paths and compiled process tests over isolated state.
4. Expand the same semantic boundary across Realm/Source setup, search, exact get, and local thread traversal; prove separate CLI processes use one daemon-owned database and immutable registry without a generic command tunnel.
5. Run the expanded prototype evaluation, record measured evidence and unsupported paths, then pause at a Human checkpoint for the user to choose `promote` or `replace`.
6. If and only if the user chooses `promote`, create a follow-up OpenSpec change for canonical sidecars, normal daemon ownership, remaining stateful commands, service installation/autostart, and local-client authentication. If the user chooses `replace`, create the replacement/removal follow-up and retain only independently valuable core extraction when justified.

### 11. Batching and OpenAPI/SDK generation are deferred follow-ups

Request batching may become useful when a separately designed remote daemon introduces measurable connection latency. OpenAPI generation and an external SDK may become useful only after a public/authenticated protocol is proposed. Both benefit from the pure contract-first boundary, but neither is enabled in this local private prototype; remote authentication, public compatibility, batching semantics, idempotency, exposure review, and SDK release policy require separate OpenSpec changes.

### 12. Error and application types have one contract-derived source

One readonly failure registry is authoritative for every failure kind, strict bounded data schema, public outer message, oRPC declaration, `RpcFailure` schema/union, router error construction, and client code/data validation. Its oRPC code is the existing failure `kind`, avoiding a second uppercase alias map. Small one-use failure schemas are inline registry entries; only genuinely reused or structurally large schemas remain named. Any assertion needed to preserve the runtime key/schema correlation is isolated inside one tested helper.

`DaemonRpcApplication` is a recursive mapped type over `daemonContract` using oRPC's inferred input and output trees. Every contract procedure becomes exactly `(input, RpcRequestContext) => Promise<RpcResult<output>>`, while router-shaped groups remain nested. Adding, removing, or changing a procedure therefore changes both client and injected application types without editing a second signature list. Runtime handlers remain explicit only as the genuine adaptation from contract path to the daemon composition object.

## Open Questions

None block implementation. Authentication middleware, full command migration, service management, background scheduling, byte streaming, Node transport, remote batching, and OpenAPI/external SDK publication are intentionally post-prototype decisions.
