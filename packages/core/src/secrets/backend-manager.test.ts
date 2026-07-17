import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, expect, test } from 'bun:test'
import type { Logger } from '../logger'
import { applyPragmas } from '../storage'
import { runMigrations } from '../storage/migrator'
import { createSecretBackendManager } from './backend-manager'
import {
  CtxindexSecretsError,
  fileRef,
  keychainRef,
  type SecretBackend,
  type SecretsStore,
} from './types'
import { createSecretVault } from './vault'

class MemorySecretsStore implements SecretsStore {
  readonly entries = new Map<
    string,
    { readonly scope: string; readonly key: string; readonly value: string }
  >()
  failSetAt: number | undefined
  failDelete = false
  failList = false
  listCalls = 0
  probeCalls = 0
  private setCalls = 0

  constructor(readonly backend: SecretBackend) {}

  async probeAvailable(): Promise<void> {
    this.probeCalls += 1
    if (this.failList)
      throw new CtxindexSecretsError(
        `${this.backend} unavailable`,
        'backend_unavailable',
      )
  }

  async getSecret(ref: string): Promise<string> {
    const entry = this.entries.get(ref)
    if (!entry) throw new CtxindexSecretsError(`missing ${ref}`, 'not_found')
    return entry.value
  }

  async setSecret(scope: string, key: string, value: string): Promise<string> {
    this.setCalls += 1
    if (this.failSetAt === this.setCalls)
      throw new CtxindexSecretsError('target write failed', 'io')
    const ref =
      this.backend === 'file' ? fileRef(scope, key) : keychainRef(scope, key)
    this.entries.set(ref, { scope, key, value })
    return ref
  }

  async deleteSecret(ref: string): Promise<void> {
    if (this.failDelete)
      throw new CtxindexSecretsError('source cleanup failed', 'io')
    this.entries.delete(ref)
  }

  async listKeys(): Promise<{ ref: string; scope: string; key: string }[]> {
    this.listCalls += 1
    if (this.failList)
      throw new CtxindexSecretsError(
        `${this.backend} unavailable`,
        'backend_unavailable',
      )
    return [...this.entries]
      .map(([ref, entry]) => ({ ref, scope: entry.scope, key: entry.key }))
      .sort((left, right) =>
        left.ref < right.ref ? -1 : left.ref > right.ref ? 1 : 0,
      )
  }
}

let db: Database
const logger = { debug() {}, warn() {} } as unknown as Logger

beforeEach(async () => {
  db = new Database(':memory:', { create: true })
  applyPragmas(db)
  await runMigrations(db)
})

afterEach(() => db.close())

function insertGrant(
  id: string,
  provider: string,
  refreshTokenRef: string,
): void {
  const now = Date.now()
  db.prepare(
    `INSERT INTO accounts
       (id, provider, label, external_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(`account-${id}`, provider, `Account ${id}`, `subject-${id}`, now, now)
  db.prepare(
    `INSERT INTO grants
       (id, account_id, provider, scopes_json, refresh_token_ref, created_at, updated_at)
     VALUES (?, ?, ?, '[]', ?, ?, ?)`,
  ).run(id, `account-${id}`, provider, refreshTokenRef, now, now)
}

function grantRefreshRef(id: string): string {
  return (
    db.prepare('SELECT refresh_token_ref FROM grants WHERE id = ?').get(id) as {
      refresh_token_ref: string
    }
  ).refresh_token_ref
}

test('status reports availability and typed reference counts without secret material', async () => {
  const fileStore = new MemorySecretsStore('file')
  const keychainStore = new MemorySecretsStore('keychain')
  insertGrant(
    'grant-file',
    'google',
    await fileStore.setSecret('google', 'file-token', 'FILE-CANARY'),
  )
  insertGrant(
    'grant-keychain',
    'microsoft',
    await keychainStore.setSecret(
      'microsoft',
      'keychain-token',
      'KEYCHAIN-CANARY',
    ),
  )
  const manager = createSecretBackendManager({
    db,
    fileStore,
    keychainStore,
    logger,
    backend: 'file',
    commitBackend: async () => {},
  })

  const status = await manager.getStatus()
  expect(status).toEqual({
    backend: 'file',
    backends: {
      file: { available: true, referenceCount: 1 },
      keychain: { available: true, referenceCount: 1 },
    },
  })
  expect(JSON.stringify(status)).not.toMatch(/FILE-CANARY|KEYCHAIN-CANARY/)
  expect(fileStore.probeCalls).toBe(1)
  expect(keychainStore.probeCalls).toBe(1)
  expect(fileStore.listCalls).toBe(0)
  expect(keychainStore.listCalls).toBe(0)
})

test('status reports an unavailable inactive backend without inferring cleanup state', async () => {
  const fileStore = new MemorySecretsStore('file')
  const keychainStore = new MemorySecretsStore('keychain')
  keychainStore.failList = true
  const manager = createSecretBackendManager({
    db,
    fileStore,
    keychainStore,
    logger,
    backend: 'file',
    commitBackend: async () => {},
  })

  expect(await manager.getStatus()).toMatchObject({
    backend: 'file',
    backends: { keychain: { available: false } },
  })
})

test('backend switch preserves equal keys in different scopes and commits before cleanup', async () => {
  const fileStore = new MemorySecretsStore('file')
  const keychainStore = new MemorySecretsStore('keychain')
  const googleRef = await keychainStore.setSecret(
    'google',
    'refresh-token',
    'GOOGLE',
  )
  const microsoftRef = await keychainStore.setSecret(
    'microsoft',
    'refresh-token',
    'MICROSOFT',
  )
  insertGrant('grant-google', 'google', googleRef)
  insertGrant('grant-microsoft', 'microsoft', microsoftRef)
  let configured: SecretBackend = 'keychain'
  const manager = createSecretBackendManager({
    db,
    fileStore,
    keychainStore,
    logger,
    backend: configured,
    commitBackend: async (target) => {
      configured = target
    },
  })

  await expect(manager.switchBackend('file')).resolves.toEqual({
    backend: 'file',
    copied: 2,
    cleaned: 2,
    cleanupPending: false,
    warnings: [],
  })
  expect<SecretBackend>(configured).toBe('file')
  expect(grantRefreshRef('grant-google')).toBe(
    'file:secrets.box#google/refresh-token',
  )
  expect(grantRefreshRef('grant-microsoft')).toBe(
    'file:secrets.box#microsoft/refresh-token',
  )
  expect(keychainStore.entries.size).toBe(0)

  const vault = createSecretVault({
    backend: 'file',
    fileStore,
    keychainStore,
  })
  expect(await vault.getSecret(fileRef('google', 'refresh-token'))).toBe(
    'GOOGLE',
  )
  expect(await vault.getSecret(fileRef('microsoft', 'refresh-token'))).toBe(
    'MICROSOFT',
  )
  await expect(manager.switchBackend('file')).resolves.toEqual({
    backend: 'file',
    copied: 0,
    cleaned: 0,
    cleanupPending: false,
    warnings: [],
  })
})

test('target copy failure leaves source refs usable and retry converges', async () => {
  const fileStore = new MemorySecretsStore('file')
  const keychainStore = new MemorySecretsStore('keychain')
  const first = await keychainStore.setSecret('google', 'first', 'FIRST')
  const second = await keychainStore.setSecret('google', 'second', 'SECOND')
  insertGrant('grant-first', 'google', first)
  insertGrant('grant-second', 'google', second)
  let configured: SecretBackend = 'keychain'
  fileStore.failSetAt = 2
  const manager = createSecretBackendManager({
    db,
    fileStore,
    keychainStore,
    logger,
    backend: configured,
    commitBackend: async (target) => {
      configured = target
    },
  })

  await expect(manager.switchBackend('file')).rejects.toMatchObject({
    code: 'io',
  })
  expect(configured).toBe('keychain')
  expect(grantRefreshRef('grant-first')).toBe(first)
  expect(grantRefreshRef('grant-second')).toBe(second)
  expect(await keychainStore.getSecret(first)).toBe('FIRST')
  expect(await keychainStore.getSecret(second)).toBe('SECOND')
  expect(fileStore.entries.size).toBe(1)

  fileStore.failSetAt = undefined
  await expect(manager.switchBackend('file')).resolves.toMatchObject({
    backend: 'file',
    cleanupPending: false,
  })
  expect<SecretBackend>(configured).toBe('file')
  expect(grantRefreshRef('grant-first')).toBe(fileRef('google', 'first'))
  expect(grantRefreshRef('grant-second')).toBe(fileRef('google', 'second'))
  expect(keychainStore.entries.size).toBe(0)
})

test('missing referenced source secret fails before any target write', async () => {
  const fileStore = new MemorySecretsStore('file')
  const keychainStore = new MemorySecretsStore('keychain')
  const missing = keychainRef('google', 'missing')
  insertGrant('grant', 'google', missing)
  let configured: SecretBackend = 'keychain'
  const manager = createSecretBackendManager({
    db,
    fileStore,
    keychainStore,
    logger,
    backend: configured,
    commitBackend: async (target) => {
      configured = target
    },
  })

  await expect(manager.switchBackend('file')).rejects.toMatchObject({
    code: 'not_found',
  })
  expect(configured).toBe('keychain')
  expect(grantRefreshRef('grant')).toBe(missing)
  expect(fileStore.entries.size).toBe(0)
})

test('config commit failure leaves mixed refs readable and retry copies intervening writes', async () => {
  const fileStore = new MemorySecretsStore('file')
  const keychainStore = new MemorySecretsStore('keychain')
  const original = await keychainStore.setSecret('google', 'refresh', 'TOKEN')
  insertGrant('grant', 'google', original)
  let configured: SecretBackend = 'keychain'
  let failCommit = true
  const manager = createSecretBackendManager({
    db,
    fileStore,
    keychainStore,
    logger,
    backend: configured,
    commitBackend: async (target) => {
      if (failCommit) throw new Error('injected config commit failure')
      configured = target
    },
  })

  await expect(manager.switchBackend('file')).rejects.toThrow(
    'injected config commit failure',
  )
  expect(configured).toBe('keychain')
  expect(grantRefreshRef('grant')).toBe(fileRef('google', 'refresh'))
  expect(keychainStore.entries.has(original)).toBe(true)
  expect(
    await createSecretVault({
      backend: configured,
      fileStore,
      keychainStore,
    }).getSecret(grantRefreshRef('grant')),
  ).toBe('TOKEN')

  const intervening = await createSecretVault({
    backend: configured,
    fileStore,
    keychainStore,
  }).setSecret('google', 'intervening', 'NEW')
  expect(intervening).toBe(keychainRef('google', 'intervening'))

  failCommit = false
  await expect(manager.switchBackend('file')).resolves.toMatchObject({
    backend: 'file',
    copied: 2,
    cleanupPending: false,
  })
  expect<SecretBackend>(configured).toBe('file')
  expect(keychainStore.entries.size).toBe(0)
  expect(await fileStore.getSecret(fileRef('google', 'intervening'))).toBe(
    'NEW',
  )
})

test('cleanup failure is bounded and non-fatal, and retry clears it', async () => {
  const fileStore = new MemorySecretsStore('file')
  const keychainStore = new MemorySecretsStore('keychain')
  insertGrant(
    'grant-first',
    'google',
    await keychainStore.setSecret('google', 'first', 'FIRST'),
  )
  insertGrant(
    'grant-second',
    'google',
    await keychainStore.setSecret('google', 'second', 'SECOND'),
  )
  let configured: SecretBackend = 'keychain'
  keychainStore.failDelete = true
  const manager = createSecretBackendManager({
    db,
    fileStore,
    keychainStore,
    logger,
    backend: configured,
    commitBackend: async (target) => {
      configured = target
    },
  })

  await expect(manager.switchBackend('file')).resolves.toEqual({
    backend: 'file',
    copied: 2,
    cleaned: 0,
    cleanupPending: true,
    warnings: ['2 source secret copies could not be cleaned up'],
  })
  expect<SecretBackend>(configured).toBe('file')
  expect(keychainStore.entries.size).toBe(2)

  keychainStore.failDelete = false
  await expect(manager.switchBackend('file')).resolves.toMatchObject({
    backend: 'file',
    copied: 2,
    cleaned: 2,
    cleanupPending: false,
    warnings: [],
  })
  expect(keychainStore.entries.size).toBe(0)
})

test('reference transaction failure rolls back all refs and retry converges', async () => {
  const fileStore = new MemorySecretsStore('file')
  const keychainStore = new MemorySecretsStore('keychain')
  const first = await keychainStore.setSecret('google', 'first', 'FIRST')
  const second = await keychainStore.setSecret('google', 'second', 'SECOND')
  insertGrant('grant-first', 'google', first)
  insertGrant('grant-second', 'google', second)
  db.exec(`
    CREATE TRIGGER fail_secret_ref_update
    BEFORE UPDATE OF refresh_token_ref ON grants
    BEGIN
      SELECT RAISE(ABORT, 'injected ref update failure');
    END;
  `)
  let configured: SecretBackend = 'keychain'
  const manager = createSecretBackendManager({
    db,
    fileStore,
    keychainStore,
    logger,
    backend: configured,
    commitBackend: async (target) => {
      configured = target
    },
  })

  await expect(manager.switchBackend('file')).rejects.toThrow(
    'injected ref update failure',
  )
  expect(configured).toBe('keychain')
  expect(grantRefreshRef('grant-first')).toBe(first)
  expect(grantRefreshRef('grant-second')).toBe(second)
  expect(keychainStore.entries.size).toBe(2)
  expect(fileStore.entries.size).toBe(2)

  db.exec('DROP TRIGGER fail_secret_ref_update')
  await expect(manager.switchBackend('file')).resolves.toMatchObject({
    backend: 'file',
    cleanupPending: false,
  })
  expect<SecretBackend>(configured).toBe('file')
  expect(keychainStore.entries.size).toBe(0)
})
