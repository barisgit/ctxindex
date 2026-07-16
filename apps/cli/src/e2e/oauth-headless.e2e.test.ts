import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { delimiter, join } from 'node:path'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'

interface TokenCall {
  readonly body: string
  readonly params: URLSearchParams
}

interface TokenResponse {
  readonly status?: number
  readonly body: Record<string, unknown>
}

interface TokenServer {
  readonly url: string
  readonly baseUrl: string
  readonly calls: TokenCall[]
  readonly profileCalls: string[]
  close(): Promise<void>
}

interface BrowserCounter {
  readonly counterFile: string
  readonly env: Record<string, string>
}

function successTokenResponse(): TokenResponse {
  return {
    body: {
      access_token: 'access-token-secret',
      refresh_token: 'refresh-token-secret',
      expires_in: 3600,
      token_type: 'Bearer',
    },
  }
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function startTokenServer(
  respond: (call: TokenCall) => TokenResponse,
  opts: { readonly profileEmail?: string } = {},
): Promise<TokenServer> {
  const calls: TokenCall[] = []
  const profileCalls: string[] = []
  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/gmail/v1/users/me/profile') {
        profileCalls.push(req.headers.authorization ?? '')
        res.writeHead(opts.profileEmail ? 200 : 404, {
          'content-type': 'application/json',
        })
        res.end(
          JSON.stringify(
            opts.profileEmail
              ? { emailAddress: opts.profileEmail, messagesTotal: 0 }
              : { error: 'not_found' },
          ),
        )
        return
      }
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'method_not_allowed' }))
        return
      }

      const body = await readRequestBody(req)
      const call = { body, params: new URLSearchParams(body) }
      calls.push(call)
      const response = respond(call)
      res.writeHead(response.status ?? 200, {
        'content-type': 'application/json',
      })
      res.end(JSON.stringify(response.body))
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    }
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address() as AddressInfo
  const baseUrl = `http://127.0.0.1:${address.port}`
  return {
    url: `${baseUrl}/token`,
    baseUrl,
    calls,
    profileCalls,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      }),
  }
}

async function installBrowserCounter(
  sandbox: Sandbox,
): Promise<BrowserCounter> {
  const stubDir = join(sandbox.dir, 'browser-bin')
  const counterFile = join(sandbox.dir, 'browser-open-count')
  await mkdir(stubDir, { recursive: true })
  await writeFile(counterFile, '0')

  const script = [
    '#!/bin/sh',
    `counter_file="\${CTXINDEX_OPEN_COUNTER_FILE:-}"`,
    'if [ -z "$counter_file" ]; then exit 0; fi',
    'if [ -f "$counter_file" ]; then count="$(cat "$counter_file")"; else count=0; fi',
    'count=$((count + 1))',
    'printf "%s" "$count" > "$counter_file"',
    'exit 0',
    '',
  ].join('\n')

  await Promise.all(
    ['open', 'xdg-open', 'start'].map(async (name) => {
      const path = join(stubDir, name)
      await writeFile(path, script)
      await chmod(path, 0o755)
    }),
  )

  return {
    counterFile,
    env: {
      CTXINDEX_OPEN_COUNTER_FILE: counterFile,
      PATH: [stubDir, sandbox.env.PATH].filter(Boolean).join(delimiter),
    },
  }
}

async function readBrowserCounter(counterFile: string): Promise<number> {
  const text = await readFile(counterFile, 'utf8')
  return Number(text.trim() || '0')
}

function tokenEnv(
  sandbox: Sandbox,
  tokenUrl: string,
  browser: BrowserCounter,
  mockBaseUrl?: string,
): Record<string, string> {
  return {
    ...browser.env,
    CTXINDEX_GMAIL_TOKEN_URL: tokenUrl,
    ...(mockBaseUrl ? { CTXINDEX_GMAIL_MOCK_BASE_URL: mockBaseUrl } : {}),
    CTXINDEX_KEYTAR_MOCK_FILE: join(sandbox.dir, 'keytar.json'),
  }
}

async function createOauthSandbox(
  tokenUrl: string,
  mockBaseUrl?: string,
): Promise<{
  readonly sandbox: Sandbox
  readonly browser: BrowserCounter
  readonly env: Record<string, string>
  readonly keytarMockFile: string
}> {
  const sandbox = await createSandbox()
  const browser = await installBrowserCounter(sandbox)
  const env = tokenEnv(sandbox, tokenUrl, browser, mockBaseUrl)
  const keytarMockFile = env.CTXINDEX_KEYTAR_MOCK_FILE
  if (!keytarMockFile) throw new Error('missing keytar mock file')
  return {
    sandbox,
    browser,
    env,
    keytarMockFile,
  }
}

async function runHeadlessAuth(
  sandbox: Sandbox,
  env: Record<string, string>,
  authCode = 'auth-code-z',
) {
  return sandbox.run(
    [
      'auth',
      'add',
      'google',
      '--client-id',
      'client-id',
      '--client-secret',
      'client-secret',
      '--auth-code',
      authCode,
    ],
    { env },
  )
}

function openSandboxDb(sandbox: Sandbox): Database {
  return new Database(join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite'))
}

function rowCount(db: Database, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
    count: number
  }
  return row.count
}

async function readKeytarMock(
  keytarMockFile: string,
): Promise<Record<string, Record<string, string>>> {
  try {
    return JSON.parse(await readFile(keytarMockFile, 'utf8')) as Record<
      string,
      Record<string, string>
    >
  } catch {
    return {}
  }
}

describe('oauth headless e2e', () => {
  test('tokens persisted', async () => {
    const tokenServer = await startTokenServer(() => successTokenResponse())
    const { sandbox, env, keytarMockFile } = await createOauthSandbox(
      tokenServer.url,
    )

    try {
      const result = await runHeadlessAuth(sandbox, env, 'persist-code')

      expect(result.exitCode, result.stderr).toBe(0)
      expect(result.stderr).toBe('')

      const db = openSandboxDb(sandbox)
      try {
        expect(rowCount(db, 'accounts')).toBe(1)
        expect(rowCount(db, 'grants')).toBe(1)
        const grant = db
          .prepare(
            'SELECT access_token_ref, refresh_token_ref, scopes_json FROM grants',
          )
          .get() as {
          access_token_ref: string
          refresh_token_ref: string
          scopes_json: string
        }
        expect(grant.access_token_ref).toMatch(/^keychain:ctxindex\/google\//)
        expect(grant.refresh_token_ref).toMatch(/^keychain:ctxindex\/google\//)
        expect(JSON.parse(grant.scopes_json)).toEqual([
          'https://www.googleapis.com/auth/gmail.compose',
          'https://www.googleapis.com/auth/gmail.readonly',
        ])
      } finally {
        db.close()
      }

      const keytarStore = await readKeytarMock(keytarMockFile)
      const googleSecrets = Object.values(keytarStore['ctxindex/google'] ?? {})
      expect(googleSecrets).toContain('access-token-secret')
      expect(googleSecrets).toContain('refresh-token-secret')
    } finally {
      await sandbox.cleanup()
      await tokenServer.close()
    }
  })

  test('token exchange called once', async () => {
    const tokenServer = await startTokenServer(() => successTokenResponse())
    const { sandbox, env } = await createOauthSandbox(tokenServer.url)

    try {
      const result = await runHeadlessAuth(sandbox, env, 'called-once-code')

      expect(result.exitCode, result.stderr).toBe(0)
      expect(tokenServer.calls).toHaveLength(1)
      expect(tokenServer.calls[0]?.params.get('code')).toBe('called-once-code')
    } finally {
      await sandbox.cleanup()
      await tokenServer.close()
    }
  })

  test('stores Gmail profile email when access token is available', async () => {
    const tokenServer = await startTokenServer(() => successTokenResponse(), {
      profileEmail: 'baristovnik@gmail.com',
    })
    const { sandbox, env } = await createOauthSandbox(
      tokenServer.url,
      tokenServer.baseUrl,
    )

    try {
      const result = await runHeadlessAuth(sandbox, env, 'profile-code')

      expect(result.exitCode, result.stderr).toBe(0)
      expect(tokenServer.profileCalls).toEqual(['Bearer access-token-secret'])

      const db = openSandboxDb(sandbox)
      try {
        const account = db
          .prepare('SELECT label, external_user_id FROM accounts')
          .get() as {
          label: string
          external_user_id: string
        }
        expect(account).toEqual({
          label: 'baristovnik@gmail.com',
          external_user_id: 'baristovnik@gmail.com',
        })
      } finally {
        db.close()
      }

      const list = await sandbox.run(['auth', 'list'], { env })
      expect(list.exitCode, list.stderr).toBe(0)
      expect(list.stdout).toContain('baristovnik@gmail.com')
    } finally {
      await sandbox.cleanup()
      await tokenServer.close()
    }
  })

  test('refresh-token flag persists grant without token exchange', async () => {
    const tokenServer = await startTokenServer(() => successTokenResponse())
    const { sandbox, env, keytarMockFile } = await createOauthSandbox(
      tokenServer.url,
    )

    try {
      const result = await sandbox.run(
        [
          'auth',
          'add',
          'google',
          '--client-id',
          'client-id',
          '--client-secret',
          'client-secret',
          '--refresh-token',
          'refresh-token-direct',
        ],
        { env },
      )

      expect(result.exitCode, result.stderr).toBe(0)
      expect(result.stderr).toBe('')
      expect(tokenServer.calls).toHaveLength(0)

      const db = openSandboxDb(sandbox)
      try {
        expect(rowCount(db, 'accounts')).toBe(1)
        expect(rowCount(db, 'grants')).toBe(1)
      } finally {
        db.close()
      }
      const keytarStore = await readKeytarMock(keytarMockFile)
      const googleSecrets = Object.values(keytarStore['ctxindex/google'] ?? {})
      expect(googleSecrets).toContain('refresh-token-direct')
    } finally {
      await sandbox.cleanup()
      await tokenServer.close()
    }
  })

  test('openBrowser counter zero', async () => {
    const tokenServer = await startTokenServer(() => successTokenResponse())
    const { sandbox, browser, env } = await createOauthSandbox(tokenServer.url)

    try {
      const result = await runHeadlessAuth(sandbox, env, 'no-browser-code')

      expect(result.exitCode, result.stderr).toBe(0)
      expect(await readBrowserCounter(browser.counterFile)).toBe(0)
    } finally {
      await sandbox.cleanup()
      await tokenServer.close()
    }
  })

  test('CTXINDEX_NO_BROWSER refuses fallback', async () => {
    const sandbox = await createSandbox()
    const browser = await installBrowserCounter(sandbox)

    try {
      const result = await sandbox.run(
        [
          'auth',
          'add',
          'google',
          '--client-id',
          'client-id',
          '--client-secret',
          'client-secret',
        ],
        {
          env: {
            ...browser.env,
            CTXINDEX_KEYTAR_MOCK_FILE: join(sandbox.dir, 'keytar.json'),
            CTXINDEX_NO_BROWSER: '1',
          },
        },
      )

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr).toContain('CTXINDEX_NO_BROWSER=1')
      expect(result.stderr).toContain('--auth-code')
      expect(await readBrowserCounter(browser.counterFile)).toBe(0)
    } finally {
      await sandbox.cleanup()
    }
  })

  test('invalid auth-code non-zero', async () => {
    const tokenServer = await startTokenServer(() => ({
      status: 400,
      body: { error: 'invalid_grant' },
    }))
    const { sandbox, browser, env, keytarMockFile } = await createOauthSandbox(
      tokenServer.url,
    )

    try {
      const result = await runHeadlessAuth(sandbox, env, 'bad-code')

      expect(result.exitCode, result.stderr).toBe(10)
      expect(result.stderr).toContain('invalid_grant')
      expect(tokenServer.calls).toHaveLength(1)
      expect(await readBrowserCounter(browser.counterFile)).toBe(0)

      const db = openSandboxDb(sandbox)
      try {
        expect(rowCount(db, 'accounts')).toBe(0)
        expect(rowCount(db, 'grants')).toBe(0)
      } finally {
        db.close()
      }
      expect(await readKeytarMock(keytarMockFile)).toEqual({})
    } finally {
      await sandbox.cleanup()
      await tokenServer.close()
    }
  })
})
