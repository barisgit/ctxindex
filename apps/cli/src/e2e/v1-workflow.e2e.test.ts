import { expect, test } from 'bun:test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'
import { type MockGmailRecordedRequest, startMockGmail } from './_mock-gmail'

const createDraftAction = 'communication.message.draft.create'
const updateDraftAction = 'communication.message.draft.update'

function parseSourceId(stdout: string): string {
  const match = /^source added: (.+)$/m.exec(stdout)
  if (!match?.[1]) throw new Error(`Could not parse source id from: ${stdout}`)
  return match[1]
}

function jsonOutput(result: {
  exitCode: number
  stdout: string
  stderr: string
}): unknown {
  expect(result.exitCode, result.stderr).toBe(0)
  expect(result.stderr).toBe('')
  const parsed = JSON.parse(result.stdout)
  expect(result.stdout).toBe(`${JSON.stringify(parsed)}\n`)
  return parsed
}

function decodeDraft(request: MockGmailRecordedRequest): string {
  const body = JSON.parse(request.body) as { message: { raw: string } }
  return Buffer.from(body.message.raw, 'base64url').toString('utf8')
}

async function addRealm(sandbox: Sandbox, slug: string): Promise<void> {
  const result = await sandbox.run(['realm', 'add', slug])
  expect(result.exitCode, result.stderr).toBe(0)
}

test('real binary proves the isolated complete V1 workflow', async () => {
  const sandbox = await createSandbox()
  const mock = startMockGmail({
    messages: [
      {
        id: 'workflow-root',
        threadId: 'workflow-thread',
        subject: 'V1 workflow needle',
        body: 'Gmail workflow body\nsecond line',
        historyId: '3001',
        messageId: '<workflow-root@example.test>',
        date: 'Wed, 15 Jul 2026 09:00:00 +0000',
        attachmentText: 'workflow attachment bytes\n',
      },
      {
        id: 'workflow-reply',
        threadId: 'workflow-thread',
        subject: 'Re: V1 workflow needle',
        body: 'Gmail reply body',
        historyId: '3002',
        messageId: '<workflow-reply@example.test>',
        inReplyTo: '<workflow-root@example.test>',
        date: 'Wed, 15 Jul 2026 10:00:00 +0000',
      },
    ],
  })
  const env = mock.env(sandbox)

  try {
    const root = join(sandbox.dir, 'local-directory')
    await mkdir(root, { recursive: true })
    await writeFile(join(root, 'workflow.txt'), 'local workflow needle only\n')

    expect((await sandbox.run(['init'])).exitCode).toBe(0)
    await addRealm(sandbox, 'mail')
    await addRealm(sandbox, 'files')

    const auth = await sandbox.run(
      ['auth', 'add', 'google', '--adapter', 'google.mailbox', '--from-env'],
      { env },
    )
    expect(auth.exitCode, auth.stderr).toBe(0)

    const gmailSource = parseSourceId(
      (
        await sandbox.run(
          ['source', 'add', '--adapter', 'google.mailbox', '--realm', 'mail'],
          { env },
        )
      ).stdout,
    )
    const localSource = parseSourceId(
      (
        await sandbox.run(
          [
            'source',
            'add',
            'local.directory',
            '--realm',
            'files',
            '--config-root-path',
            root,
          ],
          { env },
        )
      ).stdout,
    )
    expect(gmailSource).not.toBe(localSource)

    const synced = jsonOutput(
      await sandbox.run(['sync', '--source', localSource, '--json'], { env }),
    ) as { results: { sourceId: string; status: string }[] }
    expect(synced.results).toEqual([
      expect.objectContaining({ sourceId: localSource, status: 'completed' }),
    ])

    mock.resetRequests()
    const remoteMail = jsonOutput(
      await sandbox.run(
        [
          'search',
          'workflow needle',
          '--realm',
          'mail',
          '--remote',
          '--limit',
          '2',
          '--json',
        ],
        { env },
      ),
    ) as { results: { ref: string; sourceId: string }[]; warnings: unknown[] }
    expect(remoteMail.results).toHaveLength(2)
    expect(
      remoteMail.results.every(({ sourceId }) => sourceId === gmailSource),
    ).toBe(true)
    expect(remoteMail.warnings).toEqual([])

    const mailDiscovery = await sandbox.run(
      [
        'search',
        'workflow needle',
        '--realm',
        'mail',
        '--local-only',
        '--json',
      ],
      { env },
    )
    const mailDiscoveryJson = jsonOutput(mailDiscovery) as {
      results: { ref: string; sourceId: string }[]
    }
    expect(mailDiscoveryJson.results).toHaveLength(2)
    expect(
      mailDiscoveryJson.results.every(
        ({ sourceId }) => sourceId === gmailSource,
      ),
    ).toBe(true)
    expect(
      (
        await sandbox.run(
          [
            'search',
            'workflow needle',
            '--realm',
            'mail',
            '--local-only',
            '--json',
          ],
          { env },
        )
      ).stdout,
    ).toBe(mailDiscovery.stdout)

    const fileDiscovery = await sandbox.run(
      [
        'search',
        'workflow needle',
        '--realm',
        'files',
        '--local-only',
        '--json',
      ],
      { env },
    )
    const fileDiscoveryJson = jsonOutput(fileDiscovery) as {
      results: { ref: string; sourceId: string }[]
    }
    const localRef = `ctx://${localSource}/file/workflow.txt`
    expect(fileDiscoveryJson.results).toEqual([
      expect.objectContaining({ ref: localRef, sourceId: localSource }),
    ])
    expect(
      (
        await sandbox.run(
          [
            'search',
            'workflow needle',
            '--realm',
            'files',
            '--local-only',
            '--json',
          ],
          { env },
        )
      ).stdout,
    ).toBe(fileDiscovery.stdout)
    expect(
      new Set([
        ...mailDiscoveryJson.results.map(({ sourceId }) => sourceId),
        ...fileDiscoveryJson.results.map(({ sourceId }) => sourceId),
      ]),
    ).toEqual(new Set([gmailSource, localSource]))

    const localGet = await sandbox.run(['get', localRef, '--json'], { env })
    expect(jsonOutput(localGet)).toMatchObject({
      resource: {
        ref: localRef,
        sourceId: localSource,
        profile: { id: 'file', version: 1 },
        payload: {
          path: 'workflow.txt',
          text: 'local workflow needle only\n',
        },
      },
      warnings: [],
    })

    const messageRef = `ctx://${gmailSource}/message/workflow-root`
    const replyRef = `ctx://${gmailSource}/message/workflow-reply`
    mock.resetRequests()
    const gmailGet = await sandbox.run(['get', messageRef, '--json'], { env })
    expect(jsonOutput(gmailGet)).toMatchObject({
      resource: {
        ref: messageRef,
        sourceId: gmailSource,
        profile: { id: 'communication.message', version: 1 },
        payload: {
          providerMessageId: 'workflow-root',
          bodyText: 'Gmail workflow body\nsecond line',
        },
      },
      warnings: [],
    })
    expect(
      mock
        .readRequests()
        .filter(
          ({ pathname, search }) =>
            pathname.endsWith('/messages/workflow-root') &&
            search === '?format=full',
        ),
    ).toHaveLength(1)

    mock.resetRequests()
    const thread = await sandbox.run(['thread', 'get', replyRef, '--json'], {
      env,
    })
    const threadJson = jsonOutput(thread) as {
      mode: string
      messages: {
        resource: { ref: string }
        children: { resource: { ref: string } }[]
      }[]
      warnings: unknown[]
    }
    expect(threadJson).toMatchObject({
      mode: 'tree',
      messages: [
        {
          resource: { ref: messageRef },
          children: [{ resource: { ref: replyRef }, children: [] }],
        },
      ],
      warnings: [],
    })
    expect(mock.readRequests()).toEqual([])

    const artifactRef = `${messageRef}/attachment/workflow-root-attachment`
    const listed = await sandbox.run(
      ['artifact', 'list', messageRef, '--json'],
      { env },
    )
    expect(jsonOutput(listed)).toEqual({
      resourceRef: messageRef,
      artifacts: [
        {
          ref: artifactRef,
          filename: 'mock.txt',
          mediaType: 'text/plain',
          byteSize: 26,
        },
      ],
      warnings: [],
    })

    mock.resetRequests()
    const firstOutput = join(sandbox.dir, 'first-attachment.txt')
    const firstDownload = await sandbox.run(
      ['artifact', 'download', artifactRef, '--output', firstOutput, '--json'],
      { env },
    )
    const firstDownloadJson = jsonOutput(firstDownload) as {
      artifact: {
        ref: string
        contentHash: string
        byteSize: number
      }
      cache: string
      outputPath: string
    }
    expect(firstDownloadJson).toMatchObject({
      artifact: {
        ref: artifactRef,
        contentHash:
          'sha256:b98e703215435e1741873ca03e7d1b4ddb62e0c6c8d0cc0260431e34faee84bd',
        byteSize: 26,
      },
      cache: 'miss',
      outputPath: firstOutput,
    })
    expect(await readFile(firstOutput)).toEqual(
      Buffer.from('workflow attachment bytes\n'),
    )

    const secondOutput = join(sandbox.dir, 'second-attachment.txt')
    const secondDownload = await sandbox.run(
      ['artifact', 'download', artifactRef, '--output', secondOutput, '--json'],
      { env },
    )
    const secondDownloadJson = jsonOutput(
      secondDownload,
    ) as typeof firstDownloadJson
    expect(secondDownloadJson).toEqual({
      ...firstDownloadJson,
      cache: 'hit',
      outputPath: secondOutput,
    })
    expect(await readFile(secondOutput)).toEqual(await readFile(firstOutput))
    expect(
      mock
        .readRequests()
        .filter(({ pathname }) => pathname.includes('/attachments/')),
    ).toHaveLength(1)

    const eml = await sandbox.run(['export', messageRef, '--format', 'eml'], {
      env,
    })
    expect(eml.exitCode, eml.stderr).toBe(0)
    expect(eml.stderr).toBe('')
    expect(eml.stdout).toBe(
      [
        'From: sender@example.test',
        'To: recipient@example.test',
        'Subject: V1 workflow needle',
        'Date: Wed, 15 Jul 2026 09:00:00 GMT',
        'Message-ID: <workflow-root@example.test>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        'Gmail workflow body',
        'second line',
      ].join('\r\n'),
    )

    const coreJson = await sandbox.run(
      ['export', messageRef, '--format', 'json'],
      { env },
    )
    expect(coreJson.exitCode, coreJson.stderr).toBe(0)
    expect(coreJson.stderr).toBe('')
    expect(coreJson.stdout).toBe(
      `{"attachments":[{"byteSize":26,"filename":"mock.txt","mediaType":"text/plain","ref":"${artifactRef}"}],"bodyText":"Gmail workflow body\\nsecond line","conversationKey":"${gmailSource}:workflow-thread","date":"2026-07-15T09:00:00.000Z","from":["sender@example.test"],"labels":["INBOX"],"providerMessageId":"workflow-root","rfcMessageId":"<workflow-root@example.test>","snippet":"Gmail workflow body\\nsecond line","subject":"V1 workflow needle","threadId":"workflow-thread","to":["recipient@example.test"],"unread":false}`,
    )

    const unsupported = await sandbox.run(
      ['export', messageRef, '--format', 'mbox'],
      { env },
    )
    expect(unsupported.exitCode).toBe(2)
    expect(unsupported.stdout).toBe('')
    expect(unsupported.stderr).toBe(
      'Unsupported export format "mbox" for communication.message@1; valid formats: eml, json\n',
    )

    mock.resetRequests()
    mock.resetDraftState()
    const createInput = {
      to: ['first@example.test'],
      cc: ['copy@example.test'],
      subject: 'Original workflow Draft',
      bodyText: 'Original Draft body',
    }
    const created = await sandbox.run(
      [
        'action',
        'run',
        createDraftAction,
        '--source',
        gmailSource,
        '--input',
        JSON.stringify(createInput),
        '--json',
      ],
      { env },
    )
    const createdJson = jsonOutput(created) as {
      resource: { ref: string; payload: Record<string, unknown> }
      warnings: unknown[]
    }
    const draftRef = `ctx://${gmailSource}/draft/draft-1`
    expect(createdJson).toMatchObject({
      resource: {
        ref: draftRef,
        payload: {
          providerDraftId: 'draft-1',
          providerMessageId: 'draft-message-1',
          ...createInput,
        },
      },
      warnings: [],
    })

    const updateInput = {
      ref: draftRef,
      to: ['replacement@example.test'],
      bcc: ['private@example.test'],
      subject: 'Replacement workflow Draft',
      bodyText: 'Replacement Draft body',
    }
    const updated = await sandbox.run(
      [
        'action',
        'run',
        updateDraftAction,
        '--source',
        gmailSource,
        '--input',
        JSON.stringify(updateInput),
        '--json',
      ],
      { env },
    )
    const updatedJson = jsonOutput(updated) as typeof createdJson
    expect(updatedJson).toMatchObject({
      resource: {
        ref: draftRef,
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
    expect(updatedJson.resource.payload).not.toHaveProperty(
      'cc',
      createInput.cc,
    )
    expect(updatedJson.resource.payload).not.toHaveProperty(
      'subject',
      createInput.subject,
    )

    const mutations = mock.readRecordedRequests()
    expect(
      mutations.map(({ method, pathname }) => ({ method, pathname })),
    ).toEqual([
      { method: 'POST', pathname: '/gmail/v1/users/me/drafts' },
      { method: 'PUT', pathname: '/gmail/v1/users/me/drafts/draft-1' },
    ])
    expect(mutations.every(({ pathname }) => !pathname.includes('/send'))).toBe(
      true,
    )
    expect(decodeDraft(mutations[0] as MockGmailRecordedRequest)).toContain(
      'Cc: copy@example.test\r\n',
    )
    expect(decodeDraft(mutations[1] as MockGmailRecordedRequest)).toBe(
      [
        'To: replacement@example.test',
        'Bcc: private@example.test',
        'Subject: Replacement workflow Draft',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        'Replacement Draft body',
      ].join('\r\n'),
    )
  } finally {
    mock.stop()
    await sandbox.cleanup()
  }
})
