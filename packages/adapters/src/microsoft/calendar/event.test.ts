import { describe, expect, test } from 'bun:test'
import { calendarEventSchema } from '@ctxindex/profiles'
import {
  microsoftCalendarEventSchema,
  normalizeMicrosoftCalendarEvent,
} from './event'

const sourceId = '01J00000000000000000000000'

describe('Microsoft Calendar event normalization', () => {
  test('treats an unknown future Graph event type as absent', () => {
    expect(
      microsoftCalendarEventSchema.parse({
        id: 'future-type',
        type: 'futureSeriesVariant',
      }).type,
    ).toBeUndefined()

    const result = normalizeMicrosoftCalendarEvent(
      {
        id: 'future-type',
        type: 'futureSeriesVariant',
        start: { dateTime: '2026-07-16T09:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2026-07-16T10:00:00Z', timeZone: 'UTC' },
      },
      sourceId,
      'default',
    )

    expect(result.warnings).toEqual([])
    expect(result.resource?.payload).toMatchObject({
      providerEventId: 'future-type',
      timing: {
        kind: 'timed',
        start: '2026-07-16T09:00:00.000Z',
        end: '2026-07-16T10:00:00.000Z',
      },
    })
  })

  test('normalizes timed participants, status, recurrence, and series identity', () => {
    const result = normalizeMicrosoftCalendarEvent(
      {
        id: 'occurrence/1',
        subject: 'Planning',
        body: {
          contentType: 'html',
          content: '<p>Hello <b>world</b><script>bad()</script></p>',
        },
        start: { dateTime: '2026-07-16T07:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2026-07-16T08:00:00Z', timeZone: 'UTC' },
        originalStartTimeZone: 'Europe/Ljubljana',
        originalEndTimeZone: 'Europe/Ljubljana',
        organizer: {
          emailAddress: { name: 'Owner', address: 'owner@example.test' },
        },
        attendees: [
          {
            type: 'required',
            status: { response: 'accepted' },
            emailAddress: { name: 'Ada', address: 'ada@example.test' },
          },
        ],
        showAs: 'tentative',
        isCancelled: false,
        recurrence: {
          pattern: {
            type: 'weekly',
            interval: 2,
            daysOfWeek: ['monday', 'wednesday'],
          },
          range: {
            type: 'endDate',
            startDate: '2026-07-01',
            endDate: '2026-08-31',
          },
        },
        seriesMasterId: 'series/1',
        originalStart: '2026-07-16T07:00:00Z',
        webLink: 'https://outlook.office.com/calendar/item/1',
        createdDateTime: '2026-07-01T00:00:00Z',
        lastModifiedDateTime: '2026-07-15T00:00:00Z',
      },
      sourceId,
      'default',
    )
    expect(result.warnings).toEqual([])
    expect(calendarEventSchema.parse(result.resource?.payload)).toMatchObject({
      provider: 'microsoft',
      providerCalendarId: 'default',
      providerEventId: 'occurrence/1',
      timing: {
        kind: 'timed',
        start: '2026-07-16T07:00:00.000Z',
        end: '2026-07-16T08:00:00.000Z',
        startTimeZone: 'Europe/Ljubljana',
        endTimeZone: 'Europe/Ljubljana',
      },
      description: 'Hello world',
      status: 'tentative',
      attendees: [
        {
          displayName: 'Ada',
          email: 'ada@example.test',
          responseStatus: 'accepted',
        },
      ],
      recurrenceRules: [
        'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20260831',
      ],
      series: {
        providerEventId: 'series/1',
        ref: `${sourceId}/event/series%2F1`.replace(
          sourceId,
          `ctx://${sourceId}`,
        ),
        originalStart: {
          kind: 'timed',
          at: '2026-07-16T07:00:00.000Z',
          timeZone: 'Europe/Ljubljana',
        },
      },
    })
  })

  test('treats explicit Graph nulls on optional fields as absent (live evidence shape)', () => {
    const result = normalizeMicrosoftCalendarEvent(
      {
        id: 'single-instance-nulls',
        type: 'singleInstance',
        subject: 'Standup',
        bodyPreview: 'Daily sync',
        body: { contentType: 'html', content: '<p>Daily sync</p>' },
        isAllDay: false,
        start: { dateTime: '2025-09-11T08:00:00.0000000', timeZone: 'UTC' },
        end: { dateTime: '2025-09-11T08:30:00.0000000', timeZone: 'UTC' },
        seriesMasterId: null,
        recurrence: null,
        occurrenceId: null,
        originalStart: null,
        originalStartTimeZone: 'Greenwich Standard Time',
        originalEndTimeZone: null,
        organizer: null,
        attendees: null,
        location: { displayName: null },
        isCancelled: false,
        showAs: null,
        webLink: null,
        createdDateTime: null,
        lastModifiedDateTime: '2025-09-10T12:00:00Z',
      },
      sourceId,
      'default',
    )
    expect(result.warnings).toEqual([])
    expect(result.resource?.payload).toMatchObject({
      provider: 'microsoft',
      providerEventId: 'single-instance-nulls',
      timing: {
        kind: 'timed',
        start: '2025-09-11T08:00:00.000Z',
        end: '2025-09-11T08:30:00.000Z',
      },
      title: 'Standup',
      status: 'confirmed',
    })
    expect(result.resource?.payload).not.toHaveProperty('series')
  })

  test('uses a replayed unmodified occurrence start when Graph omits originalStart', () => {
    const result = normalizeMicrosoftCalendarEvent(
      {
        type: 'occurrence',
        id: 'REDACTED_OCCURRENCE_ID',
        start: {
          dateTime: '2026-07-13T10:00:00.0000000',
          timeZone: 'UTC',
        },
        end: {
          dateTime: '2026-07-13T11:00:00.0000000',
          timeZone: 'UTC',
        },
        seriesMasterId: 'REDACTED_SERIES_ID',
      },
      sourceId,
      'default',
    )

    expect(result.resource).toBeDefined()
    expect(result.warnings).toEqual([])
    expect(result.resource?.payload).toMatchObject({
      timing: {
        kind: 'timed',
        start: '2026-07-13T10:00:00.000Z',
        end: '2026-07-13T11:00:00.000Z',
        startTimeZone: 'UTC',
        endTimeZone: 'UTC',
      },
      series: {
        providerEventId: 'REDACTED_SERIES_ID',
        ref: `${sourceId}/event/REDACTED_SERIES_ID`.replace(
          sourceId,
          `ctx://${sourceId}`,
        ),
        originalStart: {
          kind: 'timed',
          at: '2026-07-13T10:00:00.000Z',
          timeZone: 'UTC',
        },
      },
    })
  })

  test('uses the current start zone for occurrence fallback even when the original zone is unknown', () => {
    const result = normalizeMicrosoftCalendarEvent(
      {
        type: 'occurrence',
        id: 'synthetic-occurrence-unknown-original-zone',
        start: { dateTime: '2026-07-13T10:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2026-07-13T11:00:00Z', timeZone: 'UTC' },
        originalStartTimeZone: 'Synthetic/Unknown',
        seriesMasterId: 'synthetic-series',
      },
      sourceId,
      'default',
    )

    expect(result.warnings).toEqual([])
    expect(result.resource?.payload).toMatchObject({
      timing: {
        start: '2026-07-13T10:00:00.000Z',
        end: '2026-07-13T11:00:00.000Z',
      },
      series: {
        providerEventId: 'synthetic-series',
        originalStart: {
          kind: 'timed',
          at: '2026-07-13T10:00:00.000Z',
          timeZone: 'UTC',
        },
      },
    })
    expect(result.resource?.payload).not.toHaveProperty('timing.startTimeZone')
  })

  test('does not substitute the moved start of an exception missing originalStart', () => {
    const result = normalizeMicrosoftCalendarEvent(
      {
        type: 'exception',
        id: 'synthetic-exception',
        start: { dateTime: '2026-07-13T12:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2026-07-13T13:00:00Z', timeZone: 'UTC' },
        seriesMasterId: 'synthetic-series',
      },
      sourceId,
      'default',
    )

    expect(result.resource?.payload).not.toHaveProperty('series')
    expect(result.warnings.map(({ code }) => code)).toEqual([
      'microsoft_calendar_unresolved_series_start',
    ])
  })

  test('uses an unmodified all-day occurrence date when Graph omits originalStart', () => {
    const result = normalizeMicrosoftCalendarEvent(
      {
        type: 'occurrence',
        id: 'synthetic-all-day-occurrence',
        isAllDay: true,
        start: {
          dateTime: '2026-07-13T00:00:00.0000000',
          timeZone: 'Pacific Standard Time',
        },
        end: {
          dateTime: '2026-07-14T00:00:00.0000000',
          timeZone: 'Pacific Standard Time',
        },
        seriesMasterId: 'synthetic-all-day-series',
      },
      sourceId,
      'default',
    )

    expect(result.warnings).toEqual([])
    expect(result.resource?.payload).toMatchObject({
      series: {
        providerEventId: 'synthetic-all-day-series',
        originalStart: { kind: 'all-day', date: '2026-07-13' },
      },
    })
  })

  test('resolves an all-day series date through a Windows provider zone', () => {
    const result = normalizeMicrosoftCalendarEvent(
      {
        id: 'all-day-windows-zone',
        isAllDay: true,
        start: {
          dateTime: '2026-07-13T00:00:00.0000000',
          timeZone: 'Pacific Standard Time',
        },
        end: {
          dateTime: '2026-07-14T00:00:00.0000000',
          timeZone: 'Pacific Standard Time',
        },
        seriesMasterId: 'all-day-series',
        originalStart: '2026-07-13T07:00:00Z',
        originalStartTimeZone: 'Pacific Standard Time',
      },
      sourceId,
      'team',
    )
    expect(result.warnings).toEqual([])
    expect(result.resource?.payload).toMatchObject({
      series: {
        providerEventId: 'all-day-series',
        originalStart: { kind: 'all-day', date: '2026-07-13' },
      },
    })
  })

  test('resolves a timed occurrence start through a Windows provider zone', () => {
    const result = normalizeMicrosoftCalendarEvent(
      {
        id: 'timed-windows-zone',
        isAllDay: false,
        start: {
          dateTime: '2026-07-13T09:00:00.0000000',
          timeZone: 'UTC',
        },
        end: {
          dateTime: '2026-07-13T10:00:00.0000000',
          timeZone: 'UTC',
        },
        seriesMasterId: 'timed-series',
        originalStart: '2026-07-13T02:00:00.0000000',
        originalStartTimeZone: 'Pacific Standard Time',
      },
      sourceId,
      'team',
    )
    expect(result.warnings).toEqual([])
    expect(result.resource?.payload).toMatchObject({
      series: {
        providerEventId: 'timed-series',
        originalStart: {
          kind: 'timed',
          at: '2026-07-13T09:00:00.000Z',
          timeZone: 'America/Los_Angeles',
        },
      },
    })
  })

  test('warns instead of resolving a nonexistent local occurrence start (DST gap)', () => {
    const result = normalizeMicrosoftCalendarEvent(
      {
        id: 'dst-gap-occurrence',
        isAllDay: false,
        start: {
          dateTime: '2026-03-08T10:30:00.0000000',
          timeZone: 'UTC',
        },
        end: {
          dateTime: '2026-03-08T11:30:00.0000000',
          timeZone: 'UTC',
        },
        seriesMasterId: 'timed-series',
        originalStart: '2026-03-08T02:30:00.0000000',
        originalStartTimeZone: 'Pacific Standard Time',
      },
      sourceId,
      'team',
    )
    expect(result.resource?.payload).not.toHaveProperty('series')
    expect(result.warnings.map(({ code }) => code)).toEqual([
      'microsoft_calendar_unresolved_series_start',
    ])
  })

  test('warns instead of guessing an all-day series date for an unresolvable provider zone', () => {
    const result = normalizeMicrosoftCalendarEvent(
      {
        id: 'all-day-unknown-zone',
        isAllDay: true,
        start: {
          dateTime: '2026-07-13T00:00:00.0000000',
          timeZone: 'Definitely Not A Zone',
        },
        end: {
          dateTime: '2026-07-14T00:00:00.0000000',
          timeZone: 'Definitely Not A Zone',
        },
        seriesMasterId: 'all-day-series',
        originalStart: '2026-07-13T07:00:00Z',
        originalStartTimeZone: 'Definitely Not A Zone',
      },
      sourceId,
      'team',
    )
    expect(result.resource?.payload).not.toHaveProperty('series')
    expect(result.warnings.map(({ code }) => code)).toEqual([
      'microsoft_calendar_unresolved_series_start',
    ])
  })

  test('preserves relative recurrence ordinals and all-day occurrence identity', () => {
    const result = normalizeMicrosoftCalendarEvent(
      {
        id: 'all-day-occurrence',
        isAllDay: true,
        start: {
          dateTime: '2026-07-13T00:00:00.0000000',
          timeZone: 'America/Los_Angeles',
        },
        end: {
          dateTime: '2026-07-14T00:00:00.0000000',
          timeZone: 'America/Los_Angeles',
        },
        recurrence: {
          pattern: {
            type: 'relativeMonthly',
            interval: 1,
            daysOfWeek: ['monday'],
            index: 'second',
          },
          range: { type: 'noEnd', startDate: '2026-01-01' },
        },
        seriesMasterId: 'all-day-series',
        originalStart: '2026-07-13T07:00:00Z',
        originalStartTimeZone: 'America/Los_Angeles',
      },
      sourceId,
      'team',
    )
    expect(result.warnings).toEqual([])
    expect(result.resource?.payload).toMatchObject({
      recurrenceRules: ['RRULE:FREQ=MONTHLY;INTERVAL=1;BYDAY=2MO'],
      series: {
        providerEventId: 'all-day-series',
        originalStart: { kind: 'all-day', date: '2026-07-13' },
      },
    })
  })

  test('warns when a Graph recurrence cannot be represented exactly', () => {
    const result = normalizeMicrosoftCalendarEvent(
      {
        id: 'unsupported-recurrence',
        start: { dateTime: '2026-07-16T07:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2026-07-16T08:00:00Z', timeZone: 'UTC' },
        recurrence: {
          pattern: {
            type: 'relativeMonthly',
            interval: 1,
            daysOfWeek: ['monday', 'tuesday'],
            index: 'first',
          },
          range: { type: 'noEnd', startDate: '2026-01-01' },
        },
      },
      sourceId,
      'team',
    )
    expect(result.resource).toBeDefined()
    expect(result.resource?.payload).not.toHaveProperty('recurrenceRules')
    expect(result.warnings.map(({ code }) => code)).toEqual([
      'microsoft_calendar_unsupported_recurrence',
    ])
  })

  test('normalizes all-day midnight date parts and cancellation', () => {
    const result = normalizeMicrosoftCalendarEvent(
      {
        id: 'all-day',
        isAllDay: true,
        isCancelled: true,
        start: {
          dateTime: '2026-07-16T00:00:00.0000000',
          timeZone: 'Pacific Standard Time',
        },
        end: {
          dateTime: '2026-07-18T00:00:00.0000000',
          timeZone: 'Pacific Standard Time',
        },
        showAs: 'free',
      },
      sourceId,
      'team',
    )
    expect(result.resource?.payload).toMatchObject({
      timing: {
        kind: 'all-day',
        startDate: '2026-07-16',
        endDate: '2026-07-18',
      },
      status: 'cancelled',
    })
  })

  test('retains usable malformed ids but skips malformed and removed payloads deterministically', () => {
    const malformed = normalizeMicrosoftCalendarEvent(
      {
        id: 'bad',
        start: { dateTime: 'nope', timeZone: 'UTC' },
        end: { dateTime: '2026-07-16T08:00:00Z', timeZone: 'UTC' },
      },
      sourceId,
      'default',
    )
    expect(malformed.providerEventId).toBe('bad')
    expect(malformed.resource).toBeUndefined()
    expect(malformed.warnings[0]?.code).toBe(
      'microsoft_calendar_malformed_event',
    )
    const removed = normalizeMicrosoftCalendarEvent(
      { id: 'gone', '@removed': { reason: 'deleted' } },
      sourceId,
      'default',
    )
    expect(removed).toMatchObject({
      providerEventId: 'gone',
      removed: true,
      warnings: [],
    })
    const noId = normalizeMicrosoftCalendarEvent(
      { subject: 'no id' },
      sourceId,
      'default',
    )
    expect(noId.providerEventId).toBeUndefined()
  })

  test('warns and omits unsafe links and inverted creation time', () => {
    const result = normalizeMicrosoftCalendarEvent(
      {
        id: 'warnings',
        start: { dateTime: '2026-07-16T07:00:00+00:00', timeZone: 'UTC' },
        end: { dateTime: '2026-07-16T08:00:00+00:00', timeZone: 'UTC' },
        webLink: 'http://example.test/event',
        createdDateTime: '2026-07-17T00:00:00Z',
        lastModifiedDateTime: '2026-07-16T00:00:00Z',
      },
      sourceId,
      'default',
    )
    expect(result.resource?.payload).not.toHaveProperty('providerUrl')
    expect(result.resource?.payload).not.toHaveProperty('createdAt')
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'microsoft_calendar_created_after_updated',
      'microsoft_calendar_unsafe_web_link',
    ])
  })
})
