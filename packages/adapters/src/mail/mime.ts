import { createHash } from 'node:crypto'
import { CtxindexValidationError } from '@ctxindex/core/errors'
import type { ActionArtifact, ActionContext } from '@ctxindex/extension-sdk'
import {
  MAX_DRAFT_ATTACHMENT_BYTES,
  MAX_DRAFT_ATTACHMENT_COUNT,
} from '@ctxindex/profiles'

const MAX_FILENAME_CODE_POINTS = 255
const MEDIA_TYPE_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}$/

interface MimeMessageInput {
  readonly headers: readonly string[]
  readonly bodyText: string
  readonly attachments: readonly ActionArtifact[]
}

function invalidAttachment(message: string): never {
  throw new CtxindexValidationError('invalid_action_input', message)
}

function validateAttachment(artifact: ActionArtifact): void {
  const filename = artifact.filename
  if (
    !filename ||
    Array.from(filename).length > MAX_FILENAME_CODE_POINTS ||
    filename === '.' ||
    filename === '..' ||
    /[\p{Cc}\\/";:]/u.test(filename)
  )
    invalidAttachment(`Artifact "${artifact.ref}" has an unsafe filename`)
  if (!MEDIA_TYPE_PATTERN.test(artifact.mediaType))
    invalidAttachment(`Artifact "${artifact.ref}" has an unsafe media type`)
  if (
    !Number.isSafeInteger(artifact.byteSize) ||
    artifact.byteSize < 0 ||
    artifact.byteSize !== artifact.bytes.byteLength
  )
    invalidAttachment(`Artifact "${artifact.ref}" has inconsistent bytes`)
}

export async function resolveDraftAttachments(
  context: Pick<ActionContext, 'resolveArtifact'>,
  refs: readonly { readonly ref: string }[] | undefined,
): Promise<readonly ActionArtifact[]> {
  if (!refs) return []
  if (refs.length > MAX_DRAFT_ATTACHMENT_COUNT)
    invalidAttachment('Draft attachment count is outside the portable limit')
  const seen = new Set<string>()
  const resolved: ActionArtifact[] = []
  let totalBytes = 0
  for (const { ref } of refs) {
    if (seen.has(ref)) invalidAttachment(`Duplicate Draft attachment: ${ref}`)
    seen.add(ref)
    const artifact = await context.resolveArtifact(
      ref,
      MAX_DRAFT_ATTACHMENT_BYTES - totalBytes,
    )
    if (!artifact)
      throw new CtxindexValidationError(
        'invalid_action_input',
        `Artifact is not cached and available for this Action: ${ref}. Download it first with: ctxindex artifact download ${ref} --json`,
      )
    validateAttachment(artifact)
    totalBytes += artifact.byteSize
    if (totalBytes > MAX_DRAFT_ATTACHMENT_BYTES)
      invalidAttachment(
        `Draft attachments exceed the portable ${MAX_DRAFT_ATTACHMENT_BYTES}-byte limit`,
      )
    resolved.push(artifact)
  }
  return resolved
}

function encodedFilename(filename: string): string {
  if (/^[\x20-\x21\x23-\x3a\x3c-\x5b\x5d-\x7e]+$/.test(filename))
    return `filename="${filename}"`
  const encoded = encodeURIComponent(filename).replace(
    /[!'()*]/g,
    (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `filename*=UTF-8''${encoded}`
}

function foldedBase64(bytes: Uint8Array): string {
  return (
    Buffer.from(bytes)
      .toString('base64')
      .match(/.{1,76}/g)
      ?.join('\r\n') ?? ''
  )
}

function boundaryFor(content: string): string {
  let counter = 0
  while (true) {
    const suffix = createHash('sha256')
      .update(String(counter))
      .update('\0')
      .update(content)
      .digest('hex')
    const boundary = `ctxindex-${suffix}`
    if (!content.includes(boundary)) return boundary
    counter += 1
  }
}

export function renderMimeMessage(input: MimeMessageInput): string {
  for (const header of input.headers) {
    if (/\r|\n/.test(header))
      throw new CtxindexValidationError(
        'invalid_action_input',
        'Draft MIME headers contain unsafe line breaks',
      )
  }
  const body = input.bodyText.replace(/\r\n|\r|\n/g, '\r\n')
  if (input.attachments.length === 0)
    return [
      ...input.headers,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      body,
    ].join('\r\n')

  const seen = new Set<string>()
  let totalBytes = 0
  for (const artifact of input.attachments) {
    if (seen.has(artifact.ref))
      invalidAttachment(`Duplicate Draft attachment: ${artifact.ref}`)
    seen.add(artifact.ref)
    validateAttachment(artifact)
    totalBytes += artifact.byteSize
  }
  if (
    input.attachments.length > MAX_DRAFT_ATTACHMENT_COUNT ||
    totalBytes > MAX_DRAFT_ATTACHMENT_BYTES
  )
    invalidAttachment('Draft attachments exceed the portable limit')

  const content = [
    ...input.headers,
    body,
    ...input.attachments.flatMap((artifact) => [
      artifact.ref,
      artifact.filename,
      artifact.mediaType,
      foldedBase64(artifact.bytes),
    ]),
  ].join('\0')
  const boundary = boundaryFor(content)
  const lines = [
    ...input.headers,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
  ]
  for (const artifact of input.attachments) {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${artifact.mediaType}`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; ${encodedFilename(artifact.filename)}`,
      '',
      foldedBase64(artifact.bytes),
    )
  }
  lines.push(`--${boundary}--`, '')
  return lines.join('\r\n')
}
