import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { OAuthProviderDefinition } from '@ctxindex/extension-sdk'
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
export interface OAuthAuthorizationResponsePrompt {
  readonly authorizationUrl: string
  readonly redirectUri: string
  readonly signal: AbortSignal
}

function callbackResult(
  value: string,
  redirectUri: string,
  state: string,
): string {
  const pasted = value.trim()
  if (pasted.length === 0 || pasted.length > 16_384)
    throw new CtxindexAuthError(
      'missing_code',
      'OAuth authorization failed: missing_code',
    )

  if (!/^https?:\/\//i.test(pasted)) {
    if (/\s/.test(pasted))
      throw new CtxindexAuthError(
        'missing_code',
        'OAuth authorization failed: missing_code',
      )
    return pasted
  }

  let callback: URL
  try {
    callback = new URL(pasted)
  } catch {
    throw new CtxindexAuthError(
      'oauth_failed',
      'OAuth authorization failed: invalid_callback',
    )
  }

  const expected = new URL(redirectUri)
  if (
    callback.origin !== expected.origin ||
    callback.pathname !== callbackPath ||
    callback.username !== '' ||
    callback.password !== '' ||
    callback.hash !== ''
  )
    throw new CtxindexAuthError(
      'oauth_failed',
      'OAuth authorization failed: invalid_callback',
    )
  if (
    callback.searchParams.getAll('state').length !== 1 ||
    callback.searchParams.get('state') !== state
  )
    throw new CtxindexAuthError(
      'state_mismatch',
      'OAuth authorization failed: state_mismatch',
    )
  const providerError = callback.searchParams.get('error')
  if (providerError === 'access_denied')
    throw new CtxindexAuthError(
      'authorization_denied',
      'OAuth authorization failed: authorization_denied',
    )
  if (providerError) {
    const safeError = /^[A-Za-z0-9._-]{1,64}$/.test(providerError)
      ? providerError
      : 'unknown_error'
    const providerCode = callback.searchParams
      .get('error_description')
      ?.match(/\b[A-Z]{2,12}\d{3,10}\b/)?.[0]
    const diagnostic = providerCode
      ? `${safeError} (${providerCode})`
      : safeError
    throw new CtxindexAuthError(
      'oauth_failed',
      `OAuth authorization failed: ${diagnostic}`,
    )
  }
  const codes = callback.searchParams.getAll('code')
  if (codes.length !== 1 || !codes[0])
    throw new CtxindexAuthError(
      'missing_code',
      'OAuth authorization failed: missing_code',
    )
  return codes[0]
}

export async function openOAuthLoopback(input: {
  readonly provider: OAuthProviderDefinition
  readonly authorizationEndpoint: string
  readonly clientId: string
  readonly scopes: readonly string[]
  readonly timeoutMs?: number
  readonly noBrowser?: boolean
  readonly launchBrowser?: (url: string) => Promise<void> | void
  readonly emitAuthorizationUrl?: (url: string) => void
  readonly readAuthorizationResponse?: (
    prompt: OAuthAuthorizationResponsePrompt,
  ) => Promise<string | undefined>
  readonly signal?: AbortSignal
}): Promise<OAuthLoopbackResult> {
  const state = randomToken()
  const codeVerifier = randomToken()
  const server = createServer()
  const port = await listen(server)
  // Entra ignores ephemeral ports only for the literal localhost host. Keep
  // the listener pinned to IPv4 loopback while advertising the portable
  // native-app redirect URI required by providers using that matching rule.
  const redirectUri = `http://localhost:${port}${callbackPath}`
  const authorization = new URL(input.authorizationEndpoint)
  for (const [name, value] of Object.entries(
    input.provider.auth.fixedAuthorizationParams ?? {},
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
  const manualInput = new AbortController()
  let finishCallback: (error: CtxindexAuthError | null, code?: string) => void =
    () => {}
  const abort = () =>
    finishCallback(
      new CtxindexAuthError('oauth_failed', 'OAuth authorization cancelled'),
    )
  const callback = new Promise<string>((resolve, reject) => {
    finishCallback = (error: CtxindexAuthError | null, code?: string) => {
      if (settled) return
      settled = true
      manualInput.abort()
      if (error) reject(error)
      else resolve(code ?? '')
    }
    timer = setTimeout(
      () =>
        finishCallback(
          new CtxindexAuthError(
            'loopback_timeout',
            'OAuth authorization failed: loopback_timeout (callback timed out)',
          ),
        ),
      input.timeoutMs ?? defaultTimeoutMs,
    )
    if (input.signal?.aborted) abort()
    else input.signal?.addEventListener('abort', abort, { once: true })
    server.on('request', (request, response) => {
      const url = new URL(request.url ?? '/', redirectUri)
      if (url.pathname !== callbackPath) {
        response.writeHead(404, { 'content-type': 'text/plain' })
        response.end('not found')
        return
      }
      try {
        const code = callbackResult(url.toString(), redirectUri, state)
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        response.end(
          '<!doctype html><title>ctxindex authorization complete</title><p>You can close this window.</p>',
        )
        finishCallback(null, code)
      } catch (error) {
        response.writeHead(400, { 'content-type': 'text/plain' })
        response.end('authorization failed')
        finishCallback(
          error instanceof CtxindexAuthError
            ? error
            : new CtxindexAuthError(
                'oauth_failed',
                'OAuth authorization failed: invalid_callback',
              ),
        )
      }
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
    if (input.readAuthorizationResponse) {
      void input
        .readAuthorizationResponse({
          authorizationUrl,
          redirectUri,
          signal: manualInput.signal,
        })
        .then((value) => {
          if (value === undefined || settled) return
          try {
            finishCallback(null, callbackResult(value, redirectUri, state))
          } catch (error) {
            finishCallback(
              error instanceof CtxindexAuthError
                ? error
                : new CtxindexAuthError(
                    'oauth_failed',
                    'OAuth authorization failed: invalid_callback',
                  ),
            )
          }
        })
        .catch((error) => {
          if (!manualInput.signal.aborted)
            finishCallback(
              error instanceof CtxindexAuthError
                ? error
                : new CtxindexAuthError(
                    'oauth_failed',
                    'OAuth authorization failed: manual_input',
                  ),
            )
        })
    }
    const code = await callback
    return { code, codeVerifier, redirectUri, authorizationUrl }
  } finally {
    input.signal?.removeEventListener('abort', abort)
    if (timer) clearTimeout(timer)
    await close(server)
  }
}
