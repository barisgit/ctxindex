import { join } from 'node:path'
import type { Sandbox } from '@ctxindex/core/testing'

export interface MockGoogleCalendarEvent {
  readonly id: string
  readonly status?: string
  readonly summary?: string
  readonly description?: string
  readonly location?: string
  readonly htmlLink?: string
  readonly created?: string
  readonly updated?: string
  readonly start?: {
    readonly date?: string
    readonly dateTime?: string
    readonly timeZone?: string
  }
  readonly end?: {
    readonly date?: string
    readonly dateTime?: string
    readonly timeZone?: string
  }
  readonly organizer?: Record<string, unknown>
  readonly attendees?: readonly Record<string, unknown>[]
  readonly recurrence?: readonly string[]
  readonly recurringEventId?: string
  readonly originalStartTime?: Record<string, unknown>
}

export interface MockGoogleCalendarRequest {
  readonly method: string
  readonly pathname: string
  readonly search: string
  readonly authorization: string | null
}

export interface MockGoogleCalendarServer {
  readonly baseUrl: string
  env(
    sandbox: Sandbox,
    extra?: Record<string, string | undefined>,
  ): Record<string, string | undefined>
  readRequests(): readonly MockGoogleCalendarRequest[]
  resetRequests(): void
  setEvents(
    calendarId: string,
    events: readonly MockGoogleCalendarEvent[],
  ): void
  upsertEvent(calendarId: string, event: MockGoogleCalendarEvent): void
  cancelEvent(calendarId: string, eventId: string): void
  expireNextSyncToken(calendarId: string): void
  invalidateNextSyncTokenPermanently(calendarId: string): void
  stop(): void
}

export interface MockGoogleCalendarOptions {
  readonly pageSize?: number
}

interface CalendarState {
  readonly events: Map<string, MockGoogleCalendarEvent>
  readonly changes: {
    readonly revision: number
    readonly event: MockGoogleCalendarEvent
  }[]
  revision: number
  expireNextToken: boolean
  invalidateNextTokenPermanently: boolean
  readonly invalidSyncTokens: Set<string>
}

function cloneEvent(event: MockGoogleCalendarEvent): MockGoogleCalendarEvent {
  return structuredClone(event)
}

function tokenRevision(token: string): number | undefined {
  const match = /^sync-(\d+)$/.exec(token)
  if (!match?.[1]) return undefined
  const revision = Number(match[1])
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : undefined
}

function redactedAuthorization(request: Request): string | null {
  const authorization = request.headers.get('authorization')
  if (!authorization) return null
  const scheme = authorization.split(' ', 1)[0]
  return scheme ? `${scheme} [REDACTED]` : '[REDACTED]'
}

function eventInstant(
  value: MockGoogleCalendarEvent['start'] | MockGoogleCalendarEvent['end'],
): number | undefined {
  const raw = value?.dateTime ?? value?.date
  if (!raw) return undefined
  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? undefined : parsed
}

function inWindow(event: MockGoogleCalendarEvent, url: URL): boolean {
  const minimum = url.searchParams.get('timeMin')
  const maximum = url.searchParams.get('timeMax')
  if (!minimum && !maximum) return true
  const start = eventInstant(event.start)
  const end = eventInstant(event.end)
  if (start === undefined || end === undefined) return false
  return (
    (minimum === null || end > Date.parse(minimum)) &&
    (maximum === null || start < Date.parse(maximum))
  )
}

function sortedEvents(
  events: Iterable<MockGoogleCalendarEvent>,
): MockGoogleCalendarEvent[] {
  return [...events]
    .sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    )
    .map(cloneEvent)
}

export function startMockGoogleCalendar(
  initial: Readonly<Record<string, readonly MockGoogleCalendarEvent[]>> = {},
  options: MockGoogleCalendarOptions = {},
): MockGoogleCalendarServer {
  const calendars = new Map<string, CalendarState>()
  const requests: MockGoogleCalendarRequest[] = []

  const stateFor = (calendarId: string): CalendarState => {
    let state = calendars.get(calendarId)
    if (!state) {
      state = {
        events: new Map(),
        changes: [],
        revision: 0,
        expireNextToken: false,
        invalidateNextTokenPermanently: false,
        invalidSyncTokens: new Set(),
      }
      calendars.set(calendarId, state)
    }
    return state
  }

  const setEvents = (
    calendarId: string,
    events: readonly MockGoogleCalendarEvent[],
  ): void => {
    const state = stateFor(calendarId)
    state.events.clear()
    state.changes.length = 0
    state.revision = 0
    state.expireNextToken = false
    state.invalidateNextTokenPermanently = false
    state.invalidSyncTokens.clear()
    for (const event of events) state.events.set(event.id, cloneEvent(event))
  }

  for (const [calendarId, events] of Object.entries(initial)) {
    setEvents(calendarId, events)
  }

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      requests.push({
        method: request.method,
        pathname: url.pathname,
        search: url.search,
        authorization: redactedAuthorization(request),
      })
      if (request.method !== 'GET') {
        return Response.json({ error: 'method_not_allowed' }, { status: 405 })
      }

      const match = url.pathname.match(
        /^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/,
      )
      if (!match?.[1]) {
        return Response.json({ error: 'not_found' }, { status: 404 })
      }
      const calendarId = decodeURIComponent(match[1])
      const state = stateFor(calendarId)
      if (match[2]) {
        const eventId = decodeURIComponent(match[2])
        const event = state.events.get(eventId)
        if (!event || event.status === 'cancelled') {
          return Response.json({ error: 'not_found' }, { status: 404 })
        }
        return Response.json(cloneEvent(event))
      }

      const syncToken = url.searchParams.get('syncToken')
      const pageToken = url.searchParams.get('pageToken')
      const pageIndex = pageToken === null ? 0 : Number(pageToken)
      const pageSize = options.pageSize
      if (
        !Number.isInteger(pageIndex) ||
        pageIndex < 0 ||
        (pageSize !== undefined && pageSize < 1)
      ) {
        return Response.json({ error: 'invalid_page_token' }, { status: 400 })
      }
      const page = (items: readonly MockGoogleCalendarEvent[]) => {
        if (pageSize === undefined) {
          return { items, nextSyncToken: `sync-${state.revision}` }
        }
        const offset = pageIndex * pageSize
        const selected = items.slice(offset, offset + pageSize)
        return {
          items: selected,
          ...(offset + pageSize < items.length
            ? { nextPageToken: String(pageIndex + 1) }
            : { nextSyncToken: `sync-${state.revision}` }),
        }
      }
      if (syncToken !== null) {
        if (state.invalidateNextTokenPermanently) {
          state.invalidateNextTokenPermanently = false
          state.invalidSyncTokens.add(syncToken)
        }
        if (state.invalidSyncTokens.has(syncToken)) {
          return Response.json(
            { error: { errors: [{ reason: 'fullSyncRequired' }] } },
            { status: 410 },
          )
        }
        if (state.expireNextToken) {
          state.expireNextToken = false
          return Response.json(
            { error: { errors: [{ reason: 'fullSyncRequired' }] } },
            { status: 410 },
          )
        }
        const revision = tokenRevision(syncToken)
        if (revision === undefined || revision > state.revision) {
          return Response.json(
            { error: { errors: [{ reason: 'fullSyncRequired' }] } },
            { status: 410 },
          )
        }
        const latest = new Map<string, MockGoogleCalendarEvent>()
        for (const change of state.changes) {
          if (change.revision > revision) {
            latest.set(change.event.id, change.event)
          }
        }
        return Response.json(page(sortedEvents(latest.values())))
      }

      return Response.json(
        page(
          sortedEvents(state.events.values()).filter((event) =>
            inWindow(event, url),
          ),
        ),
      )
    },
  })

  const baseUrl = server.url.toString().replace(/\/$/, '')
  return {
    baseUrl,
    env(sandbox, extra = {}) {
      return {
        NODE_ENV: 'test',
        CTXINDEX_GOOGLE_CALENDAR_MOCK_BASE_URL: baseUrl,
        CTXINDEX_KEYTAR_MOCK_FILE: join(sandbox.dir, 'keytar.json'),
        ...extra,
      }
    },
    readRequests() {
      return requests.map((request) => ({ ...request }))
    },
    resetRequests() {
      requests.length = 0
    },
    setEvents,
    upsertEvent(calendarId, event) {
      const state = stateFor(calendarId)
      state.revision += 1
      const cloned = cloneEvent(event)
      state.events.set(event.id, cloned)
      state.changes.push({ revision: state.revision, event: cloned })
    },
    cancelEvent(calendarId, eventId) {
      const state = stateFor(calendarId)
      state.revision += 1
      state.events.delete(eventId)
      state.changes.push({
        revision: state.revision,
        event: { id: eventId, status: 'cancelled' },
      })
    },
    expireNextSyncToken(calendarId) {
      stateFor(calendarId).expireNextToken = true
    },
    invalidateNextSyncTokenPermanently(calendarId) {
      stateFor(calendarId).invalidateNextTokenPermanently = true
    },
    stop() {
      server.stop(true)
    },
  }
}
