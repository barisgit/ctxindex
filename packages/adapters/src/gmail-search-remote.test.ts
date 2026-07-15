import { describe, expect, test } from 'bun:test'
import { CtxindexSyncError } from '@ctxindex/core/errors'
import type { SearchContext } from '@ctxindex/extension-sdk'
import { gmailAdapterDefinition } from './builtins'

const sourceId = '01kxhbnecdah1t4mj38x88epfj'
const logger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
}

function context(
  query: SearchContext['query'],
  fetch: typeof globalThis.fetch,
  signal = new AbortController().signal,
): SearchContext {
  return {
    source: { id: sourceId, config: {} },
    query,
    signal,
    fetch,
    logger,
  }
}

function responding(response: Response): typeof globalThis.fetch {
  return (async () => response) as unknown as typeof globalThis.fetch
}

function metadata(
  id: string,
  subject: string,
  internalDate: string,
): Record<string, unknown> {
  return {
    id,
    threadId: `thread-${id}`,
    labelIds: ['INBOX', 'UNREAD'],
    snippet: `snippet-${id}`,
    internalDate,
    payload: {
      headers: [
        { name: 'Subject', value: subject },
        { name: 'From', value: 'Alice <alice@example.com>' },
        { name: 'To', value: 'Bob <bob@example.com>' },
        { name: 'Message-ID', value: ` noise <${id}@example.com> ignored ` },
        { name: 'In-Reply-To', value: ` <parent-${id}@example.com> trailing ` },
      ],
    },
  }
}

function searchRemote() {
  const operation = gmailAdapterDefinition.operations.searchRemote
  if (!operation) throw new Error('missing Gmail searchRemote operation')
  return operation
}

describe('Gmail searchRemote', () => {
  test.each([
    [401, 'auth_expired'],
    [403, 'permission_denied'],
    [404, 'not_found'],
    [503, 'provider_unavailable'],
  ] as const)('maps fatal list status %i to %s', async (status, code) => {
    const error = await searchRemote()(
      context(
        { text: 'failure', limit: 10 },
        responding(new Response('failed', { status })),
      ),
    ).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(CtxindexSyncError)
    expect(error).toMatchObject({ code })
  })

  test('maps list rate limits with Retry-After milliseconds', async () => {
    const error = await searchRemote()(
      context(
        { text: 'rate limited', limit: 10 },
        responding(
          new Response('slow down', {
            status: 429,
            headers: { 'retry-after': '2' },
          }),
        ),
      ),
    ).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(CtxindexSyncError)
    expect(error).toMatchObject({ code: 'rate_limited', retryAfterMs: 2000 })
  })

  test('maps malformed successful list responses to provider_bad_response', async () => {
    const error = await searchRemote()(
      context(
        { text: 'malformed', limit: 10 },
        responding(new Response('not-json')),
      ),
    ).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(CtxindexSyncError)
    expect(error).toMatchObject({ code: 'provider_bad_response' })
  })

  test('maps invalid list JSON shape to provider_bad_response', async () => {
    const error = await searchRemote()(
      context(
        { text: 'invalid shape', limit: 10 },
        responding(Response.json(null)),
      ),
    ).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(CtxindexSyncError)
    expect(error).toMatchObject({ code: 'provider_bad_response' })
  })

  test('translates text, typed filters, and time bounds and returns scoreless metadata envelopes in provider order', async () => {
    const urls: URL[] = []
    const signals: Array<AbortSignal | null | undefined> = []
    const fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = new URL(
        input instanceof Request ? input.url : input.toString(),
      )
      urls.push(url)
      signals.push(init?.signal)
      if (url.pathname.endsWith('/messages')) {
        return Response.json({
          messages: [{ id: 'b' }, { id: 'a' }, { id: 'b' }],
        })
      }
      const id = url.pathname.split('/').at(-1) ?? ''
      return Response.json(
        metadata(
          id,
          id === 'b' ? 'Second' : 'First',
          id === 'b' ? '2000' : '1000',
        ),
      )
    }) as typeof globalThis.fetch

    const result = await searchRemote()(
      context(
        {
          text: 'project x',
          limit: 10,
          since: 1_000,
          until: 2_000,
          fields: [
            { name: 'sender', type: 'string[]', value: 'alice@example.com' },
            { name: 'unread', type: 'boolean', value: true },
          ],
        },
        fetch,
      ),
    )

    expect(urls[0]?.searchParams.get('q')).toBe(
      'project x from:alice@example.com is:unread after:1 before:3 -in:drafts',
    )
    expect(urls[0]?.searchParams.get('maxResults')).toBe('10')
    expect(urls[0]?.searchParams.get('q')?.match(/-in:drafts/g)).toHaveLength(1)
    expect(
      urls.slice(1).map((url) => ({
        format: url.searchParams.get('format'),
        fields: url.searchParams.get('fields'),
        headers: url.searchParams.getAll('metadataHeaders'),
      })),
    ).toEqual([
      {
        format: 'metadata',
        fields: expect.stringContaining('payload/headers'),
        headers: ['Subject', 'From', 'To', 'Date', 'Message-ID', 'In-Reply-To'],
      },
      {
        format: 'metadata',
        fields: expect.stringContaining('payload/headers'),
        headers: ['Subject', 'From', 'To', 'Date', 'Message-ID', 'In-Reply-To'],
      },
    ])
    expect(result).toEqual({
      resources: [
        {
          ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/message/b',
          profile: { id: 'communication.message', version: 1 },
          title: 'Second',
          occurredAt: 2000,
          payload: {
            providerMessageId: 'b',
            threadId: 'thread-b',
            conversationKey: `${sourceId.toUpperCase()}:thread-b`,
            rfcMessageId: '<b@example.com>',
            inReplyTo: '<parent-b@example.com>',
            subject: 'Second',
            from: ['Alice <alice@example.com>'],
            to: ['Bob <bob@example.com>'],
            date: new Date(2000).toISOString(),
            snippet: 'snippet-b',
            labels: ['INBOX', 'UNREAD'],
            unread: true,
          },
        },
        {
          ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/message/a',
          profile: { id: 'communication.message', version: 1 },
          title: 'First',
          occurredAt: 1000,
          payload: {
            providerMessageId: 'a',
            threadId: 'thread-a',
            conversationKey: `${sourceId.toUpperCase()}:thread-a`,
            rfcMessageId: '<a@example.com>',
            inReplyTo: '<parent-a@example.com>',
            subject: 'First',
            from: ['Alice <alice@example.com>'],
            to: ['Bob <bob@example.com>'],
            date: new Date(1000).toISOString(),
            snippet: 'snippet-a',
            labels: ['INBOX', 'UNREAD'],
            unread: true,
          },
        },
      ],
      warnings: [],
    })
    expect(result.resources.every((resource) => !('score' in resource))).toBe(
      true,
    )
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true)
  })

  test('caps pagination and reports truncation in the result envelope', async () => {
    const listTokens: Array<string | null> = []
    const fetch = (async (input: string | URL | Request) => {
      const url = new URL(
        input instanceof Request ? input.url : input.toString(),
      )
      if (url.pathname.endsWith('/messages')) {
        const token = url.searchParams.get('pageToken')
        listTokens.push(token)
        const page = listTokens.length
        return Response.json({
          messages: [{ id: `id-${page}` }],
          nextPageToken: `page-${page + 1}`,
        })
      }
      const id = url.pathname.split('/').at(-1) ?? ''
      return Response.json(metadata(id, id, String(listTokens.length)))
    }) as typeof globalThis.fetch

    const result = await searchRemote()(
      context({ text: 'bounded', limit: 50 }, fetch),
    )

    expect(listTokens).toEqual([null, 'page-2', 'page-3'])
    expect(result.resources.map((item) => item.payload)).toHaveLength(3)
    expect(result.warnings).toEqual([
      {
        code: 'truncated',
        message: 'Gmail remote search was truncated after 3 pages',
      },
    ])
  })

  test('propagates cancellation during metadata fetch without continuing', async () => {
    const controller = new AbortController()
    let metadataCalls = 0
    let metadataStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      metadataStarted = resolve
    })
    const fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = new URL(
        input instanceof Request ? input.url : input.toString(),
      )
      if (url.pathname.endsWith('/messages')) {
        return Response.json({ messages: [{ id: 'a' }, { id: 'b' }] })
      }
      metadataCalls += 1
      metadataStarted?.()
      await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          { once: true },
        )
      })
      throw new Error('unreachable')
    }) as typeof globalThis.fetch

    const pending = searchRemote()(
      context({ text: 'cancel', limit: 10 }, fetch, controller.signal),
    )
    await started
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(metadataCalls).toBe(1)
  })

  test('keeps provider order after partial metadata failures', async () => {
    const fetch = (async (input: string | URL | Request) => {
      const url = new URL(
        input instanceof Request ? input.url : input.toString(),
      )
      if (url.pathname.endsWith('/messages')) {
        return Response.json({
          messages: [{ id: 'a' }, { id: 'broken' }, { id: 'c' }],
        })
      }
      const id = url.pathname.split('/').at(-1) ?? ''
      if (id === 'broken') return new Response('unavailable', { status: 503 })
      return Response.json(metadata(id, id.toUpperCase(), '1000'))
    }) as typeof globalThis.fetch

    const result = await searchRemote()(
      context({ text: 'partial', limit: 10 }, fetch),
    )

    expect(result.resources.map((item) => item.title)).toEqual(['A', 'C'])
    expect(result.warnings).toEqual([
      {
        code: 'partial_item_failure',
        message: 'Gmail metadata fetch failed for message broken',
        ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/message/broken',
      },
    ])
  })

  test('caps provider items and warns when more are returned', async () => {
    let metadataCalls = 0
    const ids = Array.from({ length: 51 }, (_, index) => ({
      id: `id-${index}`,
    }))
    const fetch = (async (input: string | URL | Request) => {
      const url = new URL(
        input instanceof Request ? input.url : input.toString(),
      )
      if (url.pathname.endsWith('/messages')) {
        expect(url.searchParams.get('maxResults')).toBe('50')
        return Response.json({ messages: ids })
      }
      metadataCalls += 1
      const id = url.pathname.split('/').at(-1) ?? ''
      return Response.json(metadata(id, id, '1000'))
    }) as typeof globalThis.fetch

    const result = await searchRemote()(
      context({ text: 'item cap', limit: 100 }, fetch),
    )

    expect(metadataCalls).toBe(50)
    expect(result.resources).toHaveLength(50)
    expect(result.warnings).toEqual([
      {
        code: 'truncated',
        message: 'Gmail remote search was truncated after 50 items',
      },
    ])
  })
})
