import {
  CtxindexSyncError,
  CtxindexValidationError,
} from '@ctxindex/core/errors'
import type { RetrieveContext } from '@ctxindex/extension-sdk'
import { googleCalendarSourceConfigSchema } from './config'
import { normalizeGoogleCalendarEvent } from './event'
import { googleCalendarJson } from './response'
import { googleCalendarApiUrl } from './url'

const eventRefPattern = /^ctx:\/\/([0-9A-HJKMNP-TV-Z]{26})\/event\/([^/?#]+)$/

function providerEventId(context: RetrieveContext): string {
  const match = eventRefPattern.exec(context.ref)
  if (match?.[1] !== context.source.id) {
    throw new CtxindexValidationError(
      'invalid_ref',
      `Invalid Ref "${context.ref}"`,
    )
  }
  let id: string
  try {
    id = decodeURIComponent(match[2] as string)
  } catch (cause) {
    throw new CtxindexValidationError(
      'invalid_ref',
      `Invalid Ref "${context.ref}"`,
      { cause },
    )
  }
  if (id.length === 0 || encodeURIComponent(id) !== match[2]) {
    throw new CtxindexValidationError(
      'invalid_ref',
      `Invalid Ref "${context.ref}"`,
    )
  }
  return id
}

export async function googleCalendarRetrieve(
  context: RetrieveContext,
): Promise<void> {
  const eventId = providerEventId(context)
  const config = googleCalendarSourceConfigSchema.parse(context.source.config)
  const path =
    `/calendar/v3/calendars/${encodeURIComponent(config.calendar_id)}` +
    `/events/${encodeURIComponent(eventId)}`
  let response: Response
  try {
    response = await context.fetch(googleCalendarApiUrl(path), {
      signal: context.signal,
    })
  } catch (cause) {
    if (context.signal.aborted) throw cause
    throw new CtxindexSyncError('Google Calendar request failed', 'network', {
      cause,
    })
  }
  const body = await googleCalendarJson(response)
  const normalized = normalizeGoogleCalendarEvent(
    body,
    context.source.id,
    config.calendar_id,
  )
  if (
    normalized.providerEventId !== eventId ||
    normalized.resource === undefined
  ) {
    throw new CtxindexSyncError(
      'Google Calendar returned an invalid event response',
      'provider_bad_response',
    )
  }
  for (const warning of normalized.warnings) {
    context.logger.warn(
      { code: warning.code, ref: warning.ref },
      warning.message,
    )
  }
  const { completeness: _completeness, ...resource } = normalized.resource
  await context.emitResource(resource)
}
