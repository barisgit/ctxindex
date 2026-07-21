## Capability Implementation Targets

- `core-model` → `openspec/specs/core-model/implementation.md` (new sidecar)
- `extension-loading` → `openspec/specs/extension-loading/implementation.md`
- `oauth-client-management` → `openspec/specs/oauth-client-management/implementation.md`
- `account-grant-management` → `openspec/specs/account-grant-management/implementation.md`
- `module-architecture` → `openspec/specs/module-architecture/implementation.md`
- `cli-surface` → `openspec/specs/cli-surface/implementation.md`
- `secret-backend-operations` → `openspec/specs/secret-backend-operations/implementation.md`
- `error-taxonomy` → `openspec/specs/error-taxonomy/implementation.md`

These sidecars are updated only after implementation is verified. Authored definition `docs` fields are not part of this change; future documentation uses separately owned sidecars.

## Module Ownership

`@ctxindex/extension-sdk` owns core-independent authoring types, supported `z`, inference-preserving plain-value factories, and direct `oauth2`/`none` auth constructors. It exposes no reference factories, Extension dependency graph, registration, persistence, secret access, network access, runtime-core import, or embedded documentation contract.

Package tooling owns dependency acquisition and module resolution. Workspace, npm, Git, and local packages declare dependencies in their package manifests; TypeScript modules import exact Provider and Profile values. ctxindex does not implement a package dependency solver.

Provider-neutral core owns `package.json` `ctxindex.extensions` entry resolution, exported-root collection, transitive reachable-leaf collection, exact root selection, structural validation, conservative duplicate handling, root-provenance diagnostics, complete candidate-registry validation, and atomic activation. The same boundary accepts bundled namespaces, explicit paths, and installed Catalog snapshots.

Provider modules own direct auth, OAuth App config schema, registration policy, identity discovery, endpoints, base scopes, and authorization hosts. Adapter modules own config, transport, capabilities, operations, Actions, exact imported Profiles, optional exact Provider binding, Adapter operation scopes, and Provider API hosts. Providerless Adapters omit the entire Provider authorization/egress/access surface. Profile modules own domain schemas and vocabulary. `@ctxindex/profiles` is an ordinary library. Extension roots compose imported Adapters/OAuth Apps and optionally standalone Providers/Profiles.

The OAuth App service owns the safe inventory and local BYOA records. Provider OAuth registration owns a typed top-level config-key-to-environment-name map consumed only by local BYOA import. The Account authorization service snapshots selected App configuration into private Grant-owned storage. Secret traversal owns both local App and Grant snapshot references. CLI consumes safe projections and never renders App config, Client, Grant, or secret-reference details.

## Interfaces and Data Flow

### Public SDK plain values

```ts
export { z } from 'zod'

export interface NoneAuth {
  readonly kind: 'none'
}

export interface OAuth2RegistrationPolicy<
  TConfigSchema extends z.ZodTypeAny = z.ZodTypeAny,
> {
  readonly type: 'public' | 'confidential'
  readonly configSchema: TConfigSchema
  readonly environment: Readonly<
    Record<Extract<keyof z.input<TConfigSchema>, string>, EnvironmentName>
  >
}

export interface OAuth2Auth<
  TConfigSchema extends z.ZodTypeAny = z.ZodTypeAny,
> {
  readonly kind: 'oauth2'
  readonly authorizationUrl: string
  readonly tokenUrl: string
  readonly identity: OAuthIdentityDefinition
  readonly pkce: { readonly method: 'S256'; readonly required: true }
  readonly registration: OAuth2RegistrationPolicy<TConfigSchema>
  readonly baseScopes: readonly string[]
  readonly allowedHosts: readonly string[]
  readonly fixedAuthorizationParams?: Readonly<Record<string, string>>
}

export interface ProviderDefinition<
  TId extends string = string,
  TAuth extends NoneAuth | OAuth2Auth = NoneAuth | OAuth2Auth,
> {
  readonly kind: 'provider'
  readonly id: TId
  readonly auth: TAuth
}

export interface OAuthAppDefinition<
  TProvider extends ProviderDefinition<string, OAuth2Auth> = ProviderDefinition<
    string,
    OAuth2Auth
  >,
  TLabel extends string = string,
  TConfig = unknown,
> {
  readonly kind: 'oauth-app'
  readonly provider: TProvider
  readonly label: TLabel
  readonly config: TConfig
}

export interface OAuthProviderBackedAdapterDefinition<
  TProvider extends ProviderDefinition<string, OAuth2Auth> = ProviderDefinition<
    string,
    OAuth2Auth
  >,
  TProfiles extends readonly AnyProfileDefinition[] = readonly AnyProfileDefinition[],
> extends AdapterDefinitionBase<TProfiles> {
  readonly provider: TProvider
  readonly access: AdapterAccess<TProvider>
  readonly providerApiHosts?: readonly string[]
}

export interface NoneProviderBackedAdapterDefinition<
  TProvider extends ProviderDefinition<string, NoneAuth> = ProviderDefinition<
    string,
    NoneAuth
  >,
  TProfiles extends readonly AnyProfileDefinition[] = readonly AnyProfileDefinition[],
> extends AdapterDefinitionBase<TProfiles> {
  readonly provider: TProvider
  readonly access?: never
  readonly providerApiHosts?: readonly string[]
}

export interface ProviderlessAdapterDefinition<
  TProfiles extends readonly AnyProfileDefinition[] = readonly AnyProfileDefinition[],
> extends AdapterDefinitionBase<TProfiles> {
  readonly provider?: never
  readonly access?: never
  readonly providerApiHosts?: never
}

export interface ExtensionDefinition<
  TId extends string = string,
  TAdapters extends readonly AnyAdapterDefinition[] = readonly AnyAdapterDefinition[],
  TOAuthApps extends readonly OAuthAppDefinition[] = readonly OAuthAppDefinition[],
  TProviders extends readonly ProviderDefinition[] = readonly ProviderDefinition[],
  TProfiles extends readonly AnyProfileDefinition[] = readonly AnyProfileDefinition[],
> {
  readonly kind: 'extension'
  readonly id: TId
  readonly adapters: TAdapters
  readonly oauthApps: TOAuthApps
  readonly providers: TProviders
  readonly profiles: TProfiles
}
```

`defineProfile`, `defineProvider`, `defineAdapter`, `defineOAuthApp`, and `defineExtension` use const generics and return fresh shallow plain values. `defineOAuthApp` accepts only an exact imported OAuth2 Provider and infers config from its registration schema. `defineAdapter` is an overload or discriminated union that distinguishes OAuth2 Provider-backed, `none` Provider-backed, and providerless contracts. Only OAuth2-backed Adapters declare access scopes. Adapter `profiles` contain exact imported Profile values. `defineExtension` normalizes omitted arrays to empty readonly arrays and has no `dependencies` or `docs` field.

There is no `ExtensionReference`, `ProviderReference`, `ProfileReference`, `extensionRef`, `providerRef`, `profileRef`, named auth method, Provider version selector, placeholder auth kind, or host authoring type.

### Reachable definition graph

```ts
export interface CollectedExtensionGraph {
  readonly extension: AnyExtensionDefinition
  readonly adapters: readonly AnyAdapterDefinition[]
  readonly oauthApps: readonly AnyOAuthAppDefinition[]
  readonly providers: readonly AnyProviderDefinition[]
  readonly profiles: readonly AnyProfileDefinition[]
  readonly provenance: DefinitionProvenance
}

export function collectExtensionGraph(
  root: AnyExtensionDefinition,
  provenance: DefinitionProvenance,
): CollectedExtensionGraph
```

Traversal starts from `extension.adapters`, `extension.oauthApps`, explicit standalone `extension.providers`, and explicit standalone `extension.profiles`. It follows each Adapter's Profile values and optional Provider, plus each OAuth App's Provider. Traversal may use object identity only to terminate cycles and recognize the exact same imported value encountered repeatedly; it never uses identity to choose between distinct values with the same semantic id. A leaf present both transitively and explicitly is one candidate contribution only when it is the exact reused object.

Providerless Adapters contribute no Provider and validation rejects Provider access/scopes, Provider API hosts, Account/Grant/auth metadata, or synthesized `none` Provider state. A `none` Provider remains useful only when an integration explicitly models a real authority with no authentication; it is not required for local providerless Adapters.

### Complete registry and conservative duplicate handling

```ts
export interface DefinitionProvenance {
  readonly origin: 'builtin' | 'explicit-path' | 'catalog'
  readonly packageName?: string
  readonly packageVersion?: string
  readonly integrity?: string
  readonly commit?: string
  readonly entry: string
  readonly exportName: string
}

export interface CompleteRegistry {
  readonly extensions: ReadonlyMap<string, AnyExtensionDefinition>
  readonly providers: ReadonlyMap<string, AnyProviderDefinition>
  readonly oauthApps: ReadonlyMap<string, AnyOAuthAppDefinition>
  readonly profiles: ReadonlyMap<string, AnyProfileDefinition>
  readonly adapters: ReadonlyMap<string, AnyAdapterDefinition>
  readonly provenances: ReadonlyMap<string, readonly DefinitionProvenance[]>
}

export interface CandidateRegistryInput {
  readonly roots: readonly CollectedExtension[]
  readonly localOAuthAppIdentities: readonly OAuthAppIdentity[]
}

export function buildCompleteCandidateRegistry(
  input: CandidateRegistryInput,
): CompleteRegistry
```

Provider keys are ids; Profile keys are `(id,version)`; Adapter and Extension keys are ids; OAuth App keys are `(providerId,label)`. Construction collects each selected root's complete reachable graph, validates it in order-independent stages, compares same-key candidates deterministically, checks Extension Apps against local BYOA identities, and mutates no active state.

Stable ids provide semantic identity. Duplicate handling follows this V1 order:

1. OAuth Apps always conflict at duplicate `(providerId,label)`, even when the same object or config is repeated.
2. The exact same imported non-App definition object MAY coalesce when encountered repeatedly. This is evidence of exact reuse only; the reference is not a semantic identity key and gives no precedence over a distinct value.
3. Two distinct same-identity values conflict if either value recursively contains any function or Zod schema. V1 has no package-authenticated per-leaf evidence that could prove those executable/schema-bearing definitions equal.
4. Two distinct same-identity values that are genuinely pure declarative data MAY coalesce only when a canonical structural comparison proves equality. Otherwise they conflict.

Any conflict rejects the whole candidate set. Separate physical SDK and Zod copies remain supported for authoring, type inference, discriminator-based collection, and structural validation. Their distinct executable/schema-bearing definitions do not coalesce merely because package version, integrity, commit, path, source text, or `Function#toString` matches. Root provenance is retained for diagnostics only and never participates in leaf identity or equivalence. Load order, origin priority, `instanceof`, and physical-copy identity never choose a winner.

An Extension OAuth App must use an OAuth2 Provider with public registration and contain no typed secret references or host-private values. Validation gates on policy, not a field name such as `clientSecret`.

### Common manifest-entry seam

```ts
export type DefinitionModule = Readonly<Record<string, unknown>>

export interface ResolvedPackageEntries {
  readonly entries: readonly string[]
  readonly provenance: Omit<DefinitionProvenance, 'entry' | 'exportName'>
}

export function resolvePackageEntries(
  packageRoot: string,
  packageJson: unknown,
  provenance: ResolvedPackageEntries['provenance'],
): Promise<ResolvedPackageEntries>

export function collectExtensionExports(
  module: DefinitionModule,
  entry: string,
  provenance: ResolvedPackageEntries['provenance'],
): CollectedExtension[]

export function selectExactExtension(
  collected: readonly CollectedExtension[],
  id: string,
): CollectedExtension
```

`resolvePackageEntries` reads the ordered unique module paths in `package.json` `ctxindex.extensions`. Paths must remain within the materialized package root, including after symlink resolution, and name modules rather than symbols. The collector uses the Extension discriminator only as a candidate filter; structural validation is authoritative. It ignores unrelated exports, reports malformed claimed roots with export provenance, and never invokes functions.

Bundled namespaces, explicit-path packages, and Catalog snapshots all call the same functions, then graph collection and complete-registry validation. Acquisition may differ, but no source pre-registers definitions or bypasses validation.

The dependent persistent-install change may materialize local, Git, or npm packages and persist provenance/trust state. It must delegate dependency resolution to the applicable package manager and pass the resulting package root to this manifest-entry seam.

### Safe OAuth App inventory and private snapshots

```ts
export interface OAuthAppInventoryEntry {
  readonly providerId: string
  readonly label: string
  readonly origin: 'builtin' | 'extension' | 'local'
  readonly provenance?: SafeDefinitionProvenance
}

export interface LocalOAuthAppRecord {
  readonly providerId: string
  readonly label: string
  readonly configRefs: Readonly<Record<string, SecretRef>>
  readonly createdAt: number
  readonly updatedAt: number
}

export interface GrantAppSnapshot {
  readonly providerId: string
  readonly appLabel: string
  readonly configRefs: Readonly<Record<string, SecretRef>>
}
```

Inventory combines active public Extension Apps and local BYOA records but projects no configuration or secret material. Authorization resolves the exact App identity, validates config against its imported active Provider, and copies exact selected configuration into Grant-owned secret storage. Refresh reads the snapshot rather than current App inventory. Reauthorization durably replaces the snapshot before old references are cleaned.

Fresh persistence uses `oauth_apps` and Grant snapshot fields with no Client migration, alias, view, or deprecated command. Secret-backend discovery and switch traverse local App config, Grant App snapshots, and token references with copy/verify-before-cleanup.

### OAuth App and Account CLI boundary

```text
oauth-app add <provider> <label> --from-env
oauth-app list [--format json]
oauth-app remove <provider> <label>
account add <provider> --app <label> [--label <label>]
```

No `client` command or alias remains. The parser accepts no literal App config, client id, client secret, token, authorization code, or generic JSON config argument. Add resolves the exact active OAuth2 Provider before consulting its `registration.environment` map. The map is typed to top-level config-schema keys; environment names must satisfy `^[A-Z_][A-Z0-9_]*$`. Values are read once through the central environment loader, assembled by config key, and validated as one complete Provider config before any secret-store write or database mutation.

Unknown Provider/App selection fails before environment or secret reads, database mutation, browser launch, or Provider egress. Missing/invalid environment config fails before secret-store writes, database mutation, or network effects. Persistence writes config values to the configured secret backend, writes the local App record only after all references exist, and cleans newly written references on failure.

`oauth-app list --format json` and human inventory use an explicit safe projection containing Provider id, label, origin, and safe provenance when applicable. Remove resolves exact `(providerId,label)` and affects only future authorization; existing Grants retain their snapshots. `account add` requires `--app` even if one App exists, resolves exact `(providerId,label)` before effects, and snapshots the selected config. Authorization and refresh never consult `registration.environment` or reread App config from the process environment.

`CtxindexAuthErrorCode` replaces `missing_oauth_client_creds` with `missing_oauth_app_config`. The replacement retains the old code's stable CLI exit mapping; there is no compatibility alias. Add-time unknown/missing/invalid user input remains invalid usage and exits `2` with zero durable/network effects.

## Verification Boundaries

- SDK compile fixtures prove imported-value inference and impossible reference/dependency/providerless-invalid shapes.
- Registry tests prove transitive collection, standalone leaves, exact-object reuse, pure declarative canonical equality, conservative executable/schema conflicts across physical copies, providerless behavior, OAuth App duplicate rejection, and atomicity.
- Loader/Catalog tests prove `ctxindex.extensions`, common collection, exact selection, callback non-invocation, contained paths, and provenance diagnostics.
- OAuth tests prove App policy, safe inventory, BYOA collision handling, exact selection, snapshots, refresh independence, and secret traversal.
- CLI/error tests prove exact OAuth App commands, mandatory `--app`, no Client alias, no literal config argv, zero-effect validation, `missing_oauth_app_config`, and unchanged stable exits.
- Built-in/external tests prove identical activation semantics and unchanged integration behavior.
