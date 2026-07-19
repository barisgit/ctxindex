import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { defaultConfig, writeConfig } from '@ctxindex/core/config'
import { createSandbox } from '@ctxindex/core/testing'

test('client add requires explicit initialization before reading credentials or creating state', async () => {
  const sandbox = await createSandbox()
  try {
    const added = await sandbox.run(
      ['client', 'add', 'microsoft', '--from-env'],
      {
        env: {
          CTXINDEX_MICROSOFT_CLIENT_ID: 'microsoft-client-id-canary',
        },
      },
    )

    expect(added.exitCode).toBe(2)
    expect(added.stderr).toContain(
      'ctxindex is not initialized; run bun cli init',
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
      join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite'),
      join(sandbox.env.CTXINDEX_DATA_HOME, 'secrets.box'),
      join(sandbox.env.CTXINDEX_CONFIG_HOME, 'secret.key'),
      keytarMockFile,
    ]) {
      expect(await Bun.file(path).exists()).toBe(false)
    }
  } finally {
    await sandbox.cleanup()
  }
})

test('client add rejects config-only partial initialization without opening state', async () => {
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
      ['client', 'add', 'microsoft', '--from-env'],
      {
        env: {
          CTXINDEX_MICROSOFT_CLIENT_ID: 'partial-client-id-canary',
        },
      },
    )

    expect(added.exitCode).toBe(2)
    expect(added.stderr).toContain(
      'ctxindex is not initialized; run bun cli init',
    )
    expect(`${added.stdout}${added.stderr}`).not.toContain(
      'partial-client-id-canary',
    )
    for (const path of [
      join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite'),
      join(sandbox.env.CTXINDEX_DATA_HOME, 'secrets.box'),
      join(sandbox.env.CTXINDEX_CONFIG_HOME, 'secret.key'),
      keytarMockFile,
    ]) {
      expect(await Bun.file(path).exists()).toBe(false)
    }
  } finally {
    await sandbox.cleanup()
  }
})

test('client add preserves provider validation before initialization', async () => {
  const sandbox = await createSandbox()
  try {
    const unknown = await sandbox.run(
      ['client', 'add', 'fastmail', '--from-env'],
      { env: { FASTMAIL_SECRET: 'unknown-canary' } },
    )

    expect(unknown.exitCode).toBe(2)
    expect(unknown.stderr).toContain('Unknown OAuth provider: fastmail')
    expect(`${unknown.stdout}${unknown.stderr}`).not.toContain('unknown-canary')
    const keytarMockFile = sandbox.env.CTXINDEX_KEYTAR_MOCK_FILE
    expect(keytarMockFile).toBeDefined()
    if (keytarMockFile === undefined) {
      throw new Error('sandbox Keychain mock path is required')
    }
    for (const path of [
      join(sandbox.env.CTXINDEX_CONFIG_HOME, 'config.toml'),
      join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite'),
      join(sandbox.env.CTXINDEX_DATA_HOME, 'secrets.box'),
      join(sandbox.env.CTXINDEX_CONFIG_HOME, 'secret.key'),
      keytarMockFile,
    ]) {
      expect(await Bun.file(path).exists()).toBe(false)
    }
  } finally {
    await sandbox.cleanup()
  }
})

test('client add validates providers and manages safe labeled inventory', async () => {
  const sandbox = await createSandbox()
  try {
    const initialized = await sandbox.run(['init'])
    expect(initialized.exitCode, initialized.stderr).toBe(0)

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
