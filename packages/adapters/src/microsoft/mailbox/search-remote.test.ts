import { describe, expect, test } from 'bun:test'
import {
  CtxindexSyncError,
  CtxindexValidationError,
} from '@ctxindex/core/errors'
import type { SearchContext } from '@ctxindex/extension-sdk'
import { microsoftMailboxAdapterDefinition } from './definition'
import { IMMUTABLE_ID_PREFERENCE } from './transport'

const sourceId = '01kxhbnecdah1t4mj38x88epfj'
const logger = { trace() {}, debug() {}, info() {}, warn() {}, error() {} }

function operation() {
  const operation = microsoftMailboxAdapterDefinition.operations.searchRemote
  if (!operation) throw new Error('missing Microsoft mailbox search operation')
  return operation
}

function context(
  query: SearchContext['query'],
  providerFetch: typeof fetch,
): SearchContext {
  return {
    source: { id: sourceId, config: {} },
    query,
    fetch: providerFetch,
    logger,
    signal: new AbortController().signal,
  }
}

function message(id: string, isDraft = false) {
  return {
    id,
    conversationId: 'conversation-1',
    internetMessageId: `<${id}@example.com>`,
    subject: `Subject ${id}`,
    bodyPreview: `Preview ${id}`,
    from: { emailAddress: { name: 'Alice', address: 'alice@example.com' } },
    toRecipients: [{ emailAddress: { address: 'bob@example.com' } }],
    receivedDateTime: '2026-07-01T10:20:30Z',
    lastModifiedDateTime: '2026-07-01T11:20:30Z',
    isRead: false,
    isDraft,
    categories: ['Inbox'],
  }
}

describe('Microsoft mailbox search', () => {
  test('translates supported KQL, validates paging, excludes Drafts, and normalizes deterministically', async () => {
    const requests: Request[] = []
    const providerFetch = (async (
      input: Parameters<typeof fetch>[0],
      init?: RequestInit,
    ) => {
      const request = new Request(String(input), init)
      requests.push(request)
      if (requests.length === 1)
        return Response.json({
          value: [message('message-1'), message('draft-1', true)],
          '@odata.nextLink':
            'https://graph.microsoft.com/v1.0/me/messages?$skiptoken=next',
        })
      return Response.json({ value: [message('message-2')] })
    }) as unknown as typeof fetch

    const result = await operation()(
      context(
        {
          text: 'quarterly "review"',
          limit: 2,
          since: Date.parse('2026-06-01T00:00:00Z'),
          until: Date.parse('2026-07-02T00:00:00Z'),
          fields: [
            { name: 'sender', type: 'string[]', value: 'boss@example.com' },
          ],
        },
        providerFetch,
      ),
    )

    expect(requests).toHaveLength(2)
    expect(new URL(requests[0]?.url ?? '').searchParams.get('$search')).toBe(
      '"quarterly \\"review\\" AND from:boss@example.com AND received>=06/01/2026 AND received<07/02/2026"',
    )
    expect(requests.length).toBeGreaterThan(1)
    for (const request of requests) {
      expect(request.headers.get('prefer')).toBe(IMMUTABLE_ID_PREFERENCE)
    }
    expect(result.resources.map((resource) => resource.ref)).toEqual([
      `ctx://${sourceId.toUpperCase()}/message/message-1`,
      `ctx://${sourceId.toUpperCase()}/message/message-2`,
    ])
    expect(result.resources[0]).toMatchObject({
      title: 'Subject message-1',
      occurredAt: Date.parse('2026-07-01T10:20:30Z'),
      providerUpdatedAt: Date.parse('2026-07-01T11:20:30Z'),
      payload: {
        providerMessageId: 'message-1',
        threadId: 'conversation-1',
        conversationKey: `${sourceId.toUpperCase()}:conversation-1`,
        rfcMessageId: '<message-1@example.com>',
        from: ['Alice <alice@example.com>'],
        to: ['bob@example.com'],
        unread: true,
      },
    })
    expect(result.warnings).toEqual([])
  })

  test('rejects unsupported or malformed filters before I/O', async () => {
    let calls = 0
    const error = await operation()(
      context(
        {
          text: '',
          limit: 5,
          fields: [{ name: 'conversationKey', type: 'string', value: 'x' }],
        },
        (async () => {
          calls += 1
          return Response.json({})
        }) as unknown as typeof fetch,
      ),
    ).catch((caught) => caught)
    expect(error).toBeInstanceOf(CtxindexValidationError)
    expect(error).toMatchObject({ code: 'invalid_filter' })
    expect(calls).toBe(0)

    const unread = await operation()(
      context(
        {
          text: '',
          limit: 5,
          fields: [{ name: 'unread', type: 'boolean', value: true }],
        },
        (async () => {
          calls += 1
          return Response.json({})
        }) as unknown as typeof fetch,
      ),
    ).catch((caught) => caught)
    expect(unread).toMatchObject({ code: 'invalid_filter' })
    expect(calls).toBe(0)
  })

  test('uses coarse Graph dates but enforces exact timestamp bounds locally', async () => {
    let requestedSearch = ''
    const result = await operation()(
      context(
        {
          text: 'quarterly',
          limit: 5,
          since: Date.parse('2026-07-01T10:30:00Z'),
          until: Date.parse('2026-07-01T12:30:00Z'),
        },
        (async (input: Parameters<typeof fetch>[0]) => {
          requestedSearch =
            new URL(String(input)).searchParams.get('$search') ?? ''
          return Response.json({ value: [message('too-early')] })
        }) as unknown as typeof fetch,
      ),
    )
    expect(requestedSearch).toBe(
      '"quarterly AND received>=07/01/2026 AND received<07/02/2026"',
    )
    expect(result.resources).toEqual([])
  })

  test('rejects foreign nextLink and malformed provider data', async () => {
    const foreign = await operation()(
      context({ text: 'x', limit: 5 }, (async () =>
        Response.json({
          value: [],
          '@odata.nextLink': 'https://evil.example/v1.0/me/messages',
        })) as unknown as typeof fetch),
    ).catch((caught) => caught)
    expect(foreign).toMatchObject({ code: 'provider_bad_response' })

    const malformed = await operation()(
      context({ text: 'x', limit: 5 }, (async () =>
        Response.json({ value: [{ id: '' }] })) as unknown as typeof fetch),
    ).catch((caught) => caught)
    expect(malformed).toBeInstanceOf(CtxindexSyncError)
    expect(malformed).toMatchObject({ code: 'provider_bad_response' })
  })

  test.each([
    [401, 'auth_expired'],
    [403, 'permission_denied'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [503, 'provider_unavailable'],
  ] as const)('maps Graph status %i to %s', async (status, code) => {
    const error = await operation()(
      context(
        { text: 'x', limit: 1 },
        (async () =>
          new Response('failed', {
            status,
            ...(status === 429 ? { headers: { 'retry-after': '3' } } : {}),
          })) as unknown as typeof fetch,
      ),
    ).catch((caught) => caught)
    expect(error).toBeInstanceOf(CtxindexSyncError)
    expect(error).toMatchObject({
      code,
      ...(status === 429 ? { retryAfterMs: 3000 } : {}),
    })
  })
})
