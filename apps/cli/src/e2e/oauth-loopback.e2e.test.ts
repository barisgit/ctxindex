import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { createSandbox } from '@ctxindex/core/testing'

test('CLI no-browser loopback emits a safe authorization URL and never accepts OOB input', async () => {
  const sandbox = await createSandbox()
  try {
    const result = await sandbox.run(
      ['auth', 'add', 'google', '--adapter', 'google.mailbox', '--loopback'],
      {
        env: {
          NODE_ENV: 'test',
          CTXINDEX_OAUTH_MOCK_BASE_URL: 'http://127.0.0.1:43123',
          CTXINDEX_GOOGLE_CLIENT_ID: 'public-id',
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
