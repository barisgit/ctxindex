import { afterEach, expect, test } from 'bun:test'
import { type MockGmailServer, startMockGmail } from './_mock-gmail'

const servers: MockGmailServer[] = []

afterEach(() => {
  for (const server of servers.splice(0)) server.stop()
})

test('Google mocks expose independently configurable stable identities', async () => {
  const personal = startMockGmail({
    identitySubject: 'google-personal-subject',
    identityEmail: 'personal@example.test',
  })
  const work = startMockGmail({
    identitySubject: 'google-work-subject',
    identityEmail: 'work@example.test',
  })
  servers.push(personal, work)

  expect(
    await (
      await fetch(`${personal.baseUrl}/oauth/google/identity`, {
        headers: { authorization: 'Bearer akzx-access-token-secret' },
      })
    ).json(),
  ).toEqual({
    sub: 'google-personal-subject',
    email: 'personal@example.test',
    email_verified: true,
  })
  expect(
    await (
      await fetch(`${work.baseUrl}/oauth/google/identity`, {
        headers: { authorization: 'Bearer akzx-access-token-secret' },
      })
    ).json(),
  ).toEqual({
    sub: 'google-work-subject',
    email: 'work@example.test',
    email_verified: true,
  })

  expect(
    (
      await fetch(`${personal.baseUrl}/gmail/v1/users/me/messages`, {
        headers: { authorization: 'Bearer wrong-account-token' },
      })
    ).status,
  ).toBe(401)
})
