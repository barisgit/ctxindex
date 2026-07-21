# packages/core/src/documentation/

## Responsibility

Provides a provider-neutral, in-memory Documentation application service that composes bundled product documentation and Extension documentation into deterministic list, exact-get, and bounded text-search operations.

## Design / patterns

- `DocumentationSource` is a small source-adapter seam; `createBundledDocumentationSource()` validates and indexes bundled items, while `createExtensionDocumentationSource()` adapts the already-resolved `DocumentationProjection`.
- `DocumentationService` is a read-only composition service. Sources return copied binary assets so callers cannot mutate retained bytes; collections and service objects are frozen.
- Documentation identity is `(origin, path)`: bundled content has one origin, while Extension content is keyed by exact Extension ID plus logical path. Unicode code-point sorting makes source and result order deterministic.
- Extension documentation normalization, safety policy, generated metadata, and cross-root compatibility remain owned by `extension/documentation.ts`; this capability only projects and queries its passive output.

## Data & control flow

1. The host supplies bundled `DocumentationItem` values and/or an Extension `DocumentationProjection`.
2. The bundled adapter validates canonical relative logical paths, exact byte lengths, content-kind compatibility, and duplicate paths. The Extension adapter copies projected assets, derives byte sizes and frontmatter title/summary, then indexes items by Extension ID and path.
3. `createDocumentationService()` flattens and deterministically sorts all source items, derives known Extension IDs, and exposes immutable `list`, `get`, and `search` operations.
4. `get()` validates the path and selects bundled content without an Extension filter or exact Extension content with one. `search()` accepts non-empty queries, searches Markdown title/summary/path/content case-insensitively, returns at most 100 results, and generates Unicode-safe 240-code-point snippets.

## Integration points

- Extension projection input: `packages/core/src/extension/documentation.ts` (`DocumentationProjection`, `DocumentationProjectionItem`).
- Error contract: `packages/core/src/errors.ts` (`CtxindexValidationError` and `CtxindexNotFoundError`).
- Public APIs: `packages/core/src/documentation/index.ts`, root `packages/core/src/index.ts`, and the `@ctxindex/core/documentation` package subpath.
- Current composition host: `apps/cli/src/docs/command.ts`, which combines `resolveBundledDocumentation()` with `LoadExtensionsResult.documentation`.
