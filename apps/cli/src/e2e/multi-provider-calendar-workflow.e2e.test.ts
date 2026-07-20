import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { createSandbox } from '@ctxindex/core/testing'
import { startMockGmail } from './_mock-gmail'
import {
  type MockGoogleCalendarEvent,
  startMockGoogleCalendar,
} from './_mock-google-calendar'
import { type MockGraphCalendarEvent, startMockGraph } from './_mock-graph'
import { installLoopbackBrowser } from './_oauth-account'

function parseSourceId(stdout: string): string {
  const match = /^source added: (.+)$/m.exec(stdout)
  if (!match?.[1]) throw new Error(`Could not parse Source id from: ${stdout}`)
  return match[1]
}

function syncRun(stdout: string): {
  readonly added: number
  readonly updated: number
  readonly deleted: number
  readonly warningsCount: number
  readonly warnings: readonly { readonly code: string }[]
} {
  const parsed = JSON.parse(stdout) as {
    results?: { run?: unknown }[]
  }
  const run = parsed.results?.[0]?.run
  if (!run || typeof run !== 'object')
    throw new Error(`Could not parse sync result from: ${stdout}`)
  return run as ReturnType<typeof syncRun>
}

const sharedEventId = 'shared/event%'

const googleShared: MockGoogleCalendarEvent = {
  id: sharedEventId,
  status: 'confirmed',
  summary: 'Cross-provider planning',
  description: 'Personal Google planning event.',
  created: '2026-07-01T08:00:00Z',
  updated: '2026-07-02T09:00:00Z',
  start: { dateTime: '2026-07-20T09:00:00Z' },
  end: { dateTime: '2026-07-20T10:00:00Z' },
}

const googleRemoved: MockGoogleCalendarEvent = {
  id: 'google-removed',
  status: 'confirmed',
  summary: 'Personal event to remove',
  created: '2026-07-01T08:00:00Z',
  updated: '2026-07-02T09:00:00Z',
  start: { date: '2026-07-22' },
  end: { date: '2026-07-23' },
}

function graphEvent(
  id: string,
  subject: string,
  dateTime = '2026-07-20T09:00:00.000',
): MockGraphCalendarEvent {
  return {
    id,
    subject,
    bodyPreview: `${subject} preview`,
    body: { contentType: 'text', content: `${subject} body` },
    start: { dateTime, timeZone: 'UTC' },
    end: {
      dateTime: dateTime.replace('09:00:00', '10:00:00'),
      timeZone: 'UTC',
    },
    originalStartTimeZone: 'Europe/Ljubljana',
    originalEndTimeZone: 'Europe/Ljubljana',
    isAllDay: false,
    isCancelled: false,
    showAs: 'busy',
    type: 'singleInstance',
    organizer: {
      emailAddress: {
        name: 'Organizer',
        address: 'organizer@example.test',
      },
    },
    attendees: [
      {
        type: 'required',
        status: {
          response: 'accepted',
          time: '2026-07-01T08:00:00Z',
        },
        emailAddress: { address: 'attendee@example.test' },
      },
    ],
    recurrence: null,
    webLink: `https://outlook.office.com/calendar/item/${encodeURIComponent(id)}`,
    createdDateTime: '2026-07-01T08:00:00Z',
    lastModifiedDateTime: '2026-07-02T09:00:00Z',
  }
}

const graphShared = {
  ...graphEvent(sharedEventId, 'Cross-provider planning'),
  type: 'occurrence',
  seriesMasterId: 'synthetic-windows-series',
  originalStartTimeZone: undefined,
  originalEndTimeZone: undefined,
  start: {
    dateTime: '2026-07-20T09:00:00.0000000',
    timeZone: 'GMT Standard Time',
  },
  end: {
    dateTime: '2026-07-20T10:00:00.0000000',
    timeZone: 'GMT Standard Time',
  },
}
const graphRemoved = {
  ...graphEvent('graph-removed', 'Work event to remove'),
  type: 'occurrence',
  seriesMasterId: 'synthetic-iana-series',
  originalStart: '2026-07-22T09:00:00.0000000',
  originalStartTimeZone: 'Europe/Belgrade',
  originalEndTimeZone: 'Europe/Belgrade',
}
const graphUnknownZone = {
  ...graphEvent('graph-unknown-zone', 'Synthetic unknown-zone occurrence'),
  type: 'occurrence',
  seriesMasterId: 'synthetic-unknown-zone-series',
  originalStart: '2026-07-23T09:00:00.0000000',
  originalStartTimeZone: 'Synthetic/Unknown',
}
const graphDstGap = {
  ...graphEvent(
    'graph-dst-gap',
    'Synthetic DST-gap occurrence',
    '2026-03-29T09:00:00.000',
  ),
  type: 'occurrence',
  seriesMasterId: 'synthetic-dst-gap-series',
  originalStart: '2026-03-29T02:30:00.0000000',
  originalStartTimeZone: 'Europe/Belgrade',
}

test('compiled CLI isolates Google and Microsoft calendars across exact Realms', async () => {
  const sandbox = await createSandbox()
  const gmail = startMockGmail()
  const googleCalendar = startMockGoogleCalendar({
    'personal@example.test': [googleShared, googleRemoved],
  })
  const graph = startMockGraph({
    calendarEvents: {
      'work/calendar': [
        graphShared,
        graphRemoved,
        graphUnknownZone,
        graphDstGap,
      ],
    },
    tokenScopes: 'Calendars.Read Mail.ReadWrite User.Read',
  })
  const bin = await installLoopbackBrowser(sandbox.dir)
  const baseEnv = graph.env(
    sandbox,
    googleCalendar.env(
      sandbox,
      gmail.env(sandbox, {
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        CTXINDEX_LOOPBACK_TIMEOUT_SECS: '5',
        CTXINDEX_GOOGLE_CLIENT_ID: 'public-client-id',
        CTXINDEX_GOOGLE_CLIENT_SECRET: 'client-secret-canary',
      }),
    ),
  )
  const googleAuthEnv = {
    ...baseEnv,
    CTXINDEX_OAUTH_MOCK_BASE_URL: gmail.baseUrl,
  }
  const microsoftAuthEnv = {
    ...baseEnv,
    CTXINDEX_OAUTH_MOCK_BASE_URL: graph.baseUrl,
  }

  try {
    for (const command of [
      ['init'],
      ['realm', 'add', 'personal'],
      ['realm', 'add', 'work'],
    ]) {
      const result = await sandbox.run(command, { env: baseEnv })
      expect(result.exitCode, result.stderr).toBe(0)
    }

    const googleClient = await sandbox.run(
      ['client', 'add', 'google', '--from-env'],
      { env: googleAuthEnv },
    )
    expect(googleClient.exitCode, googleClient.stderr).toBe(0)
    const googleAuth = await sandbox.run(
      ['account', 'add', 'google', '--label', 'personal-google'],
      { env: googleAuthEnv },
    )
    expect(googleAuth.exitCode, googleAuth.stderr).toBe(0)
    const microsoftClient = await sandbox.run(
      ['client', 'add', 'microsoft', '--from-env'],
      { env: microsoftAuthEnv },
    )
    expect(microsoftClient.exitCode, microsoftClient.stderr).toBe(0)
    const microsoftAuth = await sandbox.run(
      ['account', 'add', 'microsoft', '--label', 'work-microsoft'],
      { env: microsoftAuthEnv },
    )
    expect(microsoftAuth.exitCode, microsoftAuth.stderr).toBe(0)

    const database = new Database(
      join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite'),
      { readonly: true },
    )
    const grants = database
      .query('SELECT provider, scopes_json FROM grants ORDER BY provider')
      .all() as { provider: string; scopes_json: string }[]
    database.close()
    expect(grants.map(({ provider }) => provider)).toEqual([
      'google',
      'microsoft',
    ])
    const googleScopes = JSON.parse(
      grants[0]?.scopes_json ?? 'null',
    ) as string[]
    expect(googleScopes).toContain(
      'https://www.googleapis.com/auth/calendar.events.readonly',
    )
    expect(googleScopes).not.toContain(
      'https://www.googleapis.com/auth/calendar.events',
    )
    expect(JSON.parse(grants[1]?.scopes_json ?? 'null')).toEqual([
      'Calendars.Read',
      'Mail.ReadWrite',
      'User.Read',
    ])

    const addCalendar = async (
      adapter: 'google.calendar' | 'microsoft.calendar',
      realm: 'personal' | 'work',
      account: string,
      label: string,
      calendarId: string,
      futureDays?: number,
    ): Promise<string> => {
      const result = await sandbox.run(
        [
          'source',
          'add',
          adapter,
          '--realm',
          realm,
          '--account',
          account,
          '--label',
          label,
          '--config-calendar-id',
          calendarId,
          ...(futureDays === undefined
            ? []
            : ['--config-future-days', String(futureDays)]),
        ],
        { env: baseEnv },
      )
      expect(result.exitCode, result.stderr).toBe(0)
      return parseSourceId(result.stdout)
    }

    const googleSourceLabel = 'personal-google-calendar'
    const googleSource = await addCalendar(
      'google.calendar',
      'personal',
      'personal-google',
      googleSourceLabel,
      'personal@example.test',
    )
    const graphSourceLabel = 'work-microsoft-calendar'
    const graphSource = await addCalendar(
      'microsoft.calendar',
      'work',
      'work-microsoft',
      graphSourceLabel,
      'work/calendar',
    )

    const inventoryResult = await sandbox.run(['account', 'list', '--json'], {
      env: baseEnv,
    })
    expect(inventoryResult.exitCode, inventoryResult.stderr).toBe(0)
    expect(inventoryResult.stdout).not.toContain('canary')
    const inventory = JSON.parse(inventoryResult.stdout) as {
      provider: string
      label: string
    }[]
    expect(inventory.map(({ provider }) => provider).sort()).toEqual([
      'google',
      'microsoft',
    ])
    expect(inventory.map(({ label }) => label).sort()).toEqual([
      'personal-google',
      'work-microsoft',
    ])
    const sources = JSON.parse(
      (await sandbox.run(['source', 'list', '--json'], { env: baseEnv }))
        .stdout,
    ) as { label: string }[]
    expect(sources.map(({ label }) => label)).toEqual([
      googleSourceLabel,
      graphSourceLabel,
    ])

    gmail.resetRequests()
    googleCalendar.resetRequests()
    graph.resetRequests()
    for (const [source, expectedAdded] of [
      [googleSourceLabel, 2],
      [graphSourceLabel, 4],
    ] as const) {
      const result = await sandbox.run(['sync', '--source', source, '--json'], {
        env: baseEnv,
      })
      if (result.exitCode !== 0)
        throw new Error(
          `Calendar sync failed: ${result.stderr}\n${result.stdout}\n${JSON.stringify(graph.readRequests())}`,
        )
      expect(syncRun(result.stdout)).toMatchObject({
        added: expectedAdded,
        updated: 0,
        deleted: 0,
        ...(source === graphSourceLabel
          ? {
              warningsCount: 2,
              warnings: [
                expect.objectContaining({
                  code: 'microsoft_calendar_unresolved_series_start',
                }),
                expect.objectContaining({
                  code: 'microsoft_calendar_unresolved_series_start',
                }),
              ],
            }
          : {}),
      })
    }

    const allSearch = await sandbox.run(
      ['search', 'Cross-provider planning', '--kind', 'events', '--json'],
      { env: baseEnv },
    )
    expect(allSearch.exitCode, allSearch.stderr).toBe(0)
    const allResults = JSON.parse(allSearch.stdout).results as {
      ref: string
      sourceId: string
    }[]
    expect(allResults).toHaveLength(2)
    expect(new Set(allResults.map(({ sourceId }) => sourceId))).toEqual(
      new Set([googleSource, graphSource]),
    )
    const googleRef = `ctx://${googleSource}/event/${encodeURIComponent(sharedEventId)}`
    const graphRef = `ctx://${graphSource}/event/${encodeURIComponent(sharedEventId)}`
    expect(allResults.map(({ ref }) => ref).sort()).toEqual(
      [googleRef, graphRef].sort(),
    )

    for (const [realm, sourceId, ref, provider] of [
      ['personal', googleSource, googleRef, 'google'],
      ['work', graphSource, graphRef, 'microsoft'],
    ] as const) {
      const searched = await sandbox.run(
        [
          'search',
          'Cross-provider planning',
          '--realm',
          realm,
          '--kind',
          'events',
          '--json',
        ],
        { env: baseEnv },
      )
      expect(searched.exitCode, searched.stderr).toBe(0)
      expect(JSON.parse(searched.stdout).results).toEqual([
        expect.objectContaining({ ref, sourceId }),
      ])
      const got = await sandbox.run(['get', '--json', ref], { env: baseEnv })
      expect(got.exitCode, got.stderr).toBe(0)
      expect(JSON.parse(got.stdout).resource).toMatchObject({
        ref,
        sourceId,
        payload: { provider, providerEventId: sharedEventId },
      })
      if (provider === 'microsoft') {
        expect(JSON.parse(got.stdout).resource.payload).toMatchObject({
          timing: {
            startTimeZone: 'Europe/London',
            endTimeZone: 'Europe/London',
          },
          series: {
            providerEventId: 'synthetic-windows-series',
            ref: `ctx://${graphSource}/event/synthetic-windows-series`,
            originalStart: {
              kind: 'timed',
              at: '2026-07-20T08:00:00.000Z',
              timeZone: 'Europe/London',
            },
          },
        })
      }
    }

    const zoneSearch = await sandbox.run(
      [
        'search',
        'Cross-provider planning',
        '--kind',
        'events',
        '--field',
        'startTimeZone=Europe/London',
        '--json',
      ],
      { env: baseEnv },
    )
    expect(zoneSearch.exitCode, zoneSearch.stderr).toBe(0)
    expect(JSON.parse(zoneSearch.stdout).results).toEqual([
      expect.objectContaining({ ref: graphRef, sourceId: graphSource }),
    ])

    for (const id of ['graph-unknown-zone', 'graph-dst-gap']) {
      const got = await sandbox.run(
        ['get', '--json', `ctx://${graphSource}/event/${id}`],
        { env: baseEnv },
      )
      expect(got.exitCode, got.stderr).toBe(0)
      expect(JSON.parse(got.stdout).resource.payload).not.toHaveProperty(
        'series',
      )
    }

    googleCalendar.upsertEvent('personal@example.test', {
      ...googleShared,
      summary: 'Cross-provider planning updated',
    })
    googleCalendar.upsertEvent('personal@example.test', {
      ...googleShared,
      id: 'google-added',
      summary: 'Personal added event',
    })
    googleCalendar.cancelEvent('personal@example.test', googleRemoved.id)
    graph.setCalendarEvents('work/calendar', [
      {
        ...graphShared,
        subject: 'Cross-provider planning updated',
        bodyPreview: 'Cross-provider planning updated preview',
        body: {
          contentType: 'text',
          content: 'Cross-provider planning updated body',
        },
      },
      graphEvent('graph-added', 'Work added event'),
      graphEvent(
        'far-future',
        'Far future work event',
        '2035-07-20T09:00:00.000',
      ),
    ])
    for (const source of [googleSourceLabel, graphSourceLabel]) {
      const result = await sandbox.run(['sync', '--source', source, '--json'], {
        env: baseEnv,
      })
      expect(result.exitCode, result.stderr).toBe(0)
      expect(syncRun(result.stdout)).toMatchObject({
        added: 1,
        updated: 1,
        deleted: source === graphSourceLabel ? 3 : 1,
      })
    }

    const wideGraphSource = await addCalendar(
      'microsoft.calendar',
      'work',
      'work-microsoft',
      'wide-microsoft-calendar',
      'work/calendar',
      4_000,
    )
    const wideSync = await sandbox.run(
      ['sync', '--source', 'wide-microsoft-calendar', '--json'],
      { env: baseEnv },
    )
    expect(wideSync.exitCode, wideSync.stderr).toBe(0)
    expect(syncRun(wideSync.stdout)).toMatchObject({
      added: 3,
      updated: 0,
      deleted: 0,
    })
    const wideSearch = await sandbox.run(
      ['search', 'Far future work event', '--realm', 'work', '--json'],
      { env: baseEnv },
    )
    expect(wideSearch.exitCode, wideSearch.stderr).toBe(0)
    expect(JSON.parse(wideSearch.stdout).results).toEqual([
      expect.objectContaining({ sourceId: wideGraphSource }),
    ])

    const googleRequests = googleCalendar.readRequests()
    expect(googleRequests.length).toBeGreaterThan(0)
    expect(googleRequests.every(({ method }) => method === 'GET')).toBe(true)
    const graphCalendarRequests = graph
      .readRequests()
      .filter(({ pathname }) => pathname.includes('calendar'))
    expect(graphCalendarRequests.length).toBeGreaterThan(0)
    expect(graphCalendarRequests.every(({ method }) => method === 'GET')).toBe(
      true,
    )
    expect(
      graphCalendarRequests.every(
        ({ pathname }) =>
          pathname.startsWith('/v1.0/me/calendars/') &&
          !pathname.includes('/beta/'),
      ),
    ).toBe(true)
    expect(gmail.readRequests()).toEqual([])

    for (const source of [googleSourceLabel, graphSourceLabel]) {
      const googleBefore = googleCalendar.readRequests().length
      const graphBefore = graph.readRequests().length
      const unknownAction = await sandbox.run(
        [
          'action',
          'run',
          'calendar.event.create',
          '--source',
          source,
          '--input',
          '{}',
          '--json',
        ],
        { env: baseEnv },
      )
      expect(unknownAction.exitCode).toBe(2)
      expect(unknownAction.stderr).toContain('Unknown Action')
      expect(googleCalendar.readRequests()).toHaveLength(googleBefore)
      expect(graph.readRequests()).toHaveLength(graphBefore)
    }
  } finally {
    graph.stop()
    googleCalendar.stop()
    gmail.stop()
    await sandbox.cleanup()
  }
}, 30_000)
