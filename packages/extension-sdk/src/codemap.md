# packages/extension-sdk/src/

## Responsibility

Defines the stateless public TypeScript contract used to author ctxindex Providers, OAuth Apps, Profiles, Adapters, Extension roots, and package-backed Catalogs. `index.ts` is the package's only public entry point and re-exports these cohesive contract modules.

## Design / patterns

- `provider.ts`: declares Provider identity and authentication. `auth.oauth2` builds PKCE OAuth2 policy (endpoints, identity extraction paths, a complete registration-schema key mapping to safe uppercase environment names, base scopes, allowed hosts, and fixed authorization parameters); `auth.none` supports unauthenticated Providers. `defineProvider` tags a definition as `provider`.
- `oauth-app.ts`: binds one OAuth2 Provider to a labelled registration config validated by that Provider's registration schema. `defineOAuthApp` tags the resulting app as `oauth-app` and preserves its literal Provider, label, and config types.
- `profile.ts`: defines schema-backed Profile identity, search projections, relation/artifact/export hooks, and reversible or irreversible Action declarations. `defineProfile` adds the `profile` discriminator while retaining literal IDs, versions, and Zod inference.
- `adapter.ts`: declares source config, targeted Profiles, routing, capability-gated operations, and Profile Action bindings. An Adapter may bind a Provider; OAuth2 Providers require Adapter access scopes, while `none` Providers prohibit them. `providerApiHosts` further scopes permitted provider egress. `AdapterOperationsFor` uses a private conditional type to require exactly the operations selected by `capabilities`.
- `operations.ts`: provides the provider-operation contexts and value contracts for sync emissions, remote search with opaque continuation input/output, retrieval, artifact download, and Actions. `ActionContext.resolveResource` offers a read-only selected-Source Resource lookup without exposing persistence, while `resolveArtifact` accepts an optional maximum byte size and exposes safe descriptor metadata plus copied integrity-verified bytes without storage paths or provider access.
- `extension.ts`: composes an Extension root from Providers, OAuth Apps, Profiles, and Adapters; `defineExtension` supplies omitted collections as empty arrays and adds the `extension` discriminator. `packageExtension()` declares an npm/Git/local package target plus exact Extension id, while `defineCatalog()` validates a bounded, uniquely identified mix of literal Extensions and package descriptors, constrains optional per-entry Marketplace summaries to their inferred ids, and adds the `catalog` discriminator.
- `documentation.ts`: defines the closed directory-or-virtual documentation declaration and the pure overloaded `docs()` helper; it performs no I/O and captures no module location.
- `sync-error.ts`: defines the portable `ctxindex.sync-error` tagged value, stable sync-code union, strict bounded public-message/retry validation, cross-copy structural guard, and frozen `syncError()` factory. It deliberately uses no custom prototype or `instanceof` contract.

## Data & control flow

1. An extension author defines Provider policy, optional OAuth App registrations, schema-backed Profiles, and capability-constrained Adapters, then groups any root definitions and optional passive documentation declaration with `defineExtension`.
2. A Catalog author uses `defineCatalog()` to curate literal Extension values and `packageExtension()` descriptors, with an optional id-keyed summary map that does not wrap or alter those entries. Core evaluates this trusted authoring graph and resolves package targets; Catalog values are not runtime registry roots.
3. Core follows Extension definitions to validate and register the reachable graph. For Adapter operations it supplies `SyncContext`, `SearchContext`, `RetrieveContext`, `DownloadContext`, or typed `ActionContext`; remote search Adapters may consume and return opaque continuation tokens.
4. Operations return Resources/results or use callbacks to emit sync resources, removals, checkpoints, warnings, artifacts, and byte chunks. An Adapter may reject with `syncError()` when it has a deliberately public bounded diagnostic; Action handlers can resolve selected-Source local Resources and cached Artifacts before deriving a provider mutation.
5. Core validates and materializes the values; the SDK owns no storage, network calls, or runtime state.

## Integration points

- Exposed inside the monorepo through the `@ctxindex/extension-sdk` workspace and outside it through the built public package; its only runtime dependency is Zod.
- Authored against by `packages/profiles/src/`, `packages/official/src/`, and external Extension/Catalog repositories such as `barisgit/ctxindex-extensions`.
- Imported by `packages/core/src/extension/loader.ts` and validated/assembled through `packages/core/src/registry/complete-registry.ts` and `definition-registries.ts`.
- Its contracts are consumed by core source, sync, search, action, resource, relation, artifact, export, and OAuth-app workflows.
