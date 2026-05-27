import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultConfig, writeConfig } from '@ctxindex/core/config'
import { FileBackend } from '@ctxindex/core/secrets'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'

const repoRoot = resolve(
  fileURLToPath(new URL('../../../../', import.meta.url)),
)
const cliBin = join(repoRoot, 'apps/cli/bin/ctxindex.mjs')
const clientId = 'test-client-id'
const clientSecret = 'test-client-secret'
const accessToken = 'loopback-access-secret'
const refreshToken = 'loopback-refresh-secret'

type OAuthProvider = {
  readonly authUrl: string
  readonly tokenUrl: string
  readonly authRequests: URL[]
  readonly tokenBodies: string[]
  stop(): void
}

type RunningCli = {
  readonly proc: Bun.Subprocess<'ignore', 'pipe', 'pipe'>
  waitForAuthUrl(timeoutMs?: number): Promise<string>
  result(timeoutMs?: number): Promise<{
    exitCode: number
    stdout: string
    stderr: string
    durationMs: number
  }>
}

function configFile(sandbox: Sandbox): string {
  return join(sandbox.env.CTXINDEX_CONFIG_HOME, 'config.toml')
}

function dbPath(sandbox: Sandbox): string {
  return join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite')
}

async function initSandbox(): Promise<Sandbox> {
  const sandbox = await createSandbox()
  const init = await sandbox.run(['init'])
  expect(init.exitCode).toBe(0)
  expect(init.stderr).toBe('')
  await writeConfig(
    { ...defaultConfig(), secrets: { backend: 'file' } },
    configFile(sandbox),
  )
  return sandbox
}

function readStream(
  stream: ReadableStream<Uint8Array>,
  onText: (text: string) => void,
): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let output = ''

  return (async () => {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      output += chunk
      onText(output)
    }
    output += decoder.decode()
    onText(output)
    return output
  })()
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      onTimeout?.()
      reject(new Error(message))
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout)
  })
}

function spawnLoopbackAuth(
  sandbox: Sandbox,
  env: Record<string, string | undefined>,
): RunningCli {
  const startedAt = performance.now()
  let authUrl: string | undefined
  let resolveAuthUrl: (url: string) => void
  const authUrlPromise = new Promise<string>((resolve) => {
    resolveAuthUrl = resolve
  })

  const proc = Bun.spawn(
    [
      process.execPath,
      cliBin,
      'auth',
      'add',
      'google',
      '--client-id',
      clientId,
      '--client-secret',
      clientSecret,
      '--loopback',
    ],
    {
      cwd: repoRoot,
      env: {
        ...sandbox.env,
        CTXINDEX_NO_BROWSER: '1',
        ...env,
      },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )

  const stdout = readStream(proc.stdout, (text) => {
    const match = /Open this URL: (https?:\/\/\S+)/.exec(text)
    if (!authUrl && match?.[1]) {
      authUrl = match[1]
      resolveAuthUrl(match[1])
    }
  })
  const stderr = new Response(proc.stderr).text()

  return {
    proc,
    waitForAuthUrl(timeoutMs = 3000) {
      return withTimeout(
        authUrlPromise,
        timeoutMs,
        'timed out waiting for loopback auth URL',
        () => proc.kill('SIGKILL'),
      )
    },
    async result(timeoutMs = 5000) {
      const exitCode = await withTimeout(
        proc.exited,
        timeoutMs,
        'timed out waiting for auth command to exit',
        () => proc.kill('SIGKILL'),
      )
      const [stdoutText, stderrText] = await Promise.all([stdout, stderr])
      return {
        exitCode,
        stdout: stdoutText,
        stderr: stderrText,
        durationMs: performance.now() - startedAt,
      }
    },
  }
}

function startOAuthProvider(
  options: {
    readonly redirectState?: string
    readonly tokenStatus?: number
  } = {},
): OAuthProvider {
  const authRequests: URL[] = []
  const tokenBodies: string[] = []
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === '/auth') {
        authRequests.push(url)
        const redirectUri = url.searchParams.get('redirect_uri')
        expect(redirectUri).toBeTruthy()
        const redirect = new URL(redirectUri ?? 'http://127.0.0.1/callback')
        redirect.searchParams.set('code', 'loopback-code')
        redirect.searchParams.set(
          'state',
          options.redirectState ?? url.searchParams.get('state') ?? '',
        )
        return new Response(null, {
          status: 302,
          headers: { location: redirect.toString() },
        })
      }

      if (url.pathname === '/token') {
        tokenBodies.push(await request.text())
        if (options.tokenStatus) {
          return Response.json(
            { error: 'bad_request' },
            {
              status: options.tokenStatus,
            },
          )
        }
        return Response.json({
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 3600,
          token_type: 'Bearer',
        })
      }

      return new Response('not found', { status: 404 })
    },
  })

  return {
    authUrl: new URL('/auth', server.url).toString(),
    tokenUrl: new URL('/token', server.url).toString(),
    authRequests,
    tokenBodies,
    stop() {
      server.stop(true)
    },
  }
}

async function visitAuthUrl(authUrl: string): Promise<void> {
  await fetch(authUrl, { redirect: 'follow' })
}

function grantCount(sandbox: Sandbox): number {
  const db = new Database(dbPath(sandbox), { readonly: true })
  try {
    const row = db.prepare('SELECT COUNT(*) AS count FROM grants').get() as {
      count: number
    }
    return row.count
  } finally {
    db.close()
  }
}

async function persistedSecrets(sandbox: Sandbox): Promise<{
  access: string
  refresh: string
  expiresAt: number
}> {
  const db = new Database(dbPath(sandbox), { readonly: true })
  try {
    const grant = db
      .prepare(
        'SELECT access_token_ref, refresh_token_ref, expires_at FROM grants LIMIT 1',
      )
      .get() as {
      access_token_ref: string
      refresh_token_ref: string
      expires_at: number
    }
    expect(grant).toBeTruthy()
    const store = new FileBackend({
      dataDirectory: sandbox.env.CTXINDEX_DATA_HOME,
      configDirectory: sandbox.env.CTXINDEX_CONFIG_HOME,
    })
    return {
      access: await store.getSecret(grant.access_token_ref),
      refresh: await store.getSecret(grant.refresh_token_ref),
      expiresAt: grant.expires_at,
    }
  } finally {
    db.close()
  }
}

function expectPkceAndState(authUrl: string): URLSearchParams {
  const parsed = new URL(authUrl)
  const params = parsed.searchParams
  expect(params.get('client_id')).toBe(clientId)
  expect(params.get('response_type')).toBe('code')
  expect(params.get('code_challenge')).toBeTruthy()
  expect(params.get('code_challenge_method')).toBe('S256')
  expect(params.get('state')).toBeTruthy()
  expect(params.get('redirect_uri')).toMatch(
    /^http:\/\/127\.0\.0\.1:\d+\/callback$/,
  )
  return params
}

test('full flow persists tokens', async () => {
  const sandbox = await initSandbox()
  const provider = startOAuthProvider()

  try {
    const running = spawnLoopbackAuth(sandbox, {
      CTXINDEX_GMAIL_AUTH_URL: provider.authUrl,
      CTXINDEX_GMAIL_TOKEN_URL: provider.tokenUrl,
    })

    await visitAuthUrl(await running.waitForAuthUrl())
    const result = await running.result()

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain('auth grant added:')
    expect(result.stdout).not.toContain(accessToken)
    expect(result.stdout).not.toContain(refreshToken)
    expect(result.stderr).not.toContain(accessToken)
    expect(result.stderr).not.toContain(refreshToken)

    const secrets = await persistedSecrets(sandbox)
    expect(secrets.access).toBe(accessToken)
    expect(secrets.refresh).toBe(refreshToken)
    expect(secrets.expiresAt).toBeGreaterThan(Date.now())
    expect(provider.tokenBodies).toHaveLength(1)
    const tokenBody = provider.tokenBodies[0]
    expect(tokenBody).toContain('code=loopback-code')
    expect(tokenBody).toContain('code_verifier=')
  } finally {
    provider.stop()
    await sandbox.cleanup()
  }
})

test('auth URL contains PKCE and state', async () => {
  const sandbox = await initSandbox()
  const provider = startOAuthProvider()

  try {
    const running = spawnLoopbackAuth(sandbox, {
      CTXINDEX_GMAIL_AUTH_URL: provider.authUrl,
      CTXINDEX_GMAIL_TOKEN_URL: provider.tokenUrl,
    })
    const authUrl = await running.waitForAuthUrl()
    const params = expectPkceAndState(authUrl)

    await visitAuthUrl(authUrl)
    const result = await running.result()
    expect(result.exitCode).toBe(0)
    expect(provider.authRequests).toHaveLength(1)
    const authRequest = provider.authRequests[0]
    expect(authRequest).toBeDefined()
    expect(authRequest?.searchParams.get('state')).toBe(params.get('state'))
  } finally {
    provider.stop()
    await sandbox.cleanup()
  }
})

test('timeout exits 50', async () => {
  const sandbox = await initSandbox()
  const provider = startOAuthProvider()

  try {
    const running = spawnLoopbackAuth(sandbox, {
      CTXINDEX_GMAIL_AUTH_URL: provider.authUrl,
      CTXINDEX_GMAIL_TOKEN_URL: provider.tokenUrl,
      CTXINDEX_LOOPBACK_TIMEOUT_SECS: '0.5',
    })
    const result = await running.result()

    expect(result.exitCode).toBe(50)
    expect(result.stderr).toContain('loopback_timeout')
    expect(result.durationMs).toBeLessThan(5000)
    expect(grantCount(sandbox)).toBe(0)
  } finally {
    provider.stop()
    await sandbox.cleanup()
  }
})

test('state mismatch rejected', async () => {
  const sandbox = await initSandbox()
  const provider = startOAuthProvider({ redirectState: 'WRONG' })

  try {
    const running = spawnLoopbackAuth(sandbox, {
      CTXINDEX_GMAIL_AUTH_URL: provider.authUrl,
      CTXINDEX_GMAIL_TOKEN_URL: provider.tokenUrl,
    })

    await visitAuthUrl(await running.waitForAuthUrl())
    const result = await running.result()

    expect(result.exitCode).toBe(50)
    expect(result.stderr).toContain('state_mismatch')
    expect(provider.tokenBodies).toHaveLength(0)
    expect(grantCount(sandbox)).toBe(0)
  } finally {
    provider.stop()
    await sandbox.cleanup()
  }
})

test('token exchange 400 fails', async () => {
  const sandbox = await initSandbox()
  const provider = startOAuthProvider({ tokenStatus: 400 })

  try {
    const running = spawnLoopbackAuth(sandbox, {
      CTXINDEX_GMAIL_AUTH_URL: provider.authUrl,
      CTXINDEX_GMAIL_TOKEN_URL: provider.tokenUrl,
    })

    await visitAuthUrl(await running.waitForAuthUrl())
    const result = await running.result()

    expect(result.exitCode).toBe(10)
    expect(result.stderr).toContain('token_exchange_failed')
    expect(provider.tokenBodies).toHaveLength(1)
    expect(grantCount(sandbox)).toBe(0)
  } finally {
    provider.stop()
    await sandbox.cleanup()
  }
})

test('PKCE present in auth URL', async () => {
  const sandbox = await initSandbox()
  const provider = startOAuthProvider()

  try {
    const running = spawnLoopbackAuth(sandbox, {
      CTXINDEX_GMAIL_AUTH_URL: provider.authUrl,
      CTXINDEX_GMAIL_TOKEN_URL: provider.tokenUrl,
    })
    const authUrl = await running.waitForAuthUrl()
    expectPkceAndState(authUrl)

    const source = await Bun.file(
      join(repoRoot, 'apps/cli/src/auth/google-loopback.ts'),
    ).text()
    expect(source).toContain('code_challenge_method')
    expect(source).toContain('S256')
    expect(source).toContain('state')

    await visitAuthUrl(authUrl)
    const result = await running.result()
    expect(result.exitCode).toBe(0)
  } finally {
    provider.stop()
    await sandbox.cleanup()
  }
})
