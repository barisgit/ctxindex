# packages/extension-sdk/

## Responsibility

Publishes the stateless public authoring/runtime contract used to define ctxindex Profiles, Adapters, provider-neutral OAuth declarations, Extensions, provider operations, and their host callbacks.

## Design/patterns

- Deep package Interface: `packages/extension-sdk/package.json` exposes only `src/index.ts` as `@ctxindex/extension-sdk`; the index is a stable barrel over cohesive private contract Modules.
- Declarative definition types and generic identity helpers (`defineProfile`, `defineAdapter`, `defineExtension`) preserve literal IDs, versions, schemas, capabilities, and Action maps without owning runtime state.
- Capability-gated Strategy contracts and callback/event contexts keep provider implementations independent of core persistence and orchestration.
- Full symbol-level map: `packages/extension-sdk/src/codemap.md`.

## Data & control flow

1. Authors assemble Zod schemas, Profile hooks, reusable OAuth provider policy, per-Adapter scopes/API hosts, and Adapter operation functions into definitions, then bundle them in an Extension.
2. Core supplies `SyncContext`, `SearchContext`, `RetrieveContext`, `DownloadContext`, or `ActionContext` to an Adapter operation.
3. Operations return resources/results or stream emissions, artifacts, warnings, checkpoints, and bytes through SDK callbacks; core validates and materializes them.

## Integration points

- Depends only on Zod, as declared in `packages/extension-sdk/package.json`.
- Authored against by `packages/profiles/src/`, `packages/adapters/src/`, and external extension modules.
- Loaded by `packages/core/src/extension/loader.ts`, validated by `packages/core/src/registry/definition-registries.ts`, and consumed across core source/sync/search/action/resource/relation/artifact/export services.
