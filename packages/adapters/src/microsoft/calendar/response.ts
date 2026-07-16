import { CtxindexSyncError } from '@ctxindex/core/errors'
import { z } from 'zod'
import {
  graphJson,
  graphResponseError,
  validateGraphOpaqueLink,
} from '../transport'

export class MicrosoftCalendarDeltaExpiredError extends Error {
  constructor() {
    super('Microsoft Calendar delta link is expired')
    this.name = 'MicrosoftCalendarDeltaExpiredError'
  }
}
export type MicrosoftCalendarStrategy = 'delta' | 'scan'
export interface MicrosoftCalendarPage {
  readonly items: readonly unknown[]
  readonly nextLink?: string
  readonly deltaLink?: string
}

async function expired(response: Response): Promise<boolean> {
  if (response.status === 410) return true
  if (response.status < 400 || response.status >= 500) return false
  try {
    const body = (await response.clone().json()) as {
      error?: { code?: unknown }
    }
    const code = body.error?.code
    return (
      typeof code === 'string' &&
      ['syncstatenotfound', 'resyncrequired'].includes(code.toLowerCase())
    )
  } catch {
    return false
  }
}
export async function microsoftCalendarPage(
  response: Response,
  strategy: MicrosoftCalendarStrategy,
  routePath: string,
): Promise<MicrosoftCalendarPage> {
  if (!response.ok) {
    if (await expired(response)) throw new MicrosoftCalendarDeltaExpiredError()
    throw graphResponseError(response)
  }
  const body = await graphJson(response)
  const parsed = z
    .object({
      value: z.array(z.unknown()),
      '@odata.nextLink': z.string().min(1).optional(),
      '@odata.deltaLink': z.string().min(1).optional(),
    })
    .passthrough()
    .safeParse(body)
  if (!parsed.success)
    throw new CtxindexSyncError(
      'Microsoft Graph returned a malformed calendar page',
      'provider_bad_response',
      { cause: parsed.error },
    )
  const next = parsed.data['@odata.nextLink']
  const delta = parsed.data['@odata.deltaLink']
  const valid = next ? !delta : strategy === 'delta' ? Boolean(delta) : !delta
  if (!valid)
    throw new CtxindexSyncError(
      'Microsoft Graph returned an invalid calendar progression',
      'provider_bad_response',
    )
  return {
    items: parsed.data.value,
    ...(next ? { nextLink: validateGraphOpaqueLink(next, routePath) } : {}),
    ...(delta ? { deltaLink: validateGraphOpaqueLink(delta, routePath) } : {}),
  }
}
