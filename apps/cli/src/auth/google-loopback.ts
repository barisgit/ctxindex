import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
// SPEC §10d: the OAuth code/refresh exchange is delegated to @ctxindex/core/auth;
// the CLI only owns the 127.0.0.1 listener and the browser launch below.
import {
  CtxindexAuthError as CoreAuthError,
  type GoogleTokenResponse,
  postOAuthTokenRequest,
} from '@ctxindex/core/auth'
import { getEnv } from '@ctxindex/core/config'

const defaultAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
const defaultTimeoutMs = 5 * 60 * 1000

export type CtxindexAuthErrorCode =
  | 'browser_open_failed'
  | 'invalid_grant'
  | 'loopback_timeout'
  | 'missing_code'
  | 'state_mismatch'
  | 'token_exchange_failed'
  | 'unsupported_platform'

export class CtxindexAuthError extends Error {
  readonly code: CtxindexAuthErrorCode
  readonly exitCode: number

  constructor(
    code: CtxindexAuthErrorCode,
    message: string,
    exitCode: number,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'CtxindexAuthError'
    this.code = code
    this.exitCode = exitCode
  }
}

export interface LoopbackTokens {
  readonly refresh_token: string
  readonly access_token?: string
  readonly expires_at: number
}

export interface LoopbackOptions {
  readonly clientId: string
  readonly clientSecret: string
  readonly scopes: readonly string[]
  readonly openBrowser?: (url: string) => Promise<void> | void
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}

export interface TokenExchangeOptions {
  readonly clientId: string
  readonly clientSecret: string
  readonly code: string
  readonly redirectUri: string
  readonly codeVerifier?: string
}

export interface RefreshTokenExchangeOptions {
  readonly clientId: string
  readonly clientSecret: string
  readonly refreshToken: string
}

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function randomToken(): string {
  return base64Url(randomBytes(32))
}

function codeChallenge(verifier: string): string {
  return base64Url(createHash('sha256').update(verifier).digest())
}

function timeoutMsFromEnv(): number {
  const raw = getEnv().CTXINDEX_LOOPBACK_TIMEOUT_SECS
  if (!raw) return defaultTimeoutMs
  const seconds = Number(raw)
  if (!Number.isFinite(seconds) || seconds < 0) return defaultTimeoutMs
  return seconds * 1000
}

function authUrl(): string {
  return getEnv().CTXINDEX_GMAIL_AUTH_URL ?? defaultAuthUrl
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve()
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => reject(err)
    server.once('error', onError)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError)
      const address = server.address() as AddressInfo
      resolve(address.port)
    })
  })
}

export async function defaultOpenBrowser(url: string): Promise<void> {
  if (getEnv().CTXINDEX_NO_BROWSER === '1') {
    console.log(`Open this URL: ${url}`)
    return
  }

  if (process.platform === 'win32') {
    throw new CtxindexAuthError(
      'unsupported_platform',
      'loopback OAuth browser opening is not supported on Windows in v1; pass --auth-code instead',
      2,
    )
  }

  const command = process.platform === 'darwin' ? 'open' : 'xdg-open'
  const proc = Bun.spawn([command, url], {
    stdout: 'ignore',
    stderr: 'pipe',
  })
  const [exitCode, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stderr).text(),
  ])

  if (exitCode !== 0) {
    throw new CtxindexAuthError(
      'browser_open_failed',
      `failed to open browser with ${command}${stderr.trim() ? `: ${stderr.trim()}` : ''}`,
      50,
    )
  }
}

export async function exchangeGoogleAuthCode({
  clientId,
  clientSecret,
  code,
  redirectUri,
  codeVerifier,
}: TokenExchangeOptions): Promise<LoopbackTokens> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  })
  if (codeVerifier) body.set('code_verifier', codeVerifier)

  let token: GoogleTokenResponse
  try {
    token = await postOAuthTokenRequest(body)
  } catch (err) {
    throw mapCoreAuthError(err)
  }

  if (!token.refresh_token) {
    throw new CtxindexAuthError(
      'invalid_grant',
      'google auth failed: invalid_grant',
      10,
    )
  }

  return {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: Date.now() + token.expires_in * 1000,
  }
}

/** Maps a core auth/egress error to the CLI loopback error taxonomy. */
function mapCoreAuthError(err: unknown): CtxindexAuthError {
  if (
    err instanceof CoreAuthError &&
    (err.code === 'invalid_grant' || err.code === 'invalid_client')
  ) {
    return new CtxindexAuthError(
      'invalid_grant',
      'google auth failed: invalid_grant',
      10,
      { cause: err },
    )
  }
  return new CtxindexAuthError(
    'token_exchange_failed',
    'google auth failed: token_exchange_failed',
    10,
    { cause: err },
  )
}

export async function exchangeGoogleRefreshToken({
  clientId,
  clientSecret,
  refreshToken,
}: RefreshTokenExchangeOptions): Promise<LoopbackTokens> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })

  let token: GoogleTokenResponse
  try {
    token = await postOAuthTokenRequest(body)
  } catch (err) {
    throw mapCoreAuthError(err)
  }

  return {
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? refreshToken,
    expires_at: Date.now() + token.expires_in * 1000,
  }
}

export async function openLoopbackFlow({
  clientId,
  clientSecret,
  scopes,
  openBrowser = defaultOpenBrowser,
  signal,
  timeoutMs = timeoutMsFromEnv(),
}: LoopbackOptions): Promise<LoopbackTokens> {
  const verifier = randomToken()
  const state = randomToken()
  const server = createServer()
  const port = await listen(server)
  const redirectUri = `http://127.0.0.1:${port}/callback`

  let settled = false
  let timeout: ReturnType<typeof setTimeout> | undefined
  let abortHandler: (() => void) | undefined

  const code = new Promise<string>((resolve, reject) => {
    const fail = (err: CtxindexAuthError) => {
      if (settled) return
      settled = true
      reject(err)
    }
    const succeed = (value: string) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    timeout = setTimeout(() => {
      fail(
        new CtxindexAuthError(
          'loopback_timeout',
          'google auth failed: loopback_timeout',
          50,
        ),
      )
    }, timeoutMs)

    abortHandler = () => {
      fail(
        new CtxindexAuthError(
          'loopback_timeout',
          'google auth failed: loopback_timeout',
          50,
        ),
      )
    }
    if (signal?.aborted) abortHandler()
    else signal?.addEventListener('abort', abortHandler, { once: true })

    server.on('request', (request, response) => {
      const url = new URL(request.url ?? '/', redirectUri)
      if (url.pathname !== '/callback') {
        response.writeHead(404, { 'content-type': 'text/plain' })
        response.end('not found')
        return
      }

      const callbackState = url.searchParams.get('state')
      if (callbackState !== state) {
        response.writeHead(400, { 'content-type': 'text/plain' })
        response.end('state mismatch')
        fail(
          new CtxindexAuthError(
            'state_mismatch',
            'google auth failed: state_mismatch',
            50,
          ),
        )
        return
      }

      const callbackCode = url.searchParams.get('code')
      if (!callbackCode) {
        response.writeHead(400, { 'content-type': 'text/plain' })
        response.end('missing code')
        fail(
          new CtxindexAuthError(
            'missing_code',
            'google auth failed: missing_code',
            50,
          ),
        )
        return
      }

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(
        '<!doctype html><title>ctxindex auth complete</title><p>You can close this window.</p>',
      )
      succeed(callbackCode)
    })
  })

  const url = new URL(authUrl())
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', scopes.join(' '))
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge(verifier))
  url.searchParams.set('code_challenge_method', 'S256')

  try {
    await openBrowser(url.toString())
    return await exchangeGoogleAuthCode({
      clientId,
      clientSecret,
      code: await code,
      redirectUri,
      codeVerifier: verifier,
    })
  } finally {
    if (timeout) clearTimeout(timeout)
    if (abortHandler) signal?.removeEventListener('abort', abortHandler)
    await closeServer(server)
  }
}

export async function runLoopbackFlow(opts: LoopbackOptions): Promise<{
  accessToken?: string
  refreshToken: string
  expiresAt: number
}> {
  const token = await openLoopbackFlow(opts)
  return {
    ...(token.access_token ? { accessToken: token.access_token } : {}),
    refreshToken: token.refresh_token,
    expiresAt: token.expires_at,
  }
}
