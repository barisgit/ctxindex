## ADDED Requirements

### Requirement: Initialized stateful CLI behavior is daemon-backed by default
Every initialized CLI command in the promoted stateful-command inventory MUST ensure and invoke the exact compatible local daemon without requiring an explicit lifecycle command from the user. Local argument validation that can be completed without runtime state MUST still fail before daemon startup. Commands on the tested bootstrap/filesystem-only exception allowlist MUST remain direct and MUST NOT start or keep alive the daemon.

CLI formatting, warnings, typed progress presentation, and stable exit mapping MUST remain client-owned. A daemon startup, compatibility, stopping-race, or transport failure MUST map through the existing bounded daemon failure taxonomy and MUST NOT cause hidden direct execution.

#### Scenario: Invalid arguments have no lifecycle effect
- **WHEN** a stateful command fails locally decidable argument validation
- **THEN** it returns the existing usage failure without starting or contacting a daemon

#### Scenario: Valid stateful command needs no manual start
- **WHEN** a user invokes a valid initialized stateful command without first running `daemon start`
- **THEN** the CLI ensures the compatible daemon and preserves the command's existing public output and exit behavior

#### Scenario: Safe filesystem-only command remains direct
- **WHEN** a command on the tested safe-exception allowlist executes while no daemon is running
- **THEN** it completes without starting a daemon and without opening SQLite or invoking provider behavior
