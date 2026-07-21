import { expect, test } from 'bun:test'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'
import {
  type MockGmailMessage,
  type MockGmailServer,
  startMockGmail,
} from './_mock-gmail'
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

const messages: readonly MockGmailMessage[] = [
  {
    id: 'parent',
    threadId: 'thread-tree',
    subject: 'Parent',
    body: 'Parent body',
    historyId: '2001',
    messageId: ' Parent <parent@example.test> ',
    date: 'Wed, 15 Jul 2026 09:00:00 +0000',
  },
  {
    id: 'child',
    threadId: 'thread-tree',
    subject: 'Child',
    body: 'Child body',
    historyId: '2002',
    messageId: '<child@example.test>',
    inReplyTo: 'replying to <parent@example.test>',
    date: 'Wed, 15 Jul 2026 10:00:00 +0000',
  },
  {
    id: 'grandchild',
    threadId: 'thread-tree',
    subject: 'Grandchild',
    body: 'Grandchild body',
    historyId: '2003',
    messageId: '<grandchild@example.test>',
    inReplyTo: '<child@example.test>',
    date: 'Wed, 15 Jul 2026 11:00:00 +0000',
  },
  {
    id: 'flat-late',
    threadId: 'thread-flat',
    subject: 'Flat late',
    body: 'Flat late body',
    historyId: '2004',
    messageId: '<flat-late@example.test>',
    date: 'Wed, 15 Jul 2026 13:00:00 +0000',
  },
  {
    id: 'flat-early',
    threadId: 'thread-flat',
    subject: 'Flat early',
    body: 'Flat early body',
    historyId: '2005',
    messageId: '<flat-early@example.test>',
    date: 'Wed, 15 Jul 2026 12:00:00 +0000',
  },
]

type ThreadNode = {
  readonly resource: {
    readonly ref: string
    readonly occurredAt: number | null
    readonly payload: Record<string, unknown>
  }
  readonly children: readonly ThreadNode[]
}

function refTree(nodes: readonly ThreadNode[]): unknown {
  return nodes.map((node) => ({
    ref: node.resource.ref,
    children: refTree(node.children),
  }))
}

function allNodes(nodes: readonly ThreadNode[]): ThreadNode[] {
  return nodes.flatMap((node) => [node, ...allNodes(node.children)])
}

test('mocked Gmail search materializes local thread trees without provider hydration', async () => {
  const sandbox = await createSandbox()
  const mock = startMockGmail({
    messages,
    listOrder: ['child', 'grandchild', 'parent', 'flat-late', 'flat-early'],
  })
  try {
    const { env, sourceId } = await initialize(sandbox, mock)
    mock.resetRequests()

    const searched = await sandbox.run(
      [
        'search',
        '--remote',
        '--format',
        'json',
        '--limit',
        '5',
        'thread fixture',
      ],
      { env },
    )
    expect(searched.exitCode, searched.stderr).toBe(0)
    expect(JSON.parse(searched.stdout).results).toHaveLength(5)
    expect(mock.readRequests()).toHaveLength(6)
    mock.resetRequests()

    const ref = (id: string) => `ctx://${sourceId}/message/${id}`
    const tree = await sandbox.run(
      ['thread', ref('grandchild'), '--format', 'json'],
      {
        env,
      },
    )
    expect(tree.exitCode, tree.stderr).toBe(0)
    const treeJson = JSON.parse(tree.stdout) as {
      mode: string
      messages: ThreadNode[]
      warnings: unknown[]
    }
    expect(treeJson.mode).toBe('tree')
    expect(refTree(treeJson.messages)).toEqual([
      {
        ref: ref('parent'),
        children: [
          {
            ref: ref('child'),
            children: [{ ref: ref('grandchild'), children: [] }],
          },
        ],
      },
    ])
    const treeNodes = allNodes(treeJson.messages)
    const refs = treeNodes.map((node) => node.resource.ref)
    expect(refs).toHaveLength(3)
    expect(new Set(refs).size).toBe(3)
    expect(treeNodes.every((node) => !Object.hasOwn(node.resource, 'id'))).toBe(
      true,
    )
    expect(
      treeNodes.every(
        (node) => !Object.hasOwn(node.resource.payload, 'bodyText'),
      ),
    ).toBe(true)
    expect(treeNodes[0]?.resource).toMatchObject({
      occurredAt: Date.parse('Wed, 15 Jul 2026 09:00:00 +0000'),
      payload: { rfcMessageId: '<parent@example.test>' },
    })
    expect(treeNodes[1]?.resource.payload).toMatchObject({
      rfcMessageId: '<child@example.test>',
      inReplyTo: '<parent@example.test>',
    })
    expect(treeJson.warnings).toEqual([])
    expect(mock.readRequests()).toEqual([])

    const flat = await sandbox.run(
      ['thread', '--format', 'json', ref('flat-late')],
      {
        env,
      },
    )
    expect(flat.exitCode, flat.stderr).toBe(0)
    const flatJson = JSON.parse(flat.stdout) as {
      mode: string
      messages: ThreadNode[]
      warnings: unknown[]
    }
    expect(flatJson.mode).toBe('flat')
    expect(refTree(flatJson.messages)).toEqual([
      { ref: ref('flat-early'), children: [] },
      { ref: ref('flat-late'), children: [] },
    ])
    expect(
      new Set(allNodes(flatJson.messages).map((node) => node.resource.ref))
        .size,
    ).toBe(2)
    expect(flatJson.warnings).toEqual([])
    expect(mock.readRequests()).toEqual([])

    const malformed = await sandbox.run(
      ['thread', '--format', 'json', 'not-a-ref'],
      {
        env,
      },
    )
    expect(malformed.exitCode).toBe(2)
    const unknown = await sandbox.run(
      ['thread', '--format', 'json', ref('unknown')],
      {
        env,
      },
    )
    expect(unknown.exitCode).toBe(2)
    expect(mock.readRequests()).toEqual([])
  } finally {
    mock.stop()
    await sandbox.cleanup()
  }
}, 30_000)
