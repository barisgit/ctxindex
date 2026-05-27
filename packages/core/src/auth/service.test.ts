import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { getEnv } from '../config'
import type { Logger } from '../logger'
import { keychainRef, type SecretsStore } from '../secrets'
import { applyPragmas } from '../storage'
import { runMigrations } from '../storage/migrator'
import { createAuthService } from './service'

class MemorySecretsStore implements SecretsStore {
  async getSecret(ref: string): Promise<string> {
    return ref
  }

  async setSecret(scope: string, key: string): Promise<string> {
    return keychainRef(scope, key)
  }

  async deleteSecret(): Promise<void> {}

  async listKeys(): Promise<{ ref: string; scope: string; key: string }[]> {
    return []
  }
}

const logger = { debug() {} } as unknown as Logger

test('auth service exposes google grant operations', async () => {
  const db = new Database(':memory:', { create: true })
  applyPragmas(db)
  try {
    await runMigrations(db)
    const svc = createAuthService({
      db,
      store: new MemorySecretsStore(),
      logger,
      env: getEnv(),
    })

    expect(typeof svc.addGoogleGrant).toBe('function')
    expect(typeof svc.getActiveGoogleGrant).toBe('function')
    expect(typeof svc.listGoogleGrants).toBe('function')
    expect(typeof svc.refreshGoogleAccessToken).toBe('function')
    expect(typeof svc.exchangeGoogleAuthCode).toBe('function')
  } finally {
    db.close()
  }
})
