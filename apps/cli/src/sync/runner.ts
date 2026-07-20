import { CtxindexValidationError } from '@ctxindex/core/errors'
import { syncSource } from '@ctxindex/core/source'
import {
  type FailedSourceSyncResult,
  mapSyncErrorCode,
  type RunSyncResult,
  SyncApplicationService,
  type SyncRunResult,
  type SyncWarning,
} from '@ctxindex/core/sync'
import { parseSyncArgs, syncUsage } from '../args/sync'
import { daemonSync, selectDaemon } from '../daemon/client'
import { type CliDeps, openDeps } from '../deps'
import { mapErrorToExit } from '../format/exit'

export type SyncDeps = Pick<
  CliDeps,
  'db' | 'registry' | 'authService' | 'logger' | 'sourceService' | 'close'
>
type OpenSyncDeps = () => Promise<SyncDeps>

export interface SyncServices {
  readonly syncSource: typeof syncSource
}

export interface SyncRouteServices {
  readonly selectDaemon: typeof selectDaemon
  readonly daemonSync: typeof daemonSync
}

interface SyncWarningOutput {
  readonly sourceId: string
  readonly code: string
  readonly message: string
  readonly ref?: string
}

function rpcWarning(value: {
  readonly code: string
  readonly message: string
  readonly ref?: string | undefined
}): SyncWarning {
  return {
    code: value.code,
    message: value.message,
    ...(value.ref !== undefined ? { ref: value.ref } : {}),
  }
}

interface CompletedSourceSync {
  readonly sourceId: string
  readonly status: 'completed'
  readonly run: SyncRunResult
}

interface FailedSourceSync {
  readonly sourceId: string
  readonly status: 'failed'
  readonly warningsCount: number
  readonly lastWarning: SyncWarning | null
  readonly errorsCount: number
  readonly lastError: string
  readonly error: { readonly code: string; readonly message: string }
  readonly exitCode: number
}

type SourceSyncOutput = CompletedSourceSync | FailedSourceSync

export interface SyncOutput {
  readonly mode: SyncRunResult['mode']
  readonly results: readonly SourceSyncOutput[]
  readonly warnings: readonly SyncWarningOutput[]
}

const defaultServices: SyncServices = { syncSource }
const defaultRouteServices: SyncRouteServices = { selectDaemon, daemonSync }

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : 'unknown'
}

function failedSource(result: FailedSourceSyncResult): FailedSourceSync {
  const { sourceId, error, diagnostics } = result
  const code = errorCode(error)
  const publicMessage = `Sync failed for Source "${sourceId}" (${code})`
  return {
    sourceId,
    status: 'failed',
    warningsCount: diagnostics.warningsCount,
    lastWarning: diagnostics.lastWarning,
    errorsCount: diagnostics.errorsCount,
    lastError: publicMessage,
    error: {
      code,
      message: publicMessage,
    },
    exitCode: mapErrorToExit(error),
  }
}

export function mapRpcSyncFailureToExit(code: string): number {
  return mapSyncErrorCode(code as Parameters<typeof mapSyncErrorCode>[0])
    .exitCode
}

export function formatSyncOutput(
  output: SyncOutput,
  format: 'summary' | 'events' | 'compact',
  json: boolean,
): string {
  if (json) return JSON.stringify(output)
  if (format === 'events') {
    return output.results
      .map((result) =>
        JSON.stringify(
          result.status === 'completed'
            ? {
                type: 'source.completed',
                sourceId: result.sourceId,
                run: result.run,
              }
            : {
                type: 'source.failed',
                sourceId: result.sourceId,
                warningsCount: result.warningsCount,
                lastWarning: result.lastWarning,
                errorsCount: result.errorsCount,
                lastError: result.lastError,
                error: result.error,
                exitCode: result.exitCode,
              },
        ),
      )
      .join('\n')
  }
  const lines = output.results.map((result) => {
    if (result.status === 'failed') {
      return format === 'compact'
        ? `${result.sourceId} failed warnings=${result.warningsCount} errors=${result.errorsCount} code=${result.error.code} exit=${result.exitCode} error=${result.lastError.replace(/\s+/g, '_')}`
        : `${result.sourceId}\tfailed\twarnings=${result.warningsCount}\terrors=${result.errorsCount}\tcode=${result.error.code}\texit=${result.exitCode}\t${result.lastError}`
    }
    const run = result.run
    return format === 'compact'
      ? `${result.sourceId} completed +${run.added} ~${run.updated} -${run.deleted} warnings=${run.warningsCount} errors=${run.errorsCount}`
      : `${result.sourceId}\tcompleted\tadded=${run.added}\tupdated=${run.updated}\tdeleted=${run.deleted}\twarnings=${run.warningsCount}\terrors=${run.errorsCount}`
  })
  for (const warning of output.warnings) {
    lines.push(
      format === 'compact'
        ? `${warning.sourceId} warning=${warning.code} ${warning.message}`
        : `${warning.sourceId}\twarning\t${warning.code}\t${warning.message}`,
    )
  }
  return lines.join('\n')
}

export async function handleSyncCommand(
  args: string[],
  open: OpenSyncDeps = openDeps,
  services: SyncServices = defaultServices,
  routes: SyncRouteServices = defaultRouteServices,
): Promise<number> {
  const parsed = parseSyncArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${syncUsage}`)
    return 2
  }

  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGINT', cancel)
  let deps: SyncDeps | undefined
  try {
    const daemon = routes.selectDaemon()
    if (daemon) {
      const result = await routes.daemonSync(
        daemon,
        {
          ...(parsed.sourceId ? { source: parsed.sourceId } : {}),
          mode: parsed.mode,
        },
        controller.signal,
      )
      const results: SourceSyncOutput[] = result.results.map((sourceResult) =>
        sourceResult.status === 'completed'
          ? {
              sourceId: sourceResult.sourceId,
              status: 'completed',
              run: {
                ...sourceResult.run,
                lastWarning: sourceResult.run.lastWarning
                  ? rpcWarning(sourceResult.run.lastWarning)
                  : null,
                warnings: sourceResult.run.warnings.map(rpcWarning),
              },
            }
          : {
              sourceId: sourceResult.sourceId,
              status: 'failed',
              warningsCount: sourceResult.diagnostics.warningsCount,
              lastWarning: sourceResult.diagnostics.lastWarning
                ? rpcWarning(sourceResult.diagnostics.lastWarning)
                : null,
              errorsCount: sourceResult.diagnostics.errorsCount,
              lastError: sourceResult.diagnostics.lastError,
              error: sourceResult.failure,
              exitCode: mapRpcSyncFailureToExit(sourceResult.failure.code),
            },
      )
      const output: SyncOutput = {
        mode: result.mode,
        results,
        warnings: result.warnings.map((warning) => ({
          sourceId: warning.sourceId,
          ...rpcWarning(warning),
        })),
      }
      const rendered = formatSyncOutput(output, parsed.format, parsed.json)
      if (rendered) console.log(rendered)
      return results.reduce(
        (exitCode, item) =>
          item.status === 'failed'
            ? Math.max(exitCode, item.exitCode)
            : exitCode,
        0,
      )
    }

    deps = await open()
    const service = new SyncApplicationService({
      db: deps.db,
      registry: deps.registry,
      authService: deps.authService,
      logger: deps.logger,
      sourceService: deps.sourceService,
      syncSource: services.syncSource,
    })
    let result: RunSyncResult
    try {
      result = await service.run({
        ...(parsed.sourceId ? { source: parsed.sourceId } : {}),
        mode: parsed.mode,
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof CtxindexValidationError) {
        console.error(error.message)
        return mapErrorToExit(error)
      }
      throw error
    }
    const results: SourceSyncOutput[] = result.results.map((sourceResult) =>
      sourceResult.status === 'completed'
        ? sourceResult
        : failedSource(sourceResult),
    )
    const output: SyncOutput = {
      mode: result.mode,
      results,
      warnings: result.warnings,
    }
    const rendered = formatSyncOutput(output, parsed.format, parsed.json)
    if (rendered) console.log(rendered)
    return results.reduce(
      (exitCode, result) =>
        result.status === 'failed'
          ? Math.max(exitCode, result.exitCode)
          : exitCode,
      0,
    )
  } finally {
    process.removeListener('SIGINT', cancel)
    await deps?.close()
  }
}
