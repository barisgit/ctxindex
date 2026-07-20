import { compareStrings } from '@ctxindex/core/registry'
import { syncSource } from '@ctxindex/core/source'
import {
  getSyncRunFailureDiagnostics,
  type SyncRunResult,
  type SyncWarning,
} from '@ctxindex/core/sync'
import { parseSyncArgs, syncUsage } from '../args/sync'
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

interface SyncWarningOutput {
  readonly sourceId: string
  readonly code: string
  readonly message: string
  readonly ref?: string
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

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : 'unknown'
}

function failedSource(sourceId: string, error: unknown): FailedSourceSync {
  const code = errorCode(error)
  const publicMessage = `Sync failed for Source "${sourceId}" (${code})`
  const diagnostics = getSyncRunFailureDiagnostics(error)
  return {
    sourceId,
    status: 'failed',
    warningsCount: diagnostics?.warningsCount ?? 0,
    lastWarning: diagnostics?.lastWarning ?? null,
    errorsCount: diagnostics?.errorsCount ?? 1,
    lastError: publicMessage,
    error: {
      code,
      message: publicMessage,
    },
    exitCode: mapErrorToExit(error),
  }
}

function warningsFor(result: SourceSyncOutput): SyncWarningOutput[] {
  const warnings =
    result.status === 'completed'
      ? result.run.warnings
      : result.lastWarning
        ? [result.lastWarning]
        : []
  return warnings.map((warning) => ({
    sourceId: result.sourceId,
    code: warning.code,
    message: warning.message,
    ...(warning.ref ? { ref: warning.ref } : {}),
  }))
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
): Promise<number> {
  const parsed = parseSyncArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${syncUsage}`)
    return 2
  }

  const deps = await open()
  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGINT', cancel)
  try {
    let sources: ReturnType<SyncDeps['sourceService']['listSources']>
    if (parsed.sourceId) {
      let source: ReturnType<SyncDeps['sourceService']['findSourceById']> = null
      try {
        const sourceId = deps.sourceService.resolveSourceId(parsed.sourceId)
        source = deps.sourceService.findSourceById(sourceId)
      } catch {}
      if (!source) {
        console.error(`Source not found: "${parsed.sourceId}"`)
        return 2
      }
      if (!source.sync_enabled) {
        console.error(`Source is not sync-enabled: "${parsed.sourceId}"`)
        return 2
      }
      sources = [source]
    } else {
      sources = deps.sourceService
        .listSources()
        .filter((source) => source.sync_enabled)
        .filter((source) => {
          const adapter = deps.registry.adapters.get({
            id: source.adapter_id,
          })
          return (
            !adapter ||
            (adapter.capabilities.includes('sync') &&
              adapter.operations.sync !== undefined)
          )
        })
        .sort((left, right) => compareStrings(left.id, right.id))
    }

    const results: SourceSyncOutput[] = []
    for (const source of sources) {
      try {
        const run = await services.syncSource({
          db: deps.db,
          registry: deps.registry,
          authService: deps.authService,
          logger: deps.logger,
          sourceId: source.id,
          mode: parsed.mode,
          signal: controller.signal,
        })
        results.push({ sourceId: source.id, status: 'completed', run })
      } catch (error) {
        results.push(failedSource(source.id, error))
      }
    }
    const output: SyncOutput = {
      mode: parsed.mode,
      results,
      warnings: results.flatMap(warningsFor),
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
    await deps.close()
  }
}
