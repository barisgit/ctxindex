import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { createSandbox } from '@ctxindex/core/testing'

async function expectDatabaseAbsent(dataHome: string): Promise<void> {
  for (const filename of [
    'ctxindex.sqlite',
    'ctxindex.sqlite-wal',
    'ctxindex.sqlite-shm',
  ]) {
    expect(await Bun.file(join(dataHome, filename)).exists()).toBe(false)
  }
}

test('oauth-app rejects unknown Providers and invalid config without creating SQLite files', async () => {
  const sandbox = await createSandbox()
  try {
    const unknown = await sandbox.run([
      'oauth-app',
      'add',
      'fastmail',
      'work',
      '--from-env',
    ])
    expect(unknown.exitCode).toBe(2)
    expect(unknown.stderr).toContain('Unknown OAuth provider: fastmail')
    await expectDatabaseAbsent(sandbox.env.CTXINDEX_DATA_HOME)

    const invalidConfig = await sandbox.run([
      'oauth-app',
      'add',
      'microsoft',
      'work',
      '--from-env',
    ])
    expect(invalidConfig.exitCode).toBe(2)
    expect(invalidConfig.stderr).toContain(
      'OAuth App configuration is invalid for the selected Provider',
    )
    await expectDatabaseAbsent(sandbox.env.CTXINDEX_DATA_HOME)
  } finally {
    await sandbox.cleanup()
  }
})

test('oauth-app validates providers and manages safe labeled inventory', async () => {
  const sandbox = await createSandbox()
  try {
    const empty = await sandbox.run(['oauth-app', 'list', '--json'])
    expect(empty.exitCode, empty.stderr).toBe(0)
    expect(empty.stdout).toBe('[]\n')

    const unknown = await sandbox.run(
      ['oauth-app', 'add', 'fastmail', 'work', '--from-env'],
      { env: { FASTMAIL_SECRET: 'unknown-canary' } },
    )
    expect(unknown.exitCode).toBe(2)
    expect(unknown.stderr).toContain('Unknown OAuth provider: fastmail')
    expect(unknown.stderr).not.toContain('unknown-canary')

    const added = await sandbox.run(
      ['oauth-app', 'add', 'google', 'work', '--from-env'],
      {
        env: {
          CTXINDEX_GOOGLE_CLIENT_ID: 'client-id-canary',
          CTXINDEX_GOOGLE_CLIENT_SECRET: 'client-secret-canary',
        },
      },
    )
    expect(added.exitCode, added.stderr).toBe(0)
    expect(added.stdout).toContain('OAuth App added: google "work"')
    expect(added.stdout).not.toContain('canary')

    const secondGoogle = await sandbox.run(
      ['oauth-app', 'add', 'google', 'personal', '--from-env'],
      {
        env: {
          CTXINDEX_GOOGLE_CLIENT_ID: 'second-client-id-canary',
          CTXINDEX_GOOGLE_CLIENT_SECRET: 'second-client-secret-canary',
        },
      },
    )
    expect(secondGoogle.exitCode, secondGoogle.stderr).toBe(0)

    const microsoft = await sandbox.run(
      ['oauth-app', 'add', 'microsoft', 'work', '--from-env'],
      {
        env: {
          CTXINDEX_MICROSOFT_CLIENT_ID: 'microsoft-client-id-canary',
        },
      },
    )
    expect(microsoft.exitCode, microsoft.stderr).toBe(0)

    const listed = await sandbox.run(['oauth-app', 'list'])
    expect(listed.exitCode, listed.stderr).toBe(0)
    expect(listed.stdout).toContain('google "work" origin=local')
    expect(listed.stdout).not.toContain('canary')
    expect(listed.stdout).not.toContain('keychain:')

    const listedJson = await sandbox.run(['oauth-app', 'list', '--json'])
    expect(listedJson.exitCode, listedJson.stderr).toBe(0)
    expect(listedJson.stdout).not.toContain('canary')
    expect(listedJson.stdout).not.toContain('keychain:')
    expect(listedJson.stdout).not.toContain('clientId')
    expect(listedJson.stdout).not.toContain('clientSecret')
    expect(listedJson.stdout).not.toContain('token')
    expect(JSON.parse(listedJson.stdout)).toEqual([
      {
        providerId: 'google',
        label: 'personal',
        origin: 'local',
        provenance: { kind: 'local' },
      },
      {
        providerId: 'google',
        label: 'work',
        origin: 'local',
        provenance: { kind: 'local' },
      },
      {
        providerId: 'microsoft',
        label: 'work',
        origin: 'local',
        provenance: { kind: 'local' },
      },
    ])

    const removed = await sandbox.run(['oauth-app', 'remove', 'google', 'work'])
    expect(removed.exitCode, removed.stderr).toBe(0)
    expect(removed.stdout).toContain('OAuth App removed: google "work"')
  } finally {
    await sandbox.cleanup()
  }
})
