# apps/daemon/src/

## Responsibility

Implements the local daemon's application layer: foreground startup, production dependency composition, daemon lifecycle, RPC result projection, Bun Unix-socket transport, and signal-driven shutdown.

## Design / patterns

- `main.ts` is the direct Bun foreground entry point; it contains root selection, runtime startup, signal registration, lifetime waiting, and bounded rendering of structured startup failures to stable process exits.
- `runtime.ts` is the composition root. Its injectable hooks isolate startup/lifecycle tests while `productionServices()` wires logger, Realm/Source/Auth, search/retrieval/thread services, the secret vault, and `SyncApplicationService`; startup separately adapts the exact loaded Extension documentation projection into a read-only core documentation service.
- `application.ts` implements the contract-derived nested `DaemonRpcApplication` tree; it translates public core results into bounded RPC DTOs, preserves trusted auth/sync/validation/lookup taxonomy separately from public codes, and never exposes raw provider, storage, or diagnostic text.
- `transport.ts` keeps Bun-specific `Bun.serve` and oRPC `RPCHandler` adaptation outside RPC contracts and core. `signals.ts` adapts process signals to `RunningDaemon.close()`.

## Data & control flow

1. `startDaemon()` resolves canonical roots and endpoint identity, obtains exclusive retained lifecycle/database leases, safely projects database ownership conflicts, writes `starting` discovery metadata, reads unified direct and Catalog-curated installation records from `DirectExtensionStore`, opens/migrates the database, reads persisted local OAuth App identities, then loads installed Extensions offline with complete-registry collision validation and composes services. Invalid records contribute bounded startup diagnostics without blocking unrelated roots.
2. The runtime constructs `DaemonApplication`, removes a stale endpoint, binds `bindDaemonTransport()`, marks readiness, and writes `ready` metadata last.
3. The transport validates protocol/runtime headers and size-bounds the serialized runtime identity before routing `/rpc` requests with request ID and client protocol/runtime metadata; oRPC supplies the native request signal to the contract implementation separately.
4. `health` reports lifecycle state; business requests rejected during startup or shutdown receive lifecycle-specific bounded diagnostics. Realm/Source setup, sync/status, search/get/thread, active Source definitions, and Extension-documentation list/get/search delegate through daemon-owned services. Documentation inventory/search omit content, exact image retrieval uses bounded Base64, and no source path or executable definition crosses RPC. Search resolves Source references and preserves exact-Source remote continuation and pagination across RPC. The contract implementation forwards native cancellation into application operations; provider warning text is safely projected. `shutdown` starts admission closure and drain/finalization.
5. Finalization waits for active requests, closes database/listener, conditionally cleans matching discovery metadata and endpoint, and releases database then lifecycle leases. Startup failure rolls the same acquired state back.

## Integration points

- `index.ts` exposes the reusable application, runtime, signal, and transport APIs.
- `main.ts` is compiled/executed directly for the foreground daemon; `e2e/compiled-daemon.e2e.test.ts` verifies that path.
- Depends on public `@ctxindex/core/*`, `@ctxindex/local-daemon`, `@ctxindex/rpc`, `@ctxindex/adapters`, and `@orpc/server` seams only.
