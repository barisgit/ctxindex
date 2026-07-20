# Secret Backend Operations Specification

## Purpose
Define safe secret backend inspection, crash-safe backend switching, explicit runtime selection, and non-argument secret input.

## Requirements

### Requirement: Secret backend status is safe and explicit
The system SHALL expose the configured secret backend, availability, and aggregate referenced-secret counts through deterministic JSON output. Aggregate counts MUST include local OAuth App config references, private Grant App-snapshot references, and token references without distinguishing or exposing secret values. Status, diagnostics, logs, and OAuth App inventory MUST NOT include secret values, config values, config keys, environment values, credentials, authorization headers, tokens, client ids, desktop-secret metadata, or typed secret references.

#### Scenario: Agent inspects storage containing Apps and Grants
- **WHEN** an agent runs `secrets status --json` while local Apps and authorized Accounts exist
- **THEN** output reports only backend status and aggregate counts without opening or rendering App config or Grant snapshot values

#### Scenario: Unavailable backend has no fallback
- **WHEN** the configured backend cannot be opened
- **THEN** status identifies it as unavailable and no alternate backend becomes active implicitly

### Requirement: Backend selection moves secrets crash-safely
`secrets backend set <keychain|file>` SHALL validate target key material and availability, copy secret entries before changing references, preserve source copies until all durable references and configuration select the target, and be idempotently resumable after interruption. The configured backend MUST change only after target copies are usable. Mixed typed references left by an interrupted operation MUST remain resolvable by their own URI backend until the operation is completed.

#### Scenario: Successful backend switch
- **WHEN** all referenced and namespaced secrets can be copied to an available target backend
- **THEN** references and configuration select the target, source entries are cleaned after commit, and provider authentication remains usable

#### Scenario: Target write fails
- **WHEN** any target secret cannot be stored before reference switching
- **THEN** the command fails without changing configured backend or durable references and the source secrets remain usable

#### Scenario: Interruption is retried
- **WHEN** a previous switch stopped after target copies or reference updates
- **THEN** rerunning the same command converges on one configured target without losing access to any referenced secret

### Requirement: Runtime never silently changes secret backend
Secret reads SHALL route by typed secret reference, while new writes SHALL use exactly the persisted configured backend. If that backend is unavailable, auth and provider operations MUST fail with an actionable authentication/backend error rather than writing to another backend.

#### Scenario: Keychain becomes unavailable
- **WHEN** configuration selects Keychain and Keychain cannot be opened
- **THEN** an attempted credential write fails and creates no encrypted-file secret or contradictory configuration

### Requirement: Long-lived secret input avoids process arguments
The CLI MUST NOT accept a secret-store passphrase, refresh token, access token, OAuth App config value, client id, client secret, authorization code, or generic App-config JSON as a literal argument.

Only `oauth-app add <provider> <label> --from-env` MAY import local BYOA App config from the process environment. It SHALL resolve the active Provider before environment access, use the Provider OAuth registration's typed top-level config-key-to-environment-name mapping, read through the central environment loader, assemble the config by key, and validate the complete config schema before persistence. Unknown Provider selection SHALL fail before environment/secret reads. Missing or invalid values SHALL fail before secret-store writes, database mutation, browser launch, or Provider egress. Successful import SHALL persist values through typed secret references and SHALL clean every new reference if metadata persistence fails.

Account authorization SHALL read the selected active Extension App or persisted local App, then copy the exact config into Grant-owned secret references. Authorization and refresh MUST NOT consult Provider environment mappings or reread App config from environment variables. Other secret input SHALL use the central environment/typed-secret mechanism or an explicitly prepared private key file, and help MUST identify safe input paths without echoing values.

#### Scenario: Local BYOA reads environment once
- **WHEN** `oauth-app add google work --from-env` succeeds
- **THEN** later authorization and refresh use persisted App/Grant references even if the mapped environment variables change or disappear

#### Scenario: Literal App config is rejected
- **WHEN** a caller supplies a client-id, client-secret, config JSON, or secret flag to `oauth-app add`
- **THEN** parsing exits `2` before dependencies open and the supplied value is not logged

#### Scenario: Legacy passphrase option is rejected
- **WHEN** a caller supplies `secrets backend set file --passphrase <value>`
- **THEN** parsing fails before dependencies open and the value is not logged

#### Scenario: File backend uses prepared key material
- **WHEN** file storage is selected with supported environment or private key-file material
- **THEN** it becomes usable without a passphrase appearing in argv

### Requirement: Secret storage and typed references
ctxindex MUST store OAuth App configuration, OAuth tokens, and other secrets outside SQLite by default, using the configured OS keychain where available. SQLite and declarative config MUST store typed secret references, not raw values. An encrypted local store MAY exist where no keychain is usable.

Local BYOA App records MUST contain typed references for App config values. Each private Grant MUST own typed references for its exact App-config snapshot and token state. Removing a local or Extension App MUST NOT remove Grant-owned snapshots. Reauthorization MUST write and verify replacement snapshot references before durably swapping them and cleaning superseded references.

The configured backend MUST be the only destination for new writes. Reads/deletes MUST route by each typed reference. Backend status, copy/verify switching, cleanup, and orphan traversal MUST include local App config references, Grant snapshot references, and token references. A move MUST copy and validate all target entries before changing durable references or configured backend, retain sources until durable commit, and resume safely after interruption.

Secret values, config values, keys, tokens, client secrets, and encryption passphrases MUST NOT appear in output, logs, inventory, or literal process arguments.

Secret references in declarative config MUST use one of these typed URI forms:

- `keychain:<service>/<account>/<key>` — OS keychain entry.
- `file:<absolute-or-config-relative-path>#<key>` — encrypted secrets-file entry.
- `env:<VAR_NAME>` or `env://<VAR_NAME>` — environment variable resolved only through the central loader, where the name matches `^[A-Z_][A-Z0-9_]*$`.

A bare secret string in declarative config MUST reject at config-load time with an actionable error.

#### Scenario: Backend switch includes App and Grant state
- **WHEN** an operator switches backends with local Apps and authorized Accounts
- **THEN** every App config, Grant snapshot, and token reference copies and verifies before old references are cleaned

#### Scenario: Removed App does not strand refresh
- **WHEN** an OAuth App is removed after authorization
- **THEN** its Account refreshes from Grant-owned references without App inventory or environment access

### Requirement: Keychain inventory mutations are process-consistent
Within one ctxindex process, Keychain-backed secret writes, deletes, and inventory reads MUST observe one serialized inventory mutation order across all backend instances. Every successful write MUST appear exactly once in inventory, every successful delete MUST be absent, and concurrent successful mutations MUST NOT overwrite one another.

A write whose inventory publication fails MUST fail before reporting or returning a usable new reference. If credential persistence fails after inventory publication, the operation MUST attempt to restore the prior inventory and MUST fail with the existing bounded backend error. A delete whose credential or inventory mutation fails MUST fail without being reported as complete. Failed compensation MAY leave a stale discoverable inventory entry but MUST NOT expose secret values or references in diagnostics.

The Keychain availability probe MUST use one stable reserved credential identity, MUST attempt deletion after every successful probe write even when the read fails, and MUST report read or cleanup failure as the existing bounded backend-unavailable error. A later probe MUST retry through the same identity rather than create another uniquely named probe credential.

#### Scenario: Concurrent writes preserve both entries
- **WHEN** two Keychain secrets are written concurrently through separate backend instances in one process
- **THEN** both successful references appear exactly once in deterministic inventory

#### Scenario: Inventory publication fails before credential write
- **WHEN** the reserved Keychain inventory cannot record a new entry
- **THEN** the write fails through the existing secret-backend error mapping and no untracked credential is reported as successful

#### Scenario: Credential write fails after inventory publication
- **WHEN** the credential value cannot be persisted after its intended inventory entry is published
- **THEN** ctxindex attempts to restore the previous inventory, reports the existing bounded backend failure, and reveals no secret material

#### Scenario: Probe read or cleanup fails
- **WHEN** the Keychain probe writes its reserved credential but reading or deleting it fails
- **THEN** ctxindex attempts cleanup, reports the bounded backend-unavailable error, and the next probe retries the same credential identity without accumulating probe rows

### Requirement: Authentication cleanup failures are explicit and redacted
Authentication lifecycle cleanup MUST count failures instead of silently discarding them. Cleanup failure before an operation's durable commit MUST preserve the operation's original failure. Cleanup failure after a durable Grant replacement, token refresh, or Account removal MUST NOT roll back usable committed state or change the existing public result and exit mapping; it MUST emit one bounded structured warning containing a failure count and safe lifecycle context only.

Warnings and errors MUST NOT contain secret values, OAuth App config keys or values, tokens, typed secret references, or Keychain credential keys.

#### Scenario: Reauthorization cleanup remains pending
- **WHEN** replacement Grant references commit and one or more superseded Keychain entries cannot be deleted
- **THEN** reauthorization succeeds with the replacement Grant and emits one redacted cleanup-pending warning with the failure count

#### Scenario: Refresh cleanup remains pending
- **WHEN** refreshed token references commit and deletion of a superseded token fails
- **THEN** refresh returns the new usable token and emits one redacted cleanup-pending warning without changing its exit behavior

#### Scenario: Rollback cleanup also fails
- **WHEN** a pre-commit authorization or refresh failure is followed by failure to clean newly written temporary entries
- **THEN** the original failure remains authoritative and a separate bounded warning reports only the cleanup failure count
