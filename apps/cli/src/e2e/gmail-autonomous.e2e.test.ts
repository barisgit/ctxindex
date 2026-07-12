import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'

const repoRoot = resolve(
  fileURLToPath(new URL('../../../../', import.meta.url)),
)
const apiPath = join(repoRoot, 'packages/adapters/src/google-mailbox/api.ts')
const clientId = 'gmail-client-id'
const clientSecret = 'gmail-client-secret'
const refreshToken = 'gmail-refresh-token'
const accessToken = 'gmail-access-token'
const maxAttachmentBytes = 25 * 1024 * 1024

interface GmailMockOptions {
  readonly rateLimitMessagesOnce?: boolean
  readonly oversizedAttachment?: boolean
}

interface GmailMockServer {
  readonly baseUrl: string
  readonly calls: {
    token: number
    messages: number
    history: number
    message: number
    attachment: number
  }
  close(): void
}

function dbPath(sandbox: Sandbox): string {
  return join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite')
}

function textBody(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function parseSourceId(stdout: string): string {
  const match = stdout.match(/source added: (\S+)/)
  expect(match).not.toBeNull()
  const id = match?.[1]
  expect(id).toBeDefined()
  return id as string
}

function countRows(db: Database, table: string): number {
  const row = db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as {
    count: number
  }
  return row.count
}

function latestErrorsCount(db: Database): number {
  const row = db
    .prepare(
      'SELECT errors_count FROM sync_runs ORDER BY started_at DESC LIMIT 1',
    )
    .get() as { errors_count: number } | null
  return row?.errors_count ?? 0
}

function cursorJson(db: Database): string | null {
  const row = db
    .prepare('SELECT cursor_json FROM source_sync_state LIMIT 1')
    .get() as { cursor_json: string | null } | null
  return row?.cursor_json ?? null
}

function modeAEnv(
  sandbox: Sandbox,
  server: GmailMockServer,
): Record<string, string> {
  return {
    NODE_ENV: 'test',
    CTXINDEX_GMAIL_MOCK_BASE_URL: server.baseUrl,
    CTXINDEX_GMAIL_TOKEN_URL: new URL('/token', server.baseUrl).toString(),
    CTXINDEX_GMAIL_CLIENT_ID: clientId,
    CTXINDEX_GMAIL_CLIENT_SECRET: clientSecret,
    CTXINDEX_GMAIL_REFRESH_TOKEN: refreshToken,
    CTXINDEX_KEYTAR_MOCK_FILE: join(sandbox.dir, 'keytar.json'),
  }
}

function messagePayload(options: GmailMockOptions): Record<string, unknown> {
  const attachmentSize = options.oversizedAttachment
    ? maxAttachmentBytes + 1
    : 15
  return {
    id: 'msg-1',
    threadId: 'thread-1',
    historyId: '101',
    internalDate: '1700000000000',
    snippet: 'fixture snippet',
    labelIds: ['INBOX'],
    payload: {
      headers: [
        { name: 'Subject', value: 'Autonomous Gmail fixture' },
        { name: 'From', value: 'sender@example.com' },
        { name: 'To', value: 'recipient@example.com' },
        { name: 'Message-ID', value: '<msg-1@example.com>' },
      ],
      body: { data: textBody('hello from gmail fixture') },
      parts: [
        {
          filename: 'note.txt',
          mimeType: 'text/plain',
          body: { attachmentId: 'att-1', size: attachmentSize },
        },
      ],
    },
  }
}

function startGmailMockServer(options: GmailMockOptions = {}): GmailMockServer {
  const calls = {
    token: 0,
    messages: 0,
    history: 0,
    message: 0,
    attachment: 0,
  }
  let rateLimited = false

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === '/token') {
        calls.token += 1
        if (request.method !== 'POST') {
          return Response.json({ error: 'method_not_allowed' }, { status: 405 })
        }
        return Response.json({
          access_token: accessToken,
          expires_in: 3600,
          token_type: 'Bearer',
        })
      }

      if (url.pathname === '/gmail/v1/users/me/history') {
        calls.history += 1
        return Response.json({ historyId: '101', history: [] })
      }

      if (url.pathname === '/gmail/v1/users/me/profile') {
        return Response.json({
          emailAddress: 'mock@example.com',
          historyId: '101',
        })
      }

      if (url.pathname === '/gmail/v1/users/me/messages') {
        calls.messages += 1
        if (options.rateLimitMessagesOnce && !rateLimited) {
          rateLimited = true
          return Response.json(
            { error: 'rate_limited' },
            { status: 429, headers: { 'retry-after': '0' } },
          )
        }
        return Response.json({
          messages: [{ id: 'msg-1', threadId: 'thread-1' }],
          resultSizeEstimate: 1,
        })
      }

      const attachmentMatch =
        /^\/gmail\/v1\/users\/me\/messages\/([^/]+)\/attachments\/([^/]+)$/.exec(
          url.pathname,
        )
      if (attachmentMatch) {
        calls.attachment += 1
        return Response.json({ data: textBody('attachment body'), size: 15 })
      }

      const messageMatch = /^\/gmail\/v1\/users\/me\/messages\/([^/]+)$/.exec(
        url.pathname,
      )
      if (messageMatch) {
        calls.message += 1
        return Response.json(messagePayload(options))
      }

      return Response.json(
        { error: `not found: ${url.pathname}` },
        { status: 404 },
      )
    },
  })

  return {
    baseUrl: server.url.toString().replace(/\/$/, ''),
    calls,
    close() {
      server.stop(true)
    },
  }
}

async function initAuthAndSource(
  sandbox: Sandbox,
  server: GmailMockServer,
): Promise<{ sourceId: string; env: Record<string, string> }> {
  const env = modeAEnv(sandbox, server)
  const init = await sandbox.run(['init'], { env })
  expect(init.stderr).toBe('')
  expect(init.exitCode).toBe(0)

  const auth = await sandbox.run(['auth', 'add', 'google', '--from-env'], {
    env,
  })
  expect(auth.stderr).toBe('')
  expect(auth.exitCode, auth.stderr).toBe(0)

  const source = await sandbox.run(['source', 'add', 'google.mailbox'], { env })
  expect(source.stderr).toBe('')
  expect(source.exitCode, source.stderr).toBe(0)

  return { sourceId: parseSourceId(source.stdout), env }
}

async function withSyncedGmail(
  options: GmailMockOptions,
  fn: (args: {
    sandbox: Sandbox
    server: GmailMockServer
    sourceId: string
    env: Record<string, string>
    sync: Awaited<ReturnType<Sandbox['run']>>
  }) => Promise<void>,
): Promise<void> {
  const sandbox = await createSandbox()
  const server = startGmailMockServer(options)
  try {
    const { sourceId, env } = await initAuthAndSource(sandbox, server)
    const sync = await sandbox.run(['sync', '--source', sourceId], { env })
    await fn({ sandbox, server, sourceId, env, sync })
  } finally {
    server.close()
    await sandbox.cleanup()
  }
}

describe('gmail autonomous e2e', () => {
  test('mode a mock sync exits 0', async () => {
    await withSyncedGmail({}, async ({ sync }) => {
      expect(sync.stderr).toBe('')
      expect(sync.exitCode, sync.stderr).toBe(0)
      expect(sync.stdout).toContain('sync completed:')
    })
  })

  test('mail_messages rows inserted', async () => {
    await withSyncedGmail({}, async ({ sandbox }) => {
      const db = new Database(dbPath(sandbox), { readonly: true })
      try {
        expect(countRows(db, 'mail_messages')).toBeGreaterThan(0)
        expect(countRows(db, 'mail_attachments')).toBeGreaterThan(0)
      } finally {
        db.close()
      }
    })
  })

  test('cursor advanced', async () => {
    await withSyncedGmail({}, async ({ sandbox }) => {
      const db = new Database(dbPath(sandbox), { readonly: true })
      try {
        const cursor = cursorJson(db)
        expect(cursor).not.toBeNull()
        expect(Number(JSON.parse(cursor ?? '{}').historyId)).toBeGreaterThan(0)
      } finally {
        db.close()
      }
    })
  })

  test('rate-limit 429 then 200 retried', async () => {
    await withSyncedGmail(
      { rateLimitMessagesOnce: true },
      async ({ server, sync }) => {
        expect(sync.stderr).toBe('')
        expect(sync.exitCode, sync.stderr).toBe(0)
        expect(server.calls.messages).toBe(2)
      },
    )
  })

  test('oversized attachment increments errors_count', async () => {
    await withSyncedGmail(
      { oversizedAttachment: true },
      async ({ sandbox, sync }) => {
        expect([0, 20]).toContain(sync.exitCode)
        const db = new Database(dbPath(sandbox), { readonly: true })
        try {
          expect(latestErrorsCount(db)).toBeGreaterThan(0)
        } finally {
          db.close()
        }
      },
    )
  })

  test('rerun no duplicate messages', async () => {
    await withSyncedGmail({}, async ({ sandbox, sourceId, env }) => {
      const db = new Database(dbPath(sandbox), { readonly: true })
      try {
        const firstCount = countRows(db, 'mail_messages')
        const second = await sandbox.run(['sync', '--source', sourceId], {
          env,
        })
        expect(second.stderr).toBe('')
        expect(second.exitCode, second.stderr).toBe(0)
        expect(countRows(db, 'mail_messages')).toBe(firstCount)
      } finally {
        db.close()
      }
    })
  })

  test('mock env-gated', async () => {
    const proc = Bun.spawn(['rg', 'NODE_ENV.*production', apiPath], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])

    expect(exitCode, stderr).toBe(0)
    expect(stdout).toContain('NODE_ENV')
    expect(stdout).toContain('production')
  })
})
