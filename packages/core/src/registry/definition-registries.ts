import type {
  AdapterCapability,
  AnyAdapterDefinition,
  AnyExtensionDefinition,
  AnyProfileDefinition,
  OAuthProviderSpec,
  ProfileAction,
  ProfileReference,
} from '@ctxindex/extension-sdk'
import { z } from 'zod'
import { compareUnicodeCodePoints } from '../internal/code-point-order'
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
const jsonPathSchema = z
  .tuple([z.string().min(1)], z.string().min(1))
  .readonly()
const oauthScopeSchema = z
  .string()
  .regex(/^[\x21\x23-\x5b\x5d-\x7e]+$/, 'invalid OAuth scope token')
const dnsHostPattern =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const providerApiHostsSchema = z
  .array(z.string())
  .readonly()
  .superRefine((hosts, context) => {
    if (new Set(hosts).size !== hosts.length) {
      context.addIssue({
        code: 'custom',
        message: 'Adapter provider API hosts must be unique',
      })
    }
    for (const host of hosts) {
      if (host !== host.toLowerCase() || !dnsHostPattern.test(host)) {
        context.addIssue({
          code: 'custom',
          message: 'Adapter provider API hosts must be lowercase DNS hosts',
        })
      }
    }
  })
const identitySchema = z
  .object({
    url: z.string(),
    subjectPath: jsonPathSchema,
    labelPaths: z.array(jsonPathSchema).min(1).readonly(),
    identities: z
      .array(
        z
          .object({
            kind: z.string().regex(/^[a-z][a-z0-9._-]*$/),
            path: jsonPathSchema,
            verifiedPath: jsonPathSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .readonly(),
  })
  .strict()
const environmentBaseSchema = z.object({
  clientId: z.string(),
  refreshToken: z.string(),
})
const oauthProviderBaseShape = {
  id: z.string(),
  authorizationUrl: z.string(),
  tokenUrl: z.string(),
  identity: identitySchema,
  pkce: z
    .object({ method: z.literal('S256'), required: z.literal(true) })
    .strict(),
  baseScopes: z.array(oauthScopeSchema).readonly(),
  allowedHosts: z.array(z.string()).readonly(),
  fixedAuthorizationParams: z
    .record(z.string().regex(/^[A-Za-z][A-Za-z0-9._~-]*$/), z.string().min(1))
    .optional(),
}
const oauthProviderSchema = z
  .union([
    z
      .object({
        ...oauthProviderBaseShape,
        client: z
          .object({
            type: z.literal('public'),
            secret: z.literal('none'),
            tokenAuthMethod: z.literal('none'),
          })
          .strict(),
        environment: environmentBaseSchema.strict(),
      })
      .strict(),
    z
      .object({
        ...oauthProviderBaseShape,
        client: z
          .object({
            type: z.literal('public'),
            secret: z.literal('optional'),
            tokenAuthMethod: z.literal('client_secret_post'),
          })
          .strict(),
        environment: environmentBaseSchema
          .extend({ clientSecret: z.string().optional() })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...oauthProviderBaseShape,
        client: z
          .object({
            type: z.literal('confidential'),
            secret: z.literal('required'),
            tokenAuthMethod: z.literal('client_secret_post'),
          })
          .strict(),
        environment: environmentBaseSchema
          .extend({ clientSecret: z.string() })
          .strict(),
      })
      .strict(),
  ])
  .superRefine((provider, context) => {
    const issue = (message: string) =>
      context.addIssue({ code: 'custom', message })
    if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(provider.id))
      issue('OAuth provider id must be stable lowercase')
    const hosts = new Set(provider.allowedHosts)
    if (hosts.size !== provider.allowedHosts.length)
      issue('OAuth provider allowed hosts must be unique')
    for (const host of provider.allowedHosts) {
      if (host !== host.toLowerCase() || !dnsHostPattern.test(host))
        issue('OAuth provider hosts must be lowercase DNS hosts')
    }
    for (const value of [
      provider.authorizationUrl,
      provider.tokenUrl,
      provider.identity.url,
    ]) {
      try {
        const url = new URL(value)
        if (
          url.protocol !== 'https:' ||
          url.username !== '' ||
          url.password !== '' ||
          url.hash !== '' ||
          !hosts.has(url.hostname)
        )
          issue('OAuth endpoint must use HTTPS and an allowed host')
      } catch {
        issue('OAuth endpoint must be a valid HTTPS URL')
      }
    }
    for (const name of Object.values(provider.environment))
      if (name !== undefined && !/^[A-Z_][A-Z0-9_]*$/.test(name))
        issue('OAuth environment names must be safe')
    const unique = (values: readonly string[], message: string) => {
      if (new Set(values).size !== values.length) issue(message)
    }
    unique(provider.baseScopes, 'OAuth base scopes must be unique')
    unique(
      provider.identity.labelPaths.map((path) => JSON.stringify(path)),
      'OAuth identity label paths must be unique',
    )
    unique(
      provider.identity.identities.map(({ kind, path }) =>
        JSON.stringify([kind, path]),
      ),
      'OAuth identity declarations must be unique',
    )
    const reserved = new Set([
      'client_id',
      'code',
      'code_challenge',
      'code_challenge_method',
      'nonce',
      'redirect_uri',
      'response_type',
      'scope',
      'state',
    ])
    for (const name of Object.keys(provider.fixedAuthorizationParams ?? {}))
      if (reserved.has(name)) issue(`OAuth fixed parameter ${name} is reserved`)
  })
const authSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('oauth2'),
      provider: oauthProviderSchema,
      scopes: z.array(oauthScopeSchema).readonly(),
    })
    .strict(),
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
  providerApiHosts: providerApiHostsSchema.optional(),
  profiles: z.array(referenceSchema).readonly(),
  routing: z.enum(['indexed', 'federated', 'hybrid']),
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
  actions: z.record(z.string().min(1), bindingSchema),
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

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
      .map(([name, entry]) => `${JSON.stringify(name)}:${stableJson(entry)}`)
      .join(',')}}`
  return JSON.stringify(value)
}

function oauthProviderSemanticJson(provider: OAuthProviderSpec): string {
  return stableJson({
    ...provider,
    baseScopes: [...provider.baseScopes].sort(compareUnicodeCodePoints),
    allowedHosts: [...provider.allowedHosts].sort(compareUnicodeCodePoints),
    identity: {
      ...provider.identity,
      identities: [...provider.identity.identities].sort((left, right) =>
        compareUnicodeCodePoints(stableJson(left), stableJson(right)),
      ),
    },
  })
}

function validateActionOutputs(profiles: ProfileRegistry): void {
  for (const profile of profiles.list()) {
    for (const [actionId, action] of Object.entries(profile.actions ?? {})) {
      if (!profiles.get(action.output)) {
        throw new DefinitionRegistryError(
          `Action ${actionId} references unknown output Profile ${key(action.output)}`,
          'unknown_profile',
          { actionId, outputProfile: key(action.output) },
        )
      }
    }
  }
}

function schemasMatch(left: z.ZodTypeAny, right: z.ZodTypeAny): boolean {
  if (left === right) return true
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
  if (
    adapter.auth.kind === 'oauth2' &&
    new Set(adapter.auth.scopes).size !== adapter.auth.scopes.length
  ) {
    throw new DefinitionRegistryError(
      `Invalid Adapter ${adapter.id}@${adapter.version}: duplicate OAuth scope`,
      'invalid_definition',
    )
  }
  const capabilities = new Set(adapter.capabilities)
  if (capabilities.size !== adapter.capabilities.length) {
    throw new DefinitionRegistryError(
      `Invalid Adapter ${adapter.id}@${adapter.version}: duplicate capability`,
      'capability_operation_mismatch',
    )
  }
  if (adapter.routing === 'federated' && !capabilities.has('search-remote')) {
    throw new DefinitionRegistryError(
      'Routing federated requires capability search-remote',
      'capability_operation_mismatch',
    )
  }
  if (
    adapter.routing === 'hybrid' &&
    (!capabilities.has('sync') || !capabilities.has('search-remote'))
  ) {
    throw new DefinitionRegistryError(
      'Routing hybrid requires capabilities sync and search-remote',
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
  readonly #oauthProviders = new Map<string, OAuthProviderSpec>()

  constructor(
    readonly profiles: ProfileRegistry,
    adapters: readonly AnyAdapterDefinition[],
  ) {
    validateActionOutputs(profiles)
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
      if (adapter.auth.kind === 'oauth2') {
        const existing = this.#oauthProviders.get(adapter.auth.provider.id)
        if (
          existing &&
          oauthProviderSemanticJson(existing) !==
            oauthProviderSemanticJson(adapter.auth.provider)
        ) {
          throw new DefinitionRegistryError(
            `Inconsistent OAuth provider ${adapter.auth.provider.id}`,
            'invalid_definition',
          )
        }
        if (!existing)
          this.#oauthProviders.set(
            adapter.auth.provider.id,
            adapter.auth.provider,
          )
      }
    }
  }

  list(): readonly AnyAdapterDefinition[] {
    return [...this.#adapters.values()]
  }

  get(reference: ProfileReference): AnyAdapterDefinition | undefined {
    return this.#adapters.get(key(reference))
  }

  getOAuthProvider(id: string): OAuthProviderSpec | undefined {
    return this.#oauthProviders.get(id)
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
  const actionProfiles = new Map<string, AnyProfileDefinition>()
  for (const profile of profiles.list()) {
    for (const actionId of Object.keys(profile.actions ?? {})) {
      const existing = actionProfiles.get(actionId)
      if (existing) {
        throw new DefinitionRegistryError(
          `Action ${actionId} is declared by multiple Profiles (${key(existing)} and ${key(profile)})`,
          'action_binding_mismatch',
          { actionId, profiles: [key(existing), key(profile)] },
        )
      }
      actionProfiles.set(actionId, profile)
    }
  }
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
