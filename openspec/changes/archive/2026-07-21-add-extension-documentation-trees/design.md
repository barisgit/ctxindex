## Context

The merged ergonomic SDK deliberately removed embedded definition documentation and uses stable ids for Providers, Adapters, and Extensions while Profiles retain `(id, version)`. Built-ins are bundled into a relocated Bun executable, while trusted external Extensions can be TypeScript, JavaScript, or already-acquired package code. The package-entry collector already retains each acquired entry module path as provenance. This change consumes that source-neutral provenance without restoring a host factory or inventing caller introspection.

Extension authors need setup, provider, Adapter, Profile, guide, and image documentation to travel with the Extension. Later CLI, agent, and local-web consumers need one safe deterministic projection that keeps authored guidance separate from schema-generated truth.

## Goals / Non-Goals

**Goals:**

- One normal authoring declaration: `docs("./docs")` on an Extension.
- One real directory with conventional routes for overview, Providers, Adapters, Profiles, guides, and assets.
- The same deterministic projection for raw local TypeScript/JavaScript, an already-acquired npm Extension, and compiled built-ins.
- Safe eager resolution to plain strings/bytes before registry activation.
- Canonical version-aware routes with deterministic unversioned aliases only when unambiguous.
- A transport-neutral projection suitable for later CLI, agent, and web consumers.

**Non-Goals:**

- Catalog schema changes, npm/package acquisition, or package execution. Issue #59 owns package-backed Catalog acquisition.
- A CLI command, local web application, hosted docs site, remote documentation fetch, arbitrary HTML execution, or new Extension command surface.
- Per-definition or per-file docs imports, implicit filesystem discovery, caller inspection/macros, or source paths in loaded values.
- Replacing #62's Provider/Adapter SDK design or adding compatibility aliases.

## Decisions

### The helper returns a plain descriptor; the loader binds provenance

`docs("./docs")` returns only `{ kind: "directory", path: "./docs" }`. It does not inspect its caller, capture `import.meta.url`, run a macro, read files, or receive a host object. The #62 Extension loader already knows the acquired definition module URL and binds the descriptor to that URL before registry activation. Exactly one Extension documentation declaration is allowed: either this directory descriptor or a generated virtual tree containing eager plain strings/bytes.

Raw TS/JS and already-acquired npm Extensions resolve the relative directory from their definition module URL. Built-ins are resolved during package/build staging while source module URLs and files exist, then embedded as generated virtual trees in the compiled Bun artifact. The runtime registry therefore receives only resolved values and never depends on checkout layout.

### One conventional tree with version-aware Profile routes

The directory is:

```text
docs/
  README.md
  providers/<id>.md
  adapters/<id>.md
  profiles/<id>@<version>.md
  guides/<safe-name>.md
  assets/<safe-relative-path>
```

`README.md` is required. Other directories are optional. Provider and Adapter routes bind by stable id. Profile `<id>@<version>.md` routes bind by exact versioned identity, never object identity. A projection may expose an unversioned Profile `<id>.md` alias only when exactly one loaded canonical Profile document has that ID. If two Profile versions exist, the alias is absent and exact routes remain available. Optional YAML frontmatter is limited to `title`, `summary`, and `order`; identity and runtime facts always come from definitions.

### Fixed closed security policy

A tree contains at most 256 files and 8 MiB total decoded content. `README.md` and each Markdown file are at most 256 KiB; frontmatter is at most 16 KiB; each asset is at most 2 MiB; each UTF-8 relative path is at most 512 bytes; each Markdown document has at most 512 links/assets and the tree at most 4,096 references. Directory depth is at most 8 below `docs/`.

Markdown must be UTF-8 and may use ordinary CommonMark constructs, but raw HTML blocks, inline HTML, HTML comments, and embedded SVG are rejected. The only asset media types are `image/png`, `image/jpeg`, `image/gif`, and `image/webp`, verified from bytes rather than extension alone. Local documents/assets use contained normalized relative links. Fragment-only links and absolute `https://` links are allowed; protocol-relative, `http:`, `data:`, `javascript:`, `file:`, and every other scheme are rejected. Remote images are rejected and no URL is fetched.

Paths reject absolute forms, backslashes, NULs, empty/dot/parent segments, duplicate or Unicode-case-fold-ambiguous entries, and symlinks of any kind. Local references must resolve to an existing permitted file inside the tree. Browser consumers remain required to sanitize rendered Markdown and must disable raw HTML, script/event attributes, unsafe URL schemes, and network-loaded media even though core already validates content. Validation is defense in depth, not a browser trust signal.

### Resolve eagerly into one transport-neutral projection

Directory and virtual declarations normalize through the same validator into immutable files: Markdown as plain strings and allowed assets as plain bytes with verified media type. Loaded values contain no module URL, source directory, lazy reader, callback, or deferred filesystem/network lookup.

Author Markdown remains distinct from deterministic generated references derived from validated Provider, Adapter, Profile, configuration-schema, capability, and Action definitions. Each projected item identifies its Extension and definition identity, canonical logical path, authored/generated origin, content kind, and media type. Generated truth cannot be overridden by Markdown/frontmatter. This change exposes this projection in core but adds no CLI or web consumer.

### Catalog and acquisition remain outside this change

Documentation is resolved only after some external loader has already acquired a trusted Extension and supplied its definition module URL. Existing inline Catalog loading may pass its acquired module URL through the same loader, but this change adds no Catalog manifest kind, package descriptor, downloader, package-manager invocation, lifecycle hook, persistence field, or installation behavior. Issue #59 owns package-backed acquisition.

## Risks / Trade-offs

- [Embedding assets grows packages/binaries] → fixed per-file/aggregate bounds and archive-size tests.
- [Definition IDs may contain route-sensitive characters] → current registry identity validation and documentation path normalization must agree; canonical routes are tested with every supported ID character.
- [Raw and bundled module locations differ] → loader-owned URL binding plus build-time built-in resolution; relocation tests compare logical content.
- [Strict passive Markdown rejects some familiar content] → clear diagnostics and a deliberately small raster-only asset surface.
- [Unversioned Profile convenience can hide ambiguity] → aliases exist only for exactly one loaded Profile version and multi-version tests prove their absence otherwise.

## Migration Plan

No persisted user or Catalog state changes. Built-ins and examples adopt the sidecar convention on the merged SDK. Package/build staging resolves built-in directories into virtual trees for compiled output. Existing Extensions without docs remain loadable.

## Open Questions

None. Security bounds, media types, route identity, helper binding, consumer scope, and Catalog ownership are fixed by this design.
