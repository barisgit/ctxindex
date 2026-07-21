import type { SyncMode } from '@ctxindex/extension-sdk'
import type { AuthService } from '../auth'
import { CtxindexError, CtxindexValidationError } from '../errors'
import { compareStrings, type ExtensionRegistry } from '../registry'
import {
  syncSource as defaultSyncSource,
  type SourceService,
  type SyncSourceInput,
} from '../source'
import type { CtxindexDatabase } from '../storage'
import {
  getSyncRunFailureDiagnostics,
  type SyncRunFailureDiagnostics,
  type SyncRunProgress,
  type SyncRunResult,
  type SyncWarning,
} from './sync-coordinator'

const DIAGNOSTIC_LIMIT = 2_048

export interface RunSyncInput {
  readonly source?: string
  readonly mode: SyncMode
  readonly signal: AbortSignal
  readonly onEvent?: (event: SyncApplicationEvent) => void | Promise<void>
}

export interface SourceSyncWarning extends SyncWarning {
  readonly sourceId: string
}

export interface CompletedSourceSyncResult {
  readonly sourceId: string
  readonly status: 'completed'
  readonly run: SyncRunResult
}

export interface FailedSourceSyncResult {
  readonly sourceId: string
  readonly status: 'failed'
  readonly error: CtxindexError
  readonly diagnostics: SyncRunFailureDiagnostics
}

export type SourceSyncResult =
  | CompletedSourceSyncResult
  | FailedSourceSyncResult

export type SyncApplicationEvent =
  | {
      readonly type: 'source.started'
      readonly sequence: number
      readonly sourceId: string
      readonly mode: SyncMode
    }
  | ({
      readonly type: 'source.progress'
      readonly sequence: number
      readonly sourceId: string
    } & SyncRunProgress)
  | {
      readonly type: 'source.completed'
      readonly sequence: number
      readonly sourceId: string
      readonly run: SyncRunResult
    }
  | {
      readonly type: 'source.failed'
      readonly sequence: number
      readonly sourceId: string
      readonly error: CtxindexError
      readonly diagnostics: SyncRunFailureDiagnostics
    }

export interface RunSyncResult {
  readonly mode: SyncMode
  readonly results: readonly SourceSyncResult[]
  readonly warnings: readonly SourceSyncWarning[]
}

export interface SyncApplicationServiceDeps {
  readonly db: CtxindexDatabase
  readonly registry: ExtensionRegistry
  readonly authService: Pick<AuthService, 'resolveLinkedGrantAccessToken'>
  readonly logger: SyncSourceInput['logger']
  readonly sourceService: Pick<
    SourceService,
    'resolveSourceId' | 'findSourceById' | 'listSources'
  >
  readonly syncSource?: typeof defaultSyncSource
}

function typedFailure(error: unknown): CtxindexError {
  if (error instanceof CtxindexError) return error
  const code = (error as { readonly code?: unknown })?.code
  const message = error instanceof Error ? error.message : 'Sync failed'
  return new CtxindexError(
    message,
    typeof code === 'string' ? code : 'unknown',
    { cause: error },
  )
}

function failureDiagnostics(
  original: unknown,
  error: CtxindexError,
): SyncRunFailureDiagnostics {
  return (
    getSyncRunFailureDiagnostics(original) ?? {
      warningsCount: 0,
      lastWarning: null,
      errorsCount: 1,
      lastError: error.message.slice(0, DIAGNOSTIC_LIMIT),
    }
  )
}

function warningsFor(result: SourceSyncResult): SourceSyncWarning[] {
  const warnings =
    result.status === 'completed'
      ? result.run.warnings
      : result.diagnostics.lastWarning
        ? [result.diagnostics.lastWarning]
        : []
  return warnings.map((warning) => ({
    sourceId: result.sourceId,
    code: warning.code,
    message: warning.message,
    ...(warning.ref ? { ref: warning.ref } : {}),
  }))
}

export class SyncApplicationService {
  readonly #syncSource: typeof defaultSyncSource

  constructor(private readonly deps: SyncApplicationServiceDeps) {
    this.#syncSource = deps.syncSource ?? defaultSyncSource
  }

  async run(input: RunSyncInput): Promise<RunSyncResult> {
    const sources = input.source
      ? [this.resolveTarget(input.source)]
      : this.deps.sourceService
          .listSources()
          .filter((source) => source.sync_enabled)
          .filter((source) => {
            const adapter = this.deps.registry.adapters.get({
              id: source.adapter_id,
            })
            return (
              !adapter ||
              (adapter.capabilities.includes('sync') &&
                adapter.operations.sync !== undefined)
            )
          })
          .sort((left, right) => compareStrings(left.id, right.id))

    const results: SourceSyncResult[] = []
    let sequence = 0
    for (const source of sources) {
      await input.onEvent?.({
        type: 'source.started',
        sequence: sequence++,
        sourceId: source.id,
        mode: input.mode,
      })
      let result: SourceSyncResult
      try {
        const run = await this.#syncSource({
          db: this.deps.db,
          registry: this.deps.registry,
          authService: this.deps.authService,
          logger: this.deps.logger,
          sourceId: source.id,
          mode: input.mode,
          signal: input.signal,
          ...(input.onEvent
            ? {
                onProgress: (progress) =>
                  input.onEvent?.({
                    type: 'source.progress',
                    sequence: sequence++,
                    sourceId: source.id,
                    ...progress,
                  }),
              }
            : {}),
        })
        result = {
          sourceId: source.id,
          status: 'completed' as const,
          run,
        }
      } catch (original) {
        const error = typedFailure(original)
        result = {
          sourceId: source.id,
          status: 'failed' as const,
          error,
          diagnostics: failureDiagnostics(original, error),
        }
      }
      results.push(result)
      if (result.status === 'completed') {
        await input.onEvent?.({
          type: 'source.completed',
          sequence: sequence++,
          sourceId: source.id,
          run: result.run,
        })
      } else {
        await input.onEvent?.({
          type: 'source.failed',
          sequence: sequence++,
          sourceId: source.id,
          error: result.error,
          diagnostics: result.diagnostics,
        })
      }
    }

    return {
      mode: input.mode,
      results,
      warnings: results.flatMap(warningsFor),
    }
  }

  private resolveTarget(reference: string) {
    let source = null
    try {
      const sourceId = this.deps.sourceService.resolveSourceId(reference)
      source = this.deps.sourceService.findSourceById(sourceId)
    } catch {}
    if (!source) {
      throw new CtxindexValidationError(
        'invalid_filter',
        `Source not found: "${reference}"`,
      )
    }
    if (!source.sync_enabled) {
      throw new CtxindexValidationError(
        'invalid_filter',
        `Source is not sync-enabled: "${reference}"`,
      )
    }
    return source
  }
}
