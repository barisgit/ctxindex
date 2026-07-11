import { CTXINDEX_ADAPTER_REGISTRY } from '@ctxindex/adapters'
import { type AuthService, createAuthService } from '@ctxindex/core/auth'
import { getEnv, type LogLevel, readConfig } from '@ctxindex/core/config'
import { logger as createLogger, type Logger } from '@ctxindex/core/logger'
import { createRealmService, type RealmService } from '@ctxindex/core/realm'
import { createSearchService, type SearchService } from '@ctxindex/core/search'
import {
  CtxindexSecretsError,
  createSecretsService,
  FileBackend,
  FileBackend as FileSecretsBackend,
  KeychainBackend,
  loadSecretsStore,
  type SecretBackend,
  type SecretsService,
  type SecretsStore,
} from '@ctxindex/core/secrets'
import { createSourceService, type SourceService } from '@ctxindex/core/source'
import type { CtxindexDatabase } from '@ctxindex/core/storage'
import { createSyncService, type SyncService } from '@ctxindex/core/sync'
import { getDb } from './commands/db'

export interface CliDeps {
  readonly db: CtxindexDatabase
  readonly store: SecretsStore
  readonly logger: Logger
  readonly env: ReturnType<typeof getEnv>
  readonly realmService: RealmService
  readonly sourceService: SourceService
  readonly searchService: SearchService
  readonly secretsService: SecretsService
  readonly secretsBackend: SecretBackend
  readonly secretsStore: SecretsStore
  readonly authService: AuthService
  readonly syncService: SyncService
  close(): Promise<void>
}

// Set from the global `--log-level` flag in main.ts before any command runs.
let cliLogLevel: LogLevel | undefined

export function setCliLogLevel(level: LogLevel | undefined): void {
  cliLogLevel = level
}

async function loadWritableSecretsStore(): Promise<SecretsStore> {
  try {
    return await loadSecretsStore(await readConfig())
  } catch (err) {
    if (
      err instanceof CtxindexSecretsError &&
      err.code === 'backend_unavailable'
    ) {
      return new FileSecretsBackend()
    }
    throw err
  }
}

export async function openDeps(
  opts: { readonly filePassphrase?: string } = {},
): Promise<CliDeps> {
  const db = await getDb()
  const log = await createLogger(cliLogLevel ? { level: cliLogLevel } : {})
  const config = await readConfig()
  const realmService = createRealmService({ db, logger: log })
  const sourceService = createSourceService({ db, logger: log, realmService })
  const fileStore = new FileBackend(
    opts.filePassphrase === undefined
      ? { createKeyFileIfMissing: false }
      : { passphrase: opts.filePassphrase, createKeyFileIfMissing: false },
  )
  const secretsService = createSecretsService({
    db,
    fileStore,
    keychainStore: new KeychainBackend(),
    logger: log,
    backend: config.secrets.backend,
  })
  const secretsStore = await loadWritableSecretsStore()
  const env = getEnv()
  const authService = createAuthService({
    db,
    store: secretsStore,
    logger: log,
    env,
  })
  const searchService = createSearchService({
    db,
    logger: log,
    registry: CTXINDEX_ADAPTER_REGISTRY,
    async resolveSearchConfig(_sourceId, adapterId, config) {
      if (!adapterId.startsWith('google.')) return config
      const grant = await authService.getActiveGoogleGrant()
      if (!grant) return config
      const accessToken = await authService.refreshGoogleAccessToken(grant.id)
      return { ...config, access_token: accessToken }
    },
  })
  const syncService = createSyncService({
    db,
    logger: log,
    env,
    authService,
    registry: CTXINDEX_ADAPTER_REGISTRY,
  })
  return {
    db,
    store: secretsStore,
    logger: log,
    env,
    realmService,
    sourceService,
    searchService,
    secretsService,
    secretsBackend: config.secrets.backend,
    secretsStore,
    authService,
    syncService,
    async close() {},
  }
}
