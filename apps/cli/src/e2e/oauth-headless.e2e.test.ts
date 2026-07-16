import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { createSandbox } from '@ctxindex/core/testing'

test('provider-neutral from-env auth persists normalized selected scopes with Keychain mock safeguards', async () => {
  const calls: string[] = []
  const server = createServer(async (request, response) => {
    calls.push(request.url ?? '')
    if (request.url === '/oauth/google/token') {
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({ access_token: 'access-canary', expires_in: 60 }),
      )
      return
    }
    if (request.url === '/oauth/google/identity') {
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          sub: 'subject-1',
          email: 'person@example.test',
          email_verified: true,
        }),
      )
      return
    }
    response.writeHead(404)
    response.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const sandbox = await createSandbox()
  try {
    const result = await sandbox.run(
      ['auth', 'add', 'google', '--adapter', 'google.mailbox', '--from-env'],
      {
        env: {
          NODE_ENV: 'test',
          CTXINDEX_OAUTH_MOCK_BASE_URL: base,
          CTXINDEX_GOOGLE_CLIENT_ID: 'public-id',
          CTXINDEX_GOOGLE_CLIENT_SECRET: 'client-secret-canary',
          CTXINDEX_GOOGLE_REFRESH_TOKEN: 'refresh-canary',
          CTXINDEX_KEYTAR_MOCK_FILE: join(sandbox.dir, 'keytar.json'),
        },
      },
    )
    expect(result.exitCode, result.stderr).toBe(0)
    expect(result.stdout).not.toContain('canary')
    expect(calls).toEqual(['/oauth/google/token', '/oauth/google/identity'])
    const db = new Database(
      join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite'),
    )
    const row = db.query('SELECT provider, scopes_json FROM grants').get() as {
      provider: string
      scopes_json: string
    }
    expect(row.provider).toBe('google')
    expect(JSON.parse(row.scopes_json)).toEqual([
      'email',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.readonly',
      'openid',
    ])
    db.close()
  } finally {
    await sandbox.cleanup()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
