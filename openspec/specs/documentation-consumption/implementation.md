# Documentation Consumption Implementation Doctrine

> This sidecar records implementation doctrine. Normative behavior is owned by [spec.md](spec.md).

## Composition boundary

`@ctxindex/core/documentation` owns the synchronous transport-neutral `DocumentationService`, source adaptation, exact selection, deterministic ordering, and bounded text search. The CLI owns only runtime selection, composition with its embedded product-documentation source, output formatting, and explicit asset copying.

The CLI command seam permits local synchronous results and selected-daemon asynchronous results without moving documentation semantics into command handlers:

```ts
type DocumentationListItem = Omit<DocumentationItem, 'content'>

interface DocsCommandService {
  list(input: {
    readonly extensionId?: string
  }): readonly DocumentationListItem[] | Promise<readonly DocumentationListItem[]>
  get(input: {
    readonly path: string
    readonly extensionId?: string
  }): DocumentationItem | Promise<DocumentationItem>
  search(input: {
    readonly query: string
    readonly extensionId?: string
  }): readonly DocumentationSearchResult[] | Promise<readonly DocumentationSearchResult[]>
}
```

One invocation selects its route once. Direct mode loads one local Extension definition snapshot and composes its projection with the bundled source. Selected-daemon mode keeps bundled get/list/search local and delegates only Extension operations through the generated RPC client. A selected request failure remains a daemon failure and never enters the direct loader. Combined inventory and search results use bundled-first, Extension-id, and logical-path ordering.

`docs get-skill` is a separate local leaf command over one immutable build-time value. It never enters `DocumentationService`, loads Extensions, or selects a daemon. Text output preserves the exact embedded `SKILL.md`; JSON projects its bounded frontmatter metadata and content. Explicit copying reuses the documentation command's owner-private temporary-file and exclusive-link publication boundary.

## Presentation and verification

Inventory and search use content-free values. Exact Markdown and generated metadata remain inert strings. Exact assets become bytes only after strict RPC output validation and still require an explicit destination; atomic hard-link publication prevents overwrite.

Focused tests cover direct composition, selected-daemon routing, bundled-only retrieval, portable skill text/JSON/copy behavior, deterministic merging, binary decoding, and fail-closed selection. Compiled tests cover relocated bundled docs, byte-exact portable skill retrieval, and selected-daemon Extension retrieval over the Unix transport. CLI thinness, typecheck, and no-business-logic gates protect the boundary.
