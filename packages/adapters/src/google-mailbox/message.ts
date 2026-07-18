export interface GmailPayload {
  readonly filename?: string
  readonly mimeType?: string
  readonly headers?: readonly {
    readonly name?: string
    readonly value?: string
  }[]
  readonly body?: {
    readonly data?: string
    readonly attachmentId?: string
    readonly size?: number
  }
  readonly parts?: readonly GmailPayload[]
}

export interface GmailMessage {
  readonly id?: string
  readonly threadId?: string
  readonly labelIds?: readonly string[]
  readonly snippet?: string
  readonly internalDate?: string
  readonly payload?: GmailPayload
}

export function gmailHeader(
  message: GmailMessage,
  name: string,
): string | undefined {
  return message.payload?.headers?.find(
    (candidate) => candidate.name?.toLowerCase() === name.toLowerCase(),
  )?.value
}

export function normalizeGmailMessageId(
  value: string | undefined,
): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  return trimmed.match(/<[^<>]+>/)?.[0] ?? trimmed
}

export function normalizeGmailReferences(
  value: string | undefined,
): string[] | undefined {
  if (!value?.trim()) return undefined
  const ids = value.match(/<[^<>]+>/g) ?? value.trim().split(/\s+/)
  return ids.length > 0 ? [...new Set(ids)] : undefined
}

export function gmailHeaderAddresses(
  value: string | undefined,
): string[] | undefined {
  if (!value?.trim()) return undefined
  const values: string[] = []
  let start = 0
  let quoted = false
  let angleDepth = 0
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character === '"') {
      let precedingBackslashes = 0
      while (value[index - precedingBackslashes - 1] === '\\') {
        precedingBackslashes += 1
      }
      if (precedingBackslashes % 2 === 0) quoted = !quoted
    }
    if (!quoted && character === '<') angleDepth += 1
    if (!quoted && character === '>') angleDepth = Math.max(0, angleDepth - 1)
    if (!quoted && angleDepth === 0 && character === ',') {
      const candidate = value.slice(start, index).trim()
      if (candidate) values.push(candidate)
      start = index + 1
    }
  }
  const candidate = value.slice(start).trim()
  if (candidate) values.push(candidate)
  return values.length > 0 ? values : undefined
}

export function gmailOccurredAt(message: GmailMessage): number | undefined {
  const internalDate = Number(message.internalDate)
  if (Number.isFinite(internalDate) && internalDate >= 0) return internalDate
  const date = gmailHeader(message, 'Date')
  if (!date) return undefined
  const parsed = Date.parse(date)
  return Number.isNaN(parsed) ? undefined : parsed
}

export function gmailHeaderDate(message: GmailMessage): string | undefined {
  const value = gmailHeader(message, 'Date')
  if (!value) return undefined
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString()
}
