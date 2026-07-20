# apps/daemon/

## Responsibility

Packages the Bun-executed local ctxindex daemon application: production service composition, Unix-socket RPC serving, retained lifecycle/database ownership, readiness publication, and graceful shutdown.

## Design / patterns

- `package.json` declares the private ESM `@ctxindex/daemon` workspace package, exports the reusable `src/index.ts` facade, and keeps Bun as the production runtime.
- `src/main.ts` is the foreground process entry point and safe startup-failure renderer; `src/runtime.ts` owns long-lived composition, lifecycle, and structured database-conflict projection, `src/application.ts` projects core behavior onto the RPC application contract, and `src/transport.ts` is the Bun/oRPC Unix-socket adapter.
- Filesystem identity, endpoint discovery, and lease safety remain in `@ctxindex/local-daemon`; core owns provider-neutral Source and sync behavior; `@ctxindex/rpc` owns DTO and router contracts.

## Data & control flow

1. A foreground Bun process executes `src/main.ts#main`, derives standard ctxindex roots, optionally accepts `CTXINDEX_DAEMON_RUNTIME_ROOT`, starts the runtime, installs signal handlers, and waits for `RunningDaemon.closed`.
2. `startDaemon()` canonicalizes runtime identity and endpoint paths, acquires exclusive lifecycle and database leases, publishes `starting` metadata, reads unified direct and Catalog-curated installation records and loads them without Catalog/network acquisition, opens and migrates SQLite, and composes core services.
3. It binds the Bun Unix-socket transport, marks the application ready, then publishes `ready` metadata. Requests enter `/rpc`, validate presented protocol/runtime headers, and route through the oRPC contract.
4. `DaemonApplication` tracks migrated Realm/Source/sync/status/search/get/thread requests, propagates cancellation through remote work and pre-mutation checks, bounds Resources and safe JSON without truncation, sanitizes failures/warnings, rejects new business work while stopping, and drains before resources and ownership metadata are released.
5. Shutdown requests and SIGINT/SIGTERM begin the same graceful close; a repeated signal exits with the conventional signal status.

## Integration points

- Registered by the root `package.json` `apps/*` workspace pattern.
- Depends on `@ctxindex/adapters` for built-in Extensions, `@ctxindex/core` for storage/config/services, `@ctxindex/local-daemon` for identity/discovery/leases, `@ctxindex/rpc` for contract/router composition, and `@orpc/server` for the fetch adapter.
- Detailed map: `apps/daemon/src/codemap.md`.
