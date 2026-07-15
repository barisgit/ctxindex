import {
  CtxindexSyncError,
  CtxindexValidationError,
} from '@ctxindex/core/errors'
import type { ActionContext, RetrievedResource } from '@ctxindex/extension-sdk'
import {
  communicationMessageDraftCreateInputSchema,
  communicationMessageDraftUpdateInputSchema,
  communicationMessageSchema,
} from '@ctxindex/profiles'
import { z } from 'zod'
import { gmailJson } from './gmail-shared'
import { gmailApiUrl } from './google-mailbox/api'

export type GmailDraftCreateInput = z.infer<
  typeof communicationMessageDraftCreateInputSchema
>
export type GmailDraftUpdateInput = z.infer<
  typeof communicationMessageDraftUpdateInputSchema
>

const gmailDraftResponseSchema = z.object({
  id: z.string().min(1),
  message: z.object({
    id: z.string().min(1),
    threadId: z.string().min(1).optional(),
    labelIds: z.array(z.string()).optional(),
  }),
})

function subjectHeader(subject: string): string {
  return [...subject].every((character) => character.charCodeAt(0) <= 0x7f)
    ? subject
    : `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`
}

function parseDraftUpdateInput(input: unknown): GmailDraftUpdateInput {
  const parsed = communicationMessageDraftUpdateInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new CtxindexValidationError(
      'invalid_action_input',
      'Invalid input for Action communication.message.draft.update',
      { cause: parsed.error },
    )
  }
  return parsed.data
}

function providerDraftId(ref: string, sourceId: string): string {
  let parsed: URL
  try {
    parsed = new URL(ref)
  } catch (cause) {
    throw new CtxindexValidationError('invalid_ref', `Invalid Ref "${ref}"`, {
      cause,
    })
  }
  if (
    parsed.protocol !== 'ctx:' ||
    parsed.hostname.toUpperCase() !== sourceId.toUpperCase()
  ) {
    throw new CtxindexValidationError(
      'ref_source_mismatch',
      `Ref "${ref}" does not belong to Source "${sourceId}"`,
    )
  }
  const canonicalSourcePrefix = `ctx://${sourceId.toUpperCase()}/`
  if (!ref.startsWith(canonicalSourcePrefix)) {
    throw new CtxindexValidationError(
      'invalid_ref',
      `Gmail Draft Ref "${ref}" must use canonical Source authority "${sourceId.toUpperCase()}"`,
    )
  }
  const segments = parsed.pathname.split('/').filter(Boolean)
  if (segments[0] === 'message') {
    throw new CtxindexValidationError(
      'action_unsupported',
      'Gmail Draft update does not support message Refs',
    )
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    segments.length !== 2 ||
    segments[0] !== 'draft' ||
    !segments[1]
  ) {
    throw new CtxindexValidationError(
      'invalid_ref',
      `Gmail Draft Ref "${ref}" must use suffix "draft/<provider-draft-id>"`,
    )
  }
  try {
    const id = decodeURIComponent(segments[1])
    if (
      !id ||
      encodeURIComponent(id) !== segments[1] ||
      parsed.pathname !== `/draft/${segments[1]}`
    ) {
      throw new Error('non-canonical Draft id')
    }
    return id
  } catch (cause) {
    throw new CtxindexValidationError(
      'invalid_ref',
      `Invalid Gmail Draft Ref "${ref}"`,
      { cause },
    )
  }
}

export async function gmailDraftUpdate(
  context: ActionContext<GmailDraftUpdateInput>,
): Promise<RetrievedResource> {
  const input = parseDraftUpdateInput(context.input)
  const addressedDraftId = providerDraftId(input.ref, context.source.id)
  const response = await gmailJson(
    await context.fetch(
      gmailApiUrl(
        `/gmail/v1/users/me/drafts/${encodeURIComponent(addressedDraftId)}`,
      ),
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: { raw: buildValidatedGmailDraftRaw(input) },
        }),
        signal: context.signal,
      },
    ),
  )
  const draft = gmailDraftResponseSchema.safeParse(response)
  if (!draft.success || draft.data.id !== addressedDraftId) {
    throw new CtxindexSyncError(
      'Gmail returned an invalid Draft response',
      'provider_bad_response',
      { cause: draft.success ? undefined : draft.error },
    )
  }
  const { message } = draft.data
  const payload = communicationMessageSchema.parse({
    providerDraftId: addressedDraftId,
    providerMessageId: message.id,
    to: input.to,
    cc: input.cc ?? [],
    bcc: input.bcc ?? [],
    subject: input.subject,
    bodyText: input.bodyText,
    ...(message.threadId
      ? {
          threadId: message.threadId,
          conversationKey: `${context.source.id.toUpperCase()}:${message.threadId}`,
        }
      : {}),
    ...(message.labelIds ? { labels: message.labelIds } : {}),
    ...(message.labelIds
      ? { unread: message.labelIds.includes('UNREAD') }
      : {}),
  })
  return {
    ref: `ctx://${context.source.id.toUpperCase()}/draft/${encodeURIComponent(addressedDraftId)}`,
    profile: { id: 'communication.message', version: 1 },
    title: input.subject || null,
    payload,
  }
}

function parseDraftCreateInput(input: unknown): GmailDraftCreateInput {
  const parsed = communicationMessageDraftCreateInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new CtxindexValidationError(
      'invalid_action_input',
      'Invalid input for Action communication.message.draft.create',
      { cause: parsed.error },
    )
  }
  return parsed.data
}

function buildValidatedGmailDraftRaw(input: GmailDraftCreateInput): string {
  const headers = [`To: ${input.to.join(', ')}`]
  if (input.cc && input.cc.length > 0)
    headers.push(`Cc: ${input.cc.join(', ')}`)
  if (input.bcc && input.bcc.length > 0)
    headers.push(`Bcc: ${input.bcc.join(', ')}`)
  headers.push(
    `Subject: ${subjectHeader(input.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
  )
  const body = input.bodyText.replace(/\r\n|\r|\n/g, '\r\n')
  return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${body}`)
    .toString('base64url')
    .replaceAll('=', '')
}

export function buildGmailDraftRaw(input: GmailDraftCreateInput): string {
  return buildValidatedGmailDraftRaw(parseDraftCreateInput(input))
}

export async function gmailDraftCreate(
  context: ActionContext<GmailDraftCreateInput>,
): Promise<RetrievedResource> {
  const input = parseDraftCreateInput(context.input)
  const response = await gmailJson(
    await context.fetch(gmailApiUrl('/gmail/v1/users/me/drafts'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: { raw: buildValidatedGmailDraftRaw(input) },
      }),
      signal: context.signal,
    }),
  )
  const draft = gmailDraftResponseSchema.safeParse(response)
  if (!draft.success) {
    throw new CtxindexSyncError(
      'Gmail returned an invalid Draft response',
      'provider_bad_response',
      { cause: draft.error },
    )
  }
  const { id: providerDraftId, message } = draft.data
  const payload = communicationMessageSchema.parse({
    providerDraftId,
    providerMessageId: message.id,
    to: input.to,
    ...(input.cc !== undefined ? { cc: input.cc } : {}),
    ...(input.bcc !== undefined ? { bcc: input.bcc } : {}),
    subject: input.subject,
    bodyText: input.bodyText,
    ...(message.threadId
      ? {
          threadId: message.threadId,
          conversationKey: `${context.source.id.toUpperCase()}:${message.threadId}`,
        }
      : {}),
    ...(message.labelIds ? { labels: message.labelIds } : {}),
    ...(message.labelIds
      ? { unread: message.labelIds.includes('UNREAD') }
      : {}),
  })
  return {
    ref: `ctx://${context.source.id.toUpperCase()}/draft/${encodeURIComponent(providerDraftId)}`,
    profile: { id: 'communication.message', version: 1 },
    title: input.subject || null,
    payload,
  }
}
