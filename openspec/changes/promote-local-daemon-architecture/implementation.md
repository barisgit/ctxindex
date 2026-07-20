## Capability Implementation Targets

- `local-daemon` → `openspec/specs/local-daemon/implementation.md` (new)
- `module-architecture` → `openspec/specs/module-architecture/implementation.md`
- `cli-surface` → `openspec/specs/cli-surface/implementation.md`
- `error-taxonomy` → `openspec/specs/error-taxonomy/implementation.md`
- `generic-storage` → `openspec/specs/generic-storage/implementation.md`
- `extension-loading` → `openspec/specs/extension-loading/implementation.md`
- `oauth-client-management` → `openspec/specs/oauth-client-management/implementation.md`
- `account-grant-management` → `openspec/specs/account-grant-management/implementation.md`
- `secret-backend-operations` → `openspec/specs/secret-backend-operations/implementation.md`
- `retrieval-and-artifacts` → `openspec/specs/retrieval-and-artifacts/implementation.md`
- `extension-catalogs` → `openspec/specs/extension-catalogs/implementation.md`
- `provider-actions` → `openspec/specs/provider-actions/implementation.md`

## Module Ownership

The promoted dependency direction remains:

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
```

`@ctxindex/rpc` owns the pure `daemonContract`, strict bounded schemas, the authoritative `rpcFailureRegistry`, schema-derived public types, recursively contract-derived `DaemonRpcApplication`, compatibility middleware, and `createDaemonRouter()`. It contains no business branches. Each explicit handler is only an adaptation from one contract path to the matching nested application method and delegates once with the native request signal.

`@ctxindex/local-daemon` owns canonical config/data/state/cache and SQLite identities, safe digests, discovery metadata, endpoint resolution, and the injected `FileLeaseBackend`/retained `FileLease` abstraction. Platform modules implement the retained ownership primitive without changing application or RPC code.

`apps/daemon` remains the Bun composition root. It owns runtime startup/close, SQLite, the immutable registry, semantic application orchestration, safe DTO projection, request admission/tracking, transport adapters, and shutdown. Core application services own provider-neutral workflows; Source Adapters own provider I/O.

`apps/cli` owns parsing and locally decidable validation, explicit browser/loopback interaction, the private daemon-client facade, cancellation wiring, byte-transfer client adaptation, readable/JSON formatting, stderr diagnostics, and final exits. It never imports the daemon application or exposes the RPC contract as a public agent API.

## Interfaces and Data Flow

`daemonContract`, `rpcFailureRegistry`, `RpcResult<T>`, `RpcRequestContext`, and `DaemonRpcApplication` retain the exact contract-derived relationships established by the prototype. All object schemas remain strict and bounded; success values are plain, errors use declared oRPC data with constant outer messages, and hostile unknown transport values normalize to daemon-unavailable.

Remaining stateful families extend the contract with semantic groups rather than one command tunnel:

```ts
interface PromotedDaemonApplication {
  readonly oauthApps: OAuthAppApplication
  readonly accounts: AccountGrantApplication
  readonly secrets: SecretBackendApplication
  readonly artifacts: ArtifactApplication
  readonly exports: ExportApplication
  readonly actions: ActionApplication
  readonly purge: PurgeApplication
  readonly extensions: InstalledExtensionApplication
}
```

The actual injected type remains recursively inferred from `daemonContract`; this conceptual grouping names core service ownership, not a second handwritten RPC interface. Each service returns provider-neutral results/failures that the daemon projects into bounded transport values.

OAuth App environment import uses one explicitly named sensitive contract input whose fields derive from the selected Provider declaration and remain bounded. The CLI reads those values once, the router validates and delegates once, and the daemon writes them directly through the existing secret application service. The input is excluded from all middleware/logging/tracing hooks, never appears in success or failure data, is never automatically retried, and has no persistent staging record.

OAuth authorization is staged. A daemon procedure prepares bounded authorization metadata and state; after explicit operator consent the CLI owns browser launch and loopback receipt; the daemon validates the returned state/code and performs provider exchange, identity resolution, serialization, and persistence. The stage token is opaque, short-lived, one-use, owner-private, and contains no token or App secret.

Artifact download and export metadata remain unary contract procedures. Bytes flow through a local owner-private transfer adapter with an opaque bounded ticket, cancellation, expected maximum size, atomic destination handling, and deterministic expiry/cleanup. RPC results expose neither cache/provider paths nor byte arrays. The selected transfer mechanism is proven in a focused spike before its DTO is made canonical.

Installed-Extension activation uses one staged complete registry candidate. The daemon application either atomically activates it at a defined restart boundary or returns bounded restart-required guidance; request handlers never mutate the active registry in place.

## Storage and State

The daemon acquires lifecycle identity and exclusive canonical database ownership before runtime composition, opens/migrates SQLite once, and releases ownership only after admission stops, active work settles, and SQLite closes. Any allowlisted direct database opener uses the same `FileLeaseBackend` with retained shared ownership over open/use/close. Unsupported platform backends fail before open.

The active Extension registry is staged once and immutable for the daemon lifetime. Persisted Extension paths are resolved against a recorded configuration origin and normalized before validation/activation so the daemon working directory is irrelevant.

Authorization stage state and byte-transfer tickets are ephemeral daemon-owned state with bounded lifetime and deterministic shutdown cleanup. Durable Account, Grant, secret, Artifact-cache, installed-provenance, and Action results continue to use their existing core stores; RPC introduces no provider-specific tables or domain schema.

## Security and Compatibility

The transport remains local-only and owner-private. No TCP listener, remote protocol, public SDK, batching, or OpenAPI surface is enabled. Exact protocol compatibility is private and requires matching client/daemon versions; the CLI remains the stable integration contract.

RPC results, errors, middleware, traces, and logs exclude tokens, OAuth App secrets, provider payloads, raw roots/paths, backend errors, stacks, causes, environment contents, and unbounded diagnostics. The sole exception is the dedicated bounded write-only OAuth App configuration input over the owner-private local socket; it is validated, delegated once, consumed directly, never reflected, and never automatically retried. Provider egress remains through existing allowlisted Adapter/provider-neutral services. Byte transfer and OAuth stages require opaque one-use tickets and cannot broaden provider permissions.

Darwin retains its proven `O_SHLOCK`/`O_EXLOCK | O_NONBLOCK` backend. Linux/Windows modules are advertised only after matching retained-ownership and compiled multi-process gates. A missing or unsafe backend fails closed.

Pre-alpha path normalization may atomically rewrite validated configuration. No released storage or private-protocol compatibility promise is introduced.

## Verification

- Contract derivation tests prove every path appears in the application/client types, every failure derives from the registry, handlers delegate once, native signals retain identity, and no generic command tunnel exists.
- Architecture/package gates preserve dependency direction and the business-free RPC/lifecycle packages.
- Focused application and CLI parity tests cover each migrated command family, locally invalid zero-side-effect behavior, stale selected-daemon no-fallback, cancellation, safe DTO bounds, and stable output/exits.
- Security tests inject secret/provider/path/stack canaries through the sensitive input, failures, middleware hooks, and hostile transport objects; they prove the input is consumed once and no canary crosses into results, diagnostics, errors, traces, logs, retry state, or persistent staging.
- Compiled multi-process journeys exercise the complete stateful inventory, immutable registry, OAuth staging with loopback mocks, local byte transfer, activation/restart boundaries, shutdown, crash recovery, and retained ownership without fixed sleeps or live provider access.
- Each advertised platform runs alias convergence, shared/exclusive contention, wrong-owner/mode/symlink rejection, SIGKILL release, and immediate reacquisition gates.
- Final gates are `bun run ci`, `bunx openspec validate --all --strict`, cartography/system-reference refresh, independent review, and a private live Human acceptance checkpoint before daemon ownership becomes default.

## Promotion Notes

- Create `openspec/specs/local-daemon/implementation.md` from the accepted contract-first lifecycle, ownership, cancellation, shutdown, platform-backend, and immutable-runtime doctrine.
- Merge the pure contract, one failure registry, recursively derived application shape, exactly-once router, daemon composition root, shared lifecycle package, and dependency direction into `module-architecture/implementation.md`.
- Merge daemon selection/no-fallback, semantic stateful routing, explicit safe-exception allowlist, CLI-owned interaction/formatting/exits, and local byte-transfer client ownership into `cli-surface/implementation.md`.
- Merge bounded declared transport failure projection and removal of prototype-only classification into `error-taxonomy/implementation.md`.
- Merge canonical cross-platform retained ownership and daemon open/close lifetime into `generic-storage/implementation.md`.
- Merge launch-directory-independent path persistence, staged complete activation, and immutable daemon registry lifetime into `extension-loading/implementation.md`.
- Merge each daemon-owned application boundary and its secret/byte/provider safety constraints into the existing `oauth-client-management`, `account-grant-management`, `secret-backend-operations`, `retrieval-and-artifacts`, `extension-catalogs`, and `provider-actions` implementation sidecars.
