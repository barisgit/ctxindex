## ADDED Requirements

### Requirement: Severity-correct bounded sync diagnostics
Core MUST aggregate warning and error diagnostics separately for every Sync Run. Warning emissions MUST increment `warnings_count`, MUST NOT increment `errors_count`, and MUST retain the last emitted warning as a structured diagnostic containing its stable code, message, and optional Ref. Diagnostic persistence MUST remain bounded to counts and the last structured value rather than an unbounded history.

A terminal run failure MUST count as exactly one error without converting, discarding, or incrementing warnings emitted earlier in the run. Sync results and current Source sync status MUST expose `warningsCount`, `lastWarning`, `errorsCount`, and `lastError` with their corresponding severities.

#### Scenario: Warning-only run completes successfully
- **WHEN** an Adapter emits one or more warnings and then completes
- **THEN** the run is completed, current Source status is idle, `warningsCount` reflects every warning, `lastWarning` is the last structured warning, `errorsCount` is zero, and `lastError` is absent

#### Scenario: Warnings survive a terminal failure
- **WHEN** an Adapter emits warnings and later terminates with a typed sync failure
- **THEN** the persisted run and current Source status retain the warning count and last warning while recording exactly one error and the terminal error summary

#### Scenario: Diagnostic retention remains bounded
- **WHEN** a run emits many warnings
- **THEN** persistence stores the aggregate count and only the last structured warning rather than a warning history
