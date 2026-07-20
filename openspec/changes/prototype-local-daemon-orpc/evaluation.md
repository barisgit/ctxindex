# Local daemon prototype evaluation

Date: 2026-07-19

## Checkpoint accepted

The 2026-07-18 recommendation below was based on the deliberately partial sync/status slice. It is retained as prior evidence, but the final decision also incorporates the completed normal setup-and-access slices in tasks 7.1-7.7, the contract-derivation refinement in tasks 8.x-9.x, and the isolated private live acceptance report.

On 2026-07-20 the Human checkpoint selected `promote`. The private live journey confirmed daemon readiness; Realm and local-directory Source setup; separate-process sync, search, exact get, local thread traversal, and status; fail-closed behavior for an unconverted command; request cancellation with exit `130` and zero partial results; graceful shutdown/restart with retained indexed state; stale-endpoint no-fallback after forced termination; and successful direct execution after shutdown. Cleanup left no daemon process or socket. The separate follow-up change `promote-local-daemon-architecture` now owns canonical sidecars, full stateful-command migration, relative Extension path identity, platform policy, and explicit operational follow-ups.

The expanded implementation now covers Realm and Source management plus search, exact get, and thread traversal. Focused dependency-seam tests and the compiled exclusive-lease journey prove that a selected-daemon CLI does not open SQLite for those commands. Account/OAuth App/secrets, Artifact byte transfer, export, typed Actions, purge, and pre-daemon initialization remain explicit follow-on candidates.

The 2026-07-20 contract refinement replaced the internal-result-shaped wire protocol with a pure `@orpc/contract` contract. Successful procedures now return their bounded value directly; every safe failure variant is declared as typed oRPC error data with a constant outer message. Compatibility still precedes delegation, unsafe application output still collapses to one bounded internal failure, and native oRPC handler cancellation reaches the existing application context without placing `AbortSignal` in validated transport context. Focused RPC, daemon, and CLI tests prove every declared variant, plain success inference, signal identity, and declared-versus-unknown client error mapping. Request batching for a possible authenticated remote daemon and OpenAPI/external SDK generation for a future public protocol remain explicit separate follow-ups.

On 2026-07-20 the final rebased compiled daemon and relocated-Extension gate passed with `6 pass`, `0 fail`, and `130 expect()` calls in `17.98s`. Its representative journey created a Realm and Source using the daemon's active registry projection, synchronized and searched a local directory, retrieved the resulting Resource, traversed it through `thread get`, read status, removed a Source, fenced every remaining SQLite-backed family plus Account authorization and Extension-install identity preflights, and exercised lifecycle/lease behavior through separate compiled CLI processes while one daemon held the exclusive SQLite lease. The focused review-regression matrix passed `132` tests with no failures across retained Source routing and cleanup, direct database ownership, exhaustive direct/RPC exit-taxonomy parity, OAuth App identity ownership, daemon safe failure projection, and strict RPC schemas/router composition. Final integrated repository CI passed every gate, including `1588 pass` and `0 fail` in the full serial suite, in `168s`.

## Final verdict

Recommendation: `promote`.

The prototype demonstrated the intended architectural boundary for its deliberately partial slice: one foreground Bun process owns one canonical SQLite database and one immutable Extension registry; separate CLI processes route `sync` and `status` through a bounded typed RPC surface; direct SQLite owners and the daemon exclude one another; cancellation reaches a real sync; and shutdown retains ownership until work settles or the operator force-terminates the process.

This is not a decision to treat the prototype as a complete daemon migration or released service. The accepted `promote` direction is recorded through the separate `promote-local-daemon-architecture` change. This prototype still does not promote canonical sidecars itself.

## Measured evidence

The focused compiled multi-process gate was run on 2026-07-18 with repository-pinned Bun 1.3.14:

```text
5 pass
0 fail
121 expect() calls
13.28s
```

Those five scenarios measured:

- canonical alias convergence, same-state/different-tuple rejection, shared-database exclusion, and independent distinct runtimes;
- exact-tuple metadata and explicit test-override RPC selection, including no direct fallback after a selected daemon becomes unavailable;
- all 13 then-unconverted direct SQLite command families failing with exit `50` before open while the daemon held the database lease, two simultaneous shared direct holders blocking daemon exclusivity, and immediate reacquisition after SIGKILL;
- SIGINT cancellation of a real local-directory sync with CLI exit `130`, failed/cancelled bookkeeping, a null cursor and no materialized partial result, followed by a healthy ready daemon;
- two concurrent shutdown clients receiving structured timeout while a non-cooperative sync kept the daemon alive, non-admitting, and in possession of both lease files; force termination then permitted restart, graceful shutdown, file-copy backup, and direct database use.

The relocated compiled-Extension gate also passed with `1 pass`, `0 fail`, and `4 expect()` calls in `1.57s`, demonstrating that the compiled daemon host still loads an external TypeScript Extension after relocation. Both compiled gates used synthetic local fixtures and isolated config/data/state/cache roots. They used no credentials, live providers, or provider data.

No product assertion failed in these measured runs. The evidence does expose deliberate product failures and limits: selected RPC does not fall back when unavailable; unconverted database-backed commands fail while daemon ownership is active; non-cooperative work can force shutdown timeout and require explicit operator termination; and registry/config changes are not hot-reloaded.

## Strengths

- Ownership is tied to canonical runtime and database identities, not a raw spelling of a path. Separate lifecycle and database leases close the same-state/different-data and different-state/same-data gaps.
- The CLI remains the only agent-facing contract. Transport envelopes, private RPC procedures, and numeric exit mapping do not leak into the public command surface.
- `@ctxindex/rpc` is narrow, contract-first, and bounded: the pure contract owns paths, inputs, and plain outputs; one keyed registry owns strict failure data and declared error codes; the nested application type derives recursively from the contract; compatibility precedes business delegation; handlers delegate once; native request signals retain identity; and strict schemas reject unknown or oversized results rather than returning partial success.
- The long-lived daemon owns runtime composition, SQLite, and one immutable registry, while provider-neutral sync orchestration remains reusable in core.
- Readiness and shutdown are observable without fixed sleeps. A stale or lost selected endpoint produces deterministic daemon-unavailable behavior without opening SQLite in the client.
- Kernel-retained leases survive ordinary lock-file persistence and are released by process death without unlink or heartbeat recovery.

## Unsupported and unconverted stateful paths

Realm add/list, Source add/list/remove, sync/status, search, exact get, and local thread traversal are migrated business commands. `daemon health` and `daemon shutdown` are lifecycle operations. There is still no full CLI migration.

While a daemon holds the canonical database lease, these unconverted direct stateful paths are intentionally unsupported and fail `prototype_unsupported` with exit `50` before SQLite open or any configuration, Catalog, or filesystem mutation:

| Family | Unsupported commands in daemon-owned mode | Compiled representative |
|---|---|---|
| initialization | `init` | `init` |
| Account management | `account add`, `account list`, `account remove` | `account add`, `account list` |
| OAuth App management | `oauth-app add`, `oauth-app list`, `oauth-app remove` | `oauth-app list` |
| secret backend | `secrets status`, `secrets backend set` | `secrets status` |
| Artifact access | `artifact list`, `artifact download` | `artifact list` |
| export | `export` | `export` |
| typed Actions | `action describe`, `action run` | `action describe` |
| local cache purge | `purge artifacts` | `purge artifacts` |
| installed Extension mutation with local-App preflight | `extensions install` | `extensions install` |

Without daemon ownership, those families retain their direct behavior under a shared lease. The compiled gate exercises one command from every remaining family; the shared `openDeps`/leased-database seam fences the remaining subcommands in each listed family. Source command parsing obtains generated config-option metadata from the daemon's immutable active registry for Source add, while list/remove grammar is validated locally before transport.

Catalog and installed-Extension workflows (`extensions catalog add/list/show/refresh/remove`, `extensions install`, and `extensions uninstall`) remain direct filesystem/Git workflows rather than RPC procedures. Catalog management does not open SQLite. Install acquires the shared database lease before reading local OAuth App identities, so it fails with exit `50` before Catalog access, Extension loading, or filesystem mutation while a daemon owns the database. Uninstall does not read SQLite and remains a direct filesystem mutation. A running daemon keeps its already loaded registry; successful changes made while it is stopped take effect only after a later start. Service management, autostart, background scheduling, and backup orchestration are also unimplemented rather than silently provided by this prototype.

## Cancellation and shutdown

Cancellation succeeded across the compiled CLI, Unix-socket RPC, daemon application, core sync service, and local-directory Adapter. SIGINT produced exit `130`; the operation recorded a failed/cancelled run with no cursor or partial materialization; active request count returned to zero; and the same daemon remained ready. The implementation uses request-scoped cancellation, so one client cancellation does not trigger daemon-wide shutdown.

Graceful shutdown stops admission, signals active work, and reports completion only after SQLite and both leases are released. The compiled non-cooperative case proved the failure mode: both concurrent shutdown clients exited `50` with timeout diagnostics, no client printed completion, new RPC and direct database work remained rejected, and the daemon retained ownership. Explicit force termination released kernel ownership, after which restart, a successful graceful shutdown, backup copy, and direct use succeeded. Unit evidence separately covers eventual cooperative settlement and cleanup without force termination.

This is safe but operationally incomplete: there is no supervisor, escalation policy, detached service, or automated recovery workflow. An operator must decide whether and when to force-terminate non-cooperative work.

## Security and compatibility limitations

- The daemon binds only a Unix-domain socket in an owner-only runtime directory and does not expose TCP. This is local filesystem/process isolation, not a remote-authentication design.
- RPC/public failures are bounded and omit raw roots, socket and SQLite paths, stacks, causes, OS/backend diagnostics, provider bodies, Extension paths, tokens, and secret canaries. Internal logs still rely on the repository's existing redaction rules.
- Startup performs no Catalog or Extension network acquisition. Provider egress remains possible only when a migrated sync invokes an already loaded Adapter through existing allowlist, authentication, secret, and cancellation boundaries.
- Protocol compatibility is exact and private. There is no cross-version daemon/client compatibility promise, negotiation, or rolling-upgrade procedure; the stable agent contract remains CLI output and exit codes.
- The daemon implementation is Bun 1.3.14 and Darwin retained-file-lock specific. Unsupported platforms reject daemon startup while retaining the existing direct CLI path; unsupported Darwin filesystems or locking primitives fail closed. There is no Node compatibility shim or TCP fallback.
- There is no local-client authentication beyond owner-only filesystem access, no service manager or autostart, no background queue/scheduler, no hot reload, no schema migration, and no remote access.
- Configured relative Extension paths remain a current-process ambiguity. Promotion must define canonical persisted resolution before treating daemon registry ownership as durable doctrine.
- Backup is a documented boundary, not an automated command: clients must stop sync, request shutdown, and verify database handle plus both matching leases are released before copying SQLite and the file secret store. Endpoint disappearance or shutdown timeout is insufficient.

## Recommendation and accepted next step

The measured proof supports `promote` because the hard risks that motivated the prototype—canonical single ownership, typed error fidelity, immutable registry lifetime, real cancellation, shutdown lease retention, and compiled multi-process behavior—worked together without product assertion failures. The remaining weaknesses are expected consequences of the intentionally bounded prototype rather than evidence that the selected process/RPC boundary must be replaced.

The Human selected `promote`. The separate `promote-local-daemon-architecture` OpenSpec change specifies canonical sidecars, migration or deliberate exemption of every remaining stateful path, launch-directory-independent Extension resolution, supported-platform gates, and separately scoped operational work for service installation/autostart, enhanced local-client authentication, and backup automation.
