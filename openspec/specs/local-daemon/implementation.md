# Local Daemon Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

Package roles and dependency direction live in [module-architecture](../module-architecture/implementation.md), CLI routing and the safe-exception allowlist in [cli-surface](../cli-surface/implementation.md), retained lease mechanics in [generic-storage](../generic-storage/implementation.md), and declared failure projection in [error-taxonomy](../error-taxonomy/implementation.md).

## Interfaces

### apps/daemon — contract-derived application seam

```ts
export interface DaemonIdleTimer {
  now(): number
  setTimeout(callback: () => void, delayMs: number): unknown
  clearTimeout(handle: unknown): void
}

export class DaemonApplication implements DaemonRpcApplication {
  beginStopping(): boolean
}

export interface DaemonApplicationOptions {
  readonly idleTimeoutMs?: number
  readonly idleTimer?: DaemonIdleTimer
}

// apps/daemon/src/runtime.ts
export const DAEMON_IDLE_TIMEOUT_MS = 5 * 60_000
```

`DaemonRpcApplication` is recursively derived from `daemonContract` in `@ctxindex/rpc`; the daemon never declares a second procedure or application signature list. Semantic families include system, registry, extension, realm, source, status, sync, search, resource, thread, export, artifact, action, account, oauthApp, secrets, and documentation. The conceptual groups OAuth App, Account/Grant, secret backend, Artifact/export/purge, Action, and installed Extension inventory name core service ownership, not handwritten RPC interfaces.

## Runtime ownership

On an advertised platform one compatible daemon per canonical runtime owns the SQLite database, the active Extension registry, runtime composition, provider access, and every stateful application service. The `apps/daemon` runtime acquires exclusive lifecycle ownership and then exclusive database ownership before SQLite opens or the registry loads, publishes `starting` discovery metadata, reads installed Extension records, opens and migrates SQLite once, loads Extensions offline into one complete registry, composes services, binds the owner-private Unix socket, and publishes `ready` metadata before admission opens. Startup failure rolls the same acquired state back.

The registry and its documentation projection are immutable for the daemon lifetime. Installed-Extension changes take effect only at a later daemon start; request handlers never mutate the active registry.

## On-demand lifecycle

Users and agents do not administer the daemon. After local validation, an initialized stateful command ensures one compatible daemon through the CLI ensure route described in [cli-surface](../cli-surface/implementation.md): reuse a running compatible instance, recover owner-checked stale state, or launch the packaged daemon detached and wait for compatible health. Same-process ensures share one in-flight operation per canonical runtime; concurrent processes converge only through the retained lifecycle lease and discovery validation, so simultaneous first commands produce one owner. PID values, lock-file contents, and discovery metadata never prove ownership or select a signal target. Their absence never proves release either: the runtime removes discovery metadata before it releases its leases, so start and ensure observe a starting or stopping owner's release only through a non-waiting shared probe of the retained lifecycle lease.

On-demand startup adds no procedure, command tunnel, polling contract, service-manager integration, or TCP listener. `daemon start|status|stop` remain explicit operational controls over the same lifecycle.

## Admission, cancellation, and ephemeral state

`DaemonApplication` admits each business procedure into one request tracker, links a request-scoped `AbortController` to the native transport signal, and settles the tracked entry exactly once on success, declared failure, cancellation, disconnect, or shutdown. Health and shutdown are lifecycle procedures and are never tracked as business work. Core application services own provider-neutral workflows; the application only resolves inputs, delegates, and projects bounded DTOs.

### Activity-aware idle shutdown

The request tracker owns idle lifetime. `#armIdle()` arms one deadline only while the application is `ready` and no business request is tracked; every admission disarms it, and the final settlement of overlapping requests rearms one full interval. A streamed procedure such as `sync.run` stays tracked until its iterator finalizes, so slow production, an unfinished stream, and long unary work never expire. Lifecycle procedures (health, which backs `daemon status` and ensure probes, and shutdown) are not tracked and never touch the deadline; Source `status.get` is ordinary business work. Admission and expiry are synchronous on the same tracker: expiry rechecks the lifecycle, the tracked count, and the monotonic deadline (re-scheduling an early host timer) and then calls `beginStopping()`, so a racing request is either admitted and keeps the daemon alive or rejected by closed admission.

The runtime composes the fixed five-minute `DAEMON_IDLE_TIMEOUT_MS` with a `performance.now()` monotonic clock. The internal `CTXINDEX_TEST_DAEMON_IDLE_TIMEOUT_MS` read by `main.ts` can only shorten that value for compiled tests; it is not user configuration and malformed values are ignored. The deadline, timer handle, and tracked count are process-local and never stored in SQLite or discovery metadata.

Authorization stages and byte-transfer tickets are the only daemon-owned ephemeral business state. An authorization stage has an opaque one-use id, its own bounded expiry, and no token or App secret; transfer tickets are described in [retrieval-and-artifacts](../retrieval-and-artifacts/implementation.md). Neither is persisted, and shutdown clears both.

## Graceful shutdown

Explicit `system.shutdown`, SIGINT/SIGTERM, and idle expiry all call `beginStopping()`, which closes admission atomically and starts one idempotent finalization; there is no parallel close path, and concurrent triggers converge on the same shutdown promise: drain tracked requests, clear transfer tickets, close SQLite and the listener, remove matching discovery metadata and endpoint, then release the database lease before the lifecycle lease. A close that exceeds its observation timeout reports `timeout` and retains ownership while work remains. A repeated signal exits with the conventional signal status.

## Platforms and debug entry

Darwin and Linux provide retained-ownership backends. Any other platform, including Windows, is not advertised: backend selection throws `FileLeaseUnsupportedError('platform')`, daemon startup fails before SQLite opens, `daemon status` reports `unsupported`, explicit `daemon start` fails with exit `50`, and the CLI keeps its conditional direct route because no daemon can own that database.

There is no public foreground `daemon serve`. Running the daemon executable directly (`apps/daemon/src/main.ts` under Bun, or the packaged `ctxindex-daemon` sibling) uses the internal foreground entry `runForegroundMain()` and is the debug path; it shares the normal startup, signal, and shutdown code.

## Security and compatibility

The transport is a local owner-private Unix socket with no TCP listener, remote peer, batching, OpenAPI, or public SDK. Compatibility middleware validates the exact private protocol identity and canonical runtime identity before admission; mismatched peers fail closed. `rpcCompatibilityFailure()` in `@ctxindex/rpc` is the single rule: the RPC middleware throws its declared failure, and the byte-transfer route, which bypasses the oRPC router, returns the same failure body with HTTP `409` before consuming the one-use ticket, so an incompatible client cannot spend it. The CLI remains the only stable integration contract. Results, errors, traces, and logs exclude tokens, App secrets, provider payloads, raw roots and paths, backend errors, stacks, causes, and environment contents, except the named Extension-location business fields and the write-only OAuth App configuration input recorded in the owning sidecars.

Service installation and login startup (#89), stronger local-client authentication (#90), and backup automation (#91) are separate follow-ups.

## Direct maintenance exclusion

The CLI coordinates direct installed Extension maintenance with daemon startup through the canonical database lease. The daemon remains Extension-lifecycle-agnostic: startup requires exclusive database ownership before SQLite open or immutable-registry loading, while the direct mutation coordinator retains shared ownership for its complete operation. This dependency direction keeps package acquisition and installed-record mutation out of `@ctxindex/local-daemon`, `@ctxindex/rpc`, and the daemon application.

The coordinator composes the existing typed daemon status, graceful stop, and start operations with direct database ownership. A daemon that was running is stopped before ownership acquisition and restored only after ownership release. Unsupported platforms retain direct behavior because no daemon can own their database.

## Verification

- `tests/tooling/verify/rpc-contract-derivation.test.ts` and module-architecture gates prove one contract-derived application, registry-derived failures, exactly-once delegation, and no command tunnel.
- `tests/tooling/cli/command-ownership.test.ts` classifies every public command leaf as daemon-routed or an allowlisted exception and proves no fallback after selection.
- Application, runtime, runtime-lease, transfer, and shutdown tests cover admission, cancellation, safe projection, ephemeral-state cleanup, ownership retention through settlement, and startup rollback.
- Compiled daemon suites under `apps/daemon/src/e2e/` and `apps/cli/src/e2e/compiled-daemon-action-artifact.e2e.test.ts` exercise multi-process ownership, the immutable registry, staged OAuth with loopback mocks, byte transfer, restart, crash release, and shutdown without live provider access.
- `idle-lifecycle.test.ts` uses an injected clock to prove readiness arming, last-settlement rearm, overlapping and long unary work, stream iterator settlement, health non-activity, admission/expiry races, and explicit-stop precedence; `shutdown-convergence.test.ts` proves ownership stays retained through shutdown timeout and that a failed startup leaves no idle timer or ownership behind; `main-idle-timeout.test.ts` bounds the test-only override; `e2e/compiled-idle-exit.e2e.test.ts` proves a packaged daemon exits despite `daemon status` polling and restarts on the next command.
- Focused coordinator tests inject lifecycle and ownership effects and assert exact stop–acquire–mutate–release–restart ordering, stopped and unsupported behavior, failure cleanup, and error precedence. Daemon lease tests independently prove shared direct ownership excludes exclusive daemon startup before SQLite open.
