import type { OAuthProviderDefinition } from '@ctxindex/extension-sdk'
import { z } from 'zod'
import { CtxindexAuthError } from '../errors'
import { egressFetch } from '../net'
import { assertOAuthProviderHost } from './oauth-endpoints'

const responseSchema = z
  .object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1).optional(),
    expires_in: z.number().positive(),
    scope: z.string().optional(),
    token_type: z.string().optional(),
  })
  .passthrough()

export interface OAuthTokenResponse {
  readonly accessToken: string
  readonly refreshToken?: string
  readonly expiresIn: number
  readonly scope?: string
}

export interface OAuthAppCredentials {
  readonly clientId: string
  readonly clientSecret?: string
}

export function resolveOAuthAppCredentials(
  config: Readonly<Record<string, unknown>>,
): OAuthAppCredentials {
  const clientId = config.clientId
  const clientSecret = config.clientSecret
  if (typeof clientId !== 'string' || clientId.length === 0) {
    throw new CtxindexAuthError(
      'missing_oauth_app_config',
      'OAuth App client id is unavailable',
    )
  }
  if (clientSecret !== undefined && typeof clientSecret !== 'string') {
    throw new CtxindexAuthError(
      'missing_oauth_app_config',
      'OAuth App client secret is invalid',
    )
  }
  return {
    clientId,
    ...(clientSecret === undefined ? {} : { clientSecret }),
  }
}

type OAuthGrant =
  | {
      readonly kind: 'authorization_code'
      readonly code: string
      readonly redirectUri: string
      readonly codeVerifier: string
    }
  | { readonly kind: 'refresh_token'; readonly refreshToken: string }

export async function postOAuthToken(input: {
  readonly provider: OAuthProviderDefinition
  readonly endpoint: string
  readonly clientId: string
  readonly clientSecret?: string
  readonly grant: OAuthGrant
  readonly signal?: AbortSignal
}): Promise<OAuthTokenResponse> {
  assertOAuthProviderHost(input.provider, input.endpoint)
  if (
    input.provider.auth.registration.type === 'confidential' &&
    !input.clientSecret
  ) {
    throw new CtxindexAuthError(
      'missing_oauth_app_config',
      'OAuth provider requires a client secret',
    )
  }
  const body = new URLSearchParams({ client_id: input.clientId })
  if (input.clientSecret) body.set('client_secret', input.clientSecret)
  if (input.grant.kind === 'authorization_code') {
    body.set('grant_type', 'authorization_code')
    body.set('code', input.grant.code)
    body.set('redirect_uri', input.grant.redirectUri)
    body.set('code_verifier', input.grant.codeVerifier)
  } else {
    body.set('grant_type', 'refresh_token')
    body.set('refresh_token', input.grant.refreshToken)
  }
  let response: Response
  try {
    response = await egressFetch(
      input.endpoint,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        redirect: 'manual',
        ...(input.signal ? { signal: input.signal } : {}),
      },
      input.provider.auth.allowedHosts,
    )
  } catch (cause) {
    if (cause instanceof CtxindexAuthError) throw cause
    throw new CtxindexAuthError('network_error', 'OAuth token request failed', {
      cause,
    })
  }
  let json: unknown
  try {
    json = await response.json()
  } catch (cause) {
    throw new CtxindexAuthError(
      'token_response_invalid',
      'OAuth token response was not valid JSON',
      { cause },
    )
  }
  if (!response.ok) {
    const code =
      typeof json === 'object' &&
      json !== null &&
      (json as { error?: unknown }).error === 'invalid_grant'
        ? 'invalid_grant'
        : 'oauth_failed'
    throw new CtxindexAuthError(
      code,
      'OAuth token endpoint rejected the request',
    )
  }
  const parsed = responseSchema.safeParse(json)
  if (!parsed.success)
    throw new CtxindexAuthError(
      'token_response_invalid',
      'OAuth token response failed validation',
    )
  return {
    accessToken: parsed.data.access_token,
    ...(parsed.data.refresh_token
      ? { refreshToken: parsed.data.refresh_token }
      : {}),
    expiresIn: parsed.data.expires_in,
    ...(parsed.data.scope !== undefined ? { scope: parsed.data.scope } : {}),
  }
}
