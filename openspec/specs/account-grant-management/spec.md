# Account Grant Management Specification

## Purpose
Define provider-neutral OAuth authorization, stable Account identity, explicit Grant binding, safe inventory, and token refresh behavior.

## Requirements

### Requirement: OAuth authorization derives from selected Adapters
`auth add <provider>` SHALL require one or more loaded OAuth Adapter selections, validate that every selection declares the requested provider, and request the strict sorted union of only those Adapters' scopes plus the provider identity/refresh scopes required by the declarative OAuth flow. Authorization MUST NOT derive scopes from unrelated loaded Adapters.

When a successful initial token response includes `scope`, every selected Adapter operation scope MUST be present using case-sensitive comparison; declared provider identity/refresh scopes MAY be absent from that response where the provider does not echo them. If `scope` is absent, the requested set is the granted set under the OAuth response contract. A refresh response without `scope` preserves the Grant's prior normalized scopes.

#### Scenario: Gmail and Calendar are authorized together
- **WHEN** a caller selects `google.mailbox` and `google.calendar`
- **THEN** consent requests exactly the deduplicated scopes required by those two Adapters and provider identity, and the resulting Grant can bind Sources for both

#### Scenario: Unselected Adapter contributes no scope
- **WHEN** another loaded Adapter uses the same provider but is not selected
- **THEN** none of that Adapter's exclusive scopes appear in the authorization request or stored Grant

#### Scenario: Mixed providers are rejected
- **WHEN** one authorization command selects Adapters declaring different provider ids
- **THEN** parsing or registry validation fails before browser, token, identity, secret, or database work

### Requirement: OAuth providers are declarative and provider-neutral
The public Adapter auth contract SHALL identify a stable provider id and sufficient authorization, token, identity, client-input, PKCE, and scope metadata for core to execute one uniform authorization-code/refresh lifecycle. Core MUST NOT select provider behavior from token-host heuristics or mailbox-specific functions, and provider identity/network behavior MUST remain declared and allowlisted.

#### Scenario: Google and Microsoft use one host flow
- **WHEN** equivalent Google and Microsoft Adapter selections are authorized
- **THEN** core performs state-checked loopback authorization, token validation, identity resolution, and secret persistence through the same provider-neutral module

#### Scenario: Undeclared identity host is blocked
- **WHEN** an OAuth identity request targets a host not allowed for the declared provider
- **THEN** authorization fails before network egress to that host

### Requirement: Accounts use stable deduplicated provider identity
A successful authorization SHALL require a stable non-empty external identity from the provider and atomically upsert exactly one Account for `(provider, external_user_id)`. Reauthorization MAY create or replace a Grant but MUST reuse the Account, update its human label without changing identity, and MUST NOT fall back to an email label as identity when the provider does not prove a stable subject.

#### Scenario: Same Google identity authorizes twice
- **WHEN** the same provider subject completes two successful authorizations with different Adapter scope selections
- **THEN** both Grants belong to one Account row and `account list` reports that Account once

#### Scenario: Same label belongs to different providers
- **WHEN** Google and Microsoft return the same display address but different stable provider identities
- **THEN** two Accounts remain distinct

#### Scenario: Identity response is malformed
- **WHEN** token exchange succeeds but the provider identity response lacks its declared stable subject
- **THEN** no Account, Grant, or Source is written and newly written temporary secrets are cleaned

#### Scenario: Verified addresses become Account Identities
- **WHEN** the provider identity response includes declared verified email or principal-name values
- **THEN** they are deduplicated as Account Identity rows for that Account without replacing its stable external subject

### Requirement: Grants preserve exact permissions and explicit Source binding
Every Grant SHALL store normalized granted scopes and secret references for exactly one Account/provider. Source creation MUST select an explicit compatible Grant whose provider matches and whose scopes contain every selected Adapter requirement; no global, latest, or label-only fallback is allowed. Multiple Sources MAY reuse one compatible Grant.

#### Scenario: Mailbox and calendar share a Grant
- **WHEN** one Grant contains all Gmail and Google Calendar scopes
- **THEN** explicitly created mailbox and calendar Sources for its Account may both bind that Grant

#### Scenario: Read-only Grant cannot bind Draft mailbox
- **WHEN** a Microsoft Grant lacks `Mail.ReadWrite`
- **THEN** creation of a Draft-capable Microsoft mailbox Source fails before Source persistence

### Requirement: Account inventory is deterministic and non-sensitive
`account list` SHALL return Accounts in deterministic order with provider, stable local Account id, label, Grant ids/scopes/expiry state, and bound Source ids/names/Adapters/Realms. JSON SHALL preserve nested cardinality; readable output SHALL remain compact. Neither form may expose external stable identity by default when a safer label exists, or any secret reference/value.

#### Scenario: Personal and work inventory is listed
- **WHEN** personal Google and work Microsoft Accounts have multiple bound Sources
- **THEN** one command clearly associates each Grant and named Source with the correct Account and Realm

#### Scenario: Unauthenticated Source remains in Source inventory
- **WHEN** a local-directory Source exists without an Account
- **THEN** it remains visible through `source list` and does not appear as a fabricated Account

### Requirement: Token refresh is provider-neutral and safe
Authorized provider reads SHALL use the linked Grant, reuse an unexpired access token, and refresh through its declared token endpoint when required. Rotated refresh tokens MUST replace prior references safely; a 401 read MAY trigger the existing single refresh retry, while Actions MUST NOT be retried automatically.

#### Scenario: Microsoft refresh token rotates
- **WHEN** Microsoft returns a new refresh token while refreshing access
- **THEN** the Grant safely stores the replacement before deleting the old value and subsequent requests use it

#### Scenario: Action receives unauthorized response
- **WHEN** a Draft mutation returns 401
- **THEN** ctxindex reports authentication failure and performs no automatic second mutation
