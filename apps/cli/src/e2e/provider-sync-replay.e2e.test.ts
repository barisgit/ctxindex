import { expect, test } from 'bun:test'
import { createSandbox } from '@ctxindex/core/testing'
import { startMockGmail } from './_mock-gmail'
import {
  type MockGoogleCalendarRequest,
  startMockGoogleCalendar,
} from './_mock-google-calendar'
import { type MockGraphRequest, startMockGraph } from './_mock-graph'
import { installLoopbackBrowser } from './_oauth-account'
import {
  type ProviderSyncReplayDriver,
  type ReplayPhase,
  runProviderSyncReplay,
} from './_provider-sync-replay.test'
import {
  googleCalendarReplay,
  microsoftCalendarReplay,
  replayEventIds,
} from './fixtures/provider-sync-replay'

function params(request: { readonly search: string }): URLSearchParams {
  return new URLSearchParams(request.search)
}

function expectGoogleRequests(
  phase: ReplayPhase,
  requests: readonly MockGoogleCalendarRequest[],
): void {
  expect(
    requests.every(
      ({ method, pathname, authorization }) =>
        method === 'GET' &&
        pathname ===
          '/calendar/v3/calendars/replay-calendar%40example.test/events' &&
        authorization === 'Bearer [REDACTED]',
    ),
  ).toBe(true)
  const expectedCounts: Record<ReplayPhase, number> = {
    initial: 2,
    unchanged: 1,
    mutation: 2,
    repeatedMutation: 1,
    recovery: 3,
    postRecovery: 1,
  }
  expect(requests).toHaveLength(expectedCounts[phase])

  if (phase === 'initial') {
    expect(
      params(requests[0] as MockGoogleCalendarRequest).has('syncToken'),
    ).toBe(false)
    expect(
      params(requests[1] as MockGoogleCalendarRequest).has('pageToken'),
    ).toBe(true)
  } else if (phase === 'recovery') {
    expect(
      params(requests[0] as MockGoogleCalendarRequest).has('syncToken'),
    ).toBe(true)
    expect(
      params(requests[1] as MockGoogleCalendarRequest).has('syncToken'),
    ).toBe(false)
    expect(
      params(requests[1] as MockGoogleCalendarRequest).has('pageToken'),
    ).toBe(false)
    expect(
      params(requests[2] as MockGoogleCalendarRequest).has('pageToken'),
    ).toBe(true)
  } else {
    expect(requests.every((request) => params(request).has('syncToken'))).toBe(
      true,
    )
  }
}

function expectMicrosoftRequests(
  phase: ReplayPhase,
  requests: readonly MockGraphRequest[],
): void {
  expect(
    requests.every(
      ({ method, pathname, authorization, prefer }) =>
        method === 'GET' &&
        pathname === '/v1.0/me/calendarView/delta' &&
        authorization === 'Bearer [REDACTED]' &&
        prefer?.includes('IdType="ImmutableId"') === true &&
        prefer.includes('outlook.timezone="UTC"'),
    ),
  ).toBe(true)
  const expectedCounts: Record<ReplayPhase, number> = {
    initial: 2,
    unchanged: 1,
    mutation: 2,
    repeatedMutation: 1,
    recovery: 3,
    postRecovery: 1,
  }
  expect(requests).toHaveLength(expectedCounts[phase])

  const isDelta = (request: MockGraphRequest) =>
    params(request).has('$deltatoken')
  const isContinuation = (request: MockGraphRequest) =>
    params(request).has('$skiptoken')
  if (phase === 'initial') {
    expect(isDelta(requests[0] as MockGraphRequest)).toBe(false)
    expect(isContinuation(requests[1] as MockGraphRequest)).toBe(true)
  } else if (phase === 'recovery') {
    expect(isDelta(requests[0] as MockGraphRequest)).toBe(true)
    expect(isDelta(requests[1] as MockGraphRequest)).toBe(false)
    expect(isContinuation(requests[1] as MockGraphRequest)).toBe(false)
    expect(isContinuation(requests[2] as MockGraphRequest)).toBe(true)
  } else if (phase === 'mutation') {
    expect(isDelta(requests[0] as MockGraphRequest)).toBe(true)
    expect(isContinuation(requests[1] as MockGraphRequest)).toBe(true)
  } else {
    expect(isDelta(requests[0] as MockGraphRequest)).toBe(true)
  }
}

test('replays the shared persisted sync lifecycle for Google Calendar', async () => {
  const sandbox = await createSandbox()
  const oauth = startMockGmail()
  const calendarId = 'replay-calendar@example.test'
  const calendar = startMockGoogleCalendar(
    { [calendarId]: googleCalendarReplay.initial },
    { pageSize: 2 },
  )
  let rejectedSyncToken: string | null = null
  try {
    const bin = await installLoopbackBrowser(sandbox.dir)
    const env = calendar.env(
      sandbox,
      oauth.env(sandbox, {
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        CTXINDEX_LOOPBACK_TIMEOUT_SECS: '5',
        CTXINDEX_GOOGLE_CLIENT_ID: 'provider-replay-client',
        CTXINDEX_GOOGLE_CLIENT_SECRET: 'synthetic-secret-canary',
      }),
    )
    const driver: ProviderSyncReplayDriver<MockGoogleCalendarRequest> = {
      provider: 'google',
      adapterId: 'google.calendar',
      accountLabel: 'google-replay-account',
      sourceLabel: 'google-replay-calendar',
      sourceConfigArgs: [
        '--config-calendar-id',
        calendarId,
        '--config-past-days',
        '36500',
        '--config-future-days',
        '36500',
      ],
      env,
      eventIds: replayEventIds,
      updatedTitle: googleCalendarReplay.updatedTitle,
      invalidationWarning: 'google_calendar_sync_token_invalid',
      resetRequests: () => calendar.resetRequests(),
      readRequests: () => calendar.readRequests(),
      inspectRequests(phase, requests) {
        expectGoogleRequests(phase, requests)
        if (phase === 'recovery') {
          rejectedSyncToken = params(
            requests[0] as MockGoogleCalendarRequest,
          ).get('syncToken')
          expect(rejectedSyncToken).not.toBeNull()
        }
        if (phase === 'postRecovery') {
          expect(
            params(requests[0] as MockGoogleCalendarRequest).get('syncToken'),
          ).not.toBe(rejectedSyncToken)
        }
      },
      applyMutation() {
        calendar.upsertEvent(calendarId, googleCalendarReplay.updated)
        calendar.cancelEvent(calendarId, replayEventIds.removed)
        calendar.upsertEvent(calendarId, googleCalendarReplay.added)
      },
      advanceCursorGeneration: () =>
        calendar.upsertEvent(calendarId, googleCalendarReplay.unchanged),
      expireCursor: () =>
        calendar.invalidateNextSyncTokenPermanently(calendarId),
    }
    await runProviderSyncReplay(sandbox, driver)
  } finally {
    calendar.stop()
    oauth.stop()
    await sandbox.cleanup()
  }
}, 30_000)

test('replays the shared persisted sync lifecycle for default Microsoft Calendar', async () => {
  const sandbox = await createSandbox()
  const graph = startMockGraph({
    calendarEvents: { default: microsoftCalendarReplay.initial },
    tokenScopes: 'Calendars.Read Mail.ReadWrite User.Read',
  })
  let rejectedDeltaToken: string | null = null
  try {
    const bin = await installLoopbackBrowser(sandbox.dir)
    const env = graph.env(sandbox, {
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      CTXINDEX_LOOPBACK_TIMEOUT_SECS: '5',
    })
    const driver: ProviderSyncReplayDriver<MockGraphRequest> = {
      provider: 'microsoft',
      adapterId: 'microsoft.calendar',
      accountLabel: 'microsoft-replay-account',
      sourceLabel: 'microsoft-replay-calendar',
      sourceConfigArgs: [
        '--config-past-days',
        '36500',
        '--config-future-days',
        '36500',
      ],
      env,
      eventIds: replayEventIds,
      updatedTitle: microsoftCalendarReplay.updatedTitle,
      invalidationWarning: 'microsoft_calendar_delta_expired',
      resetRequests: () => graph.resetRequests(),
      readRequests: () => graph.readRequests(),
      inspectRequests(phase, requests) {
        expectMicrosoftRequests(phase, requests)
        if (phase === 'recovery') {
          rejectedDeltaToken = params(requests[0] as MockGraphRequest).get(
            '$deltatoken',
          )
          expect(rejectedDeltaToken).not.toBeNull()
        }
        if (phase === 'postRecovery') {
          expect(
            params(requests[0] as MockGraphRequest).get('$deltatoken'),
          ).not.toBe(rejectedDeltaToken)
        }
      },
      applyMutation: () =>
        graph.setCalendarEvents('default', microsoftCalendarReplay.mutated),
      advanceCursorGeneration: () =>
        graph.setCalendarEvents('default', microsoftCalendarReplay.mutated),
      expireCursor: () => graph.invalidateNextDefaultCalendarDeltaPermanently(),
    }
    await runProviderSyncReplay(sandbox, driver)
  } finally {
    graph.stop()
    await sandbox.cleanup()
  }
}, 30_000)
