import {
  CtxindexContinuationError,
  CtxindexSyncError,
} from '@ctxindex/core/errors'
import type {
  SearchContext,
  SearchRemoteResource,
  SearchRemoteResult,
} from '@ctxindex/extension-sdk'
import { mailMessageSchema } from '@ctxindex/profiles'
import {
  type GmailMessage,
  gmailHeader,
  gmailHeaderAddresses,
  gmailOccurredAt,
  normalizeGmailMessageId,
  normalizeGmailReferences,
} from './message'
import { gmailJson } from './response'
import { gmailApiUrl } from './url'

const MAX_PAGES = 3
const MAX_ITEMS = 50

interface GmailListResponse {
  readonly messages?: readonly { readonly id?: string }[]
  readonly nextPageToken?: string
}

function gmailQuery(query: SearchContext['query']): string {
  const text = query.text
    .trim()
    .split(/\s+/)
    .filter((part) => part !== '-in:drafts')
    .join(' ')
  const parts = [text]
  for (const field of query.fields ?? []) {
    if (field.name === 'sender') parts.push(`from:${String(field.value)}`)
    if (field.name === 'unread') {
      parts.push(field.value === true ? 'is:unread' : '-is:unread')
    }
  }
  if (query.since !== undefined) {
    parts.push(`after:${Math.floor(query.since / 1000)}`)
  }
  if (query.until !== undefined) {
    parts.push(`before:${Math.floor(query.until / 1000) + 1}`)
  }
  parts.push('-in:drafts')
  return parts.filter(Boolean).join(' ')
}

function parseListResponse(value: unknown): GmailListResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CtxindexSyncError(
      'Gmail returned an invalid list response',
      'provider_bad_response',
    )
  }
  const candidate = value as {
    readonly messages?: unknown
    readonly nextPageToken?: unknown
  }
  if (
    candidate.messages !== undefined &&
    (!Array.isArray(candidate.messages) ||
      !candidate.messages.every(
        (message) =>
          message !== null &&
          typeof message === 'object' &&
          typeof (message as { id?: unknown }).id === 'string',
      ))
  ) {
    throw new CtxindexSyncError(
      'Gmail returned an invalid list response',
      'provider_bad_response',
    )
  }
  if (
    candidate.nextPageToken !== undefined &&
    typeof candidate.nextPageToken !== 'string'
  ) {
    throw new CtxindexSyncError(
      'Gmail returned an invalid list response',
      'provider_bad_response',
    )
  }
  return value as GmailListResponse
}

function resource(
  sourceId: string,
  message: GmailMessage,
): SearchRemoteResource {
  if (!message.id) throw new Error('Gmail metadata response omitted message id')
  const subject = gmailHeader(message, 'Subject')
  const from = gmailHeader(message, 'From')
  const to = gmailHeader(message, 'To')
  const rfcMessageId = normalizeGmailMessageId(
    gmailHeader(message, 'Message-ID'),
  )
  const inReplyTo = normalizeGmailMessageId(gmailHeader(message, 'In-Reply-To'))
  const references = normalizeGmailReferences(
    gmailHeader(message, 'References'),
  )
  const replyTo = gmailHeaderAddresses(gmailHeader(message, 'Reply-To'))
  const timestamp = gmailOccurredAt(message)
  const payload = mailMessageSchema.parse({
    providerMessageId: message.id,
    ...(message.threadId ? { threadId: message.threadId } : {}),
    ...(message.threadId
      ? { conversationKey: `${sourceId.toUpperCase()}:${message.threadId}` }
      : {}),
    ...(rfcMessageId ? { rfcMessageId } : {}),
    ...(inReplyTo ? { inReplyTo } : {}),
    ...(references ? { references } : {}),
    ...(replyTo ? { replyTo } : {}),
    ...(subject ? { subject } : {}),
    ...(from ? { from: [from] } : {}),
    ...(to ? { to: [to] } : {}),
    ...(timestamp !== undefined
      ? { date: new Date(timestamp).toISOString() }
      : {}),
    ...(message.snippet ? { snippet: message.snippet } : {}),
    ...(message.labelIds ? { labels: [...message.labelIds] } : {}),
    ...(message.labelIds
      ? { unread: message.labelIds.includes('UNREAD') }
      : {}),
  })
  return {
    ref: `ctx://${sourceId.toUpperCase()}/message/${message.id}`,
    profile: { id: 'mail.message', version: 1 },
    title: subject ?? null,
    occurredAt: timestamp ?? null,
    payload,
  }
}

export async function gmailSearchRemote(
  context: SearchContext,
): Promise<SearchRemoteResult> {
  if (context.query.continuation !== undefined) {
    throw new CtxindexContinuationError(
      'Gmail mailbox remote search does not support continuation',
    )
  }
  const itemLimit = Math.min(Math.max(context.query.limit, 0), MAX_ITEMS)
  const ids: string[] = []
  const seen = new Set<string>()
  let pageToken: string | undefined
  let pageCount = 0
  let itemTruncated = false
  do {
    const listUrl = new URL(gmailApiUrl('/gmail/v1/users/me/messages'))
    listUrl.searchParams.set('q', gmailQuery(context.query))
    listUrl.searchParams.set('maxResults', String(itemLimit - ids.length))
    if (pageToken) listUrl.searchParams.set('pageToken', pageToken)
    const listed = parseListResponse(
      await gmailJson(await context.fetch(listUrl, { signal: context.signal })),
    )
    pageCount += 1
    for (const message of listed.messages ?? []) {
      if (!message.id || seen.has(message.id)) continue
      if (ids.length === itemLimit) {
        itemTruncated = true
        break
      }
      seen.add(message.id)
      ids.push(message.id)
    }
    pageToken = listed.nextPageToken
    if (ids.length === itemLimit && pageToken) itemTruncated = true
  } while (pageToken && pageCount < MAX_PAGES && ids.length < itemLimit)

  const resources: SearchRemoteResource[] = []
  const warnings: SearchRemoteResult['warnings'][number][] = []
  for (const id of ids) {
    context.signal.throwIfAborted()
    const metadataUrl = new URL(
      gmailApiUrl(`/gmail/v1/users/me/messages/${encodeURIComponent(id)}`),
    )
    metadataUrl.searchParams.set('format', 'metadata')
    metadataUrl.searchParams.set(
      'fields',
      'id,threadId,labelIds,snippet,internalDate,payload/headers',
    )
    for (const name of [
      'Subject',
      'From',
      'To',
      'Date',
      'Message-ID',
      'In-Reply-To',
      'References',
      'Reply-To',
    ]) {
      metadataUrl.searchParams.append('metadataHeaders', name)
    }
    try {
      const message = (await gmailJson(
        await context.fetch(metadataUrl, { signal: context.signal }),
      )) as GmailMessage
      resources.push(resource(context.source.id, message))
    } catch (cause) {
      if (
        context.signal.aborted ||
        (typeof cause === 'object' &&
          cause !== null &&
          'name' in cause &&
          cause.name === 'AbortError')
      ) {
        throw cause
      }
      warnings.push({
        code: 'partial_item_failure',
        message: `Gmail metadata fetch failed for message ${id}`,
        ref: `ctx://${context.source.id.toUpperCase()}/message/${id}`,
      })
    }
  }
  if (itemTruncated) {
    warnings.push({
      code: 'truncated',
      message: `Gmail remote search was truncated after ${itemLimit} items`,
    })
  } else if (pageToken) {
    warnings.push({
      code: 'truncated',
      message: `Gmail remote search was truncated after ${MAX_PAGES} pages`,
    })
  }
  return { resources, warnings }
}
