import { defineCtxCommand } from '../command-model'
import { runWithExit } from '../format/exit'
import { handleSyncCommand } from '../sync/runner'

export const syncCommand = defineCtxCommand({
  meta: { name: 'sync', description: 'Run a sync for one or all sources.' },
  args: {
    source: { type: 'string', description: 'Source label or ID' },
    mode: {
      type: 'enum',
      options: ['sync', 'resync', 'diff'],
      default: 'sync',
      description: 'Sync mode (sync|resync|diff)',
    },
    json: { type: 'boolean', description: 'Print JSON' },
    format: {
      type: 'enum',
      options: ['summary', 'events', 'compact'],
      default: 'summary',
      description: 'Output format',
    },
  },
  run: ({ args }) =>
    runWithExit(() =>
      handleSyncCommand({
        ...(args.source !== undefined ? { sourceId: args.source } : {}),
        mode: args.mode,
        json: args.json ?? false,
        format: args.format,
      }),
    ),
})
