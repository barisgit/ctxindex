## ADDED Requirements

### Requirement: Local daemon is the normal stateful runtime owner
On an advertised platform, ctxindex MUST use one compatible local daemon as the normal owner of the canonical SQLite database, active Extension registry, runtime composition, and stateful application services. The CLI MUST remain the sole agent-facing surface and the RPC protocol MUST remain private and exact-versioned.

Daemon ownership MUST NOT become the default until every stateful command is either daemon-routed or included in a tested bootstrap/filesystem-only exception allowlist.

#### Scenario: Complete stateful command inventory is ready
- **WHEN** daemon ownership becomes the normal execution mode
- **THEN** every stateful CLI entrypoint delegates to a semantic daemon procedure or is a documented safe exception
- **THEN** no command silently falls back to direct SQLite access after selecting a daemon

### Requirement: Supported platforms fail closed without retained ownership
Each advertised operating system MUST provide process-retained shared and exclusive ownership with crash release, owner-private metadata, alias-safe canonical identity, and fail-closed acquisition. A platform without a verified implementation MUST reject daemon ownership before SQLite opens and MUST NOT be advertised as supported.

#### Scenario: Platform backend is unavailable
- **WHEN** the current platform cannot provide the verified retained-ownership semantics
- **THEN** daemon startup fails before SQLite open with a bounded actionable failure
