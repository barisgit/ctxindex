import type {
  AnyAdapterDefinition,
  AnyExtensionDefinition,
  AnyProviderDefinition,
  OAuthProviderDefinition,
} from '@ctxindex/extension-sdk'
import {
  buildCompleteCandidateRegistry,
  type CollectedExtension,
  type CompleteRegistry,
} from './complete-registry'
import { createProfileRegistry, type ProfileRegistry } from './profile-registry'

export { DefinitionRegistryError } from './profile-registry'

interface IdReference {
  readonly id: string
}

function collectedExtensions(
  extensions: readonly AnyExtensionDefinition[],
): readonly CollectedExtension[] {
  return extensions.map((definition, index) => ({
    definition,
    provenance: {
      origin: 'builtin',
      entry: `runtime:${index}`,
      exportName: 'default',
    },
  }))
}

function buildComplete(
  extensions: readonly AnyExtensionDefinition[],
): CompleteRegistry {
  return buildCompleteCandidateRegistry({
    roots: collectedExtensions(extensions),
    localOAuthAppIdentities: [],
  })
}

function adapterExtension(
  profiles: ProfileRegistry,
  adapters: readonly AnyAdapterDefinition[],
): AnyExtensionDefinition {
  return {
    kind: 'extension',
    id: 'ctxindex.runtime.adapter-registry',
    providers: [],
    oauthApps: [],
    profiles: profiles.list(),
    adapters,
  }
}

export class AdapterRegistry {
  readonly #adapters: ReadonlyMap<string, AnyAdapterDefinition>
  readonly #providers: ReadonlyMap<string, AnyProviderDefinition>
  readonly profiles: ProfileRegistry

  constructor(
    profiles: ProfileRegistry,
    adapters: readonly AnyAdapterDefinition[],
    completeRegistry?: CompleteRegistry,
  ) {
    const complete =
      completeRegistry ?? buildComplete([adapterExtension(profiles, adapters)])
    this.#adapters = complete.adapters
    this.#providers = complete.providers
    this.profiles =
      completeRegistry === undefined
        ? createProfileRegistry([...complete.profiles.values()])
        : profiles
  }

  static fromComplete(
    complete: CompleteRegistry,
    profiles: ProfileRegistry,
  ): AdapterRegistry {
    return new AdapterRegistry(profiles, [], complete)
  }

  list(): readonly AnyAdapterDefinition[] {
    return [...this.#adapters.values()]
  }

  get(reference: IdReference): AnyAdapterDefinition | undefined {
    return this.#adapters.get(reference.id)
  }

  getOAuthProvider(id: string): OAuthProviderDefinition | undefined {
    const provider = this.#providers.get(id)
    return provider?.auth.kind === 'oauth2'
      ? (provider as OAuthProviderDefinition)
      : undefined
  }
}

export function createAdapterRegistry(
  profiles: ProfileRegistry,
  adapters: readonly AnyAdapterDefinition[],
): AdapterRegistry {
  return new AdapterRegistry(profiles, adapters)
}

export class ExtensionRegistry {
  #extensions: readonly AnyExtensionDefinition[]
  #profiles: ProfileRegistry
  #adapters: AdapterRegistry

  constructor(extensions: readonly AnyExtensionDefinition[]) {
    const built = this.#build(extensions)
    this.#extensions = built.extensions
    this.#profiles = built.profiles
    this.#adapters = built.adapters
  }

  get profiles(): ProfileRegistry {
    return this.#profiles
  }

  get adapters(): AdapterRegistry {
    return this.#adapters
  }

  list(): readonly AnyExtensionDefinition[] {
    return this.#extensions
  }

  register(extension: AnyExtensionDefinition): void {
    const built = this.#build([...this.#extensions, extension])
    this.#extensions = built.extensions
    this.#profiles = built.profiles
    this.#adapters = built.adapters
  }

  #build(extensions: readonly AnyExtensionDefinition[]): {
    readonly extensions: readonly AnyExtensionDefinition[]
    readonly profiles: ProfileRegistry
    readonly adapters: AdapterRegistry
  } {
    const complete = buildComplete(extensions)
    const profiles = createProfileRegistry([...complete.profiles.values()])
    return {
      extensions: [...complete.extensions.values()],
      profiles,
      adapters: AdapterRegistry.fromComplete(complete, profiles),
    }
  }
}

export function createExtensionRegistry(
  extensions: readonly AnyExtensionDefinition[] = [],
): ExtensionRegistry {
  return new ExtensionRegistry(extensions)
}
