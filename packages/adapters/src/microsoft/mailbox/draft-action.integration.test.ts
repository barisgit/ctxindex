import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { runAction } from '@ctxindex/core/action'
import type { AuthService } from '@ctxindex/core/auth'
import { createExtensionRegistry } from '@ctxindex/core/registry'
import { applyPragmas, runMigrations } from '@ctxindex/core/storage'
import { CTXINDEX_BUILTIN_EXTENSIONS } from '../../builtins'
import { microsoftDraftCreate, microsoftDraftUpdate } from './draft'
import { IMMUTABLE_ID_PREFERENCE, TEXT_BODY_PREFERENCE } from './transport'

const sourceId = '01KXHBNECDAH1T4MJ38X88EPFJ'
const createActionId = 'communication.message.draft.create'
const updateActionId = 'communication.message.draft.update'
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
    "INSERT INTO accounts (id, provider, label, external_user_id, created_at, updated_at) VALUES ('account-1', 'microsoft', 'Work', 'subject-1', 1, 1)",
  ).run()
  db.prepare(
    `INSERT INTO grants (id, account_id, provider, scopes_json, created_at, updated_at)
     VALUES ('grant-1', 'account-1', 'microsoft', ?, 1, 1)`,
  ).run(JSON.stringify(['Mail.ReadWrite', 'User.Read']))
  db.prepare(
    `INSERT INTO sources
       (id, realm_id, label, adapter_id, adapter_version, grant_id, config_json, sync_enabled, created_at, updated_at)
     VALUES (?, 'realm-1', 'Microsoft Mailbox Fixture', 'microsoft.mailbox', 1, 'grant-1', '{}', 1, 1, 1)`,
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

function graphDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'immutable-draft/id',
    conversationId: 'conversation-1',
    internetMessageId: '<draft@example.test>',
    subject: 'Project update',
    bodyPreview: 'Draft body',
    body: { contentType: 'text', content: 'Draft body' },
    from: null,
    toRecipients: [{ emailAddress: { address: 'recipient@example.test' } }],
    ccRecipients: [],
    bccRecipients: [],
    receivedDateTime: null,
    sentDateTime: null,
    lastModifiedDateTime: '2026-07-16T10:00:00.000Z',
    isRead: true,
    isDraft: true,
    categories: [],
    hasAttachments: false,
    ...overrides,
  }
}

describe('Microsoft Outlook Draft Actions', () => {
  test('direct create rejects invalid complete input before provider I/O', async () => {
    let fetchCalls = 0
    const error = await microsoftDraftCreate({
      source: {
        id: sourceId,
        config: {},
      },
      input: {
        to: ['recipient@example.test\r\nBcc: injected@example.test'],
        subject: '',
        bodyText: '',
      },
      fetch: (async () => {
        fetchCalls += 1
        throw new Error('must not fetch')
      }) as unknown as typeof fetch,
      logger,
      signal: new AbortController().signal,
      resolveResource: () => null,
      resolveArtifact: async () => null,
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'invalid_action_input' })
    expect(fetchCalls).toBe(0)
  })

  test('direct create rejects malformed Graph recipient syntax before provider I/O', async () => {
    let fetchCalls = 0
    const error = await microsoftDraftCreate({
      source: { id: sourceId, config: {} },
      input: {
        to: ['Malformed <recipient@example.test'],
        subject: '',
        bodyText: '',
      },
      fetch: (async () => {
        fetchCalls += 1
        throw new Error('must not fetch')
      }) as unknown as typeof fetch,
      logger,
      signal: new AbortController().signal,
      resolveResource: () => null,
      resolveArtifact: async () => null,
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'invalid_action_input' })
    expect(fetchCalls).toBe(0)
  })

  test('runAction rejects malformed create input before auth, provider, or local state', async () => {
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
      actionId: createActionId,
      sourceId,
      actionInput: {
        to: ['recipient@example.test'],
        subject: '',
        bodyText: '',
        unexpected: true,
      },
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

  test('creates one provider Draft and materializes its complete stable Resource without a follow-up', async () => {
    const db = await freshDb()
    let tokenCalls = 0
    let fetchCalls = 0

    const result = await runAction({
      db,
      registry,
      authService: authService(() => {
        tokenCalls += 1
      }),
      logger,
      actionId: createActionId,
      sourceId,
      actionInput: {
        to: ['recipient@example.test'],
        subject: 'Project update',
        bodyText: 'Draft body',
      },
      signal: new AbortController().signal,
      fetch: (async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        fetchCalls += 1
        expect(input.toString()).toBe(
          'https://graph.microsoft.com/v1.0/me/messages',
        )
        expect(init?.method).toBe('POST')
        const headers = new Headers(init?.headers)
        expect(headers.get('authorization')).toBe('Bearer access-token')
        expect(headers.get('prefer')).toContain(IMMUTABLE_ID_PREFERENCE)
        expect(headers.get('prefer')).toBe(TEXT_BODY_PREFERENCE)
        expect(headers.get('content-type')).toBe('application/json')
        expect(JSON.parse(init?.body as string)).toEqual({
          subject: 'Project update',
          body: { contentType: 'Text', content: 'Draft body' },
          toRecipients: [
            { emailAddress: { address: 'recipient@example.test' } },
          ],
          ccRecipients: [],
          bccRecipients: [],
        })
        return Response.json(graphDraft(), { status: 201 })
      }) as unknown as typeof fetch,
    })

    const ref = `ctx://${sourceId}/draft/immutable-draft%2Fid`
    expect({ tokenCalls, fetchCalls, resources: resourceCount(db) }).toEqual({
      tokenCalls: 1,
      fetchCalls: 1,
      resources: 1,
    })
    expect(result.warnings).toEqual([])
    expect(result.resource).toMatchObject({
      ref,
      sourceId,
      profile: { id: 'communication.message', version: 1 },
      origin: 'adhoc',
      title: 'Project update',
      providerUpdatedAt: Date.parse('2026-07-16T10:00:00.000Z'),
      payload: {
        providerMessageId: 'immutable-draft/id',
        providerDraftId: 'immutable-draft/id',
        to: ['recipient@example.test'],
        cc: [],
        bcc: [],
        subject: 'Project update',
        bodyText: 'Draft body',
        unread: false,
      },
    })
  })

  test('preserves non-ASCII text and all recipient lists in the one create request and response', async () => {
    let fetchCalls = 0
    const result = await microsoftDraftCreate({
      source: {
        id: sourceId,
        config: {},
      },
      input: {
        to: ['Tø Person <to@example.test>'],
        cc: ['čc@example.test'],
        bcc: ['密@example.test'],
        subject: 'Pozdrav živjo',
        bodyText: 'Telo sporočila: 日本語',
      },
      fetch: (async (
        _input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        fetchCalls += 1
        expect(JSON.parse(init?.body as string)).toEqual({
          subject: 'Pozdrav živjo',
          body: { contentType: 'Text', content: 'Telo sporočila: 日本語' },
          toRecipients: [
            {
              emailAddress: { name: 'Tø Person', address: 'to@example.test' },
            },
          ],
          ccRecipients: [{ emailAddress: { address: 'čc@example.test' } }],
          bccRecipients: [{ emailAddress: { address: '密@example.test' } }],
        })
        return Response.json(
          graphDraft({
            subject: 'Pozdrav živjo',
            bodyPreview: 'Telo sporočila: 日本語',
            body: { contentType: 'text', content: 'Telo sporočila: 日本語' },
            toRecipients: [
              {
                emailAddress: { name: 'Tø Person', address: 'to@example.test' },
              },
            ],
            ccRecipients: [{ emailAddress: { address: 'čc@example.test' } }],
            bccRecipients: [{ emailAddress: { address: '密@example.test' } }],
          }),
          { status: 201 },
        )
      }) as unknown as typeof fetch,
      logger,
      signal: new AbortController().signal,
      resolveResource: () => null,
      resolveArtifact: async () => null,
    })

    expect(fetchCalls).toBe(1)
    expect(result.payload).toMatchObject({
      to: ['Tø Person <to@example.test>'],
      cc: ['čc@example.test'],
      bcc: ['密@example.test'],
      subject: 'Pozdrav živjo',
      bodyText: 'Telo sporočila: 日本語',
    })
  })

  test.each([
    {
      name: 'expired authorization',
      response: () => Response.json({ error: 'expired' }, { status: 401 }),
      code: 'auth_expired',
    },
    {
      name: 'denied permission',
      response: () => Response.json({ error: 'denied' }, { status: 403 }),
      code: 'permission_denied',
    },
    {
      name: 'provider throttling',
      response: () =>
        Response.json(
          { error: 'throttled' },
          { status: 429, headers: { 'retry-after': '1' } },
        ),
      code: 'rate_limited',
    },
    {
      name: 'provider failure',
      response: () => Response.json({ error: 'unavailable' }, { status: 503 }),
      code: 'provider_unavailable',
    },
    {
      name: 'incomplete non-Draft response',
      response: () => Response.json(graphDraft({ isDraft: false })),
      code: 'provider_bad_response',
    },
  ])('rejects $name after one request without local materialization', async ({
    response,
    code,
  }) => {
    const db = await freshDb()
    let fetchCalls = 0
    const error = await runAction({
      db,
      registry,
      authService: authService(() => {}),
      logger,
      actionId: createActionId,
      sourceId,
      actionInput: {
        to: ['recipient@example.test'],
        subject: '',
        bodyText: '',
      },
      signal: new AbortController().signal,
      fetch: (async () => {
        fetchCalls += 1
        return response()
      }) as unknown as typeof fetch,
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code })
    expect({ fetchCalls, resources: resourceCount(db) }).toEqual({
      fetchCalls: 1,
      resources: 0,
    })
  })

  test('updates one provider-only Draft with complete replacement and materializes the same canonical Ref', async () => {
    const db = await freshDb()
    let fetchCalls = 0
    const ref = `ctx://${sourceId}/draft/immutable-draft%2Fid`
    const result = await runAction({
      db,
      registry,
      authService: authService(() => {}),
      logger,
      actionId: updateActionId,
      sourceId,
      actionInput: {
        ref,
        to: ['replacement@example.test'],
        cc: [],
        bcc: [],
        subject: '',
        bodyText: '',
      },
      signal: new AbortController().signal,
      fetch: (async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        fetchCalls += 1
        expect(input.toString()).toBe(
          'https://graph.microsoft.com/v1.0/me/messages/immutable-draft%2Fid',
        )
        expect(init?.method).toBe('PATCH')
        expect(new Headers(init?.headers).get('prefer')).toBe(
          TEXT_BODY_PREFERENCE,
        )
        expect(JSON.parse(init?.body as string)).toEqual({
          subject: '',
          body: { contentType: 'Text', content: '' },
          toRecipients: [
            { emailAddress: { address: 'replacement@example.test' } },
          ],
          ccRecipients: [],
          bccRecipients: [],
        })
        return Response.json(
          graphDraft({
            subject: '',
            bodyPreview: '',
            body: { contentType: 'text', content: '' },
            toRecipients: [
              { emailAddress: { address: 'replacement@example.test' } },
            ],
            ccRecipients: [],
            bccRecipients: [],
          }),
        )
      }) as unknown as typeof fetch,
    })

    expect({ fetchCalls, resources: resourceCount(db) }).toEqual({
      fetchCalls: 1,
      resources: 1,
    })
    expect(result.resource).toMatchObject({
      ref,
      title: '',
      payload: {
        providerMessageId: 'immutable-draft/id',
        providerDraftId: 'immutable-draft/id',
        to: ['replacement@example.test'],
        cc: [],
        bcc: [],
        subject: '',
        bodyText: '',
      },
    })
  })

  test.each([
    {
      name: 'lowercase Source authority',
      ref: `ctx://${sourceId.toLowerCase()}/draft/immutable-id`,
      code: 'ref_source_mismatch',
    },
    {
      name: 'foreign Source authority',
      ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFK/draft/immutable-id',
      code: 'ref_source_mismatch',
    },
    {
      name: 'message rather than Draft path',
      ref: `ctx://${sourceId}/message/immutable-id`,
      code: 'invalid_ref',
    },
    {
      name: 'non-canonical encoded immutable id',
      ref: `ctx://${sourceId}/draft/immutable%2fid`,
      code: 'invalid_ref',
    },
  ])('direct update rejects $name before provider I/O', async ({
    ref,
    code,
  }) => {
    let fetchCalls = 0
    const error = await microsoftDraftUpdate({
      source: {
        id: sourceId,
        config: {},
      },
      input: {
        ref,
        to: ['recipient@example.test'],
        subject: '',
        bodyText: '',
      },
      fetch: (async () => {
        fetchCalls += 1
        throw new Error('must not fetch')
      }) as unknown as typeof fetch,
      logger,
      signal: new AbortController().signal,
      resolveResource: () => null,
      resolveArtifact: async () => null,
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code })
    expect(fetchCalls).toBe(0)
  })

  test('direct update rejects incomplete replacement input before provider I/O', async () => {
    let fetchCalls = 0
    const error = await microsoftDraftUpdate({
      source: {
        id: sourceId,
        config: {},
      },
      input: {
        ref: `ctx://${sourceId}/draft/immutable-id`,
        to: ['recipient@example.test'],
        subject: '',
      } as never,
      fetch: (async () => {
        fetchCalls += 1
        throw new Error('must not fetch')
      }) as unknown as typeof fetch,
      logger,
      signal: new AbortController().signal,
      resolveResource: () => null,
      resolveArtifact: async () => null,
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'invalid_action_input' })
    expect(fetchCalls).toBe(0)
  })
})
