# Profile Vocabulary Specification

## Purpose
Define the public Profile, Adapter, and Extension vocabulary contracts and require user and agent interfaces to derive from loaded definitions.
## Requirements
### Requirement: Public definition factories and validated registries
For V1, the system SHALL expose `defineProfile`, `defineAdapter`, and `defineExtension` as public factories for plain versioned definitions, and SHALL build runtime-validated Profile and [Extension](../extension-loading/spec.md) registries. Registry binding MUST use `(id, version)` rather than object identity, and duplicate or invalid definitions MUST be rejected before activation.

#### Scenario: Valid bundled and external definitions use one contract
- **WHEN** equivalent valid definitions are supplied by a bundled Extension and by a trusted external Extension
- **THEN** the system activates both through the same public factory and registry contracts

#### Scenario: Invalid definition is rejected
- **WHEN** a definition fails its runtime schema or duplicates an active `(id, version)`
- **THEN** the system rejects it before the definition becomes available to operations

### Requirement: Profiles own pure domain vocabulary
For V1, Profile definitions SHALL provide schema-backed domain vocabulary, including the slots needed for search extraction, typed fields, Relations, Artifact descriptors, exports, Actions, aliases, and documentation. The bundled vocabulary SHALL include strict provider-neutral `communication.message@1`, `calendar.event@1`, and `file@1` Profiles. Core MUST NOT add provider- or domain-specific vocabulary paths, and ordinary vocabulary functions MUST remain pure over validated payloads.

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
For V1, valid kinds and aliases, typed field filters, export formats, Source configuration, Actions, CLI affordances, and generated agent documentation SHALL derive from loaded registries as required by [Extension loading](../extension-loading/spec.md) and [the CLI surface](../cli-surface/spec.md). Parallel hand-maintained declarations of the same command vocabulary MUST NOT exist. Generic Citty help MUST remain concise and SHALL point agents to registry discovery rather than append the complete loaded interface. Registry discovery SHALL use compact list output by default, full readable detail for an exact definition id, and an explicit full-snapshot option. JSON detail and full-snapshot output MUST retain exact registry schemas, while text and Markdown detail MUST render Action input properties, requiredness, constraints, bindings, and examples structurally rather than as a single serialized schema line.

#### Scenario: Loaded definition changes the described interface
- **WHEN** an Extension declaring a kind, field, format, Source option, or Action is activated
- **THEN** compact `describe` indexes, exact-id detail, CLI validation, and generated agent documentation expose that declaration from registry data

#### Scenario: Agent progressively discovers one definition
- **WHEN** an agent runs bare `describe`, selector-only `describe`, and then exact-id `describe`
- **THEN** the system returns a compact grouped index, a compact selected list, and one full readable definition respectively

#### Scenario: Agent requests exact machine schemas
- **WHEN** an agent requests exact-id JSON or explicitly requests `describe --full --format json`
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

### Requirement: Complete Profile vocabulary contract
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

A profile declares, at minimum: an id, an integer version, and a payload schema. It MAY declare vocabulary slots:

- **search mapping** — pure extractors for title, occurred-at, and FTS chunks;
- **fields** — TYPED declarations (`type` + pure extractor) that populate the generic field index and define valid `--field` filters and aggregations;
- **relations** — pure extractors producing edges to refs or natural keys ([Resource identity, deletion, and Relations](../core-model/spec.md));
- **artifacts** — pure extractor producing artifact descriptors (bytes fetched lazily);
- **exports** — a map of format name to media type + render function;
- **actions** — typed provider-mutation contracts (stable id, input schema, output contract, effect classification, docs, and examples) whose I/O implementations belong to adapters;
- **docs** — human summaries, kind aliases, and examples, from which agent-facing documentation is derived.

Vocabulary rules (normative):

1. Vocabulary functions MUST be pure over the validated payload; no I/O. The one exception is export render functions, which MAY receive core-resolved declared dependencies (e.g. related resources by relation type). Action declarations are pure contracts; their provider I/O is never a profile vocabulary function.
2. Vocabulary slots are versioned. An implementation encountering an unknown slot MUST ignore it with a diagnostic and continue.
3. When an adapter emits a payload for an unknown profile id or version, core MUST accept the resource at envelope level, index what the envelope carries, and surface a warning (degraded acceptance). Sync MUST NOT fail on unknown profiles.
4. The V1 bundled canonical Profiles MUST be `communication.message@1`, `calendar.event@1`, and `file@1`. Bundled and extension-defined Profiles MUST be expressible through the same public Profile API; V1 MUST NOT require an `artifact` Profile because Artifacts are represented by Profile-extracted descriptors.

#### Scenario: A Profile supplies domain semantics through pure versioned vocabulary
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

#### Scenario: An Extension defines another domain
- **WHEN** a trusted external Extension supplies a valid Profile outside the V1 bundled inventory
- **THEN** the system activates it through the same public Profile API without requiring that domain to be predeclared as bundled vocabulary
