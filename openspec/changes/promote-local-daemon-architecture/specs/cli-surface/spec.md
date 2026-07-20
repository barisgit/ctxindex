## ADDED Requirements

### Requirement: All runtime-owning commands use semantic daemon services
After promotion, every CLI command that reads or mutates SQLite, secrets, Accounts, Grants, OAuth Apps, the active Extension registry, managed Artifact bookkeeping, or provider-backed runtime state MUST use a bounded semantic daemon application procedure. The CLI MUST continue to own argument validation possible without runtime state, explicit browser interaction, formatting, diagnostics, and final exit mapping.

Pre-daemon initialization and proven filesystem-only Catalog inspection MAY remain direct only through an explicit tested allowlist. The allowlist MUST NOT permit SQLite open, secret mutation, installed-registry activation, or provider I/O.

#### Scenario: Remaining stateful command runs while daemon is active
- **WHEN** an agent invokes OAuth App, Account, secret-backend, Artifact, export, Action, purge, or installed-Extension behavior
- **THEN** the CLI delegates a semantic request without composing the runtime or opening SQLite

#### Scenario: Safe direct exception runs
- **WHEN** a direct bootstrap or filesystem-only command is allowlisted
- **THEN** architecture tests prove it cannot access daemon-owned state or mutate the active registry
