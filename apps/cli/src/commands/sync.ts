import { defineCommand } from 'citty'
import { runWithExit } from '../format/exit'
import { handleSyncCommand } from '../sync/runner'

export const syncCommand = defineCommand({
  meta: { name: 'sync', description: 'Run a sync for one or all sources.' },
  args: {
    source: { type: 'string', description: 'Source label or ID' },
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
