import { join } from 'node:path'
import type { Sandbox } from '@ctxindex/core/testing'

export type MockMicrosoftIdentityKind = 'malformed' | 'personal' | 'work'
export type MockMicrosoftTokenMode =
  | 'ok'
  | 'invalid_grant'
  | 'malformed'
  | 'insufficient_scope'

export interface MockGraphRequest {
  readonly method: string
  readonly pathname: string
  readonly search: string
  readonly authorization: string | null
  readonly prefer: string | null
  readonly body: string
}

export interface MockGraphAttachment {
  readonly id: string
  readonly name: string
  readonly contentType: string
  readonly bytes: Uint8Array
  readonly kind?: 'file' | 'item' | 'reference'
  readonly isInline?: boolean
}

export interface MockGraphMessage {
  readonly id: string
  readonly conversationId: string
  readonly internetMessageId: string
  readonly inReplyTo?: string
  readonly subject: string
  readonly bodyPreview: string
  readonly body: string
  readonly from: { readonly name?: string; readonly address: string }
  readonly to: readonly { readonly name?: string; readonly address: string }[]
  readonly cc?: readonly { readonly name?: string; readonly address: string }[]
  readonly bcc?: readonly { readonly name?: string; readonly address: string }[]
  readonly receivedDateTime: string
  readonly lastModifiedDateTime: string
  readonly isRead?: boolean
  readonly isDraft?: boolean
  readonly categories?: readonly string[]
  readonly attachments?: readonly MockGraphAttachment[]
}

export interface MockGraphOptions {
  readonly messages?: readonly MockGraphMessage[]
}

export interface MockGraphServer {
  readonly baseUrl: string
  env(
    sandbox: Sandbox,
    extra?: Record<string, string | undefined>,
  ): Record<string, string | undefined>
  readRequests(): readonly MockGraphRequest[]
  readMessages(): readonly MockGraphMessage[]
  resetRequests(): void
  setIdentity(kind: MockMicrosoftIdentityKind): void
  setTokenMode(mode: MockMicrosoftTokenMode): void
  setMessages(messages: readonly MockGraphMessage[]): void
  setGraphStatus(status: number | undefined): void
  stop(): void
}

interface TokenParams {
  get(name: string): string | null
}

type TokenParamsConstructor = new (body: string) => TokenParams

const TokenSearchParams = (
  globalThis as unknown as Record<string, TokenParamsConstructor>
)['URL' + 'SearchParams'] as TokenParamsConstructor

const identities = {
  malformed: {
    displayName: 'Missing stable Graph id',
    mail: 'malformed@example.test',
    userPrincipalName: 'malformed@example.test',
  },
  personal: {
    id: 'microsoft-personal-subject',
    displayName: 'Personal Fixture',
    mail: null,
    userPrincipalName: 'personal@example.test',
  },
  work: {
    id: 'microsoft-work-subject',
    displayName: 'Work Fixture',
    mail: 'work@example.test',
    userPrincipalName: 'work@example.test',
  },
} as const

function redactedAuthorization(request: Request): string | null {
  const authorization = request.headers.get('authorization')
  if (!authorization) return null
  const scheme = authorization.split(' ', 1)[0]
  return scheme ? `${scheme} [REDACTED]` : '[REDACTED]'
}

function recordedBody(pathname: string, body: string): string {
  return pathname === '/oauth/microsoft/token' ? '[REDACTED OAUTH FORM]' : body
}

function graphMessage(message: MockGraphMessage) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    internetMessageId: message.internetMessageId,
    internetMessageHeaders: message.inReplyTo
      ? [{ name: 'In-Reply-To', value: message.inReplyTo }]
      : [],
    subject: message.subject,
    bodyPreview: message.bodyPreview,
    body: { contentType: 'text', content: message.body },
    from: {
      emailAddress: {
        ...(message.from.name ? { name: message.from.name } : {}),
        address: message.from.address,
      },
    },
    toRecipients: message.to.map((recipient) => ({
      emailAddress: {
        ...(recipient.name ? { name: recipient.name } : {}),
        address: recipient.address,
      },
    })),
    ccRecipients: (message.cc ?? []).map((recipient) => ({
      emailAddress: {
        ...(recipient.name ? { name: recipient.name } : {}),
        address: recipient.address,
      },
    })),
    bccRecipients: (message.bcc ?? []).map((recipient) => ({
      emailAddress: {
        ...(recipient.name ? { name: recipient.name } : {}),
        address: recipient.address,
      },
    })),
    receivedDateTime: message.receivedDateTime,
    sentDateTime: message.receivedDateTime,
    lastModifiedDateTime: message.lastModifiedDateTime,
    isRead: message.isRead ?? false,
    isDraft: message.isDraft ?? false,
    categories: [...(message.categories ?? [])],
    hasAttachments: (message.attachments?.length ?? 0) > 0,
  }
}

function attachmentMetadata(attachment: MockGraphAttachment) {
  const kind = attachment.kind ?? 'file'
  return {
    '@odata.type': `#microsoft.graph.${kind}Attachment`,
    id: attachment.id,
    name: attachment.name,
    contentType: attachment.contentType,
    size: attachment.bytes.byteLength,
    isInline: attachment.isInline ?? false,
  }
}

export function startMockGraph(
  options: MockGraphOptions = {},
): MockGraphServer {
  const requests: MockGraphRequest[] = []
  const validRefreshTokens = new Set(['microsoft-initial-refresh-token'])
  let identityKind: MockMicrosoftIdentityKind = 'work'
  let tokenMode: MockMicrosoftTokenMode = 'ok'
  let rotation = 0
  let messages = [...(options.messages ?? [])]
  let graphStatus: number | undefined
  let draftSequence = 0

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      const body = await request.text()
      requests.push({
        method: request.method,
        pathname: url.pathname,
        search: url.search,
        authorization: redactedAuthorization(request),
        prefer: request.headers.get('prefer'),
        body: recordedBody(url.pathname, body),
      })

      if (url.pathname === '/oauth/microsoft/token') {
        if (request.method !== 'POST') {
          return Response.json({ error: 'method_not_allowed' }, { status: 405 })
        }
        if (tokenMode === 'malformed')
          return Response.json({ expires_in: 3600 })
        const params = new TokenSearchParams(body)
        const grantType = params.get('grant_type')
        if (tokenMode === 'invalid_grant') {
          return Response.json({ error: 'invalid_grant' }, { status: 400 })
        }
        if (grantType === 'refresh_token') {
          const refreshToken = params.get('refresh_token')
          if (!refreshToken || !validRefreshTokens.delete(refreshToken)) {
            return Response.json({ error: 'invalid_grant' }, { status: 400 })
          }
        } else if (grantType !== 'authorization_code') {
          return Response.json(
            { error: 'unsupported_grant_type' },
            { status: 400 },
          )
        }
        rotation += 1
        const refreshToken = `microsoft-rotated-refresh-${rotation}`
        validRefreshTokens.add(refreshToken)
        return Response.json({
          access_token: `microsoft-access-${rotation}`,
          refresh_token: refreshToken,
          expires_in: 3600,
          token_type: 'Bearer',
          // Microsoft commonly omits OIDC/offline scopes from this field.
          scope:
            tokenMode === 'insufficient_scope'
              ? 'User.Read'
              : 'Mail.ReadWrite User.Read',
        })
      }

      if (url.pathname === '/oauth/microsoft/identity') {
        return Response.json(identities[identityKind])
      }

      if (url.pathname.startsWith('/v1.0/')) {
        if (graphStatus !== undefined) {
          return Response.json(
            { error: { code: 'mockFailure', message: 'bounded mock failure' } },
            { status: graphStatus },
          )
        }
        if (!request.headers.get('prefer')?.includes('IdType="ImmutableId"')) {
          return Response.json(
            { error: 'immutable_id_required' },
            { status: 400 },
          )
        }
      }

      if (url.pathname === '/v1.0/me/messages' && request.method === 'POST') {
        let input: {
          subject: string
          body: { contentType: string; content: string }
          toRecipients: Array<{
            emailAddress: { name?: string; address: string }
          }>
          ccRecipients: Array<{
            emailAddress: { name?: string; address: string }
          }>
          bccRecipients: Array<{
            emailAddress: { name?: string; address: string }
          }>
        }
        try {
          input = JSON.parse(body)
        } catch {
          return Response.json({ error: 'invalid_json' }, { status: 400 })
        }
        const lists = [
          input.toRecipients,
          input.ccRecipients,
          input.bccRecipients,
        ]
        if (
          typeof input.subject !== 'string' ||
          input.body?.contentType !== 'Text' ||
          typeof input.body.content !== 'string' ||
          !lists.every(
            (list) =>
              Array.isArray(list) &&
              list.every(
                (recipient) =>
                  typeof recipient?.emailAddress?.address === 'string',
              ),
          )
        )
          return Response.json({ error: 'invalid_draft' }, { status: 400 })
        draftSequence += 1
        const created: MockGraphMessage = {
          id: `outlook-draft-${draftSequence}`,
          conversationId: `outlook-draft-conversation-${draftSequence}`,
          internetMessageId: `<outlook-draft-${draftSequence}@example.test>`,
          subject: input.subject,
          bodyPreview: input.body.content,
          body: input.body.content,
          from: { address: 'work@example.test' },
          to: input.toRecipients.map(({ emailAddress }) => ({
            ...(emailAddress.name ? { name: emailAddress.name } : {}),
            address: emailAddress.address,
          })),
          cc: input.ccRecipients.map(({ emailAddress }) => ({
            ...(emailAddress.name ? { name: emailAddress.name } : {}),
            address: emailAddress.address,
          })),
          bcc: input.bccRecipients.map(({ emailAddress }) => ({
            ...(emailAddress.name ? { name: emailAddress.name } : {}),
            address: emailAddress.address,
          })),
          receivedDateTime: '2026-07-16T12:00:00.000Z',
          lastModifiedDateTime: '2026-07-16T12:00:00.000Z',
          isRead: true,
          isDraft: true,
        }
        messages.push(created)
        return Response.json(graphMessage(created), { status: 201 })
      }

      if (url.pathname === '/v1.0/me/messages' && request.method === 'GET') {
        return Response.json({ value: messages.map(graphMessage) })
      }

      const attachmentValue = url.pathname.match(
        /^\/v1\.0\/me\/messages\/([^/]+)\/attachments\/([^/]+)\/\$value$/,
      )
      if (attachmentValue?.[1] && attachmentValue[2]) {
        const message = messages.find(
          (candidate) =>
            candidate.id === decodeURIComponent(attachmentValue[1] ?? ''),
        )
        const attachment = message?.attachments?.find(
          (candidate) =>
            candidate.id === decodeURIComponent(attachmentValue[2] ?? ''),
        )
        if (!attachment || (attachment.kind ?? 'file') !== 'file')
          return Response.json({ error: 'not_found' }, { status: 404 })
        return new Response(attachment.bytes.slice(), {
          headers: {
            'content-type': attachment.contentType,
            'content-length': String(attachment.bytes.byteLength),
          },
        })
      }

      const attachmentList = url.pathname.match(
        /^\/v1\.0\/me\/messages\/([^/]+)\/attachments$/,
      )
      if (attachmentList?.[1]) {
        const message = messages.find(
          (candidate) =>
            candidate.id === decodeURIComponent(attachmentList[1] ?? ''),
        )
        if (!message)
          return Response.json({ error: 'not_found' }, { status: 404 })
        return Response.json({
          value: (message.attachments ?? []).map(attachmentMetadata),
        })
      }

      const messageMatch = url.pathname.match(
        /^\/v1\.0\/me\/messages\/([^/]+)$/,
      )
      if (messageMatch?.[1] && request.method === 'PATCH') {
        const id = decodeURIComponent(messageMatch[1])
        const index = messages.findIndex((candidate) => candidate.id === id)
        if (index < 0 || !messages[index]?.isDraft)
          return Response.json({ error: 'not_found' }, { status: 404 })
        let input: {
          subject: string
          body: { contentType: string; content: string }
          toRecipients: Array<{
            emailAddress: { name?: string; address: string }
          }>
          ccRecipients: Array<{
            emailAddress: { name?: string; address: string }
          }>
          bccRecipients: Array<{
            emailAddress: { name?: string; address: string }
          }>
        }
        try {
          input = JSON.parse(body)
        } catch {
          return Response.json({ error: 'invalid_json' }, { status: 400 })
        }
        const previous = messages[index]
        if (
          !previous ||
          typeof input.subject !== 'string' ||
          input.body?.contentType !== 'Text' ||
          typeof input.body.content !== 'string' ||
          ![input.toRecipients, input.ccRecipients, input.bccRecipients].every(
            (list) =>
              Array.isArray(list) &&
              list.every(
                (recipient) =>
                  typeof recipient?.emailAddress?.address === 'string',
              ),
          )
        )
          return Response.json({ error: 'invalid_draft' }, { status: 400 })
        const updated: MockGraphMessage = {
          ...previous,
          subject: input.subject,
          bodyPreview: input.body.content,
          body: input.body.content,
          to: input.toRecipients.map(({ emailAddress }) => ({
            ...(emailAddress.name ? { name: emailAddress.name } : {}),
            address: emailAddress.address,
          })),
          cc: input.ccRecipients.map(({ emailAddress }) => ({
            ...(emailAddress.name ? { name: emailAddress.name } : {}),
            address: emailAddress.address,
          })),
          bcc: input.bccRecipients.map(({ emailAddress }) => ({
            ...(emailAddress.name ? { name: emailAddress.name } : {}),
            address: emailAddress.address,
          })),
          lastModifiedDateTime: '2026-07-16T12:01:00.000Z',
        }
        messages[index] = updated
        return Response.json(graphMessage(updated))
      }
      if (messageMatch?.[1] && request.method === 'GET') {
        if (
          !request.headers
            .get('prefer')
            ?.includes('outlook.body-content-type="text"')
        ) {
          return Response.json({ error: 'text_body_required' }, { status: 400 })
        }
        const message = messages.find(
          (candidate) =>
            candidate.id === decodeURIComponent(messageMatch[1] ?? ''),
        )
        if (!message)
          return Response.json({ error: 'not_found' }, { status: 404 })
        return Response.json(graphMessage(message))
      }

      return Response.json({ error: 'not_found' }, { status: 404 })
    },
  })

  const baseUrl = server.url.toString().replace(/\/$/, '')
  return {
    baseUrl,
    env(sandbox, extra = {}) {
      return {
        NODE_ENV: 'test',
        CTXINDEX_OAUTH_MOCK_BASE_URL: baseUrl,
        CTXINDEX_GRAPH_MOCK_BASE_URL: baseUrl,
        CTXINDEX_MICROSOFT_CLIENT_ID: 'microsoft-fixture-client-id',
        CTXINDEX_MICROSOFT_REFRESH_TOKEN: 'microsoft-initial-refresh-token',
        CTXINDEX_KEYTAR_MOCK_FILE: join(sandbox.dir, 'keytar.json'),
        ...extra,
      }
    },
    readRequests() {
      return requests.map((request) => ({ ...request }))
    },
    readMessages() {
      return messages.map((message) => ({ ...message }))
    },
    resetRequests() {
      requests.length = 0
    },
    setIdentity(kind) {
      identityKind = kind
    },
    setTokenMode(mode) {
      tokenMode = mode
    },
    setMessages(value) {
      messages = [...value]
    },
    setGraphStatus(status) {
      graphStatus = status
    },
    stop() {
      server.stop(true)
    },
  }
}
