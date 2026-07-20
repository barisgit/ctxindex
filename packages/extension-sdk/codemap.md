# packages/extension-sdk/

## Responsibility

Publishes the stateless authoring/runtime contract for ctxindex Extension graphs: Providers, OAuth Apps, Profiles, Adapters, provider operations, and their host callbacks.

## Design / patterns

- `package.json` exposes only `src/index.ts` as `@ctxindex/extension-sdk`; the barrel is a stable facade over private cohesive modules.
- Generic identity factories (`defineProvider`, `defineOAuthApp`, `defineProfile`, `defineAdapter`, and `defineExtension`) add a discriminating `kind` while retaining literal definition data through inference.
- Provider policy is separate from Adapter behavior: a Provider owns authentication and network policy, OAuth Apps supply schema-typed registrations, and Adapters declare source-specific scopes, API hosts, capabilities, and Actions.
- Capability-gated operation contracts and callback contexts let providers run independently of core orchestration and persistence. `ActionContext.resolveResource` is the narrow, read-only selected-Source lookup seam.
- Full symbol-level map: `packages/extension-sdk/src/codemap.md`.

## Data & control flow

1. Authors compose Provider policy, optional OAuth App configuration, Profile schemas/hooks, and Adapters into an Extension graph.
2. Core completes and validates the graph, then supplies operation contexts to Adapter sync, remote-search, retrieval, download, or Action handlers.
3. Operations return Resources/results or emit Resources, removals, checkpoints, warnings, artifacts, and bytes through SDK contracts; core validates and materializes the outputs.

## Integration points

- Depends only on Zod; the package manifest owns build, quality, test, and clean/fullclean tasks dispatched by root Turbo commands.
- Used by `packages/profiles/src/`, `packages/adapters/src/`, and external extension modules.
- Core loads extension roots in `packages/core/src/extension/loader.ts`, builds reachable graphs in `packages/core/src/registry/complete-registry.ts`, and exposes definitions through `definition-registries.ts`.
