import { expect, test } from 'bun:test'
import { createSandbox } from '@ctxindex/core/testing'
import { buildCompiledCliHarness } from './_compiled-cli-harness'
import { type MockGraphMessage, startMockGraph } from './_mock-graph'
import { installLoopbackBrowser } from './_oauth-account'

function fixtureMessage(index: number): MockGraphMessage {
  return {
    id: `compiled-page-${String(index).padStart(2, '0')}`,
    conversationId: `compiled-conversation-${index}`,
    internetMessageId: `<compiled-page-${index}@example.test>`,
    subject: `Compiled page message ${index}`,
    bodyPreview: `Compiled page preview ${index}`,
    body: `Compiled page body ${index}`,
    from: { address: 'sender@example.test' },
    to: [{ address: 'recipient@example.test' }],
    receivedDateTime: '2026-07-01T10:00:00Z',
    lastModifiedDateTime: '2026-07-01T10:05:00Z',
    isRead: false,
  }
}

test('relocated compiled CLI resumes Microsoft mailbox enumeration beyond 50', async () => {
  const sandbox = await createSandbox()
  const graph = startMockGraph({
    tokenScopes: 'Calendars.Read Mail.ReadWrite User.Read',
    messages: [
      ...Array.from({ length: 51 }, (_, index) => fixtureMessage(index)),
      { ...fixtureMessage(99), id: 'compiled-hidden-draft', isDraft: true },
    ],
  })
  const harness = await buildCompiledCliHarness()
  let env: Readonly<Record<string, string | undefined>> | undefined
  try {
    const browser = await installLoopbackBrowser(sandbox.dir)
    env = {
      ...sandbox.env,
      ...graph.env(sandbox, {
        PATH: `${browser}:${process.env.PATH ?? ''}`,
        CTXINDEX_LOOPBACK_TIMEOUT_SECS: '5',
      }),
    }
    const run = (args: string[]) => harness.run(args, env ?? {})

    for (const args of [
      ['init'],
      ['realm', 'add', 'work'],
      ['oauth-app', 'add', 'microsoft', 'microsoft', '--from-env'],
      [
        'account',
        'add',
        'microsoft',
        '--app',
        'microsoft',
        '--label',
        'compiled-outlook',
      ],
      [
        'source',
        'add',
        'microsoft.mailbox',
        '--realm',
        'work',
        '--account',
        'compiled-outlook',
        '--label',
        'compiled-mailbox',
      ],
    ]) {
      const result = await run(args)
      expect(result.exitCode, result.stderr).toBe(0)
    }

    const first = await run([
      'search',
      '--remote',
      '--source',
      'compiled-mailbox',
      '--kind',
      'mail.message',
      '--limit',
      '100',
      '--format',
      'json',
    ])
    expect(first.exitCode, first.stderr).toBe(0)
    const firstJson = JSON.parse(first.stdout) as {
      results: { ref: string }[]
      pagination: { continuation: string | null; hasMore: boolean }
    }
    expect(firstJson.results).toHaveLength(50)
    expect(firstJson.pagination.hasMore).toBe(true)
    const continuation = firstJson.pagination.continuation ?? ''
    expect(continuation.length).toBeGreaterThan(0)

    const second = await run([
      'search',
      '--remote',
      '--source',
      'compiled-mailbox',
      '--kind',
      'mail.message',
      '--limit',
      '100',
      '--continuation',
      continuation,
      '--format',
      'json',
    ])
    expect(second.exitCode, second.stderr).toBe(0)
    const secondJson = JSON.parse(second.stdout) as {
      results: { ref: string }[]
      pagination: {
        limit: number
        continuation: string | null
        hasMore: boolean
      }
    }
    expect(secondJson.results).toHaveLength(1)
    expect(secondJson.pagination).toEqual({
      limit: 100,
      hasMore: false,
      continuation: null,
    })
    const refs = [...firstJson.results, ...secondJson.results].map(
      ({ ref }) => ref,
    )
    expect(new Set(refs).size).toBe(51)
    expect(refs.some((ref) => ref.includes('compiled-hidden-draft'))).toBe(
      false,
    )
    expect(
      graph
        .readRequests()
        .filter(({ pathname }) => pathname === '/v1.0/me/messages')
        .every(({ prefer }) => prefer?.includes('IdType="ImmutableId"')),
    ).toBe(true)
  } finally {
    if (env) {
      await harness
        .run(['daemon', 'stop', '--format', 'json'], env)
        .catch(() => undefined)
    }
    await harness.cleanup()
    graph.stop()
    await sandbox.cleanup()
  }
}, 60_000)
