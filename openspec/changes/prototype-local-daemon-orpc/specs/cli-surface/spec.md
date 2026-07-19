## ADDED Requirements

### Requirement: CLI remains the sole agent-facing interface across daemon transport
The CLI MUST remain the only agent-facing integration surface when behavior is routed through the local daemon. It MUST continue to own argument parsing and validation, human-readable and JSON formatting, diagnostics, and final exit-code selection. The local RPC interface MUST NOT become a supported external agent integration surface.

For daemon-routed commands, all input that can be validated without runtime state MUST be validated before any transport request. Successful results and structured domain failures MUST retain the command's existing output and exit behavior regardless of whether the operation executes in-process or through the daemon.

For Realm add/list, Source add/list/remove and the Source-definition projection needed to parse Source configuration, sync/status, search, exact get, and local thread traversal, the CLI MUST select daemon routing when validated lifecycle/discovery metadata exists for the exact canonical runtime tuple or when a test endpoint override explicitly selects it. Once selected, the client process MUST NOT open SQLite, and an unreachable, stale, or lost endpoint MUST report daemon-unavailable with exit `50` without falling back to direct composition. Stateful command paths outside this implemented daemon-routed set are explicitly unconverted and MAY preserve their direct behavior only behind the database-lease fence.

Before any unconverted stateful command composes a runtime or opens SQLite, the CLI MUST resolve the canonical SQLite path and attempt retained shared lease acquisition. Exclusive conflict MUST report `prototype_unsupported` through exit `50` before database open. Successful shared ownership MUST remain held until after SQLite close, while the command otherwise retains existing direct behavior.

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
- **THEN** the CLI exits 50 with a prototype-unsupported diagnostic before composing a runtime or opening SQLite

#### Scenario: Unconverted stateful command remains direct with shared ownership
- **WHEN** the command acquires a shared lease for its canonical SQLite path
- **THEN** it retains that lease until after close and otherwise preserves its existing direct behavior

### Requirement: Deterministic daemon lifecycle surface
The system SHALL provide an explicit foreground daemon serve entrypoint. The CLI SHALL provide bounded commands to inspect daemon health and readiness and request graceful shutdown. These surfaces MUST be non-interactive, MUST support deterministic machine-readable output, and MUST report unavailable or incompatible daemon state with actionable diagnostics through the stable exit taxonomy. The prototype MUST NOT implicitly start or detach a daemon as a side effect of an ordinary command.

#### Scenario: Operator serves the daemon in the foreground
- **WHEN** an operator invokes the daemon serve entrypoint for an available effective state root
- **THEN** the foreground process does not report ready until runtime initialization and local endpoint binding succeed

#### Scenario: Agent inspects daemon readiness
- **WHEN** an agent requests daemon status in machine-readable mode
- **THEN** the CLI reports deterministic lifecycle, health, readiness, and protocol-compatibility state without prompts

#### Scenario: Agent requests graceful daemon shutdown
- **WHEN** an agent requests shutdown of a compatible running daemon
- **THEN** the CLI waits for a bounded shutdown result and reports the outcome through deterministic output and the stable exit taxonomy

#### Scenario: Graceful shutdown observation times out
- **WHEN** a non-cooperative daemon request remains active past the shutdown observation deadline
- **THEN** the CLI reports structured shutdown timeout through exit 50 and does not claim shutdown complete
