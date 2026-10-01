## MODIFIED Requirements

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

## ADDED Requirements

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
