# Secret Backend Operations Specification

## Purpose
Define safe secret backend inspection, crash-safe backend switching, explicit runtime selection, and non-argument secret input.

## Requirements

### Requirement: Secret backend status is safe and explicit
The system SHALL expose the configured secret backend, its availability, and aggregate referenced-secret counts through readable and deterministic JSON output. Status output, diagnostics, and logs MUST NOT include secret values, secret keys, credentials, authorization headers, or refresh/access tokens.

#### Scenario: Agent inspects secret storage
- **WHEN** an agent runs `secrets status --json`
- **THEN** the command returns the configured backend, availability, and aggregate counts without opening or rendering any secret value

#### Scenario: Unavailable backend is reported without fallback
- **WHEN** the configured backend cannot be opened
- **THEN** status identifies it as unavailable and no alternative backend becomes active implicitly

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
The CLI MUST NOT accept a secret-store passphrase, refresh token, access token, or OAuth client secret as a literal command argument. OAuth client credentials SHALL be read from the provider's declared environment names only during `client add --from-env`, then persisted through typed secret references; authorization and refresh MUST NOT read them from the environment. Other secret inputs SHALL resolve through the central environment/typed-secret mechanism or an explicitly prepared private key file, and help text MUST identify the safe input path without echoing values.

#### Scenario: Legacy passphrase option is rejected
- **WHEN** a caller supplies `secrets backend set file --passphrase <value>`
- **THEN** parsing fails before dependencies open and the value is not logged

#### Scenario: File backend uses prepared key material
- **WHEN** the caller explicitly selects file storage with supported environment or private key-file material
- **THEN** the encrypted file backend becomes usable without a passphrase appearing in argv
