import { defineCommand } from 'citty'
import { parseSyncArgs, syncUsage } from '../args/sync'
import { runWithExit } from '../format/exit'

export async function handleSyncCommand(args: string[]): Promise<number> {
  const parsed = parseSyncArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${syncUsage}`)
    return 2
  }
  console.error(
    'Sync is temporarily unavailable: adapter-to-Resource orchestration is not implemented. Use `ctxindex source list` to inspect configured Sources.',
  )
  return 2
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
