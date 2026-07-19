import { describe, expect, test } from 'bun:test'
import { resetEnvForTests } from '@ctxindex/core/config'
import type { ActionArtifact, ActionContext } from '@ctxindex/extension-sdk'
import {
  communicationMessageDraftCreateInputSchema,
  communicationMessageDraftUpdateInputSchema,
} from '@ctxindex/profiles'
import { gmailAdapterDefinition } from './definition'
import { buildGmailDraftRaw, gmailDraftCreate, gmailDraftUpdate } from './draft'

const sourceId = '01KXHBNECDAH1T4MJ38X88EPFJ'
const signal = new AbortController().signal
const logger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
}
const managedArtifact: ActionArtifact = {
  ref: `ctx://${sourceId}/message/source/attachment/file`,
  originRef: `ctx://${sourceId}/message/source`,
  filename: 'report.bin',
  mediaType: 'application/octet-stream',
  byteSize: 4,
  bytes: Uint8Array.from([0, 1, 254, 255]),
}

function context(
  input: unknown,
  mockedFetch: typeof fetch,
  resolveResource?: ActionContext['resolveResource'],
  resolveArtifact: ActionContext['resolveArtifact'] = async () => null,
): ActionContext<never> {
  const defaultResolveResource: ActionContext['resolveResource'] = (ref) => {
    if (
      typeof input !== 'object' ||
      input === null ||
      !('ref' in input) ||
      input.ref !== ref
    )
      return null
    const encodedId = ref.split('/').at(-1)
    if (!encodedId) return null
    return {
      ref,
      sourceId,
      profile: { id: 'communication.message', version: 1 },
      completeness: 'complete',
      deletedAt: null,
      payload: {
        providerMessageId: 'stored-message',
        providerDraftId: decodeURIComponent(encodedId),
        managedAttachmentRefs: [],
      },
    }
  }
  return {
    source: { id: sourceId, config: {} },
    input: input as never,
    signal,
    fetch: mockedFetch,
    logger,
    resolveResource: resolveResource ?? defaultResolveResource,
    resolveArtifact,
  }
}

function decodeRaw(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf8')
}

describe('buildGmailDraftRaw', () => {
  test('builds the deterministic RFC5322 text message and unpadded base64url', () => {
    const raw = buildGmailDraftRaw({
      to: ['one@example.com', 'two@example.com'],
      cc: ['copy@example.com'],
      bcc: [],
      subject: 'Project update',
      bodyText: 'line one\nline two',
    })

    expect(decodeRaw(raw)).toBe(
      [
        'To: one@example.com, two@example.com',
        'Cc: copy@example.com',
        'Subject: Project update',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        'line one',
        'line two',
      ].join('\r\n'),
    )
    expect(raw).not.toContain('=')
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  test('RFC2047 B-encodes a non-ASCII Subject and emits optional recipients in fixed order', () => {
    const raw = buildGmailDraftRaw({
      to: ['recipient@example.com'],
      cc: [],
      bcc: ['blind@example.com'],
      subject: 'Pozdrav Živjo',
      bodyText: '',
    })

    expect(decodeRaw(raw)).toBe(
      [
        'To: recipient@example.com',
        'Bcc: blind@example.com',
        'Subject: =?UTF-8?B?UG96ZHJhdiDFvWl2am8=?=',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        '',
      ].join('\r\n'),
    )
  })

  test.each([
    {
      to: ['recipient@example.com\r\nBcc: injected@example.com'],
      subject: 'Safe',
      bodyText: '',
    },
    {
      to: ['recipient@example.com'],
      subject: 'Safe\r\nX-Injected: yes',
      bodyText: '',
    },
  ])('rejects malformed direct builder input before encoding', (input) => {
    expect(() => buildGmailDraftRaw(input as never)).toThrow(
      expect.objectContaining({ code: 'invalid_action_input' }),
    )
  })
})

describe('gmailDraftCreate', () => {
  test('creates one standalone Draft with exact managed attachment bytes and provenance', async () => {
    const calls: { init?: Parameters<typeof fetch>[1] }[] = []
    const input = {
      to: ['recipient@example.test'],
      subject: 'Attached',
      bodyText: 'See file.',
      attachments: [{ ref: managedArtifact.ref }],
    }
    const resource = await gmailDraftCreate(
      context(
        input,
        (async (
          _input: Parameters<typeof fetch>[0],
          init?: Parameters<typeof fetch>[1],
        ) => {
          calls.push({ init })
          return Response.json({
            id: 'attachment-draft',
            message: { id: 'attachment-message', labelIds: ['DRAFT'] },
          })
        }) as unknown as typeof fetch,
        undefined,
        async (ref) => (ref === managedArtifact.ref ? managedArtifact : null),
      ),
    )
    expect(calls).toHaveLength(1)
    const request = JSON.parse(String(calls[0]?.init?.body))
    const mime = decodeRaw(request.message.raw)
    expect(mime).toContain('Content-Type: multipart/mixed;')
    expect(mime).toContain(
      'Content-Disposition: attachment; filename="report.bin"',
    )
    expect(mime).toContain('AAH+/w==')
    expect(resource).toMatchObject({
      ref: `ctx://${sourceId}/draft/attachment-draft`,
      payload: { managedAttachmentRefs: [managedArtifact.ref] },
    })
  })

  test('creates one native threaded reply Draft with exact Gmail thread headers', async () => {
    const calls: { init?: Parameters<typeof fetch>[1] }[] = []
    const parentRef = `ctx://${sourceId}/message/parent-1`
    const resource = await gmailDraftCreate(
      context(
        {
          replyToRef: parentRef,
          bodyText: 'Reply body',
          attachments: [{ ref: managedArtifact.ref }],
        },
        (async (
          _input: Parameters<typeof fetch>[0],
          init?: Parameters<typeof fetch>[1],
        ) => {
          calls.push({ init })
          return Response.json({
            id: 'reply-draft-1',
            message: {
              id: 'reply-message-1',
              threadId: 'thread-1',
              labelIds: ['DRAFT'],
            },
          })
        }) as unknown as typeof fetch,
        (ref) =>
          ref === parentRef
            ? {
                ref,
                sourceId,
                profile: { id: 'communication.message', version: 1 },
                completeness: 'complete',
                deletedAt: null,
                payload: {
                  providerMessageId: 'parent-1',
                  threadId: 'thread-1',
                  rfcMessageId: '<parent@example.com>',
                  references: ['<root@example.com>'],
                  replyTo: ['Reply Person <reply@example.com>'],
                  from: ['Sender <sender@example.com>'],
                  subject: 'RE: Project',
                },
              }
            : null,
        async (ref) => (ref === managedArtifact.ref ? managedArtifact : null),
      ),
    )

    const body = JSON.parse(String(calls[0]?.init?.body))
    expect(body.message.threadId).toBe('thread-1')
    const mime = decodeRaw(body.message.raw)
    expect(mime).toContain('To: Reply Person <reply@example.com>')
    expect(mime).toContain('In-Reply-To: <parent@example.com>')
    expect(mime).toContain(
      'References: <root@example.com> <parent@example.com>',
    )
    expect(mime).toContain('AAH+/w==')
    expect(resource).toMatchObject({
      ref: `ctx://${sourceId}/draft/reply-draft-1`,
      title: 'Re: Project',
      payload: {
        to: ['Reply Person <reply@example.com>'],
        subject: 'Re: Project',
        inReplyTo: '<parent@example.com>',
        references: ['<root@example.com>', '<parent@example.com>'],
        replyToRef: parentRef,
        threadId: 'thread-1',
        managedAttachmentRefs: [managedArtifact.ref],
      },
    })
    expect(calls).toHaveLength(1)
  })

  test('rejects a missing local reply parent before fetch', async () => {
    let fetchCalls = 0
    const error = await gmailDraftCreate(
      context(
        { replyToRef: `ctx://${sourceId}/message/missing`, bodyText: '' },
        (async () => {
          fetchCalls += 1
          throw new Error('must not fetch')
        }) as unknown as typeof fetch,
      ),
    ).catch((caught) => caught)
    expect(error).toMatchObject({ code: 'invalid_action_input' })
    expect(String(error)).toContain('ctxindex get')
    expect(fetchCalls).toBe(0)
  })

  test.each([
    { replyTo: ['safe@example.test\r\nBcc: injected@example.test'] },
    { subject: 'Safe\r\nBcc: injected@example.test' },
    { rfcMessageId: '<parent@example.test>\r\nBcc: injected@example.test' },
    { references: ['<root@example.test>\r\nBcc: injected@example.test'] },
  ])('rejects unsafe derived reply headers before fetch', async (override) => {
    const parentRef = `ctx://${sourceId}/message/parent`
    let fetchCalls = 0
    const error = await gmailDraftCreate(
      context(
        { replyToRef: parentRef, bodyText: '' },
        (async () => {
          fetchCalls += 1
          throw new Error('must not fetch')
        }) as unknown as typeof fetch,
        () => ({
          ref: parentRef,
          sourceId,
          profile: { id: 'communication.message', version: 1 },
          completeness: 'complete',
          deletedAt: null,
          payload: {
            providerMessageId: 'parent',
            threadId: 'thread-1',
            rfcMessageId: '<parent@example.test>',
            from: ['sender@example.test'],
            subject: 'Safe',
            ...override,
          },
        }),
      ),
    ).catch((caught) => caught)
    expect(error).toMatchObject({ code: 'invalid_action_input' })
    expect(fetchCalls).toBe(0)
  })

  test.each([
    [
      'incomplete',
      {
        completeness: 'partial' as const,
        deletedAt: null,
        providerDraftId: undefined,
      },
    ],
    [
      'deleted',
      {
        completeness: 'complete' as const,
        deletedAt: 1,
        providerDraftId: undefined,
      },
    ],
    [
      'Draft',
      {
        completeness: 'complete' as const,
        deletedAt: null,
        providerDraftId: 'draft-1',
      },
    ],
  ])('rejects a %s reply parent before fetch', async (_name, state) => {
    const parentRef = `ctx://${sourceId}/message/parent`
    let fetchCalls = 0
    const error = await gmailDraftCreate(
      context(
        { replyToRef: parentRef, bodyText: '' },
        (async () => {
          fetchCalls += 1
          throw new Error('must not fetch')
        }) as unknown as typeof fetch,
        () => ({
          ref: parentRef,
          sourceId,
          profile: { id: 'communication.message', version: 1 },
          completeness: state.completeness,
          deletedAt: state.deletedAt,
          payload: {
            providerMessageId: 'parent',
            ...(state.providerDraftId
              ? { providerDraftId: state.providerDraftId }
              : {}),
            threadId: 'thread-1',
            rfcMessageId: '<parent@example.test>',
            from: ['sender@example.test'],
          },
        }),
      ),
    ).catch((caught) => caught)
    expect(error).toMatchObject({ code: 'invalid_action_input' })
    expect(fetchCalls).toBe(0)
  })

  test('is bound declaratively and performs one exact POST with a stable Draft Resource', async () => {
    const calls: { url: string; init?: Parameters<typeof fetch>[1] }[] = []
    const mockedFetch = (async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      calls.push({ url: input.toString(), init })
      return new Response(
        JSON.stringify({
          id: 'draft/id 1',
          message: {
            id: 'message-1',
            threadId: 'thread-1',
            labelIds: ['DRAFT', 'UNREAD'],
          },
        }),
      )
    }) as unknown as typeof fetch
    const input = {
      to: ['to@example.com'],
      cc: ['cc@example.com'],
      bcc: ['bcc@example.com'],
      subject: 'Subject',
      bodyText: 'Body',
    }

    const binding =
      gmailAdapterDefinition.actions['communication.message.draft.create']
    expect(binding?.profile).toEqual({
      id: 'communication.message',
      version: 1,
    })
    expect(binding?.output).toEqual({ id: 'communication.message', version: 1 })
    expect(binding?.input).toBe(communicationMessageDraftCreateInputSchema)
    const resource = await binding?.run(context(input, mockedFetch))

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(
      'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
    )
    expect(calls[0]?.init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal,
    })
    const body = JSON.parse(String(calls[0]?.init?.body))
    expect(body).toEqual({ message: { raw: buildGmailDraftRaw(input) } })
    expect(resource).toEqual({
      ref: `ctx://${sourceId}/draft/draft%2Fid%201`,
      profile: { id: 'communication.message', version: 1 },
      title: 'Subject',
      payload: {
        providerDraftId: 'draft/id 1',
        providerMessageId: 'message-1',
        to: ['to@example.com'],
        cc: ['cc@example.com'],
        bcc: ['bcc@example.com'],
        subject: 'Subject',
        bodyText: 'Body',
        managedAttachmentRefs: [],
        threadId: 'thread-1',
        conversationKey: `${sourceId}:thread-1`,
        labels: ['DRAFT', 'UNREAD'],
        unread: true,
      },
    })
  })

  test('routes one Draft POST through the non-production loopback base', async () => {
    const previousMockBase = process.env.CTXINDEX_GMAIL_MOCK_BASE_URL
    const previousNodeEnv = process.env.NODE_ENV
    process.env.CTXINDEX_GMAIL_MOCK_BASE_URL =
      'http://127.0.0.1:4567/mock-base/'
    process.env.NODE_ENV = 'test'
    resetEnvForTests()
    const urls: string[] = []
    try {
      await gmailDraftCreate(
        context({ to: ['to@example.com'], subject: '', bodyText: '' }, (async (
          input: Parameters<typeof fetch>[0],
        ) => {
          urls.push(input.toString())
          return Response.json({
            id: 'draft-1',
            message: { id: 'message-1' },
          })
        }) as unknown as typeof fetch),
      )
    } finally {
      if (previousMockBase === undefined)
        delete process.env.CTXINDEX_GMAIL_MOCK_BASE_URL
      else process.env.CTXINDEX_GMAIL_MOCK_BASE_URL = previousMockBase
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnv
      resetEnvForTests()
    }

    expect(urls).toEqual([
      'http://127.0.0.1:4567/mock-base/gmail/v1/users/me/drafts',
    ])
  })

  test('defensively rejects malformed direct input before fetch', async () => {
    let fetchCalls = 0
    const error = await gmailDraftCreate(
      context(
        {
          to: ['to@example.com\r\nBcc: injected@example.com'],
          subject: '',
          bodyText: '',
        },
        (async () => {
          fetchCalls += 1
          throw new Error('must not fetch')
        }) as unknown as typeof fetch,
      ),
    ).catch((caught) => caught)

    expect(error).toMatchObject({ code: 'invalid_action_input' })
    expect(fetchCalls).toBe(0)
  })

  test.each([
    [401, 'auth_expired'],
    [403, 'permission_denied'],
    [429, 'rate_limited'],
    [500, 'provider_unavailable'],
  ] as const)('maps HTTP %i with one request', async (status, code) => {
    let fetchCalls = 0
    const error = await gmailDraftCreate(
      context(
        { to: ['to@example.com'], subject: '', bodyText: '' },
        (async () => {
          fetchCalls += 1
          return new Response('{}', { status })
        }) as unknown as typeof fetch,
      ),
    ).catch((caught) => caught)
    expect(error).toMatchObject({ code })
    expect(fetchCalls).toBe(1)
  })

  test.each([
    ['not-json', 'malformed JSON'],
    [JSON.stringify({ id: 'draft-1', message: {} }), 'invalid shape'],
  ])('maps %s response to provider_bad_response', async (body) => {
    let fetchCalls = 0
    const error = await gmailDraftCreate(
      context(
        { to: ['to@example.com'], subject: '', bodyText: '' },
        (async () => {
          fetchCalls += 1
          return new Response(body)
        }) as unknown as typeof fetch,
      ),
    ).catch((caught) => caught)
    expect(error).toMatchObject({ code: 'provider_bad_response' })
    expect(fetchCalls).toBe(1)
  })
})

describe('gmailDraftUpdate', () => {
  test('replays the exact proven managed attachment set in one replacement', async () => {
    const draftRef = `ctx://${sourceId}/draft/attachment-draft`
    const calls: { init?: Parameters<typeof fetch>[1] }[] = []
    const resource = await gmailDraftUpdate(
      context(
        {
          ref: draftRef,
          to: ['recipient@example.test'],
          subject: 'Updated',
          bodyText: 'Updated body',
        },
        (async (
          _input: Parameters<typeof fetch>[0],
          init?: Parameters<typeof fetch>[1],
        ) => {
          calls.push({ init })
          return Response.json({
            id: 'attachment-draft',
            message: { id: 'updated-message', labelIds: ['DRAFT'] },
          })
        }) as unknown as typeof fetch,
        (ref) =>
          ref === draftRef
            ? {
                ref,
                sourceId,
                profile: { id: 'communication.message', version: 1 },
                completeness: 'complete',
                deletedAt: null,
                payload: {
                  providerMessageId: 'attachment-message',
                  providerDraftId: 'attachment-draft',
                  managedAttachmentRefs: [managedArtifact.ref],
                },
              }
            : null,
        async (ref) => (ref === managedArtifact.ref ? managedArtifact : null),
      ),
    )
    expect(calls).toHaveLength(1)
    const request = JSON.parse(String(calls[0]?.init?.body))
    expect(decodeRaw(request.message.raw)).toContain('AAH+/w==')
    expect(resource.payload).toMatchObject({
      managedAttachmentRefs: [managedArtifact.ref],
    })
  })

  test('rejects unknown or unavailable managed provenance before provider I/O', async () => {
    const draftRef = `ctx://${sourceId}/draft/legacy-draft`
    for (const managedAttachmentRefs of [undefined, [managedArtifact.ref]]) {
      let fetchCalls = 0
      const error = await gmailDraftUpdate(
        context(
          {
            ref: draftRef,
            to: ['recipient@example.test'],
            subject: 'Updated',
            bodyText: 'Updated body',
          },
          (async () => {
            fetchCalls += 1
            throw new Error('must not fetch')
          }) as unknown as typeof fetch,
          () => ({
            ref: draftRef,
            sourceId,
            profile: { id: 'communication.message', version: 1 },
            completeness: 'complete',
            deletedAt: null,
            payload: {
              providerMessageId: 'legacy-message',
              providerDraftId: 'legacy-draft',
              ...(managedAttachmentRefs === undefined
                ? {}
                : { managedAttachmentRefs }),
            },
          }),
        ),
      ).catch((caught) => caught)
      expect(error).toMatchObject({ code: 'invalid_action_input' })
      expect(fetchCalls).toBe(0)
    }
  })

  test('rejects standalone update of a locally stored reply Draft before fetch', async () => {
    const parentRef = `ctx://${sourceId}/message/parent-1`
    const draftRef = `ctx://${sourceId}/draft/reply-draft-1`
    let fetchCalls = 0
    const error = await gmailDraftUpdate(
      context(
        {
          ref: draftRef,
          to: ['replacement@example.com'],
          subject: 'Replacement',
          bodyText: 'Replacement body',
        },
        (async () => {
          fetchCalls += 1
          throw new Error('must not fetch')
        }) as unknown as typeof fetch,
        (ref) =>
          ref === draftRef
            ? {
                ref,
                sourceId,
                profile: { id: 'communication.message', version: 1 },
                completeness: 'complete',
                deletedAt: null,
                payload: {
                  providerMessageId: 'reply-message-1',
                  providerDraftId: 'reply-draft-1',
                  managedAttachmentRefs: [],
                  replyToRef: parentRef,
                },
              }
            : null,
      ),
    ).catch((caught) => caught)

    expect(error).toMatchObject({ code: 'invalid_action_input' })
    expect(fetchCalls).toBe(0)
  })

  test('updates one threaded reply Draft with immutable parent and exact thread headers', async () => {
    const parentRef = `ctx://${sourceId}/message/parent-1`
    const draftRef = `ctx://${sourceId}/draft/reply-draft-1`
    const resources = new Map([
      [
        parentRef,
        {
          ref: parentRef,
          sourceId,
          profile: { id: 'communication.message', version: 1 } as const,
          completeness: 'complete' as const,
          deletedAt: null,
          payload: {
            providerMessageId: 'parent-1',
            threadId: 'thread-1',
            rfcMessageId: '<parent@example.com>',
            from: ['sender@example.com'],
            subject: 'Project',
          },
        },
      ],
      [
        draftRef,
        {
          ref: draftRef,
          sourceId,
          profile: { id: 'communication.message', version: 1 } as const,
          completeness: 'complete' as const,
          deletedAt: null,
          payload: {
            providerMessageId: 'reply-message-1',
            providerDraftId: 'reply-draft-1',
            managedAttachmentRefs: [],
            replyToRef: parentRef,
            to: ['sender@example.com'],
            subject: 'Re: Project',
            threadId: 'thread-1',
            inReplyTo: '<parent@example.com>',
            references: ['<parent@example.com>'],
          },
        },
      ],
    ])
    const calls: { init?: Parameters<typeof fetch>[1] }[] = []
    const resource = await gmailDraftUpdate(
      context(
        { ref: draftRef, replyToRef: parentRef, bodyText: 'Updated reply' },
        (async (
          _input: Parameters<typeof fetch>[0],
          init?: Parameters<typeof fetch>[1],
        ) => {
          calls.push({ init })
          return Response.json({
            id: 'reply-draft-1',
            message: { id: 'reply-message-2', threadId: 'thread-1' },
          })
        }) as unknown as typeof fetch,
        (ref) => resources.get(ref) ?? null,
      ),
    )
    const request = JSON.parse(String(calls[0]?.init?.body))
    expect(request.message.threadId).toBe('thread-1')
    expect(decodeRaw(request.message.raw)).toContain(
      'In-Reply-To: <parent@example.com>\r\nReferences: <parent@example.com>',
    )
    expect(resource.payload).toMatchObject({
      replyToRef: parentRef,
      bodyText: 'Updated reply',
      threadId: 'thread-1',
    })
    expect(calls).toHaveLength(1)
  })

  test('preserves stored reply context when parent metadata drifts after creation', async () => {
    const parentRef = `ctx://${sourceId}/message/parent-1`
    const draftRef = `ctx://${sourceId}/draft/reply-draft-1`
    const resources = new Map([
      [
        parentRef,
        {
          ref: parentRef,
          sourceId,
          profile: { id: 'communication.message', version: 1 } as const,
          completeness: 'complete' as const,
          deletedAt: null,
          payload: {
            providerMessageId: 'parent-1',
            threadId: 'drifted-thread',
            rfcMessageId: '<drifted@example.com>',
            references: ['<drifted-root@example.com>'],
            replyTo: ['drifted@example.com'],
            subject: 'Drifted subject',
          },
        },
      ],
      [
        draftRef,
        {
          ref: draftRef,
          sourceId,
          profile: { id: 'communication.message', version: 1 } as const,
          completeness: 'complete' as const,
          deletedAt: null,
          payload: {
            providerMessageId: 'reply-message-1',
            providerDraftId: 'reply-draft-1',
            managedAttachmentRefs: [],
            replyToRef: parentRef,
            to: ['original@example.com'],
            subject: 'Re: Original subject',
            threadId: 'original-thread',
            inReplyTo: '<original@example.com>',
            references: [
              '<original-root@example.com>',
              '<original@example.com>',
            ],
          },
        },
      ],
    ])
    const calls: { init?: Parameters<typeof fetch>[1] }[] = []

    const resource = await gmailDraftUpdate(
      context(
        { ref: draftRef, replyToRef: parentRef, bodyText: 'Updated reply' },
        (async (
          _input: Parameters<typeof fetch>[0],
          init?: Parameters<typeof fetch>[1],
        ) => {
          calls.push({ init })
          return Response.json({
            id: 'reply-draft-1',
            message: { id: 'reply-message-2', threadId: 'original-thread' },
          })
        }) as unknown as typeof fetch,
        (ref) => resources.get(ref) ?? null,
      ),
    )

    const request = JSON.parse(String(calls[0]?.init?.body))
    expect(request.message.threadId).toBe('original-thread')
    expect(decodeRaw(request.message.raw)).toContain(
      [
        'To: original@example.com',
        'Subject: Re: Original subject',
        'In-Reply-To: <original@example.com>',
        'References: <original-root@example.com> <original@example.com>',
      ].join('\r\n'),
    )
    expect(resource.payload).toMatchObject({
      to: ['original@example.com'],
      subject: 'Re: Original subject',
      threadId: 'original-thread',
      inReplyTo: '<original@example.com>',
      references: ['<original-root@example.com>', '<original@example.com>'],
      replyToRef: parentRef,
    })
    expect(calls).toHaveLength(1)
  })

  test('rejects unsafe stored reply headers on update before fetch', async () => {
    const parentRef = `ctx://${sourceId}/message/parent-1`
    const draftRef = `ctx://${sourceId}/draft/reply-draft-1`
    let fetchCalls = 0
    const error = await gmailDraftUpdate(
      context(
        { ref: draftRef, replyToRef: parentRef, bodyText: '' },
        (async () => {
          fetchCalls += 1
          throw new Error('must not fetch')
        }) as unknown as typeof fetch,
        (ref) =>
          ref === draftRef
            ? {
                ref,
                sourceId,
                profile: { id: 'communication.message', version: 1 },
                completeness: 'complete',
                deletedAt: null,
                payload: {
                  providerMessageId: 'reply-message-1',
                  providerDraftId: 'reply-draft-1',
                  managedAttachmentRefs: [],
                  replyToRef: parentRef,
                  to: ['sender@example.test'],
                  subject: 'Safe\r\nBcc: injected@example.test',
                  threadId: 'thread-1',
                  inReplyTo: '<parent@example.test>',
                  references: ['<parent@example.test>'],
                },
              }
            : {
                ref,
                sourceId,
                profile: { id: 'communication.message', version: 1 },
                completeness: 'complete',
                deletedAt: null,
                payload: {
                  providerMessageId: 'parent-1',
                  threadId: 'thread-1',
                  rfcMessageId: '<parent@example.test>',
                  from: ['sender@example.test'],
                  subject: 'Safe',
                },
              },
      ),
    ).catch((caught) => caught)
    expect(error).toMatchObject({ code: 'invalid_action_input' })
    expect(fetchCalls).toBe(0)
  })

  test('is bound declaratively and performs one exact PUT with complete replacement content', async () => {
    const calls: { url: string; init?: Parameters<typeof fetch>[1] }[] = []
    const mockedFetch = (async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      calls.push({ url: input.toString(), init })
      return Response.json({
        id: 'draft/id 1',
        message: {
          id: 'message-2',
          threadId: 'thread-2',
          labelIds: ['DRAFT', 'UNREAD'],
        },
      })
    }) as unknown as typeof fetch
    const input = {
      ref: `ctx://${sourceId}/draft/draft%2Fid%201`,
      to: ['replacement@example.com'],
      subject: 'Replacement',
      bodyText: 'Replacement body',
    }

    const binding =
      gmailAdapterDefinition.actions['communication.message.draft.update']
    expect(binding?.profile).toEqual({
      id: 'communication.message',
      version: 1,
    })
    expect(binding?.output).toEqual({ id: 'communication.message', version: 1 })
    expect(binding?.input).toBe(communicationMessageDraftUpdateInputSchema)
    const resource = await binding?.run(context(input, mockedFetch))

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(
      'https://gmail.googleapis.com/gmail/v1/users/me/drafts/draft%2Fid%201',
    )
    expect(calls[0]?.init).toMatchObject({
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      signal,
    })
    const requestBody = JSON.parse(String(calls[0]?.init?.body)) as {
      message: { raw: string }
    }
    expect(requestBody).toEqual({
      message: {
        raw: buildGmailDraftRaw({
          to: input.to,
          subject: input.subject,
          bodyText: input.bodyText,
        }),
      },
    })
    expect(decodeRaw(requestBody.message.raw)).toBe(
      [
        'To: replacement@example.com',
        'Subject: Replacement',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        'Replacement body',
      ].join('\r\n'),
    )
    expect(resource).toEqual({
      ref: input.ref,
      profile: { id: 'communication.message', version: 1 },
      title: 'Replacement',
      payload: {
        providerDraftId: 'draft/id 1',
        providerMessageId: 'message-2',
        to: ['replacement@example.com'],
        cc: [],
        bcc: [],
        subject: 'Replacement',
        bodyText: 'Replacement body',
        managedAttachmentRefs: [],
        threadId: 'thread-2',
        conversationKey: `${sourceId}:thread-2`,
        labels: ['DRAFT', 'UNREAD'],
        unread: true,
      },
    })
  })

  test.each([
    [`ctx://01KXHBNECDAH1T4MJ38X88EPFK/draft/draft-1`, 'ref_source_mismatch'],
    [`ctx://${sourceId.toLowerCase()}/draft/draft-1`, 'invalid_ref'],
    [`ctx://${sourceId}/message/message-1`, 'action_unsupported'],
    [`ctx://${sourceId}/draft/draft-1?format=full`, 'invalid_ref'],
    [`ctx://${sourceId}/draft/draft-1/extra`, 'invalid_ref'],
    [`ctx://${sourceId}/draft/draft-1/`, 'invalid_ref'],
    [`ctx://${sourceId}/draft/draft%ZZ`, 'invalid_ref'],
  ] as const)('rejects non-addressable Ref %s before fetch', async (ref, code) => {
    let fetchCalls = 0
    const error = await gmailDraftUpdate(
      context(
        {
          ref,
          to: ['to@example.com'],
          subject: '',
          bodyText: '',
        },
        (async () => {
          fetchCalls += 1
          throw new Error('must not fetch')
        }) as unknown as typeof fetch,
      ),
    ).catch((caught) => caught)

    expect(error).toMatchObject({ code })
    expect(fetchCalls).toBe(0)
  })

  test('defensively rejects incomplete direct input before Ref parsing or fetch', async () => {
    let fetchCalls = 0
    const error = await gmailDraftUpdate(
      context(
        { ref: `ctx://${sourceId}/draft/draft-1`, subject: '', bodyText: '' },
        (async () => {
          fetchCalls += 1
          throw new Error('must not fetch')
        }) as unknown as typeof fetch,
      ),
    ).catch((caught) => caught)

    expect(error).toMatchObject({ code: 'invalid_action_input' })
    expect(fetchCalls).toBe(0)
  })

  test.each([
    [404, 'not_found'],
    [401, 'auth_expired'],
    [403, 'permission_denied'],
    [429, 'rate_limited'],
    [503, 'provider_unavailable'],
  ] as const)('maps HTTP %i with exactly one PUT', async (status, code) => {
    let fetchCalls = 0
    const error = await gmailDraftUpdate(
      context(
        {
          ref: `ctx://${sourceId}/draft/draft-1`,
          to: ['to@example.com'],
          subject: '',
          bodyText: '',
        },
        (async () => {
          fetchCalls += 1
          return new Response('{}', { status })
        }) as unknown as typeof fetch,
      ),
    ).catch((caught) => caught)

    expect(error).toMatchObject({ code })
    expect(fetchCalls).toBe(1)
  })

  test.each([
    ['not-json', 'malformed JSON'],
    [JSON.stringify({ id: 'draft-1' }), 'missing Message'],
    [
      JSON.stringify({ id: 'other-draft', message: { id: 'message-2' } }),
      'mismatched Draft id',
    ],
  ])('maps %s response to provider_bad_response', async (body) => {
    let fetchCalls = 0
    const error = await gmailDraftUpdate(
      context(
        {
          ref: `ctx://${sourceId}/draft/draft-1`,
          to: ['to@example.com'],
          subject: '',
          bodyText: '',
        },
        (async () => {
          fetchCalls += 1
          return new Response(body)
        }) as unknown as typeof fetch,
      ),
    ).catch((caught) => caught)

    expect(error).toMatchObject({ code: 'provider_bad_response' })
    expect(fetchCalls).toBe(1)
  })

  test('routes one Draft PUT through the non-production loopback base', async () => {
    const previousMockBase = process.env.CTXINDEX_GMAIL_MOCK_BASE_URL
    const previousNodeEnv = process.env.NODE_ENV
    process.env.CTXINDEX_GMAIL_MOCK_BASE_URL =
      'http://127.0.0.1:4567/mock-base/'
    process.env.NODE_ENV = 'test'
    resetEnvForTests()
    const urls: string[] = []
    try {
      await gmailDraftUpdate(
        context(
          {
            ref: `ctx://${sourceId}/draft/draft-1`,
            to: ['to@example.com'],
            subject: '',
            bodyText: '',
          },
          (async (input: Parameters<typeof fetch>[0]) => {
            urls.push(input.toString())
            return Response.json({
              id: 'draft-1',
              message: { id: 'message-2' },
            })
          }) as unknown as typeof fetch,
        ),
      )
    } finally {
      if (previousMockBase === undefined)
        delete process.env.CTXINDEX_GMAIL_MOCK_BASE_URL
      else process.env.CTXINDEX_GMAIL_MOCK_BASE_URL = previousMockBase
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnv
      resetEnvForTests()
    }

    expect(urls).toEqual([
      'http://127.0.0.1:4567/mock-base/gmail/v1/users/me/drafts/draft-1',
    ])
  })
})
