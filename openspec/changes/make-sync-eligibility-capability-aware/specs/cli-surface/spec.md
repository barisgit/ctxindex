## ADDED Requirements

### Requirement: Deterministic sync selection output
`sync --format json` MUST emit one document containing `mode`, `results`, `skipped`, and `warnings`, where `skipped` is the ordered list of `{ "sourceId", "reason" }` entries reported by sync selection. Summary output MUST render one `<sourceId>\tskipped\treason=<reason>` line per skipped Source, and compact output MUST render one `<sourceId> skipped reason=<reason>` line per skipped Source, after Source result lines and before warning lines. When no Source result exists, summary and compact output MUST begin with the exact line `No Sources are eligible for sync.` followed by any skipped lines. `sync --format events` MUST continue to emit only selected Source events. Daemon-routed and direct sync MUST render identical output for the same result.

#### Scenario: Zero eligible Sources in human output
- **WHEN** an all-Source sync selects no Source and skips one unsupported Source under `--format summary`
- **THEN** stdout is `No Sources are eligible for sync.` followed by that Source's skipped line and the command exits `0`

#### Scenario: Zero eligible Sources in JSON
- **WHEN** the same sync runs under `--format json`
- **THEN** stdout is one JSON document with an empty `results` list and the skipped Source with reason `unsupported`

#### Scenario: Mixed selection in human output
- **WHEN** an all-Source sync completes one Source and skips another under `--format summary` or `--format compact`
- **THEN** the completed Source line precedes the skipped Source line and no zero-eligible line is printed
