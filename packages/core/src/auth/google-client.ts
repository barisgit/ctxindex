import { getEnv } from '../config'
import { CtxindexAuthError } from '../errors'
import { type GoogleTokenResponse, GoogleTokenResponseSchema } from './types'

export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

const GOOGLE_EGRESS_ALLOWLIST = new Set([
  'oauth2.googleapis.com',
  'accounts.google.com',
  'gmail.googleapis.com',
  'www.googleapis.com',
])

export { GoogleTokenResponseSchema }

function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost'
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
  if (GOOGLE_EGRESS_ALLOWLIST.has(parsed.hostname)) return
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

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.length === 0) return {}
  try {
    return JSON.parse(text)
  } catch (cause) {
    throw new CtxindexAuthError(
      'unknown_auth_error',
      'google token endpoint returned non-json response',
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
    response = await fetch(endpoint, {
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
