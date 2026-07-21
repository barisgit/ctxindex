## ADDED Requirements

### Requirement: Live sync output preserves machine-readable results
When daemon sync is selected, the CLI MUST consume the typed stream without
opening the client database or falling back to direct composition. `sync --json`
MUST emit exactly one final JSON document with the established aggregate result
shape. `sync --format events` MUST emit progress as it arrives and MUST preserve
the established Source completed/failed event shapes. Summary and compact output
MUST preserve their terminal stdout shapes and MAY render bounded live progress
to stderr. Final exit selection MUST remain derived from terminal Source results.

#### Scenario: JSON sync receives progress
- **WHEN** daemon sync yields multiple progress events and returns successfully under `--json`
- **THEN** stdout contains one valid final JSON document and no partial event documents

#### Scenario: Event-formatted sync receives progress
- **WHEN** daemon sync is invoked with `--format events`
- **THEN** each progress event is written in arrival order before its Source terminal event and before command completion

#### Scenario: Selected stream endpoint disappears
- **WHEN** an exact daemon was selected and its stream fails or disconnects
- **THEN** the CLI returns the declared bounded daemon/cancellation failure and never opens SQLite as fallback
