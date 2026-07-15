import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { runAction } from '@ctxindex/core/action'
import type { AuthService } from '@ctxindex/core/auth'
import { createExtensionRegistry } from '@ctxindex/core/registry'
import { getSourceResource } from '@ctxindex/core/source'
import { applyPragmas, runMigrations } from '@ctxindex/core/storage'
import { CTXINDEX_BUILTIN_EXTENSIONS } from './builtins'

const sourceId = '01KXHBNECDAH1T4MJ38X88EPFJ'
const createActionId = 'communication.message.draft.create'
const updateActionId = 'communication.message.draft.update'
const scopes = [
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.readonly',
]
const logger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
}
const registry = createExtensionRegistry(CTXINDEX_BUILTIN_EXTENSIONS)
const dbs: Database[] = []

afterEach(() => {
  for (const db of dbs.splice(0)) db.close(false)
})

async function freshDb(): Promise<Database> {
  const db = new Database(':memory:')
  dbs.push(db)
  applyPragmas(db)
  await runMigrations(db)
  db.prepare(
    "INSERT INTO realms (id, slug, label, created_at) VALUES ('realm-1', 'work', 'Work', 1)",
  ).run()
  db.prepare(
    "INSERT INTO accounts (id, provider, label, created_at, updated_at) VALUES ('account-1', 'google', 'Test', 1, 1)",
  ).run()
  db.prepare(
    `INSERT INTO grants (id, account_id, provider, scopes_json, created_at, updated_at)
     VALUES ('grant-1', 'account-1', 'google', ?, 1, 1)`,
  ).run(JSON.stringify(scopes))
  db.prepare(
    `INSERT INTO sources
       (id, realm_id, adapter_id, adapter_version, grant_id, config_json, sync_enabled, created_at, updated_at)
     VALUES (?, 'realm-1', 'google.mailbox', 1, 'grant-1', '{}', 1, 1, 1)`,
  ).run(sourceId)
  return db
}

function authService(
  onToken: () => void,
): Pick<AuthService, 'resolveLinkedGrantAccessToken'> {
  return {
    async resolveLinkedGrantAccessToken(grantId) {
      expect(grantId).toBe('grant-1')
      onToken()
      return 'access-token'
    },
  }
}

function resourceCount(db: Database): number {
  return (
    db.prepare('SELECT COUNT(*) AS count FROM resources').get() as {
      count: number
    }
  ).count
}

describe('Gmail Draft Action integration', () => {
  test.each([
    {
      ref: `ctx://${sourceId}/draft/stable-draft-id`,
      to: ['to@example.com\r\nBcc: injected@example.com'],
      subject: '',
      bodyText: '',
    },
    { to: ['to@example.com'], subject: '', bodyText: '' },
    {
      ref: `ctx://${sourceId}/draft/stable-draft-id`,
      subject: '',
      bodyText: '',
    },
  ])('rejects malformed, missing, or incomplete update input before Adapter I/O', async (actionInput) => {
    const db = await freshDb()
    let tokenCalls = 0
    let fetchCalls = 0

    const error = await runAction({
      db,
      registry,
      authService: authService(() => {
        tokenCalls += 1
      }),
      logger,
      actionId: updateActionId,
      sourceId,
      actionInput,
      signal: new AbortController().signal,
      fetch: (async () => {
        fetchCalls += 1
        throw new Error('must not fetch')
      }) as unknown as typeof fetch,
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'invalid_action_input' })
    expect({ tokenCalls, fetchCalls, resources: resourceCount(db) }).toEqual({
      tokenCalls: 0,
      fetchCalls: 0,
      resources: 0,
    })
  })

  test('creates then completely replaces the same stable Draft Resource with one PUT and cached get', async () => {
    const db = await freshDb()
    let tokenCalls = 0
    let fetchCalls = 0
    const providerFetch = (async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      fetchCalls += 1
      expect(new Headers(init?.headers).get('authorization')).toBe(
        'Bearer access-token',
      )
      if (fetchCalls === 1) {
        expect(input.toString()).toBe(
          'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
        )
        expect(init?.method).toBe('POST')
        return Response.json({
          id: 'stable-draft-id',
          message: {
            id: 'message-id-1',
            threadId: 'thread-1',
            labelIds: ['DRAFT'],
          },
        })
      }
      expect(input.toString()).toBe(
        'https://gmail.googleapis.com/gmail/v1/users/me/drafts/stable-draft-id',
      )
      expect(init?.method).toBe('PUT')
      return Response.json({
        id: 'stable-draft-id',
        message: {
          id: 'message-id-2',
          threadId: 'thread-2',
          labelIds: ['DRAFT', 'UNREAD'],
        },
      })
    }) as unknown as typeof fetch
    const auth = authService(() => {
      tokenCalls += 1
    })

    const result = await runAction({
      db,
      registry,
      authService: auth,
      logger,
      actionId: createActionId,
      sourceId,
      actionInput: {
        to: ['to@example.com'],
        subject: 'Draft subject',
        bodyText: 'Draft body',
      },
      signal: new AbortController().signal,
      fetch: providerFetch,
    })

    const ref = `ctx://${sourceId}/draft/stable-draft-id`
    expect({ tokenCalls, fetchCalls }).toEqual({ tokenCalls: 1, fetchCalls: 1 })
    expect(result.warnings).toEqual([])
    expect(result.resource).toMatchObject({
      ref,
      sourceId,
      profile: { id: 'communication.message', version: 1 },
      origin: 'adhoc',
      title: 'Draft subject',
      payload: {
        providerDraftId: 'stable-draft-id',
        providerMessageId: 'message-id-1',
      },
      hydratedAt: expect.any(Number),
    })
    expect(resourceCount(db)).toBe(1)

    const updated = await runAction({
      db,
      registry,
      authService: auth,
      logger,
      actionId: updateActionId,
      sourceId,
      actionInput: {
        ref,
        to: ['replacement@example.com'],
        subject: 'Replacement subject',
        bodyText: 'Replacement body',
      },
      signal: new AbortController().signal,
      fetch: providerFetch,
    })

    expect({ tokenCalls, fetchCalls }).toEqual({ tokenCalls: 2, fetchCalls: 2 })
    expect(updated.warnings).toEqual([])
    expect(updated.resource).toMatchObject({
      ref,
      sourceId,
      origin: 'adhoc',
      title: 'Replacement subject',
      payload: {
        providerDraftId: 'stable-draft-id',
        providerMessageId: 'message-id-2',
        to: ['replacement@example.com'],
        cc: [],
        bcc: [],
        subject: 'Replacement subject',
        bodyText: 'Replacement body',
        threadId: 'thread-2',
        conversationKey: `${sourceId}:thread-2`,
        labels: ['DRAFT', 'UNREAD'],
        unread: true,
      },
    })
    expect(resourceCount(db)).toBe(1)

    const cached = await getSourceResource({
      db,
      ref,
      registry,
      authService: auth,
      logger,
      signal: new AbortController().signal,
      fetch: providerFetch,
    })
    expect(cached.resource).toMatchObject({
      ref,
      title: 'Replacement subject',
      payload: {
        providerMessageId: 'message-id-2',
        to: ['replacement@example.com'],
        cc: [],
        bcc: [],
      },
    })
    expect({ tokenCalls, fetchCalls }).toEqual({ tokenCalls: 2, fetchCalls: 2 })
  })

  test('materializes an addressed provider Draft that was absent locally', async () => {
    const db = await freshDb()
    let fetchCalls = 0
    const ref = `ctx://${sourceId}/draft/provider-only`

    const result = await runAction({
      db,
      registry,
      authService: authService(() => {}),
      logger,
      actionId: updateActionId,
      sourceId,
      actionInput: {
        ref,
        to: ['replacement@example.com'],
        subject: 'Provider only',
        bodyText: 'Now materialized',
      },
      signal: new AbortController().signal,
      fetch: (async () => {
        fetchCalls += 1
        return Response.json({
          id: 'provider-only',
          message: { id: 'message-id-2' },
        })
      }) as unknown as typeof fetch,
    })

    expect(result.resource.ref).toBe(ref)
    expect(fetchCalls).toBe(1)
    expect(resourceCount(db)).toBe(1)
  })

  test('foreign-source Draft Ref performs no provider fetch or Resource write', async () => {
    const db = await freshDb()
    let fetchCalls = 0
    const error = await runAction({
      db,
      registry,
      authService: authService(() => {}),
      logger,
      actionId: updateActionId,
      sourceId,
      actionInput: {
        ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFK/draft/stable-draft-id',
        to: ['replacement@example.com'],
        subject: '',
        bodyText: '',
      },
      signal: new AbortController().signal,
      fetch: (async () => {
        fetchCalls += 1
        throw new Error('must not fetch')
      }) as unknown as typeof fetch,
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'ref_source_mismatch' })
    expect(fetchCalls).toBe(0)
    expect(resourceCount(db)).toBe(0)
  })

  test('lowercase same-Source authority performs no provider fetch or Resource write', async () => {
    const db = await freshDb()
    let fetchCalls = 0
    const error = await runAction({
      db,
      registry,
      authService: authService(() => {}),
      logger,
      actionId: updateActionId,
      sourceId,
      actionInput: {
        ref: `ctx://${sourceId.toLowerCase()}/draft/stable-draft-id`,
        to: ['replacement@example.com'],
        subject: '',
        bodyText: '',
      },
      signal: new AbortController().signal,
      fetch: (async () => {
        fetchCalls += 1
        throw new Error('must not fetch')
      }) as unknown as typeof fetch,
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'invalid_ref' })
    expect(fetchCalls).toBe(0)
    expect(resourceCount(db)).toBe(0)
  })
})
