import { describe, expect, test } from 'bun:test'
import {
  calendarEventProfile,
  calendarEventRef,
  calendarEventSchema,
  canonicalizeIanaTimeZone,
} from './calendar-event'

const sourceId = '01KXHBNECDAH1T4MJ38X88EPFJ'

const timedPayload = {
  provider: 'google',
  providerCalendarId: 'primary',
  providerEventId: 'Event/Case',
  timing: {
    kind: 'timed' as const,
    start: '2026-07-20T09:00:00+02:00',
    end: '2026-07-20T10:30:00+02:00',
    startTimeZone: 'Europe/Ljubljana',
    endTimeZone: 'Europe/Ljubljana',
  },
  title: 'Roadmap review',
  description: 'Review the launch roadmap.',
  location: 'Room 1',
  status: 'confirmed' as const,
  organizer: {
    displayName: 'Ada Lovelace',
    email: 'ada@example.com',
    self: true,
  },
  attendees: [
    {
      displayName: 'Grace Hopper',
      email: 'grace@example.com',
      responseStatus: 'accepted' as const,
    },
  ],
  recurrenceRules: ['RRULE:FREQ=WEEKLY;COUNT=4'],
  providerUrl: 'https://calendar.google.com/calendar/event?eid=opaque',
  createdAt: '2026-07-01T08:00:00Z',
  updatedAt: '2026-07-16T10:00:00Z',
}

describe('calendarEventProfile', () => {
  test('canonicalizes known IANA links and rejects aliases in Profile payloads', () => {
    expect(canonicalizeIanaTimeZone('US/Pacific')).toBe('America/Los_Angeles')
    expect(canonicalizeIanaTimeZone('Europe/Kiev')).toBe('Europe/Kyiv')
    expect(canonicalizeIanaTimeZone('Etc/UTC')).toBe('UTC')
    expect(canonicalizeIanaTimeZone('America/Godthab')).toBe('America/Nuuk')
    expect(canonicalizeIanaTimeZone('Asia/Katmandu')).toBe('Asia/Kathmandu')
    expect(canonicalizeIanaTimeZone('Africa/Asmera')).toBe('Africa/Asmara')
    expect(canonicalizeIanaTimeZone('America/Nuuk')).toBe('America/Nuuk')
    expect(canonicalizeIanaTimeZone('Asia/Kathmandu')).toBe('Asia/Kathmandu')
    expect(canonicalizeIanaTimeZone('Europe/Ljubljana')).toBe(
      'Europe/Ljubljana',
    )
    expect(canonicalizeIanaTimeZone('Synthetic/Unknown')).toBeUndefined()

    expect(() =>
      calendarEventSchema.parse({
        ...timedPayload,
        timing: { ...timedPayload.timing, startTimeZone: 'US/Pacific' },
      }),
    ).toThrow()
    expect(() =>
      calendarEventSchema.parse({
        ...timedPayload,
        series: {
          providerEventId: 'series',
          ref: calendarEventRef(sourceId, 'series'),
          originalStart: {
            kind: 'timed',
            at: '2026-07-20T09:00:00Z',
            timeZone: 'Etc/UTC',
          },
        },
      }),
    ).toThrow()
  })

  test('validates and deterministically projects a timed Calendar Event', () => {
    const parsed = calendarEventSchema.parse(timedPayload)
    const fields = Object.fromEntries(
      Object.entries(calendarEventProfile.search?.fields ?? {}).map(
        ([name, field]) => [name, field.extract(parsed)],
      ),
    )

    expect(calendarEventProfile.id).toBe('calendar.event')
    expect(calendarEventProfile.version).toBe(1)
    expect(calendarEventProfile.search?.title?.(parsed)).toBe('Roadmap review')
    expect(calendarEventProfile.search?.summary?.(parsed)).toBe(
      'Review the launch roadmap.',
    )
    expect(calendarEventProfile.search?.occurredAt?.(parsed)).toEqual(
      new Date('2026-07-20T07:00:00.000Z'),
    )
    expect(calendarEventProfile.search?.chunks?.(parsed)).toEqual([
      'Roadmap review',
      'Review the launch roadmap.',
      'Room 1',
      'Ada Lovelace <ada@example.com>\nGrace Hopper <grace@example.com>',
    ])
    expect(fields).toEqual({
      provider: 'google',
      calendarId: 'primary',
      eventId: 'Event/Case',
      title: 'Roadmap review',
      status: 'confirmed',
      allDay: false,
      startsAt: new Date('2026-07-20T07:00:00.000Z'),
      endsAt: new Date('2026-07-20T08:30:00.000Z'),
      startTimeZone: 'Europe/Ljubljana',
      endTimeZone: 'Europe/Ljubljana',
      startDate: undefined,
      endDate: undefined,
      organizer: 'ada@example.com',
      attendees: ['grace@example.com'],
      seriesEventId: undefined,
      updatedAt: new Date('2026-07-16T10:00:00.000Z'),
    })
  })

  test('preserves an all-day half-open date range without inventing an instant', () => {
    const parsed = calendarEventSchema.parse({
      provider: 'microsoft',
      providerCalendarId: 'calendar-A',
      providerEventId: 'event-A',
      timing: {
        kind: 'all-day',
        startDate: '2026-07-20',
        endDate: '2026-07-23',
      },
      title: 'Company holiday',
      location: 'Ljubljana',
      status: 'confirmed',
      updatedAt: '2026-07-16T10:00:00Z',
    })
    const fields = calendarEventProfile.search?.fields ?? {}

    expect(calendarEventProfile.search?.summary?.(parsed)).toBe('Ljubljana')
    expect(calendarEventProfile.search?.occurredAt?.(parsed)).toBeNull()
    expect(fields.allDay?.extract(parsed)).toBe(true)
    expect(fields.startsAt?.extract(parsed)).toBeUndefined()
    expect(fields.endsAt?.extract(parsed)).toBeUndefined()
    expect(fields.startTimeZone?.extract(parsed)).toBeUndefined()
    expect(fields.endTimeZone?.extract(parsed)).toBeUndefined()
    expect(fields.startDate?.extract(parsed)).toBe('2026-07-20')
    expect(fields.endDate?.extract(parsed)).toBe('2026-07-23')
  })

  test('declares an exact same-Source series Relation and stable opaque Ref', () => {
    const seriesRef = calendarEventRef(sourceId, 'Series/Case %?#')
    const parsed = calendarEventSchema.parse({
      ...timedPayload,
      providerEventId: 'occurrence-1',
      recurrenceRules: undefined,
      series: {
        providerEventId: 'Series/Case %?#',
        ref: seriesRef,
        originalStart: {
          kind: 'timed',
          at: '2026-07-20T09:00:00+02:00',
          timeZone: 'Europe/Ljubljana',
        },
      },
    })

    expect(seriesRef).toBe(`ctx://${sourceId}/event/Series%2FCase%20%25%3F%23`)
    expect(calendarEventProfile.relations?.series?.(parsed)).toEqual({
      ref: seriesRef,
    })
    expect(() => calendarEventRef(sourceId.toLowerCase(), 'event')).toThrow()
    expect(() => calendarEventRef(sourceId, '')).toThrow()
  })

  test('exposes common vocabulary with no embedded docs, Actions, or special export', () => {
    expect(calendarEventProfile).not.toHaveProperty('docs')
    expect(calendarEventProfile.actions).toBeUndefined()
    expect(calendarEventProfile.exports).toBeUndefined()
    expect(
      Object.fromEntries(
        Object.entries(calendarEventProfile.search?.fields ?? {}).map(
          ([name, field]) => [name, field.type],
        ),
      ),
    ).toEqual({
      provider: 'string',
      calendarId: 'string',
      eventId: 'string',
      title: 'string',
      status: 'string',
      allDay: 'boolean',
      startsAt: 'datetime',
      endsAt: 'datetime',
      startTimeZone: 'string',
      endTimeZone: 'string',
      startDate: 'string',
      endDate: 'string',
      organizer: 'string',
      attendees: 'string[]',
      seriesEventId: 'string',
      updatedAt: 'datetime',
    })
  })

  test('remains provider-neutral and core-independent', async () => {
    const source = await Bun.file(
      new URL('calendar-event.ts', import.meta.url),
    ).text()

    expect(source).not.toContain('@ctxindex/core')
    expect(source).not.toMatch(/google|microsoft|graph/i)
  })

  test('rejects invalid intervals, dates, identities, participants, URLs, and unknown fields', () => {
    const invalidPayloads = [
      {
        ...timedPayload,
        timing: { ...timedPayload.timing, end: timedPayload.timing.start },
      },
      {
        ...timedPayload,
        timing: {
          ...timedPayload.timing,
          end: '2026-07-20T08:59:59+02:00',
        },
      },
      {
        ...timedPayload,
        timing: { ...timedPayload.timing, startDate: '2026-07-20' },
      },
      {
        ...timedPayload,
        timing: {
          kind: 'all-day',
          startDate: '2026-07-20',
          endDate: '2026-07-20',
        },
      },
      {
        ...timedPayload,
        timing: {
          kind: 'all-day',
          startDate: '2026-02-30',
          endDate: '2026-03-01',
        },
      },
      { ...timedPayload, provider: 'Google' },
      { ...timedPayload, attendees: [{}] },
      {
        ...timedPayload,
        series: {
          providerEventId: 'series-1',
          ref: 'ctx://lowercase/event/series-1',
          originalStart: { kind: 'all-day', date: '2026-07-20' },
        },
      },
      { ...timedPayload, providerUrl: 'http://calendar.example/event' },
      {
        ...timedPayload,
        createdAt: '2026-07-17T10:00:00Z',
        updatedAt: '2026-07-16T10:00:00Z',
      },
      { ...timedPayload, extra: true },
    ]

    for (const invalidPayload of invalidPayloads) {
      expect(calendarEventSchema.safeParse(invalidPayload).success).toBe(false)
    }
  })
})
