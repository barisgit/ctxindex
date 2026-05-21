import { CtxindexSyncError } from '@ctxindex/core/errors'
import { z } from 'zod'

export const GOOGLE_EGRESS_ALLOWLIST = new Set([
  'oauth2.googleapis.com',
  'accounts.google.com',
  'gmail.googleapis.com',
  'www.googleapis.com',
])

export const OAuthTokenResponseSchema = z
  .object({
    access_token: z.string().optional(),
    refresh_token: z.string().optional(),
    expires_in: z.number().optional(),
    token_type: z.string().optional(),
    error: z.string().optional(),
  })
  .passthrough()

export type OAuthTokenResponse = z.infer<typeof OAuthTokenResponseSchema>

export const GmailMessageListSchema = z
  .object({
    messages: z
      .array(z.object({ id: z.string(), threadId: z.string().optional() }))
      .default([]),
    nextPageToken: z.string().optional(),
    resultSizeEstimate: z.number().optional(),
  })
  .passthrough()

const GmailHeaderSchema = z.object({ name: z.string(), value: z.string() })

export const GmailMessageSchema = z
  .object({
    id: z.string(),
    threadId: z.string(),
    historyId: z.string().optional(),
    internalDate: z.string().optional(),
    snippet: z.string().optional(),
    labelIds: z.array(z.string()).default([]),
    payload: z
      .object({
        mimeType: z.string().optional(),
        filename: z.string().optional(),
        headers: z.array(GmailHeaderSchema).default([]),
        body: z
          .object({
            data: z.string().optional(),
            size: z.number().optional(),
            attachmentId: z.string().optional(),
          })
          .optional(),
        parts: z.array(z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

export type GmailMessage = z.infer<typeof GmailMessageSchema>

export const GmailHistorySchema = z
  .object({
    history: z
      .array(
        z
          .object({
            id: z.string().optional(),
            messagesAdded: z
              .array(
                z.object({
                  message: z
                    .object({ id: z.string(), threadId: z.string().optional() })
                    .passthrough(),
                }),
              )
              .optional(),
          })
          .passthrough(),
      )
      .default([]),
    historyId: z.string().optional(),
  })
  .passthrough()

export type GmailHistory = z.infer<typeof GmailHistorySchema>

export function assertGoogleEgressAllowed(url: string): URL {
  const parsed = new URL(url)
  if (!GOOGLE_EGRESS_ALLOWLIST.has(parsed.hostname)) {
    throw new CtxindexSyncError(
      `network egress host is not allowlisted: ${parsed.hostname}`,
      'provider_bad_response',
    )
  }
  return parsed
}

export async function safeFetch<T extends z.ZodTypeAny>(
  schema: T,
  url: string,
  init?: RequestInit,
): Promise<z.infer<T>> {
  assertGoogleEgressAllowed(url)
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (err) {
    throw new CtxindexSyncError('provider network request failed', 'network', {
      cause: err,
    })
  }

  const bodyText = await response.text()
  let json: unknown = {}
  if (bodyText.length > 0) {
    try {
      json = JSON.parse(bodyText)
    } catch (err) {
      throw new CtxindexSyncError(
        'provider returned non-json response',
        'provider_bad_response',
        {
          cause: err,
        },
      )
    }
  }

  if (!response.ok) {
    if (
      response.status === 401 ||
      (json as { error?: string }).error === 'invalid_grant'
    ) {
      throw new CtxindexSyncError(
        'google authorization expired or was revoked',
        'auth_revoked',
      )
    }
    if (response.status === 403) {
      throw new CtxindexSyncError(
        'google permission denied',
        'permission_denied',
      )
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after')
      const options = retryAfter
        ? { retryAfterMs: Number(retryAfter) * 1000 }
        : undefined
      throw new CtxindexSyncError(
        'google rate limited the request',
        'rate_limited',
        options,
      )
    }
    if (response.status === 404) {
      throw new CtxindexSyncError('google resource not found', 'not_found')
    }
    if (response.status >= 500) {
      throw new CtxindexSyncError(
        'google provider unavailable',
        'provider_unavailable',
      )
    }
    throw new CtxindexSyncError(
      `google provider returned ${response.status}`,
      'provider_bad_response',
    )
  }

  try {
    return schema.parse(json)
  } catch (err) {
    throw new CtxindexSyncError(
      'google provider response failed validation',
      'provider_bad_response',
      {
        cause: err,
      },
    )
  }
}
