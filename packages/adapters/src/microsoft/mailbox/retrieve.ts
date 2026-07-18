import { CtxindexSyncError } from '@ctxindex/core/errors'
import type {
  ArtifactDescriptor,
  RetrieveContext,
} from '@ctxindex/extension-sdk'
import { z } from 'zod'
import { parseGraphMessage, retrievedResource } from './message'
import { parseMessageRef } from './ref'
import {
  graphHeaders,
  graphJson,
  graphUrl,
  TEXT_BODY_PREFERENCE,
  validateGraphNextLink,
} from './transport'

const MAX_ATTACHMENT_PAGES = 10
const fileAttachmentSchema = z
  .object({
    '@odata.type': z.string().min(1),
    id: z.string().min(1),
    name: z.string().min(1),
    contentType: z.string().min(1),
    isInline: z.boolean(),
  })
  .passthrough()
const attachmentPageSchema = z
  .object({
    value: z.array(z.unknown()),
    '@odata.nextLink': z.string().min(1).optional(),
  })
  .passthrough()

function validFilename(value: string): boolean {
  return !/[\0\r\n/\\]/.test(value) && value !== '.' && value !== '..'
}
function validMediaType(value: string): boolean {
  return /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(value)
}

async function attachmentDescriptors(
  context: RetrieveContext,
  messageId: string,
): Promise<ArtifactDescriptor[]> {
  const descriptors: ArtifactDescriptor[] = []
  let next: string | undefined = graphUrl(
    `/me/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,isInline`,
  )
  let pages = 0
  while (next) {
    if (pages === MAX_ATTACHMENT_PAGES)
      throw new CtxindexSyncError(
        'Microsoft Graph attachment paging exceeded the safety bound',
        'provider_bad_response',
      )
    const page = attachmentPageSchema.safeParse(
      await graphJson(
        await context.fetch(next, {
          headers: graphHeaders(),
          signal: context.signal,
        }),
      ),
    )
    if (!page.success)
      throw new CtxindexSyncError(
        'Microsoft Graph returned invalid attachment metadata',
        'provider_bad_response',
        { cause: page.error },
      )
    pages += 1
    for (const candidate of page.data.value) {
      const parsed = fileAttachmentSchema.safeParse(candidate)
      if (!parsed.success)
        throw new CtxindexSyncError(
          'Microsoft Graph returned invalid attachment metadata',
          'provider_bad_response',
          { cause: parsed.error },
        )
      const attachment = parsed.data
      if (attachment['@odata.type'] !== '#microsoft.graph.fileAttachment') {
        context.logger.warn({
          code: 'unsupported_attachment',
          message: `Microsoft Graph attachment ${attachment.id} is not a downloadable file attachment`,
          ref: context.ref,
        })
        continue
      }
      if (
        !validFilename(attachment.name) ||
        !validMediaType(attachment.contentType)
      )
        throw new CtxindexSyncError(
          'Microsoft Graph returned unsafe attachment metadata',
          'provider_bad_response',
        )
      descriptors.push({
        ref: `${context.ref}/attachment/${encodeURIComponent(attachment.id)}`,
        filename: attachment.name,
        mediaType: attachment.contentType,
      })
    }
    next = page.data['@odata.nextLink']
      ? validateGraphNextLink(
          page.data['@odata.nextLink'],
          `/v1.0/me/messages/${encodeURIComponent(messageId)}/attachments`,
        )
      : undefined
  }
  return descriptors
}

export async function microsoftMailboxRetrieve(
  context: RetrieveContext,
): Promise<void> {
  const messageId = parseMessageRef(context.ref, context.source.id)
  const url = new URL(graphUrl(`/me/messages/${encodeURIComponent(messageId)}`))
  url.searchParams.set(
    '$select',
    'id,conversationId,internetMessageId,internetMessageHeaders,subject,bodyPreview,body,from,replyTo,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,lastModifiedDateTime,isRead,isDraft,categories,hasAttachments',
  )
  const message = parseGraphMessage(
    await graphJson(
      await context.fetch(url, {
        headers: graphHeaders(TEXT_BODY_PREFERENCE),
        signal: context.signal,
      }),
    ),
  )
  if (message.id !== messageId || message.isDraft)
    throw new CtxindexSyncError(
      'Microsoft Graph returned an unexpected message identity',
      'provider_bad_response',
    )
  const artifacts = message.hasAttachments
    ? await attachmentDescriptors(context, messageId)
    : []
  await context.emitResource(
    retrievedResource(context.ref, context.source.id, message, artifacts),
  )
  for (const artifact of artifacts) await context.emitArtifact(artifact)
}
