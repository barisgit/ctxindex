# packages/rpc/

## Responsibility

Defines the private composition-only `@ctxindex/rpc` package: bounded local-daemon DTO schemas, a pure oRPC contract with declared typed errors, injected router implementation, and generated client type.

## Design / patterns

- `package.json` exposes a single ESM facade and depends only on Zod plus transport-neutral `@orpc/contract` and `@orpc/server`.
- `src/schemas.ts` is the closed bounded DTO boundary. Its keyed failure registry is the single source for strict failure schemas, `RpcFailure`, oRPC codes, and declared error data. Search DTOs preserve constrained query-less remote execution, exact-Source opaque continuation, and an explicit local-offset versus remote-continuation pagination union. `RpcResult<T>` is internal to the injected application boundary and is never serialized; `RpcRequestContext` augments validated transport metadata with the native request signal.
- `src/contract.ts` owns the handler-free `@orpc/contract` procedure tree: exact inputs, plain success outputs, and registry-declared typed errors. `src/router.ts` recursively derives the nested `DaemonRpcApplication` from the contract input/output trees, then implements that contract with injected behavior, compatibility middleware, exactly-once delegation, and error adaptation.
- The package contains no Bun listener/client transport, daemon lifecycle, filesystem discovery or leases, database composition, provider calls, or CLI presentation.

## Data & control flow

1. A daemon composition root injects a `DaemonRpcApplication` and expected protocol/runtime identities into `createDaemonRouter()`.
2. The pure contract independently exposes every procedure path, exact input, plain success output, and declared bounded error; transport context is validated before handlers run.
3. Compatibility middleware rejects incompatible protocol or runtime identity with its declared typed error before application delegation.
4. Each handler forwards oRPC's native `AbortSignal` to exactly one injected application call. Its internal `RpcResult` is validated, then becomes either a plain success value or the matching declared typed error; throws and malformed results become the bounded internal error.
5. `DaemonRouter` implements the contract, and `DaemonClient` derives from the contract for consumers without importing daemon application code.

## Integration points

- `apps/daemon/` owns the Bun/oRPC server adapter and injects application behavior.
- `apps/cli/` owns the Bun Unix-socket client link and consumes the generated client plus DTO types.
- `@ctxindex/local-daemon` separately owns identity material, discovery, endpoints, and leases; `@ctxindex/core` separately owns application behavior.
