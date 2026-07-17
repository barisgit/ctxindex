## MODIFIED Requirements

### Requirement: Explicit Realm, Source, Account, and Grant bindings
For V1, the system SHALL implement the Source and Realm behavior in SPEC §3, §5, and §10a: every Source belongs to exactly one explicitly selected existing user-created Realm, and authenticated Sources resolve credentials only through an explicit compatible Grant binding. Each authenticated Account MUST have a stable non-empty external identity unique within its provider; repeated authorization of the same `(provider, external identity)` MUST reuse that Account. A Grant belongs to exactly one Account/provider and records normalized scopes; multiple compatible Sources MAY reuse one Grant. Initialization MUST NOT seed or imply a `global` Realm.

Source creation SHALL accept `--account` as an exact account label, account id, or grant id, resolved only among Accounts matching the Adapter's declared provider. Every Source SHALL carry one label (subsuming the prior display name) defaulting verbatim to `<account-label>-<adapter-tail>` (the Adapter id segment after the provider dot), or `<adapter-tail>` when the Adapter requires no Account, with no normalization. Source labels MUST be unique globally; a collision MUST fail as invalid usage naming the taken label and suggesting `--label`, never auto-suffixing or prompting. Source-referencing commands SHALL accept the Source label wherever a Source id is accepted. When an Account is removed, bound Sources keep their configuration with a cleared Grant binding and surface authentication failure through existing status machinery.

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

#### Scenario: Default Source label composes account and adapter
- **WHEN** a `google.mailbox` Source is created with `--account work` and no `--label`
- **THEN** its label is exactly `work-mailbox`

#### Scenario: Source label collision is a hard error
- **WHEN** a second Source would receive an already-taken label
- **THEN** creation fails naming the taken label and suggesting `--label`, and no Source is stored

#### Scenario: Account label resolves within the Adapter's provider
- **WHEN** `source add google.mailbox --account work` runs while Google and Microsoft Accounts exist
- **THEN** only Google Accounts are candidates for `work` and a Microsoft Account is never selected
