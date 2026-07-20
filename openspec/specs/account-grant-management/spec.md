# Account Grant Management Specification

## Purpose
Define provider-neutral OAuth authorization, stable labeled Account identity, one stable Grant per Account, safe inventory, and token refresh behavior.

## Requirements

### Requirement: OAuth authorization derives from active Provider-backed Adapters
Account authorization SHALL derive its scope request from the selected OAuth App's exact active Provider: that Provider's base scopes plus the strict sorted union of operation scopes from all active Provider-backed Adapters importing the same semantic Provider id. It MUST NOT include scopes from other Providers or providerless Adapters, and no command SHALL accept per-authorization Adapter selection.

If an initial token response includes `scope`, every requested Adapter operation scope MUST be present using case-sensitive comparison. If absent, the requested set is the granted set. A refresh response without `scope` preserves prior normalized private authorization state.

#### Scenario: Mailbox and Calendar authorize together
- **WHEN** authorization selects a Google App while Google mailbox and calendar Adapters are active
- **THEN** consent requests their deduplicated operation scopes plus Google base scopes

#### Scenario: Providerless Adapter contributes no scope
- **WHEN** providerless local Adapters are active during Google authorization
- **THEN** none contributes scopes, Provider access, or Provider egress requirements

### Requirement: Account authorization covers all active matching Adapters
Account authorization SHALL resolve one active Provider by semantic id and one available Extension or local OAuth App by exact label, then request base scopes plus all active matching Adapter scopes. Package selection determines which Adapters are active; ctxindex MUST NOT narrow consent through an Extension dependency graph.

On success, private Grant state MUST snapshot the exact selected App config into Grant-owned secret storage. Reauthorization of the same verified Provider identity SHALL update the existing Account, tokens, scopes, and App snapshot rather than duplicate it. Public workflows MUST use OAuth App and Account vocabulary and MUST NOT require or render Grant ids, token references, or permission records.

#### Scenario: Exact App label selects configuration
- **WHEN** authorization runs for Provider `google` with App label `work`
- **THEN** it uses exactly `(google,work)` and does not infer an App from load order or config

#### Scenario: Reauthorization preserves Account identity
- **WHEN** the same verified identity reauthorizes through an available App
- **THEN** Account identity remains stable while private scopes, tokens, and App snapshot update transactionally

#### Scenario: Replacement snapshot is durable first
- **WHEN** reauthorization succeeds through another App
- **THEN** replacement config is durably snapshotted before superseded references are cleaned

### Requirement: OAuth Providers are declarative and provider-neutral
An active OAuth2 Provider MUST own sufficient authorization, token, identity, App config, PKCE, base-scope, and allowlisted-host metadata for one uniform authorization-code/refresh lifecycle. A Provider declares exactly one direct `oauth2` or `none` auth kind. Named methods, multiple methods, selectors, and placeholder auth kinds MUST NOT be exposed without a separate accepted contract.

Provider-backed Adapters MUST import exact Provider definitions and MUST NOT duplicate Provider metadata. Core MUST NOT select behavior from token-host heuristics, Adapter-owned endpoint copies, object identity, load order, private method names, or domain-specific functions.

#### Scenario: Google and Microsoft use one host flow
- **WHEN** Accounts authorize through active Google and Microsoft Apps
- **THEN** core performs state-checked loopback authorization, token validation, identity resolution, and private persistence through one provider-neutral module

#### Scenario: Named multi-method auth is absent
- **WHEN** Provider authoring/runtime schemas are inspected
- **THEN** they expose one direct `oauth2` or `none` declaration and no selector

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
An Account SHALL carry a local label defaulting verbatim to its verified provider identity when `--label` is omitted, with no normalization. Account labels MUST be unique across all providers; a collision with a different Account's label MUST fail as invalid usage naming the taken label and suggesting `--label`, never auto-suffixing or prompting. Re-authorization of the same `(provider, external identity)` with a new label SHALL rename the existing Account. `--account` references SHALL resolve an exact Account label, then an exact Account id. Grant ids MUST remain private and MUST NOT be accepted as selectors.

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

### Requirement: Grants preserve exact permissions and Source binding
Private authorization state for an Account SHALL retain normalized scopes, token references, and a Grant-owned snapshot of the exact selected App config. Authenticated Source creation for a Provider-backed Adapter MUST use that Adapter's exact imported active Provider, resolve the selected Account by exact label or id, and verify matching Provider identity and all Adapter scopes. No load-order, alternate-Provider, App-shadow, object-identity, or auth-method fallback is allowed. Multiple Sources MAY reuse one Account's private authorization.

A Provider-backed Adapter whose exact Provider uses `none` MUST require no Account or Grant but MAY retain its declared Provider egress contract. A providerless Adapter MUST require no Account, create no Grant or OAuth App state, and perform no Provider authorization or Provider egress validation. Public Source config and inventory MUST NOT expose a Grant selector.

#### Scenario: Mailbox and calendar share private authorization
- **WHEN** one Google Account has all mailbox and calendar scopes
- **THEN** Sources for both Provider-backed Adapters may use that Account without exposing a Grant

#### Scenario: Providerless Source creates no authorization
- **WHEN** a Source is created for a providerless Adapter
- **THEN** no Account, App, Grant, Provider access, or Provider egress state is read or created

#### Scenario: None-auth Provider remains distinct from providerless
- **WHEN** an Adapter imports a Provider whose direct auth is `none`
- **THEN** Source creation requires no Account or Grant while the Adapter still uses that Provider's declared identity and egress contract

### Requirement: Account inventory is deterministic and non-sensitive
`account list` SHALL return Accounts in deterministic order with provider, stable local Account id, local label, authorization expiry state, and bound Source ids/labels/Adapters/Realms. JSON SHALL preserve nested cardinality; readable output SHALL remain compact. Neither form may expose Grant ids/scopes, permission records, external stable identity by default when a safer label exists, or any secret reference/value.

#### Scenario: Personal and work inventory is listed
- **WHEN** personal Google and work Microsoft Accounts have multiple bound Sources
- **THEN** one command clearly associates each Account's authorization health and labeled Sources with the correct Provider and Realm without exposing its Grant

#### Scenario: Labels identify Accounts in inventory
- **WHEN** Accounts labeled `work` and `uni` exist for one provider
- **THEN** `account list` distinguishes them by label without exposing secret material

#### Scenario: Unauthenticated Source remains in Source inventory
- **WHEN** a local-directory Source exists without an Account
- **THEN** it remains visible through `source list` and does not appear as a fabricated Account

### Requirement: Account removal deletes Grants and secrets explicitly
`account remove <label>` SHALL delete the Account still identified by that exact label at the serialized deletion point and its Grants in one durable transaction before attempting physical secret cleanup. If the resolved Account is renamed while removal waits behind another same-Account mutation, removal MUST fail as not found for the stale label and MUST NOT delete the renamed Account. Once the transaction commits, the Account/Grant absence and cleared Source bindings remain authoritative even if physical secret deletion fails; the operation MUST retain its committed success and emit the bounded redacted cleanup warning defined below. Failed physical deletions MUST remain eligible for safe idempotent retry by typed reference or backend inventory; repeating deletion MUST NOT restore Account/Grant state or fail merely because an earlier attempt already removed the physical secret. Sources bound to removed Grants remain configured with cleared Grant bindings and surface authentication failure through existing sync-status machinery rather than being deleted implicitly. Removing and later re-adding the same provider identity SHALL create a fresh Grant id and MUST NOT automatically rebind preserved Sources.

#### Scenario: Removal cleans secrets and preserves Sources
- **WHEN** an Account backing a configured mailbox Source is removed
- **THEN** its Grants and secret references are deleted and the Source subsequently reports `needs_auth` instead of disappearing

#### Scenario: Account removal cleanup remains pending
- **WHEN** Account/Grant removal commits but one or more physical secret deletions fail
- **THEN** committed Account/Grant absence and cleared Source bindings remain authoritative, removal succeeds with one bounded redacted cleanup warning, and repeated deletion of the same typed refs is safe and idempotent

#### Scenario: Re-adding does not heal preserved Sources
- **WHEN** a removed provider identity is authorized again
- **THEN** it receives a fresh Grant id and previously bound Sources remain `needs_auth` until recreated

#### Scenario: Account is renamed while removal waits
- **WHEN** removal resolves an old label and then waits behind reauthorization that renames the same Account
- **THEN** removal fails for the stale label and the renamed Account, Grant, and secrets remain intact

### Requirement: Token refresh is provider-neutral and safe
Authorized Provider reads SHALL use the Adapter's exact imported active Provider, the Account's matching private authorization, an unexpired access token when available, and the Grant-owned App snapshot for refresh. Removing the source App MUST affect only future authorization. Rotated refresh tokens MUST replace prior references safely. A 401 read MAY trigger the existing single refresh retry; Actions MUST NOT be retried automatically.

Refresh MUST NOT depend on current App inventory, a public Client, Grant selector, Provider version, reference fallback, object identity, load order, or auth-method selector. Providerless Adapter operations MUST NOT enter token refresh.

#### Scenario: Microsoft refresh token rotates
- **WHEN** Microsoft returns a new refresh token
- **THEN** private state stores the replacement before deleting the old value

#### Scenario: Removed App does not break refresh
- **WHEN** an App is removed after Account authorization
- **THEN** future authorization cannot select it while the Account refreshes from its Grant snapshot

#### Scenario: Action receives unauthorized response
- **WHEN** a Draft mutation returns 401
- **THEN** ctxindex reports authentication failure and performs no automatic second mutation

#### Scenario: Providerless operation bypasses refresh
- **WHEN** a providerless Adapter operation runs
- **THEN** no token lookup, refresh, or OAuth retry path executes

### Requirement: Grant secret replacement reports pending cleanup safely
Grant reauthorization and token refresh MUST write replacement secret state before durably swapping references. After the swap commits, failure to delete superseded secret entries MUST NOT roll back or invalidate the usable new Grant, change the existing public success result, or change stable exit mapping. The failure MUST produce one bounded structured warning whose bindings contain only the Provider id, Grant id, lifecycle phase, and failed-entry count. The warning MUST NOT contain Account id, secret value, token, OAuth App configuration, typed secret reference, credential key, caught backend error, or any other sensitive field.

Authorization, refresh, and removal mutations for the same exact Account identity MUST execute in one serialized order within a ctxindex process and MUST re-read current Grant state after entering that order. Concurrent successful replacements MUST leave only the final committed Grant's App and token references authoritative. Superseded physical secret rows MAY remain pending cleanup, but they are not live Grant state and MUST NOT be selected for authorization or refresh. Mutations for unrelated Accounts MUST remain independently executable.

An Account removal that waits behind another mutation MUST revalidate the exact requested label inside the serialized operation. If the Account was renamed while removal waited, removal MUST fail as not found for the stale label and MUST NOT delete the renamed Account, its Grant, or its secrets.

#### Scenario: Reauthorization commits before cleanup warning
- **WHEN** the same Account reauthorizes successfully and deletion of old App or token entries fails
- **THEN** the stable Grant points to the replacement entries and the operation succeeds with one redacted cleanup-pending warning

#### Scenario: Rotated refresh token remains usable
- **WHEN** refresh persists a rotated refresh token and new access token but old-token deletion fails
- **THEN** the new references remain authoritative, the access token is returned, and one redacted cleanup-pending warning records only safe context and a failure count

#### Scenario: Same Account refreshes concurrently
- **WHEN** two refresh operations for the same Account overlap in one process
- **THEN** they execute in order against current Grant state and only the final committed App and token references remain authoritative, even if superseded physical rows remain pending cleanup

#### Scenario: Same Account reauthorizes concurrently
- **WHEN** two successful reauthorizations for the same Provider identity overlap in one process
- **THEN** the stable Grant reflects one complete final authorization and no losing replacement references remain authoritative

#### Scenario: Removal waits behind Account rename
- **WHEN** removal resolves an old label and then waits behind reauthorization that renames the same Account
- **THEN** removal fails for the stale label and the renamed Account and Grant remain intact

### Requirement: Mailbox Account identities
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

Core SHOULD track account identities for mailbox accounts so sources can classify messages as sent, received, or self-authored across Google and Microsoft accounts.

#### Scenario: Mailbox classification uses tracked Account identities
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings
