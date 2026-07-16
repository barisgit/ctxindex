import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import {
  defineAdapter,
  defineExtension,
  defineProfile,
} from '@ctxindex/extension-sdk'
import { z } from 'zod'
import type { AuthService } from '../auth'
import { createExtensionRegistry } from '../registry'
import { ResourceStore } from '../resource'
import { applyPragmas } from '../storage'
import { runMigrations } from '../storage/migrator'
import { testOAuthProvider } from '../testing/oauth-provider'
import { searchSourceRemote } from './remote-search'

const sourceId = '01KXHBNECDAH1T4MJ38X88EPFJ'
const profile = defineProfile({
  id: 'fake.remote',
  version: 1,
  schema: z.object({ text: z.string() }),
  search: {
    title: (payload) => payload.text,
    fields: { text: { type: 'string', extract: (payload) => payload.text } },
  },
})

const adapter = defineAdapter({
  id: 'fake.remote-adapter',
  version: 1,
  configSchema: z.object({}).strict(),
  auth: {
    kind: 'oauth2',
    provider: testOAuthProvider({
      authorizationUrl: 'https://provider.test/auth',
      tokenUrl: 'https://provider.test/token',
    }),
    scopes: ['remote:read'],
  },
  providerApiHosts: ['provider.test'],
  profiles: [{ id: 'fake.remote', version: 1 }],
  routing: 'federated',
  capabilities: ['search-remote'],
  operations: {
    searchRemote: async ({ source, query, fetch }) => {
      await fetch('https://provider.test/search')
      return {
        resources: [
          {
            ref: `ctx://${source.id}/item/provider-1`,
            profile: { id: 'fake.remote', version: 1 },
            title: 'provider title',
            occurredAt: 1234,
            ...(query.text === 'missing-payload'
              ? {}
              : { payload: { text: query.text } }),
          },
        ],
        warnings: [
          {
            code: 'provider_warning',
            message: 'provider result was partial',
          },
        ],
      }
    },
  },
  actions: {},
})
const registry = createExtensionRegistry([
  defineExtension({
    id: 'fake.remote-extension',
    version: 1,
    profiles: [profile],
    adapters: [adapter],
  }),
])
const logger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
}
const authService = {
  async resolveLinkedGrantAccessToken() {
    return 'linked-token'
  },
} as Pick<AuthService, 'resolveLinkedGrantAccessToken'>
const dbs: Database[] = []

async function freshDb(): Promise<Database> {
  const db = new Database(':memory:')
  dbs.push(db)
  applyPragmas(db)
  await runMigrations(db)
  db.prepare(
    "INSERT INTO realms (id, slug, label, created_at) VALUES ('realm-1', 'work', 'Work', 1)",
  ).run()
  db.prepare(
    "INSERT INTO accounts (id, provider, external_user_id, created_at, updated_at) VALUES ('account-1', 'test', 'subject-1', 1, 1)",
  ).run()
  db.prepare(
    `INSERT INTO grants
       (id, account_id, provider, scopes_json, created_at, updated_at)
     VALUES ('grant-1', 'account-1', 'test', '["remote:read"]', 1, 1)`,
  ).run()
  db.prepare(
    `INSERT INTO sources
       (id, realm_id, adapter_id, adapter_version, config_json, grant_id, sync_enabled, created_at, updated_at)
     VALUES (?, 'realm-1', 'fake.remote-adapter', 1, '{}', 'grant-1', 1, 1, 1)`,
  ).run(sourceId)
  return db
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close()
})

describe('searchSourceRemote', () => {
  test('materializes provider resources idempotently and preserves warnings', async () => {
    const db = await freshDb()
    const authorizations: string[] = []
    const input = {
      db,
      sourceId,
      registry,
      authService,
      logger,
      query: { text: 'hello', limit: 5 },
      signal: new AbortController().signal,
      fetch: async (_url: string, init?: RequestInit) => {
        authorizations.push(
          new Headers(init?.headers).get('authorization') ?? '',
        )
        return new Response()
      },
    }

    const first = await searchSourceRemote(input)
    const store = new ResourceStore(db, registry.profiles)
    const storedFirst = store.get(`ctx://${sourceId}/item/provider-1`)
    const second = await searchSourceRemote(input)
    const storedSecond = store.get(`ctx://${sourceId}/item/provider-1`)

    expect(first.warnings).toEqual([
      { code: 'provider_warning', message: 'provider result was partial' },
    ])
    expect(second.warnings).toEqual(first.warnings)
    expect(authorizations).toEqual([
      'Bearer linked-token',
      'Bearer linked-token',
    ])
    expect(storedFirst).toMatchObject({
      ref: `ctx://${sourceId}/item/provider-1`,
      sourceId,
      profile: { id: 'fake.remote', version: 1 },
      origin: 'adhoc',
      hydratedAt: null,
      payload: { text: 'hello' },
    })
    expect(storedSecond?.id).toBe(storedFirst?.id)
    expect(
      db.prepare('SELECT title, occurred_at FROM resources').get(),
    ).toEqual({ title: 'hello', occurred_at: 1234 })
    expect(db.prepare('SELECT count(*) AS count FROM resources').get()).toEqual(
      {
        count: 1,
      },
    )
  })
  test('post-filters typed fields and excludes unverifiable provider envelopes', async () => {
    const db = await freshDb()
    const base = {
      db,
      sourceId,
      registry,
      authService: authService as AuthService,
      logger,
      signal: new AbortController().signal,
      fetch: async () => new Response(),
    }

    const mismatch = await searchSourceRemote({
      ...base,
      query: {
        text: 'hello',
        limit: 5,
        fields: [{ name: 'text', type: 'string', value: 'other' }],
      },
    })
    expect(mismatch.resources).toEqual([])

    const unverifiable = await searchSourceRemote({
      ...base,
      query: {
        text: 'missing-payload',
        limit: 5,
        fields: [{ name: 'text', type: 'string', value: 'missing-payload' }],
      },
    })
    expect(unverifiable.resources).toEqual([])
    expect(unverifiable.warnings).toContainEqual(
      expect.objectContaining({ code: 'provider_filter_unverifiable' }),
    )
  })
})
