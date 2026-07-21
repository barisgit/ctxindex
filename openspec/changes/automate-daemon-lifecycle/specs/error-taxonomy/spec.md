## ADDED Requirements

### Requirement: Background lifecycle failures remain bounded and actionable
Detached daemon startup, explicit lifecycle operations, and readiness observation MUST map expected lifecycle failure to the existing daemon/internal stable exit class `50`, except user cancellation which MUST remain `130`. Diagnostics MUST identify the failed lifecycle action and next safe operator action without exposing raw endpoint paths, executable paths, child output, host errors, stacks, causes, provider data, or secrets.

Stopped and already-running/already-stopped idempotent lifecycle outcomes MUST be successful results, not failures. An unsupported ownership platform MUST be distinguishable in lifecycle status and explicit start diagnostics without changing ordinary direct-command exits on that platform.

#### Scenario: Detached child never becomes ready
- **WHEN** explicit detached startup reaches its readiness deadline without a compatible healthy daemon
- **THEN** the CLI exits 50 with bounded guidance to inspect daemon status and diagnostics

#### Scenario: Lifecycle request is cancelled
- **WHEN** the operator interrupts readiness or shutdown observation
- **THEN** the CLI exits 130 without killing a PID from discovery metadata or opening SQLite directly

#### Scenario: Already stopped daemon is stopped again
- **WHEN** `ctxindex daemon stop` finds no live or stale matching daemon state
- **THEN** it exits successfully with deterministic already-stopped output
