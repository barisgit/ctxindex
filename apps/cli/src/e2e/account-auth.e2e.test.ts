import { expect, test } from 'bun:test'
import { createSandbox } from '@ctxindex/core/testing'
import { startMockGmail } from './_mock-gmail'
import { startMockGoogleCalendar } from './_mock-google-calendar'
import { installLoopbackBrowser } from './_oauth-account'

test('account add authorizes with a persisted client, lists its label, and removes it', async () => {
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

    const missingClient = await sandbox.run(['account', 'add', 'microsoft'], {
      env,
    })
    expect(missingClient.exitCode).toBe(2)
    expect(missingClient.stderr).toContain('bun cli client add microsoft')

    const client = await sandbox.run(
      ['client', 'add', 'google', '--from-env'],
      { env },
    )
    expect(client.exitCode, client.stderr).toBe(0)

    const clientCollision = await sandbox.run(
      ['client', 'add', 'google', '--from-env'],
      { env },
    )
    expect(clientCollision.exitCode).toBe(2)
    expect(clientCollision.stderr).toContain(
      'Client label "google" is already taken',
    )

    expect(
      (
        await sandbox.run(
          [
            'client',
            'add',
            'microsoft',
            '--label',
            'microsoft-only',
            '--from-env',
          ],
          { env },
        )
      ).exitCode,
    ).toBe(0)
    const mismatch = await sandbox.run(
      ['account', 'add', 'google', '--client', 'microsoft-only'],
      { env },
    )
    expect(mismatch.exitCode).toBe(2)
    expect(mismatch.stderr).toContain('Available labels: google')
    expect(mismatch.stderr).not.toContain('Available labels: microsoft-only')

    expect(
      (
        await sandbox.run(
          ['client', 'add', 'google', '--label', 'secondary', '--from-env'],
          { env },
        )
      ).exitCode,
    ).toBe(0)
    const ambiguous = await sandbox.run(['account', 'add', 'google'], { env })
    expect(ambiguous.exitCode).toBe(2)
    expect(ambiguous.stderr).toContain('Available labels: google, secondary')

    const added = await sandbox.run(
      ['account', 'add', 'google', '--label', 'work', '--client', 'google'],
      { env },
    )
    expect(added.exitCode, added.stderr).toBe(0)
    expect(added.stdout).toContain('account added:')

    const listed = await sandbox.run(['account', 'list', '--json'], { env })
    expect(listed.exitCode, listed.stderr).toBe(0)
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
