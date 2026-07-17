import { defineCommand } from 'citty'
import { parseStatusArgs, statusUsage } from '../args/status'
import { openDeps } from '../deps'
import { mapErrorToExit, runWithExit } from '../format/exit'
import { formatStatus } from '../format/status'

function printOutput(output: string): void {
  if (output.length > 0) console.log(output)
}

export async function handleStatusCommand(args: string[]): Promise<number> {
  const parsed = parseStatusArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${statusUsage}`)
    return 2
  }

  let deps: Awaited<ReturnType<typeof openDeps>> | undefined
  try {
    deps = await openDeps()
    const input = parsed.sourceId
      ? { sourceId: deps.sourceService.resolveSourceId(parsed.sourceId) }
      : {}
    printOutput(formatStatus(deps.sourceService.getStatus(input), parsed))
    return 0
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return mapErrorToExit(err)
  } finally {
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
