# packages/core/src/extension/

## Responsibility

Discovers exported Extension values from built-in namespaces and materialized packages, resolves passive documentation sidecars, validates complete candidates atomically, and loads explicit-path and installed Catalog roots without executing factories or fetching at startup.

## Design

- `package-entry.ts` resolves the ordered, unique, contained module paths declared by `package.json` `ctxindex.extensions`, imports each entry once, and provides exact-id selection before sidecar resolution. Whole-package imports resolve every collected root, while exact imports resolve documentation only for the selected root. This manifest list is the package boundary, not a dependency graph.
- `collector.ts` filters module namespaces for structurally valid named/default Extension values, ignores unrelated exports and functions, and attaches entry/export provenance.
- `import.ts` reads package manifests, derives package provenance, and composes entry resolution, namespace import, collection, and optional exact selection.
- `diagnostics.ts` owns branded host-generated Extension diagnostics. Import/evaluation boundaries discard arbitrary thrown causes; callers render only branded safe messages plus separately validated path, Catalog, or Extension identity.
- `documentation.ts` binds `docs('./docs')` to an acquired entry URL, validates directory and eager virtual trees through one bounded passive-content policy, strips declarations from definition identity, and exposes an authored/generated transport-neutral projection with exact Extension and definition routes.
- `loader.ts` sequences built-ins, explicit package roots, exact installed Catalog roots, and verified immutable direct-install pins. Each package is added only after `buildCompleteCandidateRegistry()` validates the whole next candidate set against any supplied local BYOA OAuth App identities.
- `LoadExtensionsResult` retains the legacy `ExtensionRegistry` projection, exposes the provenance-preserving `CompleteRegistry`, and carries the portable `DocumentationProjection` for future consumers.

## Data & control flow

1. The already acquired `@ctxindex/adapters` module namespace enters the same namespace collector used for package entries and forms the initial complete candidate; the host does not preselect its Extension exports.
2. Each configured path identifies a package root. The loader reads its manifest, resolves and imports declared entries once, collects every exported Extension root, resolves any directory sidecar relative to its entry, and atomically validates the combined candidate.
3. Each installed Catalog record resolves its immutable snapshot package root offline, validates persisted manifest identity, collects all roots, exact-selects the recorded Extension id, and resolves only that root's documentation before candidate validation.
4. Each valid direct-install record derives a managed content-addressed root, verifies its digest, exact-selects its recorded Extension id, and enters the same candidate-validation path without acquisition.
5. A package becomes active only after documentation and complete-registry validation succeed; failures produce diagnostics while the previous active roots, registry, and documentation projection remain unchanged.

## Integration points

- Exported through `packages/core/src/extension/index.ts`; `apps/cli/src/deps.ts` invokes `loadExtensions()`, and `apps/cli/src/definitions.ts` consumes its types/results.
- Depends on `@ctxindex/extension-sdk`, `packages/core/src/config/`, `packages/core/src/catalog/`, `packages/core/src/direct-extension/`, and `packages/core/src/registry/`; CLI startup and Extension listing supply persisted installed records to this offline path.
- `packages/core/src/extension/fixtures/` supplies package manifests and ordinary SDK-exported values for valid, invalid, and conflicting cases.
