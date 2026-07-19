# packages/rpc/

## Responsibility

Defines the private composition-only `@ctxindex/rpc` package: bounded local-daemon request/result schemas, protocol/runtime compatibility enforcement, the injected application contract, router composition, and its generated client type.

## Design / patterns

- `package.json` exposes a single ESM facade and depends only on Zod plus the transport-neutral `@orpc/server` contract builder.
- `src/schemas.ts` is the closed wire-shape boundary. Strict schemas cap strings, collections, cursors, Source-definition JSON defaults, Resources, recursive threads, safe JSON payloads, counters, timeouts, diagnostics, and typed failures including `result_too_large`; transported ctxindex failures carry a closed taxonomy discriminator so colliding public codes retain their meaning.
- `src/router.ts` uses dependency injection: `DaemonRpcApplication` supplies behavior, compatibility middleware validates presented protocol and exact runtime identity, and every application result is revalidated before emission.
- The package contains no Bun listener/client transport, daemon lifecycle, filesystem discovery or leases, database composition, provider calls, or CLI presentation.

## Data & control flow

1. A daemon composition root injects a `DaemonRpcApplication` and its expected protocol/runtime identities into `createDaemonRouter()`.
2. Request context is parsed before handlers run; incompatible protocol or runtime identity returns a bounded typed failure.
3. Health/shutdown, active Source definitions, Realm/Source management, sync/status, search, Resource get, and thread get inputs pass through strict semantic endpoint schemas to the injected application.
4. Returned application values are checked against endpoint-specific `RpcResult` schemas; throws or invalid shapes collapse to one bounded internal failure.
5. `DaemonRouter` derives from the composed router, and `DaemonClient` derives from that router for the CLI without importing the daemon application.

## Integration points

- `apps/daemon/` owns the Bun/oRPC server adapter and injects application behavior.
- `apps/cli/` owns the Bun Unix-socket client link and consumes the generated client plus DTO types.
- `@ctxindex/local-daemon` separately owns identity material, discovery, endpoints, and leases; `@ctxindex/core` separately owns application behavior.
