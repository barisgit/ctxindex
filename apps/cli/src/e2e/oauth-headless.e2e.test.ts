import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { createSandbox } from '@ctxindex/core/testing'

test('provider-neutral auth deduplicates Accounts and exposes a safe multi-Grant workflow', async () => {
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
    const authEnv = {
      NODE_ENV: 'test',
      CTXINDEX_OAUTH_MOCK_BASE_URL: base,
      CTXINDEX_GOOGLE_CLIENT_ID: 'public-id',
      CTXINDEX_GOOGLE_CLIENT_SECRET: 'client-secret-canary',
      CTXINDEX_GOOGLE_REFRESH_TOKEN: 'refresh-canary',
      CTXINDEX_KEYTAR_MOCK_FILE: join(sandbox.dir, 'keytar.json'),
    }
    const result = await sandbox.run(
      ['auth', 'add', 'google', '--adapter', 'google.mailbox', '--from-env'],
      { env: authEnv },
    )
    expect(result.exitCode, result.stderr).toBe(0)
    expect(result.stdout).not.toContain('canary')
    expect(result.stdout).toContain('provider: google')
    expect(result.stdout).toContain(
      'scopes: email, https://www.googleapis.com/auth/gmail.compose, https://www.googleapis.com/auth/gmail.readonly, openid',
    )
    const second = await sandbox.run(
      ['auth', 'add', 'google', '--adapter', 'google.mailbox', '--from-env'],
      { env: authEnv },
    )
    expect(second.exitCode, second.stderr).toBe(0)
    expect(second.stdout).not.toContain('canary')
    expect(second.stdout).toContain('provider: google')
    expect(calls).toEqual([
      '/oauth/google/token',
      '/oauth/google/identity',
      '/oauth/google/token',
      '/oauth/google/identity',
    ])
    const db = new Database(
      join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite'),
    )
    const rows = db
      .query('SELECT id, provider, scopes_json FROM grants ORDER BY id')
      .all() as {
      id: string
      provider: string
      scopes_json: string
    }[]
    const accounts = db.query('SELECT id FROM accounts ORDER BY id').all() as {
      id: string
    }[]
    expect(accounts).toHaveLength(1)
    expect(rows).toHaveLength(2)
    expect(rows[0]?.provider).toBe('google')
    expect(JSON.parse(rows[0]?.scopes_json ?? 'null')).toEqual([
      'email',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.readonly',
      'openid',
    ])
    db.close()

    const realm = await sandbox.run(['realm', 'add', 'work'])
    expect(realm.exitCode, realm.stderr).toBe(0)
    const ambiguous = await sandbox.run([
      'source',
      'add',
      'google.mailbox',
      '--realm',
      'work',
      '--account',
      accounts[0]?.id ?? '',
    ])
    expect(ambiguous.exitCode).toBe(2)
    expect(ambiguous.stderr).toContain('multiple compatible Grants')

    const sharedGrantId = rows[0]?.id ?? ''
    for (const name of ['Primary Inbox', 'Archive Inbox']) {
      const source = await sandbox.run([
        'source',
        'add',
        'google.mailbox',
        '--realm',
        'work',
        '--account',
        sharedGrantId,
        '--name',
        name,
      ])
      expect(source.exitCode, source.stderr).toBe(0)
    }

    const listed = await sandbox.run(['account', 'list', '--json'])
    expect(listed.exitCode, listed.stderr).toBe(0)
    expect(listed.stdout).not.toContain('canary')
    expect(listed.stdout).not.toContain('subject-1')
    const inventory = JSON.parse(listed.stdout) as {
      id: string
      provider: string
      grants: { id: string; sources: { displayName: string }[] }[]
    }[]
    expect(inventory).toHaveLength(1)
    expect(inventory[0]?.provider).toBe('google')
    expect(inventory[0]?.grants).toHaveLength(2)
    expect(
      inventory[0]?.grants.find(({ id }) => id === sharedGrantId)?.sources,
    ).toEqual([
      expect.objectContaining({ displayName: 'Primary Inbox' }),
      expect.objectContaining({ displayName: 'Archive Inbox' }),
    ])
  } finally {
    await sandbox.cleanup()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
