import { afterEach, describe, expect, test } from 'bun:test'
import { resetEnvForTests } from '@ctxindex/core/config'
import { CtxindexSyncError } from '@ctxindex/core/errors'
import {
  GoogleCalendarSyncTokenInvalidError,
  googleCalendarEventsPage,
  googleCalendarJson,
} from './response'
import { googleCalendarApiUrl } from './url'

const originalNodeEnv = process.env.NODE_ENV
const originalMock = process.env.CTXINDEX_GOOGLE_CALENDAR_MOCK_BASE_URL

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalNodeEnv
  if (originalMock === undefined)
    delete process.env.CTXINDEX_GOOGLE_CALENDAR_MOCK_BASE_URL
  else process.env.CTXINDEX_GOOGLE_CALENDAR_MOCK_BASE_URL = originalMock
  resetEnvForTests()
})

describe('Google Calendar response and egress', () => {
  test('validates page token fields while retaining event items for item-level validation', async () => {
    await expect(
      googleCalendarEventsPage(
        new Response(
          JSON.stringify({ items: [{ id: 'one' }], nextPageToken: 'p2' }),
        ),
      ),
    ).resolves.toEqual({ items: [{ id: 'one' }], nextPageToken: 'p2' })
    await expect(
      googleCalendarEventsPage(
        new Response(JSON.stringify({ items: [], nextPageToken: 2 })),
      ),
    ).rejects.toMatchObject({ code: 'provider_bad_response' })
  })

  test.each([
    [401, 'auth_expired'],
    [403, 'permission_denied'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [500, 'provider_unavailable'],
    [400, 'provider_bad_response'],
  ])('maps HTTP %i to %s', async (status, code) => {
    await expect(
      googleCalendarEventsPage(new Response('', { status })),
    ).rejects.toMatchObject({ code })
  })

  test('keeps sync-token invalidation internal', async () => {
    await expect(
      googleCalendarEventsPage(new Response('', { status: 410 })),
    ).rejects.toBeInstanceOf(GoogleCalendarSyncTokenInvalidError)
    await expect(
      googleCalendarJson(new Response('', { status: 410 })),
    ).rejects.toMatchObject({ code: 'provider_bad_response' })
  })

  test('uses only production Google host or explicit loopback nonproduction mock base', () => {
    delete process.env.CTXINDEX_GOOGLE_CALENDAR_MOCK_BASE_URL
    process.env.NODE_ENV = 'test'
    resetEnvForTests()
    expect(googleCalendarApiUrl('/calendar/v3/calendars/primary/events')).toBe(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    )

    process.env.CTXINDEX_GOOGLE_CALENDAR_MOCK_BASE_URL =
      'http://127.0.0.1:4321/google/'
    resetEnvForTests()
    expect(googleCalendarApiUrl('/calendar/v3/calendars/primary/events')).toBe(
      'http://127.0.0.1:4321/google/calendar/v3/calendars/primary/events',
    )

    process.env.CTXINDEX_GOOGLE_CALENDAR_MOCK_BASE_URL = 'https://example.test'
    resetEnvForTests()
    expect(() => googleCalendarApiUrl('/calendar/v3')).toThrow(
      CtxindexSyncError,
    )

    process.env.NODE_ENV = 'production'
    process.env.CTXINDEX_GOOGLE_CALENDAR_MOCK_BASE_URL = 'http://127.0.0.1:4321'
    resetEnvForTests()
    expect(googleCalendarApiUrl('/calendar/v3')).toBe(
      'https://www.googleapis.com/calendar/v3',
    )
  })
})
