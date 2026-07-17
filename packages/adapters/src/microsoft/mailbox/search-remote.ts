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
const pageSchema = z
  .object({
    value: z.array(z.unknown()),
    '@odata.nextLink': z.string().min(1).optional(),
  })
  .passthrough()

function escaped(value: string): string {
  if (/\p{Cc}/u.test(value))
    throw new CtxindexValidationError(
      'invalid_filter',
      'Microsoft mailbox search values cannot contain control characters',
    )
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function kql(context: SearchContext): string {
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
    } else {
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
  return `"${parts.length > 0 ? parts.join(' AND ') : '*'}"`
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
  const query = kql(context)
  if (limit === 0) return { resources: [], warnings: [] }
  const initial = new URL(graphUrl('/me/messages'))
  initial.searchParams.set('$search', query)
  initial.searchParams.set('$top', String(limit))
  initial.searchParams.set(
    '$select',
    'id,conversationId,internetMessageId,subject,bodyPreview,from,toRecipients,receivedDateTime,sentDateTime,lastModifiedDateTime,isRead,isDraft,categories',
  )
  let next: string | undefined = initial.toString()
  const resources: SearchRemoteResult['resources'][number][] = []
  const seen = new Set<string>()
  let pages = 0
  while (next && pages < MAX_PAGES && resources.length < limit) {
    const response = pageSchema.safeParse(
      await graphJson(
        await context.fetch(next, {
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
    pages += 1
    for (const candidate of response.data.value) {
      const message = parseGraphMessage(candidate)
      if (
        message.isDraft ||
        seen.has(message.id) ||
        !insideExactTimeBounds(message, context)
      )
        continue
      seen.add(message.id)
      resources.push(searchResource(context.source.id, message))
      if (resources.length === limit) break
    }
    next = response.data['@odata.nextLink']
      ? validateGraphNextLink(
          response.data['@odata.nextLink'],
          '/v1.0/me/messages',
        )
      : undefined
  }
  const warnings = next
    ? [
        {
          code: 'truncated',
          message: `Microsoft Graph remote search was truncated after ${resources.length} items and ${pages} pages`,
        },
      ]
    : []
  return { resources, warnings }
}
