# Documentation Consumption Specification

## Purpose
Define deterministic offline product and Extension documentation discovery, exact retrieval, asset copying, and bounded search through the CLI.
## Requirements
### Requirement: Deterministic offline documentation inventory

The CLI SHALL expose `docs list [--extension <id>] [--format json]` over a bounded build-time bundle of product documentation and the loaded Extension documentation projection. An omitted Extension selector SHALL list both origins. Every row MUST identify origin, logical path, content kind, media type, byte size, and any available title, summary, and Extension id without exposing source filesystem, module, checkout, or managed materialization paths.

Listing MUST perform no network access, package acquisition, Extension update, provider I/O, browser launch, or documentation rendering.

#### Scenario: Agent inventories all offline documentation

- **WHEN** an agent invokes `ctxindex docs list --format json`
- **THEN** it receives deterministic bundled and loaded Extension rows using only local validated state

#### Scenario: Exact Extension filter is unknown

- **WHEN** `--extension` names no loaded Extension documentation owner
- **THEN** the command fails as an unknown exact selector and does not fall back to bundled documentation

### Requirement: Exact documentation retrieval

The CLI SHALL expose `docs get <path> [--extension <id>] [--output <path>] [--format json]`. Without `--extension`, the path SHALL resolve only within bundled product documentation. With `--extension`, it SHALL resolve only within that exact loaded Extension's authored or generated projection. Paths MUST use the projection's normalized logical POSIX form and MUST NOT accept absolute paths, traversal, aliases that are ambiguous, or filesystem locations.

Markdown retrieval SHALL write authored text to stdout by default. JSON Markdown retrieval SHALL return one deterministic metadata object containing the text. Binary assets MUST require `--output`, MUST be copied exactly to that explicit path, and MUST return only safe metadata on stdout. A command MUST NOT write binary bytes to a terminal.

#### Scenario: Bundled guide is retrieved

- **WHEN** an agent invokes `ctxindex docs get getting-started.md`
- **THEN** the exact bundled Markdown is emitted without a network or web runtime

#### Scenario: Extension image is requested without output

- **WHEN** an exact Extension documentation path resolves to an image and `--output` is omitted
- **THEN** the command exits with invalid usage before writing asset bytes

### Requirement: Bounded deterministic documentation search

The CLI SHALL expose `docs search <query> [--extension <id>] [--format json]`. Search SHALL consider Markdown title, summary, logical path, and content using case-insensitive textual matching, SHALL return deterministic ordering and bounded snippets, and SHALL never search or decode image bytes. It MUST use only the bundled documentation and currently loaded Extension documentation projection.

An empty query, unknown Extension selector, or unsupported option MUST fail before provider, package-manager, browser, or network activity.

#### Scenario: Search spans product and Extension guides

- **WHEN** an agent searches for a term without an Extension selector
- **THEN** matching bundled and Extension Markdown results are returned in deterministic origin, Extension, and path order

### Requirement: Bundled documentation is build-time exact

The installable CLI package SHALL embed a deterministic manifest and text payload generated from the canonical authored product documentation. Package construction MUST fail for duplicate or unsafe logical paths, invalid UTF-8, unsupported bundled asset types, broken local references, or configured count and byte bounds. Runtime documentation commands MUST NOT require the repository checkout, `apps/web`, Fumadocs, Next.js, or generated site state.

#### Scenario: Relocated executable reads product documentation

- **WHEN** the packaged executable and ctxindex state are relocated without the source checkout or network
- **THEN** `docs list`, `docs get`, and `docs search` continue to operate from embedded bytes

### Requirement: Generated reference remains separate from authored docs

Documentation commands MUST preserve authored product and Extension prose separately from generated loaded-definition reference. They MUST NOT treat authored claims as schema authority. Loaded Provider, Profile, Adapter, configuration, export, capability, and Action truth SHALL remain owned by `describe` and the generated Extension documentation projection.

#### Scenario: Authored guide disagrees with a loaded schema

- **WHEN** authored Markdown names an option absent from the loaded definition
- **THEN** `docs` may return the prose but `describe` and generated reference omit the undeclared option

### Requirement: Documentation follows exact runtime ownership

The CLI MUST keep bundled product documentation local to its build-time bundle. When no daemon is selected, the CLI SHALL load the current direct Extension documentation projection and compose it with the bundled source. When exact runtime discovery or a test-only selector selects a daemon, every Extension documentation list, get, and search operation MUST use that daemon's immutable loaded projection and MUST NOT load Extension code in the CLI process.

A selected-daemon transport, protocol, runtime, lifecycle, cancellation, or application failure MUST be surfaced through the stable daemon failure mapping and MUST NOT fall back to direct Extension loading. Combined bundled and daemon Extension list/search results MUST preserve deterministic bundled-first, Extension-id, and logical-path ordering.

#### Scenario: Selected daemon supplies Extension documentation

- **WHEN** an agent invokes `ctxindex docs list`, `docs get --extension`, or `docs search` while an exact daemon is selected
- **THEN** bundled rows come from the CLI bundle and Extension rows or content come only from the selected daemon's loaded projection

#### Scenario: Selected daemon request fails

- **WHEN** a documentation command selects a daemon but its Extension documentation request fails
- **THEN** the command returns the mapped daemon failure and does not import or load Extensions directly

#### Scenario: No daemon is selected

- **WHEN** a documentation command runs in established direct mode
- **THEN** it composes the bundled source with the directly loaded Extension documentation projection without requiring a daemon
