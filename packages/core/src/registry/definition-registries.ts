import type {
  AdapterCapability,
  AnyAdapterDefinition,
  AnyExtensionDefinition,
  AnyProfileDefinition,
  ProfileAction,
  ProfileReference,
} from '@ctxindex/extension-sdk'
import { z } from 'zod'
import {
  createProfileRegistry,
  DefinitionRegistryError,
  type ProfileRegistry,
} from './profile-registry'

export { DefinitionRegistryError } from './profile-registry'

const functionSchema = z.custom<(...args: readonly unknown[]) => unknown>(
  (value) => typeof value === 'function',
)
const schemaSchema = z.custom<z.ZodTypeAny>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    'safeParse' in value &&
    typeof value.safeParse === 'function',
)
const referenceSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
})
const bindingSchema = z.object({
  profile: referenceSchema,
  input: schemaSchema,
  output: referenceSchema,
  run: functionSchema,
})
const authSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('oauth2'),
    provider: z.object({
      authUrl: z.string().min(1),
      tokenUrl: z.string().min(1),
    }),
    scopes: z.array(z.string().min(1)).readonly(),
  }),
  z.object({ kind: z.literal('api-key'), label: z.string().min(1) }),
  z.object({ kind: z.literal('basic') }),
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('custom') }),
])
const adapterDefinitionSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  configSchema: schemaSchema,
  auth: authSchema,
  profiles: z.array(referenceSchema).readonly(),
  capabilities: z
    .array(z.enum(['sync', 'search-remote', 'retrieve', 'download']))
    .readonly(),
  operations: z
    .object({
      sync: functionSchema.optional(),
      searchRemote: functionSchema.optional(),
      retrieve: functionSchema.optional(),
      download: functionSchema.optional(),
    })
    .strict(),
  actions: z.record(z.string(), bindingSchema),
  docs: z.object({ summary: z.string().min(1) }).optional(),
})
const extensionDefinitionSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  profiles: z.array(z.unknown()).readonly(),
  adapters: z.array(z.unknown()).readonly(),
  docs: z.object({ summary: z.string().min(1) }).optional(),
})

const operationByCapability = {
  sync: 'sync',
  'search-remote': 'searchRemote',
  retrieve: 'retrieve',
  download: 'download',
} as const satisfies Record<AdapterCapability, string>

function key(reference: ProfileReference): string {
  return `${reference.id}@${reference.version}`
}

function schemasMatch(left: z.ZodTypeAny, right: z.ZodTypeAny): boolean {
  return (
    JSON.stringify(z.toJSONSchema(left)) ===
    JSON.stringify(z.toJSONSchema(right))
  )
}

function validateAdapter(
  profiles: ProfileRegistry,
  adapter: AnyAdapterDefinition,
): void {
  const result = adapterDefinitionSchema.safeParse(adapter)
  if (!result.success) {
    throw new DefinitionRegistryError(
      `Invalid Adapter definition: ${result.error.issues[0]?.message ?? 'validation failed'}`,
      'invalid_definition',
      { issues: result.error.issues },
    )
  }
  const capabilities = new Set(adapter.capabilities)
  if (capabilities.size !== adapter.capabilities.length) {
    throw new DefinitionRegistryError(
      `Invalid Adapter ${adapter.id}@${adapter.version}: duplicate capability`,
      'capability_operation_mismatch',
    )
  }
  for (const [capability, operation] of Object.entries(
    operationByCapability,
  ) as [AdapterCapability, keyof typeof adapter.operations][]) {
    const declares = capabilities.has(capability)
    const implementsOperation = adapter.operations[operation] !== undefined
    if (declares && !implementsOperation) {
      throw new DefinitionRegistryError(
        `Capability ${capability} requires operation ${operation}`,
        'capability_operation_mismatch',
      )
    }
    if (!declares && implementsOperation) {
      throw new DefinitionRegistryError(
        `Operation ${operation} requires capability ${capability}`,
        'capability_operation_mismatch',
      )
    }
  }

  const expectedActions = new Map<
    string,
    { profile: AnyProfileDefinition; action: ProfileAction }
  >()
  for (const reference of adapter.profiles) {
    const profile = profiles.get(reference)
    if (!profile) {
      throw new DefinitionRegistryError(
        `Adapter ${adapter.id}@${adapter.version} references unknown Profile ${key(reference)}`,
        'unknown_profile',
      )
    }
    for (const [actionId, action] of Object.entries(profile.actions ?? {})) {
      if (expectedActions.has(actionId)) {
        throw new DefinitionRegistryError(
          `Action ${actionId} is declared by multiple supported Profiles`,
          'action_binding_mismatch',
        )
      }
      expectedActions.set(actionId, { profile, action })
    }
  }

  for (const [actionId, binding] of Object.entries(adapter.actions)) {
    const expected = expectedActions.get(actionId)
    if (!expected) {
      throw new DefinitionRegistryError(
        `Undeclared Action ${actionId} on Adapter ${adapter.id}@${adapter.version}`,
        'action_binding_mismatch',
      )
    }
    if (key(binding.profile) !== key(expected.profile)) {
      throw new DefinitionRegistryError(
        `Action ${actionId} is bound to the wrong Profile`,
        'action_binding_mismatch',
      )
    }
    if (!schemasMatch(binding.input, expected.action.input)) {
      throw new DefinitionRegistryError(
        `Incompatible input schema for Action ${actionId}`,
        'action_binding_mismatch',
      )
    }
    if (key(binding.output) !== key(expected.action.output)) {
      throw new DefinitionRegistryError(
        `Incompatible output contract for Action ${actionId}`,
        'action_binding_mismatch',
      )
    }
  }
}

export class AdapterRegistry {
  readonly #adapters = new Map<string, AnyAdapterDefinition>()

  constructor(
    readonly profiles: ProfileRegistry,
    adapters: readonly AnyAdapterDefinition[],
  ) {
    for (const adapter of adapters) {
      validateAdapter(profiles, adapter)
      const adapterKey = key(adapter)
      if (this.#adapters.has(adapterKey)) {
        throw new DefinitionRegistryError(
          `Duplicate Adapter ${adapterKey}`,
          'duplicate_definition',
        )
      }
      this.#adapters.set(adapterKey, adapter)
    }
  }

  list(): readonly AnyAdapterDefinition[] {
    return [...this.#adapters.values()]
  }

  get(reference: ProfileReference): AnyAdapterDefinition | undefined {
    return this.#adapters.get(key(reference))
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
    const built = buildRegistries(extensions)
    this.#extensions = [...extensions]
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
    const result = extensionDefinitionSchema.safeParse(extension)
    if (!result.success) {
      throw new DefinitionRegistryError(
        `Invalid Extension definition: ${result.error.issues[0]?.message ?? 'validation failed'}`,
        'invalid_definition',
        { issues: result.error.issues },
      )
    }
    const extensionKey = key(extension)
    if (this.#extensions.some((candidate) => key(candidate) === extensionKey)) {
      throw new DefinitionRegistryError(
        `Duplicate Extension ${extensionKey}`,
        'duplicate_definition',
      )
    }

    const nextExtensions = [...this.#extensions, extension]
    const built = buildRegistries(nextExtensions)
    this.#extensions = nextExtensions
    this.#profiles = built.profiles
    this.#adapters = built.adapters
  }
}

function buildRegistries(extensions: readonly AnyExtensionDefinition[]): {
  profiles: ProfileRegistry
  adapters: AdapterRegistry
} {
  for (const extension of extensions) {
    const result = extensionDefinitionSchema.safeParse(extension)
    if (!result.success) {
      throw new DefinitionRegistryError(
        `Invalid Extension definition: ${result.error.issues[0]?.message ?? 'validation failed'}`,
        'invalid_definition',
        { issues: result.error.issues },
      )
    }
  }
  const profiles = createProfileRegistry(
    extensions.flatMap((extension) => extension.profiles),
  )
  const adapters = createAdapterRegistry(
    profiles,
    extensions.flatMap((extension) => extension.adapters),
  )
  return { profiles, adapters }
}

export function createExtensionRegistry(
  extensions: readonly AnyExtensionDefinition[] = [],
): ExtensionRegistry {
  return new ExtensionRegistry(extensions)
}
