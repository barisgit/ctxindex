## 1. Background lifecycle facade and command surface

- [x] 1.1 Add failing CLI tests that replace `serve/health/shutdown` with exactly `start/status/stop`, preserve Citty-generated help/validation, and prove status/stopped plus repeated stop are successful deterministic human/JSON results.
- [x] 1.2 Add failing lifecycle tests for source/package executable resolution, detached ignored-stdin spawn, owner-private diagnostics, initialized-state preflight, already-running reuse, bounded readiness, cancellation, unsupported platform, and same-process start coalescing; implement the injected background lifecycle facade without ordinary-command autostart.
- [x] 1.3 Pass focused CLI lifecycle/command/typecheck/thin-boundary gates before multi-process integration.

## 2. Safe stale state and graceful stop

- [x] 2.1 Add failing tests for starting/stopping/unavailable observation, graceful live stop, lease-conflicted stale state, owner-checked stale metadata cleanup, matching endpoint cleanup only after metadata removal, changed/malformed state fail-closed behavior, and the prohibition on PID signalling.
- [x] 2.2 Implement bounded health-backed observation and idempotent stop by composing existing exact discovery, RPC shutdown, retained lifecycle ownership, and owner-checked cleanup primitives.
- [x] 2.3 Pass focused local-daemon, daemon-runtime, daemon-client, lifecycle, and stable-exit tests.

## 3. Compiled background lifecycle proof

- [x] 3.1 Extend the isolated compiled daemon workflow with failing cases for relocated sibling launch, detached survival after the starting CLI exits, concurrent start convergence on one instance, health-backed status, graceful stop, repeated stop, and SIGKILL stale recovery without fixed sleeps.
- [x] 3.2 Prove an ordinary no-selector command still takes its current direct path and does not autostart before full stateful parity; retain selected-daemon no-fallback, unsupported-platform direct behavior, and no leaked daemon/socket/process state.
- [x] 3.3 Pass the compiled daemon/package relocation gates repeatedly and run network-egress plus `git diff --check`.

## 4. Documentation, doctrine, and final verification

- [x] 4.1 Update lifecycle help/usage documentation and affected codemaps, then refresh only the lifecycle and CLI portions of `SYSTEM.md` through the repository skills without claiming command-triggered autostart or new platform support.
- [x] 4.2 Promote the applicable implementation doctrine into the available canonical `cli-surface` and `error-taxonomy` implementation sidecars; retain `local-daemon` doctrine change-locally until the active daemon-promotion change creates that canonical capability.
- [x] 4.3 Run `bun run ci`, `bunx openspec validate --all --strict`, and `openspec-verify-change`; address every critical/important independent review finding and record residual parity/platform risks.

Verification note: the branch CI passed install, lint, root typecheck, build, package, architecture, command-drift, thin-CLI, and generated-reference gates. Its exhaustive run recorded 1,720 passes plus three unrelated CLI e2e timeouts while four worktrees ran full suites concurrently; all three timed-out files then passed in isolation (6/6). A clean whole-repository run remains the ordered-integration gate on main. Independent review approved with zero critical/important findings after stale-transition, package cleanup/survival, unsafe endpoint, and host-error-boundary fixes. Residual risks are the explicit stateful-parity autostart gate, Darwin-only verified ownership, and preserving streaming protocol v2 plus new `status.health` fixtures during rebase.
