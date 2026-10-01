# Extension Loading Specification

## Purpose
Define trusted Extension loading, validation, compiled-binary compatibility, and degraded behavior when an Extension is unavailable.
## Requirements
### Requirement: Definition ids have one route-safe grammar
Extension, Provider, Profile, and Adapter ids MUST be at most 128 ASCII characters and consist of lowercase alphanumeric segments separated by a single `.`, `_`, or `-`. Registry validation MUST reject every other id before activation so authored and generated documentation paths use the exact id without lossy encoding or collision.

#### Scenario: Definition id cannot round-trip through a bounded route
- **WHEN** a definition id contains a slash, ill-formed surrogate, uppercase character, repeated separator, or more than 128 characters
- **THEN** the containing Extension is rejected before activation

### Requirement: Explicit-path trusted Extension package loading
For V1, the system SHALL load trusted external TypeScript or JavaScript Extension packages from explicitly configured local package-root paths by resolving their `package.json` `ctxindex.extensions` module entries and importing them in-process. External Extensions MUST use public definition contracts, MUST NOT import ctxindex runtime code, and SHALL receive runtime facilities only through host-provided capability contexts.

#### Scenario: External TypeScript Extension package loads by explicit path
- **WHEN** configuration names a valid trusted external package root whose manifest declares a `.ts` entry module
- **THEN** the system resolves the contained entry, imports it once, validates all exported Extension roots, and activates their definitions in-process

#### Scenario: Undeclared discovery is not required
- **WHEN** an Extension exists only in an auto-discovery, git, or package-registry location
- **THEN** V1 does not need to discover or install it unless its local path is explicitly configured

### Requirement: Atomic validation and capability consistency
For V1, core SHALL validate an Extension as a unit before activation, including definition schemas, id uniqueness, supported Profile bindings, and consistency between Adapter capability or Action declarations and implementations as required by this Extension validation contract. An invalid Extension MUST be rejected whole with a diagnostic.

#### Scenario: Missing capability implementation rejects Extension
- **WHEN** an Adapter declares `retrieve` but provides no retrieve implementation
- **THEN** the containing Extension is rejected before any of its definitions activate

#### Scenario: Extra Action implementation rejects Extension
- **WHEN** an Adapter implements an Action not declared by one of its supported Profiles
- **THEN** the containing Extension is rejected with a capability-consistency diagnostic

### Requirement: Compiled binary loads external TypeScript
For V1, the compiled Bun binary SHALL load explicit-path external TypeScript Extensions while running outside the project tree. The project MUST remain pinned to Bun 1.3.14, and `apps/cli/src/e2e/compiled-extension.e2e.test.ts` SHALL pass.

#### Scenario: Relocated binary loads an external Extension
- **WHEN** the compiled Extension e2e test runs a relocated compiled binary from outside the repository against an external TypeScript Extension with its own dependencies
- **THEN** the Extension loads successfully under Bun 1.3.14

### Requirement: Missing Extension preserves materialized data
For V1, removing or failing to load an Extension SHALL make its Sources unavailable for sync and provider operations while preserving their locally synced Resources as specified by this degraded Extension loading contract. Extension absence MUST NOT delete data; deletion requires an explicit Source removal or purge operation.

#### Scenario: Removed Extension degrades to local envelope search
- **WHEN** a previously active Extension is no longer available
- **THEN** its Sources remain listed as unavailable and their synced Resources remain locally searchable with envelope-level degradation where vocabulary is missing

### Requirement: External Extension proves the public seam
For V1, at least one external tenders Extension SHALL load outside the compiled binary and exercise the same public Profile, Adapter, and Extension contracts as bundled definitions.

#### Scenario: Tenders Extension participates through generic operations
- **WHEN** the external tenders Extension is loaded from its configured path
- **THEN** its definitions appear in registries and its Resources can be served through generic ctxindex operations without bundled-only hooks

### Requirement: Adapter capabilities and normalized operations
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

An adapter declares a set of boolean capability flags: `sync`, `search-remote`, `retrieve`, `download`, plus an Action implementation map keyed by Profile Action id. Declaring a capability or Action REQUIRES implementing it; omitting it FORBIDS it:

- `sync` — cursor-driven generator emitting resource upsert/tombstone/cursor operations;
- `search-remote` — translate a ctxindex query to the provider's search API, returning envelope-level results with refs;
- `retrieve` — fetch one complete resource by ref;
- `download` — stream one artifact's bytes by artifact ref into the managed store.
- Action implementation — validate and execute one Profile-declared mutation through a Source, returning the declared normalized output.

An adapter MUST NOT implement an Action that no supported Profile declares. Core MUST validate capability and Action consistency when building registries. Action support is source-discoverable and is not a license for arbitrary Extension CLI commands.

Search routing mode is NOT a capability. Routing precedence is: CLI flag (`--local-only` / `--remote`) over per-source configuration over adapter decision. The default is hybrid orchestration in which each source answers per its adapter's routing choice, which SHOULD consult sync coverage.

#### Scenario: Declared Adapter capabilities match implemented operations
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Extension definitions and degraded loading
Extensions are trusted TS/JS packages loaded in-process. Their entry modules MUST use ordinary imports and export plain Extension values. The host MUST NOT inject Zod/factories or invoke an authoring callback. The SDK SHALL export supported `z`.

A package MUST declare contained entry module paths in `package.json` `ctxindex.extensions`. Package managers and exact TypeScript imports MUST resolve dependencies before ctxindex loads the materialized package. ctxindex MUST NOT resolve an Extension dependency graph.

Core MUST collect exported Extension roots, transitively collect Provider/Profile leaves reachable through their Adapters and OAuth Apps plus optional explicit standalone leaves, structurally validate the complete graph, apply the conservative duplicate/conflict policy, and activate atomically. Exact object reuse MAY deduplicate but MUST NOT define semantic identity or precedence. Binding MUST NOT choose a winner through object identity, `instanceof`, physical SDK copy, root provenance, load order, or origin priority.

When Extension code is absent or fails, its Sources become unavailable while synced Resource envelopes and versioned Profile payload data remain stored and searchable where operations do not require the missing code. Removing code MUST NOT silently delete data. Vocabulary that requires a currently loaded Profile MUST be reported unavailable rather than supplied through an implicit foundational Extension.

#### Scenario: Ordinary package replaces host injection
- **WHEN** an entry imports exact definitions and `z` from installed dependencies and exports an Extension value
- **THEN** the loader validates it without constructing or invoking an authoring host

#### Scenario: Missing package preserves stored data honestly
- **WHEN** an Extension package is removed
- **THEN** its Sources are unavailable, stored Resources are not deleted, and no nonexistent always-selected Profile root is assumed

### Requirement: Exported plain Extension roots and reachable leaves are collected
The system SHALL inspect top-level ESM namespace values from trusted declared entry modules. Every exported value carrying the Extension discriminator MUST be structurally validated and considered for atomic activation. Unrelated exports and supporting leaf exports MUST NOT independently activate. Malformed claimed roots MUST produce export-scoped provenance diagnostics. Functions in the removed callback shape MUST NOT be invoked.

For each root, the collector MUST follow exact Profile and optional Provider values contained by Adapters and exact Provider values contained by OAuth Apps. Explicit root Provider/Profile arrays MUST contribute only standalone leaves. The collector MUST NOT require or infer an Extension dependency edge.

#### Scenario: Module exports multiple Extensions
- **WHEN** one declared entry exports multiple valid Extension roots
- **THEN** each root and its reachable graph are collected without metadata naming export symbols

#### Scenario: Old callback is not invoked
- **WHEN** an entry exports only a function using the old callback shape
- **THEN** loading reports no supported Extension root and never calls it

#### Scenario: Imported leaves need no duplicate array
- **WHEN** an Extension Adapter imports its Provider and Profiles
- **THEN** those leaves enter the candidate graph transitively even when root standalone arrays omit them

#### Scenario: Providerless graph remains provider-free
- **WHEN** a root contains only providerless Adapters
- **THEN** collection and activation synthesize no Provider, Account, Grant, Provider access, or Provider egress state

### Requirement: All origins share one activation path
Built-in, explicit-path, installed Catalog, and directly installed Extensions MUST use the same factories, declared-entry resolver, root collector, graph collector, conservative duplicate/conflict policy, complete-registry validation, and atomic activation. Built-ins MAY be bundled and acquisition MAY differ, but no origin MAY bypass collection/validation, pre-register leaves, shadow by priority, or win by load order.

The exact same imported non-App definition object MAY coalesce when encountered repeatedly. Distinct same-identity values containing any function or Zod schema MUST conflict. Distinct genuinely pure declarative values MAY coalesce only through canonical structural equality. OAuth App duplicates MUST always conflict. Separate physical SDK/Zod copies remain valid authoring inputs, but their executable/schema-bearing definitions MUST NOT coalesce from matching version, integrity, commit, path, provenance, source text, or `Function#toString`. Root provenance is diagnostic only. Conflicts MUST reject atomically.

#### Scenario: Built-in uses common activation after distribution
- **WHEN** a bundled module namespace is already available
- **THEN** its exported roots still pass through the common collectors and complete-registry validator

#### Scenario: Direct materialization uses common activation after acquisition
- **WHEN** a direct installer supplies an immutable materialized package and exact Extension id
- **THEN** the selected root passes through the same collectors and complete-registry validator as every other origin

#### Scenario: Independent executable copies conflict in either order
- **WHEN** separate materialized packages contribute distinct same-id definitions containing functions or Zod schemas and are loaded in either order
- **THEN** activation rejects in both orders without treating matching provenance or function text as equivalence

#### Scenario: Independent SDK copies remain collectable
- **WHEN** an entry authored with another physical SDK/Zod copy exports a structurally valid non-conflicting Extension
- **THEN** discriminator-based collection and validation accept it without `instanceof` or physical-copy identity checks

### Requirement: Installation prerequisites are source-neutral
Core SHALL expose source-neutral seams for `ctxindex.extensions` entry resolution, root collection, transitive graph collection, exact Extension selection, and complete candidate validation. Existing explicit-path, Catalog, and direct package loading/install validation MUST delegate to these seams. The seams MAY retain supplied safe provenance but MUST NOT persist acquisition policy or resolve package dependencies.

Direct installation from local, Git, and npm package targets MUST use package-manager dependency resolution before invoking these seams and MUST retain generic provenance outside the source-neutral loader. Catalog SHALL remain optional discovery. No installation origin may introduce an Extension dependency resolver or alter the identity and conflict rules.

#### Scenario: Catalog delegates exact selection
- **WHEN** a Catalog snapshot supplies a materialized package root and exact Extension id
- **THEN** Catalog delegates manifest-entry resolution, collection, selection, and validation to source-neutral core

#### Scenario: Direct installer delegates exact selection
- **WHEN** the direct installer materializes a local, Git, or npm package and its dependencies
- **THEN** it passes the resulting package root and exact Extension id to the source-neutral seams without adding an Extension dependency resolver

### Requirement: Catalog package installation delegates to canonical exact replay

Catalog installation SHALL delegate source replay, declared-module discovery,
exact selection, validation, managed publication, collision enforcement, and
record persistence to the canonical generic installer's `installExact`
operation.

Literal entries SHALL select by exact module, Catalog id, entry index, and
Extension id after author-package replay. Package entries SHALL select the exact
Extension id after package replay. Neither form SHALL make sibling roots active.

#### Scenario: Catalog package entry is installed

- **WHEN** a trusted Catalog install selects a package-backed entry
- **THEN** the canonical installer reproduces and publishes it using its recorded
  exact source, sanitized lock, package root, and materialization digest

#### Scenario: Literal author package is installed

- **WHEN** a trusted Catalog install selects a literal entry
- **THEN** the canonical installer replays the author package, verifies the exact
  locator, and publishes complete managed runnable bytes

### Requirement: Direct installation loading is pinned and offline
The loader SHALL derive each directly installed package root from its strict persisted direct provenance and immutable managed materialization. Startup and loaded-Extension listing MUST NOT invoke package management, contact npm or Git, read an original local target, or mutate installation state. Loaded Extension inventory and diagnostics MUST expose deterministic generic direct provenance sufficient to identify source kind, sanitized requested target, exact resolved identity, and materialization digest.

If a direct record or materialization is missing, corrupt, or invalid, the loader MUST emit an Extension-scoped diagnostic, exclude that root from the active candidate, preserve stored Source/Resource state, and continue loading unrelated valid roots. It MUST NOT repair, reacquire, or silently switch the pin.

#### Scenario: Direct Extension loads after relocation
- **WHEN** valid direct provenance and its immutable materialization are moved together under a new ctxindex data root
- **THEN** startup derives the new managed path and loads the exact Extension without its original target or network access

#### Scenario: Invalid direct pin degrades without acquisition
- **WHEN** one persisted direct materialization is absent or fails integrity or Extension validation
- **THEN** the loader reports its generic provenance, leaves dependent Sources unavailable, loads unrelated valid roots, and performs no acquisition or state mutation

### Requirement: Package entries identify contained modules
`package.json` `ctxindex.extensions` MUST be an ordered unique list of contained ESM entry module paths. Entries MUST name files rather than export symbols and MUST reject traversal, escaping symlinks, missing files, and ambiguous package roots before importing target code. Each entry is imported once and all Extension root exports are collected.

#### Scenario: Entry module exports two roots
- **WHEN** one path in `ctxindex.extensions` exports two Extensions
- **THEN** the module is imported once and both roots are collected

### Requirement: Catalog root discovery uses declared package entry modules

Trusted Catalog build and install SHALL discover Extension and Catalog roots
only from package-declared entry modules after the canonical installer has
materialized the exact package. A module MAY expose both Extension and Catalog
roots. Undeclared files, sibling exports, and nested Catalog values SHALL NOT be
discovered implicitly.

Catalog add, refresh, list, show, search, and startup SHALL NOT perform this
discovery or import any Catalog-controlled module.

#### Scenario: One module exposes Extension and Catalog roots

- **WHEN** a declared module exports both root kinds during trusted build or
  exact install
- **THEN** discovery returns both for explicit exact selection without installing
  siblings implicitly

#### Scenario: Undeclared file exports a Catalog

- **WHEN** a package contains a Catalog export in a file absent from its declared
  entry modules
- **THEN** build and install ignore that file

### Requirement: Compiled binary resolves ordinary package dependencies
The relocated Bun compiled-binary gate SHALL load a trusted external package whose `ctxindex.extensions` entry uses ordinary imports from the packed public `@ctxindex/extension-sdk` artifact, SDK-exported `z`, a relative TypeScript module, and a package-managed runtime dependency. The gate MUST run outside the repository under Bun 1.3.14 and prove common exported-value discovery without workspace links, host injection, or ctxindex dependency resolution.

#### Scenario: Relocated binary loads materialized package
- **WHEN** the compiled gate activates a clean external package installed against the exact packed SDK artifact
- **THEN** its exported graph loads through the same collection and activation path as built-ins without resolving the source workspace

### Requirement: Acquired Extensions share documentation loading
Trusted built-in, explicit-path TypeScript/JavaScript, existing installed inline, and already-acquired external-package Extensions SHALL resolve and validate documentation through the same Extension loading and atomic registry activation path. The loader MUST bind a directory descriptor to its already-known definition-module URL before registry activation. This change MUST NOT add package acquisition, a Catalog package schema, caller inspection, macros, or a core-supplied Extension factory. A documentation failure MUST reject the Extension whole with a path-scoped diagnostic.

#### Scenario: External loader supplies an acquired package module
- **WHEN** an external loader has already acquired an npm package and supplies its definition-module URL
- **THEN** ctxindex resolves that Extension's relative docs without downloading, installing, or executing package-manager behavior

#### Scenario: Exact selection isolates unselected sibling documentation
- **WHEN** an exact-id loader selects one root from a multi-root package whose unselected sibling has invalid or missing documentation
- **THEN** the loader resolves and validates only the selected root's documentation, while a whole-package multi-root load still validates every collected root

### Requirement: Compiled built-ins embed resolved documentation
The compiled built-in packaging path SHALL resolve directory descriptors while their definition-module URLs and source files are available, validate them through the shared documentation rules, and embed generated virtual trees in the compiled artifact. A relocated compiled CLI MUST NOT need the source checkout or captured module paths to expose the same logical projection.

#### Scenario: Relocated compiled built-in retains documentation
- **WHEN** a compiled CLI is relocated outside the repository
- **THEN** its built-in Extension documentation matches the source projection using embedded strings/bytes only

### Requirement: Installed Catalog Extension loading and provenance
Startup SHALL load Catalog-curated Extensions only from the package root and
materialization identified by the authoritative generic installed-extension
record. It SHALL report the record's optional Catalog curation provenance
together with exact generic source provenance.

Startup SHALL NOT read a Catalog snapshot to reconstruct an Extension, invoke
Bun, fetch a source, resolve dependencies, import an author checkout, scan for
alternate generations, or repair records implicitly. There SHALL be no active
generation pointer or Catalog-specific execution state.

#### Scenario: Catalog-curated Extension starts offline

- **WHEN** a Catalog-curated package or literal Extension has a valid generic
  record and managed materialization while network, Bun, and Catalog sources are
  unavailable
- **THEN** it loads from managed bytes and reports its stored Catalog and exact
  source provenance

#### Scenario: Generic record document is corrupt

- **WHEN** the strict generic record document cannot be validated
- **THEN** managed Extension loading fails closed without scanning managed bytes
  for a replacement record

### Requirement: Missing or invalid installed snapshots degrade without fetch
Startup SHALL degrade invalid managed materializations without fetch. When a
valid generic record references a missing, altered, or unloadable managed
materialization, startup SHALL degrade that Extension with a deterministic
record/path error and SHALL continue according to the existing per-Extension
degradation contract. It SHALL NOT fetch, invoke Bun, consult Catalog snapshots,
or mutate installed state.

#### Scenario: Generic execution materialization is missing

- **WHEN** a valid Catalog-curated generic record references managed bytes that
  are absent
- **THEN** startup reports that Extension as degraded and performs no recovery or
  acquisition

### Requirement: Daemon-owned Extension registry lifetime
The daemon SHALL complete the existing Extension loading and validation contract once during startup and SHALL establish one active registry before reporting ready. Business requests MUST use that daemon-owned registry and MUST NOT import, validate, or activate Extensions per request. Configuration or Extension-file changes made after readiness MUST NOT alter the active registry until a later daemon start.

#### Scenario: Repeated requests reuse one registry
- **WHEN** multiple business requests execute during one daemon lifetime
- **THEN** they use the same validated active registry without reloading Extension modules

#### Scenario: Extension change waits for restart
- **WHEN** Extension configuration or local Extension files change after the daemon reports ready
- **THEN** the active registry remains unchanged until the daemon is shut down and a later daemon starts

### Requirement: Daemon startup performs no Extension acquisition
Daemon startup and request handling MUST load only bundled Extensions and configured Extension material already present locally under the existing Extension loading contracts. They MUST NOT discover, fetch, install, update, or otherwise acquire Extension Catalogs or Extension code. Missing or invalid configured Extension material SHALL follow the existing diagnostic and degraded-availability contracts without triggering acquisition.

#### Scenario: Installed Extension material is available locally
- **WHEN** daemon startup resolves configured Extension material that is already present locally
- **THEN** it loads and validates that material without contacting or updating a catalog

#### Scenario: Configured Extension material is absent
- **WHEN** configured Extension material is not present locally during daemon startup
- **THEN** startup emits the existing loading diagnostic and performs no catalog or Extension acquisition
