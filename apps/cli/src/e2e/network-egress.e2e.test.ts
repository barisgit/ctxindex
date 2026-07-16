import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'

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
  const realm = await sandbox.run(['realm', 'add', 'work'])
  expect(realm.exitCode, realm.stderr).toBe(0)
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
    'work',
  ])
  expect(result.exitCode, result.stderr).toBe(0)
  expect(result.stderr).toBe('')
  return parseSourceId(result.stdout)
}

test('only allowed hosts', async () => {
  const sandbox = await initializedSandbox()
  const gmail = startGmailMock()
  try {
    const env = gmailEnv(sandbox, gmail)
    await authGoogle(sandbox, env)
    await addGmailSource(sandbox)
    const requestsBeforeSearch = gmail.requests.length
    const search = await sandbox.run(['search', '--remote', 'network egress'], {
      env: {
        ...env,
      },
    })

    expect(search.exitCode, `${search.stderr}\n${search.stdout}`).toBe(0)
    expect(search.stderr).toBe('')
    expect(gmail.requests.length).toBeGreaterThan(requestsBeforeSearch)

    for (const url of gmail.requests) {
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
    await addGmailSource(sandbox)
    const search = await sandbox.run(['search', '--remote', 'network egress'], {
      env: {
        ...env,
        CTXINDEX_GMAIL_MOCK_BASE_URL: 'http://evil.example.com:1',
      },
    })

    expect(`${search.stderr}\n${search.stdout}`).toContain(
      'network egress host is not allowlisted',
    )
    expect(`${search.stderr}\n${search.stdout}`).toContain('evil.example.com')
  } finally {
    gmail.stop()
    await sandbox.cleanup()
  }
})
