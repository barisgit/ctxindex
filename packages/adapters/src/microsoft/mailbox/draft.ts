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
import type { z } from 'zod'
import { parseGraphMessage, retrievedResource } from './message'
import { parseDraftRef } from './ref'
import {
  graphHeaders,
  graphJson,
  graphUrl,
  TEXT_BODY_PREFERENCE,
} from './transport'

export type MicrosoftDraftCreateInput = z.infer<
  typeof communicationMessageDraftCreateInputSchema
>
export type MicrosoftDraftUpdateInput = z.infer<
  typeof communicationMessageDraftUpdateInputSchema
>
type MicrosoftStandaloneDraftCreateInput = Exclude<
  MicrosoftDraftCreateInput,
  { replyToRef: string }
>
type MicrosoftReplyDraftCreateInput = Extract<
  MicrosoftDraftCreateInput,
  { replyToRef: string }
>
type MicrosoftStandaloneDraftUpdateInput = Exclude<
  MicrosoftDraftUpdateInput,
  { replyToRef: string }
>
type MicrosoftReplyDraftUpdateInput = Extract<
  MicrosoftDraftUpdateInput,
  { replyToRef: string }
>

interface MicrosoftReplyDetails {
  readonly replyToRef: string
  readonly parentMessageId: string
  readonly threadId: string
  readonly recipient: string
  readonly subject: string
  readonly inReplyTo?: string
  readonly references: readonly string[]
}

function parseCreateInput(input: unknown): MicrosoftDraftCreateInput {
  const parsed = communicationMessageDraftCreateInputSchema.safeParse(input)
  if (!parsed.success)
    throw new CtxindexValidationError(
      'invalid_action_input',
      'Invalid input for Action communication.message.draft.create',
      { cause: parsed.error },
    )
  return parsed.data
}

function parseUpdateInput(input: unknown): MicrosoftDraftUpdateInput {
  const parsed = communicationMessageDraftUpdateInputSchema.safeParse(input)
  if (!parsed.success)
    throw new CtxindexValidationError(
      'invalid_action_input',
      'Invalid input for Action communication.message.draft.update',
      { cause: parsed.error },
    )
  return parsed.data
}

function recipient(value: string) {
  const trimmed = value.trim()
  const named = /^(.*?)\s*<([^<>]+)>$/.exec(value)
  const name = named?.[1]?.trim()
  const address = named?.[2]?.trim()
  if (
    (named && (!name || !address || /[<>\s]/.test(address))) ||
    (!named && (!trimmed || /[<>\s]/.test(trimmed)))
  )
    throw new CtxindexValidationError(
      'invalid_action_input',
      'Microsoft Draft recipients must be addresses or Name <address> values',
    )
  return {
    emailAddress: name && address ? { name, address } : { address: trimmed },
  }
}

function recipients(values: readonly string[]) {
  return values.map(recipient)
}

function replacement(
  input:
    | MicrosoftStandaloneDraftCreateInput
    | MicrosoftStandaloneDraftUpdateInput,
) {
  return {
    subject: input.subject,
    body: { contentType: 'Text', content: input.bodyText },
    toRecipients: recipients(input.to),
    ccRecipients: recipients(input.cc ?? []),
    bccRecipients: recipients(input.bcc ?? []),
  }
}

function isReplyInput(
  input: MicrosoftDraftCreateInput | MicrosoftDraftUpdateInput,
): input is MicrosoftReplyDraftCreateInput | MicrosoftReplyDraftUpdateInput {
  return 'replyToRef' in input
}

function localMessage(
  context: ActionContext<unknown>,
  ref: string,
  expectedDraft: boolean,
): CommunicationMessage {
  const resource = context.resolveResource(ref)
  const guidance = `Retrieve it first with: ctxindex get ${ref} --json`
  if (!resource)
    throw new CtxindexValidationError(
      'invalid_action_input',
      `Reply Resource "${ref}" is not available locally. ${guidance}`,
    )
  if (resource.deletedAt !== null)
    throw new CtxindexValidationError(
      'invalid_action_input',
      `Reply Resource "${ref}" is deleted`,
    )
  if (resource.completeness !== 'complete')
    throw new CtxindexValidationError(
      'invalid_action_input',
      `Reply Resource "${ref}" is incomplete. ${guidance}`,
    )
  if (
    resource.profile.id !== 'communication.message' ||
    resource.profile.version !== 1
  )
    throw new CtxindexValidationError(
      'invalid_action_input',
      `Reply Resource "${ref}" must be communication.message@1`,
    )
  const payload = communicationMessageSchema.safeParse(resource.payload)
  if (
    !payload.success ||
    Boolean(payload.data.providerDraftId) !== expectedDraft
  )
    throw new CtxindexValidationError(
      'invalid_action_input',
      `Reply Resource "${ref}" must be ${expectedDraft ? 'a Draft' : 'a non-Draft message'}`,
    )
  return payload.data
}

function replyDetails(
  context: ActionContext<unknown>,
  replyToRef: string,
): MicrosoftReplyDetails {
  const parent = localMessage(context, replyToRef, false)
  const replyRecipient = deriveCommunicationMessageReplyRecipient(parent)
  if (!replyRecipient || !parent.threadId) {
    throw new CtxindexValidationError(
      'invalid_action_input',
      `Reply parent "${replyToRef}" lacks a Reply-To or From recipient or Microsoft conversation identity. Retrieve it first with: ctxindex get ${replyToRef} --json`,
    )
  }
  recipient(replyRecipient)
  const subject = deriveCommunicationMessageReplySubject(parent.subject)
  const inReplyTo = parent.rfcMessageId
  const references = inReplyTo
    ? deriveCommunicationMessageReplyReferences(parent.references, inReplyTo)
    : [...(parent.references ?? [])]
  if (
    [subject, ...(inReplyTo ? [inReplyTo] : []), ...references].some((value) =>
      /[\r\n]/.test(value),
    )
  )
    throw new CtxindexValidationError(
      'invalid_action_input',
      `Reply parent "${replyToRef}" contains unsafe Microsoft header values`,
    )
  return {
    replyToRef,
    parentMessageId: parent.providerMessageId,
    threadId: parent.threadId,
    recipient: replyRecipient,
    subject,
    ...(inReplyTo ? { inReplyTo } : {}),
    references,
  }
}

function validateReplyUpdate(
  context: ActionContext<unknown>,
  input: MicrosoftReplyDraftUpdateInput,
): MicrosoftReplyDetails {
  const draft = localMessage(context, input.ref, true)
  if (draft.replyToRef !== input.replyToRef)
    throw new CtxindexValidationError(
      'invalid_action_input',
      `Reply Draft "${input.ref}" cannot change replyToRef`,
    )
  return replyDetails(context, input.replyToRef)
}

function rejectStoredReplyDraftUpdate(
  context: ActionContext<unknown>,
  ref: string,
): void {
  const resource = context.resolveResource(ref)
  if (
    resource?.profile.id !== 'communication.message' ||
    resource.profile.version !== 1
  )
    return
  const draft = communicationMessageSchema.safeParse(resource.payload)
  if (draft.success && draft.data.providerDraftId && draft.data.replyToRef)
    throw new CtxindexValidationError(
      'invalid_action_input',
      `Reply Draft "${ref}" must be updated with its immutable replyToRef`,
    )
}

function replyReplacement(details: MicrosoftReplyDetails, bodyText: string) {
  return {
    subject: details.subject,
    body: { contentType: 'Text', content: bodyText },
    toRecipients: recipients([details.recipient]),
    ccRecipients: [],
    bccRecipients: [],
  }
}

function replyMime(details: MicrosoftReplyDetails, bodyText: string): string {
  const headers = [
    `To: ${details.recipient}`,
    `Subject: ${details.subject}`,
    ...(details.inReplyTo ? [`In-Reply-To: ${details.inReplyTo}`] : []),
    ...(details.references.length > 0
      ? [`References: ${details.references.join(' ')}`]
      : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
  ]
  const body = bodyText.replace(/\r\n|\r|\n/g, '\r\n')
  return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${body}`).toString(
    'base64',
  )
}

function normalizeBodyLineEndings(value: string): string {
  return value.replace(/\r\n|\r/g, '\n')
}

function draftResource(
  value: unknown,
  sourceId: string,
  expectedId?: string,
  reply?: {
    readonly details: MicrosoftReplyDetails
    readonly bodyText: string
  },
): RetrievedResource {
  const message = parseGraphMessage(value)
  if (
    !message.isDraft ||
    (expectedId !== undefined && message.id !== expectedId) ||
    message.subject === null ||
    message.subject === undefined ||
    !message.body ||
    !message.toRecipients ||
    !message.ccRecipients ||
    !message.bccRecipients
  )
    throw new CtxindexSyncError(
      'Microsoft Graph returned an invalid Draft response',
      'provider_bad_response',
    )
  const ref = `ctx://${sourceId.toUpperCase()}/draft/${encodeURIComponent(message.id)}`
  const normalized = retrievedResource(ref, sourceId, message, [])
  const basePayload = communicationMessageSchema.parse(normalized.payload)
  if (
    reply &&
    (basePayload.subject !== reply.details.subject ||
      normalizeBodyLineEndings(basePayload.bodyText ?? '') !==
        normalizeBodyLineEndings(reply.bodyText) ||
      basePayload.threadId !== reply.details.threadId ||
      JSON.stringify(basePayload.to ?? []) !==
        JSON.stringify([reply.details.recipient]) ||
      (basePayload.cc ?? []).length !== 0 ||
      (basePayload.bcc ?? []).length !== 0)
  ) {
    throw new CtxindexSyncError(
      'Microsoft Graph returned a Draft that does not match the requested reply',
      'provider_bad_response',
    )
  }
  const payload = communicationMessageSchema.parse({
    ...basePayload,
    providerDraftId: message.id,
    to: reply ? [reply.details.recipient] : (basePayload.to ?? []),
    cc: reply ? [] : (basePayload.cc ?? []),
    bcc: reply ? [] : (basePayload.bcc ?? []),
    ...(reply
      ? {
          subject: reply.details.subject,
          bodyText: reply.bodyText,
          ...(reply.details.inReplyTo
            ? { inReplyTo: reply.details.inReplyTo }
            : {}),
          references: [...reply.details.references],
          replyToRef: reply.details.replyToRef,
        }
      : {}),
  })
  return {
    ...normalized,
    ...(reply ? { title: reply.details.subject } : {}),
    payload,
  }
}

export async function microsoftDraftCreate(
  context: ActionContext<MicrosoftDraftCreateInput>,
): Promise<RetrievedResource> {
  const input = parseCreateInput(context.input)
  if (isReplyInput(input)) {
    const details = replyDetails(context, input.replyToRef)
    const headers = graphHeaders(TEXT_BODY_PREFERENCE)
    headers.set('content-type', 'text/plain')
    const response = await context.fetch(
      graphUrl(
        `/me/messages/${encodeURIComponent(details.parentMessageId)}/createReply`,
      ),
      {
        method: 'POST',
        headers,
        body: replyMime(details, input.bodyText),
        signal: context.signal,
      },
    )
    return draftResource(
      await graphJson(response),
      context.source.id,
      undefined,
      {
        details,
        bodyText: input.bodyText,
      },
    )
  }
  const headers = graphHeaders(TEXT_BODY_PREFERENCE)
  headers.set('content-type', 'application/json')
  const response = await context.fetch(graphUrl('/me/messages'), {
    method: 'POST',
    headers,
    body: JSON.stringify(replacement(input)),
    signal: context.signal,
  })
  return draftResource(await graphJson(response), context.source.id)
}

export async function microsoftDraftUpdate(
  context: ActionContext<MicrosoftDraftUpdateInput>,
): Promise<RetrievedResource> {
  const input = parseUpdateInput(context.input)
  const draftId = parseDraftRef(input.ref, context.source.id)
  if (!isReplyInput(input)) rejectStoredReplyDraftUpdate(context, input.ref)
  const details = isReplyInput(input)
    ? validateReplyUpdate(context, input)
    : undefined
  const standalone = details
    ? undefined
    : (input as MicrosoftStandaloneDraftUpdateInput)
  const headers = graphHeaders(TEXT_BODY_PREFERENCE)
  headers.set('content-type', 'application/json')
  const response = await context.fetch(
    graphUrl(`/me/messages/${encodeURIComponent(draftId)}`),
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify(
        details
          ? replyReplacement(details, input.bodyText)
          : replacement(standalone as MicrosoftStandaloneDraftUpdateInput),
      ),
      signal: context.signal,
    },
  )
  return draftResource(
    await graphJson(response),
    context.source.id,
    draftId,
    details ? { details, bodyText: input.bodyText } : undefined,
  )
}
