# module-architecture Specification

## Purpose
TBD - created by archiving change deepen-module-architecture. Update Purpose after archive.
## Requirements
### Requirement: Implementation follows explicit module ownership
The repository MUST organize behavior by its domain owner, keep composition roots free of provider-specific implementations, use package manifests/imports for dependencies, and use one Extension activation boundary for every origin.

#### Scenario: Built-in integration locality
- **WHEN** a maintainer inspects a built-in integration
- **THEN** Provider auth/App-schema declarations are Provider-owned, Adapter behavior is Adapter-owned, vocabulary is Profile-owned, package dependencies are manifest-owned, and the Extension root only composes imported values

#### Scenario: Providerless Adapter locality
- **WHEN** a maintainer inspects a providerless local Adapter
- **THEN** its module owns local config and operations without importing or synthesizing Provider, Account, Grant, auth, Provider egress, or Provider access concepts

### Requirement: Internal reorganization preserves public seams
Architecture cleanup MUST preserve declared package subpath names, the public Extension SDK value/type surface and authoring inference, CLI behavior and exit codes, storage schema, and provider request behavior unless a separate capability change explicitly modifies them. Unreachable symbols in private workspace packages MAY be removed.

#### Scenario: Existing consumers after reorganization
- **WHEN** workspace packages, the CLI, and an external compiled Extension use their declared public imports and workflows
- **THEN** they compile and behave identically without importing internal implementation paths

### Requirement: Architecture checks cover owned entrypoints
Automated verification MUST discover and validate all production CLI command entrypoints and MUST enforce the repository's package dependency direction and Adapter composition locality without a hand-maintained exception list.

#### Scenario: New production command or Adapter implementation
- **WHEN** a production CLI command or built-in Adapter implementation is added
- **THEN** architecture verification includes it automatically
- **THEN** a misplaced implementation or an oversized command composition module fails verification

### Requirement: Runtime code and manifests contain no dormant prototype surface
Production modules and runtime dependency manifests MUST exclude unreachable prototype contracts, compatibility-only aliases, and dependencies unused by that package's runtime or tests.

#### Scenario: Repository health verification
- **WHEN** the architecture and package gates run
- **THEN** no unreachable prototype sync-operation implementation, forbidden Adapter-table cleanup path, dead provider client surface, or unused direct runtime dependency remains

### Requirement: CLI and core module boundaries
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

`apps/cli` is a thin shell around `@ctxindex/core` services. Command files under `apps/cli/src/commands/**/*.ts` MUST limit themselves to parsing arguments, calling a core service, formatting the result, mapping typed errors, and returning an exit code.

Code under `apps/cli/src/**` MUST NOT import `bun:sqlite` or `drizzle-orm/*`. It MUST NOT contain raw SQL literals for `INSERT`, `UPDATE`, `DELETE`, or `SELECT` statements.

Code under `apps/cli/src/**` MUST NOT issue `fetch()` calls to provider APIs such as OAuth, Google, or Microsoft endpoints. Provider HTTP behavior belongs in `@ctxindex/core` or `@ctxindex/adapters`.

Code under `apps/cli/src/**` MUST NOT generate ULIDs or UUIDs and MUST NOT encode schema column names. Identity assignment and schema knowledge are core concerns.

The OAuth host flow MAY bind a loopback-only socket and explicitly open a browser. State, callback, timeout, PKCE, token exchange, provider identity, and secret persistence MUST be owned by a provider-neutral `@ctxindex/core/auth` module; the CLI only selects definitions and invokes that module.

#### Scenario: CLI commands delegate runtime behavior to core services
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Public SDK owns ordinary imported-value authoring
`@ctxindex/extension-sdk` MUST expose core-independent, side-effect-free, inference-preserving plain-value factories and types for Profile, Provider, OAuth App, Adapter, and Extension definitions, the proven direct `auth.oauth2` and `auth.none` factories, and its supported `z`. It MUST NOT expose `extensionRef`, `providerRef`, `profileRef`, an Extension dependency graph, a host authoring object, runtime-core imports, global registration, custom prototypes, `instanceof` contracts, speculative auth kinds, or embedded definition documentation.

Provider/Profile use sites MUST receive exact imported values. `defineAdapter` MUST distinguish Provider-backed and providerless contracts such that providerless Adapters cannot declare Provider authorization, access, or egress fields.

#### Scenario: Imported definitions preserve inference
- **WHEN** an author passes imported Provider and Profile values through OAuth App, Adapter, and Extension factories
- **THEN** literal ids, Profile versions, schemas, config, capabilities, and Action types remain exact

#### Scenario: References are not an authoring escape hatch
- **WHEN** the SDK public surface is inspected
- **THEN** no Extension, Provider, or Profile reference factory or reference-shaped authoring overload exists

#### Scenario: SDK supplies schema surface
- **WHEN** an author defines a public schema
- **THEN** `z` is available from `@ctxindex/extension-sdk` without host injection

### Requirement: Package tooling owns dependencies
Extension packages MUST express dependencies through their package manifest and exact module imports. Workspace, local, Git, and npm materialization MUST use the applicable package tooling. Core MUST NOT resolve an Extension dependency graph or implement an alternate package dependency solver.

`@ctxindex/profiles` SHALL remain an ordinary importable library and MUST NOT be activated through a privileged or always-selected Profiles Extension.

#### Scenario: Adapter imports canonical Profile library
- **WHEN** an Adapter package uses a canonical Profile
- **THEN** its package manifest declares `@ctxindex/profiles` and its TypeScript module imports the exact Profile value

### Requirement: OAuth App ownership and identity are explicit
Provider modules MUST own direct auth and OAuth App config contracts. OAuth App definitions MUST bind an exact imported OAuth2 Provider and declare a stable label and config. Extension roots MAY compose Apps but MUST NOT derive labels, fingerprints, or shadowing priority. Core owns `(providerId,label)` inventory and duplicate rejection.

#### Scenario: BYOA remains local state
- **WHEN** an operator configures confidential BYOA
- **THEN** it uses the same App identity and safe inventory while confidential config remains in typed local secret references rather than Extension code

### Requirement: One collector and complete registry serve all origins
Provider-neutral core MUST own one `ctxindex.extensions` package-entry resolver for manifest-backed packages, one module-namespace root collector used by every origin, one transitive reachable-leaf collector, exact root selection, structural validation, a conservative duplicate policy, and complete-registry activation. Explicit paths and Catalog targets MUST pass package roots through the entry resolver; already acquired built-in module namespaces MAY enter directly at the shared namespace collector. Exact reused non-App objects MAY deduplicate; distinct function/schema-bearing values MUST conflict; only distinct genuinely pure declarative values MAY use canonical structural equality; OAuth App duplicates MUST conflict. These seams MUST accept normalized root provenance for diagnostics without using it for leaf identity or equivalence and without depending on Catalog storage types. Origins MUST NOT inject factories, pre-register or preselect roots/leaves, resolve package dependencies, choose duplicate winners, or mutate registries before common validation succeeds.

#### Scenario: Built-in and external roots share the boundary
- **WHEN** architecture verification discovers bundled and external entry modules
- **THEN** every namespace delegates root collection, graph collection, and activation to the same core boundary

### Requirement: Extension documentation is an owned sidecar concern
`@ctxindex/extension-sdk` SHALL expose one core-independent, side-effect-free `docs()` helper and plain directory-or-virtual declaration types. Only an Extension root MAY carry the declaration; Provider, OAuth App, Profile, and Adapter values MUST remain free of embedded documentation. Provider-neutral core SHALL bind acquired entry-module provenance, validate and normalize the sidecar before atomic activation, and expose transport-neutral documentation data. Extension documentation MUST NOT affect definition identity, equivalence, dependency resolution, acquisition, or operation behavior.

#### Scenario: Documentation remains outside definition behavior
- **WHEN** an Extension declares a documentation sidecar
- **THEN** its imported Provider, OAuth App, Profile, and Adapter values retain their existing shapes and activation semantics

#### Scenario: No consumer-specific runtime enters the SDK
- **WHEN** the public SDK and package dependencies are inspected
- **THEN** documentation authoring adds no filesystem, Catalog, CLI, browser, Markdown-rendering, or network dependency to `@ctxindex/extension-sdk`

### Requirement: Acquisition and activation remain separate
Current Catalog and explicit-path acquisition SHALL hand materialized package roots and safe provenance to source-neutral manifest-entry, collection, exact-selection, and activation seams. Package entries MUST come from `package.json` `ctxindex.extensions` and identify module files, not export symbols.

Persisted direct local/Git/npm installation, generic provenance, trust, update/uninstall, and CLI belong to a dependent OpenSpec change. That change MUST reuse ecosystem package dependency resolution and MUST NOT add a ctxindex dependency solver or alternate activation path.

#### Scenario: Catalog uses reusable prerequisites
- **WHEN** Catalog acquisition resolves an immutable materialized package snapshot
- **THEN** it delegates its declared entries and provenance to the common seams
