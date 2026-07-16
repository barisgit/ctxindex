/** Generic network-egress chokepoint (SPEC §17). */
import { CtxindexError } from '../errors'

export function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost'
}
export function assertEgressAllowed(
  url: string | URL,
  allowedHosts: readonly string[] = [],
): URL {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new CtxindexError('network egress URL is invalid', 'egress_denied')
  }
  if (parsed.username || parsed.password)
    throw new CtxindexError(
      'network egress URL credentials are forbidden',
      'egress_denied',
    )
  if (parsed.protocol === 'https:' && allowedHosts.includes(parsed.hostname))
    return parsed
  if (
    process.env.NODE_ENV !== 'production' &&
    (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
    isLoopbackHost(parsed.hostname)
  )
    return parsed
  throw new CtxindexError(
    `network egress host is not allowlisted: ${parsed.hostname}`,
    'egress_denied',
  )
}
export function egressFetch(
  url: string,
  init?: RequestInit,
  allowedHosts: readonly string[] = [],
): Promise<Response> {
  assertEgressAllowed(url, allowedHosts)
  return fetch(url, init)
}
