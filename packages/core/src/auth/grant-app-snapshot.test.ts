import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import { auth, defineProvider, z } from '@ctxindex/extension-sdk'
import type { Logger } from '../logger'
import type { CompleteRegistry } from '../registry'
import { keychainRef, type SecretsStore } from '../secrets'
import { applyPragmas, runMigrations } from '../storage'
import { createAuthService } from './service'

class MemoryStore implements SecretsStore {
  readonly values = new Map<string, string>()
  failWriteAt = 0
  writes = 0
  async getSecret(ref: string) {
    const value = this.values.get(ref)
    if (value === undefined) throw new Error('missing')
    return value
  }
  async setSecret(scope: string, key: string, value: string) {
    this.writes += 1
    if (this.failWriteAt === this.writes) throw new Error('write failed')
    const ref = keychainRef(scope, key)
    this.values.set(ref, value)
    return ref
  }
  async deleteSecret(ref: string) {
    this.values.delete(ref)
  }
  async listKeys() {
    return []
  }
}

const provider = defineProvider({
  id: 'example',
  auth: auth.oauth2({
    authorizationUrl: 'https://auth.example/authorize',
    tokenUrl: 'https://auth.example/token',
    identity: {
      url: 'https://api.example/me',
      subjectPath: ['id'],
      labelPaths: [['email']],
      identities: [{ kind: 'email', path: ['email'] }],
    },
    pkce: { method: 'S256', required: true },
    registration: {
      type: 'public',
      configSchema: z.object({
        clientId: z.string(),
        clientSecret: z.string().optional(),
      }),
      environment: {
        clientId: 'CTXINDEX_TEST_CLIENT_ID',
        clientSecret: 'CTXINDEX_TEST_CLIENT_SECRET',
      },
    },
    baseScopes: ['openid'],
    allowedHosts: ['api.example', 'auth.example'],
  }),
})

function registry(): CompleteRegistry {
  return {
    extensions: new Map(),
    providers: new Map([[provider.id, provider]]),
    oauthApps: new Map(),
    profiles: new Map(),
    adapters: new Map(),
    provenances: new Map(),
  }
}

const logger = { debug() {}, warn() {} } as unknown as Logger
const originalFetch = globalThis.fetch
const dbs: Database[] = []

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const db of dbs.splice(0)) db.close()
})

async function database(): Promise<Database> {
  const db = new Database(':memory:', { create: true })
  applyPragmas(db)
  await runMigrations(db)
  dbs.push(db)
  return db
}

test('refresh uses the Grant-owned exact App snapshot without current App inventory', async () => {
  const db = await database()
  const store = new MemoryStore()
  const service = createAuthService({
    db,
    store,
    logger,
    registry: registry(),
    now: () => 1_000,
    readEnvironment: (name) =>
      name === 'CTXINDEX_OAUTH_MOCK_BASE_URL'
        ? 'http://127.0.0.1:43123'
        : undefined,
  })
  const appConfig = {
    clientId: 'snapshotted-id',
    clientSecret: 'snapshotted-secret',
  }
  const { grantId } = await service.addGrant({
    provider: 'example',
    account: {
      externalUserId: 'subject',
      label: 'Person',
      verifiedIdentities: [],
    },
    scopes: ['openid'],
    appConfig,
    refreshToken: 'refresh',
    expiresAt: 0,
  })

  const row = db
    .prepare(
      'SELECT app_config_ref, access_token_ref, refresh_token_ref FROM grants WHERE id = ?',
    )
    .get(grantId) as {
    app_config_ref: string
    access_token_ref: string | null
    refresh_token_ref: string
  }
  expect(JSON.parse(await store.getSecret(row.app_config_ref))).toEqual(
    appConfig,
  )

  globalThis.fetch = (async (_url, init) => {
    const body = String(init?.body)
    expect(body).toContain('client_id=snapshotted-id')
    expect(body).toContain('client_secret=snapshotted-secret')
    return Response.json({ access_token: 'fresh', expires_in: 60 })
  }) as typeof fetch

  await expect(service.refreshAccessToken(grantId)).resolves.toBe('fresh')
})

test('reauthorization keeps stable identity and replaces the App snapshot', async () => {
  const db = await database()
  const store = new MemoryStore()
  const service = createAuthService({
    db,
    store,
    logger,
    registry: registry(),
    now: () => 1_000,
  })
  const account = {
    externalUserId: 'subject',
    label: 'Person',
    verifiedIdentities: [],
  }
  const first = await service.addGrant({
    provider: 'example',
    account,
    scopes: ['openid'],
    appConfig: { clientId: 'first' },
    refreshToken: 'refresh-1',
  })
  const prior = await service.getGrantById(first.grantId)

  const second = await service.addGrant({
    provider: 'example',
    account,
    scopes: ['openid'],
    appConfig: { clientId: 'second', clientSecret: 'new-secret' },
    refreshToken: 'refresh-2',
  })

  expect(second).toEqual(first)
  const current = await service.getGrantById(first.grantId)
  expect(current?.appConfigRef).not.toBe(prior?.appConfigRef)
  expect(
    JSON.parse(await store.getSecret(current?.appConfigRef ?? '')),
  ).toEqual({ clientId: 'second', clientSecret: 'new-secret' })
  expect(store.values.has(prior?.appConfigRef ?? '')).toBe(false)
  expect(store.values.has(prior?.refreshTokenRef ?? '')).toBe(false)
})

test('failed Grant persistence cleans the App snapshot and token refs atomically', async () => {
  const db = await database()
  db.exec(
    "CREATE TRIGGER reject_grant BEFORE INSERT ON grants BEGIN SELECT RAISE(FAIL, 'no'); END",
  )
  const store = new MemoryStore()
  const service = createAuthService({
    db,
    store,
    logger,
    registry: registry(),
  })

  await expect(
    service.addGrant({
      provider: 'example',
      account: {
        externalUserId: 'subject',
        label: 'Person',
        verifiedIdentities: [],
      },
      scopes: ['openid'],
      appConfig: { clientId: 'id', clientSecret: 'secret' },
      refreshToken: 'refresh',
      accessToken: 'access',
    }),
  ).rejects.toThrow()
  expect(store.values.size).toBe(0)
  expect(db.prepare('SELECT COUNT(*) AS count FROM accounts').get()).toEqual({
    count: 0,
  })
  expect(db.prepare('SELECT COUNT(*) AS count FROM grants').get()).toEqual({
    count: 0,
  })
})

test('Account removal cleans private App and token refs and preserves bound Source as needs_auth', async () => {
  const db = await database()
  const store = new MemoryStore()
  const service = createAuthService({
    db,
    store,
    logger,
    registry: registry(),
    now: () => 1_000,
  })
  const { grantId } = await service.addGrant({
    provider: 'example',
    account: {
      externalUserId: 'subject',
      label: 'Person',
      verifiedIdentities: [],
    },
    scopes: ['openid'],
    appConfig: { clientId: 'id' },
    refreshToken: 'refresh',
    accessToken: 'access',
  })
  db.exec(
    `INSERT INTO realms VALUES ('realm', 'realm', NULL, 1);
     INSERT INTO sources
       (id, realm_id, adapter_id, grant_id, label, config_json, created_at, updated_at)
     VALUES ('source', 'realm', 'example.mail', '${grantId}', 'mail', '{}', 1, 1);`,
  )

  await service.removeAccount('Person')

  expect(store.values.size).toBe(0)
  expect(db.prepare('SELECT COUNT(*) AS count FROM accounts').get()).toEqual({
    count: 0,
  })
  expect(db.prepare('SELECT grant_id FROM sources').get()).toEqual({
    grant_id: null,
  })
  expect(db.prepare('SELECT last_status FROM source_sync_state').get()).toEqual(
    { last_status: 'needs_auth' },
  )
})
