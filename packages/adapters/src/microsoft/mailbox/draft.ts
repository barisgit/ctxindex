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

function replacement(input: MicrosoftDraftCreateInput) {
  return {
    subject: input.subject,
    body: { contentType: 'Text', content: input.bodyText },
    toRecipients: recipients(input.to),
    ccRecipients: recipients(input.cc ?? []),
    bccRecipients: recipients(input.bcc ?? []),
  }
}

function draftResource(
  value: unknown,
  sourceId: string,
  expectedId?: string,
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
  const payload = communicationMessageSchema.parse({
    ...basePayload,
    providerDraftId: message.id,
    to: basePayload.to ?? [],
    cc: basePayload.cc ?? [],
    bcc: basePayload.bcc ?? [],
  })
  return { ...normalized, payload }
}

export async function microsoftDraftCreate(
  context: ActionContext<MicrosoftDraftCreateInput>,
): Promise<RetrievedResource> {
  const input = parseCreateInput(context.input)
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
  const headers = graphHeaders(TEXT_BODY_PREFERENCE)
  headers.set('content-type', 'application/json')
  const response = await context.fetch(
    graphUrl(`/me/messages/${encodeURIComponent(draftId)}`),
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify(replacement(input)),
      signal: context.signal,
    },
  )
  return draftResource(await graphJson(response), context.source.id, draftId)
}
