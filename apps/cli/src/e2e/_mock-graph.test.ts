import { afterEach, expect, test } from 'bun:test'
import { type MockGraphServer, startMockGraph } from './_mock-graph'

const servers: MockGraphServer[] = []

afterEach(() => {
  for (const server of servers.splice(0)) server.stop()
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
