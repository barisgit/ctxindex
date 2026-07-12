import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'

const repoRoot = resolve(
  fileURLToPath(new URL('../../../../', import.meta.url)),
)

const ALLOWED_HOSTS = new Set([
  '127.0.0.1',
  'www.googleapis.com',
  'accounts.google.com',
  'oauth2.googleapis.com',
  'gmail.googleapis.com',
])

type GmailMock = {
  readonly baseUrl: string
  readonly requests: URL[]
  stop(): void
}

const clientId = 'mock-client-id'
const clientSecret = 'mock-client-secret'

function textBody(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function startGmailMock(): GmailMock {
  const requests: URL[] = []
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      requests.push(url)

      if (url.pathname === '/token') {
        const params = new URLSearchParams(await request.text())
        const body = {
          access_token: 'network-egress-access-token',
          expires_in: 3600,
          token_type: 'Bearer',
          ...(params.get('grant_type') === 'authorization_code'
            ? { refresh_token: 'network-egress-refresh-token' }
            : {}),
        }
        return Response.json(body)
      }

      if (url.pathname === '/gmail/v1/users/me/profile') {
        return Response.json({
          emailAddress: 'mock@example.com',
          historyId: '88',
        })
      }

      if (url.pathname === '/gmail/v1/users/me/messages') {
        return Response.json({ messages: [{ id: 'm-1' }] })
      }

      if (url.pathname === '/gmail/v1/users/me/messages/m-1') {
        return Response.json({
          id: 'm-1',
          threadId: 't-1',
          historyId: '77',
          internalDate: String(Date.now()),
          labelIds: ['INBOX'],
          payload: {
            headers: [{ name: 'Subject', value: 'network egress fixture' }],
            body: { data: textBody('network egress body') },
          },
        })
      }

      return Response.json({ error: 'not_found' }, { status: 404 })
    },
  })

  return {
    baseUrl: new URL('/', server.url).toString(),
    requests,
    stop() {
      server.stop(true)
    },
  }
}

function gmailEnv(
  sandbox: Sandbox,
  gmail: GmailMock,
  extra: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: 'test',
    CTXINDEX_GMAIL_MOCK_BASE_URL: gmail.baseUrl,
    CTXINDEX_GMAIL_TOKEN_URL: new URL('/token', gmail.baseUrl).toString(),
    CTXINDEX_GMAIL_CLIENT_ID: clientId,
    CTXINDEX_GMAIL_CLIENT_SECRET: clientSecret,
    CTXINDEX_KEYTAR_MOCK_FILE: join(sandbox.dir, 'keytar.json'),
    ...extra,
  }
}

async function authGoogle(
  sandbox: Sandbox,
  env: Record<string, string | undefined>,
): Promise<void> {
  const auth = await sandbox.run(
    [
      'auth',
      'add',
      'google',
      '--client-id',
      clientId,
      '--client-secret',
      clientSecret,
      '--auth-code',
      'network-egress-code',
    ],
    { env },
  )
  expect(auth.exitCode, auth.stderr).toBe(0)
}

async function initializedSandbox(): Promise<Sandbox> {
  const sandbox = await createSandbox()
  const init = await sandbox.run(['init'])
  expect(init.exitCode, init.stderr).toBe(0)
  expect(init.stderr).toBe('')
  return sandbox
}

function parseSourceId(stdout: string): string {
  const match = stdout.match(/source added: (\S+)/)
  expect(match).not.toBeNull()
  const sourceId = match?.[1]
  expect(sourceId).toBeDefined()
  return sourceId as string
}

async function addGmailSource(sandbox: Sandbox): Promise<string> {
  const result = await sandbox.run([
    'source',
    'add',
    '--adapter',
    'google.mailbox',
    '--realm',
    'global',
  ])
  expect(result.exitCode, result.stderr).toBe(0)
  expect(result.stderr).toBe('')
  return parseSourceId(result.stdout)
}

function parseFetchLog(text: string): URL[] {
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const match = /^(\S+)\s+(\S+)$/.exec(line)
      expect(match).not.toBeNull()
      return new URL(match?.[2] ?? '')
    })
}

async function runRg(
  pattern: string,
  path: string,
): Promise<{
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}> {
  const proc = Bun.spawn(['rg', pattern, path], {
    cwd: repoRoot,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { exitCode, stdout, stderr }
}

test('only allowed hosts', async () => {
  const sandbox = await initializedSandbox()
  const gmail = startGmailMock()
  const fetchLog = join(sandbox.dir, 'fetch.log')

  try {
    const env = gmailEnv(sandbox, gmail)
    await authGoogle(sandbox, env)
    const sourceId = await addGmailSource(sandbox)
    const requestsBeforeSync = gmail.requests.length
    const sync = await sandbox.run(['sync', '--source', sourceId], {
      env: {
        ...env,
        CTXINDEX_TEST_FETCH_LOG: fetchLog,
      },
    })

    expect(sync.exitCode, sync.stderr).toBe(0)
    expect(sync.stderr).toBe('')
    expect(gmail.requests.length).toBeGreaterThan(requestsBeforeSync)

    const entries = parseFetchLog(await readFile(fetchLog, 'utf8'))
    expect(entries.length).toBeGreaterThan(0)
    for (const url of entries) {
      expect(ALLOWED_HOSTS.has(url.hostname), url.toString()).toBe(true)
    }
  } finally {
    gmail.stop()
    await sandbox.cleanup()
  }
})

test('disallowed host rejected', async () => {
  const sandbox = await initializedSandbox()
  const gmail = startGmailMock()

  try {
    const env = gmailEnv(sandbox, gmail)
    await authGoogle(sandbox, env)
    const sourceId = await addGmailSource(sandbox)
    const sync = await sandbox.run(['sync', '--source', sourceId], {
      env: {
        ...env,
        CTXINDEX_GMAIL_MOCK_BASE_URL: 'http://evil.example.com:1',
        CTXINDEX_TEST_FETCH_LOG: join(sandbox.dir, 'fetch.log'),
      },
    })

    expect(sync.exitCode).not.toBe(0)
    expect(sync.stderr).toContain('network egress host is not allowlisted')
    expect(sync.stderr).toContain('evil.example.com')
  } finally {
    gmail.stop()
    await sandbox.cleanup()
  }
})

test('fetch log hook gated', async () => {
  const rg = await runRg(
    'CTXINDEX_TEST_FETCH_LOG|NODE_ENV.*production|production.*NODE_ENV',
    'packages/adapters/src/google-mailbox/api.ts',
  )
  expect(rg.exitCode, rg.stderr).toBe(0)
  expect(rg.stdout).toContain('CTXINDEX_TEST_FETCH_LOG')

  const source = await Bun.file(
    join(repoRoot, 'packages/adapters/src/google-mailbox/api.ts'),
  ).text()
  expect(source).toMatch(
    /CTXINDEX_TEST_FETCH_LOG[\s\S]{0,240}NODE_ENV !== 'production'/,
  )
})
