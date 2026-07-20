import { defineProfile } from '@ctxindex/extension-sdk'
import { z } from 'zod'

const artifactDescriptorSchema = z
  .object({
    ref: z.string().min(1),
    filename: z.string().optional(),
    mediaType: z.string().optional(),
    byteSize: z.number().int().nonnegative().optional(),
  })
  .strict()

const headerValueSchema = z
  .string()
  .min(1)
  .regex(/^[^\r\n]*$/)

const communicationMessageDraftStandaloneContentShape = {
  to: z.array(headerValueSchema).min(1),
  cc: z.array(headerValueSchema).optional(),
  bcc: z.array(headerValueSchema).optional(),
  subject: z.string().regex(/^[^\r\n]*$/),
  bodyText: z.string(),
}

export const communicationMessageDraftAttachmentSchema = z
  .object({ ref: z.string().min(1) })
  .strict()

export const MAX_DRAFT_ATTACHMENT_COUNT = 10
export const MAX_DRAFT_ATTACHMENT_BYTES = 2 * 1024 * 1024

const draftAttachmentsSchema = z
  .array(communicationMessageDraftAttachmentSchema)
  .min(1)
  .max(MAX_DRAFT_ATTACHMENT_COUNT)
  .superRefine((attachments, context) => {
    const seen = new Set<string>()
    for (const [index, attachment] of attachments.entries()) {
      if (seen.has(attachment.ref))
        context.addIssue({
          code: 'custom',
          message: 'Draft attachment Refs must be unique',
          path: [index, 'ref'],
        })
      seen.add(attachment.ref)
    }
  })

const communicationMessageDraftReplyContentShape = {
  replyToRef: z.string().min(1),
  bodyText: z.string(),
}

const communicationMessageDraftStandaloneCreateInputSchema = z
  .object({
    ...communicationMessageDraftStandaloneContentShape,
    attachments: draftAttachmentsSchema.optional(),
  })
  .strict()
const communicationMessageDraftReplyCreateInputSchema = z
  .object({
    ...communicationMessageDraftReplyContentShape,
    attachments: draftAttachmentsSchema.optional(),
  })
  .strict()

export const communicationMessageDraftCreateInputSchema = z.union([
  communicationMessageDraftStandaloneCreateInputSchema,
  communicationMessageDraftReplyCreateInputSchema,
])

const communicationMessageDraftStandaloneUpdateInputSchema = z
  .object({
    ref: z.string().min(1),
    ...communicationMessageDraftStandaloneContentShape,
  })
  .strict()
const communicationMessageDraftReplyUpdateInputSchema = z
  .object({
    ref: z.string().min(1),
    ...communicationMessageDraftReplyContentShape,
  })
  .strict()

export const communicationMessageDraftUpdateInputSchema = z.union([
  communicationMessageDraftStandaloneUpdateInputSchema,
  communicationMessageDraftReplyUpdateInputSchema,
])

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ')
}

function renderEml(
  payload: z.infer<typeof communicationMessageSchema>,
): string {
  const headers: string[] = []
  const addHeader = (name: string, value: string | undefined): void => {
    if (value !== undefined) headers.push(`${name}: ${sanitizeHeader(value)}`)
  }
  addHeader('From', payload.from?.map(sanitizeHeader).join(', '))
  addHeader('To', payload.to?.map(sanitizeHeader).join(', '))
  addHeader('Cc', payload.cc?.map(sanitizeHeader).join(', '))
  addHeader('Bcc', payload.bcc?.map(sanitizeHeader).join(', '))
  addHeader('Subject', payload.subject)
  addHeader(
    'Date',
    payload.date === undefined
      ? undefined
      : new Date(payload.date).toUTCString(),
  )
  addHeader('Message-ID', payload.rfcMessageId)
  addHeader('In-Reply-To', payload.inReplyTo)
  headers.push(
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
  )
  const body = (payload.bodyText ?? '').replace(/\r\n|\r|\n/g, '\r\n')
  return `${headers.join('\r\n')}\r\n\r\n${body}`
}

export const communicationMessageSchema = z
  .object({
    providerMessageId: z.string().min(1),
    providerDraftId: z.string().min(1).optional(),
    threadId: z.string().min(1).optional(),
    conversationKey: z.string().min(1).optional(),
    rfcMessageId: z.string().min(1).optional(),
    inReplyTo: z.string().min(1).optional(),
    references: z.array(z.string().min(1)).optional(),
    replyTo: z.array(z.string().min(1)).optional(),
    replyToRef: z.string().min(1).optional(),
    subject: z.string().optional(),
    from: z.array(z.string()).optional(),
    to: z.array(z.string()).optional(),
    cc: z.array(z.string()).optional(),
    bcc: z.array(z.string()).optional(),
    date: z.string().datetime().optional(),
    snippet: z.string().optional(),
    bodyText: z.string().optional(),
    labels: z.array(z.string()).optional(),
    unread: z.boolean().optional(),
    attachments: z.array(artifactDescriptorSchema).optional(),
    managedAttachmentRefs: z.array(z.string().min(1)).optional(),
  })
  .strict()

export type CommunicationMessage = z.infer<typeof communicationMessageSchema>

export function deriveCommunicationMessageReplyRecipient(
  payload: CommunicationMessage,
): string | undefined {
  return payload.replyTo?.[0] ?? payload.from?.[0]
}

export function deriveCommunicationMessageReplySubject(
  subject: string | undefined,
): string {
  const base = (subject ?? '').replace(/^(?:\s*re\s*:\s*)+/i, '').trim()
  return base ? `Re: ${base}` : 'Re:'
}

export function deriveCommunicationMessageReplyReferences(
  references: readonly string[] | undefined,
  rfcMessageId: string,
): string[] {
  return [...new Set([...(references ?? []), rfcMessageId])]
}

export const communicationMessageProfile = defineProfile({
  id: 'communication.message',
  version: 1,
  schema: communicationMessageSchema,
  actions: {
    'communication.message.draft.create': {
      effect: 'reversible',
      input: communicationMessageDraftCreateInputSchema,
      output: { id: 'communication.message', version: 1 },
    },
    'communication.message.draft.update': {
      effect: 'reversible',
      input: communicationMessageDraftUpdateInputSchema,
      output: { id: 'communication.message', version: 1 },
    },
  },
  search: {
    title: (payload) => payload.subject ?? null,
    occurredAt: (payload) =>
      payload.date === undefined ? null : new Date(payload.date),
    chunks: (payload) => [
      ...(payload.subject === undefined ? [] : [payload.subject]),
      ...(payload.from ?? []),
      ...(payload.to ?? []),
      ...(payload.snippet === undefined ? [] : [payload.snippet]),
      ...(payload.bodyText === undefined ? [] : [payload.bodyText]),
    ],
    fields: {
      sender: {
        type: 'string[]',
        extract: (payload) => payload.from ?? [],
      },
      unread: {
        type: 'boolean',
        extract: (payload) => payload.unread,
      },
      rfcMessageId: {
        type: 'string',
        extract: (payload) => payload.rfcMessageId,
      },
      conversationKey: {
        type: 'string',
        extract: (payload) => payload.conversationKey,
      },
    },
  },
  artifacts: (payload) => [...(payload.attachments ?? [])],
  relations: {
    conversation: (payload) =>
      payload.conversationKey
        ? { field: 'conversationKey', value: payload.conversationKey }
        : undefined,
    parent: (payload) =>
      payload.inReplyTo
        ? { field: 'rfcMessageId', value: payload.inReplyTo }
        : undefined,
  },
  exports: {
    eml: {
      mediaType: 'message/rfc822',
      // V1 EML omits Artifact bytes, which remain separately downloadable.
      render: renderEml,
    },
  },
})
