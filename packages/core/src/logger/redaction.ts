import { getEnv } from '../config/env-loader'

export const REDACT_PATHS = [
  '*.access_token',
  '*.refresh_token',
  '*.authorization',
  '*.cookie',
  '*.password',
  '*.apiKey',
] as const

const SENSITIVE_FIELDS = new Set(
  REDACT_PATHS.map((path) => path.slice(path.indexOf('.') + 1)),
)

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function redactString(value: string): string {
  const canary = getEnv().CTXINDEX_LOG_CANARY_TOKEN
  if (!canary) return value
  return value.split(canary).join('[Redacted]')
}

export function sanitizeLogValue(value: unknown): unknown {
  if (typeof value === 'string') return redactString(value)
  if (Array.isArray(value)) return value.map((entry) => sanitizeLogValue(entry))
  if (!isPlainObject(value)) return value

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_FIELDS.has(key) ? '[Redacted]' : sanitizeLogValue(entry),
    ]),
  )
}
