export type SyncErrorCode =
  | 'auth_expired'
  | 'auth_revoked'
  | 'rate_limited'
  | 'network'
  | 'provider_unavailable'
  | 'provider_bad_response'
  | 'provider_quota'
  | 'not_found'
  | 'permission_denied'
  | 'cancelled'
  | 'unknown'
  | 'not_implemented_yet'

export interface SyncErrorOptions {
  readonly retryAfterMs?: number
}

export interface SyncError {
  readonly kind: 'ctxindex.sync-error'
  readonly code: SyncErrorCode
  readonly message: string
  readonly retryAfterMs?: number
}

const syncErrorCodes = new Set<string>([
  'auth_expired',
  'auth_revoked',
  'rate_limited',
  'network',
  'provider_unavailable',
  'provider_bad_response',
  'provider_quota',
  'not_found',
  'permission_denied',
  'cancelled',
  'unknown',
  'not_implemented_yet',
])

function isPublicMessage(message: unknown): message is string {
  if (typeof message !== 'string' || message.length === 0) return false
  if (!message.isWellFormed()) return false
  for (const character of message) {
    const code = character.codePointAt(0) ?? 0
    if (code <= 31 || (code >= 127 && code <= 159)) return false
  }
  return new TextEncoder().encode(message).byteLength <= 512
}

export function isSyncError(value: unknown): value is SyncError {
  try {
    if (typeof value !== 'object' || value === null) return false
    const candidate = value as Record<string, unknown>
    const keys = Object.keys(candidate)
    if (
      keys.some(
        (key) =>
          key !== 'kind' &&
          key !== 'code' &&
          key !== 'message' &&
          key !== 'retryAfterMs',
      )
    ) {
      return false
    }
    if (
      !Object.hasOwn(candidate, 'kind') ||
      !Object.hasOwn(candidate, 'code') ||
      !Object.hasOwn(candidate, 'message') ||
      candidate.kind !== 'ctxindex.sync-error' ||
      typeof candidate.code !== 'string' ||
      !syncErrorCodes.has(candidate.code) ||
      !isPublicMessage(candidate.message)
    ) {
      return false
    }
    return (
      !Object.hasOwn(candidate, 'retryAfterMs') ||
      (Number.isSafeInteger(candidate.retryAfterMs) &&
        (candidate.retryAfterMs as number) >= 0 &&
        (candidate.retryAfterMs as number) <= 60_000)
    )
  } catch {
    return false
  }
}

export function syncError(
  code: SyncErrorCode,
  message: string,
  options: SyncErrorOptions = {},
): SyncError {
  const value: SyncError = {
    kind: 'ctxindex.sync-error',
    code,
    message,
    ...(options.retryAfterMs === undefined
      ? {}
      : { retryAfterMs: options.retryAfterMs }),
  }
  if (!isSyncError(value)) {
    throw new TypeError('Invalid public sync error')
  }
  return Object.freeze(value)
}
