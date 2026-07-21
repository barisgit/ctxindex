import { defineProfile } from '@ctxindex/extension-sdk'
import { z } from 'zod'

const instantSchema = z.iso.datetime({ offset: true })
const conversationKeySchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}:chat:.+$/)
const resourceRefSchema = z
  .string()
  .regex(
    /^ctx:\/\/[0-9A-HJKMNP-TV-Z]{26}\/(?:[A-Za-z0-9\-._~!$&'()*+,;=:@/]|%[0-9A-F]{2})+$/,
  )

const chatParticipantSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.string().min(1).optional(),
  })
  .strict()

const chatAttachmentSchema = z
  .object({
    ref: z.string().min(1),
    filename: z.string().min(1).optional(),
    mediaType: z.string().min(1).optional(),
    byteSize: z.number().int().nonnegative().optional(),
  })
  .strict()

const chatReplyTargetSchema = z.union([
  z.object({ ref: resourceRefSchema }).strict(),
  z
    .object({
      providerMessageId: z.string().min(1),
      conversationKey: conversationKeySchema.optional(),
    })
    .strict(),
])

export const chatMessageSchema = z
  .object({
    providerMessageId: z.string().min(1),
    conversationKey: conversationKeySchema,
    sender: chatParticipantSchema,
    sentAt: instantSchema,
    editedAt: instantSchema.optional(),
    text: z.string().min(1).optional(),
    replyTo: chatReplyTargetSchema.optional(),
    attachments: z.array(chatAttachmentSchema).min(1).optional(),
    unread: z.boolean().optional(),
  })
  .strict()
  .superRefine((message, context) => {
    if (message.text === undefined && message.attachments === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'A chat message requires text or at least one attachment',
      })
    }
    if (
      message.editedAt !== undefined &&
      Date.parse(message.editedAt) < Date.parse(message.sentAt)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Chat message edit time must not precede sent time',
        path: ['editedAt'],
      })
    }
  })

export type ChatMessage = z.infer<typeof chatMessageSchema>

export function chatMessageNaturalKey(
  conversationKey: string,
  providerMessageId: string,
): string {
  return JSON.stringify([conversationKey, providerMessageId])
}

function takeCodePoints(value: string, limit: number): string {
  return Array.from(value).slice(0, limit).join('')
}

function chatMessageTitle(message: ChatMessage): string {
  const text = message.text?.replace(/\s+/g, ' ').trim()
  return takeCodePoints(
    text ||
      message.attachments?.[0]?.filename ||
      message.sender.displayName ||
      message.sender.id,
    120,
  )
}

function chatMessageChunks(message: ChatMessage): readonly string[] {
  return [
    message.text,
    message.sender.displayName,
    message.sender.id,
    ...(message.attachments ?? []).flatMap((attachment) => [
      attachment.filename,
      attachment.mediaType,
    ]),
  ].filter((value): value is string => value !== undefined)
}

export const chatMessageProfile = defineProfile({
  id: 'chat.message',
  version: 1,
  schema: chatMessageSchema,
  search: {
    title: chatMessageTitle,
    occurredAt: (message) => new Date(message.sentAt),
    chunks: chatMessageChunks,
    fields: {
      providerMessageId: {
        type: 'string',
        extract: (message) => message.providerMessageId,
      },
      messageKey: {
        type: 'string',
        extract: (message) =>
          chatMessageNaturalKey(
            message.conversationKey,
            message.providerMessageId,
          ),
      },
      conversationKey: {
        type: 'string',
        extract: (message) => message.conversationKey,
      },
      senderId: {
        type: 'string',
        extract: (message) => message.sender.id,
      },
      sentAt: {
        type: 'datetime',
        extract: (message) => new Date(message.sentAt),
      },
      editedAt: {
        type: 'datetime',
        extract: (message) =>
          message.editedAt === undefined
            ? undefined
            : new Date(message.editedAt),
      },
      unread: {
        type: 'boolean',
        extract: (message) => message.unread,
      },
    },
  },
  relations: {
    conversation: (message) => ({
      field: 'conversationKey',
      value: message.conversationKey,
    }),
    parent: (message) => {
      if (message.replyTo === undefined) return undefined
      if ('ref' in message.replyTo) return { ref: message.replyTo.ref }
      return {
        field: 'messageKey',
        value: chatMessageNaturalKey(
          message.replyTo.conversationKey ?? message.conversationKey,
          message.replyTo.providerMessageId,
        ),
      }
    },
  },
  artifacts: (message) => [...(message.attachments ?? [])],
})
