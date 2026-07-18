import {
  CtxindexSyncError,
  CtxindexValidationError,
} from '@ctxindex/core/errors'
import type { ActionContext, RetrievedResource } from '@ctxindex/extension-sdk'
import {
  type CommunicationMessage,
  communicationMessageDraftCreateInputSchema,
  communicationMessageDraftUpdateInputSchema,
  communicationMessageSchema,
  deriveCommunicationMessageReplyRecipient,
  deriveCommunicationMessageReplyReferences,
  deriveCommunicationMessageReplySubject,
} from '@ctxindex/profiles'
import { z } from 'zod'
import { gmailJson } from './response'
import { gmailApiUrl } from './url'

export type GmailDraftCreateInput = z.infer<
  typeof communicationMessageDraftCreateInputSchema
>
export type GmailDraftUpdateInput = z.infer<
  typeof communicationMessageDraftUpdateInputSchema
>
type GmailStandaloneDraftCreateInput = Exclude<
  GmailDraftCreateInput,
  { replyToRef: string }
>
type GmailReplyDraftCreateInput = Extract<
  GmailDraftCreateInput,
  { replyToRef: string }
>
type GmailStandaloneDraftUpdateInput = Exclude<
  GmailDraftUpdateInput,
  { replyToRef: string }
>
type GmailReplyDraftUpdateInput = Extract<
  GmailDraftUpdateInput,
  { replyToRef: string }
>

interface GmailReplyDetails {
  readonly replyToRef: string
  readonly threadId: string
  readonly recipient: string
  readonly subject: string
  readonly inReplyTo: string
  readonly references: readonly string[]
}

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

function isReplyInput(
  input: GmailDraftCreateInput | GmailDraftUpdateInput,
): input is GmailReplyDraftCreateInput | GmailReplyDraftUpdateInput {
  return 'replyToRef' in input
}

function localMessage(
  context: ActionContext<unknown>,
  ref: string,
  expectedDraft: boolean,
): CommunicationMessage {
  const resource = context.resolveResource(ref)
  const guidance = `Retrieve it first with: ctxindex get ${ref} --json`
  if (!resource) {
    throw new CtxindexValidationError(
      'invalid_action_input',
      `Reply Resource "${ref}" is not available locally. ${guidance}`,
    )
  }
  if (resource.deletedAt !== null) {
    throw new CtxindexValidationError(
      'invalid_action_input',
      `Reply Resource "${ref}" is deleted`,
    )
  }
  if (resource.completeness !== 'complete') {
    throw new CtxindexValidationError(
      'invalid_action_input',
      `Reply Resource "${ref}" is incomplete. ${guidance}`,
    )
  }
  if (
    resource.profile.id !== 'communication.message' ||
    resource.profile.version !== 1
  ) {
    throw new CtxindexValidationError(
      'invalid_action_input',
      `Reply Resource "${ref}" must be communication.message@1`,
    )
  }
  const payload = communicationMessageSchema.safeParse(resource.payload)
  if (
    !payload.success ||
    Boolean(payload.data.providerDraftId) !== expectedDraft
  ) {
    throw new CtxindexValidationError(
      'invalid_action_input',
      `Reply Resource "${ref}" must be ${expectedDraft ? 'a Draft' : 'a non-Draft message'}`,
    )
  }
  return payload.data
}

function replyDetails(
  context: ActionContext<unknown>,
  replyToRef: string,
): GmailReplyDetails {
  const parent = localMessage(context, replyToRef, false)
  const recipient = deriveCommunicationMessageReplyRecipient(parent)
  if (!recipient || !parent.rfcMessageId || !parent.threadId) {
    throw new CtxindexValidationError(
      'invalid_action_input',
      `Reply parent "${replyToRef}" lacks recipient or Gmail threading fields. Retrieve it first with: ctxindex get ${replyToRef} --json`,
    )
  }
  const subject = deriveCommunicationMessageReplySubject(parent.subject)
  const references = deriveCommunicationMessageReplyReferences(
    parent.references,
    parent.rfcMessageId,
  )
  if (
    [recipient, subject, parent.rfcMessageId, ...references].some((value) =>
      /[\r\n]/.test(value),
    )
  ) {
    throw new CtxindexValidationError(
      'invalid_action_input',
      `Reply parent "${replyToRef}" contains unsafe Gmail header values`,
    )
  }
  return {
    replyToRef,
    threadId: parent.threadId,
    recipient,
    subject,
    inReplyTo: parent.rfcMessageId,
    references,
  }
}

function validateReplyUpdate(
  context: ActionContext<unknown>,
  input: GmailReplyDraftUpdateInput,
): GmailReplyDetails {
  const draft = localMessage(context, input.ref, true)
  if (draft.replyToRef !== input.replyToRef) {
    throw new CtxindexValidationError(
      'invalid_action_input',
      `Reply Draft "${input.ref}" cannot change replyToRef`,
    )
  }
  return replyDetails(context, input.replyToRef)
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
  const details = isReplyInput(input)
    ? validateReplyUpdate(context, input)
    : undefined
  const standalone = details
    ? undefined
    : (input as GmailStandaloneDraftUpdateInput)
  const response = await gmailJson(
    await context.fetch(
      gmailApiUrl(
        `/gmail/v1/users/me/drafts/${encodeURIComponent(addressedDraftId)}`,
      ),
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: {
            raw: buildValidatedGmailDraftRaw(input, details),
            ...(details ? { threadId: details.threadId } : {}),
          },
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
  if (details && message.threadId !== details.threadId) {
    throw new CtxindexSyncError(
      'Gmail returned a Draft outside the requested thread',
      'provider_bad_response',
    )
  }
  const payload = communicationMessageSchema.parse({
    providerDraftId: addressedDraftId,
    providerMessageId: message.id,
    to: details ? [details.recipient] : standalone?.to,
    cc: details ? [] : (standalone?.cc ?? []),
    bcc: details ? [] : (standalone?.bcc ?? []),
    subject: details?.subject ?? standalone?.subject,
    bodyText: input.bodyText,
    ...(details
      ? {
          inReplyTo: details.inReplyTo,
          references: [...details.references],
          replyToRef: details.replyToRef,
        }
      : {}),
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
    title: (details?.subject ?? standalone?.subject) || null,
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

function buildValidatedGmailDraftRaw(
  input: GmailDraftCreateInput | GmailDraftUpdateInput,
  details?: GmailReplyDetails,
): string {
  const standalone = details
    ? undefined
    : (input as
        | GmailStandaloneDraftCreateInput
        | GmailStandaloneDraftUpdateInput)
  const headers = [`To: ${details?.recipient ?? standalone?.to.join(', ')}`]
  if (standalone?.cc && standalone.cc.length > 0)
    headers.push(`Cc: ${standalone.cc.join(', ')}`)
  if (standalone?.bcc && standalone.bcc.length > 0)
    headers.push(`Bcc: ${standalone.bcc.join(', ')}`)
  headers.push(
    `Subject: ${subjectHeader(details?.subject ?? standalone?.subject ?? '')}`,
    ...(details
      ? [
          `In-Reply-To: ${details.inReplyTo}`,
          `References: ${details.references.join(' ')}`,
        ]
      : []),
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
  const details = isReplyInput(input)
    ? replyDetails(context, input.replyToRef)
    : undefined
  const standalone = details
    ? undefined
    : (input as GmailStandaloneDraftCreateInput)
  const response = await gmailJson(
    await context.fetch(gmailApiUrl('/gmail/v1/users/me/drafts'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          raw: buildValidatedGmailDraftRaw(input, details),
          ...(details ? { threadId: details.threadId } : {}),
        },
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
  if (details && message.threadId !== details.threadId) {
    throw new CtxindexSyncError(
      'Gmail returned a Draft outside the requested thread',
      'provider_bad_response',
    )
  }
  const payload = communicationMessageSchema.parse({
    providerDraftId,
    providerMessageId: message.id,
    to: details ? [details.recipient] : standalone?.to,
    ...(details
      ? { cc: [], bcc: [] }
      : {
          ...(standalone?.cc !== undefined ? { cc: standalone.cc } : {}),
          ...(standalone?.bcc !== undefined ? { bcc: standalone.bcc } : {}),
        }),
    subject: details?.subject ?? standalone?.subject,
    bodyText: input.bodyText,
    ...(details
      ? {
          inReplyTo: details.inReplyTo,
          references: [...details.references],
          replyToRef: details.replyToRef,
        }
      : {}),
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
    title: (details?.subject ?? standalone?.subject) || null,
    payload,
  }
}
