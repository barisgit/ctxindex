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
import { z } from 'zod'
import {
  type GmailMessage,
  type GmailPayload,
  gmailHeader,
  gmailHeaderAddresses,
  gmailHeaderDate,
  gmailOccurredAt,
  normalizeGmailMessageId,
  normalizeGmailReferences,
} from './message'
import { gmailJson } from './response'
import { gmailApiUrl } from './url'

interface GmailRefTarget {
  readonly kind: 'message' | 'draft'
  readonly id: string
}

const gmailDraftSchema = z
  .object({
    id: z.string().min(1),
    message: z
      .object({
        id: z.string().min(1),
      })
      .passthrough(),
  })
  .passthrough()

function providerTarget(context: RetrieveContext): GmailRefTarget {
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
    (segments[0] !== 'message' && segments[0] !== 'draft') ||
    !segments[1]
  ) {
    throw new CtxindexValidationError(
      'invalid_ref',
      `Gmail Ref "${context.ref}" must use suffix "message/<provider-id>" or "draft/<provider-id>"`,
    )
  }
  return {
    kind: segments[0],
    id: decodeURIComponent(segments[1]),
  }
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
  providerDraftId?: string,
): RetrievedResource {
  if (!providerDraftId && message.id !== providerMessageId) {
    throw new CtxindexSyncError(
      'Gmail returned a message with an unexpected id',
      'provider_bad_response',
    )
  }
  const subject = gmailHeader(message, 'Subject')
  const from = gmailHeader(message, 'From')
  const to = gmailHeader(message, 'To')
  const cc = gmailHeader(message, 'Cc')
  const bcc = gmailHeader(message, 'Bcc')
  const rfcMessageId = normalizeGmailMessageId(
    gmailHeader(message, 'Message-ID'),
  )
  const inReplyTo = normalizeGmailMessageId(gmailHeader(message, 'In-Reply-To'))
  const references = normalizeGmailReferences(
    gmailHeader(message, 'References'),
  )
  const replyTo = gmailHeaderAddresses(gmailHeader(message, 'Reply-To'))
  const timestamp = gmailOccurredAt(message)
  const date = gmailHeaderDate(message)
  const body = bodyText(message.payload)
  const attachments = providerDraftId
    ? []
    : attachmentDescriptors(ref, message.payload)
  const payload = communicationMessageSchema.parse({
    providerMessageId,
    ...(providerDraftId ? { providerDraftId } : {}),
    ...(message.threadId ? { threadId: message.threadId } : {}),
    ...(message.threadId
      ? { conversationKey: `${sourceId.toUpperCase()}:${message.threadId}` }
      : {}),
    ...(rfcMessageId ? { rfcMessageId } : {}),
    ...(inReplyTo ? { inReplyTo } : {}),
    ...(references ? { references } : {}),
    ...(replyTo ? { replyTo } : {}),
    ...(subject ? { subject } : {}),
    ...(from ? { from: [from] } : {}),
    ...(to ? { to: [to] } : {}),
    ...(cc ? { cc: [cc] } : {}),
    ...(bcc ? { bcc: [bcc] } : {}),
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
  const target = providerTarget(context)
  const url = new URL(
    gmailApiUrl(
      `/gmail/v1/users/me/${target.kind === 'draft' ? 'drafts' : 'messages'}/${encodeURIComponent(target.id)}`,
    ),
  )
  url.searchParams.set('format', 'full')
  const response = await gmailJson(
    await context.fetch(url, { signal: context.signal }),
  )
  let message: GmailMessage
  if (target.kind === 'draft') {
    const draft = gmailDraftSchema.safeParse(response)
    if (!draft.success || draft.data.id !== target.id) {
      throw new CtxindexSyncError(
        'Gmail returned an invalid Draft response',
        'provider_bad_response',
        { cause: draft.success ? undefined : draft.error },
      )
    }
    message = draft.data.message
  } else {
    message = response as GmailMessage
  }
  const resource = retrievedResource(
    context.ref,
    context.source.id,
    message.id ?? '',
    message,
    target.kind === 'draft' ? target.id : undefined,
  )
  await context.emitResource(resource)
  if (target.kind === 'message') {
    for (const artifact of attachmentDescriptors(
      context.ref,
      message.payload,
    )) {
      await context.emitArtifact(artifact)
    }
  }
}
