import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { Logger } from '../logger'
import { applyPragmas } from '../storage'
import { runMigrations } from '../storage/migrator'
import { createSecretsService } from './service'
import type { SecretsStore } from './types'

class MemorySecretsStore implements SecretsStore {
  readonly entries = new Map<
    string,
    { scope: string; key: string; value: string }
  >()

  constructor(private readonly backend: 'file' | 'keychain') {}

  async getSecret(ref: string): Promise<string> {
    const entry = this.entries.get(ref)
    if (!entry) throw new Error(`missing ${ref}`)
    return entry.value
  }

  async setSecret(scope: string, key: string, value: string): Promise<string> {
    const ref =
      this.backend === 'file'
        ? `file:secrets.box#${encodeURIComponent(key)}`
        : `keychain:ctxindex/${encodeURIComponent(scope)}/${encodeURIComponent(key)}`
    this.entries.set(ref, { scope, key, value })
    return ref
  }

  async deleteSecret(ref: string): Promise<void> {
    this.entries.delete(ref)
  }

  async listKeys(): Promise<{ ref: string; scope: string; key: string }[]> {
    return Array.from(this.entries, ([ref, entry]) => ({
      ref,
      scope: entry.scope,
      key: entry.key,
    }))
  }
}

let db: Database
const logger = { debug() {} } as unknown as Logger

beforeEach(async () => {
  db = new Database(':memory:', { create: true })
  applyPragmas(db)
  await runMigrations(db)
})

afterEach(() => {
  db.close()
})

async function insertGrantWithKeychainSecrets(
  keychainStore: MemorySecretsStore,
): Promise<string> {
  db.prepare(
    `INSERT INTO accounts (id, provider, label, created_at, updated_at)
     VALUES ('account-1', 'google', 'Google', ?, ?)`,
  ).run(Date.now(), Date.now())

  const clientSecretRef = await keychainStore.setSecret(
    'google',
    'client-secret',
    'client-value',
  )
  const refreshTokenRef = await keychainStore.setSecret(
    'google',
    'refresh-token',
    'refresh-value',
  )

  db.prepare(
    `INSERT INTO grants
       (id, account_id, provider, scopes_json, client_secret_ref, refresh_token_ref, created_at, updated_at)
     VALUES ('grant-1', 'account-1', 'google', ?, ?, ?, ?, ?)`,
  ).run(
    JSON.stringify(['mail.read']),
    clientSecretRef,
    refreshTokenRef,
    Date.now(),
    Date.now(),
  )

  return refreshTokenRef
}

describe('secrets service migrate', () => {
  test('migrate moves grant secret refs from keychain to file and back', async () => {
    const fileStore = new MemorySecretsStore('file')
    const keychainStore = new MemorySecretsStore('keychain')
    const oldRefreshRef = await insertGrantWithKeychainSecrets(keychainStore)
    const service = createSecretsService({
      db,
      fileStore,
      keychainStore,
      logger,
      backend: 'keychain',
    })

    await expect(service.migrateSecrets('file')).resolves.toEqual({ moved: 2 })
    expect(keychainStore.entries.has(oldRefreshRef)).toBe(false)
    expect(await fileStore.getSecret('file:secrets.box#refresh-token')).toBe(
      'refresh-value',
    )
    expect(
      db
        .prepare('SELECT refresh_token_ref FROM grants WHERE id = ?')
        .get('grant-1'),
    ).toMatchObject({ refresh_token_ref: 'file:secrets.box#refresh-token' })

    await expect(service.migrateSecrets('keychain')).resolves.toEqual({
      moved: 2,
    })
    expect(
      await keychainStore.getSecret('keychain:ctxindex/google/refresh-token'),
    ).toBe('refresh-value')
    expect(
      db
        .prepare('SELECT refresh_token_ref FROM grants WHERE id = ?')
        .get('grant-1'),
    ).toMatchObject({
      refresh_token_ref: 'keychain:ctxindex/google/refresh-token',
    })
  })
})
