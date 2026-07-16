# packages/extension-sdk/src/

## Responsibility

Defines the public TypeScript authoring and runtime contract for ctxindex Profiles, Adapters, and Extensions. `packages/extension-sdk/src/index.ts` is the package's sole implementation and export surface.

## Design / patterns

- Declarative definition objects: `ProfileDefinition`, `AdapterDefinition`, and `ExtensionDefinition` describe schemas, indexing hooks, relations, artifacts, exports, Actions, provider operations, authentication, and search routing.
- Identity helpers: `defineProfile`, `defineAdapter`, and `defineExtension` return definitions unchanged while preserving literal IDs, versions, capabilities, schemas, and action maps through generic inference.
- Capability-gated Strategy interfaces: `AdapterOperationsFor` uses `CapabilityOperation` to require only operations declared in `AdapterDefinition.capabilities`.
- Host-mediated authoring: `ExtensionAuthoringHost` supplies Zod and the three identity helpers to dynamically loaded extension factories.
- Event/callback contracts: `SyncEmission` and the `emit`, `emitResource`, `emitArtifact`, and `write` callbacks let provider implementations stream results without depending on core storage.

## Data & control flow

1. Authors compose Zod schemas and hooks into Profile definitions, provider operation functions into Adapter definitions, then bundle both with `defineExtension`.
2. Core passes provider inputs through `SyncContext`, `SearchContext`, `RetrieveContext`, `DownloadContext`, or `ActionContext`.
3. Adapter operations return search/action resources or emit sync resources, removals, checkpoints, warnings, artifacts, and byte chunks through SDK-defined contracts.
4. Core validates and materializes those values; the SDK itself holds no state and performs no I/O.

## Integration points

- Exported as `@ctxindex/extension-sdk` by `packages/extension-sdk/package.json`; depends only on Zod types/runtime exports.
- Authored against by bundled definitions in `packages/profiles/src/*.ts`, adapters in `packages/adapters/src/`, and external examples such as `examples/tenders-extension/extension.ts`.
- Loaded by `packages/core/src/extension/loader.ts`, whose `authoringHost` exposes `z`, `defineProfile`, `defineAdapter`, and `defineExtension`.
- Validated and registered by `packages/core/src/registry/definition-registries.ts`; consumed by core Action, search, source, sync, resource, relation, artifact, and export services.
