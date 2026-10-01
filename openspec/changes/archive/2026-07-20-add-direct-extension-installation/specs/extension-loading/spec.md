## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Direct installation loading is pinned and offline
The loader SHALL derive each directly installed package root from its strict persisted direct provenance and immutable managed materialization. Startup and loaded-Extension listing MUST NOT invoke package management, contact npm or Git, read an original local target, or mutate installation state. Loaded Extension inventory and diagnostics MUST expose deterministic generic direct provenance sufficient to identify source kind, sanitized requested target, exact resolved identity, and materialization digest.

If a direct record or materialization is missing, corrupt, or invalid, the loader MUST emit an Extension-scoped diagnostic, exclude that root from the active candidate, preserve stored Source/Resource state, and continue loading unrelated valid roots. It MUST NOT repair, reacquire, or silently switch the pin.

#### Scenario: Direct Extension loads after relocation
- **WHEN** valid direct provenance and its immutable materialization are moved together under a new ctxindex data root
- **THEN** startup derives the new managed path and loads the exact Extension without its original target or network access

#### Scenario: Invalid direct pin degrades without acquisition
- **WHEN** one persisted direct materialization is absent or fails integrity or Extension validation
- **THEN** the loader reports its generic provenance, leaves dependent Sources unavailable, loads unrelated valid roots, and performs no acquisition or state mutation
