# module-architecture Specification

## Purpose
TBD - created by archiving change deepen-module-architecture. Update Purpose after archive.
## Requirements
### Requirement: Implementation follows explicit module ownership
The repository MUST organize behavior by its domain owner, keep composition roots free of provider-specific implementations, use package manifests/imports for dependencies, and use one Extension activation boundary for every origin. The `@ctxindex/official` package MUST distribute official Provider, OAuth App, Source Adapter, transport, documentation-tree, and Extension-root implementations, while generic Adapter authoring contracts remain owned by `@ctxindex/extension-sdk`.

#### Scenario: Built-in integration locality
- **WHEN** a maintainer inspects a built-in integration
- **THEN** Provider auth/App-schema declarations are Provider-owned, Adapter behavior is Adapter-owned, vocabulary is Profile-owned, package dependencies are manifest-owned, and the Extension root only composes imported values
- **THEN** official implementations are distributed from `@ctxindex/official` without moving generic Adapter contracts out of `@ctxindex/extension-sdk`

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

The CLI is the sole agent-facing integration surface. CLI command entrypoints MUST limit themselves to parsing and validating arguments, invoking a declared application service boundary, formatting the result, mapping typed errors, and returning an exit code. For behavior assigned to the local daemon, that service boundary MUST invoke the daemon rather than compose the runtime or open storage in the CLI process.

The local daemon MUST be the application composition root for daemon-routed behavior. It MUST compose the provider-neutral runtime, storage, loaded Extension registry, and all daemon use-case orchestration, while provider-neutral business rules remain owned by core services and Source Adapters.

The separate private `@ctxindex/rpc` package MUST define a pure oRPC contract with `@orpc/contract` that owns exact bounded input, plain success output, and declared error schemas plus schema-derived types. Its router factory MUST use `implement(contract)` and contain only the narrow injected `DaemonRpcApplication` interface, exactly-once delegation, result-to-declared-error adaptation, and compatibility/cross-cutting middleware. Each handler MUST validate input, delegate exactly once, validate/serialize the plain success or declared error data, and MUST NOT implement use-case/business logic, inspect core error classes, select/iterate Sources, retry, access storage/providers/filesystem lifecycle, load Extensions, parse/format CLI data, or map exits. Compatibility expectations MUST be injected into router construction and middleware MUST NOT call an application method as hidden delegation. Bun HTTP/Unix-socket adapters MUST remain outside the package.

The injected application boundary MUST be recursively derived from the contract's inferred input/output tree and MUST NOT repeat a handwritten signature for every procedure. Failure declarations and validation MUST derive from one authoritative registry and MUST NOT maintain a second error alias map or handwritten failure-kind switch.

The separate private `@ctxindex/local-daemon` infrastructure package MAY be imported by daemon and CLI and MUST own only canonical config/data/state/cache and SQLite-path resolution, safe identity digests, endpoint discovery metadata, and retained exclusive/shared file-lease primitives. It MUST NOT contain RPC procedures/DTOs, oRPC/Bun HTTP adapters, database composition, application orchestration, core/provider/Extension behavior, CLI formatting, or exit mapping. The CLI MUST NOT import the daemon application.

CLI implementation code MUST NOT import `bun:sqlite` or `drizzle-orm/*`. It MUST NOT contain raw SQL literals for `INSERT`, `UPDATE`, `DELETE`, or `SELECT` statements.

CLI implementation code MUST NOT issue `fetch()` calls to provider APIs such as OAuth, Google, or Microsoft endpoints. Provider HTTP behavior belongs in provider-neutral core services or Source Adapters.

CLI implementation code MUST NOT generate ULIDs or UUIDs and MUST NOT encode schema column names. Identity assignment and schema knowledge are core concerns.

The OAuth host flow MAY bind a loopback-only socket and explicitly open a browser. State, callback, timeout, PKCE, token exchange, provider identity, and secret persistence MUST be owned by a provider-neutral core service; the CLI only selects definitions and invokes the declared application service boundary.

#### Scenario: Daemon-routed CLI command
- **WHEN** the CLI invokes behavior assigned to the local daemon
- **THEN** the CLI validates input and delegates a typed request without composing the runtime, opening storage, or implementing business behavior
- **THEN** the daemon-owned application service executes the same provider-neutral core behavior used by an in-process caller

#### Scenario: RPC procedure delegates without business logic
- **WHEN** an RPC procedure receives a valid typed request
- **THEN** its `implement(contract)` handler delegates exactly once to `DaemonRpcApplication`, validates/serializes a plain success or throws a declared typed error, and returns without applying use-case/domain policy, formatting CLI output, or selecting an exit code

#### Scenario: Pure contract owns the wire shape
- **WHEN** a client or future generator consumes the daemon contract
- **THEN** it can infer every procedure path, input, plain success output, and declared error without importing handlers or daemon application code

#### Scenario: Application shape follows the contract
- **WHEN** a procedure is added, removed, or changes input/output in the pure contract
- **THEN** the recursive injected application type changes with it without updating another procedure signature declaration

#### Scenario: Compatibility middleware does not hide a second delegation
- **WHEN** compatibility middleware checks a request
- **THEN** it uses immutable router expectations and does not invoke health or any other application method

#### Scenario: CLI and daemon share infrastructure without application coupling
- **WHEN** CLI discovers an endpoint or acquires a retained shared database lease and daemon acquires exclusive leases
- **THEN** both use `@ctxindex/local-daemon`, while CLI does not import `apps/daemon` and `@ctxindex/rpc` contains no lifecycle/filesystem implementation

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
