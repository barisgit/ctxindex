# Extension Loading Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings prioritize interfaces, type aliases, discriminated unions, and full generic contracts trimmed from the current source. Exported functions appear only where they clarify a module boundary; imports and implementation bodies are omitted.

### @ctxindex/extension-sdk — Extension authoring contracts

```ts
export interface ExtensionDefinition<
  TId extends string = string,
  TVersion extends number = number,
  TProfiles extends
    readonly AnyProfileDefinition[] = readonly AnyProfileDefinition[],
  TAdapters extends
    readonly AnyAdapterDefinition[] = readonly AnyAdapterDefinition[],
> {
  readonly id: TId
  readonly version: TVersion
  readonly profiles: TProfiles
  readonly adapters: TAdapters
  readonly docs?: { readonly summary: string }
}

export type AnyExtensionDefinition = ExtensionDefinition

export interface ExtensionAuthoringHost {
  readonly z: typeof import('zod').z
  readonly defineProfile: typeof defineProfile
  readonly defineAdapter: typeof defineAdapter
  readonly defineExtension: typeof defineExtension
}

export function defineExtension<
  const TId extends string,
  const TVersion extends number,
  const TProfiles extends readonly AnyProfileDefinition[],
  const TAdapters extends readonly AnyAdapterDefinition[],
>(
  definition: ExtensionDefinition<TId, TVersion, TProfiles, TAdapters>,
): ExtensionDefinition<TId, TVersion, TProfiles, TAdapters>;
```

### @ctxindex/core — Extension loading

```ts
export interface ExtensionLoadDiagnostic {
  readonly path: string
  readonly message: string
}

export interface LoadExtensionsInput {
  readonly config: CtxindexConfig
  readonly builtins: readonly AnyExtensionDefinition[]
  readonly installed?: readonly InstalledExtensionRecord[]
  readonly dataRoot?: string
}

export type ExtensionLoadProvenance =
  | {
      readonly id: string
      readonly version: number
      readonly kind: 'builtin'
    }
  | {
      readonly id: string
      readonly version: number
      readonly kind: 'path'
      readonly path: string
    }
  | {
      readonly id: string
      readonly version: number
      readonly kind: 'catalog'
      readonly catalog: string
      readonly catalogId: string
      readonly repository: string
      readonly commit: string
      readonly snapshotAcquiredAt: number
      readonly sourcePath: string
    }

export interface LoadExtensionsResult {
  readonly registry: ExtensionRegistry
  readonly diagnostics: readonly ExtensionLoadDiagnostic[]
  readonly provenance: readonly ExtensionLoadProvenance[]
}

export async function loadExtensions(
  input: LoadExtensionsInput,
): Promise<LoadExtensionsResult>;

export async function importExtensionDefinition(
  extensionPath: string,
): Promise<AnyExtensionDefinition>;
```

### @ctxindex/core — Profile resolution

```ts
export interface UnknownProfileWarning {
  readonly code: 'unknown_profile_version'
  readonly profileId: string
  readonly profileVersion: number
}

export type ProfileResolution =
  | { readonly status: 'known'; readonly profile: AnyProfileDefinition }
  | {
      readonly status: 'degraded'
      readonly id: string
      readonly version: number
    }

export type KindResolution =
  | {
      readonly status: 'known'
      readonly id: string
      readonly profiles: readonly AnyProfileDefinition[]
    }
  | {
      readonly status: 'ambiguous'
      readonly kind: string
      readonly candidates: readonly string[]
    }
  | { readonly status: 'unknown'; readonly kind: string }

export interface ProfileRegistryOptions {
  readonly onWarning?: (warning: UnknownProfileWarning) => void
}

export class ProfileRegistry {
  readonly #profiles = new Map<string, AnyProfileDefinition>()
  constructor(
      profiles: readonly AnyProfileDefinition[],
      readonly options: ProfileRegistryOptions = {},
    );
  list(): readonly AnyProfileDefinition[];
  get(reference: ProfileReference): AnyProfileDefinition | undefined;
  resolveKind(value: string): KindResolution;
  resolve(reference: ProfileReference): ProfileResolution;
}

export function createProfileRegistry(
  profiles: readonly AnyProfileDefinition[],
  options?: ProfileRegistryOptions,
): ProfileRegistry;
```

### @ctxindex/core — definition registries

```ts
export class AdapterRegistry {
  readonly #adapters = new Map<string, AnyAdapterDefinition>()
  readonly #oauthProviders = new Map<string, OAuthProviderSpec>()
  constructor(
      readonly profiles: ProfileRegistry,
      adapters: readonly AnyAdapterDefinition[],
    );
  list(): readonly AnyAdapterDefinition[];
  get(reference: ProfileReference): AnyAdapterDefinition | undefined;
  getOAuthProvider(id: string): OAuthProviderSpec | undefined;
}

export function createAdapterRegistry(
  profiles: ProfileRegistry,
  adapters: readonly AnyAdapterDefinition[],
): AdapterRegistry;

export class ExtensionRegistry {
  #extensions: readonly AnyExtensionDefinition[]
  #profiles: ProfileRegistry
  #adapters: AdapterRegistry
  constructor(extensions: readonly AnyExtensionDefinition[]);
  get profiles(): ProfileRegistry;
  get adapters(): AdapterRegistry;
  list(): readonly AnyExtensionDefinition[];
  register(extension: AnyExtensionDefinition): void;
}

export function createExtensionRegistry(
  extensions: readonly AnyExtensionDefinition[] = [],
): ExtensionRegistry;
```

## Implementation doctrine

`@ctxindex/core` loads explicit `config.extensions.paths` entries and exact installed Catalog provenance. Each trusted module default-exports a factory receiving `ExtensionAuthoringHost`; runtime facilities are host-supplied, while type-only imports and Extension-local dependencies remain possible. `importExtensionDefinition()` is the single authoring-host seam shared by startup and pre-install validation.

Built-ins register first, followed by explicit paths and then installed Catalog entries. Catalog locations derive from portable provenance and validate their snapshot manifest, exact source path, and `(id, version)` before registry activation. Import, factory, schema, duplicate-id, provenance, or capability-consistency failures become path-scoped diagnostics and activate none of the failing Extension. The loader never acquires or mutates Catalog state; loaded Catalog provenance carries snapshot acquisition time so formatting can surface age offline. Registry binding uses `(id, version)`, never object identity. Missing Extensions leave locally stored Resources readable while provider operations report unavailability.

## Verification

Loader and registry tests cover atomic validation, duplicate/version behavior, host factories, Catalog provenance, missing snapshots, identity mismatches, and diagnostics. The relocated external-Extension and local-Git-Catalog e2e gates cover TypeScript, relative imports, installed provenance, and Extension-local dependencies under Bun 1.3.14.
