import { describe, expect, test } from 'bun:test'
import type { SyncContext, SyncEmission } from '@ctxindex/extension-sdk'
import { microsoftCalendarSyncAt } from './sync'

const sourceId = '01J00000000000000000000000'
const now = new Date('2026-07-16T12:00:00Z')
function event(id: string, subject = id) {
  return {
    id,
    subject,
    isAllDay: true,
    start: { dateTime: '2026-07-16T00:00:00.0000000', timeZone: 'UTC' },
    end: { dateTime: '2026-07-17T00:00:00.0000000', timeZone: 'UTC' },
    lastModifiedDateTime: '2026-07-15T00:00:00Z',
  }
}
function run(
  fetchImpl: typeof fetch,
  cursor: unknown = null,
  config: unknown = {},
  mode: 'sync' | 'resync' = 'sync',
) {
  const emissions: SyncEmission[] = []
  const context: SyncContext = {
    source: { id: sourceId, config },
    cursor,
    mode,
    signal: new AbortController().signal,
    fetch: fetchImpl,
    logger: { trace() {}, debug() {}, info() {}, warn() {}, error() {} },
    emit(emission) {
      emissions.push(emission)
    },
  }
  return { context, emissions }
}
function sequence(
  bodies: Array<{ body: unknown; status?: number }>,
  seen: Array<{ url: string; init?: Parameters<SyncContext['fetch']>[1] }> = [],
) {
  let index = 0
  return (async (input, init) => {
    seen.push({ url: String(input), ...(init === undefined ? {} : { init }) })
    const item = bodies[index++]
    if (!item) throw new Error('unexpected request')
    return new Response(JSON.stringify(item.body), {
      status: item.status ?? 200,
    })
  }) as typeof fetch
}
function checkpoint(emissions: SyncEmission[]) {
  return emissions.find((item) => item.type === 'checkpoint') as Extract<
    SyncEmission,
    { type: 'checkpoint' }
  >
}

describe('Microsoft Calendar sync', () => {
  test('collects default delta pages before sorted emissions and checkpoints only final delta link', async () => {
    const seen: Array<{
      url: string
      init?: Parameters<SyncContext['fetch']>[1]
    }> = []
    const next =
      'https://graph.microsoft.com/v1.0/me/calendarView/delta?$skiptoken=p2'
    const delta =
      'https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=final'
    const value = run(
      sequence(
        [
          { body: { value: [event('b')], '@odata.nextLink': next } },
          { body: { value: [event('a')], '@odata.deltaLink': delta } },
        ],
        seen,
      ),
    )
    await microsoftCalendarSyncAt(value.context, now)
    expect(new URL(seen[0]?.url ?? '').pathname).toBe(
      '/v1.0/me/calendarView/delta',
    )
    expect(seen[0]?.url).toContain('&endDateTime=')
    expect(seen[1]?.url).toBe(next)
    for (const request of seen)
      expect(new Headers(request.init?.headers).get('prefer')).toBe(
        'IdType="ImmutableId", outlook.timezone="UTC"',
      )
    expect(
      value.emissions.map((item) =>
        item.type === 'upsertResource'
          ? (item.resource.payload as { providerEventId: string })
              .providerEventId
          : item.type,
      ),
    ).toEqual(['a', 'b', 'checkpoint'])
    expect(checkpoint(value.emissions).cursor).toMatchObject({
      version: 1,
      strategy: 'delta',
      anchorMonth: '2026-07',
      deltaLink: delta,
      manifest: ['a', 'b'],
    })
  })

  test('applies incremental changes without absence inference and ignores out-of-window removals', async () => {
    const initial = run(
      sequence([
        {
          body: {
            value: [event('a'), event('b')],
            '@odata.deltaLink':
              'https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=one',
          },
        },
      ]),
    )
    await microsoftCalendarSyncAt(initial.context, now)
    const cursor = checkpoint(initial.emissions).cursor
    const updated = run(
      sequence([
        {
          body: {
            value: [
              event('b', 'updated'),
              { id: 'outside', '@removed': { reason: 'deleted' } },
              { id: 'a', '@removed': { reason: 'deleted' } },
            ],
            '@odata.deltaLink':
              'https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=two',
          },
        },
      ]),
      cursor,
    )
    await microsoftCalendarSyncAt(updated.context, now)
    expect(
      updated.emissions.map((item) =>
        item.type === 'removeResource'
          ? `remove:${item.ref.split('/').at(-1)}`
          : item.type === 'upsertResource'
            ? `upsert:${(item.resource.payload as { providerEventId: string }).providerEventId}`
            : item.type,
      ),
    ).toEqual(['remove:a', 'upsert:b', 'checkpoint'])
    expect(checkpoint(updated.emissions).cursor).toMatchObject({
      manifest: ['b'],
      deltaLink: expect.stringContaining('two'),
    })
  })

  test('preserves a cancelled Graph event as a cancelled Profile resource', async () => {
    const seed = run(
      sequence([
        {
          body: {
            value: [event('cancelled')],
            '@odata.deltaLink':
              'https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=one',
          },
        },
      ]),
    )
    await microsoftCalendarSyncAt(seed.context, now)
    const cancelled = run(
      sequence([
        {
          body: {
            value: [{ ...event('cancelled'), isCancelled: true }],
            '@odata.deltaLink':
              'https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=two',
          },
        },
      ]),
      checkpoint(seed.emissions).cursor,
    )
    await microsoftCalendarSyncAt(cancelled.context, now)
    expect(cancelled.emissions).toEqual([
      expect.objectContaining({
        type: 'upsertResource',
        resource: expect.objectContaining({
          payload: expect.objectContaining({ status: 'cancelled' }),
        }),
      }),
      expect.objectContaining({ type: 'checkpoint' }),
    ])
    expect(checkpoint(cancelled.emissions).cursor).toMatchObject({
      manifest: ['cancelled'],
    })
  })

  test('performs one complete reconciliation after expired delta', async () => {
    const seed = run(
      sequence([
        {
          body: {
            value: [event('old')],
            '@odata.deltaLink':
              'https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=expired',
          },
        },
      ]),
    )
    await microsoftCalendarSyncAt(seed.context, now)
    const old = checkpoint(seed.emissions).cursor
    const value = run(
      sequence([
        { body: { error: { code: 'syncStateNotFound' } }, status: 400 },
        {
          body: {
            value: [event('new')],
            '@odata.deltaLink':
              'https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=fresh',
          },
        },
      ]),
      old,
    )
    await microsoftCalendarSyncAt(value.context, now)
    expect(
      value.emissions.some(
        (item) =>
          item.type === 'warning' &&
          item.code === 'microsoft_calendar_delta_expired',
      ),
    ).toBe(true)
    expect(
      value.emissions.some(
        (item) => item.type === 'removeResource' && item.ref.endsWith('/old'),
      ),
    ).toBe(true)
  })

  test('named calendars complete every paged scan and reconcile manifest without delta', async () => {
    const seen: string[] = []
    const next =
      'https://graph.microsoft.com/v1.0/me/calendars/team%2Fcalendar/calendarView?$skiptoken=p2'
    const requests: Array<{
      url: string
      init?: Parameters<SyncContext['fetch']>[1]
    }> = []
    const first = run(
      sequence(
        [
          { body: { value: [event('b')], '@odata.nextLink': next } },
          { body: { value: [event('a')] } },
        ],
        requests,
      ),
      null,
      { calendar_id: 'team/calendar', past_days: 30, future_days: 90 },
    )
    await microsoftCalendarSyncAt(first.context, now)
    seen.push(...requests.map((request) => request.url))
    expect(seen[0]).toContain(
      '/v1.0/me/calendars/team%2Fcalendar/calendarView?startDateTime=',
    )
    expect(checkpoint(first.emissions).cursor).toMatchObject({
      strategy: 'scan',
      manifest: ['a', 'b'],
    })
    expect(checkpoint(first.emissions).cursor).not.toHaveProperty('deltaLink')
    const second = run(
      sequence([{ body: { value: [event('b')] } }]),
      checkpoint(first.emissions).cursor,
      { calendar_id: 'team/calendar', past_days: 30, future_days: 90 },
    )
    await microsoftCalendarSyncAt(second.context, now)
    expect(
      second.emissions.some(
        (item) => item.type === 'removeResource' && item.ref.endsWith('/a'),
      ),
    ).toBe(true)
  })

  test('invalid/config/month/resync cursors cause newly anchored reconciliation', async () => {
    for (const [cursor, config, mode] of [
      [{ bad: true }, {}, 'sync'],
      [null, { past_days: 30 }, 'sync'],
      [null, {}, 'resync'],
    ] as const) {
      const value = run(
        sequence([
          {
            body: {
              value: [],
              '@odata.deltaLink':
                'https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=fresh',
            },
          },
        ]),
        cursor,
        config,
        mode,
      )
      await microsoftCalendarSyncAt(value.context, now)
      expect(checkpoint(value.emissions).cursor).toMatchObject({
        anchorMonth: '2026-07',
      })
    }
  })

  test('emits nothing on partial, malformed-id, repeated, foreign, or aborted collection', async () => {
    const cases: (typeof fetch)[] = [
      sequence([
        {
          body: {
            value: [event('a')],
            '@odata.nextLink':
              'https://graph.microsoft.com/v1.0/me/calendarView/delta?$skiptoken=p2',
          },
        },
        { body: { error: 'bad' }, status: 500 },
      ]),
      sequence([
        {
          body: {
            value: [{ subject: 'missing' }],
            '@odata.deltaLink':
              'https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=x',
          },
        },
      ]),
      sequence([
        {
          body: {
            value: [],
            '@odata.nextLink':
              'https://graph.microsoft.com/v1.0/me/calendarView/delta?$skiptoken=same',
          },
        },
        {
          body: {
            value: [],
            '@odata.nextLink':
              'https://graph.microsoft.com/v1.0/me/calendarView/delta?$skiptoken=same',
          },
        },
      ]),
    ]
    for (const fetchImpl of cases) {
      const value = run(fetchImpl)
      await expect(
        microsoftCalendarSyncAt(value.context, now),
      ).rejects.toBeTruthy()
      expect(value.emissions).toEqual([])
    }
  })
})
