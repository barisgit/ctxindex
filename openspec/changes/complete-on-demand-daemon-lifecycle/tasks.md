## 1. Lock prerequisites and lifecycle boundaries

- [ ] 1.1 Reconcile this change with `promote-local-daemon-architecture`: require its complete stateful-command inventory and tested bootstrap/filesystem-only exception allowlist before default ensure routing, and add failing architecture tests that reject stateful direct fallback, ensure-before-local-validation, public foreground serve, or lifecycle probes counted as business activity.
- [ ] 1.2 Add failing lifecycle/application tests for shared same-process ensure, multi-process convergence, pre-invocation stopping races, no post-invocation replay, the fixed five-minute production default, an internal injected clock/timeout for tests, and one idempotent shutdown coordinator shared by idle, explicit, and signal paths.
- [ ] 1.3 Pass focused RPC, daemon application, CLI daemon-client/lifecycle, command-inventory, and module-dependency gates before platform or cutover work continues.

## 2. Linux retained ownership

- [ ] 2.1 Add failing Linux retained-lease tests for shared/exclusive contention, canonical path aliases, permanent `0600` regular files, symlink/wrong-owner/unsafe-mode rejection, holder-neutral conflict reporting, release on close and process death, immediate reacquisition, and lifecycle/database lease separation.
- [ ] 2.2 Implement the injected Linux retained `flock(2)` backend behind `FileLeaseBackend` without changing Darwin flags or callers; retain each lease for the complete open/use/close lifetime and fail closed before SQLite open when the primitive or filesystem is unsafe.
- [ ] 2.3 Pass Linux and Darwin unit plus compiled multi-process lease gates, including SIGKILL/crash release, concurrent contenders, packaged executable behavior, alias contention, privacy checks, and no lease-file unlink.

## 3. Shared on-demand ensure

- [ ] 3.1 Add failing CLI lifecycle tests proving a compatible daemon is reused, absent/stale state starts the exact detached daemon, readiness is bounded, concurrent same-process calls share one ensure, cross-process losers discover the winner, and local usage errors plus safe direct exceptions produce no daemon side effect.
- [ ] 3.2 Implement one canonical-runtime-keyed ensure-ready facade shared by explicit `daemon start` and promoted initialized stateful commands; preserve owner-safe stale recovery, exact compatibility, no PID signalling, bounded safe diagnostics, and no direct fallback after ensure begins.
- [ ] 3.3 Add and implement the bounded stopping-race path: retry ensure only when procedure admission/invocation is known not to have occurred, wait for retained ownership release, and never replay possibly executed business work.
- [ ] 3.4 Route the promoted stateful command inventory through validate-then-ensure-then-semantic-procedure while leaving only the tested bootstrap/filesystem-only allowlist direct; pass focused command parity, output, warning, cancellation, and stable-exit gates.

## 4. Activity-aware idle shutdown

- [ ] 4.1 Add failing deterministic-clock tests for idle-from-readiness, reset after the last overlapping request settles, active unary work beyond five minutes, health/status/ensure non-activity, admission racing expiry, explicit stop before expiry, signal/idle/explicit shutdown convergence, and ownership retention on shutdown timeout.
- [ ] 4.2 Implement request-tracker-owned business activity and the idle controller: arm only at zero active business requests, disarm on admission, rearm after final settlement, atomically stop admission on expiry, and invoke the existing graceful shutdown coordinator.
- [ ] 4.3 Prove every completion, domain failure, cancellation, disconnect, early return, producer failure, startup failure, and shutdown path settles activity and timers exactly once without leaked handles or premature lease/SQLite release.

## 5. Typed sync streaming and packaged journeys

- [ ] 5.1 Add failing sync tests in which the first command automatically starts the daemon and preserves typed ordered progress plus one terminal outcome, bounded producer backpressure, native cancellation, and stable CLI presentation/exits.
- [ ] 5.2 Extend stream tests across an idle duration for slow production, backpressured consumption, cancellation, disconnect, iterator return, and producer error; prove the stream suppresses idle shutdown until request/iterator settlement and then starts one fresh idle interval.
- [ ] 5.3 Pass compiled Darwin and Linux CLI/daemon journeys covering first-command startup, compatible reuse, sync streaming, concurrent commands, status without startup/keepalive, automatic idle exit with a test-only short timeout, restart after idle, explicit stop, crash recovery, and zero direct SQLite opens after ensure.

## 6. Doctrine, documentation, and final verification

- [ ] 6.1 Promote the exact implementation doctrine from `implementation.md` into `local-daemon`, `cli-surface`, `generic-storage`, and `daemon-operation-streams` canonical implementation sidecars.
- [ ] 6.2 Refresh affected CLI/daemon/local-daemon codemaps through cartography and refresh `SYSTEM.md` through system-reference; update user documentation to state zero-administration on-demand lifecycle, five-minute idle exit, explicit lifecycle controls, and exact Darwin/Linux support without presenting service installation or remote RPC.
- [ ] 6.3 Run all focused slice gates, `bun run ci`, `bun run test:integration`, `bun run test:e2e`, `bunx openspec validate --all --strict`, `git diff --check`, and `openspec-verify-change`; obtain independent lifecycle/storage review and resolve all critical or important findings before archive.
