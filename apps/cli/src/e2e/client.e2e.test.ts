import { expect, test } from 'bun:test'
import { createSandbox } from '@ctxindex/core/testing'

test('client add validates providers and manages safe labeled inventory', async () => {
  const sandbox = await createSandbox()
  try {
    const unknown = await sandbox.run(
      ['client', 'add', 'fastmail', '--from-env'],
      { env: { FASTMAIL_SECRET: 'unknown-canary' } },
    )
    expect(unknown.exitCode).toBe(2)
    expect(unknown.stderr).toContain('Unknown OAuth provider: fastmail')
    expect(unknown.stderr).not.toContain('unknown-canary')

    const added = await sandbox.run(
      ['client', 'add', 'google', '--label', 'work', '--from-env'],
      {
        env: {
          CTXINDEX_GOOGLE_CLIENT_ID: 'client-id-canary',
          CTXINDEX_GOOGLE_CLIENT_SECRET: 'client-secret-canary',
        },
      },
    )
    expect(added.exitCode, added.stderr).toBe(0)
    expect(added.stdout).toContain('client added: google "work"')
    expect(added.stdout).not.toContain('canary')

    const listed = await sandbox.run(['client', 'list'])
    expect(listed.exitCode, listed.stderr).toBe(0)
    expect(listed.stdout).toContain('google "work"')
    expect(listed.stdout).not.toContain('canary')
    expect(listed.stdout).not.toContain('keychain:')

    const removed = await sandbox.run(['client', 'remove', 'google', 'work'])
    expect(removed.exitCode, removed.stderr).toBe(0)
    expect(removed.stdout).toContain('client removed: google "work"')
  } finally {
    await sandbox.cleanup()
  }
})
