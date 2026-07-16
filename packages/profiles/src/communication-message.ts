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

const communicationMessageDraftContentShape = {
  to: z.array(headerValueSchema).min(1),
  cc: z.array(headerValueSchema).optional(),
  bcc: z.array(headerValueSchema).optional(),
  subject: z.string().regex(/^[^\r\n]*$/),
  bodyText: z.string(),
}

export const communicationMessageDraftCreateInputSchema = z
  .object(communicationMessageDraftContentShape)
  .strict()

export const communicationMessageDraftUpdateInputSchema = z
  .object({
    ref: z.string().min(1),
    ...communicationMessageDraftContentShape,
  })
  .strict()

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
  })
  .strict()

export const communicationMessageProfile = defineProfile({
  id: 'communication.message',
  version: 1,
  schema: communicationMessageSchema,
  actions: {
    'communication.message.draft.create': {
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
      ],
    },
    'communication.message.draft.update': {
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
      ],
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
        docs: 'Sender addresses associated with the message.',
      },
      unread: {
        type: 'boolean',
        extract: (payload) => payload.unread,
        docs: 'Whether the message is unread.',
      },
      rfcMessageId: {
        type: 'string',
        extract: (payload) => payload.rfcMessageId,
        docs: 'Normalized RFC Message-ID header value.',
      },
      conversationKey: {
        type: 'string',
        extract: (payload) => payload.conversationKey,
        docs: 'Source-scoped provider conversation identity.',
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
  docs: {
    summary: 'An email or provider message.',
    aliases: ['message', 'email', 'mail'],
  },
})
