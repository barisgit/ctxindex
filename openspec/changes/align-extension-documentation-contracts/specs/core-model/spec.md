## MODIFIED Requirements

### Requirement: Core domain model
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

- An **Extension** is one distributable, atomically activated plain definition that composes any number of imported Source Adapters and OAuth Apps plus optional standalone Providers and Profiles. It MAY declare one passive documentation sidecar that remains separate from runtime definition identity and behavior. It has no runtime Extension dependency graph. Built-in and external Extensions have identical authoring, collection, validation, and activation semantics; only acquisition and distribution differ.
- A **Provider** is an ID-addressed declaration of one external authority and exactly one currently supported direct authentication form, `oauth2` or `none`. At most one semantically distinct Provider per id may be active. Package version, integrity, and physical location are provenance, not Provider identity.
- An **OAuth App** is an Extension leaf authored with one exact imported OAuth2 Provider and `{ label, config }`, or a local secret-backed BYOA record. Its identity is `(providerId,label)`. Extension Apps require public registration policy; confidential Apps remain local or future hosted configuration. Duplicate identities MUST reject and BYOA MUST NOT shadow.
- A **Profile** is a versioned schema-backed domain declaration. Authors bind it by importing the exact Profile value. Profiles are the ONLY mechanism for domain semantics; core MUST NOT contain domain-specific code paths. `@ctxindex/profiles` is an ordinary library, not an always-selected Extension.
- A **Source Adapter** connects one collection type. It declares capability flags, config, exact imported Profiles, operations, and Actions. A Provider-backed Adapter imports exactly one Provider and declares only Adapter-specific Provider access allowed by that Provider auth kind plus Provider egress. A providerless Adapter has no Provider, Account, Grant, auth, Provider access, or Provider egress contract.
- An **Action** is a typed provider-side mutation declared by a Profile and implemented by a Source Adapter through a specific Source.
- An **Account** is one stable authenticated identity within a Provider. It is authorized through one explicitly selected OAuth App where OAuth2 is required.
- A **Grant** is private local state containing normalized permissions/token references and a Grant-owned snapshot of the exact OAuth App configuration selected for an Account. It MUST NOT be agent-facing configuration or inventory vocabulary.
- A **Realm** is a user-defined context grouping Sources that should be searched and reasoned about together.
- A **Source** is one labeled configured connection using one Source Adapter and belonging to one Realm.
- A **Resource** is one context unit emitted by a Source: an envelope plus validated versioned Profile payload.
- A **Ref** is `ctx://<source-id>/<adapter-opaque-suffix>` for one Resource.
- An **Artifact** is a Source-scoped, Profile-derived descriptor for downloadable bytes associated with one Resource.

An Extension root MUST transitively contribute Provider and Profile leaves reachable through its imported Adapters and OAuth Apps. Explicit Provider/Profile arrays MAY contribute standalone leaves not otherwise reachable. Package manifests and exact TypeScript imports own dependency acquisition; ctxindex MUST NOT expose `extensionRef`, `providerRef`, `profileRef`, or an Extension dependency graph.

The active registry MUST validate complete selected root graphs before mutation. Stable ids MUST remain semantic identity; Profile identity remains `(id,version)`. Repeated encounter of the exact same imported non-App object MAY coalesce as evidence of exact reuse, but object identity MUST NOT be a semantic key, precedence rule, or winner between distinct values. Distinct same-identity values containing any function or Zod schema MUST conflict because V1 has no package-authenticated per-leaf equivalence evidence. Distinct genuinely pure declarative values MAY coalesce only when canonical structural equality proves them equal. OAuth App identity duplicates MUST always conflict, including repeated reference to the same App object.

Separate physical SDK/Zod copies MUST remain authoring/type-compatible and structurally collectable. Their executable/schema-bearing definitions MUST NOT coalesce merely because root version, integrity, commit, path, provenance, or function text matches. Root provenance MUST be retained only for diagnostics and MUST NOT participate in leaf identity or equivalence. Conflicts MUST reject without mutation; load order, origin priority, `instanceof`, and object identity MUST NOT choose a winner.

Definition factories MUST return shallow plain structurally validated values with stable kind discriminators and exact imported-value inference. Provider, Profile, Adapter, and OAuth App definitions MUST NOT embed documentation. Extension documentation MUST use the separately owned passive sidecar contract and, after successful documentation validation, MUST NOT change definition identity, activated definition semantics, or runtime operations.

#### Scenario: Exact imported values preserve authoring inference
- **WHEN** an Adapter or OAuth App receives an imported Provider or Profile definition
- **THEN** TypeScript retains the imported literal ids, Profile versions, schemas, config, capability, and Action types without a string-reference fallback

#### Scenario: Reachable leaves activate transitively
- **WHEN** an Extension contains an Adapter importing one Provider and two Profiles
- **THEN** complete-registry collection includes those exact leaves without an Extension dependency declaration or duplicate explicit arrays

#### Scenario: Standalone leaf is explicit
- **WHEN** an Extension intentionally publishes a Profile not reachable through an Adapter or OAuth App
- **THEN** the Extension may list that exact Profile value in its explicit standalone Profiles array

#### Scenario: Exact imported object reuse may coalesce
- **WHEN** two reachable graph paths contain the exact same imported non-App Profile object
- **THEN** validation may retain one contribution as exact reuse without treating its object identity as a semantic key or winner

#### Scenario: Distinct executable copies conflict
- **WHEN** separate physical packages contribute distinct same-id Profile or Adapter values containing a Zod schema or function
- **THEN** validation rejects because executable/schema equivalence is unproven, regardless of matching root provenance or function text

#### Scenario: Distinct pure declarative copies may coalesce
- **WHEN** distinct same-id values contain no function or Zod schema and canonical structural equality proves them equal
- **THEN** validation may coalesce them without using load order or root provenance

#### Scenario: Providerless Adapter has no authorization model
- **WHEN** a credential-free local Adapter is activated without a Provider
- **THEN** it requires no Account or Grant and exposes no auth, Provider scopes, or Provider egress declaration

#### Scenario: OAuth App identity never shadows
- **WHEN** an Extension App and local BYOA App share one `(providerId,label)`
- **THEN** activation rejects the duplicate without choosing a winner

#### Scenario: Passive documentation does not alter runtime identity
- **WHEN** an Extension declares a valid passive documentation sidecar
- **THEN** after successful documentation validation, the sidecar is projected separately without changing definition identity, activated definition semantics, or runtime operations
