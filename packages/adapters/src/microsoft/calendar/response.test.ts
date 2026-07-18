import { describe, expect, test } from 'bun:test'
import { microsoftCalendarPage } from './response'

const origin = 'https://graph.microsoft.com'

describe('Microsoft Calendar Graph pages', () => {
  test('accepts continuation and strategy-specific final progression', async () => {
    await expect(
      microsoftCalendarPage(
        new Response(
          JSON.stringify({
            value: [],
            '@odata.nextLink': `${origin}/v1.0/me/calendarView/delta?$skiptoken=x`,
          }),
        ),
        'delta',
        '/v1.0/me/calendarView/delta',
      ),
    ).resolves.toMatchObject({ items: [], nextLink: expect.any(String) })
    await expect(
      microsoftCalendarPage(
        new Response(
          JSON.stringify({
            value: [],
            '@odata.deltaLink': `${origin}/v1.0/me/calendarView/delta?$deltatoken=x`,
          }),
        ),
        'delta',
        '/v1.0/me/calendarView/delta',
      ),
    ).resolves.toMatchObject({ items: [], deltaLink: expect.any(String) })
    await expect(
      microsoftCalendarPage(
        new Response(JSON.stringify({ value: [] })),
        'scan',
        '/v1.0/me/calendars/team/calendarView',
      ),
    ).resolves.toEqual({ items: [] })
  })

  test('rejects malformed progression, repeated/foreign/wrong-path links, and missing delta', async () => {
    for (const body of [
      { value: [] },
      {
        value: [],
        '@odata.nextLink': `${origin}/v1.0/me/calendarView/delta?$skiptoken=x`,
        '@odata.deltaLink': `${origin}/v1.0/me/calendarView/delta?$deltatoken=x`,
      },
      {
        value: [],
        '@odata.deltaLink':
          'https://evil.test/v1.0/me/calendarView/delta?$deltatoken=x',
      },
      {
        value: [],
        '@odata.deltaLink': `${origin}/v1.0/me/events/delta?$deltatoken=x`,
      },
      {
        value: 'nope',
        '@odata.deltaLink': `${origin}/v1.0/me/calendarView/delta?$deltatoken=x`,
      },
    ])
      await expect(
        microsoftCalendarPage(
          new Response(JSON.stringify(body)),
          'delta',
          '/v1.0/me/calendarView/delta',
        ),
      ).rejects.toMatchObject({ code: 'provider_bad_response' })
  })

  test('recognizes expired delta errors from 410 and documented error codes', async () => {
    for (const code of [
      'syncStateNotFound',
      'SyncStateNotFound',
      'resyncRequired',
    ])
      await expect(
        microsoftCalendarPage(
          new Response(JSON.stringify({ error: { code } }), { status: 400 }),
          'delta',
          '/v1.0/me/calendarView/delta',
        ),
      ).rejects.toMatchObject({ name: 'MicrosoftCalendarDeltaExpiredError' })
    await expect(
      microsoftCalendarPage(
        new Response('{}', { status: 410 }),
        'delta',
        '/v1.0/me/calendarView/delta',
      ),
    ).rejects.toMatchObject({ name: 'MicrosoftCalendarDeltaExpiredError' })
  })

  test('bounds oversized delta-expiry error bodies before inspecting their code', async () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        error: {
          code: 'SyncStateNotFound',
          message: 'private provider detail '.repeat(4_096),
        },
      }),
    )
    let offset = 0
    let pulls = 0
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        if (offset >= bytes.byteLength) {
          controller.close()
          return
        }
        const next = bytes.slice(offset, offset + 1_024)
        offset += next.byteLength
        controller.enqueue(next)
      },
      cancel() {
        cancelled = true
      },
    })

    await expect(
      microsoftCalendarPage(
        new Response(body, { status: 400 }),
        'delta',
        '/v1.0/me/calendarView/delta',
      ),
    ).rejects.toMatchObject({ code: 'provider_bad_response' })
    expect(cancelled).toBe(true)
    expect(pulls).toBeLessThanOrEqual(18)
  })
})
