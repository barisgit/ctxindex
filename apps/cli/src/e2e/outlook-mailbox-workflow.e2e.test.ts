import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'
import { type MockGraphMessage, startMockGraph } from './_mock-graph'

function parseSourceId(stdout: string): string {
  const match = /^source added: (.+)$/m.exec(stdout)
  if (!match?.[1]) throw new Error(`Could not parse Source id from: ${stdout}`)
  return match[1]
}

function grantScopes(sandbox: Sandbox): string[] {
  const database = new Database(
    join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite'),
    { readonly: true },
  )
  try {
    const row = database.query('SELECT scopes_json FROM grants').get() as {
      scopes_json: string
    }
    return JSON.parse(row.scopes_json)
  } finally {
    database.close()
  }
}

const messages: readonly MockGraphMessage[] = [
  {
    id: 'outlook-root',
    conversationId: 'conversation-1',
    internetMessageId: '<outlook-root@example.test>',
    subject: 'Quarterly outlook review',
    bodyPreview: 'The root message preview.',
    body: 'The root message body.',
    from: { name: 'Alex', address: 'alex@example.test' },
    to: [{ address: 'team@example.test' }],
    receivedDateTime: '2026-07-01T10:00:00Z',
    lastModifiedDateTime: '2026-07-01T10:05:00Z',
    categories: ['Inbox'],
  },
  {
    id: 'outlook-reply',
    conversationId: 'conversation-1',
    internetMessageId: '<outlook-reply@example.test>',
    inReplyTo: '<outlook-root@example.test>',
    subject: 'Re: Quarterly outlook review',
    bodyPreview: 'The reply preview.',
    body: 'The complete reply body.',
    from: { name: 'Blair', address: 'blair@example.test' },
    to: [{ name: 'Alex', address: 'alex@example.test' }],
    receivedDateTime: '2026-07-01T11:00:00Z',
    lastModifiedDateTime: '2026-07-01T11:05:00Z',
    isRead: true,
    attachments: [
      {
        id: 'attachment/1',
        name: 'report.txt',
        contentType: 'text/plain',
        bytes: new TextEncoder().encode('exact outlook bytes\n'),
      },
      {
        id: 'forwarded-1',
        name: 'forwarded.eml',
        contentType: 'message/rfc822',
        bytes: new TextEncoder().encode('unsupported'),
        kind: 'item',
      },
    ],
  },
  {
    id: 'outlook-draft',
    conversationId: 'draft-conversation',
    internetMessageId: '<outlook-draft@example.test>',
    subject: 'Draft must stay hidden',
    bodyPreview: 'Draft preview.',
    body: 'Draft body.',
    from: { address: 'alex@example.test' },
    to: [{ address: 'team@example.test' }],
    receivedDateTime: '2026-07-01T12:00:00Z',
    lastModifiedDateTime: '2026-07-01T12:05:00Z',
    isDraft: true,
  },
]

test('binary CLI runs provider-neutral Outlook read and artifact workflow', async () => {
  const sandbox = await createSandbox()
  const graph = startMockGraph({ messages })
  const env = graph.env(sandbox)
  try {
    for (const command of [
      ['init'],
      ['realm', 'add', 'work'],
      ['realm', 'add', 'personal'],
    ]) {
      const result = await sandbox.run(command, { env })
      expect(result.exitCode, result.stderr).toBe(0)
    }

    const authenticated = await sandbox.run(
      [
        'auth',
        'add',
        'microsoft',
        '--adapter',
        'microsoft.mailbox',
        '--from-env',
      ],
      { env },
    )
    expect(authenticated.exitCode, authenticated.stderr).toBe(0)
    expect(authenticated.stdout).not.toContain('microsoft-personal-subject')
    expect(grantScopes(sandbox)).toEqual(['Mail.ReadWrite', 'User.Read'])

    const addSource = async (realm: string, name: string) => {
      const result = await sandbox.run(
        [
          'source',
          'add',
          '--adapter',
          'microsoft.mailbox',
          '--realm',
          realm,
          '--name',
          name,
        ],
        { env },
      )
      expect(result.exitCode, result.stderr).toBe(0)
      return parseSourceId(result.stdout)
    }
    const workSourceId = await addSource('work', 'Work Outlook')
    await addSource('personal', 'Personal Outlook')

    const inventoryResult = await sandbox.run(['account', 'list', '--json'], {
      env,
    })
    expect(inventoryResult.exitCode, inventoryResult.stderr).toBe(0)
    expect(inventoryResult.stdout).not.toContain('microsoft-work-subject')
    const inventory = JSON.parse(inventoryResult.stdout) as {
      provider: string
      grants: { scopes: string[]; sources: { displayName: string }[] }[]
    }[]
    expect(inventory).toHaveLength(1)
    expect(inventory[0]?.provider).toBe('microsoft')
    expect(inventory[0]?.grants).toHaveLength(1)
    expect(inventory[0]?.grants[0]?.scopes).toEqual([
      'Mail.ReadWrite',
      'User.Read',
    ])
    expect(
      inventory[0]?.grants[0]?.sources
        .map(({ displayName }) => displayName)
        .sort(),
    ).toEqual(['Personal Outlook', 'Work Outlook'])

    graph.resetRequests()
    const searched = await sandbox.run(
      ['search', 'Quarterly outlook', '--remote', '--realm', 'work', '--json'],
      { env },
    )
    expect(searched.exitCode, searched.stderr).toBe(0)
    const searchJson = JSON.parse(searched.stdout) as {
      results: { ref: string; sourceId: string; origin: string }[]
      warnings: unknown[]
    }
    expect(searchJson.results).toHaveLength(2)
    expect(
      searchJson.results.every(({ sourceId }) => sourceId === workSourceId),
    ).toBe(true)
    expect(
      searchJson.results.every(({ origin }) => origin === 'provider'),
    ).toBe(true)
    expect(
      graph
        .readRequests()
        .filter(({ pathname }) => pathname === '/v1.0/me/messages'),
    ).toHaveLength(1)
    expect(
      graph
        .readRequests()
        .filter(({ pathname }) => pathname.startsWith('/v1.0/'))
        .every(({ prefer }) => prefer?.includes('IdType="ImmutableId"')),
    ).toBe(true)

    const authority = workSourceId.toUpperCase()
    const rootRef = `ctx://${authority}/message/outlook-root`
    const replyRef = `ctx://${authority}/message/outlook-reply`
    graph.setMessages(
      messages.map((message) =>
        message.id === 'outlook-root'
          ? { ...message, categories: ['Archive'] }
          : message,
      ),
    )
    const moved = await sandbox.run(
      ['search', 'Quarterly outlook', '--remote', '--realm', 'work', '--json'],
      { env },
    )
    expect(moved.exitCode, moved.stderr).toBe(0)
    expect(
      (JSON.parse(moved.stdout) as { results: { ref: string }[] }).results.some(
        ({ ref }) => ref === rootRef,
      ),
    ).toBe(true)

    const thread = await sandbox.run(['thread', 'get', replyRef, '--json'], {
      env,
    })
    expect(thread.exitCode, thread.stderr).toBe(0)
    expect(JSON.parse(thread.stdout)).toMatchObject({
      mode: 'tree',
      messages: [
        {
          resource: { ref: rootRef },
          children: [{ resource: { ref: replyRef }, children: [] }],
        },
      ],
      warnings: [],
    })

    graph.resetRequests()
    const retrieved = await sandbox.run(['get', replyRef, '--json'], { env })
    expect(retrieved.exitCode, retrieved.stderr).toBe(0)
    const getJson = JSON.parse(retrieved.stdout) as {
      resource: {
        payload: {
          bodyText: string
          attachments: { ref: string; filename: string }[]
        }
      }
      warnings: unknown[]
    }
    expect(getJson).toMatchObject({
      resource: {
        payload: {
          bodyText: 'The complete reply body.',
          inReplyTo: '<outlook-root@example.test>',
        },
      },
      warnings: [],
    })
    expect(getJson.resource.payload.attachments).toHaveLength(1)
    const artifactRef = getJson.resource.payload.attachments[0]?.ref ?? ''
    expect(artifactRef).toBe(`${replyRef}/attachment/attachment%2F1`)
    expect(
      graph
        .readRequests()
        .some(({ pathname, prefer }) =>
          pathname.endsWith('/messages/outlook-reply')
            ? prefer?.includes('outlook.body-content-type="text"')
            : false,
        ),
    ).toBe(true)

    const getRequests = graph.readRequests().length
    const cached = await sandbox.run(['get', replyRef, '--json'], { env })
    expect(cached.exitCode, cached.stderr).toBe(0)
    expect(cached.stdout).toBe(retrieved.stdout)
    expect(graph.readRequests()).toHaveLength(getRequests)

    graph.resetRequests()
    const firstOutput = join(sandbox.dir, 'outlook-first.txt')
    const firstDownload = await sandbox.run(
      ['artifact', 'download', artifactRef, '--output', firstOutput, '--json'],
      { env },
    )
    expect(firstDownload.exitCode, firstDownload.stderr).toBe(0)
    expect(await readFile(firstOutput, 'utf8')).toBe('exact outlook bytes\n')
    expect(
      graph
        .readRequests()
        .filter(({ pathname }) => pathname.endsWith('/$value')),
    ).toHaveLength(1)

    const secondOutput = join(sandbox.dir, 'outlook-second.txt')
    const secondDownload = await sandbox.run(
      ['artifact', 'download', artifactRef, '--output', secondOutput, '--json'],
      { env },
    )
    expect(secondDownload.exitCode, secondDownload.stderr).toBe(0)
    expect(await readFile(secondOutput, 'utf8')).toBe('exact outlook bytes\n')
    expect(
      graph
        .readRequests()
        .filter(({ pathname }) => pathname.endsWith('/$value')),
    ).toHaveLength(1)

    const beforeExports = graph.readRequests().length
    const eml = await sandbox.run(['export', replyRef, '--format', 'eml'], {
      env,
    })
    expect(eml.exitCode, eml.stderr).toBe(0)
    expect(eml.stdout).toContain('Subject: Re: Quarterly outlook review')
    expect(eml.stdout).toContain('The complete reply body.')
    const json = await sandbox.run(['export', replyRef, '--format', 'json'], {
      env,
    })
    expect(json.exitCode, json.stderr).toBe(0)
    expect(JSON.parse(json.stdout)).toMatchObject({
      providerMessageId: 'outlook-reply',
      bodyText: 'The complete reply body.',
    })
    expect(graph.readRequests()).toHaveLength(beforeExports)

    graph.resetRequests()
    graph.setGraphStatus(503)
    const degraded = await sandbox.run(
      ['search', 'failure', '--remote', '--realm', 'work', '--json'],
      { env },
    )
    expect(degraded.exitCode, degraded.stderr).toBe(0)
    expect(JSON.parse(degraded.stdout)).toMatchObject({
      results: [],
      warnings: [
        expect.objectContaining({
          code: 'provider_unavailable',
          sourceId: workSourceId,
        }),
      ],
    })
  } finally {
    graph.stop()
    await sandbox.cleanup()
  }
}, 30_000)
