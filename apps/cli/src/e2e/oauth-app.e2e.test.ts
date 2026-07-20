import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { defaultConfig, writeConfig } from '@ctxindex/core/config'
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

test('oauth-app add requires explicit initialization before reading config or creating state', async () => {
  const sandbox = await createSandbox()
  try {
    const added = await sandbox.run(
      ['oauth-app', 'add', 'microsoft', 'work', '--from-env'],
      {
        env: {
          CTXINDEX_MICROSOFT_CLIENT_ID: 'microsoft-client-id-canary',
        },
      },
    )
    expect(added.exitCode).toBe(2)
    expect(added.stderr).toContain(
      'ctxindex is not initialized; run ctxindex init',
    )
    expect(`${added.stdout}${added.stderr}`).not.toContain(
      'microsoft-client-id-canary',
    )
    const keytarMockFile = sandbox.env.CTXINDEX_KEYTAR_MOCK_FILE
    expect(keytarMockFile).toBeDefined()
    if (keytarMockFile === undefined) {
      throw new Error('sandbox Keychain mock path is required')
    }
    for (const path of [
      join(sandbox.env.CTXINDEX_CONFIG_HOME, 'config.toml'),
      join(sandbox.env.CTXINDEX_DATA_HOME, 'secrets.box'),
      join(sandbox.env.CTXINDEX_CONFIG_HOME, 'secret.key'),
      keytarMockFile,
    ]) {
      expect(await Bun.file(path).exists()).toBe(false)
    }
    await expectDatabaseAbsent(sandbox.env.CTXINDEX_DATA_HOME)
  } finally {
    await sandbox.cleanup()
  }
})

test('oauth-app add rejects config-only partial initialization without opening state', async () => {
  const sandbox = await createSandbox()
  try {
    await writeConfig(
      defaultConfig(),
      join(sandbox.env.CTXINDEX_CONFIG_HOME, 'config.toml'),
    )
    const keytarMockFile = sandbox.env.CTXINDEX_KEYTAR_MOCK_FILE
    expect(keytarMockFile).toBeDefined()
    if (keytarMockFile === undefined) {
      throw new Error('sandbox Keychain mock path is required')
    }

    const added = await sandbox.run(
      ['oauth-app', 'add', 'microsoft', 'work', '--from-env'],
      {
        env: { CTXINDEX_MICROSOFT_CLIENT_ID: 'partial-client-id-canary' },
      },
    )

    expect(added.exitCode).toBe(2)
    expect(added.stderr).toContain(
      'ctxindex is not initialized; run ctxindex init',
    )
    expect(`${added.stdout}${added.stderr}`).not.toContain(
      'partial-client-id-canary',
    )
    for (const path of [
      join(sandbox.env.CTXINDEX_DATA_HOME, 'secrets.box'),
      join(sandbox.env.CTXINDEX_CONFIG_HOME, 'secret.key'),
      keytarMockFile,
    ]) {
      expect(await Bun.file(path).exists()).toBe(false)
    }
    await expectDatabaseAbsent(sandbox.env.CTXINDEX_DATA_HOME)
  } finally {
    await sandbox.cleanup()
  }
})

test('oauth-app add preserves Provider validation before initialization', async () => {
  const sandbox = await createSandbox()
  try {
    const unknown = await sandbox.run(
      ['oauth-app', 'add', 'fastmail', 'work', '--from-env'],
      { env: { FASTMAIL_SECRET: 'unknown-canary' } },
    )

    expect(unknown.exitCode).toBe(2)
    expect(unknown.stderr).toContain('Unknown OAuth provider: fastmail')
    expect(`${unknown.stdout}${unknown.stderr}`).not.toContain('unknown-canary')
    expect(
      await Bun.file(
        join(sandbox.env.CTXINDEX_CONFIG_HOME, 'config.toml'),
      ).exists(),
    ).toBe(false)
    await expectDatabaseAbsent(sandbox.env.CTXINDEX_DATA_HOME)
  } finally {
    await sandbox.cleanup()
  }
})

test('oauth-app validates providers and manages safe labeled inventory', async () => {
  const sandbox = await createSandbox()
  try {
    const initialized = await sandbox.run(['init'])
    expect(initialized.exitCode, initialized.stderr).toBe(0)

    const managed = await sandbox.run(['oauth-app', 'list', '--json'])
    expect(managed.exitCode, managed.stderr).toBe(0)
    expect(managed.stdout).not.toMatch(
      /clientId|clientSecret|apps\.googleusercontent|GOCSPX|22d1ed12/i,
    )
    expect(JSON.parse(managed.stdout)).toEqual([
      {
        providerId: 'google',
        label: 'ctxindex',
        origin: 'extension',
        provenance: {
          kind: 'extension',
          source: 'builtin',
          packageName: '@ctxindex/adapters',
        },
      },
      {
        providerId: 'microsoft',
        label: 'ctxindex',
        origin: 'extension',
        provenance: {
          kind: 'extension',
          source: 'builtin',
          packageName: '@ctxindex/adapters',
        },
      },
    ])

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
        label: 'ctxindex',
        origin: 'extension',
        provenance: {
          kind: 'extension',
          source: 'builtin',
          packageName: '@ctxindex/adapters',
        },
      },
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
        label: 'ctxindex',
        origin: 'extension',
        provenance: {
          kind: 'extension',
          source: 'builtin',
          packageName: '@ctxindex/adapters',
        },
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
