## ADDED Requirements

### Requirement: All runtime-owning commands use semantic daemon services
After promotion, every CLI command that reads or mutates SQLite, secrets, Accounts, Grants, OAuth Apps, the active Extension registry, managed Artifact bookkeeping, or provider-backed runtime state MUST use a bounded semantic daemon application procedure. The CLI MUST continue to own argument validation possible without runtime state, explicit browser interaction, formatting, diagnostics, and final exit mapping.

Only an explicit tested allowlist MAY remain direct: pre-daemon `init` bootstrap, which creates initial configuration, secret-backend, and SQLite state before any daemon can own it; filesystem-only Catalog and documentation commands that neither open SQLite nor change installed activation; explicit daemon lifecycle controls; and installed-Extension maintenance that first verifies a stopped daemon and retains shared database ownership for the whole mutation as required by the local-daemon direct Extension maintenance requirement. Every other command MUST NOT open SQLite or mutate secrets, the installed registry, or provider state outside the daemon. A platform without a verified daemon ownership backend retains its existing conditional direct route because no daemon can own its database.

#### Scenario: Remaining stateful command runs while daemon is active
- **WHEN** an agent invokes OAuth App, Account, secret-backend, Artifact, export, Action, purge, or installed-Extension inventory behavior
- **THEN** the CLI delegates a semantic request without composing the runtime or opening SQLite

#### Scenario: Installed-Extension maintenance runs while daemon is active
- **WHEN** an agent installs, updates, or uninstalls an Extension while a daemon owns the database
- **THEN** the CLI stops that daemon, retains shared database ownership for the whole mutation, releases it, and restores the daemon, and never mutates the active daemon registry in place

#### Scenario: Safe direct exception runs
- **WHEN** a direct bootstrap or filesystem-only command is allowlisted
- **THEN** architecture tests prove only allowlisted bootstrap, verified-stopped Extension maintenance, or the unsupported-platform conditional route can reach direct SQLite or secret ownership, and no exception mutates an active daemon registry

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

## MODIFIED Requirements

### Requirement: CLI remains the sole agent-facing interface across daemon transport
The CLI MUST remain the only agent-facing integration surface when behavior is routed through the local daemon. It MUST continue to own argument parsing and validation, human-readable and JSON formatting, diagnostics, and final exit-code selection. The local RPC interface MUST NOT become a supported external agent integration surface.

For daemon-routed commands, all input that can be validated without runtime state MUST be validated before any transport request. Successful results and structured domain failures MUST retain the command's existing output and exit behavior regardless of whether the operation executes in-process or through the daemon.

For Realm add/list, Source add/list/remove and the Source-definition projection needed to parse Source configuration, sync/status, search, exact get, and local thread traversal, the CLI MUST select daemon routing when validated lifecycle/discovery metadata exists for the exact canonical runtime tuple or when a test endpoint override explicitly selects it. Once selected, the client process MUST NOT open SQLite, and an unreachable, stale, or lost endpoint MUST report daemon-unavailable with exit `50` without falling back to direct composition. Stateful command paths outside this implemented daemon-routed set are explicitly unconverted and MAY preserve their direct behavior only behind the database-lease fence.

Before any unconverted stateful command composes a runtime or opens SQLite, the CLI MUST resolve the canonical SQLite path and attempt retained shared lease acquisition. Exclusive conflict MUST report the bounded `database_lease_conflict` classification through exit `50` before database open. Successful shared ownership MUST remain held until after SQLite close, while the command otherwise retains existing direct behavior. If the current platform has no retained-lease backend, daemon startup is impossible and the direct command MUST preserve its pre-daemon behavior without a lease; unsupported lock semantics on a platform that otherwise supplies the backend MUST still fail closed.

#### Scenario: Malformed input fails before transport
- **WHEN** an agent invokes a daemon-routed command with malformed arguments or an invalid locally checkable payload
- **THEN** the CLI reports invalid usage through exit code 2 without connecting to or starting the daemon

#### Scenario: Daemon-routed command preserves CLI contract
- **WHEN** a valid daemon-routed command completes successfully
- **THEN** the CLI emits the same documented human-readable or JSON result shape and success exit behavior as the command contract requires
- **THEN** no transport-specific envelope is exposed in command output

#### Scenario: Exact-tuple metadata selects RPC without fallback
- **WHEN** validated lifecycle/discovery metadata exists for the command's exact canonical tuple and the endpoint is unreachable or stale
- **THEN** the CLI reports daemon-unavailable through exit 50 and does not compose a direct runtime

#### Scenario: Test override selects RPC
- **WHEN** a test endpoint override explicitly selects daemon routing
- **THEN** the CLI uses that endpoint and does not fall back to direct behavior on connection failure

#### Scenario: Expanded daemon workflow does not open client storage
- **WHEN** an agent creates or lists a Realm or Source, synchronizes, requests status, searches, retrieves an exact Ref, or traverses a local thread while exact-tuple metadata or a test override selects daemon routing
- **THEN** the CLI delegates the operation through its semantic RPC procedure and does not compose a direct runtime or open SQLite

#### Scenario: Unconverted stateful command cannot bypass daemon ownership
- **WHEN** an agent invokes an unconverted stateful command while a daemon holds the canonical target database lease
- **THEN** the CLI exits 50 with a database-lease-conflict diagnostic before composing a runtime or opening SQLite

#### Scenario: Unconverted stateful command remains direct with shared ownership
- **WHEN** the command acquires a shared lease for its canonical SQLite path
- **THEN** it retains that lease until after close and otherwise preserves its existing direct behavior

#### Scenario: Unsupported platform remains directly usable
- **WHEN** no daemon route is selected and the operating system has no retained-lease backend
- **THEN** an unconverted or directly implemented command preserves its prior SQLite behavior instead of failing with a database lease conflict
