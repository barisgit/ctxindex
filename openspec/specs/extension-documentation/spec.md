# Extension Documentation Specification

## Purpose
Define bounded, passive Extension-owned documentation trees and the deterministic transport-neutral projection exposed by core.
## Requirements
### Requirement: One conventional Extension documentation declaration
An Extension that declares documentation SHALL declare exactly one documentation source, either `docs("./docs")` in relative-directory form or one generated virtual tree containing eager plain Markdown strings and asset bytes. `docs("./docs")` MUST return a plain relative directory descriptor without inspecting its caller, reading files, capturing a module URL, or invoking a macro. The Extension loader MUST bind that descriptor to the already-known definition-module URL before registry activation. A documentation tree MUST NOT require per-file imports.

#### Scenario: Loader binds a directory descriptor
- **WHEN** an already-acquired Extension module declares `docs("./docs")`
- **THEN** the helper returns a plain descriptor and the loader resolves `./docs` relative to that module's URL rather than the process working directory

#### Scenario: Extension declares both documentation forms
- **WHEN** an Extension supplies a directory descriptor and a generated virtual tree
- **THEN** the whole Extension is rejected before any definition activates

### Requirement: Conventional routes follow current definition identity
The tree MUST contain `README.md` and MAY contain `providers/`, `adapters/`, `profiles/`, `guides/`, and `assets/`. Provider and Adapter Markdown MUST use canonical paths `providers/<id>.md` and `adapters/<id>.md` that bind by stable id. Profile Markdown MUST use `profiles/<id>@<version>.md` and bind by exact `(id, version)`, never object identity. The projection MAY expose a Profile `<id>.md` alias only when exactly one loaded canonical Profile document has that ID; if multiple Profile versions are loaded, the alias MUST be absent.

#### Scenario: Provider and Adapter routes use stable ids
- **WHEN** `acme` Provider and `acme.calendar` Adapter documentation are loaded
- **THEN** `providers/acme.md` and `adapters/acme.calendar.md` bind to those exact definitions

#### Scenario: One Profile version has a convenience alias
- **WHEN** exactly one loaded canonical Profile document has ID `acme.event`
- **THEN** `profiles/acme.event.md` resolves deterministically to its exact versioned document

### Requirement: Fixed bounded passive documentation content
A documentation tree MUST contain at most 256 files, at most 8 MiB total decoded content, and depth at most 8 below its root. Each Markdown file MUST be valid UTF-8 and at most 256 KiB; its optional YAML frontmatter MUST be at most 16 KiB and limited to `title`, `summary`, and `order`. Each asset MUST be at most 2 MiB. Each UTF-8 relative path MUST be at most 512 bytes. Each Markdown file MUST contain at most 512 links/assets and the whole tree at most 4,096 references.

Only byte-verified `image/png`, `image/jpeg`, `image/gif`, and `image/webp` assets are allowed. Raw HTML blocks, inline HTML, HTML comments, SVG, unsupported media, and remote images MUST be rejected. Fragment-only links and absolute `https://` links are allowed but MUST NOT be fetched. Protocol-relative URLs and `http:`, `data:`, `javascript:`, `file:`, or any other URL scheme MUST be rejected.

#### Scenario: Active or oversized content is supplied
- **WHEN** a tree contains raw HTML, SVG, a 3 MiB image, or a `javascript:` link
- **THEN** the entire Extension is rejected with a documentation-path diagnostic before activation

### Requirement: Documentation paths and references remain contained
All tree paths and local Markdown references MUST be normalized relative POSIX paths contained within the tree. Absolute paths, backslashes, NULs, empty/dot/parent segments, duplicate or Unicode-case-fold-ambiguous entries, any symlink, missing targets, and tree escapes MUST reject the entire Extension. Local references MUST resolve to an existing permitted Markdown document or asset.

#### Scenario: Symlink or parent traversal is present
- **WHEN** a directory tree includes any symlink or `README.md` references `../secret.png`
- **THEN** no definition from the Extension activates and the diagnostic identifies the offending logical path

### Requirement: Directory and virtual documentation resolve to portable values
Directory and generated virtual declarations SHALL pass through the same normalization, path, content, media, reference, and bound validation. Resolution MUST complete before registry activation and yield only immutable Markdown strings or asset bytes with verified media type. Loaded documentation MUST NOT retain a module URL, host path, file URL, lazy reader, callback, or deferred filesystem/network lookup.

#### Scenario: Virtual tree matches directory validation
- **WHEN** a generated virtual tree contains the same invalid local link as a directory tree
- **THEN** both declarations fail with equivalent validation behavior

### Requirement: Authored documentation and generated reference are distinct
The system SHALL project authored documentation separately from deterministic reference data generated from validated loaded Provider, Adapter, Profile, configuration-schema, capability, and Action definitions. Every projected item MUST expose Extension identity and any applicable Provider, Adapter, or Profile identity, canonical path, authored/generated origin, content kind, and media type without source filesystem locations. Optional frontmatter MUST NOT redefine identity, schemas, authorization, capabilities, or Actions. Generated reference MUST NOT be overridden by authored content.

#### Scenario: Markdown claims an undeclared option
- **WHEN** Adapter Markdown describes a configuration flag absent from its loaded schema
- **THEN** generated reference omits that flag while the authored statement remains non-normative prose

### Requirement: Projection is transport-neutral and browser-safe by contract
Core SHALL expose one deterministic transport-neutral documentation projection consumed by the CLI documentation surface and suitable for future agent and local-web consumers. The CLI consumer SHALL emit Markdown as inert text or JSON, SHALL copy verified assets only to an explicit output path, and SHALL NOT interpret Markdown as terminal control, HTML, or executable content. Any browser consumer MUST sanitize rendered Markdown independently, disable raw HTML and script/event attributes, reject unsafe URL schemes, and prevent network-loaded media even after core validation.

#### Scenario: CLI retrieves validated Markdown
- **WHEN** the CLI retrieves a loaded Extension Markdown document
- **THEN** it emits the portable string without rendering HTML or resolving remote content

#### Scenario: Future browser renders validated Markdown
- **WHEN** a future local browser surface renders a projected Markdown document
- **THEN** it applies browser-side sanitization and does not treat core validation as trusted HTML

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

### Requirement: Daemon documentation projection is bounded portable data

When the daemon owns the loaded Extension registry, it SHALL expose Extension documentation list, exact-get, and bounded-search operations over its immutable passive projection through the typed local RPC contract. Inventory and search responses MUST NOT include document or asset content. Exact Markdown and metadata retrieval MUST return bounded UTF-8 text; exact asset retrieval MUST return bounded canonical Base64 whose decoded byte count matches the declared size and verified media type.

Every request and response MUST use strict bounded schemas. Invalid or oversized application output MUST fail as `result_too_large` rather than being truncated. The wire contract MUST NOT expose source filesystem paths, managed materialization paths, module or file URLs, deferred readers, callbacks, executable definitions, schemas, or provider state.

#### Scenario: Agent lists daemon-owned documentation

- **WHEN** a selected daemon lists its loaded Extension documentation
- **THEN** it returns only strict safe metadata rows and transfers no Markdown, generated metadata content, or image bytes

#### Scenario: Agent retrieves an image asset

- **WHEN** a selected daemon retrieves one exact verified Extension image asset
- **THEN** it returns canonical bounded Base64 with matching decoded size and no source location

#### Scenario: Application output exceeds protocol bounds

- **WHEN** the daemon's passive projection cannot fit the declared item, row-count, text, binary, or search-result bounds
- **THEN** the request fails with `result_too_large` and returns no partial projection
