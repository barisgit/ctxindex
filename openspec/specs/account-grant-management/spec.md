# Account Grant Management Specification

## Purpose
Define provider-neutral OAuth authorization, stable labeled Account identity, one stable Grant per Account, safe inventory, and token refresh behavior.

## Requirements

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

### Requirement: OAuth providers are declarative and provider-neutral
The public Adapter auth contract SHALL identify a stable provider id and sufficient authorization, token, identity, client-input, PKCE, and scope metadata for core to execute one uniform authorization-code/refresh lifecycle. Core MUST NOT select provider behavior from token-host heuristics or mailbox-specific functions, and provider identity/network behavior MUST remain declared and allowlisted.

#### Scenario: Google and Microsoft use one host flow
- **WHEN** equivalent Google and Microsoft Adapter selections are authorized
- **THEN** core performs state-checked loopback authorization, token validation, identity resolution, and secret persistence through the same provider-neutral module

#### Scenario: Undeclared identity host is blocked
- **WHEN** an OAuth identity request targets a host not allowed for the declared provider
- **THEN** authorization fails before network egress to that host

### Requirement: Accounts use stable deduplicated provider identity
A successful authorization SHALL require a stable non-empty external identity from the provider and atomically upsert exactly one Account for `(provider, external_user_id)`. Reauthorization MUST reuse the Account and update its one stable Grant in place, MAY update its local label without changing identity, and MUST NOT fall back to an email label as identity when the provider does not prove a stable subject.

#### Scenario: Same Google identity authorizes twice
- **WHEN** the same provider subject completes two successful authorizations
- **THEN** one Account row owns one Grant whose id remains stable and `account list` reports that Account once

#### Scenario: Same verified label belongs to different providers
- **WHEN** Google and Microsoft return the same verified address but different stable provider identities
- **THEN** the second authorization requires a distinct explicit Account label and the two Accounts remain distinct

#### Scenario: Identity response is malformed
- **WHEN** token exchange succeeds but the provider identity response lacks its declared stable subject
- **THEN** no Account, Grant, or Source is written and newly written temporary secrets are cleaned

#### Scenario: Verified addresses become Account Identities
- **WHEN** the provider identity response includes declared verified email or principal-name values
- **THEN** they are deduplicated as Account Identity rows for that Account without replacing its stable external subject

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

### Requirement: Grants preserve exact permissions and explicit Source binding
Every Account SHALL own exactly one stable Grant storing normalized granted scopes and secret references for that Account/provider. Authenticated Source creation MUST resolve `--account` by exact Account label, then exact Account id, then exact Grant id, only among Accounts matching the Adapter's declared provider, and bind that Account's compatible Grant. The Grant's provider MUST match and its scopes MUST contain every selected Adapter requirement; no global or latest fallback is allowed. Multiple Sources MAY reuse the Grant.

#### Scenario: Mailbox and calendar share a Grant
- **WHEN** one Account's Grant contains all Gmail and Google Calendar scopes
- **THEN** explicitly created mailbox and calendar Sources for that Account may both bind that Grant

#### Scenario: Read-only Grant cannot bind Draft mailbox
- **WHEN** a Microsoft Account's Grant lacks `Mail.ReadWrite`
- **THEN** creation of a Draft-capable Microsoft mailbox Source fails before Source persistence

### Requirement: Account inventory is deterministic and non-sensitive
`account list` SHALL return Accounts in deterministic order with provider, stable local Account id, local label, Grant ids/scopes/expiry state, and bound Source ids/labels/Adapters/Realms. JSON SHALL preserve nested cardinality; readable output SHALL remain compact. Neither form may expose external stable identity by default when a safer label exists, or any secret reference/value.

#### Scenario: Personal and work inventory is listed
- **WHEN** personal Google and work Microsoft Accounts have multiple bound Sources
- **THEN** one command clearly associates each Grant and labeled Source with the correct Account and Realm

#### Scenario: Labels identify Accounts in inventory
- **WHEN** Accounts labeled `work` and `uni` exist for one provider
- **THEN** `account list` distinguishes them by label without exposing secret material

#### Scenario: Unauthenticated Source remains in Source inventory
- **WHEN** a local-directory Source exists without an Account
- **THEN** it remains visible through `source list` and does not appear as a fabricated Account

### Requirement: Account removal deletes Grants and secrets explicitly
`account remove <label>` SHALL delete the identified Account, its Grants, and their secret references. Sources bound to removed Grants remain configured with cleared Grant bindings and surface authentication failure through existing sync-status machinery rather than being deleted implicitly. Removing and later re-adding the same provider identity SHALL create a fresh Grant id and MUST NOT automatically rebind preserved Sources.

#### Scenario: Removal cleans secrets and preserves Sources
- **WHEN** an Account backing a configured mailbox Source is removed
- **THEN** its Grants and secret references are deleted and the Source subsequently reports `needs_auth` instead of disappearing

#### Scenario: Re-adding does not heal preserved Sources
- **WHEN** a removed provider identity is authorized again
- **THEN** it receives a fresh Grant id and previously bound Sources remain `needs_auth` until recreated

### Requirement: Token refresh is provider-neutral and safe
Authorized provider reads SHALL use the linked Grant, reuse an unexpired access token, and refresh through its declared token endpoint when required. Rotated refresh tokens MUST replace prior references safely; a 401 read MAY trigger the existing single refresh retry, while Actions MUST NOT be retried automatically.

#### Scenario: Microsoft refresh token rotates
- **WHEN** Microsoft returns a new refresh token while refreshing access
- **THEN** the Grant safely stores the replacement before deleting the old value and subsequent requests use it

#### Scenario: Action receives unauthorized response
- **WHEN** a Draft mutation returns 401
- **THEN** ctxindex reports authentication failure and performs no automatic second mutation
