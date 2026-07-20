import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { createSandbox } from '@ctxindex/core/testing'
import { startMockGmail } from './_mock-gmail'
import {
  type MockGoogleCalendarEvent,
  startMockGoogleCalendar,
} from './_mock-google-calendar'
import { installLoopbackBrowser } from './_oauth-account'

function parseSourceId(stdout: string): string {
  const match = /^source added: (.+)$/m.exec(stdout)
  if (!match?.[1]) throw new Error(`Could not parse Source id from: ${stdout}`)
  return match[1]
}

function syncRun(stdout: string): {
  readonly mode: string
  readonly status: string
  readonly added: number
  readonly updated: number
  readonly deleted: number
} {
  const parsed = JSON.parse(stdout) as {
    results?: { run?: unknown }[]
  }
  const run = parsed.results?.[0]?.run
  if (!run || typeof run !== 'object') {
    throw new Error(`Could not parse sync result from: ${stdout}`)
  }
  return run as ReturnType<typeof syncRun>
}

const teamRoadmap: MockGoogleCalendarEvent = {
  id: 'event/team roadmap%',
  status: 'confirmed',
  summary: 'Roadmap planning',
  description: 'Plan the next release.',
  location: 'Room 1',
  htmlLink: 'https://calendar.google.com/calendar/event?eid=team-roadmap',
  created: '2026-07-01T08:00:00Z',
  updated: '2026-07-02T09:00:00Z',
  start: {
    dateTime: '2026-07-20T09:00:00+02:00',
    timeZone: 'Europe/Ljubljana',
  },
  end: { dateTime: '2026-07-20T10:00:00+02:00', timeZone: 'Europe/Ljubljana' },
  organizer: { email: 'organizer@example.test', displayName: 'Organizer' },
  attendees: [{ email: 'person@example.test', responseStatus: 'accepted' }],
}

const teamOffsite: MockGoogleCalendarEvent = {
  id: 'event-all-day',
  status: 'tentative',
  summary: 'Team offsite',
  created: '2026-07-01T08:00:00Z',
  updated: '2026-07-02T09:00:00Z',
  start: { date: '2026-07-22' },
  end: { date: '2026-07-24' },
}

const personalRoadmap: MockGoogleCalendarEvent = {
  id: 'personal-roadmap',
  status: 'confirmed',
  summary: 'Personal roadmap review',
  created: '2026-07-03T08:00:00Z',
  updated: '2026-07-03T09:00:00Z',
  start: { dateTime: '2026-07-21T17:00:00Z' },
  end: { dateTime: '2026-07-21T17:30:00Z' },
}

test('compiled CLI shares one Google Account across labeled mailbox and Calendar Sources', async () => {
  const sandbox = await createSandbox()
  const gmail = startMockGmail()
  const calendar = startMockGoogleCalendar({
    'team@example.test': [teamRoadmap, teamOffsite],
    'personal@example.test': [personalRoadmap],
  })
  try {
    const bin = await installLoopbackBrowser(sandbox.dir)
    const env = calendar.env(
      sandbox,
      gmail.env(sandbox, {
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        CTXINDEX_LOOPBACK_TIMEOUT_SECS: '5',
        CTXINDEX_GOOGLE_CLIENT_ID: 'public-client-id',
        CTXINDEX_GOOGLE_CLIENT_SECRET: 'client-secret-canary',
      }),
    )
    for (const command of [
      ['init'],
      ['realm', 'add', 'work'],
      ['realm', 'add', 'personal'],
    ]) {
      const result = await sandbox.run(command, { env })
      expect(result.exitCode, result.stderr).toBe(0)
    }

    const app = await sandbox.run(
      ['oauth-app', 'add', 'google', 'google', '--from-env'],
      { env },
    )
    expect(app.exitCode, app.stderr).toBe(0)
    const account = await sandbox.run(
      [
        'account',
        'add',
        'google',
        '--app',
        'google',
        '--label',
        'google-account',
      ],
      { env },
    )
    expect(account.exitCode, account.stderr).toBe(0)
    expect(account.stdout).not.toContain('canary')

    const db = new Database(
      join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite'),
      { readonly: true },
    )
    const accounts = db.query('SELECT id FROM accounts').all() as {
      id: string
    }[]
    const grants = db.query('SELECT id, scopes_json FROM grants').all() as {
      id: string
      scopes_json: string
    }[]
    db.close()
    expect(accounts).toHaveLength(1)
    expect(grants).toHaveLength(1)
    expect(JSON.parse(grants[0]?.scopes_json ?? 'null')).toEqual([
      'email',
      'https://www.googleapis.com/auth/calendar.events.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.readonly',
      'openid',
    ])
    const addSource = async (
      adapter: 'google.mailbox' | 'google.calendar',
      realm: 'work' | 'personal',
      label: string,
      calendarId?: string,
    ): Promise<string> => {
      const result = await sandbox.run(
        [
          'source',
          'add',
          adapter,
          '--realm',
          realm,
          '--account',
          'google-account',
          '--label',
          label,
          ...(calendarId ? ['--config-calendar-id', calendarId] : []),
        ],
        { env },
      )
      expect(result.exitCode, result.stderr).toBe(0)
      return parseSourceId(result.stdout)
    }

    const mailboxSourceLabel = 'primary-inbox'
    const teamSourceLabel = 'team-calendar'
    const personalSourceLabel = 'personal-calendar'
    await addSource('google.mailbox', 'work', mailboxSourceLabel)
    const teamSourceId = await addSource(
      'google.calendar',
      'work',
      teamSourceLabel,
      'team@example.test',
    )
    const personalSourceId = await addSource(
      'google.calendar',
      'personal',
      personalSourceLabel,
      'personal@example.test',
    )

    const listed = await sandbox.run(['account', 'list', '--json'], { env })
    expect(listed.exitCode, listed.stderr).toBe(0)
    expect(listed.stdout).not.toContain('canary')
    expect(listed.stdout).not.toContain('mock-google-subject')
    expect(listed.stdout).not.toMatch(/grant|scope/i)
    const inventory = JSON.parse(listed.stdout) as {
      label: string
      sources: { label: string }[]
    }[]
    expect(inventory).toHaveLength(1)
    expect(inventory[0]?.label).toBe('google-account')
    expect(inventory[0]?.sources.map(({ label }) => label).sort()).toEqual(
      [mailboxSourceLabel, personalSourceLabel, teamSourceLabel].sort(),
    )

    const sourceList = await sandbox.run(['source', 'list', '--json'], { env })
    expect(sourceList.exitCode, sourceList.stderr).toBe(0)
    expect(sourceList.stdout).not.toContain('canary')
    expect(sourceList.stdout).not.toMatch(/grant/i)
    expect(
      (
        JSON.parse(sourceList.stdout) as {
          label: string
          adapterId: string
        }[]
      )
        .map(({ label, adapterId }) => ({
          label,
          adapterId,
        }))
        .sort((left, right) =>
          left.label < right.label ? -1 : left.label > right.label ? 1 : 0,
        ),
    ).toEqual([
      {
        label: personalSourceLabel,
        adapterId: 'google.calendar',
      },
      {
        label: mailboxSourceLabel,
        adapterId: 'google.mailbox',
      },
      {
        label: teamSourceLabel,
        adapterId: 'google.calendar',
      },
    ])

    gmail.resetRequests()
    calendar.resetRequests()

    const teamInitial = await sandbox.run(
      ['sync', '--source', teamSourceLabel, '--json'],
      { env },
    )
    expect(teamInitial.exitCode, teamInitial.stderr).toBe(0)
    expect(syncRun(teamInitial.stdout)).toMatchObject({
      mode: 'sync',
      status: 'completed',
      added: 2,
      updated: 0,
      deleted: 0,
    })
    const personalInitial = await sandbox.run(
      ['sync', '--source', personalSourceLabel, '--json'],
      { env },
    )
    expect(personalInitial.exitCode, personalInitial.stderr).toBe(0)
    expect(syncRun(personalInitial.stdout)).toMatchObject({
      added: 1,
      updated: 0,
      deleted: 0,
    })

    const workSearch = await sandbox.run(
      [
        'search',
        'roadmap',
        '--kind',
        'calendar.event',
        '--realm',
        'work',
        '--json',
      ],
      { env },
    )
    expect(workSearch.exitCode, workSearch.stderr).toBe(0)
    const workResults = JSON.parse(workSearch.stdout).results as {
      ref: string
      sourceId: string
      profile: { id: string; version: number }
      origin: string
    }[]
    const roadmapRef = `ctx://${teamSourceId}/event/${encodeURIComponent(teamRoadmap.id)}`
    expect(workResults).toEqual([
      expect.objectContaining({
        ref: roadmapRef,
        sourceId: teamSourceId,
        profile: { id: 'calendar.event', version: 1 },
        origin: 'local',
      }),
    ])

    const personalSearch = await sandbox.run(
      [
        'search',
        'roadmap',
        '--kind',
        'calendar.event',
        '--realm',
        'personal',
        '--json',
      ],
      { env },
    )
    expect(personalSearch.exitCode, personalSearch.stderr).toBe(0)
    expect(
      (JSON.parse(personalSearch.stdout).results as { sourceId: string }[]).map(
        ({ sourceId }) => sourceId,
      ),
    ).toEqual([personalSourceId])

    const got = await sandbox.run(['get', '--json', roadmapRef], { env })
    expect(got.exitCode, got.stderr).toBe(0)
    expect(JSON.parse(got.stdout)).toMatchObject({
      resource: {
        ref: roadmapRef,
        sourceId: teamSourceId,
        profile: { id: 'calendar.event', version: 1 },
        origin: 'synced',
        title: 'Roadmap planning',
        payload: {
          provider: 'google',
          providerCalendarId: 'team@example.test',
          providerEventId: teamRoadmap.id,
          title: 'Roadmap planning',
          status: 'confirmed',
          timing: {
            kind: 'timed',
            start: '2026-07-20T09:00:00+02:00',
            end: '2026-07-20T10:00:00+02:00',
          },
        },
      },
      warnings: [],
    })

    const unchanged = await sandbox.run(
      ['sync', '--source', teamSourceLabel, '--json'],
      { env },
    )
    expect(unchanged.exitCode, unchanged.stderr).toBe(0)
    expect(syncRun(unchanged.stdout)).toMatchObject({
      added: 0,
      updated: 0,
      deleted: 0,
    })

    const updatedRoadmap: MockGoogleCalendarEvent = {
      ...teamRoadmap,
      summary: 'Roadmap planning updated',
      updated: '2026-07-04T09:00:00Z',
    }
    const releaseEvent: MockGoogleCalendarEvent = {
      id: 'release-event',
      status: 'confirmed',
      summary: 'Release roadmap',
      created: '2026-07-04T08:00:00Z',
      updated: '2026-07-04T09:00:00Z',
      start: { dateTime: '2026-08-01T09:00:00Z' },
      end: { dateTime: '2026-08-01T10:00:00Z' },
    }
    calendar.upsertEvent('team@example.test', updatedRoadmap)
    calendar.cancelEvent('team@example.test', teamOffsite.id)
    calendar.upsertEvent('team@example.test', releaseEvent)

    const diff = await sandbox.run(
      ['sync', '--source', teamSourceLabel, '--mode', 'diff', '--json'],
      { env },
    )
    expect(diff.exitCode, diff.stderr).toBe(0)
    expect(syncRun(diff.stdout)).toMatchObject({
      mode: 'diff',
      added: 1,
      updated: 1,
      deleted: 1,
    })
    expect(
      JSON.parse(
        (await sandbox.run(['get', '--json', roadmapRef], { env })).stdout,
      ).resource.payload.title,
    ).toBe('Roadmap planning')

    const reconciled = await sandbox.run(
      ['sync', '--source', teamSourceLabel, '--json'],
      { env },
    )
    expect(reconciled.exitCode, reconciled.stderr).toBe(0)
    expect(syncRun(reconciled.stdout)).toMatchObject({
      added: 1,
      updated: 1,
      deleted: 1,
    })
    expect(
      JSON.parse(
        (await sandbox.run(['get', '--json', roadmapRef], { env })).stdout,
      ).resource.payload.title,
    ).toBe('Roadmap planning updated')
    const deletedRef = `ctx://${teamSourceId}/event/${encodeURIComponent(teamOffsite.id)}`
    expect(
      JSON.parse(
        (await sandbox.run(['get', '--json', deletedRef], { env })).stdout,
      ).resource,
    ).toMatchObject({ ref: deletedRef, deletedAt: expect.any(Number) })

    const releaseRef = `ctx://${teamSourceId}/event/${encodeURIComponent(releaseEvent.id)}`
    calendar.upsertEvent('team@example.test', {
      ...releaseEvent,
      updated: '2026-07-05T09:00:00Z',
      start: { dateTime: '2035-01-01T09:00:00Z' },
      end: { dateTime: '2035-01-01T10:00:00Z' },
    })
    const windowReconcile = await sandbox.run(
      ['sync', '--source', teamSourceLabel, '--mode', 'resync', '--json'],
      { env },
    )
    expect(windowReconcile.exitCode, windowReconcile.stderr).toBe(0)
    expect(syncRun(windowReconcile.stdout)).toMatchObject({
      mode: 'resync',
      added: 0,
      updated: 1,
      deleted: 1,
    })
    expect(
      JSON.parse(
        (await sandbox.run(['get', '--json', releaseRef], { env })).stdout,
      ).resource,
    ).toMatchObject({ ref: releaseRef, deletedAt: expect.any(Number) })

    const calendarRequests = calendar.readRequests()
    expect(calendarRequests.length).toBeGreaterThanOrEqual(5)
    expect(
      calendarRequests.every(
        ({ method, pathname }) =>
          method === 'GET' && pathname.startsWith('/calendar/v3/calendars/'),
      ),
    ).toBe(true)
    expect(
      calendarRequests.every(
        ({ authorization }) => authorization === 'Bearer [REDACTED]',
      ),
    ).toBe(true)
    const fullRequests = calendarRequests.filter(
      ({ search }) => !new URLSearchParams(search).has('syncToken'),
    )
    const incrementalRequests = calendarRequests.filter(({ search }) =>
      new URLSearchParams(search).has('syncToken'),
    )
    expect(fullRequests.length).toBeGreaterThanOrEqual(3)
    for (const { search } of fullRequests) {
      const params = new URLSearchParams(search)
      expect(params.has('timeMin')).toBe(true)
      expect(params.has('timeMax')).toBe(true)
      expect(params.get('singleEvents')).toBe('true')
      expect(params.get('showDeleted')).toBe('true')
      expect(params.has('orderBy')).toBe(false)
    }
    expect(incrementalRequests.length).toBeGreaterThanOrEqual(3)
    for (const { search } of incrementalRequests) {
      const params = new URLSearchParams(search)
      expect(params.has('timeMin')).toBe(false)
      expect(params.has('timeMax')).toBe(false)
      expect(params.has('orderBy')).toBe(false)
    }
    expect(gmail.readRequests()).toEqual([])

    const beforeUnknownAction = calendar.readRequests().length
    const unknownAction = await sandbox.run(
      [
        'action',
        'run',
        'calendar.event.create',
        '--source',
        teamSourceLabel,
        '--input',
        '{}',
        '--json',
      ],
      { env },
    )
    expect(unknownAction.exitCode).toBe(2)
    expect(unknownAction.stderr).toContain('Unknown Action')
    expect(calendar.readRequests()).toHaveLength(beforeUnknownAction)
  } finally {
    calendar.stop()
    gmail.stop()
    await sandbox.cleanup()
  }
}, 30_000)
