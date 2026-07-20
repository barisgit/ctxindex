import { defineProfile } from '@ctxindex/extension-sdk'
import { z } from 'zod'

const sourceIdPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/
const providerIdPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/
const instantSchema = z.iso.datetime({ offset: true })
const dateSchema = z.iso.date()

const canonicalTimeZoneAliases = new Map<string, string>([
  // Selected IANA tzdb 2026b backward spellings that replace obsolete names
  // exposed by Bun 1.3.14's Intl inventory, plus legacy UTC/US identifiers.
  ['Africa/Asmera', 'Africa/Asmara'],
  ['America/Buenos_Aires', 'America/Argentina/Buenos_Aires'],
  ['America/Catamarca', 'America/Argentina/Catamarca'],
  ['America/Cordoba', 'America/Argentina/Cordoba'],
  ['America/Godthab', 'America/Nuuk'],
  ['America/Indianapolis', 'America/Indiana/Indianapolis'],
  ['America/Jujuy', 'America/Argentina/Jujuy'],
  ['America/Knox_IN', 'America/Indiana/Knox'],
  ['America/Louisville', 'America/Kentucky/Louisville'],
  ['America/Mendoza', 'America/Argentina/Mendoza'],
  ['Etc/UTC', 'UTC'],
  ['Etc/UCT', 'UTC'],
  ['Etc/Universal', 'UTC'],
  ['Etc/Zulu', 'UTC'],
  ['GMT', 'UTC'],
  ['UCT', 'UTC'],
  ['Universal', 'UTC'],
  ['Zulu', 'UTC'],
  ['US/Alaska', 'America/Anchorage'],
  ['US/Arizona', 'America/Phoenix'],
  ['US/Central', 'America/Chicago'],
  ['US/Eastern', 'America/New_York'],
  ['US/Hawaii', 'Pacific/Honolulu'],
  ['US/Mountain', 'America/Denver'],
  ['US/Pacific', 'America/Los_Angeles'],
  ['Asia/Ashkhabad', 'Asia/Ashgabat'],
  ['Asia/Calcutta', 'Asia/Kolkata'],
  ['Asia/Chungking', 'Asia/Chongqing'],
  ['Asia/Dacca', 'Asia/Dhaka'],
  ['Asia/Istanbul', 'Europe/Istanbul'],
  ['Asia/Katmandu', 'Asia/Kathmandu'],
  ['Asia/Macao', 'Asia/Macau'],
  ['Asia/Rangoon', 'Asia/Yangon'],
  ['Asia/Saigon', 'Asia/Ho_Chi_Minh'],
  ['Asia/Thimbu', 'Asia/Thimphu'],
  ['Asia/Ujung_Pandang', 'Asia/Makassar'],
  ['Asia/Ulan_Bator', 'Asia/Ulaanbaatar'],
  ['Atlantic/Faeroe', 'Atlantic/Faroe'],
  ['Europe/Kiev', 'Europe/Kyiv'],
  ['Europe/Nicosia', 'Asia/Nicosia'],
  ['Pacific/Enderbury', 'Pacific/Kanton'],
  ['Pacific/Ponape', 'Pacific/Pohnpei'],
  ['Pacific/Samoa', 'Pacific/Pago_Pago'],
  ['Pacific/Truk', 'Pacific/Chuuk'],
])
const canonicalTimeZones = new Set(Intl.supportedValuesOf('timeZone'))
const modernCanonicalTimeZones = new Set(canonicalTimeZoneAliases.values())

export function canonicalizeIanaTimeZone(value: string): string | undefined {
  const alias = canonicalTimeZoneAliases.get(value)
  if (alias) return alias
  if (
    value === 'UTC' ||
    modernCanonicalTimeZones.has(value) ||
    canonicalTimeZones.has(value)
  )
    return value
  if (!/^Etc\/GMT(?:[+-](?:[1-9]|1[0-4]))?$/.test(value)) return undefined
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return value
  } catch {
    return undefined
  }
}

const canonicalTimeZoneSchema = z
  .string()
  .min(1)
  .refine(
    (value) => canonicalizeIanaTimeZone(value) === value,
    'Calendar time zone must be a canonical IANA name',
  )

const participantShape = {
  displayName: z.string().min(1).optional(),
  email: z.string().min(1).optional(),
  self: z.boolean().optional(),
}

const participantSchema = z
  .object(participantShape)
  .strict()
  .refine(
    (participant) =>
      participant.displayName !== undefined || participant.email !== undefined,
    'A participant requires a display name or email',
  )

const attendeeSchema = z
  .object({
    ...participantShape,
    responseStatus: z
      .enum([
        'none',
        'needs-action',
        'tentative',
        'accepted',
        'declined',
        'organizer',
      ])
      .optional(),
  })
  .strict()
  .refine(
    (participant) =>
      participant.displayName !== undefined || participant.email !== undefined,
    'An attendee requires a display name or email',
  )

const timedTimingSchema = z
  .object({
    kind: z.literal('timed'),
    start: instantSchema,
    end: instantSchema,
    startTimeZone: canonicalTimeZoneSchema.optional(),
    endTimeZone: canonicalTimeZoneSchema.optional(),
  })
  .strict()
  .refine(
    (timing) => Date.parse(timing.end) > Date.parse(timing.start),
    'Timed event end must be after start',
  )

const allDayTimingSchema = z
  .object({
    kind: z.literal('all-day'),
    startDate: dateSchema,
    endDate: dateSchema,
  })
  .strict()
  .refine(
    (timing) => timing.endDate > timing.startDate,
    'All-day event end date must be after start date',
  )

const occurrenceStartSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('timed'),
      at: instantSchema,
      timeZone: canonicalTimeZoneSchema.optional(),
    })
    .strict(),
  z.object({ kind: z.literal('all-day'), date: dateSchema }).strict(),
])

function isCanonicalEventRef(value: string): boolean {
  const match = /^ctx:\/\/([^/]+)\/event\/([^/?#]+)$/.exec(value)
  if (!match?.[1] || !match[2] || !sourceIdPattern.test(match[1])) return false
  try {
    return encodeURIComponent(decodeURIComponent(match[2])) === match[2]
  } catch {
    return false
  }
}

const seriesSchema = z
  .object({
    providerEventId: z.string().min(1),
    ref: z.string().refine(isCanonicalEventRef, 'Invalid calendar series Ref'),
    originalStart: occurrenceStartSchema,
  })
  .strict()

const httpsUrlSchema = z.url().refine((value) => {
  const url = new URL(value)
  return url.protocol === 'https:' && url.username === '' && url.password === ''
}, 'Provider URL must be credential-free HTTPS')

export const calendarEventSchema = z
  .object({
    provider: z.string().regex(providerIdPattern),
    providerCalendarId: z.string().min(1),
    providerEventId: z.string().min(1),
    timing: z.discriminatedUnion('kind', [
      timedTimingSchema,
      allDayTimingSchema,
    ]),
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    location: z.string().min(1).optional(),
    status: z.enum(['confirmed', 'tentative', 'cancelled']),
    organizer: participantSchema.optional(),
    attendees: z.array(attendeeSchema).optional(),
    recurrenceRules: z.array(z.string().min(1)).min(1).optional(),
    series: seriesSchema.optional(),
    providerUrl: httpsUrlSchema.optional(),
    createdAt: instantSchema.optional(),
    updatedAt: instantSchema.optional(),
  })
  .strict()
  .refine(
    (event) =>
      event.createdAt === undefined ||
      event.updatedAt === undefined ||
      Date.parse(event.updatedAt) >= Date.parse(event.createdAt),
    'Calendar Event update time must not precede creation time',
  )

export type CalendarEvent = z.infer<typeof calendarEventSchema>

function takeCodePoints(value: string, limit: number): string {
  return Array.from(value).slice(0, limit).join('')
}

function participantText(
  participant: z.infer<typeof participantSchema>,
): string {
  if (participant.displayName && participant.email) {
    return `${participant.displayName} <${participant.email}>`
  }
  return participant.email ?? (participant.displayName as string)
}

function participantIdentity(
  participant: z.infer<typeof participantSchema>,
): string {
  return participant.email ?? (participant.displayName as string)
}

function calendarEventSummary(event: CalendarEvent): string | null {
  const summary = event.description ?? event.location
  return summary === undefined ? null : takeCodePoints(summary, 500)
}

function calendarEventChunks(event: CalendarEvent): readonly string[] {
  const people = [
    ...(event.organizer === undefined
      ? []
      : [participantText(event.organizer)]),
    ...(event.attendees ?? []).map(participantText),
  ].join('\n')
  return [event.title, event.description, event.location, people]
    .filter((value): value is string => value !== undefined && value.length > 0)
    .map((value) => takeCodePoints(value, 3000))
}

export function calendarEventRef(
  sourceId: string,
  opaqueEventId: string,
): string {
  if (!sourceIdPattern.test(sourceId)) {
    throw new TypeError('Calendar Event Ref requires an uppercase Source ULID')
  }
  if (opaqueEventId.length === 0) {
    throw new TypeError('Calendar Event Ref requires a provider event id')
  }
  return `ctx://${sourceId}/event/${encodeURIComponent(opaqueEventId)}`
}

export const calendarEventProfile = defineProfile({
  id: 'calendar.event',
  version: 1,
  schema: calendarEventSchema,
  search: {
    title: (event) => event.title ?? null,
    summary: calendarEventSummary,
    occurredAt: (event) =>
      event.timing.kind === 'timed' ? new Date(event.timing.start) : null,
    chunks: calendarEventChunks,
    fields: {
      provider: {
        type: 'string',
        extract: (event) => event.provider,
        docs: 'Stable provider id for the Calendar Event.',
      },
      calendarId: {
        type: 'string',
        extract: (event) => event.providerCalendarId,
        docs: 'Provider calendar identity within the Source.',
      },
      eventId: {
        type: 'string',
        extract: (event) => event.providerEventId,
        docs: 'Provider event identity within the selected calendar.',
      },
      title: {
        type: 'string',
        extract: (event) => event.title,
        docs: 'Calendar Event title.',
      },
      status: {
        type: 'string',
        extract: (event) => event.status,
        docs: 'Normalized Calendar Event status.',
      },
      allDay: {
        type: 'boolean',
        extract: (event) => event.timing.kind === 'all-day',
        docs: 'Whether timing is an all-day half-open date range.',
      },
      startsAt: {
        type: 'datetime',
        extract: (event) =>
          event.timing.kind === 'timed'
            ? new Date(event.timing.start)
            : undefined,
        docs: 'Timed start instant; absent for all-day Calendar Events.',
      },
      endsAt: {
        type: 'datetime',
        extract: (event) =>
          event.timing.kind === 'timed'
            ? new Date(event.timing.end)
            : undefined,
        docs: 'Timed end instant; absent for all-day Calendar Events.',
      },
      startTimeZone: {
        type: 'string',
        extract: (event) =>
          event.timing.kind === 'timed'
            ? event.timing.startTimeZone
            : undefined,
        docs: 'Canonical IANA start time zone; absent for all-day Calendar Events.',
      },
      endTimeZone: {
        type: 'string',
        extract: (event) =>
          event.timing.kind === 'timed' ? event.timing.endTimeZone : undefined,
        docs: 'Canonical IANA end time zone; absent for all-day Calendar Events.',
      },
      startDate: {
        type: 'string',
        extract: (event) =>
          event.timing.kind === 'all-day' ? event.timing.startDate : undefined,
        docs: 'All-day start date; absent for timed Calendar Events.',
      },
      endDate: {
        type: 'string',
        extract: (event) =>
          event.timing.kind === 'all-day' ? event.timing.endDate : undefined,
        docs: 'Exclusive all-day end date; absent for timed Calendar Events.',
      },
      organizer: {
        type: 'string',
        extract: (event) =>
          event.organizer === undefined
            ? undefined
            : participantIdentity(event.organizer),
        docs: 'Organizer email when available, otherwise display name.',
      },
      attendees: {
        type: 'string[]',
        extract: (event) => (event.attendees ?? []).map(participantIdentity),
        docs: 'Attendee emails when available, otherwise display names.',
      },
      seriesEventId: {
        type: 'string',
        extract: (event) => event.series?.providerEventId,
        docs: 'Provider event identity for the recurring series.',
      },
      updatedAt: {
        type: 'datetime',
        extract: (event) =>
          event.updatedAt === undefined ? undefined : new Date(event.updatedAt),
        docs: 'Provider update instant.',
      },
    },
  },
  relations: {
    series: (event) =>
      event.series === undefined ? undefined : { ref: event.series.ref },
  },
  docs: {
    summary: 'A provider-neutral calendar event or occurrence.',
    aliases: ['events'],
  },
})
