import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import type { InferProfilePayload } from '@ctxindex/extension-sdk'
import {
  communicationMessageDraftCreateInputSchema,
  communicationMessageDraftUpdateInputSchema,
  communicationMessageProfile,
  deriveCommunicationMessageReplyRecipient,
  deriveCommunicationMessageReplyReferences,
  deriveCommunicationMessageReplySubject,
} from './index'

type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends <T>() => T extends TRight ? 1 : 2
    ? true
    : false
type Assert<T extends true> = T
type CommunicationMessagePayload = InferProfilePayload<
  typeof communicationMessageProfile
>
type _PayloadIsInferred = Assert<
  Equal<
    CommunicationMessagePayload,
    {
      providerMessageId: string
      providerDraftId?: string | undefined
      threadId?: string | undefined
      conversationKey?: string | undefined
      rfcMessageId?: string | undefined
      inReplyTo?: string | undefined
      references?: string[] | undefined
      replyTo?: string[] | undefined
      replyToRef?: string | undefined
      subject?: string | undefined
      from?: string[] | undefined
      to?: string[] | undefined
      cc?: string[] | undefined
      bcc?: string[] | undefined
      date?: string | undefined
      snippet?: string | undefined
      bodyText?: string | undefined
      labels?: string[] | undefined
      unread?: boolean | undefined
      attachments?:
        | {
            ref: string
            filename?: string | undefined
            mediaType?: string | undefined
            byteSize?: number | undefined
          }[]
        | undefined
    }
  >
>

describe('communication.message Profile v1', () => {
  test('strictly validates the minimal Gmail search/get payload', () => {
    const payload: CommunicationMessagePayload = {
      providerMessageId: 'gmail-message-1',
      threadId: 'gmail-thread-1',
      conversationKey: 'SOURCE-1:gmail-thread-1',
      rfcMessageId: '<message@example.com>',
      inReplyTo: '<parent@example.com>',
      references: ['<root@example.com>', '<parent@example.com>'],
      replyTo: ['reply@example.com'],
      subject: 'Project update',
      from: ['sender@example.com'],
      to: ['recipient@example.com'],
      cc: ['copy@example.com'],
      bcc: ['blind@example.com'],
      date: '2026-07-14T10:30:00.000Z',
      snippet: 'The project is on track.',
      bodyText: 'The project is on track for Friday.',
      labels: ['INBOX', 'UNREAD'],
      unread: true,
    }

    expect(communicationMessageProfile.schema.parse(payload)).toEqual(payload)
    expect(() => communicationMessageProfile.schema.parse({})).toThrow()
    expect(() =>
      communicationMessageProfile.schema.parse({
        providerMessageId: 'gmail-message-1',
        providerOnly: true,
      }),
    ).toThrow()
  })

  test('declares the strict reversible Draft create Action and rejects header injection', () => {
    const action =
      communicationMessageProfile.actions?.[
        'communication.message.draft.create'
      ]

    expect(action).toEqual({
      effect: 'reversible',
      input: communicationMessageDraftCreateInputSchema,
      output: { id: 'communication.message', version: 1 },
      docs: 'Create a Draft in the selected mailbox Source.',
      examples: [
        {
          to: ['recipient@example.com'],
          subject: 'Project update',
          bodyText: 'The project is on track.',
        },
        {
          replyToRef:
            'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/message/stable-message-id',
          bodyText: 'Thanks for the update.',
        },
      ],
    })
    expect(
      communicationMessageDraftCreateInputSchema.parse({
        to: ['recipient@example.com'],
        cc: [],
        bcc: ['blind@example.com'],
        subject: '',
        bodyText: '',
      }),
    ).toEqual({
      to: ['recipient@example.com'],
      cc: [],
      bcc: ['blind@example.com'],
      subject: '',
      bodyText: '',
    })
    for (const input of [
      { to: [], subject: '', bodyText: '' },
      {
        to: ['recipient@example.com\r\nBcc: injected@example.com'],
        subject: '',
        bodyText: '',
      },
      {
        to: ['recipient@example.com'],
        cc: ['bad\nheader'],
        subject: '',
        bodyText: '',
      },
      { to: ['recipient@example.com'], subject: 'bad\rheader', bodyText: '' },
      { to: [''], subject: '', bodyText: '' },
      {
        to: ['recipient@example.com'],
        subject: '',
        bodyText: '',
        from: 'forbidden@example.com',
      },
    ]) {
      expect(
        communicationMessageDraftCreateInputSchema.safeParse(input).success,
      ).toBe(false)
    }
    expect(Object.keys(communicationMessageProfile.actions ?? {})).toEqual([
      'communication.message.draft.create',
      'communication.message.draft.update',
    ])
  })

  test('declares strict complete-replacement Draft update with a stable Ref example', () => {
    const action =
      communicationMessageProfile.actions?.[
        'communication.message.draft.update'
      ]

    expect(action).toEqual({
      effect: 'reversible',
      input: communicationMessageDraftUpdateInputSchema,
      output: { id: 'communication.message', version: 1 },
      docs: 'Replace the complete content of the addressed Draft in the selected mailbox Source.',
      examples: [
        {
          ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/draft/stable-draft-id',
          to: ['recipient@example.com'],
          subject: 'Updated project status',
          bodyText: 'The project is ready for review.',
        },
        {
          ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/draft/stable-draft-id',
          replyToRef:
            'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/message/stable-message-id',
          bodyText: 'Updated reply text.',
        },
      ],
    })
    expect(
      communicationMessageDraftUpdateInputSchema.parse({
        ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/draft/stable-draft-id',
        to: ['recipient@example.com'],
        subject: '',
        bodyText: '',
      }),
    ).toEqual({
      ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/draft/stable-draft-id',
      to: ['recipient@example.com'],
      subject: '',
      bodyText: '',
    })
    for (const input of [
      { ref: '', to: ['recipient@example.com'], subject: '', bodyText: '' },
      {
        ref: 'ctx://source/draft/one',
        to: [],
        subject: '',
        bodyText: '',
      },
      {
        ref: 'ctx://source/draft/one',
        to: ['bad\nrecipient'],
        subject: '',
        bodyText: '',
      },
      {
        ref: 'ctx://source/draft/one',
        to: ['recipient@example.com'],
        subject: 'bad\rsubject',
        bodyText: '',
      },
      {
        ref: 'ctx://source/draft/one',
        to: ['recipient@example.com'],
        subject: '',
      },
      {
        ref: 'ctx://source/draft/one',
        to: ['recipient@example.com'],
        subject: '',
        bodyText: '',
        draftId: 'forbidden',
      },
    ]) {
      expect(
        communicationMessageDraftUpdateInputSchema.safeParse(input).success,
      ).toBe(false)
    }
  })

  test('accepts only strict reply Draft branches and preserves standalone branches', () => {
    expect(
      communicationMessageDraftCreateInputSchema.parse({
        replyToRef: 'ctx://SOURCE/message/parent',
        bodyText: 'Reply body',
      }),
    ).toEqual({
      replyToRef: 'ctx://SOURCE/message/parent',
      bodyText: 'Reply body',
    })
    expect(
      communicationMessageDraftUpdateInputSchema.parse({
        ref: 'ctx://SOURCE/draft/one',
        replyToRef: 'ctx://SOURCE/message/parent',
        bodyText: 'Replacement reply body',
      }),
    ).toEqual({
      ref: 'ctx://SOURCE/draft/one',
      replyToRef: 'ctx://SOURCE/message/parent',
      bodyText: 'Replacement reply body',
    })
    for (const input of [
      {
        replyToRef: 'ctx://SOURCE/message/parent',
        bodyText: '',
        to: ['override@example.com'],
      },
      {
        replyToRef: 'ctx://SOURCE/message/parent',
        bodyText: '',
        subject: 'Override',
      },
      {
        replyToRef: 'ctx://SOURCE/message/parent',
        bodyText: '',
        cc: ['override@example.com'],
      },
      {
        replyToRef: 'ctx://SOURCE/message/parent',
        bodyText: '',
        bcc: ['override@example.com'],
      },
      {
        replyToRef: 'ctx://SOURCE/message/parent',
        bodyText: '',
        providerMessageId: 'forbidden',
      },
    ]) {
      expect(
        communicationMessageDraftCreateInputSchema.safeParse(input).success,
      ).toBe(false)
    }
    for (const input of [
      {
        ref: 'ctx://SOURCE/draft/one',
        replyToRef: 'ctx://SOURCE/message/parent',
        bodyText: '',
        to: ['override@example.com'],
      },
      {
        ref: 'ctx://SOURCE/draft/one',
        replyToRef: 'ctx://SOURCE/message/parent',
        bodyText: '',
        subject: 'Override',
      },
      {
        ref: 'ctx://SOURCE/draft/one',
        replyToRef: 'ctx://SOURCE/message/parent',
        bodyText: '',
        cc: ['override@example.com'],
      },
      {
        ref: 'ctx://SOURCE/draft/one',
        replyToRef: 'ctx://SOURCE/message/parent',
        bodyText: '',
        bcc: ['override@example.com'],
      },
      {
        ref: 'ctx://SOURCE/draft/one',
        replyToRef: 'ctx://SOURCE/message/parent',
        bodyText: '',
        providerMessageId: 'forbidden',
      },
    ]) {
      expect(
        communicationMessageDraftUpdateInputSchema.safeParse(input).success,
      ).toBe(false)
    }
  })

  test('derives portable reply recipient, subject, and references deterministically', () => {
    expect(
      deriveCommunicationMessageReplyRecipient({
        providerMessageId: 'parent',
        replyTo: ['reply@example.com', 'second@example.com'],
        from: ['from@example.com'],
      }),
    ).toBe('reply@example.com')
    expect(
      deriveCommunicationMessageReplyRecipient({
        providerMessageId: 'parent',
        from: ['from@example.com'],
      }),
    ).toBe('from@example.com')
    expect(
      deriveCommunicationMessageReplyRecipient({ providerMessageId: 'parent' }),
    ).toBeUndefined()
    expect(deriveCommunicationMessageReplySubject('Re: RE:  Project')).toBe(
      'Re: Project',
    )
    expect(deriveCommunicationMessageReplySubject('')).toBe('Re:')
    expect(deriveCommunicationMessageReplySubject(undefined)).toBe('Re:')
    expect(
      deriveCommunicationMessageReplyReferences(
        ['<root@example.com>', '<parent@example.com>'],
        '<parent@example.com>',
      ),
    ).toEqual(['<root@example.com>', '<parent@example.com>'])
  })

  test('extracts title, occurrence date, chunks, and typed fields purely', () => {
    const payload: CommunicationMessagePayload = {
      providerMessageId: 'gmail-message-1',
      subject: 'Project update',
      from: ['sender@example.com'],
      to: ['recipient@example.com'],
      date: '2026-07-14T10:30:00.000Z',
      snippet: 'The project is on track.',
      bodyText: 'Full project update.',
      unread: true,
    }
    const search = communicationMessageProfile.search

    expect(search?.title?.(payload)).toBe('Project update')
    expect(search?.occurredAt?.(payload)).toEqual(
      new Date('2026-07-14T10:30:00.000Z'),
    )
    expect(search?.chunks?.(payload)).toEqual([
      'Project update',
      'sender@example.com',
      'recipient@example.com',
      'The project is on track.',
      'Full project update.',
    ])
    expect(search?.fields?.sender?.extract(payload)).toEqual([
      'sender@example.com',
    ])
    expect(search?.fields?.unread?.extract(payload)).toBe(true)

    const minimal = { providerMessageId: 'gmail-message-2' }
    expect(search?.title?.(minimal)).toBeNull()
    expect(search?.occurredAt?.(minimal)).toBeNull()
    expect(search?.chunks?.(minimal)).toEqual([])
    expect(search?.fields?.sender?.extract(minimal)).toEqual([])
    expect(search?.fields?.unread?.extract(minimal)).toBeUndefined()
  })

  test('strictly validates and purely extracts attachment descriptors', () => {
    const attachments = [
      {
        ref: 'ctx://SOURCE/message/gmail-message-1/attachment/part-1',
        filename: 'report.pdf',
        mediaType: 'application/pdf',
        byteSize: 42,
      },
      { ref: 'ctx://SOURCE/message/gmail-message-1/attachment/inline' },
    ]
    const payload: CommunicationMessagePayload = {
      providerMessageId: 'gmail-message-1',
      attachments,
    }

    expect(communicationMessageProfile.schema.parse(payload)).toEqual(payload)
    expect(communicationMessageProfile.artifacts?.(payload)).toEqual(
      attachments,
    )
    expect(communicationMessageProfile.artifacts?.(payload)).not.toBe(
      attachments,
    )
    expect(() =>
      communicationMessageProfile.schema.parse({
        providerMessageId: 'gmail-message-1',
        attachments: [{ ref: 'valid', providerAttachmentId: 'forbidden' }],
      }),
    ).toThrow()
    expect(() =>
      communicationMessageProfile.schema.parse({
        providerMessageId: 'gmail-message-1',
        attachments: [{ ref: 'valid', byteSize: -1 }],
      }),
    ).toThrow()
  })

  test('extracts exact identity fields and natural-key Relations', () => {
    const payload: CommunicationMessagePayload = {
      providerMessageId: 'gmail-message-1',
      conversationKey: 'SOURCE-1:gmail-thread-1',
      rfcMessageId: '<child@example.com>',
      inReplyTo: '<parent@example.com>',
    }
    const search = communicationMessageProfile.search
    const relations = communicationMessageProfile.relations

    expect(search?.fields?.rfcMessageId?.extract(payload)).toBe(
      '<child@example.com>',
    )
    expect(search?.fields?.conversationKey?.extract(payload)).toBe(
      'SOURCE-1:gmail-thread-1',
    )
    expect(relations?.conversation?.(payload)).toEqual({
      field: 'conversationKey',
      value: 'SOURCE-1:gmail-thread-1',
    })
    expect(relations?.parent?.(payload)).toEqual({
      field: 'rfcMessageId',
      value: '<parent@example.com>',
    })
  })

  test('omits identity fields and Relations when values are absent', () => {
    const payload: CommunicationMessagePayload = {
      providerMessageId: 'gmail-message-2',
    }

    expect(
      communicationMessageProfile.search?.fields?.rfcMessageId?.extract(
        payload,
      ),
    ).toBeUndefined()
    expect(
      communicationMessageProfile.search?.fields?.conversationKey?.extract(
        payload,
      ),
    ).toBeUndefined()
    expect(
      communicationMessageProfile.relations?.conversation?.(payload),
    ).toBeUndefined()
    expect(
      communicationMessageProfile.relations?.parent?.(payload),
    ).toBeUndefined()
  })

  test('has no runtime import from core', async () => {
    const source = await readFile(
      `${import.meta.dir}/communication-message.ts`,
      'utf8',
    )
    expect(source).not.toContain("from '@ctxindex/core")
    expect(source).not.toContain('from "@ctxindex/core')
  })
})
