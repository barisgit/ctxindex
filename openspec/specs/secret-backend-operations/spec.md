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

### Requirement: Secret storage and typed references
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

ctxindex MUST store OAuth tokens, API keys, and other secrets outside SQLite by default, using the OS keychain where available.

SQLite and declarative config MUST store secret references, not raw secrets.

An encrypted local secret-store fallback MAY exist for environments without a usable OS keychain.

The configured backend MUST be the only destination for new secret writes. Runtime MUST NOT silently fall back to another backend when it is unavailable. Reads and deletes MUST resolve an existing secret according to its typed reference so an interrupted explicit backend move cannot strand mixed references.

An explicit backend move MUST copy and validate target entries before changing durable references or configured backend, retain source entries until the target is selected durably, and be safely retryable after interruption. Secret values, keys, access/refresh tokens, client secrets, and encryption passphrases MUST NOT appear in command output, logs, or literal process arguments.

Secret references in declarative config (TOML or otherwise) MUST be one of the following typed URI forms:

- `keychain:<service>/<account>/<key>` — OS keychain entry.
- `file:<absolute-or-config-relative-path>#<key>` — entry inside an encrypted secrets file.
- `env:<VAR_NAME>` or `env://<VAR_NAME>` — environment variable, resolved through the central env loader (no direct `process.env` reads outside the loader). The variable name MUST match `^[A-Z_][A-Z0-9_]*$`.

A bare secret string in config (no URI scheme) MUST be rejected at config-load time with an actionable error.

#### Scenario: Secrets stay outside SQLite and resolve through typed references
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings
