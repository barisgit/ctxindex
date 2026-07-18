import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'
import { type MockGmailServer, startMockGmail } from './_mock-gmail'
import { installLoopbackBrowser } from './_oauth-account'

const createActionId = 'communication.message.draft.create'
const updateActionId = 'communication.message.draft.update'
const sourceLabel = 'gmail-mailbox'

function parseSourceId(stdout: string): string {
  const match = /^source added: (.+)$/m.exec(stdout)
  if (!match?.[1]) throw new Error(`Could not parse source id from: ${stdout}`)
  return match[1]
}

function grantScopes(sandbox: Sandbox): string[] {
  const db = new Database(
    join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite'),
    { readonly: true },
  )
  try {
    const grant = db.prepare('SELECT scopes_json FROM grants').get() as {
      scopes_json: string
    }
    return JSON.parse(grant.scopes_json)
  } finally {
    db.close()
  }
}

function resourceCount(sandbox: Sandbox): number {
  const db = new Database(
    join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite'),
    { readonly: true },
  )
  try {
    return (
      db.prepare('SELECT COUNT(*) AS count FROM resources').get() as {
        count: number
      }
    ).count
  } finally {
    db.close()
  }
}

function decodeRaw(body: string): string {
  const parsed = JSON.parse(body) as { message: { raw: string } }
  return Buffer.from(parsed.message.raw, 'base64url').toString('utf8')
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
  const init = await sandbox.run(['init'])
  expect(init.exitCode, init.stderr).toBe(0)
  const realm = await sandbox.run(['realm', 'add', 'mail'])
  expect(realm.exitCode, realm.stderr).toBe(0)
  const client = await sandbox.run(['client', 'add', 'google', '--from-env'], {
    env,
  })
  expect(client.exitCode, client.stderr).toBe(0)
  const account = await sandbox.run(
    ['account', 'add', 'google', '--label', 'gmail'],
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
      sourceLabel,
    ],
    { env },
  )
  expect(source.exitCode, source.stderr).toBe(0)
  return { env, sourceId: parseSourceId(source.stdout) }
}

test('compiled CLI creates and completely replaces a mocked Gmail Draft without a send affordance', async () => {
  const sandbox = await createSandbox()
  const mock = startMockGmail()
  try {
    const { env, sourceId } = await initialize(sandbox, mock)
    expect(grantScopes(sandbox).sort()).toEqual([
      'email',
      'https://www.googleapis.com/auth/calendar.events.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.readonly',
      'openid',
    ])
    expect(
      mock
        .readRecordedRequests()
        .find(({ pathname }) => pathname === '/oauth/google/token')?.body,
    ).toBe('[REDACTED OAUTH FORM]')
    mock.resetRequests()
    mock.resetDraftState()

    for (const [actionId, requiredBranches] of [
      [
        createActionId,
        [
          ['to', 'subject', 'bodyText'],
          ['replyToRef', 'bodyText'],
        ],
      ],
      [
        updateActionId,
        [
          ['ref', 'to', 'subject', 'bodyText'],
          ['ref', 'replyToRef', 'bodyText'],
        ],
      ],
    ] as const) {
      const described = await sandbox.run(
        ['action', 'describe', actionId, '--source', sourceLabel, '--json'],
        { env },
      )
      expect(described.exitCode, described.stderr).toBe(0)
      expect(described.stderr).toBe('')
      const description = JSON.parse(described.stdout)
      expect({
        id: description.id,
        profile: description.profile,
        effect: description.effect,
        output: description.output,
        requiredBranches: description.input.anyOf?.map(
          (branch: { required?: string[] }) => branch.required,
        ),
        sources: description.sources,
      }).toEqual({
        id: actionId,
        profile: { id: 'communication.message', version: 1 },
        effect: 'reversible',
        output: { id: 'communication.message', version: 1 },
        requiredBranches,
        sources: [
          {
            id: sourceId,
            adapter: { id: 'google.mailbox', version: 1 },
            available: true,
          },
        ],
      })
    }
    expect(mock.readRecordedRequests()).toEqual([])

    const invalid = await sandbox.run(
      [
        'action',
        'run',
        createActionId,
        '--source',
        sourceLabel,
        '--input',
        JSON.stringify({
          to: ['victim@example.test\r\nBcc: injected@example.test'],
          subject: 'Invalid',
          bodyText: 'Must not persist',
        }),
        '--json',
      ],
      { env },
    )
    expect(invalid.exitCode).toBe(2)
    expect(invalid.stderr).toContain('Invalid input for Action')

    const malformed = await sandbox.run(
      [
        'action',
        'run',
        createActionId,
        '--source',
        sourceLabel,
        '--input',
        '{not-json',
        '--json',
      ],
      { env },
    )
    expect(malformed.exitCode).toBe(2)
    expect(malformed.stderr).toContain('Action input must be inline JSON')
    expect(mock.readRecordedRequests()).toEqual([])

    expect(resourceCount(sandbox)).toBe(0)
    expect(mock.readRecordedRequests()).toEqual([])

    const createInput = {
      to: ['first@example.test', 'second@example.test'],
      cc: ['copy@example.test'],
      subject: 'Original subject',
      bodyText: 'Original body\nsecond line',
    }
    const created = await sandbox.run(
      [
        'action',
        'run',
        createActionId,
        '--source',
        sourceLabel,
        '--input',
        JSON.stringify(createInput),
        '--json',
      ],
      { env },
    )
    expect(created.exitCode, created.stderr).toBe(0)
    expect(created.stderr).toBe('')
    const ref = `ctx://${sourceId}/draft/draft-1`
    const createdJson = JSON.parse(created.stdout)
    expect(createdJson).toMatchObject({
      resource: {
        ref,
        sourceId,
        profile: { id: 'communication.message', version: 1 },
        origin: 'adhoc',
        title: 'Original subject',
        payload: {
          providerDraftId: 'draft-1',
          providerMessageId: 'draft-message-1',
          ...createInput,
        },
      },
      warnings: [],
    })
    expect(mock.readRecordedRequests()).toEqual([
      {
        method: 'POST',
        pathname: '/gmail/v1/users/me/drafts',
        search: '',
        authorization: 'Bearer [REDACTED]',
        body: expect.any(String),
      },
    ])
    expect(decodeRaw(mock.readRecordedRequests()[0]?.body ?? '')).toBe(
      [
        'To: first@example.test, second@example.test',
        'Cc: copy@example.test',
        'Subject: Original subject',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        'Original body',
        'second line',
      ].join('\r\n'),
    )
    const mutationRequests = [...mock.readRecordedRequests()]

    mock.resetRequests()
    const updateInput = {
      ref,
      to: ['replacement@example.test'],
      bcc: ['private@example.test'],
      subject: 'Replacement subject',
      bodyText: 'Replacement body',
    }
    const updated = await sandbox.run(
      [
        'action',
        'run',
        updateActionId,
        '--source',
        sourceLabel,
        '--input',
        JSON.stringify(updateInput),
        '--json',
      ],
      { env },
    )
    expect(updated.exitCode, updated.stderr).toBe(0)
    expect(updated.stderr).toBe('')
    const updatedJson = JSON.parse(updated.stdout)
    expect(updatedJson).toMatchObject({
      resource: {
        ref,
        sourceId,
        profile: { id: 'communication.message', version: 1 },
        origin: 'adhoc',
        title: 'Replacement subject',
        payload: {
          providerDraftId: 'draft-1',
          providerMessageId: 'draft-message-2',
          to: updateInput.to,
          cc: [],
          bcc: updateInput.bcc,
          subject: updateInput.subject,
          bodyText: updateInput.bodyText,
        },
      },
      warnings: [],
    })
    expect(updatedJson.resource.payload).not.toMatchObject({
      subject: createInput.subject,
      bodyText: createInput.bodyText,
    })
    expect(mock.readRecordedRequests()).toEqual([
      {
        method: 'PUT',
        pathname: '/gmail/v1/users/me/drafts/draft-1',
        search: '',
        authorization: 'Bearer [REDACTED]',
        body: expect.any(String),
      },
    ])
    expect(decodeRaw(mock.readRecordedRequests()[0]?.body ?? '')).toBe(
      [
        'To: replacement@example.test',
        'Bcc: private@example.test',
        'Subject: Replacement subject',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        'Replacement body',
      ].join('\r\n'),
    )
    mutationRequests.push(...mock.readRecordedRequests())

    mock.resetRequests()
    const cached = await sandbox.run(['get', ref, '--json'], { env })
    expect(cached.exitCode, cached.stderr).toBe(0)
    expect(cached.stderr).toBe('')
    expect(JSON.parse(cached.stdout)).toMatchObject({
      resource: {
        ref,
        title: 'Replacement subject',
        payload: {
          providerMessageId: 'draft-message-2',
          to: updateInput.to,
          cc: [],
          bcc: updateInput.bcc,
          subject: updateInput.subject,
          bodyText: updateInput.bodyText,
        },
      },
      warnings: [],
    })
    expect(mock.readRecordedRequests()).toEqual([])

    const parentRef = `ctx://${sourceId}/message/msg-1`
    const completeParent = await sandbox.run(['get', parentRef, '--json'], {
      env,
    })
    expect(completeParent.exitCode, completeParent.stderr).toBe(0)
    mock.resetRequests()
    mock.resetDraftState()
    const replyCreated = await sandbox.run(
      [
        'action',
        'run',
        createActionId,
        '--source',
        sourceLabel,
        '--input',
        JSON.stringify({ replyToRef: parentRef, bodyText: 'Reply body' }),
        '--json',
      ],
      { env },
    )
    expect(replyCreated.exitCode, replyCreated.stderr).toBe(0)
    expect(JSON.parse(replyCreated.stdout)).toMatchObject({
      resource: {
        ref,
        title: 'Re: ctxindex mock hello',
        payload: {
          to: ['sender@example.test'],
          subject: 'Re: ctxindex mock hello',
          inReplyTo: '<msg-1@example.test>',
          references: ['<msg-1@example.test>'],
          replyToRef: parentRef,
          threadId: 'thread-1',
        },
      },
    })
    const replyRequest = mock.readRecordedRequests()
    expect(replyRequest).toHaveLength(1)
    expect(JSON.parse(replyRequest[0]?.body ?? '{}').message.threadId).toBe(
      'thread-1',
    )
    expect(decodeRaw(replyRequest[0]?.body ?? '')).toContain(
      'In-Reply-To: <msg-1@example.test>\r\nReferences: <msg-1@example.test>',
    )

    mock.resetRequests()

    const unknown = await sandbox.run(
      [
        'action',
        'describe',
        'communication.message.draft.send',
        '--source',
        sourceLabel,
        '--json',
      ],
      { env },
    )
    expect(unknown.exitCode).toBe(2)
    expect(unknown.stderr).toContain('Unknown Action')
    expect(mock.readRecordedRequests()).toEqual([])

    expect(mutationRequests.map(({ method }) => method)).toEqual([
      'POST',
      'PUT',
    ])
    expect(
      mutationRequests.every(({ pathname }) => !pathname.includes('/send')),
    ).toBe(true)
  } finally {
    mock.stop()
    await sandbox.cleanup()
  }
}, 30_000)
