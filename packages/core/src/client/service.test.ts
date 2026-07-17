import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, expect, test } from 'bun:test'
import { keychainRef, type SecretsStore } from '../secrets'
import { applyPragmas, runMigrations } from '../storage'
import { resolveOAuthClient } from './resolution'
import { createOAuthClientService } from './service'

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
    this.writes++
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

let db: Database

beforeEach(async () => {
  db = new Database(':memory:', { create: true })
  applyPragmas(db)
  await runMigrations(db)
})

test('resolves the only persisted client for a provider without a label', async () => {
  const store = new MemoryStore()
  const clients = createOAuthClientService({ db, store })
  await clients.addClient({
    provider: 'google',
    label: 'work',
    clientId: 'client-id',
    clientSecret: 'client-secret',
  })

  await expect(
    resolveOAuthClient({ provider: 'google' }, { db, store }),
  ).resolves.toEqual({
    provider: 'google',
    label: 'work',
    clientId: 'client-id',
    clientSecret: 'client-secret',
  })
})

test('missing provider client gives an actionable error', async () => {
  const store = new MemoryStore()

  await expect(
    resolveOAuthClient({ provider: 'google' }, { db, store }),
  ).rejects.toThrow('bun cli client add google --from-env')
})

test('multiple provider clients require an exact provider-scoped label', async () => {
  const store = new MemoryStore()
  const clients = createOAuthClientService({ db, store })
  await clients.addClient({
    provider: 'google',
    label: 'personal',
    clientId: 'personal-id',
  })
  await clients.addClient({
    provider: 'google',
    label: 'work',
    clientId: 'work-id',
  })
  await clients.addClient({
    provider: 'microsoft',
    label: 'work',
    clientId: 'microsoft-id',
  })

  await expect(
    resolveOAuthClient({ provider: 'google' }, { db, store }),
  ).rejects.toThrow('personal, work')
  await expect(
    resolveOAuthClient({ provider: 'google', label: 'missing' }, { db, store }),
  ).rejects.toThrow('Available labels: personal, work')
  await expect(
    resolveOAuthClient({ provider: 'google', label: 'work' }, { db, store }),
  ).resolves.toMatchObject({ provider: 'google', clientId: 'work-id' })
})

afterEach(() => db.close())

test('persists client credentials through typed secret references', async () => {
  const store = new MemoryStore()
  const clients = createOAuthClientService({ db, store, now: () => 1_000 })

  const added = await clients.addClient({
    provider: 'google',
    clientId: 'client-id',
    clientSecret: 'client-secret',
  })

  expect(added).toEqual({
    provider: 'google',
    label: 'google',
    createdAt: 1_000,
    updatedAt: 1_000,
  })
  expect(store.values.size).toBe(2)
  expect(
    db
      .prepare(
        'SELECT provider, label, client_id_ref, client_secret_ref, created_at, updated_at FROM oauth_clients',
      )
      .get(),
  ).toMatchObject({
    provider: 'google',
    label: 'google',
    client_id_ref: expect.stringContaining('keychain:ctxindex/google/'),
    client_secret_ref: expect.stringContaining('keychain:ctxindex/google/'),
    created_at: 1_000,
    updated_at: 1_000,
  })
})

test('cleans every newly written secret when client metadata persistence fails', async () => {
  db.exec(
    "CREATE TRIGGER reject_client BEFORE INSERT ON oauth_clients BEGIN SELECT RAISE(FAIL, 'no'); END",
  )
  const store = new MemoryStore()
  const clients = createOAuthClientService({ db, store })

  await expect(
    clients.addClient({
      provider: 'google',
      label: 'work',
      clientId: 'client-id',
      clientSecret: 'client-secret',
    }),
  ).rejects.toThrow()
  expect(store.values.size).toBe(0)
  expect(
    db.prepare('SELECT count(*) AS count FROM oauth_clients').get(),
  ).toEqual({ count: 0 })
})

test('scopes client label uniqueness to one provider', async () => {
  const store = new MemoryStore()
  const clients = createOAuthClientService({ db, store })
  await clients.addClient({
    provider: 'google',
    label: 'default',
    clientId: 'google-client',
  })
  await clients.addClient({
    provider: 'microsoft',
    label: 'default',
    clientId: 'microsoft-client',
  })

  await expect(
    clients.addClient({
      provider: 'google',
      label: 'default',
      clientId: 'duplicate-client',
    }),
  ).rejects.toThrow(
    'Client label "default" is already taken for provider "google"; choose another with --label',
  )
  expect(
    db
      .prepare('SELECT provider, label FROM oauth_clients ORDER BY provider')
      .all(),
  ).toEqual([
    { provider: 'google', label: 'default' },
    { provider: 'microsoft', label: 'default' },
  ])
})

test('cleans prior client secrets when a later secret write fails', async () => {
  const store = new MemoryStore()
  store.failWriteAt = 2
  const clients = createOAuthClientService({ db, store })

  await expect(
    clients.addClient({
      provider: 'google',
      clientId: 'client-id',
      clientSecret: 'client-secret',
    }),
  ).rejects.toThrow('write failed')
  expect(store.values.size).toBe(0)
  expect(
    db.prepare('SELECT count(*) AS count FROM oauth_clients').get(),
  ).toEqual({ count: 0 })
})

test('lists safe client metadata deterministically and removes scoped refs', async () => {
  const store = new MemoryStore()
  const clients = createOAuthClientService({ db, store, now: () => 1_000 })
  await clients.addClient({
    provider: 'microsoft',
    label: 'default',
    clientId: 'microsoft-id',
  })
  await clients.addClient({
    provider: 'google',
    label: 'default',
    clientId: 'google-id',
    clientSecret: 'google-secret',
  })

  expect(clients.listClients()).toEqual([
    {
      provider: 'google',
      label: 'default',
      createdAt: 1_000,
      updatedAt: 1_000,
    },
    {
      provider: 'microsoft',
      label: 'default',
      createdAt: 1_000,
      updatedAt: 1_000,
    },
  ])

  await clients.removeClient('google', 'default')
  expect(clients.listClients()).toHaveLength(1)
  expect(store.values.size).toBe(1)
  await expect(clients.removeClient('google', 'default')).rejects.toThrow(
    'OAuth client not found',
  )
})
