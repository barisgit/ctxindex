import {
  type AdapterAuthSpec,
  type AdapterCapabilities,
  type AdapterMigrations,
  createSourceAdapter,
  type SyncContext,
  type SyncFunction,
} from '@ctxindex/core/registry'
import { ulid } from 'ulid'
import { z } from 'zod'
import {
  GmailHistorySchema,
  type GmailMessage,
  GmailMessageListSchema,
  GmailMessageSchema,
  gmailApiUrl,
  safeFetch,
} from './api'

export {
  exchangeGoogleRefreshToken,
  type GoogleRefreshTokenOptions,
  type OAuthTokenResponse,
  OAuthTokenResponseSchema,
  safeFetch,
} from './api'

export const migrations = {
  namespace: 'google.mailbox',
  migrationsFolder: `${import.meta.dir}/migrations`,
  migrationsTable: 'ctxindex_migrations_google_mailbox',
} satisfies AdapterMigrations

export const googleMailboxMigrations = migrations

export const schema = {}
export const googleMailboxSchema = schema

export const capabilities = {
  kinds: ['mailbox'],
  modes: ['sync', 'resync'],
  supportsResume: true,
  supportsAttachments: true,
  supportsRawRecords: true,
  supportsRealm: true,
} satisfies AdapterCapabilities

export const googleMailboxCapabilities = capabilities

export const auth = {
  kind: 'oauth2',
  provider: 'google',
  scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
  clientIdRef: 'keychain:ctxindex/google/oauth/client_id',
  clientSecretRef: 'keychain:ctxindex/google/oauth/client_secret',
} satisfies AdapterAuthSpec

export const googleMailboxAuth = auth

export const configSchema = z
  .object({
    access_token: z.string().optional(),
    raw_records_enabled: z.boolean().optional(),
  })
  .passthrough()
export const googleMailboxConfigSchema = configSchema

type GmailOp = {
  readonly type: string
  readonly [key: string]: unknown
}

interface GmailCursor {
  readonly historyId?: string
  readonly access_token?: string
  readonly raw_records_enabled?: boolean
}

function parseCursor(cursor: unknown): GmailCursor {
  if (cursor === null || cursor === undefined) return {}
  if (typeof cursor === 'string') {
    try {
      return JSON.parse(cursor) as GmailCursor
    } catch {
      return {}
    }
  }
  if (typeof cursor === 'object') return cursor as GmailCursor
  return {}
}

function authHeaders(cursor: GmailCursor): Record<string, string> {
  return cursor.access_token
    ? { authorization: `Bearer ${cursor.access_token}` }
    : { authorization: 'Bearer test-token' }
}

function messageHeader(
  message: GmailMessage,
  name: string,
): string | undefined {
  return message.payload?.headers.find(
    (header) => header.name.toLowerCase() === name.toLowerCase(),
  )?.value
}

function decodeBase64Url(value: string | undefined): string {
  if (!value) return ''
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(normalized, 'base64').toString('utf8')
}

function collectBodyText(message: GmailMessage): string {
  const parts = (message.payload?.parts ?? []) as {
    mimeType?: string
    body?: { data?: string }
  }[]
  const direct = decodeBase64Url(message.payload?.body?.data)
  const partText = parts
    .map((part) => decodeBase64Url(part.body?.data))
    .filter(Boolean)
    .join('\n')
  return [direct, partText, message.snippet].filter(Boolean).join('\n')
}

async function* emitMessage(
  ctx: SyncContext,
  cursor: GmailCursor,
  messageId: string,
): AsyncGenerator<GmailOp, string | undefined, unknown> {
  const message = await safeFetch(
    GmailMessageSchema,
    gmailApiUrl(`/gmail/v1/users/me/messages/${messageId}?format=full`),
    { headers: authHeaders(cursor) },
  )
  const itemId = ulid()
  const subject = messageHeader(message, 'subject') ?? '(no subject)'
  const from = messageHeader(message, 'from') ?? null
  const to = messageHeader(message, 'to') ?? null
  const rfc822MessageId = messageHeader(message, 'message-id')
  const bodyText = collectBodyText(message)
  const indexedAt = message.internalDate
    ? Number(message.internalDate)
    : Date.now()

  yield {
    type: 'upsertItem',
    itemId,
    sourceId: ctx.sourceId,
    uri: `gmail:${message.id}`,
    title: subject,
    kind: 'mailbox',
    indexedAt,
  }
  yield {
    type: 'item_added',
    itemId,
  }
  yield {
    type: 'upsertMailMessage',
    itemId,
    sourceId: ctx.sourceId,
    messageId: message.id,
    threadId: message.threadId,
    rfc822MessageId,
    subject,
    from,
    to,
    labelIds: message.labelIds,
  }
  yield {
    type: 'upsertExternalRef',
    itemId,
    kind: 'message',
    value: message.id,
  }
  if (rfc822MessageId) {
    yield {
      type: 'upsertExternalRef',
      itemId,
      kind: 'rfc822_message_id',
      value: rfc822MessageId,
    }
  }
  if (bodyText) {
    yield {
      type: 'upsertChunk',
      chunkId: ulid(),
      itemId,
      chunkIndex: 0,
      content: bodyText,
    }
  }

  const parts = (message.payload?.parts ?? []) as {
    filename?: string
    mimeType?: string
    body?: { attachmentId?: string; size?: number; data?: string }
  }[]
  for (const part of parts.filter((p) => p.filename)) {
    yield {
      type: 'upsertMailAttachment',
      attachmentId: ulid(),
      itemId,
      filename: part.filename,
      mimeType: part.mimeType ?? 'application/octet-stream',
      sizeBytes: part.body?.size ?? null,
      providerAttachmentId: part.body?.attachmentId ?? null,
    }
    if (part.body?.attachmentId && (part.body.size ?? 0) <= 25 * 1024 * 1024) {
      const attachment = await safeFetch(
        z
          .object({ data: z.string().optional(), size: z.number().optional() })
          .passthrough(),
        gmailApiUrl(
          `/gmail/v1/users/me/messages/${messageId}/attachments/${part.body.attachmentId}`,
        ),
        { headers: authHeaders(cursor) },
      )
      const attachmentText = decodeBase64Url(attachment.data)
      if (attachmentText) {
        yield {
          type: 'upsertChunk',
          chunkId: ulid(),
          itemId,
          chunkIndex: 1,
          content: attachmentText,
        }
      }
    } else if ((part.body?.size ?? 0) > 25 * 1024 * 1024) {
      yield {
        type: 'error',
        code: 'attachment_too_large',
        message: `gmail attachment too large: ${part.filename}`,
      }
    }
  }

  if (cursor.raw_records_enabled === true) {
    yield {
      type: 'rawRecord',
      itemId,
      payload: message,
    }
  }
  return message.historyId
}

export const sync: SyncFunction = async function* googleMailboxSync(
  ctx: SyncContext,
): AsyncGenerator<GmailOp, void, unknown> {
  const cursor = parseCursor(ctx.cursor)
  let latestHistoryId = cursor.historyId

  if (cursor.historyId) {
    try {
      const history = await safeFetch(
        GmailHistorySchema,
        gmailApiUrl(
          `/gmail/v1/users/me/history?startHistoryId=${encodeURIComponent(cursor.historyId)}`,
        ),
        { headers: authHeaders(cursor) },
      )
      for (const entry of history.history) {
        for (const added of entry.messagesAdded ?? []) {
          const messageHistoryId = yield* emitMessage(
            ctx,
            cursor,
            added.message.id,
          )
          latestHistoryId = messageHistoryId ?? latestHistoryId
        }
      }
      latestHistoryId = history.historyId ?? latestHistoryId
    } catch (err) {
      if ((err as { code?: string }).code === 'not_found') {
        yield {
          type: 'error',
          code: 'resync_required',
          message: 'historyId too old',
        }
      } else {
        throw err
      }
    }
  } else {
    let pageToken: string | undefined
    do {
      const url = new URL(gmailApiUrl('/gmail/v1/users/me/messages'))
      url.searchParams.set('q', 'in:inbox OR in:sent OR label:important')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const page = await safeFetch(GmailMessageListSchema, url.toString(), {
        headers: authHeaders(cursor),
      })
      for (const message of page.messages) {
        const messageHistoryId = yield* emitMessage(ctx, cursor, message.id)
        latestHistoryId = messageHistoryId ?? latestHistoryId
      }
      pageToken = page.nextPageToken
    } while (pageToken)
  }

  yield {
    type: 'checkpoint',
    cursor: JSON.stringify({ historyId: latestHistoryId ?? '0' }),
  }
  yield {
    type: 'setCursor',
    cursor: JSON.stringify({ historyId: latestHistoryId ?? '0' }),
  }
  yield {
    type: 'cursor',
    cursor: JSON.stringify({ historyId: latestHistoryId ?? '0' }),
  }
}

export const googleMailboxSync = sync

export const googleMailboxAdapter = createSourceAdapter('google.mailbox', {
  provider: 'google',
  label: 'Google Mail (Gmail)',
  schema,
  configSchema,
  capabilities,
  migrations,
  sync,
  auth,
})
