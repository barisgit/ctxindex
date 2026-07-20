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
Core SHALL expose one deterministic transport-neutral documentation projection suitable for future CLI, agent, and local-web consumers. This change SHALL NOT require a CLI or web consumer implementation. Any browser consumer MUST sanitize rendered Markdown independently, disable raw HTML and script/event attributes, reject unsafe URL schemes, and prevent network-loaded media even after core validation.

#### Scenario: Future browser renders validated Markdown
- **WHEN** a future local browser surface renders a projected Markdown document
- **THEN** it applies browser-side sanitization and does not treat core validation as trusted HTML
