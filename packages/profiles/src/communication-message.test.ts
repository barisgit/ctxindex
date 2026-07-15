import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import type { InferProfilePayload } from '@ctxindex/extension-sdk'
import { communicationMessageProfile } from './index'

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
      threadId?: string | undefined
      conversationKey?: string | undefined
      rfcMessageId?: string | undefined
      inReplyTo?: string | undefined
      subject?: string | undefined
      from?: string[] | undefined
      to?: string[] | undefined
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
      subject: 'Project update',
      from: ['sender@example.com'],
      to: ['recipient@example.com'],
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
