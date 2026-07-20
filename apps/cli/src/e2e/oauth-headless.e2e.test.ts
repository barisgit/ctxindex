import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { createSandbox } from '@ctxindex/core/testing'
import { installLoopbackBrowser } from './_oauth-account'

test('provider-neutral account authorization deduplicates Accounts and safely reuses one Grant', async () => {
  const calls: string[] = []
  const server = createServer(async (request, response) => {
    calls.push(request.url ?? '')
    if (request.url === '/oauth/google/token') {
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          access_token: 'access-canary',
          refresh_token: 'refresh-canary',
          expires_in: 60,
        }),
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
    const initialized = await sandbox.run(['init'])
    expect(initialized.exitCode, initialized.stderr).toBe(0)

    const bin = await installLoopbackBrowser(sandbox.dir)
    const accountEnv = {
      NODE_ENV: 'test',
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      CTXINDEX_OAUTH_MOCK_BASE_URL: base,
      CTXINDEX_LOOPBACK_TIMEOUT_SECS: '5',
      CTXINDEX_KEYTAR_MOCK_FILE: join(sandbox.dir, 'keytar.json'),
    }
    const app = await sandbox.run(
      ['oauth-app', 'add', 'google', 'google', '--from-env'],
      {
        env: {
          ...accountEnv,
          CTXINDEX_GOOGLE_CLIENT_ID: 'public-id',
          CTXINDEX_GOOGLE_CLIENT_SECRET: 'client-secret-canary',
        },
      },
    )
    expect(app.exitCode, app.stderr).toBe(0)
    expect(app.stdout).not.toContain('canary')
    expect(app.stdout).toContain('OAuth App added: google "google"')

    const result = await sandbox.run(
      ['account', 'add', 'google', '--app', 'google', '--label', 'work'],
      { env: accountEnv },
    )
    expect(result.exitCode, result.stderr).toBe(0)
    expect(result.stdout).not.toContain('canary')
    expect(result.stdout).toContain('account added:')
    const second = await sandbox.run(
      ['account', 'add', 'google', '--app', 'google', '--label', 'work'],
      { env: accountEnv },
    )
    expect(second.exitCode, second.stderr).toBe(0)
    expect(second.stdout).not.toContain('canary')
    expect(second.stdout).toContain('account added:')
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
    expect(rows).toHaveLength(1)
    expect(rows[0]?.provider).toBe('google')
    expect(JSON.parse(rows[0]?.scopes_json ?? 'null')).toEqual([
      'email',
      'https://www.googleapis.com/auth/calendar.events.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.readonly',
      'openid',
    ])
    db.close()

    const realm = await sandbox.run(['realm', 'add', 'work'])
    expect(realm.exitCode, realm.stderr).toBe(0)

    const sharedGrantId = rows[0]?.id ?? ''
    for (const name of ['Primary Inbox', 'Archive Inbox']) {
      const source = await sandbox.run([
        'source',
        'add',
        'google.mailbox',
        '--realm',
        'work',
        '--account',
        'work',
        '--label',
        name,
      ])
      expect(source.exitCode, source.stderr).toBe(0)
    }

    const sourceDb = new Database(
      join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite'),
    )
    const sourceRows = sourceDb
      .query('SELECT label, grant_id FROM sources ORDER BY label')
      .all() as { label: string; grant_id: string }[]
    sourceDb.close()
    expect(sourceRows).toEqual([
      { label: 'Archive Inbox', grant_id: sharedGrantId },
      { label: 'Primary Inbox', grant_id: sharedGrantId },
    ])

    const listed = await sandbox.run(['account', 'list', '--json'])
    expect(listed.exitCode, listed.stderr).toBe(0)
    expect(listed.stdout).not.toContain('canary')
    expect(listed.stdout).not.toContain('subject-1')
    expect(listed.stdout).not.toMatch(/grant|scope/i)
    const inventory = JSON.parse(listed.stdout) as {
      id: string
      provider: string
      label: string
      sources: { id: string }[]
    }[]
    expect(inventory).toHaveLength(1)
    expect(inventory[0]?.provider).toBe('google')
    expect(inventory[0]?.label).toBe('work')
    expect(inventory[0]?.sources).toHaveLength(2)
  } finally {
    await sandbox.cleanup()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
