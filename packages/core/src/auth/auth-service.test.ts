import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import { getEnv, resetEnvForTests } from '../config'
import { CtxindexAuthError } from '../errors'
import type { Logger } from '../logger'
import { keychainRef, type SecretsStore } from '../secrets'
import { applyPragmas } from '../storage'
import { runMigrations } from '../storage/migrator'
import { createAuthService } from './service'

const gmailClientIdEnvKey = 'CTXINDEX_GMAIL_CLIENT_ID'
const gmailClientSecretEnvKey = 'CTXINDEX_GMAIL_CLIENT_SECRET'

const savedEnv = new Map<string, string | undefined>([
  [gmailClientIdEnvKey, process.env[gmailClientIdEnvKey]],
  [gmailClientSecretEnvKey, process.env[gmailClientSecretEnvKey]],
])

const dbs: Database[] = []
let originalFetch: typeof globalThis.fetch | undefined

type FetchCall = {
  readonly url: string
  readonly body: URLSearchParams
}

class MemorySecretsStore implements SecretsStore {
  readonly values = new Map<string, string>()

  async getSecret(ref: string): Promise<string> {
    const value = this.values.get(ref)
    if (value === undefined) throw new Error(`secret not found: ${ref}`)
    return value
  }

  async setSecret(scope: string, key: string, value: string): Promise<string> {
    const ref = keychainRef(scope, key)
    this.values.set(ref, value)
    return ref
  }

  async deleteSecret(ref: string): Promise<void> {
    this.values.delete(ref)
  }

  async listKeys(): Promise<{ ref: string; scope: string; key: string }[]> {
    return [...this.values.keys()].map((ref) => ({
      ref,
      scope: 'google',
      key: ref,
    }))
  }
}

const logger = {
  debug() {},
} as unknown as Logger

function setEnv(
  key: 'CTXINDEX_GMAIL_CLIENT_ID' | 'CTXINDEX_GMAIL_CLIENT_SECRET',
  value: string | undefined,
): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

async function freshDb(): Promise<Database> {
  const db = new Database(':memory:', { create: true })
  applyPragmas(db)
  await runMigrations(db)
  dbs.push(db)
  return db
}

function restoreEnv(): void {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  resetEnvForTests()
}

function mockTokenFetch(
  status: number,
  body: Record<string, unknown>,
): FetchCall[] {
  const calls: FetchCall[] = []
  globalThis.fetch = (async (input, init) => {
    calls.push({
      url: String(input),
      body: new URLSearchParams(String(init?.body ?? '')),
    })
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  return calls
}

function insertGrantWithRefreshOnly(
  db: Database,
  refreshTokenRef: string,
  refs: { clientIdRef?: string | null; clientSecretRef?: string | null } = {},
): string {
  const now = Date.now()
  const accountId = `acct_${now}_${Math.random()}`
  const grantId = `grant_${now}_${Math.random()}`
  db.prepare(
    `INSERT INTO accounts (id, realm_id, provider, display_name, email, created_at)
     VALUES (?, 'global', 'google', 'google', NULL, ?)`,
  ).run(accountId, now)
  db.prepare(
    `INSERT INTO grants
       (id, account_id, provider, scopes, client_id_ref, client_secret_ref, access_token_ref, refresh_token_ref, expires_at, created_at, updated_at)
     VALUES (?, ?, 'google', ?, ?, ?, NULL, ?, NULL, ?, ?)`,
  ).run(
    grantId,
    accountId,
    'scope-one scope-two',
    refs.clientIdRef ?? null,
    refs.clientSecretRef ?? null,
    refreshTokenRef,
    now,
    now,
  )
  return grantId
}

afterEach(() => {
  restoreEnv()
  if (originalFetch) globalThis.fetch = originalFetch
  originalFetch = undefined
  for (const db of dbs.splice(0)) db.close()
})

test('addGoogleGrant inserts grant + account with all secret refs', async () => {
  const db = await freshDb()
  const store = new MemorySecretsStore()
  const service = createAuthService({ db, store, logger, env: getEnv() })

  const result = await service.addGoogleGrant({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    refreshToken: 'refresh-token',
    accessToken: 'access-token',
    scopes: 'scope-one scope-two',
    expiresAt: 1234,
    accountEmail: 'user@example.com',
  })

  const account = db
    .prepare('SELECT id, provider, email FROM accounts WHERE id = ?')
    .get(result.accountId) as {
    id: string
    provider: string
    email: string
  } | null
  expect(account).toEqual({
    id: result.accountId,
    provider: 'google',
    email: 'user@example.com',
  })

  const grant = await service.getActiveGoogleGrant()
  expect(grant).toMatchObject({
    id: result.grantId,
    accountId: result.accountId,
    provider: 'google',
    scopes: 'scope-one scope-two',
    expiresAt: 1234,
  })
  expect(grant?.accessTokenRef).toBeString()
  expect(grant?.refreshTokenRef).toBeString()
  expect(grant?.clientIdRef).toBeString()
  expect(grant?.clientSecretRef).toBeString()

  expect(await store.getSecret(grant?.accessTokenRef ?? '')).toBe(
    'access-token',
  )
  expect(await store.getSecret(grant?.refreshTokenRef ?? '')).toBe(
    'refresh-token',
  )
  expect(await store.getSecret(grant?.clientIdRef ?? '')).toBe('client-id')
  expect(await store.getSecret(grant?.clientSecretRef ?? '')).toBe(
    'client-secret',
  )
})

test('listGoogleGrants returns the inserted grant', async () => {
  const db = await freshDb()
  const store = new MemorySecretsStore()
  const service = createAuthService({ db, store, logger, env: getEnv() })

  const result = await service.addGoogleGrant({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    refreshToken: 'refresh-token',
    scopes: 'scope-one scope-two',
  })

  await expect(service.listGoogleGrants()).resolves.toEqual([
    {
      id: result.grantId,
      provider: 'google',
      scopes: 'scope-one scope-two',
      expiresAt: null,
    },
  ])
})

test('refreshGoogleAccessToken uses per-grant client creds when env vars are unset', async () => {
  originalFetch = globalThis.fetch
  setEnv('CTXINDEX_GMAIL_CLIENT_ID', undefined)
  setEnv('CTXINDEX_GMAIL_CLIENT_SECRET', undefined)
  resetEnvForTests()
  const calls = mockTokenFetch(200, {
    access_token: 'new-access-token',
    expires_in: 3600,
    scope: 'scope-one scope-two',
    token_type: 'Bearer',
  })
  const db = await freshDb()
  const store = new MemorySecretsStore()
  const service = createAuthService({ db, store, logger, env: getEnv() })
  const { grantId } = await service.addGoogleGrant({
    clientId: 'per-grant-client-id',
    clientSecret: 'per-grant-client-secret',
    refreshToken: 'refresh-token',
    scopes: 'scope-one scope-two',
  })

  await expect(service.refreshGoogleAccessToken(grantId)).resolves.toBe(
    'new-access-token',
  )

  expect(calls).toHaveLength(1)
  expect(calls[0]?.body.get('client_id')).toBe('per-grant-client-id')
  expect(calls[0]?.body.get('client_secret')).toBe('per-grant-client-secret')
  const grant = await service.getActiveGoogleGrant()
  expect(grant?.accessTokenRef).toBeString()
  expect(await store.getSecret(grant?.accessTokenRef ?? '')).toBe(
    'new-access-token',
  )
})

test('refreshGoogleAccessToken env var override path still works', async () => {
  originalFetch = globalThis.fetch
  setEnv('CTXINDEX_GMAIL_CLIENT_ID', 'env-client-id')
  setEnv('CTXINDEX_GMAIL_CLIENT_SECRET', 'env-client-secret')
  resetEnvForTests()
  const calls = mockTokenFetch(200, {
    access_token: 'env-access-token',
    expires_in: 3600,
    scope: 'scope-one scope-two',
    token_type: 'Bearer',
  })
  const db = await freshDb()
  const store = new MemorySecretsStore()
  const refreshTokenRef = await store.setSecret(
    'google',
    'refresh_token:env',
    'refresh-token',
  )
  const grantId = insertGrantWithRefreshOnly(db, refreshTokenRef)
  const service = createAuthService({ db, store, logger, env: getEnv() })

  await expect(service.refreshGoogleAccessToken(grantId)).resolves.toBe(
    'env-access-token',
  )

  expect(calls).toHaveLength(1)
  expect(calls[0]?.body.get('client_id')).toBe('env-client-id')
  expect(calls[0]?.body.get('client_secret')).toBe('env-client-secret')
})

test('refreshGoogleAccessToken missing creds error', async () => {
  setEnv('CTXINDEX_GMAIL_CLIENT_ID', undefined)
  setEnv('CTXINDEX_GMAIL_CLIENT_SECRET', undefined)
  resetEnvForTests()
  const db = await freshDb()
  const store = new MemorySecretsStore()
  const refreshTokenRef = await store.setSecret(
    'google',
    'refresh_token:missing',
    'refresh-token',
  )
  const grantId = insertGrantWithRefreshOnly(db, refreshTokenRef)
  const service = createAuthService({ db, store, logger, env: getEnv() })

  await expect(service.refreshGoogleAccessToken(grantId)).rejects.toMatchObject(
    {
      code: 'missing_oauth_client_creds',
    },
  )
})

test('refreshGoogleAccessToken handles invalid_grant', async () => {
  originalFetch = globalThis.fetch
  setEnv('CTXINDEX_GMAIL_CLIENT_ID', undefined)
  setEnv('CTXINDEX_GMAIL_CLIENT_SECRET', undefined)
  resetEnvForTests()
  mockTokenFetch(400, { error: 'invalid_grant' })
  const db = await freshDb()
  const store = new MemorySecretsStore()
  const service = createAuthService({ db, store, logger, env: getEnv() })
  const { grantId } = await service.addGoogleGrant({
    clientId: 'per-grant-client-id',
    clientSecret: 'per-grant-client-secret',
    refreshToken: 'refresh-token',
    scopes: 'scope-one scope-two',
  })

  await expect(
    service.refreshGoogleAccessToken(grantId),
  ).rejects.toBeInstanceOf(CtxindexAuthError)
  await expect(service.refreshGoogleAccessToken(grantId)).rejects.toMatchObject(
    {
      code: 'invalid_grant',
    },
  )
})
