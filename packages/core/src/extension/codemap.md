# packages/core/src/extension/

## Responsibility

Loads built-in, explicit-path, and installed Catalog Extension definitions into the core registry while isolating failures from individual external modules and preserving exact provenance.

## Design

- `import.ts` owns the fixed authoring host and dynamic ESM factory import shared by startup loading and Catalog install validation.
- `loader.ts` sequences built-ins, explicit configured paths, and exact installed Catalog provenance without repository access.
- `LoadExtensionsInput` requires an explicit complete built-ins list and accepts installed records/data root; `LoadExtensionsResult` pairs the registry with non-fatal diagnostics and origin provenance.
- Registration and definition-conflict validation are delegated to `createExtensionRegistry()` and `ExtensionRegistry` in `packages/core/src/registry/`.

## Data & control flow

1. `loadExtensions()` rejects a non-array built-ins input, then seeds a registry with `createExtensionRegistry(input.builtins)`.
2. Each `config.extensions.paths` entry is resolved, imported through the shared authoring host, registered, and labeled with path provenance.
3. Each installed record derives its exact immutable snapshot location without repository access, validates manifest and source identity, imports the definition, and records Catalog/repository/commit/acquisition-time provenance.
4. Missing snapshots, import failures, identity mismatch, or registry conflicts become `ExtensionLoadDiagnostic` entries; no loader path fetches or mutates Catalog state.

## Integration points

- Exported through `packages/core/src/extension/index.ts`; `apps/cli/src/deps.ts` invokes `loadExtensions()`, and `apps/cli/src/definitions.ts` consumes its types/results.
- Depends on `@ctxindex/extension-sdk`, `packages/core/src/config/`, `packages/core/src/catalog/`, and `packages/core/src/registry/`; CLI startup and Extension listing supply persisted installed records to this offline path.
- `packages/core/src/extension/fixtures/` supplies loadable extension modules exercising the same factory contract.
