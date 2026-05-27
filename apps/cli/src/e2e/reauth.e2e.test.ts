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

async function initWithGoogleSource(sandbox: Sandbox): Promise<string> {
  const init = await sandbox.run(['init'])
  expect(init.exitCode, init.stderr).toBe(0)
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
  const sourceId = await initWithGoogleSource(sandbox)
  const auth = await authAdd(sandbox, mock, 'initial-code')
  expect(auth.exitCode, auth.stderr).toBe(0)
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

  test('no auth at all exits 10', async () => {
    const sandbox = await createSandbox()
    const mock = startMockGmail()
    try {
      const sourceId = await initWithGoogleSource(sandbox)

      const result = await sandbox.run(['sync', '--source', sourceId], {
        env: mock.env(sandbox),
      })

      expect(result.exitCode, result.stderr).toBe(10)
      expect(result.stderr).toContain('ctxindex auth add google')
      expect(lastStatus(sandbox, sourceId)).toBe('needs_auth')
    } finally {
      mock.stop()
      await sandbox.cleanup()
    }
  })
})
