# apps/cli/src/docs/

## Responsibility

Implements the offline documentation CLI surface: embeds a product-documentation snapshot at build time, combines it with loaded Extension documentation, and exposes typed list, exact retrieval, and bounded text search.

## Design / patterns

- `manifest.macro.ts` is a Bun compile-time manifest builder. It recursively reads the configured authored-documentation root, converts supported MDX presentation components to passive Markdown, admits only signature-checked image assets, rewrites internal source links to normalized logical paths, validates every resulting reference, and serializes bounded content as Base64.
- The manifest builder rejects symlinks, unsupported entries or frontmatter, unsafe/non-normalized paths and links, duplicate or case-fold-colliding paths, invalid UTF-8, broken internal references, and per-file, total-size, depth, count, and reference-count limit violations.
- `resolve.ts` decodes the embedded manifest into a core `DocumentationSource`; Markdown uses fatal UTF-8 decoding and assets remain byte arrays.
- `command.ts` composes the bundled source with the documentation projection from `loadCliDefinitions()`. Safe inventory/search projections expose only public fields, while `copyExactOutput()` uses a private temporary file plus hard-link creation so `--output` never overwrites an existing path.

## Data & control flow

1. Bun evaluates `buildBundledDocumentationManifest()` through the macro import in `resolve.ts`; the compiled CLI therefore contains bundled documentation without runtime source-tree reads or a web runtime dependency.
2. A `docs list`, `docs get`, or `docs search` invocation loads current Extension definitions, prints host-generated diagnostics, and constructs one core `DocumentationService` over bundled and Extension sources.
3. `list` emits safe metadata; `get` resolves one exact logical path and either writes inert Markdown exactly to stdout or atomically creates an explicit output file; `search` emits core-provided deterministic case-insensitive matches. `--extension` selects one exact loaded Extension.
4. Handlers render tab-separated text or JSON and map service/filesystem failures through `mapErrorToExit`; command descriptors wrap them with `runWithExit`.

## Integration points

- Registered by `../commands/docs.ts` as the `docs` group and ultimately by `main.ts`.
- Depends on `@ctxindex/core/documentation` for source validation, composition, retrieval, and search; `../definitions.ts` for Extension documentation projections and diagnostics; and `../format/exit.ts` for stable failure statuses.
- Bundled input is `apps/web/content/docs`, excluding the web-only CLI reference and navigation metadata paths configured in `manifest.macro.ts`.
