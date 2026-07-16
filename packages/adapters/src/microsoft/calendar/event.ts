import type { SyncedResource } from '@ctxindex/extension-sdk'
import { calendarEventRef, calendarEventSchema } from '@ctxindex/profiles'
import { parseHTML } from 'linkedom'
import { z } from 'zod'

const dateTimeZoneSchema = z
  .object({ dateTime: z.string().min(1), timeZone: z.string().min(1) })
  .passthrough()
const emailAddressSchema = z
  .object({
    name: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
  })
  .passthrough()
const participantSchema = z
  .object({ emailAddress: emailAddressSchema })
  .passthrough()
const attendeeSchema = participantSchema
  .extend({
    status: z
      .object({ response: z.string().min(1) })
      .passthrough()
      .optional(),
  })
  .passthrough()

export const microsoftCalendarEventSchema = z
  .object({
    id: z.string().min(1),
    '@removed': z
      .object({ reason: z.string().optional() })
      .passthrough()
      .optional(),
    subject: z.string().optional(),
    body: z
      .object({
        contentType: z.string().optional(),
        content: z.string().optional(),
      })
      .passthrough()
      .optional(),
    bodyPreview: z.string().optional(),
    location: z
      .object({ displayName: z.string().optional() })
      .passthrough()
      .optional(),
    start: dateTimeZoneSchema.optional(),
    end: dateTimeZoneSchema.optional(),
    isAllDay: z.boolean().optional(),
    originalStartTimeZone: z.string().min(1).optional(),
    originalEndTimeZone: z.string().min(1).optional(),
    organizer: participantSchema.optional(),
    attendees: z.array(attendeeSchema).optional(),
    isCancelled: z.boolean().optional(),
    showAs: z.string().optional(),
    recurrence: z.unknown().optional(),
    seriesMasterId: z.string().min(1).optional(),
    originalStart: z.string().min(1).optional(),
    webLink: z.string().optional(),
    createdDateTime: z.string().optional(),
    lastModifiedDateTime: z.string().optional(),
  })
  .passthrough()

export interface MicrosoftCalendarWarning {
  readonly code: string
  readonly message: string
  readonly ref?: string
}
export interface NormalizedMicrosoftCalendarEvent {
  readonly providerEventId?: string
  readonly removed?: boolean
  readonly cancelled?: boolean
  readonly resource?: SyncedResource
  readonly warnings: readonly MicrosoftCalendarWarning[]
}

function warning(
  code: string,
  message: string,
  ref?: string,
): MicrosoftCalendarWarning {
  return { code, message, ...(ref === undefined ? {} : { ref }) }
}
function plainText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const { document } = parseHTML(`<html><body>${value}</body></html>`)
  for (const element of document.querySelectorAll('script, style'))
    element.remove()
  const text = document.body.textContent.trim()
  return text || undefined
}
function instant(value: string | undefined, zone = 'UTC'): string | undefined {
  if (!value) return undefined
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value)
    ? value
    : zone === 'UTC'
      ? `${value.replace(/\.(\d{3})\d+$/, '.$1')}Z`
      : undefined
  if (!normalized) return undefined
  const ms = Date.parse(normalized)
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString()
}
function dateInTimeZone(
  value: string | undefined,
  timeZone: string | undefined,
): string | undefined {
  if (!value || !timeZone) return undefined
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return undefined
  try {
    const parts = new Intl.DateTimeFormat('en-US-u-ca-iso8601', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(parsed))
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((candidate) => candidate.type === type)?.value
    const year = part('year')
    const month = part('month')
    const day = part('day')
    return year && month && day ? `${year}-${month}-${day}` : undefined
  } catch {
    return undefined
  }
}
function person(value: z.infer<typeof participantSchema>) {
  const email = value.emailAddress.address?.trim()
  const displayName = value.emailAddress.name?.trim()
  return {
    ...(displayName ? { displayName } : {}),
    ...(email ? { email } : {}),
  }
}
function response(value: string | undefined) {
  const values: Record<string, string> = {
    none: 'none',
    notResponded: 'needs-action',
    tentativelyAccepted: 'tentative',
    accepted: 'accepted',
    declined: 'declined',
    organizer: 'organizer',
  }
  return value === undefined ? undefined : values[value]
}
function status(event: z.infer<typeof microsoftCalendarEventSchema>) {
  if (event.isCancelled) return 'cancelled' as const
  return event.showAs === 'tentative'
    ? ('tentative' as const)
    : ('confirmed' as const)
}
function safeUrl(value: string | undefined) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
      ? value
      : undefined
  } catch {
    return undefined
  }
}
const dayCodes: Record<string, string> = {
  sunday: 'SU',
  monday: 'MO',
  tuesday: 'TU',
  wednesday: 'WE',
  thursday: 'TH',
  friday: 'FR',
  saturday: 'SA',
}
function recurrenceRule(value: unknown): string | undefined {
  const parsed = z
    .object({
      pattern: z
        .object({
          type: z.string(),
          interval: z.number().int().positive().optional(),
          daysOfWeek: z.array(z.string()).optional(),
          dayOfMonth: z.number().int().min(1).max(31).optional(),
          month: z.number().int().min(1).max(12).optional(),
          index: z.string().optional(),
        })
        .passthrough(),
      range: z
        .object({
          type: z.string(),
          endDate: z.string().optional(),
          numberOfOccurrences: z.number().int().positive().optional(),
        })
        .passthrough(),
    })
    .safeParse(value)
  if (!parsed.success) return undefined
  const { pattern, range } = parsed.data
  const days = (pattern.daysOfWeek ?? []).map((day) => dayCodes[day])
  if (days.some((day) => day === undefined)) return undefined
  const ordinal: Record<string, string> = {
    first: '1',
    second: '2',
    third: '3',
    fourth: '4',
    last: '-1',
  }
  let freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  let byDay: string | undefined
  if (pattern.type === 'daily') freq = 'DAILY'
  else if (pattern.type === 'weekly' && days.length > 0) {
    freq = 'WEEKLY'
    byDay = days.join(',')
  } else if (
    pattern.type === 'absoluteMonthly' &&
    pattern.dayOfMonth !== undefined
  )
    freq = 'MONTHLY'
  else if (
    pattern.type === 'relativeMonthly' &&
    days.length === 1 &&
    pattern.index !== undefined &&
    ordinal[pattern.index] !== undefined
  ) {
    freq = 'MONTHLY'
    byDay = `${ordinal[pattern.index]}${days[0]}`
  } else if (
    pattern.type === 'absoluteYearly' &&
    pattern.dayOfMonth !== undefined &&
    pattern.month !== undefined
  )
    freq = 'YEARLY'
  else if (
    pattern.type === 'relativeYearly' &&
    pattern.month !== undefined &&
    days.length === 1 &&
    pattern.index !== undefined &&
    ordinal[pattern.index] !== undefined
  ) {
    freq = 'YEARLY'
    byDay = `${ordinal[pattern.index]}${days[0]}`
  } else return undefined
  if (!['noEnd', 'endDate', 'numbered'].includes(range.type)) return undefined
  if (
    range.type === 'endDate' &&
    !/^\d{4}-\d{2}-\d{2}$/.test(range.endDate ?? '')
  )
    return undefined
  if (range.type === 'numbered' && !range.numberOfOccurrences) return undefined
  const parts = [`FREQ=${freq}`, `INTERVAL=${pattern.interval ?? 1}`]
  if (byDay) parts.push(`BYDAY=${byDay}`)
  if (pattern.dayOfMonth) parts.push(`BYMONTHDAY=${pattern.dayOfMonth}`)
  if (pattern.month) parts.push(`BYMONTH=${pattern.month}`)
  if (
    range.type === 'endDate' &&
    /^\d{4}-\d{2}-\d{2}$/.test(range.endDate ?? '')
  )
    parts.push(`UNTIL=${range.endDate?.replaceAll('-', '')}`)
  if (range.type === 'numbered' && range.numberOfOccurrences)
    parts.push(`COUNT=${range.numberOfOccurrences}`)
  return `RRULE:${parts.join(';')}`
}

export function normalizeMicrosoftCalendarEvent(
  input: unknown,
  sourceId: string,
  calendarId: string,
): NormalizedMicrosoftCalendarEvent {
  const idOnly = z
    .object({ id: z.string().min(1) })
    .passthrough()
    .safeParse(input)
  if (!idOnly.success)
    return {
      warnings: [
        warning(
          'microsoft_calendar_malformed_event',
          'Microsoft Calendar event was malformed and was skipped.',
        ),
      ],
    }
  const providerEventId = idOnly.data.id
  const ref = calendarEventRef(sourceId, providerEventId)
  const parsed = microsoftCalendarEventSchema.safeParse(input)
  if (!parsed.success)
    return {
      providerEventId,
      warnings: [
        warning(
          'microsoft_calendar_malformed_event',
          `Microsoft Calendar event ${providerEventId} was malformed and was skipped.`,
          ref,
        ),
      ],
    }
  const event = parsed.data
  if (event['@removed']) return { providerEventId, removed: true, warnings: [] }
  const warnings: MicrosoftCalendarWarning[] = []
  let timing: unknown
  if (event.isAllDay) {
    const startDate = event.start?.dateTime.slice(0, 10)
    const endDate = event.end?.dateTime.slice(0, 10)
    if (
      event.start &&
      event.end &&
      /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.0+)?$/.test(event.start.dateTime) &&
      /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.0+)?$/.test(event.end.dateTime)
    )
      timing = { kind: 'all-day', startDate, endDate }
  } else {
    const start = instant(event.start?.dateTime, event.start?.timeZone)
    const end = instant(event.end?.dateTime, event.end?.timeZone)
    if (start && end)
      timing = {
        kind: 'timed',
        start,
        end,
        ...(event.originalStartTimeZone
          ? { startTimeZone: event.originalStartTimeZone }
          : event.start?.timeZone
            ? { startTimeZone: event.start.timeZone }
            : {}),
        ...(event.originalEndTimeZone
          ? { endTimeZone: event.originalEndTimeZone }
          : event.end?.timeZone
            ? { endTimeZone: event.end.timeZone }
            : {}),
      }
  }
  const providerUrl = safeUrl(event.webLink)
  if (event.webLink && !providerUrl)
    warnings.push(
      warning(
        'microsoft_calendar_unsafe_web_link',
        `Microsoft Calendar event ${providerEventId} had an unsafe web link that was omitted.`,
        ref,
      ),
    )
  const createdAt = instant(event.createdDateTime)
  const updatedAt = instant(event.lastModifiedDateTime)
  const inverted =
    createdAt && updatedAt && Date.parse(createdAt) > Date.parse(updatedAt)
  if (inverted)
    warnings.unshift(
      warning(
        'microsoft_calendar_created_after_updated',
        `Microsoft Calendar event ${providerEventId} had creation time after update time; creation time was omitted.`,
        ref,
      ),
    )
  const recurrence = recurrenceRule(event.recurrence)
  if (event.recurrence != null && !recurrence)
    warnings.push(
      warning(
        'microsoft_calendar_unsupported_recurrence',
        `Microsoft Calendar event ${providerEventId} had recurrence that could not be represented exactly and was omitted.`,
        ref,
      ),
    )
  const originalInstant = event.isAllDay
    ? undefined
    : instant(
        event.originalStart,
        event.originalStartTimeZone ?? event.start?.timeZone,
      )
  const originalDate = event.isAllDay
    ? dateInTimeZone(
        event.originalStart,
        event.originalStartTimeZone ?? event.start?.timeZone,
      )
    : undefined
  if (event.seriesMasterId && !originalInstant && !originalDate)
    warnings.push(
      warning(
        'microsoft_calendar_unresolved_series_start',
        `Microsoft Calendar event ${providerEventId} had an occurrence start whose provider time zone could not be resolved; series identity was omitted.`,
        ref,
      ),
    )
  const description =
    plainText(event.body?.content) ?? plainText(event.bodyPreview)
  const payload = calendarEventSchema.safeParse({
    provider: 'microsoft',
    providerCalendarId: calendarId,
    providerEventId,
    timing,
    ...(event.subject?.trim() ? { title: event.subject.trim() } : {}),
    ...(description ? { description } : {}),
    ...(event.location?.displayName?.trim()
      ? { location: event.location.displayName.trim() }
      : {}),
    status: status(event),
    ...(event.organizer ? { organizer: person(event.organizer) } : {}),
    ...(event.attendees
      ? {
          attendees: event.attendees.map((a) => ({
            ...person(a),
            ...(response(a.status?.response)
              ? { responseStatus: response(a.status?.response) }
              : {}),
          })),
        }
      : {}),
    ...(recurrence ? { recurrenceRules: [recurrence] } : {}),
    ...(event.seriesMasterId && (originalInstant || originalDate)
      ? {
          series: {
            providerEventId: event.seriesMasterId,
            ref: calendarEventRef(sourceId, event.seriesMasterId),
            originalStart: originalDate
              ? { kind: 'all-day' as const, date: originalDate }
              : {
                  kind: 'timed' as const,
                  at: originalInstant,
                  ...(event.originalStartTimeZone
                    ? { timeZone: event.originalStartTimeZone }
                    : {}),
                },
          },
        }
      : {}),
    ...(providerUrl ? { providerUrl } : {}),
    ...(!inverted && createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  })
  if (!payload.success)
    return {
      providerEventId,
      cancelled: event.isCancelled === true,
      warnings: [
        warning(
          'microsoft_calendar_malformed_event',
          `Microsoft Calendar event ${providerEventId} was malformed and was skipped.`,
          ref,
        ),
      ],
    }
  return {
    providerEventId,
    cancelled: event.isCancelled === true,
    resource: {
      ref,
      profile: { id: 'calendar.event', version: 1 },
      ...(payload.data.title ? { title: payload.data.title } : {}),
      ...(description ? { summary: description } : {}),
      ...(payload.data.timing.kind === 'timed'
        ? { occurredAt: Date.parse(payload.data.timing.start) }
        : {}),
      ...(payload.data.updatedAt
        ? { providerUpdatedAt: Date.parse(payload.data.updatedAt) }
        : {}),
      payload: payload.data,
      completeness: 'complete',
    },
    warnings,
  }
}
