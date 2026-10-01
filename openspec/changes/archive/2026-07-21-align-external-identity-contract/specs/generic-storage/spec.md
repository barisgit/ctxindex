## MODIFIED Requirements

### Requirement: Identifier generation
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

All opaque ctxindex-owned primary keys MUST be ULIDs (Crockford base32, 26 characters, time-ordered). This covers `resources.id`, `sync_runs.id`, `sync_run_checkpoints.id`, `accounts.id`, `account_identities.id`, `sources.id`, `grants.id`, `artifacts.id`, and equivalents. A Realm with a human slug SHALL use that slug as `realms.id`; a Realm without one MUST use a ULID.

Provider identifiers MUST NOT serve as core primary keys. They MAY appear in Source-scoped Resource Refs, Resource envelope metadata, or typed Profile fields projected into field-index rows. Core MUST NOT require a separate external-reference table.

ULIDs MUST be generated client-side from a single library helper. SQL-generated ids MUST NOT be used.

#### Scenario: Core and provider identifiers remain separate
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings
