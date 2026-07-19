## ADDED Requirements

### Requirement: Durable commands require explicit initialization
Commands that open or mutate ctxindex's database-backed durable state MUST require durable evidence that both backend selection and database bootstrap completed, and MUST fail with the deterministic guidance `ctxindex is not initialized; run bun cli init` when either is absent. The rejected path MUST NOT create config, database, secret-store, or Keychain state and MUST NOT read declared credential environment values. Initialization, help, argument validation, provider validation, and pure definition-discovery surfaces SHALL remain available before initialization.

#### Scenario: Agent adds a Client before initialization
- **WHEN** an agent runs `client add <provider> --from-env` with declared credential environments but without completed initialization evidence
- **THEN** the command exits 2 with guidance to run `bun cli init`, does not expose or persist credentials, and creates no durable ctxindex state

#### Scenario: Backend selection persisted but database bootstrap did not complete
- **WHEN** configuration exists but the initialized database does not
- **THEN** a database-backed command exits 2 with initialization guidance before reading credentials, opening SQLite, or creating the missing database

#### Scenario: Agent opens another database-backed command before initialization
- **WHEN** an agent runs a syntactically valid database-backed command without completed initialization evidence
- **THEN** the command exits 2 with the same initialization guidance before opening SQLite

#### Scenario: Agent requests help or validates a provider before initialization
- **WHEN** an agent requests command help, validates a provider identifier, or runs `bun cli init` without completed initialization evidence
- **THEN** help and provider validation remain available, and initialization performs its existing backend-selection and database-bootstrap sequence
