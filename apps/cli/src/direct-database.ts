import {
  type DirectExtensionSourceBinding,
  readDirectExtensionSourceBindings,
} from '@ctxindex/core/direct-extension'
import {
  type LocalOAuthAppIdentity,
  listLocalOAuthAppIdentities,
} from '@ctxindex/core/oauth-app'
import { cacheDir, configDir, dataDir, stateDir } from '@ctxindex/core/paths'
import { initializeSecretBackend } from '@ctxindex/core/secrets'
import type { CtxindexDatabase } from '@ctxindex/core/storage'
import {
  bootstrapDatabase,
  openDatabase,
  openReadonlyDatabase,
  runMigrations,
} from '@ctxindex/core/storage'
import {
  acquireFileLease,
  assertRetainedDatabaseLeaseTarget,
  type FileLease,
  FileLeaseConflictError,
  FileLeaseUnsupportedError,
  resolveRuntimeIdentity,
} from '@ctxindex/local-daemon'

let database: CtxindexDatabase | null = null
let closeDatabase: (() => void) | null = null

export class PrototypeUnsupportedError extends Error {
  readonly code = 'prototype_unsupported'

  constructor() {
    super(
      'This command is unavailable while the local daemon owns the database.',
    )
  }
}

export function acquireSharedDatabaseLease(
  target = directDatabasePath(),
  acquire: typeof acquireFileLease = acquireFileLease,
): FileLease | null {
  try {
    return acquire({
      canonicalTarget: target,
      purpose: 'database',
      mode: 'shared',
    })
  } catch (error) {
    if (error instanceof FileLeaseConflictError) {
      throw new PrototypeUnsupportedError()
    }
    if (
      error instanceof FileLeaseUnsupportedError &&
      error.reason === 'platform'
    ) {
      return null
    }
    throw error
  }
}

export interface OpenLeasedDatabaseOptions {
  readonly target: string
  readonly acquire?: typeof acquireFileLease
  readonly assertTarget?: typeof assertRetainedDatabaseLeaseTarget
  readonly open?: typeof openDatabase
  readonly migrate?: typeof runMigrations
}

export interface DirectDatabaseOwnership {
  readonly target: string
  readLocalOAuthAppIdentities(): Promise<readonly LocalOAuthAppIdentity[]>
  readDirectExtensionSourceBindings(): Promise<
    readonly DirectExtensionSourceBinding[]
  >
  open(): Promise<CtxindexDatabase>
  close(): void
}

export interface AcquireDirectDatabaseOwnershipOptions {
  readonly target?: string
  readonly acquire?: typeof acquireFileLease
  readonly assertTarget?: typeof assertRetainedDatabaseLeaseTarget
  readonly open?: typeof openDatabase
  readonly openReadonly?: typeof openReadonlyDatabase
  readonly migrate?: typeof runMigrations
}

export function acquireDirectDatabaseOwnership(
  options: AcquireDirectDatabaseOwnershipOptions = {},
): DirectDatabaseOwnership {
  const target = options.target ?? directDatabasePath()
  const lease = acquireSharedDatabaseLease(target, options.acquire)
  const assertTarget = options.assertTarget ?? assertRetainedDatabaseLeaseTarget
  let db: CtxindexDatabase | undefined
  let released = false

  const assertOpen = (): void => {
    if (released) throw new Error('Direct database ownership is closed')
  }
  const assertLeaseTarget = (): void => {
    if (lease) assertTarget(lease)
  }

  return {
    target,
    async readLocalOAuthAppIdentities() {
      assertOpen()
      if (!(await Bun.file(target).exists())) return []
      assertLeaseTarget()
      const readonlyDb = (options.openReadonly ?? openReadonlyDatabase)(target)
      try {
        assertLeaseTarget()
        return listLocalOAuthAppIdentities(readonlyDb)
      } finally {
        readonlyDb.close()
      }
    },
    async readDirectExtensionSourceBindings() {
      assertOpen()
      if (!(await Bun.file(target).exists())) return []
      assertLeaseTarget()
      const readonlyDb = (options.openReadonly ?? openReadonlyDatabase)(target)
      try {
        assertLeaseTarget()
        return readDirectExtensionSourceBindings(readonlyDb)
      } finally {
        readonlyDb.close()
      }
    },
    async open() {
      assertOpen()
      if (db) return db
      assertLeaseTarget()
      const opened = await (options.open ?? openDatabase)(target)
      try {
        assertLeaseTarget()
        await (options.migrate ?? runMigrations)(opened)
        db = opened
        return opened
      } catch (error) {
        opened.close()
        throw error
      }
    },
    close() {
      if (released) return
      released = true
      db?.close()
      db = undefined
      lease?.release()
    },
  }
}

export async function openLeasedDatabase(
  options: OpenLeasedDatabaseOptions,
): Promise<{ readonly db: CtxindexDatabase; close(): void }> {
  const ownership = acquireDirectDatabaseOwnership(options)
  try {
    const db = await ownership.open()
    return {
      db,
      close: ownership.close,
    }
  } catch (error) {
    ownership.close()
    throw error
  }
}

export function directDatabasePath(): string {
  return resolveRuntimeIdentity({
    configRoot: configDir(),
    dataRoot: dataDir(),
    stateRoot: stateDir(),
    cacheRoot: cacheDir(),
  }).databasePath
}

export async function getDb(): Promise<CtxindexDatabase> {
  if (database) return database
  const runtime = await openLeasedDatabase({ target: directDatabasePath() })
  closeDatabase = runtime.close
  database = runtime.db
  return runtime.db
}

export async function closeDb(): Promise<void> {
  const close = closeDatabase
  database = null
  closeDatabase = null
  close?.()
}

export async function readLeasedLocalOAuthAppIdentities(
  target = directDatabasePath(),
  options: Omit<AcquireDirectDatabaseOwnershipOptions, 'target'> = {},
): Promise<readonly LocalOAuthAppIdentity[]> {
  const ownership = acquireDirectDatabaseOwnership({ ...options, target })
  try {
    return await ownership.readLocalOAuthAppIdentities()
  } finally {
    ownership.close()
  }
}

export async function readLeasedDirectExtensionSourceBindings(
  target = directDatabasePath(),
  options: Omit<AcquireDirectDatabaseOwnershipOptions, 'target'> = {},
): Promise<readonly DirectExtensionSourceBinding[]> {
  const ownership = acquireDirectDatabaseOwnership({ ...options, target })
  try {
    return await ownership.readDirectExtensionSourceBindings()
  } finally {
    ownership.close()
  }
}

export interface InitializeDirectStorageOptions {
  readonly acquire?: typeof acquireFileLease
  readonly assertTarget?: typeof assertRetainedDatabaseLeaseTarget
  readonly initializeSecrets?: typeof initializeSecretBackend
  readonly bootstrap?: typeof bootstrapDatabase
}

export async function initializeDirectStorage(
  options: InitializeDirectStorageOptions = {},
): Promise<void> {
  const lease = acquireSharedDatabaseLease(
    directDatabasePath(),
    options.acquire,
  )
  const assertTarget = options.assertTarget ?? assertRetainedDatabaseLeaseTarget
  const assertLeaseTarget = (): void => {
    if (lease) assertTarget(lease)
  }
  try {
    await (options.initializeSecrets ?? initializeSecretBackend)()
    assertLeaseTarget()
    await (options.bootstrap ?? bootstrapDatabase)()
    assertLeaseTarget()
  } finally {
    lease?.release()
  }
}
