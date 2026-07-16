import { afterEach, expect, test } from 'bun:test'
import {
  type MockGraphCalendarEvent,
  type MockGraphServer,
  startMockGraph,
} from './_mock-graph'

const servers: MockGraphServer[] = []

afterEach(() => {
  for (const server of servers.splice(0)) server.stop()
})

function calendarEvent(id: string, subject = id): MockGraphCalendarEvent {
  return {
    id,
    subject,
    bodyPreview: `${subject} body`,
    body: { contentType: 'text', content: `${subject} body` },
    start: { dateTime: '2026-07-16T10:00:00.000Z', timeZone: 'UTC' },
    end: { dateTime: '2026-07-16T11:00:00.000Z', timeZone: 'UTC' },
    originalStartTimeZone: 'Europe/Ljubljana',
    originalEndTimeZone: 'Europe/Ljubljana',
    isAllDay: false,
    isCancelled: false,
    showAs: 'busy',
    type: 'singleInstance',
    organizer: { emailAddress: { address: 'organizer@example.test' } },
    attendees: [],
    createdDateTime: '2026-07-01T09:00:00.000Z',
    lastModifiedDateTime: '2026-07-01T09:00:00.000Z',
  }
}

async function calendarGet(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      prefer: 'IdType="ImmutableId", outlook.timezone="UTC"',
    },
  })
}

test('Microsoft mock pages default delta and named scans with stateful changes and expiry', async () => {
  const server = startMockGraph({
    calendarEvents: {
      default: [calendarEvent('a'), calendarEvent('b'), calendarEvent('c')],
      'named/calendar': [
        calendarEvent('same-id', 'Named event'),
        calendarEvent('named-2'),
        calendarEvent('named-3'),
      ],
    },
  })
  servers.push(server)

  const initial = new URL(`${server.baseUrl}/v1.0/me/calendarView/delta`)
  initial.searchParams.set('startDateTime', '2026-07-01T00:00:00.000Z')
  initial.searchParams.set('endDateTime', '2026-08-01T00:00:00.000Z')
  const first = (await (await calendarGet(initial.toString())).json()) as {
    value: Array<{ id: string }>
    '@odata.nextLink': string
  }
  expect(first.value.map(({ id }) => id)).toEqual(['a', 'b'])
  const second = (await (
    await calendarGet(first['@odata.nextLink'])
  ).json()) as {
    value: Array<{ id: string }>
    '@odata.deltaLink': string
  }
  expect(second.value.map(({ id }) => id)).toEqual(['c'])

  server.setCalendarEvents('default', [
    calendarEvent('b', 'Updated B'),
    calendarEvent('c'),
    calendarEvent('d'),
  ])
  const deltaFirst = (await (
    await calendarGet(second['@odata.deltaLink'])
  ).json()) as {
    value: Array<{ id: string; '@removed'?: { reason: string } }>
    '@odata.nextLink': string
  }
  const deltaSecond = (await (
    await calendarGet(deltaFirst['@odata.nextLink'])
  ).json()) as {
    value: Array<{ id: string }>
    '@odata.deltaLink': string
  }
  expect([...deltaFirst.value, ...deltaSecond.value]).toMatchObject([
    { id: 'a', '@removed': { reason: 'deleted' } },
    { id: 'b', subject: 'Updated B' },
    { id: 'd' },
  ])

  const named = new URL(
    `${server.baseUrl}/v1.0/me/calendars/${encodeURIComponent('named/calendar')}/calendarView`,
  )
  named.searchParams.set('startDateTime', '2026-07-01T00:00:00.000Z')
  named.searchParams.set('endDateTime', '2026-08-01T00:00:00.000Z')
  const namedFirst = (await (await calendarGet(named.toString())).json()) as {
    value: Array<{ id: string }>
    '@odata.nextLink': string
  }
  const namedSecond = (await (
    await calendarGet(namedFirst['@odata.nextLink'])
  ).json()) as { value: Array<{ id: string }> }
  expect(
    [...namedFirst.value, ...namedSecond.value].map(({ id }) => id),
  ).toEqual(['named-2', 'named-3', 'same-id'])
  expect(namedSecond).not.toHaveProperty('@odata.deltaLink')

  const retrieved = await calendarGet(
    `${server.baseUrl}/v1.0/me/calendars/${encodeURIComponent('named/calendar')}/events/same-id`,
  )
  expect(await retrieved.json()).toMatchObject({
    id: 'same-id',
    subject: 'Named event',
  })
  server.expireDefaultCalendarDeltaOnce()
  expect((await calendarGet(deltaSecond['@odata.deltaLink'])).status).toBe(410)
  expect(
    (
      await fetch(`${server.baseUrl}/v1.0/me/calendar/events/same-id`, {
        method: 'POST',
        headers: {
          prefer: 'IdType="ImmutableId", outlook.timezone="UTC"',
        },
      })
    ).status,
  ).toBe(405)
})

async function refresh(server: MockGraphServer, token: string) {
  return fetch(`${server.baseUrl}/oauth/microsoft/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token,
      client_id: 'fixture-client',
    }),
  })
}

test('Microsoft mock rotates one-use refresh tokens and omits OIDC scopes', async () => {
  const server = startMockGraph()
  servers.push(server)

  const first = await refresh(server, 'microsoft-initial-refresh-token')
  expect(first.status).toBe(200)
  const firstBody = (await first.json()) as Record<string, unknown>
  expect(firstBody.scope).toBe('Mail.ReadWrite User.Read')
  expect(firstBody.refresh_token).toBe('microsoft-rotated-refresh-1')

  expect(
    (await refresh(server, 'microsoft-initial-refresh-token')).status,
  ).toBe(400)
  const second = await refresh(server, String(firstBody.refresh_token))
  expect(second.status).toBe(200)
  expect((await second.json()) as Record<string, unknown>).toMatchObject({
    refresh_token: 'microsoft-rotated-refresh-2',
  })
  expect(server.readRequests()[0]?.body).toBe('[REDACTED OAUTH FORM]')
})

test('Microsoft mock serves personal and work Graph identity shapes', async () => {
  const server = startMockGraph()
  servers.push(server)
  server.setIdentity('personal')
  expect(
    await (await fetch(`${server.baseUrl}/oauth/microsoft/identity`)).json(),
  ).toMatchObject({
    id: 'microsoft-personal-subject',
    mail: null,
    userPrincipalName: 'personal@example.test',
  })
  server.setIdentity('work')
  expect(
    await (await fetch(`${server.baseUrl}/oauth/microsoft/identity`)).json(),
  ).toMatchObject({
    id: 'microsoft-work-subject',
    mail: 'work@example.test',
  })
})

test('Microsoft mock creates then completely replaces one immutable Draft', async () => {
  const server = startMockGraph()
  servers.push(server)
  const headers = {
    'content-type': 'application/json',
    prefer: 'IdType="ImmutableId", outlook.body-content-type="text"',
  }
  const create = await fetch(`${server.baseUrl}/v1.0/me/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      subject: 'Initial',
      body: { contentType: 'Text', content: 'Initial body' },
      toRecipients: [{ emailAddress: { address: 'initial@example.test' } }],
      ccRecipients: [{ emailAddress: { address: 'cc@example.test' } }],
      bccRecipients: [],
    }),
  })
  expect(create.status).toBe(201)
  const created = (await create.json()) as {
    id: string
    isDraft: boolean
  }
  expect(created).toMatchObject({ id: 'outlook-draft-1', isDraft: true })

  const update = await fetch(
    `${server.baseUrl}/v1.0/me/messages/${created.id}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        subject: '',
        body: { contentType: 'Text', content: '' },
        toRecipients: [
          { emailAddress: { address: 'replacement@example.test' } },
        ],
        ccRecipients: [],
        bccRecipients: [],
      }),
    },
  )
  expect(update.status).toBe(200)
  expect(await update.json()).toMatchObject({
    id: created.id,
    isDraft: true,
    subject: '',
    body: { contentType: 'text', content: '' },
    toRecipients: [{ emailAddress: { address: 'replacement@example.test' } }],
    ccRecipients: [],
    bccRecipients: [],
  })
  expect(server.readMessages()).toMatchObject([
    {
      id: created.id,
      isDraft: true,
      subject: '',
      body: '',
      to: [{ address: 'replacement@example.test' }],
      cc: [],
      bcc: [],
    },
  ])
  expect(
    server.readRequests().map(({ method, pathname }) => ({ method, pathname })),
  ).toEqual([
    { method: 'POST', pathname: '/v1.0/me/messages' },
    { method: 'PATCH', pathname: '/v1.0/me/messages/outlook-draft-1' },
  ])
})
