import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SyncContext } from '@ctxindex/core/registry'
import type { SyncContext as PublicSyncContext } from '@ctxindex/extension-sdk'
import { localDirectoryAdapterDefinition } from './builtins'
import { googleMailboxAdapter } from './google-mailbox'

const ALLOWLIST = new Set([
  'oauth2.googleapis.com',
  'accounts.google.com',
  'gmail.googleapis.com',
  'www.googleapis.com',
])

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function textBody(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function testLogger(): SyncContext['logger'] {
  return {
    level: 'info',
    fatal: () => {},
    error: () => {},
    warn: () => {},
    info: () => {},
    debug: () => {},
    trace: () => {},
    silent: () => {},
  } as unknown as SyncContext['logger']
}

describe('VAL-NETWORK-EGRESS runtime interceptor', () => {
  test('local.directory + google.mailbox sync use only allowlisted fetch hosts', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'ctxindex-egress-test-'))
    const originalFetch = globalThis.fetch
    const hosts: string[] = []
    globalThis.fetch = ((input: Parameters<typeof fetch>[0]) => {
      const url = new URL(input.toString())
      hosts.push(url.hostname)
      if (!ALLOWLIST.has(url.hostname)) {
        throw new Error(`blocked network egress: ${url.hostname}`)
      }
      if (url.hostname !== 'gmail.googleapis.com') {
        return Promise.resolve(jsonResponse({ error: 'unexpected host' }, 500))
      }
      if (
        url.pathname.endsWith('/messages') &&
        !url.pathname.includes('/m-1')
      ) {
        return Promise.resolve(jsonResponse({ messages: [{ id: 'm-1' }] }))
      }
      if (url.pathname.endsWith('/profile')) {
        return Promise.resolve(jsonResponse({ historyId: '88' }))
      }
      if (url.pathname.endsWith('/messages/m-1')) {
        return Promise.resolve(
          jsonResponse({
            id: 'm-1',
            threadId: 't-1',
            historyId: '77',
            payload: {
              headers: [{ name: 'Subject', value: 'egress fixture' }],
              body: { data: textBody('egress body') },
            },
          }),
        )
      }
      return Promise.resolve(jsonResponse({ error: 'unexpected path' }, 500))
    }) as unknown as typeof fetch

    try {
      await writeFile(join(tmpDir, 'note.md'), '# egress fixture\n')
      const localCtx = {
        source: {
          id: '01KXHBNECDAH1T4MJ38X88EPFJ',
          config: { root_path: tmpDir },
        },
        fetch: globalThis.fetch,
        mode: 'sync',
        cursor: null,
        logger: {
          trace() {},
          debug() {},
          info() {},
          warn() {},
          error() {},
        },
        signal: new AbortController().signal,
        emit() {},
      } satisfies PublicSyncContext
      await localDirectoryAdapterDefinition.operations.sync(localCtx)

      const googleCtx = {
        sourceId: 'src-google',
        runId: 'run-google',
        mode: 'sync',
        cursor: null,
        logger: testLogger(),
        signal: new AbortController().signal,
      } satisfies SyncContext
      const googleOps: Record<string, unknown>[] = []
      for await (const op of googleMailboxAdapter.sync(googleCtx)) {
        googleOps.push(op as Record<string, unknown>)
      }

      expect(hosts).toEqual([
        'gmail.googleapis.com',
        'gmail.googleapis.com',
        'gmail.googleapis.com',
      ])
      expect(hosts.every((host) => ALLOWLIST.has(host))).toBe(true)
      expect(googleOps).toContainEqual(
        expect.objectContaining({
          type: 'setCursor',
          cursor: JSON.stringify({ historyId: '88' }),
        }),
      )
    } finally {
      globalThis.fetch = originalFetch
      await rm(tmpDir, { recursive: true, force: true })
    }
  })
})
