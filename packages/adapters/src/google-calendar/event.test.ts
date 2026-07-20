import { describe, expect, test } from 'bun:test'
import { calendarEventSchema } from '@ctxindex/profiles'
import { normalizeGoogleCalendarEvent } from './event'

const sourceId = '01J00000000000000000000000'

describe('Google Calendar event normalization', () => {
  test('normalizes timed recurrence, participants, safe text, and provider metadata', () => {
    const result = normalizeGoogleCalendarEvent(
      {
        id: 'occurrence/1',
        status: 'confirmed',
        summary: 'Planning',
        description:
          '<p>Hello <strong>world</strong><script>bad()</script></p>',
        location: 'Room 1',
        start: {
          dateTime: '2026-07-16T09:00:00+02:00',
          timeZone: 'Europe/Ljubljana',
        },
        end: {
          dateTime: '2026-07-16T10:00:00+02:00',
          timeZone: 'Europe/Ljubljana',
        },
        organizer: {
          displayName: 'Owner',
          email: 'owner@example.test',
          self: true,
        },
        attendees: [
          {
            displayName: 'Ada',
            email: 'ada@example.test',
            responseStatus: 'needsAction',
          },
          {
            email: 'owner@example.test',
            organizer: true,
            responseStatus: 'accepted',
          },
        ],
        recurrence: ['RRULE:FREQ=WEEKLY'],
        recurringEventId: 'series/1',
        originalStartTime: {
          dateTime: '2026-07-16T09:00:00+02:00',
          timeZone: 'Europe/Ljubljana',
        },
        htmlLink: 'https://calendar.google.com/calendar/event?eid=abc',
        created: '2026-07-01T08:00:00Z',
        updated: '2026-07-10T08:00:00Z',
      },
      sourceId,
      'team@example.test',
    )

    expect(result.warnings).toEqual([])
    expect(result.resource).toMatchObject({
      ref: 'ctx://01J00000000000000000000000/event/occurrence%2F1',
      profile: { id: 'calendar.event', version: 1 },
      title: 'Planning',
      summary: 'Hello worldbad()',
      occurredAt: Date.parse('2026-07-16T07:00:00Z'),
      providerUpdatedAt: Date.parse('2026-07-10T08:00:00Z'),
      completeness: 'complete',
      payload: {
        provider: 'google',
        providerCalendarId: 'team@example.test',
        providerEventId: 'occurrence/1',
        timing: {
          kind: 'timed',
          start: '2026-07-16T09:00:00+02:00',
          end: '2026-07-16T10:00:00+02:00',
          startTimeZone: 'Europe/Ljubljana',
          endTimeZone: 'Europe/Ljubljana',
        },
        status: 'confirmed',
        organizer: {
          displayName: 'Owner',
          email: 'owner@example.test',
          self: true,
        },
        attendees: [
          {
            displayName: 'Ada',
            email: 'ada@example.test',
            responseStatus: 'needs-action',
          },
          { email: 'owner@example.test', responseStatus: 'organizer' },
        ],
        recurrenceRules: ['RRULE:FREQ=WEEKLY'],
        series: {
          providerEventId: 'series/1',
          ref: 'ctx://01J00000000000000000000000/event/series%2F1',
          originalStart: {
            kind: 'timed',
            at: '2026-07-16T09:00:00+02:00',
            timeZone: 'Europe/Ljubljana',
          },
        },
      },
    })
    expect(
      calendarEventSchema.safeParse(result.resource?.payload).success,
    ).toBe(true)
  })

  test('retains all-day half-open dates and omits inverted creation time with one warning', () => {
    const result = normalizeGoogleCalendarEvent(
      {
        id: 'all-day',
        status: 'tentative',
        start: { date: '2026-07-16' },
        end: { date: '2026-07-19' },
        created: '2026-07-20T00:00:00Z',
        updated: '2026-07-19T00:00:00Z',
      },
      sourceId,
      'primary',
    )

    expect(result.resource?.payload).toMatchObject({
      timing: {
        kind: 'all-day',
        startDate: '2026-07-16',
        endDate: '2026-07-19',
      },
      status: 'tentative',
      updatedAt: '2026-07-19T00:00:00Z',
    })
    expect(result.resource?.payload).not.toHaveProperty('createdAt')
    expect(result.resource).not.toHaveProperty('occurredAt')
    expect(result.warnings).toEqual([
      {
        code: 'google_calendar_created_after_updated',
        message:
          'Google Calendar event all-day has creation time after update time; creation time was omitted.',
        ref: 'ctx://01J00000000000000000000000/event/all-day',
      },
    ])
  })

  test('maps the birthday variant as a normal all-day event with series linkage (live evidence shape)', () => {
    const result = normalizeGoogleCalendarEvent(
      {
        id: 'birthday-instance_20260207',
        status: 'confirmed',
        eventType: 'birthday',
        start: { date: '2026-02-07' },
        end: { date: '2026-02-08' },
        recurringEventId: '4rhj7ttiai2rj77s7n6258p3u8',
        originalStartTime: { date: '2026-02-07' },
        visibility: 'private',
        transparency: 'transparent',
        birthdayProperties: { contact: 'people/c123', type: 'birthday' },
        summary: 'Birthday',
        updated: '2026-01-01T00:00:00Z',
      },
      sourceId,
      'primary',
    )
    expect(result.warnings).toEqual([])
    expect(result.resource?.payload).toMatchObject({
      provider: 'google',
      providerEventId: 'birthday-instance_20260207',
      timing: {
        kind: 'all-day',
        startDate: '2026-02-07',
        endDate: '2026-02-08',
      },
      status: 'confirmed',
      series: {
        providerEventId: '4rhj7ttiai2rj77s7n6258p3u8',
        originalStart: { kind: 'all-day', date: '2026-02-07' },
      },
    })
    expect(result.resource?.payload).not.toHaveProperty('birthdayProperties')
  })

  test('canonicalizes provider IANA aliases and omits unknown labels', () => {
    const alias = normalizeGoogleCalendarEvent(
      {
        id: 'alias-zone',
        status: 'confirmed',
        start: {
          dateTime: '2026-07-16T09:00:00-07:00',
          timeZone: 'US/Pacific',
        },
        end: {
          dateTime: '2026-07-16T10:00:00-07:00',
          timeZone: 'US/Pacific',
        },
        recurringEventId: 'alias-series',
        originalStartTime: {
          dateTime: '2026-07-16T09:00:00-07:00',
          timeZone: 'US/Pacific',
        },
        updated: '2026-07-16T00:00:00Z',
      },
      sourceId,
      'primary',
    )
    expect(alias.warnings).toEqual([])
    expect(alias.resource?.payload).toMatchObject({
      timing: {
        startTimeZone: 'America/Los_Angeles',
        endTimeZone: 'America/Los_Angeles',
      },
      series: {
        originalStart: { timeZone: 'America/Los_Angeles' },
      },
    })

    const unknown = normalizeGoogleCalendarEvent(
      {
        id: 'unknown-zone',
        status: 'confirmed',
        start: {
          dateTime: '2026-07-16T09:00:00Z',
          timeZone: 'Synthetic/Unknown',
        },
        end: {
          dateTime: '2026-07-16T10:00:00Z',
          timeZone: 'Synthetic/Unknown',
        },
        updated: '2026-07-16T00:00:00Z',
      },
      sourceId,
      'primary',
    )
    expect(unknown.warnings).toEqual([])
    expect(unknown.resource).toBeDefined()
    expect(unknown.resource?.payload).not.toHaveProperty('timing.startTimeZone')
    expect(unknown.resource?.payload).not.toHaveProperty('timing.endTimeZone')
  })

  test('returns deterministic warnings instead of malformed resources for unsupported variants', () => {
    for (const eventType of ['workingLocation', 'fromGmail']) {
      const unsupported = normalizeGoogleCalendarEvent(
        {
          id: 'excluded',
          status: 'confirmed',
          eventType,
          start: { date: '2026-07-16' },
          end: { date: '2026-07-17' },
          updated: '2026-07-16T00:00:00Z',
        },
        sourceId,
        'primary',
      )
      expect(unsupported.resource).toBeUndefined()
      expect(unsupported.providerEventId).toBe('excluded')
      expect(unsupported.warnings).toEqual([
        {
          code: 'google_calendar_unsupported_event',
          message: `Google Calendar event excluded uses unsupported variant ${eventType}.`,
          ref: 'ctx://01J00000000000000000000000/event/excluded',
        },
      ])
    }

    const malformed = normalizeGoogleCalendarEvent(
      { id: 'broken', status: 'confirmed', start: { date: '2026-07-16' } },
      sourceId,
      'primary',
    )
    expect(malformed.resource).toBeUndefined()
    expect(malformed.providerEventId).toBe('broken')
    expect(malformed.warnings).toEqual([
      {
        code: 'google_calendar_malformed_event',
        message: 'Google Calendar event broken was malformed and was skipped.',
        ref: 'ctx://01J00000000000000000000000/event/broken',
      },
    ])

    const malformedAttendee = normalizeGoogleCalendarEvent(
      {
        id: 'bad-attendee',
        status: 'confirmed',
        start: { date: '2026-07-16' },
        end: { date: '2026-07-17' },
        attendees: [{ responseStatus: 'accepted' }],
        updated: '2026-07-16T00:00:00Z',
      },
      sourceId,
      'primary',
    )
    expect(malformedAttendee.resource).toBeUndefined()
    expect(malformedAttendee.warnings[0]?.code).toBe(
      'google_calendar_malformed_event',
    )
  })
})
