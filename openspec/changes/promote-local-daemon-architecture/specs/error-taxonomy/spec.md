## ADDED Requirements

### Requirement: Promoted daemon failures omit prototype classification
Normal daemon operation MUST preserve bounded lifecycle, compatibility, ownership, cancellation, result-size, and domain failures across RPC while the CLI retains sole ownership of numeric exits. No public diagnostic MUST describe a normal command as prototype-unsupported after complete migration. The private failure registry MUST NOT declare a prototype-only failure kind. A direct opener blocked by daemon database ownership MUST report the bounded `database_lease_conflict` classification through exit `50` before opening SQLite.

#### Scenario: Migrated command reaches an unavailable daemon
- **WHEN** a compatible daemon route was selected and becomes unreachable
- **THEN** the CLI reports bounded daemon unavailability through the stable service-failure exit without falling back or exposing transport details

#### Scenario: Normal command is supported by daemon ownership
- **WHEN** a formerly fenced stateful command is invoked after promotion
- **THEN** it executes through its semantic procedure and never emits prototype-only failure wording

#### Scenario: Direct opener meets daemon ownership
- **WHEN** an allowlisted direct path or the unsupported-platform conditional route attempts shared database ownership while a daemon holds the canonical database lease
- **THEN** it reports `database_lease_conflict` through exit 50 before composing a runtime or opening SQLite

## MODIFIED Requirements

### Requirement: Structured failures cross the local RPC boundary
The local RPC boundary MUST transport structured domain and transport errors as declared typed oRPC errors without reducing them to message strings or embedding them in a success/failure result envelope. Each declared error's data MUST be exactly one strict bounded `RpcFailure` variant and its outer oRPC message MUST be constant rather than copied from dynamic diagnostics. Structured safe failures MUST distinguish daemon unavailability, protocol incompatibility, runtime identity mismatch, database lease conflict, shutdown timeout, cancellation, result-too-large, and bounded ctxindex failures. They MUST include only bounded actionable public fields and MUST NOT include `Error`, `cause`, `stack`, raw diagnostics, raw paths, socket/OS errors, provider bodies, or secrets. Nested per-Source sync failures MUST use the bounded safe projection rather than serialized errors. Unknown client link or protocol exceptions MUST become daemon-unavailable.

One authoritative registry MUST pair every failure kind with its exact strict schema and constant outer message. Registry construction MUST derive each schema's literal failure kind from its registry key so a mismatched key/kind cannot compile. The declared oRPC error code MUST be that failure kind. The `RpcFailure` union/schema, router construction, and client code/data/message validation MUST derive from this registry and MUST NOT maintain aliases or parallel handwritten kind/code switches.

A database-lease conflict MUST include the canonical database digest and MUST NOT include or report an owner tuple digest. Its public diagnostic MUST describe another local process/runtime rather than attributing the holder to a daemon.

Daemon unavailability, protocol incompatibility, runtime identity mismatch, database lease conflict, and shutdown timeout MUST map to exit `50`; cancellation MUST retain `130`; locally detectable invalid usage MUST retain `2` and fail before transport. Numeric exits are added only by the CLI and are not fields in RPC DTOs.

#### Scenario: Domain error crosses RPC unchanged
- **WHEN** a daemon-routed operation returns a structured domain error with an established CLI mapping
- **THEN** the server throws its declared oRPC error with the exact validated bounded failure data and a constant outer message
- **THEN** the CLI preserves its stable error code and actionable fields and selects the same exit code as an equivalent in-process invocation

#### Scenario: Successful operation has no transport envelope
- **WHEN** a daemon-routed operation succeeds
- **THEN** the client receives the declared plain output value without an `ok`, `value`, or `error` wire envelope

#### Scenario: Unknown transport exception remains unavailable
- **WHEN** the client receives an exception that is not a validated declared oRPC error for the contract
- **THEN** it reports daemon-unavailable without exposing or trusting the exception payload
- **THEN** hostile prototype or property traps in that unknown value cannot escape classification or expose their thrown payload

#### Scenario: Failure registry remains correlated
- **WHEN** a failure kind or schema is added or changed
- **THEN** the declared server error, `RpcFailure` union, router constructor, and client validator reflect that same registry entry without another mapping

#### Scenario: Ready daemon is unavailable
- **WHEN** the CLI cannot connect to the local daemon for a valid daemon-routed request
- **THEN** it reports an actionable daemon-unavailable diagnostic through exit code 50 without exposing a raw socket or transport exception as the public error

#### Scenario: Protocol versions are incompatible
- **WHEN** the CLI reaches a daemon whose protocol is incompatible with the client
- **THEN** it reports the client and daemon protocol incompatibility with actionable restart or upgrade guidance through exit code 50

#### Scenario: Runtime identities are incompatible
- **WHEN** client and daemon canonical runtime identities differ
- **THEN** the CLI reports bounded digest identities through exit 50 without exposing raw paths and no application method executes

#### Scenario: Database ownership conflicts during startup
- **WHEN** foreground daemon startup cannot acquire the canonical database lease
- **THEN** it reports a structured database-lease conflict through exit 50 with the database digest, holder-neutral wording, and no owner tuple digest, raw path, stack, or lease error

#### Scenario: Unconverted stateful command is unsupported while leased
- **WHEN** a daemon owns the command's canonical database lease
- **THEN** the direct command reports the bounded database-lease conflict through exit 50 before database open

#### Scenario: Shutdown observation times out
- **WHEN** shutdown remains stopping because an active request has not settled by the deadline
- **THEN** the CLI reports structured shutdown timeout through exit 50 without reporting completion

#### Scenario: Nested sync failure remains safe
- **WHEN** one Source fails during a multi-Source RPC sync
- **THEN** its failure contains only bounded code/message plus the separately bounded sync diagnostics and contains no Error identity, cause, stack, or raw diagnostics object

#### Scenario: Daemon-routed operation is cancelled
- **WHEN** cancellation interrupts an outstanding daemon-routed operation
- **THEN** the cancellation propagates across the local RPC boundary and the CLI exits 130 rather than remapping it as daemon unavailability or another transport failure
