import { getEnv } from '@ctxindex/core/config'
import { CtxindexSyncError } from '@ctxindex/core/errors'

const GOOGLE_CALENDAR_API_BASE_URL = 'https://www.googleapis.com'

function nonProductionMockBaseUrl(): URL | undefined {
  const mockBaseUrl = getEnv().CTXINDEX_GOOGLE_CALENDAR_MOCK_BASE_URL
  if (!mockBaseUrl) return undefined
  const parsed = new URL(mockBaseUrl)
  if (parsed.hostname !== '127.0.0.1') {
    throw new CtxindexSyncError(
      `network egress host is not allowlisted: ${parsed.hostname}`,
      'provider_bad_response',
    )
  }
  if (process.env.NODE_ENV === 'production') return undefined
  return parsed
}

function joinUrl(base: URL, path: string): string {
  const href = base.href.endsWith('/') ? base.href : `${base.href}/`
  return new URL(path.replace(/^\//, ''), href).toString()
}

export function googleCalendarApiUrl(path: string): string {
  return joinUrl(
    nonProductionMockBaseUrl() ?? new URL(GOOGLE_CALENDAR_API_BASE_URL),
    path,
  )
}
