import { describe, expect, test } from 'bun:test'
import {
  type ChatMessage,
  chatMessageNaturalKey,
  chatMessageProfile,
  chatMessageSchema,
} from '@ctxindex/profiles/chat-message'

const textMessage = {
  providerMessageId: 'message-42',
  conversationKey: '01K0CY8N1JK6SFM4Y35MBDTJ3E:chat:workspace-7:channel-9',
  sender: { id: 'user-3', displayName: 'Ada Lovelace' },
  sentAt: '2026-07-21T09:30:00Z',
  editedAt: '2026-07-21T09:32:00Z',
  text: 'Status update\nThe release candidate is ready.',
  unread: true,
} satisfies ChatMessage

describe('chat.message Profile v1', () => {
  test('strictly validates text and attachment-only messages', () => {
    expect(chatMessageSchema.parse(textMessage)).toEqual(textMessage)

    const attachmentOnly = {
      providerMessageId: 'message-43',
      conversationKey: '01K0CY8N1JK6SFM4Y35MBDTJ3E:chat:workspace-7:channel-9',
      sender: { id: 'bot-1' },
      sentAt: '2026-07-21T09:35:00+00:00',
      attachments: [
        {
          ref: 'ctx://01K0CY8N1JK6SFM4Y35MBDTJ3E/message/message-43/file/1',
          filename: 'report.pdf',
          mediaType: 'application/pdf',
          byteSize: 128,
        },
      ],
    } satisfies ChatMessage

    expect(chatMessageSchema.parse(attachmentOnly)).toEqual(attachmentOnly)
    expect(chatMessageProfile.search?.title?.(attachmentOnly)).toBe(
      'report.pdf',
    )
    expect(chatMessageProfile.artifacts?.(attachmentOnly)).toEqual(
      attachmentOnly.attachments,
    )
  })

  test('rejects missing content, invalid edit ordering, and unknown fields', () => {
    const invalidPayloads = [
      { ...textMessage, text: undefined },
      {
        ...textMessage,
        editedAt: '2026-07-21T09:29:59Z',
      },
      { ...textMessage, subject: 'Email vocabulary' },
      { ...textMessage, channelId: 'provider-specific' },
      {
        ...textMessage,
        sender: { ...textMessage.sender, username: 'ada' },
      },
      {
        ...textMessage,
        attachments: [{ ref: 'artifact', providerFileId: 'file-1' }],
      },
      { ...textMessage, sender: { displayName: 'No stable identity' } },
      { ...textMessage, providerMessageId: '' },
      { ...textMessage, conversationKey: '' },
      { ...textMessage, conversationKey: 'mail-like-unnamespaced-key' },
      { ...textMessage, sentAt: 'not-an-instant' },
      { ...textMessage, replyTo: { ref: 'not-a-ctxindex-ref' } },
    ]

    for (const payload of invalidPayloads) {
      expect(chatMessageSchema.safeParse(payload).success).toBe(false)
    }
  })

  test('projects title, occurrence, chunks, and typed fields', () => {
    const fields = chatMessageProfile.search?.fields ?? {}
    expect(chatMessageProfile.id).toBe('chat.message')
    expect(chatMessageProfile.version).toBe(1)
    expect(chatMessageProfile.search?.title?.(textMessage)).toBe(
      'Status update The release candidate is ready.',
    )
    expect(chatMessageProfile.search?.occurredAt?.(textMessage)).toEqual(
      new Date(textMessage.sentAt),
    )
    expect(chatMessageProfile.search?.chunks?.(textMessage)).toEqual([
      textMessage.text,
      'Ada Lovelace',
      'user-3',
    ])
    expect(fields.providerMessageId?.extract(textMessage)).toBe('message-42')
    expect(fields.messageKey?.extract(textMessage)).toBe(
      chatMessageNaturalKey(
        '01K0CY8N1JK6SFM4Y35MBDTJ3E:chat:workspace-7:channel-9',
        'message-42',
      ),
    )
    expect(fields.conversationKey?.extract(textMessage)).toBe(
      '01K0CY8N1JK6SFM4Y35MBDTJ3E:chat:workspace-7:channel-9',
    )
    expect(fields.senderId?.extract(textMessage)).toBe('user-3')
    expect(fields.sentAt?.extract(textMessage)).toEqual(
      new Date(textMessage.sentAt),
    )
    expect(fields.editedAt?.extract(textMessage)).toEqual(
      new Date(textMessage.editedAt),
    )
    expect(fields.unread?.extract(textMessage)).toBe(true)

    const longText = `${'a'.repeat(118)}\n${'b'.repeat(20)}`
    expect(
      chatMessageProfile.search?.title?.({ ...textMessage, text: longText }),
    ).toBe(`${'a'.repeat(118)} b`)
  })

  test('derives generic conversation and provider-id parent relations', () => {
    const payload = {
      ...textMessage,
      replyTo: { providerMessageId: 'message-41' },
    } satisfies ChatMessage

    expect(chatMessageProfile.relations?.conversation?.(payload)).toEqual({
      field: 'conversationKey',
      value: '01K0CY8N1JK6SFM4Y35MBDTJ3E:chat:workspace-7:channel-9',
    })
    expect(chatMessageProfile.relations?.parent?.(payload)).toEqual({
      field: 'messageKey',
      value: chatMessageNaturalKey(
        '01K0CY8N1JK6SFM4Y35MBDTJ3E:chat:workspace-7:channel-9',
        'message-41',
      ),
    })

    const crossConversationReply = {
      ...textMessage,
      replyTo: {
        providerMessageId: 'message-1',
        conversationKey:
          '01K0CY8N1JK6SFM4Y35MBDTJ3E:chat:workspace-7:channel-2',
      },
    } satisfies ChatMessage
    expect(
      chatMessageProfile.relations?.parent?.(crossConversationReply),
    ).toEqual({
      field: 'messageKey',
      value: chatMessageNaturalKey(
        '01K0CY8N1JK6SFM4Y35MBDTJ3E:chat:workspace-7:channel-2',
        'message-1',
      ),
    })
  })

  test('preserves an exact Ref parent relation', () => {
    const ref = 'ctx://01K0CY8N1JK6SFM4Y35MBDTJ3E/message/message-41'
    const payload = { ...textMessage, replyTo: { ref } } satisfies ChatMessage

    expect(chatMessageProfile.relations?.parent?.(payload)).toEqual({ ref })
    expect(chatMessageProfile.relations?.parent?.(textMessage)).toBeUndefined()
  })

  test('declares no Actions or exports', () => {
    expect(chatMessageProfile.actions).toBeUndefined()
    expect(chatMessageProfile.exports).toBeUndefined()
  })

  test('remains provider-neutral and core-independent', async () => {
    const source = await Bun.file(
      new URL('chat-message.ts', import.meta.url),
    ).text()

    expect(source).not.toContain('@ctxindex/core')
    expect(source).not.toMatch(/telegram|slack|discord/i)
  })
})
