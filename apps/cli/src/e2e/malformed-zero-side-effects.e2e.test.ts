import { expect, test } from 'bun:test'
import { exists } from 'node:fs/promises'
import { createSandbox } from '@ctxindex/core/testing'

const malformedCommands = [
  ['account', 'list', '--client-secret', 'malformed-secret-canary'],
  ['client', 'add', 'google', '--from-env', '--unknown-client-flag'],
  ['account', 'add', 'google', '--unknown-account-flag'],
  ['auth'],
  [
    'source',
    'add',
    '--adapter',
    'microsoft.mailbox',
    '--realm',
    'work',
    '--unknown-source-flag',
  ],
  [
    'action',
    'run',
    'communication.message.draft.create',
    '--source',
    'SOURCE',
    '--input',
    '{not-json',
    '--json',
  ],
  ['sync', '--format', 'not-a-format'],
] as const

test('malformed commands perform zero auth, network, or storage work', async () => {
  const sandbox = await createSandbox()
  const requests: string[] = []
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      requests.push(request.url)
      return new Response('unexpected request', { status: 500 })
    },
  })
  const mockBaseUrl = `http://127.0.0.1:${server.port}`
  const env = {
    CTXINDEX_OAUTH_MOCK_BASE_URL: mockBaseUrl,
    CTXINDEX_GMAIL_MOCK_BASE_URL: mockBaseUrl,
    CTXINDEX_GOOGLE_CALENDAR_MOCK_BASE_URL: mockBaseUrl,
    CTXINDEX_GRAPH_MOCK_BASE_URL: mockBaseUrl,
    CTXINDEX_GOOGLE_CLIENT_ID: 'malformed-client-canary',
    CTXINDEX_MICROSOFT_CLIENT_ID: 'malformed-client-canary',
  }

  try {
    for (const args of malformedCommands) {
      const result = await sandbox.run([...args], { env })
      expect(result.exitCode, `${args.join(' ')}\n${result.stderr}`).toBe(2)
      if (args[0] === 'auth') {
        expect(result.stderr).toContain('Unknown command')
        expect(result.stdout).toContain('ctxindex init|account|client')
        expect(result.stdout).not.toContain('init|auth|')
      } else {
        expect(result.stdout).toBe('')
      }
      expect(result.stderr).not.toContain('malformed-secret-canary')
      expect(result.stderr).not.toContain('malformed-client-canary')
      expect(result.stderr).not.toContain('malformed-refresh-canary')
      expect(requests).toEqual([])
      expect(await exists(sandbox.env.CTXINDEX_CONFIG_HOME)).toBe(false)
      expect(await exists(sandbox.env.CTXINDEX_DATA_HOME)).toBe(false)
      expect(await exists(sandbox.env.CTXINDEX_CACHE_HOME)).toBe(false)
      expect(await exists(sandbox.env.CTXINDEX_STATE_HOME)).toBe(false)
    }
  } finally {
    server.stop(true)
    await sandbox.cleanup()
  }
})
