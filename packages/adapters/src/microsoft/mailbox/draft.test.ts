import { describe, expect, test } from 'bun:test'
import type { ActionContext, ActionResource } from '@ctxindex/extension-sdk'
import { microsoftDraftCreate, microsoftDraftUpdate } from './draft'

const sourceId = '01KXHBNECDAH1T4MJ38X88EPFJ'
const parentRef = `ctx://${sourceId}/message/parent-1`
const draftRef = `ctx://${sourceId}/draft/reply-draft-1`
const signal = new AbortController().signal
const logger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
}

function parent(): ActionResource {
  return {
    ref: parentRef,
    sourceId,
    profile: { id: 'communication.message', version: 1 },
    completeness: 'complete',
    deletedAt: null,
    payload: {
      providerMessageId: 'parent/id',
      threadId: 'conversation-1',
      rfcMessageId: '<parent@example.test>',
      references: ['<root@example.test>'],
      replyTo: ['Reply Person <reply@example.test>'],
      from: ['Sender <sender@example.test>'],
      subject: 'RE: Project',
    },
  }
}

function draft(): ActionResource {
  return {
    ref: draftRef,
    sourceId,
    profile: { id: 'communication.message', version: 1 },
    completeness: 'complete',
    deletedAt: null,
    payload: {
      providerMessageId: 'reply-draft-1',
      providerDraftId: 'reply-draft-1',
      replyToRef: parentRef,
    },
  }
}

function graphDraft(
  body = 'Reply body',
  override: Record<string, unknown> = {},
) {
  return {
    id: 'reply-draft-1',
    conversationId: 'conversation-1',
    internetMessageId: '<reply-draft@example.test>',
    subject: 'Re: Project',
    bodyPreview: body,
    body: { contentType: 'text', content: body },
    from: null,
    replyTo: [],
    toRecipients: [
      {
        emailAddress: {
          name: 'Reply Person',
          address: 'reply@example.test',
        },
      },
    ],
    ccRecipients: [],
    bccRecipients: [],
    receivedDateTime: null,
    sentDateTime: null,
    lastModifiedDateTime: '2026-07-18T10:00:00.000Z',
    isRead: true,
    isDraft: true,
    categories: [],
    hasAttachments: false,
    ...override,
  }
}

function context(
  input: unknown,
  mockedFetch: typeof fetch,
  resources: readonly ActionResource[] = [parent(), draft()],
): ActionContext<never> {
  return {
    source: { id: sourceId, config: {} },
    input: input as never,
    signal,
    fetch: mockedFetch,
    logger,
    resolveResource: (ref) =>
      resources.find((value) => value.ref === ref) ?? null,
  }
}

describe('Microsoft threaded reply Drafts', () => {
  test('rejects standalone update of a locally stored reply Draft before fetch', async () => {
    let fetchCalls = 0
    const error = await microsoftDraftUpdate(
      context(
        {
          ref: draftRef,
          to: ['replacement@example.test'],
          subject: 'Replacement',
          bodyText: 'Replacement body',
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

  test('creates one native reply Draft with MIME content and no provider read', async () => {
    const calls: { url: string; init?: Parameters<typeof fetch>[1] }[] = []
    const resource = await microsoftDraftCreate(
      context({ replyToRef: parentRef, bodyText: 'Reply body' }, (async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        calls.push({ url: input.toString(), init })
        return Response.json(graphDraft(), { status: 201 })
      }) as unknown as typeof fetch),
    )

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(
      'https://graph.microsoft.com/v1.0/me/messages/parent%2Fid/createReply',
    )
    expect(calls[0]?.init?.method).toBe('POST')
    expect(new Headers(calls[0]?.init?.headers).get('content-type')).toBe(
      'text/plain',
    )
    expect(Buffer.from(String(calls[0]?.init?.body), 'base64').toString()).toBe(
      [
        'To: Reply Person <reply@example.test>',
        'Subject: Re: Project',
        'In-Reply-To: <parent@example.test>',
        'References: <root@example.test> <parent@example.test>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        'Reply body',
      ].join('\r\n'),
    )
    expect(resource).toMatchObject({
      ref: draftRef,
      title: 'Re: Project',
      payload: {
        providerDraftId: 'reply-draft-1',
        to: ['Reply Person <reply@example.test>'],
        subject: 'Re: Project',
        bodyText: 'Reply body',
        inReplyTo: '<parent@example.test>',
        references: ['<root@example.test>', '<parent@example.test>'],
        replyToRef: parentRef,
      },
    })
  })

  test('attests reply bodies with semantically equivalent line endings', async () => {
    const resource = await microsoftDraftCreate(
      context(
        { replyToRef: parentRef, bodyText: 'line one\nline two' },
        (async () =>
          Response.json(graphDraft('line one\r\nline two'), {
            status: 201,
          })) as unknown as typeof fetch,
      ),
    )

    expect(resource.payload).toMatchObject({
      bodyText: 'line one\nline two',
      replyToRef: parentRef,
    })
  })

  test.each([
    { rfcMessageId: '<parent@example.test>\r\nBcc: injected@example.test' },
    { references: ['<root@example.test>\nBcc: injected@example.test'] },
  ])('rejects unsafe derived reply message headers before fetch', async (override) => {
    let fetchCalls = 0
    const storedParent = parent()
    const error = await microsoftDraftCreate(
      context(
        { replyToRef: parentRef, bodyText: 'Reply body' },
        (async () => {
          fetchCalls += 1
          throw new Error('must not fetch')
        }) as unknown as typeof fetch,
        [
          {
            ...storedParent,
            payload: {
              ...(storedParent.payload as Record<string, unknown>),
              ...override,
            },
          },
        ],
      ),
    ).catch((caught) => caught)

    expect(error).toMatchObject({ code: 'invalid_action_input' })
    expect(fetchCalls).toBe(0)
  })

  test('updates one reply Draft only after proving immutable replyToRef locally', async () => {
    const calls: { url: string; init?: Parameters<typeof fetch>[1] }[] = []
    const resource = await microsoftDraftUpdate(
      context(
        {
          ref: draftRef,
          replyToRef: parentRef,
          bodyText: 'Replacement reply',
        },
        (async (
          input: Parameters<typeof fetch>[0],
          init?: Parameters<typeof fetch>[1],
        ) => {
          calls.push({ url: input.toString(), init })
          return Response.json(graphDraft('Replacement reply'))
        }) as unknown as typeof fetch,
      ),
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(
      'https://graph.microsoft.com/v1.0/me/messages/reply-draft-1',
    )
    expect(calls[0]?.init?.method).toBe('PATCH')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      subject: 'Re: Project',
      body: { contentType: 'Text', content: 'Replacement reply' },
      toRecipients: [
        {
          emailAddress: {
            name: 'Reply Person',
            address: 'reply@example.test',
          },
        },
      ],
      ccRecipients: [],
      bccRecipients: [],
    })
    expect(resource.payload).toMatchObject({
      replyToRef: parentRef,
      bodyText: 'Replacement reply',
    })
  })

  test.each([
    { subject: 'Unexpected subject' },
    { conversationId: 'unexpected-conversation' },
    { toRecipients: [] },
  ])('rejects a mismatched reply create response', async (override) => {
    const error = await microsoftDraftCreate(
      context({ replyToRef: parentRef, bodyText: 'Reply body' }, (async () =>
        Response.json(graphDraft('Reply body', override), {
          status: 201,
        })) as unknown as typeof fetch),
    ).catch((caught) => caught)
    expect(error).toMatchObject({ code: 'provider_bad_response' })
  })

  test('rejects a mismatched reply update response', async () => {
    const error = await microsoftDraftUpdate(
      context(
        {
          ref: draftRef,
          replyToRef: parentRef,
          bodyText: 'Replacement reply',
        },
        (async () =>
          Response.json(
            graphDraft('Unexpected body'),
          )) as unknown as typeof fetch,
      ),
    ).catch((caught) => caught)
    expect(error).toMatchObject({ code: 'provider_bad_response' })
  })

  test('rejects changed replyToRef before provider I/O', async () => {
    let fetchCalls = 0
    const changedParent = `ctx://${sourceId}/message/other`
    const error = await microsoftDraftUpdate(
      context(
        { ref: draftRef, replyToRef: changedParent, bodyText: '' },
        (async () => {
          fetchCalls += 1
          throw new Error('must not fetch')
        }) as unknown as typeof fetch,
        [draft(), { ...parent(), ref: changedParent }],
      ),
    ).catch((caught) => caught)
    expect(error).toMatchObject({ code: 'invalid_action_input' })
    expect(fetchCalls).toBe(0)
  })

  test('rejects mismatched locally stored provider Draft identity before provider I/O', async () => {
    let fetchCalls = 0
    const storedDraft = draft()
    const error = await microsoftDraftUpdate(
      context(
        {
          ref: draftRef,
          replyToRef: parentRef,
          bodyText: 'Replacement reply',
        },
        (async () => {
          fetchCalls += 1
          throw new Error('must not fetch')
        }) as unknown as typeof fetch,
        [
          parent(),
          {
            ...storedDraft,
            payload: {
              ...(storedDraft.payload as Record<string, unknown>),
              providerDraftId: 'different-draft-id',
            },
          },
        ],
      ),
    ).catch((caught) => caught)

    expect(error).toMatchObject({ code: 'invalid_action_input' })
    expect(fetchCalls).toBe(0)
  })
})
