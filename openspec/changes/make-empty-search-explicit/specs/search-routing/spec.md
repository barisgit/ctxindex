## ADDED Requirements

### Requirement: Explicit empty search outcome
When search returns zero Resources, pretty output MUST write exactly `No results.` to stdout. Text output MUST remain the deterministic TSV header row with no result rows and no empty-state message. `--refs` MUST write nothing to stdout. JSON MUST retain the unchanged envelope with an empty `results` array. Nonempty results in every projection MUST be unchanged.

An empty result set MUST exit `0`. Warnings, explain diagnostics, pagination, and continuations MUST keep their existing streams and shapes, and direct and daemon-routed search MUST produce identical output for the same result.

#### Scenario: Empty pretty search is explicit
- **WHEN** search returns zero Resources with `--format pretty` or TTY default output
- **THEN** stdout is exactly `No results.` and the command exits `0`

#### Scenario: Empty machine projections stay unchanged
- **WHEN** search returns zero Resources with `--format text`, `--refs`, or `--format json`
- **THEN** text stdout is only the TSV header, refs stdout is empty, JSON stdout is the unchanged envelope with an empty `results` array, and the command exits `0`

#### Scenario: Daemon and direct empty search match
- **WHEN** the same empty result is returned by the daemon route and by direct composition
- **THEN** both routes write the same stdout and stderr for each output projection
