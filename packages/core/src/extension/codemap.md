# packages/core/src/extension/

## Responsibility

Discovers exported Extension and authoring-time Catalog values from package modules, resolves passive Extension documentation, validates complete runtime candidates atomically, and loads explicit paths plus unified installed package records without fetching at startup.

## Design

- `package-entry.ts` resolves the ordered, unique, contained module paths declared by `package.json` `ctxindex.extensions`. Runtime imports collect Extension roots; the authoring inspection path additionally validates Catalog exports, including id-keyed entry-summary maps, and supports exact Catalog selection plus indexed literal-Extension selection. Whole-package imports resolve every Extension root, while exact imports resolve documentation only for the selected root.
- `collector.ts` filters module namespaces for structurally valid named/default Extension values, ignores unrelated exports and functions, and attaches entry/export provenance.
- `import.ts` reads package manifests, derives package provenance, and composes entry resolution, namespace import, collection, and optional exact selection.
- `diagnostics.ts` owns branded host-generated Extension diagnostics. Import/evaluation boundaries discard arbitrary thrown causes; callers render only branded safe messages plus separately validated path, Catalog, or Extension identity.
- `documentation.ts` binds `docs('./docs')` to an acquired entry URL, validates directory and eager virtual trees through one bounded passive-content policy, strips declarations from definition identity, and exposes an authored/generated transport-neutral projection with exact Extension and definition routes.
- `loader.ts` sequences built-ins, explicit package roots, and verified immutable generic installation records. Direct and Catalog-curated records share materialization integrity checks and exact Extension selection; provenance projection preserves their origin difference.
- `LoadExtensionsResult` retains the active collected roots and legacy `ExtensionRegistry` projection, exposes the provenance-preserving `CompleteRegistry`, and carries the portable `DocumentationProjection` for lifecycle validation and future consumers.

## Data & control flow

1. The already acquired `@ctxindex/official` module namespace enters the same namespace collector used for package entries and forms the initial complete candidate; the host does not preselect its Extension exports.
2. Each configured path identifies a package root. The loader reads its manifest, resolves and imports declared entries once, collects every exported Extension root, resolves any directory sidecar relative to its entry, and atomically validates the combined candidate.
3. Authoring inspection can validate both Extension and Catalog exports, exact-select one Catalog, and recover an inline Extension by recorded Catalog entry index and identity.
4. Each installed record derives a managed content-addressed root, verifies its digest, exact-selects its recorded Extension id, and enters the same candidate-validation path without acquisition. Optional curation metadata changes only provenance from direct to Catalog.
5. A package becomes active only after documentation and complete-registry validation succeed; failures produce diagnostics while the previous active roots, registry, and documentation projection remain unchanged.

## Integration points

- Exported through `packages/core/src/extension/index.ts`; `apps/cli/src/deps.ts` invokes `loadExtensions()`, and `apps/cli/src/definitions.ts` consumes its types/results.
- Depends on `@ctxindex/extension-sdk`, `packages/core/src/config/`, `packages/core/src/direct-extension/`, and `packages/core/src/registry/`; CLI and daemon startup supply unified persisted installation records to this offline path, while Catalog authoring consumes its inspection/selection seams.
- `packages/core/src/extension/fixtures/` supplies package manifests and ordinary SDK-exported values for valid, invalid, and conflicting cases.
