import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import { authorizeProvider, createAuthService } from '@ctxindex/core/auth'
import type { Logger } from '@ctxindex/core/logger'
import {
  createAdapterRegistry,
  createProfileRegistry,
} from '@ctxindex/core/registry'
import { keychainRef, type SecretsStore } from '@ctxindex/core/secrets'
import { applyPragmas, runMigrations } from '@ctxindex/core/storage'
import { defineAdapter } from '@ctxindex/extension-sdk'
import { z } from 'zod'
import {
  type MockGraphServer,
  startMockGraph,
} from '../../apps/cli/src/e2e/_mock-graph'
import { microsoftOAuthProvider } from '../../packages/adapters/src/microsoft/provider'

class MemorySecretsStore implements SecretsStore {
  readonly values = new Map<string, string>()

  async getSecret(ref: string): Promise<string> {
    const value = this.values.get(ref)
    if (value === undefined) throw new Error('missing test secret')
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

  async listKeys(): Promise<readonly string[]> {
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

const databases: Database[] = []
const servers: MockGraphServer[] = []

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
  for (const server of servers.splice(0)) server.stop()
})

async function createDatabase(): Promise<Database> {
  const database = new Database(':memory:', { create: true })
  applyPragmas(database)
  await runMigrations(database)
  databases.push(database)
  return database
}

function startIdentity(
  kind: 'malformed' | 'personal' | 'work',
): MockGraphServer {
  const server = startMockGraph()
  server.setIdentity(kind)
  servers.push(server)
  return server
}

test('one core OAuth flow supports Microsoft personal and work identities safely', async () => {
  const database = await createDatabase()
  const store = new MemorySecretsStore()
  const provider = {
    ...microsoftOAuthProvider,
    environment: {
      ...microsoftOAuthProvider.environment,
      refreshToken: 'CTXINDEX_MICROSOFT_REFRESH_TOKEN',
    },
  }
  const adapter = defineAdapter({
    id: 'microsoft.fixture-mailbox',
    version: 1,
    configSchema: z.object({}).strict(),
    auth: {
      kind: 'oauth2',
      provider,
      scopes: ['Mail.ReadWrite'],
    },
    profiles: [],
    routing: 'federated',
    capabilities: ['search-remote'],
    operations: {
      searchRemote: async () => ({ resources: [], warnings: [] }),
    },
    actions: {},
  })
  const registry = createAdapterRegistry(createProfileRegistry([]), [adapter])
  let current = startIdentity('work')
  const readEnvironment = (name: string): string | undefined => {
    if (name === 'CTXINDEX_OAUTH_MOCK_BASE_URL') return current.baseUrl
    if (name === 'CTXINDEX_MICROSOFT_CLIENT_ID') return 'fixture-client'
    if (name === 'CTXINDEX_MICROSOFT_REFRESH_TOKEN') {
      return 'microsoft-initial-refresh-token'
    }
    return undefined
  }
  const authService = createAuthService({
    db: database,
    store,
    logger,
    registry,
    readEnvironment,
    now: () => 1_000,
  })
  const authorize = () =>
    authorizeProvider(
      {
        provider: 'microsoft',
        mode: 'from-env',
      },
      {
        registry,
        authService,
        resolveClient: async () => ({
          provider: 'microsoft',
          label: 'microsoft',
          clientId: 'fixture-client',
        }),
        readEnvironment,
        now: () => 1_000,
      },
    )

  const work = await authorize()
  expect(work.scopes).toEqual(['Mail.ReadWrite', 'User.Read'])
  expect(await authService.refreshAccessToken(work.grantId)).toBe(
    'microsoft-access-2',
  )
  expect(await authService.refreshAccessToken(work.grantId)).toBe(
    'microsoft-access-3',
  )

  current = startIdentity('personal')
  const personal = await authorize()
  current = startIdentity('personal')
  const personalAgain = await authorize()
  expect(personalAgain.accountId).toBe(personal.accountId)
  expect(personal.accountId).not.toBe(work.accountId)
  expect(
    database.query('SELECT COUNT(*) AS count FROM accounts').get(),
  ).toEqual({ count: 2 })
  expect(database.query('SELECT COUNT(*) AS count FROM grants').get()).toEqual({
    count: 2,
  })
  expect(
    current
      .readRequests()
      .every(
        (request) => !`${request.pathname}${request.search}`.includes('google'),
      ),
  ).toBe(true)

  const valuesBeforeFailure = new Map(store.values)
  current = startIdentity('work')
  current.setTokenMode('malformed')
  await expect(authorize()).rejects.toMatchObject({
    code: 'token_response_invalid',
  })
  expect(store.values).toEqual(valuesBeforeFailure)
  expect(database.query('SELECT COUNT(*) AS count FROM grants').get()).toEqual({
    count: 2,
  })

  current = startIdentity('work')
  current.setTokenMode('insufficient_scope')
  await expect(authorize()).rejects.toMatchObject({
    code: 'insufficient_scope',
  })
  expect(store.values).toEqual(valuesBeforeFailure)
  expect(database.query('SELECT COUNT(*) AS count FROM grants').get()).toEqual({
    count: 2,
  })

  current = startIdentity('malformed')
  await expect(authorize()).rejects.toMatchObject({
    code: 'identity_response_invalid',
  })
  expect(store.values).toEqual(valuesBeforeFailure)
  expect(database.query('SELECT COUNT(*) AS count FROM grants').get()).toEqual({
    count: 2,
  })
})
