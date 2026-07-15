/**
 * The single network-egress chokepoint (SPEC §17). Every outbound HTTP request
 * in core and adapters routes through `egressFetch`; it is the only place the
 * global `fetch` is called, and `EGRESS_ALLOWLIST` is the one source of truth
 * for permitted provider hosts. Callers add their own response parsing and
 * error-taxonomy mapping on top.
 */
import { CtxindexError } from '../errors'

/** Declared provider hosts. Adding a non-provider host requires a SPEC change. */
export const EGRESS_ALLOWLIST = new Set([
  'oauth2.googleapis.com',
  'accounts.google.com',
  'gmail.googleapis.com',
  'www.googleapis.com',
])

export function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost'
}

/**
 * Throws if `url` targets a host that is neither allowlisted nor (outside
 * production) a loopback mock/redirect endpoint. Returns the parsed URL.
 */
export function assertEgressAllowed(url: string): URL {
  const parsed = new URL(url)
  if (EGRESS_ALLOWLIST.has(parsed.hostname)) return parsed
  if (
    process.env.NODE_ENV !== 'production' &&
    isLoopbackHost(parsed.hostname)
  ) {
    return parsed
  }
  throw new CtxindexError(
    `network egress host is not allowlisted: ${parsed.hostname}`,
    'egress_denied',
  )
}

/** The only sanctioned `fetch` call site. */
export function egressFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  assertEgressAllowed(url)
  return fetch(url, init)
}
