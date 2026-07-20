## ADDED Requirements

### Requirement: Action execution uses the daemon-owned active registry
Action description and invocation MUST resolve Profiles, Source Adapters, Sources, Accounts, and Grants through the daemon-owned immutable registry and runtime. The CLI MUST retain local input parsing and output formatting but MUST NOT compose provider behavior or open SQLite.

#### Scenario: Agent invokes a reversible Draft Action
- **WHEN** an agent runs a valid Action against an exact Source
- **THEN** the daemon validates and invokes the registered implementation once and returns the same bounded Resource result and stable CLI behavior
