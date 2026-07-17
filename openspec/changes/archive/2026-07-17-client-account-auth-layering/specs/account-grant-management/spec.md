## ADDED Requirements

### Requirement: Account authorization covers all loaded provider Adapters
`account add <provider>` SHALL request provider base scopes plus the strict sorted deduplicated union of the operation scopes of every loaded Adapter declaring that provider. There SHALL be no per-command Adapter selection; loading fewer Extensions is the mechanism for narrower consent. Re-running `account add` for the same provider identity after additional Adapters are loaded SHALL re-consent with the enlarged union and update the existing Account and Grant state rather than duplicating the Account. Each Account SHALL own exactly one Grant maintained by `account add`: re-authorization MUST update that Grant's scopes and secret references in place under its existing grant id so Source bindings remain valid.

#### Scenario: Consent unions mailbox and calendar
- **WHEN** `account add google` runs while `google.mailbox` and `google.calendar` are loaded
- **THEN** one consent request contains exactly the provider base scopes plus both Adapters' deduplicated scopes

#### Scenario: New Extension enlarges consent on re-add
- **WHEN** the same identity re-runs `account add` after a new Adapter for that provider is loaded
- **THEN** consent requests the enlarged union and the existing Account is updated without duplication

#### Scenario: Re-authorization keeps one stable Grant
- **WHEN** the same identity completes `account add` a second time
- **THEN** the Account still owns exactly one Grant whose id is unchanged, with scopes and tokens updated in place, and existing Source bindings remain valid

#### Scenario: Other providers' Adapters contribute nothing
- **WHEN** Microsoft Adapters are loaded during `account add google`
- **THEN** no Microsoft scope appears in the request or stored Grant

### Requirement: Account labels are verbatim unique handles
An Account SHALL carry a local label defaulting verbatim to its verified provider identity when `--label` is omitted, with no normalization. Account labels MUST be unique across all providers; a collision with a different Account's label MUST fail as invalid usage naming the taken label and suggesting `--label`, never auto-suffixing or prompting. Re-authorization of the same `(provider, external identity)` with a new label SHALL rename the existing Account. `--account` references SHALL resolve an exact account label, then an exact account id, then an exact grant id.

#### Scenario: Omitted label defaults to verified identity
- **WHEN** `account add google` completes for `blaz@paxia.co` without `--label`
- **THEN** the Account label is exactly `blaz@paxia.co`

#### Scenario: Cross-provider identical identity collides on default label
- **WHEN** `account add microsoft` resolves verified identity `blaz@paxia.co` while a Google Account already holds that label
- **THEN** authorization fails after identity resolution naming the taken label and suggesting `--label`, and no Account or Grant is persisted

#### Scenario: Re-adding with a new label renames
- **WHEN** the same provider identity re-runs `account add` with `--label work`
- **THEN** the existing Account's label becomes `work` and no second Account exists

#### Scenario: Label references resolve across commands
- **WHEN** a Source command passes `--account work`
- **THEN** resolution matches the Account labeled `work` before any id comparison and only among Accounts matching the Adapter's declared provider

### Requirement: Account removal deletes Grants and secrets explicitly
`account remove <label>` SHALL delete the identified Account, its Grants, and their secret references. Sources bound to removed Grants remain configured and surface authentication failure through existing sync-status machinery rather than being deleted implicitly.

#### Scenario: Removal cleans secrets and preserves Sources
- **WHEN** an Account backing a configured mailbox Source is removed
- **THEN** its Grants and secret references are deleted and the Source subsequently reports `needs_auth` instead of disappearing

## MODIFIED Requirements

### Requirement: OAuth authorization derives from selected Adapters
Account authorization SHALL derive its scope request from the loaded Adapter registry as defined by `account add`: provider base scopes plus the strict sorted union of all loaded Adapters declaring that provider. Authorization MUST NOT derive scopes from Adapters declaring other providers, and no command SHALL accept per-authorization Adapter selection.

When a successful initial token response includes `scope`, every requested Adapter operation scope MUST be present using case-sensitive comparison; declared provider identity/refresh scopes MAY be absent from that response where the provider does not echo them. If `scope` is absent, the requested set is the granted set under the OAuth response contract. A refresh response without `scope` preserves the Grant's prior normalized scopes.

#### Scenario: Gmail and Calendar are authorized together
- **WHEN** `account add google` runs with `google.mailbox` and `google.calendar` loaded
- **THEN** consent requests exactly the deduplicated scopes required by those Adapters plus provider identity, and the resulting Grant can bind Sources for both

#### Scenario: Other-provider Adapter contributes no scope
- **WHEN** a loaded Adapter declares a different provider than the one being authorized
- **THEN** none of that Adapter's scopes appear in the authorization request or stored Grant

#### Scenario: Token scope validation is preserved
- **WHEN** an initial token response echoes a `scope` value missing a requested Adapter operation scope
- **THEN** authorization fails and no Grant is persisted

### Requirement: Account inventory is deterministic and non-sensitive
`account list` SHALL return Accounts in deterministic order with provider, stable local Account id, local label, Grant ids/scopes/expiry state, and bound Source ids/labels/Adapters/Realms. JSON SHALL preserve nested cardinality; readable output SHALL remain compact. Neither form may expose external stable identity by default when a safer label exists, or any secret reference/value.

#### Scenario: Personal and work inventory is listed
- **WHEN** personal Google and work Microsoft Accounts have multiple bound Sources
- **THEN** one command clearly associates each Grant and labeled Source with the correct Account and Realm

#### Scenario: Labels identify Accounts in inventory
- **WHEN** Accounts labeled `work` and `uni` exist for one provider
- **THEN** `account list` distinguishes them by label without exposing secret material

## REMOVED Requirements

### Requirement: Legacy `auth add` command surface
**Reason**: The `auth` command fused client resolution, Account discovery, and Grant scoping into one unpredictable step; it is replaced by `client add` and `account add` with all-loaded-adapters consent.
**Migration**: None required pre-alpha. Fresh setups use `client add <provider>` then `account add <provider>`; prototype Grants and databases are disposable.
