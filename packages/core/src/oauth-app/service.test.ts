import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, expect, test } from 'bun:test'
import {
  auth,
  defineOAuthApp,
  defineProvider,
  z,
} from '@ctxindex/extension-sdk'
import type { CompleteRegistry } from '../registry'
import { keychainRef, type SecretsStore } from '../secrets'
import { applyPragmas, runMigrations } from '../storage'
import { createOAuthAppService } from './service'

class MemoryStore implements SecretsStore {
  readonly values = new Map<string, string>()

  async getSecret(ref: string): Promise<string> {
    const value = this.values.get(ref)
    if (value === undefined) throw new Error('missing')
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
      type: 'confidential',
      configSchema: z.object({
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
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

let db: Database

beforeEach(async () => {
  db = new Database(':memory:', { create: true })
  applyPragmas(db)
  await runMigrations(db)
})

afterEach(() => db.close())

test('fresh storage persists validated local OAuth App config behind one typed ref', async () => {
  const store = new MemoryStore()
  const service = createOAuthAppService({
    db,
    store,
    registry: registry(),
    now: () => 1_000,
  })

  await service.addLocalApp({
    providerId: 'example',
    label: 'work',
    config: { clientId: 'client-id', clientSecret: 'client-secret' },
  })

  expect(
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('oauth_apps', 'oauth_clients') ORDER BY name",
      )
      .all(),
  ).toEqual([{ name: 'oauth_apps' }])
  const stored = db
    .prepare(
      'SELECT provider_id, label, config_ref, created_at, updated_at FROM oauth_apps',
    )
    .get() as Record<string, unknown>
  expect(stored).toMatchObject({
    provider_id: 'example',
    label: 'work',
    config_ref: expect.stringContaining('keychain:ctxindex/example/'),
    created_at: 1_000,
    updated_at: 1_000,
  })
  expect([...store.values.values()]).toEqual([
    JSON.stringify({ clientId: 'client-id', clientSecret: 'client-secret' }),
  ])
  const inventory = service.listApps()
  expect(inventory).toEqual([
    {
      providerId: 'example',
      label: 'work',
      origin: 'local',
      provenance: { kind: 'local' },
    },
  ])
  expect(JSON.stringify(inventory)).not.toMatch(
    /client-id|client-secret|config_ref|keychain:/,
  )
})

test('local OAuth App config is validated before any secret write', async () => {
  const store = new MemoryStore()
  const service = createOAuthAppService({ db, store, registry: registry() })

  await expect(
    service.addLocalApp({
      providerId: 'example',
      label: 'work',
      config: { clientId: 'client-id' },
    }),
  ).rejects.toThrow('OAuth App configuration is invalid')
  expect(store.values.size).toBe(0)
  expect(db.prepare('SELECT COUNT(*) AS count FROM oauth_apps').get()).toEqual({
    count: 0,
  })
})

test('unified inventory safely projects Extension provenance and rejects BYOA shadowing', async () => {
  const extensionApp = defineOAuthApp(provider, {
    label: 'official',
    config: { clientId: 'public-id', clientSecret: 'desktop-metadata' },
  })
  const active = registry()
  ;(active.oauthApps as Map<string, typeof extensionApp>).set(
    '["example","official"]',
    extensionApp,
  )
  ;(active.provenances as Map<string, readonly never[]>).set(
    'oauth-app:["example","official"]',
    [
      {
        origin: 'catalog',
        packageName: '@ctxindex/official-example',
        packageVersion: '1.2.3',
        integrity: 'sha512-safe',
        entry: './dist/index.js',
        exportName: 'officialApp',
      },
    ] as never,
  )
  const store = new MemoryStore()
  const service = createOAuthAppService({ db, store, registry: active })

  expect(service.listApps()).toEqual([
    {
      providerId: 'example',
      label: 'official',
      origin: 'extension',
      provenance: {
        kind: 'extension',
        source: 'catalog',
        packageName: '@ctxindex/official-example',
        packageVersion: '1.2.3',
        integrity: 'sha512-safe',
      },
    },
  ])
  expect(JSON.stringify(service.listApps())).not.toMatch(
    /public-id|desktop-metadata|dist|officialApp/,
  )
  await expect(
    service.addLocalApp({
      providerId: 'example',
      label: 'official',
      config: { clientId: 'local-id', clientSecret: 'local-secret' },
    }),
  ).rejects.toThrow('already exists')
  expect(store.values.size).toBe(0)
})

test('removing a local App blocks only future App resolution', async () => {
  const store = new MemoryStore()
  const service = createOAuthAppService({ db, store, registry: registry() })
  await service.addLocalApp({
    providerId: 'example',
    label: 'temporary',
    config: { clientId: 'id', clientSecret: 'secret' },
  })

  await service.removeLocalApp('example', 'temporary')

  await expect(service.resolveApp('example', 'temporary')).rejects.toThrow(
    'is not available',
  )
  expect(store.values.size).toBe(0)
})
