# packages/core/src/registry/

## Responsibility

Validates and indexes extension-supplied Profile, Adapter, OAuth-provider, and Extension definitions, resolves kind names/aliases and profile versions, and produces stable registry descriptions for CLI consumers.

## Design/patterns

- `profile-registry.ts` implements a keyed registry (`ProfileRegistry`) over `id@version`, with Zod boundary validation of search hooks (including `summary`), duplicate detection, alias resolution, and degraded resolution warnings.
- `definition-registries.ts` composes `ProfileRegistry`, `AdapterRegistry`, and `ExtensionRegistry`; rebuilding all registries on `ExtensionRegistry.register()` makes registration atomic and revalidates cross-definition contracts.
- `validateAdapter()` enforces capability/operation parity, routing requirements, Profile references, Action binding compatibility, unique scopes, and lowercase unique `providerApiHosts`. OAuth-provider schemas validate endpoints, client policy, PKCE, environment-key metadata, hosts, scopes, and identity paths; built-in descriptions expose only add-time client ID/optional client-secret keys.
- `AdapterRegistry` indexes semantically identical OAuth declarations by provider ID and rejects conflicting declarations; `getOAuthProvider()` exposes the provider-neutral lookup used by auth.
- `describe.ts` projects definitions into sorted, presentation-neutral `RegistryDescription` data, including each Source Adapter's `providerApiHosts` alongside its auth declaration; `compare.ts` centralizes deterministic ordering.

## Data & control flow

1. `createExtensionRegistry()` calls `buildRegistries()`, validates extension shapes, flattens Profiles and Adapters, and checks globally unique Action IDs.
2. `ProfileRegistry` validates and indexes Profiles; `AdapterRegistry` then validates Adapter capabilities, operations, auth/provider declarations, API hosts, supported Profiles, and Action bindings against that registry.
3. Consumers call `get()`, `list()`, `resolve()`, or `resolveKind()`; unknown Profile versions may return a degraded resolution through `ProfileRegistryOptions.onWarning`.
4. `describeRegistry()` sorts registry entries, converts Zod schemas with `z.toJSONSchema()`, derives Adapter config flags, and returns kinds/sources/actions metadata. Source descriptions preserve sorted Provider API hosts so CLI renderers can generate OAuth setup guidance entirely from registry declarations.

## Integration points

- Definition types come from `@ctxindex/extension-sdk`; validation uses `zod`.
- `packages/core/src/extension/loader.ts` and `packages/core/src/extension/index.ts` supply extension definitions; `packages/core/src/source/`, `search/`, `resource/`, and `action/` consume registry lookups.
- `apps/cli/src/definitions.ts`, `apps/cli/src/commands/describe.ts`, and `apps/cli/src/commands/source.ts` consume registry construction/descriptions.
- `index.ts` is the canonical capability Interface and the direct target of the `@ctxindex/core/registry` package subpath.
