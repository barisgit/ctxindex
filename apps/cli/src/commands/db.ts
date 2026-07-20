import { configPath } from '@ctxindex/core/config'
import { CtxindexError } from '@ctxindex/core/errors'
import { directDatabasePath } from '../direct-database'

export async function assertInitialized(): Promise<void> {
  const [hasConfig, hasDatabase] = await Promise.all([
    Bun.file(configPath()).exists(),
    Bun.file(directDatabasePath()).exists(),
  ])
  if (hasConfig && hasDatabase) return
  throw new CtxindexError(
    'ctxindex is not initialized; run ctxindex init',
    'invalid_args',
  )
}
