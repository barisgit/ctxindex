import type { OAuthProviderDefinition } from '@ctxindex/extension-sdk'
import type { UpsertAccountInput } from '../account'
import { CtxindexAuthError } from '../errors'
import { egressFetch } from '../net'
import { assertOAuthProviderHost } from './oauth-endpoints'

type JsonPath = readonly [string, ...string[]]
function ownPath(value: unknown, path: JsonPath): unknown {
  let current = value
  for (const part of path) {
    if (
      current === null ||
      typeof current !== 'object' ||
      !Object.hasOwn(current, part)
    )
      return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export async function fetchOAuthIdentity(input: {
  provider: OAuthProviderDefinition
  endpoint: string
  accessToken: string
  signal?: AbortSignal
}): Promise<Omit<UpsertAccountInput, 'provider'>> {
  assertOAuthProviderHost(input.provider, input.endpoint)
  let response: Response
  try {
    response = await egressFetch(
      input.endpoint,
      {
        headers: { authorization: `Bearer ${input.accessToken}` },
        redirect: 'manual',
        ...(input.signal ? { signal: input.signal } : {}),
      },
      input.provider.auth.allowedHosts,
    )
  } catch (cause) {
    throw new CtxindexAuthError(
      'network_error',
      'OAuth identity request failed',
      { cause },
    )
  }
  if (!response.ok)
    throw new CtxindexAuthError(
      'identity_response_invalid',
      'OAuth identity endpoint rejected the request',
    )
  let json: unknown
  try {
    json = await response.json()
  } catch (cause) {
    throw new CtxindexAuthError(
      'identity_response_invalid',
      'OAuth identity response was not valid JSON',
      { cause },
    )
  }
  const subject = ownPath(json, input.provider.auth.identity.subjectPath)
  if (typeof subject !== 'string' || subject.trim().length === 0)
    throw new CtxindexAuthError(
      'identity_response_invalid',
      'OAuth identity subject is missing or invalid',
    )
  const label = input.provider.auth.identity.labelPaths
    .map((path) => ownPath(json, path))
    .find(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0,
    )
  const verifiedIdentities: { kind: string; value: string }[] = []
  for (const declaration of input.provider.auth.identity.identities) {
    const value = ownPath(json, declaration.path)
    if (typeof value !== 'string' || value.trim().length === 0) continue
    if (declaration.verifiedPath) {
      const verified = ownPath(json, declaration.verifiedPath)
      if (verified === undefined || verified === false) continue
      if (verified !== true)
        throw new CtxindexAuthError(
          'identity_response_invalid',
          'OAuth identity verification flag must be boolean',
        )
    }
    verifiedIdentities.push({ kind: declaration.kind, value })
  }
  return {
    externalUserId: subject,
    ...(label ? { label } : {}),
    verifiedIdentities,
  }
}
