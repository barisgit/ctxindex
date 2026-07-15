import { CtxindexValidationError } from '../errors'

const SOURCE_ULID = '[0-9A-HJKMNP-TV-Z]{26}'
const SUFFIX_PART = "(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@/]|%[0-9A-F]{2})"
const REF_PATTERN = new RegExp(`^ctx://(${SOURCE_ULID})/(${SUFFIX_PART}+)$`)
const MAX_SUFFIX_BYTES = 16 * 1024

export interface ParsedRef {
  readonly sourceId: string
  readonly suffix: string
  readonly ref: string
}

export function parseRef(ref: string): ParsedRef {
  const match = REF_PATTERN.exec(ref)
  const sourceId = match?.[1]
  const suffix = match?.[2]
  if (
    !sourceId ||
    !suffix ||
    Buffer.byteLength(suffix, 'utf8') > MAX_SUFFIX_BYTES
  ) {
    throw new CtxindexValidationError(
      'invalid_ref',
      `Invalid ctxindex Ref: ${ref}`,
    )
  }
  return { sourceId, suffix, ref }
}
