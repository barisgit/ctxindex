## Conditional Follow-up Targets

These are candidate canonical sidecars only if the prototype evaluation ends with a Human `promote` decision. This change does not create or update them. A `replace` decision creates no daemon-sidecar doctrine.

- `local-daemon` → `openspec/specs/local-daemon/implementation.md` (new sidecar)
- `module-architecture` → `openspec/specs/module-architecture/implementation.md`
- `cli-surface` → `openspec/specs/cli-surface/implementation.md`
- `error-taxonomy` → `openspec/specs/error-taxonomy/implementation.md`
- `generic-storage` → `openspec/specs/generic-storage/implementation.md`
- `extension-loading` → `openspec/specs/extension-loading/implementation.md`

The extracted sync application service remains prototype implementation detail in this change. A later `promote` follow-up may separately propose `sync-operations` doctrine if the evidence justifies it. The `core-model` backup delta needs no sidecar; its daemon-aware file-copy boundary is normative, and the intentionally absent canonical `core-model/implementation.md` remains absent.

## Module Ownership

### `local-daemon` and `module-architecture`

The prototype adds these workspace boundaries and dependency directions:

```text
@ctxindex/cli    ───┐
                    ├──> @ctxindex/rpc
@ctxindex/daemon ──┘          (oRPC procedure composition and wire contracts)
       │
       ├──> @ctxindex/local-daemon (canonical identity, discovery, leases)
       ├──> @ctxindex/core     (provider-neutral application/domain services)
       └──> @ctxindex/adapters (explicit built-in Extension composition)

@ctxindex/cli ──> @ctxindex/local-daemon (endpoint discovery and retained shared lease)
@ctxindex/cli ──> @ctxindex/core only for commands outside the prototype slice
@ctxindex/rpc -/-> storage, Adapters, CLI, daemon lifecycle, @ctxindex/local-daemon, or provider effects
@ctxindex/local-daemon -/-> RPC, core, Adapters, CLI formatting, or business services
@ctxindex/core -/-> @ctxindex/rpc, @ctxindex/daemon, or @ctxindex/cli
```

`@ctxindex/rpc` is a separate private contract-first composition package with zero business logic. It owns only a pure `@orpc/contract` contract with exact input and plain success output schemas; one authoritative failure registry containing exact strict bounded data schemas and constant messages; schema-derived types; protocol identity; a recursively contract-derived `DaemonRpcApplication` type; compatibility/cross-cutting middleware; the `implement(contract)` router factory; and exported contract/router/client types. A handler delegates exactly once to the corresponding nested injected method with oRPC's native request signal, validates the internal application result, returns its plain success value, or constructs the matching declared error directly from the registry-correlated failure kind. It owns no Source selection/iteration, retry policy, use-case orchestration, database access, Extension loading, provider calls, lifecycle files, Unix-socket code, CLI output, exit mapping, or inspection of core error classes.

`@ctxindex/local-daemon` is a separate private infrastructure package shared by daemon and CLI. It owns canonical config/data/state/cache and SQLite-path resolution, safe SHA-256 identity digests, short endpoint derivation, validated discovery metadata, and injected/acquired retained `FileLeaseBackend`/`FileLease` primitives. Lease state is established only by retained acquisition. It owns no RPC schema/router, oRPC/Bun HTTP adapter, database open/migrate/close, business logic, core service, provider access, Extension loading, application orchestration, CLI formatting, or numeric exit mapping.

`apps/daemon` is the Bun application composition root for daemon-backed behavior and implements `DaemonRpcApplication`. It owns startup ordering, the complete long-lived runtime, all daemon use-case orchestration, the Bun HTTP/Unix-socket server adapter, both leases, readiness, active-request tracking, shutdown coordination, calls into core business services, and projection from core public results/failures into exact RPC DTOs. Bun-specific serving and fetching APIs remain in application adapters, not in the router or core.

`packages/core` remains the owner of provider-neutral business behavior. The all/one-Source sync workflow formerly embedded in the CLI becomes a daemon-agnostic core application service. Existing Realm, Source, search, retrieval, relation/thread, sync, storage, auth, and provider services remain the daemon application's collaborators. None knows oRPC, sockets, process signals, CLI formats, or exit codes.

`apps/cli` owns the socket-aware Bun client adapter, protocol-aware daemon client facade, exact-tuple discovery selection, argument parsing and locally decidable validation, readable/JSON formatting, stderr diagnostics, signal-to-request cancellation, retained shared database-lease lifetime around every direct stateful path, and final numeric exits. It never exports the private RPC surface as an agent contract. Validated exact-tuple metadata or a test endpoint override selects RPC; once selected, failure is not a direct fallback. Without selection, a direct stateful path acquires shared ownership before SQLite open and holds it until after close; exclusive conflict fails `prototype_unsupported` with exit `50` without a time-of-check/time-of-use race.

### `extension-loading` and `generic-storage`

The daemon loads built-ins, explicit local paths, and exact installed Catalog provenance during startup, before readiness. Loading may use the existing builder-style `ExtensionRegistry.register()` internally, but the completed daemon runtime retains and injects only a read-only active-registry view. No request path receives a mutation method, invokes `loadExtensions()`, refreshes Catalog state, or observes configuration changes during the daemon lifetime.

The daemon opens and migrates SQLite once while composing its runtime and is the only exclusive production owner of the canonical SQLite path. It first holds a canonical-state-root lifecycle lease recording the full tuple and an exclusive database lease for that SQLite path. Runtime closure is idempotent and closes SQLite only after request admission has stopped and every active operation has settled; neither lease is released earlier.

## Interfaces and Data Flow

### `@ctxindex/rpc` exact composition boundary

Every object schema is strict. All strings are UTF-8; sizes are measured after UTF-8 encoding. Unless a smaller bound is stated, identifiers are 1–128 bytes, public codes 1–64 bytes, public messages 1–512 bytes, version/build strings 1–64 bytes, arrays contain at most 1,024 entries, counts are safe non-negative integers, and timestamps are RFC 3339 strings of at most 32 bytes. A digest is exactly 64 lowercase hexadecimal characters (SHA-256). Unknown keys, non-finite numbers, sparse arrays, and values beyond a bound are rejected rather than truncated.

```ts
export interface RpcProtocolIdentity {
  readonly id: 'ctxindex.local'
  readonly version: number // integer 1..65535
}

export interface RpcPresentedProtocolIdentity {
  readonly id: string // 1..64 UTF-8 bytes
  readonly version: number // integer 1..65535
}

export interface RpcRuntimeIdentity {
  readonly tupleDigest: string
  readonly configDigest: string
  readonly dataDigest: string
  readonly stateDigest: string
  readonly cacheDigest: string
  readonly databaseDigest: string
}

export interface RpcTransportContext { // server-only transport context, validated without a signal
  readonly requestId: string
  readonly clientProtocol: RpcPresentedProtocolIdentity
  readonly clientRuntime: RpcRuntimeIdentity
}

export interface RpcRequestContext extends RpcTransportContext { // application-only
  readonly signal: AbortSignal
}

export const rpcFailureRegistry = {
  // keys are the exact oRPC codes and failure `kind` values; each entry owns
  // its constant outer message and inline strict bounded data schema
}

export type RpcFailure =
  | { readonly kind: 'ctxindex'; readonly taxonomy: 'auth' | 'sync' | 'validation' | 'lookup' | 'other'; readonly code: string; readonly message: string; readonly retryAfterMs?: number }
  | { readonly kind: 'daemon_unavailable'; readonly code: 'daemon_unavailable'; readonly message: string }
  | { readonly kind: 'protocol_incompatible'; readonly code: 'protocol_incompatible'; readonly message: string; readonly clientProtocol: RpcPresentedProtocolIdentity; readonly daemonProtocol: RpcProtocolIdentity }
  | { readonly kind: 'runtime_identity_mismatch'; readonly code: 'runtime_identity_mismatch'; readonly message: string; readonly clientRuntime: RpcRuntimeIdentity; readonly daemonRuntime: RpcRuntimeIdentity }
  | { readonly kind: 'database_lease_conflict'; readonly code: 'database_lease_conflict'; readonly message: string; readonly databaseDigest: string }
  | { readonly kind: 'prototype_unsupported'; readonly code: 'prototype_unsupported'; readonly message: string; readonly command: string }
  | { readonly kind: 'shutdown_timeout'; readonly code: 'shutdown_timeout'; readonly message: string; readonly instanceId: string; readonly timeoutMs: number }
  | { readonly kind: 'cancelled'; readonly code: 'cancelled'; readonly message: string }
  | { readonly kind: 'result_too_large'; readonly code: 'result_too_large'; readonly message: string }

export type RpcResult<T> = // internal application boundary only; never serialized
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: RpcFailure }

export interface RpcHealthInput {}
export interface RpcHealthResult {
  readonly protocol: RpcProtocolIdentity
  readonly runtime: RpcRuntimeIdentity
  readonly daemonVersion: string
  readonly buildVersion: string
  readonly instanceId: string
  readonly pid: number // integer 1..2147483647
  readonly startedAt: string
  readonly lifecycle: 'starting' | 'ready' | 'stopping'
  readonly ready: boolean
  readonly extensionDiagnosticsCount: number // 0..1000000
  readonly activeRequestCount: number // 0..1000000
}

export interface RpcSyncInput {
  readonly source?: string
  readonly mode: 'sync' | 'resync' | 'diff'
}
export interface RpcWarning { readonly code: string; readonly message: string; readonly ref?: string }
export interface RpcSourceWarning extends RpcWarning { readonly sourceId: string }
export interface RpcSyncRun {
  readonly runId: string
  readonly mode: 'sync' | 'resync' | 'diff'
  readonly status: 'completed'
  readonly added: number
  readonly updated: number
  readonly deleted: number
  readonly warningsCount: number
  readonly errorsCount: number
  readonly lastWarning: RpcWarning | null
  readonly warnings: readonly RpcWarning[] // max 256
}
export interface RpcSourceFailure {
  readonly code: string
  readonly message: string
}
export interface RpcSyncFailureDiagnostics {
  readonly warningsCount: number
  readonly lastWarning: RpcWarning | null
  readonly errorsCount: 1
  readonly lastError: string
}
export type RpcSourceSyncResult =
  | { readonly sourceId: string; readonly status: 'completed'; readonly run: RpcSyncRun }
  | { readonly sourceId: string; readonly status: 'failed'; readonly failure: RpcSourceFailure; readonly diagnostics: RpcSyncFailureDiagnostics }
export interface RpcSyncResult {
  readonly mode: 'sync' | 'resync' | 'diff'
  readonly results: readonly RpcSourceSyncResult[] // max 1024
  readonly warnings: readonly RpcSourceWarning[] // max 256
}

export type RpcJsonCursor = null | boolean | number | string | readonly RpcJsonCursor[] | { readonly [key: string]: RpcJsonCursor }
export interface RpcStatusInput { readonly source?: string }
export interface RpcStatusRow {
  readonly sourceId: string
  readonly adapterId: string
  readonly realmSlug: string
  readonly availability: 'available' | 'extension_unavailable'
  readonly lastStatus: string
  readonly lastRunAt: number | null
  readonly warningsCount: number
  readonly lastWarning: RpcWarning | null
  readonly errorsCount: number
  readonly lastError: string | null
  readonly cursor: RpcJsonCursor
}
export interface RpcStatusResult { readonly rows: readonly RpcStatusRow[] } // max 1024

export interface RpcRealmAddInput { readonly slug: string; readonly displayName?: string }
export interface RpcRealmAddResult { readonly realmId: string }
export interface RpcRealmListInput {}
export interface RpcRealmRow {
  readonly id: string
  readonly slug: string
  readonly label: string | null
  readonly created_at: number
}
export interface RpcRealmListResult { readonly rows: readonly RpcRealmRow[] } // max 1024

export interface RpcSourceConfigOption {
  readonly property: string
  readonly flag: string
  readonly type: string
  readonly required: boolean
  readonly docs?: string
  readonly default?: RpcJsonCursor
}
export interface RpcSourceDefinition {
  readonly id: string
  readonly version: number // integer 1..65535
  readonly configOptions: readonly RpcSourceConfigOption[] // max 256
}
export interface RpcSourceDefinitionsInput {}
export interface RpcSourceDefinitionsResult { readonly rows: readonly RpcSourceDefinition[] } // max 1024
export interface RpcSourceAddInput {
  readonly adapterId: string
  readonly realmSlug?: string
  readonly label?: string
  readonly configJson?: string
  readonly account?: string
  readonly searchRouting?: 'indexed' | 'federated' | 'hybrid'
  readonly syncEnabled?: boolean
}
export interface RpcSourceAddResult { readonly sourceId: string; readonly realmId: string }
export interface RpcSourceListInput { readonly realmSlug?: string }
export interface RpcSourceRow {
  readonly id: string
  readonly realm_id: string
  readonly realm_slug?: string
  readonly adapter_id: string
  readonly label: string
  readonly config_json: string | null
  readonly sync_enabled: boolean
  readonly search_routing?: 'indexed' | 'federated' | 'hybrid' | null
  readonly grant_id?: string | null
  readonly created_at: number
  readonly availability: 'available' | 'extension_unavailable'
  readonly last_status?: string | null
  readonly last_run_at?: number | null
  readonly warnings_count?: number | null
  readonly last_warning?: RpcWarning | null
  readonly errors_count?: number | null
  readonly last_error?: string | null
  readonly items_count?: number
  readonly chunks_count?: number
  readonly sample_uri?: string | null
  readonly account_email?: string | null
}
export interface RpcSourceListResult { readonly rows: readonly RpcSourceRow[] } // max 1024
export interface RpcSourceRemoveInput { readonly source: string }
export interface RpcSourceRemoveResult { readonly sourceId: string }

export interface RpcSearchField { readonly name: string; readonly value: string }
export interface RpcSearchInput {
  readonly text?: string
  readonly realms?: readonly string[]
  readonly sourceIds?: readonly string[]
  readonly adapterId?: string
  readonly kind?: string
  readonly fields?: readonly RpcSearchField[]
  readonly since?: number
  readonly until?: number
  readonly limit?: number
  readonly offset?: number
  readonly includeDeleted?: boolean
  readonly explain?: boolean
  readonly localOnly?: boolean
  readonly remote?: boolean
}
export interface RpcSearchChunk { readonly index: number; readonly snippet: string }
export interface RpcSearchRow {
  readonly ref: string
  readonly profile: { readonly id: string; readonly version: number }
  readonly sourceId: string
  readonly origin: 'local' | 'provider'
  readonly originRank: number
  readonly title: string | null
  readonly summary: string | null
  readonly occurredAt: number | null
  readonly deletedAt?: number
  readonly chunks: readonly RpcSearchChunk[] // max 256 per search row
}
export interface RpcSearchWarning { readonly sourceId: string; readonly code: string; readonly message: string }
export interface RpcSearchExplainSource {
  readonly sourceId: string
  readonly routing: 'indexed' | 'federated' | 'hybrid'
  readonly decidedBy: 'cli' | 'source' | 'adapter' | 'unavailable'
  readonly legs: readonly ('local' | 'remote')[]
  readonly outcome: 'success' | 'degraded' | 'unsupported' | 'extension_unavailable'
  readonly coverage: 'local' | 'remote' | 'local+remote'
}
export interface RpcSearchResult {
  readonly results: readonly RpcSearchRow[]
  readonly warnings: readonly RpcSearchWarning[]
  readonly pagination?: { readonly offset: number; readonly limit: number; readonly hasMore: boolean }
  readonly explain?: { readonly sources: readonly RpcSearchExplainSource[] }
}

export type RpcSafeJson =
  | null | boolean | number | string
  | readonly RpcSafeJson[]
  | { readonly [key: string]: RpcSafeJson }
export interface RpcResource {
  readonly ref: string
  readonly sourceId: string
  readonly realmId: string
  readonly profile: { readonly id: string; readonly version: number }
  readonly origin: 'synced' | 'adhoc'
  readonly title: string | null
  readonly summary: string | null
  readonly occurredAt: number | null
  readonly providerUpdatedAt: number | null
  readonly deletedAt: number | null
  readonly hydratedAt: number | null
  readonly payload: RpcSafeJson | null
  readonly createdAt: number
  readonly updatedAt: number
}
export type RpcStoredResource = RpcResource & { readonly id: string }
export interface RpcResourceWarning { readonly code: string; readonly message: string; readonly ref: string }
export interface RpcResourceGetInput { readonly ref: string }
export interface RpcResourceGetResult {
  readonly resource: RpcStoredResource
  readonly warnings: readonly RpcResourceWarning[]
}

export interface RpcThreadNode {
  readonly resource: RpcResource
  readonly children: readonly RpcThreadNode[]
}
export interface RpcThreadWarning {
  readonly code: 'unknown_profile_version'
  readonly profileId: string
  readonly profileVersion: number
}
export interface RpcThreadGetInput { readonly ref: string }
export interface RpcThreadGetResult {
  readonly mode: 'tree' | 'flat'
  readonly messages: readonly RpcThreadNode[]
  readonly warnings: readonly RpcThreadWarning[]
}

export interface RpcShutdownInput {}
export interface RpcShutdownAccepted {
  readonly status: 'accepted'
  readonly instanceId: string
  readonly acceptedAt: string
  readonly alreadyStopping: boolean
  readonly observationTimeoutMs: number // integer 1..60000
}

export type DaemonRpcApplication = ContractApplication<
  DaemonContract,
  InferContractRouterInputs<DaemonContract>,
  InferContractRouterOutputs<DaemonContract>
>

export interface DaemonRouterExpectations {
  readonly protocol: RpcProtocolIdentity
  readonly runtime: RpcRuntimeIdentity
}
export function createDaemonRouter(application: DaemonRpcApplication, expectations: DaemonRouterExpectations): DaemonRouter
export const daemonContract: { /* exact procedure tree from this section */ }
export type DaemonContract = typeof daemonContract
export type DaemonRouter = ReturnType<typeof createDaemonRouter>
export type DaemonClient = ContractRouterClient<DaemonContract>
```

The router exposes exactly `system.health`, `system.shutdown`, `realm.add`, `realm.list`, `source.definitions`, `source.add`, `source.list`, `source.remove`, `sync.run`, `status.get`, `search.query`, `resource.get`, and `thread.get`. There is no generic command-execution procedure.

`RpcWarning.ref`, status/source long diagnostic fields, option docs, titles, summaries, and sync-diagnostic `lastError` are at most 2,048 bytes. Source configuration JSON is at most 65,536 bytes, a Source sample URI at most 8,192 bytes, search text at most 16,384 bytes, a search field value at most 4,096 bytes, and a chunk snippet at most 8,192 bytes. Exact Resource and thread inputs accept only the bounded canonical `ctx://<26-character-ULID>/<encoded-resource-key>` grammar and are at most 16,417 bytes. Search accepts at most 1,024 Realm or Source filters, 256 field filters, a result limit of 1..1,024, a non-negative safe-integer offset, safe-integer time bounds, and the cross-field validity rules encoded by `RpcSearchInput`: it requires text or a filter; forbids simultaneous `localOnly`/`remote`; requires text for remote-only search; permits offset with text only in local-only mode; requires `kind` for field filters; and requires `since <= until`.

`RpcJsonCursor` and Source option defaults permit at most 16 KiB serialized JSON, depth 8, 2,048 total values, 256 entries per object/array, object keys of 1–128 bytes, and strings of at most 4,096 bytes. Cursor numbers are finite safe integers; option defaults may use any finite number. Resource `RpcSafeJson` permits only null, booleans, finite numbers, well-formed strings up to 65,536 bytes, plain objects with well-formed keys of 1–256 bytes, and dense arrays. Its maximums are depth 16, 1,024 entries per object/array, 16,384 total values, and 256 KiB serialized JSON. Resource warnings, search warnings, and thread warnings contain at most 256 entries. Search results, Realm/Source rows, Source definitions, and top-level/thread child arrays contain at most 1,024 entries; each search row's `chunks` array is the explicit smaller exception and contains at most 256 entries. A complete thread contains at most 1,024 nodes, depth 64, and 1 MiB serialized JSON. Search explain legs contain at most two entries. Values beyond these closed bounds become `result_too_large` at the daemon projection boundary and are never truncated.

`lastRunAt` and other count fields are non-negative safe integers or their declared nullable form. Search occurrence/provider timestamps are signed safe integers. Adapter/Profile versions are integers 1..65,535. `retryAfterMs` and `shutdown_timeout.timeoutMs` are integers from 0 through 60,000.

`RpcFailure` is the only declared error data payload. One readonly registry entry per failure kind owns the oRPC code (the kind itself), constant safe outer message, and exact strict bounded data schema. The oRPC declaration map, discriminated `RpcFailure` schema/union, router error constructor lookup, and CLI code/data validation derive from those entries; there is no uppercase alias map or handwritten failure-kind switch. Small one-use failure schemas remain inline in the registry. Per-Source sync failures use the separately reused `RpcSourceFailure`; neither failure type can contain `Error`, `cause`, `stack`, a raw diagnostics object, socket/config/data/state/cache/SQLite paths, OS errors, raw SQLite/provider bodies, secrets, tokens, or Extension paths. Unknown application throws, malformed/unsafe internal results, and throwing accessors become one generic safe declared `ctxindex` internal failure. An otherwise valid application result that cannot be projected within a search, Resource, or thread bound becomes the declared `result_too_large` error rather than being truncated. Each handler delegates exactly once with a `RpcRequestContext` composed from the validated transport context and native oRPC signal, validates the internal `RpcResult`, returns only its plain success value, or throws the registry-selected declared typed error. Compatibility middleware uses only `DaemonRouterExpectations`; it never calls an application method and therefore cannot create hidden delegation.

The application tree is recursively derived from `daemonContract` plus `InferContractRouterInputs` and `InferContractRouterOutputs`. Contract groups remain nested, while every procedure leaf becomes `(input, context: RpcRequestContext) => Promise<RpcResult<output>>`. This is the only application signature source: adding or changing a contract procedure causes a type error until the daemon provides the corresponding exact implementation.

The daemon transport adapter parses and validates client protocol/runtime metadata and combines it with the HTTP request id into server-only `RpcTransportContext`; it neither carries nor validates an `AbortSignal`. Compatibility middleware compares the typed client identities with immutable router expectations before every business procedure; an incompatible request cannot reach its application method. The implementation handler obtains oRPC's native `signal` and forwards that exact object to the application, using a safe non-aborted signal only for signal-less in-process invocations. The CLI adapter builds the oRPC client over Bun's Unix-socket `fetch` support and attaches metadata plus caller signal. Neither transport adapter is exported by `@ctxindex/rpc`.

### Core sync application service

The extracted service preserves deterministic Source selection and per-Source orchestration independently of the caller:

```ts
export interface RunSyncInput {
  readonly source?: string
  readonly mode: SyncMode
  readonly signal: AbortSignal
}

export type SourceSyncResult =
  | {
      readonly sourceId: string
      readonly status: 'completed'
      readonly run: SyncRunResult
    }
  | {
      readonly sourceId: string
      readonly status: 'failed'
      readonly error: CtxindexError
      readonly diagnostics: SyncRunFailureDiagnostics
    }

export interface RunSyncResult {
  readonly mode: SyncMode
  readonly results: readonly SourceSyncResult[]
  readonly warnings: readonly SourceSyncWarning[]
}

export interface SyncApplicationService {
  run(input: RunSyncInput): Promise<RunSyncResult>
}
```

The core service resolves a requested Source label or id, rejects an absent or disabled target before provider work, selects sync-capable enabled Sources for an all-Source request, sorts deterministically, calls `syncSource` sequentially with the same signal, and retains typed failures plus bounded run diagnostics. It does not construct public CLI text, event lines, JSON, transport failures, or numeric exits. The daemon application maps its transport DTO at the edge; without a selected daemon, the direct CLI path can invoke the same service behind the shared-lease fence.

Realm add/list and Source add/list/remove remain core service operations. `source.definitions` projects only the daemon's immutable active-registry Adapter/config-option view, so a selected client cannot validate Source input against a separately loaded CLI registry. Search, exact get, and local thread traversal delegate to their existing core/provider-neutral services. Status remains a core `SourceService` query. The daemon application performs selection, orchestration, error classification, and bounded DTO projection; the router only validates and delegates. Health and shutdown are daemon lifecycle operations, not core business services.

### CLI client and cancellation boundary

The CLI parses Realm add/list, Source add/list/remove, sync, status, search, exact get, local thread traversal, health, and shutdown argv before constructing a daemon client; Source add obtains only the immutable daemon `source.definitions` projection needed for generated option parsing. The client facade consumes plain contract outputs. It catches only declared oRPC errors whose code/data pair validates against the exact contract failure variant and constructs `DaemonCliError` from that bounded data; unknown link/protocol exceptions become daemon-unavailable. Existing formatters never receive a transport envelope. Only the final CLI boundary adds numeric exits: invalid local input `2`; daemon unavailable, protocol/runtime mismatch, database lease conflict, prototype-unsupported, result-too-large, or shutdown timeout `50`; cancellation `130`; and existing ctxindex code mappings unchanged.

For every migrated command, validated lifecycle/discovery metadata for the exact canonical tuple or a test endpoint override selects daemon routing. Once selected, stale metadata, an unreachable endpoint, or a lost connection returns `daemon_unavailable`; none falls back or opens SQLite in the client. Without selection, commands that retain a direct implementation use it behind the shared-lease fence. Before any direct stateful path constructs dependencies, the CLI uses `@ctxindex/local-daemon` to acquire a shared lease for its canonical SQLite path. Exclusive conflict returns `prototype_unsupported` before open even when state roots differ. The CLI retains the shared lease across runtime composition and SQLite use and releases it only after database close.

For an in-flight command, SIGINT aborts the CLI request controller. The socket fetch signal becomes oRPC's native server handler signal, and the router forwards that exact `AbortSignal` in the application-only `RpcRequestContext` to each corresponding application method. The daemon passes it to Realm, Source, sync, search, retrieval, or thread orchestration as applicable; sync continues through `SyncApplicationService`, `syncSource`, `SyncCoordinator`, provider context, and the Adapter. A late success after the request is aborted is discarded at the client boundary. Cancellation of one request never uses the daemon-wide shutdown controller.

The daemon tracks active business requests as request-id/controller entries only to support shutdown and observability. Normal request cancellation removes its own entry after core cleanup. Shutdown switches admission to `stopping`, aborts the remaining request controllers, and awaits settlement for the observation deadline. If Bun/oRPC disconnect propagation fails the compiled cancellation gate, the same facade gains an explicit operation id plus typed cancel procedure; cancellation must not be claimed until that gate proves core observed it.

Shutdown uses two-phase client observation. The typed request returns `RpcShutdownAccepted` tied to the responding `instanceId`; the daemon stops admission and cancels/drains. Only after every request settles does it close SQLite, stop the listener, and release its matching database and lifecycle leases. The CLI reports complete only after polling proves release of that exact instance and both leases. If the deadline expires first, the CLI returns `shutdown_timeout`; the daemon remains `stopping` and non-admitting and retains SQLite plus both leases until settlement or explicit operator force-termination. It never reports complete merely because the timeout elapsed. Concurrent requests share the same shutdown state.

## Storage and State

`@ctxindex/local-daemon` exposes only the retained lease seam; callers own acquisition order and database lifetime:

```ts
export type FileLeaseMode = 'shared' | 'exclusive'
export interface FileLeaseRequest {
  readonly canonicalTarget: string
  readonly purpose: 'lifecycle' | 'database'
  readonly mode: FileLeaseMode
}
export interface FileLease {
  readonly mode: FileLeaseMode
  readonly targetDigest: string
  release(): void
}
export interface FileLeaseBackend {
  acquire(input: FileLeaseRequest): FileLease
}
```

The Darwin backend maps exclusive/shared to `node:fs` `O_EXLOCK`/`O_SHLOCK`, always with `O_NONBLOCK`, on permanent private lock files. Database locking uses `<canonical-sqlite>.owner.lock` mode `0600`; lifecycle uses an equivalent permanent file beneath canonical state. Before acquisition it rejects symlinks, non-regular files, wrong uid, and non-private mode. It never unlinks a lock file. Unsupported platforms/filesystems fail closed. The daemon retains exclusive database ownership from before open until after close and endpoint cleanup; a direct stateful CLI retains shared ownership from before open until after close. Kernel process death releases either lock immediately.

The canonical core path resolver remains the source of effective config, data, state, and cache roots. `@ctxindex/local-daemon` canonicalizes all four paths after overrides by resolving symlinks/aliases and the longest existing ancestor before appending a missing suffix. It derives the canonical SQLite path from the canonical data root and applies the same resolution. Runtime identity binds the ordered four-path tuple; safe SHA-256 digests identify each member, the tuple, and SQLite. Raw paths never enter health or RPC payloads. Lifecycle/discovery metadata is stored beneath the canonical state root and records only bounded non-secret protocol, safe digests, instance id, pid, time, lifecycle state, and a validated endpoint token.

The Unix socket itself does not live beneath the state root. `@ctxindex/local-daemon` derives its fixed bounded basename from the canonical tuple digest and places it in a short per-user private runtime directory. The runtime directory and endpoint are owner-only and cannot be selected by untrusted metadata. Tests may inject a short private runtime root; clients and daemon call the same resolver.

Startup acquires an exclusive lifecycle lease keyed by canonical state root/digest and recording the full tuple, then an exclusive database lease keyed by canonical SQLite path/digest, before database open and socket bind. Same state with different data/config/cache is `runtime_identity_mismatch`; different state with the same data cannot acquire the database lease. Database conflict reporting is holder-neutral and never attributes the lock to a runtime tuple because a separate lease-file read cannot be bound to the retained kernel-lock holder. A contender validates discovery metadata and both held leases. Metadata, pid, socket, lease-file contents, or an unheld lock file alone is not proof of a live daemon. Cleanup compares instance id and held lease identity before removing metadata/socket or releasing leases.

Readiness is an explicit monotonic lifecycle state. The daemon publishes `ready` only after both leases, private endpoint preparation and bind, config/installed-provenance reads, one complete Extension load, database open/migrations, and complete application composition. Startup failure closes all acquired resources and invalidates only its matching owned state. No business procedure is admitted before `ready`; health may report startup/stopping state without touching business services.

The active Extension registry, application services, database handle, logger, and configuration snapshot are immutable references for one daemon lifetime. Catalog/config/Extension-file changes require restart. No queue or durable job state is introduced; active-request bookkeeping is process memory only.

The baseline file-copy backup boundary is application-level: stop active sync clients, request shutdown, and wait until the database handle plus both matching leases are released before copying SQLite and the file secret store. Endpoint disappearance or shutdown timeout is not sufficient evidence for backup.

## Security and Compatibility

The protocol is local-only over a Unix-domain socket in an owner-only runtime directory; the daemon does not bind TCP. The state-root lifecycle directory is owner-only and contains no credentials. Socket location, instance metadata, and stale cleanup are resolved and validated rather than trusted from arbitrary files. Logs may retain internal causes under existing redaction rules, but RPC and CLI public diagnostics never expose them.

The client supplies explicit protocol id/version on every request. Compatibility is exact for the prototype, and protocol mismatch is reported before business delegation with both bounded public identities. The protocol is private, released by neither the CLI help contract nor a public package, and creates no cross-version compatibility promise. CLI output and stable exits remain the agent-facing compatibility boundary.

Daemon startup performs no Extension or Catalog network acquisition. Provider egress remains reachable only through core provider contexts and loaded Adapters, with existing host allowlists, auth, secret, and cancellation boundaries. `@ctxindex/rpc` and lifecycle code issue no provider request.

The prototype remains Bun 1.3.14-only. Bun-specific HTTP serving/fetching and signal handling are adapters in `apps/daemon` and `apps/cli`; core application services, DTO semantics, and router composition contain no Bun API. No Node compatibility shim, background queue, service manager, autostart, remote authentication, TCP fallback, or schema migration is added.

## Verification

Focused `@ctxindex/rpc` tests prove every stated field/count/depth/size bound, protocol/runtime middleware before delegation, no hidden health call, exactly-once delegation for every procedure, result validation, request-signal identity, inferred client types, and rejection of `Error`, stacks, causes, raw diagnostics, backend/provider bodies, secret canaries, paths, malformed Refs, and oversized metadata/payloads.

Core tests drive `SyncApplicationService` with injected lower services and cover label/id resolution, disabled and missing targets, capability filtering, deterministic ordering, partial failures, preserved diagnostics, and cancellation reaching `syncSource` without any RPC or CLI dependency. Existing coordinator, Source service, and Adapter cancellation tests remain gates.

`@ctxindex/local-daemon` and daemon tests cover symlink/alias canonicalization of all four roots and SQLite, digest determinism and endpoint bounds, owner-only directories, explicit override parity, same-state/different-data mismatch, different-state/same-data exclusion, both leases and stale recovery, readiness ordering, immutable registry reuse, Realm/Source/search/get/thread service delegation and safe projection, typed `result_too_large`, request cancellation, owner-token cleanup, timeout lease retention, eventual settlement, force-termination recovery, and startup rollback.

Compiled multi-process tests use isolated config/data/state/cache roots, readiness polling rather than sleeps, and spawned foreground daemons. They prove:

- deep worktree state paths still produce a valid short macOS Unix socket;
- concurrent starts yield one owner; truly distinct tuples/databases run independently; shared database paths cannot double-own;
- health reports only safe identity digests plus instance/protocol, and protocol/runtime mismatches execute no business method;
- separate CLI processes perform Realm and Source setup, sync, search, exact get, local thread traversal, and status through one daemon-owned database and one registry load;
- a missing daemon or lost connection produces no migrated-command database fallback; every unconverted stateful command fails `prototype_unsupported` before open while the database lease is held and remains direct only without that lease;
- SIGINT during a real sync exits `130`, records cancellation, leaves no partial transaction, and keeps the daemon healthy;
- shutdown rejects new work and cancels active work; a non-cooperative request returns timeout while the daemon retains SQLite and both leases, and only eventual settlement or explicit force-termination permits restart/backup;
- wire/public output contains no transport envelope, raw socket error, internal path, stack, provider body, or secret canary.

Architecture and package tests enforce the dependency graph, direct `@orpc/contract` ownership, pure-contract separation from handlers, `implement(contract)` composition, no `RpcResult` wire outputs, no handwritten application signature list/error alias map/failure-kind switch, forbid Bun transport APIs in `@ctxindex/rpc` and core, forbid storage/provider/formatting imports in the router, forbid database opening in daemon-routed CLI modules, and keep the CLI as the sole agent-facing surface. Focused tests cover registry schema/code correlation, exact recursive application-path inference, declared error inference/round-trip for every failure variant, throwing-accessor and generic bounded internal replacement, native signal identity, and client declared-error versus unknown-transport mapping. Final verification includes focused package typechecks/tests, the compiled Extension gate under Bun 1.3.14, `bun run ci`, and `bunx openspec validate --all --strict`.

Request batching for a possible authenticated remote daemon and OpenAPI/external SDK generation for a future public protocol are separate follow-up changes. The pure contract makes them technically possible, but this prototype enables neither and establishes no remote authentication, batching/idempotency, public compatibility, exposure, or SDK release contract.

## Evaluation and Human Checkpoint

The prototype ends with a checked-in evaluation report containing measured strengths, failures, unsupported stateful commands, cancellation/shutdown evidence, security limitations, and a recommendation. Implementation pauses at a Human checkpoint where the user chooses exactly one direction:

- `promote`: create a separate follow-up OpenSpec change proposing the applicable canonical sidecar updates and full migration work. No sidecar is changed by this prototype.
- `replace`: create a separate follow-up for removal/replacement and retain only independently justified core extraction. No daemon doctrine is promoted.
