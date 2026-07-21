## ADDED Requirements

### Requirement: Comprehensive public Extension authoring guide
The public documentation MUST explain the accepted type-safe authoring graph for Providers, Profiles, Source Adapters, OAuth Apps, Extensions, documentation trees, and Catalogs, including stable identity, exact imports, providerless operation, capability/action consistency, and ordinary package dependency resolution.

#### Scenario: Author learns the graph
- **WHEN** an Extension author opens the SDK overview
- **THEN** the guide identifies which definition owns authentication, vocabulary, provider operations, public OAuth registration metadata, package composition, passive documentation, and optional curation without introducing textual leaf references or an Extension dependency resolver

### Requirement: Copyable mechanically checked examples
The repository MUST publish at least one complete providerless Extension example and one complete provider-backed Extension example that use the public SDK imports and are typechecked or tested by repository automation.

#### Scenario: Author copies a providerless example
- **WHEN** an author follows the providerless quickstart
- **THEN** the example defines a Profile, providerless Source Adapter, Extension root, manifest entry, and focused verification without synthesizing Provider, Account, Grant, or provider egress state

#### Scenario: Author copies a provider-backed example
- **WHEN** an author follows the provider-backed quickstart
- **THEN** the example defines or exactly imports a Provider and Profile, declares only Adapter-specific access, implements its declared operations or Actions, and composes one Extension root through the public SDK

### Requirement: Package, documentation, testing, and publication guidance
Extension authoring guidance MUST explain `package.json` `ctxindex.extensions` entries, direct npm/Git/local installation, exact dependency imports, documentation directory and generated virtual-tree forms, Markdown and verified image asset layout, focused testing, and optional Catalog curation and publication.

#### Scenario: Author prepares a package
- **WHEN** an author follows packaging guidance
- **THEN** they can expose one or more plain Extension exports from declared entry modules, include a passive documentation tree with assets, resolve dependencies through normal package tooling, and choose direct distribution without requiring a Catalog

#### Scenario: Curator adds an Extension to a Catalog
- **WHEN** a trusted curator follows Catalog guidance
- **THEN** the guide distinguishes literal and npm, Git, or local package entries, deterministic build, inert snapshot browsing, and the separate install trust gate without describing a hosted Marketplace service
