## MODIFIED Requirements

### Requirement: Deterministic daemon lifecycle surface
The CLI SHALL provide background daemon `start`, `status`, and `stop` commands and MUST NOT expose a supported foreground serve command. These operations MUST be non-interactive, MUST support deterministic machine-readable output, and MUST keep readiness/startup and graceful-shutdown observation bounded.

`start` MUST be idempotent and report whether it launched or reused a compatible daemon. `status` MUST NOT launch or mutate a daemon; it MUST distinguish stopped, starting, running, stopping, unavailable/stale, and unsupported state, and running state MUST be backed by a successful compatible health request. `stop` MUST be idempotent, MUST use graceful RPC shutdown for a live daemon, MUST NOT signal a discovery PID, and MUST report completion only after ownership settlement or safe stale-state cleanup.

Ordinary commands MUST preserve the existing explicit selection behavior in this slice: they use a validated compatible daemon when discovery or a test endpoint override selects one and otherwise retain their current direct route. They MUST NOT trigger background startup until every stateful command is daemon-routed or admitted to a tested bootstrap/filesystem-only exception allowlist. After daemon selection, transport loss MUST NOT fall back to direct SQLite.

#### Scenario: Agent explicitly starts twice
- **WHEN** an agent invokes `ctxindex daemon start` twice for the same initialized runtime
- **THEN** both invocations succeed deterministically and the second reports the already-running compatible instance without launching another owner

#### Scenario: Agent inspects running status
- **WHEN** an agent invokes `ctxindex daemon status --json` for a compatible ready daemon
- **THEN** the CLI reports deterministic running lifecycle, health, readiness, protocol, instance, and active-request state without a transport envelope

#### Scenario: Agent inspects stopped status
- **WHEN** no daemon or matching discovery metadata exists
- **THEN** `ctxindex daemon status` reports stopped successfully and does not start a process

#### Scenario: Agent stops twice
- **WHEN** an agent invokes `ctxindex daemon stop` after the daemon is already stopped
- **THEN** the command succeeds deterministically and reports that no live daemon remained

#### Scenario: Ordinary malformed command has no lifecycle side effect
- **WHEN** an ordinary daemon-backed command has malformed locally checkable input
- **THEN** the CLI exits with invalid usage before discovery, spawn, or transport

#### Scenario: Ordinary command does not start before parity
- **WHEN** no daemon is selected and any stateful command family still requires direct SQLite access
- **THEN** an ordinary command does not launch a daemon as a side effect
- **THEN** the current direct route remains available subject to its ownership fence

#### Scenario: Selected daemon is lost after readiness
- **WHEN** transport becomes unavailable after the command selected or started its daemon
- **THEN** the CLI returns daemon-unavailable through exit 50 and never composes a direct runtime

#### Scenario: Test override is unavailable
- **WHEN** a test endpoint override selects an unreachable endpoint
- **THEN** the CLI returns daemon-unavailable without spawning or falling back

#### Scenario: Unsupported platform runs ordinary command directly
- **WHEN** an ordinary command runs where no retained daemon ownership backend exists
- **THEN** it preserves its prior direct behavior and does not claim a background daemon was started
