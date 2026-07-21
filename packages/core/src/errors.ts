import { isSyncError, type SyncErrorCode } from '@ctxindex/extension-sdk'

export type CtxindexSyncErrorCode = SyncErrorCode

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

export type CtxindexAuthErrorCode =
  | 'needs_auth'
  | 'missing_oauth_app_config'
  | 'invalid_grant'
  | 'invalid_client'
  | 'oauth_failed'
  | 'oauth_host_denied'
  | 'insufficient_scope'
  | 'token_response_invalid'
  | 'identity_response_invalid'
  | 'authorization_denied'
  | 'loopback_timeout'
  | 'missing_code'
  | 'state_mismatch'
  | 'network_error'
  | 'token_refresh_failed'
  | 'unknown_auth_error'
  | 'unknown'
  | 'not_implemented_yet'

export class CtxindexAuthError extends CtxindexError {
  override readonly code: CtxindexAuthErrorCode

  constructor(
    code: CtxindexAuthErrorCode,
    message: string,
    options?: CtxindexErrorOptions,
  ) {
    super(message, code, options)
    this.name = 'CtxindexAuthError'
    this.code = code
  }
}

export class CtxindexNotFoundError extends CtxindexError {
  override readonly code = 'not_found'

  constructor(message: string, options?: CtxindexErrorOptions) {
    super(message, 'not_found', options)
    this.name = 'CtxindexNotFoundError'
  }
}

export type CtxindexValidationErrorCode =
  | 'invalid_account_identity'
  | 'invalid_oauth_selection'
  | 'duplicate_realm_slug'
  | 'unknown_realm'
  | 'invalid_filter'
  | 'invalid_ref'
  | 'invalid_artifact_ref'
  | 'invalid_artifact_retention'
  | 'unsupported_export_format'
  | 'ref_source_mismatch'
  | 'unknown_action'
  | 'invalid_action_input'
  | 'action_unsupported'
  | 'confirmation_required'

export class CtxindexValidationError extends CtxindexError {
  override readonly code: CtxindexValidationErrorCode

  constructor(
    code: CtxindexValidationErrorCode,
    message: string,
    options?: CtxindexErrorOptions,
  ) {
    super(message, code, options)
    this.name = 'CtxindexValidationError'
    this.code = code
  }
}

export class CtxindexContinuationError extends CtxindexValidationError {
  override readonly code = 'invalid_filter'

  constructor(message: string, options?: CtxindexErrorOptions) {
    super('invalid_filter', message, options)
    this.name = 'CtxindexContinuationError'
  }
}

export type CtxindexConfigErrorCode =
  | 'secret_must_be_uri'
  | 'secret_uri_invalid'
  | 'env_var_unset'
  | 'env_loader_invalid'

export interface CtxindexConfigErrorOptions extends CtxindexErrorOptions {
  readonly field?: string
  readonly envVar?: string
}

export class CtxindexConfigError extends CtxindexError {
  override readonly code: CtxindexConfigErrorCode
  readonly field?: string
  readonly envVar?: string

  constructor(
    message: string,
    code: CtxindexConfigErrorCode,
    options?: CtxindexConfigErrorOptions,
  ) {
    super(message, code, options)
    this.name = 'CtxindexConfigError'
    this.code = code
    if (options && 'field' in options) {
      this.field = options.field
    }
    if (options && 'envVar' in options) {
      this.envVar = options.envVar
    }
  }
}

export interface CtxindexSyncErrorOptions extends CtxindexErrorOptions {
  readonly retryAfterMs?: number
  readonly publicMessage?: boolean
}

export class CtxindexSyncError extends CtxindexError {
  override readonly code: CtxindexSyncErrorCode
  readonly retryAfterMs?: number
  readonly publicMessage: boolean

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
    this.publicMessage = options?.publicMessage === true
  }
}

export function normalizeSyncError(error: unknown): CtxindexSyncError | null {
  if (error instanceof CtxindexSyncError) return error
  if (!isSyncError(error)) return null
  return new CtxindexSyncError(error.message, error.code, {
    cause: error,
    publicMessage: true,
    ...(error.retryAfterMs === undefined
      ? {}
      : { retryAfterMs: error.retryAfterMs }),
  })
}
