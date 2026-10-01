import { defineCtxCommand } from '../command-model'
import { runWithExit } from '../format/exit'
import { handleSyncCommand } from '../sync/runner'

export const syncCommand = defineCtxCommand({
  meta: { name: 'sync', description: 'Run a sync for one or all sources.' },
  args: {
    source: { type: 'string', alias: 's', description: 'Source label or ID' },
    mode: {
      type: 'enum',
      options: ['sync', 'resync', 'diff'],
      default: 'sync',
      description: 'Sync mode (sync|resync|diff)',
    },
    format: {
      type: 'enum',
      options: ['summary', 'events', 'compact', 'json'],
      default: 'summary',
      alias: 'f',
      description: 'Output format',
    },
  },
  run: ({ args }) =>
    runWithExit(() =>
      handleSyncCommand({
        ...(args.source !== undefined ? { sourceId: args.source } : {}),
        mode: args.mode,
        json: args.format === 'json',
        format: args.format === 'json' ? 'summary' : args.format,
      }),
    ),
})
