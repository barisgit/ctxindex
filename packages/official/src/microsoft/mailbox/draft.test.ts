import { describe, expect, test } from 'bun:test'
import type {
  ActionArtifact,
  ActionContext,
  ActionResource,
} from '@ctxindex/extension-sdk'
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
const managedArtifact: ActionArtifact = {
  ref: `ctx://${sourceId}/message/source/attachment/file`,
  originRef: `ctx://${sourceId}/message/source`,
  filename: 'report.bin',
  mediaType: 'application/octet-stream',
  byteSize: 4,
  bytes: Uint8Array.from([0, 1, 254, 255]),
}

function parent(): ActionResource {
  return {
    ref: parentRef,
    sourceId,
    profile: { id: 'mail.message', version: 1 },
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
    profile: { id: 'mail.message', version: 1 },
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
  resolveArtifact: ActionContext['resolveArtifact'] = async () => null,
): ActionContext<never> {
  return {
    source: { id: sourceId, config: {} },
    input: input as never,
    signal,
    fetch: mockedFetch,
    logger,
    resolveResource: (ref) =>
      resources.find((value) => value.ref === ref) ?? null,
    resolveArtifact,
  }
}

describe('Microsoft threaded reply Drafts', () => {
  test('creates one standalone MIME Draft with exact managed attachment bytes', async () => {
    const calls: { init?: Parameters<typeof fetch>[1] }[] = []
    const resource = await microsoftDraftCreate(
      context(
        {
          to: ['Doe, Jane <jane@example.test>', 'recipient@example.test'],
          cc: ['Copy Person <copy@example.test>'],
          bcc: ['blind@example.test'],
          subject: 'Attached',
          bodyText: 'See file.',
          attachments: [{ ref: managedArtifact.ref }],
        },
        (async (
          _input: Parameters<typeof fetch>[0],
          init?: Parameters<typeof fetch>[1],
        ) => {
          calls.push({ init })
          return Response.json(
            graphDraft('See file.', {
              subject: 'Attached',
              conversationId: 'attachment-conversation',
              toRecipients: [
                { emailAddress: { address: 'recipient@example.test' } },
              ],
            }),
            { status: 201 },
          )
        }) as unknown as typeof fetch,
        [],
        async (ref) => (ref === managedArtifact.ref ? managedArtifact : null),
      ),
    )
    expect(calls).toHaveLength(1)
    expect(new Headers(calls[0]?.init?.headers).get('content-type')).toBe(
      'text/plain',
    )
    const mime = Buffer.from(String(calls[0]?.init?.body), 'base64').toString()
    expect(mime).toContain('Content-Type: multipart/mixed;')
    expect(mime).toContain(
      'To: "Doe, Jane" <jane@example.test>, recipient@example.test',
    )
    expect(mime).toContain('Cc: Copy Person <copy@example.test>')
    expect(mime).toContain('Bcc: blind@example.test')
    expect(mime).toContain(
      'Content-Disposition: attachment; filename="report.bin"',
    )
    expect(mime).toContain('AAH+/w==')
    expect(resource.payload).toMatchObject({
      managedAttachmentRefs: [managedArtifact.ref],
    })
  })

  test.each([
    {
      path: 'to',
      recipient: 'bad:local@example.test',
      transport: 'attachment MIME create',
    },
    {
      path: 'cc',
      recipient: 'bad(comment)@example.test',
      transport: 'attachment MIME create',
    },
    {
      path: 'bcc',
      recipient: 'Bad\u0000 Name <valid@example.test>',
      transport: 'attachment MIME create',
    },
    {
      path: 'to',
      recipient: 'bad"quote@example.test',
      transport: 'JSON create',
    },
    {
      path: 'cc',
      recipient: 'missing-at.example.test',
      transport: 'JSON update',
    },
    {
      path: 'bcc',
      recipient: 'bad\u007f@example.test',
      transport: 'JSON update',
    },
  ] as const)('rejects malformed $path recipients before $transport Graph I/O', async ({
    path,
    recipient,
    transport,
  }) => {
    let fetchCalls = 0
    const input = {
      ...(transport === 'JSON update'
        ? { ref: `ctx://${sourceId}/draft/standalone-1` }
        : {}),
      to: path === 'to' ? [recipient] : ['valid@example.test'],
      ...(path === 'cc' ? { cc: [recipient] } : {}),
      ...(path === 'bcc' ? { bcc: [recipient] } : {}),
      subject: 'Malformed recipient',
      bodyText: 'Must fail locally.',
      ...(transport === 'attachment MIME create'
        ? { attachments: [{ ref: managedArtifact.ref }] }
        : {}),
    }
    const action =
      transport === 'JSON update' ? microsoftDraftUpdate : microsoftDraftCreate
    const error = await action(
      context(
        input,
        (async () => {
          fetchCalls += 1
          throw new Error('must not fetch')
        }) as unknown as typeof fetch,
        [],
        async (ref) => (ref === managedArtifact.ref ? managedArtifact : null),
      ),
    ).catch((caught) => caught)

    expect(error).toMatchObject({ code: 'invalid_action_input' })
    expect(fetchCalls).toBe(0)
  })

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
      context(
        {
          replyToRef: parentRef,
          bodyText: 'Reply body',
          attachments: [{ ref: managedArtifact.ref }],
        },
        (async (
          input: Parameters<typeof fetch>[0],
          init?: Parameters<typeof fetch>[1],
        ) => {
          calls.push({ url: input.toString(), init })
          return Response.json(graphDraft(), { status: 201 })
        }) as unknown as typeof fetch,
        undefined,
        async (ref) => (ref === managedArtifact.ref ? managedArtifact : null),
      ),
    )

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(
      'https://graph.microsoft.com/v1.0/me/messages/parent%2Fid/createReply',
    )
    expect(calls[0]?.init?.method).toBe('POST')
    expect(new Headers(calls[0]?.init?.headers).get('content-type')).toBe(
      'text/plain',
    )
    const mime = Buffer.from(String(calls[0]?.init?.body), 'base64').toString()
    expect(mime).toContain('To: Reply Person <reply@example.test>')
    expect(mime).toContain('In-Reply-To: <parent@example.test>')
    expect(mime).toContain(
      'References: <root@example.test> <parent@example.test>',
    )
    expect(mime).toContain('AAH+/w==')
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
        managedAttachmentRefs: [managedArtifact.ref],
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
