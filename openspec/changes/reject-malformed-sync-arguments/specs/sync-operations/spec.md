## ADDED Requirements

### Requirement: Strict sync command grammar
The `sync` command MUST accept only the documented `--source <id>`, `--mode sync|resync|diff`, `--format summary|events|compact`, and presence-only `--json` options. It MUST reject unknown flags, unexpected positional arguments, duplicate scalar or boolean flags, assignments to boolean flags, and scalar flags without values as invalid usage with exit `2`.

Sync options MUST occur after the selected `sync` command. Option-like tokens before `sync` MUST be rejected with exit `2` rather than discarded by root-command selection. Explicit help and valid global options MUST retain their existing behavior.

Malformed sync arguments MUST be rejected before sync execution begins and MUST NOT create a Sync Run, change Source sync state, access a provider, or update local materialization. Valid invocations and explicit help requests MUST retain their existing behavior.

#### Scenario: Malformed tokens are rejected deterministically
- **WHEN** a caller supplies an unknown flag, unexpected positional argument, duplicate scalar or boolean flag, boolean assignment, or scalar flag without a value
- **THEN** the command exits `2` with an invalid-usage diagnostic identifying the malformed argument

#### Scenario: Invalid usage has no sync side effects
- **WHEN** malformed sync arguments target a configured Source
- **THEN** the command creates no Sync Run and leaves Source sync state and local materialization unchanged

#### Scenario: Prefix options cannot bypass sync validation
- **WHEN** a caller places an option-like token before the selected `sync` command
- **THEN** the command exits `2` before storage or provider access instead of executing sync with the token discarded

#### Scenario: Valid and help invocations are preserved
- **WHEN** a caller supplies a valid combination of documented sync options or explicitly requests sync help
- **THEN** the command retains its existing execution or help behavior respectively
