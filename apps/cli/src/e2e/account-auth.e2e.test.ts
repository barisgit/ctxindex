import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defaultConfig, writeConfig } from '@ctxindex/core/config'
import { createSandbox } from '@ctxindex/core/testing'
import { startMockGmail } from './_mock-gmail'
import { startMockGoogleCalendar } from './_mock-google-calendar'
import { installLoopbackBrowser } from './_oauth-account'

async function expectDatabaseAbsent(dataHome: string): Promise<void> {
  for (const filename of [
    'ctxindex.sqlite',
    'ctxindex.sqlite-wal',
    'ctxindex.sqlite-shm',
  ]) {
    expect(await Bun.file(join(dataHome, filename)).exists()).toBe(false)
  }
}

async function expectSecretStateAbsent(
  configHome: string,
  dataHome: string,
  keytarMockFile: string | undefined,
): Promise<void> {
  expect(keytarMockFile).toBeDefined()
  if (keytarMockFile === undefined) {
    throw new Error('sandbox Keychain mock path is required')
  }
  for (const path of [
    join(dataHome, 'secrets.box'),
    join(configHome, 'secret.key'),
    keytarMockFile,
  ]) {
    expect(await Bun.file(path).exists()).toBe(false)
  }
}

test('account add requires initialization before OAuth App inventory or durable effects', async () => {
  const sandbox = await createSandbox()
  try {
    const result = await sandbox.run([
      'account',
      'add',
      'microsoft',
      '--app',
      'missing',
    ])
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain(
      'ctxindex is not initialized; run ctxindex init',
    )
    expect(result.stderr).not.toContain('OAuth App "missing"')
    expect(
      await Bun.file(
        join(sandbox.env.CTXINDEX_CONFIG_HOME, 'config.toml'),
      ).exists(),
    ).toBe(false)
    await expectDatabaseAbsent(sandbox.env.CTXINDEX_DATA_HOME)
    await expectSecretStateAbsent(
      sandbox.env.CTXINDEX_CONFIG_HOME,
      sandbox.env.CTXINDEX_DATA_HOME,
      sandbox.env.CTXINDEX_KEYTAR_MOCK_FILE,
    )
  } finally {
    await sandbox.cleanup()
  }
})

test('account add rejects config-only partial initialization without opening state', async () => {
  const sandbox = await createSandbox()
  try {
    const configPath = join(sandbox.env.CTXINDEX_CONFIG_HOME, 'config.toml')
    await writeConfig(defaultConfig(), configPath)
    const before = await readFile(configPath)

    const result = await sandbox.run([
      'account',
      'add',
      'microsoft',
      '--app',
      'missing',
    ])

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain(
      'ctxindex is not initialized; run ctxindex init',
    )
    expect(await readFile(configPath)).toEqual(before)
    await expectDatabaseAbsent(sandbox.env.CTXINDEX_DATA_HOME)
    await expectSecretStateAbsent(
      sandbox.env.CTXINDEX_CONFIG_HOME,
      sandbox.env.CTXINDEX_DATA_HOME,
      sandbox.env.CTXINDEX_KEYTAR_MOCK_FILE,
    )
  } finally {
    await sandbox.cleanup()
  }
})

test('account add rejects database-only partial initialization without opening state', async () => {
  const sandbox = await createSandbox()
  try {
    await mkdir(sandbox.env.CTXINDEX_DATA_HOME, { recursive: true })
    const path = join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite')
    const database = new Database(path, { create: true })
    database.exec('CREATE TABLE sentinel (value TEXT)')
    database.close()
    const before = await readFile(path)

    const result = await sandbox.run([
      'account',
      'add',
      'microsoft',
      '--app',
      'missing',
    ])

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain(
      'ctxindex is not initialized; run ctxindex init',
    )
    expect(await readFile(path)).toEqual(before)
    expect(await Bun.file(`${path}-wal`).exists()).toBe(false)
    expect(await Bun.file(`${path}-shm`).exists()).toBe(false)
    expect(
      await Bun.file(
        join(sandbox.env.CTXINDEX_CONFIG_HOME, 'config.toml'),
      ).exists(),
    ).toBe(false)
    await expectSecretStateAbsent(
      sandbox.env.CTXINDEX_CONFIG_HOME,
      sandbox.env.CTXINDEX_DATA_HOME,
      sandbox.env.CTXINDEX_KEYTAR_MOCK_FILE,
    )
  } finally {
    await sandbox.cleanup()
  }
})

test('account add preserves Provider validation before initialization', async () => {
  const sandbox = await createSandbox()
  try {
    const result = await sandbox.run([
      'account',
      'add',
      'fastmail',
      '--app',
      'missing',
    ])

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('Unknown OAuth provider "fastmail"')
    expect(result.stderr).not.toContain('ctxindex is not initialized')
    await expectDatabaseAbsent(sandbox.env.CTXINDEX_DATA_HOME)
    await expectSecretStateAbsent(
      sandbox.env.CTXINDEX_CONFIG_HOME,
      sandbox.env.CTXINDEX_DATA_HOME,
      sandbox.env.CTXINDEX_KEYTAR_MOCK_FILE,
    )
  } finally {
    await sandbox.cleanup()
  }
})

test('account add authorizes with a persisted OAuth App, lists its label, and removes it', async () => {
  const sandbox = await createSandbox()
  const mock = startMockGmail({ identityEmail: 'person@example.test' })
  const calendar = startMockGoogleCalendar()
  try {
    const bin = await installLoopbackBrowser(sandbox.dir)
    const env = mock.env(sandbox, {
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      CTXINDEX_LOOPBACK_TIMEOUT_SECS: '5',
      CTXINDEX_MICROSOFT_CLIENT_ID: 'microsoft-client-id',
      CTXINDEX_GOOGLE_CALENDAR_MOCK_BASE_URL: calendar.baseUrl,
    })
    expect((await sandbox.run(['init'])).exitCode).toBe(0)
    expect(
      (await sandbox.run(['realm', 'add', 'mail'], { env })).exitCode,
    ).toBe(0)

    const missingApp = await sandbox.run(
      ['account', 'add', 'microsoft', '--app', 'microsoft'],
      { env },
    )
    expect(missingApp.exitCode).toBe(2)
    expect(missingApp.stderr).toContain('Available labels: ctxindex')

    const app = await sandbox.run(
      ['oauth-app', 'add', 'google', 'google', '--from-env'],
      { env },
    )
    expect(app.exitCode, app.stderr).toBe(0)

    const appCollision = await sandbox.run(
      ['oauth-app', 'add', 'google', 'google', '--from-env'],
      { env },
    )
    expect(appCollision.exitCode).toBe(2)
    expect(appCollision.stderr).toContain(
      'OAuth App "google" already exists for Provider "google"',
    )

    expect(
      (
        await sandbox.run(
          ['oauth-app', 'add', 'microsoft', 'microsoft-only', '--from-env'],
          { env },
        )
      ).exitCode,
    ).toBe(0)
    const mismatch = await sandbox.run(
      ['account', 'add', 'google', '--app', 'microsoft-only'],
      { env },
    )
    expect(mismatch.exitCode).toBe(2)
    expect(mismatch.stderr).toContain('Available labels: ctxindex, google')
    expect(mismatch.stderr).not.toContain('Available labels: microsoft-only')

    const added = await sandbox.run(
      ['account', 'add', 'google', '--label', 'work', '--app', 'google'],
      { env },
    )
    expect(added.exitCode, added.stderr).toBe(0)
    expect(added.stdout).toContain('account added:')
    expect(added.stdout.match(/^account added:.*$/m)?.[0]).not.toMatch(/grant/i)

    const listed = await sandbox.run(['account', 'list', '--format', 'json'], {
      env,
    })
    expect(listed.exitCode, listed.stderr).toBe(0)
    expect(listed.stdout).not.toMatch(/grant|scope/i)
    expect(JSON.parse(listed.stdout)).toMatchObject([
      { provider: 'google', label: 'work' },
    ])

    const source = await sandbox.run(
      [
        'source',
        'add',
        'google.calendar',
        '--realm',
        'mail',
        '--account',
        'work',
        '--label',
        'calendar',
        '--config-calendar-id',
        'work@example.test',
      ],
      { env },
    )
    expect(source.exitCode, source.stderr).toBe(0)
    const sourceCollision = await sandbox.run(
      [
        'source',
        'add',
        'google.calendar',
        '--realm',
        'mail',
        '--account',
        'work',
        '--label',
        'calendar',
      ],
      { env },
    )
    expect(sourceCollision.exitCode).toBe(2)
    expect(sourceCollision.stderr).toContain(
      'Source label "calendar" is already taken',
    )

    const synced = await sandbox.run(
      ['sync', '--source', 'calendar', '--format', 'json'],
      {
        env,
      },
    )
    expect(synced.exitCode, synced.stderr).toBe(0)
    expect(JSON.parse(synced.stdout).results).toHaveLength(1)

    const removed = await sandbox.run(['account', 'remove', 'work'], { env })
    expect(removed.exitCode, removed.stderr).toBe(0)
    expect(removed.stdout).toContain('account removed: "work"')
    expect(
      JSON.parse(
        (await sandbox.run(['account', 'list', '--format', 'json'])).stdout,
      ),
    ).toEqual([])
    const needsAuth = await sandbox.run(
      ['sync', '--source', 'calendar', '--format', 'json'],
      {
        env,
      },
    )
    expect(needsAuth.exitCode, `${needsAuth.stdout}\n${needsAuth.stderr}`).toBe(
      10,
    )
  } finally {
    calendar.stop()
    mock.stop()
    await sandbox.cleanup()
  }
}, 20_000)
