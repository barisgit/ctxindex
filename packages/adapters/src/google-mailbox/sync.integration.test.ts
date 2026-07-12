import { describe, expect, test } from 'bun:test'
import type { SyncContext } from '@ctxindex/core/registry'
import { DEFAULT_SYNC_WINDOW_DAYS, googleMailboxAdapter } from './index'

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

async function collectGoogleOps(
  cursor: unknown,
  handler: (url: URL) => Response,
): Promise<Record<string, unknown>[]> {
  const originalFetch = globalThis.fetch
  const seenHosts: string[] = []
  globalThis.fetch = ((input: Parameters<typeof fetch>[0]) => {
    const url = new URL(input.toString())
    seenHosts.push(url.hostname)
    if (url.pathname.endsWith('/profile')) {
      return Promise.resolve(jsonResponse({ historyId: '999' }))
    }
    return Promise.resolve(handler(url))
  }) as unknown as typeof fetch
  try {
    const ctx = {
      sourceId: 'src-gmail-01',
      runId: 'run-gmail-01',
      mode: 'sync',
      cursor,
      logger: testLogger(),
      signal: new AbortController().signal,
    } satisfies SyncContext

    const ops: Record<string, unknown>[] = []
    for await (const op of googleMailboxAdapter.sync(ctx)) {
      ops.push(op as Record<string, unknown>)
    }
    expect(new Set(seenHosts)).toEqual(new Set(['gmail.googleapis.com']))
    return ops
  } finally {
    globalThis.fetch = originalFetch
  }
}

describe('google.mailbox adapter', () => {
  test('first-run backfill stores message, RFC822 ref, attachment metadata/body, and cursor', async () => {
    const ops = await collectGoogleOps(null, (url) => {
      if (
        url.pathname.endsWith('/messages') &&
        !url.pathname.includes('/m-1')
      ) {
        return jsonResponse({ messages: [{ id: 'm-1', threadId: 't-1' }] })
      }
      if (url.pathname.endsWith('/messages/m-1')) {
        return jsonResponse({
          id: 'm-1',
          threadId: 't-1',
          historyId: '101',
          internalDate: '1700000000000',
          labelIds: ['INBOX'],
          payload: {
            headers: [
              { name: 'Subject', value: 'Hello charter' },
              { name: 'From', value: 'a@example.com' },
              { name: 'To', value: 'b@example.com' },
              { name: 'Message-ID', value: '<rfc822@example.com>' },
            ],
            body: { data: textBody('plain body content') },
            parts: [
              {
                filename: 'note.txt',
                mimeType: 'text/plain',
                body: { attachmentId: 'att-1', size: 12 },
              },
            ],
          },
        })
      }
      if (url.pathname.endsWith('/attachments/att-1')) {
        return jsonResponse({ data: textBody('attachment body'), size: 15 })
      }
      return jsonResponse({ error: 'unexpected' }, 500)
    })

    expect(ops.some((op) => op.type === 'rawRecord')).toBe(false)
    expect(ops.some((op) => op.type === 'item_added')).toBe(true)
    expect(ops).toContainEqual(
      expect.objectContaining({
        type: 'upsertExternalRef',
        kind: 'rfc822_message_id',
        value: '<rfc822@example.com>',
      }),
    )
    expect(ops).toContainEqual(
      expect.objectContaining({
        type: 'upsertMailAttachment',
        filename: 'note.txt',
        providerAttachmentId: 'att-1',
      }),
    )
    expect(
      ops.filter((op) => op.type === 'upsertChunk').map((op) => op.content),
    ).toContain('attachment body')
    expect(ops).toContainEqual(
      expect.objectContaining({
        type: 'setCursor',
        cursor: JSON.stringify({ historyId: '999' }),
      }),
    )
  })

  test('incremental sync uses users.history.list and advances historyId', async () => {
    const ops = await collectGoogleOps({ historyId: '101' }, (url) => {
      if (url.pathname.endsWith('/history')) {
        expect(url.searchParams.get('startHistoryId')).toBe('101')
        return jsonResponse({
          historyId: '202',
          history: [
            { messagesAdded: [{ message: { id: 'm-2', threadId: 't-2' } }] },
          ],
        })
      }
      if (url.pathname.endsWith('/messages/m-2')) {
        return jsonResponse({
          id: 'm-2',
          threadId: 't-2',
          historyId: '202',
          payload: {
            headers: [{ name: 'Subject', value: 'Incremental' }],
            body: { data: textBody('incremental body') },
          },
        })
      }
      return jsonResponse({ error: 'unexpected' }, 500)
    })

    expect(ops).toContainEqual(
      expect.objectContaining({
        type: 'setCursor',
        cursor: JSON.stringify({ historyId: '202' }),
      }),
    )
    expect(ops).toContainEqual(
      expect.objectContaining({ type: 'upsertMailMessage', messageId: 'm-2' }),
    )
  })

  test('raw_records_enabled opt-in emits raw records', async () => {
    const ops = await collectGoogleOps({ raw_records_enabled: true }, (url) => {
      if (
        url.pathname.endsWith('/messages') &&
        !url.pathname.includes('/m-3')
      ) {
        return jsonResponse({ messages: [{ id: 'm-3' }] })
      }
      if (url.pathname.endsWith('/messages/m-3')) {
        return jsonResponse({
          id: 'm-3',
          threadId: 't-3',
          payload: { headers: [], body: { data: textBody('raw body') } },
        })
      }
      return jsonResponse({ error: 'unexpected' }, 500)
    })

    expect(ops.some((op) => op.type === 'rawRecord')).toBe(true)
  })

  test('first-run backfill query is bounded by the default sync window', async () => {
    let backfillQuery: string | null = null
    await collectGoogleOps(null, (url) => {
      if (url.pathname.endsWith('/messages')) {
        backfillQuery = url.searchParams.get('q')
        return jsonResponse({ messages: [] })
      }
      return jsonResponse({ error: 'unexpected' }, 500)
    })

    expect(backfillQuery ?? '').toContain('after:')
    const match = /after:(\d+)/.exec(backfillQuery ?? '')
    const afterEpoch = Number(match?.[1])
    const expected =
      Math.floor(Date.now() / 1000) - DEFAULT_SYNC_WINDOW_DAYS * 24 * 60 * 60
    expect(Math.abs(afterEpoch - expected)).toBeLessThan(60)
  })

  test('multi-page backfill keeps q stable across pages and terminates', async () => {
    const queries: string[] = []
    const ops = await collectGoogleOps(null, (url) => {
      if (
        url.pathname.endsWith('/messages') &&
        !/\/messages\/m-p/.test(url.pathname)
      ) {
        queries.push(url.searchParams.get('q') ?? '')
        const token = url.searchParams.get('pageToken')
        if (!token) {
          return jsonResponse({
            messages: [{ id: 'm-p1' }],
            nextPageToken: 'page-2',
            resultSizeEstimate: 2,
          })
        }
        expect(token).toBe('page-2')
        return jsonResponse({
          messages: [{ id: 'm-p2' }],
          resultSizeEstimate: 2,
        })
      }
      const idMatch = /\/messages\/(m-p\d)$/.exec(url.pathname)
      if (idMatch) {
        return jsonResponse({
          id: idMatch[1],
          threadId: 't-p',
          historyId: '404',
          payload: {
            headers: [{ name: 'Subject', value: idMatch[1] }],
            body: { data: textBody(`${idMatch[1]} body`) },
          },
        })
      }
      return jsonResponse({ error: 'unexpected' }, 500)
    })

    // Two list calls (page 1 + page 2), identical q both times — Gmail
    // pageTokens are only valid for the q they were issued for.
    expect(queries).toHaveLength(2)
    expect(queries[0]).toBe(queries[1] as string)
    expect(
      ops
        .filter((op) => op.type === 'upsertMailMessage')
        .map((op) => op.messageId),
    ).toEqual(['m-p1', 'm-p2'])
  })

  test('sync_window_days: 0 disables the window bound', async () => {
    let backfillQuery: string | null = null
    await collectGoogleOps({ sync_window_days: 0 }, (url) => {
      if (url.pathname.endsWith('/messages')) {
        backfillQuery = url.searchParams.get('q')
        return jsonResponse({ messages: [] })
      }
      return jsonResponse({ error: 'unexpected' }, 500)
    })

    expect(backfillQuery ?? '').not.toContain('after:')
  })

  test('provider search capability translates query and returns ranked results', async () => {
    const originalFetch = globalThis.fetch
    let searchQuery: string | null = null
    globalThis.fetch = ((input: Parameters<typeof fetch>[0]) => {
      const url = new URL(input.toString())
      expect(url.hostname).toBe('gmail.googleapis.com')
      if (
        url.pathname.endsWith('/messages') &&
        !url.pathname.includes('/m-7')
      ) {
        searchQuery = url.searchParams.get('q')
        return Promise.resolve(jsonResponse({ messages: [{ id: 'm-7' }] }))
      }
      if (url.pathname.endsWith('/messages/m-7')) {
        expect(url.searchParams.get('format')).toBe('metadata')
        return Promise.resolve(
          jsonResponse({
            id: 'm-7',
            threadId: 't-7',
            internalDate: '1700000000000',
            snippet: 'federated snippet',
            payload: {
              headers: [
                { name: 'Subject', value: 'Federated hit' },
                { name: 'From', value: 'c@example.com' },
              ],
            },
          }),
        )
      }
      return Promise.resolve(jsonResponse({ error: 'unexpected' }, 500))
    }) as unknown as typeof fetch
    try {
      const search = googleMailboxAdapter.search
      if (!search) throw new Error('google.mailbox must expose search')
      const results = await search(
        {
          sourceId: 'src-gmail-01',
          config: { access_token: 'tok' },
          logger: testLogger() as never,
          signal: new AbortController().signal,
        },
        {
          text: 'quarterly report',
          since: 1690000000000,
          limit: 5,
        },
      )

      expect(searchQuery ?? '').toContain('quarterly report')
      expect(searchQuery ?? '').toContain('after:1690000000')
      expect(searchQuery ?? '').toContain('-in:spam')
      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({
        externalId: 'm-7',
        title: 'Federated hit',
        snippet: 'federated snippet',
        rank: 0,
        timestamp: 1700000000000,
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('historyId too old falls back to bounded window re-list', async () => {
    let relistQuery: string | null = null
    const ops = await collectGoogleOps({ historyId: 'old' }, (url) => {
      if (url.pathname.endsWith('/history')) {
        return jsonResponse({ error: 'historyId too old' }, 404)
      }
      if (
        url.pathname.endsWith('/messages') &&
        !url.pathname.includes('/m-9')
      ) {
        relistQuery = url.searchParams.get('q')
        return jsonResponse({ messages: [{ id: 'm-9' }] })
      }
      if (url.pathname.endsWith('/messages/m-9')) {
        return jsonResponse({
          id: 'm-9',
          threadId: 't-9',
          historyId: '303',
          payload: {
            headers: [{ name: 'Subject', value: 'Relisted' }],
            body: { data: textBody('relisted body') },
          },
        })
      }
      return jsonResponse({ error: 'unexpected' }, 500)
    })

    expect(ops).toContainEqual(
      expect.objectContaining({
        type: 'error',
        code: 'resync_required',
      }),
    )
    // Bounded re-list of the hot window (SPEC §10e), not an unbounded resync.
    expect(relistQuery ?? '').toContain('after:')
    expect(ops).toContainEqual(
      expect.objectContaining({ type: 'upsertMailMessage', messageId: 'm-9' }),
    )
  })
})
