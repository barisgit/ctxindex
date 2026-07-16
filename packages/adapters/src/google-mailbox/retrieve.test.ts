import { describe, expect, test } from 'bun:test'
import {
  CtxindexSyncError,
  CtxindexValidationError,
} from '@ctxindex/core/errors'
import type {
  ArtifactDescriptor,
  RetrieveContext,
  RetrievedResource,
} from '@ctxindex/extension-sdk'
import { gmailAdapterDefinition } from './definition'

const sourceId = '01kxhbnecdah1t4mj38x88epfj'
const ref = `ctx://${sourceId.toUpperCase()}/message/message-1`
const logger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
}

function encoded(value: string): string {
  return Buffer.from(value).toString('base64url')
}

function operation() {
  const retrieve = gmailAdapterDefinition.operations.retrieve
  if (!retrieve) throw new Error('missing Gmail retrieve operation')
  return retrieve
}

async function retrieve(
  response:
    | Response
    | ((
        input: Parameters<typeof fetch>[0],
        init?: RequestInit,
      ) => Promise<Response>),
  requestedRef = ref,
  signal = new AbortController().signal,
): Promise<{
  artifacts: ArtifactDescriptor[]
  resources: RetrievedResource[]
  urls: URL[]
}> {
  const artifacts: ArtifactDescriptor[] = []
  const resources: RetrievedResource[] = []
  const urls: URL[] = []
  const fetch = (async (
    input: Parameters<typeof globalThis.fetch>[0],
    init?: RequestInit,
  ) => {
    urls.push(new URL(String(input)))
    if (typeof response === 'function') return response(input, init)
    return response
  }) as typeof globalThis.fetch
  const context: RetrieveContext = {
    source: { id: sourceId, config: {} },
    ref: requestedRef,
    signal,
    fetch,
    logger,
    emitResource(resource) {
      resources.push(resource)
    },
    emitArtifact(artifact) {
      artifacts.push(artifact)
    },
  }
  await operation()(context)
  return { artifacts, resources, urls }
}

function message(payload: Record<string, unknown>): Response {
  return Response.json({
    id: 'message-1',
    threadId: 'thread-1',
    labelIds: ['INBOX', 'UNREAD'],
    snippet: 'A snippet',
    internalDate: '123',
    payload: {
      headers: [
        { name: 'Subject', value: 'A subject' },
        { name: 'From', value: 'Alice <alice@example.com>' },
        { name: 'To', value: 'Bob <bob@example.com>' },
        { name: 'Cc', value: 'Copy <copy@example.com>' },
        { name: 'Bcc', value: 'Blind <blind@example.com>' },
        { name: 'Date', value: 'Thu, 1 Jan 1970 00:00:00 GMT' },
        {
          name: 'Message-ID',
          value: ' noise <message-1@example.com> <ignored@example.com> ',
        },
        { name: 'In-Reply-To', value: ' <earlier@example.com> trailing ' },
      ],
      ...payload,
    },
  })
}

describe('Gmail retrieve', () => {
  test('collects nested, single-part, and inline attachment descriptors', async () => {
    const { artifacts, resources } = await retrieve(
      message({
        mimeType: 'multipart/mixed',
        parts: [
          {
            filename: 'report.pdf',
            mimeType: 'application/pdf',
            body: { attachmentId: 'nested/id', size: 42 },
          },
          {
            mimeType: 'image/png',
            body: { attachmentId: 'inline-1' },
          },
        ],
      }),
    )
    const expected = [
      {
        ref: `${ref}/attachment/nested%2Fid`,
        filename: 'report.pdf',
        mediaType: 'application/pdf',
        byteSize: 42,
      },
      {
        ref: `${ref}/attachment/inline-1`,
        mediaType: 'image/png',
      },
    ]

    expect(artifacts).toEqual(expected)
    expect(resources[0]?.payload).toMatchObject({ attachments: expected })

    const single = await retrieve(
      message({ body: { attachmentId: 'single', size: 0 } }),
    )
    expect(single.artifacts).toEqual([
      {
        ref: `${ref}/attachment/single`,
        mediaType: 'application/octet-stream',
        byteSize: 0,
      },
    ])
  })

  test('retrieves the exact Ref and prefers nested plain text while skipping attachment leaves', async () => {
    const result = await retrieve(
      message({
        mimeType: 'multipart/mixed',
        parts: [
          {
            mimeType: 'text/plain',
            body: { attachmentId: 'attachment-1', data: encoded('skip me') },
          },
          {
            mimeType: 'multipart/alternative',
            parts: [
              {
                mimeType: 'text/html',
                body: { data: encoded('<p>HTML first</p>') },
              },
              {
                mimeType: 'text/plain',
                body: { data: encoded('Plain preferred') },
              },
            ],
          },
        ],
      }),
    )

    expect(result.urls).toHaveLength(1)
    expect(result.urls[0]?.pathname).toEndWith('/users/me/messages/message-1')
    expect(result.urls[0]?.searchParams.get('format')).toBe('full')
    expect(result.resources).toEqual([
      {
        ref,
        profile: { id: 'communication.message', version: 1 },
        title: 'A subject',
        occurredAt: 123,
        providerUpdatedAt: 123,
        payload: {
          providerMessageId: 'message-1',
          threadId: 'thread-1',
          conversationKey: `${sourceId.toUpperCase()}:thread-1`,
          rfcMessageId: '<message-1@example.com>',
          inReplyTo: '<earlier@example.com>',
          subject: 'A subject',
          from: ['Alice <alice@example.com>'],
          to: ['Bob <bob@example.com>'],
          cc: ['Copy <copy@example.com>'],
          bcc: ['Blind <blind@example.com>'],
          date: '1970-01-01T00:00:00.000Z',
          snippet: 'A snippet',
          bodyText: 'Plain preferred',
          labels: ['INBOX', 'UNREAD'],
          unread: true,
          attachments: [
            {
              ref: `${ref}/attachment/attachment-1`,
              mediaType: 'text/plain',
            },
          ],
        },
      },
    ])
  })

  test('converts an html-only body to text instead of emitting markup', async () => {
    const { resources } = await retrieve(
      message({
        mimeType: 'text/html',
        body: { data: encoded('<div>Hello <strong>world</strong></div>') },
      }),
    )

    expect(resources[0]?.payload).toMatchObject({ bodyText: 'Hello world' })
  })

  test('reads a single-part payload body', async () => {
    const { resources } = await retrieve(
      message({
        mimeType: 'text/plain',
        body: { data: encoded('single body') },
      }),
    )

    expect(resources[0]?.payload).toMatchObject({ bodyText: 'single body' })
  })

  test.each([
    [
      `ctx://${sourceId.toUpperCase()}/messages/message-1`,
      'must use suffix "message/<provider-id>"',
    ],
    [
      `ctx://${sourceId.toUpperCase()}/message/message-1/extra`,
      'must use suffix "message/<provider-id>"',
    ],
    [
      'ctx://01ARZ3NDEKTSV4RRFFQ69G5FAA/message/message-1',
      'does not belong to Source',
    ],
  ])('rejects an invalid adapter Ref %s', async (badRef, messageText) => {
    const error = await retrieve(Response.json({}), badRef).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(CtxindexValidationError)
    expect(error).toMatchObject({
      message: expect.stringContaining(messageText),
    })
  })

  test.each([
    [401, 'auth_expired'],
    [403, 'permission_denied'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [503, 'provider_unavailable'],
    [400, 'provider_bad_response'],
  ] as const)('maps HTTP status %i to %s', async (status, code) => {
    const error = await retrieve(new Response('failed', { status })).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(CtxindexSyncError)
    expect(error).toMatchObject({ code })
  })

  test('passes and propagates cancellation', async () => {
    const controller = new AbortController()
    controller.abort(new DOMException('cancelled', 'AbortError'))
    let seenSignal: AbortSignal | undefined

    const error = await retrieve(
      async (_input, init) => {
        seenSignal = init?.signal as AbortSignal
        seenSignal.throwIfAborted()
        return Response.json({})
      },
      ref,
      controller.signal,
    ).catch((caught: unknown) => caught)

    expect(seenSignal).toBe(controller.signal)
    expect(error).toMatchObject({ name: 'AbortError' })
  })
  test('retrieves an exact stable Draft Ref without advertising attachments', async () => {
    const draftRef = `ctx://${sourceId.toUpperCase()}/draft/draft%2F1`
    const result = await retrieve(
      Response.json({
        id: 'draft/1',
        message: {
          id: 'changing-message-id',
          threadId: 'thread-1',
          labelIds: ['DRAFT'],
          payload: {
            headers: [
              { name: 'To', value: 'to@example.com' },
              { name: 'Cc', value: 'cc@example.com' },
              { name: 'Bcc', value: 'bcc@example.com' },
              { name: 'Subject', value: 'Draft subject' },
            ],
            parts: [
              {
                filename: 'not-supported.txt',
                mimeType: 'text/plain',
                body: { attachmentId: 'must-not-emit', size: 3 },
              },
              {
                mimeType: 'text/plain',
                body: { data: encoded('Draft body') },
              },
            ],
          },
        },
      }),
      draftRef,
    )

    expect(result.urls).toHaveLength(1)
    expect(result.urls[0]?.pathname).toEndWith('/users/me/drafts/draft%2F1')
    expect(result.urls[0]?.searchParams.get('format')).toBe('full')
    expect(result.artifacts).toEqual([])
    expect(result.resources).toEqual([
      {
        ref: draftRef,
        profile: { id: 'communication.message', version: 1 },
        title: 'Draft subject',
        occurredAt: null,
        providerUpdatedAt: null,
        payload: {
          providerDraftId: 'draft/1',
          providerMessageId: 'changing-message-id',
          threadId: 'thread-1',
          conversationKey: `${sourceId.toUpperCase()}:thread-1`,
          subject: 'Draft subject',
          to: ['to@example.com'],
          cc: ['cc@example.com'],
          bcc: ['bcc@example.com'],
          bodyText: 'Draft body',
          labels: ['DRAFT'],
          unread: false,
        },
      },
    ])
  })

  test.each([
    [{ id: 'wrong-draft', message: { id: 'message-1' } }, 'wrong envelope'],
    [{ id: 'draft/1' }, 'missing message'],
  ])('rejects an invalid Draft response: %s', async (body) => {
    const error = await retrieve(
      Response.json(body),
      `ctx://${sourceId.toUpperCase()}/draft/draft%2F1`,
    ).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(CtxindexSyncError)
    expect(error).toMatchObject({ code: 'provider_bad_response' })
  })
})
