import { describe, expect, test } from 'bun:test'
import type { SyncContext, SyncEmission } from '@ctxindex/extension-sdk'
import { googleCalendarSyncAt } from './sync'

const sourceId = '01J00000000000000000000000'

function event(id: string, summary = id) {
  return {
    id,
    status: 'confirmed',
    summary,
    start: { date: '2026-07-16' },
    end: { date: '2026-07-17' },
    updated: '2026-07-16T00:00:00Z',
  }
}

function context(
  fetchImpl: typeof fetch,
  options: Partial<
    Pick<SyncContext, 'cursor' | 'mode' | 'signal' | 'emit'>
  > = {},
  config: unknown = {},
): { context: SyncContext; emissions: SyncEmission[] } {
  const emissions: SyncEmission[] = []
  return {
    emissions,
    context: {
      source: { id: sourceId, config },
      fetch: fetchImpl,
      logger: { trace() {}, debug() {}, info() {}, warn() {}, error() {} },
      cursor: options.cursor ?? null,
      mode: options.mode ?? 'sync',
      signal: options.signal ?? new AbortController().signal,
      emit:
        options.emit ??
        ((emission) => {
          emissions.push(emission)
        }),
    },
  }
}

describe('Google Calendar sync', () => {
  test('buffers a multipage full scan, sorts final event operations, and checkpoints only the final token', async () => {
    const urls: URL[] = []
    const responses = [
      {
        items: [event('z')],
        nextPageToken: 'page-2',
        nextSyncToken: 'sync-not-final',
      },
      { items: [event('a')], nextSyncToken: 'sync-final' },
    ]
    const run = context((async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      expect(init?.signal).toBe(run.context.signal)
      urls.push(new URL(String(input)))
      return new Response(JSON.stringify(responses.shift()))
    }) as unknown as typeof fetch)

    await googleCalendarSyncAt(run.context, new Date('2026-07-16T18:30:00Z'))

    expect(urls).toHaveLength(2)
    expect(urls[0]?.pathname).toBe('/calendar/v3/calendars/primary/events')
    expect(Object.fromEntries(urls[0]?.searchParams ?? [])).toEqual({
      singleEvents: 'true',
      showDeleted: 'true',
      timeMin: '2025-07-16T00:00:00.000Z',
      timeMax: '2028-07-15T00:00:00.000Z',
      maxResults: '2500',
    })

    expect(Object.fromEntries(urls[1]?.searchParams ?? [])).toEqual({
      singleEvents: 'true',
      showDeleted: 'true',
      timeMin: '2025-07-16T00:00:00.000Z',
      timeMax: '2028-07-15T00:00:00.000Z',
      maxResults: '2500',
      pageToken: 'page-2',
    })
    expect(urls.every((url) => !url.searchParams.has('orderBy'))).toBe(true)
    expect(
      run.emissions.map((emission) =>
        emission.type === 'upsertResource'
          ? `upsert:${(emission.resource.payload as { providerEventId: string }).providerEventId}`
          : emission.type,
      ),
    ).toEqual(['upsert:a', 'upsert:z', 'checkpoint'])
    expect(run.emissions.at(-1)).toMatchObject({
      type: 'checkpoint',
      cursor: {
        version: 1,
        anchorMonth: '2026-07',
        window: {
          timeMin: '2025-07-16T00:00:00.000Z',
          timeMax: '2028-07-15T00:00:00.000Z',
        },
        syncToken: 'sync-final',
        manifest: ['a', 'z'],
      },
    })
  })

  test('rejects a cursor whose stored window is not anchored to its config', async () => {
    const initial = context(
      (async () =>
        new Response(
          JSON.stringify({ items: [event('old')], nextSyncToken: 'sync-1' }),
        )) as unknown as typeof fetch,
    )
    await googleCalendarSyncAt(
      initial.context,
      new Date('2026-07-16T00:00:00Z'),
    )
    const cursor = structuredClone(
      (
        initial.emissions.at(-1) as Extract<
          SyncEmission,
          { type: 'checkpoint' }
        >
      ).cursor,
    ) as { window: { timeMax: string } }
    cursor.window.timeMax = '2028-07-16T00:00:00.000Z'
    const urls: URL[] = []
    const run = context(
      (async (input: string | URL | Request) => {
        urls.push(new URL(String(input)))
        return new Response(
          JSON.stringify({ items: [event('new')], nextSyncToken: 'fresh' }),
        )
      }) as unknown as typeof fetch,
      { cursor },
    )

    await googleCalendarSyncAt(run.context, new Date('2026-07-20T00:00:00Z'))

    expect(urls[0]?.searchParams.has('timeMin')).toBe(true)
    expect(run.emissions[0]).toMatchObject({
      type: 'warning',
      code: 'google_calendar_invalid_cursor',
    })
  })

  test('replaces an invalid cursor with one bounded full scan', async () => {
    let calls = 0
    const run = context(
      (async () => {
        calls += 1
        return new Response(
          JSON.stringify({ items: [event('a')], nextSyncToken: 'fresh' }),
        )
      }) as unknown as typeof fetch,
      { cursor: { version: 1, manifest: ['bad'] } },
    )

    await googleCalendarSyncAt(run.context, new Date('2026-07-16T00:00:00Z'))

    expect(calls).toBe(1)
    expect(run.emissions[0]).toMatchObject({
      type: 'warning',
      code: 'google_calendar_invalid_cursor',
    })
    expect(run.emissions.at(-1)).toMatchObject({
      type: 'checkpoint',
      cursor: { syncToken: 'fresh', manifest: ['a'] },
    })
  })

  test.each([
    [
      'config change',
      'google_calendar_config_changed',
      '2026-07-20T00:00:00Z',
      'sync',
      { past_days: 30, future_days: 730, calendar_id: 'primary' },
    ],
    [
      'month roll',
      'google_calendar_window_refreshed',
      '2026-08-01T00:00:00Z',
      'sync',
      {},
    ],
    ['resync', 'google_calendar_resync', '2026-07-20T00:00:00Z', 'resync', {}],
  ] as const)('uses a new full window for %s and reconciles only after success', async (_label, warningCode, now, mode, config) => {
    const initial = context(
      (async () =>
        new Response(
          JSON.stringify({ items: [event('old')], nextSyncToken: 'sync-1' }),
        )) as unknown as typeof fetch,
    )
    await googleCalendarSyncAt(
      initial.context,
      new Date('2026-07-16T00:00:00Z'),
    )
    const cursor = (
      initial.emissions.at(-1) as Extract<SyncEmission, { type: 'checkpoint' }>
    ).cursor
    const urls: URL[] = []
    const run = context(
      (async (input: string | URL | Request) => {
        urls.push(new URL(String(input)))
        return new Response(
          JSON.stringify({ items: [event('new')], nextSyncToken: 'sync-2' }),
        )
      }) as unknown as typeof fetch,
      { cursor, mode },
      config,
    )

    await googleCalendarSyncAt(run.context, new Date(now))

    expect(urls).toHaveLength(1)
    expect(urls[0]?.searchParams.has('timeMin')).toBe(true)
    expect(urls[0]?.searchParams.has('syncToken')).toBe(false)
    expect(run.emissions[0]).toMatchObject({
      type: 'warning',
      code: warningCode,
    })
    expect(
      run.emissions.filter((emission) => emission.type === 'removeResource'),
    ).toHaveLength(1)
    expect(run.emissions.at(-1)).toMatchObject({
      type: 'checkpoint',
      cursor: { syncToken: 'sync-2', manifest: ['new'] },
    })
  })

  test('buffers reconciliation so repeated tokens and partial fetch failure emit nothing', async () => {
    const repeatedPages = [
      { items: [event('a')], nextPageToken: 'same' },
      { items: [event('b')], nextPageToken: 'same' },
    ]
    const repeated = context(
      (async () =>
        new Response(
          JSON.stringify(repeatedPages.shift()),
        )) as unknown as typeof fetch,
    )
    await expect(
      googleCalendarSyncAt(repeated.context, new Date('2026-07-16T00:00:00Z')),
    ).rejects.toMatchObject({ code: 'provider_bad_response' })
    expect(repeated.emissions).toEqual([])

    let calls = 0
    const partial = context((async () => {
      calls += 1
      if (calls === 1) {
        return new Response(
          JSON.stringify({ items: [event('a')], nextPageToken: 'p2' }),
        )
      }
      throw new Error('offline')
    }) as unknown as typeof fetch)
    await expect(
      googleCalendarSyncAt(partial.context, new Date('2026-07-16T00:00:00Z')),
    ).rejects.toMatchObject({ code: 'network' })
    expect(partial.emissions).toEqual([])
  })

  test('rejects an unidentifiable event before emitting or advancing the cursor', async () => {
    const run = context(
      (async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                status: 'confirmed',
                start: { date: '2026-07-16' },
                end: { date: '2026-07-17' },
                updated: '2026-07-16T00:00:00Z',
              },
            ],
            nextSyncToken: 'must-not-commit',
          }),
        )) as unknown as typeof fetch,
    )

    await expect(
      googleCalendarSyncAt(run.context, new Date('2026-07-16T00:00:00Z')),
    ).rejects.toMatchObject({ code: 'provider_bad_response' })
    expect(run.emissions).toEqual([])
  })

  test('cancellation and emit failure never produce a checkpoint', async () => {
    const abort = new AbortController()
    let calls = 0
    const cancelledRun = context(
      (async () => {
        calls += 1
        if (calls === 1) {
          return new Response(
            JSON.stringify({ items: [event('a')], nextPageToken: 'p2' }),
          )
        }
        abort.abort()
        throw new DOMException('aborted', 'AbortError')
      }) as unknown as typeof fetch,
      { signal: abort.signal },
    )
    await googleCalendarSyncAt(
      cancelledRun.context,
      new Date('2026-07-16T00:00:00Z'),
    )
    expect(cancelledRun.emissions).toEqual([])

    const emitted: SyncEmission[] = []
    const failedEmit = context(
      (async () =>
        new Response(
          JSON.stringify({ items: [event('a')], nextSyncToken: 'sync-1' }),
        )) as unknown as typeof fetch,
      {
        emit: (emission) => {
          emitted.push(emission)
          if (emission.type === 'upsertResource')
            throw new Error('storage failed')
        },
      },
    )
    await expect(
      googleCalendarSyncAt(
        failedEmit.context,
        new Date('2026-07-16T00:00:00Z'),
      ),
    ).rejects.toThrow('storage failed')
    expect(emitted.some((emission) => emission.type === 'checkpoint')).toBe(
      false,
    )
  })

  test('diff emits the same candidates and cursor while core owns rollback', async () => {
    const response = () =>
      new Response(
        JSON.stringify({ items: [event('a')], nextSyncToken: 'sync-1' }),
      )
    const syncRun = context((async () => response()) as unknown as typeof fetch)
    const diffRun = context(
      (async () => response()) as unknown as typeof fetch,
      { mode: 'diff' },
    )
    await googleCalendarSyncAt(
      syncRun.context,
      new Date('2026-07-16T00:00:00Z'),
    )
    await googleCalendarSyncAt(
      diffRun.context,
      new Date('2026-07-16T00:00:00Z'),
    )
    expect(diffRun.emissions).toEqual(syncRun.emissions)
  })

  test('handles HTTP 410 with exactly one newly anchored full reconciliation', async () => {
    const initial = context(
      (async () =>
        new Response(
          JSON.stringify({
            items: [event('a'), event('c')],
            nextSyncToken: 'sync-1',
          }),
        )) as unknown as typeof fetch,
    )
    await googleCalendarSyncAt(
      initial.context,
      new Date('2026-07-16T18:30:00Z'),
    )
    const cursor = (
      initial.emissions.at(-1) as Extract<SyncEmission, { type: 'checkpoint' }>
    ).cursor
    const urls: URL[] = []
    const run = context(
      (async (input: string | URL | Request) => {
        urls.push(new URL(String(input)))
        if (urls.length === 1) return new Response('', { status: 410 })
        return new Response(
          JSON.stringify({ items: [event('b')], nextSyncToken: 'sync-new' }),
        )
      }) as unknown as typeof fetch,
      { cursor },
    )

    await googleCalendarSyncAt(run.context, new Date('2026-07-20T22:00:00Z'))

    expect(urls).toHaveLength(2)
    expect(urls[0]?.searchParams.get('syncToken')).toBe('sync-1')
    expect(urls[1]?.searchParams.get('syncToken')).toBeNull()
    expect(urls[1]?.searchParams.get('timeMin')).toBe(
      '2025-07-20T00:00:00.000Z',
    )
    expect(
      run.emissions.map((emission) =>
        emission.type === 'warning'
          ? emission.code
          : emission.type === 'removeResource'
            ? `remove:${decodeURIComponent(emission.ref.split('/').at(-1) ?? '')}`
            : emission.type === 'upsertResource'
              ? `upsert:${(emission.resource.payload as { providerEventId: string }).providerEventId}`
              : emission.type,
      ),
    ).toEqual([
      'google_calendar_sync_token_invalid',
      'remove:a',
      'upsert:b',
      'remove:c',
      'checkpoint',
    ])
    expect(run.emissions.at(-1)).toMatchObject({
      type: 'checkpoint',
      cursor: { syncToken: 'sync-new', manifest: ['b'] },
    })
  })

  test('retains usable malformed and unsupported ids while removing skeletal cancellations', async () => {
    const run = context(
      (async () =>
        new Response(
          JSON.stringify({
            items: [
              { id: 'cancelled', status: 'cancelled' },
              {
                id: 'malformed',
                status: 'confirmed',
                start: { date: '2026-07-16' },
              },
              {
                ...event('unsupported'),
                eventType: 'birthday',
              },
            ],
            nextSyncToken: 'sync-1',
          }),
        )) as unknown as typeof fetch,
    )

    await googleCalendarSyncAt(run.context, new Date('2026-07-16T00:00:00Z'))

    expect(
      run.emissions.filter((emission) => emission.type === 'upsertResource'),
    ).toEqual([])
    expect(
      run.emissions
        .filter((emission) => emission.type === 'warning')
        .map((emission) => emission.code),
    ).toEqual([
      'google_calendar_malformed_event',
      'google_calendar_unsupported_event',
    ])
    expect(run.emissions.at(-1)).toMatchObject({
      type: 'checkpoint',
      cursor: { manifest: ['malformed', 'unsupported'] },
    })
  })

  test('increments with compatible parameters, skeletal deletion, and no absence inference', async () => {
    const initial = context(
      (async () =>
        new Response(
          JSON.stringify({
            items: [event('a'), event('c')],
            nextSyncToken: 'sync-1',
          }),
        )) as unknown as typeof fetch,
    )
    await googleCalendarSyncAt(
      initial.context,
      new Date('2026-07-16T18:30:00Z'),
    )
    const cursor = (
      initial.emissions.at(-1) as Extract<SyncEmission, { type: 'checkpoint' }>
    ).cursor

    const urls: URL[] = []
    const pages = [
      { items: [{ id: 'a', status: 'cancelled' }], nextPageToken: 'p2' },
      { items: [event('b', 'Updated')], nextSyncToken: 'sync-2' },
    ]
    const run = context(
      (async (input: string | URL | Request) => {
        urls.push(new URL(String(input)))
        return new Response(JSON.stringify(pages.shift()))
      }) as unknown as typeof fetch,
      { cursor },
      { calendar_id: 'primary', past_days: 365, future_days: 730 },
    )

    await googleCalendarSyncAt(run.context, new Date('2026-07-20T00:00:00Z'))

    expect(Object.fromEntries(urls[0]?.searchParams ?? [])).toEqual({
      singleEvents: 'true',
      showDeleted: 'true',
      maxResults: '2500',
      syncToken: 'sync-1',
    })
    expect(Object.fromEntries(urls[1]?.searchParams ?? [])).toEqual({
      singleEvents: 'true',
      showDeleted: 'true',
      maxResults: '2500',
      syncToken: 'sync-1',
      pageToken: 'p2',
    })
    expect(
      run.emissions.map((emission) =>
        emission.type === 'removeResource'
          ? 'remove:a'
          : emission.type === 'upsertResource'
            ? `upsert:${(emission.resource.payload as { providerEventId: string }).providerEventId}`
            : emission.type,
      ),
    ).toEqual(['remove:a', 'upsert:b', 'checkpoint'])
    expect(run.emissions.at(-1)).toMatchObject({
      type: 'checkpoint',
      cursor: { syncToken: 'sync-2', manifest: ['b', 'c'] },
    })
  })
})
