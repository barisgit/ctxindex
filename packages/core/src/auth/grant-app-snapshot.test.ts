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
  readonly failDeleteRefs = new Set<string>()
  failAllDeletes = false
  failWriteAt = 0
  writeDelayMs = 0
  writeBarrier: Promise<void> | null = null
  onWrite: (() => void) | null = null
  writes = 0
  async getSecret(ref: string) {
    const value = this.values.get(ref)
    if (value === undefined) throw new Error('missing')
    return value
  }
  async setSecret(scope: string, key: string, value: string) {
    this.writes += 1
    if (this.failWriteAt === this.writes) throw new Error('write failed')
    this.onWrite?.()
    if (this.writeBarrier) await this.writeBarrier
    if (this.writeDelayMs > 0) await Bun.sleep(this.writeDelayMs)
    const ref = keychainRef(scope, key)
    this.values.set(ref, value)
    return ref
  }
  async deleteSecret(ref: string) {
    if (this.failAllDeletes || this.failDeleteRefs.has(ref)) {
      throw new Error('DELETE-FAILURE-SECRET-CANARY')
    }
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

test('refresh warns safely when superseded token cleanup remains pending', async () => {
  const db = await database()
  const store = new MemoryStore()
  const warnings: unknown[][] = []
  const warningLogger = {
    debug() {},
    warn(...args: unknown[]) {
      warnings.push(args)
    },
  } as unknown as Logger
  const service = createAuthService({
    db,
    store,
    logger: warningLogger,
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
    appConfig: { clientId: 'snapshot-client-canary' },
    refreshToken: 'old-refresh-canary',
    accessToken: 'old-access-canary',
    expiresAt: 0,
  })
  const prior = await service.getGrantById(grantId)
  expect(prior).not.toBeNull()
  for (const ref of [prior?.accessTokenRef, prior?.refreshTokenRef]) {
    if (ref) store.failDeleteRefs.add(ref)
  }
  globalThis.fetch = (async () =>
    Response.json({
      access_token: 'replacement-access-canary',
      refresh_token: 'replacement-refresh-canary',
      expires_in: 60,
      scope: 'openid',
    })) as unknown as typeof fetch

  await expect(service.refreshAccessToken(grantId)).resolves.toBe(
    'replacement-access-canary',
  )

  const current = await service.getGrantById(grantId)
  expect(current?.accessTokenRef).not.toBe(prior?.accessTokenRef)
  expect(current?.refreshTokenRef).not.toBe(prior?.refreshTokenRef)
  expect(warnings).toHaveLength(1)
  expect(warnings[0]?.[0]).toMatchObject({
    lifecycle: 'refresh',
    provider: 'example',
    grantId,
    cleanupFailures: 2,
  })
  const rendered = JSON.stringify(warnings)
  expect(rendered).not.toMatch(
    /old-access-canary|old-refresh-canary|DELETE-FAILURE-SECRET-CANARY|keychain:/,
  )
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

test('concurrent reauthorization leaves only the winning Grant refs', async () => {
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
    appConfig: { clientId: 'initial' },
    refreshToken: 'initial-refresh',
  })
  store.writeDelayMs = 10

  const results = await Promise.all([
    service.addGrant({
      provider: 'example',
      account,
      scopes: ['openid'],
      appConfig: { clientId: 'concurrent-a' },
      refreshToken: 'refresh-a',
    }),
    service.addGrant({
      provider: 'example',
      account,
      scopes: ['openid'],
      appConfig: { clientId: 'concurrent-b' },
      refreshToken: 'refresh-b',
    }),
  ])

  expect(results).toEqual([first, first])
  const current = await service.getGrantById(first.grantId)
  expect(current).not.toBeNull()
  if (!current?.refreshTokenRef) throw new Error('missing current Grant refs')
  expect(new Set(store.values.keys())).toEqual(
    new Set([current.appConfigRef, current.refreshTokenRef]),
  )
  const pair = [
    JSON.parse(await store.getSecret(current.appConfigRef)).clientId,
    await store.getSecret(current.refreshTokenRef),
  ]
  expect([
    ['concurrent-a', 'refresh-a'],
    ['concurrent-b', 'refresh-b'],
  ]).toContainEqual(pair)
})

test('old-label removal cannot delete an Account renamed while queued', async () => {
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
    label: 'Old label',
    verifiedIdentities: [],
  }
  const first = await service.addGrant({
    provider: 'example',
    account,
    scopes: ['openid'],
    appConfig: { clientId: 'initial' },
    refreshToken: 'initial-refresh',
  })
  let releaseWrite = () => {}
  store.writeBarrier = new Promise<void>((resolve) => {
    releaseWrite = resolve
  })
  let signalWrite = () => {}
  const writeStarted = new Promise<void>((resolve) => {
    signalWrite = resolve
  })
  store.onWrite = signalWrite

  const rename = service.addGrant({
    provider: 'example',
    account: { ...account, label: 'New label' },
    scopes: ['openid'],
    appConfig: { clientId: 'replacement' },
    refreshToken: 'replacement-refresh',
  })
  await writeStarted
  const removal = service.removeAccount('Old label')
  const removalOutcome = removal.then(
    () => null,
    (error: unknown) => error,
  )
  releaseWrite()
  await expect(rename).resolves.toEqual(first)
  expect(await removalOutcome).toMatchObject({
    code: 'not_found',
    message: 'account not found: "Old label"',
  })

  expect(
    db.prepare('SELECT label FROM accounts WHERE id = ?').get(first.accountId),
  ).toEqual({ label: 'New label' })
  expect(db.prepare('SELECT COUNT(*) AS count FROM grants').get()).toEqual({
    count: 1,
  })
})

test('concurrent refresh leaves only current token refs', async () => {
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
    appConfig: { clientId: 'snapshot' },
    refreshToken: 'initial-refresh',
    accessToken: 'initial-access',
    expiresAt: 0,
  })
  store.writeDelayMs = 10
  let request = 0
  globalThis.fetch = (async () => {
    request += 1
    return Response.json({
      access_token: `access-${request}`,
      refresh_token: `refresh-${request}`,
      expires_in: 60,
      scope: 'openid',
    })
  }) as unknown as typeof fetch

  await expect(
    Promise.all([
      service.refreshAccessToken(grantId),
      service.refreshAccessToken(grantId),
    ]),
  ).resolves.toEqual(['access-1', 'access-2'])

  const current = await service.getGrantById(grantId)
  expect(current).not.toBeNull()
  if (!current?.accessTokenRef || !current.refreshTokenRef)
    throw new Error('missing current Grant refs')
  expect(new Set(store.values.keys())).toEqual(
    new Set([
      current.appConfigRef,
      current.accessTokenRef,
      current.refreshTokenRef,
    ]),
  )
  expect(await store.getSecret(current.accessTokenRef)).toBe('access-2')
  expect(await store.getSecret(current.refreshTokenRef)).toBe('refresh-2')
})

test('reauthorization warns safely when superseded secret cleanup remains pending', async () => {
  const db = await database()
  const store = new MemoryStore()
  const warnings: unknown[][] = []
  const warningLogger = {
    debug() {},
    warn(...args: unknown[]) {
      warnings.push(args)
    },
  } as unknown as Logger
  const service = createAuthService({
    db,
    store,
    logger: warningLogger,
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
    appConfig: { clientId: 'first-config-canary' },
    refreshToken: 'first-refresh-canary',
  })
  const prior = await service.getGrantById(first.grantId)
  expect(prior).not.toBeNull()
  for (const ref of [prior?.appConfigRef, prior?.refreshTokenRef]) {
    if (ref) store.failDeleteRefs.add(ref)
  }

  await expect(
    service.addGrant({
      provider: 'example',
      account,
      scopes: ['openid'],
      appConfig: { clientId: 'replacement-config-canary' },
      refreshToken: 'replacement-refresh-canary',
    }),
  ).resolves.toEqual(first)

  const current = await service.getGrantById(first.grantId)
  expect(current?.appConfigRef).not.toBe(prior?.appConfigRef)
  expect(current?.refreshTokenRef).not.toBe(prior?.refreshTokenRef)
  expect(warnings).toHaveLength(1)
  const rendered = JSON.stringify(warnings)
  expect(rendered).toContain('reauthorization')
  expect(rendered).toContain('cleanupFailures')
  expect(rendered).not.toMatch(
    /first-config-canary|first-refresh-canary|DELETE-FAILURE-SECRET-CANARY|keychain:/,
  )
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

test('failed Grant persistence preserves its original error when rollback cleanup also fails', async () => {
  const db = await database()
  db.exec(
    "CREATE TRIGGER reject_grant_cleanup BEFORE INSERT ON grants BEGIN SELECT RAISE(FAIL, 'ORIGINAL-PERSISTENCE-FAILURE'); END",
  )
  const store = new MemoryStore()
  store.failAllDeletes = true
  const warnings: unknown[][] = []
  const warningLogger = {
    debug() {},
    warn(...args: unknown[]) {
      warnings.push(args)
    },
  } as unknown as Logger
  const service = createAuthService({
    db,
    store,
    logger: warningLogger,
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
      appConfig: { clientId: 'rollback-config-canary' },
      refreshToken: 'rollback-refresh-canary',
      accessToken: 'rollback-access-canary',
    }),
  ).rejects.toThrow('ORIGINAL-PERSISTENCE-FAILURE')

  expect(warnings).toHaveLength(1)
  expect(warnings[0]?.[0]).toMatchObject({
    lifecycle: 'authorization-rollback',
    provider: 'example',
    cleanupFailures: 3,
  })
  expect(JSON.stringify(warnings)).not.toMatch(
    /rollback-config-canary|rollback-refresh-canary|rollback-access-canary|DELETE-FAILURE-SECRET-CANARY|keychain:/,
  )
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
