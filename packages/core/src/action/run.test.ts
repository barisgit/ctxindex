import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import {
  type ActionContext,
  defineAdapter,
  defineExtension,
  defineProfile,
  type OAuthProviderDefinition,
  type RetrievedResource,
} from '@ctxindex/extension-sdk'
import { z } from 'zod'
import type { AuthService } from '../auth'
import { CtxindexAuthError, CtxindexError } from '../errors'
import { createExtensionRegistry } from '../registry'
import { ResourceStore } from '../resource'
import { applyPragmas } from '../storage'
import { runMigrations } from '../storage/migrator'
import { testOAuthProvider } from '../testing/oauth-provider'
import { runAction } from './run'

const sourceId = '01KXHBNECDAH1T4MJ38X88EPFJ'
const otherSourceId = '01KXHBNECDAH1T4MJ38X88EPFK'
const actionId = 'fake.message.draft.create'
const createDraftInput = z.object({
  subject: z.string().transform((value) => value.trim()),
})

test('propagates storage failures without relabeling them as Adapter results', async () => {
  const db = await freshDb()
  db.exec(`
      CREATE TRIGGER fail_action_write
      BEFORE INSERT ON resources
      BEGIN
        SELECT RAISE(ABORT, 'storage exploded');
      END
    `)
  const registry = registryWith(() => result())

  const error = await runAction(input(db, registry)).catch(
    (caught: unknown) => caught,
  )

  expect(String(error)).toContain('storage exploded')
  expect(error).not.toMatchObject({ code: 'invalid_action_result' })
  expect(resourceCount(db)).toBe(0)
})

test('does not automatically retry an Action fetch after 401', async () => {
  const provider = testOAuthProvider({
    id: 'google',
    authorizationUrl: 'https://accounts.example/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
  })
  const db = await freshDb({ provider, grantId: 'grant-once' })
  let tokenCalls = 0
  let fetchCalls = 0
  const registry = registryWith(
    async (context) => {
      const response = await context.fetch('https://provider.example/drafts')
      expect(response.status).toBe(401)
      return result()
    },
    { provider },
  )

  await runAction(
    input(db, registry, {
      authService: authService(async () => {
        tokenCalls += 1
        return 'token'
      }),
      fetch: async () => {
        fetchCalls += 1
        return new Response(null, { status: 401 })
      },
    }),
  )

  expect({ tokenCalls, fetchCalls }).toEqual({ tokenCalls: 1, fetchCalls: 1 })
})

test('reports a nonexistent Source as not found before auth or provider I/O', async () => {
  const db = await freshDb()
  let adapterCalls = 0
  let tokenCalls = 0
  let fetchCalls = 0
  const registry = registryWith(() => {
    adapterCalls += 1
    return result()
  })

  const error = await runAction(
    input(db, registry, {
      sourceId: otherSourceId,
      authService: authService(async () => {
        tokenCalls += 1
        return 'token'
      }),
      fetch: async () => {
        fetchCalls += 1
        return new Response()
      },
    }),
  ).catch((caught: unknown) => caught)

  expect(error).toMatchObject({
    code: 'not_found',
    message: `Source not found: ${otherSourceId}`,
  })
  expect({ adapterCalls, tokenCalls, fetchCalls }).toEqual({
    adapterCalls: 0,
    tokenCalls: 0,
    fetchCalls: 0,
  })
})
const outputProfile = defineProfile({
  id: 'fake.message',
  version: 1,
  schema: z.object({ subject: z.string(), provider: z.string() }),
  actions: {
    [actionId]: {
      effect: 'reversible',
      input: createDraftInput,
      output: { id: 'fake.message', version: 1 },
    },
  },
})
const logger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
}
const dbs: Database[] = []

afterEach(() => {
  for (const db of dbs.splice(0)) db.close(false)
})

async function freshDb(
  options: {
    adapterId?: string
    provider?: OAuthProviderDefinition
    grantId?: string
  } = {},
): Promise<Database> {
  const db = new Database(':memory:')
  dbs.push(db)
  applyPragmas(db)
  await runMigrations(db)
  db.prepare(
    "INSERT INTO realms (id, slug, label, created_at) VALUES ('realm-1', 'work', 'Work', 1)",
  ).run()
  if (options.grantId) {
    db.prepare(
      "INSERT INTO accounts (id, provider, label, external_user_id, created_at, updated_at) VALUES ('account-1', 'google', 'Test', 'subject-1', 1, 1)",
    ).run()
    db.prepare(
      `INSERT INTO grants (id, account_id, provider, scopes_json, app_config_ref, created_at, updated_at)
       VALUES (?, 'account-1', 'google', '["scope:draft"]', 'secret://test/app', 1, 1)`,
    ).run(options.grantId)
  }
  db.prepare(
    `INSERT INTO sources
       (id, realm_id, label, adapter_id, grant_id, config_json, sync_enabled, created_at, updated_at)
     VALUES (?, 'realm-1', 'Action Source', ?, ?, '{}', 1, 1, 1)`,
  ).run(sourceId, options.adapterId ?? 'fake.actions', options.grantId ?? null)
  return db
}

function result(overrides: Partial<RetrievedResource> = {}): RetrievedResource {
  return {
    ref: `ctx://${sourceId}/draft/one`,
    profile: { id: 'fake.message', version: 1 },
    title: 'Provider draft',
    summary: 'Draft summary',
    occurredAt: 123,
    providerUpdatedAt: 456,
    payload: { subject: 'Hello', provider: 'fake' },
    ...overrides,
  }
}

function registryWith(
  run?: (
    context: ActionContext<{ subject: string }>,
  ) => RetrievedResource | Promise<RetrievedResource>,
  options: {
    provider?: OAuthProviderDefinition
    adapterId?: string
    effect?: 'reversible' | 'irreversible'
  } = {},
) {
  const profile = defineProfile({
    ...outputProfile,
    actions: {
      [actionId]: {
        effect: options.effect ?? 'reversible',
        input: createDraftInput,
        output: { id: 'fake.message', version: 1 },
      },
    },
  })
  const definition = {
    id: options.adapterId ?? 'fake.actions',
    configSchema: z.object({}).strict(),
    profiles: [profile],
    routing: 'indexed',
    capabilities: [],
    operations: {},
    actions: run
      ? {
          [actionId]: {
            profile,
            input: createDraftInput,
            output: profile,
            run,
          },
        }
      : {},
  } as const
  const adapter = options.provider
    ? defineAdapter({
        ...definition,
        provider: options.provider,
        access: { scopes: ['scope:draft'] },
        providerApiHosts: ['provider.example'],
      })
    : defineAdapter(definition)
  return createExtensionRegistry([
    defineExtension({
      id: `extension.${adapter.id}`,
      profiles: [profile],
      adapters: [adapter],
    }),
  ])
}

function authService(
  resolve: AuthService['resolveLinkedGrantAccessToken'] = async () => {
    throw new Error('token resolution must not run')
  },
): Pick<AuthService, 'resolveLinkedGrantAccessToken'> {
  return { resolveLinkedGrantAccessToken: resolve }
}

function input(
  db: Database,
  registry: ReturnType<typeof registryWith>,
  overrides: Record<string, unknown> = {},
) {
  return {
    db,
    registry,
    actionId,
    sourceId,
    actionInput: { subject: ' Hello ' },
    authService: authService(),
    logger,
    signal: new AbortController().signal,
    ...overrides,
  }
}

function resourceCount(db: Database): number {
  return (
    db.prepare('SELECT COUNT(*) AS count FROM resources').get() as {
      count: number
    }
  ).count
}

describe('runAction', () => {
  test('validates and transforms complete input before auth, Adapter, or provider I/O', async () => {
    const db = await freshDb()
    let adapterCalls = 0
    let tokenCalls = 0
    let fetchCalls = 0
    const registry = registryWith(() => {
      adapterCalls += 1
      return result()
    })

    const error = await runAction(
      input(db, registry, {
        actionInput: { subject: 42 },
        authService: authService(async () => {
          tokenCalls += 1
          return 'token'
        }),
        fetch: async () => {
          fetchCalls += 1
          return new Response()
        },
      }),
    ).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'invalid_action_input' })
    expect({ adapterCalls, tokenCalls, fetchCalls }).toEqual({
      adapterCalls: 0,
      tokenCalls: 0,
      fetchCalls: 0,
    })
    expect(resourceCount(db)).toBe(0)
  })

  test('rejects unknown Actions as typed usage errors before Source resolution', async () => {
    const db = await freshDb({ adapterId: 'missing.adapter' })
    const registry = registryWith(() => result())
    const error = await runAction(
      input(db, registry, { actionId: 'fake.unknown' }),
    ).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'unknown_action' })
    expect(resourceCount(db)).toBe(0)
  })

  test('reports an unsupported Source and available implementing Adapters without I/O', async () => {
    const db = await freshDb()
    let adapterCalls = 0
    const unsupported = registryWith(undefined)
    const error = await runAction(input(db, unsupported)).catch(
      (caught: unknown) => caught,
    )
    expect(error).toMatchObject({ code: 'action_unsupported' })
    expect(String(error)).toContain(actionId)
    expect(String(error)).toContain(sourceId)
    expect(String(error)).toContain('fake.actions')
    expect(adapterCalls).toBe(0)

    const unavailableDb = await freshDb({ adapterId: 'missing.adapter' })
    const available = registryWith(
      (context) => {
        adapterCalls += 1
        return result({ ref: `ctx://${context.source.id}/draft/one` })
      },
      { adapterId: 'fake.available' },
    )
    const unavailable = await runAction(input(unavailableDb, available)).catch(
      (caught: unknown) => caught,
    )
    expect(unavailable).toMatchObject({ code: 'action_unsupported' })
    expect(String(unavailable)).toContain('missing.adapter')
    expect(String(unavailable)).toContain('fake.available')
    expect(adapterCalls).toBe(0)
  })

  test('requires explicit confirmation for irreversible Actions before I/O', async () => {
    const db = await freshDb()
    let adapterCalls = 0
    let tokenCalls = 0
    let fetchCalls = 0
    const registry = registryWith(
      () => {
        adapterCalls += 1
        return result()
      },
      { effect: 'irreversible' },
    )
    const options = {
      authService: authService(async () => {
        tokenCalls += 1
        return 'token'
      }),
      fetch: async () => {
        fetchCalls += 1
        return new Response()
      },
    }

    const error = await runAction(input(db, registry, options)).catch(
      (caught: unknown) => caught,
    )
    expect(error).toMatchObject({ code: 'confirmation_required' })
    expect({ adapterCalls, tokenCalls, fetchCalls }).toEqual({
      adapterCalls: 0,
      tokenCalls: 0,
      fetchCalls: 0,
    })
    expect(resourceCount(db)).toBe(0)

    const confirmed = await runAction(
      input(db, registry, { ...options, confirmIrreversible: true }),
    )
    expect(confirmed.resource.ref).toBe(`ctx://${sourceId}/draft/one`)
    expect(adapterCalls).toBe(1)
  })

  test('passes parsed input and the exact auth-bound Source provider context once', async () => {
    const provider = testOAuthProvider({
      id: 'google',
      authorizationUrl: 'https://accounts.example/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
    })
    const db = await freshDb({ provider, grantId: 'grant-exact' })
    let adapterCalls = 0
    const tokenGrants: string[] = []
    const registry = registryWith(
      async (context) => {
        adapterCalls += 1
        expect(context.input).toEqual({ subject: 'Hello' })
        expect(context.source).toEqual({ id: sourceId, config: {} })
        expect(context.signal).toBeInstanceOf(AbortSignal)
        const response = await context.fetch('https://provider.example/drafts')
        expect(response.status).toBe(200)
        return result({
          payload: { subject: context.input.subject, provider: 'fake' },
        })
      },
      { provider },
    )

    const value = await runAction(
      input(db, registry, {
        authService: authService(async (grantId) => {
          tokenGrants.push(grantId)
          return 'exact-token'
        }),
        fetch: async (_url: string | URL | Request, init?: RequestInit) => {
          expect(new Headers(init?.headers).get('authorization')).toBe(
            'Bearer exact-token',
          )
          return new Response(null, { status: 200 })
        },
      }),
    )

    expect(adapterCalls).toBe(1)
    expect(tokenGrants).toEqual(['grant-exact'])
    expect(value.resource.payload).toEqual({
      subject: 'Hello',
      provider: 'fake',
    })
  })

  test('provides a Source-scoped local Resource resolver before provider I/O', async () => {
    const provider = testOAuthProvider({
      id: 'google',
      authorizationUrl: 'https://accounts.example/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
    })
    const db = await freshDb({ provider, grantId: 'grant-local-resolver' })
    let tokenCalls = 0
    let fetchCalls = 0
    const registry = registryWith(
      (context) => {
        expect({ tokenCalls, fetchCalls }).toEqual({
          tokenCalls: 0,
          fetchCalls: 0,
        })
        expect(
          context.resolveResource(`ctx://${sourceId}/message/parent`),
        ).toMatchObject({
          ref: `ctx://${sourceId}/message/parent`,
          sourceId,
          profile: { id: 'fake.message', version: 1 },
          completeness: 'complete',
          deletedAt: null,
          payload: { subject: 'Parent', provider: 'fake' },
        })
        expect(
          context.resolveResource(`ctx://${sourceId}/message/missing`),
        ).toBeNull()
        expect(() =>
          context.resolveResource(`ctx://${otherSourceId}/message/parent`),
        ).toThrow(/does not belong to Source/)
        expect({ tokenCalls, fetchCalls }).toEqual({
          tokenCalls: 0,
          fetchCalls: 0,
        })
        return result()
      },
      { provider },
    )
    const store = new ResourceStore(db, registry.profiles)
    store.upsert({
      ref: `ctx://${sourceId}/message/parent`,
      sourceId,
      profile: { id: 'fake.message', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      payload: { subject: 'Parent', provider: 'fake' },
    })

    await runAction(
      input(db, registry, {
        authService: authService(async () => {
          tokenCalls += 1
          return 'token'
        }),
        fetch: async () => {
          fetchCalls += 1
          return new Response()
        },
      }),
    )

    expect({ tokenCalls, fetchCalls }).toEqual({ tokenCalls: 0, fetchCalls: 0 })
  })

  test.each([
    [
      'wrong output Profile',
      () => result({ profile: { id: 'fake.other', version: 1 } }),
    ],
    [
      'cross-Source Ref',
      () => result({ ref: `ctx://${otherSourceId}/draft/one` }),
    ],
    [
      'absent payload',
      () => {
        const value = result() as unknown as Record<string, unknown>
        delete value.payload
        return value
      },
    ],
    [
      'invalid payload',
      () => result({ payload: { subject: 42, provider: 'fake' } }),
    ],
  ])('rejects %s without writing', async (_name, returned) => {
    const db = await freshDb()
    const registry = registryWith(() => returned() as RetrievedResource)
    const error = await runAction(input(db, registry)).catch(
      (caught: unknown) => caught,
    )

    expect(error).toMatchObject({ code: 'invalid_action_result' })
    expect(resourceCount(db)).toBe(0)
  })

  test('materializes the exact provider envelope as complete adhoc and preserves synced origin', async () => {
    const db = await freshDb()
    const registry = registryWith(() => result())
    const store = new ResourceStore(db, registry.profiles)
    store.upsert({
      ref: `ctx://${sourceId}/draft/one`,
      sourceId,
      profile: { id: 'fake.message', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      payload: { subject: 'Old', provider: 'fake' },
    })

    const value = await runAction(input(db, registry))

    expect(value.warnings).toEqual([])
    expect(value.resource).toMatchObject({
      ref: `ctx://${sourceId}/draft/one`,
      sourceId,
      profile: { id: 'fake.message', version: 1 },
      origin: 'synced',
      title: 'Provider draft',
      summary: 'Draft summary',
      occurredAt: 123,
      providerUpdatedAt: 456,
      payload: { subject: 'Hello', provider: 'fake' },
      hydratedAt: expect.any(Number),
    })
    expect(resourceCount(db)).toBe(1)
  })

  test('propagates typed provider and auth errors unchanged', async () => {
    const db = await freshDb()
    const providerError = new CtxindexError(
      'provider rejected draft',
      'permission_denied',
    )
    const providerRegistry = registryWith(() => {
      throw providerError
    })
    expect(
      await runAction(input(db, providerRegistry)).catch((error) => error),
    ).toBe(providerError)

    const provider = testOAuthProvider({
      id: 'google',
      authorizationUrl: 'https://accounts.example/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
    })
    const authDb = await freshDb({ provider, grantId: 'grant-auth' })
    const authRegistry = registryWith(
      async (context) => {
        await context.fetch('https://provider.example/drafts')
        return result()
      },
      { provider },
    )
    const authError = new CtxindexAuthError(
      'token_refresh_failed',
      'refresh failed',
    )
    const caught = await runAction(
      input(authDb, authRegistry, {
        authService: authService(async () => {
          throw authError
        }),
      }),
    ).catch((error) => error)
    expect(caught).toMatchObject({ code: 'token_refresh_failed' })
    expect(resourceCount(authDb)).toBe(0)
  })
})
