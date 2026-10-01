## ADDED Requirements

### Requirement: Capability-aware sync eligibility and selection reporting
A Source MUST be eligible for sync only when its sync policy is enabled and its loaded Adapter declares the `sync` capability and implements the sync operation. A Source whose Adapter definition is not loaded MUST remain selected so its unavailability is reported as that Source's failure.

An all-Source sync MUST run only selected Sources and MUST report every other configured Source in a `skipped` selection list ordered by Source id. Each skipped entry MUST contain the Source id and exactly one reason: `unsupported` when the loaded Adapter cannot sync, otherwise `disabled` when the Source's sync policy is disabled. A skipped Source MUST cause no provider operation, Sync Run, Source sync state change, progress event, Source result, or exit-code contribution. An all-Source sync with zero eligible Sources MUST succeed with exit `0`, an empty Source result list, and the skipped list.

A sync explicitly targeting a Source whose loaded Adapter cannot sync MUST fail as invalid usage with exit `2` before acquiring a sync lock, creating a Sync Run, changing Source sync state, or invoking any provider operation. When a targeted Source is both unsupported and disabled, the failure MUST identify it as unsupported. A targeted sync MUST report an empty skipped list.

Daemon-routed and direct sync MUST produce the same selection, skipped list, Source results, and exit outcome. Sync behavior for eligible Sources, including Calendar and local-directory Sources, MUST be unchanged.

#### Scenario: Mixed all-Source sync reports skipped Sources
- **WHEN** an all-Source sync runs over an eligible Source, a disabled Source, and a Source whose loaded Adapter cannot sync
- **THEN** only the eligible Source is synchronized and the result lists the disabled Source with reason `disabled` and the other Source with reason `unsupported`, ordered by Source id
- **THEN** the skipped Sources have no Sync Run and unchanged Source sync state

#### Scenario: Zero eligible Sources
- **WHEN** an all-Source sync runs and every configured Source is disabled or unsupported
- **THEN** the command exits `0` with no Source results and every Source in the skipped list

#### Scenario: Targeted unsupported Source is rejected before effects
- **WHEN** sync explicitly targets a Source whose loaded Adapter cannot sync
- **THEN** the command exits `2` with an invalid-usage diagnostic and creates no Sync Run, changes no Source sync state, and invokes no provider operation

#### Scenario: Unloaded Adapter remains selected
- **WHEN** an all-Source sync includes a Source whose Adapter definition is not loaded
- **THEN** that Source is selected and reported as a failed Source result rather than skipped

#### Scenario: Daemon and direct routes agree
- **WHEN** the same mixed or zero-eligible sync runs through the daemon and through direct composition
- **THEN** both report the same Source results, skipped list, and exit code
