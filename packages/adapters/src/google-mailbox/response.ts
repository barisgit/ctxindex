import { CtxindexSyncError } from '@ctxindex/core/errors'

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get('retry-after')?.trim()
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(value)
  if (Number.isNaN(date)) return undefined
  return Math.max(0, date - Date.now())
}

function responseError(response: Response): CtxindexSyncError {
  const message = `Gmail request failed with status ${response.status}`
  if (response.status === 401) {
    return new CtxindexSyncError(message, 'auth_expired')
  }
  if (response.status === 403) {
    return new CtxindexSyncError(message, 'permission_denied')
  }
  if (response.status === 404) {
    return new CtxindexSyncError(message, 'not_found')
  }
  if (response.status === 429) {
    const retry = retryAfterMs(response)
    return new CtxindexSyncError(
      message,
      'rate_limited',
      retry === undefined ? undefined : { retryAfterMs: retry },
    )
  }
  if (response.status >= 500) {
    return new CtxindexSyncError(message, 'provider_unavailable')
  }
  return new CtxindexSyncError(message, 'provider_bad_response')
}

export async function gmailJson(response: Response): Promise<unknown> {
  if (!response.ok) throw responseError(response)
  try {
    return await response.json()
  } catch (cause) {
    throw new CtxindexSyncError(
      'Gmail returned a malformed response',
      'provider_bad_response',
      { cause },
    )
  }
}
