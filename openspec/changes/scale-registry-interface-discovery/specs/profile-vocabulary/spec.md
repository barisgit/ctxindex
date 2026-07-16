## MODIFIED Requirements

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
