import { expect, test } from 'bun:test'
import { exists } from 'node:fs/promises'
import { join } from 'node:path'
import { createSandbox } from '@ctxindex/core/testing'

test('account list is a safe empty inventory and malformed input initializes nothing', async () => {
  const sandbox = await createSandbox()
  try {
    const malformed = await sandbox.run([
      'account',
      'list',
      '--client-secret',
      'account-canary',
    ])
    expect(malformed.exitCode).toBe(2)
    expect(malformed.stderr).not.toContain('account-canary')
    expect(
      await exists(join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite')),
    ).toBe(false)

    const init = await sandbox.run(['init'])
    expect(init.exitCode, init.stderr).toBe(0)
    const listed = await sandbox.run(['account', 'list', '--format', 'json'])
    expect(listed.exitCode, listed.stderr).toBe(0)
    expect(listed.stderr).toBe('')
    expect(JSON.parse(listed.stdout)).toEqual([])
  } finally {
    await sandbox.cleanup()
  }
})
