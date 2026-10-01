## ADDED Requirements

### Requirement: Source sync policy at creation
Source creation MUST accept an optional sync policy, MUST persist an explicit disabled or enabled value in the Source's existing sync state, and MUST default to enabled when the policy is omitted. Source inventory JSON MUST expose the effective policy as the boolean field `syncEnabled`. Existing Sources MUST NOT be mutated when this creation option is introduced.

The `source add` CLI MUST accept at most one exact bare `--no-sync` flag. Assignment forms, repetitions, and malformed variants MUST fail as invalid usage before persistent state is opened. The generated command declaration and help MUST include the flag.

#### Scenario: Source creation defaults to sync enabled
- **WHEN** a Source is created without a sync policy
- **THEN** the Source is persisted and listed with `syncEnabled` equal to true

#### Scenario: Source creation explicitly opts out of sync
- **WHEN** a Source is created with one bare `--no-sync` flag
- **THEN** the Source is persisted and listed with `syncEnabled` equal to false

#### Scenario: Invalid no-sync input has no state effect
- **WHEN** `source add` receives an assigned, repeated, or malformed no-sync option
- **THEN** it exits as invalid usage before opening or mutating persistent state
