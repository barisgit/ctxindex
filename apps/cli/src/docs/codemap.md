# apps/cli/src/docs/

## Responsibility

Implements the offline documentation CLI surface: embeds a product-documentation snapshot and one portable Agent Skill at build time, combines product docs with loaded Extension documentation, and exposes typed list, exact retrieval, skill retrieval, and bounded text search.

## Design / patterns

- `manifest.macro.ts` is a Bun compile-time manifest builder. It recursively reads the configured authored-documentation root, converts supported MDX presentation components to passive Markdown, admits only signature-checked image assets, rewrites internal source links to normalized logical paths, validates every resulting reference, and serializes bounded content as Base64.
- The manifest builder rejects symlinks, unsupported entries or frontmatter, unsafe/non-normalized paths and links, duplicate or case-fold-colliding paths, invalid UTF-8, broken internal references, and per-file, total-size, depth, count, and reference-count limit violations.
- `resolve.ts` decodes the embedded manifest into a core `DocumentationSource`; Markdown uses fatal UTF-8 decoding and assets remain byte arrays.
- `service.ts` keeps the documented pre-initialization offline surface outside ensure, then ensures and retains an initialized runtime once. Pre-initialization and unsupported-platform direct mode compose the bundled source with the projection from `loadCliDefinitions()`; daemon mode keeps bundled docs local and delegates only Extension list/get/search through the typed RPC client, with no direct-load fallback after ensure.
- `agent-skill.macro.ts` embeds `skills/ctxindex/SKILL.md` at build time after fatal UTF-8 and exact frontmatter/body validation; `agent-skill.ts` exposes its frozen `{ name, description, byteSize, content }` independently of DocumentationService.
- `command.ts` contains presentation and explicit output handling. Safe inventory/search projections expose only public fields, while `copyExactOutput()` uses a private temporary file plus hard-link creation so `--output` never overwrites an existing path. `docs get-skill` prints, projects, or copies the embedded portable skill through this same boundary.

## Data & control flow

1. Bun evaluates `buildBundledDocumentationManifest()` through the macro import in `resolve.ts`; the compiled CLI therefore contains bundled documentation without runtime source-tree reads or a web runtime dependency.
2. A `docs list`, `docs get`, or `docs search` invocation first preserves its safe offline behavior when initialization evidence is absent. Initialized invocations ensure their route once. On an unsupported platform it loads current Extension definitions, prints host-generated diagnostics, and constructs one combined core service. With an exact daemon selection it keeps the embedded bundled service local and obtains Extension results only from the daemon's immutable projection.
3. `list` emits safe content-free metadata; `get` resolves one exact logical path and either writes inert Markdown exactly to stdout or atomically creates an explicit output file; `search` emits deterministic bounded matches. Combined results remain bundled-first and sorted by Extension id/path. `--extension` selects one exact loaded Extension.
4. Handlers render tab-separated text or JSON and map service/filesystem failures through `mapErrorToExit`; command descriptors wrap them with `runWithExit`.
5. `docs get-skill` resolves only the immutable build-time value and writes exact text, deterministic JSON, or an exclusive output file without Extension loading, daemon selection, or source-tree access.

## Integration points

- Registered by `../commands/docs.ts` as the `docs` group and ultimately by `main.ts`.
- Depends on `@ctxindex/core/documentation` for local source validation, composition, retrieval, and search; `../daemon/client.ts` for selected Extension documentation; `../definitions.ts` only in direct mode; and `../format/exit.ts` for stable failure statuses.
- Bundled documentation input is `apps/web/content/docs`, excluding the web-only CLI reference and navigation metadata paths configured in `manifest.macro.ts`. The separate portable skill input is `skills/ctxindex/SKILL.md`.
