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

function message(id: string, isDraft = false, isRead = false) {
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
    isRead,
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

  test('translates and returns exact unread booleans for query-less enumeration', async () => {
    const searches: string[] = []
    const providerFetch = (async (input: Parameters<typeof fetch>[0]) => {
      const search = new URL(String(input)).searchParams.get('$search') ?? ''
      searches.push(search)
      return Response.json({
        value: [
          search.includes('IsRead:false')
            ? message('unread')
            : message('read', false, true),
        ],
      })
    }) as unknown as typeof fetch

    const unread = await operation()(
      context(
        {
          text: '',
          limit: 5,
          fields: [{ name: 'unread', type: 'boolean', value: true }],
        },
        providerFetch,
      ),
    )
    const read = await operation()(
      context(
        {
          text: '',
          limit: 5,
          fields: [{ name: 'unread', type: 'boolean', value: false }],
        },
        providerFetch,
      ),
    )

    expect(searches).toEqual(['"IsRead:false"', '"IsRead:true"'])
    expect(unread.resources[0]?.payload).toMatchObject({ unread: true })
    expect(read.resources[0]?.payload).toMatchObject({ unread: false })
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

    expect(calls).toBe(0)
  })

  test('exposes and resumes beyond 50 without duplicate or Draft Refs', async () => {
    const requests: Request[] = []
    const firstMessages = Array.from({ length: 50 }, (_, index) =>
      message(`message-${index}`),
    )
    const first = await operation()(
      context({ text: '*', limit: 100 }, (async (
        input: Parameters<typeof fetch>[0],
        init?: RequestInit,
      ) => {
        requests.push(new Request(String(input), init))
        return Response.json({
          value: firstMessages,
          '@odata.nextLink':
            'https://graph.microsoft.com/v1.0/me/messages?$skiptoken=page-2',
        })
      }) as unknown as typeof fetch),
    )

    expect(first.resources).toHaveLength(50)
    expect(first.continuation).toBeString()
    const continuation = first.continuation
    if (!continuation) throw new Error('missing continuation')
    expect(first.warnings).toEqual([
      {
        code: 'truncated',
        message:
          'Microsoft Graph remote search was truncated after 50 items and 1 page; resume with the returned continuation',
      },
    ])

    const second = await operation()(
      context(
        {
          text: '*',
          limit: 100,
          continuation,
        },
        (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
          requests.push(new Request(String(input), init))
          return Response.json({
            value: [
              message('message-49'),
              message('hidden-draft', true),
              message('message-50'),
            ],
          })
        }) as unknown as typeof fetch,
      ),
    )

    expect(second.resources.map(({ ref }) => ref)).toEqual([
      `ctx://${sourceId.toUpperCase()}/message/message-50`,
    ])
    expect(second.continuation).toBeUndefined()
    expect(second.warnings).toEqual([])
    expect(requests[1]?.url).toBe(
      'https://graph.microsoft.com/v1.0/me/messages?$skiptoken=page-2',
    )
    expect(
      requests.every(
        (request) => request.headers.get('prefer') === IMMUTABLE_ID_PREFERENCE,
      ),
    ).toBe(true)
  })

  test('replays a partially consumed Graph page without losing eligible messages', async () => {
    const requestedTokens: (string | null)[] = []
    const providerFetch = (async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input))
      const token = url.searchParams.get('$skiptoken')
      requestedTokens.push(token)
      if (token === null) {
        return Response.json({
          value: [
            ...Array.from({ length: 49 }, (_, index) =>
              message(`first-${index}`),
            ),
            message('first-draft', true),
          ],
          '@odata.nextLink':
            'https://graph.microsoft.com/v1.0/me/messages?$skiptoken=page-2',
        })
      }
      if (token === 'page-2') {
        return Response.json({
          value: [message('page-2-a'), message('page-2-b')],
          '@odata.nextLink':
            'https://graph.microsoft.com/v1.0/me/messages?$skiptoken=page-3',
        })
      }
      return Response.json({ value: [message('page-3')] })
    }) as unknown as typeof fetch

    const first = await operation()(
      context({ text: '*', limit: 50 }, providerFetch),
    )
    expect(first.resources).toHaveLength(50)
    expect(first.continuation).toBeString()
    const continuation = first.continuation
    if (!continuation) throw new Error('missing continuation')

    const second = await operation()(
      context(
        {
          text: '*',
          limit: 50,
          continuation,
        },
        providerFetch,
      ),
    )

    expect(
      second.resources.map(({ ref }) => ref.replace(/^.*\/message\//, '')),
    ).toEqual(['page-2-b', 'page-3'])
    expect(second.continuation).toBeUndefined()
    expect(requestedTokens).toEqual([null, 'page-2', 'page-2', 'page-3'])
  })

  test('rejects malformed or query-mismatched continuation before I/O', async () => {
    let calls = 0
    const first = await operation()(
      context({ text: 'original', limit: 5 }, (async () =>
        Response.json({
          value: [],
          '@odata.nextLink':
            'https://graph.microsoft.com/v1.0/me/messages?$skiptoken=next',
        })) as unknown as typeof fetch),
    )
    const validContinuation = first.continuation
    if (!validContinuation) throw new Error('missing continuation')
    for (const [text, continuation] of [
      ['original', 'not-a-token'],
      ['changed', validContinuation],
    ] as const) {
      const error = await operation()(
        context({ text, limit: 5, continuation }, (async () => {
          calls += 1
          return Response.json({})
        }) as unknown as typeof fetch),
      ).catch((caught) => caught)
      expect(error).toMatchObject({ code: 'invalid_filter' })
    }

    const bounded = await operation()(
      context(
        {
          text: 'original',
          limit: 5,
          since: Date.parse('2026-07-01T10:00:00Z'),
        },
        (async () =>
          Response.json({
            value: [],
            '@odata.nextLink':
              'https://graph.microsoft.com/v1.0/me/messages?$skiptoken=bounded',
          })) as unknown as typeof fetch,
      ),
    )
    const boundedContinuation = bounded.continuation
    if (!boundedContinuation) throw new Error('missing bounded continuation')
    const changedExactBound = await operation()(
      context(
        {
          text: 'original',
          limit: 5,
          since: Date.parse('2026-07-01T11:00:00Z'),
          continuation: boundedContinuation,
        },
        (async () => {
          calls += 1
          return Response.json({})
        }) as unknown as typeof fetch,
      ),
    ).catch((caught) => caught)
    expect(changedExactBound).toMatchObject({ code: 'invalid_filter' })

    const largeLimit = await operation()(
      context({ text: 'original', limit: 100 }, (async () =>
        Response.json({
          value: [],
          '@odata.nextLink':
            'https://graph.microsoft.com/v1.0/me/messages?$skiptoken=large-limit',
        })) as unknown as typeof fetch),
    )
    const largeLimitContinuation = largeLimit.continuation
    if (!largeLimitContinuation)
      throw new Error('missing large-limit continuation')
    const changedRequestedLimit = await operation()(
      context(
        {
          text: 'original',
          limit: 50,
          continuation: largeLimitContinuation,
        },
        (async () => {
          calls += 1
          return Response.json({})
        }) as unknown as typeof fetch,
      ),
    ).catch((caught) => caught)
    expect(changedRequestedLimit).toMatchObject({ code: 'invalid_filter' })
    expect(calls).toBe(0)
  })

  test('rejects a provider page larger than the requested Graph page', async () => {
    const error = await operation()(
      context({ text: 'x', limit: 1 }, (async () =>
        Response.json({
          value: [message('one'), message('two')],
        })) as unknown as typeof fetch),
    ).catch((caught) => caught)
    expect(error).toMatchObject({ code: 'provider_bad_response' })
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
