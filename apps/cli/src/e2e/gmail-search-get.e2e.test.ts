import { expect, test } from 'bun:test'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'
import { type MockGmailServer, startMockGmail } from './_mock-gmail'
import { installLoopbackBrowser } from './_oauth-account'

function parseSourceId(stdout: string): string {
  const match = /^source added: (.+)$/m.exec(stdout)
  if (!match?.[1]) throw new Error(`Could not parse source id from: ${stdout}`)
  return match[1]
}

async function initialize(
  sandbox: Sandbox,
  mock: MockGmailServer,
): Promise<{ env: Record<string, string | undefined>; sourceId: string }> {
  const bin = await installLoopbackBrowser(sandbox.dir)
  const env = mock.env(sandbox, {
    PATH: `${bin}:${process.env.PATH ?? ''}`,
    CTXINDEX_LOOPBACK_TIMEOUT_SECS: '5',
  })
  const init = await sandbox.run(['init'], { env })
  expect(init.exitCode, init.stderr).toBe(0)
  const realm = await sandbox.run(['realm', 'add', 'mail'], { env })
  expect(realm.exitCode, realm.stderr).toBe(0)
  const app = await sandbox.run(
    ['oauth-app', 'add', 'google', 'google', '--from-env'],
    { env },
  )
  expect(app.exitCode, app.stderr).toBe(0)
  const account = await sandbox.run(
    ['account', 'add', 'google', '--app', 'google', '--label', 'gmail'],
    { env },
  )
  expect(account.exitCode, account.stderr).toBe(0)
  const source = await sandbox.run(
    [
      'source',
      'add',
      'google.mailbox',
      '--realm',
      'mail',
      '--account',
      'gmail',
      '--label',
      'gmail-mailbox',
    ],
    { env },
  )
  expect(source.exitCode, source.stderr).toBe(0)
  return { env, sourceId: parseSourceId(source.stdout) }
}

test('mocked Gmail remote search and cached get use stable canonical Refs', async () => {
  const sandbox = await createSandbox()
  const mock = startMockGmail()
  try {
    const { env, sourceId } = await initialize(sandbox, mock)
    expect(mock.readRequests()).toEqual([
      { method: 'POST', pathname: '/oauth/google/token', search: '' },
      {
        method: 'GET',
        pathname: '/oauth/google/identity',
        search: '',
      },
    ])
    mock.resetRequests()

    const searched = await sandbox.run(
      ['search', '--remote', '--format', 'json', 'ctxindex mock'],
      { env },
    )
    expect(searched.exitCode, searched.stderr).toBe(0)
    expect(searched.stderr).toBe('')
    const ref = `ctx://${sourceId}/message/msg-1`
    const searchJson = JSON.parse(searched.stdout)
    expect(searchJson).toEqual({
      results: [
        {
          ref,
          profile: { id: 'mail.message', version: 1 },
          sourceId,
          origin: 'provider',
          originRank: 0,
          title: 'ctxindex mock hello',
          summary: null,
          occurredAt: expect.any(Number),
          chunks: [],
        },
      ],
      warnings: [],
    })
    expect(ref).not.toContain('/mail.message/')
    expect(mock.readRequests()).toEqual([
      {
        method: 'GET',
        pathname: '/gmail/v1/users/me/messages',
        search: '?q=ctxindex+mock+-in%3Adrafts&maxResults=20',
      },
      {
        method: 'GET',
        pathname: '/gmail/v1/users/me/messages/msg-1',
        search:
          '?format=metadata&fields=id%2CthreadId%2ClabelIds%2Csnippet%2CinternalDate%2Cpayload%2Fheaders&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date&metadataHeaders=Message-ID&metadataHeaders=In-Reply-To&metadataHeaders=References&metadataHeaders=Reply-To',
      },
    ])

    const firstGet = await sandbox.run(['get', '--format', 'json', ref], {
      env,
    })
    expect(firstGet.exitCode, firstGet.stderr).toBe(0)
    expect(firstGet.stderr).toBe('')
    expect(JSON.parse(firstGet.stdout)).toMatchObject({
      resource: {
        ref,
        sourceId,
        profile: { id: 'mail.message', version: 1 },
        origin: 'adhoc',
        title: 'ctxindex mock hello',
        payload: {
          providerMessageId: 'msg-1',
          bodyText: 'A mock Gmail message body for ctxindex e2e tests.',
        },
      },
      warnings: [],
    })
    const fullRequests = () =>
      mock
        .readRequests()
        .filter(
          (request) =>
            request.pathname === '/gmail/v1/users/me/messages/msg-1' &&
            request.search === '?format=full',
        )
    expect(fullRequests()).toHaveLength(1)

    const secondGet = await sandbox.run(['get', '--format', 'json', ref], {
      env,
    })
    expect(secondGet.exitCode, secondGet.stderr).toBe(0)
    expect(secondGet.stdout).toBe(firstGet.stdout)
    expect(fullRequests()).toHaveLength(1)
  } finally {
    mock.stop()
    await sandbox.cleanup()
  }
}, 30_000)

test('Gmail get rejects malformed and nonexistent provider Refs', async () => {
  const sandbox = await createSandbox()
  const mock = startMockGmail()
  try {
    const { env, sourceId } = await initialize(sandbox, mock)
    mock.resetRequests()

    const malformed = await sandbox.run(
      ['get', '--format', 'json', 'not-a-ref'],
      {
        env,
      },
    )
    expect(malformed.exitCode).toBe(2)
    expect(mock.readRequests()).toEqual([])

    const missing = await sandbox.run(
      ['get', '--format', 'json', `ctx://${sourceId}/message/does-not-exist`],
      { env },
    )
    expect(missing.exitCode).toBe(50)
    expect(missing.stderr).toContain('status 404')
    expect(mock.readRequests()).toEqual([
      {
        method: 'GET',
        pathname: '/gmail/v1/users/me/messages/does-not-exist',
        search: '?format=full',
      },
    ])
  } finally {
    mock.stop()
    await sandbox.cleanup()
  }
}, 30_000)
