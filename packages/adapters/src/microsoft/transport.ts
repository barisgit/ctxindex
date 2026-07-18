import { getEnv } from '@ctxindex/core/config'
import { CtxindexSyncError } from '@ctxindex/core/errors'

const GRAPH_BASE_URL = new URL('https://graph.microsoft.com/v1.0/')
export const IMMUTABLE_ID_PREFERENCE = 'IdType="ImmutableId"'
export const TEXT_BODY_PREFERENCE = `${IMMUTABLE_ID_PREFERENCE}, outlook.body-content-type="text"`

function graphBaseUrl(): URL {
  const value = getEnv().CTXINDEX_GRAPH_MOCK_BASE_URL
  if (!value || process.env.NODE_ENV === 'production') return GRAPH_BASE_URL
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch (cause) {
    throw new CtxindexSyncError(
      'Microsoft Graph mock base URL is invalid',
      'provider_bad_response',
      { cause },
    )
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.hostname !== '127.0.0.1' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== '' && parsed.pathname !== '/')
  ) {
    throw new CtxindexSyncError(
      'Microsoft Graph mock base URL must be an origin on 127.0.0.1',
      'provider_bad_response',
    )
  }
  return new URL('/v1.0/', parsed)
}

export function graphUrl(path: string): string {
  const relativePath = path.replace(/^\/+/, '').replace(/^v1\.0\/+/, '')
  return new URL(relativePath, graphBaseUrl()).toString()
}

export function graphHeaders(prefer = IMMUTABLE_ID_PREFERENCE): Headers {
  return new Headers({ prefer })
}

function retryAfterMs(response: Response): number | undefined {
  const millisecondsHeader = response.headers.get('x-ms-retry-after-ms')
  const milliseconds = Number(millisecondsHeader)
  if (millisecondsHeader && Number.isFinite(milliseconds) && milliseconds >= 0)
    return milliseconds
  const value = response.headers.get('retry-after')?.trim()
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(value)
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}

const MAX_GRAPH_DIAGNOSTIC_BYTES = 16 * 1024

interface GraphDiagnostic {
  readonly code?: string
  readonly wording?: string
  readonly requestIdPresent: boolean
  readonly clientRequestIdPresent: boolean
}

export interface GraphResponseFailure {
  readonly code?: string
  readonly error: CtxindexSyncError
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

async function boundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_GRAPH_DIAGNOSTIC_BYTES
  ) {
    await response.body?.cancel().catch(() => undefined)
    return undefined
  }
  if (!response.body) return undefined
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > MAX_GRAPH_DIAGNOSTIC_BYTES) {
      await reader.cancel().catch(() => undefined)
      return undefined
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return undefined
  }
}

function fixedGraphWording(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const message = value.toLowerCase()
  if (
    message.includes('@odata.type') &&
    message.includes('$select') &&
    message.includes('$expand')
  )
    return 'Microsoft Graph rejected @odata.type in a $select or $expand expression'
  if (message.includes('malformed') && message.includes('id'))
    return 'Microsoft Graph reported a malformed identifier'
  if (message.includes('resource') && message.includes('not found'))
    return 'Microsoft Graph reported that the resource was not found'
  return 'provider message withheld'
}

async function graphDiagnostic(response: Response): Promise<GraphDiagnostic> {
  const body = await boundedJson(response).then(record, () => undefined)
  const error = record(body?.error)
  const innerError = record(error?.innerError) ?? record(error?.innererror)
  const rawCode = error?.code
  const wording = fixedGraphWording(error?.message)
  const code =
    typeof rawCode === 'string' &&
    /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(rawCode)
      ? rawCode
      : undefined
  return {
    ...(code ? { code } : {}),
    ...(wording ? { wording } : {}),
    requestIdPresent:
      response.headers.has('request-id') ||
      Boolean(innerError && Object.hasOwn(innerError, 'request-id')),
    clientRequestIdPresent:
      response.headers.has('client-request-id') ||
      Boolean(innerError && Object.hasOwn(innerError, 'client-request-id')),
  }
}

export async function graphResponseFailure(
  response: Response,
): Promise<GraphResponseFailure> {
  const diagnostic = await graphDiagnostic(response)
  const details = [
    diagnostic.code ? `code ${diagnostic.code}` : undefined,
    diagnostic.wording,
    diagnostic.requestIdPresent ? 'request-id [redacted]' : undefined,
    diagnostic.clientRequestIdPresent
      ? 'client-request-id [redacted]'
      : undefined,
  ].filter((value): value is string => value !== undefined)
  const message = `Microsoft Graph request failed with status ${response.status}${details.length ? ` (${details.join('; ')})` : ''}`
  let error: CtxindexSyncError
  if (response.status === 401)
    error = new CtxindexSyncError(message, 'auth_expired')
  else if (response.status === 403)
    error = new CtxindexSyncError(message, 'permission_denied')
  else if (response.status === 404)
    error = new CtxindexSyncError(message, 'not_found')
  else if (response.status === 429) {
    const retry = retryAfterMs(response)
    error = new CtxindexSyncError(
      message,
      'rate_limited',
      retry === undefined ? undefined : { retryAfterMs: retry },
    )
  } else if (response.status >= 500)
    error = new CtxindexSyncError(message, 'provider_unavailable')
  else error = new CtxindexSyncError(message, 'provider_bad_response')
  return { ...(diagnostic.code ? { code: diagnostic.code } : {}), error }
}

export async function graphResponseError(
  response: Response,
): Promise<CtxindexSyncError> {
  return (await graphResponseFailure(response)).error
}

export async function graphJson(response: Response): Promise<unknown> {
  if (!response.ok) throw await graphResponseError(response)
  try {
    return await response.json()
  } catch (cause) {
    throw new CtxindexSyncError(
      'Microsoft Graph returned malformed JSON',
      'provider_bad_response',
      { cause },
    )
  }
}

export function validateGraphOpaqueLink(
  value: string,
  routePrefix: string,
): string {
  let url: URL
  try {
    url = new URL(value)
  } catch (cause) {
    throw new CtxindexSyncError(
      'Microsoft Graph returned an invalid nextLink',
      'provider_bad_response',
      { cause },
    )
  }
  if (
    url.origin !== graphBaseUrl().origin ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== routePrefix
  ) {
    throw new CtxindexSyncError(
      'Microsoft Graph returned a disallowed nextLink',
      'provider_bad_response',
    )
  }
  return value
}

export const validateGraphNextLink = validateGraphOpaqueLink
