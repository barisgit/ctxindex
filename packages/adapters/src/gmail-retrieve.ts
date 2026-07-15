import {
  CtxindexSyncError,
  CtxindexValidationError,
} from '@ctxindex/core/errors'
import type {
  ArtifactDescriptor,
  RetrieveContext,
  RetrievedResource,
} from '@ctxindex/extension-sdk'
import { communicationMessageSchema } from '@ctxindex/profiles'
import { parseHTML } from 'linkedom'
import {
  type GmailMessage,
  type GmailPayload,
  gmailHeader,
  gmailHeaderDate,
  gmailJson,
  gmailOccurredAt,
  normalizeGmailMessageId,
} from './gmail-shared'
import { gmailApiUrl } from './google-mailbox/api'

function providerId(context: RetrieveContext): string {
  let parsed: URL
  try {
    parsed = new URL(context.ref)
  } catch (cause) {
    throw new CtxindexValidationError(
      'invalid_ref',
      `Invalid Ref "${context.ref}"`,
      {
        cause,
      },
    )
  }
  if (
    parsed.protocol !== 'ctx:' ||
    parsed.hostname.toUpperCase() !== context.source.id.toUpperCase()
  ) {
    throw new CtxindexValidationError(
      'ref_source_mismatch',
      `Ref "${context.ref}" does not belong to Source "${context.source.id}"`,
    )
  }
  const segments = parsed.pathname.split('/').filter(Boolean)
  if (
    parsed.search ||
    parsed.hash ||
    segments.length !== 2 ||
    segments[0] !== 'message' ||
    !segments[1]
  ) {
    throw new CtxindexValidationError(
      'invalid_ref',
      `Gmail Ref "${context.ref}" must use suffix "message/<provider-id>"`,
    )
  }
  return decodeURIComponent(segments[1])
}

function attachmentDescriptors(
  ref: string,
  payload: GmailPayload | undefined,
): ArtifactDescriptor[] {
  const descriptors: ArtifactDescriptor[] = []
  const visit = (part: GmailPayload, depth: number): void => {
    if (depth > 20) return
    const attachmentId = part.body?.attachmentId
    if (attachmentId) {
      descriptors.push({
        ref: `${ref}/attachment/${encodeURIComponent(attachmentId)}`,
        ...(part.filename ? { filename: part.filename } : {}),
        mediaType: part.mimeType || 'application/octet-stream',
        ...(part.body?.size !== undefined ? { byteSize: part.body.size } : {}),
      })
    }
    for (const child of part.parts ?? []) visit(child, depth + 1)
  }
  if (payload) visit(payload, 0)
  return descriptors
}

function decoded(data: string): string {
  try {
    return Buffer.from(data, 'base64url').toString('utf8')
  } catch (cause) {
    throw new CtxindexSyncError(
      'Gmail returned malformed body data',
      'provider_bad_response',
      { cause },
    )
  }
}

function htmlText(html: string): string {
  const { document } = parseHTML(`<html><body>${html}</body></html>`)
  return document.body.textContent.trim()
}

function bodyText(payload: GmailPayload | undefined): string | undefined {
  let plain: string | undefined
  let html: string | undefined
  const visit = (part: GmailPayload, depth: number): void => {
    if (depth > 20) return
    if (!part.body?.attachmentId && part.body?.data) {
      if (part.mimeType === 'text/plain' && plain === undefined) {
        plain = decoded(part.body.data)
      } else if (part.mimeType === 'text/html' && html === undefined) {
        html = decoded(part.body.data)
      }
    }
    for (const child of part.parts ?? []) visit(child, depth + 1)
  }
  if (payload) visit(payload, 0)
  return plain ?? (html === undefined ? undefined : htmlText(html))
}

function retrievedResource(
  ref: string,
  sourceId: string,
  providerMessageId: string,
  message: GmailMessage,
): RetrievedResource {
  if (message.id !== providerMessageId) {
    throw new CtxindexSyncError(
      'Gmail returned a message with an unexpected id',
      'provider_bad_response',
    )
  }
  const subject = gmailHeader(message, 'Subject')
  const from = gmailHeader(message, 'From')
  const to = gmailHeader(message, 'To')
  const rfcMessageId = normalizeGmailMessageId(
    gmailHeader(message, 'Message-ID'),
  )
  const inReplyTo = normalizeGmailMessageId(gmailHeader(message, 'In-Reply-To'))
  const timestamp = gmailOccurredAt(message)
  const date = gmailHeaderDate(message)
  const body = bodyText(message.payload)
  const attachments = attachmentDescriptors(ref, message.payload)
  const payload = communicationMessageSchema.parse({
    providerMessageId,
    ...(message.threadId ? { threadId: message.threadId } : {}),
    ...(message.threadId
      ? { conversationKey: `${sourceId.toUpperCase()}:${message.threadId}` }
      : {}),
    ...(rfcMessageId ? { rfcMessageId } : {}),
    ...(inReplyTo ? { inReplyTo } : {}),
    ...(subject ? { subject } : {}),
    ...(from ? { from: [from] } : {}),
    ...(to ? { to: [to] } : {}),
    ...(date ? { date } : {}),
    ...(message.snippet ? { snippet: message.snippet } : {}),
    ...(body !== undefined ? { bodyText: body } : {}),
    ...(message.labelIds ? { labels: [...message.labelIds] } : {}),
    ...(message.labelIds
      ? { unread: message.labelIds.includes('UNREAD') }
      : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
  })
  return {
    ref,
    profile: { id: 'communication.message', version: 1 },
    title: subject ?? null,
    occurredAt: timestamp ?? null,
    providerUpdatedAt: timestamp ?? null,
    payload,
  }
}

export async function gmailRetrieve(context: RetrieveContext): Promise<void> {
  const id = providerId(context)
  const url = new URL(
    gmailApiUrl(`/gmail/v1/users/me/messages/${encodeURIComponent(id)}`),
  )
  url.searchParams.set('format', 'full')
  const message = (await gmailJson(
    await context.fetch(url, { signal: context.signal }),
  )) as GmailMessage
  const resource = retrievedResource(
    context.ref,
    context.source.id,
    id,
    message,
  )
  await context.emitResource(resource)
  for (const artifact of attachmentDescriptors(context.ref, message.payload)) {
    await context.emitArtifact(artifact)
  }
}
