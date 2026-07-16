import { CTXINDEX_BUILTIN_EXTENSIONS } from '@ctxindex/adapters'
import { ArtifactService } from '@ctxindex/core/artifact'
import { type AuthService, createAuthService } from '@ctxindex/core/auth'
import {
  type CtxindexConfig,
  getEnv,
  type LogLevel,
  readConfig,
} from '@ctxindex/core/config'
import { loadExtensions } from '@ctxindex/core/extension'
import { logger as createLogger, type Logger } from '@ctxindex/core/logger'
import { createRealmService, type RealmService } from '@ctxindex/core/realm'
import type { ExtensionRegistry } from '@ctxindex/core/registry'
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
import { createThreadService, type ThreadService } from '@ctxindex/core/thread'
import { getDb } from './commands/db'

export interface CliDeps {
  readonly db: CtxindexDatabase
  readonly logger: Logger
  readonly env: ReturnType<typeof getEnv>
  readonly realmService: RealmService
  readonly sourceService: SourceService
  readonly secretsService: SecretsService
  readonly secretsBackend: SecretBackend
  readonly secretsStore: SecretsStore
  readonly authService: AuthService
  readonly registry: ExtensionRegistry
  readonly threadService: ThreadService
  readonly artifactService: ArtifactService
  close(): Promise<void>
}

// Set from the global `--log-level` flag in main.ts before any command runs.
let cliLogLevel: LogLevel | undefined

export function setCliLogLevel(level: LogLevel | undefined): void {
  cliLogLevel = level
}

async function loadWritableSecretsStore(
  config: CtxindexConfig,
): Promise<SecretsStore> {
  try {
    return await loadSecretsStore(config)
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
  opts: {
    readonly filePassphrase?: string
    readonly config?: CtxindexConfig
    readonly registry?: ExtensionRegistry
  } = {},
): Promise<CliDeps> {
  const db = await getDb()
  const log = await createLogger(cliLogLevel ? { level: cliLogLevel } : {})
  const config = opts.config ?? (await readConfig())
  const realmService = createRealmService({ db, logger: log })
  const registry =
    opts.registry ??
    (
      await loadExtensions({
        config,
        builtins: CTXINDEX_BUILTIN_EXTENSIONS,
      })
    ).registry
  const threadService = createThreadService({ db, profiles: registry.profiles })
  const sourceService = createSourceService({
    db,
    logger: log,
    realmService,
    registry,
  })
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
  const secretsStore = await loadWritableSecretsStore(config)
  const env = getEnv()
  const authService = createAuthService({
    db,
    store: secretsStore,
    logger: log,
    env,
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
    secretsService,
    secretsBackend: config.secrets.backend,
    secretsStore,
    authService,
    registry,
    threadService,
    artifactService,
    async close() {},
  }
}
