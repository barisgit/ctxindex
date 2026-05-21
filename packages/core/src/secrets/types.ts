import { CtxindexError } from '../errors'

export interface SecretsStore {
  getSecret(ref: string): Promise<string>
  setSecret(scope: string, key: string, value: string): Promise<string>
  deleteSecret(ref: string): Promise<void>
  listKeys(): Promise<{ ref: string; scope: string; key: string }[]>
}

export type SecretBackend = 'keychain' | 'file'

export type CtxindexSecretsErrorCode =
  | 'backend_unavailable'
  | 'not_found'
  | 'invalid_ref'
  | 'invalid_key'
  | 'decrypt_failed'
  | 'io'
  | 'unknown'

export class CtxindexSecretsError extends CtxindexError {
  override readonly code: CtxindexSecretsErrorCode

  constructor(
    message: string,
    code: CtxindexSecretsErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, code, options)
    this.name = 'CtxindexSecretsError'
    this.code = code
  }
}

export interface ParsedKeychainRef {
  readonly backend: 'keychain'
  readonly scope: string
  readonly key: string
}

export interface ParsedFileRef {
  readonly backend: 'file'
  readonly key: string
}

export type ParsedSecretRef = ParsedKeychainRef | ParsedFileRef

const urlSafePattern = /^[A-Za-z0-9._~-]+$/

export function assertSecretPart(value: string, label: string): string {
  if (!value) {
    throw new CtxindexSecretsError(`${label} must not be empty`, 'invalid_key')
  }
  if (value.includes('/')) {
    throw new CtxindexSecretsError(`${label} must not contain /`, 'invalid_key')
  }
  return value
}

export function encodeSecretPart(value: string): string {
  const encoded = encodeURIComponent(assertSecretPart(value, 'secret key'))
  if (!urlSafePattern.test(encoded.replaceAll('%', ''))) {
    throw new CtxindexSecretsError(
      'secret key must be URL-safe after encoding',
      'invalid_key',
    )
  }
  return encoded
}

export function decodeSecretPart(value: string, label: string): string {
  if (!value) {
    throw new CtxindexSecretsError(`${label} must not be empty`, 'invalid_ref')
  }
  try {
    return decodeURIComponent(value)
  } catch (cause) {
    throw new CtxindexSecretsError(
      `invalid ${label} in secret reference`,
      'invalid_ref',
      { cause },
    )
  }
}

export function keychainRef(scope: string, key: string): string {
  return `keychain:ctxindex/${encodeSecretPart(scope)}/${encodeSecretPart(key)}`
}

export function fileRef(key: string): string {
  return `file:secrets.box#${encodeSecretPart(key)}`
}

export function parseSecretRef(ref: string): ParsedSecretRef {
  if (ref.startsWith('keychain:ctxindex/')) {
    const rest = ref.slice('keychain:ctxindex/'.length)
    const parts = rest.split('/')
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new CtxindexSecretsError(
        `invalid keychain secret reference: ${ref}`,
        'invalid_ref',
      )
    }
    return {
      backend: 'keychain',
      scope: decodeSecretPart(parts[0], 'scope'),
      key: decodeSecretPart(parts[1], 'key'),
    }
  }

  if (ref.startsWith('file:secrets.box#')) {
    const key = ref.slice('file:secrets.box#'.length)
    if (!key || !urlSafePattern.test(key.replaceAll('%', ''))) {
      throw new CtxindexSecretsError(
        `invalid file secret reference: ${ref}`,
        'invalid_ref',
      )
    }
    return {
      backend: 'file',
      key: decodeSecretPart(key, 'key'),
    }
  }

  throw new CtxindexSecretsError(
    `unsupported secret reference: ${ref}`,
    'invalid_ref',
  )
}

export function wrapSecretsError(
  err: unknown,
  fallbackMessage: string,
  fallbackCode: CtxindexSecretsErrorCode = 'unknown',
): CtxindexSecretsError {
  if (err instanceof CtxindexSecretsError) return err
  return new CtxindexSecretsError(fallbackMessage, fallbackCode, { cause: err })
}
