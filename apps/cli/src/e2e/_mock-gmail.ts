import { join } from 'node:path'
import type { Sandbox } from '@ctxindex/core/testing'

export type MockTokenMode = 'ok' | 'invalid_grant'

export interface MockGmailOptions {
  readonly accessToken?: string
  readonly refreshToken?: string
  readonly messages?: readonly MockGmailMessage[]
}

export interface MockGmailMessage {
  readonly id: string
  readonly threadId: string
  readonly subject: string
  readonly body: string
  readonly historyId: string
  readonly attachmentText?: string
}

interface TokenCall {
  get(name: string): string | null
}

type TokenParamsCtor = new (body: string) => TokenCall

const TokenParams = (globalThis as unknown as Record<string, TokenParamsCtor>)[
  'URL' + 'SearchParams'
] as TokenParamsCtor

export interface MockGmailServer {
  readonly baseUrl: string
  readonly tokenUrl: string
  readonly tokenCalls: TokenCall[]
  setRefreshMode(mode: MockTokenMode): void
  setAuthCodeMode(mode: MockTokenMode): void
  env(
    sandbox: Sandbox,
    extra?: Record<string, string | undefined>,
  ): Record<string, string | undefined>
  stop(): void
}

const defaultAccessToken = 'akzx-access-token-secret'
const defaultRefreshToken = 'akzx-refresh-token-secret'

const defaultMessages: readonly MockGmailMessage[] = [
  {
    id: 'msg-1',
    threadId: 'thread-1',
    subject: 'ctxindex mock hello',
    body: 'A mock Gmail message body for ctxindex e2e tests.',
    historyId: '1001',
    attachmentText: 'mock attachment text',
  },
]

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function json(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init)
}

function fullMessage(message: MockGmailMessage): Record<string, unknown> {
  const parts: Record<string, unknown>[] = [
    {
      mimeType: 'text/plain',
      body: { data: base64Url(message.body), size: message.body.length },
    },
  ]
  if (message.attachmentText) {
    parts.push({
      filename: 'mock.txt',
      mimeType: 'text/plain',
      body: {
        attachmentId: `${message.id}-attachment`,
        size: message.attachmentText.length,
      },
    })
  }

  return {
    id: message.id,
    threadId: message.threadId,
    historyId: message.historyId,
    internalDate: String(Date.now()),
    snippet: message.body.slice(0, 80),
    labelIds: ['INBOX'],
    payload: {
      mimeType: 'multipart/mixed',
      headers: [
        { name: 'Subject', value: message.subject },
        { name: 'From', value: 'sender@example.test' },
        { name: 'To', value: 'recipient@example.test' },
        { name: 'Message-Id', value: `<${message.id}@example.test>` },
      ],
      parts,
    },
  }
}

export function startMockGmail(
  options: MockGmailOptions = {},
): MockGmailServer {
  const messages = [...(options.messages ?? defaultMessages)]
  const tokenCalls: TokenCall[] = []
  let refreshMode: MockTokenMode = 'ok'
  let authCodeMode: MockTokenMode = 'ok'
  const accessToken = options.accessToken ?? defaultAccessToken
  const refreshToken = options.refreshToken ?? defaultRefreshToken

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === '/token') {
        const body = await request.text()
        const params = new TokenParams(body)
        tokenCalls.push(params)
        const grantType = params.get('grant_type')
        if (grantType === 'refresh_token' && refreshMode === 'invalid_grant') {
          return json({ error: 'invalid_grant' }, { status: 400 })
        }
        if (
          grantType === 'authorization_code' &&
          authCodeMode === 'invalid_grant'
        ) {
          return json({ error: 'invalid_grant' }, { status: 400 })
        }
        if (grantType === 'refresh_token') {
          return json({
            access_token: accessToken,
            expires_in: 3600,
            token_type: 'Bearer',
          })
        }
        return json({
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 3600,
          token_type: 'Bearer',
        })
      }

      if (url.pathname === '/gmail/v1/users/me/profile') {
        return json({
          emailAddress: 'mock@example.com',
          historyId: messages.at(-1)?.historyId ?? '0',
        })
      }

      if (url.pathname === '/gmail/v1/users/me/messages') {
        return json({
          messages: messages.map((message) => ({
            id: message.id,
            threadId: message.threadId,
          })),
          resultSizeEstimate: messages.length,
        })
      }

      if (url.pathname === '/gmail/v1/users/me/history') {
        return json({
          history: [],
          historyId: messages.at(-1)?.historyId ?? '0',
        })
      }

      const messageMatch = url.pathname.match(
        /^\/gmail\/v1\/users\/me\/messages\/([^/]+)$/,
      )
      if (messageMatch?.[1]) {
        const message = messages.find((entry) => entry.id === messageMatch[1])
        if (!message) return json({ error: 'not_found' }, { status: 404 })
        return json(fullMessage(message))
      }

      const attachmentMatch = url.pathname.match(
        /^\/gmail\/v1\/users\/me\/messages\/([^/]+)\/attachments\/([^/]+)$/,
      )
      if (attachmentMatch?.[1]) {
        const message = messages.find(
          (entry) => entry.id === attachmentMatch[1],
        )
        if (!message?.attachmentText) {
          return json({ error: 'not_found' }, { status: 404 })
        }
        return json({
          data: base64Url(message.attachmentText),
          size: message.attachmentText.length,
        })
      }

      return json({ error: 'not_found' }, { status: 404 })
    },
  })

  const baseUrl = server.url.toString().replace(/\/$/, '')
  return {
    baseUrl,
    tokenUrl: `${baseUrl}/token`,
    tokenCalls,
    setRefreshMode(mode) {
      refreshMode = mode
    },
    setAuthCodeMode(mode) {
      authCodeMode = mode
    },
    env(sandbox, extra = {}) {
      return {
        NODE_ENV: 'test',
        CTXINDEX_GMAIL_MOCK_BASE_URL: baseUrl,
        CTXINDEX_GMAIL_TOKEN_URL: `${baseUrl}/token`,
        CTXINDEX_GMAIL_CLIENT_ID: 'mock-client-id',
        CTXINDEX_GMAIL_CLIENT_SECRET: 'mock-client-secret',
        CTXINDEX_KEYTAR_MOCK_FILE: join(sandbox.dir, 'keytar.json'),
        ...extra,
      }
    },
    stop() {
      server.stop(true)
    },
  }
}
