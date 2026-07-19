## 1. Architecture contracts and core orchestration

- [x] 1.1 Add failing architecture/package tests for the `@ctxindex/rpc` composition-only boundary, daemon/CLI dependency direction, Bun transport placement, and absence of storage, provider, formatting, lifecycle, or business-orchestration code in the router package.
- [x] 1.2 Add failing core tests for one/all-Source sync selection, exact label/id resolution, disabled and unavailable Sources, deterministic ordering, partial failures, warnings, and request cancellation; extract the existing CLI-owned workflow into a daemon-agnostic `SyncApplicationService` without changing output behavior.
- [x] 1.3 Pass the focused core sync, package-dependency, architecture-lint, and module-architecture suites before adding RPC transport.

## 2. Composition-only typed RPC package

- [x] 2.1 Add the private `@ctxindex/rpc` workspace package with the minimum matched oRPC server/client release and every exact strict DTO/bound from `implementation.md`: protocol/runtime identity, result envelope, safe failure variants, health, sync with nested safe per-Source failure, status with bounded JSON cursor, and shutdown acceptance.
- [x] 2.2 Add failing router tests for strict field/count/depth/byte bounds, protocol/runtime compatibility before delegation, immutable router expectations with no hidden health call, exactly-once delegation, output validation/serialization, signal identity, inferred client types, and rejection of Error/cause/stack/raw diagnostics/backend/provider bodies/raw paths/secret canaries; implement only procedure composition and cross-cutting middleware over `DaemonRpcApplication`.
- [x] 2.3 Pass the RPC package test/typecheck/lint gates and the repository package/architecture checks before composing a daemon.

## 3. Bun daemon lifecycle and runtime ownership

- [x] 3.1 Add private `@ctxindex/local-daemon` with no RPC/business/database composition, plus failing tests for canonical symlink/alias resolution, safe digests/no raw paths, short endpoints, override parity, permanent regular current-uid `0600` lock files, Bun `node:fs` `O_SHLOCK`/`O_EXLOCK | O_NONBLOCK`, shared/exclusive contention, unsupported-filesystem fail-closed behavior, same-state/different-data mismatch, different-state/same-data exclusion, SIGKILL reacquisition, and owner-checked cleanup.
- [x] 3.2 Implement the foreground Bun daemon composition root and `DaemonRpcApplication`: acquire both leases before open, open/migrate SQLite once, load one immutable local Extension registry, own all use-case orchestration and safe DTO projection, bind the oRPC Fetch handler, publish readiness, and close idempotently.
- [x] 3.3 Add failing shutdown/request-tracking tests, then implement admission stop, per-request cancellation, typed acceptance, bounded client observation, structured timeout, stopping/non-admitting lease retention for non-cooperative requests, eventual-settlement cleanup, explicit operator force-termination behavior, signal handling, SQLite close, and release of only matching database/lifecycle leases.
- [x] 3.4 Pass focused daemon lifecycle/runtime tests, daemon typecheck/lint, the no-network startup gate, and the relocated compiled-Extension gate.

## 4. CLI client slice and stable public behavior

- [x] 4.1 Add failing CLI tests for exact-tuple metadata/test-override RPC selection, no-selector legacy direct behavior, selected stale/unreachable endpoint with no fallback, health/status/shutdown, protocol/runtime mismatch, database-lease conflict, prototype-unsupported, shutdown timeout, deterministic output, and exits `2`, `50`, and `130`.
- [x] 4.2 Route sync/status through the daemon only when validated exact-tuple metadata or a test override selects it; once selected never fall back. Inventory every direct/unconverted stateful path and make each acquire/retain shared ownership from before SQLite open until after close; exclusive conflict fails `prototype_unsupported` exit `50` before open.
- [x] 4.3 Add foreground daemon launcher wiring that preserves helper-created worktree isolation and never starts or detaches the daemon as an ordinary-command side effect.
- [x] 4.4 Pass focused sync/status/lifecycle command tests, no-prompt and malformed-zero-side-effect tests, CLI thin-boundary gates, and package typechecks.

## 5. Compiled multi-process architecture proof

- [x] 5.1 Add a compiled local-directory e2e proof with isolated roots and readiness polling that proves path aliases converge, same-state/different-data rejects mismatch, different-state/same-data cannot double-own SQLite, and truly distinct tuples/databases remain independent.
- [x] 5.2 Prove exact-tuple metadata and test override select RPC, selected stale/unreachable endpoints never fall back, no-selector/no-lease retains legacy direct behavior, and separate CLI processes perform sync/status through one daemon-owned database and immutable registry with identical output.
- [x] 5.3 Prove CLI SIGINT cancels the real in-flight sync through RPC, exits `130`, records cancelled bookkeeping without partial writes, and leaves the daemon healthy; if unary disconnect cannot satisfy this, add and verify explicit typed operation cancellation before continuing.
- [x] 5.4 Prove concurrent/idempotent shutdown rejects new work and cancels active work; a non-cooperative request returns structured timeout while SQLite and both leases remain held and complete is never reported; settlement or explicit force-termination then permits exact cleanup, restart, and backup.
- [x] 5.5 Prove every inventoried unconverted stateful CLI command retains a shared lease from before open until after close, exclusive daemon ownership makes each fail exit 50 before open, multiple shared direct holders block daemon exclusive acquisition, and SIGKILL permits immediate kernel-lock reacquisition without unlink.
- [x] 5.6 Pass the focused compiled daemon workflow repeatedly without fixed sleeps, leaked processes, sockets, provider access, credentials, or raw transport details.

## 6. Promotion evidence and final verification

- [x] 6.1 Run focused package gates, `bun run ci`, `bunx openspec validate --all --strict`, `git diff --check`, and `openspec-verify-change`; resolve every critical finding and document residual prototype risk.
- [x] 6.2 Refresh prototype-affected codemaps and the readable system projection through cartography/system-reference only where the implemented prototype changed the current tree; do not project unchosen promotion doctrine.
- [x] 6.3 Record an evaluation report with measured strengths, failures, every unsupported stateful path, shutdown/cancellation evidence, security limitations, and an explicit promote-or-replace recommendation without claiming complete CLI migration.
- [x] 6.4 Document the conditional next step: a separate follow-up OpenSpec change for canonical sidecar/full migration work only after `promote`, or replacement/removal work only after `replace`. Do not promote sidecars in this prototype.
- [ ] 6.5 Human checkpoint: present the isolated report/evidence and pause for the user to choose exactly `promote` or `replace`.

## 7. Expanded normal CLI coverage before the Human checkpoint

- [x] 7.1 Reopen the evaluation checkpoint, inventory every remaining CLI-owned SQLite/runtime path, and define the ordered migration slices with explicit exclusions for autostart, queues, public RPC, MCP, and service managers.
- [x] 7.2 Add failing RPC, daemon-application, and CLI tests for Realm add/list and Source add/list/remove, including strict bounded DTOs, exactly-once delegation, unchanged formatting/exits, stale selected-daemon no-fallback, and no CLI database open.
- [x] 7.3 Implement Realm and Source management through daemon-owned orchestration while keeping registry/config/auth validation outside `@ctxindex/rpc`; pass focused package/typecheck and architecture gates.
- [x] 7.4 Add failing RPC, daemon-application, and CLI tests for search, exact get, and local thread traversal, including request cancellation, bounded Resource payloads, warnings, unchanged formatting/exits, and no CLI database open.
- [x] 7.5 Implement search, exact get, and local thread traversal through daemon-owned orchestration; pass focused package/typecheck and architecture gates.
- [x] 7.6 Extend compiled multi-process coverage across Realm/Source setup, sync, search, get, thread, and status through one daemon-owned SQLite handle and immutable registry; rerun the direct-path inventory and record remaining unsupported families.
- [x] 7.7 Run final gates, refresh affected codemaps/system projection, rewrite the evaluation from the expanded evidence, and only then present the Human promote/replace checkpoint.
