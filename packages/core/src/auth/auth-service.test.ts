import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import { defineAdapter } from '@ctxindex/extension-sdk'
import { z } from 'zod'
import type { Logger } from '../logger'
import { createAdapterRegistry } from '../registry'
import { createProfileRegistry } from '../registry/profile-registry'
import { keychainRef, parseSecretRef, type SecretsStore } from '../secrets'
import { applyPragmas, runMigrations } from '../storage'
import { testOAuthProvider } from '../testing/oauth-provider'
import { createAuthService } from './service'

class MemoryStore implements SecretsStore {
  values = new Map<string, string>()
  operations: string[] = []
  failWriteAt = 0
  writes = 0
  failDelete = false
  async getSecret(ref: string) {
    this.operations.push(`get:${ref}`)
    const value = this.values.get(ref)
    if (value === undefined) throw new Error('missing')
    return value
  }
  async setSecret(scope: string, key: string, value: string) {
    this.writes++
    if (this.failWriteAt === this.writes) throw new Error('write failed')
    const ref = keychainRef(scope, key)
    this.values.set(ref, value)
    this.operations.push(`set:${ref}`)
    return ref
  }
  async deleteSecret(ref: string) {
    this.operations.push(`delete:${ref}`)
    if (this.failDelete) throw new Error('delete failed')
    this.values.delete(ref)
  }
  async listKeys() {
    return []
  }
}
const logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
  trace() {},
  child() {
    return this
  },
} as unknown as Logger
const dbs: Database[] = []
afterEach(() => {
  for (const db of dbs.splice(0)) db.close()
  globalThis.fetch = originalFetch
})

test('removes an Account with its Grant secrets and leaves bound Sources needs_auth', async () => {
  const database = await db()
  const store = new MemoryStore()
  const service = createAuthService({
    db: database,
    store,
    logger,
    registry: registry(),
    now: () => 1_000,
  })
  const { grantId } = await service.addGrant({
    provider: 'test',
    account: account(),
    clientId: 'client',
    refreshToken: 'refresh',
    accessToken: 'access',
    scopes: ['mail.read'],
  })
  database.exec(
    "INSERT INTO realms VALUES ('r','r',NULL,1); INSERT INTO sources (id,realm_id,adapter_id,adapter_version,grant_id,label,config_json,created_at,updated_at) VALUES ('s','r','test.mail',1,'" +
      grantId +
      "','person-mail','{}',1,1)",
  )

  await service.removeAccount('Person')

  expect(
    database.query('SELECT count(*) AS count FROM accounts').get(),
  ).toEqual({
    count: 0,
  })
  expect(database.query('SELECT count(*) AS count FROM grants').get()).toEqual({
    count: 0,
  })
  expect(
    database.query("SELECT grant_id FROM sources WHERE id = 's'").get(),
  ).toEqual({ grant_id: null })
  expect(
    database
      .query("SELECT last_status FROM source_sync_state WHERE source_id = 's'")
      .get(),
  ).toEqual({ last_status: 'needs_auth' })
  expect(store.values.size).toBe(0)
})

test('refresh never falls back to environment client credentials', async () => {
  const database = await db()
  const store = new MemoryStore()
  let reads = 0
  let calls = 0
  const service = createAuthService({
    db: database,
    store,
    logger,
    registry: registry(),
    readEnvironment: () => {
      reads++
      return 'environment-client-id'
    },
  })
  const { grantId } = await service.addGrant({
    provider: 'test',
    account: account(),
    clientId: 'persisted-client-id',
    refreshToken: 'refresh',
    scopes: ['mail.read'],
  })
  database
    .prepare('UPDATE grants SET client_id_ref = NULL WHERE id = ?')
    .run(grantId)
  globalThis.fetch = (async () => {
    calls++
    return Response.json({})
  }) as unknown as typeof fetch

  await expect(service.refreshAccessToken(grantId)).rejects.toMatchObject({
    code: 'missing_oauth_client_creds',
  })
  expect(reads).toBe(0)
  expect(calls).toBe(0)
})
const originalFetch = globalThis.fetch
async function db() {
  const value = new Database(':memory:', { create: true })
  applyPragmas(value)
  await runMigrations(value)
  dbs.push(value)
  return value
}
function registry() {
  const provider = testOAuthProvider({
    authorizationUrl: 'https://auth.test/authorize',
    tokenUrl: 'https://auth.test/token',
  })
  const adapter = defineAdapter({
    id: 'test.mail',
    version: 1,
    configSchema: z.object({}),
    auth: { kind: 'oauth2', provider, scopes: ['mail.read'] },
    profiles: [],
    routing: 'indexed',
    capabilities: [],
    operations: {},
    actions: {},
  })
  return createAdapterRegistry(createProfileRegistry([]), [adapter])
}
function account(subject = 'subject-1') {
  return {
    externalUserId: subject,
    label: 'Person',
    verifiedIdentities: [{ kind: 'email', value: 'person@example.test' }],
  }
}

test('re-authorization updates one stable Grant and cleans replaced refs', async () => {
  const database = await db()
  const store = new MemoryStore()
  const service = createAuthService({
    db: database,
    store,
    logger,
    registry: registry(),
  })
  const first = await service.addGrant({
    provider: 'test',
    account: account(),
    clientId: 'client',
    refreshToken: 'refresh-1',
    accessToken: 'access-1',
    expiresAt: 5000,
    scopes: ['openid', 'mail.read'],
  })
  const before = await service.getGrantById(first.grantId)
  const second = await service.addGrant({
    provider: 'test',
    account: account(),
    clientId: 'client',
    refreshToken: 'refresh-2',
    scopes: ['mail.read'],
  })
  expect(first.accountId).toBe(second.accountId)
  expect(first.grantId).toBe(second.grantId)
  expect(
    database.query('SELECT COUNT(*) AS count FROM accounts').get(),
  ).toEqual({ count: 1 })
  expect(database.query('SELECT COUNT(*) AS count FROM grants').get()).toEqual({
    count: 1,
  })
  const grant = await service.getGrantById(first.grantId)
  expect(grant?.scopes).toEqual(['mail.read'])
  expect(parseSecretRef(grant?.clientIdRef ?? '')).toMatchObject({
    backend: 'keychain',
    scope: 'test',
  })
  expect(parseSecretRef(grant?.refreshTokenRef ?? '')).toMatchObject({
    backend: 'keychain',
    scope: 'test',
  })
  expect(store.values.get(grant?.refreshTokenRef ?? '')).toBe('refresh-2')
  expect(store.values.has(before?.clientIdRef ?? '')).toBe(false)
  expect(store.values.has(before?.refreshTokenRef ?? '')).toBe(false)
})

test('cleans every temporary secret when persistence fails', async () => {
  const database = await db()
  database.exec(
    "CREATE TRIGGER reject_grant BEFORE INSERT ON grants BEGIN SELECT RAISE(FAIL, 'no'); END",
  )
  const store = new MemoryStore()
  const service = createAuthService({
    db: database,
    store,
    logger,
    registry: registry(),
  })
  await expect(
    service.addGrant({
      provider: 'test',
      account: account(),
      clientId: 'client',
      clientSecret: 'secret',
      refreshToken: 'refresh',
      accessToken: 'access',
      scopes: ['mail.read'],
    }),
  ).rejects.toThrow()
  expect(store.values.size).toBe(0)
  expect(
    database.query('SELECT COUNT(*) AS count FROM accounts').get(),
  ).toEqual({ count: 0 })
})

test('refresh writes new refs before one DB update then best-effort old cleanup', async () => {
  const database = await db()
  const store = new MemoryStore()
  const loaded = registry()
  const service = createAuthService({
    db: database,
    store,
    logger,
    registry: loaded,
    now: () => 1000,
    readEnvironment: (name) =>
      name === 'CTXINDEX_OAUTH_MOCK_BASE_URL'
        ? 'http://127.0.0.1:43123'
        : undefined,
  })
  const { grantId } = await service.addGrant({
    provider: 'test',
    account: account(),
    clientId: 'client',
    refreshToken: 'old-refresh',
    accessToken: 'old-access',
    expiresAt: 0,
    scopes: ['mail.read', 'openid'],
  })
  const old = await service.getGrantById(grantId)
  store.operations = []
  globalThis.fetch = (async () =>
    Response.json({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_in: 60,
      scope: 'mail.read',
    })) as unknown as typeof fetch
  await expect(
    service.resolveLinkedGrantAccessToken(grantId, { forceRefresh: true }),
  ).resolves.toBe('new-access')
  const updated = await service.getGrantById(grantId)
  expect(updated?.accessTokenRef).not.toBe(old?.accessTokenRef)
  expect(updated?.refreshTokenRef).not.toBe(old?.refreshTokenRef)
  expect(updated?.scopes).toEqual(['mail.read'])
  expect(
    store.operations.indexOf(`delete:${old?.accessTokenRef}`),
  ).toBeGreaterThan(store.operations.findIndex((op) => op.startsWith('set:')))
})

test('missing loaded provider marks linked Sources needs_auth without egress', async () => {
  const database = await db()
  const store = new MemoryStore()
  const withProvider = createAuthService({
    db: database,
    store,
    logger,
    registry: registry(),
  })
  const { grantId } = await withProvider.addGrant({
    provider: 'test',
    account: account(),
    clientId: 'client',
    refreshToken: 'refresh',
    scopes: ['mail.read'],
  })
  database.exec(
    "INSERT INTO realms VALUES ('r','r',NULL,1); INSERT INTO sources (id,realm_id,adapter_id,adapter_version,grant_id,label,config_json,created_at,updated_at) VALUES ('s','r','test.mail',1,'" +
      grantId +
      "','test-mail','{}',1,1); INSERT INTO source_sync_state (source_id,last_status,updated_at) VALUES ('s','idle',1)",
  )
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    return Response.json({})
  }) as unknown as typeof fetch
  const empty = createAdapterRegistry(createProfileRegistry([]), [])
  const service = createAuthService({
    db: database,
    store,
    logger,
    registry: empty,
  })
  await expect(
    service.resolveLinkedGrantAccessToken(grantId, { forceRefresh: true }),
  ).rejects.toMatchObject({ code: 'needs_auth' })
  expect(calls).toBe(0)
  expect(
    database
      .query("SELECT last_status FROM source_sync_state WHERE source_id='s'")
      .get(),
  ).toEqual({ last_status: 'needs_auth' })
})

test('cleans prior temporary refs for every creation write failure', async () => {
  for (const failWriteAt of [1, 2, 3, 4]) {
    const database = await db()
    const store = new MemoryStore()
    store.failWriteAt = failWriteAt
    const service = createAuthService({
      db: database,
      store,
      logger,
      registry: registry(),
    })
    await expect(
      service.addGrant({
        provider: 'test',
        account: account(),
        clientId: 'client',
        clientSecret: 'secret',
        refreshToken: 'refresh',
        accessToken: 'access',
        scopes: ['mail.read'],
      }),
    ).rejects.toThrow()
    expect(store.values.size).toBe(0)
    expect(
      database.query('SELECT COUNT(*) AS count FROM grants').get(),
    ).toEqual({ count: 0 })
  }
})

test('refresh DB failure removes new refs and leaves the old row readable', async () => {
  const database = await db()
  const store = new MemoryStore()
  const service = createAuthService({
    db: database,
    store,
    logger,
    registry: registry(),
    readEnvironment: (name) =>
      name === 'CTXINDEX_OAUTH_MOCK_BASE_URL'
        ? 'http://127.0.0.1:43123'
        : undefined,
  })
  const { grantId } = await service.addGrant({
    provider: 'test',
    account: account(),
    clientId: 'client',
    refreshToken: 'old-refresh',
    accessToken: 'old-access',
    expiresAt: 0,
    scopes: ['mail.read'],
  })
  const before = await service.getGrantById(grantId)
  const oldRefs = new Set(store.values.keys())
  database.exec(
    "CREATE TRIGGER reject_grant_update BEFORE UPDATE ON grants BEGIN SELECT RAISE(FAIL, 'no'); END",
  )
  globalThis.fetch = (async () =>
    Response.json({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_in: 60,
    })) as unknown as typeof fetch
  await expect(service.refreshAccessToken(grantId)).rejects.toThrow()
  expect(await service.getGrantById(grantId)).toEqual(before)
  expect(new Set(store.values.keys())).toEqual(oldRefs)
})

test('rotated refresh write failure cleans the new access ref and keeps old refs', async () => {
  const database = await db()
  const store = new MemoryStore()
  const service = createAuthService({
    db: database,
    store,
    logger,
    registry: registry(),
    readEnvironment: (name) =>
      name === 'CTXINDEX_OAUTH_MOCK_BASE_URL'
        ? 'http://127.0.0.1:43123'
        : undefined,
  })
  const { grantId } = await service.addGrant({
    provider: 'test',
    account: account(),
    clientId: 'client',
    refreshToken: 'old-refresh',
    accessToken: 'old-access',
    expiresAt: 0,
    scopes: ['mail.read'],
  })
  const before = await service.getGrantById(grantId)
  const oldRefs = new Set(store.values.keys())
  store.failWriteAt = store.writes + 2
  globalThis.fetch = (async () =>
    Response.json({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_in: 60,
    })) as unknown as typeof fetch
  await expect(service.refreshAccessToken(grantId)).rejects.toThrow()
  expect(await service.getGrantById(grantId)).toEqual(before)
  expect(new Set(store.values.keys())).toEqual(oldRefs)
})

test('old-ref delete failure is best effort after the refreshed row is committed', async () => {
  const database = await db()
  const store = new MemoryStore()
  const service = createAuthService({
    db: database,
    store,
    logger,
    registry: registry(),
    readEnvironment: (name) =>
      name === 'CTXINDEX_OAUTH_MOCK_BASE_URL'
        ? 'http://127.0.0.1:43123'
        : undefined,
  })
  const { grantId } = await service.addGrant({
    provider: 'test',
    account: account(),
    clientId: 'client',
    refreshToken: 'old-refresh',
    accessToken: 'old-access',
    expiresAt: 0,
    scopes: ['mail.read'],
  })
  const before = await service.getGrantById(grantId)
  store.failDelete = true
  globalThis.fetch = (async () =>
    Response.json({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_in: 60,
    })) as unknown as typeof fetch
  await expect(service.refreshAccessToken(grantId)).resolves.toBe('new-access')
  const after = await service.getGrantById(grantId)
  expect(after?.accessTokenRef).not.toBe(before?.accessTokenRef)
  expect(after?.refreshTokenRef).not.toBe(before?.refreshTokenRef)
})
