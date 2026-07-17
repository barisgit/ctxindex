# Profile Vocabulary Specification

## Purpose
Define the public Profile, Adapter, and Extension vocabulary contracts and require user and agent interfaces to derive from loaded definitions.
## Requirements
### Requirement: Public definition factories and validated registries
For V1, the system SHALL expose `defineProfile`, `defineAdapter`, and `defineExtension` as public factories for plain versioned definitions, and SHALL build runtime-validated registries in accordance with SPEC §3a and §3d. Registry binding MUST use `(id, version)` rather than object identity, and duplicate or invalid definitions MUST be rejected before activation.

#### Scenario: Valid bundled and external definitions use one contract
- **WHEN** equivalent valid definitions are supplied by a bundled Extension and by a trusted external Extension
- **THEN** the system activates both through the same public factory and registry contracts

#### Scenario: Invalid definition is rejected
- **WHEN** a definition fails its runtime schema or duplicates an active `(id, version)`
- **THEN** the system rejects it before the definition becomes available to operations

### Requirement: Profiles own pure domain vocabulary
For V1, Profile definitions SHALL provide the schema-backed domain vocabulary described in SPEC §3a, including the slots needed for search extraction, typed fields, Relations, Artifact descriptors, exports, Actions, aliases, and documentation. The bundled vocabulary SHALL include strict provider-neutral `communication.message@1`, `file@1`, and `calendar.event@1` Profiles. Core MUST NOT add provider- or domain-specific vocabulary paths, and ordinary vocabulary functions MUST remain pure over validated payloads.

#### Scenario: Fake Profile drives generic behavior
- **WHEN** a Resource using a valid fake Profile is stored and queried
- **THEN** its search fields, chunks, Relations, and documented affordances are derived from that Profile without domain-specific core code

#### Scenario: Calendar Profile drives two providers
- **WHEN** Google and Microsoft calendar Adapters emit valid `calendar.event@1` payloads
- **THEN** identical Profile-owned fields, chunks, Relations, aliases, and documentation drive generic storage/search/get for both

#### Scenario: Unknown Profile version degrades safely
- **WHEN** an Adapter emits a Resource whose Profile id or version is not loaded
- **THEN** core accepts and indexes the envelope, emits a warning, and does not fail the operation

### Requirement: Registry-derived interface and documentation
For V1, valid kinds and aliases, typed field filters, export formats, Source configuration, Actions, CLI affordances, and generated agent documentation SHALL derive from loaded registries as required by SPEC §3d and §10b. Parallel hand-maintained declarations of the same command vocabulary MUST NOT exist. Generic Citty help MUST remain concise and SHALL point agents to registry discovery rather than append the complete loaded interface. Registry discovery SHALL use compact list output by default, full readable detail for an exact definition id, and an explicit full-snapshot option. JSON detail and full-snapshot output MUST retain exact registry schemas, while text and Markdown detail MUST render Action input properties, requiredness, constraints, bindings, and examples structurally rather than as a single serialized schema line.

#### Scenario: Loaded definition changes the described interface
- **WHEN** an Extension declaring a kind, field, format, Source option, or Action is activated
- **THEN** compact `describe` indexes, exact-id detail, CLI validation, and generated agent documentation expose that declaration from registry data

#### Scenario: Agent progressively discovers one definition
- **WHEN** an agent runs bare `describe`, selector-only `describe`, and then exact-id `describe`
- **THEN** the system returns a compact grouped index, a compact selected list, and one full readable definition respectively

#### Scenario: Agent requests exact machine schemas
- **WHEN** an agent requests exact-id JSON or explicitly requests `describe --full --json`
- **THEN** the system returns lossless deterministic registry schema data with cardinality matching the query

#### Scenario: Help remains concise and discoverable
- **WHEN** root or command help is rendered
- **THEN** Citty help includes a short registry-discovery pointer and does not append the complete loaded registry

#### Scenario: Action detail is readable without losing constraints
- **WHEN** text or Markdown detail renders an Action with an object input schema
- **THEN** each input property, type, requiredness, relevant constraints, additional-property policy, binding, and example is presented structurally while exact JSON remains available separately

#### Scenario: Required input remains non-interactive
- **WHEN** a registry-derived command requires input
- **THEN** the command accepts that input through arguments, environment variables, or declared stdin and does not require a TTY prompt

