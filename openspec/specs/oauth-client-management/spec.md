# OAuth App Management Specification

## Purpose
Define activated and local Provider-scoped OAuth App configuration, safe environment import, non-sensitive inventory and removal, and deterministic Account authorization selection.

## Requirements

### Requirement: OAuth Apps are first-class activated definitions
An Extension-provided OAuth App MUST be authored with `defineOAuthApp(exactImportedProvider, { label, config })` and collected transitively from its Extension root. It MUST NOT use a Provider reference fallback. Its stable identity MUST be `(providerId,label)`; label MUST be authored and MUST NOT be defaulted or derived from config.

An Extension App MUST conform to its exact imported Provider's OAuth2 contract and MUST be permitted only when registration policy is `type: public`. It MUST NOT contain typed secret references or host-private secret values. Public native-App metadata MAY include a provider-issued non-confidential desktop secret. A Provider with `none` auth MUST reject Apps. Confidential Apps SHALL exist only as local secret-backed BYOA records or future hosted configuration.

#### Scenario: Imported Provider determines App config
- **WHEN** an App is authored from an imported Google Provider and label `work`
- **THEN** TypeScript infers that Provider's exact config input and activation adds `(google,work)` to safe inventory

#### Scenario: Provider reference fallback is unavailable
- **WHEN** the OAuth App factory public surface is inspected
- **THEN** it accepts only an exact imported OAuth2 Provider definition and no id-only reference overload

#### Scenario: Confidential Extension App rejects
- **WHEN** Extension code contributes an App for a confidential-registration Provider
- **THEN** complete candidate validation rejects before activation

#### Scenario: Public desktop metadata remains private from inventory
- **WHEN** a public native App config includes provider-issued non-confidential desktop-secret metadata
- **THEN** policy permits activation but inventory exposes none of that config

### Requirement: Duplicate OAuth Apps never shadow
The registry MUST reject more than one Extension or local OAuth App with the same `(providerId,label)`. No built-in, external, Catalog-discovered, or local BYOA App MAY win by load order, origin, package version, object identity, physical copy, or config equality. Replacement requires the current owner to be absent before validating the candidate registry.

#### Scenario: BYOA cannot shadow bundled App
- **WHEN** local BYOA contributes the same identity as an active bundled App
- **THEN** validation rejects and active state remains unchanged

#### Scenario: Explicit absence permits replacement
- **WHEN** the current owning Extension is absent before a replacement package is selected
- **THEN** the replacement may activate through ordinary duplicate-free validation

### Requirement: Account authorization selects an OAuth App
An OAuth2 Account authorization request MUST resolve exactly one active Extension or local OAuth App by Provider id and exact label before credential reads or network effects. The App's validated config and its exact imported active Provider supply authorization metadata. Public commands, descriptions, and inventories MUST use OAuth App vocabulary and MUST NOT expose Client or private Grant concepts.

#### Scenario: Multiple Apps require exact label
- **WHEN** a Provider has several Apps with distinct labels
- **THEN** Account authorization requires one exact label and never guesses from load order or config

#### Scenario: Unknown App fails before effects
- **WHEN** authorization selects an absent identity
- **THEN** it fails before secret reads/writes, persistence, browser launch, or Provider egress

### Requirement: OAuth App inventory is safe and unified
The OAuth App inventory MUST combine active Extension Apps and local BYOA Apps while exposing only `providerId`, stable `label`, origin, and safe provenance. It MUST NOT expose App config, client ids, secret references, public desktop-secret metadata, or secret values. Fresh storage SHALL use OAuth App terminology such as `oauth_apps` and SHALL NOT retain Client aliases or compatibility tables.

#### Scenario: Inventory redacts every origin
- **WHEN** inventory contains a bundled public App and local confidential BYOA App
- **THEN** both rows expose only Provider id, label, origin, and safe provenance

#### Scenario: Fresh schema has no Client alias
- **WHEN** a fresh database is initialized
- **THEN** OAuth App records use the new schema with no migration or deprecated Client view

### Requirement: Local OAuth App secrets participate in backend traversal
Local BYOA config MUST persist confidential values only through typed secret references. Secret inspection, copy/verify switching, cleanup, and orphan traversal MUST include every local App config reference and every Grant-owned App snapshot reference.

#### Scenario: Secret backend switches with Apps and Grants
- **WHEN** the operator switches secret backends while local Apps and authorized Accounts exist
- **THEN** every App-config and Grant-snapshot reference copies and verifies before old references are removed

### Requirement: Provider registration declares local environment import
Every OAuth2 Provider registration definition MUST declare a typed mapping from each top-level App config-schema key to one environment variable name matching `^[A-Z_][A-Z0-9_]*$`. The mapping MUST NOT contain unknown or nested config paths. It exists only to support local BYOA `oauth-app add --from-env`; Extension-provided Apps, Account authorization, token refresh, and Provider operations MUST NOT read App config through this mapping.

The local add flow MUST read mapped values through the central environment loader, assemble one config object keyed by the schema's top-level keys, and validate the complete object before persistence. Unknown Provider selection MUST fail before environment or secret reads. Missing or invalid mapped values MUST fail before secret-store writes, database mutation, browser launch, or Provider egress.

#### Scenario: Local BYOA imports mapped config once
- **WHEN** `oauth-app add google work --from-env` finds all Google registration environment values
- **THEN** it validates the complete Google App config and persists typed secret references for local App `(google,work)`

#### Scenario: Missing mapped value has zero durable effects
- **WHEN** one required mapped environment value is absent or the assembled config fails schema validation
- **THEN** add exits before secret-store writes, database mutation, browser launch, or Provider egress

#### Scenario: Authorization never rereads environment config
- **WHEN** Account authorization or refresh runs after local App creation
- **THEN** it uses persisted App config or the Grant-owned snapshot and never consults the Provider environment mapping

### Requirement: Adapter authorization uses its exact imported Provider
OAuth consent, App compatibility, identity lookup, refresh, and authorized Provider contexts MUST use the exact Provider imported by each Provider-backed Adapter. Adapter-specific OAuth scopes MUST combine with that Provider's base scopes. An Adapter MUST NOT redeclare Provider endpoints, identity mapping, authorization hosts, App config schema, or auth kind.

The exact same imported Provider object MAY coalesce when reached repeatedly. Distinct same-id Provider values containing an OAuth config Zod schema MUST conflict because V1 cannot prove their schema equivalence; root package version, integrity, commit, path, provenance, or function text MUST NOT make them equivalent. A genuinely pure declarative Provider MAY coalesce with a distinct value only by canonical structural equality. Runtime binding MUST NOT use object identity or load order as semantic identity or winner selection. A conflicting same-id Provider MUST reject the complete candidate registry.

A providerless Adapter MUST bypass OAuth App, Account, Grant, Provider access, and Provider egress resolution entirely.

#### Scenario: Imported Provider supplies authorization metadata
- **WHEN** an Adapter imports the Google Provider and authorization begins through a Google App
- **THEN** endpoints, identity, hosts, base scopes, and App config validation come from that Provider's active semantic definition

#### Scenario: Conflicting Provider copy rejects
- **WHEN** an Adapter graph contributes a Provider id whose definition conflicts with another active contribution
- **THEN** complete candidate validation rejects before OAuth App or network effects

#### Scenario: Providerless Adapter has no OAuth path
- **WHEN** a Source uses a providerless Adapter
- **THEN** Source creation and operations perform no OAuth App, Account, Grant, or Provider authorization resolution
