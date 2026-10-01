## ADDED Requirements

### Requirement: Capability-aware Source sync status
Source status MUST report one effective sync status per Source that distinguishes never-run, user-disabled, and Adapter-unsupported Sources. The effective status MUST be determined in this order:

1. `needs_auth` when the Source's recorded sync state is `needs_auth`;
2. `unsupported` when the Source's loaded Adapter cannot sync;
3. `disabled` when the Source's sync policy is disabled;
4. the recorded sync state (`idle` or `failed`) when one exists;
5. `pending` otherwise, meaning an eligible Source that has never completed or failed a sync.

A Source whose Adapter definition is not loaded MUST use only steps 1, 4, and 5 and MUST continue to report its unavailability through Source availability. Reading status MUST NOT change Source sync state. Daemon-routed and direct status MUST report the same effective status.

#### Scenario: Never-run eligible Source is pending
- **WHEN** status is read for a sync-enabled Source whose Adapter supports sync and that has never been synchronized
- **THEN** its status is `pending`

#### Scenario: User-disabled Source is not pending
- **WHEN** status is read for a Source created with sync disabled whose Adapter supports sync
- **THEN** its status is `disabled`

#### Scenario: Unsupported Source is not pending
- **WHEN** status is read for a Source whose loaded Adapter cannot sync, regardless of its sync policy
- **THEN** its status is `unsupported`

#### Scenario: Authorization loss remains visible
- **WHEN** a Source whose Adapter cannot sync has recorded sync state `needs_auth`
- **THEN** its status is `needs_auth`
