import {
  CtxindexSyncError,
  CtxindexValidationError,
} from '@ctxindex/core/errors'
import type { RetrieveContext } from '@ctxindex/extension-sdk'
import { graphHeaders, graphJson, graphUrl } from '../transport'
import { microsoftCalendarSourceConfigSchema } from './config'
import { normalizeMicrosoftCalendarEvent } from './event'

const pattern = /^ctx:\/\/([0-9A-HJKMNP-TV-Z]{26})\/event\/([^/?#]+)$/
function eventId(context: RetrieveContext) {
  const match = pattern.exec(context.ref)
  if (match?.[1] !== context.source.id)
    throw new CtxindexValidationError(
      'invalid_ref',
      `Invalid Ref "${context.ref}"`,
    )
  const encoded = match[2]
  if (encoded === undefined)
    throw new CtxindexValidationError(
      'invalid_ref',
      `Invalid Ref "${context.ref}"`,
    )
  let id: string
  try {
    id = decodeURIComponent(encoded)
  } catch (cause) {
    throw new CtxindexValidationError(
      'invalid_ref',
      `Invalid Ref "${context.ref}"`,
      { cause },
    )
  }
  if (!id || encodeURIComponent(id) !== encoded)
    throw new CtxindexValidationError(
      'invalid_ref',
      `Invalid Ref "${context.ref}"`,
    )
  return id
}
export async function microsoftCalendarRetrieve(context: RetrieveContext) {
  const id = eventId(context)
  const config = microsoftCalendarSourceConfigSchema.parse(
    context.source.config,
  )
  const path =
    config.calendar_id === 'default'
      ? `/v1.0/me/calendar/events/${encodeURIComponent(id)}`
      : `/v1.0/me/calendars/${encodeURIComponent(config.calendar_id)}/events/${encodeURIComponent(id)}`
  let response: Response
  try {
    response = await context.fetch(graphUrl(path), {
      headers: graphHeaders('IdType="ImmutableId", outlook.timezone="UTC"'),
      signal: context.signal,
    })
  } catch (cause) {
    if (context.signal.aborted) throw cause
    throw new CtxindexSyncError(
      'Microsoft Calendar request failed',
      'network',
      { cause },
    )
  }
  const body = await graphJson(response)
  const normalized = normalizeMicrosoftCalendarEvent(
    body,
    context.source.id,
    config.calendar_id,
  )
  if (
    normalized.providerEventId !== id ||
    normalized.removed ||
    !normalized.resource
  )
    throw new CtxindexSyncError(
      'Microsoft Calendar returned an invalid event response',
      'provider_bad_response',
    )
  for (const warning of normalized.warnings)
    context.logger.warn(
      { code: warning.code, ref: warning.ref },
      warning.message,
    )
  const { completeness: _completeness, ...resource } = normalized.resource
  await context.emitResource(resource)
}
