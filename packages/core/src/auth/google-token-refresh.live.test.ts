import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getEnv, readConfig } from '../config'
import type { Logger } from '../logger'
import { createSecretVault, FileBackend, KeychainBackend } from '../secrets'
import { applyPragmas, runMigrations } from '../storage'
import { createAuthService } from './service'

const logger = { debug() {} } as unknown as Logger
const liveTestsEnvKey = 'CTXINDEX_LIVE_TESTS'

function liveDbPath(): string {
  return join(
    process.env.HOME ?? homedir(),
    '.local/share/ctxindex/ctxindex.sqlite',
  )
}

test.skipIf(process.env[liveTestsEnvKey] !== '1')(
  'refreshGoogleAccessToken returns a real Google access token',
  async () => {
    const db = new Database(liveDbPath(), { create: false })
    applyPragmas(db)
    try {
      await runMigrations(db)
      const grant = db
        .prepare(
          `SELECT id, refresh_token_ref
           FROM grants
           WHERE provider = 'google'
           ORDER BY created_at DESC
           LIMIT 1`,
        )
        .get() as { id: string; refresh_token_ref: string | null } | null
      expect(grant?.id).toBeDefined()
      expect(grant?.refresh_token_ref).toBeDefined()
      expect(grant?.refresh_token_ref).not.toBeNull()

      const config = await readConfig()
      const store = createSecretVault({
        backend: config.secrets.backend,
        fileStore: new FileBackend(),
        keychainStore: new KeychainBackend(),
      })
      const refreshToken = await store.getSecret(grant?.refresh_token_ref ?? '')
      expect(refreshToken.length).toBeGreaterThan(0)

      const authService = createAuthService({
        db,
        store,
        logger,
        env: getEnv(),
      })
      const accessToken = await authService.refreshGoogleAccessToken(
        grant?.id ?? '',
      )

      expect(accessToken).toMatch(/^ya29\./)
    } finally {
      db.close()
    }
  },
)
