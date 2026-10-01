## MODIFIED Requirements

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

## ADDED Requirements

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
Built-in, explicit-path, and installed Catalog Extensions MUST use the same factories, root collector, graph collector, conservative duplicate/conflict policy, complete-registry validation, and atomic activation. Manifest-backed explicit-path and Catalog packages MUST additionally use the same declared-entry resolver. An already acquired bundled module namespace MAY enter directly at the namespace root collector, but no origin MAY bypass collection/validation, pre-register or preselect roots/leaves, shadow by priority, or win by load order.

The exact same imported non-App definition object MAY coalesce when encountered repeatedly. Distinct same-identity values containing any function or Zod schema MUST conflict. Distinct genuinely pure declarative values MAY coalesce only through canonical structural equality. OAuth App duplicates MUST always conflict. Separate physical SDK/Zod copies remain valid authoring inputs, but their executable/schema-bearing definitions MUST NOT coalesce from matching version, integrity, commit, path, provenance, source text, or `Function#toString`. Root provenance is diagnostic only. Conflicts MUST reject atomically.

#### Scenario: Built-in uses common activation after distribution
- **WHEN** a bundled module namespace is already available
- **THEN** its exported roots still pass through the common collectors and complete-registry validator

#### Scenario: Independent executable copies conflict in either order
- **WHEN** separate materialized packages contribute distinct same-id definitions containing functions or Zod schemas and are loaded in either order
- **THEN** activation rejects in both orders without treating matching provenance or function text as equivalence

#### Scenario: Independent SDK copies remain collectable
- **WHEN** an entry authored with another physical SDK/Zod copy exports a structurally valid non-conflicting Extension
- **THEN** discriminator-based collection and validation accept it without `instanceof` or physical-copy identity checks

### Requirement: Installation prerequisites are source-neutral
Core SHALL expose source-neutral seams for `ctxindex.extensions` entry resolution, root collection, transitive graph collection, exact Extension selection, and complete candidate validation. Existing explicit-path and Catalog loading/install validation MUST delegate to these seams. The seams MAY retain supplied safe provenance but MUST NOT persist acquisition policy or resolve package dependencies.

Persisted direct installation from local, Git, npm, or package targets, including generic provenance, trust, update/uninstall, and CLI, is deferred to a dependent OpenSpec change. Catalog SHALL remain optional discovery. The dependent change MUST use package-manager dependency resolution before invoking these seams.

#### Scenario: Catalog delegates exact selection
- **WHEN** a Catalog snapshot supplies a materialized package root and exact Extension id
- **THEN** Catalog delegates manifest-entry resolution, collection, selection, and validation to source-neutral core

#### Scenario: Future installer reuses package boundary
- **WHEN** the dependent installer materializes a local, Git, or npm package and its dependencies
- **THEN** it passes the resulting package root to these seams without adding an Extension dependency resolver

### Requirement: Package entries identify contained modules
`package.json` `ctxindex.extensions` MUST be an ordered unique list of contained ESM entry module paths. Entries MUST name files rather than export symbols and MUST reject traversal, escaping symlinks, missing files, and ambiguous package roots before importing target code. Each entry is imported once and all Extension root exports are collected.

#### Scenario: Entry module exports two roots
- **WHEN** one path in `ctxindex.extensions` exports two Extensions
- **THEN** the module is imported once and both roots are collected

### Requirement: Compiled binary resolves ordinary package dependencies
The relocated Bun compiled-binary gate SHALL load a trusted external package whose `ctxindex.extensions` entry uses ordinary SDK imports, SDK-exported `z`, a relative TypeScript module, and a package-managed runtime dependency. The gate MUST run outside the repository under Bun 1.3.14 and prove common exported-value discovery without host injection or ctxindex dependency resolution.

#### Scenario: Relocated binary loads materialized package
- **WHEN** the compiled gate activates the self-contained fixture
- **THEN** its exported graph loads through the same collection and activation path as built-ins
