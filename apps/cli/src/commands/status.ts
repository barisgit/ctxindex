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

  try {
    const deps = await openDeps()
    printOutput(formatStatus(deps.sourceService.getStatus(parsed), parsed))
    return 0
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return mapErrorToExit(err)
  }
}

export const statusCommand = defineCommand({
  meta: { name: 'status', description: 'Show last sync status.' },
  args: {
    source: { type: 'string', description: 'Source ID' },
    format: {
      type: 'string',
      description: 'Output format: summary or compact',
    },
    json: { type: 'boolean', description: 'Print JSON' },
  },
  run: ({ rawArgs }) => runWithExit(() => handleStatusCommand(rawArgs)),
})
