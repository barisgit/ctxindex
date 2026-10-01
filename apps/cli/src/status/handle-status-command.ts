import { daemonStatus, selectDaemon } from '../daemon/client'
import {
  ensureDaemonSelection,
  selectEnsuredDaemonRoute,
} from '../daemon/ensure'
import { openDeps } from '../deps'
import { mapErrorToExit } from '../format/exit'
import type { OutputFormat } from '../format/output'
import { formatStatus } from '../format/status'

function printOutput(output: string): void {
  if (output.length > 0) console.log(output)
}

export interface StatusCommandDeps {
  readonly selectDaemon: typeof selectDaemon
  readonly ensureDaemonSelection?: typeof ensureDaemonSelection
  readonly daemonStatus: typeof daemonStatus
  readonly open: typeof openDeps
}

export interface StatusCommandInput {
  readonly sourceId?: string
  readonly format: OutputFormat
}

const defaultDeps: StatusCommandDeps = {
  selectDaemon,
  ensureDaemonSelection,
  daemonStatus,
  open: openDeps,
}

export async function handleStatusCommand(
  parsed: StatusCommandInput,
  services: StatusCommandDeps = defaultDeps,
): Promise<number> {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGINT', cancel)
  let deps: Awaited<ReturnType<typeof openDeps>> | undefined
  try {
    const daemon = await selectEnsuredDaemonRoute(services, controller.signal)
    if (daemon) {
      const result = await services.daemonStatus(
        daemon,
        parsed.sourceId ? { source: parsed.sourceId } : {},
        controller.signal,
      )
      printOutput(
        formatStatus(
          result.rows.map((row) => ({
            ...row,
            lastWarning: row.lastWarning
              ? {
                  code: row.lastWarning.code,
                  message: row.lastWarning.message,
                  ...(row.lastWarning.ref !== undefined
                    ? { ref: row.lastWarning.ref }
                    : {}),
                }
              : null,
          })),
          parsed.format,
        ),
      )
      return 0
    }
    deps = await services.open()
    const input = parsed.sourceId
      ? { sourceId: deps.sourceService.resolveSourceId(parsed.sourceId) }
      : {}
    printOutput(
      formatStatus(deps.sourceService.getStatus(input), parsed.format),
    )
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  } finally {
    process.removeListener('SIGINT', cancel)
    await deps?.close()
  }
}
