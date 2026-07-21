import {
  CtxindexSyncError,
  CtxindexValidationError,
} from '@ctxindex/core/errors'
import type { ActionContext, RetrievedResource } from '@ctxindex/extension-sdk'
import {
  deriveMailMessageReplyRecipient,
  deriveMailMessageReplyReferences,
  deriveMailMessageReplySubject,
  type MailMessage,
  mailMessageDraftCreateInputSchema,
  mailMessageDraftUpdateInputSchema,
  mailMessageSchema,
} from '@ctxindex/profiles'
import type { z } from 'zod'
import { renderMimeMessage, resolveDraftAttachments } from '../../mail/mime'
import { parseGraphMessage, retrievedResource } from './message'
import { parseDraftRef } from './ref'
import {
  graphHeaders,
  graphJson,
  graphUrl,
  TEXT_BODY_PREFERENCE,
} from './transport'

export type MicrosoftDraftCreateInput = z.infer<
  typeof mailMessageDraftCreateInputSchema
>
export type MicrosoftDraftUpdateInput = z.infer<
  typeof mailMessageDraftUpdateInputSchema
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

interface MicrosoftRecipient {
  readonly emailAddress: {
    readonly address: string
    readonly name?: string
  }
}

const MAILBOX_PATTERN =
  /^[\p{L}\p{N}!#$%&'*+/=?^_`{|}~-]+(?:\.[\p{L}\p{N}!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)
    if (
      codePoint !== undefined &&
      (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
    )
      return true
  }
  return false
}

function validMailbox(value: string): boolean {
  const localPart = value.slice(0, value.indexOf('@'))
  return (
    value.length <= 254 && localPart.length <= 64 && MAILBOX_PATTERN.test(value)
  )
}

function parseCreateInput(input: unknown): MicrosoftDraftCreateInput {
  const parsed = mailMessageDraftCreateInputSchema.safeParse(input)
  if (!parsed.success)
    throw new CtxindexValidationError(
      'invalid_action_input',
      'Invalid input for Action mail.message.draft.create',
      { cause: parsed.error },
    )
  return parsed.data
}

function parseUpdateInput(input: unknown): MicrosoftDraftUpdateInput {
  const parsed = mailMessageDraftUpdateInputSchema.safeParse(input)
  if (!parsed.success)
    throw new CtxindexValidationError(
      'invalid_action_input',
      'Invalid input for Action mail.message.draft.update',
      { cause: parsed.error },
    )
  return parsed.data
}

function recipient(value: string): MicrosoftRecipient {
  const trimmed = value.trim()
  const named = /^(.*?)\s*<([^<>]+)>$/.exec(trimmed)
  const name = named?.[1]?.trim()
  const address = named?.[2]?.trim()
  if (
    hasControlCharacter(trimmed) ||
    (named && (!name || !address || !validMailbox(address))) ||
    (!named && !validMailbox(trimmed))
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

function mimeRecipient(value: string): string {
  const { name, address } = recipient(value).emailAddress
  if (!name) return address
  const renderedName = /[(),.:;<>@[\]"\\]/.test(name)
    ? `"${name.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
    : name
  return `${renderedName} <${address}>`
}

function mimeRecipients(values: readonly string[]): string {
  return values.map(mimeRecipient).join(', ')
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
): MailMessage {
  const resource = context.resolveResource(ref)
  const guidance = `Retrieve it first with: ctxindex get ${ref} --format json`
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
  if (resource.profile.id !== 'mail.message' || resource.profile.version !== 1)
    throw new CtxindexValidationError(
      'invalid_action_input',
      `Reply Resource "${ref}" must be mail.message@1`,
    )
  const payload = mailMessageSchema.safeParse(resource.payload)
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
  const replyRecipient = deriveMailMessageReplyRecipient(parent)
  if (!replyRecipient || !parent.threadId) {
    throw new CtxindexValidationError(
      'invalid_action_input',
      `Reply parent "${replyToRef}" lacks a Reply-To or From recipient or Microsoft conversation identity. Retrieve it first with: ctxindex get ${replyToRef} --format json`,
    )
  }
  recipient(replyRecipient)
  const subject = deriveMailMessageReplySubject(parent.subject)
  const inReplyTo = parent.rfcMessageId
  const references = inReplyTo
    ? deriveMailMessageReplyReferences(parent.references, inReplyTo)
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
  expectedDraftId: string,
): MicrosoftReplyDetails {
  const draft = localMessage(context, input.ref, true)
  if (draft.providerDraftId !== expectedDraftId)
    throw new CtxindexValidationError(
      'invalid_action_input',
      `Reply Draft "${input.ref}" does not match its stored provider Draft identity`,
    )
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
  if (resource?.profile.id !== 'mail.message' || resource.profile.version !== 1)
    return
  const draft = mailMessageSchema.safeParse(resource.payload)
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

function mimeHeaders(
  input:
    | MicrosoftStandaloneDraftCreateInput
    | MicrosoftStandaloneDraftUpdateInput,
): string[] {
  return [
    `To: ${mimeRecipients(input.to)}`,
    ...(input.cc?.length ? [`Cc: ${mimeRecipients(input.cc)}`] : []),
    ...(input.bcc?.length ? [`Bcc: ${mimeRecipients(input.bcc)}`] : []),
    `Subject: ${input.subject}`,
  ]
}

function replyMime(
  details: MicrosoftReplyDetails,
  bodyText: string,
  attachments: Parameters<typeof renderMimeMessage>[0]['attachments'],
): string {
  const headers = [
    `To: ${mimeRecipient(details.recipient)}`,
    `Subject: ${details.subject}`,
    ...(details.inReplyTo ? [`In-Reply-To: ${details.inReplyTo}`] : []),
    ...(details.references.length > 0
      ? [`References: ${details.references.join(' ')}`]
      : []),
  ]
  return Buffer.from(
    renderMimeMessage({ headers, bodyText, attachments }),
  ).toString('base64')
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
  managedAttachmentRefs?: readonly string[],
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
  const basePayload = mailMessageSchema.parse(normalized.payload)
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
  const payload = mailMessageSchema.parse({
    ...basePayload,
    providerDraftId: message.id,
    ...(managedAttachmentRefs !== undefined
      ? { managedAttachmentRefs: [...managedAttachmentRefs] }
      : {}),
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
  const attachments = await resolveDraftAttachments(context, input.attachments)
  const managedAttachmentRefs = attachments.map((artifact) => artifact.ref)
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
        body: replyMime(details, input.bodyText, attachments),
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
      managedAttachmentRefs,
    )
  }
  const headers = graphHeaders(TEXT_BODY_PREFERENCE)
  headers.set(
    'content-type',
    attachments.length > 0 ? 'text/plain' : 'application/json',
  )
  const response = await context.fetch(graphUrl('/me/messages'), {
    method: 'POST',
    headers,
    body:
      attachments.length > 0
        ? Buffer.from(
            renderMimeMessage({
              headers: mimeHeaders(input),
              bodyText: input.bodyText,
              attachments,
            }),
          ).toString('base64')
        : JSON.stringify(replacement(input)),
    signal: context.signal,
  })
  return draftResource(
    await graphJson(response),
    context.source.id,
    undefined,
    undefined,
    managedAttachmentRefs,
  )
}

export async function microsoftDraftUpdate(
  context: ActionContext<MicrosoftDraftUpdateInput>,
): Promise<RetrievedResource> {
  const input = parseUpdateInput(context.input)
  const draftId = parseDraftRef(input.ref, context.source.id)
  if (!isReplyInput(input)) rejectStoredReplyDraftUpdate(context, input.ref)
  const details = isReplyInput(input)
    ? validateReplyUpdate(context, input, draftId)
    : undefined
  const standalone = details
    ? undefined
    : (input as MicrosoftStandaloneDraftUpdateInput)
  const storedResource = context.resolveResource(input.ref)
  const stored =
    storedResource?.profile.id === 'mail.message' &&
    storedResource.profile.version === 1 &&
    storedResource.completeness === 'complete' &&
    storedResource.deletedAt === null
      ? mailMessageSchema.safeParse(storedResource.payload)
      : undefined
  const managedAttachmentRefs =
    stored?.success && stored.data.providerDraftId === draftId
      ? stored.data.managedAttachmentRefs
      : undefined
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
    managedAttachmentRefs,
  )
}
