import { defineCommand } from 'citty'
import { parseSyncArgs, syncUsage } from '../args/sync'
import { runWithExit } from '../format/exit'
import { runSyncCommand } from '../sync/run-sync-command'

export async function handleSyncCommand(args: string[]): Promise<number> {
  const parsed = parseSyncArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${syncUsage}`)
    return 2
  }
  return runSyncCommand(parsed)
}

export const syncCommand = defineCommand({
  meta: { name: 'sync', description: 'Run a sync for one or all sources.' },
  args: {
    source: { type: 'string', description: 'Source ID' },
    mode: {
      type: 'enum',
      options: ['sync', 'resync', 'diff'],
      description: 'Sync mode',
    },
    json: { type: 'boolean', description: 'Print JSON' },
    format: { type: 'string', description: 'Output format' },
  },
  run: ({ rawArgs }) => runWithExit(() => handleSyncCommand(rawArgs)),
})
