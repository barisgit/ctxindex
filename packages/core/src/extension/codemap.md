# packages/core/src/extension/

## Responsibility

Discovers exported Extension values from built-in namespaces and materialized packages, validates complete candidates atomically, and loads explicit-path and installed Catalog roots without executing factories or fetching at startup.

## Design

- `package-entry.ts` resolves the ordered, unique, contained module paths declared by `package.json` `ctxindex.extensions`, imports each entry once, and provides exact-id selection. This manifest list is the package boundary, not a dependency graph.
- `collector.ts` filters module namespaces for structurally valid named/default Extension values, ignores unrelated exports and functions, and attaches entry/export provenance.
- `import.ts` reads package manifests, derives package provenance, and composes entry resolution, namespace import, collection, and optional exact selection.
- `diagnostics.ts` owns branded host-generated Extension diagnostics. Import/evaluation boundaries discard arbitrary thrown causes; callers render only branded safe messages plus separately validated path, Catalog, or Extension identity.
- `loader.ts` sequences built-ins, explicit package roots, and exact installed Catalog roots. Each package is added only after `buildCompleteCandidateRegistry()` validates the whole next candidate set against any supplied local BYOA OAuth App identities.
- `LoadExtensionsResult` retains the legacy `ExtensionRegistry` projection for existing callers and exposes the provenance-preserving `CompleteRegistry`.

## Data & control flow

1. The already acquired `@ctxindex/adapters` module namespace enters the same namespace collector used for package entries and forms the initial complete candidate; the host does not preselect its Extension exports.
2. Each configured path identifies a package root. The loader reads its manifest, resolves and imports declared entries once, collects every exported Extension root, and atomically validates the combined candidate.
3. Each installed Catalog record resolves its immutable snapshot package root offline, validates persisted manifest identity, collects all roots, and exact-selects the recorded Extension id before candidate validation.
4. A package becomes active only after complete validation succeeds; failures produce diagnostics while the previous active roots and registry remain unchanged.

## Integration points

- Exported through `packages/core/src/extension/index.ts`; `apps/cli/src/deps.ts` invokes `loadExtensions()`, and `apps/cli/src/definitions.ts` consumes its types/results.
- Depends on `@ctxindex/extension-sdk`, `packages/core/src/config/`, `packages/core/src/catalog/`, and `packages/core/src/registry/`; CLI startup and Extension listing supply persisted installed records to this offline path.
- `packages/core/src/extension/fixtures/` supplies package manifests and ordinary SDK-exported values for valid, invalid, and conflicting cases.
