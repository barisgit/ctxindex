import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { defineAdapter, defineExtension } from '@ctxindex/extension-sdk'
import { z } from 'zod'
import type { AuthService } from '../auth'
import { CtxindexAuthError } from '../errors'
import { createExtensionRegistry } from '../registry'
import { applyPragmas } from '../storage'
import { runMigrations } from '../storage/migrator'
import { createSourceProviderContext } from './provider-context'

const scope = 'scope:read'
const adapter = defineAdapter({
  id: 'test.oauth',
  version: 1,
  configSchema: z
    .object({
      safe: z.string().optional(),
      access_token: z.string().optional(),
      client_secret: z.string().optional(),
    })
    .strict(),
  auth: {
    kind: 'oauth2',
    provider: {
      authUrl: 'https://accounts.google.com/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
    },
    scopes: [scope],
  },
  profiles: [],
  routing: 'indexed',
  capabilities: [],
  operations: {},
  actions: {},
})
const registry = createExtensionRegistry([
  defineExtension({
    id: 'test.oauth-extension',
    version: 1,
    profiles: [],
    adapters: [adapter],
  }),
])

const dbs: Database[] = []

async function freshDb(): Promise<Database> {
  const db = new Database(':memory:')
  dbs.push(db)
  applyPragmas(db)
  await runMigrations(db)
  const now = Date.now()
  db.prepare(
    `INSERT INTO realms (id, slug, label, created_at)
     VALUES ('realm-1', 'personal', 'Personal', ?)`,
  ).run(now)
  return db
}

function insertGrant(
  db: Database,
  id: string,
  options: { provider?: string; scopes?: string } = {},
): void {
  const now = Date.now()
  const accountId = `account-${id}`
  db.prepare(
    `INSERT INTO accounts (id, provider, label, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(accountId, options.provider ?? 'google', id, now, now)
  db.prepare(
    `INSERT INTO grants
       (id, account_id, provider, scopes_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    accountId,
    options.provider ?? 'google',
    options.scopes ?? scope,
    now,
    now,
  )
}

function insertSource(
  db: Database,
  grantId: string | null,
  config: unknown = {},
): void {
  const now = Date.now()
  db.prepare(
    `INSERT INTO sources
       (id, realm_id, adapter_id, adapter_version, grant_id, config_json, sync_enabled, created_at, updated_at)
     VALUES ('source-1', 'realm-1', 'test.oauth', 1, ?, ?, 1, ?, ?)`,
  ).run(grantId, JSON.stringify(config), now, now)
}

function authService(
  resolve: AuthService['resolveLinkedGrantAccessToken'],
): Pick<AuthService, 'resolveLinkedGrantAccessToken'> {
  return {
    resolveLinkedGrantAccessToken: resolve,
  }
}

const logger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close()
})

describe('createSourceProviderContext', () => {
  test('uses only the Source linked Grant even when a newer Grant exists', async () => {
    const db = await freshDb()
    insertGrant(db, 'grant-b')
    insertGrant(db, 'grant-a')
    insertSource(db, 'grant-b')
    const seen: string[] = []
    const context = await createSourceProviderContext({
      db,
      sourceId: 'source-1',
      registry,
      authService: authService(async (id) => `token-${id}`),
      logger,
      fetch: async (_url, init) => {
        seen.push(new Headers(init?.headers).get('authorization') ?? '')
        return new Response(null, { status: 200 })
      },
    })

    await context.fetch('https://provider.example/messages')
    expect(seen).toEqual(['Bearer token-grant-b'])
  })

  test('rejects missing and incompatible Grants before provider HTTP', async () => {
    for (const setup of ['missing', 'incompatible'] as const) {
      const db = await freshDb()
      if (setup === 'incompatible') {
        insertGrant(db, 'grant-1', { scopes: 'scope:other' })
        insertSource(db, 'grant-1')
      } else {
        insertSource(db, null)
      }
      let calls = 0
      const create = createSourceProviderContext({
        db,
        sourceId: 'source-1',
        registry,
        authService: authService(async () => 'token'),
        logger,
        fetch: async () => {
          calls += 1
          return new Response()
        },
      })

      await expect(create).rejects.toMatchObject({ code: 'needs_auth' })
      expect(calls).toBe(0)
    }
  })

  test('refreshes and retries exactly once after provider 401', async () => {
    const db = await freshDb()
    insertGrant(db, 'grant-b')
    insertSource(db, 'grant-b')
    const resolutions: Array<{ id: string; forceRefresh: boolean }> = []
    const seen: string[] = []
    const context = await createSourceProviderContext({
      db,
      sourceId: 'source-1',
      registry,
      authService: authService(async (id, options) => {
        resolutions.push({ id, forceRefresh: options?.forceRefresh ?? false })
        return options?.forceRefresh ? 'fresh-token' : 'expired-token'
      }),
      logger,
      fetch: async (_url, init) => {
        seen.push(new Headers(init?.headers).get('authorization') ?? '')
        return new Response(null, { status: seen.length === 1 ? 401 : 200 })
      },
    })

    expect(
      (await context.fetch('https://provider.example/messages')).status,
    ).toBe(200)
    expect(seen).toEqual(['Bearer expired-token', 'Bearer fresh-token'])
    expect(resolutions).toEqual([
      { id: 'grant-b', forceRefresh: false },
      { id: 'grant-b', forceRefresh: true },
    ])
  })

  test('config token fields cannot override Authorization or enter source context', async () => {
    const db = await freshDb()
    insertGrant(db, 'grant-b')
    insertSource(db, 'grant-b', {
      safe: 'visible',
      access_token: 'cursor-token',
      client_secret: 'client-secret-canary',
    })
    let authorization = ''
    const context = await createSourceProviderContext({
      db,
      sourceId: 'source-1',
      registry,
      authService: authService(async () => 'grant-token'),
      logger,
      fetch: async (_url, init) => {
        authorization = new Headers(init?.headers).get('authorization') ?? ''
        return new Response()
      },
    })

    expect(context.source.config).toEqual({ safe: 'visible' })
    await context.fetch('https://provider.example/messages', {
      headers: { authorization: 'Bearer cursor-token' },
    })
    expect(authorization).toBe('Bearer grant-token')
  })

  test('maps revoked Grant failures without leaking tokens or client secrets', async () => {
    const db = await freshDb()
    insertGrant(db, 'grant-b')
    insertSource(db, 'grant-b', { safe: 'visible' })
    let providerCalls = 0
    const logs: unknown[] = []
    const recordingLogger = {
      trace: (...args: unknown[]) => logs.push(args),
      debug: (...args: unknown[]) => logs.push(args),
      info: (...args: unknown[]) => logs.push(args),
      warn: (...args: unknown[]) => logs.push(args),
      error: (...args: unknown[]) => logs.push(args),
    }
    const context = await createSourceProviderContext({
      db,
      sourceId: 'source-1',
      registry,
      authService: authService(async () => {
        throw new CtxindexAuthError(
          'invalid_grant',
          'revoked token-secret-canary client-secret-canary',
        )
      }),
      logger: recordingLogger,
      fetch: async () => {
        providerCalls += 1
        return new Response()
      },
    })

    const error = await context
      .fetch('https://provider.example/messages')
      .catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'needs_auth' })
    expect(String(error)).not.toContain('token-secret-canary')
    expect(String(error)).not.toContain('client-secret-canary')
    expect(JSON.stringify(logs)).not.toContain('token-secret-canary')
    expect(JSON.stringify(logs)).not.toContain('client-secret-canary')
    expect(providerCalls).toBe(0)
  })

  test('preserves sanitized network auth failures during token resolution', async () => {
    const db = await freshDb()
    insertGrant(db, 'grant-b')
    insertSource(db, 'grant-b')
    const context = await createSourceProviderContext({
      db,
      sourceId: 'source-1',
      registry,
      authService: authService(async () => {
        throw new CtxindexAuthError(
          'network_error',
          'refresh failed with token-secret-canary',
        )
      }),
      logger,
      fetch: async () => new Response(),
    })

    const error = await context
      .fetch('https://provider.example/messages')
      .catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'network_error' })
    expect(String(error)).not.toContain('token-secret-canary')
  })

  test('preserves typed egress-policy denial instead of classifying it as network', async () => {
    const db = await freshDb()
    insertGrant(db, 'grant-b')
    insertSource(db, 'grant-b')
    const context = await createSourceProviderContext({
      db,
      sourceId: 'source-1',
      registry,
      authService: authService(async () => 'grant-token'),
      logger,
    })

    const error = await context
      .fetch('https://not-allowlisted.example/messages')
      .catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'egress_denied' })
    expect(error).not.toMatchObject({ code: 'network' })
  })

  test('classifies an actual provider transport failure as network', async () => {
    const db = await freshDb()
    insertGrant(db, 'grant-b')
    insertSource(db, 'grant-b')
    const context = await createSourceProviderContext({
      db,
      sourceId: 'source-1',
      registry,
      authService: authService(async () => 'grant-token'),
      logger,
      fetch: async () => {
        throw new TypeError('connection reset')
      },
    })

    const error = await context
      .fetch('https://provider.example/messages')
      .catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'network' })
  })

  test('propagates provider cancellation instead of classifying it as network', async () => {
    const db = await freshDb()
    insertGrant(db, 'grant-b')
    insertSource(db, 'grant-b')
    const controller = new AbortController()
    controller.abort(new DOMException('cancelled', 'AbortError'))
    const context = await createSourceProviderContext({
      db,
      sourceId: 'source-1',
      registry,
      authService: authService(async () => 'grant-token'),
      logger,
      fetch: async (_url, init) => {
        init?.signal?.throwIfAborted()
        return new Response()
      },
    })

    const error = await context
      .fetch('https://provider.example/messages', {
        signal: controller.signal,
      })
      .catch((caught: unknown) => caught)

    expect(error).toMatchObject({ name: 'AbortError' })
    expect(error).not.toMatchObject({ code: 'network' })
  })
})
