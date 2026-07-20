## MODIFIED Requirements

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
