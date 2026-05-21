export type CtxindexSyncErrorCode =
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

export interface CtxindexErrorOptions {
  readonly cause?: unknown
}

export class CtxindexError extends Error {
  readonly code: string
  override readonly cause?: unknown

  constructor(message: string, code: string, options?: CtxindexErrorOptions) {
    super(
      message,
      options && 'cause' in options ? { cause: options.cause } : undefined,
    )
    this.name = 'CtxindexError'
    this.code = code
    if (options && 'cause' in options) {
      this.cause = options.cause
    }
  }
}

export interface CtxindexSyncErrorOptions extends CtxindexErrorOptions {
  readonly retryAfterMs?: number
}

export class CtxindexSyncError extends CtxindexError {
  override readonly code: CtxindexSyncErrorCode
  readonly retryAfterMs?: number

  constructor(
    message: string,
    code: CtxindexSyncErrorCode,
    options?: CtxindexSyncErrorOptions,
  ) {
    super(message, code, options)
    this.name = 'CtxindexSyncError'
    this.code = code
    if (options && 'retryAfterMs' in options) {
      this.retryAfterMs = options.retryAfterMs
    }
  }
}
