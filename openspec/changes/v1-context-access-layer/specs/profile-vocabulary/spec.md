## ADDED Requirements

### Requirement: Public definition factories and validated registries
For V1, the system SHALL expose `defineProfile`, `defineAdapter`, and `defineExtension` as public factories for plain versioned definitions, and SHALL build runtime-validated registries in accordance with SPEC §3a and §3d. Registry binding MUST use `(id, version)` rather than object identity, and duplicate or invalid definitions MUST be rejected before activation.

#### Scenario: Valid bundled and external definitions use one contract
- **WHEN** equivalent valid definitions are supplied by a bundled Extension and by a trusted external Extension
- **THEN** the system activates both through the same public factory and registry contracts

#### Scenario: Invalid definition is rejected
- **WHEN** a definition fails its runtime schema or duplicates an active `(id, version)`
- **THEN** the system rejects it before the definition becomes available to operations

### Requirement: Profiles own pure domain vocabulary
For V1, Profile definitions SHALL provide the schema-backed domain vocabulary described in SPEC §3a, including the slots needed by the proving verticals for search extraction, typed fields, Relations, Artifact descriptors, exports, Actions, aliases, and documentation. Core MUST NOT add provider- or domain-specific vocabulary paths, and ordinary vocabulary functions MUST remain pure over validated payloads.

#### Scenario: Fake Profile drives generic behavior
- **WHEN** a Resource using a valid fake Profile is stored and queried
- **THEN** its search fields, chunks, Relations, and documented affordances are derived from that Profile without domain-specific core code

#### Scenario: Unknown Profile version degrades safely
- **WHEN** an Adapter emits a Resource whose Profile id or version is not loaded
- **THEN** core accepts and indexes the envelope, emits a warning, and does not fail the operation

### Requirement: Registry-derived interface and documentation
For V1, valid kinds and aliases, typed field filters, export formats, Source configuration, Actions, CLI affordances, and generated agent documentation SHALL derive from loaded registries as required by SPEC §3d and §10b. Parallel hand-maintained declarations of the same command vocabulary MUST NOT exist.

#### Scenario: Loaded definition changes the described interface
- **WHEN** an Extension declaring a kind, field, format, Source option, or Action is activated
- **THEN** `describe`, CLI validation/help, and generated agent documentation expose that declaration from registry data

#### Scenario: Required input remains non-interactive
- **WHEN** a registry-derived command requires input
- **THEN** the command accepts that input through arguments, environment variables, or declared stdin and does not require a TTY prompt
