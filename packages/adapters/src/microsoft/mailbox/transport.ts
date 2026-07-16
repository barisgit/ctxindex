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
  return new URL(path.replace(/^\//, ''), graphBaseUrl()).toString()
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

export function graphResponseError(response: Response): CtxindexSyncError {
  const message = `Microsoft Graph request failed with status ${response.status}`
  if (response.status === 401)
    return new CtxindexSyncError(message, 'auth_expired')
  if (response.status === 403)
    return new CtxindexSyncError(message, 'permission_denied')
  if (response.status === 404)
    return new CtxindexSyncError(message, 'not_found')
  if (response.status === 429) {
    const retry = retryAfterMs(response)
    return new CtxindexSyncError(
      message,
      'rate_limited',
      retry === undefined ? undefined : { retryAfterMs: retry },
    )
  }
  if (response.status >= 500)
    return new CtxindexSyncError(message, 'provider_unavailable')
  return new CtxindexSyncError(message, 'provider_bad_response')
}

export async function graphJson(response: Response): Promise<unknown> {
  if (!response.ok) throw graphResponseError(response)
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

export function validateGraphNextLink(
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
  return url.toString()
}
