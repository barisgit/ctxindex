import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { OAuthProviderSpec } from '@ctxindex/extension-sdk'
import { CtxindexAuthError } from '../errors'

const callbackPath = '/oauth/callback'
const defaultTimeoutMs = 5 * 60 * 1000
function base64Url(value: Uint8Array): string {
  return Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}
function randomToken(): string {
  return base64Url(randomBytes(32))
}
function challenge(verifier: string): string {
  return base64Url(createHash('sha256').update(verifier).digest())
}
function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error)
    server.once('error', onError)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError)
      resolve((server.address() as AddressInfo).port)
    })
  })
}
function close(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve()
  server.closeAllConnections()
  return new Promise((resolve) => server.close(() => resolve()))
}

export async function launchOAuthBrowser(url: string): Promise<void> {
  const argv =
    process.platform === 'darwin'
      ? ['open', url]
      : process.platform === 'win32'
        ? ['rundll32', 'url.dll,FileProtocolHandler', url]
        : ['xdg-open', url]
  const processHandle = Bun.spawn(argv, { stdout: 'ignore', stderr: 'ignore' })
  if ((await processHandle.exited) !== 0)
    throw new Error('browser launcher failed')
}

export interface OAuthLoopbackResult {
  readonly code: string
  readonly codeVerifier: string
  readonly redirectUri: string
  readonly authorizationUrl: string
}
export async function openOAuthLoopback(input: {
  readonly provider: OAuthProviderSpec
  readonly authorizationEndpoint: string
  readonly clientId: string
  readonly scopes: readonly string[]
  readonly timeoutMs?: number
  readonly noBrowser?: boolean
  readonly launchBrowser?: (url: string) => Promise<void> | void
  readonly emitAuthorizationUrl?: (url: string) => void
}): Promise<OAuthLoopbackResult> {
  const state = randomToken()
  const codeVerifier = randomToken()
  const server = createServer()
  const port = await listen(server)
  const redirectUri = `http://127.0.0.1:${port}${callbackPath}`
  const authorization = new URL(input.authorizationEndpoint)
  for (const [name, value] of Object.entries(
    input.provider.fixedAuthorizationParams ?? {},
  ))
    authorization.searchParams.set(name, value)
  authorization.searchParams.set('client_id', input.clientId)
  authorization.searchParams.set('redirect_uri', redirectUri)
  authorization.searchParams.set('response_type', 'code')
  authorization.searchParams.set('scope', input.scopes.join(' '))
  authorization.searchParams.set('state', state)
  authorization.searchParams.set('code_challenge', challenge(codeVerifier))
  authorization.searchParams.set('code_challenge_method', 'S256')
  const authorizationUrl = authorization.toString()
  let timer: ReturnType<typeof setTimeout> | undefined
  let settled = false
  const callback = new Promise<string>((resolve, reject) => {
    const finish = (error: CtxindexAuthError | null, code?: string) => {
      if (settled) return
      settled = true
      if (error) reject(error)
      else resolve(code ?? '')
    }
    timer = setTimeout(
      () =>
        finish(
          new CtxindexAuthError(
            'loopback_timeout',
            'OAuth authorization failed: loopback_timeout (callback timed out)',
          ),
        ),
      input.timeoutMs ?? defaultTimeoutMs,
    )
    server.on('request', (request, response) => {
      const url = new URL(request.url ?? '/', redirectUri)
      if (url.pathname !== callbackPath) {
        response.writeHead(404, { 'content-type': 'text/plain' })
        response.end('not found')
        return
      }
      if (url.searchParams.get('state') !== state) {
        response.writeHead(400, { 'content-type': 'text/plain' })
        response.end('state mismatch')
        finish(
          new CtxindexAuthError(
            'state_mismatch',
            'OAuth authorization failed: state_mismatch',
          ),
        )
        return
      }
      if (url.searchParams.get('error') === 'access_denied') {
        response.writeHead(400, { 'content-type': 'text/plain' })
        response.end('authorization denied')
        finish(
          new CtxindexAuthError(
            'authorization_denied',
            'OAuth authorization failed: authorization_denied',
          ),
        )
        return
      }
      const code = url.searchParams.get('code')
      if (!code) {
        response.writeHead(400, { 'content-type': 'text/plain' })
        response.end('missing code')
        finish(
          new CtxindexAuthError(
            'missing_code',
            'OAuth authorization failed: missing_code',
          ),
        )
        return
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(
        '<!doctype html><title>ctxindex authorization complete</title><p>You can close this window.</p>',
      )
      finish(null, code)
    })
  })
  try {
    if (input.noBrowser) input.emitAuthorizationUrl?.(authorizationUrl)
    else {
      try {
        await (input.launchBrowser ?? launchOAuthBrowser)(authorizationUrl)
      } catch {
        input.emitAuthorizationUrl?.(authorizationUrl)
      }
    }
    const code = await callback
    return { code, codeVerifier, redirectUri, authorizationUrl }
  } finally {
    if (timer) clearTimeout(timer)
    await close(server)
  }
}
