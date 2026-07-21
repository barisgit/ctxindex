# Extension Documentation Implementation Doctrine

> This sidecar records implementation doctrine. Normative behavior is owned by [spec.md](spec.md).

## Ownership and representation

`@ctxindex/extension-sdk` owns the pure `docs('./docs')` descriptor and eager virtual-tree union. The descriptor carries no caller or module information. Core binds directory declarations to already-known acquired entry-module URLs, validates directory and virtual inputs through one resolver, strips the declaration before definition-registry validation, and retains only portable logical content. Documentation therefore does not participate in definition identity or executable equivalence.

`ResolvedDocumentationTree` contains sorted Markdown strings or copied image bytes plus safe logical metadata. `DocumentationProjection` exposes deterministic `list()` and exact `(extensionId, path)` `get()` queries. Projection entries distinguish `authored` Markdown/assets from `generated` JSON metadata derived from validated Provider, Adapter, Profile, Zod-schema, capability, export, and Action definitions. No entry exposes provenance paths or module URLs.

## Resolution and security

`packages/core/src/extension/documentation.ts` owns fixed file/depth/byte/reference bounds, fatal UTF-8 decoding, closed frontmatter, conventional route binding, local-reference containment, HTML and unsafe-URL rejection, and PNG/JPEG/GIF/WebP magic checks. Directory traversal uses `lstat`, rejects symlinks and special files, and sorts by Unicode code point before validation. Virtual input passes through the same normalization. Failures use branded path-scoped Extension diagnostics and occur before candidate activation.

Future browser consumers must still sanitize Markdown as untrusted display input, disable raw HTML and active attributes, enforce safe schemes, and prevent network-loaded media. Core validation is a portable-data boundary, not an HTML trust boundary.

## Daemon transport projection

When the daemon owns the active registry, its startup composition adapts the exact retained `DocumentationProjection` into one Extension-only core `DocumentationService`. The contract-derived daemon application exposes that service through a `documentation` family with list, exact-get, and search procedures. `@ctxindex/rpc` remains composition-only: it defines strict schemas and handler-free procedures but never imports Extension loading or documentation business logic.

Inventory DTOs carry Extension id, logical path, content kind, media type, byte size, and optional title/summary without content. Search DTOs carry the same logical identity plus bounded snippets. Exact text DTOs carry bounded UTF-8; exact assets carry canonical Base64 whose decoded size matches the declared byte count. All DTOs are closed, byte/count bounded, and omit module URLs, source or materialization paths, readers, callbacks, executable definitions, schemas, provider state, and diagnostics. Invalid application output becomes `result_too_large` rather than a partial or truncated response.

The existing protocol/runtime compatibility middleware and request-scoped cancellation wrap all three procedures. The daemon projection remains immutable for the daemon lifetime; changing installed Extensions or their documentation requires a later daemon restart rather than request-time reload.

## Distribution

External and installed package roots resolve `./docs` beside the module entry already imported by the package-entry seam. Built-in source directories live under `packages/adapters/src/builtin-documentation/`; `packages/adapters/scripts/generate-documentation.ts` resolves those descriptors with the shared core resolver and writes the embedded virtual module. Built-in freshness tests compare both forms, and the relocated compiled-host gate reads the embedded projection without checkout files.

Public authoring guidance is backed by repository example workspaces rather than documentation-only pseudo-APIs. Providerless and provider-backed examples import the public SDK facade, expose plain roots through package-owned `ctxindex.extensions` modules, resolve normal package dependencies before host loading, and exercise real package-entry/documentation discovery. The checked source remains authoritative when a guide presents a shortened excerpt.

Author examples and public projections must not expose OAuth App configuration, client ids from real applications, desktop-secret metadata, tokens, Grant state, or secret references. Reserved example endpoints and non-secret fixture App metadata keep provider-backed tests deterministic and offline. Focused tests verify manifest discovery, exact imported leaves, capability/operation consistency, normalized operation results, documentation routes/assets, and absence of live provider egress.
