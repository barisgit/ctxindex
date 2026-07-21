import { CtxindexSyncError } from '@ctxindex/core/errors'
import type {
  ArtifactDescriptor,
  RetrievedResource,
  SearchRemoteResource,
} from '@ctxindex/extension-sdk'
import { mailMessageSchema } from '@ctxindex/profiles'
import { z } from 'zod'

const cleanString = z
  .string()
  .min(1)
  .refine((value) => !/[\r\n]/.test(value))
const emailAddressSchema = z
  .object({ name: cleanString.optional().nullable(), address: cleanString })
  .passthrough()
const recipientSchema = z
  .object({ emailAddress: emailAddressSchema })
  .passthrough()
const headerSchema = z
  .object({
    name: cleanString,
    value: z.string().refine((value) => !/[\r\n]/.test(value)),
  })
  .passthrough()

export const graphMessageSchema = z
  .object({
    id: z.string().min(1),
    conversationId: z.string().min(1).optional().nullable(),
    internetMessageId: z.string().min(1).optional().nullable(),
    internetMessageHeaders: z.array(headerSchema).optional().nullable(),
    subject: z.string().optional().nullable(),
    bodyPreview: z.string().optional().nullable(),
    body: z
      .object({ contentType: z.enum(['text', 'html']), content: z.string() })
      .passthrough()
      .optional()
      .nullable(),
    from: recipientSchema.optional().nullable(),
    replyTo: z.array(recipientSchema).optional().nullable(),
    toRecipients: z.array(recipientSchema).optional().nullable(),
    ccRecipients: z.array(recipientSchema).optional().nullable(),
    bccRecipients: z.array(recipientSchema).optional().nullable(),
    receivedDateTime: z.string().datetime().optional().nullable(),
    sentDateTime: z.string().datetime().optional().nullable(),
    lastModifiedDateTime: z.string().datetime().optional().nullable(),
    isRead: z.boolean(),
    isDraft: z.boolean(),
    categories: z.array(z.string()).optional().nullable(),
    hasAttachments: z.boolean().optional(),
  })
  .passthrough()

export type GraphMessage = z.infer<typeof graphMessageSchema>

function normalizeMessageId(
  value: string | null | undefined,
): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  return trimmed.match(/<[^<>]+>/)?.[0] ?? trimmed
}

function address(value: z.infer<typeof recipientSchema>): string {
  const { name, address } = value.emailAddress
  return name ? `${name} <${address}>` : address
}

function addresses(
  values: readonly z.infer<typeof recipientSchema>[] | null | undefined,
): string[] | undefined {
  return values && values.length > 0 ? values.map(address) : undefined
}

function header(message: GraphMessage, name: string): string | undefined {
  return message.internetMessageHeaders?.find(
    (candidate) => candidate.name.toLowerCase() === name.toLowerCase(),
  )?.value
}

function references(message: GraphMessage): string[] | undefined {
  const value = header(message, 'References')
  if (!value?.trim()) return undefined
  const ids = value.match(/<[^<>]+>/g) ?? value.trim().split(/\s+/)
  return ids.length > 0 ? [...new Set(ids)] : undefined
}

export function parseGraphMessage(value: unknown): GraphMessage {
  const parsed = graphMessageSchema.safeParse(value)
  if (!parsed.success)
    throw new CtxindexSyncError(
      'Microsoft Graph returned an invalid message',
      'provider_bad_response',
      { cause: parsed.error },
    )
  return parsed.data
}

function payload(
  sourceId: string,
  message: GraphMessage,
  bodyText?: string,
  attachments?: readonly ArtifactDescriptor[],
) {
  const occurred = message.receivedDateTime ?? message.sentDateTime ?? undefined
  const conversationId = message.conversationId ?? undefined
  return mailMessageSchema.parse({
    providerMessageId: message.id,
    ...(conversationId
      ? {
          threadId: conversationId,
          conversationKey: `${sourceId.toUpperCase()}:${conversationId}`,
        }
      : {}),
    ...(normalizeMessageId(message.internetMessageId)
      ? { rfcMessageId: normalizeMessageId(message.internetMessageId) }
      : {}),
    ...(normalizeMessageId(header(message, 'In-Reply-To'))
      ? { inReplyTo: normalizeMessageId(header(message, 'In-Reply-To')) }
      : {}),
    ...(references(message) ? { references: references(message) } : {}),
    ...(addresses(message.replyTo)
      ? { replyTo: addresses(message.replyTo) }
      : {}),
    ...(message.subject !== null && message.subject !== undefined
      ? { subject: message.subject }
      : {}),
    ...(message.from ? { from: [address(message.from)] } : {}),
    ...(addresses(message.toRecipients)
      ? { to: addresses(message.toRecipients) }
      : {}),
    ...(addresses(message.ccRecipients)
      ? { cc: addresses(message.ccRecipients) }
      : {}),
    ...(addresses(message.bccRecipients)
      ? { bcc: addresses(message.bccRecipients) }
      : {}),
    ...(occurred ? { date: occurred } : {}),
    ...(message.bodyPreview !== null && message.bodyPreview !== undefined
      ? { snippet: message.bodyPreview }
      : {}),
    ...(bodyText !== undefined ? { bodyText } : {}),
    ...(message.categories ? { labels: [...message.categories] } : {}),
    unread: !message.isRead,
    ...(attachments && attachments.length > 0
      ? { attachments: [...attachments] }
      : {}),
  })
}

function timestamps(message: GraphMessage) {
  const occurredAt = Date.parse(
    message.receivedDateTime ?? message.sentDateTime ?? '',
  )
  const providerUpdatedAt = Date.parse(message.lastModifiedDateTime ?? '')
  return {
    occurredAt: Number.isNaN(occurredAt) ? null : occurredAt,
    providerUpdatedAt: Number.isNaN(providerUpdatedAt)
      ? null
      : providerUpdatedAt,
  }
}

export function searchResource(
  sourceId: string,
  message: GraphMessage,
): SearchRemoteResource {
  const times = timestamps(message)
  return {
    ref: `ctx://${sourceId.toUpperCase()}/message/${encodeURIComponent(message.id)}`,
    profile: { id: 'mail.message', version: 1 },
    title: message.subject ?? null,
    summary: message.bodyPreview ?? null,
    ...times,
    payload: payload(sourceId, message),
  }
}

export function retrievedResource(
  ref: string,
  sourceId: string,
  message: GraphMessage,
  attachments: readonly ArtifactDescriptor[],
): RetrievedResource {
  if (message.body?.contentType === 'html')
    throw new CtxindexSyncError(
      'Microsoft Graph ignored the text body preference',
      'provider_bad_response',
    )
  const times = timestamps(message)
  return {
    ref,
    profile: { id: 'mail.message', version: 1 },
    title: message.subject ?? null,
    summary: message.bodyPreview ?? null,
    ...times,
    payload: payload(sourceId, message, message.body?.content, attachments),
  }
}
