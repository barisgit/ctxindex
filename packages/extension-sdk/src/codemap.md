# packages/extension-sdk/src/

## Responsibility

Defines the public TypeScript authoring and runtime contract for ctxindex Profiles, Adapters, and Extensions. `index.ts` is the stable package Interface over private contract Modules.

## Design / patterns

- `reference.ts`: shared definition versions and Profile references.
- `profile.ts`: Profile schemas, search/field/relation/artifact/export/Action contracts, and the `defineProfile` identity factory.
- `operations.ts`: provider operation contexts, generic Resource values, sync emissions, remote-search values, logging, and host callbacks.
- `adapter.ts`: Adapter capabilities, provider-neutral `OAuthProviderSpec` declarations, auth/routing, per-Adapter `providerApiHosts`, capability-gated operations, Action bindings, definitions, and the `defineAdapter` identity factory.
- `extension.ts`: Extension composition, the host authoring contract, and the `defineExtension` identity factory.
- `index.ts`: explicit public barrel; it owns no contract implementation.
- Identity factories return definitions unchanged while preserving literal IDs, versions, capabilities, schemas, and Action maps through generic inference.
- `AdapterOperationsFor` uses the private `CapabilityOperation` conditional type to require exactly the operations declared in `AdapterDefinition.capabilities`.

## Data & control flow

1. Authors compose Zod schemas and hooks into Profile definitions, declare reusable OAuth provider policy plus Adapter-specific scopes/API hosts and operations, then bundle Profiles and Adapters with `defineExtension`.
2. Core passes provider inputs through `SyncContext`, `SearchContext`, `RetrieveContext`, `DownloadContext`, or `ActionContext`.
3. Adapter operations return search/action Resources or emit sync Resources, removals, checkpoints, warnings, artifacts, and byte chunks through SDK-defined contracts.
4. Core validates and materializes those values; the SDK itself holds no state and performs no I/O.

## Integration points

- Exported as `@ctxindex/extension-sdk` by `packages/extension-sdk/package.json`; depends only on Zod.
- Authored against by bundled definitions in `packages/profiles/src/`, Adapters in `packages/adapters/src/`, and external examples such as `examples/tenders-extension/extension.ts`.
- Loaded by `packages/core/src/extension/loader.ts`, whose `authoringHost` exposes `z`, `defineProfile`, `defineAdapter`, and `defineExtension`.
- Validated and registered by `packages/core/src/registry/definition-registries.ts`; consumed by core Action, search, source, sync, Resource, relation, Artifact, and export services.
