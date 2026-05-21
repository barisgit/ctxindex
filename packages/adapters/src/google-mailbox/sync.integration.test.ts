import { describe, expect, test } from 'bun:test'
import type { SyncContext } from '@ctxindex/core/registry'
import { googleMailboxAdapter } from './index'

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
        cursor: JSON.stringify({ historyId: '101' }),
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

  test('historyId too old surfaces resync_required warning', async () => {
    const ops = await collectGoogleOps({ historyId: 'old' }, (url) => {
      expect(url.pathname.endsWith('/history')).toBe(true)
      return jsonResponse({ error: 'historyId too old' }, 404)
    })

    expect(ops).toContainEqual(
      expect.objectContaining({
        type: 'error',
        code: 'resync_required',
      }),
    )
  })
})
