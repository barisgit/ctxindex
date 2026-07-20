import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { createSandbox } from '@ctxindex/core/testing'

test('CLI no-browser loopback emits a safe authorization URL and never accepts OOB input', async () => {
  const sandbox = await createSandbox()
  try {
    const initialized = await sandbox.run(['init'])
    expect(initialized.exitCode, initialized.stderr).toBe(0)

    const app = await sandbox.run(
      ['oauth-app', 'add', 'google', 'google', '--from-env'],
      {
        env: {
          CTXINDEX_GOOGLE_CLIENT_ID: 'public-id',
          CTXINDEX_GOOGLE_CLIENT_SECRET: 'client-secret-canary',
          CTXINDEX_KEYTAR_MOCK_FILE: join(sandbox.dir, 'keytar.json'),
        },
      },
    )
    expect(app.exitCode, app.stderr).toBe(0)
    expect(app.stdout).not.toContain('client-secret-canary')

    const result = await sandbox.run(
      ['account', 'add', 'google', '--app', 'google'],
      {
        env: {
          NODE_ENV: 'test',
          CTXINDEX_OAUTH_MOCK_BASE_URL: 'http://127.0.0.1:43123',
          CTXINDEX_NO_BROWSER: '1',
          CTXINDEX_LOOPBACK_TIMEOUT_SECS: '0.01',
          CTXINDEX_KEYTAR_MOCK_FILE: join(sandbox.dir, 'keytar.json'),
        },
      },
    )
    expect(result.exitCode).toBe(50)
    expect(result.stdout).toContain(
      'Open this URL: http://127.0.0.1:43123/oauth/google/authorize?',
    )
    expect(result.stdout).not.toContain('client-secret')
    expect(result.stderr).toContain('timed out')
  } finally {
    await sandbox.cleanup()
  }
})
