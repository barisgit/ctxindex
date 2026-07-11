import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'
import { type MockGmailServer, startMockGmail } from './_mock-gmail'

function dbPath(sandbox: Sandbox): string {
  return join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite')
}

function parseSourceId(stdout: string): string {
  const match = /^source added: (.+)$/m.exec(stdout)
  if (!match?.[1]) throw new Error(`Could not parse source id from: ${stdout}`)
  return match[1]
}

async function addGoogleSource(sandbox: Sandbox): Promise<string> {
  const added = await sandbox.run([
    'source',
    'add',
    '--adapter',
    'google.mailbox',
    '--realm',
    'global',
  ])
  expect(added.exitCode, added.stderr).toBe(0)
  return parseSourceId(added.stdout)
}

async function authAdd(
  sandbox: Sandbox,
  mock: MockGmailServer,
  code: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return sandbox.run(
    [
      'auth',
      'add',
      'google',
      '--client-id',
      'mock-client-id',
      '--client-secret',
      'mock-client-secret',
      '--auth-code',
      code,
    ],
    { env: mock.env(sandbox) },
  )
}

async function authedGoogleSandbox(): Promise<{
  sandbox: Sandbox
  mock: MockGmailServer
  sourceId: string
}> {
  const sandbox = await createSandbox()
  const mock = startMockGmail()
  const init = await sandbox.run(['init'])
  expect(init.exitCode, init.stderr).toBe(0)
  const auth = await authAdd(sandbox, mock, 'initial-code')
  expect(auth.exitCode, auth.stderr).toBe(0)
  const sourceId = await addGoogleSource(sandbox)
  return { sandbox, mock, sourceId }
}

function lastStatus(sandbox: Sandbox, sourceId: string): string | null {
  const db = new Database(dbPath(sandbox), { readonly: true })
  try {
    const row = db
      .prepare('SELECT last_status FROM source_sync_state WHERE source_id = ?')
      .get(sourceId) as { last_status: string } | null
    return row?.last_status ?? null
  } finally {
    db.close()
  }
}

async function invalidGrantSync(
  sandbox: Sandbox,
  mock: MockGmailServer,
  sourceId: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  mock.setRefreshMode('invalid_grant')
  return sandbox.run(['sync', '--source', sourceId], { env: mock.env(sandbox) })
}

describe('reauth e2e', () => {
  test('invalid_grant exits 10', async () => {
    const { sandbox, mock, sourceId } = await authedGoogleSandbox()
    try {
      const result = await invalidGrantSync(sandbox, mock, sourceId)

      expect(result.exitCode, result.stderr).toBe(10)
      expect(result.stderr).toContain('google authorization expired')
    } finally {
      mock.stop()
      await sandbox.cleanup()
    }
  })

  test('post recovery sync exits 0', async () => {
    const { sandbox, mock, sourceId } = await authedGoogleSandbox()
    try {
      const failed = await invalidGrantSync(sandbox, mock, sourceId)
      expect(failed.exitCode, failed.stderr).toBe(10)

      mock.setRefreshMode('ok')
      const auth = await authAdd(sandbox, mock, 'fresh-code')
      expect(auth.exitCode, auth.stderr).toBe(0)

      const recovered = await sandbox.run(['sync', '--source', sourceId], {
        env: mock.env(sandbox),
      })
      expect(recovered.exitCode, recovered.stderr).toBe(0)
      expect(lastStatus(sandbox, sourceId)).toBe('completed')
    } finally {
      mock.stop()
      await sandbox.cleanup()
    }
  })

  test('last_status needs_auth on invalid_grant', async () => {
    const { sandbox, mock, sourceId } = await authedGoogleSandbox()
    try {
      const result = await invalidGrantSync(sandbox, mock, sourceId)

      expect(result.exitCode, result.stderr).toBe(10)
      expect(lastStatus(sandbox, sourceId)).toBe('needs_auth')
    } finally {
      mock.stop()
      await sandbox.cleanup()
    }
  })

  test('re-auth failure keeps needs_auth', async () => {
    const { sandbox, mock, sourceId } = await authedGoogleSandbox()
    try {
      const result = await invalidGrantSync(sandbox, mock, sourceId)
      expect(result.exitCode, result.stderr).toBe(10)
      expect(lastStatus(sandbox, sourceId)).toBe('needs_auth')

      mock.setAuthCodeMode('invalid_grant')
      const auth = await authAdd(sandbox, mock, 'still-bad-code')
      expect(auth.exitCode).toBe(10)
      expect(lastStatus(sandbox, sourceId)).toBe('needs_auth')
    } finally {
      mock.stop()
      await sandbox.cleanup()
    }
  })

  test('multiple grants require explicit account and persist the link', async () => {
    const sandbox = await createSandbox()
    try {
      const init = await sandbox.run(['init'])
      expect(init.exitCode, init.stderr).toBe(0)
      const db = new Database(dbPath(sandbox))
      const now = Date.now()
      for (const [accountId, grantId, email] of [
        ['acct-work', 'grant-work', 'work@example.com'],
        ['acct-home', 'grant-home', 'home@example.com'],
      ] as const) {
        db.prepare(
          `INSERT INTO accounts (id, realm_id, provider, display_name, email, created_at)
           VALUES (?, 'global', 'google', ?, ?, ?)`,
        ).run(accountId, email, email, now)
        db.prepare(
          `INSERT INTO grants (id, account_id, provider, scopes, created_at, updated_at)
           VALUES (?, ?, 'google', 'gmail.readonly', ?, ?)`,
        ).run(grantId, accountId, now, now)
      }
      db.close()

      const ambiguous = await sandbox.run([
        'source',
        'add',
        '--adapter',
        'google.mailbox',
      ])
      expect(ambiguous.exitCode).toBe(2)
      expect(ambiguous.stderr).toContain('multiple Google grants available')

      const added = await sandbox.run([
        'source',
        'add',
        '--adapter',
        'google.mailbox',
        '--account',
        'work@example.com',
      ])
      expect(added.exitCode, added.stderr).toBe(0)
      const verify = new Database(dbPath(sandbox), { readonly: true })
      expect(
        verify
          .prepare('SELECT grant_id FROM sources WHERE id = ?')
          .get(parseSourceId(added.stdout)),
      ).toEqual({ grant_id: 'grant-work' })
      verify.close()
    } finally {
      await sandbox.cleanup()
    }
  })

  test('source cannot be created without a linked grant', async () => {
    const sandbox = await createSandbox()
    try {
      const init = await sandbox.run(['init'])
      expect(init.exitCode, init.stderr).toBe(0)
      const result = await sandbox.run([
        'source',
        'add',
        '--adapter',
        'google.mailbox',
      ])

      expect(result.exitCode).toBe(2)
      expect(result.stderr).toContain('ctxindex auth add google')
      const db = new Database(dbPath(sandbox), { readonly: true })
      expect(db.prepare('SELECT COUNT(*) AS count FROM sources').get()).toEqual(
        { count: 0 },
      )
      db.close()
    } finally {
      await sandbox.cleanup()
    }
  })
})
