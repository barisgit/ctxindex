import { describe, expect, test } from 'bun:test'
import { calendarEventRef } from '@ctxindex/profiles'
import { normalizeMicrosoftCalendarEvent } from './event'

const sourceId = '01J00000000000000000000000'
const calendarId = 'synthetic-calendar'

function timedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'synthetic-occurrence',
    subject: 'Invented calendar event',
    start: {
      dateTime: '2026-01-15T09:00:00.0000000',
      timeZone: 'GMT Standard Time',
    },
    end: {
      dateTime: '2026-01-15T10:00:00.0000000',
      timeZone: 'GMT Standard Time',
    },
    seriesMasterId: 'synthetic-series',
    originalStart: '2026-01-15T09:00:00.0000000',
    originalStartTimeZone: 'GMT Standard Time',
    originalEndTimeZone: 'GMT Standard Time',
    ...overrides,
  }
}

describe('Microsoft Calendar synthetic time-zone and series normalization', () => {
  test.each([
    {
      label: 'UTC',
      zone: 'UTC',
      expectedStart: '2026-07-15T09:00:00.123Z',
    },
    {
      label: 'IANA',
      zone: 'Europe/Belgrade',
      expectedStart: '2026-07-15T07:00:00.123Z',
    },
    {
      label: 'Windows',
      zone: 'GMT Standard Time',
      expectedStart: '2026-07-15T08:00:00.123Z',
    },
  ])('$label offset-less Graph datetimes preserve fractional milliseconds', (value) => {
    const normalized = normalizeMicrosoftCalendarEvent(
      timedEvent({
        start: {
          dateTime: '2026-07-15T09:00:00.1234567',
          timeZone: value.zone,
        },
        end: {
          dateTime: '2026-07-15T10:00:00.1234567',
          timeZone: value.zone,
        },
        originalStart: '2026-07-15T09:00:00.1234567',
        originalStartTimeZone: value.zone,
        originalEndTimeZone: value.zone,
      }),
      sourceId,
      calendarId,
    )

    expect(normalized.warnings).toEqual([])
    expect(normalized.resource?.payload).toMatchObject({
      timing: { kind: 'timed', start: value.expectedStart },
      series: {
        originalStart: { kind: 'timed', at: value.expectedStart },
      },
    })
  })

  test.each([
    {
      label: 'Windows',
      event: timedEvent(),
      zone: 'Europe/London',
      start: '2026-01-15T09:00:00.000Z',
    },
    {
      label: 'IANA',
      event: timedEvent({
        start: {
          dateTime: '2026-07-15T09:00:00.0000000',
          timeZone: 'Europe/Belgrade',
        },
        end: {
          dateTime: '2026-07-15T10:00:00.0000000',
          timeZone: 'Europe/Belgrade',
        },
        originalStart: '2026-07-15T09:00:00.0000000',
        originalStartTimeZone: 'Europe/Belgrade',
        originalEndTimeZone: 'Europe/Belgrade',
      }),
      zone: 'Europe/Belgrade',
      start: '2026-07-15T07:00:00.000Z',
    },
  ])('$label zones retain exact series identity in canonical form', (value) => {
    const normalized = normalizeMicrosoftCalendarEvent(
      value.event,
      sourceId,
      calendarId,
    )

    expect(normalized.warnings).toEqual([])
    expect(normalized.resource?.payload).toMatchObject({
      timing: {
        kind: 'timed',
        start: value.start,
        startTimeZone: value.zone,
        endTimeZone: value.zone,
      },
      series: {
        providerEventId: 'synthetic-series',
        ref: calendarEventRef(sourceId, 'synthetic-series'),
        originalStart: {
          kind: 'timed',
          at: value.start,
          timeZone: value.zone,
        },
      },
    })
  })

  test('an explicit-offset original start remains representable when its zone label is unknown', () => {
    const normalized = normalizeMicrosoftCalendarEvent(
      timedEvent({
        start: {
          dateTime: '2026-07-15T09:00:00+02:00',
          timeZone: 'Synthetic/Unknown',
        },
        end: {
          dateTime: '2026-07-15T10:00:00+02:00',
          timeZone: 'Synthetic/Unknown',
        },
        originalStart: '2026-07-15T09:00:00+02:00',
        originalStartTimeZone: 'Synthetic/Unknown',
        originalEndTimeZone: 'Synthetic/Unknown',
      }),
      sourceId,
      calendarId,
    )

    expect(normalized.warnings).toEqual([])
    expect(normalized.resource?.payload).toMatchObject({
      timing: {
        kind: 'timed',
        start: '2026-07-15T07:00:00.000Z',
        end: '2026-07-15T08:00:00.000Z',
      },
      series: {
        providerEventId: 'synthetic-series',
        originalStart: {
          kind: 'timed',
          at: '2026-07-15T07:00:00.000Z',
        },
      },
    })
    expect(normalized.resource?.payload).not.toHaveProperty(
      'timing.startTimeZone',
    )
    expect(normalized.resource?.payload).not.toHaveProperty(
      'series.originalStart.timeZone',
    )
  })

  test('the current event instant uses its own zone while retaining the canonical original display zone', () => {
    const normalized = normalizeMicrosoftCalendarEvent(
      timedEvent({
        start: {
          dateTime: '2026-07-15T09:00:00.0000000',
          timeZone: 'UTC',
        },
        end: {
          dateTime: '2026-07-15T10:00:00.0000000',
          timeZone: 'UTC',
        },
        originalStart: '2026-07-15T09:00:00.0000000',
        originalStartTimeZone: 'Europe/Belgrade',
        originalEndTimeZone: 'Europe/Belgrade',
      }),
      sourceId,
      calendarId,
    )

    expect(normalized.warnings).toEqual([])
    expect(normalized.resource?.payload).toMatchObject({
      timing: {
        start: '2026-07-15T09:00:00.000Z',
        end: '2026-07-15T10:00:00.000Z',
        startTimeZone: 'Europe/Belgrade',
        endTimeZone: 'Europe/Belgrade',
      },
      series: {
        originalStart: {
          at: '2026-07-15T07:00:00.000Z',
          timeZone: 'Europe/Belgrade',
        },
      },
    })
  })

  test.each([
    {
      label: 'unknown required zone',
      originalStart: '2026-07-15T09:00:00.0000000',
      originalStartTimeZone: 'Synthetic/Unknown',
    },
    {
      label: 'DST-gap local time',
      originalStart: '2026-03-29T02:30:00.0000000',
      originalStartTimeZone: 'Europe/Belgrade',
    },
  ])('$label omits series and emits the stable warning', (value) => {
    const normalized = normalizeMicrosoftCalendarEvent(
      timedEvent({
        originalStart: value.originalStart,
        originalStartTimeZone: value.originalStartTimeZone,
      }),
      sourceId,
      calendarId,
    )

    expect(normalized.resource?.payload).not.toHaveProperty('series')
    expect(normalized.warnings).toEqual([
      expect.objectContaining({
        code: 'microsoft_calendar_unresolved_series_start',
      }),
    ])
  })

  test('all-day occurrence retains its local original date', () => {
    const normalized = normalizeMicrosoftCalendarEvent(
      {
        id: 'synthetic-all-day-occurrence',
        isAllDay: true,
        start: {
          dateTime: '2026-07-15T00:00:00.0000000',
          timeZone: 'W. Europe Standard Time',
        },
        end: {
          dateTime: '2026-07-16T00:00:00.0000000',
          timeZone: 'W. Europe Standard Time',
        },
        seriesMasterId: 'synthetic-all-day-series',
        originalStart: '2026-07-14T22:00:00Z',
        originalStartTimeZone: 'W. Europe Standard Time',
      },
      sourceId,
      calendarId,
    )

    expect(normalized.warnings).toEqual([])
    expect(normalized.resource?.payload).toMatchObject({
      timing: {
        kind: 'all-day',
        startDate: '2026-07-15',
        endDate: '2026-07-16',
      },
      series: {
        providerEventId: 'synthetic-all-day-series',
        originalStart: { kind: 'all-day', date: '2026-07-15' },
      },
    })
  })

  test('null or absent optional fields remain absent while malformed input stays bounded', () => {
    for (const event of [
      timedEvent({
        seriesMasterId: null,
        originalStart: null,
        originalStartTimeZone: null,
        originalEndTimeZone: null,
        recurrence: null,
      }),
      timedEvent({
        seriesMasterId: undefined,
        originalStart: undefined,
        originalStartTimeZone: undefined,
        originalEndTimeZone: undefined,
      }),
    ]) {
      const normalized = normalizeMicrosoftCalendarEvent(
        event,
        sourceId,
        calendarId,
      )
      expect(normalized.warnings).toEqual([])
      expect(normalized.resource?.payload).not.toHaveProperty('series')
    }

    const malformed = normalizeMicrosoftCalendarEvent(
      { id: 'synthetic-malformed', start: { dateTime: 42 } },
      sourceId,
      calendarId,
    )
    expect(malformed.resource).toBeUndefined()
    expect(malformed).toMatchObject({
      providerEventId: 'synthetic-malformed',
      warnings: [{ code: 'microsoft_calendar_malformed_event' }],
    })
  })
})
