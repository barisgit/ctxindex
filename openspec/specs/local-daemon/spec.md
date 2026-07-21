# local-daemon Specification

## Purpose
TBD - created by archiving change prototype-local-daemon-orpc. Update Purpose after archive.
## Requirements
### Requirement: Local daemon process boundary
ctxindex SHALL serve daemon-backed operations through a local-only daemon associated with one canonical config/data/state/cache runtime tuple and canonical SQLite path. A ready daemon MUST own that composed application runtime and database, and local clients MUST invoke migrated daemon-backed behavior through it rather than composing another production runtime. The daemon endpoint MUST NOT be exposed to non-local peers.

#### Scenario: Local client reaches the composed runtime
- **WHEN** a client invokes a daemon-backed operation for an effective state root with a ready compatible daemon
- **THEN** the operation executes through that daemon's composed runtime and returns through the local protocol boundary

#### Scenario: Non-local access is unavailable
- **WHEN** a non-local peer attempts to reach the daemon protocol
- **THEN** no daemon operation is exposed to that peer

### Requirement: Canonical runtime identity and dual exclusive leases
Daemon runtime identity MUST bind the ordered effective config, data, state, and cache root tuple after supported overrides and canonical symlink/alias resolution. Endpoint discovery MUST validate that exact tuple. The exclusive lifecycle lease MUST be keyed by the canonical state root and record the full tuple, rejecting a different config/data/cache tuple for the same state root. Before opening SQLite, the daemon MUST also acquire an exclusive database lease keyed by the canonical SQLite path derived from the canonical data root. The database lease MUST reject another owner rather than permit two runtimes to own one database.

Health and public failures MUST expose only safe identity digests and MUST NOT expose any raw config, data, state, cache, socket, or SQLite path. Stale metadata or lease records MUST NOT alone prove a live owner; recovery MUST validate liveness and matching ownership tokens before cleanup.

#### Scenario: Concurrent starts converge on one instance
- **WHEN** multiple processes concurrently attempt to serve the daemon for the same canonical runtime tuple and database
- **THEN** exactly one daemon becomes the live owner and every other attempt identifies that instance or fails with a single-instance diagnostic

#### Scenario: Aliases resolve to one identity
- **WHEN** two starts name roots through different symlink or path aliases that resolve to the same canonical config/data/state/cache tuple
- **THEN** they contend for the same lifecycle and database ownership rather than starting two daemons

#### Scenario: Same state with different data is rejected as a mismatch
- **WHEN** a contender resolves the same canonical state root but a different canonical data root from the live daemon
- **THEN** runtime identity validation rejects the mismatch without contacting a business procedure or opening either database in the contender

#### Scenario: Different state roots cannot double-own one database
- **WHEN** two runtime tuples have different canonical state roots but resolve to the same canonical SQLite path
- **THEN** exactly one acquires the database lease and the other fails with a structured database-lease conflict before opening SQLite

#### Scenario: Truly isolated tuples run independently
- **WHEN** two worktrees or tests use distinct canonical tuples and distinct canonical SQLite paths
- **THEN** each can run its own daemon without discovering, stopping, or sending requests to the other daemon

#### Scenario: Stale lifecycle state is recovered
- **WHEN** lifecycle metadata exists for an instance that is no longer live
- **THEN** a new start can recover only matching tuple/database ownership without treating the stale instance as ready or releasing another owner's lease

### Requirement: Deterministic startup and readiness
Daemon startup SHALL be a detached lifecycle operation for an initialized exact runtime. It MUST acquire the canonical lifecycle and database leases before opening SQLite, MUST load configuration and one immutable Extension registry, MUST bind the private endpoint, and MUST publish `ready` metadata only after the runtime can accept compatible health and business requests. The explicit start operation MUST wait for compatible readiness within a fixed bound before reporting success.

Startup metadata MUST be owner-private, bounded, and limited to protocol identity, hashed runtime identity, lifecycle state, instance identity, PID for observation only, start time, and endpoint token. It MUST NOT contain raw canonical paths, provider data, secrets, or registry contents. PID metadata MUST NOT be used as proof of ownership or as a signal target.

Concurrent start attempts for one canonical runtime MUST converge on at most one lease-owning daemon. Any losing child MUST exit without opening SQLite or replacing the winner's metadata/endpoint. Same-process ensure requests SHOULD share one in-flight readiness operation. Startup failure MUST release any acquired listener, SQLite handle, database lease, lifecycle lease, matching metadata, and owned endpoint before returning a bounded actionable failure.

#### Scenario: Explicit start launches the daemon
- **WHEN** an operator starts an initialized supported runtime with no live daemon
- **THEN** the CLI detaches the exact daemon executable and observes compatible readiness within the startup bound
- **THEN** the daemon remains available after that CLI process exits

#### Scenario: Concurrent background starts converge
- **WHEN** multiple CLI processes attempt to start the same canonical runtime concurrently
- **THEN** at most one daemon acquires ownership and opens SQLite
- **THEN** every successful caller observes and uses that same compatible ready instance

#### Scenario: Startup fails before readiness
- **WHEN** initialization, registry loading, SQLite open, migration, or endpoint binding fails
- **THEN** no ready metadata is published, no owned runtime resource is leaked, and the CLI returns a bounded actionable daemon failure

#### Scenario: Process PID is reused
- **WHEN** stale discovery metadata names a PID now owned by an unrelated process
- **THEN** ctxindex never signals that PID and relies on retained lifecycle ownership to decide whether replacement or cleanup is safe

### Requirement: Health and unavailable-daemon behavior
The daemon SHALL provide a side-effect-free health operation that reports readiness, protocol identity, lifecycle state, and safe runtime/database identity digests. It MUST NOT report raw paths. Once validated exact-tuple metadata or a test override selects daemon routing, failure to reach a ready daemon MUST fail deterministically as daemon unavailable and MUST NOT fall back to in-process runtime composition or direct storage access.

#### Scenario: Ready daemon reports health
- **WHEN** a compatible client requests health from a ready daemon
- **THEN** it receives ready/lifecycle state, protocol identity, and safe identity digests without invoking business behavior or receiving raw paths

#### Scenario: Selected missing daemon does not trigger a fallback runtime
- **WHEN** exact-tuple metadata or a test override selected a daemon-backed operation and no ready daemon is reachable
- **THEN** the request fails as daemon unavailable without composing a client-owned runtime

### Requirement: Protocol and runtime compatibility precede business execution
Every client request MUST establish exact protocol and canonical runtime-identity compatibility before invoking a business procedure. Compatibility middleware MUST use immutable router expectations and MUST NOT call an application method as part of the check. An incompatible client MUST receive a declared typed safe error and the daemon MUST NOT execute any application method. The prototype creates no compatibility obligation between different protocol versions.

#### Scenario: Compatible protocol admits a request
- **WHEN** a client and ready daemon present compatible protocol identities and versions
- **THEN** the daemon may validate and execute the requested procedure

#### Scenario: Incompatible protocol blocks execution
- **WHEN** a client and daemon present incompatible protocol identities or versions
- **THEN** the client receives a structured incompatibility failure and no requested business procedure executes

#### Scenario: Incompatible runtime blocks execution
- **WHEN** a client presents a different canonical runtime tuple or database digest
- **THEN** it receives a structured runtime-identity mismatch and no application method executes

### Requirement: Request-scoped cancellation
Cancellation of an in-flight daemon request MUST propagate to that request's operation through the existing cancellation contract. Cancelling one request MUST NOT terminate the daemon or cancel unrelated requests. Cancellation MUST preserve existing transactional storage and sync bookkeeping guarantees, and a late result from a cancelled request MUST NOT be reported as successful to the cancelling client.

The router MUST obtain cancellation from the oRPC procedure handler's native signal rather than from serialized or validated transport context. It MUST forward that exact signal through `RpcRequestContext`; a signal-less in-process invocation MUST receive a safe non-aborted signal.

#### Scenario: Client cancels one in-flight request
- **WHEN** a client cancels an in-flight daemon request before it completes
- **THEN** that operation observes cancellation, retains its existing cancelled outcome, and unrelated requests and the daemon remain available

#### Scenario: Cancellation occurs during a transaction
- **WHEN** cancellation is observed while an operation owns transactional work
- **THEN** the operation follows its existing commit-or-rollback and cancellation bookkeeping contracts without exposing a partial write

### Requirement: Daemon-backed normal stateful workflow
When a compatible daemon is selected, the CLI SHALL route Realm add/list, Source add/list/remove, sync/status, search, exact get, and local thread traversal through the daemon-owned runtime. The client process MUST NOT open SQLite for these commands. Argument parsing, human and JSON formatting, warnings, and stable exit mapping SHALL remain CLI-owned and observationally equivalent to direct mode.

#### Scenario: Setup and access use one runtime
- **WHEN** a user creates a Realm and Source, synchronizes it, searches, retrieves a Ref, and traverses a local thread while a compatible daemon is selected
- **THEN** every storage-backed operation executes in the daemon process using its immutable registry and database handle
- **THEN** the CLI process opens no SQLite handle and preserves its existing output and exits

#### Scenario: Selected daemon is lost during a migrated command
- **WHEN** any migrated normal stateful command has selected a daemon and transport becomes unavailable
- **THEN** it returns daemon-unavailable without composing direct dependencies or opening SQLite

### Requirement: Graceful shutdown retains ownership through settlement
An explicit shutdown request SHALL return a typed idempotent acceptance, make the daemon enter `stopping`, stop admitting new business requests, and signal cancellation to in-flight operations. The CLI SHALL observe settlement for a bounded interval. The daemon MUST close SQLite and release its endpoint, database lease, and lifecycle lease only after all active operations settle. If any request remains non-cooperative at the deadline, the CLI MUST return structured `shutdown_timeout`; the daemon MUST remain stopping and non-admitting, retain SQLite and both leases until settlement or explicit operator force-termination, and MUST NOT report shutdown complete.

#### Scenario: Shutdown drains daemon ownership
- **WHEN** shutdown is requested while business operations are in flight
- **THEN** new business requests are refused, in-flight operations receive cancellation, and shutdown completes only after SQLite, endpoint, database lease, and lifecycle lease are released

#### Scenario: Non-cooperative request times out without releasing ownership
- **WHEN** an in-flight request does not settle before the shutdown observation deadline
- **THEN** the client receives structured `shutdown_timeout`, the daemon remains stopping/non-admitting, and SQLite plus both leases remain owned
- **THEN** no shutdown-complete result is reported until settlement or explicit operator force-termination

#### Scenario: Concurrent shutdown requests are idempotent
- **WHEN** multiple clients request shutdown for the same live daemon
- **THEN** they converge on the same shutdown without terminating any daemon associated with another effective state root

### Requirement: Background lifecycle survives its invoking CLI
The daemon process MUST run independently of the CLI process that started it, with no inherited interactive stdin and no requirement for a foreground serve terminal. The supported product surface MUST NOT expose a foreground daemon serve command. Startup diagnostics MUST be written only to an owner-private state location and user-facing lifecycle failures MUST NOT expose its raw path or raw process output.

The detachment mechanism MUST use cross-platform Bun process primitives and MUST NOT introduce launchd-only, systemd-only, or Darwin-only lifecycle behavior. A platform remains daemon-supported only when its separate retained-ownership backend is verified.

#### Scenario: Starting terminal exits
- **WHEN** `ctxindex daemon start` reports a ready background daemon and the invoking process exits
- **THEN** later CLI invocations for the same runtime can reach the same daemon

#### Scenario: Platform has no ownership backend
- **WHEN** the operating-system platform cannot supply verified retained daemon ownership
- **THEN** lifecycle status reports unsupported, explicit start fails actionably, and ordinary commands preserve the existing direct behavior

### Requirement: Stale lifecycle state recovers without process signalling
Explicit start and stop MUST distinguish live RPC health from discovery metadata. A replacement daemon MAY overwrite stale matching metadata and remove a stale matching Unix socket only after acquiring exclusive lifecycle ownership. An idempotent stop MAY remove stale matching metadata/endpoint only while it retains that same exclusive ownership. Unsafe, mismatched, malformed, or non-owner state MUST fail closed.

#### Scenario: Daemon crashes after publishing ready
- **WHEN** the owning daemon dies and releases kernel-retained ownership while matching metadata or a socket remains
- **THEN** the next start can acquire ownership, safely replace stale state, and publish one ready instance

#### Scenario: Stale stop cleanup races a replacement
- **WHEN** a stop request and replacement start race for stale state
- **THEN** only the lifecycle-lease holder may clean or replace state and neither operation removes the live winner's metadata or endpoint
