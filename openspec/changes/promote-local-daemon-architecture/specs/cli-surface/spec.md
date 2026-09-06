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

### Requirement: Registry discovery uses semantic read projections
On an advertised platform with initialized state, ordinary `describe` (including Profile, Adapter, and Action discovery without `--source`) and `extension list` MUST read the daemon-owned immutable registry through bounded semantic procedures. Neither command is a filesystem-only exception. Selecting an unavailable daemon MUST fail closed without client registry composition.

The description projection MUST preserve the existing core Profile, Adapter, and Action description values, not serialize registry objects, executable definitions, or functions. The Extension inventory projection MUST preserve loaded identities, unavailable installed entries, and exact installed provenance without Catalog refresh. Filtering, compact/detail/full presentation, output format, diagnostic rendering, and exit selection remain CLI-owned. `describe action <id> --source <source>` MUST retain its existing Action service route and output.

Canonical pre-initialization pure definition discovery remains required by the CLI surface's explicit-initialization contract. Registry-read migration MUST NOT implicitly initialize durable state or turn that discovery into an initialization error. Before initialization, ordinary `describe` and `extension list` SHALL retain their existing state-free direct definition discovery as an explicit narrow pre-initialization surface. After initialization they MUST ensure daemon ownership on supported platforms and MUST NOT fall back after ensure or selection. This does not widen the existing documentation pre-init surface or introduce a pre-initialization daemon lifecycle.

#### Scenario: Initialized registry read loses the selected daemon
- **WHEN** an initialized caller runs ordinary `describe` or `extension list` with an unavailable selected daemon
- **THEN** it exits `50` without constructing a client registry or opening SQLite

#### Scenario: Pure discovery precedes initialization
- **WHEN** a caller requests pure definition discovery before completing initialization
- **THEN** discovery remains available without creating config, database, secret-store, or Keychain state

#### Scenario: Registry read uses an unsupported platform
- **WHEN** the platform has no verified daemon ownership backend
- **THEN** the existing explicit unsupported-platform behavior remains available without claiming daemon ownership

The accepted installed-Extension stop/lease/mutate/release/restart coordinator is unchanged; these read projections do not move installation or acquisition into RPC.
