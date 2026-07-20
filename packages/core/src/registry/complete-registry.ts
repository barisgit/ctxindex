import type {
  AdapterCapability,
  AnyAdapterDefinition,
  AnyExtensionDefinition,
  AnyOAuthAppDefinition,
  AnyProfileDefinition,
  AnyProviderDefinition,
} from '@ctxindex/extension-sdk'
import { z } from 'zod'
import { isSafeEnvironmentVariableName } from '../config/env-loader'
import { isEnvUri } from '../config/env-uri'
import type { ResolvedDocumentationTree } from '../extension/documentation'
import { compareUnicodeCodePoints } from '../internal/code-point-order'
import { parseSecretRef } from '../secrets/types'
import { isDefinitionId } from './definition-id'
import {
  createProfileRegistry,
  DefinitionRegistryError,
} from './profile-registry'

export interface DefinitionProvenance {
  readonly origin: 'builtin' | 'explicit-path' | 'catalog' | 'direct'
  readonly packageName?: string
  readonly packageVersion?: string
  readonly integrity?: string
  readonly commit?: string
  readonly entry: string
  readonly exportName: string
}

export interface CollectedExtension {
  readonly definition: AnyExtensionDefinition
  readonly provenance: DefinitionProvenance
  readonly documentation?: ResolvedDocumentationTree
}

export interface CollectedExtensionGraph {
  readonly extension: AnyExtensionDefinition
  readonly adapters: readonly AnyAdapterDefinition[]
  readonly oauthApps: readonly AnyOAuthAppDefinition[]
  readonly providers: readonly AnyProviderDefinition[]
  readonly profiles: readonly AnyProfileDefinition[]
  readonly provenance: DefinitionProvenance
}

export interface OAuthAppIdentity {
  readonly providerId: string
  readonly label: string
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

interface ResolvedExtensionRoot {
  readonly definition: AnyExtensionDefinition
  readonly provenances: readonly DefinitionProvenance[]
}

interface ReachableDefinitions {
  readonly providers: Map<string, AnyProviderDefinition>
  readonly oauthApps: Map<string, AnyOAuthAppDefinition>
  readonly profiles: Map<string, AnyProfileDefinition>
  readonly adapters: Map<string, AnyAdapterDefinition>
}

function profileKey(profile: {
  readonly id: string
  readonly version: number
}) {
  return `${profile.id}@${profile.version}`
}

function oauthAppKey(app: {
  readonly provider: { readonly id: string }
  readonly label: string
}) {
  return JSON.stringify([app.provider.id, app.label])
}

function invalid(message: string): never {
  throw new DefinitionRegistryError(message, 'invalid_definition')
}

function exactKeys(
  value: object,
  allowed: readonly string[],
  required: readonly string[],
): boolean {
  const keys = Object.keys(value)
  return (
    keys.every((key) => allowed.includes(key)) &&
    required.every((key) => keys.includes(key))
  )
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    isObject(value) &&
    Object.prototype.toString.call(value) === '[object Object]'
  )
}

function isSchema(value: unknown): value is z.ZodTypeAny {
  return (
    isObject(value) &&
    'safeParse' in value &&
    typeof value.safeParse === 'function'
  )
}

function rejectEmbeddedDefinitionDocs(
  value: unknown,
  seen = new WeakSet<object>(),
): void {
  if (!isObject(value) || isSchema(value) || seen.has(value)) {
    return
  }
  seen.add(value)
  if (Array.isArray(value)) {
    for (const entry of value) rejectEmbeddedDefinitionDocs(entry, seen)
    return
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'docs') invalid('Embedded definition docs are not supported')
    if (key === 'config' && value.kind === 'oauth-app') continue
    rejectEmbeddedDefinitionDocs(entry, seen)
  }
}

const oauthScopePattern = /^[\x21\x23-\x5b\x5d-\x7e]+$/
const dnsHostPattern =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

function isJsonPath(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((segment) => typeof segment === 'string' && segment.length > 0)
  )
}

function invalidOAuth2Provider(): never {
  invalid('Invalid OAuth2 Provider definition')
}

function validateOAuth2Auth(auth: Record<string, unknown>): void {
  if (
    !exactKeys(
      auth,
      [
        'kind',
        'authorizationUrl',
        'tokenUrl',
        'identity',
        'pkce',
        'registration',
        'baseScopes',
        'allowedHosts',
        'fixedAuthorizationParams',
      ],
      [
        'kind',
        'authorizationUrl',
        'tokenUrl',
        'identity',
        'pkce',
        'registration',
        'baseScopes',
        'allowedHosts',
      ],
    ) ||
    !Array.isArray(auth.baseScopes) ||
    !auth.baseScopes.every(
      (scope) => typeof scope === 'string' && oauthScopePattern.test(scope),
    ) ||
    new Set(auth.baseScopes).size !== auth.baseScopes.length ||
    !Array.isArray(auth.allowedHosts) ||
    !auth.allowedHosts.every(
      (host) =>
        typeof host === 'string' &&
        host === host.toLowerCase() &&
        dnsHostPattern.test(host),
    ) ||
    new Set(auth.allowedHosts).size !== auth.allowedHosts.length ||
    !isObject(auth.pkce) ||
    !exactKeys(auth.pkce, ['method', 'required'], ['method', 'required']) ||
    auth.pkce.method !== 'S256' ||
    auth.pkce.required !== true ||
    !isObject(auth.registration) ||
    !exactKeys(
      auth.registration,
      ['type', 'configSchema', 'environment'],
      ['type', 'configSchema', 'environment'],
    ) ||
    (auth.registration.type !== 'public' &&
      auth.registration.type !== 'confidential') ||
    !isSchema(auth.registration.configSchema) ||
    !isObject(auth.identity) ||
    !exactKeys(
      auth.identity,
      ['url', 'subjectPath', 'labelPaths', 'identities'],
      ['url', 'subjectPath', 'labelPaths', 'identities'],
    ) ||
    !isJsonPath(auth.identity.subjectPath) ||
    !Array.isArray(auth.identity.labelPaths) ||
    auth.identity.labelPaths.length === 0 ||
    !auth.identity.labelPaths.every(isJsonPath) ||
    new Set(auth.identity.labelPaths.map((path) => JSON.stringify(path)))
      .size !== auth.identity.labelPaths.length ||
    !Array.isArray(auth.identity.identities) ||
    auth.identity.identities.length === 0
  ) {
    invalidOAuth2Provider()
  }

  if (
    !isObject(auth.registration.environment) ||
    Array.isArray(auth.registration.environment)
  ) {
    invalidOAuth2Provider()
  }
  let acceptedKeys: ReadonlySet<string>
  try {
    const jsonSchema = z.toJSONSchema(auth.registration.configSchema, {
      io: 'input',
    })
    acceptedKeys = new Set(
      isObject(jsonSchema.properties) ? Object.keys(jsonSchema.properties) : [],
    )
  } catch {
    invalidOAuth2Provider()
  }
  const environmentEntries = Object.entries(auth.registration.environment)
  if (
    environmentEntries.length !== acceptedKeys.size ||
    environmentEntries.some(([key]) => !acceptedKeys.has(key))
  ) {
    invalidOAuth2Provider()
  }
  const environmentValues = new Set<string>()
  for (const [, value] of environmentEntries) {
    if (
      typeof value !== 'string' ||
      !isSafeEnvironmentVariableName(value) ||
      environmentValues.has(value)
    ) {
      invalidOAuth2Provider()
    }
    environmentValues.add(value)
  }

  const identityKeys = new Set<string>()
  for (const identity of auth.identity.identities) {
    if (
      !isObject(identity) ||
      !exactKeys(
        identity,
        ['kind', 'path', 'verifiedPath'],
        ['kind', 'path'],
      ) ||
      typeof identity.kind !== 'string' ||
      !/^[a-z][a-z0-9._-]*$/.test(identity.kind) ||
      !isJsonPath(identity.path) ||
      (identity.verifiedPath !== undefined &&
        !isJsonPath(identity.verifiedPath))
    ) {
      invalidOAuth2Provider()
    }
    const key = JSON.stringify([identity.kind, identity.path])
    if (identityKeys.has(key)) invalidOAuth2Provider()
    identityKeys.add(key)
  }

  const allowedHosts = new Set(auth.allowedHosts as string[])
  for (const endpoint of [
    auth.authorizationUrl,
    auth.tokenUrl,
    auth.identity.url,
  ]) {
    if (typeof endpoint !== 'string') invalidOAuth2Provider()
    try {
      const url = new URL(endpoint)
      if (
        url.protocol !== 'https:' ||
        url.username !== '' ||
        url.password !== '' ||
        url.hash !== '' ||
        !allowedHosts.has(url.hostname)
      ) {
        invalidOAuth2Provider()
      }
    } catch {
      invalidOAuth2Provider()
    }
  }

  if (auth.fixedAuthorizationParams !== undefined) {
    if (!isObject(auth.fixedAuthorizationParams)) invalidOAuth2Provider()
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
    for (const [name, value] of Object.entries(auth.fixedAuthorizationParams)) {
      if (
        !/^[A-Za-z][A-Za-z0-9._~-]*$/.test(name) ||
        reserved.has(name) ||
        typeof value !== 'string' ||
        value.length === 0
      ) {
        invalidOAuth2Provider()
      }
    }
  }
}

function validateExtensionDefinition(
  extension: unknown,
): asserts extension is AnyExtensionDefinition {
  rejectEmbeddedDefinitionDocs(extension)
  if (
    !isObject(extension) ||
    extension.kind !== 'extension' ||
    !isDefinitionId(extension.id) ||
    !Array.isArray(extension.providers) ||
    !Array.isArray(extension.oauthApps) ||
    !Array.isArray(extension.profiles) ||
    !Array.isArray(extension.adapters) ||
    !exactKeys(
      extension,
      ['kind', 'id', 'providers', 'oauthApps', 'profiles', 'adapters'],
      ['kind', 'id', 'providers', 'oauthApps', 'profiles', 'adapters'],
    )
  ) {
    invalid('Invalid Extension definition')
  }
}

function validateProviderDefinition(
  provider: unknown,
): asserts provider is AnyProviderDefinition {
  if (
    !isObject(provider) ||
    provider.kind !== 'provider' ||
    !isDefinitionId(provider.id) ||
    !isObject(provider.auth) ||
    !exactKeys(provider, ['kind', 'id', 'auth'], ['kind', 'id', 'auth']) ||
    (provider.auth.kind !== 'none' && provider.auth.kind !== 'oauth2')
  ) {
    invalid('Invalid Provider definition')
  }
  if (provider.auth.kind === 'none') {
    if (!exactKeys(provider.auth, ['kind'], ['kind']))
      invalid('Invalid Provider definition')
    return
  }
  validateOAuth2Auth(provider.auth)
}

function validateProfileDefinition(
  profile: unknown,
): asserts profile is AnyProfileDefinition {
  if (
    !isObject(profile) ||
    profile.kind !== 'profile' ||
    !isDefinitionId(profile.id) ||
    typeof profile.version !== 'number' ||
    !Number.isInteger(profile.version) ||
    profile.version <= 0 ||
    !isSchema(profile.schema) ||
    !exactKeys(
      profile,
      [
        'kind',
        'id',
        'version',
        'schema',
        'search',
        'relations',
        'artifacts',
        'exports',
        'actions',
      ],
      ['kind', 'id', 'version', 'schema'],
    )
  ) {
    invalid('Invalid Profile definition')
  }
}

function validateAdapterDefinition(
  adapter: unknown,
): asserts adapter is AnyAdapterDefinition {
  if (!isObject(adapter)) invalid('Invalid Adapter definition')
  const value = adapter as AnyAdapterDefinition & Record<string, unknown>
  if (
    value.provider === undefined &&
    ('access' in value ||
      'account' in value ||
      'auth' in value ||
      'providerApiHosts' in value)
  ) {
    invalid(
      `Providerless Adapter ${adapter.id} forbids Provider access, API hosts, auth, and account bindings`,
    )
  }
  if (
    adapter.kind !== 'adapter' ||
    !isDefinitionId(adapter.id) ||
    !isSchema(adapter.configSchema) ||
    !Array.isArray(adapter.profiles) ||
    !Array.isArray(adapter.capabilities) ||
    !adapter.capabilities.every((capability) =>
      ['sync', 'search-remote', 'retrieve', 'download'].includes(
        capability as string,
      ),
    ) ||
    (adapter.routing !== 'indexed' &&
      adapter.routing !== 'federated' &&
      adapter.routing !== 'hybrid') ||
    !isRecord(adapter.operations) ||
    !exactKeys(
      adapter.operations,
      ['sync', 'searchRemote', 'retrieve', 'download'],
      [],
    ) ||
    !Object.values(adapter.operations).every(
      (operation) => typeof operation === 'function',
    ) ||
    !isRecord(adapter.actions) ||
    !exactKeys(
      adapter,
      [
        'kind',
        'id',
        'configSchema',
        'provider',
        'access',
        'providerApiHosts',
        'profiles',
        'routing',
        'capabilities',
        'operations',
        'actions',
      ],
      [
        'kind',
        'id',
        'configSchema',
        'profiles',
        'routing',
        'capabilities',
        'operations',
        'actions',
      ],
    )
  ) {
    invalid('Invalid Adapter definition')
  }

  if (adapter.access !== undefined) {
    if (
      !isRecord(adapter.access) ||
      !exactKeys(adapter.access, ['scopes'], ['scopes']) ||
      !Array.isArray(adapter.access.scopes) ||
      !adapter.access.scopes.every(
        (scope) => typeof scope === 'string' && oauthScopePattern.test(scope),
      ) ||
      new Set(adapter.access.scopes).size !== adapter.access.scopes.length
    ) {
      invalid('Invalid Adapter definition')
    }
  }

  if (
    adapter.providerApiHosts !== undefined &&
    (!Array.isArray(adapter.providerApiHosts) ||
      !adapter.providerApiHosts.every(
        (host) =>
          typeof host === 'string' &&
          host === host.toLowerCase() &&
          dnsHostPattern.test(host),
      ) ||
      new Set(adapter.providerApiHosts).size !==
        adapter.providerApiHosts.length)
  ) {
    invalid('Invalid Adapter definition')
  }

  for (const [actionId, binding] of Object.entries(adapter.actions)) {
    if (
      actionId.length === 0 ||
      !isRecord(binding) ||
      !exactKeys(
        binding,
        ['profile', 'input', 'output', 'run'],
        ['profile', 'input', 'output', 'run'],
      ) ||
      !isSchema(binding.input) ||
      typeof binding.run !== 'function'
    ) {
      invalid('Invalid Adapter definition')
    }
    validateProfileDefinition(binding.profile)
    validateProfileDefinition(binding.output)
  }
}

function validateOAuthAppDefinition(
  app: unknown,
): asserts app is AnyOAuthAppDefinition {
  if (
    !isObject(app) ||
    app.kind !== 'oauth-app' ||
    typeof app.label !== 'string' ||
    !isObject(app.provider) ||
    app.provider.kind !== 'provider' ||
    !exactKeys(
      app,
      ['kind', 'provider', 'label', 'config'],
      ['kind', 'provider', 'label', 'config'],
    )
  ) {
    invalid('Invalid OAuth App definition')
  }
  if (app.label.trim().length === 0)
    invalid('OAuth App label must not be blank')
  validateProviderDefinition(app.provider)
  if (app.provider.auth.kind !== 'oauth2')
    invalid(`OAuth App ${app.label} requires an OAuth2 Provider`)
  if (app.provider.auth.registration.type !== 'public')
    invalid(`OAuth App ${app.label} requires public Provider registration`)
  const providerId = app.provider.id
  const appLabel = app.label
  const invalidConfig = () =>
    invalid(
      `Invalid OAuth App config for Provider "${providerId}", label "${appLabel}"`,
    )
  try {
    if (containsTypedSecretReference(app.config)) invalidConfig()
    const config = app.provider.auth.registration.configSchema.safeParse(
      app.config,
    )
    if (!config.success || containsTypedSecretReference(config.data))
      invalidConfig()
  } catch {
    invalidConfig()
  }
}

function containsTypedSecretReference(
  value: unknown,
  seen = new WeakSet<object>(),
): boolean {
  if (typeof value === 'string') {
    if (isEnvUri(value)) return true
    try {
      parseSecretRef(value)
      return true
    } catch {
      return false
    }
  }
  if (value === null || typeof value !== 'object' || seen.has(value))
    return false
  seen.add(value)
  return Object.values(value).some((entry) =>
    containsTypedSecretReference(entry, seen),
  )
}

function canonicalValue(value: unknown): unknown {
  if (isSchema(value)) return { schema: true }
  if (typeof value === 'function') return { executable: true }
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    )
  }
  return value
}

function containsExecutable(
  value: unknown,
  seen = new WeakSet<object>(),
): boolean {
  if (typeof value === 'function' || isSchema(value)) return true
  if (value === null || typeof value !== 'object') return false
  if (seen.has(value)) return false
  seen.add(value)
  if (Array.isArray(value))
    return value.some((entry) => containsExecutable(entry, seen))
  return Object.values(value).some((entry) => containsExecutable(entry, seen))
}

function definitionsMatch(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (containsExecutable(left) || containsExecutable(right)) return false
  return (
    JSON.stringify(canonicalValue(left)) ===
    JSON.stringify(canonicalValue(right))
  )
}

function addIdentical<T>(
  values: Map<string, T>,
  key: string,
  value: T,
  kind: string,
): void {
  const existing = values.get(key)
  if (existing !== undefined && !definitionsMatch(existing, value)) {
    invalid(`Conflicting ${kind} ${key}`)
  }
  if (existing === undefined) values.set(key, value)
}

const operationByCapability = {
  sync: 'sync',
  'search-remote': 'searchRemote',
  retrieve: 'retrieve',
  download: 'download',
} as const satisfies Record<AdapterCapability, string>

function validateAdapterAccess(adapter: AnyAdapterDefinition): void {
  const provider = adapter.provider
  if (provider === undefined) return
  if (provider.auth.kind === 'none') {
    if (adapter.access !== undefined)
      invalid(`Provider ${provider.id} forbids Adapter access scopes`)
    return
  }
  if (
    adapter.access === undefined ||
    !Array.isArray(adapter.access.scopes) ||
    !adapter.access.scopes.every(
      (scope) => typeof scope === 'string' && oauthScopePattern.test(scope),
    ) ||
    new Set(adapter.access.scopes).size !== adapter.access.scopes.length
  ) {
    invalid(
      `Provider ${provider.id} requires valid unique Adapter access scopes`,
    )
  }
}

function validateAdapterCapabilities(adapter: AnyAdapterDefinition): void {
  const capabilities = new Set(adapter.capabilities)
  if (capabilities.size !== adapter.capabilities.length)
    invalid(`Adapter ${adapter.id} declares a duplicate capability`)
  if (adapter.routing === 'federated' && !capabilities.has('search-remote'))
    invalid('Routing federated requires capability search-remote')
  if (
    adapter.routing === 'hybrid' &&
    (!capabilities.has('sync') || !capabilities.has('search-remote'))
  ) {
    invalid('Routing hybrid requires capabilities sync and search-remote')
  }
  for (const [capability, operation] of Object.entries(
    operationByCapability,
  ) as [AdapterCapability, keyof typeof adapter.operations][]) {
    const declares = capabilities.has(capability)
    const implementsOperation = adapter.operations[operation] !== undefined
    if (declares && !implementsOperation)
      invalid(`Capability ${capability} requires operation ${operation}`)
    if (!declares && implementsOperation)
      invalid(`Operation ${operation} requires capability ${capability}`)
  }
}

function collectReachable(root: AnyExtensionDefinition): ReachableDefinitions {
  const reachable: ReachableDefinitions = {
    providers: new Map(),
    oauthApps: new Map(),
    profiles: new Map(),
    adapters: new Map(),
  }

  const addProvider = (provider: AnyProviderDefinition): void => {
    validateProviderDefinition(provider)
    addIdentical(reachable.providers, provider.id, provider, 'Provider')
  }
  const addProfile = (profile: AnyProfileDefinition): void => {
    validateProfileDefinition(profile)
    addIdentical(reachable.profiles, profileKey(profile), profile, 'Profile')
  }
  const addAdapter = (adapter: AnyAdapterDefinition): void => {
    validateAdapterDefinition(adapter)
    addIdentical(reachable.adapters, adapter.id, adapter, 'Adapter')
    if (adapter.provider !== undefined) addProvider(adapter.provider)
    for (const profile of adapter.profiles) addProfile(profile)
    for (const binding of Object.values(adapter.actions)) {
      addProfile(binding.profile)
      addProfile(binding.output)
    }
  }
  const addOAuthApp = (app: AnyOAuthAppDefinition): void => {
    validateOAuthAppDefinition(app)
    const key = oauthAppKey(app)
    if (reachable.oauthApps.has(key)) invalid(`Duplicate OAuth App ${key}`)
    reachable.oauthApps.set(key, app)
    addProvider(app.provider)
  }

  for (const provider of root.providers) addProvider(provider)
  for (const profile of root.profiles) addProfile(profile)
  for (const adapter of root.adapters) addAdapter(adapter)
  for (const app of root.oauthApps) addOAuthApp(app)
  return reachable
}

export function collectExtensionGraph(
  root: AnyExtensionDefinition,
  provenance: DefinitionProvenance,
): CollectedExtensionGraph {
  validateExtensionDefinition(root)
  const reachable = collectReachable(root)
  return {
    extension: root,
    adapters: [...sortedMap(reachable.adapters).values()],
    oauthApps: [...sortedMap(reachable.oauthApps).values()],
    providers: [...sortedMap(reachable.providers).values()],
    profiles: [...sortedMap(reachable.profiles).values()],
    provenance,
  }
}

function sortedMap<T>(values: ReadonlyMap<string, T>): Map<string, T> {
  return new Map(
    [...values].sort(([left], [right]) =>
      compareUnicodeCodePoints(left, right),
    ),
  )
}

function provenanceOrder(
  left: DefinitionProvenance,
  right: DefinitionProvenance,
): number {
  return compareUnicodeCodePoints(
    JSON.stringify(canonicalValue(left)),
    JSON.stringify(canonicalValue(right)),
  )
}

export function buildCompleteCandidateRegistry(
  input: CandidateRegistryInput,
): CompleteRegistry {
  const rootsById = new Map<string, ResolvedExtensionRoot>()
  for (const collected of input.roots) {
    validateExtensionDefinition(collected.definition)
    const existing = rootsById.get(collected.definition.id)
    if (
      existing !== undefined &&
      !definitionsMatch(existing.definition, collected.definition)
    ) {
      invalid(`Conflicting Extension ${collected.definition.id}`)
    }
    rootsById.set(collected.definition.id, {
      definition: existing?.definition ?? collected.definition,
      provenances: [
        ...(existing?.provenances ?? []),
        collected.provenance,
      ].sort(provenanceOrder),
    })
  }

  const extensions = new Map<string, AnyExtensionDefinition>()
  const providers = new Map<string, AnyProviderDefinition>()
  const oauthApps = new Map<string, AnyOAuthAppDefinition>()
  const profiles = new Map<string, AnyProfileDefinition>()
  const adapters = new Map<string, AnyAdapterDefinition>()
  const provenances = new Map<string, DefinitionProvenance[]>()
  const provenanceIdentities = new Map<string, Set<string>>()

  const addProvenances = (
    key: string,
    values: readonly DefinitionProvenance[],
  ): void => {
    const entries = provenances.get(key) ?? []
    const identities = provenanceIdentities.get(key) ?? new Set<string>()
    for (const provenance of values) {
      const identity = JSON.stringify(canonicalValue(provenance))
      if (identities.has(identity)) continue
      identities.add(identity)
      entries.push(provenance)
    }
    entries.sort(provenanceOrder)
    provenances.set(key, entries)
    provenanceIdentities.set(key, identities)
  }

  const localOAuthAppKeys = new Set(
    input.localOAuthAppIdentities.map(({ providerId, label }) =>
      JSON.stringify([providerId, label]),
    ),
  )

  for (const [extensionId, root] of [...rootsById].sort(([left], [right]) =>
    compareUnicodeCodePoints(left, right),
  )) {
    extensions.set(extensionId, root.definition)
    addProvenances(`extension:${extensionId}`, root.provenances)
    const graph = collectExtensionGraph(
      root.definition,
      root.provenances[0] as DefinitionProvenance,
    )

    for (const provider of graph.providers) {
      addIdentical(providers, provider.id, provider, 'Provider')
      addProvenances(`provider:${provider.id}`, root.provenances)
    }
    for (const profile of graph.profiles) {
      const key = profileKey(profile)
      addIdentical(profiles, key, profile, 'Profile')
      addProvenances(`profile:${key}`, root.provenances)
    }
    for (const adapter of graph.adapters) {
      addIdentical(adapters, adapter.id, adapter, 'Adapter')
      addProvenances(`adapter:${adapter.id}`, root.provenances)
    }
    for (const app of graph.oauthApps) {
      const key = oauthAppKey(app)
      if (
        root.provenances.length > 1 ||
        localOAuthAppKeys.has(key) ||
        oauthApps.has(key)
      )
        invalid(`Duplicate OAuth App ${key}`)
      oauthApps.set(key, app)
      addProvenances(`oauth-app:${key}`, root.provenances)
    }
  }

  const validatedProfiles = createProfileRegistry([...profiles.values()])
  const actionOwners = new Map<string, string>()
  for (const profile of validatedProfiles.list()) {
    for (const [actionId, action] of Object.entries(profile.actions ?? {})) {
      if (!profiles.has(profileKey(action.output))) {
        invalid(
          `Action ${actionId} references unknown output Profile ${profileKey(action.output)}`,
        )
      }
      const owner = actionOwners.get(actionId)
      if (owner !== undefined)
        invalid(
          `Action ${actionId} is declared by multiple Profiles (${owner} and ${profileKey(profile)})`,
        )
      actionOwners.set(actionId, profileKey(profile))
    }
  }

  for (const adapter of adapters.values()) {
    validateAdapterAccess(adapter)
    validateAdapterCapabilities(adapter)
    const expectedActions = new Map<
      string,
      {
        readonly profile: AnyProfileDefinition
        readonly action: NonNullable<AnyProfileDefinition['actions']>[string]
      }
    >()
    for (const profile of adapter.profiles) {
      for (const [actionId, action] of Object.entries(profile.actions ?? {}))
        expectedActions.set(actionId, { profile, action })
    }
    for (const [actionId, binding] of Object.entries(adapter.actions)) {
      const expected = expectedActions.get(actionId)
      if (!expected)
        invalid(`Undeclared Action ${actionId} on Adapter ${adapter.id}`)
      if (profileKey(binding.profile) !== profileKey(expected.profile))
        invalid(`Action ${actionId} is bound to the wrong Profile`)
      if (!definitionsMatch(binding.input, expected.action.input))
        invalid(`Incompatible input schema for Action ${actionId}`)
      if (profileKey(binding.output) !== profileKey(expected.action.output))
        invalid(`Incompatible output contract for Action ${actionId}`)
    }
  }

  return {
    extensions: sortedMap(extensions),
    providers: sortedMap(providers),
    oauthApps: sortedMap(oauthApps),
    profiles: sortedMap(profiles),
    adapters: sortedMap(adapters),
    provenances: sortedMap(provenances),
  }
}
