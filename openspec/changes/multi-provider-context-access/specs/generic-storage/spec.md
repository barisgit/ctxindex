## MODIFIED Requirements

### Requirement: Explicit Realm, Source, Account, and Grant bindings
The system SHALL implement the Source and Realm behavior in SPEC §3, §5, and §10a: every Source belongs to exactly one explicitly selected existing user-created Realm, and authenticated Sources resolve credentials only through an explicit compatible Grant binding. Each authenticated Account MUST have a stable non-empty external identity unique within its provider; repeated authorization of the same `(provider, external identity)` MUST reuse that Account. A Grant belongs to exactly one Account/provider and records normalized scopes; multiple compatible Sources MAY reuse one Grant. Initialization MUST NOT seed or imply a `global` Realm.

#### Scenario: Source creation requires an existing Realm
- **WHEN** a caller creates a Source without an existing Realm
- **THEN** creation fails with an actionable error and no Source is stored

#### Scenario: Authenticated Source uses its linked Grant
- **WHEN** an authenticated Source performs sync or provider I/O
- **THEN** credentials are resolved through that Source's compatible `grant_id` rather than a global or most-recent Grant

#### Scenario: Reauthorization reuses Account identity
- **WHEN** the same stable external provider identity authorizes a second permission set
- **THEN** one Account owns both Grants and existing Source bindings remain explicit

#### Scenario: Compatible Grant is shared
- **WHEN** mailbox and calendar Adapters from one provider require scopes contained by one Grant
- **THEN** Sources using both Adapters may explicitly bind that Grant without duplicating the Account or secrets
