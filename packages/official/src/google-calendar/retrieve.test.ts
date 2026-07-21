import { describe, expect, test } from 'bun:test'
import type {
  RetrieveContext,
  RetrievedResource,
} from '@ctxindex/extension-sdk'
import { googleCalendarRetrieve } from './retrieve'

const sourceId = '01J00000000000000000000000'

function context(
  ref: string,
  fetchImpl: typeof fetch,
  config: unknown = { calendar_id: 'team@example.test' },
) {
  const resources: RetrievedResource[] = []
  const signal = new AbortController().signal
  const value: RetrieveContext = {
    source: { id: sourceId, config },
    ref,
    signal,
    fetch: fetchImpl,
    logger: { trace() {}, debug() {}, info() {}, warn() {}, error() {} },
    emitResource(resource) {
      resources.push(resource)
    },
    emitArtifact() {},
  }
  return { context: value, resources, signal }
}

function providerEvent(id: string) {
  return {
    id,
    status: 'confirmed',
    summary: 'Planning',
    start: { dateTime: '2026-07-16T09:00:00Z' },
    end: { dateTime: '2026-07-16T10:00:00Z' },
    updated: '2026-07-16T08:00:00Z',
  }
}

describe('Google Calendar retrieve', () => {
  test('fetches one event from the selected calendar and emits one complete normalized Resource', async () => {
    let request: { url: URL; init: RequestInit | undefined } | undefined
    const run = context(`ctx://${sourceId}/event/event%2Fone`, (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      request = { url: new URL(String(input)), init }
      return new Response(JSON.stringify(providerEvent('event/one')))
    }) as unknown as typeof fetch)

    await googleCalendarRetrieve(run.context)

    expect(request?.url.pathname).toBe(
      '/calendar/v3/calendars/team%40example.test/events/event%2Fone',
    )
    expect(request?.init?.signal).toBe(run.signal)
    expect(request?.init?.method).toBeUndefined()
    expect(run.resources).toHaveLength(1)
    expect(run.resources[0]).toMatchObject({
      ref: `ctx://${sourceId}/event/event%2Fone`,
      profile: { id: 'calendar.event', version: 1 },
      title: 'Planning',
      payload: {
        provider: 'google',
        providerCalendarId: 'team@example.test',
        providerEventId: 'event/one',
      },
    })
    expect(run.resources[0]).not.toHaveProperty('completeness')
  })

  test.each([
    [`ctx://${sourceId.toLowerCase()}/event/event`, 'lowercase authority'],
    ['ctx://01J00000000000000000000001/event/event', 'another Source'],
    [`ctx://${sourceId}/event/event%2fone`, 'non-canonical encoding'],
    [`ctx://${sourceId}/message/event`, 'wrong kind'],
    [`ctx://${sourceId}/event/`, 'empty id'],
    [`ctx://${sourceId}/event/event?x=1`, 'query'],
    ['not-a-ref', 'malformed Ref'],
  ])('rejects %s (%s) before Adapter fetch', async (ref) => {
    let fetches = 0
    const run = context(ref, (async () => {
      fetches += 1
      return new Response('{}')
    }) as unknown as typeof fetch)
    await expect(googleCalendarRetrieve(run.context)).rejects.toMatchObject({
      code: 'invalid_ref',
    })
    expect(fetches).toBe(0)
    expect(run.resources).toEqual([])
  })

  test('maps not found and malformed or mismatched provider responses', async () => {
    const ref = `ctx://${sourceId}/event/event`
    const missing = context(
      ref,
      (async () =>
        new Response('', { status: 404 })) as unknown as typeof fetch,
    )
    await expect(googleCalendarRetrieve(missing.context)).rejects.toMatchObject(
      {
        code: 'not_found',
      },
    )

    for (const response of [
      new Response('{', { status: 200 }),
      new Response(JSON.stringify(providerEvent('different'))),
      new Response(JSON.stringify({ id: 'event', status: 'confirmed' })),
    ]) {
      const invalid = context(
        ref,
        (async () => response) as unknown as typeof fetch,
      )
      await expect(
        googleCalendarRetrieve(invalid.context),
      ).rejects.toMatchObject({
        code: 'provider_bad_response',
      })
      expect(invalid.resources).toEqual([])
    }
  })

  test('preserves cancellation and classifies other fetch failures', async () => {
    const ref = `ctx://${sourceId}/event/event`
    const abort = new AbortController()
    abort.abort()
    const cancelled = context(ref, (async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      expect(init?.signal).toBe(cancelled.context.signal)
      throw new DOMException('aborted', 'AbortError')
    }) as unknown as typeof fetch)
    Object.defineProperty(cancelled.context, 'signal', { value: abort.signal })
    await expect(
      googleCalendarRetrieve(cancelled.context),
    ).rejects.toMatchObject({
      name: 'AbortError',
    })

    const failed = context(ref, (async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch)
    await expect(googleCalendarRetrieve(failed.context)).rejects.toMatchObject({
      code: 'network',
    })
  })
})
