import {
  CtxindexSyncError,
  CtxindexValidationError,
} from '@ctxindex/core/errors'
import type { SearchContext, SearchRemoteResult } from '@ctxindex/extension-sdk'
import { z } from 'zod'
import { parseGraphMessage, searchResource } from './message'
import {
  graphHeaders,
  graphJson,
  graphUrl,
  IMMUTABLE_ID_PREFERENCE,
  validateGraphNextLink,
} from './transport'

const MAX_PAGES = 3
const MAX_ITEMS = 50
const MAX_CONTINUATION_IDS = 1_000
const pageSchema = z
  .object({
    value: z.array(z.unknown()),
    '@odata.nextLink': z.string().min(1).optional(),
  })
  .passthrough()
const continuationSchema = z.object({
  version: z.literal(1),
  sourceId: z.string().min(1),
  nextLink: z.string().min(1),
  query: z.string().min(1),
  limit: z.number().int().min(1),
  seenIds: z.array(z.string().min(1)).max(MAX_CONTINUATION_IDS),
})

type MicrosoftMailboxContinuation = z.infer<typeof continuationSchema>

function escaped(value: string): string {
  if (/\p{Cc}/u.test(value))
    throw new CtxindexValidationError(
      'invalid_filter',
      'Microsoft mailbox search values cannot contain control characters',
    )
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function kql(context: SearchContext): string | undefined {
  const parts: string[] = []
  if (context.query.text.trim()) parts.push(escaped(context.query.text.trim()))
  for (const field of context.query.fields ?? []) {
    if (
      field.name === 'sender' &&
      field.type === 'string[]' &&
      typeof field.value === 'string' &&
      field.value.trim()
    ) {
      parts.push(`from:${escaped(field.value.trim())}`)
    } else if (
      field.name !== 'unread' ||
      field.type !== 'boolean' ||
      typeof field.value !== 'boolean'
    ) {
      throw new CtxindexValidationError(
        'invalid_filter',
        `Microsoft mailbox remote search does not support field "${field.name}" with type "${field.type}"`,
      )
    }
  }
  if (context.query.since !== undefined)
    parts.push(`received>=${graphDate(context.query.since)}`)
  if (context.query.until !== undefined)
    parts.push(`received<${graphDate(context.query.until, true)}`)
  return parts.length > 0 ? `"${parts.join(' AND ')}"` : undefined
}

function unreadValue(context: SearchContext): boolean | undefined {
  const value = context.query.fields?.find(
    (field) => field.name === 'unread',
  )?.value
  return typeof value === 'boolean' ? value : undefined
}

function graphFilter(
  context: SearchContext,
  search: string | undefined,
): string | undefined {
  const unread = unreadValue(context)
  return search === undefined && unread !== undefined
    ? `isRead eq ${unread ? 'false' : 'true'}`
    : undefined
}

function continuationQueryIdentity(
  context: SearchContext,
  search: string | undefined,
  filter: string | undefined,
): string {
  return JSON.stringify({
    search: search ?? null,
    filter: filter ?? null,
    text: context.query.text,
    fields: context.query.fields ?? [],
    since: context.query.since ?? null,
    until: context.query.until ?? null,
  })
}

function invalidContinuation(reason = 'is malformed'): never {
  throw new CtxindexValidationError(
    'invalid_filter',
    `Microsoft mailbox continuation ${reason}`,
  )
}

function decodeContinuation(
  value: string,
  sourceId: string,
  query: string,
  limit: number,
): MicrosoftMailboxContinuation {
  try {
    const bytes = Buffer.from(value, 'base64url')
    if (bytes.toString('base64url') !== value) invalidContinuation()
    const parsed = continuationSchema.safeParse(
      JSON.parse(bytes.toString('utf8')),
    )
    if (!parsed.success) invalidContinuation()
    if (
      parsed.data.sourceId !== sourceId ||
      parsed.data.query !== query ||
      parsed.data.limit !== limit ||
      new Set(parsed.data.seenIds).size !== parsed.data.seenIds.length
    ) {
      invalidContinuation('does not match this search')
    }
    let nextLink: string
    try {
      nextLink = validateGraphNextLink(
        parsed.data.nextLink,
        '/v1.0/me/messages',
      )
    } catch {
      invalidContinuation('contains invalid provider progression')
    }
    return { ...parsed.data, nextLink }
  } catch (error) {
    if (error instanceof CtxindexValidationError) throw error
    invalidContinuation()
  }
}

function encodeContinuation(
  nextLink: string,
  sourceId: string,
  query: string,
  limit: number,
  seenIds: ReadonlySet<string>,
): string {
  if (seenIds.size > MAX_CONTINUATION_IDS) {
    throw new CtxindexSyncError(
      'Microsoft Graph search exceeded its resumable result bound',
      'provider_bad_response',
    )
  }
  return Buffer.from(
    JSON.stringify({
      version: 1,
      sourceId,
      nextLink,
      query,
      limit,
      seenIds: [...seenIds],
    } satisfies MicrosoftMailboxContinuation),
  ).toString('base64url')
}

function graphDate(timestamp: number, exclusiveUpper = false): string {
  const date = new Date(timestamp)
  if (
    exclusiveUpper &&
    (date.getUTCHours() !== 0 ||
      date.getUTCMinutes() !== 0 ||
      date.getUTCSeconds() !== 0 ||
      date.getUTCMilliseconds() !== 0)
  ) {
    date.setUTCDate(date.getUTCDate() + 1)
  }
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(
    date.getUTCDate(),
  ).padStart(2, '0')}/${date.getUTCFullYear()}`
}

function insideExactTimeBounds(
  message: ReturnType<typeof parseGraphMessage>,
  context: SearchContext,
): boolean {
  if (context.query.since === undefined && context.query.until === undefined)
    return true
  const occurredAt = Date.parse(
    message.receivedDateTime ?? message.sentDateTime ?? '',
  )
  if (Number.isNaN(occurredAt)) return false
  return (
    (context.query.since === undefined || occurredAt >= context.query.since) &&
    (context.query.until === undefined || occurredAt < context.query.until)
  )
}

function hasExactUnread(
  message: ReturnType<typeof parseGraphMessage>,
  context: SearchContext,
): boolean {
  const unread = unreadValue(context)
  return unread === undefined || !message.isRead === unread
}

export async function microsoftMailboxSearchRemote(
  context: SearchContext,
): Promise<SearchRemoteResult> {
  const limit = Math.min(Math.max(context.query.limit, 0), MAX_ITEMS)
  if (
    !Number.isInteger(context.query.limit) ||
    !Number.isFinite(context.query.since ?? 0) ||
    !Number.isFinite(context.query.until ?? 0) ||
    (context.query.since !== undefined &&
      context.query.until !== undefined &&
      context.query.since >= context.query.until)
  )
    throw new CtxindexValidationError(
      'invalid_filter',
      'Microsoft mailbox search bounds must be finite integers',
    )
  const search = kql(context)
  const filter = graphFilter(context, search)
  const queryIdentity = continuationQueryIdentity(context, search, filter)
  if (limit === 0) return { resources: [], warnings: [] }
  const continuation = context.query.continuation
    ? decodeContinuation(
        context.query.continuation,
        context.source.id,
        queryIdentity,
        context.query.limit,
      )
    : undefined
  let next: string | undefined
  if (continuation) {
    next = continuation.nextLink
  } else {
    const initial = new URL(graphUrl('/me/messages'))
    if (search !== undefined) initial.searchParams.set('$search', search)
    if (filter !== undefined) initial.searchParams.set('$filter', filter)
    initial.searchParams.set('$top', String(limit))
    initial.searchParams.set(
      '$select',
      'id,conversationId,internetMessageId,subject,bodyPreview,from,toRecipients,receivedDateTime,sentDateTime,lastModifiedDateTime,isRead,isDraft,categories',
    )
    next = initial.toString()
  }
  const resources: SearchRemoteResult['resources'][number][] = []
  const seen = new Set(continuation?.seenIds ?? [])
  let pages = 0
  while (next && pages < MAX_PAGES && resources.length < limit) {
    const pageUrl: string = next
    const response = pageSchema.safeParse(
      await graphJson(
        await context.fetch(pageUrl, {
          // Immutable-id opt-in must hold on every page fetch so emitted
          // Refs stay stable; keep it explicit rather than a default.
          headers: graphHeaders(IMMUTABLE_ID_PREFERENCE),
          signal: context.signal,
        }),
      ),
    )
    if (!response.success)
      throw new CtxindexSyncError(
        'Microsoft Graph returned an invalid message search page',
        'provider_bad_response',
        { cause: response.error },
      )
    if (response.data.value.length > limit)
      throw new CtxindexSyncError(
        'Microsoft Graph returned an oversized message search page',
        'provider_bad_response',
      )
    pages += 1
    let hasUnemittedEligibleMessage = false
    for (const candidate of response.data.value) {
      const message = parseGraphMessage(candidate)
      if (
        seen.has(message.id) ||
        message.isDraft ||
        !hasExactUnread(message, context) ||
        !insideExactTimeBounds(message, context)
      )
        continue
      if (resources.length === limit) {
        hasUnemittedEligibleMessage = true
        continue
      }
      seen.add(message.id)
      resources.push(searchResource(context.source.id, message))
    }
    const providerNext = response.data['@odata.nextLink']
      ? validateGraphNextLink(
          response.data['@odata.nextLink'],
          '/v1.0/me/messages',
        )
      : undefined
    next = hasUnemittedEligibleMessage ? pageUrl : providerNext
  }
  const nextContinuation = next
    ? encodeContinuation(
        next,
        context.source.id,
        queryIdentity,
        context.query.limit,
        seen,
      )
    : undefined
  const warnings = nextContinuation
    ? [
        {
          code: 'truncated',
          message: `Microsoft Graph remote search was truncated after ${resources.length} items and ${pages} ${pages === 1 ? 'page' : 'pages'}; resume with the returned continuation`,
        },
      ]
    : []
  return {
    resources,
    warnings,
    ...(nextContinuation === undefined
      ? {}
      : { continuation: nextContinuation }),
  }
}
