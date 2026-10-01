import { CtxindexSyncError } from '@ctxindex/core/errors'
import { z } from 'zod'

const eventsPageSchema = z
  .object({
    items: z.array(z.unknown()).default([]),
    nextPageToken: z.string().min(1).optional(),
    nextSyncToken: z.string().min(1).optional(),
  })
  .passthrough()
  .transform(({ items, nextPageToken, nextSyncToken }) => ({
    items,
    ...(nextPageToken === undefined ? {} : { nextPageToken }),
    ...(nextSyncToken === undefined ? {} : { nextSyncToken }),
  }))

export type GoogleCalendarEventsPage = z.infer<typeof eventsPageSchema>

export class GoogleCalendarSyncTokenInvalidError extends Error {
  constructor() {
    super('Google Calendar sync token is invalid')
    this.name = 'GoogleCalendarSyncTokenInvalidError'
  }
}

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get('retry-after')?.trim()
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(value)
  if (Number.isNaN(date)) return undefined
  return Math.max(0, date - Date.now())
}

function responseError(response: Response, syncTokenInvalid: boolean): Error {
  if (response.status === 410 && syncTokenInvalid)
    return new GoogleCalendarSyncTokenInvalidError()
  const message = `Google Calendar request failed with status ${response.status}`
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

async function responseJson(
  response: Response,
  syncTokenInvalid: boolean,
): Promise<unknown> {
  if (!response.ok) throw responseError(response, syncTokenInvalid)
  try {
    return await response.json()
  } catch (cause) {
    throw new CtxindexSyncError(
      'Google Calendar returned a malformed response',
      'provider_bad_response',
      { cause },
    )
  }
}

export async function googleCalendarJson(response: Response): Promise<unknown> {
  return responseJson(response, false)
}

export async function googleCalendarEventsPage(
  response: Response,
): Promise<GoogleCalendarEventsPage> {
  const body = await responseJson(response, true)
  const parsed = eventsPageSchema.safeParse(body)
  if (!parsed.success) {
    throw new CtxindexSyncError(
      'Google Calendar returned a malformed events page',
      'provider_bad_response',
      { cause: parsed.error },
    )
  }
  return parsed.data
}
