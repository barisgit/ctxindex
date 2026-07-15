import {
  CtxindexSyncError,
  CtxindexValidationError,
} from '@ctxindex/core/errors'
import type { DownloadContext } from '@ctxindex/extension-sdk'
import { gmailJson } from './gmail-shared'
import { gmailApiUrl } from './google-mailbox/api'

const WRITE_CHUNK_SIZE = 64 * 1024

function badResponse(message: string): never {
  throw new CtxindexSyncError(message, 'provider_bad_response')
}

function parseMessageRef(ref: string, sourceId: string): string {
  let parsed: URL
  try {
    parsed = new URL(ref)
  } catch (cause) {
    throw new CtxindexValidationError('invalid_ref', `Invalid Ref "${ref}"`, {
      cause,
    })
  }
  const segments = parsed.pathname.split('/').filter(Boolean)
  if (
    parsed.protocol !== 'ctx:' ||
    parsed.hostname.toUpperCase() !== sourceId.toUpperCase() ||
    parsed.search ||
    parsed.hash ||
    segments.length !== 2 ||
    segments[0] !== 'message' ||
    !segments[1]
  ) {
    throw new CtxindexValidationError(
      'invalid_ref',
      `Gmail origin Ref "${ref}" must belong to Source and use suffix "message/<provider-id>"`,
    )
  }
  try {
    return decodeURIComponent(segments[1])
  } catch (cause) {
    throw new CtxindexValidationError(
      'invalid_ref',
      `Invalid Gmail origin Ref "${ref}"`,
      { cause },
    )
  }
}

function parseAttachmentId(context: DownloadContext): {
  messageId: string
  attachmentId: string
} {
  const { ref, originRef } = context.artifact
  const messageId = parseMessageRef(originRef, context.source.id)
  const prefix = `${originRef}/attachment/`
  if (!ref.startsWith(prefix)) {
    throw new CtxindexValidationError(
      'invalid_ref',
      `Artifact Ref "${ref}" is not owned by origin "${originRef}"`,
    )
  }
  const encoded = ref.slice(prefix.length)
  if (
    !encoded ||
    encoded.includes('/') ||
    encoded.includes('?') ||
    encoded.includes('#')
  ) {
    throw new CtxindexValidationError(
      'invalid_ref',
      `Invalid Gmail attachment Ref "${ref}"`,
    )
  }
  try {
    const attachmentId = decodeURIComponent(encoded)
    if (!attachmentId || encodeURIComponent(attachmentId) !== encoded) {
      throw new Error('non-canonical attachment id')
    }
    return { messageId, attachmentId }
  } catch (cause) {
    throw new CtxindexValidationError(
      'invalid_ref',
      `Invalid Gmail attachment Ref "${ref}"`,
      { cause },
    )
  }
}

function decodeData(value: unknown): Uint8Array {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9_-]*$/.test(value) ||
    value.length % 4 === 1
  ) {
    return badResponse('Gmail returned malformed attachment data')
  }
  const bytes = Buffer.from(value, 'base64url')
  if (bytes.toString('base64url') !== value) {
    return badResponse('Gmail returned malformed attachment data')
  }
  return bytes
}

export async function gmailDownload(context: DownloadContext): Promise<void> {
  const { messageId, attachmentId } = parseAttachmentId(context)
  const response = await gmailJson(
    await context.fetch(
      gmailApiUrl(
        `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
      ),
      { signal: context.signal },
    ),
  )
  if (
    typeof response !== 'object' ||
    response === null ||
    Array.isArray(response)
  ) {
    return badResponse('Gmail returned malformed attachment metadata')
  }
  const body = response as Record<string, unknown>
  const bytes = decodeData(body.data)
  if (
    body.size !== undefined &&
    (typeof body.size !== 'number' ||
      !Number.isInteger(body.size) ||
      body.size < 0 ||
      body.size !== bytes.byteLength)
  ) {
    return badResponse('Gmail returned an invalid attachment size')
  }
  for (let offset = 0; offset < bytes.byteLength; offset += WRITE_CHUNK_SIZE) {
    context.signal.throwIfAborted()
    await context.write(bytes.subarray(offset, offset + WRITE_CHUNK_SIZE))
  }
}
