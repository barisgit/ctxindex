## ADDED Requirements

### Requirement: Managed OAuth Apps use the ordinary Extension SDK graph
A ctxindex-managed OAuth App MUST be an ordinary App authored with `defineOAuthApp(exactImportedProvider, { label, config })` and contributed through an ordinary `defineExtension()` root. Its stable definition identity MUST remain `(providerId,label)`, and its config MUST be inferred and runtime-validated from the exact imported Provider's OAuth2 registration schema. Built-in and external Extensions MUST use the same App, Provider, Extension, collection, complete-registry, inventory, and activation contracts.

Managed status MUST NOT be an App or Extension authoring field, a second definition kind or factory, a built-in-only schema, a client-id convention, or a property of Provider registration. A host-owned release policy MUST designate the exact App identity, owning Extension identity, and accepted immutable distribution provenance. An App not designated by that policy MUST remain available through explicit exact `--app` selection subject to the ordinary trust and registry rules.

#### Scenario: Bundled managed App uses the public SDK
- **WHEN** an official bundled Extension contributes a reviewed App with `defineOAuthApp` and its identity and provenance match host release policy
- **THEN** it remains an ordinary active OAuth App and is eligible for managed-default selection

#### Scenario: External App remains first-class
- **WHEN** an external Extension contributes a valid public App that is not designated by host release policy
- **THEN** it is inventoried and explicitly selectable through the same SDK/runtime path but cannot become the omission default

#### Scenario: Authored trust field has no authority
- **WHEN** an Extension adds an `official`, `managed`, default, or scope-policy field outside the accepted SDK schema
- **THEN** that field cannot establish managed status or change selection, scopes, hosts, or capabilities

### Requirement: Managed-default selection is exact and closed
When `account add <provider>` omits `--app`, core MUST select an App only when exactly one host release-policy entry for that Provider matches one active Extension App's exact `(providerId,label)`, owning Extension identity, and accepted distribution provenance. No match MUST fail before App config or secret reads, persistence, browser launch, or Provider egress. Multiple matching or configured entries MUST fail closed as invalid release policy. Runtime MUST NOT guess from load order, origin priority, package name alone, client id, config equality, one locally persisted App, or one otherwise active App.

Supplying `--app <label>` MUST bypass managed-default choice and use the existing exact `(providerId,label)` resolver for either an Extension App or local BYOA App.

#### Scenario: One reviewed active App is selected
- **WHEN** `account add microsoft` omits `--app` and exactly one active Microsoft App matches release policy
- **THEN** core resolves that App's exact label and continues through the ordinary exact App authorization path

#### Scenario: Missing managed App has zero effects
- **WHEN** a Provider has no managed policy, its designated App is inactive, or its Extension provenance does not match
- **THEN** selection fails before config/secrets/database/browser/network effects with explicit BYOA guidance

#### Scenario: Explicit BYOA overrides managed selection
- **WHEN** `account add google --app work` names a local Google App while a managed Google App is active
- **THEN** authorization uses only exact App `(google,work)`

### Requirement: Managed designation does not alter requested access
Managed and explicit OAuth Apps MUST use the same Provider-owned authorization contract and exact requested scope algorithm: the selected App's Provider base scopes plus the strict sorted deduplicated union of operation scopes from every active Adapter importing that semantic Provider id. Managed designation MUST NOT contribute a scope allowlist, remove a community Adapter's scope, add a scope, change allowed hosts, or grant a new mutation or runtime capability.

If the provider has not approved any requested scope for the managed App, ctxindex MUST preserve the provider's safe typed failure and direct the operator to an explicit App/BYOA path. It MUST NOT silently narrow the request or start a second authorization.

#### Scenario: Community Adapter enlarges managed consent
- **WHEN** an active community Adapter imports the selected Provider and contributes one additional operation scope
- **THEN** managed authorization requests that scope in the same exact union as explicit BYOA authorization

#### Scenario: Provider rejects an unapproved scope
- **WHEN** Google or Microsoft rejects the managed App's exact requested union under provider policy
- **THEN** ctxindex reports the safe existing failure category and BYOA guidance without dropping the scope or retrying

### Requirement: Managed authorization remains provider-direct and local
A managed App MUST use the existing provider-neutral authorization lifecycle: Provider-owned endpoints and allowed hosts, an IPv4 loopback callback, state validation, required S256 PKCE, direct token and identity requests, and local transactional Grant/Secret Vault persistence. Public App registration metadata MAY be distributed in source, Extension packages, or compiled binaries and MUST NOT be represented as a confidential secret merely to obscure it.

No authorization code, token, Grant snapshot, identity response, Source data, or personal context may pass through or be stored by ctxindex-operated infrastructure. Managed selection MUST NOT require a ctxindex Account, backend, redirect relay, token proxy, remote availability service, or telemetry endpoint.

#### Scenario: Managed flow has bounded egress
- **WHEN** a synthetic managed authorization completes
- **THEN** every request targets only loopback or the selected Provider's declared authorization, token, and identity hosts

#### Scenario: Existing Grant survives managed-policy removal
- **WHEN** a later release removes the managed policy or App while an existing Grant refreshes
- **THEN** refresh uses its existing Grant-owned App snapshot and local token references without consulting current managed policy

### Requirement: Production activation is Human-gated and separable
The generic managed-policy, resolution, CLI, redaction, egress, and compiled capability MUST be testable and mergeable with invented Provider/App definitions and an empty production managed-App policy. A production Google or Microsoft public App identity and policy entry MUST be added only after the corresponding issue #60 Human checkpoint confirms the public/native App type, exact redirect behavior, owned publisher/domain and policy surfaces, current requested scopes, provider approval state, and safe BYOA fallback.

Provider checkpoints MUST NOT commit secrets, tokens, authorization codes, legal identity artifacts, private provider payloads, or unredacted console evidence. Each provider MAY remain BYOA-only or be activated independently.

#### Scenario: Generic slice contains no production identifier
- **WHEN** generic managed-default tests and relocated compiled acceptance run before provider approval
- **THEN** they use synthetic Apps and require no Google/Microsoft client id, credential, live login, or provider data

#### Scenario: One provider remains pending
- **WHEN** Microsoft is approved but Google verification remains incomplete
- **THEN** the release may activate only the Microsoft policy and App while Google continues requiring explicit App/BYOA selection
