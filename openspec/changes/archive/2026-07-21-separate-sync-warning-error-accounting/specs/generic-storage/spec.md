## ADDED Requirements

### Requirement: Bounded sync warning persistence
The fresh generic schema SHALL persist `warnings_count` and `last_warning_json` separately from existing error fields on Sync Runs and current Source sync state. `last_warning_json` MUST represent the last structured warning and MUST NOT be used to accumulate warning history.

#### Scenario: Current and historical diagnostics agree after state-changing sync
- **WHEN** a `sync` or `resync` Sync Run reaches a terminal completed or failed state after emitting warnings
- **THEN** its run-history row and current Source sync-state row store the same warning count and last structured warning independently of error fields

#### Scenario: Diff diagnostics do not replace current Source state
- **WHEN** a `diff` run completes or fails after emitting warnings
- **THEN** its run-history row stores those warning diagnostics while current Source sync state remains unchanged
