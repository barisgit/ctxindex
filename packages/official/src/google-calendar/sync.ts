import { createHash } from 'node:crypto'
import { CtxindexSyncError } from '@ctxindex/core/errors'
import type { SyncContext, SyncEmission } from '@ctxindex/extension-sdk'
import { calendarEventRef } from '@ctxindex/profiles'
import { z } from 'zod'
import {
  type GoogleCalendarSourceConfig,
  googleCalendarSourceConfigSchema,
} from './config'
import {
  type GoogleCalendarWarning,
  normalizeGoogleCalendarEvent,
} from './event'
import {
  GoogleCalendarSyncTokenInvalidError,
  googleCalendarEventsPage,
} from './response'
import { googleCalendarApiUrl } from './url'

const MAX_RESULTS = '2500'
const instantSchema = z.iso.datetime({ offset: true })
const cursorSchema = z
  .object({
    version: z.literal(1),
    configFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    anchorMonth: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/),
    window: z
      .object({ timeMin: instantSchema, timeMax: instantSchema })
      .strict()
      .refine((value) => Date.parse(value.timeMax) > Date.parse(value.timeMin)),
    syncToken: z.string().min(1),
    manifest: z.array(z.string().min(1)),
  })
  .strict()
  .refine(
    (cursor) =>
      cursor.manifest.every(
        (id, index) =>
          index === 0 ||
          compareCodePoints(cursor.manifest[index - 1] as string, id) < 0,
      ),
    'manifest must be code-point sorted and unique',
  )

type Cursor = z.infer<typeof cursorSchema>

function compareCodePoints(left: string, right: string): number {
  const leftPoints = left[Symbol.iterator]()
  const rightPoints = right[Symbol.iterator]()
  while (true) {
    const leftPoint = leftPoints.next()
    const rightPoint = rightPoints.next()
    if (leftPoint.done || rightPoint.done) {
      if (leftPoint.done && rightPoint.done) return 0
      return leftPoint.done ? -1 : 1
    }

    const difference =
      (leftPoint.value.codePointAt(0) ?? 0) -
      (rightPoint.value.codePointAt(0) ?? 0)
    if (difference !== 0) return difference
  }
}

function cursorWindowMatchesConfig(
  cursor: Cursor,
  config: GoogleCalendarSourceConfig,
): boolean {
  const dayMs = 24 * 60 * 60 * 1000
  const anchorMs = Date.parse(cursor.window.timeMin) + config.past_days * dayMs
  const anchor = new Date(anchorMs)
  return (
    anchor.toISOString().endsWith('T00:00:00.000Z') &&
    anchor.toISOString().slice(0, 7) === cursor.anchorMonth &&
    Date.parse(cursor.window.timeMax) === anchorMs + config.future_days * dayMs
  )
}

function configFingerprint(config: GoogleCalendarSourceConfig): string {
  const input = JSON.stringify({
    calendar_id: config.calendar_id,
    past_days: config.past_days,
    future_days: config.future_days,
  })
  return `sha256:${createHash('sha256').update(input).digest('hex')}`
}

function addUtcDays(value: Date, days: number): Date {
  const result = new Date(value)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function anchoredWindow(now: Date, config: GoogleCalendarSourceConfig) {
  const anchor = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
  return {
    anchorMonth: anchor.toISOString().slice(0, 7),
    window: {
      timeMin: addUtcDays(anchor, -config.past_days).toISOString(),
      timeMax: addUtcDays(anchor, config.future_days).toISOString(),
    },
  }
}

function eventsPath(calendarId: string): string {
  return `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
}

async function fetchPage(
  context: SyncContext,
  path: string,
  params: URLSearchParams,
) {
  const url = `${googleCalendarApiUrl(path)}?${params.toString()}`
  let response: Response
  try {
    response = await context.fetch(url, { signal: context.signal })
  } catch (cause) {
    if (context.signal.aborted) return undefined
    throw new CtxindexSyncError('Google Calendar request failed', 'network', {
      cause,
    })
  }
  return googleCalendarEventsPage(response)
}

interface CollectedFullScan {
  readonly finalToken: string
  readonly items: readonly unknown[]
}

async function collectFullScan(
  context: SyncContext,
  config: GoogleCalendarSourceConfig,
  window: Cursor['window'],
): Promise<CollectedFullScan | undefined> {
  const items: unknown[] = []
  const seenPageTokens = new Set<string>()
  let pageToken: string | undefined
  while (true) {
    if (context.signal.aborted) return undefined
    const params = new URLSearchParams({
      singleEvents: 'true',
      showDeleted: 'true',
      timeMin: window.timeMin,
      timeMax: window.timeMax,
      maxResults: MAX_RESULTS,
    })
    if (pageToken !== undefined) params.set('pageToken', pageToken)
    let page: Awaited<ReturnType<typeof fetchPage>>
    try {
      page = await fetchPage(context, eventsPath(config.calendar_id), params)
    } catch (cause) {
      if (cause instanceof GoogleCalendarSyncTokenInvalidError) {
        throw new CtxindexSyncError(
          'Google Calendar invalidated a full-scan request',
          'provider_bad_response',
          { cause },
        )
      }
      throw cause
    }
    if (page === undefined) return undefined
    items.push(...page.items)
    if (page.nextPageToken === undefined) {
      if (page.nextSyncToken === undefined) {
        throw new CtxindexSyncError(
          'Google Calendar final events page omitted nextSyncToken',
          'provider_bad_response',
        )
      }
      return { finalToken: page.nextSyncToken, items }
    }
    if (seenPageTokens.has(page.nextPageToken)) {
      throw new CtxindexSyncError(
        'Google Calendar repeated an events page token',
        'provider_bad_response',
      )
    }
    seenPageTokens.add(page.nextPageToken)
    pageToken = page.nextPageToken
  }
}

function usableId(item: unknown): string | undefined {
  if (typeof item !== 'object' || item === null) return undefined
  const id = (item as { id?: unknown }).id
  return typeof id === 'string' && id.length > 0 ? id : undefined
}

function cancelled(item: unknown): boolean {
  return (item as { status?: unknown } | null)?.status === 'cancelled'
}

async function emitAll(
  context: SyncContext,
  emissions: readonly SyncEmission[],
): Promise<boolean> {
  for (const emission of emissions) {
    if (context.signal.aborted) return false
    await context.emit(emission)
  }
  return true
}

async function incrementalSync(
  context: SyncContext,
  config: GoogleCalendarSourceConfig,
  cursor: Cursor,
): Promise<void> {
  const scan = await collectIncremental(context, config, cursor.syncToken)
  if (scan === undefined || context.signal.aborted) return
  const finalById = new Map<string, unknown>()
  const warnings: GoogleCalendarWarning[] = []
  for (const item of scan.items) {
    const id = usableId(item)
    if (id === undefined) {
      throw new CtxindexSyncError(
        'Google Calendar returned an event without a usable id',
        'provider_bad_response',
      )
    }
    finalById.set(id, item)
  }

  const manifest = new Set(cursor.manifest)
  const operations: { id: string; emission: SyncEmission }[] = []
  for (const [id, item] of finalById) {
    if (cancelled(item)) {
      manifest.delete(id)
      operations.push({
        id,
        emission: {
          type: 'removeResource',
          ref: calendarEventRef(context.source.id, id),
        },
      })
      continue
    }
    manifest.add(id)
    const normalized = normalizeGoogleCalendarEvent(
      item,
      context.source.id,
      config.calendar_id,
    )
    warnings.push(...normalized.warnings)
    if (normalized.resource !== undefined) {
      operations.push({
        id,
        emission: { type: 'upsertResource', resource: normalized.resource },
      })
    }
  }

  warnings.sort(
    (left, right) =>
      compareCodePoints(left.ref ?? '', right.ref ?? '') ||
      compareCodePoints(left.code, right.code),
  )
  operations.sort((left, right) => compareCodePoints(left.id, right.id))
  if (
    !(await emitAll(context, [
      ...warnings.map((entry) => ({ type: 'warning' as const, ...entry })),
      ...operations.map((entry) => entry.emission),
    ]))
  ) {
    return
  }
  if (context.signal.aborted) return
  await context.emit({
    type: 'checkpoint',
    cursor: {
      ...cursor,
      syncToken: scan.finalToken,
      manifest: [...manifest].sort(compareCodePoints),
    },
  })
}

async function collectIncremental(
  context: SyncContext,
  config: GoogleCalendarSourceConfig,
  syncToken: string,
): Promise<CollectedFullScan | undefined> {
  const items: unknown[] = []
  const seenPageTokens = new Set<string>()
  let pageToken: string | undefined
  while (true) {
    if (context.signal.aborted) return undefined
    const params = new URLSearchParams({
      singleEvents: 'true',
      showDeleted: 'true',
      maxResults: MAX_RESULTS,
      syncToken,
    })
    if (pageToken !== undefined) params.set('pageToken', pageToken)
    const page = await fetchPage(
      context,
      eventsPath(config.calendar_id),
      params,
    )
    if (page === undefined) return undefined
    items.push(...page.items)
    if (page.nextPageToken === undefined) {
      if (page.nextSyncToken === undefined) {
        throw new CtxindexSyncError(
          'Google Calendar final events page omitted nextSyncToken',
          'provider_bad_response',
        )
      }
      return { finalToken: page.nextSyncToken, items }
    }
    if (seenPageTokens.has(page.nextPageToken)) {
      throw new CtxindexSyncError(
        'Google Calendar repeated an events page token',
        'provider_bad_response',
      )
    }
    seenPageTokens.add(page.nextPageToken)
    pageToken = page.nextPageToken
  }
}

async function fullSync(
  context: SyncContext,
  config: GoogleCalendarSourceConfig,
  now: Date,
  previousManifest: readonly string[],
  warning?: Extract<SyncEmission, { type: 'warning' }>,
): Promise<void> {
  const anchor = anchoredWindow(now, config)
  const scan = await collectFullScan(context, config, anchor.window)
  if (scan === undefined || context.signal.aborted) return

  const finalById = new Map<string, unknown>()
  const warnings: GoogleCalendarWarning[] = []
  for (const item of scan.items) {
    const id = usableId(item)
    if (id === undefined) {
      throw new CtxindexSyncError(
        'Google Calendar returned an event without a usable id',
        'provider_bad_response',
      )
    }
    finalById.set(id, item)
  }

  const manifest = new Set<string>()
  const operations: { id: string; emission: SyncEmission }[] = []
  for (const [id, item] of finalById) {
    if (cancelled(item)) {
      operations.push({
        id,
        emission: {
          type: 'removeResource',
          ref: calendarEventRef(context.source.id, id),
        },
      })
      continue
    }
    manifest.add(id)
    const normalized = normalizeGoogleCalendarEvent(
      item,
      context.source.id,
      config.calendar_id,
    )
    warnings.push(...normalized.warnings)
    if (normalized.resource !== undefined) {
      operations.push({
        id,
        emission: { type: 'upsertResource', resource: normalized.resource },
      })
    }
  }
  for (const id of previousManifest) {
    if (!manifest.has(id) && !finalById.has(id)) {
      operations.push({
        id,
        emission: {
          type: 'removeResource',
          ref: calendarEventRef(context.source.id, id),
        },
      })
    }
  }

  warnings.sort(
    (left, right) =>
      compareCodePoints(left.ref ?? '', right.ref ?? '') ||
      compareCodePoints(left.code, right.code),
  )
  operations.sort((left, right) => compareCodePoints(left.id, right.id))
  const emissions: SyncEmission[] = [
    ...(warning === undefined ? [] : [warning]),
    ...warnings.map((entry) => ({ type: 'warning' as const, ...entry })),
    ...operations.map((entry) => entry.emission),
  ]
  if (!(await emitAll(context, emissions))) return
  if (context.signal.aborted) return
  await context.emit({
    type: 'checkpoint',
    cursor: {
      version: 1,
      configFingerprint: configFingerprint(config),
      anchorMonth: anchor.anchorMonth,
      window: anchor.window,
      syncToken: scan.finalToken,
      manifest: [...manifest].sort(compareCodePoints),
    },
  })
}

export async function googleCalendarSyncAt(
  context: SyncContext,
  now: Date,
): Promise<void> {
  if (context.signal.aborted) return
  const config = googleCalendarSourceConfigSchema.parse(context.source.config)
  const parsedCursor = cursorSchema.safeParse(context.cursor)
  if (context.cursor === null) {
    await fullSync(context, config, now, [], undefined)
    return
  }
  if (!parsedCursor.success) {
    await fullSync(context, config, now, [], {
      type: 'warning',
      code: 'google_calendar_invalid_cursor',
      message:
        'Ignored invalid google.calendar cursor and performed a full reconciliation.',
    })
    return
  }

  const cursor = parsedCursor.data
  const fingerprintChanged =
    cursor.configFingerprint !== configFingerprint(config)
  if (!fingerprintChanged && !cursorWindowMatchesConfig(cursor, config)) {
    await fullSync(context, config, now, [], {
      type: 'warning',
      code: 'google_calendar_invalid_cursor',
      message:
        'Ignored invalid google.calendar cursor and performed a full reconciliation.',
    })
    return
  }
  const currentMonth = now.toISOString().slice(0, 7)
  const fullReason =
    context.mode === 'resync'
      ? {
          code: 'google_calendar_resync',
          message: 'Performed a requested full Google Calendar reconciliation.',
        }
      : fingerprintChanged
        ? {
            code: 'google_calendar_config_changed',
            message:
              'Google Calendar configuration changed; performed a full reconciliation.',
          }
        : cursor.anchorMonth !== currentMonth
          ? {
              code: 'google_calendar_window_refreshed',
              message:
                'Google Calendar rolling window entered a new UTC month; performed a full reconciliation.',
            }
          : undefined
  if (fullReason !== undefined) {
    await fullSync(context, config, now, cursor.manifest, {
      type: 'warning',
      ...fullReason,
    })
    return
  }

  try {
    await incrementalSync(context, config, cursor)
  } catch (cause) {
    if (!(cause instanceof GoogleCalendarSyncTokenInvalidError)) throw cause
    await fullSync(context, config, now, cursor.manifest, {
      type: 'warning',
      code: 'google_calendar_sync_token_invalid',
      message:
        'Google Calendar invalidated the sync token; performed one full reconciliation.',
    })
  }
}

export async function googleCalendarSync(context: SyncContext): Promise<void> {
  await googleCalendarSyncAt(context, new Date())
}
