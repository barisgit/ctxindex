import { getEnv } from '@ctxindex/core/config'
import type { AuthArgs } from '../args/auth'
import {
  exchangeGoogleAuthCode,
  exchangeGoogleRefreshToken,
  type LoopbackTokens,
  openLoopbackFlow,
} from './google-loopback'

type AddArgs = Extract<AuthArgs, { kind: 'add' }>

function fail(message: string): never {
  throw Object.assign(new Error(message), { exitCode: 2 })
}

export function resolveAddCreds(p: AddArgs): { id: string; secret: string } {
  const env = getEnv()
  const id = p.fromEnv ? env.CTXINDEX_GMAIL_CLIENT_ID : p.clientId
  const secret = p.fromEnv ? env.CTXINDEX_GMAIL_CLIENT_SECRET : p.clientSecret
  if (!id || !secret)
    fail(
      'auth add google requires --client-id and --client-secret (or --from-env)',
    )
  return { id, secret }
}

export async function obtainGoogleTokens(
  p: AddArgs,
  id: string,
  secret: string,
  scopes: readonly string[],
): Promise<LoopbackTokens> {
  const env = getEnv()
  if (p.fromEnv) {
    const rt = env.CTXINDEX_GMAIL_REFRESH_TOKEN
    if (!rt)
      fail('auth add google --from-env requires CTXINDEX_GMAIL_REFRESH_TOKEN')
    return exchangeGoogleRefreshToken({
      clientId: id,
      clientSecret: secret,
      refreshToken: rt,
    })
  }
  if (p.authCode)
    return exchangeGoogleAuthCode({
      clientId: id,
      clientSecret: secret,
      code: p.authCode,
      redirectUri: 'urn:ietf:wg:oauth:2.0:oob',
    })
  if (
    p.loopback ||
    (process.stdin.isTTY === true && env.CTXINDEX_NO_BROWSER !== '1')
  )
    return openLoopbackFlow({ clientId: id, clientSecret: secret, scopes })
  const note =
    env.CTXINDEX_NO_BROWSER === '1'
      ? ' (CTXINDEX_NO_BROWSER=1 disables interactive OAuth)'
      : ''
  fail(
    `auth add google requires --auth-code in headless mode or --loopback to run the loopback OAuth flow${note}`,
  )
}
