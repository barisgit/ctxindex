import { z } from 'zod'
import { getEnv } from '../config'
import { CtxindexAuthError } from '../errors'
import { EGRESS_ALLOWLIST, egressFetch, isLoopbackHost } from '../net'
import { type GoogleTokenResponse, GoogleTokenResponseSchema } from './types'

export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

const GMAIL_API_BASE_URL = 'https://gmail.googleapis.com'

export { GoogleTokenResponseSchema }

const GoogleProfileSchema = z
  .object({ emailAddress: z.string().optional() })
  .passthrough()

function joinUrl(base: URL, path: string): string {
  const href = base.href.endsWith('/') ? base.href : `${base.href}/`
  return new URL(path.replace(/^\//, ''), href).toString()
}

function nonProductionMockBaseUrl(): URL | undefined {
  const mockBaseUrl = getEnv().CTXINDEX_GMAIL_MOCK_BASE_URL
  if (!mockBaseUrl || process.env.NODE_ENV === 'production') return undefined
  const parsed = new URL(mockBaseUrl)
  if (!isLoopbackHost(parsed.hostname)) return undefined
  return parsed
}

function tokenEndpointUrl(): string {
  const override = getEnv().CTXINDEX_GMAIL_TOKEN_URL
  if (!override || process.env.NODE_ENV === 'production') {
    return GOOGLE_TOKEN_ENDPOINT
  }
  const parsed = new URL(override)
  if (!isLoopbackHost(parsed.hostname)) return GOOGLE_TOKEN_ENDPOINT
  return parsed.toString()
}

export function assertGoogleEgressAllowed(url: string): void {
  const parsed = new URL(url)
  if (EGRESS_ALLOWLIST.has(parsed.hostname)) return
  if (
    process.env.NODE_ENV !== 'production' &&
    isLoopbackHost(parsed.hostname)
  ) {
    return
  }
  throw new CtxindexAuthError(
    'network_error',
    `network egress host is not allowlisted: ${parsed.hostname}`,
  )
}

function gmailApiUrl(path: string): string {
  return joinUrl(
    nonProductionMockBaseUrl() ?? new URL(GMAIL_API_BASE_URL),
    path,
  )
}

function parseOAuthError(
  json: unknown,
): 'invalid_grant' | 'invalid_client' | 'unknown' {
  const error =
    typeof json === 'object' && json !== null && 'error' in json
      ? (json as { error?: unknown }).error
      : undefined
  if (error === 'invalid_grant') return 'invalid_grant'
  if (error === 'invalid_client') return 'invalid_client'
  return 'unknown'
}

function oauthErrorMessage(json: unknown, fallback: string): string {
  if (typeof json !== 'object' || json === null) return fallback
  const description = (json as { error_description?: unknown })
    .error_description
  if (typeof description === 'string' && description.length > 0) {
    return description
  }
  const error = (json as { error?: unknown }).error
  if (typeof error === 'string' && error.length > 0) return error
  return fallback
}

async function parseJsonResponse(
  response: Response,
  source = 'google token endpoint',
): Promise<unknown> {
  const text = await response.text()
  if (text.length === 0) return {}
  try {
    return JSON.parse(text)
  } catch (cause) {
    throw new CtxindexAuthError(
      'unknown_auth_error',
      `${source} returned non-json response`,
      { cause },
    )
  }
}

export async function postOAuthTokenRequest(
  body: URLSearchParams,
  signal?: AbortSignal,
): Promise<GoogleTokenResponse> {
  const endpoint = tokenEndpointUrl()
  assertGoogleEgressAllowed(endpoint)

  let response: Response
  try {
    response = await egressFetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      ...(signal ? { signal } : {}),
    })
  } catch (cause) {
    throw new CtxindexAuthError(
      'network_error',
      'google token endpoint request failed',
      { cause },
    )
  }

  const json = await parseJsonResponse(response)
  if (!response.ok) {
    const code = parseOAuthError(json)
    throw new CtxindexAuthError(
      code,
      oauthErrorMessage(
        json,
        `google token endpoint returned ${response.status}`,
      ),
    )
  }

  try {
    return GoogleTokenResponseSchema.parse(json)
  } catch (cause) {
    throw new CtxindexAuthError(
      'unknown_auth_error',
      'google token response failed validation',
      { cause },
    )
  }
}

export async function getGoogleAccountEmail(
  accessToken: string,
): Promise<string | null> {
  const endpoint = gmailApiUrl('/gmail/v1/users/me/profile')
  assertGoogleEgressAllowed(endpoint)

  let response: Response
  try {
    response = await egressFetch(endpoint, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
  } catch (cause) {
    throw new CtxindexAuthError(
      'network_error',
      'google profile request failed',
      { cause },
    )
  }

  const json = await parseJsonResponse(response, 'google profile endpoint')
  if (!response.ok) {
    throw new CtxindexAuthError(
      'oauth_failed',
      oauthErrorMessage(
        json,
        `google profile endpoint returned ${response.status}`,
      ),
    )
  }

  try {
    return GoogleProfileSchema.parse(json).emailAddress ?? null
  } catch (cause) {
    throw new CtxindexAuthError(
      'unknown_auth_error',
      'google profile response failed validation',
      { cause },
    )
  }
}
