# Module Architecture Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings prioritize interfaces, type aliases, discriminated unions, and full generic contracts trimmed from the current source. Exported functions appear only where they clarify a module boundary; imports and implementation bodies are omitted.

### Workspace modules

```text
@ctxindex/cli
  executable composition root and command/output boundary
@ctxindex/core
  provider-neutral runtime services, persistence, orchestration, and registries
@ctxindex/extension-sdk
  public authoring contracts and generic definition factories
@ctxindex/profiles
  bundled provider-neutral Profile definitions
@ctxindex/official
  official Providers, OAuth Apps, Source Adapters, shared transports,
  documentation trees, and Extension roots
@ctxindex/rpc
  pure private daemon contract, bounded schemas, failure registry,
  derived application type, and thin router composer
@ctxindex/local-daemon
  canonical runtime identity, discovery metadata, endpoint resolution,
  and retained file-lease backends
@ctxindex/daemon (apps/daemon)
  Bun composition root for the long-lived stateful runtime
```

### Daemon dependency direction

```text
apps/cli ───────────────┐
                        ├──> @ctxindex/rpc
apps/daemon ────────────┘
    │
    ├──> @ctxindex/local-daemon
    ├──> @ctxindex/core
    └──> explicit built-in Extension composition

apps/cli ──> @ctxindex/local-daemon
@ctxindex/rpc -/-> core, storage, providers, Extension loading, lifecycle, CLI formatting
@ctxindex/local-daemon -/-> RPC, core, provider behavior, CLI formatting
@ctxindex/core -/-> RPC, daemon, CLI
apps/cli -/-> apps/daemon
```

### @ctxindex/rpc — contract-derived application

```ts
export const daemonContract = { /* semantic procedure groups */ } as const

export type DaemonRpcApplication = ContractApplication<
  typeof daemonContract,
  InferContractRouterInputs<typeof daemonContract>,
  InferContractRouterOutputs<typeof daemonContract>
>

export function createDaemonRouter(
  application: DaemonRpcApplication,
  expectations: DaemonRouterExpectations,
): DaemonRouter;
```

Each contract procedure becomes `(input, context: RpcRequestContext) => Promise<RpcResult<Output>>` in the derived application; streamed outputs become async iterators whose terminal value is an `RpcResult`.

### @ctxindex/extension-sdk — imported-value authoring boundary

```text
@ctxindex/extension-sdk
  z and core-independent plain-value factories/types
  Profile, Provider, OAuth App, Adapter, and Extension definitions
  direct auth.oauth2 and auth.none constructors
  pure Extension-root documentation descriptors and eager virtual trees
  no leaf docs, reference factories, dependency graph, host callback, or registration
```

Provider and Profile use sites accept exact imported values. Adapter types discriminate OAuth2 Provider-backed, `none` Provider-backed, and providerless shapes so Provider authorization, access, and egress fields are impossible on providerless Adapters.

Package manifests and ordinary imports own workspace, local, Git, and npm dependencies. `@ctxindex/profiles` is an ordinary library rather than a privileged or always-selected Extension.

### @ctxindex/cli and @ctxindex/core — composition entrypoints

```ts
export async function runCli(args: string[]): Promise<number>;

export async function bootstrapDatabase(): Promise<void>;

export async function loadExtensions(
  input: LoadExtensionsInput,
): Promise<LoadExtensionsResult>;
```

## Implementation doctrine

ctxindex is a Bun and TypeScript monorepo; Node is not a build target. Bun remains pinned through `packageManager` at 1.3.14. The distribution target is the CLI entrypoint compiled with `bun build --compile`; migration SQL is imported as text and bundled skills are embedded so relocated binaries retain both.

The CLI parses arguments, validates locally, routes stateful work through its private daemon client, formats output, and maps errors. It owns no provider HTTP, SQL, identity generation, or domain behavior; it composes core directly only for the allowlisted exceptions and the unsupported-platform route recorded in [cli-surface](../cli-surface/implementation.md). The daemon is the stateful composition root: it owns runtime startup and close, SQLite, the immutable registry, semantic application orchestration, safe DTO projection, request tracking, transport adapters, and shutdown.

`@ctxindex/rpc` owns the pure `daemonContract`, strict bounded schemas, the authoritative `rpcFailureRegistry`, schema-derived public types, the recursively derived `DaemonRpcApplication`, compatibility middleware, and `createDaemonRouter()`. It contains no business branches: each handler adapts one contract path to the matching nested application method and delegates once with the native request signal. No generic command tunnel exists. `@ctxindex/local-daemon` owns canonical identities, safe digests, discovery, endpoint resolution, and the injected `FileLeaseBackend`; platform modules implement retained ownership without changing application or RPC code. Core owns orchestration, persistence, the source-neutral `ctxindex.extensions` entry resolver, namespace/root and reachable-leaf collectors, conservative duplicate handling, complete-registry validation, and atomic activation. Providers own auth and OAuth App registration contracts; Profiles own provider-neutral validation and projections; Adapters own Provider access, transport, normalization, operations, and Actions; the SDK owns core-independent plain-value authoring contracts. `@ctxindex/official` distributes ctxindex-maintained Providers, OAuth Apps, Source Adapters, shared transports, documentation trees, and Extension roots without owning generic Adapter contracts. Extension roots only compose imported values and may declare one documentation sidecar, while package tooling owns dependencies. Core resolves sidecars before registry activation and excludes them from definition equivalence. Built-in, explicit-path, and Catalog origins enter the same collector and activation boundary.

The repository is pre-alpha. Implementation starts from the fresh schema and adds no prototype compatibility or data migration path.

## Verification

Use Bun's colocated unit/integration/e2e tests. Storage tests create fresh sandboxes; provider tests use loopback-only authorized HTTP. `scripts/verify/architecture-lint.ts`, package-dependency checks, the stale official-package-name check, SDK inference fixtures, common-origin activation tests, documentation resolver/projection tests, and relocated compiled-host and CLI tests enforce this shape. `tests/tooling/verify/rpc-contract-derivation.test.ts` proves every contract path appears in the application and client types, every failure derives from the registry, handlers delegate once with the native signal, and no tunnel or second signature list exists; package-dependency checks enforce the daemon dependency direction. Verification rejects stale current references to the superseded official-package coordinate, leaf documentation, reference/dependency/host-callback surfaces, providerless authorization fields, origin-specific registration, and pre-validation registry mutation.
