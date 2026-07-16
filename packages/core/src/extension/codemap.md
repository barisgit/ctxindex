# packages/core/src/extension/

## Responsibility

Loads built-in and user-configured extension definitions into the core definition registry while isolating failures from individual external modules.

## Design

- `loader.ts` is a plugin-loader boundary around dynamic ESM import.
- A fixed `authoringHost` exposes only Zod and the SDK's `defineProfile()`, `defineAdapter()`, and `defineExtension()` helpers to extension factories.
- `LoadExtensionsInput` requires an explicit complete built-ins list; `LoadExtensionsResult` pairs the registry with non-fatal path/message diagnostics.
- Registration and definition-conflict validation are delegated to `createExtensionRegistry()` and `ExtensionRegistry` in `packages/core/src/registry/`.

## Data & control flow

1. `loadExtensions()` rejects a non-array built-ins input, then seeds a registry with `createExtensionRegistry(input.builtins)`.
2. Each `config.extensions.paths` entry is resolved to an absolute path and imported through a file URL.
3. The module's default factory receives `authoringHost`; its returned definition is registered.
4. Import, factory, or registration failures become `ExtensionLoadDiagnostic` entries, and loading continues with the next path.

## Integration points

- Exported through `packages/core/src/extension/index.ts`; `apps/cli/src/deps.ts` invokes `loadExtensions()`, and `apps/cli/src/definitions.ts` consumes its types/results.
- Depends on `@ctxindex/extension-sdk`, `packages/core/src/config/`, and `packages/core/src/registry/`.
- `packages/core/src/extension/fixtures/` supplies loadable extension modules exercising the same factory contract.
