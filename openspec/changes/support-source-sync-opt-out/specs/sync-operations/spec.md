## ADDED Requirements

### Requirement: Disabled Source sync enforcement
An all-Source sync MUST exclude Sources whose sync policy is disabled. A sync targeting a disabled Source MUST fail as invalid usage before invoking any provider operation and MUST produce no provider calls or sync runs. Disabling sync MUST NOT disable independently supported remote search, retrieval, download, or Actions.

#### Scenario: All-Source sync skips a disabled Source
- **WHEN** sync runs without an explicit Source and inventory includes a disabled Source
- **THEN** that Source causes no provider operation and produces no sync result

#### Scenario: Targeted sync rejects a disabled Source
- **WHEN** sync explicitly targets a disabled Source
- **THEN** the command exits with invalid usage and invokes no provider operation
