# Error Taxonomy Specification

## Purpose
Define typed Adapter failures, persisted sync status mappings, and the stable user-visible CLI exit-code API.
## Requirements
### Requirement: Typed sync errors and stable CLI exits
Adapters MUST surface failure as a typed `CtxindexSyncError` (or subclass) carrying one of the following codes. The sync runner is the only component that translates these into persisted `sync_runs.status` and `source_sync_state.last_status`.

```text
CtxindexSyncError codes
  auth_expired             refresh token still valid; access token expired and refresh failed
  auth_revoked             refresh token rejected; user must re-authorize
  rate_limited             provider rate or quota limit, with retryAfterMs when known
  network                  DNS/TCP/TLS failure or timeout
  provider_unavailable     5xx from provider
  provider_bad_response    response parse / Zod-validation failure
  provider_quota           account quota exhausted
  not_found                resource referenced by cursor no longer exists
  permission_denied        403 / scope mismatch from provider
  cancelled                aborted by SIGINT, SIGTERM, or explicit cancel
  unknown                  fallback; MUST include cause for diagnostics
```

Adapters MAY also yield non-fatal warning ops that increment `sync_runs.errors_count` and append to `error_summary` without aborting the run.

Mapping rules remain normative:

- `sync_runs.status` = `completed` only when the iterator completes without throwing.
- `sync_runs.status` = `cancelled` when the cause was `cancelled`.
- `sync_runs.status` = `failed` for every other code.
- `source_sync_state.last_status` = `needs_auth` for `auth_expired | auth_revoked`.
- `source_sync_state.last_status` = `idle` after a `completed` run.
- `source_sync_state.last_status` = `failed` for every other terminal error.
- `source_sync_state.last_status` = `disabled` is set only by the CLI, never by the runner.

User-visible stable exits remain: `0` success, `2` invalid usage, `10` `needs_auth`, `20` rate-limited, `30` network/provider or external acquisition failure, `40` permission denied, `50` other sync, validation, conflict, or internal auth failure, and `130` cancelled by SIGINT. OAuth App, Account, and Source label collisions MUST exit `2`, name the taken label, make no change, and MUST NOT prompt, normalize, automatically suffix, or choose a winner.

The public/internal authentication error code `missing_oauth_client_creds` MUST be removed and replaced by `missing_oauth_app_config`. No alias SHALL remain. `missing_oauth_app_config` MUST retain the removed code's stable `50` exit mapping when authorization or refresh discovers absent or corrupt persisted App or Grant-snapshot configuration.

Unknown Provider or App selection, omitted required `account add --app`, and invalid or missing `oauth-app add --from-env` config are invalid usage and MUST exit `2` with actionable OAuth App guidance. Unknown selection MUST fail before environment/secret reads, database mutation, browser launch, or Provider egress. Missing or invalid assembled config MUST fail before secret-store writes, database mutation, browser launch, or Provider egress. These add-time validation failures MUST NOT use `missing_oauth_app_config` because no persisted authorization state was expected yet.

Direct Extension lifecycle failures MUST use these stable public codes and exits:

```text
extension_target_invalid       2   source kind, target syntax, selector, or already-installed/not-installed lifecycle usage is invalid
extension_trust_required       2   acquisition or import was requested without an explicit install/update trust grant
extension_removal_blocked      2   dependent Sources forbid non-forced uninstall
extension_acquisition_failed  30   package-manager, registry, Git, local-read, or dependency materialization failed
extension_validation_failed   50   manifest, collection, exact selection, integrity, or definition validation failed
extension_conflict            50   complete candidate-registry identity/conflict validation failed
```

Every direct lifecycle failure MUST identify its stage with sanitized provenance, MUST NOT expose embedded or ambient credentials, and MUST leave prior direct records, materializations, active definitions, Sources, and Source-owned data unchanged. Parser-level target/selector failures MUST occur before package-manager, filesystem acquisition, import, or persistence effects. `extension_trust_required` MUST occur before acquisition or import. `extension_removal_blocked` MUST list blocking Sources and MUST occur before installation mutation. Acquisition, validation, and conflict failures MUST discard staged candidates without replacing a prior valid installation.

#### Scenario: Missing persisted App snapshot uses renamed error
- **WHEN** authorization or refresh requires persisted App config that is absent or corrupt
- **THEN** core reports `missing_oauth_app_config`, CLI exits `50`, and no `missing_oauth_client_creds` alias is emitted

#### Scenario: Unknown App selection is invalid usage
- **WHEN** `account add google --app absent` selects no available App
- **THEN** CLI exits `2` before secret/database/browser/network effects with exact App guidance

#### Scenario: Missing environment config is invalid usage
- **WHEN** `oauth-app add google work --from-env` cannot assemble a valid Provider config
- **THEN** CLI exits `2` before secret-store writes, database mutation, browser launch, or Provider egress

#### Scenario: Invalid direct target is effect-free usage failure
- **WHEN** a direct install target or exact Extension selector is syntactically invalid
- **THEN** core reports `extension_target_invalid`, CLI exits `2`, and no acquisition, import, materialization, or record write occurs

#### Scenario: Package acquisition fails atomically
- **WHEN** package-manager resolution or materialization fails during install or update
- **THEN** core reports `extension_acquisition_failed`, CLI exits `30`, and any prior installation remains unchanged

#### Scenario: Candidate conflict preserves active state
- **WHEN** a materialized direct candidate conflicts with the complete active registry
- **THEN** core reports `extension_conflict`, CLI exits `50`, and staged state is discarded without choosing a winner

#### Scenario: Dependent Sources block normal removal
- **WHEN** uninstall without force would make configured Sources unavailable
- **THEN** core reports `extension_removal_blocked`, CLI exits `2`, and the blocking Sources plus installation remain unchanged

#### Scenario: Typed sync mapping remains stable
- **WHEN** a typed sync failure reaches the runner and CLI
- **THEN** persisted status and exit mapping remain unchanged by direct Extension installation

### Requirement: Storage contention normalization
Exhaustion of the configured SQLite write-contention bound SHALL surface as error code `storage_busy` with an actionable retry diagnostic at database setup, schema migration, and Resource batch boundaries. Raw `SQLITE_BUSY`, `SQLITE_LOCKED`, and database-lock messages MUST NOT cross those normalized boundaries. A terminal `storage_busy` error SHALL use the existing exit `50`, while optional remote-search cache exhaustion SHALL use a warning and successful exit `0`. If cancellation is signalled, the operation's existing cancellation outcome SHALL take precedence over `storage_busy`.

#### Scenario: Terminal contention uses the existing failure exit
- **WHEN** a required storage operation exhausts the write-contention bound without cancellation
- **THEN** the CLI reports `storage_busy` through exit 50 with an actionable retry diagnostic

#### Scenario: Raw SQLite contention is hidden
- **WHEN** SQLite reports busy or locked during database setup, schema migration, or Resource batch acquisition
- **THEN** user-visible errors and warnings identify `storage_busy` without raw SQLite error codes or database-lock text

#### Scenario: Cancelled contention retains cancellation taxonomy
- **WHEN** cancellation is signalled while a storage operation is contended and the operation returns control
- **THEN** the operation retains its existing cancellation result rather than reporting `storage_busy`

### Requirement: Structured failures cross the local RPC boundary
The local RPC boundary MUST transport structured domain and transport errors as declared typed oRPC errors without reducing them to message strings or embedding them in a success/failure result envelope. Each declared error's data MUST be exactly one strict bounded `RpcFailure` variant and its outer oRPC message MUST be constant rather than copied from dynamic diagnostics. Structured safe failures MUST distinguish daemon unavailability, protocol incompatibility, runtime identity mismatch, database lease conflict, prototype-unsupported, shutdown timeout, cancellation, result-too-large, and bounded ctxindex failures. They MUST include only bounded actionable public fields and MUST NOT include `Error`, `cause`, `stack`, raw diagnostics, raw paths, socket/OS errors, provider bodies, or secrets. Nested per-Source sync failures MUST use the bounded safe projection rather than serialized errors. Unknown client link or protocol exceptions MUST become daemon-unavailable.

One authoritative registry MUST pair every failure kind with its exact strict schema and constant outer message. Registry construction MUST derive each schema's literal failure kind from its registry key so a mismatched key/kind cannot compile. The declared oRPC error code MUST be that failure kind. The `RpcFailure` union/schema, router construction, and client code/data/message validation MUST derive from this registry and MUST NOT maintain aliases or parallel handwritten kind/code switches.

A database-lease conflict MUST include the canonical database digest and MUST NOT include or report an owner tuple digest. Its public diagnostic MUST describe another local process/runtime rather than attributing the holder to a daemon.

Daemon unavailability, protocol incompatibility, runtime identity mismatch, database lease conflict, prototype-unsupported, and shutdown timeout MUST map to exit `50`; cancellation MUST retain `130`; locally detectable invalid usage MUST retain `2` and fail before transport. Numeric exits are added only by the CLI and are not fields in RPC DTOs.

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
- **THEN** the unconverted command reports prototype-unsupported through exit 50 before database open

#### Scenario: Shutdown observation times out
- **WHEN** shutdown remains stopping because an active request has not settled by the deadline
- **THEN** the CLI reports structured shutdown timeout through exit 50 without reporting completion

#### Scenario: Nested sync failure remains safe
- **WHEN** one Source fails during a multi-Source RPC sync
- **THEN** its failure contains only bounded code/message plus the separately bounded sync diagnostics and contains no Error identity, cause, stack, or raw diagnostics object

#### Scenario: Daemon-routed operation is cancelled
- **WHEN** cancellation interrupts an outstanding daemon-routed operation
- **THEN** the cancellation propagates across the local RPC boundary and the CLI exits 130 rather than remapping it as daemon unavailability or another transport failure

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
