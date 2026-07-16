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
})
