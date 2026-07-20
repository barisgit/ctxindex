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

export type MockGraphCalendarEvent = Readonly<Record<string, unknown>> & {
  readonly id: string
}

export interface MockGraphAttachment {
  readonly id: string
  readonly name: string
  readonly contentType: string
  readonly bytes: Uint8Array
  readonly reportedSize?: number
  readonly kind?: 'file' | 'item' | 'reference'
  readonly isInline?: boolean
}

export interface MockGraphMessage {
  readonly id: string
  readonly conversationId: string
  readonly internetMessageId: string
  readonly inReplyTo?: string
  readonly references?: readonly string[]
  readonly replyTo?: readonly {
    readonly name?: string
    readonly address: string
  }[]
  readonly subject: string
  readonly bodyPreview: string
  readonly body: string
  readonly from: { readonly name?: string; readonly address: string }
  readonly to: readonly { readonly name?: string; readonly address: string }[]
  readonly cc?: readonly { readonly name?: string; readonly address: string }[]
  readonly bcc?: readonly {
    readonly name?: string
    readonly address: string
  }[]
  readonly receivedDateTime: string
  readonly lastModifiedDateTime: string
  readonly isRead?: boolean
  readonly isDraft?: boolean
  readonly categories?: readonly string[]
  readonly attachments?: readonly MockGraphAttachment[]
}

export interface MockGraphOptions {
  readonly messages?: readonly MockGraphMessage[]
  readonly calendarEvents?: Readonly<
    Record<string, readonly MockGraphCalendarEvent[]>
  >
  readonly tokenScopes?: string
  readonly searchBarrierCount?: number
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
  setCalendarEvents(
    calendarId: string,
    events: readonly MockGraphCalendarEvent[],
  ): void
  expireDefaultCalendarDeltaOnce(): void
  invalidateNextDefaultCalendarDeltaPermanently(): void
  setGraphStatus(status: number | undefined): void
  waitForSearchBarrier(): Promise<void>
  releaseSearchBarrier(): void
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
    internetMessageHeaders: [
      ...(message.inReplyTo
        ? [{ name: 'In-Reply-To', value: message.inReplyTo }]
        : []),
      ...(message.references
        ? [{ name: 'References', value: message.references.join(' ') }]
        : []),
    ],
    subject: message.subject,
    bodyPreview: message.bodyPreview,
    body: { contentType: 'text', content: message.body },
    from: {
      emailAddress: {
        ...(message.from.name ? { name: message.from.name } : {}),
        address: message.from.address,
      },
    },
    replyTo: (message.replyTo ?? []).map((recipient) => ({
      emailAddress: {
        ...(recipient.name ? { name: recipient.name } : {}),
        address: recipient.address,
      },
    })),
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

function messageMatchesSearch(
  message: MockGraphMessage,
  rawSearch: string | null,
): boolean {
  if (!rawSearch) return true
  const expression =
    rawSearch.startsWith('"') && rawSearch.endsWith('"')
      ? rawSearch.slice(1, -1)
      : rawSearch
  const searchable = `${message.subject} ${message.bodyPreview}`.toLowerCase()
  return expression.split(' AND ').every((rawClause) => {
    const clause = rawClause.trim()
    if (!clause) return true
    const sender = /^from:(.+)$/i.exec(clause)
    if (sender?.[1]) {
      return message.from.address.toLowerCase() === sender[1].toLowerCase()
    }
    const received = /^received(>=|<)(\d{2}\/\d{2}\/\d{4})$/i.exec(clause)
    if (received?.[1] && received[2]) {
      const boundary = Date.parse(`${received[2]} UTC`)
      const occurredAt = Date.parse(message.receivedDateTime)
      return received[1] === '>='
        ? occurredAt >= boundary
        : occurredAt < boundary
    }
    return searchable.includes(clause.replace(/\\([\\"])/g, '$1').toLowerCase())
  })
}

function messageMatchesFilter(
  message: MockGraphMessage,
  rawFilter: string | null,
): boolean {
  if (!rawFilter) return true
  const isRead = /^isRead eq (true|false)$/.exec(rawFilter)
  if (!isRead?.[1]) return false
  return (message.isRead ?? false) === (isRead[1] === 'true')
}

function attachmentMetadata(attachment: MockGraphAttachment) {
  const kind = attachment.kind ?? 'file'
  return {
    '@odata.type': `#microsoft.graph.${kind}Attachment`,
    id: attachment.id,
    name: attachment.name,
    contentType: attachment.contentType,
    size: attachment.reportedSize ?? attachment.bytes.byteLength,
    isInline: attachment.isInline ?? false,
  }
}

function calendarEventOverlapsWindow(
  event: MockGraphCalendarEvent,
  startDateTime: string | null,
  endDateTime: string | null,
): boolean {
  if (!startDateTime || !endDateTime) return true
  const timing = event.start as
    | {
        readonly date?: unknown
        readonly dateTime?: unknown
        readonly timeZone?: unknown
      }
    | undefined
  const ending = event.end as
    | {
        readonly date?: unknown
        readonly dateTime?: unknown
        readonly timeZone?: unknown
      }
    | undefined
  const parseGraphTime = (
    value: unknown,
    timeZone: unknown,
  ): number | undefined => {
    if (typeof value !== 'string') return undefined
    const normalized =
      timeZone === 'UTC' && !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
        ? `${value}Z`
        : value
    const parsed = Date.parse(normalized)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  const eventStart =
    parseGraphTime(timing?.dateTime, timing?.timeZone) ??
    parseGraphTime(timing?.date, 'UTC')
  const eventEnd =
    parseGraphTime(ending?.dateTime, ending?.timeZone) ??
    parseGraphTime(ending?.date, 'UTC')
  const windowStart = Date.parse(startDateTime)
  const windowEnd = Date.parse(endDateTime)
  if (
    eventStart === undefined ||
    eventEnd === undefined ||
    !Number.isFinite(windowStart) ||
    !Number.isFinite(windowEnd)
  )
    return true
  return eventEnd > windowStart && eventStart < windowEnd
}

function compareCalendarEventIds(
  left: MockGraphCalendarEvent,
  right: MockGraphCalendarEvent,
): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

export function startMockGraph(
  options: MockGraphOptions = {},
): MockGraphServer {
  const requests: MockGraphRequest[] = []
  const validRefreshTokens = new Set(['microsoft-initial-refresh-token'])
  let identityKind: MockMicrosoftIdentityKind = 'work'
  let tokenMode: MockMicrosoftTokenMode = 'ok'
  const tokenScopes = options.tokenScopes ?? 'Mail.ReadWrite User.Read'
  let rotation = 0
  let messages = [...(options.messages ?? [])]
  const calendars = new Map<string, MockGraphCalendarEvent[]>(
    Object.entries(options.calendarEvents ?? {}).map(([id, events]) => [
      id,
      [...events],
    ]),
  )
  let defaultCalendarVersion = 1
  const defaultCalendarSnapshots = new Map<
    number,
    Map<string, MockGraphCalendarEvent>
  >([
    [
      defaultCalendarVersion,
      new Map(
        (calendars.get('default') ?? []).map((event) => [event.id, event]),
      ),
    ],
  ])
  let expireDefaultDelta = false
  let invalidateNextDefaultDeltaPermanently = false
  const invalidDefaultDeltaTokens = new Set<string>()
  let graphStatus: number | undefined
  let draftSequence = 0
  let searchArrivals = 0
  let markSearchBarrierReached: (() => void) | undefined
  const searchBarrierReached = options.searchBarrierCount
    ? new Promise<void>((resolve) => {
        markSearchBarrierReached = resolve
      })
    : Promise.resolve()
  let releaseSearchResponses: (() => void) | undefined
  const searchResponseBarrier = options.searchBarrierCount
    ? new Promise<void>((resolve) => {
        releaseSearchResponses = resolve
      })
    : Promise.resolve()

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
          scope: tokenMode === 'insufficient_scope' ? 'User.Read' : tokenScopes,
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

      const isCalendarRequest =
        url.pathname === '/v1.0/me/calendarView/delta' ||
        /^\/v1\.0\/me\/(?:calendar\/events|calendars\/[^/]+\/(?:calendarView|events))/.test(
          url.pathname,
        )
      if (
        isCalendarRequest &&
        !request.headers.get('prefer')?.includes('outlook.timezone="UTC"')
      ) {
        return Response.json(
          { error: 'utc_calendar_preference_required' },
          { status: 400 },
        )
      }
      if (isCalendarRequest && request.method !== 'GET') {
        return Response.json({ error: 'method_not_allowed' }, { status: 405 })
      }

      if (url.pathname === '/v1.0/me/calendarView/delta') {
        const deltaToken = url.searchParams.get('$deltatoken')
        const skipToken = url.searchParams.get('$skiptoken')
        if (deltaToken !== null && invalidateNextDefaultDeltaPermanently) {
          invalidateNextDefaultDeltaPermanently = false
          invalidDefaultDeltaTokens.add(deltaToken)
        }
        if (deltaToken !== null && invalidDefaultDeltaTokens.has(deltaToken)) {
          const restart = new URL('/v1.0/me/calendarView/delta', url.origin)
          return Response.json(
            { error: { code: 'syncStateNotFound', message: 'expired' } },
            { status: 410, headers: { location: restart.toString() } },
          )
        }
        if (deltaToken !== null && expireDefaultDelta) {
          expireDefaultDelta = false
          const restart = new URL('/v1.0/me/calendarView/delta', url.origin)
          return Response.json(
            { error: { code: 'syncStateNotFound', message: 'expired' } },
            { status: 410, headers: { location: restart.toString() } },
          )
        }

        let mode: 'delta' | 'initial' =
          deltaToken === null ? 'initial' : 'delta'
        let fromVersion = deltaToken === null ? 0 : Number(deltaToken)
        let targetVersion = defaultCalendarVersion
        let pageIndex = 0
        if (skipToken !== null) {
          const match = /^(initial|delta):(\d+):(\d+):(\d+)$/.exec(skipToken)
          if (!match)
            return Response.json(
              { error: 'invalid_skiptoken' },
              { status: 400 },
            )
          mode = match[1] as 'delta' | 'initial'
          fromVersion = Number(match[2])
          targetVersion = Number(match[3])
          pageIndex = Number(match[4])
        }

        const targetSnapshot = defaultCalendarSnapshots.get(targetVersion)
        const previousSnapshot =
          mode === 'delta'
            ? defaultCalendarSnapshots.get(fromVersion)
            : undefined
        if (!targetSnapshot || (mode === 'delta' && !previousSnapshot)) {
          return Response.json(
            { error: { code: 'syncStateNotFound', message: 'expired' } },
            { status: 410 },
          )
        }
        const windowStart = url.searchParams.get('startDateTime')
        const windowEnd = url.searchParams.get('endDateTime')
        const target = new Map(
          [...targetSnapshot].filter(([, event]) =>
            calendarEventOverlapsWindow(event, windowStart, windowEnd),
          ),
        )
        const previous = previousSnapshot
          ? new Map(
              [...previousSnapshot].filter(([, event]) =>
                calendarEventOverlapsWindow(event, windowStart, windowEnd),
              ),
            )
          : undefined
        const values: unknown[] = []
        if (mode === 'initial') {
          values.push(...target.values())
        } else {
          for (const [id, event] of target) {
            const prior = previous?.get(id)
            if (
              prior === undefined ||
              JSON.stringify(prior) !== JSON.stringify(event)
            )
              values.push(event)
          }
          for (const id of previous?.keys() ?? []) {
            if (!target.has(id))
              values.push({ id, '@removed': { reason: 'deleted' } })
          }
        }
        values.sort((left, right) =>
          String((left as { id?: unknown }).id ?? '').localeCompare(
            String((right as { id?: unknown }).id ?? ''),
          ),
        )
        const pageSize = 2
        const page = values.slice(
          pageIndex * pageSize,
          (pageIndex + 1) * pageSize,
        )
        const payload: Record<string, unknown> = { value: page }
        if ((pageIndex + 1) * pageSize < values.length) {
          const next = new URL(url.pathname, url.origin)
          if (windowStart) next.searchParams.set('startDateTime', windowStart)
          if (windowEnd) next.searchParams.set('endDateTime', windowEnd)
          next.searchParams.set(
            '$skiptoken',
            `${mode}:${fromVersion}:${targetVersion}:${pageIndex + 1}`,
          )
          payload['@odata.nextLink'] = next.toString()
        } else {
          const delta = new URL(url.pathname, url.origin)
          if (windowStart) delta.searchParams.set('startDateTime', windowStart)
          if (windowEnd) delta.searchParams.set('endDateTime', windowEnd)
          delta.searchParams.set('$deltatoken', String(targetVersion))
          payload['@odata.deltaLink'] = delta.toString()
        }
        return Response.json(payload)
      }

      const namedCalendarView = url.pathname.match(
        /^\/v1\.0\/me\/calendars\/([^/]+)\/calendarView$/,
      )
      if (namedCalendarView?.[1]) {
        const calendarId = decodeURIComponent(namedCalendarView[1])
        const events = [...(calendars.get(calendarId) ?? [])]
          .filter((event) =>
            calendarEventOverlapsWindow(
              event,
              url.searchParams.get('startDateTime'),
              url.searchParams.get('endDateTime'),
            ),
          )
          .sort(compareCalendarEventIds)
        const pageIndex = Number(url.searchParams.get('$skiptoken') ?? '0')
        if (!Number.isInteger(pageIndex) || pageIndex < 0)
          return Response.json({ error: 'invalid_skiptoken' }, { status: 400 })
        const pageSize = 2
        const payload: Record<string, unknown> = {
          value: events.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
        }
        if ((pageIndex + 1) * pageSize < events.length) {
          const next = new URL(url.toString())
          next.searchParams.set('$skiptoken', String(pageIndex + 1))
          payload['@odata.nextLink'] = next.toString()
        }
        return Response.json(payload)
      }

      const defaultCalendarEvent = url.pathname.match(
        /^\/v1\.0\/me\/calendar\/events\/([^/]+)$/,
      )
      const namedCalendarEvent = url.pathname.match(
        /^\/v1\.0\/me\/calendars\/([^/]+)\/events\/([^/]+)$/,
      )
      if (defaultCalendarEvent?.[1] || namedCalendarEvent?.[2]) {
        const calendarId = namedCalendarEvent?.[1]
          ? decodeURIComponent(namedCalendarEvent[1])
          : 'default'
        const eventId = decodeURIComponent(
          (namedCalendarEvent?.[2] ?? defaultCalendarEvent?.[1]) as string,
        )
        const event = calendars
          .get(calendarId)
          ?.find((candidate) => candidate.id === eventId)
        return event
          ? Response.json(event)
          : Response.json({ error: 'not_found' }, { status: 404 })
      }

      const createReply = url.pathname.match(
        /^\/v1\.0\/me\/messages\/([^/]+)\/createReply$/,
      )
      if (createReply?.[1] && request.method === 'POST') {
        const parent = messages.find(
          (candidate) =>
            candidate.id === decodeURIComponent(createReply[1] ?? ''),
        )
        if (!parent || request.headers.get('content-type') !== 'text/plain')
          return Response.json({ error: 'invalid_reply' }, { status: 400 })
        const mime = Buffer.from(body, 'base64').toString('utf8')
        const [headerText = '', ...bodyParts] = mime.split('\r\n\r\n')
        const headers = new Map(
          headerText.split('\r\n').map((line) => {
            const separator = line.indexOf(':')
            return [line.slice(0, separator), line.slice(separator + 1).trim()]
          }),
        )
        const to = headers.get('To')
        const subject = headers.get('Subject')
        if (!to || !subject)
          return Response.json({ error: 'invalid_reply' }, { status: 400 })
        const named = /^(.*?)\s*<([^<>]+)>$/.exec(to)
        draftSequence += 1
        const created: MockGraphMessage = {
          id: `outlook-draft-${draftSequence}`,
          conversationId: parent.conversationId,
          internetMessageId: `<outlook-draft-${draftSequence}@example.test>`,
          ...(headers.get('In-Reply-To')
            ? { inReplyTo: headers.get('In-Reply-To') as string }
            : {}),
          ...(headers.get('References')
            ? {
                references: (headers.get('References') as string).split(/\s+/),
              }
            : {}),
          subject,
          bodyPreview: bodyParts.join('\r\n\r\n'),
          body: bodyParts.join('\r\n\r\n'),
          from: { address: 'work@example.test' },
          to: [
            named?.[2]
              ? {
                  ...(named[1]?.trim() ? { name: named[1].trim() } : {}),
                  address: named[2],
                }
              : { address: to },
          ],
          receivedDateTime: '2026-07-18T12:00:00.000Z',
          lastModifiedDateTime: '2026-07-18T12:00:00.000Z',
          isRead: true,
          isDraft: true,
        }
        messages.push(created)
        return Response.json(graphMessage(created), { status: 201 })
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
        const rawSearch = url.searchParams.get('$search')
        const rawFilter = url.searchParams.get('$filter')
        if (
          (rawSearch !== null && rawFilter !== null) ||
          rawSearch === '"*"' ||
          /IsRead:/i.test(rawSearch ?? '') ||
          (rawFilter !== null && !/^isRead eq (?:true|false)$/.test(rawFilter))
        ) {
          return Response.json(
            { error: 'unsupported_message_query' },
            { status: 400 },
          )
        }
        if (
          options.searchBarrierCount &&
          searchArrivals < options.searchBarrierCount
        ) {
          searchArrivals += 1
          if (searchArrivals === options.searchBarrierCount) {
            markSearchBarrierReached?.()
          }
          await searchResponseBarrier
        }
        const rawTop = Number(url.searchParams.get('$top') ?? '10')
        if (!Number.isInteger(rawTop) || rawTop <= 0)
          return Response.json({ error: 'invalid_top' }, { status: 400 })
        const pageSize = Math.min(rawTop, 50)
        const rawOffset = Number(url.searchParams.get('$skiptoken') ?? '0')
        if (!Number.isInteger(rawOffset) || rawOffset < 0)
          return Response.json({ error: 'invalid_skiptoken' }, { status: 400 })
        const matching = messages.filter(
          (message) =>
            messageMatchesSearch(message, rawSearch) &&
            messageMatchesFilter(message, rawFilter),
        )
        const nextOffset = rawOffset + pageSize
        const nextLink = new URL(url)
        nextLink.searchParams.set('$skiptoken', String(nextOffset))
        return Response.json({
          value: matching.slice(rawOffset, nextOffset).map(graphMessage),
          ...(nextOffset < matching.length
            ? { '@odata.nextLink': nextLink.toString() }
            : {}),
        })
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
        if (
          url.searchParams
            .get('$select')
            ?.split(',')
            .some((field) => field.trim() === '@odata.type')
        )
          return Response.json(
            {
              error: {
                code: 'BadRequest',
                message:
                  "Parsing OData Select and Expand failed: Term '@odata.type' is not valid in a $select or $expand expression.",
                innerError: {
                  'request-id': 'synthetic-request-id',
                  'client-request-id': 'synthetic-client-request-id',
                },
              },
            },
            {
              status: 400,
              headers: {
                'request-id': 'synthetic-request-id',
                'client-request-id': 'synthetic-client-request-id',
              },
            },
          )
        const message = messages.find(
          (candidate) =>
            candidate.id === decodeURIComponent(attachmentList[1] ?? ''),
        )
        if (!message)
          return Response.json({ error: 'not_found' }, { status: 404 })
        const token = url.searchParams.get('$skiptoken')
        if (token !== null && !/^\d+$/.test(token))
          return Response.json({ error: 'invalid_skiptoken' }, { status: 400 })
        const offset = token === null ? 0 : Number(token)
        const attachments = message.attachments ?? []
        const nextOffset = offset + 1
        const nextLink = new URL(url)
        nextLink.searchParams.set('$skiptoken', String(nextOffset))
        return Response.json({
          value: attachments.slice(offset, nextOffset).map(attachmentMetadata),
          ...(nextOffset < attachments.length
            ? { '@odata.nextLink': nextLink.toString() }
            : {}),
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
    setCalendarEvents(calendarId, events) {
      calendars.set(calendarId, [...events])
      if (calendarId === 'default') {
        defaultCalendarVersion += 1
        defaultCalendarSnapshots.set(
          defaultCalendarVersion,
          new Map(events.map((event) => [event.id, event])),
        )
      }
    },
    expireDefaultCalendarDeltaOnce() {
      expireDefaultDelta = true
    },
    invalidateNextDefaultCalendarDeltaPermanently() {
      invalidateNextDefaultDeltaPermanently = true
    },
    setGraphStatus(status) {
      graphStatus = status
    },
    waitForSearchBarrier() {
      return searchBarrierReached
    },
    releaseSearchBarrier() {
      releaseSearchResponses?.()
    },
    stop() {
      server.stop(true)
    },
  }
}
