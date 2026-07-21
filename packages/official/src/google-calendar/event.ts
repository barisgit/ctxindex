import type { SyncedResource } from '@ctxindex/extension-sdk'
import { calendarEventRef, calendarEventSchema } from '@ctxindex/profiles'
import { parseHTML } from 'linkedom'
import { z } from 'zod'

const dateTimeSchema = z.iso.datetime({ offset: true })
const dateSchema = z.iso.date()
const eventDateTimeSchema = z
  .object({
    date: dateSchema.optional(),
    dateTime: dateTimeSchema.optional(),
    timeZone: z.string().min(1).optional(),
  })
  .passthrough()

const participantSchema = z
  .object({
    displayName: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
    self: z.boolean().optional(),
    organizer: z.boolean().optional(),
    responseStatus: z
      .enum(['needsAction', 'declined', 'tentative', 'accepted'])
      .optional(),
  })
  .passthrough()

export const googleCalendarEventSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(['confirmed', 'tentative', 'cancelled']),
    eventType: z.string().min(1).optional(),
    summary: z.string().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    start: eventDateTimeSchema,
    end: eventDateTimeSchema,
    organizer: participantSchema.optional(),
    attendees: z.array(participantSchema).optional(),
    recurrence: z.array(z.string().min(1)).min(1).optional(),
    recurringEventId: z.string().min(1).optional(),
    originalStartTime: eventDateTimeSchema.optional(),
    htmlLink: z.string().optional(),
    created: dateTimeSchema.optional(),
    updated: dateTimeSchema,
  })
  .passthrough()

export interface GoogleCalendarWarning {
  readonly code: string
  readonly message: string
  readonly ref?: string
}

export interface NormalizedGoogleCalendarEvent {
  readonly providerEventId?: string
  readonly resource?: SyncedResource
  readonly warnings: readonly GoogleCalendarWarning[]
}

function text(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const { document } = parseHTML(`<html><body>${value}</body></html>`)
  const plain = document.body.textContent.trim()
  return plain.length === 0 ? undefined : plain
}

function participant(value: z.infer<typeof participantSchema>) {
  return {
    ...(value.displayName === undefined
      ? {}
      : { displayName: value.displayName }),
    ...(value.email === undefined ? {} : { email: value.email }),
    ...(value.self === undefined ? {} : { self: value.self }),
  }
}

function attendee(value: z.infer<typeof participantSchema>) {
  const responseStatus = value.organizer
    ? 'organizer'
    : value.responseStatus === 'needsAction'
      ? 'needs-action'
      : value.responseStatus
  return {
    ...participant(value),
    ...(responseStatus === undefined ? {} : { responseStatus }),
  }
}

function timing(
  start: z.infer<typeof eventDateTimeSchema>,
  end: z.infer<typeof eventDateTimeSchema>,
) {
  if (start.dateTime !== undefined && end.dateTime !== undefined) {
    return {
      kind: 'timed' as const,
      start: start.dateTime,
      end: end.dateTime,
      ...(start.timeZone === undefined
        ? {}
        : { startTimeZone: start.timeZone }),
      ...(end.timeZone === undefined ? {} : { endTimeZone: end.timeZone }),
    }
  }
  if (start.date !== undefined && end.date !== undefined) {
    return {
      kind: 'all-day' as const,
      startDate: start.date,
      endDate: end.date,
    }
  }
  return undefined
}

function originalStart(value: z.infer<typeof eventDateTimeSchema>) {
  if (value.dateTime !== undefined) {
    return {
      kind: 'timed' as const,
      at: value.dateTime,
      ...(value.timeZone === undefined ? {} : { timeZone: value.timeZone }),
    }
  }
  if (value.date !== undefined)
    return { kind: 'all-day' as const, date: value.date }
  return undefined
}

function safeProviderUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' && url.username === '' && url.password === '')
      return value
  } catch {}
  return undefined
}

function warning(
  code: string,
  message: string,
  ref?: string,
): GoogleCalendarWarning {
  return { code, message, ...(ref === undefined ? {} : { ref }) }
}

export function normalizeGoogleCalendarEvent(
  input: unknown,
  sourceId: string,
  calendarId: string,
): NormalizedGoogleCalendarEvent {
  const providerEventId =
    typeof input === 'object' &&
    input !== null &&
    typeof (input as { id?: unknown }).id === 'string' &&
    (input as { id: string }).id.length > 0
      ? (input as { id: string }).id
      : undefined
  const ref =
    providerEventId === undefined
      ? undefined
      : calendarEventRef(sourceId, providerEventId)
  const parsed = googleCalendarEventSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ...(providerEventId === undefined ? {} : { providerEventId }),
      warnings: [
        warning(
          'google_calendar_malformed_event',
          providerEventId === undefined
            ? 'Google Calendar returned a malformed event without an id; it was skipped.'
            : `Google Calendar event ${providerEventId} was malformed and was skipped.`,
          ref,
        ),
      ],
    }
  }

  const event = parsed.data
  // 'birthday' is a normal all-day recurring instance plus birthdayProperties,
  // which carries no Profile-relevant data; map it like 'default'. Other
  // variants (fromGmail duplicates mailbox context; workingLocation is
  // presence metadata) stay intentionally unindexed.
  if (
    event.eventType !== undefined &&
    event.eventType !== 'default' &&
    event.eventType !== 'birthday'
  ) {
    return {
      providerEventId: event.id,
      warnings: [
        warning(
          'google_calendar_unsupported_event',
          `Google Calendar event ${event.id} uses unsupported variant ${event.eventType}.`,
          ref,
        ),
      ],
    }
  }

  const eventTiming = timing(event.start, event.end)
  if (eventTiming === undefined) {
    return {
      providerEventId: event.id,
      warnings: [
        warning(
          'google_calendar_malformed_event',
          `Google Calendar event ${event.id} was malformed and was skipped.`,
          ref,
        ),
      ],
    }
  }

  const warnings: GoogleCalendarWarning[] = []
  const createdAfterUpdated =
    event.created !== undefined &&
    event.updated !== undefined &&
    Date.parse(event.created) > Date.parse(event.updated)
  if (createdAfterUpdated) {
    warnings.push(
      warning(
        'google_calendar_created_after_updated',
        `Google Calendar event ${event.id} has creation time after update time; creation time was omitted.`,
        ref,
      ),
    )
  }
  const providerUrl = safeProviderUrl(event.htmlLink)
  if (event.htmlLink !== undefined && providerUrl === undefined) {
    warnings.push(
      warning(
        'google_calendar_unsafe_provider_url',
        `Google Calendar event ${event.id} had a non-HTTPS provider URL; it was omitted.`,
        ref,
      ),
    )
  }

  const occurrence =
    event.originalStartTime === undefined
      ? undefined
      : originalStart(event.originalStartTime)
  if (event.recurringEventId !== undefined && occurrence === undefined) {
    warnings.push(
      warning(
        'google_calendar_malformed_series',
        `Google Calendar event ${event.id} had malformed occurrence metadata; series linkage was omitted.`,
        ref,
      ),
    )
  }

  const title = text(event.summary)
  const description = text(event.description)
  const location = text(event.location)
  const parsedPayload = calendarEventSchema.safeParse({
    provider: 'google',
    providerCalendarId: calendarId,
    providerEventId: event.id,
    timing: eventTiming,
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    ...(location === undefined ? {} : { location }),
    status: event.status,
    ...(event.organizer === undefined
      ? {}
      : { organizer: participant(event.organizer) }),
    ...(event.attendees === undefined
      ? {}
      : { attendees: event.attendees.map(attendee) }),
    ...(event.recurrence === undefined
      ? {}
      : { recurrenceRules: event.recurrence }),
    ...(event.recurringEventId === undefined || occurrence === undefined
      ? {}
      : {
          series: {
            providerEventId: event.recurringEventId,
            ref: calendarEventRef(sourceId, event.recurringEventId),
            originalStart: occurrence,
          },
        }),
    ...(providerUrl === undefined ? {} : { providerUrl }),
    ...(event.created === undefined || createdAfterUpdated
      ? {}
      : { createdAt: event.created }),
    ...(event.updated === undefined ? {} : { updatedAt: event.updated }),
  })
  if (!parsedPayload.success) {
    return {
      providerEventId: event.id,
      warnings: [
        warning(
          'google_calendar_malformed_event',
          `Google Calendar event ${event.id} was malformed and was skipped.`,
          ref,
        ),
      ],
    }
  }
  const payload = parsedPayload.data

  return {
    providerEventId: event.id,
    resource: {
      ref: ref as string,
      profile: { id: 'calendar.event', version: 1 },
      ...(payload.title === undefined ? {} : { title: payload.title }),
      ...(description === undefined ? {} : { summary: description }),
      ...(payload.timing.kind === 'timed'
        ? { occurredAt: Date.parse(payload.timing.start) }
        : {}),
      ...(payload.updatedAt === undefined
        ? {}
        : { providerUpdatedAt: Date.parse(payload.updatedAt) }),
      payload,
      completeness: 'complete',
    },
    warnings,
  }
}
