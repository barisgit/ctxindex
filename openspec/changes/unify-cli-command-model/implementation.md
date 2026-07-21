## Capability Implementation Targets

- `cli-surface` → `openspec/specs/cli-surface/implementation.md`
- `documentation-consumption` → `openspec/specs/documentation-consumption/implementation.md`
- `extension-documentation` → `openspec/specs/extension-documentation/implementation.md`
- `extension-installation` → `openspec/specs/extension-installation/implementation.md`

## Module Ownership

`@ctxindex/cli` owns the Citty composition tree, generic strict argument validation, complete-path help projection, generated command reference, presentation, and delegation. Command modules may resolve dynamic argument definitions but do not parse raw tokens or implement application behavior. Provider-neutral services continue to own Realm, Source, authentication, retrieval, Action, Extension installation, and documentation behavior.

`@ctxindex/core` continues to own `DocumentationProjection` and generic Extension lifecycle state. It adds only transport-neutral documentation querying and the provenance-aware update service seam needed by multiple CLI presentations. It does not acquire bundled product documentation or render output.

The CLI package build owns the deterministic embedded product-documentation manifest, analogous to bundled skills. `apps/web` owns human presentation and consumes a checked-in generated command-reference projection. Canonical authored product docs remain build inputs rather than CLI implementation strings.

## Interfaces and Data Flow

### `cli-surface`

```ts
export type CtxArgsDef = ArgsDef

export interface CtxCommandContext<TArgs extends CtxArgsDef> {
  readonly args: ParsedArgs<TArgs>
  readonly commandPath: readonly string[]
}

export interface CtxCommandDefinition<TArgs extends CtxArgsDef = CtxArgsDef>
  extends CommandDef<TArgs> {
  readonly meta: Resolvable<CommandMeta & { readonly name: string }>
}

export function defineCtxCommand<const TArgs extends CtxArgsDef>(
  definition: CtxCommandDefinition<TArgs>,
): CtxCommandDefinition<TArgs>

export interface CommandReferenceNode {
  readonly path: readonly string[]
  readonly description: string
  readonly usage: string
  readonly arguments: readonly CommandReferenceArgument[]
  readonly children: readonly CommandReferenceNode[]
}

export function projectCommandReference(
  root: CtxCommandDefinition,
): Promise<CommandReferenceNode>
```

`defineCtxCommand` installs one generic run boundary that derives strict token validation from the resolved Citty `args` and passes only Citty's typed parsed values onward. Dynamic Source configuration uses a resolvable `ArgsDef`, so the same invocation-local definition feeds Citty parsing, strict validation, and help.

`runCli` resolves the selected command chain once. Help uses the resolved chain to construct a complete synthetic parent name and delegates layout to Citty's `renderUsage`. Execution delegates to Citty after extracting only truly global options. Citty argument and command-selection failures map generically to `invalid_args`; application failures retain the shared error taxonomy.

Command reference generation walks `CtxCommandDefinition` values without opening ctxindex state, calling handlers, or importing provider data. It serializes only public metadata and passes the result to a Markdown generator with a freshness test.

### `documentation-consumption`

```ts
export type DocumentationOrigin =
  | { readonly kind: 'bundled' }
  | { readonly kind: 'extension'; readonly extensionId: string }

export type DocumentationItem = {
  readonly origin: DocumentationOrigin
  readonly path: string
  readonly kind: 'markdown' | 'asset' | 'metadata'
  readonly mediaType: string
  readonly byteSize: number
  readonly title?: string
  readonly summary?: string
  readonly content: string | Uint8Array
}

export interface DocumentationSource {
  list(): readonly DocumentationItem[]
  get(origin: DocumentationOrigin, path: string): DocumentationItem | undefined
}

export interface DocumentationSearchResult {
  readonly origin: DocumentationOrigin
  readonly path: string
  readonly title?: string
  readonly summary?: string
  readonly snippet: string
}

export interface DocumentationService {
  list(input: { readonly extensionId?: string }): readonly DocumentationItem[]
  get(input: {
    readonly path: string
    readonly extensionId?: string
  }): DocumentationItem
  search(input: {
    readonly query: string
    readonly extensionId?: string
  }): readonly DocumentationSearchResult[]
}
```

The bundled manifest macro walks only configured canonical product-documentation roots at build time, normalizes logical paths, validates bounds and references, and emits portable values. An adapter projects `LoadExtensionsResult.documentation` into the same `DocumentationSource` contract. `DocumentationService` composes them, performs exact selection and bounded textual search, and returns values without I/O side effects. CLI handlers own stdout, JSON, and explicit asset-copy effects.

### `extension-installation`

```ts
export type InstalledExtensionUpdateInput = {
  readonly extensionId: string
  readonly signal?: AbortSignal
}

export interface InstalledExtensionLifecycleService {
  update(
    input: InstalledExtensionUpdateInput,
  ): Promise<GenericExtensionInstallationRecord>
}
```

The lifecycle service selects direct or Catalog-curated replay from persisted provenance. Runtime-complete registry validation remains owned by the downstream installer and Catalog installation service rather than duplicated at this dispatch boundary.

The service reads the exact record under lifecycle coordination and dispatches from persisted provenance. Direct records reuse generic reacquisition. Catalog-curated records resolve their configured Catalog by exact curation identity, refresh only that Catalog outside the installation lock, stage exact replay, then compare-and-swap the selected Catalog snapshot and installation record under the existing lifecycle lock. Both branches use the canonical installer and atomic generic record publication.

## Storage and State

Command modeling, help, and generated reference introduce no runtime state. The generated web reference is a checked-in build artifact guarded by a freshness test.

Bundled product documentation is immutable executable content. Loaded Extension documentation remains derived from active Extension roots and is not copied into a second store. Documentation search uses ephemeral in-memory values and creates no index. Explicit asset output is caller-owned and uses a temporary sibling plus atomic rename when replacing a destination is permitted by the command contract.

Installed Extension update reuses existing generic records, Catalog records, content-addressed materializations, lifecycle locks, and crash-durability behavior. No schema migration, pointer, generation, or compatibility record is introduced.

## Security and Compatibility

Strict argument validation completes before handler effects. Dynamic help may load safe registry definition metadata only through the existing isolated command setup and must not open provider sessions. Help and generated reference never initialize ctxindex.

Bundled documentation validation rejects path escapes, invalid UTF-8, unsupported assets, broken local references, and configured bounds. Extension documentation retains its existing validation. CLI Markdown output is inert text. JSON escapes content normally. Asset copy never infers a host path from documentation metadata.

Extension install and update remain explicit arbitrary-code execution boundaries. Trust notices are written to stderr before acquisition or import. Catalog update preserves snapshot compare-and-swap, exact replay, credential sanitization, and prior-record survival.

Removed pre-alpha commands receive no aliases or hidden compatibility routing. Stable exit meanings remain unchanged.

## Verification

- Type-level tests prove Citty argument inference reaches handlers and dynamic Source definitions without widening.
- Table-driven command-model tests cover every command path, option, enum, required marker, duplicate, unknown option, surplus positional, help path, and zero-effect parse failure.
- Snapshot/freshness tests compare generated CLI reference Markdown to the resolved tree.
- Documentation tests cover deterministic ordering, exact origins, bounded search/snippets, Markdown/JSON output, asset output requirements, unsafe paths, relocation, and absence of network/web runtime dependencies.
- Extension lifecycle tests cover direct and Catalog-curated update success, missing Catalog/entry, stale refresh, collision, failed replay, and prior-record preservation.
- Compiled CLI E2E covers the new grammar, removed routes, complete nested help, docs relocation, and offline Extension documentation.
- Repository architecture, thin-CLI, package-dependency, package smoke, full CI, strict OpenSpec, codemap, and `SYSTEM.md` audits remain required.

## Promotion Notes

- Promote the single Citty command-definition boundary, command-reference projection, and generated-reference ownership into `openspec/specs/cli-surface/implementation.md`.
- Create `openspec/specs/documentation-consumption/implementation.md` with bundled-manifest, source-composition, query-service, and CLI presentation seams.
- Extend `openspec/specs/extension-documentation/implementation.md` with the inert CLI consumer and explicit asset-output boundary.
- Extend `openspec/specs/extension-installation/implementation.md` with provenance-dispatched update and Catalog snapshot compare-and-swap reuse.
