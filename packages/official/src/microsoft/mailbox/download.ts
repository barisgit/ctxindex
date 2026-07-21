import {
  CtxindexSyncError,
  CtxindexValidationError,
} from '@ctxindex/core/errors'
import type { DownloadContext } from '@ctxindex/extension-sdk'
import { parseAttachmentRef } from './ref'
import { graphHeaders, graphResponseError, graphUrl } from './transport'

function validateDescriptor(context: DownloadContext): void {
  const { filename, mediaType, byteSize } = context.artifact
  if (
    (filename !== undefined && (!filename || /[\0\r\n/\\]/.test(filename))) ||
    (mediaType !== undefined &&
      !/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(mediaType)) ||
    (byteSize !== undefined && (!Number.isInteger(byteSize) || byteSize < 0))
  ) {
    throw new CtxindexValidationError(
      'invalid_artifact_ref',
      'Microsoft attachment descriptor is invalid',
    )
  }
}

export async function microsoftMailboxDownload(
  context: DownloadContext,
): Promise<void> {
  const { messageId, attachmentId } = parseAttachmentRef(
    context.artifact.ref,
    context.artifact.originRef,
    context.source.id,
  )
  validateDescriptor(context)
  const response = await context.fetch(
    graphUrl(
      `/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/$value`,
    ),
    { headers: graphHeaders(), signal: context.signal },
  )
  if (!response.ok) throw await graphResponseError(response)
  const expectedSize = context.artifact.byteSize
  const lengthHeader = response.headers.get('content-length')
  if (lengthHeader !== null) {
    const length = Number(lengthHeader)
    if (
      !Number.isInteger(length) ||
      length < 0 ||
      (expectedSize !== undefined && length !== expectedSize)
    )
      throw new CtxindexSyncError(
        'Microsoft Graph returned an invalid attachment size',
        'provider_bad_response',
      )
  }
  const expectedMedia = context.artifact.mediaType?.toLowerCase()
  const actualMedia = response.headers
    .get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase()
  if (expectedMedia && actualMedia && expectedMedia !== actualMedia)
    throw new CtxindexSyncError(
      'Microsoft Graph returned an unexpected attachment media type',
      'provider_bad_response',
    )
  let size = 0
  if (response.body) {
    const reader = response.body.getReader()
    while (true) {
      context.signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      await context.write(value)
    }
  }
  if (expectedSize !== undefined && size !== expectedSize)
    throw new CtxindexSyncError(
      'Microsoft Graph returned an invalid attachment size',
      'provider_bad_response',
    )
}
