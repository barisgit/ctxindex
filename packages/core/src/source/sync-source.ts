import type { SyncMode } from '@ctxindex/extension-sdk'
import type { AuthService } from '../auth'
import { CtxindexError } from '../errors'
import type { ExtensionRegistry } from '../registry'
import type { CtxindexDatabase } from '../storage'
import {
  SyncCoordinator,
  type SyncRunProgress,
  type SyncRunResult,
} from '../sync/sync-coordinator'
import {
  createSourceProviderContext,
  type SourceProviderFetch,
} from './provider-context'

export interface SyncSourceInput {
  readonly db: CtxindexDatabase
  readonly registry: ExtensionRegistry
  readonly authService: Pick<AuthService, 'resolveLinkedGrantAccessToken'>
  readonly logger: Parameters<typeof createSourceProviderContext>[0]['logger']
  readonly sourceId: string
  readonly mode: SyncMode
  readonly signal: AbortSignal
  readonly onProgress?: (progress: SyncRunProgress) => void | Promise<void>
  readonly fetch?: SourceProviderFetch
}

export function syncSource(input: SyncSourceInput): Promise<SyncRunResult> {
  const coordinator = new SyncCoordinator(input.db, input.registry.profiles)
  return coordinator.run(
    {
      sourceId: input.sourceId,
      mode: input.mode,
      signal: input.signal,
      ...(input.onProgress ? { onProgress: input.onProgress } : {}),
    },
    async ({ cursor, mode, signal, emit }) => {
      const provider = await createSourceProviderContext({
        db: input.db,
        sourceId: input.sourceId,
        registry: input.registry,
        authService: input.authService,
        logger: input.logger,
        ...(input.fetch ? { fetch: input.fetch } : {}),
      })
      const sync = provider.adapter.operations.sync
      if (!provider.adapter.capabilities.includes('sync') || !sync) {
        throw new CtxindexError(
          `Adapter "${provider.adapter.id}" does not support sync`,
          'sync_unsupported',
        )
      }
      await sync({
        source: provider.source,
        fetch: provider.fetch,
        logger: provider.logger,
        cursor,
        mode,
        signal,
        emit,
      })
    },
  )
}
