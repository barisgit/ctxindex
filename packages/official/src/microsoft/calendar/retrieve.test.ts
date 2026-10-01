import { describe, expect, test } from 'bun:test'
import type {
  RetrieveContext,
  RetrievedResource,
} from '@ctxindex/extension-sdk'
import { microsoftCalendarRetrieve } from './retrieve'

const sourceId = '01J00000000000000000000000'
function event(id: string) {
  return {
    id,
    subject: 'Planning',
    start: { dateTime: '2026-07-16T09:00:00Z', timeZone: 'UTC' },
    end: { dateTime: '2026-07-16T10:00:00Z', timeZone: 'UTC' },
    lastModifiedDateTime: '2026-07-16T08:00:00Z',
  }
}
function run(ref: string, fetchImpl: typeof fetch, config: unknown = {}) {
  const resources: RetrievedResource[] = []
  const calls: string[] = []
  const context: RetrieveContext = {
    source: { id: sourceId, config },
    ref,
    signal: new AbortController().signal,
    fetch: ((
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      calls.push(String(input))
      return fetchImpl(input, init)
    }) as unknown as typeof fetch,
    logger: { trace() {}, debug() {}, info() {}, warn() {}, error() {} },
    emitResource(resource) {
      resources.push(resource)
    },
    emitArtifact() {},
  }
  return { context, resources, calls }
}

describe('Microsoft Calendar retrieve', () => {
  test('retrieves one default or named calendar event with immutable UTC preferences', async () => {
    for (const [config, path] of [
      [{}, '/v1.0/me/calendar/events/event%2F1'],
      [
        { calendar_id: 'team/calendar' },
        '/v1.0/me/calendars/team%2Fcalendar/events/event%2F1',
      ],
    ] as const) {
      let prefer = ''
      const value = run(
        `ctx://${sourceId}/event/event%2F1`,
        (async (
          input: Parameters<typeof fetch>[0],
          init?: Parameters<typeof fetch>[1],
        ) => {
          expect(new URL(String(input)).pathname).toBe(path)
          prefer = new Headers(init?.headers).get('prefer') ?? ''
          return new Response(JSON.stringify(event('event/1')))
        }) as unknown as typeof fetch,
        config,
      )
      await microsoftCalendarRetrieve(value.context)
      expect(prefer).toBe('IdType="ImmutableId", outlook.timezone="UTC"')
      expect(value.resources).toHaveLength(1)
      expect(value.resources[0]).toMatchObject({
        ref: `ctx://${sourceId}/event/event%2F1`,
        profile: { id: 'calendar.event', version: 1 },
      })
    }
  })
  test('rejects foreign, lowercase/noncanonical refs before provider I/O', async () => {
    for (const ref of [
      `ctx://01J00000000000000000000001/event/a`,
      `ctx://${sourceId.toLowerCase()}/event/a`,
      `ctx://${sourceId}/event/a%2fb`,
    ]) {
      const value = run(ref, (async () => {
        throw new Error('must not fetch')
      }) as unknown as typeof fetch)
      await expect(
        microsoftCalendarRetrieve(value.context),
      ).rejects.toMatchObject({ code: 'invalid_ref' })
      expect(value.calls).toEqual([])
    }
  })
  test('normalizes 404, mismatched/removed bodies, network, and cancellation', async () => {
    const ref = `ctx://${sourceId}/event/a`
    await expect(
      microsoftCalendarRetrieve(
        run(
          ref,
          (async () =>
            new Response('{}', { status: 404 })) as unknown as typeof fetch,
        ).context,
      ),
    ).rejects.toMatchObject({ code: 'not_found' })
    for (const body of [
      event('other'),
      { id: 'a', '@removed': { reason: 'deleted' } },
    ])
      await expect(
        microsoftCalendarRetrieve(
          run(
            ref,
            (async () =>
              new Response(JSON.stringify(body))) as unknown as typeof fetch,
          ).context,
        ),
      ).rejects.toMatchObject({ code: 'provider_bad_response' })
    await expect(
      microsoftCalendarRetrieve(
        run(ref, (async () => {
          throw new Error('offline')
        }) as unknown as typeof fetch).context,
      ),
    ).rejects.toMatchObject({ code: 'network' })
  })
})
