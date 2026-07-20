## ADDED Requirements

### Requirement: One retained owner is required on every supported platform
Every production SQLite opener on an advertised daemon platform MUST participate in the same canonical database ownership protocol. The daemon MUST retain exclusive ownership from before open until after close; any allowlisted direct opener MUST retain shared ownership over the same interval. Platform implementations MUST preserve equivalent contention, crash-release, private-file, and fail-closed semantics. Before a platform is advertised, daemon startup MUST fail closed while the existing direct CLI remains usable without the unavailable lease.

#### Scenario: Advertised platform runs competing owners
- **WHEN** a daemon holds exclusive ownership for a canonical database
- **THEN** no direct process can open that database
- **THEN** process death releases ownership without deleting or aging the permanent ownership file
