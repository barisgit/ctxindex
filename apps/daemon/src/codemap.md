# apps/daemon/src/

## Responsibility

Implements the local daemon's application layer: process startup, production dependency composition, daemon lifecycle, RPC result projection, Bun Unix-socket transport, and signal-driven shutdown.

## Design / patterns

- `main.ts` is the direct Bun process entry point; it contains root selection, runtime startup, signal registration, lifetime waiting, and bounded rendering of structured startup failures to stable process exits. The CLI may launch it detached; no separate foreground product command is exposed.
- `runtime.ts` is the composition root. Its injectable hooks isolate startup/lifecycle tests while `productionServices()` wires logger, Realm/Source/Auth, search/retrieval/thread services, the secret vault, and `SyncApplicationService`.
- `application.ts` implements the contract-derived nested `DaemonRpcApplication` tree; it translates public core results into bounded RPC DTOs, preserves trusted auth/sync/validation/lookup taxonomy separately from public codes, and never exposes raw provider, storage, or diagnostic text.
- `transport.ts` keeps Bun-specific `Bun.serve` and oRPC `RPCHandler` adaptation outside RPC contracts and core. `signals.ts` adapts process signals to `RunningDaemon.close()`.

## Data & control flow

1. `startDaemon()` resolves canonical roots and endpoint identity, obtains exclusive retained lifecycle/database leases, safely projects database ownership conflicts, writes `starting` discovery metadata, reads unified direct and Catalog-curated installation records from `DirectExtensionStore`, opens/migrates the database, reads persisted local OAuth App identities, then loads installed Extensions offline with complete-registry collision validation and composes services. Invalid records contribute bounded startup diagnostics without blocking unrelated roots.
2. The runtime constructs `DaemonApplication`, owner-validates that any stale endpoint is a same-user single-link Unix socket before removal, binds `bindDaemonTransport()`, marks readiness, and writes `ready` metadata last. Unsafe regular-file or symlink endpoints fail closed before bind.
3. The transport validates protocol/runtime headers and size-bounds the serialized runtime identity before routing `/rpc` requests with request ID and client protocol/runtime metadata; oRPC supplies the native request signal to the contract implementation separately.
4. `health` reports lifecycle state; business requests rejected during startup or shutdown receive lifecycle-specific bounded diagnostics. Realm/Source setup, sync/status, search/get/thread, and active Source definitions delegate through daemon-owned services. Search resolves Source references and preserves exact-Source remote continuation and pagination across RPC. The contract implementation forwards native cancellation into application operations; provider warning text is safely projected. `shutdown` starts admission closure and drain/finalization.
5. Finalization waits for active requests, closes database/listener, conditionally cleans matching discovery metadata and endpoint, and releases database then lifecycle leases. Startup failure rolls the same acquired state back.

## Integration points

- `index.ts` exposes the reusable application, runtime, signal, and transport APIs.
- `main.ts` is compiled/executed directly as the daemon sibling; `e2e/compiled-daemon.e2e.test.ts` verifies detached start/status/stop, crash recovery, and direct process ownership paths.
- Depends on public `@ctxindex/core/*`, `@ctxindex/local-daemon`, `@ctxindex/rpc`, `@ctxindex/adapters`, and `@orpc/server` seams only.
