## Why

Extension authors can currently attach only a one-line summary to an Extension,
Profile, or Source Adapter. That leaves setup, provider constraints, examples,
and assets outside the loaded registry, gives agents no stable way to discover
author guidance, and makes bundled and relocated distribution inconsistent.

ctxindex needs one authoring convention that works for local TypeScript,
already-acquired npm packages, and compiled built-ins while preserving the
existing trusted-code and offline Catalog boundaries.

## What Changes

- Add Extension documentation trees, declared once by an Extension with
  `docs("./docs")`, and projected into deterministic Extension, Provider,
  Adapter, and version-aware Profile documentation views.
- Define the conventional documentation tree (`README.md`, `providers/`,
  `adapters/`, `profiles/`, `guides/`, and `assets/`), optional frontmatter,
  safe local Markdown links and assets, and eager virtual/programmatic files.
- Add runtime validation and provenance-aware resolution so documentation is
  portable across raw TypeScript, already-acquired npm package, and compiled
  built-in loading paths without restoring a host-owned Extension factory API.
- Expose a deterministic transport-neutral documentation projection suitable
  for later CLI, agent, or local-web consumers without implementing a consumer
  surface in this change.
- Preserve Catalog ownership: documentation is resolved only after an existing
  Extension loader has already acquired the Extension. Package-backed Catalog
  acquisition remains exclusively in issue #59.

Breaking change: Extension authors adopting documentation trees use the new
single Extension-level `docs("./docs")` declaration; the existing summary-only
documentation shape is superseded for the affected SDK foundation.

## Capabilities

### New Capabilities

- `extension-documentation`: Documentation tree authoring, validation, and
  transport-neutral projection contracts for loaded Extensions.

### Modified Capabilities

- `extension-loading`: Load documentation-bearing Extensions through the same
  validation path for built-in, explicit-path, and installed sources.
- `module-architecture`: Replace the temporary docs-field deferral with one
  Extension-owned sidecar declaration and provider-neutral core resolution.

## Impact

- Builds on merged issue #62's plain imported-value SDK foundation. Providers,
  Adapters, and Extensions have stable ids; Profiles retain `(id, version)`.
- Affects `@ctxindex/extension-sdk` authoring types/helpers, core registry and
  Extension loader, package build staging, and compiled relocation coverage.
- Documentation files and referenced assets become trusted Extension content.
  Path traversal, symlink escapes, oversized files, unsupported media, and
  unresolved/escaping local references must be rejected before registry
  activation. This change neither extends Catalog schemas nor acquires
  packages; external loaders provide an already-acquired definition-module URL.
