## Why

Every stateful CLI invocation currently composes its own runtime, loads Extensions, and may open SQLite directly. WAL and bounded contention handling make concurrent short-lived processes tolerable, but they do not provide one owner for storage, runtime state, cancellation, or future background synchronization. With trusted Extension Catalogs now available, a disposable local-daemon prototype can test the next architectural boundary without committing the product to an unproven service design.

## What Changes

- Add a local-only daemon lifecycle whose ready process holds both a canonical runtime-identity lease and the exclusive lease for its canonical SQLite path, and is the sole production owner of that database, runtime composition, and loaded Extensions.
- Route a broad vertical slice of normal stateful CLI behavior through a typed local RPC boundary while preserving the CLI as the only agent-facing interface. The prototype must cover setup and routine context access, not only sync/status.
- Select RPC for that slice only when validated exact-tuple lifecycle/discovery metadata exists or a test endpoint override explicitly selects it; once selected, an unreachable/stale endpoint fails daemon-unavailable without direct fallback.
- Add deterministic health, readiness, shutdown, cancellation, unavailable-daemon, and incompatible-protocol behavior suitable for isolated worktrees and automated tests.
- Add a separate private `@ctxindex/rpc` package containing only a pure oRPC contract-first boundary with exact bounded input/output/declared-error schemas, schema-derived types, one narrow injected application interface, contract implementation, and compatibility/cross-cutting middleware; all use-case and business logic remains in the daemon application and core.
- Derive every declared error, the bounded `RpcFailure` union, client validation, and the recursive injected application shape from the contract and one authoritative failure registry rather than maintaining parallel procedure/error declarations.
- Add a separate private `@ctxindex/local-daemon` infrastructure package shared by daemon and CLI for canonical path identity, safe digests, endpoint discovery metadata, and lease primitives; it contains neither business logic nor RPC procedure composition.
- Block every still-unconverted stateful CLI command with prototype-unsupported exit `50` before database open whenever a daemon holds the target database lease; retain its direct behavior only when no daemon owns that database.
- Preserve core as the owner of provider-neutral behavior, the daemon as the application composition root, and the CLI as the argument, formatting, and exit-code boundary.
- Treat the result as a prototype that ends with an evaluation report and Human checkpoint where the user chooses promote or replace; any promotion is a separate conditional follow-up change rather than an automatic sidecar update.

## Capabilities

### New Capabilities

- `local-daemon`: Local process ownership, lifecycle, protocol compatibility, health, cancellation, and single-instance behavior.

### Modified Capabilities

- `module-architecture`: Add explicit RPC-package, shared lifecycle-infrastructure, daemon-composition, and CLI-client ownership boundaries.
- `cli-surface`: Preserve deterministic CLI behavior across the daemon transport and expose bounded daemon lifecycle commands.
- `error-taxonomy`: Carry structured domain and transport failures across RPC while retaining CLI-owned stable exit mapping.
- `generic-storage`: Make a canonical SQLite-path lease fence every production opener and every unconverted stateful CLI command.
- `core-model`: Require clean daemon shutdown before the baseline file-copy backup procedure.
- `extension-loading`: Load the active Extension registry once into daemon-owned runtime state without ambient acquisition.

## Impact

- Adds two private workspace packages—`@ctxindex/rpc` for typed RPC composition and `@ctxindex/local-daemon` for shared lifecycle infrastructure—and one Bun daemon application.
- Changes the prototype slice of the CLI from direct core-service composition to a typed local client.
- Adds local endpoint and process-lifecycle state keyed by safe digests of the canonical config/data/state/cache tuple, plus an exclusive database lease keyed by the canonical SQLite path, with worktree/test isolation through existing path overrides.
- Adds a local RPC dependency and compiled multi-process lifecycle coverage.
- Keeps request batching for a possible remote daemon and OpenAPI/external SDK generation as explicit follow-up work; neither is enabled for the private local prototype protocol.
- Does not change provider schemas, provider requests, stored domain schema, Extension authoring contracts, or the external agent integration surface.
