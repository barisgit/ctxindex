## Capability Implementation Targets

- `local-daemon` → `openspec/specs/local-daemon/implementation.md`
- `cli-surface` → `openspec/specs/cli-surface/implementation.md`
- `error-taxonomy` → `openspec/specs/error-taxonomy/implementation.md`

## Module Ownership

`apps/cli` owns lifecycle command parsing/formatting, exact daemon executable resolution, detached child creation, bounded readiness/status/stop orchestration, and signal-to-cancellation wiring. Lifecycle orchestration remains separate from business command handlers. Ordinary handler routing stays unchanged until the full stateful-parity gate.

`@ctxindex/local-daemon` continues to own canonical runtime identity, endpoint resolution, validated discovery metadata, owner-checked metadata cleanup, and retained lifecycle/database leases. The CLI may compose these primitives for stale-state cleanup only while it holds the exact runtime's exclusive lifecycle lease. This package remains free of RPC, CLI formatting, spawning, database composition, and provider behavior.

`apps/daemon` remains the only runtime composition root. Its executable owns startup initialization, immutable registry, SQLite, listener binding, health, request admission/draining, metadata transitions, and graceful resource release. Before replacement or finalization removes an endpoint, the runtime requires a same-user, non-symlink, single-link Unix socket and treats absence as idempotent. It has no foreground-product mode distinction: the same executable is independently launched by tests or detached by the CLI.

`@ctxindex/rpc` remains unchanged and composition-only. Background lifecycle is a local process/discovery concern; no start procedure, PID control, child output, or host path crosses the private RPC contract.

## Interfaces and Data Flow

The CLI lifecycle facade exposes schema-independent local types equivalent to:

```ts
type DaemonStatusResult =
  | { readonly status: 'unsupported' }
  | { readonly status: 'stopped' }
  | {
      readonly status: 'starting' | 'stopping' | 'unavailable'
      readonly instanceId: string
      readonly pid: number
      readonly startedAt: string
    }
  | { readonly status: 'running'; readonly health: RpcHealthResult }

interface DaemonStartResult {
  readonly status: 'running'
  readonly started: boolean
  readonly health: RpcHealthResult
}

type DaemonStopResult =
  | {
      readonly status: 'stopped'
      readonly alreadyStopped: boolean
      readonly instanceId?: string
    }
  | { readonly status: 'unsupported'; readonly alreadyStopped: true }

interface DaemonLifecycle {
  start(signal?: AbortSignal): Promise<DaemonStartResult>
  status(signal?: AbortSignal): Promise<DaemonStatusResult>
  stop(signal?: AbortSignal): Promise<DaemonStopResult>
}
```

An unsupported retained-ownership platform returns a bounded explicit-start failure and an `unsupported` observation. A test endpoint override is observed only through existing command routing and never causes lifecycle spawn.

The default command path is:

```text
Citty lifecycle command validation
  -> initialized-state preflight for start
  -> coalesced lifecycle start
     -> exact discovery + compatible health
     -> detached sibling launch when absent/stale
     -> bounded readiness polling
  -> lifecycle formatter and stable exit mapping
```

`resolveDaemonLaunch()` remains the sole executable resolver. Source mode returns `[process.execPath, daemonSourceEntrypoint]`; package mode returns only the executable sibling after absolute regular executable validation. The injected launch effect receives an exact argv array, current environment, ignored stdin, private diagnostic descriptors, `detached: true`, and calls `unref()`.

Readiness polling rereads exact validated discovery and uses existing `daemonHealth()`, so compatibility and runtime middleware remain authoritative. It does not infer readiness from process existence, metadata alone, or a fixed sleep. The startup deadline and poll interval are bounded constants and injected clock/sleep/spawn/read effects make unit tests deterministic.

Each public lifecycle operation has one outer diagnostic boundary. It preserves validated `DaemonCliError`, caller cancellation, and the typed `invalid_args` initialization preflight, while unexpected runtime canonicalization, discovery, and filesystem errors become action-specific bounded `daemon_unavailable` failures without reflecting raw host text.

`stop` uses existing `daemonShutdown()` after any successful compatible health response, including transitional `ready: false` health. When metadata is unreachable, it non-blockingly acquires the exact lifecycle lease, rereads/owner-checks the same discovery record through `cleanupDiscoveryMetadata`, removes only the matching endpoint after successful metadata removal, then releases the lease. Lease conflict means a process still owns lifecycle and is reported unavailable rather than signalled.

## Storage and State

The detached daemon persists no new domain state. Existing discovery metadata and permanent lease files retain their formats. The daemon startup diagnostic file is an owner-private regular file beneath the canonical state root with bounded rotation/truncation policy; it is not discovery authority and may be deleted without affecting ownership.

Within one CLI process, an in-memory map keyed by canonical runtime tuple coalesces concurrent start promises and removes each promise after settlement. It contains no secrets, provider data, paths in errors, or durable state.

The daemon process remains the sole owner of the ready runtime's SQLite handle, active registry, socket listener, and exclusive leases. Detached child handles are unreferenced after spawn. The CLI never persists or trusts a PID file.

## Security and Compatibility

Lifecycle diagnostics must never include provider payloads or credentials and are never returned over RPC. Public errors use fixed bounded messages; raw child stderr, executable paths, endpoint paths, state roots, host errors, stacks, and causes stay out of CLI output. Diagnostic files and parent directories are current-user-owned and mode `0600`/`0700`.

The detached launch inherits the invocation environment because XDG roots, test isolation, logging configuration, and Extension behavior must match the CLI runtime. It does not enumerate, serialize, or print that environment. Tests supply synthetic isolated roots and no live auth.

The private RPC version remains exact. A discovered incompatible daemon fails actionably and is not automatically killed or replaced. This pre-alpha change intentionally removes foreground command compatibility aliases. No public protocol or storage compatibility obligation is created.

Linux-readiness of the spawn/status implementation must not be conflated with Linux daemon support. Platform support continues to follow the retained-lease gate. No new lifecycle code may import Darwin flags or invoke launchd/systemd.

## Verification

- CLI unit tests cover exact source/package launch argv, detached/no-stdin spawn options, same-process coalescing, already-running reuse, absent start/readiness, starting/stopping observation, timeout, cancellation, initialization guidance, path-bearing runtime/discovery error sanitization, unsupported-platform status/failure, stable output, and start/status/stop idempotency.
- Command tests begin with failing assertions that the supported subcommands are exactly `start`, `status`, and `stop`, and malformed normal commands perform no discovery/spawn.
- Local-daemon/CLI focused tests cover stale owner-checked cleanup, live versus crashed `stopping` state, lease conflict, changed metadata, stale endpoint removal only after cleanup, unsafe regular-file/symlink endpoint rejection, and no PID signalling.
- Compiled multi-process tests use isolated roots and polling to prove detached survival after CLI exit, concurrent-start convergence on one instance, explicit status, graceful stop, repeated stop, SIGKILL stale recovery, ordinary no-autostart before parity, and relocated sibling resolution without fixed sleeps or leaked processes.
- Existing selected-daemon no-fallback, direct unsupported-platform, shutdown timeout, protocol/runtime compatibility, request cancellation, and package relocation tests remain green.
- Final gates are `bun run ci`, `bunx openspec validate --all --strict`, `git diff --check`, affected cartography/system-reference refresh, and independent review.

## Promotion Notes

- Merge detached lifecycle, retained-ownership single-instance authority, health-backed readiness, stale-state cleanup boundary, private diagnostics, and platform-support distinction into `openspec/specs/local-daemon/implementation.md`.
- Merge `DaemonLifecycle`, executable resolution, Citty-before-lifecycle validation, thin lifecycle commands, explicit stateful-parity autostart gate, test-override behavior, and no-direct-fallback boundary into `openspec/specs/cli-surface/implementation.md`.
- Merge bounded startup/readiness/cancellation diagnostics and successful idempotent outcomes into `openspec/specs/error-taxonomy/implementation.md`.
