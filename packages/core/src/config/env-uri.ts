import { CtxindexConfigError } from '../errors'
import { getEnv } from './env-loader'

export const ENV_URI_PATTERN = /^env:(?:\/\/)?([A-Z_][A-Z0-9_]*)$/

type SecretField = string | undefined

function configErrorOptions(field?: string): { field: string } | undefined {
  return field ? { field } : undefined
}

export interface ParsedEnvUri {
  readonly uri: string
  readonly varName: string
}

function invalidSecretUri(
  value: string,
  field: SecretField,
): CtxindexConfigError {
  if (!value.includes(':')) {
    return new CtxindexConfigError(
      `secret value${field ? ` for ${field}` : ''} must be a URI`,
      'secret_must_be_uri',
      configErrorOptions(field),
    )
  }

  return new CtxindexConfigError(
    `invalid secret URI${field ? ` for ${field}` : ''}`,
    'secret_uri_invalid',
    configErrorOptions(field),
  )
}

export function isEnvUri(value: string): boolean {
  return ENV_URI_PATTERN.test(value)
}

export function parseEnvUri(uri: string, field?: string): ParsedEnvUri {
  const match = ENV_URI_PATTERN.exec(uri)
  const varName = match?.[1]
  if (!varName) throw invalidSecretUri(uri, field)
  return { uri, varName }
}

export function assertSecretUri(value: string, field?: string): string {
  if (isEnvUri(value)) return value
  if (value.startsWith('keychain:') || value.startsWith('file:')) return value
  throw invalidSecretUri(value, field)
}

export function resolveEnvUri(uri: string, field?: string): string {
  const { varName } = parseEnvUri(uri, field)
  const value = getEnv()[varName]

  if (typeof value !== 'string' || value.length === 0) {
    throw new CtxindexConfigError(
      `environment variable ${varName} is not set`,
      'env_var_unset',
      field ? { envVar: varName, field } : { envVar: varName },
    )
  }

  return value
}
