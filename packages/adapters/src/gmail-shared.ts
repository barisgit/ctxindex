import { CtxindexSyncError } from '@ctxindex/core/errors'

export interface GmailPayload {
  readonly filename?: string
  readonly mimeType?: string
  readonly headers?: readonly {
    readonly name?: string
    readonly value?: string
  }[]
  readonly body?: {
    readonly data?: string
    readonly attachmentId?: string
    readonly size?: number
  }
  readonly parts?: readonly GmailPayload[]
}

export interface GmailMessage {
  readonly id?: string
  readonly threadId?: string
  readonly labelIds?: readonly string[]
  readonly snippet?: string
  readonly internalDate?: string
  readonly payload?: GmailPayload
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

export function gmailHeader(
  message: GmailMessage,
  name: string,
): string | undefined {
  return message.payload?.headers?.find(
    (candidate) => candidate.name?.toLowerCase() === name.toLowerCase(),
  )?.value
}

export function normalizeGmailMessageId(
  value: string | undefined,
): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  return trimmed.match(/<[^<>]+>/)?.[0] ?? trimmed
}

export function gmailOccurredAt(message: GmailMessage): number | undefined {
  const internalDate = Number(message.internalDate)
  if (Number.isFinite(internalDate) && internalDate >= 0) return internalDate
  const date = gmailHeader(message, 'Date')
  if (!date) return undefined
  const parsed = Date.parse(date)
  return Number.isNaN(parsed) ? undefined : parsed
}

export function gmailHeaderDate(message: GmailMessage): string | undefined {
  const value = gmailHeader(message, 'Date')
  if (!value) return undefined
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString()
}
