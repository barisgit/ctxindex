import { defineCtxCommand } from '../command-model'
import { runWithExit } from '../format/exit'
import { handleStatusCommand } from '../status/handle-status-command'

export {
  handleStatusCommand,
  type StatusCommandDeps,
  type StatusCommandInput,
} from '../status/handle-status-command'

export const statusCommand = defineCtxCommand({
  meta: { name: 'status', description: 'Show last sync status.' },
  args: {
    source: { type: 'string', description: 'Source label or ID' },
    format: {
      type: 'enum',
      options: ['summary', 'compact'],
      default: 'summary',
      description: 'Output format: summary or compact',
    },
    json: { type: 'boolean', description: 'Print JSON' },
  },
  run: ({ args }) =>
    runWithExit(() =>
      handleStatusCommand({
        ...(args.source !== undefined ? { sourceId: args.source } : {}),
        format: args.format,
        json: args.json ?? false,
      }),
    ),
})
