import { defineCommand } from 'citty'
import { parseStatusArgs, statusUsage } from '../args/status'
import { daemonStatus, selectDaemon } from '../daemon/client'
import { openDeps } from '../deps'
import { mapErrorToExit, runWithExit } from '../format/exit'
import { formatStatus } from '../format/status'

function printOutput(output: string): void {
  if (output.length > 0) console.log(output)
}

export interface StatusCommandDeps {
  readonly selectDaemon: typeof selectDaemon
  readonly daemonStatus: typeof daemonStatus
  readonly open: typeof openDeps
}

const defaultDeps: StatusCommandDeps = {
  selectDaemon,
  daemonStatus,
  open: openDeps,
}

export async function handleStatusCommand(
  args: string[],
  services: StatusCommandDeps = defaultDeps,
): Promise<number> {
  const parsed = parseStatusArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${statusUsage}`)
    return 2
  }

  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGINT', cancel)
  let deps: Awaited<ReturnType<typeof openDeps>> | undefined
  try {
    const daemon = services.selectDaemon()
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
          parsed,
        ),
      )
      return 0
    }
    deps = await services.open()
    const input = parsed.sourceId
      ? { sourceId: deps.sourceService.resolveSourceId(parsed.sourceId) }
      : {}
    printOutput(formatStatus(deps.sourceService.getStatus(input), parsed))
    return 0
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return mapErrorToExit(err)
  } finally {
    process.removeListener('SIGINT', cancel)
    await deps?.close()
  }
}

export const statusCommand = defineCommand({
  meta: { name: 'status', description: 'Show last sync status.' },
  args: {
    source: { type: 'string', description: 'Source label or ID' },
    format: {
      type: 'string',
      description: 'Output format: summary or compact',
    },
    json: { type: 'boolean', description: 'Print JSON' },
  },
  run: ({ rawArgs }) => runWithExit(() => handleStatusCommand(rawArgs)),
})
