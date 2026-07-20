import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createSandbox } from '@ctxindex/core/testing'
import { startMockGmail } from './_mock-gmail'
import { startMockGoogleCalendar } from './_mock-google-calendar'
import { installLoopbackBrowser } from './_oauth-account'

test('account rejects an unavailable OAuth App without creating SQLite files', async () => {
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
      'OAuth App "missing" is not available for Provider "microsoft"',
    )
    for (const filename of [
      'ctxindex.sqlite',
      'ctxindex.sqlite-wal',
      'ctxindex.sqlite-shm',
    ]) {
      expect(
        await Bun.file(join(sandbox.env.CTXINDEX_DATA_HOME, filename)).exists(),
      ).toBe(false)
    }
  } finally {
    await sandbox.cleanup()
  }
})

test('account rejects an unavailable OAuth App without migrating an existing database', async () => {
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
    expect(await readFile(path)).toEqual(before)
    expect(await Bun.file(`${path}-wal`).exists()).toBe(false)
    expect(await Bun.file(`${path}-shm`).exists()).toBe(false)
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
    expect((await sandbox.run(['realm', 'add', 'mail'])).exitCode).toBe(0)

    const missingApp = await sandbox.run(
      ['account', 'add', 'microsoft', '--app', 'microsoft'],
      { env },
    )
    expect(missingApp.exitCode).toBe(2)
    expect(missingApp.stderr).toContain(
      'bun cli oauth-app add microsoft microsoft --from-env',
    )

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
      'OAuth App label "google" is already taken',
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
    expect(mismatch.stderr).toContain('Available labels: google')
    expect(mismatch.stderr).not.toContain('Available labels: microsoft-only')

    expect(
      (
        await sandbox.run(
          ['oauth-app', 'add', 'google', 'secondary', '--from-env'],
          { env },
        )
      ).exitCode,
    ).toBe(0)
    const missingSelector = await sandbox.run(['account', 'add', 'google'], {
      env,
    })
    expect(missingSelector.exitCode).toBe(2)
    expect(missingSelector.stderr).toContain('account add: --app is required')

    const added = await sandbox.run(
      ['account', 'add', 'google', '--label', 'work', '--app', 'google'],
      { env },
    )
    expect(added.exitCode, added.stderr).toBe(0)
    expect(added.stdout).toContain('account added:')
    expect(added.stdout).not.toMatch(/grant/i)

    const listed = await sandbox.run(['account', 'list', '--json'], { env })
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
      ['sync', '--source', 'calendar', '--json'],
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
      JSON.parse((await sandbox.run(['account', 'list', '--json'])).stdout),
    ).toEqual([])
    const needsAuth = await sandbox.run(
      ['sync', '--source', 'calendar', '--json'],
      {
        env,
      },
    )
    expect(needsAuth.exitCode).toBe(10)
  } finally {
    calendar.stop()
    mock.stop()
    await sandbox.cleanup()
  }
}, 20_000)
