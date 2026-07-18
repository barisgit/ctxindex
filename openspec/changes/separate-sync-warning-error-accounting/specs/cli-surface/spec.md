## ADDED Requirements

### Requirement: Separate warning diagnostics in sync inventory output
Machine-readable sync results, status output, and Source inventory SHALL expose `warningsCount` and `lastWarning` alongside `errorsCount` and `lastError` wherever sync diagnostics are already shown. Human-readable status and Source inventory MUST identify warning counts and the last warning without labeling either as an error. Existing diagnostic codes and detail MUST be preserved.

#### Scenario: Warning-only diagnostics remain machine distinguishable
- **WHEN** an agent requests JSON after a warning-only completed sync
- **THEN** the relevant sync result and inventory output report a positive `warningsCount`, structured `lastWarning`, zero `errorsCount`, no `lastError`, completed or idle status, and success exit behavior

#### Scenario: Human inventory labels severity correctly
- **WHEN** a user views human-readable status or Source inventory containing warning diagnostics
- **THEN** warnings are labeled separately from errors and the last warning retains its stable code and detail
