import { createHash } from 'node:crypto'
import { CtxindexSyncError } from '@ctxindex/core/errors'
import type { SyncContext, SyncEmission } from '@ctxindex/extension-sdk'
import { calendarEventRef } from '@ctxindex/profiles'
import { z } from 'zod'
import { graphHeaders, graphUrl, validateGraphOpaqueLink } from '../transport'
import {
  type MicrosoftCalendarSourceConfig,
  microsoftCalendarSourceConfigSchema,
} from './config'
import {
  type MicrosoftCalendarWarning,
  normalizeMicrosoftCalendarEvent,
} from './event'
import {
  MicrosoftCalendarDeltaExpiredError,
  type MicrosoftCalendarPage,
  microsoftCalendarPage,
} from './response'

const CALENDAR_PREFERENCE = 'IdType="ImmutableId", outlook.timezone="UTC"'
const instantSchema = z.iso.datetime({ offset: true })
const baseCursor = {
  version: z.literal(1),
  configFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  anchorMonth: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/),
  window: z
    .object({ startDateTime: instantSchema, endDateTime: instantSchema })
    .strict()
    .refine((w) => Date.parse(w.endDateTime) > Date.parse(w.startDateTime)),
  manifest: z.array(z.string().min(1)),
}
const cursorSchema = z
  .discriminatedUnion('strategy', [
    z
      .object({
        ...baseCursor,
        strategy: z.literal('delta'),
        deltaLink: z.string().min(1),
      })
      .strict(),
    z.object({ ...baseCursor, strategy: z.literal('scan') }).strict(),
  ])
  .refine((c) =>
    c.manifest.every((id, i) => {
      const previous = c.manifest[i - 1]
      return i === 0 || (previous !== undefined && compare(previous, id) < 0)
    }),
  )
type Cursor = z.infer<typeof cursorSchema>
function compare(a: string, b: string) {
  const aa = Array.from(a),
    bb = Array.from(b)
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
    const d = (aa[i]?.codePointAt(0) ?? 0) - (bb[i]?.codePointAt(0) ?? 0)
    if (d) return d
  }
  return aa.length - bb.length
}
function fingerprint(config: MicrosoftCalendarSourceConfig) {
  return `sha256:${createHash('sha256')
    .update(
      JSON.stringify({
        calendar_id: config.calendar_id,
        past_days: config.past_days,
        future_days: config.future_days,
      }),
    )
    .digest('hex')}`
}
function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}
function anchored(now: Date, config: MicrosoftCalendarSourceConfig) {
  const anchor = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
  return {
    anchorMonth: anchor.toISOString().slice(0, 7),
    window: {
      startDateTime: addDays(anchor, -config.past_days).toISOString(),
      endDateTime: addDays(anchor, config.future_days).toISOString(),
    },
  }
}
function windowValid(cursor: Cursor, config: MicrosoftCalendarSourceConfig) {
  const day = 86400000
  const anchorMs =
    Date.parse(cursor.window.startDateTime) + config.past_days * day
  const anchor = new Date(anchorMs)
  return (
    anchor.toISOString().endsWith('T00:00:00.000Z') &&
    anchor.toISOString().slice(0, 7) === cursor.anchorMonth &&
    Date.parse(cursor.window.endDateTime) ===
      anchorMs + config.future_days * day
  )
}
function route(config: MicrosoftCalendarSourceConfig) {
  return config.calendar_id === 'default'
    ? '/v1.0/me/calendarView/delta'
    : `/v1.0/me/calendars/${encodeURIComponent(config.calendar_id)}/calendarView`
}
function initialUrl(path: string, window: Cursor['window']) {
  const params = new URLSearchParams({
    startDateTime: window.startDateTime,
    endDateTime: window.endDateTime,
  })
  return `${graphUrl(path)}?${params}`
}
async function request(context: SyncContext, url: string) {
  try {
    return await context.fetch(url, {
      headers: graphHeaders(CALENDAR_PREFERENCE),
      signal: context.signal,
    })
  } catch (cause) {
    if (context.signal.aborted) return undefined
    throw new CtxindexSyncError(
      'Microsoft Calendar request failed',
      'network',
      { cause },
    )
  }
}
interface Collection {
  items: readonly unknown[]
  deltaLink?: string
}
function requiredDeltaLink(result: Collection): string {
  if (result.deltaLink !== undefined) return result.deltaLink
  throw new CtxindexSyncError(
    'Microsoft Graph omitted the final calendar delta link',
    'provider_bad_response',
  )
}
async function collect(
  context: SyncContext,
  strategy: 'delta' | 'scan',
  path: string,
  url: string,
  initial: boolean,
): Promise<Collection | undefined> {
  const items: unknown[] = []
  const seen = new Set<string>()
  let next = url
  while (true) {
    if (context.signal.aborted) return undefined
    const progressionKey = new URL(next).toString()
    if (seen.has(progressionKey))
      throw new CtxindexSyncError(
        'Microsoft Graph repeated a calendar progression link',
        'provider_bad_response',
      )
    seen.add(progressionKey)
    const response = await request(context, next)
    if (!response) return undefined
    let page: MicrosoftCalendarPage
    try {
      page = await microsoftCalendarPage(response, strategy, path)
    } catch (cause) {
      if (initial && cause instanceof MicrosoftCalendarDeltaExpiredError)
        throw new CtxindexSyncError(
          'Microsoft Graph rejected an initial calendar reconciliation',
          'provider_bad_response',
          { cause },
        )
      throw cause
    }
    items.push(...page.items)
    if (page.nextLink) {
      next = validateGraphOpaqueLink(page.nextLink, path)
      continue
    }
    return { items, ...(page.deltaLink ? { deltaLink: page.deltaLink } : {}) }
  }
}
function usableId(item: unknown) {
  const parsed = z
    .object({ id: z.string().min(1) })
    .passthrough()
    .safeParse(item)
  return parsed.success ? parsed.data.id : undefined
}
function isRemoved(item: unknown) {
  const parsed = z
    .object({ '@removed': z.unknown().optional() })
    .passthrough()
    .safeParse(item)
  return parsed.success && Boolean(parsed.data['@removed'])
}
async function emitAll(
  context: SyncContext,
  emissions: readonly SyncEmission[],
) {
  for (const emission of emissions) {
    if (context.signal.aborted) return false
    await context.emit(emission)
  }
  return true
}
function build(
  context: SyncContext,
  config: MicrosoftCalendarSourceConfig,
  items: readonly unknown[],
  previous: readonly string[],
  complete: boolean,
) {
  const byId = new Map<string, unknown>()
  for (const item of items) {
    const id = usableId(item)
    if (!id)
      throw new CtxindexSyncError(
        'Microsoft Graph returned an event without a usable id',
        'provider_bad_response',
      )
    byId.set(id, item)
  }
  const manifest = new Set(previous)
  const operations: Array<{ id: string; emission: SyncEmission }> = []
  const warnings: MicrosoftCalendarWarning[] = []
  for (const [id, item] of [...byId].sort(([a], [b]) => compare(a, b))) {
    const normalized = normalizeMicrosoftCalendarEvent(
      item,
      context.source.id,
      config.calendar_id,
    )
    warnings.push(...normalized.warnings)
    if (isRemoved(item)) {
      if (manifest.has(id))
        operations.push({
          id,
          emission: {
            type: 'removeResource',
            ref: calendarEventRef(context.source.id, id),
          },
        })
      manifest.delete(id)
      continue
    }
    manifest.add(id)
    if (normalized.resource)
      operations.push({
        id,
        emission: { type: 'upsertResource', resource: normalized.resource },
      })
  }
  if (complete) {
    for (const id of previous) {
      if (!byId.has(id) && manifest.has(id)) {
        operations.push({
          id,
          emission: {
            type: 'removeResource',
            ref: calendarEventRef(context.source.id, id),
          },
        })
        manifest.delete(id)
      }
    }
  }
  operations.sort((a, b) => compare(a.id, b.id))
  return {
    manifest: [...manifest].sort(compare),
    emissions: [
      ...warnings.map((w) => ({ type: 'warning' as const, ...w })),
      ...operations.map((o) => o.emission),
    ],
  }
}
async function reconcile(
  context: SyncContext,
  config: MicrosoftCalendarSourceConfig,
  now: Date,
  previous: readonly string[],
  warning?: Extract<SyncEmission, { type: 'warning' }>,
) {
  const anchor = anchored(now, config)
  const strategy = config.calendar_id === 'default' ? 'delta' : 'scan'
  const path = route(config)
  const result = await collect(
    context,
    strategy,
    path,
    initialUrl(path, anchor.window),
    true,
  )
  if (!result || context.signal.aborted) return
  const built = build(context, config, result.items, previous, true)
  if (
    !(await emitAll(context, [
      ...(warning ? [warning] : []),
      ...built.emissions,
    ])) ||
    context.signal.aborted
  )
    return
  await context.emit({
    type: 'checkpoint',
    cursor: {
      version: 1,
      strategy,
      configFingerprint: fingerprint(config),
      anchorMonth: anchor.anchorMonth,
      window: anchor.window,
      manifest: built.manifest,
      ...(strategy === 'delta' ? { deltaLink: requiredDeltaLink(result) } : {}),
    },
  })
}
async function incremental(
  context: SyncContext,
  config: MicrosoftCalendarSourceConfig,
  cursor: Extract<Cursor, { strategy: 'delta' }>,
) {
  const path = route(config)
  const result = await collect(
    context,
    'delta',
    path,
    validateGraphOpaqueLink(cursor.deltaLink, path),
    false,
  )
  if (!result || context.signal.aborted) return
  const built = build(context, config, result.items, cursor.manifest, false)
  if (!(await emitAll(context, built.emissions)) || context.signal.aborted)
    return
  await context.emit({
    type: 'checkpoint',
    cursor: {
      ...cursor,
      deltaLink: requiredDeltaLink(result),
      manifest: built.manifest,
    },
  })
}
export async function microsoftCalendarSyncAt(context: SyncContext, now: Date) {
  const config = microsoftCalendarSourceConfigSchema.parse(
    context.source.config,
  )
  const parsed = cursorSchema.safeParse(context.cursor)
  if (context.cursor === null) {
    await reconcile(context, config, now, [])
    return
  }
  if (!parsed.success) {
    await reconcile(context, config, now, [], {
      type: 'warning',
      code: 'microsoft_calendar_invalid_cursor',
      message:
        'Ignored invalid microsoft.calendar cursor and performed a full reconciliation.',
    })
    return
  }
  const cursor = parsed.data
  const expected = config.calendar_id === 'default' ? 'delta' : 'scan'
  const reason: readonly [string, string] | undefined =
    context.mode === 'resync'
      ? [
          'microsoft_calendar_resync',
          'Performed a requested full Microsoft Calendar reconciliation.',
        ]
      : cursor.configFingerprint !== fingerprint(config) ||
          cursor.strategy !== expected
        ? [
            'microsoft_calendar_config_changed',
            'Microsoft Calendar configuration changed; performed a full reconciliation.',
          ]
        : !windowValid(cursor, config)
          ? [
              'microsoft_calendar_invalid_cursor',
              'Ignored invalid microsoft.calendar cursor and performed a full reconciliation.',
            ]
          : cursor.anchorMonth !== now.toISOString().slice(0, 7)
            ? [
                'microsoft_calendar_window_refreshed',
                'Microsoft Calendar rolling window entered a new UTC month; performed a full reconciliation.',
              ]
            : undefined
  if (reason) {
    await reconcile(
      context,
      config,
      now,
      reason[0] === 'microsoft_calendar_invalid_cursor' ? [] : cursor.manifest,
      { type: 'warning', code: reason[0], message: reason[1] },
    )
    return
  }
  if (cursor.strategy === 'scan') {
    await reconcile(context, config, now, cursor.manifest)
    return
  }
  try {
    await incremental(context, config, cursor)
  } catch (cause) {
    if (!(cause instanceof MicrosoftCalendarDeltaExpiredError)) throw cause
    await reconcile(context, config, now, cursor.manifest, {
      type: 'warning',
      code: 'microsoft_calendar_delta_expired',
      message:
        'Microsoft Graph invalidated the delta link; performed one full reconciliation.',
    })
  }
}
export async function microsoftCalendarSync(context: SyncContext) {
  await microsoftCalendarSyncAt(context, new Date())
}
