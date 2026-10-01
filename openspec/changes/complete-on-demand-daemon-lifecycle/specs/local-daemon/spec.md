## ADDED Requirements

### Requirement: Stateful commands ensure one daemon on demand
On Darwin and Linux, every initialized CLI command classified as stateful by the promoted command inventory MUST ensure one ready daemon for its exact canonical runtime before invoking a business procedure. Ensure MUST reuse a compatible ready daemon or start the exact detached daemon and observe readiness within the bounded startup interval. Concurrent ensures for one runtime MUST converge on at most one ownership holder and every successful caller MUST use that compatible instance.

After a stateful command begins ensure, it MUST NOT fall back to client-owned runtime composition, direct SQLite access, or provider execution. Pre-initialization and proven filesystem-only operations MAY remain direct only through the separately tested safe-exception allowlist.

#### Scenario: First stateful command starts the runtime
- **WHEN** an initialized supported runtime has no live daemon and a user invokes a stateful command
- **THEN** the command starts and observes one compatible ready daemon before invoking its semantic procedure
- **THEN** the client process does not open SQLite or compose the provider runtime

#### Scenario: Concurrent first commands converge
- **WHEN** multiple processes invoke stateful commands concurrently for the same canonical runtime with no live daemon
- **THEN** at most one daemon acquires ownership and opens SQLite
- **THEN** every command that succeeds invokes its procedure through that same compatible instance

#### Scenario: Automatic startup fails
- **WHEN** a stateful command cannot establish a compatible ready daemon within the startup bound
- **THEN** it returns a bounded daemon lifecycle failure and performs no direct stateful fallback

### Requirement: Daemon shuts down after activity-aware idle expiry
A ready daemon MUST begin graceful automatic shutdown after five consecutive minutes without an admitted business request. The idle interval MUST begin at readiness and MUST reset after the last admitted business request settles. Any admitted unary or streaming business request MUST suppress idle shutdown until it settles, regardless of its duration. Health, status, ensure probes, and lifecycle control MUST NOT reset the business idle interval.

Idle expiry MUST atomically stop new admission before shutdown drains and releases SQLite, the endpoint, and both retained leases through the existing graceful-shutdown contract. A stateful command racing with that transition MUST either be admitted before stopping or establish a replacement daemon after ownership is released; it MUST NOT cause an already-invoked business procedure to be replayed.

#### Scenario: Unused daemon exits
- **WHEN** a ready daemon receives no admitted business request for five consecutive minutes
- **THEN** it transitions to stopping and releases its runtime resources and retained ownership after graceful settlement

#### Scenario: Long request crosses the idle duration
- **WHEN** an admitted business request remains active for longer than five minutes
- **THEN** idle expiry does not stop or cancel it
- **THEN** a new five-minute idle interval begins only after that request settles and no other business request remains active

#### Scenario: Status does not keep the daemon alive
- **WHEN** clients repeatedly inspect health or lifecycle status without invoking business procedures
- **THEN** those inspections do not reset the idle interval

#### Scenario: Command races idle transition
- **WHEN** a stateful command arrives as the daemon atomically transitions from ready to stopping
- **THEN** the procedure executes at most once through either the admitted old instance or one compatible replacement after ownership release

### Requirement: Linux and Darwin are advertised on-demand daemon platforms
The on-demand daemon lifecycle MUST be supported on Linux and Darwin with equivalent canonical runtime identity, retained lifecycle and database ownership, detached startup, readiness, crash release, idle shutdown, and exact-runtime stop semantics. On either platform, an unavailable or unsafe ownership primitive MUST fail closed before SQLite opens and MUST NOT silently select direct execution for an initialized stateful command.

#### Scenario: Linux packaged command starts and reuses a daemon
- **WHEN** a packaged Linux CLI invokes two stateful commands for one initialized canonical runtime
- **THEN** the first command ensures a detached daemon and the second reuses that same compatible ownership holder

#### Scenario: Supported platform lease is unsafe
- **WHEN** Linux or Darwin cannot safely acquire the required retained lifecycle or database lease
- **THEN** automatic and explicit startup fail before SQLite opens with a bounded actionable daemon failure

### Requirement: Explicit lifecycle controls compose with automatic lifecycle
`daemon start` MUST eagerly perform the same exact-runtime ensure used by stateful commands. `daemon status` MUST remain side-effect-free and MUST neither start a daemon nor reset its business idle interval. `daemon stop` MUST remain an idempotent exact-runtime graceful shutdown request and MUST stop the daemon without waiting for idle expiry. The supported product surface MUST NOT expose foreground serving.

#### Scenario: Status observes an absent daemon
- **WHEN** an operator runs `daemon status` for a runtime with no live daemon
- **THEN** status reports the stopped/absent state without launching a process

#### Scenario: Explicit stop precedes idle expiry
- **WHEN** an operator runs `daemon stop` while a compatible daemon is ready
- **THEN** the existing graceful shutdown contract begins immediately without waiting for the idle deadline
