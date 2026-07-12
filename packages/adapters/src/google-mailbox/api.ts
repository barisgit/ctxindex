import { appendFile } from 'node:fs/promises'
import { getEnv } from '@ctxindex/core/config'
import { CtxindexSyncError } from '@ctxindex/core/errors'
import { EGRESS_ALLOWLIST, egressFetch } from '@ctxindex/core/net'
import { z } from 'zod'

const GMAIL_API_BASE_URL = 'https://gmail.googleapis.com'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

// Re-exported for back-compat; the source of truth is `@ctxindex/core/net`.
export const GOOGLE_EGRESS_ALLOWLIST = EGRESS_ALLOWLIST

function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1'
}

function nonProductionMockBaseUrl(): URL | undefined {
  const mockBaseUrl = getEnv().CTXINDEX_GMAIL_MOCK_BASE_URL
  if (!mockBaseUrl) return undefined
  const parsed = new URL(mockBaseUrl)
  if (!isLoopbackHost(parsed.hostname)) {
    throw new CtxindexSyncError(
      `network egress host is not allowlisted: ${parsed.hostname}`,
      'provider_bad_response',
    )
  }
  if (process.env.NODE_ENV === 'production') return undefined
  return parsed
}

function nonProductionTokenOverrideUrl(): URL | undefined {
  const tokenOverride = getEnv().CTXINDEX_GMAIL_TOKEN_URL
  if (!tokenOverride || process.env.NODE_ENV === 'production') return undefined
  const parsed = new URL(tokenOverride)
  if (!isLoopbackHost(parsed.hostname)) {
    throw new CtxindexSyncError(
      `network egress host is not allowlisted: ${parsed.hostname}`,
      'provider_bad_response',
    )
  }
  return parsed
}

function isNonProductionMockEndpoint(parsed: URL): boolean {
  const mockBase = nonProductionMockBaseUrl()
  if (mockBase && parsed.origin === mockBase.origin) return true
  const tokenOverride = nonProductionTokenOverrideUrl()
  return tokenOverride ? parsed.href === tokenOverride.href : false
}

function joinUrl(base: URL, path: string): string {
  const href = base.href.endsWith('/') ? base.href : `${base.href}/`
  return new URL(path.replace(/^\//, ''), href).toString()
}

export function routeGoogleApiUrl(url: string): string {
  const parsed = new URL(url)
  const mockBase = nonProductionMockBaseUrl()
  if (!mockBase) return url

  if (parsed.hostname === 'gmail.googleapis.com') {
    return joinUrl(mockBase, `${parsed.pathname}${parsed.search}`)
  }
  if (
    parsed.hostname === 'oauth2.googleapis.com' &&
    parsed.pathname === '/token'
  ) {
    return joinUrl(mockBase, '/token')
  }

  return url
}

async function recordTestFetch(url: string, init?: RequestInit): Promise<void> {
  const fetchLog = getEnv().CTXINDEX_TEST_FETCH_LOG
  if (fetchLog && process.env.NODE_ENV !== 'production') {
    await appendFile(
      fetchLog,
      `${(init?.method ?? 'GET').toUpperCase()} ${url}\n`,
    )
  }
}

export function gmailApiUrl(path: string): string {
  return joinUrl(
    nonProductionMockBaseUrl() ?? new URL(GMAIL_API_BASE_URL),
    path,
  )
}

export function googleTokenUrl(): string {
  return (
    nonProductionTokenOverrideUrl()?.toString() ??
    routeGoogleApiUrl(GOOGLE_TOKEN_URL)
  )
}

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

export interface GoogleRefreshTokenOptions {
  readonly clientId: string
  readonly clientSecret: string
  readonly refreshToken: string
}

export async function exchangeGoogleRefreshToken({
  clientId,
  clientSecret,
  refreshToken,
}: GoogleRefreshTokenOptions): Promise<OAuthTokenResponse> {
  return safeFetch(OAuthTokenResponseSchema, googleTokenUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  })
}

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

export const GmailProfileSchema = z
  .object({
    emailAddress: z.string().optional(),
    messagesTotal: z.number().optional(),
    threadsTotal: z.number().optional(),
    historyId: z.string(),
  })
  .passthrough()

export function assertGoogleEgressAllowed(url: string): URL {
  const parsed = new URL(url)
  if (
    !GOOGLE_EGRESS_ALLOWLIST.has(parsed.hostname) &&
    !isNonProductionMockEndpoint(parsed)
  ) {
    throw new CtxindexSyncError(
      `network egress host is not allowlisted: ${parsed.hostname}`,
      'provider_bad_response',
    )
  }
  return parsed
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) return
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchAndParse<T extends z.ZodTypeAny>(
  schema: T,
  url: string,
  init?: RequestInit,
): Promise<z.infer<T>> {
  assertGoogleEgressAllowed(url)
  await recordTestFetch(url, init)
  let response: Response
  try {
    response = await egressFetch(url, init)
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

export async function safeFetch<T extends z.ZodTypeAny>(
  schema: T,
  url: string,
  init?: RequestInit,
): Promise<z.infer<T>> {
  const routedUrl = routeGoogleApiUrl(url)
  try {
    return await fetchAndParse(schema, routedUrl, init)
  } catch (err) {
    if (err instanceof CtxindexSyncError && err.code === 'rate_limited') {
      await delay(err.retryAfterMs ?? 0)
      return fetchAndParse(schema, routedUrl, init)
    }
    throw err
  }
}
