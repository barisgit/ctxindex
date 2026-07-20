## MODIFIED Requirements

### Requirement: Secret backend status is safe and explicit
The system SHALL expose the configured secret backend, availability, and aggregate referenced-secret counts through deterministic JSON output. Aggregate counts MUST include local OAuth App config references, private Grant App-snapshot references, and token references without distinguishing or exposing secret values. Status, diagnostics, logs, and OAuth App inventory MUST NOT include secret values, config values, config keys, environment values, credentials, authorization headers, tokens, client ids, desktop-secret metadata, or typed secret references.

#### Scenario: Agent inspects storage containing Apps and Grants
- **WHEN** an agent runs `secrets status --json` while local Apps and authorized Accounts exist
- **THEN** output reports only backend status and aggregate counts without opening or rendering App config or Grant snapshot values

#### Scenario: Unavailable backend has no fallback
- **WHEN** the configured backend cannot be opened
- **THEN** status identifies it as unavailable and no alternate backend becomes active implicitly

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
