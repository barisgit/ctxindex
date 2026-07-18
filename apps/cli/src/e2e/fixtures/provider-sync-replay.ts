import type { MockGoogleCalendarEvent } from '../_mock-google-calendar'
import type { MockGraphCalendarEvent } from '../_mock-graph'

export const replayEventIds = {
  unchanged: 'fixture-unchanged',
  updated: 'fixture-updated',
  removed: 'fixture-removed',
  added: 'fixture-added',
} as const

function googleEvent(
  id: string,
  title: string,
  start: string,
  updated = '2026-07-01T08:00:00Z',
): MockGoogleCalendarEvent {
  return {
    id,
    status: 'confirmed',
    summary: title,
    description: `${title} synthetic replay fixture.`,
    created: '2026-07-01T07:00:00Z',
    updated,
    start: { dateTime: start, timeZone: 'Europe/Ljubljana' },
    end: {
      dateTime: start.replace('09:00:00', '10:00:00'),
      timeZone: 'Europe/Ljubljana',
    },
    organizer: { email: 'organizer@example.test' },
    attendees: [{ email: 'attendee@example.test', responseStatus: 'accepted' }],
  }
}

const googleUnchanged = googleEvent(
  replayEventIds.unchanged,
  'Fixture unchanged planning',
  '2026-07-20T09:00:00+02:00',
)
const googleOriginal = googleEvent(
  replayEventIds.updated,
  'Fixture original review',
  '2026-07-21T09:00:00+02:00',
)
const googleRemoved = googleEvent(
  replayEventIds.removed,
  'Fixture event to remove',
  '2026-07-22T09:00:00+02:00',
)
const googleUpdated = googleEvent(
  replayEventIds.updated,
  'Fixture updated review',
  '2026-07-21T09:00:00+02:00',
  '2026-07-02T08:00:00Z',
)
const googleAdded = googleEvent(
  replayEventIds.added,
  'Fixture newly added session',
  '2026-07-23T09:00:00+02:00',
  '2026-07-02T08:00:00Z',
)

export const googleCalendarReplay = {
  initial: [googleUnchanged, googleOriginal, googleRemoved],
  unchanged: googleUnchanged,
  updated: googleUpdated,
  added: googleAdded,
  updatedTitle: googleUpdated.summary as string,
} as const

function microsoftEvent(
  id: string,
  title: string,
  dateTime: string,
  updated = '2026-07-01T08:00:00Z',
): MockGraphCalendarEvent {
  return {
    id,
    subject: title,
    bodyPreview: `${title} synthetic replay fixture.`,
    body: {
      contentType: 'text',
      content: `${title} synthetic replay fixture.`,
    },
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
        name: 'Fixture Organizer',
        address: 'organizer@example.test',
      },
    },
    attendees: [
      {
        type: 'required',
        status: { response: 'accepted', time: '2026-07-01T08:00:00Z' },
        emailAddress: { address: 'attendee@example.test' },
      },
    ],
    recurrence: null,
    webLink: `https://outlook.example.test/calendar/${id}`,
    createdDateTime: '2026-07-01T07:00:00Z',
    lastModifiedDateTime: updated,
  }
}

const microsoftUnchanged = microsoftEvent(
  replayEventIds.unchanged,
  'Fixture unchanged planning',
  '2026-07-20T09:00:00.000',
)
const microsoftOriginal = microsoftEvent(
  replayEventIds.updated,
  'Fixture original review',
  '2026-07-21T09:00:00.000',
)
const microsoftRemoved = microsoftEvent(
  replayEventIds.removed,
  'Fixture event to remove',
  '2026-07-22T09:00:00.000',
)
const microsoftUpdated = microsoftEvent(
  replayEventIds.updated,
  'Fixture updated review',
  '2026-07-21T09:00:00.000',
  '2026-07-02T08:00:00Z',
)
const microsoftAdded = microsoftEvent(
  replayEventIds.added,
  'Fixture newly added session',
  '2026-07-23T09:00:00.000',
  '2026-07-02T08:00:00Z',
)

export const microsoftCalendarReplay = {
  initial: [microsoftUnchanged, microsoftOriginal, microsoftRemoved],
  mutated: [microsoftUnchanged, microsoftUpdated, microsoftAdded],
  updatedTitle: microsoftUpdated.subject as string,
} as const
