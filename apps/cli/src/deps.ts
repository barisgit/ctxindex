import {
  type AccountService,
  createAccountService,
} from '@ctxindex/core/account'
import { ArtifactService } from '@ctxindex/core/artifact'
import { type AuthService, createAuthService } from '@ctxindex/core/auth'
import {
  type CtxindexConfig,
  getEnv,
  type LogLevel,
  readConfig,
  writeConfig,
} from '@ctxindex/core/config'
import { logger as createLogger, type Logger } from '@ctxindex/core/logger'
import {
  createOAuthAppService,
  listLocalOAuthAppIdentities,
  type OAuthAppService,
} from '@ctxindex/core/oauth-app'
import { createRealmService, type RealmService } from '@ctxindex/core/realm'
import type {
  CompleteRegistry,
  ExtensionRegistry,
} from '@ctxindex/core/registry'
import {
  createSecretBackendManager,
  createSecretVault,
  FileBackend,
  KeychainBackend,
  type SecretBackendManager,
  type SecretVault,
} from '@ctxindex/core/secrets'
import { createSourceService, type SourceService } from '@ctxindex/core/source'
import type { CtxindexDatabase } from '@ctxindex/core/storage'
import { createThreadService, type ThreadService } from '@ctxindex/core/thread'
import { getDb } from './commands/db'
import { loadCliDefinitions } from './definitions'

export interface CliDeps {
  readonly db: CtxindexDatabase
  readonly logger: Logger
  readonly env: ReturnType<typeof getEnv>
  readonly realmService: RealmService
  readonly sourceService: SourceService
  readonly secretBackendManager: SecretBackendManager
  readonly secretVault: SecretVault
  readonly authService: AuthService
  readonly oauthAppService: OAuthAppService
  readonly registry: ExtensionRegistry
  readonly completeRegistry: CompleteRegistry
  readonly threadService: ThreadService
  readonly artifactService: ArtifactService
  close(): Promise<void>
}

export async function openAccountDeps(): Promise<AccountCliDeps> {
  const db = await getDb()
  return {
    accountService: createAccountService({ db }),
    async close() {},
  }
}

export interface AccountCliDeps {
  readonly accountService: AccountService
  close(): Promise<void>
}

export interface SecretCliDeps {
  readonly secretBackendManager: SecretBackendManager
  close(): Promise<void>
}

// Set from the global `--log-level` flag in main.ts before any command runs.
let cliLogLevel: LogLevel | undefined

export function setCliLogLevel(level: LogLevel | undefined): void {
  cliLogLevel = level
}

function createSecretRuntime(
  db: CtxindexDatabase,
  log: Logger,
  config: CtxindexConfig,
): {
  readonly secretBackendManager: SecretBackendManager
  readonly secretVault: SecretVault
} {
  const fileStore = new FileBackend()
  const keychainStore = new KeychainBackend()
  const secretVault = createSecretVault({
    fileStore,
    keychainStore,
    backend: config.secrets.backend,
  })
  const secretBackendManager = createSecretBackendManager({
    db,
    fileStore,
    keychainStore,
    logger: log,
    backend: config.secrets.backend,
    commitBackend: async (target) => {
      await writeConfig({
        ...config,
        secrets: { backend: target },
      })
    },
  })
  return { secretBackendManager, secretVault }
}

export async function openSecretDeps(): Promise<SecretCliDeps> {
  const db = await getDb()
  const log = await createLogger(cliLogLevel ? { level: cliLogLevel } : {})
  const config = await readConfig()
  const { secretBackendManager } = createSecretRuntime(db, log, config)
  return { secretBackendManager, async close() {} }
}

export async function loadAuthDefinitionDeps(): Promise<{
  readonly config: CtxindexConfig
  readonly registry: ExtensionRegistry
  readonly completeRegistry: CompleteRegistry
}> {
  const config = await readConfig()
  const loaded = await loadCliDefinitions({ config })
  return {
    config,
    registry: loaded.registry,
    completeRegistry: loaded.completeRegistry,
  }
}

export async function openDeps(
  opts: { readonly config?: CtxindexConfig } = {},
): Promise<CliDeps> {
  const db = await getDb()
  const log = await createLogger(cliLogLevel ? { level: cliLogLevel } : {})
  const config = opts.config ?? (await readConfig())
  const localOAuthAppIdentities = listLocalOAuthAppIdentities(db)
  const loaded = await loadCliDefinitions({
    config,
    localOAuthAppIdentities,
  })
  const realmService = createRealmService({ db, logger: log })
  const registry = loaded.registry
  const completeRegistry = loaded.completeRegistry
  const threadService = createThreadService({ db, profiles: registry.profiles })
  const sourceService = createSourceService({
    db,
    logger: log,
    realmService,
    registry,
  })
  const { secretBackendManager, secretVault } = createSecretRuntime(
    db,
    log,
    config,
  )
  const env = getEnv()
  const oauthAppService = createOAuthAppService({
    db,
    store: secretVault,
    registry: completeRegistry,
  })
  const authService = createAuthService({
    db,
    store: secretVault,
    logger: log,
    registry: completeRegistry,
  })
  const artifactService = new ArtifactService({
    db,
    registry,
    authService,
    logger: log,
  })
  return {
    db,
    logger: log,
    env,
    realmService,
    sourceService,
    secretBackendManager,
    secretVault,
    authService,
    oauthAppService,
    registry,
    completeRegistry,
    threadService,
    artifactService,
    async close() {},
  }
}
