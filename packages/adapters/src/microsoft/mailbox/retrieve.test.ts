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
import { microsoftMailboxAdapterDefinition } from './definition'

const sourceId = '01kxhbnecdah1t4mj38x88epfj'
const ref = `ctx://${sourceId.toUpperCase()}/message/immutable-id`

function operation() {
  const operation = microsoftMailboxAdapterDefinition.operations.retrieve
  if (!operation)
    throw new Error('missing Microsoft mailbox retrieve operation')
  return operation
}

function graphMessage() {
  return {
    id: 'immutable-id',
    conversationId: 'conversation-1',
    internetMessageId: ' <child@example.com> ',
    internetMessageHeaders: [
      { name: 'In-Reply-To', value: 'noise <parent@example.com> trailing' },
      {
        name: 'References',
        value: '<root@example.com> <parent@example.com> <root@example.com>',
      },
    ],
    subject: 'Complete message',
    bodyPreview: 'Preview',
    body: { contentType: 'text', content: 'Plain body' },
    from: { emailAddress: { name: 'Alice', address: 'alice@example.com' } },
    replyTo: [
      { emailAddress: { name: 'Replies', address: 'reply@example.com' } },
    ],
    toRecipients: [{ emailAddress: { address: 'to@example.com' } }],
    ccRecipients: [
      { emailAddress: { name: 'Copy', address: 'copy@example.com' } },
    ],
    bccRecipients: [],
    receivedDateTime: '2026-07-01T10:20:30Z',
    lastModifiedDateTime: '2026-07-01T11:20:30Z',
    isRead: true,
    isDraft: false,
    categories: ['Inbox'],
    hasAttachments: true,
  }
}

describe('Microsoft mailbox retrieve', () => {
  test('retrieves complete text message and paged file attachment descriptors', async () => {
    const requests: Request[] = []
    const resources: RetrievedResource[] = []
    const artifacts: ArtifactDescriptor[] = []
    const warnings: unknown[] = []
    const providerFetch = (async (
      input: Parameters<typeof fetch>[0],
      init?: RequestInit,
    ) => {
      const request = new Request(String(input), init)
      requests.push(request)
      const url = new URL(request.url)
      if (!url.pathname.endsWith('/attachments')) {
        return Response.json(graphMessage())
      }
      if (!url.searchParams.has('$skiptoken'))
        return Response.json({
          value: [
            {
              '@odata.type': '#microsoft.graph.fileAttachment',
              id: 'attachment/1',
              name: 'report.txt',
              contentType: 'text/plain',
              size: 4,
              isInline: false,
            },
            {
              '@odata.type': '#microsoft.graph.itemAttachment',
              id: 'item-1',
              name: 'forwarded.eml',
              contentType: 'message/rfc822',
              size: 10,
              isInline: false,
            },
          ],
          '@odata.nextLink':
            'https://graph.microsoft.com/v1.0/me/messages/immutable-id/attachments?$skiptoken=next',
        })
      return Response.json({
        value: [
          {
            '@odata.type': '#microsoft.graph.fileAttachment',
            id: 'inline-1',
            name: 'pixel.png',
            contentType: 'image/png',
            size: 2,
            isInline: true,
          },
        ],
      })
    }) as unknown as typeof fetch
    const context: RetrieveContext = {
      source: { id: sourceId, config: {} },
      ref,
      fetch: providerFetch,
      signal: new AbortController().signal,
      logger: {
        trace() {},
        debug() {},
        info() {},
        error() {},
        warn(value) {
          warnings.push(value)
        },
      },
      emitResource(value) {
        resources.push(value)
      },
      emitArtifact(value) {
        artifacts.push(value)
      },
    }

    await operation()(context)

    expect(requests).toHaveLength(3)
    expect(requests[0]?.headers.get('prefer')).toBe(
      'IdType="ImmutableId", outlook.body-content-type="text"',
    )
    expect(
      requests
        .slice(1)
        .every(
          (request) => request.headers.get('prefer') === 'IdType="ImmutableId"',
        ),
    ).toBe(true)
    expect(resources).toEqual([
      expect.objectContaining({
        ref,
        title: 'Complete message',
        payload: expect.objectContaining({
          providerMessageId: 'immutable-id',
          threadId: 'conversation-1',
          conversationKey: `${sourceId.toUpperCase()}:conversation-1`,
          rfcMessageId: '<child@example.com>',
          inReplyTo: '<parent@example.com>',
          references: ['<root@example.com>', '<parent@example.com>'],
          replyTo: ['Replies <reply@example.com>'],
          bodyText: 'Plain body',
          from: ['Alice <alice@example.com>'],
          to: ['to@example.com'],
          cc: ['Copy <copy@example.com>'],
          unread: false,
          attachments: [
            {
              ref: `${ref}/attachment/attachment%2F1`,
              filename: 'report.txt',
              mediaType: 'text/plain',
              byteSize: 4,
            },
            {
              ref: `${ref}/attachment/inline-1`,
              filename: 'pixel.png',
              mediaType: 'image/png',
              byteSize: 2,
            },
          ],
        }),
      }),
    ])
    expect(artifacts).toEqual([
      {
        ref: `${ref}/attachment/attachment%2F1`,
        filename: 'report.txt',
        mediaType: 'text/plain',
        byteSize: 4,
      },
      {
        ref: `${ref}/attachment/inline-1`,
        filename: 'pixel.png',
        mediaType: 'image/png',
        byteSize: 2,
      },
    ])
    expect(warnings).toEqual([
      {
        code: 'unsupported_attachment',
        message:
          'Microsoft Graph attachment item-1 is not a downloadable file attachment',
        ref,
      },
    ])
  })

  test('omits empty reply metadata', async () => {
    const resources: RetrievedResource[] = []
    await operation()({
      source: { id: sourceId, config: {} },
      ref,
      fetch: (async () =>
        Response.json({
          ...graphMessage(),
          internetMessageHeaders: [{ name: 'References', value: '   ' }],
          replyTo: [],
          hasAttachments: false,
        })) as unknown as typeof fetch,
      signal: new AbortController().signal,
      logger: { trace() {}, debug() {}, info() {}, warn() {}, error() {} },
      emitResource(value) {
        resources.push(value)
      },
      emitArtifact() {},
    })

    expect(resources[0]?.payload).not.toHaveProperty('references')
    expect(resources[0]?.payload).not.toHaveProperty('replyTo')
  })

  test('accepts an opaque immutable id containing an encoded slash', async () => {
    const opaqueRef = `ctx://${sourceId.toUpperCase()}/message/a%2Fb`
    const resources: RetrievedResource[] = []
    await operation()({
      source: { id: sourceId, config: {} },
      ref: opaqueRef,
      signal: new AbortController().signal,
      fetch: (async () =>
        Response.json({
          ...graphMessage(),
          id: 'a/b',
          hasAttachments: false,
        })) as unknown as typeof fetch,
      logger: { trace() {}, debug() {}, info() {}, warn() {}, error() {} },
      emitResource(value) {
        resources.push(value)
      },
      emitArtifact() {},
    })
    expect(resources[0]?.ref).toBe(opaqueRef)
  })

  test.each([
    'not-a-ref',
    `ctx://01ARZ3NDEKTSV4RRFFQ69G5FAA/message/immutable-id`,
    `ctx://${sourceId.toLowerCase()}/message/immutable-id`,
    `ctx://${sourceId.toUpperCase()}/draft/immutable-id`,
    `ctx://${sourceId.toUpperCase()}/message/a%2fb`,
  ])('rejects malformed or foreign canonical Ref before I/O: %s', async (requestedRef) => {
    let calls = 0
    const error = await Promise.resolve(
      operation()({
        source: { id: sourceId, config: {} },
        ref: requestedRef,
        signal: new AbortController().signal,
        fetch: (async () => {
          calls += 1
          return Response.json({})
        }) as unknown as typeof fetch,
        logger: { trace() {}, debug() {}, info() {}, warn() {}, error() {} },
        emitResource() {},
        emitArtifact() {},
      }),
    ).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(CtxindexValidationError)
    expect(calls).toBe(0)
  })

  test('rejects unsafe attachment metadata', async () => {
    const error = await Promise.resolve(
      operation()({
        source: { id: sourceId, config: {} },
        ref,
        signal: new AbortController().signal,
        fetch: (async (input: Parameters<typeof fetch>[0]) =>
          String(input).includes('/attachments')
            ? Response.json({
                value: [
                  {
                    '@odata.type': '#microsoft.graph.fileAttachment',
                    id: 'file-1',
                    name: '../secret.txt',
                    contentType: 'text/plain',
                    size: 1,
                    isInline: false,
                  },
                ],
              })
            : Response.json(graphMessage())) as unknown as typeof fetch,
        logger: {
          trace() {},
          debug() {},
          info() {},
          warn() {},
          error() {},
        },
        emitResource() {},
        emitArtifact() {},
      }),
    ).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(CtxindexSyncError)
    expect(error).toMatchObject({ code: 'provider_bad_response' })
  })

  test('rejects a mismatched immutable id', async () => {
    const error = await Promise.resolve(
      operation()({
        source: { id: sourceId, config: {} },
        ref,
        signal: new AbortController().signal,
        fetch: (async () =>
          Response.json({
            ...graphMessage(),
            id: 'different',
          })) as unknown as typeof fetch,
        logger: { trace() {}, debug() {}, info() {}, warn() {}, error() {} },
        emitResource() {},
        emitArtifact() {},
      }),
    ).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(CtxindexSyncError)
    expect(error).toMatchObject({ code: 'provider_bad_response' })
  })
})
