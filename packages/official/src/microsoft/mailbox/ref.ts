import { CtxindexValidationError } from '@ctxindex/core/errors'

function authority(ref: string): string | undefined {
  return /^ctx:\/\/([^/?#]+)/.exec(ref)?.[1]
}

export function parseDraftRef(ref: string, sourceId: string): string {
  let parsed: URL
  try {
    parsed = new URL(ref)
  } catch (cause) {
    throw new CtxindexValidationError('invalid_ref', `Invalid Ref "${ref}"`, {
      cause,
    })
  }
  if (authority(ref) !== sourceId.toUpperCase() || parsed.protocol !== 'ctx:') {
    throw new CtxindexValidationError(
      'ref_source_mismatch',
      `Ref "${ref}" does not belong to Source "${sourceId}"`,
    )
  }
  const segments = parsed.pathname.split('/').filter(Boolean)
  if (
    parsed.search ||
    parsed.hash ||
    segments.length !== 2 ||
    segments[0] !== 'draft'
  ) {
    throw new CtxindexValidationError(
      'invalid_ref',
      `Microsoft Draft Ref "${ref}" must use suffix "draft/<immutable-id>"`,
    )
  }
  try {
    const id = decodeURIComponent(segments[1] ?? '')
    if (
      !id ||
      encodeURIComponent(id) !== segments[1] ||
      parsed.pathname !== `/draft/${segments[1]}`
    )
      throw new Error('non-canonical immutable Draft id')
    return id
  } catch (cause) {
    throw new CtxindexValidationError(
      'invalid_ref',
      `Invalid Microsoft Draft Ref "${ref}"`,
      { cause },
    )
  }
}

export function parseMessageRef(ref: string, sourceId: string): string {
  let parsed: URL
  try {
    parsed = new URL(ref)
  } catch (cause) {
    throw new CtxindexValidationError('invalid_ref', `Invalid Ref "${ref}"`, {
      cause,
    })
  }
  if (authority(ref) !== sourceId.toUpperCase() || parsed.protocol !== 'ctx:') {
    throw new CtxindexValidationError(
      'ref_source_mismatch',
      `Ref "${ref}" does not belong to Source "${sourceId}"`,
    )
  }
  const segments = parsed.pathname.split('/').filter(Boolean)
  if (
    parsed.search ||
    parsed.hash ||
    segments.length !== 2 ||
    segments[0] !== 'message'
  ) {
    throw new CtxindexValidationError(
      'invalid_ref',
      `Microsoft mailbox Ref "${ref}" must use suffix "message/<immutable-id>"`,
    )
  }
  try {
    const id = decodeURIComponent(segments[1] ?? '')
    if (!id || encodeURIComponent(id) !== segments[1])
      throw new Error('non-canonical immutable id')
    return id
  } catch (cause) {
    throw new CtxindexValidationError(
      'invalid_ref',
      `Invalid Microsoft mailbox Ref "${ref}"`,
      { cause },
    )
  }
}

export function parseAttachmentRef(
  ref: string,
  originRef: string,
  sourceId: string,
): { messageId: string; attachmentId: string } {
  const messageId = parseMessageRef(originRef, sourceId)
  const prefix = `${originRef}/attachment/`
  if (!ref.startsWith(prefix))
    throw new CtxindexValidationError(
      'invalid_artifact_ref',
      `Artifact Ref "${ref}" is not owned by origin "${originRef}"`,
    )
  const encoded = ref.slice(prefix.length)
  try {
    const attachmentId = decodeURIComponent(encoded)
    if (
      !encoded ||
      encoded.includes('/') ||
      encoded.includes('?') ||
      encoded.includes('#') ||
      !attachmentId ||
      encodeURIComponent(attachmentId) !== encoded
    )
      throw new Error('non-canonical attachment id')
    return { messageId, attachmentId }
  } catch (cause) {
    throw new CtxindexValidationError(
      'invalid_artifact_ref',
      `Invalid Microsoft attachment Ref "${ref}"`,
      { cause },
    )
  }
}
