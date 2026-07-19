## ADDED Requirements

### Requirement: Durable commands require explicit initialization
Commands that open or mutate ctxindex's database-backed durable state MUST require a successfully persisted initialization marker and MUST fail with deterministic guidance to run `bun cli init` when that marker is absent. The rejected path MUST NOT create config, database, secret-store, or Keychain state and MUST NOT read declared credential environment values. Initialization, help, argument validation, and pure definition-discovery surfaces SHALL remain available before initialization.

#### Scenario: Agent adds a Client before initialization
- **WHEN** an agent runs `client add <provider> --from-env` with declared credential environments but no persisted initialization marker
- **THEN** the command exits 2 with guidance to run `bun cli init`, does not expose or persist credentials, and creates no durable ctxindex state

#### Scenario: Agent opens another database-backed command before initialization
- **WHEN** an agent runs a syntactically valid database-backed command without a persisted initialization marker
- **THEN** the command exits 2 with the same initialization guidance before opening SQLite

#### Scenario: Agent requests help before initialization
- **WHEN** an agent requests command help or runs `bun cli init` without a persisted initialization marker
- **THEN** help remains available and initialization performs its existing backend-selection and database-bootstrap sequence
