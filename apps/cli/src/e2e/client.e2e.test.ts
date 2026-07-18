import { expect, test } from 'bun:test'
import { createSandbox } from '@ctxindex/core/testing'

test('client add validates providers and manages safe labeled inventory', async () => {
  const sandbox = await createSandbox()
  try {
    const empty = await sandbox.run(['client', 'list', '--json'])
    expect(empty.exitCode, empty.stderr).toBe(0)
    expect(empty.stdout).toBe('[]\n')

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

    const secondGoogle = await sandbox.run(
      ['client', 'add', 'google', '--label', 'personal', '--from-env'],
      {
        env: {
          CTXINDEX_GOOGLE_CLIENT_ID: 'second-client-id-canary',
          CTXINDEX_GOOGLE_CLIENT_SECRET: 'second-client-secret-canary',
        },
      },
    )
    expect(secondGoogle.exitCode, secondGoogle.stderr).toBe(0)

    const microsoft = await sandbox.run(
      ['client', 'add', 'microsoft', '--label', 'work', '--from-env'],
      {
        env: {
          CTXINDEX_MICROSOFT_CLIENT_ID: 'microsoft-client-id-canary',
        },
      },
    )
    expect(microsoft.exitCode, microsoft.stderr).toBe(0)

    const listed = await sandbox.run(['client', 'list'])
    expect(listed.exitCode, listed.stderr).toBe(0)
    expect(listed.stdout).toContain('google "work"')
    expect(listed.stdout).not.toContain('canary')
    expect(listed.stdout).not.toContain('keychain:')

    const listedJson = await sandbox.run(['client', 'list', '--json'])
    expect(listedJson.exitCode, listedJson.stderr).toBe(0)
    expect(listedJson.stdout).not.toContain('canary')
    expect(listedJson.stdout).not.toContain('keychain:')
    expect(listedJson.stdout).not.toContain('clientId')
    expect(listedJson.stdout).not.toContain('clientSecret')
    expect(listedJson.stdout).not.toContain('token')
    const inventory = JSON.parse(listedJson.stdout) as Record<string, unknown>[]
    expect(inventory.map(({ provider, label }) => [provider, label])).toEqual([
      ['google', 'personal'],
      ['google', 'work'],
      ['microsoft', 'work'],
    ])
    for (const client of inventory) {
      expect(Object.keys(client)).toEqual([
        'provider',
        'label',
        'createdAt',
        'updatedAt',
      ])
      expect(client.createdAt).toEqual(expect.any(Number))
      expect(client.updatedAt).toEqual(expect.any(Number))
    }

    const removed = await sandbox.run(['client', 'remove', 'google', 'work'])
    expect(removed.exitCode, removed.stderr).toBe(0)
    expect(removed.stdout).toContain('client removed: google "work"')
  } finally {
    await sandbox.cleanup()
  }
})
