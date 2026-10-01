import { randomUUID } from 'node:crypto'
import { lstatSync, rmSync } from 'node:fs'
import { userInfo } from 'node:os'
import { join } from 'node:path'
import { createAccountService } from '@ctxindex/core/account'
import { describeAction, runAction } from '@ctxindex/core/action'
import { ArtifactService } from '@ctxindex/core/artifact'
import {
  type AuthService,
  authorizeProvider,
  createAuthService,
  resolveOAuthSelection,
} from '@ctxindex/core/auth'
import {
  type CtxindexConfig,
  readConfig,
  readEnvironmentVariable,
  writeConfig,
} from '@ctxindex/core/config'
import { DirectExtensionStore } from '@ctxindex/core/direct-extension'
import {
  createDocumentationService,
  createExtensionDocumentationSource,
} from '@ctxindex/core/documentation'
import { CtxindexValidationError } from '@ctxindex/core/errors'
import { exportSourceResource } from '@ctxindex/core/export'
import {
  type LoadExtensionsResult,
  loadExtensions,
} from '@ctxindex/core/extension'
import { createLogger } from '@ctxindex/core/logger'
import {
  createOAuthAppService,
  listLocalOAuthAppIdentities,
  resolveManagedOAuthApp,
} from '@ctxindex/core/oauth-app'
import { createRealmService, type RealmService } from '@ctxindex/core/realm'
import type {
  CompleteRegistry,
  ExtensionRegistry,
} from '@ctxindex/core/registry'
import { SearchPlanner } from '@ctxindex/core/search'
import {
  createSecretBackendManager,
  createSecretVault,
  FileBackend,
  KeychainBackend,
  type SecretBackendManager,
  type SecretVault,
} from '@ctxindex/core/secrets'
import {
  createSourceService,
  getSourceResource,
  type SourceService,
} from '@ctxindex/core/source'
import {
  type CtxindexDatabase,
  openDatabase,
  runMigrations,
} from '@ctxindex/core/storage'
import { SyncApplicationService } from '@ctxindex/core/sync'
import { createThreadService, type ThreadService } from '@ctxindex/core/thread'
import type { OAuthProviderDefinition } from '@ctxindex/extension-sdk'
import {
  assertRetainedDatabaseLeaseTarget,
  cleanupDiscoveryMetadata,
  createFileLeaseBackend,
  createOwnerToken,
  type DiscoveryCleanupResult,
  type DiscoveryMetadata,
  type FileLease,
  type FileLeaseBackend,
  FileLeaseConflictError,
  type RuntimePathInput,
  readMatchingDiscoveryMetadata,
  resolveEndpoint,
  resolveRuntimeIdentity,
  writeDiscoveryMetadata,
} from '@ctxindex/local-daemon'
import * as CTXINDEX_BUILTIN_MODULE from '@ctxindex/official'
import type { RpcFailure, RpcRequestContext } from '@ctxindex/rpc'
import {
  type DaemonAccountService,
  type DaemonActionService,
  DaemonApplication,
  type DaemonIdleTimer,
  type DaemonOAuthAppService,
} from './application'
import { ByteTransferStore } from './transfer'
import {
  type BindDaemonTransportInput,
  bindDaemonTransport,
  type DaemonListener,
} from './transport'

export const DAEMON_PROTOCOL = { id: 'ctxindex.local', version: 2 } as const
const DEFAULT_OBSERVATION_TIMEOUT_MS = 5_000
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60_000
const PUBLIC_VERSION = /^[a-z0-9][a-z0-9.+_-]{0,63}$/i

const productionIdleTimer: DaemonIdleTimer = {
  now: Date.now,
  setTimeout(callback, delayMs) {
    const timer = setTimeout(callback, delayMs)
    timer.unref?.()
    return timer
  },
  clearTimeout(handle) {
    clearTimeout(handle as ReturnType<typeof setTimeout>)
  },
}

function buildVersion(): string {
  const candidate = process.env.CTXINDEX_BUILD_VERSION
  return candidate && PUBLIC_VERSION.test(candidate) ? candidate : 'development'
}

function requireObservationTimeout(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 60_000) {
    throw new RangeError(
      'Daemon shutdown observation timeout must be 1..60000 ms',
    )
  }
  return value
}

export function removeOwnedDaemonEndpoint(path: string): void {
  let stat: ReturnType<typeof lstatSync>
  try {
    stat = lstatSync(path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return
    }
    throw error
  }
  if (
    stat.isSymbolicLink() ||
    !stat.isSocket() ||
    stat.nlink !== 1 ||
    stat.uid !== userInfo().uid
  ) {
    throw new Error('Daemon endpoint is unsafe')
  }
  rmSync(path)
}

export interface DaemonServices {
  readonly accountService?: DaemonAccountService
  readonly actionService?: DaemonActionService
  readonly exportService?: {
    prepare(input: {
      readonly ref: string
      readonly format: string
      readonly signal: AbortSignal
    }): ReturnType<typeof exportSourceResource>
  }
  readonly artifactService?: Pick<
    ArtifactService,
    'list' | 'download' | 'downloadForTransfer' | 'purge'
  >
  readonly authService?: Pick<AuthService, 'listGrants'>
  readonly oauthAppService?: DaemonOAuthAppService
  readonly realmService?: Pick<RealmService, 'createRealm' | 'listRealms'>
  readonly registry?: ExtensionRegistry
  readonly searchService?: Pick<SearchPlanner, 'search'>
  readonly secretBackendManager?: SecretBackendManager
  readonly resourceService?: {
    get(input: {
      readonly ref: string
      readonly signal: AbortSignal
    }): ReturnType<typeof getSourceResource>
  }
  readonly threadService?: Pick<ThreadService, 'get'>
  readonly syncService: Pick<SyncApplicationService, 'run'>
  readonly sourceService: Pick<SourceService, 'resolveSourceId' | 'getStatus'> &
    Partial<
      Pick<
        SourceService,
        'addSource' | 'listSources' | 'findSourceById' | 'removeSource'
      >
    >
}

export interface DaemonRuntimeHooks {
  readonly readConfig: (path: string) => Promise<CtxindexConfig>
  readonly readInstalled: () => ReturnType<
    DirectExtensionStore['readRecordsForLoading']
  >
  readonly loadExtensions: (input: {
    readonly config: CtxindexConfig
    readonly builtins: typeof CTXINDEX_BUILTIN_MODULE
    readonly installed: Awaited<
      ReturnType<DirectExtensionStore['readRecordsForLoading']>
    >['records']
    readonly dataRoot: string
    readonly localOAuthAppIdentities: ReturnType<
      typeof listLocalOAuthAppIdentities
    >
  }) => Promise<
    Pick<
      LoadExtensionsResult,
      'completeRegistry' | 'diagnostics' | 'documentation' | 'registry'
    >
  >
  readonly openDatabase: (path: string) => Promise<CtxindexDatabase>
  readonly runMigrations: (database: CtxindexDatabase) => Promise<void>
  readonly listLocalOAuthAppIdentities: typeof listLocalOAuthAppIdentities
  readonly composeServices: (input: {
    readonly database: CtxindexDatabase
    readonly config: CtxindexConfig
    readonly completeRegistry: CompleteRegistry
    readonly registry: ExtensionRegistry
    readonly roots: ReturnType<typeof resolveRuntimeIdentity>
  }) => DaemonServices | Promise<DaemonServices>
  readonly bind: (input: BindDaemonTransportInput) => DaemonListener
  readonly readMatchingMetadata: typeof readMatchingDiscoveryMetadata
  readonly assertDatabaseTarget: typeof assertRetainedDatabaseLeaseTarget
  readonly writeMetadata: typeof writeDiscoveryMetadata
  readonly cleanupMetadata: typeof cleanupDiscoveryMetadata
  readonly removeEndpoint: (path: string) => void
}

export interface StartDaemonOptions {
  readonly roots: RuntimePathInput
  readonly endpointRuntimeRoot?: string
  readonly idleTimeoutMs?: number
  readonly idleTimer?: DaemonIdleTimer
  readonly observationTimeoutMs?: number
  readonly leaseBackend?: FileLeaseBackend
  readonly hooks?: Partial<DaemonRuntimeHooks>
}

export type DaemonCloseResult =
  | { readonly status: 'complete' }
  | {
      readonly status: 'timeout'
      readonly instanceId: string
      readonly timeoutMs: number
    }

export type DaemonStartupFailure = Extract<
  RpcFailure,
  { readonly kind: 'database_lease_conflict' }
>

export function isDaemonStartupFailure(
  value: unknown,
): value is DaemonStartupFailure {
  if (typeof value !== 'object' || value === null) return false
  const failure = value as Partial<DaemonStartupFailure>
  return (
    failure.kind === 'database_lease_conflict' &&
    failure.code === 'database_lease_conflict' &&
    failure.message ===
      'The database is held by another local process/runtime.' &&
    typeof failure.databaseDigest === 'string' &&
    /^[a-f0-9]{64}$/.test(failure.databaseDigest) &&
    !('ownerTupleDigest' in value)
  )
}

function databaseLeaseConflict(databaseDigest: string): DaemonStartupFailure {
  return Object.freeze({
    kind: 'database_lease_conflict',
    code: 'database_lease_conflict',
    message: 'The database is held by another local process/runtime.',
    databaseDigest,
  })
}

export function validateDaemonOAuthAppConfig(
  provider: OAuthProviderDefinition,
  config: Readonly<Record<string, string>>,
): Readonly<Record<string, unknown>> {
  const allowedFields = new Set(
    Object.keys(provider.auth.registration.environment),
  )
  if (Object.keys(config).some((field) => !allowedFields.has(field))) {
    throw new CtxindexValidationError(
      'invalid_filter',
      'OAuth App configuration contains an unknown field',
    )
  }
  const validated = provider.auth.registration.configSchema.safeParse(config)
  if (
    !validated.success ||
    validated.data === null ||
    typeof validated.data !== 'object' ||
    Array.isArray(validated.data)
  ) {
    throw new CtxindexValidationError(
      'invalid_filter',
      'OAuth App configuration is invalid for the selected Provider',
    )
  }
  return validated.data as Readonly<Record<string, unknown>>
}

async function productionServices(input: {
  readonly database: CtxindexDatabase
  readonly config: CtxindexConfig
  readonly completeRegistry: CompleteRegistry
  readonly registry: ExtensionRegistry
  readonly roots: ReturnType<typeof resolveRuntimeIdentity>
}): Promise<DaemonServices> {
  const logger = await createLogger({
    config: input.config,
    logDir: join(input.roots.stateRoot, 'logs'),
  })
  const realmService = createRealmService({ db: input.database, logger })
  const sourceService = createSourceService({
    db: input.database,
    logger,
    realmService,
    registry: input.registry,
  })
  const fileStore = new FileBackend()
  const keychainStore = new KeychainBackend()
  let selectedVault = createSecretVault({
    fileStore,
    keychainStore,
    backend: input.config.secrets.backend,
  })
  const secretVault: SecretVault = {
    get backend() {
      return selectedVault.backend
    },
    getSecret: (ref) => selectedVault.getSecret(ref),
    setSecret: (scope, key, value) =>
      selectedVault.setSecret(scope, key, value),
    deleteSecret: (ref) => selectedVault.deleteSecret(ref),
    listKeys: () => selectedVault.listKeys(),
  }
  const secretBackendManager = createSecretBackendManager({
    db: input.database,
    fileStore,
    keychainStore,
    logger,
    backend: input.config.secrets.backend,
    commitBackend: async (target) => {
      await writeConfig(
        { ...input.config, secrets: { backend: target } },
        join(input.roots.configRoot, 'config.toml'),
      )
      selectedVault = createSecretVault({
        fileStore,
        keychainStore,
        backend: target,
      })
    },
  })
  const authService: AuthService = createAuthService({
    db: input.database,
    store: secretVault,
    logger,
    registry: input.completeRegistry,
  })
  const accountService = createAccountService({ db: input.database })
  const oauthAppService = createOAuthAppService({
    db: input.database,
    store: secretVault,
    registry: input.completeRegistry,
  })
  const localOAuthAppGuidance = (providerId: string, label: string) =>
    [
      `Configure a local OAuth App with: bun cli oauth-app add ${providerId} ${label} --from-env`,
      `Then authorize with: bun cli account add ${providerId} --app ${label}`,
    ].join('. ')
  const daemonAccountService: DaemonAccountService = {
    authorize: async (accountInput, interaction, signal) => {
      resolveOAuthSelection(input.completeRegistry, accountInput.provider)
      let appLabel = accountInput.app
      if (appLabel === undefined) {
        const resolution = resolveManagedOAuthApp(
          input.completeRegistry,
          CTXINDEX_BUILTIN_MODULE.CTXINDEX_MANAGED_OAUTH_APP_POLICIES,
          accountInput.provider,
        )
        if (resolution.status !== 'selected') {
          throw new CtxindexValidationError(
            'invalid_oauth_selection',
            `No managed OAuth App is available for Provider "${accountInput.provider}". ${localOAuthAppGuidance(accountInput.provider, '<label>')}`,
          )
        }
        appLabel = resolution.label
      }
      let app: Awaited<ReturnType<typeof oauthAppService.resolveApp>>
      try {
        app = await oauthAppService.resolveApp(accountInput.provider, appLabel)
      } catch (error) {
        if (
          error instanceof CtxindexValidationError &&
          error.code === 'invalid_oauth_selection'
        ) {
          const available = oauthAppService
            .listApps()
            .filter(
              (candidate) => candidate.providerId === accountInput.provider,
            )
            .map((candidate) => candidate.label)
            .sort()
          const guidance =
            available.length === 0
              ? localOAuthAppGuidance(accountInput.provider, appLabel)
              : `Available labels: ${available.join(', ')}`
          throw new CtxindexValidationError(
            'invalid_oauth_selection',
            `OAuth App "${appLabel}" is not available for Provider "${accountInput.provider}". ${guidance}`,
            { cause: error },
          )
        }
        throw error
      }
      const result = await authorizeProvider(
        {
          provider: accountInput.provider,
          app: appLabel,
          mode: 'loopback',
          ...(accountInput.label === undefined
            ? {}
            : { label: accountInput.label }),
        },
        {
          registry: input.completeRegistry,
          authService,
          resolveApp: async (providerId, label) => {
            if (providerId !== accountInput.provider || label !== appLabel) {
              throw new CtxindexValidationError(
                'invalid_oauth_selection',
                'OAuth App selection changed during authorization',
              )
            }
            return app
          },
          readAuthorizationResponse: interaction.readAuthorizationResponse,
          signal,
          launchBrowser: () => {},
          readEnvironment: (name) =>
            name === 'CTXINDEX_NO_BROWSER'
              ? '1'
              : name === 'CTXINDEX_OAUTH_MOCK_BASE_URL' &&
                  accountInput.oauthMockBaseUrl !== undefined
                ? accountInput.oauthMockBaseUrl
                : name === 'CTXINDEX_LOOPBACK_TIMEOUT_SECS' &&
                    accountInput.loopbackTimeoutSeconds !== undefined
                  ? String(accountInput.loopbackTimeoutSeconds)
                  : readEnvironmentVariable(name),
        },
      )
      return { accountId: result.accountId }
    },
    list: () => accountService.listAccountInventory(),
    remove: (label) => authService.removeAccount(label),
  }
  const daemonOAuthAppService: DaemonOAuthAppService = {
    registration: (providerId) => {
      const provider = input.completeRegistry.providers.get(providerId)
      if (!provider || provider.auth.kind !== 'oauth2') {
        throw new CtxindexValidationError(
          'invalid_oauth_selection',
          `Unknown OAuth provider: ${providerId}`,
        )
      }
      return provider.auth.registration.environment
    },
    add: async (appInput) => {
      const provider = input.completeRegistry.providers.get(appInput.provider)
      if (!provider || provider.auth.kind !== 'oauth2') {
        throw new CtxindexValidationError(
          'invalid_oauth_selection',
          `Unknown OAuth provider: ${appInput.provider}`,
        )
      }
      validateDaemonOAuthAppConfig(
        provider as OAuthProviderDefinition,
        appInput.config,
      )
      await oauthAppService.addLocalApp({
        providerId: appInput.provider,
        label: appInput.label,
        config: appInput.config,
      })
    },
    list: () => oauthAppService.listApps(),
    remove: (providerId, label) =>
      oauthAppService.removeLocalApp(providerId, label),
  }
  return {
    accountService: daemonAccountService,
    actionService: {
      describe: ({ actionId, sourceId }) =>
        describeAction({
          db: input.database,
          registry: input.registry,
          actionId,
          sourceId,
        }),
      run: ({ actionId, sourceId, actionInput, signal, confirmIrreversible }) =>
        runAction({
          db: input.database,
          registry: input.registry,
          authService,
          logger,
          actionId,
          sourceId,
          actionInput,
          signal,
          confirmIrreversible,
        }),
    },
    artifactService: new ArtifactService({
      db: input.database,
      registry: input.registry,
      authService,
      logger,
    }),
    authService,
    exportService: {
      prepare: ({ ref, format, signal }) =>
        exportSourceResource({
          db: input.database,
          ref,
          format,
          registry: input.registry,
          authService,
          logger,
          signal,
        }),
    },
    oauthAppService: daemonOAuthAppService,
    realmService,
    registry: input.registry,
    searchService: new SearchPlanner({
      db: input.database,
      registry: input.registry,
      authService,
      logger,
    }),
    resourceService: {
      get: ({ ref, signal }) =>
        getSourceResource({
          db: input.database,
          ref,
          registry: input.registry,
          authService,
          logger,
          signal,
        }),
    },
    secretBackendManager,
    threadService: createThreadService({
      db: input.database,
      profiles: input.registry.profiles,
    }),
    sourceService,
    syncService: new SyncApplicationService({
      db: input.database,
      registry: input.registry,
      authService,
      logger,
      sourceService,
    }),
  }
}

function defaultHooks(
  roots: ReturnType<typeof resolveRuntimeIdentity>,
): DaemonRuntimeHooks {
  return {
    readConfig,
    readInstalled: () =>
      new DirectExtensionStore({
        configRoot: roots.configRoot,
        dataRoot: roots.dataRoot,
      }).readRecordsForLoading(),
    loadExtensions,
    openDatabase,
    runMigrations,
    listLocalOAuthAppIdentities,
    composeServices: productionServices,
    bind: bindDaemonTransport,
    readMatchingMetadata: readMatchingDiscoveryMetadata,
    assertDatabaseTarget: assertRetainedDatabaseLeaseTarget,
    writeMetadata: writeDiscoveryMetadata,
    cleanupMetadata: cleanupDiscoveryMetadata,
    removeEndpoint: removeOwnedDaemonEndpoint,
  }
}

function metadata(
  roots: ReturnType<typeof resolveRuntimeIdentity>,
  input: {
    readonly instanceId: string
    readonly ownerToken: string
    readonly startedAt: string
    readonly lifecycle: DiscoveryMetadata['lifecycle']
    readonly endpointToken: string
  },
): DiscoveryMetadata {
  return {
    schemaVersion: 1,
    protocolId: DAEMON_PROTOCOL.id,
    protocolVersion: DAEMON_PROTOCOL.version,
    ...roots.identity,
    instanceId: input.instanceId,
    ownerToken: input.ownerToken,
    pid: process.pid,
    startedAt: input.startedAt,
    lifecycle: input.lifecycle,
    endpointToken: input.endpointToken,
  }
}

function timeoutAfter(milliseconds: number): Promise<'timeout'> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), milliseconds)
    timer.unref?.()
  })
}

export interface RunningDaemon {
  readonly application: DaemonApplication
  readonly instanceId: string
  readonly closed: Promise<void>
  close(timeoutMs?: number): Promise<DaemonCloseResult>
  testContext(signal?: AbortSignal): RpcRequestContext
}

export async function startDaemon(
  options: StartDaemonOptions,
): Promise<RunningDaemon> {
  const roots = resolveRuntimeIdentity(options.roots)
  const endpoint = resolveEndpoint(
    roots.identity,
    options.endpointRuntimeRoot
      ? { runtimeRoot: options.endpointRuntimeRoot }
      : {},
  )
  const observationTimeoutMs = requireObservationTimeout(
    options.observationTimeoutMs ?? DEFAULT_OBSERVATION_TIMEOUT_MS,
  )
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS
  if (!Number.isSafeInteger(idleTimeoutMs) || idleTimeoutMs < 1) {
    throw new RangeError('Daemon idle timeout must be a positive integer')
  }
  const hooks = { ...defaultHooks(roots), ...options.hooks }
  const leaseBackend = options.leaseBackend ?? createFileLeaseBackend()
  const instanceId = randomUUID()
  const ownerToken = createOwnerToken()
  const startedAt = new Date().toISOString()
  const transferStore = new ByteTransferStore()
  let lifecycleLease: FileLease | undefined
  let databaseLease: FileLease | undefined
  let database: CtxindexDatabase | undefined
  let listener: DaemonListener | undefined
  let wroteMetadata = false
  let finalization: Promise<void> | undefined
  let application!: DaemonApplication
  let requestFinalization!: () => void
  const finalizationRequested = new Promise<void>((resolve) => {
    requestFinalization = resolve
  })

  const owner = { instanceId, ownerToken }
  const writeLifecycle = (lifecycle: DiscoveryMetadata['lifecycle']): void => {
    hooks.writeMetadata(
      roots.stateRoot,
      metadata(roots, {
        instanceId,
        ownerToken,
        startedAt,
        lifecycle,
        endpointToken: endpoint.token,
      }),
    )
    wroteMetadata = true
  }

  const finalize = (): Promise<void> => {
    finalization ??= (async () => {
      await application.whenDrained()
      transferStore.close()
      database?.close()
      database = undefined
      await listener?.stop()
      listener = undefined
      let cleanup: DiscoveryCleanupResult = 'missing'
      if (wroteMetadata && lifecycleLease) {
        cleanup = hooks.cleanupMetadata(roots.stateRoot, owner, lifecycleLease)
      }
      if (cleanup === 'removed') hooks.removeEndpoint(endpoint.path)
      databaseLease?.release()
      databaseLease = undefined
      lifecycleLease?.release()
      lifecycleLease = undefined
    })()
    return finalization
  }

  try {
    hooks.readMatchingMetadata(roots.stateRoot, roots.identity)
    lifecycleLease = leaseBackend.acquire({
      canonicalTarget: roots.stateRoot,
      purpose: 'lifecycle',
      mode: 'exclusive',
    })
    try {
      databaseLease = leaseBackend.acquire({
        canonicalTarget: roots.databasePath,
        purpose: 'database',
        mode: 'exclusive',
      })
    } catch (error) {
      if (error instanceof FileLeaseConflictError) {
        throw databaseLeaseConflict(roots.identity.databaseDigest)
      }
      throw error
    }
    hooks.readMatchingMetadata(roots.stateRoot, roots.identity)
    writeLifecycle('starting')
    const config = await hooks.readConfig(join(roots.configRoot, 'config.toml'))
    const installed = await hooks.readInstalled()
    hooks.assertDatabaseTarget(databaseLease)
    database = await hooks.openDatabase(roots.databasePath)
    hooks.assertDatabaseTarget(databaseLease)
    await hooks.runMigrations(database)
    const localOAuthAppIdentities = hooks.listLocalOAuthAppIdentities(database)
    const extensionResult = await hooks.loadExtensions({
      config,
      builtins: CTXINDEX_BUILTIN_MODULE,
      installed: installed.records,
      dataRoot: roots.dataRoot,
      localOAuthAppIdentities,
    })
    const loaded = {
      ...extensionResult,
      diagnostics: [
        ...installed.diagnostics.map((message) => ({
          path: 'installed-records',
          message,
        })),
        ...extensionResult.diagnostics,
      ],
    }
    const services = await hooks.composeServices({
      database,
      config,
      completeRegistry: loaded.completeRegistry,
      registry: loaded.registry,
      roots,
    })
    application = new DaemonApplication({
      protocol: DAEMON_PROTOCOL,
      runtime: roots.identity,
      daemonVersion: '0.0.0',
      buildVersion: buildVersion(),
      instanceId,
      startedAt,
      pid: process.pid,
      extensionDiagnosticsCount: loaded.diagnostics.length,
      documentationService: createDocumentationService([
        createExtensionDocumentationSource(loaded.documentation),
      ]),
      idleTimeoutMs,
      idleTimer: options.idleTimer ?? productionIdleTimer,
      observationTimeoutMs,
      transferStore,
      ...services,
      onStopping: () => {
        try {
          writeLifecycle('stopping')
        } catch {
          // Retained leases remain authoritative when metadata cannot be updated.
        } finally {
          requestFinalization()
          void finalize()
        }
      },
    })
    hooks.removeEndpoint(endpoint.path)
    listener = hooks.bind({
      endpoint: endpoint.path,
      application,
      expectations: { protocol: DAEMON_PROTOCOL, runtime: roots.identity },
      transferStore,
    })
    application.markReady()
    writeLifecycle('ready')
  } catch (error) {
    transferStore.close()
    const ownedLifecycle = lifecycleLease !== undefined
    try {
      await listener?.stop()
    } catch {}
    try {
      database?.close()
    } catch {}
    if (wroteMetadata && lifecycleLease) {
      try {
        hooks.cleanupMetadata(roots.stateRoot, owner, lifecycleLease)
      } catch {}
    }
    if (ownedLifecycle) {
      try {
        hooks.removeEndpoint(endpoint.path)
      } catch {}
    }
    try {
      databaseLease?.release()
    } catch {}
    try {
      lifecycleLease?.release()
    } catch {}
    throw error
  }

  const close = async (
    timeoutMs = observationTimeoutMs,
  ): Promise<DaemonCloseResult> => {
    requireObservationTimeout(timeoutMs)
    application.beginStopping()
    const closing = finalize()
    const result = await Promise.race([
      closing.then(() => 'complete' as const),
      timeoutAfter(timeoutMs),
    ])
    return result === 'complete'
      ? { status: 'complete' }
      : { status: 'timeout', instanceId, timeoutMs }
  }

  return {
    application,
    instanceId,
    get closed() {
      return finalizationRequested.then(finalize)
    },
    close,
    testContext(signal = new AbortController().signal) {
      return {
        requestId: randomUUID(),
        signal,
        clientProtocol: DAEMON_PROTOCOL,
        clientRuntime: roots.identity,
      }
    },
  }
}
